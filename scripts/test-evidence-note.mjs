import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as C from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
const source = fs.readFileSync(new URL('../apps/studio-next/src/lib/recipe-board/chapter.mjs', import.meta.url), 'utf8');
// Execute the real params.note expression at every production entry, without opening a renderer.
// Only checked-in repository expressions are compiled, never task/user/web content.
const expressions = [...source.matchAll(/sub: false, note: ([^\n]+?), lines: await chapterLines\(g\)/g)].map(m => m[1]);
assert.equal(expressions.length, 4, 'runtime, animatic, chapter render and final must all be covered');
const consumers = expressions.map(expr => new Function('chapterEvidenceNote', 'cfg', 'id', 'g', 'assets', 'taskMode', 'recordAssets', `return ${expr};`));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-note-'));
const cfg = { repoRoot: root, sourceRoot: root, dataDir: path.join(root, 'data') }, id = 'fixture';
const project = path.join(cfg.dataDir, 'projects', id);
fs.mkdirSync(path.join(project, 'materials'), { recursive: true });
fs.mkdirSync(path.join(project, 'tasks'), { recursive: true });
fs.writeFileSync(path.join(project, 'project.json'), '{}');
const file = path.join(project, 'archive.bin');
fs.writeFileSync(file, 'retained archival bytes (non-image fixture; no render)');
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const g = { id: 'B07', total: 3, shots: [{ shotId: 'B07', at: 0, dur: 3 }] }, assets = { archive: file };
const binding = { file, url: 'https://example.org/archive', credit: 'Archive', sha256: hash() };
const write = (value) => fs.writeFileSync(path.join(project, 'materials/bindings.json'), JSON.stringify({ shots: value }));
const run = (mode = 'stills', input = assets) => consumers.map(fn => fn(C.chapterEvidenceNote, cfg, id, g, input, mode, () => input));
try {
  test('actual four note consumers do not mark byte-bound real archives as illustrations', () => {
    write({ B07: binding });
    for (const mode of ['stills', 'motion']) assert.deepEqual(run(mode), ['', '', '', '']);
  });
  test('generated assets remain labelled, including falsely declared real bindings', () => {
    write({ B07: { ...binding, generated: true } });
    assert.deepEqual(run(), Array(4).fill('示意'));
    write({ B07: { ...binding, source: 'generated' } });
    assert.deepEqual(run(), Array(4).fill('示意'));
  });
  test('unknown, wrong-beat, missing and changed provenance cannot become factual', () => {
    for (const shots of [{}, { B08: binding }, { B07: { file, sha256: hash() } }, { B07: { ...binding, sha256: '0'.repeat(64) } }, { B07: { ...binding, source: 'unknown' } }]) {
      write(shots); assert.deepEqual(run(), Array(4).fill('來源未核實'));
    }
    write({ B07: binding }); fs.appendFileSync(file, ' changed');
    assert.deepEqual(run(), Array(4).fill('來源未核實'));
    fs.writeFileSync(file, 'retained archival bytes (non-image fixture; no render)');
  });
  test('existing pinned director asset provenance supports unpinned legacy material ledgers', () => {
    const { sha256, ...legacy } = binding; write({ B07: legacy });
    const answer = JSON.stringify({ beats: [{ beat: 'B07', directorIntent: { assets: [{ id: 'archive', source: 'real', use: 'evidence', file, sha256, provenance: binding.url }] } }] });
    fs.writeFileSync(path.join(project, 'tasks/filmdesign.answer.json'), answer);
    fs.writeFileSync(path.join(project, 'tasks/filmdesign.check.json'), JSON.stringify({ ok: true, answerHash: crypto.createHash('sha256').update(answer).digest('hex').slice(0, 16) }));
    assert.deepEqual(run(), ['', '', '', '']);
    fs.rmSync(path.join(project, 'tasks/filmdesign.check.json'));
    assert.deepEqual(run(), Array(4).fill('來源未核實'), 'stale/unaccepted design is not provenance');
  });
  test('legacy archival binding retains real status when its local retained source exists', () => {
    const { sha256, ...legacy } = binding;
    write({ B07: { ...legacy, source: file } });
    assert.deepEqual(run(), ['', '', '', '']);
    write({ B07: { ...legacy, source: path.join(project, 'missing-source') } });
    assert.deepEqual(run(), Array(4).fill('來源未核實'));
  });
  test('mixed image inputs disclose illustration/unknown without relabelling all as fact', () => {
    const generated = path.join(project, 'generated.bin'); fs.writeFileSync(generated, 'generated fixture');
    write({ B07: binding, 'B07~art': { file: generated, generated: true } });
    assert.deepEqual(run('stills', { ...assets, art: generated }), Array(4).fill('含示意'));
    assert.deepEqual(run('stills', { ...assets, other: path.join(project, 'missing.bin') }), Array(4).fill('來源未核實'));
    write({}); assert.deepEqual(run('stills', {}), Array(4).fill('示意'), 'code-only diagrams keep illustration label');
  });
  test('note policy and provenance-dependent output participate in check/preview/preflight cache keys', () => {
    assert.match(C.checksHash.toString(), /chapterEvidenceNote/, 'a new note policy must invalidate old checks');
    const animatic = C.animaticChapter.toString();
    const hashStatement = animatic.slice(animatic.indexOf('const hash ='), animatic.indexOf('// (a white model per screen'));
    assert.match(hashStatement, /chapterEvidenceNote/, 'changed bindings must invalidate an old labelled animatic');
    const preflight = C.finalPreflight.toString();
    assert.match(preflight.slice(preflight.indexOf('const key ='), preflight.indexOf('const operationCheck =')), /chapterEvidenceNote/, 'preflight cannot reuse the previous disclosure');
  });
  test('morph overlay consumes the supplied note without inventing a default', () => {
    const morph = fs.readFileSync(new URL('../work/recipe-board-v1/style-lab/engine/templates/morph.js', import.meta.url), 'utf8');
    const draw = morph.slice(morph.lastIndexOf('  if (P.note)'), morph.lastIndexOf('\n}'));
    // Only the checked-in repository expression/block is compiled, never task or web input.
    const consume = new Function('P', 'g', draw);
    for (const note of ['', '示意', '含示意', '來源未核實']) {
      const drawn = [], g = { save() {}, restore() {}, fillText(text) { drawn.push(text); } };
      consume({ note }, g); assert.deepEqual(drawn, note ? [note] : []);
    }
  });
} finally {
  // node:test callbacks run after this module finishes evaluating.
  test.after(() => fs.rmSync(root, { recursive: true, force: true }));
}
