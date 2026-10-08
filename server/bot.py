"""Telegram-бот (aiogram 3, long polling: белый IP и домен не нужны)."""
from __future__ import annotations
import asyncio
import logging
import time
from collections import defaultdict, deque
from aiogram import Bot, Dispatcher, F
from aiogram.enums import ChatAction
from aiogram.filters import Command, CommandStart
from aiogram.types import (BufferedInputFile, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton,
                           Message, ReplyKeyboardMarkup)
from . import agent, ai, db, reports
from .config import ADMIN_PIN, BOT_ENABLED, BOT_TOKEN
from .sim import LAY

log = logging.getLogger("bot")
bot: Bot | None = None
username: str = ""
running = False
sim = None
dp = Dispatcher()
HIST: dict[int, deque] = defaultdict(lambda: deque(maxlen=12))
LAST_ALERT: dict[str, float] = {}

B_REP, B_STAT, B_ALERT, B_HELP = "📊 Отчёт за смену", "📈 Статус завода", "🔔 Уведомления", "❓ Помощь"
MENU = ReplyKeyboardMarkup(keyboard=[[KeyboardButton(text=B_REP), KeyboardButton(text=B_STAT)],
                                     [KeyboardButton(text=B_ALERT), KeyboardButton(text=B_HELP)]], resize_keyboard=True)
SYSTEM = ("Ты — ИИ-ассистент цифрового двойника завода Allur (Костанай, Казахстан). Помогаешь мастеру, оператору и руководству "
          "быстро понять, как дела на производстве. Отвечай кратко и по делу, на языке собеседника (русский / қазақша / English). "
          "Опирайся ТОЛЬКО на данные ниже; если данных не хватает — так и скажи, цифры не выдумывай. Если спрашивают об источнике данных — "
          "сейчас это симулятор (демо). Без markdown-таблиц; коротко, абзацами или списком через дефис.")


def _approved(chat_id):
    s = db.get_sub(chat_id)
    return bool(s and s["status"] == "approved")


def _is_admin(chat_id):
    s = db.get_sub(chat_id)
    return bool(s and s["is_admin"] and s["status"] == "approved")


def _name(u):
    return " ".join(x for x in (u.first_name, u.last_name) if x) or (u.username or str(u.id))


# ------------------------------------------------------------------ команды
@dp.message(CommandStart(), F.chat.type == "private")
async def start(m: Message):
    s = db.upsert_sub(m.chat.id, "private", _name(m.from_user), m.from_user.username or "", ts=int(time.time()))
    if s["status"] == "approved":
        return await m.answer("Привет! Я бот Allur Digital Twin. Выберите действие или просто напишите вопрос — отвечу как ИИ-ассистент.", reply_markup=MENU)
    if s["status"] == "blocked":
        return await m.answer("Доступ закрыт администратором.")
    admins = [x for x in db.list_subs() if x["is_admin"] and x["status"] == "approved"]
    if not admins:
        return await m.answer("Заявка принята, но администратор ещё не назначен.\nЕсли вы администратор — отправьте: /admin ПИН")
    await m.answer("Заявка отправлена администратору. Как только её подтвердят — напишу здесь.")
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✅ Подтвердить", callback_data=f"ap:{m.chat.id}:1"),
                                                InlineKeyboardButton(text="⛔ Отклонить", callback_data=f"ap:{m.chat.id}:0")]])
    for a in admins:
        try:
            await bot.send_message(a["chat_id"], f"Новая заявка на получение отчётов: {s['name']}" + (f" (@{s['username']})" if s["username"] else ""), reply_markup=kb)
        except Exception:
            pass


@dp.message(Command("admin"), F.chat.type == "private")
async def admin(m: Message, command):
    if not ADMIN_PIN:
        return await m.answer("ADMIN_PIN не задан в .env")
    if (command.args or "").strip() != ADMIN_PIN:
        return await m.answer("Неверный PIN.")
    db.upsert_sub(m.chat.id, "private", _name(m.from_user), m.from_user.username or "", ts=int(time.time()))
    db.set_sub(m.chat.id, status="approved", is_admin=1)
    try:
        await m.delete()  # убираем PIN из переписки
    except Exception:
        pass
    await m.answer("Вы назначены администратором ✅", reply_markup=MENU)


