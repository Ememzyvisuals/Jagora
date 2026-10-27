"use client";

/* Real 3D devices for the landing page, built with three.js: a midnight laptop whose lid opens on a hinge and a
   phone with a metal frame, Dynamic Island and side buttons. The app's real screenshots are on their screens and
   change every few seconds. The devices float, turn as the page scrolls and lean towards the pointer.
   If the browser cannot draw 3D, the flat picture passed as `fallback` is shown instead. */
import { useEffect, useRef, useState, type ReactNode } from "react";

export type Scene = "hero" | "phones" | "safety";

export function Devices3D({ scene, className = "", fallback }: { scene: Scene; className?: string; fallback: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let stop = () => {};
    let dead = false;
    import("./devices3d/stage")
      .then(({ mount }) => {
        if (dead) return;
        stop = mount(el, scene, () => !dead && setState("ready"));
      })
      .catch(() => !dead && setState("failed"));
    return () => {
      dead = true;
      stop();
    };
  }, [scene]);

  if (state === "failed") return <>{fallback}</>;
  return (
    <div
      ref={box}
      className={`relative transition-opacity duration-700 ${state === "ready" ? "opacity-100" : "opacity-0"} ${className}`}
      role="img"
      aria-label={scene === "phones" ? "Jagora on two phones" : scene === "safety" ? "Jagora asking for a private number on a laptop" : "Jagora on a laptop and a phone"}
    />
  );
}
