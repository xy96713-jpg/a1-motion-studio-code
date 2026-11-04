// Shot writer: routed plan -> shots/*.json + materials/needs.json. The director already chose each
// beat's card; this fills the card's slots from the article text, learning each card's slot format
// from one verified shot that uses it. Image slots never get invented files: they get a `gen`
// description (a TODO placeholder) plus a material need, which goes through the materials pipeline.
// The theme's art templates then add layered generated art (card faces, paper under text, plates
// for non-factual backgrounds); a stock need that art now covers is not searched for.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { codexExecutable, runCodexJson } from './director.mjs';
import { agentFor, readAnswer, readTask, sha, taskPaths, writeCheck, writeTask } from './agenttask.mjs';
import { listProjects, loadRecipe, loadTheme, projectPaths, readPlan, loadShots, keptVersion } from './store.mjs';
import { applyArtTemplates, factKey } from './arttemplates.mjs';
import { sameSceneKeep } from './scenes.mjs';

// Cards whose background is the presenter's own footage.
const PRESENTER_CARDS = new Set(['presenter-side-card', 'presenter-tags', 'product-side-card', 'presenter-plain', 'poster-pair']);

// Every number shown on a card must come from the beat's text, allowing unit changes (万/亿/千).
// Only displayed text and data values are checked, never file paths or layout parameters.
const CN = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNIT = { 十: 10, 百: 100, 千: 1000 };
function cnNumber(str) {
  // 1万亿 / 三千 / 十二 / 千亿 -> number; digits may lead (6000亿).
  let total = 0, section = 0, num = 0;
  for (const ch of str) {
    if (/\d/.test(ch)) num = num * 10 + Number(ch);
    else if (ch in CN) num = CN[ch];
    else if (ch in CN_UNIT) { section += (num || 1) * CN_UNIT[ch]; num = 0; }
    else if (ch === '万' || ch === '亿') { const u = ch === '万' ? 1e4 : 1e8; total = (total + section + num) * u; section = 0; num = 0; }
  }
  return total + section + num;
}
const numbersIn = (text) => {
  const t = String(text).replace(/(\d),(?=\d{3}\b)/g, '$1');
  const digits = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const mixed = (t.match(/[\d零一二两三四五六七八九十百千]+[万亿]*[\d零一二两三四五六七八九十百千]*[万亿]*/g) || []).filter((m) => /[十百千万亿]/.test(m)).map(cnNumber);
  return [...digits, ...mixed];
};
// not shown on screen: sources, files, look settings, and the shot a recap replays (`recall: "B34"` is an id)
const SKIP_KEYS = new Set(['source', 'url', 'art', 'screen', 'asset', 'screenshot', 'path', 'gen', 'focus', 'ghost', 'at', 'position', 'max', 'video', 'outline', 'zoom', 'push', 'darken', 'blur', 'recall', 'stage', 'chapter']);   // stage: the 3D plate's spec (ids, not numbers on screen); chapter: the diagram a slice is cut from (B10 is no 10)
export function shownText(v, key) {
  if (SKIP_KEYS.has(key)) return '';
  if (typeof v === 'string') return /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? '' : v + ' ';   // a colour is no number on screen (B46's plate ink #151515, 2026-10-25)
  if (typeof v === 'number') return key === 'value' ? `${v} ` : '';
  if (Array.isArray(v)) return v.map((x) => shownText(x, key)).join('');
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => shownText(x, k)).join('');
  return '';
}
// Numbers on screen must trace to the narration or to an archived source of this shot (a web page the
// user confirmed, captured with URL and time: materials.sourceTextsFor). Returns the numbers that trace
// to neither, and which archived sources the others came from.
const sameNumber = (m, n) => m && [1e-8, 1e-4, 1e-3, 1, 1e3, 1e4, 1e8].some((k) => Math.abs(m * k - n) < 1e-6 * Math.max(1, n));
export function factTrace(slots, beatText, sources = [], { articleText = '' } = {}) {
  const fromText = numbersIn(beatText);
  // steps carried over from an earlier shot of the same diagram (done: true) may trace to the whole article
  const fromArticle = numbersIn(articleText);
  const carried = [];
  const walkDone = (v) => { if (Array.isArray(v)) v.forEach(walkDone); else if (v && typeof v === 'object') { if (v.done === true) carried.push(v); else Object.values(v).forEach(walkDone); } };
  walkDone(slots);
  const carriedOk = new Set(carried.flatMap((o) => numbersIn(shownText(o))).filter((n) => fromArticle.some((m) => sameNumber(m, n))));
  const fromSources = sources.map((s) => ({ ...s, numbers: numbersIn(s.text) }));
  const unsourced = [], used = new Map();
  // an item that names its source (figures: { value, source: url }) is checked against that page only
  const cited = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (typeof v.source === 'string') cited.push(v); Object.values(v).forEach(walk); } };
  walk(slots);
  const citedNumbers = new Set();
  for (const item of cited) {
    const src = fromSources.find((s) => s.url === item.source);
    for (const n of numbersIn(shownText({ ...item, source: undefined }))) {
      citedNumbers.add(n);
      if (fromText.some((m) => sameNumber(m, n))) continue;
      if (src && src.numbers.some((m) => sameNumber(m, n))) used.set(src.url, { url: src.url, capturedAt: src.capturedAt });
      else unsourced.push(n);
    }
  }
  for (const n of new Set(numbersIn(shownText(slots)))) {
    if (citedNumbers.has(n) || carriedOk.has(n)) continue;
    if (n < 10 || fromText.some((m) => sameNumber(m, n))) continue;
    const src = fromSources.find((s) => s.numbers.some((m) => sameNumber(m, n)));
    if (src) used.set(src.url, { url: src.url, capturedAt: src.capturedAt }); else unsourced.push(n);
  }
  return { unsourced, sources: [...used.values()] };
}
export function factCheck(slots, beatText, sources = [], opts = {}) {
  return factTrace(slots, beatText, sources, opts).unsourced;
}

// Glossary: correct spellings for names a transcript gets wrong (project.json "glossary").
function applyGlossary(text, glossary) {
  return Object.entries(glossary || {}).reduce((t, [wrong, right]) => t.split(wrong).join(right), String(text));
}

const NEED_KINDS = ['person', 'org', 'product', 'event', 'place', 'stock', 'software'];
// Shot length from the narration: characters / speech rate (project.json speechRate; ~4.5 chars/s is
// a calm read, fast talkers run 6-7).
const estimateSeconds = (text, rate = 4.5) => Math.max(2.5, Math.round((String(text).replace(/\s/g, '').length / rate) * 10) / 10);

// One verified example fill per card, with material paths replaced so they are never copied. Shots the
// writer produced itself (their id is a beat of the project's plan) are not examples.
export function cardExamples(cfg) {
  const examples = {};
  // art is filled by the theme's art plan, never by the writer: left out of the example (a "<素材>" there was
  // copied back as a string); a slot that only held art is left out too
  const scrubAll = (o) => JSON.parse(JSON.stringify(o || {}), (k, v) => (k === 'art' ? undefined : ['asset', 'screenshot', 'path'].includes(k) ? '<素材>' : v && typeof v === 'object' && !Array.isArray(v) && k && !Object.keys(v).length ? undefined : v));
  // the replica of each card (routing/exemplars.json, matched cut by cut against the reference) comes first:
  // it is the card filled the way a mature edit fills it, every slot used
  const exFile = path.join(cfg.dataDir, 'routing', 'exemplars.json');
  for (const [recipe, ref] of Object.entries(fs.existsSync(exFile) ? JSON.parse(fs.readFileSync(exFile, 'utf8')).cards || {} : {})) {
    const [project, shotId] = ref.split('/');
    const shot = loadShots(cfg, project, new Set([shotId]))[0];
    if (shot?.slots) examples[recipe] = scrubAll(shot.slots);
  }
  for (const p of listProjects(cfg)) {
    const written = new Set((readPlan(cfg, p.id)?.beats || []).map((b) => b.id));
    const shots = loadShots(cfg, p.id).filter((x) => !written.has(x.shotId) && !/^G\d/.test(x.shotId));
    for (const shot of shots) {
      if (examples[shot.recipe]) continue;
      examples[shot.recipe] = scrubAll(shot.slots);
    }
    // Scene cards learn from scenes too (a close-read scene after a title, a second person card).
    for (const shot of shots) for (const sc of shot.scenes || []) {
      const r = sc.recipe || shot.recipe;
      if (!sc.slots) continue;
      const fill = scrubAll(sc.slots);
      examples[r] = { ...fill, ...(examples[r] || {}) };
    }
  }
  return examples;
}

