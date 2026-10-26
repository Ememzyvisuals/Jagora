"use client";

/* Full screen the way each phone allows it. iPhone Safari cannot make a page full screen, so on iPhone we show how to
   add Jagora to the Home Screen (it then opens with no Safari bars). On Android and desktop Chrome we offer the
   browser's own Install button. Shown once, after the first-time tips. */
import { Export, PlusSquare, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Glass } from "./glass/Glass";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const T: Record<"title" | "ios1" | "ios2" | "and" | "install" | "later", Record<Lang, string>> = {
  title: { en: "Use Jagora full screen", pcm: "Use Jagora full screen", yo: "Lo Jagora ní ojú ìbòjú kíkún", ha: "Yi amfani da Jagora a cikakken allo", ig: "Jiri Jagora na ihuenyo zuru oke" },
  ios1: { en: "Tap Share", pcm: "Tap Share", yo: "Tẹ Share", ha: "Taɓa Share", ig: "Pịa Share" },
  ios2: { en: "Tap Add to Home Screen", pcm: "Tap Add to Home Screen", yo: "Tẹ Add to Home Screen", ha: "Taɓa Add to Home Screen", ig: "Pịa Add to Home Screen" },
  and: { en: "Install Jagora on this phone. It opens like an app, with no browser bars.", pcm: "Install Jagora for this phone. E go open like app, no browser bar.", yo: "Fi Jagora sórí fóònù yìí. Á ṣí bí áàpù, láìsí àwọn bákà ẹ̀rọ aṣàwákiri.", ha: "Saka Jagora a wannan wayar. Za ta buɗe kamar manhaja.", ig: "Tinye Jagora na ekwentị a. Ọ ga-emepe dịka ngwa." },
  install: { en: "Install", pcm: "Install", yo: "Fi sórí fóònù", ha: "Saka", ig: "Tinye" },
  later: { en: "Later", pcm: "Later", yo: "Ẹ̀yìn náà", ha: "Daga baya", ig: "Emechaa" },
};
const KEY = "jagora:install-seen";

export function InstallPrompt() {
  const lang = useApp((s) => s.lang);
  const [kind, setKind] = useState<"ios" | "android" | null>(null);
  const [bip, setBip] = useState<BIP | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    addEventListener("jagora:toured", on);
    return () => removeEventListener("jagora:toured", on);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) || !localStorage.getItem("jagora:toured")) return;
    } catch {
      return;
    }
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone) return;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (ios) {
      const id = setTimeout(() => setKind("ios"), 2500);
      return () => clearTimeout(id);
    }
    const on = (e: Event) => {
      e.preventDefault();
      setBip(e as BIP);
      setKind("android");
    };
    addEventListener("beforeinstallprompt", on);
    return () => removeEventListener("beforeinstallprompt", on);
  }, [tick]);

  const close = () => {
    setKind(null);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  };
  const install = async () => {
    if (!bip) return close();
    await bip.prompt();
    await bip.userChoice.catch(() => undefined);
    close();
  };

  return (
    <AnimatePresence>
      {kind && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="fixed inset-x-3 bottom-[calc(max(10px,env(safe-area-inset-bottom))+66px)] z-[70]"
          role="dialog"
          aria-label={T.title[lang]}
        >
          <Glass flat radius={28} bezel={16} refraction={30} blur={14} tint="rgba(255,255,255,.82)" className="p-5 shadow-[0_24px_60px_-24px_rgba(10,25,60,.5)]">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[18px] font-semibold leading-tight text-ink">{T.title[lang]}</p>
              <button onClick={close} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/5 text-ink-2" aria-label="Close">
                <X size={14} weight="bold" />
              </button>
            </div>
            {kind === "ios" ? (
              <ol className="mt-3 space-y-2.5">
                <li className="flex items-center gap-3 text-[15.5px] text-ink">
                  <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-accent shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]">
                    <Export size={20} />
                  </span>
                  {T.ios1[lang]}
                </li>
                <li className="flex items-center gap-3 text-[15.5px] text-ink">
                  <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-ink shadow-[inset_0_0_0_1px_rgba(0,0,0,.06)]">
                    <PlusSquare size={20} />
                  </span>
                  {T.ios2[lang]}
                </li>
              </ol>
            ) : (
              <>
                <p className="mt-2 text-[15px] leading-snug text-ink-2">{T.and[lang]}</p>
                <div className="mt-4 flex gap-2">
                  <button onClick={install} className="btn btn-ink h-11 flex-1 text-[15.5px]">
                    {T.install[lang]}
                  </button>
                  <button onClick={close} className="btn btn-glass h-11 px-5 text-[15px]">
                    {T.later[lang]}
                  </button>
                </div>
              </>
            )}
          </Glass>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
