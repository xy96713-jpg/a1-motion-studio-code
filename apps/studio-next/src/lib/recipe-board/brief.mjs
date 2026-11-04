// Brief: the whole-film director plan, written once per plan before any shot is designed.
// Chapters (narrative role, tension curve, pace, accent), a recurring motif, rhythm grid and breathing
// beats, the style six-cell brief, hero moments, medium accents, callbacks, a banned list and fact risks.
// Rules: work/recipe-board-v1/prompts/brief.md · schema: routing/brief.schema.json · done by any agent
// through agenttask.mjs; this module builds the task, checks answers and accepts them into brief.json.
import fs from 'node:fs';
import { readStyle } from './filmlook.mjs';
import { checkWorld, DISPLAY, TEXTURES, MEDIA, BASES } from './look.mjs';
import path from 'node:path';
import { projectPaths, loadProject, readPlan, loadTheme, projectTheme } from './store.mjs';
import { agentFor, readAnswer, readTask, runCodexTask, sha, taskPaths, writeAnswer, writeCheck, writeTask } from './agenttask.mjs';

const STEP = 'brief';
const RULES = 'work/recipe-board-v1/prompts/brief.md';
const SCHEMA = 'work/recipe-board-v1/routing/brief.schema.json';
const ROLES = ['hook', 'setup', 'story', 'rise', 'turn', 'climax', 'resolution', 'coda'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const briefFile = (cfg, id) => path.join(projectPaths(cfg, id).root, 'brief.json');

// The brief is tied to the plan it was written for: re-planning makes it stale.
const STAGE_INTENTS = ['teardown', 'scene'], STAGE_SUBJECT = ['dark', 'paper', 'red', 'ink'], STAGE_MEDIA = ['clean', 'film', 'filmday', 'paper', 'halftone', 'crt', 'vhs'];
export const planHash = (plan) => sha(JSON.stringify(plan.beats.map((b) => [b.id, b.intent, b.text])));

export function buildBriefInput(cfg, id) {
  const plan = readPlan(cfg, id);
  if (!plan) throw new Error(`${id} has no plan`);
  const project = loadProject(cfg, id);
  const themeId = projectTheme(cfg, id);
  const theme = loadTheme(cfg, themeId);
  const table = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'routing-table-v1.json'), 'utf8'));
  return {
    title: plan.title || project.title,
    article: plan.input?.text || plan.beats.map((b) => b.text).join('\n'),
    beats: plan.beats.map((b) => ({ id: b.id, intent: b.intent, headline: b.onScreen?.headline || '', keywords: b.onScreen?.keywords || [], text: b.text })),
    theme: { id: themeId, title: theme.title, description: theme.description, medium: theme.medium || project.medium || null },
    cards: fs.readdirSync(path.join(cfg.dataDir, 'recipes')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)),
    rhythmRules: table.rhythmRules || [],
    format: plan.options?.hasPresenter ? 'presenter' : 'voiceover',
    // a reference film this one is measured against (project.reference: its look in words): the world follows it
    ...(project.reference ? { reference: project.reference } : {}),   // voice-over: no presenter footage, every beat is packaging
    // what the 3D routes can stage today (routing/stage-library.json)
    stage: (() => { const lib = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'stage-library.json'), 'utf8')); return { teardown: Object.entries(lib.teardown || {}).map(([k, v]) => `${k}（${v.label}）`), scene: Object.entries(lib.scene || {}).map(([k, v]) => `${k}（${v.label}）`) }; })(),
    cameraRules: 'work/recipe-board-v1/CAMERA.md',
    // the film's style (project.json style, routing/styles.json: one source, CONVERGE-20261026 conflict 1): the brief
    // writes its palette and world in it and says how, it does not choose another (the Vol.047 run's task carried only
    // the card theme, and the brief would have set a third look)
    ...(briefStyle(cfg, project) ? { filmStyle: briefStyle(cfg, project) } : {}),
  };
}
export function briefStyle(cfg, project) {
  const st = readStyle(cfg, project?.style); if (!st) return null;
  return { id: project.style, title: st.title, why: project.styleWhy || null, ground: st.tokens.ground, palette: { base: st.tokens.paper, ink: st.tokens.ink, accent: st.tokens.accent }, fonts: st.fonts, texture: st.texture, medium: st.medium, art: st.art, camera: st.camera };
}

