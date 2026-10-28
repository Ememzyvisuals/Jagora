"""Fewer tokens per step: rare tools only when the task can use them, the screenshot only when the text is not
enough, and a question gets a fixed number of steps."""

import json
from types import SimpleNamespace

from jagora import agent as A


def bare(goal: str) -> A.Agent:
    ag = A.Agent.__new__(A.Agent)
    ag._goal, ag.conversation, ag.files, ag._fails, ag._heard_all, ag.lang = goal, [], [], 0, [], "en"
    ag._want_look, ag._last_fp_same, ag._changed_any, ag.max_turns = False, False, False, 80
    return ag


def names(tools):
    return {t["function"]["name"] for t in tools}


def test_a_question_gets_the_lean_tool_list():
    q = bare("when is jamb 2027 registration")
    lean = q._lean(A.DO_TOOLS, None)
    assert len(json.dumps(lean)) < len(json.dumps(A.DO_TOOLS)) * 0.6
    assert {"search", "go_to", "read_page", "tell_user", "finish", "look"} <= names(lean)
    assert not {"schedule_task", "drag", "write_document", "play_media"} & names(lean)
    assert "play_media" in names(bare("play me a movie trailer")._lean(A.DO_TOOLS, None))
    assert "set_reminder" in names(bare("remind me tomorrow to pay")._lean(A.DO_TOOLS, None))


def test_screenshot_only_when_needed_and_questions_have_a_step_cap():
    q = bare("when is jamb 2027 registration")
    wordy = SimpleNamespace(text="x" * 2000, elements=[None] * 30)
    bare_page = SimpleNamespace(text="", elements=[])
    assert not q._needs_picture(wordy)
    assert q._needs_picture(bare_page)
    q._fails = 1
    assert q._needs_picture(wordy)
    assert bare("show me the map of lagos")._needs_picture(wordy)
    assert q._cap() == A.Agent.QUESTION_STEPS
    q._changed_any = True
    assert q._cap() == 80
