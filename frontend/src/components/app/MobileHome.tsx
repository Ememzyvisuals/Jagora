"use client";

/* Phone home: sky behind everything, liquid glass on top. Orb, the living "Jagora" wordmark, the ask bar,
   site shortcuts, the Discover feed, and the glass bottom bar with the orb in the middle. */
import {
  ArrowRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  DotsThree,
  GraduationCap,
  House,
  IdentificationCard,
  MagnifyingGlass,
  Newspaper,
  ShoppingBag,
  Certificate,
  User,
  EnvelopeSimple,
  Briefcase,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState, type ComponentType } from "react";
import { ask, quick } from "@/lib/engine";
import { LANGS, type Lang } from "@/lib/i18n";
import { activeTask, useApp } from "@/lib/store";
import { useSpeakingPulse } from "@/lib/voice";
import { CloudWordmark } from "../glass/CloudWordmark";
import { Glass } from "../glass/Glass";
import { Orb } from "../Orb";

type L = Record<Lang, string>;

const TAGLINE: L = {
  en: "Say it in your language. Jagora does the rest.",
  pcm: "Talk am for your language. Jagora go do the rest.",
  yo: "Ẹ sọ ọ́ ní èdè yín. Jagora á ṣe ìyókù.",
  ha: "Faɗa da harshenka. Jagora za ta yi sauran.",
  ig: "Kwuo ya n'asụsụ gị. Jagora ga-eme ndị ọzọ.",
};
const PLACEHOLDER: L = {
  en: "Ask Jagora or type a web address",
  pcm: "Ask Jagora or type web address",
  yo: "Bi Jagora tàbí kọ àdírẹ́sì",
  ha: "Tambayi Jagora ko rubuta adireshi",
  ig: "Jụọ Jagora ma ọ bụ dee adreesị",
};
const DISCOVER: L = { en: "Discover", pcm: "Discover", yo: "Ṣàwárí", ha: "Gano", ig: "Chọpụta" };
const NAV: Record<"back" | "fwd" | "tabs" | "home", L> = {
  back: { en: "Back", pcm: "Back", yo: "Ẹ̀yìn", ha: "Baya", ig: "Azụ" },
  fwd: { en: "Forward", pcm: "Front", yo: "Iwájú", ha: "Gaba", ig: "N'ihu" },
  tabs: { en: "Tabs", pcm: "Tabs", yo: "Táàbù", ha: "Shafuka", ig: "Taabụ" },
  home: { en: "Home", pcm: "Home", yo: "Ilé", ha: "Gida", ig: "Ụlọ" },
};

type Site = { name: L; goal: string; Icon: ComponentType<{ size?: number; weight?: "fill" }>; from: string; to: string };
const l = (en: string, yo: string, ha: string, ig: string, pcm = en): L => ({ en, yo, ha, ig, pcm });
export const SITES: Site[] = [
  { name: l("Search", "Wá nǹkan", "Bincike", "Chọọ"), goal: "Open google.com", Icon: MagnifyingGlass, from: "#5aa2ff", to: "#2b6fe8" },
  { name: l("Exams", "Ìdánwò", "Jarrabawa", "Ule"), goal: "Open jamb.gov.ng", Icon: GraduationCap, from: "#3fcf86", to: "#14965a" },
  { name: l("ID card", "Ìdánimọ̀", "Shaida", "Njirimara"), goal: "Open nimc.gov.ng", Icon: IdentificationCard, from: "#9d8cff", to: "#6a4fe0" },
  { name: l("News", "Ìròyìn", "Labarai", "Akụkọ"), goal: "Open bbc.com/yoruba", Icon: Newspaper, from: "#ff7a6b", to: "#e2412f" },
  { name: l("Results", "Èsì", "Sakamako", "Nsonaazụ"), goal: "Open waecdirect.org", Icon: Certificate, from: "#ffb54d", to: "#ef8a12" },
  { name: l("Shop", "Ọjà", "Kasuwa", "Ahịa"), goal: "Open jumia.com.ng", Icon: ShoppingBag, from: "#ff8fc0", to: "#e2508f" },
  { name: l("Jobs", "Iṣẹ́", "Ayyuka", "Ọrụ"), goal: "Find jobs in Lagos", Icon: Briefcase, from: "#58c7d8", to: "#1f93a8" },
  { name: l("Mail", "Lẹ́tà", "Wasiƙa", "Ozi"), goal: "Open gmail.com", Icon: EnvelopeSimple, from: "#7aa8ff", to: "#4a6fe0" },
];

