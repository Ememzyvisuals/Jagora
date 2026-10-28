"use client";

/* Desktop: the sky, and one big liquid-glass browser window. Tabs and address bar on top; tasks on the left;
   the page in the middle (Jagora's start page or the live site she is working on); Jagora on the right. */
import {
  PersonSimple,
  ArrowClockwise,
  PaperPlaneRight,
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
  SpeakerSlash,
  CornersIn,
  CornersOut,
  Info,
  GameController,
  Moon,
  Sun,
  X,
  Trash,
  House,
  List,
  MagnifyingGlass,
  CellSignalFull,
  CellSignalLow,
} from "@phosphor-icons/react";
import { hush, remoteInput, remoteTakeover } from "@/lib/engine/remote";
import { fly } from "../Effects";
import { setAutoFullscreen, toggleFullscreen, useAutoFullscreen } from "../Pwa";
import { Starters, openSite, useTopSites } from "./NewTabBits";
import { TranslateButton } from "../PageView";
import { startPageWars } from "../PageWars";
import { aminaHidden, setAminaHidden } from "../mascot/Amina";
import { reportScreen } from "@/lib/appctl";
import { deleteChats } from "@/lib/sync";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ask, live, quick } from "@/lib/engine";
import { ago } from "@/lib/hooks";
import { LANGS, type Lang } from "@/lib/i18n";
import { activeTask, isTab, useApp, type Task } from "@/lib/store";
import { useSpeakingPulse } from "@/lib/voice";
import { TalkOrb } from "../AgentPanel";
import { Composer } from "../Composer";
import { Conversation } from "../Conversation";
import { CloudWordmark } from "../glass/CloudWordmark";
import { Backdrop } from "../glass/Backdrop";
import { LiveButton, LiveMode } from "../LiveMode";
import { Glass } from "../glass/Glass";
import { PILL } from "@/lib/glassRegistry";
import { Orb } from "../Orb";
import { Mark } from "../Brand";
import { toggleTheme, useTheme } from "@/lib/theme";
import { PageView } from "../PageView";
import { CLOSE_L } from "./DiscoverStack";
import { AppIcon, CARDS, CHOOSE_AV, DISCOVER, THEME_L, VoiceBars, useNews } from "./MobileHome";
import { Avatar, AvatarPicker } from "../Avatar";

