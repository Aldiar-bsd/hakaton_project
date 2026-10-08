"""Режим «из коробки»: агент понимает команды и вопросы без внешнего ИИ-сервиса и без ключа.
Работает по правилам (ключевые слова) и выполняет те же действия, что настоящий ИИ-агент (через agent.make_executor).
Когда в Настройках подключён ключ ИИ, чат автоматически переключается на настоящую модель."""
from __future__ import annotations
import re
from . import agent, case_data
from .sim import LAY

NAMES = {d["id"]: d["name"] for d in LAY["devices"]}
KEYS = [("weld_robot_01", r"сварк"), ("laser_grind_07", r"шлиф|лазер"), ("stamp_press_04", r"пресс|штамп"), ("cnc_milling_05", r"чпу|фрез|локализ"),
        ("paint_spray_02", r"окраск|покраск|краск"), ("assembly_line_03", r"сборк|конвейер"), ("quality_scan_06", r"контрол|геометр|скан")]
TAG = "\n\n(демо-режим без ИИ-ключа. Подключить ИИ: Настройки → «ИИ-агент».)"
HELP = ("Я понимаю команды и вопросы, например:\n- «как дела на заводе?», «что с качеством и браком?», «где узкое место?»\n"
        "- «останови пресс», «запусти пресс», «останови всю линию», «запусти линию»\n- «поставь окраску на 80%», «замедли линию до 60%»\n"
        "- «если станок горячее 70 градусов — притормози линию до остывания до 60»\n- «почини сварку», «выдай наряд на сварку»"
        "\n- для демонстрации: «создай аварию на сварке», «симулируй перегрев пресса», «вибрация на окраске», «случайная авария», «убери все проблемы»")


def _station(t: str):
    for did, pat in KEYS:
        if re.search(pat, t):
            return did
    return None


