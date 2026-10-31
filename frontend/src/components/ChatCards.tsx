"use client";

/* Chat cards for the real agent's richer answers:
   - Evidence: the highlighted part of the official page or PDF that proves a fact, with where it came from
   - FileCard: a file Jagora downloaded for her
   - VoiceBubble: her voice note (or live turn), playable, with the words Jagora heard */
import { ArrowSquareOut, Bell, Microphone, BellRinging, DownloadSimple, FileText, FilePdf, Pause, Play, SealCheck, Warning, X } from "@phosphor-icons/react";
import { Rich } from "./Rich";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp, type Msg } from "@/lib/store";
import type { Lang } from "@/lib/i18n";
import { live } from "@/lib/engine";
import { enablePush, pushState, type PushState } from "@/lib/push";

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
          {/* the whole picture, so the yellow highlight is always in view; tap to see it large */}
          <img src={src} alt={m.quote} className="max-h-[300px] w-full object-contain object-center" />
        </button>
      )}
      <div className="px-3.5 pb-3 pt-2.5 sm:px-4 sm:pb-3.5 sm:pt-3">
        <div className={`mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${m.official ? "bg-ok/12 text-ok" : "bg-stop-soft text-stop"}`}>
          {m.official ? <SealCheck size={14} weight="fill" /> : <Warning size={14} weight="fill" />}
          {m.official ? `${W.official[lang]}${m.owner ? ` · ${m.owner}` : ""}` : W.unofficial[lang]}
        </div>
        <p className="text-[15px] font-semibold leading-snug text-ink sm:text-[16px]">{m.claim}</p>
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
          <button onClick={onClose} className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] grid h-10 w-10 place-items-center rounded-full bg-white/15 text-snow" aria-label="Close">
            <X size={18} weight="bold" />
          </button>
          <motion.img initial={{ scale: 0.96 }} animate={{ scale: 1 }} src={src} alt={caption} className="max-h-[80dvh] max-w-full rounded-[14px] bg-white shadow-2xl" />
          <p className="max-w-[640px] text-center text-[13.5px] text-snow/80">{caption}</p>
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
          {m.source ? ` · ${new URL(m.source, "https://x.invalid").hostname.replace(/^www\./, "")}` : ""}
        </p>
      </div>
      <a href={m.url} download={m.name} target="_blank" rel="noopener noreferrer" className="btn btn-ink h-10 shrink-0 px-4 text-[14px]">
        <DownloadSimple size={16} weight="bold" /> {W.download[lang]}
      </a>
    </div>
  );
}

/** Her voice message: play it back, see the words Jagora heard. */
// her spoken words are never printed back (the recogniser's spelling embarrasses her, in every language): the bubble
// says she spoke and in which language; Jagora still answers from what it heard
const HIDE_WORDS = new Set<Lang>(["en", "pcm", "yo", "ha", "ig"]);
const SPOKE: Record<Lang, string> = { en: "English voice", pcm: "Pidgin voice", yo: "Ohùn Yorùbá", ha: "Muryar Hausa", ig: "Olu Igbo" };

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
  // Yorùbá, Hausa and Igbo: the speech recogniser's spelling is often wrong, so her words are not printed back to her.
  // The bubble says she spoke, in which language; Jagora still answers from what it heard
  const said = m.lang ?? lang; // the language her voice was transcribed in
  const hidden = HIDE_WORDS.has(said);
  if (!m.audio && hidden)
    return (
      <div className="flex justify-end">
        <div className="flex items-center gap-2.5 rounded-[20px] rounded-br-[6px] bg-ink px-3.5 py-2.5 text-paper">
          <Microphone size={17} weight="fill" className="shrink-0 text-paper/85" />
          <div className="flex h-6 items-center gap-[3px]" aria-hidden>
            {bars.slice(0, 18).map((h, i) => (
              <span key={i} className="w-[3px] rounded-full bg-paper/60" style={{ height: `${h * 100}%` }} />
            ))}
          </div>
          <span className="text-[14px] font-semibold">{m.heard === false ? W.missed[lang] : SPOKE[said]}</span>
        </div>
      </div>
    );
  // heard live (her voice on LiveKit): no recording to play, just her words appearing as she speaks
  if (!m.audio)
    return (
      <div className="flex justify-end">
        <p className={`max-w-[85%] rounded-[20px] rounded-br-[6px] bg-ink px-4 py-2.5 text-[15.5px] leading-snug text-paper ${m.text ? "" : "italic text-paper/60"}`}>
          {m.text || (m.heard === false ? W.missed[lang] : "…")}
        </p>
      </div>
    );
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
        <p className={`mt-1.5 px-1 text-[15px] leading-snug ${m.text && !hidden ? "" : "italic text-paper/60"}`}>
          {m.heard === false ? W.missed[lang] : hidden ? SPOKE[said] : m.text || W.hearing[lang]}
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