// System checks: errors block acceptance, warnings are reported. Same checks for every agent.
export function checkBrief(plan, b, { filmStyle = null } = {}) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  // a film with a style: the brief's palette and its world's ground are the style's (it writes how, not which)
  if (filmStyle) {
    for (const k of ['base', 'ink', 'accent']) if (String(b.style?.palette?.[k] || '').toLowerCase() !== filmStyle.palette[k].toLowerCase()) err(`style.palette.${k} is the film's style's (${filmStyle.id}: ${filmStyle.palette[k]}); the style is chosen once in project.json`);
    const base = filmStyle.ground === 'dark' ? 'dark' : 'paper';
    if (b.style?.world && b.style.world.base !== base) err(`style.world.base is ${base}: the film's style ${filmStyle.id} has a ${filmStyle.ground} ground`);
  }
  const ids = plan.beats.map((x) => x.id);
  const idx = Object.fromEntries(ids.map((x, i) => [x, i]));
  const n = ids.length;
  const has = (x) => x in idx;
  if (!b || typeof b !== 'object') return { ok: false, errors: ['answer is not a JSON object'], warnings };
  if (b.contract !== 'A1RecipeBoardBrief/v1') err('contract must be "A1RecipeBoardBrief/v1"');
  for (const k of ['logline', 'question', 'feeling', 'takeaway']) if (!String(b.film?.[k] || '').trim()) err(`film.${k} is empty`);
  if ((b.film?.logline || '').length > 60) warn(`film.logline is ${b.film.logline.length} chars; keep it to one line (<= 40)`);

  // chapters: contiguous, ordered, complete
  const ch = Array.isArray(b.chapters) ? b.chapters : [];
  if (!ch.length) err('no chapters');
  const lo = Math.max(2, Math.ceil(n / 20)), hi = Math.max(lo, Math.ceil(n / 6));
  if (ch.length && (ch.length < lo || ch.length > hi)) warn(`${ch.length} chapters for ${n} beats; usually ${lo}–${hi}`);
  let expect = 0;
  const chapterIds = new Set();
  ch.forEach((c, i) => {
    const tag = c.id || `chapter ${i + 1}`;
    if (chapterIds.has(c.id)) err(`${tag}: duplicate chapter id`); chapterIds.add(c.id);
    if (!ROLES.includes(c.role)) err(`${tag}: role "${c.role}" is not one of ${ROLES.join('/')}`);
    if (!has(c.from) || !has(c.to)) { err(`${tag}: from/to must be beat ids from the plan (got ${c.from}–${c.to})`); return; }
    if (idx[c.from] !== expect) err(`${tag}: starts at ${c.from} but the previous chapter ended before ${ids[expect] ?? 'the end'} (chapters must be contiguous and in order)`);
    if (idx[c.to] < idx[c.from]) err(`${tag}: ends before it starts`);
    expect = idx[c.to] + 1;
    if (!(Number.isInteger(c.tension) && c.tension >= 0 && c.tension <= 10)) err(`${tag}: tension must be an integer 0–10`);
    if (!['slow', 'steady', 'fast'].includes(c.pace)) err(`${tag}: pace must be slow/steady/fast`);
    if (!HEX.test(c.accent || '')) err(`${tag}: accent must be #RRGGBB`);
    for (const k of ['title', 'purpose', 'look']) if (!String(c[k] || '').trim()) err(`${tag}: ${k} is empty`);
  });
  if (ch.length && expect !== n) err(`chapters stop at ${ids[expect - 1]}; ${n - expect} beats are not in any chapter`);
  if (ch.length && ch[0].role !== 'hook') err('the first chapter must be the hook');
  if (ch.length && !ch.some((c) => c.role === 'climax')) err('no climax chapter');
  if (ch.length > 2) {
    const t = ch.map((c) => c.tension);
    if (new Set(t).size === 1) err('tension is flat across chapters; the film needs a curve');
    const peak = ch[t.indexOf(Math.max(...t))];
    if (peak.role !== 'climax') warn(`highest tension is ${peak.id} (${peak.role}), not the climax chapter`);
    if (t[t.length - 1] >= Math.max(...t)) warn('the last chapter is as tense as the peak; the ending has no release');
  }
  const accents = new Set(ch.map((c) => (c.accent || '').toLowerCase()));
  if (accents.size > 3) warn(`${accents.size} chapter accents; keep the film to 3 or fewer`);
  const chapterOf = (beat) => ch.find((c) => has(c.from) && has(c.to) && idx[beat] >= idx[c.from] && idx[beat] <= idx[c.to])?.id;

  // motif
  const ap = b.motif?.appears || [];
  for (const k of ['name', 'idea', 'visual']) if (!String(b.motif?.[k] || '').trim()) err(`motif.${k} is empty`);
  for (const k of ['what', 'queryEn', 'lines']) if (!String(b.motif?.broll?.[k] || '').trim()) err(`motif.broll.${k} is empty (name the one real b-roll the film keeps cutting back to)`);
  if (ap.length < 3) err(`motif appears ${ap.length} times; it needs at least 3`);
  ap.forEach((a) => {
    if (!has(a.beat)) err(`motif: beat ${a.beat} is not in the plan`);
    else if (chapterOf(a.beat) !== a.chapter) err(`motif: beat ${a.beat} is in ${chapterOf(a.beat)}, not ${a.chapter}`);
    if (!String(a.state || '').trim()) err(`motif at ${a.beat}: state is empty`);
  });
  if (new Set(ap.map((a) => a.chapter)).size < Math.min(3, ch.length)) warn('the motif should appear in at least 3 different chapters');

  // rhythm and restraint
  const br = b.rhythm?.breathingBeats || [];
  br.filter((x) => !has(x)).forEach((x) => err(`rhythm.breathingBeats: ${x} is not in the plan`));
  const ratio = br.length / n;
  if (ratio < 0.15 || ratio > 0.33) warn(`breathing beats are ${Math.round(ratio * 100)}% of the film; aim for 20–25%`);
  if (![30, 60].includes(b.rhythm?.fps)) err('rhythm.fps must be 30 or 60');
  if (!(b.rhythm?.bpm >= 60 && b.rhythm?.bpm <= 140)) err('rhythm.bpm must be 60–140');

  // style
  for (const k of ['medium', 'typeOn', 'annotation', 'color', 'transition', 'motion']) if (!String(b.style?.sixCell?.[k] || '').trim()) err(`style.sixCell.${k} is empty`);
  for (const k of ['base', 'ink', 'accent']) if (!HEX.test(b.style?.palette?.[k] || '')) err(`style.palette.${k} must be #RRGGBB`);
  // the film's own world (look.mjs makes its theme from it): checked when given, missing means the project theme
  if (b.style?.world) errors.push(...checkWorld(b.style.world));
  else warn('style.world is missing: the film keeps the project theme instead of its own look');
  // the 3D shots (teardown / scene) live in the same world: a film that has them says how they look (stage.mjs reads it)
  const st = b.style?.stage;
  if (plan.beats.some((x) => STAGE_INTENTS.includes(x.intent)) && !st) err('style.stage is missing: the plan has teardown / scene beats; say how the 3D shots sit in the film\'s world');
  if (st) {
    if (!String(st.look || '').trim()) err('style.stage.look is empty');
    if (st.subject && !STAGE_SUBJECT.includes(st.subject)) err(`style.stage.subject must be one of ${STAGE_SUBJECT.join(' / ')}`);
    if (st.sceneMedium && !STAGE_MEDIA.includes(st.sceneMedium)) err(`style.stage.sceneMedium must be one of ${STAGE_MEDIA.join(' / ')}`);
  }

  // hero moments, medium accents, callbacks
  const hero = b.heroMoments || [];
  const heroMax = Math.max(3, Math.floor(n * 0.15));
  if (hero.length < 3) err(`${hero.length} hero moments; pick at least 3`);
  if (hero.length > Math.max(8, heroMax)) err(`${hero.length} hero moments; at most ${Math.max(8, heroMax)} — restraint makes them land`);
  hero.forEach((h) => { if (!has(h.beat)) err(`heroMoments: ${h.beat} is not in the plan`); if (!String(h.treatment || '').trim()) err(`heroMoments ${h.beat}: treatment is empty`); });
  if (new Set(hero.map((h) => h.beat)).size !== hero.length) err('heroMoments: the same beat twice');
  const med = b.mediumShots || [];
  med.filter((x) => !has(x)).forEach((x) => err(`mediumShots: ${x} is not in the plan`));
  if (med.length > Math.floor(n * 0.15)) err(`${med.length} medium shots; at most ${Math.floor(n * 0.15)} (the medium is an accent)`);
  const intentOf = Object.fromEntries(plan.beats.map((x) => [x.id, x.intent]));
  med.filter((x) => ['presenter-plain', 'atmosphere', 'table', 'chat'].includes(intentOf[x])).forEach((x) => warn(`mediumShots: ${x} is ${intentOf[x]}; the medium is meant for titles, chapter openers and reveals`));
  (b.callbacks || []).forEach((c) => {
    if (!has(c.from) || !has(c.to)) err(`callbacks: ${c.from} → ${c.to} uses beats not in the plan`);
    else if (idx[c.from] >= idx[c.to]) err(`callbacks: ${c.from} must come before ${c.to}`);
  });
  // a beat cannot be both empty (breathing) and carry a designed moment
  const breathing = new Set(br);
  hero.filter((h) => breathing.has(h.beat)).forEach((h) => err(`${h.beat} is a hero moment and a breathing beat; it cannot be both`));
  (b.callbacks || []).filter((c) => breathing.has(c.to)).forEach((c) => warn(`callback ${c.from} → ${c.to} lands on a breathing beat; the payoff needs a picture`));
  med.filter((x) => breathing.has(x)).forEach((x) => err(`${x} is a medium shot and a breathing beat`));
  // breathing is for lines with nothing real to show (treatment ladder, prompts/visual-director.md)
  const beatOf = Object.fromEntries(plan.beats.map((x) => [x.id, x]));
  br.filter((x) => beatOf[x]).forEach((x) => {
    const named = (beatOf[x].entities || []).filter((e) => e.needsSource && e.kind !== 'number').map((e) => e.name);
    if (named.length) warn(`${x} is a breathing beat but names ${named.slice(0, 3).join('、')}; that line should show evidence`);
  });
  if ((b.banned || []).length < 5) err(`banned has ${(b.banned || []).length} items; at least 5`);
  return { ok: !errors.length, errors, warnings };
}

