"use client";

/* The front door: the sky, the cloud, what Jagora does (with real screens from the app), how it keeps people safe,
   the five languages, and the footer. Same design as the app: Boiling headings, Vollkorn text, portfolio glass. */
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
  Prohibit,
  SealCheck,
  ShieldCheck,
  Translate,
  Waveform,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Mark } from "@/components/Brand";
import { Backdrop } from "@/components/glass/Backdrop";
import { CloudWordmark } from "@/components/glass/CloudWordmark";
import { Devices3D } from "@/components/Devices3D";
import { CardStack } from "@/components/CardStack";
import { Orb } from "@/components/Orb";
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

const GUARD = [
  "Phishing, fake and adult sites are blocked",
  "Betting, exam expo and money-doubling sites too",
  "Hidden orders on a page can't take over Jagora",
  "IP-logger and tracking links are unmasked",
  "It asks before it submits, pays or agrees",
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
        <nav className="relative z-10 wrap flex items-center gap-3 pt-[max(16px,env(safe-area-inset-top))]">
          <Link href="/" className="flex items-center gap-2.5">
            <Mark size={34} />
            <span className="font-display text-[24px] font-bold tracking-[-0.03em] text-ink">Jagora</span>
          </Link>
          <div className="ml-auto hidden items-center gap-7 text-[15px] font-semibold text-ink md:flex">
            <a href="#powers" className="hover:opacity-70">What it does</a>
            <a href="#safe" className="hover:opacity-70">Safety</a>
            <a href="#languages" className="hover:opacity-70">Languages</a>
          </div>
          <Link href="/app" data-amina-point className="liquid-glass ml-auto rounded-full px-5 py-2.5 text-[15px] font-semibold text-ink md:ml-0">
            Open Jagora
          </Link>
        </nav>

        <div className="wrap relative flex flex-col items-center pb-16 pt-10 text-center md:pt-14">
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9 }}>
            <Orb size={150} />
          </motion.div>
          <CloudWordmark width={320} className="-mt-4" />
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.05, ease: [0.2, 0.7, 0.2, 1] }}
            className="mt-2 max-w-[16ch] text-[40px] leading-[1.02] sm:text-[60px] lg:text-[76px] 2xl:text-[104px]"
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
            className="liquid-glass mt-9 w-full max-w-[680px] rounded-[30px] 2xl:max-w-[860px] p-2.5 text-left"
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
                  onClick={() => go(a.text)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition ${i === k ? "bg-ink text-paper" : "bg-white/60 text-ink hover:bg-white"}`}
                >
                  {a.lang}
                </button>
              ))}
            </div>
          </motion.form>
        </div>

        <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: 0.3 }} className="wrap relative pb-20">
          <Devices3D
            scene="hero"
            className="aspect-[5/4] w-full sm:aspect-[16/9]"
            fallback={<Shot src="/shots/desktop-register.webp" alt="Jagora filling a registration form on the live page, with the conversation on the left" wide />}
          />
        </motion.div>
      </section>

      {/* what it does */}
      <section id="powers" className="relative bg-[var(--color-white)]/85 py-20 backdrop-blur-xl md:py-28">
        <div className="wrap">
          <motion.div {...rise} className="max-w-[40rem]">
            <p className="text-[15px] font-semibold text-accent">What Jagora does</p>
            <h2 className="mt-3 text-[34px] leading-[1.05] sm:text-[50px] xl:text-[64px] 2xl:text-[76px]">A browser that works for you.</h2>
          </motion.div>
          <div data-amina="cards" className="-mx-5 mt-6 md:mx-0 md:mt-10">
            <CardStack cards={POWERS} />
          </div>

          {/* real screens */}
          <div className="mt-20 grid items-center gap-10 md:grid-cols-[1fr_1.1fr]">
            <motion.div {...rise}>
              <p className="text-[15px] font-semibold text-accent">See it work</p>
              <h2 className="mt-3 text-[32px] leading-[1.06] sm:text-[44px] xl:text-[56px] 2xl:text-[64px]">The live page, on your screen.</h2>
              <p className="mt-4 max-w-[30rem] text-[17px] xl:max-w-[36rem] xl:text-[19px] leading-relaxed text-ink-2">
                You watch Jagora work on the real website, full screen on your phone. Want to do a step yourself? Tap Take over. Not sure what it means? It asks you to point.
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-[16px] font-medium">
                <Li icon={<Globe size={20} />}>Any website: forms, dashboards, maps, uploads</Li>
                <Li icon={<CursorClick size={20} />}>Tap to show it what you mean</Li>
                <Li icon={<MagnifyingGlass size={20} />}>Reads five sources at once, then shows proof</Li>
              </ul>
            </motion.div>
            <motion.div {...rise} data-amina="phones">
              <Devices3D
                scene="phones"
                className="aspect-[1/1] w-full"
                fallback={
                  <div className="flex items-end justify-center gap-4">
                    <PhoneShot src="/shots/phone-register.webp" alt="Jagora filling a form on a phone" />
                    <PhoneShot src="/shots/phone-doc.webp" alt="A research document Jagora wrote, ready as PDF, Word or Markdown" className="hidden translate-y-10 sm:block" />
                  </div>
                }
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* safety */}
      <section id="safe" className="relative py-20 md:py-28">
        <div className="wrap grid items-center gap-12 md:grid-cols-[1fr_1.2fr] xl:gap-24">
          <motion.div {...rise}>
            <span className="liquid-glass grid h-14 w-14 place-items-center rounded-[16px] text-ink">
              <ShieldCheck size={28} />
            </span>
            <h2 className="mt-6 max-w-[14ch] text-[34px] leading-[1.05] sm:text-[50px] xl:text-[64px] 2xl:text-[76px]">Safe on every page.</h2>
            <p className="mt-4 max-w-[30rem] text-[17px] xl:max-w-[36rem] xl:text-[19px] font-medium leading-relaxed text-ink">
              The safety rules are written into the code, not left to the AI. Private numbers go in a private box that only the website sees.
            </p>
            <ul data-amina="safety" className="mt-6 grid gap-2.5">
              {GUARD.map((g) => (
                <li key={g} className="liquid-glass flex items-center gap-3 rounded-[18px] px-4 py-3 text-[16px] font-semibold">
                  <Prohibit size={20} className="shrink-0" /> {g}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div {...rise}>
            <Devices3D
              scene="safety"
              className="aspect-[4/3] w-full"
              fallback={<Shot src="/shots/desktop-private.webp" alt="Jagora asking for a NIN in a private box that only the website sees" />}
            />
          </motion.div>
        </div>
      </section>

      {/* languages */}
      <section id="languages" className="relative bg-[var(--color-white)]/85 py-20 backdrop-blur-xl md:py-28">
        <div className="wrap">
          <motion.p {...rise} className="text-[15px] font-semibold text-accent">
            Five languages, spoken and written
          </motion.p>
          <div data-amina="languages" className="mt-6 flex flex-col">
            {[
              ["Ẹ n lẹ́, kí ni kí n bá yín ṣe?", "Yorùbá"],
              ["Sannu, me kake so in yi maka?", "Hausa"],
              ["Ndeewo, gịnị ka m ga-emere gị?", "Igbo"],
              ["How you dey, wetin I fit do for you?", "Naijá"],
              ["Good day, what can I do for you?", "English"],
            ].map(([line, name], i) => (
              <motion.div key={name} data-amina-say={line} data-amina-lang={{ Yorùbá: "yo", Hausa: "ha", Igbo: "ig", Naijá: "pcm", English: "en" }[name]} {...rise} transition={{ ...rise.transition, delay: i * 0.05 }} className="flex flex-wrap items-baseline gap-x-5 border-b border-ink/10 py-5 xl:justify-between xl:py-7">
                <span className="font-head text-[26px] leading-tight sm:text-[40px] xl:text-[56px] 2xl:text-[68px]">{line}</span>
                <span className="text-[15px] font-semibold text-ink-3 xl:text-[18px]">{name}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* start */}
      <section className="relative px-5 py-14 sm:px-0 md:py-28">
        <motion.div {...rise} className="liquid-glass mx-auto flex max-w-[1400px] flex-col items-center rounded-[28px] px-5 py-8 text-center sm:rounded-[36px] sm:px-12 sm:py-12">
          <div className="-my-4 scale-[0.7] sm:my-0 sm:scale-100">
            <Orb size={120} />
          </div>
          <h2 className="mt-3 text-[26px] leading-tight sm:mt-4 sm:text-[46px]">Try Jagora now.</h2>
          <p className="mt-2 max-w-[30ch] text-[15px] font-medium text-ink sm:max-w-none sm:text-[17px]">No download. Works in the browser on any phone or computer.</p>
          <button onClick={() => go("")} data-amina-point className="btn btn-ink mt-5 h-11 px-6 text-[15px] sm:mt-6 sm:h-12 sm:px-7 sm:text-[16px]">
            Start
          </button>
        </motion.div>
      </section>

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

function Shot({ src, alt, wide = false }: { src: string; alt: string; wide?: boolean }) {
  return (
    <div className={`liquid-glass overflow-hidden p-2 sm:p-3 ${wide ? "rounded-[30px] sm:rounded-[38px]" : "rounded-[26px]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className={`block w-full ${wide ? "rounded-[22px] sm:rounded-[28px]" : "rounded-[18px]"}`} />
    </div>
  );
}

function PhoneShot({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`w-[46%] max-w-[260px] rounded-[38px] bg-ink p-2 shadow-[0_40px_80px_-40px_rgba(10,30,70,.6)] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="block w-full rounded-[31px]" />
    </div>
  );
}