const NOTIFY: L = { en: "Notify me on this phone", pcm: "Alert me for this phone", yo: "Fi ìkìlọ̀ ránṣẹ́ sí fóònù yìí", ha: "Sanar da ni a wannan wayar", ig: "Zitere m ozi na ekwentị a" };
const NOTIFY_ON: L = { en: "Notifications are on", pcm: "Alert don on", yo: "Ìkìlọ̀ ti tàn", ha: "Sanarwa a kunne take", ig: "Ozi agbanyela" };
const NOTIFY_IOS: L = {
  en: "To get alerts on iPhone, add Jagora to your Home Screen first (Share, then Add to Home Screen).",
  pcm: "For iPhone, add Jagora to Home Screen first (Share, then Add to Home Screen).",
  yo: "Lórí iPhone, kọ́kọ́ fi Jagora sí Home Screen (Share, lẹ́yìn náà Add to Home Screen).",
  ha: "A iPhone, fara saka Jagora a Home Screen (Share, sannan Add to Home Screen).",
  ig: "Na iPhone, buru ụzọ tinye Jagora na Home Screen (Share, mgbe ahụ Add to Home Screen).",
};
const NOTIFY_BLOCKED: L = { en: "Notifications are blocked for Jagora in this browser's settings.", pcm: "Alert dey blocked for this browser settings.", yo: "Ìkìlọ̀ ti di dídí nínú ètò ẹ̀rọ aṣàwákiri yìí.", ha: "An toshe sanarwa a saitunan wannan burauza.", ig: "Egbochiri ozi na ntọala ihe nchọgharị a." };

/** "Notify me on this phone": reminders and results reach her lock screen even when Jagora is closed. */
export function NotifyButton({ dark = false }: { dark?: boolean }) {
  const lang = useApp((s) => s.lang);
  const [st, setSt] = useState<PushState | "busy" | null>(null);
  useEffect(() => {
    if (!live) return;
    void pushState().then(setSt);
  }, []);
  if (!live || !st || st === "unsupported") return null;
  if (st === "on") return <p className={`mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold ${dark ? "text-paper/70" : "text-ok"}`}><BellRinging size={14} weight="fill" /> {NOTIFY_ON[lang]}</p>;
  if (st === "needs-install" || st === "blocked") return <p className={`mt-2 text-[12.5px] leading-snug ${dark ? "text-paper/70" : "text-ink-3"}`}>{st === "blocked" ? NOTIFY_BLOCKED[lang] : NOTIFY_IOS[lang]}</p>;
  return (
    <button
      onClick={async () => {
        setSt("busy");
        setSt(await enablePush().catch(() => "off" as const));
      }}
      disabled={st === "busy"}
      className={`mt-2.5 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold ${dark ? "bg-paper text-ink" : "bg-ink text-paper"}`}
    >
      <Bell size={15} weight="bold" /> {NOTIFY[lang]}
    </button>
  );
}

