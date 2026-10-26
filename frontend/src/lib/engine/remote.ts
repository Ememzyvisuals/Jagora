"use client";

/* The real engine: Jagora's backend over a WebSocket. The backend runs the browser and Muse Spark; the app shows
   the live page (JPEG frames), the cursor and highlight, and the conversation.

   Protocol (JSON messages):
   app -> server   {type:"start", task, goal, lang, mode, profile, attachment?}   goal is anything she said: "open
                                                           jamb.gov.ng", "find cheap flights to Abuja", "check my result"
                                                           attachment: {kind, name, data(base64 dataURL)}
                   {type:"answer", task, id, value}        value: "yes" | "no" | text
                   {type:"audio", task, data}              base64 audio of her voice (webm/opus)
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
*/
import { useApp, type Msg } from "../store";

const S = () => useApp.getState();
let ws: WebSocket | null = null;
let frameListener: ((jpeg: string) => void) | null = null;
export const onRemoteFrame = (f: ((jpeg: string) => void) | null) => (frameListener = f);

export const BACKEND = process.env.NEXT_PUBLIC_BACKEND_WS || "";

function connect(): Promise<WebSocket> {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws);
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(BACKEND);
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
      s.push(task, ev.msg as Msg);
      break;
    case "update":
      s.update(task, ev.id as string, ev.patch as Partial<Msg>);
      break;
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
      void new Audio(`data:audio/wav;base64,${ev.audio}`).play().catch(() => undefined);
      break;
  }
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
  sock.send(JSON.stringify({ type: "start", task, goal, lang: s.lang, mode: s.mode, profile: s.profile, attachment }));
}
export async function remoteAnswer(task: string, id: string, value: string) {
  (await connect()).send(JSON.stringify({ type: "answer", task, id, value }));
}
export async function remoteAudio(task: string, blob: Blob) {
  const data = await new Promise<string>((r) => {
    const fr = new FileReader();
    fr.onload = () => r(String(fr.result).split(",")[1] ?? "");
    fr.readAsDataURL(blob);
  });
  (await connect()).send(JSON.stringify({ type: "audio", task, data }));
}
export async function remoteStop(task: string) {
  ws?.send(JSON.stringify({ type: "stop", task }));
}
