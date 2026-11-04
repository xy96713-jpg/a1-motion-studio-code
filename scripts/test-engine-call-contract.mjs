// Offline checks for the engine-kit call contracts (chapter.mjs engineCallErrors): the argument order and literal ids
// the line builds assets from fail at the answer, not after a render (the user's K8 class: 参数写错位置).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { engineCallErrors, splitCallArgs, kitCallArgs } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';

// argument text of a call is split at its top-level commas only
assert.deepEqual(splitCallArgs("THREE, 'a,b', () => x, { a: 1, b: 2 }"), ['THREE', "'a,b'", '() => x', '{ a: 1, b: 2 }']);
assert.deepEqual(splitCallArgs(''), []);
assert.deepEqual(kitCallArgs("await kit.props.model(THREE, 'a', { fallback: () => kit.props.model(THREE, 'b') })", 'props.model'),
  ["THREE, 'a', { fallback: () => kit.props.model(THREE, 'b') }", "THREE, 'b'"], 'nested calls keep their own parens and are checked too');
assert.deepEqual(kitCallArgs('// kit.props.model(THREE, x)\nconst a = 1;', 'props.model'), [], 'commented calls are not read');

const ok = [
  "const m = await kit.props.model(THREE, 'banana', { what: 'a curved yellow banana', length: 0.95, fallback: () => kit.props.tugboat(THREE) });",
  "const m = await kit.props.model(THREE, 'tug');",
  "const s = await kit.engine.subject(THREE, st, 'h100', { at: [0, 0, 0], size: 2, mono: 1 });",
  "const tv = kit.engine.screen('tv', { medium: 'crt', W: 960, H: 540, draw: (cg, t) => cg.fillRect(0, 0, 1, 1) });",
  "kit.engine.baked.rigid(url('out/bake.json'));",
  "kit.engine.baked.camera(url('out/cam.json'));",
];
for (const code of ok) assert.deepEqual(engineCallErrors(code), [], code);

const fail = [
  ["kit.props.model('banana', THREE, { what: 'x' })", /first argument must be THREE/],
  ["kit.props.model(THREE, name, { what: 'x' })", /id must be a literal lower-case name/],
  ["kit.props.model(THREE, 'Banana', { what: 'x' })", /id must be a literal lower-case name/],
  ["kit.props.model(THREE)", /takes 2–3 arguments \(got 1\)/],
  ["kit.props.model(THREE, 'banana', 'a curved banana')", /options must be an object literal/],
  ["kit.props.model(THREE, 'banana', { what: 'x', colour: '#fff' })", /unknown option "colour"/],
  ["kit.engine.subject(st, THREE, 'drill')", /first argument must be THREE/],
  ["kit.engine.subject(THREE, st, id, {})", /id must be a literal lower-case name/],
  ["kit.engine.screen('tv', { medium: 'crt', drawings: () => 1 })", /unknown option "drawings"/],
  ["kit.engine.baked.rigid(url('a'), url('b'))", /takes 1 arguments \(got 2\)/],
];
for (const [code, re] of fail) {
  const got = engineCallErrors(code);
  assert.ok(got.length, `must fail: ${code}`);
  assert.match(got.join('\n'), re, code);
}
assert.deepEqual(engineCallErrors("// kit.props.model('banana', THREE, {})\nconst a = 1;"), [], 'a commented bad call is not an error');

// guard against false positives: every kept chapter module in the projects passes the contract as it is
const projects = fs.readdirSync('work/recipe-board-v1/projects').filter((p) => fs.existsSync(path.join('work/recipe-board-v1/projects', p, 'chapters')));
const chapters = projects.flatMap((p) => fs.readdirSync(path.join('work/recipe-board-v1/projects', p, 'chapters'))
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => path.join('work/recipe-board-v1/projects', p, 'chapters', f)));
assert.ok(chapters.length >= 10, `kept chapter modules found (${chapters.length})`);
for (const file of chapters) assert.deepEqual(engineCallErrors(fs.readFileSync(file, 'utf8')), [], `kept chapter passes engine-call contracts: ${file}`);
console.log(`engine call contracts: ${chapters.length} kept chapter modules pass; argument order, literal ids and option keys verified`);