async def answer(sim, messages: list[dict], control: bool = True):
    """-> (текст, действия) в том же формате, что agent.ask."""
    q = (messages[-1]["content"] if messages else "").lower().replace("ё", "е")
    ex = agent.make_executor(sim, control)
    acts: list[dict] = []

    async def do(tool, args):
        res = await ex(tool, args)
        acts.append({"tool": tool, "args": args, "result": res})
        return res

    st = _station(q)
    nums = [int(x) for x in re.findall(r"(\d{1,3})\s*(?:%|процент|градус|°|c\b)?", q) if x]
    whole = bool(re.search(r"все\b|всю|всех|линию|линия|завод|цех", q))
    # --- правило автоматики: «если горячее 70 ... до 60»
    if re.search(r"горяч|температур|перегрев|нагрев", q) and re.search(r"если|когда|при", q) and len(nums) >= 2 and re.search(r"замедл|притормоз|снизь|сбав|скорост", q):
        pct = re.search(r"(\d{2,3})\s*%", q)
        temps = [n for n in nums if not pct or n != int(pct.group(1))] or nums
        above, below = max(temps[:2]), min(temps[:2])
        slow = int(pct.group(1)) if pct else 50
        res = await do("add_temperature_rule", {"above_c": above, "release_below_c": below, "slow_to_percent": slow, "scope": "line" if whole or not st else "device", **({"device_id": st} if st and not whole else {})})
        return f"{res}" + ("" if pct else " Процент замедления не назван, поставил 50%.") + TAG, acts
    # --- панель жюри: симуляция проблем и их снятие
    prob = re.search(r"авари|перегрев|вибрац|поломк|слом|заклин|проблем|сбой|неисправн", q)
    if prob and re.search(r"убери|убрать|сними|снять|сброс|очисти|отмени|устрани|нет проблем|верни в норму", q) and not re.search(r"созда|симул|вызов|смоделир|имитир", q):
        if st:
            sim.repair(st, agent.WHO)
            return f"Проблема на станке «{NAMES[st]}» снята." + TAG, acts
        return await do("clear_problems", {}) + TAG, acts
    if (prob and re.search(r"созда|симул|вызов|смоделир|имитир|устрой|подстрой|сделай|организуй|случайн", q)) or re.search(r"\bсломай|\bзаклин", q):
        kind = "vibration" if re.search(r"вибрац", q) else "breakdown" if re.search(r"поломк|слом|заклин", q) else "overheat"
        if re.search(r"случайн|любую|любой|какую-нибудь", q) or not st:
            return await do("simulate_problem", {"device_id": "random", "kind": "random" if re.search(r"случайн", q) else kind}) + TAG, acts
        return await do("simulate_problem", {"device_id": st, "kind": kind}) + TAG, acts
    # --- остановка / запуск
    if re.search(r"останов|стоп|выключ|заглуш", q):
        if st and not (whole and not st):
            return await do("stop_machine", {"target": st}) + TAG, acts
        if whole or re.search(r"аварийн", q):
            return await do("stop_machine", {"target": "all"}) + TAG, acts
    if re.search(r"запусти|включи|возобнов|поехали|стартуй", q):
        if st:
            return await do("start_machine", {"target": st}) + TAG, acts
        return await do("start_machine", {"target": "all"}) + TAG, acts
    # --- скорость
    if re.search(r"скорост|поставь|сделай|замедл|ускор|притормоз", q) and nums:
        pct = re.search(r"(\d{1,3})\s*(?:%|процент)", q)
        p = int(pct.group(1)) if pct else nums[-1]
        return await do("set_speed", {"target": st or "line", "percent": p}) + TAG, acts
    # --- ремонт и наряды
    if re.search(r"почин|отремонт|устран|ремонт", q) and control:
        ids = [st] if st else [d for d in NAMES if sim.S[d]["f"]]
        if not ids:
            return "Неисправных станков нет — чинить нечего." + TAG, acts
        for i in ids:
            sim.repair(i, agent.WHO)
            acts.append({"tool": "repair", "args": {"device_id": i}, "result": f"Неисправность узла {NAMES[i]} устранена."})
        return "Готово: " + ", ".join(NAMES[i] for i in ids) + " — починено; станок остывает." + TAG, acts
    if "наряд" in q and st:
        return await do("create_work_order", {"title": f"Осмотр и обслуживание: {NAMES[st]}", "device_id": st, "priority": "med"}) + TAG, acts
    # --- вопросы
    if re.search(r"что такое|что значит|объясни|поясни|означает", q):
        g = _glossary(q)
        if g:
            return g + TAG, acts
    if re.search(r"расскажи про|расскажи о", q) and re.search(r"\boee|\bоее|двойник|смен|узк\w+ мест", q):
        g = _glossary(q)
        if g:
            return g + TAG, acts
    if re.search(r"что умеешь|что ты умеешь|что можешь|кто ты|помощь|помоги|команды|\bhelp\b", q):
        return "Я ИИ-помощник цифрового двойника завода Allur: отвечаю по данным линии и могу ею управлять.\n\n" + HELP + TAG, acts
    if re.search(r"совет|рекоменд|что делать|что посоветуеш|как улучшить|как снизить|что предпринять|что сделать", q):
        return _advice(sim) + TAG, acts
    if re.search(r"\bузк|\bпрогноз|\bриск|\bожида", q):
        f = sim.forecast()
        b = f["bottleneck"]
        risky = [d for d in f["devices"] if d["risk"] != "low"]
        t = f"Узкое место: {NAMES.get(b['id'], b['name'])} — {b['reason']}. Пропускная способность линии {f['line_throughput']} из {f['nominal_throughput']} авто/ч."
        t += "\nРиск простоя: " + ("; ".join(f"{NAMES[d['id']]} — {d['why']}" for d in risky) if risky else "высоких рисков нет.")
        return t + TAG, acts
    if re.search(r"сколько.*(выпущ|произвед|сдела|автомоб|машин)|выпуск|производительност", q):
        s = (sim.last or {}).get("stats")
        if s:
            return f"С начала работы линии выпущено {s['units']} авто при плане {s['plan']} (производительность {s['performance']*100:.0f}%). OEE {s['oee']*100:.0f}%." + TAG, acts
    sec = re.search(r"сварк|окраск|покраск|сборк", q)
    if sec and re.search(r"\bбрак|\bкачеств", q):                       # брак по конкретному участку
        name = {"свар": "Сварка", "окра": "Окраска", "покр": "Окраска", "сбор": "Сборка"}[sec.group(0)[:4]]
        cs = case_data.summary(case_data.live_values(sim))
        x = next((s for s in cs["sections"] if s["section"] == name), None)
        if x:
            lim = cs["targets"]["defect_max"] * 100
            return (f"{name}: брак {x['pct']*100:.1f}% ({x['defect']} из {x['out']} за {len(set(r['date'] for r in cs['quality']))} дн.) при допустимых {lim:.0f}% — "
                    f"{'в норме' if x['ok'] else 'ВЫШЕ нормы'}." + ("" if x["ok"] else " Выдан наряд на снижение брака — смотрите «Панель мастера».")) + TAG, acts
    if re.search(r"\bпростой|\bпростои", q) and not re.search(r"что такое|объясни", q):
        cs = case_data.summary(case_data.live_values(sim))
        lim = cs["targets"]["downtime_max_min"]
        rows = [f"- {x['date']} {x['equipment']} ({x['reason']}): {x['min']} мин, {x['share']*100:.0f}% от лимита {lim} мин" + (" (плановый)" if x["planned"] else "") for x in cs["downtime"]]
        if rows:
            return "Простои по данным завода:\n" + "\n".join(rows) + f"\nДопустимо не более {lim} минут в сутки на критичное оборудование." + TAG, acts
    if re.search(r"\bбрак|\bкачеств|\bцел[иьяе]|\bплан|\bпростои|\boee|\bоее", q):
        return case_data.text(sim) + TAG, acts
    if st and not re.search(r"все станки|весь завод", q):
        return _device(sim, st) + TAG, acts
    if re.search(r"самый горяч|горячее всего|максимальн\w* температур|температур", q):
        m = sim.last
        if m and m.get("devices"):
            d = max(m["devices"], key=lambda x: x["temperature"])
            return f"Самый горячий узел сейчас — «{NAMES.get(d['device_id'], d['device_id'])}»: {d['temperature']}°C, вибрация {d['vibration']} g, статус {d['status']}." + TAG, acts
    if re.search(r"как дела|статус|состояние|обстановк|что происходит|отчет|доложи|что на заводе|ситуаци|как завод|все ли хорошо|все нормально", q) or re.fullmatch(r"\W*(привет\w*|здравствуй\w*|добрый \w+|салем\w*|сәлем\w*|hello|hi)\W*", q):
        greet = "Привет! " if re.search(r"привет|здравств|добрый|салем|сәлем|hello|\bhi\b", q) else ""
        return greet + _overview(sim) + TAG, acts
    return ("Не совсем понял вопрос. Я лучше всего отвечаю про линию, станки, брак, простои, план, прогноз и могу выполнять команды.\n\n"
            + HELP + TAG), acts


