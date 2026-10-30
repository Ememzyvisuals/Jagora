/* Photoreal, brandless devices with the real Jagora screens, modelled and rendered in Blender (Cycles), shipped as
   transparent AVIF/WebP at two sizes. They float gently; nothing to load but the picture. */
export function DeviceRender({ name, alt, w, h, className = "" }: { name: "hero" | "phones"; alt: string; w: number; h: number; className?: string }) {
  const set = (ext: string) => `/devices/${name}-sm.${ext} ${Math.round(w * 0.55)}w, /devices/${name}.${ext} ${w}w`;
  const sizes = name === "hero" ? "(min-width: 1400px) 1300px, 100vw" : "(min-width: 768px) 50vw, 100vw";
  return (
    <div className={`device-float ${className}`}>
      <picture>
        <source type="image/avif" srcSet={set("avif")} sizes={sizes} />
        <source type="image/webp" srcSet={set("webp")} sizes={sizes} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/devices/${name}.webp`} alt={alt} width={w} height={h} loading="lazy" decoding="async" className="block h-auto w-full select-none" draggable={false} />
      </picture>
    </div>
  );
}
