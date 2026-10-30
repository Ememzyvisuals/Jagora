"use client";

/* Security, as a deck: one idea per glass card, with its number from the live test. Swipe or click through; it moves
   on by itself and waits while she reads (pointer on it, focus in it, or the section off screen). The live scam check
   sits in its own panel below. Every rule here is enforced in code, outside the AI (see the README's Safety model). */
import { Eye, FingerprintSimple, HandPalm, LockKey, Prohibit, ShieldCheck } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScamCheck } from "@/components/ScamCheck";

type Card = { icon: ReactNode; title: string; num?: string; unit?: string; lines: [string, string]; how: string };

const CARDS: Card[] = [
  {
    icon: <Prohibit size={26} weight="bold" />, title: "Bad sites never open", num: "1.3M", unit: "blocked domains",
    lines: ["Phishing sites, lookalike banks, betting, exam expo and money-doubling sites are blocked.", "The check runs on every request, before the page loads."],
    how: "Every address is checked against the block lists; new sites are judged by what the page itself says.",
  },
  {
    icon: <ShieldCheck size={26} weight="bold" />, title: "Tested against real attacks", num: "20/20", unit: "attacks resisted",
    lines: ["Tested live on the production server, with the real Muse Spark and a user who says yes to everything.", "That includes the University of Washington same-origin attack, done three ways."],
    how: "The rules run in code, outside the model, so even a fooled model cannot act on the trick.",
  },
  {
    icon: <Eye size={26} weight="bold" />, title: "Hidden orders are cut out", num: "12/12", unit: "hidden orders refused",
    lines: ["Text people cannot see is removed before Jagora reads a page.", "Text written to give orders to an AI is cut out and flagged."],
    how: "Hidden-text and order filters run on every page first; Muse Spark only reads what is left.",
  },
  {
    icon: <LockKey size={26} weight="bold" />, title: "Logins the AI never sees", num: "AES-256-GCM", unit: "sealed logins",
    lines: ["Passwords, PINs, OTPs, NIN and BVN go in a private box that only the website sees.", "Saved logins are sealed to their own site and never reach the model, logs or speech."],
    how: "The private box types straight into the page; the model only learns that a field was filled.",
  },
  {
    icon: <HandPalm size={26} weight="bold" />, title: "Money moves on your yes",
    lines: ["Paying, submitting, sending and agreeing all stop and wait for you.", "Spoken numbers are read back to you before Jagora types them."],
    how: "An approval gate in code holds every action that commits until you say yes.",
  },
  {
    icon: <FingerprintSimple size={26} weight="bold" />, title: "Every step checked twice",
    lines: ["Before anything that commits, a separate check compares the action with what you asked for.", "A second Muse Spark call must agree a task is done before you hear that it is."],
    how: "Two independent checks: one on each action, one on the finished task.",
  },
];

const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } as const;
const TILT = [-2.5, 2, -1.5, 2.5, -2, 1.5];

