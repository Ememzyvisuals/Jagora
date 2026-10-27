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

const PLAN: L = { en: "Plan", pcm: "Plan", yo: "Ètò", ha: "Shiri", ig: "Atụmatụ" };
const REMIND: L = { en: "Reminder set", pcm: "Reminder don set", yo: "Ìrántí ti wà", ha: "An saita tunatarwa", ig: "Edoziela ncheta" };
const SAVED: L = { en: "Saved", pcm: "Saved", yo: "Ti fipamọ́", ha: "An adana", ig: "Echekwara" };
const EVERY: Record<string, L> = {
  daily: { en: "every day", pcm: "every day", yo: "lójoojúmọ́", ha: "kowace rana", ig: "kwa ụbọchị" },
  weekly: { en: "every week", pcm: "every week", yo: "lọ́ọ̀sẹ̀ọ̀sẹ̀", ha: "kowane mako", ig: "kwa izu" },
  monthly: { en: "every month", pcm: "every month", yo: "lóṣooṣù", ha: "kowane wata", ig: "kwa ọnwa" },
};
const LOCALE: Record<Lang, string> = { en: "en-NG", pcm: "en-NG", yo: "yo-NG", ha: "ha-NG", ig: "ig-NG" };

/** Jagora's plan for a longer task: a checklist it ticks off as it goes. */
export function PlanCard({ m }: { m: Extract<Msg, { kind: "plan" }> }) {
  const lang = useApp((s) => s.lang);
  const done = m.steps.filter((x) => x.status === "done").length;
  return (
    <div className="rounded-[22px] bg-white/80 p-4 shadow-[0_10px_30px_-20px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="font-head text-[17px] text-ink">{PLAN[lang]}</p>
        <span className="text-[12.5px] tabular-nums text-ink-3">{done}/{m.steps.length}</span>
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-black/5">
        <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: `${(done / Math.max(1, m.steps.length)) * 100}%` }} />
      </div>
      <ol className="flex flex-col gap-2">
        {m.steps.map((x, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[14.5px] leading-snug">
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
              x.status === "done" ? "bg-ok text-snow" : x.status === "doing" ? "bg-accent text-snow" : x.status === "skipped" ? "bg-black/10 text-ink-3" : "ring-1 ring-ink/20 text-ink-3"}`}>
              {x.status === "done" ? "✓" : x.status === "doing" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-snow" /> : i + 1}
            </span>
            <span className={x.status === "done" ? "text-ink-3 line-through decoration-ink/20" : x.status === "skipped" ? "text-ink-3" : x.status === "doing" ? "font-semibold text-ink" : "text-ink-2"}>{x.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ReminderCard({ m }: { m: Extract<Msg, { kind: "reminder" }> }) {
  const lang = useApp((s) => s.lang);
  useEffect(() => {
    // reminders reach her through notifications too, when she allows them
    try {
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    } catch {}
  }, []);
  const d = new Date(m.at);
  const when = d.toLocaleString(LOCALE[lang], { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-white/80 p-3 shadow-[0_10px_30px_-20px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center overflow-hidden rounded-[14px] bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)] dark:bg-black/30">
        <span className="w-full bg-danger py-0.5 text-center text-[10px] font-bold uppercase text-snow">{d.toLocaleString("en-NG", { month: "short" })}</span>
        <span className="text-[21px] font-semibold leading-tight text-ink">{d.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold text-accent">{REMIND[lang]}{m.repeat && m.repeat !== "none" && EVERY[m.repeat] ? ` · ${EVERY[m.repeat][lang]}` : ""}</p>
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{m.text}</p>
        <p className="text-[12.5px] text-ink-3">{when}</p>
      </div>
    </div>
  );
}

export function MomentCard({ m }: { m: Extract<Msg, { kind: "moment" }> }) {
  const lang = useApp((s) => s.lang);
  return (
    <div className="rounded-[20px] bg-white/80 p-3.5 shadow-[0_10px_30px_-20px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      <p className="text-[12.5px] font-semibold text-ok">{SAVED[lang]}</p>
      <p className="text-[15px] font-semibold leading-snug text-ink">{m.title}</p>
      {m.note && <p className="mt-0.5 line-clamp-3 text-[14px] leading-snug text-ink-2">{m.note}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {m.tags.map((t) => (
          <span key={t} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[12.5px] font-semibold text-accent">#{t.replace(/^#/, "")}</span>
        ))}
        {m.url && (
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="ml-auto truncate text-[12.5px] text-ink-3 hover:underline">
            {m.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
          </a>
        )}
      </div>
    </div>
  );
}

/** a song, voice note or video from a website, playing here */
export function MediaCard({ m }: { m: Extract<Msg, { kind: "media" }> }) {
  const video = m.type.startsWith("video") || /\.(mp4|webm|mov)$/i.test(m.name);
  return (
    <div className="overflow-hidden rounded-[20px] bg-white p-3 shadow-[0_10px_30px_-18px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      <p className="mb-2 truncate px-1 text-[14.5px] font-semibold text-ink">{m.name}</p>
      {video ? (
        <video src={m.url} controls autoPlay playsInline className="w-full rounded-[14px] bg-black" />
      ) : (
        <audio src={m.url} controls autoPlay className="w-full" />
      )}
      {m.source && <p className="mt-1.5 truncate px-1 text-[12px] text-ink-3">{new URL(m.source).hostname.replace(/^www\./, "")}</p>}
    </div>
  );
}

const LATER: L = { en: "Jagora will do this on its own", pcm: "Jagora go do am by itself", yo: "Jagora á ṣe èyí fúnra rẹ̀", ha: "Jagora za ta yi wannan da kanta", ig: "Jagora ga-eme nke a n'onwe ya" };
const MAY: L = { en: "Allowed without asking on", pcm: "E fit submit without asking for", yo: "Ó lè fi ránṣẹ́ láì béèrè lórí", ha: "Za ta iya aikawa ba tare da tambaya ba a", ig: "O nwere ike ịzipu na-ajụghị na" };

/** a task Jagora will do later by itself */
export function ScheduledCard({ m }: { m: Extract<Msg, { kind: "scheduled" }> }) {
  const lang = useApp((s) => s.lang);
  const when = new Date(m.at).toLocaleString(LOCALE[lang], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="rounded-[20px] bg-ink p-4 text-paper shadow-[0_14px_34px_-20px_rgba(10,30,70,.7)]">
      <p className="text-[12.5px] font-semibold text-paper/70">{LATER[lang]}</p>
      <p className="mt-0.5 text-[20px] leading-tight">{when}</p>
      <p className="mt-1.5 line-clamp-3 text-[14.5px] leading-snug text-paper/90">{m.goal}</p>
      {m.allow?.length > 0 && <p className="mt-2 text-[12.5px] text-paper/70">{MAY[lang]} {m.allow.join(", ")}</p>}
    </div>
  );
}

const POINT: L = { en: "Show me on the page", pcm: "Show me for the page", yo: "Fi hàn mí lórí ojú-ìwé", ha: "Nuna mini a shafin", ig: "Gosi m na peeji" };
/** Jagora is not sure what she means: she taps it on the live page */
export function PointAskCard({ m }: { m: Extract<Msg, { kind: "pointask" }> }) {
  const lang = useApp((s) => s.lang);
  const setSheet = useApp((s) => s.setSheet);
  return (
    <div className={`rounded-[20px] p-4 ring-1 ${m.status === "waiting" ? "bg-white ring-accent/40 dark:bg-[#23262d]" : "bg-white/60 ring-black/5"}`}>
      <p className="text-[15.5px] font-semibold leading-snug text-ink">{m.question}</p>
      {m.status === "waiting" && (
        <button onClick={() => setSheet(false)} className="btn btn-ink mt-3 h-10 px-4 text-[14px] md:hidden">
          {POINT[lang]}
        </button>
      )}
    </div>
  );
}
