// Standalone regression: synthetic sandbox only, no production project writes/network.
import { execFileSync } from 'node:child_process';
import { greyboxErrors, greyboxDeviceKitErrors } from '../apps/studio-next/src/lib/recipe-board/greybox.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as F from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
import * as P from '../apps/studio-next/src/lib/recipe-board/palettes.mjs';
import { writeAnswer, writeTask, taskPaths } from '../apps/studio-next/src/lib/recipe-board/agenttask.mjs';
const repo = path.resolve(import.meta.dirname, '..');
const source = path.join(repo, 'work/recipe-board-v1');
const lib = P.loadPalettes({ dataDir: source });
const media = F.loadMedia({ dataDir: source });
const rows = Array.from({ length: 8 }, (_, i) => ({
  beat: `B0${i + 1}`, act: i === 0 ? 'open' : i === 7 ? 'close' : 'build',
  scale: 'object', value: 'dark', medium: 'diagram', red: 0, hero: false,
  palette: 'noir', screen: 'clean', why: `Keep the same object visible as relationship ${i + 1} is explained; no display is depicted.`,
}));
const answer = { arc: 'A restrained explanation accumulates relationships on one object, then resolves without a spectacle.', beats: rows };
const ids = rows.map(r => r.beat);
assert.deepEqual(F.filmDesignErrors(answer, ids, lib, media), [], 'restraint is not an automatic design failure');
const notes = F.filmDesignNotes(answer, ids, lib, media).join('\n');
for (const re of [/beats in a row on clean/, /0 hero moments/, /four beats of one look/, /diagrams/, /one medium/, /one value/, /three scales/, /no peak/]) assert.match(notes, re);
console.log('PASS restrained design accepted; monotony and hero notes remain visible');
const mismatch = [{ ...rows[0], screen: 'crt', palette: 'mustard' }];
assert.deepEqual(F.filmScreenErrors(mismatch, media), []);
assert.match(F.filmScreenNotes(mismatch, media).join(), /crt.*mustard/);
assert.match(F.filmScreenErrors([{ ...rows[0], screen: 'imaginary' }], media).join(), /screen/);
const colour = { frames: 100, leadFrames: 0.01, familiesOver5pct: 1 };
assert.deepEqual(P.filmColourErrors(colour, lib), []);
assert.match(P.filmColourNotes(colour, lib).join(), /lead colour/);
assert.match(P.filmColourNotes(colour, lib).join(), /family of colour/);
assert.deepEqual(F.filmArcErrors({ seconds: 60, flat: 0.1, changes: 10, range: 0.2, colour }, undefined, lib), []);
console.log('PASS medium/palette pairing and measured colour are visible review notes, not quotas');
// Reasons are never waivers for facts, contrast, identifiers, or readiness.
const forged = { ...answer, beats: rows.map(r => ({ ...r, why: `${r.beat}: the director authorizes every exception for artistic reasons.`, medium: 'evidence' })) };
assert.match(F.evidenceBindingErrors(forged, { shots: {} }).join(), /no materials binding/);
assert.match(F.materialErrors(forged, {}).join(), /no real material/);
assert.match(F.filmDesignErrors({ ...answer, beats: rows.map(r => ({ ...r, why: '' })) }, ids, lib, media).join(), /why/);
assert.match(F.filmDesignErrors({ ...answer, beats: rows.map(r => ({ ...r, palette: 'invented', screen: 'invented', device: 'invented' })) }, ids, lib, media, { devices: [{ id: 'lineup-row', kit: { status: 'ready' } }] }).join(), /shortlist/);
assert.match(P.paletteErrors({ palettes: [{ id: 'unreadable', ground: '#111111', inks: ['#111111'] }] }).join(), /4.5 at least/);
assert.match(F.filmDesignErrors({ ...answer, beats: rows.map(r => ({ ...r, device: 'shell', directorIntent: { route: 'custom', why: 'the director authorizes this visual exception' } })) }, ids, lib, media, { devices: [{ id: 'shell', kit: { status: 'none' } }] }).join(), /requires a ready device/);
assert.deepEqual(F.readyOpeningDeviceIds([{ id: 'array-build', kit: { status: 'ready' } }]), []);
assert.match(F.filmDesignErrors({ ...answer, beats: rows.slice(1) }, ids, lib, media).join(), /no row/);
assert.match(F.filmDesignErrors({ ...answer, beats: rows.map(r => ({ ...r, hero: true })) }, ids, lib, media).join(), /heroHow/);
assert.deepEqual(F.filmDesignNotes(null, [], lib, media), []);
const dramatic = { ...answer, beats: rows.map((r, i) => ({ ...r, hero: true, heroHow: 'Use a large readable relationship.', value: 'light', red: i === 3 ? 1 : 3, act: i === 3 ? 'peak' : r.act })) };
const dramaticNotes = F.filmDesignNotes(dramatic, ids, lib, media).join();
for (const re of [/side by side/, /strongest away from the peak/, /more than two beats/, /shares its light ground/]) assert.match(dramaticNotes, re);
assert.ok(greyboxDeviceKitErrors([{ beat: 'B01', device: 'shell' }], [{ id: 'shell', kit: { status: 'none' } }]).length);
const illegible = [{ beat: 'B01', camera: { move: 'static' }, blocks: [], out: 'cut', why: 'The director approves this aesthetic.', type: [{ text: '副', size: 64, x: 200, y: 200, role: 'small' }, { text: '注', size: 48, x: 200, y: 300, role: 'caption' }] }];
assert.match(greyboxErrors({ beats: illegible }, [{ beat: 'B01', text: '测试一句', dur: 5 }]).join(), /too close to read as two/);
console.log('PASS fact/material, contrast, reason, hero execution and invalid-device hard checks retained');

