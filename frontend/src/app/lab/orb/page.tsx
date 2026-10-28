"use client";

/* The orb in each of its states, side by side (a design check page, like /lab/glass). */
import { Orb, type OrbState } from "@/components/Orb";

const STATES: OrbState[] = ["idle", "listening", "thinking", "working", "speaking"];

export default function OrbLab() {
  return (
    <div className="sky-bg grid min-h-dvh place-items-center p-8">
      <div className="flex flex-wrap items-end justify-center gap-10">
        {STATES.map((s) => (
          <div key={s} className="flex flex-col items-center gap-3">
            <Orb size={180} state={s} />
            <span className="rounded-full bg-white/70 px-3 py-1 text-[14px] font-semibold text-ink">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
