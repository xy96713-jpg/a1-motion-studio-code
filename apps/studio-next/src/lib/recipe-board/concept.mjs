// Concept: before any card is dressed, the film gets a visual world (DESIGN-method.md). For each world in
// worlds/*.json the image model draws style frames of the film's key shots (the opening title, a piece of
// evidence, a presenter overlay, a diagram), with the user's taste pins and the shot's real material
// attached. The user picks one world; the project's theme becomes that world's theme. Style frames are
// design sketches (SYSTEM_MAP: a full-frame generation with text is a sketch only); the film is built by
// the world's kit (world-terminal.mjs …) from real material and code type.
// Until a world is picked the line runs on the project's theme (gates do not stop the line).
import fs from 'node:fs';
import path from 'node:path';
import { loadShots, projectPaths, sourcePath } from './store.mjs';
import { generate } from './sketch.mjs';

export const KEY_CARDS = [
  ['title', ['title-hero-over-photo', 'title-word-broll']],
  ['evidence', ['screen-full', 'article-highlight-dark', 'article-highlight-light', 'stamp-over-evidence']],
  ['overlay', ['presenter-side-card', 'poster-pair', 'product-side-card', 'presenter-tags']],
  ['diagram', ['mechanism-3d', 'concept-flow', 'concept-steps-hero', 'data-bar-chart', 'paper-collage-figures', 'stat-sheet']],
];
const FRAME = {
  title: 'Opening title. The big words are the hero. The attached photo is the real place of this shot; show it inside the world (framed, printed, on a screen).',
  evidence: 'A real piece of evidence (the attached capture is the real page or picture); show it inside the world with its key line highlighted, and the key words big.',
  overlay: 'The presenter (attached photo: keep this man, his face, pose and room exactly as they are, do not redraw him) talks to camera; the world\'s graphics sit beside him on one side, never over his face.',
  diagram: 'An explanatory diagram of what the narrator says, drawn as a clear diagram inside the world.',
  // the moments the user named (2026-10-20): each world drawn at the film's typical moments, so a world is picked
  // by how it handles each kind of moment, not by one pretty title
  number: 'A shock number: the figure is the hero of the frame, shown as a physical thing of this world (a counter, a printed figure, a display) with its unit and one small line; no chart.',
  name: 'The moment a name is said for the first time: the name lands as the hero (the attached image is the real logo / brand picture; keep it recognisable), with its Chinese name smaller.',
  mechanism: 'How a mechanism works, shown as real objects in this world\'s material (the attached image is the real product): two chips and the data channel between them, the channel cut down to a fraction, data piling up at the cut. Real materials, not plastic toys; no cartoon people.',
};
// the six moments in story order, from the project's own conceptKeys (project.json) when it names them
export const MOMENTS = ['title', 'evidence', 'number', 'name', 'mechanism', 'overlay'];

export function loadWorlds(cfg) {
  const dir = path.join(cfg.dataDir, 'worlds');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
}

// the film's key shots: the first shot of each role, in story order
export function keyShots(cfg, id) {
  const shots = loadShots(cfg, id);
  const project = JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).root, 'project.json'), 'utf8'));
  // a project may name its key moments: [{ role, shot, words, said, material }] (words, said and material override the
  // shot's own, for moments whose shot has since become a 3D plate or a chapter)
  if (Array.isArray(project.conceptKeys)) {
    const byId = Object.fromEntries(shots.map((s) => [s.shotId, s]));
    return project.conceptKeys.filter((k) => byId[k.shot]).map((k) => ({ role: k.role, shot: { ...byId[k.shot], subtitle: k.said ?? byId[k.shot].subtitle }, words: k.words, material: k.material }));
  }
  return KEY_CARDS.map(([role, cards]) => ({ role, shot: shots.find((s) => cards.includes(s.recipe)) })).filter((k) => k.shot);
}

const texts = (shot) => {
  const out = [];
  const walk = (v) => { if (!v) return; if (typeof v === 'string') out.push(v); else if (typeof v === 'object' && !Array.isArray(v)) { if (v.text) out.push(v.text); if (v.mechanism) (v.mechanism.steps || []).forEach((s) => s.label && out.push(s.label)); } };
  for (const [k, v] of Object.entries(shot.slots || {})) if (!/^(background|main|panel|screen|product|base|leftCard|rightCard)$/.test(k)) walk(v);
  return [...new Set(out.map((t) => String(t).replace(/\[\[|\]\]/g, '').replace(/\n/g, ' ').trim()).filter(Boolean))].slice(0, 4);
};
const material = (cfg, shot) => {
  for (const k of ['background', 'screen', 'main', 'product']) {
    const a = shot.slots?.[k]?.asset;
    if (a && /\.(png|jpe?g|webp)$/i.test(a) && fs.existsSync(sourcePath(cfg, a))) return sourcePath(cfg, a);
  }
  return null;
};

