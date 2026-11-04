// The hero stills: the film's hero moments made before any chapter, reviewed, and approved by the user once with the
// film's board (the user 2026-10-27: 返工次数有点太多 … 按你说的都执行好). What is decided where it is cheap stays decided:
// the look, the colour script, the big type of the open, the peak and the close are seen as frames and approved before
// the chapters are written to them — no chapter is rebuilt because the film's direction changed under it.
//   1. stills: one module (the morph format) holding only the hero beats, a few seconds each, built from the templates
//      and the big-type moves (prompts/stills.md); rendered and checked as a chapter is (runtimeCheck).
//   2. stills-taste: its keyframes with the board and the compositions' exemplars to two reviewers who did not make
//      them (prompts/taste.md), averaged per beat (beatdesign.mjs mergeTaste).
//   3. the board approved: gate look, bound to the design and the stills it shows (boardHash); until then no chapter is
//      designed. A chapter module takes its hero beat from the approved still.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { projectPaths, loadProject } from './store.mjs';
import { requiresEventContract, directorIntentErrors } from './directorroutes.mjs';
import { acceptedFilmDesign, filmRows, filmAccent } from './filmdesign.mjs';

import { buildStillReviewPack, verifyStillReviewPack } from './still-review-pack.mjs';
import { reviewSubmissionStatus } from './agenttask.mjs';

