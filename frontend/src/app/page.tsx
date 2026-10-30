"use client";

/* The front door: the sky and the orb, the real Earth with the people Jagora is for, what it does (real screens on real
   devices), how it keeps people safe, and the footer. Clean sky-blue pages; the clouds only behind the opening. */
import {
  CalendarCheck,
  Camera,
  CursorClick,
  FileText,
  Globe,
  ImagesSquare,
  LockKey,
  MagnifyingGlass,
  PaperPlaneRight,
  SealCheck,
  Translate,
  Waveform,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Backdrop } from "@/components/glass/Backdrop";
import { CloudWordmark } from "@/components/glass/CloudWordmark";
import { DeviceRender } from "@/components/landing/DeviceRender";
import { CardStack } from "@/components/CardStack";
import { Orb } from "@/components/Orb";
import { PeopleGlobe } from "@/components/landing/PeopleGlobe";
import { Security } from "@/components/landing/Security";
import { SiteFooter } from "@/components/SiteFooter";
import { useApp } from "@/lib/store";

const ASKS = [
  { lang: "Yorùbá", text: "Bá mi wá àwọn ẹ̀kọ́ JAMB tí UNILAG ń béèrè" },
  { lang: "Naijá", text: "Abeg check if this bank message na scam" },
  { lang: "Hausa", text: "Taimaka min in duba sakamakon jarrabawa" },
  { lang: "Igbo", text: "Nyere m aka jupụta fọm a" },
  { lang: "English", text: "Buy my Ikeja Electric token tonight" },
];

const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } as const;

const POWERS: { icon: ReactNode; title: string; body: string }[] = [
  { icon: <Waveform size={26} />, title: "Say it, it does it", body: "Talk or type in your language. Jagora opens the site, finds the right buttons and fills the forms, like a person would." },
  { icon: <SealCheck size={26} />, title: "Proof from official sites", body: "It checks the site is the real one, finds the exact line on the page or in the PDF, and highlights it for you." },
  { icon: <Translate size={26} />, title: "Websites in your language", body: "English websites appear in Yorùbá, Hausa or Igbo, and Jagora can read them out to you." },
  { icon: <LockKey size={26} />, title: "Logins that stay yours", body: "Passwords and codes go in a private box. Saved logins are locked to their own site and never seen by the AI." },
  { icon: <CalendarCheck size={26} />, title: "Works while you sleep", body: "Portal too busy? Jagora tries again at midnight, signs in, downloads your printout and leaves it in the chat." },
  { icon: <FileText size={26} />, title: "Writes it up for you", body: "Research turns into a clean document with sources, ready as PDF, Word or Markdown." },
  { icon: <Camera size={26} />, title: "Snap a letter, it reads it", body: "Photograph a bill, letter or result slip. Muse Wonder reads the amounts, dates and scam signs, then Jagora acts on it." },
  { icon: <ImagesSquare size={26} />, title: "Shows you in pictures", body: "Reading is hard? Muse Image draws the steps as simple pictures with the same woman in each, and Jagora reads the captions." },
];

const LANGS: [string, string, string][] = [
  ["Yorùbá", "Ẹ n lẹ́, kí ni kí n bá yín ṣe?", "yo"],
  ["Hausa", "Sannu, me kake so in yi maka?", "ha"],
  ["Igbo", "Ndeewo, gịnị ka m ga-emere gị?", "ig"],
  ["Naijá", "How you dey, wetin I fit do for you?", "pcm"],
  ["English", "Good day, what can I do for you?", "en"],
];

