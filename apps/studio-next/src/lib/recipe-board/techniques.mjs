// What the line has learned, kept so the next film starts from it (user, 2026-10-22: 我需要是给系统学习这些 明白吗 之后都能
// 很好的应对制作 不是为了改细节). Three stores, all rebuilt from the work itself:
//   techniques  every sub-shot a reference was taken apart into (breakdown cards), with how the reference did it (device,
//               ground, layers, type, motion, measures) and how the line realized it (module and its options, the
//               review's verdict, the plan's answers); looked up for a new sub-shot by picture (OpenCLIP vectors of
//               the reference frames, likeness.py --embed) and by device, so the director starts from the nearest
//               ones done before instead of from nothing
//   lessons     the user's corrections as rules (routing/lessons.json): when it applies, what to do, the check that
//               enforces it; handed to the director with the sub-shots they apply to (lessonsFor)
//   gaps        what the line could not do yet, from the plans' answers ("differ" for want of a module), counted across
//               films: what to build next
// Structure is learned from the references; the look is the film's style (routing/styles.json), so a technique carries
// its structure and not its colours.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
// Only real paths inside the configured repository may be read or advertised.
const safePath = (root, file) => { try { const base = fs.realpathSync(root), real = fs.realpathSync(file), rel = path.relative(base, real); return rel && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel) ? real : null; } catch { return null; } };
const libDir = (cfg) => path.join(cfg.dataDir, 'style-lab', 'techniques');
const PY = (cfg) => process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');

// the ground of a sub-shot from its reading (pure, tested): what lies at the bottom of the picture
export function groundOf(read = {}) {
  const g = String(read.layers || '').split(/[；;]/)[0] + ' ' + (read.shows || '');
  // (the device first: a presenter shot read 讲者实拍 was taken for footage, a chart's 纸面拼贴 for a designed scene)
  if (['market', 'chart', 'table'].includes(read.device) || /股价榜|K线|K 线|行情|数据画面/.test(g)) return 'data';
  if (['presenter', 'side-card'].includes(read.device) || /^底：讲者/.test(g)) return 'presenter';
  if (/设计的说明卡|说明卡|幻灯|slide/i.test(g)) return 'designed-card';
  if (/设计的静物|静物|场景.*(道具|放大镜|图标)|拼贴/.test(g)) return 'designed-scene';
  if (/截图|网页|报道|页面/.test(g)) return 'capture';
  if (/视频|实拍|footage/i.test(g) || read.material === 'footage') return 'footage';
  if (/照片|人像|portrait/i.test(g) || ['photo', 'portrait'].includes(read.material)) return 'photo';
  if (/纸|paper/i.test(g)) return 'paper';
  return 'other';
}
// the options of a spec that make its technique (not its words, sources or times)
const KEEP = ['module', 'mode', 'style', 'shape', 'side', 'big', 'brush', 'layout', 'kind', 'out', 'flow', 'stack', 'size', 'texture'];
export function recipeOf(spec = {}) {
  const r = {};
  for (const k of KEEP) if (spec[k] != null) r[k] = spec[k];
  if (spec.bg != null) r.bg = typeof spec.bg === 'string' ? 'material' : spec.bg.art ? 'painted' : 'other';
  if (spec.card) r.card = { mark: !!spec.card.mark, lines: (spec.card.lines || []).length };
  if (spec.tiles) r.tiles = spec.tiles.n;
  if (spec.focus) r.focus = true;
  if (spec.then) r.then = true;
  if ((spec.camera || []).length) r.camera = spec.camera.map((m) => ({ dur: +(m.end - m.at).toFixed(2), zoom: [m.from?.zoom, m.to?.zoom], x: [m.from?.x || 0, m.to?.x || 0], y: [m.from?.y || 0, m.to?.y || 0], ease: m.ease || 'inout' }));
  if (spec.beats) r.beats = spec.beats.map((b) => b.do).join(' ');
  return r;
}

