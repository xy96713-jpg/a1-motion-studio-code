import { loadProject } from './store.mjs';
import { assertScopeAllows } from './project-scope.mjs';
// The film's white model (user 2026-10-22: 先低分辨率白膜做快速预览吗，每章或者全篇确认了再渲染高质量方案；专业系统会怎么做).
// The studio order: decide what is cheap to decide where it is cheap. The animatic is the whole film at half size and
// ANIMATIC.fps, no motion blur, no grain of the final: every chapter from its accepted module (chapter.mjs
// animaticChapter), every card from its final render when that is current, else its page at draft quality. Each piece
// is cached by what it is made from, so a second animatic renders only what changed. Every seam check of the reel runs
// on it (still, empty, a jerk of the camera, a match that keeps nothing), so a cut that does not join is found before
// anything is rendered for the film. The user approves chapters on it (approveChapters); a chapter's final render waits
// for that (chapter.mjs animaticGate).
// Every piece is held to the film's look too (lookOff): its colour cast against the reference's.
//   out/animatic.mp4, out/animatic/report.json { at, sources: { shot: final|draft|still|missing }, seams, look, chapters }
import fs from 'node:fs';
import { applyFinish } from './finish.mjs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertRenderStorage, projectPaths, loadShots } from './store.mjs';
import { ANIMATIC_TIERS, animaticChapter, chapterState, readApprovals, approvedChapter, chapterCodeHash, chapterGroups, filmBeats, filmOfScreen, screensOf } from './chapter.mjs';
import { profileOf } from './profile.mjs';
import { transitionFilter, seamEnds, seamEmpties, seamJerks, seamProblems } from './sequence.mjs';
import { pool } from './pool.mjs';
import { referencePaths } from './refbreakdown.mjs';

// The film's look on every piece (user 2026-10-23: 5:38 的电脑明显是别的线生成的 — a beige CRT plate from the shared card
// library in a film of neutral greys and one red). castcheck.py: the colour cast of a frame's neutral parts (the accent
// family left out); the reference's spread is measured once and kept beside it (cast.json). A shot whose cast is above
// the reference's 98th percentile (at least CAST_FLOOR) by CAST_MARGIN is off the film's look: its plate or picture was
// painted for another look. Owner: the shot's art (re-paint it in the film's style) or its picture (graded to the film).
export const CAST_FLOOR = 6, CAST_MARGIN = 3;
const CASTPY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'castcheck.py');
export function castRows(files) {
  if (!files.length) return [];
  const r = spawnSync('python3', [CASTPY, 'pieces', ...files], { encoding: 'utf8', maxBuffer: 1 << 24 });
  return r.status ? [] : r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
export function referenceCast(cfg, id) {
  const R = referencePaths(cfg, id); if (!R?.video || !fs.existsSync(R.video)) return null;
  const f = path.join(R.dir, 'cast.json'), have = readJson(f);
  if (have && have.video === path.basename(R.video)) return have;
  const r = spawnSync('python3', [CASTPY, 'ref', R.video], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status) return null;
  const v = { video: path.basename(R.video), ...JSON.parse(r.stdout) }; fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); return v;
}
// a film with its own world (a six-stage film whose look the user approved) is held to that look's frames, not to the
// reference's greys: the banana film's green-black, survey paper and dusk soil read as off the reference's look on
// every chapter (the rule: a style that is not the reference's own owns light, colour and grain)
export function lookCast(files) {
  if (!files?.length) return null;
  const r = spawnSync('python3', [CASTPY, 'images', ...files], { encoding: 'utf8', maxBuffer: 1 << 24 });
  return r.status ? null : { ...JSON.parse(r.stdout), own: true };
}
// the CIE Lab chroma of a colour (castcheck.py's measure): what a design-brain palette's ground carries by design
export function labChroma(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => { const v = parseInt(m[1].slice(i, i + 2), 16) / 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; });
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return Math.hypot(500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z)));
}
// allow: { pieceId: extra cast } — a chapter the design brain gave a coloured variant (a reversed field, an analogous
// shift) carries its palette's colour on purpose; the bar takes that palette's ground chroma (the banana film's rust
// field and teal globe read as off the look under the look's own 9.4)
// (pure, tested) the cast a beat's film palette carries by design: its ground and its ink, and where its light is coloured
// (a cool night, a warm lamp) its key lights the neutral parts too (Suez B07 and B12 on the indigo night measured 29 and 35
// against the ground's 22 and were filed as off the look, 2026-10-28)
export const beatCastAllow = (c) => !c ? 0 : Math.max(labChroma(c.ground), labChroma(c.ink), c.light && c.light !== 'neutral' ? labChroma(c.key) * 0.75 : 0);
export function lookOff(rows, ref, allow = {}) {
  const bar0 = Math.max(ref?.cast?.['98'] ?? 0, CAST_FLOOR) + CAST_MARGIN;
  return rows.filter((r) => r.cast > Math.max(bar0, (allow[r.id] || 0) + CAST_MARGIN)).map((r) => ({ ...r, bar: Math.max(bar0, (allow[r.id] || 0) + CAST_MARGIN) }))
    .map((r) => `${r.id}: off the film's look: a colour cast of ${r.cast} in its neutral parts (the accent left out), ${ref?.own ? 'the approved look' : "the reference's"}${allow[r.id] ? " and the chapter's palette" : ''} stay under ${r.bar.toFixed(1)}: its plate or picture was made for another look; paint it in the film's style or grade it to the film`);
}

