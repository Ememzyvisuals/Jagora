"""Muse Spark on the Meta Model API (OpenAI-compatible Chat Completions), with screenshots and tool calling.

Muse Spark thinks before it answers, and that thinking counts toward max_tokens. Every call therefore gets
room for thinking plus the answer, and the thinking effort is set per call: "minimal" for quick spoken
replies, "low" for the agent's decisions (measured on the API: minimal answered in about 2.3 s).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from jagora.config import settings

log = logging.getLogger("jagora.llm")

# USD per million tokens for muse-spark-1.3 (Meta Model API pricing)
PRICE_IN, PRICE_OUT = 1.25, 4.25
PRICE_CACHED = 0.15  # input the provider already holds from an earlier call with the same beginning (88% cheaper)

# Does the provider reuse the unchanging start of each call (system part and tool list)? Learned from real calls:
# None until known. When it does, Jagora keeps that start identical on every step; when it does not, it trims tools.
CACHE = {"works": None, "seen": 0, "hits": 0}


class LLMError(Exception):
    pass


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


@dataclass
class Reply:
    text: str
    calls: list[ToolCall]
    finish: str
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    seconds: float = 0.0
    cached_tokens: int = 0


@dataclass
class Usage:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    seconds: float = 0.0
    log: list[dict] = field(default_factory=list)

    @property
    def dollars(self) -> float:
        fresh = max(0, self.input_tokens - self.cached_tokens)
        return (fresh * PRICE_IN + self.cached_tokens * PRICE_CACHED + self.output_tokens * PRICE_OUT) / 1e6

    def add(self, r: Reply, kind: str) -> None:
        self.calls += 1
        self.input_tokens += r.input_tokens
        self.cached_tokens += r.cached_tokens
        self.output_tokens += r.output_tokens
        if kind == "agent" and r.input_tokens > 4000:
            CACHE["seen"] += 1
            CACHE["hits"] += 1 if r.cached_tokens > 4000 else 0
            if CACHE["seen"] >= 12:
                # judged on the last dozen calls, again and again: a cache that starts working is used from then on
                was = CACHE["works"]
                CACHE["works"] = CACHE["hits"] >= 3
                CACHE["seen"] = CACHE["hits"] = 0
                if was != CACHE["works"]:
                        log.info("provider prompt cache %s", "WORKS: keeping the start of every call identical" if CACHE["works"]
                             else "not seen: trimming tools instead")
        self.seconds += r.seconds
        self.log.append({"kind": kind, "in": r.input_tokens, "cached": r.cached_tokens, "out": r.output_tokens, "thinking": r.reasoning_tokens,
                         "seconds": round(r.seconds, 2)})


def image_part(jpeg_b64: str) -> dict:
    return {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{jpeg_b64}"}}


def tool(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {"type": "function", "function": {"name": name, "description": description,
                                             "parameters": {"type": "object", "properties": properties, "required": required}}}


class Model:
    """The interface the agent needs; MuseSpark is the real one, tests use a scripted one."""

    usage: Usage

    async def chat(self, messages: list[dict], tools: list[dict] | None = None, effort: str = "low",
                   max_tokens: int = 4000, kind: str = "agent") -> Reply:  # pragma: no cover
        raise NotImplementedError


class MuseSpark(Model):
    def __init__(self, model: str | None = None) -> None:
        if not settings.meta_key:
            raise LLMError("META_API_KEY is not set (backend/.env)")
        import openai

        self.model = model or settings.meta_model
        self.client = openai.AsyncOpenAI(api_key=settings.meta_key, base_url=settings.meta_base_url, timeout=60, max_retries=2)
        self.usage = Usage()

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent") -> Reply:
        body: dict[str, Any] = {"model": self.model, "messages": messages, "max_tokens": max_tokens,
                                # the same key for calls that start the same way: Meta then sends them to the machine that
                                # already holds that start, so it is reused (cheaper, quicker) instead of read again
                                "extra_body": {"prompt_cache_key": f"jagora-{kind}"}}
        if not getattr(self, "open_weights", False):
            body["reasoning_effort"] = effort  # Muse Spark and Wonder think; open-weight servers may not take this
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"  # Muse Spark only accepts "auto"; replies without a tool are handled by the agent
        last: Exception | None = None
        for attempt in range(3):
            t0 = time.monotonic()
            try:
                r = (await self.client.chat.completions.create(**body)).model_dump()
            except Exception as e:  # noqa: BLE001
                last = e
                log.warning("Muse Spark call failed (attempt %d): %s", attempt + 1, e)
                await asyncio.sleep(1.0 * (attempt + 1))
                continue
            reply = parse(r, time.monotonic() - t0)
            if reply.finish == "length" and not reply.calls and not reply.text:
                # all the room went to thinking: give it more and ask again
                body["max_tokens"] = int(body["max_tokens"] * 2)
                log.warning("Muse Spark used all %d tokens thinking; retrying with more room", max_tokens)
                continue
            self.usage.add(reply, kind)
            return reply
        raise LLMError(str(last or "Muse Spark returned no answer"))


def parse(r: dict, seconds: float) -> Reply:
    choice = (r.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    calls = []
    for c in msg.get("tool_calls") or []:
        fn = c.get("function") or {}
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except ValueError:
            args = {"_unparsed": fn.get("arguments")}
        calls.append(ToolCall(c.get("id", ""), fn.get("name", ""), args))
    u = r.get("usage") or {}
    return Reply(text=msg.get("content") or "", calls=calls, finish=choice.get("finish_reason") or "",
                 input_tokens=u.get("prompt_tokens", 0), output_tokens=u.get("completion_tokens", 0),
                 reasoning_tokens=(u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0), seconds=seconds,
                 cached_tokens=int((u.get("prompt_tokens_details") or {}).get("cached_tokens") or u.get("cached_tokens") or 0))
