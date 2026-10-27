"use client";

/* Jagora's presence: a soap-bubble glass orb. Clear glass with a soft blue glow around it, a thin rainbow shimmer
   on the rim and pastel mist slowly swirling inside. The edge wobbles gently like jelly, so it is never a hard circle.
   No face: everything it feels shows in how it moves and in its colour.
     resting    breathes slowly, the mist drifts
     listening  leans in (grows a little) and the rim brightens with her voice
     thinking   the colours inside swirl faster
     speaking   pulses and wobbles with Jagora's voice
     needs you  a warm tint comes in (Jagora is waiting for her answer)
     done       a quick bright shimmer runs across the rim
   Drawn live by the GPU from one small shader, so nothing heavy downloads. */
import { useEffect, useRef, type MutableRefObject } from "react";
import { useApp } from "@/lib/store";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

const VS = `attribute vec2 p;varying vec2 uv;void main(){uv=p;gl_Position=vec4(p,0.,1.);}`;
const FS = `precision highp float;varying vec2 uv;uniform float t,amp,think,listen,warm,shine;
float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int k=0;k<4;k++){v+=a*n(p);p=p*2.02+vec3(1.7,9.2,3.1);a*=.5;}return v;}
vec3 rainbow(float x){return .5+.5*cos(6.2832*(x+vec3(0.,.33,.67)));}
void main(){
 vec2 q=uv;
 float ang=atan(q.y,q.x), r=length(q);
 // the jelly edge: slow, soft wobble always; with a voice it trembles faster and more
 float wob=.011*sin(3.*ang+t*1.1)+.008*sin(5.*ang-t*.83)+.007*sin(2.*ang+t*.57)
          +amp*(.04*sin(4.*ang+t*7.)+.026*sin(6.*ang-t*9.3))+think*.008*sin(3.*ang-t*2.);
 float R=.66*(1.+.018*sin(t*1.3)+.07*listen+.09*amp)*(1.+wob);
 float d=r/R;
 // glow around the bubble
 float glow=exp(-max(d-1.,0.)*7.)*(1.-smoothstep(.97,1.,d)*0.)*.42*(1.+.6*amp+.4*listen);
 vec3 glowC=mix(vec3(.42,.64,1.),vec3(1.,.72,.45),warm);
 float inside=1.-smoothstep(.985,1.005,d);
 float z=sqrt(max(1.-d*d,0.));
 // the mist inside: pastel colours, slowly swirling (faster while thinking or speaking)
 float sp=.08+.35*think+.5*amp;
 vec2 w=q*1.6;
 float a1=fbm(vec3(w,t*sp));
 vec2 warp=w+vec2(cos(a1*6.28+t*sp*2.),sin(a1*6.28-t*sp*1.6))*.45;
 float m1=fbm(vec3(warp*1.2,t*sp*.7+3.));
 float m2=fbm(vec3(warp*1.7+5.,t*sp*.9));
 vec3 cyan=vec3(.55,.86,1.), mint=vec3(.72,.98,.9), pink=vec3(1.,.76,.92), lilac=vec3(.76,.74,1.);
 vec3 mist=mix(mix(cyan,mint,smoothstep(.35,.7,m1)),mix(pink,lilac,smoothstep(.3,.7,m2)),smoothstep(.4,.62,m2*.9+m1*.3));
 mist=mix(mist,vec3(1.,.82,.62),warm*.55);
 float mistA=(.38+.22*smoothstep(.3,.75,m1))*(.55+.45*z);
 // thin-film rainbow on the rim, like a soap bubble
 float rim=smoothstep(.72,1.,d)*inside;
 float film=fbm(vec3(q*2.4,t*.15))*1.4+ang*.16+d*1.8+t*.05;
 vec3 iri=rainbow(film);
 float rimLine=exp(-pow((1.-d)*22.,2.))*inside;           // the bright edge itself
 float shimmer=shine*exp(-pow((ang-(-2.6+shine*-5.))*1.6,2.));
 vec3 edge=mix(vec3(.55,.75,1.),iri,.55)*(1.+.8*listen+.6*amp+shimmer*2.);
 // a soft highlight on the top left, like light on glass
 float spec=exp(-pow(length(q-vec2(-.26,.3)*R/.66)*4.2,2.))*.55;
 vec3 col=mist*mistA;
 float alpha=mistA;
 col+=edge*rim*.55; alpha+=rim*.35;
 col+=vec3(.82,.9,1.)*rimLine*.45+edge*rimLine*.45; alpha+=rimLine*.42;
 col+=vec3(1.)*spec*inside; alpha+=spec*.6*inside;
 col*=inside; alpha*=inside;
 float g=glow*(1.-inside*.7);
 col+=glowC*g; alpha+=g;
 alpha=clamp(alpha,0.,1.);
 gl_FragColor=vec4(min(col,vec3(1.)),alpha);
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
  // waiting for her (a question, a yes, a private box): the warm tint
  const needs = useApp((s) => {
    const task = s.tasks.find((x) => x.id === s.activeId);
    const m = task?.messages.at(-1);
    return !!m && (((m.kind === "confirm" || m.kind === "handoff" || m.kind === "secret") && m.status === "waiting") || (m.kind === "choice" && !m.picked));
  });
  const needsRef = useRef(needs);
  needsRef.current = needs;

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
    const u = (n: string) => gl.getUniformLocation(pr, n);
    const uT = u("t"), uA = u("amp"), uK = u("think"), uL = u("listen"), uW = u("warm"), uS = u("shine");

    let amp = 0, think = 0, listen = 0, warm = 0, shine = 0, shineAt = -10, raf = 0, visible = true;
    const t0 = performance.now();
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(cv);
    // a task finished: one bright shimmer across the rim
    const done = () => (shineAt = performance.now());
    addEventListener("jagora:done", done);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const st = stateRef.current;
      const voice = levelRef ? Math.min(1, Math.max(0, levelRef.current)) : 0;
      const target = st === "listening" || st === "speaking" ? voice : 0;
      amp += (target - amp) * (target > amp ? 0.25 : 0.07);
      think += ((st === "thinking" ? 1 : 0) - think) * 0.04;
      listen += ((st === "listening" ? 1 : 0) - listen) * 0.06;
      warm += ((needsRef.current && st !== "speaking" ? 1 : 0) - warm) * 0.03;
      const since = (now - shineAt) / 900;
      shine = since >= 0 && since <= 1 ? since : 0;
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.uniform1f(uA, amp);
      gl.uniform1f(uK, think);
      gl.uniform1f(uL, listen);
      gl.uniform1f(uW, warm);
      gl.uniform1f(uS, shine);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      removeEventListener("jagora:done", done);
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
