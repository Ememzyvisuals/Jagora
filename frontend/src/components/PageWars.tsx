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
/* a piece of the page that can be shot off: one letter, or one tile of a picture or a button's background */
type Piece = { x: number; y: number; w: number; h: number; alive: boolean; ch?: string; font?: string; color: string; base?: number; img?: CanvasImageSource; sx?: number; sy?: number; sw?: number; sh?: number };
type Block = {
  el: HTMLElement; x: number; y: number; w: number; h: number; color: string; hp: number;
  /* once hit, the element is hidden (visibility only, so the layout never moves) and drawn piece by piece on the
     debris canvas in exactly the same place; every hit then blows the pieces near it off */
  live?: boolean; pieces?: Piece[]; left?: number; dirty?: boolean; rad?: number;
};
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
type Bit = { x: number; y: number; vx: number; vy: number; s: number; c: string; life: number; rot: number; vr: number; p?: Piece; oy?: number };
type Flash = { x: number; y: number; t: number; big: boolean };

const G = 1500; // gravity px/s²
const H = 58; // stickman height
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

const clear = (c: string) => !c || c === "transparent" || /rgba?\([^)]*,\s*0(\.0+)?\)$/.test(c);
const metrics = new Map<string, { asc: number; desc: number }>();
/** where the text baseline sits inside a glyph's box, for this font */
function fontMetrics(ctx: CanvasRenderingContext2D, font: string) {
  let m = metrics.get(font);
  if (!m) {
    ctx.font = font;
    const t = ctx.measureText("Hg");
    const size = parseFloat(font.match(/(\d+(\.\d+)?)px/)?.[1] ?? "16");
    m = { asc: t.fontBoundingBoxAscent ?? size * 0.8, desc: t.fontBoundingBoxDescent ?? size * 0.2 };
    metrics.set(font, m);
  }
  return m;
}
/** cut an element into pieces: its letters (each where the browser drew it), or tiles for a picture, and tiles of its
    background when it has one (buttons, chips) */
