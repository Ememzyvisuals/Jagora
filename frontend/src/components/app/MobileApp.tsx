"use client";

/* The phone: Jagora as a calm browser. Sky header with greeting and ask bar, quick tasks, recent tasks; pages open
   full screen; the cloud orb sits in the middle of the bottom bar and opens the agent sheet. */
import { CaretLeft, CaretRight, House, Plus, SquaresFour, X } from "@phosphor-icons/react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ask, quick } from "@/lib/engine";
import { t } from "@/lib/i18n";
import { activeTask, useApp } from "@/lib/store";
import { useSpeakingPulse } from "@/lib/voice";
import { Mark } from "../Brand";
import { AgentPanel } from "../AgentPanel";
import { Orb } from "../Orb";
import { PageView } from "../PageView";
import { LanguagePicker, QUICK, TaskIcon, TaskRow, lastLine } from "./Shared";

type Screen = "home" | "page" | "tabs";

export function MobileApp() {
  const task = useApp(activeTask);
  const sheet = useApp((s) => s.sheetOpen);
  const setSheet = useApp((s) => s.setSheet);
  const setActive = useApp((s) => s.setActive);
  const [screen, setScreen] = useState<Screen>("home");

  // a task with a web page opens the page; Jagora's sheet slides down while it works so she can watch
  useEffect(() => {
    if (task?.kind === "browse" && task.url) setScreen("page");
  }, [task?.id, task?.kind, task?.url]);

  return (
    <div className="relative h-dvh overflow-hidden bg-mist">
      <AnimatePresence mode="wait" initial={false}>
        {screen === "home" && (
          <motion.div key="home" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Home onOpen={(id) => (setActive(id), setScreen(useApp.getState().tasks.find((x) => x.id === id)?.kind === "browse" ? "page" : "home"), setSheet(true))} />
          </motion.div>
        )}
        {screen === "page" && (
          <motion.div key="page" className="absolute inset-0 px-3 pb-[118px] pt-[max(12px,env(safe-area-inset-top))]" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <PageView compact onClose={() => setScreen("home")} />
          </motion.div>
        )}
        {screen === "tabs" && (
          <motion.div key="tabs" className="absolute inset-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Tabs
              onOpen={(id) => {
                setActive(id);
                const k = useApp.getState().tasks.find((x) => x.id === id)?.kind;
                setScreen(k === "browse" ? "page" : "home");
                if (k !== "browse") setSheet(true);
              }}
              onNew={() => (setActive(null), setScreen("home"), setSheet(true))}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <BottomBar screen={screen} setScreen={setScreen} />
      <Sheet open={sheet} onClose={() => setSheet(false)} />
    </div>
  );
}

function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const lang = useApp((s) => s.lang);
  const name = useApp((s) => s.profile.full_name.split(" ")[0]);
  const tasks = useApp((s) => s.tasks);
  const setSheet = useApp((s) => s.setSheet);
  const setActive = useApp((s) => s.setActive);

  const go = (id: (typeof QUICK)[number]["id"]) => {
    if (id === "register") ask(lang === "yo" ? "Forúkọ mi sílẹ̀ fún Skills Fair" : lang === "pcm" ? "Register me for Skills Fair" : "Register me for the Skills Fair");
    if (id === "scam" || id === "paper") quick(id);
  };

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-40">
      <header className="sky relative h-[300px] overflow-hidden rounded-b-[44px]" style={{ backgroundImage: "url(/sky/hero-mobile.webp)" }}>
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white/25" />
        <div className="relative flex items-center gap-2 px-5 pt-[max(16px,env(safe-area-inset-top))]">
          <Mark size={30} />
          <div className="ml-auto flex items-center gap-2">
            <LanguagePicker compact />
            <Link href="/app/details" className="btn btn-glass h-9 w-9 text-[14px] font-semibold" aria-label="My details">
              {(name || "Me").slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </div>
        <div className="relative px-6 pt-10">
          <h1 className="text-[34px] font-semibold leading-[1.05] text-ink">
            {t("greet", lang)}
            {name ? `, ${name}` : ""}
          </h1>
          <p className="mt-2 max-w-[18rem] text-[16px] leading-snug text-ink-2">{t("ask", lang)}</p>
        </div>
      </header>

      <button
        onClick={() => (setActive(null), setSheet(true))}
        className="glass-3 relative z-10 mx-5 -mt-7 flex h-14 w-[calc(100%-2.5rem)] items-center gap-3 rounded-full pl-2 pr-5 text-left"
      >
        <Orb size={44} className="shrink-0" />
        <span className="truncate text-[15.5px] text-ink-3">{t("ask", lang)}</span>
      </button>

      <nav className="mt-6 grid grid-cols-4 gap-2 px-4" aria-label="Quick tasks">
        {QUICK.map(({ id, Icon, label }) =>
          id === "details" ? (
            <Link key={id} href="/app/details" className="flex flex-col items-center gap-2 rounded-[22px] py-2 active:scale-95">
              <span className="grid h-[60px] w-[60px] place-items-center rounded-[20px] bg-white shadow-[0_10px_24px_-16px_rgba(60,38,16,.45)]">
                <Icon size={40} />
              </span>
              <span className="text-center text-[12.5px] font-medium leading-tight text-ink-2">{label[lang]}</span>
            </Link>
          ) : (
            <button key={id} onClick={() => go(id)} className="flex flex-col items-center gap-2 rounded-[22px] py-2 transition active:scale-95">
              <span className="grid h-[60px] w-[60px] place-items-center rounded-[20px] bg-white shadow-[0_10px_24px_-16px_rgba(60,38,16,.45)]">
                <Icon size={40} />
              </span>
              <span className="text-center text-[12.5px] font-medium leading-tight text-ink-2">{label[lang]}</span>
            </button>
          ),
        )}
      </nav>

      <section className="mt-7 px-4">
        <h2 className="px-1 text-[19px] font-semibold text-ink">{lang === "yo" ? "Láìpẹ́" : lang === "pcm" ? "Recent" : lang === "ha" ? "Na kwanan nan" : lang === "ig" ? "Nso nso a" : "Recent"}</h2>
        <div className="mt-3 flex flex-col gap-2.5">
          {tasks.length ? (
            tasks.slice(0, 8).map((task) => <TaskRow key={task.id} task={task} onOpen={() => onOpen(task.id)} />)
          ) : (
            <div className="rounded-[24px] bg-white/70 p-5">
              <p className="text-[16px] font-medium text-ink">{lang === "yo" ? "Kò sí nǹkan síbí síbẹ̀." : "Nothing here yet."}</p>
              <p className="mt-1 text-[14.5px] leading-snug text-ink-3">
                {lang === "yo" ? "Ẹ tẹ ìkùukù ìsàlẹ̀ kí ẹ sì sọ ohun tí ẹ fẹ́ fún Jagora." : "Tap the cloud below and tell Jagora what you need."}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Tabs({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const tasks = useApp((s) => s.tasks);
  const close = useApp((s) => s.closeTask);
  return (
    <div className="sky h-full" style={{ backgroundImage: "url(/sky/app.webp)" }}>
      <div className="h-full bg-white/30 backdrop-blur-2xl">
        <div className="no-scrollbar h-full overflow-y-auto px-4 pb-44 pt-[max(20px,env(safe-area-inset-top))]">
          <h1 className="px-1 text-[28px] font-semibold text-ink">Tasks</h1>
          <div className="mt-4 flex flex-col">
            {tasks.map((task, i) => (
              <motion.div
                key={task.id}
                layout
                className="glass-3 relative -mb-6 rounded-[26px] p-4 pb-9"
                style={{ zIndex: i, transform: `scale(${1 - Math.min(i, 4) * 0.0})` }}
              >
                <button onClick={() => onOpen(task.id)} className="flex w-full items-start gap-3 text-left">
                  <TaskIcon task={task} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium text-ink">{task.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[14px] leading-snug text-ink-3">{lastLine(task)}</span>
                  </span>
                </button>
                <button onClick={() => close(task.id)} className="btn absolute right-3 top-3 h-8 w-8 text-ink-3 hover:bg-white" aria-label={`Close ${task.title}`}>
                  <X size={15} weight="bold" />
                </button>
              </motion.div>
            ))}
          </div>
          <button onClick={onNew} className="btn btn-glass mt-12 h-12 w-full text-[15.5px]">
            <Plus size={17} weight="bold" /> New task
          </button>
        </div>
      </div>
    </div>
  );
}


function BottomBar({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const sheet = useApp((s) => s.sheetOpen);
  const setSheet = useApp((s) => s.setSheet);
  const orb = useApp((s) => s.orb);
  const count = useApp((s) => s.tasks.length);
  const task = useApp(activeTask);
  const pulse = useSpeakingPulse(orb === "speaking");
  return (
    <div className="absolute inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-40">
      <div className="glass-2 flex h-[72px] items-center justify-between rounded-[28px] px-3">
        <button className="btn h-12 w-12 text-ink-2 hover:bg-white/60 disabled:opacity-35" disabled={screen === "home"} onClick={() => setScreen("home")} aria-label="Back">
          <CaretLeft size={22} />
        </button>
        <button
          className="btn h-12 w-12 text-ink-2 hover:bg-white/60 disabled:opacity-35"
          disabled={!task || task.kind !== "browse" || screen === "page"}
          onClick={() => setScreen("page")}
          aria-label="Forward"
        >
          <CaretRight size={22} />
        </button>
        <button
          onClick={() => setSheet(!sheet)}
          className={`-mt-10 grid h-[88px] w-[88px] place-items-center transition ${sheet ? "opacity-0" : ""}`}
          aria-label="Talk to Jagora"
        >
          <Orb size={88} state={orb} levelRef={pulse} />
        </button>
        <button className="btn relative h-12 w-12 text-ink-2 hover:bg-white/60" onClick={() => setScreen("tabs")} aria-label={`Tasks, ${count} open`}>
          <SquaresFour size={22} />
          {count > 0 && <span className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1 text-[10.5px] font-semibold text-white">{count}</span>}
        </button>
        <button className="btn h-12 w-12 text-ink-2 hover:bg-white/60" onClick={() => setScreen("home")} aria-label="Home">
          <House size={22} />
        </button>
      </div>
    </div>
  );
}

function Sheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const drag = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="absolute inset-0 z-40 bg-ink/15" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label="Jagora"
            className="glass-3 absolute inset-x-0 bottom-0 z-50 flex h-[90dvh] flex-col rounded-t-[34px] pb-[env(safe-area-inset-bottom)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 32 }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => (i.offset.y > 120 || i.velocity.y > 600) && onClose()}
          >
            <div className="flex cursor-grab justify-center pb-1 pt-3 touch-none" onPointerDown={(e) => drag.start(e)}>
              <span className="h-1.5 w-11 rounded-full bg-ink/15" />
            </div>
            <AgentPanel orbSize={104} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
