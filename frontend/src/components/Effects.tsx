"use client";

/* Small moments of delight, drawn above everything:
   - fly(el): a folded paper plane lifts off the send button, loops up and away with a dotted trail
   - celebrate(): a glass disc with a check that draws itself, a soft ring pulse and a light haptic tap
   Both are skipped when the phone asks for reduced motion. */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

type Plane = { id: number; x: number; y: number };

export function fly(from?: Element | null) {
  const r = from?.getBoundingClientRect();
  dispatchEvent(new CustomEvent("jagora:plane", { detail: { x: r ? r.left + r.width / 2 : innerWidth / 2, y: r ? r.top + r.height / 2 : innerHeight / 2 } }));
}
export function celebrate() {
  dispatchEvent(new Event("jagora:done"));
  try {
    navigator.vibrate?.([12, 40, 18]);
  } catch {}
}

function PaperPlane() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <defs>
        <linearGradient id="pp-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe9fb" />
        </linearGradient>
      </defs>
      {/* top wing, fold, under wing */}
      <path d="M4 22 L44 5 L19 28 Z" fill="url(#pp-a)" stroke="#1d63ed" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M19 28 L44 5 L28 42 Z" fill="#cfdcf6" stroke="#1d63ed" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M19 28 L22 38 L26 32" fill="#9fb8ea" stroke="#1d63ed" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

export function Effects() {
  const still = useReducedMotion();
  const [planes, setPlanes] = useState<Plane[]>([]);
  const [done, setDone] = useState(0);

  useEffect(() => {
    const onPlane = (e: Event) => {
      if (still) return;
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      const id = Date.now() + Math.random();
      setPlanes((p) => [...p, { id, x, y }]);
      setTimeout(() => setPlanes((p) => p.filter((q) => q.id !== id)), 1500);
    };
    const onDone = () => {
      setDone((d) => d + 1);
      setTimeout(() => setDone(0), 1500);
    };
    addEventListener("jagora:plane", onPlane);
    addEventListener("jagora:done", onDone);
    return () => {
      removeEventListener("jagora:plane", onPlane);
      removeEventListener("jagora:done", onDone);
    };
  }, [still]);

  return (
    <div id="jagora-fx" className="pointer-events-none fixed inset-0 z-[300]" aria-hidden="true">
      {planes.map((p) => {
        // up and to the right, with a little loop: dx/dy keyframes in px from the button
        const right = Math.min(140, Math.max(40, innerWidth - p.x - 30));
        const dx = [0, -22, 10, right * 0.6, right];
        const dy = [0, -34, -120, -Math.max(220, p.y * 0.55), -(p.y + 90)];
        return (
          <div key={p.id} className="absolute" style={{ left: p.x - 20, top: p.y - 20 }}>
            {/* dotted trail */}
            {[0.12, 0.2, 0.28, 0.36].map((d, i) => (
              <motion.span
                key={i}
                className="absolute left-[18px] top-[18px] h-1.5 w-1.5 rounded-full bg-accent/50"
                initial={{ opacity: 0, x: 0, y: 0 }}
                animate={{ opacity: [0, 0.8, 0], x: dx.map((v) => v * (1 - i * 0.12)), y: dy.map((v) => v * (1 - i * 0.12)) }}
                transition={{ duration: 1.4, delay: d, ease: [0.45, 0, 0.2, 1], times: [0, 0.15, 0.4, 0.65, 1] }}
              />
            ))}
            <motion.div
              initial={{ x: 0, y: 0, rotate: 0, scale: 0.6, opacity: 0 }}
              animate={{ x: dx, y: dy, rotate: [0, -24, -10, 6, 12], scale: [0.6, 1.1, 1, 0.9, 0.7], opacity: [0, 1, 1, 1, 0] }}
              transition={{ duration: 1.4, ease: [0.45, 0, 0.2, 1], times: [0, 0.15, 0.4, 0.65, 1] }}
              style={{ filter: "drop-shadow(0 6px 10px rgba(20,50,120,.35))" }}
            >
              <PaperPlane />
            </motion.div>
          </div>
        );
      })}

      <AnimatePresence>
        {done > 0 && (
          <motion.div
            key="done"
            className="absolute left-1/2 top-1/2 -ml-[56px] -mt-[56px]"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.25 } }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
          >
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-ok/60"
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
            />
            <span className="grid h-[112px] w-[112px] place-items-center rounded-full bg-white/80 shadow-[0_24px_60px_-20px_rgba(10,40,30,.45),inset_0_1px_1px_#fff] ring-1 ring-black/5 backdrop-blur-xl dark:bg-white/15">
              <svg viewBox="0 0 52 52" width="58" height="58">
                <motion.circle cx="26" cy="26" r="23" fill="none" stroke="var(--color-ok)" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: "easeOut" }} />
                <motion.path
                  d="M15 27 L23 34 L38 18"
                  fill="none"
                  stroke="var(--color-ok)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.35, delay: 0.38, ease: [0.65, 0, 0.35, 1] }}
                />
              </svg>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
