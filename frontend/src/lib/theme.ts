"use client";

/* Light is the default. Dark is a soft dim mode: the sky goes to dusk and the glass turns smoky, so the screen is
   easier on the eyes at night without going pitch black. The choice is kept on this phone only. */
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const KEY = "jagora:theme";
const EVT = "jagora:theme";

export function getTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(t: Theme) {
  const root = document.documentElement;
  // a short cross-fade instead of a hard cut
  root.classList.add("theme-fade");
  if (t === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  try {
    localStorage.setItem(KEY, t);
  } catch {}
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#16181d" : "#0e0f12");
  dispatchEvent(new Event(EVT));
  setTimeout(() => root.classList.remove("theme-fade"), 450);
}

export const toggleTheme = () => setTheme(getTheme() === "dark" ? "light" : "dark");

const subscribe = (f: () => void) => {
  addEventListener(EVT, f);
  return () => removeEventListener(EVT, f);
};

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => "light");
}

/** Glass tints are written as white with an alpha; in dark mode the same alpha becomes smoky charcoal. */
export function themedTint(tint: string, theme: Theme) {
  if (theme !== "dark") return tint;
  const m = tint.match(/^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)$/);
  if (!m) return tint;
  const a = Math.min(0.9, parseFloat(m[1]) * 0.85 + 0.12);
  return `rgba(30,33,40,${a.toFixed(2)})`;
}
