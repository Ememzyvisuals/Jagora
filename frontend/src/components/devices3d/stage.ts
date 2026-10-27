/* The 3D devices behind Devices3D.tsx. Plain three.js, loaded only when a device section is near the screen.
   Units are roughly decimetres: the laptop is a 13 inch midnight notebook (30.4 x 21.5 cm) and the phone a
   6.1 inch phone (7.2 x 15.6 cm), so the two keep their real sizes next to each other.

   She can play with them:
     drag (mouse or finger)  turns the device in her hand; let go and it comes back to face her
     tap or click            it spins all the way round, showing its back, and faces her again
     hover                   it lifts a little towards the pointer
     typing anywhere         the same key goes down on the laptop's keyboard and lights up
     arrow keys              turn the device when it has focus

   Kept light: built only near the screen and freed when far away, drawn only while visible, big images decoded
   off the main thread and sent to the GPU one per frame, shaders compiled in the background. */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type Scene = "hero" | "phones" | "safety";

const SHOTS: Record<Scene, Record<string, string[]>> = {
  hero: { laptop: ["desktop-register", "desktop-doc"], phone: ["phone-register", "phone-home"] },
  phones: { a: ["phone-register", "phone-home"], b: ["phone-doc"] },
  safety: { laptop: ["desktop-private"] },
};

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/* ---------- shapes ---------- */

function rrect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, PI / 2, PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, PI, 1.5 * PI, false);
  return s;
}

/** A rounded slab: w x h in the XY plane, d thick along Z, centred, with soft rounded edges. */
function slab(w: number, h: number, d: number, r: number, b: number, seg = 16) {
  const g = new THREE.ExtrudeGeometry(rrect(w - 2 * b, h - 2 * b, Math.max(r - b, 0.002)), {
    depth: Math.max(d - 2 * b, 0.0002),
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 4,
    curveSegments: seg,
  });
  g.translate(0, 0, -(d / 2 - b));
  return g;
}

/** A flat rounded face with 0..1 UVs, for screens and glass. */
function face(w: number, h: number, r: number, seg = 16) {
  const g = new THREE.ShapeGeometry(rrect(w, h, r), seg);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
  return g;
}

/* ---------- screens: the real screenshots, with a status bar on top like a real device ---------- */

type Shot = { tex: THREE.Texture; aspect: number };

