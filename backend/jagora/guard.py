"""Web safety for every page Jagora opens, enforced in the browser itself (the model cannot turn it off).

- Adult, phishing and malware sites: blocked before they load. Daily-updated public lists, plus a lookalike check
  against the real sites of Nigerian banks, schools, exam bodies and government, plus a content check on pages no
  list knows.
- Betting and gambling sites: blocked, whatever they call themselves ("trading", "a game").
- Scams Nigerians meet every day: exam fraud ("expo", "runz", "JAMB score upgrade"), fixed-return investment
  schemes, fake documents, hacking services, drugs and weapons, and pirated films, music and apps. Blocked by public
  lists, by the site's name, and by what the page itself says.
- Text hidden in a page to give instructions to AI assistants is removed before the model reads the page.
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
    "gambling": ["https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts",
                 "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/gambling-onlydomains.txt"],
    "piracy": ["https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/anti.piracy-onlydomains.txt"],
    "scam": ["https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/fake-onlydomains.txt"],
    "malicious": ["https://urlhaus.abuse.ch/downloads/hostfile/",
                  "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt"],
    "ads": ["https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
            "https://raw.githubusercontent.com/easylist/easylist/gh-pages/easylist.txt"],
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
    "piracy": {"thepiratebay.org", "1337x.to", "yts.mx", "rarbg.to", "fmovies.to", "123movies.to", "putlocker.vip", "soap2day.to",
               "gomovies.sx", "9anime.to", "fzmovies.net", "o2tvseries.com", "tooxclusive.com", "naijaloaded.com.ng"},
    "scam": set(),
    "fraud": set(),
    # links that record the IP address (and so the rough location) of whoever opens them
    "iplogger": {"grabify.link", "grabify.org", "iplogger.org", "iplogger.com", "iplogger.ru", "iplogger.co", "iplogger.info", "2no.co",
                 "yip.su", "iplis.ru", "02ip.ru", "ezstat.ru", "ipgrabber.ru", "ipgraber.ru", "blasze.com", "blasze.tk", "ps3cfw.com",
                 "bmwforum.co", "leancoding.co", "quickmessage.us", "spottyfly.com", "stopify.co", "freegiftcards.co", "headshot.monster",
                 "gaming-at-my.best", "progaming.monster", "yourmy.monster", "imageshare.best", "screenshot.best", "gamingfun.me",
                 "catsnthing.com", "curiouscat.club", "joinmy.site", "fortnitechat.site", "fortnite.space", "canarytokens.com",
                 "canarytokens.org", "iplogger.me", "lovebird.guru", "trulove.guru", "dateing.club", "otherhalf.life", "shrekis.life",
                 "datasig.io", "datauth.io", "headshot.monster", "xn--yutube-iqc.com", "xn--discrd-zxa.com"},
}
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rebrand.ly", "shorturl.at", "tiny.cc",
              "rb.gy", "s.id", "bl.ink", "short.io", "linktr.ee", "lnkd.in", "t.ly", "v.gd", "qr.ae", "shorte.st", "adf.ly", "ouo.io"}
TRACKING_PARAMS = re.compile(r"^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_eid|mc_cid|igshid|yclid|_hsenc|_hsmi|mkt_tok|ref_?id|trk|tracking_?id|"
                             r"clickid|click_id|affid|aff_id|subid|sub_id|uid|cid|email|e|recipient)$", re.I)

# What a site calls itself in its address.
FRAUD_HOST = re.compile(r"(waec|neco|jamb|nabteb|bece|utme|gce|ssce)[\w-]*(expo|runz|runs|upgrade|answers?|questions?leak)|"
                        r"(expo|runz)[\w-]*(waec|neco|jamb|nabteb|gce)|scoreupgrade|resultupgrade|"
                        r"fake[\w-]*(nin|id|certificate|passport|degree|receipt|alert)|novelty-?doc|"
                        r"double[\w-]*(your)?[\w-]*money|(bvn|atm|whatsapp|facebook|instagram)[\w-]*hack|hack[\w-]*(bvn|atm|whatsapp|facebook|instagram)", re.I)
PIRACY_HOST = re.compile(r"torrent|123movies|fmovies|putlocker|soap2day|gomovies|9anime|fzmovies|o2tv|waploaded|netnaija", re.I)
GAMBLING_HOST = re.compile(r"(^|[.-])(bet|bets|betting|casino|slots?|jackpot|sportsbook|poker|lotto)([.-]|\d|$)|"
                           r"\d(bet|xbet)|(naija|sure|merry|naira|access|bang|sporty|cash|super|smart|top|pro|win|mega|lucky)bet|"
                           r"^bet(now|win|\d+|naija|ng|9ja|king|way|ano|pawa|winner|zone|land|hub|planet|casino|bonus|slip|ting|ika)|"
                           r"msport|paripesa|melbet|aviator", re.I)

# What a page says about itself (for pages no list knows yet). Each pattern counts once; two kinds of evidence or
# one unmistakable phrase decides.
PAGE_SIGNS: dict[str, tuple[str, list[re.Pattern], list[re.Pattern]]] = {
    "gambling": ("this is a betting or gambling site", [
        re.compile(r"\bbet ?slip\b|\bplace (a |your )?bet\b|\bsportsbook\b|\bcasino\b", re.I)], [
        re.compile(r"\bodds\b", re.I), re.compile(r"\bjackpot\b", re.I), re.compile(r"\bdeposit bonus|welcome bonus|free bets?\b", re.I),
        re.compile(r"\b(virtuals?|aviator|spin(s)? to win|slots?)\b", re.I), re.compile(r"\b(stake|cash ?out|accumulator|booking code)\b", re.I)]),
    "fraud": ("this site sells exam leaks or fake results, a crime that also cancels results", [
        re.compile(r"\b(waec|neco|jamb|nabteb|gce|ssce|bece|utme)\s+(expo|runz|runs)\b|\b(jamb|utme)\s+(score|result)\s+upgrade|"
                   r"upgrade (your|my) (jamb|utme|waec|neco) (score|result)", re.I)], [
        re.compile(r"\bexpo\b|\brunz\b", re.I), re.compile(r"(questions and answers|answers) (before|ahead of) the exam", re.I),
        re.compile(r"\b(miracle|special) cent(er|re)\b", re.I), re.compile(r"\bsubscribe (now )?(for|to get) (the )?answers\b", re.I)]),
    "scam": ("this looks like an investment scam: it promises fixed or doubled returns", [
        re.compile(r"double your (money|investment)|guaranteed (daily|weekly|monthly) (returns?|profits?|roi)|"
                   r"earn \d{1,3}% (daily|every day|per day|weekly)|\brecommit(ment)?\b|get help.{0,20}provide help", re.I)], [
        re.compile(r"\b(roi|returns?) of \d{2,3}%", re.I), re.compile(r"\b(invest|deposit) .{0,30}(and|to) (get|receive|earn) .{0,20}(in|within|after) \d+ (hours?|days?)", re.I),
        re.compile(r"\b(referral bonus|upline|downline|matching scheme)\b", re.I), re.compile(r"\brisk[- ]free\b|\bno risk\b", re.I)]),
    "fakedocs": ("this site sells fake documents", [
        re.compile(r"\b(buy|order|get) (a )?(fake|novelty|counterfeit) (nin|id|certificate|passport|degree|driver'?s licen[cs]e|receipt)|"
                   r"\bfake (bank )?alert\b|\bcertificate without (writing|sitting|taking) (the )?exam", re.I)], []),
    "hacking": ("this site offers hacking or carding, which is a crime", [
        re.compile(r"\bhack (into )?(any |someone'?s |a )?(whatsapp|facebook|instagram|bank|bvn|atm|account|phone)|\bbvn hack|"
                   r"\b(carding|cc dumps?|clone (a )?(sim|card)|spy on (his|her|their|someone'?s) (phone|whatsapp))\b", re.I)], []),
    "drugs": ("this site sells drugs or weapons", [
        re.compile(r"\bbuy (cocaine|heroin|meth|crack|codeine syrup|tramadol without prescription|guns?|pistols?|rifles?|ammunition)\b|"
                   r"\bdark ?(web|net) market\b", re.I)], []),
}
BLOCKED_KINDS = ("iplogger", "adult", "malicious", "lookalike", "gambling", "piracy", "scam", "fraud", "fakedocs", "hacking", "drugs")

# Text written to steer AI assistants ("prompt injection"). Removed from what the model reads, and noted.
# Orders aimed at AI assistants. Only the trigger phrases are searched (a plain alternation, linear time); the
# sentence around each hit is then found with simple string scans, never with open-ended regex repetition, so no page
# can make this slow, however long or strangely punctuated it is.
INJECTION_KEY = re.compile(
    r"ignore (?:all |any )?(?:the )?(?:previous|prior|above|earlier|your) (?:instructions|rules|prompts?)|disregard (?:your|all|the|previous) "
    r"(?:instructions|rules)|(?:new|updated|important) instructions? (?:for|to) (?:the )?(?:ai|assistant|agent|model)|you are (?:now )?(?:an? )?(?:ai|llm|language model|"
    r"assistant|agent)\b|system prompt|as an ai (?:agent|assistant)|(?:ai|llm) (?:agents?|assistants?)[,:]? (?:please |must |should )|"
    r"<\|?(?:im_start|system)\|?>|\[/?inst\]|developer mode|jailbreak|do not tell (?:the )?user|without (?:telling|asking) (?:the )?user", re.I)
MAX_SCAN = 400_000  # characters of page text checked; longer text is cut (the model never reads that much anyway)


# Addresses that can run code or read the server's own files. Tests open local pages (JAGORA_ALLOW_FILE=1).
import os as _os  # noqa: E402

BAD_SCHEMES = ("javascript:", "data:text/html", "vbscript:") + (() if _os.environ.get("JAGORA_ALLOW_FILE") == "1" else ("file:",))


def defang(text: str) -> tuple[str, int]:
    """Text aimed at AI assistants, taken out (the whole sentence around the order). Returns the cleaned text and how
    many pieces were removed. Linear time on any input."""
    if not text:
        return text, 0
    text = text[:MAX_SCAN]
    spans: list[list[int]] = []
    for m in INJECTION_KEY.finditer(text):
        lo = max(m.start() - 160, text.rfind(".", max(0, m.start() - 160), m.start()) + 1, text.rfind("\n", max(0, m.start() - 160), m.start()) + 1)
        hi = m.end() + 240
        for stop in (".", "\n"):
            k = text.find(stop, m.end(), hi)
            if k != -1:
                hi = min(hi, k + 1)
        hi = min(hi, len(text))
        if spans and lo <= spans[-1][1]:
            spans[-1][1] = max(spans[-1][1], hi)
        else:
            spans.append([max(0, lo), hi])
    if not spans:
        return text, 0
    out, at = [], 0
    for lo, hi in spans:
        out.append(text[at:lo])
        out.append(" [removed: text written to give orders to AI assistants] ")
        at = hi
    out.append(text[at:])
    return "".join(out), len(spans)


# Runs in the page before it is read: hides text a person cannot see (transparent, tiny, off-screen, clipped, or the
# same colour as its background), the usual hiding place for instructions aimed at AI agents.
HIDE_TRAPS_JS = r"""
() => {
  let hidden = 0;
  const seen = new Set();
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); if (a < 0.1) return null;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (e) => { for (let x = e; x; x = x.parentElement) { const l = lum(getComputedStyle(x).backgroundColor); if (l !== null) return l; } return 1; };
  const W = document.documentElement.scrollWidth, H = document.documentElement.scrollHeight;
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  let n = 0;
  while (walker.nextNode() && n++ < 20000) {
    const t = walker.currentNode; const e = t.parentElement;
    if (!e || seen.has(e) || !t.nodeValue.trim() || t.nodeValue.trim().length < 12) continue;
    seen.add(e);
    const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    const tiny = parseFloat(s.fontSize) < 4;
    const clear = +s.opacity < 0.08;
    const off = r.right < -5 || r.bottom < -5 + (-scrollY) || r.left > W + 5 || r.top + scrollY > H + 5 || parseFloat(s.textIndent) < -500;
    const clipped = /rect\(0(px)?,? ?0(px)?,? ?0(px)?,? ?0(px)?\)/.test(s.clip) || /inset\(\s*(50|100)%/.test(s.clipPath) ||
                    ((r.width <= 1 || r.height <= 1) && s.overflow === 'hidden');
    let same = false;
    if (!tiny && !clear) { const fg = lum(s.color); const bg = bgOf(e); if (fg !== null) same = Math.abs(fg - bg) < 0.02; }
    if (tiny || clear || off || clipped || same) { e.setAttribute('data-jg-hidden', '1'); e.style.setProperty('display', 'none', 'important'); hidden++; }
  }
  return hidden;
}
"""

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
    category: str  # ok | official | ads | one of BLOCKED_KINDS
    owner: str = ""
    reason: str = ""

    @property
    def blocked(self) -> bool:
        return self.category in BLOCKED_KINDS

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
            f = LISTS_DIR / f"{cat}-{_sig(cat)}.txt"
            if f.exists():
                self.lists[cat] |= set(f.read_text().split())
        self.loaded_at = time.time()

    async def refresh(self) -> None:
        """Fetch the feeds (once a day). Keeps the cached copy when a feed is unreachable."""
        import httpx

        LISTS_DIR.mkdir(parents=True, exist_ok=True)
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
            for cat, urls in FEEDS.items():
                f = LISTS_DIR / f"{cat}-{_sig(cat)}.txt"
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
        if self._in("iplogger", host):
            return SiteVerdict(site, "iplogger", reason="this link records the IP address and rough location of whoever opens it")
        if self._in("malicious", host):
            return SiteVerdict(site, "malicious", reason="this site is on public phishing and malware lists")
        if self._in("adult", host) or ADULT_WORDS.search(site):
            return SiteVerdict(site, "adult", reason="this is an adult site")
        look = self.lookalike(site)
        if look:
            return SiteVerdict(site, "lookalike", reason=look)
        if self._in("gambling", host) or GAMBLING_HOST.search(host):
            return SiteVerdict(site, "gambling", reason="this is a betting or gambling site, and Jagora does not open those")
        if self._in("piracy", host) or PIRACY_HOST.search(site):
            return SiteVerdict(site, "piracy", reason="this site shares pirated films, music or apps")
        if self._in("scam", host):
            return SiteVerdict(site, "scam", reason="this site is on public lists of fake shops and scams")
        if FRAUD_HOST.search(site):
            return SiteVerdict(site, "fraud", reason="the name of this site advertises exam fraud, fake documents, money doubling or hacking")
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
        return bool(host) and (self._in("ads", host) or self._in("malicious", host) or bool(AD_PATHS.search(url)))

    def page_text_flag(self, text: str) -> str:
        """For pages no list knows: lots of adult words means it is an adult page."""
        hits = len(ADULT_TEXT.findall(text[:6000]))
        return "adult" if hits >= 4 else ""

    def page_verdict(self, url: str, text: str) -> SiteVerdict | None:
        """What a page says about itself, for sites no list knows yet. Official sites are trusted (a news page on
        WAEC's site may mention 'expo' to warn against it)."""
        site = registrable(url)
        if site in OFFICIAL or site.endswith(OFFICIAL_TLDS):
            return None
        t = text[:8000]
        if self.page_text_flag(t) == "adult":
            return SiteVerdict(site, "adult", reason="this page shows adult content")
        for cat, (reason, strong, weak) in PAGE_SIGNS.items():
            s = sum(1 for p in strong if p.search(t))
            w = sum(1 for p in weak if p.search(t))
            if s >= 1 and (w >= 1 or not weak) or w >= 3 or (s >= 1 and cat != "gambling"):
                return SiteVerdict(site, cat, reason=reason)
        return None


def _sig(cat: str) -> str:
    """Cache file name changes when a category's sources change, so new sources are fetched at once."""
    import hashlib

    return hashlib.sha1("|".join(FEEDS.get(cat, [])).encode()).hexdigest()[:8]


def parse_list(text: str) -> set[str]:
    out: set[str] = set()
    if text.lstrip().startswith("[Adblock"):  # EasyList: the whole-domain rules (||ads.example.com^)
        for line in text.splitlines():
            m = re.match(r"^\|\|([a-z0-9.-]+\.[a-z]{2,})\^(\$third-party)?$", line.strip())
            if m:
                out.add(m.group(1))
        return out
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


# Ads served from a site's own address (YouTube, news sites): cut off by their paths.
AD_PATHS = re.compile(r"youtube\.com/(pagead/|api/stats/ads|ptracking|get_midroll_|youtubei/v1/player/ad_break)|"
                      r"googlevideo\.com/.*[?&]ctier=L|/pagead/|/adserver|/ads\.js\b|/adsbygoogle|doubleclick\.net|"
                      r"googlesyndication|/prebid[.\w-]*\.js|/gpt\.js\b", re.I)

# Runs before any page script on every site: no ads, whatever the site. On YouTube it removes the ad schedule from the
# player's data before the player reads it, skips any ad that still starts, and hides ad slots and promoted videos.
NO_ADS_JS = r"""
(() => {
  const isYT = /(^|\.)youtube\.com$/.test(location.hostname) || location.hostname === 'youtube.test';  // .test: the attack range
  // 1. take the ads out of the data pages hand to their players
  const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'adBreakParams'];
  const prune = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 6) return o;
    for (const k of AD_KEYS) if (k in o) { try { delete o[k]; } catch (e) {} }
    if (o.playerResponse) prune(o.playerResponse, depth + 1);
    return o;
  };
  if (isYT) {
    const parse = JSON.parse;
    JSON.parse = function (...a) { return prune(parse.apply(this, a)); };
    for (const name of ['ytInitialPlayerResponse', 'ytInitialData']) {
      let v; try { Object.defineProperty(window, name, { configurable: true, get: () => v, set: (x) => { v = prune(x); } }); } catch (e) {}
    }
  }
  // 2. hide ad slots, sponsored blocks and promoted videos
  const CSS = [
    'ins.adsbygoogle', '[id^="google_ads_"]', '[id^="div-gpt-ad"]', 'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
    '.adsbygoogle', '[data-ad-slot]', '[data-google-query-id]', '.ad-slot', '.advertisement', '.adsbox', '.sponsored-content',
    'ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer', 'ytd-promoted-sparkles-web-renderer', 'ytd-promoted-video-renderer',
    'ytd-display-ad-renderer', 'ytd-companion-slot-renderer', 'ytd-action-companion-ad-renderer', 'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer', 'ytd-video-masthead-ad-v3-renderer', 'ytd-primetime-promo-renderer', '#masthead-ad', '#player-ads',
    '.ytd-merch-shelf-renderer', 'ytm-promoted-sparkles-web-renderer', 'ytm-companion-ad-renderer', 'ad-slot-renderer',
    '.video-ads', '.ytp-ad-module', '.ytp-ad-overlay-container', '.ytp-ad-text-overlay',
  ].join(',');
  const style = () => { if (document.getElementById('__jg_noads')) return; const s = document.createElement('style'); s.id = '__jg_noads';
    s.textContent = CSS + '{display:none!important}'; (document.head || document.documentElement).appendChild(s); };
  // 3. an ad that starts anyway is skipped at once
  const skip = () => {
    if (!isYT) return;
    const player = document.querySelector('.html5-video-player');
    const v = document.querySelector('video');
    if (player && v && player.classList.contains('ad-showing')) {
      v.muted = true;
      try { v.playbackRate = 16; if (isFinite(v.duration)) v.currentTime = v.duration; } catch (e) {}
    }
    document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-overlay-close-button').forEach((b) => b.click());
  };
  const start = () => { style(); skip(); new MutationObserver(() => { style(); skip(); }).observe(document.documentElement, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  setInterval(skip, 500);
})();
"""

# Runs before any page script: notes when a site asks for her location, camera, microphone, clipboard, contacts,
# notifications or screen. The browser refuses them all; she is told which site asked.
ASKS_JS = r"""
(() => {
  const tell = (what) => { try { window.__jgAsked && window.__jgAsked(what); } catch (e) {} };
  const wrap = (obj, name, what) => { if (!obj || !obj[name]) return; const f = obj[name].bind(obj);
    obj[name] = function (...a) { tell(what); return f(...a); }; };
  try { wrap(navigator.geolocation, 'getCurrentPosition', 'your location'); wrap(navigator.geolocation, 'watchPosition', 'your location'); } catch (e) {}
  try { wrap(navigator.mediaDevices, 'getUserMedia', 'your camera or microphone'); wrap(navigator.mediaDevices, 'getDisplayMedia', 'your screen'); } catch (e) {}
  try { wrap(navigator.clipboard, 'readText', 'what you copied (clipboard)'); wrap(navigator.clipboard, 'read', 'what you copied (clipboard)'); } catch (e) {}
  try { if (window.Notification) wrap(Notification, 'requestPermission', 'to send you notifications'); } catch (e) {}
  try { if (navigator.contacts) wrap(navigator.contacts, 'select', 'your contacts'); } catch (e) {}
  try { wrap(navigator, 'requestMIDIAccess', 'your devices'); if (navigator.bluetooth) wrap(navigator.bluetooth, 'requestDevice', 'your Bluetooth devices'); } catch (e) {}
})();
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
            if url.lower().startswith(BAD_SCHEMES) and req.is_navigation_request():
                session.notice("blocked", SiteVerdict(url[:20], "malicious", reason="that kind of address can run code; Jagora never opens it"))
                return await r.abort()
            v = guard.check(url)
            if v.blocked:
                session.notice("blocked", v)
                if req.is_navigation_request() and req.frame == req.frame.page.main_frame:
                    return await r.fulfill(status=200, content_type="text/html",
                                           body=BLOCK_PAGE.format(reason=v.reason.capitalize() + ".", site=v.site))
                return await r.abort()
            if guard.is_ad(url) and req.frame != req.frame.page.main_frame:
                return await r.abort()
            return await r.continue_()
        except Exception:  # noqa: BLE001
            try:
                await r.continue_()
            except Exception:  # noqa: BLE001
                pass

    await context.route("**/*", route)

    async def asked(source, what):
        try:
            site = registrable(source["page"].url) if source and source.get("page") else ""
            session.notice("permission", SiteVerdict(site, "ok", reason=f"{site} asked for {what}; Jagora said no"))
        except Exception:  # noqa: BLE001
            pass

    try:
        await context.expose_binding("__jgAsked", asked)
        await context.add_init_script(ASKS_JS)
        await context.add_init_script(NO_ADS_JS)
    except Exception:  # noqa: BLE001
        pass

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
