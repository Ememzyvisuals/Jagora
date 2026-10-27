"use client";

/* The page background. Full devices get the liquid-glass layer (the sky plus a lens under every glass surface); light
   mode (slow data, Data Saver, small phones, reduced motion) gets the same sky as a still image and CSS glass. */
import dynamic from "next/dynamic";
import { useEffect, useState, type MutableRefObject } from "react";
import { useLite } from "@/lib/lite";
import { useTheme } from "@/lib/theme";

const LensStage = dynamic(() => import("./LensStage"), { ssr: false });
// The WebGL lens is drawn only under surfaces that opt in (lens prop): the bottom bar, the search bar and Discover's
// pocket. Everything else is the white frosted glass.
const USE_LENS = false; // the portfolio glass (CSS) is used instead of the WebGL lens

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

export function Backdrop(_: { level?: MutableRefObject<number> }) {
  const lite = useLite();
  // the lens only redraws when something moves, so it runs on slow networks and modest phones too; it needs WebGL
  const [gl, setGl] = useState(false);
  useEffect(() => {
    try {
      setGl(!!document.createElement("canvas").getContext("webgl"));
    } catch {}
  }, []);
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
      <div className="fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className={`sky-bg absolute inset-0 ${lite ? "" : "sky-drift"}`} />
      </div>
      {USE_LENS && gl && idle && <LensStage src={src} />}
    </>
  );
}
