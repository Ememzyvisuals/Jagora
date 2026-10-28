"""
Language-specific normalisation tables, transcribed from
"PlotWeaver Multilingual TTS Normalization Rules" (Emmanuel Ariyo).

Adding a language = adding one `LanguageRules` entry to `RULES`. Every field is
optional; whatever is left empty is simply not rewritten for that language, so a
partial table is safe to ship and extend later.

Where a rule in the source document offers two readings ("p.m. = ọ̀sán / ìrọ̀lẹ́"),
the first is used - a TTS pipeline must be deterministic.
"""

from dataclasses import dataclass, field
from typing import Callable

NumberToWords = Callable[[str], str]


@dataclass(frozen=True)
class LanguageRules:
    code: str

    # "₦" -> "naira". Applied to amounts: "₦3,400,000" -> "3,400,000 naira",
    # "₦5.75 million" -> "5.75 million naira" (currency word goes after the
    # magnitude, as the rules' worked examples show).
    currencies: dict[str, str] = field(default_factory=dict)

    # "%" -> "percent", "°C" -> "degrees Celsius". Applied when attached to a
    # number: "15%" -> "15 percent".
    percent: str | None = None
    celsius: str | None = None

    # Unit abbreviations and full words that follow a number: "271 km" ->
    # "271 kilometres". Keys are matched case-sensitively as whole tokens.
    units: dict[str, str] = field(default_factory=dict)

    # "million" -> "mílíọ̀nù". Whole-word, case-insensitive.
    magnitudes: dict[str, str] = field(default_factory=dict)

    # a.m. / p.m. after a time or number.
    am: str | None = None
    pm: str | None = None

    # Operators between two operands: "3 + 4" -> "3 plus 4". '-' and '/' are
    # only rewritten between numbers, so hyphenated words and URLs survive.
    operators: dict[str, str] = field(default_factory=dict)

    # Whole-word phrase substitutions ("AI" -> "artificial intelligence").
    phrases: dict[str, str] = field(default_factory=dict)

    # Clock times. `{h}` / `{m}` are already verbalised with number_to_words.
    # time_exact is used when minutes == 0, time_half when minutes == 30 and a
    # dedicated reading exists.
    time_format: str | None = None
    time_exact: str | None = None
    time_half: str | None = None

    # Decimal point word: "3.5" -> "three point five". When None, decimals are
    # left as digits (the engine reads them natively).
    decimal_word: str | None = None

    # Digits -> words for this language. None keeps digits as digits, which is
    # the honest default until a native numeral verbaliser exists.
    number_to_words: NumberToWords | None = None


def _english_number_to_words(digits: str) -> str:
    """'3400000' -> 'three million four hundred thousand' (British 'and')."""
    from num2words import num2words

    # num2words inserts commas between groups ("five million, three hundred");
    # punctuation inside a spoken number only confuses a TTS model.
    return num2words(int(digits), lang="en_GB").replace(",", "")


def _english_decimal_digits(fraction: str) -> str:
    """'75' -> 'seven five' (decimals are read digit by digit)."""
    from num2words import num2words

    return " ".join(num2words(int(d), lang="en") for d in fraction)


ENGLISH_OPERATORS = {
    "+": "plus",
    "-": "minus",
    "×": "multiplied by",
    "x": "multiplied by",
    "÷": "divided by",
    "/": "divided by",
    "=": "equals",
    "&": "and",
}

ENGLISH_UNITS = {
    "km": "kilometres",
    "kilometres": "kilometres",
    "kilometers": "kilometres",
    "kg": "kilograms",
    "kilograms": "kilograms",
    "L": "litres",
    "l": "litres",
    "litres": "litres",
    "liters": "litres",
    "m": "metres",
    "metres": "metres",
    "meters": "metres",
}

NIGERIAN_ENGLISH = LanguageRules(
    code="en",
    currencies={"₦": "naira", "$": "dollars", "£": "pounds", "€": "euros"},
    percent="percent",
    celsius="degrees Celsius",
    units=ENGLISH_UNITS,
    magnitudes={},  # already English
    am="a.m.",
    pm="p.m.",
    operators=ENGLISH_OPERATORS,
    phrases={"AI": "artificial intelligence"},
    time_format="{h} {m}",
    time_exact="{h} o'clock",
    decimal_word="point",
    number_to_words=_english_number_to_words,
)

