"""Finding things out: web search in the visible browser, ranking official sources first, and checking whether a
site really belongs to who it claims to be."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

from jagora.browser import Browser
from jagora.guard import guard, registrable

DDG = "https://html.duckduckgo.com/html/?q={q}&kl=ng-en"
BING = "https://www.bing.com/search?q={q}&cc=NG&setlang=en"

RESULTS_JS = r"""
() => {
  const out = [];
  for (const r of document.querySelectorAll('.result, li.b_algo')) {
    const a = r.querySelector('a.result__a, h2 a');
    if (!a) continue;
    const snip = r.querySelector('.result__snippet, .b_caption p, .b_lineclamp2, .b_lineclamp3');
    out.push({title: a.innerText.trim(), url: a.href, snippet: (snip ? snip.innerText : '').trim().slice(0, 300)});
  }
  return out;
}
"""


def _clean_url(u: str) -> str:
    """DuckDuckGo wraps result links (/l/?uddg=...); unwrap them."""
    p = urlparse(u)
    if "duckduckgo.com" in (p.hostname or "") and p.path.startswith("/l/"):
        return unquote(parse_qs(p.query).get("uddg", [u])[0])
    return u


async def search(browser: Browser, query: str, limit: int = 8) -> list[dict]:
    """Search the web in her browser tab (she sees it happen). Each result says whether its site is official."""
    results: list[dict] = []
    for engine in (DDG, BING):
        try:
            await browser.goto(engine.format(q=quote_plus(query)))
            await browser._settle()
            raw = await browser.page.evaluate(RESULTS_JS)
        except Exception:  # noqa: BLE001
            raw = []
        for r in raw:
            url = _clean_url(r["url"])
            if not url.startswith("http") or "duckduckgo.com" in url or "bing.com" in url:
                continue
            v = guard.check(url)
            if v.blocked:
                continue  # phishing, adult and lookalike sites never reach her or the model
            results.append({"title": r["title"][:140], "url": url, "site": v.site, "snippet": r["snippet"],
                            "official": v.official, "owner": v.owner, "betting": v.category == "gambling"})
        if results:
            break
    # official sources first, keeping the engine's order otherwise
    results.sort(key=lambda r: (not r["official"],))
    seen, out = set(), []
    for r in results:
        if r["url"] in seen:
            continue
        seen.add(r["url"])
        out.append(r)
    return out[:limit]


def check_official(url_or_site: str, claimed: str = "") -> dict:
    """Is this the real site of who it claims to be? Plain answer plus the reasons."""
    v = guard.check(url_or_site)
    site = v.site
    reasons: list[str] = []
    if v.official:
        reasons.append(v.reason)
        if claimed and v.owner and claimed.lower() not in v.owner.lower() and v.owner.lower() not in claimed.lower():
            reasons.append(f"note: it belongs to {v.owner}, not necessarily {claimed}")
        return {"site": site, "verdict": "official", "owner": v.owner, "reasons": reasons}
    if v.blocked:
        return {"site": site, "verdict": "fake or dangerous", "owner": "", "reasons": [v.reason]}
    if v.category == "gambling":
        return {"site": site, "verdict": "betting site", "owner": "", "reasons": [v.reason]}
    reasons.append(f"{site} is not on Jagora's list of official sites and does not use a .gov.ng or .edu.ng address")
    if re.search(r"\d{2,}|-ng\b|portal|online|verify|update|login", site.split(".")[0]):
        reasons.append("the name has patterns often used by copycat sites (extra words, numbers or hyphens)")
    return {"site": site, "verdict": "not confirmed", "owner": "", "reasons": reasons}


def same_site(a: str, b: str) -> bool:
    return registrable(a) == registrable(b)
