/* Shaders from AI-Orb by Nick Vyhouski (https://github.com/weeeha/AI-Orb), MIT License:
   Copyright (c) 2026 Nick Vyhouski. Permission is hereby granted, free of charge, to any person obtaining a copy of
   this software and associated documentation files (the "Software"), to deal in the Software without restriction,
   including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, subject to the following conditions: the above copyright notice and this permission notice
   shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT
   WARRANTY OF ANY KIND. One fragment program renders every finish (ink, pearl, vessel, aurora, plasma). */
export const ORB_VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const ORB_FS = `
precision highp float;

varying vec2 vUv;

uniform float uTime;    // wall clock, for grain
uniform float uFlow;    // accumulated interior time, accelerated by output level
uniform float uRing;    // accumulated ring phase, advanced by input level
uniform int   uFinish;  // 0 ink · 1 pearl · 2 vessel · 3 aurora · 4 plasma
uniform int   uState;   // 0 idle · 1 listening · 2 thinking · 3 speaking
uniform float uDark;    // 0 light field, 1 dark field
uniform float uIn;      // 0-1 microphone level
uniform float uOut;     // 0-1 agent speech level
uniform float uGrain;
uniform float uSeed;
uniform float uDetail;  // 0 at avatar sizes, 1 at hero sizes
uniform vec3  uC1;
uniform vec3  uC2;
uniform vec3  uC3;
uniform vec3  uBody;
uniform vec2  uPointer;
uniform float uPtr;

const float PI  = 3.141592653589793;
const float TAU = 6.283185307179586;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8776, 0.4794, -0.4794, 0.8776);
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p = rot * p * 2.02 + vec2(37.1, 11.7);
    a *= 0.5;
  }
  return v;
}

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  return t < 0.5 ? mix(uC1, uC2, t * 2.0) : mix(uC2, uC3, (t - 0.5) * 2.0);
}

void main() {
  // Output swells the orb, input contracts it very slightly. Budget is ±2% (P2).
  float grow = 1.0 + 0.020 * uOut - 0.008 * uIn;
  vec2 p = (vUv - 0.5) * 2.0 / grow;
  float r = length(p);

  float seed = uSeed * 13.77;
  float fl = uFlow + seed;

  float bulge = sqrt(max(1.0 - min(dot(p, p), 1.0), 0.0));
  vec3 n = vec3(p, bulge);

  // sp stays in orb space. The seed offsets only where noise is sampled --
  // adding it to sp itself would slide the band clean off finishes that place
  // features relative to the centre, which reads as a blank orb.
  vec2 sp = p / (bulge * 0.55 + 1.0);
  vec2 sv = vec2(seed, seed * 0.73);

  float warp = 1.0 + 1.15 * uOut;
  vec3 col = vec3(0.0);
  float alpha = 1.0 - smoothstep(0.982, 1.0, r);

  // ---- INK: one pigmented medium, domain-warped -----------------------------
  if (uFinish == 0) {
    vec2 q = vec2(fbm(sp * 1.9 + sv + fl * 0.05), fbm(sp * 1.9 + sv + vec2(5.2, 1.3) - fl * 0.04));
    vec2 w = vec2(
      fbm(sp * 1.9 + sv + q * (2.1 * warp) + vec2(1.7, 9.2) + fl * 0.034),
      fbm(sp * 1.9 + sv + q * (2.1 * warp) + vec2(8.3, 2.8) - fl * 0.027)
    );
    float f = fbm(sp * 2.2 + sv + w * (1.6 * warp));
    col = ramp(f * 1.5 - 0.18);
    col *= 0.72 + 0.5 * bulge;
    col += pow(1.0 - bulge, 3.5) * 0.1;
    col *= 1.0 + 0.22 * uOut;
  }

  // ---- PEARL: opaque pale body, colour in an equatorial band ----------------
  else if (uFinish == 1) {
    float wob = fbm(sp * 1.5 + sv + fl * 0.07);
    float wave = 0.17 * sin(sp.x * 1.9 + fl * 0.36) + 0.14 * (wob - 0.5);
    float width = 0.40 + 0.16 * uOut;
    float band = smoothstep(width, 0.02, abs(sp.y - wave));

    col = mix(uBody, ramp(sp.x * 0.5 + 0.5 + 0.12 * (wob - 0.5)), band * (0.80 + 0.16 * uOut));

    float striate = 0.5 + 0.5 * sin(sp.x * 40.0 + wob * 11.0 + fl * 0.24);
    col *= 1.0 - 0.045 * striate * band * uDetail;
    col *= 0.80 + 0.34 * bulge;

    vec3 L = normalize(vec3(-0.42, 0.58, 0.70));
    col += vec3(1.0) * pow(max(dot(normalize(n), L), 0.0), 34.0) * 0.85;  // the one peak (P5)
    col += vec3(0.9, 0.93, 1.0) * pow(1.0 - bulge, 6.0) * 0.28;
  }

  // ---- VESSEL: fixed shell, contents that drift and merge -------------------
  else if (uFinish == 2) {
    vec3 acc = vec3(0.0);
    float field = 0.0;
    // Contents pressed against the glass read as attention; drawn to the centre
    // they read as idle. Output drives that ratio, which is the whole signal.
    float spread = 0.26 + 0.16 * uOut + 0.04 * sin(fl * 0.3);
    float mass = 0.150 + 0.055 * uOut;

    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float orbit = spread + 0.05 * sin(fl * 0.37 + fi * 1.7);
      vec2 c = vec2(cos(fl * 0.42 + fi * 2.094), sin(fl * 0.35 + fi * 2.094)) * orbit;
      float w = mass / (dot(p - c, p - c) + 0.034);
      vec3 lc = fi < 0.5 ? uC1 : (fi < 1.5 ? uC2 : uC3);
      field += w;
      acc += w * lc;
    }

    vec3 inner = acc / max(field, 0.0001);
    float body = smoothstep(0.80, 2.10, field);
    col = mix(uBody, inner, body * 0.96);

    float rim = smoothstep(0.72, 0.99, r) * smoothstep(1.0, 0.88, r);
    col += mix(vec3(0.55, 0.76, 0.94), vec3(0.52, 0.84, 1.0), uDark) * rim * (0.26 + 0.38 * uDark);
    col += vec3(1.0) * pow(1.0 - bulge, 8.0) * 0.14;

    vec3 L2 = normalize(vec3(-0.40, 0.60, 0.69));
    col += vec3(1.0) * pow(max(dot(normalize(n), L2), 0.0), 46.0) * 0.45;
  }

  // ---- AURORA: transparent body, emissive band, rim light -------------------
  else if (uFinish == 3) {
    float wob = fbm(sp * 1.35 + sv - fl * 0.055);
    float wave = 0.16 * sin(sp.x * 1.7 - fl * 0.29) + 0.16 * (wob - 0.5);
    float width = 0.46 + 0.18 * uOut;
    float band = pow(smoothstep(width, 0.0, abs(sp.y - wave - 0.06)), 1.35);

    col = uBody;
    col += ramp(sp.x * 0.45 + 0.5 + 0.2 * (wob - 0.5)) * band * (1.02 + 0.45 * uOut);

    float rim = smoothstep(0.80, 0.995, r) * smoothstep(1.0, 0.94, r);
    col += mix(uC3, vec3(0.55, 0.76, 0.98), 0.5) * rim * 0.85;
    col += uC1 * pow(1.0 - bulge, 5.0) * 0.16;
  }

  // ---- PLASMA: filaments from a core to the glass ---------------------------
  else {
    float a = atan(p.y, p.x);
    float haze = pow(max(1.0 - r, 0.0), 1.35);
    col = mix(uBody, uC1, haze * 0.92);
    col *= 0.50 + 0.72 * bulge;

    float pAng = atan(uPointer.y, uPointer.x);
    float bolts = 0.0;
    float contact = 0.0;

    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float s = fi * 17.31 + 3.7 + seed;
      float phase = fi * (TAU / 9.0) + (fbm(vec2(s, fl * 0.09)) - 0.5) * 2.6;

      // A real globe bends its filaments toward whatever touches the glass.
      float pull = uPtr * (0.42 + 0.46 * fract(fi * 0.37));
      float dd = mod(pAng - phase + PI, TAU) - PI;
      phase += dd * pull;

      float slow = (fbm(vec2(s * 0.61 + r * 1.35, fl * 0.40)) - 0.5) * 1.55;
      float fine = (fbm(vec2(s * 1.9 + r * 3.1, fl * 0.62)) - 0.5) * 0.42;
      float wander = (slow + fine) * pow(r, 1.15) * (1.0 - 0.42 * uPtr);

      float d = mod(a - phase - wander + PI, TAU) - PI;
      float arc = abs(d) * max(r, 0.05);
      float width = (0.007 + 0.020 * r) * mix(2.1, 1.0, uDetail);
      float line = smoothstep(width, 0.0, arc);
      float halo = smoothstep(width * 4.5, 0.0, arc) * 0.30;

      // Input makes the filaments reach further out (P10: input owns the boundary).
      float span = 0.80 + 0.20 * fract(s * 0.113) + 0.20 * uIn;
      line *= smoothstep(0.10, 0.28, r) * smoothstep(span + 0.22, span - 0.12, r);
      halo *= smoothstep(0.10, 0.34, r) * smoothstep(span + 0.24, span - 0.14, r);

      float flick = 0.35 + 0.65 * fbm(vec2(s, fl * 2.6));
      line *= flick;
      halo *= flick;

      bolts += line + halo;
      contact += line * smoothstep(span - 0.26, span + 0.04, r);
    }

    bolts = clamp(bolts * (1.0 + 1.05 * uOut), 0.0, 1.8);
    contact = clamp(contact, 0.0, 1.5);

    col += uC3 * bolts * (0.82 + 0.38 * uOut);
    col += mix(uC2, uC3, 0.4) * contact * (0.50 + 2.4 * uIn);

    float coreR = 0.13 + 0.040 * uOut;
    float core = smoothstep(coreR, 0.0, r);
    col += uC2 * pow(smoothstep(0.34, 0.0, r), 2.0) * (0.55 + 0.35 * uOut);
    col += mix(uC2, vec3(1.0, 0.97, 1.0), core) * core * 1.30;

    float grim = smoothstep(0.84, 0.995, r) * smoothstep(1.0, 0.92, r);
    col += mix(uC1, uC2, 0.5) * grim * (0.55 + 0.9 * uIn);
  }

  // ---- Thinking: an orbiting sweep, distinct in form from either voice (P8) --
  if (uState == 2) {
    float ang = atan(p.y, p.x);
    float sweep = 0.5 + 0.5 * cos(ang - fl * 1.5);
    col += mix(uC2, uC3, 0.5) * pow(sweep, 7.0) * 0.40 * smoothstep(0.05, 0.85, r);
  }

  // ---- Input lives on the boundary, never in the body (P10) -----------------
  if (uIn > 0.004 && uFinish != 4) {
    float pd = fract(r * 1.35 - uRing);
    float pulse = smoothstep(0.0, 0.30, pd) - smoothstep(0.30, 0.62, pd);
    vec3 pc = mix(uC3, vec3(0.42, 0.92, 0.99), 0.35 + 0.3 * uDark);
    col += pc * pulse * uIn * 1.15 * smoothstep(0.10, 0.95, r);
    float rim2 = smoothstep(0.74, 0.995, r) * smoothstep(1.0, 0.90, r);
    col += pc * rim2 * uIn * 1.5;
  }

  // ---- Grain: defeats banding and gives the eye something to resolve (P6) ---
  float g = hash21(vUv * 780.0 + fract(uTime) * 91.0);
  col *= 1.0 - uGrain * uDetail * (g - 0.5) * 2.0;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
}
`;

