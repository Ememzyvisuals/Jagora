"use client";

/* Jagora's presence: a soft cloud made of puffs (wider than tall, never a perfect ball). Drawn live by the GPU from a small shader, so nothing heavy downloads.
   Resting it is almost still, with a lumpy, cloud-like surface. With a voice it swells, its edge billows and the
   mist inside churns in time with the sound. */
import { useEffect, useRef, type MutableRefObject } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

const VS = `attribute vec2 p;varying vec2 uv;void main(){uv=p;gl_Position=vec4(p,0.,1.);}`;
const FS = `precision highp float;varying vec2 uv;uniform float t,amp,think;
float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int k=0;k<5;k++){v+=a*n(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return v;}
// one puff of the cloud: a soft ball that breathes on its own rhythm and swells with the voice
float puff(vec2 q,vec2 c,float r,float ph){
 float drift=.015+.03*think;
 c+=vec2(sin(t*.37+ph),cos(t*.29+ph*1.7))*drift;
 r*=1.+.045*sin(t*.8+ph*2.1)+amp*(.16+.12*sin(t*7.+ph*3.));
 vec2 d=(q-c)/r;return exp(-dot(d,d)*2.3);}
// the cloud: several puffs, wider than tall, rounder on top, flatter underneath (not a ball)
float field(vec2 q){
 // a row of puffs along the bottom and three rounded bumps on top: a small cumulus
 float f=puff(q,vec2(-.42,-.13),.25,0.)+puff(q,vec2(-.14,-.11),.29,1.3)+puff(q,vec2(.16,-.11),.29,2.6)+puff(q,vec2(.44,-.13),.24,3.9)
  +puff(q,vec2(-.25,.1),.26,5.2)+puff(q,vec2(.05,.19),.31,6.5)+puff(q,vec2(.31,.09),.24,7.8);
 f*=smoothstep(-.5,-.28,q.y);   // soft but flat underneath
 return f;}
void main(){
 vec2 q=uv*1.08;
 float slow=t*(.07+.5*amp+.12*think);
 float wisp=(fbm(vec3(q*3.,slow))-.5)*(.1+.16*amp)+(fbm(vec3(q*9.,slow*1.7))-.5)*(.04+.05*amp);
 float F=field(q)+wisp;
 float e=.012;
 vec2 g=vec2(field(q+vec2(e,0.))-field(q-vec2(e,0.)),field(q+vec2(0.,e))-field(q-vec2(0.,e)))/(2.*e);
 float thr=.46;
 float hgt=clamp((F-thr)*1.4,0.,1.);
 vec3 N=normalize(vec3(-g*.22,.35+hgt));
 float light=clamp(dot(N,normalize(vec3(-.45,.6,.65))),0.,1.);
 float sp=.1+.9*amp+.2*think;
 float d=fbm(vec3(q*2.6,0.)+vec3(t*sp*.5,-t*sp*.3,t*sp*.4));
 float bump=fbm(vec3(q*7.,t*.04)+d);
 float shade=light*.66+d*.36+(bump-.5)*.38+hgt*.12;
 vec3 low=vec3(.64,.70,.79), mid=vec3(.86,.89,.93), hi=vec3(.99,.995,1.);
 vec3 col=mix(low,mid,smoothstep(.2,.62,shade));
 col=mix(col,hi,smoothstep(.55,.98,shade)+amp*.1);
 float body=smoothstep(thr-.18,thr+.16,F);
 float haze=smoothstep(thr-.4,thr-.08,F)*.26*(1.-body);
 float a=clamp(body*(.84+.16*d)+haze,0.,1.);
 gl_FragColor=vec4(col*a,a);
}`;

export function Orb({
  size = 120,
  state = "idle",
  levelRef,
  className = "",
}: {
  size?: number;
  state?: OrbState;
  levelRef?: MutableRefObject<number>;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

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
    const uT = gl.getUniformLocation(pr, "t"), uA = gl.getUniformLocation(pr, "amp"), uK = gl.getUniformLocation(pr, "think");

    let amp = 0, think = 0, raf = 0, visible = true, t0 = performance.now();
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const st = stateRef.current;
      const voice = levelRef ? Math.min(1, Math.max(0, levelRef.current)) : 0;
      const target = st === "listening" || st === "speaking" ? voice : 0;
      amp += (target - amp) * (target > amp ? 0.25 : 0.06);
      think += ((st === "thinking" ? 1 : 0) - think) * 0.04;
      const t = (now - t0) / 1000;
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uT, t);
      gl.uniform1f(uA, amp);
      gl.uniform1f(uK, think);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      t0 = 0;
    };
  }, [size, levelRef]);

  return (
    <canvas
      ref={canvas}
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label={state === "listening" ? "Jagora is listening" : state === "speaking" ? "Jagora is speaking" : "Jagora"}
    />
  );
}
