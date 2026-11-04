// The film's three user gates (CONVERGE-20261026 §1; the user 2026-10-26: 客观说说 sop 怎么样最好 保证流程怎么样是最好的).
// Six stages, the user's hand at three of them, each a judgement only the user makes; the rest is the line's:
//   1 script and facts      the line         (facts: a beat without its source does not enter the storyboard)
//   2 LOOK                  the user, once   the film's style shown as key frames, chapters and cards on one sheet
//   3 ROUGH (structure)     the user, once   the whole film as a white model: the telling and the rhythm
//   4 polish                the line         code checks and blind reviews, only the beats named, locked once they pass
//   5 FINAL (preview)       the user, once   the polished rough film; only then the fine render
//   6 retrospective         the line         every note a rule, a check, a test and a lesson; the process measured
// A project on this process says so (project.json process: "six-stage"; new projects are made so, store.mjs
// ensureProject). Older projects keep the gates they were made under (direction, per-chapter animatic approvals,
// confirmRough): the films already delivered are not reopened.
//   project.json look:  { approved, by, at, style, frames }        the sheet the user saw; a new style reopens it
//   project.json rough: { approved, by, at, hash }                 bound to the structure (structureHash)
//   project.json final: { approved, by, at, pieces: { id: hash } } bound to each piece as the user saw it
// Nothing here approves for the user (AGENTS: never approve for the user): approveGate is called by the CLI with the
// user's own words.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectPaths, loadProject, loadShots } from './store.mjs';
import { readStyle } from './filmlook.mjs';
import { SIX, GATES, LEGACY_GATES, designSet, sixStage, BEFORE_LOOK, pieceKey, gatesOf, finalAllowsOf, finalAllows, polishOpen, lookOpen, directionOpen, sixSkips } from './gatestate.mjs';
export { SIX, GATES, LEGACY_GATES, designSet, sixStage, BEFORE_LOOK, pieceKey, gatesOf, finalAllowsOf, finalAllows, polishOpen, lookOpen, directionOpen, sixSkips };

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const rel = (cfg, id, f) => path.relative(projectPaths(cfg, id).root, f);

// ---------------------------------------------------------------- what each gate is bound to

// (pure, tested) a chapter module's structure: the beat forms and devices of its plan2, not its code (polishing changes
// the code; a new form or a new device is a new telling)
export function planShape(code) {
  const at = String(code || '').indexOf('plan2');
  if (at < 0) return '';
  const block = code.slice(at, at + 40000);
  const forms = [...block.matchAll(/\bform:\s*'([^']+)'/g)].map((m) => m[1]);
  const devices = [...block.matchAll(/\bdevices:\s*\[([^\]]*)\]/g)].map((m) => m[1].replace(/\s/g, ''));
  return JSON.stringify({ forms, devices });
}
// (pure, tested) the structure the rough gate is bound to: the storyboard's beats (card, length, form), each chapter's
// beats and plan shape, each passage's shots (module and cut points). The words on the cards, the colours, the type
// sizes, the reviews' fixes are not structure: they change in polishing without reopening the gate.
export function structureOf({ storyboard = null, chapters = [], passages = [] }) {
  const beats = (storyboard?.shots || []).map((s) => [s.beat, s.card, Math.round((+s.seconds || 0) * 10) / 10, s.diagram?.form || null, !!s.isHero]);
  return {
    beats,
    chapters: chapters.map((c) => [c.id, c.beats, planShape(c.code)]),
    passages: passages.map((g) => [g.seg, (g.shots || []).map((s) => [s.id, s.module, +(+s.at).toFixed(1), +(+s.end).toFixed(1)])]),
  };
}
export const structureHashOf = (s) => sha(JSON.stringify(s));

