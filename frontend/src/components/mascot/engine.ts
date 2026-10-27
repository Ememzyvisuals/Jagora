/* Amina, Jagora's guide: a CC0 3D character (CursedAmy from the 100Avatars collection, recoloured in Jagora's blue)
   drawn in one small transparent canvas. This file knows how to pose her; Amina.tsx decides where she goes.

   Poses are blended, never snapped: every bone eases toward the pose of the current base (stand, sit, walk, dangle)
   with the current gesture (wave, point, shush...) layered on top. Bone space is VRM 0 space: she faces -Z, her
   right arm runs along +X, a positive X turn swings an arm or leg forward. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";

export type Base = "stand" | "sit" | "walk" | "dangle";
export type Gesture = "none" | "wave" | "pointL" | "pointR" | "shush" | "watch" | "hop" | "dizzy" | "stretch" | "wrist" | "bounce" | "hello";

type R = [number, number, number];
type Pose = Partial<Record<string, R>> & { lift?: number };

const BONES = ["hips", "spine", "chest", "neck", "head", "leftUpperArm", "leftLowerArm", "rightUpperArm", "rightLowerArm",
  "leftHand", "rightHand", "leftUpperLeg", "leftLowerLeg", "rightUpperLeg", "rightLowerLeg"] as const;

const sm = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/* the base poses */
function basePose(base: Base, t: number): Pose {
  const breathe = Math.sin(t * 2.1) * 0.025;
  if (base === "sit") {
    const swing = Math.sin(t * 2.4) * 0.22;
    return {
      spine: [0.06 + breathe, 0, 0], chest: [breathe * 0.5, 0, 0],
      leftUpperLeg: [1.5, 0.08, 0], rightUpperLeg: [1.5, -0.08, 0],
      leftLowerLeg: [-1.25 + swing, 0, 0], rightLowerLeg: [-1.25 - swing, 0, 0],
      leftUpperArm: [0.35, 0, 1.15], rightUpperArm: [0.35, 0, -1.15],
      leftLowerArm: [0, -0.35, 0], rightLowerArm: [0, 0.35, 0],
    };
  }
  if (base === "walk") {
    const s = Math.sin(t * 9);
    return {
      spine: [0.04, 0, 0], hips: [0, s * 0.08, 0], lift: Math.abs(Math.cos(t * 9)) * 0.03,
      leftUpperLeg: [s * 0.55, 0, 0], rightUpperLeg: [-s * 0.55, 0, 0],
      leftLowerLeg: [-Math.max(0, -s) * 0.9, 0, 0], rightLowerLeg: [-Math.max(0, s) * 0.9, 0, 0],
      leftUpperArm: [-s * 0.45, 0, 1.2], rightUpperArm: [s * 0.45, 0, -1.2],
      leftLowerArm: [0, -0.3, 0], rightLowerArm: [0, 0.3, 0],
    };
  }
  if (base === "dangle") {
    const s = Math.sin(t * 7);
    return {
      spine: [0, 0, s * 0.05],
      leftUpperArm: [0, 0, -0.95], rightUpperArm: [0, 0, 0.95],
      leftLowerArm: [0, 0, -0.5], rightLowerArm: [0, 0, 0.5],
      leftUpperLeg: [0.3 + s * 0.35, 0, 0.06], rightUpperLeg: [0.3 - s * 0.35, 0, -0.06],
      leftLowerLeg: [-0.5 - s * 0.2, 0, 0], rightLowerLeg: [-0.5 + s * 0.2, 0, 0],
    };
  }
  return {
    spine: [breathe, 0, 0], chest: [breathe * 0.6, 0, 0],
    leftUpperArm: [0, 0, 1.22 + breathe], rightUpperArm: [0, 0, -1.22 - breathe],
    leftLowerArm: [0, -0.12, 0], rightLowerArm: [0, 0.12, 0],
  };
}

