// (filmworld.mjs; world.mjs is the older terminal world's shot context) The film's own world, derived from its subject (the user 2026-10-26: 你要不多看看回形针别的期的设计风格 肯定根据不同主题做
// 变体吧; style-lab/RESEARCH-paperclip-variants-20261026.md). 回形针 has no fixed style: each episode takes its ground, its one
// colour, its texture and the way its diagrams are drawn from the subject's own material and light — night-vision green,
// plasma red, honey amber, the pack's gold foil. The seven fixed skins of routing/styles.json were picked from and shown,
// and the user rejected what came out twice. Now the director derives the world (agent task `world`, prompts/world.md,
// routing/world.schema.json), the line checks it (worldErrors), and an accepted world becomes the film's style:
// projects/<id>/style.json, read under the name film:<id> by every part that reads a style (modules.mjs styles,
// filmlook.mjs readStyle), and project.json style points to it. Its frames — a few beats set by the card modules in it,
// the way the film is made — are rendered for the look gate (out/look/parts), never the image model's whole frames.
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths, loadProject, readPlan } from './store.mjs';
import { writeTask, readAnswer, writeCheck, taskPaths, sha } from './agenttask.mjs';
import { toOklch } from './designbrain.mjs';

export const STEP = 'world';
const RULES = 'work/recipe-board-v1/prompts/world.md', SCHEMA = 'work/recipe-board-v1/routing/world.schema.json';
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const filmStyleId = (id) => `film:${id}`;
export const styleFile = (cfg, id) => path.join(projectPaths(cfg, id).root, 'style.json');
const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