// Where the brief stands: none | waiting (task written, no answer) | rejected | current | stale.
export function briefState(cfg, id) {
  const plan = readPlan(cfg, id);
  if (!plan) return { state: 'none' };
  const hash = planHash(plan);
  const brief = readJson(briefFile(cfg, id));
  const answer = readAnswer(cfg, id, STEP);
  if (brief && brief.planHash === hash && (!answer || brief.answerHash === sha(JSON.stringify(answer)))) return { state: 'current', brief };
  const check = readJson(taskPaths(cfg, id, STEP).check);
  if (answer && check && check.answerHash === sha(JSON.stringify(answer)) && !check.ok) return { state: 'rejected', check };
  return { state: brief ? 'stale' : 'waiting', brief };
}

// One pass of the step: accept a checked answer, or write the task (and run the backend when it is unattended).
export async function stepBrief(cfg, id, { log = () => {}, agent = null } = {}) {
  const plan = readPlan(cfg, id);
  if (!plan) throw new Error(`${id} has no plan`);
  const hash = planHash(plan);
  const current = readJson(briefFile(cfg, id));
  const pending = readAnswer(cfg, id, STEP);
  // current = written for this plan, and no newer answer is waiting to be checked
  if (current?.planHash === hash && (!pending || current.answerHash === sha(JSON.stringify(pending)))) return { state: 'current' };
  const task = readTask(cfg, id, STEP);
  if (!task || task.planHash !== hash) writeTask(cfg, id, STEP, { planHash: hash, rules: RULES, schema: SCHEMA, input: buildBriefInput(cfg, id) });
  let answer = readAnswer(cfg, id, STEP);
  const backend = agent || agentFor(cfg, id, STEP);
  if (!answer && backend === 'codex') {
    // Codex answers, the line checks; a rejected answer goes back with its errors (up to 3 rounds).
    for (let round = 1; round <= 3; round++) {
      log(`brief: asking Codex (round ${round})`);
      const t = readTask(cfg, id, STEP);
      const errs = answer ? checkBrief(plan, answer, { filmStyle: briefStyle(cfg, loadProject(cfg, id)) }).errors : null;
      answer = await runCodexTask(cfg, STEP, errs ? { ...t, input: { ...t.input, previousAnswer: answer, checkErrors: errs } } : t, 'contract');
      writeAnswer(cfg, id, STEP, answer);
      const r = checkBrief(plan, answer, { filmStyle: briefStyle(cfg, loadProject(cfg, id)) });
      log(`brief: round ${round}: ${r.errors.length} errors, ${r.warnings.length} warnings`);
      if (r.ok) break;
    }
  }
  if (!answer) return { state: 'waiting', task: taskPaths(cfg, id, STEP).task };
  const result = checkBrief(plan, answer, { filmStyle: briefStyle(cfg, loadProject(cfg, id)) });
  writeCheck(cfg, id, STEP, { answerHash: sha(JSON.stringify(answer)), planHash: hash, ...result });
  if (!result.ok) return { state: 'rejected', ...result };
  const brief = { ...answer, planHash: hash, answerHash: sha(JSON.stringify(answer)), acceptedAt: new Date().toISOString(), agent: backend };
  fs.writeFileSync(briefFile(cfg, id), JSON.stringify(brief, null, 2) + '\n');
  fs.writeFileSync(path.join(projectPaths(cfg, id).root, 'brief.md'), briefMarkdown(plan, brief));
  return { state: 'accepted', warnings: result.warnings };
}

