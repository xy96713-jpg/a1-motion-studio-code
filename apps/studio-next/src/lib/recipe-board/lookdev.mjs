// Look development: the three anchor shots of a film are designed as text-free target frames
// before chapter code or a greybox block is built. A target frame is the picture the chapter must
// reproduce (subject, scale, camera, material, light, where the type will stand); 2–3 real
// directions are compared and one is chosen. The line checks that the targets exist, differ, carry
// no readable type and name their reference; it does not judge taste — the director and the user do.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { projectPaths, loadProject } from './store.mjs';
import { writeTask, readAnswer, writeCheck, sha } from './agenttask.mjs';
import { acceptedFilmDesign } from './filmdesign.mjs';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };
const IMG = /\.(png|jpe?g|webp)$/i;
export const LOOKDEV_CONTRACT = 'A1RecipeBoardLookDev/v1';
export const LOOKDEV_ANCHORS = 3;
export const LOOKDEV_RULES = 'work/recipe-board-v1/prompts/lookdev.md';
export const LOOKDEV_SCHEMA = 'work/recipe-board-v1/routing/lookdev.schema.json';

// One object/principle, one piece of evidence, one map/data — the three visual languages the film
// must hold. A kind the film has not got is not invented; the film's heroes and ends fill in.
export function pickLookAnchors(shots = [], film = null) {
  const rows = (shots || []).map((s) => ({
    beat: s.beat,
    chapter: s.chapter || null,
    intent: s.intent || film?.beats?.find((b) => b.beat === s.beat)?.why || '',
    seconds: s.seconds || null,
    hero: !!s.isHero,
    evidence: (s.evidence || []).length > 0,
    made: s.stage3d ? 'object' : (s.diagram?.form === '3d' ? 'object' : (s.diagram?.form === 'map' || s.diagram?.form === 'globe' || s.card === 'map' ? 'map' : null)),
  })).filter((r) => r.beat).map((r) => ({ ...r, taken: false }));
  const take = (test) => { const r = rows.find((x) => !x.taken && test(x)); if (r) r.taken = true; return r; };
  const out = [];
  for (const [kind, test] of [['object', (r) => r.made === 'object' || r.hero], ['evidence', (r) => r.evidence], ['map', (r) => r.made === 'map']]) {
    const r = take(test); if (r) out.push({ ...r, kind });
  }
  for (const r of rows) { if (out.length >= LOOKDEV_ANCHORS) break; if (!r.taken) { r.taken = true; out.push({ ...r, kind: r.made === 'map' ? 'map' : r.evidence ? 'evidence' : 'object' }); } }
  return out.slice(0, LOOKDEV_ANCHORS).map(({ taken, ...r }) => r);
}

export function lookDevInput(cfg, id, { design = undefined, storyboard = undefined } = {}) {
  const p = projectPaths(cfg, id), project = loadProject(cfg, id);
  const sb = storyboard ?? readJson(path.join(p.root, 'storyboard.json'), { shots: [] });
  const fd = design === undefined ? acceptedFilmDesign(cfg, id) : design;
  if (!fd) throw new Error('lookdev: the film design is not accepted yet');
  const base = cfg.repoRoot || cfg.sourceRoot || process.cwd();
  const refs = (project.reference?.frames || []).map((f) => path.isAbsolute(f) ? f : path.join(base, f)).filter((f) => fs.existsSync(f));
  const shots = (sb.shots || []).length ? sb.shots : (fd.beats || []).map((b) => ({ beat: b.beat, intent: b.why, isHero: !!b.hero }));
  const anchors = pickLookAnchors(shots, fd).map((a) => ({ ...a, reference: refs[0] || '' }));
  return { project: id, style: project.style || null, typeBible: project.typeBible !== false, references: refs, anchors };
}

const words = (v, n = 8) => String(v || '').trim().length >= n;

