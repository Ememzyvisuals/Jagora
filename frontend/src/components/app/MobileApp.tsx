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
import { Tour } from "../Tour";
import { LiveMode } from "../LiveMode";
import { InstallPrompt } from "../InstallPrompt";

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
  const [tabsFull, setTabsFull] = useState(false);
  // the tabs button toggles the stack; closing tabs returns to the screen she came from
  const go = (s: Screen) => {
    if (screen === "tabs" && (s === "tabs" || s === "home")) return setScreen(under);
    if (s === "tabs") setTabsFull(false);
    setScreen(s);
  };

  // a task with a web page opens the page; Jagora's sheet slides down while it works so she can watch
  useEffect(() => {
    if (task?.kind === "browse" && task.url) setScreen("page");
  }, [task?.id, task?.kind, task?.url]);

  // while Jagora works on a page the sheet steps aside so she can watch; it comes back when Jagora needs her
  const last = task?.messages.at(-1);
  const needsHer = !!last && ((last.kind === "confirm" && last.status === "waiting") || (last.kind === "choice" && !last.picked) || (last.kind === "handoff" && last.status === "waiting"));
  useEffect(() => {
    if (!task || task.kind !== "browse" || !task.url) return;
    if (needsHer) setSheet(true);
    else if (task.status === "working") setSheet(false);
  }, [task?.id, task?.kind, task?.url, task?.status, last?.id, needsHer, setSheet]);

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
              onDone={() => setScreen(under)}
              full={tabsFull}
              setFull={setTabsFull}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {screen !== "tabs" && <EdgeBlur />}
      {!(screen === "tabs" && tabsFull) && <BottomBar screen={screen} setScreen={go} />}
      <Sheet open={sheet} onClose={() => setSheet(false)} />
      {screen === "home" && !sheet && <Tour />}
      <LiveMode />
      {screen === "home" && !sheet && <InstallPrompt />}
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
function TabCard({ task, index, count, full, onOpen, onClose }: { task: Task; index: number; count: number; full: boolean; onOpen: () => void; onClose: () => void }) {
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
      className={`origin-top ${full ? "sticky mb-[-210px]" : "relative mb-[-96px]"}`}
      style={{ top: full ? `calc(max(16px, env(safe-area-inset-top)) + ${index * 16}px)` : undefined, zIndex: index + 1, scale: 1 - Math.min(depth, 5) * 0.012, transformPerspective: 1000 }}
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
        <button onClick={onOpen} className={`block w-full overflow-hidden text-left transition-[height] duration-500 ${full ? "h-[262px]" : "h-[150px]"}`}>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover object-left-top" draggable={false} />
          ) : (
            <span className="flex h-full w-full flex-col justify-end gap-1 bg-gradient-to-b from-[#6fb2f2] to-[#dcecfb] p-5">
              <span className="text-[13px] font-semibold text-ink-2">{task.title}</span>
              <span className="line-clamp-3 text-[16px] font-medium leading-snug text-ink">{lastLine(task)}</span>
            </span>
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}

/* Tabs open the way the reference does: the screen behind blurs and the tab stack rises from the bottom, above the
   bar. Drag it up for the full-screen stack; drag it down, tap the blur or tap the tabs button again to close. */
function Tabs({ full, setFull, onOpen, onNew, onDone }: { full: boolean; setFull: (v: boolean) => void; onOpen: (id: string) => void; onNew: () => void; onDone: () => void }) {
  const tasks = useApp((s) => s.tasks);
  const close = useApp((s) => s.closeTask);
  const list = [...tasks].reverse(); // newest at the front of the stack
  const shown = full ? list : list.slice(-3);
  const spring = { type: "spring", stiffness: 300, damping: 34 } as const;
  return (
    <div className="relative h-full">
      <motion.div className="absolute inset-0 bg-white/10 backdrop-blur-[5px]" onClick={onDone} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        layout
        transition={spring}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.25, bottom: 0.5 }}
        dragListener={!full}
        onDragEnd={(_, i) => {
          if (i.offset.y < -60 || i.velocity.y < -500) setFull(true);
          else if (i.offset.y > 90 || i.velocity.y > 600) onDone();
        }}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        className={`absolute inset-x-0 flex flex-col ${full ? "bottom-0 top-0" : "bottom-[calc(max(10px,env(safe-area-inset-bottom))+64px)] max-h-[64dvh]"}`}
      >
        {!full && (
          <button onClick={() => setFull(true)} className="mx-auto mb-2 flex flex-col items-center gap-1 text-white/90" aria-label="Show all tabs">
            <span className="h-1.5 w-10 rounded-full bg-white/70" />
            <span className="text-[12px] font-semibold">{tasks.length} {tasks.length === 1 ? "tab" : "tabs"}</span>
          </button>
        )}
        <div className={`no-scrollbar relative min-h-0 flex-1 px-3 ${full ? "overflow-y-auto pt-[max(14px,env(safe-area-inset-top))]" : "overflow-hidden"}`} style={{ perspective: 1100 }}>
          {full && (
            <div className="mb-4 flex items-end justify-between px-2 pt-2 text-white">
              <h1 className="text-[34px] leading-none">Tabs</h1>
              <span className="text-[14px] font-semibold text-white/80">{tasks.length} open</span>
            </div>
          )}
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-white">
              <p className="text-[17px] font-semibold">No tabs open</p>
              <p className="mt-1 text-[14.5px] text-white/80">Add a tab and tell Jagora what you need.</p>
            </div>
          ) : (
            <div className={full ? "pb-[250px]" : "pb-[96px]"}>
              <AnimatePresence initial={false}>
                {shown.map((t, i) => (
                  <TabCard key={t.id} task={t} index={i} count={shown.length} full={full} onOpen={() => onOpen(t.id)} onClose={() => close(t.id)} />
                ))}
              </AnimatePresence>
            </div>
          )}
          {full && <div className="h-40" />}
        </div>
        {/* "Add new tab", as in the reference; in full view it sits with Done */}
        <div className={full ? "absolute inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-40" : "relative z-40 px-3 pt-2"}>
          <Glass radius={26} bezel={16} refraction={36} blur={14} tint="rgba(255,255,255,.86)">
            <div className="flex h-[56px] items-center gap-2 px-2">
              <button onClick={onNew} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[15.5px] font-semibold text-ink transition active:scale-[.97]">
                <span className="grid h-7 w-7 place-items-center rounded-[9px] border-[1.8px] border-ink">
                  <Plus size={14} weight="bold" />
                </span>
                Add new tab
              </button>
              {full && (
                <button onClick={onDone} className="h-11 rounded-full bg-ink px-6 text-[15px] font-semibold text-white transition active:scale-95">
                  Done
                </button>
              )}
            </div>
          </Glass>
        </div>
      </motion.div>
    </div>
  );
}

function Sheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const drag = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="absolute inset-0 z-40 bg-[#0b1426]/10 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label="Jagora"
            className="glass-2 absolute inset-x-2 bottom-2 z-50 flex h-[88dvh] flex-col rounded-[36px] pb-[env(safe-area-inset-bottom)]"
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
              <span className="h-1.5 w-11 rounded-full bg-ink/20" />
            </div>
            <AgentPanel orbSize={132} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
