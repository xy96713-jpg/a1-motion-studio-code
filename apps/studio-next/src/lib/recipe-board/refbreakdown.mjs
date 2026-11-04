// Breaking the reference film down (user, 2026-10-21: 拆的是不是还不够细，包括设计的巧思): not five frames a beat, but
// what each element is, when it comes and goes and on which word, what carries over into the next beat, and the idea
// behind it, named from the device library (routing/devices.json: carrier, rhyme, title-to-texture, scale-jump ...).
// A section of the reference (its seconds) is a task for the session agent: dense frames (2 a second, timestamped, in
// sheets of 20) and the reference's timed subtitles; the answer is checked (breakdownErrors) and kept in
// projects/<ref>/breakdowns/<from>-<to>.json, where storyboard and chapter tasks read it (breakdownFor).
//   node scripts/recipe-board.mjs refbreakdown --project paperclip-138-full --from 191 --to 231   (breakdown.mjs is the shot director's card, another line)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectPaths } from './store.mjs';
import { readAnswer, taskPaths, writeCheck, writeTask } from './agenttask.mjs';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const DEVICES_FILE = 'routing/devices.json';
export const loadDevices = (cfg) => readJson(path.join(cfg.dataDir, DEVICES_FILE), { devices: [] }).devices || [];

// the project's reference: { video, dir (reference folder), breakdowns (folder) } from project.json reference.beats
export function referencePaths(cfg, id) {
  const project = readJson(path.join(projectPaths(cfg, id).root, 'project.json'), {}), beats = project.reference?.beats;
  if (!beats) return null;
  const dir = path.dirname(path.isAbsolute(beats) ? beats : path.join(cfg.repoRoot, beats));
  return { dir, video: referenceVideo(dir, project.reference?.video, cfg.repoRoot), subtitles: path.join(dir, 'subtitles.json'), breakdowns: path.join(dir, '..', 'breakdowns') };
}
// Absolute names are literal; work/ paths are repository-relative; other relative names are reference-folder-relative.
// The interpretation never depends on whether a candidate exists.
export function referenceVideo(dir, named = null, repoRoot = null) {
  if (named) {
    if (path.isAbsolute(named)) return named;
    if (named.split(/[\\/]+/).includes('..')) throw new Error('invalid reference video: relative traversal');
    if (repoRoot && named.startsWith('work/')) return path.join(repoRoot, named);
    return path.join(dir, named);
  }
  let mp4 = []; try { mp4 = fs.readdirSync(dir).filter((f) => /\.mp4$/i.test(f)).sort(); } catch {}
  return path.join(dir, mp4.length === 1 ? mp4[0] : 'vol138.mp4');
}

// the checks of a breakdown answer (pure)
export function breakdownErrors(a, devices) {
  const ids = new Set(devices.map((d) => d.id)), e = [];
  if (!a || a.contract !== 'A1ReferenceBreakdown/v1') return ['contract must be "A1ReferenceBreakdown/v1"'];
  if (!String(a.carrier || '').trim()) e.push('carrier: name the one thing the section follows (or say there is none, and why)');
  if (!Array.isArray(a.beats) || !a.beats.length) return [...e, 'beats: none'];
  a.beats.forEach((b, i) => {
    const w = `beats[${i}] ${b.beat || ''}`;
    if (!(b.to > b.from)) e.push(`${w}: from/to (seconds of the reference)`);
    if (!Array.isArray(b.elements) || !b.elements.length) e.push(`${w}: elements: what is on screen, each with in and the word it lands on`);
    for (const [k, el] of (b.elements || []).entries()) {
      if (!String(el.what || '').trim()) e.push(`${w} element ${k}: what`);
      if (typeof el.in !== 'number') e.push(`${w} element ${k}: in (the second it comes)`);
      if (!String(el.word || '').trim()) e.push(`${w} element ${k}: word (the narration's word it lands on)`);
    }
    if (!String(b.carryOver || '').trim()) e.push(`${w}: carryOver: what stays into the next beat (or why nothing does)`);
    if (!Array.isArray(b.devices) || !b.devices.length) e.push(`${w}: devices: at least one from routing/devices.json (a new one: add it there first)`);
    for (const d of b.devices || []) if (!ids.has(d)) e.push(`${w}: device "${d}" is not in the library (routing/devices.json)`);
    if (!String(b.idea || '').trim()) e.push(`${w}: idea: why this picture for this line, in one sentence`);
  });
  return e;
}

