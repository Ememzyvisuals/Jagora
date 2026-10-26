"use client";

/* Liquid glass.
   Chromium: the backdrop is refracted through an SVG displacement filter shaped like a rounded slab of glass (strong
   bending at the bezel, clear in the middle), then lightly blurred and saturated. Other browsers: frosted blur.
   On top, a specular rim and a soft sheen follow the pointer, and the surface gives a little when pressed. */
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
      let dx = 0, dy = 0;
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
        dx = -nx * m;
        dy = -ny * m;
      }
      const k = (j * cw + i) * 4;
      img.data[k] = 128 + dx * 127;
      img.data[k + 1] = 128 + dy * 127;
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
  /** body colour of the glass */
  tint?: string;
  /** react to the pointer: moving light and a soft press */
  interactive?: boolean;
  pressable?: boolean;
  children?: ReactNode;
};

export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(
  { radius = 28, bezel = 22, refraction = 46, blur = 6, tint = "rgba(255,255,255,0.34)", interactive = true, pressable = false, className = "", style, children, ...rest },
  outer,
) {
  const el = useRef<HTMLDivElement>(null);
  useImperativeHandle(outer, () => el.current!);
  const id = useId().replace(/:/g, "");
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [refract, setRefract] = useState(false);

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

  const map = refract && size && size.w > 4 && size.h > 4 ? displacementMap(size.w, size.h, radius, Math.min(bezel, size.h / 2, size.w / 2)) : null;
  const backdrop = map ? `url(#lg${id}) blur(${blur * 0.5}px) saturate(135%) brightness(1.08)` : `blur(${blur * 2.6}px) saturate(135%) brightness(1.07)`;

  return (
    <div
      ref={el}
      {...rest}
      className={`lg ${pressable ? "lg-press" : ""} ${className}`}
      style={
        {
          borderRadius: radius,
          background: tint,
          backdropFilter: backdrop,
          WebkitBackdropFilter: `blur(${blur * 2.6}px) saturate(135%)`,
          ...style,
        } as CSSProperties
      }
    >
      {map && size && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <filter id={`lg${id}`} x="0" y="0" width={size.w} height={size.h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feImage href={map} x="0" y="0" width={size.w} height={size.h} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={refraction} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      <span className="lg-rim" aria-hidden="true" />
      <span className="lg-sheen" aria-hidden="true" />
      {children}
    </div>
  );
});