# ---------------------------------------------------------------- человеческие ответы по данным
def _dev_state(sim, did):
    m = sim.last or {}
    d = next((x for x in m.get("devices", []) if x["device_id"] == did), None)
    k = sim.control_state()["devices"].get(did, {})
    return d, k


def _device(sim, did) -> str:
    d, k = _dev_state(sim, did)
    if not d:
        return f"По станку «{NAMES[did]}» данные ещё не поступили."
    st = {"OK": "работает в норме", "WARNING": "есть предупреждение (повышенные показатели)", "CRITICAL": "в аварийном состоянии"}.get(d["status"], d["status"])
    run = "остановлен" if k.get("stopped") else f"скорость {k.get('eff', 100)}%" + (" (ограничена автоматикой)" if k.get("limited") else "")
    t = f"«{NAMES[did]}» {st}: температура {d['temperature']}°C, вибрация {d['vibration']} g, загрузка {d['load_percentage']}%, {run}."
    if d.get("ai"):
        t += f"\nПрогноз: {d['ai']['message']}."
    return t


def _overview(sim) -> str:
    m = sim.last
    if not m:
        return "Данные ещё не поступили, подождите несколько секунд."
    s, devs = m["stats"], m["devices"]
    bad = [d for d in devs if d["status"] != "OK"]
    c = sim.control_state()
    stopped = [NAMES[i] for i, k in c["devices"].items() if k.get("stopped")]
    t = f"Линия работает, OEE {s['oee']*100:.0f}% ({'в цели' if s['oee'] >= 0.85 else 'ниже цели 85%'}), выпущено {s['units']} из {s['plan']} авто."
    t += f"\nВ норме {len(devs) - len(bad)} из {len(devs)} станков."
    if bad:
        t += " Проблемы: " + "; ".join(f"{NAMES[d['device_id']]} — {'авария' if d['status'] == 'CRITICAL' else 'предупреждение'} ({d['temperature']}°C)" for d in bad) + "."
    if stopped:
        t += "\nОстановлено: " + ", ".join(stopped) + "."
    try:
        al = case_data.summary(case_data.live_values(sim))["alerts"][:3]
    except Exception:
        al = []
    if al:
        t += "\nПо данным завода: " + "; ".join(al) + "."
    return t + "\nСпросите «что посоветуешь?» или «где узкое место?», если нужны подробности."


