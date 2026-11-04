import fs from 'node:fs';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../apps/studio-next/src/app/system-line-visual-workbench/GlobalStoryboardReviewPanel.tsx', import.meta.url),'utf8');
assert.doesNotMatch(source, /min-w-\[1640px\]/, 'wide table must be replaced, not kept as the main surface');
assert.match(source, /FrameFirstStoryboard/);
for (const action of ['saveAll()', 'regenerateAll()', 'save(shot)', 'upload(shot.shotId, file)', 'decide(shot, "APPROVE")', 'decide(shot, "REVISE")']) assert.ok(source.includes(action), action);
console.log('PASS: existing surface uses frame-first layout; original editing and review handlers retained');
