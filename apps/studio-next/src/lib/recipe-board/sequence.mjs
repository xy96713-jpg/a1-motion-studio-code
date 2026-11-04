import { assertScopeAllows } from './project-scope.mjs';
// Sequence assembly: place rendered motion shots on the reference timeline and cut between them
// exactly where the original cuts, so transitions and rhythm can be judged against the original
// with its own sound. projects/<id>/sequences/<seq>.json:
//   { range: [start, end],            absolute seconds in the reference film
//     presenter: "<plate image>" | "source",   presenter-only spans: a still plate, or the reference
//                                      film's own footage for that span (benchmarking only)
//     items: [{ shot, from, to } | { presenter: true, from, to }] }   absolute seconds
// A shot's motion t=0 sits at (its reference clip start + motion.ref.start); if it ends before
// `to`, its last frame holds.
import fs from 'node:fs';
import { applyFinish } from './finish.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { projectPaths, loadProject, loadShots, sourcePath, keptVersion } from './store.mjs';
import { resolveMedium, mediumVideo } from './medium.mjs';
import { voiceState } from './voice.mjs';
import { shotRecalls } from './storyboard.mjs';

// Current shots expose their current TODO/degraded render. A last complete version is only a source
// for an explicitly authored recall, never an invisible substitute for a new shot waiting on material.
export function reelSource({ current, kept = null, waiting = false, explicitRecall = false }) {
  return explicitRecall && waiting && kept ? { file: kept, kept: true } : { file: current, kept: false };
}

// The video that stands for a shot: its medium render when a medium applies (theme / project / shot, or
// the --medium override) and exists, otherwise the flat motion render.
function shotVideo(cfg, id, shot, override) {
  const m = resolveMedium(cfg, id, shot, override);
  if (m) { const v = mediumVideo(cfg, id, m.kind, shot.shotId); if (fs.existsSync(v)) return v; }
  return path.join(projectPaths(cfg, id).out, 'motion', shot.shotId, 'renders', 'motion.mp4');
}

const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }));
const ENC = ['-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '60'];

function clipStarts(cfg, project) {
  const file = sourcePath(cfg, project.clipIndex);
  const toSec = (t) => t.split(':').reduce((a, v) => a * 60 + Number(v), 0);
  return Object.fromEntries(fs.readFileSync(file, 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => [c[0], toSec(c[1])]));
}

export function buildSequence(cfg, id, seqId, { medium = null } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'sequence');
  const p = projectPaths(cfg, id);
  const project = loadProject(cfg, id);
  const seq = JSON.parse(fs.readFileSync(path.join(p.root, 'sequences', `${seqId}.json`), 'utf8'));
  const shots = Object.fromEntries(loadShots(cfg, id).map((s) => [s.shotId, s]));
  const starts = clipStarts(cfg, project);
  const dir = path.join(p.out, 'sequences', medium ? `${seqId}-${medium.kind}` : seqId);
  fs.mkdirSync(dir, { recursive: true });
  const pieces = [];
  const log = [];
  seq.items.forEach((item, i) => {
    const len = +(item.to - item.from).toFixed(3);
    const piece = path.join(dir, `piece-${String(i).padStart(2, '0')}.mp4`);
    if (item.presenter && seq.presenter === 'source') {
      // Benchmark: the original's own presenter footage for this span, so the comparison isolates packaging.
      ff(['-ss', String(item.from), '-t', String(len), '-i', sourcePath(cfg, project.sourceVideo), '-vf', 'fps=60,scale=1920:1080', ...ENC, piece]);
      log.push({ ...item, kind: 'presenter-from-source' });
    } else if (item.presenter) {
      // Placeholder presenter: the still plate with a very slow push.
      const frames = Math.round(len * 60);
      ff(['-loop', '1', '-i', sourcePath(cfg, seq.presenter), '-t', String(len), '-vf',
        `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1+0.02*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=60`, ...ENC, piece]);
      log.push({ ...item, kind: 'presenter-placeholder' });
    } else {
      const shot = shots[item.shot];
      if (!shot?.motion) throw new Error(`${item.shot} has no motion`);
      const mp4 = shotVideo(cfg, id, shot, medium);
      if (!fs.existsSync(mp4)) throw new Error(`${item.shot} not rendered; run motion first`);
      const ref = shot.motion.refShot || shot.referenceShot || shot.shotId;
      // Shots without a reference clip (footage plates) carry their absolute start as motion.refAt.
      const t0 = shot.motion.refAt ?? starts[ref] + (shot.motion.ref?.start ?? 0);
      const offset = +(item.from - t0).toFixed(3);
      if (offset < -0.02) throw new Error(`${item.shot} starts at ${item.from} but its motion begins at ${t0.toFixed(3)}`);
      const avail = probe(mp4) - Math.max(0, offset);
      const hold = Math.max(0, len - avail);
      ff(['-ss', String(Math.max(0, offset)), '-i', mp4, '-t', String(len), '-vf', `fps=60,scale=1920:1080${hold > 0.01 ? `,tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)}` : ''}`, ...ENC, piece]);
      log.push({ ...item, offset, hold: +hold.toFixed(3) });
    }
    pieces.push(piece);
  });
  const list = path.join(dir, 'pieces.txt');
  fs.writeFileSync(list, pieces.map((f) => `file '${f}'`).join('\n') + '\n');
  const out = path.join(dir, 'sequence.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);

  // Original on top, sequence below, original sound: judge cuts and rhythm by ear and eye.
  const [a, b] = seq.range;
  const source = sourcePath(cfg, project.sourceVideo);
  const cmp = path.join(dir, 'vs-original.mp4');
  ff(['-ss', String(a), '-t', String(b - a), '-i', source, '-i', out, '-filter_complex',
    '[0:v]fps=60,scale=960:540[x];[1:v]scale=960:540[y];[x][y]vstack[v]', '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', cmp]);
  fs.writeFileSync(path.join(dir, 'assembly.json'), JSON.stringify({ seqId, range: seq.range, duration: +probe(out).toFixed(3), items: log }, null, 2) + '\n');
  return { out, cmp, items: log };
}

