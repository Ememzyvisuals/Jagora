/* What the app shows as text must be text. If a message ever carries an object where a sentence belongs (the model
   wrote a choice as {title, description}), it becomes plain words here instead of crashing the app. The server does
   the same before sending (server.py shown_safe); this also repairs chats saved on the phone before that fix. */
const TEXT = new Set(["text", "question", "detail", "name", "title", "label", "what", "note", "amount", "pay_to", "reference", "message", "summary", "subtitle", "caption", "quote"]);
const LISTS = new Set(["choices", "reasons"]);
const NESTED = new Set(["queue", "steps", "fields"]);

export function asWords(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asWords).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const head = ["title", "name", "label", "text", "question"].map((k) => o[k]).find((x) => x);
    const more = ["description", "detail", "subtitle"].map((k) => o[k]).find((x) => x);
    const h = head ? asWords(head) : "";
    const m = more ? asWords(more) : "";
    return h && m ? `${h}: ${m}` : h || m || JSON.stringify(o).slice(0, 200);
  }
  return String(v);
}

export function safeMsg<T>(m: T): T {
  if (!m || typeof m !== "object") return m;
  let changed = false;
  const out: Record<string, unknown> = { ...(m as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (TEXT.has(k) && v != null && typeof v !== "string") (out[k] = asWords(v)), (changed = true);
    else if (LISTS.has(k) && Array.isArray(v) && v.some((x) => typeof x !== "string")) (out[k] = v.map(asWords)), (changed = true);
    else if (NESTED.has(k) && Array.isArray(v)) {
      const fixed = v.map((x) => (x && typeof x === "object" ? safeMsg(x) : x));
      if (fixed.some((x, i) => x !== v[i])) (out[k] = fixed), (changed = true);
    }
  }
  return (changed ? out : m) as T;
}
