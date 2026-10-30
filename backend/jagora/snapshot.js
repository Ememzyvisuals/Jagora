// Runs inside the page. Finds every element a person could click, type into or choose, gives each a number,
// works out the words a person would use for it. Nothing is drawn on the page: the numbers go on a copy of the
// screenshot, made on the server (browser.draw_marks), so the page she watches stays exactly as the site made it.
(opts) => {
  const MARK = "data-jg";
  document.querySelectorAll(`[${MARK}]`).forEach((el) => el.removeAttribute(MARK));

  const SELECTOR = [
    "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary",
    "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]", "[role=tab]", "[role=menuitem]",
    "[role=option]", "[role=switch]", "[role=combobox]", "[contenteditable='']", "[contenteditable=true]", "[onclick]",
  ].join(",");

  // keep in step with SIG_JS in browser.py
  const SIG = (e) => e.tagName + "|" + (e.getAttribute("aria-label") || (["INPUT", "TEXTAREA", "SELECT"].includes(e.tagName) ? (e.name || e.id || e.placeholder || e.type) : (e.innerText || e.textContent || "")) || "").replace(/\s+/g, " ").trim().slice(0, 60);
  const clean = (s, n = 90) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const vw = window.innerWidth, vh = window.innerHeight;

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return null;
    // something else (a pop-up, a cookie banner) covering its centre means a person cannot use it either
    const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
    const top = document.elementFromPoint(cx, cy);
    const reachable = top && (top === el || el.contains(top) || top.contains(el) || (el.labels && [...el.labels].some((l) => l.contains(top))));
    // radio buttons and checkboxes are often styled away under their label: their label counts
    if (!reachable && !(["radio", "checkbox"].includes(el.type) && el.labels && el.labels.length)) return null;
    return r;
  }

  function textOf(id) { const n = id && document.getElementById(id); return n ? clean(n.innerText || n.textContent) : ""; }

  function labelOf(el) {
    const aria = el.getAttribute("aria-label");
    if (aria) return clean(aria);
    const by = el.getAttribute("aria-labelledby");
    if (by) { const t = by.split(/\s+/).map(textOf).join(" "); if (t.trim()) return clean(t); }
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map((l) => l.innerText).join(" ");
      if (t.trim()) return clean(t.replace(/\*/g, ""));
    }
    if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
      const wrap = el.closest("label");
      if (wrap) return clean(wrap.innerText.replace(/\*/g, ""));
      if (el.placeholder) return clean(el.placeholder);
      if (el.title) return clean(el.title);
      if (el.name) return clean(el.name.replace(/[_-]+/g, " "));
    }
    if (el.tagName === "INPUT" && ["submit", "button", "reset"].includes(el.type)) return clean(el.value);
    // a home-made dropdown (react-select and the like: role=combobox, an input with no label): its words are around it,
    // like "Select Coach" or the chosen "Standard Class", and the field's own title just before it ("Coach")
    if (el.getAttribute("role") === "combobox" || /react-select|select2|choices/.test(el.id || el.className || "")) {
      let box = el;
      for (let up = 0; up < 5 && box; up++) {
        box = box.parentElement;
        const t = box ? clean(box.innerText, 50) : "";
        if (t) {
          const prev = box.previousElementSibling && !box.previousElementSibling.querySelector("input,select") ? clean(box.previousElementSibling.innerText, 30) : "";
          return clean((prev ? prev + ": " : "") + t, 70);
        }
      }
    }
    const img = el.querySelector("img[alt]");
    return clean(el.innerText || el.textContent || el.title || (img && img.alt) || el.value || "");
  }

  // the question a group of radio buttons answers ("Gender"): the nearest text before the group that is not itself
  // another field. Checkboxes only get one when several share a name (a list of choices), else their label is the question.
  const FIELD = "input,select,textarea,button";
  function groupOf(el) {
    if (el.type === "checkbox" && !(el.name && document.querySelectorAll(`input[type=checkbox][name="${CSS.escape(el.name)}"]`).length > 1)) return "";
    const fs = el.closest("fieldset");
    if (fs && fs.querySelector("legend")) return clean(fs.querySelector("legend").innerText.replace(/\*/g, ""));
    const rg = el.closest("[role=radiogroup]");
    if (rg) return clean(rg.getAttribute("aria-label") || textOf(rg.getAttribute("aria-labelledby")));
    let node = el;
    for (let up = 0; up < 4 && node; up++) {
      node = node.parentElement;
      if (!node) break;
      for (const child of node.children) {
        if (child.contains(el)) break;
        if (child.matches(FIELD) || child.querySelector(FIELD) || child.matches("label")) continue;
        const t = clean(child.innerText.replace(/\*/g, ""), 60);
        if (t) return t;
      }
    }
    return "";
  }

  function kind(el) {
    const tag = el.tagName.toLowerCase(), type = (el.getAttribute("type") || "").toLowerCase(), role = el.getAttribute("role");
    if (tag === "select" || role === "combobox") return "dropdown";
    if (tag === "textarea" || el.isContentEditable) return "text box";
    if (tag === "input") {
      if (["checkbox"].includes(type) || role === "checkbox" || role === "switch") return "checkbox";
      if (type === "radio") return "radio";
      if (["submit", "button", "reset", "image"].includes(type)) return "button";
      if (type === "file") return "file picker";
      return "text box";
    }
    if (role === "checkbox" || role === "switch") return "checkbox";
    if (role === "radio") return "radio";
    if (tag === "a" || role === "link") return "link";
    return "button";
  }

  const STATE_WORDS = /(booked|reserved|occupied|taken|sold|unavailable|blocked|disabled|selected|active|chosen|available|vacant|free|open|ladies|female|male|window|aisle)/gi;
  const colourName = (c) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c || "");
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.15)) return "";
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 235 && min > 225) return "white";
    if (max - min < 24) return max < 70 ? "black" : "grey";
    if (r >= g && r >= b) return g > 150 && r > 200 ? (b < 120 ? "yellow" : "pink") : g > 100 && b < 80 ? "orange" : "red";
    if (g >= r && g >= b) return "green";
    return r > 120 ? "purple" : "blue";
  };
  function stateOf(el, cs) {
    const cls = `${el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || ""} ${el.getAttribute("data-status") || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`;
    const words = [...new Set((cls.match(STATE_WORDS) || []).map((w) => w.toLowerCase()))];
    const look = [colourName(cs.backgroundColor) && `${colourName(cs.backgroundColor)} fill`,
                  cs.borderStyle !== "none" && Number.parseFloat(cs.borderWidth) > 0 && colourName(cs.borderColor) && `${colourName(cs.borderColor)} border`]
      .filter(Boolean);
    // seat maps often draw the seat as a picture or an SVG inside the box: its file name and line colour carry the state
    const inner = [];
    for (const c of [...el.querySelectorAll("img,svg,path,rect,circle,use,i,span")].slice(0, 8)) {
      const icl = `${c.className && c.className.baseVal !== undefined ? c.className.baseVal : c.className || ""} ${c.getAttribute("src") || ""} ${c.getAttribute("alt") || ""} ${c.getAttribute("href") || ""}`;
      for (const w of icl.match(STATE_WORDS) || []) inner.push(w.toLowerCase());
      if (c.tagName && c.tagName.toLowerCase() === "img") {
        const f = (c.getAttribute("src") || "").split("/").pop().split("?")[0].replace(/\.(png|svg|jpe?g|webp|gif)$/i, "");
        if (f && f.length <= 30) inner.push(`picture ${f}`);
      } else if (c.namespaceURI === "http://www.w3.org/2000/svg") {
        const ccs = getComputedStyle(c);
        const st = ccs.stroke && ccs.stroke !== "none" && colourName(ccs.stroke), fl = ccs.fill && ccs.fill !== "none" && colourName(ccs.fill);
        if (st) inner.push(`${st} lines`);
        if (fl && fl !== "black") inner.push(`${fl} shape`);
      }
    }
    if (el.namespaceURI === "http://www.w3.org/2000/svg") {
      const st = cs.stroke && cs.stroke !== "none" && colourName(cs.stroke);
      if (st) inner.push(`${st} lines`);
    }
    return [...new Set([...words, ...look, ...inner])].join(", ");
  }

  const out = [];
  let n = 0;
  for (const el of document.querySelectorAll(SELECTOR)) {
    // skip a wrapper when its own clickable child will be listed
    if (el.matches("[onclick]") && el.querySelector(SELECTOR.replace(",[onclick]", ""))) continue;
    const r = visible(el);
    if (!r) continue;
    n += 1;
    el.setAttribute(MARK, String(n));
    el.__jgsig = SIG(el); // what it was when numbered: checked again just before acting on it (browser._locate)
    const k = kind(el);
    const item = {
      id: n, kind: k, tag: el.tagName.toLowerCase(), type: (el.getAttribute("type") || "").toLowerCase(),
      label: labelOf(el), group: (k === "radio" || k === "checkbox") ? groupOf(el) : "",
      name: el.getAttribute("name") || "", autocomplete: el.getAttribute("autocomplete") || "",
      placeholder: el.getAttribute("placeholder") || "", required: !!(el.required || el.getAttribute("aria-required") === "true"),
      disabled: !!(el.disabled || el.getAttribute("aria-disabled") === "true"),
      href: el.tagName === "A" ? el.href : "",
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    };
    if (k === "button" && !["BUTTON", "A", "INPUT"].includes(el.tagName) && (item.label || "").length <= 14) {
      const cs = getComputedStyle(el);
      item.state = stateOf(el, cs);
      if (cs.cursor === "not-allowed" || cs.pointerEvents === "none") item.disabled = true;
    }
    if (k === "text box") item.value = el.type === "password" ? (el.value ? "(hidden)" : "") : clean(el.value ?? el.innerText, 120);
    if (k === "checkbox" || k === "radio") item.checked = !!(el.checked || el.getAttribute("aria-checked") === "true");
    if (el.tagName === "SELECT") {
      item.options = [...el.options].map((o) => clean(o.text, 60)).filter(Boolean).slice(0, 60);
      item.value = el.selectedIndex >= 0 ? clean(el.options[el.selectedIndex].text, 60) : "";
    }
    out.push(item);
  }

  // things made clickable only by the page's own script (seat maps, day pickers, size boxes): a hand cursor and a
  // short label. Each gets a number like a button, with its state read from the page itself (its class words, its
  // colours, disabled), so "free" and "taken" come from the site, not from guessing colours on a picture.
  let extra = 0;
  for (const el of document.body.querySelectorAll("div,span,li,td,p,i,b,label,section,svg,g,rect,circle,path,img")) {
    if (extra >= 160) break;
    if (el.hasAttribute(MARK) || el.closest(`[${MARK}]`) || el.querySelector(`[${MARK}]`)) continue;
    const txt = clean(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title") || "", 24);
    if (!txt || txt.length > 14 || el.childElementCount > 3) continue;
    const cs = getComputedStyle(el);
    if (cs.cursor !== "pointer" && cs.cursor !== "not-allowed") continue;
    // the innermost clickable: skip a box whose child is itself the pointer target with the same words
    if ([...el.children].some((c) => getComputedStyle(c).cursor === cs.cursor && clean(c.innerText || c.textContent, 24) === txt)) continue;
    const r = visible(el);
    if (!r) continue;
    const off = cs.cursor === "not-allowed" || el.getAttribute("aria-disabled") === "true" || cs.pointerEvents === "none";
    // a number inside a seat box: the box around it carries the drawing and its colour (and its size on screen)
    const own = stateOf(el, cs), box = el.parentElement && el.parentElement.childElementCount <= 3 && el.parentElement !== document.body ? el.parentElement : null;
    const boxR = box && !own ? box.getBoundingClientRect() : null;
    const useBox = boxR && boxR.width <= 110 && boxR.height <= 110;
    n += 1;
    extra += 1;
    el.setAttribute(MARK, String(n));
    el.__jgsig = SIG(el);
    out.push({
      id: n, kind: "button", tag: el.tagName.toLowerCase(), type: "", label: txt, group: "", name: "", autocomplete: "",
      placeholder: "", required: false, disabled: off, href: "",
      state: own || (useBox ? stateOf(box, getComputedStyle(box)) : ""),
      rect: useBox ? { x: Math.round(boxR.left), y: Math.round(boxR.top), w: Math.round(boxR.width), h: Math.round(boxR.height) }
                   : { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    });
  }

  const headings = [...document.querySelectorAll("h1,h2,h3")].filter((h) => h.offsetParent !== null)
    .map((h) => clean(h.innerText, 80)).filter(Boolean).slice(0, 12);
  const errors = [...document.querySelectorAll("[role=alert], .error, .err, .invalid-feedback, [aria-invalid=true]")]
    .filter((e) => e.offsetParent !== null).map((e) => clean(e.innerText || e.getAttribute("aria-label"), 100)).filter(Boolean).slice(0, 10);
  const text = clean(document.body.innerText, 2500);

  return {
    url: location.href, title: document.title, headings, errors, text,
    scroll: { y: Math.round(scrollY), max: Math.max(0, Math.round(document.documentElement.scrollHeight - vh)) },
    elements: out,
  };
}