type L = Record<Lang, string>;
const TAGLINE: L = {
  en: "Say it in your language. Jagora does the rest.",
  pcm: "Talk am for your language. Jagora go do the rest.",
  yo: "Ẹ sọ ọ́ ní èdè yín. Jagora á ṣe ìyókù.",
  ha: "Faɗa da harshenka. Jagora za ta yi sauran.",
  ig: "Kwuo ya n'asụsụ gị. Jagora ga-eme ndị ọzọ.",
};
// the big bar on the new tab is a search; the address bar above is for addresses and quick asks (no duplicate)
const SEARCH: L = {
  en: "Search anything, or tell Jagora what to do",
  pcm: "Search anything, or tell Jagora wetin make e do",
  yo: "Wá ohunkóhun, tàbí sọ ohun tí Jagora yóò ṣe",
  ha: "Nemi komai, ko gaya wa Jagora abin da zai yi",
  ig: "Chọọ ihe ọ bụla, ma ọ bụ gwa Jagora ihe ọ ga-eme",
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
  const closeTab = useApp((s) => s.closeTab);
  const profile = useApp((s) => s.profile);
  const [langOpen, setLangOpen] = useState(false);
  const [side, setSide] = useState(false);
  // desktop: full screen from the first click, so the demo looks like an app, not a page in a browser
  useAutoFullscreen(true);
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    on();
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const theme = useTheme();
  // Jagora can hide the live page and open the sidebar by voice (lib/appctl.ts)
  const [pageHidden, setPageHidden] = useState(false);
  useEffect(() => setPageHidden(false), [task?.id]);
  const showPage = task?.kind === "browse" && !!task.url && !pageHidden;
  useEffect(() => {
    reportScreen("screen", showPage ? "live web page beside the chat" : "start screen beside the chat");
    reportScreen("extra", side ? "chats sidebar open" : "");
    reportScreen("pageShown", task?.kind === "browse" && task.url ? (pageHidden ? "no" : "yes") : "");
  }, [showPage, side, pageHidden, task?.kind, task?.url]);
  useEffect(() => {
    const on = (e: Event) => {
      const { action } = (e as CustomEvent<{ action: string }>).detail;
      if (action === "show_page") setPageHidden(false);
      else if (action === "hide_page" || action === "go_home") setPageHidden(true);
      else if (action === "show_tabs" || action === "show_history") (setSide(true), setPanel(true));
      else if (action === "hide_tabs" || action === "hide_history") setSide(false);
    };
    window.addEventListener("jagora:app", on);
    return () => window.removeEventListener("jagora:app", on);
  }, []);
  const url = showPage ? (task!.url.startsWith("/practice/") ? "skillsfair.ng/register (practice site)" : task!.url.replace(/^https?:\/\//, "")) : "";
  const [panel, setPanel] = useState(true); // Jagora's chat on the right
  const [addr, setAddr] = useState("");
  const tabs = tasks.filter(isTab);
  const onNewTab = !showPage;
  const go = () => {
    const q = addr.trim();
    if (!q) return;
    ask(q);
    setAddr("");
    setPanel(true);
  };
  const tool = "grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink transition hover:bg-black/5 active:scale-90 disabled:opacity-55 dark:hover:bg-white/10";

  return (
    <div className="relative h-dvh overflow-hidden">
      <Backdrop />
      {/* the whole screen is Jagora, on the sky (like the phone): every bar and panel is glass over it */}
      <div className="relative flex h-full flex-col">
        {/* tab strip: one tab per website Jagora opened, and a new tab */}
        <div className="desk-glass no-scrollbar flex h-11 shrink-0 items-end gap-1 overflow-x-auto px-3 pt-2">
          {tabs.map((x) => {
            const on = showPage && x.id === task?.id;
            return (
              <div
                key={x.id}
                role="button"
                tabIndex={0}
                onClick={() => (setActive(x.id), setPageHidden(false))}
                className={`group flex h-9 w-[210px] min-w-[120px] shrink items-center gap-2 rounded-t-[12px] pl-3 pr-1.5 text-[13.5px] font-semibold transition ${on ? "bg-white/70 text-ink shadow-[0_-1px_4px_rgba(0,0,0,.06)] backdrop-blur-xl dark:bg-white/15" : "text-ink-2 hover:bg-white/40 dark:hover:bg-white/5"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(siteOf(x.url))}&sz=32`} alt="" className="h-4 w-4 shrink-0 rounded-[4px]" />
                <span className="min-w-0 flex-1 truncate">{x.title}</span>
                {x.status === "working" && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
                <button onClick={(e) => (e.stopPropagation(), closeTab(x.id))} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-black/5 dark:hover:bg-white/10" aria-label={`Close ${x.title}`}>
                  <X size={11} weight="bold" />
                </button>
              </div>
            );
          })}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setPageHidden(true)}
            className={`flex h-9 w-[170px] shrink-0 items-center gap-2 rounded-t-[12px] px-3 text-[13.5px] font-semibold transition ${onNewTab ? "bg-white/70 text-ink shadow-[0_-1px_4px_rgba(0,0,0,.06)] backdrop-blur-xl dark:bg-white/15" : "text-ink-2 hover:bg-white/40 dark:hover:bg-white/5"}`}
          >
            <Mark size={16} /> {NEW_TAB[lang]}
          </div>
          <button onClick={() => (setActive(null), setPageHidden(true))} className="mb-1 grid h-7 w-7 shrink-0 place-items-center self-center rounded-full text-ink hover:bg-black/5 dark:hover:bg-white/10" aria-label="New tab">
            <Plus size={15} weight="bold" />
          </button>
          <div className="mb-1 ml-auto flex shrink-0 items-center gap-1 self-center">
            <button
              data-no-autofs
              onClick={() => {
                const entering = !document.fullscreenElement;
                setAutoFullscreen(entering);
                void toggleFullscreen();
                setFs(entering);
              }}
              className={tool}
              aria-label={fs ? "Exit full screen" : "Full screen"}
              title={fs ? "Exit full screen" : "Full screen (Jagora opens full screen on desktop)"}
            >
              {fs ? <CornersIn size={17} /> : <CornersOut size={17} />}
            </button>
          </div>
        </div>

        {/* toolbar: back, forward, reload, home, the address bar, then her chats, Jagora and her profile */}
        <div className="desk-glass-strong flex h-[52px] shrink-0 items-center gap-1 border-b border-white/30 px-3 dark:border-white/5">
          <button className={tool} disabled={!showPage} onClick={() => task && void remoteInput(task.id, { action: "back" })} aria-label="Back">
            <CaretLeft size={18} weight="bold" />
          </button>
          <button className={tool} disabled={!showPage} onClick={() => task && void remoteInput(task.id, { action: "forward" })} aria-label="Forward">
            <CaretRight size={18} weight="bold" />
          </button>
          <button className={tool} disabled={!showPage} onClick={() => task && void remoteInput(task.id, { action: "key", key: "F5" })} aria-label="Reload">
            <ArrowClockwise size={18} weight="bold" />
          </button>
          <button className={tool} onClick={() => setPageHidden(true)} aria-label="Home">
            <House size={18} weight={onNewTab ? "fill" : "bold"} />
          </button>
          {showPage ? (
            <div className="mx-2 flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/75 px-4 text-[14.5px] font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)] dark:bg-white/10">
              <LockSimple size={14} weight="bold" className="shrink-0 text-ok" />
              <span className="min-w-0 truncate">{url}</span>
              <span className="ml-auto shrink-0 text-[12.5px] font-semibold text-ink-3">{task?.status === "working" ? "Jagora is browsing" : ""}</span>
              {live && task && <TranslateButton small />}
              {live && task && <TakeOver taskId={task.id} />}
            </div>
          ) : (
            <form onSubmit={(e) => (e.preventDefault(), go())} className="mx-2 flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/75 px-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)] dark:bg-white/10">
              <MagnifyingGlass size={16} weight="bold" className="shrink-0 text-ink" />
              <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder={PLACEHOLDER[lang]} className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] font-semibold text-ink outline-none placeholder:font-semibold placeholder:text-ink/70" />
            </form>
          )}
          <button className={`${tool} ${side ? "bg-ink text-paper hover:bg-ink" : ""}`} onClick={() => (setPanel(true), setSide((v) => !(v && panel)))} aria-label="Your chats" title="Your chats" aria-pressed={side && panel}>
            <List size={18} weight="bold" />
          </button>
          <button className={`${tool} ${panel ? "bg-accent-soft" : ""}`} onClick={() => setPanel((v) => !v)} aria-label={panel ? "Hide Jagora" : "Show Jagora"} title={panel ? "Hide Jagora" : "Show Jagora"} aria-pressed={panel}>
            <Orb size={26} state={useApp.getState().orb} />
          </button>
          <DeskProfile lang={lang} setLang={setLang} langOpen={langOpen} setLangOpen={setLangOpen} theme={theme} initial={(profile.full_name || "Me").slice(0, 1)} />
        </div>

        <div className="flex min-h-0 flex-1">

          {/* the page: the new tab or the live website */}
          <main data-page-area className="relative min-w-0 flex-1 overflow-hidden">{showPage ? <PageView bar={false} /> : <StartPage onAsk={() => setPanel(true)} />}</main>

          {/* Jagora, beside the page */}
          <motion.section
            initial={false}
            animate={{ width: panel ? 384 : 0, opacity: panel ? 1 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
            className="desk-glass-strong flex shrink-0 flex-col overflow-hidden border-l border-white/30 dark:border-white/5"
            aria-hidden={!panel}
          >
            <div className="flex h-full w-[384px] flex-col">
              <div className="flex items-center justify-end gap-1 px-3 pt-3 text-ink-2">
                <button
                  onClick={() => setSide((v) => !v)}
                  className={`mr-auto grid h-8 w-8 place-items-center rounded-full ${side ? "bg-ink text-paper" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
                  aria-label="Your chats"
                  title="Your chats"
                  aria-pressed={side}
                >
                  <List size={16} weight="bold" />
                </button>
                <AminaToggle />
                <DataSaverToggle />
                <VoiceToggle />
                <button onClick={() => setPanel(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10" aria-label="Hide Jagora">
                  <X size={15} weight="bold" />
                </button>
              </div>
              {side ? (
                /* her chats, in Jagora's own space: pick one and it opens here (like ChatGPT's menu) */
            <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
              <button
                onClick={() => (setActive(null), setPageHidden(true), setSide(false))}
                className="flex h-11 items-center gap-2 rounded-full bg-ink px-4 text-[15px] font-semibold text-paper transition active:scale-[.97]"
              >
                <Plus size={17} weight="bold" /> {NEW_CHAT[lang]}
              </button>
              <p className="mt-5 px-2 text-[14px] font-bold text-ink">{CHATS_L[lang]}</p>
              <div className="no-scrollbar mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                {tasks.length === 0 && <p className="px-2 text-[13.5px] leading-snug text-ink-3">Your chats will show here.</p>}
                {tasks.map((x) => (
                  <div
                    key={x.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => (setActive(x.id), setPageHidden(false), setSide(false))}
                    className={`group flex items-center gap-2.5 rounded-[16px] p-2 transition ${x.id === task?.id ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.06)] dark:bg-white/10" : "hover:bg-black/[.04] dark:hover:bg-white/5"}`}
                  >
                    <TaskGlyph task={x} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">{x.title}</span>
                      <span className="block truncate text-[12px] font-medium text-ink-3">
                        {STATUS[x.status][lang]} · {ago(x.createdAt)}
                      </span>
                    </span>
                    <StatusMark s={x.status} />
                    <button onClick={(e) => (e.stopPropagation(), closeTask(x.id), deleteChats([x.id]))} className="hidden text-ink-3 hover:text-ink group-hover:block" aria-label={`Delete ${x.title}`} title="Delete chat">
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
              ) : (
                <>
                  <div className="-mt-6 flex flex-col items-center">
                    <TalkOrb size={showPage ? 104 : 140} />
                  </div>
                  <div data-chat-scroll className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pt-2">{task ? <Conversation task={task} /> : <Hello lang={lang} />}</div>
                  <div className="p-3">
                    <Composer />
                  </div>
                </>
              )}
            </div>
          </motion.section>
        </div>
      </div>
      <LiveMode />
    </div>
  );
}

const NEW_TAB: L = { en: "New tab", pcm: "New tab", yo: "Táàbù tuntun", ha: "Sabon shafi", ig: "Taabụ ọhụrụ" };
const NEW_CHAT: L = { en: "New chat", pcm: "New chat", yo: "Ìjíròrò tuntun", ha: "Sabuwar hira", ig: "Mkparịta ụka ọhụrụ" };
const CHATS_L: L = { en: "Your chats", pcm: "Your chats", yo: "Àwọn ìjíròrò yín", ha: "Hirarrakinku", ig: "Mkparịta ụka gị" };
const TRY_L: L = { en: "Try Jagora", pcm: "Try Jagora", yo: "Ẹ dán Jagora wò", ha: "Gwada Jagora", ig: "Nwalee Jagora" };
const siteOf = (u: string) => (u.startsWith("/practice/") ? "skillsfair.ng" : u.replace(/^https?:\/\//, "").split("/")[0]);

/** Her profile: details, language, theme, Page Wars, About. */
function DeskProfile({ lang, setLang, langOpen, setLangOpen, theme, initial }: { lang: Lang; setLang: (l: Lang) => void; langOpen: boolean; setLangOpen: (v: boolean) => void; theme: string; initial: string }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const item = "flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-left text-[14.5px] font-semibold text-ink hover:bg-black/5 dark:hover:bg-white/10";
  return (
    <div className="relative ml-1">
      <button onClick={() => setOpen((v) => !v)} className="grid h-10 w-10 place-items-center rounded-full bg-black/[.04] transition hover:bg-black/[.08] active:scale-95 dark:bg-white/10" aria-label="My details and settings" aria-expanded={open} title={initial}>
        <Avatar size={32} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => (setOpen(false), setLangOpen(false))} />
          <div className="absolute right-0 top-11 z-50 w-64 rounded-[20px] bg-white p-1.5 shadow-[0_24px_50px_-20px_rgba(10,25,60,.45)] ring-1 ring-black/5 dark:bg-[#23262d]">
            <Link href="/app/details" className={item}>
              <PersonSimple size={18} /> My details
            </Link>
            <button onClick={() => (setPick(true), setOpen(false))} className={item}>
              <Avatar size={20} /> {CHOOSE_AV[lang]}
            </button>
            <button onClick={() => setLangOpen(!langOpen)} className={item}>
              <svg viewBox="0 0 30 30" width="18" height="18" className="rounded-full" aria-hidden="true">
                <rect width="10" height="30" fill="#0a8a4f" />
                <rect x="10" width="10" height="30" fill="#fff" />
                <rect x="20" width="10" height="30" fill="#0a8a4f" />
              </svg>
              {LANGS.find((l) => l.id === lang)?.native}
              <CaretDown size={12} weight="bold" className="ml-auto text-ink-3" />
            </button>
            {langOpen && (
              <div className="mx-1 mb-1 rounded-[14px] bg-black/[.03] p-1 dark:bg-white/5">
                {LANGS.map((l) => (
                  <button key={l.id} onClick={() => (setLang(l.id), setLangOpen(false))} className={`w-full rounded-[10px] px-3 py-2 text-left text-[14px] font-semibold ${l.id === lang ? "bg-white text-ink dark:bg-white/10" : "text-ink-2 hover:bg-white/60 dark:hover:bg-white/5"}`}>
                    {l.native}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => (toggleTheme(), setOpen(false))} className={item}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />} {theme === "dark" ? THEME_L.light[lang] : THEME_L.dark[lang]}
            </button>
            <button onClick={() => (startPageWars(), setOpen(false))} className={item}>
              <GameController size={18} /> Play Page Wars
            </button>
            <Link href="/about" className={item}>
              <Info size={18} /> About and credits
            </Link>
          </div>
        </>
      )}
      <AvatarPicker open={pick} onClose={() => setPick(false)} />
    </div>
  );
}

/* the panel on a new tab: her recent conversations to pick up again (BrowserOS keeps history the same way) */
function Hello({ lang }: { lang: Lang }) {
  const tasks = useApp((s) => s.tasks);
  const setActive = useApp((s) => s.setActive);
  const T: Record<"recent" | "none", L> = {
    recent: { en: "Pick up where you left off", pcm: "Continue where you stop", yo: "Tẹ̀síwájú níbi tí o dé", ha: "Ci gaba daga inda ka tsaya", ig: "Gaa n'ihu ebe ị kwụsịrị" },
    none: { en: "Talk to Jagora or pick a suggestion. Your tasks will be kept here.", pcm: "Talk to Jagora or pick suggestion. Your work go dey here.", yo: "Bá Jagora sọ̀rọ̀ tàbí yan àbá kan. Iṣẹ́ yín á wà níbí.", ha: "Yi magana da Jagora ko zaɓi shawara. Ayyukanka za su kasance a nan.", ig: "Gwa Jagora okwu ma ọ bụ họrọ ntụnye. Ọrụ gị ga-anọ ebe a." },
  };
  if (!tasks.length) return <p className="px-2 pt-4 text-center text-[14.5px] leading-relaxed text-ink-2">{T.none[lang]}</p>;
  return (
    <div className="flex flex-col gap-1.5 pb-2 pt-3">
      <p className="px-2 pb-1 font-head text-[16px] text-ink">{T.recent[lang]}</p>
      {tasks.slice(0, 6).map((x) => (
        <button key={x.id} onClick={() => setActive(x.id)} className="flex items-center gap-3 rounded-[18px] bg-white/60 px-3.5 py-3 text-left shadow-[inset_0_1px_1px_rgba(255,255,255,1)] transition hover:bg-white/85 active:scale-[.98] dark:bg-white/10">
          <TaskGlyph task={x} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-medium text-ink">{x.title}</span>
            <span className="block text-[12.5px] text-ink-3">{ago(x.createdAt)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/* Desktop new tab, like Wave's: a wide sky card with the orb, the word, the ask bar and the shortcuts; then the day's
   news as a grid of cards; then things to try with Jagora. */
function StartPage({ onAsk }: { onAsk: () => void }) {
  const top = useTopSites();
  const lang = useApp((s) => s.lang);
  const orb = useApp((s) => s.orb);
  const pulse = useSpeakingPulse(orb === "speaking");
  const [text, setText] = useState("");
  const news = useNews(lang);
  const [all, setAll] = useState(false);
  const send = () => {
    if (!text.trim()) return;
    fly(document.querySelector('[data-send="start"]'));
    ask(text.trim());
    setText("");
    onAsk();
  };
  const run = (id: "register" | "scam" | "paper") => {
    onAsk();
    if (id === "register") ask(lang === "yo" ? "Forúkọ mi sílẹ̀ fún Skills Fair" : "Register me for the Skills Fair");
    else quick(id);
  };
  const shade = "[text-shadow:0_0_10px_rgba(255,255,255,.95),0_0_2px_rgba(255,255,255,.9)] dark:[text-shadow:none]";
  return (
    <div className="no-scrollbar relative h-full overflow-y-auto">
      <div className="flex w-full flex-col px-10 pb-16 pt-10 xl:px-14">
        {/* the sky card */}
        <section className="relative px-8 pb-8 pt-4">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <Orb size={132} state={orb} levelRef={pulse} />
              <CloudWordmark width={300} levelRef={pulse} className="-ml-4" />
            </div>
            <p className="-mt-1 text-[18px] font-bold text-snow [text-shadow:0_1px_3px_rgba(5,30,80,.55),0_2px_14px_rgba(5,30,80,.6)]">{TAGLINE[lang]}</p>
          </div>
          <form onSubmit={(e) => (e.preventDefault(), send())} className="mx-auto mt-10 w-full max-w-[1180px]">
            <Glass radius={30} bezel={20} refraction={50} blur={6} tint="rgba(255,255,255,.72)" lens={PILL} lensTint={0.14}>
              <span className="flex h-[78px] items-center gap-4 pl-8 pr-3">
                <VoiceBars />
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={SEARCH[lang]}
                  className="h-full min-w-0 flex-1 bg-transparent text-[20px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink-2"
                />
                {text.trim() ? (
                  <button type="submit" data-send="start" aria-label="Go" className="grid h-[46px] w-[46px] place-items-center rounded-full bg-ink text-paper transition active:scale-90">
                    <PaperPlaneRight size={18} weight="fill" />
                  </button>
                ) : (
                  <LiveButton />
                )}
              </span>
            </Glass>
          </form>
          <div className="mx-auto mt-6 w-full max-w-[1180px]">
            <Starters lang={lang} />
          </div>
          {/* shortcuts in white tiles, as in the reference */}
          <div className="mx-auto mt-16 flex w-full max-w-[1180px] flex-wrap justify-between gap-6 px-6">
            {top.slice(0, 8).map((s) => (
              <button key={s.goal} onClick={() => (openSite(s), onAsk())} className="group flex w-[78px] flex-col items-center gap-1.5 transition active:scale-95" title={s.name[lang]}>
                <span className="grid h-[58px] w-[58px] place-items-center rounded-[18px] bg-white shadow-[0_10px_22px_-12px_rgba(10,30,80,.55)] transition group-hover:-translate-y-0.5 dark:bg-[#23262d]">
                  <AppIcon site={s} size={38} />
                </span>
                <span className="w-full truncate text-center text-[12.5px] font-bold text-snow [text-shadow:0_1px_6px_rgba(5,30,80,.7)]">{s.name[lang]}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Discover: the day's news */}
        <section className="mt-16">
          <div className="flex items-end justify-between px-1">
            <h2 className={`text-[26px] font-extrabold text-ink ${shade}`}>{DISCOVER[lang]}</h2>
            {news.length > 6 && (
              <button onClick={() => setAll((v) => !v)} className="rounded-full bg-white/80 px-4 py-1.5 text-[14px] font-bold text-ink shadow-sm hover:bg-white dark:bg-white/10">
                {all ? CLOSE_L[lang] : "See all"}
              </button>
            )}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-6">
            {news.length === 0
              ? [0, 1, 2].map((i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-[22px] bg-white/60 dark:bg-white/5" />)
              : news.slice(0, all ? 12 : 6).map((n) => (
                  <NewsTile key={n.link} image={n.image} title={n.title} source={n.source} when={n.date ? ago(Date.parse(n.date)) : ""} listen onOpen={() => (onAsk(), ask(`Read this news story to me: ${n.title} ${n.link}`))} />
                ))}
          </div>
        </section>

        {/* things to try, under the news */}
        <section className="mt-14">
          <h2 className={`px-1 text-[26px] font-extrabold text-ink ${shade}`}>{TRY_L[lang]}</h2>
          <div className="mt-5 grid grid-cols-3 gap-6">
            {CARDS.map((c) => (
              <NewsTile key={c.id} image={c.thumb} title={c.title[lang]} source={c.source} when={c.when[lang]} onOpen={() => run(c.id)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** A story card for the grid: picture on top, bold title, then the source and time. */
function NewsTile({ image, title, source, when, listen = false, onOpen }: { image: string | null; title: string; source: string; when: string; listen?: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group flex flex-col overflow-hidden rounded-[22px] bg-white text-left shadow-[0_18px_36px_-24px_rgba(10,25,60,.55)] ring-1 ring-black/[.04] transition hover:-translate-y-0.5 dark:bg-[#23262d] dark:ring-white/5">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover object-left-top" />
      ) : (
        <span className="grid aspect-[16/9] w-full place-items-center bg-ink text-[18px] font-bold text-paper">{source}</span>
      )}
      <span className="flex flex-1 flex-col p-4">
        <span className="line-clamp-3 text-[16px] font-extrabold leading-snug text-ink">{title}</span>
        <span className="mt-auto flex items-center gap-2 pt-3 text-[13px] font-semibold text-ink-2">
          <span className="truncate">{source}</span>
          {when && <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-ink-3" />}
          {when && <span className="shrink-0 text-ink-3">{when}</span>}
          {listen && <SpeakerHigh size={17} weight="fill" className="ml-auto shrink-0 text-accent" aria-label="Listen" />}
        </span>
      </span>
    </button>
  );
}

function TakeOver({ taskId }: { taskId: string }) {
  const on = useApp((s) => s.takeover);
  return (
    <button onClick={() => void remoteTakeover(taskId, !on)} className={`-mr-2 h-7 shrink-0 rounded-full px-3 text-[12.5px] font-semibold transition ${on ? "bg-accent text-snow" : "bg-white/80 text-ink hover:bg-white"}`}>
      {on ? "Hand back to Jagora" : "Take over"}
    </button>
  );
}

/** Data saver: Auto (follows the phone's own connection report), On, Off. On, the voice comes compressed and the
    live page smaller, for slow or costly networks. */
/** Amina drops by now and then; this hides or shows her (the same switch as "Hide Amina" in the site footer). */
function AminaToggle() {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const sync = () => setOff(aminaHidden());
    sync();
    window.addEventListener("amina:toggle", sync);
    return () => window.removeEventListener("amina:toggle", sync);
  }, []);
  const label = off ? "Amina is hidden. Tap to show her." : "Amina drops by now and then. Tap to hide her.";
  return (
    <button onClick={() => setAminaHidden(!off)} className={`flex h-8 items-center gap-1 rounded-full px-2 text-[12px] font-semibold hover:bg-white/60 ${off ? "text-ink-3" : ""}`} aria-label={label} title={label}>
      <PersonSimple size={17} />
      <span>Amina</span>
    </button>
  );
}

function DataSaverToggle() {
  const mode = useApp((s) => s.dataSaver);
  const set = useApp((s) => s.setDataSaver);
  const next = mode === "auto" ? "on" : mode === "on" ? "off" : "auto";
  const label = mode === "auto" ? "Data saver: auto" : mode === "on" ? "Data saver: on" : "Data saver: off";
  return (
    <button
      onClick={() => set(next)}
      className={`flex h-8 items-center gap-1 rounded-full px-2 text-[12px] font-semibold hover:bg-white/60 ${mode === "on" ? "text-accent" : ""}`}
      aria-label={`${label}. Tap to change.`}
      title={label}
    >
      {mode === "off" ? <CellSignalFull size={17} /> : <CellSignalLow size={17} />}
      <span>{mode === "auto" ? "Auto" : mode === "on" ? "Saver" : "Full"}</span>
    </button>
  );
}

/** Jagora's voice on or off. Off, she still writes every word in the chat. */
function VoiceToggle() {
  const muted = useApp((s) => s.muted);
  const setMuted = useApp((s) => s.setMuted);
  return (
    <button
      onClick={() => {
        setMuted(!muted);
        if (!muted) {
          hush();
          try {
            speechSynthesis.cancel();
          } catch {}
        }
      }}
      className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/60"
      aria-label={muted ? "Turn Jagora's voice on" : "Turn Jagora's voice off"}
      title={muted ? "Voice off" : "Voice on"}
    >
      {muted ? <SpeakerSlash size={17} /> : <SpeakerHigh size={17} />}
    </button>
  );
}
