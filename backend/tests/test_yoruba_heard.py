from jagora.server import fix_heard


def test_yoruba_school_words_are_mended():
    assert "Computer Science" in fix_heard("kọ̀ǹpútà sáyènsì ní Dunilago.")
    assert "UNILAG" in fix_heard("kọ̀ǹpútà sáyènsì ní dunilárù.")
    out = fix_heard("Jàgbọ́, ṣé o lè bá mi wo jámùbù")
    assert out.startswith("Jagora") and out.endswith("JAMB")


def test_plain_words_left_alone():
    assert fix_heard("UNILAG computer science") == "UNILAG computer science"


def test_yoruba_sound_spellings_of_english():
    out = fix_heard("Mo ní pé kó bá mi dán lóòdì ọ̀físà broker a ń lọ wù nínú rẹ̀")
    assert "download official brochure" in out
    assert fix_heard("my broker called") == "my broker called"


def test_greeting_does_not_swallow_the_answer():
    from jagora.agent import _same_news
    hello = "Káàbọ̀! Mo ti gbọ́ pé ìwọ fẹ́ mọ̀ nípa Computer Science ní UNILAG. Mo ń wá ìlànà tó péye fún ọ báyìí."
    answer = ("Mo ti rí ìlànà Computer Science ní UNILAG fún ọ. JAMB: Èdè Gẹ̀ẹ́sì, Mathematics, Physics, "
              "àti Chemistry tàbí Biology.")
    assert not _same_news(hello, answer)
    assert _same_news(answer, answer)


def test_school_name_box_is_not_read_back():
    from jagora import fields
    from jagora.browser import Element
    el = Element(id=2, kind="text box", tag="input", type="text", label="Institution name", group="", name="", autocomplete="",
                 placeholder="", required=False, disabled=False, href="", rect={})
    assert fields.field_kind(el) == "text"


def test_brochure_without_its_b():
    out = fix_heard("rókè ọ̀hún sódà tùbí lé máa ń hàn fún àwọn kọ́ọ̀sì míti bá a túfẹ́")
    assert out.startswith("brochure") and "courses" in out


def test_old_sentence_sent_again_is_known():
    from jagora.server import _heard_before
    old = "Ọ̀rọ̀ mo fẹ́ dínkù. Yọ̀wọ́, mo fẹ́ dé kó bá mi wà soft dead combination fún computer science ní munilé. Yagora"
    assert _heard_before("Dọ̀rọ́, mo fẹ́ dé kó bá mi wà sọ́ Dead Combination fún Kùnkúta Sáyènsì ní Munilag", old)
    assert not _heard_before("Ó ṣe máa dán lọ, ẹ ṣé o, mo ti gbọ́ ohun tí ẹ sọ", old)


def test_jagora_heard_through_the_speaker_is_known():
    from jagora.server import _sounds_like
    said = ("Mo ti rí i lójú ìwé UNILAG 2025/2026. UTME: Èdè Gẹ̀ẹ́sì, Mathematics, Physics, àti Chemistry tàbí Biology kan. "
            "O-level: credits 5 ní Èdè Gẹ̀ẹ́sì, Mathematics, Further Mathematics, Physics, àti Chemistry tàbí Biology.")
    assert _sounds_like("a. Biologi 1 bye ni yìdé", said) >= 0.35
    assert _sounds_like("Ẹ jọ̀ọ́ ẹ bá mi download brochure náà", said) < 0.35
