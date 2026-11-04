// The shot director (镜头导演): a passage of narration laid out end to end as shot modules (modules.mjs), by an agent
// that first studies how the reference tells the same passage (its frames and cut points), then checked by the line,
// rendered shot by shot and joined into one passage beside the reference (the user, 2026-10-21: 系统自己写方案,
// 不手写坐标). Agent task like brief / storyboard: tasks/shotplan-<seg>.task.json -> .answer.json -> .check.json;
// accepted plans: projects/<id>/modules/<seg>/<shot>.json. Rules: prompts/shotplan.md; schema: routing/shotplan.schema.json
// (strict: the module spec travels as JSON text).
//
// Beat by beat against the reference (the user, 2026-10-21: 我希望的不是修修补补这一个片子, 是希望系统导演能给我很好的设计):
// the agent first writes the reference's beats (device, material, what is on screen); the line sets the plan against them
// (compareToReference) and refuses a plan that quietly puts another device where the reference's device exists as a
// module, unless the shot files a request for the material it lacks. Requests become material needs
// (requestNeeds) that the materials step searches, approves (its gates) and fetches into materials/clips; when the
// material arrives the director is sent back to re-plan the shot (runShotplan). A report per passage
// (tasks/shotplan-<seg>.report.md) says how much of the telling and of the material matches and what is still missing.
import { motionDefaults, motionErrors } from './motion-language.mjs';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertRenderStorage, projectPaths, loadProject, sourcePath } from './store.mjs';
import { assertScopeAllows } from './project-scope.mjs';
import { sixStage } from './gatestate.mjs';
import { writeTask, readAnswer, writeCheck, taskPaths, agentFor, runCodexTask } from './agenttask.mjs';
import { checkModuleSpec, renderModule, besideReference, MODULES, phraseErrors, styles as STYLE_LIB } from './modules.mjs';
import { studyReference } from './aesthetic.mjs';
import { buildIndex, readIndex, materialErrors, describe, picks } from './matindex.mjs';
import { reviewState } from './layers.mjs';
import { notSourceErrors, STOCK_MARK } from './materials.mjs';
import { houseRules } from './house.mjs';
import * as G from './gatestate.mjs';
import { draftErrors, cameraOf } from './draft.mjs';
import { varietyErrors } from './scriptcard.mjs';
import { readCard, followErrors, groundErrors, breakdownTask, breakdownCard, judgeOnCard, displayFor, BD } from './breakdown.mjs';
const HERE_SP = path.dirname(new URL(import.meta.url).pathname);

const TRANSCRIPT = 'work/bv1a63d6ceba-packaging-study-20260923/coverage-audit-v2/source-transcript-word-timing-v1.json';
const MAX_SHOT = 12;

// The playbook (导演手法库): the reference's devices (style-lab/technique-inventory: 69 sequences, 14 devices), each with
// when the narration calls for it, the real material it takes, what of it may be generated (art: never facts, people or
// products), and the module that does it; module null = no module yet (a gap the report lists, never a reason to put
// another device there quietly). The director chooses from this with or without a reference; the reference's own
// sequences of each device go with it as examples (the inventory's observations, and frames in blind mode).
export const DEVICES = {
  presenter: { name: '纯讲者（无包装）', module: 'sidecard', material: 'none', when: '讲者自己的过渡、感慨、收束；一两秒的换气。连续不超过 6 秒', art: null },
  'side-card': { name: '讲者加侧边卡片 / 撕纸标签', module: 'sidecard', material: 'cutout', when: '讲者在讲一个产品、型号或一组对照概念：产品卡（真实抠图）在一侧原位换；观点、比喻用撕纸标签，一侧先出另一侧补', art: '撕纸、卡面（模块美术套件）' },
  pagecurl: { name: '翻页卷入', module: 'sidecard', material: 'page', when: '讲者讲到一份资料（参数表、文件）：那一页从角上卷进来铺满，卡片留在原处', art: null },
  article: { name: '报道逐段高亮推进', module: 'article', material: 'page', when: '引用一篇报道、文章、帖子、公告：真实页面，标题逐字打出，镜头连续推进到正在读的那一句，黑条或黄条刷过', art: null },
  chat: { name: '聊天记录', module: 'chat', material: 'portrait', when: '模拟对话、群聊、"他发现……"这种口吻的转述', art: null },
  table: { name: '数据表逐行打出', module: 'table', material: 'none', when: '两三样东西按几项对比（参数、效率、履历）：暗场表格逐行出，结论列金色', art: null },
  compare3d: { name: '暗场硬件对比图解', module: 'compare', material: 'cutout', when: '讲一件硬件里面怎么分工、改了什么：真实产品先画线稿再扫成实物，左右两组说明', art: '线稿（由真实抠图描出）' },
  brand: { name: '品牌 / 产品页指认（整屏亮相）', module: 'brand', material: 'photo', when: '第一次点名一家公司、一个产品、一个模型：它的真实标志或产品页整屏亮相 1–4 秒', art: null },
  broll: { name: '实拍素材快切插入', module: 'insert', material: 'footage', when: '讲到一个场景、一群人、钱、交易、办公室：真实视频或照片整屏插 1–5 秒，切回讲者', art: null },
  diagram: { name: '原理图 / 流程节点逐步展开', module: 'steps', material: 'none', when: '讲一个过程、方法、步骤（先……再……；第一步……）：纸面上节点沿虚线逐个出现，关键一步标红', art: '节点里的配图（圆环里的物件照片：免费真实照片优先，没有就生成）' },
  title: { name: '大字标题压在实拍 / 资料上', module: 'title', material: 'photo', when: '一个章节的题眼、一个设问（凭什么？）、一个时间锚点（2023年）、一个概念：大字压在压暗的真实素材上，下面一行小英文', art: '底图（没有合适真实素材时：生成的无字底图）' },
  quote: { name: '引语排字', module: 'quote', material: 'portrait', when: '复述某人说过的话（他说……；原话是……）：黑白人像在一侧，原话一组一组排出；或讲者两侧排字', art: null },
  person: { name: '人物资料卡', module: 'person', material: 'portrait', when: '第一次介绍一个具名人物（谁、做什么的）：真实照片加大号姓名、拼音或英文名、身份', art: null },
  recap: { name: '关键词回顾接力', module: null, material: 'none', when: '结尾回顾几个关键词', art: null },
  screen: { name: '界面演示（网页 / 软件）', module: 'screen', material: 'page', when: '讲一个产品、网站、软件界面上的某个东西（这个按钮、这一栏、这个价格）：真实截图在暗场里略带透视，鼠标滑过去点一下，镜头推上去框出来', art: null },
  chart: { name: '图表', module: 'chart', material: 'none', when: '讲几个数字的大小、涨跌、排名：纸面上名字、箭头、巨大数字逐个出现，镜头在它们之间移动', art: null },
  // (a picture of data is code's: the trading room's LED ticker stood in for the board and the chart, open-S2, S17)
  market: { name: '行情画面（股价榜 / K 线）', module: 'market', material: 'none', when: '讲股价涨跌、市值蒸发、某天大跌：电视财经台式的收盘股价榜逐行亮出（board），或真实日线画的 K 线图、最后一根大阴线落下（candles）；数字全部来自存档的行情数据（market.mjs），从不找视频或截图顶', art: null },
};
// the inventory's examples of each device (time, length, what the reference does), to teach the director the house way
export function playbook(cfg, { examples = 3 } = {}) {
  const f = path.join(cfg.dataDir, 'style-lab', 'technique-inventory', 'inventory.json');
  const inv = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { techniques: [] };
  return Object.entries(DEVICES).map(([key, d]) => ({ key, ...d, examples: (inv.techniques.find((t) => t.key === key)?.examples || []).filter((e) => /^P/.test(e.id)).slice(0, examples).map((e) => ({ id: e.id, seconds: e.dur, does: e.obs })) }));
}
// The reference's beats as the inventory records them (independent of the director): the sequences over the range, a
// later one cutting an earlier one short, the gaps the plain presenter. Used to judge a plan when the project's
// recording is the film the inventory was made from (project.referenceInventory).
const MATERIAL_OF = { article: 'page', pagecurl: 'page', brand: 'photo', person: 'portrait', quote: 'portrait', chat: 'portrait', compare3d: 'cutout', broll: 'footage' };
export function inventoryBeats(inv, [a, b]) {
  const seqs = inv.techniques.flatMap((t) => t.examples.map((e) => ({ device: t.key, at: e.at, end: e.at + e.dur, shows: e.title }))).filter((x) => x.end > a && x.at < b).sort((x, y) => x.at - y.at);
  const out = [];
  for (const x of seqs) { const prev = out.at(-1); if (prev && prev.end > x.at) prev.end = x.at; out.push({ ...x }); }
  const beats = [];
  let t = a;
  for (const x of out) { const at = Math.max(a, x.at), end = Math.min(b, x.end); if (end - at < .3) continue; if (at - t >= .3) beats.push({ at: t, end: at, device: 'presenter', material: 'none', shows: '讲者' }); beats.push({ at, end, device: x.device, material: MATERIAL_OF[x.device] || 'none', shows: x.shows }); t = end; }
  if (b - t >= .3) beats.push({ at: t, end: b, device: 'presenter', material: 'none', shows: '讲者' });
  return beats;
}
export function judgeBeats(cfg, id, range) {
  const rel = loadProject(cfg, id).referenceInventory;
  if (!rel) return null;
  const f = sourcePath(cfg, rel);
  return fs.existsSync(f) ? inventoryBeats(JSON.parse(fs.readFileSync(f, 'utf8')), range) : null;
}
export const MATERIAL_KINDS = ['page', 'photo', 'cutout', 'portrait', 'logo', 'footage', 'none'];
// how much of the reference's telling (where a module exists) a plan must match to be accepted
export const TECHNIQUE_STANDARD = 0.8;

function narration(cfg, id, [a, b]) {
  const f = sourcePath(cfg, loadProject(cfg, id).transcript || TRANSCRIPT);
  return JSON.parse(fs.readFileSync(f, 'utf8')).segments.filter((s) => s.endMs / 1000 > a && s.startMs / 1000 < b)
    .map((s) => ({ at: s.startMs / 1000, end: s.endMs / 1000, text: s.text, words: s.words.map((w) => [w.word, +(w.startMs / 1000).toFixed(2)]) }));
}

// what the agent may put on screen: verified clips and the project's cut-outs (paths relative to the repo)
function materials(cfg, id) {
  const root = projectPaths(cfg, id).root, rel = (f) => path.relative(cfg.sourceRoot, f);
  const list = (d, re) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => re.test(f)).map((f) => rel(path.join(d, f))) : []);
  return { clips: list(path.join(root, 'materials', 'clips'), /\.(png|jpe?g|webp)$/i).filter((f) => !/-window\./.test(f)), cutouts: list(path.join(root, 'modules', 'cutouts'), /\.png$/i), presenter: loadProject(cfg, id).presenter?.asset || null };
}

// mode 'reference': the reference's frames and cut points over the passage (the minimum standard is to match it);
// mode 'blind': no reference (a new article, or a test of the director): the playbook and its example frames only
export async function shotplanTask(cfg, id, seg, range, { blind = false } = {}) {
  const lines = narration(cfg, id, range), windows = [];
  for (const l of lines) { const w = windows.at(-1); if (w && l.end - w.at < 7) w.end = l.end; else windows.push({ id: `W${windows.length + 1}`, at: Math.max(range[0], l.at), end: l.end }); }
  windows.at(-1).end = range[1];
  const hasRef = !blind && !!loadProject(cfg, id).sourceVideo;
  const ref = hasRef ? studyReference(cfg, id, `shotplan-${seg}`, { shots: windows }) : { sheets: [] };
  const index = buildIndex(cfg, id);
  const book = playbook(cfg);
  // the house look in pictures: one frame of each device the reference uses (the inventory's frames)
  const frames = path.join(cfg.dataDir, 'style-lab', 'technique-inventory', 'frames');
  const exampleFrames = hasRef ? [] : book.flatMap((d) => d.examples.slice(0, 1).map((e) => path.join(frames, `${e.id}.jpg`))).filter((f) => fs.existsSync(f));
  // the house fonts as a designer sees them: each one's character, and the characters of this passage (in Traditional,
  // as set on screen) it lacks, so the type is chosen knowing what each face can set
  const H = await import('./house.mjs'), said = H.toHant([lines.map((l) => l.text).join('')])[0];
  const fonts = H.houseRules().fonts.allowed.map((f) => ({ name: f.name, character: f.character, lacks: H.missingGlyphs(f.family, said).join('') }));
  // the film's material library (entitylib.mjs): the pictures already found, checked and kept for the names this passage
  // says; the plan uses them before it asks for anything
  const { filmLibrary, entitiesIn } = await import('./entitylib.mjs'), library = filmLibrary(cfg, id, entitiesIn(lines.map((l) => l.text).join(''), knownNames(cfg)));
  const input = { mode: hasRef ? 'reference' : 'blind', range, narration: lines, fonts, library, reference: ref.sheets.map((s) => ({ window: s.shot, from: +s.from.toFixed(2), referenceCuts: s.referenceCuts })), devices: book, exampleFrames: exampleFrames.map((f) => path.basename(f, '.jpg')), materials: describe(index), presenter: materials(cfg, id).presenter, modules: MODULES, projectNotes: loadProject(cfg, id).directorNotes || [] };
  // the clips' strips go along as pictures (the first ones; the task names each strip's file)
  const strips = Object.values(index.files).filter((e) => e.strip).slice(0, 8).map((e) => path.join(cfg.sourceRoot, e.strip));
  // the breakdown card (breakdown.mjs): every sub-shot of the reference with its measures and reading, the items to answer
  // without a reference (a script alone, or a blind test) the card is made from the narration and what the line has
  // measured before (scriptcard.mjs: the norm card), drawn by the film's design seed (project.designSeed, else one from
  // the project's name; recorded on the card)
  let card = hasRef ? readCard(cfg, id, seg) : null;
  if (!hasRef) { const SC = await import('./scriptcard.mjs'), T = await import('./techniques.mjs'), { loadRoutingTable } = await import('./director.mjs');
    const seed = SC.seedOf(`${loadProject(cfg, id).designSeed ?? id}:${seg}`), lib = T.saveTechniques(cfg).filter((t) => t.project !== id || t.seg !== seg);
    card = SC.normCard(lines, { seg, intents: loadRoutingTable(cfg).intents, lib, seed });
    const bd = path.join(projectPaths(cfg, id).root, 'out', 'passages', seg, 'breakdown'); fs.mkdirSync(bd, { recursive: true });
    fs.writeFileSync(path.join(bd, 'card.json'), JSON.stringify(card, null, 1) + '\n'); }
  if (card) input.breakdown = cardInput(card);
  // what the line has learned (techniques.mjs): per sub-shot the nearest techniques done before and the lessons that
  // apply; and the styles the film chooses from (the reference teaches structure, the subject chooses the look)
  if (card) input.guidance = (await import('./techniques.mjs')).guidanceFor(cfg, card, { project: id, seg });
  // the plan's first draft from the card (draft.mjs): every measured number already a parameter, blanks where judgement
  // is needed; the director starts from it (also beside the task: shotplan-<seg>.draft.json)
  if (card) { const D = await import('./draft.mjs'); input.draft = D.fillFromLibrary(await D.draftFromCard(card, { seed: card.seed ?? null, styles: STYLE_LIB(), topic: lines.map((l) => l.text).join('') }), card, library); fs.writeFileSync(taskPaths(cfg, id, `shotplan-${seg}`).task.replace(/\.task\.json$/, '.draft.json'), JSON.stringify(input.draft, null, 1) + '\n'); }
  input.styles = Object.entries(STYLE_LIB()).map(([k, v]) => ({ id: k, title: v.title, fits: v.fits, ground: v.tokens.ground, fonts: v.fonts, art: v.art, camera: v.camera }));
  writeTask(cfg, id, `shotplan-${seg}`, { rules: 'work/recipe-board-v1/prompts/shotplan.md', schema: 'work/recipe-board-v1/routing/shotplan.schema.json', input, images: [...(card ? card.subs.map((s) => s.sheet).filter(Boolean) : []), ...ref.sheets.map((s) => s.file), ...exampleFrames, ...strips] });
  return { task: taskPaths(cfg, id, `shotplan-${seg}`).task, windows: windows.length, images: ref.sheets.length + exampleFrames.length, mode: input.mode };
}

export const cardInput = (card) => ({ cuts: card.cuts, subs: card.subs.map((x) => ({ id: x.id, at: x.at, end: x.end, sheet: x.sheet, camera: x.camera, look: x.look, display: x.display, events: x.events, read: x.read })), items: card.items });
const overlap = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.at, b.at));
const parseSpec = (s) => { try { return { ...JSON.parse(s.spec), module: s.module }; } catch { return null; } };
// a side card with nothing on it is the plain presenter (torn-paper tags make it a side card: reference P24)
const isPlainPresenter = (spec) => spec?.module === 'sidecard' && !(spec.cards || []).length && !spec.curl && !(spec.tags || []).length;