async function loadShot(name: string, kind: "phone" | "laptop", hd: boolean, aniso: number): Promise<Shot> {
  const src = `/shots/${hd ? "hd/" : ""}${name}.webp`;
  // decoded off the main thread, so scrolling stays smooth while the big images arrive
  const blob = await (await fetch(src)).blob();
  const im = await createImageBitmap(blob);
  const strip = Math.round(im.width * (kind === "phone" ? 0.137 : 0.0267));
  const c = document.createElement("canvas");
  c.width = im.width;
  c.height = im.height + strip;
  const g = c.getContext("2d", { willReadFrequently: false })!;
  g.drawImage(im, 0, strip);
  im.close();
  // the status bar takes the colour of the top of the page, like a real phone or a full-screen browser
  const px = g.getImageData(0, strip + 3, c.width, 1).data;
  let R = 0, G = 0, B = 0;
  for (let i = 0; i < px.length; i += 4) {
    R += px[i];
    G += px[i + 1];
    B += px[i + 2];
  }
  const n = px.length / 4;
  [R, G, B] = [R / n, G / n, B / n];
  if (kind === "laptop") [R, G, B] = [R * 0.9, G * 0.9, B * 0.9];
  g.fillStyle = `rgb(${R | 0},${G | 0},${B | 0})`;
  g.fillRect(0, 0, c.width, strip);
  const ink = (0.299 * R + 0.587 * G + 0.114 * B) / 255 > 0.6 ? "#111318" : "#ffffff";
  g.fillStyle = ink;
  g.strokeStyle = ink;
  const sans = `-apple-system, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif`;
  if (kind === "phone") {
    const mid = strip * 0.6;
    g.font = `600 ${strip * 0.34}px ${sans}`;
    g.textBaseline = "middle";
    g.textAlign = "center";
    g.fillText("9:41", c.width * 0.19, mid);
    const u = strip * 0.06;
    let x = c.width * 0.69;
    for (let i = 0; i < 4; i++) {
      const h = u * (1.6 + i * 0.9);
      g.beginPath();
      g.roundRect(x, mid + u * 2.3 - h, u * 1.15, h, u * 0.4);
      g.fill();
      x += u * 1.65;
    }
    x += u * 3.2;
    g.lineWidth = u * 0.95;
    g.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(x, mid + u * 2.2, u * (1.1 + i * 1.25), -PI * 0.75, -PI * 0.25);
      g.stroke();
    }
    g.beginPath();
    g.arc(x, mid + u * 2.0, u * 0.45, 0, TAU);
    g.fill();
    x += u * 4.2;
    g.lineWidth = u * 0.5;
    g.globalAlpha = 0.45;
    g.beginPath();
    g.roundRect(x, mid - u * 1.9, u * 7.6, u * 3.8, u * 1.1);
    g.stroke();
    g.beginPath();
    g.roundRect(x + u * 8.0, mid - u * 0.7, u * 0.6, u * 1.4, u * 0.3);
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    g.roundRect(x + u * 0.65, mid - u * 1.25, u * 5.4, u * 2.5, u * 0.6);
    g.fill();
  } else {
    g.font = `600 ${strip * 0.5}px ${sans}`;
    g.textBaseline = "middle";
    g.textAlign = "right";
    g.fillText("Tue 27 Oct  9:41", c.width - strip * 0.9, strip * 0.52);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, aspect: c.width / c.height };
}

/** Two layers, so one screenshot fades into the next. `power` turns the screen on as the lid opens. */
class Screen {
  a: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  b: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  power = 1;
  private t = 0;
  private i = 0;
  private fade = -1;
  constructor(geo: THREE.BufferGeometry, public shots: Shot[], z: number, parent: THREE.Object3D, private every = 6) {
    this.a = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: shots[0].tex, toneMapped: false }));
    this.b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: shots[0].tex, toneMapped: false, transparent: true, opacity: 0, depthWrite: false }));
    this.a.position.z = z;
    this.b.position.z = z + 0.0004;
    parent.add(this.a, this.b);
  }
  update(dt: number) {
    this.a.material.color.setScalar(this.power);
    this.b.material.color.setScalar(this.power);
    if (this.shots.length < 2 || this.power < 1) return;
    this.t += dt;
    if (this.fade < 0 && this.t > this.every) {
      this.i = (this.i + 1) % this.shots.length;
      this.b.material.map = this.shots[this.i].tex;
      this.fade = 0;
    }
    if (this.fade >= 0) {
      this.fade += dt / 0.8;
      this.b.material.opacity = ease(clamp(this.fade));
      if (this.fade >= 1) {
        this.a.material.map = this.shots[this.i].tex;
        this.b.material.opacity = 0;
        this.fade = -1;
        this.t = 0;
      }
    }
  }
}

/* ---------- materials (standard PBR: one specular layer, cheaper than clearcoat, same look) ---------- */

function materials() {
  return {
    metal: new THREE.MeshStandardMaterial({ color: 0x1f2a3d, metalness: 0.86, roughness: 0.3 }),
    well: new THREE.MeshStandardMaterial({ color: 0x161b22, metalness: 0.3, roughness: 0.75 }),
    key: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.6 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x2a3446, metalness: 0.75, roughness: 0.18 }),
    black: new THREE.MeshStandardMaterial({ color: 0x040507, metalness: 0.1, roughness: 0.12 }),
    back: new THREE.MeshStandardMaterial({ color: 0x27324a, metalness: 0.3, roughness: 0.48 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x06080b, metalness: 0.3, roughness: 0.04 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0, roughness: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 1.3 }),
  };
}
type Mats = ReturnType<typeof materials>;

