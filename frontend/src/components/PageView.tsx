"use client";

/* The live page Jagora is working on, with its cursor and the ring that shows where to look. In demo mode the page is
   the real practice website inside the app; with the backend it is the live picture of Jagora's browser. */
import { LockSimple, X } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { activeTask, useApp } from "@/lib/store";
import { registerFrame } from "@/lib/engine/frame";
import { live } from "@/lib/engine";
import { onRemoteFrame, remoteInput, remotePoint, remoteTakeover, remoteTranslate, requestKeyframe, videoFailed } from "@/lib/engine/remote";
import { Painter } from "@/lib/liveview";
import { PAGE_PILL, PILL } from "@/lib/glassRegistry";
import { Glass } from "./glass/Glass";

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

/** full: the phone browser look. The website fills the whole screen, edge to edge, and the address bar floats over
    it at the top (the bottom bar floats over it at the bottom), like Chrome and Safari. */
export function PageView({ compact = false, bar = true, full = false, onClose }: { compact?: boolean; bar?: boolean; full?: boolean; onClose?: () => void }) {
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
  const pointAsk = (() => {
    const m = task?.messages.findLast((x) => x.kind === "pointask");
    return m && m.kind === "pointask" && m.status === "waiting" ? m : null;
  })();

  return (
    <div className={full ? "relative h-full" : "flex h-full min-h-0 flex-col"}>
      {bar && (
        <div className={`flex items-center gap-2 ${full ? "absolute inset-x-0 top-0 z-30 px-3 pt-[max(10px,env(safe-area-inset-top))]" : compact ? "px-1 pb-2 pt-1" : "px-4 py-3"}`}>
          <Glass radius={24} bezel={14} refraction={30} blur={10} tint="rgba(255,255,255,.6)" lens={full ? PAGE_PILL : PILL} lensTint={full ? 0.62 : 0.3} overContent={!live} className="min-w-0 flex-1">
            <div className="flex h-12 items-center gap-2 px-4 text-[14.5px] font-semibold text-ink">
              <LockSimple size={14} weight="bold" className="shrink-0 text-ok" />
              <span className="truncate">{host || "Ready"}</span>
              {task?.status === "working" && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
            </div>
          </Glass>
          {live && task && <TranslateButton />}
          {live && task && <TakeOverButton taskId={task.id} on={takeover} />}
          {onClose && (
            <Glass radius={24} bezel={14} refraction={30} blur={10} tint="rgba(255,255,255,.6)" lens={full ? PAGE_PILL : PILL} lensTint={full ? 0.62 : 0.3} overContent={!live} pressable>
              <button onClick={onClose} className="grid h-12 w-12 place-items-center text-ink" aria-label="Close page">
                <X size={17} weight="bold" />
              </button>
            </Glass>
          )}
        </div>
      )}
      <div ref={stage} className={`${full ? "absolute inset-0" : "relative min-h-0 flex-1 rounded-[22px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.8)]"} overflow-hidden bg-white ${takeover || needsHer ? "ring-2 ring-inset ring-accent" : ""}`}>
        {live ? (
          <LiveStage taskId={task?.id ?? ""} interactive={takeover || needsHer || task?.status !== "working"} pointer={pointer} full={full} pointAsk={pointAsk} />
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
      </div>
    </div>
  );
}

const LANG_NAME: Record<string, string> = { yo: "Yorùbá", ha: "Hausa", ig: "Igbo" };
/** the page in her language, or as published */
export function TranslateButton({ small = false }: { small?: boolean }) {
  const lang = useApp((s) => s.lang);
  const on = useApp((s) => s.translatePages);
  if (!LANG_NAME[lang]) return null;
  return (
    <button
      onClick={() => void remoteTranslate(!on)}
      title={on ? "Show the page as published" : `Show the page in ${LANG_NAME[lang]}`}
      className={`shrink-0 rounded-full font-semibold transition active:scale-95 ${small ? "-mr-1 h-7 px-3 text-[12.5px]" : "h-12 px-4 text-[14px]"} ${on ? "bg-ink text-paper" : "bg-white/80 text-ink"}`}
    >
      {on ? LANG_NAME[lang] : "Original"}
    </button>
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
      className={`h-12 shrink-0 rounded-full px-4 text-[14px] font-semibold transition active:scale-95 ${on ? "bg-accent text-snow" : "bg-ink text-paper"}`}
    >
      {L[lang]}
    </button>
  );
}

/** The live picture of Jagora's browser, with the highlight and cursor placed on it at the right scale. While she has
    taken over (or Jagora waits for her), her taps, typing and scrolling go to the real page. */
function LiveStage({ taskId, interactive, pointer, full, pointAsk }: { taskId: string; interactive: boolean; pointer: { x: number; y: number; visible: boolean; clicking: boolean }; full: boolean; pointAsk: { id: string; question: string } | null }) {
  const size = useApp((s) => s.pageSize);
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLCanvasElement>(null);
  const keys = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState(false); // a first picture has arrived
  const [fit, setFit] = useState({ s: 1, left: 0, w: 0, h: 0 });

  // the live page is painted on a canvas: video frames or photos (lib/liveview.ts)
  useEffect(() => {
    const c = img.current;
    if (!c) return;
    const painter = new Painter(c, { needKey: requestKeyframe, videoBroken: videoFailed });
    painter.onSize = () => setSrc(true);
    const off = onRemoteFrame((f) => painter.push(f));
    return () => {
      off();
      painter.reset();
    };
  }, []);

  // where the picture sits inside the box: scale it to the box width (phones) or to fit (desktop), from the top
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth, H = el.clientHeight;
      // full screen on a phone: the page always fills the width, like a real browser
      const s = full ? W / size.w : Math.min(W / size.w, H / size.h);
      setFit({ s, left: (W - size.w * s) / 2, w: size.w * s, h: size.h * s });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h, full]);

  /* her finger scrolls the real page, any time (like a browser): moves are gathered and sent ~20 times a second,
     and a quick flick at the end carries on a little */
  const drag = useRef<{ y: number; t: number; v: number; pending: number; timer: number } | null>(null);
  const flush = () => {
    const d = drag.current;
    if (!d || !d.pending) return;
    void remoteInput(taskId, { action: "scroll", dy: d.pending });
    d.pending = 0;
  };
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      drag.current = { y: e.touches[0].clientY, t: performance.now(), v: 0, pending: 0, timer: window.setInterval(flush, 50) };
    },
    onTouchMove: (e: React.TouchEvent) => {
      const d = drag.current;
      if (!d || e.touches.length !== 1) return;
      const y = e.touches[0].clientY, now = performance.now();
      const dy = (d.y - y) / (fit.s || 1); // screen pixels -> page pixels
      d.v = dy / Math.max(1, now - d.t);
      d.pending += dy;
      d.y = y;
      d.t = now;
    },
    onTouchEnd: () => {
      const d = drag.current;
      if (!d) return;
      clearInterval(d.timer);
      if (performance.now() - d.t < 80 && Math.abs(d.v) > 0.3) d.pending += Math.max(-1600, Math.min(1600, d.v * 320)); // a flick
      flush();
      drag.current = null;
    },
  };

  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = img.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h };
  };

  return (
    <div ref={box} className="relative h-full w-full bg-white" onWheel={(e) => void remoteInput(taskId, { action: "scroll", dy: e.deltaY / fit.s })} {...swipe}>
      <canvas
        ref={img}
        role="img"
        aria-label="The page Jagora is working on"
        onClick={(e) => {
          if (pointAsk) {
            // she shows Jagora what she means
            const p = toPage(e);
            if (p) void remotePoint(taskId, pointAsk.id, p.x, p.y);
            return;
          }
          if (!interactive) return;
          const p = toPage(e);
          if (p) void remoteInput(taskId, { action: "tap", ...p });
          keys.current?.focus({ preventScroll: true });
        }}
        className={`absolute top-0 touch-none select-none ${pointAsk ? "cursor-crosshair" : interactive ? "cursor-pointer" : ""} ${src ? "" : "invisible"}`}
        style={{ left: fit.left, width: fit.w, height: fit.h }}
      />
      {!src && (
        <div className="absolute inset-0 grid place-items-center text-sm text-ink-3">
          <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Opening the page</span>
        </div>
      )}
      {pointAsk && (
        <div className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4 ${full ? "top-[calc(max(10px,env(safe-area-inset-top))+64px)]" : "top-3"}`}>
          <Glass radius={22} lens={PILL} lensTint={0.6} className="max-w-[440px]">
            <p className="px-4 py-2.5 text-center text-[15px] font-semibold text-ink">{pointAsk.question}</p>
          </Glass>
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