function cut(b: Block, ctx: CanvasRenderingContext2D): Piece[] {
  const out: Piece[] = [];
  const el = b.el, st = getComputedStyle(el);
  const tiles = (color: string, img?: CanvasImageSource, iw = 0, ih = 0, radius = 0) => {
    const cols = Math.max(2, Math.min(10, Math.round(b.w / 30))), rows = Math.max(2, Math.min(8, Math.round(b.h / 30)));
    const tw = b.w / cols, th = b.h / rows;
    b.rad = Math.max(b.rad ?? 0, radius);
    // a picture with object-fit: cover is cropped round its middle
    let sc = 1, ox = 0, oy = 0;
    if (img && iw && ih) {
      const fit = st.objectFit;
      sc = fit === "contain" ? Math.min(b.w / iw, b.h / ih) : fit === "fill" ? 0 : Math.max(b.w / iw, b.h / ih);
      if (sc) {
        ox = (iw * sc - b.w) / 2;
        oy = (ih * sc - b.h) / 2;
      }
    }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const p: Piece = { x: b.x + c * tw, y: b.y + r * th, w: tw, h: th, alive: true, color };
        if (img && iw && ih) {
          if (sc) Object.assign(p, { img, sx: (c * tw + ox) / sc, sy: (r * th + oy) / sc, sw: tw / sc, sh: th / sc });
          else Object.assign(p, { img, sx: (c * tw * iw) / b.w, sy: (r * th * ih) / b.h, sw: (tw * iw) / b.w, sh: (th * ih) / b.h });
        }
        out.push(p);
      }
  };
  const tag = el.tagName;
  if (tag === "IMG") {
    const im = el as HTMLImageElement;
    tiles("#7aa7e8", im.complete && im.naturalWidth ? im : undefined, im.naturalWidth, im.naturalHeight, parseFloat(st.borderTopLeftRadius) || 0);
    return out;
  }
  if (tag === "svg") {
    // a copy of the drawing as a picture, so its tiles show the real icon or illustration once it has loaded
    const copy = el.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", String(b.w));
    copy.setAttribute("height", String(b.h));
    copy.style.color = st.color;
    const src = new XMLSerializer().serializeToString(copy).replace(/currentColor/g, st.color);
    const im = new Image();
    im.onload = () => (b.dirty = true);
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
    tiles(clear(st.color) ? "#7aa7e8" : st.color, im, b.w, b.h);
    return out;
  }
  if (tag === "CANVAS" || tag === "INPUT") {
    // a 3D canvas cannot be copied reliably, so it breaks into tiles of its colour
    const bg = st.backgroundColor;
    tiles(clear(bg) ? "rgba(122,167,232,.85)" : bg);
    if (tag !== "INPUT") return out;
  }
  if (!clear(st.backgroundColor)) tiles(st.backgroundColor, undefined, 0, 0, Math.min(parseFloat(st.borderTopLeftRadius) || 0, b.h / 2));
  // the letters
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let n: Node | null, count = 0;
  while ((n = walk.nextNode()) && count < 900) {
    const text = n.textContent ?? "";
    if (!text.trim()) continue;
    const ps = getComputedStyle(n.parentElement!);
    if (ps.visibility === "hidden" || ps.display === "none") continue;
    const font = `${ps.fontStyle} ${ps.fontWeight} ${ps.fontSize} ${ps.fontFamily}`;
    const fill = ps.getPropertyValue("-webkit-text-fill-color");
    const color = clear(ps.color) || (fill && clear(fill)) ? "#1d63ed" : ps.color; // gradient text: our blue
    const up = ps.textTransform === "uppercase", low = ps.textTransform === "lowercase";
    const m = fontMetrics(ctx, font);
    for (let i = 0; i < text.length && count < 900; i++) {
      const ch = text[i];
      if (/\s/.test(ch)) continue;
      // a surrogate pair (rare letters, symbols) stays in one piece
      const len = ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) < 0xdc00 ? 2 : 1;
      range.setStart(n, i);
      range.setEnd(n, i + len);
      const r = [...range.getClientRects()].find((x) => x.width > 0);
      i += len - 1;
      if (!r) continue;
      const c = text.slice(i - len + 1, i + 1);
      out.push({ x: r.left, y: r.top, w: r.width, h: r.height, alive: true, ch: up ? c.toUpperCase() : low ? c.toLowerCase() : c, font, color, base: r.top + (r.height - (m.asc + m.desc)) / 2 + m.asc });
      count++;
    }
  }
  return out;
}
/** draw one piece where it sits (or, for a flying piece, centred on 0,0) */
function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, cx = 0, cy = 0, flying = false) {
  const x = flying ? -p.w / 2 : p.x - cx, y = flying ? -p.h / 2 : p.y - cy;
  if (p.ch) {
    ctx.font = p.font!;
    ctx.fillStyle = p.color;
    ctx.fillText(p.ch, x, flying ? -p.h / 2 + (p.base! - p.y) : p.base! - cy);
  } else if (p.img && (!(p.img instanceof HTMLImageElement) || p.img.complete)) {
    try {
      ctx.drawImage(p.img, p.sx!, p.sy!, p.sw!, p.sh!, x, y, p.w + (flying ? 0 : 0.6), p.h + (flying ? 0 : 0.6));
    } catch {
      ctx.fillStyle = p.color;
      ctx.fillRect(x, y, p.w, p.h);
    }
  } else {
    ctx.fillStyle = p.color;
    ctx.fillRect(x, y, p.w + (flying ? 0 : 0.6), p.h + (flying ? 0 : 0.6));
  }
}

