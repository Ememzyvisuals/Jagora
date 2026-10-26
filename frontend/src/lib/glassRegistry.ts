"use client";

/* Glass surfaces on the page register here; the GlassStage draws a real glass slab under each one. */
/** Lens settings, same names and meaning as LiquidGlass (github.com/ybouane/liquidglass). Lengths are CSS px. */
export type LensConfig = {
  blurAmount: number;
  refraction: number;
  chromAberration: number;
  edgeHighlight: number;
  specular: number;
  fresnel: number;
  zRadius: number;
  saturation: number;
  tintStrength: number;
  brightness: number;
  shadowOpacity: number;
  shadowSpread: number;
  shadowOffsetY: number;
};
export type GlassEntry = { id: number; el: HTMLElement; radius: number; frost: number; bevel: number; lens?: Partial<LensConfig> };

let next = 1;
const entries = new Map<number, GlassEntry>();
const listeners = new Set<() => void>();
let stageOn = false;

export const glass = {
  add(el: HTMLElement, radius: number, frost: number, bevel: number, lens?: Partial<LensConfig>) {
    const id = next++;
    entries.set(id, { id, el, radius, frost, bevel, lens });
    listeners.forEach((l) => l());
    return () => {
      entries.delete(id);
      listeners.forEach((l) => l());
    };
  },
  list: () => [...entries.values()],
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** true while a GlassStage is mounted and running in 3D */
  get stage() {
    return stageOn;
  },
  setStage(v: boolean) {
    stageOn = v;
    stageListeners.forEach((l) => l(v));
  },
};

const stageListeners = new Set<(v: boolean) => void>();
export const onStage = (l: (v: boolean) => void) => {
  stageListeners.add(l);
  return () => {
    stageListeners.delete(l);
  };
};
