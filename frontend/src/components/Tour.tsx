"use client";

/* First-time tips, one at a time: the screen dims, a white bubble points at one thing and says what it does, in her
   language. "Got it!" moves on; "How it works" opens a short explanation. Shown once per phone. */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { Glass } from "./glass/Glass";
import { useApp } from "@/lib/store";

type Step = { target: string; text: Record<Lang, string>; more: Record<Lang, string> };

const STEPS: Step[] = [
  {
    target: "orb",
    text: {
      en: "This is Jagora. Tap the cloud and talk in your own language.",
      pcm: "Na Jagora be this. Tap the cloud and talk for your language.",
      yo: "Jagora nìyí. Ẹ tẹ ìkùukù yìí kí ẹ sì sọ̀rọ̀ ní èdè yín.",
      ha: "Wannan ita ce Jagora. Taɓa gajimaren nan ka yi magana da harshenka.",
      ig: "Nke a bụ Jagora. Pịa igwe ojii a ma kwuo okwu n'asụsụ gị.",
    },
    more: {
      en: "Say what you need: open a website, find something, fill a form, check a message. Jagora does it and tells you what it is doing.",
      pcm: "Talk wetin you need: open website, find something, fill form, check message. Jagora go do am and tell you wetin e dey do.",
      yo: "Ẹ sọ ohun tí ẹ nílò: ṣí ojú òpó kan, wá nǹkan, kún fọ́ọ̀mù, yẹ ọ̀rọ̀ wò. Jagora á ṣe é, á sì máa sọ ohun tó ń ṣe fún yín.",
      ha: "Faɗi abin da kake bukata: buɗe shafi, nemo wani abu, cike fom, duba saƙo. Jagora za ta yi kuma ta faɗa maka abin da take yi.",
      ig: "Kwuo ihe ị chọrọ: mepee weebụsaịtị, chọọ ihe, jupụta fọm, lelee ozi. Jagora ga-eme ya ma gwa gị ihe ọ na-eme.",
    },
  },
  {
    target: "lang",
    text: {
      en: "Change Jagora's language here, any time.",
      pcm: "Change Jagora language here anytime.",
      yo: "Ẹ yí èdè Jagora padà níbí, nígbàkúùgbà.",
      ha: "Canza harshen Jagora a nan, kowane lokaci.",
      ig: "Gbanwee asụsụ Jagora ebe a, oge ọ bụla.",
    },
    more: {
      en: "Jagora speaks and understands Yorùbá, Hausa, Igbo, Pidgin and English.",
      pcm: "Jagora sabi talk and hear Yorùbá, Hausa, Igbo, Pidgin and English.",
      yo: "Jagora gbọ́ ó sì ń sọ Yorùbá, Hausa, Igbo, Pidgin àti Gẹ̀ẹ́sì.",
      ha: "Jagora tana ji kuma tana magana da Yarbanci, Hausa, Igbo, Pidgin da Turanci.",
      ig: "Jagora na-aghọta ma na-asụ Yorùbá, Hausa, Igbo, Pidgin na Bekee.",
    },
  },
  {
    target: "ask",
    text: {
      en: "Prefer to type? Write here, or paste a link or a message.",
      pcm: "You wan type? Write here, or paste link or message.",
      yo: "Ṣé ẹ fẹ́ kọ̀wé? Ẹ kọ ọ́ síbí, tàbí ẹ lẹ ìjápọ̀ tàbí ọ̀rọ̀ síbí.",
      ha: "Kana son rubutawa? Rubuta a nan, ko ka liƙa hanyar haɗi ko saƙo.",
      ig: "Ị chọrọ ide? Dee ebe a, ma ọ bụ mado njikọ ma ọ bụ ozi.",
    },
    more: {
      en: "Paste a message you are not sure about and Jagora will check if it is a scam before you click anything.",
      pcm: "Paste message wey you no trust and Jagora go check if na scam before you click anything.",
      yo: "Ẹ lẹ ọ̀rọ̀ tí ẹ ò dá lójú síbí, Jagora á yẹ̀ ẹ́ wò bóyá jìbìtì ni kí ẹ tó tẹ ohunkóhun.",
      ha: "Liƙa saƙon da ba ka amince da shi ba, Jagora za ta duba ko zamba ne kafin ka taɓa komai.",
      ig: "Mado ozi ị na-enweghị obi ike na ya, Jagora ga-elele ma ọ bụ aghụghọ tupu ị pịa ihe ọ bụla.",
    },
  },
  {
    target: "tabs",
    text: {
      en: "Everything Jagora is doing for you lives here.",
      pcm: "Everything wey Jagora dey do for you dey here.",
      yo: "Gbogbo ohun tí Jagora ń ṣe fún yín wà níbí.",
      ha: "Duk abin da Jagora take yi maka yana nan.",
      ig: "Ihe niile Jagora na-emere gị dị ebe a.",
    },
    more: {
      en: "Each task is a tab. Go back to one any time, or close it when you are done.",
      pcm: "Each work na one tab. Go back to am anytime or close am when you finish.",
      yo: "Iṣẹ́ kọ̀ọ̀kan jẹ́ táàbù kan. Ẹ padà sí i nígbàkúùgbà, tàbí kí ẹ pa á dé tí ẹ bá parí.",
      ha: "Kowane aiki shafi ne. Koma gare shi kowane lokaci, ko ka rufe shi idan ka gama.",
      ig: "Ọrụ ọ bụla bụ taabụ. Laghachi na ya oge ọ bụla, ma ọ bụ mechie ya mgbe ị gwụchara.",
    },
  },
];

