// Storyboard: one designed shot per beat, written after the brief. For every beat: card (from the routed
// candidates), one hero action and at most two secondary actions (routing/actions-v1.json), camera
// (CAMERA.md), in/out transition, length, and its place in the brief (chapter, hero moment, motif state,
// callback, breathing, medium). Agent task (prompts/storyboard.md + routing/storyboard.schema.json);
// this module builds the task, checks answers, accepts them into storyboard.json and applies them to the
// plan and the shot files (card, length, motion cues, camera), idempotently.
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths, loadProject, readPlan, writePlan, loadShots, loadRecipe, projectTheme } from './store.mjs';
import { referenceBeats, emptyShotErrors, referenceTiming, referenceCutAt } from './reference.mjs';
import { agentFor, readAnswer, readTask, runCodexTask, sha, taskPaths, writeAnswer, writeCheck, writeTask } from './agenttask.mjs';
import { planHash } from './brief.mjs';
import { spokenSeconds, voiceState } from './voice.mjs';
import { HERO_TEMPLATES } from './stage.mjs';
import { breakdownFor, deviceCues, loadDevices } from './refbreakdown.mjs';
import { sixStage } from './gatestate.mjs';

const STEP = 'storyboard';
const RULES = 'work/recipe-board-v1/prompts/storyboard.md';
const SCHEMA = 'work/recipe-board-v1/routing/storyboard.schema.json';
// a six-stage film's storyboard names each beat's act and its devices first (the user 2026-10-26: 导演有根据文案拆分好语义
// 最好 想好怎么设计吗 … 先规范 梳理最优方式执行): its own rules file and schema, so the films before keep their input as it was
export const SEMANTIC_RULES = 'work/recipe-board-v1/prompts/storyboard-semantic.md', SCHEMA_V3 = 'work/recipe-board-v1/routing/storyboard.v3.schema.json', ACTS = 'work/recipe-board-v1/routing/semantic-acts.json';
const isSix = (cfg, id) => { try { return !!id && sixStage(loadProject(cfg, id)); } catch { return false; } };
export const loadActs = (cfg) => readJson(path.join(cfg.dataDir, 'routing', 'semantic-acts.json'))?.acts || [];
export const OPEN_CARDS = ['presenter-plain', 'footage-plate', 'title-hero-over-photo', 'screen-full'];   // any beat may use these (screen-full: reading a real page)
const BREATH_CARDS = new Set(['presenter-plain', 'footage-plate', 'title-hero-over-photo']);
export const BREATH_HOLD = 3.5, BREATH_CHANGES = ['focus-dim', 'pull-back', 'erase', 'push-in'];   // a breath longer than this changes
export function breathErrors(s) {
  const changes = (s.secondary || []).filter((x) => BREATH_CHANGES.includes(x?.action));
  if (s.hero?.action !== 'hold' || (s.secondary || []).length > changes.length) return [`breathing beat; hero is hold, and the only secondary action is one that changes what is there (${BREATH_CHANGES.join(' / ')})`];
  // a change about every BREATH_HOLD s (review 2026-10-22: one change in B09's 6.4 s and B45's 7.6 s still read as frozen)
  const most = Math.ceil(s.seconds / BREATH_HOLD);
  if (s.seconds > BREATH_HOLD && (changes.length < 1 || changes.length > most)) return [`a ${s.seconds}s breathing beat; past ${BREATH_HOLD}s the picture changes, about once every ${BREATH_HOLD}s (1-${most} here): a secondary ${BREATH_CHANGES.join(' / ')} (no new information, the same picture dimmed, pulled back or wiped)`];
  return [];
}
// cards with no real picture (no presenter, portrait, footage or photo): three in a row is a wall of text
const TEXT_CARDS = new Set(['article-highlight-light', 'article-highlight-dark', 'concept-flow', 'concept-steps-hero', 'concept-trials', 'card-stack', 'data-table-grid', 'data-table-dark', 'market-table']);
// charts and tables can only show numbers the text gives: a chart with one number is not a comparison
const NUMBER_CARDS = { 'data-bar-chart': 2, 'data-hbar-ranking': 3, 'data-table-grid': 2, 'data-table-dark': 2, 'market-table': 2, 'stat-sheet': 1 };
// Treatment ladder (prompts/visual-director.md): evidence first, metaphor last.
export const TREATMENTS = ['evidence', 'presenter-tags', 'data', 'diagram', 'title', 'presenter', 'metaphor'];
const EVIDENCE_KINDS = ['person', 'org', 'product', 'event', 'place', 'stock', 'software'];
// the form of a real picture decides where it comes from (materials step) and which cards can hold it
export const EVIDENCE_FORMS = ['photo', 'video', 'webpage', 'paper', 'logo', 'chart', 'recording'];
const FORM_CARDS = {
  webpage: ['screen-full', 'stamp-over-evidence', 'presenter-side-card', 'spec-page-card'],   // screen-full = 读报
  paper: ['screen-full', 'stamp-over-evidence', 'presenter-side-card', 'spec-page-card'],
  chart: ['stamp-over-evidence', 'screen-full', 'footage-plate', 'presenter-side-card'],
  recording: ['software-demo-window', 'screen-full'],
  logo: ['stamp-over-evidence', 'presenter-side-card', 'product-side-card'],   // a logo is never stretched into a background
};
// cards with a slot for a real picture (photo, footage, screenshot, logo) that the materials step fills
// morph-chapter: a chapter shows the real pictures confirmed for its beats (chapter.mjs chapterMaterials: images.m_<beat>)
export const EVIDENCE_CARDS = new Set(['morph-chapter', 'footage-plate', 'title-hero-over-photo', 'title-word-broll', 'person-intro', 'person-nameplate', 'quote-portrait-bw', 'quote-stack', 'screen-full', 'software-demo-window', 'stamp-over-evidence', 'presenter-side-card', 'product-side-card', 'spec-page-card']);   // paper-collage-figures is a data card (numbers, no picture)
// cards that are the evidence: without a real picture they are an empty frame
const EVIDENCE_ONLY = new Set(['person-intro', 'person-nameplate', 'quote-portrait-bw', 'screen-full', 'software-demo-window', 'stamp-over-evidence', 'product-side-card', 'spec-page-card']);
const FACT_ENTITIES = new Set(['person', 'org', 'product', 'event', 'place', 'article', 'quote', 'software']);
const NUMBER_RE = /\d+(?:\.\d+)?\s*(?:万亿|亿|万|%|％|张|个|家|年)?|[一二两三四五六七八九十百千万]+(?:万亿|亿)/g;
// Names read from the text itself, not only from the plan's entity guesses: the entity library (entries
// with verified pictures) and a general lexicon (routing/known-names.json).
let NAMES = null;
function nameIndex(cfg) {
  if (NAMES?.dir === cfg.dataDir) return NAMES.list;
  const lib = (readJson(path.join(cfg.dataDir, 'entities.json'), { entities: [] }).entities || []).map((e) => ({ kind: e.kind, names: e.names, library: true }));
  const lex = (readJson(path.join(cfg.dataDir, 'routing', 'known-names.json'), { names: [] }).names || []).map((e) => ({ ...e, library: false }));
  NAMES = { dir: cfg.dataDir, list: [...lib, ...lex] };
  return NAMES.list;
}
const hasName = (text, n) => (/^[A-Za-z0-9 .-]+$/.test(n) ? new RegExp(`(^|[^A-Za-z])${n.replace(/[.]/g, '\\.')}($|[^A-Za-z])`).test(text) : text.includes(n));
export function namesIn(cfg, text) {
  const seen = new Set();
  return nameIndex(cfg).filter((e) => ['person', 'org', 'product', 'place', 'event'].includes(e.kind) && e.names.some((n) => hasName(text, n)))
    .map((e) => ({ kind: e.kind, name: e.names.find((n) => hasName(text, n)), library: e.library })).filter((e) => !seen.has(e.name) && seen.add(e.name));
}
// a beat that names something real (person, company, product, place, event) or gives a number
const factsOf = (b, cfg) => [...new Set([...(b.entities || []).filter((e) => e.needsSource && FACT_ENTITIES.has(e.kind)).map((e) => e.name), ...(cfg ? namesIn(cfg, b.text).map((e) => e.name) : []), ...(b.text.match(NUMBER_RE) || [])])];
const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
const sbFile = (cfg, id) => path.join(projectPaths(cfg, id).root, 'storyboard.json');
const estimateSeconds = (text, rate = 4.5) => Math.max(2.5, Math.round((String(text).replace(/\s/g, '').length / rate) * 10) / 10);

export function loadActions(cfg) { return readJson(path.join(cfg.dataDir, 'routing', 'actions-v1.json')); }
function routingTable(cfg) { return readJson(path.join(cfg.dataDir, 'routing', 'routing-table-v1.json')); }
const briefOf = (cfg, id) => readJson(path.join(projectPaths(cfg, id).root, 'brief.json'));
// The rules are part of the input: when the rules, schema or rhythm targets change, the storyboard is due again.
const rulesHash = (cfg, six = false) => sha([RULES, SCHEMA, 'work/recipe-board-v1/routing/rhythm-by-role.json', ...(six ? [SEMANTIC_RULES, SCHEMA_V3, ACTS] : [])].map((f) => fs.readFileSync(path.join(cfg.repoRoot, f), 'utf8')).join('\n'));
// a recording changes the lengths the storyboard plans, so its alignment is part of the input too
const voiceKey = (cfg, id) => { const v = voiceState(cfg, id); return v.state === 'current' ? v.key : ''; };
// the reference film's beats are input too: a storyboard written before it could see them is asked again
const refKey = (cfg, id) => { const r = id ? referenceBeats(cfg, id) : {}; const k = Object.keys(r).sort(); return k.length ? sha(JSON.stringify(k.map((b) => [b, r[b].text]))) : ''; };
const inputHash = (cfg, plan, brief, vk = '', id = null) => sha(planHash(plan) + (brief?.answerHash || brief?.planHash || '') + rulesHash(cfg, isSix(cfg, id)) + vk + refKey(cfg, id));
export const loadRhythm = (cfg) => readJson(path.join(cfg.dataDir, 'routing', 'rhythm-by-role.json'));

