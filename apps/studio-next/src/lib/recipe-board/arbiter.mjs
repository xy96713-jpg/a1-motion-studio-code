// The arbiter (reviewlist.mjs; RETRO-20261028.md 2): a beat whose road to 4 stuck, or that two reviews pull opposite ways,
// is ruled on by a fresh reviewer who wrote none of it and scored none of it: the session answers tasks/arbiter-<step>
// through a fresh subagent given only the task, prompts/arbiter.md and the schema, never itself. Its ruling is binding:
// 'pass' passes the beat (recorded, listed by run for the user to overturn), 'fix' replaces the beat's list with at most
// three things the director must do and the next review checks. A ruling between two reviews that disagree, or on what a
// review keeps asking that the house leaves open, is written as a rule every reviewer reads (routing/lessons.json, from
// 'arbiter', synced into the review prompts), so the same quarrel is not had again.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LIST_MAX } from './reviewlist.mjs';

export const ARBITER_RULES = 'work/recipe-board-v1/prompts/arbiter.md', ARBITER_SCHEMA = 'work/recipe-board-v1/routing/arbiter.schema.json';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const arbiterStep = (reviewStep) => `arbiter-${reviewStep}`;
// the director's appeal of a beat it holds the review is wrong about: tasks/<reviewStep>.appeal.json { beats: { B02: why } }
// An appeal is heard once: a ruled appeal is marked heard by its words and not sent again (Suez's stills: an appeal ruled
// on kept sending B01 back to the arbiter after the gate had passed, 2026-10-28); a new appeal is new words
const appealFile = (taskDir, reviewStep) => path.join(taskDir, `${reviewStep}.appeal.json`);
export const readAppeals = (taskDir, reviewStep) => { const a = readJson(appealFile(taskDir, reviewStep), {}) || {}, heard = a.heard || {}; return Object.fromEntries(Object.entries(a.beats || {}).filter(([b, why]) => heard[b] !== sha(String(why)))); };
export function markHeard(taskDir, reviewStep, beats) { const f = appealFile(taskDir, reviewStep), a = readJson(f, null); if (!a?.beats) return; a.heard ||= {}; for (const b of beats) if (a.beats[b]) a.heard[b] = sha(String(a.beats[b])); fs.writeFileSync(f, JSON.stringify(a, null, 2) + '\n'); }

// (pure, tested) a ruling checked: every beat asked about answered once, a verdict of pass or fix, a fix with one to three
// things to do, a reason of some length, a rule with words to say
export function rulingErrors(answer, beats) {
  const out = [], rows = answer?.rulings || [];
  for (const b of beats) { const n = rows.filter((r) => r.beat === b).length; if (n !== 1) out.push(`${b}: ${n ? 'ruled more than once' : 'not ruled'}`); }
  for (const r of rows) {
    if (!beats.includes(r.beat)) { out.push(`${r.beat}: not asked about`); continue; }
    if (!['pass', 'fix'].includes(r.verdict)) out.push(`${r.beat}: verdict is pass or fix`);
    if (String(r.why || '').trim().length < 12) out.push(`${r.beat}: say why in a sentence`);
    if (r.verdict === 'fix' && !((r.items || []).length >= 1 && r.items.length <= LIST_MAX)) out.push(`${r.beat}: a fix names one to ${LIST_MAX} things to do`);
    if (r.verdict === 'pass' && (r.items || []).length) out.push(`${r.beat}: a pass names nothing to do`);
    if (r.rule && String(r.rule.say || '').trim().length < 8) out.push(`${r.beat}: a rule says what every reviewer holds, in a sentence`);
    for (const k of ['complains', 'suggests']) if (r.rule?.[k]) { try { new RegExp(r.rule[k]); } catch { out.push(`${r.beat}: rule.${k} is not a pattern`); } }
  }
  return out;
}
// (pure, tested) the rulings applied to a review's frames and lists: a pass is 4 and its list gone, a fix is the new list
export function applyRulings(rulings, frames, lists, pass = 4) {
  const next = { ...lists };
  for (const r of rulings || []) {
    const f = frames.find((x) => x.beat === r.beat);
    if (r.verdict === 'pass') { next[r.beat] = null; if (f && f.score < pass) { f.arbitrated = { verdict: 'pass', why: r.why, score: f.score }; f.score = pass; } }
    else { next[r.beat] = { items: r.items.slice(0, LIST_MAX), rounds: 0, stuck: 0, byArbiter: r.why }; if (f) { f.arbitrated = { verdict: 'fix', why: r.why }; f.issue = `仲裁定的清单：${r.items.map((x, i) => `${i + 1}. ${x}`).join(' ')}`; } }
  }
  return next;
}
// (pure, tested) a ruling's rule as a lesson every reviewer reads (reviewrules.mjs userDecidedSection, its own heading)
export function rulingLesson(r, step, at = new Date().toISOString().slice(0, 10)) {
  if (!r?.rule?.say) return null;
  return { id: `ARB-${step}-${r.beat}-${sha(r.rule.say).slice(0, 6)}`, from: 'arbiter', said: `${at} 仲裁（${step} ${r.beat}；用户 2026-10-28 授权，可推翻）：${r.why}`, when: { always: true }, do: r.rule.say, check: 'arbiter.mjs; prompts/arbiter.md', review: { say: r.rule.say, complains: r.rule.complains || null, suggests: r.rule.suggests || null, keepIf: null } };
}
export function addLessons(cfg, lessons) {
  const f = path.join(cfg.dataDir, 'routing', 'lessons.json'), j = readJson(f, { lessons: [] }), have = new Set(j.lessons.map((l) => l.id));
  const add = lessons.filter((l) => l && !have.has(l.id));
  if (!add.length) return [];
  j.lessons.push(...add); fs.writeFileSync(f, JSON.stringify(j, null, 1) + '\n');
  return add.map((l) => l.id);
}

