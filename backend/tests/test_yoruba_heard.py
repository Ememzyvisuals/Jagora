from jagora.server import fix_heard


def test_yoruba_school_words_are_mended():
    assert "Computer Science" in fix_heard("kọ̀ǹpútà sáyènsì ní Dunilago.")
    assert "UNILAG" in fix_heard("kọ̀ǹpútà sáyènsì ní dunilárù.")
    out = fix_heard("Jàgbọ́, ṣé o lè bá mi wo jámùbù")
    assert out.startswith("Jagora") and out.endswith("JAMB")


def test_plain_words_left_alone():
    assert fix_heard("UNILAG computer science") == "UNILAG computer science"
