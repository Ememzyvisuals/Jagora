"use client";

/* Jagora's presence: a round, soft cloud. Drawn live by the GPU from a small shader, so nothing heavy downloads.
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
void main(){
 vec2 q=uv; float r=length(q), ang=atan(q.y,q.x);
 vec2 dir=vec2(cos(ang),sin(ang));
 float slow=t*(.09+.6*amp+.14*think);
 float R=.56*(1.+.025*sin(t*.9)+.012*sin(t*2.3))*(1.+.26*amp);
 R+=(fbm(vec3(dir*2.7,slow))-.5)*(.1+.12*amp);          // lumpy, cloud-like outline
 R+=(fbm(vec3(dir*6.,slow*1.6))-.5)*(.025+.04*amp);
 float z=sqrt(max(R*R-r*r,0.));
 vec3 P=vec3(q,z)*2.4;
 float sp=.12+1.1*amp+.25*think;
 float d=fbm(P+vec3(t*sp*.5,-t*sp*.3,t*sp*.4));
 float bump=fbm(P*3.1+vec3(0.,0.,t*.03)+d);                // small puffs on the surface
 vec3 N=normalize(vec3(q,z+1e-3));
 float light=clamp(dot(N,normalize(vec3(-.5,.62,.6))),0.,1.);
 float shade=light*.62+d*.42+(bump-.5)*.42;
 vec3 low=vec3(.66,.71,.79), mid=vec3(.86,.89,.93), hi=vec3(.99,.995,1.);
 vec3 col=mix(low,mid,smoothstep(.18,.62,shade));
 col=mix(col,hi,smoothstep(.55,.98,shade)+amp*.1);
 float body=smoothstep(R,R-.13,r);
 float haze=exp(-max(r-R*.86,0.)*11.)*.28*(1.-body);
 float a=clamp(body*(.86+.14*d)+haze,0.,1.);
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