// dense sheets of the reference's seconds [from, to): 2 frames a second, timestamped, 20 to a sheet
export function denseSheets(video, from, to, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const out = [];
  for (let s = from; s < to; s += 10) {
    const f = path.join(outDir, `${Math.round(s)}.jpg`);
    if (!fs.existsSync(f)) {
      const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(s), '-t', String(Math.min(10, to - s)), '-i', video, '-vf', `fps=2,scale=480:-1,drawtext=text='%{pts\\:hms\\:${s}}':x=6:y=6:fontsize=20:fontcolor=yellow:fontfile=/System/Library/Fonts/Menlo.ttc,tile=5x4`, '-frames:v', '1', f]);
      if (r.status) throw new Error(`sheets: ${String(r.stderr).split('\n')[0]}`);
    }
    out.push(f);
  }
  return out;
}

const keyOf = (from, to) => `${Math.round(from)}-${Math.round(to)}`;
export async function stepBreakdown(cfg, id, { from, to, log = console.log } = {}) {
  const R = referencePaths(cfg, id); if (!R || !fs.existsSync(R.video)) throw new Error('no reference video for this project (project.json reference.beats)');
  const step = `breakdown-${keyOf(from, to)}`, file = path.join(R.breakdowns, `${keyOf(from, to)}.json`), devices = loadDevices(cfg);
  const answer = readAnswer(cfg, id, step);
  if (answer) {
    const errors = breakdownErrors(answer, devices);
    writeCheck(cfg, id, step, { ok: !errors.length, errors });
    if (!errors.length) { fs.mkdirSync(R.breakdowns, { recursive: true }); fs.writeFileSync(file, JSON.stringify(answer, null, 1) + '\n'); log(`  ${step}: accepted -> ${file}`); return { state: 'accepted', file }; }
    log(`  ${step}: rejected (${errors.length})\n    ${errors.slice(0, 8).join('\n    ')}`); return { state: 'rejected', errors };
  }
  if (fs.existsSync(file)) return { state: 'accepted', file };
  const sheets = denseSheets(R.video, from, to, path.join(R.dir, 'dense'));
  const subs = (readJson(R.subtitles, { lines: [] }).lines || []).filter((l) => l.to > from && l.from < to);
  const beatTimes = readJson(path.join(R.dir, 'beat-times.json'), {}), ours = Object.entries(beatTimes).filter(([, [a, b]]) => b > from && a < to).map(([k]) => k);
  writeTask(cfg, id, step, { rules: 'work/recipe-board-v1/prompts/breakdown.md', schema: 'contract A1ReferenceBreakdown/v1 (see the rules)', input: { section: [from, to], ourBeats: ours, subtitles: subs, devices }, images: sheets });
  log(`  ${step}: task written (${sheets.length} sheets, ${subs.length} subtitle lines): ${path.relative(projectPaths(cfg, id).root, taskPaths(cfg, id, step).task)}`);
  return { state: 'waiting', task: taskPaths(cfg, id, step).task };
}

// the breakdown beats that cover these of our beats (every accepted section's)
export function breakdownFor(cfg, id, beatIds) {
  const R = referencePaths(cfg, id); if (!R || !fs.existsSync(R.breakdowns)) return null;
  const want = new Set(beatIds), rows = [];
  let carrier = null;
  for (const f of fs.readdirSync(R.breakdowns).filter((x) => x.endsWith('.json'))) {
    const b = readJson(path.join(R.breakdowns, f)); if (!b?.beats) continue;
    const hit = b.beats.filter((x) => want.has(x.beat)); if (hit.length) { rows.push(...hit); carrier ||= b.carrier; }
  }
  return rows.length ? { carrier, beats: rows } : null;
}