/* ---------- the laptop ---------- */

const KEY_ROWS: [number, [number, string][]][] = [
  [0.55, [[1.5, "Escape"], ...Array.from({ length: 12 }, (_, i) => [1, `F${i + 1}`] as [number, string]), [1, "Power"]]],
  [1, [..."`1234567890-=".split("").map((c) => [1, c] as [number, string]), [1.5, "Backspace"]]],
  [1, [[1.5, "Tab"], ..."qwertyuiop[]\\".split("").map((c) => [1, c] as [number, string])]],
  [1, [[1.75, "CapsLock"], ..."asdfghjkl;'".split("").map((c) => [1, c] as [number, string]), [1.75, "Enter"]]],
  [1, [[2.25, "Shift"], ..."zxcvbnm,./".split("").map((c) => [1, c] as [number, string]), [2.25, "Shift"]]],
  [1, [[1, "Fn"], [1, "Control"], [1, "Alt"], [1.25, "Meta"], [5, " "], [1.25, "Meta"], [1, "Alt"], [1, "ArrowLeft"], [1, "ArrowUp"], [1, "ArrowRight"]]],
];
const KEY_BASE = new THREE.Color(0x0d1014);
const KEY_LIT = new THREE.Color(0x4d8dff);

function buildLaptop(m: Mats, shots: Shot[]) {
  const W = 3.04, D = 2.15, BT = 0.065, R = 0.13;
  const body = new THREE.Group();
  const top = BT / 2;

  body.add(new THREE.Mesh(slab(W, D, BT, R, 0.026, 20).rotateX(-PI / 2), m.metal));

  // keyboard: six rows of real keys, set in a dark well
  const kbW = 2.7, u = kbW / 14.5, gap = 0.026;
  const kbD = KEY_ROWS.reduce((s, [h]) => s + h * u, 0);
  const kbBack = -D / 2 + 0.19;
  const well = new THREE.Mesh(face(kbW + 0.1, kbD + 0.08, 0.04).rotateX(-PI / 2), m.well);
  well.position.set(0, top + 0.0008, kbBack + kbD / 2);
  body.add(well);
  const count = KEY_ROWS.reduce((s, [, k]) => s + k.length, 0);
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.2), m.key, count);
  const rest: THREE.Matrix4[] = [];
  const byKey = new Map<string, number[]>();
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  let idx = 0, z = kbBack;
  for (const [h, ks] of KEY_ROWS) {
    let x = -kbW / 2;
    for (const [k, name] of ks) {
      pos.set(x + (k * u) / 2, top + 0.006, z + (h * u) / 2);
      scl.set(k * u - gap, 0.012, h * u - gap);
      mat.compose(pos, q, scl);
      rest.push(mat.clone());
      keys.setMatrixAt(idx, mat);
      keys.setColorAt(idx, KEY_BASE);
      byKey.set(name, [...(byKey.get(name) || []), idx]);
      idx++;
      x += k * u;
    }
    z += h * u;
  }
  byKey.set("ArrowDown", byKey.get("ArrowUp")!);
  body.add(keys);

  const pad = new THREE.Mesh(face(1.32, 0.72, 0.05).rotateX(-PI / 2), m.pad);
  pad.position.set(0, top + 0.0007, kbBack + kbD + 0.11 + 0.36);
  body.add(pad);

  // the lid on its hinge
  const LH = 2.06, LT = 0.035;
  const hinge = new THREE.Group();
  hinge.position.set(0, top + 0.008, -D / 2 + 0.035);
  body.add(hinge);
  const lid = new THREE.Mesh(slab(W, LH, LT, R, 0.012, 20).translate(0, LH / 2, -LT / 2), m.metal);
  const bezel = new THREE.Mesh(face(W - 0.04, LH - 0.04, R - 0.02), m.black);
  bezel.position.set(0, LH / 2, 0.0006);
  const SW = W - 0.2, SH = SW / shots[0].aspect, sy = LH - 0.085 - SH / 2;
  const holder = new THREE.Group();
  holder.position.set(0, sy, 0);
  const screen = new Screen(face(SW, SH, 0.03), shots, 0.001, holder);
  const notch = new THREE.Mesh(face(0.2, 0.07, 0.022), m.black);
  notch.position.set(0, SH / 2 - 0.025, 0.0016);
  holder.add(notch);
  const glass = new THREE.Mesh(face(W - 0.04, LH - 0.04, R - 0.02), m.glass);
  glass.position.set(0, LH / 2, 0.0022);
  hinge.add(lid, bezel, holder, glass);

  return { body, hinge, screen, keyboard: { mesh: keys, rest, byKey, pressed: new Map<number, number>() } };
}
type Keyboard = ReturnType<typeof buildLaptop>["keyboard"];