export function candidatesFor(table, intent) { return [...new Set([...(table.intents.find((i) => i.id === intent)?.recipes || []), ...OPEN_CARDS])]; }
// a beat's cards: its intent's, and the continuous diagram when the plan put it on one (a number a chapter arrives
// at, director.mjs assignRecipes); the task offers these and the check accepts them (one list for both)
// a beat beside a chapter beat may go on the chapter whatever its intent (a name, a figure, a real picture shown inside
// the continuous diagram: paperclip-138-full B31's photograph in the line-up of B26-B30, B35's 8000 萬 on B34's timeline)
export const chapterNeighbour = (shots, s) => { const i = shots.indexOf(s); return [shots[i - 1], shots[i + 1]].some((x) => x?.card === 'morph-chapter'); };
export const cardsForBeat = (table, b, intent = b?.intent) => [...new Set([...(b?.route?.recipe === 'morph-chapter' ? ['morph-chapter'] : []), ...candidatesFor(table, intent)])];

export function buildStoryboardInput(cfg, id) {
  const plan = readPlan(cfg, id);
  const brief = briefOf(cfg, id);
  if (!plan || !brief) throw new Error(`${id} needs a plan and an accepted brief first`);
  const project = loadProject(cfg, id);
  const theme = projectTheme(cfg, id);
  const table = routingTable(cfg);
  const spoken = spokenSeconds(cfg, id);
  const cards = {};
  for (const f of fs.readdirSync(path.join(cfg.dataDir, 'recipes')).filter((x) => x.endsWith('.json'))) {
    const r = loadRecipe(cfg, f.slice(0, -5), theme);
    cards[f.slice(0, -5)] = { description: r.description, preset: r.motionPreset };
  }
  return {
    title: plan.title,
    brief,
    // the film's format: with a presenter (the house films) or a voice-over over packaging only (no presenter footage:
    // presenter cards are not available, a run once gave 23 of 55 shots to a presenter who did not exist)
    format: plan.options?.hasPresenter ? 'presenter' : 'voiceover',
    beats: plan.beats.map((b) => ({ id: b.id, intent: b.intent, headline: b.onScreen?.headline || '', text: b.text, facts: factsOf(b, cfg), names: namesIn(cfg, b.text), candidates: cardsForBeat(table, b).filter((c) => plan.options?.hasPresenter || !PRESENTER_CARDS.has(c)), ...(b.route?.recipe === 'morph-chapter' ? { planCard: 'morph-chapter' } : {}), estimateSeconds: spoken?.[b.id] ?? estimateSeconds(b.text, project.speechRate), ...(spoken ? { spoken: true } : {}) })),
    treatments: TREATMENTS,
    evidenceCards: [...EVIDENCE_CARDS],
    evidenceForms: Object.fromEntries(EVIDENCE_FORMS.map((f) => [f, FORM_CARDS[f] || 'any picture card'])),
    rhythm: (({ roles, film, cutLength }) => ({ roles, film, cutLength }))(loadRhythm(cfg)),
    intents: table.intents.map((i) => ({ id: i.id, label: i.label, technique: i.technique, recipes: i.recipes })),
    cards,
    actions: loadActions(cfg),
    rhythmRules: table.rhythmRules,
    cameraRules: 'work/recipe-board-v1/CAMERA.md',
  };
}

// The answer schema is strict (every key required, no free objects), so a shot without a hero says stage3d: null and a
// hero's params come as JSON text; the line works on the object (a params text that is not JSON stays, and is refused)
export function normalizeAnswer(answer) {
  if (!answer || !Array.isArray(answer.shots)) return answer;
  const shots = answer.shots.map((s0) => { let s = s0;
    if (!s) return s;
    if ('diagram' in s && s.diagram == null) { const { diagram, ...rest } = s; s = rest; }
    else if (s.diagram && typeof s.diagram.keys === 'string') { let keys = s.diagram.keys; try { keys = JSON.parse(keys); } catch { /* refused in keysErrors */ } s = { ...s, diagram: { ...s.diagram, keys } }; }
    if (!('stage3d' in s)) return s;
    if (s.stage3d == null) { const { stage3d, ...rest } = s; return rest; }
    let params = s.stage3d.params;
    if (typeof params === 'string') { try { params = JSON.parse(params); } catch { /* refused in heroErrors */ } }
    return { ...s, stage3d: { ...s.stage3d, params } };
  });
  return { ...answer, shots };
}

// A 3D hero names an engine template the line can stage, and every number it shows is a fact with a source
// (the director's check refuses the plate otherwise; caught here, before anything is written)
export function heroErrors(h) {
  if (!h || typeof h !== 'object') return ['hero-3d needs stage3d { template, params, facts }'];
  const out = [];
  if (typeof h.params === 'string') out.push('stage3d.params is not a JSON object');
  if (!HERO_TEMPLATES[h.template]) out.push(`stage3d.template "${h.template}" is not one of ${Object.keys(HERO_TEMPLATES).join(', ')}`);
  const norm = (x) => String(x).replace(/[\s,，]/g, '').replace(/[−–—]/g, '-');
  const facts = (h.facts || []).filter((f) => String(f.text || '').trim() && String(f.source || '').trim());
  if ((h.facts || []).length !== facts.length) out.push('stage3d.facts: every fact needs text and source');
  const shown = [];
  const walk = (v) => { if (v == null) return; if (typeof v === 'object') Object.entries(v).forEach(([k, x]) => k !== 'window' && k !== 'cues' && k !== 'highlight' && k !== 'collapse' && k !== 'spin' && k !== 'start' && k !== 'land' && walk(x)); else shown.push(v); };
  // a Blender plate shows no digits (its params are the scene's set-up: how many in the row, which one is lit); the
  // numbers on a plate are type the line sets, checked there
  if (!String(h.template || '').startsWith('blender:')) walk(h.params || {});
  for (const v of shown) for (const n of norm(v).match(/\d+(?:\.\d+)?/g) || []) if (!facts.some((f) => (norm(f.text).match(/\d+(?:\.\d+)?/g) || []).includes(n))) out.push(`stage3d: the number ${n} (in "${v}") has no fact with a source`);
  return [...new Set(out)];
}

// Reads (ClaudeAnimationBase's timing sheet): what the viewer has to understand in this beat, in order, each with its
// own span of beat-local seconds. One read at a time: a read gets READ_MIN at least to be found and understood, two
// never overlap, and they fit the beat. Generated motion fails most often here: everything at one brisk speed, a
// moment over before anyone understood it.
export const READ_MIN = 0.8;
// Read time is not only "find and understand": the words a read puts on screen have to be read too.
// Bottom line from the measured short-label rule (OpenVideoHarness 03-motion-design §2): 7 CJK glyphs
// or 20 other characters a second, plus 0.8 s to find the line; never less than READ_MIN.
export const READ_CJK_PER_SEC = 7, READ_OTHER_PER_SEC = 20, READ_FIND = 0.8;
export function readBudgetErrors(reads) {
  const out = [];
  (reads || []).forEach((r, k) => {
    const text = String(r?.text || '').trim();
    if (!text) return;
    const chars = [...text], cjk = chars.filter((c) => /[\u3400-\u9fff\uf900-\ufaff]/.test(c)).length, other = chars.length - cjk;
    const need = Math.max(READ_MIN, cjk / READ_CJK_PER_SEC + other / READ_OTHER_PER_SEC + READ_FIND);
    const have = Number(r.to) - Number(r.from);
    if (Number.isFinite(have) && have + 1e-6 < need) out.push(`reads[${k}] "${text}": ${have.toFixed(2)}s is too short to read ${chars.length} characters (${need.toFixed(2)}s at 7 CJK/s or 20 other/s + ${READ_FIND}s to find it)`);
  });
  return out;
}
// The same budget measured on the chapter's kept geometry track: for each declared read, the
// on-screen lines that first appear in its span are its words. A line already standing from an
// earlier read is not counted again. This runs on replay, so it is calibrated on the kept tracks
// before it can hold a render.
export function readBudgetTrackErrors(track, shots) {
  const out = [], first = new Map();
  for (const f of track || []) for (const d of f.drawn || []) {
    if ((d.alpha ?? 1) < 0.5 || d.look || d.deco) continue;
    const k = String(d.whole || d.text || '').trim();
    if (k && !first.has(k)) first.set(k, f.t);
  }
  for (const s of shots || []) {
    const reads = s?.design?.reads || s?.reads || [];
    for (const r of reads) {
      const a = s.at + Number(r.from), b = s.at + Number(r.to), texts = [...first].filter(([, t]) => t >= a - 0.15 && t <= b + 0.05).map(([k]) => k);
      if (!texts.length) continue;
      const chars = [...texts.join('')], cjk = chars.filter((c) => /[\u3400-\u9fff\uf900-\ufaff]/.test(c)).length, other = chars.length - cjk;
      const need = Math.max(READ_MIN, cjk / READ_CJK_PER_SEC + other / READ_OTHER_PER_SEC + READ_FIND), have = b - a;
      if (have + 1e-6 < need) out.push(`${s.shotId}: read "${String(r.what || '').slice(0, 18)}" gets ${have.toFixed(1)}s; its words on screen need ${need.toFixed(1)}s (${texts.join(' / ')})`);
    }
  }
  return out;
}
export function readsErrors(s) {
  const out = [], reads = s.reads || [], dur = s.seconds || 0;
  if (!reads.length) return ['reads: list what the viewer has to understand, in order, each { from, to, what }'];
  if (reads.length * READ_MIN > dur + 1e-6) out.push(`reads: ${reads.length} reads cannot each get ${READ_MIN}s in ${dur}s; cut a read or lengthen the beat`);
  reads.forEach((r, k) => {
    if (!String(r.what || '').trim()) out.push(`reads[${k}]: what does the viewer understand`);
    if (!(r.from >= 0 && r.to <= dur + 1e-6 && r.to > r.from)) out.push(`reads[${k}]: ${r.from}-${r.to}s is not inside the beat (0-${dur}s)`);
    else if (r.to - r.from < READ_MIN - 1e-6) out.push(`reads[${k}] "${r.what}": ${(r.to - r.from).toFixed(2)}s is too short to find and understand (at least ${READ_MIN}s)`);
    if (k && r.from < reads[k - 1].to - 0.05) out.push(`reads[${k}] "${r.what}" starts at ${r.from}s while "${reads[k - 1].what}" is still being read (to ${reads[k - 1].to}s): one read at a time`);
  });
  return [...out, ...readBudgetErrors(reads)];
}
// The camera of a continuous diagram as numbers (the motion-lab lesson: every adjective left in is a decision the
// model makes for you): keys [{ at, dist, elev, azim, dur, look }] in beat-local seconds, the chapter writer copies them
// into camera3; look names the part of the figure aimed at, in words. A flat 2d diagram has no 3D camera: [].
export function keysErrors(d, seconds) {
  if (!d) return [];
  if (!Array.isArray(d.keys)) return ['diagram.keys is not a JSON array'];
  if (d.form === '2d') return [];
  if (!d.keys.length) return [`diagram.keys: a ${d.form} diagram needs its camera as keys [{ at, dist, elev, azim, dur, look }]`];
  const out = [];
  d.keys.forEach((k, i) => {
    const bad = ['at', 'dist', 'elev', 'azim', 'dur'].filter((f) => typeof k?.[f] !== 'number');
    if (bad.length) { out.push(`diagram.keys[${i}]: ${bad.join(', ')} must be numbers`); return; }
    if (k.at < 0 || k.at > seconds + 1e-6) out.push(`diagram.keys[${i}]: at ${k.at}s is outside the beat (0-${seconds}s)`);
    if (!(k.dist > 0)) out.push(`diagram.keys[${i}]: dist must be above 0`);
    if (k.elev < -10 || k.elev > 90) out.push(`diagram.keys[${i}]: elev ${k.elev} is outside -10..90 degrees`);
    if (Math.abs(k.azim) > 180) out.push(`diagram.keys[${i}]: azim ${k.azim} is outside -180..180 degrees`);
    if (k.dur < 0) out.push(`diagram.keys[${i}]: dur must be 0 or more`);
    if (!String(k.look || '').trim()) out.push(`diagram.keys[${i}]: look names what the camera aims at`);
    if (i && k.at < d.keys[i - 1].at) out.push(`diagram.keys[${i}]: keys go in time order`);
  });
  return out;
}

