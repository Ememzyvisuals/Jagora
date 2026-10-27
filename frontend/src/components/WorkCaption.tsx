"use client";

/* On the phone, while Jagora works on a page: one floating line above the bar saying what it is doing right now, or
   what it just found, with the little cloud. Tap it for the whole conversation. */
import { AnimatePresence, motion } from "motion/react";
import { activeTask, useApp, type Msg } from "@/lib/store";
import { useSpeakingPulse } from "@/lib/voice";
import { Orb } from "./Orb";

function current(messages: Msg[]): { text: string; needs: boolean } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if ((m.kind === "confirm" && m.status === "waiting") || (m.kind === "choice" && !m.picked)) return { text: m.question, needs: true };
    if ((m.kind === "handoff" || m.kind === "secret") && m.status === "waiting") return { text: m.kind === "secret" ? m.label : m.text, needs: true };
    if (m.kind === "step" && !m.guard) return { text: m.text, needs: false };
    if (m.kind === "agent") return { text: m.text, needs: false };
    if (m.kind === "evidence") return { text: m.claim, needs: false };
  }
  return null;
}

export function WorkCaption({ onOpen }: { onOpen: () => void }) {
  const task = useApp(activeTask);
  const orb = useApp((s) => s.orb);
  const pulse = useSpeakingPulse(orb === "speaking");
  const line = task ? current(task.messages) : null;
  const show = !!task && !!line && (task.status === "working" || task.status === "waiting");
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          key="cap"
          onClick={onOpen}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className={`absolute inset-x-4 bottom-[calc(max(10px,env(safe-area-inset-bottom))+70px)] z-40 flex items-center gap-3 rounded-[24px] px-3.5 py-3 text-left shadow-[0_18px_40px_-18px_rgba(10,30,70,.55)] backdrop-blur-xl ${line!.needs ? "bg-ink text-paper" : "bg-white/88 text-ink dark:bg-[#23262d]/90"}`}
        >
          <span className="shrink-0">
            <Orb size={34} state={orb} levelRef={pulse} />
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={line!.text} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="line-clamp-2 min-w-0 flex-1 text-[15px] leading-snug">
              {line!.text}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