const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }));
const ENC = (fps) => ['-an', '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(fps)];
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// a card: its final render when the page it was made from is the page now, else the same page at draft quality
async function cardVideo(cfg, id, shot, { fps, log }) {
  if (!shot.motion) return null;
  const { buildMotion, renderMotionAsync } = await import('./motion.mjs');
  const { motionPageHash } = await import('./run.mjs');
  const { dir } = await buildMotion(cfg, id, shot), page = motionPageHash(dir), r = path.join(dir, 'renders');
  const final = path.join(r, 'motion.mp4'), stamp = path.join(r, 'page.hash');
  if (fs.existsSync(final) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === page) return { file: final, source: 'final' };
  const draft = path.join(r, 'animatic.mp4'), dstamp = path.join(r, 'animatic.hash');
  if (fs.existsSync(draft) && fs.existsSync(dstamp) && fs.readFileSync(dstamp, 'utf8').trim() === `${page}:${fps}`) return { file: draft, source: 'draft' };
  const t0 = Date.now();
  // the geometry measured first (run.mjs cardCheck): the white model still shows the card, its faults are named here and
  // hold its final render
  try { const { cardCheck } = await import('./run.mjs'); for (const g of await cardCheck(cfg, dir, shot, id)) log(`  ${shot.shotId}: GEOMETRY ${g.say}`); } catch (e) { log(`  ${shot.shotId}: geometry not measured: ${String(e.message || e).split('\n')[0]}`); }
  await renderMotionAsync(dir, { fps, quality: 'draft', out: draft });
  fs.writeFileSync(dstamp, `${page}:${fps}\n`);
  log(`  ${shot.shotId}: white model ${shot.motion.duration}s in ${Math.round((Date.now() - t0) / 1000)} s`);
  return { file: draft, source: 'draft' };
}

// The film's final (a six-stage film): every beat from its chapter's final render (chapter.mjs renderFinal: the
// chapters' own, and the approved hero stills' module rendered the same way), cut where the beats meet as the white
// model cuts them, at full size, then the film's finish -> out/final.mp4. A beat whose chapter has no final render yet
// is named, never left out silently (the card reel took no chapter and laid 1 of 13 beats, 2026-10-28)
// (pure, tested) the final's pieces: each beat in film order cut from its chapter's (or the hero stills') final render
// at its seconds; a beat with no chapter or no render is missing, never left out silently
export function finalPlan(shots, inChapter, films, screens = {}) {
  const pieces = [], missing = [];
  // (each beat from the render on its own screen: chapter.mjs screensOf, filmOfScreen)
  for (const shot of shots) { const ch = inChapter[shot.shotId], f = ch && filmOfScreen(films[ch.g.id], screens[shot.shotId] || 'clean'); if (!f) { missing.push(shot.shotId); continue; } pieces.push({ beat: shot.shotId, chapter: ch.g.id, film: f, screen: screens[shot.shotId] || 'clean', at: ch.s.at, dur: ch.s.dur }); }
  return { pieces, missing, seconds: +pieces.reduce((a, x) => a + x.dur, 0).toFixed(3) };
}
// (pure, tested) what a final is made from: each piece's render (by stamp), its cut, its seams, and the grade
export const finalKey = (plan, beats, finish, stamp) => JSON.stringify({ pieces: plan.pieces.map((x) => [x.beat, x.film, stamp(x.film), x.at, x.dur, beats[x.beat]?.in ?? null, beats[x.beat]?.out ?? null]), missing: plan.missing, finish: finish ?? null });
// where each beat of the film comes from in its final: the chapters and the approved hero stills (buildFinal, preflightFilm)
async function finalSources(cfg, id) {
  const shots = loadShots(cfg, id).sort((a, b) => a.shotId.localeCompare(b.shotId, 'en', { numeric: true }));
  const states = chapterState(cfg, id), inChapter = {};
  for (const st of states) for (const s of st.g.shots) inChapter[s.shotId] = { g: st.g, s };
  const { heroChapter } = await import('./stills.mjs'), hg = heroChapter(cfg, id, filmBeats(cfg, id), new Set(Object.keys(inChapter)));
  if (hg?.heroes.length) { states.push({ g: hg, hero: true }); for (const s of hg.shots) if (hg.heroes.includes(s.shotId)) inChapter[s.shotId] = { g: hg, s }; }
  return { shots, states, inChapter };
}
// The final's road tried before the film waits on it (RETRO-20261028 4: at night, with the film done, its fine render threw
// at B02's first frame and the six-stage line had no step that laid the final): every chapter and the hero stills drawn
// on three frames by the final's own page (chapter.mjs finalPreflight), and every beat mapped to a piece of the final
// (finalPlan, every piece standing in for its render). Run once the structure is approved (run), before the final gate
// (gates.mjs approveGate final refuses a film that fails it) and by hand: node scripts/recipe-board.mjs smoke --project <id>
export async function preflightFilm(cfg, id, { log = console.log, force = false } = {}) {
  const C = await import('./chapter.mjs'), p = projectPaths(cfg, id), { shots, states, inChapter } = await finalSources(cfg, id), chapters = {};
  for (const st of states) chapters[st.g.id] = await C.finalPreflight(cfg, id, st.g, { log, force });
  const plan = finalPlan(shots, inChapter, Object.fromEntries(states.map((st) => [st.g.id, chapters[st.g.id]?.ok ? `(${st.g.id})` : null])));
  const want = +shots.reduce((a, s) => a + (s.duration || 0), 0).toFixed(3);
  const errors = [...Object.entries(chapters).filter(([, r]) => !r.ok).map(([g, r]) => `${g}: final preflight failed — ${r.error}`), ...(plan.missing.length ? [`no final piece for ${plan.missing.join(',')} (no chapter or hero still holds them, or theirs failed)`] : [])];
  const out = { contract: 'A1FinalPreflight/v1', ok: !errors.length, errors, chapters, beats: plan.pieces.length, missing: plan.missing, seconds: plan.seconds, planned: want || null, at: new Date().toISOString() };
  fs.mkdirSync(path.join(p.out, 'film'), { recursive: true }); fs.writeFileSync(path.join(p.out, 'film', 'preflight.json'), JSON.stringify(out, null, 1) + '\n');
  return out;
}
export async function buildFinal(cfg, id, { log = console.log } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'final');
  const pending = (await import('./storyboard.mjs')).redesignedBeats(cfg, id);
  // Pending rewrites may only retrieve an identical, already assembled final; never render or assemble them.
  assertRenderStorage(cfg, id);
  { const dz = (await import('./pool.mjs')).diskError(); if (dz) throw new Error(dz); }   // (not run half-written onto a full disk)
  const C = await import('./chapter.mjs'), p = projectPaths(cfg, id), dir = path.join(p.out, 'final'), fps = 30;
  fs.mkdirSync(dir, { recursive: true });
  const beats = readJson(path.join(p.root, 'storyboard.json'), {})?.shots?.reduce((m, b) => ({ ...m, [b.beat]: b }), {}) || {};
  const { shots, states, inChapter } = await finalSources(cfg, id);
  const films = {};
  for (const st of states) {
    const own = path.join(p.out, 'chapters', st.g.id, 'out', 'render', `${st.g.id}-clean.mp4`), per = Object.fromEntries(screensOf(cfg, id, st.g).list.map((m) => [m, path.join(p.out, 'chapters', st.g.id, 'out', 'render', `${st.g.id}-${m}.mp4`)]).filter(([, f]) => fs.existsSync(f)));
    films[st.g.id] = pending.length ? (fs.existsSync(own) ? per : null) : (st.hero ? await C.renderFinal(cfg, id, st.g, { log }) : (fs.existsSync(own) ? per : null));
  }
  const pieces = [], fit = `fps=${fps},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1`, plan = finalPlan(shots, inChapter, films, Object.assign({}, ...states.map((st) => screensOf(cfg, id, st.g).byBeat)));
  // laid again only when what it is made from changed: the renders it cuts, the cuts, the seams and the grade (2026-10-28:
  // every run after the final gate laid and graded the same 93 s again, 267 s of grading each time)
  const out = path.join(p.out, 'final.mp4'), keyFile = path.join(dir, 'final.key');
  const key = finalKey(plan, beats, (await import('./finish.mjs')).finishOf(cfg, id), (f) => { try { const st = fs.statSync(f); return `${st.size}:${Math.round(st.mtimeMs)}`; } catch { return '-'; } });
  if ((!pending.length || !plan.missing.length) && fs.existsSync(out) && fs.existsSync(keyFile) && fs.readFileSync(keyFile, 'utf8') === key) { log(`  final: unchanged, kept (${plan.pieces.length} beats)`); return { file: out, beats: plan.pieces.length, missing: plan.missing, kept: true }; }
  if (pending.length) throw new Error(`unapplied storyboard rewrite: ${pending.join(', ')}`);
  for (const x of plan.pieces) {
    const piece = path.join(dir, `${x.beat}.mp4`), b = beats[x.beat] || {}, tr = transitionFilter(b.in, b.out, x.dur);
    ff(['-ss', String(x.at), '-i', x.film, '-t', x.dur.toFixed(3), '-vf', fit + (tr ? ',' + tr : ''), ...ENC(fps), piece]);
    pieces.push(piece);
  }
  const { missing } = plan;
  const list = path.join(dir, 'pieces.txt');
  fs.writeFileSync(list, pieces.map((f) => `file '${f}'`).join('\n') + '\n');
  if (pieces.length) { ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]); applyFinish(cfg, id, out, { log }); fs.writeFileSync(keyFile, key); }
  log(`  final: ${pieces.length} beats${missing.length ? `, no final render: ${missing.join(',')}` : ''} -> ${out}`);
  return { file: pieces.length ? out : null, beats: pieces.length, missing };
}