// a chapter's own design plan (its module exports plan2 = { carrier, beats: { <beat>: { carryOver, devices } } }):
// a carrier, what carries over into every beat after the first, devices from the library, at least one that is more
// than timing (user: 一个物件贯穿、首尾呼应、尺度跳变……)
// each beat names its form too (routing/forms.json; the user 2026-10-26: 知道什么时候 … 平面 2.5 3d): flat, 2.5d or 3d,
// and what the form is for (formFor: one of the form's reasons — read; place, quantity, object; shape, structure,
// object); the module's 3D stage (stage3) and the beats that say 3d go together (code: the module's source)
export const FORM_FOR = { flat: ['read'], '2.5d': ['place', 'quantity', 'object'], '3d': ['shape', 'structure', 'object'] };
export function planErrors(plan, beatIds, devices, code = null) {
  const ids = new Set(devices.map((d) => d.id)), e = [];
  if (!plan) return ['the module exports no plan2 = { carrier, beats: { <beat>: { carryOver, devices } } } (prompts/morph.md: 设计巧思)'];
  if (!String(plan.carrier || '').trim()) e.push('plan2.carrier: the one thing the chapter follows through its beats');
  const used = new Set();
  beatIds.forEach((b, i) => {
    const p = plan.beats?.[b];
    if (!p) { e.push(`plan2.beats.${b}: missing`); return; }
    if (i > 0 && !String(p.carryOver || '').trim()) e.push(`plan2.beats.${b}.carryOver: what stays from the beat before (a fade out of everything and in of everything is not a transition)`);
    for (const d of p.devices || []) { if (!ids.has(d)) e.push(`plan2.beats.${b}: device "${d}" is not in routing/devices.json`); used.add(d); }
    if (!FORM_FOR[p.form]) e.push(`plan2.beats.${b}.form: flat, 2.5d or 3d (routing/forms.json: what is read is flat, a place or a pile 2.5d, a shape 3d)`);
    else if (!FORM_FOR[p.form].includes(p.formFor)) e.push(`plan2.beats.${b}.formFor: what ${p.form} is for here — ${FORM_FOR[p.form].join(' | ')}`);
  });
  if (code != null) { const has3 = /export\s+(?:async\s+)?function\s+stage3\b|export\s+const\s+stage3\b/.test(code), says3 = beatIds.some((b) => plan.beats?.[b]?.form === '3d'), saysSpace = beatIds.some((b) => ['3d', '2.5d'].includes(plan.beats?.[b]?.form));
    // (a map laid flat in the stage is 2.5d: paperclip-138-full B01)
    if (has3 && !saysSpace) e.push('plan2: the module builds a 3D stage (stage3) but no beat says form: 3d or 2.5d — say which beat it is for, or draw it flat');
    if (says3 && !has3) e.push('plan2: a beat says form: 3d but the module builds no 3D stage (stage3)'); }
  if (![...used].some((d) => d !== 'word-cue')) e.push('plan2: no device beyond timing; pick the chapter\'s idea from routing/devices.json');
  return e;
}

// every element the reference shows on a beat (its breakdown: elements[i].what) is answered in the chapter's plan,
// one by one: plan2.beats[B].follows = [{ el: i, does: 'match' | 'differ', how }] (the passage line's follows, breakdown.mjs) — match says how ours shows it,
// differ says why ours does not (the reference's facts are not in our text, a better device, ...). paperclip-138-full
// 2026-10-22: the breakdown had B13's row of red locus tags, B17's two-axis chart, B09's chain pulled back with more red,
// B45's dimmed tree with two or three relatives left; the plans skipped them and the user found each one.
export function chapterFollowErrors(plan, breakdown, beatIds) {
  if (!breakdown?.beats?.length) return [];
  const want = new Set(beatIds), e = [];
  // a beat taken apart in two passages (paperclip-138 B27) has its elements numbered on, in breakdown order
  const byBeat = new Map();
  for (const x of breakdown.beats.filter((y) => want.has(y.beat))) byBeat.set(x.beat, [...(byBeat.get(x.beat) || []), ...(x.elements || [])]);
  for (const [beat, all] of byBeat) {
    const rb = { beat, elements: all }, els = rb.elements, fol = plan?.beats?.[rb.beat]?.follows;
    if (!els.length) continue;
    if (!Array.isArray(fol)) { e.push(`plan2.beats.${rb.beat}.follows: answer each of the reference's ${els.length} element(s) on this beat (breakdown: ${els.map((x, i) => `${i} ${x.what}`).join('; ')}) with { el, does: 'match' | 'differ', how }`); continue; }
    els.forEach((x, i) => {
      const a = fol.find((f) => f?.el === i);
      if (!a) e.push(`plan2.beats.${rb.beat}.follows: the reference's element ${i} (${x.what}) is not answered`);
      else if (!['match', 'differ'].includes(a.does)) e.push(`plan2.beats.${rb.beat}.follows[el ${i}].does: 'match' or 'differ'`);
      else if (String(a.how || '').trim().length < (a.does === 'differ' ? 8 : 4)) e.push(`plan2.beats.${rb.beat}.follows[el ${i}]: say ${a.does === 'differ' ? 'why ours differs' : 'how ours shows it'} (how)`);
    });
  }
  return e;
}

