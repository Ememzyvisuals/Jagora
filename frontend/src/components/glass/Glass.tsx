"use client";

/* Liquid glass.
   Chromium: the backdrop is refracted through an SVG displacement filter shaped like a rounded slab of glass (strong
   bending at the bezel, clear in the middle), then lightly blurred and saturated. Other browsers: frosted blur.
   On top, a specular rim and a soft sheen follow the pointer, and the surface gives a little when pressed. */
import { glass, onStage } from "@/lib/glassRegistry";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

const canRefract = () => typeof navigator !== "undefined" && /Chrome\/|Chromium|Edg\//.test(navigator.userAgent) && !/Firefox|CriOS|FxiOS/.test(navigator.userAgent);

const mapCache = new Map<string, string>();

/** Displacement map for a rounded rectangle: R/G hold the x/y offset, 128 = none. */
function displacementMap(w: number, h: number, r: number, bezel: number) {
  const key = `${w}x${h}r${r}b${bezel}`;
  const hit = mapCache.get(key);
  if (hit) return hit;
  const S = 0.5; // half resolution is plenty; the filter stretches it
  const cw = Math.max(2, Math.round(w * S)), ch = Math.max(2, Math.round(h * S));
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(cw, ch);
  const hw = w / 2, hh = h / 2, rr = Math.min(r, hw, hh);
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const px = (i + 0.5) / S - hw, py = (j + 0.5) / S - hh;
      const qx = Math.abs(px) - (hw - rr), qy = Math.abs(py) - (hh - rr);
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      const outside = Math.hypot(ox, oy);
      const sdf = outside + Math.min(Math.max(qx, qy), 0) - rr; // < 0 inside
      const d = -sdf; // distance from edge, inside
      // whole surface: a gentle magnifying lens (samples pulled toward the centre)
      let dx = (-px / hw) * 0.12, dy = (-py / hh) * 0.12;
      if (d > 0 && d < bezel) {
        // outward normal
        let nx: number, ny: number;
        if (qx > 0 && qy > 0) {
          nx = ox / (outside || 1);
          ny = oy / (outside || 1);
        } else if (qx > qy) {
          nx = 1;
          ny = 0;
        } else {
          nx = 0;
          ny = 1;
        }
        nx *= Math.sign(px) || 1;
        ny *= Math.sign(py) || 1;
        const t = 1 - d / bezel; // 0 inside, 1 at the edge
        const m = Math.pow(t, 2.2); // convex: bends hardest at the rim
        dx += -nx * m * 0.88;
        dy += -ny * m * 0.88;
      }
      const k = (j * cw + i) * 4;
      img.data[k] = 128 + Math.max(-1, Math.min(1, dx)) * 127;
      img.data[k + 1] = 128 + Math.max(-1, Math.min(1, dy)) * 127;
      img.data[k + 2] = 128;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = cv.toDataURL();
  if (mapCache.size > 60) mapCache.clear();
  mapCache.set(key, url);
  return url;
}

export type GlassProps = HTMLAttributes<HTMLDivElement> & {
  radius?: number;
  /** width of the bending rim, px */
  bezel?: number;
  /** strength of the bending, px */
  refraction?: number;
  /** frost in px */
  blur?: number;
  /** colour fringing at the rim, 0 to ~0.3 */
  dispersion?: number;
  /** body colour of the glass */
  tint?: string;
  /** use CSS glass even when the 3D layer runs (for things drawn above overlays, like tips) */
  flat?: boolean;
  /** frost of the 3D lens, 0 clear to ~0.4 milky */
  frost?: number;
  /** react to the pointer: moving light and a soft press */
  interactive?: boolean;
  pressable?: boolean;
  children?: ReactNode;
};

export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(
  { radius = 28, bezel = 22, refraction = 60, blur = 9, dispersion = 0.14, tint = "rgba(255,255,255,0.18)", frost = 0.16, flat = false, interactive = true, pressable = false, className = "", style, children, ...rest },
  outer,
) {
  const el = useRef<HTMLDivElement>(null);
  useImperativeHandle(outer, () => el.current!);
  const id = useId().replace(/:/g, "");
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [refract, setRefract] = useState(false);
  const [stage, setStageOn] = useState(false);

  // when the 3D glass layer is running, a real lens slab is drawn under this element instead of a CSS filter
  useEffect(() => {
    if (flat) return;
    setStageOn(glass.stage);
    return onStage(setStageOn);
  }, [flat]);
  useEffect(() => {
    if (!stage || !el.current) return;
    return glass.add(el.current, radius, frost, Math.min(bezel, radius, 26));
  }, [stage, radius, frost, bezel]);

  useEffect(() => {
    setRefract(canRefract());
    const node = el.current;
    if (!node) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width + 0), h = Math.round(e.contentRect.height + 0);
      const b = node.getBoundingClientRect();
      setSize((s) => (s && s.w === Math.round(b.width) && s.h === Math.round(b.height) ? s : { w: Math.round(b.width) || w, h: Math.round(b.height) || h }));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const node = el.current;
    if (!node || !interactive) return;
    const move = (e: PointerEvent) => {
      const b = node.getBoundingClientRect();
      node.style.setProperty("--mx", `${((e.clientX - b.left) / b.width) * 100}%`);
      node.style.setProperty("--my", `${((e.clientY - b.top) / b.height) * 100}%`);
      node.style.setProperty("--ang", `${Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * (180 / Math.PI) + 90}deg`);
    };
    const enter = () => node.style.setProperty("--sheen", "1");
    const leave = () => node.style.setProperty("--sheen", "0");
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerenter", enter);
    node.addEventListener("pointerleave", leave);
    return () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointerleave", leave);
    };
  }, [interactive]);

  const map = !stage && refract && size && size.w > 4 && size.h > 4 ? displacementMap(size.w, size.h, radius, Math.min(bezel, size.h / 2, size.w / 2)) : null;
  const backdrop = map ? `url(#lg${id}) blur(${blur}px) saturate(150%) brightness(1.07)` : `blur(${Math.max(blur, 4) * 2.4}px) saturate(150%) brightness(1.06)`;

  return (
    <div
      ref={el}
      {...rest}
      className={`lg ${pressable ? "lg-press" : ""} ${className}`}
      style={
        {
          borderRadius: radius,
          background: stage ? "rgba(255,255,255,0.06)" : tint,
          backdropFilter: stage ? "none" : backdrop,
          WebkitBackdropFilter: stage ? "none" : `blur(${Math.max(blur, 4) * 2.4}px) saturate(150%)`,
          ...style,
        } as CSSProperties
      }
    >
      {map && size && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <filter id={`lg${id}`} x="0" y="0" width={size.w} height={size.h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feImage href={map} x="0" y="0" width={size.w} height={size.h} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={refraction} xChannelSelector="R" yChannelSelector="G" result="dr" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={refraction * (1 + dispersion)} xChannelSelector="R" yChannelSelector="G" result="dg" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={refraction * (1 + dispersion * 2)} xChannelSelector="R" yChannelSelector="G" result="db" />
            <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
            <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
            <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg" />
            <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1" />
          </filter>
        </svg>
      )}
      <span className="lg-rim" aria-hidden="true" />
      <span className="lg-sheen" aria-hidden="true" />
      {children}
    </div>
  );
});
