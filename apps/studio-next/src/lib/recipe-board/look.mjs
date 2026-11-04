// Look: the film's own world, made from the brief, so every shot (the opening title as much as a chart) is drawn in
// one design: the brief says style.world { base, display, texture, medium } and style.palette { base, ink, accent };
// this writes themes/film-<project>.json (extends the dark or the paper house theme, its tokens from the palette, its
// display face from the font set, its texture overlays, its medium) and sets it as the project's theme. A world the
// user picked on the concept step (project.world) wins: the theme is then made from that world's look sheet
// (worlds/<id>.json, filmlook.mjs), cards and generated art alike, unless the project already has its own theme (a
// world with a kit, like terminal). Without it the cards fell back to the house theme and its art drew every plate
// as the HuBo film's dark photograph with that film's reference frame (paperclip-138-full, 2026-10-20).
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths } from './store.mjs';
import { readWorld, lookOf, readStyle } from './filmlook.mjs';

const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
export const BASES = { dark: 'clara-dark', paper: 'hupo-editorial' };
// display faces the renderer has (compose.mjs FONT_FILES and the OS stacks)
export const DISPLAY = {
  'sans-heavy': `'A1 Sans Heavy', 'PingFang SC', sans-serif`,
  'serif-heavy': `'A1 Serif Heavy', 'Songti SC', serif`,
  condensed: `'Avenir Next Condensed', 'A1 Sans Heavy', 'PingFang SC', sans-serif`,
  pixel: `'A1 Pixel', 'PingFang SC', monospace`,
  mono: `'SF Mono', 'Menlo', 'A1 Sans Heavy', monospace`,
};
export const TEXTURES = ['grain', 'vignette', 'vignette-light', 'dots', 'rulers', 'chromatic'];
export const MEDIA = ['tube', 'none', 'film'];
const HEX = /^#[0-9a-f]{6}$/i;

export function checkWorld(w) {
  const errors = [];
  if (!w) return errors;
  if (!BASES[w.base]) errors.push(`style.world.base must be ${Object.keys(BASES).join(' / ')}`);
  if (!DISPLAY[w.display]) errors.push(`style.world.display must be ${Object.keys(DISPLAY).join(' / ')}`);
  for (const t of w.texture || []) if (!TEXTURES.includes(t)) errors.push(`style.world.texture "${t}" is not one of ${TEXTURES.join(' / ')}`);
  if (w.medium && !MEDIA.includes(w.medium)) errors.push(`style.world.medium must be ${MEDIA.join(' / ')}`);
  return errors;
}

// the theme for the film: the house theme of its ground, recoloured, retyped, retextured
export function filmTheme(id, style) {
  const w = style.world, p = style.palette || {};
  const accent = HEX.test(p.accent || '') ? p.accent : null, bg = HEX.test(p.base || '') ? p.base : null, ink = HEX.test(p.ink || '') ? p.ink : null;
  const tokens = {
    ...(bg ? { bg } : {}), ...(ink ? { fg: ink } : {}),
    ...(accent ? { accent, highlight: accent, bar: accent, down: accent, markFill: accent } : {}),
  };
  return {
    contract: 'A1RecipeBoardTheme/v1', id: `film-${id}`, extends: BASES[w.base],
    title: `${id} 的全片世界`, description: `由简报生成：${w.base} 底、${w.display} 标题字、${(w.texture || []).join('+') || '无纹理'}、介质 ${w.medium || '跟底'}`,
    tokens, fonts: { display: DISPLAY[w.display] }, overlays: w.texture || [],
    ...(w.medium === 'none' ? { medium: { kind: 'none' } } : w.medium === 'tube' ? { medium: { kind: 'tube', preset: 'arcade', apply: 'all' } } : {}),
    generatedFrom: 'brief.style.world',
  };
}

