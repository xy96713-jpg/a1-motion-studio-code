// Recipe board store: projects, shots, recipe cards, render cache, review verdicts.
// Pure fs, no browser — safe to import from route handlers. Rendering lives in render.mjs (CLI only).
//
// Layout (under <repo>/work/recipe-board-v1):
//   recipes/<layoutId>.json                     shared layout-card library, reused across projects
//   projects/<id>/project.json                  where the project's references come from
//   projects/<id>/shots/<shotId>.json           pick a card + fill its slots
//   projects/<id>/reference-frames/<shot>.jpg   extracted once from the reference film (gitignored)
//   projects/<id>/out/                          candidates, html, captures, cache.json (gitignored)
//   projects/<id>/review.json                   the only verdict record, bound to candidate hash
//
// Material paths in shots/project.json resolve against the source root (RECIPE_BOARD_SOURCE_ROOT,
// default: this repo). Material is only ever read there; everything written stays in the data dir.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createNasOutput, verifyNasOutput } from './nas-output.mjs';
import { diskFreeGb, diskError } from './pool.mjs';

const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHOT_ID = /^[A-Za-z0-9_-]{1,32}$/;
export const REVIEW_REASONS = ['layout', 'text', 'asset', 'color'];

const join = (base, ...parts) => path.join(/* turbopackIgnore: true */ base, ...parts);
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
};

function findRepoRoot(start) {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (fs.existsSync(join(dir, 'work', 'recipe-board-v1', 'recipes'))) return dir;
    if (path.dirname(dir) === dir) throw new Error(`recipe board data dir not found above ${start}`);
  }
}

export function boardConfig(env = process.env) {
  const repoRoot = env.RECIPE_BOARD_REPO_ROOT ? path.resolve(env.RECIPE_BOARD_REPO_ROOT) : findRepoRoot(process.cwd());
  const sourceRoot = env.RECIPE_BOARD_SOURCE_ROOT ? path.resolve(env.RECIPE_BOARD_SOURCE_ROOT) : repoRoot;
  const localConfig = join(os.homedir(), '.config', 'a1-motion-studio', 'recipe-board-storage.json');
  const saved = readJson(localConfig, null);
  const savedRoot = saved?.repoRoot === repoRoot && saved?.enabled === true ? saved.outputRoot : null;
  const nasOutputRoot = env.RECIPE_BOARD_NAS_OUTPUT_ROOT !== undefined ? env.RECIPE_BOARD_NAS_OUTPUT_ROOT || null : savedRoot;
  return { repoRoot, sourceRoot, dataDir: join(repoRoot, 'work', 'recipe-board-v1'), nasOutputRoot };
}

export function listProjects(cfg) {
  const dir = join(cfg.dataDir, 'projects');
  return fs.readdirSync(dir).filter((id) => PROJECT_ID.test(id) && fs.existsSync(join(dir, id, 'project.json')) && !readJson(join(dir, id, 'project.json'), {}).testOnly)
    .map((id) => ({ id, title: readJson(join(dir, id, 'project.json'), {}).title || id, hasPlan: fs.existsSync(join(dir, id, 'plan.json')), hasShots: fs.existsSync(join(dir, id, 'shots')) }));
}

export function projectPaths(cfg, id) {
  if (!PROJECT_ID.test(String(id))) throw new Error(`invalid project id: ${id}`);
  const root = join(cfg.dataDir, 'projects', id);
  if (!fs.existsSync(join(root, 'project.json'))) throw new Error(`project not found: ${id}`);
  const out = join(root, 'out');
  const storage = readJson(join(root, 'project.json'))?.nasOutput;
  if (storage) verifyNasOutput(storage, out, id, cfg.nasCheck ? { verify: cfg.nasCheck } : undefined);
  else {
    let stat;
    try { stat = fs.lstatSync(out); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink() && fs.readlinkSync(out).startsWith('/Volumes/personalfolder/')) throw new Error('NAS output link has no project receipt');
  }
  return {
    root, out, nasOutput: storage || null,
    project: join(root, 'project.json'),
    shots: join(root, 'shots'),
    refs: join(root, 'reference-frames'),
    candidates: join(out, 'candidates'),
    html: join(out, 'html'),
    captures: join(out, 'captures'),
    cache: join(out, 'cache.json'),
    timings: join(out, 'timings.json'),
    review: join(root, 'review.json'),
    plan: join(root, 'plan.json'),
  };
}

