"use client";

import { useEffect, useState } from "react";

/** True after the first render in the browser: saved state (language, profile, tasks) is only known then. */
export function useHydrated() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(true);
  }, []);
  return ok;
}

export function useMedia(query: string) {
  const [match, setMatch] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

export function ago(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}
