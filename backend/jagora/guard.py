"""Web safety for every page Jagora opens, enforced in the browser itself (the model cannot turn it off).

- Adult, phishing and malware sites: blocked before they load. Daily-updated public lists, plus a lookalike check
  against the real sites of Nigerian banks, schools, exam bodies and government, plus a content check on pages no
  list knows.
- Betting sites: held until she says yes (her choice, once per site per session).
- Ads and trackers: their requests are cut off; pop-up ads and full-screen overlays are closed; cookie banners
  are declined.
- Pop-up tabs and redirects the agent did not ask for are closed or undone; installers never download; site
  prompts for notifications, location, camera and microphone are refused.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from jagora.config import DATA_DIR

log = logging.getLogger("jagora.guard")
LISTS_DIR = DATA_DIR / "blocklists"

# Public lists, refreshed once a day. Hosts format or one domain per line.
FEEDS = {
    "adult": ["https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts"],
    "gambling": ["https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts"],
    "malicious": ["https://urlhaus.abuse.ch/downloads/hostfile/",
                  "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt"],
    "ads": ["https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"],
}

# Always known, even with no network: the commonest ad networks and Nigerian betting brands.
SEED = {
    "ads": {"doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com", "adnxs.com",
            "taboola.com", "outbrain.com", "popads.net", "popcash.net", "propellerads.com", "adsterra.com", "exoclick.com",
            "mgid.com", "revcontent.com", "criteo.com", "pubmatic.com", "rubiconproject.com", "openx.net", "amazon-adsystem.com",
            "moatads.com", "scorecardresearch.com", "hotjar.com", "onclickads.net", "adcash.com", "hilltopads.net",
            "a-ads.com", "clickadu.com", "juicyads.com", "trafficjunky.net", "monetag.com", "galaksion.com"},
    "gambling": {"bet9ja.com", "sportybet.com", "betking.com", "1xbet.com", "1xbet.ng", "nairabet.com", "msport.com",
                 "betway.com.ng", "merrybet.com", "betnaija.com", "bangbet.com", "22bet.com", "melbet.com", "paripesa.ng",
                 "accessbet.com", "surebet247.com", "livescorebet.com", "betano.ng", "frapapa.com", "betwinner.com"},
    "adult": set(),
    "malicious": set(),
}

ADULT_WORDS = re.compile(r"porn|xxx|xvideo|xhamster|hentai|nsfw|onlyfans|camgirl|sexcam|redtube|youporn|brazzers|livejasmin|chaturbate|stripchat|nude", re.I)
ADULT_TEXT = re.compile(r"\b(porn|xxx|nude|naked|sex ?videos?|hot ?girls|18\+ ?only|adult content|explicit|milf|hentai|webcam ?girls?|escort)\b", re.I)
GAMBLING_WORDS = re.compile(r"\bbet(ting)?\b|casino|jackpot|sportsbook|slots?\b|odds", re.I)

# Real sites, by who they belong to. Used to say "this is the official site" and to catch lookalikes.
OFFICIAL: dict[str, str] = {
    "jamb.gov.ng": "JAMB", "waec.org.ng": "WAEC", "waecdirect.org": "WAEC", "neco.gov.ng": "NECO", "nabteb.gov.ng": "NABTEB",
    "nimc.gov.ng": "NIMC", "immigration.gov.ng": "Nigeria Immigration Service", "cac.gov.ng": "CAC", "firs.gov.ng": "FIRS",
    "nysc.gov.ng": "NYSC", "frsc.gov.ng": "FRSC", "cbn.gov.ng": "Central Bank of Nigeria", "remita.net": "Remita",
    "nipost.gov.ng": "NIPOST", "inec.gov.ng": "INEC", "nbs.gov.ng": "NBS", "statehouse.gov.ng": "State House",
    "lagosstate.gov.ng": "Lagos State Government", "nuc.edu.ng": "NUC", "nerdc.gov.ng": "NERDC", "ncc.gov.ng": "NCC",
    "unilag.edu.ng": "University of Lagos", "ui.edu.ng": "University of Ibadan", "oauife.edu.ng": "Obafemi Awolowo University",
    "unn.edu.ng": "University of Nigeria, Nsukka", "abu.edu.ng": "Ahmadu Bello University", "lasu.edu.ng": "Lagos State University",
    "uniben.edu": "University of Benin", "unilorin.edu.ng": "University of Ilorin", "futa.edu.ng": "FUTA", "covenantuniversity.edu.ng": "Covenant University",
    "buk.edu.ng": "Bayero University Kano", "unijos.edu.ng": "University of Jos", "uniport.edu.ng": "University of Port Harcourt",
    "nou.edu.ng": "NOUN", "yabatech.edu.ng": "Yaba College of Technology", "unizik.edu.ng": "Nnamdi Azikiwe University",
    "gtbank.com": "GTBank", "gtco.com": "GTCO", "firstbanknigeria.com": "First Bank", "accessbankplc.com": "Access Bank",
    "zenithbank.com": "Zenith Bank", "ubagroup.com": "UBA", "fidelitybank.ng": "Fidelity Bank", "fcmb.com": "FCMB",
    "sterling.ng": "Sterling Bank", "unionbankng.com": "Union Bank", "wemabank.com": "Wema Bank", "stanbicibtcbank.com": "Stanbic IBTC",
    "ecobank.com": "Ecobank", "polarisbanklimited.com": "Polaris Bank", "kudabank.com": "Kuda", "opayweb.com": "OPay",
    "palmpay.com": "PalmPay", "moniepoint.com": "Moniepoint", "flyairpeace.com": "Air Peace", "arikair.com": "Arik Air",
    "flyoverland.com": "Overland Airways", "ibomair.com": "Ibom Air", "nrc.gov.ng": "Nigerian Railway Corporation",
    "jumia.com.ng": "Jumia", "konga.com": "Konga", "mtn.ng": "MTN Nigeria", "airtel.com.ng": "Airtel Nigeria", "gloworld.com": "Glo",
    "9mobile.com.ng": "9mobile", "ekedp.com": "Eko Electricity", "ikejaelectric.com": "Ikeja Electric",
}
from jagora.services import EXTRA_OFFICIAL  # noqa: E402

OFFICIAL.update(EXTRA_OFFICIAL)
# Words that, inside some other domain, suggest it is pretending to be one of the above.
BRAND_WORDS = {"jamb": "jamb.gov.ng", "waec": "waec.org.ng", "neco": "neco.gov.ng", "nimc": "nimc.gov.ng", "nysc": "nysc.gov.ng",
               "unilag": "unilag.edu.ng", "gtbank": "gtbank.com", "gtco": "gtco.com", "firstbank": "firstbanknigeria.com",
               "zenithbank": "zenithbank.com", "accessbank": "accessbankplc.com", "remita": "remita.net", "opay": "opayweb.com",
               "palmpay": "palmpay.com", "moniepoint": "moniepoint.com", "kuda": "kudabank.com", "cbn": "cbn.gov.ng",
               "immigration": "immigration.gov.ng", "frsc": "frsc.gov.ng", "inec": "inec.gov.ng", "airpeace": "flyairpeace.com",
               "ikejaelectric": "ikejaelectric.com", "ekedp": "ekedp.com", "ibedc": "ibedc.com", "nipost": "nipost.gov.ng",
               "nimc": "nimc.gov.ng", "efacility": "jamb.gov.ng", "waecdirect": "waecdirect.org"}
OFFICIAL_TLDS = (".gov.ng", ".edu.ng", ".mil.ng", ".gov", ".gov.uk", ".edu", ".int", ".ac.uk")
# Not a lookalike even though they contain a brand word: news, encyclopaedias, the big search and social sites.
NEUTRAL = {"wikipedia.org", "google.com", "bing.com", "duckduckgo.com", "youtube.com", "facebook.com", "x.com", "twitter.com",
           "linkedin.com", "punchng.com", "vanguardngr.com", "premiumtimesng.com", "guardian.ng", "thecable.ng", "channelstv.com",
           "myschool.ng", "schoolgist.com.ng", "nairaland.com", "legit.ng", "dailytrust.com", "bbc.com", "bbc.co.uk",
           "thenationonlineng.net", "tribuneonlineng.com", "myschoolgist.com"}


def registrable(host_or_url: str) -> str:
    """'https://portal.jamb.gov.ng/x' -> 'jamb.gov.ng'."""
    host = host_or_url
    if "/" in host_or_url or ":" in host_or_url:
        host = urlparse(host_or_url if "://" in host_or_url else "https://" + host_or_url).hostname or ""
    host = host.lower().strip(".")
    if host.startswith("www."):
        host = host[4:]
    if not host or host == "localhost" or host.replace(".", "").isdigit():
        return host
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in ("gov", "com", "org", "edu", "net", "co", "ac", "sch", "mil", "name") and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def _levenshtein(a: str, b: str) -> int:
    if abs(len(a) - len(b)) > 3:
        return 9
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


@dataclass
class SiteVerdict:
    site: str
    category: str  # ok | official | adult | malicious | lookalike | gambling | ads
    owner: str = ""
    reason: str = ""

    @property
    def blocked(self) -> bool:
        return self.category in ("adult", "malicious", "lookalike")

    @property
    def official(self) -> bool:
        return self.category == "official"


class Guard:
    def __init__(self) -> None:
        self.lists: dict[str, set[str]] = {k: set(v) for k, v in SEED.items()}
        self.loaded_at = 0.0

    # ---- lists -----------------------------------------------------------------------------------------------------

    def load_cached(self) -> None:
        for cat in FEEDS:
            f = LISTS_DIR / f"{cat}.txt"
            if f.exists():
                self.lists[cat] |= set(f.read_text().split())
        self.loaded_at = time.time()

    async def refresh(self) -> None:
        """Fetch the feeds (once a day). Keeps the cached copy when a feed is unreachable."""
        import httpx

        LISTS_DIR.mkdir(parents=True, exist_ok=True)
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
            for cat, urls in FEEDS.items():
                f = LISTS_DIR / f"{cat}.txt"
                if f.exists() and time.time() - f.stat().st_mtime < 86400:
                    continue
                found: set[str] = set()
                for u in urls:
                    try:
                        r = await c.get(u)
                        if r.status_code == 200:
                            found |= parse_list(r.text)
                    except Exception as e:  # noqa: BLE001
                        log.warning("blocklist %s unreachable: %s", u, e)
                if found:
                    f.write_text("\n".join(sorted(found)))
        self.load_cached()
        log.info("blocklists: %s", {k: len(v) for k, v in self.lists.items()})

    def _in(self, cat: str, host: str) -> bool:
        s = self.lists.get(cat, set())
        host = host.lower().strip(".")
        while host:
            if host in s:
                return True
            if "." not in host:
                return False
            host = host.split(".", 1)[1]
        return False

    # ---- verdicts --------------------------------------------------------------------------------------------------

    def check(self, url: str) -> SiteVerdict:
        p = urlparse(url if "://" in url else "https://" + url)
        host = (p.hostname or "").lower()
        site = registrable(host)
        if p.scheme in ("about", "data", "blob", "chrome") or not host or host in ("localhost", "127.0.0.1"):
            return SiteVerdict(site, "ok")
        if host.startswith("xn--") or ".xn--" in host:
            return SiteVerdict(site, "lookalike", reason="the address uses look-alike letters, a common phishing trick")
        if site in OFFICIAL:
            return SiteVerdict(site, "official", OFFICIAL[site], f"{site} is the official site of {OFFICIAL[site]}")
        if self._in("malicious", host):
            return SiteVerdict(site, "malicious", reason="this site is on public phishing and malware lists")
        if self._in("adult", host) or ADULT_WORDS.search(site):
            return SiteVerdict(site, "adult", reason="this is an adult site")
        look = self.lookalike(site)
        if look:
            return SiteVerdict(site, "lookalike", reason=look)
        if self._in("gambling", host):
            return SiteVerdict(site, "gambling", reason="this is a betting site")
        if site.endswith(OFFICIAL_TLDS):
            kind = "government" if ".gov" in site or ".mil" in site else "school"
            return SiteVerdict(site, "official", site.split(".")[0].upper(), f"{site} is a registered {kind} address ({site.split('.', 1)[1]})")
        return SiteVerdict(site, "ok")

    def lookalike(self, site: str) -> str:
        if site in NEUTRAL or site in OFFICIAL or site.endswith(OFFICIAL_TLDS):
            return ""
        name = site.split(".")[0]
        flat = unicodedata.normalize("NFKD", name).replace("-", "")
        for word, real in BRAND_WORDS.items():
            if word in flat and site != real:
                return f"{site} uses the name '{word}' but the real site is {real}"
        for real, owner in OFFICIAL.items():
            rn = real.split(".")[0]
            if len(rn) >= 5 and 0 < _levenshtein(flat, rn) <= 2:
                return f"{site} is spelled almost like {real} ({owner}), a common trick"
        return ""

    def is_ad(self, url: str) -> bool:
        host = (urlparse(url).hostname or "").lower()
        return bool(host) and (self._in("ads", host) or self._in("malicious", host))

    def page_text_flag(self, text: str) -> str:
        """For pages no list knows: lots of adult words means it is an adult page."""
        hits = len(ADULT_TEXT.findall(text[:6000]))
        return "adult" if hits >= 4 else ""


def parse_list(text: str) -> set[str]:
    out: set[str] = set()
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        host = parts[1] if len(parts) >= 2 and parts[0] in ("0.0.0.0", "127.0.0.1") else parts[0]
        host = host.lower().strip(".")
        if "." in host and host not in ("localhost", "0.0.0.0") and not host.replace(".", "").isdigit():
            out.add(host)
    return out


guard = Guard()

BLOCK_PAGE = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width">
<title>Blocked by Jagora</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#f4f7fb;
font-family:Georgia,serif;color:#1b1d22"><div style="max-width:520px;padding:32px;text-align:center">
<div style="font-size:44px">&#128737;</div><h1 style="font-size:26px;margin:12px 0">Jagora stopped this page</h1>
<p style="font-size:17px;line-height:1.5;color:#4a4e57">{reason}</p><p style="font-size:14px;color:#8a8f99">{site}</p></div>"""

