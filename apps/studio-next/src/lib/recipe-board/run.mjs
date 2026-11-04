// One command for the whole line: look at what a project already has, do every step that is due, and
// list what waits on the user. Each step is idempotent (cached by content), so `run` is safe to repeat
// after any edit; it never redoes unchanged work.
//
//   plan → brief → storyboard → write → facts → screen → materials → fetch → art → stage → render → motion → medium → reel
//   (stage: the 3D shots, teardown-3d / scene-3d, get their plates from the style-lab engine, stage.mjs;
//    chapter: a run of morph-chapter shots is one continuous diagram an agent writes, checked and reviewed, chapter.mjs)
//
// User gates never stop the line: a shot whose material is not approved yet renders with its TODO
// placeholder, and the gate is listed at the end. Re-run after confirming to fill it in.
//   - material batch: confirm candidates on /recipe-board/materials (nothing is downloaded before)
//   - review: give each still a verdict on /recipe-board; rejected shots get no motion
//   - footage only the author has (needs of kind `presenter`): their own recording
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertScopeAllows, scopeRestriction } from './project-scope.mjs';
import { voiceState } from './voice.mjs';
import { assertRenderStorage, boardRows, loadShots, projectPaths, readPlan, writePlan, ensureProject, loadRecipe, loadTheme, projectTheme, loadProject } from './store.mjs';
import { passageState as passageStateOf } from './shotplan.mjs';
import { guardCheck } from '../../../../../scripts/workflow-guard.mjs';
import { houseFonts } from './house.mjs';
import { mediumDue } from './medium.mjs';
import { speechFor } from './motion.mjs';
import { briefState } from './brief.mjs';
import { storyboardState, redesignedBeats } from './storyboard.mjs';
import { chapterBeats, researchDue, changedNeeds, blockedMaterialForms } from './materials.mjs';
import { conceptState } from './concept.mjs';
import { stageState } from './stage.mjs';
import { chapterState, finalDue, chapterFinalAllowed, chapterCodeHash } from './chapter.mjs';
import { approvedGreybox } from './greybox.mjs';
import { greyboxNotFinalStatus, loadEngineCapabilities, engineCapabilitiesStatus, engineCapabilitiesSchemaErrors, retroHardStepErrors } from './p1hard.mjs';
import { profileOf } from './profile.mjs';
import { sixStage, lookOpen, polishOpen, sixSkips, finalAllows, pieceKey, gateLines, lookSheet, BEFORE_LOOK } from './gates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const STAGES = ['plan', 'voice', 'brief', 'storyboard', 'write', 'facts', 'screen', 'typedesign', 'materials', 'fetch', 'passages', 'concept', 'art', 'stage', 'chapter', 'render', 'critique', 'direct', 'motion', 'medium', 'reel'];
const MOTION_CODE = ['motion.mjs', 'motion-runtime.browser.js', 'compose.mjs', 'components.mjs', 'resolve.mjs', 'screen.mjs', 'variants.mjs', 'world.mjs', 'world-terminal.mjs', 'camera.mjs', 'display.mjs'];
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 20);

function materialState(cfg, id, { only = null } = {}) {
  const dir = path.join(projectPaths(cfg, id).root, 'materials');
  const needs = readJson(path.join(dir, 'needs.json'), { needs: [] }).needs || [];
  const candidates = readJson(path.join(dir, 'candidates.json'), { shots: {} }).shots || {};
  const approvals = readJson(path.join(dir, 'approvals.json'), { batches: [] }).batches || [];
  const bound = readJson(path.join(dir, 'bindings.json'), { shots: {} }).shots || {};
  const items = approvals.flatMap((b) => b.items || []);
  // a confirmation that failed to fetch, or whose cut no longer exists, goes back to the user
  const retry = (i) => i.status === 'failed' && (i.attempts || 1) < 3 && /net::ERR_|Timeout|ETIMEDOUT|ECONNRESET/.test(i.error || '');   // = materials.retryable
  const decided = new Set(items.filter((i) => !['superseded', 'failed', 'orphaned'].includes(i.status) || retry(i)).map((i) => i.shotId));
  // keyed per cut (B05, B05~1, …): a montage shot has one need per cut
  const key = (n) => (n.scene ? `${n.shotId}~${n.scene}` : n.shotId);
  // a need that changed since it was searched / confirmed / bound starts over (materials.retireChangedNeeds)
  const changed = new Set(changedNeeds(cfg, id));
  const live = (k) => !changed.has(k);
  const again = new Set(researchDue(readJson(path.join(dir, 'rounds.json'), { needs: {} }).needs || {}));
  const open = needs.filter((n) => !bound[key(n)] || !live(key(n)));
  // fetched material whose slot is empty again (the shot was rewritten): bind it back
  const shotFile = (n) => readJson(path.join(projectPaths(cfg, id).shots, `${n.shotId}.json`), null);
  const slotOf = (shot, n) => (n.bind === 'backdrop' ? shot?.backdrop : ((n.scene ? shot?.scenes?.[n.scene]?.slots : shot?.slots) || {})[n.bind]);
  return {
    needs,
    own: open.filter((n) => n.kind === 'presenter').map(key),
    changed: [...changed],
    blockedForm: blockedMaterialForms(cfg, id, { only }),
    // (and a need that found nothing usable, searched again in other words until its rounds are spent: materials.mjs searchVariant)
    unsearched: open.filter((n) => n.kind !== 'presenter' && (!candidates[key(n)] || !live(key(n)) || again.has(key(n)))).map(key),
    toConfirm: open.filter((n) => n.kind !== 'presenter' && live(key(n)) && candidates[key(n)]?.candidates?.length && !decided.has(key(n))).map(key),
    noCandidate: open.filter((n) => n.kind !== 'presenter' && candidates[key(n)] && !candidates[key(n)].candidates?.length).map(key),
    toFetch: items.filter((i) => (i.status === 'approved' || retry(i)) && !bound[i.shotId] && live(i.shotId)).map((i) => i.shotId),
    toBind: needs.filter((n) => bound[key(n)] && live(key(n)) && n.bind && !chapterBeats(cfg, id).has(n.shotId) && !(bound[key(n)].role === 'logo' && n.bind === 'background') && (() => { const v = slotOf(shotFile(n), n); return !v?.asset && !v?.video; })()).map(key),
    needsSegment: items.filter((i) => i.status === 'needs-segment').map((i) => i.shotId),
  };
}

