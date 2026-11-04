// Design before code (the user 2026-10-27: 背景铁锈不好 梳理一下为什么做那么不成熟 … 导演如何更智能 设计如何更好;
// then: 先做设计先行（每拍设计简报+样张+品味评审）、构图语法库、背景和主体分离的量尺). A chapter on a design-first
// profile (profile.mjs designFirst) is designed before it is written, and its frames are judged for taste before it is
// accepted:
//   1. design-<chapter>: the director's brief, beat by beat — the one picture that tells the line, the composition taken
//      from the grammar (routing/compositions.json), its focus, its ground as a place of the story's world (one place a
//      chapter), the colour roles, the type, and the other composition weighed and why not. Checked by code (briefErrors);
//      the chapter's module is written only from an accepted brief (it comes into the morph task as input.brief).
//   2. taste-<chapter>: once the module passes the rule checks, its keyframes (the style frames) go with the compositions'
//      exemplar frames and the user's turned-down looks to a reviewer who did not write it (prompts/taste.md); a chapter
//      is accepted only when every beat scores 3 or more and the mean 3.5 or more (tasteErrors).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { projectPaths } from './store.mjs';
import { loadDirectorRoutes, pickDirectorDefaults } from './directorroutes.mjs';
import { designDensityErrors } from './design-density.mjs';
import { frameDesignErrors, momentMixErrors } from './framedesign.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const designStep = (g) => `design-${g.id}`;
export const tasteStep = (g) => `taste-${g.id}`;
export const TASTE_PASS = 3, TASTE_MEAN = 3.5;
export const loadCompositions = (cfg) => readJson(path.join(cfg.dataDir, 'routing', 'compositions.json'), { compositions: [], grounds: {} });

// HOUSE「文案→包装」default stack: prefer these ten; evidence shots default to evidence-card.
export const PACKAGING_COMPOSITIONS = Object.freeze([
  'hero-object', 'map-table', 'count-field', 'figure-card', 'sequence-line',
  'evidence-card', 'split-compare', 'globe-route', 'queue', 'title-footage',
]);
export const EVIDENCE_DEFAULT_COMPOSITION = 'evidence-card';

/** (pure) order compositions for a beat: ten preferred first; director-routes default (or evidence → evidence-card) leads. */
export function compositionShortlistForBeat(compositions = [], beat = {}, { table = null } = {}) {
  const byId = new Map((compositions || []).map((c) => [c.id, c]));
  const prefer = PACKAGING_COMPOSITIONS.filter((id) => byId.has(id));
  const rest = (compositions || []).filter((c) => !PACKAGING_COMPOSITIONS.includes(c.id));
  let ordered = [...prefer.map((id) => byId.get(id)), ...rest];
  let leadId = beat?.defaultComposition || null;
  if (!leadId && table) {
    const pick = pickDirectorDefaults(beat, { table });
    if (pick.composition) leadId = pick.composition;
  }
  if (!leadId && (beat?.medium === 'evidence' || beat?.treatment === 'evidence' || beat?.routeKind === 'evidence')) {
    leadId = EVIDENCE_DEFAULT_COMPOSITION;
  }
  if (leadId && byId.has(leadId)) {
    const lead = byId.get(leadId);
    ordered = [lead, ...ordered.filter((c) => c.id !== leadId)];
  }
  return ordered;
}


