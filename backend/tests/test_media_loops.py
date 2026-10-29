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
    assert nxt.startswith("done") and nxt2.startswith("already done")  # once per thing she asked (no runaway skipping)
    a._heard_all.append("next one")
    nxt3, _, _ = await a._act("app_control", {"action": "media_next"}, None)
    assert nxt3.startswith("done")  # she asked again: done again


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


async def test_recommendations_carry_why_and_where_learners_recommend_it(monkeypatch):
    from jagora import agent as agentmod
    import dataclasses

    async def videos(q):
        return [{"title": "Python for Beginners - Full Course", "url": "https://www.youtube.com/watch?v=K5KVEU3aaeQ",
                 "channel": "Programming with Mosh", "duration": "2:00:00", "date": "2025", "snippet": "", "image": "", "views": ""},
                {"title": "Learn Python - Full Course for Beginners", "url": "https://www.youtube.com/watch?v=rfscVS0vtbw",
                 "channel": "freeCodeCamp.org", "duration": "4:26:52", "date": "2018", "snippet": "", "image": "", "views": ""}]

    async def serper(q, n=10):
        return ([{"title": "Best Python course on YouTube? : r/learnpython", "url": "https://reddit.com/r/learnpython/x",
                  "site": "reddit.com", "snippet": "Programming with Mosh is great for absolute beginners"}], "")
    monkeypatch.setattr(agentmod.research, "videos", videos)
    monkeypatch.setattr(agentmod.research, "serper", serper)
    monkeypatch.setattr(agentmod, "settings", dataclasses.replace(agentmod.settings, serper_keys=["k"]))
    io = IO()
    a = Agent(None, None, io)
    out, _, _ = await a._act("find_video", {"query": "python course for beginners"}, None)
    assert 'recommended on: reddit.com ("Best Python course on YouTube?' in out
    await a._act("recommend_videos", {"intro": "The best Python courses for a beginner", "picks": [
        {"url": "https://www.youtube.com/watch?v=K5KVEU3aaeQ", "name": "Mosh: Python for Beginners", "why": "Two hours, made for beginners."}]}, None)
    kind, card = io.events[-1]
    assert kind == "picks" and card["picks"][0]["channel"] == "Programming with Mosh"
    assert card["picks"][0]["evidence"][0]["site"] == "reddit.com" and "youtube-nocookie.com/embed/K5KVEU3aaeQ" in card["picks"][0]["url"]