const dirOf = (cfg, id) => path.join(projectPaths(cfg, id).root, 'concept');
export const framePath = (cfg, id, world, shotId) => path.join(dirOf(cfg, id), `${world}-${shotId}.png`);

export function conceptState(cfg, id, { all = false } = {}) {
  const project = JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).root, 'project.json'), 'utf8'));
  const worlds = loadWorlds(cfg).filter((w) => all || w.kit);
  const keys = keyShots(cfg, id);
  const missing = worlds.flatMap((w) => keys.filter((k) => !fs.existsSync(framePath(cfg, id, w.id, k.shot.shotId))).map((k) => ({ world: w, ...k })));
  return { picked: project.world || null, worlds, keys, missing };
}

export function stepConcept(cfg, id, { all = false, log = () => {} } = {}) {
  const st = conceptState(cfg, id, { all });
  if (st.picked) return st;
  fs.mkdirSync(dirOf(cfg, id), { recursive: true });
  for (const m of st.missing) {
    const said = String(m.shot.subtitle || '').slice(0, 60);
    const words = m.words || texts(m.shot);
    const mat = m.material ? sourcePath(cfg, m.material) : material(cfg, m.shot);
    const prompt = [
      'A finished 16:9 style frame (key frame) for a premium Chinese explainer video, designed by a top motion-design studio: a real designed composition, not a template.',
      `Visual concept for the whole film: ${m.world.prompt}`,
      lookLine(m.world),
      `This frame: ${FRAME[m.role]}`,
      said ? `The narrator says: "${said}".` : '',
      words.length ? `Chinese type on screen, exactly these words: ${words.map((t) => `「${t}」`).join(' ')} — the first is the hero, much larger than the rest; strong typographic hierarchy.` : '',
      `The first ${m.world.refs.length} attached images are the user's own taste references for this world: match their graphic language, texture and colour, but make a new composition and never copy their pictures, people or scenes.${mat ? ' The last attached image is the real material of this shot.' : ''}`,
      'No website names, no URLs, no watermarks, no logos of media outlets. No generated people other than the presenter in the attached photo.',
    ].filter(Boolean).join('\n');
    try {
      const img = generate(prompt, [...m.world.refs.map((r) => sourcePath(cfg, r)), ...(mat ? [mat] : [])]);
      fs.copyFileSync(img, framePath(cfg, id, m.world.id, m.shot.shotId));
      log(`${m.world.id} ${m.role} ${m.shot.shotId}`);
    } catch (e) { log(`${m.world.id} ${m.shot.shotId}: ${e.message}`); }
  }
  return conceptState(cfg, id, { all });
}

// the world's look sheet (worlds/LOOK.md) in words, so every frame of a world shares colours, type roles and texture
function lookLine(w) {
  const L = w.look; if (!L) return '';
  const p = L.palette || {}, m = L.material3d || {};
  return [`Exact palette: ground ${p.paper}, ink ${p.ink}, muted ${p.dim}, one accent ${p.accent}${p.second ? `, a second accent ${p.second} used sparingly` : ''}.`,
    'Type roles: statements in a high-contrast heavy Chinese serif on an editorial grid; numbers large in a condensed or Didone face; tiny lines in a small serif or mono; never put words on dark boxes or plates.',
    `Texture over everything: ${(L.texture || []).join(', ')}.`,
    `Objects and 3D are real materials: body ${m.body}, ${m.metal > 0.5 ? 'brushed or chrome metal' : 'matte'}, ${m.light} light.`].join(' ');
}

// the user's pick: the project's theme becomes the world's theme (a world without a kit cannot be picked)
export function pickWorld(cfg, id, worldId) {
  const w = loadWorlds(cfg).find((x) => x.id === worldId);
  if (!w) throw new Error(`unknown world ${worldId}`);
  if (!w.kit || !w.theme) throw new Error(`world ${worldId} has key frames but no kit yet (cards are not rebuilt for it)`);
  const file = path.join(projectPaths(cfg, id).root, 'project.json');
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  p.world = worldId; p.themeBeforeWorld = p.themeBeforeWorld || p.theme; p.theme = w.theme;
  fs.writeFileSync(file, JSON.stringify(p, null, 1) + '\n');
  return p;
}
