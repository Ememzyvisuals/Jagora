"use client";

/* Amina on the page. One small transparent canvas that moves around the screen:
   - she peeks over the ask box in the hero, in from the screen edges at the card stack, the phones, the safety
     list and the languages (saying hello in each one), and sits on the Meta logo in the footer, legs swinging;
   - she follows the cursor with her eyes, gets dizzy the moment she is tapped or clicked (head rolling, stars round
     her head, then she shakes it off),
     can be picked up and dropped with the mouse (then walks back), sways when the page is scrolled fast, leans with
     the phone, points at the main buttons, stretches and checks the time when nobody moves, and waves on return.
   Places on the page are marked with data-amina="hero|cards|phones|safety|languages", the seat with
   data-amina-seat, buttons she points at with data-amina-point, and language lines with data-amina-say.
   She loads after the page is idle, draws only while visible, sits still when the visitor prefers less motion,
   and can be hidden from the footer. */
import { useEffect, useRef, useState } from "react";
import { siMeta } from "simple-icons";
import type { AminaStage, Gesture } from "./engine";
import { useApp } from "@/lib/store";

const API = process.env.NEXT_PUBLIC_BACKEND_HTTP || "";
const LANGS = ["yo", "ha", "ig", "pcm", "en"];

type Kind = "over" | "edgeL" | "edgeR" | "seat" | "corner";
type Spot = { id: string; kind: Kind; gesture: Gesture; persistent?: boolean; el?: Element | null; say?: string; y?: number };

const PLAN: Record<string, Omit<Spot, "id" | "el">> = {
  hero: { kind: "over", gesture: "wave", say: "Hi, I'm Amina!" },
  cards: { kind: "edgeL", gesture: "pointR" },
  phones: { kind: "edgeR", gesture: "watch" },
  safety: { kind: "edgeL", gesture: "shush", say: "Your secrets stay yours." },
  languages: { kind: "edgeR", gesture: "none", persistent: true },
};
const HIDE_KEY = "jagora:amina";
/* now and then she drops by on her own: a short peek from a screen edge with a word or two */
const VISIT_LINES = ["Hi, I'm Amina!", "Ẹ n lẹ́!", "Sannu!", "Ndeewo!", "How far?", "Just ask, I dey here.", "Need a hand?"];
const VISIT_GESTURES: Gesture[] = ["wave", "hello", "none"];
const sm = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/* "Hide Amina" lasts for this visit only: she is back the next time the site is opened, so a stray tap never
   removes her for good (an older version kept it forever; that setting is cleared) */
export function aminaHidden() {
  try {
    localStorage.removeItem(HIDE_KEY);
    return sessionStorage.getItem(HIDE_KEY) === "off";
  } catch {
    return false;
  }
}
export function setAminaHidden(off: boolean) {
  try {
    sessionStorage.setItem(HIDE_KEY, off ? "off" : "on");
  } catch {}
  window.dispatchEvent(new Event("amina:toggle"));
}

/** `app`: inside Jagora itself. There she only drops by now and then, and never while a task is working or
    waiting for an answer. */
export function Amina({ app = false }: { app?: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!aminaHidden());
    sync();
    window.addEventListener("amina:toggle", sync);
    return () => window.removeEventListener("amina:toggle", sync);
  }, []);
  return on ? <Stage app={app} /> : null;
}

