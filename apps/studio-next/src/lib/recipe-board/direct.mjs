// Director pass: after the stills exist, a director watches the film as a rough cut — chapter by chapter,
// every still in order with what is said over it, how long it holds, what the critic and the sequence review
// (review.mjs) found, and each chapter's rhythm against its targets — and sends back revisions to the
// storyboard: this beat should be the presenter with tags, this one a title, these two cuts are the same
// picture. The line does not take the director's word: the revised storyboard goes through the same checks
// as any storyboard (storyboard.mjs), a revision that breaks a check is dropped, and what is left is applied
// (the write step rewrites the changed beats, and the run goes round once more).
//
// An agent task like the others (agenttask.mjs): tasks/direct.task.json (chapter sheets + the shot list),
// tasks/direct.answer.json { notes, revisions: [storyboard shot + fixes] }, checked here. Rounds are capped
// (MAX_ROUNDS per storyboard lineage) and a beat the director already changed is not changed back.
//
//   out/direct.json   { inputHash, round, applied: [...], dropped: [...], notes }
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectPaths, readPlan, loadShots } from './store.mjs';
import { agentFor, readAnswer, readTask, sha, taskPaths, writeAnswer, writeCheck, writeTask } from './agenttask.mjs';
import { checkStoryboard, measureChapter, normalizeAnswer, stepStoryboard } from './storyboard.mjs';
import { reviewSequence, materialReport } from './review.mjs';
import { spokenSeconds } from './voice.mjs';
import { referenceBeats } from './reference.mjs';

const STEP = 'direct';
const RULES = 'work/recipe-board-v1/prompts/direct.md';
const SCHEMA = 'work/recipe-board-v1/routing/direct.schema.json';
export const MAX_ROUNDS = 2;
export const MAX_REVISIONS = 12;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT = path.join(HERE, '../../../public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf');
const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const stamp = (f) => { try { const s = fs.statSync(f); return `${s.size}:${Math.round(s.mtimeMs)}`; } catch { return ''; } };
const sbFile = (cfg, id) => path.join(projectPaths(cfg, id).root, 'storyboard.json');
const briefOf = (cfg, id) => readJson(path.join(projectPaths(cfg, id).root, 'brief.json'));

// One sheet per chapter: the stills in film order, 5 a row, each with its beat, card and length.
function chapterSheet(cfg, id, chapter, rows) {
  const p = projectPaths(cfg, id);
  const dir = path.join(p.root, 'tasks', 'direct');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${chapter}.jpg`);
  const items = rows.filter((r) => fs.existsSync(r.still));
  if (!items.length) return null;
  const cols = Math.min(5, items.length);
  const inputs = items.flatMap((r) => ['-i', r.still]);
  const esc = (t) => String(t).replace(/[:\\']/g, ' ');
  const label = (r) => `drawbox=x=0:y=0:w=iw:h=34:color=black@0.7:t=fill,drawtext=fontfile='${FONT}':text='${esc(`${r.beat}  ${r.cards.join('+')}  ${r.seconds}s`)}':x=8:y=7:fontsize=20:fontcolor=white`;
  const scaled = items.map((r, i) => `[${i}:v]scale=384:216,${label(r)}[v${i}]`).join(';');
  const pad = (cols - (items.length % cols)) % cols;
  const blanks = Array.from({ length: pad }, (_, k) => `color=c=black:s=384x216:d=1[b${k}]`).join(';');
  const all = [...items.map((_, i) => `[v${i}]`), ...Array.from({ length: pad }, (_, k) => `[b${k}]`)];
  const n = all.length;
  const layout = Array.from({ length: n }, (_, i) => `${(i % cols) * 384}_${Math.floor(i / cols) * 216}`).join('|');
  const fc = `${scaled}${blanks ? ';' + blanks : ''};${all.join('')}xstack=inputs=${n}:layout=${layout}${n === 1 ? '' : ''}`;
  if (n === 1) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${scaled}`, '-map', '[v0]', '-frames:v', '1', '-q:v', '4', out]);
  else execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', fc, '-frames:v', '1', '-q:v', '4', out]);
  return out;
}

