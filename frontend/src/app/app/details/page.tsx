"use client";

/* My details: what Jagora may use to fill forms. Everything stays on the device; each field is editable in place. */
import { CaretLeft, Check, PencilSimple, Trash } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarPicker } from "@/components/Avatar";
import { LanguagePicker } from "@/components/app/Shared";
import { NG_STATES, isEmail, isPhone, phoneProblem, readablePhone, spokenPhone } from "@/lib/fields";
import { useHydrated } from "@/lib/hooks";
import type { Lang } from "@/lib/i18n";
import { EMPTY_PROFILE, useApp, type Profile } from "@/lib/store";

const LABEL: Record<keyof Profile, Record<Lang, string>> = {
  full_name: { en: "Full name", pcm: "Full name", yo: "Orúkọ", ha: "Cikakken suna", ig: "Aha zuru ezu" },
  phone: { en: "Phone", pcm: "Phone", yo: "Fóònù", ha: "Waya", ig: "Ekwentị" },
  email: { en: "Email", pcm: "Email", yo: "Í-meèlì", ha: "Imel", ig: "Email" },
  date_of_birth: { en: "Date of birth", pcm: "Birthday", yo: "Ọjọ́ ìbí", ha: "Ranar haihuwa", ig: "Ụbọchị ọmụmụ" },
  gender: { en: "Gender", pcm: "Gender", yo: "Akọ tàbí abo", ha: "Jinsi", ig: "Okike" },
  state: { en: "State", pcm: "State", yo: "Ìpínlẹ̀", ha: "Jiha", ig: "Steeti" },
};
const TITLE: Record<Lang, [string, string]> = {
  en: ["My details", "Jagora uses these to fill forms, only after you say yes. They never leave this phone unless a form needs them."],
  pcm: ["My details", "Jagora dey use dem fill form, only when you talk yes. Dem no dey comot this phone unless form need am."],
  yo: ["Àlàyé mi", "Jagora máa ń lò wọ́n láti kún fọ́ọ̀mù, lẹ́yìn tí ẹ bá sọ pé bẹ́ẹ̀ ni nìkan. Wọn kò ní kúrò lórí fóònù yìí àfi tí fọ́ọ̀mù bá nílò wọn."],
  ha: ["Bayanaina", "Jagora tana amfani da su don cike fom, sai bayan ka ce eh. Ba sa barin wannan wayar sai fom ya bukace su."],
  ig: ["Nkọwa m", "Jagora na-eji ha ejuputa fọm, naanị mgbe ị kwere. Ha anaghị ahapụ ekwentị a ma ọ bụghị na fọm chọrọ ha."],
};
const CHANGE: Record<Lang, string> = { en: "Change avatar", pcm: "Change avatar", yo: "Yí àwòrán padà", ha: "Canza hoto", ig: "Gbanwee onyinyo" };
const NOTSET: Record<Lang, string> = { en: "Not added", pcm: "Never add", yo: "Kò sí", ha: "Ba a saka ba", ig: "Etinyeghị" };
const SAVE: Record<Lang, string> = { en: "Save", pcm: "Save", yo: "Fi pamọ́", ha: "Ajiye", ig: "Chekwaa" };

