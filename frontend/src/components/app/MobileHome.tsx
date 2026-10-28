"use client";

/* Phone home: sky behind everything, liquid glass on top. Orb, the living "Jagora" wordmark, the ask bar,
   site shortcuts, the Discover feed, and the glass bottom bar with the orb in the middle. */
import {
  PaperPlaneRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  GameController,
  Info,
  DotsThree,
  DotsThreeVertical,
  Moon,
  Sun,
  GraduationCap,
  House,
  List,
  IdentificationCard,
  MagnifyingGlass,
  Newspaper,
  ShoppingBag,
  Certificate,
  User,
  CornersOut,
  ArrowClockwise,
  ChatCircleText,
  Play,
  SpeakerHigh,
  LockSimple,
} from "@phosphor-icons/react";
import { fly } from "../Effects";
import { Starters, openSite, useTopSites } from "./NewTabBits";
import { startPageWars } from "../PageWars";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { Avatar, AvatarPicker } from "../Avatar";
import { remoteInput } from "@/lib/engine/remote";
import { useEffect, useState, type ComponentType } from "react";
import { ask, live, quick } from "@/lib/engine";
import { LANGS, type Lang } from "@/lib/i18n";
import { activeTask, isTab, useApp } from "@/lib/store";
import { ago } from "@/lib/hooks";
import { useSpeakingPulse } from "@/lib/voice";
import { CloudWordmark } from "../glass/CloudWordmark";
import { siFacebook, siGmail, siGoogle, siInstagram, siTiktok, siWhatsapp, siX, siYoutube } from "simple-icons";
import { canFullscreen, toggleFullscreen } from "../Pwa";
import { LiveButton } from "../LiveMode";
import { CLOSE_L, DiscoverStack, deal } from "./DiscoverStack";
import { toggleTheme, useTheme } from "@/lib/theme";
import { Glass } from "../glass/Glass";
import { PAGE_PILL, PILL } from "@/lib/glassRegistry";
import { Bounce, Orb } from "../Orb";
import { jagoraLevel, micLevel, startHandsFree, stopHandsFree, throughLiveKit, useHandsFree } from "@/lib/handsfree";

type L = Record<Lang, string>;