export const FINISH = { ink: 0, pearl: 1, vessel: 2, aurora: 3, plasma: 4 } as const;
export type Finish = keyof typeof FINISH;

/* Jagora's own soft cloud, with the texture and life of the glass reference: a lumpy outline that never stops
   moving, milky folds with glossy streaks, a fine edge line and a soft shadow low inside, and a cyan and royal-blue
   heart turning slowly inside the cloud with fine lines through it.
     listening  the edge ripples with her voice
     thinking   the heart turns faster and a light sweeps round
     speaking   the heart swirls and the cloud swells with Jagora's voice */
export const CLOUD_FS = `precision highp float;
varying vec2 vUv;
uniform float uTime, uFlow, uRing, uIn, uOut, uGrain, uDetail, uRes;
uniform int uState;
float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int k=0;k<5;k++){v+=a*n(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return v;}
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){
 vec2 q=(vUv-.5)*2.;
 float r=length(q), ang=atan(q.y,q.x);
 vec2 dir=vec2(cos(ang),sin(ang));
 float fl=uFlow;
 // the soft, lumpy cloud outline, always gently moving; voices ripple and swell it
 float R=.7*(1.+.02*sin(uTime*1.1)+.01*sin(uTime*2.7))*(1.+.06*uOut-.012*uIn);
 R+=(fbm(vec3(rot(fl*.04)*dir*2.4,fl*.2))-.5)*(.13+.08*uOut);
 R+=(fbm(vec3(dir*5.5,fl*.3))-.5)*(.03+.03*uOut);
 R+=uIn*.035*sin(ang*6.-uRing*6.2832);
 float rr=r/R;
 float z=sqrt(max(1.-rr*rr,0.));
 vec3 P=vec3(q/R,z)*2.2;
 // cloud body: soft puffs lit from the top left
 float d=fbm(P+vec3(fl*.07,-fl*.04,fl*.05));
 float bump=fbm(P*3.+vec3(0.,0.,fl*.03)+d);
 vec3 N=normalize(vec3(q/R,z+1e-3));
 float light=clamp(dot(N,normalize(vec3(-.5,.62,.6))),0.,1.);
 float shade=light*.6+d*.42+(bump-.5)*.4;
 vec3 col=mix(vec3(.72,.77,.88),vec3(.9,.92,.97),smoothstep(.18,.6,shade));
 col=mix(col,vec3(.995,.997,1.),smoothstep(.55,.95,shade));
 // glossy streaks in the milky body
 float streak=pow(.5+.5*sin(ang*3.+d*7.+fl*.35),7.)*smoothstep(.5,.9,rr);
 col=mix(col,vec3(1.),streak*.4);
 // the heart: cyan on one side, royal blue to deep indigo on the other, turning inside the cloud
 vec2 cq=q/R-vec2(.02,-.04);
 float spin=fl*(.32+(uState==2?.55:uState==4?.35:0.));
 vec2 cr=rot(spin)*cq;
 float sd=cr.y+.16*sin(cr.x*2.4+fl*.7)+(fbm(vec3(cr*1.8,fl*.22))-.5)*.2;
 float side=smoothstep(-.08,.08,sd);
 vec3 cyan=mix(vec3(.16,.84,.95),vec3(.5,.95,1.),smoothstep(.0,.55,sd));
 vec3 blue=mix(vec3(.08,.2,.88),vec3(.06,.04,.42),smoothstep(-.05,-.5,sd));
 vec3 heart=mix(blue,cyan,side);
 float hr=length(cq)*(1.+.08*sin(fl*.6))+(d-.5)*.25;
 float heartA=(1.-smoothstep(.34,.74,hr))*(.88+.12*uOut);
 // fine lines through the heart
 vec2 rp=rot(spin*.7)*cq;
 float lines=sin((rp.y+rp.x*rp.x*.45)*clamp(uRes*.3,40.,170.));
 heart+=mix(vec3(.55,.7,1.),vec3(.8,1.,1.),side)*smoothstep(.8,1.,lines)*(.08+.06*uOut);
 // the cloud's mist sits over the heart, thinner in the middle
 col=mix(col,heart,heartA*clamp(1.2-shade*.45,0.,1.));
 // thinking: a bright light sweeping round the cloud, and the heart breathing
 if(uState==2){float sw=.5+.5*cos(ang-fl*1.6);col+=vec3(.5,.88,1.)*pow(sw,7.)*.5*smoothstep(.5,.95,rr);
   col+=vec3(.35,.6,1.)*heartA*.12*(.5+.5*sin(uTime*3.2));}
 // working on the page: a band of light scanning down through the cloud, like reading a page
 if(uState==4){float y=q.y/R; float band=fract(uTime*.55); float by=1.-band*2.2+.1;
   float scan=exp(-pow((y-by)*7.,2.))*smoothstep(1.02,.9,rr);
   col=mix(col,vec3(.42,.78,1.),scan*.55);
   col+=vec3(.25,.55,1.)*pow(.5+.5*cos(ang*3.-uTime*2.4),12.)*.25*smoothstep(.6,.97,rr);}
 // listening: a soft cyan rim that breathes even before she speaks; her voice makes it glow more
 float listen=uState==1?.5+.18*sin(uTime*2.2):0.;
 col=mix(col,vec3(.5,.9,1.),smoothstep(.66,.98,rr)*clamp(uIn*.6+listen,0.,.9));
 // a soft shadow low inside, and the fine edge line
 float refl=exp(-pow(length((q/R-vec2(.02,-.8))*vec2(1.,3.))*3.,2.));
 col=mix(col,vec3(.5,.53,.66),refl*.35);
 float body=smoothstep(1.02,.9,rr);
 float edge=exp(-pow((1.-rr)*24.,2.))*smoothstep(1.05,.98,rr);
 col=mix(col,vec3(.55,.62,.86),edge*.35);
 float haze=exp(-max(rr-.9,0.)*9.)*.25*(1.-body);
 float a=clamp(body*(.9+.1*d)+haze,0.,1.);
 float g=hash21(vUv*780.+fract(uTime)*91.);
 col*=1.-uGrain*uDetail*(g-.5)*2.;
 gl_FragColor=vec4(clamp(col,0.,1.)*a,a);
}`;

