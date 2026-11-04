import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProject } from '../apps/studio-next/src/lib/recipe-board/run.mjs';
import { directorAnswerErrors } from '../apps/studio-next/src/lib/recipe-board/plan.mjs';
import { readTask, writeAnswer } from '../apps/studio-next/src/lib/recipe-board/agenttask.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function fixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-plan-agent-'));
  fs.mkdirSync(path.join(dataDir, 'routing'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'recipes'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'work/recipe-board-v1/routing/routing-table-v1.json'), path.join(dataDir, 'routing/routing-table-v1.json'));
  return { dataDir, repoRoot: REPO };
}
function answerFor(task, article) {
  return {
    sourceTaskInputHash: task.inputHash,
    beats: [{ id: 'B01', text: article, duration: 6, intent: 'concept', recipe: 'morph-chapter', visual: '同一个碗从冷变热，中心保留冷区。', why: '让因果发生在同一主体上', onScreen: { headline: '中心还是冷的', keywords: ['中心', '加热'] }, entities: [] }],
  };
}

test('plan: any manual session agent answers one bound task; no heuristic plan is published', async () => {
  const cfg = fixture();
  const article = '同一个碗受热，中心却可能仍然偏冷。';
  const articleFile = path.join(cfg.dataDir, 'article.txt');
  fs.writeFileSync(articleFile, article);
  await runProject(cfg, 'agent-plan', { article: articleFile, to: 'plan', log: () => {} });
  assert.equal(fs.existsSync(path.join(cfg.dataDir, 'projects/agent-plan/plan.json')), false);
  const task = readTask(cfg, 'agent-plan', 'plan');
  assert.equal(task.input.article, article);
  assert.equal(task.rules, 'work/recipe-board-v1/prompts/plan.md');
  writeAnswer(cfg, 'agent-plan', 'plan', answerFor(task, article));
  await runProject(cfg, 'agent-plan', { to: 'plan', log: () => {} });
  const plan = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'projects/agent-plan/plan.json'), 'utf8'));
  assert.equal(plan.input.text, article);
  assert.equal(plan.analyzer.mode, 'agent');
  assert.equal(plan.analyzer.agent, 'manual');
  assert.equal(plan.beats[0].id, 'B01');
  assert.equal(plan.beats[0].visual.includes('同一个碗'), true);
  assert.equal(plan.input.taskHash, task.inputHash);

  const replacement = '另一篇文章必须等待自己的导演答案。';
  const replacementFile = path.join(cfg.dataDir, 'replacement.txt');
  fs.writeFileSync(replacementFile, replacement);
  const heldLogs = [];
  await runProject(cfg, 'agent-plan', { article: replacementFile, to: 'brief', log: (line) => heldLogs.push(line) });
  assert.equal(fs.existsSync(path.join(cfg.dataDir, 'projects/agent-plan/tasks/brief.task.json')), false, 'a stale answer must not dispatch brief work');
  const heldPlan = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'projects/agent-plan/plan.json'), 'utf8'));
  assert.equal(heldPlan.input.text, article, 'the previous accepted plan is preserved but held');
  assert.equal(heldLogs.some((line) => line.includes('old plan is held')), true);

  // A run without repeating --article resumes the pending replacement, not the old plan.
  await runProject(cfg, 'agent-plan', { to: 'brief', log: () => {} });
  assert.equal(fs.existsSync(path.join(cfg.dataDir, 'projects/agent-plan/tasks/brief.task.json')), false);
});

test('plan: rejects stale tasks, unknown routes and omitted or invented narration', () => {
  const cfg = fixture();
  const article = '第一句。\n第二句。';
  const table = { intents: [{ id: 'concept', recipes: ['morph-chapter'] }] };
  const valid = { sourceTaskInputHash: 'a'.repeat(64), beats: [{ id: 'B01', text: article, duration: 5, intent: 'concept', visual: '同一个主体连续变化。', recipe: 'morph-chapter', why: '保持因果连续', onScreen: { headline: '两句', keywords: [] }, entities: [] }] };
  assert.deepEqual(directorAnswerErrors(valid, article, table, 'a'.repeat(64)), []);
  assert.match(directorAnswerErrors({ ...valid, sourceTaskInputHash: 'b'.repeat(64) }, article, table, 'a'.repeat(64))[0], /does not match/);
  assert.match(directorAnswerErrors({ ...valid, beats: [{ ...valid.beats[0], intent: 'talk-head' }] }, article, table, 'a'.repeat(64))[0], /unknown intent/);
  assert.match(directorAnswerErrors({ ...valid, beats: [{ ...valid.beats[0], text: '第一句。' }] }, article, table, 'a'.repeat(64))[0], /cover the article exactly/);
  assert.match(directorAnswerErrors({ ...valid, beats: [{ ...valid.beats[0], text: `${article}编造的一句。` }] }, article, table, 'a'.repeat(64))[0], /cover the article exactly/);
  assert.match(directorAnswerErrors({ ...valid, beats: [{ ...valid.beats[0], visual: '' }] }, article, table, 'a'.repeat(64))[0], /visual must describe/);
  assert.match(directorAnswerErrors({ ...valid, beats: [{ ...valid.beats[0], recipe: 'not-a-card' }] }, article, table, 'a'.repeat(64))[0], /not available/);
  assert.match(directorAnswerErrors({ ...valid, beats: [{ ...valid.beats[0], entities: [{ kind: 'org', entity: 'FDA', queryEn: 'microwave' }] }] }, article, table, 'a'.repeat(64))[0], /exactly kind, name, needsSource/);
});
