"""SQLite: один файл data/allur.db, создаётся сам."""
import sqlite3
import threading
from .config import DB_PATH

_lock = threading.RLock()
_c = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots(ts INTEGER, device_id TEXT, temp REAL, vib REAL, load INTEGER, units REAL, status TEXT);
CREATE INDEX IF NOT EXISTS ix_snap ON snapshots(device_id, ts);
CREATE TABLE IF NOT EXISTS incidents(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, level TEXT, device_id TEXT, message TEXT);
CREATE INDEX IF NOT EXISTS ix_inc ON incidents(ts);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, device_id TEXT, assignee TEXT,
  priority TEXT, status TEXT, due TEXT, created_ts INTEGER, done_ts INTEGER);
CREATE TABLE IF NOT EXISTS subscribers(chat_id INTEGER PRIMARY KEY, kind TEXT, name TEXT, username TEXT,
  status TEXT DEFAULT 'pending', is_admin INTEGER DEFAULT 0, alerts INTEGER DEFAULT 1, created_ts INTEGER);
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
"""


def conn():
    global _c
    if _c is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _c = sqlite3.connect(DB_PATH, check_same_thread=False)
        _c.row_factory = sqlite3.Row
        _c.execute("PRAGMA journal_mode=WAL")
        _c.executescript(SCHEMA)
        have = {r["name"] for r in _c.execute("PRAGMA table_info(orders)").fetchall()}
        for col, typ in (("est_min", "INTEGER"), ("note", "TEXT"), ("started_ts", "INTEGER"), ("source", "TEXT"), ("ref", "TEXT"), ("kind", "TEXT"),
                         ("stops", "INTEGER DEFAULT 0"), ("fixes", "INTEGER DEFAULT 0"), ("stopped", "INTEGER DEFAULT 0")):
            if col not in have:
                _c.execute(f"ALTER TABLE orders ADD COLUMN {col} {typ}")
        _c.commit()
    return _c


def run(sql, args=()):
    with _lock:
        cur = conn().execute(sql, args)
        conn().commit()
        return cur.lastrowid


def many(sql, rows):
    with _lock:
        conn().executemany(sql, rows)
        conn().commit()


def rows(sql, args=()):
    with _lock:
        return [dict(r) for r in conn().execute(sql, args).fetchall()]


def one(sql, args=()):
    r = rows(sql, args)
    return r[0] if r else None


# ---- телеметрия ----
def add_snapshots(data):
    many("INSERT INTO snapshots VALUES (?,?,?,?,?,?,?)", data)


def count_snapshots():
    return one("SELECT COUNT(*) c FROM snapshots")["c"]


def last_units():
    out = {}
    for r in rows("SELECT device_id, units FROM snapshots WHERE rowid IN (SELECT MAX(rowid) FROM snapshots GROUP BY device_id)"):
        out[r["device_id"]] = r["units"]
    return out


def add_incident(ts, level, device_id, message):
    run("INSERT INTO incidents(ts,level,device_id,message) VALUES (?,?,?,?)", (ts, level, device_id, message))


# ---- настройки (правила автоматики и т.п.) ----
def kv_get(k):
    r = one("SELECT v FROM kv WHERE k=?", (k,))
    return r["v"] if r else None


def kv_set(k, v):
    run("INSERT INTO kv(k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (k, v))


# ---- подписчики ----
def get_sub(chat_id):
    return one("SELECT * FROM subscribers WHERE chat_id=?", (chat_id,))


def upsert_sub(chat_id, kind, name, username, status="pending", is_admin=0, ts=0):
    if get_sub(chat_id):
        run("UPDATE subscribers SET name=?, username=? WHERE chat_id=?", (name, username, chat_id))
    else:
        run("INSERT INTO subscribers(chat_id,kind,name,username,status,is_admin,alerts,created_ts) VALUES (?,?,?,?,?,?,1,?)",
            (chat_id, kind, name, username, status, is_admin, ts))
    return get_sub(chat_id)


def list_subs():
    return rows("SELECT * FROM subscribers ORDER BY created_ts")


def set_sub(chat_id, **kw):
    for k, v in kw.items():
        if k in ("status", "alerts", "is_admin"):
            run(f"UPDATE subscribers SET {k}=? WHERE chat_id=?", (v, chat_id))


def del_sub(chat_id):
    run("DELETE FROM subscribers WHERE chat_id=?", (chat_id,))