// the library from every card of every project (each sub-shot with its realization when the plan and review exist)
export function buildTechniques(cfg) {
  const out = [], root = path.join(cfg.dataDir, 'projects');
  for (const id of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const pd = path.join(root, id, 'out', 'passages');
    for (const seg of fs.existsSync(pd) ? fs.readdirSync(pd) : []) {
      const card = readJson(path.join(pd, seg, 'breakdown', 'card.json')); if (!card?.subs) continue;
      const plan = readJson(path.join(root, id, 'tasks', `shotplan-${seg}.answer.json`), {}), reviews = readJson(path.join(pd, seg, 'reviews.json'), {});
      const shows = readJson(path.join(pd, seg, 'breakdown', 'shows.json'), {})?.scores || {};
      card.subs.forEach((r, i) => {
        const mid = (r.at + r.end) / 2, sh = (plan.shots || []).find((s) => mid >= s.at - .01 && mid < s.end);
        let spec = null; try { spec = sh ? JSON.parse(sh.spec) : null; } catch { /* */ }
        const verdict = sh ? Object.values(reviews).filter((v) => v.shot === sh.id).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]?.verdict || null : null;
        const follows = (plan.follows || []).filter((f) => f.item.startsWith(`${r.id}.`)).map((f) => ({ item: f.item.split('.')[1], does: f.does, how: f.how }));
        out.push({ key: `${id}/${seg}/${r.id}`, project: id, seg, id: r.id, dur: +(r.end - r.at).toFixed(2), device: r.read?.device || null, material: r.read?.material || null, ground: groundOf(r.read),
          read: r.read ? { shows: r.read.shows, layers: r.read.layers, type: r.read.type, motion: r.read.motion, transition: r.read.transition, texture: r.read.texture } : null,
          measured: { camera: r.camera, base: r.look?.base, lum: r.look?.lum, grain: r.look?.grain },
          frame: path.relative(cfg.sourceRoot, path.join(pd, seg, 'breakdown', 'ref-frames', `${String(i).padStart(2, '0')}-1.jpg`)),
          ours: sh ? { shot: sh.id, module: sh.module, recipe: recipeOf(spec || {}), verdict, why: sh.why, shows: shows[r.id]?.b?.[1] || null } : null, follows });
      });
    }
  }
  return out;
}
// the vectors of the library's frames, computed once each (cached by key and frame bytes)
export function embedTechniques(cfg, lib) {
  const f = path.join(libDir(cfg), 'embeddings.json'), have = readJson(f, {});
  const sig = (t) => { const p = path.join(cfg.sourceRoot, t.frame); return fs.existsSync(p) ? crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 12) : null; };
  const todo = lib.filter((t) => sig(t) && have[t.key]?.sig !== sig(t));
  if (todo.length) {
    const inF = path.join(libDir(cfg), 'embed-in.json'), outF = path.join(libDir(cfg), 'embed-out.json');
    fs.mkdirSync(libDir(cfg), { recursive: true }); fs.writeFileSync(inF, JSON.stringify(todo.map((t) => ({ id: t.key, image: path.join(cfg.sourceRoot, t.frame) }))));
    spawnSync(PY(cfg), [path.join(HERE, 'likeness.py'), '--embed', inF, outF], { encoding: 'utf8', timeout: 900000, env: { ...process.env, A1_OPENCLIP_CACHE: path.join(cfg.sourceRoot, '.codex-artifacts/runtime/openclip') } });
    const got = readJson(outF, {});
    for (const t of todo) if (got[t.key]) have[t.key] = { sig: sig(t), v: got[t.key] };
    fs.writeFileSync(f, JSON.stringify(have)); fs.rmSync(inF, { force: true }); fs.rmSync(outF, { force: true });
  }
  return Object.fromEntries(Object.entries(have).map(([k, x]) => [k, x.v]));
}
export function saveTechniques(cfg) {
  const lib = buildTechniques(cfg); fs.mkdirSync(libDir(cfg), { recursive: true });
  fs.writeFileSync(path.join(libDir(cfg), 'library.json'), JSON.stringify(lib, null, 1) + '\n');
  fs.writeFileSync(path.join(libDir(cfg), 'gaps.json'), JSON.stringify(gapsOf(lib), null, 1) + '\n');
  return lib;
}

