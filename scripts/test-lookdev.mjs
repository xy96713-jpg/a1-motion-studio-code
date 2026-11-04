import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from '../apps/studio-next/node_modules/sharp/lib/index.js';
import crypto from 'node:crypto';
import { pickLookAnchors, lookDevErrors, lookdevReferenceErrors, LOOKDEV_CONTRACT } from '../apps/studio-next/src/lib/recipe-board/lookdev.mjs';
import { briefText } from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';

test('the three anchors are one object/principle, one evidence and one map', () => {
  const shots = [
    { beat: 'B01', isHero: true, stage3d: true, evidence: [], reads: [] },
    { beat: 'B02', evidence: [{ form: 'photo', what: 'the field' }] },
    { beat: 'B03', diagram: { form: 'map' } },
    { beat: 'B04', reads: [{ what: 'a' }, { what: 'b' }] },
  ];
  const a = pickLookAnchors(shots);
  assert.deepEqual(a.map((x) => [x.beat, x.kind]), [['B01', 'object'], ['B02', 'evidence'], ['B03', 'map']]);
});

test('a target-frame answer must be three anchors, 2–3 different text-free images, one chosen, reference and achievable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lookdev-'));
  try {
    const files = {};
    for (const beat of ['B01', 'B02', 'B03']) for (const id of ['A', 'B']) {
      const file = path.join('targets', `${beat}-${id}.png`);
      fs.mkdirSync(path.join(root, 'targets'), { recursive: true });
      // two visibly different solids per anchor, so the byte-difference rule has a real case
      await sharp({ create: { width: 8, height: 8, channels: 3, background: id === 'A' ? '#223344' : '#aa8844' } }).png().toFile(path.join(root, file));
      files[`${beat}${id}`] = file;
    }
    fs.writeFileSync(path.join(root, 'ref.png'), 'not read by the checker, only its path is tested');
    const anchors = ['B01', 'B02', 'B03'].map((beat, i) => ({
      beat, kind: ['object', 'evidence', 'map'][i], reference: 'ref.png',
      directions: ['A', 'B'].map((id) => ({ id, file: files[beat + id], why: `direction ${id} changes the subject and the light`, textFree: true, source: 'imagegen' })),
      chosen: 'A', chosenWhy: 'the first direction holds the subject and the reading order', achievable: 'the chapter builds it from the model library and the approved palette',
    }));
    const input = { anchors: ['B01', 'B02', 'B03'].map((beat, i) => ({ beat, kind: ['object', 'evidence', 'map'][i] })), references: [path.join(root, 'ref.png')] };
    const ok = { contract: LOOKDEV_CONTRACT, sourceTaskInputHash: 'h', anchors };
    assert.deepEqual(lookDevErrors(ok, input, { root }), []);
    const badText = structuredClone(ok); badText.anchors[0].directions[0].textFree = false;
    assert.ok(lookDevErrors(badText, input, { root }).some((e) => /textFree/.test(e)));
    const same = structuredClone(ok); same.anchors[0].directions[1].file = same.anchors[0].directions[0].file;
    assert.ok(lookDevErrors(same, input, { root }).some((e) => /same picture/.test(e)));
    const two = structuredClone(ok); two.anchors[0].directions = [two.anchors[0].directions[0]];
    assert.ok(lookDevErrors(two, input, { root }).some((e) => /2–3 directions/.test(e)));
    const no = structuredClone(ok); no.anchors[0].chosen = 'C';
    assert.ok(lookDevErrors(no, input, { root }).some((e) => /chosen/.test(e)));
    const kind = structuredClone(ok); kind.anchors[0].kind = 'map';
    assert.ok(lookDevErrors(kind, input, { root }).some((e) => /kind/.test(e)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a chapter brief carries the chosen lookdev target for its beat', () => {
  const text = briefText({
    id: 'x', chapter: 'B04',
    beats: [{ beat: 'B04', at: 0, dur: 5, text: 'same clone' }],
    lookdev: { B04: { chosen: { file: 'targets/B04-A.png' }, reference: 'house/style', chosenWhy: 'holds the subject and the reading order', achievable: 'the model library and the approved palette' } },
    files: {},
  });
  assert.match(text, /定样子目标帧（本章必须复现）：targets\/B04-A\.png/);
  assert.match(text, /为什么选它：holds the subject/);
});

test('a chapter using a lookdev target must bind that exact target at start/change/end', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lookdev-ref-'));
  try {
    const cfg = { repoRoot: root, dataDir: path.join(root, 'work/recipe-board-v1') };
    const p = path.join(cfg.dataDir, 'projects/test');
    fs.mkdirSync(path.join(p, 'out/lookdev'), { recursive: true });
    fs.mkdirSync(path.join(p, 'targets'), { recursive: true });
    fs.writeFileSync(path.join(p, 'project.json'), '{"id":"test"}');
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#334455' } }).png().toFile(path.join(p, 'targets/B04-A.png'));
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(p, 'targets/B04-A.png'))).digest('hex');
    fs.writeFileSync(path.join(p, 'out/lookdev/lookdev.json'), JSON.stringify({ contract: LOOKDEV_CONTRACT, anchors: [{ beat: 'B04', kind: 'object', reference: '', chosen: 'A', chosenWhy: 'x'.repeat(8), achievable: 'the model library', directions: [{ id: 'A', file: 'targets/B04-A.png', why: 'x'.repeat(8), textFree: true, source: 'imagegen' }] }] }));
    const answer = { motionImplementation: [{ shotId: 'B04', referenceComparison: { reference: { file: 'targets/B04-A.png', hash }, start: 'the target holds the bunch on the floor', change: 'the camera moves right and the type enters', end: 'the last fruit sits under the title' } }] };
    assert.deepEqual(lookdevReferenceErrors(answer, cfg, 'test'), []);
    const wrongHash = structuredClone(answer); wrongHash.motionImplementation[0].referenceComparison.reference.hash = '0'.repeat(64);
    assert.ok(lookdevReferenceErrors(wrongHash, cfg, 'test').some((e) => /hash/.test(e)));
    const missing = structuredClone(answer); missing.motionImplementation[0].referenceComparison = null;
    assert.ok(lookdevReferenceErrors(missing, cfg, 'test').some((e) => /not compared/.test(e)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
