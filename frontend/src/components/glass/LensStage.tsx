"use client";

/* The glass layer behind the whole page. One WebGL canvas draws the sky, then a liquid-glass lens under every glass
   surface of the interface: the sky bends at the rim (two-surface refraction through a rounded bevel), frosts toward
   the middle, splits into colour at the edge, catches light on top and casts a soft shadow. The page's own text and
   buttons sit on top in the DOM, sharp.

   The lens shader is adapted from LiquidGlass by Youssef Bouane (MIT): https://github.com/ybouane/liquidglass
   What is ours: one shared canvas for every surface (no per-element canvases, no DOM capture, so it stays cheap on
   phones), the sky as the scene, per-surface frost, clipping to scroll areas, and drawing only when something moved. */
import { useEffect, useRef } from "react";
import { glass, type GlassEntry, type LensConfig } from "@/lib/glassRegistry";
import { lensLayer, onLensLayer } from "@/lib/lensLayer";

/** LiquidGlass's defaults, then Jagora's: a thick pill bevel, light frost, a little darker, light on top. */
const BASE: LensConfig = {
  blurAmount: 0.3,
  refraction: 1.0,
  chromAberration: 0.12,
  edgeHighlight: 0.1,
  specular: 0.2,
  fresnel: 1,
  zRadius: 40,
  saturation: 0.1,
  tintStrength: 0,
  brightness: -0.04,
  shadowOpacity: 0.25,
  shadowSpread: 10,
  shadowOffsetY: 2,
};
const BLUR_REF = 0.3; // the blur texture is made at this blurAmount; each surface mixes toward it
const PAD = 30; // room for the shadow, CSS px
import { useTheme } from "@/lib/theme";

const VS_QUAD = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FS_BLIT = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
void main() { gl_FragColor = texture2D(u_tex, v_uv); }`;

const FS_BLUR = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
varying vec2 v_uv;
void main() {
  vec4 s  = texture2D(u_tex, v_uv) * 0.227027;
  s += texture2D(u_tex, v_uv + u_dir) * 0.194594;
  s += texture2D(u_tex, v_uv - u_dir) * 0.194594;
  s += texture2D(u_tex, v_uv + u_dir * 2.0) * 0.121622;
  s += texture2D(u_tex, v_uv - u_dir * 2.0) * 0.121622;
  s += texture2D(u_tex, v_uv + u_dir * 3.0) * 0.054054;
  s += texture2D(u_tex, v_uv - u_dir * 3.0) * 0.054054;
  s += texture2D(u_tex, v_uv + u_dir * 4.0) * 0.016216;
  s += texture2D(u_tex, v_uv - u_dir * 4.0) * 0.016216;
  gl_FragColor = s;
}`;

const VS_GLASS = `
attribute vec2 a_pos;
uniform vec2 u_center;
uniform vec2 u_size;
uniform vec2 u_res;
uniform float u_pad;
varying vec2 v_localPx;
varying vec2 v_screenUV;
void main() {
  vec2 total = u_size + vec2(u_pad * 2.0);
  v_localPx = a_pos * 0.5 * total;
  vec2 px = u_center + a_pos * 0.5 * total;
  v_screenUV = vec2(px.x / u_res.x, 1.0 - px.y / u_res.y);
  vec2 ndc = (px / u_res) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FS_GLASS = `
precision highp float;
uniform sampler2D u_bgTex;
uniform sampler2D u_blurTex;
uniform vec2 u_size;
uniform float u_radius;
uniform vec2 u_res;
uniform float u_refract;
uniform float u_chroma;
uniform float u_edgeHL;
uniform float u_spec;
uniform float u_fresnel;
uniform float u_frost;
uniform float u_alpha;
uniform float u_sat;
uniform float u_tint;
uniform float u_zRadius;
uniform float u_brightness;
uniform float u_shadowAlpha;
uniform float u_shadowSpread;
uniform float u_shadowOffY;
varying vec2 v_localPx;
varying vec2 v_screenUV;

