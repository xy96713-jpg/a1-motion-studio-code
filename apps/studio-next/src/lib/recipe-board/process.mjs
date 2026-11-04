// How well the process itself runs (CONVERGE-20261026 §1 stage 6; the user 2026-10-26: 客观说说 sop 怎么样最好): three
// numbers per film, and the line is getting better only when they fall film after film —
//   firstPass   the share of shots and chapter beats a blind review passed the first time it saw them (target 0.9)
//   rounds      how many times a shot or a beat was sent back on average, and the worst
//   userNotes   how many notes the user had to give on the film (each one a class of fault the line missed)
// Sources: the passages' review records (out/passages/<seg>/reviews.json: every verdict per version), the chapters'
// review log (out/film/process-log.jsonl, appended by chapter.mjs after each review; older films have none), the
// user's notes (out/film/user-notes.jsonl, `note`; the marks on /recipe-board/passages; routing/lesson-inbox.json) and
// the gates' approvals (gates.mjs). Written to out/film/process.json by run and by film.
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths, loadProject } from './store.mjs';

export const TARGET_FIRST_PASS = 0.9;
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const readLines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const filmDir = (cfg, id) => path.join(projectPaths(cfg, id).root, 'out', 'film');
export const logFile = (cfg, id) => path.join(filmDir(cfg, id), 'process-log.jsonl');
export const notesFile = (cfg, id) => path.join(filmDir(cfg, id), 'user-notes.jsonl');

export function logEvent(cfg, id, ev) {
  try { fs.mkdirSync(filmDir(cfg, id), { recursive: true }); fs.appendFileSync(logFile(cfg, id), JSON.stringify({ at: new Date().toISOString(), ...ev }) + '\n'); } catch { /* a sandbox without the folder */ }
}
// a note the user gave on the film, in their words (the session records each; it also becomes a lesson)
export function addUserNote(cfg, id, say, { about = null } = {}) {
  if (String(say || '').trim().length < 2) throw new Error('a note says what the user said');
  fs.mkdirSync(filmDir(cfg, id), { recursive: true });
  const n = { at: new Date().toISOString(), say: String(say).trim(), about };
  fs.appendFileSync(notesFile(cfg, id), JSON.stringify(n) + '\n');
  return n;
}

// (pure, tested) the stills: per shot, its reviewers' verdicts in time order (the code's and the user's are not a review)
export function stillRounds(records, since = null) {
  const byShot = {};
  for (const [seg, rows] of Object.entries(records)) for (const v of Object.values(rows || {})) {
    if (!v?.shot || ['code', 'user'].includes(v.by) || v.carried || !['pass', 'fix'].includes(v.verdict) || (since && String(v.at || '') < since)) continue;
    (byShot[`${seg}/${v.shot}`] ||= []).push(v);
  }
  return Object.entries(byShot).map(([k, vs]) => { vs.sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))); return { id: k, first: vs[0].verdict === 'pass', fixes: vs.filter((v) => v.verdict === 'fix').length }; });
}
// (pure, tested) the chapter beats: per beat, its review scores in time order from the log
export function beatRounds(events, pass = 4, since = null) {
  const byBeat = {};
  for (const e of events) if (e.type === 'chapter-review' && e.beat && !(since && String(e.at || '') < since)) (byBeat[`${e.chapter}/${e.beat}`] ||= []).push(e);
  return Object.entries(byBeat).map(([k, es]) => ({ id: k, first: (es[0].score ?? 0) >= pass, fixes: es.filter((e) => (e.score ?? 0) < pass).length }));
}
// (pure, tested) controlled same-task trials. Technical checks are deliberately
// absent: these rows measure blind visual verdicts and rework per frozen input.
export function directorTrials(events, pass = 4) {
  const groups = new Map();
  for (const e of events) {
    if (e.type !== 'chapter-review' || !e.inputHash || !e.answerHash || !e.beat) continue;
    const key = JSON.stringify([e.chapter, e.beat, e.inputHash, e.actor || null, e.agent || null, e.effort || null]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups.values()].map((rows) => {
    rows.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    const first = rows[0], last = rows.at(-1);
    return { chapter: first.chapter, beat: first.beat, inputHash: first.inputHash, actor: first.actor || null,
      agent: first.agent || null, effort: first.effort || null, firstPass: (first.score ?? 0) >= pass,
      fixes: rows.filter((e) => (e.score ?? 0) < pass).length, versions: new Set(rows.map((e) => e.answerHash)).size,
      finalScore: last.score ?? null, startedAt: first.at || null, endedAt: last.at || null };
  }).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}

// (pure, tested) the three numbers from the rounds and the notes
export function measures(stills, beats, userNotes) {
  const part = (rows) => rows.length ? { n: rows.length, firstPass: +(rows.filter((r) => r.first).length / rows.length).toFixed(3), rounds: +(rows.reduce((a, r) => a + r.fixes, 0) / rows.length).toFixed(2), worst: rows.reduce((a, r) => (r.fixes > a.fixes ? r : a), { fixes: 0, id: null }) } : null;
  const all = [...stills, ...beats];
  return { stills: part(stills), beats: part(beats), firstPass: all.length ? +(all.filter((r) => r.first).length / all.length).toFixed(3) : null, target: TARGET_FIRST_PASS, rounds: all.length ? +(all.reduce((a, r) => a + r.fixes, 0) / all.length).toFixed(2) : null, userNotes };
}

// since: only the reviews from that time (an ISO date), to compare a stretch of work with another
export function processMetrics(cfg, id, { write = true, since = null } = {}) {
  const root = projectPaths(cfg, id).root, p = loadProject(cfg, id) || {};
  const records = Object.fromEntries((p.passages || []).map((g) => [g.seg, readJson(path.join(root, 'out', 'passages', g.seg, 'reviews.json'), {})]));
  const marks = (p.passages || []).flatMap((g) => Object.entries(readJson(path.join(root, 'out', 'passages', g.seg, 'user-marks.json'), {})).filter(([k, m]) => !k.startsWith('_') && m?.verdict === 'bad'));
  const inbox = (readJson(path.join(cfg.dataDir, 'routing', 'lesson-inbox.json'), { notes: [] }).notes || []).filter((n) => n.project === id);
  const notes = readLines(notesFile(cfg, id));
  const userNotes = { total: notes.length + Math.max(marks.length, inbox.length), said: notes.length, marked: Math.max(marks.length, inbox.length) };
  const events = readLines(logFile(cfg, id));
  const m = { contract: 'A1RecipeBoardProcess/v1', project: id, at: new Date().toISOString(), since, ...measures(stillRounds(records, since), beatRounds(events, 4, since), userNotes),
    directorTrials: directorTrials(events.filter((e) => !since || String(e.at || '') >= since)),
    gates: Object.fromEntries(['look', 'rough', 'final'].map((g) => [g, p[g]?.approved ? p[g].at : null])) };
  if (write) { fs.mkdirSync(filmDir(cfg, id), { recursive: true }); fs.writeFileSync(path.join(filmDir(cfg, id), 'process.json'), JSON.stringify(m, null, 1) + '\n'); }
  return m;
}
// one line for the run's report
export function processLine(m) {
  const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
  return `process: first-pass ${pct(m.firstPass)} (target ${pct(m.target)}; stills ${m.stills ? `${pct(m.stills.firstPass)} of ${m.stills.n}` : '–'}, chapter beats ${m.beats ? `${pct(m.beats.firstPass)} of ${m.beats.n}` : '–'}) · ${m.rounds ?? '–'} fixes a piece · ${m.userNotes.total} user notes`;
}
