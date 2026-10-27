"use client";

/* The live page Jagora is working on, with its cursor and the ring that shows where to look. In demo mode the page is
   the real practice website inside the app; with the backend it is the live picture of Jagora's browser. */
import { LockSimple, X } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { activeTask, useApp } from "@/lib/store";
import { registerFrame } from "@/lib/engine/frame";
import { live } from "@/lib/engine";
import { onRemoteFrame, remoteInput, remoteTakeover } from "@/lib/engine/remote";

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
      <span className="absolute left-5 top-5 rounded-full rounded-tl-[4px] bg-ink px-2.5 py-1 text-[11px] font-medium text-paper shadow-lg">
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

export function PageView({ compact = false, bar = true, onClose }: { compact?: boolean; bar?: boolean; onClose?: () => void }) {
  const task = useApp(activeTask);
  const pointer = useApp((s) => s.pointer);
  const takeover = useApp((s) => s.takeover);
  const stage = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    registerFrame(iframe.current, stage.current);
    return () => {
      registerFrame(null, null);
    };
  }, [task?.id]);

  const url = task?.url || "";
  const host = url.startsWith("/practice/") ? "practice.jagora.app" : url.replace(/^https?:\/\//, "").split("/")[0];
  const needsHer = (() => {
    const last = task?.messages.at(-1);
    return !!last && (last.kind === "handoff" || last.kind === "secret") && last.status === "waiting";
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {bar && <div className={`flex items-center gap-2 ${compact ? "px-3 pb-2 pt-1" : "px-4 py-3"}`}>
        <div className="glass-2 flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full px-4 text-[13.5px] text-ink-2">
          <LockSimple size={14} weight="bold" className="shrink-0 text-ok" />
          <span className="truncate">{host || "Ready"}</span>
          {task?.status === "working" && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
        </div>
        {live && task && <TakeOverButton taskId={task.id} on={takeover} />}
        {onClose && (
          <button onClick={onClose} className="btn btn-glass h-10 w-10 shrink-0" aria-label="Close page">
            <X size={16} weight="bold" />
          </button>
        )}
      </div>}
      <div ref={stage} className={`relative min-h-0 flex-1 overflow-hidden rounded-[22px] bg-white/80 shadow-[inset_0_0_0_1px_rgba(255,255,255,.8)] ${takeover || needsHer ? "ring-2 ring-accent" : ""}`}>
        {live ? (
          <LiveStage taskId={task?.id ?? ""} interactive={takeover || needsHer || task?.status !== "working"} pointer={pointer} />
        ) : (
          <>
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
            <Ring />
            <Cursor {...pointer} />
          </>
        )}
        <AgentGlow />
      </div>
    </div>
  );
}

function TakeOverButton({ taskId, on }: { taskId: string; on: boolean }) {
  const lang = useApp((s) => s.lang);
  const L = on
    ? { en: "Hand back", pcm: "Give am back", yo: "Dá a padà", ha: "Mayar", ig: "Nyeghachi" }
    : { en: "Take over", pcm: "Make I do am", yo: "Jẹ́ kí n ṣe é", ha: "Bari in yi", ig: "Ka m mee ya" };
  return (
    <button
      onClick={() => void remoteTakeover(taskId, !on)}
      className={`h-10 shrink-0 rounded-full px-4 text-[13.5px] font-semibold transition active:scale-95 ${on ? "bg-accent text-snow" : "glass-2 text-ink"}`}
    >
      {L[lang]}
    </button>
  );
}

/** The live picture of Jagora's browser, with the highlight and cursor placed on it at the right scale. While she has
    taken over (or Jagora waits for her), her taps, typing and scrolling go to the real page. */
function LiveStage({ taskId, interactive, pointer }: { taskId: string; interactive: boolean; pointer: { x: number; y: number; visible: boolean; clicking: boolean } }) {
  const size = useApp((s) => s.pageSize);
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const keys = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState("");
  const [fit, setFit] = useState({ s: 1, left: 0, w: 0, h: 0 });

  useEffect(() => onRemoteFrame((jpeg) => setSrc(`data:image/jpeg;base64,${jpeg}`)), []);

  // where the picture sits inside the box: scale it to the box width (phones) or to fit (desktop), from the top
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth, H = el.clientHeight;
      const s = Math.min(W / size.w, H / size.h);
      setFit({ s, left: (W - size.w * s) / 2, w: size.w * s, h: size.h * s });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h]);

  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = img.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h };
  };

  return (
    <div ref={box} className="relative h-full w-full bg-[#f4f6f9]" onWheel={(e) => interactive && void remoteInput(taskId, { action: "scroll", dy: e.deltaY })}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          src={src}
          alt="The page Jagora is working on"
          draggable={false}
          onClick={(e) => {
            if (!interactive) return;
            const p = toPage(e);
            if (p) void remoteInput(taskId, { action: "tap", ...p });
            keys.current?.focus({ preventScroll: true });
          }}
          className={`absolute top-0 select-none ${interactive ? "cursor-pointer" : ""}`}
          style={{ left: fit.left, width: fit.w, height: fit.h }}
        />
      ) : (
        <div className="grid h-full place-items-center text-sm text-ink-3">
          <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Opening the page</span>
        </div>
      )}
      {/* page coordinates -> screen: the highlight ring and cursor live in a layer the size of the page, scaled */}
      <div className="pointer-events-none absolute top-0 origin-top-left" style={{ left: fit.left, width: size.w, height: size.h, transform: `scale(${fit.s})` }}>
        <Ring />
        <Cursor {...pointer} />
      </div>
      {/* her keyboard, while she has the page */}
      <input
        ref={keys}
        aria-label="Type on the page"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="absolute -left-[9999px] h-px w-px opacity-0"
        onKeyDown={(e) => {
          if (!interactive) return;
          if (["Enter", "Backspace", "Tab", "Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Delete"].includes(e.key)) {
            e.preventDefault();
            void remoteInput(taskId, { action: "key", key: e.key });
          }
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          if (interactive && el.value) void remoteInput(taskId, { action: "type", text: el.value });
          el.value = "";
        }}
      />
    </div>
  );
}

/** Siri-style light around the edge while Jagora works on the page: soft, moving colour, not a spinner. */
export function AgentGlow({ force = false }: { force?: boolean }) {
  const task = useApp(activeTask);
  const orb = useApp((s) => s.orb);
  const takeover = useApp((s) => s.takeover);
  const on = force || (!!task && task.status === "working" && !takeover) || orb === "speaking";
  return (
    <AnimatePresence>
      {on && (
        <motion.div
          key="glow"
          aria-hidden
          className="agent-glow pointer-events-none absolute inset-0 z-40 rounded-[inherit]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        />
      )}
    </AnimatePresence>
  );
}
