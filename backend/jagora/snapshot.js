// Runs inside the page. Finds every element a person could click, type into or choose, gives each a number,
// works out the words a person would use for it, and (optionally) draws the numbers on screen for the screenshot.
(opts) => {
  const MARK = "data-jg";
  const OVERLAY = "__jg_overlay";
  document.getElementById(OVERLAY)?.remove();
  document.querySelectorAll(`[${MARK}]`).forEach((el) => el.removeAttribute(MARK));

  const SELECTOR = [
    "a[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary",
    "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]", "[role=tab]", "[role=menuitem]",
    "[role=option]", "[role=switch]", "[role=combobox]", "[contenteditable='']", "[contenteditable=true]", "[onclick]",
  ].join(",");

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

  const out = [];
  let n = 0;
  for (const el of document.querySelectorAll(SELECTOR)) {
    if (el.closest(`#${OVERLAY}`)) continue;
    // skip a wrapper when its own clickable child will be listed
    if (el.matches("[onclick]") && el.querySelector(SELECTOR.replace(",[onclick]", ""))) continue;
    const r = visible(el);
    if (!r) continue;
    n += 1;
    el.setAttribute(MARK, String(n));
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
    if (k === "text box") item.value = el.type === "password" ? (el.value ? "(hidden)" : "") : clean(el.value ?? el.innerText, 120);
    if (k === "checkbox" || k === "radio") item.checked = !!(el.checked || el.getAttribute("aria-checked") === "true");
    if (el.tagName === "SELECT") {
      item.options = [...el.options].map((o) => clean(o.text, 60)).filter(Boolean).slice(0, 60);
      item.value = el.selectedIndex >= 0 ? clean(el.options[el.selectedIndex].text, 60) : "";
    }
    out.push(item);
  }

  const headings = [...document.querySelectorAll("h1,h2,h3")].filter((h) => h.offsetParent !== null)
    .map((h) => clean(h.innerText, 80)).filter(Boolean).slice(0, 12);
  const errors = [...document.querySelectorAll("[role=alert], .error, .err, .invalid-feedback, [aria-invalid=true]")]
    .filter((e) => e.offsetParent !== null).map((e) => clean(e.innerText || e.getAttribute("aria-label"), 100)).filter(Boolean).slice(0, 10);
  const text = clean(document.body.innerText, 2500);

  if (opts && opts.marks) {
    const layer = document.createElement("div");
    layer.id = OVERLAY;
    Object.assign(layer.style, { position: "fixed", inset: "0", pointerEvents: "none", zIndex: "2147483647" });
    for (const it of out) {
      const { x, y, w, h } = it.rect;
      const box = document.createElement("div");
      Object.assign(box.style, { position: "absolute", left: x + "px", top: y + "px", width: w + "px", height: h + "px",
        border: "2px solid #E5195E", borderRadius: "3px", boxSizing: "border-box" });
      const tag = document.createElement("div");
      tag.textContent = String(it.id);
      Object.assign(tag.style, { position: "absolute", left: Math.max(x - 2, 0) + "px", top: Math.max(y - 16, 0) + "px",
        background: "#E5195E", color: "#fff", font: "bold 12px/14px Arial, sans-serif", padding: "1px 4px", borderRadius: "3px" });
      layer.append(box, tag);
    }
    document.body.appendChild(layer);
  }

  return {
    url: location.href, title: document.title, headings, errors, text,
    scroll: { y: Math.round(scrollY), max: Math.max(0, Math.round(document.documentElement.scrollHeight - vh)) },
    elements: out,
  };
}
