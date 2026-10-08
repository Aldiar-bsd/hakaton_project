"""Защита секретов: ключи и токены не должны попадать в тексты ошибок, логи и ответы сайта."""
from __future__ import annotations
import re
from . import config as cfg

_PATTERNS = [
    r"sk-ant-[A-Za-z0-9_\-]{8,}",                       # Anthropic
    r"AIza[A-Za-z0-9_\-]{20,}",                         # Google / Gemini (старый вид)
    r"\bAQ\.[A-Za-z0-9_\-]{20,}",                       # Google / Gemini (новый вид)
    r"\b\d{8,10}:[A-Za-z0-9_\-]{30,}\b",                # токен Telegram-бота
    r"(?i)(x-api-key|x-goog-api-key|authorization)\s*[:=]\s*\S+",
]


def redact(text) -> str:
    """Заменяет на *** всё, что похоже на ключ, и точные значения ключей из настроек."""
    t = str(text)
    for secret in (cfg.AI_API_KEY, cfg.BOT_TOKEN):
        if secret and len(secret) >= 8:
            t = t.replace(secret, "***")
    for p in _PATTERNS:
        t = re.sub(p, "***", t)
    return t


def mask(secret: str) -> str:
    """Для показа в интерфейсе: только последние 4 символа."""
    return ("•" * 8 + secret[-4:]) if secret and len(secret) > 8 else ""
