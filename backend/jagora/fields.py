"""What a form field is for, how a spoken answer becomes what the field needs, and whether it is right.

Speech recognition writes "zero seven zero one one one one..." or "òdo méje òdo ọ̀kan..." or "bisi at gmail dot com".
Forms need 07011111111 and bisi@gmail.com. Code does this conversion, never the model, and then checks the result
against the field's own rules before anything is typed.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date

from jagora.browser import Element

# ---- what a field is ------------------------------------------------------------------------------------------

SECRET = {"password", "pin", "otp", "card", "cvv", "bvn", "nin"}  # Jagora never types these: she types them herself

_RULES: list[tuple[str, str]] = [
    ("password", r"pass ?word|passcode|\bpwd\b"),
    ("otp", r"\botp\b|one.?time|verification code|security code|token|code sent"),
    ("pin", r"\bpin\b"),
    ("cvv", r"\bcvv\b|\bcvc\b|security number"),
    ("card", r"card ?number|debit card|credit card|\bpan\b"),
    ("bvn", r"\bbvn\b|bank verification"),
    ("nin", r"\bnin\b|national identi(ty|fication) number"),
    ("email", r"e-?mail"),
    ("phone", r"phone|mobile|telephone|whatsapp|\btel\b|gsm"),
    ("date", r"date of birth|\bdob\b|birthday|\bdate\b"),
    ("name", r"full ?name|first ?name|last ?name|surname|middle ?name|other ?names?|\bname\b"),
    ("account", r"account (number|no)|\bnuban\b"),
]


def field_kind(el: Element) -> str:
    t = (el.type or "").lower()
    ac = (el.autocomplete or "").lower()
    if t == "password" or ac in ("current-password", "new-password"):
        return "password"
    if ac == "one-time-code":
        return "otp"
    if ac.startswith("cc-"):
        return "cvv" if ac == "cc-csc" else "card"
    if t == "email" or ac == "email":
        return "email"
    if t == "tel" or ac.startswith("tel"):
        return "phone"
    if t == "date" or ac == "bday":
        return "date"
    words = " ".join([el.label, el.name, el.placeholder]).lower()
    for kind, pattern in _RULES:
        if re.search(pattern, words):
            return kind
    if t == "number":
        return "number"
    return "text"


# ---- spoken numbers in five languages -------------------------------------------------------------------------

def fold(s: str) -> str:
    """Lowercase without tone marks or underdots: "ẹ̀jọ" -> "ejo", "ɗaya" -> "daya"."""
    s = s.replace("ɗ", "d").replace("Ɗ", "d").replace("ƙ", "k").replace("ɓ", "b")
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


DIGIT_WORDS: dict[str, str] = {}
for digit, words in {
    "0": "zero oh nought odo sifiri sifili efu ofu",
    "1": "one okan kan ookan daya otu",
    "2": "two eji meji biyu abuo",
    "3": "three eta meta uku ato",
    "4": "four erin merin hudu ano",
    "5": "five arun marun biyar ise",
    "6": "six efa mefa shida isii",
    "7": "seven eje meje bakwai asaa",
    "8": "eight ejo mejo takwas asato",
    "9": "nine esan mesan tara itoolu iteghete",
}.items():
    for w in words.split():
        DIGIT_WORDS[w] = digit
REPEAT = {"double": 2, "triple": 3}


def spoken_digits(text: str) -> str:
    """Digits from speech: "zero seven zero, one one one, double one" -> "07011111", "òdo méje òdo" -> "070".
    Digits already written stay as they are. Words that are not numbers are ignored."""
    out: list[str] = []
    repeat = 1
    for raw in re.findall(r"\+?\d+|[^\W\d_]+", fold(text)):
        if raw.lstrip("+").isdigit():
            out.append(raw)
            repeat = 1
        elif raw in REPEAT:
            repeat = REPEAT[raw]
        elif raw in DIGIT_WORDS:
            out.append(DIGIT_WORDS[raw] * repeat)
            repeat = 1
    return "".join(out)


# ---- each kind of value ---------------------------------------------------------------------------------------

@dataclass
class Checked:
    ok: bool
    value: str          # what goes into the field
    shown: str          # how it is shown and read back to the user
    problem: str = ""   # plain English, for the model to explain in the user's language


NG_MOBILE = re.compile(r"^0[789][01]\d{8}$")


def phone(said: str) -> Checked:
    d = spoken_digits(said)
    if d.startswith("+234"):
        d = "0" + d[4:]
    elif d.startswith("234") and len(d) == 13:
        d = "0" + d[3:]
    elif len(d) == 10 and d[0] in "789":
        d = "0" + d
    shown = f"{d[:4]} {d[4:7]} {d[7:]}" if len(d) == 11 else d
    if not NG_MOBILE.match(d):
        why = f"that has {len(d)} digits; a Nigerian mobile number has 11 and starts with 070, 080, 081, 090 or 091" \
            if len(d) != 11 else "a Nigerian mobile number starts with 070, 080, 081, 090 or 091"
        return Checked(False, d, shown, why)
    return Checked(True, d, shown)


EMAIL = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$")
_SPOKEN_EMAIL = [
    (r"\s+at\s+|\s+@\s+", "@"), (r"\s+dot\s+", "."), (r"\s+(underscore|under score)\s+", "_"),
    (r"\s+(dash|hyphen|minus)\s+", "-"), (r"\s+plus\s+", "+"),
]
_DOMAINS = {"gmail": "gmail.com", "yahoo": "yahoo.com", "outlook": "outlook.com", "hotmail": "hotmail.com", "icloud": "icloud.com"}


def email(said: str) -> Checked:
    s = " " + said.strip().lower() + " "
    for pat, rep in _SPOKEN_EMAIL:
        s = re.sub(pat, rep, s)
    s = re.sub(r"\s+", "", s).strip(".")
    s = re.sub(r"\.c[o0]m$", ".com", s)
    if "@" in s and "." not in s.split("@", 1)[1] and s.split("@", 1)[1] in _DOMAINS:
        s = s.split("@", 1)[0] + "@" + _DOMAINS[s.split("@", 1)[1]]  # "bisi at gmail" -> bisi@gmail.com
    if not EMAIL.match(s):
        return Checked(False, s, s, "that does not look like a full email address (name, @, then a domain like gmail.com)")
    return Checked(True, s, s)


_MONTHS = {m: i for i, m in enumerate(
    "january february march april may june july august september october november december".split(), 1)}
_MONTHS.update({m[:3]: i for m, i in list(_MONTHS.items())})
_MONTHS["sept"] = 9


def birth_date(said: str, today: date | None = None) -> Checked:
    """"12 March 1999", "12/03/1999" (day first, as in Nigeria), "1999-03-12" -> 1999-03-12."""
    today = today or date.today()
    s = fold(said).replace(",", " ")
    y = m = d = None
    if mm := re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", s):
        y, m, d = map(int, mm.groups())
    elif mm := re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", s):
        d, m, y = map(int, mm.groups())
    else:
        words = s.split()
        mon = next((_MONTHS[w.rstrip(".")] for w in words if w.rstrip(".") in _MONTHS), None)
        nums = [int(n) for n in re.findall(r"\d+", s)]
        yr = next((n for n in nums if n > 1900), None)
        dy = next((n for n in nums if 1 <= n <= 31 and n != yr), None)
        if mon and yr and dy:
            y, m, d = yr, mon, dy
    try:
        when = date(y, m, d)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return Checked(False, "", said, "I could not read a full date (day, month and year)")
    if when >= today or when.year < today.year - 110:
        return Checked(False, when.isoformat(), when.strftime("%-d %B %Y"), "that date is not a possible date of birth")
    return Checked(True, when.isoformat(), when.strftime("%-d %B %Y"))


def person_name(said: str) -> Checked:
    words = [w for w in re.split(r"\s+", said.strip()) if w]
    shown = " ".join(w[:1].upper() + w[1:] for w in words)
    if not words or any(ch.isdigit() for ch in shown):
        return Checked(False, shown, shown, "a name should be words, without numbers")
    return Checked(True, shown, shown)


def check(kind: str, said: str) -> Checked:
    """The value to type for a field of this kind, made from what was said, and whether it is valid."""
    if kind == "phone":
        return phone(said)
    if kind == "email":
        return email(said)
    if kind == "date":
        return birth_date(said)
    if kind == "name":
        return person_name(said)
    v = said.strip()
    return Checked(bool(v), v, v, "" if v else "nothing to type")


# values a person must confirm before they go in: the ones speech recognition gets wrong most
READ_BACK = {"phone", "email", "date", "name", "account"}
