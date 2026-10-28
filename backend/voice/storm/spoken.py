"""Make product specs sayable before they reach the voice.

The LLM may still write "6.7-inch AMOLED, 120 Hz, 5,000 mAh, USB-C" in the
middle of a Yoruba sentence. The STORM voice has never seen "mAh" or "AMOLED"
and mumbles them. This turns specs into plain spoken words ("milliamp hours",
"ay moled"), and the number normalisation that follows (always English, as
Nigerians say prices and specs) turns the digits into words.
"""

from __future__ import annotations

import re

_NUM = r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?"

# Units that follow a number: "5,000 mAh" -> "5,000 milliamp hours".
UNITS = {
    "mAh": "milliamp hours",
    "GB": "gigabytes",
    "TB": "terabytes",
    "MB": "megabytes",
    "GHz": "gigahertz",
    "Hz": "hertz",
    "MP": "megapixels",
    "fps": "frames per second",
    "W": "watts",
    "dB": "decibels",
    "mm": "millimetres",
    "cm": "centimetres",
    "kg": "kilograms",
    "g": "grams",
    "m": "metres",
    "ATM": "A T M",
    "K": "K",
    "G": "G",
    "x": "times",
    "inch": "inch",
    "-inch": " inch",
}

# Words and acronyms said the way people say them.
WORDS = {
    "AMOLED": "ay moled",
    "OLED": "oh led",
    "QLED": "Q led",
    "USB-C": "U S B C",
    "USB-A": "U S B A",
    "Wi-Fi": "wifi",
    "WiFi": "wifi",
    "SpO2": "blood oxygen",
    "SpO₂": "blood oxygen",
    "VO2 max": "fitness level",
    "eARC": "E A R C",
    "ANC": "noise cancelling",
    "UV400": "U V four hundred",
    "Dolby Atmos": "Dolby Atmos",
    "iPhone": "iPhone",
    "AirPods": "AirPods",
    "MagSafe": "MagSafe",
    "RAM": "ram",
    "PIN": "pin",
    "Core i9": "Core i nine",
    "Core i7": "Core i seven",
    "Core i5": "Core i five",
}

# Things that look like acronyms but are said as words.
_SAID_AS_WORDS = {"RAM", "PIN", "NEPA", "BRT", "KIVO", "OK", "SIM", "LED", "FIFA"}

_IP_RATING = re.compile(r"\bIP(X?)(\d)(\d)?\b")
_ACRONYM = re.compile(r"\b[A-Z]{2,5}\b")


def _ip(m: re.Match) -> str:
    digits = " ".join(d for d in (m.group(2), m.group(3)) if d)
    return f"I P {'X ' if m.group(1) else ''}{digits}"


_CODE = re.compile(r"\b[A-Z]{1,4}-[A-Z0-9]{4,10}\b")  # order numbers like KV-AB12CD


def speakable(text: str) -> str:
    # Order numbers are read one character at a time: "K V A B 1 2 C D".
    out = _CODE.sub(lambda m: " ".join(ch for ch in m.group(0) if ch != "-"), text)
    for k in sorted(WORDS, key=len, reverse=True):
        out = re.sub(rf"(?<![A-Za-z]){re.escape(k)}(?![A-Za-z])", WORDS[k], out)
    out = _IP_RATING.sub(_ip, out)
    # Model names: "Galaxy S10" -> "Galaxy S 10" (then "S ten").
    out = re.sub(r"\b([A-Z])(\d{1,3})\b", r"\1 \2", out)
    # "5G", "4K", "2.8K": the letter is said as a letter.
    out = re.sub(rf"\b({_NUM})([GK])\b", r"\1 \2", out)
    # "3x zoom" -> "3 times zoom"
    out = re.sub(rf"\b({_NUM})x\b", r"\1 times", out)
    keys = sorted((k for k in UNITS if k not in {"K", "G", "x"}), key=len, reverse=True)
    unit = "|".join(re.escape(k) for k in keys)
    out = re.sub(
        rf"(?P<n>{_NUM})\s?(?P<u>{unit})(?![A-Za-z])",
        lambda m: f"{m.group('n')} {UNITS[m.group('u')].strip()}",
        out,
    )
    # Any other acronym is spelled out letter by letter: "HDMI" -> "H D M I".
    out = _ACRONYM.sub(lambda m: m.group(0) if m.group(0) in _SAID_AS_WORDS else " ".join(m.group(0)), out)
    out = re.sub(r"\b(naira)(\s+naira)+\b", r"\1", re.sub(r"₦\s*([\d,.]+)\s*naira", r"₦\1", out), flags=re.I)
    return re.sub(r"[ \t]{2,}", " ", out)
