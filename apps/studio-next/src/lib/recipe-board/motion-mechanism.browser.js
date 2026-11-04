// Mechanism diagram in 3D (Three.js) for the mechanism-3d card: parts on a ground plane — chips (grids of
// compute units) and nodes (labelled blocks: a model, an answer, a reward…) — joined by links (bundles of
// lanes, any direction), and steps that change the same scene one by one while a step list on the left
// grows. A schematic, not a product picture: every readable word is HTML from the shot's text, numbers
// only as the narration gives them. Every frame is a function of time (seek-safe); a still renders the
// last state. Steps marked done already happened in an earlier shot of the same diagram.
//
// spec: { parts: [ { id, kind: 'chip', label?, units?, pos?: [x, z] }
//                | { id, kind: 'node', label, pos?: [x, z] }
//                | { id, kind: 'link', from, to, lanes?, oneWay? } ],
//         steps: [ { do, target?, label, tag?, at?, done? } ] }
//   do: show · cut (keep) · pick (count) · flow · drop (a node is struck out) · grow (value 0–1, a bar on a
//       node) · gauge (value 0–1)
import * as THREE from 'three';

const clamp = (v) => Math.min(1, Math.max(0, v));
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const mix = (a, b, k) => a + (b - a) * k;
const fract = (v) => v - Math.floor(v);
const esc = (s) => String(s ?? '').replace(/[<>&]/g, '');

const SIZE = { chip: [3.4, 3.0], node: [3.2, 2.0] };   // nodes big enough to read as blocks, not chips of paper
const GRID = 4.6;   // one pos unit in world units

