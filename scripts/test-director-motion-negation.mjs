import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferSubjectMotion } from '../apps/studio-next/src/lib/recipe-board/shotmotion.mjs';

test('a forbidden propagation is not selected as the subject action', () => {
  for (const text of ['不画沿一排传染', '禁止病斑沿排传递', '不能表现逐株传染', '避免一路传染']) {
    assert.notEqual(inferSubjectMotion(text), 'contagion-stagger', text);
  }
});

test('an explicit propagation instruction still selects the existing action', () => {
  assert.equal(inferSubjectMotion('病斑沿排逐株传染'), 'contagion-stagger');
  assert.equal(inferSubjectMotion('不画地图；病斑一路传染'), 'contagion-stagger');
});