function hitRect(p: V, b: { x: number; y: number; w: number; h: number }) {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

export function PageWars() {
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState<"intro" | "play" | "over">("intro");
  const [hud, setHud] = useState({ score: 0, wave: 1, hp: 100, ally: true, left: 0 });
  const cv = useRef<HTMLCanvasElement>(null);
  const dv = useRef<HTMLCanvasElement>(null); // the debris layer: the shot-at parts of the page, drawn where they were
  const hidden = useRef<{ el: HTMLElement; vis: string }[]>([]);
  const world = useRef<{ blocks: Block[]; men: Man[]; shots: Shot[]; bits: Bit[]; score: number; wave: number; t: number } | null>(null);
  const input = useRef({ left: false, right: false, jump: false, fire: false, aim: { x: 0, y: 0 }, stick: null as null | { id: number; x0: number; y0: number; dx: number; dy: number }, fireId: -1 });

  const restore = useCallback(() => {
    for (const h of hidden.current) h.el.style.visibility = h.vis;
    hidden.current = [];
    const d = dv.current;
    d?.getContext("2d")?.clearRect(0, 0, d.width, d.height);
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
    const d = dv.current!;
    const dctx = d.getContext("2d")!;
    const fit = () => {
      c.width = d.width = innerWidth * dpr;
      c.height = d.height = innerHeight * dpr;
      dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const b of world.current?.blocks ?? []) if (b.live) b.dirty = true;
    };
    fit();
    const vw = () => innerWidth, vh = () => innerHeight;

    const spawn = (team: Man["team"], x: number, me = false, name = ""): Man => ({
      team, me, x, y: vh() * 0.2, vx: 0, vy: 0, ground: false, face: 1, aim: 0, phase: 0, hp: me ? 100 : team === "blue" ? 80 : 40,
      dead: 0, cool: 0.8 + Math.random(), think: 0, goal: x, panic: 0, name,
    });
    const wave = (n: number) => {
      const w = world.current!;
      // a new round brings the partner back: the dead one is removed after its fall, so one is dropped in again
      if (n > 1 && !w.men.some((m) => m.team === "blue" && !m.me && !m.dead)) {
        w.men = w.men.filter((m) => !(m.team === "blue" && !m.me));
        const me = w.men.find((m) => m.me);
        w.men.push(spawn("blue", Math.max(40, Math.min(vw() - 40, (me ? me.x : vw() * 0.15) + 90)), false, "Partner"));
      }
      // and a little health back for you between rounds
      const me = w.men.find((m) => m.me && !m.dead);
      if (n > 1 && me) me.hp = Math.min(100, me.hp + 25);
      const count = Math.min(3 + n, 8);
      for (let i = 0; i < count; i++) w.men.push(spawn("red", vw() * (0.55 + Math.random() * 0.4), false, NAMES[(i + n) % NAMES.length]));
    };
    const flashes: Flash[] = [];
    const dirtyGone: Block[] = [];
    world.current = { blocks: collectBlocks(), men: [spawn("blue", vw() * 0.15, true, "You"), spawn("blue", vw() * 0.28, false, "Partner")], shots: [], bits: [], score: 0, wave: 1, t: 0 };
    wave(1);
    input.current.aim = { x: vw() * 0.7, y: vh() * 0.5 };

    /** the first hit on an element: hide it (layout untouched) and draw its pieces on the debris layer instead */
    const wake = (b: Block) => {
      if (b.live) return;
      b.live = true;
      b.pieces = cut(b, dctx);
      b.left = b.pieces.length;
      b.dirty = true;
      hidden.current.push({ el: b.el, vis: b.el.style.visibility });
      b.el.style.visibility = "hidden";
    };
    /** a hit on the page: a small burst, and the letters or tiles near it fly off. Returns false when the shot went
        through a gap that has already been blown clear. */
    const smash = (b: Block, at: V, vx: number, vy: number) => {
      const w = world.current!;
      wake(b);
      const ps = b.pieces!;
      let near: Piece | null = null, nd = 1e9;
      for (const p of ps) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x + p.w / 2 - at.x, p.y + p.h / 2 - at.y);
        if (d < nd) (nd = d), (near = p);
      }
      if (!near) return false;
      const reach = Math.max(24, near.h * 0.95);
      if (nd > reach * 1.5) return false;
      const sp0 = Math.hypot(vx, vy) || 1;
      let n = 0;
      for (const p of ps) {
        if (!p.alive) continue;
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        const d = Math.hypot(cx - at.x, cy - at.y);
        if (p !== near && d > reach) continue;
        p.alive = false;
        n++;
        // away from the blast, a little along the bullet, and up; heavier pieces fly less
        const a = Math.atan2(cy - at.y, cx - at.x) + (Math.random() - 0.5) * 0.9;
        const push = (260 + Math.random() * 380) * (1 - Math.min(0.6, d / (reach * 2.2))) * (p.ch ? 1 : 0.8);
        w.bits.push({
          x: cx, y: cy, vx: Math.cos(a) * push + (vx / sp0) * 120, vy: Math.sin(a) * push - 260 - Math.random() * 160,
          s: 0, c: p.color, life: 1.5 + Math.random() * 0.9, rot: 0, vr: (Math.random() - 0.5) * 16, p,
        });
      }
      b.left = (b.left ?? 0) - n;
      b.dirty = true;
      if (!b.left) {
        w.blocks = w.blocks.filter((x) => x !== b); // nothing left to stand on
        dirtyGone.push(b);
      }
      flashes.push({ x: at.x, y: at.y, t: 0, big: n > 6 });
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, sp = 140 + Math.random() * 320;
        w.bits.push({ x: at.x, y: at.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, s: 2 + Math.random() * 2.5, c: Math.random() < 0.5 ? "#ffd166" : "#ff9f1c", life: 0.35 + Math.random() * 0.3, rot: 0, vr: 0 });
      }
      w.score += n;
      try {
        navigator.vibrate?.(8);
      } catch {}
      return true;
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
      const gx = m.x + Math.cos(m.aim) * 34, gy = m.y - 51 + Math.sin(m.aim) * 34;
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
          m.aim = Math.atan2(inp.aim.y - (m.y - 51), inp.aim.x - m.x);
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
            (m.team === "red" && Math.abs(Math.atan2(m.y - 40 - (me.y - 51), m.x - me.x) - me.aim) < 0.12 && !me.dead);
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
            m.aim = Math.atan2(foe.y - 40 - (m.y - 51), foe.x - m.x);
            m.face = Math.cos(m.aim) >= 0 ? 1 : -1;
            m.cool -= dt;
            if (m.cool <= 0) {
              fire(m, foe.x, foe.y - 40, m.team === "red" ? 0.22 : 0.08);
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
            if (Math.abs(s.x - m.x) < 11 && s.y > m.y - H && s.y < m.y) {
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
              if (hitRect(s, b) && smash(b, s, s.vx, s.vy)) {
                s.life = 0;
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
        const floor = vh() - 2 - (b.p ? b.p.h / 2 : 0);
        if (b.y > floor) {
          b.y = floor;
          b.vy *= -0.35;
          b.vx *= 0.7;
          b.vr *= 0.6;
        }
        b.life -= dt;
      }
      w.bits = w.bits.filter((b) => b.life > 0);
      if (w.bits.length > 1100) w.bits = w.bits.slice(-1100);
      for (const f of flashes) f.t += dt;
      while (flashes.length && flashes[0].t > 0.3) flashes.shift();

      // ---- the debris layer: redraw only the elements that changed
      for (const b of w.blocks.concat(dirtyGone)) {
        if (!b.dirty) continue;
        b.dirty = false;
        dctx.clearRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
        dctx.save();
        dctx.beginPath();
        if (b.rad && dctx.roundRect) dctx.roundRect(b.x, b.y, b.w, b.h, Math.min(b.rad, b.w / 2, b.h / 2));
        else dctx.rect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
        dctx.clip();
        dctx.textBaseline = "alphabetic";
        for (const p of b.pieces ?? []) if (p.alive && !p.ch) drawPiece(dctx, p);
        dctx.restore();
        for (const p of b.pieces ?? []) if (p.alive && p.ch) drawPiece(dctx, p);
      }
      dirtyGone.length = 0;

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
      ctx.textBaseline = "alphabetic";
      for (const b of w.bits) {
        ctx.globalAlpha = Math.min(1, b.life * 1.4);
        const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
        ctx.setTransform(dpr * cs, dpr * sn, -dpr * sn, dpr * cs, dpr * b.x, dpr * b.y);
        if (b.p) drawPiece(ctx, b.p, 0, 0, true);
        else {
          ctx.fillStyle = b.c;
          ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s);
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the bursts: a quick bright ring where a shot lands
      for (const f of flashes) {
        const k = f.t / 0.3;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = "#fff6d6";
        ctx.beginPath();
        ctx.arc(f.x, f.y, (f.big ? 16 : 10) * (1 - k * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffb02e";
        ctx.lineWidth = 3 * (1 - k) + 0.5;
        ctx.beginPath();
        ctx.arc(f.x, f.y, (f.big ? 46 : 30) * Math.sqrt(k) + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
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
      <canvas ref={dv} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
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
            <svg viewBox="0 0 140 70" className="mx-auto h-[70px] w-[140px]" aria-hidden="true">
              <g stroke="#15171c" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
                <path d="M30 40 L24 52 L20 64 M30 40 L36 52 L40 64 M30 40 L31 20 M31 23 L40 27 L48 25 M31 23 L42 30 L54 26" />
                <path d="M110 40 L104 52 L100 64 M110 40 L117 52 L121 64 M110 40 L109 20 M109 23 L100 28 L92 26 M109 23 L98 31 L86 27" />
              </g>
              <path d="M38 26 L66 22" stroke="#2a2d34" strokeWidth="4.5" strokeLinecap="round" />
              <path d="M102 26 L74 22" stroke="#2a2d34" strokeWidth="4.5" strokeLinecap="round" />
              <circle cx="31" cy="11" r="8" fill={BLUE} stroke="#15171c" strokeWidth="2.4" />
              <circle cx="109" cy="11" r="8" fill={RED} stroke="#15171c" strokeWidth="2.4" />
              <path d="M24 9 L38 9 M23 10 L14 13" stroke="#ffd166" strokeWidth="3" strokeLinecap="round" />
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

/** two-bone reach: the middle joint (knee or elbow) for a limb from a to b, bending toward `bend` (+1 or -1) */
function joint(a: V, b: V, l1: number, l2: number, bend: number): V {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
  const ang = Math.atan2(dy, dx);
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const off = Math.acos(Math.max(-1, Math.min(1, cos))) * bend;
  return { x: a.x + Math.cos(ang + off) * l1, y: a.y + Math.sin(ang + off) * l1 };
}

const INK = "#15171c";

function drawMan(ctx: CanvasRenderingContext2D, m: Man) {
  const team = m.team === "red" ? RED : m.me ? BLUE : ALLY;
  const f = m.face;
  ctx.save();
  ctx.globalAlpha = m.dead ? Math.max(0, 1 - m.dead / 2.5) : 1;
  ctx.translate(m.x, m.y);
  if (m.dead) ctx.rotate(Math.min(Math.PI / 2, m.dead * 5) * -f);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4.6;

  // proportions (y up is negative)
  const T = 22, TH = 14, SH = 14, UA = 11, FA = 11, R = 8.5;
  const run = m.ground && Math.abs(m.vx) > 5;
  const p = m.phase * 1.6;
  const bob = run ? Math.abs(Math.sin(p)) * 2.5 : Math.sin(performance.now() / 500) * 0.8;
  const hip: V = { x: 0, y: -(TH + SH) + 1 - bob };
  const lean = run ? f * 3 : 0;
  const neck: V = { x: hip.x + lean, y: hip.y - T };
  const head: V = { x: neck.x + lean * 0.3, y: neck.y - R - 2 };

  // legs: feet swing on a cycle when running, tuck when airborne, stand apart when still
  const feet: V[] = [0, Math.PI].map((o) => {
    if (!m.ground) return { x: f * (o ? -6 : 8), y: -8 };
    if (!run) return { x: o ? -6 : 7, y: 0 };
    const s = Math.sin(p + o), c = Math.cos(p + o);
    return { x: s * 14 * f, y: Math.min(0, c * 7) };
  });
  ctx.beginPath();
  for (const ft of feet) {
    const k = joint(hip, ft, TH, SH, -f);
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(k.x, k.y);
    ctx.lineTo(ft.x, ft.y);
  }
  // body
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(neck.x, neck.y);
  ctx.stroke();

  // the rifle along the aim, held with both hands
  const sh: V = { x: neck.x, y: neck.y + 4 };
  const ax = Math.cos(m.aim), ay = Math.sin(m.aim);
  const px = -ay * f, py = ax * f; // perpendicular, toward the top of the gun
  const butt: V = { x: sh.x + ax * 2, y: sh.y + ay * 2 };
  const grip: V = { x: sh.x + ax * 12 - px * 2, y: sh.y + ay * 12 - py * 2 };
  const fore: V = { x: sh.x + ax * 21, y: sh.y + ay * 21 };
  const muzzle: V = { x: sh.x + ax * 34, y: sh.y + ay * 34 };
  ctx.strokeStyle = "#2a2d34";
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(butt.x, butt.y);
  ctx.lineTo(fore.x, fore.y);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(fore.x, fore.y);
  ctx.lineTo(muzzle.x, muzzle.y);
  // magazine
  ctx.moveTo(sh.x + ax * 15, sh.y + ay * 15);
  ctx.lineTo(sh.x + ax * 14 - px * 6, sh.y + ay * 14 - py * 6);
  ctx.stroke();
  // arms to grip and fore-grip
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  for (const hand of [grip, fore]) {
    const e = joint(sh, hand, UA, FA, f * (hand === fore ? 1 : 1));
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(e.x, e.y);
    ctx.lineTo(hand.x, hand.y);
  }
  ctx.stroke();

  // head: solid, in the team colour
  ctx.fillStyle = team;
  ctx.beginPath();
  ctx.arc(head.x, head.y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // you: a bandana with two tails in the wind
  if (m.me) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(head.x - R + 1, head.y - 2);
    ctx.lineTo(head.x + R - 1, head.y - 2);
    const tx = head.x - f * (R + 2), ty = head.y - 1;
    const w = Math.sin(performance.now() / 90) * 2;
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - f * 10, ty + 2 + w);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - f * 8, ty + 6 - w);
    ctx.stroke();
  }
  // a small health bar over the others
  if (!m.dead && !m.me) {
    const max = m.team === "blue" ? 80 : 40;
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.fillRect(head.x - 13, head.y - R - 9, 26, 3.5);
    ctx.fillStyle = team;
    ctx.fillRect(head.x - 13, head.y - R - 9, (26 * Math.max(0, m.hp)) / max, 3.5);
  }
  ctx.restore();
}
