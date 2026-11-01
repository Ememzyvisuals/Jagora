/* Paint mode: a picture painted with brush strokes, coarse to fine, the way a painter works.

   After Aaron Hertzmann, "Painterly Rendering with Curved Brush Strokes of Multiple Sizes" (SIGGRAPH 1998):
   - the picture is painted in layers, from a big brush to a small one; each layer paints from a copy of the picture
     blurred to the size of its brush, so big brushes lay big colour shapes and small brushes add the detail;
   - a layer only paints where the canvas so far is still far from the picture (a grid as big as the brush, one stroke
     from the worst spot of each cell that is off by more than a threshold), so detail goes where the picture has it;
   - each stroke starts with the colour under it and runs across the light-and-dark lines of the picture (along the
     edges, at right angles to the gradient), bending smoothly, until the colour under it changes;
   - the painting finishes by itself: after the first layers it goes on with finer brushes for as long as each layer
     still brings it clearly closer to the picture (measured against it, weighted toward the detail and the faces),
     and stops at the plateau; Keep detailing is an extra, never needed;
   - the fine brushes go where the picture has detail: the edges of every person, face, letter and object (not one
     centre oval), so a group photo or a sign comes out as clean as a portrait. SAM 3.1's cut-out of the person (when
     Jagora is connected and she agreed) or an estimate made on her phone adds weight to the subject;
   - watercolour glazes are see-through, so each one is mixed a little past its target and lands on the picture's
     colour instead of short of it (no pale veil); washes bleed softly inside a region but never across the edge of a
     person or a letter, and a last multiplying glaze darkens whatever is still lighter than the picture, so the
     paper shows only in true highlights.
   Styles: Bold colour (posterised, vivid colour blocks, hard edges), Oil (bristle lines in each stroke, slight colour
   play) and Watercolour (see-through washes that build up, soft blurred reference, paper grain).
   Every stroke is kept as a vector, so the painting can be painted again at print size, sharp. */
import type { Detail, SaveSize } from "./typeart";
import { encodePNG, pageForSize } from "./typeart";

export type Style = "bold" | "oil" | "water";
/** wet: a watercolour wash that bleeds softly into what is around it (never at the edge of a person or a letter) */
export type Stroke = { pts: number[]; r: number; c: [number, number, number]; a: number; layer: number; box: [number, number, number, number]; wet?: boolean; glaze?: boolean };
/** errs: how far the painting still was from the picture after each layer (for checks) */
export type Painting = { W: number; H: number; strokes: Stroke[]; style: Style; ground: string; seed: number; errs?: number[] };

/** the working size of a painting: smaller on phones, so planning and painting stay smooth */
export const paintSize = () => (typeof window !== "undefined" && Math.min(screen.width, screen.height) < 700 ? 520 : 640);

const clamp = (v: number, a = 0, b = 255) => (v < a ? a : v > b ? b : v);

/* Planning never holds the page for long: work is done in slices of a few milliseconds, and between slices the page
   draws its next frame (the brush keeps moving while the next layers are planned). */
let slice = 0;
const SLICE_MS = 8;
const yieldNow = (): Promise<void> => {
  const s = (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (s?.yield) return s.yield();
  return new Promise((r) => {
    const c = new MessageChannel();
    c.port1.onmessage = () => r();
    c.port2.postMessage(0);
  });
};
/** give the page a turn if this slice has run long enough */
async function breathe() {
  if (performance.now() - slice > SLICE_MS) {
    await yieldNow();
    slice = performance.now();
  }
}

/** a box blur (two passes, close to a gaussian), in slices */
async function blurA(src: Float32Array, w: number, h: number, r: number): Promise<Float32Array> {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    const a = pass === 0 ? src : out;
    for (let y = 0; y < h; y++) {
      if ((y & 15) === 0) await breathe();
      let s = 0;
      for (let x = -r; x <= r; x++) s += a[y * w + clampI(x, w)];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = s / n;
        s += a[y * w + clampI(x + r + 1, w)] - a[y * w + clampI(x - r, w)];
      }
    }
    for (let x = 0; x < w; x++) {
      if ((x & 15) === 0) await breathe();
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clampI(y, h) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / n;
        s += tmp[clampI(y + r + 1, h) * w + x] - tmp[clampI(y - r, h) * w + x];
      }
    }
  }
  return out;
}

function blurChannel(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    const a = pass === 0 ? src : out;
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += a[y * w + clampI(x, w)];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = s / n;
        s += a[y * w + clampI(x + r + 1, w)] - a[y * w + clampI(x - r, w)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clampI(y, h) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / n;
        s += tmp[clampI(y + r + 1, h) * w + x] - tmp[clampI(y - r, h) * w + x];
      }
    }
  }
  return out;
}
const clampI = (v: number, n: number) => (v < 0 ? 0 : v >= n ? n - 1 : v);

/** a small seeded random, so "Draw again" and the print copy paint the same strokes */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** the subject, estimated on her phone: grown in from the edges through the background colour, with a soft oval */
export async function estimateMask(d: Uint8ClampedArray, w: number, h: number): Promise<Float32Array> {
  const border: number[][] = [];
  for (let x = 0; x < w; x += 2) border.push([d[x * 4], d[x * 4 + 1], d[x * 4 + 2]]);
  for (let y = 0; y < h * 0.8; y += 2) border.push([d[y * w * 4], d[y * w * 4 + 1], d[y * w * 4 + 2]], [d[(y * w + w - 1) * 4], d[(y * w + w - 1) * 4 + 1], d[(y * w + w - 1) * 4 + 2]]);
  const med = [0, 1, 2].map((k) => border.map((p) => p[k]).sort((a, b) => a - b)[border.length >> 1]);
  const spread = border.map((p) => Math.hypot(p[0] - med[0], p[1] - med[1], p[2] - med[2])).sort((a, b) => a - b);
  const s60 = spread[Math.floor(spread.length * 0.6)];
  const m = new Float32Array(w * h).fill(1);
  if (s60 <= 34) {
    const tol = Math.max(24, Math.min(46, s60 * 1.5 + 14));
    const bg = new Uint8Array(w * h);
    const stack: number[] = [];
    const seed = (i: number) => {
      if (!bg[i] && Math.hypot(d[i * 4] - med[0], d[i * 4 + 1] - med[1], d[i * 4 + 2] - med[2]) < tol) {
        bg[i] = 1;
        stack.push(i);
      }
    };
    for (let x = 0; x < w; x++) seed(x);
    for (let y = 0; y < h; y++) {
      seed(y * w);
      seed(y * w + w - 1);
    }
    let k = 0;
    while (stack.length) {
      if ((++k & 16383) === 0) await breathe();
      const i = stack.pop()!;
      const x = i % w, y = (i / w) | 0;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (y > 0) seed(i - w);
      if (y < h - 1) seed(i + w);
    }
    for (let i = 0; i < m.length; i++) m[i] = bg[i] ? 0 : 1;
  }
  for (let y = 0; y < h; y++) {
    if ((y & 31) === 0) await breathe();
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w * 0.5), dy = (y - h * 0.46) / (h * 0.56);
      m[y * w + x] *= clamp((1 - Math.sqrt(dx * dx + dy * dy)) / 0.25, 0, 1);
    }
  }
  return blurA(m, w, h, 3);
}

