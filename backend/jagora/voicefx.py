"""Jagora's voice, a little quicker and a little louder, as it streams.

Speed: WSOLA time-stretching (waveform-similarity overlap-add). Short windows of the voice are taken a bit further
apart than they are laid down, and each one is nudged (by up to DELTA) to where it lines up best with the voice
before it, so the speech is quicker without sounding higher or robotic. It works on the stream piece by piece, so
the first sound is not delayed.

Loudness: a fixed gain with a soft limiter, so loud syllables are rounded off instead of clipping.
"""

from __future__ import annotations

import os

import numpy as np

TEMPO = float(os.environ.get("JAGORA_VOICE_TEMPO", "1.15"))  # 1.0 = as STORM speaks it
GAIN = float(os.environ.get("JAGORA_VOICE_GAIN", "1.4"))
FRAME_S, DELTA_S = 0.030, 0.008


class Stretcher:
    def __init__(self, rate: int, tempo: float = TEMPO) -> None:
        self.tempo = tempo
        self.n = max(64, int(rate * FRAME_S)) // 2 * 2
        self.hs = self.n // 2  # synthesis hop: where windows are laid down
        self.ha = self.hs * tempo  # analysis hop: where they are taken from
        self.d = int(rate * DELTA_S)
        self.win = np.hanning(self.n).astype(np.float64)
        self.x = np.zeros(0)  # input not yet consumed (starts at absolute index self.x0)
        self.x0 = 0
        self.out = np.zeros(self.n)  # overlap-add tail (starts at absolute output index self.o0)
        self.k = 0  # next frame number
        self.prev = None  # absolute input position of the last frame taken

    def _frame(self, at: int) -> np.ndarray:
        i = at - self.x0
        return self.x[i:i + self.n]

    def feed(self, pcm: bytes) -> bytes:
        if self.tempo == 1.0:
            return pcm
        self.x = np.concatenate([self.x, np.frombuffer(pcm, dtype="<i2").astype(np.float64)])
        return self._run(final=False)

    def flush(self) -> bytes:
        if self.tempo == 1.0:
            return b""
        return self._run(final=True)

    def _run(self, final: bool) -> bytes:
        done = []
        end = self.x0 + len(self.x)
        while True:
            nominal = int(round(self.k * self.ha))
            if self.prev is None:
                lo = hi = max(nominal, self.x0)
            else:
                lo, hi = max(self.x0, nominal - self.d), nominal + self.d
            need = max(hi, (self.prev or 0) + self.hs) + self.n
            if need > end:
                break
            if self.prev is None:
                pos = lo
            else:
                ref = self._frame(self.prev + self.hs)  # how the voice naturally continues
                seg = self.x[lo - self.x0: hi - self.x0 + self.n]
                # best match of `ref` inside `seg` (normalised cross-correlation over the search range)
                c = np.correlate(seg, ref, mode="valid")
                e = np.sqrt(np.convolve(seg * seg, np.ones(self.n), mode="valid")) + 1e-9
                pos = lo + int(np.argmax(c / e))
            self.out[: self.n] += self._frame(pos) * self.win
            done.append(self.out[: self.hs].copy())  # these samples get no more overlap
            self.out = np.concatenate([self.out[self.hs:], np.zeros(self.hs)])
            self.prev = pos
            self.k += 1
            # forget input that no future frame can reach
            keep_from = min(int(self.k * self.ha) - self.d, self.prev + self.hs) - 1
            if keep_from > self.x0:
                self.x = self.x[keep_from - self.x0:]
                self.x0 = keep_from
        if final:
            done.append(self.out[: self.hs])
            self.out = np.zeros(self.n)
        if not done:
            return b""
        y = np.concatenate(done)
        return np.clip(y, -32768, 32767).astype("<i2").tobytes()


class Leveler:
    """Jagora's voice a little louder, cleanly. The gain only ever changes smoothly (never sample by sample, which
    is what made the voice sound harsh): if a piece would go over the top, the gain glides down before its loudest
    point; afterwards it creeps back up slowly."""

    def __init__(self, gain: float = GAIN, ceiling: float = 0.92) -> None:
        self.target, self.ceiling, self.g = gain, ceiling, gain

    def __call__(self, pcm: bytes) -> bytes:
        if not pcm or self.target == 1.0:
            return pcm
        x = np.frombuffer(pcm, dtype="<i2").astype(np.float64) / 32768
        peak = float(np.max(np.abs(x))) or 1e-6
        want = min(self.target, self.ceiling / peak)
        start = self.g
        # down at once (gliding over the first 3 ms), up slowly (+4% a piece)
        end = want if want < start else min(want, start * 1.04)
        ramp = np.full(len(x), end)
        if end < start:
            # finish turning down just before the first sample that would be too loud (we have the whole piece)
            hot = np.nonzero(np.abs(x) * start > self.ceiling)[0]
            n = min(int(hot[0]) if len(hot) else 72, 72)
        else:
            n = min(len(x), 72)
        if n > 1:
            ramp[:n] = np.linspace(start, end, n)
        y = x * ramp
        self.g = end
        np.clip(y, -1, 1, out=y)  # only if the 3 ms glide was not enough: very rare
        return (y * 32767).astype("<i2").tobytes()


def louder(pcm: bytes, gain: float = GAIN) -> bytes:
    """One-off version of Leveler, for a whole clip."""
    return Leveler(gain)(pcm)
