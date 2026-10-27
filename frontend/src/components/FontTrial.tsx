"use client";

/* Temporary picker for choosing fonts: body text, and the big wordmark at the end of each page. */
import { useEffect, useState } from "react";
import { BODY, MARK, setTrial, useTrial } from "@/lib/fontTrial";

const LABEL: Record<string, string> = { piazzolla: "Piazzolla", biolinum: "Biolinum", vollkorn: "Vollkorn", bricolage: "Bricolage", boiling: "Boiling", anson: "Anson" };

export function FontTrial() {
  const t = useTrial();
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOn(true);
    if (innerWidth < 700) setOpen(false);
  }, []);
  if (!on) return null;
  const row = (k: "body" | "mark", list: readonly string[], cur: string) => (
    <div>
      <p className="px-1 pb-1 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">{k === "body" ? "Body" : "Wordmark"}</p>
      <div className="flex flex-col gap-1">
        {list.map((v) => (
          <button key={v} onClick={() => setTrial(k, v)} className={`h-8 rounded-full px-3 text-left text-[13.5px] transition ${cur === v ? "bg-ink text-paper" : "text-ink hover:bg-black/5"}`}>
            {LABEL[v]}
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="fixed left-2 top-[38%] z-[250] -translate-y-1/2 rounded-[20px] bg-white/85 p-2 shadow-[0_12px_30px_-12px_rgba(10,30,70,.5)] ring-1 ring-black/5 backdrop-blur-xl dark:bg-black/60">
      <button onClick={() => setOpen((v) => !v)} className="w-full px-1 pb-1 text-left text-[12px] font-semibold text-accent">
        {open ? "Fonts" : "Aa"}
      </button>
      {open && (
        <div className="flex flex-col gap-3">
          {row("body", BODY, t.body)}
          {row("mark", MARK, t.mark)}
        </div>
      )}
    </div>
  );
}