// A match/carry boundary is proved by the actor states measured on either side of it, not by plan2 prose.
// The plan remains the design contract; __actorTrack supplies the runtime evidence.
export function contentStateCarryErrors(plan, shots, actorTrack) {
  const e = [];
  for (let i = 1; i < (shots || []).length; i++) {
    const previous = shots[i - 1], current = shots[i], design = plan?.beats?.[current.shotId] || {}, previousDesign = plan?.beats?.[previous.shotId] || {};
    if (design.join !== 'match' && design.out !== 'match' && design.carry !== true && design.carry?.mode !== 'match' && previousDesign.out !== 'match' && current.join !== 'match' && previous.out !== 'match') continue;
    const at = current.at, rows = (actorTrack || []).filter((r) => Number.isFinite(r?.t) && String(r.id || '').trim() && r.state && typeof r.state === 'object' && !Array.isArray(r.state));
    const before = rows.filter((r) => r.t < at && r.t >= previous.at && at - r.t <= 0.25);
    const after = rows.filter((r) => r.t >= at && r.t < at + current.dur && r.t - at <= 0.25);
    if (!before.length || !after.length) { e.push(`${previous.shotId}>${current.shotId}: match/carry content state is unmeasured at the boundary (__actorTrack required; declarations cannot pass)`); continue; }
    const latest = new Map(), earliest = new Map();
    for (const r of before) if (!latest.has(r.id) || latest.get(r.id).t < r.t) latest.set(r.id, r);
    for (const r of after) if (!earliest.has(r.id) || earliest.get(r.id).t > r.t) earliest.set(r.id, r);
    const continuityLoss = (a, b, path = 'state') => {
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return [];
      const out = [], resetReason = String(design.resetReason || '').trim();
      for (const [key, value] of Object.entries(a)) {
        const next = b[key], at = `${path}.${key}`;
        if (/^(?:completed|completedRows|completedItems|done|doneRows|finished|finishedRows)$/i.test(key) && Array.isArray(value) && value.length && (!Array.isArray(next) || value.some((item) => !next.some((x) => JSON.stringify(x) === JSON.stringify(item))))) out.push(`${at} cleared or removed across match/carry`);
        else if (/^(?:completed|completedRows|completedItems|done|doneRows|finished|finishedRows)$/i.test(key) && Number.isFinite(value) && (!Number.isFinite(next) || next < value)) out.push(`${at} cleared or removed across match/carry`);
        else if (/^(?:identity|subjectId|actorIdentity)$/i.test(key) && JSON.stringify(value) !== JSON.stringify(next) && resetReason.length < 8) out.push(`${at} reset without plan2.beats.${current.shotId}.resetReason`);
        else if (/^(?:count|quantity)$/i.test(key) && Number.isFinite(value) && (!Number.isFinite(next) || next < value) && resetReason.length < 8) out.push(`${at} reset without plan2.beats.${current.shotId}.resetReason`);
        else if (/(?:^|\.)counters(?:\.|$)/i.test(at) && Number.isFinite(value) && (!Number.isFinite(next) || next < value) && resetReason.length < 8) out.push(`${at} reset without plan2.beats.${current.shotId}.resetReason`);
        else if (value && next && typeof value === 'object' && typeof next === 'object') out.push(...continuityLoss(value, next, at));
      }
      return out;
    };
    for (const [id, a] of latest) {
      const b = earliest.get(id);
      if (!b) { e.push(`${previous.shotId}>${current.shotId}: actor ${id} has no measured state after the match/carry boundary`); continue; }
      e.push(...continuityLoss(a.state, b.state).map((x) => `${previous.shotId}>${current.shotId}: ${id}.${x}`));
    }
  }
  return e;
}