/* Jagora glass, modelled frame by frame on the reference: an uneven glass blob that keeps moving, a thick milky shell
   with liquid folds, and inside a two-tone body (cyan on one side, royal blue to near black on the other) split by a
   soft wavy line that turns round and round, with fine ribbed lines through the colour. Jagora's voice speeds the
   turning and swells it; her voice ripples the outline; thinking turns it faster with a sweeping light. */
export const GLASS_FS = `precision highp float;
varying vec2 vUv;
uniform float uTime, uFlow, uRing, uIn, uOut, uGrain, uDetail, uRes;
uniform int uState;
float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float v=0.,a=.5;for(int k=0;k<4;k++){v+=a*n(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return v;}
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){
 vec2 q=(vUv-.5)*2.;
 float r=length(q), ang=atan(q.y,q.x);
 vec2 dir=vec2(cos(ang),sin(ang));
 float fl=uFlow;
 // the outline: uneven and always moving, like soft jelly
 float wob=(fbm(vec3(dir*1.1,fl*.22))-.5)*.16+.022*sin(3.*ang+fl*.9)+.014*sin(5.*ang-fl*1.1);
 wob+=uIn*.06*sin(ang*6.-uRing*6.2832)+uOut*.04*sin(ang*5.+fl*2.6);
 float R=.84*(1.+wob)*(1.+.03*uOut);
 float rr=r/R;
 float inside=1.-smoothstep(.988,1.004,rr);
 float z=sqrt(max(1.-rr*rr,0.));
 vec2 p=q/R;
 // the coloured body: a soft rounded square, a little below centre, melting into the shell
 vec2 cq=(p-vec2(.0,-.03))*(1.+.05*sin(fl*.5));
 vec2 ac=abs(cq);
 float sq=pow(pow(ac.x,3.)+pow(ac.y,3.),1./3.);
 float dcore=mix(length(cq),sq,.55)+(fbm(vec3(cq*2.2,fl*.18))-.5)*.12;
 float core=1.-smoothstep(.44,.8,dcore);
 // the two-tone body turning round: cyan on one side, blue to black on the other, a soft wavy line between
 float spin=fl*(.55+.6*(uState==2?1.:0.));
 vec2 cr=rot(spin)*cq;
 float s=cr.y+.17*sin(cr.x*2.3+fl*.8)+(fbm(vec3(cr*1.8,fl*.25))-.5)*.22;
 float side=smoothstep(-.07,.07,s);
 vec3 cyan=mix(vec3(.10,.86,.94),vec3(.45,.97,1.),smoothstep(.0,.6,s));
 float deep=smoothstep(.0,-.55,s)*smoothstep(.75,.1,length(cr-vec2(-.05,-.3)));
 vec3 blue=mix(vec3(.04,.12,.86),vec3(.03,.02,.30),smoothstep(-.05,-.45,s));
 blue=mix(blue,vec3(.01,.01,.04),deep*.9);
 vec3 cc=mix(blue,cyan,side);
 // fine ribbed lines through the colour, curving as the body turns
 vec2 rp=rot(spin*.7)*cq;
 float lines=sin((rp.y+rp.x*rp.x*.45)*clamp(uRes*.3,40.,170.));
 float ribs=smoothstep(.82,1.,lines)*core*(.07+.06*uOut);
 cc+=mix(vec3(.6,.75,1.),vec3(.8,1.,1.),side)*ribs;
 // the milky shell with liquid folds
 // folds follow the rim (like liquid inside a glass), with glossy streaks
 float fold=fbm(vec3(rot(fl*.05)*dir*1.7,rr*2.6+fl*.1));
 float streak=pow(.5+.5*sin(ang*3.+fold*6.+fl*.4),6.);
 vec3 shell=mix(vec3(.82,.85,.94),vec3(.985,.99,1.),smoothstep(.32,.62,fold));
 shell=mix(shell,vec3(1.),streak*.45*smoothstep(.55,.85,rr));
 shell=mix(shell,vec3(.62,.66,.82),smoothstep(.58,.9,rr)*smoothstep(.45,.25,fold)*.35);
 vec3 col=mix(shell,cc,core);
 // light on the glass
 vec3 N=normalize(vec3(p,z+.001));
 col+=vec3(1.)*pow(clamp(dot(N,normalize(vec3(-.45,.6,.65))),0.,1.),22.)*.22*(1.-core);
 // a soft shadow low inside
 float refl=exp(-pow(length((p-vec2(.02,-.82))*vec2(1.,3.2))*3.,2.));
 col=mix(col,vec3(.36,.38,.5),refl*.5*(1.-core));
 // the edge: a thin blue-grey line, cyan on top, lilac at the bottom left
 float rimB=smoothstep(.86,.99,rr)*inside;
 vec3 rimC=mix(vec3(.55,.92,1.),vec3(.66,.6,.95),smoothstep(.3,-.6,dir.y));
 col=mix(col,rimC,rimB*(.3+.3*uIn+.15*uOut));
 col=mix(col,vec3(.35,.38,.6),exp(-pow((1.-rr)*55.,2.))*.6*inside);
 // thinking: a light sweeping round
 if(uState==2){float sw=.5+.5*cos(ang-fl*1.6);col+=vec3(.5,.9,1.)*pow(sw,9.)*.22*smoothstep(.6,.98,rr)*inside;}
 float a=inside;
 float g=hash21(vUv*780.+fract(uTime)*91.);
 col*=1.-uGrain*uDetail*(g-.5)*2.;
 gl_FragColor=vec4(clamp(col,0.,1.)*a,a);
}`;
