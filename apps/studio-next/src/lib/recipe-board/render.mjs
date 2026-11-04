// Batch renderer: pick card -> fill slots (with fallback) -> 1920x1080 PNG, skipped when the content hash
// is unchanged. Uses Playwright, so it runs from the CLI (scripts/recipe-board.mjs), never inside a
// request handler.
import { facesOf, measurePage, designFindings } from './design-check.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { resolveImageSlot, describeMissing, imageFills, sha } from './resolve.mjs';
import { composeHtml, heroPlan, withHero } from './compose.mjs';
import { readingFocus } from './screen.mjs';
import { worldContext } from './world.mjs';
import { displayContext } from './display.mjs';
import { filmPhotoTokens } from './filmlook.mjs';
import { assertRenderStorage, projectPaths, loadProject, loadShots, loadRecipe, loadTheme, projectTheme, readCache, writeCache, writeTimings, sourcePath } from './store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RENDERER_VERSION = sha(['compose.mjs', 'resolve.mjs', 'components.mjs'].map((f) => fs.readFileSync(path.join(HERE, f), 'utf8')).join('\n'));

// Reference keyframe = the shot's hold frame from the project's frame manifest, extracted once.
function ensureReferenceFrames(cfg, id, shots) {
  const p = projectPaths(cfg, id);
  const manifestFile = sourcePath(cfg, loadProject(cfg, id).referenceFrames);
  if (!manifestFile || !fs.existsSync(manifestFile)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const video = sourcePath(cfg, manifest.sourceVideo?.path);
  fs.mkdirSync(p.refs, { recursive: true });
  const missing = [];
  for (const s of shots) {
    const out = path.join(p.refs, `${s.shotId}.jpg`);
    if (fs.existsSync(out)) continue;
    // `referenceShot` lets several card variants share one reference frame.
    const f = manifest.frames?.find((x) => x.shotId === (s.referenceShot || s.shotId));
    if (!f || !video || !fs.existsSync(video)) { missing.push(s.shotId); continue; }
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(f.seekSeconds), '-i', video, '-frames:v', '1', '-q:v', '3', out]);
  }
  return missing;
}