# Runs in the page: closes cookie banners (declining where possible), pop-up ads and overlays that cover the page.
CLEAN_JS = r"""
() => {
  const done = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const txt = (e) => ((e.innerText || e.value || e.getAttribute('aria-label') || e.title || '') + '').trim().toLowerCase();
  const clickables = (root) => [...root.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit],span,div')].filter(vis);
  // 1. cookie banners: decline first, else only-necessary, else accept (a banner left open hides the page).
  //    Only real banners: a container (not a form field) whose words talk about cookies, pinned to the screen edge.
  const banners = [...document.querySelectorAll('div,section,aside,footer,dialog,[role=dialog],[role=region]')].filter(e => {
    if (!vis(e) || e.querySelector('input:not([type=checkbox]):not([type=button]):not([type=submit]),select,textarea')) return false;
    const t = txt(e); if (t.length > 1200 || !/cookie|we use (cookies|technologies)|your privacy choices|consent to (the use|our use)/.test(t)) return false;
    const s = getComputedStyle(e); return s.position === 'fixed' || s.position === 'sticky' || e.getAttribute('role') === 'dialog' || e.tagName === 'DIALOG';
  });
  const banner = banners.sort((a, b) => txt(a).length - txt(b).length)[0];
  if (banner) {
    const bs = clickables(banner).filter(b => txt(b).length < 40);
    const pick = bs.find(b => /^(reject|decline|deny|refuse)( all)?( cookies)?$|necessary only|only necessary|essential only|reject all/.test(txt(b)))
      || bs.find(b => /^(close|dismiss|×|✕|no,? thanks)$/.test(txt(b)))
      || bs.find(b => /^(accept|ok|okay|got it|i agree|i understand|allow)( all)?( cookies)?$/.test(txt(b)));
    if (pick) { pick.click(); done.push('cookie'); }
  }
  // 2. overlays: fixed or sticky boxes covering much of the screen, above the page
  const W = innerWidth, H = innerHeight;
  for (const e of [...document.querySelectorAll('body *')]) {
    const s = getComputedStyle(e);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    const area = (Math.min(r.right, W) - Math.max(r.left, 0)) * (Math.min(r.bottom, H) - Math.max(r.top, 0));
    const z = parseInt(s.zIndex || '0') || 0;
    const words = txt(e).slice(0, 400);
    const adish = /advert|sponsored|\bads?\b|subscribe|newsletter|download (our|the) app|get the app|sign up for|install|notification|allow|win |congratulations|spin|bonus/.test(words)
      || [...e.querySelectorAll('iframe')].some(f => /ads|doubleclick|syndication|pop/i.test(f.src));
    const big = area > W * H * 0.28;
    if (!(big && z >= 10) && !(adish && area > W * H * 0.06)) continue;
    if (e.closest('header,nav') && !adish) continue;  // a site's own sticky menu stays
    if (e.querySelector('input,select,textarea') && !adish) continue;  // a real form or sign-in box stays
    const close = clickables(e).find(b => /^(×|✕|x|close|close ad|skip|skip ad|no,? thanks|not now|maybe later|dismiss|continue to site)$/.test(txt(b))
      || /close|dismiss/i.test(b.getAttribute('aria-label') || '') || /close/i.test(b.className + ''));
    if (close) close.click();
    if (adish || !close) e.remove();  // ads go even when their close button does nothing
    done.push(adish ? 'ad' : 'overlay');
  }
  // 3. the page can scroll again
  for (const el of [document.documentElement, document.body]) if (el && getComputedStyle(el).overflow === 'hidden' && done.length) el.style.overflow = 'auto';
  return done;
}
"""


