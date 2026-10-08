"""Наряды: шаблоны работ, запуск с таймером и прогрессом, автоматическое завершение с РЕАЛЬНЫМ эффектом на станок
(остановка на время работ, устранение неисправности), автонаряды по авариям и наряды из документа с данными завода.
Время работ ускорено для демонстрации: 1 секунда = ORDER_TIME_SCALE минут работ (по умолчанию ×60, в .env ORDER_TIME_SCALE=1 — реальное время)."""
from __future__ import annotations
import re
import time
from datetime import datetime, timedelta
from . import db
from .config import ORDER_TIME_SCALE
from .sim import LAY

NAMES = {d["id"]: d["name"] for d in LAY["devices"]}
CREWS = ["Бригада А · Ахметов", "Бригада Б · Ким", "Бригада В · Серикова"]
CREW_OF = {"cnc_milling_05": 0, "stamp_press_04": 1, "laser_grind_07": 0, "weld_robot_01": 0, "paint_spray_02": 2, "assembly_line_03": 1, "quality_scan_06": 2}
EQUIP = {"abb-01": "weld_robot_01", "abb-04": "weld_robot_01", "камера-02": "paint_spray_02", "конвейер-03": "assembly_line_03"}
SECTION = {"сварка": "weld_robot_01", "окраска": "paint_spray_02", "сборка": "assembly_line_03", "контроль": "quality_scan_06"}
KINDS = {"repair", "maintenance", "quality", "plan", "other"}
DEMO_TITLES = {"Замена подшипника шпинделя", "Осмотр гидросистемы пресса", "Калибровка горелки робота", "Очистка форсунок камеры", "Смазка роликов конвейера"}

# что можно сделать по наряду: est — плановые минуты, stops — станок стоит на время работ, fixes — после работ неисправность снята
TEMPLATES = [
    {"id": "repair", "title": "Устранить неисправность / аварию", "kind": "repair", "est": 30, "stops": 1, "fixes": 1, "devices": "*"},
    {"id": "maint", "title": "Плановое техническое обслуживание", "kind": "maintenance", "est": 30, "stops": 1, "fixes": 0, "devices": "*"},
    {"id": "sensor", "title": "Проверка / замена датчика", "kind": "repair", "est": 25, "stops": 1, "fixes": 1, "devices": "*"},
    {"id": "lube", "title": "Смазка и осмотр", "kind": "maintenance", "est": 15, "stops": 0, "fixes": 0, "devices": "*"},
    {"id": "calib", "title": "Калибровка", "kind": "maintenance", "est": 20, "stops": 0, "fixes": 0, "devices": "*"},
    {"id": "spindle", "title": "Замена подшипника шпинделя", "kind": "repair", "est": 60, "stops": 1, "fixes": 1, "devices": ["cnc_milling_05"]},
    {"id": "hyd", "title": "Осмотр гидросистемы пресса", "kind": "maintenance", "est": 35, "stops": 1, "fixes": 0, "devices": ["stamp_press_04"]},
    {"id": "optic", "title": "Чистка оптики лазера", "kind": "maintenance", "est": 20, "stops": 1, "fixes": 0, "devices": ["laser_grind_07"]},
    {"id": "tips", "title": "Замена наконечников / проверка сварочных параметров", "kind": "maintenance", "est": 30, "stops": 1, "fixes": 0, "devices": ["weld_robot_01"]},
    {"id": "filter", "title": "Замена фильтра", "kind": "maintenance", "est": 40, "stops": 1, "fixes": 0, "devices": ["paint_spray_02"]},
    {"id": "nozzle", "title": "Очистка форсунок камеры", "kind": "maintenance", "est": 25, "stops": 1, "fixes": 0, "devices": ["paint_spray_02"]},
    {"id": "chain", "title": "Ремонт цепи конвейера", "kind": "repair", "est": 55, "stops": 1, "fixes": 1, "devices": ["assembly_line_03"]},
    {"id": "cams", "title": "Калибровка камер контроля", "kind": "maintenance", "est": 30, "stops": 1, "fixes": 0, "devices": ["quality_scan_06"]},
    {"id": "quality", "title": "Корректирующие действия по браку", "kind": "quality", "est": 45, "stops": 0, "fixes": 0, "devices": "*"},
]