export default function Details() {
  const ready = useHydrated();
  const router = useRouter();
  const lang = useApp((s) => s.lang);
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);
  const setOnboarded = useApp((s) => s.setOnboarded);
  const [editing, setEditing] = useState<keyof Profile | null>(null);
  const [picking, setPicking] = useState(false);

  if (!ready) return <div className="h-dvh bg-mist" />;

  const show = (k: keyof Profile) => {
    const v = profile[k];
    if (!v) return "";
    if (k === "phone") return readablePhone(v);
    if (k === "gender") return v === "female" ? "Female" : "Male";
    if (k === "date_of_birth") return new Date(v + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return v;
  };

  return (
    <div className="sky min-h-dvh" style={{ backgroundImage: "url(/sky/app.webp)" }}>
      <div className="mx-auto max-w-[620px] px-4 pb-16 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <Link href="/app" className="btn btn-glass h-10 w-10" aria-label="Back">
            <CaretLeft size={18} weight="bold" />
          </Link>
          <div className="ml-auto">
            <LanguagePicker compact />
          </div>
        </div>

        <div className="mt-8 flex items-start gap-4 px-1">
          <button onClick={() => setPicking(true)} className="group relative shrink-0 rounded-full transition active:scale-95" aria-label={CHANGE[lang]}>
            <span className="grid h-[76px] w-[76px] place-items-center rounded-full bg-white/80 shadow-[0_10px_24px_-14px_rgba(10,30,80,.55)] dark:bg-white/10">
              <Avatar size={62} />
            </span>
            <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-ink text-paper shadow">
              <PencilSimple size={13} weight="bold" />
            </span>
          </button>
          <div>
            <h1 className="text-[32px] font-semibold leading-tight text-ink">{TITLE[lang][0]}</h1>
            <p className="mt-1.5 text-[15.5px] leading-snug text-ink-2">{TITLE[lang][1]}</p>
          </div>
        </div>

        <div className="glass-2 mt-7 overflow-hidden rounded-[28px] p-1.5">
          {(Object.keys(LABEL) as (keyof Profile)[]).map((k) => (
            <div key={k} className="rounded-[22px] transition-colors [&:not(:last-child)]:mb-0.5">
              <AnimatePresence initial={false} mode="wait">
                {editing === k ? (
                  <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-[22px] bg-white p-4">
                    <Editor
                      k={k}
                      lang={lang}
                      value={profile[k]}
                      onSave={(v) => (setProfile({ [k]: v } as Partial<Profile>), setEditing(null))}
                      onCancel={() => setEditing(null)}
                    />
                  </motion.div>
                ) : (
                  <motion.button
                    key="view"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setEditing(k)}
                    className="flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left hover:bg-white/70"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] text-ink-3">{LABEL[k][lang]}</span>
                      <span className={`mt-0.5 block truncate text-[17.5px] font-medium ${profile[k] ? "text-ink" : "text-ink-3"}`}>{show(k) || NOTSET[lang]}</span>
                    </span>
                    <PencilSimple size={18} className="shrink-0 text-ink-3" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        <button
          onClick={() => {
            if (!confirm("Remove all your details from this phone?")) return;
            setProfile(EMPTY_PROFILE);
            setOnboarded(false);
            router.push("/start");
          }}
          className="btn mt-6 h-12 w-full text-[15px] text-danger hover:bg-danger-soft"
        >
          <Trash size={17} /> Remove my details from this phone
        </button>
      </div>
      <AvatarPicker open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}

function Editor({ k, lang, value, onSave, onCancel }: { k: keyof Profile; lang: Lang; value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(k === "phone" && value ? readablePhone(value) : value);
  let error = "";
  let out = v.trim();
  if (k === "phone" && out) {
    out = spokenPhone(out);
    if (!isPhone(out)) error = phoneProblem(out);
  }
  if (k === "email" && out && !isEmail(out)) error = "That email does not look complete.";
  if (k === "full_name" && out.length < 2) error = " ";

  const input = "h-14 w-full rounded-[18px] bg-mist px-4 text-[18px] font-medium text-ink outline-none focus:ring-2 focus:ring-accent/40";
  return (
    <form onSubmit={(e) => (e.preventDefault(), !error && onSave(k === "email" ? out.toLowerCase() : out))}>
      <label className="mb-2 block text-[13.5px] text-ink-3">{LABEL[k][lang]}</label>
      {k === "gender" ? (
        <div className="grid grid-cols-2 gap-2">
          {(["female", "male"] as const).map((g) => (
            <button type="button" key={g} onClick={() => onSave(g)} className={`h-14 rounded-[18px] text-[17px] font-medium ${value === g ? "bg-ink text-paper" : "bg-mist text-ink"}`}>
              {g === "female" ? "Female" : "Male"}
            </button>
          ))}
        </div>
      ) : k === "state" ? (
        <select autoFocus value={v} onChange={(e) => setV(e.target.value)} className={input}>
          <option value="">Choose a state</option>
          {NG_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      ) : (
        <input
          autoFocus
          className={input}
          value={v}
          onChange={(e) => setV(e.target.value)}
          type={k === "date_of_birth" ? "date" : k === "email" ? "email" : "text"}
          inputMode={k === "phone" ? "tel" : k === "email" ? "email" : undefined}
        />
      )}
      {error.trim() && <p className="mt-2 text-[14.5px] text-danger">{error}</p>}
      {k !== "gender" && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onCancel} className="btn h-12 flex-1 bg-mist text-[15.5px] text-ink-2">
            Cancel
          </button>
          <button type="submit" disabled={!!error} className="btn btn-ink h-12 flex-1 text-[15.5px] disabled:opacity-40">
            <Check size={16} weight="bold" /> {SAVE[lang]}
          </button>
        </div>
      )}
    </form>
  );
}
