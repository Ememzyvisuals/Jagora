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
import { describeScreen, runApp } from "../appctl";
import { canDecodeVideo, type LiveFrame } from "../liveview";
import { getToken } from "../account";
import { useApp, uid, type Msg, type Task } from "../store";

const S = () => useApp.getState();
let ws: WebSocket | null = null;
/* the latest picture of Jagora's browser; any screen showing the page subscribes */
/* the live page: binary messages (1 = JPEG photo, 2 = H.264 keyframe, 3 = H.264 frame); lib/liveview.ts paints them */
const frameListeners = new Set<(f: LiveFrame) => void>();
let lastPhoto: LiveFrame | null = null;
export function onRemoteFrame(f: (frame: LiveFrame) => void) {
  frameListeners.add(f);
  if (lastPhoto) f(lastPhoto);
  if (videoOn) requestKeyframe(); // a new screen showing the video starts from a keyframe
  return () => void frameListeners.delete(f);
}
function gotFrame(data: ArrayBuffer) {
  const b = new Uint8Array(data);
  const kind = b[0] as 1 | 2 | 3;
  if (kind !== 1 && kind !== 2 && kind !== 3) return;
  const f: LiveFrame = { kind, data: b.subarray(1) };
  if (kind === 1) lastPhoto = f;
  frameListeners.forEach((l) => l(f));
}
/* video, when this browser can decode it; back to photos for good if the decoder ever fails */
let videoOn = false;
let videoBroken = false;
let videoChecked: boolean | null = null;
async function sendVideo() {
  // ask for video only if this browser really decodes H.264 (constrained baseline, as video.py sends it)
  if (videoChecked === null && canDecodeVideo()) {
    try {
      videoChecked = !!(await VideoDecoder.isConfigSupported({ codec: "avc1.42C028" })).supported;
    } catch {
      videoChecked = false;
    }
  }
  videoOn = !!videoChecked && !videoBroken;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "video", on: videoOn }));
}
let keyAsked = 0;
export function requestKeyframe() {
  if (!videoOn || performance.now() - keyAsked < 800) return;
  keyAsked = performance.now();
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "video", on: true }));
}
export function videoFailed() {
  if (videoBroken) return;
  videoBroken = true;
  void sendVideo();
}

export const BACKEND = process.env.NEXT_PUBLIC_BACKEND_WS || "";

