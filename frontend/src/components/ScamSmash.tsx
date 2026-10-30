"use client";

/* Scam Smash: the second game in the playground, played on the page you are on. Text messages fall down the real
   page. Tap the scams and they burst apart; let the real messages fall past. A scam that gets through, or a real
   message you smash, costs a life. Three lives; it speeds up as you go. Works with a mouse or a finger. Exit (or
   Esc) leaves the page exactly as it was: nothing on the page is touched. */
import { useCallback, useEffect, useRef, useState } from "react";

export const startScamSmash = () => dispatchEvent(new Event("jagora:scamsmash"));

type Msg = { from: string; text: string; scam: boolean };
const SCAMS: Msg[] = [
  { from: "+234 903 112 4471", text: "Your BVN is blocked. Send the OTP we just sent you to unblock it now.", scam: true },
  { from: "MEGA PROMO", text: "Congratulations! You won N5,000,000. Pay N2,500 processing fee to claim it today.", scam: true },
  { from: "Account Team", text: "Your account will be closed in 2 hours. Verify here: bit.ly/acct-verify-ng", scam: true },
  { from: "+234 816 330 9921", text: "Mummy, I am using a friend's phone. Please send N20,000 to this number urgently.", scam: true },
  { from: "Parcel Desk", text: "Your parcel is held at customs. Pay N3,200 release fee at parcel-ng-pay.top", scam: true },
  { from: "Grant Office", text: "You were selected for a N250,000 government grant. Reply with your card PIN to receive it.", scam: true },
  { from: "+234 701 554 0187", text: "I sent N50,000 to your account by mistake. Please send it back to me now.", scam: true },
  { from: "NIN Update", text: "Your NIN will be suspended today. Reply with your NIN and date of birth to keep it.", scam: true },
  { from: "Jobs Hub", text: "Earn N60,000 daily from home. Pay N5,000 registration to start this week.", scam: true },
  { from: "Bank Security", text: "Unusual login on your account. Call 0812 664 2019 and read us the code we send.", scam: true },
  { from: "Crypto Club", text: "Double your money in 7 days. Send N100,000 and get N200,000 back, guaranteed.", scam: true },
  { from: "Prize Desk", text: "Your number won a new car! Send N15,000 delivery fee to collect your keys.", scam: true },
];
const REAL: Msg[] = [
  { from: "JAMB", text: "Your JAMB result is out. Check it on the official JAMB portal with your registration number.", scam: false },
  { from: "NRC", text: "Your Lagos to Ibadan train ticket for 8:00 am is confirmed. Coach 3, seat 14C.", scam: false },
  { from: "Your bank", text: "Your OTP is 482913. Do not share it with anyone, not even bank staff.", scam: false },
  { from: "Your bank", text: "Credit: N12,500 from ADE OLU. Available balance: N43,210.", scam: false },
  { from: "Power", text: "Your electricity token is 5521 0934 7781 2290 4417. Units: 32.4", scam: false },
  { from: "Clinic", text: "Reminder: your appointment is tomorrow at 10:30 am. Please come early.", scam: false },
  { from: "Network", text: "Your 2GB data bundle is now active. It is valid for 30 days.", scam: false },
  { from: "Mum", text: "Have you eaten? Call me when you close from work.", scam: false },
  { from: "School", text: "Your WAEC certificate is ready for collection at the school office.", scam: false },
  { from: "Pharmacy", text: "Your order is ready for pickup. We close at 8 pm today.", scam: false },
];

type Bubble = { el: HTMLDivElement; msg: Msg; x: number; y: number; w: number; h: number; v: number; sway: number; t: number; gone: boolean; shake: number };
type Bit = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; word?: string; font?: string; w: number; h: number; c: string };
type Pop = { x: number; y: number; t: number; text: string; good: boolean };

