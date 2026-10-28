"use client";

/* Discover as a deck: the day's stories sit in a glass pocket, one card on top and the next ones peeking out behind,
   tilted. Swipe the top card away (either side) and it tucks in at the back of the deck while the next one comes
   forward. Tap the top card to open it. Arrows do the same with a mouse or keyboard. "See all" lays them out. */
import { CaretLeft, CaretRight, SpeakerHigh } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { Glass } from "../glass/Glass";
import { PILL } from "@/lib/glassRegistry";

type L = Record<Lang, string>;
export const SEE_ALL: L = { en: "See all", pcm: "See all", yo: "Wo gbogbo rẹ̀", ha: "Duba duka", ig: "Lee ha niile" };
export const CLOSE_L: L = { en: "Close", pcm: "Close", yo: "Pa á dé", ha: "Rufe", ig: "Mechie" };
const SWIPE: L = { en: "Swipe for more", pcm: "Swipe for more", yo: "Fà á fún òmíràn", ha: "Ja don ƙari", ig: "Kpụgharịa maka ọzọ" };

const COUNT: L = { en: "{n} stories", pcm: "{n} stories", yo: "Ìtàn {n}", ha: "Labarai {n}", ig: "Akụkọ {n}" };

export type Story = { key: string; image: string | null; title: string; source: string; listen?: boolean; open: () => void };

const DISCOVER: L = { en: "Discover", pcm: "Discover", yo: "Ṣàwárí", ha: "Gano", ig: "Chọpụta" };

export function DiscoverStack(props: { stories: Story[]; lang: Lang; onSeeAll: () => void; wide?: boolean }) {
  return props.wide ? <DiscoverFan {...props} /> : <DiscoverRow {...props} />;
}

/* Phones: one clean row of whole cards, swiped sideways (each snaps into place). Nothing overlaps or is cut off, and
   every title is readable in full. */