export function mountMechanism({ root, spec, theme = {}, duration = 6, offset = 0, tl = null, still = false }) {
  const W = root.clientWidth || 1920, H = root.clientHeight || 1080;
  const ink = theme.fg || '#1d1f22', accent = theme.accent || '#d0342c', muted = theme.muted || '#8a8f96', font = theme.font || 'sans-serif';
  root.style.position = root.style.position || 'absolute';
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: W + 'px', height: H + 'px' });
  const overlay = document.createElement('div');
  Object.assign(overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', fontFamily: font });
  root.append(canvas, overlay);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 400);
  // the diagram sits in the right part of the frame; the left part holds the step list
  const listW = Math.round(W * 0.3);
  camera.setViewOffset(W, H, -Math.round(listW * 0.46), 0, W, H);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-4, 9, 6);
  scene.add(key);

  const colInk = new THREE.Color(ink), colAccent = new THREE.Color(accent), colMuted = new THREE.Color(muted);
  const colUnit = new THREE.Color(theme.unit || '#9aa0a7'), colNode = new THREE.Color(theme.node || '#3b3c3f');   // charcoal blocks read against the grey paper (light grey ones vanished)
  const parts = spec.parts || [];
  const blocks = parts.filter((p) => p.kind === 'chip' || p.kind === 'node');
  const links = parts.filter((p) => p.kind === 'link');

  // Layout: given positions (grid units), else one row with room for the links between.
  const byId = {};
  const anyPos = blocks.some((b) => Array.isArray(b.pos));
  let rowX = 0;
  const placed = blocks.map((b) => {
    const [w, d] = SIZE[b.kind];
    let x, z;
    if (anyPos) { [x, z] = (b.pos || [0, 0]).map((v) => v * GRID); }
    else { x = rowX + w / 2; z = 0; rowX += w + 3.2; }
    return { b, x, z, w, d };
  });
  if (!anyPos) placed.forEach((p) => (p.x -= (rowX - 3.2) / 2));
  // blocks never touch: two that overlap or sit closer than a gap (room for an arrow and its tag) are
  // pushed apart along the axis where they overlap least (the writer's grid positions can be tight)
  const GAP = 1.7;
  for (let it = 0; it < 40; it++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      const ox = (a.w + b.w) / 2 + GAP - Math.abs(b.x - a.x), oz = (a.d + b.d) / 2 + GAP - Math.abs(b.z - a.z);
      if (ox <= 0 || oz <= 0) continue;
      moved = true;
      if (ox < oz) { const s = (b.x >= a.x ? 1 : -1) * ox / 2; a.x -= s; b.x += s; }
      else { const s = (b.z >= a.z ? 1 : -1) * oz / 2; a.z -= s; b.z += s; }
    }
    if (!moved) break;
  }
  const minX = Math.min(...placed.map((p) => p.x - p.w / 2)), maxX = Math.max(...placed.map((p) => p.x + p.w / 2));
  const minZ = Math.min(...placed.map((p) => p.z - p.d / 2)), maxZ = Math.max(...placed.map((p) => p.z + p.d / 2));
  const cx0 = (minX + maxX) / 2, cz0 = (minZ + maxZ) / 2;
  placed.forEach((p) => { p.x -= cx0; p.z -= cz0; });
  const spanX = maxX - minX, spanZ = maxZ - minZ;

  placed.forEach(({ b, x, z, w, d }, i) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const isChip = b.kind === 'chip';
    const slabMat = new THREE.MeshStandardMaterial({ color: isChip ? colInk : colNode, roughness: 0.55, metalness: isChip ? 0.2 : 0, transparent: true });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, isChip ? 0.16 : 0.62, d), slabMat);
    slab.position.y = isChip ? 0 : 0.31;
    g.add(slab);
    const edgeMat = new THREE.LineBasicMaterial({ color: isChip ? colMuted : colInk, transparent: true });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), edgeMat);
    edges.position.copy(slab.position);
    g.add(edges);
    const entry = { id: b.id, kind: b.kind, group: g, slabMat, edgeMat, label: b.label || '', x, z, w, d };
    if (isChip) {
      const n = Math.max(1, Math.min(400, b.units || 132));
      const cols = Math.ceil(Math.sqrt(n * (w / d))), rows = Math.ceil(n / cols);
      const cell = Math.min((w - 0.5) / cols, (d - 0.5) / rows);
      const units = new THREE.InstancedMesh(new THREE.BoxGeometry(cell * 0.72, 0.07, cell * 0.72), new THREE.MeshStandardMaterial({ roughness: 0.5 }), n);
      units.frustumCulled = false;
      const home = [];
      for (let k = 0; k < n; k++) { const cx = k % cols, cz = Math.floor(k / cols); home.push([(cx - (cols - 1) / 2) * cell, 0.12, (cz - (rows - 1) / 2) * cell, cx, cz]); }
      // units picked first: the column nearest the diagram's centre (where the data leaves the chip)
      const side = x <= 0 ? 1 : -1;
      entry.order = home.map((h, k) => k).sort((a2, b2) => side * (home[b2][3] - home[a2][3]) || home[a2][4] - home[b2][4]);
      Object.assign(entry, { units, home, n });
      g.add(units);
    } else {
      // a bar on the node for `grow` (thinking time, length…), hidden until grown
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshStandardMaterial({ color: colAccent, roughness: 0.5 }));
      bar.visible = false;
      g.add(bar);
      entry.bar = bar;
    }
    scene.add(g);
    byId[b.id] = entry;
  });

  links.forEach((l) => {
    const a = byId[l.from], b = byId[l.to];
    if (!a || !b) return;
    const both = a.kind === 'chip' && b.kind === 'chip';
    const lanes = Math.max(1, Math.min(16, l.lanes || (both ? 10 : 3)));
    // endpoints: where the line between the centres leaves each block
    const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz) || 1, ux = dx / dist, uz = dz / dist;
    const out = (p) => Math.min(Math.abs(ux) > 1e-6 ? p.w / 2 / Math.abs(ux) : Infinity, Math.abs(uz) > 1e-6 ? p.d / 2 / Math.abs(uz) : Infinity) + 0.15;
    const p0 = [a.x + ux * out(a), a.z + uz * out(a)], p1 = [b.x - ux * out(b), b.z - uz * out(b)];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const nx = -uz, nz = ux;   // across the lanes
    const width = Math.min(a.kind === 'chip' ? a.d : a.d * 0.8, b.kind === 'chip' ? b.d : b.d * 0.8) * 0.7;
    const rot = -Math.atan2(uz, ux);
    const halves = [];
    const mat = new THREE.MeshStandardMaterial({ color: colMuted, roughness: 0.6 });
    for (let k = 0; k < lanes; k++) {
      const off = lanes > 1 ? (k - (lanes - 1) / 2) * (width / lanes) : 0;
      for (const s of [0, 1]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(len / 2, 0.05, both ? 0.07 : 0.1), mat.clone());
        m.rotation.y = rot;
        scene.add(m);
        halves.push({ m, s, off });
      }
    }
    // a small arrowhead at the far end of a one-way link
    const oneWay = l.oneWay ?? !both;
    let head = null;
    if (oneWay) {
      head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 12), new THREE.MeshStandardMaterial({ color: colMuted }));
      head.rotation.z = -Math.PI / 2;   // the cone points along +x in its pivot
      const pivot = new THREE.Group();
      pivot.rotation.y = rot;           // the pivot turns +x onto the link direction
      pivot.position.set(p1[0] - ux * 0.2, 0.08, p1[1] - uz * 0.2);
      pivot.add(head); scene.add(pivot);
    }
    // data in flight: thin dashes on a few lanes (a packet on every lane reads as noise, not direction)
    const flow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }), lanes * 3);
    flow.frustumCulled = false;   // instances move every frame; a bounds check from the first frame would hide them
    scene.add(flow);
    // a cut is marked where it happens: a red slash across the middle of the link
    const cutMark = new THREE.Group();
    for (const a2 of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.95, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: colAccent }));
      bar.rotation.y = rot + Math.PI / 2 + a2 * 0.5;
      cutMark.add(bar);
    }
    cutMark.position.set((p0[0] + p1[0]) / 2, 0.12, (p0[1] + p1[1]) / 2);
    cutMark.visible = false;
    scene.add(cutMark);
    byId[l.id] = { id: l.id, kind: 'link', from: l.from, to: l.to, halves, lanes, p0, p1, len, ux, uz, nx, nz, flow, oneWay, head, rot, cutMark, mid: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2] };
  });

  // Steps: evenly spread over the shot unless timed; each one changes the scene over 0.6 s.
  const live = (spec.steps || []).filter((s) => !s.done);
  const steps = (spec.steps || []).map((s) => {
    if (s.done) return { ...s, at: -1 };
    const i = live.indexOf(s);
    return { ...s, at: s.at ?? mix(0.25, duration * 0.78, live.length > 1 ? i / (live.length - 1) : 0.15) };
  });
  const stepT = (t, s) => (s.done ? 1 : easeOut((t - s.at) / 0.6));
  const firstBlock = Object.values(byId).find((p) => p.kind !== 'link');
  const targetOf = (s, kinds) => byId[s.target] || Object.values(byId).find((p) => kinds.includes(p.kind));

  // Overlay: the step list, tags on the parts, a gauge.
  const list = document.createElement('div');
  Object.assign(list.style, { position: 'absolute', left: '0', top: Math.round(H * 0.06) + 'px', width: listW + 'px' });
  overlay.appendChild(list);
  // a shot that continues an earlier diagram keeps only the last earlier step as context, numbered 1
  const base = Math.max(0, steps.filter((s) => s.done).length - 1);
  const rows = steps.map((s, i) => {
    const r = document.createElement('div');
    Object.assign(r.style, { display: 'flex', gap: '0.5em', alignItems: 'baseline', margin: '0 0 0.55em 0', fontSize: Math.round(H * (steps.length > 5 ? 0.04 : 0.045)) + 'px', lineHeight: '1.25', color: ink, opacity: '0', textWrap: 'balance' });
    r.innerHTML = `<span style="font-family:serif;font-style:italic;font-weight:700;font-size:1.25em;min-width:1.1em">${i - base + 1}</span><span>${esc(s.label)}</span>`;
    list.appendChild(r);
    return r;
  });
  const allTags = [];   // in order: part names first, then step tags (later ones give way)
  const tagEl = (text, big) => {
    const e = document.createElement('div');
    allTags.push(e);
    Object.assign(e.style, { position: 'absolute', transform: 'translate(-50%,-100%)', whiteSpace: 'nowrap', fontSize: Math.round(H * (big ? 0.05 : 0.04)) + 'px', fontWeight: '700', color: ink, opacity: '0' });
    e.textContent = text;
    overlay.appendChild(e);
    return e;
  };
  Object.values(byId).filter((p) => p.kind !== 'link' && p.label).forEach((p) => {
    p.tag = tagEl(p.label, p.kind === 'node');
    // a node's name is printed on its top face (white on charcoal), so block and name read as one
    if (p.kind === 'node') Object.assign(p.tag.style, { color: '#f4f2ee', transform: 'translate(-50%,-50%)', fontSize: Math.round(H * ([...p.label].length > 4 ? 0.027 : 0.036)) + 'px' });
  });
  steps.forEach((s) => { if (s.tag) { s.tagEl = tagEl(s.tag); s.tagEl.style.color = accent; } });
  const gaugeStep = steps.find((s) => s.do === 'gauge');
  let gauge = null;
  if (gaugeStep) {
    gauge = document.createElement('div');
    Object.assign(gauge.style, { position: 'absolute', left: Math.round(W * 0.36) + 'px', right: Math.round(W * 0.08) + 'px', bottom: Math.round(H * 0.2) + 'px', opacity: '0' });
    gauge.innerHTML = `<div style="font-size:${Math.round(H * 0.032)}px;color:${ink};margin-bottom:0.35em">${esc(gaugeStep.label)}</div><div style="height:${Math.round(H * 0.022)}px;background:${muted}55;border-radius:3px;overflow:hidden"><div class="fill" style="height:100%;width:0;background:${accent}"></div></div>`;
    overlay.appendChild(gauge);
  }

  const v = new THREE.Vector3();
  const place = (el, x, y, z) => { v.set(x, y, z).project(camera); el.style.left = ((v.x + 1) / 2 * W) + 'px'; el.style.top = ((1 - v.y) / 2 * H) + 'px'; };
  const mtx = new THREE.Matrix4();
  // fit: the diagram's extent decides the distance (wide rows and deep rings both stay in frame)
  // (a small diagram is brought closer too: three nodes in a corner read as an afterthought)
  const fit = Math.max(0.62, spanX / 8.9, spanZ / 5.2) * 1.07;

  function renderAt(t) {
    const push = clamp(t / Math.max(1, duration));   // one slow push for the whole shot (CAMERA.md)
    // a steeper look down: the diagram's depth opens up on screen instead of a thin strip
    camera.position.set(0, mix(9.6, 9.0, push) * fit, mix(7.4, 6.8, push) * fit);
    camera.lookAt(0, -0.6, 0.6);   // the diagram sits higher, nearer its title
    camera.updateMatrixWorld();   // the tags are projected before the render would update it (a still renders once)

    const show = steps.filter((s) => s.do === 'show').reduce((m, s) => Math.max(m, stepT(t, s)), steps.some((s) => s.do === 'show') ? 0 : 1);
    for (const p of Object.values(byId)) {
      if (p.kind === 'link') continue;
      p.group.scale.setScalar(mix(0.92, 1, show));
      p.group.visible = show > 0.01;
      // drop: the block is struck out (fades; its tag is crossed through)
      const drop = steps.filter((s) => s.do === 'drop' && s.target === p.id).reduce((m, s) => Math.max(m, stepT(t, s)), 0);
      p.slabMat.opacity = 1 - 0.75 * drop; p.edgeMat.opacity = 1 - 0.6 * drop;
      if (p.tag) { if (p.kind === 'node') place(p.tag, p.x, 0.64, p.z); else place(p.tag, p.x, 0.2, p.z - p.d / 2 - 0.25); p.tag.style.opacity = String(show * (1 - 0.55 * drop)); p.tag.style.textDecoration = drop > 0.5 ? `line-through ${accent} 4px` : 'none'; if (p.kind === 'node') p.tag.style.color = drop > 0.5 ? ink : '#f4f2ee'; }
      if (p.kind === 'chip') {
        const picked = new Map();
        steps.filter((s) => s.do === 'pick' && targetOf(s, ['chip']) === p).forEach((s) => {
          s.count && p.order.slice(0, s.count).forEach((u, j) => picked.set(u, Math.max(picked.get(u) || 0, s.done ? 1 : easeOut((t - s.at - j * 0.02) / 0.5))));
          if (s.tagEl) { s.tagEl.style.opacity = String(stepT(t, s)); place(s.tagEl, p.x, 0.5, p.z + p.d / 2 + 0.55); }
        });
        p.home.forEach(([x, y, z], k) => {
          const a = picked.get(k) || 0;
          mtx.makeTranslation(x, y + a * 0.22, z);
          p.units.setMatrixAt(k, mtx);
          p.units.setColorAt(k, colUnit.clone().lerp(colAccent, a));
        });
        p.units.instanceMatrix.needsUpdate = true;
        if (p.units.instanceColor) p.units.instanceColor.needsUpdate = true;
      } else {
        // grow: a bar rising from the node (value 0–1 of its full height)
        const gs = steps.filter((s) => s.do === 'grow' && targetOf(s, ['node']) === p);
        const g = gs.reduce((m, s) => Math.max(m, (s.value ?? 1) * (s.done ? 1 : easeOut((t - s.at) / 1.4))), 0);
        p.bar.visible = g > 0.01;
        p.bar.scale.y = Math.max(0.01, g * 3.2);
        p.bar.position.set(p.w / 2 - 0.4, 0.42 + g * 1.6, 0);
        gs.forEach((s) => { if (s.tagEl) { s.tagEl.style.opacity = String(stepT(t, s)); place(s.tagEl, p.x + p.w / 2 - 0.4, 0.5 + g * 3.2 + 0.3, p.z); } });
      }
    }
    for (const p of Object.values(byId)) {
      if (p.kind !== 'link') continue;
      const mine = (s) => s.target === p.id || (!s.target && (s.do === 'cut' || s.do === 'flow'));
      // the link's state follows its steps in order: a cut shortens and darkens it, a flow joins and lights it
      let lenState = 1, litState = 0, cutState = 0;
      for (const s of steps.filter((x) => (x.do === 'cut' || x.do === 'flow') && mine(x)).sort((a2, b2) => a2.at - b2.at)) {
        const k = stepT(t, s);
        if (s.do === 'cut') { lenState = mix(lenState, s.keep ?? 0.3, k); litState = mix(litState, 0, k); cutState = mix(cutState, 1, k); }
        else { lenState = mix(lenState, 1, k); litState = mix(litState, 1, k); cutState = mix(cutState, 0, k); }
      }
      const restore = litState;
      // a link to or from a struck-out block goes dark with it
      const dropped = steps.filter((s) => s.do === 'drop' && (s.target === p.from || s.target === p.to)).reduce((m, s) => Math.max(m, stepT(t, s)), 0);
      const lit = restore * (1 - dropped);
      const len = lenState;
      p.halves.forEach(({ m, s, off }) => {
        m.scale.x = Math.max(0.02, len);
        const along = s ? p.len - p.len / 4 * len : p.len / 4 * len;
        m.position.set(p.p0[0] + p.ux * along + p.nx * off, 0.06, p.p0[1] + p.uz * along + p.nz * off);
        m.material.color.copy(colMuted).lerp(colInk, 0.4).lerp(colAccent, lit).lerp(new THREE.Color('#d9d9d6'), dropped * 0.7);
        m.visible = show > 0.01;
      });
      p.cutMark.visible = cutState > 0.02 && show > 0.01;
      p.cutMark.scale.setScalar(Math.max(0.02, cutState));
      if (p.head) { p.head.material.color.copy(colMuted).lerp(colInk, 0.4).lerp(colAccent, lit).lerp(new THREE.Color('#d9d9d6'), dropped * 0.7); p.head.visible = show > 0.01; }
      // data moving along the link once it carries flow (both ways between chips, one way otherwise)
      let k = 0;
      for (let lane = 0; lane < p.lanes; lane++) for (let j = 0; j < 3; j++) {
        const on = lit > 0.5 && (p.lanes <= 4 || lane % 3 === 1) && j < 2;
        const ph = fract(t * 0.55 + j / 3 + lane * 0.137);
        const dir = p.oneWay ? 1 : lane % 2 ? 1 : -1;
        const along = (dir > 0 ? ph : 1 - ph) * p.len;
        const lo = p.halves[lane * 2]?.off ?? 0;
        mtx.makeRotationY(p.rot).setPosition(p.p0[0] + p.ux * along + p.nx * lo, on ? 0.14 : -50, p.p0[1] + p.uz * along + p.nz * lo);
        p.flow.setMatrixAt(k++, mtx);
      }
      p.flow.instanceMatrix.needsUpdate = true;
      // a link's tag: only the latest of its steps that has happened is shown
      const tagged = steps.filter((s) => (s.do === 'cut' || s.do === 'flow') && mine(s) && s.tagEl);
      const latest = tagged.filter((s) => s.done || t >= s.at).sort((a2, b2) => b2.at - a2.at)[0];
      tagged.forEach((s) => { place(s.tagEl, p.mid[0] - p.nx * 0.6, 0.3, p.mid[1] - p.nz * 0.6 - 0.3); s.tagEl.style.opacity = String(s === latest ? stepT(t, s) : 0); });
    }
    // tags of steps on nothing in particular (show / drop) sit by their target or the first block; only the
    // latest one that has happened is up, and never one carried over from an earlier shot (done)
    const loose = steps.filter((s) => (s.do === 'show' || s.do === 'drop') && s.tagEl);
    const lastLoose = loose.filter((s) => !s.done && t >= s.at).sort((a2, b2) => b2.at - a2.at)[0];
    loose.forEach((s) => { const p = byId[s.target] || firstBlock; if (p) { place(s.tagEl, p.x, 0.6, p.z + p.d / 2 + 0.6); s.tagEl.style.opacity = String(s === lastLoose ? stepT(t, s) : 0); } });
    // step list: at most 4 rows (older ones fold away); the current one in the accent colour
    const cur = steps.reduce((c, s, i) => (t >= s.at ? i : c), -1);
    const shown = rows.map((_, i) => (steps[i].done || t >= steps[i].at ? i : -1)).filter((i) => i >= 0);
    const keep = new Set(shown.slice(-6));   // every step of this shot stays listed (numbers never start mid-way)
    rows.forEach((r, i) => { const k = steps[i].done ? 1 : easeOut((t - steps[i].at) / 0.4); r.style.display = i >= base && (keep.has(i) || !shown.includes(i)) ? 'flex' : 'none'; r.style.opacity = String(k); r.style.color = i === cur && !steps[i].done ? accent : ink; r.style.transform = `translateX(${(1 - k) * -24}px)`; });
    if (gauge) { const g = stepT(t, gaugeStep); gauge.style.opacity = String(g); gauge.querySelector('.fill').style.width = `${(gaugeStep.value ?? 0.9) * 100 * (gaugeStep.done ? 1 : easeOut((t - gaugeStep.at - 0.2) / 1.0))}%`; }
    // labels never sit on each other: a tag that overlaps one placed before it moves down a line (3 tries)
    const taken = [];
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    for (const e of allTags) {
      if (+e.style.opacity < 0.05) continue;
      let r = e.getBoundingClientRect();
      for (let k = 0; k < 3 && taken.some((q) => hit(r, q)); k++) { e.style.top = (parseFloat(e.style.top) + r.height * 1.05) + 'px'; r = e.getBoundingClientRect(); }
      taken.push(r);
    }
    renderer.render(scene, camera);
  }

  if (tl) {
    const proxy = { _t: 0, get t() { return this._t; }, set t(x) { this._t = x; renderAt(x); } };
    tl.fromTo(proxy, { t: 0 }, { t: duration, duration, ease: 'none' }, offset);
  }
  renderAt(still ? duration : 0);
  return { renderAt };
}
