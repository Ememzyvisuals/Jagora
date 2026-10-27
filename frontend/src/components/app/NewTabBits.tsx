"use client";

/* New-tab pieces shared by phone and desktop (ideas from BrowserOS's new tab):
   - her own top sites: the shortcuts reorder by how often she opens them, and sites Jagora opened for her that are
     not in the list join it
   - three suggestion buttons under the ask bar, one set for "Guide me" and one for "Do it for me", which she can
     rewrite herself */
import { Globe, PencilSimple, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { ask } from "@/lib/engine";
import type { Lang } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { SITES } from "./MobileHome";

type L = Record<Lang, string>;
type Site = (typeof SITES)[number];

export function useTopSites(): Site[] {
  const visits = useApp((s) => s.visits) ?? {};
  return useMemo(() => {
    const score = (d?: string) => (d ? visits[d]?.n ?? 0 : 0);
    const known = new Set(SITES.map((s) => s.domain));
    const extra: Site[] = Object.entries(visits)
      .filter(([d, v]) => !known.has(d) && v.n > 0)
      .sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)
      .slice(0, 4)
      .map(([d]) => {
        const name = d.replace(/\.(com|ng|org|net|app|io|co)(\.ng)?$/, "").replace(/^./, (c) => c.toUpperCase());
        return { name: { en: name, pcm: name, yo: name, ha: name, ig: name }, domain: d, goal: `Open ${d}`, Icon: Globe, from: "#7aa7ff", to: "#3d6fe0" } as Site;
      });
    const ranked = SITES.map((s, i) => ({ s, i })).sort((a, b) => score(b.s.domain) - score(a.s.domain) || a.i - b.i).map((x) => x.s);
    // her extra sites take the places of the least-used defaults, so the grid keeps its size
    return [...ranked.slice(0, ranked.length - extra.length), ...extra].sort((a, b) => score(b.domain) - score(a.domain));
  }, [visits]);
}

/** opening a shortcut counts as a visit */
export function openSite(s: Site) {
  if (s.domain) useApp.getState().visit(s.domain);
  ask(s.goal);
}

export const STARTERS: Record<"guide" | "do", L[]> = {
  do: [
    { en: "Register me for the Skills Fair", pcm: "Register me for the Skills Fair", yo: "Forúkọ mi sílẹ̀ fún Skills Fair", ha: "Yi mani rajista don Skills Fair", ig: "Debanye m aha maka Skills Fair" },
    { en: "Is this bank message real?", pcm: "This bank message na real?", yo: "Ṣé ọ̀rọ̀ báǹkì yìí jẹ́ òótọ́?", ha: "Shin wannan saƙon banki gaskiya ne?", ig: "Ozi ụlọ akụ a ọ bụ eziokwu?" },
    { en: "Find free courses with certificates and write it up", pcm: "Find free courses wey get certificate, write am down", yo: "Wá àwọn ẹ̀kọ́ ọ̀fẹ́ tó ní ìwé-ẹ̀rí kí o kọ ọ́ sílẹ̀", ha: "Nemo kwasa-kwasai kyauta masu takardar shaida ka rubuta", ig: "Chọta ọmụmụ ihe n'efu nwere asambodo ma dee ya" },
  ],
  guide: [
    { en: "Show me how to check my JAMB result", pcm: "Show me how to check my JAMB result", yo: "Fi bí mo ṣe lè wo èsì JAMB mi hàn mí", ha: "Nuna mini yadda zan duba sakamakon JAMB dina", ig: "Gosi m otu m ga-esi lelee nsonaazụ JAMB m" },
    { en: "Teach me to open a Gmail account", pcm: "Teach me how to open Gmail account", yo: "Kọ́ mi bí mo ṣe lè ṣí àkáǹtì Gmail", ha: "Koya mini yadda zan buɗe asusun Gmail", ig: "Kụzie m otu m ga-esi mepee akaụntụ Gmail" },
    { en: "Read this letter and explain it to me", pcm: "Read this letter, explain am for me", yo: "Ka lẹ́tà yìí kí o ṣàlàyé rẹ̀ fún mi", ha: "Karanta wannan wasiƙar ka bayyana mini", ig: "Gụọ akwụkwọ ozi a ma kọwaara m ya" },
  ],
};
const EDIT: L = { en: "Edit suggestions", pcm: "Change suggestions", yo: "Ṣàtúnṣe àbá", ha: "Gyara shawarwari", ig: "Dezie ntụnye" };
const SAVE: L = { en: "Done", pcm: "Done", yo: "Ó ti parí", ha: "An gama", ig: "Emechaala" };
const RESET: L = { en: "Use the defaults", pcm: "Use the default ones", yo: "Lo àwọn àkọ́kọ́", ha: "Yi amfani da na asali", ig: "Jiri nke mbụ" };

export function Starters({ lang, align = "center" }: { lang: Lang; align?: "center" | "start" }) {
  const mode = useApp((s) => s.mode);
  const mine = useApp((s) => s.starters?.[mode]) ?? ["", "", ""];
  const setStarter = useApp((s) => s.setStarter);
  const [edit, setEdit] = useState(false);
  const list = STARTERS[mode].map((d, i) => mine[i]?.trim() || d[lang]);
  return (
    <div className={`relative flex w-full items-center gap-2 max-md:no-scrollbar max-md:-mx-4 max-md:w-[calc(100%+2rem)] max-md:overflow-x-auto max-md:px-4 md:flex-wrap ${align === "center" ? "md:justify-center" : ""}`}>
      {list.map((t) => (
        <button key={t} onClick={() => ask(t)} className="shrink-0 whitespace-nowrap rounded-full bg-white/60 px-4 py-2 md:max-w-full md:truncate text-[14px] text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,.9),0_4px_12px_-8px_rgba(10,30,70,.35)] ring-1 ring-black/5 backdrop-blur-md transition hover:bg-white/85 active:scale-[.97] dark:bg-white/10">
          {t}
        </button>
      ))}
      <button onClick={() => setEdit(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-white/50" aria-label={EDIT[lang]} title={EDIT[lang]}>
        <PencilSimple size={16} />
      </button>
      <AnimatePresence>
        {edit && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed left-1/2 top-[18%] z-[60] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 md:absolute md:top-full md:mt-2 rounded-[24px] bg-white/95 p-4 shadow-[0_24px_60px_-24px_rgba(10,30,70,.5)] ring-1 ring-black/5 backdrop-blur-xl dark:bg-[#23262d]"
          >
            <div className="flex items-center justify-between">
              <p className="font-head text-[17px] text-ink">{EDIT[lang]}</p>
              <button onClick={() => setEdit(false)} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-black/5" aria-label="Close">
                <X size={14} weight="bold" />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  value={mine[i] ?? ""}
                  placeholder={STARTERS[mode][i][lang]}
                  onChange={(e) => setStarter(mode, i, e.target.value)}
                  maxLength={90}
                  className="h-11 rounded-[14px] bg-black/5 px-3.5 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:bg-white focus:shadow-[inset_0_0_0_2px_var(--color-accent)] dark:bg-white/10"
                />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button onClick={() => [0, 1, 2].forEach((i) => setStarter(mode, i, ""))} className="text-[14px] font-semibold text-ink-2 hover:text-ink">
                {RESET[lang]}
              </button>
              <button onClick={() => setEdit(false)} className="btn btn-ink h-10 px-5 text-[14.5px]">
                {SAVE[lang]}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