/** a mask from SAM (a grey PNG, white on the person) at the painting's size */
export async function maskFromImage(src: string, w: number, h: number): Promise<Float32Array | null> {
  try {
    const bmp = await createImageBitmap(await (await fetch(src)).blob());
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const m = new Float32Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4] / 255;
    return m;
  } catch {
    return null;
  }
}

const STYLE = {
  // threshold (how far off a spot must be to be painted again), stroke length, curve smoothing, blur factor, opacity
  bold: { T: 30, maxLen: 9, minLen: 2, fc: 1, fs: 0.5, alpha: 1, posterize: 6, sat: 1.2 },
  oil: { T: 26, maxLen: 14, minLen: 3, fc: 0.65, fs: 0.5, alpha: 0.92, posterize: 0, sat: 1.12 },
  water: { T: 26, maxLen: 12, minLen: 2, fc: 0.5, fs: 1.0, alpha: 0.55, posterize: 0, sat: 1.1 },
};

/* What the planner keeps between passes: the next layers are planned while the brush paints the first, and Keep
   detailing adds a finer pass on top without starting again. */
type Ctx = {
  W: number; H: number; style: Style; img: CanvasImageSource; real: boolean; radii: number[]; next: number;
  R: Float32Array; G: Float32Array; B: Float32Array; M: Float32Array; skin0: Float32Array; skin: Float32Array;
  cg: CanvasRenderingContext2D; rand: () => number; layer: number; r: number; T: number; floor: number;
  ready: boolean; done: boolean; stop: boolean; newMask: Float32Array | null;
  /** where the detail is (edges of faces, people, letters, objects), 0..1 */
  S: Float32Array;
  /** the error after each layer; glazed: the last, value-matching glaze is on */
  errs: number[]; glazed: boolean; plan: Painting;
};
const CTX = new WeakMap<Painting, Ctx>();
const NONE = new Float32Array(0);

/** the first brushes of every painting, from the big flat one down, in pixels at a 640-wide picture; after them the
    painting goes on with finer and finer brushes for as long as each layer still brings it clearly closer to the
    picture (measured), down to the finest brush of the chosen detail */
const RADII: Record<Detail, number[]> = {
  coarse: [36, 16, 8],
  medium: [36, 18, 9, 5],
  fine: [36, 18, 9, 5],
  realistic: [36, 18, 9, 5, 3],
};
/** the finest brush of each detail, in pixels of the working size (small faces in a group photo need it) */
const FLOOR: Record<Detail, number> = { coarse: 4, medium: 1.5, fine: 1.3, realistic: 1.1 };
/** the working size: big enough that the people in a group photo get real brushwork */
const LONG: Record<Detail, number> = { coarse: 640, medium: 900, fine: 1024, realistic: 1024 };
const MAX_LAYERS = 11;

/** Start a painting: only the first, biggest brush is planned now, from a small copy of the picture (a big brush only
    sees big colour shapes), so the brush is on the canvas within a moment. nextLayer() plans the finer layers after,
    in slices, while the brush works. */
