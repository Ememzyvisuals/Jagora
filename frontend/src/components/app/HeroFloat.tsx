"use client";

/* The new-tab hero on wide screens: Jagora in the middle, her five languages floating above as tilted glass tags
   (tap one to switch), and two small glass cards on either side, tied to her with thin lines, saying what she does. */
import { ShieldCheck, Waveform } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { LANGS, type Lang } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Glass } from "../glass/Glass";

type L = Record<Lang, string>;
const CARDS: { side: "left" | "right"; Icon: typeof Waveform; title: L; sub: L }[] = [
  {
    side: "left",
    Icon: Waveform,
    title: { en: "Talk, don't type", pcm: "Talk, no need to type", yo: "Sọ̀rọ̀, má kọ̀wé", ha: "Yi magana, ba rubutu ba", ig: "Kwuo okwu, edela ihe" },
    sub: {
      en: "Say it in your language. Jagora does the rest.",
      pcm: "Talk am for your language. Jagora go do the rest.",
      yo: "Ẹ sọ ọ́ ní èdè yín. Jagora á ṣe ìyókù.",
      ha: "Faɗa da harshenka. Jagora za ta yi sauran.",
      ig: "Kwuo ya n'asụsụ gị. Jagora ga-eme ndị ọzọ.",
    },
  },
  {
    side: "right",
    Icon: ShieldCheck,
    title: { en: "Real sites only", pcm: "Na real site only", yo: "Ojú òpó tòótọ́ nìkan", ha: "Shafukan gaskiya kawai", ig: "Naanị ezigbo saịtị" },
    sub: {
      en: "She checks it is the official site before you sign in.",
      pcm: "She go check say na the official site before you sign in.",
      yo: "Á yẹ̀ ẹ́ wò pé ojú òpó ìjọba ni kí ẹ tó wọlé.",
      ha: "Za ta duba ko shafin hukuma ne kafin ka shiga.",
      ig: "Ọ ga-elele ma ọ bụ saịtị gọọmentị tupu ị banye.",
    },
  },
];

// where each language tag floats above the wordmark: x offset from centre (px), height, tilt, glow
const TAGS: { id: Lang; x: number; y: number; r: number; glow: string }[] = [
  { id: "yo", x: -200, y: 24, r: -9, glow: "rgba(29,99,237,.55)" },
  { id: "ha", x: -100, y: -2, r: 5, glow: "rgba(37,211,102,.5)" },
  { id: "ig", x: 0, y: 12, r: -4, glow: "rgba(255,184,0,.5)" },
  { id: "pcm", x: 100, y: -4, r: 7, glow: "rgba(236,72,153,.45)" },
  { id: "en", x: 200, y: 22, r: -6, glow: "rgba(139,92,246,.5)" },
];

export function HeroFloat({ children }: { children: ReactNode }) {
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const still = useReducedMotion();
  const bob = (i: number, amp = 6) => (still ? {} : { animate: { y: [0, -amp, 0] }, transition: { duration: 5 + i * 0.7, repeat: Infinity, ease: "easeInOut" as const, delay: i * 0.4 } });

  return (
    <div className="@container w-full">
    <div className="relative mx-auto w-[900px] max-w-full pb-10 pt-[64px]">
      {/* a thin orbit around Jagora that the two cards sit on */}
      <svg className="pointer-events-none absolute left-0 top-0 hidden h-[320px] w-[900px] text-ink/20 @[900px]:block" viewBox="0 0 900 320" aria-hidden="true">
        <ellipse cx="450" cy="170" rx="410" ry="96" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>

      {/* the five languages, tilted glass tags with a soft glow; tap to switch */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[64px] w-0">
        {TAGS.map((t, i) => {
          const name = LANGS.find((l) => l.id === t.id)!.native;
          const on = t.id === lang;
          return (
            <motion.button
              key={t.id}
              {...bob(i, 4)}
              onClick={() => setLang(t.id)}
              aria-pressed={on}
              className="pointer-events-auto absolute"
              style={{ left: t.x, top: t.y, translate: "-50% 0", rotate: `${t.r}deg` }}
            >
              <span
                className={`block rounded-full px-4 py-1.5 text-[13.5px] font-semibold tracking-wide transition ${on ? "bg-ink text-paper" : "bg-white/55 text-ink backdrop-blur-md"}`}
                style={{ boxShadow: `inset 0 1px 1px rgba(255,255,255,.9), inset 0 -1px 2px rgba(255,255,255,.3), 0 8px 22px -6px ${t.glow}, 0 0 0 1px rgba(255,255,255,.55)` }}
              >
                {name}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="relative flex flex-col items-center">{children}</div>

      {/* what she does, one card each side */}
      {CARDS.map((c, i) => (
        <motion.div
          key={c.side}
          {...bob(i + 2, 7)}
          className={`absolute hidden w-[196px] @[900px]:block ${c.side === "left" ? "left-0 top-[120px]" : "right-0 top-[70px]"}`}
        >
          <Glass radius={22} bezel={14} refraction={26} tint="rgba(255,255,255,.55)" style={{ rotate: c.side === "left" ? "-3deg" : "3deg" }}>
            <div className="p-4">
              <span className="grid h-9 w-9 place-items-center rounded-[12px] bg-accent-soft text-accent">
                <c.Icon size={19} weight="bold" />
              </span>
              <p className="mt-3 text-[15.5px] font-semibold leading-tight text-ink">{c.title[lang]}</p>
              <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{c.sub[lang]}</p>
            </div>
          </Glass>
        </motion.div>
      ))}
    </div>
    </div>
  );
}
