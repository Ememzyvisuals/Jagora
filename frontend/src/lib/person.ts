/* Where the people are in a picture, found on her phone (her photo never leaves it).
   A small person-segmentation model (MediaPipe Selfie Segmentation, Apache 2.0, about 450 KB) runs with the same
   ONNX runtime the voice detector already loads (/vad/), so nothing new is downloaded but the model itself.
   Type Art uses it to tell a portrait (one person filling the picture: only the person is typed, on clean black, like
   the typed portraits people share) from a scene (a group, a person small in a place, a landscape: typed whole). */

const SIZE = 256;
let session: Promise<{ run: (x: Float32Array) => Promise<Float32Array> } | null> | null = null;

function load() {
  if (!session)
    session = (async () => {
      try {
        const ort = await import("onnxruntime-web/wasm");
        ort.env.logLevel = "error";
        ort.env.wasm.numThreads = 1; // no cross-origin isolation on the site: one thread
        ort.env.wasm.wasmPaths = "/vad/";
        const s = await ort.InferenceSession.create("/typeart/person.onnx", { executionProviders: ["wasm"] });
        return {
          run: async (x: Float32Array) => {
            const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", x, [1, SIZE, SIZE, 3]) });
            return out[s.outputNames[0]].data as Float32Array;
          },
        };
      } catch {
        session = null; // try again next time (a dropped connection)
        return null;
      }
    })();
  return session;
}

export type People = {
  /** how much each spot is a person (0..1), SIZE x SIZE over the whole picture */
  m: Float32Array;
  /** the share of the picture that is people */
  share: number;
  /** separate people (or groups of them) big enough to count */
  count: number;
  /** the biggest one's share of all the people */
  main: number;
  /** heads across the top of the biggest one (people side by side touch at the shoulders) */
  heads: number;
  /** the biggest one, a little wider (64 x 64) */
  keep: Float32Array;
  /** every person, a little wider (64 x 64) */
  all: Float32Array;
};

/** the people in a picture, or null when the model could not run */
export async function findPeople(img: CanvasImageSource & { width: number; height: number }): Promise<People | null> {
  const s = await load();
  if (!s) return null;
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, SIZE, SIZE);
  const d = g.getImageData(0, 0, SIZE, SIZE).data;
  const x = new Float32Array(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) {
    x[i * 3] = d[i * 4] / 255;
    x[i * 3 + 1] = d[i * 4 + 1] / 255;
    x[i * 3 + 2] = d[i * 4 + 2] / 255;
  }
  let m: Float32Array;
  try {
    m = Float32Array.from(await s.run(x));
  } catch {
    return null;
  }
  // the separate people: connected parts on a 64 x 64 grid
  const N = 64, k = SIZE / N;
  const on = new Uint8Array(N * N);
  let total = 0;
  for (let y = 0; y < N; y++)
    for (let xx = 0; xx < N; xx++) {
      let v = 0;
      for (let dy = 0; dy < k; dy += 2) for (let dx = 0; dx < k; dx += 2) v += m[(y * k + dy) * SIZE + xx * k + dx];
      if (v / ((k / 2) * (k / 2)) > 0.5) {
        on[y * N + xx] = 1;
        total++;
      }
    }
  const lab = new Int32Array(N * N).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || lab[i] >= 0) continue;
    const id = sizes.length;
    let n = 0;
    const st = [i];
    lab[i] = id;
    while (st.length) {
      const j = st.pop()!;
      n++;
      const jx = j % N, jy = (j / N) | 0;
      for (const [nx, ny] of [[jx - 1, jy], [jx + 1, jy], [jx, jy - 1], [jx, jy + 1]])
        if (nx >= 0 && ny >= 0 && nx < N && ny < N && on[ny * N + nx] && lab[ny * N + nx] < 0) {
          lab[ny * N + nx] = id;
          st.push(ny * N + nx);
        }
    }
    sizes.push(n);
  }
  const big = sizes.map((n, id) => [n, id]).filter(([n]) => n >= N * N * 0.012).sort((a, b) => b[0] - a[0]); // (a stray patch, a bit of a sign, is not a person)
  const people = big.reduce((a, [n]) => a + n, 0);
  const mainId = big.length ? big[0][1] : -1;
  // heads: people standing side by side touch at the shoulders and become one part, so they are counted across the
  // top of it, where their heads are apart
  let top = N, bottom = -1;
  for (let i = 0; i < lab.length; i++)
    if (lab[i] === mainId) {
      top = Math.min(top, (i / N) | 0);
      bottom = Math.max(bottom, (i / N) | 0);
    }
  // (rows across the top half; a gap must be clear, two cells, so a hand by the face or an arm on the hip is not a
  // second person)
  let heads = 0;
  for (let f = 0.06; f <= 0.46; f += 0.05) {
    const y = Math.round(top + (bottom - top) * f);
    let runs = 0, len = 0, gap = 9;
    for (let xx = 0; xx <= N; xx++) {
      if (xx < N && lab[y * N + xx] === mainId) {
        if (len === 0 && gap >= 2 && runs > 0) runs++;
        else if (len === 0 && runs === 0) runs = 1;
        len++;
        gap = 0;
      } else {
        len = 0;
        gap++;
      }
    }
    heads = Math.max(heads, runs);
  }
  // the main person, a little wider, so nothing else in the picture (a lamp, a bit of a sign) is typed with them
  // (and every person, for a scene: a stray patch, a bit of a sign the model took for a person, is left out)
  const bigIds = new Set(big.map(([, id]) => id));
  const near = (ok: (id: number) => boolean) => {
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let xx = 0; xx < N; xx++) {
        let hit = 0;
        for (let dy = -2; dy <= 2 && !hit; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const yy = y + dy, xxx = xx + dx;
            if (yy >= 0 && xxx >= 0 && yy < N && xxx < N && lab[yy * N + xxx] >= 0 && ok(lab[yy * N + xxx])) {
              hit = 1;
              break;
            }
          }
        out[y * N + xx] = hit;
      }
    return out;
  };
  const keep = near((id) => id === mainId), all = near((id) => bigIds.has(id));
  return { m, keep, all, share: total / (N * N), count: big.length, main: people ? big[0][0] / people : 0, heads: mainId < 0 ? 0 : heads };
}

