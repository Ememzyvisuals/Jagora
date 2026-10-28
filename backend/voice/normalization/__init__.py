"""
Text normalisation applied before any text reaches a TTS engine.

    Raw text -> language-specific normalisation -> TTS engine

Symbols, currencies, units, percentages, clock times and bare numbers are
rewritten into the words a speaker of that language would say, per the rules
tables in `app/normalization/rules.py`. The TTS model then never has to guess
how "₦5.75 million" or "7:45 p.m." is pronounced - and cannot guess wrong.

Only `normalize(text, language_code)` is public. Languages without a rules
table pass through untouched (whitespace-tidied only), so calling this for every
request is always safe.
"""

import re

from normalization.rules import RULES, LanguageRules

__all__ = ["normalize", "has_rules"]

# A number as developers type it: optional thousands separators, optional
# decimal part. "3,400,000", "5.75", "15", "0.5".
_NUMBER = r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?"
_MAGNITUDE_WORDS = ("hundred", "thousand", "million", "billion", "trillion")


def has_rules(language_code: str) -> bool:
    return language_code in RULES


def normalize(text: str, language_code: str) -> str:
    rules = RULES.get(language_code)
    if rules is None:
        return _tidy(text)
    out = text
    out = _currencies(out, rules)
    out = _percent_and_celsius(out, rules)
    out = _units(out, rules)
    out = _meridiem(out, rules)  # before _times: needs the digits still present
    out = _times(out, rules)
    out = _operators(out, rules)
    out = _phrases(out, rules)
    out = _magnitudes(out, rules)
    out = _numbers(out, rules)
    return _tidy(out)


# --- individual passes -------------------------------------------------------


def _currencies(text: str, rules: LanguageRules) -> str:
    """
    "₦3,400,000" -> "3,400,000 naira"; "₦5.75 million" -> "5.75 million naira";
    "$20" -> "20 dollars". The currency word lands after any magnitude word so
    the worked examples in the rules document come out verbatim.
    """
    if not rules.currencies:
        return text
    symbols = "".join(re.escape(s) for s in rules.currencies)
    magnitude = "|".join(_MAGNITUDE_WORDS)
    pattern = re.compile(
        rf"(?P<sym>[{symbols}])\s?(?P<num>{_NUMBER})(?P<mag>\s(?:{magnitude}))?\b",
        re.IGNORECASE,
    )

    def repl(m: re.Match) -> str:
        word = rules.currencies[m.group("sym")]
        mag = m.group("mag") or ""
        return f"{m.group('num')}{mag} {word}"

    return pattern.sub(repl, text)


def _percent_and_celsius(text: str, rules: LanguageRules) -> str:
    if rules.percent:
        text = re.sub(r"(?<=\d)\s?%", f" {rules.percent}", text)
    if rules.celsius:
        text = re.sub(r"(?<=\d)\s?°\s?C\b", f" {rules.celsius}", text)
    return text


def _units(text: str, rules: LanguageRules) -> str:
    """Only a unit that directly follows a number is a unit: '5 m' yes, 'I m' no."""
    if not rules.units:
        return text
    # Longest keys first so "kilometres" wins over "km"-style prefixes.
    keys = sorted(rules.units, key=len, reverse=True)
    alternation = "|".join(re.escape(k) for k in keys)
    pattern = re.compile(rf"(?P<num>{_NUMBER})\s?(?P<unit>{alternation})(?![A-Za-z])")
    return pattern.sub(lambda m: f"{m.group('num')} {rules.units[m.group('unit')]}", text)


def _times(text: str, rules: LanguageRules) -> str:
    """'7:45' -> 'seven forty-five' / 'agogo méje àti ìṣẹ́jú 45' per language."""
    if not rules.time_format:
        return text
    pattern = re.compile(r"\b(?P<h>[01]?\d|2[0-3]):(?P<m>[0-5]\d)\b")

    def words(n: str) -> str:
        if rules.number_to_words is None:
            return str(int(n))
        return rules.number_to_words(str(int(n)))

    def repl(m: re.Match) -> str:
        h, mm = m.group("h"), m.group("m")
        if mm == "00" and rules.time_exact:
            return rules.time_exact.format(h=words(h))
        if mm == "30" and rules.time_half:
            return rules.time_half.format(h=words(h))
        return rules.time_format.format(h=words(h), m=words(mm))

    return pattern.sub(repl, text)


def _meridiem(text: str, rules: LanguageRules) -> str:
    """Only after a time or number: '9 am' yes, 'I am' no."""
    if rules.am:
        text = re.sub(
            r"(?<=\d)\s?(?:a\.m\.|am|AM|A\.M\.)(?=\W|$)", f" {rules.am}", text
        )
    if rules.pm:
        text = re.sub(
            r"(?<=\d)\s?(?:p\.m\.|pm|PM|P\.M\.)(?=\W|$)", f" {rules.pm}", text
        )
    return text


def _operators(text: str, rules: LanguageRules) -> str:
    """
    Operators are rewritten only as operators: between two operands separated by
    spaces ("3 + 4", "a & b"), or for '-', '/', '×', '÷', '=' also when tightly
    between two numbers ("3/4", "2×3"). A hyphenated word or a URL is untouched.
    """
    if not rules.operators:
        return text
    for sym, word in rules.operators.items():
        esc = re.escape(sym)
        if sym == "x":
            # The letter x is a multiplication sign only between numbers.
            text = re.sub(r"(?<=\d)\s?x\s?(?=\d)", f" {word} ", text)
            continue
        if sym in "&=+×÷":
            text = re.sub(rf"(?<=\S)\s{esc}\s(?=\S)", f" {word} ", text)
            text = re.sub(rf"(?<=\d){esc}(?=\d)", f" {word} ", text)
        else:  # '-' and '/' : numbers only, to protect words and URLs
            text = re.sub(rf"(?<=\d)\s{esc}\s(?=\d)", f" {word} ", text)
            text = re.sub(rf"(?<=\d){esc}(?=\d)", f" {word} ", text)
    return text


def _phrases(text: str, rules: LanguageRules) -> str:
    for phrase, replacement in rules.phrases.items():
        text = re.sub(rf"\b{re.escape(phrase)}\b", replacement, text)
    return text


def _magnitudes(text: str, rules: LanguageRules) -> str:
    for word, replacement in rules.magnitudes.items():
        text = re.sub(rf"\b{word}\b", replacement, text, flags=re.IGNORECASE)
    return text


def _numbers(text: str, rules: LanguageRules) -> str:
    """
    Verbalise remaining bare numbers. Thousands separators are dropped, the
    integer part goes through the language's number_to_words, and a decimal
    part is read digit by digit after `decimal_word`. Without a number_to_words
    the digits stay as digits (separators still removed).
    """
    pattern = re.compile(rf"(?<![\w.])(?P<num>{_NUMBER})(?![\w])")

    def repl(m: re.Match) -> str:
        raw = m.group("num").replace(",", "")
        integer, _, fraction = raw.partition(".")
        if rules.number_to_words is None:
            return raw
        words = rules.number_to_words(integer)
        if fraction:
            digits = " ".join(rules.number_to_words(d) for d in fraction)
            dec = rules.decimal_word or "point"
            return f"{words} {dec} {digits}"
        return words

    return pattern.sub(repl, text)


def _tidy(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" +([,.;:!?])", r"\1", text)
    return text.strip()