function slotSchema(recipe) {
  return Object.entries(recipe.slots).map(([name, s]) => `${name}（${s.kind}${s.role ? `/${s.role}` : ''}${s.maxItems ? `，最多 ${s.maxItems} 条` : ''}）`).join('，');
}

function writerPrompt(beats, cards, figures = [], mechBefore = {}) {
  const cardText = Object.entries(cards).map(([id, c]) => `### ${id}\n用途：${c.description || ''}\n槽位：${c.schema}\n已验证的填法示例：${c.example ? JSON.stringify(c.example) : '（无示例，按槽位类型填）'}`).join('\n\n');
  const ev = (b, i) => (b.evidence?.[i] ? `（真实素材：${b.evidence[i].kind}:${b.evidence[i].entity || b.evidence[i].what}）` : '');
  const sceneText = (b) => (b.scenes?.length > 1 ? '\n  分场景（scenesJson 按顺序给每个场景一个 slots 对象，用各自的卡）：' + b.scenes.map((sc, i) => `\n    场景${i + 1} 卡=${sc.recipe || b.route.recipe} 从${sc.at}秒起：${sc.recall ? `回放 ${sc.recall}；` : ''}${sc.visual || ''}${sc.evidence >= 0 ? ev(b, sc.evidence) : ''}`).join('') : '');
  // The storyboard's evidence list (what real picture to find) wins over the plan's entity guesses.
  const sourced = (b) => (b.evidence?.length ? b.evidence.map((e) => `${e.kind}:${e.entity || e.what}（${e.what}；检索 ${e.queryEn}）`) : (b.entities || []).filter((e) => e.needsSource).map((e) => `${e.kind}:${e.name}`));
  // a mechanism beat that continues the diagram of an earlier shot: same parts (ids), earlier steps done
  const mechText = (b) => (mechBefore[b.id] ? `\n  机制图接着 ${mechBefore[b.id].from} 那张图画（同一张图）：部件 ${mechBefore[b.id].spec.parts.filter((x) => x.kind !== 'link').map((x) => `${x.id}=${x.label || x.id}`).join('，')}；沿用这些 id，新的部件加在后面，前面的步骤不用重写` : '');
  const beatText = beats.map((b) => `- ${b.id} 卡=${b.route.recipe} 意图=${b.route.intentLabel}\n  原文：${b.text.replace(/\n/g, ' / ')}\n  屏幕大字：${b.onScreen.headline}；高亮：${(b.onScreen.keywords || []).join('、')}${b.visual ? `\n  这一镜的画面：${b.visual}` : ''}${sceneText(b)}${mechText(b)}\n  需要真实素材的对象：${sourced(b).join('、') || '无'}`).join('\n');
  const archived = figures.length ? `\n\n## 已存档的原始报道（用户确认过、截图存档，网址和时间都有记录）\n数据卡（图表、拼贴、表格）的数字可以引用这些句子里的数字，照原文写，不改数值、不换单位；引用了就在该数字所在条目里写 \`source\`（网址）。其他文字仍然只能来自该拍原文。\n${figures.map((f) => `- ${f.sentence}（${f.url}）`).join('\n')}` : '';
  return `你是视频包装的排版编辑。下面每个拍点已经选好了版式卡，你要按卡的槽位把内容填进去。${archived}

规则：
- 文字只能来自该拍原文（可以删减、断句，不能编造、不能改意思）。数字、人名、产品名只用原文里出现的，或者上面"已存档的原始报道"里的。两边都没有的数据，图表和表格不要硬填，宁可少放。
- 字段格式照抄该卡的示例；示例里没有的字段不要发明。示例里填了的槽位这里也要填（名单、要点、道具、底部标签），内容从这一拍原文里摘；卡上大面积空着就是没做完。标题短，6–12 个字一行；高亮词用原文里的词。标题不重复同一镜数据里已经放大的数字（同一句话不在画面上出现两次）。
- 卡上每个图片/视频槽位（image）都要填，绝不写文件路径，只写 {"gen":"这个位置自己的画面是什么（中文，一句；只写画面里的物体和场景，不写画面上的字）"}；同时在 needs 里登记这个槽位需要的真实素材：
  - kind：person 人物照片、org 公司/机构、product 产品、event 新闻事件、place 地点、stock 通用空镜、software 作者自己软件的录屏/截图。
  - original：画面上应该出现什么（中文，一句）。entity：人物/公司/产品名（没有就空字符串）。queryEn：英文检索词（3–6 个词）。cutout：人物需要抠图时为 true。
- 拍点写了"需要真实素材的对象"时，needs 照它登记（kind、entity、queryEn 照抄，original 写它的画面）；分场景的拍每个场景登记它自己的那一条。
- 不需要图片的卡，needs 为空数组。
- 场景写了"回放 Bxx"的：画面是前面那个镜头的成片，系统自己填，不登记 needs，background 写 {"gen":"回放"}；这个场景只写压在画面上的一个大字（title，2–6 个字，回顾的那一项）。
- 机制卡（槽位类型 mechanism）：data 写 {"mechanism":{"parts":[…],"steps":[…]}}。parts 是部件：芯片 {"id","kind":"chip","label","units"}（units 是计算单元个数，用原文的数）；节点 {"id","kind":"node","label","pos":[x,z]}（模型、答案、奖励、人工示范这类方块，pos 是网格坐标，比如 [0,0]、[1,0]、[1.5,1]，环形就摆成三角）；通道 {"id","kind":"link","from","to","lanes"}（节点之间的通道是单向的，带箭头）。steps 按口播顺序一步一个动作：show（出现）、cut（通道被砍，keep 是剩下的比例）、pick（从芯片里抠出 count 个单元）、flow（这条通道亮起、东西流过去）、drop（划掉一个节点，比如"不给范例"，连着它的通道一起熄掉）、grow（节点上的柱子长高，value 0–1，比如"思考的时间越来越长"）、gauge（量表，value 0–1，比如"接近满血的效率"）。每步的 label 是左侧一栏的一句话、tag 是贴在部件旁的两三个字，都只用原文里的话和数字。照示例的结构写。几拍连着讲同一个机制时，后一拍沿用前一拍的 parts 和前面的 steps（前面的步骤写 "done": true，开场就是结果，左侧条目已经列着），只在后面加这一拍新的步骤。
- slotsJson 是一个 JSON 字符串，内容是这一镜的 slots 对象。
- 标了"分场景"的拍：scenesJson 是 JSON 数组字符串，每个场景一个 slots 对象（第一个和 slotsJson 相同），每个场景只写它自己画面上的字；needs 里用 scene 写这个素材属于第几个场景（从 0 起）。没有分场景的拍，scenesJson 写 "[]"，needs 的 scene 写 0。

## 版式卡
${cardText}

## 拍点
${beatText}

只输出 JSON：{"shots":[{"beatId":"B01","slotsJson":"{...}","scenesJson":"[]","needs":[{"slot":"background","scene":0,"kind":"stock","original":"…","entity":"","queryEn":"…","cutout":false}]}]}`;
}

