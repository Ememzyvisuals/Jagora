"use client";

/* Type Art: a full-screen artboard that types a picture out live, line by line, in letters, with a blinking cursor and
   soft key clicks, like the typed portraits people share online.
   Where the picture comes from:
   - Jagora draws it with Muse Image when she asks ("draw a Nigerian woman in a gele"): the server sends "typeart".
   - her own photo, attached in the chat (Jagora sends it the same way) or picked right here (that one never leaves
     her phone).
   Options: letters (symbols, numbers, or words in her language), colour (full, one blue, black and white), detail,
   a plain background behind the subject, and her name typed as the signature. She can save it as a picture or as a
   video of it being typed. The work itself is in lib/typeart.ts. */
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { reportScreen } from "@/lib/appctl";
import { useApp } from "@/lib/store";
import type { Lang } from "@/lib/i18n";
import type { Art, ArtOpts, Colour, Detail, Letters } from "@/lib/typeart";

export type TypeArtEvent = { url?: string; subject?: string; letters?: Letters; colour?: Colour; detail?: Detail; restyle?: boolean; open?: boolean; own?: boolean; drawn_by?: string };
export const openTypeArt = (d: TypeArtEvent = {}) => dispatchEvent(new CustomEvent("jagora:typeart", { detail: { open: true, ...d } }));
export const closeTypeArt = () => dispatchEvent(new CustomEvent("jagora:typeart", { detail: { open: false } }));

const T: Record<string, Record<Lang, string>> = {
  title: { en: "Type Art", pcm: "Type Art", yo: "Type Art", ha: "Type Art", ig: "Type Art" },
  letters: { en: "Letters", pcm: "Letters", yo: "Lẹ́tà", ha: "Haruffa", ig: "Mkpụrụedemede" },
  symbols: { en: "Symbols", pcm: "Symbols", yo: "Àmì", ha: "Alamomi", ig: "Akara" },
  numbers: { en: "Numbers", pcm: "Numbers", yo: "Nọ́mbà", ha: "Lambobi", ig: "Nọmba" },
  words: { en: "Words", pcm: "Words", yo: "Ọ̀rọ̀", ha: "Kalmomi", ig: "Okwu" },
  colour: { en: "Colour", pcm: "Colour", yo: "Àwọ̀", ha: "Launi", ig: "Agba" },
  full: { en: "Full colour", pcm: "Full colour", yo: "Gbogbo àwọ̀", ha: "Cikakken launi", ig: "Agba niile" },
  one: { en: "One colour", pcm: "One colour", yo: "Àwọ̀ kan", ha: "Launi ɗaya", ig: "Otu agba" },
  bw: { en: "Black and white", pcm: "Black and white", yo: "Dúdú àti funfun", ha: "Baƙi da fari", ig: "Oji na ọcha" },
  detail: { en: "Detail", pcm: "Detail", yo: "Kúlẹ̀kúlẹ̀", ha: "Cikakken bayani", ig: "Nkọwa" },
  coarse: { en: "Big letters", pcm: "Big letters", yo: "Lẹ́tà ńlá", ha: "Manyan haruffa", ig: "Mkpụrụedemede buru ibu" },
  medium: { en: "Medium", pcm: "Medium", yo: "Àárín", ha: "Matsakaici", ig: "Etiti" },
  fine: { en: "Fine", pcm: "Fine", yo: "Kékeré", ha: "Ƙanana", ig: "Obere" },
  plain: { en: "Plain background", pcm: "Plain background", yo: "Ẹ̀yìn kan ṣoṣo", ha: "Bango mara komai", ig: "Azụ dị nkịtị" },
  sound: { en: "Sound", pcm: "Sound", yo: "Ohùn", ha: "Sauti", ig: "Ụda" },
  sign: { en: "Signature", pcm: "Signature", yo: "Ìbuwọ́lù", ha: "Sa hannu", ig: "Mbinye aka" },
  again: { en: "Draw again", pcm: "Draw am again", yo: "Tún un yà", ha: "Sake zana", ig: "See ọzọ" },
  savePic: { en: "Save picture", pcm: "Save picture", yo: "Fi àwòrán pamọ́", ha: "Ajiye hoto", ig: "Chekwaa foto" },
  saveVid: { en: "Save video", pcm: "Save video", yo: "Fi fídíò pamọ́", ha: "Ajiye bidiyo", ig: "Chekwaa vidiyo" },
  recording: { en: "Recording the video...", pcm: "I dey record the video...", yo: "Ń gba fídíò sílẹ̀...", ha: "Ana ɗaukar bidiyo...", ig: "Ana edekọ vidiyo..." },
  pick: { en: "Pick a photo", pcm: "Pick photo", yo: "Yan fọ́tò", ha: "Zaɓi hoto", ig: "Họrọ foto" },
  options: { en: "Options", pcm: "Options", yo: "Àṣàyàn", ha: "Zaɓuɓɓuka", ig: "Nhọrọ" },
  ask: { en: "Or tell Jagora what to draw", pcm: "Or tell Jagora wetin make e draw", yo: "Tàbí sọ ohun tí Jagora máa yà", ha: "Ko faɗa wa Jagora abin da za ta zana", ig: "Ma ọ bụ gwa Jagora ihe ọ ga-ese" },
  draw: { en: "Draw", pcm: "Draw", yo: "Yà á", ha: "Zana", ig: "See" },
  try: { en: "Or try one of ours", pcm: "Or try one of our own", yo: "Tàbí gbìyànjú ọ̀kan nínú tiwa", ha: "Ko gwada ɗaya daga cikin namu", ig: "Ma ọ bụ nwalee otu n'ime nke anyị" },
  empty: { en: "Your picture, typed out in letters.", pcm: "Your picture, typed out for letters.", yo: "Àwòrán yín, tí a tẹ̀ ní lẹ́tà.", ha: "Hotonka, an rubuta shi da haruffa.", ig: "Foto gị, e dere ya n'mkpụrụedemede." },
  getting: { en: "Jagora is drawing your picture...", pcm: "Jagora dey draw your picture...", yo: "Jagora ń ya àwòrán yín...", ha: "Jagora na zana hotonka...", ig: "Jagora na-ese foto gị..." },
  example: { en: "a Nigerian woman in a gele", pcm: "Naija woman wey tie gele", yo: "obìnrin Yorùbá tó wé gèlè", ha: "mace 'yar Najeriya mai ɗankwali", ig: "nwanyị Naịjirịa kechiri ịchafụ" },
};

