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
                   {type:"pcm", task, utt, n, rate, data}  Jagora's voice as it is made (16-bit PCM, played at once)
                   {type:"url", task, url}
                   {type:"speech_end", task}               Jagora finished talking (live mode listens again)
                   {type:"account", credits}  {type:"notify", task, title, text, url}  {type:"error", error, message}
*/
import { getToken } from "../account";
import { useApp, uid, type Msg, type Task } from "../store";

const S = () => useApp.getState();
let ws: WebSocket | null = null;
/* the latest picture of Jagora's browser; any screen showing the page subscribes */
let lastFrame = "";
const frameListeners = new Set<(jpeg: string) => void>();
export function onRemoteFrame(f: (jpeg: string) => void) {
  frameListeners.add(f);
  if (lastFrame) f(lastFrame);
  return () => void frameListeners.delete(f);
}

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
      lastFrame = ev.jpeg as string;
      frameListeners.forEach((f) => f(lastFrame));
      break;
    case "viewport":
      s.setPageSize({ w: ev.w as number, h: ev.h as number, mobile: !!ev.mobile });
      break;
    case "takeover":
      s.setTakeover(!!ev.on);
      break;
    case "hint":
      s.push(task, { id: uid(), kind: "step", text: ev.text as string, status: "done" });
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
    case "pcm":
      playPcm(ev.data as string, (ev.rate as number) || 24000, ev.utt as string);
      break;
    case "speech_end":
      speechDone = true;
      if (!voices.size) s.setOrb("idle");
      break;
    case "notify":
      notify(ev);
      break;
    case "error":
      if (ev.error === "signin" && typeof window !== "undefined") window.location.href = "/start";
      break;
  }
}

/* Jagora's voice, played as it arrives: each 0.2 s piece of PCM is scheduled right after the one before, so speech
   starts within a moment of the reply and never overlaps. hush() stops it at once (she started talking or tapped)
   and tells the server to drop whatever it was still going to say. */
let actx: AudioContext | null = null;
let nextAt = 0;
let speechDone = true;
const voices = new Set<AudioBufferSourceNode>();
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!actx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
  }
  if (actx.state === "suspended") void actx.resume();
  return actx;
}
// phones only allow sound after a touch: wake the audio on the first one
if (typeof window !== "undefined") {
  const wake = () => audio();
  window.addEventListener("pointerdown", wake, { once: true, capture: true });
  window.addEventListener("keydown", wake, { once: true, capture: true });
}
let lastUtt = "";
let hushedAt = 0;
const hushed = new Set<string>();
function playPcm(b64: string, rate: number, utt = "") {
  if (S().muted) return;
  // what was already on its way when she cut in stays silent
  if (hushed.has(utt) || performance.now() - hushedAt < 700) return;
  lastUtt = utt;
  const c = audio();
  if (!c) return;
  const bin = atob(b64);
  const n = bin.length >> 1;
  if (!n) return;
  const buf = c.createBuffer(1, n, rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 32768) v -= 65536;
    ch[i] = v / 32768;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  const at = Math.max(c.currentTime + 0.04, nextAt);
  src.start(at);
  nextAt = at + buf.duration;
  voices.add(src);
  speechDone = false;
  S().setOrb("speaking");
  src.onended = () => {
    voices.delete(src);
    if (!voices.size && speechDone) S().setOrb("idle");
  };
}
/** Is Jagora talking (or about to)? */
export const isSpeaking = () => voices.size > 0 || !speechDone;
export function hush() {
  const was = isSpeaking();
  if (was) {
    if (lastUtt) hushed.add(lastUtt);
    hushedAt = performance.now();
  }
  for (const v of voices) {
    try {
      v.stop();
    } catch {}
  }
  voices.clear();
  nextAt = 0;
  speechDone = true;
  if (was) ws?.send(JSON.stringify({ type: "hush" }));
}

function notify(ev: Record<string, unknown>) {
  const s = S();
  const task = ev.task as string;
  s.ensureTask(task, (ev.title as string) || "Update");
  if (ev.kind !== "job") s.push(task, { id: uid(), kind: "agent", text: ev.text as string });
  s.setToast({ task, title: (ev.title as string) || "Jagora", text: ev.text as string });
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") new Notification("Jagora", { body: ev.text as string });
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
  sock.send(JSON.stringify({ type: "start", task, goal, lang: s.lang, mode: s.mode, profile: s.profile, attachment, history: historyOf(task), device: device(), translate: wantsTranslation() }));
}
export async function remoteAnswer(task: string, id: string, value: string) {
  (await connect()).send(JSON.stringify({ type: "answer", task, id, value }));
}
export async function remoteSecret(task: string, id: string, value: string, save = false) {
  (await connect()).send(JSON.stringify({ type: "secret", task, id, value, save }));
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
const wantsTranslation = () => S().translatePages && ["yo", "ha", "ig"].includes(S().lang);
export async function remoteTranslate(on: boolean) {
  S().setTranslatePages(on);
  ws?.send(JSON.stringify({ type: "translate", on: on && ["yo", "ha", "ig"].includes(S().lang) }));
}

/** her screen, so Jagora's browser shows pages the way her device would (phone layout on a phone) */
function device() {
  const mobile = matchMedia("(max-width: 767px)").matches || matchMedia("(pointer: coarse) and (max-width: 1024px)").matches;
  return { mobile, w: innerWidth, h: innerHeight };
}

/** her hands on the live page: taps, typing, keys, scrolling (only while she has taken over or Jagora waits for her) */
export async function remoteInput(task: string, input: { action: "tap" | "type" | "key" | "scroll" | "back"; x?: number; y?: number; text?: string; key?: string; dy?: number }) {
  ws?.send(JSON.stringify({ type: "input", task, ...input }));
}
/** she tapped the thing she meant on the live page (page pixels) */
export async function remotePoint(task: string, id: string, x: number, y: number) {
  S().update(task, id, { status: "done" } as never);
  (await connect()).send(JSON.stringify({ type: "answer", task, id, value: { x, y } }));
}
export async function remoteTakeover(task: string, on: boolean) {
  S().setTakeover(on);
  (await connect()).send(JSON.stringify({ type: "takeover", task, on }));
}

/** "Show me in pictures": Muse Image draws one of Jagora's answers as a picture guide. */
export async function remotePictures(task: string, text: string) {
  S().setOrb("thinking");
  (await connect()).send(JSON.stringify({ type: "pictures", task, text }));
}

/** Open the line when the app opens, so reminders and results that came while she was away arrive at once. */
export async function remoteWake() {
  try {
    await connect();
  } catch {}
}

export async function remoteStop(task: string) {
  hush();
  ws?.send(JSON.stringify({ type: "stop", task }));
}
