"use client";

import { ArrowUp, ClipboardText, Paperclip, Stop } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { ask, live } from "@/lib/engine";
import { remoteAudio } from "@/lib/engine/remote";
import { t, type Lang } from "@/lib/i18n";
import { LiveButton } from "./LiveMode";
import { useApp } from "@/lib/store";

const SPEECH_LANG: Record<Lang, string> = { en: "en-NG", pcm: "en-NG", yo: "yo-NG", ha: "ha-NG", ig: "ig-NG" };

type Rec = { start: () => void; stop: () => void; onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null; lang: string; interimResults: boolean };

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

export async function sendVoice(blob: Blob | null) {
  const s = useApp.getState();
  if (live && blob && s.activeId) await remoteAudio(s.activeId, blob);
}

export function Composer() {
  const lang = useApp((s) => s.lang);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const send = () => {
    const v = text.trim();
    if (!v) return;
    ask(v);
    setText("");
  };

  const paste = async () => {
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (clip) ask(clip, { kind: "link", name: clip.slice(0, 40) });
      else setNote("Your clipboard is empty. Copy the message first.");
    } catch {
      setNote("Allow pasting, or long-press the box and paste.");
    }
  };

  const attach = (f: File | undefined) => {
    if (!f) return;
    // a data URL, so the same file can go to the agent and still show in the chat after a reload
    const r = new FileReader();
    r.onload = () => ask("", { kind: f.type.startsWith("image/") ? "image" : "doc", name: f.name, url: String(r.result) });
    r.readAsDataURL(f);
  };

  return (
    <div className="px-3 pb-3">
      {note && <p className="px-3 pb-1.5 text-[12.5px] text-ink-3">{note}</p>}
      <div className="glass-3 flex items-center gap-1 rounded-full p-1.5">
        <button className="btn h-10 w-10 shrink-0 text-ink-2 hover:bg-white" onClick={paste} aria-label="Paste a message">
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
          <button className="btn btn-ink h-10 w-10 shrink-0" onClick={send} aria-label="Send">
            <ArrowUp size={18} weight="bold" />
          </button>
        ) : (
          <LiveButton compact />
        )}
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