export async function startPainting(img: CanvasImageSource & { width: number; height: number }, style: Style, detail: Detail, seed = 7): Promise<Painting> {
  slice = performance.now();
  const real = detail === "realistic" || detail === "fine";
  const long = Math.min(LONG[detail], Math.max(img.width, img.height) * 1.5);
  const k = long / Math.max(img.width, img.height);
  const W = Math.round(img.width * k), H = Math.round(img.height * k);
  const st = STYLE[style];
  const radii = RADII[detail].map((r) => Math.max(1.2, (r * W) / 640));
  const r0 = radii[0];
  // the small copy: 1/8 the size (smoothed while it shrinks), then blurred to the big brush
  const f = 8, sw = Math.ceil(W / f), sh = Math.ceil(H / f);
  const sc = document.createElement("canvas");
  sc.width = sw;
  sc.height = sh;
  const sg = sc.getContext("2d", { willReadFrequently: true })!;
  sg.imageSmoothingQuality = "high";
  sg.drawImage(img, 0, 0, sw, sh);
  const sd = sg.getImageData(0, 0, sw, sh).data;
  let sR: Float32Array = new Float32Array(sw * sh), sG: Float32Array = new Float32Array(sw * sh), sB: Float32Array = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    const r1 = sd[i * 4], g1 = sd[i * 4 + 1], b1 = sd[i * 4 + 2], avg = (r1 + g1 + b1) / 3;
    sR[i] = clamp(avg + (r1 - avg) * st.sat);
    sG[i] = clamp(avg + (g1 - avg) * st.sat);
    sB[i] = clamp(avg + (b1 - avg) * st.sat);
  }
  const sbr = Math.max(1, Math.round((st.fs * r0) / f));
  sR = blurChannel(sR, sw, sh, sbr);
  sG = blurChannel(sG, sw, sh, sbr);
  sB = blurChannel(sB, sw, sh, sbr);
  if (st.posterize) {
    const q = 255 / (st.posterize - 1);
    for (let i = 0; i < sR.length; i++) {
      const l0 = 0.3 * sR[i] + 0.59 * sG[i] + 0.11 * sB[i], lq = Math.round(l0 / q) * q, f = l0 > 1 ? lq / l0 : 1;
      sR[i] = clamp(sR[i] * f);
      sG[i] = clamp(sG[i] * f);
      sB[i] = clamp(sB[i] * f);
    }
  }
  const sL = new Float32Array(sw * sh);
  for (let i = 0; i < sL.length; i++) sL[i] = 0.3 * sR[i] + 0.59 * sG[i] + 0.11 * sB[i];
  const at = (x: number, y: number) => clampI(Math.floor(y / f), sh) * sw + clampI(Math.floor(x / f), sw);

  const rand = rng(seed);
  const layer: Stroke[] = [];
  const grid = Math.max(1, Math.round(r0));
  const maxLen = Math.min(st.maxLen, Math.max(3, Math.round((110 * W) / 640 / r0)));
  for (let gy = 0; gy < H; gy += grid)
    for (let gx = 0; gx < W; gx += grid) {
      // every cell gets a stroke on the bare canvas, from its corner, across the light-and-dark lines
      const i0 = at(gx, gy);
      const col: [number, number, number] = [sR[i0], sG[i0], sB[i0]];
      const pts = [gx, gy];
      let x = gx, y = gy, lx = 0, ly = 0;
      for (let s2 = 1; s2 <= maxLen; s2++) {
        const sx = clampI(Math.floor(x / f), sw), sy = clampI(Math.floor(y / f), sh);
        const gx2 = (sL[sy * sw + clampI(sx + 1, sw)] - sL[sy * sw + clampI(sx - 1, sw)]) / f;
        const gy2 = (sL[clampI(sy + 1, sh) * sw + sx] - sL[clampI(sy - 1, sh) * sw + sx]) / f;
        if (Math.hypot(gx2, gy2) < 0.5) {
          if (s2 === 1) {
            const a = rand() * Math.PI * 2;
            lx = Math.cos(a);
            ly = Math.sin(a);
          }
        } else {
          let dx = -gy2, dy = gx2;
          if (lx * dx + ly * dy < 0) {
            dx = -dx;
            dy = -dy;
          }
          dx = st.fc * dx + (1 - st.fc) * lx;
          dy = st.fc * dy + (1 - st.fc) * ly;
          const len = Math.hypot(dx, dy) || 1;
          lx = dx / len;
          ly = dy / len;
        }
        x += r0 * lx;
        y += r0 * ly;
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        pts.push(x, y);
      }
      const j = style === "bold" ? 6 : 10;
      const jc: [number, number, number] = [clamp(col[0] + (rand() - 0.5) * j), clamp(col[1] + (rand() - 0.5) * j), clamp(col[2] + (rand() - 0.5) * j)];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let p = 0; p < pts.length; p += 2) {
        x0 = Math.min(x0, pts[p]);
        x1 = Math.max(x1, pts[p]);
        y0 = Math.min(y0, pts[p + 1]);
        y1 = Math.max(y1, pts[p + 1]);
      }
      layer.push({ pts, r: r0, c: jc, a: st.alpha, layer: 0, box: [x0 - r0 * 1.5, y0 - r0 * 1.5, x1 + r0 * 1.5, y1 + r0 * 1.5], wet: true });
    }
  for (let i = layer.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [layer[i], layer[j]] = [layer[j], layer[i]];
  }
  // what is on the canvas so far (for "where is it still off?" in the next layers)
  const cc = document.createElement("canvas");
  cc.width = W;
  cc.height = H;
  const cg = cc.getContext("2d", { willReadFrequently: true })!;
  cg.fillStyle = style === "water" ? "#ffffff" : "#808080";
  cg.fillRect(0, 0, W, H);
  for (const s2 of layer) drawStroke(cg, s2, style, 1, true);
  const plan: Painting = { W, H, strokes: layer, style, ground: style === "water" ? "#ffffff" : "#0e0f12", seed, errs: [] };
  CTX.set(plan, {
    W, H, style, img, real, radii, next: 1, R: NONE, G: NONE, B: NONE, M: NONE, skin0: NONE, skin: NONE, cg, rand,
    layer: 1, r: r0, T: st.T, floor: FLOOR[detail], ready: false, done: false, stop: false, newMask: null,
    S: NONE, errs: plan.errs!, glazed: false, plan,
  });
  return plan;
}

/** the full-size picture for the finer layers: its colours, the person (SAM's cut-out if it came, else an estimate) and
    the skin, so the face gets the most passes. In slices. */
async function prepare(ctx: Ctx) {
  const { W, H, style } = ctx;
  const st = STYLE[style];
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(ctx.img, 0, 0, W, H);
  await breathe();
  const d = g.getImageData(0, 0, W, H).data;
  await breathe();
  const R = new Float32Array(W * H), G = new Float32Array(W * H), B = new Float32Array(W * H), sk = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if ((i & 32767) === 0) await breathe();
    const r0 = d[i * 4], g0 = d[i * 4 + 1], b0 = d[i * 4 + 2];
    const avg = (r0 + g0 + b0) / 3;
    R[i] = clamp(avg + (r0 - avg) * st.sat);
    G[i] = clamp(avg + (g0 - avg) * st.sat);
    B[i] = clamp(avg + (b0 - avg) * st.sat);
    // skin (warm, moderately saturated): the face gets the most passes
    sk[i] = r0 > g0 && g0 >= b0 * 0.92 && r0 - b0 > 14 && r0 - b0 < 150 && r0 > 38 ? 1 : 0;
  }
  Object.assign(ctx, { R, G, B });
  ctx.M = ctx.newMask ?? (await estimateMask(d, W, H));
  ctx.newMask = null;
  ctx.skin0 = await blurA(sk, W, H, Math.max(3, Math.round(W / 90)));
  ctx.skin = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) ctx.skin[i] = ctx.skin0[i] * ctx.M[i];
  // where the detail is: the light-and-dark edges of the picture, spread a little, so every person, face, letter and
  // object gets the fine brushes (not only one face in the middle), plus the skin and the estimated subject
  const E = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    if ((y & 31) === 0) await breathe();
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const l = (j: number) => 0.3 * R[j] + 0.59 * G[j] + 0.11 * B[j];
      E[i] = Math.abs(l(i + 1) - l(i - 1)) + Math.abs(l(i + W) - l(i - W));
    }
  }
  const Es = await blurA(E, W, H, Math.max(2, Math.round(W / 110)));
  const sample: number[] = [];
  for (let i = 0; i < Es.length; i += 97) sample.push(Es[i]);
  sample.sort((p, q) => p - q);
  const top = Math.max(4, sample[Math.floor(sample.length * 0.92)]);
  ctx.S = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) ctx.S[i] = Math.min(1, Es[i] / top + 0.7 * ctx.skin[i] + 0.15 * ctx.M[i]);
  ctx.ready = true;
}

