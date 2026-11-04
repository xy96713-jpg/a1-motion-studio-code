// The whole film of a project made of passages: its passages joined in order, the 1 fps overview sheets of ours and of
// the reference on the same clock, and the profile of the two (refprofile.mjs) with the seams between passages.
// `rough` joins the passages' white models (12 fps, half size, `<seg>-animatic.mp4`) instead of their fine renders: a
// round of fixes is reviewed on the rough film and the fine render is made once, when the film is to be watched (user
// 2026-10-24: 那么久啊跑一次 — every round had rendered the fine film, an hour a round).
// This is a packaging system (user 2026-10-25: 不用管我口播 … 作为我包装系统): the presenter's own shots are the
// author's to film and cut; the profile is given for the whole film and for the packaging alone, the presenter's seconds
// left out, and a review holds the packaging to the reference on the packaging's seconds.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectPaths, loadProject } from './store.mjs';
import { assertScopeAllows } from './project-scope.mjs';
import { profileVideo, window, profileGaps } from './refprofile.mjs';
import { passageShots } from './layers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);

// (pure) the passages' shots on the film's clock: [{ seg, id, at, end, presenter }] from their accepted plans
export function filmShots(plans) {
  return plans.flatMap(({ seg, shots }) => (shots || []).map((s) => { let spec = {}; try { spec = JSON.parse(s.spec); } catch {}
    return { seg, id: s.id, at: s.at, end: s.end, presenter: !!spec.presenter }; })).sort((a, b) => a.at - b.at);
}
// (pure) the summary of a profile's seconds outside the presenter's shots (the packaging alone)
export function packagingWindow(profile, shots, { from = 0, to = Infinity } = {}) {
  const pres = shots.filter((s) => s.presenter), inPres = (t) => pres.some((s) => t + .5 > s.at && t + .5 < s.end);
  return window({ seconds: (profile?.seconds || []).filter((r) => !inPres(r.t)) }, from, to);
}
// (pure) the faults the picture reviews saw and let stand: a reviewer passes a shot that changed if it is no worse than
// the version that passed, and writes what both versions share in its notes (stillcheck.md); those notes were read by
// no one, and the same faults stood round after round (hupo-auto2, 2026-10-25: 像PPT, 下半空, 不动 in a dozen passes).
// Gathered by kind for the whole film, they are the next round's design work, done as a kind, not shot by shot.
export const STANDING = [
  // (a fault, not the word: "浅景深更强" in a pass's praise counted as a slide, film report 2026-10-25)
  ['slide', '像幻灯片、层次少（缺景深、叠层）', /PPT|幻灯片|像模板|平铺|(缺|少了?|没有|不够)[^，。；]{0,6}(层次|景深|叠层)|(层次|景深)[^，。；]{0,4}(少|弱|偏平|不足)/],
  ['bottom', '下半部空、整体偏上', /下半|下三分之一|偏上|头重脚轻|下方[^，。；]{0,6}空|左下[^，。；]{0,4}空/],
  ['static', '不动、推进弱', /不动|没动|推进感?弱|推进稍少|静止|基本没变/],
  ['plain', '偏素、缺色彩点缀', /偏素|单调|色彩点缀|颜色点缀|全是灰白|灰白字/],
  ['edge', '贴边、被切', /贴着|贴边|切掉|被上沿|贴[左右]沿|半截/],
];
export function standingFaults(entries) {
  return STANDING.map(([kind, label, re]) => ({ kind, label, shots: entries.flatMap((e) => { const c = String(e.notes || '').split(/[。；;]/).find((x) => re.test(x)); return c ? [{ seg: e.seg, id: e.id, note: c.trim().slice(0, 80) }] : []; }) })).filter((k) => k.shots.length);
}
// (pure) the shots with no soft layer where the reference has one (depth.py rows): the reference a tenth or more of its
// frame textured but soft, ours under 40 % of that
export const FLAT = { ref: .1, share: .4 };
export const flatShots = (rows) => rows.filter((r) => r.ref.soft >= FLAT.ref && r.ours.soft < r.ref.soft * FLAT.share);
// a video's frame rate (ffprobe's r_frame_rate, 30/1)
export function fpsOf(video) { const o = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', video], { encoding: 'utf8' }).stdout.trim(), [a, b] = o.split('/').map(Number); return Math.round(b ? a / b : a) || 60; }
// (pure) the seams: where each passage starts on the film's clock
export const seamsOf = (shots) => [...new Set(shots.map((s) => s.seg))].slice(1).map((g) => shots.find((s) => s.seg === g).at);

export function buildFilm(cfg, id, { rough = false, log = () => {} } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'final');
  const P = projectPaths(cfg, id), project = readJson(path.join(P.root, 'project.json'), {}), segs = (project.passages || []).map((g) => g.seg);
  if (!segs.length) return buildBeatFilm(cfg, id, { rough, log });
  const out = path.join(P.root, 'out', 'film'), tag = rough ? '-rough' : ''; fs.mkdirSync(out, { recursive: true });
  const parts = segs.map((g) => path.join(P.root, 'out', 'passages', g, rough ? `${g}-animatic.mp4` : `${g}.mp4`));
  const missing = parts.filter((f) => !fs.existsSync(f)); if (missing.length) throw new Error(`not rendered yet: ${missing.map((f) => path.basename(f)).join(', ')}`);
  const list = path.join(out, `list${tag}.txt`), film = path.join(out, `${id}-film${tag}.mp4`);
  fs.writeFileSync(list, parts.map((f) => `file '${f}'`).join('\n') + '\n');
  let r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', film]);
  if (r.status) throw new Error(`join: ${String(r.stderr).split('\n')[0]}`);
  log(`film ${film}`);
  // the overview sheets, ours and the reference's (made once)
  const sheets = path.join(out, `sheets-ours${tag}`); fs.rmSync(sheets, { recursive: true, force: true }); fs.mkdirSync(sheets, { recursive: true });
  // (one cell a second at the video's own rate: the rough film is 12 fps, and stepped by 60 frames its cells were 5 s
  // apart under 1 s labels, film review 18)
  r = spawnSync('python3', [path.join(HERE, 'filmsheets.py'), film, sheets, String(fpsOf(film))]); if (r.status) throw new Error(`sheets: ${String(r.stderr).split('\n').pop()}`);
  const refVideo = project.sourceVideo && path.resolve(cfg.repoRoot, project.sourceVideo), refSheets = path.join(out, 'sheets-ref');
  if (refVideo && fs.existsSync(refVideo) && !fs.existsSync(path.join(refSheets, 'sheet-01.jpg'))) { fs.mkdirSync(refSheets, { recursive: true }); spawnSync('python3', [path.join(HERE, 'filmsheets.py'), refVideo, refSheets, String(fpsOf(refVideo))]); }
  // the profile: the whole film and the packaging alone, against the reference over the same seconds
  const plans = segs.map((g) => ({ seg: g, shots: readJson(path.join(P.root, 'tasks', `shotplan-${g}.answer.json`), {}).shots }));
  const shots = filmShots(plans), dur = shots.at(-1)?.end ?? Infinity;
  fs.rmSync(path.join(out, `profile-ours${tag}`), { recursive: true, force: true });
  const ours = profileVideo(film, path.join(out, `profile-ours${tag}`), { width: rough ? 960 : 1920 });
  const ref = refVideo && fs.existsSync(refVideo) ? profileVideo(refVideo, path.join(out, 'profile-ref')) : null;
  const lines = [];
  const both = (label, a, b) => { lines.push(`${label} ours      ${JSON.stringify(a)}`); if (b) { lines.push(`${label} reference ${JSON.stringify(b)}`); for (const g of profileGaps(a, b)) lines.push(`${label} short: ${g}`); } };
  both('[film]', window(ours), ref && window(ref, 0, dur));
  both('[packaging, the presenter\'s shots left out]', packagingWindow(ours, shots), ref && packagingWindow(ref, shots, { to: dur }));
  lines.push('seams (fill a second before / after, ours):');
  const at = (t) => (ours.seconds || []).find((s) => Math.abs(s.t - t) < .51);
  for (const s of seamsOf(shots)) { const x = at(s - .5), y = at(s + .5); lines.push(`  ${s} s: ${JSON.stringify(x && { fill: x.fill, moving: x.moving })} | ${JSON.stringify(y && { fill: y.fill, moving: y.moving })}`); }
  // depth, shot by shot, on the packaging (depth.py)
  if (refVideo && fs.existsSync(refVideo)) { const pk = path.join(out, `depth-shots${tag}.json`); fs.writeFileSync(pk, JSON.stringify(shots.filter((x) => !x.presenter)));
    const d = spawnSync('python3', [path.join(HERE, 'depth.py'), film, refVideo, pk], { encoding: 'utf8', maxBuffer: 1 << 24 });
    if (!d.status) { const rows = d.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)), flat = flatShots(rows), m = (k, w) => (rows.reduce((a, r) => a + r[w][k], 0) / Math.max(1, rows.length)).toFixed(3);
      lines.push(`depth (textured-but-soft share, packaging): ours ${m('soft', 'ours')}, reference ${m('soft', 'ref')}; flat where the reference has a soft layer: ${flat.length} shots`);
      for (const r of flat) lines.push(`  flat: ${r.seg}/${r.id} ours ${r.ours.soft} where the reference ${r.ref.soft}`); } }
  // the faults the picture reviews let stand, by kind
  const debts = standingFaults(segs.flatMap((g) => { const rv = readJson(path.join(P.root, 'out', 'passages', g, 'reviews.json'), {}); return passageShots(cfg, id, g).map((x) => ({ seg: g, id: x.id, notes: rv[x.hash]?.notes })); }));
  lines.push('standing faults (seen by the picture reviews and let stand on a pass; the next round\'s design work, by kind):');
  for (const k of debts) { lines.push(`  ${k.label}: ${k.shots.length} shots`); for (const x of k.shots) lines.push(`    ${x.seg}/${x.id}: ${x.note}`); }
  fs.writeFileSync(path.join(out, `profile-gaps${tag}.txt`), lines.join('\n') + '\n');
  for (const l of lines.slice(0, 6)) log(l);
  return { film, sheets, gaps: path.join(out, `profile-gaps${tag}.txt`) };
}

