/* Real headlines for Discover, in her language: BBC's Yorùbá, Hausa, Igbo and Pidgin services (English falls back to
   BBC Africa). Fetched on the server, cached for 20 minutes, trimmed to what the card needs. */
import { NextResponse } from "next/server";

export const revalidate = 1200;

const FEEDS: Record<string, string> = {
  yo: "https://feeds.bbci.co.uk/yoruba/rss.xml",
  ha: "https://feeds.bbci.co.uk/hausa/rss.xml",
  ig: "https://feeds.bbci.co.uk/igbo/rss.xml",
  pcm: "https://feeds.bbci.co.uk/pidgin/rss.xml",
  en: "https://feeds.bbci.co.uk/news/world/africa/rss.xml",
};

type Item = { title: string; link: string; image: string | null; date: string | null; source: string };

const pick = (xml: string, tag: string) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : null;
};
const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get("lang") || "en";
  const feed = FEEDS[lang] ?? FEEDS.en;
  try {
    const res = await fetch(feed, { next: { revalidate }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(String(res.status));
    const xml = await res.text();
    const source = decode(pick(xml, "title") || "BBC");
    const items: Item[] = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map(([, it]) => ({
      title: decode(pick(it, "title") || ""),
      link: pick(it, "link") || "",
      image: it.match(/<media:thumbnail[^>]*url="([^"]+)"/)?.[1] ?? null,
      date: pick(it, "pubDate"),
      source: source.replace(/ - BBC.*$/, "").trim() || "BBC",
    }));
    return NextResponse.json({ items: items.filter((i) => i.title && i.link) });
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
