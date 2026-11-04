import assert from 'node:assert/strict';
import { buildOptions } from './design-options.mjs';
import { validateDesignBoard } from './design-gate.mjs';
const o = buildOptions({ text: '任意文字包装闭环', title: '任意文字', transition: 'same seam' });
const board = {
  contract: 'A1DesignBoard/v1', line: '任意文字', visualThesis: '文字不是装饰，是有方向的视觉论点',
  directions: o.options.map((x, i) => ({ id: 'OPT-' + (i + 1), thesis: x.thesis, medium: x.direction, build: x.build, reference: 'README.md', frame: 'package.json', motion: 'package.json', checks: { composite: 'pass' } })),
  selected: 'OPT-1', userDecision: { status: 'approved', by: 'user', words: 'this one' },
  lookLock: { status: 'locked', selected: 'OPT-1', reference: 'README.md', rules: ['composition','subject','camera','light','color','foreground-background','seam'], evidence: { still: 'x', motion: 'x', review: 'x' }, delivery: 'no-different-delivery' },
};
assert.deepEqual(validateDesignBoard(board), []);
const unlocked = JSON.parse(JSON.stringify(board)); unlocked.lookLock.status = 'draft';
assert.ok(validateDesignBoard(unlocked).some((e) => e.includes('lookLock status')));
const fewer = JSON.parse(JSON.stringify(board)); fewer.directions = fewer.directions.slice(0, 5);
assert.ok(validateDesignBoard(fewer).some((e) => e.includes('at least 6')));
console.log('packaging closed-loop tests pass');
