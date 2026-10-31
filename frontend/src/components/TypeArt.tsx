"use client";

/* Type Art: a drawing board that types a picture out live, line by line, in letters, with a blinking cursor and soft
   key clicks, like the typed portraits people share online.
   The art is the hero: a big board (dark, or paper) in the middle of Jagora's own sky, a slim glass bar on top and
   the tools in one compact glass toolbar below.
   Where the picture comes from:
   - Jagora draws it with Muse Image when she asks, in any of her languages ("ya obìnrin tó wé gèlè"): the server
     sends "typeart".
   - her own photo, attached in the chat (Jagora sends it the same way) or picked right here (that one never leaves
     her phone).
   Saving: a picture at screen size, HD, 4K or print size (A4 or A3 at 300 dpi), typed again at that size so the
   letters stay sharp in a frame; or a video of it being typed. The work itself is in lib/typeart.ts. */
import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadSimple, X } from "@phosphor-icons/react";
import { Mark } from "./Brand";
import { reportScreen } from "@/lib/appctl";
import { API, getToken } from "@/lib/account";
import type { Painting, Style } from "@/lib/paint";
import { useApp } from "@/lib/store";
import type { Lang } from "@/lib/i18n";
import type { Art, ArtOpts, Board, Colour, Detail, Letters, SaveSize } from "@/lib/typeart";

export type TypeArtEvent = { url?: string; subject?: string; letters?: Letters; colour?: Colour; detail?: Detail; board?: Board; mode?: "type" | "paint"; style?: Style; title?: string; restyle?: boolean; open?: boolean; own?: boolean; drawn_by?: string };
export const openTypeArt = (d: TypeArtEvent = {}) => dispatchEvent(new CustomEvent("jagora:typeart", { detail: { open: true, ...d } }));
export const closeTypeArt = () => dispatchEvent(new CustomEvent("jagora:typeart", { detail: { open: false } }));

