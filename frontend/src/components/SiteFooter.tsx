"use client";

/* The footer of every public page: what Jagora is, where to go next, who made it and with what, the legal pages,
   and a huge cloud-glass "Jagora" across the bottom, sized to the screen it is on. */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { siGithub, siMeta, siTiktok, siX } from "simple-icons";
import { Mark } from "./Brand";
import { startPageWars } from "./PageWars";
import { CloudWordmark } from "./glass/CloudWordmark";
import { BUILDER, PLOTWEAVER, REPO } from "@/lib/credits";
import { Glass } from "./glass/Glass";

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

/** his profiles, each in its own real colours, no chips behind them */
const SOCIALS: { label: string; href: string; icon: ReactNode }[] = [
  { label: "X", href: "https://x.com/ememzyvisuals", icon: <span className="text-black dark:text-white"><Brand path={siX.path} size={22} /></span> },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/ememzyvisuals",
    icon: (
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <rect width="24" height="24" rx="4" fill="#0A66C2" />
        <path fill="#fff" d="M7.1 9.6H4.7V19h2.4V9.6ZM5.9 5.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Zm13.4 8.3c0-2.5-.5-4.4-3.4-4.4-1.4 0-2.3.8-2.7 1.5V9.6h-2.3V19h2.4v-4.6c0-1.2.2-2.4 1.7-2.4 1.5 0 1.5 1.4 1.5 2.5V19h2.4l.4-5.3Z" />
      </svg>
    ),
  },
  { label: "GitHub", href: "https://github.com/ememzyvisuals", icon: <span className="text-[#181717] dark:text-white"><Brand path={siGithub.path} size={23} /></span> },
  {
    label: "TikTok",
    href: "https://tiktok.com/@ememzyvisuals",
    icon: (
      <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true">
        <path d={siTiktok.path} fill="#25F4EE" transform="translate(-0.9 -0.7)" />
        <path d={siTiktok.path} fill="#FE2C55" transform="translate(0.9 0.7)" />
        <path d={siTiktok.path} className="fill-black dark:fill-white" />
      </svg>
    ),
  },
  { label: "Kaggle", href: "https://www.kaggle.com/ememzyvisuals", icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="#20BEFF" d="M7.2 2h3.3v11.1l5.6-6.2h4.2l-6.2 6.5L20.6 22h-4.3l-5.8-7.5V22H7.2z" />
      </svg>
    ) },
  {
    label: "Website",
    href: "https://ememzyvisuals.vercel.app",
    icon: (
      <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="#1d63ed" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2" />
        <path d="M2.8 12h18.4M12 2.8c2.6 2.6 3.9 5.6 3.9 9.2s-1.3 6.6-3.9 9.2M12 2.8C9.4 5.4 8.1 8.4 8.1 12s1.3 6.6 3.9 9.2" />
      </svg>
    ),
  },
];

