#!/usr/bin/env node
// Recipe board CLI — the single entry for the production line (SOP.md).
//   node scripts/recipe-board.mjs export-stills --project ID --scope diagnostic|design-review|mature --out NEW_DIRECTORY
//     Read-only delivery boundary; see scripts/STILLS-DELIVERY-BOUNDARY.md. No rendering or user approval.
//   node scripts/recipe-board.mjs run --project my-article [--article a.txt --title 标题 --presenter] [--beats beats.json]
//       [--only B01,B02] [--from art] [--to render] [--dry] [--chapter-rounds 1]   (1: each chapter's first draft only, for a quick look)
//   node scripts/recipe-board.mjs chapter --project my-article --only B26 --preview   check a chapter's answer, then a half-size preview video of it
//   node scripts/recipe-board.mjs stillbook --project my-article   one final still per beat in one sheet (the whole-film design)
//   node scripts/recipe-board.mjs oneshot --project my-article --beat B12 --target <png> --proof <png> --blind <json>   target vs proof, decided blind
//   node scripts/recipe-board.mjs seamreview --project my-article --from B04 --to B05   a seam judged on real 1× joined playback
//   node scripts/recipe-board.mjs readcheck --project my-article [--chapter B02]   read-speed budget on the kept geometry tracks (warning)
//   node scripts/recipe-board.mjs lookdev --project my-article   three anchor beats as text-free target frames before greybox/chapters
//   node scripts/recipe-board.mjs greybox --project my-article --stills-only   20 key frames for preflight; leaves the gate and reel untouched
//   node scripts/recipe-board.mjs greybox --project my-article --sheet-only [--preflight]   rebuild sheet.html/png from existing frames (no mp4); --preflight → out/greybox-preflight
//   node scripts/recipe-board.mjs geo-plate --project my-article --name region --bounds west,east,south,north   text-free Natural Earth map
//   node scripts/recipe-board.mjs animatic --project my-article [--fast] [--only B44]   the whole film as a white model (half size, 15 fps; --fast a quarter at 12; --only renders just those beats, the rest kept), every seam checked
//   node scripts/recipe-board.mjs smoke --project my-article [--force]   the final's road tried: each chapter drawn on three frames by the final's page, each beat mapped to a piece (animatic.mjs preflightFilm)
//   node scripts/recipe-board.mjs process --project my-article   the process measured: first-pass share, rounds, the user's notes (out/film/process.json)
//   node scripts/recipe-board.mjs usage --project my-article   house usage meter: screens/palettes/seams/evidence → out/film/house-usage.json
//   node scripts/recipe-board.mjs waive --project my-article --seg open --shot S19 --item "[type]" --why "<why the shot stands>"   the director's reasoned answer to a ruling, for this picture
//   node scripts/recipe-board.mjs note --project my-article --say "<the user's words>" [--about B07]   record a note the user gave on the film
//   node scripts/recipe-board.mjs lessons [--sync]   the user's decisions every blind review shares, generated from routing/lessons.json into the three review prompts
//   node scripts/recipe-board.mjs gate --project my-article [--approve look|rough|final --by "<the user's words>"]   the film's three gates (gates.mjs): where it stands, or the user's approval
//   node scripts/recipe-board.mjs animatic --project my-article --approve B01,B07 --by "<the user's words>"   (older films only) approve chapters' white models: their final renders may run
//   node scripts/recipe-board.mjs boards --project my-article [--only B44] [--redraw B44:1] [--approve B44 --by "<the user's words>"]   motion boards: a few frames of one 3D move (concept/boards/boards.json), then the user's approval
//       between 2 s of the shots before and after (out/chapters/B26/preview.mp4): the quick loop; the film is joined at milestones
//     Every step that is due, in order (plan → write → facts → screen → materials → fetch → art → stage
//     → render → motion → reel), then what is left and what waits on you. Safe to repeat: unchanged work is skipped.
// Single steps (run calls these):
//   node scripts/recipe-board.mjs render [--project hupo-69] [--only P01,P07] [--force] [--serial] [--json]
//   node scripts/recipe-board.mjs status [--project hupo-69]
//   node scripts/recipe-board.mjs motion [--project hupo-69] [--only P14] [--no-render]   card + cues -> HyperFrames -> MP4 + comparison
//   node scripts/recipe-board.mjs screen-capture --project hupo-69 --only P34   real page -> screenshot + DOM target telemetry
//   node scripts/recipe-board.mjs sequence --project hupo-69 --seq chip-segment   cut shots on the reference timeline
//   node scripts/recipe-board.mjs brief --project hupo-auto2 [--agent codex]   whole-film director brief: task -> answer -> checks -> brief.json + brief.md
//   node scripts/recipe-board.mjs storyboard --project hupo-auto2 [--agent codex]   one designed shot per beat: task -> answer -> checks -> storyboard.json, applied to plan + shots
//   node scripts/recipe-board.mjs medium --project hupo-69 [--only P18-card] [--medium led|crt|halftone] [--force]   motion render -> emulated display + virtual camera
//   node scripts/recipe-board.mjs reel --project my-article   all motion renders in shot order + still contact board
//   node scripts/recipe-board.mjs compare [--project hupo-69] [--only P14]   reference | candidate sheets
//   node scripts/recipe-board.mjs plan --project my-article --article path.txt [--title 标题] [--heuristic] [--presenter]
//     or --beats beats.json: a hand-written breakdown (id, text, intent, onScreen, entities, optional recipe/visual/duration)
//     Article -> routed shot plan (projects/<id>/plan.json). Plans only, never generates media.
//   node scripts/recipe-board.mjs reroute --project my-article [--presenter]   re-apply the routing table
//   node scripts/recipe-board.mjs write --project my-article [--only B03] [--rewrite]   plan -> shots/*.json for beats without one + material needs (Codex fills card slots)
//   node scripts/recipe-board.mjs factcheck --project my-article   every number on a card must come from the text
//   node scripts/recipe-board.mjs art --project hupo-69 [--only P15] [--fill-only|--no-fill]   apply theme art templates, then generate missing art (GPT image via Codex)
//   node scripts/recipe-board.mjs segment --project my-article --seg open [--build-only]   a paragraph edited as one piece (segments/<seg>.json): cuts on the words, real material, one paper and type
//   node scripts/recipe-board.mjs aesthetic --project my-article --seg open   the aesthetic director's plan for a paragraph (what each line is about, the idea, the form, the chapter's recipe), checked
//   node scripts/recipe-board.mjs module --project my-article --spec projects/<id>/modules/x.json   a shot module (sidecard, article) rendered, with the voice and beside the reference
//   node scripts/recipe-board.mjs shotplan --project my-article --seg h800 --task --range 143.22,196.96 | (agent answers) | shotplan ... [--no-materials] | shotplan ... --render   the shot director for a passage (--task --blind: without the reference, judged afterwards) (checked beat by beat against the reference; requests go to the materials step; report in tasks/)
//   node scripts/recipe-board.mjs refsubs --project paperclip-047 [--force]   a reference film's narration read off its burned-in subtitles (reference/subtitles.json)
//   node scripts/recipe-board.mjs chapter --project my-article [--only B07]   continuous-diagram chapters: task -> the agent's module -> checks -> review task -> the agent's scores
//   node scripts/recipe-board.mjs submit-task --project ID --step STEP --answer-file FILE   bind candidate answer to current task via live runtime identity (CODEX_THREAD_ID, or HERMES_HOME+live HERMES_SESSION_ID from a real Hermes session you mint; never invent IDs; Grok/Shell must submit inside/under that Hermes/Codex formal thread)
//   node scripts/recipe-board.mjs stage --project my-article [--only B07] [--dry] [--no-build]   3D shots (teardown-3d / scene-3d / hero-3d): what the library lacks is built (engine/build), then the plate from the style-lab engine, bound as a clip
//   node scripts/recipe-board.mjs materials --project hupo-69 [--only G26-S01]   footage/photo candidates per need (no download)
//   node scripts/recipe-board.mjs propose --project hupo-69 [--only B11]   auto-pick one candidate per need for the user to confirm
//   node scripts/recipe-board.mjs fetch --project hupo-69 [--batch batch-1]   download + cut what the user approved
// The review page is /recipe-board in apps/studio-next; it calls `render --json` for re-renders.
// RECIPE_BOARD_SOURCE_ROOT points material lookup at another checkout (read-only).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { boardConfig, boardRows, listProjects, ensureProject, readPlan, writePlan } from '../apps/studio-next/src/lib/recipe-board/store.mjs';

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('--') && !isValue(a)) || 'status';
function isValue(a) { const i = args.indexOf(a); return i > 0 && ['--scope', '--out', '--acceptance-file', '--project', '--chapter', '--step', '--answer-file', '--only', '--article', '--title', '--seq', '--batch', '--beats', '--from', '--to', '--medium', '--agent', '--skip', '--chapter-rounds', '--approve', '--by', '--say', '--about', '--since', '--seg', '--shot', '--item', '--why', '--pick', '--reject', '--bounds', '--name', '--kind', '--size', '--sea', '--land', '--coast', '--target', '--proof', '--blind', '--beat', '--dir'].includes(args[i - 1]); }
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

