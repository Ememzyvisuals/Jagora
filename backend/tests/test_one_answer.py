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
