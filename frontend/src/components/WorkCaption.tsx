"use client";

/* On the phone, while Jagora works on a page: the big soft cloud floats in the middle at the bottom of the page,
   thinking, speaking or waiting for her. No box, no text over the page. Tap it for the conversation. */
import { AnimatePresence, motion } from "motion/react";
import { activeTask, useApp } from "@/lib/store";
import { useSpeakingPulse } from "@/lib/voice";
import { Orb } from "./Orb";

export function WorkOrb({ onOpen }: { onOpen: () => void }) {
  const task = useApp(activeTask);
  const orb = useApp((s) => s.orb);
  const pulse = useSpeakingPulse(orb === "speaking");
  const show = !!task && (task.status === "working" || task.status === "waiting" || orb === "speaking");
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          key="orb"
          onClick={onOpen}
          aria-label="Open the conversation with Jagora"
          initial={{ opacity: 0, y: 40, scale: 0.7 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.7 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="absolute bottom-[calc(max(10px,env(safe-area-inset-bottom))+58px)] left-1/2 z-40 -translate-x-1/2 rounded-full active:scale-95"
        >
          <motion.span className="block" animate={{ y: [0, -5, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
            <Orb size={124} state={orb} levelRef={pulse} />
          </motion.span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
