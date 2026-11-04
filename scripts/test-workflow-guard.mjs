import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scopeErrors, verdictErrors, guardCheck, main } from './workflow-guard.mjs';

test('guard: a write inside the task scopes passes, one outside fails', () => {
  assert.deepEqual(scopeErrors(['work/a/b.mjs'], ['work/a']), []);
  assert.deepEqual(scopeErrors(['work/a/b.mjs'], ['work/a/b.mjs']), []);
  assert.deepEqual(scopeErrors(['work/c/d.mjs'], ['work/a']), ['work/c/d.mjs']);
  assert.deepEqual(scopeErrors(['work/a/b.mjs'], []), ['task has no writeScopes']);
});

test('guard: a review passes only when its verdict is pass and no severity-3 fix is open', () => {
  assert.deepEqual(verdictErrors({ verdict: 'pass', mustFix: [] }), []);
  assert.deepEqual(verdictErrors({ verdict: 'pass', mustFix: [{ severity: 2, say: 'note' }] }), []);
  assert.deepEqual(verdictErrors({ verdict: 'fail', mustFix: [] }), ['review verdict=fail']);
  assert.deepEqual(verdictErrors({ verdict: 'pass', mustFix: [{ severity: 3, say: 'block' }] }), ['1 blocking must-fix']);
  assert.deepEqual(verdictErrors(null), ['no review verdict']);
});

test('guard: no task means no work', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-guard-'));
  const r = guardCheck({ root, project: 'p', task: 't' });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /no task/);
  assert.equal(main(['--project', 'p', '--task', 't']), 1);
});

test('guard: a task with scopes but no review is not deliverable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-guard-'));
  const dir = path.join(root, 'work/recipe-board-v1/projects/p/tasks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 't.json'), JSON.stringify({ id: 't', kind: 'experiment', allowStyleLab: true, writeScopes: ['work/recipe-board-v1/projects/p'], baseAt: '2000-01-01T00:00:00.000Z' }));
  const r = guardCheck({ root, project: 'p', task: 't', mode: 'present', review: 'r' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /no review|no review r/.test(e) || /git status failed/.test(e)));
});
