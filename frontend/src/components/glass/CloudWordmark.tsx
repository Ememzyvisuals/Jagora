"use client";

/* "Jagora" as thick glass letters with a living sky inside them. A WebGL shader reads the letter shapes from a
   canvas mask, builds a bevelled height field from a blurred copy, refracts drifting fbm clouds through it and adds
   a specular highlight from a light that follows the pointer. A tap sends a ripple through the glass; while Jagora
   speaks (level > 0) the clouds move faster. */
import { useEffect, useRef, type MutableRefObject } from "react";

const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;

const FS = `precision highp float;
varying vec2 v;
uniform sampler2D uMask, uH;
uniform vec2 uRes, uLight;
uniform float uT, uAmp;
uniform vec3 uTap;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.55; for(int i=0;i<6;i++){ s+=a*n2(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
void main(){
  float m = texture2D(uMask, v).r;
  if (m < .002) { gl_FragColor = vec4(0.); return; }
  vec2 px = 1./uRes;
  float h  = texture2D(uH, v).r;
  float hx = texture2D(uH, v+vec2(px.x*2.,0.)).r - texture2D(uH, v-vec2(px.x*2.,0.)).r;
  float hy = texture2D(uH, v+vec2(0.,px.y*2.)).r - texture2D(uH, v-vec2(0.,px.y*2.)).r;
  vec3 n = normalize(vec3(-hx*7., -hy*7., 1.));
  // tap ripple
  float age = uT - uTap.z;
  vec2 asp = vec2(uRes.x/uRes.y, 1.);
  float d = distance(v*asp, uTap.xy*asp);
  float rip = step(0., age) * sin(d*38. - age*9.) * exp(-age*2.2) * exp(-d*3.5);
  n = normalize(n + vec3(rip*.35*normalize(v*asp-uTap.xy*asp+1e-4), 0.));
  // sky and clouds seen through the glass, bent by the surface
  float speed = .018 + uAmp*.09;
  vec2 c1 = v*asp*2.1 + n.xy*.32 + vec2(uT*speed, uT*.004);
  float cl = fbm(c1);
  cl = smoothstep(.42, .88, cl + .12*fbm(c1*2.7 - uT*.02));
  vec3 skyTop = vec3(.22,.53,.92), skyLow = vec3(.62,.82,.99);
  vec3 col = mix(skyLow, skyTop, smoothstep(0.,1.,v.y + n.y*.25));
  col = mix(col, vec3(1.), cl*.95);
  // glass body: lighter where thick, a touch of depth at the bevel
  col = mix(col, vec3(.93,.97,1.), .08*h);
  col *= 1. - .28*(1.-h)*(n.y<0.?1.:.35);
  // light
  vec3 L = normalize(vec3((uLight - v)*asp, .55));
  vec3 R = reflect(-L, n);
  float spec = pow(max(R.z, 0.), 34.) * .95 + pow(max(R.z,0.), 6.) * .12;
  float fres = pow(1. - n.z, 1.6);
  col += spec + fres*.75 + uAmp*.08;
  // bright inner lip along the lower edge, like thick glass catching light
  col += smoothstep(.55,.0,h) * max(-n.y,0.) * .35;
  gl_FragColor = vec4(min(col, 1.)*m, m);
}`;

export function CloudWordmark({
  text = "Jagora",
  width = 320,
  levelRef,
  className = "",
}: {
  text?: string;
  width?: number;
  levelRef?: MutableRefObject<number>;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round(width * 0.38);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return;
    let raf = 0, alive = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(width * dpr), H = Math.round(height * dpr);
    cv.width = W;
    cv.height = H;

    const sh = (t: number, s: string) => {
      const o = gl.createShader(t)!;
      gl.shaderSource(o, s);
      gl.compileShader(o);
      return o;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const U = (n: string) => gl.getUniformLocation(pr, n);
    const uT = U("uT"), uAmp = U("uAmp"), uLight = U("uLight"), uTap = U("uTap");
    gl.uniform2f(U("uRes"), W, H);
    gl.uniform1i(U("uMask"), 0);
    gl.uniform1i(U("uH"), 1);

    const tex = (unit: number, src: HTMLCanvasElement) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };

    const draw = () => {
      const font = `800 ${H}px "Jagora Sans", sans-serif`;
      const mk = (blur: number) => {
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const x = c.getContext("2d")!;
        x.fillStyle = "#000";
        x.fillRect(0, 0, W, H);
        x.font = font;
        const m = x.measureText(text);
        const size = H * Math.min(0.92, (W * 0.94) / m.width);
        x.font = `800 ${size}px "Jagora Sans", sans-serif`;
        x.letterSpacing = `${-size * 0.02}px`;
        x.textAlign = "center";
        x.textBaseline = "middle";
        if (blur) x.filter = `blur(${blur}px)`;
        x.fillStyle = "#fff";
        x.fillText(text, W / 2, H * 0.47);
        return c;
      };
      tex(0, mk(0));
      tex(1, mk(Math.round(H * 0.07)));
    };

    const light = { x: 0.3, y: 0.85, tx: 0.3, ty: 0.85 };
    const tap = { x: -1, y: -1, t: -10 };
    let amp = 0;
    const t0 = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const t = (now - t0) / 1000;
      if (light.tx === light.x && light.ty === light.y) {
        // idle: the light drifts slowly across the letters
        light.tx = 0.5 + 0.45 * Math.sin(t * 0.25);
        light.ty = 0.8 + 0.15 * Math.cos(t * 0.31);
      }
      light.x += (light.tx - light.x) * 0.08;
      light.y += (light.ty - light.y) * 0.08;
      if (Math.abs(light.tx - light.x) < 1e-3) light.x = light.tx;
      if (Math.abs(light.ty - light.y) < 1e-3) light.y = light.ty;
      const target = levelRef ? Math.min(1, Math.max(0, levelRef.current)) : 0;
      amp += (target - amp) * (target > amp ? 0.2 : 0.05);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uT, t);
      gl.uniform1f(uAmp, amp);
      gl.uniform2f(uLight, light.x, light.y);
      gl.uniform3f(uTap, tap.x, tap.y, tap.t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const local = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      return { x: (e.clientX - b.left) / b.width, y: 1 - (e.clientY - b.top) / b.height };
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      light.tx = p.x;
      light.ty = p.y + 0.25;
    };
    const down = (e: PointerEvent) => {
      const p = local(e);
      tap.x = p.x;
      tap.y = p.y;
      tap.t = (performance.now() - t0) / 1000;
    };
    window.addEventListener("pointermove", move);
    cv.addEventListener("pointerdown", down);

    document.fonts.load(`800 40px "Jagora Sans"`).finally(() => {
      if (!alive) return;
      draw();
      raf = requestAnimationFrame(frame);
    });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerdown", down);
    };
  }, [text, width, height, levelRef]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={text}
      className={`block touch-manipulation select-none ${className}`}
      style={{ width, height, filter: "drop-shadow(0 10px 18px rgba(30,70,130,.22)) drop-shadow(0 2px 3px rgba(30,70,130,.18))" }}
    />
  );
}
