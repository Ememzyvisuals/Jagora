/* Paint mode: a picture painted with brush strokes, coarse to fine, the way a painter works.

   After Aaron Hertzmann, "Painterly Rendering with Curved Brush Strokes of Multiple Sizes" (SIGGRAPH 1998):
   - the picture is painted in layers, from a big brush to a small one; each layer paints from a copy of the picture
     blurred to the size of its brush, so big brushes lay big colour shapes and small brushes add the detail;
   - a layer only paints where the canvas so far is still far from the picture (a grid as big as the brush, one stroke
     from the worst spot of each cell that is off by more than a threshold), so detail goes where the picture has it;
   - each stroke starts with the colour under it and runs across the light-and-dark lines of the picture (along the
     edges, at right angles to the gradient), bending smoothly, until the colour under it changes;
   - the person is painted with every brush and the background only with the big ones, so the face is careful and
     the background loose. The person comes from SAM 3.1 when Jagora is connected (and she agreed), or from an
     estimate made on her phone.
   Styles: Bold colour (posterised, vivid colour blocks, hard edges), Oil (bristle lines in each stroke, slight colour
   play) and Watercolour (see-through washes that build up, soft blurred reference, paper grain).
   Every stroke is kept as a vector, so the painting can be painted again at print size, sharp. */
import type { Detail, SaveSize } from "./typeart";
import { encodePNG, pageForSize } from "./typeart";

export type Style = "bold" | "oil" | "water";
export type Stroke = { pts: number[]; r: number; c: [number, number, number]; a: number; layer: number; box: [number, number, number, number] };
export type Painting = { W: number; H: number; strokes: Stroke[]; style: Style; ground: string; seed: number };

/** the working size of a painting: smaller on phones, so planning and painting stay smooth */
export const paintSize = () => (typeof window !== "undefined" && Math.min(screen.width, screen.height) < 700 ? 520 : 640);

const clamp = (v: number, a = 0, b = 255) => (v < a ? a : v > b ? b : v);

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
export function estimateMask(d: Uint8ClampedArray, w: number, h: number): Float32Array {
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
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i / w) | 0;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (y > 0) seed(i - w);
      if (y < h - 1) seed(i + w);
    }
    for (let i = 0; i < m.length; i++) m[i] = bg[i] ? 0 : 1;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w * 0.5), dy = (y - h * 0.46) / (h * 0.56);
      m[y * w + x] *= clamp((1 - Math.sqrt(dx * dx + dy * dy)) / 0.25, 0, 1);
    }
  return blurChannel(m, w, h, 3);
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
  bold: { T: 34, maxLen: 9, minLen: 2, fc: 1, fs: 0.5, alpha: 1, posterize: 5, sat: 1.35 },
  oil: { T: 26, maxLen: 14, minLen: 3, fc: 0.65, fs: 0.5, alpha: 0.92, posterize: 0, sat: 1.12 },
  water: { T: 30, maxLen: 12, minLen: 2, fc: 0.5, fs: 1.0, alpha: 0.5, posterize: 0, sat: 1.1 },
};