export function lookDevErrors(answer, input, { inputHash = null, root = null } = {}) {
  const e = [];
  if (answer?.contract !== LOOKDEV_CONTRACT) e.push(`contract: ${LOOKDEV_CONTRACT}`);
  if (inputHash && answer?.sourceTaskInputHash !== inputHash) e.push('sourceTaskInputHash: the current task input hash');
  const anchors = answer?.anchors || [], want = input?.anchors || [], ids = new Set(want.map((a) => a.beat));
  if (anchors.length !== want.length) e.push(`anchors: ${want.length} anchors of this film (${want.map((a) => `${a.beat}/${a.kind}`).join(', ') || 'none'}), not ${anchors.length}`);
  const seen = new Set();
  for (const a of anchors) {
    const tag = a?.beat || '?', anc = want.find((w) => w.beat === a?.beat);
    if (!ids.has(a?.beat)) e.push(`${tag}: not an anchor of this film`);
    if (seen.has(a?.beat)) e.push(`${tag}: named twice`);
    seen.add(a?.beat);
    if (anc && a?.kind !== anc.kind) e.push(`${tag}: kind ${anc.kind} (the film's design makes this anchor ${anc.kind})`);
    if ((input.references || []).length) {
      if (!String(a?.reference || '').trim()) e.push(`${tag}: name the reference frame the targets answer (reference)`);
      else if (root && !fs.existsSync(path.resolve(root, a.reference)) && !(input.references || []).some((r) => r === a.reference || path.resolve(root, r) === path.resolve(root, a.reference))) e.push(`${tag}: reference ${a.reference} does not exist`);
    }
    const ds = a?.directions || [];
    if (ds.length < 2 || ds.length > 3) e.push(`${tag}: 2–3 directions (one is not a choice; more than three is a menu)`);
    if (new Set(ds.map((d) => d?.id)).size !== ds.length) e.push(`${tag}: direction ids repeat`);
    const hashes = new Map();
    for (const d of ds) {
      if (!['A', 'B', 'C'].includes(d?.id)) e.push(`${tag}: direction id A, B or C`);
      if (d?.textFree !== true) e.push(`${tag}.${d?.id}: the target frame carries no readable type (textFree: true); words are set by code afterwards`);
      if (!words(d?.why)) e.push(`${tag}.${d?.id}: say what this direction changes and why (why)`);
      if (!['imagegen', 'blender', 'engine'].includes(d?.source)) e.push(`${tag}.${d?.id}: source imagegen|blender|engine`);
      if (!IMG.test(d?.file || '')) { e.push(`${tag}.${d?.id}: an image file (png/jpg/webp)`); continue; }
      const file = path.resolve(root || '.', d.file);
      if (!fs.existsSync(file)) { e.push(`${tag}.${d?.id}: file ${d.file} does not exist`); continue; }
      const h = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (hashes.has(h)) e.push(`${tag}.${d?.id}: the same picture as ${hashes.get(h)}; directions must differ`);
      else hashes.set(h, d.id);
    }
    if (!ds.some((d) => d?.id === a?.chosen)) e.push(`${tag}: chosen names one of its directions`);
    if (!words(a?.chosenWhy)) e.push(`${tag}: why this direction is the one (chosenWhy)`);
    if (!words(a?.achievable)) e.push(`${tag}: how the chapter can achieve it with the engine, models and materials in hand (achievable)`);
  }
  return [...new Set(e)];
}

export function stepLookDev(cfg, id, { log = console.log } = {}) {
  const input = lookDevInput(cfg, id);
  if (input.anchors.length < LOOKDEV_ANCHORS) throw new Error(`lookdev: ${input.anchors.length} anchors — three are needed (object, evidence, map/data)`);
  const inputHash = sha(JSON.stringify(input));
  const task = writeTask(cfg, id, 'lookdev', { input, inputHash, rules: LOOKDEV_RULES, schema: LOOKDEV_SCHEMA });
  const answer = readAnswer(cfg, id, 'lookdev');
  if (!answer) { log(`  lookdev: waiting for three anchors' target frames (tasks/lookdev.answer.json; ${input.anchors.map((a) => `${a.beat}/${a.kind}`).join(', ')})`); return { state: 'waiting', task, inputHash }; }
  const errors = lookDevErrors(answer, { ...input, root: projectPaths(cfg, id).root }, { inputHash, root: projectPaths(cfg, id).root });
  writeCheck(cfg, id, 'lookdev', { ok: !errors.length, errors, answerHash: sha(JSON.stringify(answer)) });
  if (errors.length) { log(`  lookdev: rejected (${errors.length})`); for (const x of errors.slice(0, 5)) log(`  ✗ ${x}`); return { state: 'rejected', errors, task }; }
  const out = path.join(projectPaths(cfg, id).out, 'lookdev'); fs.mkdirSync(out, { recursive: true });
  writeJson(path.join(out, 'lookdev.json'), { contract: LOOKDEV_CONTRACT, project: id, anchors: answer.anchors });
  log(`  lookdev: accepted — ${answer.anchors.length} anchors → ${path.relative(projectPaths(cfg, id).root, out)}/lookdev.json`);
  return { state: 'accepted', task, out };
}

// The chapter must compare its implementation against the chosen lookdev target at start/change/end,
// with the target's exact bytes (the same-moment binding, not a path note). A chapter whose film has
// no accepted lookdev is not held to one.
export function lookdevReferenceErrors(answer, cfg, id) {
  const p = projectPaths(cfg, id), ld = readJson(path.join(p.out, 'lookdev', 'lookdev.json'), null);
  if (!ld?.anchors?.length) return [];
  const rows = Array.isArray(answer?.motionImplementation) ? answer.motionImplementation : [], root = p.root, out = [];
  for (const a of ld.anchors) {
    const chosen = (a.directions || []).find((d) => d.id === a.chosen); if (!chosen) continue;
    const cmp = rows.find((r) => r?.shotId === a.beat)?.referenceComparison;
    if (!cmp) { out.push(`${a.beat}: the chosen lookdev target (${chosen.file}) is not compared at start/change/end (motionImplementation[].referenceComparison)`); continue; }
    const target = path.resolve(root, chosen.file);
    if (!fs.existsSync(target)) { out.push(`${a.beat}: the chosen lookdev target ${chosen.file} is missing from the project`); continue; }
    const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    if (String(cmp.reference?.file || '') !== chosen.file) out.push(`${a.beat}: referenceComparison.reference.file must be the chosen lookdev target (${chosen.file})`);
    if (cmp.reference?.hash !== hash) out.push(`${a.beat}: referenceComparison.reference.hash must be the chosen target's sha256 (${hash.slice(0, 12)}…)`);
    for (const phase of ['start', 'change', 'end']) if (String(cmp[phase] || '').trim().length < 8) out.push(`${a.beat}: referenceComparison.${phase} must say what the same-moment comparison shows`);
    if (chosen.source === 'imagegen' || chosen.source === 'blender' || chosen.source === 'engine') {
      if (!String(a.achievable || '').trim()) out.push(`${a.beat}: say how the chapter reaches the target (achievable)`);
    }
  }
  return out;
}
