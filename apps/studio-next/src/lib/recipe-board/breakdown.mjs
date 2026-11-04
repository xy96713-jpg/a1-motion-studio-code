// The reference taken apart finely, and the plan held to every piece of it (user, 2026-10-21: 拆的不够细，很多没对标上
// 动效、设计；执行吧). The opening passage of hupo-auto2 matched the reference's devices and materials and still read
// unlike it: the reference cut 20 times where the plan cut 13 (a 0.4 s photo burst done as one still shot), pushed in
// and pulled out on every presenter shot where ours stood still, set its year in tall condensed metal over a stock
// board where ours set it wide over a street. None of that was asked of the director, so none of it was done.
//
// Three steps, each checked by code:
//   1 measure   breakdown.py over the passage of the reference: every cut, and per sub-shot (R01, R02, ...) the
//               camera (zoom, pan, moving share, ease), the look (base, L*, chroma, grain), the type set on screen
//               (OCR: height, centre) and what appears inside it (events)
//   2 read      an agent task (shotcard-<seg>, rules prompts/shotcard.md): per sub-shot what is shown, its layers,
//               its type, its motion, its transition, its texture; checked against the measures (a measured push-in
//               must be read as one, a measured display line must have its type described)
//   3 answer    the shot plan answers every item of the breakdown (`follows`: match, or differ with the reason);
//               checked before rendering (a cut said to match must be a cut of the plan; the plan cuts nowhere the
//               reference does not, unless said why), and after the animatic by the same measures on ours
//               (compareBreakdown): a matched item that measures unlike the reference holds the final render.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectPaths, loadProject, sourcePath } from './store.mjs';
import { writeTask, readAnswer, writeCheck, taskPaths } from './agenttask.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const PY = (cfg) => process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
const dirOf = (cfg, id, seg) => path.join(projectPaths(cfg, id).root, 'out', 'passages', seg, 'breakdown');

// what counts (pure, tested)
export const BD = {
  push: 1.03, pull: .97,     // zoom over a sub-shot that reads as a push-in / pull-out
  pan: .04,                  // frame widths a sub-shot travels to read as a pan
  display: 100,              // px of 1080: a line this tall is display type (a title, a headline, a big number)
  cutTol: .3,                // s
  moving: .3,                // share of the time: ours may move this much less than the reference
  lum: 18, sat: 12,          // L*, chroma: the look's tolerance
  grain: .4,                 // ours keeps at least this share of the reference's grain where it has some (>= 1.2)
  typeSize: [.6, 1.6],       // our display line's height over the reference's
  typeAt: .25,               // frame widths between the display lines' centres
};

// 1 measure a span of a video (cached by the video, the span and the code)
export function measureSpan(cfg, video, at, dur, out, { ocr = true, frames = null, cuts = null, spans = null } = {}) {
  const key = sha([video, fs.statSync(video).mtimeMs, at, dur, ocr, (cuts || []).join(','), (spans || []).flat().join(','), fs.readFileSync(path.join(HERE, 'breakdown.py'), 'utf8')].join('|'));
  const prev = readJson(out);
  if (prev?.key === key && (!frames || fs.existsSync(frames))) return prev;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync(PY(cfg), [path.join(HERE, 'breakdown.py'), video, String(at), String(dur), out, ...(ocr ? ['--ocr', path.join(HERE, 'ocr.swift')] : []), ...(frames ? ['--frames', frames] : []), ...(cuts?.length ? ['--cuts', cuts.map((c) => c.toFixed(3)).join(',')] : []), ...(spans?.length ? ['--spans', spans.map(([a, b]) => `${a.toFixed(3)}:${b.toFixed(3)}`).join(',')] : [])], { encoding: 'utf8', timeout: 1800000, maxBuffer: 1 << 26 });
  const m = readJson(out);
  if (!m || m.error) throw new Error(`breakdown.py: ${m?.error || String(r.stderr).split('\n').filter((l) => !/OBU/.test(l)).slice(-3).join(' ')}`);
  m.key = key; fs.writeFileSync(out, JSON.stringify(m, null, 1));
  return m;
}
// the sub-shots on the film's clock, numbered
export const subsOf = (m, at = m.at) => m.subs.map((s, i) => ({ id: `R${String(i + 1).padStart(2, '0')}`, ...s, at: +(s.at + at).toFixed(2), end: +(s.end + at).toFixed(2), events: (s.events || []).map((e) => +(e + at).toFixed(2)) }));
export const displayLine = (s) => (s.text || []).filter((t) => t.h >= BD.display && [...t.text.replace(/\s/g, '')].length >= 2)[0] || null;
// the display line as the reader saw it: once a sub-shot is read, only a measured line whose words the reading names
// counts (OCR read the reference's 凭什么 as nothing and an English bullet beside it as the title, open R20; its
// 深度求索 as 深度水素, R14): a line the reading does not name is not measured against ours
// (a line of two characters is named whole: 开源 never matched three in a row and was never measured)
const named = (ocr, read) => { const o = String(ocr).replace(/\s/g, ''), r = String(read).replace(/\s/g, ''), k = Math.min(3, o.length); for (let i = 0; i + k <= o.length; i++) if (r.includes(o.slice(i, i + k))) return true; return false; };
export const displayFor = (s) => { if (!s.read) return displayLine(s); const r = [s.read.shows, s.read.layers, s.read.type].join(' '); return (s.text || []).filter((t) => t.h >= BD.display && [...t.text.replace(/\s/g, '')].length >= 2 && named(t.text, r))[0] || null; };