// (pure) the brief against the grammar: a composition of the library for every beat, a picture said in words, a focus,
// a ground of a known kind and one place for the chapter (a turn may change it once, saying so), the type, and another
// composition weighed with why it lost
const TWO = /[和與与、及跟同]|以及|还有|還有/;
export function briefErrors(answer, beats, lib) {
  const ids = new Set((lib.compositions || []).map((c) => c.id)), kinds = new Set((lib.grounds?.kinds || []).map((k) => String(k).split(':')[0].trim()));
  const e = [], rows = answer?.beats || [];
  for (const b of beats) {
    const r = rows.find((x) => x.beat === b), tag = `brief.${b}`;
    if (!r) { e.push(`${tag}: no design for this beat`); continue; }
    // (the grammar is where a design starts, not a fence: a composition of the designer's own is "custom", its picture
    // told in full — the user 2026-10-27: 确定画风和喜欢的风格后不限制你发挥 你还是要做顶级视觉包装师)
    if (!ids.has(r.composition) && r.composition !== 'custom') e.push(`${tag}.composition: "${r.composition}" is not in the grammar (${[...ids].join(', ')}), nor "custom" (a composition of your own)`);
    if (r.composition === 'custom' && String(r.picture || '').trim().length < 24) e.push(`${tag}.picture: a composition of your own is told in full (what is on screen, where, how big, what moves)`);
    if (String(r.picture || '').trim().length < 8) e.push(`${tag}.picture: say the one picture that tells this line (what is on screen, where, how big)`);
    if (!String(r.focus || '').trim()) e.push(`${tag}.focus: name the one thing looked at`);
    if (!kinds.has(r.ground?.kind) && r.ground?.kind !== 'custom') e.push(`${tag}.ground.kind: one of ${[...kinds].join(', ')}, or "custom" (a ground of your own, told in ground.how)`);
    if (r.ground?.kind === 'custom' && String(r.ground?.how || '').trim().length < 12) e.push(`${tag}.ground.how: a ground of your own is told (what it is, how it is lit, what grain)`);
    if (String(r.ground?.place || '').trim().length < 2) e.push(`${tag}.ground.place: the place of the story's world it is (the chart table, the night desert, the ship's deck)`);
    if (/鐵鏽|铁锈|rust wall|corrugat|毛氈|毛毡|felt|木紋|木纹|wood grain/i.test(`${r.ground?.place} ${r.ground?.how || ''}`) && !r.ground?.isSubject) e.push(`${tag}.ground: a patterned surface (rust, felt, wood) behind a subject competes with it; the ground is a quiet place (compositions.json grounds.rule)`);
    if (!r.alternative?.composition || String(r.alternative?.why || '').trim().length < 6) e.push(`${tag}.alternative: weigh another composition and say why it lost`);
    if (String(r.type || '').trim().length < 2) e.push(`${tag}.type: how its words stand (a pair beside the subject, a label on its point, a block)`);
    // said before any code (the blind reviews kept finding these after the render: two things in one frame, the red in
    // several places, single words scattered over the frame)
    if (!String(r.subject || '').trim() || TWO.test(r.subject)) e.push(`${tag}.subject: the one thing this beat shows ("${r.subject || ''}"): one noun; two subjects are two beats`);
    if (r.accentOn != null && TWO.test(r.accentOn)) e.push(`${tag}.accentOn: the red on one thing ("${r.accentOn}"), not two`);
    const W = Array.isArray(r.words) ? r.words : null;
    if (!W) e.push(`${tag}.words: the words on screen, each { big, small, role: pair | label | block }`);
    else {
      const heads = W.filter((w) => w.role === 'pair' || w.role === 'block'), labels = W.filter((w) => w.role === 'label');
      if (heads.length > 1) e.push(`${tag}.words: ${heads.length} pairs or blocks in one beat (one at most: the beat's one line)`);
      if (labels.length > 2) e.push(`${tag}.words: ${labels.length} labels (two at most, each on its point): more read as words scattered over the frame`);
      for (const w of W) { if (w.role === 'pair' && !String(w.small || '').trim()) e.push(`${tag}.words: "${w.big}" is set as a pair with no small line`); if (w.role === 'label' && [...String(w.big || '')].filter((ch) => !/[0-9.,%]/.test(ch)).length > 6) e.push(`${tag}.words: the label "${w.big}" is long for a name on a point (six characters at most, figures aside; a line is a pair)`); }
    }
  }
  // one place a chapter: a change only on a beat that says it is a turn
  const places = rows.filter((r) => beats.includes(r.beat)).map((r) => ({ b: r.beat, p: String(r.ground?.place || '').trim(), turn: !!r.ground?.turn }));
  const changes = places.filter((x, i) => i > 0 && x.p !== places[i - 1].p && !x.turn);
  if (changes.length) e.push(`brief: the chapter changes its place without a turn at ${changes.map((x) => x.b).join(', ')} (one place a chapter; a turn says ground.turn: true and why)`);
  // a shot is a run of visible events, not a still with a caption (L131; silent for legacy briefs without a state plan)
  e.push(...frameDesignErrors(rows));
  e.push(...momentMixErrors(rows, beats));
  e.push(...designDensityErrors(rows));
  return e;
}

