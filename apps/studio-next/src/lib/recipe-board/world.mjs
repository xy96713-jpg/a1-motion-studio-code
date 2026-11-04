// World context for one shot (stills and motion alike): the world's definition (worlds/<id>.json), its
// generated panel tiles (cached art, never generated here), and the shot's on-screen words from the plan.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cachedArt } from './imagegen.mjs';
import { stillSubtitle } from './compose.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const CODE = new URL('./world-terminal.mjs', import.meta.url);

// How much of the world a shot carries (DESIGN-method.md, 浓度): 'full' (the style frame's density: desk,
// panel windows, pixel headline) only for a share of the film's show moments, spaced apart; 'medium' for
// the other designed cards (the card in one window, a quiet desk); 'light' for evidence and people (the
// real material full frame and readable, a thin window chrome only). Presenter-only shots are untouched.
export const FULL_CARDS = ['title-hero-over-photo', 'mechanism-3d', 'presenter-side-card', 'poster-pair', 'product-side-card', 'screen-full'];
export const LIGHT_CARDS = ['screen-full', 'stamp-over-evidence', 'footage-plate', 'person-nameplate', 'person-intro', 'quote-portrait-bw', 'quote-stack', 'article-highlight-dark', 'article-highlight-light', 'market-table'];
export function worldIntensity(shots, { share = 0.18, gap = 4 } = {}) {
  const out = {};
  const budget = Math.max(1, Math.round(shots.length * share));
  let full = 0, last = -1e9;
  shots.forEach((s, i) => {
    if (s.recipe === 'presenter-plain') { out[s.shotId] = 'none'; return; }
    if (FULL_CARDS.includes(s.recipe) && full < budget && i - last >= gap) { out[s.shotId] = 'full'; full++; last = i; return; }
    out[s.shotId] = LIGHT_CARDS.includes(s.recipe) ? 'light' : 'medium';
  });
  return out;
}
const shotsOf = (projectRoot) => {
  const dir = path.join(projectRoot, 'shots');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
};
export const intensityFor = (projectRoot, shotId) => worldIntensity(shotsOf(projectRoot))[shotId] || 'medium';

export const tileArt = (def, t) => ({ prompt: t.prompt, size: t.size, refs: [def.keyframes.B01, def.keyframes.B29] });

export function worldContext(cfg, projectRoot, worldId, shot) {
  const def = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'worlds', `${worldId}.json`), 'utf8'));
  const tiles = Object.fromEntries(Object.entries(def.tiles || {}).map(([k, t]) => {
    const f = cachedArt(cfg, tileArt(def, t));
    return [k, f ? 'file://' + f : null];
  }));
  const planFile = path.join(projectRoot, 'plan.json');
  const beat = fs.existsSync(planFile) ? (JSON.parse(fs.readFileSync(planFile, 'utf8')).beats || []).find((b) => b.id === shot.shotId) : null;
  const phrase = shot.subtitle ? stillSubtitle(String(shot.subtitle).replace(shot.slots?.title?.text || '\u0000', '')) : '';
  const intensity = intensityFor(projectRoot, shot.shotId);
  return { def, tiles, onScreen: beat?.onScreen || null, phrase, intensity, contentHash: sha(JSON.stringify([def, tiles, beat?.onScreen, phrase, intensity, fs.readFileSync(CODE, 'utf8')])) };
}
