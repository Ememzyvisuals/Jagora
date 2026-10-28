"use client";

/* Tiles that overlap like a hand of cards.
   Computer: the cards start as one tilted pile; as she scrolls, they spread into a neat overlapping fan. Pointing at
   a card lifts it to the front and straightens it so it can be read.
   Phone: one tilted deck. Scrolling brings the next card forward; a swipe left or right moves through the deck too,
   and the page follows so scrolling and swiping never disagree. */
import { animate, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type StackCard = { icon: ReactNode; title: string; body: string; tone?: string };

const TILT = [-5, 3.5, -2.5, 4.5, -4, 2.5, -3, 5];

export function CardStack({ cards }: { cards: StackCard[] }) {
  const [phone, setPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const m = matchMedia("(max-width: 767px)");
    const set = () => setPhone(m.matches);
    set();
    m.addEventListener("change", set);
    return () => m.removeEventListener("change", set);
  }, []);
  if (phone === null) return <div className="h-[520px]" />;
  return phone ? <Deck cards={cards} /> : <Fan cards={cards} />;
}

/* ---------- computer: a pile that fans out ---------- */

function Fan({ cards }: { cards: StackCard[] }) {
  const box = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: box, offset: ["start end", "center center"] });
  // a mouse wheel scrolls in steps: the cards follow a spring, so the fan opens in one smooth glide, not in jumps
  const raw = useTransform(scrollYProgress, [0, 1], [0, 1], { clamp: true });
  const p = useSpring(raw, { stiffness: 90, damping: 22, mass: 0.7, restDelta: 0.0005 });
  const [width, setWidth] = useState(1100);
  const [hot, setHot] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = cards.length;
  const cardW = 290;
  const spread = Math.min(250, (width - cardW - 20) / Math.max(1, n - 1));
  return (
    <div ref={box} className="relative h-[460px] w-full" onMouseLeave={() => setHot(null)}>
      {cards.map((c, i) => (
        <FanCard key={c.title} c={c} i={i} n={n} p={p} spread={spread} still={!!reduce} hot={hot} setHot={setHot} />
      ))}
    </div>
  );
}

function FanCard({ c, i, n, p, spread, still, hot, setHot }: {
  c: StackCard; i: number; n: number; p: MotionValue<number>; spread: number; still: boolean; hot: number | null; setHot: (i: number | null) => void;
}) {
  const mid = (n - 1) / 2;
  const off = i - mid;
  const x = useTransform(p, (v) => (still ? 1 : v) * off * spread + (1 - (still ? 1 : v)) * TILT[i % TILT.length] * 3);
  const y = useTransform(p, (v) => (still ? 1 : v) * (Math.abs(off) ** 2 * 7) + (1 - (still ? 1 : v)) * i * -4);
  const tilt = useTransform(p, (v) => (still ? 1 : v) * off * 3.2 + (1 - (still ? 1 : v)) * TILT[i % TILT.length]);
  const isHot = hot === i;
  // pointing at a card straightens it smoothly (no snap)
  const straight = useSpring(0, { stiffness: 300, damping: 28 });
  useEffect(() => straight.set(isHot ? 1 : 0), [isHot, straight]);
  const rotate = useTransform([tilt, straight] as MotionValue<number>[], ([t, k]: number[]) => t * (1 - k));
  return (
    <motion.article
      onMouseEnter={() => setHot(i)}
      onFocus={() => setHot(i)}
      tabIndex={0}
      style={{ x, y, rotate, zIndex: isHot ? 50 : i, left: "50%", marginLeft: -145, willChange: "transform" }}
      className="absolute top-8 w-[290px] origin-bottom cursor-default outline-none [backface-visibility:hidden]"
    >
      <motion.div animate={{ scale: isHot ? 1.06 : 1, y: isHot ? -26 : 0 }} transition={{ type: "spring", stiffness: 320, damping: 26 }}>
        <Face c={c} i={i} />
      </motion.div>
    </motion.article>
  );
}

/* ---------- phone: a deck that moves with scrolling and swiping ---------- */

function Deck({ cards }: { cards: StackCard[] }) {
  const box = useRef<HTMLDivElement>(null);
  const n = cards.length;
  const { scrollYProgress } = useScroll({ target: box, offset: ["start start", "end end"] });
  const [at, setAt] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setAt(Math.min(n - 1, Math.max(0, Math.floor(v * n * 0.999)))));

  // a swipe moves the page to where that card lives, so scroll and swipe stay together
  const goTo = (k: number) => {
    const el = box.current;
    if (!el) return;
    const k2 = Math.min(n - 1, Math.max(0, k));
    const top = el.getBoundingClientRect().top + scrollY;
    const room = el.offsetHeight - innerHeight;
    const target = top + (room * (k2 + 0.5)) / n;
    animate(scrollY, target, { duration: 0.45, ease: [0.2, 0.7, 0.2, 1], onUpdate: (v) => scrollTo(0, v) });
  };

  return (
    <div ref={box} className="relative" style={{ height: `${n * 62 + 40}vh` }}>
      <div className="sticky top-0 flex h-[100svh] flex-col items-center justify-center overflow-hidden px-5">
        <div className="relative h-[420px] w-full max-w-[340px]">
          {cards.map((c, i) => {
            const d = i - at;
            const gone = d < 0;
            return (
              <motion.article
                key={c.title}
                drag={d === 0 ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.7}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -60 || info.velocity.x < -400) goTo(at + 1);
                  else if (info.offset.x > 60 || info.velocity.x > 400) goTo(at - 1);
                }}
                initial={false}
                animate={
                  gone
                    ? { x: "-120%", y: 30, rotate: -14, opacity: 0, scale: 0.94 }
                    : { x: d * 10, y: d * 14, rotate: d === 0 ? TILT[i % TILT.length] * 0.5 : TILT[i % TILT.length], opacity: d > 3 ? 0 : 1, scale: 1 - d * 0.04 }
                }
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
                style={{ zIndex: n - i }}
                className="absolute inset-x-0 top-0 touch-pan-y"
              >
                <Face c={c} i={i} big />
              </motion.article>
            );
          })}
        </div>
        <div className="mt-6 flex gap-1.5" aria-hidden>
          {cards.map((c, i) => (
            <button key={c.title} onClick={() => goTo(i)} className={`h-1.5 rounded-full transition-all ${i === at ? "w-6 bg-ink" : "w-1.5 bg-ink/25"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- the card itself ---------- */

function Face({ c, i, big = false }: { c: StackCard; i: number; big?: boolean }) {
  return (
    <div
      className={`flex flex-col rounded-[28px] bg-white p-6 ring-1 ring-black/5 shadow-[0_30px_60px_-30px_rgba(10,30,70,.45),0_2px_6px_rgba(10,30,70,.06)] dark:bg-[#20232a] ${big ? "min-h-[380px]" : "min-h-[340px]"}`}
    >
      <div className="flex items-center justify-between">
        <span className="grid h-12 w-12 place-items-center rounded-[14px] border border-ink/15 text-ink">{c.icon}</span>
        <span className="font-head text-[15px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
      </div>
      <h3 className="mt-auto pt-10 text-[25px] leading-[1.08]">{c.title}</h3>
      <p className="mt-2.5 text-[16px] leading-relaxed text-ink-2">{c.body}</p>
    </div>
  );
}
