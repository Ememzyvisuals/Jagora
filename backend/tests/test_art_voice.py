"""Voice control of the art board, in all five languages: short commands are done at once; a sentence with a subject
goes to the agent."""
import pytest

from jagora import artvoice
from jagora import agent as ag


@pytest.mark.parametrize("lang,text", [
    ("en", "make it blue"), ("pcm", "abeg make am blue"), ("yo", "ṣe é ní búlúù"), ("ha", "mai da shi shuɗi"), ("ig", "mee ya acha anụnụ"),
])
def test_blue(lang, text):
    c = artvoice.parse(text, lang)
    assert c and c.kind == "typeart" and c.data["colour"] == "one"


@pytest.mark.parametrize("lang,text", [
    ("en", "make it black"), ("pcm", "make am black and white"), ("yo", "ṣe é dúdú àti funfun"), ("ha", "baƙi da fari"), ("ig", "mee ya oji na ọcha"),
])
def test_black_and_white(lang, text):
    c = artvoice.parse(text, lang)
    assert c and c.data["colour"] == "bw"


@pytest.mark.parametrize("lang,text", [
    ("en", "make it realistic"), ("pcm", "make am like real"), ("yo", "ṣe é bí òótọ́"), ("ha", "yi shi kamar gaske"), ("ig", "mee ya dị ka ezigbo"),
])
def test_realistic(lang, text):
    c = artvoice.parse(text, lang)
    assert c and c.data == {"restyle": True, "detail": "realistic"}


@pytest.mark.parametrize("lang,text", [
    ("en", "make it more realistic"), ("pcm", "add more detail"), ("yo", "ṣe é kúnná sí i"), ("ha", "ƙara bayani"), ("ig", "tinyekwuo"),
])
def test_keep_detailing(lang, text):
    c = artvoice.parse(text, lang)
    assert c and c.data.get("more") is True


@pytest.mark.parametrize("lang,text,size", [
    ("en", "save it in 4K", "4k"), ("pcm", "save am for A3 print", "a3"), ("yo", "fi pamọ́ ní 4K", "4k"), ("ha", "ajiye a A4", "a4"), ("ig", "chekwaa ya 4K", "4k"),
])
def test_save_at_a_size(lang, text, size):
    c = artvoice.parse(text, lang)
    assert c and c.kind == "app" and c.data == {"action": "art_save", "value": size}


def test_other_board_controls():
    p = artvoice.parse
    assert p("zoom in").data == {"action": "art_zoom", "value": "in"}
    assert p("zoom out").data["value"] == "out"
    assert p("show the whole picture").data["value"] == "reset"
    assert p("save the video").data == {"action": "art_video"}
    assert p("close the board").data == {"action": "type_art", "value": "off"}
    assert p("draw am again").data == {"action": "art_again"}
    assert p("paint it").data == {"restyle": True, "mode": "paint"}
    assert p("make it oil").data == {"restyle": True, "style": "oil"}
    assert p("use words").data == {"restyle": True, "letters": "words"}
    assert p("put am on paper").data == {"restyle": True, "board": "paper"}


@pytest.mark.parametrize("text", ["paint a Fulani woman at sunset", "draw a Hausa man in babban riga", "what is the weather in Lagos"])
def test_a_request_with_a_subject_is_left_to_the_agent(text):
    assert artvoice.parse(text) is None


class IOm:
    def __init__(self):
        self.sent = []

    async def event(self, k, d):
        self.sent.append((k, d))

    async def say(self, t):
        self.sent.append(("say", t))


async def test_the_board_answers_at_once_when_it_is_open(tmp_path, monkeypatch):
    monkeypatch.setattr(ag, "RUNS_DIR", tmp_path)
    io_ = IOm()
    a = ag.Agent(None, None, io_, lang="en")
    a.screen = lambda: "Type Art artboard: open, typing \"Gele portrait\" in symbols"
    r = await a.run("make am blue")
    assert r.success and ("typeart", {"restyle": True, "colour": "one"}) in io_.sent
    assert ("say", "Done, blue now.") in io_.sent