export const TAGLINE: L = {
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
export const DISCOVER: L = { en: "Discover", pcm: "Discover", yo: "Ṣàwárí", ha: "Gano", ig: "Chọpụta" };
export const THEME_L: Record<"dark" | "light", L> = {
  dark: { en: "Dark mode", pcm: "Dark mode", yo: "Ìrísí òkùnkùn", ha: "Yanayin duhu", ig: "Ọnọdụ ọchịchịrị" },
  light: { en: "Light mode", pcm: "Light mode", yo: "Ìrísí ìmọ́lẹ̀", ha: "Yanayin haske", ig: "Ọnọdụ ìhè" },
};

const NAV: Record<"back" | "fwd" | "tabs" | "home", L> = {
  back: { en: "Back", pcm: "Back", yo: "Ẹ̀yìn", ha: "Baya", ig: "Azụ" },
  fwd: { en: "Forward", pcm: "Front", yo: "Iwájú", ha: "Gaba", ig: "N'ihu" },
  tabs: { en: "Tabs", pcm: "Tabs", yo: "Táàbù", ha: "Shafuka", ig: "Taabụ" },
  home: { en: "Home", pcm: "Home", yo: "Ilé", ha: "Gida", ig: "Ụlọ" },
};

type Brand = { path: string; fg: string; bg: string };
type Site = { name: L; domain?: string; brand?: Brand; goal: string; Icon: ComponentType<{ size?: number; weight?: "fill" }>; from: string; to: string };
const l = (en: string, yo: string, ha: string, ig: string, pcm = en): L => ({ en, yo, ha, ig, pcm });
const IG = "linear-gradient(45deg,#feda75 0%,#fa7e1e 25%,#d62976 50%,#962fbf 75%,#4f5bd5 100%)";
// real brand marks (simple-icons, CC0) for the big platforms; Nigerian sites use their own site icon
export const SITES: Site[] = [
  { name: l("Google", "Google", "Google", "Google"), domain: "google.com", brand: { path: siGoogle.path, fg: "#4285F4", bg: "#ffffff" }, goal: "Open google.com", Icon: MagnifyingGlass, from: "#5aa2ff", to: "#2b6fe8" },
  { name: l("WhatsApp", "WhatsApp", "WhatsApp", "WhatsApp"), domain: "web.whatsapp.com", brand: { path: siWhatsapp.path, fg: "#ffffff", bg: "#25D366" }, goal: "Open WhatsApp Web", Icon: ChatCircleText, from: "#3ddc84", to: "#1ea952" },
  { name: l("Facebook", "Facebook", "Facebook", "Facebook"), domain: "facebook.com", brand: { path: siFacebook.path, fg: "#ffffff", bg: "#0866FF" }, goal: "Open facebook.com", Icon: ChatCircleText, from: "#4f8dff", to: "#1b5fe0" },
  { name: l("Instagram", "Instagram", "Instagram", "Instagram"), domain: "instagram.com", brand: { path: siInstagram.path, fg: "#ffffff", bg: IG }, goal: "Open instagram.com", Icon: Play, from: "#d62976", to: "#962fbf" },
  { name: l("YouTube", "YouTube", "YouTube", "YouTube"), domain: "youtube.com", brand: { path: siYoutube.path, fg: "#ffffff", bg: "#FF0000" }, goal: "Open youtube.com", Icon: Play, from: "#ff6b6b", to: "#e02424" },
  { name: l("X", "X", "X", "X"), domain: "x.com", brand: { path: siX.path, fg: "#ffffff", bg: "#000000" }, goal: "Open x.com", Icon: ChatCircleText, from: "#333", to: "#000" },
  { name: l("TikTok", "TikTok", "TikTok", "TikTok"), domain: "tiktok.com", brand: { path: siTiktok.path, fg: "#ffffff", bg: "#000000" }, goal: "Open tiktok.com", Icon: Play, from: "#333", to: "#000" },
  { name: l("Gmail", "Gmail", "Gmail", "Gmail"), domain: "mail.google.com", brand: { path: siGmail.path, fg: "#EA4335", bg: "#ffffff" }, goal: "Open Gmail", Icon: ChatCircleText, from: "#ff7a6b", to: "#e2412f" },
  { name: l("BBC News", "BBC Yorùbá", "BBC Hausa", "BBC Igbo", "BBC Pidgin"), domain: "bbc.com", goal: "Open BBC news in my language", Icon: Newspaper, from: "#5b5b66", to: "#1d1d22" },
  { name: l("JAMB", "JAMB", "JAMB", "JAMB"), domain: "jamb.gov.ng", goal: "Open jamb.gov.ng", Icon: GraduationCap, from: "#3fcf86", to: "#14965a" },
  { name: l("NIMC", "NIMC", "NIMC", "NIMC"), domain: "nimc.gov.ng", goal: "Open nimc.gov.ng", Icon: IdentificationCard, from: "#36b37e", to: "#0e7a4f" },
  { name: l("Jumia", "Jumia", "Jumia", "Jumia"), domain: "jumia.com.ng", goal: "Open jumia.com.ng", Icon: ShoppingBag, from: "#ffae4d", to: "#f08a12" },
];

export const CARDS: { id: "register" | "scam" | "paper"; thumb: string; source: string; when: L; title: L }[] = [
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

const ASK_SHORT = { en: "Ask Jagora", pcm: "Ask Jagora", yo: "Bi Jagora", ha: "Tambayi Jagora", ig: "Jụọ Jagora" } as const;

/** her chat history (the menu); MobileApp shows it */
export const openHistory = () => dispatchEvent(new CustomEvent("jagora:app", { detail: { action: "show_history", value: "" } }));
export const CHATS = { en: "Chats", pcm: "Chats", yo: "Àwọn ìjíròrò", ha: "Hirarraki", ig: "Mkparịta ụka" } as const;

export type NewsItem = { title: string; link: string; image: string | null; date: string | null; source: string };

/** Real headlines in her language (BBC Yorùbá / Hausa / Igbo / Pidgin / Africa), via /api/news. */
export function useNews(lang: Lang) {
  const [news, setNews] = useState<NewsItem[]>([]);
  useEffect(() => {
    let on = true;
    fetch(`/api/news?lang=${lang}`)
      .then((r) => r.json())
      .then((d) => on && setNews(d.items ?? []))
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [lang]);
  return news;
}

export function Flag({ size = 22 }: { size?: number }) {
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
export function VoiceBars({ size = 22, color = "#1D63ED" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {[4, 8, 12, 16, 20].map((x, i) => {
        const h = [6, 12, 16, 11, 7][i];
        return <rect key={x} x={x - 1.1} y={12 - h / 2} width="2.2" height={h} rx="1.1" fill={color} />;
      })}
    </svg>
  );
}

/** real brand logos (official artwork rendered to PNG, in /logos); Nigerian sites use their own site icon */
const LOGO: Record<string, { src: string; fill?: boolean }> = {
  "google.com": { src: "/logos/google.png" },
  "web.whatsapp.com": { src: "/logos/whatsapp.png" },
  "facebook.com": { src: "/logos/facebook.png" },
  "instagram.com": { src: "/logos/instagram.png", fill: true },
  "youtube.com": { src: "/logos/youtube.png" },
  "x.com": { src: "/logos/x.png" },
  "tiktok.com": { src: "/logos/tiktok.png" },
  "mail.google.com": { src: "/logos/gmail.png" },
};
const TILE = { boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06), 0 6px 14px -8px rgba(10,30,70,.35)" };

export function AppIcon({ site, size = 46 }: { site: Site; size?: number }) {
  const { Icon, from, to, domain } = site;
  const [failed, setFailed] = useState(!domain);
  const logo = domain ? LOGO[domain] : undefined;
  // real logos as they are, with no box behind them (the Instagram logo is its own rounded square)
  const lift = { filter: "drop-shadow(0 6px 10px rgba(10,30,70,.22))" };
  if (logo)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo.src}
        alt=""
        draggable={false}
        style={logo.fill ? { width: size, height: size, borderRadius: size * 0.26, ...lift } : { width: size * 0.9, height: size * 0.9, margin: size * 0.05, objectFit: "contain", ...lift }}
      />
    );
  if (!failed && domain)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        onLoad={(e) => e.currentTarget.naturalWidth <= 16 && setFailed(true)}
        style={{ width: size * 0.84, height: size * 0.84, margin: size * 0.08, objectFit: "contain", ...lift }}
      />
    );
  return (
    <span
      className="relative grid place-items-center overflow-hidden text-snow"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        background: `linear-gradient(160deg, ${from}, ${to})`,
        boxShadow: `inset 0 1px 1px rgba(255,255,255,.6), inset 0 -2px 4px rgba(0,0,0,.12), 0 6px 14px -6px ${to}`,
      }}
    >
      <Icon size={size * 0.52} weight="fill" />
    </span>
  );
}

