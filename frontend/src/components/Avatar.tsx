"use client";

/* Her avatar (lib/avatar.ts) and the picker where she chooses one. */
import { Check, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { AVATARS, avatarSrc, useAvatar } from "@/lib/avatar";
import type { Lang } from "@/lib/i18n";
import { useApp } from "@/lib/store";

export function Avatar({ size = 40, className = "" }: { size?: number; className?: string }) {
  const id = useAvatar();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarSrc(id)} alt="" width={size} height={size} draggable={false} className={`select-none object-contain ${className}`} style={{ width: size, height: size }} />
  );
}

const T: Record<"title" | "auto" | "autoNote" | "women" | "men" | "all", Record<Lang, string>> = {
  title: { en: "Choose your avatar", pcm: "Pick your avatar", yo: "Yan àwòrán yín", ha: "Zaɓi hotonka", ig: "Họrọ onyinyo gị" },
  auto: { en: "Choose for me", pcm: "Pick for me", yo: "Ẹ yàn fún mi", ha: "Zaɓa mini", ig: "Họrọ maka m" },
  autoNote: { en: "Follows the gender in your details", pcm: "E go follow the gender for your details", yo: "Ó máa tẹ̀lé akọ tàbí abo nínú àlàyé yín", ha: "Zai bi jinsin da ke cikin bayananka", ig: "Ọ ga-agbaso okike dị na nkọwa gị" },
  women: { en: "Women", pcm: "Women", yo: "Obìnrin", ha: "Mata", ig: "Ụmụ nwanyị" },
  men: { en: "Men", pcm: "Men", yo: "Ọkùnrin", ha: "Maza", ig: "Ụmụ nwoke" },
  all: { en: "Everyone", pcm: "Everybody", yo: "Gbogbo èèyàn", ha: "Kowa", ig: "Onye ọ bụla" },
};

export function AvatarPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lang = useApp((s) => s.lang);
  const gender = useApp((s) => s.profile.gender);
  const chosen = useApp((s) => s.avatar);
  const setAvatar = useApp((s) => s.setAvatar);
  const current = useAvatar();
  const [tab, setTab] = useState<"female" | "male" | "neutral">(gender === "male" ? "male" : gender === "female" ? "female" : "neutral");
  const tabs = [
    ["female", T.women[lang]],
    ["male", T.men[lang]],
    ["neutral", T.all[lang]],
  ] as const;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[70] bg-[#0b1426]/30 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-label={T.title[lang]}
            className="glass-2 fixed inset-x-3 bottom-3 z-[71] mx-auto max-w-[480px] rounded-[30px] p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[22px] font-extrabold text-ink">{T.title[lang]}</h2>
              <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-black/5" aria-label="Close">
                <X size={18} weight="bold" />
              </button>
            </div>
            <div className="mt-3 flex gap-1.5 rounded-full bg-black/[.05] p-1 dark:bg-white/10">
              {tabs.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className={`h-9 flex-1 rounded-full text-[14.5px] font-bold transition ${tab === k ? "bg-ink text-paper" : "text-ink-2"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-4 gap-3">
              {AVATARS[tab].map((id) => {
                const on = id === current;
                return (
                  <button
                    key={id}
                    onClick={() => (setAvatar(id), onClose())}
                    className={`relative grid aspect-square place-items-center rounded-[22px] transition active:scale-95 ${on ? "bg-accent-soft ring-[3px] ring-accent" : "bg-white/70 hover:bg-white dark:bg-white/10"}`}
                    aria-label={`Avatar ${id}`}
                    aria-pressed={on}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatarSrc(id)} alt="" className="h-[78%] w-[78%] object-contain" draggable={false} />
                    {on && (
                      <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-accent text-snow">
                        <Check size={13} weight="bold" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => (setAvatar(""), onClose())}
              className={`mt-4 flex w-full flex-col items-center rounded-[18px] px-4 py-3 text-center transition ${chosen ? "bg-white/70 hover:bg-white dark:bg-white/10" : "bg-accent-soft ring-2 ring-accent"}`}
            >
              <span className="text-[15px] font-bold text-ink">{T.auto[lang]}</span>
              <span className="text-[13px] font-medium text-ink-2">{T.autoNote[lang]}</span>
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