// A chapter is one take (user 2026-10-22: 9 到 12 秒还是不自然硬切; 怎么设计镜头才行最好): a camera key of 0 s is a
// cut, and the chapter writer keys it as one. The storyboard's own example began every beat with one, so 32 beats of
// paperclip-138-full opened on a cut where Vol.138 glides. A beat that continues its chapter starts from where the
// last beat left the camera (its first key travels, dur > 0); a key of 0 s inside a chapter stands only where the
// reference cuts within PLAN_CUT_TOL s of the same moment (the beat's seconds mapped onto the reference's, from its
// start to the next beat's). The chapter's first beat may open on a pose (its seam is the reel's).
export const PLAN_CUT_TOL = 1.0;
export function planCutErrors(shots, timing = {}) {
  const out = [];
  shots.forEach((s, i) => {
    if (s.card !== 'morph-chapter' || !Array.isArray(s.diagram?.keys)) return;
    const prev = shots[i - 1], continues = prev?.card === 'morph-chapter' && prev.chapter === s.chapter;
    s.diagram.keys.forEach((k, j) => {
      if (!(typeof k?.dur === 'number' && k.dur < 0.05)) return;
      if (k.at < 0.05 && !continues) return;   // the chapter opens on a pose
      const r = referenceCutAt(timing, s.beat, k.at, s.seconds, PLAN_CUT_TOL);
      if (r.cut) return;
      out.push(`${s.beat}: diagram.keys[${j}] is a cut (dur 0 at ${k.at} s) inside chapter ${s.chapter}, where the reference keeps one take${r.at != null ? ` (no cut near ${r.at.toFixed(1)} s)` : ''}: ${k.at < 0.05 ? 'start the beat from where the last one left the camera: its first key travels there (dur 1.2 s or more)' : 'travel there (dur 1.2 s or more, eased)'}`);
    });
  });
  return out;
}