// NAS-backed renders still use local temporary files. Check both volumes before work starts.
export function assertRenderStorage(cfg, id) {
  const p = projectPaths(cfg, id);
  if (!p.nasOutput) return;
  for (const [label, dir] of [['local temporary volume', os.tmpdir()], ['NAS output volume', p.out]]) {
    const error = diskError((cfg.diskFree || diskFreeGb)(dir), cfg.diskGb);
    if (error) throw new Error(`${label}: ${error}`);
  }
}

// New article projects start with just a title; references and shots come later.
export function ensureProject(cfg, id, title) {
  if (!PROJECT_ID.test(String(id))) throw new Error(`invalid project id: ${id}`);
  const file = join(cfg.dataDir, 'projects', id, 'project.json');
  // a new film: the six-stage process (gates.mjs), the house lettering, the session's agent answering (AGENTS.md)
  if (!fs.existsSync(file)) {
    const project = { contract: 'A1RecipeBoardProject/v1', id, title: title || id, scope: 'RESEARCH_ONLY', process: 'six-stage', gateSet: 'design', matureFirstDraft: true, typeBible: true, lettering: 'eva', agents: { default: 'manual' } };  // P0 C3 2026-10-29: new films default-claim mature first draft (not auto-claim every existing design-set project — banana/suez keep opt-in)
    if (cfg.nasOutputRoot) {
      const dir = path.dirname(file), out = join(dir, 'out');
      if (fs.existsSync(dir)) throw new Error(`project directory already exists: ${dir}`);
      const receipt = createNasOutput(cfg.nasOutputRoot, id, cfg.nasCheck ? { verify: cfg.nasCheck } : undefined);
      fs.mkdirSync(dir, { recursive: true });
      fs.symlinkSync(receipt.target, out, 'dir');
      project.nasOutput = receipt;
    }
    writeJson(file, project);
  }
  return projectPaths(cfg, id);
}

export const readPlan = (cfg, id) => readJson(projectPaths(cfg, id).plan, null);
export const writePlan = (cfg, id, plan) => writeJson(projectPaths(cfg, id).plan, plan);

export const loadProject = (cfg, id) => readJson(projectPaths(cfg, id).project);
export const sourcePath = (cfg, rel) => (rel ? (path.isAbsolute(rel) ? rel : join(cfg.sourceRoot, rel)) : null);

export function loadShots(cfg, id, only) {
  const dir = projectPaths(cfg, id).shots;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => readJson(join(dir, f)))
    .filter((s) => !only || only.has(s.shotId));
}

// A card (recipes/<id>.json) is structure only: slot boxes and kinds, type hierarchy, motion
// preset. Everything visual comes from the project's theme (themes/<id>.json): colours, fonts,
// title treatments, image grading, overlays, component looks (CSS variables) and per-card or
// per-slot style overrides. The merged recipe is what the composer renders.
export const DEFAULT_THEME = 'hupo-editorial';

// A theme may extend another (`extends`): it states only what differs (a card face, a prop material, a
// palette) and inherits the rest. Cards merge per card and per slot; art templates and plans per entry.
export function loadTheme(cfg, themeId = DEFAULT_THEME, seen = new Set()) {
  const theme = readJson(join(cfg.dataDir, 'themes', `${themeId}.json`), null);
  if (!theme) throw new Error(`theme not found: ${themeId}`);
  if (!theme.extends) return theme;
  if (seen.has(themeId)) throw new Error(`theme extends itself: ${themeId}`);
  const base = loadTheme(cfg, theme.extends, new Set([...seen, themeId]));
  const cards = { ...(base.cards || {}) };
  for (const [k, c] of Object.entries(theme.cards || {})) {
    const b = cards[k] || {};
    const slots = { ...(b.slots || {}) };
    for (const [n, v] of Object.entries(c.slots || {})) slots[n] = { ...(slots[n] || {}), ...v };
    cards[k] = { ...b, ...c, tokens: { ...(b.tokens || {}), ...(c.tokens || {}) }, slots };
  }
  const artPlan = { ...(base.artPlan || {}) };
  for (const [k, p] of Object.entries(theme.artPlan || {})) artPlan[k] = { ...(artPlan[k] || {}), ...p };
  return { ...base, ...theme, tokens: { ...(base.tokens || {}), ...(theme.tokens || {}) }, fonts: { ...(base.fonts || {}), ...(theme.fonts || {}) },
    css: [base.css, theme.css].flat().filter(Boolean).join('\n'),
    vars: { ...(base.vars || {}), ...(theme.vars || {}) }, artLibrary: { ...(base.artLibrary || {}), ...(theme.artLibrary || {}) }, artPlan, cards };
}