const CARDS: { id: "register" | "scam" | "paper"; thumb: string; source: string; when: L; title: L }[] = [
  {
    id: "register",
    thumb: "/thumbs/skills-fair.webp",
    source: "Naija Skills Fair",
    when: l("2 minutes", "Ìṣẹ́jú 2", "Minti 2", "Nkeji 2"),
    title: l(
      "Skills Fair 2026: register for free training",
      "Skills Fair 2026: forúkọ sílẹ̀ fún ẹ̀kọ́ ọ̀fẹ́",
      "Skills Fair 2026: yi rajista don horo kyauta",
      "Skills Fair 2026: debanye aha maka ọzụzụ n'efu",
      "Skills Fair 2026: register for free training",
    ),
  },
  {
    id: "scam",
    thumb: "/thumbs/sms.webp",
    source: "Bank alerts",
    when: l("Seconds", "Ìṣẹ́jú àáyá", "Dakiku", "Sekọnd"),
    title: l(
      "They say your account is blocked? Let Jagora check it",
      "Ṣé wọ́n ní àkáǹtì yín ti dí? Ẹ jẹ́ kí Jagora yẹ̀ ẹ́ wò",
      "Sun ce an toshe asusunka? Bari Jagora ta duba",
      "Ha sị na e mechiri akaụntụ gị? Ka Jagora lelee ya",
      "Dem say dem block your account? Make Jagora check am",
    ),
  },
  {
    id: "paper",
    thumb: "/thumbs/letter.webp",
    source: "Water bill",
    when: l("1 minute", "Ìṣẹ́jú 1", "Minti 1", "Nkeji 1"),
    title: l(
      "A bill or letter you can't read? Jagora reads it to you",
      "Ìwé owó tàbí lẹ́tà tí ẹ kò lè kà? Jagora máa kà á fún yín",
      "Takarda ko wasiƙa da ba ka iya karantawa? Jagora za ta karanta maka",
      "Akwụkwọ ị na-apụghị ịgụ? Jagora ga-agụrụ gị ya",
      "Bill or letter wey you no fit read? Jagora go read am for you",
    ),
  },
];

function Flag({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 30 30" width={size} height={size} aria-hidden="true" className="shrink-0 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
      <clipPath id="ngflag">
        <circle cx="15" cy="15" r="15" />
      </clipPath>
      <g clipPath="url(#ngflag)">
        <rect width="10" height="30" fill="#0a8a4f" />
        <rect x="10" width="10" height="30" fill="#fff" />
        <rect x="20" width="10" height="30" fill="#0a8a4f" />
      </g>
    </svg>
  );
}

/** Jagora's voice mark: five soft bars, not a microphone. */
export function VoiceBars({ size = 22, color = "#E07A1F" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {[4, 8, 12, 16, 20].map((x, i) => {
        const h = [6, 12, 16, 11, 7][i];
        return <rect key={x} x={x - 1.1} y={12 - h / 2} width="2.2" height={h} rx="1.1" fill={color} />;
      })}
    </svg>
  );
}

export function AppIcon({ site, size = 46 }: { site: Site; size?: number }) {
  const { Icon, from, to } = site;
  return (
    <span
      className="relative grid place-items-center overflow-hidden text-white"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: `linear-gradient(160deg, ${from}, ${to})`,
        boxShadow: `inset 0 1px 1px rgba(255,255,255,.6), inset 0 -2px 4px rgba(0,0,0,.12), 0 6px 14px -6px ${to}`,
      }}
    >
      <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
      <Icon size={size * 0.52} weight="fill" />
    </span>
  );
}

