"use client";

import { CheckCircle, CircleNotch, Eye, EyeSlash, Hand, PencilSimpleLine, Image as ImageIcon, LinkSimple, Paperclip, ShieldCheck, WarningOctagon, XCircle } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { answer, giveForm, giveSecret, live } from "@/lib/engine";
import { celebrate } from "./Effects";
import { DocCard } from "./DocView";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { PLAIN_FIELDS, useApp, type FormField, type Msg, type Task } from "@/lib/store";
import { IconLock, IconScam, IconShield } from "./icons";
import { Evidence, FileCard, PaymentCard, PicksCard, MediaCard, MomentCard, PicturesCard, PlanCard, PointAskCard, ReadingCard, RecordCard, ReminderCard, ScheduledCard, TermsCard, VoiceBubble } from "./ChatCards";
import { remotePictures } from "@/lib/engine/remote";
import { Rich } from "./Rich";

const IN_PICTURES: Record<Lang, string> = { en: "Show me in pictures", pcm: "Show me for picture", yo: "Fi hàn mí ní àwòrán", ha: "Nuna mini a hotuna", ig: "Gosi m na foto" };

const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } };

export function Conversation({ task }: { task: Task }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [task.messages.length, task.messages.at(-1)]);
  return (
    <div className="flex flex-col gap-2.5 px-3 pb-4 pt-3 sm:gap-3 sm:px-4 sm:pt-4">
      {task.messages.map((m, i) => (
        <motion.div key={m.id} {...enter}>
          <SafeItem id={m.id}>
            <Item m={m} task={task} />
          </SafeItem>
          {live && m.kind === "agent" && m.text.length > 90 && task.status !== "working" && i === lastAgent(task) && (
            <PicturesButton task={task} text={m.text} />
          )}
        </motion.div>
      ))}
      <ContinueWatching task={task} />
      <div ref={end} />
    </div>
  );
}

const CONTINUE: Record<Lang, string> = { en: "Continue watching", pcm: "Continue dey watch", yo: "Máa wò ó lọ", ha: "Ci gaba da kallo", ig: "Gaa n'ihu na-ekiri" };
const clock = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;

/** a video she paused to watch later in this chat: one tap plays it on from where she stopped */
function ContinueWatching({ task }: { task: Task }) {
  const r = useApp((s) => s.resume?.[task.id]);
  const playing = useApp((s) => !!s.playing);
  const lang = useApp((s) => s.lang);
  if (!r || playing) return null;
  const go = () => {
    const s = useApp.getState();
    s.setStartAt(Math.max(0, r.at - 3));
    s.setPlaying({ id: `resume-${Date.now()}`, kind: "media", name: r.name, url: r.url, type: r.type, size: 0, source: r.source });
  };
  const pct = r.length ? Math.min(100, Math.round((r.at / r.length) * 100)) : 0;
  return (
    <motion.div {...enter} className="flex items-center gap-2">
      <button onClick={go} className="glass min-w-0 flex-1 rounded-[18px] px-4 py-3 text-left transition active:scale-[.99]">
        <span className="block text-[14px] font-bold text-ink">{CONTINUE[lang]} · {clock(r.at)}{r.length ? ` / ${clock(r.length)}` : ""}</span>
        <span className="mt-0.5 block truncate text-[13px] font-semibold text-ink-2">{r.name}</span>
        {pct > 0 && (
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-ink/10">
            <span className="block h-full rounded-full bg-ink/70" style={{ width: `${pct}%` }} />
          </span>
        )}
      </button>
      <button onClick={() => useApp.getState().setResume(task.id, null)} aria-label="Remove" className="glass grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink/70">
        <XCircle size={18} weight="bold" />
      </button>
    </motion.div>
  );
}

/** One message that cannot be shown (bad data) must never take the whole app down: it shows a short line instead,
    and the rest of the chat works. */
