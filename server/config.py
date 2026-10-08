"""Настройки из .env"""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def env(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


def env_float(key: str, default: float) -> float:
    try:
        return float(env(key, str(default)))
    except ValueError:
        return default


BOT_ENABLED = env("BOT_ENABLED", "0") == "1"   # Telegram-бот выключен, пока в .env не стоит BOT_ENABLED=1
BOT_TOKEN = env("TELEGRAM_BOT_TOKEN")
ADMIN_PIN = env("ADMIN_PIN")
AI_PROVIDER = env("AI_PROVIDER", "none").lower()
AI_API_KEY = env("AI_API_KEY")
OLLAMA_HOST = env("OLLAMA_HOST", "http://localhost:11434")


def _key_from_file() -> str:
    """Ключ из файла API_KEY.txt в корне проекта: первая непустая строка без «#». Нужен, чтобы вставить ключ в одно место."""
    try:
        for ln in (ROOT / "API_KEY.txt").read_text(encoding="utf-8-sig").splitlines():
            ln = ln.strip().strip("\"'")
            if ln and not ln.startswith("#"):
                return ln
    except OSError:
        pass
    return ""


def _detect_provider(key: str) -> str:
    return "gemini" if key.startswith(("AIza", "AQ.")) else "anthropic"      # Google: старый вид AIza…, новый AQ.…


if not AI_API_KEY and _key_from_file():                 # ключ из API_KEY.txt; сервис определяется по виду ключа
    AI_API_KEY = _key_from_file()
    AI_PROVIDER = _detect_provider(AI_API_KEY)
DEFAULT_MODELS = {"anthropic": "claude-sonnet-5-5", "gemini": "gemini-flash-lite-latest", "ollama": "llama3.2"}
AI_MODEL = env("AI_MODEL") or DEFAULT_MODELS.get(AI_PROVIDER, "")

def set_ai(provider: str, api_key: str | None = None, model: str | None = None):
    """Сохраняет настройки ИИ в файл .env и сразу применяет их (перезапуск не нужен).
    api_key=None — ключ не менять. Ключ нигде, кроме .env, не хранится."""
    global AI_PROVIDER, AI_API_KEY, AI_MODEL
    import re
    clean = lambda v, n: re.sub(r"[\x00-\x1f\x7f\s]", "", str(v))[:n]        # без переводов строк, пробелов и управляющих символов
    provider = str(provider).strip().lower()
    provider = provider if provider in ("anthropic", "gemini", "ollama", "none") else "none"
    updates = {"AI_PROVIDER": provider}
    if api_key is not None:
        api_key = clean(api_key, 400)
        updates["AI_API_KEY"] = api_key
        if not api_key:                                   # «Удалить ключ»: убираем и из API_KEY.txt, иначе он вернётся после перезапуска
            try:
                kf = ROOT / "API_KEY.txt"
                if kf.exists():
                    kf.write_text("\n".join(ln for ln in kf.read_text(encoding="utf-8-sig").splitlines() if ln.strip().startswith("#") or not ln.strip()) + "\n", encoding="utf-8")
            except OSError:
                pass
    if model is not None:
        model = re.sub(r"[^A-Za-z0-9._:/\-]", "", str(model))[:80]
        updates["AI_MODEL"] = model
    path = ROOT / ".env"
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    done = set()
    for i, ln in enumerate(lines):
        k = ln.split("=", 1)[0].strip()
        if k in updates and not ln.lstrip().startswith("#"):
            lines[i] = f"{k}={updates[k]}"
            done.add(k)
    lines += [f"{k}={v}" for k, v in updates.items() if k not in done]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    AI_PROVIDER = provider
    if api_key is not None:
        AI_API_KEY = api_key
    AI_MODEL = (model if model is not None else AI_MODEL) or DEFAULT_MODELS.get(provider, "")


SHIFT_START = env("SHIFT_START", "08:00")
SHIFT_HOURS = int(env_float("SHIFT_HOURS", 8))
if SHIFT_HOURS not in (6, 8, 12):
    SHIFT_HOURS = 8
SHIFT_COUNT = int(env_float("SHIFT_COUNT", 2))      # по условию кейса: 2 смены по 8 часов
if not 1 <= SHIFT_COUNT <= 24 // SHIFT_HOURS:
    SHIFT_COUNT = 2 if SHIFT_HOURS <= 12 else 1
SIM_SPEED = env_float("SIM_SPEED", 1.0)
ORDER_TIME_SCALE = max(1.0, env_float("ORDER_TIME_SCALE", 60.0))   # 1 сек = N минут работ по наряду (демо ×60; 1 = реальное время)
SEED_DEMO = env("SEED_DEMO", "1") == "1"
HOST = env("HOST", "127.0.0.1")
PORT = int(env_float("PORT", 8000))

DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "allur.db"
WEB_DIR = ROOT / "web"
FONT_DIR = Path(__file__).resolve().parent / "fonts"
SNAP_EVERY = 30  # секунд между записями телеметрии в базу
