"""Her voice on LiveKit (voice/agent.py, built like Kivo's voice agent): the worker passes her finished turns to the
server and speaks what Jagora says. What it hears shows in the chat while she talks, "stop" while Jagora talks goes
quiet at once, and Jagora's words go to the LiveKit voice instead of the phone's own audio."""

import asyncio
import json

from jagora import server
from tests.test_interrupt import WS


class VoiceWS(WS):
    """The worker's end of the voice link."""


async def test_her_turns_come_in_and_jagoras_words_go_out(monkeypatch):
    monkeypatch.setattr(server.speech, "enabled", lambda: True)
    got = []

    async def words(task, text, attachment, history):
        got.append((task, text))

    s = server.Session(WS(), "u1")
    monkeypatch.setattr(s, "on_words", words)
    monkeypatch.setattr(server, "TURN_GAP", 0.02)
    s.active_task = "chat1"
    v = VoiceWS()
    s.attach_voice(v)
    await asyncio.sleep(0.05)
    assert {"type": "lang", "lang": s.lang} in v.out

    # what it hears appears in her chat as she speaks, then becomes her message and is answered
    await s.on_voice({"type": "partial", "text": "read the"})
    await s.on_voice({"type": "partial", "text": "read the news"})
    await s.on_voice({"type": "words", "text": "read the news to me"})
    await asyncio.sleep(0.08)  # she has finished
    msgs = [m for m in s.ws.out if m.get("type") in ("msg", "update")]
    bubble = msgs[0]["msg"]["id"]
    assert msgs[0]["msg"]["text"] == "read the" and msgs[1]["patch"]["text"] == "read the news"
    assert any(m.get("id") == bubble and m.get("patch", {}).get("text") == "read the news to me" for m in msgs)
    assert got == [("chat1", "read the news to me")]

    # Jagora speaks through LiveKit, not the phone's own audio
    s.speak("chat1", "Here is the **news**: [BBC](https://bbc.com) says it rained.")
    await asyncio.sleep(0.1)
    says = [m for m in v.out if m["type"] == "say"]
    assert says and says[0]["text"] == "Here is the news: BBC says it rained."
    assert not any(m.get("type") == "pcm" for m in s.ws.out)
    s._speaker.cancel()


async def test_stop_while_jagora_talks_goes_quiet_at_once(monkeypatch):
    monkeypatch.setattr(server.speech, "enabled", lambda: True)
    s = server.Session(WS(), "u1")
    s.active_task = "chat1"
    r = server.Run("chat1")
    r.job = asyncio.create_task(asyncio.sleep(5))
    s.runs["chat1"] = r
    v = VoiceWS()
    s.attach_voice(v)
    await s.on_voice({"type": "state", "agent": "speaking"})
    await s.on_voice({"type": "partial", "text": "stop"})
    await asyncio.sleep(0.05)
    assert any(m["type"] == "hush" for m in v.out)  # the LiveKit voice is cut off
    assert r.job.cancelled() or r.job.done()  # and the task stops
    assert any(m.get("type") == "status" and m.get("status") == "stopped" for m in s.ws.out)
    s._speaker.cancel()


def test_the_room_token_sends_jagoras_voice_in(monkeypatch):
    from fastapi.testclient import TestClient

    s = server.settings
    object.__setattr__(s, "livekit_key", "APIkey")
    object.__setattr__(s, "livekit_secret", "secret")
    object.__setattr__(s, "livekit_url", "wss://x.livekit.cloud")
    object.__setattr__(s, "voice_link_secret", "link")
    monkeypatch.setattr(server, "_user_from", lambda req: "user-123456789012")
    c = TestClient(server.app)
    d = c.post("/livekit/token", json={"lang": "yo"}, headers={"Authorization": "Bearer x"}).json()
    import base64
    body = json.loads(base64.urlsafe_b64decode(d["token"].split(".")[1] + "=="))
    agent = body["roomConfig"]["agents"][0]
    assert agent["agentName"] == "jagora-voice" and json.loads(agent["metadata"]) == {"uid": "user-123456789012", "lang": "yo"}
    assert body["video"]["roomJoin"] and d["voice"] is True
    for k in ("livekit_key", "livekit_secret", "livekit_url", "voice_link_secret"):
        object.__setattr__(s, k, "")