/** how far the painting so far is from the picture: the mean colour distance, weighted toward the detail and faces */
async function canvasError(ctx: Ctx): Promise<number> {
  const { W, H, R, G, B, S, skin } = ctx;
  const d = ctx.cg.getImageData(0, 0, W, H).data;
  let e = 0, ws = 0;
  for (let y = 0; y < H; y += 2) {
    if ((y & 31) === 0) await breathe();
    for (let x = 0; x < W; x += 2) {
      const i = y * W + x, w = 0.35 + S[i] + 0.6 * skin[i];
      e += w * Math.hypot(d[i * 4] - R[i], d[i * 4 + 1] - G[i], d[i * 4 + 2] - B[i]);
      ws += w;
    }
  }
  return e / ws;
}

/** Plan the next, finer layer of the painting and add its strokes (false when the painting is finished). The first
    layers are fixed; after them a finer layer is added only while the last one still brought the painting clearly
    closer to the picture (it stops at the plateau, or at the finest brush of the detail). Then a last glaze matches
    the values of the picture (darks stay dark, the paper shows only in true highlights), and it is finished. */
export async function nextLayer(plan: Painting): Promise<boolean> {
  const ctx = CTX.get(plan);
  if (!ctx || ctx.stop || ctx.done) return false;
  slice = performance.now();
  if (!ctx.ready) await prepare(ctx);
  if (ctx.newMask) {
    // SAM's cut-out came while the brush was working: the finer layers follow it from here on
    ctx.M = ctx.newMask;
    ctx.newMask = null;
    for (let i = 0; i < ctx.skin.length; i++) ctx.skin[i] = ctx.skin0[i] * ctx.M[i];
  }
  if (ctx.stop) return false;
  const st = STYLE[ctx.style];
  let r: number, T: number, glaze = false;
  const errs = ctx.errs;
  if (ctx.next < ctx.radii.length) {
    r = ctx.radii[ctx.next];
    T = st.T * Math.max(0.5, 1 - 0.09 * ctx.next);
  } else {
    if (!errs.length) errs.push(await canvasError(ctx));
    const n = errs.length, gain = n >= 2 ? (errs[n - 2] - errs[n - 1]) / errs[n - 2] : 1;
    const finer = Math.max(ctx.floor, ctx.r * 0.72);
    const end = gain < 0.04 || ctx.r <= ctx.floor * 1.02 || ctx.next >= MAX_LAYERS;
    if (end && ctx.style !== "water") ctx.glazed = true; // (opaque paint already lands on the values: no glaze)
    if (!ctx.glazed && end) {
      // the last glaze: wherever the value (light and dark) is still off, a fuller layer of the picture's own colour
      glaze = true;
      r = Math.max(ctx.floor * 1.3, (2.2 * ctx.W) / 640);
      T = 9;
    } else if (ctx.glazed) {
      ctx.done = true;
      return false;
    } else {
      r = finer;
      T = Math.max(st.T * 0.42, ctx.T * 0.86);
    }
  }
  const li = ctx.next++;
  const add = await paintLayer(ctx, li, r, T, glaze);
  if (ctx.stop) return false;
  for (const s2 of add) plan.strokes.push(s2); // (no spread: a layer can hold 100k strokes)
  if (glaze) {
    ctx.glazed = true;
    ctx.done = true;
  }
  if (li >= 2) errs.push(await canvasError(ctx));
  return true;
}
/** every layer planned? */
export const planned = (plan: Painting) => CTX.get(plan)?.done ?? true;
/** stop planning (a new picture or Draw again) */
export const stopPlanning = (plan: Painting) => {
  const ctx = CTX.get(plan);
  if (ctx) ctx.stop = true;
};
/** SAM's cut-out of the person, at the painting's size; used from the next layer on */
export function setMask(plan: Painting, m: Float32Array) {
  const ctx = CTX.get(plan);
  if (ctx && m.length === plan.W * plan.H) ctx.newMask = m;
}

/** plan every stroke at once (the print copy and tests) */
export async function planPainting(img: CanvasImageSource & { width: number; height: number }, style: Style, detail: Detail, mask: Float32Array | null = null, seed = 7): Promise<Painting> {
  const plan = await startPainting(img, style, detail, seed);
  if (mask) setMask(plan, mask);
  while (await nextLayer(plan));
  return plan;
}

/** Keep detailing: one more, finer pass on top of the painting. It stops getting finer at a floor, so the last pass
    still shows small strokes and texture, never a flat photo. Returns the new strokes ([] when it cannot go finer). */
export async function morePass(plan: Painting): Promise<Stroke[]> {
  const ctx = CTX.get(plan);
  if (!ctx) return [];
  while (await nextLayer(plan));
  slice = performance.now();
  const floor = ctx.floor * 0.7; // a little finer than the finished painting, never a photo
  const r = Math.max(floor, ctx.r * 0.75);
  const T = Math.max(STYLE[ctx.style].T * 0.3, ctx.T * 0.82);
  if (r <= floor * 1.01 && ctx.layer >= MAX_LAYERS + 2) return [];
  const add = await paintLayer(ctx, ctx.layer, r, T);
  for (const st2 of add) plan.strokes.push(st2);
  return add;
}