// the devices a line of narration calls for: a device's cue (routing/devices.json) is a pattern of what the article
// says when the reference used it (被称为 → the term at its biggest; 只剩 / 确定 N 名 → frames that narrow; 完全一致 →
// two sides the same). This is what lets a film on another article be designed like the reference: the storyboard and
// chapter tasks get the cued devices per beat; a chapter whose narration says a required cue and uses none of its
// devices fails (cueErrors).
const cueOf = (d) => { try { return d.cue ? new RegExp(d.cue) : null; } catch { return null; } };
export function deviceCues(beats, devices) {
  const cues = devices.map((d) => [d, cueOf(d)]).filter(([, r]) => r);
  return beats.map((b) => ({ beat: b.beat ?? b.shotId ?? b.id, devices: cues.filter(([, r]) => r.test(String(b.text || ''))).map(([d]) => d.id) })).filter((x) => x.devices.length);
}
export function cueErrors(plan, beats, devices) {
  if (!plan?.beats) return [];
  const used = new Set(Object.values(plan.beats).flatMap((p) => p.devices || [])), e = [];
  for (const d of devices.filter((x) => x.required && cueOf(x))) {
    const hit = beats.filter((b) => cueOf(d).test(String(b.text || ''))).map((b) => b.beat ?? b.shotId ?? b.id);
    // a cue is a guess from the words (on a second film, paperclip-047, a forced device's cue was right about half the
    // time): a beat may decline it, saying why its line does not call for it (plan2.beats[B].declined: [{ device, why }])
    const declined = (b) => (plan.beats[b]?.declined || []).some((x) => x?.device === d.id && String(x.why || '').trim().length >= 8);
    const open = hit.filter((b) => !declined(b));
    if (open.length && ![d.id, ...(d.alt || [])].some((x) => used.has(x))) e.push(`plan2: ${open.join(', ')} say${open.length > 1 ? '' : 's'} what calls for "${d.id}" (${d.name}: ${d.when}); use it or one of ${(d.alt || []).join(', ') || 'none'}, or decline it on that beat with the reason its line does not call for it (declined: [{ device, why }]) (routing/devices.json)`);
  }
  return e;
}
// how well the cues reproduce the reference's own choices: every breakdown beat's narration (the reference subtitles
// in its span) against the devices the breakdown found there. recall: of the devices used, how many the narration cued
export function cueScore(breakdowns, subtitles, devices) {
  let used = 0, cued = 0, said = 0, right = 0;
  const cueable = new Set(devices.filter((d) => cueOf(d)).map((d) => d.id));
  for (const bd of breakdowns) for (const b of bd.beats || []) {
    const text = subtitles.filter((l) => l.to > b.from && l.from < b.to).map((l) => l.text).join('');
    const c = new Set(deviceCues([{ beat: b.beat, text }], devices)[0]?.devices || []), u = (b.devices || []).filter((d) => cueable.has(d));
    used += u.length; cued += u.filter((d) => c.has(d)).length; said += c.size; right += [...c].filter((d) => u.includes(d)).length;
  }
  return { recall: used ? +(cued / used).toFixed(3) : null, precision: said ? +(right / said).toFixed(3) : null, used, said };
}

// the reference's look that is not a device: its lettering (which house faces its kind of type maps to), kept beside
// its breakdowns (projects/<ref>/look.json); chapter.mjs faceErrors holds a chapter to it
export function referenceLook(cfg, id) {
  const R = referencePaths(cfg, id); if (!R) return null;
  return readJson(path.join(R.breakdowns, '..', 'look.json'));
}

