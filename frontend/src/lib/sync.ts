"use client";

/* Her account on every device. When she opens Jagora signed in, her past chats and her settings (saved details,
   language, mode) come from the server; when she changes a setting here, it is saved there too. Saved details are
   sealed on the server (AES-256-GCM), like her saved logins. */
import { API, getToken } from "./account";
import { uid, useApp, type Msg, type Task } from "./store";

const auth = () => ({ Authorization: `Bearer ${getToken()}` });
let listening = false;
let applying = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function pushSettings() {
  if (!API || !getToken()) return;
  const s = useApp.getState();
  void fetch(`${API}/me/settings`, {
    method: "PUT",
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify({ profile: s.profile, lang: s.lang, mode: s.mode }),
  }).catch(() => {});
}

async function pullSettings() {
  const r = await fetch(`${API}/me/settings`, { headers: auth() });
  if (!r.ok) return;
  const { settings } = (await r.json()) as { settings: { profile?: Record<string, string>; lang?: string; mode?: string } | null };
  if (!settings) return pushSettings(); // first device for this account: this one's settings become hers everywhere
  const s = useApp.getState();
  applying = true;
  try {
    if (settings.profile) s.setProfile(settings.profile as never);
    if (settings.lang) s.setLang(settings.lang as never);
    if (settings.mode) s.setMode(settings.mode as never);
  } finally {
    applying = false;
  }
}

async function pullChats() {
  const r = await fetch(`${API}/chats`, { headers: auth() });
  if (!r.ok) return;
  const list = (await r.json()) as { chat_id: string; title: string; updated: number }[];
  const have = new Set(useApp.getState().tasks.map((t) => t.id));
  const missing = list.filter((c) => !have.has(c.chat_id)).slice(0, 12);
  if (!missing.length) return;
  const tasks = await Promise.all(
    missing.map(async (c): Promise<Task | null> => {
      const h = await fetch(`${API}/chats/${encodeURIComponent(c.chat_id)}`, { headers: auth() }).then((x) => (x.ok ? x.json() : [])).catch(() => []);
      const lines = (h as { role: string; text: string }[]).filter((m) => m.text && !m.text.startsWith("[")); // "[...]" are notes the server keeps for the agent
      if (!lines.length) return null;
      const messages = lines.map((m): Msg => (m.role === "user" ? { id: uid(), kind: "user", text: m.text } : { id: uid(), kind: "agent", text: m.text }));
      return { id: c.chat_id, title: c.title || lines[0].text.slice(0, 60), kind: "chat", url: "", status: "done", createdAt: Math.round(c.updated * 1000), messages };
    }),
  );
  const got = tasks.filter((t): t is Task => !!t);
  if (got.length) useApp.setState((s) => ({ tasks: [...s.tasks, ...got].sort((a, b) => b.createdAt - a.createdAt) }));
}

/** Bring her account to this device, then keep it in step. Safe to call more than once. */
export async function syncAccount() {
  if (!API || !getToken()) return;
  await pullSettings().catch(() => {});
  await pullChats().catch(() => {});
  if (!listening) {
    listening = true;
    useApp.subscribe((st, prev) => {
      if (applying) return;
      if (st.profile !== prev.profile || st.lang !== prev.lang || st.mode !== prev.mode) {
        clearTimeout(timer);
        timer = setTimeout(pushSettings, 1500);
      }
    });
  }
}
