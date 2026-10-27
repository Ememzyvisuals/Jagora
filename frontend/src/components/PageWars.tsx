"use client";

/* Page Wars: an Easter egg. The page you are on becomes the battlefield. You and your partner (blue) fight a red
   squad of stickmen who run, jump across the page and shoot back. Every word, button, picture and card is
   solid: you can stand on it, and a bullet blows it apart. Esc (or Exit) puts the page back exactly as it was.

   Start: Shift + G on a keyboard, or "Play Page Wars" in the menu. Desktop: A / D or arrows to move, W or Space to
   jump, aim with the mouse and click (hold to keep firing). Phone: drag on the left half to move (drag up to jump),
   tap or hold on the right half to shoot there. */
import { useCallback, useEffect, useRef, useState } from "react";

export const startPageWars = () => dispatchEvent(new Event("jagora:game"));

type V = { x: number; y: number };
type Block = { el: HTMLElement; x: number; y: number; w: number; h: number; color: string; hp: number };
type Man = {
  team: "blue" | "red";
  me?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ground: boolean;
  face: number;
  aim: number;
  phase: number;
  hp: number;
  dead: number; // >0: seconds since death
  cool: number;
  think: number;
  goal: number;
  panic: number;
  name: string;
};
type Shot = { x: number; y: number; vx: number; vy: number; team: Man["team"]; life: number };
type Bit = { x: number; y: number; vx: number; vy: number; s: number; c: string; life: number; rot: number; vr: number };

const G = 1500; // gravity px/s²
const H = 46; // stickman height
const SPEED = 230;
const JUMP = 640;
const BULLET = 980;
const BLUE = "#1d63ed";
const ALLY = "#5b9bff";
const RED = "#e5484d";
const NAMES = ["Bayo", "Ngozi", "Musa", "Tunde", "Amaka", "Sani", "Kemi", "Obi"];

function collectBlocks(): Block[] {
  const out: Block[] = [];
  const vw = innerWidth, vh = innerHeight;
  const seen = new Set<Element>();
  const els = document.body.querySelectorAll<HTMLElement>("h1,h2,h3,h4,p,li,a,button,img,svg,canvas,input,label,span,dt,dd,figcaption,[data-tour]");
  for (const el of els) {
    if (el.closest("#page-wars")) continue;
    if (seen.has(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 8 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
    if (r.width > vw * 0.92 && r.height > vh * 0.5) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.opacity === "0" || st.display === "none") continue;
    const tag = el.tagName;
    const media = tag === "IMG" || tag === "svg" || tag === "CANVAS" || tag === "INPUT";
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 0);
    if (!media && !ownText && tag !== "BUTTON" && tag !== "A") continue;
    // skip a parent when a child is already a block (prefer the smallest pieces)
    if (out.some((b) => el.contains(b.el))) continue;
    for (let i = out.length - 1; i >= 0; i--) if (out[i].el.contains(el)) out.splice(i, 1);
    const color = media ? (tag === "IMG" ? "#7aa7e8" : st.color) : st.color;
    out.push({ el, x: r.left, y: r.top, w: r.width, h: r.height, color, hp: Math.max(1, Math.round((r.width * r.height) / 9000)) });
    seen.add(el);
  }
  return out;
}