// the reference over a passage: measures, frames, one sheet per sub-shot (three moments) and one for the passage
export function referenceBreakdown(cfg, id, seg, range) {
  const src = sourcePath(cfg, loadProject(cfg, id).sourceVideo || '');
  if (!src || !fs.existsSync(src)) return null;
  const dir = dirOf(cfg, id, seg), frames = path.join(dir, 'ref-frames');
  const m = measureSpan(cfg, src, range[0], range[1] - range[0], path.join(dir, 'ref.json'), { frames });
  const subs = subsOf(m);
  const font = '/System/Library/Fonts/STHeiti Medium.ttc';
  subs.forEach((s, i) => {
    const sheet = path.join(dir, `${s.id}.jpg`); s.sheet = sheet;
    if (fs.existsSync(sheet)) return;
    const fr = [0, 1, 2].map((j) => path.join(frames, `${String(i).padStart(2, '0')}-${j}.jpg`)).filter((f) => fs.existsSync(f));
    if (!fr.length) return;
    const lab = `${s.id} ${s.at.toFixed(2)}-${s.end.toFixed(2)}s  zoom ${s.camera.zoom} pan ${s.camera.pan.join(' ')}`;
    spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...fr.flatMap((f) => ['-i', f]), '-filter_complex', `${fr.map((_, j) => `[${j}]`).join('')}hstack=inputs=${fr.length},drawtext=fontfile='${font}':text='${lab}':x=10:y=8:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@.7`, '-q:v', '3', sheet]);
  });
  return { file: path.join(dir, 'ref.json'), cuts: m.cuts.map((c) => +(c + range[0]).toFixed(2)), subs };
}

// the items the plan answers, from the measured sub-shots (pure, tested): the cut into it (not the first), its camera,
// its look, its type (where a display line is set), what appears inside it (where something does), its layers
export function breakdownItems(subs) {
  const out = [];
  subs.forEach((s, i) => {
    const c = s.camera, moves = [c.zoom >= BD.push ? `推近 ×${c.zoom}` : c.zoom <= BD.pull ? `拉远 ×${c.zoom}` : null, Math.abs(c.pan[0]) >= BD.pan ? `横移 ${c.pan[0] > 0 ? '向右' : '向左'} ${Math.abs(c.pan[0])}` : null, Math.abs(c.pan[1]) >= BD.pan ? `竖移 ${c.pan[1] > 0 ? '向下' : '向上'} ${Math.abs(c.pan[1])}` : null].filter(Boolean);
    if (i) out.push({ item: `${s.id}.cut`, at: s.at, says: `切 @${s.at}s` });
    out.push({ item: `${s.id}.camera`, at: s.at, says: moves.length ? moves.join('，') : `机位基本不动（动的时间 ${Math.round(c.moving * 100)}%）` });
    out.push({ item: `${s.id}.look`, at: s.at, says: `${s.look.base === 'dark' ? '暗底' : '亮底'} L*${s.look.lum} 彩度${s.look.sat} 颗粒${s.look.grain}` });
    // a display line the reader says is not type of the frame (OCR of a microphone's print, a T-shirt) is no item
    const d = displayFor(s); if (d && !NOT_TYPE.test(s.read?.type || '')) out.push({ item: `${s.id}.type`, at: s.at, says: `大字「${d.text}」高 ${d.h}px，中心 (${d.cx}, ${d.cy})` });
    if ((s.events || []).length) out.push({ item: `${s.id}.events`, at: s.at, says: `镜头里有 ${s.events.length} 次元素出现/变化 @${s.events.join(', ')}s` });
    out.push({ item: `${s.id}.layers`, at: s.at, says: '画面分层（见拆解卡）' });
  });
  return out;
}

