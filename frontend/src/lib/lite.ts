"use client";

/* Light mode: phones on slow data, with Data Saver on, with little memory, or that asked for less motion get the
   same design without the 3D glass (a still sky instead). Everything else stays the same. Saved choice wins. */
import { useEffect, useState } from "react";

type Conn = { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };

export function detectLite(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const forced = localStorage.getItem("jagora:lite");
    if (forced === "1") return true;
    if (forced === "0") return false;
  } catch {}
  const nav = navigator as Navigator & { connection?: Conn; deviceMemory?: number; hardwareConcurrency?: number };
  const c = nav.connection;
  if (c?.saveData) return true;
  if (c?.effectiveType && /(^|-)2g|3g/.test(c.effectiveType)) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return true;
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 2) return true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return true;
  return false;
}

/** null until known (first render in the browser), then true for light mode. */
export function useLite() {
  const [lite, setLite] = useState<boolean | null>(null);
  useEffect(() => {
    setLite(detectLite());
    const c = (navigator as Navigator & { connection?: Conn }).connection;
    const on = () => setLite(detectLite());
    c?.addEventListener?.("change", on);
    return () => c?.removeEventListener?.("change", on);
  }, []);
  return lite;
}

export function setLitePreference(v: boolean | null) {
  try {
    if (v === null) localStorage.removeItem("jagora:lite");
    else localStorage.setItem("jagora:lite", v ? "1" : "0");
  } catch {}
}