def templates():
    return TEMPLATES


def _row(oid):
    return db.one("SELECT * FROM orders WHERE id=?", (oid,))


def out(o: dict, now: float | None = None) -> dict:
    now = now or time.time()
    est = o.get("est_min") or 30
    prog, el = 0.0, 0.0
    if o["status"] == "work" and o.get("started_ts"):
        el = (now - o["started_ts"]) / 60 * ORDER_TIME_SCALE
        prog = min(1.0, el / est)
    elif o["status"] == "done":
        prog, el = 1.0, float(est)
    return {"id": o["id"], "title": o["title"], "device_id": o["device_id"], "assignee": o["assignee"], "priority": o["priority"],
            "status": o["status"], "due": o["due"], "created_ts": o.get("created_ts"), "done_ts": o.get("done_ts"), "started_ts": o.get("started_ts"),
            "est_min": est, "note": o.get("note") or "", "source": o.get("source") or "manual", "kind": o.get("kind") or "other", "stops": bool(o.get("stops")), "fixes": bool(o.get("fixes")),
            "progress": round(prog, 3), "elapsed_min": round(min(el, est), 1), "remaining_min": round(max(0.0, est - el), 1)}


def listing():
    now = time.time()
    return [out(o, now) for o in db.rows("SELECT * FROM orders ORDER BY id")]


def create(title, device_id=None, assignee=None, priority="med", due_hours=8, est_min=30, kind="other", stops=0, fixes=0,
           source="manual", ref=None, start=False, sim=None, note=None) -> int:
    now = time.time()
    try:
        due_hours = max(0.1, min(720.0, float(due_hours or 8)))
        est_min = max(1, min(10000, int(float(est_min or 30))))
    except (TypeError, ValueError):
        due_hours, est_min = 8.0, 30
    due = (datetime.fromtimestamp(now) + timedelta(hours=due_hours)).strftime("%Y-%m-%dT%H:%M")
    if not assignee:
        assignee = CREWS[CREW_OF.get(device_id, 0)] if device_id else "Начальник производства"
    oid = db.run("INSERT INTO orders(title,device_id,assignee,priority,status,due,created_ts,est_min,kind,stops,fixes,source,ref,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 (str(title).strip()[:200], device_id, assignee, priority if priority in ("high", "med", "low") else "med", "new", due, int(now),
                  est_min, kind if kind in KINDS else "other", 1 if stops else 0, 1 if fixes else 0, source, ref, (note or "")[:300]))
    if sim:
        sim.log("INFO", f"Выдан наряд #{oid}: {str(title).strip()}", device_id)
        if start:
            start_order(oid, sim)
    return oid


def start_order(oid, sim, who=None):
    o = _row(oid)
    if not o or o["status"] == "work":
        return o
    db.run("UPDATE orders SET status='work', started_ts=?, done_ts=NULL WHERE id=?", (int(time.time()), oid))
    d = o["device_id"]
    if o.get("stops") and d in sim.S and not (sim.S[d]["stop"] or sim.e_stop):
        sim.stop(d, f"Наряд #{oid}")
        db.run("UPDATE orders SET stopped=1 WHERE id=?", (oid,))
    sim.log("INFO", f"Наряд #{oid} взят в работу: {o['title']}" + (f" (станок остановлен на время работ, ~{o.get('est_min') or 30} мин)" if o.get("stops") else ""), d)
    return _row(oid)


def finish_order(oid, sim, how="выполнен"):
    o = _row(oid)
    if not o or o["status"] == "done":
        return o
    db.run("UPDATE orders SET status='done', done_ts=? WHERE id=?", (int(time.time()), oid))
    d = o["device_id"]
    if d in sim.S:
        if o.get("fixes"):
            sim.repair(d, f"Наряд #{oid}")
        if o.get("stopped"):
            sim.start(d, f"Наряд #{oid}")
            db.run("UPDATE orders SET stopped=0 WHERE id=?", (oid,))
    sim.log("INFO", f"Наряд #{oid} {how}: {o['title']}" + (" — неисправность устранена, станок запущен" if d in sim.S and o.get("fixes") else ""), d)
    return _row(oid)