export function Security() {
  const n = CARDS.length;
  const [at, setAt] = useState(0);
  const [hold, setHold] = useState(false);
  const [seen, setSeen] = useState(false);
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const go = (k: number) => setAt(((k % n) + n) % n);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (reduce || hold || !seen) return;
    const id = setTimeout(() => setAt((v) => (v + 1) % n), 6000);
    return () => clearTimeout(id);
  }, [at, hold, seen, reduce, n]);

  return (
    <section id="safe" className="relative py-20 md:py-28">
      <div className="wrap">
        <div className="grid items-center gap-10 md:grid-cols-[0.9fr_1.1fr] xl:gap-20">
          <motion.div {...rise} className="liquid-glass glass-strong rounded-[32px] p-6 sm:p-9">
            <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-accent text-white shadow-[0_14px_30px_-12px_rgba(29,99,237,.8)]">
              <ShieldCheck size={34} weight="fill" />
            </span>
            <p className="mt-6 text-[15px] font-bold uppercase tracking-[0.08em] text-accent">Security</p>
            <h2 className="mt-3 max-w-[13ch] font-display text-[38px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-[56px] xl:text-[68px]">Safe to hand the keys to.</h2>
            <p className="mt-5 max-w-[30rem] text-[17.5px] font-semibold leading-relaxed text-ink sm:text-[19px]">
              Jagora is the one that acts, so every rule is enforced in code, outside the AI.
            </p>
            <ol className="mt-8 hidden gap-1.5 md:grid">
              {CARDS.map((c, i) => (
                <li key={c.title}>
                  <button onClick={() => go(i)} className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-[15.5px] font-bold transition ${i === at ? "bg-white text-ink shadow-[0_8px_24px_-14px_rgba(9,40,110,.5)]" : "text-ink hover:bg-white/60"}`}>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] ${i === at ? "bg-accent text-white" : "bg-ink/10 text-ink"}`}>{i + 1}</span>
                    {c.title}
                  </button>
                </li>
              ))}
            </ol>
          </motion.div>

          <div ref={box} data-amina="safety" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocusCapture={() => setHold(true)} onBlurCapture={() => setHold(false)}>
            <div className="relative mx-auto h-[500px] w-full max-w-[560px] sm:h-[470px]" aria-roledescription="carousel" aria-label="How Jagora keeps you safe">
              {CARDS.map((c, i) => {
                const d = (i - at + n) % n; // 0 = front
                const back = d > 3;
                return (
                  <motion.article
                    key={c.title}
                    aria-hidden={d !== 0}
                    drag={d === 0 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.6}
                    onDragEnd={(_, info) => {
                      if (info.offset.x < -60 || info.velocity.x < -400) go(at + 1);
                      else if (info.offset.x > 60 || info.velocity.x > 400) go(at - 1);
                    }}
                    initial={false}
                    animate={{ x: d * 14, y: d * 16, rotate: d === 0 ? 0 : TILT[i % TILT.length], scale: 1 - d * 0.045, opacity: back ? 0 : 1 }}
                    transition={{ type: "spring", stiffness: 240, damping: 28 }}
                    style={{ zIndex: n - d }}
                    className="absolute inset-x-0 top-0 touch-pan-y"
                  >
                    <div className="liquid-glass glass-strong flex h-[440px] flex-col rounded-[30px] p-6 sm:h-[410px] sm:p-8">
                      <div className="flex items-center justify-between">
                        <span className="grid h-12 w-12 place-items-center rounded-[16px] bg-accent text-white shadow-[0_10px_24px_-10px_rgba(29,99,237,.8)]">{c.icon}</span>
                        <span className="text-[14px] font-bold text-ink-2 tabular-nums">{String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
                      </div>
                      <h3 className="mt-5 font-display text-[26px] font-bold leading-[1.08] tracking-[-0.025em] sm:text-[30px]">{c.title}</h3>
                      {c.num && (
                        <p className="mt-3 flex flex-wrap items-baseline gap-x-2.5">
                          <span className={`font-display font-bold leading-none tracking-[-0.04em] text-accent ${c.num.length > 6 ? "text-[34px] sm:text-[40px]" : "text-[48px] sm:text-[56px]"}`}>{c.num}</span>
                          <span className="text-[15px] font-bold text-ink">{c.unit}</span>
                        </p>
                      )}
                      <ul className="mt-4 grid gap-2">
                        {c.lines.map((l) => (
                          <li key={l} className="flex gap-2.5 text-[15.5px] font-semibold leading-snug text-ink sm:text-[16.5px]">
                            <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-accent" />
                            {l}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-auto rounded-[16px] bg-white/70 px-4 py-3 text-[14px] font-semibold leading-snug text-ink-2 sm:text-[14.5px]">
                        <span className="font-bold text-ink">How it works: </span>
                        {c.how}
                      </p>
                    </div>
                  </motion.article>
                );
              })}
            </div>
            <div className="mx-auto mt-2 flex max-w-[560px] items-center justify-between gap-3">
              <button onClick={() => go(at - 1)} className="liquid-glass glass-strong rounded-full px-5 py-2.5 text-[15px] font-bold text-ink transition hover:bg-white">
                Previous
              </button>
              <div className="liquid-glass glass-strong flex gap-1.5 rounded-full px-3 py-2.5" role="tablist" aria-label="Choose a card">
                {CARDS.map((c, i) => (
                  <button key={c.title} role="tab" aria-selected={i === at} aria-label={c.title} onClick={() => go(i)} className={`h-2 rounded-full transition-all ${i === at ? "w-7 bg-ink" : "w-2 bg-ink/30 hover:bg-ink/50"}`} />
                ))}
              </div>
              <button onClick={() => go(at + 1)} className="rounded-full bg-ink px-6 py-2.5 text-[15px] font-bold text-paper transition hover:opacity-90">
                Next
              </button>
            </div>
          </div>
        </div>

        {/* the live scam check, in its own panel */}
        <motion.div {...rise} className="liquid-glass glass-strong mt-16 grid items-center gap-8 rounded-[32px] p-6 sm:p-10 md:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-[15px] font-bold uppercase tracking-[0.08em] text-accent">See it catch a scam</p>
            <h3 className="mt-3 max-w-[16ch] font-display text-[30px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[42px]">Ask if a message is real.</h3>
            <p className="mt-4 max-w-[28rem] text-[16.5px] font-semibold leading-relaxed text-ink sm:text-[18px]">
              Paste or photograph an SMS. Jagora checks the link, the sender and the request against official sources, and answers in your language.
            </p>
          </div>
          <ScamCheck />
        </motion.div>
      </div>
    </section>
  );
}
