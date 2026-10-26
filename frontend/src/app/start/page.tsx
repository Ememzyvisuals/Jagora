"use client";

/* Getting in, on one page: Jagora on the sky, her five languages to tap, and a glass card with email and password.
   No email check and no puzzle (the bot check runs on its own in the background). An access code gives a bigger
   allowance. Personal details are not asked here: Jagora asks for what a task needs, when it needs it. */
import { Eye, EyeSlash, Key, Sparkle } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Mark } from "@/components/Brand";
import { SiteFooter } from "@/components/SiteFooter";
import { CloudWordmark } from "@/components/glass/CloudWordmark";
import { Backdrop } from "@/components/glass/Backdrop";
import { Glass } from "@/components/glass/Glass";
import { Orb } from "@/components/Orb";
import { TAGLINE } from "@/components/app/MobileHome";
import { isEmail } from "@/lib/fields";
import { useHydrated } from "@/lib/hooks";
import { LANGS, type Lang } from "@/lib/i18n";
import { useApp } from "@/lib/store";

type L = Record<Lang, string>;
const T: Record<string, L> = {
  create: { en: "Create account", pcm: "Open account", yo: "Ṣí àkáǹtì", ha: "Buɗe asusu", ig: "Mepee akaụntụ" },
  signin: { en: "Sign in", pcm: "Sign in", yo: "Wọlé", ha: "Shiga", ig: "Banye" },
  email: { en: "Email", pcm: "Email", yo: "Ímeèlì", ha: "Imel", ig: "Email" },
  password: { en: "Password", pcm: "Password", yo: "Ọ̀rọ̀ aṣínà", ha: "Kalmar sirri", ig: "Okwuntughe" },
  pwHint: { en: "At least 8 characters", pcm: "At least 8 letters", yo: "Ó kéré tán lẹ́tà 8", ha: "Aƙalla haruffa 8", ig: "Opekata mpe mkpụrụedemede 8" },
  code: { en: "Access code", pcm: "Access code", yo: "Kóòdù ìwọlé", ha: "Lambar shiga", ig: "Koodu nnweta" },
  haveCode: { en: "I have an access code", pcm: "I get access code", yo: "Mo ní kóòdù ìwọlé", ha: "Ina da lambar shiga", ig: "Enwere m koodu nnweta" },
  go: { en: "Start with Jagora", pcm: "Start with Jagora", yo: "Bẹ̀rẹ̀ pẹ̀lú Jagora", ha: "Fara da Jagora", ig: "Bido na Jagora" },
  goIn: { en: "Sign in", pcm: "Sign in", yo: "Wọlé", ha: "Shiga", ig: "Banye" },
  free: {
    en: "Free credits every day. No email check.",
    pcm: "Free credit every day. No email check.",
    yo: "Kirẹ́dìtì ọ̀fẹ́ lójoojúmọ́. A kò ní yẹ ímeèlì wò.",
    ha: "Kiredit kyauta kowace rana. Babu duba imel.",
    ig: "Kredit n'efu kwa ụbọchị. Anyị agaghị elele email.",
  },
  badEmail: { en: "Check the email address.", pcm: "Check the email well.", yo: "Ẹ yẹ ímeèlì náà wò.", ha: "Duba adireshin imel ɗin.", ig: "Lelee adreesị email ahụ." },
  badPw: { en: "Use at least 8 characters.", pcm: "Use at least 8 letters.", yo: "Lo ó kéré tán lẹ́tà 8.", ha: "Yi amfani da aƙalla haruffa 8.", ig: "Jiri opekata mpe mkpụrụedemede 8." },
  agree: { en: "By continuing you agree to our", pcm: "If you continue, you agree to our", yo: "Bí ẹ bá tẹ̀síwájú, ẹ gbà sí", ha: "Idan ka ci gaba, ka yarda da", ig: "Ọ bụrụ na ị gaa n'ihu, ị kwenyere na" },
  terms: { en: "Terms", pcm: "Terms", yo: "Àwọn òfin", ha: "Sharuɗɗa", ig: "Usoro" },
  privacy: { en: "Privacy", pcm: "Privacy", yo: "Ìpamọ́", ha: "Sirri", ig: "Nzuzo" },
  about: { en: "What is Jagora?", pcm: "Wetin be Jagora?", yo: "Kí ni Jagora?", ha: "Mene ne Jagora?", ig: "Gịnị bụ Jagora?" },
  pick: { en: "Jagora speaks", pcm: "Jagora dey talk", yo: "Jagora ń sọ", ha: "Jagora tana magana da", ig: "Jagora na-asụ" },
};

