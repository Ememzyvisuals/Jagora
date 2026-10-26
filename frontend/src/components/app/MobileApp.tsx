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
import { BottomBar, EdgeBlur, Home } from "./MobileHome";
import { Backdrop } from "../glass/Backdrop";
import { Glass } from "../glass/Glass";

type Screen = "home" | "page" | "tabs";

export function MobileApp() {
  const task = useApp(activeTask);
  const sheet = useApp((s) => s.sheetOpen);
  const setSheet = useApp((s) => s.setSheet);
  const setActive = useApp((s) => s.setActive);
  const [screen, setScreen] = useState<Screen>("home");
  const [under, setUnder] = useState<Exclude<Screen, "tabs">>("home");
  useEffect(() => {
    if (screen !== "tabs") setUnder(screen);
  }, [screen]);
  const shown = screen === "tabs" ? under : screen;

  // a task with a web page opens the page; Jagora's sheet slides down while it works so she can watch
  useEffect(() => {
    if (task?.kind === "browse" && task.url) setScreen("page");
  }, [task?.id, task?.kind, task?.url]);

  return (
    <div className="relative h-dvh overflow-hidden">
      <Backdrop />
      <AnimatePresence initial={false}>
        {shown === "home" && (
          <motion.div key="home" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Home onOpen={(id) => (setActive(id), setScreen(useApp.getState().tasks.find((x) => x.id === id)?.kind === "browse" ? "page" : "home"), setSheet(true))} />
          </motion.div>
        )}
        {shown === "page" && (
          <motion.div key="page" className="absolute inset-0 px-3 pb-[96px] pt-[max(12px,env(safe-area-inset-top))]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div layoutId={task ? `tab-${task.id}` : undefined} className="h-full overflow-hidden rounded-[26px]" transition={{ type: "spring", stiffness: 300, damping: 32 }}>
              <PageView compact onClose={() => setScreen("home")} />
            </motion.div>
          </motion.div>
        )}
        {screen === "tabs" && (
          <motion.div key="tabs" className="absolute inset-0 z-30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
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

      {screen !== "tabs" && <EdgeBlur />}
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

function StatusChip({ s }: { s: Task["status"] }) {
  const m = { working: ["Working", "bg-accent text-white"], waiting: ["Needs you", "bg-ink text-white"], done: ["Done", "bg-white/80 text-ink-2"], stopped: ["Stopped", "bg-white/80 text-ink-3"] }[s];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${m[1]}`}>{m[0]}</span>;
}

/** One tab in the stack: a glass title bar over a live-looking preview of the page. */
function TabCard({ task, index, count, onOpen, onClose }: { task: Task; index: number; count: number; onOpen: () => void; onClose: () => void }) {
  const thumb = thumbFor(task);
  // deeper cards lean back a little more and sit a touch smaller, so the stack reads in depth
  const depth = count - 1 - index;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, rotateX: -18 }}
      animate={{ opacity: 1, y: 0, rotateX: -9 - Math.min(depth, 4) * 1.2 }}
      exit={{ opacity: 0, x: -260, rotateZ: -8, transition: { duration: 0.28 } }}
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.8, right: 0.12 }}
      onDragEnd={(_, i) => (i.offset.x < -100 || i.velocity.x < -550) && onClose()}
      className="sticky mb-[-210px] origin-top"
      style={{ top: `calc(max(16px, env(safe-area-inset-top)) + ${index * 16}px)`, zIndex: index + 1, scale: 1 - Math.min(depth, 5) * 0.012, transformPerspective: 1000 }}
    >
      <motion.div layoutId={`tab-${task.id}`} className="overflow-hidden rounded-[26px] bg-white shadow-[0_-10px_30px_-12px_rgba(10,25,60,.28),0_24px_40px_-22px_rgba(10,25,60,.5)]">
        <Glass radius={0} bezel={10} refraction={20} blur={14} tint="rgba(255,255,255,.82)" interactive={false}>
          <div className="flex h-12 items-center gap-2.5 px-3.5">
            <TaskIcon task={task} size={22} />
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">{task.title}</span>
            <StatusChip s={task.status} />
            <button onClick={(e) => (e.stopPropagation(), onClose())} className="grid h-8 w-8 place-items-center rounded-full text-ink-2 transition hover:bg-black/5 active:scale-90" aria-label={`Close ${task.title}`}>
              <X size={16} weight="bold" />
            </button>
          </div>
        </Glass>
        <button onClick={onOpen} className="block h-[262px] w-full overflow-hidden text-left">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover object-left-top" draggable={false} />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#6fb2f2] to-[#dcecfb] p-6">
              <Orb size={84} />
              <span className="line-clamp-2 text-center text-[15px] font-medium leading-snug text-ink">{lastLine(task)}</span>
            </span>
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}

function Tabs({ onOpen, onNew, onDone }: { onOpen: (id: string) => void; onNew: () => void; onDone: () => void }) {
  const tasks = useApp((s) => s.tasks);
  const close = useApp((s) => s.closeTask);
  const list = [...tasks].reverse(); // newest at the front of the stack
  return (
    <div className="relative h-full">
      <div className="absolute inset-0 bg-[#0b1426]/30 backdrop-blur-[22px] backdrop-saturate-150" />
      <div className="no-scrollbar relative h-full overflow-y-auto px-3 pt-[max(14px,env(safe-area-inset-top))]" style={{ perspective: 1100 }}>
        <div className="mb-4 flex items-end justify-between px-2 pt-2 text-white">
          <h1 className="text-[34px] leading-none">Tabs</h1>
          <span className="text-[14px] font-semibold text-white/80">{tasks.length} open</span>
        </div>
        {tasks.length === 0 ? (
          <div className="flex h-[60dvh] flex-col items-center justify-center text-center text-white">
            <Orb size={120} />
            <p className="mt-3 text-[17px] font-semibold">No tabs open</p>
            <p className="mt-1 text-[14.5px] text-white/80">Add a tab and tell Jagora what you need.</p>
          </div>
        ) : (
          <div className="pb-[250px]">
            <AnimatePresence initial={false}>
              {list.map((t, i) => (
                <TabCard key={t.id} task={t} index={i} count={list.length} onOpen={() => onOpen(t.id)} onClose={() => close(t.id)} />
              ))}
            </AnimatePresence>
          </div>
        )}
        <div className="h-40" />
      </div>
      {/* add a tab, like the reference's "Add new tab" row */}
      <div className="absolute inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-40">
        <Glass radius={30} bezel={18} refraction={40} blur={14} tint="rgba(255,255,255,.78)">
          <div className="flex h-[62px] items-center gap-2 px-2">
            <button onClick={onNew} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15.5px] font-semibold text-ink transition active:scale-[.97]">
              <span className="grid h-7 w-7 place-items-center rounded-[9px] border-[1.8px] border-ink">
                <Plus size={14} weight="bold" />
              </span>
              Add new tab
            </button>
            <button onClick={onDone} className="h-12 rounded-full bg-ink px-6 text-[15px] font-semibold text-white transition active:scale-95">
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
