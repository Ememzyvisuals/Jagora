"""How much data Jagora costs her phone, measured, not guessed.

    python -m jagora.netcheck            # live view on a real page, plus voice (real STORM voice when a key is set)
    python -m jagora.netcheck --seconds 60

For the live view, a real Chromium loads the Skills Fair practice portal (served locally, as in try_agent), scrolls it, types into it and opens its
menus while the screencast runs, in normal mode and in data saver, and every frame is counted exactly as the server
would send it (same throttle, same JSON message). For the voice, Jagora's own voice says a typical answer in each
mode (with no STORM key, a speech-like test signal of the same length stands in, and the result says so).
"""

from __future__ import annotations

import argparse
import array
import asyncio
import base64
import json
import math
import time

from jagora import lite, speech
from jagora.try_agent import serve_portals

SENTENCE = ("I found the official registration page. The fair runs from the third to the fifth of November at Yaba Tech, "
            "and registration closes on the thirty first of October. Shall I fill in the form for you?")


def _frame_msg(jpeg: str) -> int:
    return len(json.dumps({"type": "frame", "task": "t-000000000000", "jpeg": jpeg}))


async def live_view(mode: str, seconds: float) -> dict:
    from jagora.browser import Browser

    sent, frames, last = 0, 0, 0.0
    gap = lite.FRAME_GAP[mode]

    def on_frame(jpeg: str) -> None:
        nonlocal sent, frames, last
        now = time.monotonic()
        if now - last < gap:
            return
        last = now
        sent += _frame_msg(jpeg)
        frames += 1

    async with Browser({"mobile": True}) as b:
        b.lite = mode == "lite"
        await b.goto(PORTAL_URL)
        await b.start_screencast(on_frame)
        t0 = time.monotonic()
        i = 0
        while time.monotonic() - t0 < seconds:  # someone using the page: scrolling, typing, moving around
            i += 1
            await b.scroll("down" if i % 6 < 3 else "up")
            await asyncio.sleep(0.6)
            try:
                await b.page.keyboard.type("Adebayo ", delay=40)
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(0.6)
        took = time.monotonic() - t0
    return {"kb_per_min": sent / 1024 / took * 60, "fps": frames / took, "kb_per_frame": sent / 1024 / max(1, frames)}


async def voice(mode: str) -> dict:
    chunks: list[tuple[int, bytes]] = []
    real = speech.enabled()
    if real:
        async for _, rate, pcm in speech.speak_stream(SENTENCE, "en"):
            chunks.append((rate, pcm))
    if not chunks:  # a speech-like signal of the same length (about 12 s), so the sizes are still exact
        real = False
        sr, secs = 24000, 12.0
        x = [int(7000 * sum(math.sin(2 * math.pi * (170 + 50 * math.sin(i / 3000)) * k * i / sr) / k for k in (1, 2, 3, 5))
                 * (0.4 + 0.6 * abs(math.sin(i / 2400)))) for i in range(int(sr * secs))]
        pcm = array.array("h", [max(-32768, min(32767, v)) for v in x]).tobytes()
        step = 24000 * 2 // 5  # 0.2 s chunks, as STORM streams them
        chunks = [(sr, pcm[k:k + step]) for k in range(0, len(pcm), step)]
    sent, audio_s = 0, 0.0
    for rate, pcm in chunks:
        audio_s += len(pcm) / 2 / rate
        if mode == "lite":
            block, r2 = lite.voice_chunk(pcm, rate)
            msg = {"type": "pcm", "task": "t-000000000000", "utt": "u-000000000000", "n": 0, "rate": r2, "codec": "adpcm", "data": base64.b64encode(block).decode()}
        else:
            msg = {"type": "pcm", "task": "t-000000000000", "utt": "u-000000000000", "n": 0, "rate": rate, "data": base64.b64encode(pcm).decode()}
        sent += len(json.dumps(msg))
    return {"kbps": sent * 8 / 1000 / audio_s, "kb_per_min_speaking": sent / 1024 / audio_s * 60, "real": real}


PORTAL_URL = ""


async def main(seconds: float) -> None:
    global PORTAL_URL
    PORTAL_URL = serve_portals(8791) + "/skills-fair/"
    rows = []
    for mode in ("full", "lite"):
        lv = await live_view(mode, seconds)
        vo = await voice(mode)
        rows.append((mode, lv, vo))
    print("\nJagora data use, measured\n")
    print(f"{'mode':<12}{'per frame':>11}{'live view':>18}{'frames/s':>10}{'voice while talking':>26}")
    for mode, lv, vo in rows:
        name = "normal" if mode == "full" else "data saver"
        print(f"{name:<12}{lv['kb_per_frame']:>8.1f} KB{lv['kb_per_min']:>12.0f} KB/min{lv['fps']:>10.1f}"
              f"{vo['kbps']:>14.0f} kbit/s ({vo['kb_per_min_speaking']:.0f} KB/min)")
    full, lite_ = rows[0], rows[1]
    print(f"\nData saver: each frame {full[1]['kb_per_frame'] / max(0.1, lite_[1]['kb_per_frame']):.1f}x smaller and at most "
          f"{1 / lite.FRAME_GAP['lite']:.0f} a second instead of {1 / lite.FRAME_GAP['full']:.0f}; "
          f"voice {full[2]['kbps'] / max(1, lite_[2]['kbps']):.1f}x smaller.")
    print("Voice measured on " + ("Jagora's real STORM voice." if rows[0][2]["real"] else "a speech-like test signal (no STORM key set)."))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=30)
    asyncio.run(main(ap.parse_args().seconds))
