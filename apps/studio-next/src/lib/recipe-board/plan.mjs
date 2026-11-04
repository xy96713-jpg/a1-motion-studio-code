// Article direction is a standard agent task, like brief and storyboard. Any session agent can answer it;
// unattended Codex uses the same task and the same checks. No provider-specific fallback writes a plan.
import { planFromBeats, loadRoutingTable } from './director.mjs';
import { agentFor, readAnswer, readTask, runCodexTask, sha, taskPaths, writeAnswer, writeCheck, writeTask } from './agenttask.mjs';
import { readPlan } from './store.mjs';

const STEP = 'plan';
const RULES = 'work/recipe-board-v1/prompts/plan.md';
const SCHEMA = 'work/recipe-board-v1/routing/plan-answer.schema.json';
const compact = (s) => String(s || '').replace(/\s+/g, '');

export function directorAnswerErrors(answer, article, table, inputHash = null) {
  const errors = [];
  if (!answer || !Array.isArray(answer.beats) || !answer.beats.length) return ['beats must be a non-empty array'];
  const rootKeys = new Set(['sourceTaskInputHash', 'beats']);
  for (const key of Object.keys(answer)) if (!rootKeys.has(key)) errors.push(`unknown root field ${key}`);
  if (inputHash && answer.sourceTaskInputHash !== inputHash) errors.push('sourceTaskInputHash does not match the current article task');
  const intents = new Map(table.intents.map((x) => [x.id, x]));
  const ids = new Set();
  const beatKeys = new Set(['id', 'text', 'duration', 'intent', 'visual', 'recipe', 'why', 'onScreen', 'entities']);
  const entityKinds = new Set(['person', 'org', 'product', 'number', 'article', 'quote', 'software', 'place', 'event']);
  answer.beats.forEach((b, i) => {
    const tag = b?.id || `beat ${i + 1}`;
    for (const key of Object.keys(b || {})) if (!beatKeys.has(key)) errors.push(`${tag}: unknown field ${key}`);
    if (!/^B\d{2}$/.test(b?.id || '')) errors.push(`${tag}: id must match B01, B02, ...`);
    if (ids.has(b?.id)) errors.push(`${tag}: duplicate id`);
    ids.add(b?.id);
    if (!String(b?.text || '').trim()) errors.push(`${tag}: text is empty`);
    if (!Number.isFinite(b?.duration) || b.duration <= 0) errors.push(`${tag}: duration must be a positive number`);
    if (!String(b?.visual || '').trim()) errors.push(`${tag}: visual must describe the visible subject, state and action`);
    if (typeof b?.recipe !== 'string') errors.push(`${tag}: recipe is required (use an empty string for automatic routing)`);
    if (typeof b?.why !== 'string' || !b.why.trim()) errors.push(`${tag}: why is required`);
    const intent = intents.get(b?.intent);
    if (!intent) errors.push(`${tag}: unknown intent ${b?.intent}`);
    else if (b.recipe && !(intent.recipes || []).includes(b.recipe)) errors.push(`${tag}: recipe ${b.recipe} is not available for intent ${b.intent}`);
    if (typeof b?.onScreen?.headline !== 'string' || !Array.isArray(b?.onScreen?.keywords) || b.onScreen.keywords.some((x) => typeof x !== 'string')) errors.push(`${tag}: onScreen.headline and string keywords are required`);
    if (!Array.isArray(b?.entities)) errors.push(`${tag}: entities must be an array`);
    else b.entities.forEach((e, j) => {
      const keys = Object.keys(e || {}).sort().join(',');
      if (keys !== 'kind,name,needsSource') errors.push(`${tag} entity ${j + 1}: fields must be exactly kind, name, needsSource`);
      if (!entityKinds.has(e?.kind) || typeof e?.name !== 'string' || !e.name.trim() || typeof e?.needsSource !== 'boolean') errors.push(`${tag} entity ${j + 1}: invalid kind, name or needsSource`);
    });
    if ((b?.onScreen?.keywords || []).length > 3) errors.push(`${tag}: at most three keywords`);
  });
  if (compact(answer.beats.map((b) => b?.text).join('')) !== compact(article)) errors.push('the beats must cover the article exactly, in order, without omitted or invented narration');
  return errors;
}

export function planTaskInput({ article, title = '', hasPresenter = false }, table) {
  return {
    article,
    title,
    hasPresenter,
    intents: table.intents.map((x) => ({ id: x.id, label: x.label, technique: x.technique })),
    entityKinds: ['person', 'org', 'product', 'number', 'article', 'quote', 'software', 'place', 'event'],
  };
}

/** @param {{article: string, title?: string, hasPresenter?: boolean, agent?: string|null, log?: (line: string) => void}} options */
export async function stepPlan(cfg, id, { article, title = '', hasPresenter = false, agent = null, log = () => {} } = {}) {
  const clean = String(article || '').replace(/\r\n/g, '\n').trim();
  if (!clean) throw new Error('article is empty');
  const table = loadRoutingTable(cfg);
  const input = planTaskInput({ article: clean, title, hasPresenter }, table);
  const inputHash = sha(JSON.stringify(input));
  let task = readTask(cfg, id, STEP);
  if (!task || task.inputHash !== inputHash || task.rules !== RULES || task.schema !== SCHEMA) {
    writeTask(cfg, id, STEP, { inputHash, rules: RULES, schema: SCHEMA, input });
    task = readTask(cfg, id, STEP);
  }
  let answer = readAnswer(cfg, id, STEP);
  const backend = agent || agentFor(cfg, id, STEP);
  if (answer && answer.sourceTaskInputHash !== inputHash) answer = null;
  if (!answer && backend === 'codex') {
    for (let round = 1; round <= 3; round++) {
      log(`plan: asking Codex (round ${round})`);
      const previous = readAnswer(cfg, id, STEP);
      const errors = previous ? directorAnswerErrors(previous, clean, table, inputHash) : [];
      const dispatch = errors.length ? { ...task, input: { ...task.input, previousAnswer: previous, checkErrors: errors } } : task;
      answer = await runCodexTask(cfg, STEP, dispatch, 'beats');
      writeAnswer(cfg, id, STEP, answer);
      if (!directorAnswerErrors(answer, clean, table, inputHash).length) break;
    }
  }
  if (!answer) return { state: 'waiting', task: taskPaths(cfg, id, STEP).task, inputHash };
  const errors = directorAnswerErrors(answer, clean, table, inputHash);
  const answerHash = sha(JSON.stringify(answer));
  writeCheck(cfg, id, STEP, { ok: !errors.length, errors, warnings: [], answerHash, inputHash });
  if (errors.length) return { state: 'rejected', errors, inputHash };
  const plan = planFromBeats(cfg, {
    beats: answer.beats,
    title,
    source: `agent:${backend}`,
    text: clean,
    hasPresenter,
    agent: backend,
  });
  plan.input.taskHash = inputHash;
  return { state: 'accepted', plan, inputHash };
}

export function pendingPlanArticle(cfg, id) {
  const task = readTask(cfg, id, STEP);
  if (!task?.input?.article) return null;
  const plan = readPlan(cfg, id);
  if (plan?.input?.taskHash === task.inputHash) return null;
  return { article: task.input.article, title: task.input.title || '', hasPresenter: !!task.input.hasPresenter };
}