// Everything the director sees: per chapter its role, targets and measured rhythm, and per beat the line,
// the design, the still's score and issues, and what the sequence review flagged.
export function directInput(cfg, id) {
  const p = projectPaths(cfg, id);
  const plan = readPlan(cfg, id), brief = briefOf(cfg, id), sb = readJson(sbFile(cfg, id));
  if (!plan || !brief || !sb) return null;
  const critique = readJson(path.join(p.out, 'critique.json'), { shots: [] });
  const crit = Object.fromEntries(critique.shots.map((s) => [s.shotId, s]));
  const seq = readJson(path.join(p.out, 'sequence-review.json'), { issues: [] }).issues;
  const rhythm = readJson(path.join(cfg.dataDir, 'routing', 'rhythm-by-role.json'), { roles: {} });
  const text = Object.fromEntries(plan.beats.map((b) => [b.id, b.text]));
  const material = readJson(path.join(p.out, 'material-report.json'), null);
  const shotsBy = Object.fromEntries(loadShots(cfg, id).map((s) => [s.shotId, s]));
  const design = Object.fromEntries(sb.shots.map((s) => [s.beat, s]));
  const chapters = brief.chapters.map((c) => {
    const ids = plan.beats.map((b) => b.id);
    const beats = ids.slice(ids.indexOf(c.from), ids.indexOf(c.to) + 1);
    const rows = beats.map((b) => {
      const d = design[b] || {};
      const cards = (d.scenes || []).length ? d.scenes.map((x) => x.card) : [d.card];
      return { beat: b, text: text[b], cards, treatment: d.treatment, seconds: d.seconds, why: d.why,
        still: path.join(p.candidates, `${b}.png`), written: !!shotsBy[b],
        score: crit[b]?.score ?? null, problems: (crit[b]?.issues || []).map((x) => `${x.slot}: ${x.problem}`).slice(0, 3),
        sequence: seq.filter((x) => x.shots.includes(b)).map((x) => `${x.level} ${x.code}: ${x.message}`) };
    });
    const measured = measureChapter(beats.map((b) => design[b]).filter(Boolean));
    return { id: c.id, title: c.title, role: c.role, purpose: c.purpose, targets: rhythm.roles?.[c.role] || null, measured, material: material?.byChapter?.[c.id] || null, rows };
  });
  const rules = fs.readFileSync(path.join(cfg.repoRoot, RULES), 'utf8');
  const hash = sha(JSON.stringify([rules, sb.answerHash, chapters.map((c) => c.rows.map((r) => [r.beat, stamp(r.still), r.score, r.sequence]))]));
  return { hash, chapters, storyboard: sb, material: material && { distinctRealSources: material.distinctRealSources, perMinute: material.perMinute, generatedCuts: material.generatedCuts, videoCuts: material.videoCuts, reused: material.reused } };
}

const stripStill = (chapters) => chapters.map((c) => ({ ...c, rows: c.rows.map(({ still, written, ...r }) => r) }));

// Merge revisions into the accepted storyboard and keep only those the storyboard checks accept.
// Pure apart from the check (cfg for cards and routing): returns { answer, applied, dropped }.
export function mergeRevisions(cfg, plan, brief, storyboard, revisions, { speechRate, spoken, locked = [], original = {} } = {}) {
  const base = { contract: storyboard.contract, shots: storyboard.shots.map((s) => ({ ...s })) };
  const fields = Object.keys(base.shots[0] || {});
  const dropped = [];
  let keep = [];
  for (const r of revisions.slice(0, MAX_REVISIONS)) {
    const i = base.shots.findIndex((s) => s.beat === r.beat);
    if (i < 0) { dropped.push({ beat: r.beat, why: 'no such beat' }); continue; }
    if (locked.includes(r.beat)) { dropped.push({ beat: r.beat, why: 'changed by the director in an earlier round; not changed back' }); continue; }
    keep.push(r);
  }
  const build = (list) => {
    const shots = base.shots.map((s) => ({ ...s }));
    for (const r of list) {
      const i = shots.findIndex((s) => s.beat === r.beat);
      // the beat keeps its place, chapter and length unless the revision says otherwise
      const next = Object.fromEntries(fields.map((k) => [k, r[k] !== undefined ? r[k] : shots[i][k]]));
      next.beat = shots[i].beat; next.chapter = shots[i].chapter;
      shots[i] = next;
    }
    return { contract: base.contract, shots };
  };
  for (let round = 0; round < 4; round++) {
    const answer = build(keep);
    const check = checkStoryboard(cfg, plan, brief, answer, { speechRate, spoken, original });
    const bad = new Set(keep.filter((r) => check.errors.some((e) => e.startsWith(`${r.beat}:`) || e.includes(` ${r.beat} `))).map((r) => r.beat));
    if (check.ok || !bad.size) return { answer, applied: keep.map((r) => ({ beat: r.beat, card: r.card, fixes: r.fixes })), dropped, errors: check.errors };
    for (const r of keep.filter((x) => bad.has(x.beat))) dropped.push({ beat: r.beat, why: check.errors.filter((e) => e.startsWith(`${r.beat}:`)).join('; ') || 'breaks a storyboard check' });
    keep = keep.filter((r) => !bad.has(r.beat));
  }
  return { answer: build(keep), applied: keep.map((r) => ({ beat: r.beat, card: r.card, fixes: r.fixes })), dropped, errors: [] };
}