// (pure, tested) the line's checks of a world: every choice taken from the subject, readable, one colour world, not a
// look the user rejected, its frames real card specs in the film's own words
export function worldErrors(w, { article = '', rejected = [], beats = [], checkSpec = null, direction = false } = {}) {
  const e = [], err = (m) => e.push(m);
  if (!direction && w?.contract !== 'A1RecipeBoardWorld/v1') err('contract: A1RecipeBoardWorld/v1');
  for (const k of ['object', 'looks', 'light', 'medium']) if (String(w?.subject?.[k] || '').trim().length < 2) err(`subject.${k}: say it (the world is taken from the subject as it is in the world)`);
  for (const [k, v] of [['ground.color', w?.ground?.color], ['main.color', w?.main?.color], ['ink', w?.ink], ...(w?.accent ? [['accent.color', w.accent.color]] : [])]) if (!HEX.test(v || '')) err(`${k} must be #RRGGBB`);
  for (const [k, v] of [['ground', w?.ground], ['main', w?.main], ['accent', w?.accent], ['texture', w?.texture], ['diagram', w?.diagram]]) if (v && String(v.from || '').trim().length < 4) err(`${k}.from: say which of the subject it is taken from`);
  if (e.length) return e;
  const g = w.ground.color, dark = lum(g) < 0.18;
  if ((w.ground.tone === 'dark') !== dark) err(`ground.tone is ${w.ground.tone} but ${g} is ${dark ? 'dark' : 'light'}`);
  if (contrast(w.ink, g) < 7) err(`ink ${w.ink} on ${g}: contrast ${contrast(w.ink, g).toFixed(1)}, at least 7 (words read on the ground)`);
  if (contrast(w.main.color, g) < 2.2) err(`main ${w.main.color} on ${g}: contrast ${contrast(w.main.color, g).toFixed(1)}, at least 2.2 (the one colour stands off the ground)`);
  if (w.accent && dist(w.accent.color, w.main.color) < 60) err('accent is the main colour again: a second colour or null');
  // (a look the user rejected is not offered again: cobalt on cream, 2026-10-20 and 2026-10-26)
  for (const r of rejected) if (dist(g, r.paper) < 40 && (r.marks || [r.ink, r.accent]).some((m) => dist(w.main.color, m) < 60)) err(`the user rejected this look (${r.id}: ${r.said}): a ground like ${r.paper} with ${w.main.color}`);
  const frames = w.frames || [];
  if (frames.length < 3) err('frames: 3–6 beats set in this world for the look gate');
  const ids = new Set(beats.map((b) => b.id || b)), flat = String(article).replace(/\s/g, '');
  for (const f of frames) {
    if (ids.size && !ids.has(f.beat)) err(`frames ${f.name}: ${f.beat} is not a beat of the plan`);
    let s; try { s = JSON.parse(f.spec); } catch { err(`frames ${f.name}: spec is not JSON`); continue; }
    if (checkSpec) for (const m of checkSpec(s)) err(`frames ${f.name}: ${m}`);
    // the figures on screen are the film's own (facts: the narration first)
    const nums = [...JSON.stringify(stripArt(s)).matchAll(/(?<![\w#.])\d+(?:\.\d+)?/g)].map((m) => m[0]).filter((n) => !['0', '1'].includes(n) && n.length < 6);
    const words = new Set(textsOf(s).join(' ').match(/\d+(?:\.\d+)?/g) || []);
    for (const n of nums) if (words.has(n) && !flat.includes(n)) err(`frames ${f.name}: the figure ${n} is not in the script`);
  }
  return e;
}
// (pure) the directions of an answer: v2 carries two or three; a v1 answer is one direction A
export const directionsOf = (a) => (a?.contract === 'A1RecipeBoardWorld/v2' ? a.directions || [] : a ? [{ id: 'A', ...a }] : []);
export const ANGLES = ['object', 'place-era', 'mood', 'metaphor', 'precedent'];
// (pure, tested) a direction is a variant of the house's look (routing/house-style.json; the user 2026-10-27: 按你推荐的
// 执行 — one house look: Gawx's colour and type, the paperclip films' motion and texture, hupo's evidence; the subject
// turns only its knobs): a neutral dark or a warm-white paper, one strong colour (a second only of its hue), a display
// face of the six drawn to the house's widths, texture in its range
export function houseErrors(w, house) {
  if (!house?.limits) return [];
  const e = [], L = house.limits, K = house.knobs || {}, g = toOklch(w.ground?.color || '#000000');
  if (w.ground?.tone === 'dark' && (g.L > L.darkGroundMaxL || (g.C > L.darkGroundMaxC && g.C < (L.colouredGroundMinC ?? 0.04)))) e.push(`ground ${w.ground.color}: the house's dark is a neutral deep grey or a clear deep colour (L ≤ ${L.darkGroundMaxL}; C ≤ ${L.darkGroundMaxC} or ≥ ${L.colouredGroundMinC ?? 0.04}; it reads L ${g.L.toFixed(2)} C ${g.C.toFixed(3)}): between them it reads dirty — brown, pink`);   // (a deep indigo, teal or red ground is the house's too: the user 2026-10-28, 可以各种配色)
  if (w.ground?.tone === 'light' && (g.L < L.lightGroundMinL || g.C > L.lightGroundMaxC)) e.push(`ground ${w.ground.color}: the house's light ground is a warm-white paper (L ≥ ${L.lightGroundMinL}, C ≤ ${L.lightGroundMaxC})`);
  if (w.accent?.color && w.main?.color) { const a = toOklch(w.main.color).h, b = toOklch(w.accent.color).h, d = Math.abs(((a - b + 540) % 360) - 180); if (d > L.secondAccentMaxHueGap) e.push(`accent ${w.accent.color}: the house has one strong colour; a second only of its hue (${Math.round(d)}° from the main), or null`); }
  if (K.displayFace && w.display?.face && !K.displayFace.includes(w.display.face)) e.push(`display.face ${w.display.face}: one of the six (${K.displayFace.join(', ')})`);
  if (K.displayX && w.display?.x != null && (w.display.x < K.displayX[0] || w.display.x > K.displayX[1])) e.push(`display.x ${w.display.x}: ${K.displayX[0]}–${K.displayX[1]}`);
  for (const k of ['grain', 'vignette']) if (K[k] && w.texture?.[k] != null && (w.texture[k] < K[k][0] || w.texture[k] > K[k][1])) e.push(`texture.${k} ${w.texture[k]}: the house's range ${K[k][0]}–${K[k][1]}`);
  return e;
}
// (pure, tested) a v2 answer: every direction a world of its own (worldErrors), from one association, learning from a
// reference world and saying how it differs (the reference films' level is the floor, the look is free: the user
// 2026-10-26: 要有对标水准的设计 当然你可以自由发挥 做各种变体); the directions are really different
export function directionErrors(a, opts = {}, precedents = []) {
  if (a?.contract !== 'A1RecipeBoardWorld/v2') return ['contract: A1RecipeBoardWorld/v2 (two or three directions)'];
  const ds = a.directions || [], e = [];
  if (ds.length < 2 || ds.length > 3) e.push('directions: two or three, each from another association');
  const ids = new Set(precedents.map((p) => p.id));
  for (const d of ds) {
    const tag = `${d.id}: `;
    if (!ANGLES.includes(d.angle)) e.push(`${tag}angle: ${ANGLES.join(' | ')}`);
    if (ids.size && !ids.has(d.precedent)) e.push(`${tag}precedent "${d.precedent}" is not a reference world (routing/world-precedents.json)`);
    for (const k of ['learns', 'differs']) if (String(d[k] || '').trim().length < 8) e.push(`${tag}${k}: say it in a sentence`);
    e.push(...worldErrors(d, { ...opts, direction: true }).map((m) => tag + m));
    e.push(...houseErrors(d, opts.house).map((m) => tag + m));
  }
  if (new Set(ds.map((d) => d.id)).size !== ds.length) e.push('directions: ids A, B, C each once');
  for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) { const x = ds[i], y = ds[j];
    if (HEX.test(x.ground?.color || '') && HEX.test(y.ground?.color || '') && HEX.test(x.main?.color || '') && HEX.test(y.main?.color || '') && dist(x.ground.color, y.ground.color) < 60 && dist(x.main.color, y.main.color) < 80 && x.diagram?.mode === y.diagram?.mode) e.push(`${x.id} and ${y.id} are one world twice (ground, colour and diagrams alike): a direction comes from another association`); }
  return e;
}
const stripArt = (v) => (Array.isArray(v) ? v.map(stripArt) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !['art', 'camera', 'at', 'end', 'texture', 'refType', 'box', 'size', 'facts'].includes(k)).map(([k, x]) => [k, stripArt(x)])) : v);
const textsOf = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(textsOf) : v && typeof v === 'object' ? Object.entries(v).filter(([k]) => !['art', 'prompt', 'theme', 'module', 'src'].includes(k)).flatMap(([, x]) => textsOf(x)) : []);

