"""Allur Digital Twin — сервер: сайт + API + симулятор + Telegram-бот + отчёты + ИИ.
Запуск:  python -m server.main   (или start.bat)"""
from __future__ import annotations
import asyncio
import io
import json
import time
import webbrowser
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from . import agent, ai, bot, case_data, db, importer, orders, reports, secure, shifts
from . import config as cfg
from .config import BOT_ENABLED, BOT_TOKEN, HOST, ORDER_TIME_SCALE, PORT, SEED_DEMO, SNAP_EVERY, WEB_DIR
from .seed import seed_history
from .sim import LAY, Sim, TICK

sim: Sim
clients: set[WebSocket] = set()
CHAT_SYSTEM = bot.SYSTEM


async def sim_loop():
    n = 0
    every = max(1, round(SNAP_EVERY / TICK))
    while True:
        payload = sim.tick()
        msg = json.dumps(payload, ensure_ascii=False)
        for ws in list(clients):
            try:
                await ws.send_text(msg)
            except Exception:
                clients.discard(ws)
        n += 1
        if n % every == 0:
            sim.snapshot()
        await asyncio.sleep(TICK)


async def orders_loop():
    while True:
        await asyncio.sleep(1)
        try:
            orders.tick(sim)
        except Exception as e:
            print(f"[orders] {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global sim
    db.conn()
    importer.ensure_loaded()          # данные завода из data/import/*.docx (один раз)
    if SEED_DEMO:
        seed_history()
    sim = Sim()
    def on_critical(did, msg):
        bot.notify_critical(did, msg)
        if did:
            orders.auto_for_incident(did, sim)         # авария -> автоматически создаётся наряд

    sim.on_critical = on_critical
    orders.sync_docx(sim)                              # задачи из документа с данными завода -> наряды
    if SEED_DEMO:
        orders.demo_activity(sim)                      # на доске сразу есть наряд «в работе» и выполненные
    orders.restore(sim)                                # наряды «в работе» снова держат свои станки остановленными
    tasks = [asyncio.create_task(sim_loop()), asyncio.create_task(orders_loop()), asyncio.create_task(bot.run(sim))]
    url = f"http://{'localhost' if HOST in ('0.0.0.0', '127.0.0.1') else HOST}:{PORT}"
    print(f"\n  Allur Digital Twin запущен: {url}\n  ИИ: {cfg.AI_PROVIDER if ai.configured() else 'демо-режим (ключ не подключён)'} · Telegram-бот: {('включён' if BOT_TOKEN else 'включён, но токен не задан') if BOT_ENABLED else 'выключен'}\n")
    if HOST == "127.0.0.1":
        import socket
        import threading

        def open_when_ready():
            for _ in range(120):
                try:
                    socket.create_connection(("127.0.0.1", PORT), timeout=0.5).close()
                    break
                except OSError:
                    time.sleep(0.25)
            webbrowser.open(url)

        threading.Thread(target=open_when_ready, daemon=True).start()
    yield
    for t in tasks:
        t.cancel()
    try:
        sim.snapshot()
    except Exception:
        pass


app = FastAPI(lifespan=lifespan, title="Allur Digital Twin")


@app.middleware("http")
async def no_cache(request: Request, call_next):
    resp = await call_next(request)
    if not request.url.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-cache, must-revalidate"      # сайт всегда свежий после обновлений
    return resp


def err(code, text):
    raise HTTPException(code, text)


async def jbody(req: Request) -> dict:
    """Тело запроса как JSON-объект; мусор -> понятная ошибка 422, а не 500."""
    try:
        b = await req.json()
    except Exception:
        err(422, "Некорректный запрос: ожидается JSON")
    if not isinstance(b, dict):
        err(422, "Некорректный запрос: ожидается JSON-объект")
    return b


def num(v, default, lo, hi):
    """Число из запроса в заданных границах; не число -> значение по умолчанию."""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return default if x != x else max(lo, min(hi, x))


# ------------------------------------------------------------ базовое
@app.get("/api/layout")
def layout():
    return LAY


@app.websocket("/ws/telemetry")
async def ws_tel(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    try:
        while True:
            await ws.receive_text()
    except (WebSocketDisconnect, Exception):
        clients.discard(ws)


@app.get("/api/status")
def status():
    return {"ai": ai.configured(), "provider": cfg.AI_PROVIDER, "model": cfg.AI_MODEL, "bot": bot.running,
            "bot_username": bot.username, "token_set": bool(BOT_TOKEN), "bot_enabled": BOT_ENABLED}


@app.post("/api/source")
async def source(req: Request):
    b = await jbody(req)
    if b.get("source") != "simulator":
        err(502, "OPC UA / MQTT будут подключены позже. Сейчас доступен только симулятор.")
    return {"ok": 1}


@app.post("/api/trigger-incident")
async def trigger(req: Request):
    try:
        sim.trigger((await jbody(req)).get("device_id"))
    except KeyError:
        err(404, "Нет такого оборудования")
    return {"ok": 1}


@app.post("/api/reset-incident")
def reset():
    sim.reset()
    return {"ok": 1}


# ------------------------------------------------------------ наряды
@app.get("/api/orders")
def orders_get():
    return orders.listing()


@app.get("/api/orders/live")
def orders_live():
    """Для «Панели мастера»: наряды + время сервера и масштаб времени (для таймеров)."""
    return {"now": time.time(), "scale": ORDER_TIME_SCALE, "orders": orders.listing()}


@app.get("/api/order-templates")
def order_templates():
    return {"templates": orders.templates(), "crews": orders.CREWS, "scale": ORDER_TIME_SCALE}


@app.post("/api/orders")
async def orders_new(req: Request):
    b = await jbody(req)
    if not str(b.get("title", "")).strip():
        err(422, "Укажите, что нужно сделать")
    if not isinstance(b.get("title"), str):
        err(422, "Название наряда должно быть текстом")
    dev = b.get("device_id") or None
    if dev and dev not in sim.S:
        err(404, "Нет такого станка")
    oid = orders.create(b["title"], dev, b.get("assignee"), b.get("priority", "med"), num(b.get("due_hours"), 8, 0.1, 720), int(num(b.get("est_min"), 30, 1, 10000)),
                        str(b.get("kind") or "other"), bool(b.get("stops")), bool(b.get("fixes")), "manual", None, bool(b.get("start")), sim)
    return orders.out(db.one("SELECT * FROM orders WHERE id=?", (oid,)))


@app.post("/api/orders/sync")
def orders_sync():
    """Вернуть на доску задачи из документа с данными завода (если их удалили или доска пуста)."""
    return {"created": orders.sync_docx(sim, force=True)}


@app.patch("/api/orders/{oid}")
async def orders_patch(oid: int, req: Request):
    st = (await jbody(req)).get("status")
    if st not in ("new", "work", "done"):
        err(422, "Неверный статус")
    if not db.one("SELECT 1 FROM orders WHERE id=?", (oid,)):
        err(404, "Наряд не найден")
    {"new": lambda: orders.reset_order(oid, sim), "work": lambda: orders.start_order(oid, sim), "done": lambda: orders.finish_order(oid, sim, "завершён вручную")}[st]()
    return orders.out(db.one("SELECT * FROM orders WHERE id=?", (oid,)))


@app.delete("/api/orders")
def orders_clear(status: str = "done"):
    if status != "done":
        err(422, "Можно очистить только выполненные наряды")
    return {"deleted": orders.clear_done()}


@app.delete("/api/orders/{oid}")
def orders_del(oid: int):
    orders.delete_order(oid, sim)
    return {"ok": 1}


# ------------------------------------------------------------ ИИ
def _local(req: Request) -> bool:
    return bool(req.client) and req.client.host in ("127.0.0.1", "::1", "localhost", "testclient")


@app.get("/api/ai/config")
def ai_config_get():
    """Состояние ИИ для окна «Настройки». Сам ключ не отдаётся — только последние 4 символа."""
    return {"provider": cfg.AI_PROVIDER, "model": cfg.AI_MODEL, "key_set": bool(cfg.AI_API_KEY), "key_mask": secure.mask(cfg.AI_API_KEY),
            "configured": ai.configured(), "defaults": cfg.DEFAULT_MODELS}


@app.post("/api/ai/config")
async def ai_config_set(req: Request):
    """Сохраняет провайдера/ключ/модель в .env и проверяет подключение. Только с самого компьютера, где запущена система."""
    if not _local(req):
        err(403, "Менять ключ ИИ можно только с компьютера, на котором запущена система")
    b = await jbody(req)
    key = b.get("api_key")
    cfg.set_ai(str(b.get("provider", "none")), "" if b.get("clear_key") else (key if key else None), str(b.get("model", "")))
    out = {"ok": True, **ai_config_get()}
    if not ai.configured():
        return {**out, "reply": "ИИ-ключ не подключён — работает демо-режим"}
    try:
        out["reply"] = (await ai.complete("Ответь одним словом.", [{"role": "user", "content": "ответь: ok"}], max_tokens=20, timeout=25))[:80]
    except ai.AIError as e:
        return {**out, "ok": False, "error": secure.redact(str(e))}
    return out


@app.post("/api/chat")
async def chat(req: Request):
    """ИИ-агент: отвечает по данным и сам выполняет команды (скорость, остановка, правила). actions — что он сделал."""
    raw = (await jbody(req)).get("messages", [])
    msgs = [{"role": m["role"], "content": str(m["content"])[:4000]} for m in (raw if isinstance(raw, list) else [])
            if isinstance(m, dict) and m.get("role") in ("user", "assistant") and m.get("content")][-12:]
    if not msgs or msgs[-1]["role"] != "user":
        err(422, "Напишите вопрос или команду")
    try:
        reply, actions = await agent.ask(sim, msgs, control=True)
        return {"reply": reply, "actions": actions}
    except ai.AIError as e:
        err(503, str(e))


# ------------------------------------------------------------ управление линией
def _ctl(fn, *a):
    try:
        fn(*a)
    except KeyError:
        err(404, "Нет такого станка или правила")
    except ValueError as e:
        err(422, str(e))
    return sim.control_state()


@app.get("/api/control")
def control_get():
    return sim.control_state()


@app.post("/api/control/speed")
async def control_speed(req: Request):
    b = await jbody(req)
    return _ctl(sim.set_speed, b.get("target", "line") if isinstance(b.get("target", "line"), str) else "line", int(num(b.get("percent"), 100, 10, 100)))


@app.post("/api/control/stop")
async def control_stop(req: Request):
    t = (await jbody(req)).get("target", "all")
    t = t if isinstance(t, str) else ""
    return _ctl(sim.stop_all if t == "all" else sim.stop, *([] if t == "all" else [t]))


@app.post("/api/control/start")
async def control_start(req: Request):
    t = (await jbody(req)).get("target", "all")
    t = t if isinstance(t, str) else ""
    return _ctl(sim.resume_all if t == "all" else sim.start, *([] if t == "all" else [t]))


@app.post("/api/control/repair")
async def control_repair(req: Request):
    did = (await jbody(req)).get("device_id")
    st = _ctl(sim.repair, did)
    orders.close_for_device(did, sim)
    return st


@app.post("/api/control/rules")
async def control_rule_add(req: Request):
    b = await jbody(req)
    return _ctl(sim.add_rule, num(b.get("above"), 70, 0, 200), int(num(b.get("slow_to"), 50, 10, 100)), num(b.get("below"), 60, 0, 200), "device" if b.get("scope") == "device" else "line", b.get("device_id") if isinstance(b.get("device_id"), str) else None)


@app.delete("/api/control/rules/{rid}")
def control_rule_del(rid: int):
    return _ctl(sim.remove_rule, rid)


# ------------------------------------------------------------ прогноз простоев, узкие места, ремонты
_FC = {"t": 0.0, "down": {}}


def _forecast():
    f = sim.forecast()
    now = time.time()
    if now - _FC["t"] > 10:
        _FC.update(t=now, down={x["id"]: x["down_min"] for x in reports.shift_metrics(now - 24 * 3600, now)})
    down = _FC["down"]
    for d in f["devices"]:
        d["down24_min"] = down.get(d["id"], 0)
        d["exp_shift_min"] = round(down.get(d["id"], 0) / 24 * shifts_hours(), 1)    # ожидаемый простой за смену по истории суток
    f["next_shift_downtime_min"] = round(sum(d["exp_shift_min"] for d in f["devices"]), 1)
    return f


def shifts_hours():
    from .config import SHIFT_HOURS
    return SHIFT_HOURS


@app.get("/api/forecast")
def forecast_get():
    return _forecast()


@app.post("/api/forecast/ai")
async def forecast_ai():
    f = await asyncio.to_thread(_forecast)
    lines = [f"Узкое место: {f['bottleneck']['name']} — {f['bottleneck']['reason']}. Пропускная способность линии {f['line_throughput']} из {f['nominal_throughput']} авто/ч (потеря {f['loss_pct']}%).",
             f"Ожидаемый простой за следующую смену по истории суток: {f['next_shift_downtime_min']} мин."]
    lines += [f"- {d['name']}: риск {d['risk']}, T={d['temp']}°C, {d['why']}, простой за 24 ч {d['down24_min']} мин" for d in f["devices"]]
    if not ai.configured():          # без ключа — краткий вывод по данным, без внешнего ИИ
        hi = [d for d in f["devices"] if d["risk"] != "low"]
        return {"text": "\n".join(lines[:2]) + "\n" + ("Риск простоя: " + "; ".join(f"{d['name']} — {d['why']}" for d in hi) if hi else "Высоких рисков простоя сейчас нет."), "offline": True}
    try:
        txt = await ai.complete("Ты аналитик автозавода. По прогнозу простоев напиши для руководителя 3–4 коротких предложения: где риск простоя, "
                                "где узкое место и что сделать. Только по данным, без выдумок и markdown, по-русски.",
                                [{"role": "user", "content": "\n".join(lines)}], max_tokens=400)
    except ai.AIError as e:
        err(503, str(e))
    return {"text": txt}


@app.get("/api/repairs")
def repairs_get():
    """Что сломано сейчас и что уже починено (по журналу событий)."""
    names = {d["id"]: d["name"] for d in sim.devs}
    done = db.rows("SELECT ts, device_id, message FROM incidents WHERE message LIKE '%устранена%' ORDER BY ts DESC LIMIT 15")
    last = {}
    for r in done:
        last.setdefault(r["device_id"], r["ts"])
    return {"repaired": [{"ts": r["ts"], "time": time.strftime("%d.%m %H:%M", time.localtime(r["ts"])), "device_id": r["device_id"],
                          "name": names.get(r["device_id"], "—"), "message": r["message"]} for r in done],
            "last_repair": last,
            "faults": [d["id"] for d in sim.devs if sim.S[d["id"]]["f"]]}


# ------------------------------------------------------------ данные завода из файла (docx)
@app.get("/api/import")
def import_status():
    return importer.status()


@app.post("/api/import")
async def import_upload(req: Request):
    """Загрузка файла с данными завода (docx такой же структуры). Тело запроса — сам файл, имя — в заголовке x-filename."""
    from urllib.parse import unquote
    raw = await req.body()
    name = unquote(req.headers.get("x-filename", "upload.docx"))[:120]
    if not raw or len(raw) > 20_000_000:
        err(422, "Файл пустой или слишком большой")
    try:
        data = await asyncio.to_thread(importer.parse_docx, io.BytesIO(raw))
    except Exception as e:
        err(422, f"Не удалось прочитать файл (нужен .docx): {e}")
    if not any(importer.counts(data).values()):
        err(422, "В файле не найдены таблицы: работа линий, простои, план по моделям, показатели качества")
    return importer.save(data, name)


# ------------------------------------------------------------ данные кейса (цели, качество, простои, план)
@app.get("/api/case")
def case():
    return case_data.summary(case_data.live_values(sim))


# ------------------------------------------------------------ отчёты и получатели
@app.get("/api/report/shifts")
def report_shifts():
    out = {}
    for w in ("cur", "prev"):
        x = shifts.window(w)
        out[w] = {"name": x["name"], "start": shifts.fmt(x["start"]), "end": shifts.fmt(x["until"])}
    return out


def _check(which, fmts):
    if which not in ("cur", "prev"):
        err(422, "shift: cur | prev")
    fmts = [f for f in fmts if f in reports.FORMATS]
    if not fmts:
        err(422, "Выберите формат")
    return fmts


@app.get("/api/report/download")
async def report_download(shift: str = "cur", fmt: str = "pdf", ai_summary: int = 1):
    _check(shift, [fmt])
    rep, files = await reports.make_files(shift, [fmt], bool(ai_summary))
    name, data = files[0]
    mt = {"pdf": "application/pdf", "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}[fmt]
    return Response(data, media_type=mt, headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.post("/api/report/send")
async def report_send(req: Request):
    b = await jbody(req)
    fmts = _check(b.get("shift", "cur"), b.get("formats", []))
    ids = [int(i) for i in b.get("chat_ids", [])]
    if not ids:
        err(422, "Выберите получателей")
    ok = {s["chat_id"] for s in db.list_subs() if s["status"] == "approved"}
    ids = [i for i in ids if i in ok]
    if not ids:
        err(422, "Среди выбранных нет подтверждённых получателей")
    try:
        sent, errors = await bot.send_reports(ids, b.get("shift", "cur"), fmts, bool(b.get("ai", True)))
    except RuntimeError as e:
        err(503, str(e))
    return {"sent": sent, "errors": errors}


@app.get("/api/subscribers")
def subs_get():
    return db.list_subs()


@app.patch("/api/subscribers/{cid}")
async def subs_patch(cid: int, req: Request):
    b = await jbody(req)
    if not db.get_sub(cid):
        err(404, "Не найден")
    db.set_sub(cid, **{k: v for k, v in b.items() if k in ("status", "alerts")})
    if b.get("status") == "approved" and bot.running:
        try:
            await bot.bot.send_message(cid, "Доступ подтверждён ✅", reply_markup=bot.MENU if db.get_sub(cid)["kind"] == "private" else None)
        except Exception:
            pass
    return db.get_sub(cid)


@app.delete("/api/subscribers/{cid}")
def subs_del(cid: int):
    db.del_sub(cid)
    return {"ok": 1}


# ------------------------------------------------------------ сайт (последним)
app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")


def main():
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