/* gestures layered on top (only the bones they name) */
function gesturePose(g: Gesture, t: number, base: Base): Pose {
  const seated = base === "sit";
  switch (g) {
    case "wave":
    case "hello":
      return { rightUpperArm: [0, 0, 0.55], rightLowerArm: [0, 0, 1.05 + Math.sin(t * 10) * 0.45], neck: [0, 0, 0.12] };
    case "pointL":
      return { rightUpperArm: [0, 0.25, 0.08], rightLowerArm: [0, 0.1, 0], neck: [0, -0.45, 0] };
    case "pointR":
      return { leftUpperArm: [0, -0.25, -0.08], leftLowerArm: [0, -0.1, 0], neck: [0, 0.45, 0] };
    case "shush":
      return { rightUpperArm: [0.55, 0, -1.05], rightLowerArm: [0, 2.25, 0], rightHand: [0, 0, 0.3], neck: [-0.08, 0, 0.08] };
    case "watch":
      return { rightUpperArm: [0.5, 0, -1.1], rightLowerArm: [0, 2.0, 0], leftUpperArm: [0.4, 0, 1.15], leftLowerArm: [0, -1.4, 0], neck: [-0.05, 0, -0.12] };
    case "stretch": {
      const k = Math.sin(t * 1.6) * 0.1;
      return { leftUpperArm: [0, 0, -1.35 + k], rightUpperArm: [0, 0, 1.35 - k], leftLowerArm: [0, 0, -0.3], rightLowerArm: [0, 0, 0.3], spine: [-0.12, 0, k], neck: [0.15, 0, 0] };
    }
    case "wrist":
      return { leftUpperArm: [0.7, 0, 1.0], leftLowerArm: [0, -1.7, 0], neck: [-0.38, 0.3, 0] };
    case "dizzy":
      return { neck: [Math.sin(t * 9) * 0.25, 0, Math.cos(t * 9) * 0.25], spine: [0, 0, Math.sin(t * 4.5) * 0.12] };
    case "hop":
    case "bounce":
      return { lift: Math.abs(Math.sin(t * (seated ? 8 : 7))) * (seated ? 0.05 : 0.09), leftUpperArm: [0, 0, seated ? 0.8 : 0.6], rightUpperArm: [0, 0, seated ? -0.8 : -0.6] };
    default:
      return {};
  }
}

export type Look = { x: number; y: number } | null;

export class AminaStage {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private vrm: VRM | null = null;
  private cur = new Map<string, THREE.Euler>();
  private lift = 0;
  private gWeight = 0;
  private t = 0;
  private gT = 0;
  private faceYaw = 0;
  private lean = 0;
  private kick = 0;
  private kickV = 0;
  private tilt = 0;
  private talking = 0;
  private headLook = new THREE.Vector2();
  private ray = new THREE.Raycaster();
  base: Base = "stand";
  gesture: Gesture = "none";
  private nextGesture: Gesture = "none";
  yaw = 0; // turn toward the screen: + faces right
  leanTo = 0; // lean her upper body: + toward the right of the screen
  look: Look = null; // where to look, in canvas pixels
  talk = false;
  mood: "calm" | "happy" | "fun" = "calm";

  constructor(canvas: HTMLCanvasElement, w: number, h: number) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(20, w / h, 0.1, 30);
    this.camera.position.set(0, 0.86, 5.0);
    this.camera.lookAt(0, 0.82, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  }