def reset_order(oid, sim):
    o = _row(oid)
    if not o:
        return None
    if o.get("stopped") and o["device_id"] in sim.S:
        sim.start(o["device_id"], f"Наряд #{oid}")
    db.run("UPDATE orders SET status='new', started_ts=NULL, done_ts=NULL, stopped=0 WHERE id=?", (oid,))
    return _row(oid)


def delete_order(oid, sim):
    reset_order(oid, sim)
    db.run("DELETE FROM orders WHERE id=?", (oid,))


def clear_done() -> int:
    """Убрать из доски все выполненные наряды (возвращает, сколько удалено)."""
    n = db.one("SELECT COUNT(*) c FROM orders WHERE status='done'")["c"]
    db.run("DELETE FROM orders WHERE status='done'")
    return n


def tick(sim):
    """Раз в секунду: наряды в работе доходят до 100 % и завершаются сами."""
    now = time.time()
    for o in db.rows("SELECT * FROM orders WHERE status='work' AND started_ts IS NOT NULL"):
        if (now - o["started_ts"]) / 60 * ORDER_TIME_SCALE >= (o.get("est_min") or 30):
            finish_order(o["id"], sim)


def close_for_device(did, sim):
    """Станок починили вручную («Починить») — закрываем открытые наряды на устранение неисправности."""
    for o in db.rows("SELECT * FROM orders WHERE device_id=? AND kind='repair' AND status!='done'", (did,)):
        finish_order(o["id"], sim, "закрыт (неисправность устранена вручную)")


def auto_for_incident(did, sim):
    """Авария на станке -> автоматически создаётся наряд (один на станок, пока не закрыт)."""
    if did not in NAMES or db.one("SELECT 1 FROM orders WHERE device_id=? AND source='auto' AND status!='done'", (did,)):
        return
    create(f"Устранить аварию: {NAMES[did]}", did, None, "high", 2, 30, "repair", 1, 1, "auto", None, False, sim)


SYNC_V = "3"


def demo_activity(sim=None):
    """Чтобы «Панель мастера» и «Исполнитель» были живыми с первой секунды: один наряд уже в работе (без остановки станка)
    и два недавно выполненных. Один раз на базу и только если на доске ещё нет ни работающих, ни выполненных нарядов."""
    if db.kv_get("demo_activity2"):
        return 0
    db.kv_set("demo_activity2", "1")
    now, n = int(time.time()), 0
    if not db.one("SELECT 1 FROM orders WHERE status='done'"):
        for title, dev, est, ago, kind in (("Смазка и осмотр роликов", "assembly_line_03", 15, 3 * 3600, "maintenance"),
                                           ("Калибровка камер контроля", "quality_scan_06", 30, 90 * 60, "maintenance")):
            oid = create(title, dev, None, "low", 8, est, kind, 0, 0, "manual", None, False, None, "Выполнено в предыдущую смену")
            db.run("UPDATE orders SET status='done', started_ts=?, done_ts=? WHERE id=?", (now - ago - est * 60, now - ago, oid))
            n += 1
    if not db.one("SELECT 1 FROM orders WHERE status='work'"):
        oid = create("Плановый осмотр: роботизированная окраска", "paint_spray_02", None, "med", 8, 600, "maintenance", 0, 0, "manual", None, False, None,
                     "Осмотр форсунок и фильтров без остановки линии")
        db.run("UPDATE orders SET status='work', started_ts=? WHERE id=?", (now - 120, oid))    # к моменту запуска уже ~20 % (время ускорено ×60)
        if sim:
            sim.log("INFO", f"Наряд #{oid} в работе: плановый осмотр окраски", "paint_spray_02")
        n += 1
    return n


