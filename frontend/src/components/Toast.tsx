"use client";

/* A banner when something finished on its own (a scheduled task, a reminder): tap to open that chat. */
import { Bell, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useApp } from "@/lib/store";

export function Toast() {
  const toast = useApp((s) => s.toast);
  const setToast = useApp((s) => s.setToast);
  const setActive = useApp((s) => s.setActive);
  const setSheet = useApp((s) => s.setSheet);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 12000);
    return () => clearTimeout(id);
  }, [toast, setToast]);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.task + toast.text}
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed inset-x-3 top-[max(10px,env(safe-area-inset-top))] z-[80] mx-auto flex max-w-[460px] items-start gap-3 rounded-[22px] bg-white/92 p-3.5 shadow-[0_20px_50px_-20px_rgba(10,30,70,.6)] ring-1 ring-black/5 backdrop-blur-xl dark:bg-[#23262d]/95"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-snow">
            <Bell size={19} weight="fill" />
          </span>
          <button onClick={() => (setActive(toast.task), setSheet(true), setToast(null))} className="min-w-0 flex-1 text-left">
            <p className="text-[14px] font-semibold text-ink">{toast.title}</p>
            <p className="line-clamp-2 text-[14px] leading-snug text-ink-2">{toast.text}</p>
          </button>
          <button onClick={() => setToast(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-black/5" aria-label="Close">
            <X size={14} weight="bold" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