export function ReminderCard({ m }: { m: Extract<Msg, { kind: "reminder" }> }) {
  const lang = useApp((s) => s.lang);
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
        <NotifyButton />
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

/** a song, voice note or video from a website: it plays big on her screen (NowPlaying); this card plays it again */
const PLAY: L = { en: "Play on screen", pcm: "Play am for screen", yo: "Ṣe é lórí ojú-iboju", ha: "Kunna a kan allo", ig: "Kpọọ ya na ihuenyo" };
export function MediaCard({ m }: { m: Extract<Msg, { kind: "media" }> }) {
  const lang = useApp((s) => s.lang);
  const playing = useApp((s) => s.playing?.id === m.id);
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-white p-3 shadow-[0_10px_30px_-18px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-[14.5px] font-semibold text-ink">{m.name}</p>
        {m.source && <p className="truncate text-[12px] text-ink-3">{new URL(m.source, "https://x.invalid").hostname.replace(/^www\./, "")}</p>}
      </div>
      {!playing && (
        <button onClick={() => useApp.getState().setPlaying(m)} className="btn-ink shrink-0 rounded-full px-4 py-2 text-[13.5px] font-semibold">
          {PLAY[lang]}
        </button>
      )}
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
      <NotifyButton dark />
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
      <Rich text={m.question} className="text-[15.5px] font-semibold leading-snug text-ink" />
      {m.status === "waiting" && (
        <button onClick={() => setSheet(false)} className="btn btn-ink mt-3 h-10 px-4 text-[14px] md:hidden">
          {POINT[lang]}
        </button>
      )}
    </div>
  );
}

const TERMS: Record<"title" | "ok" | "caution" | "red" | "read", L> = {
  title: { en: "Terms and privacy, read for you", pcm: "Terms and privacy, I don read am for you", yo: "Òfin àti àṣírí, mo ti kà á fún yín", ha: "Ka'idoji da sirri, na karanta maka", ig: "Usoro na nzuzo, agụrụ m ya maka gị" },
  ok: { en: "Nothing unusual", pcm: "Nothing wey bad", yo: "Kò sí ohun tó burú", ha: "Babu matsala", ig: "Ọ dịghị nsogbu" },
  caution: { en: "Be careful", pcm: "Shine your eye", yo: "Ẹ ṣọ́ra", ha: "A yi hankali", ig: "Kpachara anya" },
  red: { en: "Warning", pcm: "Warning", yo: "Ìkìlọ̀", ha: "Gargadi", ig: "Ịdọ aka na ntị" },
  read: { en: "Read the terms", pcm: "Read the terms", yo: "Ka òfin náà", ha: "Karanta ka'idojin", ig: "Gụọ usoro ahụ" },
};
/** a site's terms and privacy policy, read for her: what to watch out for */
const READ: Record<string, L> = {
  title: { en: "Read from what you shared", pcm: "Wetin I read from wetin you send", yo: "Ohun tí mo kà nínú ohun tí ẹ fi ránṣẹ́", ha: "Abin da na karanta daga abin da ka aiko", ig: "Ihe m gụrụ n'ihe i zitere" },
  due: { en: "Deadlines", pcm: "Last day", yo: "Ọjọ́ ìparí", ha: "Ranar ƙarshe", ig: "Ụbọchị njedebe" },
  next: { en: "What to do", pcm: "Wetin to do", yo: "Ohun tí ẹ máa ṣe", ha: "Abin da za a yi", ig: "Ihe ị ga-eme" },
  marked: { en: "Your photo, with the important parts marked", pcm: "Your photo, with the important parts marked", yo: "Fọ́tò yín, pẹ̀lú àwọn apá pàtàkì tí a sàmì sí", ha: "Hotonku, da muhimman wurare an yi musu alama", ig: "Foto gị, ebe ndị dị mkpa ka akara" },
  flags: { en: "Be careful", pcm: "Shine your eye", yo: "Ẹ ṣọ́ra", ha: "Ka yi hankali", ig: "Kpachara anya" },
};

/** Muse Wonder's reading of her photo, PDF or video: the facts, the dates, what it asks, and any scam signs */
export function ReadingCard({ m }: { m: Extract<Msg, { kind: "reading" }> }) {
  const lang = useApp((s) => s.lang);
  const risky = m.risk !== "low" || m.red_flags.length > 0;
  return (
    <div className="rounded-[22px] bg-white p-4 shadow-[0_10px_30px_-20px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      <p className="text-[12.5px] font-semibold text-ink-3">
        {READ.title[lang]}
        {m.from ? ` · ${m.from}` : ""}
      </p>
      <Rich text={m.summary} className="mt-1 text-[15.5px] leading-snug text-ink" />
      {m.image && (
        <a href={m.image} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-[16px] ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.image} alt={READ.marked[lang]} loading="lazy" className="max-h-[420px] w-full bg-mist object-contain" />
        </a>
      )}
      {m.signs && m.signs.some((s) => s.found) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.signs.filter((s) => s.found).map((s) => (
            <span key={s.kind} className={`rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${s.kind === "qr" ? "bg-danger-soft text-danger" : "bg-[#e3f4ea] text-[#1a7f45] dark:bg-[#1a3326] dark:text-[#7fd6a3]"}`}>
              {s.label}
            </span>
          ))}
        </div>
      )}
      {m.facts.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14.5px]">
          {m.facts.slice(0, 8).map((f, i) => (
            <div key={i} className="contents">
              <dt className="flex items-start gap-1.5 text-ink-3">
                {m.image && (m.marked ?? []).includes(i) && (
                  <span className="mt-[1px] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent text-[11px] font-bold text-white">
                    {(m.marked ?? []).indexOf(i) + 1}
                  </span>
                )}
                {f.label}
              </dt>
              <dd className="font-semibold text-ink [overflow-wrap:anywhere]">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {m.deadlines.length > 0 && (
        <div className="mt-3 rounded-[14px] bg-accent-soft px-3 py-2">
          <p className="text-[12.5px] font-semibold text-accent">{READ.due[lang]}</p>
          {m.deadlines.map((d, i) => (
            <p key={i} className="text-[14.5px] text-ink">
              <b>{d.date}</b> · {d.what}
            </p>
          ))}
        </div>
      )}
      {risky && m.red_flags.length > 0 && (
        <div className="mt-3 rounded-[14px] bg-danger-soft px-3 py-2">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-danger">
            <Warning size={14} weight="bold" /> {READ.flags[lang]}
          </p>
          {m.red_flags.map((f, i) => (
            <p key={i} className="text-[14.5px] leading-snug text-ink">{f}</p>
          ))}
        </div>
      )}
      {m.next_steps.length > 0 && (
        <div className="mt-3">
          <p className="text-[12.5px] font-semibold text-ink-3">{READ.next[lang]}</p>
          <ol className="mt-1 flex flex-col gap-1">
            {m.next_steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[14.5px] leading-snug text-ink">
                <span className="font-semibold text-accent">{i + 1}.</span> {s}
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="mt-3 text-[11.5px] text-ink-3">
        Read by {m.read_by}
        {m.outlined_by ? ` · Marked by ${m.outlined_by}` : ""}
      </p>
    </div>
  );
}

/** Muse Image picture guide: the same woman in every picture, a short caption under each (also read aloud) */
export function PicturesCard({ m }: { m: Extract<Msg, { kind: "pictures" }> }) {
  return (
    <div className="rounded-[22px] bg-white p-3 shadow-[0_10px_30px_-20px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      {m.title && <p className="px-1 pb-2 text-[15px] font-semibold text-ink">{m.title}</p>}
      <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1">
        {m.panels.map((p, i) => (
          <figure key={i} className="w-[78%] max-w-[300px] shrink-0 snap-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption} loading="lazy" className="aspect-square w-full rounded-[16px] bg-mist object-cover" />
            <figcaption className="mt-1.5 flex gap-1.5 px-0.5 text-[14.5px] font-semibold leading-snug text-ink">
              <span className="text-accent">{i + 1}</span> {p.caption}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="px-1 pt-1 text-[11.5px] text-ink-3">Drawn by Muse Image</p>
    </div>
  );
}

export function TermsCard({ m }: { m: Extract<Msg, { kind: "terms" }> }) {
  const lang = useApp((s) => s.lang);
  const tone = m.verdict === "red" ? "text-danger" : m.verdict === "caution" ? "text-stop" : "text-ok";
  return (
    <div className="rounded-[22px] bg-white p-4 shadow-[0_10px_30px_-20px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      <div className="flex items-center gap-2">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-current ${tone}`}>
          {m.verdict === "ok" ? <SealCheck size={18} /> : <Warning size={18} />}
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-ink-3">{TERMS.title[lang]} · {m.site}</p>
          <p className={`text-[15px] font-semibold ${tone}`}>{TERMS[m.verdict][lang]}</p>
        </div>
      </div>
      <Rich text={m.summary} className="mt-2.5 text-[15px] leading-snug text-ink" />
      {m.points.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {m.points.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-[14.5px] leading-snug text-ink-2">
              <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${p.level === "red" ? "bg-danger" : "bg-stop"}`} />
              {p.text}
            </li>
          ))}
        </ul>
      )}
      {m.urls?.[0] && (
        <a href={m.urls[0]} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-accent hover:underline">
          {TERMS.read[lang]} <ArrowSquareOut size={13} />
        </a>
      )}
    </div>
  );
}

const REC: L = { en: "What Jagora did", pcm: "Wetin Jagora do", yo: "Ohun tí Jagora ṣe", ha: "Abin da Jagora ya yi", ig: "Ihe Jagora mere" };
const REC_STEPS: L = { en: "steps", pcm: "steps", yo: "ìgbésẹ̀", ha: "matakai", ig: "nzọụkwụ" };
const REC_SITES: L = {
  en: "Allowed to fill in forms on", pcm: "E fit fill form for", yo: "A gbà á láàyè láti kún fọ́ọ̀mù lórí", ha: "An bari ya cike fom a", ig: "Enyere ya ikike ijuchi fọm na",
};
const REC_READONLY: L = {
  en: "Every other site was read-only.", pcm: "Other sites na only to read.", yo: "Kíkà nìkan ni fún àwọn ojú-òpó yòókù.",
  ha: "Sauran shafuka karatu kawai.", ig: "Saịtị ndị ọzọ bụ maka ọgụgụ naanị.",
};
const REC_SAVE: L = { en: "Save record", pcm: "Save am", yo: "Fi pamọ́", ha: "Ajiye", ig: "Chekwaa" };
const REC_ICON: Record<string, string> = { opened: "↗", typed: "⌨", clicked: "●", private: "🔒", uploaded: "⇪", approved: "✓", declined: "✕", blocked: "⛔" };

/** "What Jagora did": the full, readable record of a task, so nothing it did is hidden from her */
export function RecordCard({ m }: { m: Extract<Msg, { kind: "record" }> }) {
  const lang = useApp((s) => s.lang);
  const [open, setOpen] = useState(false);
  const save = () => {
    const lines = [REC.en, "", ...(m.sites.length ? [`${REC_SITES.en}: ${m.sites.join(", ")}`, ""] : []), ...m.steps.map((x) => `${x.t}  ${x.kind}: ${x.text}`)];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    a.download = `jagora-record-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const blocked = m.steps.filter((x) => x.kind === "blocked").length;
  return (
    <div className="rounded-[22px] bg-white/80 p-4 shadow-[0_10px_30px_-20px_rgba(10,30,70,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="font-head text-[16px] text-ink">{REC[lang]}</span>
        <span className="flex items-center gap-2 text-[12.5px] tabular-nums text-ink-3">
          {blocked > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 font-semibold text-danger">⛔ {blocked}</span>}
          {m.steps.length} {REC_STEPS[lang]} <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </span>
      </button>
      {m.sites.length > 0 && (
        <p className="mt-2 text-[13px] leading-snug text-ink-2">
          {REC_SITES[lang]}: {m.sites.map((x) => <span key={x} className="mr-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent-deep">{x}</span>)}
          <span className="text-ink-3"> {REC_READONLY[lang]}</span>
        </p>
      )}
      {open && (
        <>
          <ol className="mt-3 flex max-h-[320px] flex-col gap-1.5 overflow-y-auto pr-1">
            {m.steps.map((x, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] leading-snug">
                <span className="w-[54px] shrink-0 pt-px text-[11.5px] tabular-nums text-ink-3">{x.t}</span>
                <span className={`w-4 shrink-0 text-center ${x.kind === "blocked" || x.kind === "declined" ? "text-danger" : x.kind === "approved" ? "text-ok" : "text-ink-3"}`}>{REC_ICON[x.kind] ?? "•"}</span>
                <span className="min-w-0 break-words text-ink-2">{x.text}</span>
              </li>
            ))}
          </ol>
          <button onClick={save} className="mt-3 flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-black/10 dark:bg-white/10">
            <DownloadSimple size={14} /> {REC_SAVE[lang]}
          </button>
        </>
      )}
    </div>
  );
}

/* ---- her payment record: what to pay, to whom, and where it stands. Saved on the server the moment it appears, so
   she can leave for her bank app and come back (even on another device) and still see exactly what she paid. ---- */
export const PAY: Record<"title" | "amount" | "to" | "account" | "bank" | "ref" | "copy" | "copied" | "paid" | "check" | "kept" | "payNow", Record<Lang, string>> = {
  title: { en: "Payment record", pcm: "Payment record", yo: "Àkọsílẹ̀ ìsanwó", ha: "Rikodin biya", ig: "Ndekọ ịkwụ ụgwọ" },
  amount: { en: "Amount", pcm: "Amount", yo: "Iye owó", ha: "Adadi", ig: "Ego ole" },
  to: { en: "Pay to", pcm: "Pay to", yo: "Sanwó fún", ha: "Biya zuwa", ig: "Kwụọ" },
  account: { en: "Account number", pcm: "Account number", yo: "Nọ́mbà àkáǹtì", ha: "Lambar asusu", ig: "Nọmba akaụntụ" },
  bank: { en: "Bank", pcm: "Bank", yo: "Báǹkì", ha: "Banki", ig: "Ụlọ akụ" },
  ref: { en: "Reference", pcm: "Reference", yo: "Nọ́mbà ìtọ́kasí", ha: "Lambar shaida", ig: "Nọmba ntụaka" },
  copy: { en: "Copy", pcm: "Copy", yo: "Dà á kọ", ha: "Kwafa", ig: "Detuo" },
  copied: { en: "Copied", pcm: "Don copy", yo: "Ó ti dà á", ha: "An kwafa", ig: "Edetuola" },
  paid: { en: "I have paid", pcm: "I don pay", yo: "Mo ti sanwó", ha: "Na biya", ig: "Akwụọla m" },
  check: { en: "Check this payment", pcm: "Check this payment", yo: "Ṣàyẹ̀wò ìsanwó yìí", ha: "Duba wannan biyan", ig: "Lelee ịkwụ ụgwọ a" },
  payNow: { en: "Pay", pcm: "Pay", yo: "San", ha: "Biya", ig: "Kwụọ" },
  kept: {
    en: "Kept safe in this chat. You can go to your bank app and come back; Jagora keeps the page open for you.",
    pcm: "E dey safe for this chat. You fit go your bank app come back; Jagora go keep the page open for you.",
    yo: "A ti pa á mọ́ sínú ìjíròrò yìí. Ẹ lè lọ sí áàpù báǹkì yín kí ẹ padà; Jagora á ṣí ojú ìwé náà sílẹ̀ fún yín.",
    ha: "An adana a wannan hira. Za ka iya zuwa manhajar bankinka ka dawo; Jagora za ta riƙe shafin a buɗe maka.",
    ig: "Echekwara ya na mkparịta ụka a. Ị nwere ike ịga ngwa ụlọ akụ gị wee laghachi; Jagora ga-edebe ibe ahụ meghere maka gị.",
  },
};
/* the steps on the checkout she opens in her own browser (Jagora cannot see that page, so they are written here) */
export const PAY_STEPS: Record<Lang, { title: string; steps: string[] }> = {
  en: {
    title: "How to pay",
    steps: [
      "Tap Pay. The payment page opens in your own browser.",
      "Choose Card or Transfer.",
      'Transfer: send the exact amount to the account it shows, from your bank app. The account name must be Paystack, Paystack-Titan or Flutterwave, never a person\'s name. Then tap "I\'ve sent the money".',
      "Card: type your card number, expiry date and CVV, then the OTP code your bank sends you.",
      'When it says successful, come back here and tap "I have paid". Jagora then checks it on the site.',
    ],
  },
  pcm: {
    title: "How to pay",
    steps: [
      "Tap Pay. The payment page go open for your own browser.",
      "Pick Card or Transfer.",
      'Transfer: send the exact amount go the account wey e show, from your bank app. The account name must be Paystack, Paystack-Titan or Flutterwave, no be person name. Then tap "I\'ve sent the money".',
      "Card: type your card number, expiry date and CVV, then the OTP wey your bank send you.",
      'When e talk say successful, come back here tap "I don pay". Jagora go check am for the site.',
    ],
  },
  yo: {
    title: "Bí ẹ ṣe máa sanwó",
    steps: [
      "Tẹ San. Ojú ìwé ìsanwó á ṣí nínú browser tiyín.",
      "Yan Káàdì tàbí Transfer.",
      'Transfer: fi iye owó gangan ránṣẹ́ sí àkáǹtì tó hàn, láti inú áàpù báǹkì yín. Orúkọ àkáǹtì gbọ́dọ̀ jẹ́ Paystack, Paystack-Titan tàbí Flutterwave, kì í ṣe orúkọ ènìyàn. Lẹ́yìn náà, tẹ "I\'ve sent the money".',
      "Káàdì: tẹ nọ́mbà káàdì, ọjọ́ tí yóò parí àti CVV, lẹ́yìn náà kóòdù OTP tí báǹkì yín fi ránṣẹ́.",
      'Tí ó bá sọ pé ó ti yọrí sí rere, ẹ padà síbí kí ẹ tẹ "Mo ti sanwó". Jagora á ṣàyẹ̀wò rẹ̀ lórí ojú òpó náà.',
    ],
  },
  ha: {
    title: "Yadda za ka biya",
    steps: [
      "Danna Biya. Shafin biyan kuɗi zai buɗe a burauzarka.",
      "Zaɓi Kati ko Transfer.",
      'Transfer: aika daidai adadin zuwa asusun da ya nuna, daga manhajar bankinka. Sunan asusun dole ya zama Paystack, Paystack-Titan ko Flutterwave, ba sunan mutum ba. Sannan danna "I\'ve sent the money".',
      "Kati: rubuta lambar katinka, ranar karewa da CVV, sannan lambar OTP da bankinka ya aiko maka.",
      'Idan ya ce an yi nasara, dawo nan ka danna "Na biya". Jagora za ta duba a shafin.',
    ],
  },
  ig: {
    title: "Otu esi akwụ ụgwọ",
    steps: [
      "Pịa Kwụọ. Peeji ịkwụ ụgwọ ga-emepe na ihe nchọgharị gị.",
      "Họrọ Kaadị ma ọ bụ Transfer.",
      'Transfer: ziga kpọmkwem ego ahụ na akaụntụ ọ gosiri, site na ngwa ụlọ akụ gị. Aha akaụntụ ga-abụ Paystack, Paystack-Titan ma ọ bụ Flutterwave, ọ bụghị aha mmadụ. Mgbe ahụ pịa "I\'ve sent the money".',
      "Kaadị: pịnye nọmba kaadị gị, ụbọchị ọ ga-agwụ na CVV, mgbe ahụ koodu OTP ụlọ akụ gị zitere gị.",
      'Mgbe ọ sịrị na ọ gara nke ọma, laghachi ebe a pịa "Akwụọla m". Jagora ga-elele ya na saịtị ahụ.',
    ],
  },
};

const PAY_STATUS: Record<Extract<Msg, { kind: "payment" }>["status"], Record<Lang, string>> = {
  waiting: { en: "Waiting for your payment", pcm: "E dey wait make you pay", yo: "Ń dúró de ìsanwó yín", ha: "Ana jiran biyanka", ig: "Na-eche ịkwụ ụgwọ gị" },
  paid_by_her: { en: "You said you paid, checking", pcm: "You talk say you don pay, I dey check", yo: "Ẹ ní ẹ ti sanwó, à ń ṣàyẹ̀wò", ha: "Ka ce ka biya, ana dubawa", ig: "Ị sịrị na ị kwụọla, a na-elele" },
  confirmed: { en: "Confirmed", pcm: "E don confirm", yo: "Ó ti dájú", ha: "An tabbatar", ig: "Ekwenyela" },
  failed: { en: "Not received", pcm: "E no enter", yo: "Kò wọlé", ha: "Ba a karɓa ba", ig: "Anataghị ya" },
};

export function PaymentCard({ m, task }: { m: Extract<Msg, { kind: "payment" }>; task: string }) {
  const lang = useApp((s) => s.lang);
  const [copied, setCopied] = useState(false);
  const open = m.status === "waiting" || m.status === "paid_by_her";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText((m.account ?? "").replace(/\s/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  const say = async (text: string) => (await import("@/lib/engine")).ask(text, undefined, { chat: task });
  const host = (() => {
    try {
      return m.site ? new URL(m.site).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  })();
  const tone = m.status === "confirmed" ? "bg-ok/15 text-ok" : m.status === "failed" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-deep";
  const row = (label: string, value?: string, extra?: React.ReactNode) =>
    value ? (
      <div className="flex items-center gap-3 py-1.5">
        <span className="w-[108px] shrink-0 text-[13px] font-medium text-ink-3">{label}</span>
        <span className="min-w-0 flex-1 break-words text-[15px] font-semibold text-ink">{value}</span>
        {extra}
      </div>
    ) : null;
  return (
    <div className="glass rounded-[22px] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15.5px] font-bold text-ink">{PAY.title[lang]}</span>
        <span className={`rounded-full px-2.5 py-1 text-[12.5px] font-bold ${tone}`}>{PAY_STATUS[m.status][lang]}</span>
      </div>
      <p className="mt-1.5 text-[14.5px] font-semibold leading-snug text-ink">{m.what}</p>
      <div className="mt-2 divide-y divide-black/5">
        {row(PAY.amount[lang], m.amount)}
        {row(PAY.to[lang], m.pay_to)}
        {row(
          PAY.account[lang],
          m.account,
          <button onClick={() => void copy()} className="btn btn-glass h-9 shrink-0 px-3 text-[13px] font-semibold">
            {copied ? PAY.copied[lang] : PAY.copy[lang]}
          </button>,
        )}
        {row(PAY.bank[lang], m.bank)}
        {row(PAY.ref[lang], m.reference)}
      </div>
      {m.note && <p className="mt-2 text-[13.5px] font-medium leading-snug text-ink-2">{m.note}</p>}
      <p className="mt-2 text-[12.5px] leading-snug text-ink-3">
        {host && <span className="font-semibold text-ink-2">{host} · </span>}
        {new Date(m.since < 1e12 ? m.since * 1000 : m.since).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
      </p>
      {open && <p className="mt-2 text-[13px] leading-snug text-ink-2">{PAY.kept[lang]}</p>}
      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.status === "waiting" && m.pay_url?.startsWith("https://") && (
            // the checkout opens in her own browser, where the site's human check passes
            <a href={m.pay_url} target="_blank" rel="noopener noreferrer" className="btn btn-ink h-12 w-full text-[15.5px] font-bold">
              {PAY.payNow[lang]}{m.amount ? ` ${m.amount}` : ""}
            </a>
          )}
          {m.status === "waiting" && (
            <button onClick={() => void say(PAY.paid[lang])} className={`btn ${m.pay_url ? "btn-glass" : "btn-ink"} h-11 flex-1 text-[15px] font-semibold`}>
              {PAY.paid[lang]}
            </button>
          )}
          <button
            onClick={() => void say(`${PAY.check[lang]}: ${m.what}${m.reference ? `, ${m.reference}` : ""}${host ? `, ${host}` : ""}`)}
            className="btn btn-glass h-11 flex-1 text-[14.5px] font-semibold"
          >
            {PAY.check[lang]}
          </button>
        </div>
      )}
      {m.status === "waiting" && m.pay_url?.startsWith("https://") && (
        <div className="mt-3 rounded-[16px] bg-white/45 p-3 dark:bg-white/5">
          <p className="text-[14px] font-bold text-ink">{PAY_STEPS[lang].title}</p>
          <ol className="mt-1.5 space-y-1.5">
            {PAY_STEPS[lang].steps.map((t, i) => (
              <li key={i} className="flex gap-2 text-[13.5px] font-medium leading-snug text-ink-2">
                <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11.5px] font-bold text-paper">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}


/* ---- Jagora's video picks: the best few for what she asked, each with why, and where learners recommend it ---- */
const PICK: Record<"watch" | "previewAll" | "why" | "recommended", Record<Lang, string>> = {
  watch: { en: "Watch", pcm: "Watch", yo: "Wò ó", ha: "Kalla", ig: "Kiri" },
  previewAll: { en: "Preview all", pcm: "Preview all", yo: "Wo gbogbo rẹ̀ díẹ̀díẹ̀", ha: "Duba duka", ig: "Lelee ha niile" },
  why: { en: "Why this one", pcm: "Why this one", yo: "Ìdí tí mo fi yàn án", ha: "Dalilin zaɓa", ig: "Ihe mere m ji họrọ ya" },
  recommended: { en: "Learners recommend it on", pcm: "People recommend am for", yo: "Àwọn akẹ́kọ̀ọ́ dábàá rẹ̀ lórí", ha: "Ɗalibai sun ba da shawararsa a", ig: "Ndị mmụta na-atụ aro ya na" },
};

export function PicksCard({ m }: { m: Extract<Msg, { kind: "picks" }> }) {
  const lang = useApp((s) => s.lang);
  const play = (i: number, preview = false) => {
    const p = m.picks[i];
    const queue = m.picks.map((x) => ({ name: x.name, url: x.url, type: "youtube", source: x.source }));
    useApp.getState().setPlaying({
      id: `pick-${Date.now()}`, kind: "media", name: p.name, url: p.url, type: "youtube", size: 0, source: p.source,
      ...(preview ? { queue, preview: 8 } : {}),
    } as Extract<Msg, { kind: "media" }>);
  };
  return (
    <div className="glass rounded-[22px] p-4">
      <p className="text-[15.5px] font-bold leading-snug text-ink">{m.intro}</p>
      <ol className="mt-3 space-y-3">
        {m.picks.map((p, i) => (
          <li key={p.url} className="rounded-[18px] bg-white/70 p-3 dark:bg-white/5">
            <div className="flex gap-3">
              {p.image ? (
                <img src={p.image} alt="" className="h-[64px] w-[112px] shrink-0 rounded-[10px] object-cover" loading="lazy" />
              ) : (
                <span className="grid h-[64px] w-[112px] shrink-0 place-items-center rounded-[10px] bg-ink text-[22px] font-bold text-paper">{i + 1}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-ink">{i + 1}. {p.name}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{[p.channel, p.duration, p.views && `${p.views} views`, p.date].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
            {p.why && (
              <p className="mt-2 text-[13.5px] leading-snug text-ink-2">
                <span className="font-semibold text-ink">{PICK.why[lang]}: </span>
                {p.why}
              </p>
            )}
            {!!p.evidence?.length && (
              <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">
                {PICK.recommended[lang]}{" "}
                {p.evidence.map((e, j) => (
                  <a key={e.url + j} href={e.url} target="_blank" rel="noreferrer" title={e.title} className="mr-1.5 inline-block rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent-deep">
                    {e.site}
                  </a>
                ))}
              </p>
            )}
            <button onClick={() => play(i)} className="btn btn-ink mt-2.5 h-10 px-5 text-[14px] font-semibold">
              {PICK.watch[lang]}
            </button>
          </li>
        ))}
      </ol>
      {m.picks.length > 1 && (
        <button onClick={() => play(0, true)} className="btn btn-glass mt-3 h-10 w-full text-[14px] font-semibold">
          {PICK.previewAll[lang]}
        </button>
      )}
    </div>
  );
}
