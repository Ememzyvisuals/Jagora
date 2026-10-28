"use client";

/* Taking turns in Live mode, the way good voice agents do it (the rules follow Emmanuel's Kivo agent and LiveKit /
   Pipecat): a small speech model (Silero VAD, run in the browser) decides what is speech, not a loudness meter.

   - A turn starts only after 0.3 s of real speech; coughs, clicks and short noises never reach the server.
   - A pause does not end the turn at once. After the detector hears 0.45 s of quiet, Jagora waits a little more
     (longer after a very short phrase); if she goes on talking, it is all one turn.
   - While Jagora is speaking, the bar is higher: her own voice from the speaker must not count. Clear speech first
     lowers Jagora's voice (duck); half a second of it stops Jagora (barge-in) and what she says becomes her turn.
     If it was only a noise, Jagora's voice comes back to full.
   - The first moments of each reply are ignored for barge-in while the phone's echo cancelling settles.
   Only finished turns are uploaded, as small 8-bit WAV files. */
import type { MicVAD } from "@ricky0123/vad-web";

const MIN_SPEECH_MS = 300;
const QUIET_MS = 450; // the detector's own pause (redemption) before it calls a stretch of speech finished
const HOLD_SHORT_MS = 1300; // then wait this much more after a short phrase (under 1.2 s)...
const HOLD_MS = 950; // ...or this much after a longer one, in case she carries on (a breath, a thought)
const MAX_TURN_S = 25;
const BARGE_P = 0.8; // while Jagora talks, only frames this sure of being speech count
const DUCK_MS = 200; // that much sure speech lowers Jagora's voice
const BARGE_MS = 350; // that much (within WINDOW_MS) stops her
const WINDOW_MS = 900;
const WARMUP_MS = 450; // start of each reply: echo cancelling settles, no barge-in
const FIRST_WARMUP_MS = 2000; // the first reply of the session, longer
const OVER_ECHO = 2; // while Jagora talks, her voice must be this much louder than the echo heard so far

export type TurnHandlers = {
  /** a finished turn: 16 kHz audio as WAV, and its length */
  onTurn: (wav: Blob, secs: number) => void;
  /** she started talking over Jagora; `stop` false = only lower the voice, true = stop it */
  onBarge: (stop: boolean) => void;
  /** a barge-in that turned out to be a noise: bring Jagora's voice back */
  onFalseAlarm: () => void;
  /** she is talking (for the orb) */
  onSpeaking?: (on: boolean) => void;
};

export class Listener {
  private vad: MicVAD | null = null;
  private parts: Float32Array[] = [];
  private partSecs = 0;
  private hold: ReturnType<typeof setTimeout> | undefined;
  private agentTalking = false;
  private talkingSince = 0;
  private firstReply = true;
  private sure = 0; // ms of her speech in the last WINDOW_MS while Jagora talks
  private recent: number[] = [];
  private ducked = false;
  private barged = false;
  private paused = false;
  private echo = 0; // how loud Jagora's own voice comes back through the microphone (follows the peaks, slowly)
  level = { current: 0 };

  constructor(private h: TurnHandlers) {}

