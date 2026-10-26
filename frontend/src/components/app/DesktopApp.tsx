"use client";

/* Desktop: the sky, and one big liquid-glass browser window. Tabs and address bar on top; tasks on the left;
   the page in the middle (Jagora's start page or the live site she is working on); Jagora on the right. */
import {
  ArrowClockwise,
  ArrowRight,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChatCircleText,
  CheckCircle,
  CircleNotch,
  FileText,
  LockSimple,
  Plus,
  SpeakerHigh,
  SidebarSimple,
  CaretUp,
  Moon,
  Sun,
  X,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { ask, quick } from "@/lib/engine";
import { ago } from "@/lib/hooks";
import { LANGS, type Lang } from "@/lib/i18n";
import { activeTask, useApp, type Task } from "@/lib/store";
import { useSpeakingPulse } from "@/lib/voice";
import { TalkOrb } from "../AgentPanel";
import { Composer } from "../Composer";
import { Conversation } from "../Conversation";
import { CloudWordmark } from "../glass/CloudWordmark";
import { Backdrop } from "../glass/Backdrop";
import { LiveButton, LiveMode } from "../LiveMode";
import { Glass } from "../glass/Glass";
import { Orb } from "../Orb";
import { Mark } from "../Brand";
import { toggleTheme, useTheme } from "@/lib/theme";
import { PageView } from "../PageView";
import { HeroFloat } from "./HeroFloat";
import { CLOSE_L, DiscoverStack, deal } from "./DiscoverStack";
import { AppIcon, CARDS, DISCOVER, SITES, THEME_L, VoiceBars, useNews } from "./MobileHome";

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
const STATUS: Record<Task["status"], L> = {
  working: { en: "Working", pcm: "E dey work", yo: "Ó ń ṣiṣẹ́", ha: "Ana aiki", ig: "Na-arụ ọrụ" },
  waiting: { en: "Needs you", pcm: "E need you", yo: "Ó nílò yín", ha: "Tana bukatar ka", ig: "Ọ chọrọ gị" },
  done: { en: "Completed", pcm: "E don finish", yo: "Ó ti parí", ha: "An gama", ig: "Emechaala" },
  stopped: { en: "Stopped", pcm: "E stop", yo: "Ó dúró", ha: "An tsaya", ig: "Akwụsịla" },
};

function TaskGlyph({ task }: { task: Task }) {
  const Icon = task.kind === "scam" ? ChatCircleText : FileText;
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-white/60 text-ink-2 shadow-[inset_0_1px_1px_rgba(255,255,255,.9)]">
      <Icon size={18} />
    </span>
  );
}

function StatusMark({ s }: { s: Task["status"] }) {
  if (s === "done") return <CheckCircle size={17} weight="fill" className="text-ok" />;
  if (s === "working") return <CircleNotch size={16} weight="bold" className="animate-spin text-accent" />;
  if (s === "waiting") return <span className="h-2.5 w-2.5 rounded-full bg-accent" />;
  return null;
}