async function readStructure(cfg, id) {
  const root = projectPaths(cfg, id).root, p = loadProject(cfg, id) || {};
  const { chapterGroups, moduleFile } = await import('./chapter.mjs');
  let chapters = [];
  try { chapters = chapterGroups(cfg, id).map((g) => { const f = moduleFile(cfg, id, g); return { id: g.id, beats: g.shots.map((s) => s.shotId), code: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '' }; }); } catch { /* no plan yet */ }
  const passages = (p.passages || []).map((g) => ({ seg: g.seg, shots: readJson(path.join(root, 'tasks', `shotplan-${g.seg}.answer.json`), {})?.shots || [] }));
  return structureOf({ storyboard: readJson(path.join(root, 'storyboard.json')), chapters, passages });
}
export async function structureHash(cfg, id) { return structureHashOf(await readStructure(cfg, id)); }

// every piece the fine render makes, by what it is made from now: a chapter by its module (chapterCodeHash), a
// passage by its shots (usermarks roughKey), a card by its motion key (run.mjs motionKey)
export async function currentPieces(cfg, id) {
  const out = {}, p = loadProject(cfg, id) || {};
  const { chapterGroups, chapterCodeHash } = await import('./chapter.mjs');
  const inChapter = new Set();
  try { for (const g of chapterGroups(cfg, id)) { g.shots.forEach((s) => inChapter.add(s.shotId)); const h = chapterCodeHash(cfg, id, g); if (h) out[g.id] = h; } } catch { /* no plan yet */ }
  if ((p.passages || []).length) {
    const { passageShots } = await import('./layers.mjs'), { roughKey } = await import('./usermarks.mjs');
    for (const g of p.passages) { const sh = passageShots(cfg, id, g.seg); if (sh.length) out[g.seg] = pieceKey(roughKey(sh)); }
  }
  const { motionKey } = await import('./run.mjs');
  for (const s of loadShots(cfg, id)) if (s.motion && !inChapter.has(s.shotId)) out[s.shotId] = pieceKey(motionKey(s));
  return out;
}

// ---------------------------------------------------------------- where the gates stand

// a design-first film's look as it stands: are its hero stills through their review, and the board's hash now
async function filmLookOf(cfg, id) {
  const { profileOf } = await import('./profile.mjs'); if (!profileOf(cfg, id).designFirst) return null;
  const S = await import('./stills.mjs'); return { designFirst: true, ready: S.stillsReady(cfg, id), board: S.boardHash(cfg, id) };
}
// the user's verdict on a style (routing/styles.json verdict: approved / rejected / untested, with their words)
export const styleVerdict = (cfg, styleId) => readStyle(cfg, styleId)?.verdict || null;
export async function gateState(cfg, id) {
  const p = loadProject(cfg, id) || {};
  if (!sixStage(p)) return gatesOf(p);
  const GB = await import('./greybox.mjs');
  const state = gatesOf(p, { structure: await structureHash(cfg, id), pieces: await currentPieces(cfg, id), verdict: styleVerdict(cfg, p.style), film: await filmLookOf(cfg, id), greybox: GB.greyboxHash(cfg, id), greyboxReviewed: GB.greyboxReviewPassed(cfg, id) });
  // A set of pieces is not a watchable, current reel. Expose the actual preview condition to every client.
  const preview = roughCurrent(cfg, id);
  return { ...state, greyboxState: GB.approvedGreybox(cfg, id).state, final: state.final ? { ...state.final, ready: !!state.final.ready && preview.ok, preview } : state.final };
}

// ---------------------------------------------------------------- the look sheet