export function designTask(cfg, id, g, { palette = null, profile = null, taste = [], film = null } = {}) {
  const lib = loadCompositions(cfg);
  const filmBy = Object.fromEntries((film?.beats || []).map((r) => [r.beat, r]));
  const table = loadDirectorRoutes(cfg);
  // HOUSE「文案→包装」: prefer the ten; director-routes pick defaults per beat (evidence → always evidence-card)
  const compositions = compositionShortlistForBeat(lib.compositions, {}, { table });
  const beats = g.shots.map((s) => {
    const f = filmBy[s.shotId] || {};
    const seed = {
      beat: s.shotId,
      text: s.text,
      act: f.act || null,
      medium: f.medium || null,
      hero: f.hero === true,
    };
    const pick = pickDirectorDefaults(seed, { table });
    const defaultComposition = pick.composition
      || (f.medium === 'evidence' ? EVIDENCE_DEFAULT_COMPOSITION : null);
    return {
      beat: s.shotId,
      text: s.text,
      at: s.at,
      dur: s.dur,
      storyboard: s.design || null,
      medium: f.medium || null,
      routeKind: pick.kind,
      defaultComposition,
      defaultDevices: pick.devices,
      chapterPaths: pick.chapterPaths,
    };
  });
  // lead shared catalog: first beat with a route default, else evidence-card if any evidence
  const leadBeat = beats.find((b) => b.defaultComposition) || (beats.some((b) => b.medium === 'evidence') ? { medium: 'evidence' } : {});
  const comps = compositionShortlistForBeat(lib.compositions, leadBeat, { table });
  return {
    rules: 'work/recipe-board-v1/prompts/beatdesign.md', schema: 'work/recipe-board-v1/routing/beatdesign.schema.json',
    input: {
      chapter: g.id,
      beats,
      compositions: comps.length ? comps : compositions,
      packagingCompositions: [...PACKAGING_COMPOSITIONS],
      evidenceDefaultComposition: EVIDENCE_DEFAULT_COMPOSITION,
      directorRoutes: 'work/recipe-board-v1/routing/director-routes.json',
      grounds: lib.grounds,
      palette,
      profile: profile?.id || null,
      turnedDown: taste,
      film,
      rubric: rubric(cfg),
    },   // film: what these beats are to the whole film (filmdesign.mjs)
  };
}

