"use client";

/* A document Jagora wrote, shown as a designed page (and printed to PDF from the same page), plus the card that
   stands for it in the conversation. */
import { DownloadSimple, FilePdf, FileText, MicrosoftWordLogo, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { downloadDocx, downloadMarkdown } from "@/lib/docs/export";
import type { DocBlock, JDoc } from "@/lib/store";
import { Mark } from "./Brand";

const date = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

function Block({ b }: { b: DocBlock }) {
  if (b.t === "h") return <h2 className="jd-h">{b.text}</h2>;
  if (b.t === "p") return <p className="jd-p">{b.text}</p>;
  if (b.t === "note") return <aside className="jd-note">{b.text}</aside>;
  if (b.t === "list")
    return b.ordered ? (
      <ol className="jd-ol">
        {b.items.map((it, i) => (
          <li key={i}>
            <span className="jd-num">{i + 1}</span>
            <span>{it}</span>
          </li>
        ))}
      </ol>
    ) : (
      <ul className="jd-ul">
        {b.items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    );
  return (
    <figure className="jd-fig">
      <div className="jd-tablewrap">
        <table className="jd-table">
          <thead>
            <tr>
              {b.head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {b.caption && <figcaption>{b.caption}</figcaption>}
    </figure>
  );
}

/** The page itself */
export function DocPage({ d }: { d: JDoc }) {
  return (
    <article className="jd">
      <header className="jd-head">
        <div className="jd-brand">
          <Mark size={28} />
          <span>Jagora</span>
          <span className="jd-kind">{d.kind}</span>
        </div>
        <h1 className="jd-title">{d.title}</h1>
        {d.subtitle && <p className="jd-sub">{d.subtitle}</p>}
        <p className="jd-meta">
          Prepared by Jagora · {date(d.created)} · {d.sources.length} sources
        </p>
      </header>
      <section className="jd-summary">
        <p className="jd-label">Summary</p>
        <ul>
          {d.summary.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </section>
      {d.blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
      <section className="jd-sources">
        <h2 className="jd-h">Sources</h2>
        <ol>
          {d.sources.map((s, i) => (
            <li key={s.url}>
              <span className="jd-num">{i + 1}</span>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
                <span>{host(s.url)}</span>
              </a>
            </li>
          ))}
        </ol>
      </section>
      <footer className="jd-foot">Made with Jagora, the voice-first browser for Nigeria</footer>
    </article>
  );
}

/** PDF: the same page, printed from a clean frame on its own, so the app around it never gets in the way */
async function printDoc(d: JDoc) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(f);
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join("");
  const w = f.contentWindow!;
  w.document.open();
  w.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="${location.origin}/"><title>${d.title.replace(/</g, "&lt;")}</title>${styles}` +
      `<style>html,body{background:#fff!important}body{margin:0}@page{size:A4;margin:14mm}.jd{padding:0 2mm}.jd-table tr,.jd-note,.jd-summary,.jd-ol li{break-inside:avoid}.jd-h{break-after:avoid}</style></head>` +
      `<body>${renderToStaticMarkup(<DocPage d={d} />)}</body></html>`,
  );
  w.document.close();
  await new Promise((r) => setTimeout(r, 120));
  await w.document.fonts?.ready;
  await Promise.all([...w.document.images].map((im) => (im.complete ? 0 : new Promise((r) => ((im.onload = r), (im.onerror = r))))));
  w.focus();
  w.print();
  setTimeout(() => f.remove(), 60000);
}

function Exports({ d, dark = false }: { d: JDoc; dark?: boolean }) {
  const [busy, setBusy] = useState(false);
  const cls = `flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition active:scale-95 ${dark ? "bg-white/10 text-white hover:bg-white/20" : "bg-black/5 text-ink hover:bg-black/10"}`;
  return (
    <div className="flex flex-wrap gap-1.5">
      <button className={cls} onClick={() => void printDoc(d)}>
        <FilePdf size={17} weight="fill" className="text-[#e5484d]" /> PDF
      </button>
      <button
        className={cls}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await downloadDocx(d).finally(() => setBusy(false));
        }}
      >
        <MicrosoftWordLogo size={17} weight="fill" className="text-[#2b5797]" /> {busy ? "Making…" : "Word"}
      </button>
      <button className={cls} onClick={() => downloadMarkdown(d)}>
        <FileText size={17} weight="fill" className="text-ink-2" /> Markdown
      </button>
    </div>
  );
}

/** Full-screen reader with the export buttons; only the page is printed */
export function DocViewer({ d, onClose }: { d: JDoc | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!d) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    document.documentElement.classList.add("jd-printing");
    return () => {
      removeEventListener("keydown", k);
      document.documentElement.classList.remove("jd-printing");
    };
  }, [d, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {d && (
        <motion.div className="jd-overlay fixed inset-0 z-[150] flex flex-col bg-[#e9edf3]/90 backdrop-blur-xl dark:bg-[#121418]/90" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="jd-bar flex items-center gap-2 px-3 pb-2 pt-[max(10px,env(safe-area-inset-top))] sm:px-5">
            <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-black/5 text-ink hover:bg-black/10" aria-label="Close">
              <X size={18} weight="bold" />
            </button>
            <p className="min-w-0 flex-1 truncate font-display text-[16px] font-bold tracking-[-0.02em] text-ink">{d.title}</p>
            <Exports d={d} />
          </div>
          <motion.div className="jd-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-10 pt-2 sm:px-6" initial={{ y: 40 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}>
            <div className="jd-sheet mx-auto max-w-[820px] rounded-[20px] bg-white shadow-[0_30px_80px_-40px_rgba(10,30,70,.45)] ring-1 ring-black/5">
              <DocPage d={d} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** The card in the conversation: a small preview of the first page */
export function DocCard({ d }: { d: JDoc }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="glass-3 overflow-hidden rounded-[24px]">
        <button onClick={() => setOpen(true)} className="relative block w-full text-left" aria-label={`Open ${d.title}`}>
          <div className="pointer-events-none h-[188px] overflow-hidden bg-white">
            <div className="origin-top-left scale-[0.42]" style={{ width: "238%" }}>
              <DocPage d={d} />
            </div>
          </div>
          <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
        </button>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-accent-soft text-accent">
              <DownloadSimple size={19} weight="bold" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[16px] font-bold leading-snug tracking-[-0.02em] text-ink">{d.title}</p>
              <p className="text-[13px] text-ink-3">
                {d.kind} · {d.sources.length} sources
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setOpen(true)} className="btn btn-ink h-10 px-4 text-[14px] font-semibold">
              Open
            </button>
            <Exports d={d} />
          </div>
        </div>
      </div>
      <DocViewer d={open ? d : null} onClose={() => setOpen(false)} />
    </>
  );
}
