"""Speech helpers that need no API: sentence splitting, what gets read aloud, and recording conversion."""

import subprocess

from jagora import speech


def test_sentences_and_speakable():
    s = speech.sentences("Ẹ káàárọ̀. Mo ti rí i. UNILAG requires English, Mathematics and Physics! Check https://unilag.edu.ng now.")
    assert s[0].startswith("Ẹ káàárọ̀. Mo ti rí i.")  # short pieces join
    assert all(len(x) <= 900 for x in speech.sentences("a, " * 800))
    assert "https" not in speech.speakable("See https://jamb.gov.ng/x for **details**")


async def test_browser_recording_to_wav16k():
    webm = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-f", "lavfi",
                           "-i", "sine=frequency=300:duration=1", "-filter_complex", "[0][1]amix=inputs=2:duration=shortest",
                           "-c:a", "libopus", "-f", "webm", "pipe:1"], capture_output=True).stdout
    wav = await speech.to_wav16k(webm)
    assert wav[:4] == b"RIFF" and 0.5 < speech.wav_seconds(wav) <= 1.05
    assert speech.pcm_to_wav(b"\0\0" * 2400)[:4] == b"RIFF"
