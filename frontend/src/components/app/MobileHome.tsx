"use client";

/* Phone home, laid out like a mobile browser: language flag and profile on top, a curved sky card holding the
   address bar with the cloud orb sitting in its notch, site shortcuts, then a Discover feed. */
import { ArrowUp, CaretLeft, CaretRight, DotsThreeVertical, House, SquaresFour, UserCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { ask, quick } from "@/lib/engine";
import { LANGS, type Lang } from "@/lib/i18n";
import { activeTask, useApp } from "@/lib/store";
import { useSpeakingPulse } from "@/lib/voice";
import { Orb } from "../Orb";

type L = Record<Lang, string>;

const PLACEHOLDER: L = {
  en: "Ask Jagora or type a web address",
  pcm: "Ask Jagora or type web address",
  yo: "Bi Jagora tàbí kọ àdírẹ́sì",
  ha: "Tambayi Jagora ko rubuta adireshi",
  ig: "Jụọ Jagora ma ọ bụ dee adreesị",
};
const DISCOVER: L = { en: "Discover", pcm: "Discover", yo: "Ṣàwárí", ha: "Gano", ig: "Chọpụta" };
const RECENT: L = { en: "Recent", pcm: "Recent", yo: "Láìpẹ́", ha: "Na kwanan nan", ig: "Nso nso a" };

export const SITES = [
  { name: "Google", domain: "google.com", color: "#4285F4" },
  { name: "JAMB", domain: "jamb.gov.ng", color: "#1F7A3D" },
  { name: "NIMC", domain: "nimc.gov.ng", color: "#0E6B4F" },
  { name: "BBC Yorùbá", domain: "bbc.com/yoruba", color: "#B80000" },
  { name: "WAEC", domain: "waecdirect.org", color: "#2B5BA8" },
  { name: "Jumia", domain: "jumia.com.ng", color: "#F68B1E" },
  { name: "NIPOST", domain: "nipost.gov.ng", color: "#0B7A43" },
  { name: "YouTube", domain: "youtube.com", color: "#FF0000" },
];

const CARDS: { id: "register" | "scam" | "paper"; thumb: string; source: string; time: L; title: L }[] = [
  {
    id: "register",
    thumb: "/thumbs/skills-fair.webp",
    source: "skillsfair.ng",
    time: { en: "2 min with Jagora", pcm: "2 min with Jagora", yo: "Ìṣẹ́jú 2 pẹ̀lú Jagora", ha: "Minti 2 da Jagora", ig: "Nkeji 2 na Jagora" },
    title: {
      en: "Naija Skills Fair 2026: register for free training",
      pcm: "Naija Skills Fair 2026: register for free training",
      yo: "Naija Skills Fair 2026: forúkọ sílẹ̀ fún ẹ̀kọ́ ọ̀fẹ́",
      ha: "Naija Skills Fair 2026: yi rajista don horo kyauta",
      ig: "Naija Skills Fair 2026: debanye aha maka ọzụzụ n'efu",
    },
  },
  {
    id: "scam",
    thumb: "/thumbs/sms.webp",
    source: "SMS",
    time: { en: "Check in seconds", pcm: "Check am sharp sharp", yo: "Yẹ̀ ẹ́ wò kíákíá", ha: "Duba cikin dakika", ig: "Lelee ya ngwa ngwa" },
    title: {
      en: "Got a text saying your bank account is blocked? Check it first",
      pcm: "Bank text say dem block your account? Check am first",
      yo: "Ṣé wọ́n ní àkáǹtì yín ti dí? Ẹ jẹ́ kí Jagora yẹ̀ ẹ́ wò",
      ha: "Saƙo cewa an toshe asusunka? Bari Jagora ta duba",
      ig: "Ozi na-ekwu na e mechiri akaụntụ gị? Ka Jagora lelee ya",
    },
  },
  {
    id: "paper",
    thumb: "/thumbs/letter.webp",
    source: "Photo",
    time: { en: "Snap and listen", pcm: "Snap am, hear am", yo: "Ya fọ́tò, gbọ́ ọ", ha: "Ɗauki hoto, saurara", ig: "See foto, gee ntị" },
    title: {
      en: "A bill or letter you can't read? Jagora reads it to you",
      pcm: "Bill or letter wey you no fit read? Jagora go read am",
      yo: "Ìwé owó tàbí lẹ́tà tí ẹ kò lè kà? Jagora máa kà á fún yín",
      ha: "Takardar kuɗi ko wasiƙa? Jagora za ta karanta maka",
      ig: "Akwụkwọ ụgwọ ma ọ bụ leta? Jagora ga-agụrụ gị ya",
    },
  },
];

/** Round flag button: Nigeria, with the language code under it. */
function Flag() {
  return (
    <span className="block h-8 w-8 overflow-hidden rounded-full ring-1 ring-black/10">
      <svg viewBox="0 0 3 3" className="h-full w-full" aria-hidden="true">
        <rect width="1" height="3" fill="#008751" />
        <rect x="1" width="1" height="3" fill="#fff" />
        <rect x="2" width="1" height="3" fill="#008751" />
      </svg>
    </span>
  );
}

export function SiteIcon({ domain, name, color, size = 36 }: { domain: string; name: string; color: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const host = domain.split("/")[0];
  if (!failed)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://www.google.com/s2/favicons?domain=${host}&sz=128`}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        onLoad={(e) => e.currentTarget.naturalWidth <= 16 && setFailed(true)}
        className="rounded-[10px]"
        style={{ width: size, height: size }}
      />
    );
  return (
    <span className="grid place-items-center rounded-[11px] font-extrabold text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {name.slice(0, 1)}
    </span>
  );
}

export function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const tasks = useApp((s) => s.tasks);
  const setSheet = useApp((s) => s.setSheet);
  const setActive = useApp((s) => s.setActive);
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
    <div className="no-scrollbar h-full overflow-y-auto bg-white pb-36">
      {/* top row */}
      <div className="flex items-center justify-between px-5 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="relative">
          <button onClick={() => setLangOpen((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pr-2" aria-label="Language">
            <Flag />
            <span className="text-[13px] font-bold uppercase tracking-wide text-ink-2">{LANGS.find((l) => l.id === lang)?.native}</span>
          </button>
          {langOpen && (
            <ul className="glass-3 absolute left-0 top-11 z-50 w-48 rounded-[18px] p-1.5">
              {LANGS.map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() => (setLang(l.id), setLangOpen(false))}
                    className={`w-full rounded-[12px] px-3 py-2.5 text-left text-[15px] font-semibold ${l.id === lang ? "bg-mist text-ink" : "text-ink-2"}`}
                  >
                    {l.native}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link href="/app/details" aria-label="My details" className="text-ink-2">
          <UserCircle size={30} weight="light" />
        </Link>
      </div>

      {/* curved sky card with the orb in its notch */}
      <div className="relative mx-4 mt-9">
        <div
          className="h-[176px] rounded-[30px] px-4 pb-6"
          style={{
            backgroundImage: "url(/sky/hero-desktop.webp), linear-gradient(180deg, #5fb4f2 0%, #9fd3f7 100%)",
            backgroundSize: "cover",
            backgroundPosition: "center 20%",
            backgroundBlendMode: "multiply",
            WebkitMaskImage: "radial-gradient(circle 46px at 50% 0, transparent 45px, #000 46px)",
            maskImage: "radial-gradient(circle 46px at 50% 0, transparent 45px, #000 46px)",
          }}
        >
          <form
            onSubmit={(e) => (e.preventDefault(), send())}
            className="absolute inset-x-4 bottom-6 flex h-[52px] items-center gap-2 rounded-full bg-white pl-5 pr-1.5 shadow-[0_10px_30px_-12px_rgba(30,60,100,.45)]"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER[lang]}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
            />
            {text.trim() && (
              <button type="submit" className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white" aria-label="Go">
                <ArrowUp size={17} weight="bold" />
              </button>
            )}
          </form>
        </div>
        <button onClick={() => (setActive(null), setSheet(true))} className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" aria-label="Talk to Jagora">
          <Orb size={78} />
        </button>
      </div>

      {/* site shortcuts */}
      <div className="mt-6 overflow-hidden">
        <div className="flex transition-transform duration-300" style={{ transform: `translateX(-${page * 100}%)` }}>
          {[0, 1].map((p) => (
            <div key={p} className="grid w-full shrink-0 grid-cols-4 px-3">
              {SITES.slice(p * 4, p * 4 + 4).map((s) => (
                <button key={s.domain} onClick={() => ask(`Open ${s.domain}`)} className="flex flex-col items-center gap-2 rounded-[16px] py-2 active:bg-mist">
                  <SiteIcon {...s} />
                  <span className="text-[12.5px] font-semibold text-ink-2">{s.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-1.5">
          {[0, 1].map((p) => (
            <button key={p} onClick={() => setPage(p)} aria-label={`Shortcuts page ${p + 1}`} className={`h-1.5 rounded-full transition-all ${page === p ? "w-4 bg-accent" : "w-1.5 bg-mist-2"}`} />
          ))}
        </div>
      </div>

      {/* recent tasks */}
      {tasks.length > 0 && (
        <section className="mt-6 px-4">
          <h2 className="px-1 text-[16px] font-extrabold text-ink">{RECENT[lang]}</h2>
          <div className="mt-2 flex flex-col">
            {tasks.slice(0, 3).map((t) => (
              <button key={t.id} onClick={() => onOpen(t.id)} className="flex items-center gap-3 rounded-[14px] px-1 py-2.5 text-left active:bg-mist">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mist text-[13px] font-extrabold text-ink-2">{t.title.slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold text-ink">{t.title}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">{t.status === "waiting" ? "Needs you" : t.status === "done" ? "Done" : t.status === "working" ? "Working" : "Stopped"}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* discover */}
      <section className="mt-6 px-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[16px] font-extrabold text-ink">{DISCOVER[lang]}</h2>
          <DotsThreeVertical size={20} weight="bold" className="text-ink-3" />
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {CARDS.map((c) => (
            <button key={c.id} onClick={() => run(c.id)} className="rounded-[20px] border border-mist-2 bg-white p-3 text-left shadow-[0_8px_24px_-20px_rgba(0,0,0,.35)] active:bg-mist">
              <div className="flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.thumb} alt="" className="h-[78px] w-[92px] shrink-0 rounded-[14px] object-cover" />
                <p className="line-clamp-3 text-[14.5px] font-bold leading-snug text-ink">{c.title[lang]}</p>
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-[12px] text-ink-3">
                <span className="font-semibold text-ink-2">{c.source}</span>
                <span>·</span>
                <span className="truncate">{c.time[lang]}</span>
                <DotsThreeVertical size={18} weight="bold" className="ml-auto shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function BottomBar({ screen, setScreen }: { screen: "home" | "page" | "tabs"; setScreen: (s: "home" | "page" | "tabs") => void }) {
  const sheet = useApp((s) => s.sheetOpen);
  const setSheet = useApp((s) => s.setSheet);
  const orb = useApp((s) => s.orb);
  const count = useApp((s) => s.tasks.length);
  const task = useApp(activeTask);
  const pulse = useSpeakingPulse(orb === "speaking");
  const icon = "grid h-11 w-11 place-items-center rounded-full text-ink-2 active:bg-mist disabled:opacity-30";
  return (
    <nav className="absolute inset-x-0 bottom-0 z-40 border-t border-mist-2 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="flex h-[64px] items-center justify-around px-2">
        <button className={icon} disabled={screen === "home"} onClick={() => setScreen("home")} aria-label="Back">
          <CaretLeft size={23} />
        </button>
        <button className={icon} disabled={!task || task.kind !== "browse" || screen === "page"} onClick={() => setScreen("page")} aria-label="Forward">
          <CaretRight size={23} />
        </button>
        <button onClick={() => setSheet(!sheet)} className={`-mt-6 transition ${sheet ? "opacity-0" : ""}`} aria-label="Talk to Jagora">
          <Orb size={64} state={orb} levelRef={pulse} />
        </button>
        <button className={`${icon} relative`} onClick={() => setScreen("tabs")} aria-label={`Tabs, ${count} open`}>
          <SquaresFour size={23} />
          {count > 0 && <span className="absolute right-1 top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-white">{count}</span>}
        </button>
        <button className={icon} onClick={() => setScreen("home")} aria-label="Home">
          <House size={23} />
        </button>
      </div>
    </nav>
  );
}
