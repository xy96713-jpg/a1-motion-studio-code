// The user's own marks on the shots of a passage (user, 2026-10-22: 你的意见变成数据 — 快速评审页): watching a passage beside
// the reference on /recipe-board/passages, a shot is marked good or not, with a line of why. A mark is bound to the
// shot as it was seen (its hash): a "bad" on the current picture holds the shot like a failed review (layers.mjs
// stillReview: owner the director unless the note says otherwise), and every note is kept in the lessons inbox
// (routing/lesson-inbox.json) for the session to turn into a lesson with its check (routing/lessons.json).
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths, loadProject } from './store.mjs';

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const marksFile = (cfg, id, seg) => path.join(projectPaths(cfg, id).root, 'out', 'passages', seg, 'user-marks.json');
const inboxFile = (cfg) => path.join(cfg.dataDir, 'routing', 'lesson-inbox.json');

export const readMarks = (cfg, id, seg) => readJson(marksFile(cfg, id, seg), {});
// (pure, tested) the mark checked: a known shot, good or bad, a bad one says why
export function markErrors(m, shots) {
  const err = [];
  if (!shots.some((s) => s.id === m.shot)) err.push(`no shot ${m.shot}`);
  if (!['good', 'bad'].includes(m.verdict)) err.push('verdict is good or bad');
  if (m.verdict === 'bad' && String(m.note || '').trim().length < 2) err.push('say in a few words what is wrong');
  return err;
}
export function writeMark(cfg, id, seg, m, shots) {
  const err = markErrors(m, shots); if (err.length) throw new Error(err.join('; '));
  const all = readMarks(cfg, id, seg), sh = shots.find((s) => s.id === m.shot);
  all[m.shot] = { shot: m.shot, hash: sh.hash, verdict: m.verdict, note: String(m.note || '').trim(), at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(marksFile(cfg, id, seg)), { recursive: true }); fs.writeFileSync(marksFile(cfg, id, seg), JSON.stringify(all, null, 1) + '\n');
  if (m.verdict === 'bad') { const box = readJson(inboxFile(cfg), { contract: 'A1RecipeBoardLessonInbox/v1', notes: [] });
    box.notes.push({ project: id, seg, shot: m.shot, hash: sh.hash, module: sh.module, note: all[m.shot].note, at: all[m.shot].at, lesson: null });
    fs.writeFileSync(inboxFile(cfg), JSON.stringify(box, null, 1) + '\n'); }
  return all[m.shot];
}
// (pure, tested) the marks that hold shots now: a bad mark on the picture the shot still shows
export const holding = (marks, shots) => shots.filter((s) => marks[s.id]?.verdict === 'bad' && marks[s.id].hash === s.hash).map((s) => ({ shot: s.id, note: marks[s.id].note }));

// The rough cut first (user, 2026-10-22: 最好是快速的粗稿没关系 确定了再精细渲染): the white model (12 fps, half size, the
// voice) is the rough cut; the fine render (60 fps, blur, full size) waits until the user has confirmed the rough cut
// of the passage as it is now. The confirmation is bound to every shot's hash: a shot changed after it asks again.
export const roughKey = (shots) => shots.map((s) => `${s.id}:${s.hash}`).join('|');
// (pure, tested) may the passage be rendered fine: confirmed on these shots, and no shot the user marked bad
export function fineGate(marks, shots) {
  const held = holding(marks, shots);
  if (held.length) return { ok: false, why: `the user marked ${held.map((h) => h.shot).join(', ')} bad` };
  if (!marks._rough) return { ok: false, why: 'the rough cut waits for the user (/recipe-board/passages: 粗稿可以，精细渲染)' };
  if (marks._rough.key !== roughKey(shots)) return { ok: false, why: 'shots changed since the user confirmed the rough cut; it waits for them again' };
  return { ok: true, why: `confirmed by the user ${marks._rough.at}` };
}
export function confirmRough(cfg, id, seg, shots) {
  const all = readMarks(cfg, id, seg), held = holding(all, shots);
  if (held.length) throw new Error(`shots marked bad still: ${held.map((h) => h.shot).join(', ')}`);
  all._rough = { key: roughKey(shots), at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(marksFile(cfg, id, seg)), { recursive: true }); fs.writeFileSync(marksFile(cfg, id, seg), JSON.stringify(all, null, 1) + '\n');
  return all._rough;
}

// everything the page shows: each passage with its films and its shots (time, module, the line's review, the user's mark)
export async function passagesOverview(cfg, id) {
  const { passageShots } = await import('./layers.mjs');
  const root = projectPaths(cfg, id).root, reviews = (seg) => readJson(path.join(root, 'out', 'passages', seg, 'reviews.json'), {});
  return (loadProject(cfg, id).passages || []).map((g) => {
    const out = path.join(root, 'out', 'passages', g.seg), shots = passageShots(cfg, id, g.seg), rv = reviews(g.seg), marks = readMarks(cfg, id, g.seg);
    return { seg: g.seg, range: g.range, fine: fineGate(marks, shots).ok, films: { beside: fs.existsSync(path.join(out, `${g.seg}-vs-reference.mp4`)), white: fs.existsSync(path.join(out, `${g.seg}-animatic-vs-reference.mp4`)) },
      shots: shots.map((s) => ({ id: s.id, hash: s.hash, module: s.spec.module, at: s.spec.at, end: s.spec.end, line: rv[s.hash]?.verdict || null, mark: marks[s.id] && marks[s.id].hash === s.hash ? marks[s.id] : null, stale: !!(marks[s.id] && marks[s.id].hash !== s.hash) })) };
  });
}
export const passageFilm = (cfg, id, seg, kind) => path.join(projectPaths(cfg, id).root, 'out', 'passages', seg, kind === 'white' ? `${seg}-animatic-vs-reference.mp4` : `${seg}-vs-reference.mp4`);
