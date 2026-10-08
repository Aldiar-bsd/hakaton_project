"""Исходные данные кейса «Цифровой двойник автомобильного завода» (Allur) и проверка по целевым показателям.
Источник: «Кейс_Цифровой_двойник_Тестовые_данные.docx». Данные тестовые (01–02.10.2026), не из симулятора."""
from __future__ import annotations

# ---- целевые показатели (раздел «Дополнительные вводные») ----
TARGETS = {
    "shifts": 2, "shift_hours": 8,
    "oee": 0.85,                 # не менее 85 %
    "defect_max": 0.02,          # не более 2 %
    "downtime_max_min": 60,      # критичное оборудование, мин в сутки
    "month_plan_min": 5500,      # автомобилей в месяц
}
WORK_DAYS = 23                   # допущение для прогноза: рабочих дней в месяце
NEAR = 0.8                       # «близко к лимиту» — от 80 % допустимого простоя

# ---- 1. Работа производственных линий ----
LINES = [  # дата, линия, план, факт, время работы ч, загрузка %
    ("01.10.2026", "Сварка-1", 120, 118, 7.8, 98), ("01.10.2026", "Окраска-1", 120, 115, 7.5, 94),
    ("01.10.2026", "Сборка-1", 120, 121, 8.0, 100), ("02.10.2026", "Сварка-1", 120, 111, 7.2, 91),
    ("02.10.2026", "Окраска-1", 120, 116, 7.7, 96), ("02.10.2026", "Сборка-1", 120, 119, 7.9, 99),
]
# ---- 2. Простои оборудования ----
DOWNTIME = [  # дата, участок, оборудование, причина, минут, плановый?
    ("01.10.2026", "Сварка", "ABB-01", "Ошибка датчика", 25, False),
    ("01.10.2026", "Окраска", "Камера-02", "Замена фильтра", 40, False),
    ("02.10.2026", "Сборка", "Конвейер-03", "Обрыв цепи", 55, False),
    ("02.10.2026", "Сварка", "ABB-04", "Плановое ТО", 30, True),
]
# ---- 3. Производственный план на месяц ----
MODELS = [("Chevrolet Onix", 2500), ("Chevrolet Cobalt", 1800), ("JAC J7", 500)]
# ---- 4. Показатели качества ----
QUALITY = [  # дата, участок, выпущено, брак
    ("01.10.2026", "Сварка", 118, 2), ("01.10.2026", "Окраска", 115, 4), ("01.10.2026", "Сборка", 121, 1),
    ("02.10.2026", "Сварка", 111, 3), ("02.10.2026", "Окраска", 116, 6), ("02.10.2026", "Сборка", 119, 2),
]
# ---- 5. Схема участков ----
SCHEME = ["Склад комплектующих", "Сварка", "Окраска", "Сборка", "Контроль качества", "Склад готовой продукции"]
# соответствие участков кейса станкам цифрового двойника
SECTION_DEVICE = {"Сварка": "weld_robot_01", "Окраска": "paint_spray_02", "Сборка": "assembly_line_03"}


def _quality_rows(quality, limit):
    rows = []
    for d, s, out, bad in quality:
        pct = _d(bad, out)
        rows.append({"date": d, "section": s, "out": out, "defect": bad, "pct": pct, "ok": pct <= limit})
    return rows


def _d(a, b, default=0.0):
    return a / b if b else default


def _uniq(seq):
    return list(dict.fromkeys(seq))


