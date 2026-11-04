// Critique: a reviewer looks at every still next to the replica of the same card (the card done right,
// matched cut by cut against the reference) and scores it 1-5 with concrete, slot-level fixes
// (prompts/critique.md). An agent task like the brief and the storyboard: the task lists the frames, any
// agent may answer (Codex sees the images), the line checks the answer before it is accepted. The
// report goes to out/critique.json and the run lists the weak shots. Cached by the stills it saw.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectPaths, loadShots, readPlan, loadTheme, projectTheme, sourcePath } from './store.mjs';
import { KEY_CARDS } from './concept.mjs';
import { intensityFor } from './world.mjs';
import { agentFor, readAnswer, readTask, sha, taskPaths, writeAnswer, writeCheck, writeTask } from './agenttask.mjs';
import { codexExecutable, runCodexJson } from './director.mjs';

const STEP = 'critique';
const RULES = 'work/recipe-board-v1/prompts/critique.md';
const SCHEMA = 'work/recipe-board-v1/routing/critique.schema.json';
const BATCH = 6;
const PASSES = Number(process.env.A1_CRITIQUE_PASSES || 2);

// card -> what the still should look like. A project in a visual world (theme.world, worlds/<id>.json) is
// judged against the world's approved style frames, by the shot's role (concept.mjs KEY_CARDS): the target
// is the same world done right, not the same content. Otherwise the replica of the same card (routing/
// exemplars.json: { recipe: "project/shot" }), the card done right against the reference film.
const ROLE_FRAME = { title: 'B01', evidence: 'B02', overlay: 'B06', diagram: 'B29' };
export function exemplarsFor(cfg, id = null) {
  const theme = id ? loadTheme(cfg, projectTheme(cfg, id)) : null;
  if (theme?.world) {
    const w = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'worlds', `${theme.world}.json`), 'utf8'));
    const frame = (role) => { const f = w.keyframes?.[ROLE_FRAME[role]]; return f && sourcePath(cfg, f); };
    const out = {};
    for (const [role, cards] of KEY_CARDS) for (const c of cards) if (frame(role) && fs.existsSync(frame(role))) out[c] = frame(role);
    // only the world's show moments ('full', world.mjs) are held against a style frame; restrained shots
    // have no exemplar and are judged on clarity (the rules say so)
    const level = (shotId) => intensityFor(projectPaths(cfg, id).root, shotId);
    return { exemplars: out, world: w, level };
  }
  const map = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'exemplars.json'), 'utf8')).cards || {};
  return { exemplars: Object.fromEntries(Object.entries(map).map(([recipe, ref]) => {
    const [project, shot] = ref.split('/');
    return [recipe, path.join(projectPaths(cfg, project).candidates, `${shot}.png`)];
  }).filter(([, f]) => fs.existsSync(f))), world: null };
}

