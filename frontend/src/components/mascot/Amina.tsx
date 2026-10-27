"use client";

/* Amina on the page. One small transparent canvas that moves around the screen:
   - she peeks over the ask box in the hero, in from the screen edges at the card stack, the phones, the safety
     list and the languages (saying hello in each one), and sits on the Meta logo in the footer, legs swinging;
   - she follows the cursor with her eyes, waves when tapped, hops on a double tap, gets dizzy when tapped a lot,
     can be picked up and dropped with the mouse (then walks back), sways when the page is scrolled fast, leans with
     the phone, points at the main buttons, stretches and checks the time when nobody moves, and waves on return.
   Places on the page are marked with data-amina="hero|cards|phones|safety|languages", the seat with
   data-amina-seat, buttons she points at with data-amina-point, and language lines with data-amina-say.
   She loads after the page is idle, draws only while visible, sits still when the visitor prefers less motion,
   and can be hidden from the footer. */
import { useEffect, useRef, useState } from "react";
import { siMeta } from "simple-icons";
import type { AminaStage, Gesture } from "./engine";

type Kind = "over" | "edgeL" | "edgeR" | "seat" | "corner";
type Spot = { id: string; kind: Kind; gesture: Gesture; persistent?: boolean; el?: Element | null; say?: string };

const PLAN: Record<string, Omit<Spot, "id" | "el">> = {
  hero: { kind: "over", gesture: "wave", say: "Hi, I'm Amina!" },
  cards: { kind: "edgeL", gesture: "pointR" },
  phones: { kind: "edgeR", gesture: "watch" },
  safety: { kind: "edgeL", gesture: "shush", say: "Your secrets stay yours." },
  languages: { kind: "edgeR", gesture: "none", persistent: true },
};
const HIDE_KEY = "jagora:amina";
const sm = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function aminaHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === "off";
  } catch {
    return false;
  }
}
export function setAminaHidden(off: boolean) {
  try {
    localStorage.setItem(HIDE_KEY, off ? "off" : "on");
  } catch {}
  window.dispatchEvent(new Event("amina:toggle"));
}

export function Amina() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!aminaHidden());
    sync();
    window.addEventListener("amina:toggle", sync);
    return () => window.removeEventListener("amina:toggle", sync);
  }, []);
  return on ? <Stage /> : null;
}