def summary(live: dict | None = None) -> dict:
    """Всё для дашборда, отчётов и ИИ: таблицы, итоги по участкам, отклонения от целей, прогноз месяца.
    live — необязательно: {'oee','defect','downtime_today': {device_id: мин}} из симулятора."""
    from . import importer
    src = importer.load() or {}                     # данные завода из загруженного файла; если его нет — встроенные
    T = {**TARGETS, **(src.get("targets") or {})}
    LINES_, DOWN_, MODELS_, QUAL_ = (src.get("lines") or LINES), (src.get("downtime") or DOWNTIME), (src.get("models") or MODELS), (src.get("quality") or QUALITY)
    SCHEME_ = src.get("scheme") or SCHEME
    q = _quality_rows(QUAL_, T["defect_max"])
    days_n = max(1, len(_uniq(r["date"] for r in q)))
    sections = []
    for s in _uniq(r["section"] for r in q):
        rs = [r for r in q if r["section"] == s]
        out, bad = sum(r["out"] for r in rs), sum(r["defect"] for r in rs)
        sections.append({"section": s, "out": out, "defect": bad, "pct": bad / out if out else 0, "ok": (bad / out if out else 0) <= T["defect_max"],
                         "bad_days": sum(1 for r in rs if not r["ok"])})
    lines = []
    for d, ln, plan, fact, hours, load in LINES_:
        bad = next((r["defect"] for r in q if r["date"] == d and r["section"] == ln.split("-")[0]), 0)
        lines.append({"date": d, "line": ln, "plan": plan, "fact": fact, "hours": hours, "load": load,
                      "pct": _d(fact, plan), "good": fact - bad, "oee": _d(fact - bad, plan)})
    by_line = []
    for ln in _uniq(x["line"] for x in lines):
        rs = [x for x in lines if x["line"] == ln]
        by_line.append({"line": ln, "plan": sum(x["plan"] for x in rs), "fact": sum(x["fact"] for x in rs),
                        "load": sum(x["load"] for x in rs) / len(rs), "oee": sum(x["oee"] for x in rs) / len(rs),
                        "pct": _d(sum(x["fact"] for x in rs), sum(x["plan"] for x in rs))})
    down = []
    for d, sec, eq, why, mins, planned in DOWN_:
        share = _d(mins, T["downtime_max_min"])
        down.append({"date": d, "section": sec, "equipment": eq, "reason": why, "min": mins, "planned": planned,
                     "share": share, "state": "over" if mins > T["downtime_max_min"] else "near" if share >= NEAR else "ok"})
    plan_sum = sum(p for _, p in MODELS_)
    last_line = by_line[-1]["line"] if by_line else ""
    asm = [x for x in lines if x["line"] == last_line] or lines or [{"good": 0}]
    good_day = _d(sum(x["good"] for x in asm), len(asm))
    forecast = round(good_day * T["shifts"] * WORK_DAYS)          # годные за смену × 2 смены × рабочие дни
    alerts = []
    for s in sections:
        if not s["ok"]:
            alerts.append(f"{s['section']}: брак {s['pct']*100:.1f}% при допустимых {T['defect_max']*100:.0f}% "
                          f"({s['bad_days']} из {days_n} дн. выше нормы)")
    for x in down:
        if x["state"] == "over":
            alerts.append(f"{x['equipment']}: простой {x['min']} мин, выше лимита {T['downtime_max_min']} мин/сутки")
        elif x["state"] == "near" and not x["planned"]:
            alerts.append(f"{x['equipment']} ({x['reason']}): простой {x['min']} мин — {x['share']*100:.0f}% от лимита {T['downtime_max_min']} мин")
    if plan_sum < T["month_plan_min"]:
        alerts.append(f"План по моделям ({plan_sum}) меньше целевого выпуска ({T['month_plan_min']}): расхождение {T['month_plan_min'] - plan_sum} авто — "
                      f"проверьте план")
    if forecast < T["month_plan_min"]:
        alerts.append(f"Прогноз годного выпуска за месяц {forecast} < {T['month_plan_min']} (допущение: {T['shifts']} смены × {WORK_DAYS} дней, темп последней линии)")
    unpl = [x for x in down if not x["planned"]]
    plan_shift = (sum(x["plan"] for x in asm) / len(asm)) if asm and "plan" in asm[0] else 0
    per_min = plan_shift / (T["shift_hours"] * 60) if T["shift_hours"] else 0
    dt_day = sum(x["min"] for x in unpl) / days_n
    gain_q = sum(max(0.0, s["pct"] - T["defect_max"]) * s["out"] / days_n * T["shifts"] * WORK_DAYS for s in sections)
    effect = {"downtime_per_day": round(dt_day), "save_pct": 30, "cars_downtime": round(dt_day * 0.3 * per_min * WORK_DAYS),
              "cars_quality": round(gain_q), "per_hour": round(per_min * 60), "work_days": WORK_DAYS,
              "shortfall": max(0, T["month_plan_min"] - forecast)}
    out = {
        "effect": effect, "targets": T, "scheme": SCHEME_, "source": (importer.status() if src else {"loaded": False}), "lines": lines, "by_line": by_line, "downtime": down, "quality": q, "sections": sections,
        "models": [{"model": m, "plan": p, "share": p / plan_sum if plan_sum else 0} for m, p in MODELS_], "plan_sum": plan_sum,
        "forecast": {"month_good": forecast, "good_per_shift": round(good_day, 1), "work_days": WORK_DAYS,
                     "plan": T["month_plan_min"], "pct": forecast / T["month_plan_min"] if T["month_plan_min"] else 0},
        "alerts": alerts,
    }
    if live:
        out["live"] = {"oee": live["oee"], "oee_ok": live["oee"] >= T["oee"], "defect": live["defect"],
                       "defect_ok": live["defect"] <= T["defect_max"], "downtime_today": live["downtime_today"],
                       "downtime_max": max(live["downtime_today"].values(), default=0)}
        out["live"]["downtime_ok"] = out["live"]["downtime_max"] <= T["downtime_max_min"]
    return out