function Stage({ app }: { app: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const starBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current!, canvas = cvs.current!, bub = bubble.current!, stars = starBox.current!;
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
    let lastLine: Element | null = null;
    let scale = 1;
    let seatStage: "drop" | "land" | "sat" = "drop";
    let landAt = 0;
    let flat: SVGElement | null = null;
    let clipLine = Infinity; // she is cut off below this line (peeking over the ask box): taps below it are not on her
    let dizzyUntil = 0; // the head roll with stars, then a shake to shake it off
    const gap = () => performance.now() + (app ? 90_000 + Math.random() * 90_000 : 30_000 + Math.random() * 40_000);
    let nextVisit = gap();
    const busy = () => app && useApp.getState().tasks.some((t) => t.status === "working" || t.status === "waiting");

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
      if (!stage || dizzyUntil) return; // nothing interrupts a dizzy spell
      stage.play(g);
      stage.mood = mood;
      gestureUntil = performance.now() + ms;
      holdUntil = Math.max(holdUntil, performance.now() + ms + 1200);
    };
    /* her real voice (Jagora's STORM voice) for the hello lines. Browsers only allow sound after the visitor has
       tapped or clicked the page once; until then the bubble invites a tap, and that tap plays the line. */
    let actx: AudioContext | null = null;
    const files = new Map<string, Promise<ArrayBuffer | null>>(); // fetched early, decoded once sound is allowed
    const clips = new Map<string, AudioBuffer>();
    let voiceSrc: AudioBufferSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    const level = new Uint8Array(256);
    let pending = "";
    let tapHint = false;
    let unlocked = false;
    const fetchClip = (lang: string) => {
      // the address carries the line itself, so when a line changes the browser can't replay an old recording
      if (!files.has(lang))
        files.set(lang, fetch(`${API}/voice/hello/${lang}?v=2&line=${encodeURIComponent(document.querySelector<HTMLElement>(`[data-amina-lang="${lang}"]`)?.dataset.aminaSay ?? "")}`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
      return files.get(lang)!;
    };
    /* One line at a time: the bubble shows exactly the line her voice is saying. A newer line cancels an older one
       that is still loading, so a late recording can never play over a different bubble. */
    let voiceTurn = 0;
    let loadingSince = 0;
    let pendingText = "";
    const hush = () => {
      voiceTurn++;
      loadingSince = 0;
      try {
        voiceSrc?.stop();
      } catch {}
      voiceSrc = null;
      analyser = null;
      if (stage) stage.mouth = null;
    };
    const sayAloud = async (lang: string, text: string) => {
      if (!API || calm || useApp.getState().muted || !LANGS.includes(lang)) return;
      if (!unlocked || !actx) {
        pending = lang;
        pendingText = text;
        tapHint = true;
        return;
      }
      tapHint = false;
      hush();
      const turn = voiceTurn;
      const c = actx;
      loadingSince = performance.now();
      if (c.state !== "running") await c.resume().catch(() => {});
      let buf = clips.get(lang);
      if (!buf) {
        const raw = await fetchClip(lang);
        if (!raw || turn !== voiceTurn) return;
        buf = await c.decodeAudioData(raw.slice(0)).catch(() => undefined);
        if (!buf) return;
        clips.set(lang, buf);
      }
      if (dead || turn !== voiceTurn) return;
      loadingSince = 0;
      speak(text, buf.duration * 1000 + 600); // the bubble stays exactly as long as she speaks
      const src = c.createBufferSource();
      src.buffer = buf;
      analyser = c.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyser.connect(c.destination);
      src.start();
      voiceSrc = src;
      sayUntil = Math.max(sayUntil, performance.now() + buf.duration * 1000 + 500);
      src.onended = () => {
        if (voiceSrc === src) {
          voiceSrc = null;
          analyser = null;
          if (stage) stage.mouth = null;
        }
      };
    };
    /** her first tap, click or key: make the player inside it and play a moment of silence, which is what unlocks
        sound on iPhone and Android; then anything she was about to say is said */
    const unlock = () => {
      if (unlocked && actx?.state === "running") return;
      try {
        if (!actx) {
          const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          actx = new C();
        }
        const blip = actx.createBufferSource();
        blip.buffer = actx.createBuffer(1, 1, 22050);
        blip.connect(actx.destination);
        blip.start(0);
        void actx.resume();
        unlocked = true;
      } catch {
        return;
      }
      if (pending) {
        const l = pending, tx = pendingText;
        pending = "";
        void sayAloud(l, tx);
      }
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
      if (s.id === "languages" && API && !calm) LANGS.forEach((l) => void fetchClip(l));
    };
    const leave = () => {
      dir = -1;
      say = "";
      if (spot?.id === "languages") {
        hush(); // she stops talking as she goes
        lastLine = null;
      }
    };

    /* choose where to be */
    /** the language line nearest the middle of the screen, if one is in the middle half */
    const langLine = () => {
      let best: HTMLElement | null = null, bestD = 1e9;
      document.querySelectorAll<HTMLElement>("[data-amina-say]").forEach((n) => {
        const r = n.getBoundingClientRect();
        const c = r.top + r.height / 2;
        const d = Math.abs(c - innerHeight / 2);
        if (c > innerHeight * 0.22 && c < innerHeight * 0.78 && d < bestD) {
          best = n;
          bestD = d;
        }
      });
      return best as HTMLElement | null;
    };

    const choose = () => {
      const seat = app ? null : seatEl();
      if (seat && visible(seat.getBoundingClientRect())) {
        if (spot?.kind !== "seat") {
          if (spot && phase > 0.05) return leave();
          enter({ id: "seat", kind: "seat", gesture: "none", el: seat });
        }
        return;
      }
      if (spot?.kind === "seat") return leave();
      if (calm) return;
      // the languages: she comes as soon as a line reaches the middle, and a peek that is still showing makes way
      const talking = langLine();
      if (talking && spot?.id !== "languages") {
        if (spot && phase > 0.05) {
          if (dir !== -1) {
            done.add(spot.id);
            leave();
          }
          return;
        }
        const a = anchors().find((x) => x.id === "languages");
        if (a) return enter(a);
      }
      if (spot?.id === "languages") {
        if (!talking && dir !== -1) leave();
        return;
      }
      if (spot?.id === "visit" && busy() && dir !== -1) return leave(); // Jagora got to work: she makes way
      if (spot) {
        const r = spot.el?.getBoundingClientRect();
        const stillHere = spot.kind === "corner" || spot.id === "visit" || (r && visible(r) && (spot.persistent ? inView(r, 0.15) : true));
        if (!stillHere || performance.now() > holdUntil) {
          if (dir !== -1) {
            done.add(spot.id);
            leave();
          }
        }
        return;
      }
      if (!app)
        for (const s of anchors()) {
          if (s.persistent || done.has(s.id)) continue;
          const r = s.el!.getBoundingClientRect();
          if (s.persistent ? inView(r, 0.15) : inView(r)) {
            nextVisit = gap();
            return enter(s);
          }
        }
      if (performance.now() > nextVisit && !document.hidden && !drag) {
        nextVisit = gap();
        if (busy()) return;
        const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
        enter({ id: "visit", kind: Math.random() < 0.5 ? "edgeL" : "edgeR", gesture: pick(VISIT_GESTURES), say: pick(VISIT_LINES), y: innerHeight * (0.3 + Math.random() * 0.35) });
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
      clipLine = Infinity;
      stage.yaw = 0;
      stage.leanTo = 0;
      if (sp.kind === "over" || sp.kind === "corner") {
        const line = sp.kind === "corner" ? innerHeight : r.top + 3;
        tx = sp.kind === "corner" ? (small ? 70 : 110) : r.right - (small ? 52 : 92);
        ty = line - (small ? 44 : 62) * e + 150 * (1 - e);
        const cut = Math.max(0, pos.y + H - line);
        clip = `inset(0 0 ${cut}px 0)`;
        clipLine = line;
        stage.yaw = -0.15;
        el.style.opacity = "1";
      } else if (sp.kind === "edgeL" || sp.kind === "edgeR") {
        el.style.opacity = "1";
        const left = sp.kind === "edgeL";
        // a peek round the edge of the screen: her hips stay just past the edge, so only her head, shoulders and
        // the hand holding the edge come out onto the page
        const hip = stage.screenOf("hips") ?? { x: W / 2, y: H * 0.55 };
        const past = (small ? 12 : 16) + 160 * (1 - e);
        tx = (left ? -past : innerWidth + past) - hip.x + head.x;
        ty = sp.y ?? Math.min(innerHeight * 0.7, Math.max(innerHeight * 0.3, r.top + r.height / 2));
        if (sp.id === "languages") {
          let line = langLine();
          // while she is saying a line (or it is about to start), she stays with it, as long as it is on screen
          const held = lastLine as HTMLElement | null;
          const busyVoice = voiceSrc || (loadingSince && performance.now() - loadingSince < 1500);
          if (held && line !== held && busyVoice && visible(held.getBoundingClientRect())) line = held;
          if (line) {
            ty = line.getBoundingClientRect().top + 10;
            if (line !== lastLine && phase > 0.8) {
              lastLine = line;
              const text = line.dataset.aminaSay || "";
              speak(text, 2400);
              void sayAloud(line.dataset.aminaLang || "", text);
            }
          }
        }
        stage.yaw = left ? 0.35 : -0.35;
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
          if (spot.kind !== "seat" && !spot.persistent && spot.id !== "visit") done.add(spot.id);
          spot = null;
          dir = 0;
          stage.talk = false;
        }
      }
      // gestures and idle life
      const t = performance.now();
      if (dizzyUntil && t > dizzyUntil) {
        // shake it off
        dizzyUntil = 0;
        stage.play("shake", true);
        stage.mood = "happy";
        gestureUntil = t + 900;
        speak(["I'm okay!", "Phew!", "Ó dáa!", "I dey alright!"][Math.floor(Math.random() * 4)], 1500);
      }
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
        if (analyser && voiceSrc) {
          analyser.getByteTimeDomainData(level);
          let sum = 0;
          for (let i = 0; i < level.length; i++) sum += (level[i] - 128) ** 2;
          stage.mouth = Math.min(1, Math.sqrt(sum / level.length) / 22);
          stage.talk = true;
        }
        stage.frame(dt);
        // the speech bubble rides next to her head
        if (say) {
          const hp = stage.screenOf("head")!;
          const right = (spot?.kind === "edgeR");
          bub.textContent = tapHint ? `${say}  (tap to hear her)` : say;
          bub.style.opacity = "1";
          const bw = bub.offsetWidth;
          const bx = pos.x + hp.x * scale + (right ? -bw - 34 : 34);
          bub.style.transform = `translate3d(${Math.round(Math.max(8, Math.min(innerWidth - bw - 8, bx)))}px, ${Math.round(pos.y + hp.y * scale - 46)}px, 0)`;
        } else bub.style.opacity = "0";
        // dizzy stars circling over her head
        if (dizzyUntil) {
          const hp = stage.screenOf("head")!;
          const cx = pos.x + hp.x * scale, cy = pos.y + (hp.y - H * 0.1) * scale;
          const rx = W * 0.2 * scale, ry = rx * 0.32;
          stars.style.display = "block";
          [...stars.children].forEach((n, i) => {
            const a = t / 190 + (i * Math.PI * 2) / 3;
            const z = Math.sin(a);
            (n as HTMLElement).style.transform = `translate3d(${(cx + Math.cos(a) * rx).toFixed(1)}px, ${(cy + z * ry).toFixed(1)}px, 0) translate(-50%, -50%) scale(${(0.8 + z * 0.25).toFixed(2)}) rotate(${((t / 4) % 360).toFixed(0)}deg)`;
            (n as HTMLElement).style.opacity = clipLine < cy ? "0" : z < -0.2 ? "0.55" : "1";
          });
        } else stars.style.display = "none";
      } else {
        el.style.display = "none";
        bub.style.opacity = "0";
        stars.style.display = "none";
        // off screen: no drawing, just a quiet check a few times a second whether it is time to visit
        raf = window.setTimeout(() => (raf = requestAnimationFrame((n) => loop(n, now))), 350) as unknown as number;
        return;
      }
      raf = requestAnimationFrame((n) => loop(n, now));
    };

    /* --- the visitor --- */
    const local = (x: number, y: number) => ({ x: (x - pos.x) / scale, y: (y - pos.y) / scale });
    /** is this point on her? Her body, or a generous box round her head and upper body (bigger for a finger), but
        never the part of the page she is hidden behind and never off the screen */
    const onHer = (x: number, y: number, touch = false) => {
      if (!stage || !spot || phase < 0.6) return false;
      if (document.documentElement.dataset.typeart) return false; // the art board covers her: taps there are for the board
      if (y >= clipLine || x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const p = local(x, y);
      if (p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H && stage.hit(p.x, p.y)) return true;
      const hd = stage.screenOf("head"), hp = stage.screenOf("hips");
      if (!hd || !hp) return false;
      const pad = touch ? 40 : 16;
      const l = pos.x + Math.min(hd.x, hp.x) * scale - pad, r = pos.x + Math.max(hd.x, hp.x) * scale + pad;
      const top = pos.y + hd.y * scale - pad - 18 * scale, bottom = pos.y + hp.y * scale + (touch ? 30 : 10) * scale;
      return x >= l && x <= r && y >= top && y <= bottom;
    };
    /** a tap or click on her: dizzy at once */
    const dizzy = () => {
      if (!stage) return;
      const t = performance.now();
      if (dizzyUntil > t) return; // already spinning
      if (dir === -1) dir = 1; // tapped as she was going: she stays for it
      stage.play("dizzy", true);
      stage.mood = "fun";
      dizzyUntil = t + 2500;
      gestureUntil = t + 3400;
      holdUntil = Math.max(holdUntil, t + 5200);
      speak(["Whoa!", "Ah ah!", "Wahala!", "Ewo!"][Math.floor(Math.random() * 4)], 1400);
      try {
        navigator.vibrate?.(12);
      } catch {}
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
    let tapAt = 0;
    const onDown = (e: PointerEvent) => {
      if (!onHer(e.clientX, e.clientY, e.pointerType !== "mouse")) return;
      e.preventDefault();
      e.stopPropagation();
      tapAt = performance.now();
      dizzy();
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
      // the tap itself was handled the moment it landed (onDown)
    };
    const onClick = (e: MouseEvent) => {
      // the click that follows a tap on her never reaches the page under her
      if (performance.now() - tapAt < 800 || onHer(e.clientX, e.clientY)) {
        tapAt = 0;
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
      } else if (app) {
        if (!busy()) enter({ id: "visit", kind: "edgeR", gesture: "hello", say: "Welcome back!", y: innerHeight * 0.4 });
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
        if (process.env.NODE_ENV !== "production") (window as unknown as { __amina?: unknown }).__amina = { stage: s, state: () => ({ spot: spot?.id ?? null, phase, dir, pos, say }), go: (id: string) => { done.delete(id); spot = null; phase = 0; const a = anchors().find((x) => x.id === id); if (a) enter(a); } };
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
    const UNLOCK = ["pointerdown", "touchend", "click", "keydown"] as const;
    UNLOCK.forEach((e) => addEventListener(e, unlock, { capture: true, passive: true }));
    addEventListener("pointerup", onUp, { capture: true });
    addEventListener("click", onClick, { capture: true });
    addEventListener("resize", size);
    addEventListener("deviceorientation", onTilt);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      clearTimeout(raf);
      points.forEach((p) => p.removeEventListener("pointerenter", onPointAt));
      seat?.removeEventListener("click", onSeatClick);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown, { capture: true });
      UNLOCK.forEach((e) => removeEventListener(e, unlock, { capture: true }));
      try {
        voiceSrc?.stop();
      } catch {}
      void actx?.close();
      removeEventListener("pointerup", onUp, { capture: true });
      removeEventListener("click", onClick, { capture: true });
      removeEventListener("resize", size);
      removeEventListener("deviceorientation", onTilt);
      document.removeEventListener("visibilitychange", onVis);
      document.documentElement.style.cursor = "";
      stage?.dispose();
    };
  }, [app]);

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
      <div ref={starBox} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[61] hidden">
        {[0, 1, 2].map((i) => (
          <svg key={i} viewBox="0 0 24 24" className="absolute left-0 top-0 h-[18px] w-[18px] drop-shadow-[0_1px_2px_rgba(10,30,70,.35)]">
            <path d="M12 2.5l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 16.7 6.2 20.1l1.5-6.5-5-4.4 6.6-.6z" fill="#ffd166" stroke="#c98a12" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        ))}
      </div>
    </>
  );
}
