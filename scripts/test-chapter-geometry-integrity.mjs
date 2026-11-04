import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { geometryErrors, geometryIntegrity, saveTrack, replayChecks } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const shots = [{ shotId: 'B01', at: 0, dur: 2 }];
const drawn = { text: '測試', size: 72, alpha: 1, x0: 300, y0: 300, x1: 600, y1: 372 };
const track = [{ t: 0.4, drawn: [{ ...drawn, x0: NaN }], shapes: [], cover: null }];
assert(geometryErrors(track, shots).some(e => e.includes('geometry-nonfinite')), 'chapter geometry consumer must reject NaN instead of letting comparisons silently pass');
const sample = (d = drawn, shape = []) => [{ t: 0.4, drawn: [d], shapes: shape, cover: null }];
for (const t of [null, NaN, Infinity, '0.4']) {
  const mixed = [...sample(), { t, drawn: [{ ...drawn, x0: null }], shapes: [] }];
  assert.match(geometryIntegrity(mixed, shots).errors.join(), /geometry-nonfinite time/, 'invalid timestamp must not silently erase malformed geometry');
  assert.equal(geometryIntegrity(mixed, shots).coverage.drawn.status, 'fail');
}
assert.equal(geometryIntegrity([...sample(), { drawn: [drawn] }], shots).coverage.drawn.status, 'unknown');
for (const value of [NaN, Infinity, -Infinity, null, '300']) {
  assert.match(geometryErrors(sample({ ...drawn, x0: value }), shots).join(), /geometry-nonfinite/);
}
assert.equal(geometryIntegrity(sample(), shots).coverage.drawn.status, 'pass');
assert.equal(geometryIntegrity([], shots).coverage.drawn.status, 'unknown');
assert.equal(geometryIntegrity(sample({ text: 'missing box' }), shots).coverage.drawn.status, 'unknown');
assert.equal(geometryIntegrity(sample(), shots).coverage.shapes.status, 'unknown');
assert.equal(geometryIntegrity(sample({ ...drawn, x1: drawn.x0 }), shots).coverage.drawn.degenerate, 1, 'zero width can be a legal edge-on/entrance; not a hard aesthetic failure');
assert.deepEqual(geometryIntegrity(sample({ ...drawn, bleed: true, x0: -900 }), shots).errors, []);
assert.deepEqual(geometryIntegrity(sample({ ...drawn, inScene: true }), shots).errors, []);
assert.match(geometryErrors(sample(drawn, [{ kind: 'image', x0: 0, y0: 0, x1: Infinity, y1: 80 }]), shots).join(), /geometry-nonfinite shapes/);
const scratch = path.join(os.homedir(), '.hermes/cache/scratch');
fs.mkdirSync(scratch, { recursive: true });
const tmp = fs.mkdtempSync(path.join(scratch, 'chapter-integrity-'));
try {
  const cfg = { repoRoot: process.cwd(), sourceRoot: process.cwd(), dataDir: tmp };
  const root = path.join(tmp, 'projects/test');
  fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
  fs.writeFileSync(path.join(root, 'project.json'), '{}');
  fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify({ beats: [{ id: 'B01', text: '' }] }));
  fs.writeFileSync(path.join(root, 'shots/B01.json'), JSON.stringify({ shotId: 'B01', recipe: 'morph-chapter', motion: { duration: 2 } }));
  saveTrack(cfg, 'test', { id: 'B01', shots }, 'fixture', track);
  const rows = await replayChecks(cfg, 'test', { grep: 'geometry-nonfinite' });
  assert.match(rows[0].errors.join(), /geometry-nonfinite/, 'real saved-track replay rejects JSON-serialized NaN');
  assert.equal(rows[0].geometryIntegrity.coverage.drawn.status, 'fail', 'replay exposes machine-readable coverage');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const bananaFile = path.resolve('work/recipe-board-v1/projects/banana-design/out/chapters/B02/track.json');
if (fs.existsSync(bananaFile)) {
  const real = JSON.parse(fs.readFileSync(bananaFile));
  const before = geometryIntegrity(real.track, real.shots);
  assert.deepEqual(before.errors, [], 'kept banana track must not be rejected for legitimate cropped/zero-area geometry');
  const damaged = structuredClone(real.track);
  const frame = damaged.find(f => f.drawn?.length && real.shots.some(s => f.t >= s.at && f.t < s.at + s.dur));
  assert(frame, 'real track has measured text');
  frame.drawn[0].x0 = NaN;
  assert.match(geometryErrors(damaged, real.shots).join(), /geometry-nonfinite/, 'negative perturbation of a real text trace reaches the production geometry consumer');
  console.log(`banana real-track calibration: ${before.frames} frames, ${before.coverage.drawn.measured} text bounds, ${before.coverage.shapes.degenerate} legal degenerate shapes; injected NaN rejected`);
}
console.log('chapter geometry integrity consumer: OK (live, saved replay, legal crop/occlusion, unknown evidence)');