// The form decides the source: web pages and papers through article source discovery (captured and
// archived after approval), photos and logos from image archives and the library, video from YouTube and
// the archives, screen recordings from the author.
export function toNeed(shotId, need, beat) {
  const base = { shotId, range: null, line: beat.text.split('\n')[0], original: need.original, entity: need.entity || undefined, bind: need.slot, ...(need.form ? { form: need.form } : {}), ...(['photo', 'video'].includes(need.form) && need.queryEn ? { queryEn: need.queryEn } : {}) };
  const q = need.queryEn ? [need.queryEn] : [];
  const look = need.cutout ? { cutout: true } : need.slot === 'background' ? { darken: 0.35 } : undefined;
  const keywords = [...(beat.onScreen?.keywords || []), ...(String(beat.text).match(/\d+(?:\.\d+)?\s*(?:万亿|亿|万|%)/g) || [])].slice(0, 4);
  if (['webpage', 'paper', 'chart'].includes(need.form)) {
    return { ...base, kind: 'page', page: { title: need.original, entities: [need.entity].filter(Boolean), keywords, ...(need.queryEn ? { queryEn: need.queryEn } : {}) }, look: need.slot === 'background' ? { blur: 0.4, darken: 0.2 } : undefined };
  }
  if (need.form === 'recording' || need.kind === 'software') return { ...base, kind: 'presenter', note: '作者自己软件的画面：用你的录屏或截图，不去网上找', look };
  if (need.form === 'logo') return { ...base, kind: 'news', youtube: [], archive: { entities: [need.entity || need.queryEn], keywords: ['logo'] }, preferredMedia: ['IMAGE'], look: { fit: 'contain' } };
  if (need.form === 'photo') return { ...base, kind: 'news', youtube: [], archive: { entities: [need.entity || need.queryEn].filter(Boolean), keywords: need.queryEn ? [need.queryEn] : [] }, preferredMedia: ['IMAGE'], look };
  if (need.form === 'video') return { ...base, kind: need.kind === 'stock' ? 'stock' : 'news', youtube: q, archive: need.entity ? { entities: [need.entity], keywords: q } : undefined, clip: need.queryEn, preferredMedia: ['VIDEO'], look };
  switch (need.kind) {
    case 'person':
      return { ...base, kind: 'archival', youtube: [], archive: { entities: [need.entity || need.queryEn], keywords: ['portrait'] }, look };
    case 'software':
      return { ...base, kind: 'presenter', note: '作者自己软件的画面：用你的录屏或截图，不去网上找', look };
    case 'stock':
      return { ...base, kind: 'stock', youtube: q, clip: need.queryEn, look };
    default:
      return { ...base, kind: 'news', youtube: q, archive: need.entity ? { entities: [need.entity], keywords: [] } : undefined, clip: need.queryEn, look };
  }
}

// Keep only slots the card has; image slots keep their description (and a card-face `tint`), never
// invented files; a missing image slot still gets a description so art or materials can fill it.
function cleanSlotsFor(project, cfg, p) {
  return (slots, recipe, recipeId, visual) => {
    for (const k of Object.keys(slots)) if (!recipe.slots[k]) delete slots[k];
    // a card holds only so many items (slot maxItems): the rest would run off the frame
    for (const [k, def] of Object.entries(recipe.slots)) {
      if (!def.maxItems || !slots[k] || typeof slots[k] !== 'object') continue;
      for (const [f, v] of Object.entries(slots[k])) if (Array.isArray(v) && v.length > def.maxItems) slots[k][f] = v.slice(0, def.maxItems);
    }
    for (const [k, v] of Object.entries(slots)) if (typeof v === 'string' && recipe.slots[k].kind !== 'image') slots[k] = { text: v };
    for (const [k, v] of Object.entries(slots)) if (recipe.slots[k].kind === 'image') slots[k] = { gen: v?.gen || v?.text || k, ...(v?.tint ? { tint: v.tint } : {}), ...(v?.position ? { position: String(v.position) } : {}), ...(+v?.zoom > 1 ? { zoom: Math.min(3, +v.zoom) } : {}) };   // framing is the writer's (a pair picture in a half box showed half of each face: B46, 2026-10-25)
    for (const [k, def] of Object.entries(recipe.slots)) if (def.kind === 'image' && !slots[k]) slots[k] = { gen: visual || k };
    if (PRESENTER_CARDS.has(recipeId) && project.presenter && recipe.slots.background) slots.background = project.presenter;
    return slots;
  };
}

// Reconcile only rewritten cuts, using the prior needs as the existing authority. Historical approvals and
// library files remain; only live selections of changed/removed needs are retired.
export async function updateMaterialNeeds(cfg, id, needs, written) {
  const { materialsLock } = await import('./shotplan.mjs');
  const release = await materialsLock(cfg, id);
  try { return updateMaterialNeedsLocked(cfg, id, needs, written); }
  finally { release(); }
}
function planMaterialNeedsLocked(cfg, id, needs, written, opts = {}) {
  const dir = path.join(projectPaths(cfg, id).root, 'materials');
  const nf = path.join(dir, 'needs.json');
  const prev = fs.existsSync(nf) ? JSON.parse(fs.readFileSync(nf, 'utf8')) : { contract: 'A1RecipeBoardMaterialNeeds/v1', note: '由 shot writer 从分镜方案生成。' };
  const key = (n) => n.scene ? `${n.shotId}~${n.scene}` : n.shotId;
  // Line text alone does not change the request, but its derived search keywords do.
  const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canonical(v[k])])) : v;
  const print = (n) => { const { line, ...request } = n; return JSON.stringify(canonical(request)); };
  const old = (prev.needs || []).filter(n => written.has(n.shotId));
  // safe rewrite keeps a rewritten shot's existing needs when the answer supplies none for it (history retained)
  if (opts.allowRetire) for (const sid of written) if (!needs.some((n) => n.shotId === sid)) { const keep = (prev.needs || []).filter((n) => n.shotId === sid); if (keep.length) needs.push(...keep); }
  const current = new Map(needs.map(n => [key(n), n]));
  const changed = new Set(old.filter(n => !current.has(key(n)) || print(n) !== print(current.get(key(n)))).map(key));
  if (new Set(needs.map(key)).size !== needs.length || new Set((prev.needs || []).map(key)).size !== (prev.needs || []).length) throw new Error('material need update blocked: duplicate need key');
  if (changed.size && !opts.allowRetire) throw new Error(`material need update blocked: automatic retirement disabled (${[...changed].join(', ')})`);
  prev.needs = [...(prev.needs || []).filter(n => !written.has(n.shotId)), ...needs];
  return { dir, nf, prev };
}
function saveMaterialNeeds({ dir, nf, prev }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(nf, JSON.stringify(prev, null, 1) + '\n');
  return prev;
}
function updateMaterialNeedsLocked(cfg, id, needs, written, opts = {}) {
  return saveMaterialNeeds(planMaterialNeedsLocked(cfg, id, needs, written, opts));
}

