// The road to 4 and the arbiter (retrospective 2026-10-28, RETRO-20261028.md 1 and 2; the user: 按复盘先做第 1、2、4 条).
// Suez B02 and B06 stood at 3 for six reviews: each fresh reviewer named a new fault after the last was fixed, and two
// reviews (the chapter's and its style's) asked for opposite things, so the director waived its own work.
// Now a review that leaves a beat under 4 says what gets it to 4: at most three things (toFour). That list is the beat's
// until it passes: the next review checks those items and only those (checked), and may add only a new hard fault (hard:
// the review's hard conditions). Every item done and no new hard fault is 4, whatever else the reviewer would like; a new
// fault that is not hard is a note, never a lower score. A list that stood two reviews with nothing on it done, or four
// reviews in all, goes to the arbiter (a fresh reviewer who sees the beat, its list and both reviews' words: prompts/
// arbiter.md): it passes the beat or rewrites the list, binding, and a ruling between two reviews that disagree becomes a
// rule every reviewer reads (routing/lessons.json from 'arbiter'). The director no longer waives; it may appeal.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { voidFix } from './reviewrules.mjs';

export const LIST_MAX = 3, LIST_STUCK = 2, LIST_ROUNDS = 4;
const clean = (xs) => [...new Set((xs || []).map((x) => String(x || '').trim()).filter(Boolean))];

// (pure, tested) one beat's review read against the list it was asked about. list: { items, rounds, stuck } or null;
// f: { score, issue, toFour, checked: [{ item (1-based), done, why }], hard }. Returns the beat's score, its list for the
// next review (null once it passed) and the notes (faults the reviewer named beyond the list: kept, not scored)
export function settleBeat(list, f, pass = 4, { newLists = true } = {}) {
  const score = f?.score ?? 0;
  if (!list?.items?.length) {
    if (score >= pass) return { score, list: null, notes: [] };
    // a gate that passed opens no new list: what the reviewer would like is a note (closeGate below)
    if (!newLists) return { score, list: null, notes: clean(f.toFour?.length ? f.toFour : [f.issue]) };
    const items = clean(f.toFour?.length ? f.toFour : [f.issue]).slice(0, LIST_MAX);
    return { score, list: { items, rounds: 0, stuck: 0 }, notes: [] };
  }
  const done = (i) => (f.checked || []).some((c) => +c.item === i + 1 && c.done === true);
  const open = list.items.filter((_, i) => !done(i)), hard = clean(f.hard);
  const notes = clean(f.toFour).filter((x) => !list.items.includes(x) && !hard.includes(x));
  if (!open.length && !hard.length) return { score: Math.max(score, pass), list: null, notes, settled: true };
  if (score >= pass) return { score, list: null, notes };   // the reviewer passes it with an item open: its call
  const items = clean([...open, ...hard]).slice(0, LIST_MAX), nothing = open.length === list.items.length && !hard.length;
  // the reviewers' own score stands (an open list keeps a beat from rising to 4, never lowers it: two reviewers at 3 and
  // 4 are 3.5, and capping it at 3 sank Suez B02's taste mean from 3.5 to 3.39, 2026-10-28)
  return { score, list: { items, rounds: (list.rounds || 0) + 1, stuck: nothing ? (list.stuck || 0) + 1 : 0, ...(list.byArbiter ? { byArbiter: list.byArbiter } : {}) }, notes };
}
// (pure, tested) two blind reviewers' answers on one beat read as one: the first round's lists interleaved (each
// reviewer's first item first) up to three; an item is done when every reviewer says so (one says done, the other not:
// it stays open, and a list that sticks on it goes to the arbiter); hard faults of either
export function mergeBeat(rows) {
  const got = rows.filter(Boolean);
  if (got.length < 2) return got[0] || null;
  const toFour = [], n = Math.max(...got.map((r) => (r.toFour || []).length));
  for (let i = 0; i < n; i++) for (const r of got) if (r.toFour?.[i]) toFour.push(r.toFour[i]);
  const items = new Set(got.flatMap((r) => (r.checked || []).map((c) => +c.item)));
  const checked = [...items].map((item) => ({ item, done: got.every((r) => (r.checked || []).some((c) => +c.item === item && c.done === true)), why: got.map((r) => (r.checked || []).find((c) => +c.item === item)?.why).filter(Boolean).join(' / ') }));
  return { toFour: clean(toFour), checked, hard: clean(got.flatMap((r) => r.hard || [])) };
}
// (pure, tested) the beats whose list goes to the arbiter: nothing on it done two reviews running, four reviews in all,
// or appealed by the director (appeals: { B02: why }; at once: a list that asks against another review's pass need not
// cost a round first). A list the arbiter already set is not sent back to it: the arbiter rules a beat once a gate (Suez
// B10 went to it three times, 2026-10-28); the gate's own measure decides from there
export function arbiterDue(lists, appeals = {}) {
  return Object.entries(lists || {}).filter(([b, L]) => L?.items?.length && (appeals[b] || (!L.byArbiter && ((L.stuck || 0) >= LIST_STUCK || (L.rounds || 0) >= LIST_ROUNDS)))).map(([b]) => b);
}
// (pure, tested) what the next reviewer reads about a beat's list
export function listNote(lists, { passed = false } = {}) {
  const rows = Object.entries(lists || {}).filter(([, L]) => L?.items?.length);
  if (passed) return '\n\n這一關上一版已經過線：這一輪只看這一版有沒有比上一版差、有沒有犯硬條件；不再開到 4 分的清單（toFour 只當備註）。';
  if (!rows.length) return '';
  return `\n\n到 4 分的清单（上一轮${rows.some(([, L]) => L.byArbiter) ? '或仲裁' : ''}定的，这几拍这一轮只查这几条）：\n${rows.map(([b, L]) => `- ${b}：${L.items.map((x, i) => `${i + 1}. ${x}`).join(' ')}`).join('\n')}\n每拍在 checked 里逐条答（item 是序号，done 是做到没有，why 写看到了什么）；全做到了、也没有新的硬伤（hard，只写扣分硬条件里的），这一拍就是 4 分。清单外看到的别的小毛病写进 toFour 当备注，不扣分。`;
}