export function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const top = useTopSites();
  void onOpen;
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const setSheet = useApp((s) => s.setSheet);
  const setActive = useApp((s) => s.setActive);
  const orb = useApp((s) => s.orb);
  const pulse = useSpeakingPulse(orb === "speaking");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [text, setText] = useState("");
  const [canFull, setCanFull] = useState(false);
  const [news, setNews] = useState<{ title: string; link: string; image: string | null; date: string | null; source: string }[]>([]);
  useEffect(() => {
    let on = true;
    fetch(`/api/news?lang=${lang}`)
      .then((r) => r.json())
      .then((d) => on && setNews(d.items ?? []))
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [lang]);
  useEffect(() => setCanFull(canFullscreen()), []);

  const run = (id: "register" | "scam" | "paper") => {
    if (id === "register") ask(lang === "yo" ? "Forúkọ mi sílẹ̀ fún Skills Fair" : "Register me for the Skills Fair");
    else quick(id);
  };
  const send = () => {
    const q = text.trim();
    if (!q) return (setActive(null), setSheet(true));
    fly(document.querySelector('[data-tour="ask"] button[type="submit"]'));
    ask(q);
    setText("");
  };

  return (
    <div className="relative h-full">
      <div
        className="no-scrollbar relative h-full overflow-y-auto pb-36"
        onScroll={(e) => {
          const y = e.currentTarget.scrollTop;
          const prev = Number(e.currentTarget.dataset.y || 0);
          if (Math.abs(y - prev) > 8) {
            dispatchEvent(new CustomEvent("jagora:scroll", { detail: { down: y > prev && y > 60 } }));
            e.currentTarget.dataset.y = String(y);
          }
        }}
      >
        {/* top row */}
        <div className="flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
          <div className="relative flex items-center gap-2">
            {/* her chats, like ChatGPT's menu (History.tsx) */}
            <Glass radius={22} bezel={12} refraction={30} pressable className="cursor-pointer" onClick={openHistory}>
              <span className="grid h-11 w-11 place-items-center text-ink" role="button" aria-label={CHATS[lang]}>
                <List size={21} weight="bold" />
              </span>
            </Glass>
            <Glass radius={22} bezel={12} refraction={30} pressable className="cursor-pointer" onClick={() => setLangOpen((v) => !v)} data-tour="lang">
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
          <div className="flex items-center gap-2">
          {canFull && (
            <Glass radius={22} bezel={12} refraction={30} pressable className="cursor-pointer" onClick={() => void toggleFullscreen()}>
              <span className="grid h-11 w-11 place-items-center text-ink" aria-label="Full screen">
                <CornersOut size={20} />
              </span>
            </Glass>
          )}
          <ProfileMenu canFull={false} />
          </div>
        </div>

        {/* the orb, big and alive, and the word */}
        <div className="flex flex-col items-center">
          <button onClick={() => (setActive(null), setSheet(true), useApp.getState().setLive(true))} aria-label="Talk to Jagora" data-tour="orb" className="-mt-1 transition active:scale-95">
            <Orb size={168} state={orb} levelRef={pulse} />
          </button>
          <CloudWordmark width={270} levelRef={pulse} className="-mt-7" />
          <p className="-mt-1 px-8 text-center text-[16px] font-bold text-snow [text-shadow:0_1px_3px_rgba(5,30,80,.55),0_2px_14px_rgba(5,30,80,.6)]">{TAGLINE[lang]}</p>
        </div>

        {/* ask bar */}
        <form onSubmit={(e) => (e.preventDefault(), send())} className="mx-4 mt-5" data-tour="ask">
          <Glass radius={30} bezel={18} refraction={40} tint="rgba(255,255,255,.5)" lens={PILL} lensTint={0.14}>
            <span className="flex h-[58px] items-center gap-3 pl-5 pr-2">
              <VoiceBars />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => setLangOpen(false)}
                placeholder={PLACEHOLDER[lang]}
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink-2"
              />
              {text.trim() ? (
                <button type="submit" aria-label="Go" className="grid h-[42px] w-[42px] place-items-center rounded-full bg-ink text-paper shadow-[inset_0_1px_1px_rgba(255,255,255,.25)] transition active:scale-90">
                  <PaperPlaneRight size={18} weight="fill" />
                </button>
              ) : (
                <LiveButton compact />
              )}
            </span>
          </Glass>
        </form>
        <div className="mx-4 mt-3">
          <Starters lang={lang} />
        </div>

        {/* shortcuts */}
        <div className="mt-5 overflow-hidden">
          <div
            className="flex touch-pan-y transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
            style={{ transform: `translateX(-${page * 100}%)` }}
            onPointerDown={(e) => (e.currentTarget.dataset.x = String(e.clientX))}
            onPointerUp={(e) => {
              const dx = e.clientX - Number(e.currentTarget.dataset.x || e.clientX);
              if (dx < -40) setPage((p) => Math.min(2, p + 1));
              if (dx > 40) setPage((p) => Math.max(0, p - 1));
            }}
          >
            {[0, 1, 2].map((p) => (
              <div key={p} className="grid w-full shrink-0 grid-cols-4 gap-2.5 px-4">
                {top.slice(p * 4, p * 4 + 4).map((s) => (
                  <button key={s.goal} onClick={() => openSite(s)} className="flex flex-col items-center gap-1.5 rounded-[18px] py-1.5 transition active:scale-95" title={s.name[lang]}>
                    <AppIcon site={s} size={54} />
                    <span className="max-w-full truncate px-1 text-[13px] font-bold text-ink [text-shadow:0_0_8px_rgba(255,255,255,.95),0_0_2px_rgba(255,255,255,.9)] dark:[text-shadow:0_1px_8px_rgba(0,0,0,.7)]">{s.name[lang]}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-center gap-1.5">
            {[0, 1, 2].map((p) => (
              <button key={p} onClick={() => setPage(p)} aria-label={`Shortcuts ${p + 1}`} className={`h-[7px] rounded-full transition-all duration-300 ${page === p ? "w-[7px] bg-accent" : "w-[7px] bg-ink/20"}`} />
            ))}
          </div>
        </div>


        {/* Discover: the day's news, nothing else */}
        <section className="mt-6 px-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[22px] font-extrabold text-ink [text-shadow:0_0_10px_rgba(255,255,255,.95),0_0_2px_rgba(255,255,255,.9)] dark:[text-shadow:0_1px_10px_rgba(0,0,0,.75)]">{DISCOVER[lang]}</h2>
            {news.length > 4 && (
              <button onClick={() => setOpen((v) => !v)} className="rounded-full px-3 py-1.5 text-[14px] font-bold text-accent hover:bg-accent-soft">
                {open ? CLOSE_L[lang] : SEE_ALL[lang]}
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {news.length === 0
              ? [0, 1].map((i) => <div key={i} className="h-[124px] animate-pulse rounded-[22px] bg-white/50 dark:bg-white/5" />)
              : news.slice(0, open ? 12 : 4).map((n) => (
                  <FeedCard
                    key={n.link}
                    image={n.image}
                    title={n.title}
                    source={n.source}
                    when={n.date ? ago(Date.parse(n.date)) : ""}
                    listen
                    onOpen={() => ask(`Read this news story to me: ${n.title} ${n.link}`)}
                  />
                ))}
          </div>
        </section>

        {/* things to try with Jagora, under the news */}
        <section className="mt-7 px-4">
          <h2 className="px-1 text-[22px] font-extrabold text-ink [text-shadow:0_0_10px_rgba(255,255,255,.95),0_0_2px_rgba(255,255,255,.9)] dark:[text-shadow:0_1px_10px_rgba(0,0,0,.75)]">{TRY[lang]}</h2>
          <div className="mt-3 flex flex-col gap-3">
            {CARDS.map((c) => (
              <FeedCard key={c.id} image={c.thumb} title={c.title[lang]} source={c.source} when={c.when[lang]} onOpen={() => run(c.id)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const TRY: L = { en: "Try Jagora", pcm: "Try Jagora", yo: "Ẹ dán Jagora wò", ha: "Gwada Jagora", ig: "Nwalee Jagora" };
export const CHOOSE_AV: L = { en: "Choose avatar", pcm: "Pick avatar", yo: "Yan àwòrán", ha: "Zaɓi hoto", ig: "Họrọ onyinyo" };
const SEE_ALL: L = { en: "See all", pcm: "See all", yo: "Wo gbogbo rẹ̀", ha: "Duba duka", ig: "Lee ha niile" };

/** One story in the feed, shaped like the reference: picture on the left, bold title, then source and time. */
function FeedCard({ image, title, source, when, listen = false, onOpen }: { image: string | null; title: string; source: string; when: string; listen?: boolean; onOpen: () => void }) {
  return (
    <Glass radius={22} bezel={14} refraction={26} tint="rgba(255,255,255,.72)" pressable className="cursor-pointer" onClick={onOpen}>
    <span role="button" className="block p-3 text-left">
      <span className="flex gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" loading="lazy" className="h-[84px] w-[100px] shrink-0 rounded-[16px] object-cover object-left-top" />
        ) : (
          <span className="grid h-[84px] w-[100px] shrink-0 place-items-center rounded-[16px] bg-ink text-paper">
            <Newspaper size={28} weight="fill" />
          </span>
        )}
        <span className="line-clamp-3 min-w-0 flex-1 text-[15.5px] font-extrabold leading-snug text-ink">{title}</span>
      </span>
      <span className="mt-2.5 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        <span className="truncate">{source}</span>
        {when && <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-ink-3" />}
        {when && <span className="shrink-0 text-ink-3">{when}</span>}
        {listen ? <SpeakerHigh size={18} weight="fill" className="ml-auto shrink-0 text-accent" aria-label="Listen" /> : <DotsThreeVertical size={18} weight="bold" className="ml-auto shrink-0 text-ink-3" />}
      </span>
    </span>
    </Glass>
  );
}

/** Her profile button; its menu holds what the old "more" button held. */
function ProfileMenu({ canFull }: { canFull: boolean }) {
  const lang = useApp((s) => s.lang);
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const item = "flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left text-[15.5px] font-bold text-ink hover:bg-black/5 dark:hover:bg-white/10";
  return (
    <div className="relative">
      <Glass radius={22} bezel={12} refraction={30} pressable className="cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <span className="grid h-11 w-11 place-items-center" role="button" aria-label="My details and settings" aria-expanded={open}>
          <Avatar size={34} />
        </span>
      </Glass>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -6 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="absolute right-0 top-[52px] z-50 w-60 origin-top-right rounded-[22px] bg-white p-1.5 shadow-[0_20px_44px_-18px_rgba(10,25,60,.45)] ring-1 ring-black/5 dark:bg-[#23262d]"
            >
              <Link href="/app/details" className={item}>
                <User size={19} /> My details
              </Link>
              <button onClick={() => (setPick(true), setOpen(false))} className={item}>
                <Avatar size={20} /> {CHOOSE_AV[lang]}
              </button>
              <button onClick={() => (toggleTheme(), setOpen(false))} className={item}>
                {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />} {theme === "dark" ? THEME_L.light[lang] : THEME_L.dark[lang]}
              </button>
              {canFull && (
                <button onClick={() => (void toggleFullscreen(), setOpen(false))} className={item}>
                  <CornersOut size={19} /> Full screen
                </button>
              )}
              <button onClick={() => (startPageWars(), setOpen(false))} className={item}>
                <GameController size={19} /> Play Page Wars
              </button>
              <Link href="/about" className={item}>
                <Info size={19} /> About and credits
              </Link>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AvatarPicker open={pick} onClose={() => setPick(false)} />
    </div>
  );
}

function TabsGlyph({ count }: { count: number }) {
  return (
    <span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] border-[1.8px] border-current text-[11px] font-bold leading-none">{count}</span>
  );
}

/** The bottom bar, as in the reference: back, forward, Jagora's orb in the middle (tap to talk), tabs, home. On a
    website, back and forward move through that site's pages. */
export function BottomBar({ screen, setScreen }: { screen: "home" | "page" | "tabs"; setScreen: (s: "home" | "page" | "tabs") => void }) {
  const lang = useApp((s) => s.lang);
  const sheet = useApp((s) => s.sheetOpen);
  const setSheet = useApp((s) => s.setSheet);
  const orb = useApp((s) => s.orb);
  const count = useApp((s) => s.tasks.filter(isTab).length);
  const task = useApp(activeTask);
  const pulse = useSpeakingPulse(orb === "speaking");
  const handsFree = useHandsFree();
  const onPage = screen === "page" && task?.kind === "browse" && !!task.url;
  const canForward = !onPage && task?.kind === "browse" && !!task.url && isTab(task);
  const btn = "grid h-12 w-12 place-items-center rounded-full text-ink transition active:scale-90 disabled:opacity-25";
  return (
    <div className="absolute inset-x-0 bottom-[max(10px,env(safe-area-inset-bottom))] z-40 flex justify-center px-3">
      <Glass radius={30} bezel={16} refraction={36} blur={10} tint="rgba(255,255,255,.66)" lens={onPage ? PAGE_PILL : PILL} lensTint={onPage ? 0.62 : 0.38} overContent={!live} className="w-full max-w-[460px]">
      <nav className="flex h-[64px] items-center justify-around px-2">
        <button
          className={btn}
          disabled={!onPage}
          onClick={() => task && void remoteInput(task.id, { action: "back" })}
          aria-label={NAV.back[lang]}
        >
          <CaretLeft size={23} weight="bold" />
        </button>
        <button
          className={btn}
          disabled={!onPage && !canForward}
          onClick={() => (onPage && task ? void remoteInput(task.id, { action: "forward" }) : setScreen("page"))}
          aria-label={NAV.fwd[lang]}
        >
          <CaretRight size={23} weight="bold" />
        </button>
        {/* on the home screen the big orb is already there, so the bar shows it only elsewhere */}
        {screen !== "home" || sheet ? (
          <button
            onClick={() => {
              
              // the chat comes up and Live mode opens: Jagora listens only there, with End and mute in view
              if (!sheet) setSheet(true);
              if (handsFree) void stopHandsFree();
              useApp.getState().setLive(true);
            }}
            aria-label={handsFree ? "Stop listening" : "Talk to Jagora"}
            data-tour="orb"
            className="-my-2 shrink-0 transition active:scale-90"
          >
            <Bounce level={orb === "speaking" ? (throughLiveKit() ? jagoraLevel : pulse) : micLevel} amount={0.24}>
              <Orb size={62} state={orb} levelRef={orb === "speaking" ? (throughLiveKit() ? jagoraLevel : pulse) : micLevel} />
            </Bounce>
          </button>
        ) : null}
        <button
          className={`${btn} ${screen === "tabs" ? "bg-ink text-paper" : ""}`}
          onClick={() => setScreen("tabs")}
          aria-label={`${NAV.tabs[lang]}, ${count}`}
          aria-pressed={screen === "tabs"}
          data-tour="tabs"
        >
          <TabsGlyph count={count} />
        </button>
        <button className={btn} onClick={() => (setSheet(false), setScreen("home"))} aria-label={NAV.home[lang]}>
          <House size={23} weight={screen === "home" ? "fill" : "bold"} />
        </button>
      </nav>
      </Glass>
    </div>
  );
}

/** iOS-style soft blur where content slides under the bottom bar (none at the top: the sky stays sharp there). */
export function EdgeBlur() {
  const layer = (side: "top" | "bottom", h: number, blur: number) => (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 z-30 ${side === "top" ? "top-0" : "bottom-0"}`}
      style={{
        height: h,
        backdropFilter: `blur(${blur}px)`,
        WebkitBackdropFilter: `blur(${blur}px)`,
        maskImage: `linear-gradient(to ${side === "top" ? "bottom" : "top"}, #000 25%, transparent)`,
        WebkitMaskImage: `linear-gradient(to ${side === "top" ? "bottom" : "top"}, #000 25%, transparent)`,
      }}
    />
  );
  return (
    <>
      {layer("bottom", 130, 5)}
      {layer("bottom", 80, 12)}
    </>
  );
}
