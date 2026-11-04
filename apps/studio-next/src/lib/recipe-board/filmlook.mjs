// The film's look sheet: one set of colours, type roles, texture, medium and 3D material for every part of a film —
// the segments (segment.mjs), the continuous diagrams (chapter.mjs), the 3D plates (stage.mjs), the medium — so a cut
// from a clipping to a chip scene to a figure stays in one world (the user, 2026-10-20: 风格乱七八糟, 镜头连不起来).
// One source only: the film's style (project.json style -> routing/styles.json: colours, texture, the 3D's material, the
// medium; the cards, the chapters and the 3D read the same sheet, CONVERGE-20261026 conflict 1). Older projects name a
// world instead (project.world -> worlds/<id>.json `look`, see worlds/LOOK.md). A film with neither gets a neutral
// fallback and `picked: false`: it is shown as key frames, not as a finished film (the user's rule: pick the look first).
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths, loadProject } from './store.mjs';

// the neutral fallback before a world is picked (never a film's look by itself)
export const HOUSE = {
  paper: '#e9e6df', ink: '#141210', dim: '#6b6862', accent: '#d4261c', second: null, ground: 'light',
  serif: "'A1 Serif Heavy'", num: "'DIN Condensed','A1 Serif Heavy'", sans: "'PingFang SC','Hiragino Sans GB',sans-serif",
  micro: "'Songti SC',serif", groundFace: "'A1 Sans Heavy','PingFang SC',sans-serif", display: "'A1 Sans Heavy','PingFang SC',sans-serif",
  texture: ['grain'], medium: { kind: 'none' }, print: null, subtitle: 'ink',
  material3d: { ground: '#e9e6df', body: '#2a2a2a', unit: '#bdbdbd', emissive: null, metal: 0, roughness: 0.9, light: 'overcast' },
};
const HEX = /^#[0-9a-f]{6}$/i;
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

export function readWorld(cfg, worldId) {
  if (!worldId) return null;
  const f = path.join(cfg.dataDir, 'worlds', `${worldId}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

// the look of a world definition (worlds/<id>.json), filled out with the fallback where the world is silent
export function lookOf(world) {
  const w = world?.look || {}, pal = w.palette || {}, ty = w.type || {};
  const L = { ...HOUSE };
  for (const k of ['paper', 'ink', 'dim', 'accent', 'second']) if (HEX.test(pal[k] || '')) L[k] = pal[k];
  if (pal.ground) L.ground = pal.ground;
  for (const [k, to] of [['serif', 'serif'], ['num', 'num'], ['micro', 'micro'], ['ground', 'groundFace'], ['display', 'display']]) if (ty[k]) L[to] = ty[k];
  if (Array.isArray(w.texture)) L.texture = w.texture;
  if (w.medium) { L.medium = w.medium; L.print = w.medium.kind === 'print' ? w.medium.preset || 'riso' : null; }
  if (w.material3d) L.material3d = { ...HOUSE.material3d, ...w.material3d };
  if (w.subtitle) L.subtitle = w.subtitle;
  return L;
}

// a style of routing/styles.json as a look sheet (pure, tested): its tokens are the palette, its texture the grain and
// the vignette, its material3d and medium as they are; the faces stay the house's (house.mjs letterRoles by style)
export function lookOfStyle(id, st) {
  const t = st.tokens || {}, L = { ...HOUSE };
  for (const [k, from] of [['paper', 'paper'], ['ink', 'ink'], ['accent', 'accent']]) if (HEX.test(t[from] || '')) L[k] = t[from];
  L.dim = mixHex(L.paper, L.ink, 0.55); L.second = HEX.test(t.brand || '') && t.brand !== L.ink ? t.brand : null;
  if (t.ground) L.ground = t.ground;
  if (st.medium) { L.medium = st.medium; L.print = st.medium.kind === 'print' ? st.medium.preset || 'riso' : null; }
  // (the world's texture words: the style's grain amount says grain; its medium says the print's dots or the tube's lines)
  L.texture = [(st.texture?.grain ?? 0) > 0 && 'grain', L.medium.kind === 'print' && 'halftone', L.medium.kind === 'tube' && 'scanlines'].filter(Boolean);
  if (st.material3d) L.material3d = { ...HOUSE.material3d, ...st.material3d };
  L.subtitle = L.ground === 'dark' ? 'paper' : 'ink';
  // how the world sets real photographs (filmworld: color | mono | duotone), as the user picked it on the look sheet
  // (suez-evergiven-blind 2026-10-27: its world said mono and the refloated ship came in full turquoise)
  L.photo = ['color', 'mono', 'duotone'].includes(st.world?.photo) ? st.world.photo : null;
  return L;
}
const mixHex = (a, b, k) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - k) + parseInt(b.slice(1 + i, 3 + i), 16) * k).toString(16).padStart(2, '0')).join('');
// (a film's own world, film:<id>: projects/<id>/style.json, filmworld.mjs)
export const readStyle = (cfg, styleId) => {
  if (!styleId) return null;
  if (String(styleId).startsWith('film:')) { const [film, dir] = styleId.slice(5).split('/'); try { const st = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'projects', film, 'style.json'), 'utf8')); return dir ? st.directions?.[dir] || null : st; } catch { return null; } }   // (film:<id>/<dir>: one of its directions)
  try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'styles.json'), 'utf8')).styles?.[styleId] || null; } catch { return null; }
};
// what the image model is told the film looks like (keyframes): the style's way of painting, or the older world's
export function filmWorld(cfg, id) {
  let project = {};
  try { project = loadProject(cfg, id) || {}; } catch { /* sandbox */ }
  const st = readStyle(cfg, project.style);
  return st ? { id: project.style, title: st.title, prompt: st.art, refs: [] } : readWorld(cfg, project.world);
}

// the card tokens for found photos in a film made on a style (its world's photo: mono | duotone | original), merged over
// the card theme's own at render (render.mjs, motion.mjs): the style's cards share a theme family that cannot know it
export function filmPhotoTokens(cfg, id) {
  let project = {};
  try { project = loadProject(cfg, id) || {}; } catch { return {}; }
  const ph = readStyle(cfg, project.style)?.world?.photo;
  return ph === 'mono' ? { photoMono: true } : ph === 'duotone' ? { photoMono: true, photoTone: 'duotone' } : ph === 'color' ? { photoMono: false } : {};
}
export function filmLook(cfg, id) {
  let project = {};
  try { project = loadProject(cfg, id) || {}; } catch { /* sandbox */ }
  const st = readStyle(cfg, project.style);
  if (st) { const L = lookOfStyle(project.style, st); return { ...L, picked: true, world: project.style, from: 'style', marker: rgba(L.accent, 0.42), palette: { bg: L.paper, ink: L.ink, accent: L.accent } }; }
  const world = readWorld(cfg, project.world);
  const L = world?.look ? lookOf(world) : { ...HOUSE };
  L.picked = !!world?.look;
  L.world = world?.look ? world.id : null;
  L.from = world?.look ? 'world' : 'fallback';
  L.marker = rgba(L.accent, 0.42);
  // the palette as the continuous diagrams and the 3D plates take it
  L.palette = { bg: L.paper, ink: L.ink, accent: L.accent };
  return L;
}
// (projectPaths kept for callers that resolve a film's folder alongside its look)
export { projectPaths };
