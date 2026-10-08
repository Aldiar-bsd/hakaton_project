#!/usr/bin/env bash
# Linux / macOS / сервер:  ./start.sh
cd "$(dirname "$0")"
[ -f .env ] || { cp .env.example .env; echo "Создан файл настроек .env (бот выключен)"; }
[ -d .venv ] || python3 -m venv .venv
[ -f .venv/.deps_ok ] || { .venv/bin/pip install -q -r requirements.txt && touch .venv/.deps_ok; }
exec .venv/bin/python -m server.main