// (pure, tested) an accepted world as a style of routing/styles.json's shape (the modules' tokens, the faces, the texture,
// the painted plates, the camera, the 3D's material) under the user's verdict untested: it is a proposal until the look gate
export function worldStyle(id, w) {
  const g = w.ground.color, main = w.main.color, acc = w.accent?.color || main, dark = w.ground.tone === 'dark', mix = (a, b, k) => '#' + [0, 1, 2].map((i) => Math.round(rgb(a)[i] * (1 - k) + rgb(b)[i] * k).toString(16).padStart(2, '0')).join('');
  return {
    // (theme: the card line's theme family the cards are laid out in — its colours are this style's; film:<id> named no
    // theme and the write step stopped on it, the banana test)
    title: `${w.subject.object}的世界`, theme: dark ? 'clara-dark' : 'hupo-editorial', fits: [], derived: true,
    tokens: { ground: dark ? 'dark' : 'light', paper: g, ink: w.ink, accent: main, mark: main, brand: acc, block: mix(g, main, 0.85), up: acc, down: main, bar: mix(g, w.ink, 0.12), foot: main },
    fonts: { display: w.display.face, text: '黒華明朝', accent: '黒華明朝', displayX: w.display.x },
    texture: { grain: w.texture.grain, vignette: w.texture.vignette },
    art: w.art, camera: { temper: w.camera, scale: w.camera === 'calm' ? 0.75 : 1 },
    material3d: { ground: g, body: mix(g, w.ink, 0.2), unit: mix(g, w.ink, 0.5), emissive: w.diagram.mode === 'line' ? main : null, metal: 0.2, roughness: 0.7, light: dark ? 'low-key' : 'overcast' },
    medium: { kind: 'none' },
    // whose way with type and light (profile.mjs): the creators the user follows, low-key with the words on things (2026-10-27)
    profile: 'gawx',
    world: { subject: w.subject, photo: w.photo, diagram: w.diagram, props: w.props, bgWords: w.bgWords, why: w.why },
    verdict: { state: 'untested', said: 'derived from the subject; the user judges it at the look gate', film: id },
  };
}