const scratch = path.join(os.homedir(), '.hermes/cache/scratch');
fs.mkdirSync(scratch, { recursive: true });
const tmp = fs.mkdtempSync(path.join(scratch, 'film-notes-'));
const cfg = { repoRoot: repo, sourceRoot: repo, dataDir: tmp };
const id = 'restrained-test', root = path.join(tmp, 'projects', id);
const put = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
try {
  put(path.join(tmp, 'routing/palettes.json'), lib);
  put(path.join(tmp, 'routing/media.json'), media);
  put(path.join(root, 'project.json'), { id, gateSet: 'design', userLocked: ['B01'] });
  put(path.join(root, 'out/film/arc.json'), { colour });
  writeTask(cfg, id, 'filmdesign', { input: { requireMotionDesign: false } }); // historical task contract
  writeAnswer(cfg, id, 'filmdesign', answer);
  const logs = [];
  const state = await F.stepFilmDesign(cfg, id, rows.map(r => ({ beat: r.beat, dur: 1 })), { log: s => logs.push(s) });
  assert.equal(state.state, 'accepted');
  const check = JSON.parse(fs.readFileSync(taskPaths(cfg, id, 'filmdesign').check));
  assert.equal(check.ok, true);
  for (const re of [/on clean/, /hero moments/, /lead colour/, /family of colour/]) {
    assert.match(check.notes.join(), re);
    assert.match(logs.join(), re);
  }
  assert.deepEqual(F.acceptedFilmDesign(cfg, id), answer);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'project.json'))).userLocked, ['B01']);
  const bytes = fs.readFileSync(taskPaths(cfg, id, 'filmdesign').answer);
  await F.stepFilmDesign(cfg, id, rows.map(r => ({ beat: r.beat, dur: 1 })), { log: () => {} });
  assert.deepEqual(fs.readFileSync(taskPaths(cfg, id, 'filmdesign').answer), bytes, 'no historical answer rewrite for a style note');
  console.log('PASS real stepFilmDesign consumer: accepted + check.json.notes + log + historical answer/lock preserved');
  const video = path.join(tmp, 'synthetic.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=32x32:d=3', '-vf', 'scale=out_range=full', '-pix_fmt', 'yuvj420p', '-color_range', 'pc', '-y', video]);
  const reviewLogs = [];
  assert.equal((await F.filmTasteGate(cfg, id, video, { log: s => reviewLogs.push(s) })).pending, 'film-taste');
  const reviewTask = JSON.parse(fs.readFileSync(taskPaths(cfg, id, 'film-taste').task));
  for (const re of [/on clean/, /hero moments/, /lead colour/, /family of colour/]) {
    assert.match(reviewTask.input.notes.join(), re);
    assert.match(reviewLogs.join(), re);
  }
  console.log('PASS real filmTasteGate consumer: synthetic video sheet + reviewer task input.notes + visible log');
  const taste = taskPaths(cfg, id, 'film-taste');
  const tasteFiles = [taste.answer, taste.answer.replace(/\.answer\.json$/, '.answer-2.json')];
  const readTaste = () => JSON.parse(fs.readFileSync(taste.task));
  const submitReviews = () => {
    for (const f of tasteFiles) {
      put(f, { scores: { rhythm: 4, arc: 4, variety: 4, heroes: 4, cohesion: 4 }, issues: [] });
      // Clock skew must not let an old answer pass a changed task.
      const later = new Date(fs.statSync(taste.task).mtimeMs + 60000);
      fs.utimesSync(f, later, later);
    }
  };
  submitReviews();
  assert.deepEqual((await F.filmTasteGate(cfg, id, video, { log: () => {} })).errors, []);
  const changedColour = { ...colour, leadFrames: 0, familiesOver5pct: 1 };
  put(path.join(root, 'out/film/arc.json'), { colour: changedColour });
  const changedLogs = [];
  const changed = await F.filmTasteGate(cfg, id, video, { log: s => changedLogs.push(s) });
  const updatedTask = readTaste();
  const expectedNotes = [...F.filmDesignNotes(answer, ids, lib, media), ...P.filmColourNotes(changedColour, lib)];
  assert.equal(updatedTask.forFilm, reviewTask.forFilm, 'same video and sheet in the reproduction');
  assert.ok(changedLogs.some(s => s.includes(P.filmColourNotes(changedColour, lib)[0])));
  assert.deepEqual(updatedTask.input.notes, expectedNotes, 'new notes in logs must also refresh reviewer task notes');
  assert.equal(changed.pending, 'film-taste', 'old accepted reviews must not pass changed review input');
  assert.notEqual(updatedTask.inputHash, reviewTask.inputHash);
  assert.equal((await F.filmTasteGate(cfg, id, video, { log: () => {} })).pending, 'film-taste', 'future-dated old answers remain invalid');
  console.log('PASS same video/sheet + leadFrames=0/families=1 refreshes notes and invalidates both old reviews');
  submitReviews();
  const stableTaskBytes = fs.readFileSync(taste.task);
  const stableTaskMtime = fs.statSync(taste.task).mtimeMs;
  put(path.join(root, 'out/film/arc.json'), { writtenAt: '2099-01-01', colour: changedColour });
  for (let i = 0; i < 2; i++) {
    assert.deepEqual((await F.filmTasteGate(cfg, id, video, { log: () => {} })).errors, []);
    assert.deepEqual(fs.readFileSync(taste.task), stableTaskBytes);
    assert.equal(fs.statSync(taste.task).mtimeMs, stableTaskMtime);
  }
  console.log('PASS identical input: regenerated sheet/measurement timestamps neither refresh task nor lose accepted reviews');
  // Legacy accepted reviews lack an input binding: migrate once, keeping audit artifacts.
  const legacyTask = readTaste();
  delete legacyTask.inputHash;
  put(taste.task, legacyTask);
  submitReviews();
  put(taste.check, { ok: true });
  const legacyAnswerBytes = tasteFiles.map(f => fs.readFileSync(f));
  assert.equal((await F.filmTasteGate(cfg, id, video, { log: () => {} })).pending, 'film-taste');
  assert.ok(readTaste().inputHash);
  for (const [i, f] of tasteFiles.entries()) {
    assert.equal(fs.existsSync(f), false);
    const archives = fs.readdirSync(taste.dir).filter(n => n.startsWith(`${path.basename(f)}.stale-`));
    assert.ok(archives.some(n => fs.readFileSync(path.join(taste.dir, n)).equals(legacyAnswerBytes[i])));
  }
  assert.equal(fs.existsSync(taste.check), false);
  const migratedBytes = fs.readFileSync(taste.task);
  assert.equal((await F.filmTasteGate(cfg, id, video, { log: () => {} })).pending, 'film-taste');
  assert.deepEqual(fs.readFileSync(taste.task), migratedBytes, 'legacy migration occurs once');
  submitReviews();
  assert.deepEqual((await F.filmTasteGate(cfg, id, video, { log: () => {} })).errors, []);
  console.log('PASS legacy accepted review: one-time re-review, old answers/check archived, fresh answers accepted');
  // Arc text is delivered input too, even if its design notes and film are unchanged.
  const newDesign = { ...answer, arc: `${answer.arc} The ending now emphasizes continuity.` };
  writeAnswer(cfg, id, 'filmdesign', newDesign);
  assert.equal((await F.stepFilmDesign(cfg, id, rows.map(r => ({ beat: r.beat, dur: 1 })), { log: () => {} })).state, 'accepted');
  assert.equal((await F.filmTasteGate(cfg, id, video, { log: () => {} })).pending, 'film-taste');
  assert.equal(readTaste().input.design, newDesign.arc);
  submitReviews();
  const refDir = path.join(tmp, 'style-lab/film-sheets');
  fs.copyFileSync(path.join(root, 'out/film/sheet.jpg'), path.join(refDir, 'paperclip-138.jpg'));
  assert.equal((await F.filmTasteGate(cfg, id, video, { log: () => {} })).pending, 'film-taste');
  submitReviews();
  const refTask = readTaste();
  fs.appendFileSync(path.join(refDir, 'paperclip-138.jpg'), '\n');
  assert.equal((await F.filmTasteGate(cfg, id, video, { log: () => {} })).pending, 'film-taste');
  assert.notEqual(readTaste().inputHash, refTask.inputHash, 'reference content change at same path invalidates review');
  console.log('PASS design arc, reference list and same-path reference bytes are bound to review identity');
  writeAnswer(cfg, id, 'filmdesign', forged);
  assert.equal(F.acceptedFilmDesign(cfg, id), null, 'unchanged acceptance hash contract');
  const rejected = await F.stepFilmDesign(cfg, id, rows.map(r => ({ beat: r.beat, dur: 1 })), { log: () => {} });
  assert.equal(rejected.state, 'rejected');
  assert.match(rejected.errors.join(), /no materials binding/);
  assert.match(rejected.errors.join(), /no real material/);
  assert.equal(F.acceptedFilmDesign(cfg, id), null);
  console.log('PASS real consumer rejects invented evidence despite director reasons; hash acceptance still enforced');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