// Called before either review task is first written, and again before consuming receipts.
export function stillReviewMaterialsStatus(task) {
  const p = task?.input?.stillReviewPack;
  if (!p) return { ok: false, errors: ['still review materials absent'] };
  const errors = [...verifyStillReviewPack(p).errors];
  if (!p.expectedBeats?.length || p.coverage.missing.length || p.coverage.duplicates.length || p.coverage.unexpected.length) errors.push('still review task coverage incomplete');
  for (const s of p.shots || []) if (s.version.status !== 'bound' || Object.values(s.images).some(i => i.status !== 'available')) errors.push(`${s.beat}: render binding or image role unknown/stale`);
  return { ok: !errors.length, errors };
}
export async function prepareStillReviewTasks(cfg, id, { task, pack, filmBeats, forCheck }) {
  const { writeTask, readTask } = await import('./agenttask.mjs');
  const t = { ...task, forCheck, independentReview: { writerStep: STILLS_STEP }, answers: ['tasks/stills-taste.answer.json', 'tasks/stills-taste-2.answer.json'],
    input: { ...task.input, deliveryScope: 'Internal candidate/design review, not mature delivery. Use maturity:null for ordinary reviews; a non-null maturity in the existing answer is required only by export-stills --scope mature: whole-film-stills coverage, original-size/downscaled/whole-board inspection, concrete observations and clarity/compositionHierarchy/imageTextIntegration/materialSubjectCredibility/wholeFilmCoherence per beat plus wholeFilmCoherence overall. Each dimension in each independent review must be >=4; 3 means functional but below approved references. Never average away a weak dimension. Missing evidence/disagreement stays unresolved. User gates unchanged.', submission: 'Two fresh independent reviewers submit separate candidates with submit-task --step stills-taste and --step stills-taste-2. Both receipts must be distinct from the writer and each other. Do not write legacy answer-2.json directly.', stillReviewPack: pack, filmCoverage: { expected: filmBeats, missing: filmBeats.filter(b => !pack.coverage.provided.includes(b)), scope: 'Whole-film inventory only; not this hero-stills task coverage' } },
    images: [...new Set([...pack.shots.map(s => s.images['original-size'].path).filter(Boolean), ...pack.shots.flatMap(s => Object.values(s.images).filter(i => i.status === 'available').map(i => i.path)), ...(task.images || [])])] };
  const valid = stillReviewMaterialsStatus(t); if (!valid.ok) return valid;
  let created = false;
  for (const step of [STILLS_TASTE, `${STILLS_TASTE}-2`]) {
    const old = readTask(cfg, id, step);
    const { writtenAt, contract, step: _step, project, answerFile, ...body } = old || {};
    if (JSON.stringify(body) !== JSON.stringify(t)) { writeTask(cfg, id, step, t); created = true; }
  }
  return { ok: true, created };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const STILLS_STEP = 'stills', STILLS_TASTE = 'stills-taste', STILL_DUR = 5;

// (pure) the hero beats as one short chapter: each its own few seconds, in the film's order
// Coverage is an explicit opt-in; STILLS_ONLY restricts operations, not beat selection.
export function stillsGroup(design, beats, { targetBeat = null, coverage = 'hero-event' } = {}) {
  // (each still its beat's whole length: an approved still is the film's beat itself, heroChapter — five seconds cut a six-second beat short)
  if (targetBeat !== null && (typeof targetBeat !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(targetBeat) || (design?.beats || []).filter(r => r.beat === targetBeat).length !== 1 || beats.filter(b => b.beat === targetBeat && typeof b.text === 'string' && b.text.trim() && Number.isFinite(b.dur) && b.dur > 0).length !== 1)) throw new Error('invalid target beat or missing complete source beat');
  const all = targetBeat === null && coverage === 'whole-film';
  if (targetBeat === null && !['hero-event', 'whole-film'].includes(coverage)) throw new Error('invalid stills coverage');
  const rows = design?.beats || [];
  if (all) {
    const sourceIds = beats.map(b => b.beat), designIds = rows.map(r => r.beat);
    if (!sourceIds.length || new Set(sourceIds).size !== sourceIds.length || new Set(designIds).size !== designIds.length || sourceIds.length !== designIds.length || sourceIds.some(id => !designIds.includes(id)) || beats.some(b => typeof b.beat !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(b.beat) || typeof b.text !== 'string' || !b.text.trim() || !Number.isFinite(b.dur) || b.dur <= 0)) throw new Error('whole-film stills require exact unique design/source beats with complete text and duration');
  }
  let t = 0; const shots = (all ? beats.map(b => rows.find(r => r.beat === b.beat)) : rows).filter((r) => targetBeat === null ? all || r.hero || requiresEventContract(r) : r.beat === targetBeat).map((r) => { const b = beats.find((x) => x.beat === r.beat), dur = b?.dur || STILL_DUR, s = { shotId: r.beat, text: b?.text || '', at: +t.toFixed(3), dur }; t += dur; return s; });
  return { id: targetBeat === null ? 'STILLS' : `STILLS-${targetBeat}`, shots, total: +t.toFixed(3) };
}
export const boardHash = (cfg, id) => { const P = projectPaths(cfg, id), d = path.join(P.root, 'tasks'); return sha([fs.existsSync(path.join(d, 'filmdesign.answer.json')) ? fs.readFileSync(path.join(d, 'filmdesign.answer.json'), 'utf8') : '', (fs.existsSync(path.join(d, `${STILLS_STEP}.answer.json`)) ? fs.readFileSync(path.join(d, `${STILLS_STEP}.answer.json`), 'utf8') : '')].join('|')); };   // (bound to the stills' answer, not its check's hash: that takes in the engine and the checks, and a trace change cancelled the approved look, 2026-10-27; changed pictures go back to the blind review by their prints)
// the hero stills passed the line's checks and their blind review, for the answer as it stands
export function stillsReady(cfg, id) {
  const d = path.join(projectPaths(cfg, id).root, 'tasks'), c = readJson(path.join(d, `${STILLS_STEP}.check.json`)), r = readJson(path.join(d, `${STILLS_TASTE}.check.json`));
  if (c?.taskMode === 'stills') {
    const tasks = [STILLS_TASTE, `${STILLS_TASTE}-2`].map(step => ({ step, task: readJson(path.join(d, `${step}.task.json`)) }));
    const receipts = tasks.map(({step, task}) => reviewSubmissionStatus(cfg, id, step, task, {writerStep: STILLS_STEP}));
    if (!tasks.every(({task}) => task?.forCheck === c.answerHash && stillReviewMaterialsStatus(task).ok) || !receipts.every(r => r.ok) || new Set(receipts.map(r => r.reviewerThread)).size !== 2) return false;
  }
  return !!(c?.ok && r?.ok && r.forAnswer === c.answerHash);
}
// the board approved by the user for the design and stills it shows now
// the look (or the design) approved — once: the stills changed after it stay approved and are shown at the final (the user
// 2026-10-28: 定样子/定设计只批一次，之后改动不重开、不挡章节)
export function boardApproved(cfg, id) { const p = loadProject(cfg, id) || {}; return !!(p.look?.approved || (p.gateSet === 'design' && p.design?.approved)); }

const fullHash = x => crypto.createHash('sha256').update(x).digest('hex');
export function renderInputs(cfg, id, assets) {
  const root = projectPaths(cfg, id).root;
  const files = new Set([...[ 'project.json', 'storyboard.json', 'style.json', 'materials/bindings.json', 'tasks/stills.task.json', 'tasks/stills.answer.json', 'tasks/filmdesign.answer.json' ].map(f => path.join(root, f)), ...Object.values(assets)]);
  const walk = d => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.') || ['out', 'node_modules', 'views'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(m?js|html|css|json|ttf|otf|woff2?|glb|gltf|bin|png|jpe?g|webp|hdr|exr|svg)$/.test(p)) files.add(p); } };
  walk(path.join(cfg.dataDir, 'style-lab/engine')); walk(path.join(cfg.dataDir, 'fonts/house')); walk(path.join(cfg.dataDir, 'routing'));
  // Legacy OCR memo is generated by chapterHouse, not a font/specification input.
  files.delete(path.join(cfg.dataDir, 'fonts/house/legibility.json'));
  // The actual local OCR decisions consumed by this render remain byte-bound.
  walk(path.join(projectPaths(cfg, id).out, 'font-legibility'));
  return [...files].filter(f => fs.existsSync(f)).sort().map(p => { const b = fs.readFileSync(p); return { path: p, hash: fullHash(b), bytes: b.length, status: 'available' }; });
}
async function reviewPackForCheck(cfg, id, g, check, task) {
  const root = projectPaths(cfg, id).root;
  return buildStillReviewPack({ root, reviewBinding: { cfg, project: id, step: STILLS_TASTE, task, writerStep: STILLS_STEP }, outDir: path.join(projectPaths(cfg, id).out, 'stills-review', check.answerHash), expectedBeats: g.shots.map(s => s.shotId), inputFiles: (check.renderInputs || []).map(i => i.path), shots: check.keyframes.map((f, k) => {
    const frame = path.join(root, f), telemetryFile = frame.replace(/\.png$/, '.shapes.json');
    const telemetry = fs.existsSync(telemetryFile) && check.geometryBindings?.[k] === fullHash(fs.readFileSync(telemetryFile)) ? readJson(telemetryFile) : null;
    const boxes = [...(telemetry?.drawn || []), ...(telemetry?.shapes || [])].map((b, j) => ({ id: `${b.group || b.id || 'shape'}-${j}`, x: b.inkX?.[0] ?? b.x0, y: b.ink?.[0] ?? b.y0, w: (b.inkX?.[1] ?? b.x1) - (b.inkX?.[0] ?? b.x0), h: (b.ink?.[1] ?? b.y1) - (b.ink?.[0] ?? b.y0) })).filter(b => [b.x,b.y,b.w,b.h].every(Number.isFinite) && b.w > 0 && b.h > 0);
    return { beat: g.shots[k]?.shotId, frame, renderBinding: check.renderBindings?.[k], layoutPreflight: telemetry?.layoutPreflight ? { ...telemetry.layoutPreflight, frameHash: telemetry.frameHash } : null, geometry: telemetry?.frameHash ? { frameHash: telemetry.frameHash, method: 'Runtime frame-bound drawn ink and registered shape boxes, 1920x1080; unregistered mesh/raster internal boundaries remain unknown', boxes } : null, assets: [...Object.values(check.assets || {}).map(f => path.join(root, f)), ...(telemetry ? [telemetryFile] : [])] };
  }) });
}

export async function stepStills(cfg, id, { log = console.log, targetBeat = null } = {}) {
  const { writeTask, readTask, writeCheck, taskPaths, writerSubmissionStatus, submissionPath, sha: taskSha } = await import('./agenttask.mjs');
  const C = await import('./chapter.mjs'), B = await import('./beatdesign.mjs');
  const design = acceptedFilmDesign(cfg, id); if (!design) return { state: 'waiting', why: 'the film\'s design' };
  const projectScope = loadProject(cfg, id);
  const coverage = targetBeat === null ? projectScope?.stillsCoverage ?? 'hero-event' : 'target-beat';
  const beats = C.filmBeats(cfg, id), g = stillsGroup(design, beats, { targetBeat, coverage }), rows = filmRows(design, g.shots.map((s) => s.shotId), filmAccent(cfg, id), (await import('./palettes.mjs')).loadPalettes(cfg)), lib = B.loadCompositions(cfg);
  // filmBeats follows existing shot/plan order; export-stills inventories storyboard.
  // Require the same complete set before writing a whole-film task.
  if (coverage === 'whole-film') {
    const expected = readJson(path.join(projectPaths(cfg, id).root, 'storyboard.json'))?.shots?.map(b => b.beat) || [];
    if (!expected.length || new Set(expected).size !== expected.length || expected.length !== g.shots.length || expected.some(b => !g.shots.some(s => s.shotId === b))) throw new Error('whole-film stills require exact unique storyboard/source coverage');
  }
  // the materials in hand for these beats with their quality and crop (filmdesign materialsInHand): the frame takes the crop
  const { materialsInHand } = await import('./filmdesign.mjs'), inHand = materialsInHand(cfg, id, { subjects: Object.fromEntries(design.beats.filter((r) => r.subject).map((r) => [r.beat, r.subject])) });
  const DR = await import('./directorroutes.mjs'), F = await import('./filmdesign.mjs');
  const table = DR.loadDirectorRoutes(cfg), devices = F.loadDevices(cfg);
  const referenceQueries = g.shots.map((s) => {
    const f = design.beats.find((r) => r.beat === s.shotId) || {};
    const route = DR.pickDirectorDefaults({ ...f, text: s.text }, { table, devices });
    return { beat: s.shotId, text: s.text, kind: route.kind, routeResolved: true, composition: route.composition,
      devices: [...new Set([...(f.devices || []), ...(f.device ? [f.device] : []), ...route.devices])], gold: route.gold };
  });
  const writerTask = { rules: 'work/recipe-board-v1/prompts/stills.md', schema: 'work/recipe-board-v1/routing/stills.schema.json',
    input: { taskMode: 'stills', chapter: g.id, total: g.total, acceptanceScope: 'Still frames only: facts, evidence, assets, subject and type/layout remain hard checks. Motion/event/narration timing is deferred to chapter acceptance; do not add motion to pass stills.', visualDirection: 'work/recipe-board-v1/SEMANTIC-VISUAL-DIRECTION.md', ...((await import('./gatestate.mjs')).userLockedOf(loadProject(cfg, id), g.shots.map((s) => s.shotId)) ? { userLocked: (await import('./gatestate.mjs')).userLockedOf(loadProject(cfg, id), g.shots.map((s) => s.shotId)) } : {}), beats: g.shots.map((s) => ({ ...s, film: rows.find((r) => r.beat === s.shotId) || null, materials: (inHand[s.shotId] || []).map((m) => ({ file: path.relative(path.join(projectPaths(cfg, id).out, 'chapters', 'STILLS'), m.file), what: m.what, size: m.quality ? [m.quality.w, m.quality.h] : null, crop: m.quality?.box || null, border: m.quality?.border || null, subject: m.quality?.subject ?? null })) })), arc: design.arc, compositions: lib.compositions.filter((c) => c.template), typeMoves: lib.typeMoves, rubric: B.rubric(cfg), style: 'work/recipe-board-v1/style-lab/STYLE-house-20261027.md', profile: 'gawx', stalled: readJson(taskPaths(cfg, id, STILLS_TASTE).check)?.stalled || [], referenceQueries, guidance: (await import('./techniques.mjs')).chapterGuidance(cfg, id, referenceQueries), capabilities: 'work/recipe-board-v1/routing/engine-capabilities.json', routes: JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'engine-capabilities.json'), 'utf8')).routes } };
  if (targetBeat !== null) {
    writerTask.input.stalled = writerTask.input.stalled.filter(x => x.beat === targetBeat);
    // Relative paths in the task describe the selected chapter's future directory.
    for (const beat of writerTask.input.beats) for (const material of beat.materials) material.file = path.relative(path.join(projectPaths(cfg, id).out, 'chapters', g.id), path.resolve(projectPaths(cfg, id).out, 'chapters', 'STILLS', material.file));
  }
  // Bind writer receipt to stable semantic task input, never writtenAt.
  writerTask.input.coverage = coverage;
  writerTask.input.projectScope = projectScope?.scope ?? null;
  writerTask.inputHash = fullHash(JSON.stringify(writerTask.input));
  const writerStep = targetBeat === null ? STILLS_STEP : `${STILLS_STEP}-${targetBeat}`;
  if (readTask(cfg, id, writerStep)?.inputHash !== writerTask.inputHash) writeTask(cfg, id, writerStep, { ...writerTask, instance: crypto.randomUUID() });
  if (targetBeat !== null) {
    const tp = taskPaths(cfg, id, writerStep);
    let bytes, answer;
    try { bytes = fs.readFileSync(tp.answer); answer = JSON.parse(bytes); } catch { return { state: 'waiting', why: 'isolated writer submission required', task: writerStep, keyframes: [] }; }
    const proof = writerSubmissionStatus(cfg, id, writerStep, sha(bytes));
    if (!proof.ok || readJson(submissionPath(cfg, id, writerStep))?.taskHash !== taskSha(fs.readFileSync(tp.task))) return { state: 'waiting', why: proof.why || 'writer submission is bound to a different task', task: writerStep, keyframes: [] };
    if (['art', 'maps', 'glyphs', 'pages', 'bakes'].some(k => answer[k] != null && (!Array.isArray(answer[k]) || answer[k].length)) || answer.hairline != null) return { state: 'blocked', why: 'isolated runtime requires no assets or shared generation', keyframes: [] };
    const prep = await C.prepareAssets(cfg, id, g, answer, { log, taskMode: 'stills', isolatedTarget: true });
    const errors = [...prep.errors, ...C.checkCode(answer.code)];
    if (!errors.length && Object.keys(prep.assets || {}).length) errors.push('isolated runtime blocked: assets must be empty');
    if (errors.length) {
      writeCheck(cfg, id, writerStep, { taskMode: 'stills', ok: false, stage: 'preparation', errors, warnings: prep.notes, keyframes: [], assets: {} });
      return { state: errors.some(e => /provider unavailable|runtime blocked/.test(e)) ? 'blocked' : 'rejected', errors, keyframes: [] };
    }
    const project = loadProject(cfg, id);
    const pre = [...rows.flatMap(r => directorIntentErrors(r)), ...C.retiredPropErrors(answer.code, project), ...C.codePropErrors(answer.code, project), ...C.photoPlaneSubjectErrors(answer.code, project, { film: rows }), ...C.subjectPipelineErrors(answer.code, project, { film: rows, cfg }), ...C.routedErrors(answer, g.shots, project, (await import('./refbreakdown.mjs')).loadDevices(cfg), { symbols: (await import('./refbreakdown.mjs')).loadKitSymbolIndex(cfg) })];
    let r;
    try { r = pre.length ? { errors: pre, warnings: [], keyframes: [] } : await C.runtimeCheck(cfg, id, g, answer.code, {}, { taskMode: 'stills', isolatedTarget: targetBeat }); }
    catch (e) { return { state: 'blocked', why: `isolated runtime unavailable: ${e.message}`, keyframes: [] }; }
    if (r.keyframes.length) r.errors.push(...await C.bibleKeyErrors(cfg, id, g, r.keyframes, { taskMode: 'stills' }));
    const complete = r.keyframes.length === 1 && r.geometryIntegrity?.frames > 0 && ['drawn', 'shapes'].every(k => r.geometryIntegrity?.coverage?.[k]?.status === 'pass');
    const check = { taskMode: 'stills', ok: !r.errors.length && complete, stage: 'runtime', errors: r.errors, warnings: r.warnings || [], keyframes: r.keyframes.map(f => path.relative(projectPaths(cfg, id).root, f)), assets: {}, geometryIntegrity: r.geometryIntegrity || null };
    writeCheck(cfg, id, writerStep, check);
    return { state: r.errors.length ? 'rejected' : complete ? 'checked' : 'unknown', errors: r.errors, warnings: r.warnings || [], keyframes: r.keyframes, task: writerStep };
  }
  const answerFile = taskPaths(cfg, id, STILLS_STEP).answer;
  const waitingWithPreview = (why) => {
    const old = readJson(taskPaths(cfg, id, STILLS_STEP).check), root = projectPaths(cfg, id).root;
    const keyframes = old?.ok ? (old.keyframes || []).map(f => path.join(root, f)).filter(f => fs.existsSync(f)) : [];
    return { state: 'waiting', why, keyframes };
  };
  let answerBytes, answer;
  try { answerBytes = fs.readFileSync(answerFile); answer = JSON.parse(answerBytes); } catch { return waitingWithPreview('the hero stills (tasks/stills.task.json)'); }
  if (!answer?.code) return waitingWithPreview('the hero stills (tasks/stills.task.json)');
  // Admission precedes lettering, Hairline, asset generation and runtime rendering.
  // Historical checked pictures remain viewable, but do not authorize new work.
  const proof = writerSubmissionStatus(cfg, id, STILLS_STEP, sha(answerBytes));
  if (!proof.ok) return waitingWithPreview(proof.why);
  // A missing task recreated with identical semantic input is still a new task instance.
  const receipt = readJson(submissionPath(cfg, id, STILLS_STEP));
  if (receipt?.taskHash !== taskSha(fs.readFileSync(taskPaths(cfg, id, STILLS_STEP).task))) return waitingWithPreview('writer submission is bound to a different task');
  const collisionErrors = C.hairlineAssetKeyErrors(answer);
  if (collisionErrors.length) return { state: 'rejected', errors: collisionErrors, keyframes: [] };
  C.ensureLettering(cfg, id);
  // Opt in only: bind the selected fixed image and its dependency-bound key to the still check.
  let hairline = null;
  if (answer.hairline != null) {
    try { hairline = await (await import('./hairline-still.mjs')).prepareFixedHairline(projectPaths(cfg, id).root, answer.hairline); }
    catch (e) { return { state: 'rejected', errors: [`Hairline: ${e.message}`], keyframes: [] }; }
  }
  const tp = taskPaths(cfg, id, STILLS_STEP), h = sha((hairline ? JSON.stringify({ spec: answer.hairline, key: hairline.key, pngHash: hairline.pngHash }) : '') + 'stills-v1|' + JSON.stringify(readJson(path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json'), {})) + answer.code + JSON.stringify(answer.motionImplementation || []) + JSON.stringify(design.motionRules || null) + JSON.stringify(answer.maps || []) + JSON.stringify(answer.art || []) + JSON.stringify(answer.pages || []) + JSON.stringify(answer.bakes || []) + JSON.stringify(rows) + C.checksHash() + C.engineCodeHash(cfg) + (loadProject(cfg, id)?.lettering || ''));   // (the design these beats follow, the checks and the templates are part of what was checked)
  let check = readJson(tp.check);
  const cachedAssets = Object.fromEntries(Object.entries(check?.assets || {}).map(([k, f]) => [k, path.join(projectPaths(cfg, id).root, f)]));
  const captureChanged = (check?.keyframes || []).some((f, k) => { const p = path.join(projectPaths(cfg, id).root, f), g = p.replace(/\.png$/, '.shapes.json'); return !fs.existsSync(p) || !fs.existsSync(g) || fullHash(fs.readFileSync(p)) !== check.renderBindings?.[k]?.frameHash || fullHash(fs.readFileSync(g)) !== check.geometryBindings?.[k]; });
  if (check?.answerHash !== h || captureChanged || !check?.geometryBindings || JSON.stringify(check?.renderInputs) !== JSON.stringify(renderInputs(cfg, id, cachedAssets))) {
    const prep = await C.prepareAssets(cfg, id, g, answer, { log, taskMode: 'stills', preparedHairline: hairline });
    const _proj = loadProject(cfg, id); const pre = [...(prep.errors || []), ...rows.flatMap(r => directorIntentErrors(r)), ...C.retiredPropErrors(answer.code, _proj), ...C.codePropErrors(answer.code, _proj), ...C.photoPlaneSubjectErrors(answer.code, _proj, { film: rows }), ...C.subjectPipelineErrors(answer.code, _proj, { film: rows, cfg }), ...C.routedErrors(answer, g.shots, _proj, (await import('./refbreakdown.mjs')).loadDevices(cfg), { symbols: (await import('./refbreakdown.mjs')).loadKitSymbolIndex(cfg) })];
    // Materialize project-local OCR output before pinning the render's consumed inputs.
    if (!pre.length) await C.chapterHouse(cfg, answer.code, id, prep.assets || {});
    const inputsBefore = renderInputs(cfg, id, prep.assets || {});
    const r = pre.length ? { errors: pre, keyframes: [] } : await C.runtimeCheck(cfg, id, g, answer.code, prep.assets, { taskMode: 'stills', motionContract: { contract: 'A1ShotMotionContract/v1', chapter: g.id, ...(design.motionRules ? { motionRules: design.motionRules } : {}), shots: rows.filter(requiresEventContract).map(r => ({ shotId: r.beat, directorIntent: r.directorIntent })) }, motionImplementation: answer.motionImplementation });
    if (!pre.length) r.errors = [...r.errors, ...(await C.bibleKeyErrors(cfg, id, g, r.keyframes, { taskMode: 'stills' }))];   // (the type bible holds the stills as it holds the chapters)
    const inputsAfter = renderInputs(cfg, id, prep.assets || {});
    const renderBindings = JSON.stringify(inputsBefore) === JSON.stringify(inputsAfter) ? (r.keyframes || []).map(f => ({ inputHash: fullHash(JSON.stringify(inputsBefore)), frameHash: fullHash(fs.readFileSync(f)) })) : [];
    check = { checksHash: C.checksHash(), renderInputs: inputsBefore, renderBindings, geometryBindings: (r.keyframes || []).map(f => { const p = f.replace(/\.png$/, '.shapes.json'); return fs.existsSync(p) ? fullHash(fs.readFileSync(p)) : null; }), taskMode: 'stills', ok: !r.errors.length, errors: r.errors, warnings: r.warnings || [], answerHash: h, keyframes: (r.keyframes || []).map((f) => path.relative(projectPaths(cfg, id).root, f)), assets: Object.fromEntries(Object.entries(prep.assets || {}).map(([k, f]) => [k, path.relative(projectPaths(cfg, id).root, f)])) };
    writeCheck(cfg, id, STILLS_STEP, check);
  }
  const shown = check.keyframes.map((f) => path.join(projectPaths(cfg, id).root, f));   // (the board shows the stills as they stand, passed or not)
  if (!check.ok) { log(`  ${STILLS_STEP}: sent back (${check.errors.length}): ${check.errors.slice(0, 3).join(' | ')}`); return { state: 'rejected', errors: check.errors, keyframes: shown }; }
  // the blind review of the stills, two reviewers averaged per beat
  const keyframes = check.keyframes.map((f) => path.join(projectPaths(cfg, id).root, f)), board = path.join(projectPaths(cfg, id).out, 'film', 'board.png');
  const tt = taskPaths(cfg, id, STILLS_TASTE), task = readTask(cfg, id, STILLS_TASTE), files = [tt.answer, taskPaths(cfg, id, `${STILLS_TASTE}-2`).answer];
  // a review given to these pictures stands when only the code under them changed (a check's trace, the engine): the
  // pictures the same by their prints, as the chapters keep a beat (2026-10-27: tracing a pair line by line sent the
  // approved Suez stills back for a fourth review with nothing on screen changed)
  const prints = keyframes.map((f) => C.picPrint(f)), had = readJson(tt.check);
  const { reviewSubmissionStatus } = await import('./agenttask.mjs');
  const reviewSteps = [STILLS_TASTE, `${STILLS_TASTE}-2`];
  const submissions = () => reviewSteps.map(step => reviewSubmissionStatus(cfg, id, step, readTask(cfg, id, step), { writerStep: STILLS_STEP }));
  const materials = stillReviewMaterialsStatus(task);
  if (task?.forCheck === h && materials.ok && submissions().every(s => s.ok) && new Set(submissions().map(s => s.reviewerThread)).size === 2 && had?.ok && had.prints && C.samePrints(had.prints, prints)) {
    if (had.forAnswer !== h) { writeCheck(cfg, id, STILLS_TASTE, { ...had, forAnswer: h, carried: [...(had.carried || []), { from: had.forAnswer, at: new Date().toISOString() }], ...(had.waived ? { waived: { ...had.waived, forAnswer: h } } : {}) }); log(`  ${STILLS_TASTE}: the reviewed pictures are unchanged — their review stands`); }
    return { state: boardApproved(cfg, id) ? 'approved' : 'ready', keyframes, ...(had.waived ? { waived: had.waived } : {}) };
  }
  if (task?.forCheck !== h || !materials.ok || task?.input?.stillReviewPack?.reviewChain?.schema !== task?.schema) {
    const t = B.tasteTask(cfg, id, g, { brief: null, keyframes, answerHash: sha(fs.readFileSync(tp.answer)), taste: B.turnedDownLooks(cfg) });
    t.input.taskMode = 'stills'; t.input.reviewNotes = check.warnings || []; t.input.film = rows; t.input.images = `前 ${keyframes.length} 张是这部片的重头样张（按片中顺序）；${fs.existsSync(board) ? '接着一张是整片设计板；' : ''}后面是构图的范例`;
    if (fs.existsSync(board)) t.images.splice(keyframes.length, 0, board);
    // the mature films' frames to judge against: one exemplar of each finished composition (the stills have no brief to name theirs)
    const ex = B.exemplarFrames(cfg, lib.compositions.filter((c) => c.template).flatMap((c) => (c.exemplars || []).slice(0, 1))); t.images.push(...ex.filter((f) => !t.images.includes(f)));
    const RL0 = await import('./reviewlist.mjs'), lists0 = RL0.readLists(tt.task); t.lists = lists0; t.input.images += RL0.listNote(lists0, { passed: RL0.gatePassed(tt.task) });   // (the road to 4: reviewlist.mjs)
    t.input.images = 'Image roles are explicitly listed per beat in stillReviewPack; remaining images are board/exemplars. Unknown reference consumption is not a visual pass.';
    const pack = await reviewPackForCheck(cfg, id, g, check, t);
    const prepared = await prepareStillReviewTasks(cfg, id, { task: t, pack, filmBeats: beats.map(b => b.beat), forCheck: h });
    if (!prepared.ok) return { state: 'review-materials', errors: prepared.errors, keyframes: shown };
    return { state: 'review', why: `the stills' blind review (tasks/${STILLS_TASTE}.task.json)`, keyframes: shown };
  }
  const fresh = (f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > fs.statSync(tt.task).mtimeMs;
  if (!files.every(fresh)) return { state: 'review', why: `the stills' blind review (tasks/${STILLS_TASTE}.task.json)`, keyframes: shown };
  const receiptStatus = submissions();
  if (!receiptStatus.every(s => s.ok) || new Set(receiptStatus.map(s => s.reviewerThread)).size !== 2) return { state: 'review', why: 'two distinct independent reviewer submission receipts required', keyframes: shown };
  const answers = files.map((f) => readJson(f)), merged = B.mergeTaste(answers), RL = await import('./reviewlist.mjs');
  for (const b of merged?.beats || []) Object.assign(b, RL.mergeBeat(answers.map((a) => a?.beats?.find((x) => x.beat === b.beat))) || {});
  const prevT = readJson(tt.check), history = B.withScores(prevT?.history || [], h, merged), stalled = B.stalledBeats(history);
  // settled against the lists the task asked about; a list that stuck goes to the arbiter, whose ruling is binding (the
  // director no longer waives: the user 2026-10-28, 按复盘先做; it may appeal, tasks/stills-taste.appeal.json)
  const printOf = (b) => { const f = keyframes[g.shots.findIndex((s) => s.shotId === b)]; return f && fs.existsSync(f) ? C.picPrint(f) : null; };
  RL.holdPassed(merged.beats, RL.readPassed(tt.task), printOf, (a, b) => C.samePrints([a], [b]));
  const { lists } = RL.settleFrames(tt.task, task?.lists || {}, merged.beats, 4, (await import('./reviewrules.mjs')).readLessons(cfg), { newLists: !RL.gatePassed(tt.task) || B.tasteErrors(merged).length > 0 }), A = await import('./arbiter.mjs');
  // the arbiter only for a gate that fails (reviewlist.mjs closeGate; an appeal still goes)
  const appeals = A.readAppeals(path.dirname(tt.task), STILLS_TASTE), due = B.tasteErrors(merged).length ? RL.arbiterDue(lists, appeals) : Object.keys(appeals).filter((b) => lists[b]?.items?.length);
  if (due.length) {
    const ar = await A.arbitrate(cfg, id, STILLS_TASTE, { forAnswer: h, beats: due.map((b) => ({ beat: b, text: g.shots.find((s) => s.shotId === b)?.text || '', list: lists[b], appeal: appeals[b] || null, words: { taste: merged.beats.find((x) => x.beat === b)?.issue || '', chapter: '' } })), images: due.map((b) => keyframes[g.shots.findIndex((s) => s.shotId === b)]).filter(Boolean), note: '附图：这几拍的重头样张，每拍一张，按上面的顺序' }, { log });
    if (ar.pending) return { state: 'review', why: `the arbiter (tasks/${ar.pending}.task.json)`, keyframes: shown };
    RL.recordPassed(tt.task, ar.rulings, printOf);
    RL.writeLists(tt.task, A.applyRulings(ar.rulings, merged.beats, lists, 4));
  }
  const errors = B.tasteErrors(merged); if (!errors.length) RL.closeGate(tt.task, RL.readLists(tt.task), merged.beats.reduce((a, b) => a + (b.score || 0), 0) / Math.max(1, merged.beats.length));
  const arbitrated = merged.beats.filter((b) => b.arbitrated).map((b) => ({ beat: b.beat, ...b.arbitrated }));
  writeCheck(cfg, id, STILLS_TASTE, { ok: !errors.length, errors, review: merged, forAnswer: h, prints, history, stalled, ...(arbitrated.length ? { arbitrated } : {}) });
  for (const x of stalled) log(`  ${STILLS_TASTE}: ${x.beat} has stood at ${x.score} for ${x.rounds} rounds — not its layout: fix what the reviewers keep naming (its material, its model) or log the gap (${x.named.slice(0, 120)})`);
  if (errors.length) { log(`  ${STILLS_TASTE}: sent back (${errors.length}): ${errors.slice(0, 3).join(' | ')}`); return { state: 'rejected', errors, keyframes: shown }; }
  return { state: boardApproved(cfg, id) ? 'approved' : 'ready', keyframes };
}

// The look of a design-first film, made before the look gate (the user 2026-10-27: 让系统走唯一 最优的流程 — the
// stills sat inside the chapter step, after the look gate, and asked for a second approval no list showed): the
// film's design, then its hero stills under their checks and blind review, then the board. The look gate is approved
// on them (gates.mjs approveGate look, bound to boardHash); chapters are written to the approved stills.
export async function stepFilmLook(cfg, id, { log = console.log } = {}) {
  const C = await import('./chapter.mjs'), F = await import('./filmdesign.mjs');
  const fd = await F.stepFilmDesign(cfg, id, C.filmBeats(cfg, id), { log });
  const design = F.acceptedFilmDesign(cfg, id); if (!design) return { state: 'waiting', why: fd.state === 'rejected' ? "the film's design was sent back" : "the film's design (tasks/filmdesign.task.json)" };
  // the whole film as a greybox rough before any still is made, and its direction approved (greybox.mjs; the user
  // 2026-10-28: 粗稿可以很低精度几何模块 … 确保全篇方向 再一镜镜渲染)
  if (!((await import('./project-scope.mjs')).scopeRestriction(loadProject(cfg, id), 'greybox'))) { const G = await import('./greybox.mjs'), { directionOpen } = await import('./gatestate.mjs'), gb = await G.stepGreybox(cfg, id, { log });
    if (!directionOpen(cfg, id)) return { state: 'waiting', why: gb.state === 'ready' ? 'the direction: the greybox rough waits for you (out/greybox/sheet.png)' : gb.state === 'rejected' ? 'the greybox rough was sent back by its checks' : 'the greybox rough (tasks/greybox.task.json)' }; }
  const sti = await stepStills(cfg, id, { log });
  try { F.filmBoard(cfg, id, { design, measured: readJson(path.join(projectPaths(cfg, id).out, 'film', 'arc.json'), null), beats: C.filmBeats(cfg, id), stills: sti.keyframes || null, file: path.join(projectPaths(cfg, id).out, 'film', 'board.png') }); } catch (e) { log(`  board: ${String(e.message || e).split('\n')[0]}`); }
  return sti;
}

// The approved hero stills are the film's hero beats (the user 2026-10-27, after the white model showed the old cards
// where the approved stills should be: 批了的样子就是成片的样子): once the look is approved on them, the stills' module
// is rendered like a chapter and each hero beat that is not inside a chapter takes its stretch of it (animatic.mjs,
// chapter.mjs stepChapters). beats: the film's beats (chapter.mjs filmBeats); inChapter: the beats chapters hold.
export function heroChapter(cfg, id, beats, inChapter = new Set()) {
  // (the stills as they stand once they pass the code checks: the rough takes the newest checked version, its review follows)
  if (!boardApproved(cfg, id) || !readJson(path.join(projectPaths(cfg, id).root, 'tasks', `${STILLS_STEP}.check.json`))?.ok) return null;
  const design = acceptedFilmDesign(cfg, id), root = projectPaths(cfg, id).root;
  const answer = readJson(path.join(root, 'tasks', `${STILLS_STEP}.answer.json`)), check = readJson(path.join(root, 'tasks', `${STILLS_STEP}.check.json`));
  if (!design || !answer?.code) return null;
  // A still-only pass proves no motion/event timing. Legacy motion-checked hero
  // modules keep their behavior; new stills graduate through chapter acceptance.
  if (check?.taskMode === 'stills') return null;
  const g = stillsGroup(design, beats), dir = path.join(projectPaths(cfg, id).out, 'chapters', g.id), module = path.join(dir, `${g.id}.mjs`);
  fs.mkdirSync(dir, { recursive: true }); if (!fs.existsSync(module) || fs.readFileSync(module, 'utf8') !== answer.code) fs.writeFileSync(module, answer.code);
  const assets = Object.fromEntries(Object.entries(check?.assets || {}).map(([k, f]) => [k, path.join(root, f)]));
  return { ...g, module, assets, heroes: g.shots.filter((s) => design.beats.find(r => r.beat === s.shotId)?.hero && !inChapter.has(s.shotId)).map((s) => s.shotId) };
}