@dp.message(Command("subscribe"), F.chat.type.in_({"group", "supergroup"}))
async def sub_group(m: Message):
    if not _is_admin(m.from_user.id):
        return await m.reply("Подключать группу может только администратор бота.")
    db.upsert_sub(m.chat.id, "group", m.chat.title or str(m.chat.id), "", status="approved", ts=int(time.time()))
    db.set_sub(m.chat.id, status="approved")
    await m.reply("Группа подключена: сюда будут приходить отчёты и тревоги ✅")


@dp.message(Command("unsubscribe"), F.chat.type.in_({"group", "supergroup"}))
async def unsub_group(m: Message):
    if _is_admin(m.from_user.id):
        db.del_sub(m.chat.id)
        await m.reply("Группа отключена.")


@dp.callback_query(F.data.startswith("ap:"))
async def approve(c: CallbackQuery):
    if not _is_admin(c.from_user.id):
        return await c.answer("Только для администратора", show_alert=True)
    _, cid, ok = c.data.split(":")
    cid = int(cid)
    db.set_sub(cid, status="approved" if ok == "1" else "blocked")
    await c.message.edit_text(c.message.text + ("\n\n✅ Подтверждено" if ok == "1" else "\n\n⛔ Отклонено"))
    try:
        if ok == "1":
            await bot.send_message(cid, "Доступ подтверждён ✅ Теперь вам доступны отчёты и ИИ-ассистент.", reply_markup=MENU)
        else:
            await bot.send_message(cid, "Администратор отклонил заявку.")
    except Exception:
        pass
    await c.answer()


# ------------------------------------------------------------------ меню
async def _deny(m: Message):
    await m.answer("Доступ ещё не подтверждён. Нажмите /start, чтобы отправить заявку.")


@dp.message(F.text == B_REP, F.chat.type == "private")
async def rep_menu(m: Message):
    if not _approved(m.chat.id):
        return await _deny(m)
    await m.answer("За какую смену сформировать отчёт?", reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Текущая (до сейчас)", callback_data="rs:cur"), InlineKeyboardButton(text="Прошлая", callback_data="rs:prev")]]))


@dp.callback_query(F.data.startswith("rs:"))
async def rep_fmt(c: CallbackQuery):
    w = c.data.split(":")[1]
    await c.message.edit_text("В каком формате?", reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="PDF", callback_data=f"rf:{w}:pdf"), InlineKeyboardButton(text="Excel", callback_data=f"rf:{w}:xlsx"),
        InlineKeyboardButton(text="Word", callback_data=f"rf:{w}:docx"), InlineKeyboardButton(text="Все", callback_data=f"rf:{w}:all")]]))
    await c.answer()


@dp.callback_query(F.data.startswith("rf:"))
async def rep_send(c: CallbackQuery):
    if not _approved(c.message.chat.id):
        return await c.answer("Нет доступа", show_alert=True)
    _, w, f = c.data.split(":")
    await c.answer("Формирую отчёт…")
    await c.message.edit_text("⏳ Формирую отчёт…")
    try:
        await send_reports([c.message.chat.id], w, list(reports.FORMATS) if f == "all" else [f])
        await c.message.delete()
    except Exception as e:
        await c.message.edit_text(f"Не удалось сформировать отчёт: {e}")


@dp.message(F.text == B_STAT, F.chat.type == "private")
async def status(m: Message):
    if not _approved(m.chat.id):
        return await _deny(m)
    p = sim.last if sim else None
    if not p:
        return await m.answer("Данные ещё не поступили.")
    icon = {"OK": "🟢", "WARNING": "🟡", "CRITICAL": "🔴"}
    names = {d["id"]: d["name"] for d in LAY["devices"]}
    lines = [f"{icon[d['status']]} {names[d['device_id']]}: T {d['temperature']}°C, вибр. {d['vibration']}g, загрузка {d['load_percentage']}%" for d in p["devices"]]
    s = p["stats"]
    await m.answer(f"OEE {s['oee']*100:.0f}% · доступность {s['availability']*100:.0f}%\n\n" + "\n".join(lines))