const T: Record<string, Record<Lang, string>> = {
  title: { en: "Type Art", pcm: "Type Art", yo: "Type Art", ha: "Type Art", ig: "Type Art" },
  symbols: { en: "Symbols", pcm: "Symbols", yo: "Àmì", ha: "Alamomi", ig: "Akara" },
  numbers: { en: "Numbers", pcm: "Numbers", yo: "Nọ́mbà", ha: "Lambobi", ig: "Nọmba" },
  words: { en: "Words", pcm: "Words", yo: "Ọ̀rọ̀", ha: "Kalmomi", ig: "Okwu" },
  full: { en: "Colour", pcm: "Colour", yo: "Àwọ̀", ha: "Launi", ig: "Agba" },
  one: { en: "Blue", pcm: "Blue", yo: "Búlúù", ha: "Shuɗi", ig: "Acha anụnụ" },
  bw: { en: "Black-white", pcm: "Black-white", yo: "Dúdú-funfun", ha: "Baƙi-fari", ig: "Oji-ọcha" },
  dark: { en: "Dark board", pcm: "Dark board", yo: "Pátákó dúdú", ha: "Allo baƙi", ig: "Bọọdụ ojii" },
  paper: { en: "Paper", pcm: "Paper", yo: "Ìwé", ha: "Takarda", ig: "Akwụkwọ" },
  coarse: { en: "Large", pcm: "Big", yo: "Ńlá", ha: "Babba", ig: "Ibu" },
  medium: { en: "Medium", pcm: "Medium", yo: "Àárín", ha: "Matsakaici", ig: "Etiti" },
  fine: { en: "Fine", pcm: "Fine", yo: "Kékeré", ha: "Ƙanana", ig: "Obere" },
  plain: { en: "Plain background", pcm: "Plain background", yo: "Ẹ̀yìn kan ṣoṣo", ha: "Bango mara komai", ig: "Azụ dị nkịtị" },
  sound: { en: "Sound", pcm: "Sound", yo: "Ohùn", ha: "Sauti", ig: "Ụda" },
  sign: { en: "Signature", pcm: "Signature", yo: "Ìbuwọ́lù", ha: "Sa hannu", ig: "Mbinye aka" },
  again: { en: "Draw again", pcm: "Draw am again", yo: "Tún un yà", ha: "Sake zana", ig: "See ọzọ" },
  save: { en: "Save picture", pcm: "Save picture", yo: "Fi àwòrán pamọ́", ha: "Ajiye hoto", ig: "Chekwaa foto" },
  vidShort: { en: "Video", pcm: "Video", yo: "Fídíò", ha: "Bidiyo", ig: "Vidiyo" },
  saveShort: { en: "Save", pcm: "Save", yo: "Fi pamọ́", ha: "Ajiye", ig: "Debe" },
  againShort: { en: "Again", pcm: "Again", yo: "Tún yà", ha: "Sake", ig: "Ọzọ" },
  pickShort: { en: "Photo", pcm: "Photo", yo: "Fọ́tò", ha: "Hoto", ig: "Foto" },
  saveVid: { en: "Save video", pcm: "Save video", yo: "Fi fídíò pamọ́", ha: "Ajiye bidiyo", ig: "Chekwaa vidiyo" },
  size: { en: "Picture size", pcm: "Picture size", yo: "Ìwọ̀n àwòrán", ha: "Girman hoto", ig: "Nha foto" },
  making: { en: "Typing it at full size...", pcm: "I dey type am for full size...", yo: "Ń tẹ̀ ẹ́ ní ìwọ̀n kíkún...", ha: "Ana rubuta shi a cikakken girma...", ig: "Ana ede ya n'ogo zuru ezu..." },
  recording: { en: "Recording the video...", pcm: "I dey record the video...", yo: "Ń gba fídíò sílẹ̀...", ha: "Ana ɗaukar bidiyo...", ig: "Ana edekọ vidiyo..." },
  pick: { en: "Pick a photo", pcm: "Pick photo", yo: "Yan fọ́tò", ha: "Zaɓi hoto", ig: "Họrọ foto" },
  ask: { en: "Tell Jagora what to draw", pcm: "Tell Jagora wetin make e draw", yo: "Sọ ohun tí Jagora máa yà", ha: "Faɗa wa Jagora abin da za ta zana", ig: "Gwa Jagora ihe ọ ga-ese" },
  draw: { en: "Draw", pcm: "Draw", yo: "Yà á", ha: "Zana", ig: "See" },
  ours: { en: "Or try one of ours", pcm: "Or try one of our own", yo: "Tàbí gbìyànjú ọ̀kan nínú tiwa", ha: "Ko gwada ɗaya daga cikin namu", ig: "Ma ọ bụ nwalee otu n'ime nke anyị" },
  empty: { en: "Your picture, typed out in letters.", pcm: "Your picture, typed out for letters.", yo: "Àwòrán yín, tí a tẹ̀ ní lẹ́tà.", ha: "Hotonka, an rubuta shi da haruffa.", ig: "Foto gị, e dere ya n'mkpụrụedemede." },
  getting: { en: "Jagora is drawing your picture...", pcm: "Jagora dey draw your picture...", yo: "Jagora ń ya àwòrán yín...", ha: "Jagora na zana hotonka...", ig: "Jagora na-ese foto gị..." },
  catLetters: { en: "Letters", pcm: "Letters", yo: "Lẹ́tà", ha: "Haruffa", ig: "Ederede" },
  catColour: { en: "Colour", pcm: "Colour", yo: "Àwọ̀", ha: "Launi", ig: "Agba" },
  catBoard: { en: "Board", pcm: "Board", yo: "Pátákó", ha: "Allo", ig: "Bọọdụ" },
  catDetail: { en: "Detail", pcm: "Detail", yo: "Kúlẹ̀kúlẹ̀", ha: "Bayani", ig: "Nkọwa" },
  catStyle: { en: "Style", pcm: "Style", yo: "Ọ̀nà", ha: "Salo", ig: "Ụdị" },
  catMore: { en: "More", pcm: "More", yo: "Míràn", ha: "Ƙari", ig: "Ndị ọzọ" },
  type: { en: "Type", pcm: "Type", yo: "Tẹ̀", ha: "Rubuta", ig: "Dee" },
  paint: { en: "Paint", pcm: "Paint", yo: "Kun", ha: "Fenti", ig: "See agba" },
  bold: { en: "Bold colour", pcm: "Bold colour", yo: "Àwọ̀ tó ń tàn", ha: "Launi haske", ig: "Agba siri ike" },
  oil: { en: "Oil", pcm: "Oil", yo: "Òróró", ha: "Mai", ig: "Mmanụ" },
  water: { en: "Watercolour", pcm: "Watercolour", yo: "Àwọ̀ omi", ha: "Launin ruwa", ig: "Agba mmiri" },
  painting: { en: "Jagora is painting...", pcm: "Jagora dey paint...", yo: "Jagora ń kun ún...", ha: "Jagora na zana da fenti...", ig: "Jagora na-ese agba..." },
  consentQ: { en: "Is this you, or do you have their permission?", pcm: "Na you be this, or the person don give you permission?", yo: "Ṣé ẹ̀yin ni, tàbí ẹ ní àṣẹ ẹni náà?", ha: "Kai ne wannan, ko ka sami izinin mutumin?", ig: "Ọ bụ gị, ka ị nwetara ikike onye ahụ?" },
  consentLine: { en: "This photo is used only to make this art. It isn't stored or used for anything else.", pcm: "We use this photo only to make this art. We no dey keep am or use am for any other thing.", yo: "Fọ́tò yìí wà fún ṣíṣe iṣẹ́ ọnà yìí nìkan. A kò ní tọ́jú rẹ̀ tàbí lò ó fún nǹkan mìíràn.", ha: "Ana amfani da wannan hoto ne kawai don yin wannan zanen. Ba a ajiye shi ko amfani da shi don wani abu ba.", ig: "Ejiri foto a naanị mee nka a. A naghị echekwa ya ma ọ bụ jiri ya mee ihe ọzọ." },
  consentDevice: { en: "Type Art and the painting are made on your phone: no upload.", pcm: "Type Art and the painting dey happen for your phone: we no upload am.", yo: "Lórí fóònù yín ni a ti ń ṣe é: a kò gbé e sókè.", ha: "A wayarka ake yin su: ba a loda hoton ba.", ig: "Ọ bụ na ekwentị gị ka e mere ya: anaghị ebugo ya." },
  consentSam: { en: "To paint you carefully and the background loosely, the photo goes to Jagora's server once, only to cut you out from the background and to title the painting, and is deleted right after.", pcm: "To paint you well and the background loose, the photo go Jagora server one time, only to cut you comot from the background and give the painting name, then we delete am sharp sharp.", yo: "Kí a lè kun yín dáadáa, fọ́tò náà yóò lọ sí sàfà Jagora lẹ́ẹ̀kan, láti yà yín kúrò lára ẹ̀yìn rẹ̀ àti láti fún àwòrán ní orúkọ nìkan, a ó sì pa á rẹ́ lẹ́sẹ̀kẹsẹ̀.", ha: "Don a zana ka da kyau, hoton zai je sabar Jagora sau ɗaya, kawai don raba ka da bango da ba zanen suna, sannan a goge shi nan take.", ig: "Iji see gị nke ọma, foto ahụ ga-aga sava Jagora otu ugboro, naanị iji wepụ gị n'azụ ya na inye nka ahụ aha, a ga-ehichapụ ya ozugbo." },
  yes: { en: "Yes", pcm: "Yes", yo: "Bẹ́ẹ̀ni", ha: "Ee", ig: "Ee" },
  cancel: { en: "Cancel", pcm: "Cancel", yo: "Fagilé", ha: "Soke", ig: "Kagbuo" },
  example: { en: "a Nigerian woman in a gele", pcm: "Naija woman wey tie gele", yo: "obìnrin Yorùbá tó wé gèlè", ha: "mace 'yar Najeriya mai ɗankwali", ig: "nwanyị Naịjirịa kechiri ịchafụ" },
};