// The plan set beat by beat against the reference's beats (pure, tested). For each reference beat the shot that covers
// most of it: the device matches when that shot's module is the device's module (a plain side card for the presenter,
// a card for side-card); the material matches when the shot shows a picture of the beat's kind (the index says what
// each picture is). A beat whose device has no module is a gap (reported, not an error). A beat whose device has a
// module but the shot does another device is an error unless a request names that shot (it declared what it lacks
// and stands in meanwhile: pending, left out of the share).
// what a painted picture stands for (pure, tested; user, 2026-10-22: 或者你用生图设计): a title's painted ground is the
// reference's photo or footage under its words (an atmosphere, a code screen, a monitor of prices: no evidence), a
// side card's painted prop its cutout (a trophy); never a portrait, a logo or a page, which are evidence
export function paintedKinds(module, spec) {
  if (!spec) return [];
  if (module === 'title' && spec.bg && typeof spec.bg === 'object' && spec.bg.art) return ['photo', 'footage'];
  if (module === 'title' && spec.bg && typeof spec.bg === 'object' && spec.bg.market) return ['page', 'photo'];
  if (module === 'title' && spec.bg && typeof spec.bg === 'object' && spec.bg.module) return ['page', 'photo'];   // (a table of the film's sourced facts set by code stands for a page of them)   // (a chart of real prices drawn by code stands for a price page)
  // (a designed frame's painted or module-drawn ground stands as a title's would, its painted parts for cut-outs)
  if (module === 'frame') { const g = spec.ground?.src, k = []; if (g && typeof g === 'object' && g.art) k.push('photo', 'footage'); if (g && typeof g === 'object' && (g.module || g.market)) k.push('page', 'photo'); if ((spec.parts || []).some((p) => p.kind === 'image' && p.src && typeof p.src === 'object' && p.src.art)) k.push('cutout'); if (k.length) return [...new Set(k)]; }
  if (module === 'sidecard' && (spec.cards || []).some((c) => c.img && typeof c.img === 'object' && c.img.art)) return ['cutout'];
  return [];
}
export function compareToReference(answer, range, { index = null } = {}) {
  const shots = (answer?.shots || []).map((s) => ({ ...s, parsed: parseSpec(s) }));
  const requested = new Set((answer?.requests || []).map((q) => q.shot));
  const beats = (answer?.reference || []).map((b) => ({ ...b, at: Math.max(range[0], b.at), end: Math.min(range[1], b.end) })).filter((b) => b.end - b.at >= 0.3);
  const rows = [], errors = [];
  let total = 0, coverable = 0, matched = 0, matTotal = 0, matMatched = 0, matDeclared = 0;
  for (const b of beats) {
    const dev = DEVICES[b.device], len = b.end - b.at;
    const does = (x) => { const sp = x.parsed, m = x.module; return b.device === 'presenter' ? isPlainPresenter(sp) : b.device === 'side-card' ? m === 'sidecard' && !isPlainPresenter(sp) : b.device === 'pagecurl' ? m === 'sidecard' && !!sp?.curl : b.device === 'brand' ? m === 'brand' || m === 'insert' : dev?.module === 'article' && m === 'insert' && sp?.figure ? true : m === 'frame' ? sp?.stands === dev?.module || (b.device === 'brand' && sp?.stands === 'brand') : m === dev?.module; };   // (a designed frame stands for the device it says, its parts the device's material: the design-frame stage, 2026-10-23)   // (a paper's figure cut from its archived page is that page shown: opensrc-S10, R1-Zero's training curves)   // (a brand shown full screen in a clip of its own is the same beat: r1-S2, OpenAI's own o1 title; both draw on brand.html)
    const over = shots.map((s) => ({ s, o: overlap(s, b) })).filter((x) => x.o > 0).sort((x, y) => y.o - x.o);
    // the seconds of the beat that a shot doing its device covers (a beat split over devices matches in part)
    const doneSec = dev?.module ? over.filter((x) => does(x.s)).reduce((m, x) => m + x.o, 0) : 0;
    const shot = over.find((x) => does(x.s))?.s || over[0]?.s || null;
    const spec = shot?.parsed, mod = shot?.module || null;
    let technique = 'gap';
    if (dev?.module) technique = doneSec >= len * .5 ? 'match' : 'other';
    // a shot that filed a request stands in until the material comes: pending, neither matched nor held against the plan
    if (technique === 'other' && shot && requested.has(shot.id)) technique = 'requested';
    const kinds = [...(index && spec ? picks(spec).map(([, f]) => index.files[f]?.kind).filter(Boolean) : []), ...paintedKinds(shot?.module, spec)];
    let material = 'none';
    if (b.material && b.material !== 'none' && index) {   // without the index what a picture is cannot be told
      matTotal += len;
      // real pictures of the world stand in for each other: a cutaway shown as stills fills a footage beat and a clip
      // fills a photo beat (the inventory filed open 18.0-20.5 s, a photo montage, as footage)
      const SAME = { photo: ['photo', 'footage', 'portrait'], footage: ['footage', 'photo'], portrait: ['portrait', 'photo', 'footage'], logo: ['logo', 'cutout', ...(b.device === 'brand' ? ['photo', 'footage'] : [])] }, ok = SAME[b.material] || [b.material];   // (a mark with no letters, the whale icon, is indexed as a cutout: who-S4; a brand shot shows a photograph of the mark, the official share image)
      if (kinds.some((k) => ok.includes(k)) && technique === 'match') { material = 'match'; matMatched += len; }
      else if (shot && requested.has(shot.id)) { material = 'requested'; matDeclared += len; }
      else material = 'missing';
    }
    total += len;
    if (technique !== 'gap' && technique !== 'requested') coverable += len;
    if (technique !== 'gap' && technique !== 'requested') matched += Math.min(len, doneSec);
    const row = { beat: `${b.at.toFixed(1)}-${b.end.toFixed(1)} s`, device: b.device, shows: b.shows || '', wants: b.material || 'none', shot: over.map((x) => x.s.id).join('+') || null, module: [...new Set(over.map((x) => x.s.module))].join('+') || null, technique, material, seconds: +len.toFixed(2), share: len ? +(Math.min(len, doneSec) / len).toFixed(2) : 0 };
    rows.push(row);
    if (technique === 'other') errors.push(`${row.beat}: the reference does ${dev.name} (${b.shows || b.device}); the plan puts ${row.module || 'nothing'} there. Use ${dev.module}${b.material && b.material !== 'none' ? `, or file a request for the ${b.material} it needs and say so` : ''}; never another device quietly`);
    if (technique === 'match' && material === 'missing') errors.push(`${row.beat}: the reference shows a ${b.material} (${b.shows || ''}); ${shot.id} shows none of that kind. Pick one from the index or file a request`);
  }
  const share = (a, b) => (b > 0 ? +(a / b).toFixed(2) : null);
  const gaps = [...new Set(rows.filter((r) => r.technique === 'gap').map((r) => r.device))].map((d) => ({ device: d, name: DEVICES[d]?.name || d, seconds: +rows.filter((r) => r.device === d).reduce((m, r) => m + r.seconds, 0).toFixed(1) }));
  const technique = share(matched, coverable);
  if (!beats.length) errors.push('reference: write the reference\'s beats first (device, material, what is on screen)');
  else if (technique != null && technique < TECHNIQUE_STANDARD) errors.push(`the plan matches the reference's telling on ${Math.round(technique * 100)}% of the time a module exists for; the standard is ${Math.round(TECHNIQUE_STANDARD * 100)}%`);
  return { rows, errors, technique, material: share(matMatched, matTotal), materialRequested: share(matDeclared, matTotal), gaps, seconds: { reference: +total.toFixed(1), coverable: +coverable.toFixed(1), matched: +matched.toFixed(1) } };
}

// what a shot is about: the stage modules (chat, table, compare, steps, chart) are one subject in a row; the others by
// their main material or words
const SUBJECT = { person: (x) => x.photo || x.name, quote: (x) => x.photo || x.presenter, brand: (x) => x.src, article: (x) => x.src, title: (x) => x.text };
export const sameSubject = (a, b) => !SUBJECT[a?.module] || !b || SUBJECT[a.module](a) === SUBJECT[a.module](b);
// the torn-paper labels a shot sets (brand / insert / screen label, the side card's tags and card labels, the curled
// page's label; a person card's name is that card's own design, not a label)
export function shotLabels(spec) {
  const out = [];
  if (spec.label && ['brand', 'insert', 'screen'].includes(spec.module)) out.push(spec.label);
  if (spec.module === 'sidecard') {
    for (const t of spec.tags || []) out.push(t.text);
    for (const c of spec.cards || []) for (const x of [c, ...(c.swap || [])]) if (x.label) out.push(x.label);
    if (spec.curl?.label) out.push(spec.curl.label);
  }
  return [...new Set(out.filter(Boolean))];
}
// the house rule on labels (routing/house-rules.json labels; user decision 2026-10-21: 不要总有那个小标签了): at most a
// share of the shots, never two labelled shots in a row, a few on one shot
export function labelErrors(shots, rule = { maxShare: .34, consecutive: false, perShot: 2 }) {
  const err = [], has = shots.map((s) => shotLabels(s.spec));
  has.forEach((l, i) => { if (l.length > rule.perShot) err.push(`${shots[i].id}: ${l.length} torn labels (${l.join(' / ')}); ${rule.perShot} at most on a shot`); });
  // (a card that goes on across the cut keeps its label: the same label again is the same element, not a new accent;
  // the blind review of cards held S2 for dropping it)
  if (!rule.consecutive) has.forEach((l, i) => { if (i && l.some((x) => !has[i - 1].includes(x)) && has[i - 1].length) err.push(`${shots[i].id}: torn labels again right after ${shots[i - 1].id}; labels are an accent, never on two shots in a row`); });
  const n = has.filter((l) => l.length).length, max = Math.max(1, Math.floor(shots.length * rule.maxShare));
  if (n > max) err.push(`${n} of ${shots.length} shots carry torn labels; ${max} at most (labels are an accent: say it with the picture, the page, the card)`);
  return err;
}

// the film's style (routing/styles.json; user, 2026-10-22: 系统需要灵活变体 不能一种风格不同主题视频) (pure, tested): one
// source for the whole film, project.json style (CONVERGE-20261026 conflict 1: the chapters read it, the cards read the
// plan's own; the two could differ). A plan names the film's style with the reason the subject calls for it, or none
// and takes the film's; one that names another is refused. A shot may take another style of the same family (a
// chapter's variant) and says so in its theme; editorial-grey is the reference's own look (theme 'reference')
export function styleErrors(answer, all, film = null) {
  const st = answer?.style, err = [];
  if (film && !all[film]) return [`project.json style "${film}" is not a style (${Object.keys(all).join(' / ')})`];
  if (st != null && film && st.id !== film) return [`style: the film's style is "${film}" (project.json style; the chapters draw in it too); the plan names "${st.id}": take the film's, or change the film's style for the whole film`];
  const id = film || st?.id;
  if (id == null) return err;
  if (!all[id]) return [`style: "${id}" is not a style (${Object.keys(all).join(' / ')})`];
  if (st != null && String(st.why || '').trim().length < 8) err.push('style: say why this subject calls for this style (a sentence)');
  for (const s of answer.shots || []) { let t; try { t = JSON.parse(s.spec).theme; } catch { continue; }
    if (typeof t === 'string' && t !== 'reference' && t !== id && all[t]?.theme !== all[id].theme) err.push(`${s.id}: theme "${t}" is outside the film's style family (${all[id].theme}); a chapter varies within it`); }
  return err;
}
// (pure, tested) the reference's display line at a shot's moment handed to the modules that set one (user, 2026-10-22:
// 为什么不先设计好减少返工): the card measured its height and place; the title was sized by hand, tried, measured on the
// white model against that same line and sent back. Now the module sets its words to it from the start, unless the
// shot sets its own size or side. The line of the sub-shot the shot overlaps most that has one.
export const REF_TYPE_MODULES = ['title', 'quote'];
export function withRefType(spec, card) {
  if (!REF_TYPE_MODULES.includes(spec?.module) || spec.refType || spec.size != null || spec.side || !card?.subs?.length) return spec;
  const over = (r) => Math.max(0, Math.min(spec.end, r.end) - Math.max(spec.at, r.at));
  // (the tallest line among the sub-shots it shares at least a third of itself with: a title stands for the reference's
  // biggest words, and OCR may read only a small header beside a torn display word, 顯卡 set at 116 px, recap-S2)
  // (the card's reader's own size of the display words counts too, 「约 400 px」: OCR does not read a torn or sliced
  // display face at all, recap R02 read only the header beside 显卡)
  // (only a display size: 「算式…约 70 px」 is the small type of a diagram, and set r1-S8's title at 70 px)
  const said = (r) => { const px = Math.max(0, ...[...String(r.read?.type || '').matchAll(/(\d{2,4})\s*px/gi)].map((m) => +m[1])), d = displayFor(r); return px >= BD.display && px > (d?.h || 0) && px <= 1000 ? { h: px, cx: .5, cy: .5, w: d?.w ?? null } : d; };
  const len = Math.max(.01, spec.end - spec.at), xs = card.subs.map((r) => ({ r, o: over(r), d: said(r) })).filter((x) => x.o > 0 && x.d);
  const near = xs.filter((x) => x.o >= len / 3), best = (near.length ? near.sort((a, b) => b.d.h - a.d.h) : xs.sort((a, b) => b.o - a.o))[0];
  return best ? { ...spec, refType: { h: best.d.h, cx: best.d.cx, cy: best.d.cy, w: best.d.w } } : spec;
}
// (pure, tested) the reference's display treatment at a title's moment, read off the card (the reader names it: open R01
// 「旧金属质感」, R14 「立体厚度和下投影」): a title or a frame's display line the plan leaves plain takes it (user
// 2026-10-25: 很多细节都不好 — every display line was one clean face where the reference treats each one). Brush and torn
// paper are named too and taken by none (user 2026-10-25).
export const TREAT_WORDS = [['condense', /瘦高|窄长|压缩|极窄/], ['metal', /金属|银白|铜色|划痕|斑驳/], ['extrude', /立体|厚度|3D|下投影/], ['glow', /发光|辉光|光晕|色散/], ['emboss', /压印|凹刻|压进/],
  ['halftone', /网点|做旧(?!金属)/], ['glitch', /故障|切片|错位|像素块/], ['overprint', /半透明|叠印|透出/], ['slant', /斜体|右斜|右倾|斜切|斜压|粗斜|略斜/]];