// the film's own way with found photos over the card theme's (filmlook.mjs filmPhotoTokens)
export const withFilmPhoto = (recipe, cfg, id) => ({ ...recipe, tokens: { ...recipe.tokens, ...filmPhotoTokens(cfg, id) } });
const labelsFor = async (cfg, tokens) => { const L = await import('./labels.mjs'); return L.tintPlates(L.labelPlates(cfg, { generate: true }), L.colorsIn(tokens)); };
async function renderShot(ctx, shot0, cache) {
  const shot = withHero(shot0, ctx.heroes?.[`${shot0.shotId}:0`]);   // the film's turn of hero title mechanisms (compose.mjs heroPlan)
  const t0 = performance.now();
  const recipe = withFilmPhoto(loadRecipe(ctx.cfg, shot.recipe, ctx.theme), ctx.cfg, ctx.id);
  // the paper props under words (labels.mjs), as the motion build has them
  const resolved = { __labels: await labelsFor(ctx.cfg, recipe.tokens) };
  const degraded = [];
  for (const [name, fill] of imageFills(recipe, shot.slots)) {
    resolved[name] = await resolveImageSlot(ctx, name, fill, recipe.tokens);
    if (resolved[name].level !== 'asset') degraded.push(describeMissing(name, fill, resolved[name]));
  }
  for (const [i, l] of (shot.layers || []).entries()) {
    resolved[`__layer${i}`] = await resolveImageSlot(ctx, `layer${i}`, l.fill || {}, recipe.tokens);
    if (resolved[`__layer${i}`].level !== 'asset') degraded.push(describeMissing(`layer${i}`, l.fill || {}, resolved[`__layer${i}`]));
  }
  // Full-frame backdrop under any card (footage or still), e.g. a chart over darkened B-roll.
  if (shot.backdrop) {
    resolved.__backdrop = await resolveImageSlot(ctx, 'backdrop', shot.backdrop, recipe.tokens);
    if (resolved.__backdrop.level !== 'asset') degraded.push(describeMissing('backdrop', shot.backdrop, resolved.__backdrop));
  }
  // Chat avatars: real portraits keyed by speaker; a missing one falls back to the initial.
  for (const [name, slot] of Object.entries(recipe.slots)) {
    const avatars = slot.kind === 'chat' ? shot.slots?.[name]?.avatars : null;
    for (const [who, a] of Object.entries(avatars || {})) {
      const r = await resolveImageSlot(ctx, `avatar:${who}`, { asset: a.asset }, recipe.tokens);
      if (r.level === 'asset') (resolved.__avatars ||= {})[who] = { url: r.url, position: a.position, zoom: a.zoom, contentHash: r.contentHash };
      else degraded.push(describeMissing(`avatar:${who}`, a, r));
    }
  }
  const bindingsFile = path.join(ctx.paths.root, 'materials', 'bindings.json');
  const focus = recipe.motionPreset === 'screen' ? readingFocus(fs.existsSync(bindingsFile) ? JSON.parse(fs.readFileSync(bindingsFile, 'utf8')) : null, shot, recipe.evidenceSlot || 'screen') : null;
  // a world: its definition, its generated panel tiles, the shot's on-screen words (world.mjs)
  if (recipe.world) resolved.__world = worldContext(ctx.cfg, ctx.paths.root, recipe.world, shot);
  // a display plate at the film's high points (display.mjs): the composite is built once and cached
  const dc = displayContext(ctx.cfg, ctx.id, ctx.themeDef, shot, shot.recipe, resolved, 0);
  if (dc) resolved.__display = { ...dc, url: 'file://' + dc.file };
  // a mechanism still is drawn by the diagram module in the page: its code is part of the key
  const mech = Object.values(recipe.slots).some((x) => x.kind === 'mechanism') ? sha(fs.readFileSync(new URL('./motion-mechanism.browser.js', import.meta.url))) : '';
  // a varied card is laid out by variants.mjs: its code is part of the key too
  const varied = shot.variant ? sha(fs.readFileSync(new URL('./variants.mjs', import.meta.url))) : '';
  // a filmed theme is drawn by camera.mjs: its code is part of the key
  const cam = recipe.camera ? sha(fs.readFileSync(new URL('./camera.mjs', import.meta.url))) : '';
  const hash = sha(JSON.stringify({ RENDERER_VERSION, recipe, shot, focus, mech, varied, cam, assets: Object.fromEntries(Object.entries(resolved).map(([k, v]) => [k, k === '__labels' ? v.map((x) => x.url) : v.contentHash ?? Object.values(v).map((a) => a.contentHash)])) }));
  const png = path.join(ctx.paths.candidates, `${shot.shotId}.png`);
  if (!ctx.force && cache[shot.shotId]?.hash === hash && fs.existsSync(png)) {
    return { ...cache[shot.shotId], cached: true, ms: Math.round(performance.now() - t0) };
  }
  const htmlPath = path.join(ctx.paths.html, `${shot.shotId}.html`);
  fs.writeFileSync(htmlPath, composeHtml({ recipe, shot, resolved, degraded, focus }));
  const page = await ctx.browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  let design = [];
  try {
    await page.goto('file://' + htmlPath, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.body.dataset.fitted === '1', null, { timeout: 10000 });
    // house fonts (house.mjs): a text no house font has every character of fails the shot, never a system font
    { const bad = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family)); if (bad.length) throw new Error(`fonts the browser cannot load: ${[...new Set(bad)].join(', ')}`); }
    { const miss = await page.evaluate(() => window.__houseMissing || []); if (miss.length) throw new Error(`house fonts: ${miss.map((m) => `no house font has ${m.chars || '?'} ("${m.text}", set in ${m.font})`).join('; ')}`); }
    if (await page.$('.mech')) await page.waitForFunction(() => document.body.dataset.mechReady === '1', null, { timeout: 30000 });
    // a world frame zooms its card to the card's content once fonts are in (world-terminal.mjs)
    if (await page.$('[data-twlevel]')) await page.waitForFunction(() => document.body.dataset.twtype === '1', null, { timeout: 10000 });
    await page.screenshot({ path: png, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    // design checks on the frame as drawn (design-check.mjs): faces of the background picture first
    const bgUrl = resolved.background?.url;
    const faces = bgUrl?.startsWith('file://') ? facesOf(decodeURIComponent(bgUrl.slice(7))) : [];
    design = designFindings(await measurePage(page, faces));
  } finally {
    await page.close();
  }
  const ms = Math.round(performance.now() - t0);
  return { shotId: shot.shotId, recipe: shot.recipe, hash, degraded, design, renderMs: ms, renderedAt: new Date().toISOString(), cached: false, ms };
}

