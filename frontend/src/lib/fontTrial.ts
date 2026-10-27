"use client";

/* Temporary: trying the home wordmark in Bricolage or Boiling before choosing. */
import { useSyncExternalStore } from "react";

export const MARK = ["bricolage", "boiling"] as const;
export type MarkFont = (typeof MARK)[number];
export const MARK_FAMILY: Record<MarkFont, { family: string; weight: number }> = {
  bricolage: { family: "Jagora Sans", weight: 800 },
  boiling: { family: "Jagora Boiling", weight: 400 },
};
const EVT = "jagora:fonttrial";
const get = (): MarkFont => (typeof document !== "undefined" && document.documentElement.dataset.mark === "boiling" ? "boiling" : "bricolage");
export function setMark(v: MarkFont) {
  document.documentElement.dataset.mark = v;
  try {
    localStorage.setItem("jagora:mark", v);
  } catch {}
  dispatchEvent(new Event(EVT));
}
const sub = (f: () => void) => (addEventListener(EVT, f), () => removeEventListener(EVT, f));
export const useHomeMark = () => MARK_FAMILY[useSyncExternalStore(sub, get, () => "bricolage" as MarkFont)];
export const useHomeMarkName = () => useSyncExternalStore(sub, get, () => "bricolage" as MarkFont);
