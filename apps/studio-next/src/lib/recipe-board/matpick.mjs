// Picking material by eye (user decision 2026-10-21: 找素材要成熟，执行吧). The search finds candidates by their titles;
// a title says little of the picture (meta-S6: "Sputnik 1 Arming Key", a 332 px model) or the page (meta-S2: a blocked
// repost ranked over Fortune's own report). So before anything is downloaded the agent looks: for each need a contact
// sheet of its best candidates (thumbnail or a card with title, publisher and size; the reference's frame at the same
// moment beside them), and answers with the order to try them in and the ones that do not show what is asked. The
// materials loop then fetches in that order and moves on to the next when one is blocked or fails its check after
// download (fit): a pick never stops the line while candidates are left.
//   task:   tasks/matpick.task.json (rules prompts/matpick.md, schema routing/matpick.schema.json)
//   answer: { needs: [{ key, order: [n, ...], none, why }] }   n: the candidate's number on its sheet (1-based)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectPaths, loadProject, sourcePath } from './store.mjs';
import { writeTask, readAnswer, writeCheck, taskPaths } from './agenttask.mjs';

const STEP = 'matpick', MAX = 8;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const FONT = '/System/Library/Fonts/STHeiti Medium.ttc';
const esc = (t) => String(t || '').replace(/[\\':%,\[\]]/g, ' ').replace(/\s+/g, ' ').trim();

// the candidates the agent is shown for a need (the ranking's best, MAX at most) and their fingerprint: an answer
// holds for the set it saw
// (the set, not its order: the proposal ranks with the film's other picks in view and may order them a little
// differently than the loop that asked the agent; the answer still holds: meta-S6 fell back to the ranking)
export function shownFor(ranked) { const list = ranked.slice(0, MAX); return { list, print: sha(list.map((c) => c.id).sort().join('|')) }; }

// the contact sheet: one tile per candidate (its thumbnail, or a card for a page), numbered, with source, size and
// title; the reference's frame at the shot's moment first when there is one, never for a blind passage (the first
// blind cards pick showed the director the reference's frame at 121 s: the test no longer blind)
export function pickSheet(cfg, id, need, list, out) {
  const thumbs = path.join(projectPaths(cfg, id).out, 'material-thumbs', need.shotId);
  fs.mkdirSync(path.dirname(out), { recursive: true });   // (a film's first pick: the folder was not there and the loop stopped)
  const tiles = [], tmp = fs.mkdtempSync(path.join(path.dirname(out), '.sheet-'));
  const label = (txt) => `drawtext=fontfile='${FONT}':text='${esc(txt).slice(0, 60)}':x=8:y=h-34:fontsize=20:fontcolor=white:box=1:boxcolor=black@.7`;
  const p = loadProject(cfg, id), video = p.sourceVideo ? sourcePath(cfg, p.sourceVideo) : null;
  if (video && fs.existsSync(video) && need.refAt != null && !need.blind) {
    const f = path.join(tmp, 'ref.jpg'); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(need.refAt), '-i', video, '-frames:v', '1', '-vf', `scale=480:270,${label('对标 同一时刻')}`, f]);
    if (fs.existsSync(f)) tiles.push(f);
  }
  list.forEach((c, i) => {
    const f = path.join(tmp, `${i}.jpg`), th = path.join(thumbs, crypto.createHash('sha256').update(c.id).digest('hex').slice(0, 12) + '.jpg');
    const size = c.w ? ` ${c.w}x${c.h}` : '', head = `#${i + 1} ${c.source}${size}`;
    if (fs.existsSync(th)) spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', th, '-vf', `scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:color=0x222222,${label(`${head} ${c.title}`)}`, f]);
    else {   // a page (no picture before it is captured): a card with its publisher, title and the excerpt that matched
      const lines = [head, c.publisher || '', ...(String(c.title || '').match(/.{1,34}/g) || []).slice(0, 2), ...(String(c.snippet || c.excerpt || '').match(/.{1,40}/g) || []).slice(0, 3)];
      const draw = lines.map((l, k) => `drawtext=fontfile='${FONT}':text='${esc(l)}':x=14:y=${14 + k * 34}:fontsize=${k ? 22 : 24}:fontcolor=${k ? 'white' : 'yellow'}`).join(',');
      spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x333333:s=480x270', '-frames:v', '1', '-vf', draw, f]);
    }
    if (fs.existsSync(f)) tiles.push(f);
  });
  const cols = 3, rows = Math.ceil(tiles.length / cols), filt = tiles.map((_, i) => `[${i}]scale=480:270[v${i}]`).join(';') + ';' + Array.from({ length: rows * cols }, (_, i) => (i < tiles.length ? `[v${i}]` : '')).join('') + (tiles.length < rows * cols ? '' : '') + `xstack=inputs=${tiles.length}:layout=${tiles.map((_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|')}:fill=black`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...tiles.flatMap((f) => ['-i', f]), '-filter_complex', filt, '-q:v', '3', out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

// the agent's order for a need, as candidate ids, when its answer saw the set shown now (null: no answer for it yet;
// [] : it found none that shows what is asked)
// what: the need's own words (need.original): an answer is for that need only; a key reused for another need (the plan
// rewritten: open-S8 was the DeepSeek page, then Hassabis's portrait) does not inherit the old need's order (it named
// candidates long gone: nothing was tried and the need sat waiting)
// the answers given so far, kept per need and fingerprint in materials/matpick.json; each need's answer on its own (a
// later task for other needs does not lose them; an answer that misses one need still counts for the others: picks
// for six talent portraits were lost when the r1 run rewrote the task)
export function harvestPicks(cfg, id) {
  const t = readJson(taskPaths(cfg, id, STEP).task, null), a = readAnswer(cfg, id, STEP), file = path.join(projectPaths(cfg, id).root, 'materials', 'matpick.json'), done = readJson(file, { needs: {} });
  if (t && a) for (const n of a.needs || []) { const x = t.input.needs.find((y) => y.key === n.key); if (x && !checkPickAnswer({ needs: [n] }, [x]).length) done.needs[`${n.key}@${x.print}`] = { order: n.none ? [] : n.order.map((k) => x.candidates[k - 1]?.id).filter(Boolean), assessments: Object.fromEntries((n.assessments || []).map((v) => [x.candidates[v.n - 1]?.id, { identity: v.identity, moment: v.moment, packaging: v.packaging, why: v.why, segment: v.segment || null }]).filter(([k]) => Boolean(k))), why: n.why || null, what: x.what ?? null, at: new Date().toISOString() }; }
  fs.writeFileSync(file, JSON.stringify(done, null, 1) + '\n');
  return done;
}
export function eyeSelection(cfg, id, key, what = null) {
  const done = harvestPicks(cfg, id);
  return (print) => done.needs[`${key}@${print}`] || Object.entries(done.needs).filter(([k, x]) => k.startsWith(`${key}@`) && (what == null || x.what === what) && (x.order || []).length).map(([, x]) => x).sort((x, y) => String(y.at).localeCompare(String(x.at)))[0] || null;
}
export function eyeOrder(cfg, id, key, what = null) {
  const selection = eyeSelection(cfg, id, key, what);
  return (print) => selection(print)?.order ?? null;
}

export function checkPickAnswer(answer, needs) {
  const err = [];
  for (const n of needs) { const v = (answer?.needs || []).find((x) => x.key === n.key);
    if (!v) { err.push(`${n.key}: no order`); continue; }
    if (!v.none && !(v.order || []).length) err.push(`${n.key}: give the order to try, or none: true`);
    if (v.none && !String(v.why || '').trim()) err.push(`${n.key}: none needs a reason`);
    for (const k of v.order || []) if (!Number.isInteger(k) || k < 1 || k > n.candidates.length) err.push(`${n.key}: ${k} is not a candidate number (1-${n.candidates.length})`);
    const assessments = Array.isArray(v.assessments) ? v.assessments : [];
    for (const a of assessments) if (!Number.isInteger(a.n) || a.n < 1 || a.n > n.candidates.length) err.push(`${n.key}: assessment ${a.n} is not a candidate number (1-${n.candidates.length})`);
    for (const k of v.order || []) {
      const a = assessments.filter((x) => x.n === k);
      if (a.length !== 1) { err.push(`${n.key}: candidate ${k} needs exactly one identity/moment/packaging assessment`); continue; }
      const x = a[0], c = n.candidates[k - 1];
      if (x.identity !== 'match') err.push(`${n.key}: candidate ${k} identity must be match, not ${x.identity}`);
      if (!['match', 'not_applicable'].includes(x.moment)) err.push(`${n.key}: candidate ${k} moment must be match or not_applicable, not ${x.moment}`);
      if (x.packaging !== 'viable') err.push(`${n.key}: candidate ${k} packaging must be viable, not ${x.packaging}`);
      if (!String(x.why || '').trim()) err.push(`${n.key}: candidate ${k} assessment needs a reason`);
      if (c?.duration != null) {
        const s = x.segment;
        if (!s || !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start || s.end > c.duration) err.push(`${n.key}: candidate ${k} needs a valid segment inside 0-${c.duration}s`);
      }
    }
  }
  return err;
}

// the task for the needs that have no order for the set shown now; returns the task path, or null when none waits
export function pickTask(cfg, id, items) {
  if (!items.length) return null;
  const P = taskPaths(cfg, id, STEP), prev = readJson(P.task, null), done = harvestPicks(cfg, id);
  // the needs another passage left waiting stay in the task (one task a project; a run rewrote it with its own only)
  const carried = (prev?.input?.needs || []).filter((n) => !items.some((x) => x.key === n.key) && !done.needs[`${n.key}@${n.print}`]);
  const wanted = [...items.map((x) => `${x.key}@${x.print}`), ...carried.map((n) => `${n.key}@${n.print}`)].sort().join(',');
  if (prev?.input?.wanted === wanted) return P.task;
  const dir = path.join(projectPaths(cfg, id).out, 'material-pick');
  const needs = [...carried, ...items.map(({ key, need, list, print }) => ({ key, print, what: need.original, entity: need.entity || null, kind: need.form, note: need.note || '', line: need.line || '', minWidth: need.minWidth ?? null,
    sheet: pickSheet(cfg, id, need, list, path.join(dir, `${key}-${print}.jpg`)),
    candidates: list.map((c, i) => ({ n: i + 1, id: c.id, source: c.source, title: c.title || '', publisher: c.publisher || '', url: c.url || '', size: c.w ? `${c.w}x${c.h}` : null, duration: c.duration ?? null, excerpt: String(c.snippet || c.excerpt || '').slice(0, 240) })) }))];
  writeTask(cfg, id, STEP, { rules: 'work/recipe-board-v1/prompts/matpick.md', schema: 'work/recipe-board-v1/routing/matpick.schema.json', input: { wanted, needs }, images: needs.map((n) => n.sheet) });
  if (fs.existsSync(P.answer)) fs.rmSync(P.answer);
  writeCheck(cfg, id, STEP, { errors: [], waiting: needs.map((n) => n.key) });
  return P.task;
}