async function paintLayer(ctx: Ctx, li: number, r: number, T: number, glaze = false): Promise<Stroke[]> {
  const { W, H, style, R, G, B, S, skin, cg, rand } = ctx;
  const st = STYLE[style];
  ctx.layer = li + 1;
  ctx.r = r;
  ctx.T = T;
  // each layer paints from the picture blurred to its brush (watercolour's first washes blur most, the later ones
  // less, so its detail stays crisp)
  const br = Math.max(1, Math.round((style === "water" && li > 1 ? 0.55 : st.fs) * r));
  const rR = await blurA(R, W, H, br), rG = await blurA(G, W, H, br), rB = await blurA(B, W, H, br);
  // the brightness of the reference, for the stroke directions (and Bold colour cut to a few flat steps)
  const Lm = new Float32Array(W * H);
  const q = st.posterize ? 255 / (st.posterize - 1) : 0;
  for (let i = 0; i < Lm.length; i++) {
    if ((i & 32767) === 0) await breathe();
    if (q) {
      const l0 = 0.3 * rR[i] + 0.59 * rG[i] + 0.11 * rB[i], lq = Math.round(l0 / q) * q, f = l0 > 1 ? lq / l0 : 1;
      rR[i] = clamp(rR[i] * f);
      rG[i] = clamp(rG[i] * f);
      rB[i] = clamp(rB[i] * f);
    }
    Lm[i] = 0.3 * rR[i] + 0.59 * rG[i] + 0.11 * rB[i];
  }
  const cd = cg.getImageData(0, 0, W, H).data;
  // how far a spot is off: its colour, or for the last glaze mainly its value (light and dark)
  const diff = (i: number) => Math.hypot(cd[i * 4] - rR[i], cd[i * 4 + 1] - rG[i], cd[i * 4 + 2] - rB[i]);
  const dv = (i: number) => 0.3 * (cd[i * 4] - rR[i]) + 0.59 * (cd[i * 4 + 1] - rG[i]) + 0.11 * (cd[i * 4 + 2] - rB[i]);
  const fineBrush = r < (3.2 * W) / 640;
  const first = li === 0;
  // (fine brushes on a slightly wider grid: their strokes are long and 2r wide, so they still cover it, with half
  // as many strokes to paint)
  const grid = Math.max(1, Math.round(r * (fineBrush && !glaze ? 1.6 : 1)));
  const layer: Stroke[] = [];
  for (let gy = 0; gy < H; gy += grid) {
    await breathe();
    if (ctx.stop) return [];
    for (let gx = 0; gx < W; gx += grid) {
      let sum = 0, n = 0, best = -1, bx = gx, by = gy, sal = 0, face = 0, val = 0, dr = 0, dg = 0, db = 0, mr = 0, mg = 0, mb = 0;
      for (let y = gy; y < Math.min(H, gy + grid); y++)
        for (let x = gx; x < Math.min(W, gx + grid); x++) {
          const i = y * W + x;
          const e = first ? 999 : diff(i);
          sum += e;
          if (glaze) val += dv(i);
          mr += rR[i];
          mg += rG[i];
          mb += rB[i];
          dr += rR[i] - cd[i * 4];
          dg += rG[i] - cd[i * 4 + 1];
          db += rB[i] - cd[i * 4 + 2];
          n++;
          sal += S[i];
          face += skin[i];
          if (e > best) {
            best = e;
            bx = x;
            by = y;
          }
        }
      if (!n) continue;
      sal /= n;
      face /= n;
      // where the detail is (people, faces, letters, objects) the brush works hardest; flat walls and sky need no tiny
      // brushes; faces are held to the closest match
      if (!glaze && fineBrush && sal < 0.16 && face < 0.1) continue;
      const t = glaze ? T : T * (1.3 - 0.6 * Math.min(1, sal)) * (face > 0.3 ? 0.7 : 1);
      // (the glaze only darkens: where the paint is lighter than the picture, never where it is darker)
      if (glaze ? val / n < t : !first && sum / n < t) continue;
      // the stroke: colour under its start, then across the light-and-dark lines until the colour changes
      if (glaze) {
        // a glaze is laid from the middle of the spot in its average colour (not from its sharpest edge)
        bx = Math.min(W - 1, gx + (grid >> 1));
        by = Math.min(H - 1, gy + (grid >> 1));
      }
      const i0 = by * W + bx;
      let col: [number, number, number] = [rR[i0], rG[i0], rB[i0]];
      const alpha = glaze ? 1 : st.alpha;
      if (glaze) {
        // a transparent glaze over what is painted: it multiplies, so it darkens to the picture's value and keeps every
        // stroke and detail under it visible
        // (a round dab the size of the spot, a little short of the full ratio where dabs overlap)
        const q = (m: number, dd: number) => clamp(255 * (1 - 0.85 * (1 - Math.min(1, m / n / Math.max(8, m / n - dd / n)))));
        col = [q(mr, dr), q(mg, dg), q(mb, db)];
      } else if (alpha < 1 && !first) {
        // a see-through glaze only goes part of the way from what is under it to its own colour: it is mixed a little
        // past the target so that it lands on the picture's colour, not short of it (no pale veil)
        // (by how far the whole spot is off, so a speck in the paint is not amplified)
        const o = Math.min(1.45, 1 / alpha) - 1;
        col = [clamp(col[0] + (dr / n) * o), clamp(col[1] + (dg / n) * o), clamp(col[2] + (db / n) * o)];
      }
      const pts = [bx, by];
      let x = bx, y = by, lx = 0, ly = 0;
      // a big brush makes short, broad strokes (a painter blocks in with dabs, not long ropes of paint)
      const maxLen = glaze ? 0 : Math.min(st.maxLen, Math.max(3, Math.round((110 * W) / 640 / r)));
      for (let s = 1; s <= maxLen; s++) {
        const xi = clampI(Math.round(x), W), yi = clampI(Math.round(y), H), i = yi * W + xi;
        if (s > st.minLen) {
          const toRef = Math.hypot(rR[i] - rR[i0], rG[i] - rG[i0], rB[i] - rB[i0]);
          const now = first ? 999 : Math.hypot(rR[i] - cd[i * 4], rG[i] - cd[i * 4 + 1], rB[i] - cd[i * 4 + 2]);
          if (now < toRef) break;
        }
        const gx2 = Lm[yi * W + clampI(xi + 1, W)] - Lm[yi * W + clampI(xi - 1, W)];
        const gy2 = Lm[clampI(yi + 1, H) * W + xi] - Lm[clampI(yi - 1, H) * W + xi];
        if (Math.hypot(gx2, gy2) < 0.5) {
          if (s === 1) {
            const a = rand() * Math.PI * 2; // flat area: a short stroke in a random direction
            lx = Math.cos(a);
            ly = Math.sin(a);
          }
        } else {
          let dx = -gy2, dy = gx2;
          if (lx * dx + ly * dy < 0) {
            dx = -dx;
            dy = -dy;
          }
          dx = st.fc * dx + (1 - st.fc) * lx;
          dy = st.fc * dy + (1 - st.fc) * ly;
          const len = Math.hypot(dx, dy) || 1;
          lx = dx / len;
          ly = dy / len;
        }
        x += r * lx;
        y += r * ly;
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        pts.push(x, y);
      }
      // a little life in the colour (a painter never mixes exactly the same twice)
      const j = style === "bold" ? 6 : 10;
      const jc: [number, number, number] = glaze ? col : [clamp(col[0] + (rand() - 0.5) * j), clamp(col[1] + (rand() - 0.5) * j), clamp(col[2] + (rand() - 0.5) * j)];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let p = 0; p < pts.length; p += 2) {
        x0 = Math.min(x0, pts[p]);
        x1 = Math.max(x1, pts[p]);
        y0 = Math.min(y0, pts[p + 1]);
        y1 = Math.max(y1, pts[p + 1]);
      }
      // watercolour: the first washes bleed softly inside a region, never across the edge of a person or a letter
      const wet = style === "water" && li <= 1 && S[i0] < 0.45;
      layer.push({ pts, r: glaze ? grid * 0.6 : r, c: jc, a: alpha, layer: li, box: [x0 - r * 1.5, y0 - r * 1.5, x1 + r * 1.5, y1 + r * 1.5], ...(wet ? { wet } : {}), ...(glaze ? { glaze } : {}) });
    }
  }
  // painted in a random order, like a painter moving around the canvas
  for (let i = layer.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [layer[i], layer[j]] = [layer[j], layer[i]];
  }
  for (let i = 0; i < layer.length; i++) {
    if ((i & 63) === 0) await breathe();
    drawStroke(cg, layer[i], style, 1, true);
  }
  return layer;
}

