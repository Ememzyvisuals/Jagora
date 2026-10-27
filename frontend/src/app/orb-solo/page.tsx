"use client";
import { CheckCircle, Ear, Moon, Sparkle, SpeakerHigh } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Orb, type OrbState } from "@/components/Orb";

const STEPS: { label: string; state: OrbState; Icon: typeof Moon; ms: number }[] = [
  { label: "Resting", state: "idle", Icon: Moon, ms: 3500 },
  { label: "Listening", state: "listening", Icon: Ear, ms: 4000 },
  { label: "Thinking", state: "thinking", Icon: Sparkle, ms: 3500 },
  { label: "Speaking", state: "speaking", Icon: SpeakerHigh, ms: 4000 },
  { label: "Done", state: "idle", Icon: CheckCircle, ms: 2500 },
];
export default function OrbSolo() {
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
    <div className={`flex h-dvh flex-col items-center justify-center gap-6 ${typeof window !== "undefined" && location.search.includes("sky") ? "sky-bg" : "bg-[#e6e8eb]"}`}>
      <Orb size={380} state={step.state} levelRef={level} finish="cloud" halo={false} />
      <p className="flex items-center gap-2 rounded-full border border-ink/25 px-4 py-1.5 text-[16px] text-ink"><step.Icon size={18} /> {step.label}</p>
    </div>
  );
}
