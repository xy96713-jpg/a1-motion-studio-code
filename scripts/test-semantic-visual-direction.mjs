import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmDesignTask, filmScreenErrors } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
import { greyboxTask } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
import { briefText } from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = { repoRoot: root, sourceRoot: root, dataDir: path.join(root, 'work/recipe-board-v1') };
const guide = 'work/recipe-board-v1/SEMANTIC-VISUAL-DIRECTION.md';
assert.ok(fs.existsSync(path.join(root, guide)));
for (const [id, text] of [
  ['banana-design', '吸芽从地下茎长出'],
  ['suez-evergiven-blind', '船堵住运河'],
  ['paperclip-138-full', '从线索追到身份'],
]) {
  const task = filmDesignTask(cfg, id, [{ beat: 'B01', text, at: 0, dur: 5 }]);
  assert.equal(task.input.visualDirection, guide, `${id} receives the same semantic-first guidance`);
  assert.equal(task.input.beats[0].text, text, `${id} retains its own source semantics`);
}
const greybox = await greyboxTask(cfg, 'banana-design');
assert.equal(greybox.input.visualDirection, guide);
const brief = briefText({ id: 'sample', chapter: 'B01', beats: [], files: {} });
assert.ok(brief.includes(guide));
const media = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing/media.json')));
assert.deepEqual(filmScreenErrors(Array.from({ length: 8 }, (_, i) => ({ beat: `B${i}`, screen: 'clean' })), media), [], 'the guidance does not impose a screen quota');
console.log('semantic direction: real task and chapter handoff read the guide; no screen quota');
