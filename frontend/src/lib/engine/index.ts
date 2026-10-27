"use client";

/* What the screens call. Uses the real backend when NEXT_PUBLIC_BACKEND_WS is set, otherwise the demo engine. */
import { useApp, uid, type Attachment, type Task } from "../store";
import * as demo from "./demo";
import { BACKEND, remoteAnswer, remoteAudio, remoteSecret, remoteStart, remoteStop } from "./remote";

export const live = Boolean(BACKEND);

const TITLES: Record<demo.Intent, string> = {
  register: "Skills Fair registration",
  scam: "Message check",
  paper: "Letter explained",
  research: "Research and write-up",
  help: "New task",
};
const KIND: Record<demo.Intent, Task["kind"]> = { register: "browse", scam: "scam", paper: "paper", research: "chat", help: "chat" };

/** She asked for something: start a new task (or continue the active one if Jagora is waiting for her words). */
/** "Show me the browser": she wants to watch, not talk. Five languages, loose on purpose. */
const SHOW_PAGE = /\b(show|see|let me see|i want to see)\b.*\b(browser|page|screen|site)\b|make i see|fi (í|i) hàn mí|jẹ́ kí n rí|je ki n ri|bari in gani|nuna mini|ka m hụ|ka m hu/i;

/** remember sites she opens, for her own top sites on the new tab */
function noteVisit(text: string) {
  const m = text.match(/\b((?:[a-z0-9-]+\.)+(?:com|ng|org|net|gov\.ng|edu\.ng|com\.ng|app|io|co))\b/i);
  if (m) useApp.getState().visit(m[1].toLowerCase().replace(/^www\./, ""));
}

/** She asked for something. With `chat`, it continues that conversation (Jagora remembers what was said there);
    without, it starts a new one. */
export function ask(text: string, attachment?: Attachment, opts?: { chat?: string }) {
  const s = useApp.getState();
  noteVisit(text);
  if (!attachment && SHOW_PAGE.test(text) && s.tasks.some((t) => t.id === s.activeId && t.kind === "browse")) {
    s.setSheet(false);
    s.setShowPage(true);
    return s.activeId!;
  }
  const current = s.tasks.find((t) => t.id === s.activeId);
  // Jagora asked her a question and she answered by typing or speaking
  const open = current?.messages.findLast((m) => m.kind === "choice" && !m.picked);
  if (current && open && current.status === "waiting") {
    s.push(current.id, { id: uid(), kind: "user", text, attachment });
    answer(current.id, open.id, text || attachment?.name || "");
    return current.id;
  }
  const msg = { id: uid(), kind: "user" as const, text: text || attachment?.name || "", attachment };
  const chat = opts?.chat && s.tasks.find((t) => t.id === opts.chat);
  if (chat) {
    s.push(chat.id, msg);
    s.setStatus(chat.id, "working");
    s.setActive(chat.id);
    if (live) void remoteStart(chat.id, text, attachment && { kind: attachment.kind, name: attachment.name, data: attachment.url });
    else void demo.run(chat.id, demo.intentOf(text, attachment?.kind === "image" || attachment?.kind === "doc"), attachment?.name === "sample" ? "sample" : text);
    return chat.id;
  }
  if (live) {
    // the real agent decides what this is: open a link, search, fill a form, check a message, read a paper
    const id = s.newTask({ title: titleFrom(text, attachment), kind: attachment ? "paper" : "browse", url: "" });
    s.push(id, msg);
    s.setSheet(true);
    void remoteStart(id, text, attachment && { kind: attachment.kind, name: attachment.name, data: attachment.url });
    return id;
  }
  const intent = demo.intentOf(text, attachment?.kind === "image" || attachment?.kind === "doc");
  const id = s.newTask({ title: TITLES[intent], kind: KIND[intent], url: intent === "register" ? "/practice/skills-fair/index.html" : "" });
  s.push(id, msg);
  s.setSheet(true);
  void demo.run(id, intent, attachment?.name === "sample" ? "sample" : text);
  return id;
}

/** A voice note: her recording goes in the chat (she can play it back) and Jagora fills in the words it heard.
    `heard` is what the device's own recognizer caught, used when there is no server. */
