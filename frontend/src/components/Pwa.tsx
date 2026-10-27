"use client";

/* Registers the service worker (production only) so Jagora can be added to the home screen and open offline. */
import { useEffect } from "react";

export function Pwa() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}

/** Full screen on and off (Android and desktop; iPhone uses "Add to Home Screen" instead). */
export function canFullscreen() {
  return typeof document !== "undefined" && !!document.documentElement.requestFullscreen && !window.matchMedia("(display-mode: standalone)").matches;
}
export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
  } catch {}
}

/** Desktop: Jagora goes full screen on the first click (browsers only allow it after a click or key press), and
    remembers if she turns it off. */
export const AUTO_FS = "jagora:autofs";
export function autoFullscreenOn() {
  try {
    return localStorage.getItem(AUTO_FS) !== "0";
  } catch {
    return true;
  }
}
export function setAutoFullscreen(on: boolean) {
  try {
    localStorage.setItem(AUTO_FS, on ? "1" : "0");
  } catch {}
}
export function useAutoFullscreen(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !canFullscreen()) return;
    const go = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-no-autofs]")) return;
      if (autoFullscreenOn() && !document.fullscreenElement) void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
      removeEventListener("pointerdown", go, true);
      removeEventListener("keydown", go, true);
    };
    addEventListener("pointerdown", go, true);
    addEventListener("keydown", go, true);
    return () => {
      removeEventListener("pointerdown", go, true);
      removeEventListener("keydown", go, true);
    };
  }, [enabled]);
}
