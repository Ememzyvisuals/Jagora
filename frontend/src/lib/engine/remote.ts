"use client";

/* The real engine: Jagora's backend over a WebSocket. The backend runs the browser and Muse Spark; the app shows
   the live page (JPEG frames), the cursor and highlight, and the conversation.

   Protocol (JSON messages):
   app -> server   {type:"start", task, goal, lang, mode, profile, attachment?}   goal is anything she said: "open
                                                           jamb.gov.ng", "find cheap flights to Abuja", "check my result"
                                                           attachment: {kind, name, data(base64 dataURL)}
                   {type:"answer", task, id, value}        value: "yes" | "no" | text
                   {type:"secret", task, id, value}        something she typed instead of saying (account number, OTP...).
                                                           The backend types it into the field the agent asked about,
                                                           and never puts it in the model's context, logs or speech;
                                                           the model only learns "filled by her".
                   {type:"audio", task, id?, data, history?}  her voice note or live turn (base64 webm/opus); id is her
                                                           message already in the chat, filled in with what she said
                   {type:"stop", task}
   server -> app   {type:"task", task, title?, kind?}       the agent names the task once it understands it
                   {type:"msg", task, msg}                 one conversation item (same shape as Msg in store.ts)
                   {type:"update", task, id, patch}
                   {type:"status", task, status}
                   {type:"frame", task, jpeg}              base64 JPEG of the live page
                   {type:"pointer", task, x, y, visible, clicking}   in page pixels
                   {type:"highlight", task, box|null, tone}
                   {type:"orb", state}
                   {type:"speech", task, audio}            base64 audio of Jagora's voice (STORM TTS)
                   {type:"url", task, url}
                   {type:"speech_end", task}               Jagora finished talking (live mode listens again)
                   {type:"account", credits}  {type:"notify", task, title, text, url}  {type:"error", error, message}
*/
import { getToken } from "../account";
import { useApp, uid, type Msg, type Task } from "../store";

const S = () => useApp.getState();
let ws: WebSocket | null = null;
let frameListener: ((jpeg: string) => void) | null = null;
export const onRemoteFrame = (f: ((jpeg: string) => void) | null) => (frameListener = f);

export const BACKEND = process.env.NEXT_PUBLIC_BACKEND_WS || "";