export function Home({ onOpen }: { onOpen: (id: string) => void }) {
  void onOpen;
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const setSheet = useApp((s) => s.setSheet);
  const setActive = useApp((s) => s.setActive);
  const orb = useApp((s) => s.orb);
  const pulse = useSpeakingPulse(orb === "speaking");
  const [page, setPage] = useState(0);
  const [langOpen, setLangOpen] = useState(false);
  const [text, setText] = useState("");

  const run = (id: "register" | "scam" | "paper") => {
    if (id === "register") ask(lang === "yo" ? "Forúkọ mi sílẹ̀ fún Skills Fair" : "Register me for the Skills Fair");
    else quick(id);
  };
  const send = () => {
    const q = text.trim();
    if (!q) return (setActive(null), setSheet(true));
    ask(q);
    setText("");
  };

  return (
    <div className="relative h-full">
      {/* the sky */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url(/sky/hero-desktop.webp), linear-gradient(180deg,#5ea9ec 0%,#8cc4f2 38%,#cfe6f8 70%,#eef6fc 100%)",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundBlendMode: "multiply",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent via-white/35 to-white/75" />

      <div className="no-scrollbar relative h-full overflow-y-auto pb-36">
        {/* top row */}
        <div className="flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
          <div className="relative">
            <Glass radius={22} bezel={12} refraction={30} pressable className="cursor-pointer" onClick={() => setLangOpen((v) => !v)}>
              <span className="flex h-11 items-center gap-2 px-3">
                <Flag />
                <span className="text-[15px] font-semibold text-ink">{LANGS.find((x) => x.id === lang)?.native}</span>
                <CaretDown size={13} weight="bold" className="text-ink-2" />
              </span>
            </Glass>
            {langOpen && (
              <Glass radius={22} bezel={14} tint="rgba(255,255,255,.55)" className="absolute left-0 top-[52px] z-50 w-52 p-1.5">
                <ul>
                  {LANGS.map((x) => (
                    <li key={x.id}>
                      <button
                        onClick={() => (setLang(x.id), setLangOpen(false))}
                        className={`w-full rounded-[16px] px-3 py-2.5 text-left text-[15.5px] font-medium transition ${x.id === lang ? "bg-white/80 text-ink" : "text-ink-2 hover:bg-white/50"}`}
                      >
                        {x.native}
                        <span className="ml-2 text-[13px] text-ink-3">{x.hello}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Glass>
            )}
          </div>
          <Link href="/app/details" aria-label="My details">
            <Glass radius={22} bezel={12} refraction={30} pressable>
              <span className="grid h-11 w-11 place-items-center text-ink">
                <User size={20} />
              </span>
            </Glass>
          </Link>
        </div>

        {/* orb and wordmark */}
        <div className="mt-2 flex flex-col items-center">
          <button onClick={() => (setActive(null), setSheet(true))} aria-label="Talk to Jagora" className="transition active:scale-95">
            <Orb size={96} state={orb} levelRef={pulse} />
          </button>
          <CloudWordmark width={278} levelRef={pulse} className="-mt-3" />
          <p className="-mt-1 px-8 text-center text-[15px] font-medium text-ink-2">{TAGLINE[lang]}</p>
        </div>

        {/* ask bar */}
        <form onSubmit={(e) => (e.preventDefault(), send())} className="mx-4 mt-5">
          <Glass radius={30} bezel={18} refraction={40} tint="rgba(255,255,255,.5)">
            <span className="flex h-[58px] items-center gap-3 pl-5 pr-2">
              <VoiceBars />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => setLangOpen(false)}
                placeholder={PLACEHOLDER[lang]}
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
              />
              <button type="submit" aria-label="Go" className="grid h-[42px] w-[42px] place-items-center rounded-full bg-[#5b6472] text-white shadow-[inset_0_1px_1px_rgba(255,255,255,.35)] transition active:scale-90">
                <ArrowRight size={18} weight="bold" />
              </button>
            </span>
          </Glass>
        </form>

        {/* shortcuts */}
        <div className="mt-5 overflow-hidden">
          <div className="flex transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]" style={{ transform: `translateX(-${page * 100}%)` }}>
            {[0, 1].map((p) => (
              <div key={p} className="grid w-full shrink-0 grid-cols-4 gap-2.5 px-4">
                {SITES.slice(p * 4, p * 4 + 4).map((s) => (
                  <Glass key={s.goal} radius={22} bezel={14} refraction={28} pressable className="cursor-pointer" onClick={() => ask(s.goal)}>
                    <span className="flex flex-col items-center gap-1.5 pb-2.5 pt-3">
                      <AppIcon site={s} />
                      <span className="max-w-full truncate px-1 text-[12px] font-medium text-ink-2">{s.name[lang]}</span>
                    </span>
                  </Glass>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-center gap-1.5">
            {[0, 1].map((p) => (
              <button key={p} onClick={() => setPage(p)} aria-label={`Shortcuts ${p + 1}`} className={`h-[7px] rounded-full transition-all duration-300 ${page === p ? "w-[7px] bg-accent" : "w-[7px] bg-ink/20"}`} />
            ))}
          </div>
        </div>

        {/* discover */}
        <section className="mt-5 px-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[20px] font-bold text-ink">{DISCOVER[lang]}</h2>
            <CaretRight size={18} weight="bold" className="text-ink-2" />
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            {CARDS.map((c) => (
              <Glass key={c.id} radius={22} bezel={14} refraction={26} tint="rgba(255,255,255,.55)" pressable className="cursor-pointer" onClick={() => run(c.id)}>
                <span className="flex gap-3 p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.thumb} alt="" className="h-[80px] w-[96px] shrink-0 rounded-[14px] object-cover shadow-[0_4px_10px_-6px_rgba(0,0,0,.35)]" />
                  <span className="flex min-w-0 flex-1 flex-col py-0.5">
                    <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{c.title[lang]}</span>
                    <span className="mt-auto flex items-center gap-1.5 text-[12.5px] text-ink-3">
                      <span className="truncate">{c.source}</span>
                      <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-ink-3/60" />
                      <span className="shrink-0">{c.when[lang]}</span>
                      <DotsThree size={20} weight="bold" className="ml-auto shrink-0 text-ink-2" />
                    </span>
                  </span>
                </span>
              </Glass>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function TabsGlyph({ count }: { count: number }) {
  return (
    <span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] border-[1.8px] border-current text-[11px] font-bold leading-none">{count}</span>
  );
}

export function BottomBar({ screen, setScreen }: { screen: "home" | "page" | "tabs"; setScreen: (s: "home" | "page" | "tabs") => void }) {
  const lang = useApp((s) => s.lang);
  const sheet = useApp((s) => s.sheetOpen);
  const setSheet = useApp((s) => s.setSheet);
  const orb = useApp((s) => s.orb);
  const count = useApp((s) => s.tasks.length);
  const task = useApp(activeTask);
  const pulse = useSpeakingPulse(orb === "speaking");
  const item = "flex w-[58px] flex-col items-center gap-1 text-ink-2 transition active:scale-90 disabled:opacity-35";
  return (
    <div className="absolute inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-40">
      <Glass radius={32} bezel={20} refraction={44} blur={14} tint="rgba(255,255,255,.74)">
        <nav className="flex h-[70px] items-center justify-around px-1">
          <button className={item} disabled={screen === "home"} onClick={() => setScreen("home")}>
            <CaretLeft size={22} />
            <span className="text-[11px] font-medium">{NAV.back[lang]}</span>
          </button>
          <button className={item} disabled={!task || task.kind !== "browse" || screen === "page"} onClick={() => setScreen("page")}>
            <CaretRight size={22} />
            <span className="text-[11px] font-medium">{NAV.fwd[lang]}</span>
          </button>
          <button onClick={() => setSheet(!sheet)} className={`-mt-1 transition active:scale-90 ${sheet ? "opacity-0" : ""}`} aria-label="Talk to Jagora">
            <Orb size={62} state={orb} levelRef={pulse} />
          </button>
          <button className={item} onClick={() => setScreen("tabs")} aria-label={`Tabs, ${count} open`}>
            <TabsGlyph count={count} />
            <span className="text-[11px] font-medium">{NAV.tabs[lang]}</span>
          </button>
          <button className={item} onClick={() => setScreen("home")}>
            <House size={22} />
            <span className="text-[11px] font-medium">{NAV.home[lang]}</span>
          </button>
        </nav>
      </Glass>
    </div>
  );
}
