"use client";

/* Tens of millions of Nigerians: the real Earth (drag to spin it), with real people bursting out of Nigeria, each
   linked back to it. The 3D loads only when the section comes near; until then a still picture of the same Earth
   is shown. Photos: Unsplash and Pexels (see /credits.txt). */
import { useEffect, useRef, useState } from "react";
import type { NgPoint } from "./globeStage";

const PEOPLE = [
  "portrait-03", "phone-04", "portrait-06", "phone-02", "portrait-01", "people-06",
  "portrait-08", "phone-07", "portrait-07", "phone-03", "portrait-05", "phone-01",
];
// where each photo settles, as a fraction of the box (centre 0.5, 0.5); kept outside the Earth
const SPOTS: [number, number][] = [
  [0.1, 0.2], [0.3, 0.05], [0.7, 0.05], [0.9, 0.2], [0.97, 0.45], [0.92, 0.72],
  [0.72, 0.93], [0.5, 0.97], [0.28, 0.93], [0.08, 0.72], [0.03, 0.45], [0.5, 0.0],
].map(([x, y]) => [0.5 + (x - 0.5) * 0.98, 0.5 + (y - 0.5) * 0.98]) as [number, number][];
const INNER = 0.66; // the Earth's box, as a fraction of the whole

export function PeopleGlobe({ className = "" }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const earth = useRef<HTMLDivElement>(null);
  const lines = useRef<(SVGPathElement | null)[]>([]);
  const [ready, setReady] = useState(false);
  const [out, setOut] = useState(false);
  const ng = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const host = earth.current, wrap = box.current;
    if (!host || !wrap) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stop: (() => void) | null = null;
    let alive = true;
    const draw = (p: NgPoint) => {
      // Nigeria in the whole box's 0..100 space
      const x = 50 + (p.x - 0.5) * INNER * 100, y = 50 + (p.y - 0.5) * INNER * 100;
      ng.current = { x, y };
      const op = Math.max(0, Math.min(1, (p.front - 0.15) * 4));
      lines.current.forEach((l, i) => {
        if (!l) return;
        const [sx, sy] = SPOTS[i];
        const tx = sx * 100, ty = sy * 100;
        const mx = (x + tx) / 2 + (ty - y) * 0.12, my = (y + ty) / 2 - (tx - x) * 0.12;
        l.setAttribute("d", `M${x.toFixed(2)},${y.toFixed(2)} Q${mx.toFixed(2)},${my.toFixed(2)} ${tx.toFixed(2)},${ty.toFixed(2)}`);
        l.style.opacity = String(op * 0.7);
      });
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || stop) return;
        let gl = false;
        try { gl = !!document.createElement("canvas").getContext("webgl2"); } catch {}
        if (!gl) { setOut(true); return; }
        import("./globeStage").then(({ mount }) => {
          if (!alive) return;
          stop = mount(host, () => { setReady(true); setTimeout(() => setOut(true), still ? 0 : 1700); }, draw, still);
        }).catch(() => setOut(true));
      },
      { rootMargin: "40% 0px" },
    );
    io.observe(wrap);
    return () => { alive = false; io.disconnect(); stop?.(); };
  }, []);

  return (
    <div ref={box} className={`relative aspect-square w-full select-none ${className}`}>
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {PEOPLE.map((_, i) => (
          <path key={i} ref={(el) => { lines.current[i] = el; }} fill="none" stroke="#1d63ed" strokeWidth="0.28" strokeLinecap="round"
            style={{ opacity: 0, strokeDasharray: 200, strokeDashoffset: out ? 0 : 200, transition: `stroke-dashoffset 1.1s ${0.15 + i * 0.06}s cubic-bezier(.2,.7,.2,1)` }} />
        ))}
      </svg>
      <div ref={earth} className="absolute" style={{ left: `${(1 - INNER) * 50}%`, top: `${(1 - INNER) * 50}%`, width: `${INNER * 100}%`, height: `${INNER * 100}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/globe/still.webp" alt="" aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-100"}`} />
      </div>
      {PEOPLE.map((n, i) => {
        const [x, y] = SPOTS[i];
        return (
          <div
            key={n}
            className="pointer-events-none absolute w-[13%] max-w-[92px] -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${out ? x * 100 : 50}%`,
              top: `${out ? y * 100 : 50}%`,
              opacity: out ? 1 : 0,
              transform: `translate(-50%,-50%) scale(${out ? 1 : 0.2})`,
              transition: `left .9s ${i * 0.06}s cubic-bezier(.16,1,.3,1), top .9s ${i * 0.06}s cubic-bezier(.16,1,.3,1), transform .9s ${i * 0.06}s cubic-bezier(.16,1,.3,1), opacity .4s ${i * 0.06}s`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/people/${n}.webp`} alt="" loading="lazy" className="block aspect-square w-full rounded-full border-[3px] border-white object-cover shadow-[0_14px_30px_-12px_rgba(9,40,110,.55)] sm:border-4" />
          </div>
        );
      })}
    </div>
  );
}
