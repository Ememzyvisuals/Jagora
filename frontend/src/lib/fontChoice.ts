"use client";

/* Which display font the headings and the "Jagora" wordmark use, while we choose: ours (Jagora Pixel / Jagora Sans),
   Galgo Condensed, or Climate Crisis. Kept on this device; switch from the small picker at the bottom left. */
import { useSyncExternalStore } from "react";

export type FontChoice = "ours" | "galgo" | "climate";
const KEY = "jagora:font";
const EVT = "jagora:font";

/** the face the canvas wordmark draws with, per choice */
export const WORDMARK: Record<FontChoice, { family: string; weight: number; spacing: number; maxH: number }> = {
  ours: { family: "Jagora Sans", weight: 800, spacing: -0.02, maxH: 0.92 },
  galgo: { family: "Jagora Galgo", weight: 400, spacing: 0.01, maxH: 1.12 },
  climate: { family: "Jagora Climate", weight: 400, spacing: -0.01, maxH: 0.92 },
};

export function getFont(): FontChoice {
  if (typeof document === "undefined") return "ours";
  const v = document.documentElement.dataset.font;
  return v === "galgo" || v === "climate" ? v : "ours";
}

export function setFont(v: FontChoice) {
  if (v === "ours") delete document.documentElement.dataset.font;
  else document.documentElement.dataset.font = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {}
  dispatchEvent(new Event(EVT));
}

const subscribe = (f: () => void) => {
  addEventListener(EVT, f);
  return () => removeEventListener(EVT, f);
};
export const useFont = () => useSyncExternalStore(subscribe, getFont, () => "ours" as FontChoice);