export function directState(cfg, id) {
  const input = directInput(cfg, id);
  if (!input) return { state: 'blocked' };
  const report = readJson(path.join(projectPaths(cfg, id).out, 'direct.json'));
  if (report?.inputHash === input.hash) return { state: 'current', report };
  const lineage = sha(input.storyboard.inputHash + fs.readFileSync(path.join(cfg.repoRoot, RULES), 'utf8'));
  if (report?.lineage === lineage && report.round >= MAX_ROUNDS) return { state: 'done', report };
  return { state: 'due', hash: input.hash };
}

export async function stepDirect(cfg, id, { log = () => {}, agent = null } = {}) {
  reviewSequence(cfg, id);
  materialReport(cfg, id);
  const st = directState(cfg, id);
  if (st.state !== 'due') return st;
  const input = directInput(cfg, id);
  const p = projectPaths(cfg, id);
  const prev = readJson(path.join(p.out, 'direct.json'));
  // a change to the director's rules starts a new lineage (the film is watched again by the new rules)
  const lineage = sha(input.storyboard.inputHash + fs.readFileSync(path.join(cfg.repoRoot, RULES), 'utf8'));
  const round = prev?.lineage === lineage ? prev.round + 1 : 1;
  const locked = prev?.lineage === lineage ? prev.locked || [] : [];
  const sheets = input.chapters.map((c) => chapterSheet(cfg, id, c.id, c.rows)).filter(Boolean);
  const task = readTask(cfg, id, STEP);
  if (!task || task.inputHash !== input.hash) writeTask(cfg, id, STEP, { inputHash: input.hash, rules: RULES, schema: SCHEMA, images: sheets, input: { round, maxRevisions: MAX_REVISIONS, material: input.material, locked, previousDropped: prev?.lineage === lineage ? prev.dropped || [] : [], chapters: stripStill(input.chapters), storyboard: input.storyboard.shots } });
  let answer = readAnswer(cfg, id, STEP);
  if (answer && answer.inputHash && answer.inputHash !== input.hash) answer = null;
  const backend = agent || agentFor(cfg, id, STEP);
  if (!answer && backend === 'codex') {
    const { codexExecutable, runCodexJson } = await import('./director.mjs');
    const rules = fs.readFileSync(path.join(cfg.repoRoot, RULES), 'utf8');
    const t = readTask(cfg, id, STEP);
    log(`direct: watching ${sheets.length} chapters (round ${round})`);
    const got = await runCodexJson(codexExecutable(), `${rules}\n\n## 粗剪（附图按章节顺序，每章一张）\n\n只输出符合 schema 的 JSON。\n\n${JSON.stringify(t.input)}`, path.join(cfg.repoRoot, SCHEMA), { firstKey: 'notes', images: sheets, timeoutMs: 1_200_000 });
    answer = { inputHash: input.hash, ...got };
    writeAnswer(cfg, id, STEP, answer);
  }
  if (!answer) return { state: 'waiting', task: taskPaths(cfg, id, STEP).task };
  const plan = readPlan(cfg, id), brief = briefOf(cfg, id);
  const project = readJson(p.project, {});
  const merged = mergeRevisions(cfg, plan, brief, input.storyboard, normalizeAnswer({ shots: answer.revisions || [] }).shots, { speechRate: project.speechRate, spoken: spokenSeconds(cfg, id), locked, original: referenceBeats(cfg, id) });
  writeCheck(cfg, id, STEP, { answerHash: sha(JSON.stringify(answer)), inputHash: input.hash, ok: true, applied: merged.applied, dropped: merged.dropped });
  let accepted = null;
  if (merged.applied.length) {
    // the revised storyboard is the storyboard step's answer now: it is checked and applied like any other
    const before = readAnswer(cfg, id, 'storyboard');
    writeAnswer(cfg, id, 'storyboard', merged.answer);
    accepted = await stepStoryboard(cfg, id, { log });
    if (accepted.state !== 'accepted') {
      // never leave the line on a rejected storyboard: put the accepted one back
      log(`direct: the revised storyboard was ${accepted.state}: ${(accepted.errors || []).slice(0, 3).join('; ')}; kept the previous one`);
      writeAnswer(cfg, id, 'storyboard', before);
      await stepStoryboard(cfg, id, { log });
      merged.dropped.push(...merged.applied.map((a) => ({ beat: a.beat, why: 'the revised storyboard did not pass' })));
      merged.applied = [];
    }
  }
  const report = { inputHash: input.hash, lineage, round,
    locked: [...new Set([...locked, ...merged.applied.map((a) => a.beat)])], applied: merged.applied, dropped: merged.dropped, notes: answer.notes || [], at: new Date().toISOString() };
  // the storyboard file changed: the new input hash is computed on the next call; the report keeps the lineage
  fs.writeFileSync(path.join(p.out, 'direct.json'), JSON.stringify({ ...report, inputHash: directInput(cfg, id)?.hash ?? input.hash }, null, 1) + '\n');
  return { state: merged.applied.length ? 'revised' : 'kept', ...report };
}
