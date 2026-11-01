"""Voice control of the art board (Type Art and Paint) while it is open.

Short spoken commands ("make am blue", "ṣe é bí òótọ́", "ajiye a 4K", "mee ya acha anụnụ") are understood here at once,
without a model call, so the board answers as fast as a button: the change is sent to her app and Jagora says a few
words ("Done, blue now."). Anything longer, or with a subject in it ("paint a Fulani woman at sunset"), is left to the
agent, which uses draw_art and app_control the same way.

parse(text, lang) -> Command | None. Matching ignores tone marks and case, in all five languages.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field


def fold(s: str) -> str:
    """lower case, no tone marks or dots below; the hooked Hausa letters as plain ones"""
    s = s.lower().replace("ɗ", "d").replace("ƙ", "k").replace("ƴ", "y").replace("ɓ", "b")
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w\s]", " ", s)


@dataclass
class Command:
    kind: str  # "typeart" (a restyle for the board) or "app" (zoom, save, close...)
    data: dict = field(default_factory=dict)
    what: str = ""  # a few words for the reply


# (command, phrases). Checked in this order: the more specific first.
RULES: list[tuple[tuple[str, dict, str], list[str]]] = [
    (("typeart", {"restyle": True, "plain": True}, "no background"),
     ["no background", "remove background", "remove the background", "background less", "backgroundless",
      "without background", "without the background", "take away the background", "take off the background",
      "only the person", "only the people", "comot background", "comot the background", "remove am background",
      "yo eyin kuro", "laisi eyin", "cire bango", "babu bango", "wepu azu", "enweghi azu"]),
    (("typeart", {"restyle": True, "plain": False}, "with the background"),
     ["keep background", "keep the background", "with background", "with the background", "show background",
      "show the background", "add background", "add the background", "bring back the background", "put background",
      "put the background", "full picture", "fi eyin si", "pelu eyin", "sa bango", "da bango", "tinye azu", "na azu"]),
    (("typeart", {"restyle": True, "more": True}, "more detail"),
     ["more realistic", "more detail", "keep detailing", "add detail", "sharper", "more real", "add more detail",
      "kunna si", "fi kun un", "fi alaye kun", "se e kunna", "kara bayani", "kara cikakken bayani", "kara gaske",
      "tinyekwuo", "nkowa ozo", "mee ka o doo anya"]),
    (("typeart", {"restyle": True, "detail": "realistic"}, "realistic"),
     ["realistic", "look real", "like real", "real real", "bi ooto", "bi otito", "kamar gaske", "na gaske",
      "di ka ezigbo", "dika ezigbo", "ka ezigbo"]),
    (("app", {"action": "art_video"}, "the video is saving"),
     ["save video", "save the video", "video", "fidio", "bidiyo", "vidiyo"]),
    (("app", {"action": "art_save"}, "saving"),
     ["save", "download", "fi pamo", "fi si", "ajiye", "chekwaa", "debe"]),
    (("app", {"action": "art_zoom", "value": "reset"}, "whole picture"),
     ["reset zoom", "whole picture", "fit", "gbogbo re", "duka", "niile"]),
    (("app", {"action": "art_zoom", "value": "in"}, "closer"),
     ["zoom in", "zoom am", "closer", "sun mo", "kara girma", "zuko", "bubata", "nso"]),
    (("app", {"action": "art_zoom", "value": "out"}, "further"),
     ["zoom out", "sun sehin", "rage", "mee ka o pere"]),
    (("type_art_off", {}, "closed"),
     ["close the board", "close board", "close it", "close", "comot", "pa a de", "ti i pa", "rufe", "mechie"]),
    (("app", {"action": "art_again"}, "drawing again"),
     ["draw again", "again", "redo", "tun un ya", "tun ya", "sake zana", "sake", "see ozo"]),
    (("typeart", {"restyle": True, "style": "water"}, "watercolour"),
     ["watercolour", "watercolor", "water colour", "awo omi", "launin ruwa", "agba mmiri"]),
    (("typeart", {"restyle": True, "style": "oil"}, "oil"),
     ["oil", "ororo", "mmanu"]),
    (("typeart", {"restyle": True, "style": "bold"}, "bold colour"),
     ["bold colour", "bold color", "awo to n tan", "launi haske", "agba siri ike"]),
    (("typeart", {"restyle": True, "board": "paper"}, "paper"),
     ["paper", "white board", "light board", "iwe", "takarda", "akwukwo"]),
    (("typeart", {"restyle": True, "board": "dark"}, "dark board"),
     ["dark board", "black board", "board dark", "pako dudu", "allo baki", "bọọdụ ojii", "boodu ojii"]),
    (("typeart", {"restyle": True, "colour": "one"}, "blue"),
     ["blue", "buluu", "shudi", "acha anunu", "anunu"]),
    (("typeart", {"restyle": True, "colour": "bw"}, "black and white"),
     ["black and white", "black white", "black", "grey", "gray", "dudu ati funfun", "dudu funfun", "dudu",
      "baki da fari", "baki fari", "baki", "oji na ocha", "oji ocha", "oji"]),
    (("typeart", {"restyle": True, "colour": "full"}, "full colour"),
     ["full colour", "full color", "in colour", "colourful", "all the colours", "gbogbo awo", "ni awo",
      "cikakken launi", "da launi", "agba niile", "na agba"]),
    (("typeart", {"restyle": True, "letters": "words"}, "words"),
     ["words", "oro", "kalmomi", "okwu"]),
    (("typeart", {"restyle": True, "letters": "numbers"}, "numbers"),
     ["numbers", "nomba", "lambobi", "nomba"]),
    (("typeart", {"restyle": True, "letters": "symbols"}, "symbols"),
     ["symbols", "ami", "alamomi", "akara"]),
    (("typeart", {"restyle": True, "mode": "paint"}, "painting"),
     ["paint it", "paint am", "painting", "paint", "kun un", "kun", "fenti", "see agba"]),
    (("typeart", {"restyle": True, "mode": "type"}, "typed letters"),
     ["type it", "type am", "typed", "type", "te e", "rubuta", "dee ya"]),
]

SIZES = [("4k", "4k"), ("a3", "a3"), ("a4", "a4"), ("2k", "hd"), ("hd", "hd"), ("print", "a4"), ("screen", "screen")]

# words that carry no meaning of their own in a short command
FILLER = set("""make it am e the a an to into now please abeg jagora can you change turn use be do for me my this that
on in of with oya biko jowo ese se e ni o fi ya mai da ka a yi mee ya ka o ga ike na kwa ma i want wan go dey all its
picture art board image pic one size print save""".split())

DONE = {"en": "Done, {w} now.", "pcm": "E don do, {w}.", "yo": "Ó ti ṣe.", "ha": "An gama.", "ig": "Emechara."}


def parse(text: str, lang: str = "en") -> Command | None:
    t = " " + " ".join(fold(text).split()) + " "
    words = t.split()
    if not words or len(words) > 9:
        return None
    for (kind, data, what), phrases in RULES:
        for ph in phrases:
            f = " " + fold(ph) + " "
            if f not in t:
                continue
            # anything else she said must be filler: "paint a Fulani woman" has a subject, so it is not a command
            rest = [w for w in t.replace(f, " ").split() if w not in FILLER and not re.fullmatch(r"\d+k?|a[34]|hd|2k|4k", w)]
            if len(rest) > 1:
                return None
            d = dict(data)
            if kind == "app" and d.get("action") == "art_save":
                d["value"] = next((v for k, v in SIZES if f" {k} " in t), "screen")
            if kind == "type_art_off":
                return Command("app", {"action": "type_art", "value": "off"}, what)
            return Command(kind, d, what)
    return None


def reply(cmd: Command, lang: str) -> str:
    return DONE.get(lang, DONE["en"]).format(w=cmd.what)
