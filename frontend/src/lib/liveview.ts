"use client";

/* Painting the live page onto a canvas, sharp and smooth.

   Video (most phones and computers): the server sends H.264 (lib backend video.py), one message per frame; the
   phone's own video decoder (WebCodecs, hardware where it can) turns it into pictures. Pattern from ws-scrcpy's
   WebCodecs player: the codec name comes from the stream's SPS, keyframes carry SPS/PPS, and nothing is decoded
   before the first keyframe.
   Photos (old browsers, or if the decoder fails): sharp JPEGs, decoded off the main thread with createImageBitmap.

   The canvas always has the frame's own pixel size; the page around it only scales it once, with CSS. */

export type LiveFrame = { kind: 1 | 2 | 3; data: Uint8Array };

export const canDecodeVideo = () => typeof window !== "undefined" && typeof window.VideoDecoder === "function";

/** "avc1.PPCCLL" from the SPS inside an Annex B keyframe */
function codecOf(data: Uint8Array): string | null {
  for (let i = 0; i + 4 < data.length; i++) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1 && (data[i + 3] & 0x1f) === 7) {
      const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
      return `avc1.${h(data[i + 4])}${h(data[i + 5])}${h(data[i + 6])}`;
    }
  }
  return null;
}

export class Painter {
  private ctx: CanvasRenderingContext2D | null;
  private decoder: VideoDecoder | null = null;
  private codec = "";
  private ready = false; // a keyframe has been decoded since the decoder was (re)configured
  private drawing = false;
  private pending: Blob | null = null;
  private shown = false; // a video frame has been painted
  private watchdog = 0;
  onSize?: (w: number, h: number) => void;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: { needKey: () => void; videoBroken: () => void; log?: (event: string, data?: Record<string, unknown>) => void },
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false });
  }

  push(f: LiveFrame) {
    if (f.kind === 1) return this.photo(f.data);
    this.video(f.data, f.kind === 2);
  }

  private size(w: number, h: number) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.hooks.log?.("picture_size", { w, h, first: this.canvas.width === 300 && this.canvas.height === 150 });
      this.canvas.width = w;
      this.canvas.height = h;
      this.onSize?.(w, h);
    }
  }

  private photo(data: Uint8Array) {
    // only the newest photo is drawn; any that arrive while one is decoding are skipped
    this.pending = new Blob([data as BlobPart], { type: "image/jpeg" });
    if (this.drawing) return;
    void this.drawPhotos();
  }

  private async drawPhotos() {
    this.drawing = true;
    try {
      while (this.pending) {
        const b = this.pending;
        this.pending = null;
        const bmp = await createImageBitmap(b);
        this.size(bmp.width, bmp.height);
        this.ctx?.drawImage(bmp, 0, 0);
        bmp.close();
      }
    } catch (e) {
      /* a broken picture: the next one replaces it */
      this.hooks.log?.("photo_broken", { error: String(e).slice(0, 200) });
    } finally {
      this.drawing = false;
    }
  }

  private video(data: Uint8Array, key: boolean) {
    if (!canDecodeVideo()) return this.hooks.videoBroken();
    if (key) {
      const codec = codecOf(data);
      if (codec && (codec !== this.codec || !this.decoder || this.decoder.state !== "configured")) {
        this.reset();
        this.decoder = new VideoDecoder({
          output: (frame) => {
            if (!this.shown) this.hooks.log?.("video_first_painted", { w: frame.displayWidth, h: frame.displayHeight, codec: this.codec });
            this.shown = true;
            clearTimeout(this.watchdog);
            this.size(frame.displayWidth, frame.displayHeight);
            this.ctx?.drawImage(frame, 0, 0);
            frame.close();
          },
          error: (e) => {
            this.hooks.log?.("video_decoder_error", { error: String(e).slice(0, 200), codec: this.codec });
            this.decoder = null;
            this.ready = false;
            this.hooks.videoBroken();
          },
        });
        try {
          this.decoder.configure({ codec, optimizeForLatency: true, hardwareAcceleration: "no-preference" });
          this.codec = codec;
          this.hooks.log?.("video_decoder_ready", { codec });
        } catch (e) {
          this.hooks.log?.("video_decoder_refused", { codec, error: String(e).slice(0, 200) });
          return this.hooks.videoBroken();
        }
      }
      this.ready = true;
    }
    if (!this.decoder || this.decoder.state !== "configured" || !this.ready) return this.hooks.needKey();
    // a decoder falling behind (slow phone): drop to the next keyframe instead of lagging
    if (!key && this.decoder.decodeQueueSize > 6) {
      this.ready = false;
      return this.hooks.needKey();
    }
    // a decoder that takes keyframes but never paints one (some computers' GPUs): photos instead, so the page shows
    if (key && !this.shown && !this.watchdog)
      this.watchdog = window.setTimeout(() => {
        this.watchdog = 0;
        if (!this.shown) {
          this.hooks.log?.("video_never_painted", { codec: this.codec, note: "switching to photos" });
          this.reset();
          this.hooks.videoBroken();
        }
      }, 2500);
    try {
      this.decoder.decode(new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp: performance.now() * 1000, data }));
    } catch {
      this.ready = false;
      this.hooks.needKey();
    }
  }

  reset() {
    clearTimeout(this.watchdog);
    this.watchdog = 0;
    try {
      if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
    } catch {}
    this.decoder = null;
    this.ready = false;
  }
}