// Motion is rebuilt when the shot, its card or the motion code changed since the last render. The
// storyboard's design notes (shot.design) are not rendered, so they are left out of the key.
// The pictures a shot points at count too: a material replaced under the same path (a page re-captured,
// a clip re-cut) makes motion due. Kept beside the key (renders/source.assets) so existing keys stay valid.
const REPO = path.resolve(HERE, '../../../../..');
export function assetStamps(shot, root = REPO) {
  const out = [];
  const walk = (v, k) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x));
    if (!v || typeof v !== 'object') return;
    for (const [key, x] of Object.entries(v)) {
      const file = key === 'asset' && typeof x === 'string' ? x : key === 'video' && typeof x?.path === 'string' ? x.path : null;
      if (file) { const f = path.isAbsolute(file) ? file : path.join(root, file); out.push(fs.existsSync(f) ? `${file}:${fs.statSync(f).size}:${Math.round(fs.statSync(f).mtimeMs)}` : `${file}:missing`); }
      else walk(x, key);
    }
  };
  walk(shot);
  return out.sort().join('|');
}
// the speech a shot is built to (only presets that build to it): a new recording re-renders those shots
const SPEECH_PRESETS = new Set(['enter']);
const speechKeyFor = (cfg, id) => (s) => ([s.motion?.preset, ...(s.scenes || []).map((x) => x.preset)].some((p) => SPEECH_PRESETS.has(p)) ? speechFor(cfg, id, s) : '');
export function motionKey(shot, speech = '') {
  const code = MOTION_CODE.map((f) => fs.readFileSync(path.join(HERE, f), 'utf8')).join('\n');
  const { design, ...rendered } = shot;
  // a shot with a mechanism diagram also follows the mechanism module (others keep their keys)
  const mech = JSON.stringify(rendered).includes('"mechanism"') ? sha(fs.readFileSync(path.join(HERE, 'motion-mechanism.browser.js'), 'utf8')) : '';
  return sha(JSON.stringify(rendered) + sha(code) + mech + (speech ? sha(JSON.stringify(speech)) : ''));
}
const assetFiles = (shot, root) => assetStamps(shot, root).split('|').filter(Boolean).map((x) => x.split(':')[0]).map((f) => (path.isAbsolute(f) ? f : path.join(root, f)));
const motionKeyFile = (p, shotId) => path.join(p.out, 'motion', shotId, 'renders', 'source.key');
// What a motion render is made from: the built page (html, timing, runtime code) and its assets by name and
// size (asset names carry their content hash). A code change that leaves a shot's page as it was needs no
// new render: the old one is kept and only its key moves (a one-card change re-rendered whole films).
// a recipe card's built page measured every 0.2 s (cardgeometry.mjs motionGeometry); the problems are kept beside the
// build (renders/geometry.json) for the white model and the review
// (id: the project, whose reference beat strip the still-ground measure compares against)
export async function cardCheck(cfg, dir, shot, id = null) {
  const { motionGeometry } = await import('./cardgeometry.mjs'), H = await import('./house.mjs'), { referenceBeats } = await import('./reference.mjs');
  const strip = id ? referenceBeats(cfg, id)[shot.shotId]?.strip ?? null : null;
  const geo = await motionGeometry(cfg, dir, shot.motion.duration, shot.shotId, { fold: H.traditionalOn() ? H.toHant : null, strip });
  // the built page opened once (cardsmoke.mjs): it throws, keeps a cursor or a CJK-comma letter list on a lettered page, or
  // shows an older recall than its shot's: a fault of the card path, held like its geometry
  try { const { cardSmoke } = await import('./cardsmoke.mjs'); for (const say of await cardSmoke(dir, shot, { lettered: H.lettered() })) geo.push({ kind: 'card-path', at: 0, say: `CARD ${say}` }); } catch (e) { geo.push({ kind: 'card-path', at: 0, say: `CARD not opened: ${String(e.message || e).split('\n')[0]}` }); }
  fs.mkdirSync(path.join(dir, 'renders'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'renders', 'geometry.json'), JSON.stringify(geo, null, 1) + '\n');
  return geo;
}
export function motionPageHash(dir) {
  const parts = [];
  const walk = (d, rel = '') => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (r === 'renders') continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full, r); continue; }
      parts.push(/\.(html|js|json|css)$/.test(e.name) ? `${r}:${sha(fs.readFileSync(full))}` : `${r}:${fs.statSync(full).size}`);
    }
  };
  walk(dir);
  return sha(parts.join('\n'));
}
// Renders made before keys existed count as current while they are newer than the shot file.
function motionDue(p, shot, key, root = REPO) {
  const mp4 = path.join(p.out, 'motion', shot.shotId, 'renders', 'motion.mp4');
  if (!fs.existsSync(mp4)) return true;
  const f = motionKeyFile(p, shot.shotId);
  if (!fs.existsSync(f)) return fs.statSync(mp4).mtimeMs < fs.statSync(path.join(p.shots, `${shot.shotId}.json`)).mtimeMs;
  if (fs.readFileSync(f, 'utf8').trim() !== key) return true;
  const af = path.join(path.dirname(f), 'source.assets');
  if (fs.existsSync(af)) return fs.readFileSync(af, 'utf8').trim() !== assetStamps(shot, root);
  // renders from before asset stamps: due when a picture is newer than the render
  const made = fs.statSync(mp4).mtimeMs;
  return assetFiles(shot, root).some((x) => fs.existsSync(x) && fs.statSync(x).mtimeMs > made);
}

// What each step would do now, without doing it.
export function projectState(cfg, id, { only = null } = {}) {
  const speechOf = speechKeyFor(cfg, id);
  const p = projectPaths(cfg, id);
  const plan = readPlan(cfg, id);
  const shots = loadShots(cfg, id, only);
  const have = new Set(loadShots(cfg, id).map((s) => s.shotId));
  const unwritten = (plan?.beats || []).filter((b) => b.route?.recipe && !have.has(b.id) && (!only || only.has(b.id))).map((b) => b.id);
  const screen = shots.filter((s) => s.screen?.capture && !fs.existsSync(path.join(p.root, 'materials', 'screen', s.shotId, 'telemetry.json'))).map((s) => s.shotId);
  const rows = Object.fromEntries(boardRows(cfg, id).rows.map((r) => [r.shotId, r]));
  const rejected = new Set(Object.values(rows).filter((r) => r.verdict?.verdict === 'reject' && !r.verdict.stale).map((r) => r.shotId));
  const motion = shots.filter((s) => s.motion && !rejected.has(s.shotId) && motionDue(p, s, motionKey(s, speechOf(s)), cfg.sourceRoot || REPO)).map((s) => s.shotId);
  return {
    plan: !!plan,
    voice: scopeRestriction(loadProject(cfg, id), 'voice') || voiceState(cfg, id),
    shots: have.size,
    unwritten,
    screen,
    materials: materialState(cfg, id, { only }),
    unreviewed: shots.filter((s) => !rows[s.shotId]?.verdict || rows[s.shotId].verdict.stale).map((s) => s.shotId),
    // (a chapter beat's picture is its module's: its card's empty slots are no placeholder on screen)
    todo: shots.filter((s) => s.recipe !== 'morph-chapter' && rows[s.shotId]?.degraded?.length).map((s) => `${s.shotId}:${rows[s.shotId].degraded.map((d) => d.slot).join('+')}`),
    rejected: [...rejected],
    motion,
    medium: mediumDue(cfg, id, shots.filter((s) => s.motion && !rejected.has(s.shotId))).map((s) => s.shotId),
    brief: briefState(cfg, id).state,
    storyboard: storyboardState(cfg, id).state,
    redesign: redesignedBeats(cfg, id).filter((b) => !only || only.has(b)),
    // a world to pick once its key frames are drawn (none drawn yet: nothing to ask)
    chapter: (() => { const c = chapterState(cfg, id, { only }); return { waiting: c.filter((x) => x.state === 'waiting' && x.taskFresh).map((x) => x.g.id), staleTasks: c.filter((x) => x.state === 'waiting' && !x.taskFresh).map((x) => x.g.id), rejected: c.filter((x) => x.state === 'rejected').map((x) => x.g.id), answered: c.filter((x) => x.state === 'answered').map((x) => x.g.id), details: c.map((x) => ({ id: x.g.id, state: x.state, taskFresh: x.taskFresh, inputHash: x.hash, greyboxState: x.input.inheritance?.greyboxState || 'none', sourceCount: Object.values(x.input.inheritance?.files || {}).filter(Boolean).length, missingSources: Object.entries(x.input.inheritance?.files || {}).filter(([, hash]) => !hash).map(([file]) => file), motionShots: x.input.motionContract?.shots?.length || 0, motionEvidence: x.check?.inputHash === x.hash && x.state !== 'answered' ? x.check.motionEvidence || null : null, pendingReview: x.check?.pendingReview || null, reviewProvenance: (x.check?.warnings || []).find((w) => String(w).startsWith('review provenance:')) || null })) }; })(),
    stage: (() => { const st = stageState(cfg, id, { only }); return { due: st.due, toBuild: st.toBuild }; })(),
    passages: (loadProject(cfg, id).passages || []).map((g) => ({ seg: g.seg, state: passageStateOf(cfg, id, g) })),
    concept: sixStage(loadProject(cfg, id) || {}) ? null : (() => { const c = conceptState(cfg, id); return c.missing.length < c.worlds.length * c.keys.length ? c : null; })(),
    greyboxState: approvedGreybox(cfg, id).state,
  };
}

