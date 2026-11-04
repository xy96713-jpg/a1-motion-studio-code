// A seam between two chapters is its own reviewed object: the outgoing frame's subject, direction
// and reading handed to the incoming frame, judged on a real 1× playback of the joined seconds, not
// on two clean files placed side by side. The task is written even before both chapters exist; it
// stays waiting until the renders do, so the seam is never faked from stills.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { projectPaths, loadProject } from './store.mjs';
import { writeTask, readAnswer, writeCheck, sha } from './agenttask.mjs';
import { SEAMS } from './seams.mjs';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export const SEAM_REVIEW_CONTRACT = 'A1RecipeBoardSeamReview/v1';
export const SEAM_RULES = 'work/recipe-board-v1/prompts/seamreview.md';
export const SEAM_SCHEMA = 'work/recipe-board-v1/routing/seamreview.schema.json';
export const SEAM_MIN_SECONDS = 3.5;

export function seamInput(cfg, id, from, to) {
  const p = projectPaths(cfg, id), sb = readJson(path.join(p.root, 'storyboard.json'), { shots: [] });
  const beats = (sb.shots || []).filter((s) => s.beat === from || s.beat === to).map((s) => ({
    beat: s.beat, chapter: s.chapter || null, seconds: s.seconds || null, intent: s.intent || null,
    isHero: !!s.isHero, out: s.out || null, camera: s.camera || null, scene: s.scenes?.[0]?.recipe || s.card || null,
  }));
  const chapterFile = (b) => path.join(p.root, 'chapters', `${b}.mjs`);
  const renderFile = (b) => path.join(p.root, 'out', 'chapters', b, 'out', 'render', `${b}-clean.mp4`);
  const ready = [from, to].every((b) => fs.existsSync(chapterFile(b)) || fs.existsSync(renderFile(b)));
  return { project: id, from, to, ready, beats, renders: [from, to].map((b) => ({ beat: b, module: fs.existsSync(chapterFile(b)), render: fs.existsSync(renderFile(b)), file: path.relative(p.root, renderFile(b)) })) };
}

export function seamReviewErrors(answer, input, { inputHash = null, root = null } = {}) {
  const e = [];
  if (answer?.contract !== SEAM_REVIEW_CONTRACT) e.push(`contract: ${SEAM_REVIEW_CONTRACT}`);
  if (inputHash && answer?.sourceTaskInputHash !== inputHash) e.push('sourceTaskInputHash: the current task input hash');
  if (answer?.from !== input?.from || answer?.to !== input?.to) e.push(`from/to: ${input?.from} → ${input?.to}`);
  const it = answer?.intent || {};
  const carry = Array.isArray(it.carry) ? it.carry : [];
  if (!carry.length || carry.length > 3) e.push('intent.carry: 1–3 things handed from the outgoing frame to the incoming one');
  for (const [k, n] of [['enter', 8], ['exit', 8], ['why', 8]]) if (String(it[k] || '').trim().length < n) e.push(`intent.${k}: say what the cut does (at least ${n} characters)`);
  if (!SEAMS.includes(it.cut)) e.push(`intent.cut: one of ${SEAMS.join(' / ')}`);
  const renders = answer?.renders || [];
  if (renders.length < 1 || renders.length > 3) e.push('renders: 1–3 joined-second files (not stills)');
  for (const r of renders) {
    if (!String(r?.file || '').trim()) { e.push('renders[].file: the joined-seconds file'); continue; }
    const file = path.resolve(root || '.', r.file);
    if (!fs.existsSync(file)) { e.push(`renders ${r.file}: does not exist`); continue; }
    if (!(Number(r.seconds) >= SEAM_MIN_SECONDS)) e.push(`renders ${r.file}: at least ${SEAM_MIN_SECONDS}s of joined playback`);
    if (!(Number(r.fps) >= 24)) e.push(`renders ${r.file}: at least 24 fps`);
    if (r.hash !== sha256(file)) e.push(`renders ${r.file}: hash does not match the bytes`);
  }
  const v = answer?.verdict || {}, sc = v.scores || {};
  if (v.reviewer !== 'fresh') e.push('verdict.reviewer: a fresh reviewer (not the chapter writer)');
  for (const k of ['continuity', 'direction', 'brightness', 'reading', 'natural']) if (!(Number(sc[k]) >= 4 && Number(sc[k]) <= 5)) e.push(`verdict.scores.${k}: 4 or 5`);
  if (v.passed !== true) e.push('verdict.passed: true only when every score is 4 or 5');
  if (String(answer?.notes || '').trim().length < 8) e.push('notes: what the 1× playback showed');
  return [...new Set(e)];
}

export function stepSeamReview(cfg, id, from, to, { log = console.log } = {}) {
  if (!from || !to) throw new Error('seamreview: --from <beat> --to <beat>');
  const input = seamInput(cfg, id, from, to), inputHash = sha(JSON.stringify(input));
  const step = `seam-${from}-${to}`;
  const task = writeTask(cfg, id, step, { input, inputHash, rules: SEAM_RULES, schema: SEAM_SCHEMA });
  const answer = readAnswer(cfg, id, step);
  if (!answer) { log(`  seamreview ${from}→${to}: waiting — ${input.ready ? 'the joined-seconds render is due' : 'the two chapters (or their renders) do not exist yet'}`); return { state: 'waiting', task, input }; }
  const errors = seamReviewErrors(answer, input, { inputHash, root: projectPaths(cfg, id).root });
  writeCheck(cfg, id, step, { ok: !errors.length, errors, answerHash: sha(JSON.stringify(answer)) });
  if (errors.length) { log(`  seamreview ${from}→${to}: rejected (${errors.length})`); for (const x of errors.slice(0, 5)) log(`  ✗ ${x}`); return { state: 'rejected', errors, task }; }
  const out = path.join(projectPaths(cfg, id).out, 'seams'); fs.mkdirSync(out, { recursive: true });
  writeJson(path.join(out, `${from}-${to}.json`), { contract: SEAM_REVIEW_CONTRACT, project: id, from, to, answer });
  log(`  seamreview ${from}→${to}: accepted — ${path.relative(projectPaths(cfg, id).root, out)}/${from}-${to}.json`);
  return { state: 'accepted', task, out };
}