// (pure, tested) a chapter carries out the devices its storyboard chose for each beat (v3: the act's devices, chosen
// before any card, prompts/storyboard-semantic.md): every one is in plan2.beats[B].devices or declined with a reason
// the storyboard's form for a beat (its diagram: 2d, 2.5d, map, 3d) is a floor: a chapter may lay a beat further into
// space, never flatter. A beat it says is 2.5d or 3d is built with the parts that put things in space
// (routing/forms.json). The banana white model drew fourteen beats flat where the
// storyboard asked 2.5d or a map for nine (the user 2026-10-27: 怎么没2.5d 3d什么的)
export const FORM_RANK = { flat: 0, '2d': 0, '2.5d': 1, map: 1, '3d': 2 };
export const SPACE_PARTS = /\b(?:onPlane|planePoint|strip3d|mapPlane|stage3|camera3)\b/;
export function storyboardFormErrors(plan, chosen, code = null, { shots = [], spaceTrack = [] } = {}) {
  if (!plan?.beats) return [];
  const e = [];
  for (const { beat, form } of chosen) {
    const p = plan.beats[beat] || {}, want = FORM_RANK[form], got = FORM_RANK[p.form];
    if (want == null || got == null) continue;
    if (got < want) e.push(`plan2.beats.${beat}.form: the storyboard lays this beat ${form === 'map' ? 'as a map, in space (2.5d)' : `in ${form}`}; build it so`);
  }
  const spaced = Object.entries(plan.beats).filter(([, p]) => FORM_RANK[p?.form] >= 1).map(([b]) => b);
  if (shots.length) {
    for (const beat of spaced) {
      const shot = shots.find((s) => s.shotId === beat), want = FORM_RANK[plan.beats[beat]?.form];
      const proved = shot && spaceTrack.some((r) => r.t >= shot.at && r.t < shot.at + shot.dur && (FORM_RANK[r.form] ?? -1) >= want);
      if (!proved) e.push(`plan2.beats.${beat}: no runtime spatial evidence in this beat (${plan.beats[beat]?.form})`);
    }
  } else if (code != null && spaced.length && !SPACE_PARTS.test(code)) e.push(`plan2: ${spaced.join(', ')} say 2.5d or 3d but the module lays nothing in space (K2.onPlane / planePoint / strip3d, kit.mapPlane, stage3)`);
  return e;
}
export function storyboardDeviceErrors(plan, chosen) {
  if (!plan?.beats) return [];
  const e = [];
  for (const { beat, devices = [] } of chosen) {
    const p = plan.beats[beat] || {}, used = new Set(p.devices || []), declined = new Set((p.declined || []).filter((x) => String(x?.why || '').trim().length >= 8).map((x) => x.device));
    const miss = devices.filter((d) => !used.has(d) && !declined.has(d));
    if (miss.length) e.push(`plan2.beats.${beat}: the storyboard shows this line with ${miss.join(', ')}; use ${miss.length > 1 ? 'them' : 'it'} or decline with why (plan2.beats.${beat}.declined)`);
  }
  return e;
}

// (pure, tested) a device a beat names is carried out by its route (routing/devices.json `route`: the code it calls, or
// the page module it shows), not drawn by hand in its place (the user 2026-10-27: 确保无遗漏 该调用哪块就走哪块).
// beats: plan2's beats ({ B: { devices } }); answer: { code, pages }
export function routeErrors(beats, answer, devices) {
  const by = new Map(devices.filter((d) => d.route).map((d) => [d.id, d.route])), e = [];
  const shown = new Set((answer?.pages || []).map((p) => { try { return JSON.parse(p.spec).module; } catch { return null; } }));
  for (const [b, p] of Object.entries(beats || {})) for (const d of p?.devices || []) {
    const r = by.get(d); if (!r) continue;
    const ok = (!r.code || new RegExp(r.code).test(String(answer?.code || ''))) && (!r.pages || shown.has(r.pages));
    if (!ok) e.push(`plan2.beats.${b}: "${d}" is not carried out by its route: ${r.say}`);
  }
  return e;
}

// (pure, tested) callable refs named in kit.use (type.flat.X / type.dev.X / type.X / kit.engine.X / K2.X …)
export function kitUseRefs(use) {
  const refs = [];
  // type.flat.X / type.dev.X first; then top-level type.X from templates/type.js (surfaceType, bayBackType, serif, …)
  for (const m of String(use || '').matchAll(/\b((?:type\.(?:flat|dev)|kit\.engine|K[245])\.[A-Za-z][A-Za-z0-9]*|type\.[A-Za-z][A-Za-z0-9]*)\b/g)) {
    if (!refs.includes(m[1])) refs.push(m[1]);
  }
  return refs;
}