// the nearest techniques done before (pure, tested): by picture, the same device and ground counting for more; a
// realization the review passed first; never the sub-shot itself or its own passage
const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export function nearest(lib, vecs, q, { k = 3, exclude = null } = {}) {
  return lib.filter((t) => t.ours && (!exclude || !t.key.startsWith(exclude)))
    .map((t) => ({ t, s: (q.v && vecs[t.key] ? cos(q.v, vecs[t.key]) : 0) + (q.device && t.device === q.device ? .15 : 0) + (q.ground && t.ground === q.ground ? .1 : 0) + (t.ours.verdict === 'pass' ? .05 : 0) }))
    .sort((a, b) => b.s - a.s).slice(0, k).map(({ t, s }) => ({ key: t.key, score: +s.toFixed(3), device: t.device, ground: t.ground, shows: t.read?.shows, layers: t.read?.layers, motion: t.read?.motion, module: t.ours.module, recipe: t.ours.recipe, verdict: t.ours.verdict, differs: t.follows.filter((f) => f.does === 'differ').map((f) => `${f.item}: ${f.how}`) }));
}

// what could not be done (pure, tested): a plan's "differ" that names a missing ability, grouped by the kind of thing
// (module / material / time) and counted over films
const WANT = /模块|做不出|做不到|还没有|没有.*(样式|模块|功能)|不支持|待补|待做|缺/;
export function gapsOf(lib) {
  const g = new Map();
  for (const t of lib) for (const f of t.follows) if (f.does === 'differ' && WANT.test(f.how || '')) {
    const k = `${t.device || '?'} · ${f.item}`; const x = g.get(k) || { what: k, count: 0, examples: [] };
    x.count++; if (x.examples.length < 4) x.examples.push({ key: t.key, how: f.how }); g.set(k, x);
  }
  return [...g.values()].sort((a, b) => b.count - a.count);
}

// the lessons that apply to a sub-shot (pure, tested): by device, ground or words of its reading
export function lessonsFor(lessons, sub) {
  const words = [sub.read?.shows, sub.read?.layers, sub.read?.type].join(' ');
  return lessons.filter((l) => (l.when.devices || []).includes(sub.read?.device) || (l.when.grounds || []).includes(groundOf(sub.read)) || (l.when.words && new RegExp(l.when.words).test(words)) || l.when.always || l.when.cards);   // (cards: the card line's own lessons, every sub-shot of a card plan)
}
// (a lesson a later decision replaced, supersededBy, is history: never handed to the director)
export const readLessons = (cfg) => readJson(path.join(cfg.dataDir, 'routing', 'lessons.json'), { lessons: [] }).lessons.filter((l) => !l.supersededBy);

// what the director gets with a card: per sub-shot the nearest techniques and the lessons that apply
export function guidanceFor(cfg, card, { project, seg, k = 3 } = {}) {
  const lib = saveTechniques(cfg), vecs = embedTechniques(cfg, lib), lessons = readLessons(cfg);
  const self = buildTechniques(cfg).filter((t) => t.project === project && t.seg === seg), own = Object.fromEntries(self.map((t) => [t.id, vecs[t.key]]));
  // (the lessons that apply everywhere once, at the top; per sub-shot only its own: the same eight repeated on every
  // sub-shot buried the ones that mattered)
  const always = lessons.filter((l) => l.when.always), own_ = lessons.filter((l) => !l.when.always);
  return { lessons: always.map((l) => `${l.id}: ${l.do}`), subs: card.subs.map((r) => ({ id: r.id, nearest: nearest(lib, vecs, { v: own[r.id], device: r.read?.device, ground: groundOf(r.read) }, { k, exclude: `${project}/${seg}/` }), lessons: lessonsFor(own_, r).map((l) => `${l.id}: ${l.do}`) })) };
}

