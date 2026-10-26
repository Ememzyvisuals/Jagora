"use client";

/* Side-by-side check of our lens against LiquidGlass's own demo: same photo, same sizes, same settings. */
import dynamic from "next/dynamic";
import { Glass } from "@/components/glass/Glass";

const LensStage = dynamic(() => import("@/components/glass/LensStage"), { ssr: false });

export default function Lab() {
  return (
    <div className="relative min-h-dvh overflow-hidden" style={{ background: "url(/sky/beach-phone.webp) center / cover" }}>
      <LensStage src="/sky/beach-phone.webp" />
      <div className="relative flex flex-col items-center gap-10 px-6 pt-12">
        <Glass radius={60} lens={{ blurAmount: 0.3, chromAberration: 0.2, zRadius: 60, refraction: 1.2, brightness: -0.2, specular: 0, edgeHighlight: 0.05, saturation: 0, shadowOpacity: 0.3, shadowOffsetY: 1 }} className="w-full max-w-[340px] px-6 py-14 text-center">
          <h1 className="font-sans text-[64px] font-bold leading-none text-white" style={{ fontFamily: "Inter Variable" }}>Liquid Glass</h1>
          <p className="mt-6 text-[17px] font-semibold text-white">Realistic WebGL glass effects for any HTML element</p>
        </Glass>
        <Glass radius={28} lens={{ blurAmount: 0.3, brightness: -0.1, refraction: 0.69, chromAberration: 0.05, edgeHighlight: 0.05, specular: 0, saturation: 0, zRadius: 40, shadowOpacity: 0.3, shadowOffsetY: 1 }} className="px-14 py-4 text-[17px] font-semibold text-white">
          View on GitHub
        </Glass>
      </div>
    </div>
  );
}