// Writes only beats that have no shot file yet (`rewrite` redoes all, `only` limits to some beat ids),
// so hand-tuned shots are never overwritten; needs of other shots are kept.
export async function writeShots(cfg, id, options = {}) {
  const { materialsLock } = await import('./shotplan.mjs');
  const release = await materialsLock(cfg, id, options.log);
  // the rewrite transaction: shots + material needs + plan are one commit. Snapshot, write, roll back on any failure.
  const p = projectPaths(cfg, id);
  const snap = new Map();
  if (fs.existsSync(p.shots)) for (const f of fs.readdirSync(p.shots).filter((x) => x.endsWith('.json'))) snap.set(f, fs.readFileSync(path.join(p.shots, f), 'utf8'));
  const needsPath = path.join(p.root, 'materials', 'needs.json');
  const needsSnap = fs.existsSync(needsPath) ? fs.readFileSync(needsPath, 'utf8') : null;
  const matDir = path.dirname(needsPath), matSnap = new Map();
  if (fs.existsSync(matDir)) for (const f of fs.readdirSync(matDir).filter((x) => x.endsWith('.json'))) matSnap.set(f, fs.readFileSync(path.join(matDir, f), 'utf8'));
  const planSnap = fs.existsSync(p.plan) ? fs.readFileSync(p.plan, 'utf8') : null;
  try { return await writeShotsLocked(cfg, id, options); }
  catch (e) {
    try {
      if (fs.existsSync(p.shots)) for (const f of fs.readdirSync(p.shots).filter((x) => x.endsWith('.json'))) if (!snap.has(f)) fs.rmSync(path.join(p.shots, f), { force: true });
      for (const [f, bytes] of snap) fs.writeFileSync(path.join(p.shots, f), bytes);
      if (needsSnap === null) { if (fs.existsSync(needsPath)) fs.rmSync(needsPath, { force: true }); } else fs.writeFileSync(needsPath, needsSnap);
      if (fs.existsSync(matDir)) for (const f of fs.readdirSync(matDir).filter((x) => x.endsWith('.json'))) if (!matSnap.has(f)) fs.rmSync(path.join(matDir, f), { force: true });
      for (const [f, bytes] of matSnap) fs.writeFileSync(path.join(matDir, f), bytes);
      if (planSnap !== null) fs.writeFileSync(p.plan, planSnap);
    } catch { }
    throw e;
  }
  finally { release(); }
}
async function writeShotsLocked(cfg, id, { log = () => {}, only = null, rewrite = false } = {}) {
  const plan = readPlan(cfg, id);
  if (!plan) throw new Error(`${id} has no plan; run plan first`);
  const p = projectPaths(cfg, id);
  const todo = plan.beats.filter((b) => b.route.recipe && (!only || only.has(b.id)) && (rewrite || !fs.existsSync(path.join(p.shots, `${b.id}.json`))));
  const sbFile = path.join(p.root, 'storyboard.json'), sbDoc = fs.existsSync(sbFile) ? JSON.parse(fs.readFileSync(sbFile, 'utf8')) : null;
  const sbBy = Object.fromEntries(((sbDoc && sbDoc.shots) || []).map((s) => [s.beat, s]));
  for (const b of todo) { const d = sbBy[b.id]; if (!d) continue; b.route = { ...(b.route || {}), recipe: d.card }; if (d.scenes?.length) b.scenes = d.scenes.map((x) => ({ recipe: x.card, at: x.at, visual: x.visual, evidence: x.evidence, ...(x.recall ? { recall: x.recall } : {}) })); else delete b.scenes; }
  if (!todo.length) { log('every beat already has a shot'); return { shots: 0, needs: 0 }; }
  // A rewrite writes shots before needs; suspend it rather than risk a partial update.
  const needsFile = path.join(p.root, 'materials', 'needs.json');
  const existingNeeds = fs.existsSync(needsFile) ? (JSON.parse(fs.readFileSync(needsFile, 'utf8')).needs || []) : [];
  if (process.env.RB_SAFE_WRITE !== '1' && (rewrite || existingNeeds.some((n) => todo.some((b) => b.id === n.shotId)))) throw new Error('shot rewrite blocked: material need reconciliation disabled pending safe transaction');
  const bin = codexExecutable();
  if (!bin) throw new Error('Codex CLI not found (set A1_CODEX_BIN)');
  const project = JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).root, 'project.json'), 'utf8'));
  const theme = project.theme;
  const themeDef = loadTheme(cfg, theme || undefined);
  const glossary = project.glossary || {};
  const cleanSlotsBase = cleanSlotsFor(project, cfg, p);
  plan.beats.forEach((b) => {
    b.text = applyGlossary(b.text, glossary);
    b.onScreen.headline = applyGlossary(b.onScreen.headline, glossary);
    b.onScreen.keywords = (b.onScreen.keywords || []).map((k) => applyGlossary(k, glossary));
  });
  const examples = cardExamples(cfg);
  const used = [...new Set(todo.flatMap((b) => [b.route.recipe, ...(b.scenes || []).map((sc) => sc.recipe).filter(Boolean)]))];
  const cards = Object.fromEntries(used.map((r) => {
    const recipe = loadRecipe(cfg, r, theme);
    return [r, { description: recipe.description, schema: slotSchema(recipe), example: examples[r] || examples[recipe.exampleFrom] || recipe.example }];
  }));
  const { archivedFigures, sourceTextsFor } = await import('./materials.mjs');
  const figures = archivedFigures(cfg, id);
  const mechBefore = mechanismsBefore(cfg, id, plan, todo);
  const t0 = Date.now();
  // Batches of 15 beats, two at a time: a whole film in one call outruns the timeout.
  const BATCH = 15;
  const chunks = Array.from({ length: Math.ceil(todo.length / BATCH) }, (_, i) => todo.slice(i * BATCH, (i + 1) * BATCH));
  const cardsFor = (beats) => Object.fromEntries(Object.entries(cards).filter(([r]) => beats.some((b) => b.route.recipe === r || (b.scenes || []).some((sc) => sc.recipe === r))));
  let filled = [];
  if (agentFor(cfg, id, 'write') === 'codex') {
    for (let i = 0; i < chunks.length; i += 2) {
      const part = await Promise.all(chunks.slice(i, i + 2).map((c) => runCodexJson(bin, writerPrompt(c, cardsFor(c), figures, mechBefore), path.join(cfg.dataDir, 'routing', 'writer-output.schema.json'), { firstKey: 'shots', timeoutMs: 600_000 })));
      for (const r of part) filled.push(...r.shots);
      log(`codex filled ${filled.length} of ${todo.length} shots (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  } else {
    // manual (the default since 2026-10-21, user: 去掉 codex，之后都是你接入写): the same prompt as a task for the session
    // agent (tasks/write.task.json, bound to these beats); its answer is read like Codex's once newer than the task
    const tp = taskPaths(cfg, id, 'write'), forBeats = todo.map((b) => b.id).join(','), prompt = writerPrompt(todo, cardsFor(todo), figures, mechBefore);
    const task = readTask(cfg, id, 'write'), answer = readAnswer(cfg, id, 'write');
    const ready = task?.forBeats === forBeats && task?.promptHash === sha(prompt) && answer?.shots && fs.statSync(tp.answer).mtimeMs > fs.statSync(tp.task).mtimeMs;
    if (!ready) {
      if (task?.forBeats !== forBeats || task?.promptHash !== sha(prompt)) writeTask(cfg, id, 'write', { forBeats, promptHash: sha(prompt), rules: prompt, schema: 'work/recipe-board-v1/routing/writer-output.schema.json', input: { beats: forBeats } });
      log(`write: ${todo.length} shots wait for an agent (${path.relative(projectPaths(cfg, id).root, tp.task)})`);
      return { shots: 0, needs: 0, waiting: true };
    }
    filled = answer.shots.filter((x) => todo.some((b) => b.id === x.beatId));
    const { referenceBeats, emptyBackdropErrors } = await import('./reference.mjs');
    const errs = emptyBackdropErrors(filled.map((x) => { try { return { beatId: x.beatId, slots: JSON.parse(x.slotsJson || '{}') }; } catch { return { beatId: x.beatId, slots: {} }; } }), referenceBeats(cfg, id));
    if (errs.length) { writeCheck(cfg, id, 'write', { ok: false, errors: errs }); log(`write: answer rejected\n    ${errs.join('\n    ')}`); return { shots: 0, needs: 0, waiting: true, errors: errs }; }
    log(`write: ${filled.length} of ${todo.length} shots from the agent's answer`);
  }
  const result = { shots: filled };

  const pendingShots = [];
  const needs = [];
  const written = new Set();
  const byBeat = Object.fromEntries(plan.beats.map((b) => [b.id, b]));
  for (const s of result.shots) {
    let beat = byBeat[s.beatId];
    if (!beat?.route.recipe || !todo.includes(beat)) continue;
    let sceneSlots;
    try {
      const first = JSON.parse(applyGlossary(s.slotsJson, glossary));
      const listed = beat.scenes?.length > 1 ? JSON.parse(applyGlossary(s.scenesJson || '[]', glossary)) : [];
      sceneSlots = beat.scenes?.length > 1 ? beat.scenes.map((_, i) => listed[i] || (i ? {} : first)) : [first];
    } catch {
      log(`${s.beatId}: slots were not JSON, skipped`);
      continue;
    }
    const sceneRecipe = (i) => beat.scenes?.[i]?.recipe || beat.route.recipe;
    const recipes = sceneSlots.map((_, i) => loadRecipe(cfg, sceneRecipe(i), theme));
    sceneSlots = sceneSlots.map((slots, i) => cleanSlotsBase(slots, recipes[i], sceneRecipe(i), beat.scenes?.[i]?.visual || beat.visual || beat.onScreen.headline));
    // scenes that would show the same thing again are one take (sameSceneKeep)
    let merged = null;   // the storyboard's cuts kept as takes (the rewrite check reads the storyboard through it)
    { const keep = sceneSlots.length > 1 ? sameSceneKeep(sceneSlots.map((slots) => ({ slots })), (_, i) => sceneRecipe(i)) : [true];
      if (keep.some((k) => !k)) { log(`${s.beatId}: scenes ${keep.map((k, i) => (k ? null : i + 1)).filter(Boolean).join(', ')} show what the one before shows: one take`);
        merged = keep; sceneSlots = sceneSlots.filter((_, i) => keep[i]); const kept = beat.scenes.filter((_, i) => keep[i]); beat = { ...beat, scenes: kept }; recipes.splice(0, recipes.length, ...sceneSlots.map((_, i) => loadRecipe(cfg, sceneRecipe(i), theme))); } }
    // A beat with a real page to film: the capture step writes the screenshot this slot points at.
    if (beat.screen && recipes[0].slots.screen) sceneSlots[0].screen = { asset: path.relative(cfg.sourceRoot, path.join(p.root, 'materials', 'screen', s.beatId, 'screen.png')), gen: sceneSlots[0].screen?.gen };
    const recipe = recipes[0];
    const allSlots = sceneSlots.length > 1 ? { scenes: sceneSlots } : sceneSlots[0];
    const unsourced = factCheck(allSlots, beat.text, sourceTextsFor(cfg, id, s.beatId), { articleText: plan.beats.map((b) => b.text).join('\n') });
    const cues = { ...(recipe.motionCues || {}), ...(beat.cues || {}) };
    const shot = {
      shotId: s.beatId, recipe: sceneRecipe(0), subtitle: beat.text.split('\n')[0].slice(0, 28),
      ...(merged ? { mergedScenes: merged } : {}),
      note: `${beat.route.intentLabel}：${beat.why}`, slots: sceneSlots[0],
      ...(sceneSlots.length > 1 ? { scenes: sceneSlots.map((slots, i) => ({
        ...(sceneRecipe(i) !== sceneRecipe(0) ? { recipe: sceneRecipe(i), preset: recipes[i].motionPreset } : {}),
        slots, ...(beat.scenes[i].cues ? { cues: beat.scenes[i].cues } : {}),
      })) } : {}),
      ...(beat.screen ? { screen: beat.screen } : {}),
      ...(unsourced.length ? { factCheck: `原文里找不到这些数字：${unsourced.join('、')}` } : {}),
      motion: {
        preset: recipe.motionPreset, duration: beat.duration || estimateSeconds(beat.text, project.speechRate), ref: { start: 0 },
        ...(Object.keys(cues).length ? { cues } : {}),
        ...(sceneSlots.length > 1 ? { cuts: beat.scenes.map((sc) => sc.at) } : {}),
      },
    };
    // The materials step confirms and binds one item per cut: keep the most specific need of each scene
    // (a fact before stock footage, the main picture before the background); art covers the rest.
    const rank = (n) => (n.kind === 'stock' ? 4 : 0) + (n.slot === 'background' ? 2 : 0);
    // a slot may refuse evidence forms (`noForms`), or all material (`artOnly`: the side card's prop is always a
    // generated object in the house style): a side card's prop slot cannot show a web page or a paper
    // legibly, so that evidence is not put there and the prop comes from the art plan
    const usable = (n) => recipes[n.scene].slots[n.slot]?.kind === 'image' && NEED_KINDS.includes(n.kind) && !(recipes[n.scene].slots[n.slot]?.noForms || []).includes(n.form) && !recipes[n.scene].slots[n.slot]?.artOnly
      && !(n.slot === 'background' && PRESENTER_CARDS.has(sceneRecipe(n.scene)) && project.presenter) && !(beat.screen && n.slot === 'screen');
    const all = [...(s.needs || [])].map((n) => ({ ...n, scene: sceneSlots.length > 1 ? Math.min(n.scene || 0, sceneSlots.length - 1) : 0 })).sort((a, b) => rank(a) - rank(b));
    let picked = sceneSlots.map((_, k) => all.find((n) => n.scene === k && usable(n))).filter(Boolean);
    // The storyboard's evidence decides what each cut must show and in what form: it overrides the
    // writer's guess, and a cut with evidence but no need from the writer gets one on its first picture slot.
    // With a storyboard, a cut without evidence registers no fact need of its own (stock footage only).
    if (beat.design) {
      const evidence = beat.evidence || [];
      const evFor = (k) => (beat.scenes?.length > 1 ? evidence[beat.scenes[k]?.evidence] : k === 0 ? evidence[0] : null);
      picked = sceneSlots.map((_, k) => {
        const ev = evFor(k);
        const n = picked.find((x) => x.scene === k);
        if (beat.scenes?.[k]?.recall) return null;   // a replayed earlier shot: no new material
        if (!ev) return n?.kind === 'stock' ? n : null;
        const prefer = recipes[k].evidenceSlot;   // the card says where its evidence goes
        const slot = (prefer && usable({ slot: prefer, scene: k, kind: ev.kind, form: ev.form }) ? prefer : null) || (n && usable({ ...n, form: ev.form }) ? n.slot : null) || Object.entries(recipes[k].slots).find(([name, d]) => d.kind === 'image' && usable({ slot: name, scene: k, kind: ev.kind, form: ev.form }))?.[0];
        return slot ? { ...(n || {}), slot, scene: k, kind: ev.kind, form: ev.form, entity: ev.entity, queryEn: ev.queryEn, original: ev.what, cutout: n?.cutout || false } : n;
      }).filter(Boolean);
    }
    // a chapter beat shows its real pictures inside the diagram (chapter.mjs chapterMaterials: images.m_<beat>[_<k>]):
    // one need per piece of the storyboard's evidence, numbered as the evidence is, on no card slot (2026-10-23: B31's
    // photograph and B51's two court pages were dropped when the beats went on the chapter)
    if (sceneRecipe(0) === 'morph-chapter' && beat.design) picked = (beat.evidence || []).map((ev, k) => ({ slot: 'background', scene: k, kind: ev.kind, form: ev.form, entity: ev.entity, queryEn: ev.queryEn, original: ev.what, cutout: false }));
    const factSlots = new Set(picked.filter((n) => n.kind !== 'stock').map((n) => factKey(n.scene, n.slot)));
    const art = applyArtTemplates(recipe, shot, themeDef, { factSlots, recipeFor: (r) => loadRecipe(cfg, r, theme) });
    if (written.has(s.beatId)) throw new Error(`shot write blocked: duplicate beat ${s.beatId}`);
    pendingShots.push({ file: path.join(p.shots, `${s.beatId}.json`), bytes: JSON.stringify(shot, null, 1) + '\n' });
    written.add(s.beatId);
    for (const need of picked) if (!(need.kind === 'stock' && sceneSlots[need.scene][need.slot]?.art)) needs.push({ ...toNeed(s.beatId, need, beat), ...(need.scene ? { scene: need.scene } : {}) });
    log(`${s.beatId} ${beat.route.recipe.padEnd(22)} ${(s.needs || []).length} needs${art.length ? `  art ${art.join(',')}` : ''}${unsourced.length ? `  FACT CHECK: ${unsourced.join(',')}` : ''}`);
  }
  const needsPlan = planMaterialNeedsLocked(cfg, id, needs, written, { allowRetire: process.env.RB_SAFE_WRITE === '1' });
  // Cooperative lock prevents competing material writers, not crash-atomic multi-file commits.
  fs.mkdirSync(p.shots, { recursive: true });
  for (const shot of pendingShots) fs.writeFileSync(shot.file, shot.bytes);
  const prev = saveMaterialNeeds(needsPlan);
  if (process.env.RB_SAFE_WRITE === '1') { const M = await import('./materials.mjs'); M.reconcileNeedPrints(cfg, id, written, { log }); }
  // packaging is enforced before anything renders: every shot carries a valid variant + contract, and the sequence respects the repeat window
  if (process.env.RB_PACKAGING !== '0') {
    const P = await import('./packaging.mjs');
    const pkg = P.loadPackaging(cfg.dataDir), bench = P.loadBenchmarks(cfg.dataDir), gawx = P.loadGawx(cfg.dataDir);
    if (pkg) {
      const files = fs.readdirSync(p.shots).filter((f) => /^B\d+\.json$/.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const all = files.map((f) => JSON.parse(fs.readFileSync(path.join(p.shots, f), 'utf8')));
      const recent = [], packErrors = [];
      for (const s of all) {
        if (!s.design?.packaging) {
          const b = plan.beats.find((x) => x.id === s.shotId);
          const headline = b?.onScreen?.headline || s.design?.hero?.target || '';
          const a = P.assignPackaging(pkg, { headline, dur: s.motion?.duration || 5 }, { intent: s.design?.intent || 'concept', surface: 'any', recent, gawx });
          if (a) { s.design = { ...(s.design || {}), packaging: a }; fs.writeFileSync(path.join(p.shots, s.shotId + '.json'), JSON.stringify(s, null, 1) + '\n'); }
          else packErrors.push(s.shotId + ': no assignable packaging variant');
        }
        recent.push(s.design?.packaging?.variant);
      }
      for (const s of all) packErrors.push(...P.packagingShotErrors(s, pkg, bench, gawx));
      packErrors.push(...P.sequencePackagingErrors(all, pkg));
      if (packErrors.length) throw new Error('packaging: ' + packErrors.slice(0, 5).join('; '));
    }
  }
  tidyMechanisms(cfg, id, written);
  applyRecalls(cfg, id, written);
  const saved = readPlan(cfg, id);
  // the plan catches up with the storyboard only after its shots are written: a blocked rewrite stays visible
  for (const b of saved.beats || []) { const d = sbBy[b.id]; if (!d || !written.has(b.id)) continue; b.route = { ...(b.route || {}), recipe: d.card }; if (d.scenes?.length) b.scenes = d.scenes.map((x) => ({ recipe: x.card, at: x.at, visual: x.visual, evidence: x.evidence, ...(x.recall ? { recall: x.recall } : {}) })); else delete b.scenes; }
  saved.generation = { status: 'SHOTS_WRITTEN', at: new Date().toISOString(), shots: loadShots(cfg, id).filter((x) => saved.beats.some((b) => b.id === x.shotId)).length, needs: prev.needs.length };
  fs.writeFileSync(p.plan, JSON.stringify(saved, null, 2) + '\n');
  return { shots: written.size, needs: needs.length };
}

// Re-run the number check on every written shot against its beat (also after manual edits).
// Recap cuts replay an earlier shot (storyboard `recall`): the cut's picture slot plays the last seconds of
// that shot's motion render (its still is the poster frame), darkened so a word reads over it. No search,
// no download: the picture is the film's own. Writes only shots that change.
export const RECALL_SECONDS = 2.4;
// a recap holds the source's last frame and pushes in slowly: replaying its last seconds replayed a camera move the viewer
// had just seen, and a 2.4 s slice under a longer cut stopped half way (the user 2026-10-25, B37: 背景不好 还循环)
// the chapter's picture as it is now: its final render waits for the user's approval of the white model, and a recall
// still taken from it showed the chapter as it was before (B37 replayed 姓高的男子 in the old serif beside B26's gothic:
// whole-film review 2026-10-25); the newest white-model clip of the chapter stands in while it is newer
export function currentChapterVideo(cfg, id, video) {
  try {
    const abs = path.resolve(cfg.sourceRoot, video), chap = /\/chapters\/(B\d+)\//.exec(abs)?.[1]; if (!chap) return video;
    const dir = path.join(projectPaths(cfg, id).out, 'animatic', 'chapters');
    const clips = fs.readdirSync(dir).filter((f) => new RegExp(`^${chap}-[0-9a-f]{16}\\.mp4$`).test(f)).map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    const own = fs.existsSync(abs) ? fs.statSync(abs).mtimeMs : 0;
    return clips[0] && fs.statSync(clips[0]).mtimeMs > own ? path.relative(cfg.sourceRoot, clips[0]) : video;
  } catch { return video; }
}
export function recallStill(cfg, id, video, at) {
  const abs = path.resolve(cfg.sourceRoot, video); if (!fs.existsSync(abs)) return null;
  const dir = path.join(projectPaths(cfg, id).out, 'recall'), st = fs.statSync(abs), out = path.join(dir, `${path.basename(abs, '.mp4')}-${Math.round(at * 100)}-${Math.round(st.mtimeMs)}.png`);
  if (!fs.existsSync(out)) { fs.mkdirSync(dir, { recursive: true }); const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.max(0, at - 0.05)), '-i', abs, '-frames:v', '1', out]); if (r.status || !fs.existsSync(out)) return null; }
  return path.relative(cfg.sourceRoot, out);
}
export function recallFill(cfg, id, beatId, shots = null, { match = false } = {}) {   // match: the replaying beat opens on the source's last frame (B45 opened 2.4 s before B44's end: the match kept nothing)
  const p = projectPaths(cfg, id);
  const srcFile = path.join(p.shots, `${beatId}.json`);
  const src = shots?.[beatId] || (fs.existsSync(srcFile) ? JSON.parse(fs.readFileSync(srcFile, 'utf8')) : null);
  // a beat cut from a continuous diagram replays the diagram's own render, which has no subtitles (its motion
  // render has them burned in, and the recap's own subtitle stacked on them: paperclip-138-full B52 recalling B32)
  const ch = src?.slots?.background?.chapter && src.slots.background.video;
  if (ch?.path) { const cur = currentChapterVideo(cfg, id, ch.path), still = !match && recallStill(cfg, id, cur, Math.max(0, (ch.out ?? 0) - (cur !== ch.path ? 0.4 : 0)));   /* (the white model runs at 15 fps: its frame at the cut is already the next beat's) */ if (still) return { asset: still, darken: 0.45, push: 0.06, recall: beatId }; return { video: { ...ch, in: +Math.max(ch.in ?? 0, (ch.out ?? 0) - (match ? 0.1 : RECALL_SECONDS)).toFixed(2), out: ch.out }, darken: match ? 0.2 : 0.45, push: 0.04, recall: beatId }; }   // a match looks like what it continues (B09 at .45 dimmed to an empty seam)
  const d = src?.motion?.duration || 4;
  // the cut that shows the picture: the longest one that is not the presenter, taken at its end (built up)
  const cuts = src?.motion?.cuts?.length ? src.motion.cuts : [0];
  const cards = [src?.recipe, ...(src?.scenes || []).slice(1).map((x) => x.recipe || src?.recipe)];
  const segs = cuts.map((a, k) => ({ a, z: cuts[k + 1] ?? d, card: (src?.scenes?.length ? cards[k] : src?.recipe) || '' }));
  const len = (x) => Math.round((x.z - x.a) * 100);   // to the hundredth: 7.2 - 4.8 is not 2.4 in floating point
  const pick = [...segs].sort((x, y) => (/^presenter/.test(x.card) - /^presenter/.test(y.card)) || len(y) - len(x) || x.a - y.a)[0];
  // a shot waiting for its material shows a placeholder; the reel keeps its last complete version (good.mp4), and so
  // does a beat that replays it (B36 replayed B35's placeholder: an empty frame)
  const waiting = (() => { try { return !!(JSON.parse(fs.readFileSync(path.join(p.out, 'cache.json'), 'utf8'))[beatId]?.degraded || []).length; } catch { return false; } })();
  const good = keptVersion(cfg, id, beatId);
  const clip = waiting && good ? good : path.join(p.out, 'motion', beatId, 'renders', 'motion.mp4');
  { const still = !match && recallStill(cfg, id, path.relative(cfg.sourceRoot, clip), pick.z); if (still) return { asset: still, darken: 0.45, push: 0.06, recall: beatId }; }
  return { video: { path: path.relative(cfg.sourceRoot, clip), in: +(match ? Math.max(pick.a, pick.z - 0.1) : Math.max(pick.a, pick.z - RECALL_SECONDS)).toFixed(2), out: +pick.z.toFixed(2) }, darken: match ? 0.2 : 0.45, push: 0.04, recall: beatId };
}
export function applyRecalls(cfg, id, only = null) {
  const plan = readPlan(cfg, id);
  if (!plan) return [];   // hand-made shots without a plan (the replica project) have no recalls
  const p = projectPaths(cfg, id);
  const changed = [];
  for (const b of plan.beats) {
    if (only && !only.has(b.id)) continue;
    const marks = (b.scenes || []).map((sc, k) => [k, sc.recall]).filter(([, r]) => r);
    const file = path.join(p.shots, `${b.id}.json`);
    if (!marks.length || !fs.existsSync(file)) continue;
    const shot = JSON.parse(fs.readFileSync(file, 'utf8'));
    const before = JSON.stringify(shot);
    const joins = (() => { try { return Object.fromEntries((JSON.parse(fs.readFileSync(path.join(p.root, 'storyboard.json'), 'utf8')).shots || []).map((x) => [x.beat, x.in])); } catch { return {}; } })();
    for (const [k, r] of marks) {
      const fill = recallFill(cfg, id, r, null, { match: k === 0 && joins[b.id] === 'match' && r === plan.beats[plan.beats.findIndex((x) => x.id === b.id) - 1]?.id });
      if (shot.scenes?.[k]) shot.scenes[k].slots = { ...(shot.scenes[k].slots || {}), background: fill };
      if (k === 0) shot.slots = { ...(shot.slots || {}), background: fill };
    }
    if (JSON.stringify(shot) !== before) { fs.writeFileSync(file, JSON.stringify(shot, null, 1) + '\n'); changed.push(b.id); }
  }
  return changed;
}

