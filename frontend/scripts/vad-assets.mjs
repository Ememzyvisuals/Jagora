// Copies the speech detector's files (Silero model, its audio worklet, and the ONNX runtime) into public/vad, so the
// app serves them itself. Runs before dev and build; the copies are not kept in git.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vad");
mkdirSync(out, { recursive: true });
const vad = join(root, "node_modules", "@ricky0123", "vad-web", "dist");
const ort = join(root, "node_modules", "onnxruntime-web", "dist");
for (const [dir, f] of [
  [vad, "vad.worklet.bundle.min.js"],
  [vad, "silero_vad_v6.onnx"],
  [ort, "ort-wasm-simd-threaded.wasm"],
  [ort, "ort-wasm-simd-threaded.mjs"],
]) copyFileSync(join(dir, f), join(out, f));
console.log("speech detector files ready in public/vad");
