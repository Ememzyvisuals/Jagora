"use client";

/* Microphone capture for the orb and for sending her voice to the backend. Levels go into a ref (not React state)
   so the orb can follow the voice every frame without re-rendering the page. */
import { useCallback, useEffect, useRef, useState } from "react";
import { hush } from "@/lib/engine/remote";

export function useVoice() {
  const level = useRef(0);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parts = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number; rec?: MediaRecorder; chunks: Blob[] } | null>(null);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const p = parts.current;
    if (!p) return null;
    parts.current = null;
    cancelAnimationFrame(p.raf);
    const blob = await new Promise<Blob | null>((resolve) => {
      if (!p.rec || p.rec.state === "inactive") return resolve(null);
      p.rec.onstop = () => resolve(new Blob(p.chunks, { type: p.rec?.mimeType || "audio/webm" }));
      p.rec.stop();
    });
    p.stream.getTracks().forEach((t) => t.stop());
    void p.ctx.close();
    level.current = 0;
    setListening(false);
    return blob;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (parts.current) return;
    hush(); // she is about to talk: Jagora stops
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const chunks: Blob[] = [];
      let rec: MediaRecorder | undefined;
      try {
        rec = new MediaRecorder(stream);
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.start(250);
      } catch {
        rec = undefined;
      }
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        level.current = Math.min(1, rms * 5.5);
        if (parts.current) parts.current.raf = requestAnimationFrame(tick);
      };
      parts.current = { stream, ctx, raf: requestAnimationFrame(tick), rec, chunks };
      setListening(true);
    } catch {
      setError("mic");
    }
  }, []);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);
  return { level, listening, error, start, stop };
}

/* A believable speaking rhythm for the orb while Jagora talks, when no audio stream is attached. */
export function useSpeakingPulse(active: boolean) {
  const level = useRef(0);
  useEffect(() => {
    if (!active) {
      level.current = 0;
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const word = (t % 0.9) < 0.66 ? 1 : 0.08;
      level.current = word * (0.3 + 0.6 * Math.abs(Math.sin(t * Math.PI * 4.3)) * (0.75 + 0.25 * Math.sin(t * 1.8)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return level;
}

/** A recording as a data URL, so it can sit in the chat and be played back later. */
export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => resolve("");
    r.readAsDataURL(b);
  });
}

/* Barge-in: while Jagora speaks, listen (with echo cancellation, so her own voice from the speaker is ignored) for
   the person talking over her. A clear voice held for a moment calls onVoice once. Returns a stop function. */
export async function watchForVoice(onVoice: () => void, { threshold = 0.2, holdMs = 220 } = {}): Promise<() => void> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    return () => {};
  }
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  let over = 0, last = performance.now(), raf = 0, done = false;
  const stop = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };
  const tick = (now: number) => {
    if (done) return;
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += ((v - 128) / 128) ** 2;
    const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 5.5);
    over = lvl > threshold ? over + (now - last) : Math.max(0, over - (now - last) * 2);
    last = now;
    if (over >= holdMs) {
      stop();
      onVoice();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return stop;
}
