"""Pages in her language: the main content of a website (articles, notices, instructions, table text) translated
into Yoruba, Hausa, Igbo or Pidgin right on the page, with PlotWeaver STORM MT. Menus, names, numbers and form
fields stay as they are. The agent always reads the original underneath, so translation never changes what it
understands or proves.

The MT API takes one text per request (up to 2,000 characters), so short paragraphs travel together, one per line,
and every result is cached by its text, so a page seen once is instant the next time.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re

from jagora.config import DATA_DIR, settings

log = logging.getLogger("jagora.translate")
CACHE_DIR = DATA_DIR / "mt"
_mem: dict[str, dict[str, str]] = {}
_sem = asyncio.Semaphore(3)


def enabled() -> bool:
    return bool(settings.plotweaver_key)


def _cache(lang: str) -> dict[str, str]:
    if lang not in _mem:
        f = CACHE_DIR / f"{lang}.json"
        try:
            _mem[lang] = json.loads(f.read_text()) if f.exists() else {}
        except ValueError:
            _mem[lang] = {}
    return _mem[lang]


def _save(lang: str) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        c = _mem.get(lang, {})
        if len(c) > 40000:  # keep the newest half
            _mem[lang] = c = dict(list(c.items())[-20000:])
        (CACHE_DIR / f"{lang}.json").write_text(json.dumps(c, ensure_ascii=False))
    except OSError:
        pass


def _k(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()[:20]


async def _mt(client, text: str, lang: str) -> str:
    async with _sem:
        for attempt in range(3):
            r = await client.post(f"{settings.plotweaver_base}/translations", headers={"X-API-Key": settings.plotweaver_key},
                                  json={"text": text, "source_language": "en", "target_language": lang})
            if r.status_code == 429:
                await asyncio.sleep(float(r.headers.get("Retry-After", "2")))
                continue
            if r.status_code in (502, 503) and attempt < 2:
                await asyncio.sleep(1.5)
                continue
            r.raise_for_status()
            return (r.json().get("translated_text") or "").strip()
    return ""


def _packs(items: list[str], limit: int = 1800) -> list[list[str]]:
    packs, cur, size = [], [], 0
    for t in items:
        if cur and size + len(t) + 1 > limit:
            packs.append(cur)
            cur, size = [], 0
        cur.append(t)
        size += len(t) + 1
    if cur:
        packs.append(cur)
    return packs


async def translate(texts: list[str], lang: str, translator=None) -> list[str]:
    """Translate English texts into lang; returns the same number of texts (the original where it failed)."""
    if lang in ("en", "") or not texts:
        return texts
    cache = _cache(lang)
    todo = list(dict.fromkeys(t for t in texts if _k(t) not in cache and re.search(r"[A-Za-z]{2}", t)))
    if todo:
        if translator:
            got = await translator(todo, lang)
            for src, dst in zip(todo, got):
                if dst:
                    cache[_k(src)] = dst
        elif enabled():
            import httpx

            async with httpx.AsyncClient(timeout=60) as c:

                async def one_pack(pack: list[str]) -> None:
                    long = [t for t in pack if len(t) > 1800]
                    short = [t.replace("\n", " ") for t in pack if len(t) <= 1800]
                    try:
                        if short:
                            out = (await _mt(c, "\n".join(short), lang)).split("\n")
                            if len(out) == len(short):
                                for src, dst in zip([t for t in pack if len(t) <= 1800], out):
                                    if dst.strip():
                                        cache[_k(src)] = dst.strip()
                            else:  # lines did not line up: one by one
                                for src in [t for t in pack if len(t) <= 1800]:
                                    d = await _mt(c, src.replace("\n", " "), lang)
                                    if d:
                                        cache[_k(src)] = d
                        for src in long:
                            parts = [src[i:i + 1800] for i in range(0, len(src), 1800)]
                            cache[_k(src)] = " ".join([await _mt(c, p, lang) for p in parts])
                    except Exception as e:  # noqa: BLE001
                        log.warning("translation failed: %s", e)

                await asyncio.gather(*(one_pack(p) for p in _packs(todo)))
        _save(lang)
    return [cache.get(_k(t), t) for t in texts]


# ---- on the page --------------------------------------------------------------------------------------------------

# Collects the main content's text blocks that are safe to translate (plain text, no links or form fields inside),
# marks them, and remembers the original HTML so the page can be put back exactly.
COLLECT_JS = r"""
({limit}) => {
  window.__jgOrig = window.__jgOrig || {};
  window.__jgTr = window.__jgTr || {};
  let n = window.__jgN || 0;
  const root = document.querySelector('article, main, [role=main], #content, .content, .entry-content') || document.body;
  const skip = 'nav,header,footer,form,button,select,input,textarea,code,pre,script,style,[contenteditable],[translate=no],.notranslate';
  const out = [];
  for (const el of root.querySelectorAll('h1,h2,h3,h4,h5,p,li,td,th,dd,dt,blockquote,figcaption,caption,summary,label')) {
    if (out.length >= limit) break;
    if (el.closest(skip) || el.dataset.jgTr || el.offsetParent === null) continue;
    if (el.querySelector('a,input,select,textarea,button,img,svg,p,li,table,div')) continue;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length < 3 || !/[A-Za-z]{2}/.test(t) || /^[\d\s.,:/%₦$+\-()]+$/.test(t)) continue;
    const id = String(++n);
    el.dataset.jgTr = id;
    window.__jgOrig[id] = el.innerHTML;
    out.push({id, text: t});
  }
  window.__jgN = n;
  return out;
}
"""

APPLY_JS = r"""
(items) => {
  window.__jgTr = window.__jgTr || {};
  for (const {id, text} of items) {
    window.__jgTr[id] = text;
    const el = document.querySelector(`[data-jg-tr="${id}"]`);
    if (el && text) { el.textContent = text; el.setAttribute('lang', document.documentElement.dataset.jgLang || ''); }
  }
  document.documentElement.dataset.jgShown = 'tr';
  return items.length;
}
"""

RESTORE_JS = r"""
() => {
  if (!window.__jgOrig || document.documentElement.dataset.jgShown !== 'tr') return 0;
  let k = 0;
  for (const [id, html] of Object.entries(window.__jgOrig)) {
    const el = document.querySelector(`[data-jg-tr="${id}"]`);
    if (el) { el.innerHTML = html; k++; }
  }
  document.documentElement.dataset.jgShown = 'orig';
  return k;
}
"""

REAPPLY_JS = r"""
() => {
  if (!window.__jgTr) return 0;
  let k = 0;
  for (const [id, text] of Object.entries(window.__jgTr)) {
    const el = document.querySelector(`[data-jg-tr="${id}"]`);
    if (el && text) { el.textContent = text; k++; }
  }
  document.documentElement.dataset.jgShown = 'tr';
  return k;
}
"""