class SafeItem extends Component<{ id: string; children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  componentDidCatch(e: unknown) {
    console.warn("message could not be shown", this.props.id, e);
  }
  render() {
    if (this.state.broken)
      return <p className="rounded-[16px] bg-black/5 px-3 py-2 text-[13px] text-ink-3">This message could not be shown.</p>;
    return this.props.children;
  }
}

const lastAgent = (task: Task) => task.messages.map((x) => x.kind).lastIndexOf("agent");

/** Muse Image: her answer as a few pictures, for when reading is hard */
function PicturesButton({ task, text }: { task: Task; text: string }) {
  const lang = useApp((s) => s.lang);
  const [asked, setAsked] = useState(false);
  if (task.messages.some((x) => x.kind === "pictures")) return null;
  return (
    <button
      disabled={asked}
      onClick={() => {
        setAsked(true);
        void remotePictures(task.id, text);
      }}
      className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/15 px-3.5 text-[13.5px] font-semibold text-ink transition hover:bg-black/5 disabled:opacity-50"
    >
      {asked ? <CircleNotch size={15} className="animate-spin" /> : <ImageIcon size={15} />} {IN_PICTURES[lang]}
    </button>
  );
}

function Item({ m, task }: { m: Msg; task: Task }) {
  switch (m.kind) {
    case "user":
      if (m.voice) return <VoiceBubble m={m} />;
      return (
        <div className="flex justify-end pl-8 sm:pl-10">
          <div className="min-w-0 max-w-full rounded-[20px] rounded-br-[6px] bg-ink px-3.5 py-2 text-[15px] leading-snug text-paper sm:px-4 sm:py-2.5 sm:text-[15.5px]">
            {m.attachment && (
              <div className="mb-1 flex items-center gap-1.5 text-[13px] text-paper/75">
                {m.attachment.kind === "image" ? <ImageIcon size={14} /> : m.attachment.kind === "link" ? <LinkSimple size={14} /> : <Paperclip size={14} />}
                <span className="truncate">{m.attachment.name === "sample" ? "Sample letter" : m.attachment.name}</span>
              </div>
            )}
            {/* a photo she sent shows as the photo; its file name is never repeated as her message */}
            {m.attachment?.kind === "image" && m.attachment.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.attachment.url} alt="" className="mb-1.5 mt-1 max-h-56 w-auto rounded-[14px]" />
            )}
            {m.text && m.text !== m.attachment?.name && <Rich text={m.text} tone="dark" />}
          </div>
        </div>
      );
    case "agent":
      return <Rich text={m.text} className="pr-1 text-[15.5px] leading-[1.5] text-ink sm:pr-6 sm:text-[17px]" />;
    case "step":
      return (
        <div className="flex items-center gap-2 text-[13.5px] text-ink-3">
          {m.status === "doing" ? (
            <CircleNotch size={15} className="animate-spin text-accent" />
          ) : m.status === "done" ? (
            <CheckCircle size={15} weight="fill" className="text-ok" />
          ) : (
            <XCircle size={15} weight="fill" className="text-danger" />
          )}
          {m.guard ? <ShieldCheck size={14} weight="fill" className="-ml-1 shrink-0 text-accent" /> : null}
          <span className="truncate">{m.text}</span>
        </div>
      );
    case "confirm":
      return <Confirm m={m} task={task} />;
    case "choice":
      return <Choice m={m} task={task} />;
    case "handoff":
      return <Handoff m={m} task={task} />;
    case "secret":
      return <SecretAsk m={m} task={task} />;
    case "form":
      return <FormAsk m={m} task={task} />;
    case "payment":
      return <PaymentCard m={m} task={task.id} />;
    case "picks":
      return <PicksCard m={m} />;
    case "verdict":
      return <Verdict m={m} />;
    case "explain":
      return <Explain m={m} />;
    case "result":
      return <Result m={m} />;
    case "doc":
      return <DocCard d={m.doc} />;
    case "evidence":
      return <Evidence m={m} />;
    case "file":
      return <FileCard m={m} />;
    case "plan":
      return <PlanCard m={m} />;
    case "reminder":
      return <ReminderCard m={m} />;
    case "moment":
      return <MomentCard m={m} />;
    case "media":
      return <MediaCard m={m} />;
    case "scheduled":
      return <ScheduledCard m={m} />;
    case "pointask":
      return <PointAskCard m={m} />;
    case "terms":
      return <TermsCard m={m} />;
    case "reading":
      return <ReadingCard m={m} />;
    case "pictures":
      return <PicturesCard m={m} />;
    case "record":
      return <RecordCard m={m} />;
  }
}

