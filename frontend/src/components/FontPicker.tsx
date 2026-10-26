"use client";

/* A small picker, for choosing the display font across every page: ours, Galgo Condensed or Climate Crisis.
   Temporary: remove once one is chosen. */
import { useEffect, useState } from "react";
import { setFont, useFont, type FontChoice } from "@/lib/fontChoice";

const OPTIONS: { id: FontChoice; label: string; family: string }[] = [
  { id: "ours", label: "Ours", family: "Jagora Pixel" },
  { id: "galgo", label: "Galgo", family: "Jagora Galgo" },
  { id: "climate", label: "Climate", family: "Jagora Climate" },
];

export function FontPicker() {
  const font = useFont();
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  if (!on) return null;
  return (
    <div className="fixed left-2 top-1/2 z-[200] flex -translate-y-1/2 flex-col gap-1 rounded-[20px] bg-white/80 p-1 shadow-[0_8px_24px_-10px_rgba(10,30,70,.5)] ring-1 ring-black/5 backdrop-blur-xl dark:bg-black/50" role="radiogroup" aria-label="Display font">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={font === o.id}
          onClick={() => setFont(o.id)}
          className={`h-8 rounded-full px-3 text-[14px] leading-none transition ${font === o.id ? "bg-ink text-paper" : "text-ink-2 hover:bg-black/5"}`}
          style={{ fontFamily: `"${o.family}", "Jagora Sans", sans-serif`, fontSizeAdjust: "ex-height 0.5" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