function connect(): Promise<WebSocket> {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws);
  return new Promise((resolve, reject) => {
    const token = getToken();
    const sock = new WebSocket(token ? `${BACKEND}${BACKEND.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : BACKEND);
    sock.binaryType = "arraybuffer";
    sock.onopen = () => {
      sock.send(JSON.stringify({ type: "net", lite: liteWanted() }));
      ws = sock;
      void sendVideo();
      resolve(sock);
    };
    sock.onerror = () => reject(new Error("backend unreachable"));
    sock.onclose = () => {
      if (ws === sock) ws = null;
      comeBack();
    };
    sock.onmessage = (e) => (typeof e.data === "string" ? handle(JSON.parse(e.data)) : gotFrame(e.data as ArrayBuffer));
    ws = sock;
  });
}

/* A phone connection drops (lift, weak signal, screen off). While a task is running, the app reconnects by itself,
   and the server carries on with the same session and sends what she missed (server.py Session.attach). */
let retry = 0;
let retryTimer = 0;
const running = () => S().tasks.some((t) => t.status === "working") || S().live;
function comeBack() {
  if (typeof window === "undefined" || !BACKEND || retryTimer || document.hidden || !running()) return;
  const wait = Math.min(10_000, 800 * 2 ** retry);
  retryTimer = window.setTimeout(() => {
    retryTimer = 0;
    connect().then(
      () => (retry = 0),
      () => {
        retry = Math.min(retry + 1, 4);
        comeBack();
      },
    );
  }, wait);
}
if (typeof window !== "undefined")
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && (!ws || ws.readyState === WebSocket.CLOSED)) comeBack();
  });

/* ---- data saver (backend lite.py): on slow or costly networks the voice comes compressed and the live view smaller ---- */
type NetInfo = { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, f: () => void) => void };
const netInfo = (): NetInfo | undefined => (typeof navigator !== "undefined" ? (navigator as unknown as { connection?: NetInfo }).connection : undefined);
/** Is data saver on? Her choice, or (auto) what the phone says about its connection. */
export function liteWanted(): boolean {
  const mode = S().dataSaver;
  if (mode !== "auto") return mode === "on";
  const c = netInfo();
  return !!c && (!!c.saveData || ["slow-2g", "2g", "3g"].includes(c.effectiveType || ""));
}
function sendNet() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "net", lite: liteWanted() }));
}
if (typeof window !== "undefined") {
  netInfo()?.addEventListener?.("change", sendNet);
  // no live-view frames while the app is in the background (phone locked, another app open)
  document.addEventListener("visibilitychange", () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "view", on: !document.hidden }));
  });
  let last = useApp.getState().dataSaver;
  useApp.subscribe((st) => {
    if (st.dataSaver !== last) {
      last = st.dataSaver;
      sendNet();
    }
  });
}

/** IMA ADPCM block from lite.py: 2 bytes first sample, 1 byte step index, then two 4-bit codes a byte */
const STEPS = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209,
  230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660,
  4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];
const IDX = [-1, -1, -1, -1, 2, 4, 6, 8];
function adpcm(bin: string): Float32Array {
  if (bin.length < 3) return new Float32Array(0);
  let pred = (bin.charCodeAt(0) | (bin.charCodeAt(1) << 8)) << 16 >> 16;
  let idx = bin.charCodeAt(2);
  const out = new Float32Array(1 + (bin.length - 3) * 2);
  out[0] = pred / 32768;
  let o = 1;
  for (let i = 3; i < bin.length; i++) {
    const b = bin.charCodeAt(i);
    for (const code of [b & 15, b >> 4]) {
      const step = STEPS[idx];
      let d = step >> 3;
      if (code & 4) d += step;
      if (code & 2) d += step >> 1;
      if (code & 1) d += step >> 2;
      pred = Math.max(-32768, Math.min(32767, code & 8 ? pred - d : pred + d));
      idx = Math.max(0, Math.min(88, idx + IDX[code & 7]));
      out[o++] = pred / 32768;
    }
  }
  return out;
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
    case "app": // Jagora changes something in the app on her screen
      runApp(ev.action as string, (ev.value as string) || "");
      break;
    case "drop": // it was Jagora's own voice coming back through the microphone, not her words
      s.drop(task, ev.id as string);
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
      if (ev.status !== "working" && s.orb === "working") s.setOrb("idle"); // the task ended: the orb rests
      break;
    case "url":
      s.setUrl(task, ev.url as string);
      break;
    case "frame": {
      // an older server: photos as base64 text
      const bin = atob(ev.jpeg as string);
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      lastPhoto = { kind: 1, data };
      frameListeners.forEach((f) => f(lastPhoto!));
      break;
    }
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
      if (ev.state === "working" && isSpeaking()) break; // while she speaks, the orb shows her voice
      s.setOrb((ev.state === "idle" ? restOrb() : ev.state) as never);
      break;
    case "pcm":
      playPcm(ev.data as string, (ev.rate as number) || 24000, ev.utt as string, ev.codec as string | undefined, (ev.n as number) || 0);
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
const voiceAt = new Map<AudioBufferSourceNode, { n: number; start: number; end: number }>(); // which sentence each piece is
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
/* one volume control for Jagora's voice, so it can be lowered the moment she starts talking over it */
let master: GainNode | null = null;
function out(c: AudioContext): AudioNode {
  if (!master || master.context !== c) {
    master = c.createGain();
    master.connect(c.destination);
  }
  return master;
}
/** Lower (0..1) or restore (1) Jagora's voice, smoothly. */
export function duckVoice(level: number) {
  if (!master) return;
  const t = master.context.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(level, t, level < 1 ? 0.03 : 0.12);
}
let cushion = 0.3; // seconds of voice buffered before it starts playing
let cushionUtt = "";
let lastUtt = "";
let hushedAt = 0;
const hushed = new Set<string>();
function playPcm(b64: string, rate: number, utt = "", codec?: string, n = 0) {
  if (S().muted) return;
  // what was already on its way when she cut in stays silent
  if (hushed.has(utt) || performance.now() - hushedAt < 700) return;
  lastUtt = utt;
  const c = audio();
  if (!c) return;
  const bin = atob(b64);
  let buf: AudioBuffer;
  if (codec === "adpcm") {
    const pcm = adpcm(bin);
    if (!pcm.length) return;
    buf = c.createBuffer(1, pcm.length, rate);
    buf.getChannelData(0).set(pcm);
  } else {
    const n = bin.length >> 1;
    if (!n) return;
    buf = c.createBuffer(1, n, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      if (v >= 32768) v -= 65536;
      ch[i] = v / 32768;
    }
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(out(c));
  if (!voices.size && master) master.gain.value = 1; // a new reply starts at full volume
  // a cushion against late pieces on mobile data: speech starts a moment later, then never stutters. If a piece
  // still arrives after the sound ran out (a gap was heard), the cushion grows for the rest of the session.
  const dry = nextAt < c.currentTime + 0.01;
  if (dry && utt === cushionUtt) cushion = Math.min(0.9, cushion + 0.2);
  cushionUtt = utt;
  const at = dry ? c.currentTime + cushion : nextAt;
  src.start(at);
  nextAt = at + buf.duration;
  voices.add(src);
  voiceAt.set(src, { n, start: at, end: at + buf.duration });
  speechDone = false;
  S().setOrb("speaking");
  src.onended = () => {
    voices.delete(src);
    voiceAt.delete(src);
    if (!voices.size && speechDone) S().setOrb(restOrb());
  };
}
/** The orb when Jagora is not speaking: at work if a task is still running, else at rest. */
function restOrb(): "working" | "idle" {
  const st = S();
  const t = st.tasks.find((x) => x.id === st.activeId);
  return t?.status === "working" ? "working" : "idle";
}
/** Is Jagora talking (or about to)? */
export const isSpeaking = () => voices.size > 0 || !speechDone;
export function hush() {
  const was = isSpeaking();
  // the sentence she was hearing when she cut in: Jagora can carry on from there ("continue")
  let heard = 0;
  const now = actx?.currentTime ?? 0;
  for (const v of voiceAt.values()) if (v.start <= now) heard = Math.max(heard, v.n);
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
  voiceAt.clear();
  nextAt = 0;
  speechDone = true;
  if (was) ws?.send(JSON.stringify({ type: "hush", heard }));
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
  sock.send(JSON.stringify({ type: "start", screen: describeScreen(), task, goal, lang: s.lang, mode: s.mode, profile: s.profile, attachment, history: historyOf(task), device: device(), translate: wantsTranslation() }));
}
export async function remoteAnswer(task: string, id: string, value: string) {
  (await connect()).send(JSON.stringify({ type: "answer", screen: describeScreen(), task, id, value }));
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
  sock.send(JSON.stringify({ type: "audio", screen: describeScreen(), task, id, data, lang: st.lang, mode: st.mode, profile: st.profile, history: historyOf(task) }));
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
export async function remoteInput(task: string, input: { action: "tap" | "type" | "key" | "scroll" | "back" | "forward"; x?: number; y?: number; text?: string; key?: string; dy?: number }) {
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