async def install(context, session) -> None:
    """Wire the guard into a Playwright browser context. `session` supplies .allowed (set of sites she said yes
    to), .expect_site (where the agent is going), .notice(kind, text) and .pending_permission(site) for betting."""
    await context.grant_permissions([])

    async def route(r):
        req = r.request
        url = req.url
        try:
            if req.resource_type != "document":
                if guard.is_ad(url):
                    return await r.abort()
                return await r.continue_()
            v = guard.check(url)
            if v.site in session.allowed:
                return await r.continue_()
            if v.blocked:
                session.notice("blocked", v)
                if req.is_navigation_request() and req.frame == req.frame.page.main_frame:
                    return await r.fulfill(status=200, content_type="text/html",
                                           body=BLOCK_PAGE.format(reason=v.reason.capitalize() + ".", site=v.site))
                return await r.abort()
            if v.category == "gambling":
                session.notice("gambling", v)
                return await r.fulfill(status=200, content_type="text/html", body=BLOCK_PAGE.format(
                    reason="This is a betting site. Jagora opens it only after you say yes.", site=v.site))
            if guard.is_ad(url) and req.frame != req.frame.page.main_frame:
                return await r.abort()
            return await r.continue_()
        except Exception:  # noqa: BLE001
            try:
                await r.continue_()
            except Exception:  # noqa: BLE001
                pass

    await context.route("**/*", route)

    def on_page(p):
        # a new tab the agent did not ask for (pop-under ads, redirect tricks) is closed at once
        if getattr(session, "opening", 0):
            return  # a tab Jagora opened itself
        async def check():
            try:
                await p.wait_for_load_state("commit", timeout=4000)
            except Exception:  # noqa: BLE001
                pass
            target = registrable(p.url) if p.url and p.url != "about:blank" else ""
            if session.expect_tab and (not target or target == session.expect_tab or session.expect_tab == "*"):
                session.adopt_tab(p)
                return
            session.notice("popup", SiteVerdict(target or "a pop-up", "ads", reason="a pop-up tab opened by itself"))
            try:
                await p.close()
            except Exception:  # noqa: BLE001
                pass

        asyncio.ensure_future(check())

    context.on("page", on_page)
