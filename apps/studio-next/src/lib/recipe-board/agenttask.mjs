// Agent tasks: the judgment steps of the line (brief, later storyboard and critique) are "fill-in" tasks,
// so any agent can do them by the same rules and pass the same checks.
//
//   projects/<id>/tasks/<step>.task.json    what to do: inputs, rules file, answer schema (written by the line)
//   projects/<id>/tasks/<step>.answer.json  the agent's answer (written by whoever does the step)
//   projects/<id>/tasks/<step>.check.json   the system's verdict on the last answer: errors block, warnings inform
//
// Backends: 'codex' (local Codex CLI, unattended runs) or 'manual' (a session agent such as Claude reads the
// task and writes the answer; `run` lists the step as waiting until it exists). The checks are the same.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectPaths, loadProject } from './store.mjs';
import { stillReviewMaterialsStatus } from './stills.mjs';
import { resolveRuntimeIdentity } from './runtime-identity.mjs';

export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 20);
const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };

export function taskPaths(cfg, id, step) {
  const dir = path.join(projectPaths(cfg, id).root, 'tasks');
  return { dir, task: path.join(dir, `${step}.task.json`), answer: path.join(dir, `${step}.answer.json`), check: path.join(dir, `${step}.check.json`) };
}

// Which backend does a step use: project.agents[step] > project.agents.default > env A1_AGENT > 'manual'.
export function agentFor(cfg, id, step, env = process.env) {
  const a = loadProject(cfg, id).agents || {};
  return a[step] || a.default || env.A1_AGENT || 'manual';
}

export function writeTask(cfg, id, step, task) {
  const p = taskPaths(cfg, id, step);
  writeJson(p.task, { contract: 'A1RecipeBoardTask/v1', step, project: id, writtenAt: new Date().toISOString(), answerFile: path.relative(projectPaths(cfg, id).root, p.answer), ...task });
  return p.task;
}
export const readTask = (cfg, id, step) => readJson(taskPaths(cfg, id, step).task);
export const readAnswer = (cfg, id, step) => readJson(taskPaths(cfg, id, step).answer);
export function writeAnswer(cfg, id, step, answer) { writeJson(taskPaths(cfg, id, step).answer, answer); }

