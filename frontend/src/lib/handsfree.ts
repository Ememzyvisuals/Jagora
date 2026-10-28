"use client";
/* Hands-free talking. Tapping the orb (in the bottom bar, on home or in the chat) opens the microphone once and keeps
   it open until the orb is tapped again.
   - First choice: LiveKit (lib/livevoice.ts), as in Kivo: her voice streams to Jagora's voice worker, which hears
     where each turn ends, cuts Jagora off when she talks over it, and speaks Jagora's replies.
   - If LiveKit is not set up: the speech detector here (lib/turns.ts) hears her turns and sends each one. */
import { useEffect, useState } from "react";
import { voiceNote } from "./engine";
import { duckVoice, hush, remoteFocus } from "./engine/remote";
import { liveVoiceOn, onLiveVoice, startLiveVoice, stopLiveVoice, voiceLevels } from "./livevoice";
import { useApp } from "./store";
import { Listener } from "./turns";
import { blobToDataUrl } from "./voice";

let listener: Listener | null = null;
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
  if (starting) return starting;
  starting = (async () => {
    if (await startLiveVoice()) {
      void remoteFocus(ensureChat());
      clearInterval(levelTimer);
      levelTimer = window.setInterval(() => (micLevel.current = voiceLevels.me.current), 50);
      tell();
      return true;
    }
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
    if (!ok) return false;
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
  const l = listener;
  listener = null;
  clearInterval(levelTimer);
  micLevel.current = 0;
  if (liveVoiceOn()) await stopLiveVoice();
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

export function useHandsFree() {
  const [on, setOn] = useState(isHandsFree());
  useEffect(() => {
    subs.add(setOn);
    return () => void subs.delete(setOn);
  }, []);
  return on;
}

