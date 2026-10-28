"use client";

/* Deleting always asks first.
   - One chat: "Delete this chat?" with Delete and Cancel.
   - Everything: she types DELETE before the button works, so it never happens by mistake; every chat, its memory
     and her session log go, here and on the server. What Jagora remembers about her stays. */
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { deleteAllChats, deleteChats } from "@/lib/sync";

const T: Record<"one" | "oneWhy" | "all" | "allWhy" | "type" | "del" | "cancel", Record<Lang, string>> = {
  one: { en: "Delete this chat?", pcm: "Delete this chat?", yo: "Pa ìjíròrò yìí rẹ́?", ha: "Share wannan hira?", ig: "Hichapụ mkparịta ụka a?" },
  oneWhy: {
    en: "It goes from all your devices, with what Jagora remembers of it. This cannot be undone.",
    pcm: "E go comot from all your devices, plus wetin Jagora remember about am. You no fit bring am back.",
    yo: "Yóò kúrò lórí gbogbo ẹ̀rọ yín, pẹ̀lú ohun tí Jagora rántí nípa rẹ̀. Ẹ kò lè dá a padà.",
    ha: "Za a cire shi daga duk na'urorinka, tare da abin da Jagora ta tuna game da shi. Ba za a iya dawo da shi ba.",
    ig: "Ọ ga-apụ na ngwaọrụ gị niile, ya na ihe Jagora chetara banyere ya. A gaghị eweghachi ya.",
  },
  all: { en: "Delete all conversations?", pcm: "Delete all your chats?", yo: "Pa gbogbo ìjíròrò rẹ́?", ha: "Share dukkan hirarraki?", ig: "Hichapụ mkparịta ụka niile?" },
  allWhy: {
    en: "Every chat, its memory and your session log go from all your devices, so you start afresh. What Jagora knows about you stays. This cannot be undone.",
    pcm: "All your chats, wetin Jagora remember for each one and your log go comot from all your devices. Wetin Jagora know about you go remain. You no fit bring am back.",
    yo: "Gbogbo ìjíròrò, ohun tí a rántí nínú wọn àti àkọsílẹ̀ yín yóò kúrò lórí gbogbo ẹ̀rọ yín. Ohun tí Jagora mọ̀ nípa yín yóò wà. Ẹ kò lè dá a padà.",
    ha: "Dukkan hirarraki, abin da aka tuna a cikinsu da tarihin zamanka za su tafi daga duk na'urorinka. Abin da Jagora ta sani game da kai zai rage. Ba za a iya dawo da su ba.",
    ig: "Mkparịta ụka niile, ihe echetara na ha na ndekọ gị ga-apụ na ngwaọrụ gị niile. Ihe Jagora maara gbasara gị ga-anọgide. A gaghị eweghachi ha.",
  },
  type: { en: "Type DELETE to confirm", pcm: "Type DELETE to confirm", yo: "Kọ DELETE láti fìdí rẹ̀ múlẹ̀", ha: "Rubuta DELETE don tabbatarwa", ig: "Dee DELETE iji kwado" },
  del: { en: "Delete", pcm: "Delete", yo: "Pa á rẹ́", ha: "Share", ig: "Hichapụ" },
  cancel: { en: "Cancel", pcm: "Cancel", yo: "Fagilé", ha: "Soke", ig: "Kagbuo" },
};

export function DeleteDialogs() {
  const ask = useApp((s) => s.askDelete);
  const lang = useApp((s) => s.lang);
  const [typed, setTyped] = useState("");
  const close = () => (useApp.getState().setAskDelete(null), setTyped(""));
  const ok = !ask?.all || typed.trim() === "DELETE";
  const go = () => {
    if (!ask || !ok) return;
    const st = useApp.getState();
    if (ask.all) void deleteAllChats();
    else {
      for (const id of ask.ids) st.closeTask(id);
      deleteChats(ask.ids);
    }
    close();
  };
  return (
    <AnimatePresence>
      {ask && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] grid place-items-center bg-[rgba(8,12,20,.5)] px-5"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ scale: 0.94, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            className="w-full max-w-[400px] rounded-[24px] bg-white p-5 shadow-[0_30px_60px_-24px_rgba(10,25,60,.5)] dark:bg-[#23262d]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[19px] font-bold text-ink">{ask.all ? T.all[lang] : T.one[lang]}</p>
            <p className="mt-2 text-[14.5px] font-semibold leading-snug text-ink-2">{ask.all ? T.allWhy[lang] : T.oneWhy[lang]}</p>
            {ask.all && (
              <label className="mt-4 block">
                <span className="text-[13px] font-bold text-ink-2">{T.type[lang]}</span>
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && go()}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="DELETE"
                  className="mt-1.5 h-12 w-full rounded-[14px] bg-black/[.04] px-4 text-[16px] font-bold tracking-[0.08em] text-ink outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-[#c4361a]/60 dark:bg-white/10"
                />
              </label>
            )}
            <div className="mt-5 flex gap-2">
              <button onClick={close} className="h-12 flex-1 rounded-full bg-black/[.05] text-[15px] font-bold text-ink dark:bg-white/10">
                {T.cancel[lang]}
              </button>
              <button onClick={go} disabled={!ok} className="h-12 flex-1 rounded-full bg-[#c4361a] text-[15px] font-bold text-white transition disabled:opacity-35">
                {T.del[lang]}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
