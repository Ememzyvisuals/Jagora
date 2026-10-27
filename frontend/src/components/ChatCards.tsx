"use client";

/* Chat cards for the real agent's richer answers:
   - Evidence: the highlighted part of the official page or PDF that proves a fact, with where it came from
   - FileCard: a file Jagora downloaded for her
   - VoiceBubble: her voice note (or live turn), playable, with the words Jagora heard */
import { ArrowSquareOut, DownloadSimple, FileText, FilePdf, Pause, Play, SealCheck, Warning, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp, type Msg } from "@/lib/store";
import type { Lang } from "@/lib/i18n";

type L = Record<Lang, string>;
const W: Record<string, L> = {
  official: { en: "Official site", pcm: "Official site", yo: "Ojú-òpó ìjọba/ilé-ẹ̀kọ́ gangan", ha: "Shafin hukuma", ig: "Saịtị gọọmentị/ụlọ akwụkwọ n'ezie" },
  unofficial: { en: "Not an official site", pcm: "No be official site", yo: "Kì í ṣe ojú-òpó gangan", ha: "Ba shafin hukuma ba", ig: "Ọ bụghị saịtị n'ezie" },
  page: { en: "page", pcm: "page", yo: "ojú-ìwé", ha: "shafi", ig: "peeji" },
  open: { en: "Open source", pcm: "Open the source", yo: "Ṣí orísun", ha: "Buɗe tushen", ig: "Mepee isi mmalite" },
  download: { en: "Download", pcm: "Download", yo: "Gbà á sílẹ̀", ha: "Sauke", ig: "Budata" },
  hearing: { en: "Listening to your voice note…", pcm: "I dey hear your voice note…", yo: "Mo ń gbọ́ ohùn yín…", ha: "Ina sauraron saƙon muryarka…", ig: "Ana m ege ozi olu gị…" },
  missed: { en: "Couldn't make out the words", pcm: "I no hear the words well", yo: "Mi ò gbọ́ ọ̀rọ̀ náà dáadáa", ha: "Ban ji kalmomin sosai ba", ig: "Anụghị m okwu ndị ahụ nke ọma" },
};

const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function Evidence({ m }: { m: Extract<Msg, { kind: "evidence" }> }) {
  const lang = useApp((s) => s.lang);
  const [big, setBig] = useState(false);
  const src = m.image ? `data:image/jpeg;base64,${m.image}` : "";
  return (
    <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_10px_30px_-18px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      {src && (
        <button onClick={() => setBig(true)} className="block w-full bg-[#f3f5f8] dark:bg-black/30" aria-label="See the highlighted part larger">
          <img src={src} alt={m.quote} className="max-h-[240px] w-full object-cover object-center" />
        </button>
      )}
      <div className="px-4 pb-3.5 pt-3">
        <div className={`mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${m.official ? "bg-ok/12 text-ok" : "bg-stop-soft text-stop"}`}>
          {m.official ? <SealCheck size={14} weight="fill" /> : <Warning size={14} weight="fill" />}
          {m.official ? `${W.official[lang]}${m.owner ? ` · ${m.owner}` : ""}` : W.unofficial[lang]}
        </div>
        <p className="text-[16px] font-semibold leading-snug text-ink">{m.claim}</p>
        <p className="mt-1.5 border-l-2 border-accent/60 pl-2.5 text-[14px] italic leading-snug text-ink-2">“{m.quote.length > 240 ? `${m.quote.slice(0, 238)}…` : m.quote}”</p>
        <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-ink-3">
          <span className="min-w-0 truncate">
            {m.site}
            {m.page ? ` · ${W.page[lang]} ${m.page}` : ""}
            {m.date ? ` · ${m.date}` : ""}
          </span>
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline">
            {W.open[lang]} <ArrowSquareOut size={13} />
          </a>
        </div>
      </div>
      <Lightbox open={big} onClose={() => setBig(false)} src={src} caption={`${m.title} · ${m.site}${m.page ? ` · ${W.page[lang]} ${m.page}` : ""}`} />
    </div>
  );
}

function Lightbox({ open, onClose, src, caption }: { open: boolean; onClose: () => void; src: string; caption: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-black/75 p-4 backdrop-blur-sm">
          <button onClick={onClose} className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white" aria-label="Close">
            <X size={18} weight="bold" />
          </button>
          <motion.img initial={{ scale: 0.96 }} animate={{ scale: 1 }} src={src} alt={caption} className="max-h-[80dvh] max-w-full rounded-[14px] bg-white shadow-2xl" />
          <p className="max-w-[640px] text-center text-[13.5px] text-white/80">{caption}</p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function FileCard({ m }: { m: Extract<Msg, { kind: "file" }> }) {
  const lang = useApp((s) => s.lang);
  const pdf = m.type.includes("pdf") || m.name.toLowerCase().endsWith(".pdf");
  const Icon = pdf ? FilePdf : FileText;
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-white p-3 pr-3.5 shadow-[0_10px_30px_-18px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-[14px] ${pdf ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"}`}>
        <Icon size={26} weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{m.name}</p>
        <p className="truncate text-[12.5px] text-ink-3">
          {fmtSize(m.size)}
          {m.source ? ` · ${new URL(m.source).hostname.replace(/^www\./, "")}` : ""}
        </p>
      </div>
      <a href={m.url} download={m.name} target="_blank" rel="noopener noreferrer" className="btn btn-ink h-10 shrink-0 px-4 text-[14px]">
        <DownloadSimple size={16} weight="bold" /> {W.download[lang]}
      </a>
    </div>
  );
}

/** Her voice message: play it back, see the words Jagora heard. */
export function VoiceBubble({ m }: { m: Extract<Msg, { kind: "user" }> }) {
  const lang = useApp((s) => s.lang);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  // a fixed waveform for this message, so it looks like a voice note without decoding the audio
  const bars = useMemo(() => {
    let x = [...m.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    return Array.from({ length: 26 }, (_, i) => {
      x = (x * 1103515245 + 12345) >>> 0;
      const env = Math.sin((Math.PI * (i + 1)) / 27);
      return 0.22 + 0.78 * env * ((x % 1000) / 1000) ** 0.6;
    });
  }, [m.id]);
  const dur = m.secs ?? 0;
  const toggle = () => {
    if (!m.audio) return;
    if (!audio.current) {
      audio.current = new Audio(m.audio);
      audio.current.ontimeupdate = () => setAt(audio.current!.currentTime);
      audio.current.onended = () => (setPlaying(false), setAt(0));
    }
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      void audio.current.play();
      setPlaying(true);
    }
  };
  useEffect(() => () => audio.current?.pause(), []);
  const progress = dur ? Math.min(1, at / dur) : 0;
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-ink px-3 py-2.5 text-paper">
        <div className="flex items-center gap-2.5">
          <button onClick={toggle} disabled={!m.audio} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper/15 disabled:opacity-40" aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
          </button>
          <div className="flex h-7 items-center gap-[3px]" aria-hidden>
            {bars.map((h, i) => (
              <span key={i} className={`w-[3px] rounded-full ${i / bars.length < progress ? "bg-paper" : "bg-paper/45"}`} style={{ height: `${h * 100}%` }} />
            ))}
          </div>
          <span className="pr-1 text-[12.5px] tabular-nums text-paper/70">{mmss(playing ? at : dur)}</span>
        </div>
        <p className={`mt-1.5 px-1 text-[15px] leading-snug ${m.text ? "" : "italic text-paper/60"}`}>
          {m.text || (m.heard === false ? W.missed[lang] : W.hearing[lang])}
        </p>
      </div>
    </div>
  );
}
