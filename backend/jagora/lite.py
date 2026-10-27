"""Data saver: Jagora on slow and costly networks.

Her phone does very little work (the browser runs on our server), so what she pays for is data: the live view of the
page, and Jagora's voice. In data saver mode:

- Voice is downsampled from 24 kHz to 16 kHz (still clear for speech) and packed with IMA ADPCM, 4 bits a sample:
  about 6 times smaller than the 16-bit, 24 kHz audio sent normally. Every 0.2 s chunk carries its own starting state,
  so a lost or late chunk never garbles the next one. The app decodes it in a few lines (remote.ts, `adpcm`).
- The live view is sent smaller, softer and less often (see SCREENCAST).

Data saver turns on by itself when the phone reports a slow connection or its own data saver, and she can switch it
on or off in the app.
"""

from __future__ import annotations

import array
import struct

SCREENCAST = {
    "full": {"format": "jpeg", "quality": 55, "maxWidth": 1280, "maxHeight": 1600, "everyNthFrame": 2},
    "lite": {"format": "jpeg", "quality": 32, "maxWidth": 360, "maxHeight": 800, "everyNthFrame": 3},
}
FRAME_GAP = {"full": 0.2, "lite": 0.5}  # seconds between frames sent to her: at most 5 a second, or 2 in data saver

STEPS = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97,
         107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
         876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871,
         5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
         27086, 29794, 32767]
INDEX = [-1, -1, -1, -1, 2, 4, 6, 8]
OUT_RATE = 16000


def resample(pcm: bytes, rate: int, to: int = OUT_RATE) -> list[int]:
    """16-bit mono PCM to `to` Hz: a gentle low-pass (to keep the result clean), then linear interpolation."""
    s = array.array("h")
    s.frombytes(pcm[: len(pcm) - (len(pcm) % 2)])
    if not s:
        return []
    if rate == to:
        return list(s)
    n = len(s)
    smooth = [(s[max(0, i - 1)] + 2 * s[i] + s[min(n - 1, i + 1)]) >> 2 for i in range(n)] if to < rate else list(s)
    step = rate / to
    out, pos = [], 0.0
    while pos < n - 1:
        i = int(pos)
        f = pos - i
        out.append(int(smooth[i] + (smooth[i + 1] - smooth[i]) * f))
        pos += step
    return out


def adpcm(samples: list[int]) -> bytes:
    """IMA ADPCM, one self-contained block: 2 bytes first sample, 1 byte step index, then two samples a byte."""
    if not samples:
        return b""
    pred, idx = samples[0], 0
    out = bytearray(struct.pack("<hB", pred, idx))
    nib_hi = None
    for x in samples[1:]:
        step = STEPS[idx]
        diff = x - pred
        code = 0
        if diff < 0:
            code, diff = 8, -diff
        delta = step >> 3
        if diff >= step:
            code |= 4
            diff -= step
            delta += step
        if diff >= step >> 1:
            code |= 2
            diff -= step >> 1
            delta += step >> 1
        if diff >= step >> 2:
            code |= 1
            delta += step >> 2
        pred = max(-32768, min(32767, pred - delta if code & 8 else pred + delta))
        idx = max(0, min(88, idx + INDEX[code & 7]))
        if nib_hi is None:
            nib_hi = code
        else:
            out.append(nib_hi | (code << 4))
            nib_hi = None
    if nib_hi is not None:
        out.append(nib_hi)
    return bytes(out)


def decode(block: bytes) -> list[int]:
    """The app's decoder, in Python (for tests and measurements)."""
    if len(block) < 3:
        return []
    pred, idx = struct.unpack("<hB", block[:3])
    out = [pred]
    for b in block[3:]:
        for code in (b & 15, b >> 4):
            step = STEPS[idx]
            delta = step >> 3
            if code & 4:
                delta += step
            if code & 2:
                delta += step >> 1
            if code & 1:
                delta += step >> 2
            pred = max(-32768, min(32767, pred - delta if code & 8 else pred + delta))
            idx = max(0, min(88, idx + INDEX[code & 7]))
            out.append(pred)
    return out


def voice_chunk(pcm: bytes, rate: int) -> tuple[bytes, int]:
    """Jagora's voice for data saver: (ADPCM block, its sample rate)."""
    return adpcm(resample(pcm, rate)), OUT_RATE
