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
import { TaskIcon, lastLine } from "./Shared";
import { BottomBar, Home } from "./MobileHome";
import { Backdrop } from "../glass/Backdrop";

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
    <div className="relative h-dvh overflow-hidden">
      <Backdrop />
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