function connect(): Promise<WebSocket> {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws);
  return new Promise((resolve, reject) => {
    const token = getToken();
    const sock = new WebSocket(token ? `${BACKEND}${BACKEND.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : BACKEND);
    sock.onopen = () => resolve(sock);
    sock.onerror = () => reject(new Error("backend unreachable"));
    sock.onclose = () => (ws = null);
    sock.onmessage = (e) => handle(JSON.parse(e.data));
    ws = sock;
  });
}

function handle(ev: Record<string, unknown>) {
  const s = S();
  const task = ev.task as string;
  switch (ev.type) {
    case "task":
      s.setMeta(task, { ...(ev.title ? { title: ev.title as string } : {}), ...(ev.kind ? { kind: ev.kind as never } : {}) });
      break;
    case "msg":
      if (!s.tasks.some((t) => t.id === task)) break;
      s.push(task, ev.msg as Msg);
      break;
    case "update": {
      const patch = ev.patch as Partial<Msg> & { text?: string };
      s.update(task, ev.id as string, patch);
      // a voice note's chat is named after what she said, once the words are known
      const t = s.tasks.find((x) => x.id === task);
      if (patch.text && t && t.messages[0]?.id === ev.id) s.setMeta(task, { title: patch.text.length > 42 ? `${patch.text.slice(0, 40).trimEnd()}…` : patch.text });
      break;
    }
    case "status":
      s.setStatus(task, ev.status as never);
      break;
    case "url":
      s.setUrl(task, ev.url as string);
      break;
    case "frame":
      frameListener?.(ev.jpeg as string);
      break;
    case "pointer":
      s.setPointer({ x: ev.x as number, y: ev.y as number, visible: !!ev.visible, clicking: !!ev.clicking });
      break;
    case "highlight":
      s.setHighlight(ev.box ? { ...(ev.box as { x: number; y: number; w: number; h: number }), tone: (ev.tone as "point" | "stop") || "point" } : null);
      break;
    case "orb":
      s.setOrb(ev.state as never);
      break;
    case "speech":
      queueSpeech(ev.audio as string);
      break;
    case "speech_end":
      speechDone = true;
      if (!playing) s.setOrb("idle");
      break;
    case "notify":
      notify(ev);
      break;
    case "error":
      if (ev.error === "signin" && typeof window !== "undefined") window.location.href = "/start";
      break;
  }
}

/* Jagora's voice, one sentence after another (never two at once). The orb shows speaking until the last one ends. */
const clips: string[] = [];
let playing = false;
let speechDone = false;
let current: HTMLAudioElement | null = null;
function queueSpeech(b64: string) {
  if (S().muted) return;
  clips.push(b64);
  speechDone = false;
  if (!playing) void next();
}
async function next() {
  const b64 = clips.shift();
  if (!b64) {
    playing = false;
    if (speechDone || !clips.length) S().setOrb("idle");
    return;
  }
  playing = true;
  S().setOrb("speaking");
  current = new Audio(`data:audio/wav;base64,${b64}`);
  current.onended = current.onerror = () => void next();
  try {
    await current.play();
  } catch {
    void next();
  }
}
export function hush() {
  clips.length = 0;
  current?.pause();
  playing = false;
}

function notify(ev: Record<string, unknown>) {
  const s = S();
  const task = ev.task as string;
  if (!s.tasks.some((t) => t.id === task)) {
    const id = s.newTask({ title: (ev.title as string) || "Update", kind: "browse", url: (ev.url as string) || "" });
    s.closeTask(id);
  }
  s.push(task, { id: uid(), kind: "agent", text: ev.text as string });
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification("Jagora", { body: ev.text as string });
  } catch {}
}

/** The words of this chat so far, so Jagora remembers what was said before. */
function historyOf(task: string) {
  const t: Task | undefined = S().tasks.find((x) => x.id === task);
  if (!t) return [];
  return t.messages
    .flatMap((m) =>
      m.kind === "user" && m.text ? [{ role: "user", text: m.text }] :
      m.kind === "agent" ? [{ role: "agent", text: m.text }] :
      m.kind === "evidence" ? [{ role: "agent", text: `[evidence from ${m.site}] ${m.claim}: "${m.quote.slice(0, 200)}"` }] :
      m.kind === "doc" ? [{ role: "agent", text: `[document] ${m.doc.title}` }] :
      m.kind === "file" ? [{ role: "agent", text: `[file] ${m.name}` }] :
      m.kind === "choice" && m.picked ? [{ role: "agent", text: m.question }, { role: "user", text: m.picked }] : [])
    .slice(-24, -1);
}

export async function remoteStart(task: string, goal: string, attachment?: { kind: string; name: string; data?: string }) {
  const s = S();
  let sock: WebSocket;
  try {
    sock = await connect();
  } catch {
    s.push(task, { id: Math.random().toString(36).slice(2), kind: "agent", text: "I can't reach Jagora's server right now. Check your network and try again." });
    s.setStatus(task, "stopped");
    return;
  }
  s.setOrb("thinking");
  sock.send(JSON.stringify({ type: "start", task, goal, lang: s.lang, mode: s.mode, profile: s.profile, attachment, history: historyOf(task) }));
}
export async function remoteAnswer(task: string, id: string, value: string) {
  (await connect()).send(JSON.stringify({ type: "answer", task, id, value }));
}
export async function remoteSecret(task: string, id: string, value: string) {
  (await connect()).send(JSON.stringify({ type: "secret", task, id, value }));
}
export async function remoteAudio(task: string, blob: Blob, id?: string) {
  const data = await new Promise<string>((r) => {
    const fr = new FileReader();
    fr.onload = () => r(String(fr.result).split(",")[1] ?? "");
    fr.readAsDataURL(blob);
  });
  const st = S();
  let sock: WebSocket;
  try {
    sock = await connect();
  } catch {
    st.push(task, { id: uid(), kind: "agent", text: "I can't reach Jagora's server right now. Check your network and try again." });
    st.setOrb("idle");
    return;
  }
  st.setOrb("thinking");
  sock.send(JSON.stringify({ type: "audio", task, id, data, lang: st.lang, mode: st.mode, profile: st.profile, history: historyOf(task) }));
}
export async function remoteStop(task: string) {
  hush();
  ws?.send(JSON.stringify({ type: "stop", task }));
}