function Brand({ path, size = 16, color = "currentColor" }: { path: string; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/** PlotWeaver's mark: their logo file when present, their name otherwise */
function PlotWeaverMark() {
  // their logo file when it has been added to /brand, their name otherwise
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const im = new Image();
    im.onload = () => setOk(true);
    im.src = "/brand/plotweaver.png";
  }, []);
  return ok ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/plotweaver.png" alt="PlotWeaver" className="h-[26px] w-auto self-start" />
  ) : (
    <span className="font-display text-[18px] font-bold tracking-[-0.03em] text-white">PlotWeaver</span>
  );
}

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

  return (
    <footer className="relative mt-16 px-3 pb-3 sm:px-5 sm:pb-5">
      <Glass radius={36} bezel={20} tint="rgba(255,255,255,.72)" interactive={false} className="mx-auto max-w-[1360px] overflow-hidden">
        <div className="grid gap-10 px-6 pb-8 pt-10 sm:px-10 md:grid-cols-[1.3fr_2fr] md:gap-14 md:pt-14 lg:px-14">
          {/* what Jagora is */}
          <div>
            <div className="flex items-center gap-3">
              <Mark size={40} />
              <span className="font-display text-[28px] font-bold tracking-[-0.035em] text-ink">Jagora</span>
            </div>
            <p className="mt-4 max-w-[34ch] text-[16px] leading-relaxed text-ink-2">
              A voice-first browser for Nigeria. Speak Yorùbá, Hausa, Igbo, Pidgin or English, and Jagora searches, checks, fills and finishes the task with you.
            </p>
            <Link href="/app" className="btn btn-ink mt-6 h-12 px-6 text-[15.5px] font-semibold">
              Open Jagora
            </Link>
          </div>

          {/* links */}
          <nav className="grid grid-cols-2 gap-8 sm:grid-cols-3" aria-label="Footer">
            {COLUMNS.map((c) => (
              <div key={c.title}>
                <p className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3">{c.title}</p>
                <ul className="mt-4 space-y-3">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      {l.ext ? (
                        <a href={l.href} target="_blank" rel="noreferrer" className="text-[15.5px] text-ink transition hover:text-accent">
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href} className="text-[15.5px] text-ink transition hover:text-accent">
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* credits */}
        <div className="mx-6 grid gap-3 border-t border-ink/10 py-8 sm:mx-10 md:grid-cols-3 lg:mx-14">
          <a href={PLOTWEAVER.url} target="_blank" rel="noreferrer" className="group flex flex-col gap-3 rounded-[24px] bg-[#061113] p-5 text-white ring-1 ring-white/5 transition hover:bg-[#0a1b1e]">
            <span className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-white/55">Voice by</span>
            <PlotWeaverMark />
            <span className="text-[14px] leading-snug text-white/75">
              STORM speech recognition and voices for Yorùbá, Hausa, Igbo, Pidgin and English. {PLOTWEAVER.line}.
            </span>
            <span className="mt-auto text-[13.5px] font-semibold text-[#c8f31d] group-hover:underline">developer.plotweaver.app</span>
          </a>
          <div className="flex flex-col gap-3 rounded-[24px] bg-gradient-to-br from-[#0866FF] to-[#0a4fd6] p-5 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,.25)]">
            <span className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-white/65">Intelligence by</span>
            <span className="flex items-center gap-2 font-display text-[18px] font-bold tracking-[-0.03em] text-white">
              <span className="text-white">
                <Brand path={siMeta.path} size={22} />
              </span>
              Meta Muse
            </span>
            <span className="text-[14px] leading-snug text-white/80">Muse Spark runs the browsing agent. Muse Wonder reads photos, videos and voice notes. Muse Image draws picture guides.</span>
          </div>
          <div id="builder" className="flex flex-col gap-3 rounded-[24px] bg-white p-5 ring-1 ring-black/5 dark:bg-white/10">
            <span className="text-[12.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">Designed and built by</span>
            <a href={BUILDER.site} target="_blank" rel="noreferrer" className="font-display text-[18px] font-bold tracking-[-0.03em] text-ink">
              {BUILDER.name}
              <span className="ml-2 font-sans text-[14px] font-normal text-ink-3">{BUILDER.handle}</span>
            </a>
            <span className="text-[14px] leading-snug text-ink-2">AI and machine learning engineer. Builder of speech AI for African languages.</span>
            <div className="mt-auto flex flex-wrap items-center gap-4 pt-1">
              {SOCIALS.map(({ label, href, icon }) => (
                <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className="transition hover:-translate-y-0.5 hover:opacity-80">
                  {icon}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* bottom line */}
        <div className="mx-6 flex flex-col gap-2 border-t border-ink/10 py-5 text-[13.5px] text-ink-3 sm:mx-10 sm:flex-row sm:items-center sm:justify-between lg:mx-14">
          <span>© {new Date().getFullYear()} Jagora. Made in Nigeria, for everyone who speaks its languages.</span>
          <span className="flex items-center gap-3">
            Built for the Meta Global AI Developer Hackathon 2026
            <button onClick={startPageWars} className="rounded-full bg-black/5 px-3 py-1 font-semibold text-ink-2 transition hover:bg-black/10 dark:bg-white/10" title="Shift + G">
              Bored? Play
            </button>
          </span>
        </div>

      </Glass>
      {/* the wordmark on the sky, as wide as the page */}
      <div ref={box} className="mx-auto -mt-2 w-full max-w-[1360px] select-none" aria-hidden="true">
        {w > 0 && <CloudWordmark width={w} family="Jagora Boiling" weight={400} />}
      </div>
    </footer>
  );
}