// 2 the agent's reading of the sub-shots (task breakdown-<seg>)
export function breakdownTask(cfg, id, seg, range) {
  const ref = referenceBreakdown(cfg, id, seg, range); if (!ref) return null;
  const step = `shotcard-${seg}`, P = taskPaths(cfg, id, step), prev = readJson(P.task), print = sha(JSON.stringify(ref.subs.map((s) => [s.at, s.end])));
  if (prev?.input?.print !== print) {
    writeTask(cfg, id, step, { rules: 'work/recipe-board-v1/prompts/shotcard.md', schema: 'work/recipe-board-v1/routing/shotcard.schema.json',
      input: { seg, range, print, subs: ref.subs.map(({ sheet, ...s }) => ({ ...s, sheet, display: displayLine(s) })) }, images: ref.subs.map((s) => s.sheet).filter(Boolean) });
    if (fs.existsSync(P.answer)) fs.rmSync(P.answer);
  }
  return { task: P.task, subs: ref.subs };
}
export const NOT_TYPE = /^\s*(无|none)\b|^\s*无[：:，,]/i;
const SAYS_PUSH = /推|放大|拉近|push|zoom ?in/i, SAYS_PULL = /拉远|拉出|缩小|后退|pull|zoom ?out/i, SAYS_PAN = /移|摇|滑|滚|平移|pan|slide|drift|track|scroll/i;   // (滚: a page scrolled down is a pan: meta R04)
export function checkBreakdownAnswer(answer, subs, devices = null) {
  const err = [], got = answer?.subs || [];
  for (const s of subs) {
    const v = got.find((x) => x.id === s.id);
    if (!v) { err.push(`${s.id}: not read`); continue; }
    for (const k of ['shows', 'layers', 'motion', 'transition', 'texture']) if (!String(v[k] || '').trim()) err.push(`${s.id}: ${k} is empty`);
    if (devices && !devices.includes(v.device)) err.push(`${s.id}: device is one of ${devices.join(' / ')}`);
    if (devices && !['page', 'photo', 'cutout', 'portrait', 'logo', 'footage', 'none'].includes(v.material)) err.push(`${s.id}: material is page / photo / cutout / portrait / logo / footage / none`);
    const c = s.camera;
    if (c.zoom >= BD.push && !SAYS_PUSH.test(v.motion)) err.push(`${s.id}: the camera pushes in (×${c.zoom}); the motion does not say so`);
    if (c.zoom <= BD.pull && !SAYS_PULL.test(v.motion)) err.push(`${s.id}: the camera pulls out (×${c.zoom}); the motion does not say so`);
    if ((Math.abs(c.pan[0]) >= BD.pan || Math.abs(c.pan[1]) >= BD.pan) && !SAYS_PAN.test(v.motion)) err.push(`${s.id}: the camera travels (${c.pan.join(', ')} frame widths); the motion does not say so`);
    const d = displayLine(s);
    if (d && !String(v.type || '').trim()) err.push(`${s.id}: display type is set there ("${d.text}", ${d.h} px); describe it (face, weight, width, colour, effect, how it comes in), or say 无：why it is not type of the frame (print on a prop)`);
  }
  return err;
}
// the accepted reading, with the measures: out/passages/<seg>/breakdown/card.json (the 拆解卡)
export function breakdownCard(cfg, id, seg) {
  const step = `shotcard-${seg}`, t = readJson(taskPaths(cfg, id, step).task), a = readAnswer(cfg, id, step);
  if (!t) return { state: 'none' };
  if (!a) return { state: 'waiting', task: taskPaths(cfg, id, step).task };
  // the devices the director plans with (the shot plan's schema): each sub-shot is named as one of them
  const devices = readJson(path.join(cfg.dataDir, 'routing', 'shotplan.schema.json'))?.properties?.reference?.items?.properties?.device?.enum || null;
  const errors = checkBreakdownAnswer(a, t.input.subs, devices);
  if (JSON.stringify(readJson(taskPaths(cfg, id, step).check)?.errors) !== JSON.stringify(errors)) writeCheck(cfg, id, step, { errors });
  if (errors.length) return { state: 'rejected', errors };
  // the reference's measures as the measuring code takes them now (cached by it): a measure added later (the pace of
  // the packaging, camera.anim) reaches the cards already read; the reading is kept where the cuts are the same
  let base = t.input.subs;
  try { const now = loadProject(cfg, id).sourceVideo ? referenceBreakdown(cfg, id, seg, t.input.range) : null;
    if (now && now.subs.length === base.length && now.subs.every((x, i) => Math.abs(x.at - base[i].at) < .05 && Math.abs(x.end - base[i].end) < .05)) base = base.map((x, i) => ({ ...x, camera: now.subs[i].camera, look: now.subs[i].look, events: now.subs[i].events })); } catch { /* the stored measures stand */ }
  const subs = base.map((s) => ({ ...s, read: a.subs.find((x) => x.id === s.id) }));
  const card = { seg, range: t.input.range, cuts: subs.slice(1).map((s) => s.at), subs, items: breakdownItems(subs) };
  // written when it changed (its time says when the plan last had a new card to answer: shotplan.passageState)
  const f = path.join(dirOf(cfg, id, seg), 'card.json'), body = JSON.stringify(card, null, 1) + '\n';
  if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== body) { fs.writeFileSync(f, body); fs.writeFileSync(path.join(dirOf(cfg, id, seg), 'card.md'), cardText(card)); }
  return { state: 'ready', card };
}
export const readCard = (cfg, id, seg) => readJson(path.join(dirOf(cfg, id, seg), 'card.json'));
export function cardText(card) {
  const L = [`# 拆解卡 ${card.seg}（${card.range[0]}–${card.range[1]} s，${card.subs.length} 个小镜头，${card.cuts.length} 个切点）`, ''];
  for (const s of card.subs) {
    L.push(`## ${s.id} ${s.at.toFixed(2)}–${s.end.toFixed(2)} s（${(s.end - s.at).toFixed(2)} s）`);
    L.push(`- 画面：${s.read.shows}`, `- 分层：${s.read.layers}`, `- 字：${s.read.type || '无'}`, `- 动效：${s.read.motion}`, `- 转场：${s.read.transition}`, `- 质感：${s.read.texture}`);
    L.push(`- 实测：zoom ×${s.camera.zoom}，pan ${s.camera.pan.join(' / ')}，动 ${Math.round(s.camera.moving * 100)}%，ease ${s.camera.ease ?? '-'}${s.camera.anim?.build != null ? `；画面里元素 ${s.camera.anim.onset} s 起动、${s.camera.anim.build} s 出齐、${s.camera.anim.pulses} 拍` : ''}；${s.look.base} L*${s.look.lum} 彩度 ${s.look.sat} 颗粒 ${s.look.grain}${displayLine(s) ? `；大字「${displayLine(s).text}」${displayLine(s).h}px` : ''}${s.events?.length ? `；出现 @${s.events.join(', ')}` : ''}`, '');
  }
  return L.join('\n');
}