// the films' rejected looks, for worldErrors
export function rejectedLooks(cfg) {
  const all = readJson(path.join(cfg.dataDir, 'routing', 'styles.json'), {}).styles || {};
  // (a rejected look is marked by the colours no approved look shares: cobalt-print by its cobalt, not by the red 胡泊's
  // approved grey paper has too — the banana test's editorial direction was refused as the rejected look)
  const ok = Object.values(all).filter((s) => s.verdict?.state === 'approved').flatMap((s) => [s.tokens.ink, s.tokens.accent]).filter((c) => HEX.test(c || ''));
  return Object.entries(all).filter(([, s]) => s.verdict?.state === 'rejected').map(([k, s]) => ({ id: k, said: s.verdict.said, paper: s.tokens.paper, ink: s.tokens.ink, accent: s.tokens.accent,
    marks: [s.tokens.ink, s.tokens.accent].filter((c) => HEX.test(c || '') && !ok.some((o) => dist(o, c) < 60)) }));
}

export const readPrecedents = (cfg) => readJson(path.join(cfg.dataDir, 'routing', 'world-precedents.json'), { precedents: [] }).precedents;
// (pure, tested) the reference worlds nearest a script: by how often their subject's words are in it
export function precedentsFor(text, precedents, n = 5) {
  return precedents.map((p) => ({ p, hits: p.tags.reduce((a, t) => a + (String(text).split(t).length - 1), 0) })).sort((a, b) => b.hits - a.hits).slice(0, n).filter((x) => x.hits > 0).map((x) => x.p.id);
}
// the user's taste as their verdicts on worlds left it (routing/taste.json: approved, rejected, passed over; with their words)
export const tasteFile = (cfg) => path.join(cfg.dataDir, 'routing', 'taste.json');
export const readTaste = (cfg) => readJson(tasteFile(cfg), { contract: 'A1RecipeBoardTaste/v1', entries: [] });
const traits = (st) => ({ tone: st.tokens?.ground, main: st.tokens?.accent, diagram: st.world?.diagram?.mode, photo: st.world?.photo, angle: st.world?.angle || null, precedent: st.world?.precedent || null });
export function recordTaste(cfg, entries) { const t = readTaste(cfg); t.entries.push(...entries.map((x) => ({ at: new Date().toISOString(), ...x }))); fs.writeFileSync(tasteFile(cfg), JSON.stringify(t, null, 1) + '\n'); return t; }
// (pure, tested) what the verdicts say, per trait: how often each value was approved, rejected or passed over
export function tasteSummary(entries) {
  const out = {};
  for (const e of entries) for (const [k, v] of Object.entries(e.traits || {})) { if (v == null) continue; const r = ((out[k] ||= {})[v] ||= { approved: 0, rejected: 0, passed: 0 }); r[e.verdict === 'passed-over' ? 'passed' : e.verdict] = (r[e.verdict === 'passed-over' ? 'passed' : e.verdict] || 0) + 1; }
  return out;
}
export function worldInput(cfg, id) {
  const root = projectPaths(cfg, id).root, plan = readPlan(cfg, id), brief = readJson(path.join(root, 'brief.json')), sb = readJson(path.join(root, 'storyboard.json'));
  return {
    // the house's look: what is fixed and what the subject may turn (routing/house-style.json; the user 2026-10-27)
    house: (() => { try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'house-style.json'), 'utf8')); } catch { return null; } })(),
    title: plan?.title || loadProject(cfg, id)?.title, article: (plan?.beats || []).map((b) => `${b.id} ${b.text}`).join('\n'),
    film: brief?.film || null, chapters: (brief?.chapters || []).map((c) => ({ id: c.id, title: c.title, role: c.role, look: c.look })), motif: brief?.motif || null,
    beats: (sb?.shots || []).map((s) => ({ beat: s.beat, card: s.card, seconds: s.seconds, why: s.why, form: s.diagram?.form || null, isHero: s.isHero })),
    research: 'work/recipe-board-v1/style-lab/RESEARCH-paperclip-variants-20261026.md',
    rejected: rejectedLooks(cfg).map((r) => `${r.id}：${r.said}`),
    // the reference board: every reference world, the nearest first; the user's taste so far; the directions the user
    // turned down for this film before (their words)
    precedents: readPrecedents(cfg), nearest: precedentsFor((plan?.beats || []).map((b) => b.text).join(''), readPrecedents(cfg)),
    taste: { summary: tasteSummary(readTaste(cfg).entries), said: readTaste(cfg).entries.filter((e) => e.said).slice(-12).map((e) => `${e.verdict}：${e.said}`) },
    turnedDown: readJson(path.join(projectPaths(cfg, id).root, 'tasks', 'world.turned-down.json'), []),
    // which reference's grammar a beat takes: the explanation the continuous diagram (回形针), the evidence, people, data and
    // the presenter the card modules (胡泊), both dressed in the film's world
    grammar: 'prompts/world.md 「两期各管什么」',
    examples: 'work/recipe-board-v1/projects/hupo-auto2/modules/*/S*.json (accepted card specs of a delivered film)',
  };
}
export function worldState(cfg, id) {
  const p = loadProject(cfg, id) || {}, have = readJson(styleFile(cfg, id)), answer = readAnswer(cfg, id, STEP), tp = taskPaths(cfg, id, STEP), check = readJson(tp.check);
  if (have && p.style === filmStyleId(id) && (!answer || have.answerHash === sha(JSON.stringify(answer)))) return { state: 'accepted', style: have };
  if (answer && check && check.answerHash === sha(JSON.stringify(answer)) && check.errors?.length) return { state: 'rejected', check };
  return { state: answer ? 'answered' : fs.existsSync(tp.task) ? 'waiting' : 'none' };
}
// one pass: write the task, or check the answer and accept it (the film's style, its frames' specs)
export async function stepWorld(cfg, id, { log = () => {} } = {}) {
  const st = worldState(cfg, id);
  if (st.state === 'accepted') return st;
  if (st.state === 'none') { writeTask(cfg, id, STEP, { rules: RULES, schema: SCHEMA, input: worldInput(cfg, id) }); log(`  world: task written (tasks/${STEP}.task.json)`); return { state: 'waiting' }; }
  const answer = readAnswer(cfg, id, STEP); if (!answer) return { state: 'waiting' };
  const { checkModuleSpec } = await import('./modules.mjs'), plan = readPlan(cfg, id);
  const opts = { article: (plan?.beats || []).map((b) => b.text).join(''), rejected: rejectedLooks(cfg), beats: plan?.beats || [], checkSpec: checkModuleSpec };
  const house = (() => { try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'house-style.json'), 'utf8')); } catch { return null; } })();
  const errors = answer.contract === 'A1RecipeBoardWorld/v2' ? directionErrors(answer, { ...opts, house }, readPrecedents(cfg)) : [...worldErrors(answer, opts), ...houseErrors(answer, house)];
  writeCheck(cfg, id, STEP, { answerHash: sha(JSON.stringify(answer)), errors });
  if (errors.length) { log(`  world: answer rejected (${errors.length}): ${errors.slice(0, 3).join(' | ')}`); return { state: 'rejected', errors }; }
  const ds = directionsOf(answer), dirs = Object.fromEntries(ds.map((d) => [d.id, { ...worldStyle(id, d), world: { ...worldStyle(id, d).world, angle: d.angle || null, precedent: d.precedent || null, learns: d.learns || null, differs: d.differs || null }, frames: d.frames }]));
  const style = { ...dirs[ds[0].id], chosen: ds[0].id, directions: dirs, answerHash: sha(JSON.stringify(answer)) };
  fs.writeFileSync(styleFile(cfg, id), JSON.stringify(style, null, 1) + '\n');
  const pf = projectPaths(cfg, id).project, p = loadProject(cfg, id);
  fs.writeFileSync(pf, JSON.stringify({ ...p, style: filmStyleId(id), styleBefore: p.style && p.style !== filmStyleId(id) ? p.style : p.styleBefore ?? null }, null, 1) + '\n');
  const { resetStyles } = await import('./modules.mjs'); resetStyles?.();
  log(`  world: accepted — ${ds.map((d) => `${d.id} ${d.ground.color}/${d.main.color} ${d.diagram.mode}`).join(' · ')}`);
  return { state: 'accepted', style };
}