// ---------------------------------------------------------------- the lists, kept beside the review's task
export const listsFile = (taskFile) => taskFile.replace(/\.task\.json$/, '.lists.json');
export const readLists = (taskFile) => { try { return JSON.parse(fs.readFileSync(listsFile(taskFile), 'utf8')).beats || {}; } catch { return {}; } };
export function writeLists(taskFile, beats) {
  const live = Object.fromEntries(Object.entries(beats).filter(([, L]) => L?.items?.length));
  fs.mkdirSync(path.dirname(taskFile), { recursive: true });
  fs.writeFileSync(listsFile(taskFile), JSON.stringify({ contract: 'A1ReviewLists/v1', at: new Date().toISOString(), beats: live }, null, 1) + '\n');
}
// a review's frames settled against the lists its task asked about (task.lists: the lists as they were when it was
// written, so reading the same answer again settles the same way); the next lists are written beside it
export function settleFrames(taskFile, asked, frames, pass = 4, lessons = null, { newLists = true } = {}) {
  const lists = { ...readLists(taskFile) }, notes = {};
  for (const f of frames) {
    // a thing to do that asks against the user's or the arbiter's rules is struck before it joins a list (reviewrules voidFix)
    if (lessons && f.toFour?.length) f.toFour = f.toFour.filter((x) => !voidFix({ say: x, fix: x }, lessons).void);
    const s = settleBeat(asked?.[f.beat] || null, f, pass, { newLists });
    if (s.settled) f.listDone = true;
    f.score = s.score; lists[f.beat] = s.list; if (s.notes.length) notes[f.beat] = s.notes;
    if (s.list && f.score < pass) f.issue = `到 4 分还差：${s.list.items.map((x, i) => `${i + 1}. ${x}`).join(' ')}`;
  }
  writeLists(taskFile, lists);
  return { lists, notes };
}