// A beat's way in and out (storyboard `in` / `out`) drawn on its own piece, so the pieces still join by plain concat:
// flash = a white flash fading off over 0.1 s; whip = a horizontal smear over the 0.13 s next to the cut. cut and match
// are plain cuts (a match is in the pictures, not in the join).
export function transitionFilter(inKind, outKind, dur) {
  const f = [];
  if (inKind === 'flash') f.push('fade=t=in:st=0:d=0.1:color=white');
  if (inKind === 'whip') f.push("gblur=sigma=36:sigmaV=0.01:steps=2:enable='lt(t\\,0.13)'");
  // glitch: the reference covers a change of world with a few frames of torn colour and noise (Vol.138 at 123 s, 145 s, 207 s)
  if (inKind === 'glitch') f.push("rgbashift=rh=-28:bh=28:gv=6:enable='lt(t\\,0.17)'", "noise=alls=70:allf=t:enable='lt(t\\,0.17)'");
  if (outKind === 'whip') f.push(`gblur=sigma=36:sigmaV=0.01:steps=2:enable='gt(t\\,${(dur - 0.13).toFixed(3)})'`);
  return f.join(',');
}
// A hard cut normally rests on both sides; a declared carry is the exception that must keep moving.
// ends: [{ id, head, tail, join }] with the still seconds at each end of each piece, in order.
export const SEAM_STILL = 0.4;
export function seamProblems(ends, { still = SEAM_STILL } = {}) {
  const out = [];
  for (let i = 1; i < ends.length; i++) {
    const a = ends[i - 1], b = ends[i];
    if (b.join === 'carry' && a.tail >= still && b.head >= still) out.push(`${a.id}>${b.id}: declared carry has no motion across the cut (${a.tail.toFixed(1)} s still out, ${b.head.toFixed(1)} s still in)`);
  }
  return out;
}
// A seam that empties (user, 2026-10-22: 衔接不上): the least fill at the cut, the end of one piece and the start of the
// next, under SEAM_EMPTY of the lower of the two pieces' own medians. Measured on paperclip-138-full's reel against the
// reference at the same lines: 42 % of our seams emptied, 12 % of the reference's (it keeps something on screen and
// turns it into the next thing). ends: [{ id, med, head, tail }] in order; blackPause: shot ids whose seam is a planned
// black pause. Owner: a seam inside a chapter is the chapter module's, between pieces the shots' (director / module).
export const SEAM_EMPTY = 0.3;
export function seamEmpties(ends, { empty = SEAM_EMPTY, blackPause = new Set() } = {}) {
  const out = [];
  for (let i = 1; i < ends.length; i++) {
    const a = ends[i - 1], b = ends[i], base = Math.min(a.med || 0, b.med || 0);
    if (!base || blackPause.has(a.id) || blackPause.has(b.id)) continue;
    if (a.chapter && a.chapter === b.chapter) continue;   // inside a chapter: the chapter's own check judged it, with its plan's black pauses
    const low = Math.min(a.tail ?? base, b.head ?? base) / base;
    if (low < empty) out.push(`${a.id}>${b.id}: the picture empties at the cut (${Math.round(low * 100)} % of what the two shots carry): ${(a.tail ?? base) < (b.head ?? base) ? `${a.id} leaves nothing on screen` : `${b.id} starts from nothing`}; keep something on screen across the cut and turn it into the next shot`);
  }
  return out;
}
// The camera at a cut (user 2026-10-22: 衔接还是不丝滑，卡顿和抽动). Measured frame by frame on paperclip-138: the
// reference's camera is at rest on both sides of its hard cuts (16 of 17); where it moves across one it is the same
// move carried on, or a whip fast enough to blur; a world change is covered by a few frames of glitch. Ours crept
// into 13 of 22 cuts at ~4 px a frame and the next shot started at another speed: the jerk. A cut between two pieces
// passes when the camera rests on both sides (under CAM_REST px a 1/30 s at 1920 wide), carries the same move
// (the change under CAM_CARRY of the faster side), or whips (over CAM_WHIP); a cut the plan covers (glitch, flash,
// whip, a black pause) is not judged. A cut the director calls a match must keep the picture: edges in the same
// place (carryIn.iou) or the pictures alike (carryIn.corr). ends: seamEnds rows in order, with chapter and join (the
// incoming beat's `in`). Owner: the shots' motion (module) for the camera, the director for the match.
export const CAM_REST = 1.8, CAM_CARRY = 0.25, CAM_WHIP = 32, MATCH_IOU = 0.25, MATCH_CORR = 0.6;
const camSpeed = (v) => (v ? Math.hypot(...v) : 0);
export function seamJerks(ends, { blackPause = new Set() } = {}) {
  const out = [], f = (v) => `[${v.map((x) => x.toFixed(1)).join(', ')}]`;
  for (let i = 1; i < ends.length; i++) {
    const a = ends[i - 1], b = ends[i];
    if (a.chapter && a.chapter === b.chapter) continue;   // inside a chapter: one take, the chapter's own checks
    if (blackPause.has(a.id) || blackPause.has(b.id) || ['glitch', 'flash', 'whip'].includes(b.join) || a.out === 'whip') continue;
    if (b.join === 'match' && b.carryIn && b.carryIn.iou < MATCH_IOU && b.carryIn.corr < MATCH_CORR)
      out.push(`${a.id}>${b.id}: called a match, but nothing of ${a.id}'s last frame stays (edges ${Math.round(b.carryIn.iou * 100)} % in place): end ${a.id} on what ${b.id} opens with, in the same place, or call it a cut that rests`);
    const va = a.tailCam, vb = b.headCam;
    if (!va || !vb) continue;
    const sa = camSpeed(va), sb = camSpeed(vb), hi = Math.max(sa, sb);
    if (hi < CAM_REST || hi > CAM_WHIP) continue;
    if (Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]) < Math.max(CAM_REST, CAM_CARRY * hi)) continue;
    out.push(`${a.id}>${b.id}: the camera ${sa >= CAM_REST ? `is still moving into the cut (${f(va)} px a frame)` : 'rests into the cut'} and ${sb >= CAM_REST ? `moves out of it at another speed (${f(vb)})` : 'rests out of it'}: let the move settle before the cut and start the next from rest, carry the same move across, or cover the change (in: glitch)`);
  }
  return out;
}
export function seamEnds(files) {
  const r = spawnSync('python3', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'seamends.py'), ...files], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status) return [];
  return r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((o) => ({ id: path.basename(o.file, '.mp4'), ...o }));
}
// seconds of dead-still picture at the start and end of a piece (ffmpeg freezedetect over its first and last second)
export function stillEnds(file) {
  const run = (pre) => String(spawnSync('ffmpeg', ['-hide_banner', ...pre, '-i', file, '-t', '1', '-vf', 'scale=320:-1,freezedetect=n=0.0015:d=0.15', '-an', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '');   // freezedetect reports on stderr
  const parse = (txt) => [...String(txt).matchAll(/freeze_(start|end): ([\d.]+)/g)].map((m) => [m[1], +m[2]]);
  const head = (() => { const ev = parse(run([])); return ev[0]?.[0] === 'start' && ev[0][1] < 0.05 ? (ev[1]?.[0] === 'end' ? ev[1][1] : 1) : 0; })();
  const tail = (() => { const ev = parse(run(['-sseof', '-1'])); const st = ev.filter(([k]) => k === 'start').at(-1); const en = ev.filter(([k]) => k === 'end').at(-1); return st && (!en || en[1] < st[1]) ? 1 - st[1] : 0; })();
  return { head, tail };
}

// the chapter film and the seconds a chapter beat takes of it (chapter.mjs bindSlices), when the film is there
export function chapterSlice(cfg, shot) {
  const v = shot?.slots?.background?.chapter && shot.slots.background.video;
  if (!v?.path || v.in == null || v.out == null) return null;
  const file = path.isAbsolute(v.path) ? v.path : path.join(cfg.repoRoot, v.path);
  return fs.existsSync(file) ? { file, in: v.in, out: v.out } : null;
}
// New article (no reference film): every shot's motion back to back in shot order -> out/reel.mp4,
// plus a contact board of the stills -> out/board.jpg. Shots without a motion render are skipped
// and listed.
export function buildReel(cfg, id, { medium = null } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'reel');
  const p = projectPaths(cfg, id);
  const shots = loadShots(cfg, id).sort((a, b) => a.shotId.localeCompare(b.shotId, 'en', { numeric: true }));
  const dir = path.join(p.out, 'reel');
  fs.mkdirSync(dir, { recursive: true });
  const pieces = [];
  const missing = [];
  // with a current recording every shot fills the seconds its beat is spoken (retimed to fit) and the
  // recording plays under the whole reel
  const voice = voiceState(cfg, id);
  const spans = voice.state === 'current' ? voice.timings.beats : null;
  // Waiting material stays visible as the current TODO/degraded render; only explicit recalls may reuse good.mp4.
  const cache = (() => { try { return JSON.parse(fs.readFileSync(path.join(p.out, 'cache.json'), 'utf8')); } catch { return {}; } })();
  const waiting = (s) => !!(cache[s.shotId]?.degraded || []).length;
  const kept = [];
  const beats = (() => { try { return Object.fromEntries((JSON.parse(fs.readFileSync(path.join(p.root, 'storyboard.json'), 'utf8')).shots || []).map((b) => [b.beat, b])); } catch { return {}; } })();
  for (const s of shots) {
    let mp4 = shotVideo(cfg, id, s, medium);
    const good = path.join(p.out, 'motion', s.shotId, 'renders', 'good.mp4'), keep = keptVersion(cfg, id, s.shotId);
    const source = reelSource({ current: mp4, kept: keep, waiting: waiting(s), explicitRecall: shotRecalls(s).length > 0 });
    mp4 = source.file;
    if (source.kept) kept.push(s.shotId);
    else if (!waiting(s) && !medium && fs.existsSync(mp4)) fs.copyFileSync(mp4, good);
    if (!fs.existsSync(mp4)) { missing.push(s.shotId); continue; }
    const piece = path.join(dir, `${s.shotId}.mp4`);
    const span = spans?.[s.shotId] ? spans[s.shotId].end - spans[s.shotId].start : null;
    const fit = span ? `setpts=PTS*${(span / probe(mp4)).toFixed(5)},` : '';
    const b = beats[s.shotId] || {}, tr = transitionFilter(b.in, b.out, span || probe(mp4));
    // a beat of a chapter is the chapter's own film from its in to its out: one continuous take, cut where the beats
    // meet. Through the motion preset each beat got its own push and breath from scale 1, so every seam inside a chapter
    // snapped back 4 % in one frame (paperclip-138-full: B10-B16, B39-B44, B47-B49; user 2026-10-22: 抽动)
    const slice = chapterSlice(cfg, s);
    if (slice && !medium) ff(['-ss', String(slice.in), '-i', slice.file, '-t', (slice.out - slice.in).toFixed(3), '-vf', `${fit}fps=60,scale=1920:1080${tr ? ',' + tr : ''}`, ...(span ? ['-t', span.toFixed(3)] : []), ...ENC, piece]);
    else ff(['-i', mp4, '-vf', `${fit}fps=60,scale=1920:1080${tr ? ',' + tr : ''}`, ...(span ? ['-t', span.toFixed(3)] : []), ...ENC, piece]);
    pieces.push(piece);
  }
  const list = path.join(dir, 'pieces.txt');
  fs.writeFileSync(list, pieces.map((f) => `file '${f}'`).join('\n') + '\n');
  const out = path.join(p.out, 'reel.mp4');
  let voiced = null;
  if (pieces.length && spans && !missing.length) {
    const silent = path.join(dir, 'silent.mp4');
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
    const first = Math.min(...Object.values(spans).map((x) => x.start));
    voiced = probe(silent);
    const audio = path.isAbsolute(voice.timings.audio) ? voice.timings.audio : path.join(cfg.sourceRoot, voice.timings.audio);
    ff(['-i', silent, '-ss', String(first + (voice.timings.offset || 0)), '-t', voiced.toFixed(3), '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', out]);
  } else if (pieces.length) ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  if (pieces.length) applyFinish(cfg, id, out);   // one strip of film over the whole reel (finish.mjs)
  const stills = shots.map((s) => path.join(p.candidates, `${s.shotId}.png`)).filter((f) => fs.existsSync(f));
  const board = path.join(p.out, 'board.jpg');
  if (stills.length) {
    const cols = 5;
    const rows = Math.ceil(stills.length / cols);
    const pad = cols * rows - stills.length;
    const inputs = [...stills.flatMap((f) => ['-i', f]), ...Array.from({ length: pad }, () => ['-f', 'lavfi', '-i', 'color=c=0x111111:s=1920x1080:d=1']).flat()];
    const n = stills.length + pad;
    const filter = Array.from({ length: n }, (_, i) => `[${i}]scale=480:270[t${i}]`).join(';') + ';' +
      Array.from({ length: n }, (_, i) => `[t${i}]`).join('') + `xstack=inputs=${n}:layout=${Array.from({ length: n }, (_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|')}`;
    ff([...inputs, '-filter_complex', filter, '-frames:v', '1', '-q:v', '3', board]);
  }
  const blackPause = new Set(Object.values(beats).filter((b) => /black/.test(`${b.in || ''} ${b.out || ''}`) || (b.design?.devices || []).includes('black-pause')).map((b) => b.beat));
  const chapterOf = Object.fromEntries(shots.map((s) => [s.shotId, s.slots?.background?.chapter || null]));
  const ends = seamEnds(pieces).map((e) => ({ ...e, chapter: chapterOf[e.id], join: beats[e.id]?.in || 'cut', out: beats[e.id]?.out || 'cut' }));
  const seams = [...seamProblems(ends).filter((x) => !blackPause.has(x.split('>')[0]) && !blackPause.has(x.split('>')[1]?.split(':')[0])), ...seamEmpties(ends, { blackPause }), ...seamJerks(ends, { blackPause })];
  return { kept, seams, reel: pieces.length ? out : null, board: stills.length ? board : null, shots: pieces.length, missing, voiced };
}