function Stage() {
  const box = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current!, canvas = cvs.current!, bub = bubble.current!;
    let stage: AminaStage | null = null;
    let dead = false;
    let raf = 0;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) < 3;
    let W = 0, H = 0;
    const size = () => {
      const small = innerWidth < 640;
      W = small ? 150 : 210;
      H = small ? 205 : 286;
      el.style.width = `${W}px`;
      el.style.height = `${H}px`;
      stage?.resize(W, H);
    };
    size();

    /* --- where she is --- */
    const done = new Set<string>();
    let spot: Spot | null = null;
    let phase = 0; // 0 hidden .. 1 fully in
    let dir = 0; // +1 coming in, -1 going out
    let holdUntil = 0;
    let holdFor = 0;
    let gestureUntil = 0;
    let say = "";
    let sayUntil = 0;
    let lastMove = performance.now();
    let idleStage = 0;
    let hiddenAt = 0;
    let lastScroll = scrollY;
    let pos = { x: -999, y: -999 }; // container top-left, viewport px
    let drag: { on: boolean; sx: number; sy: number; px: number; py: number; moved: boolean } | null = null;
    let walkBack = 0;
    let taps: number[] = [];
    let lastLine: Element | null = null;
    let scale = 1;
    let seatStage: "drop" | "land" | "sat" = "drop";
    let landAt = 0;
    let flat: SVGElement | null = null;

    const anchors = () => {
      const list: Spot[] = [];
      document.querySelectorAll<HTMLElement>("[data-amina]").forEach((n) => {
        const id = n.dataset.amina!;
        if (PLAN[id]) list.push({ id, el: n, ...PLAN[id] });
      });
      return list;
    };
    const seatEl = () => document.querySelector("[data-amina-seat]");
    const inView = (r: DOMRect, band = 0.3) => r.top + r.height / 2 > innerHeight * band && r.top + r.height / 2 < innerHeight * (1 - band);
    const visible = (r: DOMRect) => r.bottom > 0 && r.top < innerHeight;

    const speak = (text: string, ms = 2600) => {
      say = text;
      sayUntil = performance.now() + ms;
      if (stage) stage.talk = true;
    };
    const react = (g: Gesture, ms: number, mood: "happy" | "fun" | "calm" = "happy") => {
      if (!stage) return;
      stage.play(g);
      stage.mood = mood;
      gestureUntil = performance.now() + ms;
      holdUntil = Math.max(holdUntil, performance.now() + ms + 1200);
    };
    const enter = (s: Spot) => {
      spot = s;
      dir = 1;
      phase = s.kind === "seat" ? 0 : phase;
      holdUntil = 1e15; // the stay starts once she has fully arrived
      holdFor = s.persistent || s.kind === "seat" ? 1e12 : 4200;
      if (s.kind === "seat") seatStage = "drop";
      if (stage) {
        stage.useSeat(s.kind === "seat" ? siMeta.path : null);
        stage.base = s.kind === "seat" ? "dangle" : "stand";
        stage.play(calm ? "none" : s.gesture);
        stage.mood = s.kind === "seat" ? "happy" : "calm";
      }
      if (s.say && !calm) setTimeout(() => spot === s && speak(s.say!), 650);
    };
    const leave = () => {
      dir = -1;
      say = "";
    };

    /* choose where to be */
    const choose = () => {
      const seat = seatEl();
      if (seat && visible(seat.getBoundingClientRect())) {
        if (spot?.kind !== "seat") {
          if (spot && phase > 0.05) return leave();
          enter({ id: "seat", kind: "seat", gesture: "none", el: seat });
        }
        return;
      }
      if (spot?.kind === "seat") return leave();
      if (calm) return;
      if (spot) {
        const r = spot.el?.getBoundingClientRect();
        const stillHere = spot.kind === "corner" || (r && visible(r) && (spot.persistent ? inView(r, 0.15) : true));
        if (!stillHere || performance.now() > holdUntil) {
          if (dir !== -1) {
            done.add(spot.id);
            leave();
          }
        }
        return;
      }
      for (const s of anchors()) {
        if (done.has(s.id) && !s.persistent) continue;
        const r = s.el!.getBoundingClientRect();
        if (s.persistent ? inView(r, 0.15) : inView(r)) return enter(s);
      }
    };

    /* where the canvas goes this frame */
    const place = (dt: number) => {
      if (!stage || !spot) return;
      const sp = spot;
      const r = sp.el?.getBoundingClientRect() ?? new DOMRect(0, innerHeight, innerWidth, 0);
      const e = sm(phase);
      const head = stage.screenOf("head") ?? { x: W / 2, y: H * 0.15 };
      const small = innerWidth < 640;
      let tx = 0, ty = 0, clip = "none";
      scale = 1;
      stage.yaw = 0;
      stage.leanTo = 0;
      if (sp.kind === "over" || sp.kind === "corner") {
        const line = sp.kind === "corner" ? innerHeight : r.top + 3;
        tx = sp.kind === "corner" ? (small ? 70 : 110) : r.right - (small ? 52 : 92);
        ty = line - (small ? 44 : 62) * e + 150 * (1 - e);
        const cut = Math.max(0, pos.y + H - line);
        clip = `inset(0 0 ${cut}px 0)`;
        stage.yaw = -0.15;
        el.style.opacity = "1";
      } else if (sp.kind === "edgeL" || sp.kind === "edgeR") {
        el.style.opacity = "1";
        const left = sp.kind === "edgeL";
        const inX = small ? 34 : 52;
        tx = left ? -150 + (150 + inX) * e : innerWidth + 150 - (150 + inX) * e;
        ty = Math.min(innerHeight * 0.7, Math.max(innerHeight * 0.3, r.top + r.height / 2));
        if (sp.id === "languages") {
          const line = [...document.querySelectorAll<HTMLElement>("[data-amina-say]")].find((n) => inView(n.getBoundingClientRect(), 0.4));
          if (line) {
            ty = line.getBoundingClientRect().top + 10;
            if (line !== lastLine && phase > 0.8) {
              lastLine = line;
              speak(line.dataset.aminaSay || "", 2400);
            }
          }
        }
        stage.yaw = left ? 0.5 : -0.5;
        stage.leanTo = left ? 1.4 : -1.4;
      } else if (sp.kind === "seat") {
        // she drops onto the 3D Meta logo, lands on her feet, then lowers herself to sit, legs over the front
        stage.yaw = -0.35;
        stage.dropY = (1 - e) * 0.9;
        el.style.opacity = String(Math.min(1, phase * 3));
        if (phase >= 1 && dir === 1 && seatStage === "drop") {
          seatStage = "land";
          landAt = performance.now();
          stage.base = "stand";
        }
        if (seatStage === "land" && performance.now() - landAt > 420) {
          seatStage = "sat";
          stage.base = "sit";
        }
        if (dir === -1) stage.base = "dangle";
        const box = stage.seatOnCanvas();
        if (box) {
          // the 3D logo lands exactly on top of the flat one: same width, same centre
          scale = (r.width * 0.98) / Math.max(1, box.right - box.left);
          pos = { x: r.left + r.width / 2 - ((box.left + box.right) / 2) * scale, y: r.top + r.height / 2 - ((box.top + box.bottom) / 2) * scale };
        }
        flat = flat ?? (sp.el?.querySelector("svg") as SVGElement | null);
        if (flat) flat.style.visibility = "hidden";
        el.style.clipPath = "none";
        return;
      }
      if (drag?.on) return;
      if (walkBack > 0) {
        const want = { x: tx - head.x, y: ty - head.y };
        const dx = want.x - pos.x, dy = want.y - pos.y;
        const d = Math.hypot(dx, dy);
        const v = 420 * dt;
        if (d <= v) {
          pos = want;
          walkBack = 0;
          stage.base = "stand";
        } else {
          pos = { x: pos.x + (dx / d) * v, y: pos.y + (dy / d) * v };
          stage.yaw = dx > 0 ? 1.2 : -1.2;
        }
      } else pos = { x: tx - head.x, y: ty - head.y };
      el.style.clipPath = clip;
    };

    const loop = (now: number, last: number) => {
      if (dead || !stage) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      choose();
      if (spot) {
        phase = Math.max(0, Math.min(1, phase + dir * dt * (spot.kind === "seat" ? 1.6 : 1.5)));
        if (phase === 1 && dir === 1 && holdFor) {
          holdUntil = Math.min(holdUntil, performance.now() + holdFor);
          holdFor = 0;
        }
        if (dir === -1 && phase === 0) {
          if (spot.kind === "seat") {
            stage.useSeat(null);
            if (flat) flat.style.visibility = "";
            seatStage = "drop";
          }
          if (spot.kind !== "seat" && !spot.persistent) done.add(spot.id);
          spot = null;
          dir = 0;
          stage.talk = false;
        }
      }
      // gestures and idle life
      const t = performance.now();
      if (gestureUntil && t > gestureUntil) {
        gestureUntil = 0;
        stage.play(spot && !calm ? (spot.kind === "seat" ? "none" : spot.gesture) : "none");
        stage.mood = spot?.kind === "seat" ? "happy" : "calm";
      }
      if (sayUntil && t > sayUntil) {
        sayUntil = 0;
        say = "";
        stage.talk = false;
      }
      if (spot && phase > 0.9 && !calm && !gestureUntil) {
        const idle = t - lastMove;
        if (idle > 20000 && idleStage === 0) {
          idleStage = 1;
          react("stretch", 2600, "calm");
        } else if (idle > 23500 && idleStage === 1) {
          idleStage = 2;
          react("wrist", 2600, "calm");
        }
      }
      // fast scrolling shoves her a little
      const sv = scrollY - lastScroll;
      lastScroll = scrollY;
      if (Math.abs(sv) > 18) stage.nudge(sv / 120);

      if (spot || phase > 0) {
        el.style.display = "block";
        place(dt);
        el.style.transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0) scale(${scale})`;
        stage.frame(dt);
        // the speech bubble rides next to her head
        if (say) {
          const hp = stage.screenOf("head")!;
          const right = (spot?.kind === "edgeR");
          bub.textContent = say;
          bub.style.opacity = "1";
          const bw = bub.offsetWidth;
          const bx = pos.x + hp.x * scale + (right ? -bw - 34 : 34);
          bub.style.transform = `translate3d(${Math.round(Math.max(8, Math.min(innerWidth - bw - 8, bx)))}px, ${Math.round(pos.y + hp.y * scale - 46)}px, 0)`;
        } else bub.style.opacity = "0";
      } else {
        el.style.display = "none";
        bub.style.opacity = "0";
      }
      raf = requestAnimationFrame((n) => loop(n, now));
    };

    /* --- the visitor --- */
    const local = (x: number, y: number) => ({ x: (x - pos.x) / scale, y: (y - pos.y) / scale });
    const onHer = (x: number, y: number) => {
      if (!stage || !spot || phase < 0.6) return false;
      const p = local(x, y);
      return p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H && stage.hit(p.x, p.y);
    };
    const onMove = (e: PointerEvent) => {
      lastMove = performance.now();
      idleStage = 0;
      if (!stage) return;
      stage.look = local(e.clientX, e.clientY);
      if (drag?.on) {
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
          drag.moved = true;
          stage.base = "dangle";
          stage.play("none");
          stage.mood = "fun";
        }
        if (drag.moved) {
          const chest = stage.screenOf("chest") ?? { x: W / 2, y: H * 0.35 };
          pos = { x: e.clientX - chest.x, y: e.clientY - chest.y + 12 };
        }
        return;
      }
      if (e.pointerType === "mouse") document.documentElement.style.cursor = onHer(e.clientX, e.clientY) ? "pointer" : "";
    };
    const onDown = (e: PointerEvent) => {
      if (!onHer(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      drag = { on: e.pointerType === "mouse" && spot?.kind !== "seat", sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y, moved: false };
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.moved && stage) {
        stage.base = "walk";
        stage.mood = "happy";
        walkBack = 1;
        holdUntil = Math.max(holdUntil, performance.now() + 5000);
        return;
      }
      if (!onHer(e.clientX, e.clientY)) return;
      const t = performance.now();
      taps = [...taps.filter((x) => t - x < 3000), t];
      const quick = taps.filter((x) => t - x < 700).length;
      if (taps.length >= 5) {
        taps = [];
        react("dizzy", 2200, "fun");
        speak("Whoa, I'm dizzy!", 2000);
      } else if (quick >= 2) react("hop", 1600, "fun");
      else {
        react(spot?.kind === "seat" ? "hello" : "wave", 1800, "happy");
        if (!say) speak(["Hi! I'm Amina.", "Ẹ n lẹ́!", "Sannu!", "Ndeewo!", "How far?"][Math.floor(Math.random() * 5)], 1800);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (onHer(e.clientX, e.clientY)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onPointAt = (e: Event) => {
      if (!stage || !spot || phase < 0.9 || calm) return;
      const r = (e.currentTarget as Element).getBoundingClientRect();
      const hp = stage.screenOf("head");
      if (!hp) return;
      react(r.left + r.width / 2 < pos.x + hp.x ? "pointL" : "pointR", 1800, "happy");
    };
    const onSeatClick = () => spot?.kind === "seat" && react("bounce", 1200, "fun");
    const onVis = () => {
      if (document.hidden) return void (hiddenAt = performance.now());
      if (!hiddenAt || performance.now() - hiddenAt < 5000 || calm) return;
      hiddenAt = 0;
      if (spot) {
        react("hello", 1800);
        speak("Welcome back!", 2000);
      } else enter({ id: "corner", kind: "corner", gesture: "hello", say: "Welcome back!" });
    };
    const onTilt = (e: DeviceOrientationEvent) => stage?.setTilt(e.gamma ?? 0);

    /* --- start, once the page has settled --- */
    const boot = async () => {
      try {
        const { AminaStage } = await import("./engine");
        if (dead) return;
        const s = new AminaStage(canvas, W, H);
        await s.load("/mascot/amina.vrm");
        if (dead) return s.dispose();
        stage = s;
        (window as unknown as { __amina?: unknown }).__amina = { stage: s, state: () => ({ spot: spot?.id ?? null, phase, dir, pos, say }), go: (id: string) => { done.delete(id); spot = null; phase = 0; const a = anchors().find((x) => x.id === id); if (a) enter(a); } };
        const now = performance.now();
        raf = requestAnimationFrame((n) => loop(n, now));
      } catch {
        el.style.display = "none";
      }
    };
    const idle = (cb: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(cb, { timeout: 3500 }) : setTimeout(cb, 1500));
    const start = () => idle(() => void boot());
    if (document.readyState === "complete") start();
    else addEventListener("load", start, { once: true });

    const points = [...document.querySelectorAll("[data-amina-point]")];
    points.forEach((p) => p.addEventListener("pointerenter", onPointAt));
    const seat = seatEl();
    seat?.addEventListener("click", onSeatClick);
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown, { capture: true });
    addEventListener("pointerup", onUp, { capture: true });
    addEventListener("click", onClick, { capture: true });
    addEventListener("resize", size);
    addEventListener("deviceorientation", onTilt);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      points.forEach((p) => p.removeEventListener("pointerenter", onPointAt));
      seat?.removeEventListener("click", onSeatClick);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown, { capture: true });
      removeEventListener("pointerup", onUp, { capture: true });
      removeEventListener("click", onClick, { capture: true });
      removeEventListener("resize", size);
      removeEventListener("deviceorientation", onTilt);
      document.removeEventListener("visibilitychange", onVis);
      document.documentElement.style.cursor = "";
      stage?.dispose();
    };
  }, []);

  return (
    <>
      <div ref={box} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[60] hidden origin-top-left will-change-transform">
        <canvas ref={cvs} className="h-full w-full" />
      </div>
      <div
        ref={bubble}
        aria-live="polite"
        className="pointer-events-none fixed left-0 top-0 z-[61] max-w-[220px] rounded-[18px] bg-ink px-3.5 py-2 text-[14px] font-semibold leading-snug text-paper opacity-0 shadow-lg transition-opacity duration-300"
      />
    </>
  );
}