// For each beat to write that draws a mechanism: the closest earlier mechanism shot of at most 8 beats
// before (already written), so the writer continues that diagram instead of starting another.
const usesMechanism = (b) => [b.route?.recipe, ...(b.scenes || []).map((x) => x.recipe)].includes('mechanism-3d');
export function mechanismsBefore(cfg, id, plan, todo) {
  const p = projectPaths(cfg, id);
  const out = {};
  const writing = new Set(todo.map((b) => b.id));
  for (const b of todo.filter(usesMechanism)) {
    const i = plan.beats.findIndex((x) => x.id === b.id);
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const prev = plan.beats[j];
      const file = path.join(p.shots, `${prev.id}.json`);
      if (writing.has(prev.id) || !fs.existsSync(file)) continue;
      const shot = JSON.parse(fs.readFileSync(file, 'utf8'));
      const spec = [shot.slots, ...(shot.scenes || []).map((x) => x.slots)].map((x) => x?.data?.mechanism).filter(Boolean).at(-1);
      if (spec) { out[b.id] = { from: prev.id, spec }; break; }
    }
  }
  return out;
}

// The author's own read as the presenter (project.presenter.take: "voice" = the recording is a video of
// the author, or a path to a separate camera file that runs in sync with it): every presenter cut plays
// the seconds of that video in which its own words are said, so the lips match the voice.
export function presenterTakeRange(span, cuts, duration, k) {
  const f = (span.end - span.start) / Math.max(0.1, duration);
  const a = cuts?.[k] ?? 0, z = cuts?.[k + 1] ?? duration;
  return { in: +(span.start + a * f).toFixed(3), out: +(span.start + z * f).toFixed(3) };
}
export async function applyPresenterTakes(cfg, id) {
  const project = JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).root, 'project.json'), 'utf8'));
  const take = project.presenter?.take;
  if (!take) return [];
  const { voiceState } = await import('./voice.mjs');
  const v = voiceState(cfg, id);
  if (v.state !== 'current' || !v.timings?.beats) return [];
  const video = take === 'voice' ? v.timings.audio : take;
  const p = projectPaths(cfg, id);
  const changed = [];
  for (const file of fs.readdirSync(p.shots).filter((f) => f.endsWith('.json'))) {
    const shot = JSON.parse(fs.readFileSync(path.join(p.shots, file), 'utf8'));
    const span = v.timings.beats[shot.shotId];
    if (!span || !shot.motion) continue;
    const before = JSON.stringify(shot);
    const scenes = shot.scenes?.length ? shot.scenes : [null];
    scenes.forEach((sc, k) => {
      const card = sc?.recipe || shot.recipe;
      if (!PRESENTER_CARDS.has(card)) return;
      const fill = { video: { path: video, ...presenterTakeRange(span, shot.motion.cuts, shot.motion.duration, k) }, take: true };
      if (sc) sc.slots = { ...(sc.slots || {}), background: fill };
      if (!sc || k === 0) shot.slots = { ...(shot.slots || {}), background: fill };
    });
    if (JSON.stringify(shot) !== before) { fs.writeFileSync(path.join(p.shots, file), JSON.stringify(shot, null, 1) + '\n'); changed.push(shot.shotId); }
  }
  return changed;
}

