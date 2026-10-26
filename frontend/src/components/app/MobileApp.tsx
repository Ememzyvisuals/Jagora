"use client";

/* The phone: Jagora as a calm browser. Sky header with greeting and ask bar, quick tasks, recent tasks; pages open
   full screen; the cloud orb sits in the middle of the bottom bar and opens the agent sheet. */
import { Plus, X } from "@phosphor-icons/react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useState } from "react";
import { activeTask, useApp, type Task } from "@/lib/store";
import { AgentPanel } from "../AgentPanel";
import { Orb } from "../Orb";
import { PageView } from "../PageView";
import { TaskIcon, lastLine } from "./Shared";
import { BottomBar, Home } from "./MobileHome";
import { Backdrop } from "../glass/Backdrop";
import { Glass } from "../glass/Glass";

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
      <AnimatePresence initial={false}>
        {screen === "home" && (
          <motion.div key="home" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Home onOpen={(id) => (setActive(id), setScreen(useApp.getState().tasks.find((x) => x.id === id)?.kind === "browse" ? "page" : "home"), setSheet(true))} />
          </motion.div>
        )}
        {screen === "page" && (
          <motion.div key="page" className="absolute inset-0 px-3 pb-[96px] pt-[max(12px,env(safe-area-inset-top))]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div layoutId={task ? `tab-${task.id}` : undefined} className="h-full overflow-hidden rounded-[26px]" transition={{ type: "spring", stiffness: 300, damping: 32 }}>
              <PageView compact onClose={() => setScreen("home")} />
            </motion.div>
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
              onDone={() => setScreen(task?.kind === "browse" && task.url ? "page" : "home")}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {screen !== "tabs" && <BottomBar screen={screen} setScreen={setScreen} />}
      <Sheet open={sheet} onClose={() => setSheet(false)} />
    </div>
  );
}


/* Safari-style tab view: a two-column grid of page previews with the title under each. Swipe a card sideways
   or tap its X to close it; the page zooms down into its card and back up again. */
function thumbFor(task: Task) {
  if (task.kind === "scam") return "/thumbs/sms.webp";
  if (task.kind === "paper") return "/thumbs/letter.webp";
  if (task.kind === "browse" && task.url) return "/thumbs/skills-fair.webp";
  return null;
}

function TabCard({ task, active, onOpen, onClose }: { task: Task; active: boolean; onOpen: () => void; onClose: () => void }) {
  const thumb = thumbFor(task);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -160, transition: { duration: 0.22 } }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.7, right: 0.15 }}
      onDragEnd={(_, i) => (i.offset.x < -90 || i.velocity.x < -500) && onClose()}
      className="flex flex-col"
    >
      <motion.button
        layoutId={`tab-${task.id}`}
        onClick={onOpen}
        className={`relative aspect-[0.72] w-full overflow-hidden rounded-[22px] bg-white shadow-[0_14px_30px_-18px_rgba(20,45,90,.55),0_0_0_1px_rgba(255,255,255,.7)] transition active:scale-[.97] ${active ? "ring-[3px] ring-accent ring-offset-2 ring-offset-transparent" : ""}`}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover object-left-top" draggable={false} />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#8cc4f2] to-[#e3f1fc] p-3">
            <Orb size={56} />
            <span className="line-clamp-3 text-center text-[12px] font-medium leading-snug text-ink-2">{lastLine(task)}</span>
          </span>
        )}
        {task.status === "waiting" && <span className="absolute bottom-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold text-white">Needs you</span>}
      </motion.button>
      <button
        onClick={(e) => (e.stopPropagation(), onClose())}
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition active:scale-90"
        aria-label={`Close ${task.title}`}
      >
        <X size={13} weight="bold" />
      </button>
      <span className="mt-2 flex items-center justify-center gap-1.5 px-1">
        <TaskIcon task={task} size={16} />
        <span className="truncate text-[13px] font-medium text-ink">{task.title}</span>
      </span>
    </motion.div>
  );
}

function Tabs({ onOpen, onNew, onDone }: { onOpen: (id: string) => void; onNew: () => void; onDone: () => void }) {
  const tasks = useApp((s) => s.tasks);
  const activeId = useApp((s) => s.activeId);
  const close = useApp((s) => s.closeTask);
  return (
    <div className="relative h-full">
      <div className="absolute inset-0 bg-white/25 backdrop-blur-[2px]" />
      <div className="no-scrollbar relative h-full overflow-y-auto px-4 pb-36 pt-[max(18px,env(safe-area-inset-top))]">
        {tasks.length === 0 ? (
          <div className="flex h-[70dvh] flex-col items-center justify-center text-center">
            <Orb size={110} />
            <p className="mt-3 text-[17px] font-semibold text-ink">No tabs open</p>
            <p className="mt-1 text-[14.5px] text-ink-2">Tap + and tell Jagora what you need.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <AnimatePresence initial={false}>
              {tasks.map((t) => (
                <div key={t.id} className="relative">
                  <TabCard task={t} active={t.id === activeId} onOpen={() => onOpen(t.id)} onClose={() => close(t.id)} />
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      {/* Safari's tab toolbar */}
      <div className="absolute inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-40">
        <Glass radius={30} bezel={18} refraction={40} blur={14} tint="rgba(255,255,255,.7)">
          <div className="flex h-[60px] items-center justify-between px-3">
            <button onClick={onNew} className="grid h-11 w-11 place-items-center rounded-full text-ink transition active:scale-90" aria-label="New tab">
              <Plus size={24} />
            </button>
            <span className="flex items-center gap-1 rounded-full bg-white/70 px-4 py-2 text-[14.5px] font-semibold text-ink shadow-[inset_0_1px_1px_rgba(255,255,255,1)]">
              {tasks.length} {tasks.length === 1 ? "Tab" : "Tabs"}
            </span>
            <button onClick={onDone} className="h-11 rounded-full px-3 text-[16px] font-bold text-accent transition active:scale-95">
              Done
            </button>
          </div>
        </Glass>
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