NIGERIAN_PIDGIN = LanguageRules(
    code="pcm",
    currencies={"₦": "naira", "$": "dollars", "£": "pounds", "€": "euros"},
    percent="percent",
    celsius="degrees Celsius",
    units=ENGLISH_UNITS,
    am="morning",
    pm="afternoon",
    operators=ENGLISH_OPERATORS,
    phrases={"AI": "artificial intelligence"},
    time_format="{h} {m}",
    time_exact="{h} o'clock",
    decimal_word="point",
    number_to_words=_english_number_to_words,
)

YORUBA = LanguageRules(
    code="yo",
    currencies={"₦": "naira", "$": "dọ́là", "£": "pọ́ọ̀ǹdù", "€": "yúró"},
    percent="pásẹ́ntì",
    celsius="degrees Celsius",
    units={
        "km": "kílómítà",
        "kilometres": "kílómítà",
        "kilometers": "kílómítà",
        "kg": "kílógíráàmù",
        "kilograms": "kílógíráàmù",
        "L": "lítà",
        "litres": "lítà",
        "m": "mítà",
        "metres": "mítà",
    },
    magnitudes={
        "million": "mílíọ̀nù",
        "billion": "bílíọ̀nù",
        "thousand": "ẹgbẹ̀rún",
        "hundred": "ọgọ́rùn-ún",
    },
    am="àárọ̀",
    pm="ọ̀sán",
    operators={
        "+": "àfikún",
        "-": "yọkúrò",
        "×": "ìgbépọ̀",
        "÷": "pín sí",
        "/": "pín sí",
        "=": "dọ́gba pẹ̀lú",
        "&": "àti",
    },
    phrases={"AI": "ọgbọ́n atọwọ́dá", "artificial intelligence": "ọgbọ́n atọwọ́dá"},
    time_format="agogo {h} àti ìṣẹ́jú {m}",
    time_exact="agogo {h}",
    time_half="agogo {h} àti ìdajì",
    # TODO(native numerals): Yoruba number words (mẹ́ta, márùn-ún, ...). Until
    # then digits are passed through unchanged.
)

IGBO = LanguageRules(
    code="ig",
    currencies={"₦": "naịra", "$": "dọla", "£": "paụndụ", "€": "euro"},
    percent="pasentị",
    celsius="degrees Celsius",
    units={
        "km": "kilomita",
        "kilometres": "kilomita",
        "kilometers": "kilomita",
        "kg": "kilogram",
        "kilograms": "kilogram",
        "L": "lita",
        "litres": "lita",
        "m": "mita",
        "metres": "mita",
    },
    magnitudes={
        "million": "nde",
        "billion": "ijeri",
        "thousand": "puku",
        "hundred": "narị",
    },
    am="n'ụtụtụ",
    pm="n'ehihie",
    operators={
        "+": "gbakwunye",
        "-": "wepụ",
        "×": "mụbaa",
        "÷": "kewaa",
        "/": "kewaa site na",
        "=": "hà nhata",
        "&": "na",
    },
    phrases={
        "AI": "ọgụgụ isi aka mmadụ",
        "artificial intelligence": "ọgụgụ isi aka mmadụ",
    },
    time_format="elekere {h} na nkeji {m}",
    time_exact="elekere {h}",
    # TODO(native numerals): Igbo number words (atọ, ise, asaa, ...).
)

HAUSA = LanguageRules(
    code="ha",
    currencies={"₦": "naira", "$": "dala", "£": "fam", "€": "yuro"},
    percent="kashi",
    celsius="digiri Celsius",
    units={
        "km": "kilomita",
        "kilometres": "kilomita",
        "kilometers": "kilomita",
        "kg": "kilogram",
        "kilograms": "kilogram",
        "L": "lita",
        "litres": "lita",
        "m": "mita",
        "metres": "mita",
    },
    magnitudes={
        "million": "miliyan",
        "billion": "biliyan",
        "thousand": "dubu",
        "hundred": "ɗari",
    },
    am="na safe",
    pm="na rana",
    operators={
        "+": "ƙara",
        "-": "cire",
        "×": "ninka",
        "÷": "raba",
        "/": "raba da",
        "=": "daidai da",
        "&": "da",
    },
    phrases={
        "AI": "basirar wucin gadi",
        "artificial intelligence": "basirar wucin gadi",
    },
    time_format="ƙarfe {h} da minti {m}",
    time_exact="ƙarfe {h}",
    # TODO(native numerals): Hausa number words (uku, biyar, bakwai, ...).
)

RULES: dict[str, LanguageRules] = {
    r.code: r for r in (NIGERIAN_ENGLISH, NIGERIAN_PIDGIN, YORUBA, IGBO, HAUSA)
}
