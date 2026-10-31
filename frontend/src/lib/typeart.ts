/* Type Art: a picture turned into typed letters, like the typed portraits people share online.

   How a cell gets its letter (after Alex Harri, "ASCII characters are not pixels"):
   - Cells are taller than wide, the shape of a monospace letter (Jagora Mono, 0.6 em wide, 1 em tall).
   - Each cell is looked at through six small circles, two columns of three, staggered. Every letter was measured the
     same way once at the start (how much of each circle its ink covers), so a cell gets the letter whose ink has the
     same shape as the picture there, not only the same brightness. Edges come out as / \ | _ and the like.
   - Contrast is pushed twice: against the cells around it (a circle next to a brighter neighbour is pushed down, which
     sharpens outlines), then inside the cell (the brightest circle stays, the others are pushed down).
   - Before that the picture is levelled (its darkest and brightest 2% set to black and white) and sharpened a little,
     and with "plain background" the background around the subject is found from the edges of the picture and blacked
     out, so only the person is typed.
   Words mode cannot match shapes: her language's words run on, letter by letter, through the cells that have ink, and
   each letter takes the colour and strength of the picture there, so the face appears out of the words.
   Everything runs on her phone; her photo never leaves it. */
import type { Lang } from "./i18n";

export type Letters = "symbols" | "numbers" | "words";
export type Colour = "full" | "one" | "bw";
export type Detail = "coarse" | "medium" | "fine";
export type ArtOpts = { letters: Letters; colour: Colour; detail: Detail; plain: boolean; lang: Lang };
export type Glyph = { ch: string; c: string; bold: boolean };
export type Art = { cols: number; rows: number; font: number; cw: number; lh: number; bg: string; ink: string; cells: (Glyph | null)[] };

export const FONT = '"Jagora Mono", ui-monospace, Menlo, Consolas, monospace';
const ADV = 0.6; // advance width of Jagora Mono, in em
const LINE = 1.0; // line height, in em: tight, like the typed portraits

/* the letters each mode may use (space is the empty cell) */
const SETS: Record<Exclude<Letters, "words">, string> = {
  symbols: " .:;-_~^!?|/\\()[]{}<>+=*%#@&$3",
  numbers: " .,:0123456789",
};

export const WORDS: Record<Lang, string[]> = {
  yo: ["Ẹ kú àbọ̀", "Ẹ kú àárọ̀", "Ọmọ Naijiria", "ìfẹ́", "àlàáfíà", "ayọ̀", "ilé", "ọ̀rẹ́", "Ẹ ṣé", "Jagora"],
  ha: ["Sannu", "Barka da zuwa", "Ina kwana", "Lafiya lau", "Nagode", "Zumunci", "Soyayya", "Gida", "Jagora"],
  ig: ["Ndewo", "Kedu", "Daalụ", "Nnọọ", "Ịhụnanya", "Udo", "Ọ dị mma", "Ezinụlọ", "Jagora"],
  pcm: ["How far", "Wetin dey", "No wahala", "We move", "Abeg", "Sharp sharp", "E go better", "Oya", "Naija", "Jagora"],
  en: ["Hello", "Welcome", "Nigeria", "Lagos", "Love", "Peace", "Joy", "Family", "Home", "Jagora"],
};

/* the six sampling circles inside a cell (x, y as parts of the cell's width and height) and the ones just outside */
const IN: [number, number][] = [[0.3, 0.17], [0.3, 0.5], [0.3, 0.83], [0.7, 0.24], [0.7, 0.57], [0.7, 0.9]];
const OUT: [number, number][] = [[0.3, -0.12], [0.7, -0.08], [-0.25, 0.3], [-0.25, 0.75], [1.25, 0.35], [1.25, 0.8], [0.3, 1.1], [0.7, 1.16]];
/* which outside circles push on which inside circle */
const NEAR: number[][] = [[0, 2], [2, 3], [3, 6], [1, 4], [4, 5], [5, 7]];
const R = 0.25; // circle radius, as part of the cell width

/* sampling grid: SW x SH pixels per cell (the same 3:5 shape as a letter) */
const SW = 9, SH = 15;

type Shape = { ch: string; v: number[] };
const shapeCache = new Map<string, Shape[]>();

