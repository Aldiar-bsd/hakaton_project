"""ИИ-провайдеры: anthropic | gemini | ollama. Ключ берётся из .env, в браузер не уходит."""
from __future__ import annotations
import json
import re
import httpx
from . import config as cfg
from .secure import redact


class AIError(Exception):
    pass


def configured() -> bool:
    if cfg.AI_PROVIDER == "ollama":
        return True
    return cfg.AI_PROVIDER in ("anthropic", "gemini") and bool(cfg.AI_API_KEY)


async def complete(system: str, messages: list[dict], image_b64: str | None = None,
                   max_tokens: int = 900, json_mode: bool = False, timeout: float = 60) -> str:
    """messages: [{'role':'user'|'assistant','content':str}]. Картинка прикрепляется к последнему user-сообщению."""
    if not configured():
        raise AIError("ИИ не настроен: впишите cfg.AI_PROVIDER и cfg.AI_API_KEY в файл .env")
    messages = [m for m in messages if m.get("content")]
    if not messages or messages[-1]["role"] != "user":
        raise AIError("Нет вопроса")
    async with httpx.AsyncClient(timeout=timeout) as cx:
        try:
            if cfg.AI_PROVIDER == "anthropic":
                return await _anthropic(cx, system, messages, image_b64, max_tokens)
            if cfg.AI_PROVIDER == "gemini":
                return await _gemini(cx, system, messages, image_b64, max_tokens, json_mode)
            return await _ollama(cx, system, messages, image_b64, json_mode)
        except httpx.HTTPStatusError as e:
            body = e.response.text[:300]
            raise AIError(redact(f"Ошибка ИИ-сервиса ({e.response.status_code}): {body}"))
        except httpx.HTTPError as e:
            raise AIError(redact(f"Нет связи с ИИ-сервисом: {e or type(e).__name__}"))