export function voiceNote(blob: Blob, audio: string, secs: number, opts?: { chat?: string; heard?: string }) {
  const s = useApp.getState();
  const chat = opts?.chat && s.tasks.find((t) => t.id === opts.chat);
  const id = chat ? chat.id : s.newTask({ title: VOICE_TITLE[s.lang], kind: "browse", url: "" });
  const msgId = uid();
  s.push(id, { id: msgId, kind: "user", text: opts?.heard ?? "", voice: true, audio, secs });
  s.setActive(id);
  if (!s.live) s.setSheet(true);
  if (live) {
    s.setStatus(id, "working");
    void remoteAudio(id, blob, msgId);
    return id;
  }
  const said = opts?.heard?.trim();
  if (!said) {
    s.update(id, msgId, { heard: false } as never);
    s.push(id, { id: uid(), kind: "agent", text: NO_EARS[s.lang] });
    s.setStatus(id, "waiting");
    return id;
  }
  if (!chat) s.setMeta(id, { title: titleFrom(said) });
  void demo.run(id, demo.intentOf(said, false), said);
  return id;
}
const VOICE_TITLE: Record<string, string> = { en: "Voice note", pcm: "Voice note", yo: "Ohùn", ha: "Saƙon murya", ig: "Ozi olu" };
const NO_EARS: Record<string, string> = {
  en: "I couldn't make out that voice note on this device. Please type it, or try again.",
  pcm: "I no fit hear that voice note for this phone. Abeg type am, or try again.",
  yo: "Mi ò lè gbọ́ ohùn yìí lórí ẹ̀rọ yìí. Ẹ jọ̀ọ́ ẹ tẹ̀ ẹ́, tàbí kí ẹ tún gbìyànjú.",
  ha: "Ban iya jin wannan saƙon murya a wannan na'urar ba. Don Allah ka rubuta, ko ka sake gwadawa.",
  ig: "Enweghị m ike ịnụ ozi olu a na ngwaọrụ a. Biko dee ya, ma ọ bụ nwaa ọzọ.",
};

function titleFrom(text: string, a?: Attachment) {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return a ? a.name : "New task";
  return t.length > 42 ? `${t.slice(0, 40).trimEnd()}…` : t.charAt(0).toUpperCase() + t.slice(1);
}

/** A quick action from the home screen (check a message, read a letter). */
export function quick(kind: "scam" | "paper") {
  const s = useApp.getState();
  const id = s.newTask({ title: TITLES[kind], kind: KIND[kind], url: "" });
  s.setSheet(true);
  if (!live) {
    void demo.prompt(id, kind);
    return id;
  }
  // live: ask her for the message or the photo; her reply starts the real agent on this task
  const lang = s.lang;
  pending.set(id, kind);
  s.push(id, { id: uid(), kind: "choice", question: demo.PROMPT[kind][lang], choices: [kind === "scam" ? demo.TRY_SCAM[lang] : demo.SAMPLE_LETTER_REF[lang]] });
  s.setStatus(id, "waiting");
  return id;
}

const pending = new Map<string, "scam" | "paper">();

/** What she typed for a private field: show only a masked hint here, send the value on to the website. */
export function giveSecret(taskId: string, msgId: string, value: string | null) {
  const s = useApp.getState();
  if (value === null) {
    s.update(taskId, msgId, { status: "skipped" } as never);
    if (live) void remoteSecret(taskId, msgId, "");
    else demo.answer(msgId, "");
    return;
  }
  const v = value.trim();
  const shown = v.length > 6 ? `••••${v.slice(-4)}` : "••••";
  s.update(taskId, msgId, { status: "done", shown } as never);
  s.setStatus(taskId, "working");
  if (live) void remoteSecret(taskId, msgId, v);
  else demo.answer(msgId, v);
}

export function answer(taskId: string, msgId: string, value: string) {
  const s = useApp.getState();
  const first = pending.get(taskId);
  if (live && first) {
    pending.delete(taskId);
    s.update(taskId, msgId, { picked: value } as never);
    s.setStatus(taskId, "working");
    const lang = s.lang;
    const sample = first === "scam" ? value === demo.TRY_SCAM[lang] : value === demo.SAMPLE_LETTER_REF[lang];
    const goal = first === "scam" ? `Check if this message is a scam: ${sample ? demo.SAMPLE_SCAM : value}` : "Explain this paper to me in simple words";
    const msg = s.tasks.find((t) => t.id === taskId)?.messages.findLast((m) => m.kind === "user");
    const att = msg && msg.kind === "user" ? msg.attachment : undefined;
    void remoteStart(taskId, goal, sample && first === "paper" ? { kind: "image", name: "letter", data: "/samples/letter.webp" } : att && { kind: att.kind, name: att.name, data: att.url });
    return;
  }
  if (live) void remoteAnswer(taskId, msgId, value);
  else demo.answer(msgId, value);
}

export function stop(taskId: string) {
  if (live) void remoteStop(taskId);
  else demo.stopAll();
  useApp.getState().setStatus(taskId, "stopped");
}

export const SAMPLE_SCAM = demo.SAMPLE_SCAM;
