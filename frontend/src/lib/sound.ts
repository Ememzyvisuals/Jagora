"use client";
/* Everything that makes sound on her screen (the player, a song, a video in the chat, any audio or video on the
   page of the app) gives way when she talks to Jagora:
   - duck: she started speaking: everything goes quiet at once (volume down), so the microphone hears her
   - hold: her words became a message: everything playing pauses while Jagora deals with it
   - release: done: what was paused plays on, unless what she said was about it (Jagora paused, closed or changed it,
     or she paused it herself), then it is left alone
   - unduck: it was only a noise: the volume comes back
   Jagora's own voice is not touched here (it stops by itself when she talks over it). */

type Held = { resume: () => void };

const QUIET = 0.15;
/** the YouTube volume she chose (0..100): ducking goes back to this, not to full */
let ytLevel = 100;
export const setYtLevel = (v: number) => (ytLevel = Math.max(0, Math.min(100, Math.round(v))));
export const ytLevelNow = () => ytLevel;
let held: Held[] = [];
let ducked: { el: HTMLMediaElement; volume: number }[] = [];
let duckedFrames: HTMLIFrameElement[] = [];

const isJagoraVoice = (el: Element) => el.hasAttribute("data-jagora-voice");
const players = () => [...document.querySelectorAll<HTMLMediaElement>("video, audio")].filter((el) => !isJagoraVoice(el));
const ytFrames = () => [...document.querySelectorAll<HTMLIFrameElement>("iframe")].filter((f) => /youtube(-nocookie)?\.com\/embed/.test(f.src));
const yt = (f: HTMLIFrameElement, func: string, args: unknown = "") =>
  f.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");

/* YouTube players tell whether they are playing, where they are and how long the video is (with enablejsapi=1,
   after we say "listening") */
export type YtInfo = { playing: boolean; ended: boolean; time: number; length: number };
const ytInfo = new WeakMap<Window, YtInfo>();
const ytPlaying = { get: (w: Window) => ytInfo.get(w)?.playing };
export const youTubeInfo = (w: Window | null | undefined) => (w ? ytInfo.get(w) : undefined);
if (typeof window !== "undefined")
  window.addEventListener("message", (e) => {
    if (typeof e.data !== "string" || !/youtube/.test(e.origin) || !e.source) return;
    try {
      const d = JSON.parse(e.data) as { event?: string; info?: { playerState?: number; currentTime?: number; duration?: number } | number };
      const w = e.source as Window;
      const was = ytInfo.get(w) ?? { playing: false, ended: false, time: 0, length: 0 };
      const info = typeof d.info === "object" && d.info ? d.info : {};
      const state = typeof d.info === "number" && d.event === "onStateChange" ? d.info : info.playerState;
      ytInfo.set(w, {
        playing: state !== undefined ? state === 1 : was.playing,
        ended: state !== undefined ? state === 0 : was.ended,
        time: info.currentTime ?? was.time,
        length: info.duration ?? was.length,
      });
    } catch {}
  });
/** ask a YouTube frame to report its state (called when the player loads) */
const watched = new WeakSet<HTMLIFrameElement>();
export function watchYouTube(f: HTMLIFrameElement | null) {
  if (!f || watched.has(f)) return;
  watched.add(f);
  const hello = () => f.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "jagora" }), "*");
  f.addEventListener("load", () => setTimeout(hello, 400));
}

export function duck() {
  if (typeof document === "undefined" || ducked.length || duckedFrames.length) return;
  for (const el of players()) {
    if (el.paused) continue;
    ducked.push({ el, volume: el.volume });
    el.volume = Math.min(el.volume, QUIET);
  }
  for (const f of ytFrames()) {
    duckedFrames.push(f);
    yt(f, "setVolume", [Math.min(15, ytLevel)]);
  }
}

export function unduck() {
  for (const { el, volume } of ducked) if (el.volume <= QUIET + 0.001) el.volume = volume; // unless the volume was changed meanwhile
  for (const f of duckedFrames) yt(f, "setVolume", [ytLevel]);
  ducked = [];
  duckedFrames = [];
}

export function hold() {
  if (typeof document === "undefined") return;
  for (const el of players()) {
    if (el.paused) continue;
    el.pause();
    held.push({ resume: () => void el.play().catch(() => undefined) });
  }
  for (const f of ytFrames()) {
    const w = f.contentWindow;
    if (w && ytPlaying.get(w) === false) continue; // already paused by her
    yt(f, "pauseVideo");
    held.push({ resume: () => yt(f, "playVideo") });
  }
  unduck();
}

export function release() {
  const h = held;
  held = [];
  unduck();
  for (const x of h) x.resume();
}

/** what she or Jagora did to the sound (pause, close, a new video): nothing paused is played again on its own */
export function forget() {
  held = [];
}