// the theme of a picked world: the paper house theme (its card layouts and art kit) in the world's colours, faces,
// texture and medium; every art template drawn in the world's look and against the world's own reference images
const TEXTURE_OVERLAY = { grain: 'grain', photocopy: 'grain', halftone: 'dots', dots: 'dots', dither: 'dots', scanlines: 'chromatic', chromatic: 'chromatic', rulers: 'rulers' };
const rgbaOf = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
export function worldStyle(L) {
  const tex = { grain: 'film grain', photocopy: 'photocopied, slightly degraded', halftone: 'coarse halftone dots', dots: 'halftone dots', dither: 'dithered', scanlines: 'faint scanlines', chromatic: 'slight colour fringing' };
  return [`palette: ${L.ground === 'dark' ? 'dark' : 'light'} ground ${L.paper}, ink ${L.ink}, one accent ${L.accent}${L.second ? ` and ${L.second}` : ''}, nothing else saturated`,
    (L.texture || []).map((t) => tex[t]).filter(Boolean).join(', '), L.medium?.kind === 'print' ? 'feels physically printed on paper' : L.medium?.kind === 'tube' ? 'feels like an image on a screen' : ''].filter(Boolean).join('; ');
}
// every card that carries colours of its own takes the world's instead, and a title the house theme set in metal
// (gold gradient) is set in the world's type (paperclip-138-full: gold metal titles over black-and-white plates
// beside dark red diagrams, three looks in one film)
export function worldCards(base, L) {
  const out = {};
  for (const [k, c] of Object.entries(base.cards || {})) {
    const t = c.tokens || {}, own = {};
    for (const [key, v] of [['bg', L.paper], ['fg', L.ink], ['muted', L.dim], ['accent', L.accent], ['highlight', L.accent], ['bar', L.accent], ['markFill', L.accent], ['down', L.accent]]) if (key in t) own[key] = v;
    const slots = {};
    for (const [n, v] of Object.entries(c.slots || {})) if (v && v.treatment === 'metal') slots[n] = { treatment: 'display' };
    if (Object.keys(own).length || Object.keys(slots).length) out[k] = { ...(Object.keys(own).length ? { tokens: own } : {}), ...(Object.keys(slots).length ? { slots } : {}) };
  }
  return out;
}
// how found photos are set: the world's own choice when it made one (filmlook.mjs L.photo), else black and white for a
// world of one accent (compose.mjs monoFill)
export const photoTokens = (L) => (L.photo === 'mono' ? { photoMono: true } : L.photo === 'duotone' ? { photoMono: true, photoTone: 'duotone' } : L.photo === 'color' ? {} : L.second ? {} : { photoMono: true });
export function worldTheme(id, world, base = {}) {
  const L = lookOf(world), style = worldStyle(L), light = L.ground !== 'dark';
  const plate = light
    ? `A quiet high-key photograph for a film title backdrop, printed and handled: matte ${L.paper} paper tones, soft overcast light, generous empty space in the middle for a large title. The setting: {subject}. Show only the place and objects: an empty scene with no people and no faces (real people come from photos, never from generation). No screens showing words.`
    : `A low-key cinematic photograph for a film title backdrop, shallow depth of field, graded to ${L.paper} shadows and ${L.ink} highlights, generous quiet space in the middle for a large title. The setting: {subject}. Show only the place and objects: an empty scene with no people and no faces (real people come from photos, never from generation). No screens showing words.`;
  const artLibrary = Object.fromEntries(Object.entries(base.artLibrary || {}).map(([k, a]) => [k, { ...a,
    prompt: `${k === 'darkPlate' ? plate : a.prompt} The film's look: ${style}.`, refs: (world.refs || []).slice(0, 3) }]));
  const overlays = [...new Set((L.texture || []).map((t) => TEXTURE_OVERLAY[t]).filter(Boolean).concat(light ? [] : ['vignette']))];
  // a card plan inherited from the base theme keeps its paper but sets its words in the world's dark (the world's ink on a
  // light ground, its ground on a dark one): paperclip-138-full B46 set its case name in hupo's navy (whole-film review 2026-10-25)
  const inked = Object.fromEntries(Object.entries(base.artPlan || {}).filter(([, plan]) => Object.values(plan || {}).some((v) => v?.fill?.ink))
    .map(([card, plan]) => [card, Object.fromEntries(Object.entries(plan).map(([slot, v]) => [slot, v?.fill?.ink ? { ...v, fill: { ...v.fill, ink: light ? L.ink : L.paper } } : v]))]));
  // no torn-paper strips under words (the user 2026-10-25: 之后也不要这种纸条撕纸设计什么的了): every inherited plate made
  // of one is taken away (null in the plan), the words set clean
  for (const [card, plan] of Object.entries(base.artPlan || {})) for (const [slot, v] of Object.entries(plan || {})) if (/\.plate$/.test(slot) && (v === 'tornStrip' || v?.use === 'tornStrip')) (inked[card] ||= { ...plan })[slot] = null;
  return {
    contract: 'A1RecipeBoardTheme/v1', id: `film-${id}`, extends: 'hupo-editorial',
    title: `${id} 的全片世界（${world.title || world.id}）`, description: `由挑定的世界 ${world.id} 生成：底 ${L.paper}、字 ${L.ink}、强调 ${L.accent}、${(L.texture || []).join('+') || '无纹理'}`,
    // one accent and nothing else saturated: found photos and footage are set in black and white (compose.mjs)
    tokens: { bg: L.paper, fg: L.ink, muted: L.dim, accent: L.accent, highlight: L.accent, bar: L.accent, down: L.accent, markFill: L.accent, grid: rgbaOf(L.ink, 0.06), ...photoTokens(L) },
    fonts: { display: L.display, serif: L.serif }, overlays,
    medium: L.medium?.kind === 'tube' ? { kind: 'tube', preset: L.medium.preset || 'arcade', apply: 'all' } : { kind: 'none' },
    // a footage beat waiting for its clip (stock needs the user's confirmation) shows a plate in the world's look
    // instead of a blank; the confirmed clip replaces it (arttemplates: art never sits on a slot with material)
    artLibrary, artPlan: { ...inked, 'footage-plate': { background: 'darkPlate' } }, cards: worldCards(base, L), generatedFrom: `worlds/${world.id}.json`,
  };
}

