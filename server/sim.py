"""Симулятор оборудования (порт логики из прежнего HTML) + запись телеметрии в SQLite
+ управление линией: скорость станков, остановка, правила автоматики по температуре.
Позже сюда добавится источник OPC UA / MQTT с тем же форматом данных."""
from __future__ import annotations
import json
import random
import time
from collections import deque
from datetime import datetime
from . import db
from .config import SIM_SPEED

LAY = json.load(open(__import__("pathlib").Path(__file__).with_name("layout.json"), encoding="utf-8"))
TICK = 1.5
AMB = 40.0          # температура остановленного станка (остывает до неё), °C
RULES_KEY = "rules"  # ключ в таблице kv, где хранятся правила автоматики


def rnd(a, b):
    return a + random.random() * (b - a)


def gauss(s):
    return s * (random.random() + random.random() + random.random() - 1.5) * 0.8


class Sim:
    def __init__(self):
        self.devs = LAY["devices"]
        self.S = {d["id"]: dict(t=55.0, v=0.04, u=0.0, l=70.0, f=False, vf=False, down=0.0, st="OK", sp=1.0, stop=False)
                  for d in self.devs}
        self.base = db.last_units()          # накопленный выпуск из прошлых запусков
        self.inc = []                        # последние 10 событий для дашборда
        self.t0 = time.time()
        self.last = None                     # последний payload
        self.on_critical = None              # callback(device_id, message)
        self.e_stop = False                  # «Остановить всё»
        self.flow = 1.0                      # поток линии 0..1: станок в аварии или остановлен -> встаёт вся линия
        self.rules = self._load_rules()      # правила автоматики
        self.rule_on = {}                    # id правила -> bool (линия) | set(device_id) (станок)
        self.line_ids = LAY.get("line") or [d["id"] for d in self.devs]
        self.hist = {d["id"]: deque(maxlen=24) for d in self.devs}   # (время, T) для прогноза нагрева

    # ---- события ----
    def log(self, level, message, device_id=None):
        self.inc.insert(0, {"time": datetime.now().strftime("%H:%M:%S"), "type": level, "message": message})
        del self.inc[10:]
        db.add_incident(int(time.time()), level, device_id, message)
        if level == "CRITICAL" and self.on_critical:
            try:
                self.on_critical(device_id, message)
            except Exception:
                pass

    def name(self, did):
        return next((d["name"] for d in self.devs if d["id"] == did), did)

    def trigger(self, device_id):
        if device_id not in self.S:
            raise KeyError(device_id)
        self.S[device_id]["f"] = True
        self.log("INFO", f"Запущена симуляция аварии на [{device_id}]", device_id)

    PROBLEMS = {"overheat": "перегрев", "vibration": "повышенная вибрация", "breakdown": "внезапная поломка"}

    def simulate(self, device_id, kind="overheat", who="Панель жюри"):
        """Симуляция проблемы на станке. overheat — станок греется до аварии, vibration — растёт вибрация,
        breakdown — мгновенная авария. device_id='random' (или пусто) — случайный станок и тип."""
        if device_id in (None, "", "random"):
            device_id = random.choice([d["id"] for d in self.devs])
        if device_id not in self.S:
            raise KeyError(device_id)
        if kind not in self.PROBLEMS:
            kind = random.choice(list(self.PROBLEMS)) if kind == "random" else "overheat"
        x, d = self.S[device_id], next(d for d in self.devs if d["id"] == device_id)
        if kind == "overheat":
            x["f"] = True
        elif kind == "vibration":
            x["vf"] = True
        else:
            x["f"] = True
            x["t"] = d["t_crit"] + 1
        self.log("INFO", f"{who}: симуляция — {self.PROBLEMS[kind]} на станке {d['name']} [{device_id}]", device_id)
        return device_id, kind

    def clear_faults(self, who="Панель жюри"):
        """Снять все симулированные неисправности (скорость и остановки не меняются)."""
        n = sum(1 for x in self.S.values() if x["f"] or x.get("vf"))
        for x in self.S.values():
            x["f"], x["vf"] = False, False
        self.log("INFO", f"{who}: все проблемы сняты ({n})", None)
        return n

    def reset(self):
        """Сброс: убирает аварии, снимает остановку и ограничения скорости (правила автоматики остаются)."""
        for x in self.S.values():
            x["f"], x["vf"], x["stop"], x["sp"] = False, False, False, 1.0
        self.e_stop = False

    # ---- управление линией ----
    def eff(self, did):
        """Эффективная скорость станка 0..1: остановка и правила автоматики учтены."""
        x = self.S[did]
        if self.e_stop or x["stop"]:
            return 0.0
        f = 1.0
        for r in self.rules:
            on = self.rule_on.get(r["id"])
            hit = on if r["scope"] == "line" else (did in on if on else False)
            if hit:
                f = min(f, r["slow_to"] / 100)
        return round(x["sp"] * f, 3)

    def _targets(self, target):
        if target in (None, "", "line", "all"):
            return [d["id"] for d in self.devs]
        if target not in self.S:
            raise KeyError(target)
        return [target]

    def set_speed(self, target, percent, who="Оператор"):
        pct = max(10, min(100, int(percent)))
        ids = self._targets(target)
        for i in ids:
            self.S[i]["sp"] = pct / 100
        what = "всей линии" if len(ids) > 1 else self.name(ids[0])
        self.log("INFO", f"{who}: скорость {what} — {pct}%", None if len(ids) > 1 else ids[0])
        return ids

    def stop(self, target, who="Оператор"):
        ids = self._targets(target)
        for i in ids:
            self.S[i]["stop"] = True
        if len(ids) > 1:
            self.log("WARNING", f"{who}: остановлена вся линия", None)
        else:
            self.log("WARNING", f"{who}: остановлен станок {self.name(ids[0])} [{ids[0]}]", ids[0])
        return ids

    def start(self, target, who="Оператор"):
        ids = self._targets(target)
        for i in ids:
            self.S[i]["stop"] = False
        if len(ids) > 1:
            self.e_stop = False
            self.log("INFO", f"{who}: линия запущена", None)
        else:
            self.log("INFO", f"{who}: станок {self.name(ids[0])} [{ids[0]}] запущен", ids[0])
        return ids

    def stop_all(self, who="Оператор"):
        self.e_stop = True
        self.log("WARNING", f"{who}: АВАРИЙНАЯ ОСТАНОВКА всей линии", None)

    def resume_all(self, who="Оператор"):
        self.e_stop = False
        for x in self.S.values():
            x["stop"] = False
        self.log("INFO", f"{who}: линия запущена после остановки", None)

    def repair(self, device_id, who="Оператор"):
        if device_id not in self.S:
            raise KeyError(device_id)
        self.S[device_id]["f"] = self.S[device_id]["vf"] = False
        self.log("INFO", f"{who}: неисправность узла {self.name(device_id)} [{device_id}] устранена", device_id)

    # ---- правила автоматики ----
    def _load_rules(self):
        try:
            return json.loads(db.kv_get(RULES_KEY) or "[]")
        except ValueError:
            return []

    def _save_rules(self):
        db.kv_set(RULES_KEY, json.dumps(self.rules, ensure_ascii=False))

    def add_rule(self, above, slow_to, below, scope="line", device_id=None, who="Оператор"):
        above, below, slow_to = float(above), float(below), max(10, min(100, int(slow_to)))
        if below >= above:
            raise ValueError("Температура отпускания должна быть ниже порога срабатывания")
        if scope == "device" and device_id not in self.S:
            raise KeyError(device_id)
        rid = max([r["id"] for r in self.rules] + [0]) + 1
        r = {"id": rid, "scope": "device" if scope == "device" else "line", "device_id": device_id if scope == "device" else None,
             "above": above, "slow_to": slow_to, "below": below}
        self.rules.append(r)
        self._save_rules()
        self.log("INFO", f"{who}: правило #{rid}: {self.rule_text(r)}", None)
        return r

    def remove_rule(self, rid, who="Оператор"):
        n = len(self.rules)
        self.rules = [r for r in self.rules if r["id"] != int(rid)]
        self.rule_on.pop(int(rid), None)
        if len(self.rules) == n:
            raise KeyError(rid)
        self._save_rules()
        self.log("INFO", f"{who}: правило #{rid} удалено", None)

    def rule_text(self, r):
        who = "линия" if r["scope"] == "line" else self.name(r["device_id"])
        return f"если станок горячее {r['above']:g}°C — {who} до {r['slow_to']}% скорости, пока не остынет до {r['below']:g}°C"

    def _apply_rules(self):
        for r in self.rules:
            temps = {d["id"]: self.S[d["id"]]["t"] for d in self.devs}
            if r["scope"] == "line":
                on = bool(self.rule_on.get(r["id"]))
                hot = max(temps, key=temps.get)
                if not on and temps[hot] > r["above"]:
                    self.rule_on[r["id"]] = True
                    self.log("WARNING", f"Автоматика #{r['id']}: {self.name(hot)} {temps[hot]:.0f}°C — линия замедлена до {r['slow_to']}%", hot)
                elif on and max(temps.values()) < r["below"]:
                    self.rule_on[r["id"]] = False
                    self.log("INFO", f"Автоматика #{r['id']}: температура в норме — скорость линии восстановлена", None)
            else:
                ids = [d["id"] for d in self.devs] if r["device_id"] in (None, "*") else [r["device_id"]]
                on = self.rule_on.setdefault(r["id"], set())
                for i in ids:
                    if i not in on and temps[i] > r["above"]:
                        on.add(i)
                        self.log("WARNING", f"Автоматика #{r['id']}: {self.name(i)} {temps[i]:.0f}°C — скорость снижена до {r['slow_to']}%", i)
                    elif i in on and temps[i] < r["below"]:
                        on.discard(i)
                        self.log("INFO", f"Автоматика #{r['id']}: {self.name(i)} остыл — скорость восстановлена", i)

    def control_state(self):
        devs = {}
        for d in self.devs:
            x, e = self.S[d["id"]], self.eff(d["id"])
            devs[d["id"]] = {"speed": round(x["sp"] * 100), "stopped": bool(x["stop"] or self.e_stop), "eff": round(e * 100),
                             "limited": e > 0 and e < x["sp"] - 1e-6}
        return {"e_stop": self.e_stop, "line": self.line_ids, "devices": devs,
                "line_eff": min((v["eff"] for v in devs.values()), default=100), "flow": round(self.flow * 100),
                "rules": [{**r, "text": self.rule_text(r), "active": bool(self.rule_on.get(r["id"]))} for r in self.rules]}

    # ---- прогноз: риск простоя и узкое место ----
    def forecast(self):
        """По тренду температуры оценивает время до аварии; узкое место = станок с наименьшей пропускной способностью."""
        devs = []
        for d in self.devs:
            x, h, e = self.S[d["id"]], self.hist[d["id"]], self.eff(d["id"])
            slope = 0.0                                   # °C в секунду: наклон прямой по последним ~16 замерам (сглаживает шум)
            pts = list(h)[-16:]
            if len(pts) >= 6:
                mt, mv = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
                den = sum((p[0] - mt) ** 2 for p in pts)
                slope = sum((p[0] - mt) * (p[1] - mv) for p in pts) / den if den > 1e-9 else 0.0
            ttc = (d["t_crit"] - x["t"]) / slope / 60 if slope > 0.1 and x["t"] > 60 and x["t"] < d["t_crit"] else None   # минут до аварии
            st = x["st"]
            risk = "high" if st == "CRITICAL" or (ttc is not None and ttc < 10) else "med" if st == "WARNING" or (ttc is not None and ttc < 30) else "low"
            thr = 0.0 if st == "CRITICAL" else d["plan_per_hour"] * e          # авто в час сейчас
            why = ("авария — линия стоит" if st == "CRITICAL" else "остановлен" if e == 0 else f"работает на {round(e*100)}% скорости" if e < 1
                   else f"нагрев +{slope*60:.1f}°C/мин, авария через ~{ttc:.0f} мин" if ttc is not None and ttc < 30 else "в норме")
            devs.append({"id": d["id"], "name": d["name"], "status": st, "temp": round(x["t"], 1), "slope_min": round(slope * 60, 2),
                         "ttc_min": None if ttc is None else round(ttc, 1), "risk": risk, "throughput": round(thr),
                         "nominal": d["plan_per_hour"], "why": why})
        bn = min(devs, key=lambda z: (z["throughput"], z["nominal"]))
        line, nominal = bn["throughput"], min(z["nominal"] for z in devs)
        if bn["throughput"] < bn["nominal"]:
            reason = bn["why"]
        else:
            reason = f"самая низкая мощность на линии ({bn['nominal']} авто/ч)"
        return {"devices": devs, "bottleneck": {"id": bn["id"], "name": bn["name"], "reason": reason},
                "line_throughput": line, "nominal_throughput": nominal, "loss_pct": round(max(0, 1 - line / nominal) * 100) if nominal else 0}

    # ---- шаг симуляции ----
    def tick(self):
        el = max(1e-6, time.time() - self.t0)
        self._apply_rules()
        # линия — это конвейер: если хоть один станок стоит или в аварии, все остальные ждут (не работают и не греются)
        self.flow = min([0.0 if (self.S[d["id"]]["st"] == "CRITICAL" or self.eff(d["id"]) == 0) else self.eff(d["id"]) for d in self.devs] + [1.0])
        devs, ds = [], []
        for d in self.devs:
            x = self.S[d["id"]]
            e = self.eff(d["id"])                 # своя скорость станка
            er = min(e, self.flow)                  # реальная рабочая скорость с учётом линии
            x["er"] = er
            if x["f"]:
                if e > 0:        # неисправный узел греется тем медленнее, чем ниже скорость
                    x["t"] += rnd(1.2, 2.2) * e
                    x["v"] += rnd(0.004, 0.01) * e
                else:            # остановленный — остывает
                    x["t"] += (AMB - x["t"]) * 0.06
                    x["v"] += (0.012 - x["v"]) * 0.1
            else:
                # температура и вибрация зависят от реальной работы: скорость × загрузка; простой — остывание до комнатной
                tgt = AMB + er * (4 + 13 * (0.55 + 0.45 * x["l"] / 100))
                x["t"] += (tgt - x["t"]) * 0.2 + gauss(0.6) * (1 if er > 0 else 0.3)
                x["v"] += (0.012 + 0.028 * er * (0.7 + 0.3 * x["l"] / 100) - x["v"]) * (0.0 if x.get("vf") else 0.2) + gauss(0.002) * (1 if er > 0 else 0.3)
            if x.get("vf") and e > 0:
                x["v"] += rnd(0.004, 0.01) * e
            x["v"] = max(0.01, x["v"])
            x["l"] = min(100, max(30, x["l"] + gauss(3)))
            if x["t"] >= d["t_crit"] or x["v"] >= d["v_crit"]:
                st = "CRITICAL"
            elif x["t"] >= d["t_warn"] or x["v"] >= d["v_warn"]:
                st = "WARNING"
            else:
                st = "OK"
            if st != "CRITICAL" and er > 0:
                x["u"] += d["plan_per_hour"] / 3600 * TICK * (0.85 + x["l"] / 400) * SIM_SPEED * er
            elif st == "CRITICAL" or e == 0:        # собственный простой станка (простой из-за других станков сюда не входит)
                x["down"] += TICK
            ai = None
            if x["f"] and e > 0 and x["t"] > 62 and st != "CRITICAL":
                mins = max(1, round((d["t_crit"] - x["t"]) / (1.7 * e)))
                ai = {"minutes": mins, "message": f"PREDICTIVE_ALERT: Прогнозируется перегрев узла [{d['id']}] через {mins} мин"}
            if ai and st == "OK":
                st = "WARNING"
            if st != x["st"] and st != "OK":
                self.log(st, f"{d['name']} [{d['id']}]: T={x['t']:.1f}°C, V={x['v']:.3f}g", d["id"])
            x["st"] = st
            self.hist[d["id"]].append((time.time(), x["t"]))
            exp =d["plan_per_hour"] * SIM_SPEED * el / 3600
            a = max(0, 1 - x["down"] / el)
            p = min(1, x["u"] / exp) if exp > 0 else 1
            q = 0.8 if st == "CRITICAL" else 0.95 if st == "WARNING" else 0.99
            ds.append(dict(a=a, p=p, q=q, u=x["u"], exp=exp))
            devs.append({
                "device_id": d["id"], "temperature": round(x["t"], 1), "vibration": round(x["v"], 3),
                "load_percentage": round(x["l"] * er), "units_produced": int(x["u"]),
                "timestamp": datetime.now().isoformat(), "status": st, "ai": ai,
            })
        n = len(ds)
        av = lambda k: sum(z[k] for z in ds) / n
        payload = {
            "source": "simulator", "devices": devs, "incidents": self.inc,
            "stats": {
                "oee": sum(z["a"] * z["p"] * z["q"] for z in ds) / n,
                "availability": av("a"), "performance": av("p"), "quality": av("q"),
                "units": int(sum(z["u"] for z in ds)), "plan": round(sum(z["exp"] for z in ds)),
                "downtime_min": {d["id"]: round(self.S[d["id"]]["down"] / 60, 1) for d in self.devs},
            },
        }
        self.last = payload
        return payload

    # ---- запись в БД ----
    def snapshot(self):
        ts = int(time.time())
        rows = []
        for d in self.devs:
            x = self.S[d["id"]]
            st = "STOPPED" if self.eff(d["id"]) == 0 else x["st"]
            rows.append((ts, d["id"], round(x["t"], 1), round(x["v"], 3), round(x["l"] * x.get("er", self.eff(d["id"]))),
                         round(self.base.get(d["id"], 0.0) + x["u"], 2), st))
        db.add_snapshots(rows)
