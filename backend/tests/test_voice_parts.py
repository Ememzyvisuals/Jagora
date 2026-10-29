import re
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "voice" / "storm" / "tts.py"


def _helpers():
    src = SRC.read_text()
    start = src.index("MAX_PART =")
    end = src.index("\n\n\n", src.index("def parts("))
    ns = {"re": re, "__import__": __import__}
    exec(src[start:end], ns)  # noqa: S102 - our own module's pure helpers (the module needs LiveKit to import)
    return ns


def test_long_reply_goes_in_short_parts_without_formatting():
    h = _helpers()
    said = ("Mo ti rí i nínú ìwé UNILAG fún ọdún 2025/2026.\n\n**Fún Computer Science ní UNILAG:**\n- O'Level (WAEC/NECO): "
            "English, Mathematics, Further Mathematics, Physics, àti Chemistry tàbí Biology — gbogbo wọn ní credit.\n- JAMB "
            "(UTME): English, Mathematics, Physics, àti Chemistry tàbí Biology — ẹyọ kan nínú méjèèjì.")
    text = h["unformatted"](said)
    assert "*" not in text and "\n" not in text and "—" not in text
    ps = h["parts"](text)
    assert all(len(p) <= h["MAX_PART"] for p in ps)
    assert re.sub(r"\s+", "", "".join(ps)) == re.sub(r"\s+", "", text)
