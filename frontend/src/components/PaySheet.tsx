"use client";

/* The payment hand-over, on top of whatever she is looking at. When Jagora reaches a checkout that its own browser
   cannot pass (the site's human check), her payment card gets a Pay button. She is often watching the live page
   then, with the chat out of sight, so the same Pay button and the steps come up here as a sheet over everything.
   Closing it leaves the card in the chat. */
import { useMemo, useState } from "react";
import { useApp, type Msg } from "@/lib/store";
import { PAY, PAY_STEPS } from "./ChatCards";

type Pay = Extract<Msg, { kind: "payment" }>;

const CLOSE = { en: "Close", pcm: "Close", yo: "Pa á dé", ha: "Rufe", ig: "Mechie" } as const;
const LEAD = {
  en: "Pay in your own browser",
  pcm: "Pay for your own browser",
  yo: "Sanwó nínú browser tiyín",
  ha: "Biya a burauzarka",
  ig: "Kwụọ ụgwọ na ihe nchọgharị gị",
} as const;

export function PaySheet() {
  const lang = useApp((s) => s.lang);
  const tasks = useApp((s) => s.tasks);
  const [closed, setClosed] = useState<Record<string, true>>({});
  const open = useMemo(() => {
    for (const t of tasks) {
      for (let i = t.messages.length - 1; i >= 0; i--) {
        const m = t.messages[i] as Msg;
        if (m.kind === "payment") {
          const p = m as Pay;
          if (p.status === "waiting" && p.pay_url?.startsWith("https://") && !closed[`${p.id}|${p.pay_url}`]) return { task: t.id, p };
          break; // only the newest payment of a chat counts
        }
      }
    }
    return null;
  }, [tasks, closed]);
  if (!open) return null;
  const { task, p } = open;
  const key = `${p.id}|${p.pay_url}`;
  const say = async (text: string) => (await import("@/lib/engine")).ask(text, undefined, { chat: task });
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-center p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:p-5">
      <div role="dialog" aria-label={LEAD[lang]} className="glass pointer-events-auto w-full max-w-[460px] rounded-[26px] p-4 shadow-[0_30px_80px_-30px_rgba(10,30,70,.55)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[16px] font-bold leading-tight text-ink">{LEAD[lang]}</p>
            <p className="mt-1 line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink-2">{p.what}</p>
          </div>
          <button onClick={() => setClosed((c) => ({ ...c, [key]: true }))} className="btn btn-glass h-9 shrink-0 px-3 text-[13px] font-semibold">
            {CLOSE[lang]}
          </button>
        </div>
        <a href={p.pay_url} target="_blank" rel="noopener noreferrer" className="btn btn-ink mt-3 h-12 w-full text-[16px] font-bold">
          {PAY.payNow[lang]}{p.amount ? ` ${p.amount}` : ""}
        </a>
        <ol className="mt-3 space-y-1.5">
          {PAY_STEPS[lang].steps.slice(1).map((t, i) => (
            <li key={i} className="flex gap-2 text-[13px] font-medium leading-snug text-ink-2">
              <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-paper">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <button
          onClick={() => {
            setClosed((c) => ({ ...c, [key]: true }));
            void say(PAY.paid[lang]);
          }}
          className="btn btn-glass mt-3 h-11 w-full text-[15px] font-semibold"
        >
          {PAY.paid[lang]}
        </button>
      </div>
    </div>
  );
}