/** a portrait: one person filling a good part of the picture; anything else (a group, a person small in a place, no
 *  one at all) is a scene and is typed whole */
export const isPortrait = (p: People, w: number, h: number) =>
  p.count >= 1 && p.main > 0.85 && p.heads === 1 && p.share >= (w > h * 1.15 ? 0.22 : 0.12);

const keepAt = (k: Float32Array, fx: number, fy: number) => {
  const x0 = Math.max(0, Math.min(62, Math.floor(fx))), y0 = Math.max(0, Math.min(62, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
  return (k[y0 * 64 + x0] * (1 - tx) + k[y0 * 64 + x0 + 1] * tx) * (1 - ty) + (k[(y0 + 1) * 64 + x0] * (1 - tx) + k[(y0 + 1) * 64 + x0 + 1] * tx) * ty;
};

/** the person mask at w x h (main: only the main person), with a firm edge (so no stray letters sit around the person) */
export function personMaskAt(p: People, w: number, h: number, main = false): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(SIZE - 1.001, ((y + 0.5) * SIZE) / h - 0.5), y0 = Math.max(0, Math.floor(fy)), ty = Math.max(0, fy - y0);
    for (let x = 0; x < w; x++) {
      const fx = Math.min(SIZE - 1.001, ((x + 0.5) * SIZE) / w - 0.5), x0 = Math.max(0, Math.floor(fx)), tx = Math.max(0, fx - x0);
      const a = p.m[y0 * SIZE + x0], b = p.m[y0 * SIZE + x0 + 1], c = p.m[(y0 + 1) * SIZE + x0], d = p.m[(y0 + 1) * SIZE + x0 + 1];
      const v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      const kp = keepAt(main ? p.keep : p.all, ((x + 0.5) * 64) / w - 0.5, ((y + 0.5) * 64) / h - 0.5);
      out[y * w + x] = Math.max(0, Math.min(1, (v - 0.3) / 0.35)) * kp;
    }
  }
  return out;
}