export function ScamSmash() {
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState<"intro" | "play" | "over">("intro");
  const [hud, setHud] = useState({ score: 0, lives: 3 });
  const [final, setFinal] = useState({ score: 0, smashed: 0, missed: "" });
  const field = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);

  const exit = useCallback(() => {
    setOn(false);
    setPhase("intro");
  }, []);

  useEffect(() => {
    const open = () => {
      setOn(true);
      setPhase("intro");
    };
    addEventListener("jagora:scamsmash", open);
    return () => removeEventListener("jagora:scamsmash", open);
  }, []);
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && exit();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [on, exit]);

  // the game
  useEffect(() => {
    if (!on || phase !== "play") return;
    const host = field.current!, c = cv.current!, ctx = c.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const fit = () => {
      c.width = innerWidth * dpr;
      c.height = innerHeight * dpr;
    };
    fit();
    const bubbles: Bubble[] = [], bits: Bit[] = [], pops: Pop[] = [];
    let score = 0, lives = 3, smashed = 0, t = 0, nextSpawn = 0.4, flash = 0, flashGood = false, missed = "";
    let raf = 0, last = performance.now(), dead = false;
    let deckS = [...SCAMS].sort(() => Math.random() - 0.5), deckR = [...REAL].sort(() => Math.random() - 0.5);
    const draw = (scam: boolean) => {
      if (scam) {
        if (!deckS.length) deckS = [...SCAMS].sort(() => Math.random() - 0.5);
        return deckS.pop()!;
      }
      if (!deckR.length) deckR = [...REAL].sort(() => Math.random() - 0.5);
      return deckR.pop()!;
    };
    const speed = () => 64 + Math.min(150, t * 3.2); // px per second, faster as you go
    const gap = () => Math.max(0.62, 1.75 - t * 0.022);

    /** a new message, only where it has room: never on top of one that is still coming in at the top */
    const spawn = () => {
      const w = Math.min(300, innerWidth * 0.78);
      const free = (x: number) => !bubbles.some((b) => !b.gone && b.y < 24 && b.x < x + w + 10 && b.x + b.w + 10 > x);
      let x = 12 + Math.random() * Math.max(0, innerWidth - w - 24);
      for (let k = 0; k < 8 && !free(x); k++) x = 12 + Math.random() * Math.max(0, innerWidth - w - 24);
      if (!free(x)) return false;
      const msg = draw(Math.random() < 0.6);
      const el = document.createElement("div");
      el.className = "ss-bubble";
      el.style.width = `${w}px`;
      const from = document.createElement("div");
      from.className = "ss-from";
      from.textContent = msg.from;
      const text = document.createElement("div");
      text.className = "ss-text";
      text.textContent = msg.text;
      el.append(from, text);
      host.appendChild(el);
      const h = el.offsetHeight;
      const b: Bubble = { el, msg, x, y: -h - 10, w, h, v: 0, sway: Math.random() * 6, t: 0, gone: false, shake: 0 };
      el.style.transform = `translate3d(${x}px, ${b.y}px, 0)`;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hit(b, e.clientX, e.clientY);
      });
      bubbles.push(b);
      return true;
    };

    /* the bubble bursts: glass shards and its words fly apart, spin, fall and fade */
    const burst = (b: Bubble, at: { x: number; y: number }) => {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      for (let i = 0; i < 22; i++) {
        const px = b.x + Math.random() * b.w, py = b.y + Math.random() * b.h;
        const a = Math.atan2(py - at.y, px - at.x) + (Math.random() - 0.5) * 0.8;
        const sp = 220 + Math.random() * 420;
        const s = 6 + Math.random() * 14;
        bits.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, life: 0.9 + Math.random() * 0.6, w: s, h: s * (0.5 + Math.random() * 0.6), c: Math.random() < 0.55 ? "rgba(255,255,255,.95)" : Math.random() < 0.5 ? "#2fa3ea" : "#1d63ed" });
      }
      // the words of the message, each its own piece
      const font = `800 ${innerWidth < 640 ? 14 : 15}px ui-sans-serif, system-ui, sans-serif`;
      ctx.font = font;
      const words = b.msg.text.split(/\s+/).slice(0, 18);
      let lx = b.x + 14, ly = b.y + 38;
      for (const word of words) {
        const ww = ctx.measureText(word).width;
        if (lx + ww > b.x + b.w - 14) {
          lx = b.x + 14;
          ly += 20;
        }
        const px = lx + ww / 2, py = ly;
        const a = Math.atan2(py - at.y, px - at.x) + (Math.random() - 0.5) * 0.7;
        const sp = 200 + Math.random() * 360;
        bits.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260, rot: 0, vr: (Math.random() - 0.5) * 9, life: 1.3 + Math.random() * 0.6, word, font, w: ww, h: 16, c: "#0e0f12" });
        lx += ww + 5;
      }
      pops.push({ x: cx, y: cy, t: 0, text: `+${10 + Math.min(20, Math.floor(t / 15) * 5)}`, good: true });
      try {
        navigator.vibrate?.(15);
      } catch {}
    };

    const hit = (b: Bubble, x: number, y: number) => {
      if (b.gone || dead) return;
      if (b.msg.scam) {
        b.gone = true;
        smashed++;
        score += 10 + Math.min(20, Math.floor(t / 15) * 5);
        burst(b, { x, y });
        b.el.remove();
      } else {
        // a real message: that was a mistake
        b.shake = 0.45;
        b.el.classList.add("ss-wrong");
        lose(b.msg, "That one was real");
        pops.push({ x: b.x + b.w / 2, y: b.y, t: 0, text: "That one was real", good: false });
      }
    };
    const lose = (m: Msg, why: string) => {
      lives -= 1;
      flash = 0.5;
      flashGood = false;
      if (!missed) missed = `${why}: "${m.text}"`;
      try {
        navigator.vibrate?.([30, 40, 30]);
      } catch {}
      if (lives <= 0) {
        dead = true;
        setTimeout(() => {
          setFinal({ score, smashed, missed });
          setPhase("over");
        }, 650);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      if (!dead) {
        t += dt;
        nextSpawn -= dt;
        if (nextSpawn <= 0) nextSpawn = spawn() ? gap() * (0.75 + Math.random() * 0.5) : 0.12;
      }
      for (const b of bubbles) {
        if (b.gone) continue;
        b.t += dt;
        b.y += speed() * dt; // all at one speed, so none ever slides over another
        b.shake = Math.max(0, b.shake - dt);
        const sx = Math.sin(b.t * 1.3 + b.sway) * 6 + (b.shake ? Math.sin(b.t * 60) * 7 * (b.shake / 0.45) : 0);
        b.el.style.transform = `translate3d(${(b.x + sx).toFixed(1)}px, ${b.y.toFixed(1)}px, 0) rotate(${(Math.sin(b.t * 1.1 + b.sway) * 2).toFixed(2)}deg)`;
        if (b.y > innerHeight + 10) {
          b.gone = true;
          b.el.remove();
          if (b.msg.scam && !b.el.classList.contains("ss-wrong")) {
            lose(b.msg, "A scam got through");
            pops.push({ x: Math.min(innerWidth - 90, Math.max(90, b.x + b.w / 2)), y: innerHeight - 40, t: 0, text: "A scam got through", good: false });
          } else if (!b.el.classList.contains("ss-wrong")) {
            score += 5;
            flash = 0.25;
            flashGood = true;
            pops.push({ x: Math.min(innerWidth - 40, Math.max(40, b.x + b.w / 2)), y: innerHeight - 40, t: 0, text: "+5", good: true });
          }
        }
      }
      for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].gone) bubbles.splice(i, 1);

      // pieces
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.textBaseline = "middle";
      for (const p of bits) {
        p.vy += 1300 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.life -= dt;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
        const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
        ctx.setTransform(dpr * cs, dpr * sn, -dpr * sn, dpr * cs, dpr * p.x, dpr * p.y);
        if (p.word) {
          ctx.font = p.font!;
          ctx.fillStyle = p.c;
          ctx.fillText(p.word, -p.w / 2, 0);
        } else {
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
      }
      for (let i = bits.length - 1; i >= 0; i--) if (bits[i].life <= 0 || bits[i].y > innerHeight + 80) bits.splice(i, 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // score pops and burst rings
      for (const p of pops) {
        p.t += dt;
        const k = p.t / 1.1;
        ctx.globalAlpha = Math.max(0, 1 - k);
        if (p.good && p.text.startsWith("+") && p.y < innerHeight - 60) {
          ctx.strokeStyle = "#2fa3ea";
          ctx.lineWidth = 4 * (1 - Math.min(1, k * 3)) + 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 20 + Math.sqrt(Math.min(1, k * 3)) * 70, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.font = `800 ${p.text.length > 4 ? 17 : 24}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = "center";
        const y = p.y - k * 50;
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.strokeText(p.text, p.x, y);
        ctx.fillStyle = p.good ? "#1d63ed" : "#d92d3a";
        ctx.fillText(p.text, p.x, y);
        ctx.textAlign = "start";
      }
      for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 1.1) pops.splice(i, 1);
      // a soft glow along the bottom edge: red when a life is lost, blue when a real message reaches you
      if (flash > 0) {
        flash -= dt;
        const g = ctx.createLinearGradient(0, innerHeight, 0, innerHeight - 140);
        g.addColorStop(0, flashGood ? `rgba(47,163,234,${(flash * 1.2).toFixed(2)})` : `rgba(229,72,77,${(flash * 1.2).toFixed(2)})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(0, innerHeight - 140, innerWidth, 140);
      }
      ctx.globalAlpha = 1;
      if (Math.round(t * 20) % 3 === 0 || dead) setHud((h) => (h.score === score && h.lives === lives ? h : { score, lives }));
    };
    raf = requestAnimationFrame(loop);
    addEventListener("resize", fit);
    const dbg = new URLSearchParams(location.search).has("gametest");
    if (dbg) (window as unknown as { __ss?: unknown }).__ss = { bubbles: () => bubbles.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, scam: b.msg.scam })), slow: () => (t = -1e9) };
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", fit);
      for (const b of bubbles) b.el.remove();
    };
  }, [on, phase]);

  if (!on) return null;
  const start = () => {
    setHud({ score: 0, lives: 3 });
    setPhase("play");
  };
  return (
    <div id="scam-smash" className="fixed inset-0 z-[400] select-none overflow-hidden" style={{ touchAction: "none" }}>
      <style>{`
        #scam-smash .ss-bubble{position:absolute;left:0;top:0;cursor:pointer;border-radius:22px 22px 22px 6px;background:rgba(255,255,255,.93);
          box-shadow:0 14px 34px -14px rgba(10,30,70,.55),inset 0 0 0 1px rgba(255,255,255,.9),0 0 0 1px rgba(29,99,237,.12);padding:10px 14px 12px;will-change:transform}
        #scam-smash .ss-from{font-size:12.5px;font-weight:800;letter-spacing:.01em;color:#1d63ed;margin-bottom:3px}
        #scam-smash .ss-text{font-size:15px;font-weight:800;line-height:1.3;color:#0e0f12}
        #scam-smash .ss-wrong{background:#ffe9ea;box-shadow:0 14px 34px -14px rgba(120,20,30,.5),0 0 0 2px #e5484d}
        @media (max-width:640px){#scam-smash .ss-text{font-size:14px}}
        :root[data-theme="dark"] #scam-smash .ss-bubble{background:rgba(35,38,45,.94)}
        :root[data-theme="dark"] #scam-smash .ss-text{color:#eceef2}
      `}</style>
      {/* a light veil so the bubbles read clearly over the real page */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#bfe3fb]/25 via-transparent to-[#1d63ed]/10" />
      <div ref={field} className="absolute inset-0" />
      <canvas ref={cv} className="pointer-events-none absolute inset-0 h-full w-full" />

      {phase === "play" && (
        <div className="pointer-events-none absolute inset-x-0 top-[max(10px,env(safe-area-inset-top))] z-10 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white/80 py-1.5 pl-4 pr-1.5 text-[15px] font-extrabold text-ink shadow-[0_10px_30px_-12px_rgba(10,30,70,.5)] ring-1 ring-black/5 backdrop-blur-xl dark:bg-[#23262d]/85">
            <span>Score {hud.score}</span>
            <span className="flex items-center gap-1" aria-label={`${hud.lives} lives left`}>
              {[0, 1, 2].map((i) => (
                <span key={i} className={`h-3 w-3 rounded-full transition-colors ${i < hud.lives ? "bg-[#2fa3ea]" : "bg-black/15 dark:bg-white/20"}`} />
              ))}
            </span>
            <button onClick={exit} className="h-8 rounded-full bg-ink px-3.5 text-[13px] font-bold text-paper">
              Exit
            </button>
          </div>
        </div>
      )}

      {phase !== "play" && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#0b1426]/25 p-5 backdrop-blur-[2px]">
          <div className="w-full max-w-[420px] rounded-[30px] bg-white/85 p-6 text-center shadow-[0_30px_80px_-30px_rgba(10,30,70,.6)] ring-1 ring-black/5 backdrop-blur-2xl dark:bg-[#23262d]/90">
            <svg viewBox="0 0 140 64" className="mx-auto h-[64px] w-[140px]" aria-hidden="true">
              <rect x="6" y="8" width="70" height="30" rx="12" fill="#ffffff" stroke="#1d63ed" strokeWidth="2.5" />
              <path d="M16 38 L14 48 L26 38 Z" fill="#ffffff" stroke="#1d63ed" strokeWidth="2.5" strokeLinejoin="round" />
              <rect x="16" y="17" width="46" height="4" rx="2" fill="#1d63ed" />
              <rect x="16" y="25" width="32" height="4" rx="2" fill="#2fa3ea" />
              <g transform="translate(96 30)">
                <path d="M0 -22 L5 -7 L21 -9 L9 2 L16 17 L0 8 L-16 17 L-9 2 L-21 -9 L-5 -7 Z" fill="#2fa3ea" stroke="#1d63ed" strokeWidth="2.5" strokeLinejoin="round" />
                <rect x="-11" y="-3" width="22" height="5" rx="2.5" fill="#ffffff" transform="rotate(-20)" />
              </g>
            </svg>
            <h2 className="mt-2 font-display text-[34px] font-bold leading-none tracking-[-0.04em] text-ink">{phase === "over" ? "Game over" : "Scam Smash"}</h2>
            {phase === "over" ? (
              <>
                <p className="mt-3 text-[17px] font-bold text-ink-2">
                  Score <span className="text-ink">{final.score}</span>, {final.smashed} {final.smashed === 1 ? "scam" : "scams"} smashed.
                </p>
                {final.missed && <p className="mt-3 rounded-[16px] bg-black/5 p-3 text-left text-[14px] font-semibold leading-snug text-ink-2 dark:bg-white/10">{final.missed}</p>}
              </>
            ) : (
              <p className="mt-3 text-[16px] font-semibold leading-relaxed text-ink-2">
                Messages are falling down this page. Tap the scams to smash them. Let the real ones fall past. Three lives, and it gets faster.
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button onClick={start} className="btn btn-ink h-12 flex-1 text-[16px] font-bold">
                {phase === "over" ? "Play again" : "Start"}
              </button>
              <button onClick={exit} className="btn btn-glass h-12 px-6 text-[15.5px] font-bold">
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