// the key frames the user judges the look on: the chapters' key beats (keyframes.mjs, the image model in the film's
// style) and the cards' design frames (layers.mjs directionFrames, the modules at their full look), on one sheet
export async function lookFrames(cfg, id) {
  const root = projectPaths(cfg, id).root, frames = [];
  // a design-first film's hero stills first (stills.mjs: the frames its chapters will be written to)
  { const c = readJson(path.join(root, 'tasks', 'stills.check.json')); for (const f of c?.keyframes || []) if (fs.existsSync(path.join(root, f))) frames.push({ kind: 'hero', of: path.basename(f).replace(/\.\w+$/, ''), file: rel(cfg, id, path.join(root, f)) }); }
  // (not the image model's whole-frame keyframes: the user 2026-10-26 on the Vol.047 sheet, eight of them: 绝对不行 很ai这种.
  // The films the user accepted are built of code-drawn parts, real material and house type, the image model painting only
  // text-free plates and props; the look is judged on frames made the same way)
  const lf = path.join(root, 'out', 'look', 'parts');
  if (fs.existsSync(lf)) for (const f of fs.readdirSync(lf).filter((x) => /\.(png|jpe?g)$/i.test(x)).sort()) frames.push({ kind: 'parts', of: f.replace(/\.\w+$/, ''), file: rel(cfg, id, path.join(lf, f)) });
  const dir = path.join(root, 'out', 'direction');
  if (fs.existsSync(dir)) for (const d of fs.readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory())) for (const f of fs.readdirSync(path.join(dir, d.name)).filter((x) => /\.(png|jpe?g)$/i.test(x)).slice(0, 1)) frames.push({ kind: 'card', of: d.name, file: rel(cfg, id, path.join(dir, d.name, f)) });
  return frames;
}
async function sheetOf(cfg, id, frames, name, log) {
  const root = projectPaths(cfg, id).root, sheet = path.join(root, 'out', 'look', name), files = frames.slice(0, 6).map((f) => path.join(root, f.file)), cols = 2;
  if (!files.length) return null; fs.mkdirSync(path.dirname(sheet), { recursive: true });
  const layout = files.map((_, i) => `${i % cols ? 'w0' : '0'}_${Math.floor(i / cols) ? Array.from({ length: Math.floor(i / cols) }, () => 'h0').join('+') : '0'}`).join('|');
  const r = files.length === 1 ? spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', files[0], '-vf', 'scale=960:540', sheet]) : spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout}:fill=black`, sheet]);
  if (r.status) log(`  look sheet ${name}: ffmpeg failed`); return fs.existsSync(sheet) ? sheet : null;
}
export async function lookSheet(cfg, id, { log = () => {} } = {}) {
  // (directions: one sheet each, sheet-A.jpg …, and sheet.jpg the first; a film of one world one sheet)
  const all = await lookFrames(cfg, id), dirs = [...new Set(all.map((f) => (/^([A-C])-/.exec(f.of) || [])[1]).filter(Boolean))];
  // the hero stills on a sheet of their own (sheet-hero.jpg): with several directions the sheets went by direction and
  // the stills, of none, were on none of them
  { const hero = all.filter((f) => f.kind === 'hero'); if (hero.length) await sheetOf(cfg, id, hero, 'sheet-hero.jpg', log); }
  if (dirs.length > 1) { let first = null; for (const d of dirs) { const r = await sheetOf(cfg, id, all.filter((f) => f.of.startsWith(`${d}-`)), `sheet-${d}.jpg`, log); first ||= r; } if (first) fs.copyFileSync(first, path.join(projectPaths(cfg, id).root, 'out', 'look', 'sheet.jpg'));
    fs.writeFileSync(path.join(projectPaths(cfg, id).root, 'out', 'look', 'frames.json'), JSON.stringify({ contract: 'A1RecipeBoardLookSheet/v1', style: (loadProject(cfg, id) || {}).style || null, directions: dirs, frames: all }, null, 1) + '\n');
    return { sheet: first, sheets: dirs.map((d) => path.join(projectPaths(cfg, id).root, 'out', 'look', `sheet-${d}.jpg`)), frames: all }; }
  const root = projectPaths(cfg, id).root, out = path.join(root, 'out', 'look'), frames = all.slice(0, 8);
  fs.mkdirSync(out, { recursive: true });
  const sheet = path.join(out, 'sheet.jpg');
  if (frames.length) {
    const files = frames.map((f) => path.join(root, f.file)), cols = 2;
    const layout = files.map((_, i) => `${i % cols ? 'w0' : '0'}_${Math.floor(i / cols) ? Array.from({ length: Math.floor(i / cols) }, () => 'h0').join('+') : '0'}`).join('|');
    const r = files.length === 1 ? spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', files[0], '-vf', 'scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2', sheet])
      : spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`).join(';')};${files.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout}:fill=black`, sheet]);
    if (r.status) log(`  look sheet: ffmpeg failed: ${String(r.stderr || '').split('\n')[0]}`);
  }
  fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify({ contract: 'A1RecipeBoardLookSheet/v1', style: (loadProject(cfg, id) || {}).style || null, frames }, null, 1) + '\n');
  return { sheet: fs.existsSync(sheet) ? sheet : null, frames };
}

