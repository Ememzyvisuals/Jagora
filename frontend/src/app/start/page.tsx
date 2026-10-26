"use client";

/* Getting started: one question per screen, big type, nothing else on the page. Every answer can be skipped
   except language and name; Jagora asks for anything missing later, at the moment it is needed. */
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Mark } from "@/components/Brand";
import { Orb } from "@/components/Orb";
import { NG_STATES, isEmail, isPhone, phoneProblem, readablePhone, spokenPhone } from "@/lib/fields";
import { useHydrated } from "@/lib/hooks";
import { LANGS, type Lang } from "@/lib/i18n";
import { useApp, type Profile } from "@/lib/store";

type Step = "lang" | "name" | "phone" | "email" | "dob" | "gender" | "state" | "done";
const STEPS: Step[] = ["lang", "name", "phone", "email", "dob", "gender", "state", "done"];

const Q: Record<Exclude<Step, "lang">, Record<Lang, [string, string]>> = {
  name: {
    en: ["What is your name?", "Your full name, the way it is on your ID."],
    pcm: ["Wetin be your name?", "Your full name, as e dey for your ID."],
    yo: ["Kí ni orúkọ yín?", "Orúkọ yín ní kíkún, bí ó ṣe wà lórí káàdì ìdánimọ̀ yín."],
    ha: ["Menene sunanka?", "Cikakken sunanka, kamar yadda yake a katin shaidarka."],
    ig: ["Kedu aha gị?", "Aha gị zuru ezu, dịka o dị na kaadị njirimara gị."],
  },
  phone: {
    en: ["Your phone number", "Jagora reads it back to you before using it anywhere."],
    pcm: ["Your phone number", "Jagora go read am back give you before e use am."],
    yo: ["Nọ́ńbà fóònù yín", "Jagora máa kà á padà fún yín kí ó tó lò ó."],
    ha: ["Lambar wayarka", "Jagora za ta karanta maka ita kafin ta yi amfani da ita."],
    ig: ["Nọmba ekwentị gị", "Jagora ga-agụghachi ya tupu o jiri ya."],
  },
  email: {
    en: ["Your email, if you have one", "You can skip this."],
    pcm: ["Your email, if you get am", "You fit skip am."],
    yo: ["Í-meèlì yín, tí ẹ bá ní", "Ẹ lè fò ó."],
    ha: ["Imel ɗinka, idan kana da shi", "Za ka iya tsallake shi."],
    ig: ["Email gị, ma ọ bụrụ na i nwere", "Ị nwere ike ịgafe ya."],
  },
  dob: {
    en: ["When were you born?", "Many forms ask for this."],
    pcm: ["When dem born you?", "Plenty form dey ask for am."],
    yo: ["Ìgbà wo ni a bí yín?", "Ọ̀pọ̀ fọ́ọ̀mù ló máa ń béèrè èyí."],
    ha: ["Yaushe aka haife ka?", "Fom da yawa suna tambaya."],
    ig: ["Kedu mgbe a mụrụ gị?", "Ọtụtụ fọm na-ajụ nke a."],
  },
  gender: {
    en: ["Are you a woman or a man?", "Forms ask this. You can skip it."],
    pcm: ["You be woman or man?", "Forms dey ask am. You fit skip."],
    yo: ["Ṣé obìnrin ni yín àbí ọkùnrin?", "Fọ́ọ̀mù máa ń béèrè. Ẹ lè fò ó."],
    ha: ["Mace ce ko namiji?", "Fom suna tambaya. Za ka iya tsallakewa."],
    ig: ["Ị bụ nwanyị ka nwoke?", "Fọm na-ajụ ya. Ị nwere ike ịgafe."],
  },
  state: {
    en: ["Which state do you live in?", "For forms that ask where you are."],
    pcm: ["Which state you dey stay?", "For forms wey dey ask where you dey."],
    yo: ["Ìpínlẹ̀ wo ni ẹ ń gbé?", "Fún fọ́ọ̀mù tó ń béèrè ibi tí ẹ wà."],
    ha: ["A wace jiha kake zaune?", "Domin fom masu tambayar inda kake."],
    ig: ["Steeti ole ka ị bi?", "Maka fọm na-ajụ ebe ị nọ."],
  },
  done: {
    en: ["You are ready", "Your details stay on this phone. Jagora only uses them when you say yes."],
    pcm: ["You don ready", "Your details dey for this phone. Jagora go only use am if you talk yes."],
    yo: ["Ẹ ti ṣetán", "Àlàyé yín wà lórí fóònù yìí nìkan. Jagora kò ní lò ó láìjẹ́ pé ẹ sọ pé bẹ́ẹ̀ ni."],
    ha: ["Ka shirya", "Bayananka suna kan wannan wayar. Jagora ba za ta yi amfani da su ba sai ka ce eh."],
    ig: ["Ị dịla njikere", "Nkọwa gị dị na ekwentị a. Jagora ga-eji ya naanị mgbe ị kwere."],
  },
};