function Confirm({ m, task }: { m: Extract<Msg, { kind: "confirm" }>; task: Task }) {
  const lang = useApp((s) => s.lang);
  const waiting = m.status === "waiting";
  return (
    <div className={`rounded-[24px] p-4 ${waiting ? "glass-3 ring-1 ring-accent/30" : "glass"}`}>
      {waiting && (
        <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-accent">
          <Hand size={14} weight="fill" /> {lang === "yo" ? "Mo ń dúró de yín" : lang === "pcm" ? "I dey wait for you" : lang === "ha" ? "Ina jiran ka" : lang === "ig" ? "Ana m eche gị" : "Waiting for you"}
        </div>
      )}
      <Rich text={m.question} className="text-[16.5px] font-medium leading-snug text-ink" />
      {m.value && <p className="mt-2 font-display text-[30px] font-semibold tracking-[-0.02em] text-ink">{m.value}</p>}
      {m.detail && !m.value && <p className="mt-1 text-[13px] text-ink-3">{m.detail}</p>}
      {waiting ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="btn btn-ink h-12 text-[16px]" onClick={() => answer(task.id, m.id, "yes")}>
            {t("yes", lang)}
          </button>
          <button className="btn btn-glass h-12 text-[16px]" onClick={() => answer(task.id, m.id, "no")}>
            {t("no", lang)}
          </button>
        </div>
      ) : (
        <p className={`mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-medium ${m.status === "yes" ? "text-ok" : "text-ink-3"}`}>
          {m.status === "yes" ? <CheckCircle size={15} weight="fill" /> : <XCircle size={15} weight="fill" />}
          {m.status === "yes" ? t("yes", lang) : t("no", lang)}
        </p>
      )}
    </div>
  );
}

const ANSWERED: Record<string, string> = { en: "Answered", pcm: "You don answer", yo: "Ẹ ti dáhùn", ha: "An amsa", ig: "Ị zaala" };

