"use client";

/* Security, the main promise: the numbers from the live test and the locks, all enforced in code outside the AI. */
import { Eye, FingerprintSimple, HandPalm, LockKey, Prohibit, SealCheck } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScamCheck } from "@/components/ScamCheck";

const STATS: { to: number; fmt: (v: number) => string; label: string }[] = [
  { to: 1.3, fmt: (v) => `${v.toFixed(1)}M`, label: "blocked domains, checked on every request" },
  { to: 20, fmt: (v) => `${Math.round(v)}/20`, label: "attacks resisted in the live test on the real model" },
  { to: 12, fmt: (v) => `${Math.round(v)}/12`, label: "orders hidden in web pages that Muse Spark refused" },
  { to: 256, fmt: (v) => `${Math.round(v)}`, label: "bit AES-GCM seal on every saved login" },
];

const LOCKS: { icon: ReactNode; title: string; body: string }[] = [
  { icon: <Prohibit size={24} weight="bold" />, title: "Bad sites never open", body: "Phishing, lookalike banks, betting, exam expo and money-doubling sites are blocked before the page loads." },
  { icon: <Eye size={24} weight="bold" />, title: "Hidden orders are cut out", body: "Text people cannot see, and text written to give orders to AI, is removed before Jagora reads the page." },
  { icon: <SealCheck size={24} weight="bold" />, title: "Every action checked", body: "Before anything that commits, a separate check compares the action with what you actually asked for." },
  { icon: <HandPalm size={24} weight="bold" />, title: "Money moves on your yes", body: "Paying, submitting, sending and agreeing all stop and wait for you. Spoken numbers are read back first." },
  { icon: <LockKey size={24} weight="bold" />, title: "Logins the AI never sees", body: "Passwords, PINs, OTPs, NIN and BVN go in a private box. Saved logins are sealed to their own site." },
  { icon: <FingerprintSimple size={24} weight="bold" />, title: "Done means done", body: "A second Muse Spark call must agree a task is really finished before Jagora tells you it is." },
];

function Count({ to, fmt }: { to: number; fmt: (v: number) => string }) {
  const el = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 1400);
        setV(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(node);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={el}>{fmt(v)}</span>;
}

const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } as const;

export function Security() {
  return (
    <section id="safe" className="relative py-20 md:py-28">
      <div className="wrap">
        <div className="grid items-end gap-10 md:grid-cols-[1.25fr_1fr]">
          <motion.div {...rise}>
            <p className="text-[15px] font-bold uppercase tracking-[0.08em] text-accent">Security</p>
            <h2 className="mt-3 max-w-[15ch] text-[38px] leading-[1.02] sm:text-[56px] xl:text-[72px] 2xl:text-[84px]">Safe to hand the keys to.</h2>
            <p className="mt-5 max-w-[34rem] text-[17.5px] font-medium leading-relaxed text-ink sm:text-[19px] xl:max-w-[40rem] xl:text-[20px]">
              Jagora is the one that acts, so every rule is enforced in code, outside the AI. No web page, message or trick can talk it out of them.
            </p>
          </motion.div>
          <motion.div {...rise} className="hidden justify-self-end md:block" aria-hidden="true">
            <Shield />
          </motion.div>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div key={s.label} {...rise} transition={{ ...rise.transition, delay: i * 0.06 }} className="rounded-[26px] bg-white p-5 shadow-[0_24px_60px_-34px_rgba(9,40,110,.45)] ring-1 ring-black/5 sm:p-7">
              <div className="font-display text-[38px] font-bold leading-none tracking-[-0.04em] text-accent tabular-nums sm:text-[54px] xl:text-[64px]">
                <Count to={s.to} fmt={s.fmt} />
              </div>
              <p className="mt-3 text-[14.5px] font-semibold leading-snug text-ink sm:text-[16px]">{s.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-start">
          <div data-amina="safety" className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {LOCKS.map((l, i) => (
              <motion.div key={l.title} {...rise} transition={{ ...rise.transition, delay: i * 0.05 }} className="rounded-[24px] bg-white/80 p-5 ring-1 ring-black/5 backdrop-blur sm:p-6">
                <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#e8f1ff] text-accent">{l.icon}</span>
                <h3 className="mt-4 font-display text-[20px] font-bold leading-tight tracking-[-0.02em] sm:text-[22px]">{l.title}</h3>
                <p className="mt-2 text-[15px] font-medium leading-relaxed text-ink-2 sm:text-[16px]">{l.body}</p>
              </motion.div>
            ))}
          </div>
          <div>
            <p className="mb-3 text-[15px] font-bold text-ink">See it catch a scam</p>
            <ScamCheck />
          </div>
        </div>
      </div>
    </section>
  );
}

function Shield() {
  return (
    <svg width="230" height="262" viewBox="0 0 24 27" fill="none" className="drop-shadow-[0_30px_50px_rgba(29,99,237,.35)]">
      <defs>
        <linearGradient id="sh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fb4ff" />
          <stop offset="1" stopColor="#1d63ed" />
        </linearGradient>
      </defs>
      <path d="M12 1.5L2.5 5v7.5c0 6.2 4.1 10.9 9.5 13 5.4-2.1 9.5-6.8 9.5-13V5z" fill="url(#sh)" stroke="#fff" strokeWidth=".6" />
      <path d="M7.5 13.5l3.2 3.2 6-6.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
