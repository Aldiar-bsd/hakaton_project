"""ИИ-агент завода: модель сама вызывает инструменты (читает показатели, меняет скорость, останавливает станки,
ставит правила автоматики, выдаёт наряды). Все действия попадают в журнал событий с пометкой «ИИ-агент»."""
from __future__ import annotations
import re
import time
from pathlib import Path
from datetime import datetime, timedelta
from . import ai, case_data, db, reports
from .sim import LAY

WHO = "ИИ-агент"
DEV = {d["id"]: d for d in LAY["devices"]}
IDS = list(DEV)
TARGET = {"type": "string", "description": "id станка из списка или 'line' для всей линии"}

PROMPT_FILE = Path(__file__).with_name("prompt.txt")
ASK_DEADLINE_S = 10      # вопрос: дольше — отвечаем без ИИ
CMD_DEADLINE_S = 18      # команда с инструментами
# повелительные формы — просьба что-то СДЕЛАТЬ (нужны инструменты); остальное — вопрос по данным
COMMAND = re.compile(r"останови|остановить|выключи|запусти|включи|возобнов|поставь|установи|замедли|ускор|притормози|снизь скорост|сбав|почини|отремонтируй|устрани|"
                     r"выдай наряд|создай|сломай|симулируй|смоделируй|вызови аварию|убери|сними|сбрось|удали правил|правило|если .*(горяч|температур)|"
                     r"перегрев на|вибраци\w+ на|случайная авария|заклини")


def system_prompt() -> str:
    """Инструкция агенту: текст из server/prompt.txt (его можно править без перезапуска) + список станков."""
    try:
        base = PROMPT_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        base = "Ты — ИИ-агент цифрового двойника завода Allur. Управляй линией через инструменты, цифры не выдумывай."
    return (base + "\n\nЛиния по порядку: ЧПУ-центр → пресс → лазерная шлифовка → сварка → окраска → сборочный конвейер → контроль качества."
            "\nСтанки (id — название): " + "; ".join(f"{i} — {d['name']}" for i, d in DEV.items()) + ".")


SYSTEM = system_prompt()


def _tools(control: bool):
    ro = [
        {"name": "get_plant_status", "description": "Текущее состояние завода: температура, вибрация, загрузка, статус и скорость каждого станка, "
         "OEE, активные правила автоматики, последние события.", "schema": {"type": "object", "properties": {}}},
        {"name": "get_quality_targets", "description": "Показатели качества и цели кейса: брак по участкам, простои, план по моделям, "
         "прогноз месяца, сверка с OEE ≥ 85%, браком ≤ 2%, простоем ≤ 60 мин.", "schema": {"type": "object", "properties": {}}},
    ]
    if not control:
        return ro
    return ro + [
        {"name": "set_speed", "description": "Установить скорость станка или всей линии в процентах (10–100). Меньшая скорость = меньший нагрев.",
         "schema": {"type": "object", "properties": {"target": {**TARGET, "enum": ["line"] + IDS}, "percent": {"type": "integer", "minimum": 10, "maximum": 100}},
                    "required": ["target", "percent"]}},
        {"name": "stop_machine", "description": "Остановить станок (target=id) или всю линию (target='all'). Остановленный станок остывает.",
         "schema": {"type": "object", "properties": {"target": {"type": "string", "enum": ["all"] + IDS}}, "required": ["target"]}},
        {"name": "start_machine", "description": "Запустить станок (target=id) или всю линию (target='all') после остановки.",
         "schema": {"type": "object", "properties": {"target": {"type": "string", "enum": ["all"] + IDS}}, "required": ["target"]}},
        {"name": "add_temperature_rule", "description": "Правило автоматики: если температура станка выше above_c — замедлить до slow_to_percent %, "
         "держать пока температура не опустится ниже release_below_c. scope='line' замедляет всю линию, 'device' — только указанный станок.",
         "schema": {"type": "object", "properties": {"above_c": {"type": "number"}, "release_below_c": {"type": "number"},
                                                     "slow_to_percent": {"type": "integer", "minimum": 10, "maximum": 100},
                                                     "scope": {"type": "string", "enum": ["line", "device"]}, "device_id": {"type": "string", "enum": IDS}},
                    "required": ["above_c", "release_below_c", "slow_to_percent"]}},
        {"name": "remove_rule", "description": "Удалить правило автоматики по номеру.", "schema": {"type": "object", "properties": {"rule_id": {"type": "integer"}}, "required": ["rule_id"]}},
        {"name": "simulate_problem", "description": "ДЕМО (панель жюри): симулировать проблему на станке. kind: overheat — перегрев до аварии, vibration — растущая вибрация, "
         "breakdown — мгновенная авария. device_id='random' — случайный станок.",
         "schema": {"type": "object", "properties": {"device_id": {"type": "string", "enum": ["random"] + IDS}, "kind": {"type": "string", "enum": ["overheat", "vibration", "breakdown", "random"]}}, "required": ["device_id"]}},
        {"name": "clear_problems", "description": "ДЕМО: снять все симулированные проблемы и аварии на всех станках.", "schema": {"type": "object", "properties": {}}},
        {"name": "repair_machine", "description": "Устранить неисправность станка (станок остывает и возвращается в норму).",
         "schema": {"type": "object", "properties": {"device_id": {"type": "string", "enum": IDS}}, "required": ["device_id"]}},
        {"name": "create_work_order", "description": "Выдать наряд бригаде на станок (ремонт, осмотр).",
         "schema": {"type": "object", "properties": {"title": {"type": "string"}, "device_id": {"type": "string", "enum": IDS},
                                                     "priority": {"type": "string", "enum": ["high", "med", "low"]}, "due_hours": {"type": "number"}},
                    "required": ["title", "device_id"]}},
    ]


