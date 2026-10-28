"use client";

/* A word made of glass: the page behind it shows through each letter, bent and frosted, the way the portfolio's
   liquid glass does (#liquid-glass-distortion + blur), with a bright rim and a soft shadow so it reads on any sky.
   The letters are drawn once on a canvas in the site's own font and used as a mask over a glass layer. */
import { useEffect, useState } from "react";

export function GlassWordmark({ text = "Jagora", width, family = "Jagora Boiling", weight = 400 }: {
  text?: string;
  width: number;
  family?: string;
  weight?: number;
}) {
  const height = Math.round(width * 0.36);
  const [mask, setMask] = useState("");
  const [rim, setRim] = useState("");

  useEffect(() => {
    let alive = true;
    const draw = async () => {
      const px = Math.round(height * 0.9);
      try {
        await document.fonts.load(`${weight} ${px}px "${family}"`);
      } catch {}
      if (!alive) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cv = document.createElement("canvas");
      cv.width = Math.round(width * dpr);
      cv.height = Math.round(height * dpr);
      const g = cv.getContext("2d");
      if (!g) return;
      g.scale(dpr, dpr);
      // as large as fits the width
      let size = px;
      g.font = `${weight} ${size}px "${family}", "Jagora Sans", sans-serif`;
      const w0 = g.measureText(text).width;
      if (w0 > width * 0.98) size = Math.floor((size * width * 0.98) / w0);
      g.font = `${weight} ${size}px "${family}", "Jagora Sans", sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "alphabetic";
      g.fillStyle = "#000";
      g.fillText(text, width / 2, height * 0.8);
      setMask(cv.toDataURL("image/png"));
      // the outline of each letter, for its bright glass edge
      g.clearRect(0, 0, width, height);
      g.lineWidth = Math.max(1.5, size / 70);
      g.strokeStyle = "#000";
      g.strokeText(text, width / 2, height * 0.8);
      setRim(cv.toDataURL("image/png"));
    };
    void draw();
    return () => {
      alive = false;
    };
  }, [text, width, height, family, weight]);

  if (!mask) return <div style={{ width, height }} />;
  const masked = {
    WebkitMaskImage: `url(${mask})`,
    maskImage: `url(${mask})`,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  } as const;
  return (
    <div className="glass-word relative" style={{ width, height }} aria-label={text} role="img">
      {/* soft shadow under the letters, so glass on a pale sky still has a shape */}
      <div className="absolute inset-0 translate-y-[4px] blur-[7px]">
        <div className="absolute inset-0 bg-[rgba(10,40,90,.22)]" style={masked} />
      </div>
      {/* the glass itself: what is behind, bent, frosted and brightened */}
      <div className="glass-word-body absolute inset-0" style={masked} />
      {/* light caught on the glass: a sheen from the top, and a bright edge around each letter */}
      <div className="glass-word-sheen absolute inset-0" style={masked} />
      {rim && (
        <div
          className="glass-word-rim absolute inset-0"
          style={{ ...masked, WebkitMaskImage: `url(${rim})`, maskImage: `url(${rim})` }}
        />
      )}
    </div>
  );
}