// the face the reference sets its display line in (the reader names it: 「粗黑体」, 「极瘦高」): metal on a thin Mincho read as
// clip art where the reference's is a heavy gothic block (cards S3 review); the house faces only (スミカク, 金畫字)
// (スミカク is not picked by itself: its cut and hollowed strokes read 多 as 昌 and lost 投, 國 and 推理 — meta S6, who S2, r1 S8
// reviews; a heavy gothic of the reference keeps the house Mincho at its heaviest; a plan may still name it for a word)
export const FACE_WORDS = [['金畫字', /瘦高|窄长|压缩|窄体|窄粗/]];
// (スミカク is a poster face for short titles, 2-6 characters of Chinese: 「國」 in it read as two dots and 「AI」 as a red
// block, who S2 / ending S6 reviews; a longer line or one with Latin keeps the house Mincho)
export const faceFits = (face, text) => face !== 'スミカク' || (/^[\u3400-\u9fff]{2,6}$/.test(String(text || '').replace(/[\s·・]/g, '')));
export const treatOf = (text) => { const t = String(text || ''); return TREAT_WORDS.filter(([, re]) => re.test(t)).map(([k]) => k); };
export const faceOf = (text) => { const t = String(text || ''); return (FACE_WORDS.find(([, re]) => re.test(t)) || [null])[0]; };
// (pure, tested) the one treatment a line takes of those the reference's reader names: a surface (metal, extrude, glow,
// emboss, halftone, glitch, overprint) before a shape (slant, condense) — taking the first named, a condense listed before
// metal cost cards S7, S8, open S1 and opensrc S3 their metal (2026-10-26 review); a lettered project's faces are drawn at
// their own width, so condense is none of its (the reference's 「极瘦高」 is its own face's, not a squeeze of ours)
export const TREAT_SURFACE = ['metal', 'extrude', 'glow', 'emboss', 'halftone', 'glitch', 'overprint'];
// the treatments that dress the words (a glow round them, a cast shadow under them): never on a six-stage film
export const DRESS_TREATS = ['glow', 'extrude'];
export function pickTreat(kinds, lettered = false) {
  const k = (kinds || []).filter((x) => !(lettered && (x === 'condense' || DRESS_TREATS.includes(x))));   // (a lettered film's words carry no dress: the reference's glow is not taken)
  return k.find((x) => TREAT_SURFACE.includes(x)) || k[0] || null;
}
export function withRefTreat(spec, card) {
  if (!spec || !card?.subs?.length || !['title', 'frame', 'person', 'article', 'sidecard', 'compare', 'quote', 'steps'].includes(spec.module)) return spec;
  const read = (t) => card.subs.find((r) => t >= r.at && t < r.end)?.read?.type, kinds = (t) => treatOf(read(t)), face = (t) => faceOf(read(t));
  // (one treatment a line: stacked, metal with slant, glitch with extrude, the words grew heavier and uglier each round,
  // the user 2026-10-26: 越来越丑了; and no face of the reference's where the project letters its words, lettering)
  const one = (k) => pickTreat(k, !!process.env.RB_LETTERING);
  if (spec.module !== 'frame') { const t = spec.module === 'title' ? spec.textAt ?? spec.at : spec.module === 'person' ? spec.nameAt ?? spec.at : spec.at; let out = spec;
    if (spec.treat == null && spec.style !== 'metal') { const k = one(kinds(t)); if (k) out = { ...out, treat: k }; }
    // (the face on the display line itself, not the page's display role: set page-wide it turned the brand block's
    // DeepSeek into the poster face too, open S14 review)
    const f = process.env.RB_LETTERING ? null : face(t), words = spec.module === 'title' ? spec.text : spec.module === 'person' ? spec.name : spec.module === 'article' ? (spec.beats || []).find((b) => b.big)?.text : spec.module === 'compare' ? spec.left?.title : spec.module === 'sidecard' ? spec.cards?.[0]?.title : spec.module === 'steps' ? spec.title : (spec.lines || []).find((l) => l.main)?.text; if (f && spec.face == null && faceFits(f, words)) out = { ...out, face: f };
    return out; }
  let changed = false; const parts = (spec.parts || []).map((l) => { if (l.kind !== 'text' || (l.role || 'display') !== 'display') return l; let o = l;
    if (l.treat == null) { const k = one(kinds(l.at ?? spec.at)); if (k) o = { ...o, treat: k }; }
    if (l.face == null && !process.env.RB_LETTERING) { const f = face(l.at ?? spec.at); if (f && faceFits(f, l.text)) o = { ...o, face: f }; }
    if (o !== l) changed = true; return o; });
  return changed ? { ...spec, parts } : spec;
}
// (pure, tested) what the reference carries across its cuts (film comparison 2026-10-25: every shot of ours stood alone,
// a new picture at each cut; the reference keeps a section's tag at the top over several shots, r1 4:14-4:24, and lets
// a title fade out over the next shot, open R02 「金属年份标题延续上一镜」). The words are always ours: a shot's own
// display line, carried.
//   header  a small tag at the top over the shots of a span where the reference repeats one at its top (three
//           sub-shots or more, OCR), the words of our shot that opens the span
//   carry   the display line of the shot before laid over the opening of a shot the card's reader says continues it
export const displayOf = (s) => (s?.module === 'title' ? s.text : s?.module === 'steps' ? s.title || null : s?.module === 'frame' ? (s.parts || []).filter((p) => p.kind === 'text' && (p.role || 'display') === 'display').sort((a, b) => (b.size || 0) - (a.size || 0))[0]?.text || null : s?.module === 'quote' ? (s.lines || []).find((l) => l.main)?.text || null : null);
export function refHeaderSpans(card) {
  const subs = card?.subs || [], key = (t) => String(t || '').replace(/[\s，。,.!！?？“”"'：:]/g, '');
  const top = (r) => new Set((r.text || []).filter((x) => x.cy < .2 && x.h < 90 && [...key(x.text)].length >= 4).map((x) => key(x.text))), spans = [];
  for (let i = 0; i < subs.length;) { let best = null; for (const t of top(subs[i])) { let j = i; while (j + 1 < subs.length && top(subs[j + 1]).has(t)) j++; if (j - i + 1 >= 3 && (!best || j > best.j)) best = { j }; }
    if (best) { spans.push({ at: subs[i].at, end: subs[best.j].end }); i = best.j + 1; } else i++; }
  return spans;
}
export function passageCarry(shots, card) {
  const out = {}, add = (id, v) => { out[id] = { ...(out[id] || {}), ...v }; };
  for (const sp of refHeaderSpans(card)) {
    const inSpan = shots.filter(({ spec }) => spec.end > sp.at + .2 && spec.at < sp.end - .2), owner = inSpan.find(({ spec }) => displayOf(spec));
    const text = owner && displayOf(owner.spec); if (!text || [...text].length > 14) continue;
    const baseAt = (t) => (card.subs.find((r) => r.at <= t + .1 && t + .1 < r.end) || {}).look?.base;   // (the ink by the shot it lands on: r1 S2 is OpenAI's mark on black)
    for (const x of inSpan) if (x !== owner && x.spec.at >= owner.spec.at && displayOf(x.spec) !== text) add(x.id, { header: { text, ink: baseAt(x.spec.at) === 'dark' ? 'light' : 'dark' } });
  }
  for (let i = 1; i < shots.length; i++) { const { spec } = shots[i], r = (card?.subs || []).find((q) => q.at <= spec.at + .1 && spec.at + .1 < q.end);
    if (!/延续上一镜|延续上一|从上一镜延续/.test(String(r?.read?.type || ''))) continue;
    const prev = shots[i - 1].spec, text = displayOf(prev); if (!text || Math.abs(prev.end - spec.at) > .05) continue;
    const pd = withRefTreat(prev, card), pp = (pd.parts || []).find((p) => p.text === text); add(shots[i].id, { carry: { text, treat: pd.treat || pp?.treat || null, face: pp?.face || pd.type?.display || null, dur: .8 } }); }
  return out;
}
// the reference's type at a shot's moment, its size and its treatment (every path that writes a shot's spec takes both)
export const withRefDesign = (spec, card) => withRefTreat(withRefType(spec, card), card);
// (pure, tested) the reference's measured motion handed to the modules (user, 2026-10-23: 动效复刻 — 原片量好的数字直接
// 变默认): the card measured how each sub-shot's camera travels and how its packaging comes in (breakdown.py camera,
// camera.anim); the director wrote cameras of ×1.05 by hand and showed a frame's parts all at once, and the white model
// sent them back (talent S3: the reference moves 88 % of 7 s, ours 11 %; ten things in turn over 6.6 s, ours at once).
// Where the plan matches a sub-shot's camera and the spec's own falls short of what compareBreakdown asks, the shot's
// camera becomes the measured one, one continuous move through the sub-shots it covers (a drift where the reference
// only moves, a hold where it stands); where it matches the events, a frame's parts come in one after another over the
// measured build and a title or a person reveals over it. A camera or an entrance the plan says differs is left alone.
// The camera closed on the white model (2026-10-24: 一直跑 达到目标成熟为止): where the measure finds a shot's move short of
// the reference's (a footage that tracks in under our pull-out, a ground that carries part of it, a module's bound), the
// shortfall becomes a gain on that shot's move, kept with the passage (camgain.json) and applied each time the module is
// written, until the white model measures the move the reference makes. (pure) gains from the measure's words.
const GAIN_STEP = 2.5, GAIN_MAX = 4;
export function gainsFromProblems(problems, old = {}) {
  const out = JSON.parse(JSON.stringify(old || {}));
  for (const p of problems || []) for (const x of p.problems || []) {
    const say = String(x.say || ''), g = (out[p.shot] ||= { zoom: 1, x: 1, y: 1 }), bump = (k, r) => { if (!(r > 1)) return; g[k] = +Math.min(GAIN_MAX, g[k] * Math.min(GAIN_STEP, r)).toFixed(3); };
    let m = say.match(/(?:pushes in|pulls out) ×([\d.]+) over .*?ours ×([\d.]+)/);
    if (m) { const a = Math.log(+m[1]), b = Math.log(+m[2]); g.dir = Math.sign(a); if (Math.sign(a) === Math.sign(b) && Math.abs(b) > .003) bump('zoom', a / b); else if (Math.abs(b) <= .003) bump('zoom', GAIN_STEP); continue; }
    m = say.match(/travels (sideways|vertically) (-?[\d.]+) frame widths over .*?ours (-?[\d.]+)/);
    if (m) { const a = +m[2], b = +m[3], k = m[1] === 'sideways' ? 'x' : 'y'; if (Math.sign(a) === Math.sign(b) && Math.abs(b) > .003) bump(k, a / b); }
  }
  return out;
}
// (pure) a shot's move scaled by its gain: on the picture under a layout (groundMove) or, for a picture shot (insert,
// brand), on the camera itself, zoomed in enough to keep the frame covered; a laid-out module's own camera is left alone
// the material a gain was measured on (a gain is a correction for that picture's own motion: talent S11's gain of
// ×2.1 sideways, learnt on one money clip, pushed the next clip the other way to 0.23 frame widths)
export const gainSrcOf = (spec) => { const v = [spec?.src, spec?.ground?.src, spec?.photo].find((x) => typeof x === 'string'); return v ? sourceKey(v) : null; };
export function applyCamGain(spec, g) {
  if (!g || !spec) return spec;
  if (g.src && gainSrcOf(spec) && g.src !== gainSrcOf(spec)) return spec;
  // (a zoom gain only in the reference's sense: a camera that has come to push where the reference pulls is not made to
  // push harder, opensrc S9 ×1.01 → ×1.275 against the reference's ×0.83 once its plan said the pull-out differs)
  const c0 = spec.camera || [], net = c0.length ? (c0.at(-1).to.zoom || 1) / (c0[0].from.zoom || 1) : 1, wrong = g.dir && Math.abs(Math.log(net)) > .003 && Math.sign(Math.log(net)) !== g.dir;
  const gz = wrong ? 1 : g.zoom || 1, gx = g.x || 1, gy = g.y || 1; if (gz === 1 && gx === 1 && gy === 1) return spec;
  // (the ground within bounds: at most ×2.2 or ×0.6 and a fifth of the frame's travel, the picture stays a picture)
  if (spec.groundMove) { const m = spec.groundMove, cl = (v, a, b) => Math.max(a, Math.min(b, v)); return { ...spec, groundMove: { zoom: +cl(Math.pow(m.zoom, gz), .6, 2.2).toFixed(3), x: +cl(m.x * gx, -.2, .2).toFixed(3), y: +cl(m.y * gy, -.2, .2).toFixed(3) }, camGain: g }; }
  // (a frame's deeper push on its ground: the ground's push scaled, up to ×1.8)
  if (spec.module === 'frame' && spec.ground?.push > 0 && gz > 1) return { ...spec, ground: { ...spec.ground, push: +Math.min(.8, Math.pow(1 + spec.ground.push, gz) - 1).toFixed(3) }, camGain: g };
  // (a side card's camera moves the presenter behind cards that stay on the screen: its zoom scaled, within ×1.35)
  if (spec.module === 'sidecard' && (spec.camera || []).length) { const base = spec.camera[0].from.zoom || 1, lim = (z) => Math.max(1 / 1.35, Math.min(1.35, z)), f = (p) => ({ ...p, zoom: +(base * lim(Math.pow((p.zoom || 1) / base, gz))).toFixed(3) });
    const keys = spec.camera.map((k) => ({ ...k, from: f(k.from), to: f(k.to) })), low = Math.min(...keys.flatMap((k) => [k.from.zoom, k.to.zoom]));
    return { ...spec, camera: low < 1 ? keys.map((k) => ({ ...k, from: { ...k.from, zoom: +(k.from.zoom / low).toFixed(3) }, to: { ...k.to, zoom: +(k.to.zoom / low).toFixed(3) } })) : keys, camGain: g }; }
  // (a frame on a picture: its own travel scaled, its zoom raised only as far as the travel needs to keep the frame
  // covered: recap S6 slid 0.036 of the frame where the reference slides 0.074)
  if (spec.module === 'frame' && spec.ground?.src && (spec.camera || []).length && (gx > 1 || gy > 1)) { const r3 = (v) => +v.toFixed(3), lim = .06;
    const f = (p) => { const x = Math.max(-lim, Math.min(lim, (p.x || 0) * gx)), y = Math.max(-lim, Math.min(lim, (p.y || 0) * gy)), need = 1 + 2 * Math.max(Math.abs(x), Math.abs(y) * 16 / 9) + .01; return { zoom: r3(Math.max(p.zoom || 1, need)), x: r3(x), y: r3(y) }; };
    return { ...spec, camera: spec.camera.map((k) => ({ ...k, from: f(k.from), to: f(k.to) })), camGain: g }; }
  // (a frame on a plain ground has no picture to carry the rest: its own camera takes the gain, within ×1.3; its parts are
  // laid inside what the camera shows from their coming, and a layout that cannot fit fails the frame check, opensrc S9)
  // (every other module's camera takes it too, within ×1.3: a title, a quote, a person, a frame's zoom on its picture
  // were left out and their gains climbed to the cap while the move stayed short, recap S1 S3 and who S8 at ×4 measuring
  // ×1.014 against ×1.031; a page's own camera, article and screen, frames its words and is left alone)
  const plainFrame = !['insert', 'brand'].includes(spec.module);
  // (a module laid out to fill its frame, a table, steps, a chart, a comparison, a board of prices, is left as it is: pushed
  // by a gain its last row went into the subtitle band, opensrc S8 at x1.31)
  if (['article', 'screen', 'pagecurl', 'table', 'steps', 'chart', 'compare', 'market'].includes(spec.module) || !(spec.camera || []).length) return spec;
  // (a frame on a picture keeps its camera: its parts are laid in what the camera shows, and pushed to x4 they left the
  // frame blank for half a second, talent S2; its picture's own move carries the rest)
  if (spec.module === 'frame' && spec.ground?.src) return spec;
  // (a module led by its words, a title, a quote, a person, takes the push but not a wider pan: the pan's cover zoom
  // narrowed what the camera always shows and the quote's words fell to two fifths of the reference's line, ending S6)
  const wordsLed = ['title', 'quote', 'person'].includes(spec.module), px = wordsLed ? 1 : gx, py = wordsLed ? 1 : gy;
  const base = spec.camera[0].from.zoom || 1, f = (p) => ({ zoom: base * Math.pow((p.zoom || 1) / base, gz), x: (p.x || 0) * px, y: (p.y || 0) * py });
  const keys = spec.camera.map((k) => ({ ...k, from: f(k.from), to: f(k.to) }));
  if (plainFrame) { const hi = Math.max(...keys.flatMap((k) => [k.from.zoom, k.to.zoom])), lo = Math.min(...keys.flatMap((k) => [k.from.zoom, k.to.zoom])), k2 = hi / lo > 1.3 ? Math.log(1.3) / Math.log(hi / lo) : 1;
    if (k2 < 1) for (const k of keys) for (const p of [k.from, k.to]) p.zoom = lo * Math.pow(p.zoom / lo, k2); }
  const need = Math.max(1, ...keys.flatMap((k) => [k.from, k.to].map((p) => (1 + 2 * Math.max(Math.abs(p.x), Math.abs(p.y) * 16 / 9) + .01) / p.zoom))), r3 = (v) => +v.toFixed(3);
  return { ...spec, camera: keys.map((k) => ({ ...k, from: { zoom: r3(k.from.zoom * need), x: r3(k.from.x), y: r3(k.from.y) }, to: { zoom: r3(k.to.zoom * need), x: r3(k.to.x), y: r3(k.to.y) } })), camGain: g };
}
// (pure) a ground's move kept from cutting a face off the frame: the faces in frame fractions [x, y, w, h] as the picture
// covers the frame; the move's last framing (common.js M.groundMove: scale about the centre, then the travel) is eased
// back, its travel first, until every face stays inside with a margin (who S11, ending S2: the gain pushed Liang
// Wenfeng's eyes off the top edge)
export function faceSafeGroundMove(gm, faces, margin = .03) {
  if (!gm || !faces?.length) return gm;
  const end = (m) => { const cover = 1 + 2 * Math.max(Math.abs(m.x || 0), Math.abs(m.y || 0) * 16 / 9) + .02, s = cover * Math.max(1, m.zoom || 1);
    return faces.every(([fx, fy, fw, fh]) => { const y0 = .5 + s * (fy - .5) - (m.y || 0) * 16 / 9, y1 = .5 + s * (fy + fh - .5) - (m.y || 0) * 16 / 9, x0 = .5 + s * (fx - .5) - (m.x || 0), x1 = .5 + s * (fx + fw - .5) - (m.x || 0);
      return y0 >= margin && y1 <= 1 - margin && x0 >= margin && x1 <= 1 - margin; }); };
  let m = { ...gm };
  for (let i = 0; i < 40 && !end(m); i++) m = i < 12 ? { ...m, x: m.x * .8, y: m.y * .8 } : { ...m, zoom: m.zoom > 1 ? 1 + (m.zoom - 1) * .85 : m.zoom, x: m.x * .8, y: m.y * .8 };
  const r3 = (v) => +v.toFixed(3);
  return { zoom: r3(m.zoom), x: r3(m.x), y: r3(m.y) };
}
// (pure) the same over the whole move: the camera's framing (camera.js: scale about the centre, travel in frame widths)
// over the ground's (groundMove), checked at the camera's every key; the travel eased back first, then the zooms
// (ending S2: a title's own camera ×1.185 and down a twentieth over its ground's move put the eyes above the frame)
export function faceSafeMove(spec, faces, margin = .03) {
  if (!faces?.length || !(spec.camera || []).length && !spec.groundMove) return spec;
  const ok = (cam, gm) => { const gs = gm ? (1 + 2 * Math.max(Math.abs(gm.x || 0), Math.abs(gm.y || 0) * 16 / 9) + .02) * Math.max(1, gm.zoom || 1) : 1;
    const states = (cam || []).flatMap((k) => [k.from, k.to]); if (!states.length) states.push({ zoom: 1, x: 0, y: 0 });
    return states.every((c) => { const z = Math.max(1, c.zoom || 1);
      return faces.every(([fx, fy, fw, fh]) => [[fx, fy], [fx + fw, fy + fh]].every(([px, py]) => {
        const gx = gm ? .5 + gs * (px - .5) - (gm.x || 0) : px, gy = gm ? .5 + gs * (py - .5) - (gm.y || 0) * 16 / 9 : py;
        const X = .5 + z * (gx - .5) - (c.x || 0) * z, Y = .5 + z * (gy - .5) - (c.y || 0) * z * 16 / 9;
        return X >= margin && X <= 1 - margin && Y >= margin && Y <= 1 - margin; })); }); };
  let cam = spec.camera ? spec.camera.map((k) => ({ ...k, from: { ...k.from }, to: { ...k.to } })) : spec.camera, gm = spec.groundMove ? { ...spec.groundMove } : null;
  for (let i = 0; i < 60 && !ok(cam, gm); i++) {
    if (gm && i < 10) { gm.x *= .8; gm.y *= .8; continue; }
    if (cam && i < 20) { for (const k of cam) for (const p of [k.from, k.to]) { p.x = (p.x || 0) * .8; p.y = (p.y || 0) * .8; } continue; }
    if (gm && gm.zoom > 1 && i < 35) { gm.zoom = 1 + (gm.zoom - 1) * .85; continue; }
    if (cam) for (const k of cam) for (const p of [k.from, k.to]) p.zoom = 1 + Math.max(0, (p.zoom || 1) - 1) * .85;
  }
  const r3 = (v) => +(+v).toFixed(3);
  return { ...spec, ...(cam ? { camera: cam.map((k) => ({ ...k, from: { zoom: r3(k.from.zoom), x: r3(k.from.x || 0), y: r3(k.from.y || 0) }, to: { zoom: r3(k.to.zoom), x: r3(k.to.x || 0), y: r3(k.to.y || 0) } })) } : {}), ...(gm ? { groundMove: { zoom: r3(gm.zoom), x: r3(gm.x), y: r3(gm.y) } } : {}) };
}
export const camGainsOf = (cfg, id, seg) => { const f = path.join(projectPaths(cfg, id).root, 'out', 'passages', seg, 'camgain.json'); try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
// (tested) a shot with no camera of its own and no reference to take one from (a new article's shot past what the
// reference shows) moves as its kind moves in the motion language (motion-language.mjs: one variant in the common half
// of the kind's range, picked by the shot's place, the style's temper): left at none it stood still where every kind of
// picture in the reference but the person moves (86 % of its sub-shots), the user 2026-10-26: 尤其是动效 … 允许各种变体
export const MODULE_DEVICE = { title: 'title', brand: 'brand', quote: 'quote', person: 'person', chart: 'chart', table: 'table', compare: 'compare3d', market: 'market', steps: 'steps', chat: 'chat', insert: 'broll', frame: 'broll' };
let LANG = null;
const langOf = () => { if (LANG == null) { try { LANG = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../../../../../work/recipe-board-v1/routing/motion-language.json'), 'utf8')); } catch { LANG = false; } } return LANG; };
export function withLanguageMotion(spec, lang = null, temper = 'brisk') {
  if (!spec || (spec.camera || []).length || !(spec.end > spec.at) || !MODULE_DEVICE[spec.module]) return spec;
  if (!lang) lang = langOf();
  if (!lang) return spec;
  const m = motionDefaults(lang, MODULE_DEVICE[spec.module], `${spec.module}|${spec.at}`, temper); if (!m || (m.zoom === 1 && !m.pan)) return spec;
  const dur = spec.end - spec.at, run = Math.max(.6, dur * Math.max(.3, m.moving)), z0 = m.dir < 0 ? m.zoom ** -1 : 1, z1 = m.dir < 0 ? 1 : m.zoom;
  // (a pull-out starts in close and ends on the frame; a move along keeps the frame covered: |x| within (zoom - 1) / 2)
  const lim = (Math.max(z0, z1) - 1) / 2, x = Math.min(lim, m.pan / 2) * (spec.at % 2 < 1 ? 1 : -1);
  return { ...spec, camera: [{ at: +spec.at.toFixed(3), end: +(spec.at + run).toFixed(3), from: { zoom: +(m.dir < 0 ? 1 / m.zoom : 1).toFixed(4), x: 0, y: 0 }, to: { zoom: +(m.dir < 0 ? 1 : m.zoom).toFixed(4), x: +x.toFixed(4), y: 0 }, ease: m.ease > .6 ? 'out' : m.ease < .4 ? 'in' : 'inout' }] };
}
export function withRefMotion(spec, card, follows = []) {
  // (a page's own camera, pageCamera, frames its words and its marks: article and screen keep theirs)
  if (!spec || ['sidecard', 'presenter', 'article', 'screen'].includes(spec.module)) return spec;
  if (!card?.subs?.length) return withLanguageMotion(spec);
  const does = Object.fromEntries((follows || []).map((f) => [f.item, f.does])), ok = (item) => (follows?.length ? does[item] === 'match' : true);
  const over = (r) => [Math.max(spec.at, r.at), Math.min(spec.end, r.end)], subs = card.subs.filter((r) => { const [a, b] = over(r); return b - a >= Math.min(.5, (r.end - r.at) / 2); });
  if (!subs.length) return withLanguageMotion(spec);
  let out = spec;
  // ours over a window, from the spec's keys (zooms multiply, pans add, each key by its share of the window)
  const ours = (keys, a, b) => { let z = 1, px = 0, py = 0, mv = 0; for (const k of keys || []) { const w = Math.max(0, Math.min(b, k.end) - Math.max(a, k.at)), f = w / Math.max(.01, k.end - k.at); if (!w) continue; z *= Math.pow((k.to.zoom || 1) / (k.from.zoom || 1), f); px += ((k.to.x || 0) - (k.from.x || 0)) * f; py += ((k.to.y || 0) - (k.from.y || 0)) * f; mv += w; } return { zoom: z, pan: [px, py], moving: mv / Math.max(.01, b - a) }; };
  const short = (rc, oc) => (rc.zoom >= BD.push && !(oc.zoom >= 1 + (rc.zoom - 1) * .5)) || (rc.zoom <= BD.pull && !(oc.zoom <= 1 - (1 - rc.zoom) * .5))
    || [0, 1].some((k) => Math.abs(rc.pan?.[k] || 0) >= BD.pan && !(Math.sign(oc.pan[k]) === Math.sign(rc.pan[k]) && Math.abs(oc.pan[k]) >= Math.abs(rc.pan[k]) * .5))
    || ((rc.moving || 0) - oc.moving > BD.moving);
  // (a module whose content is laid out to the frame, a chart, a table, a diagram, moves by its content: a whole-frame
  // pan pushed opensrc S7's labels off the edge and S8's rows into the subtitle band; theirs is left to the module)
  const cams = ['chart', 'table', 'steps', 'compare', 'market', 'chat'].includes(spec.module) ? [] : subs.filter((r) => r.camera && ok(`${r.id}.camera`));
  if (cams.length && !subs.some((r) => does[`${r.id}.camera`] === 'differ') && cams.some((r) => { const [a, b] = over(r); return short(r.camera, ours(spec.camera, a, b)); })) {
    // one continuous move: each window's change (zoom ratio, travel) chained from where the last ended, then the whole
    // scaled so the frame stays covered (zoom >= 1 + 2|x|, 1 + 2|y| 16/9: camera.js)
    let z = 1, x = 0, y = 0; const keys = [];
    for (const r of subs) {
      const [a, b] = over(r), c = r.camera || {}, f = (b - a) / Math.max(.01, r.end - r.at), still = !cameraOf(c, a, b).length;
      const ratio = still ? ((c.moving || 0) >= .5 ? 1.035 : 1) : Math.pow(c.zoom || 1, f), [px, py] = still ? [0, 0] : (c.pan || [0, 0]).map((v) => v * f);
      if (ratio === 1 && !px && !py) continue;
      const ease = c.ease == null ? 'inout' : c.ease > .6 ? 'out' : c.ease < .4 ? 'in' : 'linear';
      keys.push({ at: +a.toFixed(3), end: +b.toFixed(3), from: { zoom: z, x, y }, to: { zoom: z * ratio, x: x + px / 2, y: y + py / 2 }, ease }); z *= ratio; x += px / 2; y += py / 2;
    }
    // a designed frame keeps its layout: a deep push (the reference ×2 into a page, cards R03) goes to its ground
    // (ground.push) and the frame as a whole moves at most ×1.12, its travel scaled with it
    // (a pull-out as deep starts cropped: within the same bound, the frame alone)
    // (a quote and a person card set their words to the frame's edges: a pan of a picture's reach pushed ending S6's lines
    // a quarter off the frame; only a picture or a brand's mark takes the deep moves)
    // (a frame whose plan lets parts run off the frame on purpose, bleed, takes the reference's deep push into a part of it:
    // the reference goes ×2 into its board and leaves the rest cut, r1 4:51; held to ×1.12 ours never came close, film
    // comparison 2026-10-25 — the parts that leave are marked, the rest stay in by the frame check)
    const bleeds = spec.module === 'frame' && (spec.parts || []).some((p) => p.bleed);
    const laid = !['insert', 'brand'].includes(spec.module) && !bleeds, bound = spec.module === 'frame' ? (bleeds ? 1.6 : 1.12) : 1.2;
    const orig = keys.length ? { ...keys[keys.length - 1].to } : { zoom: 1, x: 0, y: 0 };
    const total = keys.length ? keys[keys.length - 1].to.zoom : 1, cap = laid && Math.abs(Math.log(total)) > Math.log(bound) ? Math.log(bound) / Math.abs(Math.log(total)) : 1;
    if (cap < 1) { for (const k of keys) for (const p of [k.from, k.to]) { p.zoom = Math.pow(p.zoom, cap); p.x *= cap; p.y *= cap; } if (spec.module === 'frame' && total > 1) out = { ...out, ground: { ...(out.ground || {}), push: +Math.max(out.ground?.push ?? .05, Math.min(out.ground?.src?.module ? .6 : .3, total - 1)).toFixed(3) } }; if (spec.module === 'frame' && total < 1) out = { ...out, ground: { ...(out.ground || {}), push: 0, pull: +Math.min(.3, 1 / total - 1).toFixed(3) } }; }   // (a ground that is the content, a table, takes the reference's push into it: talent S2)   // (a ground pushed ×2.4 from its centre went into the page's blank margin: cards S5)
    const edge = (p) => (Math.abs(p.x) + Math.abs(p.y) > 0 ? 1 + Math.max(2 * Math.abs(p.x), 2 * Math.abs(p.y) * 16 / 9) + .02 : 1) / p.zoom;
    // a laid-out module (a chart, a table, a frame) is cropped by a deep zoom: the whole move stays within ×1.2 (a
    // picture ×1.6), its travel scaled down to fit; what the module cannot travel is left to the white model's measure
    const lim = laid ? 1.2 : 1.6, peak = () => Math.max(1, ...keys.flatMap((k) => [k.from, k.to].map(edge))) * Math.max(...keys.flatMap((k) => [k.from.zoom, k.to.zoom]));
    for (let i = 0; i < 12 && keys.length && peak() > lim + 1e-6; i++) for (const k of keys) for (const p of [k.from, k.to]) { p.x *= .8; p.y *= .8; }
    const need = Math.max(1, ...keys.flatMap((k) => [k.from, k.to].map(edge))), r3 = (v) => +v.toFixed(3);
    // what the bound took off the move (its zoom and its travel) is carried by the picture under the layout, a frame's
    // ground or a title's: the type stays where it was set and the picture goes the rest of the way (who S11: the
    // reference ×1.41, ours held to ×1.17 by the title's bound; talent S3, ending S2: their travel cut to a third)
    if (keys.length && (spec.module === 'frame' && out.ground?.src || spec.module === 'title' && spec.bg)) { const last = keys[keys.length - 1].to, rz = orig.zoom / last.zoom, rx = orig.x - last.x, ry = orig.y - last.y;
      // (a frame's deeper push alone stays its ground's push, as before; travel or a pull-out goes this way)
      if ((Math.abs(rx) > .005 || Math.abs(ry) > .005 || rz < .99 || spec.module === 'title' && rz > 1.01)) { out = { ...out, groundMove: { zoom: r3(rz), x: r3(rx), y: r3(ry) } }; if (spec.module === 'frame') { const { pull, ...g } = out.ground || {}; out = { ...out, ground: { ...g, push: 0 } }; } } }
    // (a pull-out with the frame's ground pushing in by default measured as a push: recap S1; the ground rests then)
    // (and a ground drawn by a module holds its last frame: the table's own push in its frames measured ×1.059 against a
    // ×0.933 pull-out, recap S1)
    if (spec.module === 'frame' && keys.length && keys.at(-1).to.zoom < keys[0].from.zoom) out = { ...out, ground: { ...(out.ground || {}), push: 0, ...(out.ground?.src?.module ? { play: false } : {}) } };
    if (keys.length) out = { ...out, camera: keys.map((k) => ({ ...k, from: { zoom: r3(k.from.zoom * need), x: r3(k.from.x), y: r3(k.from.y) }, to: { zoom: r3(k.to.zoom * need), x: r3(k.to.x), y: r3(k.to.y) } })), refMotion: { ...(out.refMotion || {}), camera: subs.map((r) => r.id) } };
  }
  // (whoever set it, a frame pulling out over a ground drawn by a module holds the module's last frame: the table's own
  // push in its frames took two thirds of recap S1's pull-out from the measure)
  { const c = out.camera || []; if (out.module === 'frame' && out.ground?.src?.module && c.length && c.at(-1).to.zoom < c[0].from.zoom && out.ground.play !== false) out = { ...out, ground: { ...out.ground, play: false, push: 0 } }; }
  // a camera the reference keeps moving all through (moving 90 % and more) moves at an even pace over it: an eased move
  // slows under the measure's threshold for its second half (meta S1: ours ×1.12 eased out moved 47 % of the time, the
  // reference 100 %)
  { const steady = subs.filter((r) => (r.camera?.moving || 0) >= .7 && ok(`${r.id}.camera`));   // (.7: cards S7's reference moving 75 % and ours eased out to 5 %)
    if (steady.length && out.camera?.length) out = { ...out, camera: out.camera.map((k) => ((k.ease === 'out' || k.ease === 'in') && steady.some((r) => Math.min(r.end, k.end) - Math.max(r.at, k.at) > .3) ? { ...k, ease: 'linear' } : k)) }; }
  // the entrance: the sub-shot with the longest measured build the plan matches
  const ev = subs.filter((r) => ok(`${r.id}.events`) && r.camera?.anim?.build >= 1).sort((p, q) => q.camera.anim.build - p.camera.anim.build)[0];
  if (ev) {
    const an = ev.camera.anim, [a, b] = over(ev), first = Math.min(...(spec.parts || []).filter((l) => l.in !== 'none').map((l) => l.at ?? spec.at), Infinity), t0 = Math.min(a + Math.min(an.onset ?? .1, .6), first), build = Math.min(an.build, b - t0 - .3);   // (the first entrance never later than the director's: meta S6 went blank before it)
    if (spec.module === 'frame' && build >= .8) {
      const moving = (spec.parts || []).map((l, i) => ({ l, i })).filter(({ l }) => l.in !== 'none'), ats = moving.map(({ l }) => l.at ?? spec.at);
      if (moving.length >= 2 && Math.max(...ats) - Math.min(...ats) < build * BD.anim.build[0]) {
        const order = [...moving].sort((p, q) => (p.l.at ?? spec.at) - (q.l.at ?? spec.at) || p.i - q.i), n = order.length, at = new Map(order.map(({ i }, k) => [i, +(t0 + build * k / n).toFixed(3)]));   // (in turn over the build, the last landing before it ends)
        out = { ...out, parts: spec.parts.map((l, i) => (at.has(i) ? { ...l, at: at.get(i), ...(l.bar ? { bar: { ...l.bar, at: +(at.get(i) + Math.max(.2, (l.bar.at ?? 0) - (l.at ?? spec.at))).toFixed(3) } } : {}) } : l)), refMotion: { ...(out.refMotion || {}), events: ev.id } };
      }
    }
    // (within what is left of the shot once the words come in: talent S4's title came in at 219.5 s with 2.6 s left, and a
    // reveal of the reference's 3.1 s could not be drawn)
    const room = spec.end - (spec.module === 'title' ? spec.textAt ?? spec.at : spec.nameAt ?? spec.at) - .2;
    if (['title', 'person'].includes(spec.module) && spec.reveal == null && Math.min(build, room) >= .8) out = { ...out, reveal: +Math.min(build, room).toFixed(3), refMotion: { ...(out.refMotion || {}), events: ev.id } };
  }
  return out;
}
// the theme a shot's spec starts from: the film's style (project.json style), else the plan's (older projects)
export const themeOf = (answer, film = null) => { const s = film || answer?.style?.id; return !s || s === 'editorial-grey' ? 'reference' : s; };
// (pure) a passage that says the same thing twice or shows one picture too often (the scorecard's subject: open S3 and S4
// barred the same sentence, meta S3 and S4 too, and ending S11 showed the speech photo a third time): the same page
// phrase marked in two shots, or one picture (not a page) in more than two shots
// one source, whatever its file: a cut, a crop or a copy keeps the source's id (the 8 hex of its URL at the end of the
// name: B06~1-…-14a42cff.mp4, B68~2-…-14a42cff.mp4 are one stock clip); a file without one is itself
export const sourceKey = (f) => { const m = String(f).match(/-([0-9a-f]{8})(?:-[^/.]*)?\.(?:mp4|mov|webm|png|jpe?g)$/i); return m ? m[1] : String(f).split('/').pop(); };
const usesOf = (spec) => new Set((JSON.stringify(spec).match(/materials\/clips\/[^"]+?\.(?:png|jpe?g|mp4|mov|webm)/g) || []).filter((f) => !/-(com|cn|org|net)-/.test(f) && !/window\.png$/.test(f)).map(sourceKey));
// (film: the shots of the film's other passages, [{ seg, id, spec }]: one stock clip of falling dollars played in five
// passages, at 1:34, 4:00, 5:49, 6:53 and 8:05, and the film review saw the same pile of money five times — the
// passage's own count saw it once each; the first two uses in the film's order stand, every later one is to change)
export function repeatPlanErrors(specs, { film = [] } = {}) {
  const errors = [], phrases = new Map(), pics = new Map();
  for (const { id, spec } of specs) {
    const marked = new Set([...(spec.beats || []).filter((b) => b.phrase && b.do === 'highlight').map((b) => b.phrase), ...(spec.parts || []).filter((l) => l.kind === 'image' && l.phrase && l.bar).flatMap((l) => [].concat(l.phrase))]);
    for (const ph of marked) { if (phrases.has(ph) && phrases.get(ph) !== id) errors.push(`${id}: marks 「${ph}」 as ${phrases.get(ph)} did; one sentence is barred once, the next shot moves on`); else phrases.set(ph, id); }
  }
  const all = [...film.map((x) => ({ ...x, mine: false })), ...specs.map((x) => ({ ...x, mine: true }))].sort((a, b) => (a.spec.at ?? 0) - (b.spec.at ?? 0));
  for (const u of all) for (const k of usesOf(u.spec)) pics.set(k, [...(pics.get(k) || []), u]);
  for (const [k, us] of pics) if (us.length > 2) for (const u of us.slice(2).filter((x) => x.mine)) errors.push(`${u.id}: shows source ${k} a third time in the film (${us.map((x) => (x.seg ? `${x.seg} ` : '') + x.id).join(', ')}); another picture or clip of the same thing`);
  return errors;
}
// a recall drawn by copy (pure, tested): a shot that sets again a module another passage shows — the same title, or
// its first three items — names that shot (ground src { shot: 'seg/S#' }) rather than copying its spec, which goes
// stale the moment that passage is redrawn (the recap's 省錢 on a dog chain r1 no longer showed, review 13, 6:23)
export function recallCopyErrors(specs, { film = [] } = {}) {
  const sig = (m) => { if (!m || typeof m !== 'object') return []; const out = []; if (m.title) out.push(`t:${m.title}`); const items = (m.nodes || m.rows || []).slice(0, 3).map((n) => (Array.isArray(n) ? n[0] : n?.text)).filter(Boolean); if (items.length === 3) out.push(`i:${items.join('|')}`); return out; };
  const mods = (sp) => [sp?.bg?.module, sp?.ground?.src?.module].filter(Boolean);
  const errors = [], other = [...film].sort((x, y) => (x.spec.at ?? 0) - (y.spec.at ?? 0));
  // (the shot of another passage playing at a moment of the film)
  const timeline = [...other, ...specs].sort((x, y) => (x.spec.at ?? 0) - (y.spec.at ?? 0)), at = (t) => { const x = timeline.filter((y) => (y.spec.at ?? 0) <= t).at(-1); return x && !specs.includes(x) ? x : null; };
  for (const { id, spec } of specs) {
    const before = other.filter((x) => (x.spec.at ?? 0) < (spec.at ?? 0)), theirs = new Map();
    for (const x of before) for (const m of [...(x.spec?.title || x.spec?.nodes ? [x.spec] : []), ...mods(x.spec)]) for (const k of sig(m)) if (!theirs.has(k)) theirs.set(k, `${x.seg}/${x.id}`);
    for (const m of mods(spec)) {
      // the same module, or one cued at another passage's moment (a copy that has gone stale matches nothing else)
      const cue = (m.nodes || []).map((n) => n?.at).find((t) => typeof t === 'number' && spec.at != null && t < spec.at - 1);
      const hit = sig(m).map((k) => theirs.get(k)).find(Boolean) || (cue != null && at(cue) ? `${at(cue).seg}/${at(cue).id}` : null);
      if (hit) { errors.push(`${id}: sets again ${hit}'s module by copying it; recall it by reference (ground: { src: { shot: '${hit}' } }) so it shows what ${hit} shows now`); break; }
    }
  }
  return errors;
}
// one device drawn the same way, again and again (the film review: r1 drew four chains of pictured rings in 70 s, the
// reference draws each of its four beats another way — rings, a reward table, a numbered timeline, a black Wait box;
// user 2026-10-22: 系统需要灵活变体): a chart device (steps, table, chart, compare, market — or a frame standing for one)
// drawn the same way at most twice in 90 s of a passage
export const deviceKey = (spec) => { const m = spec.module === 'frame' ? (spec.ground?.src?.module ? spec.ground.src.module.module || spec.stands : null) : spec.module, g = spec.ground?.src?.module || spec;   // (a designed frame of parts is its own drawing: r1-S8's reward board stands for steps but draws none)
  if (!['steps', 'table', 'chart', 'compare', 'market'].includes(m)) return null;
  return m === 'steps' ? `steps:${(g.nodes || spec.nodes || []).some((n) => n.img) ? 'pictured' : 'plain'}` : m === 'chart' ? `chart:${g.mode || spec.mode || (g.stack || spec.stack ? 'stack' : 'bars')}` : m === 'market' ? `market:${g.mode || spec.mode || 'candles'}` : m; };   // (a board of closing prices and a K-line are two drawings, as a chart's modes are: open S2 and S17)
export function deviceRepeatErrors(specs, { window = 90, max = 2 } = {}) {
  const out = [], seen = {};
  for (const { id, spec } of [...specs].sort((a, b) => a.spec.at - b.spec.at)) { const k = deviceKey(spec); if (!k) continue;
    const near = (seen[k] ||= []).filter((x) => spec.at - x.at < window); if (near.length >= max) out.push(`${id}: draws ${k} a third time within ${window} s (${near.map((x) => x.id).join(', ')}); the reference draws each beat another way: another device, or the same one in another look`);
    seen[k].push({ id, at: spec.at }); }
  return out;
}
// a shot that goes on drawing the one before (ground: { src: { shot: 'S7' } }): its ground is that shot's last picture
// and its camera starts from it unmoved — one canvas carried across the cut, nothing drawn again (the reference
// walks one 41 s canvas through r1 R07; cut into shots, the board was rebuilt at each cut, film review 4:49 and 5:09)
// ... a shot of another passage ('r1/S8') is a recall (a recap shows again what was shown): its last picture as
// it now stands, under the recall's own camera and texture (a recap that copied r1's module into its own spec showed
// the old dog chain after r1 was redrawn as the 12x12 card, twelfth whole-film review 6:23)
export function continueFrom(spec, dir) {
  const recall = (k) => { const [seg, sid] = String(k).split('/'); return { after: path.join(dir, '..', seg, `${sid}.json`), whole: true }; };
  if (String(spec?.bg?.shot || '').includes('/')) spec = { ...spec, bg: recall(spec.bg.shot) };
  const k = spec?.ground?.src?.shot; if (!k) return spec;
  if (String(k).includes('/')) return { ...spec, ground: { ...spec.ground, src: recall(k) } };
  const f = path.join(dir, `${k}.json`), prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  // the shot before drawn whole, and this camera composed with where that one's camera ended: the cut does not move,
  // and the shot can go on in or pull back out to the whole board, as the reference does at 4:56 (drawn on its last,
  // pushed-in picture it could only go further in: 12×12=? stood cut by the top edge for 5 s, film review 19)
  // (a shot before whose ground is framed by focus or push keeps the older way: its last picture, the camera unmoved)
  const end = prev?.camera?.length ? prev.camera.at(-1).to : { zoom: 1, x: 0, y: 0 }, framed = prev?.ground && (prev.ground.focus || prev.ground.push);
  // (its camera is written on the whole board, as the shot before's is: only its first move starts where that one ended)
  if (prev && !framed) {
    const from = { zoom: end.zoom || 1, x: end.x || 0, y: end.y || 0 };
    const cam = (spec.camera || []).map((c, i) => (i ? c : { ...c, from }));
    return { ...spec, ground: { ...spec.ground, src: { after: f, whole: true } }, camera: cam.length ? cam : [{ at: spec.at, end: spec.end, from, to: from, ease: 'linear' }], texture: { ...(spec.texture || {}), grain: 0, vignette: 0 } };
  }
  const out = { ...spec, ground: { ...spec.ground, src: { after: f } } };
  // (that picture is already framed and textured as the shot before ended: the camera starts unmoved from it, and no
  // second vignette or grain is laid over the first)
  if (out.camera?.length) out.camera = [{ ...out.camera[0], from: { zoom: 1, x: 0, y: 0 } }, ...out.camera.slice(1)];
  out.texture = { ...(out.texture || {}), grain: 0, vignette: 0 };
  return out;
}
export function checkShotplan(answer, range, { referenceCuts = [], index = null, judge = null, blind = false, narration = [], names = [], pages = null, card = null, styles = null, glyphs = null, film = [], filmStyle = null, six = false } = {}) {
  const errors = [], warnings = [], shots = [];
  const list = answer?.shots || [];
  if (!list.length) errors.push('no shots');
  list.forEach((s, i) => {
    let spec; try { spec = JSON.parse(s.spec); } catch { errors.push(`${s.id}: spec is not JSON`); return; }
    spec = { theme: themeOf(answer, filmStyle), ...spec, module: s.module, at: s.at, end: s.end };
    if (i && Math.abs(s.at - list[i - 1].end) > .02) errors.push(`${s.id}: not contiguous with ${list[i - 1].id}`);
    if (s.end - s.at > MAX_SHOT) errors.push(`${s.id}: ${(s.end - s.at).toFixed(1)} s; ${MAX_SHOT} s at most`);
    // a module plays its whole move once (a chat stage drops in, a compare draws its hardware on): the same module twice
    // in a row restarts that move; one shot with its beats inside reads as one move, as the reference does
    // ... a card of another person, another report, another mark is a new subject, not a restart (reference P30 -> P31)
    // ... unless the reference itself cuts there to another framing of the same subject (R03 -> R04: the same report,
    // from the whole page to the line; the breakdown card's cut)
    const refCut = (t) => !!card?.cuts?.some((c) => Math.abs(c - t) <= .3);
    if (i && s.module === list[i - 1].module && !['sidecard', 'insert'].includes(s.module) && s.end - list[i - 1].at <= MAX_SHOT && sameSubject(spec, parseSpec(list[i - 1])) && !refCut(s.at)) errors.push(`${s.id}: a second ${s.module} on the same subject right after ${list[i - 1].id} restarts its move; make them one shot`);
    // a flash is joined to its neighbour, unless the reference flashes there too (a burst of photos 0.4 s each, cut on
    // the breakdown card's cuts at both ends: open R07-R10)
    if (s.end - s.at < .5 && !(s.end - s.at >= .3 && refCut(s.at) && refCut(s.end))) errors.push(`${s.id}: ${(s.end - s.at).toFixed(2)} s is a flash, not a shot; join it to its neighbour`);
    for (const e of checkModuleSpec(spec)) errors.push(`${s.id}: ${e}`);
    // (a camera of the director's own where no reference shows the moment — a plan from the script alone, or past the
    // film — is held to its kind's range in the motion language; where the reference shows it, its measure rules)
    if (!(card && card.source !== 'norms' && (card.subs || []).some((r) => Math.min(spec.end, r.end) - Math.max(spec.at, r.at) > .2)) && MODULE_DEVICE[spec.module] && langOf()) for (const e of motionErrors(langOf(), MODULE_DEVICE[spec.module], spec)) errors.push(`${s.id}: ${e}`);
    if (index) for (const e of materialErrors(spec, index)) errors.push(`${s.id}: ${e}`);
    // the phrases it marks, read on their pages (pages: modules.mjs phraseErrors; OCR, so left out of offline checks)
    if (pages) for (const e of pages(spec)) errors.push(`${s.id}: ${e}`);
    shots.push({ id: s.id, why: s.why, spec });
  });
  // a six-stage film: no torn labels at all (the label family is retired for new films: the user 2026-10-25 不要撕纸纸条,
  // 2026-10-26 不要红底字) and no dress on the display line (glow, extrude: 不要加字描边阴影) — the older films keep theirs
  errors.push(...labelErrors(shots, six ? { maxShare: 0, consecutive: false, perShot: 0 } : houseRules().labels || undefined));
  if (six) for (const sh of shots) { const tr = [sh.spec.treat, ...(sh.spec.parts || []).map((l) => l.treat)].flat().filter(Boolean); const bad = tr.filter((t) => DRESS_TREATS.includes(t)); if (bad.length) errors.push(`${sh.id}: treat ${bad.join(', ')} dresses the words (a glow, a cast shadow); a new film sets them plain: colour and size carry the stress`); }
  // every item of the breakdown card answered, and the cuts said to match are cuts (breakdown.mjs)
  if (card && (!blind || card.source === 'norms')) errors.push(...followErrors(answer, card, { norms: card.source === 'norms' }), ...groundErrors(answer, card, { index }));
  if (styles) errors.push(...styleErrors(answer, styles, filmStyle));
  errors.push(...draftErrors(answer));   // (blanks the draft left: draft.mjs)
  // (sameness: scriptcard.mjs) refuses a plan made from its script alone; against a film the film's own structure wins
  // (the reference sets three person cards running, talent R08-R10): said, not refused
  if (!card || card.source === 'norms') errors.push(...varietyErrors(answer)); else warnings.push(...varietyErrors(answer));
  // every word on screen is set in a house font (glyphs: house.mjs unsettable, given by the run; the fonts are local)
  if (glyphs) for (const sh of shots) { const miss = glyphs(sh.spec); if (miss.length) errors.push(`${sh.id}: no house font has ${miss.join('')}; say it with other words`); }
  if (list.length && (Math.abs(list[0].at - range[0]) > .05 || Math.abs(list.at(-1).end - range[1]) > .05)) errors.push('shots do not cover the range');
  // cuts that land far from any of the reference's cut points (a warning: the telling may differ on purpose)
  for (const s of list.slice(1)) if (referenceCuts.length && !referenceCuts.some((c) => Math.abs(c - s.at) < .3)) warnings.push(`${s.id} cuts at ${s.at} s; the reference cuts near ${referenceCuts.reduce((a, c) => (Math.abs(c - s.at) < Math.abs(a - s.at) ? c : a))} s`);
  const requests = (answer?.requests || []).map((q) => ({ ...q }));
  for (const q of requests) { if (!q.what || !q.kind) errors.push(`request for ${q.shot}: say what is needed and its kind`); if (!list.some((s) => s.id === q.shot)) errors.push(`request for ${q.shot}: no such shot`); }
  for (const b of answer?.reference || []) { if (!DEVICES[b.device]) errors.push(`reference beat ${b.at}: unknown device "${b.device}" (${Object.keys(DEVICES).join(' / ')})`); if (!MATERIAL_KINDS.includes(b.material)) errors.push(`reference beat ${b.at}: material must be one of ${MATERIAL_KINDS.join(' / ')}`); }
  // the plan must do what its own beats say (no quiet downgrade from the director's own reading or design)
  const against = compareToReference(answer, range, { index });
  // a norm card (a passage from its script alone: scriptcard.mjs) is the line's guess from the words, not a film: where
  // the director tells a beat with another device or material it is said, never refused (the first blind cards plan
  // was refused for putting 凭什么 on a title where the guess read the presenter, and held 28% to the 80% standard)
  if (card?.source === 'norms') warnings.push(...against.errors.map((e) => `标准卡（文案推测，不是原片）：${e}`)); else errors.push(...against.errors);
  // the independent judge (the inventory's beats of the reference): the minimum standard when the director sees the
  // reference; in a blind run it only scores (sending its beats back would show the director the reference)
  let judged = null;
  if (judge?.length) {
    judged = compareToReference({ ...answer, reference: judge }, range, { index });
    if (!blind) {
      errors.push(...judged.errors.map((e) => `对标：${e}`));
      for (const j of judge) { const own = (answer?.reference || []).map((b) => ({ b, o: overlap(b, j) })).sort((x, y) => y.o - x.o)[0]?.b; if (own && own.device !== j.device && !(own.device === 'presenter' && j.device === 'side-card')) warnings.push(`reading ${j.at.toFixed(1)}-${j.end.toFixed(1)} s: the director reads ${own.device}, the inventory records ${j.device} (${j.shows})`); }
    }
  }
  // without the reference (a new article, or blind): the playbook's rules on the narration
  const rubric = !judge?.length || blind ? rubricCheck(answer, narration, names, { index }) : { errors: [], warnings: [] };
  // with a breakdown card the reference's own cuts set the rhythm (the playbook's median of 6 s is for films without
  // one: it refused meta's 0.9 s Gagarin, a cut the reference makes)
  errors.push(...rubric.errors.filter((e) => !(card && /^rhythm:/.test(e)))); warnings.push(...rubric.warnings);
  warnings.push(...typeWarnings(answer));
  errors.push(...repeatPlanErrors(shots.map((x) => ({ id: x.id, spec: x.spec })), { film }));
  errors.push(...recallCopyErrors(shots.map((x) => ({ id: x.id, spec: x.spec })), { film }));
  errors.push(...deviceRepeatErrors(shots.map((x) => ({ id: x.id, spec: x.spec }))));
  return { errors, warnings, shots, requests, against, judged };
}

// The type design of a passage (house fonts, user decision 2026-10-21: 系统挑着用挑着设计): a shot's chosen face
// that lacks a character of its words is set in another house face at render (said here first); a passage of five
// shots or more with no type design, or one display face throughout, reads as undesigned
export function typeWarnings(answer, H = null) {
  const out = [], shots = (answer?.shots || []).map((s) => ({ ...s, parsed: parseSpec(s) })).filter((s) => s.parsed);
  const typed = shots.filter((s) => s.parsed.type);
  if (shots.length >= 5 && !typed.length) out.push('type: no shot chooses its fonts (type: { display, text, accent }); design the type of the passage from the six house fonts');
  const displays = new Set(typed.map((s) => s.parsed.type.display).filter(Boolean));
  if (typed.length >= 5 && displays.size === 1) out.push(`type: every shot sets its display in ${[...displays][0]}; vary it with the content (a quote, a chapter title, a hardware block read differently)`);
  if (houseMod) for (const s of typed) {
    const fam = houseMod.houseByName(s.parsed.type.display); if (!fam) continue;
    const words = []; const walk = (x, k) => { if (['type', 'phrase', 'hide', 'facts', 'about'].includes(k)) return; if (typeof x === 'string') { if (/[\u4e00-\u9fff]/.test(x) && !x.includes('/')) words.push(x); } else if (Array.isArray(x)) x.forEach((y) => walk(y, k)); else if (x && typeof x === 'object') for (const [kk, y] of Object.entries(x)) walk(y, kk); };
    walk(s.parsed, null);
    // what the display face lacks may be words set in the shot's chosen text face; only what neither has is said
    const textFam = houseMod.houseByName(s.parsed.type.text);
    const lacks = houseMod.missingGlyphs(fam, houseMod.toHant(words).join('')).filter((c) => !textFam || houseMod.missingGlyphs(textFam, c).length);
    if (lacks.length) out.push(`${s.id}: ${s.parsed.type.display} lacks ${lacks.join('')}; those words will be set in another house font (choose a face that has them, or other words)`);
  }
  return out;
}
let houseMod = null;
export async function loadHouse() { houseMod = await import('./house.mjs'); return houseMod; }

// The playbook's rules when there is no reference to match (pure, tested): the presenter alone at most 6 s at a time;
// a named person said for the first time is shown (person / quote / chat, or a portrait in the shot) within the line;
// a report named in the narration is read (article); a long run of one module is a warning. A shot that filed a
// request for what it lacks passes (it stands in meanwhile).
export const PLAIN_MAX = 6, RHYTHM_MEDIAN = 4;
export function rubricCheck(answer, narration = [], names = [], { index = null } = {}) {
  const errors = [], warnings = [], shots = (answer?.shots || []).map((s) => ({ ...s, parsed: parseSpec(s) }));
  const requested = new Set((answer?.requests || []).map((q) => q.shot));
  let run = 0;
  for (const s of shots) { run = isPlainPresenter(s.parsed) ? run + (s.end - s.at) : 0; if (run > PLAIN_MAX + .01) { errors.push(`${s.id}: the presenter alone for ${run.toFixed(1)} s; the playbook allows ${PLAIN_MAX} s (a tag, a card or an insert)`); run = 0; } }
  const at = (t) => shots.filter((s) => s.end > t - .5 && s.at < t + 2.5);
  const seen = new Set();
  for (const l of narration) for (const n of names) {
    const hit = n.names.find((x) => l.text.includes(x));
    if (!hit || seen.has(n.id)) continue;
    seen.add(n.id);
    const t = l.words?.find((w) => hit.startsWith(w[0]) || w[0].startsWith(hit[0]))?.[1] ?? l.at, near = at(t);
    if (n.kind === 'person') {
      const shown = near.some((s) => ['person', 'quote', 'chat'].includes(s.module) || (index && s.parsed && picks(s.parsed).some(([, f]) => index.files[f]?.kind === 'portrait' && !/presenter/.test(f))));
      if (!shown && !near.some((s) => requested.has(s.id))) errors.push(`${l.at.toFixed(1)} s: ${hit} is named for the first time and not shown (person card, quote, or a request for the portrait)`);
    } else if (!near.some((s) => s.module !== 'sidecard' || (s.parsed?.cards || []).length)) warnings.push(`${l.at.toFixed(1)} s: ${hit} is named for the first time with nothing of it on screen (brand, card, insert)`);
  }
  for (const l of narration) if (/报道|新闻|文章|撰文|发文|公告|论文/.test(l.text) && !at(l.at).some((s) => s.module === 'article' || requested.has(s.id))) warnings.push(`${l.at.toFixed(1)} s: a report is named ("${l.text.slice(0, 14)}…"); the playbook reads it (article)`);
  // rhythm (the reference holds one device over a few sentences on one subject: an article 12 s, a person card 6 s,
  // median 6 s; the blind Meta plan cut every 2-3 s and read busier than the reference)
  const held = shots.filter((s) => !['brand', 'insert'].includes(s.module)), lens = held.map((s) => s.end - s.at).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  if (lens.length >= 3 && median < RHYTHM_MEDIAN) errors.push(`rhythm: the shots hold ${median.toFixed(1)} s (median); the reference holds a device over the sentences on one subject (median about 6 s). Join the shots on one subject into one device, its beats inside it`);
  for (const s of held) if (s.end - s.at < 2 && !isPlainPresenter(s.parsed)) warnings.push(`${s.id}: ${s.module} for ${(s.end - s.at).toFixed(1)} s is too short to read`);
  let same = 1; shots.forEach((s, i) => { same = i && s.module === shots[i - 1].module && s.module !== 'sidecard' ? same + 1 : 1; if (same === 3) warnings.push(`${s.id}: three ${s.module} in a row`); });
  return { errors, warnings };
}
// the people, products and organisations the line knows by name (entities.json, routing/known-names.json)
export function knownNames(cfg) {
  const r = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
  const ent = (r(path.join(cfg.dataDir, 'entities.json')).entities || []).map((e) => ({ id: e.id, kind: e.kind, names: e.names }));
  const known = (r(path.join(cfg.dataDir, 'routing', 'known-names.json')).names || []).map((e, i) => ({ id: `known-${i}`, kind: e.kind, names: e.names }));
  const out = [...ent];
  for (const k of known) if (!out.some((e) => e.names.some((n) => k.names.includes(n)))) out.push(k);
  return out.map((e) => ({ ...e, names: [...e.names].filter((n) => [...n].length >= 2).sort((a, b) => b.length - a.length) }));
}

// ---------------------------------------------------------------- requests -> material needs -> the index

// A request of the director as a need of the materials step (needs.json, keyed <seg>-<shot>): a page through article
// source discovery, a photograph / portrait / logo through the archives, the library and official sites, footage through
// YouTube and the archives. `module: true`: fetched into materials/clips for the index, never bound into a shot
// (materials.bindShots). The gates stay the materials step's (AGENTS.md: trusted and checked picks go, the rest wait).
// (pure) the headline of the report the reference shows over [at, end): the card reader quotes it after 标题 or as the
// report's first 「…」 (cards R03 「幻方量化花10个亿，就为了这1万张A100显卡」, meta R03 '扎克伯格召开庞大的战情室…')
export function refHeadline(card, at, end) {
  for (const r of card?.subs || []) {
    if (Math.min(end, r.end) - Math.max(at, r.at) <= 0 || !['article', 'screen', 'pagecurl'].includes(r.read?.device)) continue;
    const t = String(r.read?.shows || ''), m = t.match(/标题[《「'“"]([^》」'”"]{6,60})/) || (/报道|页面|文章|新闻/.test(t) && t.match(/「([^」]{8,60})」/));
    if (m && (m[1].match(/[\u4e00-\u9fff]/g) || []).length >= 4) return m[1];   // (a figure quoted from the text is no headline: 「5926.58亿」)
  }
  return null;
}
export function requestNeed(seg, q, line = '', refAt = null) {
  const key = `${seg}-${q.shot}`, entity = q.entity || null, en = q.search || q.what;
  // a report named by its title (《美国筑起芯片高墙之时》): a page whose title carries it is that report
  const titled = (String(q.what).match(/《([^》]{4,40})》/) || [])[1] || null;
  // refAt: the middle of the shot, where the reference's frame is taken for the contact sheet (matpick.mjs)
  const base = { shotId: key, module: true, range: null, line, original: q.what, entity, bind: null, note: q.reference || '', refAt };
  // (refTitle: the headline of the report the reference shows over this shot, read on its card: searched first, and a
  // Chinese one keeps Chinese reports first; user 2026-10-23: 对标找到很正式很好 你为什么从博客截呢)
  const ref = q.refTitle || null;
  // what the page must say: the figures and the quoted words of the request (「…」), so a page on the subject that does
  // not carry the claim is turned down when it arrives (pageClaimError)
  const must = [...new Set([...String(q.what).matchAll(/「([^」]{2,30})」/g)].map((m) => m[1]).concat([...String(q.what).matchAll(/(?<![A-Za-z\d.])\d[\d.,]*\s*(?:万亿|亿|万|%|美元|元|张|个|倍)/g)].map((m) => m[0])).map((x) => x.trim()).filter((x) => x.length >= 2))];
  if (q.kind === 'page') return { ...base, form: 'webpage', kind: 'page', page: { title: titled || ref || q.what, entities: [titled, entity].filter(Boolean), keywords: [], queryEn: en, ...(must.length ? { must } : {}), ...(ref ? { refTitle: ref, local: /[\u4e00-\u9fff]/.test(ref) } : {}), ...(!ref && titled && /[\u4e00-\u9fff]/.test(titled) ? { local: true } : {}) } };   // (a Chinese report named by its title keeps Chinese reports first, whatever script its subject is written in: 《…Meta被曝组建4个小组…》 under the entity Meta was dropped for English pages, meta-S4 2026-10-24)
  if (q.kind === 'footage') return { ...base, form: 'video', kind: 'archival', youtube: [en], archive: { entities: [entity].filter(Boolean), keywords: [] }, clip: en };
  // a product cut out of its photograph (a card's product, the compare's hardware): a product photo, then cut out
  if (q.kind === 'cutout') return { ...base, form: 'photo', kind: 'archival', look: { cutout: true }, archive: { entities: [entity].filter(Boolean), keywords: ['product'] }, clip: en };
  if (q.kind === 'logo') return { ...base, form: 'logo', kind: 'archival', archive: { entities: [entity].filter(Boolean), keywords: ['logo'] } };
  // a picture of no one in particular (a stock board, a candlestick chart, a rocket on its pad) is searched by the
  // director's English words, and among video too (a still of footage stands for a photo): with no name and no
  // keyword the archives were asked nothing, and every such need came back empty (open-S2, S17, meta-S10)
  const words = entity ? [] : String(en || '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
  return { ...base, form: 'photo', kind: 'archival', archive: { entities: [entity].filter(Boolean), keywords: q.kind === 'portrait' ? ['portrait'] : words }, ...(entity ? {} : { youtube: [en] }), clip: en };
}
// Cooperative same-UID protocol: nobody removes/replaces a lock except its owner.
// Stale or incomplete locks require manual recovery after stopping ALL material workers;
// PID absence (or EPERM) alone cannot prove that cleanup is safe. Not an adversarial CAS.
const materialOwners = new WeakMap();
export function ownsMaterialsLock(owner, cfg, id) {
  const record = typeof owner === 'function' && materialOwners.get(owner);
  return !!record && record === path.join(projectPaths(cfg, id).root, 'materials', '.lock');
}
export async function materialsLock(cfg, id, log = () => {}, { waitMs = 2000, maxWait = 3600000 } = {}) {
  const f = path.join(projectPaths(cfg, id).root, 'materials', '.lock');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const started = Date.now(), token = JSON.stringify({ pid: process.pid, token: randomUUID() });
  let said = false, stat;
  for (;;) {
    let fd;
    try { fd = fs.openSync(f, 'wx', 0o600); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let owner;
      try { owner = fs.readFileSync(f, 'utf8').slice(0, 512) || '(empty; owner unknown)'; }
      catch (readError) { if (readError.code === 'ENOENT') continue; throw readError; }
      if (Date.now() - started >= maxWait) throw new Error(`materials lock timed out: ${f}; owner ${owner}; stop all material workers before manual stale-lock removal`);
      if (!said) { log(`  materials: waiting for another passage (owner ${owner})`); said = true; }
      await new Promise((r) => setTimeout(r, Math.min(waitMs, Math.max(0, maxWait - (Date.now() - started)))));
      continue;
    }
    try { stat = fs.fstatSync(fd); fs.writeFileSync(fd, token); }
    finally { fs.closeSync(fd); }
    break;
  }
  let released = false;
  const release = () => {
    if (released) return;
    try {
      const current = fs.lstatSync(f);
      if (current.dev !== stat.dev || current.ino !== stat.ino || fs.readFileSync(f, 'utf8') !== token) throw new Error(`materials lock ownership changed: ${f}`);
      fs.unlinkSync(f);
      released = true;
    } catch (e) { if (e.code !== 'ENOENT') throw e; released = true; }
    finally { materialOwners.delete(release); }
  };
  materialOwners.set(release, f);
  return release;
}
export function requestNeeds(cfg, id, seg, requests, { shots = [], narration = [], blind = false } = {}) {
  const file = path.join(projectPaths(cfg, id).root, 'materials', 'needs.json');
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { contract: 'A1RecipeBoardMaterialNeeds/v1', note: '由 shot writer 从分镜方案生成。', needs: [] };
  // the line said over the shot (what the page must be about, for the search and the reading window)
  const lineOf = (q) => { const s = shots.find((x) => x.id === q.shot); return s ? narration.filter((l) => l.end > s.at && l.at < s.end).map((l) => l.text).join('') : ''; };
  const mid = (q) => { const s = shots.find((x) => x.id === q.shot); return s ? +((s.at + s.end) / 2).toFixed(2) : null; };
  // the width the picture is shown at in its shot (a person card's frame, a quote's half): what it needs to be
  const slotWidth = (q) => { const s = shots.find((x) => x.id === q.shot); let sp = {}; try { sp = typeof s?.spec === 'string' ? JSON.parse(s.spec) : s?.spec || {}; } catch { /* */ } return s?.module === 'person' && sp.layout === 'card' ? 800 : s?.module === 'quote' ? 900 : null; };
  // (a request of no shot, the film's library: what it asks for is the viewer's task; the archives refuse a search
  // without one: VIEWER_TASK_REQUIRED, every library portrait came back from Commons empty)
  // the reference's headline over the shot (the card's reading of its article sub-shots): the page asked for is that report
  const card = readCard(cfg, id, seg), refTitleOf = (q) => { const s = shots.find((x) => x.id === q.shot); return s && q.kind === 'page' ? refHeadline(card, s.at, s.end) : null; };
  const mine = requests.map((q) => ({ ...requestNeed(seg, { ...q, refTitle: q.refTitle || refTitleOf(q) }, lineOf(q) || q.what, mid(q)), ...(q.slotWidth || slotWidth(q) ? { slotWidth: q.slotWidth || slotWidth(q) } : {}), ...(blind ? { blind: true } : {}) }));   // (q.slotWidth: a library portrait, shown at most in a card or beside its blurred room)   // (blind: the pick sheet shows no reference frame; the code's own measures still use it)
  const keys = new Set(mine.map((n) => n.shotId));
  // this passage's earlier requests go (a request not repeated was met or withdrawn); other shots' needs stay
  prev.needs = [...(prev.needs || []).filter((n) => !(n.module && String(n.shotId).startsWith(`${seg}-`))), ...mine];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(prev, null, 1) + '\n');
  return [...keys];
}
// what the materials step fetched for the requests: { <key>: <repo path of the picture> } (materials/bindings.json)
export function arrived(cfg, id, keys) {
  const f = path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json');
  const b = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { shots: {} };
  const out = {};
  for (const k of keys) { const f = b.shots?.[k]?.file; if (f && fs.existsSync(f)) out[k] = path.relative(cfg.sourceRoot, f); }
  return out;
}
// a fetched pick taken back by the line (too small, the wrong page): its approval superseded, its binding moved aside,
// the URL left out of the next proposal; the file stays in the library
export function withdraw(cfg, id, key, why) {
  const dir = path.join(projectPaths(cfg, id).root, 'materials'), at = new Date().toISOString();
  const af = path.join(dir, 'approvals.json'), bf = path.join(dir, 'bindings.json');
  const a = JSON.parse(fs.readFileSync(af, 'utf8')), b = fs.existsSync(bf) ? JSON.parse(fs.readFileSync(bf, 'utf8')) : { shots: {} };
  for (const x of a.batches) for (const i of x.items) if (i.shotId === key && ['approved', 'fetched'].includes(i.status)) Object.assign(i, { status: 'failed', attempts: 3, error: `withdrawn by the shot director: ${why}`, supersededAt: at });
  if (b.shots?.[key]) { b.superseded = { ...(b.superseded || {}), [`${key}@${at}`]: { ...b.shots[key], why } }; delete b.shots[key]; }
  fs.writeFileSync(af, JSON.stringify(a, null, 1) + '\n'); fs.writeFileSync(bf, JSON.stringify(b, null, 1) + '\n');
}
// what a fetched picture must be for its need (read by the material index): the kind asked for (a page for a page,
// a photograph or footage for a photo, a mark for a logo) and big enough to fill its slot; null when it fits
// (pure) a page that does not carry what its shot says, or is about another time: the claim's figures and quoted words
// (need.page.must, from the request) are on it, and a date printed on it falls in the film's news window (project
// newsWindow) when it prints one (open-S3: 界面 and 新浪 reported a 2026 slide as "蒸发6000亿美元" for the January 2025 one)
// (page: the archived text of the whole page, with the screenshot's OCR: 36氪's 「万张A100」 was further down than the
// first screen and the page was turned down; a figure counts only with its unit, 36氪 and A100 are no figures)
export function pageClaimError(need, e, window = null, page = '') {
  if (need?.form !== 'webpage' || !e) return null;
  const flat = (x) => String(x || '').replace(/[\s,，]/g, '').toLowerCase(), text = flat(`${e.text || ''} ${page || ''}`);
  const must = (need.page?.must || []).filter(Boolean);
  if (must.length && text.length > 40 && !must.some((m) => text.includes(flat(m)))) return `the page does not say ${must.map((m) => `「${m}」`).join(' or ')}`;
  if (window && text) { const ds = [...String(`${e.text || ''} ${String(page || '').slice(0, 3000)}`).matchAll(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/g)].map((m) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`).filter((d) => d >= '2000');
    if (ds.length && !ds.some((d) => d >= window[0] && d <= window[1])) return `dated ${ds[0]}, outside the story's time (${window[0]} to ${window[1]})`; }
  return null;
}
export function fitError(need, e, minWidth) {
  if (!e) return 'not read by the material index';
  { const w = e.kind !== 'page' && String(e.text || '').match(STOCK_MARK); if (w) return `a stock library's watermark or price tag on it ("${w[0]}")`; }   // (a page's photo credit, VIA GETTY IMAGES, is no watermark)
  const want = { webpage: ['page'], photo: ['photo', 'portrait', 'footage', 'page', 'cutout'], video: ['footage'], logo: ['logo', 'cutout', 'photo'] }[need.form] || null;
  if (want && !want.includes(e.kind)) return `a ${e.kind}, not the ${need.form} asked for`;
  if (e.kind !== 'footage' && e.w && e.w < minWidth) return `${e.w} px wide, ${minWidth} at least to fill its slot`;
  return null;
}
// the subject of a fetched product photo on transparency, in modules/cutouts/<key>.png (null when nothing could be
// lifted, or the cutout keeps almost all of the picture: no subject was found)
export function cutOut(cfg, id, key, file) {
  const out = path.join(projectPaths(cfg, id).root, 'modules', 'cutouts', `${key}.png`);
  if (!fs.existsSync(out)) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    // a picture already on transparency is its own cutout (the official A100 PNG: Vision found no subject in it and the
    // line threw the best pick away)
    const py1 = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
    const own = parseFloat(spawnSync(py1, ['-c', 'import cv2,sys\nim=cv2.imread(sys.argv[1],cv2.IMREAD_UNCHANGED)\nprint((im[:,:,3]>128).mean() if im is not None and im.ndim==3 and im.shape[2]==4 else 1)', sourcePath(cfg, file)], { encoding: 'utf8' }).stdout);
    if (own > .03 && own < .97) fs.copyFileSync(sourcePath(cfg, file), out);
    else { const r = spawnSync('swift', [path.join(HERE_SP, 'cutout.swift'), sourcePath(cfg, file), out], { encoding: 'utf8', timeout: 180000 });
      if (r.status !== 0 || !fs.existsSync(out)) return null; }
    // cropped to the subject (a few percent of margin): the photo's whole canvas left the product small in its slot
    const py0 = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
    spawnSync(py0, ['-c', 'import cv2,sys,numpy as np\nim=cv2.imread(sys.argv[1],cv2.IMREAD_UNCHANGED)\nys,xs=np.where(im[:,:,3]>16)\nif len(xs):\n  m=int(.03*max(xs.max()-xs.min(),ys.max()-ys.min()));y0,y1,x0,x1=max(0,ys.min()-m),min(im.shape[0],ys.max()+m),max(0,xs.min()-m),min(im.shape[1],xs.max()+m)\n  cv2.imwrite(sys.argv[1],im[y0:y1,x0:x1])', out]);
  }
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  const share = parseFloat(spawnSync(py, ['-c', 'import cv2,sys\nim=cv2.imread(sys.argv[1],cv2.IMREAD_UNCHANGED)\nprint((im[:,:,3]>128).mean() if im is not None and im.ndim==3 and im.shape[2]==4 else 1)', out], { encoding: 'utf8' }).stdout);
  if (!(share > .03 && share < .97)) { fs.rmSync(out, { force: true }); return null; }
  return path.relative(cfg.sourceRoot, out);
}
// a photograph or footage that will fill the frame, against the reference's frame at the shot's moment: carrying less
// than half of what it does (framecheck.fills) it would fail the shot's frame check later (meta-S6: a grey newsreel
// rocket, 3 % against 51 %), so it is turned down here and the next candidate tried; null when it holds up
// a named person's picture that is a drawing, a cartoon or a render (OpenCLIP, likeness.py --drawn): never their portrait
// (real people are never generated: a clip of Ilya Sutskever was an AI illustration, 0.999 drawn; real photos 0.01-0.1)
// (a product's photograph is no person's: H800的产品照片 was held to the drawn check and its official render refused)
export const isPersonNeed = (need) => !!need.entity && !need.look?.cutout && !(need.archive?.keywords || []).includes('product') && ((need.archive?.keywords || []).includes('portrait') || /人像|肖像|头像|頭像|portrait/i.test(need.original || ''))   // (照片 alone is any photograph: Suez's ship, 「长赐号…的照片」, was held to the person check and two real photos of it refused as drawings);
export function drawnPerson(cfg, need, file) {
  if (!isPersonNeed(need)) return null;
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-drawn-'));
  const abs = sourcePath(cfg, file), item = /\.(mp4|mov|webm)$/i.test(abs) ? { id: 'x', video: abs, t: 1 } : { id: 'x', image: abs };
  fs.writeFileSync(path.join(dir, 'in.json'), JSON.stringify([item]));
  spawnSync(py, [path.join(HERE_SP, 'likeness.py'), '--drawn', path.join(dir, 'in.json'), path.join(dir, 'out.json')], { encoding: 'utf8', timeout: 300000 });
  let p = null; try { p = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')).x; } catch { /* */ }
  fs.rmSync(dir, { recursive: true, force: true });
  return p != null && p > .5 ? `a drawing or render (${Math.round(p * 100)} %), not a photograph of ${need.entity}` : null;
}
export async function emptierThanReference(cfg, id, need, file) {
  if (need.form === 'webpage' || need.form === 'logo' || need.look?.cutout || need.refAt == null) return null;
  const video = loadProject(cfg, id).sourceVideo, src = video ? sourcePath(cfg, video) : null;
  if (!src || !fs.existsSync(src)) return null;
  const F = await import('./framecheck.mjs'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-fill-')), ours = path.join(dir, 'ours.jpg'), ref = path.join(dir, 'ref.jpg');
  const abs = sourcePath(cfg, file), clip = /\.(mp4|mov|webm)$/i.test(abs);
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...(clip ? ['-ss', '1'] : []), '-i', abs, '-frames:v', '1', '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080', ours]);
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(need.refAt), '-i', src, '-frames:v', '1', '-vf', 'scale=1920:1080', ref]);
  const [a, b] = fs.existsSync(ours) && fs.existsSync(ref) ? F.fills(cfg, [ours, ref]) : [null, null];
  fs.rmSync(dir, { recursive: true, force: true });
  return a != null && b != null && a < b * F.LIMITS.fill ? `carries ${Math.round(a * 100)} % of the frame against the reference's ${Math.round(b * 100)} %` : null;
}
// search, pick by eye (matpick.mjs), approve (the gates), fetch and check what arrived; a pick that cannot be fetched
// (a bot check: meta-S2) or does not fit (too small, the wrong kind: meta-S6) is withdrawn and the next candidate in
// the eye's order is tried, round after round, until one fits or none is left (the line never stops at the first)
export async function materialLoop(cfg, id, keys, { log = () => {}, rounds = 6, lockOwner = null } = {}) {
  if (!keys.length) return {};
  const m = await import('./materials.mjs'), P = await import('./matpick.mjs');
  // searched once: a search run again finds another set (the original report of h800-S2 was gone on the second run);
  // a need whose request changed is searched again (materials.retireChangedNeeds)
  m.retireChangedNeeds(cfg, id, { log: (l) => log('  ' + l) });
  // (a need whose search found nothing is searched again: the way a need is searched may have changed since, open-S2)
  const { shots: found } = m.readMaterials(cfg, id), unsearched = keys.filter((k) => !found[k] || !(found[k].candidates || []).length);
  if (unsearched.length) await m.findCandidates(cfg, id, { only: unsearched, log: (l) => log('  ' + l) });
  const needOf = (k) => m.readMaterials(cfg, id).needs.find((n) => m.needKey(n) === k), got = {}, waiting = new Set(), tried = new Set();
  for (let round = 1; round <= rounds; round++) {
    const pending = keys.filter((k) => !got[k] && !waiting.has(k));
    if (!pending.length) break;
    // what is already here and fits is kept; what does not fit is withdrawn before anything new is fetched
    buildIndex(cfg, id, { log: () => {} });
    { const idx = readIndex(cfg, id), here = arrived(cfg, id, pending);
      // a clip whose best moment was a weak match (or picked with no ranking at all) does not show what is asked: open-S11
      // took a news anchor and Putin for Musk; it is withdrawn like any misfit
      const binds = JSON.parse(fs.existsSync(path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json')) ? fs.readFileSync(path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json'), 'utf8') : '{"shots":{}}').shots || {};
      for (const [k, f] of Object.entries(here)) { const n = needOf(k), why = n && ((binds[k]?.weakMatch && binds[k]?.kind === 'video' ? 'the clip\'s best moment is a weak match for what is asked' : null) || fitError(n, idx.files[f], m.minWidth(n)) || pageClaimError(n, idx.files[f], loadProject(cfg, id).newsWindow || null, (() => { try { return fs.readFileSync(path.join(projectPaths(cfg, id).root, 'materials', 'sources', `${k}.txt`), 'utf8'); } catch { return ''; } })()) || drawnPerson(cfg, n, f) || await emptierThanReference(cfg, id, n, f));
        if (why) { log(`  ${k}: ${why}; the next candidate`); withdraw(cfg, id, k, why); continue; }
        // a product photo asked as a cutout: the product lifted from its background (macOS Vision, cutout.swift) into
        // modules/cutouts, where the index reads it as a cutout; a photo whose subject cannot be lifted is turned down
        if (n.look?.cutout) { const c = cutOut(cfg, id, k, f); if (!c) { log(`  ${k}: no subject could be cut out of it; the next candidate`); withdraw(cfg, id, k, 'no subject to cut out'); continue; } got[k] = c; }
        else got[k] = f; } }
    const todo = pending.filter((k) => !got[k]);
    if (!todo.length) break;
    // the eye's order for each need's best candidates; the needs not yet looked at go to the agent (a run without an
    // agent picks by the ranking)
    const look = [];
    for (const k of todo) { const n = needOf(k), r = n && m.rankNeed(cfg, id, n);
      if (!r) { log(`  ${k}: no candidate left; the shot director changes the shot`); waiting.add(k); continue; }
      const { list, print } = P.shownFor(r.ranked);
      if (P.eyeOrder(cfg, id, k, n.original ?? null)(print) === null && agentFor(cfg, id, 'matpick') === 'manual') look.push({ key: k, need: { ...n, minWidth: m.minWidth(n) }, list, print }); }
    if (look.length) { const t = P.pickTask(cfg, id, look); for (const x of look) waiting.add(x.key); log(`  ${look.map((x) => x.key).join(', ')}: to be picked by eye: ${path.relative(projectPaths(cfg, id).root, t)} (rules prompts/matpick.md)`); }
    const go = todo.filter((k) => !waiting.has(k));
    if (!go.length) break;
    const r = m.proposeBatch(cfg, id, { only: go });
    const fresh = go.map((k) => r.picks?.find((x) => x.shotId === k)).filter((p) => p && !tried.has(`${p.shotId}|${p.url}`));
    for (const k of go) { const p = r.picks?.find((x) => x.shotId === k); log(p ? `  ${k}: round ${round}: ${p.title || p.url}${p.eye ? ' (picked by eye)' : ''}` : `  ${k}: nothing left to try`); }
    if (!fresh.length) break;
    for (const p of fresh) tried.add(`${p.shotId}|${p.url}`);
    m.repickFailed(cfg, id, { log: (l) => log('  ' + l) });
    m.autoApproveTrusted(cfg, id, { log: (l) => log('  ' + l) });
    try { await m.fetchApproved(cfg, id, { lockOwner, log: (l) => log('  ' + l) }); } catch (e) { log(`  fetch: ${e.message}`); }
  }
  // what arrived this run is read into the index (a cutout is made after the round's reading)
  buildIndex(cfg, id, { log: () => {} });
  for (const k of keys) if (got[k]) log(`  ${k}: arrived ${got[k]}`); else if (!waiting.has(k)) log(`  ${k}: waiting (the user confirms on /recipe-board/materials)`);
  return got;
}

// ---------------------------------------------------------------- the report

export function reportText(seg, r, { requests = [], arrived: got = {}, head = '', warnings = [], errors = null } = {}) {
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const mark = { match: '对上', other: '手法不同', gap: '缺模块', none: '—', requested: '已提需求（先用替身）', missing: '缺' };
  const lines = [`# 对照报告 ${seg}`, '', ...(head ? [head, ''] : []), `手法对上 ${pct(r.technique)}（有模块可用的时间里，${r.seconds.matched}/${r.seconds.coverable} 秒）；素材对上 ${pct(r.material)}，已提需求 ${pct(r.materialRequested)}；对标共 ${r.seconds.reference} 秒。`, '',
    '| 对标拍子 | 手法 | 画面 | 要的素材 | 我们的镜头 | 手法 | 素材 |', '|---|---|---|---|---|---|---|',
    ...r.rows.map((x) => `| ${x.beat} | ${DEVICES[x.device]?.name || x.device} | ${x.shows} | ${x.wants} | ${x.shot || '—'} ${x.module || ''} | ${mark[x.technique]}${x.technique !== 'gap' && x.share < 1 ? `（${Math.round(x.share * 100)}%）` : ''} | ${mark[x.material]} |`)];
  if (r.gaps.length) lines.push('', '## 缺的模块', ...r.gaps.map((g) => `- ${g.name}（${g.seconds} 秒）`));
  if (requests.length) lines.push('', '## 素材需求', ...requests.map((q) => `- ${q.shot} ${q.kind}：${q.what}${got[`${seg}-${q.shot}`] ? `（已到：${got[`${seg}-${q.shot}`]}）` : '（等素材步骤）'}`));
  const errs = errors ?? r.errors;
  if (errs.length) lines.push('', '## 不放行', ...errs.map((e) => `- ${e}`));
  if (warnings.length) lines.push('', '## 提醒', ...warnings.map((w) => `- ${w}`));
  return lines.join('\n') + '\n';
}

export async function runShotplan(cfg, id, seg, { log = () => {}, revise = null, extra = [], materials: loop = true } = {}) {
  await loadHouse();
  const step = `shotplan-${seg}`, P = taskPaths(cfg, id, step);
  const task = JSON.parse(fs.readFileSync(P.task, 'utf8'));
  const codex = agentFor(cfg, id, 'shotplan') === 'codex', cuts = task.input.reference.flatMap((r) => r.referenceCuts);
  if (!fs.existsSync(P.answer) && codex) { log('  codex is writing the shot plan'); fs.writeFileSync(P.answer, JSON.stringify(await runCodexTask(cfg, step, task, 'reference'), null, 1)); }
  let answer = readAnswer(cfg, id, step);
  if (!answer) return { waiting: P.answer };
  let index = readIndex(cfg, id);
  const blind = task.input.mode === 'blind', names = knownNames(cfg);
  let judge = judgeBeats(cfg, id, task.input.range);
  const card = readCard(cfg, id, seg);
  // the judge's beats on the card's measured cuts (breakdown.mjs judgeOnCard): the inventory's coarse reading corrected
  if (card && judge) judge = judgeOnCard(judge, card, { materialOf: (d) => MATERIAL_OF[d] || DEVICES[d]?.material || 'none' });
  // with a card the reference's beats are the card's (its measured cuts and the reader's devices): the director's own
  // coarse rows are replaced (the opening plan kept rows that called 38-43 s an article where the card reads the presenter)
  if (card && card.subs.every((x) => x.read?.device)) answer = { ...answer, reference: judgeOnCard([{ at: card.range[0], end: card.range[1], device: 'presenter', material: 'none', shows: '讲者' }], card, { materialOf: (d) => MATERIAL_OF[d] || DEVICES[d]?.material || 'none' }) };
  const HM = await import('./house.mjs'), glyphs = HM.houseFonts().ready ? HM.unsettable : null;
  // the film's other passages, as their plans stand (a source used across the film: repeatPlanErrors)
  const film = (loadProject(cfg, id)?.passages || []).filter((g) => g.seg !== seg).flatMap((g) => { try { return (JSON.parse(fs.readFileSync(taskPaths(cfg, id, `shotplan-${g.seg}`).answer, 'utf8')).shots || []).map((x) => ({ seg: g.seg, id: x.id, spec: { ...JSON.parse(x.spec), at: x.at } })); } catch { return []; } });
  const check = () => checkShotplan(answer, task.input.range, { six: sixStage(loadProject(cfg, id) || {}), referenceCuts: cuts, index, judge, blind, narration: task.input.narration, names, pages: (spec) => [...phraseErrors(cfg, spec), ...notSourceErrors(cfg, id, spec)], card, styles: STYLE_LIB(), glyphs, film, filmStyle: loadProject(cfg, id)?.style || null });
  let r = check();
  // a user decision to apply to the accepted plan goes back like an error to fix (the line checks the result the same way)
  if (revise) r = { ...r, errors: [`用户决定：${revise}`, ...r.errors] };
  // the picture review's fixes (layers.mjs) go back the same way, until the shot is changed
  if (extra.length) r = { ...r, errors: [...extra, ...r.errors] };
  // an answer the line rejects goes back to the agent with the errors, twice at most (the same checks every round)
  const sendBack = async (errors, round) => {
    log(`  ${errors.length} errors, revision ${round}`);
    const rev = { ...task, input: { ...task.input, materials: describe(index), previousAnswer: answer, errorsToFix: errors } };
    answer = await runCodexTask(cfg, step, rev, 'reference'); fs.writeFileSync(P.answer, JSON.stringify(answer, null, 1));
  };
  for (let round = 1; codex && r.errors.length && round <= 2; round++) { await sendBack(r.errors, round); r = check(); }
  // the requests become material needs; the materials step looks, approves what its gates allow and fetches; a picture
  // that arrived sends the director back to re-plan that shot with it (one more round)
  let got = {};
  if (loop && r.requests.length) {
    // one passage at a time in the project's materials (passages run in their own processes: the list of needs, the
    // approvals and the pick task are shared files)
    const release = await materialsLock(cfg, id, log);
    try {
    const keys = requestNeeds(cfg, id, seg, r.requests, { shots: answer.shots || [], narration: task.input.narration, blind });
    log(`  ${keys.length} material requests -> materials step`);
    // a failing search or fetch is reported; the plan is still checked and written (the shots keep their stand-ins)
    try { got = await materialLoop(cfg, id, keys, { log, lockOwner: release }); } catch (e) { log(`  materials: ${String(e.message || e).split('\n')[0].slice(0, 160)} (tried again on the next run)`); }
    } finally { release(); }
    index = readIndex(cfg, id);
    // (also what arrived outside this run: a batch the user confirmed and the fetch step brought in, who-S16/S17 kept
    // their stand-ins while the counting hands sat in the library)
    { const bf = path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json'), bound = (fs.existsSync(bf) ? JSON.parse(fs.readFileSync(bf, 'utf8')) : {}).shots || {};
      for (const q of r.requests) { const b = bound[`${seg}-${q.shot}`]; if (!got[`${seg}-${q.shot}`] && b?.file) got[`${seg}-${q.shot}`] = path.relative(cfg.sourceRoot, b.file); } }
    // (a cut or graded copy of what arrived counts as using it: its name is the file's name with something after the stem)
    const fresh = r.requests.filter((q) => got[`${seg}-${q.shot}`] && !(answer.shots || []).some((s) => s.spec.includes(got[`${seg}-${q.shot}`].replace(/\.[a-z0-9]+$/i, ''))));
    const arrivedNotes = fresh.map((q) => `素材到了：${q.shot} 要的 ${q.kind} 已入库 ${got[`${seg}-${q.shot}`]}（见 materials）。按对标用它重排 ${q.shot}，去掉这条 request`);
    if (fresh.length && codex) {
      await sendBack(arrivedNotes, 'materials');
      r = check();
      for (let round = 1; r.errors.length && round <= 1; round++) { await sendBack(r.errors, `materials+${round}`); r = check(); }
    }
    // a session agent (manual) re-plans from the check: the plan is not accepted until it uses what arrived
    else if (fresh.length) r = { ...r, errors: [...arrivedNotes, ...r.errors] };
  }
  const score = (x) => (x ? { technique: x.technique, material: x.material, materialRequested: x.materialRequested, gaps: x.gaps } : null);
  writeCheck(cfg, id, step, { mode: task.input.mode, errors: r.errors, warnings: r.warnings, requests: r.requests, against: score(r.against), judged: score(r.judged) });
  if (r.requests.length) fs.writeFileSync(path.join(projectPaths(cfg, id).root, 'materials', `requests-${seg}.json`), JSON.stringify({ seg, requests: r.requests, arrived: got, writtenAt: new Date().toISOString() }, null, 1) + '\n');
  const report = path.join(P.dir, `${step}.report.md`);
  // the report scores the plan against the independent judge when there is one, else against its own beats
  const head = r.judged ? `裁判：对标拍子取自手法盘点（${blind ? '盲排：导演没看对标，这是事后打分' : '导演看了对标'}）。` : '没有独立裁判：按导演自己写的拍子对照，外加手法库的规则。';
  fs.writeFileSync(report, reportText(seg, r.judged || r.against, { requests: r.requests, arrived: got, head, warnings: r.warnings, errors: r.errors }));
  fs.writeFileSync(path.join(P.dir, `${step}.report.json`), JSON.stringify({ seg, mode: task.input.mode, judged: r.judged, own: r.against, requests: r.requests, arrived: got, warnings: r.warnings, writtenAt: new Date().toISOString() }, null, 1) + '\n');
  if (r.errors.length) return { ...r, report };
  const dir = path.join(projectPaths(cfg, id).root, 'modules', seg); fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.json') && !r.shots.some((s) => `${s.id}.json` === f)) fs.rmSync(path.join(dir, f));
  const gains = camGainsOf(cfg, id, seg);
  const carried = passageCarry(r.shots.map((s) => ({ id: s.id, spec: s.spec })), card);
  for (const s of r.shots) fs.writeFileSync(path.join(dir, `${s.id}.json`), JSON.stringify({ ...continueFrom(applyCamGain(withRefMotion(withRefDesign({ ...s.spec, ...carried[s.id] }, card), card, answer.follows), gains[s.id]), dir), about: s.why }, null, 1) + '\n');
  return { ...r, dir, report };
}

// render every shot of an accepted plan (a shot whose spec has not changed keeps its render) and join them with the
// recording's voice and the modules' sound into one passage, then set it beside the reference
export async function renderPassage(cfg, id, seg, { log = () => {} } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'passage');
  assertRenderStorage(cfg, id);
  const dir = path.join(projectPaths(cfg, id).root, 'modules', seg), out = path.join(projectPaths(cfg, id).root, 'out', 'passages', seg);
  fs.mkdirSync(out, { recursive: true });
  const specs = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ f, spec: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) })).sort((a, b) => a.spec.at - b.spec.at);
  // the shots render a few at a time (pool.mjs: as many as memory allows; one after another the opening took 40
  // minutes), each in its own browser; the parts are joined in order
  const { moduleStamp, concatList: moduleStampConcat, TRANSIENT } = await import('./layers.mjs'), { pool } = await import('./pool.mjs');
  const job = async ({ f, spec }) => {
    // the stamp is the spec and the module's code: a module fixed after the picture review re-renders its shots
    // (the H800 film kept the old article renders after the article module was fixed)
    const name = f.replace(/\.json$/, ''), base = path.join(out, name), stamp = `${base}.spec`, body = JSON.stringify(spec) + moduleStamp(cfg, spec.module);
    let r;
    if (fs.existsSync(`${base}-voice.mp4`) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === body) { log(`  ${name} unchanged, kept`); r = { withVoice: `${base}-voice.mp4`, check: JSON.parse(fs.existsSync(`${base}-refcheck.json`) ? fs.readFileSync(`${base}-refcheck.json`, 'utf8') : '{}') }; }
    else { log(`  ${name}: ${spec.module} ${spec.at}-${spec.end}`); r = await renderModule(cfg, id, spec, base); fs.writeFileSync(stamp, body); }
    return { withVoice: r.withVoice, check: { shot: name, module: spec.module, issues: r.check?.issues || [] } };
  };
  const done = await pool(specs, job);
  // a shot whose browser timed out under the load of the others is rendered again, alone (two passages of hupo-auto2
  // failed on a screenshot timeout and the film was joined with their old renders)
  for (const x of done) for (let k = 0; x.error && TRANSIENT.test(String(x.error.message || x.error)) && k < 2; k++) { log(`  ${x.item.f}: timed out, rendered again alone`); try { x.value = await job(x.item); x.error = null; } catch (e) { x.error = e; } }
  const failed = done.filter((x) => x.error); if (failed.length) throw new Error(`render: ${failed.map((x) => `${x.item.f}: ${String(x.error.message || x.error).slice(0, 160)}`).join('; ')}`);
  const parts = done.map((x) => x.value.withVoice), checks = done.map((x) => x.value.check);
  const list = path.join(out, 'parts.txt'); fs.writeFileSync(list, moduleStampConcat(parts, specs.map(({ spec }) => spec.end - spec.at), 60));   // (each part cut to its shot's length: layers.mjs concatList)
  const film = path.join(out, `${seg}.mp4`);
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-crf', '20', '-maxrate', '16M', '-bufsize', '32M', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-t', (specs.at(-1).spec.end - specs[0].spec.at).toFixed(4), '-c:a', 'aac', film]);
  const range = [specs[0].spec.at, specs.at(-1).spec.end];
  // the invariants (invariants.mjs): every part whole, the film as long as the passage, and at each shot's middle the
  // picture the white model showed there
  { const I = await import('./invariants.mjs'), white = path.join(out, `${seg}-animatic.mp4`);
    const errs = [...I.partErrors(specs.map(({ f, spec }, i) => ({ id: f.replace(/\.json$/, ''), file: parts[i], want: spec.end - spec.at, got: I.probe(parts[i]) }))), ...I.filmErrors(I.probe(film), range[1] - range[0])];
    const like = fs.existsSync(white) ? I.likenessAt(film, white, specs.map(({ f, spec }) => ({ id: f.replace(/\.json$/, ''), mid: (spec.at + spec.end) / 2 - range[0] }))) : [];
    const same = I.sameErrors(like);
    fs.writeFileSync(path.join(out, 'invariants.json'), JSON.stringify({ errors: errs, same, likeness: like }, null, 1) + '\n');
    for (const e of same) log(`  invariant: ${e}`);
    if (errs.length) throw new Error(`film ${seg}: ${errs.join('; ')}`); }
  const beside = besideReference(cfg, id, { module: `${seg}`, at: range[0], end: range[1] }, film, path.join(out, `${seg}-vs-reference.mp4`), { ourAudio: film });
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(checks, null, 1));
  // the grain, which the white model cannot show, measured on the film (breakdown.mjs, grainOnly): a shot short of the
  // reference's is module work for the next round (the film is made; it is reported, not held)
  { const B = await import('./breakdown.mjs'), card = B.readCard(cfg, id, seg);
    if (card) { const ours = B.oursBreakdown(cfg, id, seg, film, range, { name: 'final', ocr: false }), plan = (() => { try { return JSON.parse(fs.readFileSync(taskPaths(cfg, id, `shotplan-${seg}`).answer, 'utf8')); } catch { return {}; } })();
      const grain = B.compareBreakdown(card, ours, plan.follows || [], { shots: specs.map(({ f, spec }) => ({ id: f.replace(/\.json$/, ''), at: spec.at, end: spec.end })), grainOnly: true });
      fs.writeFileSync(path.join(out, 'breakdown', 'grain.json'), JSON.stringify(grain, null, 1) + '\n');
      for (const g of grain) log(`  grain: ${g.shot} ${g.item}: ${g.say}`); } }
  // the passage's report travels with the film (what matches the reference and what is still missing)
  const rep = path.join(taskPaths(cfg, id, `shotplan-${seg}`).dir, `shotplan-${seg}.report.md`);
  if (fs.existsSync(rep)) fs.copyFileSync(rep, path.join(out, 'report.md'));
  return { film, beside, checks, report: fs.existsSync(rep) ? path.join(out, 'report.md') : null };
}

// ---------------------------------------------------------------- in the run (run.mjs stage 'passages')

// Where a passage stands (project.passages: [{ seg, range, blind? }]): no-task, waiting (no answer), to-check (an
// answer newer than its check), rejected, accepted (render due), done (the passage film newer than every shot spec)
// an accepted plan's modules written again from it when what the line adds to a spec has changed (refType, the
// measured motion): an accepted plan is not checked again, and talent kept its hand-written cameras after withRefMotion
// came in. Only the files that differ are written (an unchanged shot keeps its render). Returns the shots rewritten.
export function refreshModules(cfg, id, seg) {
  const P = taskPaths(cfg, id, `shotplan-${seg}`), dir = path.join(projectPaths(cfg, id).root, 'modules', seg);
  if (!fs.existsSync(P.answer) || !fs.existsSync(P.check) || !fs.existsSync(dir) || JSON.parse(fs.readFileSync(P.check, 'utf8')).errors?.length) return [];
  const answer = JSON.parse(fs.readFileSync(P.answer, 'utf8')), card = readCard(cfg, id, seg), out = [], gains = camGainsOf(cfg, id, seg);
  const carried = passageCarry((answer.shots || []).flatMap((s) => { try { return [{ id: s.id, spec: { ...JSON.parse(s.spec), module: s.module, at: s.at, end: s.end } }]; } catch { return []; } }), card);
  for (const s of answer.shots || []) {
    const f = path.join(dir, `${s.id}.json`); if (!fs.existsSync(f)) continue;
    let spec; try { spec = { ...JSON.parse(s.spec), ...carried[s.id] }; } catch { continue; }
    const text = JSON.stringify({ ...continueFrom(applyCamGain(withRefMotion(withRefDesign({ theme: themeOf(answer, loadProject(cfg, id)?.style), ...spec, module: s.module, at: s.at, end: s.end }, card), card, answer.follows), gains[s.id]), dir), about: s.why }, null, 1) + '\n';
    if (fs.readFileSync(f, 'utf8') !== text) { fs.writeFileSync(f, text); out.push(s.id); }
  }
  return out;
}
export function passageState(cfg, id, g) {
  const P = taskPaths(cfg, id, `shotplan-${g.seg}`), mt = (f) => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0);
  if (!fs.existsSync(P.task)) return 'no-task';
  if (!fs.existsSync(P.answer)) return 'waiting';
  if (mt(P.answer) > mt(P.check)) return 'to-check';
  // a breakdown card made after the plan was checked: the plan answers it (breakdown.mjs)
  const cardFile = path.join(projectPaths(cfg, id).root, 'out', 'passages', g.seg, 'breakdown', 'card.json');
  if (!g.blind && mt(cardFile) > mt(P.check)) return 'to-check';
  const check = JSON.parse(fs.readFileSync(P.check, 'utf8'));
  // a plan refused by checks that have changed since is checked again (r1 stayed refused by a rule already fixed)
  // (the materials code and the eye's picks too: a refused plan waiting on its pages was never run again after the picks
  // were answered, and h800's report and CRN pages stayed picked and unfetched)
  const HERE_F = new URL(import.meta.url).pathname, code = Math.max(...[HERE_F, ...['modules.mjs', 'matindex.mjs', 'breakdown.mjs', 'materials.mjs', 'matpick.mjs'].map((f) => path.join(path.dirname(HERE_F), f)), taskPaths(cfg, id, 'matpick').answer].map(mt));
  if (check.errors?.length && code > mt(P.check)) return 'to-check';
  if (check.errors?.length) return 'rejected';
  const dir = path.join(projectPaths(cfg, id).root, 'modules', g.seg), film = path.join(projectPaths(cfg, id).root, 'out', 'passages', g.seg, `${g.seg}.mp4`);
  const newest = fs.existsSync(dir) ? Math.max(0, ...fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => mt(path.join(dir, f)))) : 0;
  // the layers between the plan and the film (layers.mjs): no film counts as done before its sheet passed the review
  const rv = reviewState(cfg, id, g.seg);
  if (rv === 'review') return 'review';
  if (rv === 'fix') return 'rejected';
  return mt(film) > newest ? 'done' : 'accepted';
}
// the passages of a film run side by side, each in its own process (user, 2026-10-22: 有什么办法能跑更快呢; the line's
// tools block their process while they work, so one process steps one passage): RB_PASSAGE_JOBS at once (default 3),
// a new one only while memory allows (pool.mjs); each child steps its passage alone, its lines prefixed with its name
export const PASSAGE_JOBS = Math.max(1, +process.env.RB_PASSAGE_JOBS || 3);
export async function stepPassages(cfg, id, opts = {}) {
  const { log = () => {}, render = true, only = null, child = false } = opts;
  if (render) assertScopeAllows(loadProject(cfg, id), 'passage');
  const segs = (loadProject(cfg, id).passages || []).filter((x) => !only || only.has(x.seg)).map((x) => x.seg);
  // the film's material library first, once (entitylib.mjs): the names the film says, their pictures found and checked
  if (!child) { try { const { prepareLibrary } = await import('./entitylib.mjs'); await prepareLibrary(cfg, id, { log }); } catch (e) { log(`  library: ${String(e.message || e).split('\n')[0].slice(0, 200)}`); } }
  if (child || PASSAGE_JOBS < 2 || segs.length < 2) return stepPassagesHere(cfg, id, opts);
  const { pool } = await import('./pool.mjs'), { spawn } = await import('node:child_process');
  const self = new URL(import.meta.url).href, storeUrl = new URL('./store.mjs', import.meta.url).href;
  const code = `const [{ stepPassages }, { boardConfig }] = await Promise.all([import(${JSON.stringify(self)}), import(${JSON.stringify(storeUrl)})]);
const r = await stepPassages(boardConfig(process.env), process.env.RB_CHILD_PROJECT, { log: (l) => console.log(l), render: process.env.RB_CHILD_RENDER === '1', only: new Set([process.env.RB_CHILD_SEG]), child: true });
console.log('__RESULT__' + JSON.stringify(r)); process.exit(0);`;   // (a child done with its passage leaves: a browser handle kept two alive and the run never ended)
  const env = { ...process.env, RECIPE_BOARD_REPO_ROOT: cfg.repoRoot, RECIPE_BOARD_SOURCE_ROOT: cfg.sourceRoot, RB_CHILD_PROJECT: id, RB_CHILD_RENDER: render ? '1' : '0' };
  const res = await pool(segs, (seg) => new Promise((resolve) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...env, RB_CHILD_SEG: seg }, stdio: ['ignore', 'pipe', 'pipe'] });
    let result = null, buf = '';
    const line = (l) => { if (l.startsWith('__RESULT__')) { try { result = JSON.parse(l.slice(10)); } catch { /* */ } } else if (l.trim()) log(`[${seg}] ${l}`); };
    p.stdout.on('data', (d) => { buf += d; const ls = buf.split('\n'); buf = ls.pop(); ls.forEach(line); });
    p.stderr.on('data', (d) => String(d).split('\n').filter((l) => l.trim()).forEach((l) => log(`[${seg}] ! ${l}`)));
    p.on('close', (c) => { if (buf) line(buf); resolve(result || [{ seg, state: `failed (exit ${c})` }]); });
  }), { jobs: PASSAGE_JOBS });
  return res.flatMap((x) => x.value || [{ seg: x.item, state: `failed: ${x.error?.message}` }]);
}
async function stepPassagesHere(cfg, id, { log = () => {}, render = true, only = null } = {}) {
  const L = await import('./layers.mjs'), out = [];
  // only: a set of passage names to step (one passage worked on at a time; the rest left as they are)
  for (const g of (loadProject(cfg, id).passages || []).filter((x) => !only || only.has(x.seg))) {
    // 0 the reference taken apart finely (breakdown.mjs): its card before the plan (not in a blind run)
    if (!g.blind && loadProject(cfg, id).sourceVideo) {
      if (!readCard(cfg, id, g.seg)) breakdownTask(cfg, id, g.seg, g.range);
      const bc = breakdownCard(cfg, id, g.seg);
      if (bc.state === 'waiting') { log(`  ${g.seg}: breakdown card waiting for an agent (${path.relative(cfg.sourceRoot, bc.task)})`); out.push({ seg: g.seg, state: 'breakdown' }); continue; }
      if (bc.state === 'rejected') { log(`  ${g.seg}: breakdown answer rejected: ${bc.errors.slice(0, 4).join('; ')}`); out.push({ seg: g.seg, state: 'breakdown' }); continue; }
      // a plan task written before the card gets it
      const tp = taskPaths(cfg, id, `shotplan-${g.seg}`).task;
      if (bc.state === 'ready' && fs.existsSync(tp)) { const t = JSON.parse(fs.readFileSync(tp, 'utf8')); if (JSON.stringify(t.input.breakdown || null) !== JSON.stringify(cardInput(bc.card)) || !t.input.guidance || !t.input.draft) { t.input.breakdown = cardInput(bc.card);
        // (the draft too: the tasks of r1 to ending were written before their cards and came without one)
        t.input.draft = await (await import('./draft.mjs')).draftFromCard(bc.card, { seed: bc.card.seed ?? null, styles: STYLE_LIB(), topic: (t.input.narration || []).map((l) => l.text).join('') }); fs.writeFileSync(tp.replace(/\.task\.json$/, '.draft.json'), JSON.stringify(t.input.draft, null, 1) + '\n'); t.input.guidance = (await import('./techniques.mjs')).guidanceFor(cfg, bc.card, { project: id, seg: g.seg }); t.input.styles ||= Object.entries(STYLE_LIB()).map(([k, v]) => ({ id: k, title: v.title, fits: v.fits, ground: v.tokens.ground, fonts: v.fonts, art: v.art, camera: v.camera })); t.images = [...new Set([...bc.card.subs.map((x) => x.sheet).filter(Boolean), ...(t.images || [])])]; fs.writeFileSync(tp, JSON.stringify(t, null, 1)); } }
    }
    { const re = refreshModules(cfg, id, g.seg); if (re.length) log(`  ${g.seg}: modules written again from the accepted plan (${re.join(', ')})`); }
    let st = passageState(cfg, id, g);
    if (st === 'no-task') { await shotplanTask(cfg, id, g.seg, g.range, { blind: !!g.blind }); st = passageState(cfg, id, g); log(`  ${g.seg}: task written (${g.blind ? 'blind' : 'with the reference'})`); }
    // codex answers by itself; a session agent's answer is checked when it is there
    const codex = agentFor(cfg, id, 'shotplan') === 'codex';
    if (st === 'to-check' || (st === 'waiting' && codex)) {
      const r = await runShotplan(cfg, id, g.seg, { log: (l) => log('  ' + l) });
      const sc = r.judged || r.against;
      log(r.waiting ? `  ${g.seg}: waiting for an agent` : `  ${g.seg}: ${r.errors.length ? `${r.errors.length} errors (tasks/shotplan-${g.seg}.check.json)` : `plan accepted, ${r.shots.length} shots`}${sc ? ` · telling ${Math.round((sc.technique ?? 0) * 100)}%, material ${Math.round((sc.material ?? 0) * 100)}%` : ''}`);
      st = passageState(cfg, id, g);
    }
    if (!['accepted', 'review', 'done'].includes(st)) { out.push({ seg: g.seg, state: st }); continue; }
    // 1 direction: a new film's look is approved once before anything is rendered at length
    const dir = L.directionState(cfg, id, g);
    if (dir.state === 'waiting') { if (!fs.existsSync(dir.sheet)) await L.directionFrames(cfg, id, g.seg, { log }); log(`  ${g.seg}: design frames ${dir.sheet}; waits for ${G.sixStage(loadProject(cfg, id)) ? 'the film\'s look (gate look)' : 'the direction (project.direction.approved)'}`); out.push({ seg: g.seg, state: 'direction' }); continue; }
    // a six-stage film: the structure first — the passage's white model, no blind review until the user approved the
    // structure (gates.mjs rough): the review is the polish loop, not spent on a telling that may change
    if (!G.polishOpen(cfg, id)) { const an = await L.animatic(cfg, id, g.seg, { log }); log(`  ${g.seg}: white model ${an.beside}; the picture review waits for your approval of the structure (gate rough)`); out.push({ seg: g.seg, state: 'rough' }); continue; }
    // 2 the sheet and the picture review
    const rv = await L.stillReview(cfg, id, g.seg, { log });
    log(`  ${g.seg}: sheet ${rv.page}`);
    if (rv.state === 'waiting') { log(`  ${g.seg}: picture review waiting for an agent (tasks/stillcheck-${g.seg}.task.json, ${rv.due.length} shots)`); out.push({ seg: g.seg, state: 'review' }); continue; }
    if (rv.state === 'answer-rejected') { log(`  ${g.seg}: picture review answer rejected: ${rv.errors.slice(0, 3).join('; ')}`); out.push({ seg: g.seg, state: 'review' }); continue; }
    const work = L.moduleWork(cfg, id, g.seg, rv.fixes || []);
    if (work.length) log(`  ${g.seg}: module work: ${work.map((w) => `${w.shot} ${w.problems.map((p) => p.kind).join(',')}`).join('; ')} (out/passages/${g.seg}/module-issues.json)`);
    const planFixes = L.reviewErrors(rv.fixes || []);
    if (planFixes.length) {
      log(`  ${g.seg}: picture review: ${planFixes.length} shots to change`);
      // back to the shot director: codex revises now; a session agent reads them in the check
      if (codex) { await runShotplan(cfg, id, g.seg, { log: (l) => log('  ' + l), extra: planFixes }); }
      else { const P = taskPaths(cfg, id, `shotplan-${g.seg}`), c = JSON.parse(fs.readFileSync(P.check, 'utf8')); writeCheck(cfg, id, `shotplan-${g.seg}`, { ...c, errors: [...planFixes, ...(c.errors || [])] }); }
      out.push({ seg: g.seg, state: 'fix' }); continue;
    }
    // a shot the code's checks failed for its module waits for the module's fix (it would fail them again on render)
    const held = (rv.fixes || []).filter((v) => v.by === 'code');
    if (held.length) { log(`  ${g.seg}: waits for module fixes the checks asked for: ${held.map((v) => v.shot).join(', ')}`); out.push({ seg: g.seg, state: 'module' }); continue; }
    // 3 the animatic (timing and cuts, cheaply), 4 the final film
    const an = await L.animatic(cfg, id, g.seg, { log });
    for (const w of L.cutsOnWords(L.passageShots(cfg, id, g.seg).map((s) => ({ id: s.id, at: s.spec.at })), readTaskNarration(cfg, id, g.seg))) log(`  warn  ${w}`);
    log(`  ${g.seg}: animatic ${an.beside}`);
    // motion measured on the animatic (layers.mjs): a module that stands still where the reference moves is module work
    // and holds the final render
    // (the director's waivers answer a measure as they answer a review: layers.mjs waive, bound to the shot's picture)
    { const W = L.readWaivers(cfg, id, g.seg), hashOf = Object.fromEntries(L.passageShots(cfg, id, g.seg).map((s) => [s.id, s.hash]));
      if (an.problems?.length && W.length) an.problems = an.problems.map((p) => ({ ...p, problems: p.problems.filter((x) => !W.some((w) => L.waives(w, p.shot, hashOf[p.shot], x))) })).filter((p) => p.problems.length); }
    if (an.problems?.length) {
      // the director's (a cut the plan said it matches, a camera the spec never asked for) go back to the plan; the
      // modules' to module-issues.json; both hold the final render
      const mine = (who) => an.problems.map((p) => ({ ...p, problems: p.problems.filter((x) => (x.owner || 'module') === who) })).filter((p) => p.problems.length);
      const planBack = mine('plan'), modWork = mine('module');
      const f = path.join(projectPaths(cfg, id).root, 'out', 'passages', g.seg, 'module-issues.json'), have = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
      const measured = (x) => /^motion:|^拆解 /.test(x.say);
      fs.writeFileSync(f, JSON.stringify([...have.filter((w) => !w.problems.every(measured)), ...modWork.map(({ shot, problems, fix }) => ({ shot, problems, fix }))], null, 1) + '\n');
      if (planBack.length) { const P = taskPaths(cfg, id, `shotplan-${g.seg}`), c = JSON.parse(fs.readFileSync(P.check, 'utf8')), errs = planBack.flatMap((p) => p.problems.map((x) => `粗剪对拆解卡：${p.shot} ${x.say}`));
        writeCheck(cfg, id, `shotplan-${g.seg}`, { ...c, errors: [...errs, ...(c.errors || []).filter((e) => !/^粗剪对拆解卡/.test(e))] }); log(`  ${g.seg}: ${errs.length} breakdown items back to the director`); }
      // (the camera's shortfalls become gains for the next white model: camgain.json, applied by refreshModules)
      { const gf = path.join(projectPaths(cfg, id).root, 'out', 'passages', g.seg, 'camgain.json'), old = camGainsOf(cfg, id, g.seg), next = gainsFromProblems(modWork, old);
        for (const [shot, gg] of Object.entries(next)) { if (JSON.stringify(gg) === JSON.stringify(old[shot])) continue; try { const k = gainSrcOf(JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).root, 'modules', g.seg, `${shot}.json`), 'utf8'))); if (k) gg.src = k; } catch { /* no module yet */ } }
        if (JSON.stringify(next) !== JSON.stringify(old)) { fs.writeFileSync(gf, JSON.stringify(next, null, 1) + '\n'); log(`  ${g.seg}: camera gains for the next white model: ${Object.entries(next).filter(([k]) => JSON.stringify(next[k]) !== JSON.stringify(old[k])).map(([k, v]) => `${k} ×${v.zoom}/${v.x}/${v.y}`).join(', ')}`); } }
      if (modWork.length) log(`  ${g.seg}: waits for module fixes the measures asked for: ${modWork.map((p) => `${p.shot} (${p.problems.map((x) => x.say.replace(/^motion: /, '')).join('; ')})`).join(', ')}`);
      out.push({ seg: g.seg, state: planBack.length ? 'fix' : 'module' }); continue;
    }
    // (always: a passage whose shot specs did not change is not done when a module it uses did; renderPassage keeps
    // every shot whose stamp, spec and module code, is unchanged: the opening's film was left stale after camera.js)
    // the fine render only once the user confirmed the rough cut (usermarks.mjs fineGate; RB_FINE=1 renders it anyway)
    // (user, 2026-10-22: 我不是很想点想自动化做好) the user's confirmation is asked only where the project asks for it
    // (project.confirmRough); else a passage whose checks and blind review passed renders fine by itself, and a shot
    // the user marked bad still holds it
    const { readMarks, fineGate } = await import('./usermarks.mjs'), marks = readMarks(cfg, id, g.seg), sh = L.passageShots(cfg, id, g.seg);
    // (a six-stage film: the user's one approval of the polished film, bound to this passage's shots: gates.mjs final)
    const six = G.sixStage(loadProject(cfg, id)), rk = (await import('./usermarks.mjs')).roughKey(sh);
    const gate = six ? (G.finalAllows(cfg, id, g.seg, G.pieceKey(rk)) ? fineGate({ ...marks, _rough: { key: rk, at: 'gate final' } }, sh) : { ok: false, why: 'the fine render waits for your approval of the polished film (gate final)' })
      : loadProject(cfg, id).confirmRough ? fineGate(marks, sh) : fineGate({ ...marks, _rough: { key: rk, at: 'auto' } }, sh);
    if (render && !gate.ok && process.env.RB_FINE !== '1') { log(`  ${g.seg}: rough cut ready; ${gate.why}`); out.push({ seg: g.seg, state: st === 'done' ? 'done' : 'rough' }); continue; }
    if (render) { const r = await renderPassage(cfg, id, g.seg, { log: (l) => log('  ' + l) }); log(`  ${g.seg}: ${r.beside}`); st = passageState(cfg, id, g); }
    out.push({ seg: g.seg, state: st === 'done' ? 'done' : render ? st : 'animatic' });
  }
  return out;
}
const readTaskNarration = (cfg, id, seg) => { const f = taskPaths(cfg, id, `shotplan-${seg}`).task; return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).input.narration : []; };