@dp.message(F.text == B_ALERT, F.chat.type == "private")
async def alerts(m: Message):
    s = db.get_sub(m.chat.id)
    if not s or s["status"] != "approved":
        return await _deny(m)
    v = 0 if s["alerts"] else 1
    db.set_sub(m.chat.id, alerts=v)
    await m.answer("Уведомления об авариях " + ("включены 🔔" if v else "выключены 🔕"))


@dp.message(F.text == B_HELP, F.chat.type == "private")
@dp.message(Command("help"), F.chat.type == "private")
async def help_(m: Message):
    await m.answer("📊 Отчёт за смену — PDF / Excel / Word\n📈 Статус завода — живые показатели\n🔔 Уведомления — тревоги об авариях\n"
                   "Любой другой текст — вопрос ИИ-ассистенту («как дела на заводе?», «что с прессом?»).")


@dp.message(F.text, ~F.text.startswith("/"), F.chat.type == "private")
async def chat(m: Message):
    if not _approved(m.chat.id):
        return await _deny(m)
    if not ai.configured():
        return await m.answer("ИИ не настроен: администратору нужно вписать ключ в файл .env")
    await bot.send_chat_action(m.chat.id, ChatAction.TYPING)
    h = HIST[m.chat.id]
    h.append({"role": "user", "content": m.text})
    try:
        # управлять линией из Telegram может только администратор бота; остальные получают ответы по данным
        ans, _ = await agent.ask(sim, list(h), control=_is_admin(m.chat.id))
    except Exception as e:
        h.pop()
        return await m.answer(f"⚠️ {e}")
    h.append({"role": "assistant", "content": ans})
    await m.answer(ans[:4000] or "…")


# ------------------------------------------------------------------ для сервера
async def send_reports(chat_ids, which, fmts, with_ai=True):
    """Сформировать отчёт и отправить в чаты. Возвращает (отправлено, ошибки)."""
    if not running:
        raise RuntimeError("Бот не запущен (проверьте TELEGRAM_BOT_TOKEN в .env)")
    rep, files = await reports.make_files(which, fmts, with_ai)
    t = rep["totals"]
    cap = (f"📊 {rep['shift']}\n{rep['start']} — {rep['end']}" + (" (до сейчас)" if rep["partial"] else "") +
           f"\nВыпуск {t['units']}/{t['plan']} ({t['pct']*100:.0f}%) · OEE {t['oee']*100:.0f}% · простои {t['down_min']} мин")
    sent, errors = 0, []
    for cid in chat_ids:
        try:
            for i, (fn, data) in enumerate(files):
                await bot.send_document(cid, BufferedInputFile(data, filename=fn), caption=cap if i == 0 else None)
            sent += 1
        except Exception as e:
            errors.append({"chat_id": cid, "error": str(e)[:150]})
    return sent, errors


def notify_critical(device_id, message):
    """Вызывается симулятором при аварии: рассылка с защитой от спама (раз в 5 минут на узел)."""
    if not running or time.time() - LAST_ALERT.get(device_id, 0) < 300:
        return
    LAST_ALERT[device_id] = time.time()
    targets = [s["chat_id"] for s in db.list_subs() if s["status"] == "approved" and s["alerts"]]
    asyncio.get_running_loop().create_task(_broadcast("🔴 АВАРИЯ\n" + message, targets))


async def _broadcast(text, targets):
    for cid in targets:
        try:
            await bot.send_message(cid, text)
        except Exception:
            pass


async def run(sim_obj):
    global bot, username, running, sim
    sim = sim_obj
    if not BOT_ENABLED:
        return          # бот выключен (BOT_ENABLED=0 в .env) — тихо, без предупреждений
    if not BOT_TOKEN:
        log.warning("TELEGRAM_BOT_TOKEN не задан — бот отключён")
        return
    try:
        bot = Bot(BOT_TOKEN)
        me = await bot.get_me()
        username, running = me.username or "", True
        await bot.delete_webhook()
        print(f"[bot] запущен: @{username}")
        await dp.start_polling(bot, handle_signals=False)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        running = False
        print(f"[bot] ОШИБКА: {e}\n[bot] Проверьте токен и интернет. Сайт продолжит работать без бота.")
    finally:
        running = False
        if bot:
            await bot.session.close()
