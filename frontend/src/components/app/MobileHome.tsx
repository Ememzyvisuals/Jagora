"use client";

/* Phone home: sky behind everything, liquid glass on top. Orb, the living "Jagora" wordmark, the ask bar,
   site shortcuts, the Discover feed, and the glass bottom bar with the orb in the middle. */
import {
  ArrowRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  DotsThree,
  Moon,
  Sun,
  GraduationCap,
  House,
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
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { ask, quick } from "@/lib/engine";
import { LANGS, type Lang } from "@/lib/i18n";
import { activeTask, useApp } from "@/lib/store";
import { ago } from "@/lib/hooks";
import { useSpeakingPulse } from "@/lib/voice";
import { CloudWordmark } from "../glass/CloudWordmark";
import { siFacebook, siGmail, siGoogle, siInstagram, siTiktok, siWhatsapp, siX, siYoutube } from "simple-icons";
import { canFullscreen, toggleFullscreen } from "../Pwa";
import { LiveButton } from "../LiveMode";
import { CLOSE_L, DiscoverStack, deal } from "./DiscoverStack";
import { toggleTheme, useTheme } from "@/lib/theme";
import { Glass } from "../glass/Glass";
import { Orb } from "../Orb";

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

export function AppIcon({ site, size = 46 }: { site: Site; size?: number }) {
  const { Icon, from, to, domain, brand } = site;
  if (brand)
    return (
      <span
        className="relative grid place-items-center overflow-hidden"
        style={{ width: size, height: size, borderRadius: size * 0.3, background: brand.bg, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06), inset 0 1px 1px rgba(255,255,255,.5), 0 6px 14px -8px rgba(10,30,70,.4)" }}
      >
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill={brand.fg} aria-hidden="true">
          <path d={brand.path} />
        </svg>
      </span>
    );
  const [failed, setFailed] = useState(!domain);
  if (!failed && domain)
    return (
      <span className="grid place-items-center overflow-hidden bg-white" style={{ width: size, height: size, borderRadius: size * 0.3, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06), 0 6px 14px -8px rgba(10,30,70,.35)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt=""
          width={size * 0.62}
          height={size * 0.62}
          onError={() => setFailed(true)}
          onLoad={(e) => e.currentTarget.naturalWidth <= 16 && setFailed(true)}
          style={{ width: size * 0.62, height: size * 0.62 }}
        />
      </span>
    );
  return (
    <span
      className="relative grid place-items-center overflow-hidden text-snow"
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
          <div className="relative">
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
          <Link href="/app/details" aria-label="My details">
            <Glass radius={22} bezel={12} refraction={30} pressable>
              <span className="grid h-11 w-11 place-items-center text-ink">
                <User size={20} />
              </span>
            </Glass>
          </Link>
          </div>
        </div>

        {/* the orb, big and alive, and the word */}
        <div className="flex flex-col items-center">
          <button onClick={() => (setActive(null), setSheet(true))} aria-label="Talk to Jagora" className="-mt-1 transition active:scale-95">
            <Orb size={168} state={orb} levelRef={pulse} />
          </button>
          <CloudWordmark width={270} levelRef={pulse} className="-mt-7" />
          <p className="-mt-1 px-8 text-center text-[15px] font-medium text-ink-2 dark:text-ink dark:[text-shadow:0_1px_10px_rgba(0,0,0,.55)]">{TAGLINE[lang]}</p>
        </div>

        {/* ask bar */}
        <form onSubmit={(e) => (e.preventDefault(), send())} className="mx-4 mt-5" data-tour="ask">
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
              {text.trim() ? (
                <button type="submit" aria-label="Go" className="grid h-[42px] w-[42px] place-items-center rounded-full bg-ink text-paper shadow-[inset_0_1px_1px_rgba(255,255,255,.25)] transition active:scale-90">
                  <ArrowRight size={18} weight="bold" />
                </button>
              ) : (
                <LiveButton compact />
              )}
            </span>
          </Glass>
        </form>

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
            {[0, 1, 2].map((p) => (
              <button key={p} onClick={() => setPage(p)} aria-label={`Shortcuts ${p + 1}`} className={`h-[7px] rounded-full transition-all duration-300 ${page === p ? "w-[7px] bg-accent" : "w-[7px] bg-ink/20"}`} />
            ))}
          </div>
        </div>

        {/* discover */}
        <section className="mt-5 px-4">
          {!open ? (
            <DiscoverStack lang={lang} onSeeAll={() => setOpen(true)} stories={[...CARDS.map((c) => ({ key: c.id, image: c.thumb, title: c.title[lang], source: c.source, open: () => run(c.id) })), ...news.slice(0, 6).map((n) => ({ key: n.link, image: n.image, title: n.title, source: n.source, listen: true, open: () => ask(`Read this news story to me: ${n.title} ${n.link}`) }))]} />
          ) : (
          <>
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[28px] leading-none text-ink">{DISCOVER[lang]}</h2>
            <button onClick={() => setOpen(false)} className="flex h-8 items-center gap-1 rounded-full px-3 text-[13.5px] font-semibold text-ink-2 hover:bg-white/40">
              {CLOSE_L[lang]} <CaretUp size={13} weight="bold" />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            {CARDS.map((c, i) => (
              <motion.div key={c.id} {...deal(i)}>
              <Glass radius={22} bezel={14} refraction={26} tint="rgba(255,255,255,.55)" pressable className="cursor-pointer" onClick={() => run(c.id)}>
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
              </motion.div>
            ))}
            {news.slice(0, 6).map((n, i) => (
              <motion.div key={n.link} {...deal(i + CARDS.length)}>
              <Glass radius={22} bezel={14} refraction={26} tint="rgba(255,255,255,.55)" pressable className="cursor-pointer" onClick={() => ask(`Read this news story to me: ${n.title} ${n.link}`)}>
                <span className="flex gap-3 p-2.5">
                  {n.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.image} alt="" loading="lazy" className="h-[80px] w-[96px] shrink-0 rounded-[14px] object-cover shadow-[0_4px_10px_-6px_rgba(0,0,0,.35)]" />
                  ) : (
                    <span className="grid h-[80px] w-[96px] shrink-0 place-items-center rounded-[14px] bg-ink text-paper">
                      <Newspaper size={28} weight="fill" />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col py-0.5">
                    <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{n.title}</span>
                    <span className="mt-auto flex items-center gap-1.5 text-[12.5px] text-ink-3">
                      <span className="truncate">{n.source}</span>
                      {n.date && <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-ink-3/60" />}
                      {n.date && <span className="shrink-0">{ago(Date.parse(n.date))}</span>}
                      <SpeakerHigh size={17} className="ml-auto shrink-0 text-accent" aria-label="Listen" />
                    </span>
                  </span>
                </span>
              </Glass>
              </motion.div>
            ))}
          </div>
          </>
          )}
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

/** Safari-style bottom bar: separate floating glass pieces (back, the address capsule with the orb, tabs, more).
    Scrolling down shrinks it to a small address capsule; scrolling up or tapping opens it again. */
export function BottomBar({ screen, setScreen }: { screen: "home" | "page" | "tabs"; setScreen: (s: "home" | "page" | "tabs") => void }) {
  const lang = useApp((s) => s.lang);
  const sheet = useApp((s) => s.sheetOpen);
  const setSheet = useApp((s) => s.setSheet);
  const orb = useApp((s) => s.orb);
  const count = useApp((s) => s.tasks.length);
  const task = useApp(activeTask);
  const pulse = useSpeakingPulse(orb === "speaking");
  const [small, setSmall] = useState(false);
  const [menu, setMenu] = useState(false);
  const theme = useTheme();
  useEffect(() => {
    const on = (e: Event) => setSmall((e as CustomEvent<{ down: boolean }>).detail.down);
    addEventListener("jagora:scroll", on);
    return () => removeEventListener("jagora:scroll", on);
  }, []);
  const onPage = screen === "page" && task?.kind === "browse" && !!task.url;
  const label = onPage ? "skillsfair.ng" : sheet ? "Jagora" : PLACEHOLDER[lang];
  const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

  return (
    <div className="absolute inset-x-0 bottom-[max(10px,env(safe-area-inset-bottom))] z-40 flex justify-center px-3">
      <motion.div layout transition={spring} className={`flex items-center ${small ? "gap-0" : "w-full gap-2"}`}>
        <AnimatePresence initial={false}>
          {!small && (
            <motion.div key="back" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring}>
              <Glass radius={26} bezel={14} refraction={30} blur={10} tint="rgba(255,255,255,.62)" pressable>
                <button className="grid h-[52px] w-[52px] place-items-center text-ink disabled:opacity-30" disabled={screen !== "page"} onClick={() => setScreen("home")} aria-label={NAV.back[lang]}>
                  <CaretLeft size={22} weight="bold" />
                </button>
              </Glass>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div layout transition={spring} className={small ? "" : "min-w-0 flex-1"}>
          <Glass radius={30} bezel={16} refraction={36} blur={10} tint="rgba(255,255,255,.66)" pressable>
            {small ? (
              <button onClick={() => setSmall(false)} className="flex h-9 items-center gap-1.5 px-4 text-[13px] font-semibold text-ink">
                {onPage && <LockSimple size={12} weight="bold" className="text-ink-2" />}
                {onPage ? "skillsfair.ng" : "Jagora"}
              </button>
            ) : (
              <div className="flex h-[52px] items-center gap-2 pl-1.5 pr-1.5">
                <button onClick={() => setSheet(!sheet)} aria-label="Talk to Jagora" className="shrink-0 transition active:scale-90" data-tour="orb">
                  <Orb size={42} state={orb} levelRef={pulse} />
                </button>
                <button onClick={() => setSheet(true)} className="min-w-0 flex-1 truncate text-left text-[15px] font-medium text-ink-2">
                  {label}
                </button>
                {onPage && <ArrowClockwise size={17} className="shrink-0 text-ink-2" />}
                <LiveButton compact />
              </div>
            )}
          </Glass>
        </motion.div>

        <AnimatePresence initial={false}>
          {!small && (
            <motion.div key="right" className="flex gap-2" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring}>
              <Glass radius={26} bezel={14} refraction={30} blur={10} tint="rgba(255,255,255,.62)" pressable>
                <button className={`grid h-[52px] w-[52px] place-items-center transition ${screen === "tabs" ? "rounded-full bg-ink text-paper" : "text-ink"}`} onClick={() => setScreen("tabs")} aria-label={`${NAV.tabs[lang]}, ${count}`} aria-pressed={screen === "tabs"} data-tour="tabs">
                  <TabsGlyph count={count} />
                </button>
              </Glass>
              <div className="relative">
                <Glass radius={26} bezel={14} refraction={30} blur={10} tint="rgba(255,255,255,.62)" pressable>
                  <button className="grid h-[52px] w-[52px] place-items-center text-ink" onClick={() => setMenu((v) => !v)} aria-label="More" aria-expanded={menu}>
                    <DotsThree size={24} weight="bold" />
                  </button>
                </Glass>
                <AnimatePresence>
                  {menu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 8 }}
                      transition={spring}
                      className="absolute bottom-[62px] right-0 w-56 origin-bottom-right"
                    >
                      <Glass radius={24} bezel={14} refraction={30} blur={14} tint="rgba(255,255,255,.86)">
                        <div className="p-1.5">
                          {[
                            { k: "home", Icon: House, label: NAV.home[lang], on: () => setScreen("home") },
                            { k: "fwd", Icon: CaretRight, label: NAV.fwd[lang], on: () => task?.kind === "browse" && setScreen("page") },
                            { k: "full", Icon: CornersOut, label: "Full screen", on: () => void toggleFullscreen() },
                            { k: "theme", Icon: theme === "dark" ? Sun : Moon, label: theme === "dark" ? THEME_L.light[lang] : THEME_L.dark[lang], on: toggleTheme },
                          ].map(({ k, Icon, label: l, on }) => (
                            <button key={k} onClick={() => (on(), setMenu(false))} className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left text-[15px] font-medium text-ink hover:bg-black/5">
                              <Icon size={19} /> {l}
                            </button>
                          ))}
                          <Link href="/app/details" className="flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-[15px] font-medium text-ink hover:bg-black/5">
                            <User size={19} /> My details
                          </Link>
                        </div>
                      </Glass>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/** iOS-style soft blur where content slides under the top and bottom of the screen. */
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
      {layer("top", 60, 6)}
      {layer("top", 34, 14)}
      {layer("bottom", 130, 5)}
      {layer("bottom", 80, 12)}
    </>
  );
}