const W: Record<string, Record<Lang, string>> = {
  next: { en: "Next", pcm: "Next", yo: "Tẹ̀síwájú", ha: "Gaba", ig: "Ọzọ" },
  skip: { en: "Skip", pcm: "Skip", yo: "Fò ó", ha: "Tsallake", ig: "Gafee" },
  start: { en: "Start using Jagora", pcm: "Start to use Jagora", yo: "Bẹ̀rẹ̀ pẹ̀lú Jagora", ha: "Fara amfani da Jagora", ig: "Malite iji Jagora" },
  woman: { en: "Woman", pcm: "Woman", yo: "Obìnrin", ha: "Mace", ig: "Nwanyị" },
  man: { en: "Man", pcm: "Man", yo: "Ọkùnrin", ha: "Namiji", ig: "Nwoke" },
  pick: { en: "Which language should Jagora speak?", pcm: "Which language Jagora go talk?", yo: "Èdè wo ni kí Jagora máa sọ?", ha: "Wane harshe Jagora za ta yi?", ig: "Asụsụ ole ka Jagora ga-asụ?" },
  pickSub: { en: "You can change it any time.", pcm: "You fit change am anytime.", yo: "Ẹ lè yí i padà nígbàkúùgbà.", ha: "Za ka iya canza shi kowane lokaci.", ig: "Ị nwere ike ịgbanwe ya oge ọ bụla." },
  day: { en: "Day", pcm: "Day", yo: "Ọjọ́", ha: "Rana", ig: "Ụbọchị" },
  month: { en: "Month", pcm: "Month", yo: "Oṣù", ha: "Wata", ig: "Ọnwa" },
  year: { en: "Year", pcm: "Year", yo: "Ọdún", ha: "Shekara", ig: "Afọ" },
  search: { en: "Search states", pcm: "Find state", yo: "Wá ìpínlẹ̀", ha: "Nemo jiha", ig: "Chọọ steeti" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Start() {
  const ready = useHydrated();
  const router = useRouter();
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);
  const setOnboarded = useApp((s) => s.setOnboarded);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const step = STEPS[i];

  const go = (d: number) => {
    setDir(d);
    setI((v) => Math.max(0, Math.min(STEPS.length - 1, v + d)));
  };
  const finish = () => {
    setOnboarded(true);
    router.push("/app");
  };

  if (!ready) return <div className="h-dvh bg-mist" />;

  return (
    <div className="sky min-h-dvh" style={{ backgroundImage: "url(/sky/hero-mobile.webp)" }}>
      <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))]">
        <div className="flex h-10 items-center gap-3">
          {i > 0 ? (
            <button onClick={() => go(-1)} className="btn btn-glass h-10 w-10" aria-label="Back">
              <ArrowLeft size={18} />
            </button>
          ) : (
            <Mark size={30} />
          )}
          <div className="flex flex-1 gap-1.5" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
            {STEPS.slice(0, -1).map((s, k) => (
              <span key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${k < i ? "bg-ink" : k === i ? "bg-ink/50" : "bg-white/60"}`} />
            ))}
          </div>
        </div>

        <div className="relative mt-8 flex flex-1 flex-col">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -28 }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              className="flex flex-1 flex-col"
            >
              {step === "lang" && (
                <Screen title={W.pick[lang]} sub={W.pickSub[lang]}>
                  <div className="flex flex-col gap-2.5">
                    {LANGS.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setLang(l.id)}
                        className={`flex h-[68px] items-center justify-between rounded-[22px] px-5 text-left transition ${l.id === lang ? "bg-ink text-paper" : "glass-2 text-ink"}`}
                      >
                        <span>
                          <span className="block text-[19px] font-semibold">{l.native}</span>
                          <span className={`block text-[14px] ${l.id === lang ? "text-paper/70" : "text-ink-3"}`}>{l.hello}</span>
                        </span>
                        {l.id === lang && <Check size={20} weight="bold" />}
                      </button>
                    ))}
                  </div>
                  <Next onClick={() => go(1)} label={W.next[lang]} />
                </Screen>
              )}

              {step === "name" && <NameStep lang={lang} value={profile.full_name} onDone={(v) => (setProfile({ full_name: v }), go(1))} />}
              {step === "phone" && <PhoneStep lang={lang} value={profile.phone} onDone={(v) => (setProfile({ phone: v }), go(1))} />}
              {step === "email" && <EmailStep lang={lang} value={profile.email} onDone={(v) => (setProfile({ email: v }), go(1))} />}
              {step === "dob" && <DobStep lang={lang} value={profile.date_of_birth} onDone={(v) => (setProfile({ date_of_birth: v }), go(1))} />}
              {step === "gender" && (
                <Screen title={Q.gender[lang][0]} sub={Q.gender[lang][1]}>
                  <div className="grid grid-cols-2 gap-3">
                    {(["female", "male"] as const).map((g) => (
                      <button
                        key={g}
                        onClick={() => (setProfile({ gender: g }), go(1))}
                        className={`h-[84px] rounded-[24px] text-[20px] font-semibold transition ${profile.gender === g ? "bg-ink text-paper" : "glass-2 text-ink"}`}
                      >
                        {g === "female" ? W.woman[lang] : W.man[lang]}
                      </button>
                    ))}
                  </div>
                  <Skip onClick={() => (setProfile({ gender: "" }), go(1))} label={W.skip[lang]} />
                </Screen>
              )}
              {step === "state" && <StateStep lang={lang} value={profile.state} onDone={(v) => (setProfile({ state: v }), go(1))} />}
              {step === "done" && <DoneStep lang={lang} profile={profile} onStart={finish} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Screen({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <>
      <h1 className="text-[34px] font-semibold leading-[1.08] text-ink sm:text-[40px]">{title}</h1>
      <p className="mt-2 text-[16.5px] leading-snug text-ink-2">{sub}</p>
      <div className="mt-8 flex flex-1 flex-col">{children}</div>
    </>
  );
}

function Next({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn btn-ink mt-auto h-14 w-full text-[17px] disabled:opacity-40">
      {label} <ArrowRight size={18} weight="bold" />
    </button>
  );
}

function Skip({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="mt-auto h-12 w-full text-[16px] font-medium text-ink-2 underline-offset-4 hover:underline">
      {label}
    </button>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const { error, ...rest } = props;
  return (
    <div>
      <input
        {...rest}
        className={`glass-3 h-[68px] w-full rounded-[22px] px-5 text-[22px] font-medium text-ink outline-none transition placeholder:font-normal placeholder:text-ink-3 focus:ring-2 ${error ? "ring-2 ring-danger/50" : "focus:ring-accent/40"}`}
      />
      {error && <p className="mt-2 px-1 text-[15px] text-danger">{error}</p>}
    </div>
  );
}

function NameStep({ lang, value, onDone }: { lang: Lang; value: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ok = v.trim().split(/\s+/).filter(Boolean).length >= 1 && v.trim().length >= 2;
  return (
    <Screen title={Q.name[lang][0]} sub={Q.name[lang][1]}>
      <form onSubmit={(e) => (e.preventDefault(), ok && onDone(v.trim().replace(/\s+/g, " ")))} className="flex flex-1 flex-col">
        <Field autoFocus value={v} onChange={(e) => setV(e.target.value)} autoComplete="name" placeholder="Adébáyọ̀ Fúnmiláyọ̀" />
        <Next onClick={() => ok && onDone(v.trim().replace(/\s+/g, " "))} label={W.next[lang]} disabled={!ok} />
      </form>
    </Screen>
  );
}

function PhoneStep({ lang, value, onDone }: { lang: Lang; value: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(value ? readablePhone(value) : "");
  const [touched, setTouched] = useState(false);
  const digits = spokenPhone(v);
  const ok = isPhone(digits);
  const err = touched && v && !ok ? phoneProblem(digits) : "";
  return (
    <Screen title={Q.phone[lang][0]} sub={Q.phone[lang][1]}>
      <form onSubmit={(e) => (e.preventDefault(), setTouched(true), ok && onDone(digits))} className="flex flex-1 flex-col">
        <Field
          autoFocus
          inputMode="tel"
          autoComplete="tel-national"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="0803 123 4567"
          error={err}
        />
        {ok && <p className="mt-3 px-1 text-[16px] text-ink-2">{readablePhone(digits)}</p>}
        <div className="mt-auto">
          <Next onClick={() => (setTouched(true), ok && onDone(digits))} label={W.next[lang]} disabled={!!v && !ok && touched} />
          <Skip onClick={() => onDone("")} label={W.skip[lang]} />
        </div>
      </form>
    </Screen>
  );
}

function EmailStep({ lang, value, onDone }: { lang: Lang; value: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [touched, setTouched] = useState(false);
  const ok = isEmail(v);
  return (
    <Screen title={Q.email[lang][0]} sub={Q.email[lang][1]}>
      <form onSubmit={(e) => (e.preventDefault(), setTouched(true), ok && onDone(v.trim().toLowerCase()))} className="flex flex-1 flex-col">
        <Field
          autoFocus
          type="email"
          inputMode="email"
          autoComplete="email"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="name@gmail.com"
          error={touched && v && !ok ? "That email does not look complete." : ""}
        />
        <div className="mt-auto">
          <Next onClick={() => (setTouched(true), ok && onDone(v.trim().toLowerCase()))} label={W.next[lang]} disabled={!ok} />
          <Skip onClick={() => onDone("")} label={W.skip[lang]} />
        </div>
      </form>
    </Screen>
  );
}

function DobStep({ lang, value, onDone }: { lang: Lang; value: string; onDone: (v: string) => void }) {
  const [y0, m0, d0] = value ? value.split("-") : ["", "", ""];
  const [d, setD] = useState(d0 ? String(+d0) : "");
  const [m, setM] = useState(m0 ? +m0 : 0);
  const [y, setY] = useState(y0);
  const year = new Date().getFullYear();
  const days = m ? new Date(+y || 2000, m, 0).getDate() : 31;
  const ok = +d >= 1 && +d <= days && m >= 1 && +y >= year - 110 && +y <= year - 10;
  const iso = ok ? `${y}-${String(m).padStart(2, "0")}-${String(+d).padStart(2, "0")}` : "";
  return (
    <Screen title={Q.dob[lang][0]} sub={Q.dob[lang][1]}>
      <div className="grid grid-cols-[1fr_1.4fr] gap-3">
        <label className="block">
          <span className="mb-1.5 block px-1 text-[14px] font-medium text-ink-2">{W.day[lang]}</span>
          <input
            inputMode="numeric"
            value={d}
            maxLength={2}
            onChange={(e) => setD(e.target.value.replace(/\D/g, ""))}
            placeholder="14"
            className="glass-3 h-[64px] w-full rounded-[20px] px-5 text-[22px] font-medium outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block px-1 text-[14px] font-medium text-ink-2">{W.year[lang]}</span>
          <input
            inputMode="numeric"
            value={y}
            maxLength={4}
            onChange={(e) => setY(e.target.value.replace(/\D/g, ""))}
            placeholder="1986"
            className="glass-3 h-[64px] w-full rounded-[20px] px-5 text-[22px] font-medium outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
      </div>
      <span className="mb-1.5 mt-4 block px-1 text-[14px] font-medium text-ink-2">{W.month[lang]}</span>
      <div className="grid grid-cols-4 gap-2">
        {MONTHS.map((name, k) => (
          <button
            key={name}
            onClick={() => setM(k + 1)}
            className={`h-12 rounded-[16px] text-[16px] font-medium transition ${m === k + 1 ? "bg-ink text-paper" : "glass-2 text-ink"}`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="mt-auto pt-6">
        <Next onClick={() => ok && onDone(iso)} label={W.next[lang]} disabled={!ok} />
        <Skip onClick={() => onDone("")} label={W.skip[lang]} />
      </div>
    </Screen>
  );
}

function StateStep({ lang, value, onDone }: { lang: Lang; value: string; onDone: (v: string) => void }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => NG_STATES.filter((s) => s.toLowerCase().includes(q.trim().toLowerCase())), [q]);
  return (
    <Screen title={Q.state[lang][0]} sub={Q.state[lang][1]}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={W.search[lang]}
        className="glass-3 h-14 w-full rounded-[20px] px-5 text-[17px] outline-none focus:ring-2 focus:ring-accent/40"
      />
      <div className="no-scrollbar mt-3 grid max-h-[46dvh] grid-cols-2 gap-2 overflow-y-auto pb-2">
        {list.map((s) => (
          <button
            key={s}
            onClick={() => onDone(s)}
            className={`h-12 truncate rounded-[16px] px-3 text-[16px] font-medium transition ${value === s ? "bg-ink text-paper" : "glass-2 text-ink hover:bg-white"}`}
          >
            {s}
          </button>
        ))}
      </div>
      <Skip onClick={() => onDone("")} label={W.skip[lang]} />
    </Screen>
  );
}

function DoneStep({ lang, profile, onStart }: { lang: Lang; profile: Profile; onStart: () => void }) {
  const [state, setState] = useState<"idle" | "speaking">("speaking");
  useEffect(() => {
    const id = setTimeout(() => setState("idle"), 2200);
    return () => clearTimeout(id);
  }, []);
  const rows: [string, string][] = [
    ["Name", profile.full_name],
    ["Phone", profile.phone ? readablePhone(profile.phone) : ""],
    ["Email", profile.email],
    ["Born", profile.date_of_birth],
    ["State", profile.state],
  ].filter(([, v]) => v) as [string, string][];
  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <div className="mt-4">
        <Orb size={168} state={state} />
      </div>
      <h1 className="mt-6 text-[34px] font-semibold leading-tight text-ink">
        {Q.done[lang][0]}
        {profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-2 max-w-[24rem] text-[16.5px] leading-snug text-ink-2">{Q.done[lang][1]}</p>
      {rows.length > 0 && (
        <dl className="glass-2 mt-6 w-full rounded-[24px] p-2 text-left">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 rounded-[16px] px-4 py-3 odd:bg-white/50">
              <dt className="text-[14.5px] text-ink-3">{k}</dt>
              <dd className="truncate text-[16px] font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <button onClick={onStart} className="btn btn-ink mt-auto h-14 w-full text-[17px]">
        {W.start[lang]} <ArrowRight size={18} weight="bold" />
      </button>
    </div>
  );
}
