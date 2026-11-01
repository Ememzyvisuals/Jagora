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
import { DownloadSimple, Microphone, Sparkle, X } from "@phosphor-icons/react";
import { Mark } from "./Brand";
import { reportScreen } from "@/lib/appctl";
import { API, getToken } from "@/lib/account";
import type { Painting, Style } from "@/lib/paint";
import { useApp } from "@/lib/store";
import type { Lang } from "@/lib/i18n";
import type { Art, ArtOpts, Board, Colour, Detail, Letters, SaveSize } from "@/lib/typeart";

export type TypeArtEvent = { more?: boolean; url?: string; subject?: string; letters?: Letters; colour?: Colour; detail?: Detail; board?: Board; mode?: "type" | "paint"; style?: Style; title?: string; restyle?: boolean; open?: boolean; own?: boolean; drawn_by?: string; preparing?: boolean };
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
  realistic: { en: "Realistic", pcm: "Like real", yo: "Bí òótọ́", ha: "Kamar gaske", ig: "Dị ka ezigbo" },
  keep: { en: "Keep detailing", pcm: "Add more detail", yo: "Ṣe é kúnná sí i", ha: "Ƙara bayani", ig: "Tinyekwuo nkọwa" },
  finest: { en: "As fine as it goes", pcm: "E don reach the finest", yo: "Ó ti dé òpin", ha: "Ya kai iyaka", ig: "O ruola njedebe" },
  talk: { en: "Talk to Jagora", pcm: "Talk to Jagora", yo: "Bá Jagora sọ̀rọ̀", ha: "Yi magana da Jagora", ig: "Gwa Jagora okwu" },
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
  prepPaint: { en: "Jagora is preparing the canvas", pcm: "Jagora dey prepare the canvas", yo: "Jagora ń ṣètò pátákó àwòrán", ha: "Jagora na shirya allon zane", ig: "Jagora na-akwado bọọdụ nka" },
  prepType: { en: "Jagora is getting the board ready", pcm: "Jagora dey ready the board", yo: "Jagora ń ṣètò pátákó", ha: "Jagora na shirya allo", ig: "Jagora na-akwado bọọdụ" },
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