  async load(url: string) {
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm as VRM;
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.frustumCulled = false) : 0));
    this.scene.add(vrm.scene);
    this.vrm = vrm;
    for (const b of BONES) this.cur.set(b, new THREE.Euler());
    // let her hair and jacket settle before anyone sees her
    for (let i = 0; i < 60; i++) this.step(1 / 30, false);
    await this.renderer.compileAsync(this.scene, this.camera);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** start a gesture now (the old one fades out first) */
  play(g: Gesture) {
    if (g === this.gesture && this.gWeight > 0.5) return;
    this.nextGesture = g;
  }

  /** a quick shove from fast scrolling: her hair and body react */
  nudge(v: number) {
    this.kickV += Math.max(-1, Math.min(1, v)) * 0.6;
  }

  setTilt(g: number) {
    this.tilt = Math.max(-1, Math.min(1, g / 35));
  }

  private step(dt: number, render = true) {
    const vrm = this.vrm;
    if (!vrm) return;
    this.t += dt;
    this.gT += dt;
    // gestures cross-fade through zero
    if (this.nextGesture !== this.gesture) {
      this.gWeight = Math.max(0, this.gWeight - dt * 5);
      if (this.gWeight === 0) {
        this.gesture = this.nextGesture;
        this.gT = 0;
      }
    } else this.gWeight = Math.min(1, this.gWeight + dt * 4);

    // a soft spring for scroll shoves
    this.kickV += (-this.kick * 40 - this.kickV * 7) * dt;
    this.kick += this.kickV * dt;

    const bp = basePose(this.base, this.t);
    const gp = gesturePose(this.gesture, this.gT, this.base);
    const k = 1 - Math.exp(-dt * 10);
    for (const name of BONES) {
      const node = vrm.humanoid.getNormalizedBoneNode(name);
      if (!node) continue;
      const a = bp[name] ?? [0, 0, 0];
      const g = gp[name];
      const w = this.gWeight;
      const target: R = g ? [lerp(a[0], g[0], w), lerp(a[1], g[1], w), lerp(a[2], g[2], w)] : a;
      const e = this.cur.get(name)!;
      e.x = lerp(e.x, target[0], k);
      e.y = lerp(e.y, target[1], k);
      e.z = lerp(e.z, target[2], k);
      node.rotation.copy(e);
    }
    // lean, tilt and the scroll shove, all on the hips; the head turns toward what she watches
    this.lean = lerp(this.lean, this.leanTo * 0.32 + this.tilt * 0.12, k);
    const hips = vrm.humanoid.getNormalizedBoneNode("hips")!;
    hips.rotation.z += this.lean;
    hips.rotation.x += this.kick * 0.5;
    const lift = (bp.lift ?? 0) + (gp.lift ?? 0) * this.gWeight;
    this.lift = lerp(this.lift, lift, 1 - Math.exp(-dt * 18));
    vrm.scene.position.y = this.lift;
    this.faceYaw = lerp(this.faceYaw, this.yaw, 1 - Math.exp(-dt * 6));
    vrm.scene.rotation.y = Math.PI + this.faceYaw;

    // follow the cursor with head and eyes, unless a gesture is steering the head
    const neck = vrm.humanoid.getNormalizedBoneNode("neck")!;
    const head = vrm.humanoid.getNormalizedBoneNode("head")!;
    let lx = 0, ly = 0;
    if (this.look && !gp.neck) {
      const hp = this.screenOf("head");
      if (hp) {
        lx = Math.max(-1, Math.min(1, (this.look.x - hp.x) / 300));
        ly = Math.max(-1, Math.min(1, (this.look.y - hp.y) / 300));
      }
    }
    this.headLook.x = lerp(this.headLook.x, lx, k * 0.8);
    this.headLook.y = lerp(this.headLook.y, ly, k * 0.8);
    head.rotation.set(-this.headLook.y * 0.35, this.headLook.x * 0.6 - this.faceYaw * 0.5, 0);
    neck.rotation.x += 0;

    // face: blink, mood, talking
    const em = vrm.expressionManager;
    if (em) {
      const p = this.t % 3.7;
      const blink = p < 0.14 ? Math.sin((p / 0.14) * Math.PI) : 0;
      const happy = this.mood === "happy" ? 0.85 : this.mood === "fun" ? 0.5 : 0.25;
      em.setValue("blink", this.gesture === "dizzy" ? 0.6 : blink * (1 - happy * 0.5));
      em.setValue("happy", lerp(em.getValue("happy") ?? 0, happy, k));
      em.setValue("relaxed", lerp(em.getValue("relaxed") ?? 0, this.mood === "fun" ? 0.6 : 0, k));
      this.talking = lerp(this.talking, this.talk ? 1 : 0, k);
      em.setValue("aa", this.talking * (0.35 + 0.35 * Math.sin(this.t * 17)) );
      em.setValue("oh", this.talking * Math.max(0, Math.sin(this.t * 7.7)) * 0.35);
    }
    vrm.update(dt);
    if (render) this.renderer.render(this.scene, this.camera);
  }

  frame(dt: number) {
    this.step(Math.min(dt, 1 / 20));
  }

  /** where a bone is on the canvas, in CSS pixels */
  screenOf(bone: "head" | "hips" | "chest" | "rightHand" | "leftHand" | "leftUpperLeg" | "rightUpperLeg") {
    const node = this.vrm?.humanoid.getNormalizedBoneNode(bone);
    if (!node) return null;
    this.vrm!.scene.updateMatrixWorld(true);
    const p = node.getWorldPosition(new THREE.Vector3()).project(this.camera);
    const c = this.renderer.domElement;
    const w = c.clientWidth || c.width, h = c.clientHeight || c.height;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h };
  }

  /** where she sits: the middle of her two hip joints */
  seatPoint() {
    const a = this.screenOf("leftUpperLeg"), b = this.screenOf("rightUpperLeg");
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
  }

  /** is this canvas point on her body? */
  hit(x: number, y: number) {
    if (!this.vrm) return false;
    const c = this.renderer.domElement;
    const w = c.clientWidth || 1, h = c.clientHeight || 1;
    this.ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), this.camera);
    return this.ray.intersectObject(this.vrm.scene, true).length > 0;
  }

  dispose() {
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    this.renderer.dispose();
  }
}