// System checks against plan + brief + vocabulary + CAMERA.md. Errors block; warnings inform.
// A replay of an earlier picture (a scene's recall) stands only where the reference calls back there too (its
// breakdown's devices: callback, rhyme, subject-stays). user 2026-10-23 (后面好像又出现重复镜头): B36 replayed B33's card
// where the reference has the news on an old television, B37 the Y tree where it wipes the silhouette away, B53 an
// evidence table where it has a countdown bomb — the replays stood in for pictures nobody designed.
export const RECALL_DEVICES = ['callback', 'rhyme', 'subject-stays'];
export function recallErrors(shots, breakdown) {
  if (!breakdown?.beats?.length) return [];
  const out = [];
  for (const s of shots) {
    const rec = designRecalls(s); if (!rec.length) continue;
    const rb = breakdown.beats.find((b) => b.beat === s.beat); if (!rb) continue;
    if ((rb.devices || []).some((d) => RECALL_DEVICES.includes(d))) continue;
    out.push(`${s.beat}: replays ${rec.join(', ')} where the reference shows a new picture (${(rb.devices || []).join(', ') || 'its own'}: ${(rb.elements || []).map((e) => e.what).join('; ').slice(0, 160)}): design that picture; a replay stands only where the reference calls back (${RECALL_DEVICES.join(', ')})`);
  }
  return out;
}
export function checkStoryboard(cfg, plan, brief, sb, { speechRate, spoken = null, original = {}, timing = null, breakdown = null, six = false } = {}) {
  sb = normalizeAnswer(sb);   // the check reads the answer as the line works on it (params as objects)
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  // v2 (2026-10-21) adds the timing sheet (reads) and the diagram's camera as numbers (diagram.keys); a v1 storyboard
  // the line accepted before stays accepted, with a warning, until its storyboard is asked again
  if (six && sb?.contract !== 'A1RecipeBoardStoryboard/v3') return { ok: false, errors: ['contract must be "A1RecipeBoardStoryboard/v3": a six-stage film names each beat\'s act and devices (prompts/storyboard-semantic.md)'], warnings };
  if (!sb || !['A1RecipeBoardStoryboard/v1', 'A1RecipeBoardStoryboard/v2', 'A1RecipeBoardStoryboard/v3'].includes(sb.contract)) return { ok: false, errors: ['contract must be "A1RecipeBoardStoryboard/v2"'], warnings };
  const v2 = sb.contract !== 'A1RecipeBoardStoryboard/v1';
  if (sb.contract === 'A1RecipeBoardStoryboard/v3') { const r = semanticErrors(sb.shots || [], plan.beats, loadActs(cfg), loadDevices(cfg)); errors.push(...r.errors); warnings.push(...r.warnings); }
  if (!v2) warn('storyboard v1: no reads (timing sheet) and no camera keys; ask the storyboard again for v2');
  const table = routingTable(cfg);
  const intents = new Set(table.intents.map((i) => i.id));
  const acts = Object.fromEntries(loadActions(cfg).actions.map((a) => [a.id, a]));
  const cards = new Set(fs.readdirSync(path.join(cfg.dataDir, 'recipes')).filter((x) => x.endsWith('.json')).map((x) => x.slice(0, -5)));
  const shots = sb.shots || [];
  const beats = plan.beats;
  if (shots.length !== beats.length) err(`${shots.length} shots for ${beats.length} beats; one shot per beat`);
  const idx = Object.fromEntries(beats.map((b, i) => [b.id, i]));
  const chapterOf = (bid) => brief.chapters.find((c) => idx[bid] >= idx[c.from] && idx[bid] <= idx[c.to]);
  const heroBeats = Object.fromEntries(brief.heroMoments.map((h) => [h.beat, h]));
  const motif = Object.fromEntries(brief.motif.appears.map((a) => [a.beat, a]));
  const callbacks = Object.fromEntries(brief.callbacks.map((c) => [c.to, c]));
  const breathing = new Set(brief.rhythm.breathingBeats);
  const mediumShots = new Set(brief.mediumShots);
  let flashes = 0;
  shots.forEach((s, i) => {
    const b = beats[i];
    const tag = s.beat || `shot ${i + 1}`;
    if (!b || s.beat !== b.id) { err(`${tag}: shot ${i + 1} must be beat ${b?.id} (one per beat, plan order)`); return; }
    const ch = chapterOf(b.id);
    if (s.chapter !== ch?.id) err(`${tag}: chapter ${s.chapter}, but the brief puts it in ${ch?.id}`);
    if (s.intent !== b.intent) {
      if (!intents.has(s.intent)) err(`${tag}: intent "${s.intent}" is not a known intent`);
      if (!String(s.intentReason || '').trim()) err(`${tag}: intent changed from ${b.intent} to ${s.intent} without intentReason`);
    }
    if (!cards.has(s.card)) err(`${tag}: card "${s.card}" does not exist`);
    else if (!cardsForBeat(table, b, s.intent).includes(s.card) && !(s.card === 'morph-chapter' && chapterNeighbour(shots, s))) err(`${tag}: card ${s.card} is not a candidate for ${s.intent} (${cardsForBeat(table, b, s.intent).join(', ')})`);
    if (s.card === 'hero-3d') heroErrors(s.stage3d).forEach((m) => err(`${tag}: ${m}`));
    // a continuous diagram says how it shows the beat (form, figure, camera): the chapter writer builds from it
    if (s.card === 'morph-chapter' && !(s.diagram && s.diagram.form && String(s.diagram.figure || '').trim() && String(s.diagram.camera || '').trim())) err(`${tag}: a morph-chapter beat needs diagram { form, figure, camera }`);
    else if (s.stage3d) warn(`${tag}: stage3d is read only on a hero-3d card`);
    if (v2 && s.card === 'morph-chapter') keysErrors(s.diagram, s.seconds).forEach((m) => err(`${tag}: ${m}`));
    if (v2) readsErrors(s).forEach((m) => err(`${tag}: ${m}`));
    if (!String(s.why || '').trim()) err(`${tag}: why is empty`);
    // can the facts fill the card? numbers on screen must come from the text (writer facts rule)
    const nums = (b.text.match(NUMBER_RE) || []).length;
    const need = NUMBER_CARDS[s.card];
    if (need && nums < need) err(`${tag}: ${s.card} needs at least ${need} numbers from the text; this beat has ${nums}`);
    for (const a of [s.hero, ...(s.secondary || [])]) if (!acts[a?.action]) err(`${tag}: action "${a?.action}" is not in the vocabulary`);
    // a flat picture pulled back only shrinks inside the frame and shows the empty ground round it (user 2026-10-22: 好多
    // 镜头语言怎么都是缩小画面漏背景: B09 B17 B36 B45 B53); the reference's pull-back is a camera stepping back in its world
    if (s.card !== 'morph-chapter' && s.card !== 'hero-3d' && [s.hero, ...(s.secondary || [])].some((x) => x?.action === 'pull-back')) err(`${tag}: a pull-back on a flat picture shrinks it and shows the empty ground round it: push in on what is to be looked at (push-in), dim the rest (focus-dim), wipe it (erase), or make the beat part of its chapter, where the camera really steps back`);
    if ((s.secondary || []).length > 2) err(`${tag}: at most 2 secondary actions`);
    if (s.hero && s.seconds && s.hero.at > s.seconds) err(`${tag}: hero action at ${s.hero.at}s is after the shot ends (${s.seconds}s)`);
    (s.secondary || []).forEach((a) => { if (s.hero && a.at < s.hero.at) warn(`${tag}: secondary ${a.action} starts before the hero; secondaries follow the hero by 0.1–0.2 s`); });
    // camera (CAMERA.md)
    const c = s.camera || {};
    if (c.move === 'push' && !(c.amount >= 0.02 && c.amount <= 0.04)) err(`${tag}: push amount ${c.amount}; CAMERA.md allows 0.02–0.04`);
    if (c.move === 'punch' && !(c.amount >= 0.06 && c.amount <= 0.1)) err(`${tag}: punch amount ${c.amount}; CAMERA.md allows 0.06–0.10`);
    if (c.move === 'push' && s.seconds < 3) warn(`${tag}: a push on a ${s.seconds}s shot; pushes are for holds of 3 s or more`);
    const camActs = [s.hero, ...(s.secondary || [])].filter((a) => acts[a?.action]?.kind === 'camera');
    if (camActs.length && c.move !== 'locked') err(`${tag}: ${camActs[0].action} already moves the camera; camera must be locked (one camera owner)`);
    if (camActs.length > 1) err(`${tag}: two camera actions in one shot`);
    if (s.in === 'flash') flashes++;
    if (s.in === 'whip' && ch && b.id !== ch.from) warn(`${tag}: whip in the middle of ${ch.id}; whips belong to chapter changes`);
    // length
    const est = spoken?.[b.id] ?? estimateSeconds(b.text, speechRate);
    if (s.seconds < est * 0.6 || s.seconds > est * 1.6 + 1.5) warn(`${tag}: ${s.seconds}s for ~${est}s of narration`);
    // brief alignment
    const isHero = !!heroBeats[b.id];
    if (!!s.isHero !== isHero) err(`${tag}: isHero ${!!s.isHero}, but the brief ${isHero ? 'lists' : 'does not list'} it as a hero moment`);
    if (isHero && s.hero?.action === 'hold') err(`${tag}: a hero moment with hold; deliver the brief's treatment (${heroBeats[b.id].treatment.slice(0, 40)}…)`);
    if (motif[b.id] && !String(s.motifState || '').trim()) err(`${tag}: the motif appears here in the brief; write motifState`);
    if (!motif[b.id] && String(s.motifState || '').trim()) err(`${tag}: motifState on a beat where the brief has no motif appearance`);
    if (callbacks[b.id] && s.callbackFrom !== callbacks[b.id].from) err(`${tag}: brief callback ${callbacks[b.id].from} → ${b.id}; callbackFrom must be ${callbacks[b.id].from}`);
    if (!callbacks[b.id] && String(s.callbackFrom || '').trim()) err(`${tag}: callbackFrom on a beat that is not a callback target in the brief`);
    if (breathing.has(b.id)) {
      // inside a continuous diagram the breath is the diagram holding still (the reference does it mid-mechanism);
      // three rounds could not satisfy both this and the chapter rule (paperclip-138-full B11, B28, B43)
      // in a chapter's world: it continues the beat before in the same chapter (it may close the chapter: B45 steps back
      // from B44's tree in the same 3D scene)
      const inChapter = s.card === 'morph-chapter' && shots[i - 1]?.card === 'morph-chapter' && shots[i - 1]?.chapter === s.chapter;
      if (inChapter) warn(`${tag}: breathing beat inside the continuous diagram: let the diagram hold still (no new element), the camera only drifting`);
      else if (!BREATH_CARDS.has(s.card)) err(`${tag}: breathing beat on ${s.card}; use ${[...BREATH_CARDS].join(' / ')}`);
      // a breath adds nothing new, but the picture still changes: the reference holds a second or two inside a moving
      // picture; it never freezes a whole beat (paperclip-138-full: B36 B37 B45 B53 froze 6-8 s on an earlier shot,
      // a minute of the film standing still). Past BREATH_HOLD seconds the beat dims, pulls back or is erased.
      if (!inChapter) breathErrors(s).forEach((m) => err(`${tag}: ${m}`));   // inside a chapter the diagram goes on moving (its own checks)
    }
    if (!!s.medium !== mediumShots.has(b.id)) err(`${tag}: medium ${!!s.medium}, but the brief ${mediumShots.has(b.id) ? 'marks' : 'does not mark'} it`);
    // treatment ladder: facts get real pictures; metaphor only when nothing real can be shown
    const ev = Array.isArray(s.evidence) ? s.evidence : [];
    const scenes = Array.isArray(s.scenes) ? s.scenes : [];
    const cutCards = scenes.length ? scenes.map((x) => x.card) : [s.card];
    const facts = factsOf(b, cfg);
    const why0 = String(s.noEvidence || '').trim();
    if (!TREATMENTS.includes(s.treatment)) err(`${tag}: treatment "${s.treatment}" is not one of ${TREATMENTS.join(' / ')}`);
    ev.forEach((e, k) => {
      if (!EVIDENCE_KINDS.includes(e?.kind) || !String(e?.what || '').trim()) err(`${tag}: evidence ${k} needs a kind (${EVIDENCE_KINDS.join('/')}) and what it shows`);
      if (!EVIDENCE_FORMS.includes(e?.form)) err(`${tag}: evidence ${k} needs a form (${EVIDENCE_FORMS.join('/')})`);
      if (e?.form === 'webpage' && !REPORT_RE.test(b.text) && !namesIn(cfg, b.text).some((n) => n.kind === 'org' || n.kind === 'product')) warn(`${tag}: evidence ${k} is a web page on a story line (no number, report or statement); show the place, the time or the person with footage or photos (video / photo)`);
      if (e?.form === 'recording' && e.kind !== 'software') warn(`${tag}: evidence ${k} is a screen recording; recordings are the author's own (kind software)`);
      // which cut shows it, and can that card hold this form?
      const holders = scenes.length ? scenes.filter((x) => x.evidence === k).map((x) => x.card) : [s.card];
      for (const c of holders) if (FORM_CARDS[e?.form] && !FORM_CARDS[e.form].includes(c)) warn(`${tag}: a ${e.form} on ${c}; it reads on ${FORM_CARDS[e.form].join(' / ')}`);
    });
    if (s.treatment === 'evidence') {
      if (!ev.length) err(`${tag}: treatment evidence with an empty evidence list; name the real pictures to find`);
      if (!cutCards.some((c) => EVIDENCE_CARDS.has(c))) err(`${tag}: treatment evidence on ${cutCards.join(', ')}, which has no slot for a real picture (${[...EVIDENCE_CARDS].join(', ')})`);
    }
    if (s.treatment === 'metaphor' && !why0) err(`${tag}: metaphor is the last step of the ladder; write noEvidence (why no real picture can carry this line)`);
    if (s.treatment === 'metaphor' && facts.length && !why0) err(`${tag}: a metaphor on a line with facts (${facts.slice(0, 3).join('、')}); give evidence or say why not`);
    else if (facts.length && ['title', 'diagram', 'presenter', 'presenter-tags'].includes(s.treatment) && !ev.length && !why0) warn(`${tag}: facts on this line (${facts.slice(0, 3).join('、')}) but no evidence; give a real picture or write noEvidence`);
    if (EVIDENCE_ONLY.has(s.card) && !ev.length && !scenes.length) warn(`${tag}: ${s.card} shows evidence, but the shot names none; it will render as an empty frame`);
    if (!scenes.length && /^concept-/.test(s.card) && MECH_RE.test(s.why || '')) warn(`${tag}: draws a mechanism ("${(s.why || '').match(MECH_RE)[0]}") on ${s.card}; parts and lanes that change go on mechanism-3d`);
    if (scenes.length) {
      if (scenes[0].at !== 0) err(`${tag}: the first cut starts at 0`);
      if (scenes[0].card !== s.card) err(`${tag}: card must be the first cut's card (${scenes[0].card})`);
      scenes.forEach((x, k) => {
        if (!cards.has(x.card)) err(`${tag}: cut ${k} card "${x.card}" does not exist`);
        if (k && !(x.at >= scenes[k - 1].at + 0.4)) err(`${tag}: cut ${k} at ${x.at}s; cuts go forward by at least 0.4 s`);
        if (x.evidence >= ev.length) err(`${tag}: cut ${k} points at evidence ${x.evidence}, but there are ${ev.length}`);
        if (x.evidence >= 0 && !EVIDENCE_CARDS.has(x.card)) err(`${tag}: cut ${k} carries evidence on ${x.card}, which has no picture slot`);
        if (!String(x.visual || '').trim()) err(`${tag}: cut ${k} has no visual`);
        if (/^concept-/.test(x.card) && MECH_RE.test(x.visual || '')) warn(`${tag}: cut ${k} draws a mechanism ("${(x.visual || '').match(MECH_RE)[0]}") on ${x.card}; parts and lanes that change go on mechanism-3d`);
        // a cut on the same page card with the same evidence shows the same picture again: the material binds one reading
        // window a piece of evidence (whole-film review 2026-10-25: B04's three cuts of one report stood 6 s alike)
        if (k && x.evidence >= 0 && x.evidence === scenes[k - 1].evidence && x.card === scenes[k - 1].card && SAME_PAGE_CARDS.has(x.card)) err(`${tag}: cut ${k} shows evidence ${x.evidence} on ${x.card} again, as cut ${k - 1} does: one piece of evidence is one picture — give the cut another picture (a recall with its word over it, another piece of evidence) or join the two cuts`);
        // a recap replays an earlier shot (its own picture, not a new search)
        const rc = String(x.recall || '').trim();
        if (rc) {
          const j = beats.findIndex((y) => y.id === rc);
          if (j < 0 || j >= i) err(`${tag}: cut ${k} recalls ${rc}; recall an earlier beat`);
          if (!RECALL_CARDS.has(x.card)) err(`${tag}: cut ${k} recalls ${rc} on ${x.card}; a replayed shot goes on ${[...RECALL_CARDS].join(' / ')}`);
          if (x.evidence >= 0) err(`${tag}: cut ${k} recalls ${rc} and also carries evidence ${x.evidence}; a replayed cut needs no new material`);
          // a bare replay is recognised in a second and then stands as a repeat: its change (an erase lands 1.5 s before
          // the cut's end) comes too late in a long cut (whole-film review 2026-10-25: B37 replayed B23's family tree 2.5 s
          // unchanged; the reference put a new picture there). A longer cut sets type over it (title-hero-over-photo).
          const len = (scenes[k + 1]?.at ?? s.seconds) - x.at;
          if (x.card === 'footage-plate' && len > RECALL_BARE_MAX) err(`${tag}: cut ${k} replays ${rc} bare for ${len.toFixed(1)} s; a bare replay stands at most ${RECALL_BARE_MAX} s — cut it shorter, or set its word over it (title-hero-over-photo)`);
        } else if (RECALL_RE.test(x.visual || '')) warn(`${tag}: cut ${k} replays something from earlier ("${(x.visual || '').match(RECALL_RE)[0]}"); name the beat in recall`);
      });
      if (s.seconds && scenes[scenes.length - 1].at > s.seconds - 0.4) err(`${tag}: the last cut starts at ${scenes[scenes.length - 1].at}s in a ${s.seconds}s shot`);
      if (breathing.has(b.id) && scenes.some((x) => !BREATH_CARDS.has(x.card))) err(`${tag}: breathing beat; every cut must be ${[...BREATH_CARDS].join(' / ')}`);
    }
  });
  // director grammar: triggers per line, presenter placement
  const firstPerson = new Set();
  shots.forEach((s, i) => {
    const b = beats[i];
    if (!b || s.beat !== b.id) return;
    const cards = (s.scenes || []).length ? s.scenes.map((x) => x.card) : [s.card];
    if (LIST_RE.test(b.text) && (s.scenes || []).length < 3 && !breathing.has(b.id)) warn(`${s.beat}: a list / exclusion line ("${b.text.match(LIST_RE)[0].slice(0, 16)}…"); cut each item (scenes, 0.4–0.8 s a cut)`);
    if (TURN_RE.test(b.text) && !cards.some((c) => PRESENTER_PLAIN.has(c) || PRESENTER_OVERLAY.has(c))) warn(`${s.beat}: a question / turn line ("${b.text.match(TURN_RE)[0]}"); the presenter carries it`);
    if (OPINION_RE.test(b.text) && !cards.some((c) => NEWS_CARDS.has(c)) && !(s.evidence || []).some((x) => x.kind === 'event')) warn(`${s.beat}: the line cites what others say ("${b.text.match(OPINION_RE)[0]}"); show the headlines (news card, a collage of real headlines)`);
    const broll = brief.motif?.broll;
    const usesBroll = broll && (s.evidence || []).some((x) => (x.queryEn || '').toLowerCase() === broll.queryEn.toLowerCase() || (x.what || '').includes(broll.what.slice(0, 6)));
    if (EMOTION_RE.test(b.text) && !breathing.has(b.id) && !(cards.some((c) => c === 'footage-plate') && (!broll || usesBroll))) warn(`${s.beat}: an emotional / exaggerated line ("${b.text.match(EMOTION_RE)[0]}"); cut to the film's b-roll motif${broll ? ` (brief: ${broll.what}, evidence queryEn "${broll.queryEn}")` : ''} with footage-plate`);
    if (ANNOUNCE_RE.test(b.text) && !cards.includes('chat-thread')) warn(`${s.beat}: an announcement / message ("${b.text.match(ANNOUNCE_RE)[0]}"); show it as a chat thread (chat-thread), bubble by bubble`);
    if (PAIR_RE.test(b.text) && !cards.includes('poster-pair')) warn(`${s.beat}: the line sets out "${b.text.match(PAIR_RE)[0]}"; put them as two poster cards on either side of the presenter (poster-pair) and hold`);
    if (CONCEPT_RE.test(b.text) && !cards.some((c) => c.startsWith('title-')) && !breathing.has(b.id)) warn(`${s.beat}: a concept / reversal word ("${b.text.match(CONCEPT_RE)[0]}"); give it a big title cut (title-word-broll / title-hero-over-photo)`);
    for (const n of namesIn(cfg, b.text).filter((x) => x.kind !== 'event')) {
      const shown = (s.evidence || []).some((x) => `${x.entity}${x.what}`.includes(n.name)) || cards.some((c) => PERSON_CARDS.has(c) || ['product-side-card', 'presenter-side-card'].includes(c));
      if (!shown && !breathing.has(b.id) && !String(s.noEvidence || '').trim()) warn(`${s.beat}: names ${n.name}${n.library ? ' (a verified picture is in the entity library)' : ''} but shows nothing of it; give a real picture or say why not (noEvidence)`);
    }
    if (QUOTE_RE.test(b.text) && !cards.some((c) => QUOTE_CARDS.has(c))) warn(`${s.beat}: someone's own words; show the quote (quote card or big type)`);
    // a page right after a page on the same subject: the reference never re-opens a page it has just shown
    // (cuts-labelled.json: page -> page 8 of 18, every one the same reading moving on); after a page it goes
    // back to the presenter, with or without tags (7 of 18). Two beats on one fact land on one page.
    const pages = (x) => (x?.evidence || []).filter((e) => e.form === 'webpage' || e.form === 'paper');
    const prev = shots[i - 1];
    const lastPrev = prev && ((prev.scenes || []).length ? prev.scenes.at(-1).card : prev.card);
    const sameSubject = pages(prev).some((p) => pages(s).some((q) => p.entity && p.entity === q.entity && p.form === q.form));
    if (prev && NEWS_CARDS.has(lastPrev) && NEWS_CARDS.has(cards[0]) && sameSubject) warn(`${s.beat}: opens a ${pages(s)[0].form} on ${pages(s)[0].entity} right after ${prev.beat} showed one; both land on the same page. Give this beat the presenter with tags (presenter-tags), or carry the reading on inside ${prev.beat}`);
    for (const e of (b.entities || []).filter((x) => x.kind === 'person' && x.needsSource)) {
      if (firstPerson.has(e.name)) continue;
      firstPerson.add(e.name);
      if (!cards.some((c) => PERSON_CARDS.has(c)) && !(s.evidence || []).some((x) => x.kind === 'person')) warn(`${s.beat}: ${e.name} appears for the first time; give a nameplate (real photo + name + one line)`);
    }
    if (i && PRESENTER_PLAIN.has(s.card) && !(s.scenes || []).length && PRESENTER_PLAIN.has(shots[i - 1].card) && !(shots[i - 1].scenes || []).length) warn(`${s.beat}: two plain presenter shots in a row; alternate the presenter with packaging`);
  });
  // a cut under 0.8 s reads as a glitch unless it belongs to a montage (3+ cuts under 1 s in a row)
  const allCuts = shots.flatMap((s) => cutsOfShot(s).map((c) => ({ ...c, beat: s.beat })));
  allCuts.forEach((c, k) => {
    if (c.seconds >= 0.8) return;
    const short = (j) => allCuts[j] && allCuts[j].seconds < 1.0;
    const inRun = [[k - 2, k - 1], [k - 1, k + 1], [k + 1, k + 2]].some(([x, y]) => short(x) && short(y));
    if (!inRun) err(`${c.beat}: a ${c.seconds} s cut on its own (${c.card}); cuts under 0.8 s belong to a montage of 3 or more`);
  });
  // a voice-over film has no presenter footage: a presenter card would stay a placeholder (paperclip-138 run 1)
  const voiceover = !plan.options?.hasPresenter;
  if (voiceover) for (const sh of shots) for (const c of [sh.card, ...(sh.scenes || []).map((x) => x.card)]) if (PRESENTER_CARDS.has(c)) err(`${sh.beat}: ${c} needs the presenter, and this film has none (voice-over): give the line a packaging card`);
  // a chapter the plan explains with one continuous diagram stays one: a beat taken off it breaks the diagram in two
  plan.beats.forEach((b, i) => {
    const sh = shots.find((x) => x.beat === b.id), prevPlan = plan.beats[i - 1], nextPlan = plan.beats[i + 1];
    if (b.route?.recipe === 'morph-chapter' && sh && sh.card !== 'morph-chapter' && prevPlan?.route?.recipe === 'morph-chapter' && nextPlan?.route?.recipe === 'morph-chapter') warn(`${b.id}: the plan explains ${prevPlan.id}-${nextPlan.id} with one continuous diagram (morph-chapter); taking ${b.id} off it splits the diagram`);
  });
  // rhythm per chapter against its role (routing/rhythm-by-role.json)
  const R = loadRhythm(cfg);
  const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
  for (const ch of brief.chapters) {
    const t = R.roles[ch.role];
    const inCh = shots.filter((s) => s.chapter === ch.id);
    if (!t || !inCh.length) continue;
    const m = measureChapter(inCh);
    const tag = `${ch.id} (${ch.role})`;
    if (m.cutSeconds > t.cutSeconds[1] * 1.4 || m.cutSeconds < t.cutSeconds[0] * 0.7) err(`${tag}: ${m.cutSeconds} s a cut; a ${ch.role} chapter runs ${t.cutSeconds.join('–')} s a cut (split beats into cuts with scenes, or merge)`);
    else if (!inRange(m.cutSeconds, t.cutSeconds)) warn(`${tag}: ${m.cutSeconds} s a cut; target ${t.cutSeconds.join('–')} s`);
    if (!voiceover && !inRange(m.presenter, t.presenter)) warn(`${tag}: presenter on screen ${Math.round(m.presenter * 100)}%; target ${t.presenter.map((x) => Math.round(x * 100)).join('–')}%`);
    if (!voiceover && t.overlay && m.overlay > t.overlay[1]) warn(`${tag}: presenter with overlays ${Math.round(m.overlay * 100)}%; at most ${Math.round(t.overlay[1] * 100)}% in a ${ch.role} chapter (tags are for a judgement, not every line)`);
    if (m.evidence < t.evidence[0] || m.evidence > t.evidence[1]) warn(`${tag}: real pictures and data ${Math.round(m.evidence * 100)}%; target ${t.evidence.map((x) => Math.round(x * 100)).join('–')}%`);
    if (!voiceover && m.awayMax > t.awayMax) warn(`${tag}: ${m.awayMax} s without the presenter; at most ${t.awayMax} s in a ${ch.role} chapter`);
  }
  const film = measureChapter(shots);
  if (!voiceover && !inRange(film.presenter, R.film.presenter)) warn(`film: presenter on screen ${Math.round(film.presenter * 100)}%; target ${R.film.presenter.map((x) => Math.round(x * 100)).join('–')}%`);
  // per chapter: how many lines with facts got a real picture
  for (const ch of brief.chapters) {
    const inCh = shots.filter((s) => s.chapter === ch.id && beats[idx[s.beat]]);
    const factual = inCh.filter((s) => factsOf(beats[idx[s.beat]], cfg).length);
    const shown = factual.filter((s) => (s.evidence || []).length);
    if (factual.length >= 3 && shown.length / factual.length < 0.5) warn(`${ch.id}: ${shown.length} of ${factual.length} lines with facts show a real picture; the ladder puts evidence first`);
  }
  if (flashes > 2) err(`${flashes} flash cuts; at most 2 in the film`);
  // variety (routing table rhythm rules)
  for (let i = 2; i < shots.length; i++) {
    if (shots[i].card === shots[i - 1].card && shots[i].card === shots[i - 2].card && !['presenter-plain', 'morph-chapter'].includes(shots[i].card)) err(`${shots[i].beat}: ${shots[i].card} three shots in a row`);   // a chapter runs on by design
    if ([0, 1, 2].every((k) => TEXT_CARDS.has(shots[i - k].card))) warn(`${shots[i].beat}: three text cards in a row (${shots[i - 2].beat}–${shots[i].beat}); put a picture in between`);
  }
  // the reference film shows something here: no empty stock shot in its place (reference.mjs)
  for (const m of emptyShotErrors(sb.shots, original)) err(m);
  if (v2 && timing) planCutErrors(shots, timing).forEach(err);
  recallErrors(shots, breakdown).forEach(err);
  return { ok: !errors.length, errors, warnings };
}