export async function renderProject(cfg, id, { only = null, force = false, serial = false, log = () => {} } = {}) {
  const { changedNeeds, blockedMaterialForms, materialSlotConflicts } = await import('./materials.mjs');
  const blocked = blockedMaterialForms(cfg, id, { only });
  if (blocked.length) throw new Error(`render blocked: material form mismatch or unverified (${blocked.join(', ')})`);
  const conflicts = materialSlotConflicts(cfg, id, { only });
  if (conflicts.length) throw new Error(`render blocked: material slot mismatch or unknown (${conflicts.join(', ')})`);
  const stale = changedNeeds(cfg, id).filter(k => !only || only.has(k.split('~')[0]));
  if (stale.length) throw new Error(`render blocked: stale material needs (${stale.join(', ')})`);
  assertRenderStorage(cfg, id);
  const paths = projectPaths(cfg, id);
  const shots = loadShots(cfg, id, only);
  [paths.candidates, paths.html, paths.captures].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  const tRef = performance.now();
  const missingReferences = ensureReferenceFrames(cfg, id, shots);
  const referenceExtractMs = Math.round(performance.now() - tRef);

  const tAll = performance.now();
  // file modules allowed: a mechanism still loads three.js and its module from local files (no network)
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const browserLaunchMs = Math.round(performance.now() - tAll);
  // resolve.mjs looks material up under ctx.repoRoot: point it at the (read-only) source root.
  const ctx = { cfg, id, paths, heroes: heroPlan(loadShots(cfg, id)), theme: projectTheme(cfg, id), themeDef: loadTheme(cfg, projectTheme(cfg, id)), repoRoot: cfg.sourceRoot, browser, captureDir: paths.captures, captureTimeoutMs: 5000, force };
  const cache = readCache(cfg, id);
  const results = [];
  const queue = [...shots];
  try {
    await Promise.all(Array.from({ length: serial ? 1 : 4 }, async () => {
      for (let s; (s = queue.shift());) {
        try {
          const r = await renderShot(ctx, s, cache);
          results.push(r);
          log(`  ${s.shotId.padEnd(4)} ${s.recipe.padEnd(24)} ${String(r.ms).padStart(5)} ms ${r.cached ? 'cached' : 'rendered'}${r.degraded.length ? '  TODO ' + r.degraded.map((d) => d.slot + '→' + d.level).join(',') : ''}`);
        } catch (err) {
          // A broken shot must not block the batch.
          results.push({ shotId: s.shotId, recipe: s.recipe, error: String(err.message || err), degraded: [], hash: '' });
          log(`  ${s.shotId} FAILED: ${err.message}${process.env.RB_STACK ? "\n" + err.stack : ""}`);
        }
      }
    }));
  } finally {
    await browser.close();
  }
  const totalMs = Math.round(performance.now() - tAll);
  for (const r of results) if (!r.error) cache[r.shotId] = { shotId: r.shotId, recipe: r.recipe, hash: r.hash, degraded: r.degraded, design: r.design || [], renderMs: r.renderMs, renderedAt: r.renderedAt };
  writeCache(cfg, id, cache);
  const summary = {
    at: new Date().toISOString(), project: id, mode: serial ? 'serial' : 'parallel-4', browserLaunchMs, referenceExtractMs, totalMs, missingReferences,
    shots: results.map(({ shotId, recipe, ms, cached, degraded, design, error }) => ({ shotId, recipe, ms, cached, todo: degraded.length, design: design || [], error })),
  };
  writeTimings(cfg, id, summary);
  return summary;
}

// Reference | candidate at the same size, one JPEG per shot: the first thing to look at after a render.
// Main line's accepted whole-frame stills, by shot id (flattened images: the visual target, not editable).
function mainlineStills(cfg, project) {
  const file = project.mainlineBoard && sourcePath(cfg, project.mainlineBoard);
  if (!file || !fs.existsSync(file)) return {};
  const board = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(board.items.filter((i) => i.status === 'PASS').map((i) => [i.shotId, sourcePath(cfg, i.image.path)]));
}

// Original | (main line still) | card, so a card is judged against both the film and the accepted look.
export function compareSheets(cfg, id, only = null) {
  const paths = projectPaths(cfg, id);
  const dir = path.join(paths.out, 'compare');
  fs.mkdirSync(dir, { recursive: true });
  const mainline = mainlineStills(cfg, loadProject(cfg, id));
  const made = [];
  for (const s of loadShots(cfg, id, only)) {
    const ref = path.join(paths.refs, `${s.shotId}.jpg`);
    const cand = path.join(paths.candidates, `${s.shotId}.png`);
    if (!fs.existsSync(ref) || !fs.existsSync(cand)) continue;
    const target = mainline[s.referenceShot || s.shotId];
    const inputs = [ref, ...(target && fs.existsSync(target) ? [target] : []), cand];
    const scale = inputs.map((_, i) => `[${i}]scale=960:540[v${i}]`).join(';');
    const out = path.join(dir, `${s.shotId}.jpg`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs.flatMap((f) => ['-i', f]), '-filter_complex',
      `${scale};${inputs.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${inputs.length}`, '-q:v', '3', out]);
    made.push(out);
  }
  return made;
}