// Mechanism specs are tidied after writing: chip-like parts (芯片 / 显卡 / GPU / H800 …) are drawn as chips
// and chips are joined by a full bundle of lanes; a shot that continues the previous mechanism shot of the
// same chapter (it carries done steps) keeps that shot's part definitions, so the diagram stays the same.
const CHIPLIKE = /芯片|显卡|GPU|卡|H\d00|A100|算力/;
export function tidyMechanism(spec, prev = null) {
  if (!spec?.parts) return spec;
  const prevParts = Object.fromEntries((prev?.parts || []).map((p) => [p.id, p]));
  // the same box under another id (结果 as "answer" here, "result" before) takes the earlier id
  const alias = {};
  for (const p of spec.parts) {
    if (p.kind === 'link' || prevParts[p.id] || !p.label) continue;
    const q = (prev?.parts || []).find((x) => x.kind === p.kind && x.label === p.label);
    if (q) alias[p.id] = q.id;
  }
  if (Object.keys(alias).length) {
    const re = (x) => alias[x] || x;
    const seen = new Map();
    for (const p of spec.parts.map((p) => ({ ...p, id: re(p.id), ...(p.from ? { from: re(p.from) } : {}), ...(p.to ? { to: re(p.to) } : {}) }))) seen.set(p.id, { ...(seen.get(p.id) || {}), ...p });
    spec = { ...spec, parts: [...seen.values()], steps: (spec.steps || []).map((x) => (x.target ? { ...x, target: re(x.target) } : x)) };
  }
  // and a lane between the same two boxes is the same lane
  const laneAlias = {};
  const lanesBefore = (prev?.parts || []).filter((x) => x.kind === 'link');
  for (const p of spec.parts.filter((x) => x.kind === 'link')) {
    const q = lanesBefore.find((x) => x.from === p.from && x.to === p.to);
    if (q && q.id !== p.id) laneAlias[p.id] = q.id;
  }
  if (Object.keys(laneAlias).length) {
    const seen = new Map();
    for (const p of spec.parts.map((p) => ({ ...p, id: laneAlias[p.id] || p.id }))) seen.set(p.id, { ...(seen.get(p.id) || {}), ...p });
    spec = { ...spec, parts: [...seen.values()], steps: (spec.steps || []).map((x) => (laneAlias[x.target] ? { ...x, target: laneAlias[x.target] } : x)) };
  }
  // a continuation carries done steps, or shares a box with the diagram before it (the same AI node):
  // then that diagram's steps come first, done, so the new shot builds on it instead of starting over
  const shares = spec.parts.some((p) => p.kind !== 'link' && prevParts[p.id]?.kind === p.kind);
  const carries = (spec.steps || []).some((s) => s.done) || shares;
  let steps = spec.steps || [];
  if (carries && !steps.some((s) => s.done) && prev?.steps) steps = [...prev.steps.map((s) => ({ ...s, done: true })), ...steps];
  // the newer shot's definition wins, except where a box stands (it does not jump between shots); what it
  // leaves out (kind, units) comes from the shot before
  let parts = spec.parts.map((p) => {
    const q = prevParts[p.id];
    if (!carries || !q) return { ...p };
    return { ...q, ...p, kind: q.kind === 'chip' ? 'chip' : p.kind, ...(q.pos ? { pos: q.pos } : {}) };
  });
  // boxes of the earlier diagram this shot leaves out stay on it, after its own parts
  if (carries) {
    const have = new Set(parts.map((p) => p.id));
    parts = [...parts, ...(prev?.parts || []).filter((q) => !have.has(q.id)).map((q) => ({ ...q }))];
  }
  // the shot's own new boxes move with the shared box (its layout kept, placed where that box stands), and
  // one that still lands on a carried box moves right to the first free place
  const anchor = carries && spec.parts.find((p) => p.pos && prevParts[p.id]?.pos);
  if (anchor) {
    const [dx, dy] = [prevParts[anchor.id].pos[0] - anchor.pos[0], prevParts[anchor.id].pos[1] - anchor.pos[1]];
    for (const p of parts) if (p.pos && !prevParts[p.id]) p.pos = [p.pos[0] + dx, p.pos[1] + dy];
  }
  const taken = new Set(parts.filter((p) => p.pos && prevParts[p.id]).map((p) => p.pos.join(',')));
  for (const p of parts) if (p.pos && !prevParts[p.id]) { while (taken.has(p.pos.join(','))) p.pos = [p.pos[0] + 1, p.pos[1]]; taken.add(p.pos.join(',')); }
  for (const p of parts) if (p.kind === 'node' && CHIPLIKE.test(p.label || '')) { p.kind = 'chip'; delete p.pos; }
  const kinds = Object.fromEntries(parts.map((p) => [p.id, p.kind]));
  for (const p of parts) if (p.kind === 'link' && kinds[p.from] === 'chip' && kinds[p.to] === 'chip' && !(p.lanes >= 6)) p.lanes = 10;
  // chips are laid out in a row by the diagram; positions only for node layouts
  if (parts.some((p) => p.kind === 'chip')) parts.forEach((p) => delete p.pos);
  return { ...spec, parts, steps };
}