// where each language tag floats: x offset from the centre (px), height, tilt
const TAGS: { id: Lang; x: number; y: number; r: number; glow: string }[] = [
  { id: "yo", x: -128, y: 18, r: -8, glow: "rgba(29,99,237,.5)" },
  { id: "ha", x: -46, y: -2, r: 5, glow: "rgba(37,211,102,.45)" },
  { id: "ig", x: 32, y: 14, r: -4, glow: "rgba(255,184,0,.45)" },
  { id: "pcm", x: 104, y: -4, r: 7, glow: "rgba(236,72,153,.4)" },
  { id: "en", x: 0, y: 48, r: -3, glow: "rgba(139,92,246,.45)" },
];

export default function Start() {
  const ready = useHydrated();
  const router = useRouter();
  const still = useReducedMotion();
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const setProfile = useApp((s) => s.setProfile);
  const setOnboarded = useApp((s) => s.setOnboarded);
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [see, setSee] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isEmail(email.trim())) return setErr(T.badEmail[lang]);
    if (pw.length < 8) return setErr(T.badPw[lang]);
    setErr(null);
    setBusy(true);
    const api = process.env.NEXT_PUBLIC_BACKEND_HTTP;
    if (api) {
      try {
        const r = await fetch(`${api}/auth/${mode === "create" ? "signup" : "signin"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: email.trim(), password: pw, code: code.trim() || undefined, lang }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setBusy(false);
          return setErr(d.message?.[lang] ?? d.message?.en ?? d.detail ?? "Something went wrong. Try again.");
        }
      } catch {
        setBusy(false);
        return setErr("Can't reach Jagora right now. Check your network.");
      }
    }
    setProfile({ email: email.trim() });
    setOnboarded(true);
    router.push("/app");
  };

  if (!ready) return <div className="sky-bg h-dvh" />;
  const bob = (i: number) => (still ? {} : { animate: { y: [0, -4, 0] }, transition: { duration: 5 + i * 0.6, repeat: Infinity, ease: "easeInOut" as const, delay: i * 0.3 } });

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <Backdrop />
      <div className="relative mx-auto grid min-h-dvh max-w-[1360px] items-center gap-6 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] md:grid-cols-[1.15fr_1fr] md:gap-16 md:px-14">
        {/* Jagora and her languages */}
        <section className="flex flex-col items-center">
          <div className="flex origin-center flex-col items-center md:scale-[1.3] lg:scale-[1.65]">
            <Orb size={120} state="idle" />
            <CloudWordmark width={280} className="-mt-6" />
            <p className="-mt-2 text-center text-[15.5px] font-medium text-ink-2 dark:text-ink dark:[text-shadow:0_1px_10px_rgba(0,0,0,.55)]">{TAGLINE[lang]}</p>
          </div>
          <p className="mt-5 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-ink-2 md:mt-14 md:text-[14px] lg:mt-24 dark:text-ink">{T.pick[lang]}</p>
          <div className="relative mt-3 h-[86px] w-full max-w-[340px] lg:mt-6 lg:scale-[1.3]">
            {TAGS.map((t, i) => {
              const on = t.id === lang;
              return (
                <motion.button
                  key={t.id}
                  {...bob(i)}
                  onClick={() => setLang(t.id)}
                  aria-pressed={on}
                  className="absolute left-1/2"
                  style={{ marginLeft: t.x, top: t.y, translate: "-50% 0", rotate: `${t.r}deg` }}
                >
                  <span
                    className={`block rounded-full px-4 py-2 text-[14px] font-semibold transition ${on ? "bg-ink text-paper" : "bg-white/70 text-ink backdrop-blur-md dark:bg-white/15"}`}
                    style={{ boxShadow: `inset 0 1px 1px rgba(255,255,255,.9), 0 8px 22px -6px ${t.glow}, 0 0 0 1px rgba(255,255,255,.55)` }}
                  >
                    {LANGS.find((l) => l.id === t.id)!.native}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* the card */}
        <section className="w-full md:max-w-[520px] md:justify-self-end">
          <Glass radius={32} bezel={18} tint="rgba(255,255,255,.72)" className="p-5 shadow-[0_30px_70px_-34px_rgba(10,30,70,.55)] md:p-10">
            <div className="hidden items-center gap-2.5 md:flex">
              <Mark size={44} />
              <span className="font-display font-bold tracking-[-0.035em] text-[36px] leading-none text-ink">Jagora</span>
            </div>

            {/* create / sign in */}
            <div className="relative flex rounded-full bg-black/5 p-1 md:mt-5 dark:bg-white/10" role="tablist">
              {(["create", "signin"] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => (setMode(m), setErr(null))} className="relative z-10 h-10 flex-1 text-[14.5px] font-semibold md:h-12 md:text-[16px]">
                  {mode === m && <motion.span layoutId="authTab" className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_2px_8px_-2px_rgba(10,30,70,.25)] dark:bg-white/20" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <span className={mode === m ? "text-ink" : "text-ink-2"}>{T[m][lang]}</span>
                </button>
              ))}
            </div>

            <form onSubmit={(e) => (e.preventDefault(), void submit())} className="mt-5 flex flex-col gap-3 md:mt-7 md:gap-4" noValidate>
              <label className="block">
                <span className="mb-1.5 block px-1 text-[13.5px] font-medium text-ink-2 md:text-[15px]">{T.email[lang]}</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-[52px] w-full rounded-[18px] bg-white px-4 text-[16.5px] md:h-[60px] md:text-[17.5px] text-ink shadow-[inset_0_0_0_1px_rgba(10,30,70,.08)] outline-none transition focus:shadow-[inset_0_0_0_2px_var(--color-accent)]"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block px-1 text-[13.5px] font-medium text-ink-2 md:text-[15px]">{T.password[lang]}</span>
                <span className="flex h-[52px] items-center rounded-[18px] bg-white pr-1.5 md:h-[60px] shadow-[inset_0_0_0_1px_rgba(10,30,70,.08)] transition focus-within:shadow-[inset_0_0_0_2px_var(--color-accent)]">
                  <input
                    type={see ? "text" : "password"}
                    autoComplete={mode === "create" ? "new-password" : "current-password"}
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    className="h-full min-w-0 flex-1 bg-transparent px-4 text-[16.5px] md:text-[17.5px] text-ink outline-none focus-visible:outline-none"
                    placeholder={mode === "create" ? T.pwHint[lang] : ""}
                  />
                  <button type="button" onClick={() => setSee((v) => !v)} className="grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-black/5" aria-label={see ? "Hide password" : "Show password"}>
                    {see ? <EyeSlash size={19} /> : <Eye size={19} />}
                  </button>
                </span>
              </label>

              <AnimatePresence initial={false}>
                {codeOpen ? (
                  <motion.label key="code" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="block overflow-hidden">
                    <span className="mb-1.5 block px-1 text-[13.5px] font-medium text-ink-2 md:text-[15px]">{T.code[lang]}</span>
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      className="h-[52px] w-full rounded-[18px] bg-white px-4 font-mono text-[16px] tracking-[0.12em] text-ink shadow-[inset_0_0_0_1px_rgba(10,30,70,.08)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-accent)]"
                      placeholder="JAGORA-XXXX"
                    />
                  </motion.label>
                ) : (
                  <motion.button key="codeLink" type="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCodeOpen(true)} className="flex items-center gap-1.5 self-start px-1 text-[13.5px] font-semibold text-accent md:text-[15px]">
                    <Key size={15} weight="bold" /> {T.haveCode[lang]}
                  </motion.button>
                )}
              </AnimatePresence>

              {err && (
                <p role="alert" className="px-1 text-[13.5px] font-medium text-danger">
                  {err}
                </p>
              )}

              <button type="submit" disabled={busy} className="btn btn-ink mt-1 h-[56px] w-full text-[16.5px] md:mt-3 md:h-[64px] md:text-[18px] font-semibold disabled:opacity-60">
                {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-paper/30 border-t-paper" /> : mode === "create" ? T.go[lang] : T.goIn[lang]}
              </button>

              {mode === "create" && (
                <p className="flex items-center justify-center gap-1.5 text-center text-[13px] text-ink-2 md:text-[14.5px]">
                  <Sparkle size={14} weight="fill" className="text-accent" /> {T.free[lang]}
                </p>
              )}
            </form>
          </Glass>
          <p className="mt-4 px-4 text-center text-[12.5px] leading-relaxed text-ink-2 md:text-[13.5px] dark:text-ink/80">
            {T.agree[lang]}{" "}
            <Link href="/terms" className="font-semibold text-ink underline underline-offset-2">{T.terms[lang]}</Link>
            <span className="mx-1.5 text-ink-3">|</span>
            <Link href="/privacy" className="font-semibold text-ink underline underline-offset-2">{T.privacy[lang]}</Link>
            <span className="mx-1.5 text-ink-3">|</span>
            <Link href="/about" className="font-semibold text-ink underline underline-offset-2">{T.about[lang]}</Link>
          </p>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