// the look gate's frames: each of the world's frames set by its card module in the film's style, one still at its middle
export async function renderWorldFrames(cfg, id, { log = () => {} } = {}) {
  const st = readJson(styleFile(cfg, id)); if (!st?.frames?.length && !st?.directions) return [];
  const ds = st.directions ? Object.entries(st.directions) : [['A', st]], many = ds.length > 1;
  const MOMENT = 'end-0.3';
  const { renderModule } = await import('./modules.mjs'), root = projectPaths(cfg, id).root, outDir = path.join(root, 'out', 'look', 'parts'), work = path.join(root, 'out', 'look', 'render');
  fs.mkdirSync(outDir, { recursive: true });
  const made = [];
  for (const [dir, D] of ds) for (const [i, f] of (D.frames || []).entries()) {
    // (each direction in its own style: film:<id>/<dir>; one direction keeps the plain names)
    const spec = { ...JSON.parse(f.spec), theme: many ? `${filmStyleId(id)}/${dir}` : filmStyleId(id) }, key = sha(JSON.stringify(spec) + JSON.stringify(D.tokens) + MOMENT), dst = path.join(outDir, `${many ? `${dir}-` : ''}${i + 1}-${f.beat}-${f.name}.png`), stamp = `${dst}.key`;
    if (fs.existsSync(dst) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === key) { made.push(dst); continue; }
    try {
      // (at its end, everything it brings on screen: at 70 % the table lacked its third row and the chart was mid-scroll)
      const t = spec.end - 0.3, r = await renderModule(cfg, id, spec, path.join(work, `${dir}-${i + 1}`), { stills: [t], reference: false });
      if (r.stills?.[0]) { fs.copyFileSync(r.stills[0], dst); fs.writeFileSync(stamp, key); made.push(dst); log(`  look frame ${many ? dir + ' ' : ''}${i + 1}: ${f.beat} ${f.name}`); }
    } catch (e) { log(`  look frame ${many ? dir + ' ' : ''}${i + 1} (${f.beat} ${f.name}) failed: ${String(e.message || e).split('\n')[0].slice(0, 200)}`); }
  }
  for (const f of fs.readdirSync(outDir)) if (/\.png$/.test(f) && !made.includes(path.join(outDir, f))) fs.rmSync(path.join(outDir, f));   // (frames of an older world go)
  return made;
}

