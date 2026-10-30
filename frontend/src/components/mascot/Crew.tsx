"use client";

/* Amina's crew, desktop only. When nobody has touched the screen for a while, two or three small Aminas walk in and
   potter about on the Discover cards (marked data-amina-work) or along the bottom of the screen: one sits on a card's
   edge, one points at it, one climbs onto another's shoulders. Click one and she runs and jumps out of the way; click
   her again while she is running and you have caught her (she laughs and waves). The moment the visitor moves the
   mouse elsewhere, types or scrolls, they hurry off and fade within a second. They take clicks only on their own
   bodies, never sit over a button being aimed at, draw nothing when the tab is hidden, and never come at all on
   phones, when a task is working, or when the visitor prefers less motion. */
import { useEffect, useRef } from "react";
import type { AminaStage, Gesture } from "./engine";
import { useApp } from "@/lib/store";

const IDLE_MS = 25_000;
const W = 150, H = 205; // canvas size of one crew member, CSS px
const FEET = 0.965; // where her feet are on the canvas, as a fraction of its height

type Lang = "en" | "yo" | "ha" | "ig" | "pcm";
const LINES: Record<"caught" | "hello" | "work", Record<Lang, string[]>> = {
  caught: {
    en: ["You caught me!", "Okay, okay, you win!"], pcm: ["You don catch me!", "Okay o, you win!"], yo: ["O ti mú mi!", "Ó dáa, o borí!"],
    ha: ["Ka kama ni!", "To, ka ci!"], ig: ["Ị jidere m!", "Ọ dị mma, i meriri!"],
  },
  hello: { en: ["Hi!", "Hello there!"], pcm: ["How far?", "Hello!"], yo: ["Ẹ n lẹ́!", "Báwo ni?"], ha: ["Sannu!", "Barka!"], ig: ["Ndeewo!", "Kedu?"] },
  work: {
    en: ["Fresh news here.", "This one looks good."], pcm: ["Fresh news dey here.", "This one sweet."], yo: ["Ìròyìn tuntun nìyí.", "Èyí dáa."],
    ha: ["Sabon labari a nan.", "Wannan yana da kyau."], ig: ["Akụkọ ọhụrụ nọ ebe a.", "Nke a mara mma."],
  },
};

type Actor = {
  stage: AminaStage; box: HTMLDivElement; bub: HTMLDivElement;
  x: number; y: number; // feet position, viewport px
  tx: number; ty: number; // where she is going
  mode: "walk" | "work" | "sit" | "ride" | "run" | "caught" | "leave";
  until: number; runV: number; runT: number; jump: number; alpha: number;
  say: string; sayUntil: number; rider: Actor | null; carrier: Actor | null; next: number;
};