async def _anthropic(cx, system, messages, img, max_tokens):
    msgs = []
    for i, m in enumerate(messages):
        c = m["content"]
        if img and i == len(messages) - 1:
            c = [{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img}},
                 {"type": "text", "text": c}]
        msgs.append({"role": m["role"], "content": c})
    r = await cx.post("https://api.anthropic.com/v1/messages",
                      headers={"x-api-key": cfg.AI_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                      json={"model": cfg.AI_MODEL, "max_tokens": max_tokens, "system": system, "messages": msgs})
    r.raise_for_status()
    return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text").strip()


_GURL = "https://generativelanguage.googleapis.com/v1beta"


async def _gemini_pick(cx):
    """Находит самую новую Gemini Flash, доступную этому ключу (если выбранную модель Google выключил)."""
    import re
    r = await cx.get(f"{_GURL}/models?pageSize=200", headers={"x-goog-api-key": cfg.AI_API_KEY})
    if r.status_code != 200:
        return None
    best, bv = None, (-1.0,)
    for m in r.json().get("models", []):
        n = m.get("name", "").replace("models/", "")
        if "flash" not in n or "generateContent" not in m.get("supportedGenerationMethods", []):
            continue
        if re.search(r"lite|image|tts|live|audio|embed|thinking|exp|vision|robotics", n):
            continue
        v = re.search(r"gemini-(\d+(?:\.\d+)?)", n)
        score = (0 if "preview" in n else 1, float(v.group(1)) if v else 0.0)      # стабильная версия важнее preview
        if score > bv:
            best, bv = n, score
    return best


TRANSIENT = (429, 500, 502, 503, 504)           # временные ошибки сервиса: «перегружен», «слишком много запросов»
# запасные модели: «lite» отвечают за 1–2 с, когда полноразмерные перегружены
GEMINI_FALLBACKS = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-flash-latest"]
HEDGE_S = 3.5            # основная модель молчит дольше — параллельно спрашиваем следующую, берём ту, что ответит первой


def _gemini_usable(r) -> bool:
    """Ответ 200, но пустой (бывает у «lite»), нам не подходит: нужен текст или вызов инструмента."""
    try:
        c = (r.json().get("candidates") or [{}])[0]
        return any((p.get("text") or "").strip() or "functionCall" in p for p in (c.get("content") or {}).get("parts", []))
    except ValueError:
        return False


async def _gemini_post(cx, payload):
    """Запрос к Gemini «наперегонки»: сначала выбранная модель; если она не ответила за HEDGE_S секунд, перегружена или вернула пустой
    ответ — сразу подключается следующая (первая модель при этом не отменяется), побеждает первый нормальный ответ.
    Так ответ не ждёт зависшую модель. Навсегда модель меняется только если Google её выключил (404)."""
    import asyncio
    h = {"x-goog-api-key": cfg.AI_API_KEY, "content-type": "application/json"}
    chain = list(dict.fromkeys([cfg.AI_MODEL] + GEMINI_FALLBACKS))

    async def one(m):
        return m, await cx.post(f"{_GURL}/models/{m}:generateContent", headers=h, json=payload, timeout=25)

    pending, names, nxt, last, gone = set(), {}, 0, None, False

    def launch():
        nonlocal nxt
        if nxt >= len(chain):
            return False
        t = asyncio.create_task(one(chain[nxt]))
        pending.add(t)
        names[t] = chain[nxt]
        nxt += 1
        return True

    launch()
    try:
        while pending:
            done, _ = await asyncio.wait(pending, timeout=HEDGE_S if nxt < len(chain) else None, return_when=asyncio.FIRST_COMPLETED)
            if not done:                                  # основная модель тянет время — запускаем запасную параллельно
                launch()
                continue
            for t in done:
                pending.discard(t)
                try:
                    m, r = t.result()
                except httpx.HTTPError as e:              # таймаут / обрыв связи
                    last = e
                    continue
                if r.status_code == 200 and _gemini_usable(r):
                    if gone and m != cfg.AI_MODEL:
                        cfg.AI_MODEL = m                  # выбранной модели больше нет — запоминаем рабочую
                    return r
                last = r
                if r.status_code == 404 and names[t] == chain[0]:
                    gone = True
                if r.status_code not in TRANSIENT and r.status_code not in (200, 404):
                    r.raise_for_status()                  # неверный ключ, отказ в доступе — сменой модели не лечится
            if not pending:                               # все запущенные не справились — пробуем следующую
                launch()
    finally:
        for t in pending:
            t.cancel()
    if isinstance(last, httpx.Response):
        if last.status_code == 200:
            raise httpx.HTTPError("ИИ вернул пустой ответ")
        last.raise_for_status()
    raise last or httpx.HTTPError("Нет ответа от ИИ")


async def _gemini(cx, system, messages, img, max_tokens, json_mode):
    contents = []
    for i, m in enumerate(messages):
        parts = [{"text": m["content"]}]
        if img and i == len(messages) - 1:
            parts.insert(0, {"inlineData": {"mimeType": "image/jpeg", "data": img}})
        contents.append({"role": "model" if m["role"] == "assistant" else "user", "parts": parts})
    gcfg = {"maxOutputTokens": max(max_tokens, 2048)}      # «думающие» модели тратят часть лимита на рассуждение — иначе ответ обрывается
    if json_mode:
        gcfg["responseMimeType"] = "application/json"
    r = await _gemini_post(cx, {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents, "generationConfig": gcfg})
    cand = (r.json().get("candidates") or [{}])[0]
    return "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", [])).strip()


async def _ollama(cx, system, messages, img, json_mode):
    msgs = [{"role": "system", "content": system}]
    for i, m in enumerate(messages):
        x = {"role": m["role"], "content": m["content"]}
        if img and i == len(messages) - 1:
            x["images"] = [img]
        msgs.append(x)
    body = {"model": cfg.AI_MODEL, "messages": msgs, "stream": False}
    if json_mode:
        body["format"] = "json"
    r = await cx.post(f"{cfg.OLLAMA_HOST}/api/chat", json=body)
    r.raise_for_status()
    return r.json().get("message", {}).get("content", "").strip()


# ------------------------------------------------------------------ агент: ИИ вызывает инструменты
def _as_history(messages):
    """Обычные сообщения -> формат выбранного провайдера (дальше в него дописываются вызовы инструментов)."""
    if cfg.AI_PROVIDER == "gemini":
        return [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in messages]
    return [{"role": m["role"], "content": m["content"]} for m in messages]


