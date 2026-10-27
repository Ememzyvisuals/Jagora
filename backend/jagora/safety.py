"""The safety gate. Plain rules, checked in code before every action the model asks for.

The model proposes; this decides. It cannot be argued with by the model or by text on a web page:
- Jagora never types passwords, PINs, one-time codes, card details, BVN or NIN. She types those herself.
- Anything that submits, pays, sends, agrees or deletes waits for her spoken or tapped "yes".
- Leaving the site she started on is announced to her first.
- Downloading app installers and programs is refused outright.
- Her account's locks are hers: changing a password, turning off two-step login, changing the recovery email or
  phone, deleting or closing an account, and adding a new person to send money to are done by her (Take over),
  never by Jagora, whatever a page or a request says.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from urllib.parse import urlparse

from jagora.browser import Element
from jagora.fields import SECRET, field_kind


class Verdict(str, Enum):
    ALLOW = "allow"          # do it now
    CONFIRM = "confirm"      # ask her first, do it only after "yes"
    HANDOFF = "handoff"      # she must do this herself (secrets)
    BLOCK = "block"          # never


@dataclass
class Decision:
    verdict: Verdict
    reason: str  # plain English, for the model to explain in her language and for the run log

    @property
    def allowed(self) -> bool:
        return self.verdict == Verdict.ALLOW


COMMIT = re.compile(
    r"\b(submit|send|pay|transfer|confirm|register|apply|buy|purchase|checkout|check out|order|book|subscribe|donate|"
    r"withdraw|delete|remove|cancel (my|subscription|account)|sign ?up|create account|finish|complete|proceed|"
    r"make payment|accept|agree)\b", re.I)
AGREE = re.compile(r"\b(agree|accept|consent|terms|conditions|privacy)\b", re.I)
INSTALLER = re.compile(r"\.(apk|apks|xapk|exe|msi|msix|appx|dmg|pkg|deb|rpm|appimage|bat|cmd|scr|jar|ps1|vbs|hta|lnk|iso)(\?|#|$)", re.I)
HER_LOCKS = re.compile(
    r"\b(change|reset|update|set) (your |my |the )?(new )?(password|pin|passcode)\b|\b(disable|turn off|remove|deactivate) "
    r"(the )?(two[- ]factor|2fa|two[- ]step|2-step|authenticator|login approvals?)|\b(change|update|edit) (the |your |my )?"
    r"(recovery|backup|security) (email|phone|number|question)|\b(delete|close|deactivate|terminate) (my |your |this |the )?account\b|"
    r"\badd (a )?(new )?(beneficiary|recipient|payee|trusted device|device)\b|\b(link|add) (a )?new (bank|card)\b", re.I)


def site(url: str) -> str:
    """The site a page belongs to: "https://portal.jamb.gov.ng/x" -> "jamb.gov.ng"."""
    host = (urlparse(url).hostname or "").lower()
    if host in ("localhost", "") or host.replace(".", "").isdigit():
        return host  # local addresses and IPs are one site each
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in ("gov", "com", "org", "edu", "net", "co", "ac", "sch", "mil") and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def check_click(el: Element, current_url: str, home_site: str) -> Decision:
    if el.disabled:
        return Decision(Verdict.BLOCK, "that button is switched off on the page")
    if el.href and INSTALLER.search(el.href):
        return Decision(Verdict.BLOCK, "that link downloads an app installer, which Jagora never opens")
    words = f"{el.label} {el.name}"
    if el.kind in ("button", "link") and HER_LOCKS.search(words):
        return Decision(Verdict.HANDOFF, f'"{el.label}" changes the locks on her account or who can receive her money; '
                                         "she does this herself on the page")
    if el.kind == "checkbox" and AGREE.search(words) and not el.checked:
        return Decision(Verdict.CONFIRM, f'ticking "{el.label}" agrees to something on her behalf')
    if el.type == "reset":
        return Decision(Verdict.CONFIRM, f'"{el.label}" clears everything already filled in')
    if el.kind in ("button", "link") and (el.type == "submit" or COMMIT.search(words)):
        return Decision(Verdict.CONFIRM, f'"{el.label}" sends or commits something')
    if el.kind == "link" and el.href and home_site and site(el.href) and site(el.href) != home_site:
        return Decision(Verdict.CONFIRM, f"that link leaves {home_site} for {site(el.href)}")
    return Decision(Verdict.ALLOW, "")


def check_type(el: Element) -> Decision:
    if el.disabled:
        return Decision(Verdict.BLOCK, "that box is switched off on the page")
    kind = field_kind(el)
    if kind in SECRET:
        return Decision(Verdict.HANDOFF, f'"{el.label or kind}" is private ({kind}); she types it herself, Jagora never sees it')
    if el.kind not in ("text box",):
        return Decision(Verdict.BLOCK, f'element {el.id} is a {el.kind}, not a box you can type in')
    return Decision(Verdict.ALLOW, "")


def check_navigate(url: str, home_site: str) -> Decision:
    if INSTALLER.search(url):
        return Decision(Verdict.BLOCK, "that address downloads an app installer")
    scheme = urlparse(url if "://" in url else "https://" + url).scheme
    if scheme not in ("http", "https", "file"):
        return Decision(Verdict.BLOCK, f"Jagora does not open {scheme} links")
    if home_site and site(url) and site(url) != home_site:
        return Decision(Verdict.CONFIRM, f"that leaves {home_site} for {site(url)}")
    return Decision(Verdict.ALLOW, "")