// a composition's exemplar frames, extracted once (paperclip-138@56 -> its frame at 56 s; gawx:<file> -> that still)
export function exemplarFrames(cfg, refs) {
  const out = [], dir = path.join(cfg.dataDir, 'style-lab', 'compositions'); fs.mkdirSync(dir, { recursive: true });
  for (const ref of refs) {
    let m = /^paperclip-138@(\d+(?:\.\d+)?)$/.exec(ref);
    if (m) { const f = path.join(dir, `paperclip-138-${m[1]}.jpg`); if (!fs.existsSync(f)) try { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', m[1], '-i', path.join(cfg.dataDir, 'projects', 'paperclip-138', 'reference', 'vol138.mp4'), '-frames:v', '1', '-vf', 'scale=960:-2', f]); } catch { continue; } if (fs.existsSync(f)) out.push(f); continue; }
    m = /^gawx:(.+)$/.exec(ref);
    if (m) { const f = path.join(cfg.sourceRoot || cfg.repoRoot, 'work', 'style-research', 'gawx-frame-study-2026-09-18', 'frames', m[1]); if (fs.existsSync(f)) out.push(f); }
  }
  return out;
}

export function tasteTask(cfg, id, g, { brief, keyframes, answerHash, taste = [] }) {
  const lib = loadCompositions(cfg), used = [...new Set((brief?.beats || []).map((b) => b.composition))];
  const refs = used.flatMap((c) => (lib.compositions.find((x) => x.id === c)?.exemplars || []).slice(0, 2));
  const exemplars = exemplarFrames(cfg, refs);
  return {
    rules: 'work/recipe-board-v1/prompts/taste.md', schema: 'work/recipe-board-v1/routing/taste-review.schema.json', forAnswer: answerHash, reviewers: TASTE_REVIEWERS, answers: ['answer.json', 'answer-2.json'],
    input: { chapter: g.id, beats: g.shots.map((s, k) => ({ beat: s.shotId, text: s.text, keyframe: k + 1, brief: (brief?.beats || []).find((b) => b.beat === s.shotId) || null })), compositions: lib.compositions.filter((c) => used.includes(c.id)), grounds: lib.grounds, turnedDown: taste, images: `前 ${keyframes.length} 张是这一章各拍的样张（关键帧，按拍的顺序）；后 ${exemplars.length} 张是它用到的构图的范例（成熟片子的画面）` },
    images: [...keyframes, ...exemplars],
  };
}

// (pure) the taste review's verdict: every beat 3 or more, the mean 3.5 or more; what it says is the next round's work
export function tasteErrors(answer) {
  const beats = answer?.beats || [];
  if (!beats.length) return ['taste: the review scored no beat'];
  const mean = beats.reduce((a, b) => a + (b.score || 0), 0) / beats.length, out = [];
  for (const b of beats) if ((b.score || 0) < TASTE_PASS) out.push(`${b.beat}: taste ${b.score} — ${b.issue || 'below the bar'}`);
  if (mean < TASTE_MEAN) out.push(`taste: mean ${mean.toFixed(2)} (at least ${TASTE_MEAN})${answer.overall ? ` — ${answer.overall}` : ''}`);
  return out;
}

// (pure) two blind reviews read as one: each beat's score the mean of the two (one reviewer's score swung a point between
// two rounds of the same frames, Suez B12 3.5 then 2.5); the issues of both kept
export const TASTE_REVIEWERS = 2;
export function mergeTaste(answers) {
  const got = answers.filter((a) => a?.beats?.length);
  if (got.length < 2) return got[0] || null;
  const ids = got[0].beats.map((b) => b.beat);
  return {
    beats: ids.map((id) => { const rows = got.map((a) => a.beats.find((b) => b.beat === id)).filter(Boolean); return { beat: id, score: rows.reduce((x, r) => x + (r.score || 0), 0) / rows.length, issue: rows.map((r) => r.issue).filter(Boolean).join(' / ') || null }; }),
    overall: got.map((a) => a.overall).filter(Boolean).join(' / '),
  };
}
// (pure, tested) the review's scores round by round, and the beats that stopped moving: a beat below 4 whose score stood
// still over the last rounds is not held by its layout but by what the reviewers keep naming — its material or an
// ability the line lacks (Suez's stills, rounds 8 to 11: 3, 4, 3, 4 four times while the layout was reworked each round;
// the user 2026-10-27: 返工次数有点太多). history: [{ answer, scores: { B01: 3 } }]
export function withScores(history = [], answerHash, review) {
  if (!review?.beats?.length || history.at(-1)?.answer === answerHash) return history;
  return [...history, { answer: answerHash, scores: Object.fromEntries(review.beats.map((b) => [b.beat, b.score])), issues: Object.fromEntries(review.beats.map((b) => [b.beat, String(b.issue || '').slice(0, 300)])) }].slice(-8);
}
export function stalledBeats(history = [], { rounds = 2, good = 4 } = {}) {
  if (history.length < rounds + 1) return [];
  const last = history.slice(-(rounds + 1));
  return Object.keys(last.at(-1).scores).filter((b) => { const v = last.map((h) => h.scores[b]); return v.every((x) => x != null && x === v[0]) && v[0] < good; })
    .map((b) => ({ beat: b, score: last.at(-1).scores[b], rounds: last.length, named: last.map((h) => h.issues?.[b]).filter(Boolean).at(-1) || '' }));
}
export const briefHash = (answer) => sha(JSON.stringify(answer?.beats || []));
// (pure) a map chapter: half its beats or more designed on a mono composition (map-table, globe-route) or standing on
// the chart (ground chart-table: the ship and the boxes on the chart are a map chapter's too)
export function monoChapter(brief, lib) {
  const mono = new Set((lib?.compositions || []).filter((c) => c.palette === 'mono').map((c) => c.id)), rows = brief?.beats || [];
  return rows.length > 0 && rows.filter((r) => mono.has(r.composition) || r.ground?.kind === 'chart-table').length * 2 >= rows.length;
}
// (pure) a chapter that returns to the place of the chapter before it on purpose: both briefs open on the same place
// (the closing chart table rhyming the opening one); the same-ground check steps aside for a callback the brief chose
export function callbackGround(brief, prevBrief) {
  const at = (b) => String(b?.beats?.[0]?.ground?.place || '').trim(), last = (b) => String(b?.beats?.[(b?.beats?.length || 1) - 1]?.ground?.place || '').trim();
  return !!(at(brief) && (at(brief) === last(prevBrief) || at(brief) === at(prevBrief)));
}
// the reviewers' rubric, handed to whoever writes the brief or the stills: one source for what is made and what is judged
// (prompts/taste.md, film-taste.md: their scored criteria, word for word)
export function rubric(cfg) {
  const read = (f) => { try { return fs.readFileSync(path.join(cfg.dataDir, 'prompts', f), 'utf8').split('\n').filter((l) => /^- `[a-zA-Z]+`：/.test(l)).map((l) => l.slice(2)); } catch { return []; } };
  return { beat: read('taste.md'), film: read('film-taste.md') };
}
export const turnedDownLooks = (cfg) => loadCompositions(cfg).turnedDown || [];   // (the user's verdicts on frames: compositions.json turnedDown)

// the brief step of a chapter: its task (always the current input), its answer checked; returns the accepted brief or
// what it waits on. The check binds the answer it read, so a new answer is checked again
export async function stepBrief(cfg, id, g, { palette = null, profile = null } = {}) {
  const { writeTask, readAnswer, writeCheck, taskPaths } = await import('./agenttask.mjs');
  const step = designStep(g), tp = taskPaths(cfg, id, step);
  const { acceptedFilmDesign, filmRows, filmAccent } = await import('./filmdesign.mjs');
  writeTask(cfg, id, step, designTask(cfg, id, g, { palette, profile, taste: turnedDownLooks(cfg), film: filmRows(acceptedFilmDesign(cfg, id), g.shots.map((s) => s.shotId), filmAccent(cfg, id), (await import('./palettes.mjs')).loadPalettes(cfg)) }));
  const answer = readAnswer(cfg, id, step);
  if (!answer) return { state: 'waiting', step };
  const h = sha(fs.readFileSync(tp.answer, 'utf8')), errors = briefErrors(answer, g.shots.map((s) => s.shotId), loadCompositions(cfg));
  writeCheck(cfg, id, step, { ok: !errors.length, errors, answerHash: h });
  return errors.length ? { state: 'rejected', step, errors } : { state: 'accepted', step, brief: answer };
}
// the brief the chapter is written from: its answer, checked and unchanged since
export function acceptedBrief(cfg, id, g) {
  const dir = path.join(projectPaths(cfg, id).root, 'tasks'), a = path.join(dir, `${designStep(g)}.answer.json`), c = readJson(path.join(dir, `${designStep(g)}.check.json`));
  if (!c?.ok || !fs.existsSync(a) || c.answerHash !== sha(fs.readFileSync(a, 'utf8'))) return null;
  return readJson(a);
}
// the taste gate of a chapter whose module passed its rules: the review of these keyframes, or the task for it
export async function tasteGate(cfg, id, g, { keyframes, answerHash }) {
  const { writeTask, readTask, readAnswer, taskPaths } = await import('./agenttask.mjs');
  const step = tasteStep(g), tp = taskPaths(cfg, id, step), task = readTask(cfg, id, step);
  // the film before its beats: on a six-stage film the beats' taste waits for one review of the whole white model
  // (filmdesign.mjs filmFirstDue; the user 2026-10-28: 客观觉得怎么做最好)
  { const F = await import('./filmdesign.mjs'); if (F.filmFirstDue(cfg, id)) return { pending: F.FILM_TASTE_STEP }; }
  // two reviewers, each blind to the other: <step>.answer.json and <step>.answer-2.json, both newer than the task
  const files = [tp.answer, tp.answer.replace(/\.answer\.json$/, '.answer-2.json')].slice(0, TASTE_REVIEWERS);
  const fresh = (f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > fs.statSync(tp.task).mtimeMs;
  const answered = task?.forAnswer === answerHash && files.every(fresh);
  // the beats' roads to 4 go with the task (reviewlist.mjs): both reviewers check the same list
  const RL = await import('./reviewlist.mjs');
  // answers given to an earlier version and not read before it changed still settle their lists (the chapter's review does
  // the same: Suez B02's taste answers would have been lost to the next version, 2026-10-28)
  const C0 = await import('./chapter.mjs'), printOf0 = (b) => { const f = keyframes[g.shots.findIndex((s) => s.shotId === b)]; return f && fs.existsSync(f) ? C0.picPrint(f) : null; };
  if (!answered && task && task.forAnswer !== answerHash && files.every(fresh) && !RL.wasRead(tp.task, RL.answersKey(files))) { const old = files.map((f) => readJson(f)), m = mergeTaste(old); if (m?.beats?.length) { for (const b of m.beats) Object.assign(b, RL.mergeBeat(old.map((a) => a?.beats?.find((x) => x.beat === b.beat))) || {}); RL.settleFrames(tp.task, task.lists || {}, m.beats, 4, (await import('./reviewrules.mjs')).readLessons(cfg)); } }
  // (a task asked about other lists is written again: the lists are what its reviewers check)
  const lists0 = RL.openLists(RL.readLists(tp.task), RL.readPassed(tp.task), printOf0, (a, b) => C0.samePrints([a], [b])), listsMoved = !!task && !answered && JSON.stringify(task.lists || {}) !== JSON.stringify(lists0);
  if (!answered) { if (task?.forAnswer !== answerHash || listsMoved) { const lists = lists0, t = tasteTask(cfg, id, g, { brief: acceptedBrief(cfg, id, g), keyframes, answerHash, taste: turnedDownLooks(cfg) }); writeTask(cfg, id, step, { ...t, lists, input: { ...t.input, images: t.input.images + RL.listNote(lists, { passed: RL.gatePassed(tp.task) }) } }); } return { pending: step }; }
  const answers = files.map((f) => readJson(f)), answer = mergeTaste(answers);
  RL.markRead(tp.task, RL.answersKey(files));
  for (const b of answer?.beats || []) Object.assign(b, RL.mergeBeat(answers.map((a) => a?.beats?.find((x) => x.beat === b.beat))) || {});
  // the scores per answer kept beside the task (the stalled beats are logged: Suez B02's style frames 3.0-3.44 round
  // after round while each pair of reviewers named other faults, 2026-10-27)
  const hf = tp.task.replace(/\.task\.json$/, '.scores.json'), history = withScores(readJson(hf) || [], answerHash, answer);
  fs.writeFileSync(hf, JSON.stringify(history, null, 1) + '\n');
  // settled against the lists the task asked about; a list that stuck goes to the arbiter (arbiter.mjs), whose ruling is
  // binding — the director no longer waives a stalled taste review (the user 2026-10-28: 按复盘先做), it may appeal
  const C = await import('./chapter.mjs'), printOf = (b) => { const f = keyframes[g.shots.findIndex((s) => s.shotId === b)]; return f && fs.existsSync(f) ? C.picPrint(f) : null; };
  const held = RL.holdPassed(answer.beats, RL.readPassed(tp.task), printOf, (a, b) => C.samePrints([a], [b]));
  const passedOnce = RL.gatePassed(tp.task) && !tasteErrors(answer).length, { lists } = RL.settleFrames(tp.task, task?.lists || {}, answer.beats, 4, (await import('./reviewrules.mjs')).readLessons(cfg), { newLists: !passedOnce }), { arbitrate, applyRulings, readAppeals } = await import('./arbiter.mjs');
  // passedOnce: a gate that passed before and passes again opens no new list (a version that fails it does); the arbiter
  // only for a gate that fails (a passing one closes its lists below; an appeal still goes)
  const appeals = readAppeals(path.dirname(tp.task), step), due = tasteErrors(answer).length ? RL.arbiterDue(lists, appeals) : [].concat(Object.keys(appeals).filter((b) => lists[b]?.items?.length)), rulings = [];
  if (due.length) {
    const chap = readJson(path.join(path.dirname(tp.task), `morph-${g.id}.check.json`))?.review?.frames || [];
    const ar = await arbitrate(cfg, id, step, { forAnswer: answerHash, beats: due.map((b) => ({ beat: b, text: g.shots.find((s) => s.shotId === b)?.text || '', list: lists[b], appeal: appeals[b] || null, words: { taste: answer.beats.find((x) => x.beat === b)?.issue || '', chapter: chap.find((f) => f.beat === b)?.issue || '' } })), images: due.map((b) => keyframes[g.shots.findIndex((s) => s.shotId === b)]).filter(Boolean), note: '附图：这几拍的样张（关键帧），每拍一张，按上面的顺序；没有对标图' });
    if (ar.pending) return { pending: ar.pending, review: answer };
    RL.recordPassed(tp.task, ar.rulings, printOf);
    RL.writeLists(tp.task, applyRulings(ar.rulings, answer.beats, lists, 4)); rulings.push(...answer.beats.filter((b) => b.arbitrated));
  }
  answer.mean = answer.beats.reduce((a, b) => a + (b.score || 0), 0) / Math.max(1, answer.beats.length);
  // a gate passes once: its open lists close as notes (reviewlist.mjs closeGate)
  const closed = tasteErrors(answer).length ? [] : RL.closeGate(tp.task, RL.readLists(tp.task), answer.mean);
  return { ...(closed.length ? { closed } : {}), errors: tasteErrors(answer), review: answer, stalled: stalledBeats(history), ...(rulings.length ? { arbitrated: rulings.map((b) => ({ beat: b.beat, ...b.arbitrated })) } : {}), ...(held.length ? { held } : {}) };
}