def _advice(sim) -> str:
    tips = []
    m = sim.last or {}
    for d in m.get("devices", []):
        if d["status"] == "CRITICAL":
            tips.append(f"«{NAMES[d['device_id']]}» в аварии — выдайте наряд бригаде («выдай наряд на {NAMES[d['device_id']].lower()}») и почините станок.")
        elif d["status"] == "WARNING":
            tips.append(f"«{NAMES[d['device_id']]}» перегревается ({d['temperature']}°C) — снизьте скорость или поставьте правило автоматики.")
    try:
        f = sim.forecast()
        for d in f["devices"]:
            if d["risk"] != "low" and not any(NAMES[d["id"]] in x for x in tips):
                tips.append(f"Риск простоя: «{NAMES[d['id']]}» — {d['why']}. Проверьте узел заранее.")
        b = f["bottleneck"]
        tips.append(f"Узкое место линии — «{NAMES.get(b['id'], b['name'])}»: {b['reason']}. Здесь самый быстрый выигрыш в выпуске.")
    except Exception:
        pass
    try:
        for a in case_data.summary(case_data.live_values(sim))["alerts"][:3]:
            tips.append(a + ".")
    except Exception:
        pass
    return "Что я бы сделал сейчас:\n" + "\n".join(f"- {x}" for x in tips) if tips else "Критичных проблем нет — продолжайте работу и следите за прогнозом простоев."


GLOSSARY = [
    (r"\boee|\bоее|эффективност", "OEE — общая эффективность оборудования: доступность × производительность × качество. Цель завода — не ниже 85%. "
     "Чем меньше простоев, замедлений и брака, тем OEE выше."),
    (r"простой|простои", "Простой — время, когда оборудование не выпускает продукцию (поломка, ремонт, переналадка, ТО). Допустимый предел для критичного оборудования — 60 минут в сутки."),
    (r"брак|качеств", "Брак — доля продукции с дефектами. Допустимый уровень по условиям кейса — не более 2%. Выше всего он на окраске."),
    (r"узк\w+ мест|bottleneck", "Узкое место — станок с самой низкой пропускной способностью: он ограничивает выпуск всей линии. Его ускорение даёт наибольший прирост."),
    (r"двойник", "Цифровой двойник — виртуальная копия завода: показывает состояние станков в реальном времени, прогнозирует простои и позволяет безопасно проверять решения."),
    (r"смен", "Завод работает в 2 смены по 8 часов (08:00–16:00 и 16:00–24:00). Отчёт за смену можно скачать в PDF, Excel или Word."),
    (r"прогноз", "Прогноз простоев строится по тренду температуры и вибрации: система оценивает, через сколько минут станок может выйти в аварию."),
]


def _glossary(q):
    for pat, text in GLOSSARY:
        if re.search(pat, q):
            return text
    return None