export async function runProject(cfg, id, { article = null, beats = null, title = '', presenter = false, only = null, to = 'reel', from = 'plan', skip = [], dry = false, chapterRounds = 4, task = null, log = console.log } = {}) {
  if (!STAGES.includes(to) || !STAGES.includes(from)) throw new Error(`stages: ${STAGES.join(' → ')}`);
  // --skip materials also skips fetch. Use exactly the execution predicate for admission.
  const asked = (s) => STAGES.indexOf(s) >= STAGES.indexOf(from) && STAGES.indexOf(s) <= STAGES.indexOf(to) && !skip.includes(s) && !(s === 'fetch' && skip.includes('materials'));
  // Reject before plan writes, storage checks, dispatch or automatic gate handling.
  const projectFile = path.join(cfg.dataDir, 'projects', String(id), 'project.json');
  const stillsOnly = fs.existsSync(projectFile) && !!scopeRestriction(loadProject(cfg, id), 'voice');
  // Coverage is an explicit request; STILLS_ONLY alone only restricts operations.
  const wholeFilmStills = stillsOnly && loadProject(cfg, id)?.stillsCoverage === 'whole-film';
  const dynamicStages = new Set(['voice', 'stage', 'chapter', 'motion', 'medium', 'reel']);
  if (stillsOnly) { const excluded = STAGES.filter(s => dynamicStages.has(s) && asked(s)); if (excluded.length) log(`  STILLS_ONLY: skipped dynamic stages: ${excluded.join(', ')}; existing media remains read-only`); }
  if (only != null && !dry) {
    const selected = STAGES.filter(asked).filter((s) => s !== 'typedesign');
    if (article || beats || selected.length !== 1 || !['brief', 'chapter'].includes(selected[0]))
      throw new Error('MATERIALS_ONLY_SCOPE_UNSUPPORTED: run --only permits only a brief-only or chapter-only stage selection; other writing ranges are blocked. Chapter scope is not a single-shot or no-asset guarantee.');
  }
  const speechOf = speechKeyFor(cfg, id);
  // a six-stage film (gates.mjs): until the user approved its look, the line does the script, the facts, the plans and
  // the key frames, and stops there (the look sheet); nothing is searched, painted, built or rendered at length
  const lookHeld = (s) => !BEFORE_LOOK.includes(s) && sixStage(loadProject(cfg, id) || {}) && !lookOpen(cfg, id);
  const sixHeld = (s) => sixSkips(loadProject(cfg, id), s, polishOpen(cfg, id));   // gatestate.mjs sixSkips
  const active = (s) => asked(s) && !(stillsOnly && dynamicStages.has(s)) && !lookHeld(s) && !sixHeld(s);
  const step = (name, detail) => log(`\n▸ ${name}${detail ? '  ' + detail : ''}`);
  // (a new film from its article or beats is made first: run --beats on a new id failed looking for its folder, the
  // banana blind test of 2026-10-26)
  if ((article || beats) && !dry) ensureProject(cfg, id, title);
  const p = projectPaths(cfg, id);
  // One shot failing a step is logged and skipped; the rest of the line goes on.
  const failures = [];
  const failed = (shotId, stage, e) => { failures.push(`${stage} ${shotId}: ${String(e.message || e).split('\n')[0].slice(0, 160)}`); log(`  ${shotId} FAILED ${String(e.message || e).split('\n')[0].slice(0, 160)}`); };

  if (dry) return await report(cfg, id, only, log, { write: false });
  // no task, no work (AGENTS.md 不自发创作): a run that names its task passes the guard before writing
  if (task) {
    const g = guardCheck({ root: cfg.repoRoot, project: id, task });
    if (!g.ok) throw new Error('WORKFLOW_GUARD: ' + g.errors.join('; '));
    log(`  guard ${id}/${task}: ok`);
  }
  assertRenderStorage(cfg, id);

  if (active('plan')) {
    if (!readPlan(cfg, id) || article || beats) {
      const director = await import('./director.mjs');
      ensureProject(cfg, id, title);
      if (article) {
        step('plan', `article ${article}`);
        // (no Codex judges a manual project's beats: the session's agent writes them with --beats; this is a draft)
        const { agentFor } = await import('./agenttask.mjs'), byCodex = agentFor(cfg, id, 'plan') === 'codex';
        writePlan(cfg, id, await director.directArticle(cfg, { text: fs.readFileSync(article, 'utf8'), title, hasPresenter: presenter, mode: byCodex ? 'auto' : 'no-codex' }));
        if (!byCodex) log('  a draft of the beats (no Codex: agents.default manual); the session\'s agent writes the beats and runs again with --beats <file>');
      } else if (beats) {
        step('plan', `beats ${beats}`);
        const given = JSON.parse(fs.readFileSync(beats, 'utf8'));
        writePlan(cfg, id, director.planFromBeats(cfg, { ...given, beats: given.beats, title: title || given.title, source: beats, hasPresenter: presenter || given.hasPresenter }));
      } else if (!fs.existsSync(p.shots) || !fs.readdirSync(p.shots).length) {
        throw new Error(`${id} has no plan: pass --article <file> (or --beats <file>)`);
      }
      const plan = readPlan(cfg, id);
      if (plan) log(`  ${plan.beats.length} beats · ${Object.entries(plan.summary.intents).map(([k, v]) => `${k} ${v}`).join(' · ')}${plan.summary.gaps.length ? `\n  gaps: ${plan.summary.gaps.map((g) => g.gap).join('; ')}` : ''}`);
    }
  }

  // Voice: with a recording, every beat is placed on the seconds where it is spoken (voice.mjs); the
  // storyboard plans those lengths and the reel is laid over the recording.
  let voiceChanged = false;
  if (active('voice') && readPlan(cfg, id)) {
    const { stepVoice } = await import('./voice.mjs');
    try {
      const r = stepVoice(cfg, id, { log: (l) => log('  ' + l) });
      if (r.state === 'aligned') { voiceChanged = true; const b = Object.values(r.timings.beats); step('voice', `${b.length} beats on the recording, ${b.at(-1).end.toFixed(1)} s`); }
      if (r.state === 'missing') step('voice', `recording not found: ${r.audio}`);
    } catch (e) { failed('voice', 'voice', e); }
  }

  // Brief: the whole-film director plan, a fill-in task for any agent (prompts/brief.md). It does not hold
  // the line: until it is accepted, `run` lists it as waiting on an agent.
  if (active('brief') && readPlan(cfg, id)) {
    const { stepBrief } = await import('./brief.mjs');
    try {
      const r = await stepBrief(cfg, id, { log: (l) => log('  ' + l) });
      if (r.state !== 'current') step('brief', r.state === 'accepted' ? `accepted${r.warnings?.length ? `, ${r.warnings.length} warnings` : ''}` : r.state === 'rejected' ? `answer rejected: ${r.errors.length} errors` : 'task written, waiting for an agent');
      (r.errors || []).slice(0, 8).forEach((e) => log('  ✗ ' + e));
      (r.warnings || []).slice(0, 8).forEach((w) => log('  · ' + w));
    } catch (e) { failed('brief', 'brief', e); }
  }

  // Look (look.mjs): the brief's world becomes the film's theme, so every card is drawn in it (a picked world wins)
  if (active('brief') && readPlan(cfg, id)) {
    const { stepLook } = await import('./look.mjs');
    try { const r = stepLook(cfg, id); if (r.state === 'written') step('look', `the film's own theme ${r.theme}`); } catch (e) { failed('look', 'look', e); }
  }

  // Storyboard: one designed shot per beat (prompts/storyboard.md), after the brief. Accepted designs are
  // applied to the plan and shots; shots whose card changed are rewritten by the write step below.
  if (active('storyboard') && readPlan(cfg, id)) {
    const { stepStoryboard, applyStoryboard } = await import('./storyboard.mjs');
    try {
      const r = await stepStoryboard(cfg, id, { log: (l) => log('  ' + l) });
      if (!['current', 'blocked'].includes(r.state)) step('storyboard', r.state === 'accepted' ? `accepted · ${r.applied.updated.length} shots updated, ${r.applied.redesign.length} to rewrite${r.warnings?.length ? `, ${r.warnings.length} warnings` : ''}` : r.state === 'rejected' ? `answer rejected: ${r.errors.length} errors` : 'task written, waiting for an agent');
      if (r.state === 'current') applyStoryboard(cfg, id);
      (r.errors || []).slice(0, 10).forEach((e) => log('  ✗ ' + e));
      (r.warnings || []).slice(0, 10).forEach((w) => log('  · ' + w));
    } catch (e) { failed('storyboard', 'storyboard', e); }
  }

  let state = projectState(cfg, id, { only });
  if (active('write') && state.redesign.length) {
    step('write', `${state.redesign.length} shots changed card in the storyboard: ${state.redesign.join(',')}`);
    const { writeShots } = await import('./writer.mjs');
    const { applyStoryboard } = await import('./storyboard.mjs');
    await writeShots(cfg, id, { only: new Set(state.redesign), rewrite: true, log: (l) => log('  ' + l) });
    applyStoryboard(cfg, id);
    state = projectState(cfg, id, { only });
  }
  if (active('write') && state.unwritten.length) {
    step('write', `${state.unwritten.length} beats without a shot`);
    const { writeShots } = await import('./writer.mjs');
    await writeShots(cfg, id, { only: new Set(state.unwritten), log: (l) => log('  ' + l) });
    const { applyStoryboard } = await import('./storyboard.mjs');
    applyStoryboard(cfg, id);
  }

  if (active('facts') && readPlan(cfg, id)) {
    const { recheckFacts } = await import('./writer.mjs');
    const flagged = await recheckFacts(cfg, id);
    step('facts', flagged.length ? `${flagged.length} shots show numbers not in the text` : 'every number traces to the text or an archived source');
    flagged.forEach((l) => log('  ' + l));
  }

  state = projectState(cfg, id, { only });
  if (active('screen') && state.screen.length) {
    step('screen', `capture ${state.screen.join(',')}`);
    const { captureScreen } = await import('./screen-capture.mjs');
    for (const shot of loadShots(cfg, id, new Set(state.screen))) {
      try {
        const { telemetry } = await captureScreen(cfg, id, shot);
        log(`  ${shot.shotId} targets ${Object.keys(telemetry.targets).join(',')}`);
      } catch (e) { failed(shot.shotId, 'screen', e); }
    }
  }

  if (only == null && active('typedesign')) {
    // the design step before any frame: every word says why it is here, what it is attached to, what it is made of
    const { stepTypeDesign } = await import('./typedesign.mjs');
    try {
      const r = await stepTypeDesign(cfg, id, { log: (l) => log('  ' + l) });
      step('typedesign', r.state === 'accepted' ? `accepted · ${r.stats.lines} lines, ${r.stats.type3d} 3D` : r.state === 'rejected' ? `answer rejected: ${r.errors.length} errors` : r.state === 'waiting' ? 'task written, waiting for an agent' : r.state);
      if (r.state === 'rejected') for (const e of r.errors.slice(0, 6)) log('  ' + e);
    } catch (e) { failed('typedesign', 'typedesign', e); }
  }

  if (active('materials') && state.materials.unsearched.length) {
    const changed = new Set(state.materials.changed);
    const blockedMaterials = state.materials.unsearched.filter((key) => changed.has(key));
    const searchable = state.materials.unsearched.filter((key) => !changed.has(key));
    for (const key of blockedMaterials) log(`  ${key} blocked: changed material need requires reconciliation; history retained`);
    if (!searchable.length && blockedMaterials.length) {
      log('  materials blocked: reconcile changed needs without rewriting history before searching; no material ledger writes. Process report is read-only.');
      const r = await report(cfg, id, only, log, { write: false });
      return { ...r, blockedMaterials, failures, status: 'blocked' };
    }
    step('materials', `search ${searchable.length} needs (no download)`);
    const m = await import('./materials.mjs');
    await m.findCandidates(cfg, id, { only: searchable, log: (l) => log('  ' + l) });
    const r = m.proposeBatch(cfg, id);
    log(`  proposed ${r.picks.length} picks${r.skipped.length ? `, nothing usable for ${r.skipped.join(',')}` : ''}`);
  }

  // reading windows cut by an older rule are cut again and their shots bound again
  if (active('fetch')) {
    const m = await import('./materials.mjs');
    const { materialsLock } = await import('./shotplan.mjs');
    const lockOwner = await materialsLock(cfg, id, (l) => log('  ' + l));
    try {
      const materialLog = (l) => log('  ' + l);
      m.reproposeOnRuleChange(cfg, id, { log: materialLog });
      await m.recheckPicks(cfg, id, { log: materialLog, lockOwner });
      m.repickFailed(cfg, id, { log: materialLog });
      await m.autoApproveTrustedWithLock(cfg, id, { log: materialLog, lockOwner });
      const redone = await m.refreshReadingWindows(cfg, id, { only, log: materialLog });
      if (redone.length) m.bindShots(cfg, id, { only: new Set(redone.map((k) => k.split('~')[0])), log: materialLog });
      state = projectState(cfg, id, { only });
      if (state.materials.toFetch.length || state.materials.toBind.length) {
        step('fetch', `${state.materials.toFetch.length} approved items${state.materials.toBind.length ? `, bind back ${state.materials.toBind.join(',')} (fetched earlier, shot rewritten)` : ''}`);
        if (state.materials.toFetch.length) await m.fetchApproved(cfg, id, { log: materialLog, lockOwner });
        m.bindShots(cfg, id, { only, log: materialLog });
        const { recheckFacts } = await import('./writer.mjs');
        const flagged = await recheckFacts(cfg, id);
        if (flagged.length) log(`  facts: ${flagged.length} shots still show numbers found neither in the text nor in an archived source`);
      }
    } finally { lockOwner(); }
  }
  state = projectState(cfg, id, { only });
  // passages laid out as shot modules by the shot director (shotplan.mjs; project.passages: [{ seg, range, blind? }]):
  // the task, the check against the reference (or the playbook), the material loop, then the passage film
  if (active('passages') && (loadProject(cfg, id).passages || []).length) {
    step('passages', (loadProject(cfg, id).passages || []).map((g) => g.seg).join(','));
    try { const { stepPassages } = await import('./shotplan.mjs'); await stepPassages(cfg, id, { log, render: STAGES.indexOf(to) >= STAGES.indexOf('motion') }); } catch (e) { failed('passages', 'passages', e); }
  }

  // concept: style frames of the key shots in each world, until the user picks one (concept.mjs)
  if (active('concept') && !only) {
    const { stepConcept } = await import('./concept.mjs');
    try {
      const r = stepConcept(cfg, id, { log: (l) => log('  ' + l) });
      if (r.picked) step('concept', `world ${r.picked}`);
      else step('concept', `${r.worlds.length} worlds × ${r.keys.length} key shots drawn, waiting for a pick`);
    } catch (e) { failed('concept', 'concept', e); }
  }

  if (active('art')) {
    const { fillProjectArt } = await import('./arttemplates.mjs');
    const { realArt, artRequests, cachedArt } = await import('./imagegen.mjs');
    const filled = await fillProjectArt(cfg, id, { only, log: (l) => log('  template ' + l) });
    const due = [];
    const seen = new Set();
    for (const shot of loadShots(cfg, id, only)) for (const art of artRequests(shot)) {
      const k = JSON.stringify(art);
      if (!seen.has(k) && !cachedArt(cfg, art)) { seen.add(k); due.push([shot.shotId, art]); }
    }
    // the photographed displays the film's high points are shown on (display.mjs)
    const { projectDisplays, platePrompt } = await import('./display.mjs');
    const theme0 = loadTheme(cfg, projectTheme(cfg, id));
    for (const [shotId, kind] of projectDisplays(cfg, id, theme0)) {
      const plate = platePrompt(kind, theme0), k = JSON.stringify(plate);
      if (!seen.has(k) && !cachedArt(cfg, plate)) { seen.add(k); due.push([shotId, plate]); }
    }
    step('art', `${filled.pieces} template pieces · ${due.length} images to generate`);
    // One image at a time: each is a provider claim under the global cap.
    for (const [shotId, art] of due) {
      let r;
      // a real object comes from a real free photograph first (imagegen.mjs house art policy)
      try { r = await realArt(cfg, art, { log: () => {} }); } catch (e) { failed(shotId, 'art', e); continue; }
      log(`  ${shotId} ${r.cached ? 'cached' : r.real ? `real photo (${r.real.license})` : `new ${r.seconds}s`}${r.textChars ? `  text chars ${r.textChars}` : ''}  ${art.prompt.slice(0, 60)}`);
    }
  }

  // 3D plates (stage.mjs): one at a time through the style-lab engine, bound into the shot as a clip
  if (active('stage')) {
    const { stepStage } = await import('./stage.mjs');
    try {
      const st = stageState(cfg, id, { only });
      if (st.items.length) {
        if (st.due.length) step('stage', `${st.due.length} plates: ${st.due.join(',')}`);
        // what the library lacks is built first (image generation + image-to-3D), unless art is skipped
        const r = await stepStage(cfg, id, { only, log, build: !skip.includes('art') });
        if (r.built?.length) log(`  built: ${r.built.join(',')}`);
        if (r.made.length) log(`  plates bound: ${r.made.join(',')}`);
        if (r.toBuild.length) log(`  to build first: ${r.toBuild.join('; ')}`);
      }
    } catch (e) { failed('stage', 'stage', e); }
  }

  // keyframes (keyframes.mjs): the picture each key beat is built to, drawn from the storyboard's design in the
  // film's world before anything is built (the chapters are written and scored against them)
  // (not on a six-stage film: its look is its world's frames set by the modules, never the image model's whole frames — L96)
  if (asked('chapter') && !skip.includes('art') && !skip.includes('keyframes') && !sixStage(loadProject(cfg, id) || {})) {
    try {
      const { stepKeyframes } = await import('./keyframes.mjs');
      const r = await stepKeyframes(cfg, id, { only, log });
      if (r.made.length) step('keyframes', `${r.made.length} key beats drawn: ${r.made.join(',')}${r.kept.length ? `, ${r.kept.length} kept` : ''}`);
    } catch (e) { failed('keyframes', 'keyframes', e); }
  }

  // Explicit still production uses the existing task/check/review consumer, not the
  // world/greybox orchestration. A once-approved design must not unschedule it.
  // stepStills itself waits for an accepted film design; no gate is approved here.
  if (asked('chapter') && wholeFilmStills && sixStage(loadProject(cfg, id) || {}) && profileOf(cfg, id).designFirst) {
    try { const { stepStills } = await import('./stills.mjs'); const r = await stepStills(cfg, id, { log: (l) => log('  ' + l) }); step('stills', `${r.state}${r.why ? ': ' + r.why : ''}`); } catch (e) { failed('stills', 'stills', e); }
  }

  // the look sheet of a six-stage film waiting for its look: the chapters' key frames and the cards' design frames
  if (asked('chapter') && !wholeFilmStills && lookHeld('chapter')) {
    // the film's world, derived from its subject once the storyboard is accepted (filmworld.mjs, agent task world), then
    // a few of its beats set in it by the card modules: the frames the user judges the look on
    if (storyboardState(cfg, id).state === 'current') {
      try { const { stepWorld, renderWorldFrames } = await import('./filmworld.mjs'); const w = await stepWorld(cfg, id, { log });
        if (w.state === 'accepted') { const made = await renderWorldFrames(cfg, id, { log }); step('world', `${w.style.title}: ${made.length} frames set in it`); } } catch (e) { failed('world', 'world', e); }
    }
    // the film's design, its hero stills (checked, reviewed blind) and its board, before the look is judged (stills.mjs)
    if (storyboardState(cfg, id).state === 'current' && profileOf(cfg, id).designFirst) {
      try { const { stepFilmLook } = await import('./stills.mjs'); const r = await stepFilmLook(cfg, id, { log: (l) => log('  ' + l) }); step('film look', r.state === 'ready' || r.state === 'approved' ? 'the hero stills passed their blind review: on the look sheet with the film\'s board' : `waiting for ${r.why || 'the hero stills\' fixes'}`); } catch (e) { failed('film look', 'film look', e); }
    }
    try { const r = await lookSheet(cfg, id, { log }); step('look', `${r.frames.length} key frames on ${r.sheet ? path.relative(p.root, r.sheet) : 'no sheet yet'}; the rest waits for your look`); } catch (e) { failed('look', 'look', e); }
  }

  // the look sheets kept current with the hero stills (a still changed after the look was approved waits for the user
  // again on a sheet that shows it; stills.mjs leaves this to the run: the web pages import it, never the gates)
  if (asked('chapter') && sixStage(loadProject(cfg, id) || {}) && profileOf(cfg, id).designFirst) { try { const { stillsReady } = await import('./stills.mjs'); if (stillsReady(cfg, id)) await lookSheet(cfg, id, { log }); } catch (e) { failed('look', 'look sheet', e); } }

  // chapters (chapter.mjs): an agent writes each continuous diagram, the line checks, reviews, renders and slices it
  if (active('chapter')) {
    // a film that turned the type gate on does not render a chapter until its type plan and blind review pass
    if (loadProject(cfg, id)?.typeGate) {
      const { typeGateState } = await import('./typedesign.mjs');
      const g = await typeGateState(cfg, id);
      if (g.state !== 'passed') throw new Error('TYPE_GATE: ' + g.errors.join('; '));
      log('  type gate: passed (' + g.stats.lines + ' lines, ' + g.stats.type3d + ' 3D)');
    }
    const { stepChapters, chapterGroups } = await import('./chapter.mjs');
    try {
      const groups = chapterGroups(cfg, id).filter((g) => !only || g.shots.some((s) => only.has(s.shotId)));
      if (groups.length) {
        step('chapter', `${groups.length} chapters: ${groups.map((g) => `${g.id}(${g.shots.length} beats, ${g.total.toFixed(1)} s)`).join(' ')}`);
        const r = await stepChapters(cfg, id, { only, log, rounds: chapterRounds });
        if (r.rendered.length) log(`  rendered: ${r.rendered.join(',')}`);
        if (r.bound.length) log(`  slices bound: ${r.bound.join(',')}`);
      }
    } catch (e) { failed('chapter', 'chapter', e); }
  }

  // recap cuts replay earlier shots: their picture slots point at those shots' renders
  if (active('render')) {
    const { applyRecalls, applyPresenterTakes } = await import('./writer.mjs');
    // a card that recurs takes its variants in turn (variants.mjs)
    const { assignVariants } = await import('./variants.mjs');
    const varied = assignVariants(cfg, id, { recipeFor: (r) => { try { return loadRecipe(cfg, r, projectTheme(cfg, id)); } catch { return null; } } });
    if (varied.length) log(`  variants: ${varied.join(' ')}`);
    const changed = applyRecalls(cfg, id);
    if (changed.length) log(`  recalls filled: ${changed.join(',')}`);
    const takes = await applyPresenterTakes(cfg, id);
    if (takes.length) log(`  presenter takes from the recording: ${takes.length} shots`);
  }
  if (active('render')) {
    const { renderProject } = await import('./render.mjs');
    const r = await renderProject(cfg, id, { only, log: () => {} });
    const fresh = r.shots.filter((s) => !s.cached);
    step('render', `${r.shots.length} stills, ${fresh.length} re-rendered${fresh.length ? ': ' + fresh.map((s) => s.shotId).join(',') : ''}`);
    r.shots.filter((s) => s.error).forEach((s) => log(`  ${s.shotId} ERROR ${s.error}`));
    // design checks (design-check.mjs) of the stills as drawn
    const flagged = r.shots.filter((s) => s.design?.length);
    if (flagged.length) {
      log(`  design checks: ${flagged.length} shots`);
      flagged.slice(0, 12).forEach((s) => log(`    ${s.shotId} ${s.design.map((f) => `${f.rule}(${f.slot}${f.detail ? ' ' + f.detail : ''})`).join('; ')}`.slice(0, 220)));
    }
  }

  // Critique: every still beside the replica of its card, scored with slot-level fixes (critique.mjs);
  // a report, not a gate: the weak shots are listed for the writer and the user.
  if (active('critique') && !only) {
    const { stepCritique } = await import('./critique.mjs');
    try {
      const r = await stepCritique(cfg, id, { log: (l) => log('  ' + l) });
      if (r.state === 'accepted') {
        const weak = r.report.shots.filter((s) => s.score <= 3).sort((a, b) => a.score - b.score);
        step('critique', `mean ${r.report.mean} of 5 · ${weak.length} shots at 3 or below`);
        weak.slice(0, 12).forEach((s) => log(`    ${s.shotId} ${s.score}  ${s.issues.map((x) => `${x.slot}: ${x.problem}`).join('；')}`.slice(0, 200)));
      } else if (r.state === 'rejected') step('critique', `answer rejected: ${r.errors.slice(0, 3).join('; ')}`);
      else if (r.state === 'waiting') step('critique', 'task written, waiting for an agent');
    } catch (e) { failed('critique', 'critique', e); }
  }

  // Director pass (direct.mjs): the cut watched as a sequence; revisions go back into the storyboard through
  // its checks, and the changed beats are written, fetched and rendered again before motion (capped rounds)
  if (active('direct') && !only) {
    const { stepDirect } = await import('./direct.mjs');
    try {
      const r = await stepDirect(cfg, id, { log: (l) => log('  ' + l) });
      if (r.state === 'revised') {
        step('direct', `round ${r.round}: ${r.applied.length} beats revised (${r.applied.map((a) => a.beat).join(',')})${r.dropped.length ? `, ${r.dropped.length} dropped by the checks` : ''}`);
        r.applied.forEach((a) => log(`  ${a.beat} → ${a.card}: ${a.fixes}`));
        await runProject(cfg, id, { from: 'write', to: 'direct', skip, chapterRounds, log });
      } else if (r.state === 'kept') step('direct', `round ${r.round}: the cut holds, nothing to revise`);
      else if (r.state === 'waiting') step('direct', 'task written, waiting for an agent');
    } catch (e) { failed('direct', 'direct', e); }
  }

  state = projectState(cfg, id, { only });
  let motionMade = 0, motionKept = 0;
  if (active('motion') && state.motion.length) {
    step('motion', `${state.motion.length} shots`);
    const { buildMotion, checkMotion, renderMotionAsync, compareMotion } = await import('./motion.mjs');
    const { pool } = await import('./pool.mjs');
    const checked = [];
    // a shot that replays another (recall) goes after it, and again if that shot was re-rendered just now
    const replays = (s) => JSON.stringify(s).includes('"recall":');
    let due = loadShots(cfg, id, new Set(state.motion));
    // a six-stage film renders a card fine only as the user approved the polished film (gates.mjs final)
    { const held = due.filter((s) => !finalAllows(cfg, id, s.shotId, pieceKey(motionKey(s)))); if (held.length) { log(`  ${held.length} cards wait for your approval of the polished film (gate final): ${held.map((s) => s.shotId).join(',')}`); due = due.filter((s) => !held.includes(s)); } }
    const one = async (shot) => {
      const t0 = Date.now();
      const key = motionKey(shot, speechOf(shot));
      try {
        const { dir } = await buildMotion(cfg, id, shot);
        const pageFile = path.join(dir, 'renders', 'page.hash'), page = motionPageHash(dir);
        if (fs.existsSync(path.join(dir, 'renders', 'motion.mp4')) && fs.existsSync(pageFile) && fs.readFileSync(pageFile, 'utf8').trim() === page) {
          fs.writeFileSync(motionKeyFile(p, shot.shotId), key + '\n');
          fs.writeFileSync(path.join(path.dirname(motionKeyFile(p, shot.shotId)), 'source.assets'), assetStamps(shot, cfg.sourceRoot || REPO) + '\n');
          motionKept++;
          return;
        }
        const check = checkMotion(dir);
        if (check.lintErrors) throw new Error(`lint failed\n${JSON.stringify(check.findings.filter((x) => x.section === 'lint'), null, 1)}`);
        // the geometry of every 0.2 s (cardgeometry.mjs): a fault standing 0.8 s holds the shot from its final render
        const geo = await cardCheck(cfg, dir, shot, id);
        if (geo.length) throw new Error(`geometry: ${geo.map((g) => g.say).join('; ')}`);
        compareMotion(cfg, id, shot, await renderMotionAsync(dir));
        fs.writeFileSync(path.join(dir, 'renders', 'check.json'), JSON.stringify(check, null, 1) + '\n');
        if (check.findings.length) checked.push(`${shot.shotId} ${[...new Set(check.findings.map((x) => x.code))].join(',')}`);
        fs.writeFileSync(pageFile, page + '\n');
      } catch (e) { failed(shot.shotId, 'motion', e); return; }
      fs.writeFileSync(motionKeyFile(p, shot.shotId), key + '\n');
      fs.writeFileSync(path.join(path.dirname(motionKeyFile(p, shot.shotId)), 'source.assets'), assetStamps(shot, cfg.sourceRoot || REPO) + '\n');
      motionMade++;
      log(`  ${shot.shotId.padEnd(12)} ${shot.motion.preset.padEnd(9)} ${shot.motion.duration}s  ${Math.round((Date.now() - t0) / 1000)}s`);
    };
    for (let pass = 0; pass < 2 && due.length; pass++) {
    if (pass) {
      const { renderProject } = await import('./render.mjs');
      await renderProject(cfg, id, { only: new Set(due.map((s) => s.shotId)), log: () => {} });
      log(`  again after the shots they replay: ${due.map((s) => s.shotId).join(',')}`);
    }
    // a few at a time (pool.mjs: as many as memory allows); the shots that replay another go after, one by one
    await pool(due.filter((s) => !replays(s)), one);
    for (const shot of due.filter(replays)) await one(shot);
    const now = new Set(projectState(cfg, id, { only }).motion);
    due = loadShots(cfg, id, now).filter(replays);
    }
    if (motionKept) log(`  ${motionKept} shots kept: their pages built the same as their renders`);
    if (checked.length) log(`  hyperframes check: ${checked.length} shots with findings (renders/check.json)\n    ${checked.join('\n    ')}`);
  }

  // Medium: only shots whose theme, project or shot sets one; everything else is untouched.
  let mediumMade = 0;
  if (active('medium')) {
    const { mediumDue, renderMedium } = await import('./medium.mjs');
    const due = mediumDue(cfg, id, loadShots(cfg, id, only).filter((s) => s.motion));
    if (due.length) {
      step('medium', `${due.length} shots`);
      try { mediumMade = (await renderMedium(cfg, id, due, { log: (l) => log('  ' + l) })).length; } catch (e) { failed('medium', 'medium', e); }
    }
  }

  // the reel follows the recording: newer timings than the reel mean it is laid again
  const reelFile = path.join(p.out, 'reel.mp4'), timings = path.join(p.root, 'voice', 'timings.json');
  const voiceNewer = fs.existsSync(timings) && fs.existsSync(reelFile) && fs.statSync(timings).mtimeMs > fs.statSync(reelFile).mtimeMs;
  // a six-stage film's final is its chapters' final renders (animatic.mjs buildFinal), once the final gate is passed;
  // the card reel below holds cards only
  // once the structure is approved, the final's road is tried while the film is polished (animatic.mjs preflightFilm,
  // kept by each module and the engine): a chapter that would not render is known now, not at the end (RETRO-20261028 4)
  // (on the design set the structure is approved with the design: the independent audit of 2026-10-28 found the preflight
  // never ran there, waiting on a rough approval the design set never writes)
  if (active('reel') && sixStage(loadProject(cfg, id) || {}) && (loadProject(cfg, id)?.rough?.approved || loadProject(cfg, id)?.design?.approved) && !loadProject(cfg, id)?.final?.approved) {
    try { const { preflightFilm } = await import('./animatic.mjs'); const r = await preflightFilm(cfg, id, { log: () => {} }); if (!r.ok) { step('final preflight', `${r.errors.length} problems`); r.errors.forEach((e) => log('  ✗ ' + e)); } }
    catch (e) { failed('preflight', 'final', e); }
  }
  if (active('reel') && sixStage(loadProject(cfg, id) || {}) && loadProject(cfg, id)?.final?.approved) {
    try { const { buildFinal } = await import('./animatic.mjs'); const r = await buildFinal(cfg, id, { log: (l) => log(l) }); step('final', `${r.beats} beats${r.missing.length ? `, no final render: ${r.missing.join(',')}` : ''}`); 
      // the retrospective, a fixed step after the final (retro.mjs: faults by kind, the user's notes, the lessons, the next three)
      if (r.file && !r.missing.length) { try { const rr = await (await import('./retro.mjs')).retro(cfg, id); step('retro', path.relative(cfg.repoRoot || process.cwd(), rr.file)); } catch (e) { log(`  retro: ${String(e.message || e).split('\n')[0]}`); } } }
    catch (e) { failed('final', 'final', e); }
  }
  if (active('reel') && (motionMade || mediumMade || voiceChanged || voiceNewer || !fs.existsSync(reelFile))) {
    const { buildReel } = await import('./sequence.mjs');
    const r = buildReel(cfg, id);
    step('reel', `${r.shots} shots${r.voiced ? `, laid over the recording (${r.voiced.toFixed(1)} s)` : ''}${r.missing.length ? `, no motion: ${r.missing.join(',')}` : ''}`);
    if (r.reel) log('  ' + r.reel);
    if (r.seams?.length) log(`  seams: ${r.seams.length} cuts that do not join (still, empty or a jerk of the camera)\n    ${r.seams.join('\n    ')}`);
    if (r.board) log('  ' + r.board);
  }

  // a gate shown to the user and left without a word for long is approved by the line (gates.mjs autoApprove, routing/autonomy.json)
  if (!dry && !wholeFilmStills && sixStage(loadProject(cfg, id) || {})) { try { const { autoApprove } = await import('./gates.mjs'); await autoApprove(cfg, id, { log }); } catch (e) { log(`  auto approval: ${String(e.message || e).split('\n')[0]}`); } }
  const r = await report(cfg, id, only, log);
  if (failures.length) { log('failed this run'); failures.forEach((l) => log('  · ' + l)); }
  return { ...r, failures };
}

