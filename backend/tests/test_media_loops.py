"""From a real session: Jagora sent the same three egusi videos again and again (each one restarted her player),
searched the same thing four times and asked for full screen five times. Each repeat is refused now, with what to do."""
from jagora.agent import Agent


class IO:
    def __init__(self):
        self.events = []

    async def say(self, t): pass
    async def event(self, k, d): self.events.append((k, d))


VIDS = [{"name": "1. Egusi - Sisi Jemimah", "url": "https://www.youtube.com/watch?v=XeZJlxAsP18"},
        {"name": "2. Egusi - SisiYemmie", "url": "https://www.youtube.com/watch?v=UHe8K6uM-Z0"}]




async def test_same_list_is_not_sent_twice():
    io = IO()
    a = Agent(None, None, io)
    assert a._already_playing("list", [{"url": "u1"}, {"url": "u2"}]) == ""
    again = a._already_playing("list", [{"url": "u1"}, {"url": "u2"}])
    assert "already playing" in again and "restart" in again
    assert a._already_playing("preview", [{"url": "u1"}, {"url": "u2"}]) == ""  # a preview of them is a different thing


async def test_play_list_twice_and_full_screen_twice_through_the_tools(monkeypatch):
    io = IO()
    a = Agent(None, None, io)
    first, _, _ = await a._act("play_list", {"videos": VIDS, "big": True}, None)
    assert "PLAYING NOW" in first and "Never tell her to tap" in first
    again, _, _ = await a._act("play_list", {"videos": VIDS}, None)
    assert "already playing" in again
    assert [k for k, _ in io.events].count("media") == 1 and io.events[0][1].get("big") is True
    one, _, _ = await a._act("app_control", {"action": "media_big", "value": "on"}, None)
    two, _, _ = await a._act("app_control", {"action": "media_big", "value": "on"}, None)
    assert one.startswith("done") and two.startswith("already done")
    nxt, _, _ = await a._act("app_control", {"action": "media_next"}, None)
    nxt2, _, _ = await a._act("app_control", {"action": "media_next"}, None)
    assert nxt.startswith("done") and nxt2.startswith("done")  # next, next: both are real moves


async def test_same_video_search_twice(monkeypatch):
    from jagora import agent as agentmod
    calls = []

    async def videos(q):
        calls.append(q)
        return [{"title": "Egusi", "url": VIDS[0]["url"], "channel": "x", "duration": "9:00", "date": ""}]
    monkeypatch.setattr(agentmod.research, "videos", videos)
    import dataclasses
    monkeypatch.setattr(agentmod, "settings", dataclasses.replace(agentmod.settings, serper_keys=["k"]))
    a = Agent(None, None, IO())
    await a._act("find_video", {"query": "egusi soup"}, None)
    again, _, _ = await a._act("find_video", {"query": "Egusi soup "}, None)
    assert "already searched" in again and len(calls) == 1