export function projectTheme(cfg, id) {
  return readJson(projectPaths(cfg, id).project, {}).theme || DEFAULT_THEME;
}

export function loadRecipe(cfg, layoutId, themeId = DEFAULT_THEME) {
  const card = readJson(join(cfg.dataDir, 'recipes', `${layoutId}.json`), null);
  if (!card) throw new Error(`recipe not found: ${layoutId}`);
  const theme = loadTheme(cfg, themeId);
  const own = theme.cards?.[layoutId] || {};
  const slots = {};
  for (const [name, slot] of Object.entries(card.slots)) {
    slots[name] = { ...slot, ...(theme.slotKinds?.[slot.kind] || {}), ...(own.slots?.[name] || {}) };
  }
  return {
    ...card,
    theme: theme.id,
    tokens: { ...(theme.tokens || {}), ...(own.tokens || {}) },
    typeScale: { ...card.typeScale, ...(theme.typeScale || {}), ...(own.typeScale || {}) },
    overlays: own.overlays ?? theme.overlays ?? [],
    fonts: { ...(theme.fonts || {}), ...(own.fonts || {}) },
    vars: { ...(theme.vars || {}), ...(own.vars || {}) },
    css: [theme.css, own.css].flat().filter(Boolean).join('\n'),
    world: theme.world || null,
    camera: !!theme.camera,
    slots,
  };
}

export const listThemes = (cfg) => fs.readdirSync(join(cfg.dataDir, 'themes')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
export const listRecipes = (cfg) => fs.readdirSync(join(cfg.dataDir, 'recipes')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();

export const readCache = (cfg, id) => readJson(projectPaths(cfg, id).cache, {});
export const writeCache = (cfg, id, cache) => writeJson(projectPaths(cfg, id).cache, cache);
export const writeTimings = (cfg, id, t) => writeJson(projectPaths(cfg, id).timings, t);

export function readReview(cfg, id) {
  return readJson(projectPaths(cfg, id).review, { contract: 'A1RecipeBoardReview/v1', verdicts: {} });
}

// One verdict per shot, bound to the candidate hash it was given against. verdict null clears it.
export function saveVerdict(cfg, id, input) {
  const { shotId, verdict } = input;
  const reasons = input.reasons || [];
  const note = input.note || '';
  if (!SHOT_ID.test(String(shotId))) throw new Error(`invalid shot id: ${shotId}`);
  if (verdict !== null && verdict !== 'pass' && verdict !== 'reject') throw new Error(`invalid verdict: ${verdict}`);
  const candidateHash = readCache(cfg, id)[shotId]?.hash;
  if (verdict && !candidateHash) throw new Error(`no rendered candidate for ${shotId}`);
  const review = readReview(cfg, id);
  if (verdict === null) delete review.verdicts[shotId];
  else review.verdicts[shotId] = {
    verdict,
    reasons: verdict === 'reject' ? reasons.filter((r) => REVIEW_REASONS.includes(r)) : [],
    note: String(note).slice(0, 500),
    candidateHash,
    at: new Date().toISOString(),
  };
  writeJson(projectPaths(cfg, id).review, review);
  return review.verdicts[shotId] ?? null;
}

function clipTitles(cfg, project) {
  const file = sourcePath(cfg, project.clipIndex);
  if (!file || !fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').trim().split('\n').slice(1)
    .map((l) => l.split(',')).map((c) => [c[0], `${c[3]} · ${c[4]}`]));
}

// Hand-repaired frames from the existing whole-frame closeout ledger (read-only), shown beside each
// shot so card candidates can be judged against what the per-shot repair route already achieved.
export function handRepairedStates(cfg, project) {
  const file = sourcePath(cfg, project.handRepairLedger);
  if (!file || !fs.existsSync(file)) return { observedAt: null, byShot: {} };
  const ledger = readJson(file);
  const byShot = {};
  const add = (t, status) => {
    const [shotId, state] = String(t.target || '').split(':');
    if (!shotId || !state || !t.imageArtifactId) return;
    (byShot[shotId] ||= []).push({ state, status, image: t.imageArtifactId });
  };
  (ledger.closedTargets || []).forEach((t) => add(t, 'pass'));
  (ledger.remainingTargets || []).forEach((t) => add(t, 'open'));
  const order = { ENTRY: 0, HOLD: 1, HANDOFF: 2 };
  Object.values(byShot).forEach((l) => l.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9)));
  return { observedAt: ledger.observedAt || null, closed: ledger.closed, total: ledger.originalGapCount, byShot };
}