export function DesktopApp() {
  const task = useApp(activeTask);
  const tasks = useApp((s) => s.tasks);
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const setActive = useApp((s) => s.setActive);
  const closeTask = useApp((s) => s.closeTask);
  const profile = useApp((s) => s.profile);
  const [langOpen, setLangOpen] = useState(false);
  const [side, setSide] = useState(false);
  const theme = useTheme();
  const showPage = task?.kind === "browse" && !!task.url;
  const url = showPage ? (task!.url.startsWith("/practice/") ? "skillsfair.ng/register (practice site)" : task!.url.replace(/^https?:\/\//, "")) : "";

  return (
    <div className="relative h-dvh overflow-hidden p-6 xl:p-8">
      <Backdrop />
      <Glass radius={30} bezel={26} refraction={70} blur={10} tint="rgba(255,255,255,.55)" interactive={false} className="flex h-full flex-col overflow-hidden">
        {/* Jagora's own tabs: one per task (not a copy of the real browser's tabs) */}
        <div className="no-scrollbar flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto px-3">
          <button
            onClick={() => setSide((v) => !v)}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${side ? "bg-ink text-paper" : "text-ink-2 hover:bg-white/50"}`}
            aria-label={side ? "Hide tasks" : "Show tasks"}
            aria-expanded={side}
          >
            <SidebarSimple size={18} />
          </button>
          <button
            onClick={() => setActive(null)}
            className={`flex h-9 shrink-0 items-center gap-2 rounded-[14px] px-3.5 text-[13.5px] font-medium transition ${!task ? "bg-white/75 text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,1)]" : "text-ink-2 hover:bg-white/40"}`}
          >
            <Mark size={16} /> Home
          </button>
          {tasks.map((x) => (
            <div
              key={x.id}
              role="button"
              tabIndex={0}
              onClick={() => setActive(x.id)}
              className={`group flex h-9 max-w-[220px] shrink-0 items-center gap-2 rounded-[14px] pl-3.5 pr-2 text-[13.5px] font-medium transition ${x.id === task?.id ? "bg-white/75 text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,1)]" : "text-ink-2 hover:bg-white/40"}`}
            >
              <span className="truncate">{x.title}</span>
              <button onClick={(e) => (e.stopPropagation(), closeTask(x.id))} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-black/5" aria-label={`Close ${x.title}`}>
                <X size={11} weight="bold" />
              </button>
            </div>
          ))}
          <button onClick={() => setActive(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-white/40" aria-label="New tab">
            <Plus size={15} />
          </button>
          <button
            onClick={toggleTheme}
            className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-white/40"
            aria-label={theme === "dark" ? THEME_L.light[lang] : THEME_L.dark[lang]}
            title={theme === "dark" ? THEME_L.light[lang] : THEME_L.dark[lang]}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        {/* the address of the site Jagora is on, only while it is on one */}
        {showPage && (
          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-white/50 px-4">
            {[CaretLeft, CaretRight, ArrowClockwise].map((I, i) => (
              <button key={i} className="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-white/40" aria-label={["Back", "Forward", "Reload"][i]}>
                <I size={17} />
              </button>
            ))}
            <div className="ml-2 flex h-9 flex-1 items-center gap-2 rounded-full bg-white/55 px-4 text-[14px] text-ink shadow-[inset_0_1px_2px_rgba(20,40,80,.08)]">
              <LockSimple size={14} weight="bold" className="text-ok" />
              <span className="truncate">{url}</span>
              <span className="ml-auto shrink-0 text-[12px] font-medium text-ink-3">Jagora is browsing</span>
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-3 p-3">
          {/* tasks */}
          <motion.aside
            initial={false}
            animate={{ width: side ? 252 : 0, opacity: side ? 1 : 0, marginRight: side ? 0 : -12 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="flex shrink-0 flex-col overflow-hidden rounded-[24px] bg-white/30 shadow-[inset_0_1px_1px_rgba(255,255,255,.8)]"
            aria-hidden={!side}
          >
            <div className="flex h-full w-[252px] flex-col p-3">
            <div className="flex items-center gap-2.5 px-1.5 pt-1">
              <Mark size={32} />
              <span className="font-pixel text-[30px] leading-none text-ink">Jagora</span>
            </div>
            <button
              onClick={() => setActive(null)}
              className="mt-4 flex h-11 items-center gap-2 rounded-full bg-white/75 px-4 text-[15px] font-medium text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_6px_16px_-10px_rgba(20,40,80,.4)] transition active:scale-[.97]"
            >
              <Plus size={17} weight="bold" className="text-accent" /> New task
            </button>
            <p className="mt-5 px-2 text-[14px] font-semibold text-ink">Recent tasks</p>
            <div className="no-scrollbar mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {tasks.length === 0 && <p className="px-2 text-[13.5px] leading-snug text-ink-3">Your tasks will show here.</p>}
              {tasks.map((x) => (
                <div
                  key={x.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActive(x.id)}
                  className={`group flex items-center gap-2.5 rounded-[16px] p-2 transition ${x.id === task?.id ? "bg-white/70 shadow-[inset_0_1px_1px_rgba(255,255,255,1)]" : "hover:bg-white/40"}`}
                >
                  <TaskGlyph task={x} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">{x.title}</span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {STATUS[x.status][lang]} · {ago(x.createdAt)}
                    </span>
                  </span>
                  <StatusMark s={x.status} />
                  <button onClick={(e) => (e.stopPropagation(), closeTask(x.id))} className="hidden text-ink-3 group-hover:block" aria-label="Close task">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-1 border-t border-white/60 pt-2">
              <Link href="/app/details" className="flex items-center gap-2.5 rounded-[14px] p-2 hover:bg-white/40">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#7fb2ff] to-[#1d63ed] text-[13px] font-bold text-snow">
                  {(profile.full_name || "Me").slice(0, 1)}
                </span>
                <span className="truncate text-[14px] font-medium text-ink">{profile.full_name || "My details"}</span>
              </Link>
              <div className="relative">
                <button onClick={() => setLangOpen((v) => !v)} className="flex w-full items-center gap-2.5 rounded-[14px] p-2 text-[14px] font-medium text-ink hover:bg-white/40">
                  <svg viewBox="0 0 30 30" width="22" height="22" className="rounded-full" aria-hidden="true">
                    <rect width="10" height="30" fill="#0a8a4f" />
                    <rect x="10" width="10" height="30" fill="#fff" />
                    <rect x="20" width="10" height="30" fill="#0a8a4f" />
                  </svg>
                  {LANGS.find((l) => l.id === lang)?.native}
                  <CaretDown size={12} weight="bold" className="ml-auto text-ink-3" />
                </button>
                {langOpen && (
                  <div className="absolute bottom-12 left-0 z-50 w-full rounded-[18px] bg-white/90 p-1.5 shadow-[0_20px_40px_-20px_rgba(20,40,80,.5)] backdrop-blur-xl">
                    {LANGS.map((l) => (
                      <button key={l.id} onClick={() => (setLang(l.id), setLangOpen(false))} className={`w-full rounded-[12px] px-3 py-2 text-left text-[14px] ${l.id === lang ? "bg-mist font-semibold" : "hover:bg-mist"}`}>
                        {l.native}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </div>
          </motion.aside>

          {/* the page */}
          <main className="relative min-w-0 flex-1 overflow-hidden rounded-[24px] shadow-[inset_0_1px_1px_rgba(255,255,255,.8)]">{showPage ? <PageView bar={false} /> : <StartPage />}</main>

          {/* Jagora */}
          <section className="flex w-[372px] shrink-0 flex-col overflow-hidden rounded-[24px] bg-white/45 shadow-[inset_0_1px_1px_rgba(255,255,255,1)]">
            <div className="flex justify-end gap-1 px-3 pt-3 text-ink-2">
              <button className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/60" aria-label="Read aloud">
                <SpeakerHigh size={17} />
              </button>
            </div>
            <div className="-mt-8 flex flex-col items-center">
              <TalkOrb size={170} />
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pt-2">{task ? <Conversation task={task} /> : <Hello lang={lang} />}</div>
            <div className="p-3">
              <Composer />
            </div>
          </section>
        </div>
      </Glass>
      <LiveMode />
    </div>
  );
}

function Hello({ lang }: { lang: Lang }) {
  const tries: L[] = [
    { en: "Register me for the Skills Fair", pcm: "Register me for Skills Fair", yo: "Forúkọ mi sílẹ̀ fún Skills Fair", ha: "Yi mini rajista don Skills Fair", ig: "Debanye m aha maka Skills Fair" },
    { en: "Is this bank message real?", pcm: "This bank message na real?", yo: "Ṣé ọ̀rọ̀ báǹkì yìí jẹ́ òótọ́?", ha: "Shin wannan saƙon banki gaskiya ne?", ig: "Ozi ụlọ akụ a ọ bụ eziokwu?" },
    { en: "Check my JAMB result", pcm: "Check my JAMB result", yo: "Ẹ wo èsì JAMB mi", ha: "Duba sakamakon JAMB dina", ig: "Lelee nsonaazụ JAMB m" },
  ];
  return (
    <div className="flex flex-col gap-2 pb-2 pt-3">
      {tries.map((x) => (
        <button key={x.en} onClick={() => ask(x[lang])} className="rounded-[18px] bg-white/60 px-4 py-3 text-left text-[14.5px] font-medium text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,1)] transition hover:bg-white/85 active:scale-[.98]">
          {x[lang]}
        </button>
      ))}
    </div>
  );
}

/* Desktop new tab, laid out like a real browser's: a compact header with the orb and the word, a wide ask bar,
   one row of small shortcuts, then a wide Discover feed in columns (Jagora's suggestions and real news). */
function StartPage() {
  const lang = useApp((s) => s.lang);
  const orb = useApp((s) => s.orb);
  const pulse = useSpeakingPulse(orb === "speaking");
  const [text, setText] = useState("");
  const news = useNews(lang);
  const [open, setOpen] = useState(false);
  const send = () => text.trim() && (ask(text.trim()), setText(""));
  const run = (id: "register" | "scam" | "paper") => (id === "register" ? ask(lang === "yo" ? "Forúkọ mi sílẹ̀ fún Skills Fair" : "Register me for the Skills Fair") : quick(id));
  return (
    <div className="no-scrollbar relative h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[980px] flex-col items-center px-6 pb-12 pt-6">
        <HeroFloat>
          <div className="flex items-center gap-1">
            <Orb size={150} state={orb} levelRef={pulse} />
            <CloudWordmark width={330} levelRef={pulse} className="-ml-4" />
          </div>
          <p className="-mt-3 text-[16px] font-medium text-ink-2 dark:text-ink dark:[text-shadow:0_1px_10px_rgba(0,0,0,.55)]">{TAGLINE[lang]}</p>
        </HeroFloat>

        <form onSubmit={(e) => (e.preventDefault(), send())} className="mt-6 w-full max-w-[720px]">
          <Glass radius={30} bezel={20} refraction={50} blur={6} tint="rgba(255,255,255,.6)">
            <span className="flex h-[58px] items-center gap-3 pl-6 pr-2">
              <VoiceBars />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={PLACEHOLDER[lang]}
                className="h-full min-w-0 flex-1 bg-transparent text-[16.5px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
              />
              {text.trim() ? (
                <button type="submit" aria-label="Go" className="grid h-[44px] w-[44px] place-items-center rounded-full bg-ink text-paper shadow-[inset_0_1px_1px_rgba(255,255,255,.25)] transition active:scale-90">
                  <ArrowRight size={18} weight="bold" />
                </button>
              ) : (
                <LiveButton />
              )}
            </span>
          </Glass>
        </form>

        {/* one row of shortcuts, like a browser's top sites */}
        <div className="mt-7 grid w-full max-w-[640px] grid-cols-6 gap-x-2 gap-y-3">
          {SITES.map((s) => (
            <button key={s.goal} onClick={() => ask(s.goal)} className="group flex flex-col items-center gap-1.5 rounded-[18px] py-2 transition hover:bg-white/45 active:scale-95" title={s.name[lang]}>
              <AppIcon site={s} size={46} />
              <span className="w-full truncate px-1 text-center text-[12.5px] font-medium text-ink-2">{s.name[lang]}</span>
            </button>
          ))}
        </div>

        {/* Discover: a wide feed in columns */}
        <section className="mt-10 w-full">
          {!open ? (
            <div className="flex flex-col gap-2">
              <h2 className="px-1 text-[30px] leading-none text-ink">{DISCOVER[lang]}</h2>
              <DiscoverStack wide lang={lang} onSeeAll={() => setOpen(true)} stories={[...CARDS.map((c) => ({ key: c.id, image: c.thumb, title: c.title[lang], source: c.source, open: () => run(c.id) })), ...news.slice(0, 6).map((n) => ({ key: n.link, image: n.image, title: n.title, source: n.source, listen: true, open: () => ask(`Read this news story to me: ${n.title} ${n.link}`) }))]} />
            </div>
          ) : (
          <>
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[30px] leading-none text-ink">{DISCOVER[lang]}</h2>
            <button onClick={() => setOpen(false)} className="flex h-9 items-center gap-1 rounded-full px-3.5 text-[14px] font-semibold text-ink-2 hover:bg-white/40">
              {CLOSE_L[lang]} <CaretUp size={13} weight="bold" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {CARDS.map((c, i) => (
              <motion.div key={c.id} {...deal(i)}>
              <Glass radius={22} bezel={14} refraction={26} tint="rgba(255,255,255,.6)" pressable className="cursor-pointer overflow-hidden" onClick={() => run(c.id)}>
                <span className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.thumb} alt="" className="aspect-[16/9] w-full object-cover object-left-top" />
                  <span className="block p-4">
                    <span className="line-clamp-2 text-[15.5px] font-semibold leading-snug text-ink">{c.title[lang]}</span>
                    <span className="mt-2 block text-[12.5px] text-ink-3">
                      {c.source}, {c.when[lang]}
                    </span>
                  </span>
                </span>
              </Glass>
              </motion.div>
            ))}
            {news.slice(0, 6).map((n, i) => (
              <motion.div key={n.link} {...deal(i + CARDS.length)}>
              <Glass radius={22} bezel={14} refraction={26} tint="rgba(255,255,255,.6)" pressable className="cursor-pointer overflow-hidden" onClick={() => ask(`Read this news story to me: ${n.title} ${n.link}`)}>
                <span className="block">
                  {n.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.image} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
                  ) : (
                    <span className="grid aspect-[16/9] w-full place-items-center bg-ink text-paper">BBC</span>
                  )}
                  <span className="block p-4">
                    <span className="line-clamp-2 text-[15.5px] font-semibold leading-snug text-ink">{n.title}</span>
                    <span className="mt-2 flex items-center justify-between text-[12.5px] text-ink-3">
                      <span>
                        {n.source}
                        {n.date ? `, ${ago(Date.parse(n.date))}` : ""}
                      </span>
                      <SpeakerHigh size={16} className="text-accent" />
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