// ---------------------------------------------------------------- the user's approval, in their words

// ---- approval after a long silence (the user 2026-10-28: 如果我长时间没恢复可以自动渲染精磨; routing/autonomy.json). The gate is
// still the user's: what it shows was shown to them; it is approved by the line only when it has waited afterHours with the
// same thing to see and no word from the user since, marked as automatic with how long it waited and the words that allow
// it, for the user to overturn
export const autonomyOf = (cfg) => { try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'autonomy.json'), 'utf8')); } catch { return null; } };
// (pure, tested) is a waiting gate due to be approved by itself: waited long enough on the same thing, no note since
export function autoDue(wait, now, A, notes = [], verifyReceipt = null) {
  // A ready file is not evidence that the user saw it. Nor does an empty project note
  // log prove that the user stayed silent in the chat. Both need a trusted receipt.
  const receipt = wait?.presentation;
  if (!wait?.since || typeof wait.key !== 'string' || !wait.key || !A?.afterHours || !receipt || typeof verifyReceipt !== 'function' || verifyReceipt(receipt, wait, now) !== true || receipt.key !== wait.key || !receipt.shownAt || !receipt.activityCheckedThrough) return false;
  const readyAt = Date.parse(wait.since), since = Date.parse(receipt.shownAt), observedThrough = Date.parse(receipt.activityCheckedThrough);
  if (!Number.isFinite(readyAt) || !Number.isFinite(since) || !Number.isFinite(observedThrough) || since < readyAt || observedThrough < now || !(now - since >= A.afterHours * 3600e3)) return false;
  return !notes.some((n) => Date.parse(n.at || 0) > since);
}
export async function autoApprove(cfg, id, { log = console.log, now = Date.now() } = {}) {
  const A = autonomyOf(cfg); if (!A?.gates?.length) return null;
  const st = await gateState(cfg, id), gate = st?.waiting; if (!gate || !A.gates.includes(gate)) return null;
  // (the clock starts only once there is something to see: a film with no style, no greybox or no pieces yet is not waiting on the user)
  const g = st[gate]; if (!g || g.making || !g.ready) { const p0 = loadProject(cfg, id) || {}; if (p0.waits?.[gate]) { delete p0.waits[gate]; fs.writeFileSync(projectPaths(cfg, id).project, JSON.stringify(p0, null, 2) + '\n'); } return null; }
  // what the user is shown at this gate: the design's greybox and board, or the final's pieces and rough
  const key = gate === 'design' ? JSON.stringify([(await import('./greybox.mjs')).greyboxHash(cfg, id), (await filmLookOf(cfg, id))?.board || null]) : JSON.stringify(g.pending || []);
  const pf = projectPaths(cfg, id).project, p = loadProject(cfg, id) || {}, w = p.waits?.[gate];
  if (!w || w.key !== key) { p.waits = { ...(p.waits || {}), [gate]: { since: new Date(now).toISOString(), key } }; fs.writeFileSync(pf, JSON.stringify(p, null, 2) + '\n'); log(`  ${gate}: ready for the user; automatic approval waits for presentation and reply-monitoring evidence`); return { waiting: gate }; }
  const P = await import('./process.mjs'); let notes = [];
  try { notes = fs.readFileSync(P.notesFile(cfg, id), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
  catch (error) { if (error.code !== 'ENOENT') { log(`  ${gate}: cannot verify user notes; automatic approval held`); return { waiting: gate, error: 'cannot verify user notes' }; } }
  if (!autoDue(w, now, A, notes)) { log(`  ${gate}: automatic approval held until presentation and reply-monitoring evidence is available`); return { waiting: gate, since: w.since }; }
  const hours = ((now - Date.parse(w.presentation.shownAt)) / 3600e3).toFixed(1), by = `自动（${A.said.slice(0, 60)}…）：给你看了 ${hours} 小时没有回复`;
  try { await approveGate(cfg, id, gate, by, { auto: true }); log(`  ${gate}: approved by the line after ${hours} h with no word from the user (they may overturn it)`); return { approved: gate }; }
  catch (e) { log(`  ${gate}: not approved by the line: ${String(e.message || e).split('\n')[0]}`); return { waiting: gate, error: String(e.message || e) }; }
}
export async function approveGate(cfg, id, gate, by, { pick = null, auto = false } = {}) {
  const p0 = loadProject(cfg, id) || {}, names = designSet(p0) ? GATES : LEGACY_GATES;
  if (!names.includes(gate)) throw new Error(`gate: ${names.join(' | ')}${designSet(p0) ? ' (this film is on the design set: the greybox, the style frames and the board are approved together)' : ''}`);
  if (String(by || '').trim().length < 2) throw new Error('an approval names who approved, in their words (--by "<the user\'s words>")');
  // the design and the final are the user's own (2026-10-28: 没确认好怎么就精渲呢 — the session approved the final's changed
  // piece as delegated and started the fine render): never approved on the session's word
  if (!auto && ['design', 'final', 'look', 'rough', 'direction'].includes(gate) && /^\s*(Claude|Codex|代批|session|自动)/i.test(String(by))) throw new Error(`the ${gate} gate is the user's: it is approved in their words after they have seen it, never by the session (show them first)`);
  const pf = projectPaths(cfg, id).project, p = loadProject(cfg, id) || {};
  if (!sixStage(p)) throw new Error(`${id} is not on the six-stage process (project.json process: "${SIX}"); its old gates stand`);
  // (with the greybox as it is now: a design approved on a greybox changed since waits again — the audit, 2026-10-28)
  const g = gatesOf(p, designSet(p) ? { greybox: (await import('./greybox.mjs')).greyboxHash(cfg, id), film: await filmLookOf(cfg, id) } : {}), at = new Date().toISOString();   // (and the board: a style frame changed since waits too — the second audit)
  if (gate === 'design') {
    // the greybox (checked and reviewed blind), the style frames (checked and reviewed blind) and the board, in one sitting
    if (!p.style) throw new Error('name the film\'s style first (project.json style)');
    if (p.lettering !== 'eva') throw new Error('a new film is lettered eva (project.json lettering: "eva")');
    const G = await import('./greybox.mjs'), h = G.greyboxHash(cfg, id);
    if (!h) throw new Error(`the greybox rough has not passed its checks yet: node scripts/recipe-board.mjs greybox --project ${id}`);
    if (G.greyboxReviewPassed(cfg, id) === false) throw new Error('the greybox rough has not passed its blind review yet (tasks/greybox-review.task.json)');
    const fl = await filmLookOf(cfg, id); if (fl && !fl.ready) throw new Error('the style frames have not passed their checks and blind review yet (tasks/stills.check.json, stills-taste.check.json)');
    if (String(p.style).startsWith('film:')) { const st = readStyle(cfg, p.style), ds = Object.keys(st?.directions || {});
      if (ds.length > 1 && !pick && !st.chosen) throw new Error(`pick one of the directions: --pick ${ds.join('|')}`);
      if (ds.length) (await import('./filmworld.mjs')).pickDirection(cfg, id, pick || st.chosen || ds[0], by); }
    const board = fl ? (await import('./stills.mjs')).boardHash(cfg, id) : null;
    p.design = { approved: true, by, at, style: p.style, greybox: h, board, structure: await structureHash(cfg, id) };
  } else if (gate === 'direction') {
    // the whole film laid out as a greybox rough, its checks passed (greybox.mjs): the telling, the layout, the colour across it
    const h = (await import('./greybox.mjs')).greyboxHash(cfg, id); if (!h) throw new Error('the greybox rough has not passed its checks yet (tasks/greybox.check.json): node scripts/recipe-board.mjs greybox --project ' + id);
    p.direction = { approved: true, by, at, hash: h };
  } else if (gate === 'look') {
    if (!g.direction.ok) throw new Error(`the direction comes first: ${g.direction.why}`);
    if (!p.style) throw new Error('name the film\'s style first (project.json style)');
    if (p.lettering !== 'eva') throw new Error('a new film is lettered eva (project.json lettering: "eva")');
    // (a design-first film is judged on its hero stills: not before they passed the line's checks and their blind review; checked before anything is recorded)
    const fl = await filmLookOf(cfg, id); if (fl && !fl.ready) throw new Error('the hero stills have not passed their checks and blind review yet (tasks/stills.check.json, stills-taste.check.json): the look is approved on them');
    // (a film's world with directions: the user's pick becomes the style, the verdict goes to the taste record)
    if (String(p.style).startsWith('film:')) { const st = readStyle(cfg, p.style), ds = Object.keys(st?.directions || {});
      // (a direction picked before stays picked: the look approved again after a change asks no new pick — the user,
      // shown A/B/C a second time for Suez: 什么样子 abc 什么样啊)
      if (ds.length > 1 && !pick && !st.chosen) throw new Error(`pick one of the directions: --pick ${ds.join('|')}`);
      if (ds.length) (await import('./filmworld.mjs')).pickDirection(cfg, id, pick || st.chosen || ds[0], by); }
    const v = styleVerdict(cfg, p.style);
    if (v?.state === 'rejected') throw new Error(`the user rejected the style ${p.style} (${v.said}); take an approved one`);
    // (an untested style the user approves here is theirs from now on: styles.json verdict)
    if (v?.state !== 'approved') {
      if (String(p.style).startsWith('film:')) { const sf = path.join(cfg.dataDir, 'projects', p.style.slice(5), 'style.json'), s = JSON.parse(fs.readFileSync(sf, 'utf8')); s.verdict = { state: 'approved', said: by, film: id }; fs.writeFileSync(sf, JSON.stringify(s, null, 1) + '\n'); }
      else { const sf = path.join(cfg.dataDir, 'routing', 'styles.json'), all = JSON.parse(fs.readFileSync(sf, 'utf8')); all.styles[p.style].verdict = { state: 'approved', said: by, film: id }; fs.writeFileSync(sf, JSON.stringify(all, null, 1) + '\n'); }
    }
    const { frames } = await lookSheet(cfg, id);
    p.look = { approved: true, by, at, style: p.style, frames: frames.map((f) => f.file), board: (await import('./stills.mjs')).boardHash(cfg, id) };   // (bound to the film's design and hero stills shown on its board: stills.mjs)
  } else if (gate === 'rough') {
    if (!g.look.ok) throw new Error(`the look comes first: ${g.look.why}`);
    p.rough = { approved: true, by, at, hash: await structureHash(cfg, id) };
  } else {
    if (!g.rough.ok) throw new Error(`the structure comes first: ${g.rough.why}`);
    // the user has watched the whole film as it is now (2026-10-28: 规范不是给我看全片粗版的动效吗 — the session showed a still of
    // one changed beat): the rough reel exists and is newer than every chapter module and the hero stills it is made of
    { const st = roughCurrent(cfg, id); if (!st.ok) throw new Error(`the final is approved on the whole film's rough with its motion, as it is now: ${st.why} (node scripts/recipe-board.mjs animatic --project ${id}, then watch out/animatic.mp4)`); }
    // the final's road tried first (animatic.mjs preflightFilm: every chapter drawn by the final's page, every beat a piece)
    const pf = await (await import('./animatic.mjs')).preflightFilm(cfg, id, { log: () => {} });
    if (!pf.ok) throw new Error(`the final would not render: ${pf.errors.join('; ')} (out/film/preflight.json)`);
    p.final = { approved: true, by, at, pieces: await currentPieces(cfg, id) };
  }
  fs.writeFileSync(pf, JSON.stringify(p, null, 1) + '\n');
  return p[gate];
}

// (pure-ish, tested) is the whole film's rough reel newer than every piece it is made of (the chapters' modules, the hero
// stills' answer): what the user approves the final on
export function roughCurrent(cfg, id) {
  const root = projectPaths(cfg, id).root, reel = path.join(root, 'out', 'animatic.mp4');
  if (!fs.existsSync(reel)) return { ok: false, why: 'no rough reel yet' };
  const t = fs.statSync(reel).mtimeMs, dir = path.join(root, 'chapters'), late = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.mjs')) : []) if (fs.statSync(path.join(dir, f)).mtimeMs > t) late.push(f.replace(/\.mjs$/, ''));
  for (const f of ['stills.answer.json']) { const p = path.join(root, 'tasks', f); if (fs.existsSync(p) && fs.statSync(p).mtimeMs > t) late.push('the hero stills'); }
  return late.length ? { ok: false, why: `${late.join(', ')} changed after it was made` } : { ok: true };
}
// the line's report of the gates, one line each (run report, the status page)
export async function gateLines(cfg, id) {
  const s = await gateState(cfg, id);
  if (!s.six) return [];
  const cmd = (g) => `node scripts/recipe-board.mjs gate --project ${id} --approve ${g} --by "<your words>"`;
  // (nothing to look at yet: the key frames come after the brief and the storyboard; the Vol.047 run asked the user to
  // judge an empty sheet)
  if (s.waiting === 'look' && !(await lookFrames(cfg, id)).length) return [`2 定样子: no frames yet — they are set once the brief, the storyboard and the film's world are accepted (filmworld.mjs); then the sheet waits for you`];
  if (s.waiting === 'look') { const fr = readJson(path.join(projectPaths(cfg, id).root, 'out', 'look', 'frames.json'), {}), ds = fr.directions || [];
    const hero = fs.existsSync(path.join(projectPaths(cfg, id).root, 'out', 'look', 'sheet-hero.jpg')) ? 'the hero stills on out/look/sheet-hero.jpg and the film\'s board out/film/board.png; ' : '';
    const chosen = (() => { try { return readStyle(cfg, (loadProject(cfg, id) || {}).style)?.chosen || null; } catch { return null; } })();   // (a direction picked before: not offered again)
    if (chosen && hero) return [`2 定样子: ${hero}in the direction picked before (${chosen}) → ${cmd('look')}`];
    return ds.length > 1 ? [`2 定样子: ${hero}${ds.length} directions on out/look/sheet-${ds.join('.jpg, sheet-')}.jpg → ${cmd('look')} --pick ${ds.join('|')}; or all turned down: gate --project ${id} --reject look --say "<your words>"`] : [`2 定样子: ${hero}${s.look.why} → ${cmd('look')}`]; }
  if (s.waiting === 'design') return [`2 定设计: ${s.design.why}${s.design.making ? '' : ` → ${cmd('design')}`}`];
  if (s.waiting === 'direction') return [`1.5 定方向: ${s.direction.why} → ${cmd('direction')}`];
  if (s.waiting === 'rough') return [`3 结构白膜: ${s.rough.why} (node scripts/recipe-board.mjs animatic --project ${id}) → ${cmd('rough')}`];
  if (s.waiting === 'final') { const st = roughCurrent(cfg, id); return [`5 成片预览: ${s.final.why}; ${st.ok ? `watch the whole film's rough with its motion first: out/animatic.mp4` : `the whole film's rough is behind its pieces (${st.why}): node scripts/recipe-board.mjs animatic --project ${id}`} → ${cmd('final')}`]; }
  return [];
}
