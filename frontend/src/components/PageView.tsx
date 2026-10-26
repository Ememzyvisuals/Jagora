"use client";

/* The live page Jagora is working on, with its cursor and the ring that shows where to look. In demo mode the page is
   the real practice website inside the app; with the backend it is the live picture of Jagora's browser. */
import { LockSimple, X } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { activeTask, useApp } from "@/lib/store";
import { registerFrame } from "@/lib/engine/frame";
import { live } from "@/lib/engine";
import { onRemoteFrame } from "@/lib/engine/remote";

export function Cursor({ x, y, visible, clicking }: { x: number; y: number; visible: boolean; clicking: boolean }) {
  return (
    <motion.div
      className="pointer-events-none absolute left-0 top-0 z-30"
      initial={false}
      animate={{ x, y, opacity: visible ? 1 : 0, scale: clicking ? 0.86 : 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 22, mass: 0.9 }}
    >
      <svg width="22" height="26" viewBox="0 0 26 30" className="drop-shadow-[0_6px_10px_rgba(60,38,16,.35)]">
        <path d="M3 2l19 12-8.5 1.8L9 27z" fill="#0E0F12" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
      <span className="absolute left-5 top-5 rounded-full rounded-tl-[4px] bg-ink px-2.5 py-1 text-[11px] font-medium text-white shadow-lg">
        Jagora
      </span>
    </motion.div>
  );
}

export function Ring() {
  const h = useApp((s) => s.highlight);
  return (
    <AnimatePresence>
      {h && (
        <motion.div
          key="ring"
          className="pointer-events-none absolute left-0 top-0 z-20 rounded-[12px]"
          initial={{ opacity: 0, x: h.x - 5, y: h.y - 5, width: h.w + 10, height: h.h + 10 }}
          animate={{ opacity: 1, x: h.x - 5, y: h.y - 5, width: h.w + 10, height: h.h + 10 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 160, damping: 24 }}
          style={{
            boxShadow:
              h.tone === "stop"
                ? "0 0 0 2px #B2431C, 0 0 0 7px rgba(178,67,28,.16)"
                : "0 0 0 2px #1D63ED, 0 0 0 7px rgba(29,99,237,.18)",
          }}
        />
      )}
    </AnimatePresence>
  );
}

export function PageView({ compact = false, onClose }: { compact?: boolean; onClose?: () => void }) {
  const task = useApp(activeTask);
  const pointer = useApp((s) => s.pointer);
  const stage = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);

  useEffect(() => {
    registerFrame(iframe.current, stage.current);
    return () => {
      registerFrame(null, null);
    };
  }, [task?.id]);

  useEffect(() => {
    if (!live) return;
    onRemoteFrame((jpeg) => setFrameSrc(`data:image/jpeg;base64,${jpeg}`));
    return () => {
      onRemoteFrame(null);
    };
  }, []);

  const url = task?.url || "";
  const host = url.startsWith("/practice/") ? "practice.jagora.app" : url.replace(/^https?:\/\//, "").split("/")[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`flex items-center gap-2 ${compact ? "px-3 pb-2 pt-1" : "px-4 py-3"}`}>
        <div className="glass-2 flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-4 text-[13.5px] text-ink-2">
          <LockSimple size={14} weight="bold" className="shrink-0 text-ok" />
          <span className="truncate">{host || "Ready"}</span>
          {task?.status === "working" && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
        </div>
        {onClose && (
          <button onClick={onClose} className="btn btn-glass h-10 w-10 shrink-0" aria-label="Close page">
            <X size={16} weight="bold" />
          </button>
        )}
      </div>
      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden rounded-[22px] bg-white/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,.8)]">
        {live ? (
          frameSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frameSrc} alt="The page Jagora is working on" className="h-full w-full object-contain object-top" />
          ) : (
            <div className="grid h-full place-items-center text-sm text-ink-3">Waiting for the page</div>
          )
        ) : (
          <iframe
            key={task?.id ?? "none"}
            ref={(el) => {
              iframe.current = el;
              registerFrame(el, stage.current);
            }}
            src={url || "about:blank"}
            title="The page Jagora is working on"
            className="h-full w-full border-0"
          />
        )}
        <Ring />
        <Cursor {...pointer} />
      </div>
    </div>
  );
}