export function AminaCrew() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const desktop = matchMedia("(pointer: fine)").matches && innerWidth >= 1024;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) < 4;
    if (!desktop || calm) return;
    const root = host.current!;
    let dead = false, raf = 0, last = performance.now(), active = performance.now(), loading = false;
    let crew: Actor[] = [];
    let pointer = { x: -999, y: -999 };
    const pool: { stage: AminaStage; box: HTMLDivElement; bub: HTMLDivElement }[] = [];
    const lang = () => ((useApp.getState().lang as Lang) in LINES.hello ? (useApp.getState().lang as Lang) : "en");
    const line = (k: keyof typeof LINES) => { const a = LINES[k][lang()]; return a[Math.floor(Math.random() * a.length)]; };
    const busy = () => useApp.getState().tasks.some((t) => t.status === "working" || t.status === "waiting");

    const make = async () => {
      const { AminaStage } = await import("./engine");
      const box = document.createElement("div");
      box.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:58;opacity:0;will-change:transform,opacity`;
      const cv = document.createElement("canvas");
      cv.style.cssText = "width:100%;height:100%";
      box.appendChild(cv);
      const bub = document.createElement("div");
      bub.className = "pointer-events-none fixed left-0 top-0 z-[59] max-w-[200px] rounded-[16px] bg-ink px-3 py-1.5 text-[13.5px] font-bold leading-snug text-paper opacity-0 shadow-lg transition-opacity duration-200";
      root.appendChild(box);
      root.appendChild(bub);
      const stage = new AminaStage(cv, W, H);
      await stage.load("/mascot/amina.vrm");
      return { stage, box, bub };
    };

    /* the places they can work: Discover cards in view (one per card), otherwise along the bottom of the screen;
       never where they would stand over a button, link or text box */
    const blocked = (x: number, y: number) => {
      const top = y - H * FEET * 0.95, l = x - W * 0.3, r = x + W * 0.3;
      return [...document.querySelectorAll("button,a,input,textarea,select,[role=button]")].some((n) => {
        const b = n.getBoundingClientRect();
        return b.width > 0 && b.right > l && b.left < r && b.bottom > top && b.top < y;
      });
    };
    const spots = () => {
      const cards = [...document.querySelectorAll<HTMLElement>("[data-amina-work] > *, [data-amina='cards'] > *")]
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.width > 80 && r.top > H * FEET + 90 && r.top < innerHeight - 40);
      const out = cards.map((r) => ({ x: r.left + r.width * (0.3 + Math.random() * 0.4), y: r.top + 4 })).filter((p) => !blocked(p.x, p.y));
      const floor = [0.12, 0.3, 0.7, 0.88].map((f) => ({ x: innerWidth * f, y: innerHeight - 4 })).filter((p) => !blocked(p.x, p.y));
      const all = out.length >= 2 ? out : [...out, ...floor];
      // keep them apart
      const picked: { x: number; y: number }[] = [];
      for (const p of all.sort(() => Math.random() - 0.5)) if (picked.every((q) => Math.abs(q.x - p.x) > 130 || Math.abs(q.y - p.y) > 120)) picked.push(p);
      return picked;
    };

    const start = async () => {
      if (loading || crew.length || busy() || document.hidden) return;
      loading = true;
      try {
        const n = Math.random() < 0.5 ? 2 : 3;
        while (pool.length < n) pool.push(await make());
        if (dead || performance.now() - active < IDLE_MS) return;
        const places = spots();
        if (!places.length) return;
        crew = pool.slice(0, n).map((p, i) => {
          const s0 = places[i % places.length], k = Math.floor(i / places.length);
          const s = { x: Math.max(70, Math.min(innerWidth - 70, s0.x + (k % 2 ? -1 : 1) * 130 * k)), y: s0.y };
          const fromLeft = s.x < innerWidth / 2;
          p.stage.base = "walk";
          p.stage.mood = "happy";
          p.stage.play("none");
          return { ...p, x: fromLeft ? -60 - i * 70 : innerWidth + 60 + i * 70, y: s.y, tx: s.x, ty: s.y, mode: "walk", until: 0, runV: 0, runT: 0, jump: 0, alpha: 0,
            say: "", sayUntil: 0, rider: null, carrier: null, next: performance.now() + 4000 + i * 1500 } as Actor;
        });
        // with three, one rides on another's shoulders for a while
        if (crew.length === 3) { crew[2].carrier = crew[1]; crew[1].rider = crew[2]; crew[2].tx = crew[1].tx; crew[2].ty = crew[1].ty; }
        last = performance.now();
        raf = requestAnimationFrame(loop);
      } finally {
        loading = false;
      }
    };

    const say = (a: Actor, text: string, ms = 2200) => { a.say = text; a.sayUntil = performance.now() + ms; a.stage.talk = true; };
    const gesture = (a: Actor, g: Gesture, mood: "happy" | "fun" | "calm" = "happy") => { a.stage.play(g); a.stage.mood = mood; };

    const leaveAll = () => crew.forEach((a) => {
      if (a.mode === "leave") return;
      a.mode = "leave";
      a.carrier = null;
      if (a.rider) a.rider.carrier = null;
      a.rider = null;
      a.tx = a.x < innerWidth / 2 ? -120 : innerWidth + 120;
      a.stage.base = "walk";
      a.stage.play("none");
      a.say = "";
    });

    const loop = (now: number) => {
      if (dead) return;
      if (document.hidden) { raf = requestAnimationFrame(loop); last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const a of crew) {
        const st = a.stage;
        // where she heads, and how
        if (a.carrier) {
          // on the carrier's shoulders: her hips just above the carrier's chest
          const c = a.carrier, chest = c.stage.screenOf("chest") ?? { x: W / 2, y: H * 0.3 }, hip = st.screenOf("hips") ?? { x: W / 2, y: H * 0.55 };
          a.x = c.x; a.y = c.y - H * FEET - c.jump + chest.y - 18 - hip.y + H * FEET;
          st.base = "sit"; st.yaw = c.stage.yaw;
          if (now > a.next && c.mode === "work") { a.carrier = null; c.rider = null; a.mode = "walk"; a.tx = c.x + (Math.random() < 0.5 ? -110 : 110); a.ty = c.ty; st.base = "walk"; say(a, line("hello")); }
        } else if (a.mode === "run") {
          a.runT -= dt;
          a.x += a.runV * dt;
          a.jump = Math.sin(Math.min(1, 1 - a.runT / 0.7) * Math.PI) * 60;
          st.yaw = a.runV > 0 ? 1.2 : -1.2;
          if (a.runT <= 0) { a.mode = "walk"; a.jump = 0; a.tx = Math.max(60, Math.min(innerWidth - 60, a.x + (a.runV > 0 ? 40 : -40))); }
        } else if (a.mode === "caught") {
          st.yaw = 0;
          if (now > a.until) { a.mode = "work"; st.base = "stand"; gesture(a, "none", "calm"); a.next = now + 3000; }
        } else {
          const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
          const v = (a.mode === "leave" ? 520 : 150) * dt;
          if (d > v) {
            a.x += (dx / d) * v; a.y += (dy / d) * v;
            st.base = "walk"; st.yaw = dx > 0 ? 1.2 : -1.2;
          } else {
            a.x = a.tx; a.y = a.ty;
            if (a.mode === "walk") { a.mode = "work"; st.base = "stand"; st.yaw = 0; a.next = now + 1200; }
            if (a.mode === "work" && now > a.next) {
              // little jobs on the card: point at it, sit on its edge, wave, hop, check the time
              const r = Math.random();
              if (r < 0.28) { st.base = "sit"; a.mode = "sit"; a.until = now + 5000; }
              else if (r < 0.5) { gesture(a, Math.random() < 0.5 ? "pointL" : "pointR"); if (Math.random() < 0.5) say(a, line("work")); }
              else if (r < 0.65) gesture(a, "wave");
              else if (r < 0.8) gesture(a, "hop", "fun");
              else gesture(a, "wrist", "calm");
              a.next = now + 2600 + Math.random() * 2400;
            }
            if (a.mode === "sit" && now > a.until) { st.base = "stand"; a.mode = "work"; a.next = now + 800; }
          }
        }
        // fade in on arrival, out on leaving
        const off = a.mode === "leave" && (a.x < -80 || a.x > innerWidth + 80);
        a.alpha = Math.max(0, Math.min(1, a.alpha + (a.mode === "leave" ? -1.8 : 2.5) * dt));
        if (off) a.alpha = 0;
        if (a.sayUntil && now > a.sayUntil) { a.sayUntil = 0; a.say = ""; st.talk = false; }
        if (pointer.x > -900) st.look = { x: pointer.x - (a.x - W / 2), y: pointer.y - (a.y - H * FEET) };
        st.frame(dt);
        const left = a.x - W / 2, top = a.y - H * FEET - a.jump;
        a.box.style.opacity = String(a.alpha);
        a.box.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
        if (a.say) {
          const hp = st.screenOf("head") ?? { x: W / 2, y: H * 0.15 };
          a.bub.textContent = a.say;
          a.bub.style.opacity = String(a.alpha);
          const bw = a.bub.offsetWidth;
          a.bub.style.transform = `translate3d(${Math.round(Math.max(8, Math.min(innerWidth - bw - 8, left + hp.x + 24)))}px, ${Math.round(top + hp.y - 44)}px, 0)`;
        } else a.bub.style.opacity = "0";
      }
      // everyone gone: stop drawing until the next quiet spell
      if (crew.length && crew.every((a) => a.mode === "leave" && a.alpha <= 0)) {
        crew.forEach((a) => { a.box.style.opacity = "0"; a.bub.style.opacity = "0"; a.stage.base = "stand"; });
        crew = [];
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    /* which crew member is under the pointer (her body, not the empty canvas around her) */
    const under = (x: number, y: number) => crew.find((a) => {
      if (a.alpha < 0.5 || a.mode === "leave") return false;
      const lx = x - (a.x - W / 2), ly = y - (a.y - H * FEET - a.jump);
      return lx >= 0 && ly >= 0 && lx <= W && ly <= H && a.stage.hit(lx, ly);
    });
    const near = (x: number, y: number) => crew.some((a) => a.mode !== "leave" && Math.hypot(x - a.x, y - (a.y - H * 0.5)) < 170);

    const wake = () => { active = performance.now(); if (crew.length) leaveAll(); };
    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      // moving toward them to play is fine; moving anywhere else means she is back at work, so they make way
      if (crew.length && near(e.clientX, e.clientY)) { active = performance.now(); document.documentElement.style.cursor = under(e.clientX, e.clientY) ? "pointer" : ""; return; }
      if (document.documentElement.style.cursor === "pointer" && !crew.length) document.documentElement.style.cursor = "";
      wake();
    };
    const onDown = (e: PointerEvent) => {
      const a = under(e.clientX, e.clientY);
      if (!a) return wake();
      e.preventDefault();
      e.stopPropagation();
      active = performance.now();
      if (a.carrier) { a.carrier.rider = null; a.carrier = null; }
      if (a.mode === "run") {
        // caught while running
        a.mode = "caught"; a.jump = 0; a.until = performance.now() + 2600;
        a.stage.base = "stand"; gesture(a, "hop", "fun");
        setTimeout(() => !dead && a.mode === "caught" && gesture(a, "wave", "fun"), 900);
        say(a, line("caught"), 2400);
      } else {
        // a touch: she runs and jumps out of the way, away from the pointer, staying on screen
        const away = e.clientX < a.x ? 1 : -1;
        const room = away > 0 ? innerWidth - 80 - a.x : a.x - 80;
        a.mode = "run"; a.runT = 0.7; a.runV = away * Math.min(520, Math.max(160, room / 0.7));
        a.stage.base = "walk"; gesture(a, "hop", "fun");
      }
    };
    const onClick = (e: MouseEvent) => { if (under(e.clientX, e.clientY)) { e.preventDefault(); e.stopPropagation(); } };
    const tick = window.setInterval(() => {
      if (!dead && !crew.length && !document.hidden && performance.now() - active > IDLE_MS && !busy()) void start();
    }, 1000);

    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown, { capture: true });
    addEventListener("click", onClick, { capture: true });
    ["keydown", "wheel", "scroll", "touchstart"].forEach((k) => addEventListener(k, wake, { passive: true, capture: true }));
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      clearInterval(tick);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown, { capture: true });
      removeEventListener("click", onClick, { capture: true });
      ["keydown", "wheel", "scroll", "touchstart"].forEach((k) => removeEventListener(k, wake, { capture: true }));
      document.documentElement.style.cursor = "";
      pool.forEach((p) => { p.stage.dispose(); p.box.remove(); p.bub.remove(); });
    };
  }, []);
  return <div ref={host} aria-hidden="true" />;
}