// What a storyboard looks like on the clock: every cut (a shot with scenes counts each cut) with its kind.
// presenter = plain presenter (P) or presenter with overlays (PT); evidence = real pictures and data.
export const PRESENTER_PLAIN = new Set(['presenter-plain']);
export const PRESENTER_CARDS = new Set(['presenter-plain', 'presenter-tags', 'presenter-side-card', 'presenter-quotes', 'poster-pair']);   // need the presenter's footage
export const PRESENTER_OVERLAY = new Set(['presenter-tags', 'presenter-side-card', 'product-side-card', 'poster-pair']);
const DATA_CARDS = new Set(['data-bar-chart', 'data-hbar-ranking', 'data-table-grid', 'data-table-dark', 'market-table', 'stat-sheet', 'paper-collage-figures']);
// Cards a replayed earlier shot can fill (its picture full frame, a word over it).
export const RECALL_CARDS = new Set(['footage-plate', 'title-hero-over-photo']), RECALL_BARE_MAX = 3.5, SAME_PAGE_CARDS = new Set(['screen-full', 'article-highlight-dark', 'article-highlight-light', 'footage-plate']);
const RECALL_RE = /复用|旧画面|闪回|前文|回放|再现/;
const MECH_RE = /闭环|循环|回路|通道|流向|流过|搬运|奖励回/;
const DIAGRAM_CARDS = new Set(['mechanism-3d', 'concept-flow', 'concept-steps-hero', 'concept-trials', 'card-stack']);
const kindOf = (card, evidence) => (PRESENTER_PLAIN.has(card) ? 'P' : PRESENTER_OVERLAY.has(card) ? 'PT' : DIAGRAM_CARDS.has(card) ? 'D' : DATA_CARDS.has(card) ? 'E' : evidence ? 'E' : 'X');
// a continuous diagram's beat does not cut: a new thing comes into the same picture about every two seconds (the chapter
// language, Vol.138 + Vol.047: a beat 5–10 s, 2–4 things). Each thing it gives to read (reads) is one change of the
// rhythm, as a cut is on a card (the Vol.047 run: the cut targets, measured on presenter films, refused a chapter of
// 10 s diagram beats as one 8 s cut each)
export const CONTINUOUS = new Set(['morph-chapter']);
export function cutsOfShot(s) {
  const sc = s.scenes || [];
  if (!sc.length && CONTINUOUS.has(s.card) && (s.reads || []).length > 1) { const kind = kindOf(s.card, (s.evidence || []).length > 0 && EVIDENCE_CARDS.has(s.card)); return s.reads.map(() => ({ card: s.card, seconds: +(s.seconds / s.reads.length).toFixed(2), kind })); }
  if (!sc.length) return [{ card: s.card, seconds: s.seconds, kind: kindOf(s.card, (s.evidence || []).length > 0 && EVIDENCE_CARDS.has(s.card)) }];
  return sc.map((x, k) => ({ card: x.card, seconds: +((sc[k + 1]?.at ?? s.seconds) - x.at).toFixed(2), kind: kindOf(x.card, x.evidence >= 0 || !!String(x.recall || '').trim()) }));
}
export function measureChapter(shots) {
  const cuts = shots.flatMap(cutsOfShot);
  const dur = cuts.reduce((a, c) => a + c.seconds, 0) || 1;
  const share = (f) => cuts.filter(f).reduce((a, c) => a + c.seconds, 0) / dur;
  let run = 0, away = 0;
  for (const c of cuts) { run = c.kind === 'P' || c.kind === 'PT' ? 0 : c.kind === 'D' ? run : run + c.seconds; away = Math.max(away, run); }
  return { seconds: +dur.toFixed(1), cuts: cuts.length, cutSeconds: +(dur / cuts.length).toFixed(2), presenter: +share((c) => c.kind === 'P' || c.kind === 'PT').toFixed(2),
    plain: +share((c) => c.kind === 'P').toFixed(2), overlay: +share((c) => c.kind === 'PT').toFixed(2), evidence: +share((c) => c.kind === 'E').toFixed(2), awayMax: +away.toFixed(1) };
}
// Triggers from the director grammar: lines that call for a montage, a presenter beat, a nameplate or a quote.
const LIST_RE = /不是.{1,14}?不是|(?:[^，。、\s]{1,8}、){2,}[^，。、\s]{1,8}/;
const TURN_RE = /另外一个问题|另一个问题|第二个问题|第一个问题|两个问题|我们先来看|接下来|说到这儿|聊到这儿|问题就来了|更好奇|最反常识/;
const QUOTE_RE = /原话|说过|他说|她说|评价了一句/;
const OPINION_RE = /那套说法|这套说法|有人说|外界|媒体|普遍认为|大家都说|舆论|报道称|网上都/;
const EMOTION_RE = /钱多|没数花|疯了|离谱|吓人|慌成|难以置信|不敢相信|失眠|炸了/;
// a line a web page can carry: a number, a report, a statement or an announcement
const REPORT_RE = /\d|[零一二三四五六七八九十百千万亿]+(?:倍|%|个点|亿|万)|报道|宣布|发布|官网|新闻|据|声明|公告|论文|财报|股价|市值|采访|表示|称|历史上|最大|最高|第一|纪录|记录|开源|模型|代码|数据|问他|在他看来|他说|访谈/;
const ANNOUNCE_RE = /宣布|发消息|群里|朋友圈|发了一条|官宣/;
const PAIR_RE = /两个问题|两种看法|两个信仰|两条路|两种可能|两个选择/;
const CONCEPT_RE = /叫做|所谓|称为|起了个名字|凭什么|错了|恰恰相反|甚至不是|根本不是/;
const NEWS_CARDS = new Set(['stamp-over-evidence', 'article-highlight-dark', 'article-highlight-light', 'screen-full']);
const PERSON_CARDS = new Set(['person-nameplate', 'person-intro', 'quote-portrait-bw', 'quote-stack']);
const QUOTE_CARDS = new Set(['quote-portrait-bw', 'quote-stack', 'title-word-broll', 'title-hero-over-photo', 'presenter-tags', 'stamp-over-evidence']);