def _status(sim) -> str:
    m, c = sim.last, sim.control_state()
    if not m:
        return "Данные ещё не поступили."
    s = m["stats"]
    L = [f"OEE {s['oee']*100:.0f}% (цель ≥ 85%), доступность {s['availability']*100:.0f}%, производительность {s['performance']*100:.0f}%, "
         f"качество {s['quality']*100:.0f}%. Выпуск {s['units']} из {s['plan']}. " + ("АВАРИЙНАЯ ОСТАНОВКА ЛИНИИ." if c["e_stop"] else "")]
    for d in m["devices"]:
        x, k = DEV[d["device_id"]], c["devices"][d["device_id"]]
        flag = "ОСТАНОВЛЕН" if k["stopped"] else f"скорость {k['eff']}%" + (" (ограничена автоматикой)" if k["limited"] else "")
        L.append(f"- {d['device_id']} ({x['name']}): {d['status']}, T={d['temperature']}°C, вибр. {d['vibration']}g, загрузка {d['load_percentage']}%, {flag}"
                 + (f", ПРОГНОЗ: {d['ai']['message']}" if d.get("ai") else ""))
    L += [f"Правило #{r['id']}: {r['text']} ({'СЕЙЧАС ДЕЙСТВУЕТ' if r['active'] else 'ждёт'})" for r in c["rules"]] or ["Правил автоматики нет."]
    L.append("События: " + "; ".join(f"{i['time']} {i['type']} {i['message']}" for i in m["incidents"][:5]))
    return "\n".join(L)


