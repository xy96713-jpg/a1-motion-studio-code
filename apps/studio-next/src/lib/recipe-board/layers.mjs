// The four layers of a passage (the user, 2026-10-21: 总不能跑半天跑出低质量的结果; the SOP of motion design studios):
// each layer is an order of magnitude dearer than the one before, so what can be decided cheaply is decided there.
//   1 direction  the film's look, decided once: a reference film sets it (reference mode), else design frames the user
//                approves (project.direction.approved)
//   2 sheet      every shot of an accepted plan as three key frames beside the reference's frames at the same moments
//                (seconds a shot); a code check for empty frames, then a picture review (agent task stillcheck-<seg>,
//                rules prompts/stillcheck.md): problems go back to the shot director as errors to fix
//   3 animatic   the passage at 12 fps with the voice, beside the reference: the timing and the cuts, cheaply
//   4 final      60 fps, motion blur, sound (shotplan.renderPassage), only for a passage whose sheet passed
// Reviews are kept per shot by the hash of its spec (out/passages/<seg>/reviews.json): a revised shot is looked at
// again, an unchanged one keeps its verdict.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertRenderStorage, projectPaths, loadProject, sourcePath } from './store.mjs';
import { assertScopeAllows } from './project-scope.mjs';
import { sixStage, lookOpen } from './gatestate.mjs';
import { withoutSection } from './reviewrules.mjs';
import { writeTask, readAnswer, writeCheck, taskPaths, agentFor, runCodexTask } from './agenttask.mjs';
import { renderModule, besideReference, refCheck, phraseErrors, checkModuleSpec } from './modules.mjs';
// modules whose whole frame is theirs (their motion is measured against the reference's; a presenter shot's is not)
const MOTION_MODULES = new Set(['article', 'compare', 'table', 'chat', 'brand', 'insert', 'title', 'quote', 'steps', 'chart', 'screen', 'person']);

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const PY = (cfg) => process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
const dirs = (cfg, id, seg) => { const root = projectPaths(cfg, id).root; return { plan: path.join(root, 'modules', seg), out: path.join(root, 'out', 'passages', seg) }; };
// a shot's identity: its spec, the code of the module that draws it (its page and modules.mjs, which prepares it: a
// fix to the article reflow left a stale verdict on open-S2) and the code that checks it (a module fixed after
// a review, or a check added, is looked at again on every shot it touches)
// (user, 2026-10-22: 有点慢啊 有没有办法提速): of modules.mjs only the lines that prepare or check this module (the lines
// naming it) and its shared version (PREP_VERSION, raised by a change to what every module shares: the encode, the
// page set-up) count; the whole file did, and a fix to one module re-rendered every shot of every passage
const moduleCode = new Map();
export const prepLines = (src, m) => [...new Set([m, ({ insert: 'brand' })[m] || m])].flatMap((k) => src.split('\n').filter((l) => l.includes(`'${k}'`) || /PREP_VERSION =/.test(l))).join('\n');
// (pure, tested) the lettering's part of modules.mjs — the faces every page is set in (latinMatched, letterFaces, evaLacks):
// a stamp of only the module's own lines left them out, and a passage drew its sheets again in the face it had before,
// meta after 装甲明朝 gave way to 黒華明朝 (2026-10-26)
export const letterStamp = (src) => { const a = src.indexOf('export const LATIN_ADJUST'), b = src.indexOf('export const pageCode'); return a >= 0 && b > a ? src.slice(a, b) : ''; };
export function moduleStamp(cfg, m) {
  if (!moduleCode.has(m)) { const dir = path.join(cfg.dataDir, 'modules'), here = path.dirname(new URL(import.meta.url).pathname), read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
    moduleCode.set(m, sha([...[`${({ insert: 'brand' })[m] || m}.html`, 'common.js', 'marks.js', 'camera.js', 'treat.js'].map((f) => read(path.join(dir, f))), read(path.join(here, 'framecheck.mjs')), read(path.join(here, 'cardgeometry.mjs')), read(path.join(here, 'labels.mjs')), read(path.join(cfg.dataDir, 'routing', 'props.json')), prepLines(read(path.join(here, 'modules.mjs')), m), letterStamp(read(path.join(here, 'modules.mjs'))), read(path.join(here, 'tallface.py')), process.env.RB_LETTERING || '', read(path.join(here, 'house.mjs')), m === 'market' ? read(path.join(here, 'market.mjs')) : ''].join())); }
  return moduleCode.get(m);
}
// a shot drawn on another's last picture (ground or bg { after: <its module file> }: a continuation or a recall) is as new
// as that shot and the code that draws it: the recap's 人員 kept its old verdict after talent S2's picture was drawn
// whole, its own spec unchanged (review 97)
export function afterStamp(cfg, spec, seen = new Set()) {
  const files = []; JSON.stringify(spec, (k, v) => { if (k === 'after' && typeof v === 'string') files.push(v); return v; });
  if (!files.length) return '';
  const here = path.dirname(new URL(import.meta.url).pathname), code = fs.readFileSync(path.join(here, 'modules.mjs'), 'utf8').split('\n').filter((l) => l.includes('afterStill')).join('\n');
  return sha(code + files.map((f) => { if (seen.has(f) || !fs.existsSync(f)) return f; seen.add(f); const p = JSON.parse(fs.readFileSync(f, 'utf8')); return JSON.stringify(p) + moduleStamp(cfg, p.module) + afterStamp(cfg, p, seen); }).join());
}
export function passageShots(cfg, id, seg) {
  const d = dirs(cfg, id, seg).plan;
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => { const spec = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); return { id: f.replace(/\.json$/, ''), spec, hash: sha(JSON.stringify(spec) + moduleStamp(cfg, spec.module) + afterStamp(cfg, spec)) }; }).sort((a, b) => a.spec.at - b.spec.at);
}

// ---------------------------------------------------------------- 1 direction