export function stepLook(cfg, id) {
  const root = projectPaths(cfg, id).root, brief = readJson(path.join(root, 'brief.json'));
  const pf = path.join(root, 'project.json'), project = readJson(pf, {});
  // the film's style decides (project.json style, CONVERGE-20261026 conflict 1): the cards take the card theme of its
  // family (styles.json theme); the brief's world is only words then. A project with a theme of its own keeps it
  if (project.style) {
    const st = readStyle(cfg, project.style);
    if (!st) return { state: 'none', theme: project.theme };
    if (project.theme && project.theme !== `film-${id}` && !String(project.theme).startsWith('film:')) return { state: 'style', theme: project.theme };   // (a theme of film:… was the derived style's name written by mistake: replaced)
    if (project.theme === st.theme) return { state: 'style', theme: st.theme };
    fs.writeFileSync(pf, JSON.stringify({ ...project, theme: st.theme }, null, 1) + '\n');
    return { state: 'written', theme: st.theme };
  }
  if (project.world) {   // the user picked a world: the theme is made from it (a project with its own theme keeps it)
    const world = readWorld(cfg, project.world);
    if (!world?.look || (project.theme && project.theme !== `film-${id}`)) return { state: 'world', theme: project.theme };
    const base = readJson(path.join(cfg.dataDir, 'themes', 'hupo-editorial.json'), {});
    return writeTheme(cfg, id, pf, project, worldTheme(id, world, base));
  }
  const w = brief?.style?.world;
  if (!w || checkWorld(w).length) return { state: 'none', theme: project.theme };
  return writeTheme(cfg, id, pf, project, filmTheme(id, brief.style));
}
function writeTheme(cfg, id, pf, project, theme) {
  const file = path.join(cfg.dataDir, 'themes', `${theme.id}.json`);
  const body = JSON.stringify(theme, null, 1) + '\n';
  const changed = !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== body;
  if (changed) fs.writeFileSync(file, body);
  if (project.theme !== theme.id) {
    project.themeBeforeLook = project.themeBeforeLook || project.theme || null; project.theme = theme.id;
    fs.writeFileSync(pf, JSON.stringify(project, null, 1) + '\n');
  }
  return { state: changed ? 'written' : 'current', theme: theme.id };
}
