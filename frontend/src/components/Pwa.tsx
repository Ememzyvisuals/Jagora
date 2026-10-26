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
