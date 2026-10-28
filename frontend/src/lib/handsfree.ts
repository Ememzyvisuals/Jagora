"use client";
/* Hands-free talking outside Live mode. Tapping the orb (in the bottom bar or in the chat) opens the microphone once and
   keeps it open: the speech detector (lib/turns.ts) hears where each of her turns ends and sends it, and when she talks
   over Jagora it lowers Jagora's voice, then stops it. Tap the orb again to stop listening. */
import { useEffect, useState } from "react";
import { voiceNote } from "./engine";
import { hush, duckVoice } from "./engine/remote";
import { useApp } from "./store";
import { Listener } from "./turns";
import { blobToDataUrl } from "./voice";

let listener: Listener | null = null;
let starting: Promise<boolean> | null = null;
const subs = new Set<(on: boolean) => void>();
/** her voice level 0..1 while listening (the orb's edge and bounce follow it) */
export const micLevel = { current: 0 };
let levelTimer = 0;

function tell() {
  subs.forEach((f) => f(!!listener));
}

export function isHandsFree() {
  return !!listener;
}

export async function startHandsFree(): Promise<boolean> {
  if (listener) return true;
  if (starting) return starting;
  starting = (async () => {
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
  if (useApp.getState().orb === "listening") useApp.getState().setOrb("idle");
  tell();
  await l?.destroy();
}

// Jagora talking or not: the detector needs to know (her voice must be clearly louder than the echo to cut in)
if (typeof window !== "undefined") {
  useApp.subscribe((s, prev) => {
    if (!listener || s.orb === prev.orb) return;
    listener.setAgentTalking(s.orb === "speaking");
    // back to listening when Jagora has finished
    if (s.orb === "idle") queueMicrotask(() => listener && useApp.getState().orb === "idle" && useApp.getState().setOrb("listening"));
  });
  useApp.subscribe((s, prev) => {
    if (s.live && !prev.live) void stopHandsFree(); // Live mode takes the microphone
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