const cfg = boardConfig({ ...process.env, RECIPE_BOARD_REPO_ROOT: process.env.RECIPE_BOARD_REPO_ROOT || new URL('..', import.meta.url).pathname });
const project = opt('project', listProjects(cfg)[0]?.id);
// These material commands write shared batches/bindings; --only is not an isolation boundary.
// A named source page is the exception: addSourcePage reads and changes only the explicitly selected shot.
if (flag('only') && ['materials', 'propose', 'fetch', 'reject'].includes(cmd) && !(cmd === 'materials' && flag('page'))) {
  throw new Error(`MATERIALS_ONLY_SCOPE_UNSUPPORTED: ${cmd} --only cannot guarantee single-shot material scope; temporarily blocked before writing.`);
}
// the project's lettering reaches every page rendered for it, cards as well as chapters (house.mjs houseFontCss): read
// once here and handed down through the environment to the render workers
{ try { const pj = JSON.parse(fs.readFileSync(path.join(cfg.repoRoot, 'work/recipe-board-v1/projects', String(project), 'project.json'), 'utf8')); if (pj.lettering && !process.env.RB_LETTERING) process.env.RB_LETTERING = String(pj.lettering); if (pj.style && !process.env.RB_STYLE) process.env.RB_STYLE = String(pj.style); } catch {} }

function printPlan(id, plan) {
  const s = plan.summary;
  console.log(`${id}: ${s.beats} beats via ${plan.analyzer.mode}${plan.analyzer.model ? ' ' + plan.analyzer.model : ''} (${plan.analyzer.ms} ms)`);
  console.log('  intents ', JSON.stringify(s.intents));
  console.log('  modules ', JSON.stringify(s.primaryModules));
  for (const g of s.gaps) console.log(`  gap      ${g.gap} @ ${g.beats.join(',')}`);
  for (const w of s.warnings) console.log(`  warn     ${w}`);
  for (const b of plan.beats) console.log(`  ${b.id} ${b.route.intent.padEnd(18)} ${String(b.route.recipe || '-').padEnd(22)} ${b.text.slice(0, 40).replace(/\n/g, ' ')}`);
}

