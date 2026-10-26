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


@dataclass
class Usage:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    seconds: float = 0.0
    log: list[dict] = field(default_factory=list)

    @property
    def dollars(self) -> float:
        return (self.input_tokens * PRICE_IN + self.output_tokens * PRICE_OUT) / 1e6

    def add(self, r: Reply, kind: str) -> None:
        self.calls += 1
        self.input_tokens += r.input_tokens
        self.output_tokens += r.output_tokens
        self.seconds += r.seconds
        self.log.append({"kind": kind, "in": r.input_tokens, "out": r.output_tokens, "thinking": r.reasoning_tokens,
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
        body: dict[str, Any] = {"model": self.model, "messages": messages, "max_tokens": max_tokens, "reasoning_effort": effort}
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "required"
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
                 reasoning_tokens=(u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0), seconds=seconds)