// Readable version for review (projects/<id>/brief.md).
export function briefMarkdown(plan, b) {
  const beat = Object.fromEntries(plan.beats.map((x) => [x.id, x]));
  const short = (id) => `${id}「${(beat[id]?.onScreen?.headline || beat[id]?.text || '').replace(/\n/g, ' ').slice(0, 18)}」`;
  const bar = (t) => '█'.repeat(t) + '·'.repeat(10 - t);
  const L = [];
  L.push(`# 导演简报：${plan.title || ''}`, '', `> ${b.film.logline}`, '');
  L.push(`- **推动全片的问题**：${b.film.question}`, `- **观众的感受**：${b.film.feeling}`, `- **看完带走**：${b.film.takeaway}`, '');
  L.push('## 章节和张力', '', '| 章 | 角色 | 拍 | 张力 | 节奏 | 强调色 | 做什么 | 画面基调 |', '|---|---|---|---|---|---|---|---|');
  for (const c of b.chapters) {
    const count = plan.beats.findIndex((x) => x.id === c.to) - plan.beats.findIndex((x) => x.id === c.from) + 1;
    L.push(`| ${c.id} ${c.title} | ${c.role} | ${c.from}–${c.to}（${count}） | \`${bar(c.tension)}\` ${c.tension} | ${c.pace} | \`${c.accent}\` | ${c.purpose} | ${c.look} |`);
  }
  L.push('', `## 母题：${b.motif.name}`, '', `${b.motif.idea}`, '', `画面：${b.motif.visual}`, '', ...(b.motif.broll ? [`空镜母题：${b.motif.broll.what}（${b.motif.broll.queryEn}）——${b.motif.broll.lines}`, ''] : []));
  for (const a of b.motif.appears) L.push(`- ${a.chapter} · ${short(a.beat)}：${a.state}`);
  L.push('', '## 高光', '');
  for (const h of b.heroMoments) L.push(`- **${short(h.beat)}** — ${h.why}。处理：${h.treatment}`);
  L.push('', '## 前后呼应', '');
  for (const c of b.callbacks) L.push(`- ${short(c.from)} → ${short(c.to)}：${c.what}`);
  L.push('', '## 节奏', '', `${b.rhythm.fps} fps · ${b.rhythm.bpm} BPM（每拍 ${Math.round(b.rhythm.fps * 60 / b.rhythm.bpm * 10) / 10} 帧）。${b.rhythm.notes}`, '',
    `留白 ${b.rhythm.breathingBeats.length} 拍（${Math.round(b.rhythm.breathingBeats.length / plan.beats.length * 100)}%）：${b.rhythm.breathingBeats.join(' ')}`, '');
  L.push('## 风格', '', `主题 \`${b.style.theme}\` · 底色 \`${b.style.palette.base}\` · 字色 \`${b.style.palette.ink}\` · 强调 \`${b.style.palette.accent}\` · ${b.style.typography}`, '',
    '| 介质 | 出字 | 标注 | 色彩 | 转场 | 运动 |', '|---|---|---|---|---|---|',
    `| ${['medium', 'typeOn', 'annotation', 'color', 'transition', 'motion'].map((k) => b.style.sixCell[k]).join(' | ')} |`, '');
  if (b.style.world) L.push(`全片世界：${b.style.world.base} 底 · 标题字 ${b.style.world.display} · 纹理 ${(b.style.world.texture || []).join('、') || '无'} · 介质 ${b.style.world.medium || '跟底'}`, '');
  if (b.style.stage) L.push(`3D 镜头：${b.style.stage.look}（拆解底 \`${b.style.stage.subject || '跟底色'}\` · 场景介质 \`${b.style.stage.sceneMedium || 'film'}\`）`, '');
  L.push(`介质镜头：${b.mediumShots.length ? b.mediumShots.map(short).join('、') : '无'}`, '');
  L.push('## 禁用', '', ...b.banned.map((x) => `- ${x}`), '', '## 事实风险', '', ...b.risks.map((x) => `- ${x}`), '');
  L.push(`---`, `计划指纹 \`${b.planHash}\` · 由 ${b.agent} 写 · ${b.acceptedAt}`, '');
  return L.join('\n');
}
