import { assertScopeAllows } from './project-scope.mjs';
// Chapters: a run of beats explained by one continuous diagram (card morph-chapter) instead of a card per beat. The
// beats stay shots of their own (review, motion, reel as usual); the picture under them is one animation, written as a
// scene module for style-lab templates/morph.js by an agent, and each shot plays its own stretch of it.
//   1. group: consecutive shots on morph-chapter are one chapter, named by its first shot (B07 -> morph-B07);
//   2. task: tasks/morph-B07.task.json (the beats with their times, the film's palette and style, the rules
//      prompts/morph.md, a worked example); any agent writes tasks/morph-B07.answer.json = { code };
//   3. checks, before it is accepted: the code (no network, no imports, the exports), then the module run in the page:
//      its beats on the chapter's times, a keyframe at the end of each beat, the type it draws (in frame, clear of
//      the subtitles, readable, every number from the chapter's text);
//   4. review: a reviewer who did not write it (a fresh subagent: agents.default manual; no Codex, the user 2026-10-21)
//      looks at the keyframes beside their lines and scores them; a weak frame sends the module back
//      (its issues become the next round's checkErrors, three rounds a run at most);
//   5. accepted: projects/<id>/chapters/<B07>.mjs, rendered once (style-lab director/make.mjs, cached), and each shot's
//      background becomes its slice of the clip { video: { path, in, out } }.
import crypto from 'node:crypto';
import { moduleImageKeys } from './assetoperations.mjs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import { captureLayoutPreflight } from './layoutpreflight.mjs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { assertRenderStorage, loadShots, projectPaths, readPlan, loadProject } from './store.mjs';
import { filmLook, readWorld, readStyle } from './filmlook.mjs';
import { keyframesFor, boardPlans } from './keyframes.mjs';
import { writeTask, readTask, readAnswer, writeCheck, taskPaths, agentFor, runCodexTask, writerSubmissionStatus, reviewSubmissionStatus } from './agenttask.mjs';
import { needKey, sameSubject, changedNeeds, bindingMatchesForm } from './materials.mjs';
import { referenceTiming, referenceCutAt } from './reference.mjs';
import { pool } from './pool.mjs';
import { sixStage, polishOpen, finalAllowsOf, userLockedOf, chapterStartPinErrors, designSet } from './gatestate.mjs';
import { matureFirstDraftErrors } from './mature.mjs';
import { loadChapterMotionContract, buildChapterMotionContract, motionContractUneatenErrors, motionContractSummary, motionRuntimeEvidence, previewDeliveryErrors, previewPreflightErrors, writePreviewBind, writePreviewPreflight, poseFromScaleContinuityErrors, cameraGrammarErrors, resolveGateProfile, GATE_PROFILE_ROUGH, pureTimeErrors, ensurePreviewStillsFromMp4, referenceComparisonErrors, scopedPoseReviewErrors } from './shotmotion.mjs';
import { partitionRoughCutWarns, versionTrapErrors, resolveEffort, effortDelivery } from './p1hard.mjs';
import { organicMultiViewErrors } from './p1hard.mjs';
import { withoutSection } from './reviewrules.mjs';
import * as GB from './greybox.mjs';
import { listNote, readLists, writeLists, settleFrames, arbiterDue, markRead, wasRead, answersKey } from './reviewlist.mjs';
import { arbitrate, applyRulings, readAppeals } from './arbiter.mjs';
import { loadPalettes } from './palettes.mjs';
import { chapterGuidance, planBeatsOf } from './techniques.mjs';
import { loadDirectorRoutes, pickDirectorDefaults } from './directorroutes.mjs';
import { routeErrors, selectedDeviceKitErrors, loadKitSymbolIndex, breakdownFor, cueErrors, deviceCues, chapterFollowErrors, loadDevices, planErrors, referenceLook, referencePaths, storyboardDeviceErrors, storyboardFormErrors, contentStateCarryErrors } from './refbreakdown.mjs';
import { profileGaps, profileVideo, referenceProfile, window as profileWindow } from './refprofile.mjs';
import { voiceState, voiceCueSchedule } from './voice.mjs';
import { beatStats, languageGaps, loadChapterLanguage, languageBrief } from './chapterlang.mjs';
import { stepBrief, acceptedBrief, tasteGate, monoChapter, loadCompositions, callbackGround } from './beatdesign.mjs';
import { stepFilmDesign, acceptedFilmDesign, filmRows, filmFollowErrors, filmAccent, FILM_STEP, groundTintErrors, colourScript } from './filmdesign.mjs';
import { profileRuleScope, profileOf, typeDensityErrors, surfaceTypeErrors, lowKeyErrors, colourErrors, pairErrors, surfaceReadErrors, figureGroundErrors } from './profile.mjs';
import { assetReviewStatus, ensureReviewTask } from '../../../../../work/recipe-board-v1/style-lab/engine/blender/asset_review.mjs';

export const CHAPTER_CARD = 'morph-chapter';
const RULES = 'work/recipe-board-v1/prompts/morph.md', SCHEMA = 'work/recipe-board-v1/routing/morph.schema.json';
// CAMERA.md as a machine-readable grammar (routing/camera-grammar.json): the chapter's motion contract is checked
// against it before the module renders (cameraGrammarErrors in shotmotion.mjs).
const CAMERA_GRAMMAR_PATH = 'work/recipe-board-v1/routing/camera-grammar.json';
const loadCameraGrammar = (cfg) => { try { return JSON.parse(fs.readFileSync(path.join(engineRoot(cfg), CAMERA_GRAMMAR_PATH), 'utf8')); } catch { return null; } };
const REVIEW_RULES = 'work/recipe-board-v1/prompts/morph-review.md', REVIEW_SCHEMA = 'work/recipe-board-v1/routing/morph-review.schema.json';
const ENGINE = 'work/recipe-board-v1/style-lab/engine';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); };
import { redesignedBeats, readBudgetTrackErrors } from './storyboard.mjs';
import { lookdevReferenceErrors } from './lookdev.mjs';
export const stepOf = (g) => `morph-${g.id}`;
export function chapterRedesignPending(cfg, id, g) {
  const pending = new Set(redesignedBeats(cfg, id));
  return g.shots.map((s) => s.shotId).filter((shot) => pending.has(shot));
}
// the subtitle band, one number for the whole line (framecheck LIMITS.bottom, the type bible's grid.band, TYPE.md, HOUSE.md: 935;
// the chapters alone kept 860 from 2026-10-20 and a label the bible set at 887 failed here, 2026-10-28)
export const SUB_BAND = 935;
const engineRoot = (cfg) => cfg.sourceRoot || cfg.repoRoot;

// ---------------------------------------------------------------- 1. chapters
// an earlier draft stays over a new one only when it reviewed strictly better: on a tie the new version, which answers
// the review's notes and which its neighbours were written against, goes in (paperclip B10 kept its old draft at an
// equal 3.5 and B18, written after the new one, no longer joined it)
// each beat's line, with the screen's script, for the page: where.said(word) times a line on its words (cueTimingErrors)
// the spots where.place chose for a module over its whole span (morph.js __placeSolve), kept beside its code: every render
// of that code uses them (a spot chosen frame by frame hopped)
const placesFile = (cfg, id, g, code) => path.join(outDir(cfg, id, g), `places-${sha(code).slice(0, 12)}.json`);
export const chapterPlaces = (cfg, id, g, code) => readJson(placesFile(cfg, id, g, code), {});
export async function chapterLines(g) {
  const H = await import('./house.mjs'), texts = g.shots.map((s) => s.text || ''), hant = H.traditionalOn() ? H.toHant(texts) : texts;
  return g.shots.map((s, i) => ({ beat: s.shotId, at: s.at, dur: s.dur, text: texts[i], hant: hant[i] }));
}
// a film set by the type bible (TYPE.md, project.json typeBible) is measured by it: its grid and pairs stand in for the
// profile's free-type rarity and pairing, which had sent the key figures onto the moving 3D world (2026-10-28)
// (the chapters and the hero stills alike: the stills went unmeasured, 2026-10-28) each beat's settled frame against the
// type bible, in a film set by it
export async function bibleKeyErrors(cfg, id, g, keyframes, { taskMode = 'motion' } = {}) {
  const { requiresEventContract } = await import('./directorroutes.mjs');
  const scoped = taskMode === 'stills' ? g.shots.map(s => ({ beat: s.shotId })) : (filmRows(acceptedFilmDesign(cfg, id), g.shots.map(s => s.shotId)) || []).filter(r => requiresEventContract(r) && r.directorIntent?.layers?.type !== 'none');
  const fontErrors = [];
  if (scoped.length) {
    const T = await import('./typepreflight.mjs');
    for (const row of scoped) {
      const file = (keyframes || []).find(f => f.endsWith(`-${row.beat}.png`));
      const measured = file ? readJson(file.replace(/\.png$/, '.shapes.json')) : null, drawn = measured?.drawn;
      const actualFonts = (measured?.fontBindings || []).map(f => ({ family: f.family, path: f.file }));
      for (const d of drawn || []) {
        const binding = measured?.fontBindings?.find(f => f.family === d.face);
        if (!binding?.hash || !fs.existsSync(binding.file) || sha(fs.readFileSync(binding.file)) !== binding.hash) fontErrors.push(`${row.beat}: stale or missing measured font binding: ${d.face}`);
        if (!measured?.fontLoads?.some(f => f.family === d.face && f.status === 'loaded')) fontErrors.push(`${row.beat}: type preflight font not loaded in browser: ${d.face}`);
      }
      fontErrors.push(...T.measuredFontErrors(drawn, actualFonts).map(e => `${row.beat}: ${e}`));
    }
  }
  if (!bibleSet(cfg, id) || !keyframes?.length) return fontErrors;
  const TB = await import('./typebible.mjs'), B = TB.loadBible(cfg), H1 = await import('./house.mjs'), out = [...fontErrors];
  for (const f of keyframes) { const m = /key-\d+-(B\d+)\.png$/.exec(f), sj = readJson(f.replace(/\.png$/, '.shapes.json')), s = g.shots.find((x) => x.shotId === m?.[1]);
    if (m && sj?.drawn) out.push(...TB.typeBibleErrors(sj.drawn, B, m[1], H1.traditionalOn() ? H1.toHant([s?.text || ''])[0] : s?.text || '')); }
  return out;
}
// every moment of the chapter against the bible's standing rules (typebible.mjs trackBibleErrors; the user 2026-10-28:
// 为什么检查不出来 — one settled frame a beat let a pair drift apart after it and never saw a label that came later)
export async function bibleTrackErrors(cfg, id, shots, track, { taskMode = 'motion' } = {}) {
  if (!bibleSet(cfg, id) || !track?.length) return [];
  const TB = await import('./typebible.mjs'), H1 = await import('./house.mjs');
  // (a line held over from the beat before is said in it: the narration read is the two beats')
  const said = (s) => { const i = shots.indexOf(s), t = `${shots[i - 1]?.text || ''}${s?.text || ''}`; return H1.traditionalOn() ? H1.toHant([t])[0] : t; };
  return [...TB.trackBibleErrors(track, shots, TB.loadBible(cfg), said), ...(taskMode === 'stills' ? [] : TB.readTimeErrors(track, TB.loadBible(cfg)))];
}
export const bibleSet = (cfg, id) => { try { return !!(loadProject(cfg, id) || {}).typeBible; } catch { return false; } };
export function keepEarlierDraft(was, draft, hash) {
  return !!(draft && was?.draft && was.inputHash === hash && (was.review?.mean ?? -1) > draft.mean);
}

export function chapterGroups(cfg, id, shots = loadShots(cfg, id), plan = readPlan(cfg, id)) {
  const byId = Object.fromEntries(shots.map((s) => [s.shotId, s]));
  const order = plan?.beats?.length ? plan.beats.map((b) => b.id).filter((x) => byId[x]) : shots.map((s) => s.shotId);
  const beat = (x) => (plan?.beats || []).find((b) => b.id === x) || {};
  // a beat that opens an accepted chapter (chapters/<beat>.json, its first shot) keeps opening it: a new chapter beat
  // planned next to it joins the chapter before, it does not fuse two accepted chapters into one module (B09 put on
  // the chapter card between B07-B08 and B10-B16, 2026-10-22). To merge them on purpose, remove the later record.
  let root = null; try { root = projectPaths(cfg, id).root; } catch { /* shots handed in for a project with no folder: no records */ }
  const opens = (x) => !!root && readJson(path.join(root, 'chapters', `${x}.json`), null)?.shots?.[0] === x;
  const groups = [];
  let cur = null;
  for (const x of order) {
    const s = byId[x];
    if (s.recipe !== CHAPTER_CARD) { cur = null; continue; }
    if (cur && opens(x)) cur = null;
    if (!cur) { cur = { id: x, shots: [], total: 0 }; groups.push(cur); }
    const dur = +(s.motion?.duration || 5), b = beat(x);
    cur.shots.push({ shotId: x, text: b.text || s.subtitle || '', headline: b.onScreen?.headline || '', keywords: b.onScreen?.keywords || [], at: +cur.total.toFixed(3), dur });
    cur.total = +(cur.total + dur).toFixed(3);
  }
  return groups;
}

// the beats the film's design makes a moment of type or a data card (filmdesign.mjs medium type | evidence): a frame of
// big words on a designed ground by intention, so the single beat's rules for diagram beats (big type a rare event,
// words on things, a subject lit off its ground, the look's ground edge to edge) leave it; the film measures its rarity
export function designedTypeBeats(cfg, id, g) {
  return new Set((filmRows(acceptedFilmDesign(cfg, id), g.shots.map((s) => s.shotId)) || []).filter((r) => r.medium === 'type' || r.medium === 'evidence' || r.hero).map((r) => r.beat));
}
// (a hero moment, filmdesign hero, is one too: big type over its picture is what it is for — a mask, a title over footage)
const leaving = (beats) => (errs) => errs.filter((e) => !beats.has(String(e).split(':')[0]));
const onPicture = (beats) => (errs) => errs.filter((e) => !(beats.has(String(e).split(':')[0]) && /sits on a picture it does not belong to/.test(e)));
// the hero stills (stills.mjs) are a sampler of designed moments, not a chapter: the chapter-wide shares (words on
// things, a family of colour, low key) are the chapters' to keep
const sampler = (g) => (errs) => (g.id === 'STILLS' ? errs.filter((e) => !String(e).startsWith('STILLS:') && !/the picture empties (at its start|before the beat ends)/.test(e)) : errs);   // (and the seams: the stills are moments apart, not one take)

// every beat of the film in order on the film's clock, the cards with the chapters (the whole film's design: filmdesign.mjs)
export function filmBeats(cfg, id, shots = loadShots(cfg, id), plan = readPlan(cfg, id)) {
  const byId = Object.fromEntries(shots.map((s) => [s.shotId, s])), order = plan?.beats?.length ? plan.beats.map((b) => b.id).filter((x) => byId[x]) : shots.map((s) => s.shotId);
  const beat = (x) => (plan?.beats || []).find((b) => b.id === x) || {}, groups = chapterGroups(cfg, id, shots, plan), chapterOf = Object.fromEntries(groups.flatMap((g) => g.shots.map((s) => [s.shotId, g.id])));
  let t = 0; return order.map((x) => { const s = byId[x], dur = +(s.motion?.duration || 5), r = { beat: x, chapter: chapterOf[x] || null, kind: s.recipe === CHAPTER_CARD ? 'chapter' : s.recipe || 'card', text: beat(x).text || s.subtitle || '', at: +t.toFixed(3), dur }; t += dur; return r; });
}

const designOf = (sb, beat) => {
  const d = (sb?.shots || []).find((x) => x.beat === beat);
  if (!d) return {};
  const out = { design: { why: d.why, hero: d.hero, secondary: d.secondary, motifState: d.motifState || undefined, ...(d.reads?.length ? { reads: d.reads } : {}), ...(d.diagram ? { diagram: d.diagram } : {}) } };
  return JSON.parse(JSON.stringify(out));
};
function referenceChapter(cfg, id, g) {
  let best = null;
  for (const o of chapterGroups(cfg, id)) {
    if (o.id === g.id) continue;
    const rec = readJson(path.join(chapterDir(cfg, id, o), `${o.id}.json`)), mod = path.join(chapterDir(cfg, id, o), `${o.id}.mjs`);
    if (!rec || rec.draft || !fs.existsSync(mod)) continue;
    const mean = rec.review?.mean ?? 0;
    if (!best || mean > best.mean) best = { chapter: o.id, mean, code: fs.readFileSync(mod, 'utf8') };
  }
  return best ? { reference: { chapter: best.chapter, reviewMean: best.mean, code: best.code } } : {};
}
// the film's style (project.json style -> routing/styles.json; the same sheet the cards read): colours, texture, how plates
// are painted, the camera's temper, the faces. A chapter draws in it (morph.js -> kit2 setStyle) instead of keeping
// Vol.138's red on dark grey (the user 2026-10-26: 美学风格呢 之后如何做变体). null: no style named, as before
export function filmStyle(cfg, id) {
  let p = {}; try { p = loadProject(cfg, id) || {}; } catch { return null; }
  const st = readStyle(cfg, p.style);   // (a film's own world too: filmlook.mjs readStyle)
  return st ? { id: p.style, title: st.title, family: st.theme, tokens: st.tokens, fonts: st.fonts, texture: st.texture, art: st.art, camera: st.camera } : null;
}
// the design brain's plan for the film's chapters (designbrain.mjs): the world's palette family and, per chapter, its
// member, its ground and the beats where the ground may turn; written to projects/<id>/design.json, the same every run
// for the same film (a six-stage film with a style; older films have none)
export async function designPlan(cfg, id) {
  const p = loadProject(cfg, id) || {}, st = filmStyle(cfg, id); if (!sixStageOf(p) || !st?.tokens) return null;
  const D = await loadDesignBrain();
  const sb = readJson(path.join(projectPaths(cfg, id).root, 'storyboard.json'), null), act = Object.fromEntries((sb?.shots || []).map((s) => [s.beat, s.act]));
  const chapters = chapterGroups(cfg, id).map((x) => ({ id: x.id, acts: x.shots.map((s) => act[s.shotId]).filter(Boolean), beats: x.shots.map((s) => ({ id: s.shotId, act: act[s.shotId] || null })) }));
  const family = D.paletteFamily({ ground: st.tokens.paper, ink: st.tokens.ink, accent: st.tokens.accent }).filter((v) => !D.harmonyErrors(v).length);
  const P = profileOf(cfg, id);
  const plan = { contract: 'A1RecipeBoardDesign/v1', style: p.style, profile: P.id, family, chapters: D.assignVariants(chapters, family, { lowKey: !!P.lowKey }) };
  writeJson(path.join(projectPaths(cfg, id).root, 'design.json'), plan); return plan;
}
const sixStageOf = (p) => p?.process === 'six-stage';
let DB = null;
export async function loadDesignBrain() { DB ||= await import('./designbrain.mjs'); return DB; }
// Every dispatched chapter names the exact house, routing and design state it inherited.
// Missing files are explicit, rather than silently borrowing a different checkout's rules.
export function chapterInheritance(cfg, id, chapter = null) {
  const root = projectPaths(cfg, id).root, p = loadProject(cfg, id) || {};
  const sources = ['HOUSE.md', 'TYPE.md', 'prompts/morph.md', 'routing/morph.schema.json', 'routing/house-rules.json', 'routing/house-style.json', 'routing/palettes.json', 'routing/media.json', 'routing/director-routes.json', 'routing/engine-capabilities.json', 'routing/compositions.json', 'routing/devices.json', 'routing/lessons.json', 'routing/tells.json', 'routing/mature-first-draft.json', 'routing/shot-motion-contract.schema.json'];
  const files = Object.fromEntries(sources.map((f) => { const local = path.join(cfg.dataDir, f), source = cfg.sourceRoot && path.join(cfg.sourceRoot, 'work/recipe-board-v1', f), file = fs.existsSync(local) ? local : source && fs.existsSync(source) ? source : null; return [f, file ? sha(fs.readFileSync(file)) : null]; }));
  for (const f of ['AGENTS.md', 'SOP.md', '.codex/skills/recipe-board-director/SKILL.md']) {
    const local = path.join(cfg.repoRoot, f), fallback = cfg.sourceRoot && path.join(cfg.sourceRoot, f);
    const file = fs.existsSync(local) ? local : fallback;
    files[`repo:${f}`] = file && fs.existsSync(file) ? sha(fs.readFileSync(file)) : null;
  }
  const gb = GB.approvedGreybox(cfg, id);
  return { contract: 'A1ChapterInheritance/v1', files, greyboxState: gb.state, design: p.design?.approved ? { greybox: p.design.greybox || null, board: p.design.board || null, style: p.design.style || null } : null,
    storyboard: fs.existsSync(path.join(root, 'storyboard.json')) ? sha(fs.readFileSync(path.join(root, 'storyboard.json'))) : null,
    filmDesign: fs.existsSync(path.join(root, 'tasks', 'filmdesign.answer.json')) ? sha(fs.readFileSync(path.join(root, 'tasks', 'filmdesign.answer.json'))) : null,
    directorGuide: chapter && fs.existsSync(path.join(root, 'tasks', `session-${chapter}.md`)) ? sha(fs.readFileSync(path.join(root, 'tasks', `session-${chapter}.md`))) : null };
}
// Explicit local file/image references only; prose, remote URLs and generated asset keys
// are not evidence of a file having been inspected. No new manifest or approval is created.
export function productionInputPaths(cfg, id, value, keys = ['file', 'image', 'frame']) {
  const root = projectPaths(cfg, id).root, refs = new Set();
  const walk = (value, key = '') => {
    if (Array.isArray(value)) { value.forEach((v) => walk(v, key)); return; }
    if (value && typeof value === 'object') { for (const [k, v] of Object.entries(value)) walk(v, k); return; }
    if (typeof value !== 'string' || !keys.includes(key) || /^(?:https?:|data:)/i.test(value)) return;
    if (key !== 'file' && !/\.(?:png|jpe?g|webp|pdf|mp4)$/i.test(value)) return;
    refs.add(path.isAbsolute(value) ? value : path.resolve(value.startsWith('work/') ? cfg.repoRoot : root, value));
  };
  walk(value);
  return [...refs].sort();
}
export function productionInputFiles(cfg, id, input) {
  const files = [...productionInputPaths(cfg, id, [input.userLocked, input.greybox, input.assets]), ...productionInputPaths(cfg, id, input.guidance, ['frame', 'image'])];
  return [...new Set(files)].sort().map((file) => {
    try { return { file, hash: sha(fs.readFileSync(file)) }; } catch { return { file, hash: null }; }
  });
}
export function chapterInput(cfg, id, g) {
  const brief = readJson(path.join(projectPaths(cfg, id).root, 'brief.json'), null);
  const sb = readJson(path.join(projectPaths(cfg, id).root, 'storyboard.json'), null);
  let palette = null;
  try { palette = brief?.style?.palette || null; } catch { /* no brief */ }
  const fs0 = filmStyle(cfg, id); if (fs0) palette = { base: fs0.tokens.paper, ink: fs0.tokens.ink, accent: fs0.tokens.accent };   // the film's style over the brief's palette
  const example = path.join(engineRoot(cfg), ENGINE, 'templates', 'morph', 'dna.js');
  const example3d = path.join(engineRoot(cfg), ENGINE, 'templates', 'morph', 'citymap.js');
  const exampleKits = path.join(engineRoot(cfg), ENGINE, 'templates', 'morph', 'kits.js');
  const input = {
    chapter: g.id, total: g.total,
    inheritance: chapterInheritance(cfg, id, g.id),
    // what the storyboard decided for each beat (the director's form, figure and camera, the hero move, the motif's
    // state): the chapter is built from it, not re-invented from the words (the director said "diagram-build" while
    // the writer, seeing only the text, drew a flat thin-line helix: paperclip-138-full B07)
    beats: g.shots.map((s) => ({ id: s.shotId, at: s.at, dur: s.dur, text: s.text, headline: s.headline, keywords: s.keywords, ...designOf(sb, s.shotId) })),
    // the approved greybox of these beats (greybox.mjs greyboxFor: blocks, the type as placed, the camera, the seam out): the
    // chapter is built to it and measured against it (greyboxDriftErrors)
    greybox: GB.greyboxFor(cfg, id, g.shots.map((s) => s.shotId)),
    // A1ShotMotionContract/v1 hard input (session-*.motion.json or built from greybox + §0.7)
    ...(() => {
      const existing = loadChapterMotionContract(cfg, id, g.id);
      if (existing?.shots?.length) {
        return { motionContract: existing, motionContractSummary: motionContractSummary(existing) };
      }
      const rows = GB.greyboxFor(cfg, id, g.shots.map((s) => s.shotId)) || [];
      const mdPath = path.join(projectPaths(cfg, id).root, 'tasks', `session-${g.id}.md`);
      const sessionMd = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : null;
      const built = buildChapterMotionContract({ chapter: g.id, project: id, greyboxRows: rows, sessionMd, filmDesign: acceptedFilmDesign(cfg, id) });
      return built?.shots?.length ? { motionContract: built, motionContractSummary: motionContractSummary(built) } : {};
    })(),
    // what the user approved or liked in these beats, kept as it is (gatestate.mjs userLockedOf; morph.md 35h)
    ...(userLockedOf(loadProject(cfg, id), g.shots.map((s) => s.shotId)) ? { userLocked: userLockedOf(loadProject(cfg, id), g.shots.map((s) => s.shotId)) } : {}),
    // the film's look sheet when the user picked a world (filmLook: worlds/<id>.json look); otherwise as before
    palette: fs0 ? { bg: fs0.tokens.paper, ink: fs0.tokens.ink, accent: fs0.tokens.accent } : filmLook(cfg, id).picked ? filmLook(cfg, id).palette : palette ? { bg: palette.base, ink: palette.ink, accent: palette.accent } : { bg: '#191919', ink: '#dadada', accent: '#ff4a26' },
    style: brief?.style?.sixCell || null,
    world: brief?.style?.world || null,
    context: chapterContext(cfg, id, g),
    ...(() => { const m = chapterMaterials(cfg, id, g, { prepare: false }); return m.length ? { assets: m.map(({ key, what, shotId, source, file }) => ({ key, what, shotId, file, kind: 'photo', ...(source ? { source } : {}) })) } : {}; })(),
    example: fs.existsSync(example) ? fs.readFileSync(example, 'utf8') : '',
    example3d: fs.existsSync(example3d) ? fs.readFileSync(example3d, 'utf8') : '',
    // what makes a frame look generated, by name (routing/tells.json and the world's own): avoid every one
    // the ground library (routing/grounds.json): photographed text-free grounds every chapter has as images.ground_<name>
    grounds: groundLibrary(cfg).map((x) => ({ key: `ground_${x.name}`, use: x.use })),
    // the prop library (routing/props.json): many of one kind take different members (K.props(images, family, n))
    props: propLibrary(cfg).map((f) => ({ family: f.family, use: f.use, keys: Object.keys(f.members || {}).map((n) => `prop_${f.family}_${n}`) })),
    tells: [...(readJson(path.join(cfg.dataDir, 'routing', 'tells.json'), {}).tells || []), ...(readWorld(cfg, loadProject(cfg, id).world)?.tells || [])],
    // the film's reference chapter (Functional Emotions: the director paints chapter I, the other chapters are briefed
    // from it): the best accepted chapter of this film, its code as the standard for look, type and motion
    ...referenceChapter(cfg, id, g),
    // how the reference film built these lines, finely (refbreakdown.mjs: elements on their words, what carries over,
    // the idea) and the device library the chapter's plan2 names its ideas from
    ...(() => { const b = breakdownFor(cfg, id, g.shots.map((s) => s.shotId)); return b ? { breakdown: b } : {}; })(),
    // the chapter language (chapterlang.mjs, routing/chapter-language.json): what a beat is like, as ranges — the bar a
    // chapter is measured against with or without a reference (preview profile-gaps)
    // the film's style sheet: the parts' colours follow it (type.flat.COL); the module's own colours come from COL too
    filmStyle: filmStyle(cfg, id),
    // (a film designed whole: its colour script is the palette — the film rows below — not the per-chapter variant)
    design: acceptedFilmDesign(cfg, id) ? null : (() => { const d = readJson(path.join(projectPaths(cfg, id).root, 'design.json'), null); const c = d?.chapters?.find((x) => x.chapter === g.id); return c ? { ...c, family: d.family.map((v) => ({ id: v.id, tone: v.tone, ground: v.ground, ink: v.ink, accent: v.accent, why: v.why })) } : null; })(),
    language: languageBrief(loadChapterLanguage(cfg)),
    // whose way with type and light this film follows (profile.mjs; rules: prompts/morph.md 33)
    profile: profileOf(cfg, id),
    // the chapter's design brief, beat by beat (beatdesign.mjs; written before the module, rules: prompts/morph.md 37)
    ...(profileOf(cfg, id).designFirst ? { brief: acceptedBrief(cfg, id, g)?.beats || null, film: filmRows(acceptedFilmDesign(cfg, id), g.shots.map((s) => s.shotId), filmAccent(cfg, id), loadPalettes(cfg)) } : {}),
    // when a beat is flat, 2.5D or 3D (routing/forms.json, measured on the references): plan2 names each beat's form
    forms: readJson(path.join(cfg.dataDir, 'routing', 'forms.json'), {}).forms || null,
    devices: loadDevices(cfg).map(({ id: d, name, what, when, how, kit }) => ({ id: d, name, what, when, how, ...(kit ? { kit } : {}) })),
    // what each beat's narration calls for, by the devices' cues (learnt from the reference's breakdowns: what the
    // reference drew when its narration said the same kind of thing); a required cue the plan ignores fails the check
    deviceCues: deviceCues(g.shots.map((s) => ({ beat: s.shotId, text: s.text })), loadDevices(cfg)),
    // what the line learned (techniques.mjs chapterGuidance): per beat the nearest chapter beats done before for the
    // devices it calls for, with their review's score and what marked them down, and the lessons that apply; the
    // always-lessons once (the user 2026-10-27: 按你推荐的都优化好 — chapters had neither, and repeated old faults)
    // which part of the line each need goes to (routing/engine-capabilities.json routes; the user 2026-10-27: 该调用哪块就走哪块)
    routes: readJson(path.join(cfg.dataDir, 'routing', 'engine-capabilities.json'), {})?.routes || null,
    guidance: (() => { const cues = Object.fromEntries(deviceCues(g.shots.map((s) => ({ beat: s.shotId, text: s.text })), loadDevices(cfg)).map((c) => [c.beat, c.devices]));
      const chosen = Object.fromEntries(chosenDevices(cfg, id, g).map((c) => [c.beat, c.devices]));   // (the storyboard's devices too: by the cues alone a beat whose words cued nothing got no precedent)
      const film = acceptedFilmDesign(cfg, id);
      return chapterGuidance(cfg, id, g.shots.map((s) => { const row = film?.beats?.find(x => x.beat === s.shotId) || {}; const pick = pickDirectorDefaults({ ...row, text: s.text }, { table: loadDirectorRoutes(cfg), devices: loadDevices(cfg) }); return { beat: s.shotId, text: s.text, kind: pick.kind, routeResolved: !!film, composition: pick.composition || (!film ? row.composition : null), gold: pick.gold, devices: [...new Set([...(chosen[s.shotId] || []), ...(cues[s.shotId] || []), ...pick.devices])] }; })); })(),
    exampleKits: [exampleKits, exampleKits.replace(/kits\.js$/, 'helix.js'), exampleKits.replace(/kits\.js$/, 'chromosomes.js')].filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n\n// ---- next example ----\n\n'),
  };
  input.inheritance.productionFiles = productionInputFiles(cfg, id, input);
  input.inheritance.handoffGuides = guideBindings(cfg, readTask(cfg, id, stepOf(g))?.input?.handoffGuides || []);
  return input;
}

// What the chapter sits in: the film's title and the beats around it (the place and the years are often said just
// before a chapter starts: a map needs them)
export function chapterContext(cfg, id, g, plan = readPlan(cfg, id)) {
  const beats = plan?.beats || [], i = beats.findIndex((b) => b.id === g.shots[0].shotId), j = beats.findIndex((b) => b.id === g.shots.at(-1).shotId);
  const project = readJson(path.join(projectPaths(cfg, id).root, 'project.json'), {});
  return { title: project.title || '', before: i < 0 ? [] : beats.slice(Math.max(0, i - 3), i).map((b) => b.text), after: j < 0 ? [] : beats.slice(j + 1, j + 2).map((b) => b.text) };
}

// The real pictures the user confirmed for the chapter's shots (materials step bindings): the scene may show them
// (images[key]); videos stay shots of their own for now.
const IMG = /\.(png|jpe?g|webp)$/i;
const probeSeconds = (f) => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }); return Number(r.stdout) || 0; };
// A clip's own burned-in subtitles are cut off its frames before any module sees them (paperclip-138-full B36: the old
// television's frame cut CCTV's subtitle line in half; the user: 挡住字幕). A subtitle is a line of three or more
// Chinese characters read surely in the lower third of a frame (OCR, ocr.swift); the frames are cut above the highest
// such line, kept 16:9 (narrowed about the centre), when that keeps SUB_KEEP of the height. Results are kept beside
// each frame (<frame>.text.json)
export const SUB_KEEP = 0.7;
export function subtitleTop(lines) {
  const subs = lines.filter((l) => (l.confidence ?? 0) >= 0.8 && l.box?.[1] >= 0.62 && ((String(l.text).match(/[\u3400-\u9fff]/g) || []).length >= 3));
  return subs.length ? Math.min(...subs.map((l) => l.box[1])) : null;
}
export function subtitleCut(frames) {
  const tops = frames.map((f) => {
    const side = `${f}.text.json`;
    if (!fs.existsSync(side)) { const r = spawnSync('swift', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'ocr.swift'), f], { encoding: 'utf8', timeout: 120000 }); fs.writeFileSync(side, r.status ? '[]' : (r.stdout || '[]')); }
    try { return subtitleTop(JSON.parse(fs.readFileSync(side, 'utf8'))); } catch { return null; }
  }).filter((t) => t != null);
  if (!tops.length) return null;
  const top = Math.min(...tops) - 0.015;
  return top >= SUB_KEEP ? +top.toFixed(3) : null;
}
function cropAbove(f, top) {
  const o = f.replace(/\.jpg$/, `-sub${Math.round(top * 1000)}.jpg`);
  if (!fs.existsSync(o)) spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', f, '-vf', `crop=iw*${top}:ih*${top}:iw*${(1 - top) / 2}:0`, '-q:v', '2', o]);
  return fs.existsSync(o) ? o : f;
}
// where a picture comes from, as a card shows it (kit2 pageCard source: the reference marks every real page and frame):
// its credit, else its site's name (pure)
export function sourceOf(b) {
  if (b?.credit) return String(b.credit).trim();
  try { return new URL(b.url).hostname.replace(/^www\./, ''); } catch { return null; }
}
export function chapterMaterials(cfg, id, g, { prepare = true } = {}) {
  const dir = path.join(projectPaths(cfg, id).root, 'materials');
  const { needs = [] } = readJson(path.join(dir, 'needs.json'), {}), { shots = {}, superseded = {} } = readJson(path.join(dir, 'bindings.json'), {});
  const stale = new Set(changedNeeds(cfg, id));
  const counts = new Map();
  for (const n of needs) counts.set(needKey(n), (counts.get(needKey(n)) || 0) + 1);
  const unknown = new Set();
  for (const n of needs) {
    const key = needKey(n), binding = shots[key];
    if (counts.get(key) > 1) stale.add(key);
    if (!binding?.needPrint) { if (binding) unknown.add(key); continue; }
    try {
      const print = JSON.parse(binding.needPrint);
      if (Array.isArray(print) && print.length === 5) unknown.add(key);
    } catch { /* changedNeeds rejects malformed fingerprints */ }
  }
  // Unknown historical bindings may serve their own need, but cannot prove a donor match.
  const liveShots = Object.fromEntries(Object.entries(shots).filter(([key]) => !stale.has(key) && !unknown.has(key)));
  const inChapter = new Set(g.shots.map((s) => s.shotId)), out = [];
  for (const n of needs) {
    const retired = Object.keys(superseded).some(k => k.startsWith(`${needKey(n)}@`));
    const b = stale.has(needKey(n)) ? null : shots[needKey(n)] || (!retired && sameSubject(n, needs, liveShots)?.binding);
    if (!inChapter.has(n.shotId) || !b?.file || (prepare && !fs.existsSync(b.file)) || !bindingMatchesForm(n, b)) continue;
    const queryProvenance = unknown.has(needKey(n)) ? 'UNKNOWN' : undefined;
    // a confirmed clip is shown as three of its frames (images.m_<beat>_f0..f2: start, middle, end), the pictures a
    // chapter can draw (B36: CCTV's report on an old television, the picture changing as the news does)
    if (b.kind === 'video') {
      const key = `m_${needKey(n).replace(/[^\w]/g, '_')}`;
      const describe = (k) => [n.entity, n.original || n.line].filter(Boolean).join('：') + `（片段第 ${k + 1} 帧）`;
      // Status and handoff projection are read-only; extraction/OCR happens only when assets are prepared for rendering.
      if (!prepare) { for (let k = 0; k < 3; k++) out.push({ key: `${key}_f${k}`, what: describe(k), shotId: n.shotId, source: sourceOf(b), queryProvenance, file: b.file }); continue; }
      const dir = path.join(projectPaths(cfg, id).out, 'chapters', 'materials'), d = probeSeconds(b.file);
      fs.mkdirSync(dir, { recursive: true });
      const frames = [0.15, 0.5, 0.85].map((u, k) => {
        const f = path.join(dir, `${key}_f${k}-${sha(b.file + fs.statSync(b.file).size).slice(0, 8)}.jpg`);
        if (!fs.existsSync(f)) spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.max(0, d * u)), '-i', b.file, '-frames:v', '1', '-q:v', '2', f]);
        return fs.existsSync(f) ? f : null;
      });
      const cut = subtitleCut(frames.filter(Boolean));
      frames.forEach((f, k) => { if (f) out.push({ key: `${key}_f${k}`, what: describe(k), shotId: n.shotId, source: sourceOf(b), queryProvenance, file: cut ? cropAbove(f, cut) : f }); });
      continue;
    }
    if (!IMG.test(b.file)) continue;
    out.push({ key: `m_${needKey(n).replace(/[^\w]/g, '_')}`, what: [n.entity, n.original || n.what || n.frame || n.line].filter(Boolean).join('：'), shotId: n.shotId, source: sourceOf(b), queryProvenance, file: b.file });   // whose picture it is (two photographs on one beat read the same line)
    // a captured page's reading window too (its text column around the sentence, the site's furniture gone), as the cards
    // show a page: a chapter crops it to the lines that say it, not the page edge to edge (the user 2026-10-25, B04)
    const win = b.role === 'page' && b.archive?.window?.file;
    if (win && fs.existsSync(win)) out.push({ key: `m_${needKey(n).replace(/[^\w]/g, '_')}_window`, what: `${n.entity || ''}：报道的阅读窗口（正文一栏，原句「${(b.archive.window.sentence || '').slice(0, 30)}」在其中）`, shotId: n.shotId, source: sourceOf(b), queryProvenance, file: win });
  }
  return out;
}

// A revision may come as patches to the last version ({ find, replace }, each find exactly once) instead of the whole
// module: the writer then rewrites only what the review named (a round took 8 minutes writing ~400 lines again).
// A find text that misses only on spacing (the agent re-indents or joins lines) still applies when it matches once
// with any run of white space in place of its own; the patches that apply are kept even when another one misses
// (paperclip-138-full B01: one of seven patches missed and the whole round was thrown away).
export const mergeBakePatch = (previous, patch) => patch.bakes == null ? previous.bakes || [] : patch.bakes;
export function applyPatches(code, patches) {
  const errors = [];
  for (const [i, p] of (patches || []).entries()) {
    const n = p.find ? code.split(p.find).length - 1 : 0;
    if (n === 1) { code = code.replace(p.find, () => p.replace); continue; }
    if (n === 0 && p.find && p.find.trim()) {
      const re = new RegExp(p.find.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g');
      const hits = code.match(re) || [];
      if (hits.length === 1) { code = code.replace(re, () => p.replace); continue; }
    }
    errors.push(`patch ${i + 1}: its find text occurs ${n} times in the previous module (it must occur exactly once); this patch was not applied, the others were`);
  }
  return { code, errors };
}

// What the answer asks for besides its code: maps (OpenStreetMap, maps.mjs) and 示意 art (imagegen.mjs, text-free).
// Each becomes an asset { key: file } the page loads; the materials of the chapter come with them.
export const MAX_ART = 8, MAX_MAPS = 2, MAX_BAKES = 4;
// Reject the whole batch before any asset work; schema validation is not a runtime boundary.
export function bakeBatchErrors(answer) {
  const bakes = answer?.bakes;
  if (bakes == null) return [];
  if (!Array.isArray(bakes)) return ['bakes must be an array'];
  if (bakes.length > MAX_BAKES) return [`${bakes.length} bake requests; at most 4`];
  if (bakes.some(b => typeof b?.request !== 'string') || bakes.reduce((n, b) => n + Buffer.byteLength(b.request), 0) > 262144) return ['bake bounds: aggregate request bytes exceed 262144 or invalid request'];
  return [];
}
// Reuse project art without silently generating a replacement or escaping the project.
export function projectArtFile(projectRoot, file) {
  if (typeof file !== 'string' || !file || path.isAbsolute(file)) throw new Error('art file must be project-relative');
  const root = fs.realpathSync(projectRoot);
  const resolved = fs.realpathSync(path.resolve(root, file));
  const rel = path.relative(root, resolved);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel) || !fs.statSync(resolved).isFile() || !IMG.test(resolved)) {
    throw new Error('art file must be an image inside the project');
  }
  return resolved;
}
const CITY_ART = /\b(city|cityscape|town|street map|road map|aerial|skyline|urban|streets|district|map)\b|城市|街道|地图|航拍|城区/i;
// glyphs: a word's outlines from a house font for letters built in 3D (kit.blockType; the motion board B44's giant
// D N A): [{ key, text, face: 'House Sumikaku' | ... }] -> data[key] { unitsPerEm, glyphs: [{ char, d, advance }] }
export const MAX_GLYPHS = 2;
// (pure, tested) a beat the film's design makes evidence shows real evidence (the user 2026-10-28: 证据拍必须放证据; Suez B02 was
// made evidence, carried a satellite photo of the ship across the canal in its task, and showed a 3D map): the module says
// which (export const evidence = { B02: 'm_B02' }) — a real page of answer.pages or a real material of the task's assets
// (a photo, a video, a page, a screen …, not art) — and draws it (images.<key>)
export const EVIDENCE_KINDS = ['photo', 'video', 'footage', 'page', 'webpage', 'screen', 'logo', 'chart', 'paper', 'recording', 'document'];
export function evidenceErrors(code, answer, input, film, frames = null) {
  const want = (film || []).filter((r) => r.medium === 'evidence').map((r) => r.beat); if (!want.length) return [];
  const m = /export\s+const\s+evidence\s*=\s*(\{[^;]*?\})\s*;/.exec(code || ''); let map = {};
  try { map = m ? Function(`return ${m[1]}`)() || {} : {}; } catch { map = {}; }
  const mats = (input?.assets || []).filter((a) => EVIDENCE_KINDS.includes(a.kind)), real = new Set([...(answer?.pages || []).map((p) => p.key), ...mats.map((a) => a.key)]), out = [];
  for (const b of want) {
    const k = map[b], have = mats.filter((a) => a.shotId === b).map((a) => `${a.key} (${a.kind}: ${String(a.what || '').slice(0, 40)})`);
    if (!k) { out.push(`${b}: the film's design makes it evidence and the chapter shows none on it: export const evidence = { ${b}: '<key>' } and draw it — a real page (answer.pages: article, market, chat, quote) or a real material${have.length ? `; in hand: ${have.join(', ')}` : ''} (filmed on a screen: kit.engine.filmedScreen)`); continue; }
    if (!real.has(k)) { out.push(`${b}: its evidence ${k} is not a real page or a real material (art, maps and glyphs are not evidence)`); continue; }
    if (!new RegExp(`images(\\.${k}\\b|\\[['"]${k}['"]\\])`).test(code || '')) out.push(`${b}: its evidence ${k} is named but never drawn (images.${k})`);
    if (frames) {
      const frame = frames.find((f) => f.beat === b);
      const visible = frame?.shapes?.some((s) => String(s.src || s.source || '').includes(k));
      if (!visible) out.push(`${b}: evidence ${k} is not visible in the measured keyframe`);
    }
  }
  return out;
}
// A quoted piece of evidence must be checked against the original it was bound to, not only against
// the chapter's own words (Suez B02: a quote was named and drawn but never compared to the source).
const evidenceNorm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
function evidenceMapOf(code) {
  const m = /export\s+const\s+evidence\s*=\s*(\{[^;]*?\})\s*;/.exec(code || '');
  try { return m ? Function(`return ${m[1]}`)() || {} : {}; } catch { return {}; }
}
// The words a quoted evidence beat puts on screen: its exact sentence, then its source caption.
export function evidenceExpectations(code, answer = {}) {
  const map = evidenceMapOf(code), assets = new Map((answer.assets || []).map((a) => [a.key, a])), out = {};
  for (const [beat, key] of Object.entries(map)) {
    const a = assets.get(key);
    if (a?.kind !== 'text' || !String(a.quote || a.span || '').trim()) continue;
    out[beat] = [a.quote || a.span, ...(String(a.caption || '').trim() ? [a.caption] : [])];
  }
  return out;
}
// bindings: { <beat>: { kind: 'text', file, caption } } — the original the quote was taken from.
export function evidenceSourceErrors(code, answer = {}, bindings = {}) {
  const map = evidenceMapOf(code), assets = new Map((answer.assets || []).map((a) => [a.key, a])), out = [];
  for (const [beat, key] of Object.entries(map)) {
    const a = assets.get(key);
    if (a?.kind !== 'text' || !String(a.quote || a.span || '').trim()) continue;
    const b = bindings?.[beat];
    if (!b?.file) { out.push(`${beat}: its quote "${a.quote || a.span}" has no bound original (bindings.${beat}.file)`); continue; }
    let text;
    try {
      if (!/^[a-f0-9]{64}$/.test(b.sha256 || '') || crypto.createHash('sha256').update(fs.readFileSync(b.file)).digest('hex') !== b.sha256) throw new Error('hash');
      text = fs.readFileSync(b.file, 'utf8');
    } catch { out.push(`${beat}: its bound original ${b.file} cannot be read and hash-verified`); continue; }
    if (!evidenceNorm(text).includes(evidenceNorm(a.quote || a.span))) out.push(`${beat}: quote "${a.quote || a.span}" is not in the bound original (${b.file})`);
    if (a.caption && evidenceNorm(b.caption) !== evidenceNorm(a.caption)) out.push(`${beat}: caption "${a.caption}" differs from the bound original's (${b.caption || 'missing'})`);
  }
  return out;
}
export function requestErrors(answer, input) {
  const errors = bakeBatchErrors(answer), keys = new Set((input.assets || []).map((a) => a.key));
  const art = answer?.art || [], maps = answer?.maps || [], glyphs = answer?.glyphs || [];
  if (glyphs.length > MAX_GLYPHS) errors.push(`${glyphs.length} glyph requests; at most ${MAX_GLYPHS}`);
  for (const r of glyphs) {
    if (!String(r.text || '').trim() || [...String(r.text)].length > 12) errors.push(`glyphs ${r.key}: the word (text, 1-12 characters)`);
    if (!/^House [A-Z][a-z]+$/.test(r.face || '')) errors.push(`glyphs ${r.key}: face is a house font family (House Sumikaku, House Kaiso, ...)`);
  }
  if (art.length > MAX_ART) errors.push(`${art.length} art requests; at most ${MAX_ART}`);
  if (maps.length > MAX_MAPS) errors.push(`${maps.length} maps; at most ${MAX_MAPS}`);
  for (const r of [...art, ...maps, ...glyphs]) {
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(r.key || '')) errors.push(`asset key "${r.key}" must be lower case letters, digits and _ (2-31)`);
    else if (keys.has(r.key)) errors.push(`asset key "${r.key}" is used twice`);
    keys.add(r.key);
  }
  for (const r of art) if (!r.prompt || r.prompt.length < 20) errors.push(`art ${r.key}: describe the picture (prompt)`);
  for (const r of art) if (CITY_ART.test(r.prompt || '')) errors.push(`art ${r.key}: a city, its streets or a map come from maps (real OpenStreetMap streets), never from generated art (rules 7)`);
  for (const r of maps) if (!r.place) errors.push(`map ${r.key}: which place (place)`);
  return errors;
}
export const groundLibrary = (cfg) => readJson(path.join(cfg.dataDir, 'routing', 'grounds.json'), {}).grounds || [];
// the prop library (routing/props.json): families of text-free props (a scene's traces …), images.prop_<family>_<name>
export const propLibrary = (cfg) => readJson(path.join(cfg.dataDir, 'routing', 'props.json'), {}).families || [];
// the props a module names: a member (prop_trace_blood) or a whole family (K.props(images, 'trace', n))
export function propsNamed(code, lib) {
  const out = [], src = String(code || '');
  // a member is its prompt, or { prompt, transparent } for a cut-out
  for (const f of lib) for (const [name, m] of Object.entries(f.members || {}))
    if (src.includes(`prop_${f.family}_${name}`) || new RegExp(`props\\(\\s*images\\s*,\\s*['"\`]${f.family}['"\`]`).test(src)) out.push({ key: `prop_${f.family}_${name}`, prompt: typeof m === 'string' ? m : m.prompt, transparent: typeof m === 'object' && !!m.transparent });
  return out;
}
const operationHash = s => crypto.createHash('sha256').update(s).digest('hex');
const operationReceiptFile = (cfg, id, g) => path.join(projectPaths(cfg, id).root, 'out', 'asset-operations', `${g.id}.json`);
function operationProductions(cfg, answer) {
  return [
    ...(answer.art || []).filter(a => !a.file).map(a => ({ reference: `art:${a.key}`, key: a.key, prompt: a.prompt, capability: 'whole-image', consumed: moduleImageKeys(answer.code || '').has(a.key) })),
    ...modelsNamed(answer.code).map(m => ({ reference: `model:${m.name}`, file: modelFile(cfg, m.name), prompt: m.what, capability: 'mesh', consumed: true })),
  ];
}
// Labels describe actual consumed inputs, not the task being a draft/still. This is a
// disclosure only: asset-operation / evidence / fact gates remain independently hard.
export function chapterEvidenceNote(cfg, id, g, assets = {}, { taskMode = 'motion' } = {}) {
  if (!['motion', 'stills'].includes(taskMode)) throw new Error(`unknown taskMode: ${taskMode}`);
  const root = projectPaths(cfg, id).root, shots = new Set(g.shots.map(s => s.shotId));
  const bindings = Object.entries(readJson(path.join(root, 'materials', 'bindings.json'), {})?.shots || {})
    .filter(([k]) => shots.has(k.split('~')[0])).map(([, v]) => v);
  const declared = (acceptedFilmDesign(cfg, id)?.beats || []).filter(b => shots.has(b.beat)).flatMap(b => b.directorIntent?.assets || []);
  const canonical = f => { try { return fs.realpathSync(path.resolve(root, f)); } catch { return null; } };
  let real = false, generated = false, unknown = false;
  for (const file of Object.values(assets)) {
    const f = canonical(file), bound = bindings.filter(b => b.file && canonical(b.file) === f && f);
    const claims = declared.filter(a => a.file && !/^(?:module|art|model):/.test(a.file) && canonical(a.file) === f && f);
    if (/(?:^|\/)art-cache\//.test(String(file)) || bound.some(b => b.generated === true || b.source === 'generated') || claims.some(a => a.source === 'generated')) { generated = true; continue; }
    if (bound.some(b => ['unknown', 'unverified'].includes(b.source)) || claims.some(a => ['unknown', 'unverified'].includes(a.source))) { unknown = true; continue; }
    let digest; try { digest = operationHash(fs.readFileSync(file)); } catch { unknown = true; continue; }
    const verified = bound.some(b => b.weakMatch !== true && (b.url || b.credit) && (
      b.sha256 === digest || (!b.sha256 && b.url && typeof b.source === 'string' && !/(?:^|\/)art-cache\//.test(b.source) && [root, cfg.repoRoot, engineRoot(cfg)].some(base => base && fs.existsSync(path.resolve(base, b.source)))) ||
      claims.some(a => a.source === 'real' && a.use === 'evidence' && a.sha256 === digest && a.provenance && [b.url, b.credit].includes(a.provenance))
    ));
    if (verified) real = true; else unknown = true;
  }
  if (unknown) return generated ? '含示意 · 來源未核實' : '來源未核實';
  if (generated) return real ? '含示意' : '示意';
  return real ? '' : '示意'; // Code-only diagrams are not archival evidence.
}
// Read-only final revalidation. Never repin bytes here: render is not generation.
export async function chapterAssetOperationCheck(cfg, id, g, code, assets = {}) {
  const root = projectPaths(cfg, id).root, beats = acceptedFilmDesign(cfg, id)?.beats || [];
  const receipt = readJson(operationReceiptFile(cfg, id, g), {});
  const current = receipt.codeHash === operationHash(code) && receipt.designHash === operationHash(JSON.stringify(beats));
  const { assetOperationPreflight } = await import('./assetoperations.mjs');
  return assetOperationPreflight({ root, beats, code, shotIds: g.shots.map(s => s.shotId),
    bindings: readJson(path.join(root, 'materials', 'bindings.json'), {}),
    consumedFiles: [...Object.values(assets), ...modelsNamed(code).map(m => modelFile(cfg, m.name))],
    productions: current ? receipt.productions : [], resolved: current ? receipt.resolved : [],
  });
}
export function hairlineAssetKeyErrors(answer) {
  const key = answer.hairline?.key;
  if (!key) return [];
  const named = ['art', 'pages', 'maps', 'glyphs', 'bakes'].flatMap(field => (answer[field] || []).flatMap(item => field === 'maps' ? [item.key, `${item.key}Relief`, `${item.key}Sea`, `${item.key}Height`] : [item.key]));
  return named.includes(key) ? [`Hairline asset key collision: ${key}`] : [];
}
export async function prepareAssets(cfg, id, g, answer, { log = console.log, generateArt: generateArtOverride = null, taskMode = 'motion', preparedHairline = null, isolatedTarget = false } = {}) {
  // Providers and material preparation can write shared caches, model QA, OCR or
  // extracted frames. Until they have a scoped contract, do not invoke them.
  if (isolatedTarget) {
    const unsupported = answer.hairline != null || ['maps', 'glyphs', 'pages', 'bakes'].some(k => answer[k]?.length) || (answer.art || []).some(a => !a.file) || /\bworld_land\b|ground_[a-z]+/.test(String(answer.code || '')) || modelsNamed(answer.code || '').length || propsNamed(answer.code || '', propLibrary(cfg)).length || chapterMaterials(cfg, id, g, { prepare: false }).length;
    if (unsupported) return { assets: {}, errors: ['isolated target provider unavailable: scoped preparation is not supported'], notes: [] };
  }
  if (answer.hairline != null && taskMode !== 'stills') return { assets: {}, errors: ['Hairline fixed phase is only available in stills'], notes: [] };
  const collisionErrors = hairlineAssetKeyErrors(answer);
  if (collisionErrors.length) return { assets: {}, errors: collisionErrors, notes: [] };
  ensureLettering(cfg, id);
  const bakeErrors = bakeBatchErrors(answer);
  if (bakeErrors.length) return { assets: {}, errors: bakeErrors, notes: [] };
  // Fail before image generation, model QA/builds, page renders or material extraction.
  // Only explicit director asset contracts on this chapter are enrolled; legacy shots stay untouched.
  const operationRoot = projectPaths(cfg, id).root;
  const { assetOperationPreflight } = await import('./assetoperations.mjs');
  const productions = operationProductions(cfg, answer);
  const operationOptions = {
    code: answer.code || '', productions,
    root: operationRoot, beats: acceptedFilmDesign(cfg, id)?.beats || [], shotIds: g.shots.map(s => s.shotId),
    bindings: readJson(path.join(operationRoot, 'materials', 'bindings.json'), {}),
    consumedFiles: [...chapterMaterials(cfg, id, g, { prepare: false }).map(m => m.file), ...(answer.art || []).filter(a => a.file).map(a => path.resolve(operationRoot, a.file)), ...modelsNamed(answer.code).map(m => modelFile(cfg, m.name))],
  };
  const operationPreflight = await assetOperationPreflight({ ...operationOptions, phase: 'prepare' });
  const previous = readJson(operationReceiptFile(cfg, id, g), {});
  const sameProduction = previous.codeHash === operationHash(answer.code || '') && previous.designHash === operationHash(JSON.stringify(operationOptions.beats)) && JSON.stringify(previous.productions) === JSON.stringify(productions);
  if (sameProduction && previous.resolved?.length) {
    const prior = await assetOperationPreflight({ ...operationOptions, resolved: previous.resolved, consumedFiles: [...operationOptions.consumedFiles, ...previous.resolved.map(p => p.file)] });
    operationPreflight.errors.push(...prior.errors);
  }
  if (operationPreflight.errors.length) return { assets: {}, errors: operationPreflight.errors, notes: [], operationEvidence: operationPreflight.evidence };
  const assets = {}, errors = [], notes = [];
  if (answer.hairline != null) {
    try {
      const { prepareFixedHairline, consumePreparedHairline } = await import('./hairline-still.mjs');
      assets[answer.hairline.key] = preparedHairline
        ? await consumePreparedHairline(operationRoot, answer.hairline, preparedHairline)
        : (await prepareFixedHairline(operationRoot, answer.hairline)).file;
    } catch (e) { return { assets: {}, errors: [`Hairline: ${e.message}`], notes: [] }; }
  }
  for (const m of chapterMaterials(cfg, id, g)) assets[m.key] = m.file;
  // the grounds a module names (images.ground_<name>), generated once and cached by prompt
  { const used = new Set([...String(answer.code || '').matchAll(/ground_([a-z]+)/g)].map((m) => m[1])), lib = groundLibrary(cfg).filter((x) => used.has(x.name));
    if (lib.length) { const { generateArt } = await import('./imagegen.mjs');
      for (const x of lib) { try { const got = generateArt(cfg, { prompt: x.prompt, transparent: false }, { log }); assets[`ground_${x.name}`] = got.file; } catch (e) { errors.push(`ground ${x.name}: ${String(e.message || e).split('\n')[0]}`); } } } }
  { const want = propsNamed(answer.code, propLibrary(cfg));
    if (want.length) { const { generateArt } = await import('./imagegen.mjs');
      for (const x of want) { try { assets[x.key] = generateArt(cfg, { prompt: x.prompt, transparent: !!x.transparent }, { log }).file; } catch (e) { errors.push(`prop ${x.key}: ${String(e.message || e).split('\n')[0]}`); } } } }
  // the models a module names (kit.props.model): one not made yet is made here by the image-to-3D line, before the module
  // renders (the user 2026-10-27: 系统怎么能把这环节丢掉呢 — a chapter wanting a ship had no way to ask for one, so it took
  // code boxes and a web photo). Slow (minutes, one at a time), cached by its pictures.
  for (const m of modelsNamed(answer.code)) {
    if (fs.existsSync(modelFile(cfg, m.name))) {
      if (!modelProvenanceOk(modelPartsRoot(cfg), m.name)) errors.push(`model ${m.name}: existing GLB has no partset receipt; preserve it and use a new model name for image-to-3D`);
      continue;
    }
    if (!m.what) { errors.push(`model ${m.name}: not made yet, and the module does not say what it is: kit.props.model(THREE, '${m.name}', { what: '<what it is, in English, no text or logos>', … })`); continue; }
    let manifestArgs = [];
    if (m.viewsManifest) {
      try {
        const projectRoot = fs.realpathSync(projectPaths(cfg, id).root), manifest = fs.realpathSync(path.resolve(projectRoot, m.viewsManifest)), rel = path.relative(projectRoot, manifest);
        if (rel.startsWith('..' + path.sep) || rel === '..' || path.isAbsolute(rel) || !fs.statSync(manifest).isFile()) throw new Error('manifest must be a file inside this project');
        manifestArgs = ['--views', manifest];
      } catch (e) { errors.push(`model ${m.name}: selected views manifest unavailable or outside the project: ${e.message}`); continue; }
    }
    log(`  model ${m.name}: making it (image-to-3D: reference views, Hunyuan3D-2mv) …`);
    const r = spawnSync(process.execPath, [path.join(engineRoot(cfg), ENGINE, 'blender', 'partset.mjs'), m.name, m.what, ...manifestArgs], { encoding: 'utf8', timeout: 40 * 60 * 1000 });
    if (r.status !== 0 || !fs.existsSync(modelFile(cfg, m.name))) errors.push(`model ${m.name}: image-to-3D paused or failed: ${String((r.stdout || '') + (r.stderr || '')).trim().split('\n').filter((l) => /FAIL|Error|error|review required|already exists/i.test(l)).slice(-2).join(' | ') || 'no model'}`);
  }
  // an automatic subject the library does not have yet (kit.engine.subject '<id>' outside h100/hdd/drill): planned and
  // made here too, through the parts plan + multi-view image-to-3D route the card route uses (engine/build/subject.mjs).
  // The chapter says what the whole object is in answer.subjects; until the plan task is answered the chapter waits.
  // (10-29 AUDIT / T02 P1: prepareAssets used to handle only literal kit.props.model, so an auto subject could never be
  // built from a chapter.)
  {
    const partsRoot0 = modelPartsRoot(cfg), autoDir = path.join(path.dirname(partsRoot0), 'auto'), projectRoot = projectPaths(cfg, id).root;
    const declared = (() => { const v = answer.subjects, out = {}; if (Array.isArray(v)) { for (const e of v) if (e && typeof e.id === 'string' && typeof e.what === 'string') out[e.id] = e.what; } else if (v && typeof v === 'object') { for (const [k, w] of Object.entries(v)) if (typeof w === 'string') out[k] = w; } return out; })();
    for (const sid of engineSubjectNames(answer.code || '')) {
      if (['h100', 'hdd', 'drill'].includes(sid)) continue;
      if (fs.existsSync(path.join(autoDir, `${sid}.json`))) continue;   // built; subjectPipelineErrors checks every part
      const what = typeof declared[sid] === 'string' ? declared[sid].trim() : '';
      if (what.length < 8) { errors.push(`subject ${sid}: not built yet and the chapter does not say what it is: add "subjects": [{ "id": "${sid}", "what": "<what it is, in English, no text or logos>" }] to the answer — the line writes the parts-plan task and builds the parts by image-to-3D`); continue; }
      try {
        const { buildSubject } = await import(pathToFileURL(path.join(engineRoot(cfg), ENGINE, 'build', 'subject.mjs')).href);
        const r = await buildSubject(sid, what, { log: (l) => log('  ' + l), task: { cfg, project: id } });
        if (r?.waiting) errors.push(`subject ${sid}: waits for its parts plan: ${path.relative(projectRoot, r.task)} (answer it by prompts/subject.md, then re-run; the parts are built by image-to-3D and captioned 示意)`);
        else if (r?.rejected) errors.push(`subject ${sid}: its parts plan was rejected: ${(r.errors || []).join('; ')} (fix ${path.relative(projectRoot, r.task)}.answer.json and re-run)`);
        else if (!fs.existsSync(path.join(autoDir, `${sid}.json`))) errors.push(`subject ${sid}: image-to-3D did not produce subjects/auto/${sid}.json`);
      } catch (e) { errors.push(`subject ${sid}: ${String(e.message || e).split('\n')[0]}`); }
    }
  }
  // every model looked at before the chapter renders with it (modelCheck): one that does not read as what it was asked
  // to be goes back to the director now, not to the taste reviewers rounds later
  const autoPartsNamed = (() => {
    const root = modelPartsRoot(cfg), autoDir = path.join(path.dirname(root), 'auto'), out = [];
    for (const sid of engineSubjectNames(answer.code || '')) {
      if (['h100', 'hdd', 'drill'].includes(sid)) continue;
      const def = readJson(path.join(autoDir, `${sid}.json`));
      if (def?.contract !== 'A1AutoSubject/v1') continue;
      for (const name of def.files || []) out.push({ name, what: readJson(path.join(root, `${name}.request.json`))?.why?.replace(/^partset:\s*/, '') || null });
    }
    return out;
  })();
  const modelsToJudge = [...modelsNamed(answer.code), ...autoPartsNamed];
  for (const m of modelsToJudge) if (m.what && fs.existsSync(modelFile(cfg, m.name)) && modelProvenanceOk(modelPartsRoot(cfg), m.name)) {
    const q = modelCheck(cfg, m.name, m.what); if (q && !q.ok) errors.push(q.say); if (!q) errors.push(`model ${m.name}: model QA unavailable (Blender or likeness check failed); cannot accept an unjudged subject`);
    if (q?.ok && !modelVisualReviewOk(modelPartsRoot(cfg), m.name, m.what)) {
      const root = modelPartsRoot(cfg), hashes = modelReviewHashes(root, m.name, m.what), task = path.join(root, `${m.name}.visual-review.task.json`);
      const req = readJson(path.join(root, `${m.name}.request.json`));
      const references = Object.values(req?.views || (req?.image ? { single: req.image } : {})).map((f) => path.resolve(root, f));
      const mesh = readJson(path.join(root, `${m.name}.json`));
      ensureReviewTask(task, { contract: 'A1ModelVisualReviewTask/v1', hashes, what: m.what, textureCoverage: mesh?.textureCoverage || null, images: [path.join(root, `${m.name}.views`, 'sheet.jpg'), ...references], instructions: 'Independent reviewer: compare all rendered views to source references, inspect silhouette, depth, defects, materials and intended use. Unprojected texture is inferred, not observed. Technical likeness is not visual approval. Record concrete evidence and reject uncertainty.', answer: { contract: 'A1ModelVisualReviewAnswer/v1', hashes, ok: false, reviewer: '', reason: '' } });
      errors.push(`model ${m.name}: independent visual review required: ${task}`);
    }
  }
  // Explicit offline rigid-body requests use the same dispatcher as the director and the existing Blender service.
  const bakeDeadline = Date.now() + 5 * 60 * 1000;
  for (const b of answer.bakes || []) {
    try {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(b.key || '') || Object.hasOwn(assets, b.key)) throw new Error('invalid or duplicate asset key');
      if (typeof b.request !== 'string' || Buffer.byteLength(b.request, 'utf8') > 262144) throw new Error('bake bounds: request bytes exceed 262144');
      const req = JSON.parse(b.request);
      // A camera path is the second offline Blender service a chapter can ask for (the card line had it; the chapter line
      // listed the capability but only rigid bakes were reachable — T03 P2 / T00 P1). Same safety shape as a rigid bake:
      // bounded request, project-contained paths, capability dispatch, validated A1CameraPath output.
      if (b.kind === 'camera') {
        if (req.contract !== 'A1CameraRequest/v1') throw new Error('expected camera A1CameraRequest/v1 contract');
        const { validateCameraRequest, validateCameraOutput, runService, safeBakePath, atomicBakeWrite } = await import(pathToFileURL(path.join(engineRoot(cfg), ENGINE, 'blender/run.mjs')).href);
        validateCameraRequest(req);
        const { dispatchCapability } = await import('./p1hard.mjs');
        const route = dispatchCapability(readJson(path.join(cfg.dataDir, 'routing', 'engine-capabilities.json'), readJson(path.join(engineRoot(cfg), 'work/recipe-board-v1/routing/engine-capabilities.json'))), 'camera-path-bakes');
        if (!route?.chapterCallable || route.codeSymbol !== 'kit.engine.baked.camera') throw new Error('camera-path-bakes is not dispatchable');
        const { availableGb, diskError } = await import('./pool.mjs');
        const disk = diskError(); if (disk) throw new Error(disk);
        if (availableGb() < 2) throw new Error('Blender needs at least 2 GB available memory');
        const root = projectPaths(cfg, id).root, dir = path.join(outDir(cfg, id, g), 'bakes', b.key);
        const request = path.join(dir, 'request.json'), output = path.join(dir, 'path.json'), workDir = path.join(dir, 'camera.work');
        for (const f of [dir, request, output, workDir, path.join(workDir, 'request.hashed.json'), path.join(workDir, 'blender.log'), path.join(workDir, 'camera.json')]) safeBakePath(root, f);
        fs.mkdirSync(dir, { recursive: true }); atomicBakeWrite(root, request, JSON.stringify(req));
        const remaining = bakeDeadline - Date.now(); if (remaining <= 0) throw new Error('bake batch time budget exceeded');
        runService('camera', request, output, workDir, { root, timeoutMs: remaining });
        const baked = readJson(output); validateCameraOutput(baked, req);
        assets[b.key] = output;
        log(`  bake ${b.key}: camera path ${baked.frames} frames, ${baked.lensMM} mm`);
        continue;
      }
      if (b.kind !== 'rigid' || req.contract !== 'A1RigidBakeRequest/v1') throw new Error('expected rigid A1RigidBakeRequest/v1 contract');
      const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
      const opt = (obj, key, lo, hi, integer = false) => obj[key] === undefined || (num(obj[key], lo, hi) && (!integer || Number.isInteger(obj[key])));
      const vector = v => Array.isArray(v) && v.length === 3 && v.every(n => num(n, -10000, 10000));
      const obj = v => v && typeof v === 'object' && !Array.isArray(v);
      if (!opt(req, 'substeps', 1, 100, true) || !opt(req, 'iterations', 1, 100, true) || !opt(req, 'gravity', -1000, 1000) || Math.round(req.fps * req.duration) < 1) throw new Error('bake bounds: invalid simulation settings');
      if (req.ground !== undefined && (!obj(req.ground) || !opt(req.ground, 'y', -10000, 10000) || !opt(req.ground, 'friction', 0, 1) || !opt(req.ground, 'restitution', 0, 1))) throw new Error('invalid rigid request ground');
      if (req.fields !== undefined && (!Array.isArray(req.fields) || req.fields.length > 32 || req.fields.some(f => !obj(f) || !['TURBULENCE','WIND','FORCE'].includes(f.type) || (f.pos !== undefined && !vector(f.pos)) || (f.dir !== undefined && (!vector(f.dir) || f.dir.every(x => x === 0))) || !opt(f, 'size', 0, 10000) || !opt(f, 'flow', -10000, 10000) || !Array.isArray(f.keys) || f.keys.length < 1 || f.keys.length > 128 || f.keys.some(k => !Array.isArray(k) || k.length !== 2 || !num(k[0], 0, req.duration) || !num(k[1], -10000, 10000))))) throw new Error('invalid rigid request fields');
      if (Array.isArray(req.bodies) && req.bodies.some(x => !obj(x) || typeof x.name !== 'string' || x.name.length < 1 || x.name.length > 63 || (x.kind !== undefined && !['active','passive'].includes(x.kind)) || !opt(x, 'mass', 0.001, 10000) || !opt(x, 'friction', 0, 1) || !opt(x, 'restitution', 0, 1) || !opt(x, 'margin', 0, 10) || !opt(x, 'release', 0, req.duration) || (x.damping !== undefined && (!Array.isArray(x.damping) || x.damping.length !== 2 || x.damping.some(n => !num(n, 0, 1)))) || (x.velocity !== undefined && !vector(x.velocity)) || (x.spin !== undefined && !vector(x.spin)))) throw new Error('invalid rigid request body');
      if (!Number.isInteger(req.fps) || req.fps < 1 || req.fps > 60 || !Number.isFinite(req.duration) || req.duration <= 0 || req.duration > 30 || !Array.isArray(req.bodies) || !req.bodies.length || req.bodies.length > 256) throw new Error('bake bounds: fps 1–60, duration (0,30], bodies 1–256');
      const vec = v => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 10000);
      if (req.bodies.some(x => !x.name || !vec(x.pos) || !vec(x.size) || x.size.some(n => n <= 0)) || new Set(req.bodies.map(x => x.name)).size !== req.bodies.length) throw new Error('invalid body names, position or size');
      const { dispatchCapability } = await import('./p1hard.mjs');
      const route = dispatchCapability(readJson(path.join(cfg.dataDir, 'routing', 'engine-capabilities.json'), readJson(path.join(engineRoot(cfg), 'work/recipe-board-v1/routing/engine-capabilities.json'))), 'blender-bakes');
      if (!route?.chapterCallable || route.codeSymbol !== 'kit.engine.baked.rigid') throw new Error('blender-bakes is not dispatchable');
      const { availableGb, diskError } = await import('./pool.mjs');
      const disk = diskError(); if (disk) throw new Error(disk);
      if (availableGb() < 3) throw new Error('Blender needs at least 3 GB available memory');
      const { runService, safeBakePath, atomicBakeWrite, validateRigidRequest, validateRigidOutput } = await import(pathToFileURL(path.join(engineRoot(cfg), ENGINE, 'blender/run.mjs')).href);
      validateRigidRequest(req);
      const root = projectPaths(cfg, id).root;
      const dir = path.join(outDir(cfg, id, g), 'bakes', b.key), request = path.join(dir, 'request.json'), output = path.join(dir, 'bake.json');
      for (const p of [dir, request, output, `${output}.sha256`, path.join(dir,'bake.work'), path.join(dir,'bake.work','blender.log'), path.join(dir,'bake.work','request.hashed.json')]) safeBakePath(root, p);
      fs.mkdirSync(dir, { recursive: true }); atomicBakeWrite(root, request, JSON.stringify(req));
      const remaining = bakeDeadline - Date.now(); if (remaining <= 0) throw new Error('bake batch time budget exceeded');
      runService('bake', request, output, undefined, { root, timeoutMs: remaining });
      const baked = readJson(output);
      validateRigidOutput(baked, req);
      assets[b.key] = output;
      log(`  bake ${b.key}: Blender ${baked.blender}, ${baked.frames} frames`);
    } catch (e) { errors.push(`bake ${b.key}: ${String(e.message || e).split('\n')[0]}`); }
  }
  // the pages a module shows by the card line's modules (answer.pages: a captured article with its sentences marked on
  // its words, real prices drawn from the archive, a chat, a quote): rendered by the card renderer under its own checks
  // (phrases found on the page, marks measured, type sizes), then cut to a frame sequence the chapter plays
  // (images[key].frame(s)); cached by the spec and the module's code (the user 2026-10-27: 按你推荐的都优化好)
  for (const pg of answer.pages || []) {
    let spec; try { spec = JSON.parse(pg.spec); } catch (e) { errors.push(`page ${pg.key}: its spec is not JSON: ${e.message}`); continue; }
    if (!PAGE_MODULES.includes(spec.module)) { errors.push(`page ${pg.key}: module ${spec.module} is not one a chapter shows (${PAGE_MODULES.join(', ')})`); continue; }
    try {
      const M = await import('./modules.mjs'), key = sha(JSON.stringify(spec) + M.pageCode(cfg, spec.module)).slice(0, 16), dir = path.join(projectPaths(cfg, id).out, 'chapters', 'pages', key), man = path.join(dir, 'seq.json');
      if (!fs.existsSync(man)) {
        fs.mkdirSync(dir, { recursive: true });
        log(`  page ${pg.key}: rendering the ${spec.module} module …`);
        const { mp4 } = await M.renderModule(cfg, id, spec, path.join(dir, 'page'), { fps: 30, sub: 1, check: false });   // (no reference at its time: a chapter's page; the frame and mark checks still run)
        const f = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, '-vf', `fps=${PAGE_FPS},scale=1280:-2`, '-q:v', '3', path.join(dir, 'f%04d.jpg')]);
        if (f.status !== 0) throw new Error(String(f.stderr).slice(0, 200));
        writeJson(man, { contract: 'A1FrameSeq/v1', fps: PAGE_FPS, module: spec.module, frames: fs.readdirSync(dir).filter((x) => /^f\d+\.jpg$/.test(x)).sort() });
      }
      assets[pg.key] = man;
    } catch (e) { errors.push(`page ${pg.key} (${spec.module}): ${String(e.message || e).split('\n')[0]}`); }
  }
  // the world's land (geo.mjs): a module that names world_land gets the land mask as data.world_land
  if (/\bworld_land\b/.test(String(answer.code || ''))) { try { assets.world_land = (await import('./geo.mjs')).ensureLandMask(cfg); } catch (e) { errors.push(`world_land: ${String(e.message || e).split('\n')[0]}`); } }
  if (answer.maps?.length) {
    const { fetchMap } = await import('./maps.mjs');
    for (const r of answer.maps) {
      try {
        const got = await fetchMap(cfg, id, { key: r.key, place: r.place, pins: r.pins || [], radiusKm: r.radiusKm || 5 }, { log });
        assets[r.key] = got.file;
        // a region map's real ground (maps.mjs ensureRelief) comes in as a picture of its own: images['<key>Relief']
        const rel = path.join(path.dirname(got.file), 'relief.png'); if (fs.existsSync(rel)) assets[`${r.key}Relief`] = rel;
        const sea = path.join(path.dirname(got.file), 'sea.png'); if (fs.existsSync(sea)) assets[`${r.key}Sea`] = sea;   // and its sea, white on black
        const hgt = path.join(path.dirname(got.file), 'height.png'); if (fs.existsSync(hgt)) assets[`${r.key}Height`] = hgt;   // and its heights (a lit map's bump)
        const map = readJson(got.file), lost = Object.entries(map.pins || {}).filter(([, v]) => !v.found).map(([k]) => k);
        if (lost.length) notes.push(`map ${r.key}: not on the map, show as 示意: ${lost.join('、')}`);
      } catch (e) { errors.push(`map ${r.key}: ${e.message}`); }
    }
  }
  if (answer.glyphs?.length) {
    const H = await import('./house.mjs'), rules = H.houseRules(engineRoot(cfg)), here = path.dirname(new URL(import.meta.url).pathname);
    for (const r of answer.glyphs) {
      const f = rules.fonts.allowed.find((x) => x.family === r.face), file = f && H.fontFile(f, engineRoot(cfg));
      if (!file || !fs.existsSync(file)) { errors.push(`glyphs ${r.key}: no installed house font ${r.face}`); continue; }
      const out = path.join(outDir(cfg, id, g), `glyphs-${r.key}.json`), got = spawnSync('python3', [path.join(here, 'glyph_paths.py'), file, String(r.text)], { encoding: 'utf8', maxBuffer: 32 << 20 });
      if (got.status) { errors.push(`glyphs ${r.key}: ${String(got.stderr || got.stdout).trim().split('\n').slice(-1)[0]}`); continue; }
      fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, got.stdout); assets[r.key] = out;
    }
  }
  if (answer.art?.length) {
    const { generateArt } = await import('./imagegen.mjs');
    for (const r of answer.art) {
      try {
        if (r.file) { assets[r.key] = projectArtFile(projectPaths(cfg, id).root, r.file); log(`  art ${r.key}: existing project file`); }
        else { const got = await (generateArtOverride || generateArt)(cfg, { prompt: r.prompt, transparent: !!r.transparent, size: '1024x1024' }, { log }); assets[r.key] = got.file; log(`  art ${r.key}: ${got.cached ? 'cached' : `${got.seconds}s`}`); }
      }
      catch (e) { errors.push(`art ${r.key}: ${String(e.message || e).split('\n')[0]}`); }
    }
  }
  const resolved = [];
  for (const demand of operationPreflight.pending) {
    const production = productions.find(p => p.reference === demand.reference);
    const file = production?.key ? assets[production.key] : production?.file;
    try {
      const old = sameProduction && previous.resolved?.find(p => p.beat === demand.beat && p.id === demand.id && p.reference === demand.reference);
      const canonical = fs.realpathSync(file);
      if (old && old.file !== canonical) throw new Error('generation output path changed');
      resolved.push(old || { ...demand, file: canonical, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
    }
    catch { errors.push(`asset-operation ${demand.beat}/${demand.id}: generation output missing or changed`); }
  }
  const final = await assetOperationPreflight({ ...operationOptions, resolved, consumedFiles: [...Object.values(assets), ...modelsNamed(answer.code).map(m => modelFile(cfg, m.name))] });
  errors.push(...final.errors);
  const receipt = operationReceiptFile(cfg, id, g);
  if (!errors.length) writeJson(receipt, { codeHash: operationHash(answer.code || ''), designHash: operationHash(JSON.stringify(operationOptions.beats)), productions, resolved });
  else if (fs.existsSync(receipt)) fs.unlinkSync(receipt);
  return { assets, errors, notes, operationEvidence: final.evidence };

}

// ---------------------------------------------------------------- 3. checks
const FONTS = new Set(['a1-editorial-fonts/SourceHanSansCN-Heavy.otf', 'a1-editorial-fonts/SourceHanSerifCN-Heavy.otf', 'style-guides/experimental-editorial-tech-v1/fonts/BebasNeue-Regular.ttf']);
const FORBIDDEN = [[/\bfetch\s*\(/, 'fetch'], [/\bimport\s*\(/, 'dynamic import'], [/^\s*import\s/m, 'import'], [/\beval\s*\(/, 'eval'], [/new\s+Function\b/, 'new Function'],
  [/XMLHttpRequest|WebSocket|EventSource/, 'network'], [/localStorage|sessionStorage|indexedDB|document\.cookie/, 'storage'], [/new\s+Image\b|\.src\s*=/, 'loading pictures']];
export function checkCode(code) {
  const errors = [];
  if (typeof code !== 'string' || !code.trim()) return ['answer.code is empty'];
  if (code.length > 80000) errors.push(`the module is ${code.length} characters; keep it under 80000`);
  for (const [re, what] of FORBIDDEN) if (re.test(code)) errors.push(`the module uses ${what}: draw with code only (rules 6)`);
  for (const ex of [/export\s+const\s+beats\b/, /export\s+(async\s+)?function\s+items\b|export\s+const\s+items\b/, /export\s+function\s+pose\b|export\s+const\s+pose\b/, /export\s+const\s+DUR\b/]) if (!ex.test(code)) errors.push(`missing export ${ex.source.match(/beats|items|pose|DUR/)[0]}`);
  // the template calls pose(item, k, t, P, moves): a pose that takes moves fourth gets P and fails at its first move
  if (/function\s+pose\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*,\s*moves\b/.test(code)) errors.push('pose(item, k, t, P, moves): moves is the fifth argument, P the fourth');
  // a // comment that swallowed code (2026-10-22, three times in one day: an inline note put mid-line took the rest of
  // the line with it; a parse error caught two, the third would have parsed and silently lost its code)
  for (const [i, line] of code.split('\n').entries()) {
    const m = line.match(/(?:[;{}),\s])\/\/(.*)$/), before = m ? line.slice(0, m.index) : '';
    if (!m || !before.trim() || /['"`]/.test(before.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '').replace(/[^'"`]/g, ''))) continue;   // only a note after code, outside a string
    // 2026-10-23, five more: a g.restore() or a declaration after the note with no semicolon before it
    if (/;\s*(?:(?:const|let)\s+\w+\s*=|(?:if|for)\s*\(|return\b|g\.\w+\(|ctx\.\w+|label\(|tag\()|\}\);|\)\s*\{\s*\w+\s*[.=(]|\}\s*else\s*\{|\bg\.(?:restore|save)\(\)|\b(?:const|let)\s+[A-Za-z_$][\w$]*\s*=[^=>]/.test(m[1])) errors.push(`line ${i + 1}: code inside a // comment (a note put mid-line takes the rest of the line with it): move the note to a line of its own`);
  }
  // light painted on (the user 2026-10-27: 这黄光有点廉价): a radial gradient laid with additive blending is a glow, not a
  // light; a scene is lit by a source (kit.practical: a spot from one side, its shadows, a cool ambient; kit.litMap)
  if (/AdditiveBlending/.test(code) && /createRadialGradient/.test(code)) errors.push('the module lays light on as an additive radial glow: light the scene from a source instead (kit.practical, kit.litMap; rules 34)');
  const fonts = code.match(/(?:a1-editorial-fonts|style-guides)\/[\w./-]+\.(?:otf|ttf|woff2?)/g) || [];
  for (const f of fonts) if (!FONTS.has(f)) errors.push(`font ${f} is not allowed (rules: ${[...FONTS].join(', ')})`);
  return errors;
}
// every number on screen comes from the chapter's own text; 1-9 alone may count (the 1, 2, 3 under repeats)
// names whose digits are part of the name (routing/str-loci.json: the CODIS core loci, D5S818 is chromosome 5, segment
// 818): a label, not a figure. The reference film tags its STR comparisons with them; their counts are still data.
export const NAME_TOKENS = (() => { try { const j = JSON.parse(fs.readFileSync(new URL('../../../../../work/recipe-board-v1/routing/str-loci.json', import.meta.url), 'utf8')); return [...(j.loci || []), ...(j.yLoci || [])].sort((a, b) => b.length - a.length); } catch { return []; } })();
// Only the beat's binding consumer can grant the extended citation exemption. Raw
// strings/objects passed to numberErrors retain the old year-only contract.
const verifiedCaption = new WeakMap();
export function captionSourcesForBeat(bindings, beatId, assets = {}, root = process.cwd()) {
  const out = [], resolve = f => path.resolve(root, f);
  const hashed = (file, sha256) => typeof file === 'string' && /^[a-f0-9]{64}$/.test(sha256 || '') &&
    fs.statSync(resolve(file)).isFile() && crypto.createHash('sha256').update(fs.readFileSync(resolve(file))).digest('hex') === sha256;
  for (const [key, b] of Object.entries(bindings || {})) {
    if (!b || (key !== beatId && b.shotId !== beatId) || (b.shotId && b.shotId !== beatId) || !b.file) continue;
    try {
      if (!fs.statSync(resolve(b.file)).isFile()) continue;
      const consumed = Object.values(assets).some(f => typeof f === 'string' && resolve(f) === resolve(b.file));
      let citation = false;
      const c = b.citation;
      if (c && b.source === 'real' && b.generated === false && hashed(b.file, b.sha256)) {
        const url = new URL(b.url), host = url.hostname.replace(/^www\./, '').split('.')[0];
        // Publisher digits must be part of the exact source identity, not arbitrary
        // caption prose (Rural21, not 'Rural21 900億'). Fail closed on other formats.
        const publisher = typeof c.publisher === 'string' && /^[A-Za-z][A-Za-z0-9-]*$/.test(c.publisher) && c.publisher.toLowerCase() === host;
        const date = typeof c.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date) &&
          Number.isFinite(Date.parse(c.date)) && new Date(c.date).toISOString().slice(0, 10) === c.date && String(b.year) === c.date.slice(0, 4);
        let dated = false;
        if (date && /^https?:$/.test(url.protocol)) {
          dated = url.pathname.includes('/' + c.date.replaceAll('-', '/') + '/');
          if (!dated && c.archive && hashed(c.archive.file, c.archive.sha256)) {
            const html = fs.readFileSync(resolve(c.archive.file), 'utf8');
            const attr = (tag, name) => tag.match(new RegExp('\\b' + name + '\\s*=\\s*(["\\\'])(.*?)\\1', 'i'))?.[2];
            const canonical = (html.match(/<link\b[^>]*>/gi) || []).some(tag => attr(tag, 'rel') === 'canonical' && attr(tag, 'href') === b.url);
            dated = canonical && (html.match(/<time\b[^>]*>/gi) || []).some(tag => attr(tag, 'itemprop') === 'datePublished' && attr(tag, 'datetime') === c.date);
          }
        }
        citation = publisher && date && dated && b.caption === `${c.publisher} · ${c.date}`;
        // Academic text references: publication identifiers and year-only dates are
        // metadata, not body-number exceptions. Prove the publisher and fields in
        // the hashed original; the optional diagram label cannot contain digits.
        const label = c.label === undefined ? '' : typeof c.label === 'string' && /^[\p{L}\p{M} ]{1,40}$/u.test(c.label) ? c.label + ' · ' : null;
        if (b.kind === 'text' && label !== null && url.protocol === 'https:') {
          if (c.publisher === 'UF/IFAS' && url.hostname === 'ask.ifas.ufl.edu' && /^\/publication\/[A-Z]+\d+$/.test(url.pathname) &&
              /^[A-Z]+\d+$/.test(c.publicationId || '') && c.year === undefined && b.year === undefined && c.archive && hashed(c.archive.file, c.archive.sha256)) {
            const html = fs.readFileSync(resolve(c.archive.file), 'utf8'), text = fs.readFileSync(resolve(b.file), 'utf8');
            const attr = (tag, name) => tag.match(new RegExp('\\b' + name + '\\s*=\\s*(["\x27])(.*?)\\1', 'i'))?.[2];
            const canonical = (html.match(/<link\b[^>]*>/gi) || []).some(t => attr(t, 'rel') === 'canonical' && attr(t, 'href') === b.url);
            const title = `${c.publicationId}/${url.pathname.split('/').pop()}: ${c.title}`;
            const identity = (html.match(/<meta\b[^>]*>/gi) || []).some(t => attr(t, 'property') === 'og:title' && attr(t, 'content') === title);
            citation ||= canonical && identity && typeof c.title === 'string' && text.split(/\r?\n/).includes(c.title) &&
              text.split(/\r?\n/).includes(`Publication #${c.publicationId}`) && text.includes('UF/IFAS') && b.caption === `${label}UF/IFAS · ${c.publicationId}`;
          }
          if (c.publisher === 'APS' && url.hostname === 'www.apsnet.org' && /^\d{4}$/.test(String(c.year)) && String(b.year) === String(c.year) &&
              c.publicationId === undefined && url.pathname.startsWith(`/edcenter/apsnetfeatures/Documents/${c.year}/`) && /\/[A-Za-z]+\d*\.pdf$/.test(url.pathname) &&
              typeof c.title === 'string' && /^[A-Za-z .-]+$/.test(c.author || '') && /^[A-Za-z-]+$/.test(c.authorLabel || '') && c.author.split(' ').at(-1) === c.authorLabel) {
            // Use the installed PDF parser on the original bytes, never a supplied
            // transcript. Bounded subprocess keeps this synchronous selector pure.
            const script = `import fs from 'node:fs'; import {PDFParse} from ${JSON.stringify(import.meta.resolve('pdf-parse'))}; const p=new PDFParse({data:fs.readFileSync(process.argv[1])}); try { console.log((await p.getText({partial:[1]})).text); } finally { await p.destroy(); }`;
            const parsed = spawnSync(process.execPath, ['--input-type=module', '-e', script, resolve(b.file)], {encoding:'utf8', timeout:15000, maxBuffer:1024*1024});
            const text = parsed.status === 0 ? parsed.stdout : '', lines = text.split(/\r?\n/), header = lines[0]?.match(/^Feature Story ([A-Za-z]+) (\d{4})$/);
            const authorAt = lines.indexOf(c.author), title = authorAt > 1 ? lines.slice(1, authorAt).join(' ').replace(/\s+/g, ' ').trim() : '';
            citation ||= header?.[2] === String(c.year) && text.replace(/\s+/g, ' ').includes(`${header[1]} ${c.year} APSnet Feature`) && title === c.title &&
              b.caption === `${label}APS · ${c.authorLabel} · ${c.year}`;
          }
        }
      }
      // Text citations are references, never added to rendered assets. Old image
      // citations still require actual consumption; no context means no exemption.
      if (!consumed && !(b.kind === 'text' && citation)) continue;
      const source = {caption:b.caption, year:b.year, url:b.url};
      if (citation) verifiedCaption.set(source, b.caption);
      out.push(source);
    } catch { /* absent, malformed or changed provenance fails closed */ }
  }
  return out;
}
export function numberErrors(texts, chapterText, { names = NAME_TOKENS, sources = [] } = {}) {
  const norm = (s) => String(s).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，\s]/g, '');
  const unnamed = (s) => names.reduce((x, n) => x.split(n).join(' '), String(s));
  // a date the text says in words may be set in figures (2019 年 1 月 as 2019.1, 2020 年 8 月 21 日 as 2020.8.21: one
  // date format on screen, the blind review of 2026-10-25)
  const dates = [...norm(chapterText).matchAll(/(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/g)].flatMap(([, y, m, d]) => [`${y}.${m}`, ...(d ? [`${y}.${m}.${d}`] : [])]);
  const src = [norm(chapterText), ...dates].join('|'), out = new Set(), scale = scaleNumbers(texts);
  for (const t of texts) {
    // Exact citation + publication metadata only, never a global numeric whitelist.
    const source = sources.find(s => s.caption === t && /^https?:\/\//.test(s.url || '') && /^\d{4}$/.test(String(s.year)));
    if (sources.some(s => s.caption === t && verifiedCaption.get(s) === t)) continue; // exact verified metadata only
    for (const n of norm(unnamed(t)).match(/\d+(?:\.\d+)?/g) || []) if (!(source && n === String(source.year)) && !/^[1-9]$/.test(n) && !src.includes(n) && !scale.has(String(t).trim())) out.add(`"${t}" shows ${n}, which the chapter's text does not say (rules 3)`);
  }
  return [...out];
}
// lines of type over each other at a key frame (two loci tags merged into "DYS635 DYS389I", the figures of two
// neighbouring walls into "20200" in B26 round 12): a third of the smaller box covered fails the beat
export function overlapErrors(drawn, beatId) {
  // texture words (the faint huge FORENSIC behind everything) lie under the type by design: not type over type
  // (a big headline left at 0.17 still reads: 庫容超過 over 全國公安機關 DNA 數據庫 was the blind review's 2, 2026-10-25)
  const box = drawn.filter((d) => d.size >= 14 && String(d.text).trim() && (d.alpha ?? 1) >= (d.size >= 60 ? 0.14 : 0.2)), out = [];
  for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) {
    const a = box[i], b = box[j], ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ix <= 0 || iy <= 0) continue;
    if (a.whole && a.whole === b.whole) continue;   // runs of one line set script by script (23 and 萬枚 of 23萬枚) touch by design
    // an object with its own band drawn later (a tape swept over a card, a tag) covers what is under it: not type over type
    // (tags piled on tags in 3D, B44, are blocks the trace does not see: the review's rule, morph-review.md)
    // words set on a surface (a label in the scene) have no band: two of them over each other are type over type
    // (Suez B03, 2026-10-27: 「2萬個集裝箱」 laid half over 「400米」 passed, the review's 2)
    if (b.object && !(a.surface && b.surface)) continue;
    const small = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
    if (small > 0 && (ix * iy) / small > 0.33 && a.text !== b.text) out.push(`${beatId}: "${a.text}" and "${b.text}" are set over each other`);
  }
  return [...new Set(out)].slice(0, 6);
}
// a figure and its unit are one word (the blind review of 2026-10-25: 「323」 and 「人」 110 px apart, 「2004」 and 「年 · 公安部」
// 100 px, 「1000」 and 「個」 120 px; the reference sets the unit against the figure's last digit): a figure line and a
// line on its right that opens with a unit, on the figure's baseline band, fail when the space between them is more
// than UNIT_GAP of the unit's size
export const UNIT_GAP = 0.6;
const UNIT_RE = /^[\s]*[人個个次年月日歲岁萬万億亿倍枚件起名位對对種种秒天週周%‰]/;
export function unitGapErrors(drawn, beatId) {
  const box = drawn.filter((d) => d.size >= 14 && (d.alpha ?? 1) >= 0.2 && String(d.text).trim()), out = [];
  const figs = box.filter((a) => /\d/.test(a.text) && /^[\d\s.,—–\-]+$/.test(String(a.text).trim()));
  // a unit is judged against the figure nearest it on its baseline (the digits of a rolling 8000 are drawn one by one: its
  // third 0 is not the unit's figure)
  for (const b of box) {
    if (!UNIT_RE.test(String(b.text))) continue;
    let best = null;
    for (const a of figs) {
      if (a === b || (a.whole && a.whole === b.whole)) continue;
      const h = a.y1 - a.y0, gap = b.x0 - a.x1;
      if (b.y1 < a.y0 + 0.5 * h || b.y1 > a.y1 + 0.2 * h || gap < -4) continue;   // not on the figure's baseline band, or not after it
      if (!best || gap < best.gap) best = { a, gap };
    }
    if (best && best.gap > UNIT_GAP * b.size && best.gap <= 4 * b.size) out.push(`${beatId}: "${b.text}" stands ${Math.round(best.gap)} px off its figure "${best.a.text}" (set the unit against the figure)`);
  }
  return [...new Set(out)].slice(0, 4);
}
// type over a drawn line or a picture (blind review of paperclip-138-full B15/B17, round 7: 「個」 cut through by a
// frame's upright, 「1000 個裡…」 on the outer frames' bottom edge, 「指紋」 on the palm print): a line of CROSS_MIN px or
// more fails its beat when a straight stroke longer than its box runs across it (through the box, along most of it),
// or when a picture it does not belong to covers more than a third of it. The shapes come from morph.js shapeTrace:
// an object's own frame (kit2 tags) is not recorded, a surface (a screen, a sheet of paper: a third of the frame or
// more) is what type is printed on, as plateErrors allows, and type set as an object (a tag on its photo) belongs.
export const CROSS_MIN = 34;
// the pictures that are ground, not pictures: one drawn over a third of the frame or more in one piece, or a texture
// tiled edge to edge over most of it. Summing a source's area (as before) took eleven copies of one evidence card for a
// ground (paperclip-138-full B20: the title over the pile of cards passed); the cover is measured on a 48 x 27 grid
const srcOf = (p) => String(p.src ?? `@${p.x0},${p.y0},${p.x1},${p.y1}`);   // a picture with no source id is its own
export function groundSources(shapes) {
  const by = {}; for (const p of shapes) if (p.kind === 'image') (by[srcOf(p)] ||= []).push(p);
  const out = new Set(), F = 1920 * 1080;
  for (const [src, ps] of Object.entries(by)) {
    if (ps.some((p) => Math.max(0, Math.min(p.x1, 1920) - Math.max(p.x0, 0)) * Math.max(0, Math.min(p.y1, 1080) - Math.max(p.y0, 0)) >= F / 3)) { out.add(String(src)); continue; }
    if (ps.length < 4) continue;
    const cell = new Set(); for (const p of ps) for (let i = Math.max(0, Math.floor(p.x0 / 40)); i < Math.min(48, Math.ceil(p.x1 / 40)); i++) for (let j = Math.max(0, Math.floor(p.y0 / 40)); j < Math.min(27, Math.ceil(p.y1 / 40)); j++) cell.add(i * 27 + j);
    if (cell.size >= 0.6 * 48 * 27) out.add(String(src));
  }
  return out;
}
export const LINE_MIN = 20, TOUCH_PX = 4;
export function crossErrors(drawn, shapes, beatId) {
  // a line run across words is read down to LINE_MIN px and on an object's words too: an object's own strokes are never
  // traced, so a traced line on its words is another's (B29's red line through the 22 px 他 on its frame, B19's leader through
  // a 32 px caption: blind review 2026-10-26); pictures under type keep the larger size and leave objects (a card is its picture)
  const out = [], type = drawn.filter((d) => d.size >= LINE_MIN && (d.alpha ?? 1) >= 0.3 && String(d.text).trim());
  // a surface: a ground (groundSources), what type is printed on
  const ground = groundSources(shapes), surface = (p) => ground.has(srcOf(p));
  for (const d of type) {
    // the glyphs' box: the em box less a little at top and bottom (a CJK face inks about 0.9 em; Latin and figures
    // only to their cap height: B12's 6000–10000 stood clear under its frame's line)
    const s = d.size, bx0 = d.x0, bx1 = d.x1, by0 = d.y0 + (/[\u3400-\u9fff\uf900-\ufaff]/.test(d.text) ? 0.04 : 0.12) * s, by1 = d.y1 - 0.04 * s;
    if (bx1 - bx0 < 4 || by1 - by0 < 4) continue;
    for (const p of shapes) {
      if (p.kind === 'line') {
        if ((p.alpha ?? 1) < 0.25 || p.w < 1 || (p.obj != null && p.obj === d.obj) || d.bleed) continue;   // an object's own frame round its own words; a tape's names laid across the frame over what is under them
        const dx = p.x1 - p.x0, dy = p.y1 - p.y0, len = Math.hypot(dx, dy), h = p.w / 2;
        if (len < 1) continue;
        // a rule along the foot of the type (B19's leader under its 10) underlines it, it does not cross it
        if (Math.abs(dy) < 0.05 * len && Math.min(p.y0, p.y1) >= by1 - 0.1 * s - h) continue;
        // a rule a few pixels over the type's top touches it, read as on it (B13's caption 2 px under the boxes above it)
        if (Math.abs(dy) < 0.05 * len) { const y = (p.y0 + p.y1) / 2, ox = Math.min(bx1, Math.max(p.x0, p.x1)) - Math.max(bx0, Math.min(p.x0, p.x1)); if (y > by0 - TOUCH_PX - h && y < by0 + h && ox > 0.3 * (bx1 - bx0)) { out.push(`${beatId}: "${d.text}" (${Math.round(s)} px) has a rule touching its top (${Math.round(Math.min(p.x0, p.x1))},${Math.round(y)}); leave ${TOUCH_PX} px or more`); continue; } }
        // the part of the stroke inside the box (grown by half its width): Liang-Barsky
        let u0 = 0, u1 = 1;
        for (const [q, r] of [[-dx, p.x0 - (bx0 - h)], [dx, (bx1 + h) - p.x0], [-dy, p.y0 - (by0 - h)], [dy, (by1 + h) - p.y0]]) {
          if (q === 0) { if (r < 0) { u0 = 1; u1 = 0; } continue; }
          const u = r / q; if (q < 0) u0 = Math.max(u0, u); else u1 = Math.min(u1, u);
        }
        if (u1 <= u0) continue;
        const inside = (u1 - u0) * len, across = Math.abs(dx) / len * (bx1 - bx0) + Math.abs(dy) / len * (by1 - by0);
        if (len > across && inside >= 0.6 * across) { out.push(`${beatId}: "${d.text}" (${Math.round(s)} px) has a drawn line run across it (${Math.round(p.x0)},${Math.round(p.y0)} to ${Math.round(p.x1)},${Math.round(p.y1)}); set type clear of the frames and rules`); break; }
      } else if (p.kind === 'image') {
        if ((p.alpha ?? 1) < 0.3 || surface(p) || d.object || d.size < CROSS_MIN) continue;
        const ix = Math.min(bx1, p.x1) - Math.max(bx0, p.x0), iy = Math.min(by1, p.y1) - Math.max(by0, p.y0);
        if (ix > 0 && iy > 0 && (ix * iy) / ((bx1 - bx0) * (by1 - by0)) > 0.3) { out.push(`${beatId}: "${d.text}" (${Math.round(s)} px) sits on a picture it does not belong to (${Math.round((ix * iy) / ((bx1 - bx0) * (by1 - by0)) * 100)} % of it covered); set it beside the picture`); break; }
      }
    }
  }
  return [...new Set(out)].slice(0, 6);
}
// a picture mostly in the frame with a strip of it cut by the frame's edge (B03's last card ran off the right edge, the
// review: 约十分之一被画框切掉): one that is not a surface (under a third of the frame), half or more of it inside, and
// between 3 % and 30 % of it outside (a card a quarter out is cut, B03). A picture pushed far out by a camera move (less than half inside) is not one
export function edgeErrors(shapes, beatId) {
  const out = [], ground = groundSources(shapes);
  // a texture tiled over the frame is one source drawn many times: a ground, not a picture (as crossErrors)
  for (const p of shapes) {
    if (p.kind !== 'image' || (p.alpha ?? 1) < 0.3 || p.bleed || ground.has(srcOf(p))) continue;   // a picture laid to run off the frame on purpose (kit2 chromBar, as a tape)
    const W = p.x1 - p.x0, H = p.y1 - p.y0, area = W * H; if (W < 40 || H < 40 || area >= 1920 * 1080 / 3) continue;
    const ix = Math.max(0, Math.min(p.x1, 1920) - Math.max(p.x0, 0)), iy = Math.max(0, Math.min(p.y1, 1080) - Math.max(p.y0, 0)), inside = (ix * iy) / area;
    if (inside >= 0.7 && inside <= 0.97) out.push(`${beatId}: a picture (${Math.round(W)}x${Math.round(H)} at ${Math.round(p.x0)},${Math.round(p.y0)}) is cut by the frame's edge (${Math.round((1 - inside) * 100)} % of it outside): bring it inside with a margin, or take it out of the frame`);
  }
  return [...new Set(out)].slice(0, 3);
}
// a picture laid over part of a block of the accent drawn before it (a data bar, a red band: morph.js records them as
// 'fill') hides what the block says: paperclip-138-full B44, the family's frames slid over the IBD bars as the camera
// moved (whole-film review 9, 2026-10-26; the reference keeps the bars, the values and the tags each in its own place).
// A plate under its picture (holding it) or a block wholly under a picture is not part-covered.
export const COVER_MIN = 0.08;
export function coverErrors(shapes, beatId) {
  const out = [], ground = groundSources(shapes), fills = [];
  for (const p of shapes) {
    // a band run off the frame (a rule across it, as a tape) is laid under things on purpose
    if (p.kind === 'fill') { if ((p.alpha ?? 1) >= 0.3 && p.x0 > -2 && p.x1 < 1922 && p.y0 > -2 && p.y1 < 1082) fills.push(p); continue; }
    if (p.kind !== 'image' || (p.alpha ?? 1) < 0.3 || p.bleed || ground.has(srcOf(p))) continue;
    const pa = (p.x1 - p.x0) * (p.y1 - p.y0); if (pa <= 0) continue;
    for (const r of fills) {
      const ix = Math.min(p.x1, r.x1) - Math.max(p.x0, r.x0), iy = Math.min(p.y1, r.y1) - Math.max(p.y0, r.y0); if (ix <= 0 || iy <= 0) continue;
      const ra = (r.x1 - r.x0) * (r.y1 - r.y0), o = ix * iy;
      if (o >= 0.95 * pa || o >= 0.95 * ra) continue;   // the plate holds the picture, or the block is wholly under it
      if (o / Math.min(pa, ra) >= COVER_MIN) out.push(`${beatId}: a picture (${Math.round(p.x1 - p.x0)}x${Math.round(p.y1 - p.y0)} at ${Math.round(p.x0)},${Math.round(p.y0)}) covers part of a block of the accent drawn before it (${Math.round(r.x0)},${Math.round(r.y0)} to ${Math.round(r.x1)},${Math.round(r.y1)}): give each its own place`);
    }
  }
  return [...new Set(out)].slice(0, 3);
}
// one picture shown again and again at once (paperclip-138-full B19: eleven cases, eleven cards of the same two
// prints; the user: 设计怎么都是脚印和手指 怎么不多设计变化呢): a picture big enough to be looked at (REPEAT_AREA of the
// frame) in more than REPEAT_MAX places fails the beat. Copies in one place (a shadow under its photo, a strip of a
// bent plane) count once; a ground does not count. Many cases are told by what differs (dates, places, what was found),
// with a picture on a few
export const REPEAT_MAX = 3, REPEAT_AREA = 0.02;
export function repeatErrors(shapes, beatId) {
  const ground = groundSources(shapes), by = {};
  for (const p of shapes) {
    if (p.kind !== 'image' || (p.alpha ?? 1) < 0.3 || ground.has(srcOf(p))) continue;
    const ix = Math.max(0, Math.min(p.x1, 1920) - Math.max(p.x0, 0)), iy = Math.max(0, Math.min(p.y1, 1080) - Math.max(p.y0, 0));
    if (ix * iy < REPEAT_AREA * 1920 * 1080) continue;
    const at = (by[srcOf(p)] ||= []);
    if (!at.some((q) => { const ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), oy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0); return ox > 0 && oy > 0 && ox * oy > 0.6 * Math.min((p.x1 - p.x0) * (p.y1 - p.y0), (q.x1 - q.x0) * (q.y1 - q.y0)); })) at.push(p);
  }
  return Object.values(by).filter((a) => a.length > REPEAT_MAX).map((a) => `${beatId}: mid-film-fake-array: one picture is shown ${a.length} times at once (${Math.round(a[0].x1 - a[0].x0)}x${Math.round(a[0].y1 - a[0].y0)} and more): tell the cases apart by what differs (dates, places, what was found) — use prop family diversity (routing/props.json) or wired lineup-row / copy-to-repeat / table-grows; give a picture to ${REPEAT_MAX} at most`);
}
// the figures of a scale: lone numbers that together make an evenly spaced run of four or more (140 150 … 200 on a
// height chart, 0 25 50 75 100 on an axis) measure, they claim nothing; the reference's mugshot wall has them
// (B26 drew its wall without them, the user: 还是没对上很多). A lone number not in such a run still needs the text.
export function scaleNumbers(texts) {
  const vals = [...new Set(texts.map((t) => String(t).trim()).filter((t) => /^-?\d+(\.\d+)?$/.test(t)))].map(Number).sort((a, b) => a - b), keep = new Set();
  for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
    const step = vals[j] - vals[i]; if (step <= 0) continue; const run = [vals[i]];
    for (let v = vals[i] + step; vals.includes(+v.toFixed(6)); v += step) run.push(+v.toFixed(6));
    if (run.length >= 4) run.forEach((v) => keep.add(String(v)));
  }
  return keep;
}
// the reference's type: which house faces its kind of lettering maps to (projects/<ref>/look.json type.faces) and how
// much of a chapter's lettering may be set otherwise. paperclip-138 letters in bold gothic throughout; the chapter set
// its labels in 黒華明朝 (Kikai lacks the Chinese and falls back to it) and read as a literary page (the user: 没对上)
// as morph.js KINKAKU_ODD (a test keeps the two the same)
export const KINKAKU_ODD = new Set([...'糸系紅約級紀納紙純素索累細終組結絕絡給統絲經綁綜綠緊網綿緒線緣編緩練縣縮總績繁織繞繪繼續纖纜']);
export function faceErrors(drawn, look) {
  const want = new Set(look?.type?.faces || []); if (!want.size) return [];
  if (['House Sumikaku', 'House Kinkaku', 'House Kaiso', 'House Kikai'].some((f) => want.has(f))) want.add('House Gothic');   // a reference in a bold sans takes the house's plain gothic (added 2026-10-25)
  // big type only: small Chinese lines go to the readable serif by design (morph.js DISPLAY_MIN)
  // (a line with a character 金畫字 draws apart goes to 黒華明朝 on purpose — the house has no bold gothic that draws it:
  // morph.js KINKAKU_ODD, 2026-10-25 — and is not held against the reference's lettering)
  const lines = drawn.filter((d) => d.face && d.size >= 90 && !(d.face === 'House Kokka' && [...String(d.whole || d.text)].some((c) => KINKAKU_ODD.has(c)))), off = lines.filter((d) => !want.has(d.face));
  const share = lines.length ? off.length / lines.length : 0, max = look.type.otherShareMax ?? 0.2;
  return share > max ? [`${Math.round(share * 100)} % of the lettering is set in ${[...new Set(off.map((d) => d.face))].join(', ')}; the reference letters in ${[...want].join(' / ')} (${look.type.note || ''}): ${off.slice(0, 4).map((d) => `"${d.text}"`).join(', ')}`] : [];
}
// Plates: a heading or label set on a filled box (the dark-box look the user turned down, 2026-10-20). Small tags
// (dates under PLATE_MIN px, the size of the reference's map dates) may keep one.
export const PLATE_MIN = 40;
export function plateErrors(drawn, beatId) {
  const big = drawn.filter((d) => d.plated && d.size >= PLATE_MIN);
  return big.length ? [`${beatId}: ${big.length} line(s) set on a box plate (${big.slice(0, 3).map((d) => `"${d.text}"`).join(', ')}); set type bare: type roles grid / serif / hairline / groundType, a soft shadow at most (rules 11)`] : [];
}
// the type of one keyframe against the frame: in frame, clear of the subtitles, readable
export function typeErrors(drawn, beatId) {
  const errors = [], warnings = [];
  for (const d of drawn) {
    // words on a thing in the scene (type.surfaceType) go where the thing goes: off the frame with it, small with it far
    // away (the hull's name when the camera stands back is part of the hull, not a line offered to be read); the subtitle
    // band still holds for them
    if (d.surface && (d.size < 22 || d.x0 < 40 || d.x1 > 1880 || d.y0 < 0)) { if (d.y1 > SUB_BAND && d.y0 < 1080 && d.size >= 22) errors.push(`${beatId}: "${d.text}" sits in the subtitle band (y ${Math.round(d.y0)}-${Math.round(d.y1)} > ${SUB_BAND}; rules 1)`); continue; }
    // a lone small Latin letter or digit is a mark of the figure (the A, T, C, G of a strand running out of frame), not a line to read:
    // it may pass under the subtitles (paperclip-138-full B07: 25 letters of a helix sent back)
    if (d.y1 > SUB_BAND && d.y0 < 1080) (/^[A-Za-z0-9|·•–—-]$/.test(String(d.text).trim()) && d.size < 48 ? warnings : errors).push(`${beatId}: "${d.text}" sits in the subtitle band (y ${Math.round(d.y0)}-${Math.round(d.y1)} > ${SUB_BAND}; rules 1)`);
    if (d.x0 < 40 || d.x1 > 1880 || d.y0 < 0) {
      // a big line cut by the edge at the key frame (the beat at rest) fails: B18's 出自同一個人 lost its top to the frame
      // and it was only a warning; a texture word (faint) or one that is mostly in may run off
      const w = d.x1 - d.x0, h = d.y1 - d.y0, cut = Math.max(0, -d.x0) + Math.max(0, d.x1 - 1920), cutY = Math.max(0, -d.y0);
      if (d.size >= 40 && (d.alpha ?? 1) >= 0.2 && d.x1 > 0 && d.x0 < 1920 && (cut > 0.08 * w || cutY > 0.15 * h)) errors.push(`${beatId}: "${d.text}" is cut by the edge of the frame (${Math.round(Math.max(cut / w, cutY / h) * 100)} % outside); keep it in at rest`);
      else if (d.size >= 22 && d.x1 > 0 && d.x0 < 1920) warnings.push(`${beatId}: "${d.text}" runs off the frame`);
    }
    else if (d.size < 16) errors.push(`${beatId}: "${d.text}" is ${d.size.toFixed(0)} px on screen; at least 22 (rules 2)`);
    else if (d.size < 22) warnings.push(`${beatId}: "${d.text}" is ${d.size.toFixed(0)} px on screen; 22 or more reads better`);
  }
  return { errors: [...new Set(errors)].slice(0, 20), warnings: [...new Set(warnings)].slice(0, 20) };
}

// The blind reviews' standing complaints, measured (2026-10-23: two rounds said 关键数字太小 and 下半部大片空着 of beat
// after beat; AGENTS.md: a complaint that comes back becomes a check).
// figureErrors: a number the beat's line says, when it is on screen at the keyframe, is the beat's main type there:
// its largest showing at least FIGURE_MIN px (8 次和 11 次 at 44 px, 比到 15 個位點 at 44 px read as captions).
export const FIGURE_MIN = 72;
const NUM_RE = /(?<![\w.·-])\d+(?:\.\d+)?(?![\w.])/g;
export function figureErrors(drawn, shot, min = FIGURE_MIN) {
  const said = new Set([...String(shot.text || '').matchAll(NUM_RE)].map((m) => m[0]).filter((n) => n.length < 12)), out = [];
  for (const n of said) {
    const shows = drawn.filter((d) => (d.alpha ?? 1) >= 0.2 && [...String(d.text).matchAll(NUM_RE)].some((m) => m[0] === n));
    if (!shows.length) continue;
    const big = Math.max(...shows.map((d) => d.size));
    if (big < min) out.push(`${shot.shotId}: the line's figure ${n} shows at ${Math.round(big)} px at most ("${shows[0].text}"); a figure the line says is the beat's main type: at least ${min} px`);
  }
  return out;
}
// a big figure set in 黒華明朝 (House Kokka): its 1 is a hairline with two small hooks, at display size it reads as a
// bracket (paperclip-138-full B15: the 320 px 1 read as 】); big digits go to a face whose figures read (金畫字, 装甲明朝,
// 廻想体, 機械彫刻)
export const DIGIT_FACE_MIN = 150;
export function digitFaceErrors(drawn, shotId) {
  return [...new Set(drawn.filter((d) => d.face === 'House Kokka' && d.size >= DIGIT_FACE_MIN && /^[\d.,%\s–-]+$/.test(String(d.text)) && /\d/.test(String(d.text))).map((d) => d.text))]
    .map((t) => `${shotId}: the figure "${t}" is set big in 黒華明朝, whose digits read as brackets at this size: set it in 金畫字, 装甲明朝 or 廻想体`);
}
// balanceErrors: the lower half above the subtitle band carries some of the picture (balance.py: its share of the
// edges, grain blurred away); under BALANCE_MIN the frame sits in its top half
export const BALANCE_MIN = 0.3;
export function balanceRows(files) {
  const r = spawnSync('python3', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'balance.py'), ...files], { encoding: 'utf8' });
  return r.status ? [] : r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
export function balanceErrors(rows, shotIds) {
  return rows.map((r, k) => (r.top + r.bottom > 0.01 && r.share < BALANCE_MIN ? `${shotIds[k]}: the picture sits in the top half at the keyframe (its lower half carries ${Math.round(r.share * 100)} % of it, at least ${BALANCE_MIN * 100}): bring the figure down or grow it so the frame is filled` : null)).filter(Boolean);
}

// The ground: how much of a keyframe is one bare flat colour (ground.py), against the look the user approved for the
// film (its direction's frames on the look sheet). A chapter may not go barer than that look by much: the banana white
// model's chapters stood on a bare near-black (71-90 % of the frame one flat colour) where the approved look laid
// lit specimen plates edge to edge (4-39 %) (the user 2026-10-27: 背景也不该全黑). Films with no approved look are not held.
export const GROUND_GIVE = 0.15, GROUND_FLOOR = 0.55;
export function groundRows(files) {
  const r = spawnSync('python3', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'ground.py'), ...files], { encoding: 'utf8' });
  return r.status ? [] : r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => !x.error);
}
// the frames of the look the user approved for the film (its picked direction's parts on the look sheet)
export function lookFrames(cfg, id) {
  const p = loadProject(cfg, id) || {}, m = /^film:[^/]+(?:\/([A-C]))?$/.exec(p.style || '');
  if (!p.look?.approved || !m) return [];
  const d = m[1] || (() => { try { return JSON.parse(fs.readFileSync(path.join(projectPaths(cfg, id).root, 'style.json'), 'utf8')).chosen || null; } catch { return null; } })();
  const dir = path.join(projectPaths(cfg, id).out, 'look', 'parts'); if (!d || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith(`${d}-`) && f.endsWith('.png')).map((f) => path.join(dir, f));
}
export function lookGround(cfg, id) {
  const files = lookFrames(cfg, id), rows = files.length ? groundRows(files) : [];
  return rows.length ? { flat: Math.max(...rows.map((r) => r.flat)), frames: rows.length } : null;
}
// one world, several grounds: a chapter does not stand on the same ground as the chapter before it (the banana white
// model's four chapters all stood on one near-black; the user 2026-10-27: 可以各种变体不是吗). Same ground: the
// keyframes' main ground colours within 14 levels a channel and their bareness alike, on most keyframes
const hexRgb = (c) => [1, 3, 5].map((i) => parseInt(String(c).slice(i, i + 2), 16));
export function sameGroundErrors(rows, prevRows, chapterId, prevId) {
  if (!rows.length || !prevRows.length) return [];
  const pc = prevRows.map((r) => hexRgb(r.color)), pf = prevRows.reduce((a, r) => a + r.flat, 0) / prevRows.length;
  const same = rows.filter((r) => { const c = hexRgb(r.color); return pc.some((q) => q.every((v, j) => Math.abs(v - c[j]) <= 14)) && Math.abs(r.flat - pf) < 0.25; });
  return same.length > rows.length / 2 ? [`${chapterId}: stands on the same ground as ${prevId} before it (${same[0].color}, ${same.length} of ${rows.length} keyframes): give this chapter another of the world's grounds (paper, a lit table, the soil, the scene, light or dark)`] : [];
}
export function flatGroundErrors(rows, shotIds, look) {
  if (!look) return [];
  const bar = Math.max(GROUND_FLOOR, look.flat + GROUND_GIVE);
  return rows.map((r, k) => (r.flat > bar ? `${shotIds[k]}: the ground is a bare flat ${r.color} over ${Math.round(r.flat * 100)} % of the keyframe; the look approved for this film carries its ground edge to edge (${Math.round(look.flat * 100)} % at most): lay a plate, paper, a lit surface or the scene of the world under it (the world's grounds)` : null)).filter(Boolean);
}

const chapterDir = (cfg, id, g) => path.join(projectPaths(cfg, id).root, 'chapters');
export const moduleFile = (cfg, id, g) => g.module || path.join(chapterDir(cfg, id, g), `${g.id}.mjs`);   // (g.module: the hero stills' module, stills.mjs heroChapter)
const outDir = (cfg, id, g) => path.join(projectPaths(cfg, id).out, 'chapters', g.id);
const rootUrl = (cfg, f) => '/' + path.relative(engineRoot(cfg), f).split(path.sep).join('/');
const assetUrls = (cfg, assets) => Object.fromEntries(Object.entries(assets).map(([k, f]) => [k, rootUrl(cfg, f)]));

// Motion: how much the picture changes, sampled every STEP seconds over the chapter (mean absolute difference of
// a 96 x 54 thumbnail between samples, 0-255; grain averages out at that size). Calibrated on the 回形针 opening
// replica (its camera drifts slowly all the time, as the reference does) against the system's first chapter (two beats
// frozen 6 and 9 s, read as slides):
//   frozen: nothing moves for more than FROZEN_MAX s inside a beat -> sent back (keep a slow camera drift or a small
//     move going; the replica never freezes more than 0.8 s). "Moves" is how far the picture travelled over the last
//     second, in px of a 192-wide frame: the change against the frame 1 s before over the frame's own edges (a shift of
//     v px changes each pixel by about v times its gradient). A step difference (FROZEN_DIFF) read a slow drift over a
//     sparse diagram — thin lines on black — as frozen (paperclip-138-full: six of seven chapters sent back for it);
//     the shift does not depend on how much is drawn. Under FROZEN_SHIFT (about 1 px a second at 1920) is frozen;
//   no rest: never calm (under HOLD_DIFF) for READ_HOLD s -> a warning only (the reference opens on a fast push);
//   nothing moves in a beat -> a warning.
export const STEP = 0.2, FROZEN_DIFF = 0.3, FROZEN_SHIFT = 0.1, FROZEN_MAX = 2.0, HOLD_DIFF = 3, MOVE_DIFF = 2.5, READ_HOLD = 0.8;
// the longest a beat may stand with nothing new happening: the reference's own long holds (refprofile holdSeconds p90)
// with a third more; 4.5 s when there is no reference. The reference holds a second or so and then something comes
// (B10 B26 B39 B47: elements landed and the picture stood for 4-8 s, 54-57 % of seconds still against 24-37 %)
// Calibrated on a chapter the user approved (B26, 2026-10-22: 这版可以了): its longest calm by this curve is 6.0 s. The
// reference's holds are measured another way (video frames, refprofile) and run shorter (p90 2.5-3.4 s), so they set
// no bar here directly: they would fail the approved chapter. The bar is the larger of the two.
export const CALM_MAX = 6.5;
export const calmMaxOf = (profile) => { const p = profile?.summary?.holdSeconds?.['90']; return Math.max(CALM_MAX, p ? +(p * 1.35).toFixed(1) : 0); };
// A beat whose reference stands as long by the same curve may too (B16 of paperclip-138-full: the reference's fifteen
// tags and its probability typed a digit at a time are calm 9.8 s by it; the bar failed what the reference does). The
// reference's calm is measured on its video (refCalm: compression noise only shortens a calm, never lengthens it),
// scaled to our beat's length, with half a second more.
export const calmBarOf = (calmMax, ref, dur) => (ref ? Math.max(calmMax, +(ref.calm * Math.min(1, dur / ref.dur) + 0.5).toFixed(1)) : calmMax);
export function holdErrors(curve, shots, { hold = HOLD_DIFF, frozen = FROZEN_DIFF, shift = FROZEN_SHIFT, frozenMax = FROZEN_MAX, move = MOVE_DIFF, read = READ_HOLD, calmMax = null, refCalm = {}, calmAsWarn = false, contracts = {} } = {}) {
  const errors = [], warnings = [], beats = [];
  for (const s of shots) {
    const spec = contracts[s.shotId];
    const deliberateStill = (spec?.camera?.move || spec?.camMove) === 'static' && spec?.subjectMotion === 'none';
    const pts = curve.filter((p) => p.t > s.at + 0.2 && p.t <= s.at + s.dur + 1e-6);
    let run = 0, best = 0, frun = 0, fbest = 0, peak = 0;
    for (const p of pts) {
      peak = Math.max(peak, p.d);
      run = p.d < hold ? run + STEP : 0; best = Math.max(best, run);
      frun = (p.s != null ? p.s < shift : p.d < frozen) ? frun + STEP : 0; fbest = Math.max(fbest, frun);   // curves without s: the step difference
    }
    beats.push({ shotId: s.shotId, still: +best.toFixed(1), frozen: +fbest.toFixed(1), peak: +peak.toFixed(1) });
    if (!pts.length) continue;
    if (!deliberateStill && fbest > frozenMax) errors.push(`${s.shotId}: the picture is frozen for ${fbest.toFixed(1)} s (a slide); declare an intentional static shot or move its actual subject`);
    const bar = calmMax ? calmBarOf(calmMax, refCalm[s.shotId], s.dur) : null;
    if (!deliberateStill && bar && best > bar) { const msg = `${s.shotId}: nothing new happens for ${best.toFixed(1)} s (at most ~${bar} s: ${bar > calmMax ? `the reference's own calm at this beat, ${refCalm[s.shotId].calm} s of ${refCalm[s.shotId].dur} s` : "the approved B26's longest calm"}): bring the next element, a step of the carrier or a camera move in sooner`; (calmAsWarn ? warnings : errors).push(msg); }
    if (best < Math.min(read, s.dur * 0.5)) warnings.push(`${s.shotId}: never calm long enough to read (longest calm ${best.toFixed(1)} s)`);
    if (!deliberateStill && peak < move) warnings.push(`${s.shotId}: nothing moves in this beat`);
  }
  return { errors, warnings, beats };
}
// the reference's longest calm in each beat's span, by motionCurve's step difference (96 x 54, every STEP s) on its video
export function calmOf(d, hold = HOLD_DIFF) { let run = 0, best = 0; for (const x of d) { run = x < hold ? run + STEP : 0; best = Math.max(best, run); } return +best.toFixed(1); }
export function referenceCalms(cfg, id, shots) {
  const R = referencePaths(cfg, id); if (!R || !fs.existsSync(R.video)) return {};
  const spans = referenceBeatSpans(cfg, id, shots.map((s) => s.shotId)), out = {};
  for (const s of shots) {
    const sp = spans[s.shotId]; if (!sp || sp[1] - sp[0] < 1) continue;
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(sp[0] + 0.2), '-to', String(sp[1]), '-i', R.video, '-vf', `fps=${1 / STEP},scale=96:54`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
    if (r.status || !r.stdout?.length) continue;
    const n = 96 * 54 * 3, f = Math.floor(r.stdout.length / n), d = [];
    for (let k = 1; k < f; k++) { let sum = 0; for (let i = 0; i < n; i++) sum += Math.abs(r.stdout[k * n + i] - r.stdout[(k - 1) * n + i]); d.push(sum / n); }
    out[s.shotId] = { calm: calmOf(d), dur: +(sp[1] - sp[0]).toFixed(1) };
  }
  return out;
}
// Seams between beats (user, 2026-10-22: 镜头衔接不丝滑、衔接不上): measured on paperclip-138-full's reel against the
// reference at the same lines, the picture went nearly empty at 42 % of our boundaries (12 % in the reference: it keeps
// something on screen and turns it into the next thing) and stood still going into 88 % (41 %). A beat boundary whose
// picture drops under SEAM_EMPTY of the fill the beats on either side usually carry (the lower of their medians: a
// sparse beat beside a sparse beat is not a gap) fails, unless the beat plans a black pause
// (plan2 devices black-pause); the share of boundaries the picture stands still going into is held to SEAM_STILL_MAX.
export const SEAM_EMPTY = 0.3, SEAM_WIN = 0.6, SEAM_STILL_MAX = 0.6, TAIL_KEEP = 0.6;
export function seamErrors(curve, shots, { plan = null, empty = SEAM_EMPTY, win = SEAM_WIN, stillMax = SEAM_STILL_MAX, opening = false } = {}) {   // opening: the film's first shot (it may come up from black)
  const errors = [], warnings = [], f = curve.filter((p) => p.f != null), med = f.length ? f.map((p) => p.f).sort((a, b) => a - b)[Math.floor(f.length / 2)] : 0;
  if (!med) return { errors, warnings, seams: [] };
  const black = (id) => (plan?.beats?.[id]?.devices || []).includes('black-pause');
  const seams = [];
  const mid = (v) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);
  for (const [k, s] of shots.entries()) {
    if (!k) continue;
    const a = shots[k - 1], near = f.filter((p) => Math.abs(p.t - s.at) <= win), before = curve.filter((p) => p.t > s.at - win && p.t <= s.at - 0.1);
    if (!near.length) continue;
    const side = Math.min(mid(f.filter((p) => p.t > a.at && p.t < s.at).map((p) => p.f)), mid(f.filter((p) => p.t > s.at && p.t < s.at + s.dur).map((p) => p.f))) || med;
    const lo = Math.min(...near.map((p) => p.f)) / side, still = before.length > 0 && before.every((p) => p.d < 1 && (p.s == null || p.s < 0.3));
    seams.push({ shotId: s.shotId, low: +lo.toFixed(2), still });
    if (lo < empty && !black(s.shotId) && !black(a.shotId)) errors.push(`${s.shotId}: the picture empties at its start (${Math.round(lo * 100)} % of what the beats either side carry): bring this beat in while the last one is still there, or turn the last one into it (the reference empties 12 % of its seams, ours 42 %)`);
  }
  // a beat's own end (blind reviews 2026-10-23, B09 B17 B33: the handover to the next beat was played in this one's last
  // second — the second chain merged away, the evidence flew off, the record shrank to a speck — and the beat's last
  // frame lost its point): its point holds to its last frame and the handover is played in the next beat's first second.
  // The last 0.35 s carrying under TAIL_KEEP of what its third quarter carries fails
  for (const [k, s] of shots.entries()) {
    const end = s.at + s.dur, tail = f.filter((p) => p.t > end - 0.35 && p.t <= end + 1e-6), q3 = (k) => { const v = f.filter((p) => p.t >= s.at + 0.55 * s.dur && p.t <= s.at + 0.8 * s.dur).map((p) => p[k] ?? 0).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length * 0.75)] : 0; }, body = q3('f'), bodyC = q3('c');   // its third quarter at its fullest (the upper quartile: B17's 27 % fell to 13 % at the cut, its median hid it)
    if (!tail.length || !body || black(s.shotId) || (shots[k + 1] && black(shots[k + 1].shotId))) continue;   // a planned black pause on either side
    const lo = Math.max(Math.max(...tail.map((p) => p.f)) / body, bodyC > 0.02 && tail.some((p) => p.c != null) ? Math.max(...tail.map((p) => p.c ?? 0)) / bodyC : 0);   // detail or cover: either kept is not emptied   // its fullest moment there: a crossfade into the next beat dips at the cut itself (B10 into STR), an emptied end stays low
    if (lo < TAIL_KEEP) errors.push(`${s.shotId}: the picture empties before the beat ends (its last 0.35 s carries ${Math.round(lo * 100)} % of its third quarter): hold the beat's point to its last frame and play the handover in the next beat's first second`);
  }
  // the chapter's own start: a chapter that builds up from an empty frame leaves the cut before it empty (B26 B32 B39
  // after their shots); something is on screen from its first frame (it carries over what the last shot ended on)
  { const s = shots[0], head = f.filter((p) => p.t <= s.at + win), body = mid(f.filter((p) => p.t > s.at && p.t < s.at + s.dur).map((p) => p.f)) || med;
    if (!opening && head.length && Math.min(...head.map((p) => p.f)) / body < empty && !black(s.shotId)) errors.push(`${s.shotId}: the chapter starts from an empty frame (${Math.round((Math.min(...head.map((p) => p.f)) / body) * 100)} % of its first beat's fill): open on what the shot before ended on, or with this beat's ground and its first element already there`); }
  const n = seams.filter((x) => x.still).length;
  if (seams.length >= 3 && n / seams.length > stillMax) warnings.push(`${n} of ${seams.length} beat seams stand still going in (the reference 41 %): keep the move going into the cut and let the next beat pick it up`);
  return { errors, warnings, seams };
}
// A whole-frame move starts from rest (user, 2026-10-22: 抽动): a camera push written with a cubic ease-out starts at its
// top speed, and the first frames lunge and smear (B48: in on the climbing dot). Where the picture starts to move (a 0.2 s
// step from calm to moving) it is sampled at 1/30 s: a move that changes most of the frame (LUNGE_AREA) and is already at
// LUNGE_SHARE of its peak speed on its first moving frame fails. One element popping in changes a corner, not the frame;
// a light or colour washing over the frame (B02's red flood) changes it evenly, a move changes it at its edges (LUNGE_EDGE:
// the change on the sharpest fifth of the last frame against the change on its flattest half).
export const LUNGE_AREA = 0.35, LUNGE_SHARE = 0.75, LUNGE_EDGE = 2.5;
export function lungeOf(steps, { area = LUNGE_AREA, share = LUNGE_SHARE, edge = LUNGE_EDGE } = {}) {   // steps: [{ t, d, a, e }] at 1/30 s (d: mean change, a: share of the frame changed, e: edge ratio)
  const k = steps.findIndex((x) => x.d > 0.6); if (k < 0) return null;
  const peak = Math.max(...steps.slice(k, k + 9).map((x) => x.d)), top = Math.max(...steps.slice(k, k + 9).map((x) => x.a));
  // a cut changes the frame once and stands; a move keeps going (the next two frames still move at least 40 % as fast)
  const goesOn = (steps[k + 1]?.d ?? 0) >= 0.4 * steps[k].d && (steps[k + 2]?.d ?? 0) >= 0.4 * steps[k].d;
  const moves = steps[k].e == null || steps[k].e >= edge;
  return peak >= 2 && top >= area && goesOn && moves && steps[k].d >= share * peak ? { t: steps[k].t, first: steps[k].d, peak } : null;
}
export async function lungeErrors(page, curve, shots) {
  const starts = curve.filter((p, i) => i > 0 && p.d >= 3 && curve[i - 1].d <= 1).map((p) => p.t - STEP);
  const out = [];
  for (const t0 of starts.slice(0, 24)) {
    const steps = await page.evaluate(async ({ t0 }) => {
      const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d', { willReadFrequently: true });
      let prev = null; const r = [];
      for (let j = 0; j <= 12; j++) { const t = t0 + j / 30, im = window.__frameCanvas ? (window.__measure(t), window.__frameCanvas()) : await (async () => { const i = new Image(); i.src = window.__content(t); await i.decode(); return i; })(); g.drawImage(im, 0, 0, 96, 54); const d = g.getImageData(0, 0, 96, 54).data;
        if (prev) {
          let s = 0, n = 0; const ch = new Float32Array(96 * 54), gr = new Float32Array(96 * 54);
          for (let i = 0, j = 0; i < d.length; i += 4, j++) { const e = (Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2])) / 3; ch[j] = e; s += e; if (e > 10) n++;
            const x = j % 96, y0 = (j / 96) | 0, l = (k) => (prev[k] + prev[k + 1] + prev[k + 2]) / 3; gr[j] = x < 95 && y0 < 53 ? Math.abs(l(i + 4) - l(i)) + Math.abs(l(i + 384) - l(i)) : 0; }
          const idx = Array.from(gr.keys()).sort((p, q) => gr[q] - gr[p]), m = (a) => a.reduce((u, k) => u + ch[k], 0) / Math.max(1, a.length);
          r.push({ t: +t.toFixed(3), d: s / (96 * 54), a: n / (96 * 54), e: +(m(idx.slice(0, idx.length / 5)) / Math.max(0.05, m(idx.slice(idx.length / 2)))).toFixed(2) });
        }
        prev = d.slice(); }
      return r;
    }, { t0 });
    const l = lungeOf(steps); if (!l) continue;
    const s = shots.find((x) => l.t >= x.at && l.t < x.at + x.dur);
    out.push(`${s?.shotId || '?'}: a whole-frame move at ${(l.t - (s?.at || 0)).toFixed(1)} s starts at full speed (${l.first.toFixed(1)} of its peak ${l.peak.toFixed(1)} on the first frame): ease it in (moves.CURVES.inOut, or camera3), the camera starts from rest`);
  }
  return out;
}
// The camera never whips (user, 2026-10-21: 镜头抽动): frame to frame it moves the picture at most CAM_MAX px (1920 wide;
// the accepted reference chapter B07 peaks at 25, the rejected B18 swing at 1116). A run of faster frames fails the beat it
// starts in and says how long the move needs (an in-out ease peaks near twice its mean speed), or to cut there (dur 0).
export const CAM_MAX = 48;
export function whipErrors({ track = [], cuts = [] } = {}, shots, { max = CAM_MAX, fps = 30 } = {}) {
  const errors = [], isCut = (t) => cuts.some((c) => t > c - 1e-6 && t <= c + 1 / fps + 1e-6);
  for (let i = 0; i < track.length; i++) {
    if (track[i].px <= max || isCut(track[i].t)) continue;
    let j = i, sum = 0, peak = 0;
    for (; j < track.length && track[j].px > max * 0.5 && !isCut(track[j].t); j++) { sum += track[j].px; peak = Math.max(peak, track[j].px); }
    for (let b = i - 1; b >= 0 && track[b].px > max * 0.5 && !isCut(track[b].t); b--) sum += track[b].px;
    const t = track[i].t, s = [...shots].reverse().find((x) => x.at <= t + 1e-6) || shots[0];
    const need = Math.ceil((sum * 1.9 / max / fps) * 10) / 10;
    errors.push(`${s.shotId}: the camera whips at ${t.toFixed(1)} s (${peak} px a frame, at most ${max}): give that move about ${need} s (start it earlier, over the end of the beat before), or travel less far`);
    i = j;
  }
  return errors;
}

// A chapter is one take: its camera cuts only where the reference cuts (user 2026-10-22: 9 到 12 秒还是不自然硬切，明明能
//做动效贯彻好). The whip check used to say "or make it a cut (dur 0)", and writers cut where a move came out fast:
// B01 cut at 10.2 and 15.8 s, B23 at 9.8 s, where Vol.138 glides through its first 36 s without one cut. A camera key
// shorter than a frame (cam.cuts, chapter time) passes when the reference cuts within CUT_TOL s of the same moment
// (chapter time mapped linearly onto the reference's span of these lines, span [from, to] and refCuts in film seconds);
// with no reference the cut stands. Owner: the chapter module.
export const CUT_TOL = 1.0;
export function cutErrors(cuts = [], shots, timing = null) {
  if (!timing?.times || !Object.keys(timing.times).length || !cuts.length) return [];
  const out = [];
  for (const c of cuts) {
    if (c < 1e-6) continue;   // the chapter's first frame: the seam before it is the reel's
    const s = [...shots].reverse().find((x) => x.at <= c + 1e-6) || shots[0], local = c - s.at;
    const r = referenceCutAt(timing, s.shotId, local, s.dur, CUT_TOL);
    if (!r.known || r.cut) continue;
    out.push(`${s.shotId}: the camera cuts at ${c.toFixed(1)} s, where the reference keeps one take (no cut near ${r.at.toFixed(1)} s): travel there instead (camera3 dur 1.2 s or more, eased, starting over the end of the beat before), and let what is on screen carry the eye: the mark the camera goes to lights first, the rest of the world stays in the frame on the way`);
  }
  return out;
}
// The board's motion plan, held (keyframes.mjs motionPlanErrors): on the measured camera track (px a frame at 1920,
// __camTrack) the camera moves in the plan's camera steps and stands in the others. A beat whose camera drifts more
// than PLAN_STILL px a frame for PLAN_RUN s inside a hold or content step, or never moves more than that in a camera
// step, fails: the module is built to the approved board, not near it. beats: { <beat>: motion }, shots: chapter shots.
export const PLAN_STILL = 3, PLAN_RUN = 0.4, PLAN_EDGE = 0.25;
export function planTrackErrors(track = [], shots, plans = {}) {
  const out = [];
  for (const s of shots) {
    const m = plans[s.shotId]; if (!m?.steps?.length) continue;
    for (const st of m.steps) {
      const a = s.at + st.from + PLAN_EDGE, b = s.at + st.to - PLAN_EDGE; if (b <= a) continue;
      const fr = track.filter((x) => x.t >= a && x.t <= b);
      if (!fr.length) continue;
      if (st.owner === 'camera') { if (!fr.some((x) => x.px > PLAN_STILL)) out.push(`${s.shotId}: the plan moves the camera ${st.from}-${st.to} s (${st.target || st.what}); it stands still there`); continue; }
      let run = 0, worst = 0, at = null;
      for (const x of fr) { run = x.px > PLAN_STILL ? run + 1 / 30 : 0; if (run > worst) { worst = run; at = x.t - run + 1 / 30; } }   // at: where the drift starts
      if (worst >= PLAN_RUN) out.push(`${s.shotId}: the camera moves at ${(at - s.at).toFixed(1)} s, inside the plan's ${st.owner} step ${st.from}-${st.to} s (${st.what}): one owner at a time; move it in a camera step or keep it still`);
    }
  }
  return out;
}
// where a beat moves most: frames every quarter second, small, the step with the largest change (the motion row of a
// strip is cut there; cut at the storyboard's hero.at it showed ten still frames in three reviews running, B39)
export async function busiestAt(page, from, to, step = 0.25) {
  return page.evaluate(async ({ from, to, step }) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d', { willReadFrequently: true });
    let prev = null, best = -1, at = from;
    for (let t = from; t <= to + 1e-6; t += step) {
      const im = window.__frameCanvas ? (window.__measure(t), window.__frameCanvas()) : await (async () => { const i = new Image(); i.src = window.__content(t); await i.decode(); return i; })();   /* the canvas read small, no PNG round trip */ g.drawImage(im, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data;
      if (prev) { let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); if (s > best) { best = s; at = t - step / 2; } }
      prev = d;
    }
    return at;
  }, { from, to, step });
}
// The geometry of every moment, not of five (the user 2026-10-23: 肯定能从代码上 数学上做好): every GEO_STEP s the type, the
// pictures and the 3D objects under each line are read off the page (morph.js __morphText, __morphShapes,
// __objectCover) and measured as at the keyframes; a fault that stands GEO_HOLD s or more fails the beat it is in (a
// camera passing over a label for a moment is not one). B48's tags pushed out of the frame after its key frame, B44's
// 兒子 under the D for half a beat, were between the moments looked at.
export const GEO_STEP = 0.2, GEO_HOLD = 0.8;   // 0.8: B07's letters flying into the helix pass over it for 0.6 s by design
// a frame reads a few lines at once (the reference: one word or one line on its subject, 4 characters and 1 line a second
// against our 10 and 2; nine whole-film reviews named a title with a sub-title under it and a caption beside, B10 with
// five layers): free lines to read (not a tag on its object, a plate's words, a readout, a strand run off the frame, the
// faint look word) at most TYPE_LINES at once; more standing 0.8 s fails the beat. Data drawn as type (a cloud of loci
// tags, a strand's letters) is on objects and plates and is not counted
export const TYPE_LINES = 3;
// what one reads as one line: pieces set side by side on one baseline (a figure and its unit, rolling digits, 2004 and 年)
// are one; three or more alike (the same size: a scale's years, a list of cousins, a diagram's corners) are one
// item, read as a whole; a name on or just under its picture is the picture's caption, not a line of its own
export function readingLines(drawn, shapes = []) {
  // pictures, not a ground (a texture tiled over the frame is one source drawn many times: every line sat 'under' a tile)
  const ground = groundSources(shapes), pics = shapes.filter((p) => p.kind === 'image' && (p.alpha ?? 1) >= 0.3 && !ground.has(srcOf(p)) && (p.x1 - p.x0) * (p.y1 - p.y0) < 1920 * 1080 / 3 && (p.x1 - p.x0) > 24 && (p.y1 - p.y0) > 24);   // (a chromosome bar is narrow: its Y under it is its label)
  // all sizes grouped first (a strand row's small units and its big 8 次 are one row of data), the small dropped after
  const free = drawn.filter((d) => !(d.object || d.plated || d.readout || d.bleed || d.look || d.pin || (d.alpha ?? 1) < 0.5 || d.size < 16 || !String(d.whole || d.text).trim()))
    .filter((d) => { const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2; return !pics.some((p) => cx > p.x0 && cx < p.x1 && cy > p.y0 - 1.2 * d.size && cy < p.y1 + 1.2 * d.size); });   // on, just above (a card's head) or just under (its name)
  // one baseline: pieces whose middles are level and whose gap is under a size
  const groups = [];
  for (const d of [...free].sort((a, b) => a.x0 - b.x0)) {
    const cy = (d.y0 + d.y1) / 2, g = groups.find((q) => Math.abs(q.cy - cy) < 0.35 * Math.max(q.size, d.size) && d.x0 - q.x1 < Math.max(q.size, d.size) && d.x0 >= q.x0 - 2);
    if (g) { g.x1 = Math.max(g.x1, d.x1); g.text += ' ' + (d.whole || d.text); g.size = Math.max(g.size, d.size); g.items.add(d.whole || d.text); }
    else groups.push({ x0: d.x0, x1: d.x1, cy, size: d.size, text: String(d.whole || d.text), items: new Set([d.whole || d.text]) });
  }
  // a data row (a strand's units: 甲 AATG AATG … 8 次) is data, not a line to read; a figure alone (a year, a count) and the
  // words beside or under it are one item (1998 區域性 DNA 數據庫 on a timeline)
  const data = (g) => { const w = g.text.split(/\s+/), n = {}; for (const x of w) n[x] = (n[x] || 0) + 1; return Math.max(0, ...Object.values(n)) >= 3 && new Set(w).size <= Math.ceil(w.length / 3); };
  for (let i = groups.length - 1; i >= 0; i--) if (data(groups[i])) groups.splice(i, 1);
  for (let i = groups.length - 1; i >= 0; i--) if (groups[i].size < CROSS_MIN) groups.splice(i, 1);   // too small to be a line to read
  const figure = (g) => /^[\d\s.,—–\-·:%]+$/.test(g.text);
  for (const f of groups.filter(figure)) {
    const mate = groups.find((h) => h !== f && !figure(h) && !h.mated && Math.abs(h.cy - f.cy) < 1.6 * f.size && h.x0 < f.x1 + 1.5 * f.size && h.x1 > f.x0 - 1.5 * f.size);
    if (mate) { mate.mated = true; mate.text = `${f.text} ${mate.text}`; groups.splice(groups.indexOf(f), 1); }
  }
  // a series: three or more alike (the same size)
  const used = new Set(), out = [];
  for (const g of groups) {
    if (used.has(g)) continue;
    // (the same size however they lie: a diagram's corners, a scale, a list are read as one set)
    const alike = groups.filter((h) => !used.has(h) && Math.abs(h.size - g.size) < 0.12 * g.size);
    if (alike.length >= 3) { alike.forEach((h) => used.add(h)); out.push(`${alike[0].text} … (${alike.length})`); }
    else { used.add(g); out.push(g.text); }
  }
  return out;
}
export function typeLoadErrors(drawn, beatId, shapes = []) {
  const lines = readingLines(drawn, shapes);
  return lines.length > TYPE_LINES ? [`${beatId}: ${lines.length} lines to read at once (${lines.slice(0, 6).map((x) => `"${x}"`).join(' ')}; keep ${TYPE_LINES} or fewer: the reference sets one line on its subject): let a sub-title or a caption go, or let one leave before the next comes`] : [];
}
// type in the frame keeps a margin from its edge: TEXT_MARGIN px (B29's place name rode the camera's tilt to 4 px under
// the top edge for 3 s and read as cut, whole-film review 9, 2026-10-26; the reference's titles stand well inside)
export const TEXT_MARGIN = 24;
export function textEdgeErrors(drawn, beatId) {
  // a band laid across the frame on purpose (kit2 tape: bleed) runs off it
  return [...new Set(drawn.filter((d) => d.size >= CROSS_MIN && (d.alpha ?? 1) >= 0.5 && !d.look && !d.bleed && String(d.text).trim()).map((d) => {
    const w = d.x1 - d.x0, h = d.y1 - d.y0; if (w <= 0 || h <= 0) return null;
    const ix = Math.max(0, Math.min(d.x1, 1920) - Math.max(d.x0, 0)), iy = Math.max(0, Math.min(d.y1, 1080) - Math.max(d.y0, 0)), inside = (ix * iy) / (w * h);
    if (inside > 0.3 && inside < 0.97) return `${beatId}: "${d.text}" (${Math.round(d.size)} px) is cut by the frame's edge`;
    // measured to the ink above and below (the em box less what crossErrors leaves: a CJK face inks about 0.9 em, Latin and
    // figures to their cap height: STR at 219 px stood 47 px under the top by its ink, 21 by its box)
    const top = d.y0 + (/[\u3400-\u9fff\uf900-\ufaff]/.test(d.text) ? 0.04 : 0.12) * d.size, bottom = d.y1 - 0.04 * d.size;
    const gap = Math.min(d.x0, top, 1920 - d.x1, 1080 - bottom);
    return inside >= 0.97 && gap < TEXT_MARGIN ? `${beatId}: "${d.text}" (${Math.round(d.size)} px) hugs the frame's edge (${Math.max(0, Math.round(gap))} px from it, keep ${TEXT_MARGIN}): move it in, or let the camera leave it before it reaches the edge` : null;
  }).filter(Boolean))];
}
// type half on a 3D object (the object not its owner, not a ground): a line between OBJECT_LO and OBJECT_HI of its box
// on an object's visible part is cut by it; wholly on it (a name printed on its own plate) or clear of it is not
export const OBJECT_LO = 0.15, OBJECT_HI = 0.75;
export function objectErrors(drawn, cover, beatId) {
  if (!cover) return [];
  return [...new Set(drawn.map((d, i) => {
    // words on a 2D plate drawn over the 3D (a portrait frame's grey) hide what 3D lies under them
    if (d.look || d.plated || d.onFill || (d.alpha ?? 1) < 0.3 || !String(d.text).trim()) return null;
    // words standing in the scene (surfaceType depth: type behind or before the subject) are hidden by what is in front of
    // them in the render itself: their overlap with a thing is the move, not a fault
    if (d.inScene) return null;
    // a thing's own marking (surfaceType read: false, a hull's name) is not a line offered to be read: its own decks hiding
    // part of it as the camera turns is the thing, not a fault (Suez B02, 長賜號 under the stacks, 2026-10-27)
    if (d.texture) return null;
    // a thin 3D piece (a link of a tree, a rule: under a hundredth of the frame) run across words, an object's too: the 2D line
    // check cannot see it (B44's names under their frames had the tree's 3D links through them, blind review 2026-10-26)
    const thin = d.size >= LINE_MIN && (cover[i] || []).find((c) => c.area != null && c.area < 0.01 && c.share >= 0.03 && c.share <= OBJECT_LO);
    if (thin) return `${beatId}: "${d.text}" (${Math.round(d.size)} px) has a thin 3D piece run across it (${thin.name}, ${Math.round(thin.share * 100)} % of it): set it clear of the links`;
    // a tag is read too: its own object (the one it is pinned by) is out of the cover already, a neighbour's is not (B13's
    // D5S818 lay on the chromosome beside its own, unseen while tags were let off)
    if (d.size < CROSS_MIN) return null;
    const hit = (cover[i] || []).find((c) => c.share > OBJECT_LO && c.share < OBJECT_HI);
    return hit ? `${beatId}: "${d.text}" (${Math.round(d.size)} px) is half under a 3D object (${Math.round(hit.share * 100)} % of it covered by ${hit.name}): set it clear of the object or wholly on it` : null;
  }).filter(Boolean))].slice(0, 4);
}
// On the word (the user 2026-10-23, B09: 是否卡住了节奏呢 原片说话的 字幕节奏 — 兩份 DNA came 1.4 s before it was said, the
// box on 一小段 1.6 s after): a line on screen that is words of the narration comes when they are said. Its first moment
// (from the geometry track) against the moment its words fall in the beat's line, by characters (at + dur x index /
// length); more than CUE_EARLY s before or CUE_LATE s after fails. Lines already there from the beat before, and
// words the line does not say, are not timed. toHant: the narration in the screen's script
export const CUE_EARLY = 0.8, CUE_LATE = 1.2, TERM_PX = 150, TERM_CHARS = 6;   // TERM_*: as morph.js
const bare = (x) => String(x).replace(/[\s，。、；：？！「」『』“”"'·・,.;:?!()（）\-—–]/g, '');
export function cueTimingErrors(track, shots, toHant = (x) => x, { schedule = {} } = {}) {
  const first = new Map();
  // a line typed out a character at a time is timed once, by its first characters (each longer prefix is the same line going on)
  // (the beat's term set as its title, a few characters at TERM_PX or more, stands from its line's start as the reference's
  // STR and IBD do — morph.js lets it through its cue gate; whole-film review 2026-10-25)
  // (a term once at that size is not timed when it later shrinks: B01's 甘肅 白銀 read late at 2.4 s)
  // (a line set run by run — 23 and 萬枚 of 23萬枚 — is timed as its whole line, d.whole)
  const L = (d) => d.whole || d.text;
  const terms = new Set(track.flatMap((f) => f.drawn.filter((d) => d.size >= TERM_PX && bare(L(d)).length <= TERM_CHARS && /[^\d.,%:+×x]/.test(bare(L(d)))).map((d) => bare(L(d)))));
  for (const f of track) for (const d of f.drawn) { if (d.look || (d.alpha ?? 1) < 0.5 || terms.has(bare(L(d)))) continue; const k = bare(L(d)); if (k.length >= 2 && !first.has(k) && ![...first.keys()].some((p) => k.startsWith(p))) first.set(k, { t: f.t, text: L(d) }); }
  const out = [];
  for (const s of shots) {
    const line = bare(toHant(s.text || '')); if (!line) continue;
    for (const [k, v] of first) {
      if (v.t < s.at || v.t >= s.at + s.dur) continue;   // comes in this beat
      const i = line.indexOf(k); if (i < 0) continue;
      const spoken = schedule[s.shotId], spokenAt = spoken?.text?.indexOf(k);
      const measuredDue = spokenAt >= 0 && Number.isFinite(spoken.times[spokenAt]) ? spoken.times[spokenAt] : null;
      const due = measuredDue ?? s.at + (s.dur * i) / line.length, dt = v.t - due;
      if (dt < -CUE_EARLY || dt > CUE_LATE) out.push(`${s.shotId}: "${v.text}" comes at ${(v.t - s.at).toFixed(1)} s, its words are said at ${(due - s.at).toFixed(1)} s (${dt > 0 ? 'late' : 'early'} by ${Math.abs(dt).toFixed(1)} s): bring it on its words (at + dur x index / length)`);
    }
  }
  return out.slice(0, 6);
}
// A thing at rest starts at full speed (the user 2026-10-23: 很多字尤其小字经常出现一卡一卡的感觉 乱动 — B39's 1 代 stood
// still to 7.90 s and at 7.93 s went 29 px in one frame, then slowed: an 'out' curve on a thing already on screen): every
// frame (1/30 s) each line's place is read; a line that moved under HOP_REST px in the last frame and HOP_MOVE px or more in
// this one has no start and fails its beat (ease it in: inOut, or a slide only for what enters). A frame where most lines
// jump at once is a cut, not a start
export const HOP_REST = 0.6, HOP_MOVE = 8;
export async function textTrack(page, total, step = 1 / 30) {
  return page.evaluate(({ total, step }) => { const o = []; for (let t = 0; t <= total + 1e-6; t += step) { (window.__measure || window.__content)(t); o.push({ t: +t.toFixed(3), d: window.__morphText().filter((x) => (x.alpha ?? 1) >= 0.5 && !x.look).map((x) => [x.text, +x.x0.toFixed(2), +x.y0.toFixed(2), Math.round(x.size)]) }); } return o; }, { total, step });
}
export function hopErrors(track, shots) {
  const out = new Map(), beatOf = (t) => shots.find((s) => t >= s.at && t < s.at + s.dur);
  const match = (prev, line) => { let b = null; for (const q of prev) if (q[0] === line[0]) { const d = Math.hypot(q[1] - line[1], q[2] - line[2]); if (d < 90 && (!b || d < b.d)) b = { d, q }; } return b; };
  // a line repeated in the frame (twelve 200s on twelve height walls, the bases' letters) cannot be told apart from frame to
  // frame: matched to the nearest of its name it gave false hops under a fast push (B30), so only lines unique in the frame are followed
  const uniq = (d) => { const n = new Map(); for (const L of d) n.set(L[0], (n.get(L[0]) || 0) + 1); return d.filter((L) => n.get(L[0]) === 1); };
  for (let i = 2; i < track.length; i++) {
    const a = uniq(track[i - 2].d), b = uniq(track[i - 1].d), c = uniq(track[i].d), hops = [];
    let moved = 0, seen = 0;
    for (const L of c) { const mb = match(b, L); if (!mb) continue; seen++; if (mb.d >= HOP_MOVE) moved++; const ma = match(a, mb.q); if (ma && ma.d < HOP_REST && mb.d >= HOP_MOVE) hops.push([L, mb.d]); }
    if (!hops.length || (seen >= 3 && moved / seen >= 0.6)) continue;   // a cut moves everything at once
    const s = beatOf(track[i].t); if (!s) continue;
    for (const [L, d] of hops) { const k = `${s.shotId}|${L[0]}`; if (!out.has(k)) out.set(k, `${s.shotId}: "${L[0]}" (${L[3]} px) stands still, then goes ${Math.round(d)} px in one frame at ${(track[i].t - s.at).toFixed(1)} s: ease its start (inOut; a slide's 'out' only for what enters)`); }
  }
  return [...out.values()].slice(0, 6);
}
export async function geometryTrack(page, total, step = GEO_STEP) {
  return page.evaluate(async ({ total, step }) => {
    const out = [];
    for (let frame = 0; frame <= Math.floor((total + 1e-6) / step); frame++) {
      const t = +(frame * step).toFixed(6);
      (window.__measure || window.__content)(t);
      const drawn = window.__morphText(), shapes = window.__morphShapes ? window.__morphShapes() : [];
      const cover = window.__objectCover ? window.__objectCover(drawn.map((d) => [d.x0, d.y0 + 0.12 * d.size, d.x1, d.y1 - 0.08 * d.size, d.pin || null])) : null;
      // slimmed in the page, as saveTrack keeps it: a chapter's whole track in one message ran to tens of MB, and with five
      // checks at once one came back cut (playwright: Unexpected end of JSON input) and took the round down (2026-10-26)
      const r1 = (o) => { const q = {}; for (const k in o) { const v = o[k]; q[k] = typeof v === 'number' ? Math.round(v * 10) / 10 : v; } return q; };
      const camera = window.__morphCamera ? window.__morphCamera(t) : null;
      out.push({ t: +t.toFixed(2), drawn: drawn.map(r1), shapes: shapes.filter((p) => p.kind !== 'line' || (p.alpha ?? 1) >= 0.25).map(r1), cover, camera });
    }
    return out;
  }, { total, step });
}
// A snap of the whole picture (the user 2026-10-25: 镜头做的抽动不成熟, 突然回了一下): in one sample (STEP) the frame
// shifts JERK_PX or more (on 1920) as one piece — the best match beats standing still by far — while the samples either
// side move under a third of it. A cut (no match) and a sweeping move (its neighbours move too) are not snaps.
export const JERK_PX = 50;
export function jerkErrors(curve, shots) {
  const v = curve.map((p) => (p.dx == null ? 0 : Math.hypot(p.dx, p.dy) * 20)), out = [];
  curve.forEach((p, i) => {
    if (v[i] < JERK_PX || !(p.mq < 0.6)) return;
    // Beat boundaries are measured too: Vol.138 hid 60 px whole-frame jumps behind this exemption.
    // Real cuts have no match (mq), whips/sweeps keep their neighbours moving; planned cuts are separately checked by cutErrors.
    const n = Math.max(v[i - 1] ?? 0, v[i + 1] ?? 0); if (n > v[i] / 3) return;
    const s = shots.find((x) => p.t >= x.at && p.t < x.at + x.dur);
    out.push(`${s?.shotId || '?'}: the whole picture jumps ${Math.round(v[i])} px in ${STEP} s at ${(p.t - (s?.at ?? 0)).toFixed(1)} s with the camera still either side: ease the move in and out (one camera, from rest to rest), or cut where the reference cuts`);
  });
  return out.slice(0, 4);
}
// One frame, two faces (the user 2026-10-25: 怎么字体不统一呢 at 3:05; the reference sets every label and figure in one
// condensed face and its Chinese in one gothic, the hierarchy by size alone): the type standing on a frame, readable and
// not the look's texture word, in at most FACE_MAX house faces; 廻想体 never sets Chinese (morph.js swaps it)
// (one face a role: morph.js sets big Chinese in 思源黑体 Heavy (House Gothic), small in 黒華明朝, every Latin line and figure in 廻想体; B16 had
// TPOX, CSF1PO, vWA and 1000 in four faces, B08 31.6, 99.9 % and 0.1 % in three)
export const FACE_MAX = 2, LATIN_FACE_MAX = 1, ALL_FACE_MAX = 3;
const HAN = /[\u3400-\u9fff]/;
// a keyframe's fingerprint: 64 x 36 grey levels (base64); two pictures are the same when no cell differs by more than
// PRINT_CELL levels and the mean by more than PRINT_MEAN (grain and a 3D frame's sub-pixel noise stay under them; a moved
// label, a new word or a changed colour do not)
export const PRINT_CELL = 28, PRINT_MEAN = 1.6;
export function picPrint(file) {
  if (!fs.existsSync(file)) return null;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=64:36:flags=area,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  return r.status === 0 && r.stdout?.length === 64 * 36 ? r.stdout.toString('base64') : null;
}
export function samePrints(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return false;
  return a.every((x, i) => { if (!x || !b[i]) return false; const p = Buffer.from(x, 'base64'), q = Buffer.from(b[i], 'base64'); if (p.length !== q.length) return false; let sum = 0; for (let k = 0; k < p.length; k++) { const d = Math.abs(p[k] - q[k]); if (d > PRINT_CELL) return false; sum += d; } return sum / p.length <= PRINT_MEAN; });
}
export function faceMixErrors(drawn, beatId) {
  // a middle dot alone (the · of 8·05, drawn round in the gothic: morph.js face()) is punctuation, not a third face
  const on = drawn.filter((d) => d.face && !d.look && (d.alpha ?? 1) >= 0.5 && d.size >= 18 && String(d.text).trim() && !/^[\s\u00b7\u2027\u30fb]+$/.test(String(d.text)));
  const han = [...new Set(on.filter((d) => HAN.test(String(d.text))).map((d) => d.face))], lat = [...new Set(on.filter((d) => !HAN.test(String(d.text))).map((d) => d.face))];
  const out = [];
  const all = [...new Set(on.map((d) => d.face))];
  const eg = (faces, pick) => faces.map((f) => `${f}: ${[...new Set(on.filter((d) => d.face === f && pick(d)).map((d) => `"${String(d.whole || d.text).trim()}"`))].slice(0, 3).join(' ')}`).join('; ');
  if (lat.length > LATIN_FACE_MAX) out.push(`${beatId}: labels and figures in ${lat.length} faces in one frame (${eg(lat, (d) => !HAN.test(String(d.text)))}): every code, name and number in one face at every size (the reference's condensed labels), the hierarchy by size`);
  if (han.length > FACE_MAX) out.push(`${beatId}: Chinese in ${han.length} faces in one frame (${eg(han, (d) => HAN.test(String(d.text)))}): one face for big Chinese, 黒華明朝 for small`);
  if (all.length > ALL_FACE_MAX) out.push(`${beatId}: ${all.length} faces in one frame (${all.join(', ')}): one a role — big Chinese, small Chinese, labels and figures`);
  // (a lettered film may take 廻想体 as its big face, house.mjs letterRoles: the small Chinese it never sets, DISPLAY_MIN)
  const kaiso = on.filter((d) => d.face === 'House Kaiso' && HAN.test(String(d.text)) && d.size < 90);
  if (kaiso.length) out.push(`${beatId}: "${kaiso[0].text}" set in 廻想体: its Chinese reads as icons; Latin and figures only`);
  return out;
}
// Type that creeps while it stands (the user 2026-10-26: 怎么字还漂移): a free line (not a tag on its object, a plate's
// words, a bleed, the look word, a readout, a picture's caption) shown at full strength that moves on — for CREEP_MIN s and CREEP_PX in all (or CREEP_SCALE) fails its beat.
// The reference's standing type is still half of the time and moves 2 px a second at the median; ours was still 14 % and
// moved 5.7 (1 fps OCR of both films). A quick move into place is not a creep
export const CREEP_STEP = 200, CREEP_MIN = 1.2, CREEP_PX = 12, CREEP_SCALE = 0.04;   // CREEP_STEP: past it a step is a cut, not a move
// a picture's caption follows its picture: a small picture (a portrait, a card: under an eighth of the frame, not a ground)
// and a line on it or just above or under it. A map or a plate behind the type is not its picture (B01's 甘肅 白銀 on the
// map, B34's years on the time line were let off as captions and every title's creep went unseen)
export const CAPTION_AREA = 1 / 8;
const isCaption = (d, shapes, ground = groundSources(shapes || [])) => { const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2; return (shapes || []).some((p) => p.kind === 'image' && (p.alpha ?? 1) >= 0.3 && !ground.has(srcOf(p)) && (p.x1 - p.x0) > 24 && (p.y1 - p.y0) > 24 && (p.x1 - p.x0) * (p.y1 - p.y0) < 1920 * 1080 * CAPTION_AREA && cx > p.x0 && cx < p.x1 && cy > p.y0 - 1.2 * d.size && cy < p.y1 + 1.2 * d.size); };
export function creepErrors(track, shots) {
  const beatOf = (t) => shots.find((s) => t >= s.at && t < s.at + s.dur)?.shotId, ser = new Map(), out = [];
  for (const f of track) { const seen = new Set(), ground = groundSources(f.shapes || []); for (const d of f.drawn || []) { if (d.object || d.pin || d.plated || d.bleed || d.look || d.readout || d.size < CROSS_MIN || !String(d.text).trim()) continue; const k = String(d.whole || d.text); if (seen.has(k)) continue; seen.add(k); if (isCaption(d, f.shapes, ground)) continue; (ser.get(k) || ser.set(k, []).get(k)).push({ t: f.t, x: (d.x0 + d.x1) / 2, y: (d.y0 + d.y1) / 2, s: d.size, al: d.alpha ?? 1 }); } }
  for (const [k, pts] of ser) {
    let run = [];
    const flush = () => { if (run.length >= 2) { const a = run[0], b = run[run.length - 1], dist = Math.max(...run.map((p) => Math.hypot(p.x - a.x, p.y - a.y))), ds = Math.max(...run.map((p) => Math.abs(p.s - a.s) / a.s));   /* the farthest it strays (a creep there and back is a creep) */ if (b.t - a.t >= CREEP_MIN - 1e-6 && (dist >= CREEP_PX || ds >= CREEP_SCALE)) out.push(`${beatOf(a.t) || shots[0]?.shotId}: "${k}" creeps ${Math.round(dist)} px${ds >= 0.01 ? ` and ${Math.round(ds * 100)} % in size` : ''} while it stands (${a.t.toFixed(1)}-${b.t.toFixed(1)} s; the reference's standing type is still): hold it on the screen, or let it go before the camera moves`); } run = []; };
    for (const p of pts) { const q = run[run.length - 1]; const slow = q && p.al >= 0.85 && q.al >= 0.85 && p.t - q.t <= 0.3 && Math.hypot(p.x - q.x, p.y - q.y) <= CREEP_STEP && Math.abs(p.s - q.s) / q.s <= 0.2 && (Math.hypot(p.x - q.x, p.y - q.y) >= 0.5 || Math.abs(p.s - q.s) / q.s >= 0.002); if (!q) { if (p.al >= 0.85) run.push(p); } else if (slow) run.push(p); else { flush(); if (p.al >= 0.85) run.push(p); } }
    flush();
  }
  return [...new Set(out)].slice(0, 6);
}
// Words on a plate of the accent (the user 2026-10-26: 不要红底的文字 有点丑): kit2's tags and tapes set their words in the
// accent with a thin rule now; a line that half sits on a red block drawn under it fails its beat
export function redPlateErrors(drawn, beatId) {
  const hit = drawn.filter((d) => d.redPlate && (d.alpha ?? 1) >= 0.5 && d.size >= 16 && String(d.text).trim());
  return hit.length ? [`${beatId}: words on a red plate (${[...new Set(hit.map((d) => `"${d.whole || d.text}"`))].slice(0, 4).join(' ')}): set them in red or white with a thin rule, no plate under them`] : [];
}
// Words dressed up (the user 2026-10-26: 不要加字描边阴影 下面或者侧面的红线什么的): a line set with a shadow or an
// outline (morph.js decoOf), or with a thin bar of the accent under it or beside it — a rule DECO_RULE px thick or less
// laid within DECO_NEAR px of the line's foot along half its width, or of its side along half its height. The words
// stand alone; emphasis is their colour and size. The look's texture word and lines of 16 px and under are not read.
export const DECO_RULE = 8, DECO_NEAR = 16;
export function decoErrors(drawn, shapes, beatId) {
  const lines = drawn.filter((d) => !d.look && (d.alpha ?? 1) >= 0.5 && d.size > 16 && String(d.text).trim()), out = new Set();
  // (a faint rule is a rule: a 30 % hairline under 全世界的貿易 passed at the old 0.5 and a reviewer saw it, Suez B06)
  const rules = (shapes || []).filter((p) => (p.kind === 'rule' || p.kind === 'fill') && (p.alpha ?? 1) >= 0.2 && Math.min(p.x1 - p.x0, p.y1 - p.y0) <= DECO_RULE);
  const along = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  for (const d of lines) {
    const name = `"${d.whole || d.text}"`;
    if (d.deco) { out.add(`${name} has a ${d.deco}`); continue; }
    const W = d.x1 - d.x0, H = d.y1 - d.y0;
    const r = rules.find((p) => { const flat = p.x1 - p.x0 > p.y1 - p.y0;
      return flat ? p.y0 >= d.y1 - DECO_RULE && p.y0 <= d.y1 + DECO_NEAR && along(p.x0, p.x1, d.x0, d.x1) >= 0.5 * W && p.x1 - p.x0 <= 3 * W + 2 * H
        : along(p.y0, p.y1, d.y0, d.y1) >= 0.5 * H && p.y1 - p.y0 <= 3 * H && ((p.x1 <= d.x0 + 2 && p.x1 >= d.x0 - DECO_NEAR) || (p.x0 >= d.x1 - 2 && p.x0 <= d.x1 + DECO_NEAR)); });
    if (r) out.add(`${name} has an accent rule ${r.x1 - r.x0 > r.y1 - r.y0 ? 'under' : 'beside'} it`);
  }
  return out.size ? [`${beatId}: words dressed up (${[...out].slice(0, 4).join('; ')}): no outline, shadow or red rule under or beside a line (the user 2026-10-26); let the words stand alone, emphasis by colour and size`] : [];
}
// Motion that does not sit together (the user 2026-10-26: 画面运动不和谐 … 都能通过代码审查出): every thing on the
// frame (a line, a picture), matched to itself a step later by its name where the name is unique in both frames (a row of
// A T C G matched by name mixed the letters up), its screen velocity read off the geometry track. Three faults:
//  - a dead stop: moving MOTION_FAST px/s or more, then at rest the next step (no ease out; the reference moves rest to rest);
//  - a bounce: moving one way, then back the other within MOTION_BACK s, both legs MOTION_MIN px/s or more;
//  - motion at odds: the camera taken out (a scale and a shift fitted to everything, the worst third left out), three or
//    more things moving MOTION_MIN px/s or more in three different directions at once for MOTION_HOLD s.
export const MOTION_FAST = 150, MOTION_MIN = 80, MOTION_BACK = 0.6, MOTION_HOLD = 0.6;
function motionItems(f) {
  const m = new Map(), dup = new Set(), put = (k, v) => { if (m.has(k)) dup.add(k); else m.set(k, v); };
  for (const d of f.drawn || []) if (String(d.text).trim() && (d.alpha ?? 1) >= 0.5 && !d.surface) put(`t:${d.whole || d.text}`, d);   // (words on a thing move as the thing: its own motion)
  for (const p of f.shapes || []) if (p.kind === 'image' && (p.alpha ?? 1) >= 0.3 && (p.x1 - p.x0) > 30 && (p.y1 - p.y0) > 30) put(`i:${p.src}`, p);
  for (const k of dup) m.delete(k); return m;
}
const centre = (p) => [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2];
export function motionErrors(track, shots) {
  const beatOf = (t) => shots.find((s) => t >= s.at && t < s.at + s.dur)?.shotId || shots[0]?.shotId, out = [];
  const items = track.map(motionItems), vel = [];   // vel[i]: Map key -> [vx, vy] from step i-1 to i
  for (let i = 1; i < track.length; i++) {
    const dt = track[i].t - track[i - 1].t, V = new Map(); if (dt <= 0 || dt > 0.3) { vel.push(V); continue; }
    for (const [k, b] of items[i]) { const a = items[i - 1].get(k); if (!a) continue; const [ax, ay] = centre(a), [bx, by] = centre(b); if (Math.hypot(bx - ax, by - ay) > 300) continue; V.set(k, [(bx - ax) / dt, (by - ay) / dt]); }   // past 300 px in a step: a cut
    vel.push(V);
  }
  const say = new Map(), note = (key, msg) => { if (!say.has(key)) say.set(key, msg); };
  for (let i = 1; i < vel.length; i++) for (const [k, v] of vel[i]) {
    const u = vel[i - 1].get(k); if (!u) continue; const su = Math.hypot(...u), sv = Math.hypot(...v), t = track[i + 1].t, name = k.slice(2, 24);
    // a dead stop: still going at seven tenths of the move's top speed or more the step before it stands (an eased move
    // has slowed to a third of its top by its last step), and many at once are the camera stopping dead
    const top = Math.max(su, ...[2, 3, 4].map((j) => (vel[i - j]?.get(k) ? Math.hypot(...vel[i - j].get(k)) : 0)));
    // moving the two steps before too: a move of 0.4 s or less is two samples, eased or not they read alike (B34's 1998 let go
    // over 0.4 s, eased, read as a dead stop); one step from rest to rest is a hop (hopErrors) or a namesake elsewhere
    const before = vel[i - 2]?.get(k), before2 = vel[i - 3]?.get(k);
    if (su >= MOTION_FAST && sv < 10 && su >= 0.7 * top && before && Math.hypot(...before) >= MOTION_MIN && before2 && Math.hypot(...before2) >= MOTION_MIN) { const key = `stop|${Math.round(t * 5)}`; const was = say.get(key); say.set(key, was ? was.replace(/\((\d+) things?\)/, (_, n) => `(${+n + 1} things)`) : `${beatOf(t)}: "${name}" stops dead from ${Math.round(su)} px/s at ${t.toFixed(1)} s (1 thing): ease it to rest`); }
    if (su >= MOTION_MIN && sv >= MOTION_MIN && (u[0] * v[0] + u[1] * v[1]) / (su * sv) < -0.5) note(`back|${k}|${Math.round(t)}`, `${beatOf(t)}: "${name}" goes one way and straight back at ${t.toFixed(1)} s: one move, rest to rest`);
  }
  // motion at odds, the camera taken out
  let run = [];
  const flush = () => { if (run.length && run[run.length - 1].t - run[0].t >= MOTION_HOLD - 1e-6) note(`odds|${Math.round(run[0].t)}`, `${beatOf(run[0].t)}: ${Math.max(...run.map((r) => r.n))} things move in ${Math.max(...run.map((r) => r.dirs))} directions at once (${run[0].t.toFixed(1)}-${run[run.length - 1].t.toFixed(1)} s: ${run[0].who.join(', ')}): one move at a time, or all with the camera`); run = []; };
  for (let i = 1; i < track.length; i++) {
    const A = items[i - 1], B = items[i], dt = track[i].t - track[i - 1].t, P = [];
    for (const [k, b] of B) { const a = A.get(k); if (a) P.push([...centre(a).map((x, j) => x - (j ? 540 : 960)), ...centre(b).map((x, j) => x - (j ? 540 : 960)), k]); }
    if (P.length < 4 || dt <= 0) { flush(); continue; }
    const fit = (Q) => { const n = Q.length, ax = Q.reduce((u, p) => u + p[0], 0) / n, ay = Q.reduce((u, p) => u + p[1], 0) / n, bx = Q.reduce((u, p) => u + p[2], 0) / n, by = Q.reduce((u, p) => u + p[3], 0) / n; let num = 0, den = 0; for (const p of Q) { num += (p[0] - ax) * (p[2] - bx) + (p[1] - ay) * (p[3] - by); den += (p[0] - ax) ** 2 + (p[1] - ay) ** 2; } const s = den > 1 ? num / den : 1; return [s, bx - s * ax, by - s * ay]; };
    let [s, tx, ty] = fit(P); const res = (p) => Math.hypot(p[2] - (s * p[0] + tx), p[3] - (s * p[1] + ty));
    [s, tx, ty] = fit([...P].sort((a, b) => res(a) - res(b)).slice(0, Math.max(3, Math.ceil(P.length * 0.66))));
    // what rides the 3D (a line pinned to a point, a set of one picture drawn three times or more over a map: its pins, and the
    // words beside them) moves in the camera's perspective, not as a scale and a shift: not a thing moving on its own (B01's
    // map turned and its pins went four ways under the held title)
    const fr = track[i], srcN = {}; for (const p of fr.shapes || []) if (p.kind === 'image') srcN[p.src] = (srcN[p.src] || 0) + 1;
    const set = (fr.shapes || []).filter((p) => p.kind === 'image' && srcN[p.src] >= 3);
    const rides = (k) => { const b = B.get(k); if (!b) return false; if (b.pin || (k.startsWith('i:') && srcN[b.src] >= 3)) return true; const [cx, cy] = centre(b); return k.startsWith('t:') && set.some((p) => cx > p.x0 - 60 && cx < p.x1 + 60 && cy > p.y0 - 60 && cy < p.y1 + 60); };
    const movers = P.filter((p) => !rides(p[4])).map((p) => { const rx = p[2] - (s * p[0] + tx), ry = p[3] - (s * p[1] + ty), v = Math.hypot(rx, ry) / dt; return v >= MOTION_MIN && v < 300 / dt ? { k: p[4], dir: Math.round(((Math.atan2(ry, rx) + Math.PI) / (2 * Math.PI)) * 8) % 8 } : null; }).filter(Boolean);
    const dirs = new Set(movers.map((m) => m.dir)).size;
    if (dirs >= 3) run.push({ t: track[i].t, n: movers.length, dirs, who: movers.slice(0, 4).map((m) => m.k.slice(2, 14)) }); else flush();
  }
  flush();
  return [...say.values()].slice(0, 8);
}

// Type that blinks (the user 2026-10-26: 乱闪): a line shown, gone for FLICKER_MAX s or less, and back (B27's 27 loci
// tags all off for 0.6 s at the push and on again) fails its beat. A readout changes its words and is not a blink
export const FLICKER_MAX = 1.0;
export function flickerErrors(track, shots) {
  const beatOf = (t) => shots.find((s) => t >= s.at && t < s.at + s.dur)?.shotId, seen = new Map(), out = [];
  track.forEach((f, i) => { for (const d of f.drawn || []) { if (d.readout || (d.alpha ?? 1) < 0.5 || d.size < 20 || !String(d.text).trim()) continue; const k = String(d.whole || d.text); const s = seen.get(k) || seen.set(k, []).get(k); if (s[s.length - 1]?.i !== i) s.push({ i, x: (d.x0 + d.x1) / 2, y: (d.y0 + d.y1) / 2, size: d.size }); } });
  // back where it was (within 1.5 of its size): a blink; elsewhere it is another line of the same words (a tube's label, then the card's)
  for (const [k, pts] of seen) for (let j = 1; j < pts.length; j++) { const p = pts[j - 1], q = pts[j], a = track[p.i].t, b = track[q.i].t, gap = b - a; if (gap > 0.3 && gap <= FLICKER_MAX + 0.2 && Math.hypot(q.x - p.x, q.y - p.y) <= 1.5 * Math.max(p.size, q.size)) out.push(`${beatOf(b) || shots[0]?.shotId}: "${k}" goes and comes back within ${gap.toFixed(1)} s (${a.toFixed(1)}-${b.toFixed(1)} s): keep it, or let it go for good`); }
  // many lines blinking together are one fault
  const byTime = new Map(); for (const e of out) { const m = /\(([\d.]+)-([\d.]+) s\)/.exec(e); const key = `${e.split(':')[0]}@${m?.[1]}`; if (!byTime.has(key)) byTime.set(key, { e, n: 0 }); byTime.get(key).n++; }
  return [...byTime.values()].map(({ e, n }) => (n > 1 ? `${e} (and ${n - 1} more at once)` : e)).slice(0, 6);
}

// The geometry track of a chapter's last check kept on disk (track.json: every GEO_STEP s, the type, the pictures and the
// 3D cover read off the page), so a check that changes is tried on every chapter in seconds, without rendering again
// (2026-10-26: two new checks went out uncalibrated — one failed seven beats wrongly, one counted nothing — and each was
// found only after all ten chapters were rendered again). replayChecks runs the geometry checks on the kept tracks.
const trackFile = (cfg, id, g) => path.join(outDir(cfg, id, g), 'track.json');
const slimShape = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 10) / 10 : v]));
export function saveTrack(cfg, id, g, code, track) {
  try {
    const slim = track.map((f) => ({ ...f, shapes: (f.shapes || []).filter((p) => p.kind !== 'line' || (p.alpha ?? 1) >= 0.25).map(slimShape), drawn: (f.drawn || []).map(slimShape) }));
    writeJson(trackFile(cfg, id, g), { contract: 'A1ChapterTrack/v1', chapter: g.id, codeHash: sha(code), at: new Date().toISOString(), shots: g.shots.map((s) => ({ shotId: s.shotId, at: s.at, dur: s.dur, text: s.text || '' })), track: slim });
  } catch { /* a track not kept is checked again by a render */ }
}
export async function replayChecks(cfg, id, { only = null, grep = null } = {}) {
  const H = await import('./house.mjs'), out = [];
  for (const g of chapterGroups(cfg, id)) {
    if (only && !only.has(g.id)) continue;
    const T = readJson(trackFile(cfg, id, g)); if (!T?.track) { out.push({ chapter: g.id, missing: true, errors: [], geometryIntegrity: geometryIntegrity([], g.shots) }); continue; }
    const lines = T.shots.map((x) => x.text || ''), hant = H.traditionalOn() ? H.toHant(lines) : lines;
    const PROF = profileOf(cfg, id);
    let errors = [...await bibleTrackErrors(cfg, id, T.shots, T.track), ...geometryErrors(T.track, T.shots, { designed: designedTypeBeats(cfg, id, g) }), ...leaving(designedTypeBeats(cfg, id, g))([...(bibleSet(cfg, id) ? [] : typeDensityErrors(T.track, T.shots, PROF)), ...(profileRuleScope(loadProject(cfg, id), 'surface-quota') === 'note' ? [] : surfaceTypeErrors(T.track, T.shots, PROF, g.id))]), ...leaving(designedTypeBeats(cfg, id, g))((bibleSet(cfg, id) ? [] : pairErrors(T.track, T.shots, PROF))), ...surfaceReadErrors(T.track, T.shots, PROF), ...creepErrors(T.track, T.shots), ...flickerErrors(T.track, T.shots), ...motionErrors(T.track, T.shots), ...cueTimingErrors(T.track, T.shots, (x) => hant[lines.indexOf(x)] ?? x)];
    if (grep) errors = errors.filter((e) => new RegExp(grep).test(e));
    out.push({ chapter: g.id, at: T.at, errors, warnings: [...(profileRuleScope(loadProject(cfg, id), 'surface-quota') === 'note' ? surfaceTypeErrors(T.track, T.shots, PROF, g.id).map(e => `HOUSE/TYPE review note (surface-quota): ${e}`) : []), ...readBudgetTrackErrors(T.track, g.shots).map(e => `read-budget: ${e}`)], geometryIntegrity: geometryIntegrity(T.track, T.shots) });
  }
  return out;
}
// Integrity, not aesthetics: NaN makes every ordinary spatial comparison silently false.
// No area/position threshold: cropped, edge-on, entering and intentionally covered objects are legal.
// Explicit null is also invalid telemetry (JSON serializes NaN/Infinity to null); absent fields are unmeasured.
export function geometryIntegrity(track, shots = []) {
  const errors = [], coverage = {}, source = Array.isArray(track) ? track : [];
  let invalidTimes = 0, missingTimes = 0;
  for (const [i, f] of source.entries()) {
    if (!f || !Object.hasOwn(f, 't')) missingTimes++;
    else if (!Number.isFinite(f.t)) {
      invalidTimes++;
      errors.push(`geometry-nonfinite time at sample[${i}]: invalid timestamp (sample cannot be assigned to a beat)`);
    }
  }
  const frames = source.filter(f => Number.isFinite(f?.t) && shots.some(s => f.t >= s.at && f.t < s.at + s.dur));
  for (const stream of ['drawn', 'shapes']) {
    let measured = 0, missing = missingTimes, invalid = invalidTimes, degenerate = 0;
    for (const f of frames) {
      if (!Array.isArray(f[stream])) { missing++; continue; }
      for (const [i, box] of f[stream].entries()) {
        if (box?.alpha === 0) continue;
        if (!box) { missing++; continue; }
        const keys = ['x0', 'y0', 'x1', 'y1'];
        const bad = keys.filter(k => Object.hasOwn(box, k) && !Number.isFinite(box[k]));
        if (bad.length) {
          invalid++;
          const beat = shots.find(s => f.t >= s.at && f.t < s.at + s.dur)?.shotId;
          errors.push(`${beat}: geometry-nonfinite ${stream}[${i}] at ${f.t}s: invalid ${bad.join(',')} coordinates (unusable measured bounds)`);
        } else if (keys.some(k => !Object.hasOwn(box, k))) missing++;
        else { measured++; if (box.x0 === box.x1 || box.y0 === box.y1) degenerate++; }
      }
    }
    coverage[stream] = { status: invalid ? 'fail' : missing || !measured ? 'unknown' : 'pass', measured, missing, invalid, degenerate };
  }
  return { contract: 'A1GeometryIntegrity/v1', scope: 'sampled bounding-coordinate validity only; not visibility, glyph ink, depth, or aesthetic quality', frames: frames.length, coverage, errors: [...new Set(errors)], warnings: Object.entries(coverage).flatMap(([stream, c]) => c.status === 'unknown' ? [`geometry-integrity: ${stream} unknown/unmeasured (${c.measured} measured, ${c.missing} missing)`] : []) };
}
export function geometryErrors(track, shots, { step = GEO_STEP, hold = GEO_HOLD, designed = new Set() } = {}) {   // designed: the hero and type beats (designedTypeBeats), whose words may sit on their picture
  const runs = new Map(), out = [...geometryIntegrity(track, shots).errors];
  const beatOf = (t) => shots.find((s) => t >= s.at && t < s.at + s.dur);
  for (const f of track) {
    const s = beatOf(f.t); if (!s) continue;
    const errs = [...overlapErrors(f.drawn, s.shotId), ...unitGapErrors(f.drawn, s.shotId), ...onPicture(designed)(crossErrors(f.drawn, f.shapes, s.shotId)), ...edgeErrors(f.shapes, s.shotId), ...coverErrors(f.shapes, s.shotId), ...redPlateErrors(f.drawn, s.shotId), ...decoErrors(f.drawn, f.shapes, s.shotId), ...typeLoadErrors(f.drawn, s.shotId, f.shapes), ...textEdgeErrors(f.drawn, s.shotId), ...objectErrors(f.drawn, f.cover, s.shotId), ...faceMixErrors(f.drawn, s.shotId)];
    const now = new Set(errs.map((e) => e.split(' (')[0]));
    for (const e of errs) { const k = e.split(' (')[0], r = runs.get(k); if (r && r.last >= f.t - step * 1.5) { r.last = f.t; } else runs.set(k, { first: f.t, last: f.t, msg: e }); }
    for (const [k, r] of runs) if (!now.has(k) && r.last < f.t - step * 1.5 && !r.done) { r.done = true; if (r.last - r.first + step >= hold) out.push(`${r.msg} (${r.first.toFixed(1)}-${(r.last + step).toFixed(1)} s)`); }
  }
  for (const [, r] of runs) if (!r.done && r.last - r.first + step >= hold) out.push(`${r.msg} (${r.first.toFixed(1)}-${(r.last + step).toFixed(1)} s)`);
  return [...new Set(out)].slice(0, 8);
}
export async function motionCurve(page, total) {
  return page.evaluate(async ({ total, step }) => {
    const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d', { willReadFrequently: true });
    const C = document.createElement('canvas'), W = 192, H = 108; C.width = W; C.height = H; const G = C.getContext('2d', { willReadFrequently: true });
    const lag = Math.round(1 / step), grays = [];
    let prev = null; const out = [];
    for (let t = 0; t <= total + 1e-6; t += step) {
      const im = window.__frameCanvas ? (window.__measure(t), window.__frameCanvas()) : await (async () => { const i = new Image(); i.src = window.__content(t); await i.decode(); return i; })();   /* the canvas read small, no PNG round trip */
      g.drawImage(im, 0, 0, 96, 54); const d = g.getImageData(0, 0, 96, 54).data;
      G.drawImage(im, 0, 0, W, H); const D = G.getImageData(0, 0, W, H).data, y = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) y[i] = (D[i * 4] + D[i * 4 + 1] + D[i * 4 + 2]) / 3;
      grays.push(y);
      if (prev) {
        let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]);
        const p = { t: +t.toFixed(2), d: +(s / (96 * 54 * 3)).toFixed(2) };
        const back = grays[grays.length - 1 - Math.min(lag, grays.length - 1)];
        let num = 0, den = 0;
        for (let r = 0; r < H - 1; r++) for (let q = 0; q < W - 1; q++) { const i = r * W + q; num += Math.abs(y[i] - back[i]); den += (Math.abs(y[i + 1] - y[i]) + Math.abs(y[i + W] - y[i])) / 2; }
        p.s = den > 1 ? +(num / den).toFixed(3) : (num > 1 ? 9 : 0);   // px travelled over the last second (192 wide)
        // fill: the share of the frame with detail on it (off a 9 px box blur by more than 10 levels): how full it is
        { const bl = new Float32Array(W * H), tmp = new Float32Array(W * H), R = 4;
          for (let r = 0; r < H; r++) { let acc = 0; for (let q = -R; q <= R; q++) acc += y[r * W + Math.min(W - 1, Math.max(0, q))]; for (let q = 0; q < W; q++) { tmp[r * W + q] = acc / (2 * R + 1); acc += y[r * W + Math.min(W - 1, q + R + 1)] - y[r * W + Math.max(0, q - R)]; } }
          for (let q = 0; q < W; q++) { let acc = 0; for (let r = -R; r <= R; r++) acc += tmp[Math.min(H - 1, Math.max(0, r)) * W + q]; for (let r = 0; r < H; r++) { bl[r * W + q] = acc / (2 * R + 1); acc += tmp[Math.min(H - 1, r + R + 1) * W + q] - tmp[Math.max(0, r - R) * W + q]; } }
          let n = 0; for (let i = 0; i < W * H; i++) if (Math.abs(y[i] - bl[i]) > 10) n++; p.f = +(n / (W * H)).toFixed(4); }
        // cover: the share of the frame off its ground (more than 14 levels from the frame's median): a 3D close-up of smooth
        // bars carries little detail (f) but is not empty (B10's ladder at its cut)
        { const hist = new Uint32Array(256); for (let i = 0; i < W * H; i++) hist[Math.min(255, y[i] | 0)]++; let acc = 0, med = 0; for (; med < 256; med++) { acc += hist[med]; if (acc >= (W * H) / 2) break; }
          let n = 0; for (let i = 0; i < W * H; i++) if (Math.abs(y[i] - med) > 14) n++; p.c = +(n / (W * H)).toFixed(4); }
        // the whole picture's shift since the last sample (96 wide, block matching over the middle): a snap of the camera
        // is a translation in one sample with still samples either side (the user 2026-10-25: 镜头抽动 at 3:11, 3:21)
        { let best = Infinity, bx = 0, by = 0, zero = 0; const L = (a, i) => (a[i] + a[i + 1] + a[i + 2]);
          for (let dy = -6; dy <= 6; dy++) for (let dx = -8; dx <= 8; dx++) { let sad = 0; for (let r = 10; r < 44; r += 2) for (let q = 12; q < 84; q += 2) { const i = (r * 96 + q) * 4, j = ((r + dy) * 96 + (q + dx)) * 4; sad += Math.abs(L(d, i) - L(prev, j)); } if (dx === 0 && dy === 0) zero = sad; if (sad < best) { best = sad; bx = dx; by = dy; } }
          p.dx = bx; p.dy = by; p.mq = zero > 0 ? +(best / zero).toFixed(3) : 1; }
        // hues: the share of the frame in each saturated hue (12 bins of 30°; saturation over 0.45, value over 0.25): a
        // second saturated colour beside the film's one accent (oneAccentErrors)
        { const bins = new Array(12).fill(0); for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), v = mx, sat = mx ? (mx - mn) / mx : 0; if (sat < 0.45 || v < 0.25) continue; let h = mx === mn ? 0 : mx === r ? ((gg - b) / (mx - mn)) % 6 : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4; h = (h * 60 + 360) % 360; bins[Math.floor(h / 30) % 12]++; }
          p.h = bins.map((n) => +(n / (96 * 54)).toFixed(4)); }
        out.push(p);
      }
      prev = d.slice();
    }
    return out;
  }, { total, step: STEP });
}
// one accent (the reference: grey and white, one red; reviews of 2026-10-25: saturated blue folders read as a second
// colour): a beat whose frames carry ACCENT2_MIN or more of their area in a saturated hue more than 45° from the film's
// accent for HOLD s fails
export const ACCENT2_MIN = 0.04;
const hueOf = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(hex || '')); if (!m) return null; const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return null; let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; return (h * 60 + 360) % 360; };
// (a beat with a film palette, palettes.mjs: its own colours are its — ground, key, accent and inks; the user 2026-10-28,
// 可以各种配色 但要和谐 — a saturated colour from outside its palette still fails)
export function oneAccentErrors(curve, shots, accent, { min = ACCENT2_MIN, hold = 0.8, palettes = {} } = {}) {
  const ha = hueOf(accent); if (ha == null) return [];
  const out = [];
  for (const [j, s] of shots.entries()) {
    // (the beat before's palette stands through the first second: one take turns its colour, it does not cut — Suez B13
    // took the indigo night of B12 for 0.8 s as the chart sank)
    const own = [ha, ...(palettes[s.shotId] || []).map(hueOf).filter((h) => h != null)], before = j ? (palettes[shots[j - 1].shotId] || []).map(hueOf).filter((h) => h != null) : [];
    const farOf = (hues) => (k) => { const c = k * 30 + 15; return hues.every((h) => Math.abs(((c - h + 540) % 360) - 180) > 45); };
    let run = 0, best = 0, bin = -1;
    for (const p of curve) { if (!p.h || p.t < s.at || p.t >= s.at + s.dur) continue; const far = farOf(p.t < s.at + 1 ? [...own, ...before] : own), k = p.h.reduce((m, v, i) => (far(i) && v > (p.h[m] ?? -1) ? i : m), -1), v = k >= 0 && far(k) ? p.h[k] : 0; run = v >= min ? run + STEP : 0; if (run > best) { best = run; bin = k; } }
    if (best >= hold) out.push(`${s.shotId}: a second saturated colour (hue ${bin * 30}–${bin * 30 + 30}°) covers ${Math.round(min * 100)} % of the frame or more for ${best.toFixed(1)} s: the film has one accent (${accent}); grey or white it, or take the accent`);
  }
  return out;
}
// five frames across a beat side by side (start, quarter, half, three quarters, its keyframe): what the review sees
function stripTimes(s, tk) { return [s.at + 0.25, s.at + s.dur * 0.25, s.at + s.dur * 0.5, s.at + s.dur * 0.75, tk].map((t) => Math.min(t, tk)); }
function writeStrip(files, out) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}]scale=640:360[s${i}]`).join(';')};${files.map((_, i) => `[s${i}]`).join('')}hstack=${files.length}`, out]);
  if (r.status) throw new Error(`strip: ${String(r.stderr).split('\n')[0]}`);
}

// a strip (five cells of 640x360) gets a second row: ten frames of 320x180 around the hero move
function addMotionRow(strip, frames) {
  const row = `${strip}.row.png`;
  let r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...frames.flatMap((f) => ['-i', f]), '-filter_complex', `${frames.map((_, i) => `[${i}]scale=320:180[s${i}]`).join(';')};${frames.map((_, i) => `[s${i}]`).join('')}hstack=${frames.length}`, row]);
  if (r.status) throw new Error(`motion row: ${String(r.stderr).split('\n')[0]}`);
  r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', strip, '-i', row, '-filter_complex', '[0][1]vstack=2', `${strip}.tmp.png`]);
  if (r.status) throw new Error(`motion row: ${String(r.stderr).split('\n')[0]}`);
  fs.renameSync(`${strip}.tmp.png`, strip); fs.rmSync(row, { force: true });
}

// errors that mean the module did not run as a chapter (nothing to look at); the rest are rules on what it drew
export const FATAL = /^(the module (fails|does not load|does not parse|has no beats)|page error|asset |\d+ beats for|beat \d+ \()/;
// the module run in the page: beats on the chapter's times, one keyframe per beat (png) and the type it draws
// House rules in a chapter page (user, 2026-10-21: 只用 6 款字体、画面字一律繁体): a module names fonts its own way
// ("A1Sans", Helvetica, Didot ...) and draws its words straight on a canvas, so the page maps every face to a house font
// (the house aliases; Latin and tag faces to 廻想体), moves a whole line to the next house font of its fallback when its
// face lacks a character (never splitting a line, never a system font), and sets the line in Traditional (the
// system's ICU transform, per string, here). The strings are the module's string literals that carry CJK.
const MODULE_FACES = { 'Helvetica Neue': 'House Kaiso', Helvetica: 'House Kaiso', Arial: 'House Kaiso', 'Bodoni 72': 'House Kokka', Futura: 'House Kikai', 'sans-serif': 'House Sumikaku', serif: 'House Kokka' };
export function moduleStrings(code) {
  const out = new Set();
  for (const m of String(code).matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const v = m[1] ?? m[2] ?? m[3] ?? ''; for (const piece of v.split(/\$\{[^}]*\}/)) if (/[\u3400-\u9fff]/.test(piece)) out.add(piece);
  }
  return [...out];
}
// the reference's lettering (look.json type.faces): a module's serif lines (House Kokka, the house's catch-all) are
// set in the reference's first face instead, its own fallback chain still applying, so a chapter written for the
// house serif reads like the reference without being rewritten (B10, B18, B39 were 34-100 % Kokka against a film
// lettered in bold gothic). Quotes the module sets in another face are left alone.
// alts: the reference's other faces, tried before the plain fallback when a line does not read in the first (B18's
// 全都一致 fell from スミカク to the thin 黒華明朝 and no longer held the table; 廻想体 and 金畫字 read it)
export function preferFace(look) { const fs = (look?.type?.faces || []).filter((x) => x !== 'House Kokka'), f = fs[0]; return f && look?.type?.faces?.[0] !== 'House Kokka' ? { from: 'House Kokka', to: f, alts: fs.slice(1) } : null; }
// every line a chapter drew, on any canvas (morph.js keeps them: a card painted on its own canvas was not traced), set in
// Traditional: a line still Simplified fails (B17's sample cards showed 现场 1 毛发, a run-time string)
export async function scriptErrors(lines, toHant = null) {
  const H = toHant ? null : await import('./house.mjs'); if (!toHant && !H.traditionalOn()) return [];
  const L = [...new Set(lines)].filter((x) => /[\u3400-\u9fff]/.test(x)); if (!L.length) return [];
  const T = (toHant || H.toHant)(L);
  return L.filter((x, i) => T[i] !== x).slice(0, 6).map((x, i) => `"${x}" is set in Simplified on screen (house rule: Traditional${T[L.indexOf(x)] ? `, "${T[L.indexOf(x)]}"` : ''}): build the line from pieces the module writes out, so the line converts them`);
}
// the words a chapter's data assets carry onto the screen (a map's place names: B18's map printed 兰州市 海东市 in
// Simplified, never converted, its names were not in the module's code): every short CJK key and value of its JSON assets
export function assetStrings(assets = {}) {
  const out = new Set(), walk = (v, d = 0) => { if (d > 6 || v == null) return; if (typeof v === 'string') { if (/[\u3400-\u9fff]/.test(v) && v.length <= 40) out.add(v); return; } if (Array.isArray(v)) { v.forEach((x) => walk(x, d + 1)); return; } if (typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (/[\u3400-\u9fff]/.test(k) && k.length <= 40) out.add(k); walk(x, d + 1); } };
  for (const f of Object.values(assets)) if (typeof f === 'string' && f.endsWith('.json') && fs.existsSync(f)) { try { walk(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch {} }
  return [...out];
}
// single characters learnt from the table's whole lines (same length, character by character; a character converted two
// ways takes its commoner): a line typed out a character at a time or cut from a longer name (几个案发现场采到的 half
// typed, 乌海市 out of 乌海市, 内蒙古自治区) is converted by them when no whole piece of it is in the table
// (pure, tested) the characters a text built in the page converts one by one: only a character the transform changes the
// same way wherever it stands — one it leaves as it is in another string is converted by its word, not alone (Suez: 沙土
// → 砂土 made 沙 → 砂 for every text, and 沙塵暴 showed 砂塵暴; a blind review read it). same: the strings left as they were
export function hantChars(map, same = []) {
  const n = {}, kept = new Set();
  for (const s of same) for (const c of s) kept.add(c);
  for (const [a, b] of Object.entries(map)) { const A = [...a], B = [...b]; if (A.length !== B.length) continue; A.forEach((c, i) => { if (c !== B[i]) { (n[c] ||= {})[B[i]] = (n[c][B[i]] || 0) + 1; } else kept.add(c); }); }
  return Object.fromEntries(Object.entries(n).filter(([c]) => !kept.has(c)).map(([c, m]) => [c, Object.entries(m).sort((x, y) => y[1] - x[1])[0][0]]));
}
export async function chapterHouse(cfg, code, id = null, assets = {}, { isolatedTarget = null } = {}) {
  if (isolatedTarget !== null && (typeof isolatedTarget !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(isolatedTarget))) throw new Error('invalid isolated target');
  const H = await import('./house.mjs'), rules = H.houseRules(engineRoot(cfg));
  const strings = [...new Set([...moduleStrings(code), ...assetStrings(assets)])], hant = H.traditionalOn() ? H.toHant(strings) : strings;
  const map = Object.fromEntries(strings.map((x, i) => [x, hant[i]]).filter(([a, b]) => a !== b));
  const chars = [...new Set([...strings, ...hant].join(''))].join('');
  const fonts = rules.fonts.allowed.map((f) => ({ family: f.family, url: '/' + path.relative(engineRoot(cfg), H.fontFile(f, engineRoot(cfg))).split(path.sep).join('/'), fallback: f.fallback || [] }));
  const missing = {}; for (const f of fonts) { try { missing[f.family] = H.missingGlyphs(f.family, chars, { root: engineRoot(cfg) }).join(''); } catch { missing[f.family] = ''; } }
  // the words that do not read as themselves in a face (legible.mjs: set large, read back by Vision); 黒華明朝, the last
  // fallback, is not tried. A face that lacks a word's characters is passed over anyway (missing)
  const L = await import('./legible.mjs'), ill = {}, latin = [...String(code).matchAll(/['"`]([A-Z][A-Z0-9 -]{1,7})['"`]/g)].map((m) => m[1]), words = [...new Set([...hant, ...latin])].filter((w) => (/[\u3400-\u9fff]/.test(w) || /^[A-Z][A-Z0-9 -]{1,7}$/.test(w)) && w.length <= 24);   // Latin labels too, written in the code (XY read as ZY)
  // nor 思源黑体, the plain gothic every Chinese line is set in: OCR misread 凶案現場 and 大武口區 in it (a Traditional
  // form read as another word) and sent one name of two to 黒華明朝, two faces for one kind of tag (B32, 2026-10-25)
  for (const f of rules.fonts.allowed.filter((x) => x.family !== 'House Kokka' && x.family !== 'House Gothic')) {
    const lack = new Set([...(missing[f.family] || '')]), mine = words.filter((w) => ![...w].some((c) => lack.has(c)));
    const fontFile = H.fontFile(f, engineRoot(cfg));
    // OCR scores are run output, never shared font authority. Font bytes key the memo
    // so replacing a face cannot reuse old scores; no project means no disk memo.
    const cacheFile = id ? path.join(projectPaths(cfg, id).out, ...(isolatedTarget === null ? ['font-legibility'] : ['chapters', `STILLS-${isolatedTarget}`, 'font-legibility']), `${sha(fontFile + (fs.existsSync(fontFile) ? sha(fs.readFileSync(fontFile)) : 'missing'))}.json`) : null;
    Object.assign(ill, L.illegible(mine, [{ family: f.family, file: fontFile }], { cacheFile }));
  }
  // a project lettered eva sets its chapters as its cards, one face a role from the six (house.mjs letterRoles; the user
  // 2026-10-26: 思源黑体是兜底 主要用之前安装的 6 个): big Chinese in the style's display face (黒華明朝 drawn tall when it is
  // that), small in 黒華明朝, Latin and figures in 廻想体 or f.k 機械彫刻, 思源黑体 last (morph.js face); the reference's own
  // faces are not asked for
  const eva = H.lettering() === 'eva', six = eva ? H.letterRoles(engineRoot(cfg)) : null;
  // the big face drawn narrow as the design asks (six.x; the user 2026-10-26: 可以变形 变高 窄 根据设计来)
  if (six?.tall) { const base = fonts.find((f) => f.family === six.display), file = H.shapedFont(six.display, six.x, engineRoot(cfg));
    if (base && file && fs.existsSync(file)) { fonts.push({ family: `${six.display} Tall`, url: '/' + path.relative(engineRoot(cfg), file).split(path.sep).join('/'), fallback: base.fallback }); missing[`${six.display} Tall`] = missing[six.display]; six.display = `${six.display} Tall`; } }
  return { fonts, alias: { ...rules.fonts.alias, ...MODULE_FACES }, missing, illegible: ill, hant: map, hantChars: hantChars(map, strings.filter((x, i) => x === hant[i])), six, bible: !!(id && bibleSet(cfg, id)), prefer: id && !eva ? preferFace(referenceLook(cfg, id)) : null };
}

// A module that does not parse fails at once with the line and the parser's message: in the page it only threw
// "Unexpected token" and the line waited a minute for it and reported a timeout (paperclip-138-full B18: a comment
// that swallowed the rest of a one-line loop).
export function syntaxError(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); if (!r.status) return null;
  const lines = String(r.stderr).split('\n').map((l) => l.trim()).filter(Boolean);
  const at = (lines.map((l) => l.match(new RegExp(`${path.basename(file).replace(/\./g, '\\.')}:(\\d+)$`))).find(Boolean) || [])[1], msg = lines.find((l) => /Error:/.test(l)) || lines[0] || 'syntax error';
  return `the module does not parse${at ? ` (line ${at})` : ''}: ${msg}`;
}
// Compare the lossless canvas itself, not encoded PNG bytes. A 45 dB floor
// matches the imported verification guidance while permitting GPU rounding.
export function seekReplayErrors(sample, at, minPsnr = 45) {
  if (!sample || !Number.isFinite(sample.mse) || sample.mse < 0 || !Number.isFinite(sample.channels) || sample.channels <= 0) return ['seek-replay: renderer did not return comparable pixel frames'];
  if (sample.mse === 0) return [];
  const psnr = 10 * Math.log10(65025 / sample.mse);
  return psnr >= minPsnr ? [] : [`seek-replay: frame at ${Number(at).toFixed(2)}s changed after seeking elsewhere (PSNR ${psnr.toFixed(2)} dB < ${minPsnr} dB)`];
}
// the film's lettering from its project, whoever calls (the CLI set RB_LETTERING from project.json; a step called any other
// way rendered a lettered film's words in the fallback gothic and its checks passed them — Suez's stills, round 12)
export function ensureLettering(cfg, id) { const l = loadProject(cfg, id)?.lettering; if (l && process.env.RB_LETTERING !== l) process.env.RB_LETTERING = l; }
export async function runtimeCheck(cfg, id, g, code, assets = {}, { motionContract = null, greyboxDiffer = {}, motionImplementation = [], taskMode = 'motion', isolatedTarget = null } = {}) {
  if (isolatedTarget !== null && (taskMode !== 'stills' || typeof isolatedTarget !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(isolatedTarget) || g.id !== `STILLS-${isolatedTarget}` || g.shots?.length !== 1 || g.shots[0].shotId !== isolatedTarget || Object.keys(assets).length)) throw new Error('invalid isolated target runtime scope');
  if (isolatedTarget !== null) {
    const root = projectPaths(cfg, id).root;
    let p = root;
    for (const part of ['out', 'chapters', g.id]) { p = path.join(p, part); if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error('isolated target output contains symlink'); }
    if (fs.existsSync(p)) for (const entry of fs.readdirSync(p, { recursive: true, withFileTypes: true })) if (entry.isSymbolicLink()) throw new Error('isolated target output contains symlink');
  }
  ensureLettering(cfg, id);
  if (!['motion', 'stills'].includes(taskMode)) throw new Error(`unknown taskMode: ${taskMode}`);
  const stills = taskMode === 'stills';
  const operationCheck = await chapterAssetOperationCheck(cfg, id, g, code, assets);
  const { requiresEventContract, directorIntentErrors } = await import('./directorroutes.mjs');
  const filmDesign = acceptedFilmDesign(cfg, id), shotIds = g.shots.map(s => s.shotId);
  const evidenceInput = chapterInput(cfg, id, g);
  const scoped = (filmDesign?.beats || []).filter(r => shotIds.includes(r.beat) && requiresEventContract(r));
  if (scoped.length) {
    const errors = [...operationCheck.errors, ...scoped.flatMap(r => directorIntentErrors(r)), ...(stills ? [] : motionContractUneatenErrors(code, motionContract, { filmDesign, shotIds, greyboxDiffer, motionImplementation })), ...(stills ? [] : referenceComparisonErrors(motionImplementation, { ...filmDesign, beats: scoped }, productionInputFiles(cfg, id, chapterInput(cfg, id, g)))), ...lookdevReferenceErrors({ motionImplementation }, cfg, id)];
    if (errors.length) return { errors, warnings: [], keyframes: [] };
  }
  if (operationCheck.errors.length) return { errors: operationCheck.errors, warnings: [], keyframes: [] };
  const PROF = profileOf(cfg, id);   // whose way with type and light the film follows (profile.mjs)
  const sbShots = readJson(path.join(projectPaths(cfg, id).root, 'storyboard.json'), {})?.shots || [];
  const heroAt = (s) => { const d = sbShots.find((x) => x.beat === s.shotId); return d?.hero?.at ?? d?.reads?.[0]?.from ?? s.dur / 3; };
  let allText = [];
  const dir = outDir(cfg, id, g), mod = path.join(dir, `candidate-${sha(code)}.mjs`);
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(mod, code);
  { const e = syntaxError(mod); if (e) return { errors: [e], warnings: [], keyframes: [] }; }
  { const kit = engineCallErrors(code); if (kit.length) return { errors: kit, warnings: [], keyframes: [] }; }
  const shotFile = path.join(dir, 'check-shot.json');
  writeJson(shotFile, { id: g.id, template: 'morph', params: { module: rootUrl(cfg, mod), sub: false, note: chapterEvidenceNote(cfg, id, g, assets, { taskMode }), lines: await chapterLines(g), places: chapterPlaces(cfg, id, g, code), dur: g.total, window: { dur: g.total }, assets: assetUrls(cfg, assets), house: await chapterHouse(cfg, code, id, assets, { isolatedTarget }), ...(filmStyle(cfg, id) ? { style: filmStyle(cfg, id) } : {}) }, text: '', fps: 30 });
  const renderedFonts = readJson(shotFile)?.params?.house?.fonts || [];
  const fontBindings = renderedFonts.map(f => { const file = path.resolve(engineRoot(cfg), '.' + f.url); return { family: f.family, file, hash: fs.existsSync(file) ? sha(fs.readFileSync(file)) : null }; });
  const { openPage } = await import(pathToFileURL(path.join(engineRoot(cfg), ENGINE, 'shoot.mjs')).href);
  const voice = voiceState(cfg, id); let cueSchedule = {};
  if (voice.state === 'current' && voice.timings?.beats && voice.timings?.words) {
    const rel = voice.timings.words, local = path.isAbsolute(rel) ? rel : path.join(projectPaths(cfg, id).root, rel), file = fs.existsSync(local) ? local : (path.isAbsolute(rel) ? rel : path.join(cfg.sourceRoot, rel));
    const data = readJson(file, null), words = (data?.segments || []).flatMap((s) => s.words || []);
    cueSchedule = voiceCueSchedule(g.shots, voice.timings, words);
  }
  const errors = [], warnings = [], keyframes = [], evidenceFrames = [], strips = [], preflightFrames = [], poseFrames = [], texts = [], lettering = [], pageErrors = [];
  const profileCheck = (rule, messages) => {
    if (profileRuleScope(loadProject(cfg, id), rule) === 'note') warnings.push(...messages.map(m => `HOUSE/TYPE review note (${rule}; not a redesign instruction): ${m}`));
    else errors.push(...messages);
  };
  let motion = null, measuredTrack = [], measuredCurve = [], measuredCamera = [], measuredActors = [], measuredSpace = [];
  let session;
  try {
    session = await openPage({ pageDir: path.join(engineRoot(cfg), ENGINE, 'director'), page: 'shot.html', query: `shot=${encodeURIComponent(rootUrl(cfg, shotFile))}&fps=30&draft=1`, variant: 'clean' });   // draft: review stills skip the motion-blur subframes
  } catch (e) { return { errors: [`the module does not load: ${String(e.message || e).split('\n')[0]}`], warnings, keyframes }; }
  const { page, close } = session;
  // RB_TIMING=1: how long each sweep of the check takes (2026-10-26: a round of ten chapters took 25 min; find where)
  let tk = Date.now(); const tick = (label) => { if (process.env.RB_TIMING) { const n = Date.now(); console.error(`  [${g.id}] ${label} ${((n - tk) / 1000).toFixed(1)} s`); tk = n; } };
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // where.place's spots chosen over the whole span, once (morph.js __placeSolve), then used in this check and every render
  tick('open');
  try { const places = await page.evaluate((T) => { if (!window.__placeSolve) return {}; window.__placeReset(); window.__placeLearn = true; try { for (let t = 0; t <= T; t += 0.25) (window.__measure || window.__content)(t); } finally { window.__placeLearn = false; } const p = window.__placeSolve(); window.__places = p; return p; }, g.total); if (Object.keys(places).length) writeJson(placesFile(cfg, id, g, code), places); } catch (e) { warnings.push(`places: ${String(e.message || e).split('\n')[0]}`); }
  tick('places');
  // the lines set by hand moved clear of the frame's edge under the camera, once over the span (morph.js __nudgeSolve), kept
  // in the same file (__nudge) and used by every render: the line solves what the director nudged by hand round after round
  // free lines held still on the screen while the camera creeps under them (morph.js __holdSolve), before the nudges (which
  // read the lines where they are held)
  try { const holds = await page.evaluate((T) => { if (!window.__holdSolve) return {}; const h = window.__holdSolve(T); window.__holds = h; return h; }, g.total);
    const file = placesFile(cfg, id, g, code), was = readJson(file, {}); if (Object.keys(holds).length || was.__hold) writeJson(file, { ...was, __hold: holds });
    const n = Object.keys(holds).length; if (n) warnings.push(`held still on the screen by the line while the camera creeps: ${n} line(s) (${Object.keys(holds).slice(0, 4).map((k) => k.split('|').slice(1).join('|')).join(', ')})`); } catch (e) { warnings.push(`holds: ${String(e.message || e).split('\n')[0]}`); }
  tick('holds');
  try { const nudges = await page.evaluate((T) => { if (!window.__nudgeSolve) return {}; const n = window.__nudgeSolve(T); window.__nudges = n; return n; }, g.total);
    const file = placesFile(cfg, id, g, code), was = readJson(file, {}); if (Object.keys(nudges).length || was.__nudge) writeJson(file, { ...was, __nudge: nudges });
    for (const [k, v] of Object.entries(nudges)) warnings.push(`moved clear of the frame's edge by the line: ${k.split('|').slice(1).join('|')} by ${v[0]},${v[1]} px`); } catch (e) { warnings.push(`nudges: ${String(e.message || e).split('\n')[0]}`); }
  try {
    const beats = await page.evaluate(() => (window.__morphBeats ? window.__morphBeats() : null));
    const loaded = await page.evaluate(() => (window.__morphAssets ? window.__morphAssets() : { images: [], data: [] }));
    for (const k of Object.keys(assets)) if (![...loaded.images, ...loaded.data].includes(k)) errors.push(`asset ${k} did not load in the page`);
    if (!beats) errors.push('the module has no beats');
    else {
      const seekTimes = [...new Set([0, ...g.shots.map((s) => s.at), g.total * 0.5, g.total - 0.1]
        .filter(Number.isFinite).map((t) => Math.max(0, Math.min(g.total - 0.1, t))))];
      const replay = await page.evaluate((times) => {
        // First draws initialize renderer caches; compare warmed frames.
        times.forEach((t) => window.__content(t));
        return times.map((t, i) => {
          window.__content(t);
          const canvas = window.__frameCanvas(), ctx = canvas.getContext('2d');
          const first = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          window.__content(times[(i + 1) % times.length]); window.__content(t);
          const second = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0, channels = 0;
          for (let p = 0; p < first.length; p += 4) for (let c = 0; c < 3; c++) { const d = first[p + c] - second[p + c]; sum += d * d; channels++; }
          return { mse: channels ? sum / channels : null, channels };
        });
      }, seekTimes);
      replay.forEach((sample, i) => errors.push(...seekReplayErrors(sample, seekTimes[i])));
      if (beats.length !== g.shots.length) errors.push(`${beats.length} beats for ${g.shots.length} shots in the chapter (one beat per shot)`);
      g.shots.forEach((s, k) => { if (beats[k] && Math.abs(beats[k].at - s.at) > 0.1) errors.push(`beat ${k} (${s.shotId}) starts at ${beats[k].at}, the shot at ${s.at}`); });
      // every half second, not just the keyframes: a scene that fails between them fails the render
      for (let t = 0; t < g.total; t += 0.5) {
        const bad = await page.evaluate((tt) => { try { (window.__measure || window.__content)(tt); return null; } catch (e) { return String(e.message || e); } }, t);
        if (bad) { errors.push(`the module fails at ${t.toFixed(1)} s: ${bad.split('\n')[0]}`); break; }
      }
      const figRows = [];
      for (const [k, s] of g.shots.entries()) {
        // the keyframe: the end of the beat, when the whole line has been said (a result revealed late in a long beat
        // was missed by a frame taken 2 s in: paperclip-138-open B04, 11.8 s), never before its move has settled
        const settle = (beats[k]?.move ?? 1.1) + 0.9, tk = Math.max(s.at + 0.1, Math.min(Math.max(s.at + settle, s.at + s.dur - 0.35), s.at + s.dur - 0.08));
        const url = await page.evaluate((t) => window.__content(t), tk);
        const drawn = await page.evaluate(() => window.__morphText()), shapes = await page.evaluate(() => (window.__morphShapes ? window.__morphShapes() : []));
        evidenceFrames.push({ beat: s.shotId, drawn, shapes });
        { const fgr = await page.evaluate(() => (window.__figureGround ? window.__figureGround() : null)); if (fgr) figRows.push({ beat: s.shotId, ...fgr }); }   // figure and ground at the keyframe
        const layoutPreflight = await page.evaluate(captureLayoutPreflight);
        if (layoutPreflight.result.status === 'fail') errors.push(`${s.shotId}: layout preflight failed: ${JSON.stringify(layoutPreflight.result.errors)}`);
        else if (layoutPreflight.result.status === 'unknown') warnings.push(`${s.shotId}: layout preflight unknown (not a pass)`);
        const file = path.join(dir, `key-${k + 1}-${s.shotId}.png`);
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); keyframes.push(file);
        writeJson(file.replace(/\.png$/, '.shapes.json'), { frameHash: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), drawn, shapes, layoutPreflight, fontBindings, fontLoads: await page.evaluate(() => [...document.fonts].map(f => ({ family: f.family.replace(/^['"]|['"]$/g, ''), status: f.status }))) });   // what the checks read at this frame, beside it
        const scopedIntent = scoped.find(row => row.beat === s.shotId)?.directorIntent;
        if (!stills && scopedIntent?.eventTimes) for (const phase of ['start', 'key', 'end']) {
          const local = Number(scopedIntent.eventTimes[phase]);
          if (!Number.isFinite(local)) continue;
          const at = s.at + Math.max(0, Math.min(s.dur - 0.08, local)), pose = path.join(dir, `pose-${k + 1}-${s.shotId}-${phase}.png`);
          fs.writeFileSync(pose, Buffer.from((await page.evaluate((t) => window.__content(t), at)).split(',')[1], 'base64'));
          poseFrames.push({ beat: s.shotId, phase, time: local, file: pose, hash: sha(fs.readFileSync(pose)) });
        }
        const cells = [];
        const crossed = onPicture(designedTypeBeats(cfg, id, g))([...crossErrors(drawn, shapes, s.shotId), ...edgeErrors(shapes, s.shotId), ...repeatErrors(shapes, s.shotId)]);
        for (const [j, ts] of stripTimes(s, tk).slice(0, 4).entries()) {
          const f = path.join(dir, `cell-${k + 1}-${j}.png`); fs.writeFileSync(f, Buffer.from((await page.evaluate((t) => window.__content(t), ts)).split(',')[1], 'base64')); cells.push(f);
          const preflight = path.join(dir, `preflight-${k + 1}-${j}.png`); fs.copyFileSync(f, preflight); preflightFrames.push(preflight);
          // type crossed or covered is read in the strip's cells too, from a quarter of the beat on, the moments the review
          // looks at (B17's 指紋 sat on the palm print at three quarters and the keyframe had it gone)
          if (j >= 1) { const sh = await page.evaluate(() => (window.__morphShapes ? window.__morphShapes() : [])); crossed.push(...onPicture(designedTypeBeats(cfg, id, g))([...crossErrors(await page.evaluate(() => window.__morphText()), sh, s.shotId), ...edgeErrors(sh, s.shotId), ...repeatErrors(sh, s.shotId)]).map((e) => `${e} (at ${(ts - s.at).toFixed(1)} s)`)); }
        }
        const strip = path.join(dir, `strip-${k + 1}-${s.shotId}.png`); writeStrip([...cells, file], strip); strips.push(strip);
        for (const f of cells) fs.rmSync(f, { force: true });
        // under it, the beat's hero move frame by frame (every 0.1 s from just before it): five frames across a beat
        // cannot show whether a move anticipates, eases and settles, or snaps (the motion-lab review: a strip of every
        // frame around the fastest move)
        const busy = await busiestAt(page, s.at, Math.min(s.at + s.dur, tk)).catch(() => null), ha = busy != null ? Math.max(s.at, busy - 0.4) : s.at + Math.max(0, Math.min(heroAt(s), s.dur - 1.1)), mcells = [];
        for (let j = 0; j < 10; j++) { const f = path.join(dir, `mcell-${k + 1}-${j}.png`); fs.writeFileSync(f, Buffer.from((await page.evaluate((t) => window.__content(t), Math.min(ha - 0.2 + j * 0.1, tk))).split(',')[1], 'base64')); mcells.push(f); }
        addMotionRow(strip, mcells);
        for (const f of mcells) fs.rmSync(f, { force: true });
        if (!drawn.length && k > 0) warnings.push(`${s.shotId}: no type at the keyframe`);
        const r = typeErrors(drawn, s.shotId); errors.push(...r.errors, ...plateErrors(drawn, s.shotId), ...overlapErrors(drawn, s.shotId), ...figureErrors(drawn, s, PROF.figureMin), ...digitFaceErrors(drawn, s.shotId), ...crossed.filter((e, i) => crossed.findIndex((x) => x.split(' (')[0] === e.split(' (')[0]) === i).slice(0, 6)); warnings.push(...r.warnings);
        const sourceBindings = readJson(path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json'), {}).shots || {};
        const sources = captionSourcesForBeat(sourceBindings, s.shotId, assets, projectPaths(cfg, id).root);
        const shownTexts = [...new Set(drawn.filter(d => !d.readout).map(d => d.whole || d.text))];
        errors.push(...numberErrors(shownTexts, g.shots.map(s => s.text).join(' '), { sources }));
        texts.push(...shownTexts); lettering.push(...drawn);   // a running readout (kit2 readout) states no figure
      }
      errors.push(...evidenceErrors(code, assets, evidenceInput, filmRows(acceptedFilmDesign(cfg, id), g.shots.map((s) => s.shotId)), evidenceFrames));
      const evidenceBindings = readJson(path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json'), {}).shots || {}, evidenceExpected = evidenceExpectations(code, evidenceInput);
      errors.push(...evidenceSourceErrors(code, evidenceInput, evidenceBindings));
      if (!stills && scoped.length) {
        const ids = new Set(scoped.map((r) => r.beat)), selected = [];
        evidenceFrames.forEach((f, i) => {
          const expected = [...new Set([...f.drawn.filter((d) => !d.readout && d.size >= 22 && (d.alpha ?? 1) >= 0.5).map((d) => d.whole || d.text).filter(Boolean), ...(evidenceExpected[f.beat] || [])])];
          if (ids.has(f.beat) && expected.length) selected.push({ file: keyframes[i], beat: f.beat, expected });
        });
        if (selected.length) {
          const L = await import('./legible.mjs');
          errors.push(...L.ocrKeyframeErrors(selected.map((r) => r.file), selected));
        }
      }
      const roughCut = resolveGateProfile(motionContract) === GATE_PROFILE_ROUGH;
      if (keyframes.length === g.shots.length) { // rough-cut: 主体偏上 fill → warn (Neo 2026-10-29); full stays hard
        const bal = balanceErrors(balanceRows(keyframes), g.shots.map((s) => s.shotId));
        const bp = partitionRoughCutWarns(bal, { roughCut }); errors.push(...bp.errors); warnings.push(...bp.warnings);
      }
      if (keyframes.length === g.shots.length) { const rows = groundRows(keyframes), look = lookGround(cfg, id); errors.push(...leaving(designedTypeBeats(cfg, id, g))(flatGroundErrors(rows, g.shots.map((s) => s.shotId), look)));
        profileCheck('brightness-quota', filmFollowErrors(rows, filmRows(acceptedFilmDesign(cfg, id), g.shots.map((s) => s.shotId)), g.shots.map((s) => s.shotId)));   // each beat as light as the film's design has it
        { const fdz = acceptedFilmDesign(cfg, id); if (fdz) errors.push(...groundTintErrors(rows, colourScript(fdz, filmAccent(cfg, id), loadPalettes(cfg)), g.shots.map((s) => s.shotId))); }   // and as the colour script coloured it
        profileCheck('brightness-quota', lowKeyErrors(rows, PROF, g.id)); profileCheck('colour-quota', colourErrors(rows, PROF, g.id, { mono: monoChapter(acceptedBrief(cfg, id, g), loadCompositions(cfg)) && (filmRows(acceptedFilmDesign(cfg, id), g.shots.map((s) => s.shotId)) || []).every((r) => !r.palette || r.palette === 'noir') }));   // (a map chapter is let off its colour only on the neutral palette: the user 2026-10-28, 可以各种配色)   // a map chapter: a neutral chart and one red
        { // rough-cut: ground busier than subject → warn; stand-off / type-pierce / 文盖物 stay hard
          const fgAll = leaving(designedTypeBeats(cfg, id, g))(figureGroundErrors(figRows, PROF));
          const fp = partitionRoughCutWarns(fgAll, { roughCut }); errors.push(...fp.errors); warnings.push(...fp.warnings);
        }
        try { fs.writeFileSync(path.join(projectPaths(cfg, id).out, 'chapters', g.id, 'figure-ground.json'), JSON.stringify(figRows, null, 1)); } catch {}   // (kept to calibrate the measure)
        if (look) { const gs = chapterGroups(cfg, id), i = gs.findIndex((x) => x.id === g.id), prev = i > 0 ? gs[i - 1] : null, pd = prev && path.join(projectPaths(cfg, id).out, 'chapters', prev.id);
          if (pd && fs.existsSync(pd) && !callbackGround(acceptedBrief(cfg, id, g), prev && acceptedBrief(cfg, id, prev))) errors.push(...sameGroundErrors(rows, groundRows(fs.readdirSync(pd).filter((f) => /^key-.*\.png$/.test(f)).map((f) => path.join(pd, f))), g.id, prev.id)); }
        // (one source for a beat's ground: a film designed whole takes its colour script, not the older per-chapter variant —
        // the two asked B02 for a light inverse ground and a neutral dark at once: the flow audit's 一个决定只有一个出处)
        if (!acceptedFilmDesign(cfg, id)) { const d = readJson(path.join(projectPaths(cfg, id).root, 'design.json'), null), mine = d?.chapters?.find((x) => x.chapter === g.id); if (mine) errors.push(...(await loadDesignBrain()).designErrors(rows, mine, g.id)); } }
      // every GEO_STEP s, not only the keyframes: type over type, over pictures and 3D objects, cut by the frame (geometryErrors)
      tick('nudges, beats, keyframes, frame checks');
      if (!errors.some((e) => FATAL.test(e))) { try { const track = await geometryTrack(page, g.total); measuredTrack = track; saveTrack(cfg, id, g, code, track); errors.push(...await bibleTrackErrors(cfg, id, g.shots, track, { taskMode })); errors.push(...geometryErrors(track, g.shots, { designed: designedTypeBeats(cfg, id, g) }), ...leaving(designedTypeBeats(cfg, id, g))((bibleSet(cfg, id) ? [] : pairErrors(track, g.shots, PROF))), ...surfaceReadErrors(track, g.shots, PROF)); profileCheck('type-density', typeDensityErrors(track, g.shots, PROF)); profileCheck('surface-quota', surfaceTypeErrors(track, g.shots, PROF, g.id)); if (!stills) { errors.push(...hopErrors(await textTrack(page, g.total), g.shots)); errors.push(...creepErrors(track, g.shots), ...flickerErrors(track, g.shots), ...motionErrors(track, g.shots)); const H = await import('./house.mjs'), lines = g.shots.map((x) => x.text || ''), hant = H.traditionalOn() ? H.toHant(lines) : lines; errors.push(...cueTimingErrors(track, g.shots, (x) => hant[lines.indexOf(x)] ?? x, { schedule: cueSchedule })); } } catch (e) { warnings.push(`geometry: ${String(e.message || e).split('\n')[0]}`); } }
      tick('geometry track and its checks');
      if (!errors.some((e) => FATAL.test(e))) { const curve = await motionCurve(page, g.total); measuredCurve = curve; if (!stills) errors.push(...jerkErrors(curve, g.shots)); { const acc = (() => { try { const L = filmLook(cfg, id); return L.picked ? L.accent : null; } catch { return null; } })(); if (acc) errors.push(...oneAccentErrors(curve, g.shots, acc, { palettes: Object.fromEntries((filmRows(acceptedFilmDesign(cfg, id), g.shots.map((x) => x.shotId), filmAccent(cfg, id), loadPalettes(cfg)) || []).filter((r) => r.palette?.ground).map((r) => [r.beat, [r.palette.ground, r.palette.key, r.palette.accent, r.palette.ink, r.palette.ink2].filter(Boolean)])) })); } if (!stills) { motion = holdErrors(curve, g.shots, { calmMax: (() => { try { return calmMaxOf(referenceProfile(cfg, id, { width: 960 })); } catch { return null; } })(), refCalm: (() => { try { return referenceCalms(cfg, id, g.shots); } catch { return {}; } })(), calmAsWarn: resolveGateProfile(motionContract) === 'rough-cut', contracts: Object.fromEntries((motionContract?.shots || []).map((s) => [s.shotId, s])) }); errors.push(...motion.errors); warnings.push(...motion.warnings);
        tick('motion curve');
        const cam = await page.evaluate((T) => (window.__camTrack ? window.__camTrack(T) : null), g.total); if (cam) { measuredCamera = cam.track || []; errors.push(...whipErrors(cam, g.shots), ...cutErrors(cam.cuts, g.shots, referenceTiming(cfg, id)), ...planTrackErrors(cam.track, g.shots, boardPlans(cfg, id))); }
        if (motion) motion.voiceTiming = Object.keys(cueSchedule).length ? 'voice-words' : 'estimated';
        // A module with declared subject motion exposes __actorTrack(total): [{t,id,state}]. Camera and frame
        // pixels cannot manufacture this evidence; motionRuntimeEvidence binds it to the same beat and actor.
        // Read the existing track for every motion chapter: an explicit plan2 match/carry needs it even without subjectMotion.
        if (!stills) {
          measuredActors = await page.evaluate((T) => window.__actorTrack ? window.__actorTrack(T) : [], g.total);
          if (!Array.isArray(measuredActors)) { errors.push(`${g.id}: __actorTrack must return an array of {t,id,state}`); measuredActors = []; }
        }
        // the design: one carrier, what carries over into every beat, ideas from the device library (refbreakdown.mjs)
        const plan = await page.evaluate(() => (window.__morphPlan2 ? window.__morphPlan2() : null));
        errors.push(...contentStateCarryErrors(plan, g.shots, measuredActors));
        const planeSpace = await page.evaluate(() => Array.isArray(window.__spaceTrack) ? window.__spaceTrack : []);
        measuredSpace = [...planeSpace, ...measuredTrack.filter((r) => r.camera?.world).map((r) => ({ t: r.t, form: '3d' }))];
        { const sm = seamErrors(curve, g.shots, { plan, opening: loadShots(cfg, id).map((x) => x.shotId).sort((x, y) => x.localeCompare(y, 'en', { numeric: true }))[0] === g.shots[0].shotId }); errors.push(...sm.errors); warnings.push(...sm.warnings); motion.seams = sm.seams; }
        errors.push(...await lungeErrors(page, curve, g.shots)); errors.push(...storyboardDeviceErrors(plan, chosenDevices(cfg, id, g)), ...storyboardFormErrors(plan, chosenDevices(cfg, id, g), code, { shots: g.shots, spaceTrack: measuredSpace }), ...planErrors(plan, g.shots.map((s) => s.shotId), loadDevices(cfg), code), ...chapterFollowErrors(plan, breakdownFor(cfg, id, g.shots.map((s) => s.shotId)), g.shots.map((s) => s.shotId)), ...cueErrors(plan, g.shots.map((s) => ({ beat: s.shotId, text: s.text })), loadDevices(cfg))); } }
    }
    allText = await page.evaluate(() => [...(window.__allText || [])]).catch(() => []);
  } catch (e) { errors.push(`the module fails in the page: ${String(e.message || e).split('\n')[0]}`); }
  finally { await close(); }
  if (pageErrors.length) errors.push(...[...new Set(pageErrors)].slice(0, 5).map((m) => `page error: ${m}`));
  errors.push(...faceErrors(lettering, (await import('./house.mjs')).lettering() === 'eva' ? null : referenceLook(cfg, id)));
  errors.push(...(await scriptErrors(allText)));
  // a module that ran and drew every beat is reviewed even when a layout rule failed, so the next round gets the
  // picture notes with the fix (paperclip-138-full: rounds spent on 8 px of type in the subtitle band, no review)
  const evidence = !stills && motionContract?.shots?.length ? motionRuntimeEvidence(motionContract, g.shots, { track: measuredTrack, curve: measuredCurve, camTrack: measuredCamera, actorTrack: measuredActors, greyboxDiffer }) : null;
  if (evidence) {
    errors.push(...evidence.errors); warnings.push(...evidence.warnings);
    if (measuredActors.length) writeJson(path.join(dir, 'actor-track.json'), measuredActors);
    if (measuredSpace.length) writeJson(path.join(dir, 'space-track.json'), measuredSpace);
    writeJson(path.join(dir, 'motion-evidence.json'), { contract: 'A1MotionEvidence/v1', chapter: g.id, codeHash: sha(code), motionContractHash: sha(JSON.stringify(motionContract)), track: 'track.json', curve: measuredCurve, cameraTrack: measuredCamera, actorTrack: measuredActors.length ? 'actor-track.json' : null, ...evidence });
  }
  if (!stills && motionContract?.shots?.length) {
    errors.push(...poseFromScaleContinuityErrors(motionContract, { track: measuredTrack, shots: g.shots, morphCode: code, greyboxDiffer }));
  }
  const reviewable = strips.length === g.shots.length && !errors.some((e) => FATAL.test(e));
  // Record only frames drawn for this candidate, before the separate preview render.
  // This receipt proves provenance and order, not a critic's visual approval.
  if (keyframes.length) writePreviewPreflight(dir, code, [...keyframes, ...preflightFrames, ...poseFrames.map(pose => pose.file)]);
  const geometryCoverage = geometryIntegrity(measuredTrack, g.shots);
  errors.push(...geometryCoverage.errors.filter(e => !errors.includes(e)));
  warnings.push(...geometryCoverage.warnings);
  writeJson(path.join(dir, 'geometry-integrity.json'), { chapter: g.id, codeHash: sha(code), track: 'track.json', ...geometryCoverage });
  return { taskMode, errors: stills ? errors : sampler(g)(errors), warnings, keyframes, strips, poseFrames, geometryIntegrity: geometryCoverage, motion: motion?.beats || null, motionEvidence: evidence?.rows || null, reviewable };
}

// ---------------------------------------------------------------- 4. review
// Target frames: what a finished film looks like for this project (project.json reference.frames, repo paths; for
// the 回形针 opening, stills of the shot-by-shot replica). The writer sees them and the review scores against them.
export const PASS_SCORE = 4;
export const REVIEW_VERSION = 'user-notes-2026-10-23';   // what the review looks at (a change redoes accepted chapters)
// what a chapter is built and scored to: the keyframes drawn for its beats (keyframes.mjs: the picture the director's
// design asks for, in the film's world) first, then the project's reference frames
// and, first of all, the reference film's own frames for the same lines (user, 2026-10-21: 对标是怎么做的): project.json
// reference.beats is a folder of one strip per beat (<beat>.jpg: five frames across the seconds the original says that
// line, found by its burned-in subtitles), so each chapter is written and scored against how the original showed it
// (paperclip-138-full: the writers saw only four stills of the original's opening and built every chapter from 3D blocks
// and pucks, where the original used evidence photos, red locus tags, a comparison table and a satellite map)
export function originalFrames(cfg, id, g) {
  const project = readJson(path.join(projectPaths(cfg, id).root, 'project.json'), {}), dir = project.reference?.beats;
  if (!dir || !g) return [];
  const root = path.isAbsolute(dir) ? dir : path.join(cfg.repoRoot, dir);
  return g.shots.map((s) => path.join(root, `${s.shotId}.jpg`)).filter((f) => fs.existsSync(f));
}
export function targetFrames(cfg, id, g = null) {
  const project = readJson(path.join(projectPaths(cfg, id).root, 'project.json'), {});
  const orig = originalFrames(cfg, id, g), own = g ? keyframesFor(cfg, id, g.shots.map((s) => s.shotId)) : [];
  return [...orig, ...[...own, ...(project.reference?.frames || []).map((f) => (path.isAbsolute(f) ? f : path.join(cfg.repoRoot, f))).filter((f) => fs.existsSync(f))].slice(0, 6)];
}
// what the attached target images are, in order (the writer's task and the review say it the same way)
export function targetsNote(nOrig, nOwn, own) {
  const parts = [];
  if (nOrig) parts.push(`前 ${nOrig} 张是对标原片讲同一句话时的画面（每拍一条，五格从左到右按时间）：先看原片这一拍用什么来表现——证物照片卡、红底标签、表格、地图、大字、剪报——用同一类手段来做（构图和细节自己设计，不照抄），不要换成 3D 方块、圆柱或小人`);
  if (nOwn) parts.push(`接着 ${nOwn} 张是导演按分镜给这一章关键拍画的效果图（${own}），照它的构图、主体、镜头和质感，字由代码排`);
  parts.push('其余是对标片静帧，成片要达到的水准（画面满、镜头有景深和运动、质感统一）');
  return parts.join('；');
}
export const weakFrames = (frames) => frames.filter((f) => f.score < PASS_SCORE);
// a review's scores to the beats under review: by the beat each names (a reviewer that scored every beat while only
// some were sent lands each score on its own beat; by position, B39's score of 3 for B44 went to B41 and the chapter
// passed), by position only for an answer that names none; beats not under review are dropped
export function reviewFrames(answer, shots) {
  const ids = shots.map((s) => s.shotId), named = (answer || []).some((f) => ids.includes(f.beat));
  const keep = (f) => ({ score: f.score, issue: f.issue, ...(f.toFour ? { toFour: f.toFour } : {}), ...(f.checked ? { checked: f.checked } : {}), ...(f.hard ? { hard: f.hard } : {}) });   // (the road to 4: reviewlist.mjs)
  const out = named ? (answer || []).filter((f) => ids.includes(f.beat)).map((f) => ({ beat: f.beat, ...keep(f) })) : (answer || []).slice(0, ids.length).map((f, k) => ({ beat: ids[k], ...keep(f) }));
  return ids.map((b) => out.find((f) => f.beat === b)).filter(Boolean);
}
// backend 'manual' (the default since 2026-10-21, user: 去掉 codex，之后都是你接入写): the review is a task of its own,
// tasks/<step>-review.task.json, bound to the module's answer hash; the session agent looks at the pictures and writes
// tasks/<step>-review.answer.json; until an answer newer than the task exists the chapter waits ({ pending })
// a beat that passed before and was changed is reviewed beside the keyframe it passed with (round four: B27 and B31
// passed at 4, were moved a little by a neighbour's fix and a fresh reviewer gave them 3 for things the passed version
// had too): not worse than that version keeps its pass
// a beat that failed last round is reviewed against what that review asked for (the user, 2026-10-23: 不要把流程搞复杂
// 卡很久): a fresh reviewer read each round as a new review and found a new fault each time (B39 four rounds at 3, each
// for something else); the second review confirms the named fix and looks for new hard faults only
// a note cut at a sentence's end, not mid-word (the reviewer of Suez B02 r10 read the last round's fix cut at 「让船在第 0」
// and could not check the fix it was told to check, 2026-10-27)
export function clipSentence(t, n) { if (t.length <= n) return t; const cut = Math.max(...['。', '；', '！', '？'].map((p) => t.lastIndexOf(p, n))); return cut > n * 0.5 ? t.slice(0, cut + 1) : t.slice(0, n) + '…'; }
export function fixesNote(fixes) {
  if (!fixes?.length) return '';
  return `\n\n复审：${fixes.map((f) => f.beat).join('、')} 上一轮没过线，当时指出的问题是——${fixes.map((f) => `${f.beat}：${clipSentence(String(f.issue || '').replace(/^（[^）]*）/, ''), 420)}`).join('；')}。这几拍先看这一条改好没有：改好了，并且没有出现新的硬伤（露馅清单里的、读不出的字、出画、字压线或压图、空掉的画面），就给 4 分；没改好，说清还差哪里。不要另找一条上一轮没提的小毛病来扣分。`;
}
export function previousNote(previous) {
  if (!previous?.length) return '';
  const ruled = previous.filter((p) => p.newRules).map((p) => p.beat);
  return `\n\n最后 ${previous.length} 张是 ${previous.map((p) => p.beat).join('、')} 上一轮过线（${previous.map((p) => p.score).join('、')} 分）时的关键帧（整幅，不是帧条）：这一版这一拍不比它差，就至少给它当时的分；比它差，说清差在哪一处。${ruled.length ? `其中 ${ruled.join('、')} 过线以后评审规则新加了几条（扣分的硬条件）：这几拍先按新加的条件看，犯了就按新条件扣，那一版也犯的不算"不比它差"。` : ''}`;
}
// how full, how flat and how red each beat is against the reference at the same moments (fill.py): numbers the reviewer
// and the writer read, not a gate (on the 43 beats of paperclip-138-full no threshold of them told the 3s from the 4s)
export function fillRows(pairs) {
  if (!pairs.length) return [];
  const r = spawnSync('python3', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'fill.py'), ...pairs.flat()], { encoding: 'utf8' });
  return r.status ? [] : r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
export function fillNotes(rows, beats) {
  return rows.map((r, k) => {
    const out = [], b = beats[k]; if (!b) return null;
    if (r.flat - r.refFlat > 0.25) out.push(`${b}: the ground is much flatter than the reference's at the same moments (flat ${Math.round(r.flat * 100)} % against ${Math.round(r.refFlat * 100)} %): lay a textured plate (paper, a page, a desk, film) under the figures`);
    if (r.ourRed > 0.02 && r.ourRed > 3 * r.refRed) out.push(`${b}: ${Math.round(r.ourRed * 1000) / 10} % of the frame is red against the reference's ${Math.round(r.refRed * 1000) / 10} %: red marks one thing, the one the line is about`);
    if (r.refFill > 0.1 && r.ourFill < 0.5 * r.refFill) out.push(`${b}: carries ${Math.round((r.ourFill / r.refFill) * 100)} % of what the reference's frames carry at the same moments: grow the subject or bring the ground in`);
    return out;
  }).flat().filter(Boolean);
}
export const motionEvidenceSignature = (rows) => rows ? sha(JSON.stringify(rows.map(({ shotId, expectedCamera, camera, visibleChange, semantic, reason }) => ({ shotId, expectedCamera, camera, visibleChange, semantic, reason })))) : null;
export async function reviewKeyframes(cfg, g, keyframes, targets = [], shots = g.shots, { id = null, answerHash = null, previous = [], fixes = [], lists = {}, motionEvidence = null, poseFrames = [], motionImplementation = [] } = {}) {
  const design = id ? acceptedFilmDesign(cfg, id) : null;
  const designByBeat = new Map((design?.beats || []).map((row) => [row.beat, row.directorIntent || null]));
  const reviewBeats = shots.map((s) => ({ beat: s.shotId, text: s.text, ...(designByBeat.get(s.shotId) ? { directorIntent: designByBeat.get(s.shotId), ...(design?.motionRules ? { motionRules: design.motionRules } : {}) } : {}) }));
  const intentSignature = (rows) => rows.some((b) => b?.directorIntent) ? sha(JSON.stringify(rows.map((b) => ({ beat: b?.beat, directorIntent: b?.directorIntent || null, ...(b?.motionRules ? { motionRules: b.motionRules } : {}) })))) : null;
  const forIntent = intentSignature(reviewBeats);
  const list = reviewBeats.map((s, k) => `${k + 1}. ${s.beat}：${s.text}${s.directorIntent ? `\n导演意图（对照实际画面，不能仅凭文字判通过）：${JSON.stringify(s.directorIntent)}${s.motionRules ? `\n整片共同运动规则（核对实际表现，不是强制统一轴/匹配转场）：${JSON.stringify(s.motionRules)}` : ''}` : ''}`).join('\n');
  const nOrig = id ? originalFrames(cfg, id, g).filter((f) => shots.some((s) => path.basename(f, '.jpg') === s.shotId)).length : 0;
  // a strip's cell is a third of the frame: the third review read a 120 px figure as 50 px and a 64 px name as 20 px
  const SCALE_NOTE = '帧条每格是原画面的三分之一（640×360）：在格子里量到的字号、尺寸乘以 3 才是画面上的（格子里 40 px 的字在画面上是 120 px）；并排图每格约是原画面的 0.4 倍。';
  const head = targets.length ? `## 附图\n前 ${targets.length} 张是对标${nOrig ? `：先是原片讲同一句话时的画面（${nOrig} 条，打分时对照：原片用什么表现这一拍，这一版是不是同一类手段、做得有没有原片好），再是成片水准的静帧` : '静帧（成片的水准）'}，后 ${keyframes.length} 张是这一章每拍的帧条（一拍一条，从左到右：拍头、1/4、1/2、3/4、拍尾），按下面的顺序。${SCALE_NOTE}\n\n` : `## 附图\n都是这一章每拍的帧条（从左到右：拍头、1/4、1/2、3/4、拍尾），按下面的顺序。${SCALE_NOTE}\n\n`;
  const reviewIds = new Set(shots.map(shot => shot.shotId)), reviewPoses = poseFrames.filter(pose => reviewIds.has(pose.beat));
  const referenceComparisons = (Array.isArray(motionImplementation) ? motionImplementation : []).filter(row => reviewIds.has(row.shotId) && row.referenceComparison).map(row => ({ shotId: row.shotId, referenceComparison: row.referenceComparison }));
  const forReferences = sha(targets.map(file => fs.existsSync(file) ? sha(fs.readFileSync(file)) : '-').join(',')), forPoses = sha(reviewPoses.map(pose => `${pose.beat}:${pose.phase}:${pose.time}:${pose.hash}`).join(','));
  let r;
  const requireIndependent = !!id && designSet(loadProject(cfg, id) || {});
  if (id && (requireIndependent || agentFor(cfg, id, 'morph-review') !== 'codex')) {
    const step = `${stepOf(g)}-review`, tp = taskPaths(cfg, id, step), task = readJson(tp.task);
    // an answer counts for the module, the rules and the beats it was asked about: a review given under older rules, or
    // about other beats, is not this one (B18's answer from before the 2026-10-23 rules was read again and its beats
    // stamped as passing under the new rules)
    // and for the pictures it saw: the same answer drawn by a changed engine is another picture (2026-10-25: B07's review
    // of the pictures before the lettering changed was read again for the new ones and failed them on their old faces)
    const forRules = reviewRulesHash(cfg), forBeats = shots.map((s) => s.shotId).join(','), forPics = sha(keyframes.map((f) => (fs.existsSync(f) ? sha(fs.readFileSync(f)) : '-')).join(',')), forMotion = motionEvidenceSignature(motionEvidence);
    // pictures that render a hair apart (a 3D frame is not byte-identical from one run to the next) are the pictures the
    // review saw: B23 was sent back for review three runs in a row with nothing on screen changed (2026-10-25)
    const forPrints = keyframes.map((f) => picPrint(f));
    // or a task about more beats whose answer covers these, their pictures unchanged: a beat locked since (it passed) left
    // the rest's answer standing (B10's review of B10 B13 B15 B16 was thrown away when B10 locked, 2026-10-26)
    const tb = String(task?.forBeats ?? '').split(','), covers = !!task?.forPrints && shots.length > 0 && shots.every((s, k) => { const j = tb.indexOf(s.shotId); return j >= 0 && samePrints([task.forPrints[j]], [forPrints[k]]); });
    const taskIntents = shots.map((s) => (task?.input?.beats || []).find((b) => b.beat === s.shotId) || { beat: s.shotId });
    const same = task?.forAnswer === answerHash && (task?.forRules ?? null) === forRules && (task?.forMotion ?? null) === forMotion && (task?.forReferences ?? null) === forReferences && (task?.forPoses ?? null) === forPoses && intentSignature(taskIntents) === forIntent && (!requireIndependent || task?.independentReview?.writerStep === stepOf(g)) && JSON.stringify(task?.lists || {}) === JSON.stringify(lists || {}) && (((task?.forBeats ?? forBeats) === forBeats && (task?.forPics === forPics || samePrints(task?.forPrints, forPrints))) || covers);
    const writerProof = requireIndependent ? writerSubmissionStatus(cfg, id, stepOf(g), answerHash) : null;
    const answerPresent = same && fs.existsSync(tp.answer) && fs.statSync(tp.answer).mtimeMs > fs.statSync(tp.task).mtimeMs;
    const proof = answerPresent && requireIndependent ? reviewSubmissionStatus(cfg, id, step, task, { writerStep: stepOf(g) }) : null;
    const ready = answerPresent && (!requireIndependent || proof?.ok);
    if (!ready) {
      // Preserve every prior answer by content; the new task is blind and never includes the old answer.
      // A still-present old answer cannot count: it predates the newly written task.
      if (!same && fs.existsSync(tp.answer)) {
        const bytes = fs.readFileSync(tp.answer), backup = tp.answer.replace(/\.json$/, `.prev-${sha(bytes)}.json`);
        if (!fs.existsSync(backup)) fs.copyFileSync(tp.answer, backup, fs.constants.COPYFILE_EXCL);
      }
      // the beats' roads to 4 (reviewlist.mjs): the lists as they are now go with the task, and its answer is settled against them
      if (!same) writeTask(cfg, id, step, { rules: REVIEW_RULES, schema: REVIEW_SCHEMA, forAnswer: answerHash, forRules, forBeats, forPics, forPrints, forMotion, forReferences, forPoses, forIntent, lists, ...(requireIndependent ? { independentReview: { writerStep: stepOf(g), contract: 'A1DistinctThreadReview/v1' } } : {}), input: { beats: reviewBeats, images: (head.trim() + (reviewPoses.length ? `\n\n最后 ${reviewPoses.length} 张是 scoped 拍的入场/关键/出场三姿势；逐拍对照参考、作者比较和实际画面，三者都成立才可给 4。` : '') + previousNote(previous) + (Object.keys(lists).length ? listNote(lists) : fixesNote(fixes))).trim(), tells: chapterInput(cfg, id, g).tells, ...(referenceComparisons.length ? { referenceComparisons, referenceComparisonNote: '作者自述不是视觉通过；必须核对绑定参考与三姿势实际像素。' } : {}), ...(forIntent ? { directorIntentNote: '逐拍对照导演意图与实际帧条/片段，判断画面是否表达了关系与变化；意图文字本身不构成视觉证据。' } : {}), ...(requireIndependent ? { submission: `独立新线程写候选 JSON 后运行 node scripts/recipe-board.mjs submit-task --project ${id} --step ${step} --answer-file <候选文件>；作者和审者必须有不同的运行线程记录。` } : {}), ...(motionEvidence ? { motionEvidence, motionEvidenceNote: '逐拍量到的相机/画面变化；画面变化不等于主体动作或转场语义成立，须看实际片段独立判断。' } : {}) }, images: [...targets, ...keyframes, ...reviewPoses.map(pose => pose.file), ...previous.map((p) => p.file)] });
      return { pending: step, ...(writerProof && !writerProof.ok ? { why: writerProof.why } : proof && !proof.ok ? { why: proof.why } : {}) };
    }
    r = readJson(tp.answer); r.asked = task?.lists || {}; r.taskFile = tp.task; if (proof?.ok) r.independence = { status: proof.status, note: '提交线程不同；历史内容的原作者身份未由此证明。' }; markRead(tp.task, answersKey([tp.answer]));
  } else {
    const { codexExecutable, runCodexJson } = await import('./director.mjs');
    const bin = codexExecutable();
    if (!bin) return { skipped: 'Codex CLI not found: the keyframes were not reviewed' };
    const rules = fs.readFileSync(path.join(cfg.repoRoot, REVIEW_RULES), 'utf8');
    r = await runCodexJson(bin, `${rules}\n\n${head}${previousNote(previous)}${fixesNote(fixes)}\n\n## 这一章\n${list}${motionEvidence ? `\n\n运行证据（画面变化不能证明动作语义，须独立看画面）：${JSON.stringify(motionEvidence)}` : ''}`, path.join(cfg.repoRoot, REVIEW_SCHEMA), { firstKey: 'frames', images: [...targets, ...keyframes, ...previous.map((p) => p.file)], timeoutMs: 600_000 });
  }
  const frames = reviewFrames(r.frames, shots);
  const weak = weakFrames(frames);
  return { frames, mean: +(frames.reduce((a, f) => a + f.score, 0) / Math.max(1, frames.length)).toFixed(2), weak, ...(r.taskFile ? { asked: r.asked, taskFile: r.taskFile } : {}), ...(r.independence ? { independence: r.independence } : {}) };
}
// Beats that passed stay passed: a beat that scored PASS_SCORE or more is locked with its keyframe; next round, if its
// keyframe comes out the same (the rewrite left it alone), it keeps its score and is not reviewed again. Only the
// beats that failed, or a locked one whose picture changed, go back to the review (a whole-chapter rewrite that fixed
// one beat used to lose another: paperclip-138-open dropped "最小 8 岁" in one round).
export function sameFrame(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
  if (fs.readFileSync(a).equals(fs.readFileSync(b))) return true;
  // the five cells of a strip only (its first 360 rows): the motion row under them is where the beat moves, not what it shows
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', '[0]crop=iw:min(ih\\,360):0:0[x];[1]crop=iw:min(ih\\,360):0:0[y];[x][y]psnr', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /average:(inf|[\d.]+)/.exec(r.stderr || '');
  return !!m && (m[1] === 'inf' || +m[1] >= 38);
}
// the passed beats a round starts from: the last check's locks, and the chapter record's passing beats whose locked
// keyframe is on disk. They do not depend on the chapter's input hash (2026-10-23: a kit change altered the engine's
// hash, every lock was dropped, and eleven passed beats went back to fresh reviewers, who gave seven of them 3 for
// pictures they had passed at 4); whether a beat still stands is the picture's to say (splitLocked), and a beat whose
// line changed is not locked
// what the last review asked of the beats that failed it (the last check's review, else the chapter record's)
export function lastFixes(prev, rec, beats) {
  const frames = [...(prev?.review?.frames || []), ...(rec?.review?.frames || [])];
  return beats.map((b) => frames.find((f) => f.beat === b && f.score < PASS_SCORE && f.issue)).filter(Boolean).map((f) => ({ beat: f.beat, issue: f.issue }));
}
// recRules: the review's rules the accepted record passed under (its reviewRules, or the rules now when it was accepted
// after they last changed): a beat taken back from the record keeps them, and is not reviewed again for rules that never
// changed (2026-10-26: a check that failed on a rule dropped B20's lock, the record gave it back without its rules, and
// seven chapters were sent to review with their pictures unchanged)
export function lockedBeats(prev, rec, shots, hasFile, recRules = null) {
  const pass = (frames, rules) => Object.fromEntries((frames || []).filter((f) => f.score >= PASS_SCORE).map((f) => [f.beat, { score: f.score, issue: f.issue || '', ...(rules ? { rules } : {}) }]));
  const fromRec = pass(rec?.review?.frames, recRules), out = { ...fromRec, ...(prev?.locked || pass(prev?.review?.frames)) };
  // a lock of the last check written without its rules (a beat taken back from the record a round before) takes the
  // record's, when the record passed it too (B20 went back to review twice for rules that never changed)
  for (const [b, L] of Object.entries(out)) if (L.rules == null && fromRec[b]?.rules) out[b] = { ...L, rules: fromRec[b].rules };
  for (const [b, L] of Object.entries(out)) { const s = shots.find((x) => x.shotId === b); if (!s || !hasFile(b) || (L.text != null && L.text !== s.text)) delete out[b]; }
  return out;
}
// a beat passed under rules the review has since added to is not kept on its old score: it is reviewed again beside
// the version that passed, under the new rules (2026-10-23: the user's notes on B20 B44 B47 became review rules, and
// the locks kept those beats at 4 without a look). rules: the hash of the review's rules when the beat passed
export function splitLocked(locked, shots, keyframes, lockedFile, rules = null) {
  const kept = [], again = [];
  shots.forEach((s, k) => { const L = locked[s.shotId], ruled = !rules || L?.rules === rules;
    if (L && ruled && sameFrame(keyframes[k], lockedFile(s.shotId))) kept.push({ beat: s.shotId, score: L.score, issue: L.issue || '', locked: true });
    else again.push({ s, k, was: L || null, newRules: !!L && !ruled }); });
  return { kept, again };
}
export const reviewRulesHash = (cfg) => { try { return sha(withoutSection(fs.readFileSync(path.join(cfg.repoRoot, REVIEW_RULES), 'utf8'))).slice(0, 16); } catch { return null; } };   // (the user's decisions' section left out: reviewrules.mjs)
export const reviewErrors = (rev) => (rev?.weak || []).map((f) => `review: ${f.beat} scored ${f.score} — ${f.issue || 'no reason given'}`);

// ---------------------------------------------------------------- state and the step
const recordFile = (cfg, id, g) => path.join(chapterDir(cfg, id, g), `${g.id}.json`);
const recordAssets = (cfg, id, g) => g.assets || Object.fromEntries(Object.entries(readJson(recordFile(cfg, id, g))?.assets || {}).map(([k, f]) => [k, path.join(engineRoot(cfg), f)]));
// the kits example is guidance for new chapters only: it is left out, so adding it did not re-run accepted ones
export const inputHash = ({ example, example3d, exampleKits, ...input }) => sha(JSON.stringify({ ...input, example: sha(example || ''), example3d: sha(example3d || ''), exampleKits: sha(exampleKits || '') }));
export function chapterAdmissionErrors(cfg, id, { input, task, answer, previousCheck, answerHash, record = null, requireHandoff = false, expectedHash = inputHash(input) }) {
  // Only the identical, actually accepted artifact is grandfathered. A failed check
  // or an unchanged rejected answer cannot confer authority on a later attempt.
  if (record?.acceptedAt && record.codeHash === sha(answer?.code || '') && previousCheck?.ok && previousCheck.answerHash === answerHash) return [];
  const expected = expectedHash;
  if (!requireHandoff) return taskBindingErrors(answer, expected, previousCheck, answerHash);
  const errors = taskBindingErrors(answer, expected, null, answerHash);
  if (!task || task.inputHash !== expected || task.input?.sourceTaskInputHash !== expected ||
      Object.keys(input).some((key) => JSON.stringify(task.input?.[key]) !== JSON.stringify(input[key]))) errors.push('chapter task is missing, stale or has forged production inputs; run session-brief again');
  if (!handoffGuidesFresh(cfg, task?.input?.handoffGuides)) errors.push('chapter handoff guide is missing or stale');
  if (!input.inheritance?.files || Object.values(input.inheritance.files).some((h) => !h)) errors.push('chapter authority sources are missing');
  const files = productionInputFiles(cfg, id, input);
  if (files.some((f) => !f.hash) || JSON.stringify(files) !== JSON.stringify(input.inheritance?.productionFiles)) errors.push('chapter production files are missing or stale');
  return errors;
}
export function taskBindingErrors(answer, expectedHash, previousCheck, answerHash) {
  if (!answer || answer.sourceTaskInputHash === expectedHash) return [];
  // An already-checked answer remains available for rechecking under new rules; don't discard prior work.
  if (previousCheck?.answerHash && previousCheck.answerHash === answerHash) return [];
  return ['the answer is not bound to this chapter task version: copy input.sourceTaskInputHash into answer.sourceTaskInputHash and review the current task before submitting'];
}
// a newer version of an accepted chapter checked and waiting on its review is still in play: it is not the accepted
// one (B10 B26 B39 B47: their new versions' reviews were never read, the old modules stood as accepted)
export const chapterPending = (check, rec) => !!(check?.pendingReview || check?.pendingTaste || check?.pendingArbiter) && (!rec || rec.acceptedAt == null || new Date(check.checkedAt || 0) > new Date(rec.acceptedAt));
export const answerFresh = (prev, answerHash, inputHash, waivedAfter = false) => !prev || prev.answerHash !== answerHash || !!prev.pendingReview || !!prev.pendingTaste || !!prev.pendingArbiter || (prev.inputHash != null && prev.inputHash !== inputHash) || waivedAfter;
function guideBindings(cfg, guides) {
  if (!Array.isArray(guides)) return [];
  return guides.map((g) => { try { return { path: g.path, hash: sha(fs.readFileSync(path.resolve(cfg.repoRoot, g.path))) }; } catch { return { path: g?.path ?? null, hash: null }; } });
}
export function handoffGuidesFresh(cfg, guides) {
  if (!Array.isArray(guides) || !guides.length) return false;
  return guides.every((g) => { try { if (!g || typeof g.path !== 'string' || typeof g.hash !== 'string') return false; const root = fs.realpathSync(cfg.repoRoot), file = fs.realpathSync(path.resolve(root, g.path)), rel = path.relative(root, file); return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel) && sha(fs.readFileSync(file)) === g.hash; } catch { return false; } });
}
// an arbiter's ruling or a director's appeal written after the chapter's last check: the same module is read again with
// it (Suez B02's taste waiver sat unread: the answer had not changed, 2026-10-27)
export const waivedAfter = (cfg, id, g) => { const d = path.join(projectPaths(cfg, id).root, 'tasks'), c = path.join(d, `${stepOf(g)}.check.json`); if (!fs.existsSync(c)) return false; const t = fs.statSync(c).mtimeMs; return [`arbiter-${stepOf(g)}-review.answer.json`, `arbiter-taste-${g.id}.answer.json`, `${stepOf(g)}-review.appeal.json`, `taste-${g.id}.appeal.json`].some((f) => { const p = path.join(d, f); return fs.existsSync(p) && fs.statSync(p).mtimeMs > t; }); };
function chapterTaskHash(cfg, id, g, input) {
  const six = sixStage(loadProject(cfg, id));
  return inputHash({ ...input, targets: targetFrames(cfg, id, g).map((f) => path.relative(cfg.repoRoot, f)), pass: PASS_SCORE, review: REVIEW_VERSION, engine: engineCodeHash(cfg), checks: checksHash(), rules: reviewRulesHash(cfg), effort: resolveEffort(null, loadProject(cfg, id)), ...(six ? { polish: polishOpen(cfg, id) } : {}) });
}
export function chapterState(cfg, id, { only = null } = {}) {
  const groups = chapterGroups(cfg, id).filter((g) => !only || g.shots.some((s) => only.has(s.shotId)));
  return groups.map((g) => {
    const rec = readJson(recordFile(cfg, id, g)), input = chapterInput(cfg, id, g), tp = taskPaths(cfg, id, stepOf(g));
    // the engine the module runs on is part of what it was checked against (2026-10-23: a kit change left a chapter's
    // failed check standing; an unchanged answer was never run again on the fixed kit)
    // (a six-stage film: a chapter checked before its structure was approved had no blind review; approving the structure
    // makes it due again, now reviewed — gates.mjs polishOpen. Older films' hashes are unchanged)
    const h = chapterTaskHash(cfg, id, g, input);
    const current = rec && !rec.draft && rec.inputHash === h && fs.existsSync(moduleFile(cfg, id, g));
    const check = readJson(tp.check);
    // an answer checked under another input (the engine, the checks or the review rules changed) is checked again by
    // the next run, not waited for (2026-10-25: five accepted chapters were listed as waiting on a writer after a kit change)
    const answered = fs.existsSync(tp.answer) && (!check || check.answerHash !== sha(fs.readFileSync(tp.answer, 'utf8')) || chapterPending(check, rec) || (!current && check.inputHash != null && check.inputHash !== h));
    // a new answer to an accepted chapter is checked again (a revision after acceptance was ignored: hupo-auto2 B29)
    const task = readTask(cfg, id, stepOf(g)), isDesign = designSet(loadProject(cfg, id) || {}), taskFresh = !!task && task.inputHash === h && task.input?.sourceTaskInputHash === h && (!isDesign || (input.inheritance?.greyboxState === 'approved' && handoffGuidesFresh(cfg, task.input?.handoffGuides)));
    return { g, input, hash: h, taskFresh, state: answered ? 'answered' : current ? 'accepted' : check?.ok === false ? 'rejected' : 'waiting', rec, check };
  });
}

// A session brief and its task are one handoff. Refresh the task after the motion contract is written,
// but never delete or overwrite an existing answer or an accepted chapter.
export function refreshChapterTask(cfg, id, chapterId, { handoffGuides = [] } = {}) {
  if (designSet(loadProject(cfg, id) || {}) && GB.approvedGreybox(cfg, id).state !== 'approved') throw new Error('greybox is not currently checked; no new chapter task may be dispatched');
  const st = chapterState(cfg, id).find((x) => x.g.id === chapterId);
  if (!st) throw new Error(`no chapter ${chapterId}`);
  const pending = chapterRedesignPending(cfg, id, st.g);
  if (pending.length) throw new Error(`unapplied storyboard rewrite: ${pending.join(', ')}`);
  const missing = [...Object.entries(st.input.inheritance.files).filter(([, h]) => !h).map(([f]) => f), ...st.input.inheritance.productionFiles.filter((f) => !f.hash).map((f) => f.file)];
  if (missing.length) throw new Error(`chapter handoff missing required sources: ${missing.join(', ')}`);
  const step = stepOf(st.g), previous = readTask(cfg, id, step), carry = {};
  for (const key of ['previousAnswer', 'checkErrors', 'keep', 'referenceGaps', 'targets']) if (previous?.input?.[key] != null) carry[key] = previous.input[key];
  const guides = handoffGuides.map((file) => ({ path: file, hash: sha(fs.readFileSync(path.resolve(cfg.repoRoot, file))) }));
  if (guides.length && !handoffGuidesFresh(cfg, guides)) throw new Error('handoff guide is outside the workspace or changed while preparing the task');
  st.input.inheritance.handoffGuides = guides;
  const hash = chapterTaskHash(cfg, id, st.g, st.input);
  const task = { rules: RULES, schema: SCHEMA, inputHash: hash, input: { ...st.input, ...carry, sourceTaskInputHash: hash, submission: `写候选 JSON 后运行 node scripts/recipe-board.mjs submit-task --project ${id} --step ${step} --answer-file <候选文件>，由系统记录执行线程。`, ...(guides.length ? { handoffGuides: guides } : {}) }, images: [...new Set([...(previous?.images || targetFrames(cfg, id, st.g)), ...productionInputPaths(cfg, id, st.input.guidance, ['frame', 'image'])].filter((f) => fs.existsSync(f)))] };
  return writeTask(cfg, id, step, task);
}

function bindSlices(cfg, id, g, mp4) {
  const p = projectPaths(cfg, id), rel = path.relative(engineRoot(cfg), mp4).split(path.sep).join('/'), bound = [];
  for (const s of g.shots) {
    const f = path.join(p.shots, `${s.shotId}.json`), shot = JSON.parse(fs.readFileSync(f, 'utf8'));
    const want = { chapter: g.id, video: { path: rel, in: s.at, out: +(s.at + s.dur).toFixed(3) } };
    if (JSON.stringify(shot.slots?.background) === JSON.stringify(want)) continue;
    shot.slots = { ...(shot.slots || {}), background: want };
    fs.writeFileSync(f, JSON.stringify(shot, null, 1) + '\n'); bound.push(s.shotId);
  }
  return bound;
}

// rounds: at most this many a run; a run also stops when the review's mean has not risen for STALL rounds in a row
// (more rounds of the same notes did not help: paperclip-138-open sat at 3 for nine rounds)
export const STALL = 2;
// renderDrafts: false while chapters are iterated (the `chapter` command): a draft is recorded but its film render waits
// for `run` (each round re-rendered every not-passed chapter, 3-5 minutes each, only for the next round to replace it)
// ---- the quick look (user, 2026-10-21: 先不急全篇，小章节快速跑): the last checked version of a chapter as a half-size video
// (one draw a frame; blur: true adds the film's motion-blur subframes), between the last CONTEXT s of the shot before it and the first CONTEXT s of the shot after it
// (from the current reel's pieces), so a round can be judged in motion and at its seams without rendering the film.
// out/chapters/<id>/preview.mp4. Takes about a quarter of a full render (a quarter of the pixels to capture).
export const PREVIEW_SCALE = 0.5, CONTEXT = 2;
export function neighbours(order, first, last) {
  const a = order.indexOf(first), b = order.indexOf(last);
  return { before: a > 0 ? order[a - 1] : null, after: b >= 0 && b < order.length - 1 ? order[b + 1] : null };
}
// the reference's seconds for these beats: from the first one's start to the next beat's start after the last one
// (beat-times.json beside the reference video)
// each beat's span in the reference: from its breakdown (the beat as the reference shows it), else beat-times
export function referenceBeatSpans(cfg, id, beatIds) {
  const R = referencePaths(cfg, id); if (!R) return {};
  const out = {}, bd = breakdownFor(cfg, id, beatIds);
  for (const b of bd?.beats || []) out[b.beat] = [b.from, b.to];
  let times = {}; try { times = JSON.parse(fs.readFileSync(path.join(R.dir, 'beat-times.json'), 'utf8')); } catch {}
  for (const b of beatIds) if (!out[b] && times[b]) out[b] = times[b];
  return out;
}
// moments a beat: at these shares of its span, in ours and in the reference
export const PAIR_AT = [0.35, 0.8];
export function pairTimes(shots, spans) {
  return shots.filter((s) => spans[s.shotId]).flatMap((s) => PAIR_AT.map((k) => ({ beat: s.shotId, ours: +(s.at + s.dur * k).toFixed(2), ref: +(spans[s.shotId][0] + (spans[s.shotId][1] - spans[s.shotId][0]) * k).toFixed(2) })));
}
function pairSheet(cfg, id, g, clip, out) {
  const R = referencePaths(cfg, id); if (!R || !fs.existsSync(R.video)) return null;
  const pairs = pairTimes(g.shots, referenceBeatSpans(cfg, id, g.shots.map((s) => s.shotId))); if (!pairs.length) return null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pairs-')), grab = (v, t, f) => spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', v, '-frames:v', '1', '-vf', 'scale=800:450', f]);
  const ins = [];
  pairs.forEach((p, i) => { const a = path.join(tmp, `r${i}.png`), b = path.join(tmp, `o${i}.png`); grab(R.video, p.ref, a); grab(clip, p.ours, b); ins.push(a, b); });
  const n = pairs.length, args = ins.flatMap((f) => ['-i', f]), rows = pairs.map((p, i) => `[${2 * i}:v][${2 * i + 1}:v]hstack=2[r${i}]`).join(';');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args, '-filter_complex', `${rows};${pairs.map((_, i) => `[r${i}]`).join('')}vstack=${n}[v]`, '-map', '[v]', '-q:v', '4', out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status) throw new Error(String(r.stderr).split('\n')[0]);
  return out;
}
// a pending review of the version this preview shows gets the preview's pairs and gaps: the reviewer scores against
// the reference at the same moments, not five frames of ours alone (B26's twelve rounds were found by these sheets)
export function bindPreviewToReview(cfg, id, g, dir) {
  const step = stepOf(g), ch = readJson(taskPaths(cfg, id, step).check), shot = readJson(path.join(dir, 'check-shot.json'));
  if (!ch?.pendingReview || !shot) return false;
  const rp = taskPaths(cfg, id, ch.pendingReview), task = readJson(rp.task); if (!task || task.forAnswer !== ch.answerHash) return false;
  const pairs = path.join(dir, 'pairs.jpg'), gp = readJson(path.join(dir, 'preview', 'profile-gaps.json'));
  if (fs.existsSync(pairs) && !task.images.includes(pairs)) { task.images = [pairs, ...task.images]; task.input.images = `第一张：这一版和原片讲同一句话的同一时刻并排（每行左原片、右这一版，每拍两刻）。${task.input.images || ''}`; }
  if (gp) task.input.referenceGaps = { chapter: gp.gaps, beats: gp.beats || [] };
  fs.writeFileSync(rp.task, JSON.stringify(task, null, 1) + '\n');
  return true;
}
export function referenceSpan(cfg, id, beatIds) {
  const R = referencePaths(cfg, id); if (!R) return null;
  let times; try { times = JSON.parse(fs.readFileSync(path.join(R.dir, 'beat-times.json'), 'utf8')); } catch { return null; }
  const have = beatIds.filter((b) => times[b]); if (!have.length) return null;
  const from = Math.min(...have.map((b) => times[b][0])), last = Math.max(...have.map((b) => times[b][1]));
  const next = Object.values(times).map((t) => t[0]).filter((t) => t >= last).sort((a, b) => a - b)[0];
  return [from, next ?? last + 2];
}
export function previewModuleSource(cfg, shotFile) {
  const shotBytes = fs.readFileSync(shotFile), spec = JSON.parse(shotBytes), url = spec?.params?.module;
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) throw new Error('preview shot must name a local module');
  const root = fs.realpathSync(engineRoot(cfg)), file = fs.realpathSync(path.resolve(root, '.' + url)), relative = path.relative(root, file);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('preview module leaves the source root');
  return { file, code: fs.readFileSync(file, 'utf8'), shotBytes };
}
export async function previewChapter(cfg, id, chapterId, { scale = PREVIEW_SCALE, context = CONTEXT, blur = false, log = console.log } = {}) {   // blur: the film's motion-blur subframes (4 draws a frame)
  assertScopeAllows(loadProject(cfg, id), 'chapter');
  assertRenderStorage(cfg, id);
  const st = chapterState(cfg, id, { only: new Set([chapterId]) })[0];
  if (!st) throw new Error(`no chapter ${chapterId}`);
  const { g } = st, dir = outDir(cfg, id, g), shot = path.join(dir, 'check-shot.json');
  if (!fs.existsSync(shot)) throw new Error(`${chapterId}: no checked version yet (run chapter --only ${chapterId} first)`);
  const renderedSource = previewModuleSource(cfg, shot);
  const tp = taskPaths(cfg, id, stepOf(g)), answerHash = fs.existsSync(tp.answer) ? sha(fs.readFileSync(tp.answer, 'utf8')) : null;
  const poseGate = scopedPoseReviewErrors({ filmDesign: acceptedFilmDesign(cfg, id), check: readJson(tp.check), answerHash });
  if (poseGate.length) throw new Error(`${chapterId}: ${poseGate.join('; ')}`);
  const t0 = Date.now(), previewStartedAt = new Date(t0).toISOString(), { shoot } = await import(pathToFileURL(path.join(engineRoot(cfg), ENGINE, 'shoot.mjs')).href);
  const [clip] = await shoot({ pageDir: path.join(engineRoot(cfg), ENGINE, 'director'), page: 'shot.html', mode: 'video', variants: ['clean'], query: `shot=${encodeURIComponent(rootUrl(cfg, shot))}&fps=30${blur ? '' : '&draft=1'}`, tag: 'preview', outDir: path.join(dir, 'preview'), scale });
  const W = Math.round(1920 * scale), H = Math.round(1080 * scale), reel = path.join(projectPaths(cfg, id).out, 'reel');
  const order = loadShots(cfg, id).map((s) => s.shotId).sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
  const nb = neighbours(order, g.shots[0].shotId, g.shots.at(-1).shotId);
  const parts = [], filt = [];
  const add = (file, args) => { parts.push(...args, '-i', file); };
  // a neighbour's newest picture: its own motion render when that is newer than its piece of the last reel (B25 was
  // redone after the reel and the preview still showed the old one)
  const newest = (sid) => { const m = path.join(projectPaths(cfg, id).out, 'motion', sid, 'renders', 'motion.mp4'), r = path.join(reel, `${sid}.mp4`);
    const tm = fs.existsSync(m) ? fs.statSync(m).mtimeMs : -1, tr = fs.existsSync(r) ? fs.statSync(r).mtimeMs : -1; return tm < 0 && tr < 0 ? null : tm > tr ? m : r; };
  const before = nb.before && newest(nb.before), after = nb.after && newest(nb.after);
  if (before) add(before, ['-sseof', String(-context)]);
  add(clip, []);
  if (after) add(after, ['-t', String(context)]);
  const n = parts.filter((x) => x === '-i').length;
  for (let i = 0; i < n; i++) filt.push(`[${i}:v]fps=30,scale=${W}:${H},setsar=1[v${i}]`);
  const out = path.join(dir, 'preview.mp4');
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...parts, '-filter_complex', `${filt.join(';')};${Array.from({ length: n }, (_, i) => `[v${i}]`).join('')}concat=n=${n}:v=1:a=0[v]`, '-map', '[v]', '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  if (r.status) throw new Error(`preview join: ${String(r.stderr).split('\n')[0]}`);
  // the same moments side by side: the reference left, ours right, two moments a beat (what the user was shown by hand
  // for B26 round 12, the comparison that found what the numbers missed)
  try { const sheet = pairSheet(cfg, id, g, clip, path.join(dir, 'pairs.jpg')); if (sheet) log(`  ${chapterId}: the same moments beside the reference -> ${sheet}`); } catch (e) { log(`  ${chapterId}: pairs skipped (${String(e.message || e).split('\n')[0]})`); }
  // measured against the reference over the same lines (refprofile.mjs): moves, holds, type, fill, accent colour
  // measured against the reference over the same lines (refprofile.mjs): moves, holds, type, fill, accent colour; and,
  // with a reference or without, against the chapter language (chapterlang.mjs: the reference's beats as ranges, both
  // ways — a chapter on a new article has no reference to stand beside; the user 2026-10-26: 根据文案自由判断怎么做)
  try { const span = referenceSpan(cfg, id, g.shots.map((x) => x.shotId)), lang = loadChapterLanguage(cfg); if (span || lang) { const ours = profileVideo(clip, path.join(dir, 'preview', 'profile'), { width: W });
    const byLang = lang ? g.shots.filter((x) => x.dur >= 3).map((x) => ({ beat: x.shotId, gaps: languageGaps(beatStats(ours, x.at, x.at + x.dur), lang) })).filter((x) => x.gaps.length) : [];
    let a = profileWindow(ours), b = null, gaps = [], beats = [];
    if (span) { const ref = referenceProfile(cfg, id, { width: W }); b = profileWindow(ref, span[0], span[1]); gaps = profileGaps(a, b);
      // beat by beat too (each against the reference's own span for that beat): the review caps the beat the gap is in
      const spans = referenceBeatSpans(cfg, id, g.shots.map((x) => x.shotId)), off = 0;   // the clean clip is the chapter alone
      beats = g.shots.filter((x) => spans[x.shotId] && x.dur >= 3 && spans[x.shotId][1] - spans[x.shotId][0] >= 3)   // a few seconds a side at least: 1 fps is too few to judge less
       .map((x) => ({ beat: x.shotId, gaps: profileGaps(profileWindow(ours, off + x.at, off + x.at + x.dur), profileWindow(ref, ...spans[x.shotId])) })).filter((x) => x.gaps.length); }
    for (const l of byLang) { const e = beats.find((x) => x.beat === l.beat); if (e) e.gaps.push(...l.gaps.map((x) => `language: ${x}`)); else beats.push({ beat: l.beat, gaps: l.gaps.map((x) => `language: ${x}`) }); }
    fs.writeFileSync(path.join(dir, 'preview', 'profile-gaps.json'), JSON.stringify({ span, ours: a, reference: b, gaps, beats }, null, 1));
    log(`  ${chapterId}: ${span ? `against the reference ${span[0]}-${span[1]} s: ${gaps.length ? gaps.join('; ') : 'no gap beyond the limits'}` : 'no reference'}${byLang.length ? `; outside the chapter language: ${byLang.map((x) => `${x.beat} ${x.gaps.join(', ')}`).join('; ')}` : ''}`); } } catch (e) { log(`  ${chapterId}: profile skipped (${String(e.message || e).split('\n')[0]})`); }
  // Post-preview stills are inspection aids; they are not pre-preview evidence.
  try {
    const stills = ensurePreviewStillsFromMp4(dir, out);
    if (stills.length) log(`  ${chapterId}: preview stills ${stills.length} -> ${path.join(dir, 'stills')}`);
  } catch (e) { log(`  ${chapterId}: preview stills skipped (${String(e.message || e).split('\n')[0]})`); }
  // Always bind the module that was actually rendered once preview.mp4 exists.
  // A mid-render input drift used to throw before writePreviewBind, leaving preview.mp4
  // updated while preview.bind.json still pointed at an older morphHash (banana B02).
  writePreviewBind(dir, renderedSource.code, { startedAt: previewStartedAt, chapter: chapterId, project: id, module: rootUrl(cfg, renderedSource.file), preview: path.relative(projectPaths(cfg, id).root, out) });
  bindPreviewToReview(cfg, id, g, dir);
  if (!fs.readFileSync(shot).equals(renderedSource.shotBytes) || fs.readFileSync(renderedSource.file, 'utf8') !== renderedSource.code) throw new Error('preview inputs changed during render; bind written for rendered module — re-run previewChapter for current morph');
  log(`  ${chapterId}: preview ${W}x${H}${nb.before ? `, ${context} s of ${nb.before} before` : ''}${nb.after ? `, ${context} s of ${nb.after} after` : ''} in ${Math.round((Date.now() - t0) / 1000)} s -> ${out}`);
  return out;
}

// ---- the white model (user 2026-10-22: 先低分辨率白膜做快速预览，确认了再渲染高质量): the accepted module as a draft
// video, half size, ANIMATIC.fps, no motion-blur subframes, cached by the module, its assets and the engine's code. The
// film's animatic (animatic.mjs) cuts every chapter beat from it; the final render waits for the user's approval of it.
export const ANIMATIC = { fps: 15, scale: 0.5 };
// two looks of the white model: `look` (half size, 15 fps: the frame, the type, the seams) and `fast` (a quarter, 12
// fps: the camera and the timing, about four times quicker); both lite (no AO, depth of field or blur)
export const ANIMATIC_TIERS = { look: { fps: 15, scale: 0.5 }, fast: { fps: 12, scale: 0.25 } };
const ENGINE_CODE = ['three/baked.js', 'blender/run.mjs', 'blender/bake_rigid.py', 'templates/layout-contract.mjs', 'display.js', 'templates/morph.js', 'templates/moves.js', 'templates/kit3.js', 'templates/kit2.js', 'templates/kit5.js', 'templates/visual-language.js', 'templates/scenes.js', 'templates/props.js', 'templates/type.js', 'director/shot.html'];   // Shared visual components must invalidate cached chapter renders when changed.
// the measures a chapter was checked by: a new or stricter check runs again over chapters accepted before it (2026-10-23:
// three checks added for the user's notes on B19 B20 B44 left those chapters standing, never measured by them)
export const checksHash = () => sha([chapterEvidenceNote, captureLayoutPreflight, profileRuleScope, stepChapters, answerFresh, groundTintErrors, codePropErrors, photoPlaneSubjectErrors, subjectPipelineErrors, taskBindingErrors, chapterAdmissionErrors, productionInputFiles, chapterInheritance, inputHash, bibleKeyErrors, motionContractUneatenErrors, bakeUseErrors, referenceComparisonErrors, scopedPoseReviewErrors, reviewKeyframes, pureTimeErrors, cameraGrammarErrors, engineCallErrors, versionTrapErrors, resolveEffort, effortDelivery, seekReplayErrors, runtimeCheck, motionRuntimeEvidence, poseFromScaleContinuityErrors, motionEvidenceSignature, previewDeliveryErrors, previewPreflightErrors, writePreviewPreflight, autoSubjectErrors, engineSubjectNames, withoutCodeComments, modelProvenanceOk, modelQaOk, modelVisualReviewOk, modelReviewHashes, assetReviewStatus, filmFollowErrors, designedTypeBeats, onPicture, sampler, callbackGround, monoChapter, figureGroundErrors, surfaceReadErrors, colourErrors, pairErrors, typeDensityErrors, surfaceTypeErrors, lowKeyErrors, hopErrors, cueTimingErrors, geometryTrack, geometryIntegrity, geometryErrors, objectErrors, textEdgeErrors, crossErrors, overlapErrors, edgeErrors, repeatErrors, groundSources, typeErrors, plateErrors, figureErrors, digitFaceErrors, balanceErrors, holdErrors, seamErrors, numberErrors, captionSourcesForBeat, scriptErrors].map((f) => f.toString()).join('\n') + '\nground.py:' + sha(fs.readFileSync(new URL('./ground.py', import.meta.url))) + '\ntypebible.mjs:' + sha(fs.readFileSync(new URL('./typebible.mjs', import.meta.url))));
export const engineCodeHash = (cfg) => {
  const root = engineRoot(cfg), rules = readJson(path.join(root, 'work/recipe-board-v1/routing/house-rules.json'), {});
  const fontDir = path.join(root, rules.fonts?.dir || 'work/recipe-board-v1/fonts/house');
  const fonts = (rules.fonts?.allowed || []).map(f => path.join(fontDir, f.file));
  const derived = path.join(fontDir, 'derived');
  if (fs.existsSync(derived)) fonts.push(...fs.readdirSync(derived).filter(f => /\.(ttf|otf|woff2?)$/i.test(f)).sort().map(f => path.join(derived, f)));
  const bytes = f => { try { return sha(fs.readFileSync(f)); } catch { return 'missing'; } };
  return sha(JSON.stringify({ engine: ENGINE_CODE.map(f => bytes(path.join(root, ENGINE, f))), fonts: fonts.map(f => [path.relative(root, f), bytes(f)]), fontRules: rules.fonts }));
};
export const chapterCodeHash = (cfg, id, g) => { const f = moduleFile(cfg, id, g); return fs.existsSync(f) ? sha(fs.readFileSync(f, 'utf8')) : null; };
// the newest version of a chapter that passed the line's code checks (its answer as it stands, checked with no error),
// when it is not the accepted one yet — it waits for its reviews; the rough shows it (the user 2026-10-28: 粗稿永远用最新过检查的
// 版本 — the rough showed the accepted B02 of before the type was set again, and the user was shown the old type)
export function latestChecked(cfg, id, g) {
  try { const tp = taskPaths(cfg, id, stepOf(g)), c = readJson(tp.check), raw = fs.readFileSync(tp.answer, 'utf8'), a = JSON.parse(raw);
    // morph code errors only: a greybox-stale hold must not hide the newest version that passed the chapter checks
    // (preview / rough white model; acceptance still gated separately)
    const codeErrs = GB.morphCodeErrors(c?.errors || []);
    if (!c || codeErrs.length || c.answerHash !== sha(raw) || !a?.code || (a.patches || []).length) return null; return a.code; } catch { return null; }
}
export async function animaticChapter(cfg, id, g, { fps = ANIMATIC.fps, scale = ANIMATIC.scale, range = null, log = () => {} } = {}) {   // range [t0, t1]: only those seconds of the chapter
  assertScopeAllows(loadProject(cfg, id), 'chapter');
  assertRenderStorage(cfg, id);
  ensureLettering(cfg, id);
  let mod = moduleFile(cfg, id, g); if (!fs.existsSync(mod)) return null;
  { const nc = g.module ? null : latestChecked(cfg, id, g); if (nc && nc !== fs.readFileSync(mod, 'utf8')) { const f = path.join(path.dirname(mod), `${g.id}.latest.mjs`); if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== nc) fs.writeFileSync(f, nc); mod = f; log(`  ${g.id}: the rough takes its newest checked version (its reviews follow)`); } }
  const code = fs.readFileSync(mod, 'utf8'), assets = recordAssets(cfg, id, g), eng = path.join(engineRoot(cfg), ENGINE);
  const operationCheck = await chapterAssetOperationCheck(cfg, id, g, code, assets);
  if (operationCheck.errors.length) throw new Error(operationCheck.errors.join('\n'));
  const engine = ENGINE_CODE.map((f) => { try { return sha(fs.readFileSync(path.join(eng, f), 'utf8')); } catch { return ''; } }).join('');
  // the house settings are part of the picture (2026-10-23: a face found illegible for 核心序列 left the cached white
  // model in that face: the key had the code, the assets and the engine, not which face each line is set in)
  const house = await chapterHouse(cfg, code, id, assets);
  const hash = sha(chapterEvidenceNote(cfg, id, g, assets) + JSON.stringify(chapterPlaces(cfg, id, g, code)) + code + JSON.stringify(Object.keys(assets).sort().map((k) => [k, fs.existsSync(assets[k]) ? fs.statSync(assets[k]).size : 0])) + engine + fps + scale + 'lite' + (range ? range.join('-') : '') + sha(JSON.stringify(house)) + JSON.stringify(screenSpans(g, screensOf(cfg, id, g).byBeat)));
  // (a white model per screen the beats take: the reviewers see the LED, the CRT, the halftone the film will have — routing/media.json)
  const screens = screensOf(cfg, id, g).list, dir = path.join(projectPaths(cfg, id).out, 'animatic', 'chapters'), base = `${g.id}${range ? '-part' : ''}-${hash}`, out = path.join(dir, `${base}.mp4`), outOf = (m) => (m === 'clean' ? out : path.join(dir, `${base}-${m}.mp4`)), filesOf = () => Object.fromEntries(screens.map((m) => [m, outOf(m)]).filter(([, f]) => fs.existsSync(f)));
  if (screens.every((m) => fs.existsSync(outOf(m)))) return { file: out, files: filesOf(), hash, codeHash: sha(code), made: false, from: range ? range[0] : 0 };
  fs.mkdirSync(dir, { recursive: true });
  const shotFile = path.join(dir, `${g.id}.json`);
  writeJson(shotFile, { id: g.id, template: 'morph', params: { module: rootUrl(cfg, mod), sub: false, note: chapterEvidenceNote(cfg, id, g, assets), lines: await chapterLines(g), places: chapterPlaces(cfg, id, g, code), dur: g.total, window: { dur: g.total }, assets: assetUrls(cfg, assets), house }, text: '', fps });
  const { shoot } = await import(pathToFileURL(path.join(eng, 'shoot.mjs')).href), t0 = Date.now();
  const clips = await shoot({ pageDir: path.join(eng, 'director'), page: 'shot.html', mode: 'video', variants: screens, query: `shot=${encodeURIComponent(rootUrl(cfg, shotFile))}&fps=${fps}&draft=1&lite=1`, tag: `${g.id}-${hash}`, outDir: dir, scale, range, spans: screenSpans(g, screensOf(cfg, id, g).byBeat) });
  screens.forEach((m, k) => { if (clips[k]) fs.renameSync(clips[k], outOf(m)); });
  const mine = range ? `${g.id}-part-` : `${g.id}-`;   // older white models of this chapter (a whole one keeps its parts apart)
  for (const f of fs.readdirSync(dir)) if (f.startsWith(mine) && f.endsWith('.mp4') && !f.startsWith(base) && (range || !f.startsWith(`${g.id}-part-`))) fs.rmSync(path.join(dir, f), { force: true });
  log(`  ${g.id}: white model ${range ? `${range[0].toFixed(1)}-${range[1].toFixed(1)} s of ` : ''}${g.total.toFixed(1)} s in ${Math.round((Date.now() - t0) / 1000)} s`);
  return { file: out, files: filesOf(), hash, codeHash: sha(code), made: true, from: range ? range[0] : 0 };
}
// the user's approvals of white models: { chapters: { <chapter>: { codeHash, at, by } } } in out/animatic/approvals.json.
// An approval is of one version of the module: a changed module waits again.
export const approvalsFile = (cfg, id) => path.join(projectPaths(cfg, id).out, 'animatic', 'approvals.json');
export const readApprovals = (cfg, id) => readJson(approvalsFile(cfg, id)) || { chapters: {} };
export const approvedChapter = (approvals, gid, codeHash) => !!codeHash && approvals?.chapters?.[gid]?.codeHash === codeHash;
export function approveChapters(cfg, id, ids, by) {
  const a = readApprovals(cfg, id), done = [];
  for (const st of chapterState(cfg, id)) {
    if (!ids.includes(st.g.id)) continue;
    const h = chapterCodeHash(cfg, id, st.g); if (!h) continue;
    a.chapters[st.g.id] = { codeHash: h, at: new Date().toISOString(), by }; done.push(st.g.id);
  }
  fs.mkdirSync(path.dirname(approvalsFile(cfg, id)), { recursive: true }); writeJson(approvalsFile(cfg, id), a);
  return done;
}
// the gate (project.json gates.animatic, on unless false): a chapter whose final render would be made anew (none yet,
// or older than its module) is rendered only once its white model is approved; until then the film keeps what it had
// (pure, tested) a retired prop family named by a new film's chapter (routing/props.json retired: the label family, a
// plate under words, CONVERGE-20261026 §3.5; the films made before keep theirs)
export function retiredPropErrors(code, project, families = RETIRED_FAMILIES) {
  if (!sixStage(project) || !code) return [];
  return families.filter((f) => new RegExp(`prop_${f}_|props\\(\\s*images\\s*,\\s*['"]${f}['"]`).test(code)).map((f) => `the ${f} prop family is retired for new films (a plate under words: 不要红底的文字, 不要撕纸); set the words on no plate, emphasis by colour and size`);
}
export const RETIRED_FAMILIES = ['label'];
// (pure, tested) a thing of the film built from boxes in code where the image-to-3D line makes the model (the user
// 2026-10-27: 尽量不要网上找低质量素材做模型 … 任意需要的模型都能转换很好的模型给打通了吗; the stills review: 船是灰白模型,
// 积木): a new film's chapter takes kit.props.model('<name>') (engine/subjects/parts/<name>.glb, blender/partset.mjs);
// the code props stand only as its fallback while the model is made
// (pure, tested) a new film's chapter takes the routes its narration calls for: a beat whose words cue a routed device
// (routing/devices.json route: made-model, real-page-mark, real-prices) names it or declines it with a reason, and a
// device named is carried out by its route (refbreakdown routeErrors) — the user 2026-10-27: 该调用哪块就走哪块
export function routedErrors(answer, shots, project, devices, opts = {}) {
  if (!sixStage(project) || !answer?.code) return [];
  const beats = planBeatsOf(answer.code), routed = devices.filter((d) => d.route).map((d) => ({ ...d, required: true }));
  const chosen = Object.entries(beats || {}).map(([beat, p]) => ({ beat, devices: p?.devices || [] }));
  return [...cueErrors({ beats }, shots.map((s) => ({ beat: s.shotId, text: s.text })), routed), ...routeErrors(beats, answer, devices), ...selectedDeviceKitErrors(chosen, devices, opts)];
}
export const CODE_PROPS = ['containerShip', 'tugboat'];
// the card modules a chapter may show as a page (answer.pages), and the rate its frames are cut at
export const PAGE_MODULES = ['article', 'market', 'chat', 'quote', 'person', 'screen', 'table', 'chart', 'compare'], PAGE_FPS = 15;
// (pure, tested) the made models a module asks for: kit.props.model(THREE, '<name>', { what: '<what it is>', … })
export function modelsNamed(code) {
  const out = new Map();
  for (const m of String(code || '').matchAll(/props\.model\(\s*THREE\s*,\s*['"]([a-z0-9-]+)['"]\s*(?:,\s*\{([\s\S]*?)\}\s*\))?/g)) {
    const what = (m[2] || '').match(/\bwhat\s*:\s*(['"`])([\s\S]*?)\1/)?.[2] || null;
    const viewsManifest = (m[2] || '').match(/\bviewsManifest\s*:\s*(['"`])([^\n]*?)\1/)?.[2] || null;
    if (!out.has(m[1]) || what) out.set(m[1], { name: m[1], what, ...(viewsManifest ? { viewsManifest } : {}) });
  }
  return [...out.values()];
}
// A made model looked at before a chapter uses it (the user 2026-10-28: 继续都做好 也确保客观看是规范 高效的流程 — the
// Suez sandbank came out of the image-to-3D line as a carved stone block and was found only by the taste reviewers,
// two rounds and an arbiter later). Six views (blender/model_sheet.py: three-quarter from above, straight down, the side,
// in its own colours and drawn to grey as a chapter tones it), each named by OpenCLIP between what the module asked for
// and the shapeless things a failed model reads as (likeness.py --model). Calibrated on the four models of Suez: the ship
// 5 of 6 views, the tug 4, the dredger 2, the sandbank 0 (a stone block). Kept beside the model by its file and its what.
export const MODEL_VIEWS_MIN = 2;
// (pure, tested) the GLB's own texture state: a chapter that binds a texture-less part shows it as a flat colour.
export function glbTextureInfo(source) {
  const empty = { images: 0, textures: 0, uv: false, baseColorTexture: false, normalTexture: false, readable: false };
  try {
    const b = Buffer.isBuffer(source) ? source : fs.readFileSync(source);
    if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) return empty;
    const len = b.readUInt32LE(12);
    if (!len || 20 + len > b.length) return empty;
    const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
    const prims = (j.meshes || []).flatMap((m) => m.primitives || []);
    const mats = j.materials || [];
    return {
      images: (j.images || []).length,
      textures: (j.textures || []).length,
      uv: prims.some((p) => p.attributes && p.attributes.TEXCOORD_0 != null),
      baseColorTexture: mats.some((m) => m.pbrMetallicRoughness?.baseColorTexture != null),
      normalTexture: mats.some((m) => m.normalTexture != null),
      readable: true,
    };
  } catch { return empty; }
}
// (pure, tested) the baked-texture verdict for a made model: a partset build that asked for a texture must come back
// with the 2K colour and normal maps on UVs and its colour projected over most of the surface. The user 2026-10-19
// (3f7a6d28:1848) named the missing texture the biggest gap against Meshy; the four-view partset bake is the fix. A
// chapter that binds a texture-less GLB shows a flat colour — and a canary can drop the material entirely
// (banana-design canaries/A-3d/index.html replaced the baked material with one yellow colour, 2026-11-04).
export function textureVerdict(name, { textureRequested = false, glb = {}, coverage = null } = {}) {
  const state = { images: glb.images || 0, textures: glb.textures || 0, uv: !!glb.uv, baseColorTexture: !!glb.baseColorTexture, normalTexture: !!glb.normalTexture };
  const projected = coverage && Number.isFinite(coverage.projectedShare) ? coverage.projectedShare : null;
  if (!textureRequested) return { ok: true, requested: false, ...state, projectedShare: null, say: null };
  const missing = [];
  if (!state.images || !state.textures) missing.push('no baked colour/normal maps');
  if (!state.uv) missing.push('no UVs');
  if (!state.baseColorTexture) missing.push('the material is not mapped to the colour texture');
  if (!state.normalTexture) missing.push('no normal map');
  if (projected !== null && projected < 0.5) missing.push(`the colour was projected on only ${Math.round(projected * 100)} % of the surface (the rest is flat fill)`);
  if (!missing.length) return { ok: true, requested: true, ...state, projectedShare: projected, say: null };
  return { ok: false, requested: true, ...state, projectedShare: projected, say: `model ${name}: the partset request asked for a baked texture but the GLB came back with ${missing.join('; ')} — a chapter would show it as a flat colour. Rebuild it from genuinely different views (the 2K colour + normal bake runs on a multi-view part), or build it without a texture request if a flat part is intended` };
}
// the QA receipt key: the GLB, the asked object and the request that produced it (so a changed texture request reruns QA).
export function modelQaKey(partsRoot, name, what) {
  const glb = path.join(partsRoot, `${name}.glb`), req = path.join(partsRoot, `${name}.request.json`);
  return sha(fs.readFileSync(glb)) + sha(String(what)).slice(0, 8) + sha(fs.existsSync(req) ? fs.readFileSync(req) : '').slice(0, 4);
}
// (pure, tested) the verdict on a model's views
export function modelVerdict(name, what, r, sheet = null) {
  const n = (r?.top || []).filter(Boolean).length, of = (r?.top || []).length;
  const ok = of >= MODEL_VIEWS_MIN && n >= MODEL_VIEWS_MIN;
  return { ok, n, of, say: ok ? null : `model ${name}: made, but ${n} of its ${of} views read as "${r?.what || what}" (${MODEL_VIEWS_MIN} at least): it reads as a rock, a block or a lump${sheet ? ` (its views: ${sheet})` : ''}. Ask for it again in other words (another name and a what that says its shape), or show the thing another way` };
}
export function modelCheck(cfg, name, what) {
  if (!fs.existsSync(modelFile(cfg, name))) return null;
  const glb = modelFile(cfg, name), partsRoot = path.dirname(glb), qa = glb.replace(/\.glb$/, '.qa.json'), key = modelQaKey(partsRoot, name, what);
  const had = readJson(qa); if (had?.key === key) return had;
  const dir = glb.replace(/\.glb$/, '.views'), blender = process.env.BLENDER || ['/Users/a1/.local/bin/blender', '/Applications/Blender.app/Contents/MacOS/Blender'].find((b) => fs.existsSync(b)) || 'blender';
  const b = spawnSync(blender, ['-b', '--factory-startup', '-P', path.join(engineRoot(cfg), ENGINE, 'blender', 'model_sheet.py'), '--', glb, dir, '320'], { encoding: 'utf8', timeout: 5 * 60 * 1000 });
  const views = ['own', 'grey'].flatMap((t) => ['three-quarter', 'top', 'side'].map((v) => path.join(dir, `${t}-${v}.png`))).filter((f) => fs.existsSync(f));
  if (b.status !== 0 || !views.length) return null;   // (no Blender here: the model is not judged, the reviewers still are)
  const items = path.join(dir, 'items.json'), outp = path.join(dir, 'likeness.json'); fs.writeFileSync(items, JSON.stringify([{ id: name, what, images: views }]));
  const r = spawnSync('python3', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'likeness.py'), '--model', items, outp], { encoding: 'utf8', timeout: 5 * 60 * 1000 });
  if (r.status !== 0) return null;
  const sheet = path.join(dir, 'sheet.jpg'); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...views.flatMap((f) => ['-i', f]), '-filter_complex', `${views.map((_, i) => `[${i}]`).join('')}xstack=inputs=${views.length}:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0`, sheet]);
  const v = modelVerdict(name, what, readJson(outp)?.[name], fs.existsSync(sheet) ? sheet : null);
  const request = readJson(path.join(partsRoot, `${name}.request.json`)), mesh = readJson(glb.replace(/\.glb$/, '.json'));
  const texture = textureVerdict(name, { textureRequested: !!request?.texture, glb: glbTextureInfo(glb), coverage: mesh?.textureCoverage });
  const out = { contract: 'A1ModelCheck/v1', key, what, ...v, ok: v.ok && texture.ok, say: v.ok ? texture.say : v.say, texture, at: new Date().toISOString() };
  fs.writeFileSync(qa, JSON.stringify(out, null, 1) + '\n'); return out;
}
export const modelFile = (cfg, name) => path.join(engineRoot(cfg), ENGINE, 'subjects', 'parts', `${name}.glb`);
export function codePropErrors(code, project, props = CODE_PROPS) {
  if (!sixStage(project) || !code) return [];
  const bare = code.replace(/fallback\s*:\s*\(\s*\)\s*=>\s*[\w.]*\([^)]*\)/g, '').replace(/props\.containerShip\s*\([^;]*boxesOnly\s*:\s*true[^;]*\)/g, '');   // (the boxes alone as data on a made hull)
  return props.filter((f) => new RegExp(`props\\.${f}\\s*\\(`).test(bare)).map((f) => `kit.props.${f} is a stand-in built in code; take the made model: await kit.props.model(THREE, '<name>', { length, fallback: () => kit.props.${f}(THREE) }) — the model from node work/recipe-board-v1/style-lab/engine/blender/partset.mjs <name> "<what it is>" (image-to-3D), never a web photo or code boxes`);
}

export const PHOTO_PLANE_SUBJECT = 'photo-plane-as-subject';
export const withoutCodeComments = (code) => String(code || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
// (pure, tested) hero subject must be kit.props.model / kit.engine.subject / a real mesh — not a PlaneGeometry
// photo billboard (Neo via banana-design B02: Plane + banana_photo faking 3D). Photos may texture a non-plane
// mesh. Intentional 2D evidence/card planes are OK when the chapter does not claim a spatial object subject
// (formFor object|shape|structure|quantity, or film medium outside evidence|type).
export function hasRealMeshSubject(code) {
  const src = withoutCodeComments(code);
  return /(?:kit\.)?props\.model\s*\(/.test(src) || /(?:kit\.)?engine\.subject\s*\(/.test(src) || /\bblock\.model\b/.test(src);
}
export function hasNonPlaneSubjectGeometry(code) {
  const src = String(code || '');
  return /(?:Box|Sphere|Cylinder|Cone|Capsule|Torus|Extrude|Lathe|Tube|Icosahedron|Octahedron|Dodecahedron|Tetrahedron|Shape|Buffer)Geometry\s*\(/.test(src)
    || /GLTFLoader|loadAsync\s*\([^)]*\.glb/.test(src) || hasRealMeshSubject(src);
}
export function claimsSpatialObjectSubject(code, { film = null } = {}) {
  const src = String(code || '');
  if (/\bformFor\s*:\s*['"](?:object|shape|structure|quantity)['"]/.test(src)) return true;
  if (Array.isArray(film) && film.length) {
    const spatial = film.filter((r) => r && !['evidence', 'type'].includes(r.medium));
    if (!spatial.length) return false;
    return spatial.some((r) => r.hero || ['2.5d', '3d', 'object', 'shape', 'structure', 'quantity'].includes(r.form) || ['object', 'shape', 'structure', 'quantity'].includes(r.formFor));
  }
  // stage3 with no film context: treat as claiming space when photo-plane billboards are the only act
  return /export\s+(?:async\s+)?function\s+stage3\b|export\s+const\s+stage3\b/.test(src) && /\bform\s*:\s*['"](?:2\.5d|3d)['"]/.test(src);
}
export function isPhotoPlaneBillboard(code) {
  const src = String(code || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  if (!/PlaneGeometry\s*\(/.test(src)) return false;
  const planeThenMap = /(?:new\s+THREE\.)?PlaneGeometry\s*\([^)]*\)\s*,\s*new\s+THREE\.Mesh\w*Material\s*\(\s*\{[\s\S]{0,420}?\bmap\s*:/.test(src)
    || /PlaneGeometry[\s\S]{0,320}\bmap\s*:|\bmap\s*:[\s\S]{0,320}PlaneGeometry/.test(src);
  if (!planeThenMap) return false;
  const imageMap = /\bmap\s*:\s*(?:tex\b|images\.|texOf\s*\()/.test(src) || /texOf\s*\(\s*THREE\s*,\s*images\./.test(src) || /images\.\w*(?:photo|ink|_cut|_pic)/.test(src);
  if (!imageMap) return false;
  // ground/board sheet alone is not the hero; cutout/photo subject keys or alpha-tested planes are
  const subjectPhoto = /images\.\w*(?:photo|ink|_cut|_pic)/.test(src) || /(?:alphaTest|transparent\s*:\s*true)[\s\S]{0,220}\bmap\s*:|\bmap\s*:[\s\S]{0,220}(?:alphaTest|transparent\s*:\s*true)/.test(src);
  if (!subjectPhoto) return false;
  return true;
}
export function photoPlaneSubjectErrors(code, project, { film = null } = {}) {
  if (!sixStage(project) || !code) return [];
  // Fail when a spatial object/hero is claimed AND the module builds PlaneGeometry + photo/ink
  // billboards as the act. kit.props.model / kit.engine.subject / block.model clears (planes may
  // sit beside a real subject). Do NOT treat decorative Tube/Buffer/Line geometry as a subject
  // escape — that let banana-tr4-blind B02 pass with photo cards as the bananas.
  // Photo-as-map on Box/Tube/etc. alone does not match isPhotoPlaneBillboard (no plane+photo), so it passes.
  if (!claimsSpatialObjectSubject(code, { film })) return [];
  if (!isPhotoPlaneBillboard(code)) return [];
  if (hasRealMeshSubject(code)) return [];
  return [`${PHOTO_PLANE_SUBJECT}: hero subject is a PlaneGeometry + photo billboard — use kit.props.model / kit.engine.subject / a real mesh; photos may only texture a non-plane mesh (HOUSE: 禁止照片贴 Plane 当 3D 主体)`];
}

export const SUBJECT_PIPELINE_FILLER = 'subject-pipeline-filler';
// (pure, tested) USER VETO: organic / claimed spatial subject must go through the existing dredger line
// (partset → AI multi-view refs → Hunyuan/Blender → A1PartMesh/A1PartRequest → QA-passed glb → kit.props.model /
// kit.engine.subject / block.model). Ban TubeGeometry / BoxGeometry filler / anonymous .glb as the mature subject.
// Helpers/grounds may still use primitives beside a kit subject. Receipt hooks dredger already writes:
// parts/<name>.request.json (A1PartRequest/v1) or parts/<name>.json (A1PartMesh/v1) + parts/<name>.qa.json (A1ModelCheck/v1 ok).
export function hasAnonymousGlbLoad(code) {
  const src = String(code || '');
  return /(?:GLTFLoader|loadAsync)\s*\([\s\S]{0,200}?\.glb/.test(src) && !hasRealMeshSubject(src);
}
export function hasTubeOrBoxFillerGeometry(code) {
  const src = String(code || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  return /TubeGeometry\s*\(/.test(src) || /BoxGeometry\s*\(/.test(src);
}
export function modelPartsRoot(cfg) {
  if (!cfg) return null;
  try { return path.join(engineRoot(cfg), ENGINE, 'subjects', 'parts'); } catch { return null; }
}
const fullFileHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function modelProvenanceOk(partsRoot, name) {
  if (!partsRoot || !name) return false;
  try {
    const f = (suffix) => path.join(partsRoot, `${name}${suffix}`), b = readJson(f('.build.json')), mesh = readJson(f('.json')), req = readJson(f('.request.json'));
    if (b?.contract !== 'A1PartBuild/v1' || b.name !== name || mesh?.contract !== 'A1PartMesh/v1' || mesh.name !== name || mesh.inputHash !== b.inputHash || req?.name !== name) return false;
    if (fullFileHash(f('.glb')) !== b.glbSha256 || fullFileHash(f('.json')) !== b.meshSha256 || fullFileHash(f('.request.json')) !== b.requestSha256) return false;
    {
      const review = readJson(f('.ref-review.answer.json'));
      if (fullFileHash(f('.ref-review.answer.json')) !== b.referenceReviewSha256 || review?.contract !== 'A1ReferenceReviewAnswer/v1' || review.ok !== true || !review.reviewer?.trim() || !review.reason?.trim() || JSON.stringify(review.hashes) !== JSON.stringify(b.views)) return false;
      const task = readJson(f('.ref-review.task.json'));
      // Builds from before thread receipts retain their original content-bound reference record.
      // They still require a fresh, independently submitted visual review before use.
      if (!task || (b.views?.__request && !task.authorThread) || (task.authorThread && !assetReviewStatus(f('.ref-review.task.json'), f('.ref-review.answer.json')))) return false;
    }
    return Object.entries(req.views || (req.image ? { single: req.image } : {})).every(([k, v]) => b.views?.[k] === fullFileHash(path.resolve(partsRoot, v))) && Object.keys(b.views || {}).length > 0;
  } catch { return false; }
}
export function modelReviewHashes(partsRoot, name, what) {
  return { glb: fullFileHash(path.join(partsRoot, `${name}.glb`)), build: fullFileHash(path.join(partsRoot, `${name}.build.json`)), what: sha(what) };
}
export function modelVisualReviewOk(partsRoot, name, what) {
  try {
    const a = readJson(path.join(partsRoot, `${name}.visual-review.answer.json`));
    return a?.contract === 'A1ModelVisualReviewAnswer/v1' && a.ok === true && typeof a.reviewer === 'string' && !!a.reviewer.trim() && typeof a.reason === 'string' && !!a.reason.trim() && JSON.stringify(a.hashes) === JSON.stringify(modelReviewHashes(partsRoot, name, what)) && assetReviewStatus(path.join(partsRoot, `${name}.visual-review.task.json`), path.join(partsRoot, `${name}.visual-review.answer.json`));
  } catch { return false; }
}
export function modelQaOk(partsRoot, name, what) {
  if (!partsRoot || !name || !what) return false;
  try {
    const qa = readJson(path.join(partsRoot, `${name}.qa.json`));
    return !!(qa?.contract === 'A1ModelCheck/v1' && qa.ok === true && qa.key === modelQaKey(partsRoot, name, what) && modelVisualReviewOk(partsRoot, name, what));
  } catch { return false; }
}
// (pure, tested) a module must read the offline bakes it requests, with the matching player and key: a bake the answer
// asks Blender for but the module never reads is wasted work, a module reading a key the answer does not request fails at
// page load. Both are obvious mistakes that should fail the answer, not the render (T09).
export function bakeUseErrors(code, bakes = []) {
  const src = withoutCodeComments(code), declared = Array.isArray(bakes) ? bakes : [], errors = [];
  const kinds = new Map();
  for (const [i, b] of declared.entries()) {
    if (!b || typeof b.key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(b.key)) { errors.push(`bakes[${i}]: invalid key`); continue; }
    if (kinds.has(b.key)) errors.push(`bakes[${i}]: duplicate key "${b.key}"`);
    kinds.set(b.key, b.kind);
  }
  const read = /baked\.(rigid|camera)\s*\(\s*(?:data|url)\(?\s*\[?\s*['"]([A-Za-z][A-Za-z0-9_]{0,63})['"]/g;
  for (const m of src.matchAll(read)) {
    const kind = m[1], key = m[2];
    if (!kinds.has(key)) errors.push(`kit.engine.baked.${kind}('${key}'): the module reads a bake the answer does not request — add { key: '${key}', kind: '${kind}', request: … } to answer.bakes`);
    else if (kinds.get(key) !== kind) errors.push(`kit.engine.baked.${kind}('${key}'): bake "${key}" is requested as kind "${kinds.get(key)}"`);
  }
  return errors;
}
// (pure, tested) the engine-kit call contracts a chapter module must meet, checked statically before it renders:
// the argument order and literal ids the line builds assets from (the user's K8 class: 参数写错位置 should fail at the
// answer, not after a render; 2026-10-20 Claude claimed this check, 2026-11-04 it still did not exist). Only the calls
// the line itself has to read — kit.props.model / kit.engine.subject / kit.engine.screen / kit.engine.baked.* — are
// checked; every other kit call is the engine's own contract.
export const KIT_CALLS = {
  'props.model': {
    min: 2, max: 3, optIndex: 2, options: ['what', 'length', 'height', 'draft', 'fallback', 'mono', 'tone', 'viewsManifest'],
    shape: 'kit.props.model(THREE, \'<name>\', { what, length?, height?, draft?, fallback?, mono?, tone?, viewsManifest? })',
  },
  'engine.subject': {
    min: 3, max: 4, optIndex: 3, options: ['at', 'size', 'mono', 'tone'],
    shape: 'kit.engine.subject(THREE, st, \'<id>\', { at?, size?, mono?, tone? })',
  },
  'engine.screen': {
    min: 1, max: 2, optIndex: 1, options: ['medium', 'W', 'H', 'CW', 'CH', 'draw', 'camera'],
    shape: 'kit.engine.screen(\'<id>\', { medium, W?, H?, CW?, CH?, draw, camera? })',
  },
  'engine.baked.rigid': { min: 1, max: 1, options: null, shape: 'kit.engine.baked.rigid(url(\'<bake>.json\'))' },
  'engine.baked.camera': { min: 1, max: 1, options: null, shape: 'kit.engine.baked.camera(url(\'<path>.json\'))' },
};
const LITERAL_ID = /^(['"`])([a-z0-9-]+)\1$/;
// top-level comma split of a call's argument text; strings and nested (), [], {} keep their commas
export function splitCallArgs(text) {
  const args = [];
  let depth = 0, start = 0, quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], prev = text[i - 1];
    if (quote) { if (ch === quote && prev !== '\\') quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) { args.push(text.slice(start, i).trim()); start = i + 1; }
  }
  const last = text.slice(start).trim();
  if (last) args.push(last);
  return args;
}
// the argument text of every call to one kit callee, by balanced parens
export function kitCallArgs(src, callee) {
  const code = withoutCodeComments(src);
  const re = new RegExp(`(?:kit\\.)?${callee.replace(/\./g, '\\.')}\\s*\\(`, 'g'), out = [];
  let m;
  while ((m = re.exec(code))) {
    let depth = 0, quote = null, i = m.index + m[0].length - 1;
    for (; i < code.length; i++) {
      const ch = code[i], prev = code[i - 1];
      if (quote) { if (ch === quote && prev !== '\\') quote = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) break;
    }
    if (depth === 0) out.push(code.slice(m.index + m[0].length, i));
  }
  return out;
}
// top-level keys of an object literal argument (for the allowed-option list)
function objectKeysLiteral(text) {
  const inner = text.trim().replace(/^\{/, '').replace(/\}$/, '');
  const keys = [];
  let depth = 0, quote = null, word = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i], prev = inner[i - 1];
    if (quote) { if (ch === quote && prev !== '\\') quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (depth === 0 && /[A-Za-z_$]/.test(ch)) { word += ch; continue; }
    if (depth === 0 && ch === ':' && word) { keys.push(word); word = ''; continue; }
    if (depth === 0) word = '';
  }
  return keys;
}
export function engineCallErrors(code) {
  const src = withoutCodeComments(code), errors = [];
  for (const [callee, spec] of Object.entries(KIT_CALLS)) {
    for (const text of kitCallArgs(src, callee)) {
      const args = splitCallArgs(text), names = `kit.${callee}`;
      if (args.length < spec.min || args.length > spec.max) {
        errors.push(`${names} takes ${spec.min === spec.max ? spec.min : `${spec.min}–${spec.max}`} arguments (got ${args.length}): ${spec.shape}`);
        continue;
      }
      if (!['engine.screen', 'engine.baked.rigid', 'engine.baked.camera'].includes(callee) && args[0] !== 'THREE') {
        errors.push(`${names}: the first argument must be THREE (found "${args[0].slice(0, 40)}"): ${spec.shape}${/^['"`]/.test(args[0]) ? ' — a wrong argument order fails only at render time' : ''}`);
      }
      if (callee === 'props.model' || callee === 'engine.subject' || callee === 'engine.screen') {
        const idArg = callee === 'engine.screen' ? args[0] : args[callee === 'props.model' ? 1 : 2];
        if (!LITERAL_ID.test(idArg.trim())) {
          errors.push(`${names}: the id must be a literal lower-case name so the line can build and check it (found "${idArg.trim().slice(0, 40)}"): ${spec.shape}`);
        }
      }
      const optIdx = spec.optIndex;
      if (spec.options && args.length > optIdx) {
        const opt = args[optIdx];
        if (!opt.startsWith('{')) errors.push(`${names}: the options must be an object literal so the line can read them (found "${opt.slice(0, 40)}"): ${spec.shape}`);
        else {
          for (const key of objectKeysLiteral(opt)) if (!spec.options.includes(key)) errors.push(`${names}: unknown option "${key}" (allowed: ${spec.options.join(', ')}): ${spec.shape}`);
        }
      }
    }
  }
  return errors;
}
export function engineSubjectNames(code) {
  return [...String(code || '').matchAll(/(?:kit\.)?engine\.subject\s*\(\s*[^,]+,\s*[^,]+,\s*['"]([a-z0-9-]+)['"]/g)].map((m) => m[1]);
}
export function autoSubjectErrors(code, partsRoot) {
  const src = withoutCodeComments(code), names = engineSubjectNames(src), errors = [];
  const calls = [...src.matchAll(/(?:kit\.)?engine\.subject\s*\(/g)].length;
  if (calls !== names.length) errors.push(`${SUBJECT_PIPELINE_FILLER}: dynamic engine.subject id cannot be verified; name the subject literally`);
  for (const id of names) {
    if (['h100', 'hdd', 'drill'].includes(id)) continue; // pre-existing built-in library; not an automatic generated subject
    let def;
    try { def = readJson(path.join(path.dirname(partsRoot), 'auto', `${id}.json`)); } catch { def = null; }
    if (def?.contract !== 'A1AutoSubject/v1' || def.id !== id || !Array.isArray(def.files) || !def.files.length) {
      errors.push(`${SUBJECT_PIPELINE_FILLER}: automatic subject ${id} is missing a valid parts definition`); continue;
    }
    for (const name of def.files) {
      if (typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name) || !modelProvenanceOk(partsRoot, name)) {
        errors.push(`${SUBJECT_PIPELINE_FILLER}: automatic subject ${id} part ${name} has no matching build provenance`); continue;
      }
      let qa;
      try { qa = readJson(path.join(partsRoot, `${name}.qa.json`)); } catch { qa = null; }
      if (!modelQaOk(partsRoot, name, qa?.what)) errors.push(`${SUBJECT_PIPELINE_FILLER}: automatic subject ${id} part ${name} has no current independent visual review`);
    }
  }
  return errors;
}
export function subjectPipelineErrors(code, project, { film = null, partsRoot = null, cfg = null } = {}) {
  if (!sixStage(project) || !code) return [];
  if (!claimsSpatialObjectSubject(code, { film })) return [];
  const root = partsRoot || (cfg ? modelPartsRoot(cfg) : null);
  if (hasRealMeshSubject(code)) {
    // Approved kit bind: require dredger-style provenance + QA stamp when parts dir is known.
    if (!root) return [];
    const errs = autoSubjectErrors(code, root);
    const executable = withoutCodeComments(code);
    if (/\bblock\.model\b/.test(executable)) errs.push(`${SUBJECT_PIPELINE_FILLER}: dynamic block.model has no verifiable model identity; bind a named checked model`);
    for (const m of modelsNamed(code)) {
      const glb = path.join(root, `${m.name}.glb`);
      if (!fs.existsSync(glb)) {
        errs.push(`${SUBJECT_PIPELINE_FILLER}: model ${m.name} claimed via kit.props.model but parts/${m.name}.glb missing — run blender/partset.mjs (HOUSE: AI图→图转3D/Blender→QA glb)`);
        continue;
      }
      if (!modelProvenanceOk(root, m.name)) {
        errs.push(`${SUBJECT_PIPELINE_FILLER}: model ${m.name} has no matching build receipt bound to the request, source views and GLB — preserve it and build a new version via partset/Hunyuan`);
        continue;
      }
      if (!modelQaOk(root, m.name, m.what)) {
        errs.push(`${SUBJECT_PIPELINE_FILLER}: model ${m.name} has no current model check and independent visual review bound to this GLB — complete both before mature subject`);
      }
    }
    // Built-in subjects are pre-existing assets; generated subjects must prove every part above.
    return errs;
  }
  // No kit subject path: Tube / Box filler or anonymous glb posing as the spatial subject
  const tubeBox = hasTubeOrBoxFillerGeometry(code);
  const anon = hasAnonymousGlbLoad(code);
  if (!tubeBox && !anon) return [];
  const kind = [tubeBox ? 'TubeGeometry/BoxGeometry filler' : null, anon ? 'anonymous .glb load' : null].filter(Boolean).join(' + ');
  return [`${SUBJECT_PIPELINE_FILLER}: claimed spatial subject is ${kind} without kit.props.model / kit.engine.subject / block.model QA-passed glb — canonical line: AI image → partset/Hunyuan or Blender low-poly → modelCheck → chapter bind (HOUSE: 禁止 Tube/未QA glb 填料当成熟主体)`];
}

export const animaticGate = (cfg, id) => loadProject(cfg, id)?.gates?.animatic !== false;
// may the chapter's final render run: a six-stage film asks the user once for the whole film (gates.mjs final, bound
// to each chapter's module); older films per chapter (approveChapters) unless their gate is off
export function chapterFinalAllowed(cfg, id, g) {
  const h = chapterCodeHash(cfg, id, g), p = loadProject(cfg, id);
  if (sixStage(p)) return finalAllowsOf(p, g.id, h);
  return !animaticGate(cfg, id) || approvedChapter(readApprovals(cfg, id), g.id, h);
}
// due: no final yet, or one made from another version of the module (<mp4>.code, written after each render). A render
// from before .code counts as the version its record accepted only when it was made after that acceptance (the record
// is rewritten on acceptance, before the render: B23 went to its final render unapproved). The module file is
// rewritten on every check, so its time says nothing.
export function finalDue(mp4, codeHash, rec = null) {
  if (!fs.existsSync(mp4)) return true;
  const f = `${mp4}.code`;
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim() !== codeHash;
  const at = Date.parse(rec?.acceptedAt || rec?.at || '');
  return !(rec?.codeHash === codeHash && Number.isFinite(at) && fs.statSync(mp4).mtimeMs >= at);
}

// a check is lighter than a render (a draft-quality page, no motion blur): more of them at once (RB_CHECK_JOBS)
export const CHECK_JOBS = Math.max(1, +process.env.RB_CHECK_JOBS || 4);   // 5 at once cut a message once (2026-10-26)
export async function stepChapters(cfg, id, { only = null, log = console.log, rounds = 4, review = true, renderDrafts = true } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'chapter');
  assertRenderStorage(cfg, id);
  ensureLettering(cfg, id);
  // ⑧ design-set: do not write/start morph until design gate is pinned
  { const p0 = loadProject(cfg, id) || {}, pin = chapterStartPinErrors(p0);
    if (pin.length) {
      const states0 = chapterState(cfg, id, { only });
      log(`  chapters: blocked — ${pin[0]}`);
      return { accepted: [], rejected: [], waiting: states0.map((x) => x.g.id), rendered: [], bound: [], blocked: pin };
    } }
  // the blind reviews are the polish loop: on a six-stage film they wait for the user's approval of the structure
  // (gates.mjs; the white model is judged first, no review is spent on a telling that may change)
  if (review && !polishOpen(cfg, id)) { review = false; log('  chapters: checked by code only until you approve the structure white model (gate rough); the blind reviews follow'); }
  // the design brain gives each chapter its palette and ground before any is written (designbrain.mjs)
  try { const d = await designPlan(cfg, id); if (d) log(`  design: ${d.chapters.map((c) => `${c.chapter} ${c.variant}/${c.material}`).join(' · ')}`); } catch (e) { log(`  design skipped (${String(e.message || e).split('\n')[0]})`); }
  const out = { accepted: [], rejected: [], waiting: [], rendered: [], bound: [] }, renders = [];
  // the chapters checked a few at a time, each in its own browser (pool.mjs, while memory allows; 2026-10-26: ten chapters
  // one after another took 25 min a round, three at a time 7.8, with the sweeps drawing without encoding 3.3)
  const states = chapterState(cfg, id, { only }), PROF = profileOf(cfg, id);
  // Scope selection picks whole chapters; a different beat in that chapter may still need rewriting.
  const redesign = new Set((await import('./storyboard.mjs')).redesignedBeats(cfg, id));

  // the whole film designed before its chapters: its design, hero stills and board are made before the look gate
  // (stills.mjs stepFilmLook, run by run.mjs while the look waits) and approved with it; here they are only kept current
  // — a design or a still changed after the approval waits for the user again before any chapter follows it
  if (PROF.designFirst) { const S2 = await import('./stills.mjs'), sti = await S2.stepFilmLook(cfg, id, { log });
    // (a look approved once does not hold the chapters: the stills' review goes on beside them — the user 2026-10-28)
    if (sti.state !== 'approved' && !(await import('./stills.mjs')).boardApproved(cfg, id)) { log(`  film look: ${sti.state === 'ready' ? 'the design or a hero still changed since the look was approved; it waits for you again (out/look/sheet.jpg, out/film/board.png; gate --approve look)' : `waiting for ${sti.why || 'the hero stills\' fixes'}`}; no chapter is designed before it`); out.waiting.push(...states.map((x) => x.g.id)); return out; } }
  for (const r of await pool(states, async (st) => {
    assertRenderStorage(cfg, id);
    const pending = st.g.shots.map((s) => s.shotId).filter((shot) => redesign.has(shot));
    if (pending.length) {
      const reason = `unapplied storyboard rewrite: ${pending.join(', ')}`;
      log(`  ${stepOf(st.g)}: blocked — ${reason}`);
      out.waiting.push(st.g.id);
      (out.redesignBlocked ||= []).push({ chapter: st.g.id, shots: pending, reason });
      return;
    }
    let current = st;
    if (designSet(loadProject(cfg, id) || {}) && st.state === 'waiting' && !st.taskFresh) {
      try {
        await (await import('./sessionbrief.mjs')).sessionBrief(cfg, id, st.g.id);
        current = chapterState(cfg, id, { only: new Set(st.g.shots.map((s) => s.shotId)) }).find((x) => x.g.id === st.g.id) || st;
      } catch (e) { log(`  ${stepOf(st.g)}: handoff not dispatched: ${String(e.message || e).split('\n')[0]}`); out.waiting.push(st.g.id); return; }
      if (!current.taskFresh) { log(`  ${stepOf(st.g)}: handoff remains stale; not dispatched`); out.waiting.push(st.g.id); return; }
    }
    const { g, input, hash } = current, step = stepOf(g), tp = taskPaths(cfg, id, step);
    // design before code (beatdesign.mjs): no module is written, or checked, before the chapter's brief is accepted
    if (PROF.designFirst && current.state !== 'accepted' && !input.brief) {
      const d = readJson(path.join(projectPaths(cfg, id).root, 'design.json'), null)?.chapters?.find((x) => x.chapter === g.id);
      const b = await stepBrief(cfg, id, g, { palette: d?.palette || null, profile: PROF });
      log(`  ${b.step}: ${b.state === 'accepted' ? 'brief accepted; the module is written from it next' : b.state === 'rejected' ? `brief sent back (${b.errors.length}): ${b.errors.slice(0, 3).join(' | ')}` : 'waiting for the design brief (rules: prompts/beatdesign.md)'}`);
      out.waiting.push(g.id); return;
    }
    const lockedFile = (b) => { fs.mkdirSync(outDir(cfg, id, g), { recursive: true }); return path.join(outDir(cfg, id, g), `locked-${b}.png`); };
    let draft = null;   // the best version this run reviewed: it goes into the film when none passes (no blank chapter)
    if (current.state !== 'accepted') {
      let best = -1, stalled = 0;
      for (let round = 0; round < rounds; round++) {
        // the last full version the line checked (tasks/<step>.checked.json): a session agent that answers with patches
        // overwrites the answer file, so the patches are applied to this, not to the file they replaced
        const checkedFile = path.join(tp.dir, `${step}.checked.json`);
        const prev = readJson(tp.check), answer0 = readAnswer(cfg, id, step), prevAnswer = answer0?.code ? answer0 : readJson(checkedFile) || answer0;
        const targets = targetFrames(cfg, id, g), ownKeys = keyframesFor(cfg, id, g.shots.map((s) => s.shotId)).length, nOrig = originalFrames(cfg, id, g).length;
        // passed beats: from the last check (older checks without a lock: their review's passing beats and keyframes)
        if (prev && !prev.locked) for (const f0 of (prev.review?.frames || []).filter((f) => f.score >= PASS_SCORE)) { const b = f0.beat, k = g.shots.findIndex((s) => s.shotId === b), f = path.join(projectPaths(cfg, id).root, prev.strips?.[k] || prev.keyframes?.[k] || ''); if (k >= 0 && fs.existsSync(f) && !fs.existsSync(lockedFile(b))) fs.copyFileSync(f, lockedFile(b)); }
        const rec0 = readJson(recordFile(cfg, id, g)), rulesNow = reviewRulesHash(cfg), rulesAt = (() => { try { return fs.statSync(path.join(cfg.repoRoot, REVIEW_RULES)).mtimeMs; } catch { return Infinity; } })();
        const recRules = rec0?.reviewRules ?? (rec0?.at && new Date(rec0.at).getTime() > rulesAt ? rulesNow : null);
        const locked = lockedBeats(prev, rec0, g.shots, (b) => fs.existsSync(lockedFile(b)), recRules);
        const keep = Object.keys(locked);
        // the writer sees what its last version looked like: the strips of the beats that were sent back
        const root = projectPaths(cfg, id).root, back = prev?.ok === false && prevAnswer ? g.shots.map((s, k) => ({ s, f: prev.strips?.[k] && path.join(root, prev.strips[k]) })).filter((x) => x.f && fs.existsSync(x.f) && !keep.includes(x.s.shotId)) : [];
        const seen = back.length ? `；接着 ${back.length} 张是你上一版被打回那几拍的帧条（${back.map((x) => x.s.shotId).join('、')}，每条从左到右是拍头、1/4、1/2、3/4、拍尾）：看清楚它现在动成什么样，再照 checkErrors 改` : '';
        const priorTask = readTask(cfg, id, step), guides = priorTask?.inputHash === hash ? priorTask.input?.handoffGuides : null;
        const task = { rules: RULES, schema: SCHEMA, input: { ...input, sourceTaskInputHash: hash, submission: `写候选 JSON 后运行 node scripts/recipe-board.mjs submit-task --project ${id} --step ${step} --answer-file <候选文件>，由系统记录执行线程。`, ...(guides?.length ? { handoffGuides: guides } : {}), ...(targets.length || back.length ? { targets: `${targets.length ? `附图：${targetsNote(nOrig, ownKeys, g.shots.filter((s) => keyframesFor(cfg, id, [s.shotId]).length).map((s) => s.shotId).join('、'))}` : '附图'}${seen}` } : {}), ...(prev?.ok === false && prevAnswer ? { previousAnswer: prevAnswer, checkErrors: prev.errors, ...(keep.length ? { keep } : {}) } : {}) }, inputHash: hash, images: [...new Set([...targets, ...back.map((x) => x.f), ...productionInputPaths(cfg, id, input.guidance, ['frame', 'image'])].filter((f) => fs.existsSync(f)))] };
        { const gp = readJson(path.join(outDir(cfg, id, g), 'preview', 'profile-gaps.json')), pairs = path.join(outDir(cfg, id, g), 'pairs.jpg');
          // the beats' gaps too: the chapter language's are beat by beat (too much type, held too long), with a reference or without
          if (gp?.gaps?.length || gp?.beats?.length) task.input.referenceGaps = { note: '上一版预览逐秒量出的差距（refprofile 对原片、language 对章节语言）：这一轮先补', gaps: gp.gaps || [], beats: gp.beats || [], ours: gp.ours, reference: gp.reference };
          if (fs.existsSync(pairs)) { task.images = [pairs, ...task.images]; task.input.targets = `第一张：上一版预览和原片讲同一句话的同一时刻并排（每行左原片、右上一版，每拍两刻）；${task.input.targets || ''}`; } }
        writeTask(cfg, id, step, task);
        let answer = answer0;
        // an answer not checked yet (written by any agent), or one checked under another input: the same module is checked
        // again under the new one (a change to the device library rewrote every chapter's task and all nine waited for an
        // answer they already had, paperclip-138-full 2026-10-22)
        const previewRecovered = answer?.code && (prev?.errors || []).some((e) => String(e).includes('preview-delivery')) && !previewDeliveryErrors({ outDir: outDir(cfg, id, g), morphCode: answer.code, delivery: effortDelivery(loadChapterMotionContract(cfg, id, g.id)?.delivery, resolveEffort(null, loadProject(cfg, id))) }).length;
        const fresh = answer && (answerFresh(prev, sha(fs.readFileSync(tp.answer, 'utf8')), hash, waivedAfter(cfg, id, g)) || previewRecovered);
        if (!fresh) {
          if (agentFor(cfg, id, 'morph') !== 'codex' || designSet(loadProject(cfg, id) || {})) { out.waiting.push(g.id); break; }
          log(`  ${step}: writing the module (codex, round ${round + 1})`);
          // a writer that times out or crashes costs this round, not the chapter or the chapters after it
          try { answer = await runCodexTask(cfg, step, readTask(cfg, id, step), 'code'); }
          catch (e) { log(`  ${step}: the writer failed this round (${String(e.message || e).split('\n')[0]})`); if (round === rounds - 1) out.rejected.push(g.id); continue; }
          fs.mkdirSync(tp.dir, { recursive: true }); fs.writeFileSync(tp.answer, JSON.stringify(answer, null, 2) + '\n');
        }
        let patchErrors = [];
        const originalAnswerHash = sha(fs.readFileSync(tp.answer, 'utf8'));
        const bindingErrors = chapterAdmissionErrors(cfg, id, { input, task: priorTask, answer, previousCheck: prev, answerHash: originalAnswerHash, record: current.rec, requireHandoff: designSet(loadProject(cfg, id) || {}), expectedHash: hash });
        if (designSet(loadProject(cfg, id) || {}) && !(current.rec?.acceptedAt && current.rec.codeHash === sha(answer?.code || '') && prev?.ok && prev.answerHash === originalAnswerHash)) {
          const proof = writerSubmissionStatus(cfg, id, step, originalAnswerHash);
          if (!proof.ok) bindingErrors.push(proof.why);
        }
        if (!bindingErrors.length && answer && !answer.code && answer.patches?.length && prevAnswer?.code) {   // (prevAnswer: the last checked full version)   // a revision as patches: apply to the last version, keep its requests
          const r = applyPatches(prevAnswer.code, answer.patches); patchErrors = r.errors;
          answer = { ...answer, code: r.code, bakes: mergeBakePatch(prevAnswer, answer), maps: answer.maps?.length ? answer.maps : prevAnswer.maps || [], art: answer.art?.length ? answer.art : prevAnswer.art || [], glyphs: answer.glyphs?.length ? answer.glyphs : prevAnswer.glyphs || [] };
          fs.writeFileSync(tp.answer, JSON.stringify(answer, null, 2) + '\n');
          log(`  ${step}: ${answer.patches.length - patchErrors.length} of ${answer.patches.length} patches applied`);
        }
        const answerHash = sha(fs.readFileSync(tp.answer, 'utf8'));
        if (answer?.code && !bindingErrors.length) writeJson(checkedFile, answer);
        // a patch that missed is reported, but the module with the others applied is still run and reviewed
        const _proj = loadProject(cfg, id);
        const _filmRows = filmRows(acceptedFilmDesign(cfg, id), g.shots.map((x) => x.shotId));
        const _photoPlane = photoPlaneSubjectErrors(answer?.code, _proj, { film: _filmRows });
        let errors = [...bindingErrors, ...checkCode(answer?.code), ...requestErrors(answer, input), ...evidenceErrors(answer?.code, answer, input, _filmRows), ...retiredPropErrors(answer?.code, _proj), ...codePropErrors(answer?.code, _proj), ..._photoPlane, ...routedErrors(answer, g.shots, _proj, loadDevices(cfg), { symbols: loadKitSymbolIndex(cfg) })], warnings = [], keyframes = [], rev = null, assets = {};
        if (!errors.length) { const p = await prepareAssets(cfg, id, g, answer, { log }); assets = p.assets; errors = p.errors; warnings.push(...p.notes); }
        // Validate provenance and QA after preparation: otherwise a missing model fails before the builder can run.
        const _subjectPipe = subjectPipelineErrors(answer?.code, _proj, { film: _filmRows, cfg });
        const _organic = organicMultiViewErrors(answer?.code, _proj, { film: _filmRows, partsRoot: modelPartsRoot(cfg), cfg, modelsNamed });
        errors.push(..._subjectPipe, ..._organic, ...matureFirstDraftErrors(answer, g.shots.map((s) => ({ beat: s.shotId, text: s.text, dur: s.dur || 5 })), { project: _proj, photoPlaneErrors: _photoPlane, subjectPipelineErrors: [..._subjectPipe, ..._organic] }));
        const _mc = loadChapterMotionContract(cfg, id, g.id) || buildChapterMotionContract({ chapter: g.id, project: id, filmDesign: acceptedFilmDesign(cfg, id), greyboxRows: GB.greyboxFor(cfg, id, g.shots.map((s) => s.shotId)) || [], sessionMd: (() => { const f = path.join(projectPaths(cfg, id).root, 'tasks', `session-${g.id}.md`); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; })() });
        const differences = GB.greyboxDifferOf(answer?.code);
          // CAMERA.md / SHOT-DIRECTION.md §3 as a checkable grammar on the contract (one owner, known move, locked
          // stays locked, a declared move moves, whip only on a seam, camera pose carried across the seam).
          errors.push(...cameraGrammarErrors(_mc, loadCameraGrammar(cfg)));
          errors.push(...motionContractUneatenErrors(answer?.code, _mc, { greyboxDiffer: differences, motionImplementation: answer?.motionImplementation, filmDesign: acceptedFilmDesign(cfg, id), shotIds: g.shots.map(s => s.shotId) }));
          errors.push(...pureTimeErrors(answer?.code || ''));
          errors.push(...bakeUseErrors(answer?.code || '', answer?.bakes));
          // Version-aware advisory: the renderer's import map points at this
          // package; static source inspection is not a substitute for rendering.
          const threePkg = readJson(path.join(engineRoot(cfg), 'remotion-renderer/node_modules/three/package.json'), {});
          warnings.push(...versionTrapErrors({ threeVersion: threePkg.version, morphCode: withoutCodeComments(answer?.code || '') }));
          // poseFrom scale continuity (morph numbers): after inheritance, scale must not 忽大忽小 without prescription
          errors.push(...poseFromScaleContinuityErrors(_mc, { morphCode: answer?.code || '', greyboxDiffer: differences }));
          // A new candidate must run before its own preview can exist. Hold final acceptance,
          // not runtime checking or draft creation, on missing/stale delivery.
          const deliverySoft = [];
          const deliveryErrors = previewDeliveryErrors({ outDir: outDir(cfg, id, g), morphCode: answer?.code || '', delivery: effortDelivery(_mc?.delivery, resolveEffort(null, _proj)), contract: _mc, soft: deliverySoft });
          warnings.push(...deliveryErrors, ...deliverySoft);
        let strips = [], poseFrames = [], motion = null, motionEvidence = null, reviewable = false;
        if (!errors.length) { const r = await runtimeCheck(cfg, id, g, answer.code, assets, { motionContract: _mc, greyboxDiffer: differences, motionImplementation: answer?.motionImplementation }); errors = r.errors; warnings.push(...r.warnings); keyframes = r.keyframes; strips = r.strips || []; poseFrames = r.poseFrames || []; motion = r.motion; motionEvidence = r.motionEvidence; reviewable = r.reviewable ?? !errors.length; }
        let nextLocked = {};
        errors = [...patchErrors, ...errors];
        // set by the type bible (TYPE.md, typebible.mjs; a film set by it: project.json typeBible): each beat's settled frame
        errors = [...errors, ...(await bibleKeyErrors(cfg, id, g, keyframes))];
        // held to the approved greybox (a film approved on it: greybox.mjs greyboxDriftErrors)
        // greybox-stale: warn during morph check (preview/draft still allowed); hard-fail only at acceptance below
        { const gbAll = GB.approvedGreybox(cfg, id); const rows = GB.greyboxFor(cfg, id, g.shots.map((s) => s.shotId)); if (rows?.length && keyframes.length) { const H0 = await import('./house.mjs'), drawn = {};
          for (const f of keyframes) { const m = /key-\d+-(B\d+)\.png$/.exec(f), sj = readJson(f.replace(/\.png$/, '.shapes.json')); if (m && sj?.drawn) drawn[m[1]] = sj.drawn; }
          const dr = GB.greyboxDriftErrors(drawn, rows, { hant: (x) => (H0.traditionalOn() ? H0.toHant([x])[0] : x), differ: GB.greyboxDifferOf(answer?.code) }); errors = [...errors, ...dr.errors]; warnings.push(...dr.notes); }
          // mid-film fake-array on full-film greybox (opening index/act skip correct); filter to this chapter
          if (gbAll.state === 'approved' && gbAll.answer?.beats?.length) {
            const chapterBeats = new Set(g.shots.map((s) => s.shotId));
            const filmMeta = filmRows(acceptedFilmDesign(cfg, id), (gbAll.answer.beats || []).map((r) => r.beat)) || (gbAll.answer.beats || []).map((r) => ({ beat: r.beat }));
            errors = [...errors, ...GB.midFilmFakeArrayErrors(gbAll.answer.beats, filmMeta).filter((msg) => chapterBeats.has(String(msg).split(':')[0]))];
          }
          if (gbAll.state === 'stale') warnings.push(GB.greyboxStaleMessage(id, g.id)); }
        const ruleErrors = errors;
        if (reviewable && review) {
          const rules = reviewRulesHash(cfg);
          // a review answered for an earlier version and never read (the module changed before the line ran): its beats that
          // passed and whose pictures are the same now are passed (Suez B02 scored 4, the chapter was edited for B06 before
          // the run read it, and the same picture went back and drew a 3, 2026-10-27)
          { const rt = taskPaths(cfg, id, `${step}-review`), t0 = readJson(rt.task), a0 = fs.existsSync(rt.answer) ? readJson(rt.answer) : null;
            if (t0?.forPrints && a0?.frames && (t0.forRules ?? null) === rules && fs.statSync(rt.answer).mtimeMs > fs.statSync(rt.task).mtimeMs) {
              const tb = String(t0.forBeats || '').split(',');
              for (const f of a0.frames) { if (!(f.score >= PASS_SCORE)) continue; const k = g.shots.findIndex((x) => x.shotId === f.beat), j = tb.indexOf(f.beat);
                // (a lock from an older picture gives way: Suez B02's six beats passed at 4 in a review not read, and were sent
                // back because each still held the lock of the version accepted the night before, 2026-10-28)
                if (k >= 0 && locked[f.beat] && strips[k] && sameFrame(strips[k], lockedFile(f.beat))) continue;
                if (k < 0 || j < 0 || !strips[k] || ruleErrors.some((e) => e.startsWith(`${f.beat}:`)) || !samePrints([t0.forPrints[j]], [picPrint(strips[k])])) continue;
                locked[f.beat] = { score: f.score, issue: f.issue || '', text: g.shots[k].text ?? null, rules }; fs.copyFileSync(strips[k], lockedFile(f.beat)); log(`  ${step}: ${f.beat} passed (${f.score}) in a review not read before, its picture unchanged`); }
              // and its roads to 4 stand for the next review (Suez B03's 'move it to the clear space' was lost with the review
              // the line never read, 2026-10-28)
              if (!wasRead(rt.task, answersKey([rt.answer]))) settleFrames(rt.task, t0.lists || {}, reviewFrames(a0.frames, g.shots), PASS_SCORE, (await import('./reviewrules.mjs')).readLessons(cfg)); } }
          const { kept, again } = splitLocked(locked, g.shots, strips, lockedFile, rules);
          if (kept.length) log(`  ${step}: kept ${kept.map((f) => f.beat).join(',')} (passed before, picture unchanged)`);
          if (again.some((a) => a.was)) warnings.push(...again.filter((a) => a.was).map((a) => `${a.s.shotId}: passed before (${a.was.score}) and this version changes its picture: it is reviewed again beside the version that passed`));
          { const orig = originalFrames(cfg, id, g), pairs = again.map((a) => [orig.find((f) => path.basename(f, '.jpg') === a.s.shotId), strips[a.k]]).filter(([o, x]) => o && x); warnings.push(...fillNotes(fillRows(pairs), pairs.map(([o]) => path.basename(o, '.jpg')))); }
          rev = again.length ? await reviewKeyframes(cfg, g, again.map((a) => strips[a.k]), targetFrames(cfg, id, g), again.map((a) => a.s), { id, answerHash, motionEvidence: motionEvidence ? motionEvidence.filter((row) => again.some((a) => a.s.shotId === row.shotId)) : null, poseFrames, motionImplementation: answer?.motionImplementation, previous: again.filter((a) => a.was && fs.existsSync(lockedFile(a.s.shotId))).map((a) => ({ beat: a.s.shotId, score: a.was.score, file: lockedFile(a.s.shotId), newRules: a.newRules })), fixes: lastFixes(prev, readJson(recordFile(cfg, id, g)), again.filter((a) => !a.was).map((a) => a.s.shotId)), lists: (() => { const L = readLists(taskPaths(cfg, id, `${step}-review`).task); return Object.fromEntries(again.map((a) => [a.s.shotId, L[a.s.shotId]]).filter(([, x]) => x?.items?.length)); })() }) : { frames: [], weak: [] };
          if (rev.pending) {
            // the module ran; its strips wait for the reviewer (tasks/<step>-review.task.json)
            if (rev.why) warnings.push(`review provenance: ${rev.why}`);
            writeCheck(cfg, id, step, { ok: false, pendingReview: rev.pending, errors: ruleErrors, warnings, answerHash, inputHash: hash, locked, keyframes: keyframes.map((f) => path.relative(projectPaths(cfg, id).root, f)), strips: strips.map((f) => path.relative(projectPaths(cfg, id).root, f)), motion, motionEvidence, review: null });
            log(`  ${step}: ran${ruleErrors.length ? ` with ${ruleErrors.length} rule errors` : ''}; waiting for its review (${rev.pending})`);
            // its taste review goes out beside it, not after it: the two blind reviews of one version run side by side, one
            // round trip instead of two (the user 2026-10-28: 把没做的也做完 — 规范 高效的流程; they were sequential: the
            // taste task was written only once the chapter's review passed, every round)
            if (!ruleErrors.length && PROF.designFirst && keyframes.length) { const tg = await tasteGate(cfg, id, g, { keyframes, answerHash }); if (tg.pending) log(`  ${step}: its taste review goes out with it (${tg.pending})`); }
            // morph code passed (greybox-stale is a warning): draft for white model / preview while reviews wait
            if (!ruleErrors.length && answer?.code) draft = { code: answer.code, assets, review: null, mean: 0 };
            out.waiting.push(g.id); break;
          }
          if (rev.skipped) warnings.push(rev.skipped);
          // a weak beat whose issue fails what the user allowed is void; an issue that also asks for what the user forbade
          // keeps the rest (reviewrules.mjs: the same rules for every review)
          { const { voidFix, readLessons } = await import('./reviewrules.mjs'), lessons = readLessons(cfg);
            for (const f of rev.frames || []) if (f.score < PASS_SCORE && f.issue) { const r = voidFix({ say: f.issue, fix: f.issue }, lessons);
              if (r.void) { warnings.push(`${f.beat}: the review's ${f.score} is void by the user's rule ${r.void} (${f.issue.slice(0, 60)})`); f.voided = r.void; f.score = PASS_SCORE; }
              else if (r.struck) f.issue = r.fix; } }
          // every beat a reviewer scored, for the process's measures (process.mjs: first-pass share, rounds)
          { const { logEvent } = await import('./process.mjs'), writer = writerSubmissionStatus(cfg, id, step, answerHash, hash), effort = resolveEffort(null, loadProject(cfg, id)), agent = agentFor(cfg, id, 'morph');
            for (const f of rev.frames || []) logEvent(cfg, id, { type: 'chapter-review', chapter: g.id, beat: f.beat, score: f.score, voided: f.voided || null, inputHash: hash, answerHash, actor: writer.ok ? writer.actorThread : null, agent, effort }); }
          for (const f of rev.frames || []) { const a = again.find((x) => x.s.shotId === f.beat); if (a?.was && f.score < PASS_SCORE) f.issue = `（${a.newRules ? '这一拍上一轮已过线，按新加的评审规则复看' : '这一拍上一轮已过线，这轮被改动了'}）${f.issue || ''}`; }
          // the road to 4 (reviewlist.mjs): each beat's answer settled against the list its review was asked about; a list
          // that stuck goes to the arbiter (arbiter.mjs), whose ruling is binding — the director no longer waives (the user
          // 2026-10-28: 按复盘先做), it may appeal (tasks/<step>-review.appeal.json)
          if (rev.taskFile && rev.frames?.length) {
            const { lists } = settleFrames(rev.taskFile, rev.asked, rev.frames, PASS_SCORE, (await import('./reviewrules.mjs')).readLessons(cfg)), appeals = readAppeals(path.dirname(rev.taskFile), `${step}-review`);
            const due = arbiterDue(lists, appeals).filter((b) => rev.frames.some((f) => f.beat === b));
            if (due.length) {
              const tasteHist = readJson(taskPaths(cfg, id, `taste-${g.id}`).task.replace(/\.task\.json$/, '.scores.json')) || [];
              const ar = await arbitrate(cfg, id, `${step}-review`, { forAnswer: answerHash, beats: due.map((b) => { const k = g.shots.findIndex((x) => x.shotId === b); return { beat: b, text: g.shots[k]?.text || '', list: lists[b], appeal: appeals[b] || null, words: { chapter: (rev.frames.find((f) => f.beat === b)?.issue) || '', taste: tasteHist.at(-1)?.issues?.[b] || '' } }; }), images: [...due.map((b) => strips[g.shots.findIndex((x) => x.shotId === b)]).filter(Boolean), ...originalFrames(cfg, id, g).filter((f) => due.includes(path.basename(f, '.jpg')))] }, { log });
              if (ar.pending) {
                writeCheck(cfg, id, step, { ok: false, pendingArbiter: ar.pending, errors: ruleErrors, warnings, answerHash, inputHash: hash, locked, keyframes: keyframes.map((f) => path.relative(projectPaths(cfg, id).root, f)), strips: strips.map((f) => path.relative(projectPaths(cfg, id).root, f)), motion, motionEvidence, review: rev });
                log(`  ${step}: waiting for the arbiter (${ar.pending})`); out.waiting.push(g.id); break;
              }
              writeLists(rev.taskFile, applyRulings(ar.rulings, rev.frames, lists, PASS_SCORE));
              for (const f of rev.frames) if (f.arbitrated) warnings.push(`${f.beat}: ${f.arbitrated.verdict === 'pass' ? `passed by the arbiter (stood at ${f.arbitrated.score})` : 'the arbiter set its list'}: ${f.arbitrated.why}`);
            }
          }
          const frames = g.shots.map((s) => kept.find((f) => f.beat === s.shotId) || (rev.frames || []).find((f) => f.beat === s.shotId)).filter(Boolean);
          rev = { ...rev, frames, weak: weakFrames(frames), mean: +(frames.reduce((a, f) => a + f.score, 0) / Math.max(1, frames.length)).toFixed(2) };
          errors = [...ruleErrors, ...reviewErrors(rev)];
          // a beat locks when it passed the review and broke no rule
          for (const f of frames) if (f.score >= PASS_SCORE && !ruleErrors.some((e) => e.startsWith(`${f.beat}:`))) {
            nextLocked[f.beat] = { score: f.score, issue: f.issue || '', text: g.shots.find((s) => s.shotId === f.beat)?.text ?? null, rules: f.locked ? (locked[f.beat]?.rules ?? null) : rules };
            if (!f.locked) { const k = g.shots.findIndex((s) => s.shotId === f.beat); fs.copyFileSync(strips[k], lockedFile(f.beat)); }
          }
        } else nextLocked = locked;
        // greybox-stale holds acceptance only (not the morph code check / preview / draft above)
        if (!errors.length && GB.approvedGreybox(cfg, id).state === 'stale') errors.push(GB.greyboxStaleMessage(id, g.id));
        // the taste of its style frames (beatdesign.mjs tasteGate): a reviewer who did not write it, before it is accepted
        if (!errors.length && PROF.designFirst && keyframes.length) {
          const tg = await tasteGate(cfg, id, g, { keyframes, answerHash });
          if (tg.pending) { writeCheck(cfg, id, step, { ok: false, pendingTaste: tg.pending, errors: [], warnings, answerHash, inputHash: hash, motionEvidence, locked: nextLocked, keyframes: keyframes.map((f) => path.relative(projectPaths(cfg, id).root, f)) }); log(`  ${step}: passed its rules; its style frames wait for ${String(tg.pending).startsWith('arbiter-') ? 'the arbiter' : 'the taste review'} (${tg.pending})`); out.waiting.push(g.id); if (answer?.code) draft = { code: answer.code, assets, review: null, mean: 0 }; break; }   // (the version that passed its rules goes into the white model meanwhile: the film is seen as it stands)
          for (const h of tg.held || []) warnings.push(`taste ${h.beat}: held at 4, passed by the arbiter on this picture (a reviewer gave ${h.score}): ${h.why}`);
          for (const a of tg.arbitrated || []) warnings.push(`taste ${a.beat}: ${a.verdict === 'pass' ? 'passed' : 'list set'} by the arbiter: ${a.why}`);
          errors = [...errors, ...tg.errors];
        }
        errors.push(...deliveryErrors);
        writeCheck(cfg, id, step, { ok: !errors.length, errors, warnings, answerHash, inputHash: hash, locked: nextLocked, keyframes: keyframes.map((f) => path.relative(projectPaths(cfg, id).root, f)), strips: strips.map((f) => path.relative(projectPaths(cfg, id).root, f)), motion, motionEvidence, review: rev });
        log(`  ${step}: ${errors.length ? `rejected (${errors.length}): ${errors.slice(0, 3).join(' | ')}` : `accepted${rev?.mean ? `, review mean ${rev.mean}` : ''}${warnings.length ? `, ${warnings.length} warnings` : ''}`}`);
        if (!errors.length) {
          fs.mkdirSync(chapterDir(cfg, id, g), { recursive: true }); fs.writeFileSync(moduleFile(cfg, id, g), answer.code);
          // the same code accepted again (its input changed, the module did not) keeps the time it was first accepted
          const was = readJson(recordFile(cfg, id, g)), same = was?.codeHash === sha(answer.code) && was?.acceptedAt;
          writeJson(recordFile(cfg, id, g), { contract: 'A1MorphChapterRecord/v1', chapter: g.id, reviewRules: reviewRulesHash(cfg), shots: g.shots.map((s) => s.shotId), inputHash: hash, codeHash: sha(answer.code), assets: Object.fromEntries(Object.entries(assets).map(([k, f]) => [k, path.relative(engineRoot(cfg), f)])), review: rev, warnings, acceptedAt: same ? was.acceptedAt : new Date().toISOString() });
          out.accepted.push(g.id); current.state = 'accepted'; break;
        }
        if (reviewable && answer?.code && (!draft || (rev?.mean ?? 0) > draft.mean)) draft = { code: answer.code, assets, review: rev, mean: rev?.mean ?? 0 };
        if (agentFor(cfg, id, 'morph') !== 'codex') { out.rejected.push(g.id); break; }
        if (rev?.mean != null && rev.frames?.length) { if (rev.mean > best) { best = rev.mean; stalled = 0; } else stalled++; }
        if (stalled >= STALL) { log(`  ${step}: the review has not risen for ${STALL} rounds (best ${best}); stopping here`); out.rejected.push(g.id); break; }
        if (round === rounds - 1) out.rejected.push(g.id);
      }
    }
    if (current.state !== 'accepted') {
      // a draft from an earlier run that reviewed better stays (a manual run reviews one version at a time)
      const was = readJson(recordFile(cfg, id, g));
      if (keepEarlierDraft(was, draft, current.hash) && fs.existsSync(moduleFile(cfg, id, g))) draft = null;
      if (!draft) { if (!(renderDrafts && was?.draft && was.inputHash === current.hash && fs.existsSync(moduleFile(cfg, id, g)))) return; }   // a recorded draft is rendered by run
      else {
      // not passed: the best reviewed version is rendered into the film as a draft (record.draft: the chapter stays
      // due, the review page lists it); a chapter with nothing that ran keeps its placeholder
      fs.mkdirSync(chapterDir(cfg, id, g), { recursive: true }); fs.writeFileSync(moduleFile(cfg, id, g), draft.code);
      writeJson(recordFile(cfg, id, g), { contract: 'A1MorphChapterRecord/v1', chapter: g.id, reviewRules: reviewRulesHash(cfg), shots: g.shots.map((s) => s.shotId), inputHash: current.hash, codeHash: sha(draft.code), assets: Object.fromEntries(Object.entries(draft.assets).map(([k, f]) => [k, path.relative(engineRoot(cfg), f)])), review: draft.review, draft: true, at: new Date().toISOString() });
      log(`  ${stepOf(g)}: ${draft.review === null ? 'its version that passed the rules goes into the white model while its taste review waits' : `not passed; its best version (review mean ${draft.mean}) goes into the film as a draft`}`);
      out.drafts = [...(out.drafts || []), g.id];
      }
      if (!renderDrafts) return;
    }
    // render once (the style-lab render cache keeps an unchanged chapter), then each shot takes its slice
    const operationCheck = await chapterAssetOperationCheck(cfg, id, g, fs.readFileSync(moduleFile(cfg, id, g), 'utf8'), recordAssets(cfg, id, g));
    if (operationCheck.errors.length) throw new Error(operationCheck.errors.join('\n'));
    const dir = outDir(cfg, id, g), list = path.join(dir, 'shotlist.json');
    const params0 = { module: rootUrl(cfg, moduleFile(cfg, id, g)), sub: false, note: chapterEvidenceNote(cfg, id, g, recordAssets(cfg, id, g)), lines: await chapterLines(g), places: chapterPlaces(cfg, id, g, fs.readFileSync(moduleFile(cfg, id, g), 'utf8')), assets: assetUrls(cfg, recordAssets(cfg, id, g)), house: await chapterHouse(cfg, fs.readFileSync(moduleFile(cfg, id, g), 'utf8'), id, recordAssets(cfg, id, g)) };
    writeJson(list, { contract: 'A1ShotList/v1', id: `${id}-${g.id}`, line: `${id}: chapter ${g.id}`, total: g.total,
      shots: screensOf(cfg, id, g).list.map((m) => ({ id: g.id, span: [0, g.total], template: 'morph', medium: m, text: g.shots.map((s) => s.text).join(' '), params: params0 })) });
    const mp4 = path.join(dir, 'out', 'render', `${g.id}-clean.mp4`), stamp = `${mp4}.stamp`;
    if (finalDue(mp4, chapterCodeHash(cfg, id, g), readJson(recordFile(cfg, id, g))) && !chapterFinalAllowed(cfg, id, g)) {
      log(`  ${g.id}: the final render waits for your approval (${sixStage(loadProject(cfg, id)) ? 'the film\'s preview: gate --approve final' : `its white model: animatic --approve ${g.id}`})`); out.waitingApproval = [...(out.waitingApproval || []), g.id]; return;
    }
    renders.push({ g, list, mp4, stamp });
  }, { jobs: CHECK_JOBS })) if (r.error) { log(`  ${stepOf(r.item.g)}: the check failed (${String(r.error.message || r.error).split('\n')[0]})`); out.rejected.push(r.item.g.id); }
  // the renders run a few at a time (pool.mjs: as many as memory allows), each chapter in its own browser
  const { make } = renders.length ? await import(pathToFileURL(path.join(engineRoot(cfg), ENGINE, 'director', 'make.mjs')).href) : {};
  for (const r of await pool(renders, async ({ g, list, mp4, stamp }) => {
    assertRenderStorage(cfg, id);
    const before = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8') : null;
    await make(list, { fps: 30 });
    if (fs.existsSync(mp4)) fs.writeFileSync(`${mp4}.code`, chapterCodeHash(cfg, id, g) + '\n');
    if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') !== before) out.rendered.push(g.id);
    if (fs.existsSync(mp4)) out.bound.push(...bindSlices(cfg, id, g, mp4));
  })) if (r.error) { log(`  ${r.item.g.id}: render failed: ${r.error.message || r.error}`); out.failed = [...(out.failed || []), r.item.g.id]; }
  return out;
}

// the final render of one module as a chapter is rendered (the hero stills' module too: stills.mjs heroChapter), at the
// chapters' quality (make.mjs, 30 fps, the engine's blur and grain) — the film's final is assembled from these
// (animatic.mjs buildFinal; on a six-stage film the card reel has no chapters and left 12 of 13 beats out, 2026-10-28)
// the screen each beat is shown on (the film design's screen, routing/media.json; the user 2026-10-28: 先介质进家里的样子):
// a chapter renders once per screen its beats take (clean always: the slices and the checks read it), and each beat is cut
// from the render on its own screen (animatic.mjs buildFinal, buildAnimatic)
export function screensOf(cfg, id, g) {
  const rows = filmRows(acceptedFilmDesign(cfg, id), g.shots.map((s) => s.shotId)) || [], byBeat = Object.fromEntries(rows.map((r) => [r.beat, r.screen || 'clean']));
  return { byBeat, list: [...new Set(['clean', ...Object.values(byBeat)])] };
}
// (pure, tested) the seconds of a chapter each screen but the clean one is drawn for: its beats' spans, padded and joined
// (the user 2026-10-28: 规范 高效的流程 — Suez B02 drew all 67 s again on the LED for its one LED beat, 85 s a white model)
export const SCREEN_PAD = 0.6;
export function screenSpans(g, byBeat, pad = SCREEN_PAD) {
  const out = {};
  for (const s of g.shots) { const m = byBeat?.[s.shotId] || 'clean'; if (m === 'clean') continue; (out[m] ||= []).push([Math.max(0, +(s.at - pad).toFixed(3)), +Math.min(g.total, s.at + s.dur + pad).toFixed(3)]); }
  for (const m of Object.keys(out)) out[m] = out[m].sort((a, b) => a[0] - b[0]).reduce((acc, r) => { const l = acc[acc.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else acc.push([...r]); return acc; }, []);
  return out;
}
// (pure, tested) the render of a beat's screen, else the clean one
export const filmOfScreen = (films, screen) => (typeof films === 'string' ? films : films?.[screen] || films?.clean || null);
// the shot list a chapter's final render is made from (renderFinal, finalPreflight)
async function finalShotList(cfg, id, g, dir) {
  const mod = moduleFile(cfg, id, g), code = fs.readFileSync(mod, 'utf8'), list = path.join(dir, 'shotlist.json');
  const operationCheck = await chapterAssetOperationCheck(cfg, id, g, code, recordAssets(cfg, id, g));
  if (operationCheck.errors.length) throw new Error(operationCheck.errors.join('\n'));
  fs.mkdirSync(dir, { recursive: true });
  const params = { module: rootUrl(cfg, mod), sub: false, note: chapterEvidenceNote(cfg, id, g, recordAssets(cfg, id, g)), lines: await chapterLines(g), places: chapterPlaces(cfg, id, g, code), assets: assetUrls(cfg, recordAssets(cfg, id, g)), house: await chapterHouse(cfg, code, id, recordAssets(cfg, id, g)) };
  const screens = screensOf(cfg, id, g).list;
  writeJson(list, { contract: 'A1ShotList/v1', id: `${id}-${g.id}`, line: `${id}: chapter ${g.id}`, total: g.total,
    shots: screens.map((m) => ({ id: g.id, span: [0, g.total], template: 'morph', medium: m, text: g.shots.map((s) => s.text).join(' '), params, ...(screenSpans(g, screensOf(cfg, id, g).byBeat)[m] ? { spans: screenSpans(g, screensOf(cfg, id, g).byBeat)[m] } : {}) })) });
  return { list, code, screens };
}
// (pure, tested) the frames a preflight draws: the first (motion blur reads before it: Suez B02 threw there), the middle
// and the last, at the final's frame rate
export const preflightFrames = (total, fps = 30) => { const n = Math.max(1, Math.round(total * fps)); return [...new Set([0, Math.floor(n / 2), n - 1])]; };
// a chapter's final render tried on three frames before the film waits on it (RETRO-20261028 4: B02's fine render threw at
// its first frame only when the film was done, at night): the same shot list, the same page with motion blur, a few
// seconds; kept by the module and the engine it ran on
export async function finalPreflight(cfg, id, g, { log = () => {}, force = false } = {}) {
  const pending = await chapterRedesignPending(cfg, id, g);
  if (pending.length) return { ok: false, error: `unapplied storyboard rewrite: ${pending.join(', ')}` };
  if (!fs.existsSync(moduleFile(cfg, id, g))) return { ok: false, error: 'no module accepted yet' };
  ensureLettering(cfg, id);
  const dir = path.join(outDir(cfg, id, g), 'preflight'), stamp = path.join(dir, 'preflight.json');
  const key = sha(fs.readFileSync(moduleFile(cfg, id, g), 'utf8') + engineCodeHash(cfg) + g.total + chapterEvidenceNote(cfg, id, g, recordAssets(cfg, id, g))), was = readJson(stamp);
  const operationCheck = await chapterAssetOperationCheck(cfg, id, g, fs.readFileSync(moduleFile(cfg, id, g), 'utf8'), recordAssets(cfg, id, g));
  if (operationCheck.errors.length) return { ok: false, error: operationCheck.errors.join('\n') };
  if (!force && was?.key === key) return was;
  const { list, screens } = await finalShotList(cfg, id, g, dir), frames = preflightFrames(g.total);
  const said = [], log0 = console.log; let error = null;
  console.log = (...a) => { said.push(a.join(' ')); };   // (a page's own error is only printed: read it)
  try { const { make } = await import(pathToFileURL(path.join(engineRoot(cfg), ENGINE, 'director', 'make.mjs')).href); await make(list, { fps: 30, stills: true, frames }); }
  catch (e) { error = String(e.message || e).split('\n')[0].slice(0, 300); }
  finally { console.log = log0; }
  const pageErr = said.find((l) => l.startsWith('[pageerror]')), made = screens.flatMap((m) => frames.map((f) => path.join(dir, 'out', 'stills', 'stills', `${g.id}-${m}-${String(f).padStart(3, '0')}.png`)));
  error ||= pageErr || (made.every((f) => fs.existsSync(f)) ? null : `frames not drawn: ${made.filter((f) => !fs.existsSync(f)).map((f) => path.basename(f)).join(', ')}`);
  const out = { ok: !error, error, key, frames, at: new Date().toISOString() };
  writeJson(stamp, out); log(`  ${g.id}: final preflight ${out.ok ? 'ok' : `FAILED — ${error}`}`);
  return out;
}
export async function renderFinal(cfg, id, g, { log = () => {} } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'chapter');
  const pending = await chapterRedesignPending(cfg, id, g);
  if (pending.length) throw new Error(`unapplied storyboard rewrite: ${pending.join(', ')}`);
  assertRenderStorage(cfg, id);
  ensureLettering(cfg, id);
  if (!fs.existsSync(moduleFile(cfg, id, g))) return null;
  const dir = outDir(cfg, id, g), { list, screens } = await finalShotList(cfg, id, g, dir);
  const mp4 = path.join(dir, 'out', 'render', `${g.id}-clean.mp4`), files = () => Object.fromEntries(screens.map((m) => [m, path.join(dir, 'out', 'render', `${g.id}-${m}.mp4`)]).filter(([, f]) => fs.existsSync(f)));
  const { make } = await import(pathToFileURL(path.join(engineRoot(cfg), ENGINE, 'director', 'make.mjs')).href);
  await make(list, { fps: 30 });
  log(`  ${g.id}: final render ${fs.existsSync(mp4) ? 'made' : 'failed'}`);
  return fs.existsSync(mp4) ? files() : null;   // { clean, led2, … }: a render per screen the beats take
}
// the devices the storyboard chose for a chapter's beats (v3 storyboards only; older ones chose none)
export function chosenDevices(cfg, id, g) {
  const sb = readJson(path.join(projectPaths(cfg, id).root, 'storyboard.json'));
  if (sb?.contract !== 'A1RecipeBoardStoryboard/v3') return [];
  const ids = new Set(g.shots.map((s) => s.shotId));
  return (sb.shots || []).filter((s) => ids.has(s.beat)).map((s) => ({ beat: s.beat, devices: s.devices || [], form: s.diagram?.form || null }));
}