def live_values(sim) -> dict | None:
    """Текущие показатели из симулятора для сравнения с целями (простой — с начала суток по базе)."""
    import time
    from . import reports
    m = sim.last if sim else None
    if not m:
        return None
    now = time.time()
    midnight = time.mktime(time.localtime(now)[:3] + (0, 0, 0, 0, 0, -1))
    down = {x["id"]: x["down_min"] for x in reports.shift_metrics(midnight, now)}
    return {"oee": m["stats"]["oee"], "defect": 1 - m["stats"]["quality"], "downtime_today": down}


def text(sim=None) -> str:
    """Компактная сводка для ИИ."""
    s = summary(live_values(sim))
    T = s["targets"]
    L = [f"ЦЕЛИ ПРЕДПРИЯТИЯ: OEE ≥ {T['oee']*100:.0f}%, брак ≤ {T['defect_max']*100:.0f}%, простой критичного оборудования ≤ {T['downtime_max_min']} мин/сутки, "
         f"выпуск ≥ {T['month_plan_min']} авто/мес, {T['shifts']} смены по {T['shift_hours']} ч. Схема: {' → '.join(s['scheme'])}."]
    for x in s["by_line"]:
        L.append(f"- {x['line']} (01–02.10): факт {x['fact']}/{x['plan']} ({x['pct']*100:.0f}%), загрузка {x['load']:.0f}%, годные/план {x['oee']*100:.0f}%")
    for x in s["sections"]:
        L.append(f"- Брак {x['section']}: {x['defect']} из {x['out']} = {x['pct']*100:.1f}% {'(НОРМА)' if x['ok'] else '(ВЫШЕ НОРМЫ)'}")
    for x in s["downtime"]:
        L.append(f"- Простой {x['date']} {x['equipment']} ({x['section']}): {x['min']} мин, {x['reason']}{' (плановый)' if x['planned'] else ''}")
    L.append("- План на месяц: " + ", ".join(f"{m['model']} {m['plan']}" for m in s["models"]) + f" (итого {s['plan_sum']})")
    f = s["forecast"]
    L.append(f"- Прогноз годного выпуска за месяц: {f['month_good']} ({f['pct']*100:.0f}% от {f['plan']})")
    if "live" in s:
        v = s["live"]
        L.append(f"- Сейчас (симулятор): OEE {v['oee']*100:.0f}% ({'≥' if v['oee_ok'] else '<'} цели), брак ≈ {v['defect']*100:.1f}%, "
                 f"макс. простой за сутки {v['downtime_max']} мин")
    L += ["ОТКЛОНЕНИЯ: " + "; ".join(s["alerts"])] if s["alerts"] else []
    return "\n".join(L)