// Receipt of an answer submitted by a running Codex or verified Hermes actor. This is an operational provenance
// check, not a security boundary against someone with arbitrary write access to the workspace.
export const submissionPath = (cfg, id, step) => path.join(taskPaths(cfg, id, step).dir, `${step}.submission.json`);
export const threadHash = (env = process.env) => resolveRuntimeIdentity(env)?.actorThread || null;
const answerHash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const safeStep = (step) => /^[A-Za-z0-9_-]{1,80}$/.test(String(step || ''));
export function writerSubmissionStatus(cfg, id, step, expectedAnswer) {
  if (!safeStep(step)) return { ok: false, why: 'writer task identity is missing' };
  try {
    const writer = taskPaths(cfg, id, step), receipt = readJson(submissionPath(cfg, id, step)), task = readJson(writer.task), bytes = fs.readFileSync(writer.answer), answer = JSON.parse(bytes);
    // Greybox uses forInput, not morph's inputHash/sourceTaskInputHash answer schema.
    // Bind its existing task bytes instead of inventing another answer field or attesting old files.
    const inputBound = step === 'greybox' && task?.forInput && !task.inputHash
      ? receipt?.taskHash === sha(fs.readFileSync(writer.task))
      : !!task?.inputHash && receipt?.taskInputHash === task.inputHash && answer.sourceTaskInputHash === task.inputHash;
    if (receipt?.contract !== 'A1TaskSubmission/v1' || !receipt.actorThread || receipt.answerHash !== answerHash(bytes) || !inputBound || receipt.answerHash !== expectedAnswer) return { ok: false, why: 'writer submission is missing, stale or not bound to this answer' };
    return { ok: true, actorThread: receipt.actorThread };
  } catch { return { ok: false, why: 'writer submission receipt is unavailable' }; }
}
export function reviewSubmissionStatus(cfg, id, step, task, { writerStep = null } = {}) {
  if (!safeStep(step) || !safeStep(writerStep)) return { ok: false, why: 'review writer or task identity is missing' };
  try {
    const reviewer = taskPaths(cfg, id, step);
    const w = writerSubmissionStatus(cfg, id, writerStep, task?.forAnswer), r = readJson(submissionPath(cfg, id, step));
    const rbytes = fs.readFileSync(reviewer.answer), tbytes = fs.readFileSync(reviewer.task);
    if (!w.ok) return w;
    if (r?.contract !== 'A1TaskSubmission/v1' || !r.actorThread || r.answerHash !== answerHash(rbytes) || r.taskHash !== sha(tbytes)) return { ok: false, why: 'review submission is missing or stale' };
    if (w.actorThread === r.actorThread) return { ok: false, why: 'writer and reviewer are the same thread' };
    return { ok: true, writerThread: w.actorThread, reviewerThread: r.actorThread, status: 'distinct-submitting-threads' };
  } catch { return { ok: false, why: 'writer or reviewer submission receipt is unavailable' }; }
}
export function submitTaskAnswer(cfg, id, step, answerFile, { env = process.env } = {}) {
  if (!safeStep(step)) throw new Error('invalid task step');
  const actorThread = threadHash(env); if (!actorThread) throw new Error('runtime identity unavailable or conflicting: require CODEX_THREAD_ID or a live HERMES_SESSION_ID verified in HERMES_HOME/state.db; never supply an ID manually (Grok/Shell: mint a real Hermes oneshot/session for this filing, then run submit-task under that env — do not reuse foreign local-* ids or forge CODEX_THREAD_ID)');
  const tp = taskPaths(cfg, id, step), rawTask = fs.readFileSync(tp.task), task = JSON.parse(rawTask), raw = fs.readFileSync(answerFile), answer = JSON.parse(raw);
  if (fs.existsSync(tp.answer) && fs.realpathSync(answerFile) === fs.realpathSync(tp.answer)) throw new Error('write a new candidate file before submission; do not attest an existing canonical answer in place');
  if (task.inputHash && answer.sourceTaskInputHash !== task.inputHash) throw new Error('answer does not name the current task input hash');
  if (task.input?.stillReviewPack) { const status = stillReviewMaterialsStatus(task); if (!status.ok) throw new Error(`still review materials invalid: ${status.errors.join('; ')}`); }
  const writerStep = task.independentReview?.writerStep;
  if (writerStep) {
    if (!safeStep(writerStep)) throw new Error('invalid writer step');
    const receipt = writerSubmissionStatus(cfg, id, writerStep, task.forAnswer);
    if (!receipt.ok) throw new Error(receipt.why);
    if (actorThread === receipt.actorThread) throw new Error('writer and reviewer must be different threads');
  }
  fs.mkdirSync(tp.dir, { recursive: true });
  const lock = path.join(tp.dir, `${step}.submit.lock`), fd = fs.openSync(lock, 'wx');
  try {
    if (!fs.readFileSync(tp.task).equals(rawTask)) throw new Error('task changed during submission; reread it before submitting');
    if (fs.existsSync(tp.answer)) {
      const before = fs.readFileSync(tp.answer);
      if (!before.equals(raw)) { const backup = tp.answer.replace(/\.json$/, `.before-${answerHash(before)}.json`); if (!fs.existsSync(backup)) fs.copyFileSync(tp.answer, backup, fs.constants.COPYFILE_EXCL); }
    }
    const temp = `${tp.answer}.${process.pid}.tmp`; fs.writeFileSync(temp, raw, { flag: 'wx' }); fs.renameSync(temp, tp.answer);
    const receipt = { contract: 'A1TaskSubmission/v1', step, actorThread, taskHash: sha(rawTask), taskInputHash: task.inputHash || null, answerHash: answerHash(raw), submittedAt: new Date().toISOString() };
    writeJson(submissionPath(cfg, id, step), receipt); return receipt;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
// every check counts its rounds: a new answer checked is the next round (the user 2026-10-27: 返工次数有点太多 — the line
// keeps how many rounds each step took, so the retrospective can say where the rework is)
export function writeCheck(cfg, id, step, result) {
  const prev = readJson(taskPaths(cfg, id, step).check), round = (prev?.round || 0) + (result.answerHash && prev?.answerHash === result.answerHash ? 0 : 1);
  writeJson(taskPaths(cfg, id, step).check, { checkedAt: new Date().toISOString(), ...result, round });
  // every round kept (the check file is the last one only): what each rule caught, across rounds and films, is counted
  // from it (ruleStats; the audit of 2026-10-27 could not tell which of 40 checks ever caught anything)
  if (result.answerHash && prev?.answerHash !== result.answerHash) { try { fs.appendFileSync(taskPaths(cfg, id, step).check.replace(/\.check\.json$/, '.history.jsonl'), JSON.stringify({ at: new Date().toISOString(), round, ok: !!result.ok, errors: (result.errors || []).map((e) => String(e).slice(0, 200)) }) + '\n'); } catch { /* the count is a report, never a stop */ } }
}
// (pure, tested) a rule's signature from one of its messages: the words with the beat, figures, quotes and colours out
export const ruleSignature = (e) => String(e).replace(/^[A-Z]\d{2,3}[:,.]?\s*/, '').replace(/plan2\.beats\.B\d+/g, 'plan2.beats.B').replace(/"[^"]*"|「[^」]*」|“[^”]*”/g, '…').replace(/#[0-9a-f]{6}/gi, '#').replace(/\d+(\.\d+)?/g, 'n').replace(/\s+/g, ' ').split(/[:;(—]/)[0].trim().slice(0, 90);
// what each rule caught, across every project's checks and their histories
export function ruleStats(cfg) {
  const root = path.join(cfg.dataDir, 'projects'), count = new Map();
  for (const p of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const td = path.join(root, p, 'tasks'); if (!fs.existsSync(td)) continue;
    for (const f of fs.readdirSync(td)) {
      const rows = f.endsWith('.history.jsonl') ? fs.readFileSync(path.join(td, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
        : f.endsWith('.check.json') && !fs.existsSync(path.join(td, f.replace(/\.check\.json$/, '.history.jsonl'))) ? [readJson(path.join(td, f)) || {}] : [];
      for (const r of rows) for (const e of r.errors || []) { const k = ruleSignature(e), x = count.get(k) || { rule: k, n: 0, films: new Set(), example: e }; x.n++; x.films.add(p); count.set(k, x); }
    }
  }
  return [...count.values()].map((x) => ({ ...x, films: [...x.films] })).sort((a, b) => b.n - a.n);
}

// Unattended backend: the step's rules file + the task as the prompt, the schema as the output contract.
export async function runCodexTask(cfg, step, task, firstKey) {
  if (task.input?.stillReviewPack) { const status = stillReviewMaterialsStatus(task); if (!status.ok) throw new Error(`still review materials invalid before dispatch: ${status.errors.join('; ')}`); }
  const { codexExecutable, runCodexJson } = await import('./director.mjs');
  const bin = codexExecutable();
  if (!bin) throw new Error('Codex CLI not found (set A1_CODEX_BIN)');
  const rules = fs.readFileSync(path.join(cfg.repoRoot, task.rules), 'utf8');
  const prompt = `${rules}\n\n## 任务\n\n只输出符合 schema 的 JSON。\n\n${JSON.stringify(task.input)}`;
  // The task file carries everything the answer may use: run in an empty folder so the agent cannot
  // read the repo (reference breakdowns, other answers) and the result stays reproducible.
  // a chapter module (code) with its keyframes and worked examples takes longer than a judgment answer: 25 minutes
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `a1-${step}-`));
  try {
    return await runCodexJson(bin, prompt, path.join(cfg.repoRoot, task.schema), { firstKey, timeoutMs: firstKey === 'code' ? 1_500_000 : 900_000, cwd, images: (task.images || []).filter((f) => fs.existsSync(f)) });   // pictures the task shows (target frames)
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}
