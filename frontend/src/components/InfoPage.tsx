"use client";

/* The frame for Jagora's public pages (about, use cases, roadmap, legal): the sky, a light top bar, the page as a
   frosted glass sheet with clean reading type, and the site footer. */
import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "./Brand";
import { Backdrop } from "./glass/Backdrop";
import { Glass } from "./glass/Glass";
import { SiteFooter } from "./SiteFooter";

const NAV = [
  { label: "About", href: "/about" },
  { label: "Use cases", href: "/use-cases" },
  { label: "Roadmap", href: "/roadmap" },
];

export function InfoPage({ eyebrow, title, lead, updated, children }: { eyebrow: string; title: string; lead: string; updated?: string; children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <Backdrop />
      <header className="relative z-10 mx-auto flex max-w-[1360px] items-center gap-3 px-4 pt-[max(14px,env(safe-area-inset-top))] sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark size={36} />
          <span className="font-display text-[22px] font-bold tracking-[-0.035em] text-ink">Jagora</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-1 rounded-full bg-white/60 p-1 ring-1 ring-black/5 backdrop-blur-xl sm:flex dark:bg-white/10" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-full px-4 py-2 text-[14.5px] font-medium text-ink transition hover:bg-white/80 dark:hover:bg-white/15">
              {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/app" className="btn btn-ink ml-auto h-11 px-5 text-[15px] font-semibold sm:ml-2">
          Open Jagora
        </Link>
      </header>

      <main className="relative mx-auto mt-8 max-w-[880px] px-3 sm:mt-14 sm:px-5">
        <div className="px-2 sm:px-4">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-2">{eyebrow}</p>
          <h1 className="mt-3 text-[clamp(40px,7vw,72px)] leading-[0.98] text-ink">{title}</h1>
          <p className="mt-5 max-w-[56ch] text-[clamp(17px,2.2vw,20px)] leading-relaxed text-ink-2">{lead}</p>
          {updated && <p className="mt-3 text-[13.5px] text-ink-3">Last updated {updated}</p>}
        </div>
        <Glass radius={32} bezel={18} tint="rgba(255,255,255,.78)" interactive={false} className="prose-jagora mt-10 px-6 py-8 sm:px-12 sm:py-12">
          {children}
        </Glass>
      </main>
      <SiteFooter />
    </div>
  );
}
