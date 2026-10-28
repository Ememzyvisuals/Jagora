"use client";

/* Her chats, like ChatGPT's menu: a panel that slides in from the left with New chat, a search box and every chat,
   newest first, grouped by day. Tap a chat to open it (its web page too, if it had one). Swipe a chat to the left to
   delete it; a moment to undo follows. Tabs are only the websites Jagora opened; this is where every chat lives. */
import { MagnifyingGlass, NotePencil, Trash, X } from "@phosphor-icons/react";
import { AnimatePresence, motion, useDragControls, useMotionValue, useTransform } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { useApp, type Task } from "@/lib/store";
import { TaskIcon, lastLine } from "./Shared";
import { CHATS } from "./MobileHome";

const W = {
  newChat: { en: "New chat", pcm: "New chat", yo: "Ìjíròrò tuntun", ha: "Sabuwar hira", ig: "Mkparịta ụka ọhụrụ" },
  search: { en: "Search your chats", pcm: "Find your chat", yo: "Wá ìjíròrò yín", ha: "Nemo hirarrakinku", ig: "Chọọ mkparịta ụka gị" },
  today: { en: "Today", pcm: "Today", yo: "Òní", ha: "Yau", ig: "Taa" },
  yesterday: { en: "Yesterday", pcm: "Yesterday", yo: "Àná", ha: "Jiya", ig: "Ụnyaahụ" },
  earlier: { en: "Earlier", pcm: "Before", yo: "Ṣáájú", ha: "A baya", ig: "Na mbụ" },
  none: { en: "No chats yet. Ask Jagora anything to start one.", pcm: "No chat yet. Ask Jagora anything make we start.", yo: "Kò sí ìjíròrò kankan síbẹ̀. Ẹ béèrè ohunkóhun lọ́wọ́ Jagora.", ha: "Babu hira tukuna. Tambayi Jagora komai don farawa.", ig: "Enweghị mkparịta ụka ugbu a. Jụọ Jagora ihe ọ bụla." },
  nothing: { en: "No chat matches that.", pcm: "No chat match am.", yo: "Kò sí ìjíròrò tó bá a mu.", ha: "Babu hirar da ta dace.", ig: "Ọ dịghị mkparịta ụka dabara." },
  deleted: { en: "Chat deleted", pcm: "Chat don delete", yo: "A ti pa ìjíròrò rẹ́", ha: "An goge hira", ig: "Ehichapụla mkparịta ụka" },
  undo: { en: "Undo", pcm: "Bring am back", yo: "Dá a padà", ha: "Mayar", ig: "Weghachi" },
  swipe: { en: "Swipe a chat left to delete it", pcm: "Drag chat go left to delete am", yo: "Ẹ fa ìjíròrò sí òsì láti pa á rẹ́", ha: "Ja hira hagu don goge ta", ig: "Dọrọ mkparịta ụka n'aka ekpe ka ihichapụ ya" },
  working: { en: "Working", pcm: "Dey work", yo: "Ń ṣiṣẹ́", ha: "Tana aiki", ig: "Na-arụ ọrụ" },
  waiting: { en: "Needs you", pcm: "Need you", yo: "Ó nílò yín", ha: "Tana bukatarka", ig: "Chọrọ gị" },
} satisfies Record<string, Record<Lang, string>>;

function group(t: Task): "today" | "yesterday" | "earlier" {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (t.createdAt >= start.getTime()) return "today";
  if (t.createdAt >= start.getTime() - 86_400_000) return "yesterday";
  return "earlier";
}

