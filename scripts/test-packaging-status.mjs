import assert from 'node:assert/strict';
import { projectStatus } from './packaging-status.mjs';
const s = projectStatus('banana-design');
assert.ok(Array.isArray(s.stages));
assert.ok(s.stages.find((x) => x.id === 'design-options'));
assert.ok(s.next, 'incomplete project must have next action');
assert.equal(s.ok, false);
console.log('packaging status tests pass');
