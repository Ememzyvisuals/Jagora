"use client";

/* A song or video Jagora found, playing big in the middle of her screen (not squeezed into the chat).
   - Live mode folds down to its small bar and keeps listening. When she talks, the film goes quiet at once, pauses
     while Jagora deals with what she said, and plays on after (lib/sound.ts), unless she asked about the film.
   - Several videos: previews play one after another (a few seconds each), then she picks one to watch; Next and
     Previous move through the list (Jagora can do the same when she asks by voice).
   X closes it. */
import { CornersOut, Pause, Play, SkipBack, SkipForward, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { remoteMediaDone } from "@/lib/engine/remote";
import { forget, setYtLevel, watchYouTube, youTubeInfo, ytLevelNow } from "@/lib/sound";
import { mediaClock } from "@/lib/appctl";
import { useApp } from "@/lib/store";

const L: Record<"which" | "watch" | "preview", Record<Lang, string>> = {
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
  const [paused, setPaused] = useState(false);
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
    if (!previewing || !m?.preview || paused) return;
    const t = window.setTimeout(() => {
      if (at + 1 < items.length) st().setMediaAt(at + 1);
      else (setPreviewing(false), setChoosing(true), control("pause"));
    }, m.preview * 1000);
    return () => clearTimeout(t);
  }, [previewing, at, m?.preview, items.length, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const yt = (func: string, args: unknown = "") => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  const control = useCallback((what: "pause" | "play") => {
    if (vid.current) void (what === "pause" ? vid.current.pause() : vid.current.play().catch(() => undefined));
    yt(what === "pause" ? "pauseVideo" : "playVideo");
    setPaused(what === "pause");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** where the video is now and how long it is (seconds) */
  const where = () => {
    const v = vid.current;
    const y = youTubeInfo(frame.current?.contentWindow);
    return { time: v ? v.currentTime : y?.time ?? 0, length: v ? v.duration || 0 : y?.length ?? 0 };
  };
  /** "-10" back ten seconds, "+30" forward, "1:20" or "80" to that point */
  const seek = (value: string) => {
    const v = value.trim();
    const { time, length } = where();
    const secs = (x: string) => x.split(":").reduce((n, p) => n * 60 + (parseFloat(p) || 0), 0);
    let to = /%$/.test(v) && length ? (length * (parseFloat(v) || 0)) / 100 // "50%": half way
      : /^[+-]/.test(v) ? time + (v[0] === "-" ? -1 : 1) * secs(v.slice(1)) : secs(v);
    to = Math.max(0, length ? Math.min(to, length - 1) : to);
    if (vid.current) vid.current.currentTime = to;
    yt("seekTo", [to, true]);
  };
  // volume (0..100), speed, mute: the same for a YouTube player and a plain video
  const level = useRef(ytLevelNow());
  const rate = useRef(1);
  const quiet = useRef(false);
  const rel = (v: string, now: number) => (/^[+-]/.test(v.trim()) ? now + parseFloat(v) : parseFloat(v));
  const volume = (v: string) => {
    const to = Math.max(0, Math.min(100, Math.round(rel(v, level.current) || 0)));
    level.current = to;
    setYtLevel(to);
    if (vid.current) vid.current.volume = to / 100;
    yt("setVolume", [to]);
    if (to > 0 && quiet.current) mute(false);
  };
  const speed = (v: string) => {
    const allowed = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const want = rel(v, rate.current) || 1;
    const to = allowed.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a)); // YouTube takes these steps
    rate.current = to;
    if (vid.current) vid.current.playbackRate = to;
    yt("setPlaybackRate", [to]);
  };
  const mute = (on: boolean) => {
    quiet.current = on;
    if (vid.current) vid.current.muted = on;
    yt(on ? "mute" : "unMute");
  };
  // "make it full screen" by voice: the browser allows real full screen only from a tap, so the video fills the
  // whole window instead (the Full screen button still does the real one)
  const [big, setBig] = useState(false);
  // where it is, for Jagora ("how far am I", "louder")
  useEffect(() => {
    if (!cur) return;
    const t = window.setInterval(() => {
      const { time, length } = where();
      Object.assign(mediaClock, { time, length, paused, volume: level.current, muted: quiet.current, speed: rate.current, big });
    }, 1000);
    return () => clearInterval(t);
  }, [cur?.url, paused, big]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!m) Object.assign(mediaClock, { time: 0, length: 0, paused: false, big: false });
    setBig(false);
  }, [m?.id]);

  /** keep her place in this chat so "Continue watching" plays on from here */
  const keep = () => {
    const task = st().activeId;
    if (!task || !cur || choosing || previewing) return false;
    const { time, length } = where();
    if (time < 5 || (length > 0 && time > length - 15)) return false;
    st().setResume(task, { name: cur.name, url: cur.url, type: cur.type, source: cur.source, at: time, length });
    return true;
  };
  const keepRef = useRef(keep);
  keepRef.current = keep;
  // Jagora pauses, plays, moves or saves it when she asks
  useEffect(() => {
    const on = (e: Event) => {
      const d = String((e as CustomEvent<string>).detail ?? "");
      if (d.startsWith("seek:")) return seek(d.slice(5));
      const cut = d.indexOf(":");
      const cmd = cut < 0 ? d : d.slice(0, cut);
      const arg = cut < 0 ? "" : d.slice(cut + 1);
      if (cmd === "volume") return volume(arg);
      if (cmd === "speed") return speed(arg);
      if (cmd === "mute" || cmd === "unmute") return mute(cmd === "mute");
      if (cmd === "big") return setBig(!/^(off|no|false|small)$/i.test(arg.trim()));
      if (cmd === "restart") return seek("0");
      if (d === "save") {
        control("pause");
        keepRef.current();
        return void window.setTimeout(() => st().setPlaying(null), 300);
      }
      control(d === "pause" ? "pause" : "play");
    };
    window.addEventListener("jagora:media", on);
    return () => window.removeEventListener("jagora:media", on);
  }, [control]); // eslint-disable-line react-hooks/exhaustive-deps
  // continuing a saved video: start where she stopped (taken once for this video, then cleared)
  const startFor = useRef<string | undefined>(undefined);
  const startRef = useRef(0);
  if (startFor.current !== m?.id) {
    startFor.current = m?.id;
    startRef.current = m ? st().startAt : 0;
  }
  const startAt = startRef.current;
  useEffect(() => {
    if (m && st().startAt) st().setStartAt(0);
  }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const srcOf = (url: string) => (startAt && at === 0 ? url + (url.includes("?") ? "&" : "?") + `start=${Math.floor(startAt)}` : url);
  // she watched to the end: nothing left to continue
  useEffect(() => {
    if (!cur) return;
    const t = window.setInterval(() => {
      const { time, length } = where();
      const task = st().activeId;
      if (task && length > 0 && time > length - 15 && st().resume[task]?.url === cur.url) st().setResume(task, null);
    }, 5000);
    return () => clearInterval(t);
  }, [cur?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  // a course: all its lessons are listed in her progress from the start
  useEffect(() => {
    if (!m?.course) return;
    for (const it of items) st().learnTick(m.course, { name: it.name, url: it.url }, 0, 0);
  }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // a course: every 5 s of watching counts toward the lesson; when a lesson ends Jagora offers practice
  const doneFor = useRef("");
  useEffect(() => {
    if (!m?.course || !cur) return;
    const course = m.course;
    const t = window.setInterval(() => {
      const v = vid.current;
      const y = youTubeInfo(frame.current?.contentWindow);
      const playing = v ? !v.paused : !!y?.playing;
      const time = v ? v.currentTime : y?.time ?? 0;
      const length = v ? v.duration || 0 : y?.length ?? 0;
      if (playing) st().learnTick(course, { name: cur.name, url: cur.url }, 5, length);
      const ended = (v ? v.ended : !!y?.ended) || (length > 60 && time >= length - 8);
      if (ended && doneFor.current !== cur.url) {
        doneFor.current = cur.url;
        st().learnDone(course, cur.url);
        const c = st().courses[course];
        const task = st().activeId;
        if (task && c)
          void remoteMediaDone(task, {
            name: cur.name,
            course,
            minutes: Math.round(c.lessons.reduce((n, l) => n + l.watched, 0) / 60),
            done: c.lessons.filter((l) => l.done).length,
            total: Math.max(c.lessons.length, items.length),
            next: items[at + 1]?.name,
          });
      }
    }, 5000);
    return () => clearInterval(t);
  }, [m?.course, cur?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // her own pause and play: Jagora then leaves it as she set it
  const toggle = () => {
    forget();
    control(paused ? "play" : "pause");
  };
  useEffect(() => setPaused(false), [cur?.url]);

  // full screen (phones turn sideways for it where they can)
  const box = useRef<HTMLDivElement>(null);
  const full = async () => {
    const el = (frame.current ?? vid.current ?? box.current) as HTMLElement | null;
    if (big) return setBig(false); // filling the window by voice: the button brings it back
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el?.requestFullscreen?.();
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await o?.lock?.("landscape").catch(() => undefined);
    } catch {}
  };
  const close = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    keep(); // closed in the middle: she can continue it later in this chat
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
          className={`fixed inset-0 z-[70] grid place-items-center backdrop-blur-[6px] ${big ? "bg-black px-0" : "bg-[rgba(8,12,20,.86)] px-2 sm:px-4"}`}
        >
          <div ref={box} className={`w-full bg-transparent ${big ? "max-w-none" : "max-w-[1100px]"}`}>
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
              <button onClick={toggle} className={btn} aria-label={paused ? "Play" : "Pause"}>
                {paused ? <Play size={18} weight="fill" /> : <Pause size={18} weight="fill" />}
              </button>
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
                  ref={(f) => {
                    frame.current = f;
                    watchYouTube(f);
                  }}
                  src={srcOf(cur.url)}
                  title={cur.name}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  className={big ? "h-[calc(100dvh-72px)] w-full bg-black" : "aspect-video w-full rounded-[14px] bg-black sm:rounded-[18px]"}
                />
              ) : isVideo ? (
                <video
                  key={cur.url}
                  ref={vid}
                  src={cur.url}
                  onLoadedMetadata={(e) => {
                    if (startAt && at === 0) e.currentTarget.currentTime = startAt;
                  }}
                  controls
                  autoPlay
                  playsInline className={big ? "h-[calc(100dvh-72px)] w-full bg-black object-contain" : "max-h-[72vh] w-full rounded-[14px] bg-black sm:rounded-[18px]"} />
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
