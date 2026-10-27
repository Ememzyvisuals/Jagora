"use client";

import { ClipboardText, Microphone, Paperclip, PaperPlaneRight, Stop, Trash } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ask, voiceNote } from "@/lib/engine";
import { t, type Lang } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { blobToDataUrl, useVoice } from "@/lib/voice";
import { fly } from "./Effects";
import { LiveButton } from "./LiveMode";

const SPEECH_LANG: Record<Lang, string> = { en: "en-NG", pcm: "en-NG", yo: "yo-NG", ha: "ha-NG", ig: "ig-NG" };

type Rec = { start: () => void; stop: () => void; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; lang: string; interimResults: boolean; continuous?: boolean };

/** Voice without the server: the browser's own speech recognition, where the device offers it. */
export function browserRecognizer(lang: Lang): Rec | null {
  const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const C = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!C) return null;
  const r = new C();
  r.lang = SPEECH_LANG[lang];
  r.interimResults = false;
  return r;
}

const NOTE: Record<"hold" | "cancel" | "send", Record<Lang, string>> = {
  hold: { en: "Record a voice note", pcm: "Record voice note", yo: "Gba ohùn sílẹ̀", ha: "Naɗi saƙon murya", ig: "Dekọọ ozi olu" },
  cancel: { en: "Delete", pcm: "Delete am", yo: "Pa á rẹ́", ha: "Share", ig: "Hichapụ" },
  send: { en: "Send voice note", pcm: "Send am", yo: "Fi ránṣẹ́", ha: "Aika", ig: "Zipu" },
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The chat's input: type, paste a message, attach a photo or document, record a voice note, or go Live.
    Everything sent here continues the open conversation. */
export function Composer() {
  const lang = useApp((s) => s.lang);
  const chat = useApp((s) => s.activeId) ?? undefined;
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const voice = useVoice();
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const started = useRef(0);
  const heard = useRef("");
  const recog = useRef<Rec | null>(null);
  const bars = useRef<HTMLDivElement>(null);

  // the timer and a little live waveform while she records
  useEffect(() => {
    if (!recording) return;
    let raf = 0;
    const lv: number[] = Array(28).fill(0.08);
    const tick = () => {
      setSecs((performance.now() - started.current) / 1000);
      lv.push(Math.max(0.08, voice.level.current));
      lv.shift();
      const el = bars.current;
      if (el) [...el.children].forEach((c, i) => ((c as HTMLElement).style.transform = `scaleY(${lv[i]})`));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [recording, voice.level]);

  const send = () => {
    const v = text.trim();
    if (!v) return;
    fly(document.querySelector('[data-send="composer"]'));
    ask(v, undefined, { chat });
    setText("");
  };

  const paste = async () => {
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (clip) ask(clip, { kind: "link", name: clip.slice(0, 40) }, { chat });
      else setNote("Your clipboard is empty. Copy the message first.");
    } catch {
      setNote("Allow pasting, or long-press the box and paste.");
    }
  };

  const attach = (f: File | undefined) => {
    if (!f) return;
    // a data URL, so the same file can go to the agent and still show in the chat after a reload
    const r = new FileReader();
    r.onload = () => ask("", { kind: f.type.startsWith("image/") ? "image" : "doc", name: f.name, url: String(r.result) }, { chat });
    r.readAsDataURL(f);
  };

  const record = async () => {
    setNote("");
    heard.current = "";
    await voice.start();
    started.current = performance.now();
    setSecs(0);
    setRecording(true);
    const r = browserRecognizer(lang);
    if (r) {
      r.continuous = true;
      r.onresult = (e) => {
        heard.current = Array.from(e.results as unknown as ArrayLike<{ 0: { transcript: string } }>).map((x) => x[0].transcript).join(" ").trim();
      };
      try {
        r.start();
      } catch {}
      recog.current = r;
    }
  };

  const finish = async (keep: boolean) => {
    setRecording(false);
    recog.current?.stop();
    recog.current = null;
    const blob = await voice.stop();
    const length = (performance.now() - started.current) / 1000;
    if (!keep || !blob || length < 0.6) return;
    await new Promise((r) => setTimeout(r, 350)); // the device recognizer's last words
    fly(document.querySelector('[data-send="composer"]'));
    voiceNote(blob, await blobToDataUrl(blob), length, { chat, heard: heard.current });
  };

  useEffect(() => {
    if (voice.error) {
      setRecording(false);
      setNote("Allow the microphone to record a voice note.");
    }
  }, [voice.error]);

  return (
    <div className="px-3 pb-3">
      {note && <p className="px-3 pb-1.5 text-[12.5px] text-ink-3">{note}</p>}
      <div className="glass-3 relative flex items-center gap-1 rounded-full p-1.5">
        <AnimatePresence initial={false} mode="wait">
          {recording ? (
            <motion.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-w-0 flex-1 items-center gap-2 pl-1">
              <button className="btn h-10 w-10 shrink-0 text-danger hover:bg-white" onClick={() => finish(false)} aria-label={NOTE.cancel[lang]}>
                <Trash size={19} />
              </button>
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-danger" />
              <span className="w-10 shrink-0 text-[14px] tabular-nums text-ink">{mmss(secs)}</span>
              <div ref={bars} className="flex h-7 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
                {Array.from({ length: 28 }, (_, i) => (
                  <span key={i} className="h-full w-[3px] shrink-0 origin-center rounded-full bg-accent/80 transition-transform duration-75" style={{ transform: "scaleY(.08)" }} />
                ))}
              </div>
              <button className="btn btn-ink h-10 w-10 shrink-0" data-send="composer" onClick={() => finish(true)} aria-label={NOTE.send[lang]}>
                <PaperPlaneRight size={18} weight="fill" />
              </button>
            </motion.div>
          ) : (
            <motion.div key="type" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-w-0 flex-1 items-center gap-1">
              <button className="btn h-10 w-10 shrink-0 text-ink-2 hover:bg-white md:hidden" onClick={paste} aria-label="Paste a message">
                <ClipboardText size={20} />
              </button>
              <input
                value={text}
                onChange={(e) => (setText(e.target.value), setNote(""))}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={t("typeHere", lang)}
                className="min-w-0 flex-1 bg-transparent px-1 text-[16px] text-ink outline-none placeholder:text-ink-3"
                aria-label={t("typeHere", lang)}
              />
              <button className="btn h-10 w-10 shrink-0 text-ink-2 hover:bg-white" onClick={() => file.current?.click()} aria-label="Add a photo or document">
                <Paperclip size={20} />
              </button>
              <input ref={file} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(e) => attach(e.target.files?.[0])} />
              {text.trim() ? (
                <button className="btn btn-ink h-10 w-10 shrink-0" data-send="composer" onClick={send} aria-label="Send">
                  <PaperPlaneRight size={18} weight="fill" />
                </button>
              ) : (
                <>
                  <button className="btn h-10 w-10 shrink-0 text-ink-2 hover:bg-white" onClick={record} aria-label={NOTE.hold[lang]} title={NOTE.hold[lang]}>
                    <Microphone size={20} />
                  </button>
                  <LiveButton compact />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button className="btn btn-glass h-9 px-3.5 text-[13.5px]" onClick={onStop}>
      <Stop size={14} weight="fill" /> Stop
    </button>
  );
}