const GOT: Record<Lang, string> = { en: "Got it!", pcm: "I don hear!", yo: "Ó yé mi!", ha: "Na gane!", ig: "Aghọtala m!" };
const HOW: Record<Lang, string> = { en: "How it works", pcm: "How e dey work", yo: "Bí ó ṣe ń ṣiṣẹ́", ha: "Yadda yake aiki", ig: "Otú o si arụ ọrụ" };
const KEY = "jagora:toured";

export function Tour() {
  const lang = useApp((s) => s.lang);
  const [i, setI] = useState(-1);
  const [more, setMore] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {}
    const id = setTimeout(() => setI(0), 1600);
    return () => clearTimeout(id);
  }, []);

  useLayoutEffect(() => {
    if (i < 0 || i >= STEPS.length) return;
    const find = () => {
      const el = document.querySelector(`[data-tour="${STEPS[i].target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    find();
    addEventListener("resize", find);
    return () => removeEventListener("resize", find);
  }, [i]);

  const next = () => {
    setMore(false);
    if (i + 1 >= STEPS.length) {
      setI(-1);
      try {
        localStorage.setItem(KEY, "1");
      } catch {}
      dispatchEvent(new Event("jagora:toured"));
    } else setI(i + 1);
  };

  if (i < 0 || i >= STEPS.length) return null;
  const step = STEPS[i];
  const vw = typeof window !== "undefined" ? innerWidth : 390;
  const vh = typeof window !== "undefined" ? innerHeight : 844;
  const below = rect ? rect.top + rect.height / 2 < vh / 2 : true;
  const W = Math.min(330, vw - 32);
  const cx = rect ? rect.left + rect.width / 2 : vw / 2;
  const left = Math.max(16, Math.min(vw - W - 16, cx - W / 2));
  const arrowX = Math.max(22, Math.min(W - 22, cx - left));

  return (
    <AnimatePresence>
      <motion.div key="dim" className="fixed inset-0 z-[90] bg-[#0b1426]/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={next} />
      {rect && (
        <motion.div
          key={`ring-${i}`}
          className="pointer-events-none fixed z-[91] rounded-[28px] ring-[1.5px] ring-white"
          initial={{ opacity: 0, scale: 1.15 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: "0 0 0 6px rgba(255,255,255,.18)" }}
        />
      )}
      <motion.div
        key={`tip-${i}`}
        role="dialog"
        aria-live="polite"
        initial={{ opacity: 0, y: below ? -8 : 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
        className="fixed z-[92]"
        style={{ width: W, left, ...(rect ? (below ? { top: rect.bottom + 16 } : { bottom: vh - rect.top + 16 }) : { top: vh * 0.4 }) }}
      >
        <span
          className="absolute z-10 h-4 w-4 rotate-45 bg-white/90"
          style={{ left: arrowX - 8, ...(below ? { top: -7 } : { bottom: -7 }) }}
          aria-hidden="true"
        />
        <Glass flat radius={26} bezel={16} refraction={34} blur={12} tint="rgba(255,255,255,.8)" className="p-5 shadow-[0_24px_60px_-20px_rgba(10,25,60,.5)]">
        <p className="text-[17px] leading-snug text-ink">{step.text[lang]}</p>
        {more && <p className="mt-2 text-[15px] leading-snug text-ink-2">{step.more[lang]}</p>}
        <div className="mt-4 flex items-center justify-between">
          <button onClick={next} className="h-11 rounded-full bg-ink px-5 text-[15.5px] font-semibold text-white shadow-[inset_0_1px_1px_rgba(255,255,255,.25)] transition active:scale-95">
            {GOT[lang]}
          </button>
          {!more && (
            <button onClick={() => setMore(true)} className="h-11 rounded-full bg-white/60 px-4 text-[15px] font-medium text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,1)] transition active:scale-95">
              {HOW[lang]}
            </button>
          )}
          <span className="text-[12.5px] font-medium text-ink-3">
            {i + 1}/{STEPS.length}
          </span>
        </div>
        </Glass>
      </motion.div>
    </AnimatePresence>
  );
}