// (pure, tested) symbol index from kit2/kit4/kit5/morph/type sources — export function + flat/type keys
export function buildKitSymbolIndex({ kit2 = '', kit4 = '', kit5 = '', morph = '', type = '' } = {}) {
  const sym = new Set();
  const addFns = (src, prefixes) => {
    for (const m of String(src).matchAll(/export\s+function\s+([A-Za-z][A-Za-z0-9]*)\s*\(/g)) {
      for (const p of prefixes) sym.add(`${p}.${m[1]}`);
    }
  };
  const addConsts = (src, prefixes) => {
    for (const m of String(src).matchAll(/export\s+const\s+([A-Za-z][A-Za-z0-9]*)\s*=/g)) {
      for (const p of prefixes) sym.add(`${p}.${m[1]}`);
    }
  };
  const addObjKeys = (src, objName, prefixes) => {
    const re = new RegExp(`export\\s+const\\s+${objName}\\s*=\\s*\\{([^}]*)\\}`);
    const m = String(src).match(re);
    if (!m) return;
    for (const k of m[1].matchAll(/\b([A-Za-z][A-Za-z0-9]*)\b/g)) {
      for (const p of prefixes) sym.add(`${p}.${k[1]}`);
    }
  };
  addFns(kit2, ['K2', 'type.flat']);
  addConsts(kit2, ['K2', 'type.flat']);
  addObjKeys(kit2, 'flat', ['K2', 'type.flat']);
  addFns(kit4, ['type.dev', 'K4']);
  addConsts(kit4, ['type.dev', 'K4']);
  addObjKeys(kit4, 'devices', ['type.dev', 'K4']);
  addFns(kit5, ['type.dev', 'K5']);
  addConsts(kit5, ['type.dev', 'K5']);
  addObjKeys(kit5, 'devices', ['type.dev', 'K5']);
  for (const m of String(kit5).matchAll(/display:\s*['"]([A-Za-z][A-Za-z0-9]*)['"]/g)) sym.add(`type.dev.${m[1]}`);
  addFns(morph, ['kit.engine']);
  addConsts(morph, ['kit.engine']);
  for (const n of ['filmedScreen', 'subject', 'baked', 'mapPlane']) {
    if (new RegExp(`\\b${n}\\b`).test(morph)) sym.add(`kit.engine.${n}`);
  }
  // templates/type.js top-level type.X (surfaceType, bayBackType, serif, hairline, …) — not type.flat / type.dev
  addFns(type, ['type']);
  addObjKeys(type, 'type', ['type']);
  return sym;
}

export function loadKitSymbolIndex(cfg) {
  const root = path.join(cfg.dataDir, 'style-lab', 'engine', 'templates');
  const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return ''; } };
  return buildKitSymbolIndex({ kit2: read('kit2.js'), kit4: read('kit4.js'), kit5: read('kit5.js'), morph: read('morph.js'), type: read('type.js') });
}

// (pure, tested) a device a beat or storyboard selects must exist with a ready kit route (routing/devices.json
// kit.status === "ready") AND kit.use must name a real template symbol when symbols are supplied (P0 A3 2026-10-29).
// Unknown ids and non-ready kits fail; empty / 未接线 / fake callable on ready fail. Slash-listed alts pass if any ref hits.
export function selectedDeviceKitErrors(chosen, devices, opts = {}) {
  const by = new Map((devices || []).map((d) => [d.id, d])), e = [];
  const symbols = opts.symbols || null;
  for (const row of chosen || []) {
    const beat = row.beat || row.shotId || '?';
    for (const id of row.devices || []) {
      const d = by.get(id);
      if (!d) { e.push(`${beat}: device "${id}" is not in routing/devices.json`); continue; }
      const st = d.kit?.status;
      if (st !== 'ready') {
        e.push(`${beat}: device "${id}" has no ready kit route (kit.status ${st || 'missing'}; make its kit ready before selecting it)`);
        continue;
      }
      const use = String(d.kit?.use || '').trim();
      if (!use) {
        e.push(`${beat}: device "${id}" is ready but kit.use is empty (fake wiring — name a real template symbol)`);
        continue;
      }
      if (/未接线/.test(use)) {
        e.push(`${beat}: device "${id}" kit.use says 未接线 (not a ready route)`);
        continue;
      }
      if (!symbols) continue;
      const refs = kitUseRefs(use);
      if (!refs.length) continue; // prose-only ready use (no callable token) — catalog narrative OK
      if (!refs.some((r) => symbols.has(r))) {
        e.push(`${beat}: device "${id}" kit.use has no real template symbol (${refs.join(' / ')}); wire to an exported callable or demote kit.status`);
      }
    }
  }
  return e;
}
