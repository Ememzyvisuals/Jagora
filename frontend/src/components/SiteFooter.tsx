"use client";

/* The footer of every public page, laid out like Emmanuel's portfolio footer: Jagora and what it is, the link
   columns, the credits (voice, intelligence, builder with his profiles as app-style icons), a bottom line, and a
   huge cloud-glass "Jagora" in Boiling across the end of the page. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { siMeta } from "simple-icons";
import { BUILDER, PLOTWEAVER, REPO } from "@/lib/credits";
import { GlassWordmark } from "./glass/GlassWordmark";
import { Glass } from "./glass/Glass";
import { startPageWars } from "./PageWars";
import { startScamSmash } from "./ScamSmash";
import { Amina, aminaHidden, setAminaHidden } from "./mascot/Amina";

const COLUMNS: { title: string; links: { label: string; href: string; ext?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Open Jagora", href: "/app" },
      { label: "How it works", href: "/about#how" },
      { label: "Use cases", href: "/use-cases" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "About Jagora", href: "/about" },
      { label: "The builder", href: "/about#builder" },
      { label: "Source code", href: REPO, ext: true },
      { label: "PlotWeaver API", href: PLOTWEAVER.url, ext: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of use", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Acceptable use", href: "/acceptable-use" },
      { label: "Safety", href: "/safety" },
    ],
  },
];

/* his profiles, drawn as app-style tiles in each brand's own colours (same set as his portfolio) */
const Tile = ({ bg, children }: { bg: string; children: React.ReactNode }) => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <rect width="36" height="36" rx="8" fill={bg} />
    {children}
  </svg>
);
const TT = "M24.5 14.069a5.483 5.483 0 01-3.203-1.024v4.662a4.96 4.96 0 11-4.297-4.906v2.727a2.24 2.24 0 102.24 2.179v-9.207h2.662a3.203 3.203 0 003.598 2.867v2.702z";
const SOCIALS = [
  {
    label: "GitHub",
    href: "https://github.com/ememzyvisuals",
    icon: (
      <Tile bg="#24292e">
        <path d="M18 8.5C12.477 8.5 8 12.977 8 18.5c0 4.42 2.865 8.166 6.839 9.49.5.09.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.607.069-.607 1.003.07 1.531 1.03 1.531 1.03.892 1.528 2.341 1.087 2.91.832.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.09.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.026A9.578 9.578 0 0118 13.84a9.6 9.6 0 012.504.337c1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.308.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C25.138 26.663 28 22.918 28 18.5 28 12.977 23.523 8.5 18 8.5z" fill="white" />
      </Tile>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/ememzyvisuals",
    icon: (
      <Tile bg="#0A66C2">
        <path d="M13.5 14.5H10.5V25.5H13.5V14.5ZM12 13.25C13.1 13.25 14 12.35 14 11.25C14 10.15 13.1 9.25 12 9.25C10.9 9.25 10 10.15 10 11.25C10 12.35 10.9 13.25 12 13.25ZM25.5 25.5H22.5V20.1C22.5 18.9 22.5 17.35 20.85 17.35C19.15 17.35 18.9 18.65 18.9 20V25.5H15.9V14.5H18.75V15.85H18.8C19.2 15.1 20.2 14.3 21.7 14.3C24.75 14.3 25.5 16.3 25.5 18.9V25.5Z" fill="white" />
      </Tile>
    ),
  },
  {
    label: "X",
    href: "https://x.com/ememzyvisuals",
    icon: (
      <Tile bg="#000">
        <path d="M19.776 16.895L25.4 10H24.01L19.153 16.01 15.29 10H10.5L16.408 18.884 10.5 26H11.89L17.03 19.765 21.11 26H25.9L19.776 16.895ZM17.726 18.96L17.11 18.058 12.38 11.05H14.61L18.27 16.847L18.886 17.75L24.011 25.002H21.781L17.726 18.96Z" fill="white" />
      </Tile>
    ),
  },
  {
    label: "TikTok",
    href: "https://tiktok.com/@ememzyvisuals",
    icon: (
      <Tile bg="#000">
        <path d={TT} fill="#25F4EE" transform="translate(-.7 -.5)" />
        <path d={TT} fill="#FE2C55" transform="translate(.7 .5)" />
        <path d={TT} fill="white" />
      </Tile>
    ),
  },
  {
    label: "Kaggle",
    href: "https://www.kaggle.com/ememzyvisuals",
    icon: (
      <Tile bg="#20BEFF">
        <path d="M24.825 25.859c-.022.092-.117.141-.281.141h-3.139c-.187 0-.351-.082-.492-.248l-5.178-6.589-1.448 1.374v5.111c0 .235-.117.352-.351.352H11.505c-.236 0-.354-.117-.354-.352V10.353c0-.233.118-.353.354-.353h2.431c.234 0 .351.12.351.353v8.343l6.203-6.272c.165-.165.33-.246.495-.246h3.239c.144 0 .236.06.285.18.046.149.034.255-.036.315l-6.555 6.344 6.836 8.507c.095.104.117.208.07.334z" fill="white" />
      </Tile>
    ),
  },
  {
    label: "Website",
    href: BUILDER.site,
    icon: (
      <Tile bg="#1d63ed">
        <g stroke="white" strokeWidth="1.7" fill="none">
          <circle cx="18" cy="18" r="8.2" />
          <path d="M9.8 18h16.4M18 9.8c2.3 2.3 3.4 5 3.4 8.2s-1.1 5.9-3.4 8.2M18 9.8c-2.3 2.3-3.4 5-3.4 8.2s1.1 5.9 3.4 8.2" />
        </g>
      </Tile>
    ),
  },
];

const Meta = ({ label, seat }: { label: string; seat?: boolean }) => (
  <span className="flex items-center gap-2 font-display text-[16.5px] font-bold tracking-[-0.02em] text-ink">
    {/* Amina sits on the Muse Spark mark (data-amina-seat); it looks exactly like the others */}
    <span data-amina-seat={seat ? "" : undefined} className="inline-flex">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="#0866FF" aria-hidden="true">
        <path d={siMeta.path} />
      </svg>
    </span>
    {label}
  </span>
);
const POWERS = [
  {
    title: "Listening and speaking",
    href: PLOTWEAVER.url,
    logo: (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/plotweaver-dark.png" alt="PlotWeaver" className="h-[22px] w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/plotweaver.png" alt="PlotWeaver" className="hidden h-[22px] w-auto dark:block" />
      </>
    ),
    body: "STORM speech recognition turns what you say in Yorùbá, Hausa, Igbo, Pidgin or English into text, and STORM voices give Jagora its voice, Amina. From the PlotWeaver API at developer.plotweaver.app.",
  },
  {
    title: "The browsing agent",
    href: "https://ai.meta.com",
    logo: <Meta label="Muse Spark" seat />,
    body: "Understands what you asked, reads each page, decides the next step and works the website for you: searching, clicking, filling forms and checking every action before it moves on.",
  },
  {
    title: "Reading what you show it",
    href: "https://ai.meta.com",
    logo: <Meta label="Muse Wonder" />,
    body: "Reads photos of letters, bills and screens, short videos and voice notes, so you can show Jagora a paper and hear what it says and what to do next.",
  },
  {
    title: "Picture guides",
    href: "https://ai.meta.com",
    logo: <Meta label="Muse Image" />,
    body: "Draws a short picture story of the steps for people who cannot read easily: take your ID card, go to the bank, pay before the date.",
  },
];

const head = "font-head text-[17px] leading-none text-ink";
const link = "w-fit text-[15px] text-ink-2 transition-colors hover:text-ink";

/** Every public page ends with this footer, so Amina comes with it: she sits on the Meta logo here and peeks at
    whatever the page marks for her. */
export function SiteFooter() {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const year = new Date().getFullYear();
  const [aminaOff, setAminaOff] = useState(false);
  useEffect(() => {
    const sync = () => setAminaOff(aminaHidden());
    sync();
    window.addEventListener("amina:toggle", sync);
    return () => window.removeEventListener("amina:toggle", sync);
  }, []);

  return (
    <footer className="relative mt-16 px-3 sm:px-5">
      <Glass radius={32} bezel={18} tint="rgba(255,255,255,.8)" interactive={false} className="mx-auto max-w-[2400px]">
        <div className="space-y-10 px-6 py-12 sm:px-10 md:py-16 lg:px-14">
          <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr_1.6fr] md:gap-8">
            {/* brand */}
            <div className="col-span-2 space-y-4 md:col-span-1">
              <Link href="/" className="block font-head text-[30px] leading-none text-ink">
                Jagora
              </Link>
              <p className="max-w-[30ch] text-[15px] leading-relaxed text-ink-2">
                A voice-first browser for Nigeria. Speak Yorùbá, Hausa, Igbo, Pidgin or English, and Jagora does the browsing with you.
              </p>
            </div>

            {/* link columns */}
            {COLUMNS.map((c) => (
              <div key={c.title} className="space-y-4">
                <p className={head}>{c.title}</p>
                <nav className="flex flex-col gap-3">
                  {c.links.map((l) =>
                    l.ext ? (
                      <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={link}>
                        {l.label}
                      </a>
                    ) : (
                      <Link key={l.label} href={l.href} className={link}>
                        {l.label}
                      </Link>
                    ),
                  )}
                </nav>
              </div>
            ))}

            {/* credits */}
            <div id="builder" className="col-span-2 space-y-5 md:col-span-1">
              <div className="space-y-3">
                <p className={head}>Designed and built by</p>
                <a href={BUILDER.site} target="_blank" rel="noopener noreferrer" className="block w-fit text-[15px] text-ink hover:text-accent">
                  {BUILDER.name} <span className="text-ink-3">({BUILDER.handle})</span>
                </a>
                <a href={`mailto:${BUILDER.email}`} className="block w-fit text-[14px] text-ink-3 hover:text-ink">
                  {BUILDER.email}
                </a>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  {SOCIALS.map(({ label, href, icon }) => (
                    <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className="transition hover:scale-105 hover:opacity-85">
                      {icon}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* what each part of Jagora runs on */}
          <div className="border-t border-ink/10 pt-10">
            <p className="font-head text-[22px] leading-none text-ink">What powers Jagora</p>
            <div className="mt-7 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {POWERS.map((p) => (
                <div key={p.title} className="space-y-2.5">
                  <a href={p.href} target="_blank" rel="noopener noreferrer" className="flex h-7 w-fit items-center transition-opacity hover:opacity-75">
                    {p.logo}
                  </a>
                  <p className="font-head text-[16px] leading-tight text-ink">{p.title}</p>
                  <p className="text-[14px] leading-relaxed text-ink-2">{p.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* bottom */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-ink/10 pt-6 sm:flex-row">
            <p className="text-[13px] text-ink-3">© {year} Jagora. Built for the Meta Global AI Developer Hackathon 2026.</p>
            <p className="flex items-center gap-3 text-[13px] text-ink-3">
              Designed and built by {BUILDER.name}
              <button onClick={() => setAminaHidden(!aminaOff)} className="shrink-0 whitespace-nowrap rounded-full bg-black/5 px-3 py-1 font-semibold text-ink-2 transition hover:bg-black/10 dark:bg-white/10">
                {aminaOff ? "Show Amina" : "Hide Amina"}
              </button>
              <button onClick={startPageWars} className="shrink-0 whitespace-nowrap rounded-full bg-black/5 px-3 py-1 font-semibold text-ink-2 transition hover:bg-black/10 dark:bg-white/10" title="Shift + G">
                Bored? Play
              </button>
              <button onClick={startScamSmash} className="shrink-0 whitespace-nowrap rounded-full bg-black/5 px-3 py-1 font-semibold text-ink-2 transition hover:bg-black/10 dark:bg-white/10">
                Scam Smash
              </button>
            </p>
          </div>
        </div>
      </Glass>

      {/* the wordmark at the end of the page */}
      <div ref={box} className="mx-auto mt-2 w-full max-w-[2400px] select-none" aria-hidden="true">
        {w > 0 && <GlassWordmark width={w} family="Jagora Boiling" weight={400} />}
      </div>
      <Amina />
    </footer>
  );
}