/* ---------- the phone ---------- */

function buildPhone(m: Mats, shots: Shot[]) {
  const W = 0.716, SW = W - 0.068, SH = SW / shots[0].aspect, H = SH + 0.068, T = 0.082, R = 0.118;
  const body = new THREE.Group();
  body.add(new THREE.Mesh(slab(W, H, T, R, 0.027, 20), m.metal));

  const back = new THREE.Mesh(face(W - 0.03, H - 0.03, R - 0.015), m.back);
  back.rotation.y = PI;
  back.position.z = -T / 2 - 0.0006;
  body.add(back);

  const front = new THREE.Mesh(face(W - 0.012, H - 0.012, R - 0.006), m.black);
  front.position.z = T / 2 + 0.0005;
  body.add(front);
  const holder = new THREE.Group();
  holder.position.z = T / 2;
  body.add(holder);
  const screen = new Screen(face(SW, SH, 0.096), shots, 0.001, holder);
  const island = new THREE.Mesh(face(0.172, 0.05, 0.025), m.black);
  island.position.set(0, SH / 2 - 0.047, 0.0018);
  holder.add(island);
  const glass = new THREE.Mesh(face(W - 0.012, H - 0.012, R - 0.006), m.glass);
  glass.position.z = 0.0024;
  holder.add(glass);

  const btnGeo = (len: number) => new RoundedBoxGeometry(0.014, len, 0.03, 2, 0.006);
  const btn = (x: number, y: number, len: number) => {
    const b = new THREE.Mesh(btnGeo(len), m.metal);
    b.position.set(x, y, 0);
    body.add(b);
  };
  btn(-W / 2 - 0.002, H / 2 - 0.36, 0.06);
  btn(-W / 2 - 0.002, H / 2 - 0.5, 0.12);
  btn(-W / 2 - 0.002, H / 2 - 0.66, 0.12);
  btn(W / 2 + 0.002, H / 2 - 0.55, 0.18);

  // camera on the back, seen when it turns round
  const cam = new THREE.Mesh(slab(0.3, 0.3, 0.014, 0.075, 0.005, 12), m.back);
  cam.position.set(-W / 2 + 0.2, H / 2 - 0.2, -T / 2 - 0.006);
  body.add(cam);
  const ringGeo = new THREE.CylinderGeometry(0.056, 0.056, 0.022, 32).rotateX(PI / 2);
  const lensGeo = new THREE.CircleGeometry(0.04, 32);
  for (const [dx, dy] of [[-0.066, 0.066], [0.066, -0.066]]) {
    const ring = new THREE.Mesh(ringGeo, m.metal);
    ring.position.set(cam.position.x + dx, cam.position.y + dy, -T / 2 - 0.016);
    const lens = new THREE.Mesh(lensGeo, m.lens);
    lens.rotation.y = PI;
    lens.position.set(ring.position.x, ring.position.y, -T / 2 - 0.0275);
    body.add(ring, lens);
  }
  return { body, screen };
}