const SAMPLES = [
  { url: "/typeart/portrait-03.webp", name: "Gele portrait" },
  { url: "/typeart/people-06.webp", name: "Agbada and fila" },
  { url: "/typeart/portrait-06.webp", name: "Baba in a white fila" },
];

/* culture-rich prompts for Jagora to draw (Muse Image); they run when Jagora is connected */
const PROMPTS = [
  "Hausa man in babban riga and a hula cap",
  "Igbo chief in isiagu with a red cap and coral beads",
  "Yoruba woman in gele, iro and buba",
  "Fulani woman with facial beads and braided hair",
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
  if (matchMedia("(pointer: coarse)").matches && blob.size < 40_000_000 && nav.canShare?.({ files: [file] })) {
    void navigator.share({ files: [file], title: "Type Art" }).catch(() => {});
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 8000);
}

/** a title as a file name: letters and numbers kept (with their tone marks), spaces as dashes */
const slug = (t: string) => t.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 48);

/** SAM 3.1 cuts the person out of her photo and Muse Wonder titles it; the server keeps nothing */
async function cutOut(dataUrl: string, lang: string): Promise<{ mask: string; title: string } | null> {
  try {
    const r = await fetch(`${API}/art/cutout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl, lang }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return { mask: String(d.mask || ""), title: String(d.title || "") };
  } catch {
    return null;
  }
}

/** a video of the board while it is drawn (mp4 where the browser can, else webm) */
function startRecorder(canvas: HTMLCanvasElement, setRec: (on: boolean) => void) {
  const types = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const type = types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  try {
    const chunks: Blob[] = [];
    const r = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 6_000_000 });
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.start(200);
    setRec(true);
    return {
      stop: () =>
        new Promise<Blob | null>((res) => {
          r.onstop = () => {
            setRec(false);
            res(new Blob(chunks, { type: r.mimeType || "video/webm" }));
          };
          r.stop();
        }),
    };
  } catch {
    return null;
  }
}

/** one option in the toolbar; the chosen one in our blue */
const Seg = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    onClick={onClick}
    aria-pressed={on}
    className={`h-9 min-w-0 flex-1 truncate whitespace-nowrap rounded-full px-2.5 text-[13.5px] font-bold transition lg:flex-none lg:px-3.5 ${on ? "bg-accent text-[#fff] shadow-[0_6px_14px_-8px_rgba(29,99,237,.9)]" : "text-ink hover:bg-white/40 dark:hover:bg-white/10"}`}
  >
    {children}
  </button>
);
const CAT = { letters: "catLetters", colour: "catColour", board: "catBoard", detail: "catDetail", style: "catStyle", more: "catMore" } as const;
const ACT = "btn btn-glass h-11 min-w-0 gap-1.5 whitespace-nowrap px-1.5 text-[13.5px] font-bold";
const Gap = () => <span className="mx-1 h-6 w-px shrink-0 bg-ink/15" aria-hidden="true" />;

export function TypeArt() {
  const lang = useApp((s) => s.lang);
  const profile = useApp((s) => s.profile);
  const [on, setOn] = useState(false);
  const [pic, setPic] = useState<{ bmp: ImageBitmap; subject: string } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [opts, setOpts] = useState<Omit<ArtOpts, "lang">>({ letters: "symbols", colour: "full", detail: "medium", board: "dark", plain: true });
  const [sign, setSign] = useState("");
  const [sound, setSound] = useState(true);
  const [phase, setPhase] = useState<"idle" | "typing" | "done">("idle");
  const [rec, setRec] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [making, setMaking] = useState(-1);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"type" | "paint">("type");
  const [style, setStyle] = useState<Style>("bold");
  const [title, setTitle] = useState("");
  const [ask, setAsk] = useState<File | null>(null); // a photo waiting for her yes
  const own = useRef<{ dataUrl: string; cut?: Promise<{ mask: string; title: string } | null> } | null>(null);
  const paintPlan = useRef<Painting | null>(null);
  const [planning, setPlanning] = useState(false);
  const [cat, setCat] = useState<"letters" | "colour" | "board" | "detail" | "style" | "more">("letters");
  const board = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const art = useRef<{ a: Art; sig: string } | null>(null);
  const run = useRef(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  // her name as the default signature
  useEffect(() => {
    // her own name from My details; with no name there is no signature (never a brand name on her art)
    if (!sign) setSign(((profile?.first_name || profile?.full_name || "").trim().split(" ")[0] || "").toUpperCase());
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
      if (d.board) next.board = d.board;
      if (Object.keys(next).length) setOpts((o) => ({ ...o, ...next }));
      if (d.mode) setMode(d.mode);
      if (d.style) setStyle(d.style);
      if (d.url) {
        setWaiting(true);
        try {
          const bmp = await loadPicture(d.url);
          own.current = null;
          setTitle(d.title || "");
          setPic({ bmp, subject: d.subject || "" });
        } catch {
          setPic(null);
        }
        setWaiting(false);
      }
    };
    addEventListener("jagora:typeart", onEv);
    return () => removeEventListener("jagora:typeart", onEv);
  }, []);

  // Jagora knows what is on the artboard, so "make am blue" means this one
  useEffect(() => {
    reportScreen("typeart", on ? `open${pic ? (mode === "paint" ? `, painting "${pic.subject || "her photo"}" in ${style} style, ${opts.detail} detail` : `, typing "${pic.subject || "her photo"}" in ${opts.letters}, ${opts.colour} colour, ${opts.board} board, ${opts.detail} detail`) : ", empty"}` : "");
  }, [on, pic, opts, mode, style]);

  /* build the cells and type them out */
  const draw = useCallback(
    async (record = false) => {
      const box = board.current, canvas = cv.current;
      if (!pic || !box || !canvas) return;
      if (mode === "paint") return paintRun(record);
      const my = ++run.current;
      setPhase("typing");
      const { buildArt, FONT } = await import("@/lib/typeart");
      const bw = box.clientWidth - 24, bh = box.clientHeight - 24;
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
      art.current = { a, sig };
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
          g.fillStyle = opts.board === "dark" ? "rgba(236,238,242,0.92)" : "rgba(14,15,18,0.85)";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pic, opts, lang, sign, mode, style],
  );

  /* paint mode: plan every stroke, then paint them one by one with the brush on the board */
  const paintRun = async (record: boolean) => {
    const box = board.current, canvas = cv.current;
    if (!pic || !box || !canvas) return;
    const my = ++run.current;
    setPhase("typing");
    setPlanning(true);
    const P = await import("@/lib/paint");
    // her own photo: the person cut out by SAM 3.1 (only with her yes, when Jagora is connected), else an estimate
    let mask: Float32Array | null = null;
    const long = P.paintSize(), kk = long / Math.max(pic.bmp.width, pic.bmp.height);
    const pw = Math.round(pic.bmp.width * kk), ph = Math.round(pic.bmp.height * kk);
    if (own.current) {
      if (!own.current.cut && API && getToken()) own.current.cut = cutOut(own.current.dataUrl, lang);
      const got = own.current.cut ? await Promise.race([own.current.cut, new Promise<null>((r) => setTimeout(() => r(null), 20000))]) : null;
      if (got?.mask) mask = await P.maskFromImage(got.mask, pw, ph);
      if (got?.title) setTitle(got.title);
    }
    if (my !== run.current) return;
    const plan = await P.planPainting(pic.bmp, style, opts.detail, mask, pw, ph, 7);
    if (my === run.current) setPlanning(false);
    if (my !== run.current) return;
    paintPlan.current = plan;
    const sigRoom = plan.H * 0.06;
    const k = Math.min((box.clientWidth - 24) / plan.W, (box.clientHeight - 24) / (plan.H + sigRoom));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const W = Math.ceil(plan.W * k), H = Math.ceil((plan.H + sigRoom) * k);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    const lg = layer.getContext("2d")!;
    lg.scale(dpr, dpr);
    const ground = style === "water" ? "#ffffff" : "#0e0f12";
    lg.fillStyle = ground;
    lg.fillRect(0, 0, W, H);
    const g = canvas.getContext("2d")!;
    const sig = sign.trim().slice(0, 24);
    const ms = { coarse: 9000, medium: 11500, fine: 14000 }[opts.detail];
    const total = plan.strokes.length;
    // [first stroke, count] of each brush size
    const layers: [number, number][] = [];
    plan.strokes.forEach((st, i) => {
      if (!layers[st.layer]) layers[st.layer] = [i, 0];
      layers[st.layer][1]++;
    });
    let done = 0, lastClick = 0, finishedAt = 0;
    const rec = record ? startRecorder(canvas, setRec) : null;
    const t0 = performance.now();
    const frame = (now: number) => {
      if (my !== run.current) return;
      // each brush size gets its own share of the time, so she sees the big colour shapes blocked in first, then
      // each finer brush adding detail, like a painter
      const f = Math.min(1, (now - t0) / ms);
      const li = Math.min(layers.length - 1, Math.floor(f * layers.length));
      const within = f >= 1 ? 1 : f * layers.length - li;
      const want = f >= 1 ? total : Math.min(total, layers[li][0] + Math.floor(within * layers[li][1]));
      lg.save();
      lg.beginPath();
      lg.rect(0, 0, plan.W * k, plan.H * k);
      lg.clip();
      // a budget per frame, so the page stays smooth on any phone (if it falls behind, the painting just takes longer)
      const t1 = performance.now();
      while (done < want && performance.now() - t1 < 9) for (let n = 0; n < 24 && done < want; n++) P.drawStroke(lg, plan.strokes[done++], plan.style, k);
      lg.restore();
      const finished = done >= total;
      if (finished && !finishedAt) {
        finishedAt = now;
        lg.save();
        lg.beginPath();
        lg.rect(0, 0, plan.W * k, plan.H * k);
        lg.clip();
        P.grain(lg, plan.W * k, plan.H * k, plan.style, plan.seed);
        lg.restore();
        if (sig) {
          lg.font = `800 ${Math.max(9, sigRoom * k * 0.45)}px "Jagora Mono", ui-monospace, monospace`;
          lg.fillStyle = style === "water" ? "#0e0f12" : "#eceef2";
          lg.textBaseline = "middle";
          lg.textAlign = "right";
          lg.fillText(sig, plan.W * k, (plan.H + sigRoom / 2) * k);
          lg.textAlign = "left";
        }
        setPhase("done");
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(layer, 0, 0);
      if (!finished && done > 0) {
        // the brush at the tip of the stroke being painted
        const s = plan.strokes[done - 1], p = s.pts, n = p.length;
        const ang = n >= 4 ? Math.atan2(p[n - 1] - p[n - 3], p[n - 2] - p[n - 4]) : 0;
        g.scale(dpr, dpr);
        P.drawBrush(g, p[n - 2] * k, p[n - 1] * k, ang, Math.max(18, Math.min(46, s.r * k * 2.2)), s.c);
        if (soundRef.current && now - lastClick > 90) {
          lastClick = now;
          click();
        }
      }
      if (finished && rec && now - finishedAt > 1400) {
        const r = rec;
        void r.stop().then((b) => b && save(b, `jagora-painting.${b.type.includes("mp4") ? "mp4" : "webm"}`));
        return;
      }
      if (!finished || rec) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  // a new picture or new settings: type it again
  useEffect(() => {
    if (on && pic) void draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, pic, opts.letters, opts.colour, opts.detail, opts.board, opts.plain, lang, mode, style]);

  useEffect(() => {
    // other parts of the app (Amina) know the board is covering the screen
    if (on) document.documentElement.dataset.typeart = "on";
    else delete document.documentElement.dataset.typeart;
    return () => {
      delete document.documentElement.dataset.typeart;
    };
  }, [on]);

  useEffect(() => {
    if (!on) {
      run.current++;
      setPhase("idle");
      setSaveOpen(false);
    }
  }, [on]);

  useEffect(() => {
    if (!on) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (saveOpen ? setSaveOpen(false) : setOn(false));
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [on, saveOpen]);

  const savePicture = async (size: SaveSize) => {
    const st = art.current;
    if ((!st && !(mode === "paint" && paintPlan.current)) || making >= 0) return;
    setMaking(0);
    try {
      const name = `${slug(title) || (mode === "paint" ? "jagora-painting" : "jagora-type-art")}-${size}.png`;
      let blob: Blob;
      if (mode === "paint" && paintPlan.current) {
        const { exportPainting } = await import("@/lib/paint");
        blob = await exportPainting(paintPlan.current, sign.trim().slice(0, 24), size, style === "water" ? "#0e0f12" : "#eceef2", (f) => setMaking(f));
      } else {
        const { exportPNG } = await import("@/lib/typeart");
        blob = await exportPNG(st!.a, sign.trim().slice(0, 24), size, (f) => setMaking(f));
      }
      save(blob, name);
      setSaveOpen(false);
    } catch {}
    setMaking(-1);
  };

  /* a photo she picks: first her yes (it is her, or she has their permission), then it is used on her phone */
  const pickPhoto = (f?: File | null) => f && setAsk(f);
  const takePhoto = async (f: File) => {
    setAsk(null);
    try {
      const bmp = await createImageBitmap(f); // stays on her phone
      const dataUrl = await new Promise<string>((res) => {
        const c = document.createElement("canvas");
        const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
        c.width = Math.round(bmp.width * k);
        c.height = Math.round(bmp.height * k);
        c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.88));
      });
      own.current = { dataUrl }; // sent to the server only for the painting's cut-out, and only when she paints it
      setTitle("");
      setPic({ bmp, subject: f.name });
    } catch {}
  };
  const sample = async (url: string, name: string) => {
    try {
      own.current = null;
      setTitle("");
      setPic({ bmp: await loadPicture(url), subject: name });
    } catch {}
  };
  const askJagora = async (what: string) => {
    what = what.trim();
    if (!what) return;
    setPrompt("");
    setWaiting(true);
    setTimeout(() => setWaiting(false), 60_000);
    (await import("@/lib/engine")).ask(mode === "paint" ? `Paint a picture (${style} style): ${what}` : `Draw type art: ${what}`);
  };

  if (!on) return null;
  const set = <K extends keyof typeof opts>(k: K, v: (typeof opts)[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const L = (k: string) => T[k][lang] ?? T[k].en;
  const dark = mode === "paint" ? style !== "water" : opts.board === "dark";
  const cats = (mode === "paint" ? ["style", "detail", "more"] : ["letters", "colour", "board", "detail", "more"]) as (typeof cat)[];
  const cur = cats.includes(cat) ? cat : cats[0];
  const groups: Record<typeof cat, React.ReactNode> = {
    letters: (["symbols", "numbers", "words"] as Letters[]).map((v) => <Seg key={v} on={opts.letters === v} onClick={() => set("letters", v)}>{L(v)}</Seg>),
    colour: (["full", "one", "bw"] as Colour[]).map((v) => <Seg key={v} on={opts.colour === v} onClick={() => set("colour", v)}>{L(v)}</Seg>),
    board: (["dark", "paper"] as Board[]).map((v) => <Seg key={v} on={opts.board === v} onClick={() => set("board", v)}>{L(v)}</Seg>),
    detail: (["coarse", "medium", "fine"] as Detail[]).map((v) => <Seg key={v} on={opts.detail === v} onClick={() => set("detail", v)}>{L(v)}</Seg>),
    style: (["bold", "oil", "water"] as Style[]).map((v) => <Seg key={v} on={style === v} onClick={() => setStyle(v)}>{L(v)}</Seg>),
    more: [
      ...(mode === "type" ? [<Seg key="plain" on={opts.plain} onClick={() => set("plain", !opts.plain)}>{L("plain")}</Seg>] : []),
      <Seg key="sound" on={sound} onClick={() => setSound(!sound)}>{L("sound")}</Seg>,
    ],
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col text-ink" role="dialog" aria-label="Type Art" onPointerDown={() => actx?.state === "suspended" && void actx.resume()}>
      {/* Jagora's own sky behind everything */}
      <div className="sky-bg absolute inset-0 -z-10" aria-hidden="true" />

      {/* the slim glass bar */}
      <div className="px-3 pt-[max(10px,env(safe-area-inset-top))]">
        <div className="glass mx-auto flex max-w-[1180px] items-center gap-3 rounded-full py-1.5 pl-2 pr-1.5">
          {/* the orb as the still mark (no extra 3D canvas: the page behind may already hold several) */}
          <Mark size={30} />
          <div className="min-w-0 flex-1">
            <p className="font-head text-[17px] font-bold leading-tight">{L("title")}</p>
            {pic && <p className="truncate text-[12.5px] font-semibold text-ink-2">{pic.subject}</p>}
          </div>
          {/* Type or Paint */}
          <div className="flex shrink-0 rounded-full bg-ink/[0.07] p-0.5 dark:bg-[#fff]/10">
            {(["type", "paint"] as const).map((v) => (
              <button
                key={v}
                onClick={() => (setMode(v), setCat(v === "paint" ? "style" : "letters"))}
                aria-pressed={mode === v}
                className={`h-8 rounded-full px-3 text-[13px] font-bold transition ${mode === v ? "bg-accent text-[#fff]" : "text-ink"}`}
              >
                {L(v)}
              </button>
            ))}
          </div>
          <button onClick={() => setOn(false)} className="btn btn-glass h-10 w-10 shrink-0" aria-label="Close">
            <X size={19} weight="bold" />
          </button>
        </div>
      </div>

      {/* the board: the art is the hero */}
      <div ref={board} className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-3">
        <div
          className={`relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-[22px] p-3 shadow-[0_30px_70px_-30px_rgba(10,25,60,.65)] ring-1 ${dark ? "bg-[#0e0f12] ring-[#fff]/25" : "bg-[#fff] ring-[#0e0f12]/10"} ${pic ? "" : "h-full w-full max-w-[680px]"}`}
        >
          {pic ? (
            <canvas ref={cv} className="block max-h-full max-w-full" />
          ) : (
            <div className={`flex max-w-[560px] flex-col items-center gap-4 overflow-y-auto px-3 py-4 text-center ${dark ? "text-[#eceef2]" : "text-[#0e0f12]"}`}>
              <p className="font-head text-[23px] font-bold leading-tight sm:text-[28px]">{waiting ? L(mode === "paint" ? "painting" : "getting") : L("empty")}</p>
              {waiting ? (
                <span className={`h-6 w-3 animate-pulse ${dark ? "bg-[#eceef2]/85" : "bg-[#0e0f12]/80"}`} />
              ) : (
                <>
                  <button onClick={() => file.current?.click()} className="btn h-12 bg-accent px-6 text-[15.5px] font-bold text-[#fff]">{L("pick")}</button>
                  <p className={`text-[13.5px] font-bold ${dark ? "text-[#eceef2]/65" : "text-[#55545b]"}`}>{L("ours")}</p>
                  <div className="flex gap-3">
                    {SAMPLES.map((s) => (
                      <button key={s.url} onClick={() => void sample(s.url, s.name)} className="h-20 w-16 overflow-hidden rounded-[14px] ring-1 ring-[#fff]/20 transition hover:ring-accent" aria-label={s.name}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <p className={`mt-1 text-[13.5px] font-bold ${dark ? "text-[#eceef2]/65" : "text-[#55545b]"}`}>{L("ask")}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {PROMPTS.map((p) => (
                      <button key={p} onClick={() => void askJagora(p)} className={`rounded-full px-3.5 py-2 text-[13px] font-bold transition ${dark ? "bg-[#fff]/10 text-[#eceef2] hover:bg-[#fff]/20" : "bg-[#e4ecff] text-[#154bb8] hover:bg-[#d6e2ff]"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {pic && planning && mode === "paint" && !waiting && (
            <div className="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-full bg-[#fff]/90 px-4 py-2 text-[13.5px] font-bold text-[#0e0f12]">{L("painting")}</div>
          )}
          {pic && waiting && <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-[#fff]/90 px-4 py-2 text-[13.5px] font-bold text-[#0e0f12]">{L("getting")}</div>}
          {pic && title && (
            <p className={`pointer-events-none absolute bottom-2 left-4 max-w-[60%] truncate text-[12.5px] font-bold ${dark ? "text-[#eceef2]/80" : "text-[#0e0f12]/75"}`}>
              {title}, {new Date().getFullYear()}
            </p>
          )}
          {rec && <div className="absolute left-3 top-3 rounded-full bg-danger px-3 py-1.5 text-[12.5px] font-bold text-[#fff]">{L("recording")}</div>}
        </div>
      </div>

      {/* the tools. Phones: a row of option groups, the chosen group's options in one glass row that always fits,
          the prompt on its own row, then the actions spread evenly. Computers: everything in one glass toolbar. */}
      <div className="px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2">
          {/* phones */}
          <div className="flex flex-col gap-2 lg:hidden">
            <div className="glass mx-auto flex max-w-full items-center gap-0.5 rounded-full p-1">
              {cats.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  aria-pressed={cur === c}
                  className={`h-8 min-w-0 truncate rounded-full px-2.5 text-[12.5px] font-bold transition ${cur === c ? "bg-accent text-[#fff]" : "text-ink"}`}
                >
                  {L(CAT[c])}
                </button>
              ))}
            </div>
            <div className="glass flex items-center gap-1 rounded-full p-1">{groups[cur]}</div>
          </div>
          {/* computers */}
          <div className="glass hidden items-center gap-1 rounded-full p-1.5 lg:flex">
            {cats.map((c, i) => (
              <span key={c} className="flex items-center gap-1">
                {i > 0 && <Gap />}
                {groups[c]}
              </span>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void askJagora(prompt);
            }}
            className="glass flex w-full items-center gap-1 rounded-full p-1 pl-4"
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={L("ask")}
              aria-label={`${L("ask")}: ${L("example")}`}
              className="h-10 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:text-ink-3"
            />
            <button type="submit" className="btn btn-ink h-10 shrink-0 px-5 text-[14.5px] font-bold">{L("draw")}</button>
          </form>
          {pic && (
            <div className="grid grid-cols-4 gap-2">
              {/* short labels on one line; the full words are their names for screen readers */}
              <button onClick={() => file.current?.click()} aria-label={L("pick")} className={ACT}>{L("pickShort")}</button>
              <button onClick={() => void draw()} aria-label={L("again")} className={ACT}>{L("againShort")}</button>
              <button onClick={() => void draw(true)} disabled={rec} aria-label={L("saveVid")} className={`${ACT} disabled:opacity-45`}>
                <DownloadSimple size={16} weight="bold" className="shrink-0" />
                {L("vidShort")}
              </button>
              <button onClick={() => setSaveOpen(true)} disabled={phase !== "done"} aria-label={L("save")} className="btn btn-ink h-11 min-w-0 gap-1.5 whitespace-nowrap px-1.5 text-[13.5px] font-bold disabled:opacity-45">
                <DownloadSimple size={16} weight="bold" className="shrink-0" />
                {L("saveShort")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* the size sheet for saving */}
      {saveOpen && (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/30 p-3 sm:items-center" onClick={() => making < 0 && setSaveOpen(false)}>
          <div className="glass-3 w-full max-w-[420px] rounded-[26px] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-head text-[18px] font-bold">{L("size")}</p>
              <button onClick={() => setSaveOpen(false)} className="btn btn-glass h-9 w-9" aria-label="Close">
                <X size={17} weight="bold" />
              </button>
            </div>
            <label className="mt-3 flex items-center gap-3 text-[14px] font-bold text-ink-2">
              {L("sign")}
              <input
                value={sign}
                onChange={(e) => setSign(e.target.value.toUpperCase().slice(0, 24))}
                onBlur={() => pic && void draw()}
                className="h-10 min-w-0 flex-1 rounded-full bg-white/70 px-4 text-[14px] font-bold tracking-wide text-ink outline-none dark:bg-white/10"
              />
            </label>
            <SizeList onPick={(s) => void savePicture(s)} busy={making} />
            {making >= 0 && (
              <div className="mt-3">
                <p className="text-[13.5px] font-bold text-ink-2">{L("making")}</p>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.round(making * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {ask && (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/30 p-3 sm:items-center">
          <div className="glass-3 w-full max-w-[440px] rounded-[26px] p-5" role="alertdialog" aria-label={L("consentQ")}>
            <p className="font-head text-[19px] font-bold leading-snug">{L("consentQ")}</p>
            <p className="mt-2 text-[14.5px] font-semibold leading-snug text-ink-2">{L("consentLine")}</p>
            <p className="mt-2 text-[13.5px] leading-snug text-ink-2">{L("consentDevice")}</p>
            {API && getToken() && <p className="mt-1.5 text-[13.5px] leading-snug text-ink-2">{L("consentSam")}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setAsk(null)} className="btn btn-glass h-11 flex-1 text-[15px] font-bold">{L("cancel")}</button>
              <button onClick={() => void takePhoto(ask)} className="btn btn-ink h-11 flex-1 text-[15px] font-bold">{L("yes")}</button>
            </div>
          </div>
        </div>
      )}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => (pickPhoto(e.target.files?.[0]), (e.target.value = ""))} />
    </div>
  );
}

function SizeList({ onPick, busy }: { onPick: (s: SaveSize) => void; busy: number }) {
  const [sizes, setSizes] = useState<{ id: SaveSize; label: string; note: string }[]>([]);
  useEffect(() => {
    void import("@/lib/typeart").then((m) => setSizes(m.SIZES));
  }, []);
  return (
    <div className="mt-3 flex flex-col gap-2">
      {sizes.map((s) => (
        <button key={s.id} disabled={busy >= 0} onClick={() => onPick(s.id)} className="btn btn-glass h-12 justify-between px-4 disabled:opacity-50">
          <span className="text-[15px] font-bold">{s.label}</span>
          <span className="text-[13px] font-semibold text-ink-3">{s.note}</span>
        </button>
      ))}
    </div>
  );
}