// Cues for a designed shot on its card's preset: action impls + camera (CAMERA.md: locked = push 1).
export function designCues(cfg, design, preset) {
  const V = loadActions(cfg);
  const acts = Object.fromEntries(V.actions.map((a) => [a.id, a]));
  const cues = {};
  const planned = [];
  const fill = (v, at) => (v === 'at' ? at : v === '[at]' ? [at] : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, at)])) : v);
  for (const a of [design.hero, ...(design.secondary || [])]) {
    const impl = acts[a.action]?.impl;
    const m = impl && (impl[preset] || impl.any);
    if (!m) { if (a.action !== 'hold') planned.push(a.action); continue; }
    Object.assign(cues, fill(m, Math.round(a.at * 100) / 100));
  }
  if (V.camera.presetsMovingCam.includes(preset) || preset === 'person') {
    const c = design.camera;
    cues.push = c.move === 'push' ? Math.round((1 + c.amount) * 1000) / 1000 : 1;
    if (['punch', 'reframe'].includes(c.move)) planned.push(`camera:${c.move}`);
  }
  if (design.in === 'flash') { if (preset === 'plate') cues.flash = 0; else planned.push('in:flash'); }
  if (design.in === 'whip' || design.out === 'whip') planned.push('whip');
  return { cues, planned };
}

export function storyboardState(cfg, id) {
  const plan = readPlan(cfg, id);
  const brief = briefOf(cfg, id);
  if (!plan || !brief || brief.planHash !== planHash(plan)) return { state: 'blocked' };
  const sb = readJson(sbFile(cfg, id));
  const answer = normalizeAnswer(readAnswer(cfg, id, STEP));
  if (sb && sb.inputHash === inputHash(cfg, plan, brief, voiceKey(cfg, id), id) && (!answer || sb.answerHash === sha(JSON.stringify(answer)))) {
    const redesign = redesignedBeats(cfg, id);
    return { state: 'current', storyboard: sb, ...(redesign.length ? { application: 'unresolved', redesign } : {}) };
  }
  const check = readJson(taskPaths(cfg, id, STEP).check);
  if (answer && check && check.answerHash === sha(JSON.stringify(answer)) && !check.ok) return { state: 'rejected', check };
  return { state: sb ? 'stale' : 'waiting' };
}