function hitRect(p: V, b: { x: number; y: number; w: number; h: number }) {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

export function PageWars() {
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState<"intro" | "play" | "over">("intro");
  const [hud, setHud] = useState({ score: 0, wave: 1, hp: 100, ally: true, left: 0 });
  const cv = useRef<HTMLCanvasElement>(null);
  const hidden = useRef<{ el: HTMLElement; vis: string }[]>([]);
  const world = useRef<{ blocks: Block[]; men: Man[]; shots: Shot[]; bits: Bit[]; score: number; wave: number; t: number } | null>(null);
  const input = useRef({ left: false, right: false, jump: false, fire: false, aim: { x: 0, y: 0 }, stick: null as null | { id: number; x0: number; y0: number; dx: number; dy: number }, fireId: -1 });

  const restore = useCallback(() => {
    for (const h of hidden.current) h.el.style.visibility = h.vis;
    hidden.current = [];
  }, []);
  const exit = useCallback(() => {
    restore();
    setOn(false);
    setPhase("intro");
  }, [restore]);

  // open
  useEffect(() => {
    const open = () => {
      setOn(true);
      setPhase("intro");
    };
    const key = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "G" || e.key === "g") && !(e.target as HTMLElement)?.closest?.("input,textarea,[contenteditable]")) open();
    };
    addEventListener("jagora:game", open);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("jagora:game", open);
      removeEventListener("keydown", key);
    };
  }, []);

  // the game
  useEffect(() => {
    if (!on || phase !== "play") return;
    const c = cv.current!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const fit = () => {
      c.width = innerWidth * dpr;
      c.height = innerHeight * dpr;
    };
    fit();
    const vw = () => innerWidth, vh = () => innerHeight;

    const spawn = (team: Man["team"], x: number, me = false, name = ""): Man => ({
      team, me, x, y: vh() * 0.2, vx: 0, vy: 0, ground: false, face: 1, aim: 0, phase: 0, hp: me ? 100 : team === "blue" ? 80 : 40,
      dead: 0, cool: 0.8 + Math.random(), think: 0, goal: x, panic: 0, name,
    });
    const wave = (n: number) => {
      const w = world.current!;
      const count = Math.min(3 + n, 8);
      for (let i = 0; i < count; i++) w.men.push(spawn("red", vw() * (0.55 + Math.random() * 0.4), false, NAMES[(i + n) % NAMES.length]));
    };
    world.current = { blocks: collectBlocks(), men: [spawn("blue", vw() * 0.15, true, "You"), spawn("blue", vw() * 0.28, false, "Partner")], shots: [], bits: [], score: 0, wave: 1, t: 0 };
    wave(1);
    input.current.aim = { x: vw() * 0.7, y: vh() * 0.5 };

    const blow = (b: Block, at: V) => {
      const w = world.current!;
      hidden.current.push({ el: b.el, vis: b.el.style.visibility });
      b.el.style.visibility = "hidden";
      w.blocks = w.blocks.filter((x) => x !== b);
      const n = Math.min(70, 14 + Math.round((b.w * b.h) / 400));
      for (let i = 0; i < n; i++) {
        const px = b.x + Math.random() * b.w, py = b.y + Math.random() * b.h;
        const a = Math.atan2(py - at.y, px - at.x) + (Math.random() - 0.5) * 1.2;
        const sp = 120 + Math.random() * 420;
        w.bits.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 220, s: 2 + Math.random() * 5, c: Math.random() < 0.25 ? "#ffb02e" : b.color, life: 1.2 + Math.random() * 0.8, rot: 0, vr: (Math.random() - 0.5) * 12 });
      }
      w.score += 5;
      try {
        navigator.vibrate?.(10);
      } catch {}
    };
    const splat = (m: Man, color: string) => {
      const w = world.current!;
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 300;
        w.bits.push({ x: m.x, y: m.y - H * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, s: 2 + Math.random() * 3, c: color, life: 0.8 + Math.random() * 0.6, rot: 0, vr: 6 });
      }
    };
    const fire = (m: Man, tx: number, ty: number, spread = 0.02) => {
      const w = world.current!;
      const gx = m.x + Math.cos(m.aim) * 22, gy = m.y - H * 0.62 + Math.sin(m.aim) * 22;
      const a = Math.atan2(ty - gy, tx - gx) + (Math.random() - 0.5) * spread;
      w.shots.push({ x: gx, y: gy, vx: Math.cos(a) * BULLET, vy: Math.sin(a) * BULLET, team: m.team, life: 1.4 });
    };

    // physics: stand on the tops of blocks or the bottom of the screen
    const floorUnder = (m: Man, w: { blocks: Block[] }) => {
      let best = vh() - 4;
      for (const b of w.blocks) {
        if (b.w < 24) continue;
        if (m.x >= b.x - 4 && m.x <= b.x + b.w + 4 && b.y >= m.y - 2 && b.y < best) best = b.y;
      }
      return best;
    };

    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const w = world.current!;
      w.t += dt;
      const inp = input.current;
      const me = w.men.find((m) => m.me)!;

      // ---- people
      for (const m of w.men) {
        if (m.dead) {
          m.dead += dt;
          m.vy += G * dt;
          m.y = Math.min(vh() - 2, m.y + m.vy * dt);
          continue;
        }
        if (m.me) {
          let dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
          if (inp.stick) dir = Math.abs(inp.stick.dx) > 14 ? Math.sign(inp.stick.dx) : 0;
          m.vx = dir * SPEED;
          if ((inp.jump || (inp.stick && inp.stick.dy < -40)) && m.ground) {
            m.vy = -JUMP;
            m.ground = false;
          }
          m.aim = Math.atan2(inp.aim.y - (m.y - H * 0.62), inp.aim.x - m.x);
          m.face = Math.cos(m.aim) >= 0 ? 1 : -1;
          m.cool -= dt;
          if (inp.fire && m.cool <= 0) {
            fire(m, inp.aim.x, inp.aim.y);
            m.cool = 0.14;
          }
        } else {
          // AI: pick a foe, keep moving, run from danger, shoot now and then
          const foes = w.men.filter((o) => o.team !== m.team && !o.dead);
          const foe = foes.sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))[0];
          m.think -= dt;
          // danger: a shot coming its way, or the player aiming right at it
          const threatened =
            w.shots.some((s) => s.team !== m.team && Math.hypot(s.x - m.x, s.y - (m.y - H / 2)) < 160 && (s.vx > 0) === (m.x > s.x)) ||
            (m.team === "red" && Math.abs(Math.atan2(m.y - H * 0.6 - (me.y - H * 0.62), m.x - me.x) - me.aim) < 0.12 && !me.dead);
          if (threatened && m.panic <= 0) {
            m.panic = 0.7 + Math.random() * 0.5;
            m.goal = m.x + (m.x > (foe?.x ?? 0) ? 1 : -1) * (160 + Math.random() * 200);
            if (m.ground && Math.random() < 0.6) {
              m.vy = -JUMP * (0.8 + Math.random() * 0.3);
              m.ground = false;
            }
          }
          m.panic -= dt;
          if (m.think <= 0 && m.panic <= 0) {
            m.think = 0.8 + Math.random() * 1.6;
            const keep = m.team === "red" ? 220 + Math.random() * 200 : 140;
            m.goal = foe ? foe.x + (m.x > foe.x ? keep : -keep) * (Math.random() < 0.3 ? -1 : 1) : m.x;
            if (m.ground && Math.random() < 0.35) {
              m.vy = -JUMP * (0.7 + Math.random() * 0.4);
              m.ground = false;
            }
          }
          m.goal = Math.max(20, Math.min(vw() - 20, m.goal));
          const d = m.goal - m.x;
          m.vx = Math.abs(d) > 8 ? Math.sign(d) * SPEED * (m.panic > 0 ? 1.35 : 0.8) : 0;
          if (foe) {
            m.aim = Math.atan2(foe.y - H * 0.6 - (m.y - H * 0.62), foe.x - m.x);
            m.face = Math.cos(m.aim) >= 0 ? 1 : -1;
            m.cool -= dt;
            if (m.cool <= 0) {
              fire(m, foe.x, foe.y - H * 0.6, m.team === "red" ? 0.22 : 0.08);
              m.cool = m.team === "red" ? Math.max(0.7, 2.2 - w.wave * 0.15) + Math.random() : 0.5 + Math.random() * 0.5;
            }
          }
        }
        // move
        m.vy += G * dt;
        m.x = Math.max(10, Math.min(vw() - 10, m.x + m.vx * dt));
        const floor = floorUnder(m, w);
        const ny = m.y + m.vy * dt;
        if (m.vy >= 0 && m.y <= floor + 1 && ny >= floor) {
          m.y = floor;
          m.vy = 0;
          m.ground = true;
        } else {
          m.y = ny;
          m.ground = false;
        }
        if (m.y > vh()) {
          m.y = vh() - 4;
          m.vy = 0;
          m.ground = true;
        }
        m.phase += Math.abs(m.vx) * dt * 0.06;
      }

      // ---- shots
      for (const s of w.shots) {
        const steps = 3;
        for (let k = 0; k < steps && s.life > 0; k++) {
          s.x += (s.vx * dt) / steps;
          s.y += (s.vy * dt) / steps;
          // people
          for (const m of w.men) {
            if (m.dead || m.team === s.team) continue;
            if (Math.abs(s.x - m.x) < 9 && s.y > m.y - H && s.y < m.y) {
              s.life = 0;
              m.hp -= m.me ? 9 : 25;
              m.vx += s.vx * 0.05;
              splat(m, m.team === "red" ? RED : BLUE);
              if (m.hp <= 0) {
                m.dead = 0.001;
                m.vy = -380;
                if (m.team === "red") w.score += 100;
              }
            }
          }
          // the page
          if (s.life > 0)
            for (const b of w.blocks)
              if (hitRect(s, b)) {
                s.life = 0;
                b.hp -= 1;
                if (b.hp <= 0) blow(b, s);
                else
                  for (let i = 0; i < 6; i++)
                    w.bits.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 260, s: 2, c: b.color, life: 0.5, rot: 0, vr: 0 });
                break;
              }
        }
        s.life -= dt;
        if (s.x < -20 || s.x > vw() + 20 || s.y < -20 || s.y > vh() + 20) s.life = 0;
      }
      w.shots = w.shots.filter((s) => s.life > 0);

      // ---- pieces
      for (const b of w.bits) {
        b.vy += G * 0.7 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
        if (b.y > vh() - 2) {
          b.y = vh() - 2;
          b.vy *= -0.3;
          b.vx *= 0.7;
        }
        b.life -= dt;
      }
      w.bits = w.bits.filter((b) => b.life > 0).slice(-900);

      // ---- waves, end
      w.men = w.men.filter((m) => !m.dead || m.dead < 2.5);
      const redsLeft = w.men.filter((m) => m.team === "red" && !m.dead).length;
      if (redsLeft === 0) {
        w.wave += 1;
        w.score += 250;
        wave(w.wave);
      }
      if (me.dead && me.dead > 1.2) {
        cancelAnimationFrame(raf);
        setPhase("over");
      }
      if (Math.round(w.t * 10) % 3 === 0)
        setHud({ score: w.score, wave: w.wave, hp: Math.max(0, Math.round(me.hp)), ally: w.men.some((m) => m.team === "blue" && !m.me && !m.dead), left: redsLeft });

      // ---- draw
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw(), vh());
      for (const b of w.bits) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, b.life * 1.5);
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s);
        ctx.restore();
      }
      for (const s of w.shots) {
        const len = 16;
        const n = Math.hypot(s.vx, s.vy);
        ctx.strokeStyle = s.team === "blue" ? "#ffd166" : "#ff7a7a";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - (s.vx / n) * len, s.y - (s.vy / n) * len);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      for (const m of w.men) drawMan(ctx, m);
      // aim
      if (!me.dead) {
        ctx.strokeStyle = "rgba(29,99,237,.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(inp.aim.x, inp.aim.y, 11, 0, Math.PI * 2);
        ctx.moveTo(inp.aim.x - 17, inp.aim.y);
        ctx.lineTo(inp.aim.x - 6, inp.aim.y);
        ctx.moveTo(inp.aim.x + 6, inp.aim.y);
        ctx.lineTo(inp.aim.x + 17, inp.aim.y);
        ctx.moveTo(inp.aim.x, inp.aim.y - 17);
        ctx.lineTo(inp.aim.x, inp.aim.y - 6);
        ctx.moveTo(inp.aim.x, inp.aim.y + 6);
        ctx.lineTo(inp.aim.x, inp.aim.y + 17);
        ctx.stroke();
      }
      if (inp.stick) {
        ctx.fillStyle = "rgba(255,255,255,.35)";
        ctx.beginPath();
        ctx.arc(inp.stick.x0, inp.stick.y0, 46, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(29,99,237,.75)";
        ctx.beginPath();
        ctx.arc(inp.stick.x0 + Math.max(-40, Math.min(40, inp.stick.dx)), inp.stick.y0 + Math.max(-40, Math.min(40, inp.stick.dy)), 20, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(loop);

    // ---- input
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "escape") return exit();
      if (k === "a" || k === "arrowleft") input.current.left = true;
      if (k === "d" || k === "arrowright") input.current.right = true;
      if (k === "w" || k === "arrowup" || k === " ") input.current.jump = true;
      e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") input.current.left = false;
      if (k === "d" || k === "arrowright") input.current.right = false;
      if (k === "w" || k === "arrowup" || k === " ") input.current.jump = false;
    };
    const pd = (e: PointerEvent) => {
      const inp = input.current;
      if (e.pointerType === "touch" && e.clientX < innerWidth / 2) {
        inp.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
      } else {
        inp.aim = { x: e.clientX, y: e.clientY };
        inp.fire = true;
        inp.fireId = e.pointerId;
      }
    };
    const pm = (e: PointerEvent) => {
      const inp = input.current;
      if (inp.stick && e.pointerId === inp.stick.id) {
        inp.stick.dx = e.clientX - inp.stick.x0;
        inp.stick.dy = e.clientY - inp.stick.y0;
      } else if (e.pointerType !== "touch" || e.pointerId === inp.fireId) inp.aim = { x: e.clientX, y: e.clientY };
    };
    const pu = (e: PointerEvent) => {
      const inp = input.current;
      if (inp.stick && e.pointerId === inp.stick.id) inp.stick = null;
      if (e.pointerId === inp.fireId) inp.fire = false;
    };
    addEventListener("keydown", kd);
    addEventListener("keyup", ku);
    c.addEventListener("pointerdown", pd);
    addEventListener("pointermove", pm);
    addEventListener("pointerup", pu);
    addEventListener("pointercancel", pu);
    addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("keydown", kd);
      removeEventListener("keyup", ku);
      c.removeEventListener("pointerdown", pd);
      removeEventListener("pointermove", pm);
      removeEventListener("pointerup", pu);
      removeEventListener("pointercancel", pu);
      removeEventListener("resize", fit);
    };
  }, [on, phase, exit]);

  // Esc on the intro and end screens too
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && exit();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [on, exit]);

  if (!on) return null;
  const start = () => {
    restore();
    setHud({ score: 0, wave: 1, hp: 100, ally: true, left: 0 });
    setPhase("play");
  };
  const final = world.current;
  return (
    <div id="page-wars" className="fixed inset-0 z-[400] select-none" style={{ touchAction: "none" }}>
      <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ cursor: phase === "play" ? "none" : "default" }} />

      {/* HUD */}
      {phase === "play" && (
        <div className="pointer-events-none absolute inset-x-0 top-[max(10px,env(safe-area-inset-top))] flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white/80 py-1.5 pl-4 pr-1.5 text-[14px] font-semibold text-ink shadow-[0_10px_30px_-12px_rgba(10,30,70,.5)] ring-1 ring-black/5 backdrop-blur-xl">
            <span className="font-display tracking-[-0.02em]">Wave {hud.wave}</span>
            <span className="text-ink-3">|</span>
            <span>{hud.score}</span>
            <span className="text-ink-3">|</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-16 overflow-hidden rounded-full bg-black/10">
                <span className="block h-full rounded-full bg-accent transition-all" style={{ width: `${hud.hp}%` }} />
              </span>
            </span>
            <span className="hidden text-ink-2 sm:inline">{hud.left} red left</span>
            <button onClick={exit} className="h-8 rounded-full bg-ink px-3.5 text-[13px] text-paper">
              Exit
            </button>
          </div>
        </div>
      )}

      {/* intro and end */}
      {phase !== "play" && (
        <div className="absolute inset-0 grid place-items-center bg-[#0b1426]/25 p-5 backdrop-blur-[2px]">
          <div className="w-full max-w-[420px] rounded-[30px] bg-white/85 p-6 text-center shadow-[0_30px_80px_-30px_rgba(10,30,70,.6)] ring-1 ring-black/5 backdrop-blur-2xl dark:bg-[#23262d]/90">
            <svg viewBox="0 0 120 60" className="mx-auto h-16 w-32" aria-hidden="true">
              <g stroke={BLUE} strokeWidth="4" strokeLinecap="round" fill="none">
                <circle cx="30" cy="12" r="7" />
                <path d="M30 19v18M30 37l-8 14M30 37l8 14M30 25l16-2" />
              </g>
              <g stroke={RED} strokeWidth="4" strokeLinecap="round" fill="none">
                <circle cx="92" cy="12" r="7" />
                <path d="M92 19v18M92 37l-10 12M92 37l11 10M92 25l-16 3" />
              </g>
              <circle cx="62" cy="22" r="3" fill="#ffd166" />
            </svg>
            <h2 className="mt-2 font-display text-[34px] font-bold leading-none tracking-[-0.04em] text-ink">{phase === "over" ? "You're down" : "Page Wars"}</h2>
            {phase === "over" ? (
              <p className="mt-3 text-[16px] text-ink-2">
                Score <strong className="text-ink">{final?.score ?? 0}</strong> on wave {final?.wave ?? 1}. The page will be back the moment you exit.
              </p>
            ) : (
              <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">
                You and your partner against the red squad, right here on this page. Everything is solid and everything breaks. They run, they jump, they shoot back.
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 text-left text-[13.5px] text-ink-2">
              <div className="rounded-[16px] bg-black/5 p-3 dark:bg-white/10">
                <p className="font-semibold text-ink">Keyboard</p>A D or arrows to move, W or Space to jump, mouse to aim and fire
              </div>
              <div className="rounded-[16px] bg-black/5 p-3 dark:bg-white/10">
                <p className="font-semibold text-ink">Touch</p>Drag left side to move, drag up to jump, tap right side to shoot
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={start} className="btn btn-ink h-12 flex-1 text-[16px] font-semibold">
                {phase === "over" ? "Play again" : "Start"}
              </button>
              <button onClick={exit} className="btn btn-glass h-12 px-6 text-[15.5px]">
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function drawMan(ctx: CanvasRenderingContext2D, m: Man) {
  const col = m.team === "red" ? RED : m.me ? BLUE : ALLY;
  const alpha = m.dead ? Math.max(0, 1 - m.dead / 2.5) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(m.x, m.y);
  if (m.dead) ctx.rotate(Math.min(Math.PI / 2, m.dead * 4) * (m.face > 0 ? -1 : 1));
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const sw = m.ground ? Math.sin(m.phase) * 0.7 : 0.5;
  const hip = { x: 0, y: -H * 0.38 };
  const neck = { x: 0, y: -H * 0.74 };
  // legs
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(hip.x + Math.sin(sw) * 12, 0);
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(hip.x - Math.sin(sw) * 12, m.ground ? 0 : -6);
  // body
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(neck.x, neck.y);
  ctx.stroke();
  // arms and gun along the aim
  const shoulder = { x: 0, y: -H * 0.62 };
  const ax = Math.cos(m.aim), ay = Math.sin(m.aim);
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(shoulder.x + ax * 14, shoulder.y + ay * 14);
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(shoulder.x + ax * 10 - ay * 4, shoulder.y + ay * 10 + ax * 4);
  ctx.stroke();
  ctx.strokeStyle = "#0e0f12";
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(shoulder.x + ax * 10, shoulder.y + ay * 10);
  ctx.lineTo(shoulder.x + ax * 24, shoulder.y + ay * 24);
  ctx.stroke();
  // head
  ctx.strokeStyle = col;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.arc(0, -H * 0.88, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.stroke();
  // you wear a headband
  if (m.me) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-7, -H * 0.9);
    ctx.lineTo(7, -H * 0.9);
    ctx.lineTo(7 - m.face * 14, -H * 0.86 + Math.sin(m.phase * 2) * 2);
    ctx.stroke();
  }
  // health bar for the living
  if (!m.dead && !m.me) {
    const max = m.team === "blue" ? 80 : 40;
    ctx.fillStyle = "rgba(0,0,0,.15)";
    ctx.fillRect(-12, -H - 8, 24, 3);
    ctx.fillStyle = col;
    ctx.fillRect(-12, -H - 8, (24 * Math.max(0, m.hp)) / max, 3);
  }
  ctx.restore();
}