def make_executor(sim, control: bool = True):
    async def call(name: str, a: dict) -> str:
        if name == "get_plant_status":
            return _status(sim)
        if name == "get_quality_targets":
            return case_data.text(sim)
        if not control:
            return "Нет прав на управление линией."
        try:
            if name == "set_speed":
                ids = sim.set_speed(a["target"], a["percent"], WHO)
                return f"Скорость {'всей линии' if len(ids) > 1 else sim.name(ids[0])} = {max(10, min(100, int(a['percent'])))}%."
            if name == "stop_machine":
                if a["target"] == "all":
                    sim.stop_all(WHO)
                    return "Вся линия остановлена."
                sim.stop(a["target"], WHO)
                return f"Станок «{sim.name(a['target'])}» остановлен."
            if name == "start_machine":
                if a["target"] == "all":
                    sim.resume_all(WHO)
                    return "Линия запущена."
                sim.start(a["target"], WHO)
                return f"Станок «{sim.name(a['target'])}» запущен."
            if name == "add_temperature_rule":
                r = sim.add_rule(a["above_c"], a["slow_to_percent"], a["release_below_c"], a.get("scope", "line"), a.get("device_id"), WHO)
                return f"Правило #{r['id']} создано: {sim.rule_text(r)}."
            if name == "remove_rule":
                sim.remove_rule(a["rule_id"], WHO)
                return f"Правило #{a['rule_id']} удалено."
            if name == "simulate_problem":
                did, kind = sim.simulate(a.get("device_id"), a.get("kind") or "overheat", WHO)
                return f"Симуляция запущена: {sim.PROBLEMS[kind]} на станке «{sim.name(did)}»."
            if name == "clear_problems":
                return f"Проблемы сняты (станков с неисправностью было: {sim.clear_faults(WHO)})."
            if name == "repair_machine":
                sim.repair(a["device_id"], WHO)
                return f"Станок «{sim.name(a['device_id'])}» отремонтирован."
            if name == "create_work_order":
                due = (datetime.now() + timedelta(hours=float(a.get("due_hours") or 8))).strftime("%Y-%m-%dT%H:%M")
                oid = db.run("INSERT INTO orders(title,device_id,assignee,priority,status,due,created_ts) VALUES (?,?,?,?,?,?,?)",
                             (str(a["title"]).strip()[:200], a["device_id"], "Бригада А · Ахметов", a.get("priority", "med"), "new", due, int(time.time())))
                sim.log("INFO", f"{WHO}: выдан наряд #{oid}: {a['title']}", a["device_id"])
                return f"Наряд #{oid} выдан (срок {due.replace('T', ' ')})."
        except KeyError as e:
            return f"Ошибка: нет такого станка или правила ({e})."
        except ValueError as e:
            return f"Ошибка: {e}"
        return f"Неизвестный инструмент {name}."
    return call


async def ask(sim, messages: list[dict], control: bool = True, extra_system: str = ""):
    """Вопрос/команда агенту -> (ответ, действия). Без ключа ИИ — демо-режим по ключевым словам (offline.py)."""
    if not ai.configured():
        from . import offline
        return await offline.answer(sim, messages, control)
    import asyncio
    import re
    ctx = await asyncio.to_thread(reports.context_text, sim)
    system = system_prompt() + (("\n" + extra_system) if extra_system else "") + "\n\nКРАТКИЙ СРЕЗ ДАННЫХ (для справки):\n" + ctx
    q = (messages[-1]["content"] if messages else "").lower().replace("ё", "е")
    is_cmd = control and bool(COMMAND.search(q))
    try:
        if is_cmd:       # команда: модели нужны инструменты (несколько обращений), времени даём больше
            return await asyncio.wait_for(ai.run_agent(system, messages, _tools(control), make_executor(sim, control), max_tokens=900), CMD_DEADLINE_S)
        # вопрос: все данные уже в контексте — отвечаем ОДНИМ обращением к модели, без цепочки инструментов (в 2–3 раза быстрее)
        sys_q = system + "\n\nОтветь по данным выше сразу, без вызова инструментов: коротко (до 5–6 строк), по делу, с цифрами."
        txt = await asyncio.wait_for(ai.complete(sys_q, messages, max_tokens=700, timeout=ASK_DEADLINE_S + 5), ASK_DEADLINE_S)
        if not txt.strip():
            raise ai.AIError("ИИ вернул пустой ответ")
        return txt, []
    except (asyncio.TimeoutError, ai.AIError) as e:
        if isinstance(e, ai.AIError) and not re.search(r"\((429|500|502|503|504)\)|Нет связи|пустой", str(e)):
            raise
        # ИИ не уложился во время или временно недоступен — мгновенно отвечаем умным офлайн-режимом, а не заставляем ждать
        from . import offline
        text, acts = await offline.answer(sim, messages, control)
        why = "отвечает слишком долго" if isinstance(e, asyncio.TimeoutError) else "перегружен или недоступен"
        return f"⚠ ИИ-сервис {why}, отвечаю по данным завода без него.\n" + text.split("\n\n(демо-режим")[0], acts