/** the points of a stroke up to a part f (0..1) of its length: the stroke growing behind the brush */
export function partOf(s: Stroke, f: number): Stroke {
  const p = s.pts;
  if (f >= 1 || p.length <= 2) return s;
  let total = 0;
  for (let i = 2; i < p.length; i += 2) total += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  const want = total * Math.max(0, f);
  const out = [p[0], p[1]];
  let run = 0;
  for (let i = 2; i < p.length; i += 2) {
    const seg = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    if (run + seg >= want) {
      const t = seg ? (want - run) / seg : 0;
      out.push(p[i - 2] + (p[i] - p[i - 2]) * t, p[i - 1] + (p[i + 1] - p[i - 1]) * t);
      break;
    }
    out.push(p[i], p[i + 1]);
    run += seg;
  }
  return { ...s, pts: out };
}

/** one stroke, at a scale (1 = the planning size). plain: only its colour (the planner's own copy of the canvas, where
    the bristle lines would cost time and change nothing) */
export function drawStroke(g: CanvasRenderingContext2D, s: Stroke, style: Style, k: number, plain = false) {
  const p = s.pts;
  const [r, gg, b] = s.c;
  if (s.glaze) {
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = 1;
    g.strokeStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.lineWidth = 2 * s.r * k;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(p[0] * k, p[1] * k);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * k, p[i + 1] * k);
    if (p.length === 2) g.lineTo(p[0] * k + 0.01, p[1] * k);
    g.stroke();
    g.globalCompositeOperation = "source-over";
    return;
  }
  const path = (dx: number, dy: number, from = 0, to = p.length) => {
    g.beginPath();
    g.moveTo((p[from] + dx) * k, (p[from + 1] + dy) * k);
    if (to - from === 2) g.lineTo((p[from] + dx + 0.01) * k, (p[from + 1] + dy) * k);
    for (let i = from + 2; i < to; i += 2) {
      const mx = (p[i - 2] + p[i]) / 2, my = (p[i - 1] + p[i + 1]) / 2;
      g.quadraticCurveTo((p[i - 2] + dx) * k, (p[i - 1] + dy) * k, (mx + dx) * k, (my + dy) * k);
      if (i === to - 2) g.lineTo((p[i] + dx) * k, (p[i + 1] + dy) * k);
    }
  };
  g.lineCap = "round";
  g.lineJoin = "round";
  if (style === "water" && s.wet) {
    // a wet wash: a soft, slightly wider halo first, so washes fade into each other with no hard edge
    g.globalAlpha = s.a * 0.3;
    g.strokeStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.lineWidth = 2.3 * s.r * k;
    g.beginPath();
    g.moveTo(p[0] * k, p[1] * k);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * k, p[i + 1] * k);
    if (p.length === 2) g.lineTo(p[0] * k + 0.01, p[1] * k);
    g.stroke();
  }
  g.globalAlpha = s.a;
  g.strokeStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
  g.lineWidth = 2 * s.r * k;
  const n = p.length / 2;
  if (style !== "water" && n >= 5 && !plain && s.r * k > 2) {
    // dry brush: the paint thins out near the end of a long stroke
    const cut = Math.max(4, Math.round(n * 0.78) * 2);
    path(0, 0, 0, cut);
    g.stroke();
    g.globalAlpha = s.a * 0.55;
    g.lineWidth = 2 * s.r * k * 0.82;
    path(0, 0, cut - 2, p.length);
    g.stroke();
    g.globalAlpha = s.a;
  } else {
    path(0, 0);
    g.stroke();
  }
  if (style !== "water" && s.r * k > 2.5 && !plain) {
    // bristle streaks: lighter and darker threads through the stroke, so the brush marks show
    const nb = style === "oil" ? (s.r > 6 ? 3 : 2) : 2;
    const len = Math.hypot(p[p.length - 2] - p[0], p[p.length - 1] - p[1]) || 1;
    const nx = -(p[p.length - 1] - p[1]) / len, ny = (p[p.length - 2] - p[0]) / len;
    for (let t = 0; t < nb; t++) {
      const off = (t - (nb - 1) / 2) * s.r * 0.55;
      const v = t % 2 ? 1.12 : 0.88;
      g.strokeStyle = `rgb(${clamp(r * v) | 0},${clamp(gg * v) | 0},${clamp(b * v) | 0})`;
      g.globalAlpha = style === "oil" ? 0.35 : 0.18;
      g.lineWidth = Math.max(0.6, s.r * 0.22 * k);
      path(nx * off, ny * off);
      g.stroke();
    }
  }
  if (style === "water" && s.r * k > 2 && !plain) {
    // a darker rim where the wash dries
    g.globalAlpha = 0.12;
    g.lineWidth = Math.max(0.8, s.r * 0.18 * k);
    g.strokeStyle = `rgb(${(r * 0.7) | 0},${(gg * 0.7) | 0},${(b * 0.7) | 0})`;
    path(s.r * 0.6, 0);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/* ---- the brush on the board ---------------------------------------------------------------------------------- */

/** When each stroke is painted, so a person can follow it: every big stroke of the first layers is painted by the
    brush as it travels; in the fine layers the brush paints some strokes and the rest appear in small batches while
    it lifts to the next one. Times in ms from the start. */
export type Step = { i: number; from: number; to: number; start: number; hop: number; dur: number; swap: boolean };
export function schedule(strokes: Stroke[], from: number, budget: (layer: number, first: boolean) => number): { steps: Step[]; total: number } {
  const steps: Step[] = [];
  let t = 0, i = from;
  while (i < strokes.length) {
    const li = strokes[i].layer;
    let end = i;
    while (end < strokes.length && strokes[end].layer === li) end++;
    const n = end - i, B = budget(li, steps.length === 0);
    const per = li === 0 ? 30 : 34; // the shortest time for one visible stroke and its hop
    const m = Math.max(1, Math.min(n, Math.floor(B / per)));
    const slot = B / m, stride = n / m;
    for (let v = 0; v < m; v++) {
      const a = i + Math.floor(v * stride), b = v === m - 1 ? end : i + Math.floor((v + 1) * stride);
      const vis = b - 1; // the last of its group is the one the brush paints
      const swap = v === 0;
      const hop = swap ? Math.min(380, slot * 0.6 + 220) : Math.min(140, slot * 0.28);
      steps.push({ i: vis, from: a, to: b, start: t, hop, dur: Math.max(18, slot - hop * (swap ? 0.4 : 1)), swap });
      t += hop + Math.max(18, slot - hop * (swap ? 0.4 : 1));
    }
    i = end;
  }
  return { steps, total: t };
}

/** A real brush at the paint point: a lacquered wooden handle, a crimped metal ferrule and bristles loaded with the
    stroke's colour, the tip exactly at (x, y), leaning back along the stroke. Flat for the big first layer, round for
    the fine ones. lift (0..1) raises it off the canvas between strokes, with its shadow falling away. */
export function drawBrush(g: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, c: [number, number, number], flat: boolean, lift = 0, grow = 1) {
  const s = size * grow;
  if (s < 1) return;
  const back = angle + Math.PI; // the handle points back along the stroke
  const tilt = 0.55; // the handle leans toward the viewer
  g.save();
  // shadow on the canvas
  g.save();
  g.translate(x + s * (0.25 + lift * 0.9), y + s * (0.35 + lift * 1.1));
  g.rotate(back);
  g.fillStyle = `rgba(0,0,0,${0.22 - lift * 0.1})`;
  g.beginPath();
  g.ellipse(s * 2.4, 0, s * 2.6, s * (flat ? 0.28 : 0.2), 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.translate(x, y - lift * s * 0.9);
  g.rotate(back);
  g.scale(1, 1 - tilt * 0.35);
  const bw = flat ? s * 0.42 : s * 0.24; // half width of the bristles at the ferrule
  // handle: lacquered wood, with a highlight
  const hg = g.createLinearGradient(0, -s * 0.16, 0, s * 0.16);
  hg.addColorStop(0, "#7a4a24");
  hg.addColorStop(0.45, "#c98a4b");
  hg.addColorStop(1, "#4a2a12");
  g.fillStyle = hg;
  g.beginPath();
  g.moveTo(s * 1.75, -s * 0.15);
  g.quadraticCurveTo(s * 3.6, -s * 0.2, s * 5.2, -s * 0.07);
  g.quadraticCurveTo(s * 5.35, 0, s * 5.2, s * 0.07);
  g.quadraticCurveTo(s * 3.6, s * 0.2, s * 1.75, s * 0.15);
  g.closePath();
  g.fill();
  // ferrule: brushed metal with crimp lines
  const fg = g.createLinearGradient(0, -bw * 1.1, 0, bw * 1.1);
  fg.addColorStop(0, "#8d939c");
  fg.addColorStop(0.35, "#eef1f5");
  fg.addColorStop(0.7, "#a9aeb6");
  fg.addColorStop(1, "#5d636b");
  g.fillStyle = fg;
  g.beginPath();
  g.moveTo(s * 0.95, -bw * 1.05);
  g.lineTo(s * 1.8, -s * 0.17);
  g.lineTo(s * 1.8, s * 0.17);
  g.lineTo(s * 0.95, bw * 1.05);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(60,64,72,0.55)";
  g.lineWidth = Math.max(0.6, s * 0.025);
  for (const cx of [1.25, 1.42]) {
    g.beginPath();
    g.moveTo(s * cx, -bw * 0.95);
    g.lineTo(s * cx, bw * 0.95);
    g.stroke();
  }
  // bristles: hair colour at the ferrule, loaded with the paint toward the tip
  const [r, gg, b] = c;
  const pg = g.createLinearGradient(s * 0.95, 0, 0, 0);
  pg.addColorStop(0, "#d8c49a");
  pg.addColorStop(0.45, `rgb(${r | 0},${gg | 0},${b | 0})`);
  pg.addColorStop(1, `rgb(${(r * 0.85) | 0},${(gg * 0.85) | 0},${(b * 0.85) | 0})`);
  g.fillStyle = pg;
  g.beginPath();
  if (flat) {
    g.moveTo(s * 0.97, -bw);
    g.lineTo(s * 0.12, -bw * 0.92);
    g.quadraticCurveTo(0, 0, s * 0.12, bw * 0.92);
    g.lineTo(s * 0.97, bw);
  } else {
    g.moveTo(s * 0.97, -bw);
    g.quadraticCurveTo(s * 0.45, -bw * 1.15, 0, 0);
    g.quadraticCurveTo(s * 0.45, bw * 1.15, s * 0.97, bw);
  }
  g.closePath();
  g.fill();
  // hair strands
  g.strokeStyle = "rgba(0,0,0,0.18)";
  g.lineWidth = Math.max(0.5, s * 0.018);
  for (let k = -2; k <= 2; k++) {
    g.beginPath();
    g.moveTo(s * 0.95, (bw * k) / 2.6);
    g.lineTo(s * (flat ? 0.15 : 0.3), (bw * k) / (flat ? 2.8 : 4.5));
    g.stroke();
  }
  g.restore();
}

/** A pencil at the point (x, y), leaning back at an angle: graphite point, sharpened wood, a blue lacquered body, a
    metal band and an eraser. Used while Jagora prepares the canvas. */
export function drawPencil(g: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, lift = 0) {
  const s = size;
  g.save();
  g.save();
  g.translate(x + s * (0.12 + lift * 0.5), y + s * (0.18 + lift * 0.6));
  g.rotate(angle);
  g.fillStyle = `rgba(0,0,0,${0.2 - lift * 0.08})`;
  g.beginPath();
  g.ellipse(s * 0.55, 0, s * 0.6, s * 0.05, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.translate(x, y - lift * s * 0.25);
  g.rotate(angle);
  const w = s * 0.075;
  // sharpened wood and the graphite point
  g.fillStyle = "#e7c79a";
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(s * 0.17, -w);
  g.lineTo(s * 0.17, w);
  g.closePath();
  g.fill();
  g.fillStyle = "#2b2d31";
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(s * 0.055, -w * 0.33);
  g.lineTo(s * 0.055, w * 0.33);
  g.closePath();
  g.fill();
  // the body: three faces of a hexagon, lit from above
  const faces = ["#4f86f7", "#1d63ed", "#154bb8"];
  for (let f = 0; f < 3; f++) {
    g.fillStyle = faces[f];
    g.fillRect(s * 0.17, -w + (f * 2 * w) / 3, s * 0.68, (2 * w) / 3 + 0.5);
  }
  // metal band and eraser
  const mg = g.createLinearGradient(0, -w, 0, w);
  mg.addColorStop(0, "#9aa0a8");
  mg.addColorStop(0.4, "#eef1f5");
  mg.addColorStop(1, "#6b7179");
  g.fillStyle = mg;
  g.fillRect(s * 0.85, -w * 1.04, s * 0.07, w * 2.08);
  g.fillStyle = "#d98b7a";
  g.beginPath();
  g.moveTo(s * 0.92, -w);
  g.lineTo(s * 0.99, -w);
  g.quadraticCurveTo(s * 1.01, 0, s * 0.99, w);
  g.lineTo(s * 0.92, w);
  g.closePath();
  g.fill();
  g.restore();
}

/** The part of the painting seen through a zoom, every stroke painted again at that size (the canvas is w x h CSS
    pixels at dpr; k is the board's scale of the painting). */
export function drawPaintView(g: CanvasRenderingContext2D, p: Painting, k: number, sig: string, ink: string, w: number, h: number, dpr: number, z: number, ox: number, oy: number) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = p.ground;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  const sc = k * z * dpr;
  g.setTransform(1, 0, 0, 1, -ox * z * dpr, -oy * z * dpr);
  g.save();
  g.beginPath();
  g.rect(0, 0, p.W * sc, p.H * sc);
  g.clip();
  const x0 = ox / k, y0 = oy / k, x1 = (ox + w / z) / k, y1 = (oy + h / z) / k;
  for (const s of p.strokes) if (!(s.box[2] < x0 || s.box[0] > x1 || s.box[3] < y0 || s.box[1] > y1)) drawStroke(g, s, p.style, sc);
  grain(g, p.W * sc, p.H * sc, p.style, p.seed);
  g.restore();
  if (sig) {
    const sigRoom = p.H * 0.06;
    g.font = `800 ${Math.max(9, sigRoom * k * 0.45) * z * dpr}px "Jagora Mono", ui-monospace, monospace`;
    g.fillStyle = ink;
    g.textBaseline = "middle";
    g.textAlign = "right";
    g.fillText(sig, p.W * sc, (p.H + sigRoom / 2) * sc);
    g.textAlign = "left";
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/** paper grain for watercolour (and a faint canvas weave for oil), laid over the finished painting */
export function grain(g: CanvasRenderingContext2D, w: number, h: number, style: Style, seed: number) {
  if (style === "bold") return;
  const t = document.createElement("canvas");
  t.width = t.height = 128;
  const tg = t.getContext("2d")!;
  const id = tg.createImageData(128, 128);
  const rand = rng(seed + 99);
  for (let i = 0; i < 128 * 128; i++) {
    const v = 128 + (rand() - 0.5) * (style === "water" ? 70 : 40);
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
    id.data[i * 4 + 3] = 255;
  }
  tg.putImageData(id, 0, 0);
  g.save();
  g.globalCompositeOperation = "overlay";
  g.globalAlpha = style === "water" ? 0.18 : 0.1;
  g.fillStyle = g.createPattern(t, "repeat")!;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** The painting as a PNG at the chosen size, every stroke painted again at that size, with her signature. */
export async function exportPainting(p: Painting, sig: string, size: SaveSize, ink: string, onProgress?: (f: number) => void): Promise<Blob> {
  while (await nextLayer(p)); // (saved before the last layers were planned: plan them first)
  const sigH = p.H * 0.06;
  const page = pageForSize(p.W, p.H + sigH, size);
  const ground = p.style === "water" ? "#ffffff" : p.ground;
  return encodePNG(page.W, page.H, page.dpi, (g, y0, y1) => {
    g.fillStyle = ground;
    g.fillRect(0, y0, page.W, y1 - y0);
    g.save();
    g.translate(page.ox, page.oy);
    g.beginPath();
    g.rect(0, 0, p.W * page.s, p.H * page.s);
    g.clip();
    const top = (y0 - page.oy) / page.s, bottom = (y1 - page.oy) / page.s;
    for (const s of p.strokes) {
      if (s.box[3] < top || s.box[1] > bottom) continue;
      drawStroke(g, s, p.style, page.s);
    }
    grain(g, p.W * page.s, p.H * page.s, p.style, p.seed);
    g.restore();
    if (sig) {
      const f = sigH * 0.45 * page.s;
      g.font = `800 ${f}px "Jagora Mono", ui-monospace, monospace`;
      g.fillStyle = ink;
      g.textBaseline = "middle";
      g.textAlign = "right";
      g.fillText(sig, page.ox + p.W * page.s, page.oy + (p.H + sigH / 2) * page.s);
      g.textAlign = "left";
    }
  }, onProgress);
}

// for checks in development builds only
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __paint?: unknown }).__paint = { planPainting, startPainting, nextLayer, morePass, drawStroke, grain, exportPainting, drawBrush, drawPaintView };
