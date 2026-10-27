"use client";

/* Temporary: trying body fonts and the footer wordmark font across every page before choosing. */
import { useSyncExternalStore } from "react";

export const BODY = ["piazzolla", "biolinum", "vollkorn"] as const;
export const MARK = ["bricolage", "boiling", "anson"] as const;
export type Body = (typeof BODY)[number];
export type MarkFont = (typeof MARK)[number];
export const MARK_FAMILY: Record<MarkFont, { family: string; weight: number }> = {
  bricolage: { family: "Jagora Sans", weight: 800 },
  boiling: { family: "Trial Boiling", weight: 400 },
  anson: { family: "Trial Anson", weight: 400 },
};
const EVT = "jagora:fonttrial";

export function getTrial(): { body: Body; mark: MarkFont } {
  if (typeof document === "undefined") return { body: "piazzolla", mark: "bricolage" };
  const d = document.documentElement.dataset;
  return { body: (BODY as readonly string[]).includes(d.body ?? "") ? (d.body as Body) : "piazzolla", mark: (MARK as readonly string[]).includes(d.mark ?? "") ? (d.mark as MarkFont) : "bricolage" };
}
export function setTrial(k: "body" | "mark", v: string) {
  document.documentElement.dataset[k] = v;
  try {
    localStorage.setItem(`jagora:${k}`, v);
  } catch {}
  dispatchEvent(new Event(EVT));
}
const sub = (f: () => void) => (addEventListener(EVT, f), () => removeEventListener(EVT, f));
let cache = { body: "piazzolla" as Body, mark: "bricolage" as MarkFont };
const snap = () => {
  const t = getTrial();
  if (t.body !== cache.body || t.mark !== cache.mark) cache = t;
  return cache;
};
export const useTrial = () => useSyncExternalStore(sub, snap, () => cache);
