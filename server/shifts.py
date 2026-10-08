from __future__ import annotations
"""Границы смен (локальное время компьютера).
По умолчанию 2 смены по 8 часов (08:00–16:00 и 16:00–24:00); ночью завод не работает.
Для 12 часов: SHIFT_HOURS=12, SHIFT_COUNT=2 (круглосуточно)."""
import time
from datetime import datetime, timedelta
from .config import SHIFT_COUNT, SHIFT_HOURS, SHIFT_START


def _start_today(now: datetime) -> datetime:
    try:
        hh, mm = [int(x) for x in SHIFT_START.split(":")]
    except Exception:
        hh, mm = 8, 0
    return now.replace(hour=hh, minute=mm, second=0, microsecond=0)


def _name(idx: int, st: datetime, en: datetime) -> str:
    if SHIFT_HOURS == 12 and SHIFT_COUNT == 2:
        return "Смена 1 (дневная)" if idx == 0 else "Смена 2 (ночная)"
    return f"Смена {idx + 1} ({st:%H:%M}–{en:%H:%M})"


def shift_at(ts: float):
    """Смена, в которую попадает момент ts (в перерыве между сменами — последняя закончившаяся).
    -> dict(start, end, name, idx, gap)"""
    now = datetime.fromtimestamp(ts)
    d0 = _start_today(now)
    if now < d0:
        d0 -= timedelta(days=1)
    idx = int((now - d0).total_seconds() // (SHIFT_HOURS * 3600))
    gap = idx >= SHIFT_COUNT
    idx = min(idx, SHIFT_COUNT - 1)
    st = d0 + timedelta(hours=idx * SHIFT_HOURS)
    en = st + timedelta(hours=SHIFT_HOURS)
    return {"start": st.timestamp(), "end": en.timestamp(), "name": _name(idx, st, en), "idx": idx + 1, "gap": gap}


def window(which: str, now: float | None = None):
    """which = 'cur' (с начала смены до сейчас) | 'prev' (прошлая смена целиком)."""
    now = now or time.time()
    cur = shift_at(now)
    if which == "prev":
        p = shift_at(cur["start"] - 1)
        return {**p, "until": p["end"], "which": "prev", "gap": False}
    return {**cur, "until": cur["end"] if cur["gap"] else now, "which": "cur"}


def fmt(ts: float, f="%d.%m.%Y %H:%M") -> str:
    return datetime.fromtimestamp(ts).strftime(f)
