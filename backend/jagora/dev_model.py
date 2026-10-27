"""A scripted stand-in for Muse Spark, for running the whole app locally without an API key (JAGORA_DEV_MODEL=1).
It walks a school site served at JAGORA_DEV_SITE: plan, open the admissions page, find the brochure, open the PDF,
highlight the subject line as evidence, set a reminder, download the brochure, finish. Never used in production."""

from __future__ import annotations

import asyncio
import datetime as dt
import os

from jagora.llm import Model, Reply, ToolCall, Usage


class DevModel(Model):
    def __init__(self) -> None:
        self.base = os.environ.get("JAGORA_DEV_SITE", "http://127.0.0.1:8765")
        self.turn, self.usage = 0, Usage()
        self.pause = float(os.environ.get("JAGORA_DEV_PAUSE", "2.5"))

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        await asyncio.sleep(self.pause)
        b = self.base
        soon = (dt.datetime.now(dt.timezone(dt.timedelta(hours=1))) + dt.timedelta(days=30)).replace(hour=9, minute=0).isoformat()
        steps = ["Find the official brochure", "Confirm the subject combination", "Set a reminder", "Save the brochure for you"]

        def plan(k):
            return ("update_plan", {"steps": [{"text": t, "status": "done" if i < k else "doing" if i == k else "todo"} for i, t in enumerate(steps)]})

        script = [
            [("tell_user", {"message": "Let me check UNILAG's official admission brochure for Computer Science."}), plan(0),
             ("go_to", {"url": b + "/admissions.html", "step": "Opening UNILAG admissions"})],
            [("list_links", {"match": "brochure"})],
            [("go_to", {"url": b + "/files/brochure-2026.pdf", "step": "Opening the 2026/2027 brochure"})],
            [("find_text", {"query": "UTME subjects"})],
            [plan(1), ("show_evidence", {"quote": "English Language, Mathematics, Physics", "near_page": 2,
                                         "claim": "Your UTME subjects: English, Mathematics, Physics and one of Chemistry, Biology, Economics or Geography."})],
            [plan(2), ("set_reminder", {"when": soon, "text": "Start JAMB registration for Computer Science at UNILAG"})],
            [plan(3), ("download", {"name": "UNILAG admission brochure 2026"})],
            [plan(4), ("finish", {"summary": "Done. Use English, Mathematics, Physics and one of Chemistry, Biology, Economics or Geography. "
                                             "I saved the brochure and set a reminder.", "success": True})],
        ]
        calls = script[min(self.turn, len(script) - 1)]
        self.turn += 1
        r = Reply("", [ToolCall(str(i), n, a) for i, (n, a) in enumerate(calls)], "tool_calls", 0, 0)
        self.usage.add(r, kind)
        return r
