"use client";

/* Jagora's presence: a glass orb, drawn by the AI-Orb shader (MIT, see orbShader.ts) with Jagora's own colours and a
   soft blue halo around it. No face: it shows what it is doing by how it moves.
     resting    the colour band drifts slowly
     listening  her voice ripples on the edge of the glass
     thinking   a light sweeps round the orb
     speaking   the inside speeds up and swells with Jagora's voice */
import { useEffect, useRef, type MutableRefObject } from "react";
import { useTheme } from "@/lib/theme";
import { CLOUD_FS, FINISH, GLASS_FS, ORB_FS, ORB_VS, type Finish } from "./orbShader";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

/* Jagora's palette: the pearl look from the references (pink, lilac and sky blue in a pale body). Light and dark
   fields are authored separately, as the shader's author recommends. */
const PALETTE = {
  light: { stops: ["#f59ccb", "#b9a6f5", "#5fb4ff"], body: "#f5f6fb" },
  dark: { stops: ["#2a85f5", "#59d4fc", "#9e6bfa"], body: "#07080e" },
};
const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
const STATE = { idle: 0, listening: 1, thinking: 2, speaking: 3 } as const;

export function Orb({
  size = 120,
  state = "idle",
  levelRef,
  finish = "pearl",
  halo = true,
  className = "",
}: {
  size?: number;
  state?: OrbState;
  levelRef?: MutableRefObject<number>;
  finish?: Finish | "cloud" | "glass";
  halo?: boolean;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dark = useTheme() === "dark";

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cv.height = Math.round(size * dpr);
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, ORB_VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, finish === "cloud" ? CLOUD_FS : finish === "glass" ? GLASS_FS : ORB_FS));
    gl.linkProgram(pr);
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const attr = gl.getAttribLocation(pr, "aPos");
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const u = (n: string) => gl.getUniformLocation(pr, n);
    const pal = dark ? PALETTE.dark : PALETTE.light;
    const [c1, c2, c3] = pal.stops.map(hex);
    const body = hex(pal.body);
    gl.uniform3f(u("uC1"), ...c1);
    gl.uniform3f(u("uC2"), ...c2);
    gl.uniform3f(u("uC3"), ...c3);
    gl.uniform3f(u("uBody"), ...body);
    if (finish !== "cloud" && finish !== "glass") gl.uniform1i(u("uFinish"), FINISH[finish]);
    gl.uniform1f(u("uDark"), dark ? 1 : 0);
    gl.uniform1f(u("uGrain"), 0.012);
    gl.uniform1f(u("uSeed"), 0.37);
    gl.uniform1f(u("uDetail"), Math.min(1, Math.max(0, (size - 28) / 68)));
    gl.uniform2f(u("uPointer"), 0.7, 0.5);
    gl.uniform1f(u("uPtr"), 0);
    gl.uniform1f(u("uRes"), cv.width);
    const uT = u("uTime"), uF = u("uFlow"), uR = u("uRing"), uS = u("uState"), uI = u("uIn"), uO = u("uOut");

    let raf = 0, visible = true, last = 0, flow = 0, ring = 0, lin = 0, lout = 0;
    const t0 = performance.now();
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "120px" });
    io.observe(cv);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      const st = stateRef.current;
      const v = levelRef ? Math.min(1, Math.max(0, levelRef.current)) : 0;
      const k = Math.min(1, dt * 11);
      lin += ((st === "listening" ? v : 0) - lin) * k; // her voice lives on the edge
      lout += ((st === "speaking" ? v : 0) - lout) * k; // Jagora's voice moves the inside
      flow += dt * (1 + lout * 3.2);
      ring += dt * (0.42 + lin * 0.5);
      if (!visible) return;
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.uniform1f(uF, flow);
      gl.uniform1f(uR, ring);
      gl.uniform1i(uS, STATE[st]);
      gl.uniform1f(uI, lin);
      gl.uniform1f(uO, lout);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      gl.deleteProgram(pr);
    };
  }, [size, levelRef, finish, dark]);

  return (
    <span className={`relative inline-grid place-items-center ${className}`} style={{ width: size, height: size }}>
      {halo && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: -size * 0.14,
            background: dark
              ? "radial-gradient(closest-side, rgba(89,140,255,.35), rgba(89,140,255,.12) 60%, transparent 100%)"
              : "radial-gradient(closest-side, rgba(120,170,255,.45), rgba(150,190,255,.18) 62%, transparent 100%)",
            filter: `blur(${Math.max(4, size * 0.05)}px)`,
          }}
        />
      )}
      <canvas
        ref={canvas}
        className="relative"
        style={{ width: size, height: size }}
        role="img"
        aria-label={state === "listening" ? "Jagora is listening" : state === "speaking" ? "Jagora is speaking" : "Jagora"}
      />
    </span>
  );
}