// Explicit delivery boundary; existing rendering commands remain internal previews.
if (cmd === 'export-stills') {
  const { exportStills } = await import('../apps/studio-next/src/lib/recipe-board/stills-delivery.mjs');
  const result = await exportStills(cfg, opt('project'), { scope: opt('scope'), out: opt('out'), acceptanceFile: opt('acceptance-file') });
  console.log(JSON.stringify(result));
} else if (cmd === 'geo-plate') {
  const { projectPaths } = await import('../apps/studio-next/src/lib/recipe-board/store.mjs');
  const id = opt('project'), name = opt('name'), bounds = (opt('bounds') || '').split(','), size = (opt('size', '1100x760')).split('x');
  if (!id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(name || '')) || bounds.length !== 4 || size.length !== 2 || [...bounds, ...size].some((x) => !x.trim() || !Number.isFinite(Number(x)))) throw new Error('geo-plate requires --project ID --name slug --bounds west,east,south,north [--size WIDTHxHEIGHT]');
  const out = path.join(projectPaths(cfg, id).root, 'materials', 'maps', 'greybox', `${name}.png`);
  if (fs.existsSync(out) && !flag('force')) throw new Error(`map already exists: ${out} (use --force only when replacement is intended)`);
  const script = path.join(cfg.repoRoot, 'apps/studio-next/src/lib/recipe-board/geo-plate.py'), source = path.join(cfg.dataDir, 'geo', 'ne_110m_land.geojson');
  const argv = [script, '--source', source, '--output', out, '--bounds', ...bounds, '--size', ...size];
  for (const k of ['sea', 'land', 'coast']) if (opt(k)) argv.push(`--${k}`, opt(k));
  const result = spawnSync('python3', argv, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`geo-plate failed: ${result.stderr || result.error?.message || result.status}`);
  console.log(`  geo-plate: ${out}`);
} else if (cmd === 'revalidate-model') {
  const name = opt('name');
  if (!name) throw new Error('revalidate-model requires --name MODEL');
  const { createLegacyModelRevalidation } = await import('../apps/studio-next/src/lib/recipe-board/modellegacy.mjs');
  const root = path.join(cfg.sourceRoot || cfg.repoRoot, 'work/recipe-board-v1/style-lab/engine/subjects/parts');
  const result = createLegacyModelRevalidation(root, name);
  console.log(`  ${name}: ${result.reused ? 'reused' : 'recorded'} current-content-binding-only -> ${result.file}; current-use QA and independent visual review still required`);
} else if (cmd === 'submit-asset-review') {
  const name = opt('name'), kind = opt('kind'), file = opt('answer-file');
  if (!/^[a-z0-9-]+$/.test(String(name || '')) || !['ref', 'visual'].includes(kind) || !file) throw new Error('submit-asset-review requires --name MODEL --kind ref|visual --answer-file FILE');
  const root = path.join(cfg.sourceRoot || cfg.repoRoot, 'work/recipe-board-v1/style-lab/engine/subjects/parts');
  const base = path.join(root, `${name}.${kind}-review`);
  const { submitAssetReview } = await import('../work/recipe-board-v1/style-lab/engine/blender/asset_review.mjs');
  submitAssetReview(`${base}.task.json`, `${base}.answer.json`, path.resolve(file));
  console.log(`  ${name}: ${kind} review submitted by a separate thread`);
} else if (cmd === 'submit-task') {
  const step = opt('step'), file = opt('answer-file');
  if (!opt('project') || !step || !file) throw new Error('submit-task requires --project ID --step STEP --answer-file FILE');
  if (/^morph-[A-Za-z0-9_-]+$/.test(step) && !step.endsWith('-review')) {
    const C = await import('../apps/studio-next/src/lib/recipe-board/chapter.mjs'), chapter = step.slice('morph-'.length), state = C.chapterState(cfg, project).find((s) => s.g.id === chapter);
    if (!state?.taskFresh) throw new Error(`the ${step} handoff is stale or not ready: regenerate it before submitting a new answer`);
  }
  const { submitTaskAnswer } = await import('../apps/studio-next/src/lib/recipe-board/agenttask.mjs');
  const receipt = submitTaskAnswer(cfg, project, step, path.resolve(file));
  console.log(`  ${step}: submitted and bound to the current task (${receipt.answerHash})`);
} else if (cmd === 'voice') {
  if (!opt('project')) throw new Error('voice needs --project');
  const { stepVoice } = await import('../apps/studio-next/src/lib/recipe-board/voice.mjs');
  const result = stepVoice(cfg, opt('project'), { log: console.log });
  console.log(JSON.stringify(result));
} else if (cmd === 'guard') {
  // no task, no work; no passed review, no delivery (AGENTS.md 不自发创作)
  const { main: guardMain } = await import('./workflow-guard.mjs');
  process.exit(guardMain(process.argv.slice(3)));
} else if (cmd === 'typedesign') {
  const { stepTypeDesign, typeDesignState } = await import('../apps/studio-next/src/lib/recipe-board/typedesign.mjs');
  if (!opt('project')) throw new Error('typedesign needs --project');
  const r = await stepTypeDesign(cfg, opt('project'), { log: console.log });
  console.log(JSON.stringify(r));
} else if (cmd === 'type-review') {
  const { typeGateState, typeVerdictName, writeTypeReviewTask } = await import('../apps/studio-next/src/lib/recipe-board/typedesign.mjs');
  if (!opt('project')) throw new Error('type-review needs --project');
  const submit = opt('submit');
  if (submit) {
    const verdict = JSON.parse(fs.readFileSync(path.resolve(submit), 'utf8'));
    if (verdict.contract !== 'A1TypeReview/v1') throw new Error('verdict contract must be A1TypeReview/v1');
    const name = typeVerdictName(cfg, opt('project'));
    const dir = path.join(cfg.repoRoot, 'work/recipe-board-v1/reviews');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name + '.verdict.json'), JSON.stringify(verdict, null, 2) + '\n');
    console.log(`  type review submitted: ${name} (${verdict.verdict})`);
  } else {
    const g = await typeGateState(cfg, opt('project'));
    if (g.state !== 'waiting') { const task = writeTypeReviewTask(cfg, opt('project')); console.log('  type review task written: ' + task); }
    console.log(JSON.stringify(g));
    for (const e of g.errors) console.error('  ' + e);
    process.exit(g.state === 'passed' ? 0 : 1);
  }
} else if (cmd === 'run') {
  const { runProject } = await import('../apps/studio-next/src/lib/recipe-board/run.mjs');
  if (!opt('project')) throw new Error('run needs --project');
  const r = await runProject(cfg, opt('project'), {
    article: opt('article'), beats: opt('beats'), title: opt('title', ''), presenter: flag('presenter'),
    only: opt('only') ? new Set(opt('only').split(',')) : null, from: opt('from', 'plan'), to: opt('to', 'reel'), skip: opt('skip') ? opt('skip').split(',') : [], dry: flag('dry'),
    chapterRounds: Math.max(1, Number(opt('chapter-rounds', 4)) || 4), task: opt('task'),
  });
  if (flag('json')) process.stdout.write(JSON.stringify(r) + '\n');
} else if (cmd === 'render') {
  const { renderProject } = await import('../apps/studio-next/src/lib/recipe-board/render.mjs');
  const only = opt('only') ? new Set(opt('only').split(',')) : null;
  const json = flag('json');
  const summary = await renderProject(cfg, project, { only, force: flag('force'), serial: flag('serial'), log: json ? () => {} : console.log });
  if (json) process.stdout.write(JSON.stringify(summary) + '\n');
  else console.log(`\n  ${summary.shots.length} shots in ${summary.totalMs} ms (browser ${summary.browserLaunchMs} ms, reference frames ${summary.referenceExtractMs} ms)`);
} else if (cmd === 'motion') {
  // Build -> lint -> render -> compare for every selected shot that has a motion block.
  const { buildMotion, lintMotion, renderMotion, compareMotion } = await import('../apps/studio-next/src/lib/recipe-board/motion.mjs');
  const { loadShots } = await import('../apps/studio-next/src/lib/recipe-board/store.mjs');
  const only = opt('only') ? new Set(opt('only').split(',')) : null;
  for (const shot of loadShots(cfg, project, only).filter((s) => s.motion)) {
    const t0 = Date.now();
    const { dir, degraded } = await buildMotion(cfg, project, shot);
    const lint = lintMotion(dir);
    const errors = (lint.match(/(\d+) error/) || [0, '?'])[1];
    if (errors !== '0') { console.log(`  ${shot.shotId} lint failed:\n${lint}`); continue; }
    if (flag('no-render')) { console.log(`  ${shot.shotId} built ${dir}`); continue; }
    const mp4 = renderMotion(dir);
    const cmp = compareMotion(cfg, project, shot, mp4);
    console.log(`  ${shot.shotId.padEnd(10)} ${shot.motion.preset.padEnd(8)} ${shot.motion.duration}s  ${Math.round((Date.now() - t0) / 1000)}s  ${cmp ? cmp.video : mp4}${degraded.length ? '  TODO ' + degraded.map((d) => d.slot).join(',') : ''}`);
  }
} else if (cmd === 'brief') {
  // Whole-film director brief: write the task, or check and accept an answer (tasks/brief.answer.json).
  // --agent codex asks the local Codex CLI; otherwise any agent writes the answer by prompts/brief.md.
  const { stepBrief } = await import('../apps/studio-next/src/lib/recipe-board/brief.mjs');
  const r = await stepBrief(cfg, project, { agent: opt('agent'), log: (l) => console.log('  ' + l) });
  console.log(`  ${project}: brief ${r.state}${r.task ? ' → ' + r.task : ''}`);
  (r.errors || []).forEach((e) => console.log('  ✗ ' + e));
  (r.warnings || []).forEach((w) => console.log('  · ' + w));
} else if (cmd === 'storyboard') {
  // One designed shot per beat after the brief: write the task, or check, accept and apply an answer.
  const { stepStoryboard } = await import('../apps/studio-next/src/lib/recipe-board/storyboard.mjs');
  const r = await stepStoryboard(cfg, project, { agent: opt('agent'), log: (l) => console.log('  ' + l) });
  console.log(`  ${project}: storyboard ${r.state}${r.task ? ' → ' + r.task : ''}${r.reason ? ' (' + r.reason + ')' : ''}`);
  if (r.applied) console.log(`  applied: ${r.applied.updated.length} shots updated · rewrite ${r.applied.redesign.join(',') || 'none'} · planned actions in ${Object.keys(r.applied.planned).length} shots`);
  (r.errors || []).forEach((e) => console.log('  ✗ ' + e));
  (r.warnings || []).forEach((w) => console.log('  · ' + w));
} else if (cmd === 'medium') {
  // Put finished motion renders on an emulated display filmed by a virtual camera (LED / CRT / halftone).
  // Uses the shot/project/theme medium; --medium led|crt|halftone overrides it for a test pass.
  const { renderMedium, mediumDue } = await import('../apps/studio-next/src/lib/recipe-board/medium.mjs');
  const { loadShots } = await import('../apps/studio-next/src/lib/recipe-board/store.mjs');
  const only = opt('only') ? new Set(opt('only').split(',')) : null;
  const override = opt('medium') ? { kind: opt('medium') } : null;
  const shots = loadShots(cfg, project, only).filter((s) => s.motion);
  // An explicit --only list marks those shots for this pass; otherwise only shots marked in the project/shot.
  const force = !!only;
  const due = flag('force') ? shots : mediumDue(cfg, project, shots, override, { force });
  console.log(`  ${due.length} of ${shots.length} shots due`);
  const r = await renderMedium(cfg, project, due, { override, force, log: (l) => console.log('  ' + l) });
  r.forEach((d) => console.log('  ' + d.mp4));
} else if (cmd === 'screen-capture') {
  // Real page -> screenshot + DOM target telemetry for the screen camera (one browser, counts toward the cap of 2).
  const { captureScreen } = await import('../apps/studio-next/src/lib/recipe-board/screen-capture.mjs');
  const { loadShots } = await import('../apps/studio-next/src/lib/recipe-board/store.mjs');
  const only = opt('only') ? new Set(opt('only').split(',')) : null;
  for (const shot of loadShots(cfg, project, only).filter((s) => s.screen?.capture)) {
    const { dir, telemetry } = await captureScreen(cfg, project, shot);
    console.log(`  ${shot.shotId.padEnd(10)} ${telemetry.source.width}x${telemetry.source.height}  targets ${Object.keys(telemetry.targets).join(',')}  ${dir}`);
  }
} else if (cmd === 'sequence') {
  // Assemble rendered shots on the reference timeline and compare with the original (with sound).
  const { buildSequence } = await import('../apps/studio-next/src/lib/recipe-board/sequence.mjs');
  const r = buildSequence(cfg, project, opt('seq'), { medium: opt('medium') ? { kind: opt('medium') } : null });
  for (const it of r.items) console.log(`  ${(it.shot || 'presenter').padEnd(12)} ${it.from.toFixed(2)}–${it.to.toFixed(2)}${it.hold ? `  hold ${it.hold}s` : ''}`);
  console.log(`  ${r.cmp}`);
} else if (cmd === 'segment') {
  // A paragraph edited as one piece (segments/<seg>.json): built, rendered, the recording laid under it.
  const { buildSegment, renderSegment } = await import('../apps/studio-next/src/lib/recipe-board/segment.mjs');
  const r = flag('build-only') ? buildSegment(cfg, project, opt('seg')) : await renderSegment(cfg, project, opt('seg'));
  console.log(`  ${opt('seg')}: ${r.duration} s${r.withVoice ? ` -> ${r.withVoice}` : ` page ${r.dir}`}`);
} else if (cmd === 'aesthetic') {
  // The aesthetic director's plan for a paragraph (prompts/aesthetic.md): tasks/aesthetic-<seg>.answer.json checked into aesthetic/<seg>.json.
  const { acceptAesthetic } = await import('../apps/studio-next/src/lib/recipe-board/aesthetic.mjs');
  if (flag('study')) {   // reference frames over each shot of the answer (or the accepted plan), to study before planning
    const { studyReference } = await import('../apps/studio-next/src/lib/recipe-board/aesthetic.mjs');
    const pth = await import('node:path'), fsm = await import('node:fs');
    const root = pth.join(cfg.dataDir, 'projects', project), f = [pth.join(root, 'tasks', `aesthetic-${opt('seg')}.answer.json`), pth.join(root, 'aesthetic', `${opt('seg')}.json`)].find((x) => fsm.existsSync(x));
    const r = studyReference(cfg, project, opt('seg'), JSON.parse(fsm.readFileSync(f, 'utf8')));
    for (const x of r.sheets) console.log(`  ${x.shot}: ${x.file}  reference cuts at ${x.referenceCuts.join(", ") || "none"}`);
    process.exit(0);
  }
  const r = acceptAesthetic(cfg, project, opt('seg'));
  console.log(r.errors.length ? r.errors.map((e) => '  ' + e).join('\n') : `  accepted: ${r.plan.shots.length} shots -> ${r.file}`);
  if (r.errors.length) process.exitCode = 1;
} else if (cmd === 'module') {
  // A shot module (modules.mjs: sidecard, article) from a spec file, rendered with the voice and set beside the reference.
  const { renderModule, besideReference } = await import('../apps/studio-next/src/lib/recipe-board/modules.mjs');
  const pth = await import('node:path'), fsm = await import('node:fs');
  const file = opt('spec'), spec = JSON.parse(fsm.readFileSync(file, 'utf8')), name = pth.basename(file, '.json');
  const out = pth.join(cfg.dataDir, 'projects', project, 'out', 'modules', name);
  const r = await renderModule(cfg, project, spec, out);
  console.log(`  ${name}: ${r.frames} frames -> ${r.withVoice || r.mp4}`);
  for (const i of r.check?.issues || []) console.log(`  against the reference: ${i.say}`);
  if (!r.check?.issues?.length) console.log('  against the reference: nothing found');
  if (!flag('no-reference')) console.log(`  beside the reference: ${besideReference(cfg, project, spec, r.mp4, out + '-vs-reference.mp4')}`);
} else if (cmd === 'library') {
  // The film's material library: the people, organisations and products it names, each one's pictures found, checked
  // and kept across films (entitylib.mjs; work/recipe-board-v1/entities.json).
  const { prepareLibrary } = await import('../apps/studio-next/src/lib/recipe-board/entitylib.mjs');
  const lib = await prepareLibrary(cfg, project, { log: console.log });
  for (const e of lib) console.log(`  ${e.names[0]} (${e.kind}): ${e.pictures.map((p) => `${p.role} ${p.size || '?'}`).join(', ') || 'nothing yet'}`);
} else if (cmd === 'bench') {
  // Every module tried before a film uses it: the accepted specs as seeds, their words at their shortest and longest,
  // the display line in each house face, under the frame checks; a sheet a module in work/recipe-board-v1/bench/.
  const { runBench } = await import('../apps/studio-next/src/lib/recipe-board/bench.mjs');
  const r = await runBench(cfg, { only: opt('module') ? opt('module').split(',') : null, per: +(opt('per') || 2), log: console.log });
  const bad = r.cases.filter((c) => c.error || c.problems.length);
  console.log(`  ${r.cases.length} cases, ${bad.length} fail`);
  for (const c of bad) console.log(`  FAIL ${c.module} ${c.name}: ${c.error || c.problems.map((p) => p.say).join(' | ')}`);
  for (const [m, f] of Object.entries(r.sheets)) console.log(`  sheet ${m}: ${f}`);
} else if (cmd === 'shot') {
  // One shot of a passage tried in seconds: the director's answer as it is now, with --set '{json}' laid over its spec
  // (not saved), drawn at its key frames (--at t1,t2) beside the reference, and the code's checks on it.
  const { tryShot } = await import('../apps/studio-next/src/lib/recipe-board/layers.mjs');
  const r = await tryShot(cfg, project, opt('seg'), opt('id'), { set: opt('set') ? JSON.parse(opt('set')) : {}, times: opt('at') ? opt('at').split(',').map(Number) : null });
  console.log(`  ${opt('seg')} ${opt('id')} (${r.spec.module}): ${r.file}`);
  for (const p of r.problems) console.log(`  problem: ${p.say}`);
  if (!r.problems.length) console.log('  the checks pass');
} else if (cmd === 'cardcheck') {
  // The recipe cards' geometry (cardgeometry.mjs): each card shot built and measured every 0.2 s, what stands 0.8 s listed
  const { loadShots } = await import('../apps/studio-next/src/lib/recipe-board/store.mjs');
  const { buildMotion } = await import('../apps/studio-next/src/lib/recipe-board/motion.mjs');
  const { cardCheck } = await import('../apps/studio-next/src/lib/recipe-board/run.mjs');
  const only = opt('only') ? new Set(opt('only').split(',')) : null;
  for (const shot of loadShots(cfg, project).filter((s) => s.motion && !s.slots?.background?.chapter && (!only || only.has(s.shotId)))) {
    try { const { dir } = await buildMotion(cfg, project, shot), geo = await cardCheck(cfg, dir, shot, project);
      console.log(`  ${shot.shotId.padEnd(6)} ${geo.length ? `${geo.length} problems` : 'the checks pass'}`); for (const g of geo) console.log(`    ${g.kind}: ${g.say}`); }
    catch (e) { console.log(`  ${shot.shotId.padEnd(6)} not measured: ${String(e.message || e).split('\n')[0]}`); }
  }
} else if (cmd === 'variants') {
  // A designed frame in several layouts (framevariants.mjs): each tried under the checks, the strip best first
  const { runVariants } = await import('../apps/studio-next/src/lib/recipe-board/framevariants.mjs');
  const r = await runVariants(cfg, project, opt('seg'), opt('id'), { log: (l) => console.log(l) });
  console.log(`  strip (best first: ${r.ranked.map((x) => `${x.name} ${x.problems.length}`).join(', ')}): ${r.strip}`);
} else if (cmd === 'metrics') {
  // How the line is doing (linemetrics.mjs): versions a shot takes, first-pass share, the items the reviews still name
  const { lineMetrics } = await import('../apps/studio-next/src/lib/recipe-board/linemetrics.mjs');
  for (const [seg, m] of Object.entries(lineMetrics(cfg, project))) console.log(`  ${seg.padEnd(8)} ${String(m.shots).padStart(3)} shots  ${String(m.versions).padStart(4)} versions a shot  first pass ${Math.round(m.firstPass * 100)} %  passing ${m.passing}  ${Object.entries(m.items).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v}`).join(', ')}`);
} else if (cmd === 'matindex') {
  // The material index (matindex.mjs): every picture and clip read once and described by what it is.
  const { buildIndex } = await import('../apps/studio-next/src/lib/recipe-board/matindex.mjs');
  const idx = buildIndex(cfg, project, { log: (l) => console.log(l) });
  const kinds = {}; for (const e of Object.values(idx.files)) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  console.log('  ' + Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', '));
} else if (cmd === 'shotplan') {
  // The shot director for a passage (shotplan.mjs): --task writes the task (reference frames and cuts, narration, materials),
  // then the agent's answer is checked into modules/<seg>/, and --render renders and joins it beside the reference.
  const sp = await import('../apps/studio-next/src/lib/recipe-board/shotplan.mjs');
  if (flag('task')) { const r = await sp.shotplanTask(cfg, project, opt('seg'), opt('range').split(',').map(Number), { blind: flag('blind') }); console.log(`  task: ${r.task} (${r.mode}: ${r.windows} windows, ${r.images} pictures)`); }
  else if (flag('render')) { const r = await sp.renderPassage(cfg, project, opt('seg'), { log: (l) => console.log(l) }); for (const c of r.checks) for (const i of c.issues) console.log(`  ${c.shot}: ${i.say}`); console.log(`  ${r.film}\n  ${r.beside}`); }
  else { const r = await sp.runShotplan(cfg, project, opt('seg'), { log: (l) => console.log(l), revise: opt('revise') || null, materials: !flag('no-materials') }); if (r.waiting) console.log(`  waiting for ${r.waiting}`); else { for (const e of r.errors) console.log('  ERROR ' + e); for (const w of r.warnings) console.log('  warn  ' + w); const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`); const sc = r.judged || r.against; console.log(`  ${r.judged ? 'judged against the inventory' : 'against its own beats'}: telling ${pct(sc.technique)}, material ${pct(sc.material)} (requested ${pct(sc.materialRequested)})${sc.gaps.length ? `, modules missing: ${sc.gaps.map((g) => g.device).join(',')}` : ''}; report ${r.report}`); if (!r.errors.length) console.log(`  accepted: ${r.shots.length} shots -> ${r.dir}`); if (r.errors.length) process.exitCode = 1; } }
} else if (cmd === 'write') {
  const { writeShots } = await import('../apps/studio-next/src/lib/recipe-board/writer.mjs');
  const r = await writeShots(cfg, project, { only: opt('only') ? new Set(opt('only').split(',')) : null, rewrite: flag('rewrite'), log: (l) => console.log('  ' + l) });
  console.log(`  ${r.shots} shots, ${r.needs} material needs`);
} else if (cmd === 'factcheck') {
  const { recheckFacts } = await import('../apps/studio-next/src/lib/recipe-board/writer.mjs');
  const flagged = await recheckFacts(cfg, project);
  console.log(flagged.length ? flagged.map((l) => '  ' + l).join('\n') : '  every number traces to the text');
} else if (cmd === 'chapter') {
  // continuous-diagram chapters on their own: writes each chapter's task (or its review task) and checks the answers
  // the session agent wrote; renders and binds what passed or stands as a draft
  const { stepChapters } = await import('../apps/studio-next/src/lib/recipe-board/chapter.mjs');
  const r = await stepChapters(cfg, project, { only: opt('only') ? new Set(opt('only').split(',')) : null, rounds: +opt('chapter-rounds', 1), renderDrafts: flag('render'), log: (l) => console.log(l) });   // --render: also render drafts now (run does)
  for (const k of ['accepted', 'rejected', 'waiting', 'drafts', 'rendered']) if (r[k]?.length) console.log(`  ${k}: ${r[k].join(',')}`);
  if (flag('preview')) { const { previewChapter } = await import('../apps/studio-next/src/lib/recipe-board/chapter.mjs'); for (const c of (opt('only') || '').split(',').filter(Boolean)) await previewChapter(cfg, project, c); }   // --preview: a half-size video of the last checked version, with its neighbours' seams
} else if (cmd === 'replay') {
  // the geometry checks run again on each chapter's kept track (no render): try a changed check on every chapter in
  // seconds before it goes out (--grep: only the faults a check names, e.g. --grep "lines to read")
  const { replayChecks } = await import('../apps/studio-next/src/lib/recipe-board/chapter.mjs');
  const rows = await replayChecks(cfg, project, { only: opt('only') ? new Set(opt('only').split(',')) : null, grep: opt('grep') || null });
  for (const r of rows) { console.log(`  ${r.chapter}: ${r.missing ? 'no kept track (check it once)' : r.errors.length ? `${r.errors.length} fault(s)` : 'clean'}`); for (const e of r.errors) console.log(`    ${e}`); }
} else if (cmd === 'rulestats') {
  // what each rule caught, across every project's checks and their histories (agenttask ruleStats)
  const { ruleStats } = await import('../apps/studio-next/src/lib/recipe-board/agenttask.mjs'); const rows = ruleStats(cfg);
  for (const r of rows.slice(0, Number(opt('top') || 60))) console.log(`${String(r.n).padStart(4)}  ${r.films.length} film(s)  ${r.rule}`);
  console.log(`${rows.length} kinds of finding`);
} else if (cmd === 'sop') {
  // the SOP's flow section from the one flow table in code (flow.mjs); --write puts it into SOP.md
  const { withFlow, sopSection } = await import('../apps/studio-next/src/lib/recipe-board/flow.mjs');
  const f = path.join(cfg.repoRoot, 'SOP.md'), now = fs.readFileSync(f, 'utf8'), next = withFlow(now);
  if (next == null) { console.log('SOP.md has no flow markers'); process.exit(2); }
  if (process.argv.includes('--write')) { fs.writeFileSync(f, next); console.log(next === now ? 'SOP.md flow is current' : 'SOP.md flow written'); } else console.log(sopSection());
} else if (cmd === 'parity') {
  // how near the film comes to its reference, sub-shot by sub-shot (parity.mjs; it had no command and nothing ran it)
  const { parityReport } = await import('../apps/studio-next/src/lib/recipe-board/parity.mjs');
  if (!project) { console.log('usage: recipe-board.mjs parity --project <id>'); process.exit(2); }
  const r = parityReport(cfg, project); for (const m of r.measures || []) console.log(`  ${m.key.padEnd(18)} within ${Math.round((m.within || 0) * 100)}% of ${m.n}`); if (r.cuts) console.log('  cuts', JSON.stringify(r.cuts));
} else if (cmd === 'kitbench') {
  // the device kit's parts drawn at two moments on one sheet (kitbench.mjs; cases in templates/kit4.bench.js)
  const { kitBench } = await import('../apps/studio-next/src/lib/recipe-board/kitbench.mjs');
  const out = opt('out') || path.join(cfg.dataDir, 'bench', `kit4${opt('style') ? `-${opt('style')}` : ''}${opt('only') ? `-${opt('only')}` : ''}.png`); fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = await kitBench(cfg, { out, only: opt('only') || null, project: project || 'paperclip-138-full', style: opt('style') || null }); console.log(`kit bench -> ${r.out}`); for (const e of r.errors) console.log(`  page error: ${e}`); if (r.errors.length) process.exitCode = 1;
} else if (cmd === 'chapterlang') {
  // the chapter language measured again from reference projects (--project a,b: their profiles and their beats taken
  // apart) into routing/chapter-language.json: the bar every chapter beat is held to, with a reference or without
  const L = await import('../apps/studio-next/src/lib/recipe-board/chapterlang.mjs');
  const { referencePaths } = await import('../apps/studio-next/src/lib/recipe-board/refbreakdown.mjs');
  const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const sources = String(opt('project') || '').split(',').filter(Boolean).map((p) => {
    const R = referencePaths(cfg, p); if (!R) throw new Error(`${p}: no reference (project.json reference.beats)`);
    const pf = [path.join(R.dir, 'profile.json'), path.join(R.dir, 'profile', 'profile.json')].find((f) => fs.existsSync(f)); if (!pf) throw new Error(`${p}: the reference has no profile (refprofile)`);
    const beats = fs.readdirSync(R.breakdowns).filter((f) => f.endsWith('.json')).flatMap((f) => rd(path.join(R.breakdowns, f)).beats || []);
    return { profile: rd(pf), beats, subtitles: fs.existsSync(R.subtitles) ? rd(R.subtitles).lines : null, film: rd(path.join(cfg.dataDir, 'projects', p, 'project.json')).reference?.film?.split(/[（：]/)[0] || p }; });
  const lang = L.measureChapterLanguage({ sources });
  fs.writeFileSync(L.chapterLanguageFile(cfg), JSON.stringify(lang, null, 1)); console.log(`chapter language from ${lang.beats} beats of ${lang.films.join(' + ')} -> ${L.chapterLanguageFile(cfg)}`); for (const l of L.languageBrief(lang)) console.log(`  ${l}`);
} else if (cmd === 'refbreakdown') {
  // the reference film taken apart for a section of its seconds: dense frames + timed subtitles in, a checked breakdown out
  const { stepBreakdown } = await import('../apps/studio-next/src/lib/recipe-board/refbreakdown.mjs');
  const from = +opt('from'), to = +opt('to'); if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error('refbreakdown needs --from <s> --to <s> (seconds of the reference, from < to)');
  await stepBreakdown(cfg, project, { from, to, log: (l) => console.log(l) });
} else if (cmd === 'boards') {
  // motion boards for the 3D hero shots (keyframes.mjs): the director's requests drawn frame by frame, each from the last
  const K = await import('../apps/studio-next/src/lib/recipe-board/keyframes.mjs');
  if (opt('approve')) { if (!opt('by')) throw new Error('boards --approve needs --by "<who approved, in their words>"'); console.log(`  approved: ${K.approveBoard(cfg, project, opt('approve').split(','), opt('by')).join(',') || 'none'}`); }
  else {
    const redraw = {}; for (const x of (opt('redraw') || '').split(',').filter(Boolean)) { const [b, n] = x.split(':'); (redraw[b] ||= []).push(+n); }   // --redraw B44:1
    const r = await K.stepBoards(cfg, project, { only: opt('only') ? new Set(opt('only').split(',')) : null, redraw, log: (l) => console.log(l) }); console.log(`  made: ${r.made.join(',') || '-'}  kept: ${r.kept.join(',') || '-'}`); }
} else if (cmd === 'lessons') {
  // the user's decisions the three blind reviews share (reviewrules.mjs): --sync writes the generated section into
  // prompts/morph-review.md, stillcheck.md and film-review.md from routing/lessons.json review; without it, what differs
  const R = await import('../apps/studio-next/src/lib/recipe-board/reviewrules.mjs'), changed = R.syncReviewPrompts(cfg, { write: flag('sync') });
  console.log(changed.length ? `  ${flag('sync') ? 'written' : 'out of date (--sync writes them)'}: ${changed.join(', ')}` : '  the three review prompts carry the user\'s decisions as the lessons have them');
  console.log(`  ${R.reviewLessons(R.readLessons(cfg)).length} decisions for the reviewers; ${R.readLessons(cfg).filter((l) => l.supersededBy).length} lessons replaced by later ones (not handed out)`);
} else if (cmd === 'gate') {
  // the film's three user gates (gates.mjs; CONVERGE-20261026): look (the key frames), rough (the structure white model),
  // final (the polished film before the fine render). Only with the user's own words; never for them
  const G = await import('../apps/studio-next/src/lib/recipe-board/gates.mjs');
  // (the user turns every direction of the look down: their words to the taste record, the world derived again)
  if (opt('reject') === 'look') { const W = await import('../apps/studio-next/src/lib/recipe-board/filmworld.mjs'); const r = W.rejectLook(cfg, project, opt('say')); console.log(`  look turned down (${r.recorded} directions recorded in routing/taste.json); the world is derived again on the next run`); }
  if (opt('approve')) {
    if (!opt('by')) throw new Error('gate --approve needs --by "<who approved, in their words>"');
    const r = await G.approveGate(cfg, project, opt('approve'), opt('by'), { pick: opt('pick') || null });
    console.log(`  ${opt('approve')} approved by ${r.by} at ${r.at}`);
  }
  const s = await G.gateState(cfg, project);
  if (flag('json')) { console.log(JSON.stringify(s)); process.exit(0); }
  if (!s.six) console.log(`  ${project} is not on the six-stage process (project.json process); its own gates stand (run --dry lists them)`);
  // (the film's own set of gates: the design set's two, or the older ones a film made before keeps)
  else for (const g of (s.set === 'design' ? G.GATES : G.LEGACY_GATES).filter((x) => s[x])) console.log(`  ${s.waiting === g ? '→' : s[g].ok ? '✓' : '·'} ${g.padEnd(9)} ${s[g].why}`);
  if (s.six && s.waiting === 'look') { const r = await G.lookSheet(cfg, project); console.log(`  look sheet: ${r.sheet || 'no frames yet (run first: the key frames are drawn from the storyboard and the first plans)'}`); }
} else if (cmd === 'animatic') {
  // the film's white model (animatic.mjs); --approve records the user's approval of chapters' white models (chapter.mjs gate)
  if (opt('approve')) {
    if ((await import('../apps/studio-next/src/lib/recipe-board/gates.mjs')).sixStage(JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'projects', project, 'project.json'), 'utf8')))) throw new Error(`${project} is approved as a whole film: gate --project ${project} --approve rough|final --by "<the user's words>"`);
    const { approveChapters } = await import('../apps/studio-next/src/lib/recipe-board/chapter.mjs');
    if (!opt('by')) throw new Error('animatic --approve needs --by "<who approved, in their words>"');
    console.log(`  approved: ${approveChapters(cfg, project, opt('approve').split(','), opt('by')).join(',') || 'none (no such chapter with a module)'}`);
  } else {
    const { buildAnimatic } = await import('../apps/studio-next/src/lib/recipe-board/animatic.mjs'), t0 = Date.now();
    const r = await buildAnimatic(cfg, project, { tier: flag('fast') ? 'fast' : 'look', only: opt('only') ? new Set(opt('only').split(',')) : null, log: (l) => console.log(l) });
    const n = (k) => Object.values(r.sources).filter((v) => v === k).length;
    console.log(`  white model ${r.seconds} s in ${Math.round((Date.now() - t0) / 1000)} s -> ${r.film}`);
    console.log(`  pieces: ${n('chapter')} chapter beats, ${n('final')} cards from their final render, ${n('draft')} draft, ${n('still')} stills, ${n('missing')} missing`);
    console.log(r.seams.length ? `  seams that do not join: ${r.seams.length}\n    ${r.seams.join('\n    ')}` : '  every seam joins');
    { const ft = await (await import('../apps/studio-next/src/lib/recipe-board/typebible.mjs')).filmTypeReport(cfg, project); if (ft.length) console.log(`  type across the film:\n    ${ft.join('\n    ')}`); }   // (TYPE.md: one size for one role)
    if (r.look?.length) console.log(`  shots off the film's look: ${r.look.length}\n    ${r.look.join('\n    ')}`);
    const { whiteModelWaits } = await import('../apps/studio-next/src/lib/recipe-board/run.mjs'), wait = whiteModelWaits(cfg, project);
    if (wait.length) console.log(`  final renders waiting for your approval of the white model: ${wait.join(',')}`);
  }
} else if (cmd === 'refsubs') {
  // the reference's narration read off its burned-in subtitles (refprofile.mjs burnedSubtitles) -> reference/subtitles.json
  const { referencePaths } = await import('../apps/studio-next/src/lib/recipe-board/refbreakdown.mjs'), rp = await import('../apps/studio-next/src/lib/recipe-board/refprofile.mjs');
  const R = referencePaths(cfg, project); if (!R || !fs.existsSync(R.video)) throw new Error('no reference video for this project');
  if (fs.existsSync(R.subtitles) && !flag('force')) console.log(`  kept ${R.subtitles} (--force to read again)`);
  else { const d = rp.burnedSubtitles(R.video, R.subtitles); console.log(`  ${d.lines.filter((l) => l.text).length} lines -> ${R.subtitles}`); }
} else if (cmd === 'refprofile') {
  // the reference measured second by second (refprofile.mjs); with --video, one of our renders measured and set
  // against the reference's seconds --from..--to (the same lines): where ours falls short
  const rp = await import('../apps/studio-next/src/lib/recipe-board/refprofile.mjs');
  const ref = rp.referenceProfile(cfg, project); if (!ref) throw new Error('no reference video for this project');
  console.log(`  reference: ${JSON.stringify(ref.summary)}`);
  if (opt('video')) {
    const v = path.resolve(opt('video')), ours = rp.profileVideo(v, path.join(path.dirname(v), path.basename(v, path.extname(v)) + '.profile'));
    const a = rp.window(ours), b = rp.window(ref, +opt('from', 0), +opt('to', Infinity));
    console.log(`  ours      ${JSON.stringify(a)}\n  reference ${JSON.stringify(b)}`);
    const gaps = rp.profileGaps(a, b); console.log(gaps.length ? gaps.map((g) => `  short: ${g}`).join('\n') : '  no gap beyond the limits');
  }
} else if (cmd === 'stage') {
  const { stepStage } = await import('../apps/studio-next/src/lib/recipe-board/stage.mjs');
  const r = await stepStage(cfg, project, { only: opt('only') ? new Set(opt('only').split(',')) : null, dry: flag('dry'), build: !flag('no-build'), log: (l) => console.log(l) });
  console.log(`  look: ${r.look.theme}${r.look.world ? ` (world ${r.look.world})` : ''}, medium ${r.look.medium} / scenes ${r.look.sceneMedium}`);
  for (const x of r.items) console.log(`  ${x.shot.shotId} ${x.spec.missing ? `to build: ${x.spec.route} "${x.spec.want}"` : `${x.spec.route} ${x.spec.subject || x.spec.scene || x.spec.template}${x.spec.shot ? ' ' + x.spec.shot : ''}${x.spec.highlight?.length ? ' highlight ' + x.spec.highlight.join('+') : ''}`}${r.due.includes(x.shot.shotId) ? '  (due)' : ''}`);
  if (r.made.length) console.log(`  plates bound: ${r.made.join(',')}`);
} else if (cmd === 'art') {
  // Generate missing art (text-free plates, transparent props) with GPT image generation via Codex.
  // First the theme's art templates fill the parts of each card that are art (--no-fill skips this).
  const { realArt, artRequests, cachedArt } = await import('../apps/studio-next/src/lib/recipe-board/imagegen.mjs');
  const { loadShots } = await import('../apps/studio-next/src/lib/recipe-board/store.mjs');
  const only = opt('only') ? new Set(opt('only').split(',')) : null;
  if (!flag('no-fill')) {
    const { fillProjectArt } = await import('../apps/studio-next/src/lib/recipe-board/arttemplates.mjs');
    const r = await fillProjectArt(cfg, project, { only, log: (l) => console.log('  template ' + l) });
    console.log(`  templates: ${r.pieces} pieces in ${r.shots} shots`);
  }
  if (flag('fill-only')) process.exit(0);
  for (const shot of loadShots(cfg, project, only)) {
    for (const art of artRequests(shot)) {
      if (cachedArt(cfg, art) && !flag('force')) { console.log(`  ${shot.shotId} cached  ${art.prompt.slice(0, 60)}`); continue; }
      const r = await realArt(cfg, art, { log: (l) => console.log(l) });
      console.log(`  ${shot.shotId} ${r.cached ? 'cached' : r.real ? `real photo (${r.real.license})` : `new ${r.seconds}s`}${r.textChars ? `  text chars ${r.textChars}` : ''}  ${art.prompt.slice(0, 60)}`);
    }
  }
} else if (cmd === 'reject') {
  // take back a wrong picture: --only <shot or shot~cut> --why "…"; the next run picks the next candidate
  const { rejectPick, proposeBatch } = await import('../apps/studio-next/src/lib/recipe-board/materials.mjs');
  if (!opt('only')) throw new Error('reject needs --only <shot>');
  for (const k of opt('only').split(',')) await rejectPick(cfg, project, k, { why: opt('why', 'wrong picture'), log: (l) => console.log('  ' + l) });
  const r = proposeBatch(cfg, project, { only: opt('only').split(',') });
  console.log(`  proposed again: ${r.picks.filter((p) => opt('only').split(',').includes(p.shotId)).map((p) => `${p.shotId} ${p.url}`).join(', ') || 'nothing usable'} (fetched on the next run)`);
} else if (cmd === 'materials') {
  const { findCandidates, addSourcePage } = await import('../apps/studio-next/src/lib/recipe-board/materials.mjs');
  if (opt('page')) { addSourcePage(cfg, project, opt('only'), opt('page'), { log: (l) => console.log('  ' + l) }); }   // --only <shot> --page <url>: a source page the director names
  else { const r = await findCandidates(cfg, project, { only: opt('only')?.split(','), log: (l) => console.log('  ' + l) }); console.log('  ' + r.file); }
} else if (cmd === 'sketch') {
  // Experiment (2026-10-18): sketch -> pick -> layer for some shots; briefs in style-lab/sketch-v1/briefs.json.
  const S = await import('../apps/studio-next/src/lib/recipe-board/sketch.mjs');
  const { chromium } = await import('playwright');
  const root = path.join(cfg.dataDir, 'style-lab', 'sketch-v1');
  const briefs = JSON.parse(fs.readFileSync(path.join(root, 'briefs.json'), 'utf8'));
  const only = opt('only') ? opt('only').split(',') : Object.keys(briefs);
  const count = Number(opt('count') || 6);
  for (const id of only) {
    const b = { ...briefs[id], refs: (briefs[id].refs || []).map((r) => path.join(cfg.sourceRoot, r)) };
    const dir = path.join(root, id);
    console.log(`${id}: sketches`);
    const files = S.sketchShot(b, dir, { count, log: (l) => console.log(l) });
    const pick = await S.pickSketch(files, b);
    fs.writeFileSync(path.join(dir, 'pick.json'), JSON.stringify(pick, null, 1) + '\n');
    console.log(`  pick ${pick.pick} (${pick.ranking?.join(',')}): ${pick.why}`);
    const chosen = files[(pick.pick || 1) - 1];
    const plate = S.plateOf(chosen, path.join(dir, 'plate.png'));
    const layout = S.typeLayout(chosen, b.texts).map((l) => ({ ...l, ink: S.inkFor(plate, l.box) }));
    fs.writeFileSync(path.join(dir, 'layout.json'), JSON.stringify(layout, null, 1) + '\n');
    const html = path.join(dir, 'frame.html');
    fs.writeFileSync(html, S.sketchHtml('file://' + plate, layout, { fonts: S.FONTS }));
    const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto('file://' + html); await page.waitForSelector('body[data-ready]', { timeout: 20000 }).catch(() => {});
    await page.screenshot({ path: path.join(dir, 'frame.png') }); await browser.close();
    console.log(`  frame ${path.join(dir, 'frame.png')} (${layout.length} type lines placed)`);
  }
} else if (cmd === 'typecheck') {
  // Faces, sizes and positions of each designed frame's headline across the film (typecheck.mjs).
  const { typeCheck } = await import('../apps/studio-next/src/lib/recipe-board/typecheck.mjs');
  const r = await typeCheck(cfg, project);
  console.log(`  ${r.stats.frames} frames · faces ${r.stats.faces} (${r.stats.faceList.join(', ')}) · sizes ${r.stats.sizes} · left edges ${r.stats.lefts} · tops ${r.stats.tops}`);
  console.log(r.issues.length ? '  over the limit: ' + r.issues.join('; ') : '  within the limits');
} else if (cmd === 'concept') {
  // Style frames of the film's key shots in each world (worlds/*.json); --pick <world> sets the project's
  // theme to that world's kit; --all also draws worlds that have no kit yet (preview only).
  const C = await import('../apps/studio-next/src/lib/recipe-board/concept.mjs');
  if (opt('pick')) { const p = C.pickWorld(cfg, project, opt('pick')); console.log(`  ${project}: world ${p.world}, theme ${p.theme}`); }
  else {
    const r = C.stepConcept(cfg, project, { all: flag('all'), log: (l) => console.log('  ' + l) });
    console.log(r.picked ? `  world ${r.picked}` : `  key shots: ${r.keys.map((k) => `${k.role} ${k.shot.shotId}`).join(', ')}\n  frames in projects/${project}/concept/ · pick with --pick <${r.worlds.map((w) => w.id).join('|')}>`);
  }
} else if (cmd === 'propose') {
  // One best candidate per need -> materials/proposed-batch.json, for the user to confirm.
  const { proposeBatch } = await import('../apps/studio-next/src/lib/recipe-board/materials.mjs');
  const r = proposeBatch(cfg, project, { only: opt('only') ? opt('only').split(',') : null });
  for (const p of r.picks.filter((x) => !opt('only') || opt('only').split(',').some((o) => x.shotId === o || x.shotId.startsWith(o + '~')))) console.log(`  ${p.shotId.padEnd(8)} ${String(p.rights).slice(0, 10).padEnd(10)} ${String(p.publisher || '').slice(0, 18).padEnd(18)} ${p.title.slice(0, 60)}`);
  if (r.skipped.length) console.log('  no usable candidate: ' + r.skipped.join(','));
} else if (cmd === 'fetch') {
  // Only items the user approved on /recipe-board/materials; nothing else is downloaded.
  const { fetchApproved } = await import('../apps/studio-next/src/lib/recipe-board/materials.mjs');
  const { bindShots } = await import('../apps/studio-next/src/lib/recipe-board/materials.mjs');
  // Keep fetch and binding in the same cooperative passage/entity critical section.
  const { materialsLock } = await import('../apps/studio-next/src/lib/recipe-board/shotplan.mjs');
  const release = await materialsLock(cfg, project, (l) => console.log('  ' + l));
  try {
    await fetchApproved(cfg, project, { batchId: opt('batch'), lockOwner: release, log: (l) => console.log('  ' + l) });
    bindShots(cfg, project, { log: (l) => console.log('  ' + l) });
  } finally { release(); }
} else if (cmd === 'film') {
  // a project of passages joined into its film, with the overview sheets and the profile against the reference
  // (--rough: the passages' white models, for a round of fixes; without it the fine renders, when the film is watched)
  const { buildFilm } = await import('../apps/studio-next/src/lib/recipe-board/film.mjs');
  const r = buildFilm(cfg, project, { rough: flag('rough'), log: (l) => console.log('  ' + l) });
  console.log('  ' + r.gaps);
  { const P = await import('../apps/studio-next/src/lib/recipe-board/process.mjs'); console.log('  ' + P.processLine(P.processMetrics(cfg, project)) + ' (out/film/process.json)'); }
} else if (cmd === 'session-brief') {
  // a chapter's production brief for its own session, from the approved design (sessionbrief.mjs)
  const B = await import('../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs');
  for (const ch of String(opt('chapter') || '').split(',').filter(Boolean)) console.log('  ' + await B.sessionBrief(cfg, project, ch));
} else if (cmd === 'greybox') {
  // the whole film as a greybox rough (greybox.mjs): its task written, its answer checked, its frames, sheet and reel
  // made; the direction gate is approved on it (gate --approve direction)
  const G = await import('../apps/studio-next/src/lib/recipe-board/greybox.mjs');
  let r;
  if (flag('sheet-only')) {
    const wr = await G.writeGreyboxSheet(cfg, project, { preflight: flag('preflight'), log: console.log });
    r = { state: 'sheet', hit: wr.hit, seam: wr.seam };
  } else if (flag('stills-only')) {
    const root = (await import('../apps/studio-next/src/lib/recipe-board/store.mjs')).projectPaths(cfg, project).root;
    const answer = JSON.parse(fs.readFileSync(path.join(root, 'tasks/greybox.answer.json'), 'utf8'));
    const sources = path.join(root, 'materials/sources');
    const facts = fs.existsSync(sources) ? fs.readdirSync(sources).filter((f) => f.endsWith('.txt')).map((f) => fs.readFileSync(path.join(sources, f), 'utf8')) : [];
    const errors = [...G.greyboxErrors(answer, await G.greyboxInput(cfg, project), facts), ...G.greyboxAssetErrors(answer, root)];
    if (errors.length) throw new Error(`greybox preflight rejected: ${errors.join(' | ')}`);
    await G.renderGreybox(cfg, project, answer, { stillsOnly: true, log: console.log }); r = { state: 'preflight' };
  } else r = await G.stepGreybox(cfg, project, { log: (l) => console.log(l) });
  console.log(`  greybox: ${r.state}${r.why ? ` — ${r.why}` : ''}`); (r.errors || []).forEach((e) => console.log('  ✗ ' + e));
  if (r.state === 'rejected') process.exitCode = 1;
} else if (cmd === 'smoke') {
  // the final's road tried end to end without rendering the film (RETRO-20261028 4): every chapter and the hero stills
  // drawn on their first, middle and last frame by the final's own page, and every beat mapped to a piece of the final
  const A = await import('../apps/studio-next/src/lib/recipe-board/animatic.mjs');
  const r = await A.preflightFilm(cfg, project, { log: (l) => console.log(l), force: flag('force') });
  console.log(`  ${r.ok ? 'ok' : 'FAILED'}: ${Object.keys(r.chapters).length} chapters drawn, ${r.beats} beats → ${r.seconds} s of final${r.planned ? ` (planned ${r.planned} s)` : ''} (out/film/preflight.json)`);
  r.errors.forEach((e) => console.log('  ✗ ' + e));
  if (!r.ok) process.exitCode = 1;
} else if (cmd === 'waive') {
  // the director answers a ruling (a review's fix or a measure) with a reason instead of a change, for the shot's picture
  // as it is now (layers.mjs waive); run lists it, and the user overrules it by marking the shot bad
  const L = await import('../apps/studio-next/src/lib/recipe-board/layers.mjs');
  const w = L.waive(cfg, project, opt('seg'), opt('shot'), opt('item'), opt('why'));
  console.log(`  ${opt('seg')} ${w.shot}: ${w.item} waived for this picture (${w.hash}): ${w.why}`);
} else if (cmd === 'note') {
  // a note the user gave on the film, in their words (process.mjs: counted per film; it also becomes a lesson)
  const P = await import('../apps/studio-next/src/lib/recipe-board/process.mjs');
  const n = P.addUserNote(cfg, project, opt('say'), { about: opt('about') || null });
  console.log(`  noted ${n.at}: ${n.say}`);
} else if (cmd === 'readcheck') {
  // read-speed budget on the kept geometry tracks (storyboard.mjs readBudgetTrackErrors; warning, not a render gate):
  // each declared read's on-screen words must get 7 CJK/s or 20 other/s + 0.8 s to find them
  const C = await import('../apps/studio-next/src/lib/recipe-board/chapter.mjs');
  const only = opt('chapter') ? new Set(String(opt('chapter')).split(',')) : null;
  const rows = await C.replayChecks(cfg, project, { only });
  let n = 0;
  for (const x of rows) { if (x.missing) { console.log(`  ${x.chapter}: no kept track`); continue; } for (const w of x.warnings || []) if (String(w).startsWith('read-budget:')) { n++; console.log(`  ${x.chapter} ${w}`); } }
  if (!n) console.log('  readcheck: no read-budget warning on the kept tracks');
} else if (cmd === 'seamreview') {
  // a seam between two chapters, judged on real joined-seconds 1× playback (seamreview.mjs)
  const S = await import('../apps/studio-next/src/lib/recipe-board/seamreview.mjs');
  const r = await S.stepSeamReview(cfg, project, opt('from'), opt('to'), { log: (l) => console.log(l) });
  if (r.state === 'rejected') process.exitCode = 1;
} else if (cmd === 'stillbook') {
  // one final still per beat, in one sheet: the design the user sees before a rough cut (stillbook.mjs)
  const S = await import('../apps/studio-next/src/lib/recipe-board/stillbook.mjs');
  const r = await S.buildStillbook(cfg, project, { dir: opt('dir') || null, out: opt('out') || null });
  console.log(`  stillbook: ${r.entries.length} beats → ${r.file}${r.errors.length ? ` (${r.errors.join('; ')})` : ''}`);
  if (r.diversity) console.log(`  variants: ${r.diversity.uniqueCarriers} unique carriers across ${r.diversity.totalBeats} beats | families=${JSON.stringify(r.diversity.byFamily)}`);
} else if (cmd === 'variantplan') {
  const V = await import('../apps/studio-next/src/lib/recipe-board/variants.mjs');
  const { projectPaths } = await import('../apps/studio-next/src/lib/recipe-board/store.mjs');
  const p = projectPaths(cfg, project);
  const plan = JSON.parse(fs.readFileSync(path.join(p.root, 'plan.json'), 'utf8'));
  const matrix = V.loadVariantMatrix(cfg);
  const solved = V.solveFilmVariants(plan.beats || [], matrix);
  const report = V.variantDiversityReport(solved, matrix);
  const outFile = path.join(p.out, 'look', 'variants-plan.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ contract: matrix?.contract, project, diversity: report, beats: solved }, null, 2) + '\n');
  console.log(`  variants: ${report.uniqueCarriers} unique carriers / ${report.totalBeats} beats | families=${JSON.stringify(report.byFamily)} → ${outFile}`);
  for (const r of solved) console.log(`    ${r.beat} [${r.semanticAct}] → (${r.chosenVariant}) ${r.chosen?.family} :: ${r.chosen?.carrier} | T0→T1→T2`);
} else if (cmd === 'oneshot') {
  // one hero shot decided on its target frame and a blind A/B: use the proof only if it wins and every
  // dimension clears the bar; otherwise the target stays and the experiment stops (oneshot.mjs)
  const O = await import('../apps/studio-next/src/lib/recipe-board/oneshot.mjs');
  const blind = opt('blind') ? JSON.parse(fs.readFileSync(opt('blind'), 'utf8')) : null;
  const r = O.stepOneShot(cfg, project, opt('beat'), { target: opt('target'), proof: opt('proof'), blind }, { log: (l) => console.log(l) });
  if (r.decision === 'rejected') process.exitCode = 1;
} else if (cmd === 'retro') {
  // the retrospective after the final (retro.mjs): faults by kind, the user's notes, the lessons made, the next three
  const r = await (await import('../apps/studio-next/src/lib/recipe-board/retro.mjs')).retro(cfg, project); console.log(`  ${r.file}`); console.log(r.md.split('\n').slice(-6).join('\n'));
} else if (cmd === 'lookdev') {
  // the three anchor shots as text-free target frames, before greybox and chapters (lookdev.mjs):
  // one object/principle, one evidence, one map/data; 2–3 directions each, one chosen
  const L = await import('../apps/studio-next/src/lib/recipe-board/lookdev.mjs');
  const r = await L.stepLookDev(cfg, project, { log: (l) => console.log(l) });
  if (r.state === 'rejected') process.exitCode = 1;
} else if (cmd === 'process') {
  const P = await import('../apps/studio-next/src/lib/recipe-board/process.mjs'), m = P.processMetrics(cfg, project, { since: opt('since') || null, write: !opt('since') });
  console.log('  ' + P.processLine(m)); console.log(JSON.stringify(m, null, 1));
} else if (cmd === 'reel') {
  const { buildReel } = await import('../apps/studio-next/src/lib/recipe-board/sequence.mjs');
  const r = buildReel(cfg, project, { medium: opt('medium') ? { kind: opt('medium') } : null });
  console.log(`  ${r.shots} shots${r.missing.length ? `, no motion yet: ${r.missing.join(',')}` : ''}`);
  if (r.reel) console.log('  ' + r.reel);
  if (r.board) console.log('  ' + r.board);
} else if (cmd === 'compare') {
  const { compareSheets } = await import('../apps/studio-next/src/lib/recipe-board/render.mjs');
  const made = compareSheets(cfg, project, opt('only') ? new Set(opt('only').split(',')) : null);
  made.forEach((f) => console.log('  ' + f));
} else if (cmd === 'reroute') {
  // Re-apply the routing table to a saved plan (no analyzer call).
  const { routePlan } = await import('../apps/studio-next/src/lib/recipe-board/director.mjs');
  const saved = readPlan(cfg, project);
  if (!saved) throw new Error(`no plan for ${project}`);
  const plan = routePlan(cfg, saved, { ...saved.options, ...(flag('presenter') ? { hasPresenter: true } : {}) });
  writePlan(cfg, project, plan);
  printPlan(project, plan);
} else if (cmd === 'plan') {
  const { planFromBeats } = await import('../apps/studio-next/src/lib/recipe-board/director.mjs');
  const { stepPlan } = await import('../apps/studio-next/src/lib/recipe-board/plan.mjs');
  const article = opt('article');
  if (!(article || opt('beats')) || !opt('project')) throw new Error('plan needs --project and --article (or --beats)');
  if (flag('heuristic')) throw new Error('production plan no longer publishes heuristic fallbacks; use the plan agent task');
  ensureProject(cfg, opt('project'), opt('title'));
  const given = opt('beats') ? JSON.parse(fs.readFileSync(opt('beats'), 'utf8')) : null;
  if (given) {
    const plan = planFromBeats(cfg, { beats: given.beats, title: opt('title', given.title || ''), source: opt('beats'), hasPresenter: flag('presenter') || !!given.hasPresenter });
    writePlan(cfg, opt('project'), plan);
    printPlan(opt('project'), plan);
  } else {
    const r = await stepPlan(cfg, opt('project'), { article: fs.readFileSync(article, 'utf8'), title: opt('title', ''), hasPresenter: flag('presenter'), log: console.log });
    if (r.state === 'accepted') { writePlan(cfg, opt('project'), r.plan); printPlan(opt('project'), r.plan); }
    else if (r.state === 'rejected') throw new Error(`plan answer rejected: ${r.errors.join('; ')}`);
    else console.log(`plan task waiting: ${r.task}`);
  }
} else if (cmd === 'status') {
  const { counts, rows } = boardRows(cfg, project);
  console.log(`${project}: ${counts.total} shots · pass ${counts.pass} · reject ${counts.reject} · pending ${counts.pending} · TODO ${counts.todo}`);
  for (const r of rows) console.log(`  ${r.shotId.padEnd(4)} ${r.recipe.padEnd(24)} ${r.verdict ? r.verdict.verdict + (r.verdict.stale ? ' (stale)' : '') : '-'}${r.degraded.length ? '  TODO ' + r.degraded.map((d) => d.slot).join(',') : ''}`);
} else if (cmd === 'usage') {
  // House Usage Meter v0: screen/palette/seam/evidence counts + flags (houseusage.mjs)
  if (!opt('project')) { console.error('usage: recipe-board.mjs usage --project <id>'); process.exit(2); }
  const U = await import('../apps/studio-next/src/lib/recipe-board/houseusage.mjs');
  const m = U.houseUsage(cfg, project);
  const sum = U.houseUsageSummariesOf(m);
  console.log('  ' + U.houseUsageLine(m));
  console.log('  ' + sum.evidence);
  console.log('  ' + sum.seam);
  if (m.file) console.log('  ' + m.file);
  (m.flags || []).forEach((f) => console.log(`  ${f.level === 'fail' ? '✗' : '!'} [${f.code}] ${f.say}`));
} else {
  console.error('usage: recipe-board.mjs [run|brief|storyboard|render|status|compare|motion|medium|screen-capture|sequence|plan|reroute|materials|reject] [--project id] [--only P01,P07] [--force] [--serial] [--json]');
  process.exit(1);
}
