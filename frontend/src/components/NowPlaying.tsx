"use client";

/* A song or video Jagora found, playing big in the middle of her screen (not squeezed into the chat).
   - Live mode folds down to its small bar and its microphone is off while this plays, so the film's sound is never
     taken for her voice. Talk pauses the film and turns the microphone on; Resume (or 15 s of quiet) plays it again.
   - Several videos: previews play one after another (a few seconds each), then she picks one to watch; Next and
     Previous move through the list (Jagora can do the same when she asks by voice).
   X closes it. */
import { CornersOut, Microphone, Play, SkipBack, SkipForward, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { useApp } from "@/lib/store";

const L: Record<"talk" | "resume" | "which" | "watch" | "preview", Record<Lang, string>> = {
  talk: { en: "Talk", pcm: "Talk", yo: "Sọ̀rọ̀", ha: "Yi magana", ig: "Kwuo" },
  resume: { en: "Resume", pcm: "Continue", yo: "Tẹ̀síwájú", ha: "Ci gaba", ig: "Gaa n'ihu" },
  which: { en: "Which one do you want to watch?", pcm: "Which one you wan watch?", yo: "Èwo ni ẹ fẹ́ wò?", ha: "Wanne kake so ka kalla?", ig: "Kedu nke ị chọrọ ikiri?" },
  watch: { en: "Watch", pcm: "Watch", yo: "Wò ó", ha: "Kalla", ig: "Kiri" },
  preview: { en: "Preview", pcm: "Preview", yo: "Àyẹ̀wò", ha: "Samfoti", ig: "Nlele" },
};

const host = (src?: string) => {
  try {
    return src ? new URL(src, "https://x.invalid").hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

export function NowPlaying() {
  const m = useApp((s) => s.playing);
  const at = useApp((s) => s.mediaAt);
  const talkOver = useApp((s) => s.talkOver);
  const lang = useApp((s) => s.lang);
  const st = useApp.getState;
  const frame = useRef<HTMLIFrameElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const items = m?.queue?.length ? m.queue : m ? [{ name: m.name, url: m.url, type: m.type, source: m.source }] : [];
  const cur = items[Math.min(at, items.length - 1)];
  // previews: each plays a few seconds, then the next; after the last she chooses
  const [previewing, setPreviewing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    setPreviewing(!!m?.preview && items.length > 1);
    setChoosing(false);
  }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!previewing || !m?.preview || talkOver) return;
    const t = window.setTimeout(() => {
      if (at + 1 < items.length) st().setMediaAt(at + 1);
      else (setPreviewing(false), setChoosing(true), control("pause"));
    }, m.preview * 1000);
    return () => clearTimeout(t);
  }, [previewing, at, m?.preview, items.length, talkOver]); // eslint-disable-line react-hooks/exhaustive-deps

  const control = useCallback((what: "pause" | "play") => {
    if (vid.current) void (what === "pause" ? vid.current.pause() : vid.current.play().catch(() => undefined));
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: what === "pause" ? "pauseVideo" : "playVideo", args: "" }), "*");
  }, []);
  // Jagora pauses or plays it when she asks
  useEffect(() => {
    const on = (e: Event) => control((e as CustomEvent<string>).detail === "pause" ? "pause" : "play");
    window.addEventListener("jagora:media", on);
    return () => window.removeEventListener("jagora:media", on);
  }, [control]);
  // Talk: the film pauses, the microphone opens; it plays again on Resume, or after 15 s once Jagora is not busy
  const talk = () => (control("pause"), st().setTalkOver(true));
  const resume = useCallback(() => (control("play"), st().setTalkOver(false)), [control, st]);
  useEffect(() => {
    if (!talkOver) return;
    const t = window.setInterval(() => {
      const o = st().orb;
      if (o === "idle" || o === "listening") resume();
    }, 15000);
    return () => clearInterval(t);
  }, [talkOver, resume, st]);

  // the first 30 s of each video: Jagora keeps listening, with the film at lower volume, so she can say "next" or
  // "I don't like this one"; after that the microphone rests until she taps Talk
  useEffect(() => {
    if (!cur) return;
    st().setMediaListen(true);
    const quiet = window.setTimeout(() => {
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [35] }), "*");
      if (vid.current) vid.current.volume = 0.35;
    }, 1500);
    const t = window.setTimeout(() => {
      st().setMediaListen(false);
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [100] }), "*");
      if (vid.current) vid.current.volume = 1;
    }, 30000);
    return () => (clearTimeout(t), clearTimeout(quiet), st().setMediaListen(false));
  }, [cur?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // full screen (phones turn sideways for it where they can)
  const box = useRef<HTMLDivElement>(null);
  const full = async () => {
    const el = (frame.current ?? vid.current ?? box.current) as HTMLElement | null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el?.requestFullscreen?.();
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await o?.lock?.("landscape").catch(() => undefined);
    } catch {}
  };
  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    st().setPlaying(null);
  };
  const pick = (i: number) => (setChoosing(false), setPreviewing(false), st().setMediaAt(i));
  const isVideo = !!cur && (cur.type === "youtube" || cur.type.startsWith("video") || /\.(mp4|webm|mov)$/i.test(cur.name));
  const btn = "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-95 disabled:opacity-30";
  return (
    <AnimatePresence>
      {m && cur && (
        <motion.div
          key={m.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(8,12,20,.86)] px-2 backdrop-blur-[6px] sm:px-4"
        >
          <div ref={box} className="w-full max-w-[1100px] bg-transparent">
            {/* phones: the title on its own line, the buttons under it; computers: one line */}
            <div className="mb-3 flex flex-wrap items-center gap-2 px-1 pt-[env(safe-area-inset-top)]">
              <p className="w-full min-w-0 truncate text-[15px] font-semibold text-white sm:w-auto sm:flex-1 sm:text-[16px]">
                {previewing && <span className="mr-2 rounded-full bg-white/20 px-2 py-0.5 text-[12px]">{L.preview[lang]} {at + 1}/{items.length}</span>}
                {cur.name}
              </p>
              {items.length > 1 && (
                <>
                  <button onClick={() => st().setMediaAt(at - 1)} disabled={at === 0} className={btn} aria-label="Previous">
                    <SkipBack size={18} weight="fill" />
                  </button>
                  <button onClick={() => st().setMediaAt(at + 1)} disabled={at >= items.length - 1} className={btn} aria-label="Next">
                    <SkipForward size={18} weight="fill" />
                  </button>
                </>
              )}
              {talkOver ? (
                <button onClick={resume} className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-semibold text-ink transition active:scale-95">
                  <Play size={16} weight="fill" /> {L.resume[lang]}
                </button>
              ) : (
                <button onClick={talk} className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-semibold text-ink transition active:scale-95">
                  <Microphone size={16} weight="fill" /> {L.talk[lang]}
                </button>
              )}
              <button onClick={full} className={btn} aria-label="Full screen">
                <CornersOut size={18} weight="bold" />
              </button>
              <button onClick={close} aria-label="Close the player" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink transition active:scale-95">
                <X size={18} weight="bold" />
              </button>
            </div>
            <div className="relative">
              {cur.type === "youtube" ? (
                <iframe
                  key={cur.url}
                  ref={frame}
                  src={cur.url}
                  title={cur.name}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="aspect-video w-full rounded-[14px] bg-black sm:rounded-[18px]"
                />
              ) : isVideo ? (
                <video key={cur.url} ref={vid} src={cur.url} controls autoPlay playsInline className="max-h-[72vh] w-full rounded-[14px] bg-black sm:rounded-[18px]" />
              ) : (
                <div className="rounded-[18px] bg-white p-4">
                  <audio key={cur.url} src={cur.url} controls autoPlay className="w-full" />
                </div>
              )}
              {choosing && (
                <div className="absolute inset-0 grid place-items-center rounded-[18px] bg-[rgba(8,12,20,.82)] p-4">
                  <div className="w-full max-w-[520px]">
                    <p className="mb-3 text-center text-[18px] font-semibold text-white">{L.which[lang]}</p>
                    {items.map((q, i) => (
                      <button key={q.url} onClick={() => pick(i)} className="mb-2 flex w-full items-center gap-3 rounded-[16px] bg-white/10 px-4 py-3 text-left text-white transition hover:bg-white/20">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[14px] font-bold text-ink">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{q.name}</span>
                        <span className="shrink-0 text-[13px] font-semibold text-white/80">{L.watch[lang]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {host(cur.source) && <p className="mt-2 truncate text-[12.5px] text-white/70">{host(cur.source)}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