function circleOffsets(w: number, h: number, cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  const x0 = Math.floor(cx * w - r), x1 = Math.ceil(cx * w + r), y0 = Math.floor(cy * h - r), y1 = Math.ceil(cy * h + r);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx * w, dy = y + 0.5 - cy * h;
      if (dx * dx + dy * dy <= r * r) out.push(x, y);
    }
  return out;
}

/** measure every letter once: how much of each circle its ink covers, then each circle scaled by its best letter */
function shapes(set: string): Shape[] {
  const hit = shapeCache.get(set);
  if (hit) return hit;
  const W = 36, H = 60; // a big cell for an accurate measure
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.font = `800 ${H / LINE}px ${FONT}`;
  g.textBaseline = "middle";
  g.textAlign = "center";
  const circles = IN.map(([x, y]) => circleOffsets(W, H, x, y, R * W));
  const list: Shape[] = [];
  for (const ch of set) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#fff";
    g.fillText(ch, W / 2, H * 0.54);
    const d = g.getImageData(0, 0, W, H).data;
    const v = circles.map((off) => {
      let s = 0;
      for (let i = 0; i < off.length; i += 2) {
        const x = off[i], y = off[i + 1];
        if (x >= 0 && y >= 0 && x < W && y < H) s += d[(y * W + x) * 4 + 3];
      }
      return s / (255 * (off.length / 2));
    });
    list.push({ ch, v });
  }
  const max = IN.map((_, k) => Math.max(1e-6, ...list.map((s) => s.v[k])));
  for (const s of list) s.v = s.v.map((x, k) => x / max[k]);
  shapeCache.set(set, list);
  return list;
}

/** the grid for this picture in this box: as many columns as the detail asks for, at most about 160 x 200 */
export function grid(imgW: number, imgH: number, boxW: number, boxH: number, detail: Detail) {
  const phone = boxW < 640;
  const want = { coarse: phone ? 46 : 76, medium: phone ? 70 : 112, fine: phone ? 100 : 156 }[detail];
  const k = LINE / ADV; // cell height over width
  let cols = want, rows = Math.max(8, Math.round((cols * imgH) / imgW / k));
  const maxRows = phone ? 200 : 220;
  if (rows > maxRows) {
    rows = maxRows;
    cols = Math.max(20, Math.round((rows * k * imgW) / imgH));
  }
  const font = Math.max(3, Math.min((boxW * 0.96) / (cols * ADV), (boxH * 0.96) / ((rows + 2) * LINE)));
  return { cols, rows, font, cw: font * ADV, lh: font * LINE };
}

/* ---- the picture, made ready ------------------------------------------------------------------------------------ */

