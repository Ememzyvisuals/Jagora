"""Finding things out: web search in the visible browser, ranking official sources first, and checking whether a
site really belongs to who it claims to be."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import logging

from jagora.browser import Browser
from jagora.config import settings
from jagora.guard import guard, registrable

log = logging.getLogger("jagora.research")
SERPER = "https://google.serper.dev/search"
_spent: set[str] = set()  # Serper keys whose searches have run out (until the server restarts)


async def serper(query: str, limit: int = 10) -> tuple[list[dict], str]:
    """Google's results for Nigeria through Serper, in well under a second, with no search page to load (a server's
    address gets empty or blocked search pages). Returns (results, Google's quick answer if it has one)."""
    import httpx

    for key in settings.serper_keys:
        if key in _spent:
            continue
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.post(SERPER, headers={"X-API-KEY": key, "Content-Type": "application/json"},
                                 json={"q": query, "gl": "ng", "hl": "en", "num": limit})
        except Exception as e:  # noqa: BLE001
            log.warning("serper unreachable: %s", e)
            return [], ""
        if r.status_code in (401, 402, 403, 429):
            log.warning("serper key ...%s refused (%s); trying the next", key[-4:], r.status_code)
            _spent.add(key)
            continue
        if r.status_code != 200:
            log.warning("serper failed %s", r.status_code)
            return [], ""
        d = r.json()
        quick = ""
        box = d.get("answerBox") or {}
        if box:
            quick = " ".join(str(box.get(k, "")) for k in ("title", "answer", "snippet") if box.get(k)).strip()
            if box.get("link"):
                quick += f" (from {box['link']})"
        elif d.get("knowledgeGraph", {}).get("description"):
            kg = d["knowledgeGraph"]
            quick = f"{kg.get('title', '')}: {kg['description']}" + (f" (from {kg['descriptionLink']})" if kg.get("descriptionLink") else "")
        out = [{"title": o.get("title", ""), "url": o.get("link", ""), "snippet": o.get("snippet", ""), "date": o.get("date", "")}
               for o in d.get("organic", [])]
        out += [{"title": n.get("title", ""), "url": n.get("link", ""), "snippet": n.get("snippet", "") or n.get("source", ""),
                 "date": n.get("date", "")} for n in d.get("topStories", [])[:3]]
        return out, quick[:400]
    return [], ""

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
    raw, quick = await serper(query) if settings.serper_keys else ([], "")
    for r in raw:
        v = guard.check(r["url"])
        if not r["url"].startswith("http") or v.blocked:
            continue
        results.append({"title": r["title"][:140], "url": r["url"], "site": v.site, "snippet": r["snippet"][:300],
                        "date": r.get("date", ""), "official": v.official, "owner": v.owner,
                        "betting": v.category == "gambling"})
    if quick:
        results.insert(0, {"title": "Google's quick answer", "url": "", "site": "", "snippet": quick, "date": "",
                           "official": False, "owner": "", "betting": False, "quick": True})
    for engine in (DDG, BING) if not results else ():
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
    results.sort(key=lambda r: (not r.get("quick"), not r["official"]))
    seen, out = set(), []
    for r in results:
        if r["url"] and r["url"] in seen:
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


async def check_link(url: str) -> dict:
    """Where a link really goes, without opening it in a browser: every redirect hop, shorteners, IP loggers (links that
    record who opened them), tracking codes that identify her, and the guard's verdict on the final site."""
    import httpx
    from urllib.parse import parse_qsl, urlparse

    from jagora.guard import SHORTENERS, TRACKING_PARAMS

    if "://" not in url:
        url = "https://" + url.strip()
    hops, warnings = [url], []
    final = url
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False, headers={"User-Agent": "Mozilla/5.0 Jagora link check"}) as c:
            for _ in range(8):
                v = guard.check(final)
                if v.blocked:
                    break  # never touch a dangerous address, even to follow it
                r = await c.head(final)
                if r.status_code in (405, 403, 400):
                    r = await c.get(final)
                loc = r.headers.get("location")
                if r.status_code in (301, 302, 303, 307, 308) and loc:
                    final = str(httpx.URL(final).join(loc))
                    hops.append(final)
                    continue
                m = re.search(r'http-equiv=["\']?refresh["\']?[^>]*url=([^"\'>]+)', r.text[:4000] if r.request.method == "GET" else "", re.I)
                if m:
                    final = str(httpx.URL(final).join(m.group(1).strip()))
                    hops.append(final)
                    continue
                break
    except Exception as e:  # noqa: BLE001
        warnings.append(f"could not follow the link all the way ({type(e).__name__})")
    sites = [registrable(h) for h in hops]
    for h, st in zip(hops, sites):
        v = guard.check(h)
        if v.category == "iplogger":
            warnings.append(f"{st} is an IP logger: opening it records your IP address and rough location")
        elif v.blocked:
            warnings.append(f"{st}: {v.reason}")
    if any(st in SHORTENERS for st in sites):
        warnings.append("the link is shortened, which hides where it really goes")
    tracking = sorted({k for h in hops for k, _ in parse_qsl(urlparse(h).query) if TRACKING_PARAMS.match(k)})
    if tracking:
        warnings.append("the link carries tracking codes (" + ", ".join(tracking[:6]) + ") that tell the sender you opened it")
    fv = guard.check(final)
    verdict = "dangerous" if any(guard.check(h).blocked for h in hops) else "tracking" if tracking or any(s in SHORTENERS for s in sites) else \
        "official" if fv.official else "unknown site"
    clean = final.split("?")[0] if tracking else final
    return {"final": final, "clean": clean, "hops": hops, "verdict": verdict, "warnings": warnings, "owner": fv.owner}


def same_site(a: str, b: str) -> bool:
    return registrable(a) == registrable(b)
