"use client";

/* What she sees if part of the app breaks: a calm note and a way back, never a blank page. If the app was only out of
   date (a new version came out while it was open), it quietly loads the new one instead. */
import { useEffect, useState } from "react";
import { isStaleCode, reloadOnce, reportCrash } from "@/lib/crash";

const WORDS = {
  en: ["Something went wrong", "Jagora hit a problem. Your chats are safe.", "Try again", "Open Jagora again"],
  pcm: ["Something no work well", "Jagora jam wahala. Your chats dey safe.", "Try am again", "Open Jagora again"],
  yo: ["Nǹkan kan ò lọ dáadáa", "Jagora ní ìṣòro kan. Àwọn ìjíròrò yín wà láìléwu.", "Ẹ tún gbìyànjú", "Ẹ ṣí Jagora lẹ́ẹ̀kan sí i"],
  ha: ["Wani abu ya faru", "Jagora ta sami matsala. Hirarrakinku suna lafiya.", "Sake gwadawa", "Sake buɗe Jagora"],
  ig: ["Ihe adịghị mma", "Jagora nwere nsogbu. Mkparịta ụka gị dị mma.", "Nwaa ọzọ", "Meghee Jagora ọzọ"],
} as const;

function savedLang(): keyof typeof WORDS {
  try {
    const l = JSON.parse(localStorage.getItem("jagora") || "{}")?.state?.lang;
    if (l in WORDS) return l;
  } catch {}
  return "en";
}

export function CrashScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [lang, setLang] = useState<keyof typeof WORDS>("en");
  const [stale, setStale] = useState(false);
  useEffect(() => {
    setLang(savedLang());
    if (isStaleCode(error) && reloadOnce()) return setStale(true);
    reportCrash(error);
  }, [error]);
  if (stale) return <div className="min-h-dvh bg-paper" />;
  const [title, body, again, home] = WORDS[lang];
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-6 text-center text-ink">
      <div className="flex max-w-[360px] flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark-64.png" alt="" width={56} height={56} className="rounded-[16px]" />
        <h1 className="text-[22px] font-semibold leading-tight">{title}</h1>
        <p className="text-[15.5px] leading-relaxed text-ink-2">{body}</p>
        <button onClick={reset} className="mt-2 h-12 w-full rounded-full bg-ink text-[15.5px] font-semibold text-paper transition active:scale-[.98]">
          {again}
        </button>
        <a href="/app" className="h-12 w-full rounded-full bg-black/[.06] text-[15.5px] font-semibold leading-[48px] text-ink">
          {home}
        </a>
        <p className="mt-3 break-all text-[11.5px] text-ink-3">{error?.message || "Unknown error"}</p>
      </div>
    </div>
  );
}