// one frame per shot: the still, and the exemplar beside it when there is one
function pairImage(cfg, id, shot, exemplar) {
  const p = projectPaths(cfg, id);
  const still = path.join(p.candidates, `${shot.shotId}.png`);
  if (!fs.existsSync(still)) return null;
  const dir = path.join(p.root, 'tasks', 'critique');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${shot.shotId}.jpg`);
  const args = exemplar
    ? ['-i', still, '-i', exemplar, '-filter_complex', '[0]scale=960:540[a];[1]scale=960:540[b];[a][b]hstack', '-frames:v', '1', '-q:v', '4', out]
    : ['-i', still, '-vf', 'scale=960:540', '-frames:v', '1', '-q:v', '4', out];
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
  return fs.existsSync(out) ? out : null;
}

const stamp = (f) => { try { const s = fs.statSync(f); return `${s.size}:${Math.round(s.mtimeMs)}`; } catch { return ''; } };

export function critiqueInput(cfg, id) {
  const { exemplars: ex0, world, level } = exemplarsFor(cfg, id);
  const ex = (s) => (level && level(s.shotId) !== 'full' ? null : ex0[s.recipe] || null);
  const p = projectPaths(cfg, id);
  const shots = loadShots(cfg, id).filter((s) => fs.existsSync(path.join(p.candidates, `${s.shotId}.png`)));
  const rules = fs.readFileSync(path.join(cfg.repoRoot, RULES), 'utf8');
  const items = shots.map((s) => ({ shotId: s.shotId, recipe: s.recipe, still: path.join(p.candidates, `${s.shotId}.png`), exemplar: ex(s), level: level ? level(s.shotId) : null }));
  const hash = sha(JSON.stringify([rules, PASSES, world?.id || null, items.map((i) => [i.shotId, stamp(i.still), i.exemplar ? stamp(i.exemplar) : ''])]));
  return { hash, items, world };
}

export function checkCritique(answer, items) {
  const errors = [];
  const want = new Set(items.map((i) => i.shotId));
  const got = new Map((answer?.shots || []).map((s) => [s.shotId, s]));
  for (const id of want) if (!got.has(id)) errors.push(`${id}: no verdict`);
  for (const s of got.values()) {
    if (!want.has(s.shotId)) errors.push(`${s.shotId}: not a shot of this project`);
    if (!(s.score >= 1 && s.score <= 5)) errors.push(`${s.shotId}: score ${s.score} is not 1-5`);
    if (s.score < 3.5 && !(s.issues || []).length) errors.push(`${s.shotId}: score ${s.score} with no issue named`);
  }
  return { ok: !errors.length, errors };
}

export function critiqueState(cfg, id) {
  const { hash } = critiqueInput(cfg, id);
  const out = path.join(projectPaths(cfg, id).out, 'critique.json');
  const cur = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  return cur?.inputHash === hash ? { state: 'current', report: cur } : { state: 'due', hash };
}

export async function stepCritique(cfg, id, { log = () => {}, agent = null } = {}) {
  const st = critiqueState(cfg, id);
  if (st.state === 'current') return st;
  let { hash, items, world } = critiqueInput(cfg, id);
  const rules0 = fs.readFileSync(path.join(cfg.repoRoot, RULES), 'utf8');
  const rules = world ? `${rules0}\n\n## 这一期的样板\n这一期选定了视觉世界「${world.title}」。有样板的镜头是这一期的高光镜头：右边是这个世界的关键帧（用户认可的目标样子），内容和这一镜不同，比的是是不是同一个世界、做得是不是同样成熟（层次、窗口和字的处理、质感），不要因为内容不同扣分。没有样板的镜头是有意克制的（证据、人物、过渡）：只看清楚不清楚、字能不能读、主次对不对、素材有没有被遮挡，留白和简单不算问题，不要要求它更满。` : rules0;
  const task = readTask(cfg, id, STEP);
  if (!task || task.inputHash !== hash) writeTask(cfg, id, STEP, { inputHash: hash, rules: RULES, schema: SCHEMA, input: { shots: items } });
  let answer = readAnswer(cfg, id, STEP);
  if (answer && answer.inputHash !== hash) answer = null;
  // an answer with gaps is redone: the batches already answered come back from their cache, only the
  // skipped shots are asked again
  const backend0 = agent || agentFor(cfg, id, STEP);
  if (answer && backend0 === 'codex' && !checkCritique(answer, items).ok) answer = null;
  const backend = agent || agentFor(cfg, id, STEP);
  // a still that has not changed since the last report keeps its score: only changed stills are seen again
  const seenKey = (it) => sha(JSON.stringify([rules, PASSES, stamp(it.still), it.exemplar ? stamp(it.exemplar) : '', it.level]));
  const prevReport = (() => { try { return JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).out, 'critique.json'), 'utf8')); } catch { return null; } })();
  const kept = (prevReport?.shots || []).filter((x) => prevReport.seen?.[x.shotId] && items.some((it) => it.shotId === x.shotId && seenKey(it) === prevReport.seen[x.shotId]));
  if (!answer && backend === 'codex') {
    const bin = codexExecutable();
    const shots = [];
    const all = items;
    items = items.filter((it) => !kept.some((k) => k.shotId === it.shotId));
    if (kept.length) log(`critique: ${kept.length} unchanged stills keep their scores, ${items.length} to see`);
    // each batch is kept as it comes back (keyed by the run's input and pass), so a failed call costs one
    // batch, not the run; a batch that fails is tried once more
    const partDir = path.join(projectPaths(cfg, id).root, 'tasks', 'critique', 'parts');
    fs.mkdirSync(partDir, { recursive: true });
    const ask = async (pass, k, b, frames, list) => {
      const f = path.join(partDir, `${hash}-${pass}-${k}.json`);
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
      let last;
      for (let a = 0; a < 2; a++) {
        try {
          const r = await runCodexJson(bin, `${rules}\n\n## 这一批（附图按这个顺序）\n${list}`, path.join(cfg.repoRoot, SCHEMA), { firstKey: 'shots', images: frames, timeoutMs: 600_000 });
          const got = r.shots || [];
          fs.writeFileSync(f, JSON.stringify(got));
          return got;
        } catch (e) { last = e; log(`critique: batch ${k + 1} (pass ${pass + 1}) failed, ${a ? 'giving up' : 'trying again'}: ${String(e.message).slice(0, 80)}`); }
      }
      throw last;
    };
    const batches = Array.from({ length: Math.ceil(items.length / BATCH) }, (_, i) => items.slice(i * BATCH, (i + 1) * BATCH));
    for (let i = 0; i < batches.length; i += 2) {
      const part = await Promise.all(batches.slice(i, i + 2).map(async (b, j) => {
        const frames = b.map((it) => pairImage(cfg, id, { shotId: it.shotId }, it.exemplar));
        const list = b.map((it, k) => `${k + 1}. ${it.shotId}（卡 ${it.recipe}${it.exemplar ? (world ? '，右边是这个世界的关键帧' : '，右边是样板') : '，没有样板'}）`).join('\n');
        return ask(0, i + j, b, frames.filter(Boolean), list);
      }));
      part.forEach((s) => shots.push(...s));
      log(`critique: ${shots.length} of ${items.length} shots`);
    }
    // the critic's score of the same frame moves by about 0.1 of the mean between rounds: every frame is
    // scored PASSES times (independent runs) and the scores averaged, issues taken from the first run
    for (let pass = 1; pass < PASSES; pass++) {
      const again = [];
      for (let i = 0; i < batches.length; i += 2) {
        const part = await Promise.all(batches.slice(i, i + 2).map(async (b, j) => {
          const frames = b.map((it) => path.join(projectPaths(cfg, id).root, 'tasks', 'critique', `${it.shotId}.jpg`));
          const list = b.map((it, k) => `${k + 1}. ${it.shotId}（卡 ${it.recipe}${it.exemplar ? (world ? '，右边是这个世界的关键帧' : '，右边是样板') : '，没有样板'}）`).join('\n');
          return ask(pass, i + j, b, frames.filter((f) => fs.existsSync(f)), list);
        }));
        part.forEach((x) => again.push(...x));
      }
      log(`critique: pass ${pass + 1} of ${PASSES}`);
      const by = new Map(again.map((x) => [x.shotId, x.score]));
      for (const x of shots) if (by.has(x.shotId)) { (x.scores ||= [x.score]).push(by.get(x.shotId)); x.score = +(x.scores.reduce((a, v) => a + v, 0) / x.scores.length).toFixed(2); }
    }
    // a shot the reviewer skipped is asked about once more on its own (one gap used to reject the run)
    const missed = items.filter((it) => !shots.some((x) => x.shotId === it.shotId));
    if (missed.length) {
      log(`critique: ${missed.length} shots without a verdict, asking again: ${missed.map((m) => m.shotId).join(',')}`);
      for (let i = 0; i < missed.length; i += BATCH) {
        const b = missed.slice(i, i + BATCH);
        const frames = b.map((it) => path.join(projectPaths(cfg, id).root, 'tasks', 'critique', `${it.shotId}.jpg`)).filter((f) => fs.existsSync(f));
        const list = b.map((it, k) => `${k + 1}. ${it.shotId}（卡 ${it.recipe}${it.exemplar ? '，右边是样板' : '，没有样板'}）`).join('\n');
        try { shots.push(...(await ask(9, 100 + i, b, frames, list)).filter((x) => b.some((it) => it.shotId === x.shotId))); } catch (e) { log(`critique: retry failed: ${String(e.message).slice(0, 80)}`); }
      }
    }
    shots.push(...kept);
    items = all;
    answer = { inputHash: hash, passes: PASSES, shots };
    writeAnswer(cfg, id, STEP, answer);
  }
  if (!answer) return { state: 'waiting', task: taskPaths(cfg, id, STEP).task };
  const check = checkCritique(answer, items);
  writeCheck(cfg, id, STEP, { answerHash: sha(JSON.stringify(answer)), inputHash: hash, ...check });
  if (!check.ok) return { state: 'rejected', errors: check.errors };
  const report = { inputHash: hash, seen: Object.fromEntries(items.map((it) => [it.shotId, seenKey(it)])), at: new Date().toISOString(), mean: +(answer.shots.reduce((a, s) => a + s.score, 0) / answer.shots.length).toFixed(2), shots: answer.shots };
  fs.writeFileSync(path.join(projectPaths(cfg, id).out, 'critique.json'), JSON.stringify(report, null, 1) + '\n');
  return { state: 'accepted', report };
}