// 3a the plan's answers to the items, before rendering (pure, tested). follows: [{ item, does: match | differ, how }]
export function followErrors(answer, card, { tol = BD.cutTol, norms = false } = {}) {
  if (!card) return [];
  const err = [], f = answer?.follows || [], shots = answer?.shots || [];
  const by = new Map(f.map((x) => [x.item, x]));
  for (const it of card.items) {
    const v = by.get(it.item);
    if (!v) { err.push(`拆解 ${it.item}（${it.says}）: not answered; say how the plan does it (match) or why not (differ)`); continue; }
    if (!['match', 'differ'].includes(v.does)) err.push(`拆解 ${it.item}: does is match or differ`);
    if (String(v.how || '').trim().length < 6) err.push(`拆解 ${it.item}: say how${v.does === 'differ' ? ' and why not' : ''} in a few words`);
  }
  for (const x of f) if (!card.items.some((it) => it.item === x.item) && !/^plan-cut@/.test(x.item) && !(/^R\d+\.shows$/.test(x.item) && card.subs.some((r) => `${r.id}.shows` === x.item))) err.push(`拆解 ${x.item}: no such item`);
  const planCuts = shots.slice(1).map((s) => s.at);
  // a cut said to match is a cut of the plan
  for (const it of card.items.filter((x) => x.item.endsWith('.cut'))) if (by.get(it.item)?.does === 'match' && !planCuts.some((c) => Math.abs(c - it.at) <= tol)) err.push(`拆解 ${it.item}: said to match, but the plan does not cut near ${it.at} s`);
  // a cut of the plan where the reference has none: said why (plan-cut@<shot>)
  // (a norm card's cuts are the guess's beat ends: the director may cut inside a beat, on a word; cutsOnWords warns)
  if (!norms) for (const s of shots.slice(1)) if (!card.cuts.some((c) => Math.abs(c - s.at) <= tol) && !by.has(`plan-cut@${s.id}`)) err.push(`${s.id} cuts at ${s.at} s where the reference does not cut (nearest ${card.cuts.reduce((a, c) => (Math.abs(c - s.at) < Math.abs(a - s.at) ? c : a), Infinity)} s): move the cut, or answer plan-cut@${s.id} with the reason`);
  return err;
}

// 3a' the grounds of the plan's titles against the card's reading (pure, tested; user, 2026-10-22: 你是看不懂原片背景设计
// 吗 不能是用 wiki 啊 或者你用生图设计). The reference lays its big words on designed grounds: an explainer slide (the
// whale and three points, open R20), a still life of app tiles and glass lenses (R14); the plan laid them on a captured
// Wikipedia page, blurred. A title's ground that is a page capture is right only where the card reads the ground as a
// real page; a designed ground is painted (bg: { art: { prompt } }) and the real marks and facts set on it by code
// (title card / tiles).
const REAL_PAGE = /截图|网页|报道页|页面截图|screenshot/i, DESIGNED = /拼贴|设计|说明卡|幻灯|演示|场景|道具|静物|放大镜|图标|slide|still life/i;
export const isCapture = (src, index = null) => { const k = index?.files?.[src]?.kind; return k ? k === 'page' : /\.(png)$/i.test(src || '') && /-(com|org|net|cn|io|gov)-|wikipedia|-window\.png$/i.test(src || ''); };
export function groundErrors(answer, card, { index = null } = {}) {
  if (!card) return [];
  const err = [];
  for (const sh of answer?.shots || []) {
    let sp; try { sp = typeof sh.spec === 'string' ? JSON.parse(sh.spec) : sh.spec || {}; } catch { continue; }
    if (sh.module !== 'title' || typeof sp.bg !== 'string' || !isCapture(sp.bg, index)) continue;
    for (const r of card.subs.filter((x) => Math.min(x.end, sh.end) - Math.max(x.at, sh.at) > Math.min(.5, (x.end - x.at) / 2))) {
      const ground = String(r.read?.layers || '').split(/[；;]/)[0];
      if (DESIGNED.test(ground) || !REAL_PAGE.test(ground)) err.push(`${sh.id}: the title lies on a page capture, but the reference's ground at ${r.id} is designed (${ground.slice(0, 40)}): paint it (bg: { art: { prompt } }, text-free) and set the real mark and facts on it (card / tiles)`);
    }
  }
  return err;
}