// What is left, and which of it waits on the user.
export function reportComplete({ lines, proc, agentWork, gates, todo }) {
  return !!proc && lines.length <= 1 && !agentWork.length && !gates.length && !todo.length;
}
async function report(cfg, id, only, log, { write = true } = {}) {
  const s = projectState(cfg, id, { only });
  const m = s.materials, six = sixStage(loadProject(cfg, id) || {});   // (six: the card line's motion and stills review are not this film's: gatestate.mjs SIX_CARD_STEPS)
  const lines = [
    [s.voice.state === 'scope-restricted', `voice: ${s.voice.reason} (existing audio remains read-only)`],
    [!s.plan && !s.shots, 'no plan yet: run --article <file>'],
    [s.unwritten.length, `beats without a shot: ${s.unwritten.join(',')}`],
    [s.redesign.length, `shots to rewrite on their storyboard card: ${s.redesign.join(',')}`],
    [s.screen.length, `pages to capture: ${s.screen.join(',')}`],
    [m.changed.length, `blocked changed material needs (history retained; reconciliation required): ${m.changed.join(',')}`],
    [m.unsearched.length, `needs not searched: ${m.unsearched.join(',')}`],
    [m.toFetch.length, `approved, not fetched: ${m.toFetch.join(',')}`],
    [m.toBind.length, `fetched material to bind back: ${m.toBind.join(',')}`],
    [m.blockedForm.length, `blocked material form mismatch or unverified: ${m.blockedForm.join(',')}`],
    [!six && s.motion.length, `motion out of date: ${s.motion.join(',')}`],
    [s.medium.length, `medium out of date: ${s.medium.join(',')}`],
    [s.stage.due.length, `3D plates out of date: ${s.stage.due.join(',')}`],
    ...s.passages.filter((g) => ['no-task', 'to-check', 'accepted'].includes(g.state)).map((g) => [1, `passage ${g.seg}: ${{ 'no-task': 'task to write', 'to-check': 'answer to check', accepted: 'film to render' }[g.state]}`]),
  ].filter(([c]) => c).map(([, t]) => t);
  const agentWork = [
    [['waiting', 'stale'].includes(s.brief), `write the film brief: tasks/brief.task.json → tasks/brief.answer.json (rules: work/recipe-board-v1/prompts/brief.md)`],
    [s.brief === 'rejected', `fix the brief answer: see tasks/brief.check.json`],
    [['waiting', 'stale'].includes(s.storyboard), `write the storyboard: tasks/storyboard.task.json → tasks/storyboard.answer.json (rules: work/recipe-board-v1/prompts/storyboard.md)`],
    [s.storyboard === 'rejected', `fix the storyboard answer: see tasks/storyboard.check.json`],
    ...(await (async () => { if (!sixStage(loadProject(cfg, id) || {})) return []; const { worldState } = await import('./filmworld.mjs'), w = worldState(cfg, id);
      return [[w.state === 'waiting', 'derive the film\'s world from its subject: tasks/world.task.json → tasks/world.answer.json (rules: work/recipe-board-v1/prompts/world.md)'], [w.state === 'rejected', 'fix the world answer: see tasks/world.check.json']]; })()),
    [s.greyboxState === 'approved' && s.chapter.waiting.length, greyboxNotFinalStatus({ greyboxApproved: true, morphOk: false, chapterId: s.chapter.waiting[0] })],
    [s.chapter.waiting.length, `${s.greyboxState === 'approved' ? '灰盒非终态: greybox approved but ' : ''}write the chapter diagrams: ${s.chapter.waiting.map((c) => `tasks/morph-${c}.task.json → tasks/morph-${c}.answer.json`).join('; ')} (rules: work/recipe-board-v1/prompts/morph.md)${s.greyboxState === 'approved' ? ' — status=blocked (HOUSE: session-brief→morph→engine)' : ''}`],
    [s.chapter.staleTasks.length, `refresh the chapter tasks before dispatch: ${s.chapter.staleTasks.join(',')} (run the chapter step again)`],
    [s.chapter.answered.length, `chapter answers to check: run again (${s.chapter.answered.join(',')})`],
    [s.chapter.rejected.length, `fix the chapter diagrams: ${s.chapter.rejected.map((c) => `tasks/morph-${c}.check.json`).join('; ')}`],
    [s.stage.toBuild.length, `build in style-lab, then add to routing/stage-library.json (TODO plates until then): ${s.stage.toBuild.join('; ')}`],
    ...s.passages.filter((g) => g.state === 'waiting').map((g) => [1, `lay out passage ${g.seg}: tasks/shotplan-${g.seg}.task.json → tasks/shotplan-${g.seg}.answer.json (rules: work/recipe-board-v1/prompts/shotplan.md)`]),
    ...s.passages.filter((g) => g.state === 'rejected').map((g) => [1, `fix passage ${g.seg}: see tasks/shotplan-${g.seg}.check.json and .report.md`]),
    ...s.passages.filter((g) => g.state === 'review').map((g) => [1, `review the sheet of passage ${g.seg}: run once to write tasks/stillcheck-${g.seg}.task.json → .answer.json (rules: work/recipe-board-v1/prompts/stillcheck.md; sheet out/passages/${g.seg}/sheet.jpg)`]),
  ].filter(([c]) => c).map(([, t]) => t);
  // the house fonts are the user's to download (BOOTH needs their pixiv login): until all are in place nothing renders
  const hf = houseFonts();
  let gateWait = [];
  const gates = [
    [!hf.ready, `install the house fonts into ${'work/recipe-board-v1/fonts/house'}: ${hf.missing.join(', ')} (sources: routing/house-rules.json)`],
    [m.toConfirm.length, `confirm material for ${m.toConfirm.length} shots on /recipe-board/materials: ${m.toConfirm.join(',')}`],
    // the film's own gates first (gates.mjs: look, rough, final), each named with the command that records the approval
    ...(await gateLines(cfg, id)).map((l) => [1, l]),
    [(() => { gateWait = whiteModelWaits(cfg, id); return gateWait.length; })(), `watch the white model (node scripts/recipe-board.mjs animatic --project ${id} → out/animatic.mp4) and approve its chapters (--approve ${gateWait.join(',')}): their final renders wait for it`],
    [m.needsSegment.length, `give a time range for long videos: ${m.needsSegment.join(',')}`],
    [m.own.length, `your own recording or screenshot: ${m.own.join(',')}`],
    [m.noCandidate.length, `no candidate found (change the query or supply a file): ${m.noCandidate.join(',')}`],
    [s.concept && !s.concept.picked && s.concept.worlds.length && s.concept.keys.length, `pick a visual world (key frames in projects/${id}/concept/): node scripts/recipe-board.mjs concept --project ${id} --pick <${(s.concept?.worlds || []).map((w) => w.id).join('|')}>`],
    [!six && s.unreviewed.length, `review ${s.unreviewed.length} stills on /recipe-board`],
  ].filter(([c]) => c).map(([, t]) => t);
  // the director's waivers standing on the pictures they were written on (layers.mjs waive): the user may overrule any
  try { const L = await import('./layers.mjs'); for (const g of loadProject(cfg, id)?.passages || []) { const hashOf = Object.fromEntries(L.passageShots(cfg, id, g.seg).map((s) => [s.id, s.hash])); for (const w of L.readWaivers(cfg, id, g.seg).filter((x) => hashOf[x.shot] === x.hash)) lines.push(`waived by the director: ${g.seg} ${w.shot} ${w.item} — ${w.why} (mark the shot bad on /recipe-board/passages to overrule)`); } } catch { /* no passages */ }
  // the process measured (process.mjs: first-pass share, rounds, the user's notes), every run
  let proc = null; try { const { processMetrics, processLine } = await import('./process.mjs'); proc = processMetrics(cfg, id, { write }); lines.push(processLine(proc)); } catch { /* a project with nothing reviewed */ }
  // (a six-stage film before its look: the chapters, the stills, the materials and the renders are not due yet; listing them
  // as waiting read as work left undone — the Vol.047 run)
  if (sixStage(loadProject(cfg, id) || {}) && !lookOpen(cfg, id)) {
    const later = /^(beats without a shot|needs not searched|approved, not fetched|fetched material|motion out of date|medium out of date|3D plates|shots to rewrite|pages to capture|write the chapter diagrams|refresh the chapter tasks|chapter answers|fix the chapter|review \d+ stills|confirm material)/;
    for (const arr of [lines, agentWork, gates]) arr.splice(0, arr.length, ...arr.filter((l) => !later.test(l)));
  }
  log(`\n${id}: ${s.voice.state !== 'scope-restricted' && reportComplete({ lines, proc, agentWork, gates, todo: s.todo }) ? 'every step is done' : 'left to do'}`);
  lines.forEach((l) => log('  · ' + l));
  if (s.todo.length) log(`  · placeholders on screen: ${s.todo.length} shots (${s.todo.slice(0, 8).join(' ')}${s.todo.length > 8 ? ' …' : ''})`);
  if (agentWork.length) { log('waits on an agent'); agentWork.forEach((l) => log('  · ' + l)); }
  if (gates.length) { log('waits on you'); gates.forEach((l) => log('  · ' + l)); }
  // G4: surface executable engine-capabilities status every report
  let engines = null;
  try {
    const capDoc = loadEngineCapabilities(cfg);
    const schemaErr = engineCapabilitiesSchemaErrors(capDoc);
    engines = engineCapabilitiesStatus(capDoc);
    if (schemaErr.length) log(`  · engine-capabilities schema: ${schemaErr.slice(0, 2).join('; ')}`);
    else if (engines?.line) log(`  · ${engines.line}`);
  } catch { /* catalog optional on bare projects */ }
  // G10: final approved → retro lesson drafts hard step (status surface)
  try {
    const p = loadProject(cfg, id) || {};
    if (p.final?.approved) {
      const retroFile = path.join(projectPaths(cfg, id).out, 'film', 'retro.md');
      const draftsFile = path.join(projectPaths(cfg, id).out, 'film', 'retro-lesson-drafts.json');
      const inbox = path.join(cfg.dataDir, 'routing', 'lesson-inbox.json');
      let draftCount = 0;
      try { draftCount = (JSON.parse(fs.readFileSync(draftsFile, 'utf8')).items || []).length; } catch {}
      if (!draftCount) { try { draftCount = (JSON.parse(fs.readFileSync(inbox, 'utf8')).items || []).filter((x) => x.from === 'retro' || String(x.id || '').startsWith('retro-')).length; } catch {} }
      for (const msg of retroHardStepErrors({ finalApproved: true, hasRetroFile: fs.existsSync(retroFile), draftCount })) {
        gates.push(msg); log(`  · ${msg}`);
      }
    }
  } catch { /* */ }
  return { left: lines, gates, agentWork, state: s, engines };
}

// chapters whose final render is due and waits for the user's approval of their white model (chapter.mjs gate)
// (a six-stage film is approved once, as a whole: gates.mjs final, listed by gateLines)
export function whiteModelWaits(cfg, id) {
  if (sixStage(loadProject(cfg, id) || {})) return [];
  const out = [];
  for (const st of chapterState(cfg, id)) {
    if (st.state !== 'accepted' && !st.rec?.draft) continue;
    const mp4 = path.join(projectPaths(cfg, id).out, 'chapters', st.g.id, 'out', 'render', `${st.g.id}-clean.mp4`), mod = path.join(projectPaths(cfg, id).root, 'chapters', `${st.g.id}.mjs`);
    const h = chapterCodeHash(cfg, id, st.g); if (h && finalDue(mp4, h, st.rec) && !chapterFinalAllowed(cfg, id, st.g)) out.push(st.g.id);
  }
  return out;
}