export function directionState(cfg, id, g) {
  const p = loadProject(cfg, id);
  // a six-stage film: the film's look gate (gates.mjs), for the chapters and the cards alike; these frames go on its sheet
  if (sixStage(p)) return lookOpen(cfg, id) ? { state: 'approved' } : { state: 'waiting', sheet: path.join(projectPaths(cfg, id).root, 'out', 'direction', 'sheet.jpg') };
  if (p.sourceVideo && !g?.blind && p.referenceInventory) return { state: 'reference' };
  if (p.direction?.approved) return { state: 'approved' };
  if (p.sourceVideo && p.referenceInventory) return { state: 'reference' };   // a blind test of a film with a reference: the reference's look
  return { state: 'waiting', sheet: path.join(projectPaths(cfg, id).root, 'out', 'direction', 'sheet.jpg') };
}
// design frames for a new film: the first shot of each module the first passage uses, at its full look, on one sheet
export async function directionFrames(cfg, id, seg, { log = () => {} } = {}) {
  assertRenderStorage(cfg, id);
  const out = path.join(projectPaths(cfg, id).root, 'out', 'direction'); fs.mkdirSync(out, { recursive: true });
  const seen = new Set(), files = [];
  for (const s of passageShots(cfg, id, seg)) { if (seen.has(s.spec.module) || seen.size >= 5) continue; seen.add(s.spec.module);
    const t = s.spec.at + (s.spec.end - s.spec.at) * .7; const r = await renderModule(cfg, id, s.spec, path.join(out, s.id), { stills: [t] }); files.push(...r.stills); log(`  design frame: ${s.id} ${s.spec.module}`); }
  const sheet = path.join(out, 'sheet.jpg');
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}]scale=960:-2[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % 2) ? 'w0' : '0'}_${Math.floor(i / 2) ? Array.from({ length: Math.floor(i / 2) }, () => 'h0').join('+') : '0'}`).join('|')}:fill=black`, sheet]);
  return sheet;
}

// ---------------------------------------------------------------- 2 the sheet and the picture review

// three moments a shot is judged at: just after its first thing lands, the middle, near the end
export const ADVISORY_KINDS = ['look', 'type'];
export const keyTimes = (s) => { const d = s.end - s.at; return [s.at + Math.min(.9, d * .3), s.at + d * .6, s.end - Math.min(.25, d * .1)].map((t) => +t.toFixed(2)); };
// a frame that shows next to nothing (a page that did not draw, a missing picture): its luminance barely varies
export function emptyFrames(cfg, files) {
  const code = "import cv2,sys,json\nprint(json.dumps([round(float(cv2.cvtColor(cv2.imread(f),cv2.COLOR_BGR2GRAY)[60:900].std()),1) for f in sys.argv[1:]]))";
  const r = spawnSync(PY(cfg), ['-c', code, ...files], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout).map((sd, i) => ({ file: files[i], sd, empty: sd < 9 })); } catch { return files.map((file) => ({ file, sd: null, empty: false })); }
}
// (pure) a drawing failure that passes on its own: a timeout, a browser or page gone, the network
export const TRANSIENT = /timeout|timed out|target (page|closed)|browser has been closed|ECONNRESET|ECONNREFUSED|net::ERR_/i;
export async function stillSheet(cfg, id, seg, { log = () => {} } = {}) {
  assertRenderStorage(cfg, id);
  const { out } = dirs(cfg, id, seg), sd = path.join(out, 'sheet'); fs.mkdirSync(sd, { recursive: true });
  const src = sourcePath(cfg, loadProject(cfg, id).sourceVideo || ''), hasRef = src && fs.existsSync(src);
  // a few shots at once (pool.mjs, as memory allows; user, 2026-10-22: 有什么办法能跑更快呢): each draws in its own
  // browser, their sheets kept in the plan's order
  const list = passageShots(cfg, id, seg), slots = new Array(list.length), { pool } = await import('./pool.mjs');
  const done = await pool(list, async (s, k) => {
    const file = path.join(sd, `${s.id}-${s.hash}.jpg`), times = keyTimes(s.spec);
    // (a shot that could not be drawn for a passing reason — a timeout, a browser gone — is drawn again on the next run,
    // never kept as a verdict: h800-S2's screenshot timed out once and held the passage as refused)
    const was = readJson(file.replace(/\.jpg$/, '.json'), {});
    if (!fs.existsSync(file) && (!was.failed || was.transient)) {
      // the code's checks first (modules.mjs, framecheck.mjs): a shot they fail is still drawn for the sheet, its
      // problems filed as the code's verdict
      let problems = [], r;
      try { r = await renderModule(cfg, id, s.spec, path.join(sd, `${s.id}-${s.hash}`), { stills: times }); }
      catch (e) {
        // a shot that cannot be drawn at all (a phrase gone from the reflowed page: cards-S5) is that shot's problem,
        // back to its director; the run goes on to the next shot (it stopped the whole passage)
        if (!e.problems) { const why = String(e.message || e).split('\n')[0].slice(0, 300); fs.writeFileSync(file.replace(/\.jpg$/, '.json'), JSON.stringify({ shot: s.id, hash: s.hash, times, empty: [], problems: [{ kind: 'other', at: s.spec.at, say: `it could not be drawn: ${why}`, owner: 'plan' }], failed: true, transient: TRANSIENT.test(why) }) + '\n');
          log(`  sheet ${s.id} (${s.spec.module})  could not be drawn: ${why}`); slots[k] = { id: s.id, module: s.spec.module, at: s.spec.at, end: s.spec.end, hash: s.hash, file, ...readJson(file.replace(/\.jpg$/, '.json'), {}) }; return; }
        problems = e.problems; r = await renderModule(cfg, id, s.spec, path.join(sd, `${s.id}-${s.hash}`), { stills: times, checks: false }); }
      const refs = hasRef ? times.map((t, i) => { const f = path.join(sd, `${s.id}-ref-${i}.jpg`); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(t), '-i', src, '-frames:v', '1', '-vf', 'scale=640:-2', f]); return f; }) : [];
      const empty = emptyFrames(cfg, r.stills);
      // ours on top, the reference under it at the same moments, the time on each
      const lab = (txt) => `drawtext=fontfile='/System/Library/Fonts/STHeiti Medium.ttc':text='${txt}':x=10:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@.6`;
      const ins = [...r.stills, ...refs], n = r.stills.length;
      const filt = ins.map((_, i) => `[${i}]scale=640:360,${lab(`${i < n ? s.id : '对标'} ${times[i % n].toFixed(1)}s`)}[v${i}]`).join(';') + `;${ins.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${ins.length}:layout=${ins.map((_, i) => `${i % n ? Array.from({ length: i % n }, () => 'w0').join('+') : '0'}_${i >= n ? 'h0' : '0'}`).join('|')}`;
      spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...ins.flatMap((f) => ['-i', f]), '-filter_complex', filt, '-q:v', '3', file]);
      // ours alone too: what the director of a blind passage may look at (the beside sheet is the reviewer's)
      spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...r.stills.flatMap((f) => ['-i', f]), '-filter_complex', r.stills.map((_, i) => `[${i}]scale=640:360,${lab(`${s.id} ${times[i].toFixed(1)}s`)}[v${i}]`).join(';') + `;${r.stills.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${n}`, '-q:v', '3', file.replace(/\.jpg$/, '-ours.jpg')]);
      for (const f of r.stills) fs.rmSync(f, { force: true });
      fs.writeFileSync(file.replace(/\.jpg$/, '.json'), JSON.stringify({ shot: s.id, hash: s.hash, times, empty: empty.filter((e) => e.empty).map((e, i) => times[empty.indexOf(e)]), problems }) + '\n');
      log(`  sheet ${s.id} (${s.spec.module})${empty.some((e) => e.empty) ? '  EMPTY FRAME' : ''}${problems.length ? `  ${problems.length} problems found by the checks` : ''}`);
    }
    slots[k] = { id: s.id, module: s.spec.module, at: s.spec.at, end: s.spec.end, hash: s.hash, file, ...readJson(file.replace(/\.jpg$/, '.json'), {}) };
  });
  const bad = done.find((x) => x.error); if (bad) throw bad.error;   // (an error the shot's own problems do not hold)
  const shots = slots.filter(Boolean);
  // the whole passage on one page (one row a shot), for the user's glance; a blind passage's page shows ours alone
  // (the cards director, blind until then, saw the reference on the sheet beside his shots: the test ended there)
  const page = path.join(out, 'sheet.jpg'), blind = !!(loadProject(cfg, id).passages || []).find((g) => g.seg === seg)?.blind;
  const rowOf = (s) => (blind && fs.existsSync(s.file.replace(/\.jpg$/, '-ours.jpg')) ? s.file.replace(/\.jpg$/, '-ours.jpg') : s.file);
  const drawn = shots.filter((s) => fs.existsSync(s.file));
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...drawn.flatMap((s) => ['-i', rowOf(s)]), '-filter_complex', `${drawn.map((_, i) => `[${i}]scale=1440:-2[v${i}]`).join(';')};${drawn.map((_, i) => `[v${i}]`).join('')}vstack=inputs=${drawn.length}`, '-q:v', '4', page]);
  return { shots, page };
}