// (pure) a film of storyboard beats against the reference: each beat's stretch of the reference runs from the moment the
// reference says the beat's words to the moment it says the next beat's (the last to the end of its own words), so the
// two clocks meet at every beat; a beat the reference does not time starts where the beat before it stops speaking
// (paperclip-138 times every beat but B09: B08's words end at 52.0 s, B10's begin at 65.5 s)
export function alignBeats(beats, times) {
  const start = beats.map((b, k) => times[b.beat]?.[0] ?? (k ? times[beats[k - 1].beat]?.[1] : 0));
  for (let k = 1; k < start.length; k++) if (start[k] == null) start[k] = start[k - 1];
  let from = 0;
  return beats.map((b, k) => { const r0 = start[k], r1 = k < beats.length - 1 ? start[k + 1] : (times[b.beat]?.[1] ?? r0 + b.seconds);
    const x = { beat: b.beat, from: +from.toFixed(3), seconds: b.seconds, reference: [r0, Math.max(r1, r0 + 0.1)] }; from += b.seconds; return x; });
}
// (pure) the beats that stand thin: THIN_RUN seconds or more in a row where the reference fills its frame (fill above
// 0.1) and ours carries under THIN of it (whole-film review 2026-10-25: B27 and B29 stood 4-7 s near empty before their
// subject came; the per-beat check saw only beats sent for review, and passed beats are kept)
export const THIN = 0.5, THIN_RUN = 3;
export function thinBeats(aligned, ours, ref) {
  const at = (p, t) => (p?.seconds || []).find((r) => Math.abs(r.t - t) < 0.51), mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, out = [];
  for (const a of aligned) {
    let run = [], best = [];
    for (let t = Math.ceil(a.from); t < a.from + a.seconds; t++) { const o = at(ours, t), r = at(ref, t); if (o && r && r.fill > 0.1 && o.fill < THIN * r.fill) { run.push({ t, o: o.fill, r: r.fill }); if (run.length > best.length) best = [...run]; } else run = []; }
    if (best.length >= THIN_RUN) out.push({ beat: a.beat, owner: a.owner, at: mmss(best[0].t), seconds: best.length, ours: +(best.reduce((x, y) => x + y.o, 0) / best.length).toFixed(2), ref: +(best.reduce((x, y) => x + y.r, 0) / best.length).toFixed(2) });
  }
  return out;
}
// a project of storyboard beats (chapters and cards, out/animatic.mp4 or out/reel.mp4) is reviewed the same way: the
// reference cut beat by beat onto our clock (project.json reference.video, reference.beatTimes), the overview sheets of
// both, the profile and the chapter seams (2026-10-25: paperclip-138-full's whole-film reviews were laid out by hand)
function buildBeatFilm(cfg, id, { rough, log }) {
  const P = projectPaths(cfg, id), project = readJson(path.join(P.root, 'project.json'), {}), tag = rough ? '-rough' : '';
  const film = path.join(P.root, 'out', rough ? 'animatic.mp4' : 'reel.mp4'); if (!fs.existsSync(film)) throw new Error(`not rendered yet: ${path.basename(film)}${rough ? ' (animatic)' : ' (reel)'}`);
  const out = path.join(P.root, 'out', 'film'); fs.mkdirSync(out, { recursive: true });
  const shots = (readJson(path.join(P.root, 'storyboard.json'), {}).shots || []);
  const piece = (b) => path.join(P.root, 'out', 'animatic', 'pieces', `${b}.mp4`), dur = (f) => +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim();
  const beats = shots.map((s) => ({ beat: s.beat, seconds: rough && fs.existsSync(piece(s.beat)) ? dur(piece(s.beat)) : s.seconds }));
  const sheets = path.join(out, `sheets-ours${tag}`); fs.rmSync(sheets, { recursive: true, force: true }); fs.mkdirSync(sheets, { recursive: true });
  let r = spawnSync('python3', [path.join(HERE, 'filmsheets.py'), film, sheets, String(fpsOf(film))]); if (r.status) throw new Error(`sheets: ${String(r.stderr).split('\n').pop()}`);
  log(`film ${film}`);
  const ref = project.reference || {}, refVideo = ref.video && path.resolve(cfg.repoRoot, ref.video), times = ref.beatTimes && readJson(path.resolve(cfg.repoRoot, ref.beatTimes), null);
  const lines = [];
  const ours = profileVideo(film, path.join(out, `profile-ours${tag}`), { width: rough ? 960 : 1920 });
  if (refVideo && fs.existsSync(refVideo) && times) {
    // each beat with the chapter module that draws it (the reviewer names its owner: morph-<chapter>)
    const chapterOf = Object.fromEntries(Object.entries(readJson(path.join(P.root, 'out', 'animatic', 'report.json'), {}).chapters || {}).flatMap(([c, x]) => (x.beats || []).map((b) => [b, `morph-${c}`])));
    const aligned = alignBeats(beats, times).map((a) => ({ ...a, owner: chapterOf[a.beat] || 'storyboard' })); fs.writeFileSync(path.join(out, `beats${tag}.json`), JSON.stringify({ beats: aligned }, null, 1) + '\n');
    const refFilm = path.join(out, `ref-aligned${tag}.mp4`), key = JSON.stringify(aligned.map(({ owner, ...a }) => a)), keyFile = refFilm + '.key';
    if (!fs.existsSync(refFilm) || readJson(keyFile, null)?.key !== key) {
      const parts = aligned.map((a, k) => `[0:v]trim=${a.reference[0]}:${a.reference[1]},setpts=(PTS-STARTPTS)*${(a.seconds / (a.reference[1] - a.reference[0])).toFixed(5)},fps=15,scale=960:540,setsar=1[v${k}]`);
      const graph = `${parts.join(';')};${aligned.map((_, k) => `[v${k}]`).join('')}concat=n=${aligned.length}:v=1:a=0[out]`;
      r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', refVideo, '-filter_complex', graph, '-map', '[out]', '-an', '-c:v', 'libx264', '-crf', '23', refFilm]);
      if (r.status) throw new Error(`reference: ${String(r.stderr).split('\n')[0]}`);
      fs.writeFileSync(keyFile, JSON.stringify({ key }));
    }
    const refSheets = path.join(out, `sheets-ref${tag}`); fs.rmSync(refSheets, { recursive: true, force: true }); fs.mkdirSync(refSheets, { recursive: true });
    spawnSync('python3', [path.join(HERE, 'filmsheets.py'), refFilm, refSheets, '15']);
    const refP = profileVideo(refFilm, path.join(out, `profile-ref${tag}`), { width: 960 });
    lines.push(`[film] ours      ${JSON.stringify(window(ours))}`, `[film] reference ${JSON.stringify(window(refP))}`, ...profileGaps(window(ours), window(refP)).map((g) => `[film] short: ${g}`));
    const thin = thinBeats(aligned, ours, refP); lines.push(...(thin.length ? thin.map((x) => `thin: ${x.beat} (${x.owner}) ${x.at} for ${x.seconds} s: ours fills ${x.ours} where the reference fills ${x.ref}`) : ['thin: none']));
  } else lines.push(`[film] ours      ${JSON.stringify(window(ours))}`, '(no reference: project.json reference.video and reference.beatTimes)');
  const seams = readJson(path.join(P.root, 'out', 'animatic', 'report.json'), {}).seams || [];
  lines.push(`seams: ${seams.length ? JSON.stringify(seams) : 'none open'}`);
  fs.writeFileSync(path.join(out, `profile-gaps${tag}.txt`), lines.join('\n') + '\n');
  for (const l of lines.slice(0, 4)) log(l);
  return { film, sheets, gaps: path.join(out, `profile-gaps${tag}.txt`) };
}
