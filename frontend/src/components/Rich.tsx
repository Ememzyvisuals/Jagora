"use client";

/* Chat text with simple formatting: **bold**, *italic*, `code`, lists, short headings, quotes, and links that can be
   tapped ([name](address), or a bare address, shown short). It builds React elements (never raw HTML), and only web
   addresses (http, https) become links, so a message can never run code or open anything else.

   tone "dark": text on the dark bubble (her own messages); "light": everywhere else. */
import { Fragment, type ReactNode } from "react";

type Tone = "light" | "dark";

const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|www\.)[^)\s]+)\)|((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?'"])/g;

/** an address, short enough for a chat line: the site and the start of the path */
export function shortUrl(href: string): string {
  const u = href.replace(/^https?:\/\/(www\.)?/, "").replace(/^www\./, "");
  const [host, ...rest] = u.split("/");
  const path = rest.join("/");
  if (!path) return host;
  return path.length > 18 ? `${host}/${path.slice(0, 16)}…` : `${host}/${path}`;
}

/** the same text without formatting marks, for one-line previews (chat list, tab cards): link names stay, bare
    addresses are shortened */
export function plain(text: string): string {
  return (text || "")
    .replace(/\[([^\]\n]+)\]\((?:https?:\/\/|www\.)[^)\s]+\)/g, "$1")
    .replace(/(?:https?:\/\/|www\.)[^\s<>()]+/g, (u) => shortUrl(u))
    .replace(/^\s*(?:[-*+•]|\d+[.)]|#{1,6}|>)\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|[^\w*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

const safe = (href: string) => {
  const h = href.startsWith("www.") ? `https://${href}` : href;
  try {
    const u = new URL(h);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
};

function emphasis(text: string, key: string): ReactNode[] {
  // **bold**, __bold__, *italic*, _italic_, `code` (no nesting: chat messages are short)
  const out: ReactNode[] = [];
  // (no lookbehind: older iPhones cannot read it; the character before an italic mark is captured instead)
  const re = /\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|(^|[^\w*])\*([^*\n]+)\*(?![\w*])|(^|[^\w_])_([^_\n]+)_(?![\w_])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}e${i++}`;
    if (m[1] ?? m[2]) out.push(<strong key={k} className="font-semibold">{m[1] ?? m[2]}</strong>);
    else if (m[3]) out.push(<code key={k} className="rounded-[6px] bg-black/[.07] px-1 py-px font-mono text-[.9em] dark:bg-white/10">{m[3]}</code>);
    else {
      const before = m[4] ?? m[6] ?? "";
      if (before) out.push(before);
      out.push(<em key={k}>{m[5] ?? m[7]}</em>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function inline(text: string, tone: Tone, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  LINK.lastIndex = 0;
  while ((m = LINK.exec(text))) {
    if (m.index > last) out.push(...emphasis(text.slice(last, m.index), `${key}t${i}`));
    const label = m[1];
    const href = safe(m[2] ?? m[3]);
    const k = `${key}l${i++}`;
    if (href)
      out.push(
        <a
          key={k}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`break-words font-medium underline decoration-1 underline-offset-[3px] ${tone === "dark" ? "text-paper decoration-paper/60" : "text-accent decoration-accent/40"}`}
        >
          {label ? emphasis(label, k) : shortUrl(m[3])}
        </a>,
      );
    else out.push(m[0]);
    last = LINK.lastIndex;
  }
  if (last < text.length) out.push(...emphasis(text.slice(last), `${key}t${i}`));
  return out;
}

type Block = { kind: "p" | "h" | "quote"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const prev = out.at(-1);
    const ul = line.match(/^\s*[-*+•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const h = line.match(/^\s*#{1,6}\s+(.*)$/);
    const q = line.match(/^\s*>\s?(.*)$/);
    if (!line.trim()) {
      out.push({ kind: "p", lines: [] }); // a blank line starts a new paragraph
    } else if (ul) {
      if (prev?.kind === "ul") prev.items.push(ul[1]);
      else out.push({ kind: "ul", items: [ul[1]] });
    } else if (ol) {
      if (prev?.kind === "ol") prev.items.push(ol[1]);
      else out.push({ kind: "ol", items: [ol[1]] });
    } else if (h) {
      out.push({ kind: "h", lines: [h[1]] });
    } else if (q) {
      if (prev?.kind === "quote") prev.lines.push(q[1]);
      else out.push({ kind: "quote", lines: [q[1]] });
    } else if (prev?.kind === "p") {
      prev.lines.push(line);
    } else {
      out.push({ kind: "p", lines: [line] });
    }
  }
  return out.filter((b) => ("lines" in b ? b.lines.length : b.items.length));
}

export function Rich({ text, tone = "light", className = "" }: { text: string; tone?: Tone; className?: string }) {
  const bs = blocks(text || "");
  return (
    <div className={`flex flex-col gap-2 [overflow-wrap:anywhere] ${className}`}>
      {bs.map((b, i) => {
        const k = `b${i}`;
        if (b.kind === "ul" || b.kind === "ol") {
          const List = b.kind === "ul" ? "ul" : "ol";
          return (
            <List key={k} className={`flex flex-col gap-1 pl-5 ${b.kind === "ul" ? "list-disc" : "list-decimal"}`}>
              {b.items.map((it, j) => (
                <li key={j} className="pl-0.5">
                  {inline(it, tone, `${k}i${j}`)}
                </li>
              ))}
            </List>
          );
        }
        const lines = (b as Extract<Block, { lines: string[] }>).lines;
        const content = lines.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l, tone, `${k}l${j}`)}
          </Fragment>
        ));
        if (b.kind === "h") return <p key={k} className="font-semibold">{content}</p>;
        if (b.kind === "quote")
          return (
            <blockquote key={k} className={`border-l-[3px] pl-3 ${tone === "dark" ? "border-paper/40" : "border-ink/15"} opacity-90`}>
              {content}
            </blockquote>
          );
        return <p key={k}>{content}</p>;
      })}
    </div>
  );
}