export function History({ open, onClose, onOpen, onNew }: { open: boolean; onClose: () => void; onOpen: (id: string) => void; onNew: () => void }) {
  const lang = useApp((s) => s.lang);
  const tasks = useApp((s) => s.tasks);
  const activeId = useApp((s) => s.activeId);
  const remove = useApp((s) => s.closeTask);
  const [q, setQ] = useState("");
  const [gone, setGone] = useState<{ task: Task; at: number } | null>(null);
  const panelDrag = useDragControls();

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  useEffect(() => {
    if (!gone) return;
    const id = setTimeout(() => setGone(null), 5000);
    return () => clearTimeout(id);
  }, [gone]);

  const list = useMemo(() => {
    const words = q.trim().toLowerCase();
    const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
    return words
      ? sorted.filter((t) => t.title.toLowerCase().includes(words) || t.messages.some((m) => "text" in m && typeof m.text === "string" && m.text.toLowerCase().includes(words)))
      : sorted;
  }, [tasks, q]);
  const groups = (["today", "yesterday", "earlier"] as const).map((g) => [g, list.filter((t) => group(t) === g)] as const).filter(([, l]) => l.length);

  const del = (t: Task) => {
    setGone({ task: t, at: tasks.findIndex((x) => x.id === t.id) });
    remove(t.id);
  };
  const undo = () => {
    if (!gone) return;
    useApp.setState((s) => {
      const next = [...s.tasks];
      next.splice(Math.max(0, gone.at), 0, gone.task);
      return { tasks: next };
    });
    setGone(null);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="absolute inset-0 z-[60] bg-[#0b1426]/25 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.nav
            aria-label={CHATS[lang]}
            className="glass-2 absolute bottom-2 left-2 top-2 z-[61] flex w-[min(86vw,360px)] flex-col overflow-hidden rounded-[30px] pt-[max(6px,env(safe-area-inset-top))]"
            initial={{ x: "-110%" }}
            animate={{ x: 0 }}
            exit={{ x: "-110%" }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
            drag="x"
            dragControls={panelDrag}
            dragListener={false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.6, right: 0 }}
            onDragEnd={(_, i) => (i.offset.x < -90 || i.velocity.x < -500) && onClose()}
          >
            {/* swipe the top of the panel to the left to close it (the chats below swipe on their own, to delete) */}
            <div className="flex touch-none items-center justify-between px-5 pb-2 pt-4" onPointerDown={(e) => panelDrag.start(e)}>
              <h2 className="text-[26px] font-semibold leading-none text-ink">{CHATS[lang]}</h2>
              <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full text-ink-2 transition hover:bg-black/5 active:scale-90" aria-label="Close">
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="flex flex-col gap-2 px-3 pb-2">
              <button
                onClick={onNew}
                className="flex h-12 items-center gap-3 rounded-[18px] bg-ink px-4 text-[15.5px] font-semibold text-paper transition active:scale-[.98]"
              >
                <NotePencil size={19} weight="bold" /> {W.newChat[lang]}
              </button>
              <label className="flex h-11 items-center gap-2 rounded-[16px] bg-white/60 px-3.5 shadow-[inset_0_1px_2px_rgba(20,40,80,.08)] dark:bg-white/10">
                <MagnifyingGlass size={17} className="shrink-0 text-ink-3" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={W.search[lang]}
                  className="min-w-0 flex-1 bg-transparent text-[15.5px] text-ink outline-none placeholder:text-ink-3"
                  aria-label={W.search[lang]}
                />
                {q && (
                  <button onClick={() => setQ("")} className="text-ink-3" aria-label="Clear">
                    <X size={14} weight="bold" />
                  </button>
                )}
              </label>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {!tasks.length ? (
                <p className="px-4 pt-6 text-center text-[15px] leading-relaxed text-ink-2">{W.none[lang]}</p>
              ) : !list.length ? (
                <p className="px-4 pt-6 text-center text-[15px] text-ink-2">{W.nothing[lang]}</p>
              ) : (
                groups.map(([g, items]) => (
                  <section key={g} className="pt-3">
                    <h3 className="px-3 pb-1 text-[12.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{W[g][lang]}</h3>
                    <AnimatePresence initial={false}>
                      {items.map((t) => (
                        <Row key={t.id} task={t} lang={lang} active={t.id === activeId} onOpen={() => onOpen(t.id)} onDelete={() => del(t)} />
                      ))}
                    </AnimatePresence>
                  </section>
                ))
              )}
              {tasks.length > 0 && !q && <p className="px-3 pt-4 text-center text-[12.5px] text-ink-3">{W.swipe[lang]}</p>}
            </div>

            <AnimatePresence>
              {gone && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  className="mx-3 mb-[max(12px,env(safe-area-inset-bottom))] flex items-center justify-between gap-3 rounded-[18px] bg-ink px-4 py-3 text-paper"
                >
                  <span className="truncate text-[14.5px]">{W.deleted[lang]}</span>
                  <button onClick={undo} className="shrink-0 rounded-full bg-paper/15 px-3.5 py-1.5 text-[14px] font-semibold">
                    {W.undo[lang]}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}

function Row({ task, lang, active, onOpen, onDelete }: { task: Task; lang: Lang; active: boolean; onOpen: () => void; onDelete: () => void }) {
  const line = lastLine(task);
  const x = useMotionValue(0);
  const red = useTransform(x, [-120, -8], [1, 0]);
  const busy = task.status === "working" ? W.working[lang] : task.status === "waiting" ? W.waiting[lang] : "";
  return (
    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }} className="relative overflow-hidden rounded-[18px]">
      {/* behind the row: what a swipe to the left does */}
      <motion.div style={{ opacity: red }} className="absolute inset-0 flex items-center justify-end rounded-[18px] bg-[#c4361a] pr-5 text-snow" aria-hidden="true">
        <Trash size={20} weight="bold" />
      </motion.div>
      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0 }}
        onDragEnd={(_, i) => (i.offset.x < -110 || i.velocity.x < -650) && onDelete()}
        className="relative touch-pan-y"
      >
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => (e.key === "Enter" ? onOpen() : e.key === "Delete" ? onDelete() : undefined)}
          className={`flex items-center gap-3 rounded-[18px] px-3 py-2.5 transition-colors ${active ? "bg-white/90 dark:bg-white/15" : "hover:bg-white/50 active:bg-white/60 dark:hover:bg-white/10"}`}
        >
          <span className="shrink-0">
            <TaskIcon task={task} size={34} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-ink">{task.title}</span>
            {line && <span className="block truncate text-[13px] text-ink-2">{line}</span>}
          </span>
          {busy && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold text-snow">{busy}</span>}
        </div>
      </motion.div>
    </motion.div>
  );
}
