"""Type Art: draw_art asks Muse Image for the picture and opens her artboard; restyling sends no new picture; real,
famous people are never drawn from a prompt; her own photo is typed out."""
import pytest

from jagora import agent as ag
from jagora import muse




class IOm:
    def __init__(self):
        self.sent = []

    async def event(self, k, d):
        self.sent.append((k, d))

    async def say(self, t):
        self.sent.append(("say", t))


class FakeImages:
    def __init__(self):
        self.prompts = []

    async def generate(self, prompt):
        self.prompts.append(prompt)
        from PIL import Image
        import io
        b = io.BytesIO()
        Image.new("RGB", (64, 64), (200, 120, 40)).save(b, "PNG")
        return b.getvalue()


async def test_draw_art_draws_with_muse_image_and_opens_the_artboard(tmp_path, monkeypatch):
    monkeypatch.setattr(ag, "FILES_DIR", tmp_path)
    io_, imgs = IOm(), FakeImages()
    a = ag.Agent(None, None, io_, lang="pcm")
    a.images = imgs
    out, _, _ = await a._act("draw_art", {"subject": "a Nigerian woman in a green and gold gele", "letters": "words", "colour": "full"}, None)
    assert "artboard is typing" in out
    assert imgs.prompts and "black background" in imgs.prompts[0] and "gele" in imgs.prompts[0]
    ev = [d for k, d in io_.sent if k == "typeart"]
    assert ev[0]["preparing"] is True and ev[0]["letters"] == "words"  # the board gets ready while Muse Image draws
    assert ev[1]["url"].startswith("/files/") and ev[1]["letters"] == "words" and ev[1]["colour"] == "full"
    assert (tmp_path / ev[1]["url"].split("/")[2] / "art.webp").exists()
    assert [t for k, t in io_.sent if k == "say"]  # she hears one line while it draws


async def test_restyle_sends_only_the_new_settings():
    io_ = IOm()
    a = ag.Agent(None, None, io_)
    out, _, _ = await a._act("draw_art", {"colour": "one", "detail": "coarse", "letters": "nonsense"}, None)
    ev = [d for k, d in io_.sent if k == "typeart"]
    assert ev == [{"restyle": True, "colour": "one", "detail": "coarse"}]


async def test_famous_people_are_not_drawn():
    io_, imgs = IOm(), FakeImages()
    a = ag.Agent(None, None, io_)
    a.images = imgs
    out, _, _ = await a._act("draw_art", {"subject": "Burna Boy in sunglasses"}, None)
    assert out.startswith("not drawn") and not imgs.prompts and not io_.sent


async def test_her_own_photo_is_typed_out(tmp_path, monkeypatch):
    monkeypatch.setattr(ag, "FILES_DIR", tmp_path / "files")
    from PIL import Image
    p = tmp_path / "me.jpg"
    Image.new("RGB", (40, 40), (10, 10, 10)).save(p)
    io_ = IOm()
    a = ag.Agent(None, None, io_, files={"me.jpg": str(p)})
    out, _, _ = await a._act("draw_art", {"use_photo": True}, None)
    ev = [d for k, d in io_.sent if k == "typeart"]
    assert ev and ev[0]["own"] is True and ev[0]["url"].endswith("photo.webp")


def test_the_prompt_asks_for_one_ordinary_person_on_black():
    assert "never a real or famous person" in muse.ART_STYLE and "black background" in muse.ART_STYLE


async def test_the_board_choice_is_passed_on():
    io_ = IOm()
    a = ag.Agent(None, None, io_)
    await a._act("draw_art", {"board": "paper", "colour": "bw"}, None)
    assert [d for k, d in io_.sent if k == "typeart"] == [{"restyle": True, "colour": "bw", "board": "paper"}]


def test_the_tool_asks_for_an_english_prompt_that_keeps_the_culture():
    t = next(t for t in ag.COMMON if t["function"]["name"] == "draw_art")
    desc = t["function"]["parameters"]["properties"]["subject"]["description"]
    assert "ENGLISH" in desc and "Yoruba" in desc and "babban riga" in desc and "isiagu" in desc
    assert "traditional attire" in muse.ART_STYLE


async def test_paint_mode_uses_the_painterly_reference_and_a_wonder_title(tmp_path, monkeypatch):
    monkeypatch.setattr(ag, "FILES_DIR", tmp_path)

    class Wonder:
        async def chat(self, msg, tools, **k):
            class R:
                text = "Ìyá ní gèlè"
            return R()

    io_, imgs = IOm(), FakeImages()
    a = ag.Agent(None, None, io_, lang="yo")
    a.images, a.wonder = imgs, Wonder()
    await a._act("draw_art", {"subject": "a Fulani woman with facial beads at sunset", "mode": "paint", "style": "oil"}, None)
    assert "painterly" in imgs.prompts[0] and "sunset" in imgs.prompts[0]
    await a._titling
    evs = [d for k, d in io_.sent if k == "typeart"]
    # the board gets ready first, the picture goes the moment it is drawn, and the title follows on its own
    assert evs[0]["preparing"] is True and "sunset" in evs[0]["subject"] and evs[0]["mode"] == "paint"
    assert evs[1]["url"].endswith("art.webp") and evs[1]["mode"] == "paint" and evs[1]["style"] == "oil" and "title" not in evs[1]
    assert evs[2] == {"title": "Ìyá ní gèlè"}
    assert any("kun" in t for k, t in io_.sent if k == "say")