def sync_docx(sim=None, force=False):
    """Задачи из файла с данными завода: каждая строка «простоев» -> наряд на работы (с датой, оборудованием, причиной и минутами
    из документа), отклонения качества и плана -> наряды руководству. Сроки считаются от момента создания, а не «в прошлом».
    force=True — вернуть на доску задачи из документа, которые были удалены (уже существующие не дублируются)."""
    from . import importer
    d = importer.load()
    if not d:
        return 0
    stamp = f"{d.get('ts')}|{SYNC_V}"
    prev = db.kv_get("orders_sync_ts")
    if prev == stamp and not force:                          # для этого файла наряды уже созданы (удалённые не возвращаем)
        return 0
    if prev and not prev.endswith("|" + SYNC_V):             # формат подписей изменился — пересоздаём ещё не начатые наряды из документа
        db.run("DELETE FROM orders WHERE source='docx' AND status='new'")
    if not db.kv_get("demo_orders_cleaned"):                 # убираем 5 учебных нарядов — теперь есть настоящие
        for t in DEMO_TITLES:
            db.run("DELETE FROM orders WHERE title=? AND source IS NULL AND status!='work'", (t,))
        db.kv_set("demo_orders_cleaned", "1")
    n = 0
    T = {"defect_max": 0.02, "month_plan_min": 5500, **(d.get("targets") or {})}
    for date, section, equip, reason, mins, planned in d.get("downtime") or []:
        ref = f"dt|{date}|{equip}|{reason}"
        if db.one("SELECT 1 FROM orders WHERE ref=?", (ref,)):
            continue
        dev = EQUIP.get(equip.lower()) or SECTION.get(section.lower())
        maint = planned or re.search(r"фильтр|то\b|обслуж|смазк", reason, re.I)
        create(f"{reason} — {equip}", dev, None, "low" if planned else "high" if mins >= 45 else "med", 48 if maint else 24, mins,
               "maintenance" if maint else "repair", 1, 0 if maint else 1, "docx", ref, False, None,
               f"Документ: {date} · участок «{section}» · {equip} · {reason} · простой {mins} мин" + (" (плановый)" if planned else ""))
        n += 1
    by, days = {}, set()
    for date, section, out_, bad in d.get("quality") or []:
        a = by.setdefault(section, [0, 0]); a[0] += out_; a[1] += bad; days.add(date)
    for section, (out_, bad) in by.items():
        pct = bad / out_ if out_ else 0
        ref = f"q|{section}"
        if pct > T["defect_max"] and not db.one("SELECT 1 FROM orders WHERE ref=?", (ref,)):
            create(f"Снизить брак: {section} — {pct*100:.1f}% при норме {T['defect_max']*100:.0f}%".replace(".", ","), SECTION.get(section.lower()), None,
                   "high" if pct > .03 else "med", 72, 45, "quality", 0, 0, "docx", ref, False, None,
                   f"Документ: показатели качества · выпущено {out_}, брак {bad} за {len(days)} дн. · норма не более {T['defect_max']*100:.0f}%")
            n += 1
    models = d.get("models") or []
    total = sum(p for _, p in models)
    if total and total < T["month_plan_min"] and not db.one("SELECT 1 FROM orders WHERE ref='plan'"):
        create(f"Согласовать план выпуска: по моделям {total}, цель {T['month_plan_min']} авто/мес", None, None, "med", 72, 20, "plan", 0, 0, "docx", "plan", False, None,
               "Документ: производственный план · " + " + ".join(f"{m} {p}" for m, p in models) + f" = {total}; цель не менее {T['month_plan_min']}")
        n += 1
    db.kv_set("orders_sync_ts", stamp)
    if n and sim:
        sim.log("INFO", f"Из документа с данными завода создано нарядов: {n}", None)
    return n


def restore(sim):
    """После перезапуска системы: наряды, которые были в работе, снова останавливают свои станки."""
    for o in db.rows("SELECT * FROM orders WHERE status='work' AND stops=1"):
        d = o["device_id"]
        if d in sim.S and not sim.S[d]["stop"]:
            sim.S[d]["stop"] = True
            db.run("UPDATE orders SET stopped=1 WHERE id=?", (o["id"],))
