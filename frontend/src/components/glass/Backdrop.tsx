"use client";

/* The page background. Full devices get the 3D glass layer (sky + a lens slab under every glass surface); light
   mode (slow data, Data Saver, small phones, reduced motion) gets the same sky as a still image and CSS glass. */
import dynamic from "next/dynamic";
import type { MutableRefObject } from "react";
import { useLite } from "@/lib/lite";

const GlassStage = dynamic(() => import("./GlassStage"), { ssr: false });

export const SKY_CSS = {
  backgroundImage: "url(/sky/hero-desktop.webp), linear-gradient(180deg,#5ea9ec 0%,#8cc4f2 40%,#cfe6f8 75%,#eef6fc 100%)",
  backgroundSize: "cover",
  backgroundPosition: "center top",
  backgroundBlendMode: "multiply" as const,
};

export function Backdrop({ level }: { level?: MutableRefObject<number> }) {
  const lite = useLite();
  return (
    <>
      <div className="fixed inset-0" style={SKY_CSS} aria-hidden="true" />
      {lite === false && <GlassStage level={level} />}
    </>
  );
}