// tier: 'look' (half size, 15 fps) or 'fast' (a quarter, 12 fps: the camera and the timing); only: beats to make again
// (a chapter renders just their seconds and one either side; every other piece is the last white model's)
export async function buildAnimatic(cfg, id, { tier = 'look', only = null, log = console.log } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'animatic');
  assertRenderStorage(cfg, id);
  const T = ANIMATIC_TIERS[tier] || ANIMATIC_TIERS.look, fps = T.fps, W = Math.round(1920 * T.scale / 2) * 2, H = Math.round(1080 * T.scale / 2) * 2;
  const p = projectPaths(cfg, id), dir = path.join(p.out, 'animatic'), pdir = path.join(dir, tier === 'look' ? 'pieces' : `pieces-${tier}`);
  fs.mkdirSync(pdir, { recursive: true });
  const shots = loadShots(cfg, id).sort((a, b) => a.shotId.localeCompare(b.shotId, 'en', { numeric: true }));
  const beats = readJson(path.join(p.root, 'storyboard.json'), {})?.shots?.reduce((m, b) => ({ ...m, [b.beat]: b }), {}) || {};
  // chapters first (each in its own browser, a few at a time), then the cards
  const states = chapterState(cfg, id), inChapter = {};
  for (const st of states) for (const s of st.g.shots) inChapter[s.shotId] = { g: st.g, s };
  const chapters = {}, keep = (sid) => only && !only.has(sid) && fs.existsSync(path.join(pdir, `${sid}.mp4`));
  // the approved hero stills play their beats where no chapter holds them (stills.mjs heroChapter)
  { const { heroChapter } = await import('./stills.mjs'), { filmBeats } = await import('./chapter.mjs'), hg = heroChapter(cfg, id, filmBeats(cfg, id), new Set(Object.keys(inChapter)));
    if (hg?.heroes.length) { states.push({ g: hg }); for (const s of hg.shots) if (hg.heroes.includes(s.shotId)) inChapter[s.shotId] = { g: hg, s }; } }
  const due = states.filter((st) => st.g.shots.some((x) => !keep(x.shotId)));
  for (const r of await pool(due, async (st) => {
    const mine = only ? st.g.shots.filter((x) => only.has(x.shotId)) : [];
    const range = mine.length && st.g.shots.every((x) => only.has(x.shotId) || keep(x.shotId)) ? [Math.max(0, Math.min(...mine.map((x) => x.at)) - 1), Math.min(st.g.total, Math.max(...mine.map((x) => x.at + x.dur)) + 1)] : null;
    chapters[st.g.id] = await animaticChapter(cfg, id, st.g, { fps, scale: T.scale, range, log });
  }))
    if (r.error) log(`  ${r.item.g.id}: white model failed: ${String(r.error.message || r.error).split('\n')[0]}`);
  // recalls take the chapters as they are now (writer.mjs currentChapterVideo): their stills refreshed once the chapters are made
  // and before the cards are built (refreshed before the chapters, B37 took B26 as it was one round ago: 2026-10-26)
  // (the shots are read again after: the cards were built from the shots read at the start, B37 kept its old still)
  try { const { applyRecalls } = await import('./writer.mjs'); const re = applyRecalls(cfg, id) || []; for (const r of re) log(`  recall refreshed: ${r.shotId || r}`); if (re.length) shots.splice(0, shots.length, ...loadShots(cfg, id).sort((a, b) => a.shotId.localeCompare(b.shotId, 'en', { numeric: true }))); } catch (e) { log(`  recalls not refreshed: ${String(e.message || e).split('\n')[0]}`); }
  const cards = {};
  for (const r of await pool(shots.filter((s) => !inChapter[s.shotId] && !keep(s.shotId)), async (s) => { cards[s.shotId] = await cardVideo(cfg, id, s, { fps, log }); }))
    if (r.error) log(`  ${r.item.shotId}: white model failed: ${String(r.error.message || r.error).split('\n')[0]}`);
  const pieces = [], sources = {};
  for (const shot of shots) {
    const piece = path.join(pdir, `${shot.shotId}.mp4`), b = beats[shot.shotId] || {}, ch = inChapter[shot.shotId];
    const fit = `fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
    if (keep(shot.shotId)) { sources[shot.shotId] = 'kept'; pieces.push(piece); continue; }   // not asked for: the last white model's piece
    if (ch && chapters[ch.g.id]) {
      const tr = transitionFilter(b.in, b.out, ch.s.dur), c0 = chapters[ch.g.id];   // c0.from: where a part of the chapter starts
      ff(['-ss', String(Math.max(0, ch.s.at - (c0.from || 0))), '-i', filmOfScreen(c0.files || c0.file, screensOf(cfg, id, ch.g).byBeat[shot.shotId] || 'clean'), '-t', ch.s.dur.toFixed(3), '-vf', fit + (tr ? ',' + tr : ''), ...ENC(fps), piece]);
      sources[shot.shotId] = 'chapter';
      // a beat past the end of its chapter's film (a beat joined the chapter and its new version is not accepted yet: the
      // film kept the older, shorter one) is held on that film's last frame for its length and marked, never left out
      // (2026-10-24: B50 joined B47's chapter and 5.3 s went missing from the reel without a word)
      const got = fs.existsSync(piece) ? probe(piece) || 0 : 0;
      if (got < ch.s.dur * 0.9) {
        const last = path.join(pdir, `${shot.shotId}-last.png`);
        ff(['-sseof', '-0.2', '-i', c0.file, '-frames:v', '1', last]);
        if (fs.existsSync(last)) { ff(['-loop', '1', '-t', ch.s.dur.toFixed(3), '-i', last, '-vf', fit, ...ENC(fps), piece]); sources[shot.shotId] = 'chapter-pending'; }
        else sources[shot.shotId] = 'missing';
        log(`  ${shot.shotId}: past the end of chapter ${ch.g.id}'s film (${got.toFixed(1)} of ${ch.s.dur} s: its newer version waits for its review); held on its last frame`);
      }
    } else if (cards[shot.shotId]) {
      const v = cards[shot.shotId], tr = transitionFilter(b.in, b.out, probe(v.file));
      ff(['-i', v.file, '-vf', fit + (tr ? ',' + tr : ''), ...ENC(fps), piece]);
      sources[shot.shotId] = v.source;
    } else {
      const still = path.join(p.candidates, `${shot.shotId}.png`), secs = b.seconds || shot.motion?.duration || 3;
      if (!fs.existsSync(still)) { sources[shot.shotId] = 'missing'; continue; }
      ff(['-loop', '1', '-t', String(secs), '-i', still, '-vf', fit, ...ENC(fps), piece]);
      sources[shot.shotId] = 'still';
    }
    pieces.push(piece);
  }
  const list = path.join(dir, tier === 'look' ? 'pieces.txt' : `pieces-${tier}.txt`), out = path.join(p.out, tier === 'look' ? 'animatic.mp4' : `animatic-${tier}.mp4`);
  fs.writeFileSync(list, pieces.map((f) => `file '${f}'`).join('\n') + '\n');
  if (pieces.length) ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  if (pieces.length) applyFinish(cfg, id, out, { log });   // the white model is seen as the film will be: one grade, one grain (finish.mjs)
  // the reel's seam checks, now and cheaply
  const blackPause = new Set(Object.values(beats).filter((b) => /black/.test(`${b.in || ''} ${b.out || ''}`) || (b.design?.devices || []).includes('black-pause')).map((b) => b.beat));
  const chapterOf = Object.fromEntries(shots.map((s) => [s.shotId, inChapter[s.shotId]?.g.id || null]));
  const ends = seamEnds(pieces).map((e) => ({ ...e, chapter: chapterOf[e.id], join: beats[e.id]?.in || 'cut', out: beats[e.id]?.out || 'cut' }));
  // The reel checks the declared seam type: hard cuts may rest; a declared carry must keep moving.
  const seams = [...seamProblems(ends).filter((x) => !blackPause.has(x.split('>')[0]) && !blackPause.has(x.split('>')[1]?.split(':')[0])), ...seamEmpties(ends, { blackPause }), ...seamJerks(ends, { blackPause })];
  const own = (await import('./chapter.mjs')).lookFrames?.(cfg, id) || [];
  const design = readJson(path.join(projectPaths(cfg, id).root, 'design.json'), null), allow = {};
  // (and half the chroma of its tones: the family of colour the design gives it to lay over the scene, rule 35)
  for (const c of design?.chapters || []) for (const s0 of shots) if (chapterOf[s0.shotId] === c.chapter) allow[s0.shotId] = Math.max(labChroma(c.palette.ground), labChroma(c.palette.ink), ...(c.palette.tones || []).map((x) => labChroma(x) * 0.5));
  // and a chapter that turns its ground on a beat (design.json turns: the rust field of a consequence) has that palette
  // from the turn on (suez B08 and B10 stood on the field the design gave them and were filed as off the look)
  for (const c of design?.chapters || []) for (const tn of c.turns || []) { const ids = shots.filter((s0) => chapterOf[s0.shotId] === c.chapter).map((s0) => s0.shotId), from = ids.indexOf(tn.beat);
    if (from >= 0) for (const sid of ids.slice(from)) allow[sid] = Math.max(allow[sid] || 0, labChroma(tn.palette.ground), labChroma(tn.palette.ink)); }
  // and each beat's film palette (the film design, palettes.mjs: an indigo night, a cobalt card, a teal sea carry their colour
  // on purpose — Suez B06 B07 B12 were filed as off the look, 2026-10-28)
  { const F = await import('./filmdesign.mjs'), P = await import('./palettes.mjs'), fd = F.acceptedFilmDesign(cfg, id), lib = P.loadPalettes(cfg);
    for (const r of fd?.beats || []) { const c = P.beatColour(r, lib); if (c) allow[r.beat] = Math.max(allow[r.beat] || 0, beatCastAllow(c)); } }
  const look = lookOff(castRows(pieces), (own.length && lookCast(own)) || referenceCast(cfg, id), allow);
  const approvals = readApprovals(cfg, id);
  const chapterRows = Object.fromEntries(states.map((st) => [st.g.id, { beats: st.g.shots.map((s) => s.shotId), approved: approvedChapter(approvals, st.g.id, chapterCodeHash(cfg, id, st.g)), made: !!chapters[st.g.id]?.made }]));
  const report = { contract: 'A1Animatic/v1', at: new Date().toISOString(), tier, only: only ? [...only] : null, fps, size: [W, H], film: pieces.length ? out : null, seconds: pieces.length ? +probe(out).toFixed(1) : 0, sources, seams, look, chapters: chapterRows };
  // the whole film: measured, reviewed as a whole, its board (filmdesign.mjs)
  if (pieces.length && !only && profileOf(cfg, id).designFirst) {
    const F = await import('./filmdesign.mjs'), m = F.measureFilm(cfg, id, out), errors = F.filmArcErrors(m, undefined, (await import('./palettes.mjs')).loadPalettes(cfg));
    const taste = await F.filmTasteGate(cfg, id, out, { log }), board = F.filmBoard(cfg, id, { design: F.acceptedFilmDesign(cfg, id), measured: m, beats: filmBeats(cfg, id), film: out, file: path.join(projectPaths(cfg, id).out, 'film', 'board.png') });
    report.whole = { measured: { longest: m.longest, flat: m.flat, changes: m.changes, range: m.range, peaks: m.peaks }, errors: [...errors, ...(taste.errors || [])], taste: taste.pending ? 'waiting' : taste.review, board };
    log(`  film: ${errors.length ? errors.join(' | ') : 'its rise and fall measures within the references'}${taste.pending ? ' · its whole-film review waits (tasks/film-taste.task.json)' : taste.errors?.length ? ` · review: ${taste.errors.join(' | ')}` : ' · review passed'}`);
  }
  fs.writeFileSync(path.join(dir, tier === 'look' ? 'report.json' : `report-${tier}.json`), JSON.stringify(report, null, 1) + '\n');
  return report;
}