/* ---------- soft shadow on the floor ---------- */

function shadowTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(12,24,52,0.55)");
  gr.addColorStop(0.45, "rgba(12,24,52,0.22)");
  gr.addColorStop(1, "rgba(12,24,52,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function shadow(tex: THREE.Texture, w: number, d: number) {
  const s = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  s.renderOrder = -1;
  return s;
}

/* ---------- a scene ---------- */

type Part = {
  rig: THREE.Group;
  body: THREE.Group;
  shadow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  rest: THREE.Euler;
  floatY: number;
  phase: number;
  screen: Screen;
  hinge?: THREE.Group;
  keyboard?: Keyboard;
  enter: (t: number, p: Part) => void;
  // her hands on it
  yaw: number;
  pitch: number;
  vyaw: number;
  held: boolean;
  letGo: number;
  spin: number; // seconds into a full turn, -1 when not spinning
  hover: number;
};

export function mount(el: HTMLElement, scene: Scene, onReady: () => void, onFail: () => void): () => void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const cv = renderer.domElement;
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;outline:none";
  cv.tabIndex = 0;
  el.appendChild(cv);
  const lost = (e: Event) => {
    e.preventDefault();
    onFail();
  };
  cv.addEventListener("webglcontextlost", lost);

  const three = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  three.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(3, 6, 5);
  three.add(key, new THREE.HemisphereLight(0xe4eeff, 0x18202e, 0.45));

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const world = new THREE.Group();
  three.add(world);

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const big = Math.min(window.screen.width, window.screen.height) >= 700; // tablets and computers get the sharpest laptop screens
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const m = materials();
  const sTex = shadowTex();
  const parts: Part[] = [];
  let frame = { w: 4, h: 3 };
  let elev = 0.22;
  let alive = true;

  const hands = () => ({ yaw: 0, pitch: 0, vyaw: 0, held: false, letGo: 0, spin: -1, hover: 0 });

  const laptopPart = (shots: Shot[], at: [number, number, number], rest: [number, number, number], floor: number): Part => {
    const l = buildLaptop(m, shots);
    const rig = new THREE.Group();
    rig.position.set(...at);
    const sh = shadow(sTex, 4.6, 3.4);
    sh.position.y = floor;
    rig.add(l.body, sh);
    world.add(rig);
    l.hinge.rotation.x = PI / 2;
    return {
      rig, body: l.body, shadow: sh, rest: new THREE.Euler(...rest), floatY: 0, phase: 0, screen: l.screen, hinge: l.hinge, keyboard: l.keyboard, ...hands(),
      enter: (t, p) => {
        const open = ease(clamp((t - 0.35) / 1.7));
        p.hinge!.rotation.x = lerp(PI / 2, -0.3, open);
        p.screen.power = ease(clamp((open - 0.5) / 0.4));
        const turn = easeOut(clamp(t / 2.3));
        p.body.rotation.set(p.rest.x + (1 - turn) * 0.22, p.rest.y + (1 - turn) * -0.9, p.rest.z);
        p.floatY = (1 - easeOut(clamp(t / 1.5))) * -0.35;
      },
    };
  };

  const phonePart = (shots: Shot[], at: [number, number, number], rest: [number, number, number], scale: number, floor: number, delay: number, spin = 0.9): Part => {
    const ph = buildPhone(m, shots);
    const rig = new THREE.Group();
    rig.position.set(...at);
    ph.body.scale.setScalar(scale);
    const sh = shadow(sTex, 1.5 * scale, 0.9 * scale);
    sh.position.y = floor;
    rig.add(ph.body, sh);
    world.add(rig);
    return {
      rig, body: ph.body, shadow: sh, rest: new THREE.Euler(...rest), floatY: 0, phase: 1.3 + delay * 5, screen: ph.screen, ...hands(),
      enter: (t, p) => {
        const k = easeOut(clamp((t - delay) / 1.5));
        p.body.rotation.set(p.rest.x, p.rest.y + (1 - k) * spin, p.rest.z);
        p.floatY = (1 - k) * -0.6;
      },
    };
  };

  /* the first screen of each device first; the others come in quietly afterwards */
  const later: { screen: Screen; names: string[]; kind: "phone" | "laptop" }[] = [];
  const first = async (names: string[], kind: "phone" | "laptop") => [await loadShot(names[0], kind, kind === "phone" || big, aniso)];

  const ready = (async () => {
    const want = SHOTS[scene];
    if (scene === "hero") {
      const [lap, ph] = await Promise.all([first(want.laptop, "laptop"), first(want.phone, "phone")]);
      if (!alive) return;
      const L = laptopPart(lap, [-0.5, 0, 0], [0, -0.22, 0], -0.32);
      const P = phonePart(ph, [1.72, 0.86, 1.0], [-0.04, -0.42, -0.05], 1.3, -1.16, 0.5);
      parts.push(L, P);
      later.push({ screen: L.screen, names: want.laptop, kind: "laptop" }, { screen: P.screen, names: want.phone, kind: "phone" });
      world.position.set(-0.15, -0.8, -0.3);
      frame = { w: 5.0, h: 3.05 };
      elev = 0.2;
    } else if (scene === "phones") {
      const [a, b] = await Promise.all([first(want.a, "phone"), first(want.b, "phone")]);
      if (!alive) return;
      const A = phonePart(a, [-0.46, 0.06, 0.1], [0.06, 0.4, 0.16], 1, -1.0, 0, 1.1);
      const B = phonePart(b, [0.5, 0.3, -0.25], [0.02, -0.42, -0.14], 1, -1.24, 0.25, -1.1);
      parts.push(A, B);
      later.push({ screen: A.screen, names: want.a, kind: "phone" });
      frame = { w: 2.25, h: 2.35 };
      elev = 0.06;
    } else {
      const lap = await first(want.laptop, "laptop");
      if (!alive) return;
      parts.push(laptopPart(lap, [0, 0, 0], [0, 0.3, 0], -0.32));
      world.position.set(0, -0.85, 0.1);
      frame = { w: 4.1, h: 2.9 };
      elev = 0.24;
    }
    fit();
    // compile shaders in the background (no freeze), then send each texture to the GPU on its own frame
    await renderer.compileAsync(three, camera);
    for (const p of parts) {
      if (!alive) return;
      renderer.initTexture(p.screen.shots[0].tex);
      await nextFrame();
    }
  })();

  const loadLater = async () => {
    for (const l of later) {
      for (const name of l.names.slice(1)) {
        if (!alive) return;
        const s = await loadShot(name, l.kind, l.kind === "phone" || big, aniso).catch(() => null);
        if (!s || !alive) continue;
        renderer.initTexture(s.tex);
        l.screen.shots.push(s);
        await nextFrame();
      }
    }
  };

  /* camera framing: fit the scene into the box at any width */
  function fit() {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan((camera.fov * PI) / 360);
    const dist = Math.max(frame.h / 2 / tan, frame.w / 2 / (tan * camera.aspect)) * 1.04;
    camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(() => fit());
  ro.observe(el);

  /* ---------- her hands: drag to turn, tap to spin, hover to lift ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = (e: PointerEvent): Part | null => {
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    let best: Part | null = null, bestD = Infinity;
    for (const p of parts) {
      const h = ray.intersectObject(p.body, true)[0];
      if (h && h.distance < bestD) {
        best = p;
        bestD = h.distance;
      }
    }
    return best;
  };
  let grab: { part: Part; x: number; y: number; lastX: number; lastT: number; moved: boolean; id: number } | null = null;
  const onDown = (e: PointerEvent) => {
    const p = hit(e);
    if (!p) return;
    grab = { part: p, x: e.clientX, y: e.clientY, lastX: e.clientX, lastT: performance.now(), moved: false, id: e.pointerId };
  };
  const onMoveCv = (e: PointerEvent) => {
    if (grab && e.pointerId === grab.id) {
      const dx = e.clientX - grab.x, dy = e.clientY - grab.y;
      if (!grab.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        grab.moved = true;
        grab.part.held = true;
        grab.part.spin = -1;
        cv.setPointerCapture(e.pointerId);
      }
      if (grab.moved) {
        const now = performance.now();
        const step = (e.clientX - grab.lastX) * 0.012;
        grab.part.yaw += step;
        grab.part.pitch = clamp(dy * 0.004, -0.35, 0.35);
        grab.part.vyaw = step / Math.max(0.008, (now - grab.lastT) / 1000);
        grab.lastX = e.clientX;
        grab.lastT = now;
        e.preventDefault();
      }
      return;
    }
    if (e.pointerType === "mouse") {
      const p = hit(e);
      for (const q of parts) q.hover = q === p ? 1 : 0;
      cv.style.cursor = p ? "grab" : "";
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!grab || e.pointerId !== grab.id) return;
    const p = grab.part;
    if (grab.moved) {
      p.held = false;
      p.letGo = 0;
    } else if (p.spin < 0) {
      p.spin = 0; // a tap: turn all the way round and face her again
    }
    grab = null;
  };
  const onLeave = () => {
    for (const q of parts) q.hover = 0;
  };
  cv.addEventListener("pointerdown", onDown);
  cv.addEventListener("pointermove", onMoveCv);
  cv.addEventListener("pointerup", onUp);
  cv.addEventListener("pointercancel", onUp);
  cv.addEventListener("pointerleave", onLeave);

  /* ---------- keyboard: the same key goes down on the laptop ---------- */
  const onKey = (e: KeyboardEvent) => {
    let k = e.key;
    if (!k || k === "Unidentified" || k === "Process") k = "a"; // phone keyboards often hide the key
    if (k.length === 1) k = k.toLowerCase();
    const shifted: Record<string, string> = { "!": "1", "@": "2", "#": "3", $: "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", _: "-", "+": "=", "{": "[", "}": "]", "|": "\\", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/", "~": "`" };
    k = shifted[k] || k;
    if (k.length === 1 && !/[a-z0-9`\-=[\]\\;',./ ]/.test(k)) k = "abcdefghijklmnopqrstuvwxyz"[(k.codePointAt(0) || 0) % 26]; // Yorùbá letters and the like
    const now = performance.now();
    for (const p of parts) {
      const kb = p.keyboard;
      if (!kb) continue;
      for (const i of kb.byKey.get(k) || []) kb.pressed.set(i, now);
    }
    if (document.activeElement === cv && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      for (const p of parts) {
        p.yaw += e.key === "ArrowLeft" ? -0.25 : 0.25;
        p.letGo = 0;
      }
      e.preventDefault();
    }
    if (document.activeElement === cv && (e.key === "Enter" || e.key === " ")) {
      for (const p of parts) if (p.spin < 0) p.spin = 0;
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", onKey);
  const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
  const pressKeys = (kb: Keyboard, now: number) => {
    if (!kb.pressed.size) return;
    for (const [i, at] of kb.pressed) {
      const f = clamp((now - at) / 320);
      const down = f < 0.25 ? f / 0.25 : 1 - (f - 0.25) / 0.75;
      kb.rest[i].decompose(tmpP, tmpQ, tmpS);
      tmpP.y -= 0.006 * down;
      kb.mesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
      kb.mesh.setColorAt(i, tmpC.copy(KEY_BASE).lerp(KEY_LIT, 1 - f));
      if (f >= 1) kb.pressed.delete(i);
    }
    kb.mesh.instanceMatrix.needsUpdate = true;
    if (kb.mesh.instanceColor) kb.mesh.instanceColor.needsUpdate = true;
  };

  /* ---------- pointer lean and scroll turn ---------- */
  let px = 0, py = 0, tx = 0, ty = 0, sx = 0;
  const fine = window.matchMedia("(pointer: fine)").matches;
  const onMove = (e: PointerEvent) => {
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  if (fine && !reduce) window.addEventListener("pointermove", onMove, { passive: true });

  let visible = false, started = -1, last = 0, raf = 0, shown = false;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.05 });
  io.observe(el);

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (!visible || !parts.length) return; // nothing is drawn while it is off screen
    if (started < 0) started = now;
    const clock = (window as unknown as { __jg3dClock?: number }).__jg3dClock;
    const t = reduce ? 20 : (clock ?? (now - started) / 1000);

    const r = el.getBoundingClientRect();
    const scroll = clamp((r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight, -1, 1);
    const k = Math.min(1, dt * 3);
    px = lerp(px, tx, k);
    py = lerp(py, ty, k);
    sx = lerp(sx, reduce ? 0 : scroll, Math.min(1, dt * 6));
    world.rotation.y = sx * -0.22 + px * 0.13;
    world.rotation.x = py * 0.05 + sx * 0.04;

    for (const p of parts) {
      p.enter(t, p);
      // after she lets go: keep a little momentum, then come back to face her
      if (!p.held) {
        p.letGo += dt;
        p.yaw += p.vyaw * dt;
        p.vyaw *= Math.exp(-dt * 5);
        if (p.letGo > 0.35) {
          const home = Math.round(p.yaw / TAU) * TAU; // the nearest way back to the front
          p.yaw = lerp(p.yaw, home, 1 - Math.exp(-dt * 4));
          if (Math.abs(p.yaw - home) < 0.0005) p.yaw = 0;
        }
        p.pitch = lerp(p.pitch, 0, 1 - Math.exp(-dt * 5));
      }
      let spinYaw = 0, hop = 0;
      if (p.spin >= 0) {
        p.spin += dt;
        const f = clamp(p.spin / 1.25);
        spinYaw = ease(f) * TAU;
        hop = Math.sin(f * PI) * 0.18;
        if (f >= 1) p.spin = -1;
      }
      p.body.rotation.y += p.yaw + spinYaw;
      p.body.rotation.x += p.pitch;
      if (!reduce) p.body.rotation.z += Math.sin(t * 0.6 + p.phase) * 0.012;
      const bob = reduce ? 0 : Math.sin(t * 0.9 + p.phase) * 0.035;
      p.body.position.y = p.floatY + bob + hop + p.hover * 0.06 * (1 - hop);
      const lift = clamp(1 + (p.floatY + bob + hop) * 1.4, 0.3, 1);
      p.shadow.material.opacity = lift;
      p.shadow.scale.setScalar(1.12 - lift * 0.12);
      p.screen.update(dt);
      if (p.keyboard) pressKeys(p.keyboard, now);
    }
    renderer.render(three, camera);
    if (!shown) {
      shown = true;
      onReady();
      loadLater();
    }
  };

  ready
    .then(() => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
    })
    .catch(onFail);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("keydown", onKey);
    cv.removeEventListener("webglcontextlost", lost);
    const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>();
    three.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) geos.add(mesh.geometry);
      const mt = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => mats.add(x));
    });
    for (const p of parts) p.screen.shots.forEach((s) => texs.add(s.tex));
    texs.add(sTex);
    geos.forEach((g) => g.dispose());
    mats.forEach((x) => x.dispose());
    texs.forEach((x) => x.dispose());
    three.environment?.dispose();
    renderer.dispose();
    renderer.forceContextLoss(); // give the GPU back at once, so Chrome never runs short of 3D contexts
    cv.remove();
  };
}
