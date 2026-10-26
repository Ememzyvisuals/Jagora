"use client";

import { CheckCircle, CircleNotch, Hand, Image as ImageIcon, LinkSimple, Paperclip, ShieldCheck, WarningOctagon, XCircle } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { answer } from "@/lib/engine";
import { t } from "@/lib/i18n";
import { useApp, type Msg, type Task } from "@/lib/store";
import { IconLock, IconScam, IconShield } from "./icons";

const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } };

export function Conversation({ task }: { task: Task }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [task.messages.length, task.messages.at(-1)]);
  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
      {task.messages.map((m) => (
        <motion.div key={m.id} {...enter}>
          <Item m={m} task={task} />
        </motion.div>
      ))}
      <div ref={end} />
    </div>
  );
}

function Item({ m, task }: { m: Msg; task: Task }) {
  switch (m.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-ink px-4 py-2.5 text-[15.5px] leading-snug text-paper">
            {m.attachment && (
              <div className="mb-1 flex items-center gap-1.5 text-[13px] text-paper/75">
                {m.attachment.kind === "image" ? <ImageIcon size={14} /> : m.attachment.kind === "link" ? <LinkSimple size={14} /> : <Paperclip size={14} />}
                {m.attachment.name === "sample" ? "Sample letter" : m.attachment.name}
              </div>
            )}
            {m.text}
          </div>
        </div>
      );
    case "agent":
      return <p className="pr-6 text-[17px] leading-[1.5] text-ink">{m.text}</p>;
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
          <span className="truncate">{m.text}</span>
        </div>
      );
    case "confirm":
      return <Confirm m={m} task={task} />;
    case "choice":
      return <Choice m={m} task={task} />;
    case "handoff":
      return <Handoff m={m} task={task} />;
    case "verdict":
      return <Verdict m={m} />;
    case "explain":
      return <Explain m={m} />;
    case "result":
      return <Result m={m} />;
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
      <p className="text-[16.5px] font-medium leading-snug text-ink">{m.question}</p>
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

function Choice({ m, task }: { m: Extract<Msg, { kind: "choice" }>; task: Task }) {
  if (!m.choices.length)
    return (
      <div className="glass-3 rounded-[22px] p-4">
        <p className="text-[16.5px] font-medium text-ink">{m.question}</p>
        {m.picked ? <p className="mt-1 text-[14px] text-ink-3">{m.picked}</p> : <p className="mt-1 text-[13px] text-ink-3">Type or speak your answer below.</p>}
      </div>
    );
  return (
    <div className="glass-2 rounded-[24px] p-4">
      <p className="text-[16.5px] font-medium text-ink">{m.question}</p>
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
        <p className="text-[15.5px] font-medium leading-snug text-ink">{m.text}</p>
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

function Result({ m }: { m: Extract<Msg, { kind: "result" }> }) {
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
