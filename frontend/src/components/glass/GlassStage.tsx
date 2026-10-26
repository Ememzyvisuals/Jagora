"use client";

/* The 3D layer behind the whole page: the sky, and a real glass slab under every glass surface of the interface.
   Each slab is a rounded rectangle extruded with a deep curved bevel, so it behaves like a lens: the sky behind it
   bends hard at the rim, is magnified slightly through the middle, frosts a little and splits into colour at the
   edges. The page's own text and buttons sit on top in the DOM, sharp. One shared render of the sky feeds every slab,
   so the cost stays flat however many glass surfaces there are. */
import { Environment, Lightformer, MeshTransmissionMaterial, useFBO, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { glass, type GlassEntry } from "@/lib/glassRegistry";

function slabGeometry(w: number, h: number, r: number, bevel: number) {
  const b = Math.min(bevel, w / 2 - 1, h / 2 - 1);
  const iw = w - 2 * b, ih = h - 2 * b, ir = Math.max(0.5, Math.min(r - b, iw / 2, ih / 2));
  const s = new THREE.Shape();
  const x = -iw / 2, y = -ih / 2;
  s.moveTo(x + ir, y);
  s.lineTo(x + iw - ir, y);
  s.quadraticCurveTo(x + iw, y, x + iw, y + ir);
  s.lineTo(x + iw, y + ih - ir);
  s.quadraticCurveTo(x + iw, y + ih, x + iw - ir, y + ih);
  s.lineTo(x + ir, y + ih);
  s.quadraticCurveTo(x, y + ih, x, y + ih - ir);
  s.lineTo(x, y + ir);
  s.quadraticCurveTo(x, y, x + ir, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: true, bevelThickness: b * 0.9, bevelSize: b, bevelSegments: 10, curveSegments: 18 });
  g.center();
  return g;
}

function Slab({ e, buffer }: { e: GlassEntry; buffer: THREE.Texture }) {
  const mesh = useRef<THREE.Mesh>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { size: view } = useThree();

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const r = e.el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    });
    ro.observe(e.el);
    return () => ro.disconnect();
  }, [e.el]);

  const geo = useMemo(() => (size.w > 2 && size.h > 2 ? slabGeometry(size.w, size.h, e.radius, e.bevel) : null), [size.w, size.h, e.radius, e.bevel]);
  useEffect(() => () => geo?.dispose(), [geo]);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const r = e.el.getBoundingClientRect();
    const visible = r.bottom > -40 && r.top < view.height + 40 && r.width > 0 && getComputedStyle(e.el).visibility !== "hidden";
    m.visible = visible;
    m.position.set(r.left + r.width / 2 - view.width / 2, view.height / 2 - (r.top + r.height / 2), 20);
  });

  if (!geo) return null;
  return (
    <mesh ref={mesh} geometry={geo}>
      <MeshTransmissionMaterial
        buffer={buffer}
        samples={4}
        transmission={1}
        thickness={Math.min(size.w, size.h) * 0.55}
        roughness={e.frost}
        ior={1.38}
        chromaticAberration={0.9}
        anisotropicBlur={0.4}
        distortion={0}
        clearcoat={1}
        clearcoatRoughness={0.05}
        specularIntensity={1.2}
        color="#ffffff"
        background={new THREE.Color("#cfe6ff")}
        attenuationDistance={Infinity}
        backside={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Sky({ src }: { src: string }) {
  const tex = useTexture(src);
  const { size } = useThree();
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = tex.image as { width: number; height: number };
  const a = img.width / img.height;
  const w = Math.max(size.width, size.height * a);
  return (
    <mesh position={[0, 0, -200]} scale={[w, w / a, 1]}>
      <planeGeometry />
      <meshBasicMaterial map={tex} toneMapped={false} color="#9fcdf6" />
    </mesh>
  );
}

function Scene({ src, level }: { src: string; level?: MutableRefObject<number> }) {
  const [list, setList] = useState(glass.list());
  useEffect(() => glass.subscribe(() => setList(glass.list())), []);
  const fbo = useFBO({ samples: 0 });
  const skyGroup = useRef<THREE.Group>(null);
  const slabs = useRef<THREE.Group>(null);
  const { gl, scene, camera, invalidate } = useThree();
  const target = useRef({ x: 0, y: 0 });
  // draw only when something changes: scrolling, touching, resizing, new glass, or Jagora speaking
  useEffect(() => {
    let raf = 0;
    const kick = () => {
      cancelAnimationFrame(raf);
      let n = 0;
      const loop = () => {
        invalidate();
        if (++n < 30) raf = requestAnimationFrame(loop);
      };
      loop();
    };
    const move = (e: PointerEvent) => {
      target.current = { x: (e.clientX / innerWidth) * 2 - 1, y: -((e.clientY / innerHeight) * 2 - 1) };
      kick();
    };
    addEventListener("scroll", kick, { capture: true, passive: true });
    addEventListener("pointermove", move, { passive: true });
    addEventListener("resize", kick);
    const un = glass.subscribe(kick);
    const speak = setInterval(() => level && level.current > 0.02 && kick(), 120);
    kick();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", kick, { capture: true });
      removeEventListener("pointermove", move);
      removeEventListener("resize", kick);
      un();
      clearInterval(speak);
    };
  }, [invalidate, level]);
  useFrame(() => {
    // the sky leans a touch toward the finger, so the glass always has something to bend
    if (skyGroup.current) {
      const g = skyGroup.current;
      const amp = level ? Math.min(1, level.current) : 0;
      g.position.x += (target.current.x * 16 - g.position.x) * 0.15;
      g.position.y += (target.current.y * 10 - g.position.y) * 0.15;
      g.scale.setScalar(1.06 + amp * 0.02);
    }
    // render the sky alone into the shared buffer, then draw everything
    if (slabs.current) slabs.current.visible = false;
    gl.setRenderTarget(fbo);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    if (slabs.current) slabs.current.visible = true;
  }, -1);
  return (
    <>
      <group ref={skyGroup}>
        <Sky src={src} />
      </group>
      <group ref={slabs}>
        {list.map((e) => (
          <Slab key={e.id} e={e} buffer={fbo.texture} />
        ))}
      </group>
      {/* a bright studio sky for the glass to reflect: no download, drawn on the GPU */}
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#dceeff"]} />
        <Lightformer intensity={4} position={[0, 5, 2]} rotation-x={Math.PI / 2} scale={[14, 4, 1]} />
        <Lightformer intensity={2} position={[-6, 1, 1]} rotation-y={Math.PI / 2} scale={[8, 6, 1]} />
        <Lightformer intensity={2} position={[6, 1, 1]} rotation-y={-Math.PI / 2} scale={[8, 6, 1]} />
        <Lightformer intensity={1.2} position={[0, -4, 2]} rotation-x={-Math.PI / 2} scale={[14, 3, 1]} color="#bfe0ff" />
      </Environment>
    </>
  );
}

export default function GlassStage({ src = "/sky/hero-desktop.webp", level }: { src?: string; level?: MutableRefObject<number> }) {
  useEffect(() => {
    glass.setStage(true);
    return () => glass.setStage(false);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 -z-0" aria-hidden="true">
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 1000], zoom: 1, near: 0.1, far: 3000 }}
        onCreated={({ gl }) => gl.setClearColor("#8cc4f2")}
      >
        <Suspense fallback={null}>
          <Scene src={src} level={level} />
        </Suspense>
      </Canvas>
    </div>
  );
}
