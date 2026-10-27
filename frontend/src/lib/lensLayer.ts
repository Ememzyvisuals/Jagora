"use client";

/* What sits under the glass besides the sky: the live picture of the page Jagora is browsing. The lens shader
   bends and frosts whatever is in its texture, so the bars over a website show that website through the glass
   (not the sky behind it). One layer at a time: the <img> of the live page. */
type Layer = { img: HTMLImageElement; radius: number; bg: string };
let layer: Layer | null = null;
let version = 0;
const subs = new Set<() => void>();

export function setLensLayer(l: Layer | null) {
  layer = l;
  version++;
  subs.forEach((f) => f());
}
/** call when the picture changed (a new frame) */
export function bumpLensLayer() {
  version++;
  subs.forEach((f) => f());
}
export const lensLayer = () => layer;
export const lensLayerVersion = () => version;
export function onLensLayer(f: () => void) {
  subs.add(f);
  return () => void subs.delete(f);
}