async def test_a_failed_picture_clears_the_preparing_board(tmp_path, monkeypatch):
    monkeypatch.setattr(ag, "FILES_DIR", tmp_path)

    class Broken:
        async def generate(self, *a, **k):
            raise RuntimeError("refused")

    io_ = IOm()
    a = ag.Agent(None, None, io_)
    a.images = Broken()
    out, _, _ = await a._act("draw_art", {"subject": "a weaver in Iseyin", "mode": "paint"}, None)
    evs = [d for k, d in io_.sent if k == "typeart"]
    assert evs[0]["preparing"] is True and evs[-1] == {"preparing": False} and "could not be drawn" in out


async def test_famous_people_get_the_upload_offer():
    a = ag.Agent(None, None, IOm())
    a.images = FakeImages()
    out, _, _ = await a._act("draw_art", {"subject": "paint Davido", "mode": "paint"}, None)
    assert out.startswith("not drawn") and "upload her own photo" in out


async def test_the_cutout_endpoint_needs_her_sign_in():
    from fastapi.testclient import TestClient
    from jagora.server import app
    r = TestClient(app).post("/art/cutout", json={"image": "data:image/jpeg;base64,AAAA"})
    assert r.status_code == 401


async def test_realistic_detail_works_for_type_and_paint():
    io_ = IOm()
    a = ag.Agent(None, None, io_)
    await a._act("draw_art", {"detail": "realistic"}, None)
    await a._act("draw_art", {"detail": "realistic", "mode": "paint"}, None)
    assert [d for k, d in io_.sent if k == "typeart"] == [{"restyle": True, "detail": "realistic"},
                                                          {"restyle": True, "detail": "realistic", "mode": "paint"}]


async def test_keep_detailing_adds_a_pass_without_a_new_picture():
    io_, imgs = IOm(), FakeImages()
    a = ag.Agent(None, None, io_)
    a.images = imgs
    out, _, _ = await a._act("draw_art", {"more": True}, None)
    assert "finer pass" in out and not imgs.prompts
    assert [d for k, d in io_.sent if k == "typeart"] == [{"restyle": True, "more": True}]


def test_the_tool_offers_realistic_and_more_detail():
    t = next(t for t in ag.COMMON if t["function"]["name"] == "draw_art")
    props = t["function"]["parameters"]["properties"]
    assert "realistic" in props["detail"]["enum"] and props["more"]["type"] == "boolean"
    assert "keep detailing" in t["function"]["description"]


async def test_open_board_by_voice_asks_photo_or_describe():
    io_ = IOm()
    a = ag.Agent(None, None, io_)
    a.screen = lambda: ""
    out, _, _ = await a._act("draw_art", {"open": True, "mode": "paint"}, None)
    ev = [d for k, d in io_.sent if k == "typeart"]
    assert ev == [{"mode": "paint"}]  # the board opens, in paint mode, nothing is drawn
    assert "own photo" in out and "what to paint" in out


async def test_open_board_with_art_on_it_does_not_ask():
    io_ = IOm()
    a = ag.Agent(None, None, io_)
    a.screen = lambda: 'Type Art artboard: open, typing "her photo" in symbols, finished.'
    out, _, _ = await a._act("draw_art", {"open": True}, None)
    assert "with her art on it" in out


async def test_board_opened_for_painting_paints_what_she_says_next(tmp_path, monkeypatch):
    monkeypatch.setattr(ag, "FILES_DIR", tmp_path)
    io_, imgs = IOm(), FakeImages()
    a = ag.Agent(None, None, io_)
    a.images = imgs
    a.screen = lambda: "Type Art artboard: open, empty (paint mode)."
    await a._act("draw_art", {"subject": "a Fulani woman at sunset"}, None)
    ev = [d for k, d in io_.sent if k == "typeart"]
    assert ev[-1]["mode"] == "paint"


async def test_background_choice_goes_to_the_board():
    io_ = IOm()
    a = ag.Agent(None, None, io_)
    a.screen = lambda: ""
    await a._act("draw_art", {"background": "keep"}, None)
    ev = [d for k, d in io_.sent if k == "typeart"]
    assert ev == [{"restyle": True, "plain": False}]
