"""Which language a piece of text is in, and which language the call is in.

STORM ASR writes down whatever language is spoken (the `language` it receives is
only a hint), and John reads whatever language the text is in. So language only
matters in two places: the reply the LLM writes, and the number normalisation
before synthesis. Both read `CallLanguage`.

Detection is a light lexical heuristic. It only has to tell five languages
apart in short shopping sentences, and it runs in microseconds on every
sentence, so the voice never waits on it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

LANGS = ("en", "yo", "ha", "ig", "pcm")
NAMES = {"en": "English", "yo": "Yoruba", "ha": "Hausa", "ig": "Igbo", "pcm": "Nigerian Pidgin"}

# Letters that only one of the languages uses.
_YO_LETTERS = re.compile(r"[ẹọṣẸỌṢ]|[àáèéìíòóùú]\S*[àáèéìíòóùú]")
_HA_LETTERS = re.compile(r"[ɓɗƙƴƁƊƘƳ]")
_IG_LETTERS = re.compile(r"[ịụṅỊỤṄ]")

_WORDS = {
    "pcm": {
        "wetin", "dey", "una", "abeg", "na", "sef", "wey", "comot", "oya", "abi", "no", "fit",
        "make", "dem", "pikin", "sabi", "wahala", "shey", "nawa", "kain", "e", "don", "go",
        "how", "far", "carry", "dash", "biko",
    },
    "yo": {
        "ẹ", "e", "ni", "mo", "fẹ", "fe", "ra", "kí", "ki", "lẹ", "le", "ṣé", "se", "bawo", "báwo",
        "jọ", "jo", "ẹ̀", "owó", "owo", "elo", "èló", "melo", "mélòó", "o", "wa", "rí", "ri",
        "ọjà", "oja", "aago", "àpò", "apo", "bata", "bàtà", "fóònù", "foonu", "dáadáa", "daadaa",
        "nkan", "nǹkan", "jẹ", "je", "kò", "ko", "sí", "si", "pẹ̀lú", "pelu",
    },
    "ha": {
        "ina", "son", "nawa", "kudi", "kuɗi", "da", "shi", "ne", "ce", "wannan", "akwai",
        "sannu", "yaya", "don", "allah", "jaka", "agogo", "waya", "takalmi", "mai", "kyau",
        "zan", "saya", "nake", "kake", "kina", "me", "kuke", "sayar", "naira", "dubu",
    },
    "ig": {
        "biko", "achọrọ", "achoro", "m", "ego", "ole", "ọ", "o", "bụ", "bu", "nke", "a", "ahụ",
        "ahu", "kedu", "ihe", "unu", "nwere", "ụlọ", "akpa", "elekere", "akpụkpọ", "ekwentị",
        "ekwenti", "daalụ", "daalu", "zụta", "zuta", "nnọọ", "nnoo",
    },
}
_EN_WORDS = {
    "the", "i", "want", "show", "me", "a", "and", "under", "below", "add", "to", "my", "cart",
    "please", "how", "much", "is", "it", "do", "you", "have", "what", "which", "can", "first",
    "second", "third", "remove", "checkout", "thanks", "bag", "watch", "phone", "shoes",
}

_TOKEN = re.compile(r"[^\W\d_]+", re.UNICODE)

# "speak Hausa", "switch to Yoruba", "sọ Yorùbá", "make you talk pidgin"
_NAMED = {
    "en": r"english|oyinbo|bekee",
    "yo": r"yor[uù]b[aá]|yoruba",
    "ha": r"hausa",
    "ig": r"igbo",
    "pcm": r"pidgin|broken",
}


def detect(text: str, default: str = "en") -> str:
    """Best guess at the language of `text` (one of LANGS)."""
    if not text or not text.strip():
        return default
    if _HA_LETTERS.search(text):
        return "ha"
    if _IG_LETTERS.search(text):
        return "ig"
    if _YO_LETTERS.search(text):
        return "yo"
    words = [w.lower() for w in _TOKEN.findall(text)]
    if not words:
        return default
    scores = {lang: sum(w in vocab for w in words) for lang, vocab in _WORDS.items()}
    scores["en"] = sum(w in _EN_WORDS for w in words)
    # Pidgin shares most words with English; a couple of pidgin markers decide it.
    pidgin_markers = sum(w in {"wetin", "dey", "una", "abeg", "sef", "wey", "comot", "oya", "sabi", "wahala", "pikin", "nawa"} for w in words)
    if pidgin_markers >= 1 and scores["pcm"] >= 2:
        return "pcm"
    best = max(scores, key=lambda k: scores[k])
    if scores[best] == 0:
        return default
    # English wins ties: short mixed sentences are usually English with a loanword.
    if scores["en"] >= scores[best]:
        return "en"
    return best


# Words that mark a turn as one language, chosen so they are rare in the
# others. Written both with and without tone marks, since the ASR may drop them.
# Product words ("iPhone", "specification") are ignored: they appear in every
# language.
_MARKERS = {
    "ha": {
        "ina", "son", "zan", "zai", "siya", "saya", "sayi", "nawa", "kudi", "kuɗi", "wannan", "akwai", "yaya",
        "sannu", "gode", "yauwa", "toh", "kana", "kina", "kuke", "nake", "bani", "ba", "bari", "dinsa", "dinta",
        "ɗinsa", "ɗinta", "dina", "ɗina", "shi", "ita", "mai", "kyau", "kuma", "don", "allah", "haka", "yanzu",
        "wani", "wata", "nemo", "nuna", "mini", "min", "jaka", "agogo", "waya", "takalmi", "ka", "ki", "ku",
        "ya", "ta", "su", "da", "ne", "ce", "ko", "me", "mene", "menene", "lafiya", "wai", "ga", "farashi",
        "farashinsa", "dubu", "naira", "yaushe", "ina", "inda", "zamu", "muna", "kuna", "suna",
    },
    "yo": {
        "mo", "fe", "fẹ", "fẹ́", "ra", "jowo", "jọ̀ọ́", "jọwọ", "se", "ṣé", "ṣe", "eyi", "èyí", "elo", "èló", "owo",
        "owó", "bata", "bàtà", "apo", "àpò", "foonu", "fóònù", "aago", "oja", "ọjà", "ki", "kí", "kini", "kínni",
        "kilode", "ẹ", "e", "ni", "ti", "ko", "kò", "si", "sí", "wa", "wà", "je", "jẹ", "naa", "náà", "mi", "yin",
        "yín", "won", "wọn", "bawo", "báwo", "daadaa", "dáadáa", "o", "ó", "lo", "lọ", "fun", "fún", "pelu",
        "pẹ̀lú", "ati", "àti", "nkan", "nǹkan", "ese", "ẹ", "ẹ̀", "fi", "han", "hàn", "wo", "dara", "dára",
    },
    "ig": {
        "biko", "achọrọ", "achoro", "chọrọ", "choro", "ego", "ole", "olee", "kedu", "ihe", "nke", "bụ", "bu",
        "ahụ", "ahu", "nwere", "akpa", "elekere", "akpụkpọ", "ekwentị", "ekwenti", "daalụ", "daalu", "zụta",
        "zuta", "nnọọ", "nnoo", "ndewo", "gị", "gi", "ka", "ị", "m", "ga", "na", "unu", "anyị", "anyi", "gosi",
        "gosipụta", "mma", "ọzọ", "ozo", "ugbu", "a",
    },
    "pcm": {
        "wetin", "dey", "una", "abeg", "sef", "wey", "comot", "oya", "sabi", "wahala", "pikin", "nawa", "abi",
        "shey", "don", "fit", "make", "dem", "carry", "na", "no", "go", "how", "far", "e", "am", "for", "di", "wan",
    },
}
# The words only one language uses: these alone can decide a short turn.
_STRONG = {
    "ha": {"zan", "zai", "siya", "saya", "sayi", "nawa", "wannan", "akwai", "sannu", "gode", "yauwa", "bani", "dinsa",
           "dinta", "ɗinsa", "ɗinta", "nemo", "mini", "farashi", "farashinsa", "kuke", "nake", "kina", "lafiya", "takalmi"},
    "yo": {"jowo", "jọ̀ọ́", "jọwọ", "foonu", "fóònù", "bata", "bàtà", "kini", "kínni", "bawo", "báwo", "dáadáa",
           "daadaa", "èló", "elo", "owó", "náà", "pẹ̀lú", "fẹ́", "ṣé", "nǹkan", "àpò", "ọjà", "kilode"},
    "ig": {"biko", "achọrọ", "achoro", "chọrọ", "kedu", "ekwentị", "ekwenti", "daalụ", "daalu", "zụta", "zuta",
           "nnọọ", "ndewo", "anyị", "olee", "gosi"},
    "pcm": {"wetin", "dey", "una", "abeg", "sef", "wey", "comot", "oya", "sabi", "wahala", "pikin", "shey", "wan", "dem"},
}
_ENGLISH = {
    "i", "want", "need", "show", "me", "please", "the", "a", "an", "and", "is", "are", "what", "which", "how",
    "much", "can", "you", "my", "to", "in", "of", "with", "under", "below", "above", "add", "remove", "cart",
    "checkout", "this", "that", "it", "do", "have", "buy", "looking", "for", "some", "any", "good", "best",
    "cheap", "cheaper", "price", "thanks", "thank", "yes", "no", "okay", "first", "second", "third", "one",
    "two", "three", "go", "back", "home", "open", "close", "pay", "confirm", "where", "there", "here", "let",
}


def spoken_language(text: str) -> str | None:
    """The language of a shopper's turn when the words make it clear, else None.

    Looks at everyday words, not product names, so "zai siya iPhone 13 Pro,
    ka bari specification dinsa" is Hausa and "mo fe ra bata" is Yoruba.
    """
    words = [w.lower() for w in _TOKEN.findall(text or "")]
    if not words:
        return None
    if _HA_LETTERS.search(text):
        return "ha"
    if _IG_LETTERS.search(text):
        return "ig"
    scores = {lang: sum(w in vocab for w in words) + 2 * sum(w in _STRONG[lang] for w in words) for lang, vocab in _MARKERS.items()}
    scores["en"] = sum(w in _ENGLISH for w in words)
    if _YO_LETTERS.search(text):
        scores["yo"] += 3
    best = max(scores, key=lambda k: scores[k])
    ranked = sorted(scores.values(), reverse=True)
    strong_hit = best != "en" and any(w in _STRONG[best] for w in words)
    # Pidgin borrows English words; one Pidgin marker among English means Pidgin.
    if best == "en" and any(w in _STRONG["pcm"] for w in words):
        return "pcm"
    if ranked[0] >= 2 and (ranked[0] >= ranked[1] + 2 or strong_hit):
        return best
    return None


def named_language(text: str) -> str | None:
    """The language named in a request like "speak Hausa", if any."""
    low = text.lower()
    for code, pattern in _NAMED.items():
        if re.search(rf"\b(?:{pattern})\b", low):
            return code
    return None


@dataclass
class CallLanguage:
    """Language state for one call.

    `locked` is set when the shopper asks for a language ("speak Hausa") and
    holds until they ask for another. Without a lock the agent mirrors the
    language of the shopper's last turn (`heard`).
    """

    heard: str = "en"
    locked: str | None = None
    spoken: str | None = None  # the latest turn's language, when clear
    said: str | None = None  # the language John last spoke in, when clear (what the conversation is in)
    checkout: str | None = None  # held from the moment the checkout opens until it closes
    history: list[str] = field(default_factory=list)

    @property
    def reply(self) -> str:
        return self.locked or self.heard

    @property
    def asr_hint(self) -> str:
        # Only a hint: STORM ASR transcribes what is actually spoken.
        return self.locked or self.heard

    def observe(self, user_text: str) -> str | None:
        """The shopper's latest turn: which language it is in, if the words make it clear."""
        lang = spoken_language(user_text)
        self.spoken = lang
        if lang:
            self.heard = lang
            self.history.append(lang)
        return lang

    @property
    def steps(self) -> str:
        """The language for fixed lines (the checkout steps): the conversation's language.
        "Confirm" or "one two three four" are English words even in a Pidgin or Yoruba
        conversation, so they must not decide it; what John has been speaking does."""
        return self.locked or self.checkout or self.said or self.heard

    def hold_for_checkout(self) -> str:
        """The checkout opens: every step, through the payment, stays in the conversation's language."""
        self.checkout = self.locked or self.said or self.heard
        return self.checkout

    def release_checkout(self) -> None:
        self.checkout = None

    def note_reply(self, text: str) -> None:
        """John is about to say `text`: remember its language when it is clear."""
        lang = spoken_language(text)
        if lang:
            self.said = lang

    def observe_soft(self, user_text: str) -> str | None:
        """A short control turn (confirm, cancel, digits): it may move the conversation into a
        Nigerian language, never back to English on the strength of words like "confirm"."""
        lang = spoken_language(user_text)
        if lang and lang != "en":
            self.heard = self.said = lang
            if self.checkout:
                self.checkout = lang
            self.history.append(lang)
        return lang

    def lock(self, code: str) -> None:
        if code not in LANGS:
            raise ValueError(code)
        self.locked = code

    def unlock(self) -> None:
        self.locked = None
