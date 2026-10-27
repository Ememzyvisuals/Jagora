"""Where her data came from, and where it may go.

Browser agents can quietly undo the web's oldest safety rule, the same-origin policy: a page that tricks the agent can
make it read something on one site (an inbox, a code, a balance) and carry it to another, something no web page
could ever do by itself (Roesner and Kohlbrenner, University of Washington, 2026). Jagora answers with two rules,
the same ideas as Google's Agent Origin Sets and information-flow labels:

1. Task sites. Each task has a short list of sites it may act on: sites she named, official sites, and sites she
   allows during the task. Every other site is read-only: Jagora can read it, but filling in or sending forms
   there needs her yes first.

2. Data labels. Every text Jagora reads is remembered with the site it came from. Before anything leaves for
   another site (typed into a box, put in a web address, sent as a search), Jagora checks whether it carries
   something read elsewhere: codes, long numbers, email addresses, or whole sentences. Her own words are hers to
   use anywhere; anything else read on another site needs her yes, and in a web address it is simply refused.
"""

from __future__ import annotations

import re
from urllib.parse import unquote, urlparse

# things worth stealing: email addresses, numbers of five or more digits (codes, phone, account and ID numbers),
# and mixed letter-and-number codes of six or more characters
SECRET = re.compile(
    r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"
    r"|\+?\d(?:[\d \-]{3,}\d)"
    r"|\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{6,}\b"
)
SHINGLE = 8  # a run of this many words copied from another site counts as carried text
PER_SITE = 300_000  # characters remembered per site


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def _tok(t: str) -> str:
    t = t.lower()
    return re.sub(r"[ \-+]", "", t) if re.fullmatch(r"\+?[\d \-]+", t) else t


def secrets_in(text: str) -> set[str]:
    out = set()
    for m in SECRET.finditer(text or ""):
        t = _tok(m.group(0))
        digits = sum(c.isdigit() for c in t)
        if t.isdigit() and len(t) < 5:
            continue
        if "@" not in t and digits < (5 if t.isdigit() else 3):
            continue  # years, short numbers and word-like ids are not secrets
        out.add(t)
    return out


def _shingles(text: str) -> set[str]:
    w = _norm(text).split()
    return {" ".join(w[i:i + SHINGLE]) for i in range(0, max(0, len(w) - SHINGLE + 1))}


class Flow:
    def __init__(self) -> None:
        self.read: dict[str, str] = {}  # site -> text read there
        self.read_secrets: dict[str, set[str]] = {}
        self.her = ""  # everything she said or typed in the chat
        self.her_secrets: set[str] = set()
        self.acts: set[str] = set()  # sites this task may act on
        self.links: set[str] = set()  # addresses that appeared as links on pages she was shown

    # ---- what Jagora learns ----------------------------------------------------------------------------------------
    def heard(self, text: str) -> None:
        """Her own words: hers to use on any site."""
        if text:
            self.her += " " + _norm(text)
            self.her_secrets |= secrets_in(text)

    def saw(self, site: str, text: str) -> None:
        """Text read on a site, labelled with that site."""
        if not site or not text:
            return
        body = self.read.get(site, "")
        if len(body) < PER_SITE:
            self.read[site] = (body + " " + _norm(text))[:PER_SITE]
        self.read_secrets.setdefault(site, set()).update(secrets_in(text))

    def link(self, url: str) -> None:
        """An address that a page itself linked to: opening it carries nothing new."""
        if url:
            self.links.add(url.split("#")[0].rstrip("/"))

    def allow(self, site: str) -> bool:
        """Add a site to the task's list; True when it is new."""
        if not site or site in self.acts:
            return False
        self.acts.add(site)
        return True

    # ---- the checks ------------------------------------------------------------------------------------------------
    def carried(self, text: str, here: str, whole_text: bool = True) -> tuple[str, str] | None:
        """Does this text, about to go to `here`, carry something read on another site that she never said herself?
        Returns (the site it came from, what it carries) or None."""
        if not text:
            return None
        for t in secrets_in(text):
            if t in self.her_secrets or t in self.her:
                continue
            for s, found in self.read_secrets.items():
                if s != here and t in found and t not in self.read_secrets.get(here, set()):
                    return s, t
        if whole_text:
            for sh in _shingles(text):
                if sh in self.her:
                    continue
                for s, body in self.read.items():
                    if s != here and sh in body and sh not in self.read.get(here, ""):
                        return s, " ".join(sh.split()[:6]) + "..."
        return None

    def in_address(self, url: str, dest: str) -> tuple[str, str] | None:
        """Does this web address smuggle something read on another site (in its path, query or #part)?"""
        if url.split("#")[0].rstrip("/") in self.links:
            return None
        p = urlparse(url)
        tail = unquote(" ".join([p.path.replace("/", " "), p.query.replace("&", " ").replace("=", " "), p.fragment]))
        return self.carried(tail, dest, whole_text=False)
