/* The real Earth for the landing page: NASA Blue Marble with relief and a cloud layer, plain three.js, loaded only
   when the section comes near the screen. Drag to spin it; it turns slowly on its own and comes back to face Nigeria.
   Every frame it reports where Nigeria is on screen, so the photos can stay linked to it. */
import * as THREE from "three";

export type NgPoint = { x: number; y: number; front: number };

const NG_LAT = 9.08, NG_LON = 8.68;

export function mount(host: HTMLElement, onReady: () => void, onPoint: (p: NgPoint) => void, still: boolean) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const cv = renderer.domElement;
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y;cursor:grab";
  host.appendChild(cv);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  cam.position.set(0, 0, 4.25);
  const L = new THREE.TextureLoader();
  let loaded = 0;
  const done = () => ++loaded === 3 && onReady();
  const tex = L.load("/globe/earth.webp", done);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const bump = L.load("/globe/bump.webp", done);
  const cl = L.load("/globe/clouds.webp", done);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 96),
    new THREE.MeshPhongMaterial({ map: tex, bumpMap: bump, bumpScale: 0.025, shininess: 14, specular: new THREE.Color(0x2b4a6a) }),
  );
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.012, 72, 72),
    new THREE.MeshPhongMaterial({ color: 0xffffff, alphaMap: cl, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  earth.rotation.y = -Math.PI / 2;
  clouds.rotation.y = -Math.PI / 2;
  const g = new THREE.Group();
  g.add(earth, clouds);
  scene.add(g);

  // Nigeria: a small bright dot on the surface
  const lat = (NG_LAT * Math.PI) / 180, lon = (NG_LON * Math.PI) / 180;
  const ngLocal = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.026, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  dot.position.copy(ngLocal.clone().multiplyScalar(1.016));
  dot.lookAt(ngLocal.clone().multiplyScalar(2));
  g.add(dot);

  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(-2, 1.2, 3);
  scene.add(sun, new THREE.AmbientLight(0x9fc2ff, 0.7));

  // spin: it opens facing Nigeria (like the still picture before it), drifts slowly, and turns with a drag
  let yaw = NG_LON, pitch = NG_LAT, vel = 0, drag = false, lastX = 0, lastY = 0, idleAt = 0;
  const down = (e: PointerEvent) => {
    drag = true; lastX = e.clientX; lastY = e.clientY; vel = 0;
    cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing";
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    yaw -= dx * 0.35; pitch = Math.max(-35, Math.min(45, pitch + dy * 0.25)); vel = -dx * 0.35;
  };
  const up = () => { drag = false; idleAt = performance.now(); cv.style.cursor = "grab"; };
  cv.addEventListener("pointerdown", down);
  cv.addEventListener("pointermove", move);
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);

  const size = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(size);
  ro.observe(host);
  size();

  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(host);

  const w = new THREE.Vector3(), n = new THREE.Vector3();
  let raf = 0, last = performance.now();
  const t0 = last;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible) return;
    if (!drag) {
      if (!still) {
        vel *= Math.pow(0.04, dt);
        yaw += vel * dt * 6;
        if (now - idleAt > 2500 && Math.abs(vel) < 0.5) {
          // after a while untouched, drift back towards Nigeria so the photos stay linked
          const target = NG_LON + Math.sin(now / 4000) * 14;
          const d = ((target - yaw + 540) % 360) - 180;
          yaw += d * Math.min(1, dt * 0.6);
          pitch += (NG_LAT - pitch) * Math.min(1, dt * 0.6);
        }
      }
    }
    g.rotation.set((pitch * Math.PI) / 180, (-yaw * Math.PI) / 180, 0);
    clouds.rotation.y = -Math.PI / 2 + (now - t0) / 90000;
    renderer.render(scene, cam);
    dot.getWorldPosition(w);
    n.copy(w).normalize();
    const front = n.z; // facing the camera when > 0
    w.project(cam);
    onPoint({ x: (w.x + 1) / 2, y: (1 - w.y) / 2, front });
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    cv.removeEventListener("pointerdown", down);
    cv.removeEventListener("pointermove", move);
    cv.removeEventListener("pointerup", up);
    cv.removeEventListener("pointercancel", up);
    [tex, bump, cl].forEach((t) => t.dispose());
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
    renderer.dispose();
    renderer.forceContextLoss();
    cv.remove();
  };
}
