"use client";

import { PaperPlaneRight } from "@phosphor-icons/react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { IconDoForMe, IconGuide, IconLock, IconPasteMessage, IconShield, IconSnapPaper } from "@/components/icons";
import { Orb } from "@/components/Orb";
import { useApp } from "@/lib/store";

const ASKS = [
  { lang: "Yorùbá", text: "Bá mi forúkọ sílẹ̀ fún ìdánwò JAMB" },
  { lang: "Naijá", text: "Abeg check if this message na scam" },
  { lang: "Hausa", text: "Taimaka min in duba sakamakon jarrabawa" },
  { lang: "Igbo", text: "Nyere m aka jupụta fọm a" },
  { lang: "English", text: "Read this water bill to me" },
];

const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { duration: 0.7, ease: [0.2, 0.7, 0.2, 1] } } as const;

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
    <div className="bg-[#f8f2ea] dark:bg-[#16181d] text-ink">
      {/* hero */}
      <section className="sky relative min-h-[100svh] overflow-hidden" style={{ backgroundImage: "url(/sky/hero-desktop.webp)" }}>
        <picture className="absolute inset-0 md:hidden">
          <img src="/sky/hero-mobile.webp" alt="" className="h-full w-full object-cover" />
        </picture>
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#f8f2ea]" />
        <nav className="relative mx-auto flex max-w-[1200px] items-center gap-6 px-5 pt-5 md:px-8">
          <Brand />
          <div className="ml-auto hidden items-center gap-7 text-[15px] text-ink-2 md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#safe" className="hover:text-ink">Safety</a>
            <a href="#languages" className="hover:text-ink">Languages</a>
          </div>
          <Link href="/app" className="btn btn-glass ml-auto h-10 px-4 text-[14.5px] md:ml-0">
            Open Jagora
          </Link>
        </nav>

        <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-5 pb-24 pt-[14vh] text-center md:px-8">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
            className="max-w-[15ch] text-[44px] font-semibold leading-[0.98] tracking-[-0.02em] sm:text-[64px] lg:text-[84px]"
          >
            The internet, in your own words.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-ink-2 sm:text-[19px]"
          >
            Say what you need in Yorùbá, Hausa, Igbo, Pidgin or English. Jagora opens the site, reads it to you and fills the form, and stops to ask before anything that matters.
          </motion.p>

          <motion.form
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
            onSubmit={(e) => (e.preventDefault(), go())}
            className="glass-2 mt-10 w-full max-w-[680px] rounded-[34px] p-3 text-left"
          >
            <div className="flex items-center gap-3">
              <Orb size={64} className="shrink-0" />
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Tell Jagora what you need</span>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="peer h-[64px] w-full bg-transparent text-[18px] text-ink outline-none sm:text-[20px]"
                />
                {!text && (
                  <motion.span key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-none absolute inset-y-0 left-0 flex items-center truncate text-[18px] text-ink-3 sm:text-[20px]">
                    {ASKS[k].text}
                  </motion.span>
                )}
              </label>
              <button type="submit" className="btn btn-ink h-[52px] w-[52px] shrink-0" aria-label="Ask Jagora">
                <PaperPlaneRight size={20} weight="fill" />
              </button>
            </div>
            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {ASKS.map((a, i) => (
                <button
                  type="button"
                  key={a.lang}
                  onClick={() => go(a.text)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] transition ${i === k ? "bg-ink text-paper" : "bg-white/70 text-ink-2 hover:bg-white"}`}
                >
                  {a.lang}
                </button>
              ))}
            </div>
          </motion.form>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
          className="relative mx-auto max-w-[1200px] px-5 pb-10 md:px-8"
        >
          <Frame src="/shots/desktop-register.webp" alt="Jagora filling a registration form on a laptop while explaining each step in Yorùbá" />
        </motion.div>
      </section>

      {/* how it works, two ways */}
      <section id="how" className="mx-auto max-w-[1200px] px-5 py-24 md:px-8 md:py-32">
        <motion.div {...rise} className="max-w-[40rem]">
          <p className="text-[15px] font-medium text-accent">How it works</p>
          <h2 className="mt-3 text-[36px] font-semibold leading-[1.04] tracking-[-0.015em] sm:text-[52px]">Two ways to get it done.</h2>
        </motion.div>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <Way
            icon={<IconGuide size={52} />}
            title="Guide me"
            body="Jagora points at each box on the real page and tells you what goes there. You tap and type. You learn the site as you go."
            shot="/shots/phone-guide.webp"
          />
          <Way
            icon={<IconDoForMe size={52} />}
            title="Do it for me"
            body="Jagora fills it in from your saved details and reads every answer back. Only you can say the final yes."
            shot="/shots/phone-register.webp"
          />
        </div>
      </section>

      {/* safety */}
      <section id="safe" className="relative overflow-hidden">
        <div className="sky absolute inset-0 opacity-90" style={{ backgroundImage: "url(/sky/app.webp)" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#f8f2ea] via-transparent to-[#f8f2ea]" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-5 py-28 md:grid-cols-[1fr_420px] md:px-8 md:py-36">
          <motion.div {...rise}>
            <IconShield size={60} />
            <h2 className="mt-6 max-w-[14ch] text-[36px] font-semibold leading-[1.04] tracking-[-0.015em] sm:text-[52px]">It stops before anything that matters.</h2>
            <p className="mt-5 max-w-[32rem] text-[17.5px] leading-relaxed text-ink-2">
              The stops are written into the code, not left to the model. Jagora pauses and asks, in your language, before it:
            </p>
            <ul className="mt-7 grid max-w-[34rem] gap-3 sm:grid-cols-2">
              {["Submits or sends anything", "Pays or moves money", "Types a password, PIN or OTP", "Agrees to terms for you"].map((r) => (
                <li key={r} className="glass-2 rounded-[20px] px-5 py-4 text-[16px] font-medium">
                  {r}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div {...rise} transition={{ ...rise.transition, delay: 0.1 }}>
            <Phone src="/shots/phone-confirm.webp" alt="Jagora asking for a yes before it submits a form" />
          </motion.div>
        </div>
      </section>

      {/* everyday help */}
      <section className="mx-auto max-w-[1200px] px-5 py-24 md:px-8 md:py-32">
        <motion.div {...rise} className="max-w-[40rem]">
          <p className="text-[15px] font-medium text-accent">Everyday help</p>
          <h2 className="mt-3 text-[36px] font-semibold leading-[1.04] tracking-[-0.015em] sm:text-[52px]">For the messages and papers that worry you.</h2>
        </motion.div>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <Card
            icon={<IconPasteMessage size={52} />}
            title="Is this message real?"
            body="Paste the SMS or WhatsApp message. Jagora checks the link against the real bank's site and tells you plainly what it found."
            shot="/shots/phone-scam.webp"
          />
          <Card
            icon={<IconSnapPaper size={52} />}
            title="What does this paper say?"
            body="Take a photo of a bill, a letter or a notice. Jagora reads it out and shows you the part that needs action: how much, and by when."
            shot="/shots/phone-letter.webp"
          />
        </div>
      </section>

      {/* languages */}
      <section id="languages" className="bg-ink py-24 text-paper md:py-32">
        <div className="mx-auto max-w-[1200px] px-5 md:px-8">
          <motion.p {...rise} className="text-[15px] font-medium text-paper/60">
            Five languages, spoken and written
          </motion.p>
          <div className="mt-8 flex flex-col gap-1">
            {[
              ["Ẹ n lẹ́, kí ni kí n bá yín ṣe?", "Yorùbá"],
              ["Sannu, me kake so in yi maka?", "Hausa"],
              ["Ndeewo, gịnị ka m ga-emere gị?", "Igbo"],
              ["How you dey, wetin I fit do for you?", "Naijá"],
              ["Good day, what can I do for you?", "English"],
            ].map(([line, name], i) => (
              <motion.div key={name} {...rise} transition={{ ...rise.transition, delay: i * 0.06 }} className="flex flex-wrap items-baseline gap-x-5 border-b border-white/10 py-5">
                <span className="text-[28px] font-semibold leading-tight tracking-[-0.01em] sm:text-[44px]">{line}</span>
                <span className="text-[15px] text-paper/50">{name}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* privacy + cta */}
      <section className="mx-auto max-w-[1200px] px-5 py-24 md:px-8 md:py-32">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <motion.div {...rise}>
            <IconLock size={56} />
            <h2 className="mt-6 text-[34px] font-semibold leading-[1.06] tracking-[-0.015em] sm:text-[46px]">Your details stay with you.</h2>
            <p className="mt-4 max-w-[30rem] text-[17.5px] leading-relaxed text-ink-2">
              Your name, phone and date of birth are saved on your phone. Jagora reads each one back before using it, and you can remove them all with one tap.
            </p>
          </motion.div>
          <motion.div {...rise} className="sky relative overflow-hidden rounded-[36px] p-8 sm:p-12" style={{ backgroundImage: "url(/sky/hero-mobile.webp)" }}>
            <div className="relative flex flex-col items-start">
              <Orb size={120} />
              <h3 className="mt-6 text-[30px] font-semibold leading-tight">Try Jagora now.</h3>
              <p className="mt-2 text-[16.5px] text-ink-2">No download. Works in the browser on any phone.</p>
              <button onClick={() => go("")} className="btn btn-ink mt-6 h-13 px-6 py-3.5 text-[16px]">
                Start
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-5 py-8 text-[14px] text-ink-3 sm:flex-row sm:items-center md:px-8">
          <Brand size={22} />
          <span className="sm:ml-auto">Built for the Meta AI Developer Hackathon 2026 with Muse Spark.</span>
        </div>
      </footer>
    </div>
  );
}

function Frame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="glass rounded-[30px] p-2.5 shadow-[0_60px_120px_-60px_rgba(60,38,16,.55)] sm:rounded-[38px] sm:p-3.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block w-full rounded-[22px] sm:rounded-[28px]" />
    </div>
  );
}

function Phone({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[48px] bg-ink p-2.5 shadow-[0_50px_100px_-40px_rgba(60,38,16,.6)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block w-full rounded-[40px]" />
    </div>
  );
}

function Way({ icon, title, body, shot }: { icon: React.ReactNode; title: string; body: string; shot: string }) {
  return (
    <motion.article {...rise} className="overflow-hidden rounded-[36px] bg-white">
      <div className="p-8 sm:p-10">
        {icon}
        <h3 className="mt-5 text-[28px] font-semibold">{title}</h3>
        <p className="mt-2 max-w-[28rem] text-[16.5px] leading-relaxed text-ink-2">{body}</p>
      </div>
      <div className="sky relative h-[420px] overflow-hidden" style={{ backgroundImage: "url(/sky/app.webp)" }}>
        <div className="absolute left-1/2 top-10 w-[300px] -translate-x-1/2">
          <Phone src={shot} alt={title} />
        </div>
      </div>
    </motion.article>
  );
}

const Card = Way;