/** her photo as a JPEG data URL for the cut-out, at most 1280 px (encoded by the browser off the main thread) */
async function photoData(bmp: ImageBitmap): Promise<string> {
  const c = document.createElement("canvas");
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.88));
  if (!blob) return "";
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => res("");
    r.readAsDataURL(blob);
  });
}

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
  const own = useRef<{ bmp: ImageBitmap; cut?: Promise<{ mask: string; title: string } | null> } | null>(null);
  const paintPlan = useRef<Painting | null>(null);
  const [prep, setPrep] = useState<{ subject: string } | null>(null); // Muse Image is drawing it: the board gets ready
  const prepTimer = useRef(0);
  const [cat, setCat] = useState<"letters" | "colour" | "board" | "detail" | "style" | "more">("letters");
  const [extra, setExtra] = useState(0); // Keep detailing in type mode: each one types it again with smaller letters
  const [finest, setFinest] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const liveOn = useApp((s) => s.live);
  const orb = useApp((s) => s.orb);
  /* what is on the board, kept so a zoom can draw it again sharp, and Keep detailing can paint on top */
  const typed = useRef<{ a: Art; sig: string; rest: HTMLCanvasElement } | null>(null);
  const painted = useRef<{ plan: Painting; k: number; dpr: number; W: number; H: number; layer: HTMLCanvasElement; sigRoom: number; sig: string; ink: string; rest?: HTMLCanvasElement } | null>(null);
  const view = useRef({ z: 1, ox: 0, oy: 0, zr: 1, oxr: 0, oyr: 0 });
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
      if (d.preparing) {
        // Muse Image is drawing it: the board gets the canvas ready meanwhile (never an empty board)
        setPic(null);
        setTitle("");
        setPrep({ subject: d.subject || "" });
        clearTimeout(prepTimer.current);
        prepTimer.current = window.setTimeout(() => setPrep(null), 120_000);
      } else if (d.preparing === false) setPrep(null);
      if (d.title && !d.url) setTitle(d.title); // the title comes after the picture, and fades in
      const next: Partial<Omit<ArtOpts, "lang">> = {};
      if (d.letters) next.letters = d.letters;
      if (d.colour) next.colour = d.colour;
      if (d.detail) next.detail = d.detail;
      if (d.board) next.board = d.board;
      if (Object.keys(next).length) setOpts((o) => ({ ...o, ...next }));
      if (d.mode) setMode(d.mode);
      if (d.style) setStyle(d.style);
      if (d.more) dispatchEvent(new CustomEvent("jagora:typeart-cmd", { detail: { action: "art_more" } }));
      if (d.detail || d.letters || d.colour || d.board || d.mode || d.style || d.url) setExtra(0);
      if (d.url) {
        performance.mark("art:url");
        setWaiting(true);
        try {
          const bmp = await loadPicture(d.url);
          performance.mark("art:pic");
          own.current = null;
          setTitle(d.title || "");
          setPrep(null);
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
    reportScreen(
      "typeart",
      on
        ? `open${prep && !pic ? `, getting the canvas ready while Muse Image draws "${prep.subject}"` : pic ? (mode === "paint" ? `, painting "${pic.subject || "her photo"}" in ${style} style, ${opts.detail} detail` : `, typing "${pic.subject || "her photo"}" in ${opts.letters}, ${opts.colour} colour, ${opts.board} board, ${opts.detail} detail`) + (extra ? `, detailed ${extra} more times` : "") + (zoomed ? ", zoomed in" : "") + (phase === "done" ? ", finished" : ", drawing now") : `, empty (${mode === "paint" ? "paint" : "type"} mode)`}`
        : "",
    );
  }, [on, pic, prep, opts, mode, style, extra, zoomed, phase]);

  /* build the cells and type them out */
  const draw = useCallback(
    async (record = false) => {
      const box = board.current, canvas = cv.current;
      if (!pic || !box || !canvas) return;
      if (mode === "paint") return paintRun(record);
      const my = ++run.current;
      setPhase("typing");
      if (paintPlan.current) void import("@/lib/paint").then((P) => paintPlan.current && P.stopPlanning(paintPlan.current));
      const { buildArt, FONT } = await import("@/lib/typeart");
      const bw = box.clientWidth - 24, bh = box.clientHeight - 24;
      const a = await buildArt(pic.bmp, bw, bh, { ...opts, lang, extra });
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
      const ms = { coarse: 5200, medium: 6500, fine: 8000, realistic: 9000 }[opts.detail] + extra * 900;
      resetView(canvas);
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
            if (c.t) {
              lg.fillStyle = c.t;
              lg.fillRect((i % a.cols) * a.cw, Math.floor(i / a.cols) * a.lh, a.cw + 0.3, a.lh + 0.3);
            }
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
          // the finished board without the cursor, kept for zooming back out
          const rest = document.createElement("canvas");
          rest.width = layer.width;
          rest.height = layer.height;
          rest.getContext("2d")!.drawImage(layer, 0, 0);
          typed.current = { a, sig, rest };
          painted.current = null;
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
        // the cursor blinks on for a while after the last letter, then the board rests (not while she zooms)
        if (view.current.z > 1) return;
        if (!doneAt || recorder || now - doneAt < 15000) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pic, opts, lang, sign, mode, style, extra],
  );

  /* paint mode: the first, biggest brush is planned in a moment and the brush starts on it; the finer layers are planned
     while it paints. Her photo's cut-out (SAM) and the title (Muse Wonder) are never waited for: the painting starts
     with an estimate of where she is, follows SAM's cut-out from the next layer on when it comes, and the title fades
     in when it is ready. */
  const paintRun = async (record: boolean) => {
    const box = board.current, canvas = cv.current;
    if (!pic || !box || !canvas) return;
    const my = ++run.current;
    performance.mark("art:paint");
    setPhase("typing");
    setFinest(false);
    resetView(canvas);
    const P = await import("@/lib/paint");
    if (paintPlan.current) P.stopPlanning(paintPlan.current);
    performance.mark("art:plan");
    const plan = await P.startPainting(pic.bmp, style, opts.detail, 7);
    performance.mark("art:planned");
    if (my !== run.current) return P.stopPlanning(plan);
    paintPlan.current = plan;
    const sigRoom = plan.H * 0.06;
    const k = Math.min((box.clientWidth - 24) / plan.W, (box.clientHeight - 24) / (plan.H + sigRoom));
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // (a painting is strokes, not letters: 2x is sharp, and every stroke costs less to paint)
    const W = Math.ceil(plan.W * k), H = Math.ceil((plan.H + sigRoom) * k);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    const lg = layer.getContext("2d")!;
    lg.fillStyle = plan.ground;
    lg.fillRect(0, 0, layer.width, layer.height);
    painted.current = { plan, k, dpr, W, H, layer, sigRoom, sig: sign.trim().slice(0, 24), ink: style === "water" ? "#0e0f12" : "#eceef2" };
    typed.current = null;
    // the finer layers, planned a slice at a time while the brush works
    void (async () => {
      let n = 1;
      while (my === run.current && (await P.nextLayer(plan))) performance.mark(`art:layer${n++}`);
    })();
    // the first brushes get the most time, so every big stroke is painted where she can see it
    animatePaint(my, 0, record, (li) => (li === 0 ? 10000 : li === 1 ? 6000 : 2500));
    // the brush is on; now her photo's cut-out is asked for (SAM 3.1, only with her yes, when Jagora is connected),
    // and followed from the next layer on if it comes
    await new Promise((r) => requestAnimationFrame(r));
    const mine = own.current;
    const cut = mine && API && getToken() ? (mine.cut ??= photoData(mine.bmp).then((d) => (d ? cutOut(d, lang) : null))) : null;
    void cut?.then(async (got) => {
      if (my !== run.current || !got) return;
      performance.mark("art:cut");
      if (got.title) setTitle(got.title);
      const m = got.mask ? await P.maskFromImage(got.mask, plan.W, plan.H) : null;
      if (m && my === run.current) P.setMask(plan, m);
    });
  };

  /** paint strokes [from..] of the painting with the brush (also used by Keep detailing, on top of what is there) */
  const animatePaint = async (my: number, from: number, record: boolean, budget: (li: number) => number) => {
    const st = painted.current, canvas = cv.current;
    if (!st || !canvas) return;
    const P = await import("@/lib/paint");
    const { plan, k, dpr, layer, sigRoom } = st;
    const lg = layer.getContext("2d")!;
    const g = canvas.getContext("2d")!;
    const { steps, total } = P.schedule(plan.strokes, from, (li) => budget(li));
    let covered = plan.strokes.length; // strokes scheduled so far (finer layers are added while it paints)
    if (from === 0 && steps.length) steps[0].hop = Math.min(steps[0].hop, 160); // straight onto the canvas
    let waited = 0, waitFrom = 0;
    const rec = record ? startRecorder(canvas, setRec) : null;
    let j = 0, lastClick = 0, finishedAt = 0;
    let prev: [number, number] | null = null; // where the brush lifted
    let marked = false;
    /* The brush keeps its own clock (vt). Strokes go onto the canvas a few milliseconds' worth per frame; when a frame
       comes late or the canvas is behind, the clock waits instead of jumping ahead, so no frame ever has to paint
       thousands of strokes at once. When the next layer is still being planned, the brush slows down near the end of
       the planned strokes, and only if it is still not ready does it rest above the canvas. */
    let vt = 0, last = -1, done = from;
    const commitTo = (target: number, ms: number) => {
      if (done >= target) return true;
      const until = performance.now() + ms;
      lg.save();
      lg.beginPath();
      lg.rect(0, 0, plan.W * k * dpr, plan.H * k * dpr);
      lg.clip();
      while (done < target) {
        P.drawStroke(lg, plan.strokes[done++], plan.style, k * dpr);
        if ((done & 7) === 0 && performance.now() > until) break;
      }
      lg.restore();
      return done >= target;
    };
    const art = () => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(layer, 0, 0);
    };
    const finish = () => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.save();
      g.beginPath();
      g.rect(0, 0, plan.W * k * dpr, plan.H * k * dpr);
      g.clip();
      P.grain(g, plan.W * k * dpr, plan.H * k * dpr, plan.style, plan.seed);
      g.restore();
      if (st.sig) {
        g.font = `800 ${Math.max(9, sigRoom * k * 0.45) * dpr}px "Jagora Mono", ui-monospace, monospace`;
        g.fillStyle = st.ink;
        g.textBaseline = "middle";
        g.textAlign = "right";
        g.fillText(st.sig, plan.W * k * dpr, (plan.H + sigRoom / 2) * k * dpr);
        g.textAlign = "left";
      }
    };
    const frame = (now: number) => {
      if (my !== run.current) return;
      if (!marked) {
        marked = true;
        performance.mark("art:frame");
      }
      const dt = last < 0 ? 0 : Math.min(250, now - last); // (a slow phone draws fewer frames: the brush keeps its pace, only a real stall is not skipped over)
      last = now;
      // the steps whose time has passed
      while (j < steps.length && vt >= steps[j].start + steps[j].hop + steps[j].dur) {
        const p = plan.strokes[steps[j].i].pts;
        prev = [p[p.length - 2], p[p.length - 1]];
        j++;
      }
      if (j >= steps.length && plan.strokes.length > covered) {
        // the next layer is planned: a new brush, and on (checked after the steps that just ended, so a layer
        // that was planned early is never skipped and the painting never stops before it is finished)
        const more = P.schedule(plan.strokes, covered, (li) => budget(li)).steps;
        for (const sp of more) steps.push({ ...sp, start: sp.start + vt });
        covered = plan.strokes.length;
        if (waitFrom) {
          waited += now - waitFrom;
          waitFrom = 0;
        }
      }
      // what should be on the canvas by now: the finished steps, and the small strokes of the current group (they
      // appear while the brush lifts); the stroke under the brush is drawn growing, on top
      const target = j < steps.length ? (vt >= steps[j].start ? steps[j].i : steps[j].from) : covered;
      // (a few ms of strokes per frame; a phone that draws fewer frames commits a bigger share of each)
      const caught = commitTo(target, Math.max(9, Math.min(60, dt * 0.35)));
      const ending = j < steps.length && !P.planned(plan) && steps.length - j < Math.max(4, steps.length * 0.08) && covered === plan.strokes.length;
      if (caught) vt += ending ? dt * 0.45 : dt;
      const t = vt;
      art();
      if (j >= steps.length && !P.planned(plan)) {
        // the next layer is not planned yet: the brush rests just above the canvas, as a painter looks before going on
        if (!waitFrom) waitFrom = now;
        const s = plan.strokes[plan.strokes.length - 1];
        const at = prev ?? [plan.W / 2, plan.H / 2];
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        P.drawBrush(g, at[0] * k, at[1] * k, -0.6 + Math.sin(now / 700) * 0.06, Math.max(15, Math.min(42, s.r * k * 3.2)), s.c, s.layer === 0, 0.55 + Math.sin(now / 420) * 0.12, 1);
      } else if (j < steps.length) {
        const sp = steps[j], s = plan.strokes[sp.i];
        const flat = s.layer === 0;
        const size = flat ? Math.max(18, Math.min(70, s.r * k * 2.6)) : Math.max(15, Math.min(42, s.r * k * 3.2));
        const wob = Math.sin(t / 95) * 0.07; // the hand is never perfectly still
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (t < sp.start + sp.hop) {
          // between strokes: the brush lifts and travels to the start of the next one (a new brush between layers)
          const u = Math.max(0, (t - sp.start) / sp.hop);
          const to: [number, number] = [s.pts[0], s.pts[1]];
          const fromPt = prev ?? [to[0] - 40 / k, to[1] - 60 / k];
          const e = u * u * (3 - 2 * u);
          const x = (fromPt[0] + (to[0] - fromPt[0]) * e) * k, y = (fromPt[1] + (to[1] - fromPt[1]) * e) * k;
          const ang = Math.atan2(to[1] - fromPt[1], to[0] - fromPt[0]);
          const grow = sp.swap ? (u < 0.5 ? 1 - u * 2 : (u - 0.5) * 2) : 1;
          P.drawBrush(g, x, y, ang + wob, size, s.c, flat, Math.sin(u * Math.PI), Math.max(0.05, grow));
        } else {
          // the stroke grows behind the brush tip
          const f = Math.min(1, (t - sp.start - sp.hop) / sp.dur);
          const part = P.partOf(s, f);
          g.save();
          g.beginPath();
          g.rect(0, 0, plan.W * k, plan.H * k);
          g.clip();
          P.drawStroke(g, part, plan.style, k);
          g.restore();
          const q = part.pts, n = q.length;
          const ang = n >= 4 ? Math.atan2(q[n - 1] - q[n - 3], q[n - 2] - q[n - 4]) : 0;
          P.drawBrush(g, q[n - 2] * k, q[n - 1] * k, ang + wob, size, s.c, flat, 0, 1);
          if (soundRef.current && now - lastClick > 120) {
            lastClick = now;
            click();
          }
        }
      } else if (!caught) {
        // the last strokes are still going onto the canvas
      } else if (!finishedAt) {
        finishedAt = now;
        performance.mark("art:done", { detail: { waited: Math.round(waited) } });
        finish();
        const rest = document.createElement("canvas");
        rest.width = canvas.width;
        rest.height = canvas.height;
        rest.getContext("2d")!.drawImage(canvas, 0, 0);
        st.rest = rest;
        setPhase("done");
      } else finish();
      if (finishedAt && rec && now - finishedAt > 1400) {
        void rec.stop().then((b) => b && save(b, `jagora-painting.${b.type.includes("mp4") ? "mp4" : "webm"}`));
        return;
      }
      if (!finishedAt || rec) requestAnimationFrame(frame);
    };
    if (!total && P.planned(plan)) {
      setFinest(true);
      setPhase("done");
      return;
    }
    requestAnimationFrame(frame);
  };

  /* While Muse Image draws the picture the board is never empty. Paint: the brush tones the bare canvas with thin
     umber washes, then a pencil marks light guide lines and hatches a little while it waits. Type: the cursor lays out
     the letter grid in faint dots. The picture replaces it the moment it comes. */
  const prepRun = async () => {
    const box = board.current, canvas = cv.current;
    if (!box || !canvas) return;
    const my = ++run.current;
    setPhase("idle");
    resetView(canvas);
    typed.current = null;
    painted.current = null;
    const P = await import("@/lib/paint"); // (the painter is loaded before the picture comes)
    if (paintPlan.current) P.stopPlanning(paintPlan.current); // the painting it replaces stops planning its layers
    if (my !== run.current) return;
    const paint = mode === "paint";
    const bw = box.clientWidth - 24, bh = box.clientHeight - 24 - 26; // room below for the line that says what is happening
    const W = Math.max(120, Math.floor(Math.min(bw, bh * 0.75))), H = Math.floor(W / 0.75);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ground = paint ? (style === "water" ? "#ffffff" : "#0e0f12") : opts.board === "dark" ? "#0e0f12" : "#ffffff";
    const onDark = ground === "#0e0f12";
    const layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    const lg = layer.getContext("2d")!;
    lg.scale(dpr, dpr);
    lg.fillStyle = ground;
    lg.fillRect(0, 0, W, H);
    const g = canvas.getContext("2d")!;
    const t0 = performance.now();
    if (!paint) {
      // the letter grid, laid out in faint dots by the cursor
      const cw = Math.max(7, W / 44), lh = cw * 1.55;
      const cols = Math.floor(W / cw), rows = Math.floor(H / lh), n = cols * rows;
      let done = 0;
      const frame = (now: number) => {
        if (my !== run.current) return;
        const want = Math.min(n, Math.floor(((now - t0) / 9000) * n));
        lg.fillStyle = onDark ? "rgba(236,238,242,0.2)" : "rgba(14,15,18,0.18)";
        for (; done < want; done++) lg.fillRect((done % cols) * cw + cw / 2 - 0.75, Math.floor(done / cols) * lh + lh / 2 - 0.75, 1.5, 1.5);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(layer, 0, 0);
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const at = Math.min(done, n - 1);
        if (done < n || Math.floor(now / 530) % 2 === 0) {
          g.fillStyle = onDark ? "rgba(236,238,242,0.92)" : "rgba(14,15,18,0.85)";
          g.fillRect((at % cols) * cw, Math.floor(at / cols) * lh, cw * 0.62, lh);
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      return;
    }
    type Mk = { pts: number[]; w: number; c: string; dur: number; tool: "brush" | "pencil" };
    const marks: Mk[] = [];
    if (style !== "water") {
      // toning: broad, thin washes of warm umber across the bare canvas, back and forth
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const y = ((r + 0.5) * H) / rows, ltr = r % 2 === 0, pts: number[] = [];
        for (let q = 0; q <= 12; q++) pts.push(ltr ? -8 + (q * (W + 16)) / 12 : W + 8 - (q * (W + 16)) / 12, y + Math.sin(q * 0.9 + r) * H * 0.012);
        marks.push({ pts, w: (H / rows) * 1.7, c: "rgba(122,86,52,0.11)", dur: 560, tool: "brush" });
      }
    }
    // the pencil: the thirds, a margin, then light hatching while it waits
    const pc = onDark ? "rgba(236,238,242,0.32)" : "rgba(14,15,18,0.3)", hc = onDark ? "rgba(236,238,242,0.16)" : "rgba(14,15,18,0.14)";
    for (const f of [1 / 3, 2 / 3]) marks.push({ pts: [W * f, H * 0.06, W * f, H * 0.94], w: 1.1, c: pc, dur: 700, tool: "pencil" });
    for (const f of [1 / 3, 2 / 3]) marks.push({ pts: [W * 0.06, H * f, W * 0.94, H * f], w: 1.1, c: pc, dur: 650, tool: "pencil" });
    const m = W * 0.05;
    marks.push({ pts: [m, m, W - m, m, W - m, H - m, m, H - m, m, m], w: 1, c: pc, dur: 1600, tool: "pencil" });
    let seed = 11;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let h = 0; h < 14; h++) {
      const cx = W * (h % 2 ? 2 / 3 : 1 / 3) + (rnd() - 0.5) * W * 0.4, cy = H * ((h >> 1) % 2 ? 2 / 3 : 1 / 3) + (rnd() - 0.5) * H * 0.4;
      const s2 = W * 0.035, pts: number[] = [];
      for (let q = 0; q < 6; q++) pts.push(cx + (q - 3) * s2 * 0.5 - s2, cy + s2, cx + (q - 3) * s2 * 0.5 + s2, cy - s2);
      marks.push({ pts, w: 0.9, c: hc, dur: 760, tool: "pencil" });
    }
    const hopMs = (k: number) => (marks[k].tool === "brush" ? 200 : k && marks[k - 1].tool === "brush" ? 420 : 300);
    const start: number[] = [];
    let acc = 0;
    marks.forEach((mk, k) => (start.push(acc), (acc += hopMs(k) + mk.dur + (k > 10 ? 500 : 0))));
    const line = (c: CanvasRenderingContext2D, mk: Mk, pts: number[]) => {
      c.strokeStyle = mk.c;
      c.lineWidth = mk.w;
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      c.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
      c.stroke();
    };
    const pencil = Math.min(120, W * 0.32), umber: [number, number, number] = [122, 86, 52];
    const tool = (mk: Mk, x: number, y: number, ang: number, lift: number) =>
      mk.tool === "brush" ? P.drawBrush(g, x, y, ang, 34, umber, true, lift, 1) : P.drawPencil(g, x, y, -0.95 + Math.sin(performance.now() / 380) * 0.04, pencil, lift);
    let j = 0, lastDraw = -1;
    let prev: [number, number] = [W * 0.85, H * 0.95];
    const frame = (now: number) => {
      if (my !== run.current) return;
      if (now - lastDraw < 30) return void requestAnimationFrame(frame);
      lastDraw = now;
      const t = now - t0;
      while (j < marks.length && t >= start[j] + hopMs(j) + marks[j].dur) {
        line(lg, marks[j], marks[j].pts);
        const p = marks[j].pts;
        prev = [p[p.length - 2], p[p.length - 1]];
        j++;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(layer, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (j < marks.length) {
        const mk = marks[j], u = t - start[j], hp = hopMs(j);
        if (u < hp) {
          const e = Math.max(0, u / hp), s3 = e * e * (3 - 2 * e);
          const x = prev[0] + (mk.pts[0] - prev[0]) * s3, y = prev[1] + (mk.pts[1] - prev[1]) * s3;
          tool(mk, x, y, Math.atan2(mk.pts[1] - prev[1], mk.pts[0] - prev[0]), Math.sin(e * Math.PI));
        } else {
          const part = P.partOf({ pts: mk.pts, r: 1, c: umber, a: 1, layer: 0, box: [0, 0, 0, 0] }, Math.min(1, (u - hp) / mk.dur)).pts;
          line(g, mk, part);
          const n = part.length;
          tool(mk, part[n - 2], part[n - 1], n >= 4 ? Math.atan2(part[n - 1] - part[n - 3], part[n - 2] - part[n - 4]) : 0, 0);
        }
      } else tool(marks[marks.length - 1], prev[0], prev[1], 0, 0.45 + Math.sin(t / 520) * 0.15); // resting, it waits
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  /* Keep detailing: paint: one more, finer pass on top; type: typed again with smaller letters */
  const keepDetailing = async () => {
    if (!pic || phase !== "done") return;
    if (mode === "paint" && painted.current) {
      const my = ++run.current;
      setPhase("typing");
      resetView(cv.current);
      const P = await import("@/lib/paint");
      const from = painted.current.plan.strokes.length;
      const add = await P.morePass(painted.current.plan);
      if (my !== run.current) return;
      if (!add.length) {
        setFinest(true);
        setPhase("done");
        return;
      }
      animatePaint(my, from, false, () => 6000);
    } else if (mode === "type") {
      const { MAX_EXTRA } = await import("@/lib/typeart");
      if (extra >= MAX_EXTRA) return setFinest(true);
      setExtra((e) => e + 1);
    }
  };

  /* ---- zoom: pinch, double tap and the wheel; the view is drawn again at that size, so letters stay sharp ---- */
  const resetView = (canvas: HTMLCanvasElement | null) => {
    view.current = { z: 1, ox: 0, oy: 0, zr: 1, oxr: 0, oyr: 0 };
    setZoomed(false);
    if (canvas) canvas.style.transform = "";
  };
  const redrawTimer = useRef(0);
  const renderView = async () => {
    const canvas = cv.current, v = view.current;
    if (!canvas) return;
    const g = canvas.getContext("2d")!;
    const w = parseFloat(canvas.style.width), h = parseFloat(canvas.style.height);
    const dpr = canvas.width / w;
    if (v.z <= 1.001) {
      const rest = typed.current?.rest ?? painted.current?.rest;
      if (rest) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(rest, 0, 0);
      }
    } else if (typed.current) {
      const { drawView } = await import("@/lib/typeart");
      drawView(g, typed.current.a, typed.current.sig, w, h, dpr, v.z, v.ox, v.oy);
    } else if (painted.current) {
      const { drawPaintView } = await import("@/lib/paint");
      const st = painted.current;
      drawPaintView(g, st.plan, st.k, st.sig, st.ink, w, h, dpr, v.z, v.ox, v.oy);
    }
    v.zr = v.z;
    v.oxr = v.ox;
    v.oyr = v.oy;
    canvas.style.transform = "";
  };
  /** set the view (zoom z, art point (ox, oy) at the top-left), show it at once by stretching, then draw it sharp */
  const setView = (z: number, ox: number, oy: number) => {
    const canvas = cv.current, v = view.current;
    if (!canvas || phase !== "done") return;
    const w = parseFloat(canvas.style.width), h = parseFloat(canvas.style.height);
    z = Math.max(1, Math.min(8, z));
    v.z = z;
    v.ox = Math.max(0, Math.min(w - w / z, ox));
    v.oy = Math.max(0, Math.min(h - h / z, oy));
    setZoomed(z > 1.001);
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = `translate(${(v.oxr - v.ox) * z}px, ${(v.oyr - v.oy) * z}px) scale(${z / v.zr})`;
    clearTimeout(redrawTimer.current);
    redrawTimer.current = window.setTimeout(() => void renderView(), 140);
  };
  /** zoom by a factor around a point of the canvas (in its CSS pixels) */
  const zoomAt = (factor: number, px: number, py: number) => {
    const v = view.current;
    const ax = v.ox + px / v.z, ay = v.oy + py / v.z; // the art point under her finger stays under it
    const z = Math.max(1, Math.min(8, v.z * factor));
    setView(z, ax - px / z, ay - py / z);
  };
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; mx: number; my: number; z: number; ox: number; oy: number } | null>(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const local = (e: React.PointerEvent | React.WheelEvent) => {
    const r = cv.current!.getBoundingClientRect(), v = view.current;
    // the canvas may be stretched for the moment: work in the drawn view's own pixels
    const q = v.z / v.zr;
    return { x: (e.clientX - r.left) / q, y: (e.clientY - r.top) / q };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!cv.current || phase !== "done") return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = view.current;
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const r = cv.current.getBoundingClientRect();
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, z: v.z, ox: v.ox, oy: v.oy };
    } else if (pts.current.size === 1) {
      pinch.current = { d: 0, mx: e.clientX, my: e.clientY, z: v.z, ox: v.ox, oy: v.oy };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !pinch.current || !cv.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p0 = pinch.current;
    if (pts.current.size >= 2 && p0.d) {
      const [a, b] = [...pts.current.values()];
      const r = cv.current.getBoundingClientRect();
      const q = view.current.z / view.current.zr;
      const mx = ((a.x + b.x) / 2 - r.left) / q, my = ((a.y + b.y) / 2 - r.top) / q;
      const z = Math.max(1, Math.min(8, (p0.z * Math.hypot(a.x - b.x, a.y - b.y)) / p0.d));
      const ax = p0.ox + p0.mx / p0.z, ay = p0.oy + p0.my / p0.z;
      setView(z, ax - mx / z, ay - my / z);
    } else if (pts.current.size === 1 && view.current.z > 1) {
      setView(view.current.z, p0.ox - (e.clientX - p0.mx) / p0.z, p0.oy - (e.clientY - p0.my) / p0.z);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const was = pts.current.size;
    pts.current.delete(e.pointerId);
    if (pts.current.size === 1) {
      const [a] = [...pts.current.values()];
      const v = view.current;
      pinch.current = { d: 0, mx: a.x, my: a.y, z: v.z, ox: v.ox, oy: v.oy };
    } else if (!pts.current.size) pinch.current = null;
    if (was === 1 && phase === "done") {
      // a double tap zooms in on that spot, or back out
      const now = performance.now(), L = lastTap.current;
      if (now - L.t < 320 && Math.hypot(e.clientX - L.x, e.clientY - L.y) < 24) {
        const { x, y } = local(e);
        if (view.current.z > 1.05) setView(1, 0, 0);
        else zoomAt(3, x, y);
        lastTap.current = { t: 0, x: 0, y: 0 };
      } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (phase !== "done") return;
    const { x, y } = local(e);
    zoomAt(Math.exp(-e.deltaY * 0.0022), x, y);
  };

  /* her voice (through Jagora) and the app: zoom, save, video, draw again, keep detailing */
  useEffect(() => {
    const onCmd = (e: Event) => {
      const d = ((e as CustomEvent).detail || {}) as { action: string; value?: string };
      const canvas = cv.current;
      const w = canvas ? parseFloat(canvas.style.width) || 0 : 0, h = canvas ? parseFloat(canvas.style.height) || 0 : 0;
      if (d.action === "art_zoom") {
        if (d.value === "reset") setView(1, 0, 0);
        else zoomAt(d.value === "out" ? 1 / 1.8 : 1.8, w / 2, h / 2);
      } else if (d.action === "art_save") void savePicture((["screen", "hd", "4k", "a4", "a3"].includes(d.value || "") ? d.value : "screen") as SaveSize);
      else if (d.action === "art_video") void draw(true);
      else if (d.action === "art_again") void draw();
      else if (d.action === "art_more") void keepDetailing();
    };
    addEventListener("jagora:typeart-cmd", onCmd);
    return () => removeEventListener("jagora:typeart-cmd", onCmd);
  });

  // Muse Image is drawing it: get the board ready (and load the painter meanwhile)
  useEffect(() => {
    if (on && prep && !pic) void prepRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, prep, pic, mode, style, opts.board]);
  useEffect(() => {
    if (on && mode === "paint") void import("@/lib/paint");
  }, [on, mode]);

  // a new picture or new settings: type it again
  useEffect(() => {
    if (on && pic) void draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, pic, opts.letters, opts.colour, opts.detail, opts.board, opts.plain, lang, mode, style, extra]);

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
      if (paintPlan.current) void import("@/lib/paint").then((P) => paintPlan.current && P.stopPlanning(paintPlan.current));
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
      // stays on her phone. Decoded off the main thread and used as it is: the painter first reads only a small copy
      performance.mark("art:yes");
      const bmp = await createImageBitmap(f);
      performance.mark("art:decoded");
      own.current = { bmp }; // sent to the server only for the painting's cut-out, and only when she paints it
      setTitle("");
      setPrep(null);
      setPic({ bmp, subject: f.name });
    } catch {}
  };
  const sample = async (url: string, name: string) => {
    try {
      own.current = null;
      setPrep(null);
      setTitle("");
      setPic({ bmp: await loadPicture(url), subject: name });
    } catch {}
  };
  const askJagora = async (what: string) => {
    what = what.trim();
    if (!what) return;
    setPrompt("");
    // the board gets the canvas ready while Jagora asks Muse Image for the picture
    setPic(null);
    setTitle("");
    setPrep({ subject: what });
    clearTimeout(prepTimer.current);
    prepTimer.current = window.setTimeout(() => setPrep(null), 120_000);
    (await import("@/lib/engine")).ask(mode === "paint" ? `Paint a picture (${style} style): ${what}` : `Draw type art: ${what}`);
  };

  if (!on) return null;
  const set = <K extends keyof typeof opts>(k: K, v: (typeof opts)[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const L = (k: string) => T[k][lang] ?? T[k].en;
  const dark = mode === "paint" ? style !== "water" : opts.board === "dark";
  const inApp = typeof location !== "undefined" && location.pathname.startsWith("/app");
  const cats = (mode === "paint" ? ["style", "detail", "more"] : ["letters", "colour", "board", "detail", "more"]) as (typeof cat)[];
  const cur = cats.includes(cat) ? cat : cats[0];
  const groups: Record<typeof cat, React.ReactNode> = {
    letters: (["symbols", "numbers", "words"] as Letters[]).map((v) => <Seg key={v} on={opts.letters === v} onClick={() => set("letters", v)}>{L(v)}</Seg>),
    colour: (["full", "one", "bw"] as Colour[]).map((v) => <Seg key={v} on={opts.colour === v} onClick={() => set("colour", v)}>{L(v)}</Seg>),
    board: (["dark", "paper"] as Board[]).map((v) => <Seg key={v} on={opts.board === v} onClick={() => set("board", v)}>{L(v)}</Seg>),
    detail: (["coarse", "medium", "fine", "realistic"] as Detail[]).map((v) => <Seg key={v} on={opts.detail === v} onClick={() => (setExtra(0), set("detail", v))}>{L(v)}</Seg>),
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
          {/* talk to Jagora while the board is open: the same Live voice as the app */}
          {inApp && (
            <button
              onClick={() => useApp.getState().setLive(!liveOn)}
              aria-pressed={liveOn}
              aria-label={L("talk")}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${liveOn ? "bg-accent text-[#fff]" : "btn btn-glass"}`}
            >
              {liveOn && orb === "listening" && <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" aria-hidden="true" />}
              {liveOn && orb === "speaking" ? (
                <span className="relative flex h-4 items-end gap-[3px]" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-[3px] animate-pulse rounded-full bg-[#fff]" style={{ height: `${[10, 16, 8][i]}px`, animationDelay: `${i * 120}ms` }} />
                  ))}
                </span>
              ) : (
                <Microphone size={19} weight={liveOn ? "fill" : "bold"} className="relative" />
              )}
            </button>
          )}
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
          className={`relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-[22px] p-3 shadow-[0_30px_70px_-30px_rgba(10,25,60,.65)] ring-1 ${dark ? "bg-[#0e0f12] ring-[#fff]/25" : "bg-[#fff] ring-[#0e0f12]/10"} ${pic ? "" : prep ? "pb-9" : "h-full w-full max-w-[680px]"}`}
        >
          {pic || prep ? (
            <canvas
              ref={cv}
              className="block max-h-full max-w-full"
              style={{ touchAction: phase === "done" ? "none" : "auto", cursor: zoomed ? "grab" : phase === "done" ? "zoom-in" : "default" }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onWheel={onWheel}
            />
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
          {pic && waiting && <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-[#fff]/90 px-4 py-2 text-[13.5px] font-bold text-[#0e0f12]">{L("getting")}</div>}
          {pic && phase === "done" && (
            <div className="absolute right-3 top-3 flex gap-2">
              {zoomed && (
                <button onClick={() => setView(1, 0, 0)} className="btn h-9 bg-[#fff]/90 px-3 text-[13px] font-bold text-[#0e0f12] shadow-md">1x</button>
              )}
              <button
                onClick={() => void keepDetailing()}
                disabled={finest}
                className="btn h-9 gap-1.5 bg-[#fff]/90 px-3 text-[13px] font-bold text-[#0e0f12] shadow-md disabled:opacity-60"
              >
                <Sparkle size={15} weight="fill" className="text-accent" />
                {finest ? L("finest") : L("keep")}
              </button>
            </div>
          )}
          {prep && !pic && (
            <p className={`pointer-events-none absolute inset-x-4 bottom-2.5 animate-pulse truncate text-center text-[13px] font-bold ${dark ? "text-[#eceef2]/80" : "text-[#0e0f12]/75"}`}>
              {L(mode === "paint" ? "prepPaint" : "prepType")}
            </p>
          )}
          {pic && title && (
            <p
              key={title}
              ref={(el) => void el?.animate([{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 900, easing: "ease-out" })}
              className={`pointer-events-none absolute bottom-2 left-4 max-w-[60%] truncate text-[12.5px] font-bold ${dark ? "text-[#eceef2]/80" : "text-[#0e0f12]/75"}`}>
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