// the user's pick at the look gate: the chosen direction becomes the film's style; the verdict goes to the taste record
// (the chosen approved, the others passed over), in the user's words
export function pickDirection(cfg, id, dir, by) {
  const f = styleFile(cfg, id), st = readJson(f); if (!st) throw new Error(`${id} has no world yet`);
  const ds = st.directions || { A: st }, D = ds[dir]; if (!D) throw new Error(`no direction ${dir} (${Object.keys(ds).join(', ')})`);
  // what the film's style carries beside its directions (the profile set on it after) stays: a re-approval dropped
  // Suez's profile: 'gawx', and its film design turned to the paperclip profile, B02 light (2026-10-27)
  const kept = Object.fromEntries(Object.entries(st).filter(([k]) => !(k in D) && !['chosen', 'directions', 'answerHash', 'verdict'].includes(k)));
  const next = { ...kept, ...D, chosen: dir, directions: st.directions, answerHash: st.answerHash, verdict: { state: 'approved', said: by, film: id } };
  fs.writeFileSync(f, JSON.stringify(next, null, 1) + '\n');
  recordTaste(cfg, Object.entries(ds).map(([k, x]) => ({ film: id, direction: k, verdict: k === dir ? 'approved' : 'passed-over', said: k === dir ? by : null, traits: traits(x) })));
  return next;
}
// the user turns every direction down: their words and the worlds go to the taste record and back to the director as
// what not to do; the answer is set aside and the task written again
export function rejectLook(cfg, id, said) {
  if (String(said || '').trim().length < 2) throw new Error('a rejection says what the user said');
  const st = readJson(styleFile(cfg, id)), ds = st ? (st.directions || { A: st }) : {}, tp = taskPaths(cfg, id, STEP);
  recordTaste(cfg, Object.entries(ds).map(([k, x]) => ({ film: id, direction: k, verdict: 'rejected', said, traits: traits(x) })));
  const td = path.join(projectPaths(cfg, id).root, 'tasks', 'world.turned-down.json'), was = readJson(td, []);
  fs.mkdirSync(path.dirname(td), { recursive: true });
  fs.writeFileSync(td, JSON.stringify([...was, { at: new Date().toISOString(), said, worlds: Object.entries(ds).map(([k, x]) => ({ id: k, ...traits(x), why: x.world?.why || null })) }], null, 1) + '\n');
  for (const f of [tp.answer, tp.task, tp.check]) if (fs.existsSync(f)) fs.renameSync(f, f.replace(/\.json$/, `.turned-down-${Date.now()}.json`));
  if (st) fs.renameSync(styleFile(cfg, id), styleFile(cfg, id).replace(/\.json$/, `.turned-down-${Date.now()}.json`));
  const pf = projectPaths(cfg, id).project, p = loadProject(cfg, id); const { look, ...rest } = p;
  fs.writeFileSync(pf, JSON.stringify({ ...rest, style: p.styleBefore || null }, null, 1) + '\n');
  return { recorded: Object.keys(ds).length };
}
