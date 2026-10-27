"use client";

/* The frame for Jagora's public pages (about, use cases, roadmap, legal): the sky, a light top bar, the page as a
   frosted glass sheet with clean reading type, and the site footer. */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Mark } from "./Brand";
import { Backdrop } from "./glass/Backdrop";
import { Glass } from "./glass/Glass";
import { SiteFooter } from "./SiteFooter";

const NAV = [
  { label: "About", href: "/about" },
  { label: "Use cases", href: "/use-cases" },
  { label: "Roadmap", href: "/roadmap" },
];

/** the page's own sections, for wide screens */
function Contents() {
  const [heads, setHeads] = useState<{ id: string; text: string }[]>([]);
  useEffect(() => {
    const list = [...document.querySelectorAll<HTMLElement>("[data-page-text] h2")].map((h, i) => {
      if (!h.id) h.id = (h.textContent || `part-${i}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return { id: h.id, text: h.textContent || "" };
    });
    setHeads(list);
  }, []);
  if (heads.length < 2) return <div className="hidden xl:block" />;
  return (
    <nav aria-label="On this page" className="hidden xl:block">
      <div className="sticky top-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-2">On this page</p>
        <ul className="mt-4 flex flex-col gap-1 border-l border-ink/10">
          {heads.map((h) => (
            <li key={h.id}>
              <a href={`#${h.id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[15.5px] font-medium text-ink-2 transition hover:border-ink hover:text-ink">
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export function InfoPage({ eyebrow, title, lead, updated, children }: { eyebrow: string; title: string; lead: string; updated?: string; children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <Backdrop />
      <header className="wrap relative z-10 flex items-center gap-3 pt-[max(14px,env(safe-area-inset-top))]">
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

      <main className="wrap relative mt-8 sm:mt-14">
        <div className="px-2 sm:px-4">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-ink-2">{eyebrow}</p>
          <h1 className="mt-3 text-[clamp(40px,7vw,96px)] leading-[0.98] text-ink">{title}</h1>
          <p className="mt-5 max-w-[56ch] text-[clamp(17px,1.6vw,24px)] leading-relaxed text-ink-2">{lead}</p>
          {updated && <p className="mt-3 text-[13.5px] text-ink-3">Last updated {updated}</p>}
        </div>
        {/* on wide screens the page uses the whole width: a list of its sections on the left, the text on the right */}
        <div className="mt-10 grid gap-8 xl:grid-cols-[260px_1fr] 2xl:grid-cols-[320px_1fr]">
          <Contents />
          <Glass radius={32} bezel={18} tint="rgba(255,255,255,.78)" interactive={false} className="px-6 py-8 sm:px-12 sm:py-12 xl:px-16 2xl:px-24 2xl:py-16">
            <div data-page-text className="prose-jagora">{children}</div>
          </Glass>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
