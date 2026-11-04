import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeTask, submitTaskAnswer, reviewSubmissionStatus, taskPaths } from '../apps/studio-next/src/lib/recipe-board/agenttask.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-distinct-review-'));
try {
  const dataDir = path.join(root, 'work/recipe-board-v1'), project = path.join(dataDir, 'projects/test-film');
  fs.mkdirSync(project, { recursive: true }); fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ id: 'test-film' }));
  const cfg = { repoRoot: root, sourceRoot: root, dataDir }, writer = 'morph-B01', review = 'morph-B01-review';
  writeTask(cfg, 'test-film', writer, { inputHash: 'input-v1', input: { sourceTaskInputHash: 'input-v1' } });
  const writerFile = path.join(root, 'writer.json'); fs.writeFileSync(writerFile, JSON.stringify({ sourceTaskInputHash: 'input-v1', code: 'a' }));
  assert.throws(() => submitTaskAnswer(cfg, 'test-film', writer, writerFile, { env: {} }), /CODEX_THREAD_ID/);
  const w = submitTaskAnswer(cfg, 'test-film', writer, writerFile, { env: { CODEX_THREAD_ID: 'writer' } });
  writeTask(cfg, 'test-film', review, { forAnswer: w.answerHash, independentReview: { writerStep: writer }, input: {} });
  const reviewFile = path.join(root, 'review.json'); fs.writeFileSync(reviewFile, JSON.stringify({ frames: [] }));
  assert.throws(() => submitTaskAnswer(cfg, 'test-film', review, reviewFile, { env: { CODEX_THREAD_ID: 'writer' } }), /different threads/);
  submitTaskAnswer(cfg, 'test-film', review, reviewFile, { env: { CODEX_THREAD_ID: 'reviewer' } });
  const task = JSON.parse(fs.readFileSync(taskPaths(cfg, 'test-film', review).task));
  assert.equal(reviewSubmissionStatus(cfg, 'test-film', review, task, { writerStep: writer }).ok, true);
  fs.writeFileSync(taskPaths(cfg, 'test-film', review).answer, JSON.stringify({ frames: ['tampered'] }));
  assert.equal(reviewSubmissionStatus(cfg, 'test-film', review, task, { writerStep: writer }).ok, false, 'changed review must not reuse the receipt');
  writeTask(cfg, 'test-film', writer, { inputHash: 'input-v2', input: { sourceTaskInputHash: 'input-v2' } });
  assert.equal(reviewSubmissionStatus(cfg, 'test-film', review, task, { writerStep: writer }).ok, false, 'changed writer task invalidates the review');
  console.log('review provenance: separate runtime threads required; missing, same-thread and stale answers fail');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