// Chapter beats done before, as techniques (the user 2026-10-27: 按你推荐的都优化好 — the library held the card line's
// sub-shots only, and a chapter's director got neither it nor the lessons, so a chapter repeated what an earlier one had
// already been marked down for). Each beat of every chapter written: the devices its plan names, how it answered the
// reference (plan2 follows), its form, its blind review's score and note, our keyframe.
// (pure, tested) a module's plan2 beats read from its code: devices, form, follows' hows
export function planBeatsOf(code) {
  const out = {}, src = String(code || ''), i = src.indexOf('plan2'); if (i < 0) return out;
  // Read balanced object bodies without executing authored modules. Strings/comments may contain braces.
  const body = (start) => {
    let depth = 0, quote = null, comment = null;
    for (let j = start; j < src.length; j++) {
      const c = src[j], n = src[j + 1];
      if (comment === 'line') { if (c === '\n') comment = null; continue; }
      if (comment === 'block') { if (c === '*' && n === '/') { comment = null; j++; } continue; }
      if (quote) { if (c === '\\') j++; else if (c === quote) quote = null; continue; }
      if (c === '/' && n === '/') { comment = 'line'; j++; continue; }
      if (c === '/' && n === '*') { comment = 'block'; j++; continue; }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      if (c === '}' && --depth === 0) return src.slice(start + 1, j);
    }
    return '';
  };
  const start = src.indexOf('{', i), plan = body(start);
  for (const m of plan.matchAll(/\b(B\d+)\s*:\s*\{/g)) {
    const line = body(start + 1 + m.index + m[0].lastIndexOf('{')), dev = line.match(/devices\s*:\s*\[([^\]]*)\]/)?.[1] || '';
    const dec = [...(line.match(/declined\s*:\s*\[([\s\S]*?)\]\s*(?:[,}]|$)/)?.[1] || '').matchAll(/device\s*:\s*['"]([a-z0-9-]+)['"]\s*,\s*why\s*:\s*'([^']*)'/g)].map((x) => ({ device: x[1], why: x[2] }));
    out[m[1]] ||= { devices: [...dev.matchAll(/['"]([a-z0-9-]+)['"]/g)].map((x) => x[1]), ...(dec.length ? { declined: dec } : {}), form: line.match(/\bform\s*:\s*['"]([a-z0-9.-]+)['"]/)?.[1] || null,
      how: [...line.matchAll(/how\s*:\s*'([^']*)'/g)].map((x) => x[1]).join('；').slice(0, 300) || line.match(/carryOver\s*:\s*'([^']*)'/)?.[1] || '' };
  }
  return out;
}
// Read the original research indices only; neither the clips nor the video are opened.
export function hupoIndexTechniques(cfg) {
  const root = cfg.sourceRoot || cfg.repoRoot || process.cwd();
  const csvPath = 'work/bv1a63d6ceba-packaging-study-20260923/clip-index.csv';
  const framePath = 'work/hupo-69-shot-reconstruction-v1/source-reference-frames-v1/69-shot-hold-contact-v2.json';
  let lines; try { const file = safePath(root, path.join(root, csvPath)); if (!file) return []; lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/); } catch { return []; }
  const frameFile = safePath(root, path.join(root, framePath));
  const frames = frameFile ? readJson(frameFile, {}) : {};
  const parse = line => [...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)].map(m => (m[1] ?? m[2]).replaceAll('""','"'));
  const header = parse(lines.shift());
  const seconds = s => { const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(s || ''); return m ? Number(m[1])*60+Number(m[2]) : null; };
  return lines.map(line => {
    const row = Object.fromEntries(parse(line).map((v,i)=>[header[i],v]));
    const kinds = [];
    if (/证据|引用/.test(row.category || '')) kinds.push('evidence');
    if (/原理图/.test(row.category || '') && /与|对比|比较|优化/.test(row.title || '')) kinds.push('compare');
    if (/原理图/.test(row.category || '') && /节点|流程|步骤|过程/.test(row.title || '')) kinds.push('process');
    if (!kinds.length || !row.id) return null;
    const f = (frames.frames || []).find(x=>x.shotId === row.id) || null;
    const start = seconds(row.start), end = seconds(row.end), t = f?.sourceTimeSeconds;
    const timeStatus = !f || start == null || end == null || !Number.isFinite(t) ? 'unknown' : t < start || t >= end ? 'conflict' : 'within-indexed-clip';
    return { key:`hupo-69/index/${row.id}`, project:'hupo-69', beat:row.id, shotId:row.id, devices:[], form:null, how:row.title, referenceKinds:kinds,
      source:csvPath, frame:null, frameIdentity:'unknown', frameStatus:'unknown', module:null, adapter:'hupo-original-index',
      semantic:{category:row.category,title:row.title}, clip:{start:row.start,end:row.end,file:row.file,decode:row.decode},
      indexedFrame:f, frameIndexSource:frameFile ? framePath : null, timeStatus,
      acceptance:{scope:'Historical research only; copyright unknown; no current approval or frame identity verification.',currentApproval:false,hashBinding:'unknown'} };
  }).filter(Boolean);
}
export function chapterTechniques(cfg) {
  const out = [], root = path.join(cfg.dataDir, 'projects'), sourceRoot = cfg.sourceRoot || cfg.repoRoot || process.cwd();
  const list = (dir) => { const p = dir === root ? (safePath(cfg.repoRoot || sourceRoot, dir) || safePath(sourceRoot, dir)) : safePath(sourceRoot, dir); return p ? fs.readdirSync(p).sort() : []; };
  // Resolve symlinks so isolated task generation still points at the actual read-only reference.
  const rel = (file) => { const p = file && safePath(sourceRoot, file); return p ? path.relative(fs.realpathSync(sourceRoot), p) : null; };
  const read = (file, fallback = null) => { const p = safePath(sourceRoot, file); return p ? readJson(p, fallback) : fallback; };
  const status = (check) => check?.ok === true ? 'historical-pass' : check?.ok === false ? 'failed' : 'unreviewed';
  for (const id of list(root)) {
    const pr = path.join(root, id), td = path.join(pr, 'tasks'), modules = path.join(pr, 'chapters');
    const groups = new Set([...list(td).filter(x => /^morph-[A-Z0-9]+\.answer\.json$/.test(x)).map(x => x.slice(6, -12)), ...list(modules).filter(x => /^[A-Z0-9]+\.mjs$/.test(x)).map(x => x.slice(0,-4))]);
    for (const G of groups) {
      const answerFile = path.join(td, `morph-${G}.answer.json`), moduleFile = path.join(modules, `${G}.mjs`);
      const ans = read(answerFile), modulePath = safePath(sourceRoot, moduleFile), code = ans?.code || (modulePath ? fs.readFileSync(modulePath, 'utf8') : '');
      const beats = planBeatsOf(code), checkFile = path.join(td, `morph-${G}.check.json`), check = read(checkFile);
      const reviewFile = path.join(td, `morph-${G}-review.answer.json`), review = read(reviewFile);
      const rev = Object.fromEntries((review?.frames || []).map(x => [x.beat,x]));
      const kdir = path.join(pr, 'out', 'chapters', G), keys = list(kdir).filter(x => /^key-\d+-B\d+\.png$/.test(x));
      // Older modules have no plan2; existing keyframes are explicit beat identity, not invented devices.
      for (const key of keys) beats[key.match(/-(B\d+)\.png$/)[1]] ||= {devices:[],form:null,how:''};
      for (const [b,p] of Object.entries(beats)) {
        const k = keys.find(x => x.endsWith(`-${b}.png`));
        out.push({key:`${id}/${G}/${b}`,project:id,chapter:G,beat:b,kind:'chapter',devices:p.devices,form:p.form,how:p.how,
          source:rel(ans?.code ? answerFile : moduleFile), module:rel(moduleFile), adapter:ans?.code ? 'morph-answer' : 'chapter-module',
          score:rev[b]?.score ?? null,note:rev[b]?.issue ? String(rev[b].issue).slice(0,240) : null,frame:rel(k && path.join(kdir,k)),
          acceptance:{check:status(check),checkFile:rel(checkFile),review:rev[b] ? 'recorded' : 'unreviewed',reviewFile:rel(reviewFile),scope:'Historical record only; not current approval or source/frame hash verification.'}});
      }
    }
    // Card-line shot adapter: only an existing authored shot + rendered source enters the library.
    // A recipe is context, not a kit device. Empty review.json never becomes an approval.
    for (const file of list(path.join(pr,'shots')).filter(x=>x.endsWith('.json'))) {
      const shotFile = path.join(pr,'shots',file), shot = read(shotFile), b = shot?.shotId;
      if (!b || !shot.recipe) continue;
      const dir = path.join(pr,'out','motion',b), source = path.join(dir,'index.html');
      if (!safePath(sourceRoot, source)) continue;
      const refs = Object.values(shot.slots || {}).flatMap(s=>s?.art?.refs || []);
      const frame = [path.join(dir,'renders','vs-strip.jpg'),...refs.map(f=>path.resolve(sourceRoot,f))].find(f=>safePath(sourceRoot,f));
      const verdict = read(path.join(pr,'review.json'))?.verdicts?.[b];
      out.push({key:`${id}/shot/${b}`,project:id,chapter:null,beat:b,kind:'shot',adapter:'rendered-shot',devices:[],form:shot.recipe,how:shot.note || '',
        referenceKinds:shot.recipe==='stat-sheet' ? ['numbers','evidence'] : [],source:rel(source),module:null,shot:rel(shotFile),frame:rel(frame),frameRole:frame?.endsWith('vs-strip.jpg') ? 'comparison-strip' : 'source-reference',
        score:null,note:null,acceptance:{check:'unreviewed',review:verdict ? 'recorded' : 'unreviewed',reviewFile:rel(path.join(pr,'review.json')),scope:'Research/rendered shot; no chapter acceptance inferred.'}});
    }
  }
  return out.concat(hupoIndexTechniques(cfg));
}
// (pure, tested) per beat of a new chapter: the nearest chapter beats done before (by the devices it calls for, the
// reviewed best first; never its own film) and the lessons that apply to it; the always-lessons once at the top
export function chapterGuidanceOf(lib, lessons, beats, { project = null, k = 3 } = {}) {
  const always = lessons.filter((l) => l.when?.always), own = lessons.filter((l) => !l.when?.always);
  return { lessons: always.map((l) => `${l.id}: ${l.do}`), beats: beats.map((b) => {
    const want = new Set(b.devices || []);
    const match = (t) => (t.module && (b.gold || []).filter(Boolean).includes(t.module)) || (b.kind && t.referenceKinds?.includes(b.kind)) || (b.composition && b.composition === t.form);
    const near = lib.filter((t) => t.project !== project && (t.devices.some((d) => want.has(d)) || match(t)))
      .map((t) => ({ t, s: t.devices.filter((d) => want.has(d)).length + (match(t) ? 1 : 0) + (t.adapter === 'hupo-original-index' && b.text && String(b.text).includes(t.how) ? 2 : 0) + (t.score >= 4 ? 1 : t.score != null && t.score < 3 ? -1 : 0) }))
      .sort((x, y) => y.s - x.s || (y.t.score ?? 0) - (x.t.score ?? 0)).slice(0, k)
      .map(({ t }) => ({ key: t.key, devices: t.devices, form: t.form, how: t.how, score: t.score, ...(t.score != null && t.score < 4 && t.note ? { markedDown: t.note } : {}), frame: t.frame, source: t.source, module: t.module, adapter: t.adapter, frameRole: t.frameRole, acceptance: t.acceptance, ...(t.adapter === 'hupo-original-index' ? {project:t.project, beat:t.beat, shotId:t.shotId, semantic:t.semantic, clip:t.clip, indexedFrame:t.indexedFrame, frameIndexSource:t.frameIndexSource, timeStatus:t.timeStatus, frameIdentity:t.frameIdentity, frameStatus:t.frameStatus} : {}) }));
    const ls = own.filter((l) => (l.when.devices || []).some((d) => want.has(d)) || (l.when.words && new RegExp(l.when.words).test(String(b.text || ''))));
    return { beat: b.beat, nearest: near, lessons: ls.map((l) => `${l.id}: ${l.do}`) };
  }).filter((x) => x.nearest.length || x.lessons.length) };
}
// Historical examples are evidence-bearing guidance, never gate state or an approval transfer.
export function recoveredDirectorGuidance(cfg, beats) {
  const data = readJson(path.join(cfg.dataDir, 'routing', 'taste-inventory.json'), {}).recoveredDirectorGuidance;
  if (!data) return null;
  const root = cfg.sourceRoot || cfg.repoRoot || process.cwd();
  const resource = f => { const p = f && safePath(root, path.resolve(root, f)); return p ? path.relative(fs.realpathSync(root), p) : null; };
  return { authority: data.authority, classification: data.classification, workflow: data.workflow,
    beats: beats.map(b => ({ beat: b.beat, references: data.examples.filter(e => {
      if (e.decision?.role !== 'human' || !e.decision?.locator || e.classification !== 'project-only') return false;
      const w = e.when || {};
      return (w.kinds || []).includes(b.kind) || (w.gold || []).some(f => (b.gold || []).includes(f)) || (w.words && new RegExp(w.words, 'i').test(String(b.text || '')));
    }).map(e => ({ ...e, frame: resource(e.frame), frameStatus: resource(e.frame) ? 'available' : 'unknown',
      source: resource(e.source), sourceStatus: resource(e.source) ? 'available' : 'unknown',
      acceptance: { ...e.acceptance, currentApproval: false, hashBinding: 'unknown' } })) })) };
}
// Shared clause-local polarity for reference retrieval; a denial must not erase
// an affirmative relation in another clause or another storyboard field.
export const positiveReferenceCue = (text, re, neg) => String(text || '').split(/[,，。；;.!！?？\n]|(?:但是|但|然而|\bbut\b)/i).some(c => re.test(c) && !neg.test(c));
export const chapterGuidance = (cfg, id, beats, o = {}) => {
  const guidance = chapterGuidanceOf(o.library || cfg.referenceLibrary || chapterTechniques(cfg), readLessons(cfg), beats, { ...o, project: id, k: Number.MAX_SAFE_INTEGER });
  const examples = readJson(path.join(cfg.dataDir, 'routing', 'exemplars.json'), {}).chapterReferences || [];
  const root = cfg.sourceRoot || cfg.repoRoot || process.cwd();
  for (const beat of beats) {
    // An explicit non-evidence route wins over narration keywords. Unrouted prose is
    // deliberately conservative: a word is not an instruction to cite evidence.
    const positive = (re, neg) => positiveReferenceCue(beat.text, re, neg);
    const evidence = positive(/证据|證據|报道|報道|(?<![a-z0-9_])(?:evidence|report(?:s|ed)?)(?![a-z0-9_])/i, /(?:不是|不要(?:使用|用)?|无需|無需|没有|沒有|缺乏|无|無|不使用)(?:任何|可靠的?)?(?:证据|證據|报道|報道)|(?:证据|證據)(?:不足|缺乏)|\b(?:no|without|lack(?:s|ing)?(?: of)?)\s+(?:any\s+|reliable\s+)*(?:evidence|reports?)\b|\bevidence(?:\s*-\s*free|\s+(?:is\s+)?(?:insufficient|lacking|absent))\b/i);
    const map = positive(/地图|地圖|(?<![a-z0-9_])map(?![a-z0-9_])/i, /(?:不是|不要(?:使用|用)?|不需要|禁止(?:使用|用)?|无需|無需|没有|沒有|无|無|不使用)(?:任何)?(?:地图|地圖)|\b(?:no|without)\s+(?:any\s+)?map\b/i);
    const inferred = map ? 'map' : evidence ? 'evidence' : null;
    const kind = beat.routeResolved ? beat.kind : beat.kind || (beat.composition ? (beat.composition === 'evidence-card' ? 'evidence' : ['map-table', 'globe-route'].includes(beat.composition) ? 'map' : null) : inferred);
    // Exemplars/v1 has no rights/language schema. Recognize only explicit denials;
    // everything else remains unknown, not a rights clearance or language approval.
    const candidates = examples.filter(e => e.project !== id && e.kinds?.includes(kind) && !/^restricted$/i.test(String(e.rights?.status ?? e.rights ?? '')) && !/^incompatible$/i.test(String(e.language?.status ?? e.language ?? '')));
    if (!candidates.length) continue;
    let row = guidance.beats.find(x => x.beat === beat.beat);
    if (!row) { row = { beat: beat.beat, nearest: [], lessons: [] }; guidance.beats.push(row); }
    for (const e of candidates) {
      const resource = f => { const p = f && safePath(root, path.resolve(root, f)); return p ? path.relative(fs.realpathSync(root), p) : null; };
      const frame = resource(e.frame), source = resource(e.source), shot = resource(e.shot);
      const exemplar = { key:e.id, project:e.project, beat:e.beat || e.id.split('/').at(-1), devices:[], form:null, how:e.mechanism, frame, frameStatus:frame ? 'available' : 'unknown', source, sourceStatus:source ? 'available' : 'unknown', ...(e.shot ? {shot, shotStatus:shot ? 'available' : 'unknown'} : {}), module:source, adapter:'historical-exemplar', rightsStatus:'unknown', languageStatus:'unknown', acceptance:{scope:e.scope,currentApproval:false,hashBinding:'unknown'}, usage:'Method reference only; choose or decline with reasons in the existing answer. Do not copy historical styling or photos as current defaults.' };
      const index = row.nearest.findIndex(x => x.key === e.id || (source && (x.module === source || x.source === source) && (x.beat || x.key.split('/').at(-1)) === exemplar.beat));
      if (index >= 0) { const old = row.nearest[index]; row.nearest[index] = {...old, ...exemplar, frame:exemplar.frame || old.frame, frameStatus:(exemplar.frame || old.frame) ? 'available' : 'unknown', acceptance:old.acceptance?.check === 'historical-pass' ? old.acceptance : exemplar.acceptance}; } else row.nearest.push(exemplar);
    }
  }
  const limit = Number.isFinite(o.k) ? Math.max(0, Math.floor(o.k)) : 3;
  for (const row of guidance.beats) {
    const seenKeys = new Set();
    row.nearest = row.nearest.filter(x => {
      const parts = x.key.split('/'), beat = x.beat || parts.at(-1);
      const identity = x.source || x.module ? `${x.module || x.source}\0${beat}` : `key\0${x.key}`;
      if (seenKeys.has(identity)) return false;
      seenKeys.add(identity); return true;
    });
    // Diversity is a tie-break within relevant eligible candidates, not a reason to
    // invent relevance or override a single-result request.
    if (limit > 1 && row.nearest.length > 1) {
      const first = row.nearest[0], project = first.project || first.key.split('/')[0];
      const other = row.nearest.findIndex(x => (x.project || x.key.split('/')[0]) !== project);
      if (other >= limit) row.nearest.splice(1, 0, ...row.nearest.splice(other, 1));
    }
    row.nearest = row.nearest.slice(0, limit).map(x => ({...x, pathBase:'repo-root', rightsStatus:'unknown', languageStatus:'unknown', usage:'Research method only; rights and language unknown, not rights clearance or current approval.'}));
  }
  return { ...guidance, recovered: recoveredDirectorGuidance(cfg, beats) };
};