function Choice({ m, task }: { m: Extract<Msg, { kind: "choice" }>; task: Task }) {
  if (!m.choices.length)
    return (
      <div className="glass-3 rounded-[22px] p-4">
        <Rich text={m.question} className="text-[16.5px] font-medium text-ink" />
        {/* her answer is in the chat (a spoken one as a voice bubble): never printed here as the recogniser heard it */}
        {m.picked ? <p className="mt-1 text-[14px] font-medium text-ink-3">{ANSWERED[useApp.getState().lang] ?? ANSWERED.en}</p> : <p className="mt-1 text-[13px] text-ink-3">Type or speak your answer below.</p>}
      </div>
    );
  return (
    <div className="glass-2 rounded-[24px] p-4">
      <Rich text={m.question} className="text-[16.5px] font-medium text-ink" />
      <div className="mt-3 flex flex-wrap gap-2">
        {m.choices.map((c) => (
          <button
            key={c}
            disabled={!!m.picked}
            onClick={() => answer(task.id, m.id, c)}
            className={`btn h-10 px-4 text-[14.5px] ${m.picked === c ? "btn-ink" : m.picked ? "btn-glass opacity-45" : "btn-glass"}`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

function Handoff({ m, task }: { m: Extract<Msg, { kind: "handoff" }>; task: Task }) {
  const lang = useApp((s) => s.lang);
  return (
    <div className="glass-3 flex gap-3 rounded-[22px] p-4">
      <IconLock size={40} className="shrink-0" />
      <div className="min-w-0">
        <Rich text={m.text} className="text-[15.5px] font-medium leading-snug text-ink" />
        {m.status === "waiting" ? (
          <button className="btn btn-ink mt-3 h-10 px-5 text-[14.5px]" onClick={() => answer(task.id, m.id, "done")}>
            {t("done", lang)}
          </button>
        ) : (
          <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-ok">
            <CheckCircle size={14} weight="fill" /> {t("done", lang)}
          </p>
        )}
      </div>
    </div>
  );
}

const TYPE_WHY: Record<Lang, string> = {
  en: "Type it exactly as it should appear. Jagora puts it in the form for you.",
  pcm: "Type am exactly as e suppose show. Jagora go put am for the form for you.",
  yo: "Ẹ tẹ̀ ẹ́ gẹ́gẹ́ bí ó ṣe yẹ kí ó hàn. Jagora yóò fi sínú fọ́ọ̀mù fún yín.",
  ha: "Ka rubuta shi daidai yadda ya kamata ya bayyana. Jagora zai saka shi a fom ɗin maka.",
  ig: "Dee ya kpọmkwem otu o kwesịrị ịpụta. Jagora ga-etinye ya na fọm ahụ maka gị.",
};

const SECRET: Record<"why" | "fill" | "skip" | "filled" | "skipped" | "keep" | "keepWhy", Record<Lang, string>> = {
  keep: {
    en: "Save it for {site}, so Jagora can sign in for me next time",
    pcm: "Save am for {site}, make Jagora fit sign in for me next time",
    yo: "Fi pamọ́ fún {site}, kí Jagora lè wọlé fún mi nígbà míì",
    ha: "Adana shi don {site}, don Jagora ta iya shiga mini a gaba",
    ig: "Chekwaa ya maka {site}, ka Jagora nwee ike ịbanye maka m ọzọ",
  },
  keepWhy: {
    en: "Locked with encryption on Jagora's server and only ever typed on this one site.",
    pcm: "E go dey locked for Jagora server, and na only this site e go ever type am.",
    yo: "A tì í pa pẹ̀lú ìfipamọ́ lórí Jagora, a ò sì ní tẹ̀ ẹ́ sí ibòmíì ju ojú-òpó yìí lọ.",
    ha: "An kulle shi a sabar Jagora, kuma ana rubuta shi a wannan shafin kawai.",
    ig: "Ekpochiri ya na sava Jagora, a ga-apịnye ya naanị na saịtị a.",
  },
  why: {
    en: "Only you see this. Jagora types it straight into the website and never says it aloud.",
    pcm: "Na only you dey see am. Jagora go type am enter the website, e no go talk am out.",
    yo: "Ẹ̀yin nìkan ló ń rí èyí. Jagora á tẹ̀ ẹ́ sínú ojú òpó náà tààrà, kò ní pè é jáde.",
    ha: "Kai kaɗai kake ganin wannan. Jagora za ta rubuta shi kai tsaye a shafin, ba za ta faɗe shi ba.",
    ig: "Naanị gị na-ahụ nke a. Jagora ga-apịnye ya ozugbo na weebụsaịtị ahụ, ọ gaghị ekwupụta ya.",
  },
  fill: { en: "Fill it in", pcm: "Fill am", yo: "Kọ ọ́ sí i", ha: "Cike shi", ig: "Jupụta ya" },
  skip: { en: "Skip", pcm: "Skip", yo: "Fò ó", ha: "Tsallake", ig: "Gafere" },
  filled: { en: "Filled in", pcm: "E don enter", yo: "Ó ti wọlé", ha: "An cike", ig: "Ejupụtala ya" },
  skipped: { en: "Skipped", pcm: "Skipped", yo: "A fò ó", ha: "An tsallake", ig: "Agafere ya" },
};
const NUMERIC = new Set(["account", "nin", "bvn", "otp", "pin", "phone", "card"]);
const SAVE_MINE: Record<Lang, string> = {
  en: "Save to my details for next time",
  pcm: "Save am for my details for next time",
  yo: "Fi pamọ́ sí àlàyé mi fún ìgbà míì",
  ha: "Adana a bayanaina don gaba",
  ig: "Chekwaa ya na nkọwa m maka ọzọ",
};
const FORM: Record<"why" | "send" | "saveAll", Record<Lang, string>> = {
  why: {
    en: "Fill these here. Jagora puts each one into the website for you; private ones are never shown or said aloud.",
    pcm: "Fill dem for here. Jagora go put each one for the website; the private ones nobody go see or hear am.",
    yo: "Ẹ kọ wọ́n síbí. Jagora á fi ọ̀kọ̀ọ̀kan sínú ojú òpó náà; a ò ní fi àwọn àṣírí hàn tàbí pè wọ́n jáde.",
    ha: "Cike su a nan. Jagora za ta saka kowanne a shafin; na sirri ba za a nuna ko a faɗe su ba.",
    ig: "Dejupụta ha ebe a. Jagora ga-etinye nke ọ bụla na weebụsaịtị; a gaghị egosi ma ọ bụ kwupụta nke nzuzo.",
  },
  send: { en: "Fill them in", pcm: "Fill dem", yo: "Kọ wọ́n sí i", ha: "Cike su", ig: "Jupụta ha" },
  saveAll: {
    en: "Save these for next time (my name, phone, email and address to my details; the rest locked for this site only)",
    pcm: "Save dem for next time (my name, phone, email and address for my details; the rest locked for this site only)",
    yo: "Fi wọ́n pamọ́ fún ìgbà míì (orúkọ, fóònù, ímeèlì àti àdírẹ́sì mi sí àlàyé mi; ìyókù tìpa fún ojú òpó yìí nìkan)",
    ha: "Adana su don gaba (sunana, waya, imel da adireshi a bayanaina; sauran a kulle don wannan shafin kawai)",
    ig: "Chekwaa ha maka ọzọ (aha m, ekwentị, email na adreesị na nkọwa m; ndị ọzọ ekpochiri maka saịtị a naanị)",
  },
};

/** A private field: she types it here (never aloud), Jagora puts it into the website. */
function SecretAsk({ m, task }: { m: Extract<Msg, { kind: "secret" }>; task: Task }) {
  const lang = useApp((s) => s.lang);
  const saved = useApp((s) => (m.profile_field ? String(s.profile[m.profile_field] ?? "") : ""));
  const [v, setV] = useState(saved); // her saved detail is there already: one tap to use it
  const [see, setSee] = useState(false);
  const [keep, setKeep] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const waiting = m.status === "waiting";
  const site = task.url ? task.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : "";
  // one-time codes change every time: nothing to save
  // names, emails and addresses: she types them herself so they are spelled exactly; not private, so shown as typed
  const plain = PLAIN_FIELDS.has(m.field);
  const canKeep = live && !!site && m.field !== "otp" && !plain;
  const canSaveMine = plain && !!m.profile_field; // her name, phone, email, address: into her details
  const isLast = task.messages.at(-1)?.id === m.id;
  useEffect(() => {
    if (waiting && isLast) {
      const id = setTimeout(() => box.current?.focus({ preventScroll: true }), 350);
      return () => clearTimeout(id);
    }
  }, [waiting, isLast]);
  const numeric = NUMERIC.has(m.field);
  const clean = numeric ? v.replace(/\D/g, "") : v;
  const ok = m.digits ? clean.length === m.digits : clean.trim().length > 0;
  const send = () => {
    if (!ok) return;
    giveSecret(task.id, m.id, clean, keep && (canKeep || canSaveMine));
    setV("");
  };

  if (!waiting)
    return (
      <div className="glass-3 flex items-center gap-3 rounded-[20px] px-4 py-3">
        {plain ? <PencilSimpleLine size={24} className="shrink-0 text-accent" /> : <IconLock size={28} className="shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink-2">{m.label}</span>
        <span className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium ${m.status === "done" ? "text-ok" : "text-ink-3"}`}>
          {m.status === "done" && <CheckCircle size={14} weight="fill" />}
          {m.status === "done" ? `${SECRET.filled[lang]} ${m.shown ?? ""}` : SECRET.skipped[lang]}
        </span>
      </div>
    );

  return (
    <form onSubmit={(e) => (e.preventDefault(), send())} className="glass-3 rounded-[22px] p-4 ring-2 ring-accent/35">
      <div className="flex gap-3">
        {plain ? <PencilSimpleLine size={30} className="mt-1 shrink-0 text-accent" /> : <IconLock size={40} className="shrink-0" />}
        <div className="min-w-0">
          <p className="text-[15.5px] font-semibold leading-snug text-ink">{m.label}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{plain ? TYPE_WHY[lang] : SECRET.why[lang]}</p>
        </div>
      </div>
      <div className="mt-3 flex h-12 items-center gap-2 rounded-[16px] bg-white px-4 shadow-[inset_0_0_0_1.5px_rgba(29,99,237,.35)]">
        <input
          ref={box}
          value={v}
          onChange={(e) => setV(m.digits ? e.target.value.replace(/\D/g, "").slice(0, m.digits) : e.target.value)}
          type={m.field === "date" ? "date" : plain ? (m.field === "email" ? "email" : "text") : see ? "text" : "password"}
          inputMode={numeric ? "numeric" : m.field === "email" ? "email" : "text"}
          autoComplete={m.field === "otp" ? "one-time-code" : m.field === "name" ? "name" : m.field === "email" ? "email" : m.field === "address" ? "street-address" : "off"}
          autoCapitalize={m.field === "name" || m.field === "address" ? "words" : "off"}
          autoCorrect="off"
          spellCheck={false}
          aria-label={m.label}
          className={`h-full min-w-0 flex-1 bg-transparent text-[18px] font-semibold ${plain ? "" : "tracking-[0.18em]"} focus-visible:outline-none text-ink outline-none placeholder:tracking-normal placeholder:font-normal placeholder:text-ink-3`}
          placeholder={m.digits ? "•".repeat(Math.min(m.digits, 11)) : ""}
        />
        {m.digits && <span className="shrink-0 text-[12.5px] font-medium tabular-nums text-ink-3">{clean.length}/{m.digits}</span>}
        {!plain && <button type="button" onClick={() => setSee((x) => !x)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-black/5" aria-label={see ? "Hide" : "Show"}>
          {see ? <EyeSlash size={17} /> : <Eye size={17} />}
        </button>}
      </div>
      {canSaveMine && (
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-ink-2">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
          {SAVE_MINE[lang]}
        </label>
      )}
      {canKeep && (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-snug text-ink-2">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
          <span>
            {SECRET.keep[lang].replace("{site}", site)}
            <span className="block text-[12px] text-ink-3">{SECRET.keepWhy[lang]}</span>
          </span>
        </label>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={!ok} className="btn btn-ink h-11 flex-1 text-[15px] disabled:opacity-40">
          {SECRET.fill[lang]}
        </button>
        <button type="button" onClick={() => giveSecret(task.id, m.id, null)} className="btn btn-glass h-11 px-5 text-[14.5px]">
          {SECRET.skip[lang]}
        </button>
      </div>
    </form>
  );
}

/** Several boxes in one card (a booking's passenger details): she fills them here instead of on the live page. */
function FormAsk({ m, task }: { m: Extract<Msg, { kind: "form" }>; task: Task }) {
  const lang = useApp((s) => s.lang);
  const profile = useApp((s) => s.profile);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(m.fields.map((f) => [f.key, f.profile_field ? String(profile[f.profile_field] ?? "") : ""])),
  );
  const [see, setSee] = useState(false);
  const [keep, setKeep] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const waiting = m.status === "waiting";
  const isLast = task.messages.at(-1)?.id === m.id;
  useEffect(() => {
    if (waiting && isLast) {
      const id = setTimeout(() => first.current?.focus({ preventScroll: true }), 350);
      return () => clearTimeout(id);
    }
  }, [waiting, isLast]);
  const clean = (f: FormField, v: string) => (NUMERIC.has(f.field) ? v.replace(/\D/g, "") : v);
  const okOne = (f: FormField) => {
    const c = clean(f, vals[f.key] ?? "");
    return f.digits ? c.length === f.digits : c.trim().length > 0;
  };
  const ok = m.fields.every(okOne);
  const canSave = m.fields.some((f) => (f.profile_field && PLAIN_FIELDS.has(f.field)) || !["otp", "pin", "card", "password"].includes(f.field));
  const anySecret = m.fields.some((f) => !PLAIN_FIELDS.has(f.field));
  const send = () => ok && giveForm(task.id, m.id, Object.fromEntries(m.fields.map((f) => [f.key, clean(f, vals[f.key] ?? "")])), keep);

  if (!waiting)
    return (
      <div className="glass-3 rounded-[20px] px-4 py-3">
        <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
          <PencilSimpleLine size={20} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate">{m.title}</span>
          <span className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium ${m.status === "done" ? "text-ok" : "text-ink-3"}`}>
            {m.status === "done" && <CheckCircle size={14} weight="fill" />}
            {m.status === "done" ? SECRET.filled[lang] : SECRET.skipped[lang]}
          </span>
        </p>
        {m.status === "done" && m.shown && (
          <ul className="mt-2 space-y-0.5 text-[13.5px] text-ink-2">
            {m.fields.map((f, i) => (
              <li key={f.key} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate">{f.label}</span>
                <span className="shrink-0 font-semibold text-ink">{m.shown?.[i] || "-"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  return (
    <form onSubmit={(e) => (e.preventDefault(), send())} className="glass-3 rounded-[22px] p-4 ring-2 ring-accent/35">
      <div className="flex gap-3">
        <PencilSimpleLine size={30} className="mt-1 shrink-0 text-accent" />
        <div className="min-w-0">
          <p className="text-[15.5px] font-semibold leading-snug text-ink">{m.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{FORM.why[lang]}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        {m.fields.map((f, i) => {
          const plain = PLAIN_FIELDS.has(f.field);
          const numeric = NUMERIC.has(f.field);
          const v = vals[f.key] ?? "";
          return (
            <label key={f.key} className="block">
              <span className="mb-1 block text-[13.5px] font-semibold text-ink">{f.label}</span>
              <span className="flex h-12 items-center gap-2 rounded-[16px] bg-white px-4 shadow-[inset_0_0_0_1.5px_rgba(29,99,237,.35)]">
                <input
                  ref={i === 0 ? first : undefined}
                  value={v}
                  onChange={(e) => setVals((x) => ({ ...x, [f.key]: f.digits ? e.target.value.replace(/\D/g, "").slice(0, f.digits) : e.target.value }))}
                  type={f.field === "date" ? "date" : plain ? (f.field === "email" ? "email" : f.field === "phone" ? "tel" : "text") : see ? "text" : "password"}
                  inputMode={numeric ? "numeric" : f.field === "email" ? "email" : "text"}
                  autoComplete={f.field === "otp" ? "one-time-code" : f.field === "name" ? "name" : f.field === "email" ? "email" : f.field === "phone" ? "tel" : f.field === "address" ? "street-address" : "off"}
                  autoCapitalize={f.field === "name" || f.field === "address" ? "words" : "off"}
                  autoCorrect="off"
                  spellCheck={false}
                  className={`h-full min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-ink outline-none ${plain ? "" : "tracking-[0.14em]"}`}
                />
                {f.digits && <span className="shrink-0 text-[12.5px] font-medium tabular-nums text-ink-3">{clean(f, v).length}/{f.digits}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {anySecret && (
        <button type="button" onClick={() => setSee((x) => !x)} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
          {see ? <EyeSlash size={16} /> : <Eye size={16} />} {see ? "Hide" : "Show"}
        </button>
      )}
      {canSave && (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-snug text-ink-2">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]" />
          <span>{FORM.saveAll[lang]}</span>
        </label>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button type="submit" disabled={!ok} className="btn btn-ink h-11 flex-1 text-[15px] disabled:opacity-40">
          {FORM.send[lang]}
        </button>
        <button type="button" onClick={() => giveForm(task.id, m.id, null)} className="btn btn-glass h-11 px-5 text-[14.5px]">
          {SECRET.skip[lang]}
        </button>
      </div>
    </form>
  );
}

function Verdict({ m }: { m: Extract<Msg, { kind: "verdict" }> }) {
  const tone = m.verdict === "scam" ? "bg-danger-soft/80 ring-danger/20" : m.verdict === "safe" ? "bg-[#e3f4ec]/85 dark:bg-[#1f3a2c]/85 ring-ok/20" : "bg-stop-soft/85 ring-stop/20";
  return (
    <div className={`rounded-[24px] p-4 ring-1 backdrop-blur-xl ${tone}`}>
      <div className="flex items-center gap-3">
        {m.verdict === "scam" ? <IconScam size={46} /> : m.verdict === "safe" ? <IconShield size={46} tone="green" /> : <IconShield size={46} tone="amber" />}
        <div>
          <p className="font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{m.title}</p>
          {m.link && (
            <p className={`mt-0.5 max-w-[240px] truncate text-[13px] ${m.verdict === "scam" ? "text-danger line-through decoration-1" : "text-ink-3"}`}>
              {m.link.replace(/^https?:\/\//, "")}
            </p>
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {m.reasons.map((r) => (
          <li key={r} className="flex gap-2 text-[14px] leading-snug text-ink-2">
            {m.verdict === "scam" ? <WarningOctagon size={16} weight="fill" className="mt-0.5 shrink-0 text-danger" /> : <ShieldCheck size={16} weight="fill" className="mt-0.5 shrink-0 text-ok" />}
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Explain({ m }: { m: Extract<Msg, { kind: "explain" }> }) {
  const [on, setOn] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setOn((v) => (v + 1) % m.sections.length), 4200);
    return () => clearInterval(id);
  }, [m.sections.length]);
  const b = m.sections[on]?.box;
  return (
    <div className="glass-3 overflow-hidden rounded-[24px]">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.image} alt="The letter" className="block w-full" />
        <div className="absolute inset-0 bg-ink/25" />
        {b && (
          <motion.div
            className="absolute rounded-[8px] bg-white/0"
            animate={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            style={{ boxShadow: "0 0 0 2px #fff, 0 0 0 9999px rgba(60,38,16,.28)", backdropFilter: "brightness(1.25)" }}
          />
        )}
      </div>
      <div className="space-y-1 p-3">
        {m.sections.map((s, i) => (
          <button
            key={s.label}
            onClick={() => setOn(i)}
            className={`block w-full rounded-[14px] px-3 py-2 text-left transition ${i === on ? "bg-white" : "hover:bg-white/50"}`}
          >
            <span className="text-[12.5px] font-medium text-accent">{s.label}</span>
            <span className="block text-[14.5px] leading-snug text-ink">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const celebrated = new Set<string>();
function Result({ m }: { m: Extract<Msg, { kind: "result" }> }) {
  useEffect(() => {
    // once per result, and only for ones that just arrived (not when reopening an old task)
    if (celebrated.has(m.id)) return;
    celebrated.add(m.id);
    if (performance.now() > 3000) celebrate();
  }, [m.id]);
  return (
    <div className="glass-3 rounded-[24px] p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium text-ok">
        <CheckCircle size={16} weight="fill" /> {m.title}
      </div>
      {m.reference && <p className="mt-2 font-display text-[28px] font-semibold tracking-[-0.01em] text-ink">{m.reference}</p>}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
        {m.lines.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className="truncate text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
