"use client";

/* The page background. Full devices get the 3D glass layer (sky + a lens slab under every glass surface); light
   mode (slow data, Data Saver, small phones, reduced motion) gets the same sky as a still image and CSS glass. */
import dynamic from "next/dynamic";
import { useEffect, useState, type MutableRefObject } from "react";
import { useLite } from "@/lib/lite";
import { useTheme } from "@/lib/theme";

const GlassStage = dynamic(() => import("./GlassStage"), { ssr: false });

/** The same sky the CSS layer shows, for the 3D layer. */
export function useSkySrc() {
  const theme = useTheme();
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = matchMedia("(orientation: landscape) and (min-width: 700px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return `/sky/${theme === "dark" ? "dusk" : "beach"}-${wide ? "desktop" : "phone"}.webp`;
}

export function Backdrop({ level }: { level?: MutableRefObject<number> }) {
  const lite = useLite();
  const src = useSkySrc();
  // the 3D layer loads only after the page is usable
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => setIdle(true), { timeout: 1500 });
    else setTimeout(() => setIdle(true), 600);
  }, []);
  return (
    <>
      <div className="sky-bg fixed inset-0" aria-hidden="true" />
      {lite === false && idle && <GlassStage src={src} level={level} />}
    </>
  );
}
