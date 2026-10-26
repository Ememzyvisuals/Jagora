"use client";

/* The live page Jagora works in, and where things on it sit on screen (for the cursor and highlight). */
let frame: HTMLIFrameElement | null = null;
let stage: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function registerFrame(f: HTMLIFrameElement | null, s: HTMLElement | null) {
  frame = f;
  stage = s;
  listeners.forEach((l) => l());
}
export const getFrame = () => frame;
export const onFrame = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export function doc(): Document | null {
  try {
    return frame?.contentDocument ?? null;
  } catch {
    return null;
  }
}

/** Where an element inside the page is, in the stage's own coordinates (the stage holds the cursor layer). */
export function placeOf(el: Element): { x: number; y: number; w: number; h: number } | null {
  if (!frame || !stage) return null;
  const r = el.getBoundingClientRect();
  const fr = frame.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const scale = fr.width / (frame.clientWidth || fr.width);
  return { x: fr.left - sr.left + r.left * scale, y: fr.top - sr.top + r.top * scale, w: r.width * scale, h: r.height * scale };
}

export function navigate(url: string): Promise<void> {
  return new Promise((resolve) => {
    if (!frame) return resolve();
    const f = frame;
    const done = () => {
      f.removeEventListener("load", done);
      setTimeout(resolve, 250);
    };
    f.addEventListener("load", done);
    f.src = url;
    setTimeout(done, 6000);
  });
}

export async function waitForFrame(timeout = 8000): Promise<boolean> {
  const t0 = Date.now();
  while (!frame) {
    if (Date.now() - t0 > timeout) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}