async def _agent_step(cx, system, history, tools, max_tokens):
    """Один запрос к модели -> (текст, [вызовы], сообщение_ассистента). Вызов: {id, name, args}."""
    if cfg.AI_PROVIDER == "anthropic":
        r = await cx.post("https://api.anthropic.com/v1/messages",
                          headers={"x-api-key": cfg.AI_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                          json={"model": cfg.AI_MODEL, "max_tokens": max_tokens, "system": system, "messages": history,
                                "tools": [{"name": t["name"], "description": t["description"], "input_schema": t["schema"]} for t in tools]})
        r.raise_for_status()
        blocks = r.json().get("content", [])
        return ("".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip(),
                [{"id": b["id"], "name": b["name"], "args": b.get("input") or {}} for b in blocks if b.get("type") == "tool_use"],
                {"role": "assistant", "content": blocks})
    if cfg.AI_PROVIDER == "gemini":
        r = await _gemini_post(cx, {"systemInstruction": {"parts": [{"text": system}]}, "contents": history,
                                    "tools": [{"functionDeclarations": [{"name": t["name"], "description": t["description"], "parameters": t["schema"]} for t in tools]}],
                                    "generationConfig": {"maxOutputTokens": max(max_tokens, 2048)}})
        content = ((r.json().get("candidates") or [{}])[0].get("content")) or {"role": "model", "parts": []}
        content.setdefault("role", "model")
        parts = content.get("parts", [])
        return ("".join(p.get("text", "") for p in parts if "text" in p).strip(),
                [{"id": str(i), "name": p["functionCall"]["name"], "args": p["functionCall"].get("args") or {}}
                 for i, p in enumerate(parts) if "functionCall" in p], content)
    r = await cx.post(f"{cfg.OLLAMA_HOST}/api/chat",
                      json={"model": cfg.AI_MODEL, "stream": False, "messages": [{"role": "system", "content": system}] + history,
                            "tools": [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["schema"]}} for t in tools]})
    r.raise_for_status()
    msg = r.json().get("message", {})
    calls = [{"id": str(i), "name": c["function"]["name"], "args": c["function"].get("arguments") or {}} for i, c in enumerate(msg.get("tool_calls") or [])]
    return (msg.get("content") or "").strip(), calls, msg


def _agent_results(calls, results):
    """Результаты инструментов -> сообщения для истории (формат провайдера)."""
    if cfg.AI_PROVIDER == "anthropic":
        return [{"role": "user", "content": [{"type": "tool_result", "tool_use_id": c["id"], "content": res} for c, res in zip(calls, results)]}]
    if cfg.AI_PROVIDER == "gemini":
        return [{"role": "user", "parts": [{"functionResponse": {"name": c["name"], "response": {"result": res}}} for c, res in zip(calls, results)]}]
    return [{"role": "tool", "tool_name": c["name"], "content": res} for c, res in zip(calls, results)]


async def run_agent(system: str, messages: list[dict], tools: list[dict], call_tool, max_steps: int = 6,
                    max_tokens: int = 900, timeout: float = 60, step=None):
    """ИИ-агент: модель сама решает, какие инструменты вызвать (tools: [{name, description, schema}]),
    call_tool(name, args) -> str выполняет их. Возвращает (итоговый_текст, [{tool, args, result}])."""
    if not configured():
        raise AIError("ИИ не настроен: впишите cfg.AI_PROVIDER и cfg.AI_API_KEY в файл .env")
    messages = [m for m in messages if m.get("content")]
    if not messages or messages[-1]["role"] != "user":
        raise AIError("Нет вопроса")
    history, actions, text = _as_history(messages), [], ""
    async with httpx.AsyncClient(timeout=timeout) as cx:
        try:
            for _ in range(max_steps):
                text, calls, asst = await (step or _agent_step)(cx, system, history, tools, max_tokens)
                if not calls:
                    return text, actions
                history.append(asst)
                results = []
                for c in calls:
                    try:
                        res = str(await call_tool(c["name"], c["args"]))
                    except Exception as e:           # ошибку инструмента отдаём модели — она объяснит человеку
                        res = f"Ошибка: {e}"
                    results.append(res)
                    actions.append({"tool": c["name"], "args": c["args"], "result": res})
                history.extend(_agent_results(calls, results))
        except httpx.HTTPStatusError as e:
            raise AIError(redact(f"Ошибка ИИ-сервиса ({e.response.status_code}): {e.response.text[:300]}"))
        except httpx.HTTPError as e:
            raise AIError(redact(f"Нет связи с ИИ-сервисом: {e or type(e).__name__}"))
    return text or "Не удалось завершить за отведённое число шагов — уточните запрос.", actions


def parse_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        return json.loads(text)
    except ValueError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise AIError("ИИ вернул ответ не в формате JSON")
