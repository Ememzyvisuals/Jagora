"use client";

/* Temporary switch: the home wordmark in Bricolage or Boiling. */
import { useEffect, useState } from "react";
import { MARK, setMark, useHomeMarkName } from "@/lib/fontTrial";

export function FontTrial() {
  const cur = useHomeMarkName();
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  if (!on) return null;
  return (
    <div className="fixed bottom-[max(90px,env(safe-area-inset-bottom))] left-2 z-[250] flex items-center gap-1 rounded-full bg-white/85 p-1 shadow-[0_12px_30px_-12px_rgba(10,30,70,.5)] ring-1 ring-black/5 backdrop-blur-xl dark:bg-black/60">
      <span className="px-2 font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">Logo</span>
      {MARK.map((v) => (
        <button key={v} onClick={() => setMark(v)} className={`h-8 rounded-full px-3 text-[13px] transition ${cur === v ? "bg-ink text-paper" : "text-ink hover:bg-black/5"}`}>
          {v === "boiling" ? "Boiling" : "Bricolage"}
        </button>
      ))}
    </div>
  );
}
