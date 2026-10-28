"use client";
/* Talking to Jagora through LiveKit, the way Kivo's voice works: her phone joins a room and publishes its
   microphone (WebRTC, with the phone's own echo cancelling), and Jagora's voice worker (backend/voice/agent.py) joins
   it: STORM ASR streamed while she talks, STORM TTS back, and LiveKit's turn taking (talk over Jagora and it stops).
   The words still go through Jagora's server, so the chat, the browsing and the safety checks are the same. */
import type { Room } from "livekit-client";
import { API, getToken } from "./account";
import { clientLog } from "./engine/remote";
import { useApp } from "./store";

let room: Room | null = null;
let wanted = false; // false once she ends the call: a join still on its way is dropped when it lands
let joining: Promise<boolean> | null = null;
let poll = 0;
const subs = new Set<(on: boolean) => void>();
/** her voice and Jagora's, 0..1, for the orb */
export const voiceLevels = { me: { current: 0 }, jagora: { current: 0 } };

const tell = () => subs.forEach((f) => f(!!room));
export const liveVoiceOn = () => !!room;
/** The call dropped by itself (network, the phone sleeping): not ended by her. Live mode offers Reconnect. */
let lost = false;
export const liveVoiceLost = () => lost;

export function onLiveVoice(f: (on: boolean) => void) {
  subs.add(f);
  return () => void subs.delete(f);
}

/** Join her LiveKit room with Jagora's voice in it. False when LiveKit is not set up on the server (the app then
    listens the older way). */
export async function startLiveVoice(): Promise<boolean> {
  if (room) return true;
  wanted = true;
  if (joining) return joining;
  joining = (async () => {
    if (!API || !getToken()) return false;
    try {
      const r = await fetch(`${API}/livekit/token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lang: useApp.getState().lang }),
      });
      if (!r.ok) {
        clientLog("livekit_token_failed", { status: r.status });
        return false;
      }
      const d = (await r.json()) as { url: string; token: string; voice?: boolean };
      if (!d.url || !d.token || !d.voice) {
        clientLog("livekit_not_set_up", { voice: !!d.voice });
        return false;
      }
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const rm = new Room({ adaptiveStream: true, dynacast: true });
      rm.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach();
        el.dataset.jagoraVoice = "";
        document.body.appendChild(el);
      });
      rm.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
      rm.on(RoomEvent.ParticipantConnected, (p) => clientLog("livekit_joined", { who: p.identity }));
      rm.on(RoomEvent.ParticipantDisconnected, (p) => clientLog("livekit_left", { who: p.identity }));
      rm.on(RoomEvent.Disconnected, (reason) => {
        clientLog("livekit_disconnected", { reason: String(reason ?? ""), by_her: !wanted });
        if (room === rm) {
          const dropped = wanted; // she did not end it
          void stopLiveVoice().then(() => {
            lost = dropped;
            tell();
          });
        }
      });
      await rm.connect(d.url, d.token);
      if (!wanted) {
        await rm.disconnect(); // she ended the call while it was connecting
        return false;
      }
      await rm.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      room = rm;
      lost = false;
      clientLog("livekit_connected", { room: rm.name, others: rm.remoteParticipants.size });
      // the orb follows whoever is talking
      poll = window.setInterval(() => {
        const me = rm.localParticipant.audioLevel || 0;
        let them = 0;
        rm.remoteParticipants.forEach((p) => (them = Math.max(them, p.audioLevel || 0)));
        voiceLevels.me.current = Math.min(1, me * 2.2);
        voiceLevels.jagora.current = Math.min(1, them * 2.2);
      }, 50);
      if (useApp.getState().orb === "idle") useApp.getState().setOrb("listening");
      tell();
      return true;
    } catch (e) {
      console.warn("live voice unavailable", e);
      clientLog("livekit_failed", { error: String(e).slice(0, 300) });
      return false;
    }
  })();
  try {
    return await joining;
  } finally {
    joining = null;
  }
}

export async function stopLiveVoice() {
  wanted = false;
  lost = false;
  const rm = room;
  room = null;
  clearInterval(poll);
  voiceLevels.me.current = voiceLevels.jagora.current = 0;
  document.querySelectorAll("[data-jagora-voice]").forEach((el) => el.remove());
  if (useApp.getState().orb === "listening") useApp.getState().setOrb("idle");
  tell();
  try {
    await rm?.localParticipant.setMicrophoneEnabled(false); // the mic light goes off at once
  } catch {}
  await rm?.disconnect();
}

/** Mute her microphone without leaving (the orb tap while listening). */
export async function setLiveMic(on: boolean) {
  clientLog("mic", { on, through: "livekit" });
  await room?.localParticipant.setMicrophoneEnabled(on);
}