export function boardRows(cfg, id) {
  const project = loadProject(cfg, id);
  const p = projectPaths(cfg, id);
  const cache = readCache(cfg, id);
  const review = readReview(cfg, id);
  const titles = clipTitles(cfg, project);
  const hand = handRepairedStates(cfg, project);
  const timings = Object.fromEntries((readJson(p.timings, { shots: [] }).shots || []).map((t) => [t.shotId, t]));
  const rows = loadShots(cfg, id).map((s) => {
    const c = cache[s.shotId];
    const v = review.verdicts[s.shotId];
    return {
      shotId: s.shotId,
      recipe: s.recipe,
      title: titles[s.shotId] || '',
      rendered: Boolean(c),
      hash: c?.hash || null,
      renderedAt: c?.renderedAt || null,
      renderMs: c?.renderMs ?? null,
      error: timings[s.shotId]?.error || null,
      degraded: c?.degraded || [],
      hasReference: fs.existsSync(join(p.refs, `${s.shotId}.jpg`)),
      verdict: v ? { ...v, stale: v.candidateHash !== c?.hash } : null,
      handRepaired: (hand.byShot[s.shotId] || []).map(({ state, status }) => ({ state, status })),
    };
  });
  const counts = { total: rows.length, pass: 0, reject: 0, pending: 0, todo: 0 };
  for (const r of rows) {
    if (r.verdict && !r.verdict.stale) counts[r.verdict.verdict] += 1; else counts.pending += 1;
    if (r.degraded.length) counts.todo += 1;
  }
  return { project: { id, title: project.title || id }, counts, recipes: listRecipes(cfg), handRepair: { observedAt: hand.observedAt, closed: hand.closed, total: hand.total }, rows };
}

// Image lookup for the page. Only three fixed kinds, each resolved from known locations — never a
// caller-supplied path.
export function boardImage(cfg, id, kind, shotId, state) {
  if (!SHOT_ID.test(String(shotId))) return null;
  const p = projectPaths(cfg, id);
  if (kind === 'reference') return existing(join(p.refs, `${shotId}.jpg`));
  if (kind === 'candidate') return existing(join(p.candidates, `${shotId}.png`));
  if (kind === 'hand') {
    const hit = (handRepairedStates(cfg, loadProject(cfg, id)).byShot[shotId] || []).find((s) => s.state === state);
    const file = hit && sourcePath(cfg, hit.image);
    return file && path.resolve(file).startsWith(cfg.sourceRoot + path.sep) ? existing(file) : null;
  }
  return null;
}

const existing = (file) => (fs.existsSync(file) && fs.statSync(file).isFile() ? file : null);

// A shot's last complete version (out/motion/<shot>/renders/good.mp4), kept while its new material waits: only one made
// under the house rules that hold now (user 2026-10-21: no subtitles, Traditional on screen, the house fonts). B35's
// was made on 10-21 before those and burned its Simplified subtitle into the reel and into B36 that replays it.
export function keptVersion(cfg, id, shotId) {
  const f = path.join(projectPaths(cfg, id).out, 'motion', shotId, 'renders', 'good.mp4'), rules = path.join(cfg.dataDir, 'routing', 'house-rules.json');
  try { return fs.statSync(f).mtimeMs >= fs.statSync(rules).mtimeMs ? f : null; } catch { return null; }
}
