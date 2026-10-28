"""Jagora's voice, a little quicker and louder: same pitch, no clicks, and the same result streamed or all at once."""
import numpy as np

from jagora import voicefx


def _voice(rate=24000, secs=2.0):
    t = np.arange(int(rate * secs)) / rate
    f = 140 + 40 * np.sin(2 * np.pi * 0.7 * t)
    ph = 2 * np.pi * np.cumsum(f) / rate
    env = (0.5 * (1 + np.sin(2 * np.pi * 3 * t))) ** 1.5
    return (env * (np.sin(ph) + 0.4 * np.sin(2 * ph)) * 9000).astype("<i2").tobytes()


def _pitch(x, rate=24000):
    sp = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    fr = np.fft.rfftfreq(len(x), 1 / rate)
    m = (fr > 80) & (fr < 300)
    return fr[m][np.argmax(sp[m])]


def test_quicker_without_a_higher_voice():
    x = _voice()
    st = voicefx.Stretcher(24000, tempo=1.15)
    out = b"".join(st.feed(x[i:i + 9600]) for i in range(0, len(x), 9600)) + st.flush()
    s2 = voicefx.Stretcher(24000, tempo=1.15)
    assert out == s2.feed(x) + s2.flush()  # streamed in pieces = all at once
    assert 1.12 < len(x) / len(out) < 1.19
    a, b = np.frombuffer(x, "<i2").astype(float), np.frombuffer(out, "<i2").astype(float)
    assert abs(_pitch(a[:4800]) - _pitch(b[:4800])) < 6
    assert np.max(np.abs(np.diff(b))) <= np.max(np.abs(np.diff(a))) * 1.2  # no clicks


def test_louder_never_clips():
    x = (np.sin(np.arange(24000) / 5) * 30000).astype("<i2").tobytes()
    y = np.frombuffer(voicefx.louder(x, 1.4), "<i2")
    assert np.max(np.abs(y)) <= 32767
    quiet = (np.sin(np.arange(24000) / 5) * 5000).astype("<i2").tobytes()
    q = np.frombuffer(voicefx.louder(quiet, 1.4), "<i2").astype(float)
    assert 1.35 < np.sqrt(np.mean(q ** 2)) / np.sqrt(np.mean(np.frombuffer(quiet, "<i2").astype(float) ** 2)) < 1.45


def test_loud_voice_is_turned_down_smoothly_not_distorted():
    """A voice already near full volume: the shape of the wave stays the same (no squashed peaks = no harshness)."""
    x = np.sin(np.arange(24000) / 5) * 0.97
    pcm = (x * 32767).astype("<i2").tobytes()
    lv = voicefx.Leveler(1.4)
    y = np.frombuffer(b"".join(lv(pcm[i:i + 9600]) for i in range(0, len(pcm), 9600)), "<i2").astype(float) / 32767
    assert np.max(np.abs(y)) <= 0.93
    ratio = y[200:] / np.where(np.abs(x[200:]) > 0.05, x[200:], np.nan)
    assert np.nanmax(ratio) - np.nanmin(ratio) < 0.02  # one gain for all samples: an undistorted, quieter copy