// 3b ours measured as the reference was, after the animatic (pure, tested): each matched item of a sub-shot is held
// to the measure of ours over the same seconds. Returns problems { item, shot?, kind, say, owner }.
// styleOwnsLook: the film has its own style (not the reference's look): light, colour and grain are the style's, the
// structure (cuts, camera, type, events, what is shown) is still held to the reference
export function compareBreakdown(card, ours, follows = [], { shots = [], halfDensity = false, grainOnly = false, styleOwnsLook = false } = {}) {
  const out = [], matched = new Set(follows.filter((x) => x.does === 'match').map((x) => x.item));
  const shotAt = (t) => shots.find((s) => t >= s.at - .01 && t < s.end)?.id || null;
  const over = (r) => ours.map((o) => ({ o, w: Math.max(0, Math.min(o.end, r.end) - Math.max(o.at, r.at)) })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
  // our cuts are known: the plan's shot boundaries (a cut between two framings of one page differs too little to be
  // seen by the frame difference: open S3 -> S4); measured only when no plan is given
  const ourCuts = shots.length ? shots.slice(1).map((s) => s.at) : ours.slice(1).map((o) => o.at);
  if (grainOnly) follows = follows.filter((x) => /\.look$/.test(x.item));
  for (const r of card.subs) {
    const mid = (r.at + r.end) / 2, shot = shotAt(mid), add = (item, kind, say, owner = 'module') => out.push({ item, shot, kind, say, owner });
    if (matched.has(`${r.id}.cut`) && !ourCuts.some((c) => Math.abs(c - r.at) <= BD.cutTol)) add(`${r.id}.cut`, 'cut', `the reference cuts at ${r.at} s; ours does not`, 'plan');
    const ws = over(r); if (!ws.length) continue;
    // the sub-shot of ours that covers it most (its camera over the same seconds)
    // ours over the reference's sub-shot as a whole: our cuts inside it (a card swapped in place, a page curled in:
    // h800-S3 came out in three pieces) each add their share of the move: zooms multiply, pans add, the moving share
    // is weighted by time (the longest piece alone was a still curled page set against an 11 s push)
    const o = ws[0].o, rc = r.camera, part = (x) => x.w / Math.max(.01, x.o.end - x.o.at), tw = ws.reduce((m, x) => m + x.w, 0);
    // (where the reference cuts inside a shot of ours, ours is read over the reference's own seconds, never its whole
    // shot's move prorated: recap-S6 pushed ×1.10 in the reference's 0.5 s and was measured ×1.01)
    const direct = ws.some((x) => part(x) < .9) && (ours.spans || []).find((x) => Math.abs(x.at - r.at) < .05 && Math.abs(x.end - r.end) < .05);
    const oc = direct ? direct.camera : { zoom: +ws.reduce((m, x) => m * Math.pow(x.o.camera.zoom || 1, part(x)), 1).toFixed(3), pan: [0, 1].map((k) => +ws.reduce((m, x) => m + (x.o.camera.pan?.[k] || 0) * part(x), 0).toFixed(3)), moving: +(ws.reduce((m, x) => m + (x.o.camera.moving || 0) * x.w, 0) / Math.max(.01, tw)).toFixed(2) };
    // the look and the type are read at one moment of the reference's sub-shot (70 % in: breakdown.py); ours is read in
    // the sub-shot of ours holding that moment (a page curled in split our h800-S3 in two: the presenter half was set
    // against the reference's page)
    const t70 = r.at + (r.end - r.at) * .7, oAt = ours.find((x) => t70 >= x.at && t70 < x.end) || o;
    if (matched.has(`${r.id}.camera`)) {
      if (rc.zoom >= BD.push && !(oc.zoom >= 1 + (rc.zoom - 1) * .5)) add(`${r.id}.camera`, 'camera', `the reference pushes in ×${rc.zoom} over ${r.at}-${r.end} s; ours ×${oc.zoom}`);
      if (rc.zoom <= BD.pull && !(oc.zoom <= 1 - (1 - rc.zoom) * .5)) add(`${r.id}.camera`, 'camera', `the reference pulls out ×${rc.zoom} over ${r.at}-${r.end} s; ours ×${oc.zoom}`);
      for (const k of [0, 1]) if (Math.abs(rc.pan[k]) >= BD.pan && !(Math.sign(oc.pan[k]) === Math.sign(rc.pan[k]) && Math.abs(oc.pan[k]) >= Math.abs(rc.pan[k]) * .5)) add(`${r.id}.camera`, 'camera', `the reference travels ${k ? 'vertically' : 'sideways'} ${rc.pan[k]} frame widths over ${r.at}-${r.end} s; ours ${oc.pan[k]}`);
      // (moving share: only where the move itself fell short; a slow even pull-out that travels as far is moving)
      const travelled = (rc.zoom >= BD.push || rc.zoom <= BD.pull || Math.abs(rc.pan[0]) >= BD.pan || Math.abs(rc.pan[1]) >= BD.pan) && !out.some((x) => x.item === `${r.id}.camera`);
      if (!travelled && rc.moving - oc.moving > BD.moving) add(`${r.id}.camera`, 'camera', `the reference moves ${Math.round(rc.moving * 100)}% of ${r.at}-${r.end} s; ours ${Math.round(oc.moving * 100)}%`);
    }
    if (matched.has(`${r.id}.look`) && !styleOwnsLook) {
      const rl = r.look, ol = oAt.look;
      // (dark / light is a cut at L* 45: two frames either side of it by a few points look alike, meta R01 47.6 / 43.4)
      if (rl.base !== ol.base && Math.abs(rl.lum - ol.lum) > 8) add(`${r.id}.look`, 'look', `the reference is ${rl.base} (L*${rl.lum}) over ${r.at}-${r.end} s; ours ${ol.base} (L*${ol.lum})`);
      else if (Math.abs(rl.lum - ol.lum) > BD.lum) add(`${r.id}.look`, 'look', `L* ${ol.lum} against the reference's ${rl.lum}`);
      if (Math.abs(rl.sat - ol.sat) > BD.sat) add(`${r.id}.look`, 'look', `chroma ${ol.sat} against the reference's ${rl.sat}`);
      // (grain is fine detail: on the white model, rendered at half density, it is blurred away; it is measured on the
      // final film instead, grainOnly)
      if (!halfDensity && rl.grain >= 1.2 && !(ol.grain >= rl.grain * BD.grain)) add(`${r.id}.look`, 'look', `grain ${ol.grain} against the reference's ${rl.grain}`);
    }
    if (matched.has(`${r.id}.type`)) {
      // (ours: the line that says what the reference's says, by shared characters; the tallest only when none does: on
      // a page every line is the same height and a bold neighbour was taken for the highlighted one, open-S4)
      const rd = displayFor(r), same = (t) => { if (!rd) return 0; const a = new Set([...rd.text.replace(/\s/g, '')]); return [...t.text.replace(/\s/g, '')].filter((c) => a.has(c)).length / Math.max(1, a.size); };
      const ourLines = ws.flatMap((x) => x.o.text || []).filter((t) => t.h >= BD.display * .6), bySame = rd ? ourLines.filter((t) => same(t) >= .4).sort((a, b) => b.h - a.h)[0] : null;
      const od = bySame || ws.map((x) => displayLine(x.o)).find(Boolean) || (ws.flatMap((x) => x.o.text || []).sort((a, b) => b.h - a.h)[0] || null);
      if (rd && !od) add(`${r.id}.type`, 'type', `the reference sets 「${rd.text}」 ${rd.h} px over ${r.at}-${r.end} s; ours sets no display line`);
      else if (rd && od) {
        const k = od.h / rd.h;
        if (k < BD.typeSize[0] || k > BD.typeSize[1]) add(`${r.id}.type`, 'type', `display line ${od.h} px against the reference's ${rd.h} px (「${rd.text}」)`);
        if (Math.hypot(od.cx - rd.cx, (od.cy - rd.cy) * 9 / 16) > BD.typeAt) add(`${r.id}.type`, 'type', `display line centred at (${od.cx}, ${od.cy}), the reference's at (${rd.cx}, ${rd.cy})`);
      }
    }
    // (a change inside one of our shots that the measure took for a cut, a card swapped in place, a page curled in, is a
    // change all the same: h800-S3 swapped and curled and read as nothing appearing)
    const innerCuts = ours.slice(1).map((x) => x.at).filter((c) => c > r.at + .2 && c < r.end - .2 && !shots.some((sh) => Math.abs(sh.at - c) < .3));
    // the pace of the packaging (camera.anim, breakdown.py: what moves besides the camera; user, 2026-10-22: 包装成熟；
    // 元素动画对标): the reference reveals 凭什么 over 2.7 s in three beats where ours showed it all in 0.3 s (open R20);
    // its bar sweeps a line in 0.6 s where ours took 1.8 (R03). Not on the presenter (ours is a still stand-in).
    if (matched.has(`${r.id}.events`) && !PRESENTER.has(r.read?.device)) for (const p of animErrors(r.camera?.anim, ws.map((x) => x.o.camera?.anim).find((a) => a && a.level != null))) add(`${r.id}.events`, 'events', `${p} over ${r.at}-${r.end} s`);
    if (matched.has(`${r.id}.events`) && (r.events || []).length >= 2 && !innerCuts.length && !ws.some((x) => (x.o.events || []).some((e) => e > r.at - .2 && e < r.end + .2))) add(`${r.id}.events`, 'events', `${r.events.length} things appear in the reference over ${r.at}-${r.end} s; nothing appears in ours`);
  }
  if (grainOnly) return out.filter((p) => /^grain /.test(p.say));
  return out;
}
// 3c what ours shows against what the reference shows, sub-shot by sub-shot (user, 2026-10-22: 为什么素材对不上): each
// pair of frames (the middle of the reference's sub-shot, ours at the same moment) named from likeness.py's kinds of
// picture; where both are named with confidence (BD.kind) and the kinds are of different groups, ours shows something
// else (a trading room for the reference's TV board of share prices, open-S2; for its K-line chart, S17). Owned by the
// director: the shot's means are wrong (a data picture is drawn by code, the market module; a person is a photo; a
// page a capture), and a stand-in is held to it like any pick. A plan may answer <R>.shows differ with the reason.
BD.kind = .8;
export const ROUTE = { data: 'draw it with code from the real numbers (module market: board / candles, or chart)', person: 'a photo or footage of that person', page: 'a capture of the page (article)', mark: 'the real mark (brand / insert of the logo)', type: 'a title over the reference\'s kind of ground', place: 'footage of that kind of place', thing: 'a photo or footage of that thing' };
// the groups of likeness.py a device of the card shows
export const GROUPS = { presenter: ['person'], 'side-card': ['person'], quote: ['person', 'type'], person: ['person'], chat: ['person', 'page'], article: ['page', 'type'], pagecurl: ['page', 'person'], screen: ['page'], market: ['data'], chart: ['data', 'type'], table: ['data'], brand: ['mark', 'page', 'thing'], title: ['type', 'mark', 'page', 'person', 'place'], broll: ['place', 'thing', 'person', 'data'], compare3d: ['thing'], diagram: ['data', 'thing'] };
export function showsErrors(card, scores, follows = [], { shots = [] } = {}) {
  const out = [], differ = new Set(follows.filter((x) => x.does === 'differ').map((x) => x.item));
  for (const r of card.subs) {
    const v = scores?.[r.id]; if (!v || differ.has(`${r.id}.shows`)) continue;
    const [rk, rg, rp] = v.a, [ok, og, op] = v.b;
    // the reference's kind is believed only where the card's reader agrees (open R16: its huge blue number on a yellow
    // bar named a TV board of prices, the reader an article page)
    // (and ours is flagged only when its kind is not one the reader's device shows either: a title over a code screen
    // named page on the reference and type on ours is the same thing, who R07)
    const agrees = (!r.read?.device || !GROUPS[r.read.device] || GROUPS[r.read.device].includes(rg)) && !(GROUPS[r.read?.device] || []).includes(og);
    if (agrees && rg !== og && rp >= BD.kind && op >= BD.kind) {
      const mid = (r.at + r.end) / 2, shot = shots.find((s) => mid >= s.at - .01 && mid < s.end)?.id || null;
      out.push({ item: `${r.id}.shows`, shot, kind: 'shows', say: `the reference shows ${rk} (${rg}) over ${r.at}-${r.end} s; ours shows ${ok} (${og}): ${ROUTE[rg] || 'the reference\'s kind of picture'}`, owner: 'plan' });
    }
  }
  return out;
}
export function likenessOf(cfg, id, seg, card, film, range) {
  const dir = dirOf(cfg, id, seg), outp = path.join(dir, 'shows.json');
  const pairs = card.subs.map((r, i) => ({ id: r.id, a: { image: path.join(dir, 'ref-frames', `${String(i).padStart(2, '0')}-1.jpg`) }, b: { video: film, t: +((r.at + r.end) / 2 - range[0]).toFixed(3) } })).filter((p) => fs.existsSync(p.a.image));
  const key = sha([film, fs.statSync(film).mtimeMs, JSON.stringify(pairs), fs.readFileSync(path.join(HERE, 'likeness.py'), 'utf8')].join('|')), prev = readJson(outp);
  if (prev?.key === key) return prev.scores;
  const pf = path.join(dir, 'shows-pairs.json'); fs.writeFileSync(pf, JSON.stringify(pairs));
  const r = spawnSync(PY(cfg), [path.join(HERE, 'likeness.py'), pf, outp], { encoding: 'utf8', timeout: 600000, env: { ...process.env, A1_OPENCLIP_CACHE: path.join(cfg.sourceRoot, '.codex-artifacts/runtime/openclip') } });
  const scores = readJson(outp);
  if (!scores) { console.warn(`  likeness.py: ${String(r.stderr).trim().split('\n').slice(-1)[0]}`); return null; }
  fs.writeFileSync(outp, JSON.stringify({ key, scores }, null, 1));
  return scores;
}

// the pace of what moves besides the camera, ours against the reference (pure, tested): onset, build, beats, amount
BD.anim = { build: [.5, 2], buildGap: .6, onset: .6, beats: 3, level: .35 };
const PRESENTER = new Set(['presenter', 'side-card']);
export function animErrors(ra, oa, L = BD.anim) {
  const out = [];
  if (!ra || ra.build == null || !oa) return out;
  if (oa.build == null) return [`the reference's graphics move for ${ra.build} s (${ra.pulses} beats); nothing moves in ours besides the camera`];
  if (ra.build >= 1 && oa.build < ra.build * L.build[0]) out.push(`ours builds in ${oa.build} s, the reference over ${ra.build} s (things come one after another): spread the reveal`);
  if (oa.build > ra.build * L.build[1] && oa.build - ra.build > L.buildGap) out.push(`ours takes ${oa.build} s to build, the reference ${ra.build} s: faster`);
  if (ra.onset != null && oa.onset != null && oa.onset - ra.onset > L.onset) out.push(`ours starts moving ${oa.onset} s in, the reference at once (${ra.onset} s)`);
  if (ra.pulses >= L.beats && oa.pulses * 2 < ra.pulses) out.push(`${oa.pulses} beat(s) of movement in ours, ${ra.pulses} in the reference: more things in turn`);
  if (ra.level >= 3 && oa.level < ra.level * L.level) out.push(`the picture moves much less than the reference's (${oa.level} against ${ra.level})`);
  return out;
}
// ours, measured over the passage's animatic (one film: the plan's cuts are in it)
// (spans: the reference's sub-shots, [at, end] on the film's clock; ours' camera is measured over each as well: .spans)
export function oursBreakdown(cfg, id, seg, film, range, { name = 'ours', ocr = true, cuts = null, spans = null } = {}) {
  const m = measureSpan(cfg, film, 0, range[1] - range[0], path.join(dirOf(cfg, id, seg), `${name}.json`), { ocr, cuts: cuts && cuts.map((c) => c - range[0]), spans: spans && spans.map(([a, b]) => [Math.max(0, a - range[0]), b - range[0]]) });
  const subs = subsOf(m, range[0]);
  subs.spans = (m.spans || []).map((x) => ({ ...x, at: +(x.at + range[0]).toFixed(2), end: +(x.end + range[0]).toFixed(2) }));
  return subs;
}

// The inventory's beats (the independent judge of a plan: shotplan.judgeBeats) set on the card's measured cuts (pure,
// tested). The inventory was written by eye at a coarse grain and misread the opening in places (it filed 33.9-43.4 s as
// one article where the reference cuts to the plain presenter at 38.13 s; it filed 0-0.6 s as the presenter, a cut the
// reference does not make): each sub-shot of the card takes the device of the inventory beat that covers most of it,
// except that a sub-shot read as the presenter alone (讲者 with nothing on it) is the presenter; then neighbours with
// the same device are one beat again.
export const PLAIN_READ = /^讲者[^，,；;]*[，,]?\s*(没有|无)(包装|卡|标签)/;
// the reader names each sub-shot's device (prompts/shotcard.md); where it does, that is the beat (the inventory's
// beat stays the cross-check: shotplan reports the disagreement); materialOf(device) for a device the inventory did not
// see there
export function judgeOnCard(judge, card, { materialOf = () => 'none' } = {}) {
  if (!judge?.length || !card?.subs?.length) return judge;
  const ov = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.at, b.at));
  const out = [];
  for (const s of card.subs) {
    const j = judge.map((b) => ({ b, o: ov(b, s) })).sort((x, y) => y.o - x.o)[0];
    let beat = j && j.o > 0 ? { device: j.b.device, material: j.b.material, shows: j.b.shows } : { device: 'presenter', material: 'none', shows: '讲者' };
    const d = s.read?.device;
    if (d && (d !== beat.device || (s.read.material && s.read.material !== beat.material))) beat = { device: d, material: s.read.material || (d === 'presenter' ? 'none' : materialOf(d)), shows: s.read.shows || d };
    else if (!d && PLAIN_READ.test(s.read?.shows || '')) beat = { device: 'presenter', material: 'none', shows: '讲者' };
    const prev = out.at(-1);
    if (prev && prev.device === beat.device && prev.shows === beat.shows) prev.end = s.end; else out.push({ at: s.at, end: s.end, ...beat });
  }
  return out;
}