float rrSDF(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}
float bevelHeight(float d, float zR) {
  if (d <= 0.0) return 0.0;
  if (d >= zR) return zR;
  return sqrt(d * (2.0 * zR - d));
}

void main() {
  vec2 half_ = u_size * 0.5;
  float r = min(u_radius, min(half_.x, half_.y));
  float sdf = rrSDF(v_localPx, half_, r);

  if (sdf > 0.0) {
    float sdfShadow = rrSDF(v_localPx - vec2(0.0, u_shadowOffY), half_, r);
    float d = max(sdfShadow - 1.0, 0.0);
    float spread = max(u_shadowSpread, 1.0);
    float outerShadow = exp(-d * d / (spread * spread)) * 0.65;
    float contactShadow = exp(-d * 0.08 / max(spread * 0.04, 0.01)) * 0.35;
    gl_FragColor = vec4(0.0, 0.0, 0.0, (outerShadow + contactShadow) * u_shadowAlpha);
    return;
  }

  float mask = 1.0 - smoothstep(-1.5, 0.5, sdf);
  float maxD = min(half_.x, half_.y);
  float inside = -sdf;
  float edge = smoothstep(maxD * 0.35, 0.0, inside);

  float zR = u_zRadius;
  float e = 2.0;
  float hC = bevelHeight(inside, zR);
  float hR = bevelHeight(-rrSDF(v_localPx + vec2(e, 0.0), half_, r), zR);
  float hL = bevelHeight(-rrSDF(v_localPx - vec2(e, 0.0), half_, r), zR);
  float hU = bevelHeight(-rrSDF(v_localPx + vec2(0.0, e), half_, r), zR);
  float hD = bevelHeight(-rrSDF(v_localPx - vec2(0.0, e), half_, r), zR);
  vec2 hGrad = vec2(hR - hL, hU - hD) / (2.0 * e);
  vec3 N = normalize(vec3(-hGrad, 1.0));
  float depth = smoothstep(0.0, zR, inside);

  // two-surface (biconvex) refraction
  vec2 pxToUV = vec2(1.0, -1.0) / u_res;
  float refrPow = 1.0 - 1.0 / 1.5;
  float thickNorm = (hC * 2.0) / max(zR * 2.0, 1.0);
  vec2 surf = hGrad * refrPow;
  vec2 refrPx = (surf * 2.0 + surf * thickNorm * 0.5) * u_refract * 30.0;
  refrPx += (-v_localPx / max(half_, vec2(1.0))) * u_refract * 4.0 * depth;
  vec2 base = v_screenUV + refrPx * pxToUV;

  // colour fringing at the rim
  vec2 caD = N.xy * (u_chroma * 18.0 * (edge * 0.7 + 0.3) * 2.0) * pxToUV;
  vec3 sharp = vec3(texture2D(u_bgTex, base + caD).r, texture2D(u_bgTex, base).g, texture2D(u_bgTex, base - caD).b);
  vec3 blur = vec3(texture2D(u_blurTex, base + caD).r, texture2D(u_blurTex, base).g, texture2D(u_blurTex, base - caD).b);
  vec3 col = mix(sharp, blur, (1.0 - edge * 0.15) * u_frost);

  col *= 1.0 + u_brightness;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.0 + u_sat);
  col = mix(col, col * vec3(0.92, 0.95, 1.05), u_tint);
  col *= 1.0 + 0.06 * depth;

  float fres = pow(1.0 - abs(N.z), 4.0) * u_fresnel;
  vec3 V = vec3(0.0, 0.0, 1.0);
  float sp1 = pow(max(dot(N, normalize(normalize(vec3(0.4, 0.7, 1.0)) + V)), 0.0), 90.0);
  float sp2 = pow(max(dot(N, normalize(normalize(vec3(-0.3, -0.5, 1.0)) + V)), 0.0), 50.0) * 0.3;
  float spB = pow(max(dot(N, normalize(vec3(0.1, 0.3, 1.0))), 0.0), 6.0) * 0.1;
  float sp4 = pow(max(dot(N, normalize(normalize(vec3(0.0, 0.9, 0.4)) + V)), 0.0), 120.0) * 0.6;
  float totalSpec = (sp1 + sp2 + spB + sp4) * u_spec;

  float innerStroke = smoothstep(-2.5, -1.5, sdf) * (1.0 - smoothstep(-1.0, 0.0, sdf));
  innerStroke *= 0.4 + 0.6 * (0.5 + 0.5 * (-v_localPx.y / half_.y));
  float rim = edge * u_edgeHL * 0.22;
  float innerGlow = smoothstep(5.0, 0.0, -sdf) * u_edgeHL * 0.15;
  float envRefl = (N.y * 0.5 + 0.5) * fres * 0.08;

  vec3 fin = col + vec3(totalSpec) + vec3(rim + innerGlow) + vec3(innerStroke * u_edgeHL * 0.55) + vec3(envRefl);
  fin = mix(fin, vec3(1.0), fres * 0.2);
  gl_FragColor = vec4(fin, mask * u_alpha);
}`;

type Prog = { p: WebGLProgram; u: (n: string) => WebGLUniformLocation | null };

function program(gl: WebGLRenderingContext, vs: string, fs: string): Prog {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
  const cache = new Map<string, WebGLUniformLocation | null>();
  return { p, u: (n) => (cache.has(n) ? cache.get(n)! : (cache.set(n, gl.getUniformLocation(p, n)), cache.get(n)!)) };
}

function target(gl: WebGLRenderingContext, w: number, h: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
    [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
  ])
    gl.texParameteri(gl.TEXTURE_2D, k, v);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

/** Every scrolling or clipping box the element sits inside: the lens is cut to these, like the element itself. */
function clipsOf(el: HTMLElement) {
  const out: HTMLElement[] = [];
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX !== "visible" || s.overflowY !== "visible") out.push(p);
  }
  return out;
}

export default function LensStage({ src }: { src: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dark = useTheme() === "dark";

  useEffect(() => {
    const cv = ref.current!;
    const gl = cv.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    if (!gl) return;
    let blit: Prog, blurP: Prog, lens: Prog;
    try {
      blit = program(gl, VS_QUAD, FS_BLIT);
      blurP = program(gl, VS_QUAD, FS_BLUR);
      lens = program(gl, VS_GLASS, FS_GLASS);
    } catch {
      return;
    }
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const sky = gl.createTexture()!;
    let img: HTMLImageElement | null = null;
    let blurA: ReturnType<typeof target> | null = null;
    let blurB: ReturnType<typeof target> | null = null;
    let W = 0, H = 0, dpr = 1;
    let dirty = true;
    let last = "";
    let clipCache = new Map<number, HTMLElement[]>();

    // the sky, cover-fitted to the screen exactly like the CSS sky underneath, then a blurred copy for the frost
    const prepare = () => {
      if (!img) return;
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth;
      H = innerHeight;
      if (cv.width !== Math.round(W * dpr)) cv.width = Math.round(W * dpr);
      if (cv.height !== Math.round(H * dpr)) cv.height = Math.round(H * dpr);
      const c2 = document.createElement("canvas");
      const sw = Math.min(2400, Math.round(W * dpr));
      c2.width = sw;
      c2.height = Math.round((sw * H) / W);
      const x = c2.getContext("2d")!;
      const k = Math.max(c2.width / img.naturalWidth, c2.height / img.naturalHeight);
      const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
      // match the CSS sky's slow drift at its midpoint (scale 1.07 around 60% / 40%) so the lenses line up with it
      const ox = c2.width * 0.6, oy = c2.height * 0.4;
      x.translate(ox, oy);
      x.scale(1.07, 1.07);
      x.translate(-ox, -oy);
      x.drawImage(img, (c2.width - iw) / 2, (c2.height - ih) / 2, iw, ih);
      // the live page, where it sits on screen, so the glass over it shows the page itself
      const L = lensLayer();
      if (L && L.img.isConnected && L.img.complete && L.img.naturalWidth) {
        x.setTransform(1, 0, 0, 1, 0, 0);
        const k2 = c2.width / W;
        const box = (L.img.parentElement ?? L.img).getBoundingClientRect();
        const r = L.img.getBoundingClientRect();
        x.save();
        x.beginPath();
        x.roundRect(box.left * k2, box.top * k2, box.width * k2, box.height * k2, L.radius * k2);
        x.clip();
        x.fillStyle = L.bg;
        x.fillRect(box.left * k2, box.top * k2, box.width * k2, box.height * k2);
        x.drawImage(L.img, r.left * k2, r.top * k2, r.width * k2, r.height * k2);
        x.restore();
      }
      gl.bindTexture(gl.TEXTURE_2D, sky);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c2);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const bw = Math.max(64, Math.round(c2.width / 2)), bh = Math.max(64, Math.round(c2.height / 2));
      // reuse the blur targets while the size stays the same (the live page rebuilds this a few times a second)
      if (!blurA || !blurB || blurA.w !== bw || blurA.h !== bh) {
        for (const t of [blurA, blurB]) if (t) (gl.deleteTexture(t.tex), gl.deleteFramebuffer(t.fb));
        blurA = target(gl, bw, bh);
        blurB = target(gl, bw, bh);
      }
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(blit.p);
      gl.uniform1i(blit.u("u_tex"), 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, blurA.fb);
      gl.bindTexture(gl.TEXTURE_2D, sky);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.useProgram(blurP.p);
      gl.uniform1i(blurP.u("u_tex"), 0);
      // same as LiquidGlass: 6 passes, spread = blurAmount * 2.5 device px (half of that at half resolution)
      const spread = (BLUR_REF * 2.5 * (bw / c2.width)) * (cv.width / c2.width);
      for (let i = 0; i < 6; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, blurB.fb);
        gl.bindTexture(gl.TEXTURE_2D, blurA.tex);
        gl.uniform2f(blurP.u("u_dir"), spread / bw, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, blurA.fb);
        gl.bindTexture(gl.TEXTURE_2D, blurB.tex);
        gl.uniform2f(blurP.u("u_dir"), 0, spread / bh);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      dirty = true;
    };

    const load = new Image();
    load.decoding = "async";
    load.onload = () => {
      img = load;
      prepare();
      glass.setStage(true);
    };
    load.src = src;

    const draw = (list: { e: GlassEntry; r: DOMRect; clip: DOMRect | null }[]) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
      // the sky itself is the CSS layer underneath (it drifts slowly); this canvas only draws the lenses
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(lens.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sky);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, blurA!.tex);
      const u = lens.u;
      const D = dpr;
      gl.uniform1i(u("u_bgTex"), 0);
      gl.uniform1i(u("u_blurTex"), 1);
      gl.uniform2f(u("u_res"), cv.width, cv.height);
      gl.uniform1f(u("u_alpha"), 1);
      for (const { e, r, clip } of list) {
        const c: LensConfig = { ...BASE, ...(dark ? { brightness: -0.1, specular: 0.12, edgeHighlight: 0.06, fresnel: 0.6, shadowOpacity: 0.35 } : {}), ...e.lens };
        const zR = Math.min(c.zRadius, r.height / 2, r.width / 2);
        gl.uniform2f(u("u_center"), (r.left + r.width / 2) * D, (r.top + r.height / 2) * D);
        gl.uniform2f(u("u_size"), r.width * D, r.height * D);
        gl.uniform1f(u("u_pad"), PAD * D);
        gl.uniform1f(u("u_radius"), e.radius * D);
        gl.uniform1f(u("u_zRadius"), zR * D);
        gl.uniform1f(u("u_refract"), c.refraction);
        gl.uniform1f(u("u_chroma"), c.chromAberration);
        gl.uniform1f(u("u_edgeHL"), c.edgeHighlight);
        gl.uniform1f(u("u_spec"), c.specular);
        gl.uniform1f(u("u_fresnel"), c.fresnel);
        gl.uniform1f(u("u_frost"), Math.min(1, c.blurAmount / BLUR_REF));
        gl.uniform1f(u("u_sat"), c.saturation);
        gl.uniform1f(u("u_tint"), c.tintStrength);
        gl.uniform1f(u("u_brightness"), c.brightness);
        gl.uniform1f(u("u_shadowAlpha"), c.shadowOpacity);
        gl.uniform1f(u("u_shadowSpread"), c.shadowSpread * D);
        gl.uniform1f(u("u_shadowOffY"), c.shadowOffsetY * D);
        if (clip) {
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(Math.floor(clip.left * D), Math.floor((H - clip.bottom) * D), Math.ceil(clip.width * D), Math.ceil(clip.height * D));
        } else gl.disable(gl.SCISSOR_TEST);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.activeTexture(gl.TEXTURE0);
    };

    // draw only when a glass surface moved, the screen changed, or the sky changed
    let raf = 0;
    const un = glass.subscribe(() => ((dirty = true), (clipCache = new Map())));
    // a new picture of the live page: rebuild the texture, at most a few times a second
    let layerTimer = 0;
    const unLayer = onLensLayer(() => {
      if (layerTimer) return;
      layerTimer = window.setTimeout(() => {
        layerTimer = 0;
        prepare();
      }, 220);
    });
    const resize = () => prepare();
    addEventListener("resize", resize);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!img || !blurA || document.hidden) return;
      const list: { e: GlassEntry; r: DOMRect; clip: DOMRect | null }[] = [];
      let sig = `${W}x${H}`;
      // parents first, so a lens inside another lens is drawn on top of it
      const all = glass.list().sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      for (const e of all) {
        const el = e.el as HTMLElement & { checkVisibility?: (o: object) => boolean };
        if (!el.isConnected) continue;
        if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.bottom < -40 || r.top > H + 40 || r.right < -40 || r.left > W + 40) continue;
        let cl = clipCache.get(e.id);
        if (!cl) clipCache.set(e.id, (cl = clipsOf(el)));
        let clip: DOMRect | null = null;
        for (const c of cl) {
          const b = c.getBoundingClientRect();
          const l = Math.max(clip?.left ?? -1e9, b.left), t = Math.max(clip?.top ?? -1e9, b.top);
          const rr = Math.min(clip?.right ?? 1e9, b.right), bb = Math.min(clip?.bottom ?? 1e9, b.bottom);
          clip = new DOMRect(l, t, Math.max(0, rr - l), Math.max(0, bb - t));
        }
        if (clip && (clip.width === 0 || clip.height === 0)) continue;
        list.push({ e, r, clip });
        sig += `|${e.id}:${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`;
        if (clip) sig += `/${clip.top.toFixed(0)},${clip.bottom.toFixed(0)}`;
      }
      if (!dirty && sig === last) return;
      dirty = false;
      last = sig;
      draw(list);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      un();
      unLayer();
      clearTimeout(layerTimer);
      glass.setStage(false);
      // free what this run made; the context itself is kept (React may run this effect again on the same canvas)
      for (const t of [sky, blurA?.tex, blurB?.tex]) if (t) gl.deleteTexture(t);
      for (const f of [blurA?.fb, blurB?.fb]) if (f) gl.deleteFramebuffer(f);
      for (const pr of [blit, blurP, lens]) gl.deleteProgram(pr.p);
      gl.deleteBuffer(quad);
    };
  }, [src, dark]);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden="true" />;
}