// Tidy every mechanism shot in plan order; a continuation (done steps) takes its parts from the previous
// mechanism shot no more than 8 beats earlier. Writes only shots that change.
export function tidyMechanisms(cfg, id, only = null) {
  const plan = readPlan(cfg, id);
  const p = projectPaths(cfg, id);
  let prev = null, prevAt = -99;
  const changed = [];
  plan.beats.forEach((b, i) => {
    const file = path.join(p.shots, `${b.id}.json`);
    if (!fs.existsSync(file)) return;
    const shot = JSON.parse(fs.readFileSync(file, 'utf8'));
    const before = JSON.stringify(shot);
    for (const slots of [shot.slots, ...(shot.scenes || []).map((x) => x.slots)]) {
      const m = slots?.data?.mechanism;
      if (!m) continue;
      slots.data.mechanism = tidyMechanism(m, i - prevAt <= 8 ? prev : null);
      prev = slots.data.mechanism; prevAt = i;
    }
    if ((!only || only.has(b.id)) && JSON.stringify(shot) !== before) { fs.writeFileSync(file, JSON.stringify(shot, null, 1) + '\n'); changed.push(b.id); }
  });
  return changed;
}

// Every cut of a shot is checked (a montage's later cuts too); a shot file is written only when the
// result changes. Numbers traced to an archived page are listed in shot.factSources (URL + capture time).
export async function recheckFacts(cfg, id) {
  const plan = readPlan(cfg, id);
  const project = JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).root, 'project.json'), 'utf8'));
  const beats = Object.fromEntries(plan.beats.map((b) => [b.id, applyGlossary(b.text, project.glossary)]));
  const p = projectPaths(cfg, id);
  const { sourceTextsFor } = await import('./materials.mjs');
  const flagged = [];
  for (const shot of loadShots(cfg, id)) {
    if (!beats[shot.shotId]) continue;
    const before = JSON.stringify(shot);
    const slots = shot.scenes?.length ? { scenes: shot.scenes.map((sc) => sc.slots || {}), first: shot.slots } : shot.slots;
    const { unsourced, sources } = factTrace(slots, beats[shot.shotId], sourceTextsFor(cfg, id, shot.shotId), { articleText: Object.values(beats).join('\n') });
    if (unsourced.length) { shot.factCheck = `原文和存档来源里都找不到这些数字：${unsourced.join('、')}`; flagged.push(`${shot.shotId}: ${unsourced.join(',')}`); } else delete shot.factCheck;
    if (sources.length) shot.factSources = sources; else delete shot.factSources;
    if (JSON.stringify(shot) !== before) fs.writeFileSync(path.join(p.shots, `${shot.shotId}.json`), JSON.stringify(shot, null, 1) + '\n');
  }
  return flagged;
}