function DiscoverRow({ stories, lang, onSeeAll }: { stories: Story[]; lang: Lang; onSeeAll: () => void }) {
  return (
    <div>
      <div className="mb-2.5 flex items-end justify-between px-1">
        <h2 className="text-[20px] font-bold text-ink [text-shadow:0_1px_8px_rgba(255,255,255,.8)] dark:[text-shadow:none]">{DISCOVER[lang]}</h2>
        <button onClick={onSeeAll} className="rounded-full bg-white/85 px-3.5 py-1.5 text-[14px] font-bold text-ink shadow-[0_4px_12px_-6px_rgba(10,25,60,.35)] dark:bg-white/15">
          {SEE_ALL[lang]}
        </button>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-3">
        {stories.map((s) => (
          <button
            key={s.key}
            onClick={s.open}
            className="w-[76%] max-w-[300px] shrink-0 snap-start overflow-hidden rounded-[24px] bg-white text-left shadow-[0_14px_30px_-16px_rgba(10,25,60,.5)] transition active:scale-[.98] dark:bg-[#1d2027]"
          >
            {s.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.image} alt="" loading="lazy" draggable={false} className="h-[150px] w-full object-cover object-left-top" />
            ) : (
              <span className="grid h-[150px] w-full place-items-center bg-ink text-[18px] font-bold text-paper">{s.source}</span>
            )}
            <span className="block px-4 pb-4 pt-3">
              <span className="line-clamp-3 text-[16.5px] font-bold leading-snug text-ink">{s.title}</span>
              <span className="mt-1.5 flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-2">
                <span className="truncate">{s.source}</span>
                {s.listen && <SpeakerHigh size={16} weight="fill" className="ml-auto shrink-0 text-accent" aria-label="Listen" />}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Wide screens: the stories spread out in a fan, like cards held in a hand, rising out of the glass pocket. Hover
   lifts one out; the arrows slide the next ones in. */
function DiscoverFan({ stories, lang, onSeeAll, wide = false }: { stories: Story[]; lang: Lang; onSeeAll: () => void; wide?: boolean }) {
  const [start, setStart] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const n = Math.min(wide ? 7 : 5, stories.length);
  const shown = Array.from({ length: n }, (_, i) => stories[(start + i) % stories.length]);
  const step = (d: number) => stories.length > 1 && setStart((x) => (x + d + stories.length) % stories.length);
  const CW = wide ? 236 : 156;
  const spreadW = wide ? Math.min(620, n * 110) : Math.min(150, n * 34);
  const imgH = wide ? 150 : 96;
  const panned = useRef(false);
  return (
    <div className="relative mx-auto w-full max-w-[920px]">
      {/* swipe across the fan (phone) to bring the next stories in */}
      <motion.div
        className={`relative touch-pan-y ${wide ? "h-[372px]" : "h-[290px]"}`}
        onPanStart={() => (panned.current = true)}
        onPanEnd={(_, info) => {
          if (Math.abs(info.offset.x) > 40) step(info.offset.x < 0 ? 1 : -1);
          setTimeout(() => (panned.current = false), 60);
        }}
      >
        {shown.map((s, i) => {
          const t = n > 1 ? i / (n - 1) - 0.5 : 0; // -0.5 .. 0.5 across the fan
          const lifted = hover === s.key;
          return (
            <motion.div
              key={s.key}
              className="absolute top-[4px] cursor-pointer"
              style={{ width: CW, left: `calc(50% - ${CW / 2}px)`, zIndex: lifted ? 30 : 10 - Math.round(Math.abs(t) * 10), transformOrigin: "50% 120%" }}
              initial={{ opacity: 0, y: 60, x: 0, rotate: 0 }}
              animate={{ opacity: 1, x: t * spreadW, y: lifted ? -30 : Math.abs(t) * (wide ? 40 : 30), rotate: lifted ? 0 : t * (wide ? 22 : 20), scale: lifted ? 1.04 : 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 24, delay: lifted || hover ? 0 : i * 0.04 }}
              onHoverStart={() => setHover(s.key)}
              onHoverEnd={() => setHover((h) => (h === s.key ? null : h))}
              onClick={() => !panned.current && s.open()}
            >
              <Glass flat radius={26} bezel={18} refraction={34} blur={10} tint="rgba(255,255,255,.55)" className="p-2 shadow-[0_24px_44px_-20px_rgba(10,25,60,.55)]">
                {s.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image} alt="" draggable={false} className="w-full rounded-[19px] object-cover object-left-top" style={{ height: imgH }} />
                ) : (
                  <span className="grid w-full place-items-center rounded-[19px] bg-ink text-[15px] font-bold text-paper" style={{ height: imgH }}>BBC</span>
                )}
                <div className={`px-2 pt-2.5 ${wide ? "pb-[64px]" : "pb-[58px]"}`}>
                  <p className={`line-clamp-2 font-semibold leading-snug text-ink ${wide ? "text-[14.5px]" : "text-[13px]"}`}>{s.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-3">
                    <span className="truncate">{s.source}</span>
                    {s.listen && <SpeakerHigh size={14} className="ml-auto shrink-0 text-accent" aria-label="Listen" />}
                  </p>
                </div>
              </Glass>
            </motion.div>
          );
        })}

        {/* the glass pocket they rise out of */}
        <Glass radius={30} bezel={22} refraction={50} blur={8} tint="rgba(255,255,255,.45)" lens={PILL} lensTint={0.4} overContent className={`!absolute inset-x-0 bottom-0 z-40 flex items-center justify-between ${wide ? "h-[84px] px-4" : "h-[72px] px-2"}`}>
          <button onClick={() => step(-1)} className="grid h-11 w-11 place-items-center rounded-full text-ink-2 hover:bg-white/50" aria-label="Previous stories">
            <CaretLeft size={18} weight="bold" />
          </button>
          <div className="flex flex-col items-center gap-1">
            <p className="text-[13px] font-medium text-ink-2">{COUNT[lang].replace("{n}", String(stories.length))}</p>
            <button onClick={onSeeAll} className="text-[14px] font-semibold text-accent">
              {SEE_ALL[lang]}
            </button>
          </div>
          <button onClick={() => step(1)} className="grid h-11 w-11 place-items-center rounded-full text-ink-2 hover:bg-white/50" aria-label="More stories">
            <CaretRight size={18} weight="bold" />
          </button>
        </Glass>
      </motion.div>
    </div>
  );
}

function DiscoverDeck({ stories, lang, onSeeAll, wide = false }: { stories: Story[]; lang: Lang; onSeeAll: () => void; wide?: boolean }) {
  const still = useReducedMotion();
  const [order, setOrder] = useState(() => stories.map((_, i) => i));
  const [fly, setFly] = useState<{ i: number; dir: number } | null>(null);
  // new stories (live news arriving) join the back of the deck
  useEffect(() => {
    setOrder((o) => [...o.filter((i) => i < stories.length), ...stories.map((_, i) => i).filter((i) => !o.includes(i))]);
  }, [stories.length]);

  const next = (dir: number) => {
    if (fly || order.length < 2) return;
    setFly({ i: order[0], dir });
    setTimeout(() => {
      setOrder((o) => [...o.slice(1), o[0]]);
      setFly(null);
    }, still ? 0 : 230);
  };
  const prev = () => !fly && order.length > 1 && setOrder((o) => [o[o.length - 1], ...o.slice(0, -1)]);

  const W = wide ? 440 : 300;
  const shown = order.slice(0, 4);
  const pos = stories.length ? order[0] : 0;

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: wide ? 640 : undefined }}>
      <div className="relative mx-auto" style={{ width: W, maxWidth: "100%", height: wide ? 410 : 334 }}>
        {/* the deck: back to front */}
        {[...shown].reverse().map((idx) => {
          const s = stories[idx];
          const d = shown.indexOf(idx); // 0 = top
          const top = d === 0;
          const flying = fly?.i === idx;
          const tilt = d === 0 ? 0 : d % 2 ? -4 * d : 3 * d;
          return (
            <motion.div
              key={s.key}
              className="absolute inset-x-0 top-7 cursor-grab touch-pan-y active:cursor-grabbing"
              style={{ zIndex: 10 - d }}
              initial={false}
              animate={
                flying
                  ? { x: fly!.dir * (W + 120), rotate: fly!.dir * 22, opacity: 0.6 }
                  : { x: d * (d % 2 ? -12 : 12), y: -d * 12, scale: 1 - d * 0.05, rotate: tilt, opacity: d > 2 ? 0 : 1 }
              }
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              drag={top && !fly ? "x" : false}
              dragSnapToOrigin
              dragElastic={0.7}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 500) next(Math.sign(info.offset.x || info.velocity.x));
              }}
              onTap={() => top && !fly && s.open()}
              whileDrag={{ scale: 1.02 }}
              aria-hidden={!top}
            >
              <Glass flat radius={28} bezel={18} refraction={34} blur={10} tint="rgba(255,255,255,.5)" className="p-2 shadow-[0_22px_44px_-20px_rgba(10,25,60,.5)]">
                {s.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.image} alt="" draggable={false} className={`w-full rounded-[20px] object-cover object-left-top ${wide ? "h-[212px]" : "h-[160px]"}`} />
                ) : (
                  <span className={`grid w-full place-items-center rounded-[20px] bg-ink text-[15px] font-bold text-paper ${wide ? "h-[212px]" : "h-[160px]"}`}>BBC</span>
                )}
                <div className="px-2.5 pb-[48px] pt-2.5">
                  <p className="line-clamp-2 text-[15.5px] font-semibold leading-snug text-ink">{s.title}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                    <span className="truncate">{s.source}</span>
                    {s.listen && <SpeakerHigh size={15} className="ml-auto shrink-0 text-accent" aria-label="Listen" />}
                  </p>
                </div>
              </Glass>
            </motion.div>
          );
        })}

        {/* the glass pocket the deck sits in */}
        <Glass radius={24} bezel={18} refraction={40} blur={8} tint="rgba(255,255,255,.45)" className="!absolute -inset-x-3 bottom-0 z-20 flex h-[58px] items-center justify-between px-2">
          <button onClick={prev} className="grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-white/50" aria-label="Previous story">
            <CaretLeft size={16} weight="bold" />
          </button>
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <div className="flex gap-1">
              {stories.slice(0, 9).map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === pos ? "w-4 bg-ink" : "w-1.5 bg-ink/25"}`} />
              ))}
            </div>
            <span className="flex items-center gap-1.5 text-[12.5px]">
              <span className="text-ink-3">{SWIPE[lang]},</span>
              <button onClick={onSeeAll} className="font-semibold text-accent">
                {SEE_ALL[lang]}
              </button>
            </span>
          </div>
          <button onClick={() => next(1)} className="grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-white/50" aria-label="Next story">
            <CaretRight size={16} weight="bold" />
          </button>
        </Glass>
      </div>
    </div>
  );
}

/** How each story enters when the deck is laid out: dealt one after another. */
export const deal = (i: number) => ({
  initial: { opacity: 0, y: -60, rotate: i % 2 ? 6 : -6, scale: 0.92 },
  animate: { opacity: 1, y: 0, rotate: 0, scale: 1 },
  transition: { type: "spring" as const, stiffness: 240, damping: 24, delay: i * 0.06 },
});