  async start(): Promise<boolean> {
    try {
      const { MicVAD } = await import("@ricky0123/vad-web");
      this.vad = await MicVAD.new({
        model: "v6",
        baseAssetPath: "/vad/",
        onnxWASMBasePath: "/vad/",
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        redemptionMs: QUIET_MS,
        minSpeechMs: MIN_SPEECH_MS,
        preSpeechPadMs: 320,
        submitUserSpeechOnPause: false,
        ortConfig: (ort) => {
          ort.env.logLevel = "error";
          ort.env.wasm.numThreads = 1; // no cross-origin isolation on the site: one thread
        },
        // echo cancelling and noise removal on, automatic volume off: it would turn the quiet echo up and her
        // voice down, and loudness is how her voice is told apart from Jagora's
        getStream: () =>
          navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } }),
        // keep the microphone open the whole time (stopping it flips the phone's audio route); gate in code instead
        pauseStream: async () => {},
        resumeStream: async (s) => s,
        onFrameProcessed: (p, frame) => this.frame(p.isSpeech, frame),
        onSpeechStart: () => this.speechStart(),
        onSpeechRealStart: () => this.h.onSpeaking?.(true),
        onVADMisfire: () => this.h.onSpeaking?.(false),
        onSpeechEnd: (audio) => this.speechEnd(audio),
        startOnLoad: true,
      });
      return true;
    } catch (e) {
      console.warn("speech detector not available", e);
      return false;
    }
  }

  /** Jagora started or stopped talking */
  setAgentTalking(on: boolean) {
    if (on === this.agentTalking) return;
    this.agentTalking = on;
    this.sure = 0;
    this.recent = [];
    this.ducked = false;
    if (on) {
      this.talkingSince = performance.now();
      this.barged = false;
      this.vad?.setOptions({ positiveSpeechThreshold: BARGE_P, negativeSpeechThreshold: BARGE_P - 0.15 });
    } else {
      if (!this.barged) this.firstReply = false;
      this.vad?.setOptions({ positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35 });
    }
  }

  pause() {
    this.paused = true;
    this.reset();
  }
  resume() {
    this.paused = false;
  }

  async destroy() {
    clearTimeout(this.hold);
    await this.vad?.destroy();
    this.vad = null;
  }

  private reset() {
    clearTimeout(this.hold);
    this.parts = [];
    this.partSecs = 0;
  }

  private frame(p: number, frame: Float32Array) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    this.level.current = Math.min(1, Math.sqrt(sum / frame.length) * 6);
    if (this.paused || !this.agentTalking || this.barged) return;
    const ms = (frame.length / 16000) * 1000;
    const rms = Math.sqrt(sum / frame.length);
    const warm = performance.now() - this.talkingSince < (this.firstReply ? FIRST_WARMUP_MS : WARMUP_MS);
    // Silero hears speech whether it is near or far, so loudness decides whose it is: Jagora's echo comes back
    // much quieter than her own voice right at the microphone
    const hers = p >= BARGE_P && rms > Math.max(0.01, this.echo * OVER_ECHO);
    // learn the echo level from what is plainly not her: the first moments of a reply, and anything that is not
    // clearly louder than the echo already known (so her own first syllables are never learned as echo)
    if (warm) this.echo = Math.max(this.echo * 0.995, rms);
    else if (rms < Math.max(0.01, this.echo * OVER_ECHO)) this.echo = Math.max(this.echo * 0.995, Math.min(rms, this.echo * 1.02));
    if (warm) return;
    // her speech over the last WINDOW_MS (gaps between syllables do not reset it)
    this.recent.push(hers ? ms : 0);
    while (this.recent.length * ms > WINDOW_MS) this.recent.shift();
    this.sure = this.recent.reduce((a, b) => a + b, 0);
    if (!this.ducked && this.sure >= DUCK_MS) {
      this.ducked = true;
      this.h.onBarge(false);
    }
    if (this.sure >= BARGE_MS) {
      this.barged = true; // her words from here on are her turn
      this.h.onBarge(true);
      this.agentTalking = false;
      this.vad?.setOptions({ positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35 });
    } else if (this.ducked && this.sure === 0) {
      this.ducked = false;
      this.h.onFalseAlarm();
    }
  }

  private speechStart() {
    if (this.paused) return;
    clearTimeout(this.hold); // she carried on: still the same turn
  }

  private speechEnd(audio: Float32Array) {
    this.h.onSpeaking?.(false);
    if (this.paused) return;
    if (this.agentTalking && !this.barged) {
      // heard while Jagora talks without a real barge-in: her echo or a noise, not a turn
      if (this.ducked) {
        this.ducked = false;
        this.h.onFalseAlarm();
      }
      return;
    }
    this.parts.push(audio);
    this.partSecs += audio.length / 16000;
    const lastSecs = audio.length / 16000;
    clearTimeout(this.hold);
    if (this.partSecs >= MAX_TURN_S) return this.commit();
    this.hold = setTimeout(() => this.commit(), lastSecs < 1.2 && this.parts.length === 1 ? HOLD_SHORT_MS : HOLD_MS);
  }

  private commit() {
    if (!this.parts.length) return;
    const n = this.parts.reduce((a, p) => a + p.length, 0);
    const all = new Float32Array(n);
    let o = 0;
    for (const p of this.parts) {
      all.set(p, o);
      o += p.length;
    }
    const secs = this.partSecs;
    this.reset();
    this.barged = false;
    this.h.onTurn(mulawWav(all, 16000), secs);
  }
}

/** 8-bit mu-law WAV: half the size of 16-bit, clear enough for speech recognition */
export function mulawWav(x: Float32Array, rate: number): Blob {
  const data = new Uint8Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let s = Math.max(-1, Math.min(1, x[i])) * 32767;
    const sign = s < 0 ? 0x80 : 0;
    if (s < 0) s = -s;
    s = Math.min(32635, s + 132);
    let exp = 7;
    for (let m = 0x4000; (s & m) === 0 && exp > 0; m >>= 1) exp--;
    const man = (s >> (exp + 3)) & 0x0f;
    data[i] = ~(sign | (exp << 4) | man) & 0xff;
  }
  const head = new ArrayBuffer(46);
  const v = new DataView(head);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 38 + data.length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 18, true);
  v.setUint16(20, 7, true); // mu-law
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  v.setUint16(36, 0, true);
  str(38, "data");
  v.setUint32(42, data.length, true);
  return new Blob([head, data], { type: "audio/wav" });
}