export default function Landing() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [k, setK] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setK((v) => (v + 1) % ASKS.length), 3200);
    return () => clearInterval(id);
  }, []);

  const go = (q?: string) => {
    const ask = (q ?? text).trim();
    try {
      if (ask) sessionStorage.setItem("jagora:ask", ask);
    } catch {}
    router.push(useApp.getState().onboarded ? "/app" : "/start");
  };

  return (
    <div className="relative min-h-dvh overflow-x-clip text-ink">
      <Backdrop />

      {/* hero */}
      <section className="relative">
        {/* the top bar: the portfolio's liquid glass, fixed at the top, the page scrolling under it */}
        <header className="fixed inset-x-0 top-0 z-50 px-3 pt-[max(10px,env(safe-area-inset-top))] sm:px-4 sm:pt-[max(14px,env(safe-area-inset-top))]">
          <nav className="liquid-glass mx-auto flex w-full max-w-[1180px] items-center gap-3 rounded-[20px] py-2 pl-3 pr-2 2xl:max-w-[1400px]">
            <Link href="/" className="flex items-center gap-2.5 rounded-[14px] px-1.5 py-1">
              <Orb size={34} />
              <span className="font-display text-[23px] font-bold tracking-[-0.03em] text-ink">Jagora</span>
            </Link>
            <div className="mx-2 hidden h-5 w-px bg-ink/15 md:block" />
            <div className="hidden items-center gap-1 text-[15px] font-bold text-ink md:flex">
              <a href="#powers" className="rounded-[12px] px-3.5 py-2 transition hover:bg-white/50 dark:hover:bg-white/10">What it does</a>
              <a href="#languages" className="rounded-[12px] px-3.5 py-2 transition hover:bg-white/50 dark:hover:bg-white/10">Languages</a>
              <a href="#safe" className="rounded-[12px] px-3.5 py-2 transition hover:bg-white/50 dark:hover:bg-white/10">Security</a>
            </div>
            <Link href="/app" data-amina-point className="ml-auto rounded-[14px] bg-ink px-5 py-2.5 text-[15px] font-bold text-paper transition hover:opacity-90">
              Open Jagora
            </Link>
          </nav>
        </header>

        <div className="wrap relative flex flex-col items-center pb-16 pt-28 text-center md:pt-32">
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9 }}>
            <Orb size={150} halo />
          </motion.div>
          <CloudWordmark width={320} className="-mt-4" />
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.05, ease: [0.2, 0.7, 0.2, 1] }}
            className="mt-3 max-w-[16ch] font-display text-[42px] font-bold leading-[1.0] tracking-[-0.045em] sm:text-[64px] lg:text-[82px] 2xl:text-[108px]"
          >
            The internet, in your own words.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.12 }}
            className="mt-5 max-w-[36rem] text-[17.5px] font-medium leading-relaxed text-ink sm:text-[19px] 2xl:max-w-[44rem] 2xl:text-[22px]"
          >
            Say what you need in Yorùbá, Hausa, Igbo, Pidgin or English. Jagora uses any website for you, shows proof from official sources, and stops to ask before anything that matters.
          </motion.p>

          <motion.form
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
            onSubmit={(e) => (e.preventDefault(), go())}
            data-amina="hero"
            className="liquid-glass glass-strong mt-9 w-full max-w-[680px] rounded-[30px] p-2.5 text-left 2xl:max-w-[860px]"
          >
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1 pl-4">
                <span className="sr-only">Tell Jagora what you need</span>
                <input value={text} onChange={(e) => setText(e.target.value)} className="h-[56px] w-full bg-transparent text-[17px] font-medium text-ink outline-none sm:text-[19px]" />
                {!text && (
                  <motion.span key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-none absolute inset-y-0 left-4 right-1 flex min-w-0 items-center overflow-hidden text-[17px] text-ink-2 sm:text-[19px]">
                    <span className="block min-w-0 truncate">{ASKS[k].text}</span>
                  </motion.span>
                )}
              </label>
              <button type="submit" className="btn btn-ink h-[52px] w-[52px] shrink-0" aria-label="Ask Jagora">
                <PaperPlaneRight size={20} weight="fill" />
              </button>
            </div>
            <div className="no-scrollbar mt-1.5 flex gap-2 overflow-x-auto px-1.5 pb-1">
              {ASKS.map((a, i) => (
                <button
                  type="button"
                  key={a.lang}
                  onClick={() => setText(a.text)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-bold transition ${i === k ? "bg-ink text-paper" : "bg-white/70 text-ink hover:bg-white"}`}
                >
                  {a.lang}
                </button>
              ))}
            </div>
          </motion.form>
        </div>

        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.3 }} className="wrap relative pb-20">
          <DeviceRender
            name="hero"
            w={1740}
            h={1020}
            className="mx-auto max-w-[1300px]"
            alt="A laptop and a phone with Jagora open: Jagora filling a registration form on the live page, with the conversation beside it"
          />
        </motion.div>
      </section>

      {/* the people: the real Earth, with the Nigerians Jagora is built for */}
      <section id="languages" className="relative py-20 md:py-28">
        <div className="wrap grid items-center gap-10 md:grid-cols-[1fr_1.05fr] xl:gap-20">
          <motion.div {...rise} className="liquid-glass glass-strong rounded-[32px] p-6 sm:p-9">
            <p className="text-[15px] font-bold uppercase tracking-[0.08em] text-accent">Built for Nigeria</p>
            <h2 className="mt-3 max-w-[14ch] font-display text-[38px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-[56px] xl:text-[72px] 2xl:text-[84px]">Tens of millions of Nigerians.</h2>
            <p className="mt-5 max-w-[34rem] text-[17.5px] font-medium leading-relaxed text-ink sm:text-[19px] xl:text-[20px]">
              They think and speak in Yorùbá, Hausa, Igbo or Pidgin, but almost every website is in English. So booking a train, checking exam requirements or spotting a scam means asking someone else. Jagora speaks first in their language.
            </p>
            <ul data-amina="languages" className="mt-7 grid gap-2.5">
              {LANGS.map(([name, line, code], i) => (
                <motion.li key={name} {...rise} transition={{ ...rise.transition, delay: i * 0.05 }} data-amina-say={line} data-amina-lang={code} className="flex items-baseline justify-between gap-4 rounded-[18px] bg-white/75 px-5 py-3.5 ring-1 ring-white">
                  <span className="font-display text-[18px] font-bold leading-snug tracking-[-0.015em] sm:text-[21px]">{line}</span>
                  <span className="shrink-0 text-[14px] font-bold text-accent">{name}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
          <div className="mx-auto w-full max-w-[720px] px-6 sm:px-10">
            <PeopleGlobe />
            <p className="mx-auto mt-6 w-fit rounded-full bg-white/75 px-4 py-1.5 text-center text-[14px] font-bold text-ink backdrop-blur">Drag the Earth to spin it</p>
          </div>
        </div>
      </section>

      {/* what it does */}
      <section id="powers" className="relative bg-[var(--color-white)]/85 py-20 backdrop-blur-xl md:py-28">
        <div className="wrap">
          <motion.div {...rise} className="max-w-[40rem]">
            <p className="text-[15px] font-bold uppercase tracking-[0.08em] text-accent">What Jagora does</p>
            <h2 className="mt-3 font-display text-[38px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-[56px] xl:text-[72px] 2xl:text-[84px]">A browser that works for you.</h2>
          </motion.div>
          <div data-amina="cards" className="-mx-5 mt-6 md:mx-0 md:mt-10">
            <CardStack cards={POWERS} />
          </div>

          {/* real screens */}
          <div className="mt-20 grid items-center gap-10 md:grid-cols-[1fr_1.1fr]">
            <motion.div {...rise}>
              <p className="text-[15px] font-bold uppercase tracking-[0.08em] text-accent">See it work</p>
              <h2 className="mt-3 font-display text-[34px] font-bold leading-[1.04] tracking-[-0.035em] sm:text-[48px] xl:text-[60px] 2xl:text-[68px]">The live page, on your screen.</h2>
              <p className="mt-4 max-w-[30rem] text-[17px] font-medium leading-relaxed text-ink xl:max-w-[36rem] xl:text-[19px]">
                You watch Jagora work on the real website, full screen on your phone. Want to do a step yourself? Tap Take over. Not sure what it means? It asks you to point.
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-[16px] font-medium">
                <Li icon={<Globe size={20} />}>Any website: forms, dashboards, maps, uploads</Li>
                <Li icon={<CursorClick size={20} />}>Tap to show it what you mean</Li>
                <Li icon={<MagnifyingGlass size={20} />}>Reads five sources at once, then shows proof</Li>
              </ul>
            </motion.div>
            <motion.div {...rise} data-amina="phones">
              <DeviceRender
                name="phones"
                w={910}
                h={960}
                className="mx-auto max-w-[560px]"
                alt="Two phones with Jagora: one filling a form, one showing a research document ready as PDF, Word or Markdown"
              />
            </motion.div>
          </div>
        </div>
      </section>

      <Security />

      {/* start */}
      <section className="relative px-5 py-14 sm:px-0 md:py-28">
        <motion.div {...rise} className="liquid-glass mx-auto flex max-w-[1400px] flex-col items-center rounded-[28px] px-5 py-8 text-center sm:rounded-[36px] sm:px-12 sm:py-12">
          <div className="-my-4 scale-[0.7] sm:my-0 sm:scale-100">
            <Orb size={120} />
          </div>
          <h2 className="mt-3 font-display text-[30px] font-bold leading-tight tracking-[-0.035em] sm:mt-4 sm:text-[52px]">Try Jagora now.</h2>
          <p className="mt-2 max-w-[30ch] text-[15px] font-medium text-ink sm:max-w-none sm:text-[17px]">No download. Works in the browser on any phone or computer.</p>
          <button onClick={() => go("")} data-amina-point className="btn btn-ink mt-5 h-11 px-6 text-[15px] sm:mt-6 sm:h-12 sm:px-7 sm:text-[16px]">
            Start
          </button>
        </motion.div>
      </section>

      <p className="wrap pb-6 text-center text-[13px] font-bold text-ink">
        Photos: Unsplash and Pexels. Earth: NASA Blue Marble. <a href="/credits.txt" className="underline underline-offset-2">Full credits</a>
      </p>
      <SiteFooter />
    </div>
  );
}

function Li({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-ink/15">{icon}</span>
      {children}
    </li>
  );
}
