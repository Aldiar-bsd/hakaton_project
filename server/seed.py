"""Демо-история за ~2 суток, чтобы отчёты не были пустыми при первом запуске."""
from __future__ import annotations
import random
import time
from . import db
from .sim import LAY

STEP = 300


def seed_history(now: float | None = None):
    have = set(db.last_units())            # станки, у которых история уже есть
    fresh = db.count_snapshots() == 0       # пустая база — заводим и наряды
    todo = [d for d in LAY["devices"] if d["id"] not in have]
    if not todo:
        return
    now = int(now or time.time())
    rng = random.Random(42)
    start = (now - 50 * 3600) // STEP * STEP
    snaps, incs = [], []
    for d in todo:
        eps = []
        for _ in range(3):
            s0 = rng.randint(start + 3600, now - 3 * 3600)
            dur = rng.choice([10, 15, 20, 30, 40]) * 60
            eps.append((s0, s0 + dur, rng.random() < 0.55))   # (от, до, критичная?)
        eps.sort()
        for s0, s1, crit in eps:
            lvl = "CRITICAL" if crit else "WARNING"
            incs.append((s0, lvl, d["id"], f"{d['name']} [{d['id']}]: " + ("перегрев узла, остановка" if crit else "повышенная вибрация")))
        units, load = 0.0, 70.0
        for ts in range(start, now, STEP):
            ep = next(((a, b, c) for a, b, c in eps if a <= ts < b), None)
            load = min(100, max(40, load + rng.uniform(-4, 4)))
            if ep and ep[2]:
                st, temp, vib = "CRITICAL", rng.uniform(86, 95), rng.uniform(0.12, 0.17)
            elif ep:
                st, temp, vib = "WARNING", rng.uniform(70, 80), rng.uniform(0.08, 0.11)
            else:
                st, temp, vib = "OK", rng.uniform(52, 60), rng.uniform(0.03, 0.055)
            if st != "CRITICAL":
                units += d["plan_per_hour"] / 3600 * STEP * rng.uniform(0.86, 1.0) * (0.93 if st == "WARNING" else 1)
            snaps.append((ts, d["id"], round(temp, 1), round(vib, 3), round(load), round(units, 2), st))
    db.add_snapshots(snaps)
    for ts, lvl, did, msg in incs:
        db.add_incident(ts, lvl, did, msg)
    # наряды (те же, что были в демо)
    if fresh and not db.rows("SELECT 1 FROM orders LIMIT 1"):
        h = 3600
        demo = [
            ("Замена подшипника шпинделя", "cnc_milling_05", "Бригада А · Ахметов", "high", "work", 2, None),
            ("Осмотр гидросистемы пресса", "stamp_press_04", "Бригада Б · Ким", "med", "new", 6, None),
            ("Калибровка горелки робота", "weld_robot_01", "Бригада А · Ахметов", "high", "new", -3, None),
            ("Очистка форсунок камеры", "paint_spray_02", "Бригада В · Серикова", "low", "done", -8, -9),
            ("Смазка роликов конвейера", "assembly_line_03", "Бригада Б · Ким", "med", "done", -1, -2),
        ]
        for title, dev, who, pr, st, due_h, done_h in demo:
            due = time.strftime("%Y-%m-%dT%H:%M", time.localtime(now + due_h * h))
            db.run("INSERT INTO orders(title,device_id,assignee,priority,status,due,created_ts,done_ts) VALUES (?,?,?,?,?,?,?,?)",
                   (title, dev, who, pr, st, due, now - 20 * h, now + done_h * h if done_h is not None else None))