// one shot tried before the plan is handed in (user, 2026-10-22: 调字什么的又浪费很久): the shot as the director's answer
// has it now, with changes laid over it (set), drawn at its key frames (or at times) beside the reference, and the
// code's checks run on it; nothing is written to the plan. Seconds, where the passage's sheet and white model took
// minutes for every try of a size or a framing.
export async function tryShot(cfg, id, seg, shotId, { set = {}, times = null } = {}) {
  assertRenderStorage(cfg, id);
  const { themeOf } = await import('./shotplan.mjs'), P = taskPaths(cfg, id, `shotplan-${seg}`), answer = JSON.parse(fs.readFileSync(P.answer, 'utf8'));
  const s = (answer.shots || []).find((x) => x.id === shotId);
  if (!s) throw new Error(`${seg}: no shot ${shotId} in the answer`);
  const { readCard } = await import('./breakdown.mjs'), { withRefDesign, withRefMotion, passageCarry } = await import('./shotplan.mjs');
  const { applyCamGain, camGainsOf } = await import('./shotplan.mjs'), card = readCard(cfg, id, seg);
  // (what the passage carries across its cuts onto this shot, as the accepted plan's modules have it: shotplan passageCarry)
  const carried = passageCarry((answer.shots || []).flatMap((x) => { try { return [{ id: x.id, spec: { ...JSON.parse(x.spec), module: x.module, at: x.at, end: x.end } }]; } catch { return []; } }), card)[shotId] || {};
  const spec = { ...applyCamGain(withRefMotion(withRefDesign({ theme: themeOf(answer, loadProject(cfg, id)?.style), ...JSON.parse(s.spec), ...carried, module: s.module, at: s.at, end: s.end }, card), card, answer.follows), camGainsOf(cfg, id, seg)[shotId]), ...set };
  // (a shot that goes on drawing another is tried on that one as the answer now has it, not as last written: r1-S8 was
  // tried on S7's old framing)
  { const { continueFrom } = await import('./shotplan.mjs'), prevId = spec.ground?.src?.shot; let from = path.join(projectPaths(cfg, id).root, 'modules', seg);
    const p = prevId && (answer.shots || []).find((x) => x.id === prevId);
    if (p) { from = path.join(dirs(cfg, id, seg).out, 'try', 'prev'); fs.mkdirSync(from, { recursive: true });
      fs.writeFileSync(path.join(from, `${prevId}.json`), JSON.stringify(applyCamGain(withRefMotion(withRefDesign({ theme: themeOf(answer, loadProject(cfg, id)?.style), ...JSON.parse(p.spec), module: p.module, at: p.at, end: p.end }, card), card, answer.follows), camGainsOf(cfg, id, seg)[prevId]), null, 1)); }
    Object.assign(spec, continueFrom(spec, from)); }
  for (const [k, v] of Object.entries(set)) if (v === null) delete spec[k];
  const ts = times || keyTimes(spec), dir = path.join(dirs(cfg, id, seg).out, 'try'); fs.mkdirSync(dir, { recursive: true });
  let problems = [], r;
  try { r = await renderModule(cfg, id, spec, path.join(dir, shotId), { stills: ts }); }
  catch (e) { if (!e.problems) throw e; problems = e.problems; r = await renderModule(cfg, id, spec, path.join(dir, shotId), { stills: ts, checks: false }); }
  const src = sourcePath(cfg, loadProject(cfg, id).sourceVideo || ''), refs = src && fs.existsSync(src) ? ts.map((t, i) => { const f = path.join(dir, `${shotId}-ref-${i}.jpg`); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(t), '-i', src, '-frames:v', '1', '-vf', 'scale=640:-2', f]); return f; }) : [];
  const ins = [...r.stills, ...refs], n = r.stills.length, file = path.join(dir, `${shotId}.jpg`);
  const filt = ins.map((_, i) => `[${i}]scale=640:360[v${i}]`).join(';') + `;${ins.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${ins.length}:layout=${ins.map((_, i) => `${(i % n) * 640}_${i >= n ? 360 : 0}`).join('|')}`;
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...ins.flatMap((f) => ['-i', f]), '-filter_complex', filt, '-q:v', '3', file]);
  // (its page phrases too, as the plan check reads them: a headline matched only in part was tried and passed, cards-S5)
  // (and the spec's own rules: a camera that leaves the frame uncovered was tried and passed, then refused by the plan, talent-S3)
  const { notSourceErrors } = await import('./materials.mjs');
  const said = (e) => ({ kind: 'other', at: null, say: e, owner: 'plan' });   // (the spec's and the page's errors are words: printed as "undefined")
  return { file, problems: [...[...checkModuleSpec(spec), ...phraseErrors(cfg, spec), ...notSourceErrors(cfg, id, spec)].map(said), ...problems], spec, stills: r.stills };
}