export async function stepStoryboard(cfg, id, { log = () => {}, agent = null } = {}) {
  const plan = readPlan(cfg, id);
  const brief = briefOf(cfg, id);
  if (!plan || !brief || brief.planHash !== planHash(plan)) return { state: 'blocked', reason: 'needs an accepted brief for the current plan' };
  const hash = inputHash(cfg, plan, brief, voiceKey(cfg, id), id);
  const spoken = spokenSeconds(cfg, id);
  const st = storyboardState(cfg, id);
  if (st.state === 'current') return { state: 'current' };
  if (st.state === 'pending') return { state: 'pending', redesign: st.redesign };
  const task = readTask(cfg, id, STEP);
  const ref = referenceBeats(cfg, id), refIds = Object.keys(ref).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (!task || task.inputHash !== hash) writeTask(cfg, id, STEP, { inputHash: hash, rules: isSix(cfg, id) ? [SEMANTIC_RULES, RULES] : RULES, schema: isSix(cfg, id) ? SCHEMA_V3 : SCHEMA, input: { ...buildStoryboardInput(cfg, id), ...(isSix(cfg, id) ? semanticInput(cfg, plan) : {}), ...(refIds.length ? { original: { note: `附图是对标原片每一拍讲同一句话时的画面（${refIds.length} 条，按拍号顺序：${refIds.join('、')}；每条五格按时间），text 是原片那几秒画面上的字。每一拍先看原片用什么表现，用同一类手段设计；原片在放信息（证物、文件、剪报、标题卡、图解）的地方，不许用空镜（evidence kind stock 的街景、风景）顶替`, beats: Object.fromEntries(refIds.map((b) => [b, ref[b].text.slice(0, 160)])) } } : {}) }, ...(refIds.length ? { images: refIds.map((b) => ref[b].strip) } : {}) });
  let answer = normalizeAnswer(readAnswer(cfg, id, STEP));
  // an answer checked against older input (the rules, schema, plan or brief changed since) is stale: it is asked
  // for again, not re-checked forever (paperclip-138-full: a new required field rejected the old answer and no new
  // one was asked for)
  const lastCheck = readJson(taskPaths(cfg, id, STEP).check, null);
  if (answer && lastCheck?.inputHash && lastCheck.inputHash !== hash && !lastCheck.ok) answer = null;
  const backend = agent || agentFor(cfg, id, STEP);
  const speechRate = loadProject(cfg, id).speechRate;
  if (!answer && backend === 'codex') {
    // Codex answers, the line checks; rejected answers go back once more with the errors.
    for (let round = 1; round <= 3; round++) {
      log(`storyboard: asking Codex (round ${round})`);
      const t = readTask(cfg, id, STEP);
      const last = round > 1 ? checkStoryboard(cfg, plan, brief, answer, { speechRate, spoken, original: referenceBeats(cfg, id), timing: referenceTiming(cfg, id), breakdown: breakdownFor(cfg, id, (plan?.beats || []).map((b) => b.id)) }) : null;
      const prev = last ? { ...t, input: { ...t.input, previousAnswer: answer, checkErrors: last.errors, checkWarnings: last.warnings } } : t;
      const next = normalizeAnswer(await runCodexTask(cfg, STEP, prev, 'contract'));
      const r = checkStoryboard(cfg, plan, brief, next, { speechRate, spoken, original: referenceBeats(cfg, id), timing: referenceTiming(cfg, id), breakdown: breakdownFor(cfg, id, (plan?.beats || []).map((b) => b.id)) });
      log(`storyboard: round ${round}: ${r.errors.length} errors, ${r.warnings.length} warnings`);
      // an improvement round (no errors before) is kept only when it stays error-free with fewer warnings
      if (last?.ok && !(r.ok && r.warnings.length < last.warnings.length)) { log('storyboard: kept the previous round'); break; }
      answer = next;
      writeAnswer(cfg, id, STEP, answer);
      // one more round on warnings (director grammar) after the first error-free answer
      if (r.ok && (last?.ok || !r.warnings.length)) break;
    }
  }
  if (!answer) return { state: 'waiting', task: taskPaths(cfg, id, STEP).task };
  const result = checkStoryboard(cfg, plan, brief, answer, { speechRate, spoken, original: referenceBeats(cfg, id), timing: referenceTiming(cfg, id), breakdown: breakdownFor(cfg, id, (plan?.beats || []).map((b) => b.id)), six: isSix(cfg, id) });
  writeCheck(cfg, id, STEP, { answerHash: sha(JSON.stringify(answer)), inputHash: hash, ...result });
  if (!result.ok) return { state: 'rejected', ...result };
  const sb = { ...answer, inputHash: hash, answerHash: sha(JSON.stringify(answer)), acceptedAt: new Date().toISOString(), agent: backend };
  writeJson(sbFile(cfg, id), sb);
  const applied = applyStoryboard(cfg, id);
  fs.writeFileSync(path.join(projectPaths(cfg, id).root, 'storyboard.md'), storyboardMarkdown(cfg, id, plan, brief, sb, applied));
  return { state: 'accepted', warnings: result.warnings, applied };
}

// Apply the accepted storyboard to the plan (pinned card, length, cues — what the writer reads) and to
// existing shots on the same card (motion length, cues, design, medium). Shots whose card changes are
// listed as `redesign`: the write step rewrites them. Idempotent: files are written only when they change.
export function applyStoryboard(cfg, id) {
  const sb = readJson(sbFile(cfg, id));
  if (!sb) return null;
  const plan = readPlan(cfg, id);
  const theme = projectTheme(cfg, id);
  const p = projectPaths(cfg, id);
  const byBeat = Object.fromEntries(sb.shots.map((s) => [s.beat, s]));
  const report = { updated: [], redesign: [], planned: {} };
  let planChanged = false;
  for (const b of plan.beats) {
    const d = byBeat[b.id];
    if (!d) continue;
    const preset = loadRecipe(cfg, d.card, theme).motionPreset;
    const { cues, planned } = designCues(cfg, d, preset);
    if (planned.length) report.planned[b.id] = planned;
    const design = { chapter: d.chapter, intent: d.intent, treatment: d.treatment, evidence: d.evidence || [], noEvidence: d.noEvidence || '', hero: d.hero, secondary: d.secondary, camera: d.camera, in: d.in, out: d.out, isHero: d.isHero, motifState: d.motifState, callbackFrom: d.callbackFrom, why: d.why, planned, ...(d.scenes?.length ? { scenes: d.scenes.map(x => ({ evidence: x.evidence, recall: x.recall })) } : {}) };
    const file = path.join(p.shots, `${b.id}.json`);
    const shot = fs.existsSync(file) ? readJson(file) : null;
    // Preserve the previous plan as the only available scene mapping for legacy shots.
    // A blocked rewrite must remain detectable by projectState on subsequent runs.
    if (shot && needsRewrite(shot, d, b.scenes)) { report.redesign.push(b.id); continue; }
    // what the writer reads: the evidence to register as material needs, and the cuts of a montage
    const scenes = (d.scenes || []).length ? d.scenes.map((x) => ({ at: x.at, recipe: x.card, visual: x.visual, evidence: x.evidence, ...(String(x.recall || '').trim() ? { recall: x.recall.trim() } : {}) })) : undefined;
    const visual = (d.evidence || []).length ? d.evidence.map((e) => e.what).join('；') : undefined;
    // a beat with no evidence reads the storyboard's own words for its picture, never the plan's older line (B05 B06 B38 kept
    // 西北小城居民街巷空镜 from the plan after the storyboard dropped the empty shot, and the writer drew it again)
    const next = { recipe: d.card, duration: d.seconds, cues, design, evidence: (d.evidence || []).length ? d.evidence : undefined, scenes, visual: visual ?? (String(d.noEvidence || d.why || '').trim() || b.visual) };
    const keys = ['recipe', 'duration', 'cues', 'design', 'evidence', 'scenes', 'visual'];
    if (JSON.stringify(keys.map((k) => b[k])) !== JSON.stringify(keys.map((k) => next[k]))) {
      for (const k of keys) { if (next[k] === undefined) delete b[k]; else b[k] = next[k]; }
      b.route.recipe = d.card; planChanged = true;
    }
    if (!shot) continue;
    const before = JSON.stringify(shot);
    shot.motion = { ...(shot.motion || {}), preset: shot.motion?.preset || preset, duration: d.seconds, cues: { ...(shot.motion?.cues || {}), ...cues } };
    shot.design = design;
    if (d.medium) shot.medium = shot.medium || true; else if (shot.medium === true) delete shot.medium;
    if (JSON.stringify(shot) !== before) { writeJson(file, shot); report.updated.push(b.id); }
  }
  if (planChanged) writePlan(cfg, id, plan);
  return report;
}

// A written shot no longer matches its design when the card, the cuts or the evidence changed.
const cutsOf = (d) => ((d.scenes || []).length ? d.scenes.map((x) => x.card) : [d.card]);
const shotCuts = (shot) => (shot.scenes?.length ? shot.scenes.map((x) => x.recipe || shot.recipe) : [shot.recipe]);
const evidenceKey = (ev) => JSON.stringify((ev || []).map((e) => e ? [e.kind, e.entity, e.what, e.form || null, e.queryEn || null] : null));
// Match writer's evFor: chapter consumes all evidence; a single cut consumes the first;
// a montage consumes the evidence indexed by each retained, non-recall scene.
const consumedEvidence = (evidence, scenes, merged, chapter) => {
  if (chapter) return evidence || [];
  const kept = Array.isArray(merged) && merged.length === scenes?.length ? scenes.filter((_, i) => merged[i]) : scenes;
  if (!(kept?.length > 1)) return [evidence?.[0]];
  return kept.map(s => s.recall ? null : evidence?.[s.evidence]);
};
// which earlier shots a shot replays: in its slots (the write step fills a recall from the storyboard) and as its design
// asks (scenes[].recall). A storyboard that drops or changes a recall rewrites the shot (B06 B53 went on replaying B05
// after the storyboard stopped asking for it: only a card change rewrote a shot)
export const shotRecalls = (shot) => { const r = new Set(); const walk = (v) => { if (v && typeof v === 'object') { if (typeof v.recall === 'string' && v.recall) r.add(v.recall); Object.values(v).forEach(walk); } }; walk(shot.slots); (shot.scenes || []).forEach((x) => walk(x.slots || x)); return [...r].sort(); };
export const designRecalls = (d) => [...new Set((d.scenes || []).map((x) => String(x.recall || '').trim()).filter(Boolean))].sort();
export function needsRewrite(shot, d, priorScenes = undefined) {
  // a chapter beat's cuts are drawn by its chapter module, not written on the shot (paperclip-138-full B47 was listed to
  // rewrite on every run: its storyboard asked for two cuts, its shot holds the chapter's slice)
  if (shot.recipe === 'morph-chapter' && d.card === 'morph-chapter') return false;
  // the writer keeps cuts that show the same thing as one take (writer.mjs mergedScenes): the storyboard is read through
  // that, or a merged beat was listed to rewrite on every run (banana-tr4-blind B01, B07)
  const want = cutsOf(d), kept = Array.isArray(shot.mergedScenes) && shot.mergedScenes.length === want.length ? want.filter((_, i) => shot.mergedScenes[i]) : want;
  if (shot.recipe !== d.card || JSON.stringify(shotCuts(shot)) !== JSON.stringify(kept)) return true;
  if (JSON.stringify(shotRecalls(shot)) !== JSON.stringify(designRecalls(d))) return true;
  if (!shot.design?.evidence && d.evidence?.length) return true;
  const oldScenes = shot.design?.scenes || priorScenes;
  if (!oldScenes && d.scenes?.length > 1 && d.evidence?.length) return true;
  // The plan stores writer inputs (recipe, at, visual); shot.design can hold only
  // mapping indices. Combine them without inventing missing historical fields.
  if (oldScenes && d.scenes?.length) {
    if (oldScenes.length !== d.scenes.length) return true;
    for (let i = 0; i < d.scenes.length; i++) {
      const old = { ...(priorScenes?.[i] || {}), ...(shot.design?.scenes?.[i] || {}) };
      const next = d.scenes[i];
      for (const key of ['at', 'visual', 'evidence']) {
        if ((key in old || key in next) && old[key] !== next[key]) return true;
      }
      if ((old.recipe || old.card) && (old.recipe || old.card) !== next.card) return true;
    }
  }
  return evidenceKey(consumedEvidence(shot.design?.evidence, oldScenes, shot.mergedScenes, false)) !== evidenceKey(consumedEvidence(d.evidence, d.scenes, shot.mergedScenes, false));
}