const SAMPLES = [
  { url: "/typeart/portrait-03.webp", name: "Gele portrait" },
  { url: "/typeart/people-06.webp", name: "Agbada and fila" },
  { url: "/typeart/portrait-06.webp", name: "Baba in a white fila" },
];

/* soft typewriter clicks, made on the spot (no sound files); only after she has tapped, as browsers require */
let actx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
function click() {
  try {
    actx ??= new AudioContext();
    if (actx.state === "suspended") void actx.resume();
    if (!noise) {
      noise = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.03), actx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
    }
    const src = actx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const bp = actx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200 + Math.random() * 1600;
    bp.Q.value = 1.4;
    const g = actx.createGain();
    g.gain.value = 0.09;
    src.connect(bp).connect(g).connect(actx.destination);
    src.start();
  } catch {}
}

async function loadPicture(url: string): Promise<ImageBitmap> {
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) throw new Error(`picture ${r.status}`);
  return createImageBitmap(await r.blob());
}

function save(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (matchMedia("(pointer: coarse)").matches && nav.canShare?.({ files: [file] })) {
    void navigator.share({ files: [file], title: "Type Art" }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 4000);
}

const Chip = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-bold transition ${on ? "bg-white text-[#0b1220]" : "bg-white/10 text-white/85 hover:bg-white/15"}`}
  >
    {children}
  </button>
);

export function TypeArt() {
  const lang = useApp((s) => s.lang);
  const profile = useApp((s) => s.profile);
  const [on, setOn] = useState(false);
  const [pic, setPic] = useState<{ bmp: ImageBitmap; subject: string } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [opts, setOpts] = useState<Omit<ArtOpts, "lang">>({ letters: "symbols", colour: "full", detail: "medium", plain: true });
  const [sign, setSign] = useState("");
  const [sound, setSound] = useState(true);
  const [phase, setPhase] = useState<"idle" | "typing" | "done">("idle");
  const [rec, setRec] = useState(false);
  const [panel, setPanel] = useState(false);
  const [prompt, setPrompt] = useState("");
  const board = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const art = useRef<{ a: Art; layer: HTMLCanvasElement; order: number[]; sig: string; dpr: number } | null>(null);
  const run = useRef(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  // her name as the default signature
  useEffect(() => {
    if (!sign) setSign(((profile?.first_name || profile?.full_name || "").split(" ")[0] || "Jagora").toUpperCase());
  }, [profile, sign]);

  /* opened by the menu, by Jagora (a picture, or new settings for the one on the board), or closed */
  useEffect(() => {
    const onEv = async (e: Event) => {
      const d = ((e as CustomEvent).detail || {}) as TypeArtEvent;
      if (d.open === false) return setOn(false);
      setOn(true);
      const next: Partial<Omit<ArtOpts, "lang">> = {};
      if (d.letters) next.letters = d.letters;
      if (d.colour) next.colour = d.colour;
      if (d.detail) next.detail = d.detail;
      if (Object.keys(next).length) setOpts((o) => ({ ...o, ...next }));
      if (d.url) {
        setWaiting(true);
        try {
          const bmp = await loadPicture(d.url);
          setPic({ bmp, subject: d.subject || "" });
        } catch {
          setPic(null);
        }
        setWaiting(false);
      } else if (d.subject === undefined && !d.restyle && !d.url) {
        // opened from the menu: keep what is on the board
      }
    };
    addEventListener("jagora:typeart", onEv);
    return () => removeEventListener("jagora:typeart", onEv);
  }, []);

  // Jagora knows what is on the artboard, so "make am blue" means this one
  useEffect(() => {
    reportScreen("typeart", on ? `open${pic ? `, typing "${pic.subject || "her photo"}" in ${opts.letters}, ${opts.colour} colour, ${opts.detail} detail` : ", empty"}` : "");
  }, [on, pic, opts]);

  /* build the cells and type them out */
  const draw = useCallback(
    async (record = false) => {
      const box = board.current, canvas = cv.current;
      if (!pic || !box || !canvas) return;
      const my = ++run.current;
      setPhase("typing");
      const { buildArt, FONT } = await import("@/lib/typeart");
      const bw = box.clientWidth, bh = box.clientHeight;
      const a = await buildArt(pic.bmp, bw, bh, { ...opts, lang });
      if (my !== run.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const W = Math.ceil(a.cols * a.cw), H = Math.ceil((a.rows + 2) * a.lh);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const layer = document.createElement("canvas");
      layer.width = canvas.width;
      layer.height = canvas.height;
      const lg = layer.getContext("2d")!;
      lg.scale(dpr, dpr);
      lg.fillStyle = a.bg;
      lg.fillRect(0, 0, W, H);
      lg.textBaseline = "middle";
      const order: number[] = [];
      a.cells.forEach((c, i) => c && order.push(i));
      const sig = sign.trim().slice(0, 24);
      art.current = { a, layer, order, sig, dpr };
      const g = canvas.getContext("2d")!;
      const total = order.length + sig.length;
      const ms = { coarse: 5200, medium: 6500, fine: 8000 }[opts.detail];
      let done = 0, lastClick = 0, curBold: boolean | null = null;
      const sigFont = Math.max(9, a.lh * 1.5);
      const sigX = W - sig.length * sigFont * 0.6 - a.cw, sigY = (a.rows + 1) * a.lh;
      const setFont = (bold: boolean) => {
        if (curBold !== bold) {
          lg.font = `${bold ? 800 : 500} ${a.font}px ${FONT}`;
          curBold = bold;
        }
      };
      let recorder: MediaRecorder | null = null;
      const chunks: Blob[] = [];
      if (record) {
        const types = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
        const type = types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
        try {
          recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 6_000_000 });
          recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          recorder.start(200);
          setRec(true);
        } catch {
          recorder = null;
        }
      }
      const t0 = performance.now();
      let doneAt = 0;
      const frame = (now: number) => {
        if (my !== run.current) return;
        const want = Math.min(total, Math.floor(((now - t0) / ms) * total));
        while (done < want) {
          if (done < order.length) {
            const i = order[done];
            const c = a.cells[i]!;
            setFont(c.bold);
            lg.fillStyle = c.c;
            lg.fillText(c.ch, (i % a.cols) * a.cw, Math.floor(i / a.cols) * a.lh + a.lh / 2);
          } else {
            const k = done - order.length;
            lg.font = `800 ${sigFont}px ${FONT}`;
            curBold = null;
            lg.fillStyle = a.ink;
            lg.fillText(sig[k], sigX + k * sigFont * 0.6, sigY);
          }
          done++;
        }
        // the board, then the cursor at the typing head
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(layer, 0, 0);
        g.scale(dpr, dpr);
        let cx: number, cy: number, ch: number, cwid: number;
        if (done < order.length) {
          const i = order[Math.min(done, order.length - 1)];
          cx = (i % a.cols) * a.cw;
          cy = Math.floor(i / a.cols) * a.lh;
          ch = a.lh;
          cwid = a.cw;
        } else {
          const k = done - order.length;
          cx = sig.length ? sigX + k * sigFont * 0.6 : W - a.cw * 2;
          cy = sigY - sigFont / 2;
          ch = sigFont;
          cwid = sigFont * 0.6;
        }
        const finished = done >= total;
        if (!finished || Math.floor(now / 530) % 2 === 0) {
          g.fillStyle = a.bg === "#050608" ? "rgba(232,237,245,0.92)" : "rgba(20,48,111,0.9)";
          g.fillRect(cx, cy, Math.max(1.5, cwid), ch);
        }
        if (!finished && soundRef.current && now - lastClick > 55) {
          lastClick = now;
          click();
        }
        if (finished && !doneAt) {
          doneAt = now;
          setPhase("done");
        }
        if (finished && recorder && now - t0 > ms + 1400) {
          const r = recorder;
          recorder = null;
          r.onstop = () => {
            setRec(false);
            const type = r.mimeType || "video/webm";
            save(new Blob(chunks, { type }), `jagora-type-art.${type.includes("mp4") ? "mp4" : "webm"}`);
          };
          r.stop();
        }
        // the cursor blinks on for a while after the last letter, then the board rests
        if (!doneAt || recorder || now - doneAt < 15000) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    [pic, opts, lang, sign],
  );

  // a new picture or new settings: type it again
  useEffect(() => {
    if (on && pic) void draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, pic, opts.letters, opts.colour, opts.detail, opts.plain, lang]);

  useEffect(() => {
    if (!on) {
      run.current++;
      setPhase("idle");
    }
  }, [on]);

  useEffect(() => {
    if (!on) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOn(false);
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [on]);

  const savePicture = async () => {
    const st = art.current;
    if (!st) return;
    const { FONT } = await import("@/lib/typeart");
    // drawn again at print size, so the letters stay sharp
    const { a, order, sig } = st;
    const W = a.cols * a.cw, H = (a.rows + 2) * a.lh;
    const scale = Math.max(1, 1600 / W);
    const c = document.createElement("canvas");
    c.width = Math.round(W * scale);
    c.height = Math.round(H * scale);
    const g = c.getContext("2d")!;
    g.scale(scale, scale);
    g.fillStyle = a.bg;
    g.fillRect(0, 0, W, H);
    g.textBaseline = "middle";
    let bold: boolean | null = null;
    for (const i of order) {
      const cell = a.cells[i]!;
      if (cell.bold !== bold) {
        g.font = `${cell.bold ? 800 : 500} ${a.font}px ${FONT}`;
        bold = cell.bold;
      }
      g.fillStyle = cell.c;
      g.fillText(cell.ch, (i % a.cols) * a.cw, Math.floor(i / a.cols) * a.lh + a.lh / 2);
    }
    if (sig) {
      const f = Math.max(9, a.lh * 1.5);
      g.font = `800 ${f}px ${FONT}`;
      g.fillStyle = a.ink;
      g.fillText(sig, W - sig.length * f * 0.6 - a.cw, (a.rows + 1) * a.lh);
    }
    c.toBlob((b) => b && save(b, "jagora-type-art.png"), "image/png");
  };

  const pickPhoto = async (f?: File | null) => {
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f); // stays on her phone
      setPic({ bmp, subject: f.name });
    } catch {}
  };

  const sample = async (url: string, name: string) => {
    try {
      setPic({ bmp: await loadPicture(url), subject: name });
    } catch {}
  };

  const askJagora = async () => {
    const what = prompt.trim();
    if (!what) return;
    setPrompt("");
    setWaiting(true);
    setTimeout(() => setWaiting(false), 60_000);
    (await import("@/lib/engine")).ask(`Draw type art: ${what}`);
  };

  if (!on) return null;
  const set = <K extends keyof typeof opts>(k: K, v: (typeof opts)[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const L = (k: string) => T[k][lang] ?? T[k].en;

  const optionRows = (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full text-[12.5px] font-bold uppercase tracking-wide text-white/55">{L("letters")}</span>
        {(["symbols", "numbers", "words"] as Letters[]).map((v) => (
          <Chip key={v} on={opts.letters === v} onClick={() => set("letters", v)}>{L(v)}</Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full text-[12.5px] font-bold uppercase tracking-wide text-white/55">{L("colour")}</span>
        {(["full", "one", "bw"] as Colour[]).map((v) => (
          <Chip key={v} on={opts.colour === v} onClick={() => set("colour", v)}>{L(v)}</Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full text-[12.5px] font-bold uppercase tracking-wide text-white/55">{L("detail")}</span>
        {(["coarse", "medium", "fine"] as Detail[]).map((v) => (
          <Chip key={v} on={opts.detail === v} onClick={() => set("detail", v)}>{L(v)}</Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip on={opts.plain} onClick={() => set("plain", !opts.plain)}>{L("plain")}</Chip>
        <Chip on={sound} onClick={() => setSound(!sound)}>{L("sound")}</Chip>
        <label className="flex h-9 items-center gap-2 rounded-full bg-white/10 pl-3.5 pr-1.5 text-[13.5px] font-bold text-white/85">
          {L("sign")}
          <input
            value={sign}
            onChange={(e) => setSign(e.target.value.toUpperCase().slice(0, 24))}
            onBlur={() => pic && void draw()}
            className="h-7 w-[120px] rounded-full bg-black/40 px-3 text-[13px] font-bold tracking-wide text-white outline-none"
            aria-label={L("sign")}
          />
        </label>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void askJagora();
        }}
        className="flex items-center gap-2"
      >
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`${L("ask")}: ${L("example")}`}
          className="h-11 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-[14.5px] font-semibold text-white placeholder:text-white/45 outline-none focus:bg-white/15"
        />
        <button type="submit" className="h-11 shrink-0 rounded-full bg-white px-5 text-[14.5px] font-bold text-[#0b1220]">{L("draw")}</button>
      </form>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[#030405] text-white" role="dialog" aria-label="Type Art" onPointerDown={() => actx?.state === "suspended" && void actx.resume()}>
      {/* top bar */}
      <div className="flex items-center gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <div className="min-w-0 flex-1">
          <p className="font-head text-[19px] font-bold leading-tight">{L("title")}</p>
          {pic && <p className="truncate text-[13px] font-semibold text-white/55">{pic.subject}</p>}
        </div>
        <button onClick={() => setOn(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/15" aria-label="Close">
          <X size={20} weight="bold" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* the board */}
      <div ref={board} className="relative mx-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[22px] lg:mb-4">
        {pic ? (
          <canvas ref={cv} className="max-h-full max-w-full rounded-[10px]" />
        ) : (
          <div className="flex max-w-[520px] flex-col items-center gap-4 px-4 text-center">
            <p className="font-head text-[24px] font-bold leading-tight sm:text-[30px]">{waiting ? L("getting") : L("empty")}</p>
            {waiting ? (
              <span className="h-6 w-3 animate-pulse bg-white/85" />
            ) : (
              <>
                <button onClick={() => file.current?.click()} className="h-12 rounded-full bg-white px-6 text-[15.5px] font-bold text-[#0b1220]">{L("pick")}</button>
                <p className="mt-2 text-[13.5px] font-bold text-white/55">{L("try")}</p>
                <div className="flex gap-3">
                  {SAMPLES.map((s) => (
                    <button key={s.url} onClick={() => void sample(s.url, s.name)} className="h-20 w-16 overflow-hidden rounded-[14px] ring-1 ring-white/15 transition hover:ring-white/50" aria-label={s.name}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {pic && waiting && (
          <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-white/10 px-4 py-2 text-[13.5px] font-bold backdrop-blur">{L("getting")}</div>
        )}
        {rec && <div className="absolute left-3 top-3 rounded-full bg-[#e5484d] px-3 py-1.5 text-[12.5px] font-bold">{L("recording")}</div>}
      </div>

      {/* actions and options: below the board on phones, beside it on computers */}
      <div className="px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 lg:w-[430px] lg:shrink-0 lg:overflow-y-auto lg:pr-5 lg:pt-0">
        <div className="mx-auto flex max-w-[980px] flex-col gap-3 lg:flex-col-reverse lg:justify-end">
          <div className={`${panel ? "block" : "hidden"} rounded-[20px] bg-white/[0.06] p-3 sm:block`}>{optionRows}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setPanel(!panel)} className="h-11 rounded-full bg-white/10 px-4 text-[14.5px] font-bold sm:hidden">{L("options")}</button>
            <button onClick={() => file.current?.click()} className="h-11 rounded-full bg-white/10 px-4 text-[14.5px] font-bold hover:bg-white/15">{L("pick")}</button>
            {pic && (
              <>
                <button onClick={() => void draw()} className="h-11 rounded-full bg-white/10 px-4 text-[14.5px] font-bold hover:bg-white/15">{L("again")}</button>
                <button onClick={() => void savePicture()} disabled={phase !== "done"} className="h-11 rounded-full bg-white px-4 text-[14.5px] font-bold text-[#0b1220] disabled:opacity-45">{L("savePic")}</button>
                <button onClick={() => void draw(true)} disabled={rec} className="h-11 rounded-full bg-[#2f6bff] px-4 text-[14.5px] font-bold text-white disabled:opacity-45">{L("saveVid")}</button>
              </>
            )}
          </div>
        </div>
      </div>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => (void pickPhoto(e.target.files?.[0]), (e.target.value = ""))} />
    </div>
  );
}