function lum(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** the background around the subject: grown in from the picture's edges through pixels close to the edge colour */
function backgroundMask(d: Uint8ClampedArray, w: number, h: number): Float32Array {
  // the edge colour: the median of the top, left and right edges (in a portrait the bottom edge is usually the
  // person's own shoulders and clothes, so it is left out)
  const border: number[][] = [];
  for (let x = 0; x < w; x += 2) border.push([d[x * 4], d[x * 4 + 1], d[x * 4 + 2]]);
  for (let y = 0; y < h * 0.8; y += 2) border.push([d[y * w * 4], d[y * w * 4 + 1], d[y * w * 4 + 2]], [d[(y * w + w - 1) * 4], d[(y * w + w - 1) * 4 + 1], d[(y * w + w - 1) * 4 + 2]]);
  const med = [0, 1, 2].map((k) => border.map((p) => p[k]).sort((a, b) => a - b)[border.length >> 1]);
  // how far border pixels stray from it sets how loose the fill is
  const spread = border.map((p) => Math.hypot(p[0] - med[0], p[1] - med[1], p[2] - med[2])).sort((a, b) => a - b);
  const s80 = spread[Math.floor(spread.length * 0.6)]; // most of the edge, ignoring a few props touching it
  // a busy edge (a room, a street) is not one background colour: growing it in would eat into the person (skin and
  // wood are close in colour), so nothing is removed here and the oval frame does the work instead
  if (s80 > 34) return new Float32Array(w * h).fill(1);
  const tol = Math.max(24, Math.min(46, s80 * 1.5 + 14));
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const near = (i: number) => Math.hypot(d[i * 4] - med[0], d[i * 4 + 1] - med[1], d[i * 4 + 2] - med[2]) < tol;
  const seed = (i: number) => {
    if (!bg[i] && near(i)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) seed(x);
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }
  // a soft edge: the mask is blurred a little so the outline is not jagged
  const m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = bg[i] ? 0 : 1;
  return boxBlur(m, w, h, 2);
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n;
      s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

const hex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t);

/** the whole picture as typed cells */
export async function buildArt(img: CanvasImageSource & { width: number; height: number }, boxW: number, boxH: number, o: ArtOpts): Promise<Art> {
  try {
    await document.fonts?.load(`800 20px "Jagora Mono"`);
    await document.fonts?.load(`500 20px "Jagora Mono"`);
  } catch {}
  const { cols, rows, font, cw, lh } = grid(img.width, img.height, boxW, boxH, o.detail);
  const paper = o.colour === "one";
  const W = cols * SW, H = rows * SH;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  await new Promise((r) => setTimeout(r)); // let the page breathe between the heavy steps

  const mask = o.plain ? backgroundMask(d, W, H) : null;
  if (mask) {
    // the subject is also framed with a soft oval, so the corners fade like a typed portrait; when the background
    // is busy (a room, a street) and could not be grown in from the edges, the oval is tighter and does the work
    let sum = 0;
    for (let i = 0; i < mask.length; i += 13) sum += mask[i];
    const busy = sum / Math.ceil(mask.length / 13) > 0.8;
    const [rx, ry, fade] = busy ? [0.46, 0.5, 0.2] : [0.62, 0.62, 0.15];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) / (W * rx), dy = (y - H * 0.48) / (H * ry);
        const dd = Math.sqrt(dx * dx + dy * dy);
        mask[y * W + x] *= Math.max(0, Math.min(1, (1 - dd) / fade));
      }
  }
  // lightness, spread over the whole range by the subject's own tones (histogram equalisation, blended with a plain
  // 2%..98% stretch so it does not look harsh), then sharpened a little. Equalising is what keeps a dark-skinned face
  // as rich as the bright clothes around it, instead of a dark hole.
  const L = new Float32Array(W * H);
  for (let i = 0; i < L.length; i++) L[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  const hist = new Float64Array(256);
  let count = 0;
  for (let i = 0; i < L.length; i += 3) {
    const w = mask ? mask[i] : 1;
    if (w > 0.5) {
      hist[Math.min(255, (L[i] * 255) | 0)] += 1;
      count++;
    }
  }
  const cdf = new Float32Array(256);
  let run = 0, lo = -1, hi = 255;
  for (let k = 0; k < 256; k++) {
    run += hist[k];
    cdf[k] = count ? run / count : k / 255;
    if (lo < 0 && cdf[k] >= 0.02) lo = k;
    if (cdf[k] <= 0.98) hi = k;
  }
  const span = Math.max(20, hi - Math.max(0, lo));
  for (let i = 0; i < L.length; i++) {
    const k = Math.min(255, (L[i] * 255) | 0);
    const stretch = Math.max(0, Math.min(1, (k - lo) / span));
    L[i] = 0.62 * cdf[k] + 0.38 * stretch;
  }
  // local contrast (a simple CLAHE): each pixel against its own neighbourhood, so the features inside a dark face
  // (eyes, nose, lips, the light on the cheek) are typed as clearly as those in the bright cloth
  const rad = Math.max(6, Math.round(Math.min(W, H) / 18));
  const mean = boxBlur(L, W, H, rad);
  const sq = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) sq[i] = L[i] * L[i];
  const meanSq = boxBlur(sq, W, H, rad);
  for (let i = 0; i < L.length; i++) {
    const sd = Math.sqrt(Math.max(0, meanSq[i] - mean[i] * mean[i]));
    const local = Math.max(0, Math.min(1, 0.5 + (L[i] - mean[i]) / (2.6 * sd + 0.04)));
    L[i] = 0.55 * L[i] + 0.45 * local;
  }
  const soft = boxBlur(L, W, H, 2);
  const ink = new Float32Array(W * H);
  for (let i = 0; i < L.length; i++) {
    const v = Math.max(0, Math.min(1, L[i] + 0.8 * (L[i] - soft[i])));
    // dark board: light parts are dense; paper: dark parts are dense
    // (the mid tones are lifted: thin letters like : and ' vanish at small sizes, so a face needs the fuller ones)
    ink[i] = Math.pow(paper ? 1 - v : v, paper ? 0.8 : 0.6) * (mask ? mask[i] : 1);
  }
  await new Promise((r) => setTimeout(r));

  const inOff = IN.map(([x, y]) => circleOffsets(SW, SH, x, y, R * SW));
  const outOff = OUT.map(([x, y]) => circleOffsets(SW, SH, x, y, R * SW));
  const at = (cx: number, cy: number, off: number[]) => {
    let s = 0, n = 0;
    for (let i = 0; i < off.length; i += 2) {
      const x = cx * SW + off[i], y = cy * SH + off[i + 1];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      s += ink[y * W + x];
      n++;
    }
    return n ? s / n : 0;
  };

  const set = o.letters === "words" ? "" : SETS[o.letters];
  const list = set ? shapes(set) : [];
  const cache = new Map<number, string>();
  const nearest = (v: number[]) => {
    let key = 0;
    for (const x of v) key = key * 32 + Math.min(31, Math.round(x * 31));
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let best = " ", bd = Infinity;
    for (const s of list) {
      let dd = 0;
      for (let k = 0; k < 6; k++) {
        const e = s.v[k] - v[k];
        dd += e * e;
      }
      if (dd < bd) {
        bd = dd;
        best = s.ch;
      }
    }
    cache.set(key, best);
    return best;
  };

  // the colours
  const blueLo = [156, 186, 236], blueHi = [14, 44, 120];
  const greyLo = [70, 76, 86], greyHi = [246, 248, 252];
  const words = (WORDS[o.lang] ?? WORDS.en).join("  ") + "  ";
  let wi = 0;
  const cells: (Glyph | null)[] = new Array(cols * rows).fill(null);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // cell colour and ink, averaged over the cell
      let r = 0, gg = 0, b = 0, s = 0, n = 0;
      for (let yy = y * SH + 1; yy < (y + 1) * SH; yy += 3)
        for (let xx = x * SW + 1; xx < (x + 1) * SW; xx += 2) {
          const i = yy * W + xx;
          r += d[i * 4];
          gg += d[i * 4 + 1];
          b += d[i * 4 + 2];
          s += ink[i];
          n++;
        }
      r /= n;
      gg /= n;
      b /= n;
      const amount = s / n;
      if (amount < (o.letters === "words" ? 0.1 : 0.05)) continue;
      let ch: string;
      if (o.letters === "words") {
        ch = words[wi++ % words.length];
        if (ch === " ") continue; // the gap between words stays a gap, so the words can be read
      } else {
        // the six circles, pushed against the neighbours, then within the cell
        const v = inOff.map((off) => at(x, y, off));
        const ext = outOff.map((off) => at(x, y, off));
        for (let k = 0; k < 6; k++) {
          const m = Math.max(v[k], ...NEAR[k].map((j) => ext[j]));
          if (m > 0) v[k] = Math.pow(v[k] / m, 1.6) * m;
        }
        const m = Math.max(...v);
        if (m > 0) for (let k = 0; k < 6; k++) v[k] = Math.pow(v[k] / m, 1.25) * m;
        ch = nearest(v);
        if (ch === " ") continue;
      }
      let col: number[];
      const t = Math.min(1, amount * 1.15);
      if (o.colour === "full") {
        // the picture's own colour, a little richer, and bright enough to read on the dark board
        const avg = (r + gg + b) / 3;
        const sat = [r, gg, b].map((v) => avg + (v - avg) * 1.4);
        const top = Math.max(1, ...sat);
        // letters carry the shape in symbol modes; words carry it only by how bright each letter is
        const want = o.letters === "words" ? 45 + 210 * Math.pow(t, 1.15) : 135 + 120 * t;
        col = sat.map((v) => (v / top) * want);
      } else if (o.colour === "one") col = mix(blueLo, blueHi, Math.pow(t, 0.8));
      else col = mix(o.letters === "words" ? [28, 30, 36] : greyLo, greyHi, t);
      cells[y * cols + x] = { ch, c: hex(col[0], col[1], col[2]), bold: o.letters !== "words" || amount > 0.5 };
    }
    if (y % 24 === 23) await new Promise((r) => setTimeout(r));
  }
  return { cols, rows, font, cw, lh, bg: paper ? "#f3f5f9" : "#050608", ink: paper ? "#14306f" : "#e8edf5", cells };
}

// for checks in development builds only
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __typeart?: unknown }).__typeart = { buildArt };
