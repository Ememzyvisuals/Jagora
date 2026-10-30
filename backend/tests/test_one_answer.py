"""From the demo recording: Jagora told the UNILAG answer, gave the PDF, then told a longer reworded version of the same
answer. The answer is spoken once per request; a second long version is refused, and finish says nothing more."""
from jagora.agent import Agent


class IO:
    def __init__(self):
        self.said = []

    async def say(self, t): self.said.append(t)
    async def event(self, k, d): pass


FIRST = ("Mo ti rí i lórí ìwé UNILAG 2025/2026. UTME fún Computer Science: English Language, Mathematics, Physics, "
         "ẹ̀yọ kan nínú Chemistry tàbí Biology. O/Level: 5 credits.")
SECOND = ("Mo ti rí i pátápátá lórí ìwé UNILAG 2025/2026, ojú ìwé 23. O/Level: English, Mathematics, Further Mathematics, "
          "Physics, àti Chemistry tàbí Biology, gbogbo wọn ní credit. UTME: English, Mathematics, Physics, àti Chemistry "
          "tàbí Biology kan. Direct Entry: JUPEB tàbí A-Level.")


async def test_second_version_of_the_answer_is_not_spoken():
    io = IO()
    a = Agent(None, None, io)
    note, _, _ = await a._act("tell_user", {"message": FIRST}, None)
    assert note == "told them"
    a._told_since_act = False  # the PDF was given in between
    note, _, _ = await a._act("tell_user", {"message": SECOND}, None)
    assert note.startswith("not said")
    _, _, done = await a._act("finish", {"success": True, "summary": SECOND}, None)
    assert done and io.said == [FIRST]


async def test_after_she_speaks_a_new_answer_may_be_given():
    io = IO()
    a = Agent(None, None, io)
    await a._act("tell_user", {"message": FIRST}, None)
    a._heard_since_told = True
    note, _, _ = await a._act("tell_user", {"message": SECOND}, None)
    assert note == "told them"


async def test_question_after_the_answer_does_not_repeat_it():
    io = IO()
    a = Agent(None, None, io)
    told = ("I don check am o. For tomorrow 30-Oct, from Agege to Moniya (Ibadan), all 3 trains don full, morning 8:06, "
            "afternoon 14:01, evening 16:21, no seat remain for First, Business, or Standard.")
    await a._act("tell_user", {"message": told}, None)
    q = ("For tomorrow 30-Oct, all 3 trains from Agege to Moniya (Ibadan) don full o, no seat remain for First, Business, "
         "Standard. Make I check another date abi make I check from Ebute Metta?")
    note, _, _ = await a._act("ask_user", {"question": q, "choices": ["Another date", "Ebute Metta"]}, None)
    assert note.startswith("not asked")


async def test_the_same_video_is_not_played_again_and_is_named_right(monkeypatch):
    from jagora import agent as ag
    sent = []

    class IOm:
        async def event(self, k, d): sent.append((k, d))
        async def say(self, t): pass

    class B:
        page = type("P", (), {"url": "https://www.premiumtimesng.com/"})()
        pdf = None

    a = ag.Agent(None, B(), IOm())

    async def eb(): return a.browser
    monkeypatch.setattr(a, "_ensure_browser", eb)

    async def title(v): return "Love in Lagos (Full Movie)"
    monkeypatch.setattr(ag, "_yt_title", title)
    snap = type("S", (), {"title": "Premium Times - Nigeria leading newspaper"})()
    out, _, _ = await a._download({"url": "https://www.youtube.com/watch?v=asgB8Y1Na9s"}, snap, play=True)
    assert "PLAYING NOW" in out and "Love in Lagos" in out and "Premium Times" not in out
    out2, _, _ = await a._download({"url": "https://www.youtube.com/watch?v=asgB8Y1Na9s"}, snap, play=True)
    assert out2.startswith("already playing")
    assert len([s for s in sent if s[0] == "media"]) == 1


async def test_a_pasted_checkout_link_becomes_the_pay_button():
    from jagora import agent as ag
    sent = []

    class IOm:
        async def event(self, k, d): sent.append((k, d))
        async def say(self, t): sent.append(("say", t))

    a = ag.Agent(None, None, IOm())
    a._goal = "Train ticket Agege to Moniya"
    out, _, _ = await a._act("tell_user", {"message": "Tap dis link pay, amount na ₦3887: [Pay now](https://checkout.paystack.com/91t5igr1dirojs4?x=1)"}, None)
    assert out.startswith("not said as a link")
    pay = [d for k, d in sent if k == "payment"]
    assert pay and pay[0]["pay_url"] == "https://checkout.paystack.com/91t5igr1dirojs4" and pay[0]["amount"] == "₦3887"
    assert not [x for x in sent if x[0] == "say"]