const reviewsFile = (cfg, id, seg) => path.join(dirs(cfg, id, seg).out, 'reviews.json');
export const PROBLEMS = ['unreadable', 'bad-mark', 'overlap', 'off-frame', 'empty', 'wrong-material', 'unlike-reference', 'weak-design', 'other'];
// the review of the sheet: shots without a verdict for their current hash go to the agent (pictures in the task)
// (pure) the average PSNR ffmpeg's psnr filter prints, in dB (Infinity for identical pictures); null when it printed none
export const SHEET_SAME = 45;
export function psnrOf(stderr) { const m = [...String(stderr).matchAll(/average:(inf|[\d.]+)/g)].at(-1); return m ? (m[1] === 'inf' ? Infinity : +m[1]) : null; }
export async function stillReview(cfg, id, seg, { log = () => {} } = {}) {
  const step = `stillcheck-${seg}`, P = taskPaths(cfg, id, step), reviews = readJson(reviewsFile(cfg, id, seg), {});
  // an answer is kept for the versions it looked at, before any new sheet is made (a shot changed since is looked at
  // again; its old verdict stays filed under its old version)
  { const t0 = readJson(P.task, null), a0 = readAnswer(cfg, id, step);
    if (t0 && a0 && t0.input.shots.every((x) => x.hash) && !checkStillAnswer(a0, t0.input.shots).length) {
      for (const v of a0.shots) { const x = t0.input.shots.find((y) => y.id === v.id); if (x && !liveVerdict(reviews[x.hash])) reviews[x.hash] = { shot: v.id, ...v, rules: REVIEW_RULES, by: agentFor(cfg, id, 'stillcheck'), at: new Date().toISOString() }; }
      fs.writeFileSync(reviewsFile(cfg, id, seg), JSON.stringify(reviews, null, 1) + '\n'); writeCheck(cfg, id, step, { errors: [] });
    } }
  const { shots, page } = await stillSheet(cfg, id, seg, { log });
  // empty frames are found by code: no agent needed to say so
  for (const s of shots) if (s.empty?.length && !liveVerdict(reviews[s.hash])) reviews[s.hash] = { shot: s.id, verdict: 'fix', owner: 'plan', problems: [{ kind: 'empty', at: s.empty[0], say: `the frame at ${s.empty.join(', ')} s shows next to nothing` }], fix: 'the picture or page did not draw: check its material and the module', by: 'code' };
  // what the checks found is the code's verdict (framecheck.mjs, markErrors): the module's faults and the director's
  // are filed apart (owner), as the review's are; the agent is not asked to look again at what code already failed
  for (const s of shots) if (s.problems?.length && !s.transient && !liveVerdict(reviews[s.hash])) {
    const plan = s.problems.some((x) => x.owner === 'plan');
    reviews[s.hash] = { shot: s.id, verdict: 'fix', owner: plan ? 'plan' : 'module', problems: s.problems, fix: plan ? 'change the shot so the checks pass (material, module, words)' : 'fix the module so the checks pass', by: 'code' };
  }
  // a shot whose sheet came out byte for byte as one already judged (the code of a module or check changed, its
  // pictures did not) keeps that verdict: every edit to modules.mjs sent all the film's shots back to be looked at
  // again; its motion is still measured on the animatic
  const shaOf = (f) => (fs.existsSync(f) ? sha(fs.readFileSync(f).toString('base64')) : null);
  // (verdicts given before this was kept: their sheet is still on disk under the version they judged)
  for (const [h, v] of Object.entries(reviews)) if (!v.sheetSha && v.shot) v.sheetSha = shaOf(path.join(dirs(cfg, id, seg).out, 'sheet', `${v.shot}-${h}.jpg`));
  for (const s of shots) {
    const me = shaOf(s.file); if (!me) continue;
    if (liveVerdict(reviews[s.hash])) { if (!reviews[s.hash].sheetSha) reviews[s.hash].sheetSha = me; continue; }
    // (the latest of them: a verdict withdrawn or overturned since was carried on from the first one found, open-S8)
    const same = Object.values(reviews).filter((v) => v.shot === s.id && v.sheetSha === me && v.by !== 'code' && liveVerdict(v)).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    if (same) { reviews[s.hash] = { ...same, carried: true, at: new Date().toISOString() }; continue; }
    // ... and so does one that looks the same (PSNR against the last judged sheet of the shot at SHEET_SAME dB or more:
    // a module's layout fix moved its pictures a pixel, the sheet went to a fresh reviewer and two near-identical
    // versions of r1 S8 came back pass and fix; a verdict is about the picture, not its bytes)
    const last = Object.entries(reviews).filter(([, v]) => v.shot === s.id && v.by !== 'code' && v.at && liveVerdict(v)).sort((a, b) => (a[1].at < b[1].at ? 1 : -1))[0];
    const lastFile = last && path.join(dirs(cfg, id, seg).out, 'sheet', `${s.id}-${last[0]}.jpg`);
    // (a pass only: a fix asked for a change, and the version that makes it, however small, is looked at again — talent S2's
    // column lit on the bar carried the fix that asked for it)
    if (lastFile && fs.existsSync(lastFile) && /^pass/.test(last[1].verdict || '')) { const db = psnrOf(spawnSync('ffmpeg', ['-hide_banner', '-i', lastFile, '-i', s.file, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '');
      if (db != null && db >= SHEET_SAME) reviews[s.hash] = { ...last[1], carried: `looks the same (${db === Infinity ? 'inf' : db.toFixed(1)} dB)`, at: new Date().toISOString() }; }
  }
  // a shot whose sheet was not drawn this run (a timeout, a closed browser: transient) is not sent to the reviewer — the
  // talent task named four stills that did not exist and the blind reviewer had nothing to judge; it is drawn again next run
  const undrawn = shots.filter((s) => s.transient && !liveVerdict(reviews[s.hash]));
  if (undrawn.length) { log(`  ${seg}: ${undrawn.map((s) => s.id).join(', ')} not drawn (a timeout); drawn again next run before the review`); fs.rmSync(P.task, { force: true }); fs.writeFileSync(reviewsFile(cfg, id, seg), JSON.stringify(reviews, null, 1) + '\n'); return { state: 'waiting', task: null, page, due: undrawn.map((s) => s.id) }; }
  const due = shots.filter((s) => !liveVerdict(reviews[s.hash]));
  if (due.length) {
    let answer = readAnswer(cfg, id, step), task = readJson(P.task, null);
    const wanted = due.map((s) => s.hash).sort().join(',');
    if (!task || task.input.hashes !== wanted) {
      const card = readJson(path.join(dirs(cfg, id, seg).out, 'breakdown', 'card.json'), null);
      const refShows = (s) => (card?.subs || []).filter((r) => Math.min(r.end, s.end) - Math.max(r.at, s.at) > .2).map((r) => `${r.id} ${r.at}-${r.end} s：${r.read?.shows || ''}`).join('；') || null;
      writeTask(cfg, id, step, { rules: 'work/recipe-board-v1/prompts/stillcheck.md', schema: 'work/recipe-board-v1/routing/stillcheck.schema.json',
        // blind (user, 2026-10-22: 审片换人；自己出题、自己答题、自己打分): what a viewer has, our frames and the reference's
        // at the same moments and what the reference shows there (the card's reading), never the director's reasons or
        // the spec; answered by a reviewer that did not plan the passage (prompts/stillcheck.md)
        // ... and, for a shot that passed before, the version that passed and what was noted on it: a change elsewhere
        // (a module's motion, a measure) sent a passed shot to a fresh reviewer, who failed it for what the passed one
        // already had (talent S4's empty office, passed three times, failed the fourth); the reviewer fails a change, not
        // what was accepted (prompts/stillcheck.md)
        input: { seg, hashes: wanted, shots: due.map((s) => ({ id: s.id, hash: s.hash, module: s.module, at: s.at, end: s.end, times: s.times, sheet: s.file, reference: refShows(s), sources: sourcesOf(cfg, id, seg, s), passed: passedBefore(cfg, id, seg, reviews, s.id) })) },
        images: [...due.map((s) => s.file), ...due.map((s) => passedBefore(cfg, id, seg, reviews, s.id)?.sheet).filter(Boolean)] });
      if (fs.existsSync(P.answer)) fs.rmSync(P.answer); answer = null; task = readJson(P.task, null);
    }
    if (!answer && agentFor(cfg, id, 'stillcheck') === 'codex') { log('  codex is reviewing the sheet'); answer = await runCodexTask(cfg, step, task, 'shots'); fs.writeFileSync(P.answer, JSON.stringify(answer, null, 1)); }
    if (!answer) { fs.writeFileSync(reviewsFile(cfg, id, seg), JSON.stringify(reviews, null, 1) + '\n'); return { state: 'waiting', task: P.task, page, due: due.map((s) => s.id) }; }
    const errors = checkStillAnswer(answer, due);
    writeCheck(cfg, id, step, { errors });
    if (errors.length) return { state: 'answer-rejected', errors, page };
    // a fix that fails what the user allowed, or asks only for what the user forbade, is void (reviewrules.mjs voidVerdict:
    // the card line spent rounds on fixes its own rules had capped, open S19); what is left of it stands
    const { voidVerdict, readLessons } = await import('./reviewrules.mjs'), lessons = readLessons(cfg);
    for (const v0 of answer.shots) { const s = due.find((x) => x.id === v0.id), v = voidVerdict(v0, lessons); if (v.voided?.length) log(`  ${s.id}: ${v.voided.length} of the review's problems void by the user's rules${v.verdict === 'pass' ? ' (none left: pass)' : ''}`); reviews[s.hash] = { shot: s.id, ...v, rules: REVIEW_RULES, by: agentFor(cfg, id, 'stillcheck'), at: new Date().toISOString(), sheetSha: shaOf(s.file) }; }
  }
  fs.writeFileSync(reviewsFile(cfg, id, seg), JSON.stringify(reviews, null, 1) + '\n');
  // the user's own marks (usermarks.mjs, /recipe-board/passages): a "bad" on the picture the shot still shows holds it,
  // whatever the review said
  const { readMarks, holding } = await import('./usermarks.mjs'), held = holding(readMarks(cfg, id, seg), shots);
  const current = shots.map((s) => { const h = held.find((x) => x.shot === s.id); return h ? { shot: s.id, verdict: 'fix', owner: 'plan', by: 'user', problems: [{ kind: 'other', at: null, say: `用户：${h.note}` }], fix: h.note, notes: null } : reviews[s.hash]; });
  // the director's waivers (waive: a ruling answered with a reason, bound to the picture it was given on; CONVERGE-20261026
  // conflict 8: open S19 stood three rounds on a fix no change of plan could meet). A user's own mark is never waived
  const W = readWaivers(cfg, id, seg), hashOf = Object.fromEntries(shots.map((s) => [s.id, s.hash]));
  const fixes = current.map((v) => (v?.verdict === 'fix' && v.by !== 'user' ? waived(v, W, hashOf[v.shot]) : v)).filter((v) => v?.verdict === 'fix');
  return { state: fixes.length ? 'fix' : 'passed', page, fixes, verdicts: current };
}
// ---------------------------------------------------------------- the director's waivers
// A ruling the director answers with a reason instead of a change (out/passages/<seg>/waivers.json: { shot, hash, item,
// why, at }): the item (a scorecard id like [type], a problem's kind, or words of the measure's say) stops holding that
// shot while its picture is the one the waiver was written on; a new picture is judged anew. Listed by run for the user
const waiversFile = (cfg, id, seg) => path.join(dirs(cfg, id, seg).out, 'waivers.json');
export const readWaivers = (cfg, id, seg) => readJson(waiversFile(cfg, id, seg), []);
// (pure, tested) does a waiver answer this problem of this shot as it is now
export const waives = (w, shot, hash, p) => w.shot === shot && w.hash === hash && (p.kind === w.item || String(p.say || '').includes(w.item));
// (pure, tested) a verdict with the problems its waivers answer taken out; none left: a pass that says so
export function waived(v, waivers, hash) {
  const left = (v.problems || []).filter((p) => !waivers.some((w) => waives(w, v.shot, hash, p)));
  if (left.length === (v.problems || []).length) return v;
  const said = waivers.filter((w) => w.shot === v.shot && w.hash === hash).map((w) => `${w.item}: ${w.why}`).join('；');
  return left.length ? { ...v, problems: left, waived: said } : { ...v, verdict: 'pass', owner: null, problems: [], waived: said };
}
export function waive(cfg, id, seg, shotId, item, why) {
  if (String(why || '').trim().length < 8) throw new Error('a waiver says why, in a sentence (what the ruling asks and why the shot stands as it is)');
  if (!String(item || '').trim()) throw new Error('a waiver names the item it answers: a scorecard id ([type]), a problem kind, or words of the measure');
  const sh = passageShots(cfg, id, seg).find((s) => s.id === shotId); if (!sh) throw new Error(`${seg}: no shot ${shotId}`);
  const all = readWaivers(cfg, id, seg).filter((w) => !(w.shot === shotId && w.item === item));
  const w = { shot: shotId, hash: sh.hash, item: String(item).trim(), why: String(why).trim(), at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(waiversFile(cfg, id, seg)), { recursive: true }); fs.writeFileSync(waiversFile(cfg, id, seg), JSON.stringify([...all, w], null, 1) + '\n');
  return w;
}

// the review's rules, as a hash of its prompt and its scorecard: a verdict an agent gave under other rules is looked at again
// under these (2026-10-25: two items were added, type and layout, held to the reference; every shot that passed before
// them is reviewed once more), as a chapter's review is (chapter.mjs reviewRulesHash); the code's and the user's stand
export const REVIEW_RULES = (() => { try { return crypto.createHash('sha256').update(['prompts/stillcheck.md', 'routing/scorecard.json'].map((f) => withoutSection(fs.readFileSync(new URL(`../../../../../work/recipe-board-v1/${f}`, import.meta.url), 'utf8'))).join('\n')).digest('hex').slice(0, 12); } catch { return null; } })();
export const liveVerdict = (v) => !!v && (v.by === 'code' || v.by === 'user' || !REVIEW_RULES || v.rules === REVIEW_RULES);
export const SCORECARD = (() => { try { return JSON.parse(fs.readFileSync(new URL('../../../../../work/recipe-board-v1/routing/scorecard.json', import.meta.url), 'utf8')).items.map((x) => x.id); } catch { return ['full', 'balance', 'opening', 'progress', 'edges', 'overlap', 'readable', 'band', 'marks', 'source', 'subject', 'focus', 'depth', 'grade']; } })();
// the materials a shot shows, by their source's own name (the archive's title, the page's address): who a person is
// comes from the record, not from a face (a reviewer took Commons' 'Demis Hassabis in 2025' for another man, open-S8);
// a source, not a reason: the review stays blind to the director's choices
// the last version of a shot a reviewer passed, its sheet still on disk: { sheet, notes } or null
export function passedBefore(cfg, id, seg, reviews, shotId) {
  const hit = Object.entries(reviews).filter(([, v]) => v.shot === shotId && v.verdict === 'pass' && v.by !== 'code' && !v.carried).sort((a, b) => (a[1].at < b[1].at ? 1 : -1))
    .map(([h, v]) => ({ sheet: path.join(dirs(cfg, id, seg).out, 'sheet', `${shotId}-${h}.jpg`), notes: v.notes || null })).find((x) => fs.existsSync(x.sheet));
  return hit || null;
}
export function sourcesOf(cfg, id, seg, s) {
  let spec = {}; try { spec = JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).root, 'modules', seg, `${s.id}.json`), 'utf8')); } catch { /* */ }
  const files = [...new Set((JSON.stringify(spec).match(/materials\/clips\/[^"]+?\.(?:png|jpe?g|mp4|webm|mov)/g) || []).map((f) => f.split('/').pop()))];
  const items = (readJson(path.join(projectPaths(cfg, id).root, 'materials', 'approvals.json'), { batches: [] }).batches || []).flatMap((b) => b.items || []);
  return files.map((f) => { const hit = items.find((i) => i.url && f.toLowerCase().includes(`-${String(i.shotId).toLowerCase()}-`) && (i.title || '') && f.toLowerCase().includes(String(i.title || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').slice(0, 12))); return hit ? `${hit.title} (${hit.publisher || new URL(hit.url).host})` : f.replace(/^hupo-auto2-|-[0-9a-f]{8}(-window)?\.[a-z]+$/g, ''); });
}
export function checkStillAnswer(answer, due) {
  const errors = [], got = answer?.shots || [];
  for (const s of due) if (!got.some((v) => v.id === s.id)) errors.push(`${s.id}: no verdict`);
  for (const v of got) {
    if (!['pass', 'fix'].includes(v.verdict)) errors.push(`${v.id}: verdict is pass or fix`);
    if (v.verdict === 'fix' && !(v.problems || []).length) errors.push(`${v.id}: a fix names its problems`);
    for (const p of v.problems || []) if (!PROBLEMS.includes(p.kind)) errors.push(`${v.id}: problem kind "${p.kind}" (${PROBLEMS.join(' / ')})`);
    // (each fix names the scorecard item it fails, [id] first: "差一档" with no item was 291 of the notes and two
    // reviewers judged one frame two ways; routing/scorecard.json, user 2026-10-23: 能不能做到没问题最优呢)
    for (const p of v.problems || []) { const m = String(p.say || '').match(/^\s*\[([a-z-]+)\]/); if (!m || !SCORECARD.includes(m[1])) errors.push(`${v.id}: a problem starts with the scorecard item it fails, [${SCORECARD.join('] / [')}] ("${String(p.say || '').slice(0, 40)}")`); }
    if (v.verdict === 'fix' && !['plan', 'module'].includes(v.owner)) errors.push(`${v.id}: owner is plan (the director changes the shot) or module (the module's look is wrong)`);
  }
  return errors;
}
// the review's fixes as errors for the shot director (plan problems) and as module work (module problems)
// each problem may name its own owner (the code's checks do: framecheck.mjs); the director gets only its own
const own = (v, who) => ({ ...v, problems: v.problems.filter((p) => (p.owner || v.owner) === who) });
export function reviewErrors(fixes) {
  return fixes.map((v) => own(v, 'plan')).filter((v) => v.problems.length).map((v) => `画面评审：${v.shot} ${v.problems.map((p) => `${p.kind}${p.at ? ` @${p.at}s` : ''}: ${p.say}`).join('; ')}${v.fix ? `（建议：${v.fix}）` : ''}`);
}
export function moduleWork(cfg, id, seg, fixes) {
  const f = path.join(dirs(cfg, id, seg).out, 'module-issues.json'), list = fixes.map((v) => own(v, 'module')).filter((v) => v.problems.length).map((v) => ({ shot: v.shot, problems: v.problems, fix: v.fix }));
  fs.writeFileSync(f, JSON.stringify(list, null, 1) + '\n');
  return list;
}

// the concat list (pure, tested): each part cut to its shot's length
// with fps, each boundary on the passage's own frame grid: a part can only end on a frame, and cut to its own length
// each rounded up (17 shots at 12 fps came to 47.667 s for a 47.52 s passage, caught by the invariants)
export const concatList = (parts, durs, fps = 0) => { let at = 0;
  return parts.map((p, i) => { const d = durs?.[i]; if (!(d > 0)) return `file '${p}'`;
    const a = fps ? Math.round(at * fps) / fps : at, b = fps ? Math.round((at + d) * fps) / fps : at + d; at += d;
    return `file '${p}'\noutpoint ${(b - a).toFixed(4)}`; }).join('\n'); };
// ---------------------------------------------------------------- 3 the animatic

export async function animatic(cfg, id, seg, { log = () => {} } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'animatic');
  assertRenderStorage(cfg, id);
  const { out } = dirs(cfg, id, seg), ad = path.join(out, 'animatic'); fs.mkdirSync(ad, { recursive: true });
  const shots = passageShots(cfg, id, seg), parts = [], problems = [], hasCard = !!(await import('./breakdown.mjs')).readCard(cfg, id, seg);
  for (const s of shots) {
    const base = path.join(ad, `${s.id}-${s.hash}-h`);   // -h: the half-density white model (scale .5)
    if (!fs.existsSync(`${base}-voice.mp4`)) { await renderModule(cfg, id, s.spec, base, { fps: 12, sub: 1, check: false, checks: false, scale: .5 }); log(`  animatic ${s.id}`); }
    parts.push(fs.existsSync(`${base}-voice.mp4`) ? `${base}-voice.mp4` : `${base}.mp4`);
    // motion against the reference, measured here where it is cheap (camera speed by phase correlation does not
    // depend on the frame rate): a module that stands still where the reference keeps moving (h800-S10's compare,
    // the article between lines) fails before the final render. Only where the whole frame is the module's: a
    // presenter shot's motion is the author's footage
    // (with a breakdown card the card's measures judge the motion, sub-shot by sub-shot: this whole-shot check said a
    // pull-out of 6 % in 0.7 s was standing still, open-S7, S11)
    if (!hasCard && MOTION_MODULES.has(s.spec.module) && fs.existsSync(`${base}.mp4`)) {
      const mf = `${base}-motion.json`, m = fs.existsSync(mf) ? readJson(mf, {}) : refCheck(cfg, id, s.spec, `${base}.mp4`, mf);
      const ps = (m.issues || []).filter((i) => i.kind === 'still' || i.kind === 'held').map((i) => ({ kind: 'unlike-reference', at: null, say: `motion: ${i.say}`, owner: 'module' }));
      if (ps.length) problems.push({ shot: s.id, hash: s.hash, problems: ps, fix: 'the module keeps moving as the reference does (camera, elements)' });
    }
  }
  // the parts of earlier versions of the shots are removed (each revision left its own: 6 GB over three passages)
  { const keep = new Set(shots.map((s) => `${s.id}-${s.hash}-h`)); for (const f of fs.readdirSync(ad)) { const m = f.match(/^(S\d+[A-Za-z]?-[0-9a-f]{16}(?:-h)?)(?=[-.])/); if (m && !keep.has(m[1])) fs.rmSync(path.join(ad, f), { force: true }); } }
  // each part cut to its shot's length (a 12 fps part runs a frame long: over a passage the white model fell 0.4 s
  // behind the reference's clock, and late events were measured at the wrong moments: who-S10)
  const list = path.join(ad, 'parts.txt'); fs.writeFileSync(list, concatList(parts, shots.map((s) => s.spec.end - s.spec.at), 12));
  const film = path.join(out, `${seg}-animatic.mp4`);
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-crf', '26', '-maxrate', '4M', '-bufsize', '8M', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-t', (shots.at(-1).spec.end - shots[0].spec.at).toFixed(4), '-c:a', 'aac', film]);
  // the invariants (invariants.mjs): every part whole, the film as long as the passage; a breach stops here
  { const I = await import('./invariants.mjs'), errs = [...I.partErrors(shots.map((s, i) => ({ id: s.id, file: parts[i], want: s.spec.end - s.spec.at, got: I.probe(parts[i]) }))), ...I.filmErrors(I.probe(film), shots.at(-1).spec.end - shots[0].spec.at, 'white model')];
    fs.writeFileSync(path.join(out, 'invariants-animatic.json'), JSON.stringify({ errors: errs }, null, 1) + '\n');
    if (errs.length) throw new Error(`white model ${seg}: ${errs.join('; ')}`); }
  const beside = besideReference(cfg, id, { module: `${seg} 粗剪`, at: shots[0].spec.at, end: shots.at(-1).spec.end }, film, path.join(out, `${seg}-animatic-vs-reference.mp4`), { ourAudio: film });
  // the breakdown card's items, measured on ours as on the reference (breakdown.mjs): every item the plan said it
  // matches and does not is a problem: a cut is the director's, the rest the module's (or the spec's camera:
  // the director's when the spec asked for no move); either holds the final render
  const B = await import('./breakdown.mjs'), card = B.readCard(cfg, id, seg);
  let breakdown = [];
  if (card) {
    const plan = readJson(taskPaths(cfg, id, `shotplan-${seg}`).answer, {}), range = [shots[0].spec.at, shots.at(-1).spec.end];
    const ours = B.oursBreakdown(cfg, id, seg, film, range, { cuts: shots.slice(1).map((s) => s.spec.at), spans: card.subs.map((r) => [r.at, r.end]) });
    breakdown = B.compareBreakdown(card, ours, plan.follows || [], { shots: shots.map((s) => ({ id: s.id, at: s.spec.at, end: s.spec.end })), halfDensity: true, styleOwnsLook: !!plan.style && plan.style.id !== 'editorial-grey' })
      .map((p) => { const sp = shots.find((s) => s.id === p.shot)?.spec; return p.kind === 'camera' && sp && !(sp.camera || []).length && !(sp.pageCamera || []).length ? { ...p, owner: 'plan', say: `${p.say} (the shot asks for no camera move: spec.camera)` } : p; });
    // and what it shows (likeness.py: a trading room stood in for a TV board of share prices, open-S2)
    const sh = shots.map((s) => ({ id: s.id, at: s.spec.at, end: s.spec.end }));
    breakdown.push(...B.showsErrors(card, B.likenessOf(cfg, id, seg, card, film, range), plan.follows || [], { shots: sh }));
    // the look (light or dark, chroma, grain) and the display line's size are the style's and the design's to vary: the
    // scorecard holds a shot to the reference's grade, not its palette or its type size (user 2026-10-23: 设计差不多就行
    // 不用一模一样 设计可以有变体); they are reported, and hold nothing
    const advisory = breakdown.filter((p) => ADVISORY_KINDS.includes(p.kind)); breakdown = breakdown.filter((p) => !ADVISORY_KINDS.includes(p.kind));
    fs.writeFileSync(path.join(out, 'breakdown', 'compare.json'), JSON.stringify({ hash: sha(shots.map((s) => s.hash).join()), problems: breakdown, advisory }, null, 1) + '\n');
    for (const sh of [...new Set(breakdown.map((p) => p.shot))]) {
      const ps = breakdown.filter((p) => p.shot === sh).map((p) => ({ kind: 'unlike-reference', at: null, say: `拆解 ${p.item}: ${p.say}`, owner: p.owner }));
      const have = problems.find((x) => x.shot === sh);
      if (have) have.problems.push(...ps); else problems.push({ shot: sh, hash: shots.find((s) => s.id === sh)?.hash, problems: ps, fix: 'do what the breakdown card item says (the plan answered match)' });
    }
  }
  return { film, beside, hash: sha(shots.map((s) => s.hash).join()), problems, breakdown };
}
// the cuts against the words: a cut lands at a word's start (within 0.15 s) or in a pause (pure, tested)
export function cutsOnWords(shots, narration) {
  const starts = narration.flatMap((l) => (l.words || []).map((w) => w[1])), ends = narration.map((l) => l.end), warnings = [];
  for (const s of shots.slice(1)) { const t = s.at; if (!starts.some((w) => Math.abs(w - t) <= .15) && !ends.some((e) => Math.abs(e - t) <= .25)) warnings.push(`${s.id} cuts at ${t} s, between words; cut on a word's start or in a pause`); }
  return warnings;
}

// where the review stands without rendering anything (for the run's report): every current shot has a verdict?
export function reviewState(cfg, id, seg) {
  const reviews = readJson(reviewsFile(cfg, id, seg), {}), shots = passageShots(cfg, id, seg);
  if (!shots.length) return 'none';
  const v = shots.map((s) => (liveVerdict(reviews[s.hash]) ? reviews[s.hash] : null));
  if (v.some((x) => !x)) return 'review';
  // (a shot the user marked bad on its current picture: usermarks.mjs)
  { const m = readJson(path.join(dirs(cfg, id, seg).out, 'user-marks.json'), {}); if (shots.some((s) => m[s.id]?.verdict === 'bad' && m[s.id].hash === s.hash)) return 'fix'; }
  // a shot the code's checks failed does not render, whoever's fault it is (its render would fail the same checks)
  return v.some((x) => x.verdict === 'fix' && (x.owner === 'plan' || x.by === 'code')) ? 'fix' : 'passed';
}