// the arbiter for a review step: its ruling when one stands for these beats and lists, else the task for it.
// what: { beats: [{ beat, text, list, history, words: { chapter, taste } }], images, forAnswer }
export async function arbitrate(cfg, id, reviewStep, what, { log = () => {} } = {}) {
  const { writeTask, readTask, taskPaths, writeCheck } = await import('./agenttask.mjs');
  const step = arbiterStep(reviewStep), tp = taskPaths(cfg, id, step), beats = what.beats.map((b) => b.beat);
  const forLists = sha(JSON.stringify(what.beats.map((b) => [b.beat, b.list?.items || []])));
  const task = readTask(cfg, id, step), same = task?.forAnswer === what.forAnswer && task?.forLists === forLists;
  if (!same) {
    if (fs.existsSync(tp.answer)) fs.renameSync(tp.answer, tp.answer.replace(/\.json$/, '.prev.json'));
    writeTask(cfg, id, step, { rules: ARBITER_RULES, schema: ARBITER_SCHEMA, forAnswer: what.forAnswer, forLists, input: { review: reviewStep, beats: what.beats, house: 'work/recipe-board-v1/routing/house-style.json', note: what.note || '附图：先是这几拍的帧条（每拍一条，从左到右拍头、1/4、1/2、3/4、拍尾），再是对标' }, images: what.images || [] });
    log(`  ${reviewStep}: ${beats.join(',')} go to the arbiter (${step})`);
    return { pending: step };
  }
  if (!fs.existsSync(tp.answer) || fs.statSync(tp.answer).mtimeMs <= fs.statSync(tp.task).mtimeMs) return { pending: step };
  const answer = readJson(tp.answer), errors = rulingErrors(answer, beats);
  writeCheck(cfg, id, step, { ok: !errors.length, errors, forAnswer: what.forAnswer, forLists });
  if (errors.length) { log(`  ${step}: ruling sent back (${errors.length}): ${errors.slice(0, 3).join(' | ')}`); return { pending: step, errors }; }
  const added = addLessons(cfg, answer.rulings.map((r) => rulingLesson(r, reviewStep)));
  if (added.length) { const { syncReviewPrompts } = await import('./reviewrules.mjs'); syncReviewPrompts(cfg); log(`  ${step}: new rule for every reviewer: ${added.join(', ')}`); }
  for (const r of answer.rulings) log(`  ${step}: ${r.beat} ${r.verdict === 'pass' ? 'passed' : 'to do'} by the arbiter — ${r.why}`);
  markHeard(path.dirname(tp.task), reviewStep, beats);
  return { rulings: answer.rulings };
}