// ---------------------------------------------------------------- the arbiter's passes, held by picture
// A beat the arbiter passed stays passed while its picture is the one it ruled on: the next fresh reviewer scored Suez B05
// 3 again for what the arbiter had called taste, 2026-10-28. (A reviewer who scores every beat of a chapter each round, as
// the taste review does, has no lock of its own; the chapter's review keeps its passes by its locks.)
export const passedFile = (taskFile) => taskFile.replace(/\.task\.json$/, '.passed.json');
export const readPassed = (taskFile) => { try { return JSON.parse(fs.readFileSync(passedFile(taskFile), 'utf8')).beats || {}; } catch { return {}; } };
export function recordPassed(taskFile, rulings, printOf) {
  const was = readPassed(taskFile), now = { ...was };
  for (const r of rulings || []) if (r.verdict === 'pass') { const p = printOf(r.beat); if (p) now[r.beat] = { print: p, why: r.why }; }
  fs.writeFileSync(passedFile(taskFile), JSON.stringify({ contract: 'A1ArbiterPasses/v1', beats: now }, null, 1) + '\n');
}
// (pure, tested) frames whose beat the arbiter passed on this same picture are held at the pass, their lists gone
export function holdPassed(frames, passed, printOf, same, pass = 4) {
  const held = [];
  for (const f of frames) { const p = passed[f.beat], now = p && printOf(f.beat); if (p && now && same(p.print, now)) { if (f.score < pass) held.push({ beat: f.beat, score: f.score, why: p.why }); f.score = Math.max(f.score, pass); f.toFour = []; f.held = p.why; } }
  return held;
}

// ---------------------------------------------------------------- answers already read
// An answer the line read (and the arbiter may have ruled on since) is not settled again when the next version is written:
// settling it again set Suez B07's list back after the arbiter had passed it, 2026-10-28
const readFile = (taskFile) => taskFile.replace(/\.task\.json$/, '.read.json');
export const answersKey = (files) => crypto.createHash('sha256').update(files.map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return '-'; } }).join('\u0000')).digest('hex').slice(0, 16);
export function markRead(taskFile, key) { try { fs.writeFileSync(readFile(taskFile), JSON.stringify({ key }) + '\n'); } catch {} }
export const wasRead = (taskFile, key) => { try { return JSON.parse(fs.readFileSync(readFile(taskFile), 'utf8')).key === key; } catch { return false; } };
// (pure, tested) the lists a new task asks about: a beat the arbiter passed on the picture it has now is asked about nothing
export const openLists = (lists, passed, printOf, same) => Object.fromEntries(Object.entries(lists || {}).filter(([b]) => !(passed[b] && printOf(b) && same(passed[b].print, printOf(b)))));

// ---------------------------------------------------------------- a gate passes once
// The user 2026-10-28 (是不是效率 流程太低效和不规范呢 客观觉得怎么做最好呢): Suez B02's taste gate passed in its second
// round (mean 4) and the director kept changing the module to finish the open lists — five more rounds, ten reviewers,
// three arbiters, the mean at 3.67-3.8 throughout. A gate passes once: its open lists close as notes for the next round
// of the system (<step>.notes.json, read into the lessons by hand, never a loop on this film), and the review of a later
// version asks only whether it got worse or broke a hard condition: a beat under 4 opens no new list (settleBeat
// newLists) and the arbiter is not called while the gate's measure passes.
const gateFile = (taskFile) => taskFile.replace(/\.task\.json$/, '.gate.json');
const notesFile = (taskFile) => taskFile.replace(/\.task\.json$/, '.notes.json');
export const gatePassed = (taskFile) => { try { return !!JSON.parse(fs.readFileSync(gateFile(taskFile), 'utf8')).passedAt; } catch { return false; } };
// (pure, tested) the open lists of a passed gate as notes: one row a beat, what was left and whether the arbiter set it
export const closedNotes = (lists) => Object.entries(lists || {}).filter(([, L]) => L?.items?.length).map(([beat, L]) => ({ beat, left: L.items, byArbiter: !!L.byArbiter, rounds: L.rounds || 0 }));
export function closeGate(taskFile, lists, mean) {
  const notes = closedNotes(lists);
  fs.writeFileSync(gateFile(taskFile), JSON.stringify({ contract: 'A1ReviewGate/v1', passedAt: gatePassed(taskFile) ? JSON.parse(fs.readFileSync(gateFile(taskFile), 'utf8')).passedAt : new Date().toISOString(), mean: +(+mean || 0).toFixed(2), at: new Date().toISOString() }, null, 1) + '\n');
  if (notes.length) { let was = []; try { was = JSON.parse(fs.readFileSync(notesFile(taskFile), 'utf8')).notes || []; } catch {} fs.writeFileSync(notesFile(taskFile), JSON.stringify({ contract: 'A1ReviewNotes/v1', notes: [...was, ...notes.map((n) => ({ ...n, at: new Date().toISOString() }))] }, null, 1) + '\n'); }
  writeLists(taskFile, {});
  return notes;
}