/** plan every stroke of the painting (nothing is shown yet; the board then paints them one by one) */
export async function planPainting(img: CanvasImageSource & { width: number; height: number }, style: Style, detail: Detail, mask: Float32Array | null, maskW = 0, maskH = 0, seed = 7): Promise<Painting> {
  const long = paintSize();
  const k = long / Math.max(img.width, img.height);
  const W = Math.round(img.width * k), H = Math.round(img.height * k);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const st = STYLE[style];
  const rand = rng(seed);

  // the colours to paint with: a little richer, and for Bold colour cut to a few flat steps
  const R = new Float32Array(W * H), G = new Float32Array(W * H), B = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    let r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    const avg = (r + gg + b) / 3;
    r = clamp(avg + (r - avg) * st.sat);
    gg = clamp(avg + (gg - avg) * st.sat);
    b = clamp(avg + (b - avg) * st.sat);
    R[i] = r;
    G[i] = gg;
    B[i] = b;
  }
  // the subject at this size
  let M: Float32Array;
  if (mask && maskW === W && maskH === H) M = mask;
  else M = estimateMask(d, W, H);
  await new Promise((r) => setTimeout(r));

  const radii = { coarse: [28, 14, 7], medium: [24, 12, 6, 3], fine: [20, 10, 5, 3, 2] }[detail].map((r) => Math.max(1.5, (r * W) / 640));
  // what is on the canvas so far (for "where is it still off?")
  const cc = document.createElement("canvas");
  cc.width = W;
  cc.height = H;
  const cg = cc.getContext("2d", { willReadFrequently: true })!;
  cg.fillStyle = style === "water" ? "#ffffff" : "#808080";
  cg.fillRect(0, 0, W, H);
  cg.lineCap = "round";
  cg.lineJoin = "round";
  const strokes: Stroke[] = [];

  for (let li = 0; li < radii.length; li++) {
    const r = radii[li];
    const br = Math.max(1, Math.round(st.fs * r));
    let rR = blurChannel(R, W, H, br), rG = blurChannel(G, W, H, br), rB = blurChannel(B, W, H, br);
    if (st.posterize) {
      const q = 255 / (st.posterize - 1);
      rR = rR.map((v) => Math.round(v / q) * q);
      rG = rG.map((v) => Math.round(v / q) * q);
      rB = rB.map((v) => Math.round(v / q) * q);
    }
    // the brightness of the reference, for the stroke directions
    const Lm = new Float32Array(W * H);
    for (let i = 0; i < Lm.length; i++) Lm[i] = 0.3 * rR[i] + 0.59 * rG[i] + 0.11 * rB[i];
    const cd = cg.getImageData(0, 0, W, H).data;
    const diff = (i: number) => Math.hypot(cd[i * 4] - rR[i], cd[i * 4 + 1] - rG[i], cd[i * 4 + 2] - rB[i]);
    const first = li === 0;
    // the background only gets the big brushes
    const loose = li >= 2;
    const grid = Math.max(1, Math.round(r));
    const layer: Stroke[] = [];
    let lastYield = performance.now();
    for (let gy = 0; gy < H; gy += grid) {
      if (performance.now() - lastYield > 30) {
        await new Promise((r2) => setTimeout(r2)); // let the page breathe while planning
        lastYield = performance.now();
      }
      for (let gx = 0; gx < W; gx += grid) {
        let sum = 0, n = 0, best = -1, bx = gx, by = gy;
        let inside = 0;
        for (let y = gy; y < Math.min(H, gy + grid); y++)
          for (let x = gx; x < Math.min(W, gx + grid); x++) {
            const i = y * W + x;
            const e = first ? 999 : diff(i);
            sum += e;
            n++;
            inside += M[i];
            if (e > best) {
              best = e;
              bx = x;
              by = y;
            }
          }
        if (!n) continue;
        if (loose && inside / n < 0.35) continue;
        if (!first && sum / n < st.T) continue;
        // the stroke: colour under its start, then across the light-and-dark lines until the colour changes
        const i0 = by * W + bx;
        const col: [number, number, number] = [rR[i0], rG[i0], rB[i0]];
        const pts = [bx, by];
        let x = bx, y = by, lx = 0, ly = 0;
        for (let s = 1; s <= st.maxLen; s++) {
          const xi = clampI(Math.round(x), W), yi = clampI(Math.round(y), H), i = yi * W + xi;
          if (s > st.minLen) {
            const toRef = Math.hypot(rR[i] - col[0], rG[i] - col[1], rB[i] - col[2]);
            const now = first ? 999 : Math.hypot(rR[i] - cd[i * 4], rG[i] - cd[i * 4 + 1], rB[i] - cd[i * 4 + 2]);
            if (now < toRef) break;
          }
          const gx2 = Lm[yi * W + clampI(xi + 1, W)] - Lm[yi * W + clampI(xi - 1, W)];
          const gy2 = Lm[clampI(yi + 1, H) * W + xi] - Lm[clampI(yi - 1, H) * W + xi];
          if (Math.hypot(gx2, gy2) < 0.5) {
            if (s === 1) {
              // flat area: a short stroke in a random direction
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
          x += r * lx;
          y += r * ly;
          if (x < 0 || y < 0 || x >= W || y >= H) break;
          pts.push(x, y);
        }
        // a little life in the colour (a painter never mixes exactly the same twice)
        const j = style === "bold" ? 6 : 10;
        const jc: [number, number, number] = [clamp(col[0] + (rand() - 0.5) * j), clamp(col[1] + (rand() - 0.5) * j), clamp(col[2] + (rand() - 0.5) * j)];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let p = 0; p < pts.length; p += 2) {
          x0 = Math.min(x0, pts[p]);
          x1 = Math.max(x1, pts[p]);
          y0 = Math.min(y0, pts[p + 1]);
          y1 = Math.max(y1, pts[p + 1]);
        }
        layer.push({ pts, r, c: jc, a: st.alpha, layer: li, box: [x0 - r * 1.5, y0 - r * 1.5, x1 + r * 1.5, y1 + r * 1.5] });
      }
    }
    // painted in a random order, like a painter moving around the canvas
    for (let i = layer.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [layer[i], layer[j]] = [layer[j], layer[i]];
    }
    for (const s of layer) drawStroke(cg, s, style, 1);
    strokes.push(...layer);
    await new Promise((r2) => setTimeout(r2));
  }
  return { W, H, strokes, style, ground: style === "water" ? "#ffffff" : "#0e0f12", seed };
}