export function redesignedBeats(cfg, id) {
  const sb = readJson(sbFile(cfg, id));
  if (!sb) return [];
  const have = Object.fromEntries(loadShots(cfg, id).map((s) => [s.shotId, s]));
  const beats = Object.fromEntries((readPlan(cfg, id)?.beats || []).map(b => [b.id, b]));
  return sb.shots.filter((s) => have[s.beat] && needsRewrite(have[s.beat], s, beats[s.beat]?.scenes)).map((s) => s.beat);
}

const FORM_LABEL = { photo: '照片', video: '视频', webpage: '网页', paper: '论文', logo: 'Logo', chart: '行情/图表', recording: '录屏' };
const TREATMENT_LABEL = { evidence: '证据', 'presenter-tags': '主讲人+贴签', data: '数据', diagram: '结构图', title: '标题', presenter: '留白', metaphor: '隐喻' };
export function storyboardMarkdown(cfg, id, plan, brief, sb, applied) {
  const beat = Object.fromEntries(plan.beats.map((b) => [b.id, b]));
  const breathing = new Set(brief.rhythm.breathingBeats);
  const L = [`# 分镜：${plan.title || id}`, '', `${sb.shots.length} 镜 · 按简报 ${brief.chapters.length} 章 · 符号：★ 高光　◎ 母题　↩ 呼应　○ 留白　▣ 介质`, ''];
  const cards = {};
  sb.shots.forEach((s) => (cards[s.card] = (cards[s.card] || 0) + 1));
  L.push(`用到 ${Object.keys(cards).length} 张卡：${Object.entries(cards).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('、')}`, '');
  const treat = {};
  sb.shots.forEach((s) => (treat[s.treatment] = (treat[s.treatment] || 0) + 1));
  const cuts = sb.shots.reduce((n, s) => n + Math.max(1, (s.scenes || []).length), 0);
  L.push(`处理方式：${TREATMENTS.filter((t) => treat[t]).map((t) => `${TREATMENT_LABEL[t]} ${treat[t]}`).join('、')} · 共 ${cuts} 刀`, '');
  for (const c of brief.chapters) {
    const m = measureChapter(sb.shots.filter((x) => x.chapter === c.id));
    const t = loadRhythm(cfg).roles[c.role] || {};
    L.push(`## ${c.id} ${c.title}（${c.role} · 张力 ${c.tension} · ${c.pace}）`, '',
      `节奏：${m.cuts} 刀 · 平均 ${m.cutSeconds} s（目标 ${(t.cutSeconds || []).join('–')}）· 主讲人 ${Math.round(m.presenter * 100)}%（目标 ${(t.presenter || []).map((x) => Math.round(x * 100)).join('–')}%）· 证据 ${Math.round(m.evidence * 100)}% · 最长不见人 ${m.awayMax} s（≤ ${t.awayMax}）`, '', '| 拍 | 处理 | 卡 | 主角动作 | 次要 | 镜头 | 进 | 秒 | 为什么 |', '|---|---|---|---|---|---|---|---|---|');
    for (const s of sb.shots.filter((x) => x.chapter === c.id)) {
      const marks = `${s.isHero ? '★' : ''}${s.motifState ? '◎' : ''}${s.callbackFrom ? '↩' : ''}${breathing.has(s.beat) ? '○' : ''}${s.medium ? '▣' : ''}`;
      const cam = s.camera.move === 'locked' ? '锁定' : `${s.camera.move} ${s.camera.amount}`;
      const head = (beat[s.beat]?.onScreen?.headline || '').slice(0, 12);
      const extra = [s.motifState && `母题：${s.motifState}`, s.callbackFrom && `呼应 ${s.callbackFrom}`].filter(Boolean).join('；');
      const treat = `${TREATMENT_LABEL[s.treatment] || s.treatment || '—'}${(s.evidence || []).length ? `：${s.evidence.map((e) => `${e.entity || e.what}${e.form ? `（${FORM_LABEL[e.form] || e.form}）` : ''}`).join('、')}` : ''}${s.noEvidence ? `（无证据：${s.noEvidence}）` : ''}`;
      const card = (s.scenes || []).length ? s.scenes.map((x) => `${x.at}s ${x.card}`).join(' → ') : s.card;
      L.push(`| ${marks} ${s.beat} ${head} | ${treat} | ${card} | ${s.hero.action} → ${s.hero.target} @${s.hero.at}s | ${s.secondary.map((a) => `${a.action} @${a.at}s`).join('，') || '—'} | ${cam} | ${s.in}${s.out !== 'cut' ? '/' + s.out : ''} | ${s.seconds} | ${s.why}${extra ? `（${extra}）` : ''} |`);
    }
    L.push('');
  }
  if (applied) {
    const planned = Object.entries(applied.planned);
    L.push('## 落到镜头上', '', `- 已更新 ${applied.updated.length} 个镜头的时长、动效参数和镜头。`, `- 换卡、需要重新填字的镜头 ${applied.redesign.length} 个：${applied.redesign.join(' ') || '无'}（\`run\` 的 write 步骤会重写）。`,
      `- 用到还没做出来的动作的镜头 ${planned.length} 个（第三步动效词汇库做完后生效，现在按卡的默认动效渲染）：${planned.map(([k, v]) => `${k}（${v.join('、')}）`).join('；') || '无'}`, '');
  }
  L.push('---', `由 ${sb.agent} 写 · ${sb.acceptedAt}`, '');
  return L.join('\n');
}

// ---------------------------------------------------------------- the beat's act and its devices (v3, six-stage films)

// what the task carries for it: the acts with their devices, and per beat the devices its narration cues
export function semanticInput(cfg, plan) {
  const devices = loadDevices(cfg), cued = Object.fromEntries(deviceCues((plan?.beats || []).map((b) => ({ beat: b.id, text: b.text })), devices).map((c) => [c.beat, c.devices]));
  return { acts: loadActs(cfg), devices: devices.map((d) => ({ id: d.id, name: d.name, when: d.when, kit: d.kit?.status || null })), cues: cued };
}
// (pure, tested) every beat names its act and shows it with devices of the library that fit it or say why; the devices the
// narration cues are used or declined with a reason; no device three beats running, none on more than a third of the film
export function semanticErrors(shots, beats, acts, devices, { motif = [] } = {}) {
  const errors = [], warnings = [], A = Object.fromEntries(acts.map((a) => [a.id, a])), D = new Set(devices.map((d) => d.id));
  // (a routed device — a made model, a real page, real prices — is the chapter's to take: chapter.mjs routedErrors)
  const cued = Object.fromEntries(deviceCues(beats.map((b) => ({ beat: b.id, text: b.text })), devices.filter((d) => !d.route)).map((c) => [c.beat, c.devices]));
  for (const s of shots) {
    const tag = `${s.beat}: `, act = A[s.act];
    if (!act) { errors.push(`${tag}act "${s.act}" is not an act (${acts.map((a) => a.id).join(' / ')})`); continue; }
    const ds = s.devices || [];
    if (!ds.length) errors.push(`${tag}devices: one to three devices that show "${act.name}" (routing/devices.json; this act's: ${act.devices.join(', ')})`);
    for (const d of ds) if (!D.has(d)) errors.push(`${tag}device "${d}" is not in routing/devices.json`);
    if (String(s.deviceWhy || '').trim().length < 8) errors.push(`${tag}deviceWhy: one sentence on how these devices show this line`);
    else if (ds.length && !ds.some((d) => act.devices.includes(d)) && !/因为|所以|这句|不用|而是|比起/.test(s.deviceWhy)) warnings.push(`${tag}none of ${ds.join(', ')} is an act "${act.name}" device (${act.devices.join(', ')}): say why in deviceWhy`);
    const declined = new Set((s.declined || []).filter((x) => String(x.why || '').trim().length >= 6).map((x) => x.device));
    const open = (cued[s.beat] || []).filter((d) => !ds.includes(d) && !declined.has(d));
    if (open.length) errors.push(`${tag}the narration cues ${open.join(', ')}: use it or decline it with a reason (declined: [{ device, why }])`);
  }
  const keep = new Set(motif);
  for (let i = 2; i < shots.length; i++) for (const d of shots[i].devices || []) if (!keep.has(d) && (shots[i - 1].devices || []).includes(d) && (shots[i - 2].devices || []).includes(d)) errors.push(`${shots[i].beat}: "${d}" three beats running (${shots[i - 2].beat}–${shots[i].beat}); show this line another way`);
  const count = {}; for (const s of shots) for (const d of new Set(s.devices || [])) count[d] = (count[d] || 0) + 1;
  for (const [d, n] of Object.entries(count)) if (!keep.has(d) && shots.length >= 6 && n > shots.length / 3) warnings.push(`"${d}" on ${n} of ${shots.length} beats: more than a third of the film looks one way`);
  return { errors: [...new Set(errors)], warnings };
}
