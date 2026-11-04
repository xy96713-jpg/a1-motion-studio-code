// Extruded real-font title for HyperFrames (Three.js). Glyph outlines come from glyphs.json (font
// units, y up). Each glyph flips up in turn, the group turns slowly, then swings away and fades.
// Driven by an accessor tween on the shared GSAP timeline, so every seek renders the exact frame.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

export function mountTitle3D({ canvas, glyphs, cfg, tl }) {
  const W = 1920, H = 1080;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
  key.position.set(-3, 4, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb4c8, 0.8);
  rim.position.set(5, -2, -3);
  scene.add(rim);

  // grunge (the reference's 3D date): a bone face with dark ink speckle, from a seeded hash so every
  // render is the same; mapped in font units across the face of each glyph
  let map = null;
  if (cfg.grunge) {
    const N = 512, data = new Uint8Array(N * N * 4);
    const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
    const smooth = (x, y, s) => { const xi = Math.floor(x / s), yi = Math.floor(y / s), fx = x / s - xi, fy = y / s - yi; const a = hash(xi, yi), b = hash(xi + 1, yi), c2 = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * fx + (c2 - a) * fy + (a - b - c2 + d) * fx * fy; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = smooth(x, y, 48) * 0.5 + smooth(x, y, 12) * 0.3 + smooth(x, y, 3) * 0.2;
      const ink = n > (cfg.grunge.threshold ?? 0.66) ? (cfg.grunge.ink ?? 0.45) : 1 - (1 - n) * 0.12;
      const i = (y * N + x) * 4; data[i] = data[i + 1] = data[i + 2] = Math.round(255 * ink); data[i + 3] = 255;
    }
    map = new THREE.DataTexture(data, N, N); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
    map.repeat.set(1 / (cfg.grunge.scale || 420), 1 / (cfg.grunge.scale || 420)); map.needsUpdate = true;
  }
  const face = new THREE.MeshStandardMaterial({ color: cfg.face || 0xece2c8, metalness: cfg.metalness ?? 0.55, roughness: cfg.roughness ?? 0.38, ...(map ? { map } : {}) });
  const side = new THREE.MeshStandardMaterial({ color: cfg.side || 0x5e5649, metalness: 0.35, roughness: 0.6 });

  // Font units -> world units: one em = cfg.em world units; condense horizontally like a narrow cut.
  const em = cfg.em || 1.7;
  const k = em / glyphs.unitsPerEm;
  const squeeze = cfg.condense || 0.62;
  const group = new THREE.Group();
  let x = 0;
  const pivots = [];
  for (const g of glyphs.glyphs) {
    const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${g.d}" fill="#000" fill-rule="nonzero"/></svg>`);
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: (cfg.depth || 0.22) / k, bevelEnabled: true, bevelThickness: 6, bevelSize: 4, bevelSegments: 2, curveSegments: 6 });
    geo.scale(k * squeeze, k, k);
    const mesh = new THREE.Mesh(geo, [face, side]);
    // Each glyph hinges on its own baseline so it can flip up into place.
    const pivot = new THREE.Group();
    pivot.position.x = x;
    pivot.add(mesh);
    group.add(pivot);
    pivots.push(pivot);
    x += g.advance * k * squeeze * (cfg.tracking || 0.94);
  }
  const width = x;
  group.children.forEach((p) => (p.position.x -= width / 2));
  group.position.y = -em * (cfg.lift ?? 0.38);
  scene.add(group);

  const clamp = (v) => Math.min(1, Math.max(0, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const c = cfg.cues || {};
  function renderAt(t) {
    pivots.forEach((p, i) => {
      const r = ease(clamp((t - (c.reveal ?? 0.1) - i * (c.stagger ?? 0.16)) / 0.45));
      p.rotation.x = (1 - r) * -Math.PI / 2;
      p.visible = r > 0;
    });
    const out = ease(clamp((t - (c.swing ?? 2.75)) / (c.swingDur ?? 1.4)));
    group.rotation.y = (cfg.yaw ?? -0.32) + 0.12 * Math.min(t, c.swing ?? 2.75) / (c.swing ?? 2.75) - out * 0.75;
    group.rotation.x = cfg.pitch ?? 0.08;
    group.position.x = -out * 2.2;
    const fade = 1 - clamp((t - (c.fade ?? 3.9)) / 0.35);
    // Fade the whole layer, not the materials: transparent materials expose the glyphs' inner faces.
    canvas.style.opacity = String(fade);
    const push = Math.min(t, c.swing ?? 2.75);
    camera.position.set(0, 0.15, (cfg.distance ?? 9.2) - push * (cfg.pushPerSec ?? 0.22));
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    // the words it draws are registered with their box on the frame (the visible glyphs' corners projected), as every
    // line of type is: the line's geometry checks read them (cardgeometry.mjs PAGE_GEOMETRY window.__drawn3d)
    const box = new THREE.Box3(); group.updateMatrixWorld(true);
    pivots.forEach((p) => { if (p.visible) box.expandByObject(p); });
    let reg = (window.__drawn3d = window.__drawn3d || []).find((x) => x.canvas === canvas);
    if (!reg) { reg = { canvas, text: String(cfg.text || ''), box: null, size: 0 }; window.__drawn3d.push(reg); }
    if (box.isEmpty()) { reg.box = null; } else {
      const pts = []; for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { const v = new THREE.Vector3(x, y, z).project(camera); pts.push([(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]); }
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      reg.box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; reg.size = (reg.box.y1 - reg.box.y0) / 0.9;
    }
  }
  const proxy = { _t: 0, get t() { return this._t; }, set t(v) { this._t = v; renderAt(v); } };
  tl.fromTo(proxy, { t: 0 }, { t: cfg.duration, duration: cfg.duration, ease: 'none' }, 0);
  window.addEventListener('hf-seek', (e) => renderAt(e.detail.time));
  renderAt(0);
}
