"use client";
import { CheckCircle, Ear, Moon, Sparkle, SpeakerHigh } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Orb, type OrbState } from "@/components/Orb";
import type { Finish } from "@/components/orbShader";

const STEPS: { label: string; state: OrbState; Icon: typeof Moon; ms: number }[] = [
  { label: "Resting", state: "idle", Icon: Moon, ms: 3500 },
  { label: "Listening", state: "listening", Icon: Ear, ms: 4500 },
  { label: "Thinking", state: "thinking", Icon: Sparkle, ms: 4000 },
  { label: "Speaking", state: "speaking", Icon: SpeakerHigh, ms: 4500 },
  { label: "Done", state: "idle", Icon: CheckCircle, ms: 3000 },
];
const FINISHES: { f: Finish | "cloud" | "glass"; name: string }[] = [
  { f: "pearl", name: "A · Pearl" },
  { f: "vessel", name: "B · Vessel" },
  { f: "ink", name: "C · Ink" },
  { f: "glass", name: "D · Jagora glass (new)" },
];

export default function OrbDemo() {
  const [i, setI] = useState(0);
  const level = useRef(0);
  const step = STEPS[i % STEPS.length];
  useEffect(() => {
    const id = setTimeout(() => setI((x) => x + 1), step.ms);
    return () => clearTimeout(id);
  }, [i, step]);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const talking = step.state === "listening" || step.state === "speaking";
      const word = t % 0.8 < 0.55 ? 1 : 0.1;
      level.current = talking ? word * (0.35 + 0.55 * Math.abs(Math.sin(t * 9.1)) * (0.7 + 0.3 * Math.sin(t * 2.3))) : 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step.state]);
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-[#e8eaed]">
      {[false, true].map((onSky) => (
        <div key={String(onSky)} className={`grid w-full grid-cols-4 justify-items-center gap-6 px-6 py-6 ${onSky ? "sky-bg" : ""}`}>
          {FINISHES.map(({ f, name }) => (
            <div key={f} className="flex flex-col items-center gap-3">
              <Orb size={170} state={step.state} levelRef={level} finish={f} halo={f !== "glass"} />
              <p className={`rounded-full px-3 text-[15px] font-semibold text-ink ${onSky ? "bg-white/70" : ""}`}>{name}</p>
            </div>
          ))}
        </div>
      ))}
      <p className="flex items-center gap-2 rounded-full border border-ink/25 bg-white/70 px-4 py-1.5 text-[16px] text-ink">
        <step.Icon size={18} /> {step.label}
      </p>
    </div>
  );
}