async def test_the_voice_listens_in_the_language_she_chose(monkeypatch):
    s = server.Session(WS(), "u1")
    v = VoiceWS()
    s.attach_voice(v)
    await s.handle({"type": "focus", "task": "chat1", "lang": "yo"})
    assert s.lang == "yo" and v.out[-1] == {"type": "lang", "lang": "yo"}
    assert s.active_task == "chat1"
    s._speaker.cancel()


async def test_a_thought_said_with_pauses_is_one_message(monkeypatch):
    # the voice sends pieces at each pause; Jagora answers once, with everything, when she has finished
    s = server.Session(WS(), "u1")
    s.active_task = "t"
    got = []

    async def heard(task, msg_id, text, lang, history):
        got.append(text)

    monkeypatch.setattr(s, "heard", heard)
    monkeypatch.setattr(server, "TURN_GAP", 0.05)
    await s.on_voice({"type": "words", "text": "ẹ jọ̀ọ́ ẹ bá mi wo"})
    await s.on_voice({"type": "user", "state": "speaking"})  # she carries on
    await asyncio.sleep(0.1)
    assert got == []
    await s.on_voice({"type": "words", "text": "ọjọ́ ìdìbò Nàìjíríà"})
    await asyncio.sleep(0.15)
    assert got == ["ẹ jọ̀ọ́ ẹ bá mi wo ọjọ́ ìdìbò Nàìjíríà"]
    bubbles = [m for m in s.ws.out if m.get("type") == "msg" and m["msg"].get("kind") == "user"]
    assert len(bubbles) == 1  # one bubble, updated as it grew


async def test_words_showing_are_answered_when_the_voice_does_not_end_her_turn(monkeypatch):
    s = server.Session(WS(), "u1")
    s.active_task = "t"
    got = []

    async def heard(task, msg_id, text, lang, history):
        got.append(text)

    monkeypatch.setattr(s, "heard", heard)
    monkeypatch.setattr(server, "TURN_GAP", 0.0)
    await s.on_voice({"type": "partial", "text": "when is jamb registration"})
    s._flush_later("t", 0)
    await asyncio.sleep(0.05)
    assert got == ["when is jamb registration"]


async def test_words_not_meant_for_jagora_do_nothing_and_say_again_is_never_repeated(monkeypatch):
    s = server.Session(WS(), "u1")
    s.active_task = "t"
    got = []

    async def heard(task, msg_id, text, lang, history):
        got.append(text)

    verdicts = iter(["ignore", "unclear", "unclear"])

    async def gate(task, text):
        return next(verdicts)

    said = []

    async def says(task, text):
        said.append(text)

    monkeypatch.setattr(s, "heard", heard)
    monkeypatch.setattr(s, "_gate", gate)
    monkeypatch.setattr(s, "agent_says", says)
    for words in ("ẹ ṣé o ti ń wo fíìmù", "kanye mi lo", "graph to nono so"):
        await s.on_voice({"type": "words", "text": words})
        await s._flush_turn("t", 0)
    assert got == []
    assert len(said) == 1  # asked to say it again once, not every time


async def test_late_turn_end_is_not_a_second_message_and_using_the_app_means_looking(monkeypatch):
    s = server.Session(WS(), "u1")
    s.active_task = "t"
    got = []

    async def heard(task, msg_id, text, lang, history):
        got.append(text)

    async def gate(task, text):
        return "act"

    monkeypatch.setattr(s, "heard", heard)
    monkeypatch.setattr(s, "_gate", gate)
    await s.on_voice({"type": "partial", "text": "i use my last year so and you no hear you please repeat yourself"})
    await s._flush_turn("t", 0)
    await s.on_voice({"type": "words", "text": "and you no hear you please repeat yourself"})  # the voice's late turn end
    await asyncio.sleep(0.05)
    assert got == ["i use my last year so and you no hear you please repeat yourself"]
    # a phone that slept said "not looking"; when she uses the app again the live picture is sent again
    s.viewing = False
    await s.handle({"type": "focus", "task": "t", "lang": "en", "device": {"mobile": True, "w": 411, "h": 900}})
    assert s.viewing and s.device["w"] == 411
