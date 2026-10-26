"use client";

import { CaretDown, Check } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ago } from "@/lib/hooks";
import { LANGS } from "@/lib/i18n";
import { useApp, type Task } from "@/lib/store";
import { IconBrowser, IconDetails, IconLetter, IconPasteMessage, IconRegister, IconScam, IconShield, IconSnapPaper } from "../icons";

export function TaskIcon({ task, size = 40 }: { task: Task; size?: number }) {
  if (task.kind === "browse") return <IconRegister size={size} />;
  if (task.kind === "scam") {
    const v = task.messages.find((m) => m.kind === "verdict");
    return v && v.kind === "verdict" && v.verdict === "scam" ? <IconScam size={size} /> : v ? <IconShield size={size} tone="green" /> : <IconPasteMessage size={size} />;
  }
  if (task.kind === "paper") return <IconLetter size={size} />;
  return <IconBrowser size={size} />;
}

export function lastLine(task: Task) {
  for (let i = task.messages.length - 1; i >= 0; i--) {
    const m = task.messages[i];
    if (m.kind === "agent") return m.text;
    if (m.kind === "confirm" && m.status === "waiting") return m.question;
    if (m.kind === "choice" && !m.picked) return m.question;
    if (m.kind === "verdict") return m.title;
    if (m.kind === "result") return m.reference ? `${m.title}, ${m.reference}` : m.title;
  }
  return "";
}

const STATUS = {
  working: { label: "Working", cls: "bg-accent-soft text-accent" },
  waiting: { label: "Needs you", cls: "bg-stop-soft text-stop" },
  done: { label: "Done", cls: "bg-[#e1f3ea] dark:bg-[#1f3a2c] text-ok" },
  stopped: { label: "Stopped", cls: "bg-mist-2 text-ink-3" },
};

export function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const s = STATUS[task.status];
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-[22px] bg-white/70 p-3 text-left shadow-[0_10px_30px_-22px_rgba(60,38,16,.4)] transition hover:bg-white">
      <TaskIcon task={task} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15.5px] font-medium text-ink">{task.title}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${s.cls}`}>{s.label}</span>
        </div>
        <p className="mt-0.5 truncate text-[13.5px] text-ink-3">{lastLine(task) || ago(task.createdAt)}</p>
      </div>
    </button>
  );
}

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const [open, setOpen] = useState(false);
  const cur = LANGS.find((l) => l.id === lang)!;
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className={`btn btn-glass ${compact ? "h-9 px-3 text-[13.5px]" : "h-10 px-4 text-[14px]"}`} aria-haspopup="listbox" aria-expanded={open}>
        {cur.native} <CaretDown size={13} weight="bold" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="glass-3 absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-[20px] p-1.5"
          >
            {LANGS.map((l) => (
              <li key={l.id}>
                <button
                  role="option"
                  aria-selected={l.id === lang}
                  onClick={() => (setLang(l.id), setOpen(false))}
                  className={`flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left hover:bg-white ${l.id === lang ? "bg-white" : ""}`}
                >
                  <span>
                    <span className="block text-[15px] font-medium text-ink">{l.native}</span>
                    <span className="block text-[12.5px] text-ink-3">{l.hello}</span>
                  </span>
                  {l.id === lang && <Check size={16} weight="bold" className="text-accent" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export const QUICK = [
  { id: "register", Icon: IconRegister, label: { en: "Register", pcm: "Register", yo: "Forúkọsílẹ̀", ha: "Rajista", ig: "Debanye aha" } },
  { id: "scam", Icon: IconPasteMessage, label: { en: "Check message", pcm: "Check message", yo: "Yẹ ọ̀rọ̀ wò", ha: "Duba saƙo", ig: "Lelee ozi" } },
  { id: "paper", Icon: IconSnapPaper, label: { en: "Read a letter", pcm: "Read letter", yo: "Ka lẹ́tà", ha: "Karanta wasiƙa", ig: "Gụọ akwụkwọ" } },
  { id: "details", Icon: IconDetails, label: { en: "My details", pcm: "My details", yo: "Àlàyé mi", ha: "Bayanaina", ig: "Nkọwa m" } },
] as const;
