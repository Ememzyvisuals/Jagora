"use client";
/* Hands-free talking. Tapping the orb (in the bottom bar, on home or in the chat) opens the microphone once and keeps
   it open until the orb is tapped again.
   - First choice: LiveKit (lib/livevoice.ts), as in Kivo: her voice streams to Jagora's voice worker, which hears
     where each turn ends, cuts Jagora off when she talks over it, and speaks Jagora's replies.
   - If LiveKit is not set up: the speech detector here (lib/turns.ts) hears her turns and sends each one. */
import { useEffect, useState } from "react";
import { voiceNote } from "./engine";
import { clientLog, duckVoice, hush, remoteFocus, remoteWake } from "./engine/remote";
import { liveVoiceLost, liveVoiceOn, onLiveVoice, setLiveMic, startLiveVoice, stopLiveVoice, voiceLevels } from "./livevoice";
import { useApp } from "./store";
import { Listener } from "./turns";
import { blobToDataUrl } from "./voice";

let listener: Listener | null = null;
let wanted = false; // false once she turns it off: a start still on its way is undone when it lands
let starting: Promise<boolean> | null = null;
const subs = new Set<(on: boolean) => void>();
/** her voice level 0..1 while listening (the orb's edge and bounce follow it) */
export const micLevel = { current: 0 };
/** Jagora's voice level 0..1 when it comes through LiveKit (else the app's own speaking pulse is used) */
export const jagoraLevel = voiceLevels.jagora;
let levelTimer = 0;

function tell() {
  subs.forEach((f) => f(isHandsFree()));
}

export function isHandsFree() {
  return !!listener || liveVoiceOn();
}
export const throughLiveKit = () => liveVoiceOn();

/** Microphone off (true) or back on, without ending: nothing she says is heard while it is off. */
export async function muteHandsFree(off: boolean) {
  clientLog("mute", { off });
  if (listener) {
    if (off) listener.pause();
    else listener.resume();
  }
  if (liveVoiceOn()) await setLiveMic(!off);
  micLevel.current = 0;
}

/** The chat Jagora's voice talks into: the open one, or a new one. */
function ensureChat(): string {
  const s = useApp.getState();
  if (s.activeId && s.tasks.some((t) => t.id === s.activeId)) return s.activeId;
  const id = s.newTask({ title: { en: "Voice", pcm: "Voice", yo: "Ohùn", ha: "Murya", ig: "Olu" }[s.lang] ?? "Voice", kind: "browse", url: "" });
  s.setActive(id);
  return id;
}

export async function startHandsFree(): Promise<boolean> {
  if (isHandsFree()) return true;
  wanted = true;
  if (starting) return starting;
  starting = (async () => {
    await remoteWake(); // her session must exist on the server before Jagora's voice joins the call
    if (await startLiveVoice()) {
      if (!wanted) {
        await stopLiveVoice();
        return false;
      }
      void remoteFocus(ensureChat());
      clearInterval(levelTimer);
      levelTimer = window.setInterval(() => (micLevel.current = voiceLevels.me.current), 50);
      tell();
      return true;
    }
    // Live mode runs its own listener when LiveKit is not available: never two at once
    if (useApp.getState().live) return false;
    const l = new Listener({
      onTurn: async (wav, secs) => {
        const s = useApp.getState();
        if (s.live) return; // Live mode has its own listener
        s.setOrb("thinking");
        voiceNote(wav, await blobToDataUrl(wav), secs, { chat: s.activeId ?? undefined });
      },
      onBarge: (stop) => {
        if (stop) {
          hush();
          useApp.getState().setOrb("listening");
        } else duckVoice(0.2);
      },
      onFalseAlarm: () => duckVoice(1),
      onSpeaking: (on) => on && useApp.getState().orb !== "speaking" && useApp.getState().setOrb("listening"),
    });
    const ok = await l.start();
    clientLog("listener", { started: ok, note: "LiveKit not used: the app's own speech detector listens" });
    if (!ok) return false;
    if (!wanted) {
      await l.destroy();
      return false;
    }
    listener = l;
    l.setAgentTalking(useApp.getState().orb === "speaking");
    levelTimer = window.setInterval(() => (micLevel.current = l.level.current), 50);
    const o = useApp.getState().orb;
    if (o === "idle") useApp.getState().setOrb("listening");
    tell();
    return true;
  })();
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

export async function stopHandsFree() {
  wanted = false;
  const l = listener;
  listener = null;
  clearInterval(levelTimer);
  micLevel.current = 0;
  await stopLiveVoice(); // also drops a call that is still connecting
  if (useApp.getState().orb === "listening") useApp.getState().setOrb("idle");
  tell();
  await l?.destroy();
}

if (typeof window !== "undefined") {
  onLiveVoice(() => tell());
  // Jagora talking or not: the detector needs to know (her voice must be clearly louder than the echo to cut in)
  useApp.subscribe((s, prev) => {
    if (!listener || s.orb === prev.orb) return;
    listener.setAgentTalking(s.orb === "speaking");
    // back to listening when Jagora has finished
    if (s.orb === "idle") queueMicrotask(() => listener && useApp.getState().orb === "idle" && useApp.getState().setOrb("listening"));
  });
  useApp.subscribe((s, prev) => {
    // Live mode takes the microphone, unless the voice is already on LiveKit (then Live mode uses it too)
    if (s.live && !prev.live && listener) {
      const l = listener;
      listener = null;
      clearInterval(levelTimer);
      void l.destroy();
      tell();
    }
    // Jagora's voice talks into the chat she has open
    if (liveVoiceOn() && s.activeId && (s.activeId !== prev.activeId || s.lang !== prev.lang)) void remoteFocus(s.activeId);
  });
}

/** The live call dropped by itself; null when all is well. */
export function useVoiceLost() {
  const [lost, setLost] = useState(liveVoiceLost());
  useEffect(() => onLiveVoice(() => setLost(liveVoiceLost())), []);
  return lost;
}

/** Back into the call after it dropped: same chat, same language, and Jagora is told where she is (the screen,
    what is playing, what it was doing), so it carries on from there. */
export async function reconnectVoice(): Promise<boolean> {
  clientLog("reconnect_tapped");
  const ok = await startHandsFree();
  const id = useApp.getState().activeId;
  if (ok && id) void remoteFocus(id);
  clientLog("reconnected", { ok });
  return ok;
}

export function useHandsFree() {
  const [on, setOn] = useState(isHandsFree());
  useEffect(() => {
    subs.add(setOn);
    return () => void subs.delete(setOn);
  }, []);
  return on;
}