/** one stroke, at a scale (1 = the planning size) */
export function drawStroke(g: CanvasRenderingContext2D, s: Stroke, style: Style, k: number) {
  const p = s.pts;
  const [r, gg, b] = s.c;
  g.globalAlpha = s.a;
  if (style === "water") {
    // a soft, wider halo first, so washes fade into each other with no hard edge
    g.globalAlpha = s.a * 0.35;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.lineWidth = 2.8 * s.r * k;
    g.beginPath();
    g.moveTo(p[0] * k, p[1] * k);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * k, p[i + 1] * k);
    if (p.length === 2) g.lineTo(p[0] * k + 0.01, p[1] * k);
    g.stroke();
    g.globalAlpha = s.a;
  }
  const path = (dx: number, dy: number) => {
    g.beginPath();
    g.moveTo((p[0] + dx) * k, (p[1] + dy) * k);
    if (p.length === 2) g.lineTo((p[0] + dx + 0.01) * k, (p[1] + dy) * k);
    for (let i = 2; i < p.length; i += 2) {
      const mx = (p[i - 2] + p[i]) / 2, my = (p[i - 1] + p[i + 1]) / 2;
      g.quadraticCurveTo((p[i - 2] + dx) * k, (p[i - 1] + dy) * k, (mx + dx) * k, (my + dy) * k);
      if (i === p.length - 2) g.lineTo((p[i] + dx) * k, (p[i + 1] + dy) * k);
    }
  };
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
  g.lineWidth = 2 * s.r * k;
  path(0, 0);
  g.stroke();
  if (style === "oil" && s.r * k > 2.5) {
    // bristle lines: lighter and darker threads through the stroke, so the brush marks show
    const n = s.r > 6 ? 3 : 2;
    for (let t = 0; t < n; t++) {
      const off = (t - (n - 1) / 2) * s.r * 0.55;
      const len = Math.hypot(p[p.length - 2] - p[0], p[p.length - 1] - p[1]) || 1;
      const nx = -(p[p.length - 1] - p[1]) / len, ny = (p[p.length - 2] - p[0]) / len;
      const v = t % 2 ? 1.12 : 0.88;
      g.strokeStyle = `rgb(${clamp(r * v) | 0},${clamp(gg * v) | 0},${clamp(b * v) | 0})`;
      g.globalAlpha = 0.35;
      g.lineWidth = Math.max(0.6, s.r * 0.22 * k);
      path(nx * off, ny * off);
      g.stroke();
    }
  }
  if (style === "water" && s.r * k > 2) {
    // a darker rim where the wash dries
    g.globalAlpha = 0.12;
    g.lineWidth = Math.max(0.8, s.r * 0.18 * k);
    g.strokeStyle = `rgb(${(r * 0.7) | 0},${(gg * 0.7) | 0},${(b * 0.7) | 0})`;
    path(s.r * 0.6, 0);
    g.stroke();
  }
  g.globalAlpha = 1;
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

/** the brush itself, drawn at the tip of the stroke being painted: bristles in the paint colour, a metal ferrule and
    the handle, pointing back along the stroke */
export function drawBrush(g: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, c: [number, number, number]) {
  g.save();
  g.translate(x, y);
  g.rotate(angle + Math.PI * 0.75);
  const s = size;
  // handle
  g.fillStyle = "#3a2a1c";
  g.beginPath();
  g.roundRect(s * 1.55, -s * 0.13, s * 2.6, s * 0.26, s * 0.13);
  g.fill();
  // ferrule
  g.fillStyle = "#c9ccd2";
  g.fillRect(s * 0.85, -s * 0.2, s * 0.75, s * 0.4);
  // bristles, loaded with paint
  g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  g.beginPath();
  g.moveTo(s * 0.88, -s * 0.22);
  g.quadraticCurveTo(s * 0.3, -s * 0.22, 0, 0);
  g.quadraticCurveTo(s * 0.3, s * 0.22, s * 0.88, s * 0.22);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = Math.max(1, s * 0.04);
  g.stroke();
  g.restore();
}

/** The painting as a PNG at the chosen size, every stroke painted again at that size, with her signature. */
export async function exportPainting(p: Painting, sig: string, size: SaveSize, ink: string, onProgress?: (f: number) => void): Promise<Blob> {
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
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __paint?: unknown }).__paint = { planPainting, drawStroke, grain, exportPainting };
