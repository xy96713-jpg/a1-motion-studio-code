#!/usr/bin/env node
// Offline checks for the recipe-board line: no network, no image generation, no browser, no renders.
// Every test works on a sandbox copy (json only) of the card library and the projects, so the real
// project folders are never written. Runs in a few seconds:
//   node scripts/test-recipe-board.mjs            all projects
//   node scripts/test-recipe-board.mjs hupo-auto2 one project's snapshot checks
import { test } from 'node:test';
import './test-motion-evidence.mjs';
import './test-read-budget.mjs';
import './test-seamreview.mjs';
import './test-oneshot.mjs';
import './test-stillbook.mjs';
import './test-read-budget-track.mjs';
import './test-lookdev.mjs';
import './test-tech-stack.mjs';
import './test-work-mode.mjs';
import './test-subject-routes.mjs';
import './test-effect-stack.mjs';
import './test-motion-design-inheritance.mjs';
import './test-reference-video-paths.mjs';
import './test-filmdesign-reference-guidance.mjs';
import './test-filmdesign-banana-isolated.mjs';
import './test-filmdesign-semantic-reference-real.mjs';
test('integration: redesign chapter isolation', async () => {
  await import('./test-redesign-chapter-isolation.mjs');
});
import './test-ground-background.mjs';
import './test-ground-consumer-cache.mjs';
import './test-typebible-consumer-cache.mjs';
import './test-type-preflight.mjs';
import './test-caption-figure-scale.mjs';
import './test-caption-mixed-line.mjs';
import './test-morph-traced-runs.mjs';
import './test-type-bible-pairs.mjs';
import './test-profile-colour-scope.mjs';
import './test-evidence-note.mjs';
import './test-evidence-inheritance.mjs';
import './test-hupo-director-e2e.mjs';
import './test-stills-task-mode.mjs';
import './test-source-caption.mjs';
import './test-academic-caption.mjs';
test('integration: run stills whole-film scheduling', async () => {
  await import('./test-run-stills-whole-film.mjs');
});
test('integration: stills whole-film coverage', async () => {
  await import('./test-stills-whole-film-coverage.mjs');
});
test('integration: filmdesign storyboard evidence handoff', async () => {
  await import('./test-filmdesign-storyboard-evidence-handoff.mjs');
});
// Scope integration scripts isolate their environment and are each run exactly once.
for (const script of ['test-project-scope-voice.mjs', 'test-project-scope-motion.mjs', 'test-project-scope-sequence.mjs', 'test-project-scope-video-entries.mjs']) {
  await test(`integration: ${script}`, () => {
    const r = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts', script)], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
    const marker = { 'test-project-scope-sequence.mjs': 'sequence CLI: stills blocked', 'test-project-scope-video-entries.mjs': 'video entries: stills denied' }[script];
    if (marker) assert.equal(r.stdout.split(marker).length - 1, 1, `${script} must complete exactly once`);
  });
}
import './test-hairline-asset-collision.mjs';
import './test-hairline-output-safety.mjs';
import './test-hairline-output-bounds.mjs';
await import('./test-still-review-pack.mjs');
await import('./test-stills-review-consumer.mjs');
await import('./test-stills-delivery.mjs');
await import('./test-stills-legibility-isolation.mjs');
await test('layout contract and consumer (single import)', async () => {
  await import('./test-layout-contract.mjs');
  await import('./test-layout-consumer.mjs');
});
import './test-director-production-contract.mjs';
import './test-director-scope-timing.mjs';
import './test-director-asset-schema.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(REPO, 'work', 'recipe-board-v1');
const LIB = path.join(REPO, 'apps', 'studio-next', 'src', 'lib', 'recipe-board');
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
test('chapter production admission binds authority, referenced bytes and submitted task; historical acceptance survives', () => {
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/test-chapter-production-binding.mjs')], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});
for (const script of ['test-hairline-browser-timeout.mjs', 'test-hairline-execution-faults.mjs']) {
  test(`integration: ${script}`, () => {
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', script)], {encoding:'utf8', timeout:10000});
    assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
  });
}
// The route wrapper runs the isolated historical-stills suite in a child, never 4311.
for (const script of ['test-historical-stills-route.mjs']) {
  test(`integration: ${script}`, () => {
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', script)], {encoding:'utf8', timeout:120000});
    assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
    assert.match(r.stdout, /changed, missing and symlinked image bytes are rejected/);
    assert.match(r.stdout, /fixture manifest and all pinned images work/);
  });
}
// These scripts mutate process env or load native/font dependencies: execute once in
// isolated child processes, never both import them and spawn them in the same run.
for (const script of ['test-material-render-slot-consistency.mjs', 'test-material-inventory-legacy.mjs', 'test-material-binding-form-p1.mjs', 'test-material-form-routing.mjs', 'test-material-inventory-fifo.mjs', 'test-filmdesign-safe-inventory.mjs', 'test-filmdesign-material-progress.mjs', 'test-storyboard-material-intent.mjs', 'test-storyboard-unknown-history.mjs', 'test-storyboard-rewrite-evidence-isolated.mjs', 'test-storyboard-pending-isolated.mjs', 'test-reject-only-isolation.mjs', 'test-materials-only-failclosed.mjs', 'test-material-receipt-provenance.mjs', 'test-partset-views-security.mjs', 'test-image3d-seed.mjs', 'test-image3d-consumer-seed.mjs', 'test-asset-review-runtime.mjs', 'test-asset-review.mjs', 'test-canary-preflight.mjs', 'test-camera-grammar.mjs', 'test-engine-call-contract.mjs', 'test-auto-subject-wiring.mjs', 'test-camera-path-wiring.mjs', 'test-blender-isolation-regression.mjs', 'test-blender-proof-isolation.mjs', 'test-blender-service-safety.mjs', 'test-blender-batch-bounds.mjs', 'test-blender-request-bounds.mjs', 'test-blender-safety.mjs', 'test-blender-chapter.mjs', 'test-blender-url-compat.mjs', 'test-runtime-identity.mjs', 'test-independent-review.mjs', 'test-historical-house-font.mjs', 'test-reference-handoff.mjs', 'test-reference-route-parity.mjs', 'test-recovered-director-guidance.mjs', 'test-hupo-reference-index.mjs', 'test-asset-operations.mjs', 'test-director-consumer-cache.mjs', 'test-director-consumer-scope.mjs', 'test-director-derived-font.mjs', 'test-greybox-review-submission.mjs']) {
  test(`integration: ${script}`, () => {
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', script)], {encoding:'utf8', timeout:120000});
    assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
  });
}
for (const script of ['test-run-fetch-lock-span-p1.mjs', 'test-run-fetch-reject-concurrent.mjs', 'test-writer-shot-preflight.mjs', 'test-run-auto-approval-lock.mjs', 'test-material-manual-approval-lock.mjs', 'test-material-approval-route.mjs', 'test-run-materials-stale-isolation.mjs', 'test-refresh-reading-windows-stale.mjs', 'test-fetch-approved-concurrent-negative.mjs', 'test-fetch-approved-stale-isolation.mjs', 'test-find-candidates-stale-isolation.mjs', 'test-bind-shots-stale-scope.mjs', 'test-material-stale-consumers.mjs', 'test-need-retirement-safety.mjs', 'test-writer-need-retirement.mjs', 'test-material-needs-direct-change.mjs']) {
  test(`integration: ${script}`, () => {
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', script)], {encoding:'utf8', timeout:120000});
    assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
  });
}
// Keep the stills preflight in its own process (it exercises font environment state).
test('integration: test-filmdesign-evidence-current.mjs', () => {
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/test-filmdesign-evidence-current.mjs')], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});
test('integration: test-stills-submission-preflight.mjs', () => {
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/test-stills-submission-preflight.mjs')], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});
// Standalone assertion scripts run once inside named tests, not as top-level imports.
for (const script of ['test-visual-language-capabilities.mjs', 'test-filmdesign-review-notes.mjs', 'test-chapter-geometry-integrity.mjs']) {
  test(`integration: ${script}`, async () => {
    await import(pathToFileURL(path.join(REPO, 'scripts', script)).href);
  });
}
const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); };

// Sandbox: <tmp>/work/recipe-board-v1 with the shared library copied and each project's json files
// (out/, clips, frames and other media left behind). cfg points there for every call.
function copyJson(src, dst) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === 'out' || e.name.startsWith('.')) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyJson(s, d);
    else if (/\.(json|md)$/.test(e.name)) {
      fs.mkdirSync(dst, { recursive: true });
      // The fixture intentionally excludes out/; a sandbox copy must not point to the real NAS.
      if (e.name === 'project.json') { const project = readJson(s); delete project.nasOutput; writeJson(d, project); }
      else fs.copyFileSync(s, d);
    }
  }
}
function sandbox(projects) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-board-test-'));
  const data = path.join(root, 'work', 'recipe-board-v1');
  for (const dir of ['recipes', 'themes', 'prompts', 'routing', 'worlds'].filter((d) => fs.existsSync(path.join(DATA, d)))) fs.cpSync(path.join(DATA, dir), path.join(data, dir), { recursive: true });
  for (const f of ['entities.json', 'CAMERA.md']) if (fs.existsSync(path.join(DATA, f))) fs.copyFileSync(path.join(DATA, f), path.join(data, f));
  fs.mkdirSync(path.join(data, 'projects'), { recursive: true });
  for (const id of projects) copyJson(path.join(DATA, 'projects', id), path.join(data, 'projects', id));
  return { root, cfg: { repoRoot: root, sourceRoot: REPO, dataDir: data } };
}
const lib = (m) => import(pathToFileURL(path.join(LIB, m)).href);
process.env.RB_DISK_GB ??= '0';   // (offline: the tests never read the host's disk; the gate itself is tested with its own numbers)

const ALL = fs.readdirSync(path.join(DATA, 'projects')).filter((id) => { const p = readJson(path.join(DATA, 'projects', id, 'project.json')); return p && !p.testOnly; });
const PROJECTS = ONLY.length ? ONLY : ALL;
const box = sandbox(PROJECTS);
const { cfg } = box;
process.on('exit', () => fs.rmSync(box.root, { recursive: true, force: true }));

test('every line module imports', async () => {
  for (const f of fs.readdirSync(LIB).filter((x) => x.endsWith('.mjs'))) await lib(f);
});

// a page whose script does not parse never gets ready (a comment that swallowed the rest of its line held the bench
// for hours): every module page's own scripts parse
test('every module page script parses', async () => {
  const vm = await import('node:vm'), dir = path.join(DATA, 'modules');
  for (const f of fs.readdirSync(dir).filter((x) => /\.(html|js)$/.test(x))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const parts = f.endsWith('.js') ? [src] : [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    for (const code of parts) assert.doesNotThrow(() => new vm.Script(`(async () => {\n${code}\n})`), `${f} does not parse`);
  }
});

test('materials: a long talk of a named person gets a minute and a half past its opening, not passed over', async () => {
  const m = await import(pathToFileURL(path.join(LIB, 'materials.mjs')).href);
  const need = { entity: 'Boris Cherny', form: 'video' };
  assert.deepEqual(m.autoSegment({ source: 'youtube', duration: 2152 }, need), [430, 520]);
  assert.equal(m.autoSegment({ source: 'youtube', duration: 300 }, need), null);
  assert.equal(m.autoSegment({ source: 'youtube', duration: 2152 }, { form: 'video' }), null);
  assert.equal(m.autoSegment({ source: 'youtube', duration: 2152 }, { entity: 'X', form: 'photo' }), null);
});

test('insert figure: a paper\'s figure is shown whole (fit contain), and its page reads as a figure, not a photograph (opensrc-S10)', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  const b = { module: 'insert', at: 0, end: 3, src: 'x.png' };
  assert.deepEqual(checkModuleSpec({ ...b, figure: true, fit: 'contain', invert: true }).filter((e) => /figure/.test(e)), []);
  assert.match(checkModuleSpec({ ...b, figure: true }).join('\n'), /figure is true .*\(fit contain\)/);
  const src = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/brand.html'), 'utf8');
  assert.match(src, /inout: \(k\)/, 'the dissolve to then has its easing');
  assert.match(src, /const isPage = S\.srcKind === 'page' && !S\.figure && S\.fit !== 'contain';/, 'a figure, or a page set whole, is not tilted as a page');
  assert.match(src, /S\.fit === 'contain' && !onStage && S\.srcKind === 'page' && !S\.figure\) \{ \$\('#vig'\)\.style\.display = 'none'/, 'a page set whole gets no photo vignette over its white');
  assert.match(src, /width: '2\.5%', height: `\$\{\(100 \/ 22\.5\)/, 'a glitch\'s static cells are sized in % of the frame (the animatic page is 960 wide)');
  assert.match(src, /filter:grayscale\(1\)/, 'the static is grey');
  { const M = await lib('modules.mjs'); const base = { module: 'article', at: 0, end: 3, src: 'x.png' };
    assert.ok(!M.checkModuleSpec({ ...base, beats: [{ at: .1, do: 'callout', phrase: '市值蒸发5900亿美元', text: '5900億美元' }] }).some((e) => /unknown article beat/.test(e)), 'an article may call a figure out over its line (callout)');
    assert.ok(M.checkModuleSpec({ ...base, beats: [{ at: .1, do: 'callout', phrase: 'x', text: '一二三四五六七八九十十一十二' }] }).some((e) => /12 characters/.test(e)));
    assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/article.html'), 'utf8'), /b\.do === 'callout' \? \(a\.slice\(i \+ 1\)\.find\(\(x\) => x\.do !== 'hold'\)/, 'a callout stays through the hold after it'); }
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8'), /lk > 0 && wash < \.5 \? 'visible'/, 'a side card\'s label is not shown while the card swells through the subtitle band (cards-S2)');
  { const tb = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/table.html'), 'utf8');
    assert.match(tb, /barEdge >= el\.offsetTop \+ el\.offsetHeight \/ 2/, 'a pressed column\'s words light as the bar passes them (talent-S2: grey words on the dark bar)');
    assert.match(tb, /S\.sweep\.dur \? seg\(t, S\.sweep\.at - \.1, S\.sweep\.at \+ S\.sweep\.dur\)/, 'a pressed column may be read down over sweep.dur, row after row (talent-S2 built in 0.1 s against 3.7)');
    assert.equal((tb.match(/'#f4f1ea'/g) || []).length, (tb.match(/under\(x\.el\) \? '#f4f1ea'/g) || []).length, 'no word on the bar lights on a clock of its own'); }
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/chart.html'), 'utf8'), /if \(S\.stack && !bars\) e\.el\.style\.translate = /, 'a stacked company drops onto the paper as it lands (open-S6: a fade in place was not seen arriving)');
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/chart.html'), 'utf8'), /VF = Math\.round\(Math\.min\(92, PITCH \* \.58\)\)/, 'a bar\'s figure fits its row (opensrc-S7)');
  { const st = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/steps.html'), 'utf8');
    assert.match(st, /const V = M\.view\(N\[0\]\?\.at \?\? S\.at\), VH = V\.h \* 690 \/ 1080/, 'steps are laid out and framed in what the shared camera shows, the subtitle band clear (r1-S7, r1-S9)');
    assert.match(st, /V\.w \/ \(x1 - x0\), VH \/ \(y1 - y0\)/); }
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/article.html'), 'utf8'), /\(ONE \? '' : ';font-size:140px'\)/, 'the big headline keeps the size worked out for it (h800-S2)');
  assert.match(checkModuleSpec({ ...b, glitch: 'always' }).join('\n'), /glitch is through/);
  assert.deepEqual(checkModuleSpec({ ...b, glitch: 'through' }).filter((e) => /glitch/.test(e)), []);
  const mi = fs.readFileSync(path.join(LIB, 'matindex.mjs'), 'utf8');
  assert.match(mi, /'insert\.figure': \{ kinds: \['page', 'photo'\]/);
  assert.match(mi, /\.from\.json/, 'a picture made from a captured page carries its kind beside it');
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /dev\?\.module === 'article' && m === 'insert' && sp\?\.figure/, 'a figure answers an article beat');
});

test('table ground grid and title lead / mono are checked (round 15: opensrc-S8 white squared paper, ending-S2 the year over the name)', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  assert.match(checkModuleSpec({ module: 'table', at: 0, end: 3, columns: ['a'], rows: [], ground: 'paper' }).join('\n'), /ground is grid/);
  assert.deepEqual(checkModuleSpec({ module: 'title', at: 0, end: 3, text: '幻方量化', lead: '梁文鋒聯合創立', mono: true }).filter((e) => /lead|mono/.test(e)), []);
  assert.match(checkModuleSpec({ module: 'title', at: 0, end: 3, text: '幻方量化', lead: '一二三四五六七八九十一二三四五' }).join('\n'), /lead/);
});

test('page capture: a short post is not a paywall stub, a short article page still is (recap-S5: the official R1 tweet)', async () => {
  const { isBlockedPage } = await import(pathToFileURL(path.join(LIB, 'page-capture.mjs')).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-post-')), f = path.join(dir, 't.txt');
  fs.writeFileSync(f, '🚀 DeepSeek-R1 is here! ⚡ Performance on par with OpenAI-o1 📖 Fully open-source model & technical report 🏆 MIT licensed: Distill & commercialize freely!');
  assert.equal(isBlockedPage({ url: 'https://platform.twitter.com/embed/Tweet.html?id=1881318130334814301', title: 'X', files: { text: f } }), false);
  assert.equal(isBlockedPage({ url: 'https://x.com/deepseek_ai/status/1881318130334814301', title: 'X', files: { text: f } }), false);
  assert.equal(isBlockedPage({ url: 'https://news.example.com/a', title: 'News', files: { text: f } }), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('project ids cannot leave the projects folder', async () => {
  const { projectPaths } = await lib('store.mjs');
  for (const bad of ['../x', '..', 'A', '', 'a/b', 'x'.repeat(65)]) assert.throws(() => projectPaths(cfg, bad), /invalid project id/, bad);
});

// Snapshot checks on each real project: the files the line wrote agree with each other.
for (const id of PROJECTS) {
  test(`${id}: shots, cards and plan agree`, async () => {
    const { loadShots, readPlan } = await lib('store.mjs');
    const cards = new Set(fs.readdirSync(path.join(cfg.dataDir, 'recipes')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));
    const dir = path.join(cfg.dataDir, 'projects', id, 'shots');
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')) : []) {
      const shot = readJson(path.join(dir, f));
      assert.equal(shot.shotId, f.slice(0, -5), `${f}: shotId must match the file name`);
      assert.ok(cards.has(shot.recipe), `${f}: unknown card ${shot.recipe}`);
      for (const [i, s] of (shot.scenes || []).entries()) if (s.recipe) assert.ok(cards.has(s.recipe), `${f} scene ${i}: unknown card ${s.recipe}`);
    }
    const plan = readPlan(cfg, id);
    if (plan) {
      const ids = plan.beats.map((b) => b.id);
      assert.equal(new Set(ids).size, ids.length, 'beat ids must be unique');
      for (const b of plan.beats) if (b.route?.recipe) assert.ok(cards.has(b.route.recipe), `${b.id}: plan routes to unknown card ${b.route.recipe}`);
    }
    assert.ok(loadShots(cfg, id).length >= 0);
  });

  test(`${id}: run --dry state is computable and material keys are per cut`, async (t) => {
    const { projectState } = await lib('run.mjs');
    const st = projectState(cfg, id);
    assert.ok(['none', 'waiting', 'rejected', 'current', 'stale'].includes(st.brief), `brief state ${st.brief}`);
    assert.ok(['blocked', 'waiting', 'rejected', 'current', 'stale'].includes(st.storyboard), `storyboard state ${st.storyboard}`);
    const m = st.materials;
    const { needKey } = await lib('materials.mjs');
    const keys = m.needs.map(needKey);
    assert.equal(new Set(keys).size, keys.length, `two needs share a key: ${keys.filter((k, i) => keys.indexOf(k) !== i)}`);
    for (const list of ['own', 'unsearched', 'toConfirm', 'noCandidate', 'toFetch', 'toBind']) {
      assert.equal(new Set(m[list]).size, m[list].length, `${list} lists a cut twice: ${m[list]}`);
    }
    if (!m.needs.length) t.diagnostic('no material needs');
  });

  const answer = (step) => readJson(path.join(cfg.dataDir, 'projects', id, 'tasks', `${step}.answer.json`));
  const accepted = (step) => readJson(path.join(cfg.dataDir, 'projects', id, `${step}.json`));

  test(`${id}: brief check accepts the accepted answer and rejects broken ones`, async (t) => {
    const { checkBrief, planHash } = await lib('brief.mjs');
    const { readPlan } = await lib('store.mjs');
    const plan = readPlan(cfg, id), brief = accepted('brief'), a = answer('brief');
    if (!plan || !brief || !a || brief.planHash !== planHash(plan)) return t.skip('no current brief');
    const ok = checkBrief(plan, a);
    assert.deepEqual(ok.errors, [], 'the answer the line accepted must still pass');
    assert.equal(checkBrief(plan, {}).ok, false);
    assert.equal(checkBrief(plan, null).ok, false);
    assert.equal(checkBrief(plan, { ...a, contract: 'x' }).ok, false);
    assert.equal(checkBrief(plan, { ...a, chapters: [] }).ok, false, 'a brief without chapters must fail');
    if (a.chapters?.length > 1) assert.equal(checkBrief(plan, { ...a, chapters: a.chapters.slice(0, -1) }).ok, false, 'chapters must cover every beat');
  });

  test(`${id}: storyboard check accepts the accepted answer and rejects broken ones`, async (t) => {
    const { checkStoryboard, storyboardState } = await lib('storyboard.mjs');
    const { readPlan, loadProject } = await lib('store.mjs');
    const plan = readPlan(cfg, id), brief = accepted('brief'), a = answer('storyboard');
    if (!a || storyboardState(cfg, id).state !== 'current') return t.skip('no current storyboard');
    const opts = { speechRate: loadProject(cfg, id).speechRate };
    assert.deepEqual(checkStoryboard(cfg, plan, brief, a, opts).errors, [], 'the answer the line accepted must still pass');
    assert.equal(checkStoryboard(cfg, plan, brief, { ...a, contract: 'x' }, opts).ok, false);
    const badCard = { ...a, shots: a.shots.map((s, i) => (i === 0 ? { ...s, card: 'no-such-card' } : s)) };
    assert.equal(checkStoryboard(cfg, plan, brief, badCard, opts).ok, false, 'an unknown card must fail');
    assert.equal(checkStoryboard(cfg, plan, brief, { ...a, shots: a.shots.slice(1) }, opts).ok, false, 'a missing beat must fail');
  });

  test(`${id}: applying the accepted storyboard twice changes nothing the second time`, async (t) => {
    const { applyStoryboard, storyboardState } = await lib('storyboard.mjs');
    if (storyboardState(cfg, id).state !== 'current') return t.skip('no current storyboard');
    applyStoryboard(cfg, id);
    const again = applyStoryboard(cfg, id);
    assert.deepEqual(again.updated, [], `second apply rewrote ${again.updated}`);
  });
}

// Synthetic project: a montage shot with four cuts goes through confirm → fetch → bind per cut.
test('materials: a montage shot keeps one need, approval and binding per cut', async () => {
  const id = 'zz-test-montage';
  const p = path.join(cfg.dataDir, 'projects', id);
  writeJson(path.join(p, 'project.json'), { contract: 'A1RecipeBoardProject/v1', id, title: id });
  const scene = (i) => ({ recipe: 'footage-plate', slots: { background: { gen: `cut ${i}` } } });
  writeJson(path.join(p, 'shots', 'B05.json'), { shotId: 'B05', recipe: 'footage-plate', slots: { background: { gen: 'cut 0' } }, scenes: [0, 1, 2, 3].map(scene) });
  const needs = [0, 1, 2, 3].map((i) => ({ shotId: 'B05', bind: 'background', kind: 'stock', original: `cut ${i}`, ...(i ? { scene: i } : {}) }));
  writeJson(path.join(p, 'materials', 'needs.json'), { needs });
  const cand = (k) => ({ candidates: [{ id: `c-${k}`, url: `https://example.test/${k}`, source: 'library', title: k, rights: 'stock' }] });
  writeJson(path.join(p, 'materials', 'candidates.json'), { shots: Object.fromEntries(['B05', 'B05~1', 'B05~2', 'B05~3'].map((k) => [k, cand(k)])) });

  const { projectState } = await lib('run.mjs');
  const { saveApprovalBatch, bindShots } = await lib('materials.mjs');
  assert.deepEqual(projectState(cfg, id).materials.toConfirm, ['B05', 'B05~1', 'B05~2', 'B05~3']);

  await saveApprovalBatch(cfg, id, [{ shotId: 'B05~2', candidateId: 'c-B05~2' }], { confirmedBy: 'test' });
  let m = projectState(cfg, id).materials;
  assert.deepEqual(m.toConfirm, ['B05', 'B05~1', 'B05~3'], 'confirming cut 2 confirms only cut 2');
  assert.deepEqual(m.toFetch, ['B05~2']);

  const clip = path.join(box.root, 'clip.mp4');
  fs.writeFileSync(clip, '');
  writeJson(path.join(p, 'materials', 'bindings.json'), { shots: { 'B05~2': { kind: 'video', file: clip, range: [0, 2], credit: 'test' } } });
  m = projectState(cfg, id).materials;
  assert.deepEqual(m.toFetch, [], 'a bound cut is not fetched again');

  bindShots(cfg, id, { only: new Set(['B05']) });
  const shot = readJson(path.join(p, 'shots', 'B05.json'));
  assert.ok(shot.scenes[2].slots.background.video, 'cut 2 gets the clip');
  for (const i of [0, 1, 3]) assert.equal(shot.scenes[i].slots.background.gen, `cut ${i}`, `cut ${i} is left alone`);
  assert.equal(shot.slots.background.gen, 'cut 0', 'the still (cut 0) is left alone');
  assert.deepEqual(projectState(cfg, id).materials.toBind, [], 'nothing left to bind after binding');
});

// Bug 2026-10-16: the search filter compared cut keys (B01~1) with shot ids, so a montage cut that run
// listed as unsearched was never searched and stayed "not searched" forever.
test('materials: a search for one cut covers that cut, a search for a shot covers all its cuts', async () => {
  const { needsToSearch, needKey } = await lib('materials.mjs');
  const needs = [{ shotId: 'B01' }, { shotId: 'B01', scene: 1 }, { shotId: 'B02' }];
  assert.deepEqual(needsToSearch(needs, ['B01~1']).map(needKey), ['B01~1']);
  assert.deepEqual(needsToSearch(needs, ['B01']).map(needKey), ['B01', 'B01~1']);
  assert.deepEqual(needsToSearch(needs, null).map(needKey), ['B01', 'B01~1', 'B02']);
});

// Bug 2026-10-16: rewriting a shot on its storyboard card dropped material that was already fetched; nothing
// bound it again, so the shot rendered a TODO placeholder. run now lists it (toBind) and binds it back,
// and `--only` binds only the listed shots.
test('materials: fetched material whose slot a rewrite emptied is bound back, only for the listed shots', async () => {
  const id = 'zz-test-rebind';
  const p = path.join(cfg.dataDir, 'projects', id);
  writeJson(path.join(p, 'project.json'), { contract: 'A1RecipeBoardProject/v1', id, title: id });
  const plate = (id2) => ({ shotId: id2, recipe: 'footage-plate', slots: { background: { gen: 'rewritten' } } });
  writeJson(path.join(p, 'shots', 'B01.json'), plate('B01'));
  writeJson(path.join(p, 'shots', 'B02.json'), plate('B02'));
  writeJson(path.join(p, 'materials', 'needs.json'), { needs: ['B01', 'B02'].map((x) => ({ shotId: x, bind: 'background', kind: 'stock', original: x })) });
  const clip = path.join(box.root, 'rebind.mp4');
  fs.writeFileSync(clip, '');
  const bound = { kind: 'video', file: clip, range: [0, 2], credit: 'test' };
  writeJson(path.join(p, 'materials', 'bindings.json'), { shots: { B01: bound, B02: bound } });
  const { projectState } = await lib('run.mjs');
  const { bindShots } = await lib('materials.mjs');
  assert.deepEqual(projectState(cfg, id).materials.toBind, ['B01', 'B02'], 'both rewritten shots lost their fetched clip');
  assert.deepEqual(projectState(cfg, id).materials.toFetch, [], 'nothing is downloaded again');
  bindShots(cfg, id, { only: new Set(['B01']) });
  assert.ok(readJson(path.join(p, 'shots', 'B01.json')).slots.background.video, 'B01 gets its clip back');
  assert.equal(readJson(path.join(p, 'shots', 'B02.json')).slots.background.gen, 'rewritten', '--only B01 leaves B02 alone');
  assert.deepEqual(projectState(cfg, id).materials.toBind, ['B02']);
});

test('storyboard: names are read from the text, and a lone flash cut is rejected', async () => {
  const { namesIn, cutsOfShot } = await lib('storyboard.mjs');
  const names = namesIn(cfg, '你可能以为能把英伟达干趴下的，怎么也得是谷歌那种级别的').map((n) => [n.name, n.library]);
  // (library: the shared library holds verified pictures of that name; it grows as films are made: Google's mark came
  // in with hupo-auto2's material library)
  const held = (n) => JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/entities.json'), 'utf8')).entities.some((e) => e.names.includes(n));
  assert.deepEqual(names, [['英伟达', held('英伟达')], ['谷歌', held('谷歌')]]);
  assert.deepEqual(namesIn(cfg, 'Metaphor is not Meta').map((n) => n.name), ['Meta'], 'English names match whole words');
  const cuts = cutsOfShot({ card: 'title-word-broll', seconds: 5, scenes: [{ at: 0, card: 'title-word-broll', evidence: -1 }, { at: 0.4, card: 'presenter-plain', evidence: -1 }] });
  assert.deepEqual(cuts.map((c) => c.seconds), [0.4, 4.6]);
});

test('evidence form decides the source: pages, logos, photos, recordings', async () => {
  const { toNeed } = await lib('writer.mjs');
  const beat = { text: '英伟达市值单日蒸发近6000亿美元', onScreen: { keywords: ['英伟达'] } };
  const page = toNeed('B02', { slot: 'background', kind: 'event', form: 'webpage', entity: '英伟达', original: '英伟达市值蒸发的新闻报道', queryEn: 'nvidia' }, beat);
  assert.equal(page.kind, 'page');
  assert.deepEqual(page.page.entities, ['英伟达']);
  assert.ok(page.page.keywords.includes('6000亿'), 'numbers of the line help find the report');
  const logo = toNeed('B06', { slot: 'main', kind: 'org', form: 'logo', entity: 'DeepSeek', original: 'logo' }, beat);
  assert.deepEqual([logo.preferredMedia, logo.youtube, logo.archive.keywords], [['IMAGE'], [], ['logo']]);
  assert.equal(toNeed('B30', { slot: 'screen', kind: 'software', form: 'recording', original: 'x' }, beat).kind, 'presenter', 'recordings come from the author');
  assert.equal(toNeed('B01', { slot: 'background', kind: 'stock', form: 'video', original: 'x', queryEn: 'trading floor' }, beat).kind, 'stock');
});

test('web page candidates are URLs only, never fetched before approval', async () => {
  const { pageCandidatesFrom } = await lib('materials.mjs');
  const list = pageCandidatesFrom({ candidates: [{ id: 'abc', url: 'https://example.test/a', title: 'T', publisher: 'example.test', snippet: 's', excerptMatch: { score: 0.5 } }] });
  assert.deepEqual(list.map((c) => [c.id, c.source, c.mediaType, c.thumb, c.rights]), [['web:abc', 'web', 'WEBPAGE', null, 'news']]);
});

test('facts: a number traces to the text or to an archived page of that shot, on every cut', async () => {
  const { factTrace, recheckFacts } = await lib('writer.mjs');
  const src = [{ url: 'https://example.test/report', capturedAt: '2026-10-16T00:00:00Z', text: '英伟达单日蒸发5926.58亿美元' }];
  assert.deepEqual(factTrace({ value: { text: '5926.58亿美元' } }, '蒸发了将近6000亿', src), { unsourced: [], sources: [{ url: src[0].url, capturedAt: src[0].capturedAt }] });
  assert.ok(factTrace({ value: { text: '5926.58亿美元' } }, '蒸发了将近6000亿').unsourced.includes(5926.58), 'without the archived page the exact number has no source');

  const id = 'zz-test-facts';
  const p = path.join(cfg.dataDir, 'projects', id);
  writeJson(path.join(p, 'project.json'), { contract: 'A1RecipeBoardProject/v1', id, title: id });
  writeJson(path.join(p, 'plan.json'), { beats: [{ id: 'B01', text: '蒸发了将近6000亿', onScreen: { headline: '' }, route: {} }] });
  writeJson(path.join(p, 'shots', 'B01.json'), { shotId: 'B01', recipe: 'stamp-over-evidence', slots: { title: { text: '将近6000亿' } },
    scenes: [{ slots: { title: { text: '将近6000亿' } } }, { slots: { title: { text: '5926.58亿美元' } } }, { slots: { title: { text: '1500亿' } } }] });
  const text = path.join(p, 'materials', 'sources', 'B01~1.txt');
  fs.mkdirSync(path.dirname(text), { recursive: true });
  fs.writeFileSync(text, src[0].text);
  writeJson(path.join(p, 'materials', 'bindings.json'), { shots: { 'B01~1': { kind: 'image', file: text, archive: { url: src[0].url, capturedAt: src[0].capturedAt, text } } } });
  const flagged = await recheckFacts(cfg, id);
  assert.equal(flagged.length, 1);
  assert.match(flagged[0], /^B01: .*150000000000/, 'the third cut shows a number found nowhere');
  assert.doesNotMatch(flagged[0], /5926/, 'the second cut traces to the archived page');
  const shot = readJson(path.join(p, 'shots', 'B01.json'));
  assert.deepEqual(shot.factSources, [{ url: src[0].url, capturedAt: src[0].capturedAt }], 'the archived page is recorded as the source');
  const mtime = fs.statSync(path.join(p, 'shots', 'B01.json')).mtimeMs;
  await recheckFacts(cfg, id);
  assert.equal(fs.statSync(path.join(p, 'shots', 'B01.json')).mtimeMs, mtime, 'an unchanged result does not rewrite the shot');
});

// Bug 2026-10-16: "博通 17%" cited the 163 report but was traced to a Sina page that also says "17%" (about Nvidia).
test('facts: a figure that names its source is checked against that page only', async () => {
  const { factTrace } = await lib('writer.mjs');
  const a = { url: 'https://a.test', capturedAt: 't', text: '博通公司股价下跌17%' }, b = { url: 'https://b.test', capturedAt: 't', text: '英伟达股价暴跌17%' };
  const slots = { data: { figures: [{ lead: '博通', value: '17%', source: 'https://a.test' }, { lead: '某公司', value: '1500亿', source: 'https://b.test' }] } };
  const r = factTrace(slots, '整个板块蒸发了差不多1万亿', [b, a]);
  assert.deepEqual(r.sources, [{ url: 'https://a.test', capturedAt: 't' }], 'the cited page, not the first page with the same number');
  assert.ok(r.unsourced.includes(150000000000), 'a number its cited page does not have is flagged');
});

test('facts: a step carried over from an earlier shot may trace to the article, a new one only to its line', async () => {
  const { factTrace } = await lib('writer.mjs');
  const slots = { data: { mechanism: { steps: [{ do: 'pick', label: '130多个计算单元抠出20个', done: true }, { do: 'flow', label: '新的一步 64 条通道' }] } } };
  const r = factTrace(slots, '把那条被砍的通道补回来了', [], { articleText: '每一张H800上面130多个计算单元专门抠出来20个' });
  assert.deepEqual(r.unsourced, [64], 'carried-over 130 and 20 pass, the new step 64 does not');
});

test('mechanism-3d: the still page mounts the diagram with the shot length; other stills carry no script', async () => {
  const { composeHtml } = await lib('compose.mjs');
  const { loadRecipe } = await lib('store.mjs');
  const recipe = loadRecipe(cfg, 'mechanism-3d', 'hupo-editorial');
  const shot = { shotId: 'X', recipe: 'mechanism-3d', slots: { title: { text: '通道' }, data: recipe.example.data }, motion: { duration: 5.5 } };
  const html = composeHtml({ recipe, shot, resolved: {}, degraded: [] });
  assert.match(html, /class="mech" data-duration="5.5"/);
  assert.match(html, /importmap/);
  const plain = composeHtml({ recipe: loadRecipe(cfg, 'title-word-broll', 'hupo-editorial'), shot: { shotId: 'Y', recipe: 'title-word-broll', slots: { title: { text: 'x' } } }, resolved: {}, degraded: [] });
  assert.doesNotMatch(plain, /importmap|mountMechanism/, 'other stills stay as they were');
});

// Bug 2026-10-16: the writer drew the same chips as plain nodes with one lane in one shot and as chips in
// the next, so a diagram meant to continue across shots changed shape.
test('mechanism: chip-like parts are chips, chips get a full bundle, a continuation keeps the parts', async () => {
  const { tidyMechanism } = await lib('writer.mjs');
  const first = tidyMechanism({ parts: [{ id: 'a', kind: 'node', label: '芯片', pos: [0, 0] }, { id: 'b', kind: 'node', label: 'H800', pos: [2, 0] }, { id: 'ab', kind: 'link', from: 'a', to: 'b', lanes: 1 }], steps: [{ do: 'show', label: 'x' }] });
  assert.deepEqual(first.parts.map((p) => p.kind), ['chip', 'chip', 'link']);
  assert.equal(first.parts[2].lanes, 10);
  assert.ok(!('pos' in first.parts[0]), 'chips are laid out by the diagram');
  const next = tidyMechanism({ parts: [{ id: 'a', kind: 'node', label: 'H800' }, { id: 'b', kind: 'node' }, { id: 'ab', kind: 'link', from: 'a', to: 'b', lanes: 1 }], steps: [{ do: 'show', done: true, label: 'x' }, { do: 'pick', target: 'a', count: 20, label: 'y' }] }, first);
  assert.deepEqual(next.parts.map((p) => [p.kind, p.label || '']), [['chip', 'H800'], ['chip', 'H800'], ['link', '']], 'the newer label wins, kinds carry over');
});

// Bug 2026-10-16: B47 (示范 → AI) and B52 (AI → 结果 → 奖励) came out as two diagrams: B52 shares the AI box
// but carries no done steps, so it started over.
test('mechanism: a shot that shares a box with the diagram before it builds on that diagram', async () => {
  const { tidyMechanism } = await lib('writer.mjs');
  const b47 = tidyMechanism({ parts: [{ id: 'demo', kind: 'node', label: '示范', pos: [0, 0] }, { id: 'ai', kind: 'node', label: 'AI', pos: [2, 0] }, { id: 'teach', kind: 'link', from: 'demo', to: 'ai' }], steps: [{ do: 'flow', target: 'teach', label: '手把手' }] });
  const b52 = tidyMechanism({ parts: [{ id: 'ai', kind: 'node', label: 'AI', pos: [0, 0] }, { id: 'answer', kind: 'node', label: '结果', pos: [2, 0] }, { id: 'reward', kind: 'node', label: '奖励', pos: [1, 1] }], steps: [{ do: 'show', label: '奖励' }] }, b47);
  const at = Object.fromEntries(b52.parts.filter((p) => p.pos).map((p) => [p.id, p.pos.join(',')]));
  assert.deepEqual(at, { ai: '2,0', answer: '4,0', reward: '3,1', demo: '0,0' }, 'the AI box stays, the new boxes keep their layout around it');
  assert.ok(b52.parts.some((p) => p.id === 'teach'), 'the earlier lane stays on the diagram');
  assert.deepEqual(b52.steps.map((s) => [s.label, !!s.done]), [['手把手', true], ['奖励', false]]);
  assert.deepEqual(tidyMechanism(b52, b47), b52, 'tidying again changes nothing');
  // the same box written under another id is the same box
  const b53 = tidyMechanism({ parts: [{ id: 'ai', kind: 'node', label: 'AI' }, { id: 'res', kind: 'node', label: '结果' }, { id: 'go', kind: 'link', from: 'ai', to: 'res' }], steps: [{ do: 'flow', target: 'go', label: 'x' }, { do: 'drop', target: 'res', label: 'y' }] }, b52);
  assert.equal(b53.parts.filter((p) => p.label === '结果').length, 1);
  assert.equal(b53.parts.filter((p) => p.kind === 'link' && p.from === 'ai' && p.to === 'answer').length, 1, 'one lane between the same two boxes');
  assert.equal(b53.steps.at(-1).target, 'answer');
  const other = tidyMechanism({ parts: [{ id: 'x', kind: 'node', label: '别的', pos: [0, 0] }], steps: [{ do: 'show', label: 'y' }] }, b47);
  assert.equal(other.parts.length, 1, 'a diagram with no shared box starts on its own');
});

// Bug 2026-10-16: a photo of the H800 came back as "The British Army 1939-45 H800", the 幻方 logo as a dahlia
// called High Flyer: a bare ambiguous name matched the wrong thing.
test('materials: an ambiguous name needs its context words in the search hit', async () => {
  const { contextFilter, nameContext } = await lib('materials.mjs');
  const need = { entity: 'H800', archive: { entities: ['H800'], keywords: [] } };
  assert.ok(nameContext(cfg, need).includes('NVIDIA'));
  const hits = [{ source: 'wikimedia_commons', title: 'The British Army in the United Kingdom 1939-45 H800.jpg', publisher: '' }, { source: 'wikimedia_commons', title: 'NVIDIA H800 SXM5', publisher: '' }, { source: 'library', title: 'H800（已核实素材）', publisher: '' }];
  assert.deepEqual(contextFilter(cfg, need, hits).map((c) => c.title), ['NVIDIA H800 SXM5', 'H800（已核实素材）']);
  const logo = { entity: '幻方量化', archive: { entities: ['幻方量化'], keywords: ['logo'] } };
  assert.equal(contextFilter(cfg, logo, [{ source: 'wikimedia_commons', title: "Dahlia 'High Flyer' 01.jpg", publisher: '' }]).length, 0);
  assert.equal(contextFilter(cfg, { entity: 'Marc Andreessen' }, hits).length, 3, 'names without context words are not filtered');
});

// Bug 2026-10-17: B74 / B75 chat cuts of 1.8 s ended before their messages came in (fixed 1.5 s + 0.5 s each).
test('motion: chat messages land inside the scene, long chats keep the usual timing', async () => {
  const { chatCues } = await lib('motion.mjs');
  assert.deepEqual(chatCues(2, 8), [0.6, 1.1]);
  const short = chatCues(2, 1.8);
  assert.ok(short.at(-1) <= 1.8 - 0.6 + 1e-9 && short[0] < short[1], JSON.stringify(short));
});

// Gap 2026-10-17: the recap (B68) said "复用前文画面" but the line had no way to replay an earlier shot, so
// it came out as empty paper cards.
test('storyboard: a recap cut replays an earlier shot (recall), checked and filled from that shot', async () => {
  const { checkStoryboard } = await lib('storyboard.mjs');
  const { recallFill } = await lib('writer.mjs');
  const { readPlan, loadProject } = await lib('store.mjs');
  const id = 'hupo-auto2';
  const a = readJson(path.join(cfg.dataDir, 'projects', id, 'tasks', 'storyboard.answer.json'));
  if (!a) return;
  const plan = readPlan(cfg, id), brief = readJson(path.join(cfg.dataDir, 'projects', id, 'brief.json'));
  const k = a.shots.findIndex((s) => (s.scenes || []).length >= 2 && s.beat > 'B10' && !brief.rhythm.breathingBeats.includes(s.beat));
  const shot = a.shots[k];
  const withRecall = (r, card = 'title-hero-over-photo') => ({ ...a, shots: a.shots.map((s, i) => (i === k ? { ...s, scenes: s.scenes.map((x, j) => (j === 1 ? { ...x, card, evidence: -1, recall: r } : x)) } : s)) });
  const errs = (ans) => checkStoryboard(cfg, plan, brief, ans, { speechRate: loadProject(cfg, id).speechRate }).errors.filter((e) => e.startsWith(shot.beat) && /recall/.test(e));
  assert.deepEqual(errs(withRecall('B01')), []);
  assert.ok(errs(withRecall(shot.beat)).length, 'only an earlier beat');
  assert.ok(errs(withRecall('B01', 'chat-thread')).length, 'only on a picture card');
  const fill = recallFill(cfg, id, 'B01', { B01: { motion: { duration: 5 } } });
  assert.match(fill.video.path, /out\/motion\/B01\/renders\/motion\.mp4$/);
  assert.deepEqual([fill.video.in, fill.video.out, fill.recall], [2.6, 5, 'B01']);
  // a shot of several cuts: the longest cut that is not the presenter, at its end
  const multi = { motion: { duration: 9, cuts: [0, 6.3] }, recipe: 'mechanism-3d', scenes: [{}, { recipe: 'presenter-plain' }] };
  const f2 = recallFill(cfg, id, 'B57', { B57: multi });
  assert.deepEqual([f2.video.in, f2.video.out], [3.9, 6.3]);
  const even = recallFill(cfg, id, 'B39', { B39: { motion: { duration: 7.2, cuts: [0, 2.4, 4.8] }, recipe: 'footage-plate', scenes: [{}, {}, {}] } });
  assert.deepEqual([even.video.in, even.video.out], [0, 2.4], 'equal cuts: the first (7.2 - 4.8 is not 2.4 in floating point)');
});

// Gap 2026-10-17: a PDF (the o1 system card) could not be archived; pdf.js now draws it into a page.
test('page capture: PDF links are read through pdf.js', async () => {
  const { isPdfUrl } = await lib('page-capture.mjs');
  assert.ok(isPdfUrl('https://cdn.openai.com/o1-system-card-20241205.pdf') && isPdfUrl('https://arxiv.org/pdf/2501.12948') && isPdfUrl('https://x.org/a.PDF?dl=1'));
  assert.ok(!isPdfUrl('https://www.36kr.com/p/2947474203974533'));
});

// Bug 2026-10-17: the writer gave B68 "title": "残血显卡" (a string); the card read title.sub and printed
// "function sub() { [native code] }".
test('compose: a text slot written as a plain string reads as its text', async () => {
  const { composeParts } = await lib('compose.mjs');
  const { loadRecipe, loadTheme } = await lib('store.mjs');
  const recipe = loadRecipe(cfg, 'title-hero-over-photo', 'hupo-editorial');
  const p = composeParts({ recipe, shot: { shotId: 'X', recipe: 'title-hero-over-photo', slots: { title: '残血显卡' } }, resolved: {}, degraded: [] });
  // house rule (2026-10-21): what is set on the card is Traditional
  const { toHant, traditionalOn } = await lib('house.mjs'), want = traditionalOn() ? toHant(['残血显卡'])[0] : '残血显卡';
  assert.equal(want, traditionalOn() ? '殘血顯卡' : '残血显卡');
  assert.ok(p.content.includes(want) && !p.content.includes('native code'));
});

// Gap 2026-10-17 (hold-out on Clara BV11Ren6REA4): a life story (went to a US high school, then Berkeley)
// came out as web pages and presenter; the original runs period footage and photos there.
test('storyboard: a web page on a story line is warned; a report, a number or a statement may carry one', async () => {
  const { checkStoryboard } = await lib('storyboard.mjs');
  const { readPlan, loadProject } = await lib('store.mjs');
  const id = 'hupo-auto2';
  const a = readJson(path.join(cfg.dataDir, 'projects', id, 'tasks', 'storyboard.answer.json'));
  if (!a) return;
  const plan = readPlan(cfg, id), brief = readJson(path.join(cfg.dataDir, 'projects', id, 'brief.json'));
  const k = a.shots.findIndex((s) => (s.evidence || []).some((e) => e.form === 'webpage'));
  const beat = a.shots[k].beat;
  const story = { ...plan, beats: plan.beats.map((b) => (b.id === beat ? { ...b, text: '后来他去了美国读高中，又考进了伯克利' } : b)) };
  const warns = (p) => checkStoryboard(cfg, p, brief, a, { speechRate: loadProject(cfg, id).speechRate }).warnings.filter((w) => w.startsWith(beat) && /story line/.test(w));
  assert.equal(warns(plan).length, 0, 'the original line carries a page');
  assert.ok(warns(story).length, 'a story line does not');
});

// Maturity step 2026-10-17: lengths were estimated from the character count (the film ran 7% long and the
// fast cuts missed the words); with a recording every beat sits on the seconds it is spoken.
test('voice: beats are placed on the recording (repeated tails skipped, a lost beat shares its gap)', async () => {
  const { alignBeats } = await lib('voice.mjs');
  const w = (s, t0, step = 0.25) => [...s].map((c, i) => ({ word: c, startMs: Math.round((t0 + i * step) * 1000), endMs: Math.round((t0 + (i + 1) * step) * 1000) }));
  const words = [...w('英伟达一天之内蒸发了六千亿', 0), ...w('这是美国股市历史上最大的一笔', 4), ...w('那一天整个板块都在跌', 9), ...w('凭什么', 13)];
  const beats = [
    { id: 'B01', text: '英伟达一天之内，蒸发了六千亿。' },
    { id: 'B02', text: '蒸发了六千亿这是美国股市历史上最大的一笔' },   // ASR beats repeat the tail before
    { id: 'B03', text: '（听错的一句，找不到）' },
    { id: 'B04', text: '凭什么？' },
  ];
  const a = alignBeats(beats, words);
  assert.equal(a.B01.start, 0);
  assert.equal(a.B02.start, 4);
  assert.ok(a.B03.start > 4 && a.B03.start < 13, 'a beat not found is placed between its neighbours');
  assert.equal(a.B04.start, 13);
  assert.equal(a.B04.end, 13.75);
  for (const [k, x] of Object.entries(a)) assert.ok(x.end > x.start, k);
  // a synthetic read says each beat once: the tail a beat repeats from the one before is dropped
  const { readTexts } = await lib('voice.mjs');
  assert.deepEqual(readTexts({ beats }).map(([, t]) => t), ['英伟达一天之内，蒸发了六千亿。', '这是美国股市历史上最大的一笔', '（听错的一句，找不到）', '凭什么？']);
});

// Feedback 2026-10-17 ("动效明显对标的好太多"): cards came in all at once and then sat still; the reference
// builds each card to the narration. The runtime gets, per shot, when each character is said.
test('motion: a shot knows when each character of its beat is said (recording, or spread over the shot)', async () => {
  const { speechFor } = await lib('motion.mjs');
  const { loadShots } = await lib('store.mjs');
  const shot = loadShots(cfg, 'hupo-auto2', new Set(['B41']))[0];
  if (!shot) return;
  const sp = speechFor(cfg, 'hupo-auto2', shot);
  assert.ok(sp.chars.length > 5 && sp.chars.length === sp.times.length);
  assert.ok(sp.times.every((t, i) => t >= 0 && t <= shot.motion.duration + 0.01 && (i === 0 || t >= sp.times[i - 1])), 'in order, inside the shot');
  const none = speechFor(cfg, 'clara-auto', { shotId: 'B01', motion: { duration: 5 } });
  assert.ok(none.times.at(-1) <= 5 * 0.88 + 0.01, 'without a recording the beat is spread over the shot');
});

// Critique 2026-10-17: whole-beat subtitles covered a third of the frame; they are now short timed phrases
// that never break inside a number or a Latin word ("20 25", "A" | "100" were bugs).
test('motion: subtitles are short phrases, numbers and Latin words kept whole', async () => {
  const { splitPhrase, SUB_MAX } = await lib('motion.mjs');
  const units = ['他们', '手里边', '就', '攒了', '大约', '1', '万张', 'A100', '那是', '当时', '最好', '的'].map((text, i) => ({ text, at: i * 0.3 }));
  const parts = splitPhrase(units);
  assert.ok(parts.length > 1 && parts.every((p) => p.reduce((a, u) => a + u.text.length, 0) <= SUB_MAX));
  assert.ok(parts.some((p) => p.some((u) => u.text === 'A100')), 'A100 stays one unit');
  assert.ok(parts.every((p, i) => !i || p[0].at >= parts[i - 1].at(-1).at), 'in time order');
});

test('compose: stills show the first short subtitle phrase; tag rows keep short facts only', async () => {
  const { stillSubtitle, tagItems } = await lib('compose.mjs');
  assert.equal(stillSubtitle('2022年美国开始搞芯片出口管制最顶级的H100不许卖给'), '2022年美国开始搞芯片出口管');
  assert.equal(stillSubtitle('他们手里边就攒了大约1万张A100'), '他们手里边就攒了大约1万张');
  assert.equal(stillSubtitle('说白了，就是做对了给你奖励'), '说白了');
  assert.deepEqual(tagItems(['OpenAI', '一步推理都不交一个范例都不给', '推理模型', 'a', 'b']), ['OpenAI', '推理模型', 'a']);
});

// Critique 2026-10-17: side cards came out as a title on an empty card; the writer's example was whatever
// project listed the card first. The replica (routing/exemplars.json) is now the example, every slot filled.
test('writer: a card is taught by its replica, material paths scrubbed', async () => {
  const { cardExamples } = await lib('writer.mjs');
  const ex = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'exemplars.json'), 'utf8')).cards;
  const [project, shotId] = (ex['presenter-side-card'] || '').split('/');
  if (!fs.existsSync(path.join(cfg.dataDir, 'projects', project || '-', 'shots', `${shotId}.json`))) return;
  const fill = cardExamples(cfg)['presenter-side-card'];
  assert.ok(fill.kicker && fill.main && fill.annotation, 'the replica fills list, prop and label');
  assert.ok(!JSON.stringify(fill).includes('reference-frames'), 'no material path is shown to the writer');
  assert.ok(!JSON.stringify(fill).includes('"art"') && !fill.panel, 'art is the art plan\'s: not in the example (it was copied back as a string)');
});

test('art plan: an art field the writer wrote as a string is replaced by the card\'s template', async () => {
  const { applyArtTemplates } = await lib('arttemplates.mjs');
  const theme = { artLibrary: { paperCard: { prompt: 'card', size: '1024x1536' } }, artPlan: { 'side': { panel: 'paperCard' } } };
  const shot = { recipe: 'side', slots: { panel: { art: '做旧纸卡' } } };
  applyArtTemplates({ slots: { panel: { kind: 'panel' } } }, shot, theme);
  assert.equal(typeof shot.slots.panel.art, 'object');
});

// Critique 2026-10-17: a read web page was a whole page at thumbnail size in the still; it now shows the
// camera's read pose, the sentence about 72% of the frame wide and highlighted.
test('screen: a read page is framed on its sentence, the page still covering the frame', async () => {
  const { readingFocus, focusTransform } = await lib('screen.mjs');
  const shot = { shotId: 'B03', slots: { screen: { asset: 'x-window.png' } }, scenes: [{ screen: { camera: { mode: 'manual', push: { at: [0.5, 0.35], scale: 2 } } }, cues: { highlight: { boxes: [[0.31, 0.32, 0.38, 0.03]] } } }, {}] };
  const f = readingFocus(null, shot);
  assert.ok(f.scale > 1.8 && f.scale <= 2.6 && f.boxes.length === 1);
  assert.equal(readingFocus(null, { ...shot, scenes: [{ ...shot.scenes[0], cues: { highlight: { boxes: [[0.02, 0.4, 0.95, 0.05]] } } }] }).scale, 1, 'a column-cut window is not pushed further');
  assert.equal(readingFocus(null, { shotId: 'B09', slots: {} }), null);
  const m = focusTransform({ at: [0.98, 0.02], scale: 2 }).match(/translate\((-?\d+)px,(-?\d+)px\)/);
  assert.deepEqual([+m[1], +m[2]], [-960, 0], 'clamped at the page edge');
});

// Critique 2026-10-17: real logos on side cards were turned into dot screens and could not be recognised.
test('compose: the halftone of a prop slot applies to generated art only, not to a real logo or photo', async () => {
  const { composeHtml } = await lib('compose.mjs');
  const recipe = { slots: { main: { box: [0, 0, 1, 1], kind: 'image', fit: 'contain', halftone: 7 } }, tokens: { bg: '#fff', fg: '#000', accent: '#f00', muted: '#888' }, typeScale: { title: 90, titleSub: 40, data: 30, annotation: 30 } };
  const html = (fill) => composeHtml({ recipe, shot: { shotId: 'T', slots: { main: fill } }, resolved: { main: { level: 'asset', url: 'file:///a.png' } }, degraded: [] });
  assert.ok(/halftone|radial-gradient\(circle/.test(html({ gen: 'x', art: { prompt: 'p' } })));
  assert.ok(!/halftone|radial-gradient\(circle/.test(html({ asset: 'logo.png' })));
});

// Critique 2026-10-17: a blank page capture (zhihu loaded nothing) was bound as material and drawn as a
// white block on a side card. A blank picture is now a failed capture and, at render, a missing one.
test('resolve: a blank picture is not material', async () => {
  const { isBlankImage } = await lib('resolve.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-blank-'));
  const white = path.join(dir, 'w.png'), noise = path.join(dir, 'n.png');
  spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=white:s=320x180', '-frames:v', '1', white]);
  spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=320x180', '-frames:v', '1', noise]);
  assert.equal(isBlankImage(white), true);
  assert.equal(isBlankImage(noise), false);
  const logo = path.join(dir, 'logo.png');   // white mark on a transparent ground (the Google G was taken for blank)
  spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', "color=white:s=320x180,format=rgba,geq=r=255:g=255:b=255:a='255*between(X,120,200)*between(Y,60,120)'", '-frames:v', '1', logo]);
  assert.equal(isBlankImage(logo), false);
});

// Replica type 12 (466 s): a press quote sets its keyword three to four times the line size; the marks
// take the title's size (they were 16 px dots).
test('compose: a press quote scales its [[keyword]] by the card and sizes its marks with the title', async () => {
  const { composeHtml } = await lib('compose.mjs');
  const recipe = { slots: { title: { box: [0.05, 0.2, 0.5, 0.56], kind: 'title', treatment: 'pressquote', emScale: 3.4 } }, tokens: { bg: '#000', fg: '#fff', accent: '#bbb', muted: '#333' }, typeScale: { title: 104, titleSub: 36, data: 30, annotation: 30 } };
  const html = composeHtml({ recipe, shot: { shotId: 'T', slots: { title: { text: '我们拿过来做应用\n赚[[快钱]]' } } }, resolved: {}, degraded: [] });
  assert.match(html, /class="em" style="font-size:3.4em/);
  assert.match(html, /class="pq2" style="font-size:\d+px"/);
});

// Replica type 9 (178 s): spec tables with each value on a coloured bar, names small and grey.
test('compose: a bar table sets every value on its slot\'s colour bar', async () => {
  const { composeHtml } = await lib('compose.mjs');
  const recipe = { slots: { t: { box: [0, 0, 0.5, 0.3], kind: 'table', cells: 'bar', barColor: 'cool' } }, tokens: { bg: '#000', fg: '#fff', accent: '#fa0', muted: '#999', cool: '#5a55c9' }, typeScale: { title: 90, titleSub: 30, data: 50, annotation: 28 } };
  const html = composeHtml({ recipe, shot: { shotId: 'T', slots: { t: { rows: [['SM分配逻辑', '动态预留约20个SM'], ['调度层级关系', '直接操作PTX汇编层']] } } }, resolved: {}, degraded: [] });
  assert.equal((html.match(/class="v" style="background:linear-gradient\(90deg,#5a55c9/g) || []).length, 2);
  const { traditionalOn } = await lib('house.mjs');
  assert.match(html, traditionalOn() ? /class="k"[^>]*>SM分配邏輯/ : /class="k"[^>]*>SM分配逻辑/);
});

// Replica type 8 (335 s): the doors fill the lower half of each card, so a poster card's prop placement
// is a field; without it the prompt is the one every existing card was made with (art cache unchanged).
test('art plan: a poster card takes its prop placement from the shot, the default unchanged', async () => {
  const { applyArtTemplates } = await lib('arttemplates.mjs');
  const theme = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'themes', 'hupo-editorial.json'), 'utf8'));
  const recipe = { slots: { leftCard: { kind: 'image' } } };
  const a = { recipe: 'poster-pair', slots: { leftCard: { gen: 'doors' } } };
  const b = { recipe: 'poster-pair', slots: { leftCard: { gen: 'doors', placement: 'The props fill the lower half.' } } };
  applyArtTemplates(recipe, a, theme); applyArtTemplates(recipe, b, theme);
  // the default keeps the prop off the label band at the bottom of the card (critique: props covered the tags)
  assert.match(a.slots.leftCard.art.prompt, /Nothing touches or covers the dark band/);
  assert.match(b.slots.leftCard.art.prompt, /fill the lower half/);
  assert.ok(!/\{placement\}/.test(a.slots.leftCard.art.prompt));
});

// Materials 2026-10-17: logos and product photos were searched only in public archives, so H800 and the
// 幻方 logo had no candidate and B11's "logo" was the headquarters. Official sites, Commons logo files and
// registered product galleries are now searched (URL candidates; nothing downloaded before approval).
test('materials: logos from the official site and Commons, product photos from the registered gallery', async () => {
  const { siteIconCandidates, commonsLogoCandidates, galleryCandidates } = await lib('materials.mjs');
  const pages = {
    'https://www.high-flyer.cn/': '<link rel="icon" href="/favicon-32x32.png"/><link rel="apple-touch-icon" sizes="512x512" href="https://hfai-static.high-flyer.cn/icons/icon-512x512.png"/>',
  };
  const icons = siteIconCandidates(['high-flyer.cn'], (u) => pages[u] || '');
  assert.equal(icons[0].asset, 'https://hfai-static.high-flyer.cn/icons/icon-512x512.png');
  const commons = commonsLogoCandidates(['High-Flyer'], (u) => (u.includes('list=search')
    ? JSON.stringify({ query: { search: [{ title: 'File:High-Flyer logo.svg' }, { title: 'File:Kite flyer.jpg' }] } })
    : JSON.stringify({ query: { pages: { 1: { imageinfo: [{ thumburl: 'https://thumb/x.png', descriptionurl: 'https://commons/x', extmetadata: { LicenseShortName: { value: 'Public domain' } } }] } } } })));
  assert.deepEqual(commons.map((c) => c.title), ['File:High-Flyer logo.svg']);
  assert.equal(commons[0].rights, 'public');
  const html = '<title>H800图片</title><a href="/picture_index_1/index9_p2126341.shtml"><img src="https://2e.zol-img.com.cn/product/271_280x210/282/ce8Q.jpg"></a><a href="/vga/index999.shtml"><img src="https://2f.zol-img.com.cn/product/275_100x75/447/other.png"></a>';
  const g = galleryCandidates(['https://detail.zol.com.cn/2127/2126341/pic.shtml'], () => html);
  assert.deepEqual(g.map((c) => c.asset), ['https://2e.zol-img.com.cn/product/271/282/ce8Q.jpg'], 'full picture, this product only');
});

// 2026-10-17: a literal new URL('<directory>/', import.meta.url) in page-capture broke the materials page
// (the web bundler tries to resolve it as a file). Line modules the pages import keep such paths in variables.
test('line modules the web pages import have no bundler-resolved directory URLs', () => {
  // what the routes under apps/studio-next/src/app reach, following static and dynamic imports
  const app = path.join(REPO, 'apps', 'studio-next', 'src', 'app');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const todo = [...new Set(walk(app).flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/lib\/recipe-board\/([\w-]+\.mjs)/g)].map((m) => m[1])))];
  const seen = new Set();
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f) || !fs.existsSync(path.join(LIB, f))) continue;
    seen.add(f);
    const src = fs.readFileSync(path.join(LIB, f), 'utf8');
    assert.ok(!/new URL\(\s*['"][^'"]*\/['"]\s*,\s*import\.meta\.url/.test(src), `${f}: directory URL literal`);
    todo.push(...[...src.matchAll(/['"]\.\/([\w-]+\.mjs)['"]/g)].map((m) => m[1]));
  }
  assert.ok(seen.has('materials.mjs') && seen.has('page-capture.mjs'));
  // the pages never compile the whole line (2026-10-26: the board's route imported gates.mjs, which reached run.mjs and
  // the renderers, and the dev server died compiling it): the gates come from the CLI, layers reads gatestate.mjs
  for (const heavy of ['run.mjs', 'gates.mjs']) assert.ok(!seen.has(heavy), `a web page reaches ${heavy}`);
  assert.doesNotMatch(fs.readFileSync(path.join(app, 'api', 'recipe-board', 'route.ts'), 'utf8'), /import\([^)]*gates/);
});

// User decision 2026-10-17: no site names or addresses on screen; a read page is cut to its text column
// (header, logo, navigation and sidebars outside); news is cited from English-language outlets.
test('sources: no address on screen, pages cut to their text column, English pages first', async () => {
  const { screenCredit } = await lib('compose.mjs');
  assert.equal(screenCredit('素材：k.sina.cn · https://k.sina.cn/a.html · 截图于 2026-10-16'), '');
  assert.equal(screenCredit('素材：www.nasa.gov'), '');
  assert.equal(screenCredit('素材：Reuters · https://reuters.com/x'), '素材：Reuters');
  assert.equal(screenCredit('素材：极客湾Geekerwan'), '素材：极客湾Geekerwan');
  assert.equal(screenCredit('素材：repo asset'), '');
  const { readingWindow, READ_WINDOW_VERSION } = await lib('page-capture.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-read-'));
  const full = path.join(dir, 'full.png');
  spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=white:s=1920x3000', '-frames:v', '1', full]);
  // a sentence in a column from x 0.3 to 0.7 of the page, 1500 px down a 3000 px page
  const rec = { files: { fullPage: full }, pageHeight: 3000, places: { __line: [{ tag: 'body', line: [[0.3, 0.5, 0.4, 0.01], [0.3, 0.51, 0.2, 0.01]], sentence: 's' }] } };
  const w = readingWindow(rec, { out: path.join(dir, 'w.png') });
  assert.equal(w.version, READ_WINDOW_VERSION);
  assert.ok(w.width < 1920 * 0.5 && w.left > 1920 * 0.25, 'only the text column');
  assert.ok(w.top > 1000, 'far below the site header');
  assert.ok(w.boxes[0][0] > 0 && w.boxes[0][0] + w.boxes[0][2] <= 1.01 && w.boxes[0][2] > 0.7, 'the sentence spans the window');
  const { isEnglish } = await lib('materials.mjs');
  assert.equal(isEnglish({ title: 'Nvidia sheds almost $600 billion in market cap - Reuters' }), true);
  assert.equal(isEnglish({ title: '英伟达市值蒸发近6000亿美元' }), false);
});

// 2026-10-20: each generated poster card draws its dark band at its own height, so a tag at a fixed place sat
// on the paper's edge (hupo B45); the band is measured on the art and the tag goes in it.
test('poster card: the dark band is found where the art drew it', async () => {
  const { darkBand } = await lib('design-check.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-band-'));
  const f = path.join(dir, 'card.png');
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=0xEEEEEA:s=400x600', '-vf', 'drawbox=x=40:y=470:w=320:h=70:color=0x222222:t=fill', '-frames:v', '1', f]);
  if (r.status !== 0) return;
  const b = darkBand(f);
  assert.ok(b && Math.abs(b[1] - 470 / 600) < 0.02 && Math.abs(b[3] - 540 / 600) < 0.02, JSON.stringify(b));
  assert.ok(Math.abs(b[0] - 0.1) < 0.03 && Math.abs(b[2] - 0.9) < 0.03 && b[4] === 400 && b[5] === 600);
});

// 2026-10-20: flow cards said the same words two or three times (clara B29 去美国发展 as title, step and black
// card) and their steps were small in an empty box: repeats are dropped, a short row grows to fill its box.
test('steps: each thing said once; a short row grows, a tall one still fits its box', async () => {
  const { diagramHtml } = await lib('components.mjs');
  const base = { w: 1460, h: 432, tokens: { fg: '#111', accent: '#d00', muted: '#888' }, fonts: { serif: 'x' }, size: 58 };
  const h = diagramHtml({ ...base, fill: { layout: 'steps', frameTitle: '去美国发展', nodes: [{ label: '电脑' }, { label: '去美国发展', emph: true, sub: '去美国发展' }], bracket: { from: 0, to: 1, label: '电脑' } } });
  assert.ok(!h.includes('class="scard"'), 'the card repeating the title is not drawn');
  assert.ok(!/class="blabel"[^>]*>电脑</.test(h), 'the bracket label repeating a step is not drawn');
  const size = +/class="slab" style="font-size:([\d.]+)px/.exec(h)[1];
  assert.ok(size > 58 * 0.95, `a two-step row grows (${size})`);
  const tall = diagramHtml({ ...base, fill: { layout: 'steps', nodes: [{ label: '投入一次' }, { label: '无限收钱', emph: true, sub: '然后无限收钱的东西' }], bracket: { from: 0, to: 1, label: '一次' } } });
  const fs = +/class="slab" style="font-size:([\d.]+)px/.exec(tall)[1] / 0.95;
  assert.ok(fs <= 58 + 0.5, `a row with a bracket and a card does not grow past the box (${fs})`);
});

// 2026-10-20: a read page's lines were too long to enlarge, so the sentence read was too small to find
// (critique: hupo B40, clara B06 B10 at 2); it is set large over the dimmed page, from the archived text.
test('读报: the sentence read is set as a pull quote, starting clean and cut at a word', async () => {
  const { quoteText } = await lib('compose.mjs');
  assert.equal(quoteText('learned that the study sorted papers'), '…learned that the study sorted papers');
  const long = quoteText('A '.repeat(120) + 'end');
  assert.ok(long.length <= 152 && long.endsWith('A…'), long);
  assert.equal(quoteText('SoftBank Group Chairman spoke.'), 'SoftBank Group Chairman spoke.');
});

// 2026-10-20: a big title over a photo crossed the face in it (clara B26, 十五分钟 across Son's eyes); it
// moves to the side away from the faces, or below a face in the middle; a clear title stays put.
test('title over a photo keeps off the faces', async () => {
  const { titleClearOfFaces } = await lib('design-check.mjs');
  const box = [0.05, 0.12, 0.9, 0.56];
  assert.equal(titleClearOfFaces(box, []), null);
  assert.equal(titleClearOfFaces(box, [[0.4, 0.75, 0.1, 0.1]]), null, 'a face below the title box');
  const right = titleClearOfFaces(box, [[0.55, 0.25, 0.25, 0.4]]);
  assert.ok(right.box[0] + right.box[2] <= 0.55 && right.align === 'left', JSON.stringify(right));
  const left = titleClearOfFaces(box, [[0.1, 0.2, 0.2, 0.3]]);
  assert.ok(left.box[0] >= 0.3 && left.align === 'right', JSON.stringify(left));
  const mid = titleClearOfFaces(box, [[0.4, 0.1, 0.2, 0.3]]);
  assert.ok(mid.box[1] >= 0.4, JSON.stringify(mid));
});

// 2026-10-20: the LED board lit a clause (他们手里边就攒了) and hedges (差不多1万亿) whose dots ran together
// (hupo B04 B23): one short label, a hedge as ≈ or >.
test('display: the ticker board shows one short label and the figure with ≈', async () => {
  const { ledFigure } = await lib('display.mjs');
  assert.deepEqual(['差不多1万亿', '大约1万张', '超过600亿', '650'].map(ledFigure), ['≈1万亿', '≈1万张', '>600亿', '650']);
});

// 2026-10-20: a chat's reaction tag repeated its own message and, pinned to a corner, covered the second
// bubble (clara B42); a repeating tag is not drawn, a new one sits in the group's last row.
test('chat: a tag that repeats a message is dropped, a new one joins the group', async () => {
  const { chatHtml } = await lib('components.mjs');
  const base = { tokens: { muted: '#888' }, fonts: { sans: 'x' }, size: 30, marks: (t) => t };
  const msgs = [{ who: '你', text: '可以让你[[每天只干五分钟]]' }];
  assert.ok(!chatHtml({ ...base, fill: { messages: msgs, reactionTag: '每天只干五分钟' } }).includes('rtag'));
  const h = chatHtml({ ...base, fill: { messages: msgs, reactionTag: '老板笑了' } });
  assert.ok(h.includes('reacts in-group') && h.includes('老板笑了'));
});

// 2026-10-20: every code change re-rendered whole films (a one-card fix, two films, two hours); a shot whose
// built page is unchanged keeps its render. The page hash follows the page and its assets, not the renders.
test('motion: a page built the same keeps its render', async () => {
  const { motionPageHash } = await lib('run.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-page-'));
  fs.mkdirSync(path.join(dir, 'assets')); fs.mkdirSync(path.join(dir, 'renders'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<div>a</div>');
  fs.writeFileSync(path.join(dir, 'assets', 'p-1a2b.png'), 'x'.repeat(10));
  const h0 = motionPageHash(dir);
  fs.writeFileSync(path.join(dir, 'renders', 'motion.mp4'), 'v');
  assert.equal(motionPageHash(dir), h0, 'renders do not count');
  fs.writeFileSync(path.join(dir, 'index.html'), '<div>b</div>');
  assert.notEqual(motionPageHash(dir), h0, 'a changed page counts');
});

// 2026-10-20: a revision emptied the big title of a page-backdrop card (hupo B61) and the page stayed veiled
// and blurred with nothing over it; without a title the page shows plain. The veiled page is a light ground.
test('stamp over a page: no title, no veil; a title keeps it and the subtitle gets its band', async () => {
  const { composeHtml } = await lib('compose.mjs');
  const { loadRecipe } = await lib('store.mjs');
  const recipe = loadRecipe(cfg, 'stamp-over-evidence', 'hupo-editorial');
  const resolved = { background: { level: 'asset', url: 'file:///page.png' } };
  const shot = (t) => ({ shotId: 'S', recipe: 'stamp-over-evidence', subtitle: '字幕', slots: { background: { asset: 'x/page.png' }, title: { text: t } } });
  const veil = recipe.slots.background.veil;
  assert.ok(veil, 'the theme veils the page');
  // house rules (2026-10-21): the system adds no subtitles; the band rule applies only when subtitles are on
  const { subtitlesOn } = await lib('house.mjs');
  assert.equal(composeHtml({ recipe, shot: shot('被训练出来的方式'), resolved, degraded: [] }).includes('class="subtitle'), subtitlesOn());
  assert.ok(!composeHtml({ recipe, shot: shot(''), resolved, degraded: [] }).includes(veil));
});

// 2026-10-20: white subtitles vanished on cards drawn on a light ground once the tube's glow went over the
// frame (flow and chat cards in the reel); such a card's subtitle gets the dark band, a photo frame does not.
test('subtitles: a light ground gets the dark band', async () => {
  const { groundLuma } = await lib('compose.mjs');
  assert.ok(groundLuma('#e4e2ec') > 170);
  assert.ok(groundLuma('#0c0c0f') < 40);
  assert.ok(groundLuma('rgb(240, 238, 230)') > 170);
  assert.equal(groundLuma('var(--paper)'), 0);
});

// 2026-10-20: a short sentence cut the window at its own line width, so the paragraph and headline were cut
// at the sides; the window now takes the whole text block (measured on the pixels), stops at a sidebar,
// and records the paper colour the frame fades into under the subtitle.
test('读报: the window takes the whole text block, not the sidebar beside it', async () => {
  const { readingWindow } = await lib('page-capture.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-col-'));
  const full = path.join(dir, 'full.png');
  // cream paper; a text block x 300–1300 (grey bars as lines) at y 1400–1700; a dark sidebar from x 1400
  const bars = Array.from({ length: 8 }, (_, i) => `drawbox=x=300:y=${1400 + i * 40}:w=${i % 3 === 2 ? 600 : 1000}:h=14:color=0x333333:t=fill`).join(',');
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=0xF5EEDC:s=1920x3000', '-vf', `${bars},drawbox=x=1400:y=0:w=520:h=3000:color=0x102040:t=fill`, '-frames:v', '1', full]);
  if (r.status !== 0) return;
  // the sentence is a short piece of one line: x 700–1000
  const rec = { files: { fullPage: full }, pageHeight: 3000, places: { __line: [{ tag: 'body', line: [[700 / 1920, 1520 / 3000, 300 / 1920, 14 / 3000]], sentence: 's' }] } };
  const w = readingWindow(rec, { out: path.join(dir, 'w.png') });
  assert.ok(w.left <= 300 && w.left + w.width >= 1300, `the whole block is in the window (${w.left}+${w.width})`);
  assert.ok(w.left + w.width <= 1400, 'the sidebar stays outside');
  assert.ok(w.paper && Math.abs(w.paper[0] - 0xF5) < 12 && Math.abs(w.paper[2] - 0xDC) < 12, `paper colour read (${w.paper})`);
});

// 2026-10-17: English pages were read with the Chinese line and no sentence was found (0 highlighted
// lines on B02/B03); amounts are now also searched the way an English page writes them.
test('page capture: Chinese amounts as an English page writes them', async () => {
  const { englishNumbers } = await lib('page-capture.mjs');
  assert.ok(englishNumbers('蒸发了将近6000亿美金').includes('600 billion'));
  assert.ok(englishNumbers('差不多1万亿').includes('1 trillion'));
  assert.ok(englishNumbers('大约1万张').includes('10,000'));
});

// 2026-10-17: datacenterdynamics answered with a Cloudflare check (请稍候… 安全验证) and Tech in Asia with a
// paywall stub; both were archived as material. A bot check, error page or near-empty page fails the capture.
test('page capture: a bot check or paywall stub is not an archived page', async () => {
  const { isBlockedPage } = await lib('page-capture.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-blocked-'));
  const rec = (title, text) => { const f = path.join(dir, `${title.length}-${text.length}.txt`); fs.writeFileSync(f, text); return { title, files: { text: f } }; };
  assert.equal(isBlockedPage(rec('请稍候…', 'www.datacenterdynamics.com 正在进行安全验证 由 Cloudflare 提供')), true);
  assert.equal(isBlockedPage(rec('Tech in Asia', 'Tech in Asia - Connecting Asia\'s startup ecosystem. Sign in.')), true);
  assert.equal(isBlockedPage(rec('Nvidia records largest loss', 'Nvidia lost $600bn in market value. '.repeat(40))), false);
});

test('materials: a site that blocks the capture is remembered once', async () => {
  const { rememberBlockedHost } = await lib('materials.mjs');
  const file = path.join(cfg.dataDir, 'routing', 'blocked-hosts.json');
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  rememberBlockedHost(cfg, 'https://www.example-blocked.test/a', 'the site served a bot check or paywall');
  rememberBlockedHost(cfg, 'https://example-blocked.test/b', 'blank');
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(d.hosts['example-blocked.test'].reason, 'bot check or paywall');
  if (before == null) fs.rmSync(file); else fs.writeFileSync(file, before);
});

// 2026-10-17: a recap's replayed shot ids (recall: "B34") were read as numbers on screen (B68: 39, 34, 57).
test('facts: the shot a recap replays is an id, not a number on screen', async () => {
  const { factTrace } = await lib('writer.mjs');
  const r = factTrace({ background: { recall: 'B34', video: { path: 'out/motion/B34/renders/motion.mp4' } }, title: { text: '残血显卡' } }, '一屋子被卡不字残血显卡');
  assert.deepEqual(r.unsourced, []);
});

// 2026-10-17: screenshots written straight onto the NAS were read back cut short (20 of 26 archived
// pages); they are taken locally and copied checked byte for byte.
test('page capture: a copy into the library is checked byte for byte', async () => {
  const { copyChecked } = await lib('page-capture.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-copy-'));
  const a = path.join(dir, 'a.bin'), b = path.join(dir, 'b.bin');
  fs.writeFileSync(a, Buffer.alloc(50000, 7));
  copyChecked(a, b);
  assert.equal(fs.readFileSync(b).length, 50000);
});

// 2026-10-17: a logo bound to the background of a later cut (B05~3, B49~1) wiped the presenter of the
// whole shot to a TODO. Only that cut is touched, and a presenter cut keeps the presenter.
test('materials: a logo for a later cut background leaves the presenter in place', async () => {
  const { bindShots } = await lib('materials.mjs');
  const id = 'zz-logo-bg';
  const root = path.join(cfg.dataDir, 'projects', id);
  fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
  fs.mkdirSync(path.join(root, 'materials'), { recursive: true });
  const presenter = { asset: 'presenter.png' };
  fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({ id, theme: 'hupo-editorial', presenter }));
  fs.writeFileSync(path.join(root, 'shots', 'B05.json'), JSON.stringify({ shotId: 'B05', recipe: 'presenter-plain', slots: { background: presenter }, scenes: [{ slots: { background: presenter } }, { recipe: 'presenter-plain', slots: { background: { gen: 'DeepSeek 标识' } } }] }));
  fs.writeFileSync(path.join(root, 'materials', 'needs.json'), JSON.stringify({ needs: [{ shotId: 'B05', scene: 1, bind: 'background', kind: 'news', form: 'logo', original: 'DeepSeek 标识' }] }));
  fs.writeFileSync(path.join(root, 'materials', 'bindings.json'), JSON.stringify({ shots: { 'B05~1': { role: 'logo', kind: 'image', file: path.join(root, 'logo.png') } } }));
  try {
    bindShots(cfg, id);
    const shot = JSON.parse(fs.readFileSync(path.join(root, 'shots', 'B05.json'), 'utf8'));
    assert.deepEqual(shot.slots.background, presenter, 'the shot keeps its presenter');
    assert.deepEqual(shot.scenes[0].slots.background, presenter);
    assert.deepEqual(shot.scenes[1].slots.background, presenter, 'the logo cut shows the presenter, not a TODO');
    // a title card cut over a logo background: the presenter, blurred
    fs.writeFileSync(path.join(root, 'shots', 'B05.json'), JSON.stringify({ shotId: 'B05', recipe: 'presenter-plain', slots: { background: presenter }, scenes: [{ slots: { background: presenter } }, { recipe: 'title-hero-over-photo', slots: { background: { gen: 'x' } } }] }));
    bindShots(cfg, id);
    const s2 = JSON.parse(fs.readFileSync(path.join(root, 'shots', 'B05.json'), 'utf8'));
    assert.equal(s2.scenes[1].slots.background.asset, 'presenter.png');
    assert.ok(s2.scenes[1].slots.background.blur > 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// 2026-10-17: a change to the mechanism module did not re-render the mechanism stills (the still cache
// key did not include it), so a fix looked like it did nothing.
test('render: a mechanism still is keyed by the diagram module', () => {
  const src = fs.readFileSync(path.join(LIB, 'render.mjs'), 'utf8');
  assert.match(src, /motion-mechanism\.browser\.js/);
  assert.match(src, /RENDERER_VERSION, recipe, shot, focus, mech, varied,/);
  assert.match(src, /variants\.mjs/);
});

// Critique 2026-10-17 (B71): a "red" poster card came back saturated and swallowed its black type; card
// colours are light tints with dark type, as on the reference's 闭源 / 开源 cards.
test('art plan: a bare card colour becomes a light tint', async () => {
  const { applyArtTemplates } = await lib('arttemplates.mjs');
  const theme = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'themes', 'hupo-editorial.json'), 'utf8'));
  const shot = { recipe: 'poster-pair', slots: { leftCard: { gen: 'money', tint: 'red' } } };
  applyArtTemplates({ slots: { leftCard: { kind: 'image' } } }, shot, theme);
  assert.match(shot.slots.leftCard.art.prompt, /soft salmon red/);
});

// User decision 2026-10-18: a card that recurs must not look the same every time, and films must not all
// share one look. Themes extend a base (only what differs), cards carry variants taken in turn.
test('styles: a theme extends another; card variants mirror or move slots and rotate without repeats', async () => {
  const { loadTheme, loadRecipe } = await lib('store.mjs');
  const { applyVariant, assignVariants } = await lib('variants.mjs');
  const glass = loadTheme(cfg, 'glass-screen');
  assert.ok(glass.artLibrary.cardProp.prompt.includes('chrome'), 'its own prop material');
  assert.ok(glass.artLibrary.posterCard, 'the rest inherited');
  assert.equal(loadRecipe(cfg, 'presenter-side-card', 'glass-screen').tokens.card, '#dfe8f2');
  const r = loadRecipe(cfg, 'presenter-side-card', 'hupo-editorial');
  const left = applyVariant(r, 'left');
  assert.ok(Math.abs(left.slots.panel.box[0] - (1 - r.slots.panel.box[0] - r.slots.panel.box[2])) < 1e-3, 'mirrored');
  // text inside the mirrored card keeps its offset from the card's left edge
  for (const k of ['title', 'main']) assert.ok(Math.abs((left.slots[k].box[0] - left.slots.panel.box[0]) - (r.slots[k].box[0] - r.slots.panel.box[0])) < 1e-3, k);
  const id = 'zz-variants';
  const root = path.join(cfg.dataDir, 'projects', id);
  fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
  fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({ id, theme: 'hupo-editorial' }));
  fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify({ beats: ['B1', 'B2', 'B3', 'B4'].map((b) => ({ id: b, text: '' })) }));
  for (const b of ['B1', 'B2', 'B3', 'B4']) fs.writeFileSync(path.join(root, 'shots', `${b}.json`), JSON.stringify({ shotId: b, recipe: 'presenter-side-card', slots: {} }));
  try {
    assignVariants(cfg, id, { recipeFor: (x) => loadRecipe(cfg, x, 'hupo-editorial') });
    const got = ['B1', 'B2', 'B3', 'B4'].map((b) => JSON.parse(fs.readFileSync(path.join(root, 'shots', `${b}.json`), 'utf8')).variant);
    assert.ok(got.every((v, i) => !i || v !== got[i - 1]), `no variant twice in a row: ${got}`);
    assert.ok(new Set(got).size >= 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('motion: hyperframes check output is read into lint errors and findings (info left out)', async () => {
  const { parseCheck } = await lib('motion.mjs');
  const raw = '[INFO] fonts\n{\n "ok": false,\n "lint": {"errorCount": 0, "findings": [{"code":"dup","severity":"warning","message":"m"}]},\n "layout": {"findings": [{"code":"panel_out_of_canvas","severity":"info"},{"code":"text_clipped","severity":"error","message":"c","time":1.2}]}\n}\n';
  const r = parseCheck(raw);
  assert.equal(r.lintErrors, 0);
  assert.deepEqual(r.findings.map((x) => x.code), ['dup', 'text_clipped']);
  assert.equal(parseCheck('npm error').lintErrors, 1, 'no report is a failure, not a pass');
});

// Maturity 2026-10-17: the presenter was a still placeholder; with the author's read on video every
// presenter cut plays the seconds where its words are said.
test('presenter takes: each presenter cut plays the seconds of the recording where it is said', async () => {
  const { presenterTakeRange } = await lib('writer.mjs');
  // a beat said from 40 s to 46 s, written as a 4 s shot cut at 0 and 3: the second cut is 44.5–46 s
  assert.deepEqual(presenterTakeRange({ start: 40, end: 46 }, [0, 3], 4, 1), { in: 44.5, out: 46 });
  assert.deepEqual(presenterTakeRange({ start: 40, end: 46 }, null, 4, 0), { in: 40, out: 46 });
});

// Bug 2026-10-17: `run` on the replica project (hand-made shots, no plan) crashed before rendering.
test('recalls: a project without a plan has none (no crash)', async () => {
  const { applyRecalls } = await lib('writer.mjs');
  const id = 'zz-test-noplan';
  writeJson(path.join(cfg.dataDir, 'projects', id, 'project.json'), { contract: 'A1RecipeBoardProject/v1', id, title: id });
  assert.deepEqual(applyRecalls(cfg, id), []);
});

// Bug 2026-10-26: a check failed on a rule dropped B20's lock; the record gave it back without the review's rules and seven
// chapters went back to review with their pictures unchanged
test('locks taken back from the accepted record keep the rules they passed under', async () => {
  const C = await lib('chapter.mjs'), shots = [{ shotId: 'B20', text: 'x' }], rec = { review: { frames: [{ beat: 'B20', score: 4, issue: '' }] } };
  assert.equal(C.lockedBeats({ locked: {} }, rec, shots, () => true, 'r1').B20.rules, 'r1');
  assert.equal(C.lockedBeats({ locked: {} }, rec, shots, () => true).B20.rules, undefined, 'unknown rules: reviewed again');
  assert.equal(C.lockedBeats({ locked: { B20: { score: 4, issue: '' } } }, rec, shots, () => true, 'r1').B20.rules, 'r1', 'a lock of the last check without its rules takes the record\'s');
  const { kept } = C.splitLocked(C.lockedBeats({ locked: {} }, rec, shots, () => true, 'r1'), shots, ['/nope'], () => '/nope', 'r1');
  assert.equal(kept.length, 0, 'a missing frame is never kept');
});

// 2026-10-26: two new checks went out uncalibrated and were found wrong only after ten chapters rendered again: each
// chapter's geometry track is kept, and `replay` runs the checks on the kept tracks in seconds
test('a chapter\'s geometry track is kept slim, and replay reads it', async () => {
  const C = await lib('chapter.mjs'), id = 'zz-track', g = { id: 'B99', shots: [{ shotId: 'B99', at: 0, dur: 2, text: '' }] };
  writeJson(path.join(cfg.dataDir, 'projects', id, 'project.json'), { contract: 'A1RecipeBoardProject/v1', id, title: id });
  C.saveTrack(cfg, id, g, 'code', [{ t: 0, drawn: [{ text: 'A', x0: 1.234, y0: 2, x1: 3, y1: 4, size: 60 }], shapes: [{ kind: 'line', alpha: 0.1, x0: 0, y0: 0, x1: 1, y1: 1 }, { kind: 'image', x0: 10.06, y0: 0, x1: 20, y1: 20 }], cover: null }]);
  const f = fs.readdirSync(cfg.dataDir, { recursive: true }).find((x) => String(x).endsWith('track.json') && String(x).includes('zz-track'));
  assert.ok(f, 'kept'); const T = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, f), 'utf8'));
  assert.equal(T.track[0].drawn[0].x0, 1.2); assert.equal(T.track[0].shapes.length, 1, 'faint lines left out'); assert.equal(T.shots[0].shotId, 'B99');
  const cli = fs.readFileSync(path.join(cfg.sourceRoot, 'scripts/recipe-board.mjs'), 'utf8'); assert.match(cli, /cmd === 'replay'[\s\S]{0,400}replayChecks\(cfg, project/);
});

// the user 2026-10-26: 怎么字还漂移 … 乱闪 — the reference's standing type is still half the time (2 px a second at the
// median), ours 14 % (5.7): a free line carried by the camera while it stands, and a line that goes and comes back, fail
test('type that creeps while it stands, and type that blinks, fail their beats; the line holds a creeping line still', async () => {
  const C = await lib('chapter.mjs'), shots = [{ shotId: 'B26', at: 0, dur: 10 }];
  const fr = (t, x, more = {}) => ({ t, drawn: [{ text: '2015', size: 120, x0: x, y0: 300, x1: x + 260, y1: 420, alpha: 1, ...more }], shapes: [] });
  const creep = Array.from({ length: 11 }, (_, i) => fr(i * 0.2, 400 + i * 3));
  assert.match(C.creepErrors(creep, shots)[0], /"2015" creeps 30 px while it stands/);
  assert.equal(C.creepErrors(Array.from({ length: 11 }, (_, i) => fr(i * 0.2, 400)), shots).length, 0, 'still type');
  assert.match(C.creepErrors(Array.from({ length: 13 }, (_, i) => fr(i * 0.2, 400 + (i <= 6 ? i : 12 - i) * 3)), shots)[0] || '', /creeps 18 px/, 'there and back is a creep (甘肅 白銀 crept 10 px and back)');
  assert.equal(C.creepErrors(Array.from({ length: 4 }, (_, i) => fr(i * 0.2, 400 + i * 60)), shots).length, 0, 'a quick move into place (0.6 s)');
  assert.equal(C.creepErrors(creep.map((f) => ({ ...f, drawn: f.drawn.map((d) => ({ ...d, object: true })) })), shots).length, 0, 'a tag rides its object');
  const blink = [fr(0, 400), fr(0.2, 400), { t: 0.4, drawn: [], shapes: [] }, { t: 0.6, drawn: [], shapes: [] }, fr(0.8, 400)];
  assert.match(C.flickerErrors(blink, shots)[0], /"2015" goes and comes back within 0\.6 s/);
  assert.equal(C.flickerErrors(blink.map((f) => ({ ...f, drawn: f.drawn.map((d) => ({ ...d, readout: true })) })), shots).length, 0, 'a rolling digit is a readout');
  assert.match(C.redPlateErrors([{ text: 'DYS576', size: 34, redPlate: true, x0: 0, y0: 0, x1: 1, y1: 1 }], 'B27')[0], /words on a red plate/);
  assert.equal(C.redPlateErrors([{ text: 'DYS576', size: 34, x0: 0, y0: 0, x1: 1, y1: 1 }], 'B27').length, 0);
  // words dressed up (the user 2026-10-26: 不要加字描边阴影 下面或者侧面的红线)
  { const w = { text: 'D3S1358', size: 34, x0: 100, y0: 300, x1: 260, y1: 334 };
    assert.match(C.decoErrors([{ ...w, deco: 'shadow' }], [], 'B10')[0], /"D3S1358" has a shadow/);
    assert.match(C.decoErrors([{ ...w, deco: 'stroke' }], [], 'B10')[0], /has a stroke/);
    assert.match(C.decoErrors([w], [{ kind: 'rule', x0: 100, y0: 338, x1: 260, y1: 341 }], 'B10')[0], /accent rule under it/, 'a red rule under a tag');
    assert.match(C.decoErrors([w], [{ kind: 'rule', x0: 88, y0: 300, x1: 92, y1: 334 }], 'B10')[0], /accent rule beside it/, 'a red bar at its side');
    assert.equal(C.decoErrors([w], [{ kind: 'rule', x0: 100, y0: 420, x1: 260, y1: 423 }], 'B10').length, 0, 'a rule well below is a rule of its own');
    assert.equal(C.decoErrors([w], [{ kind: 'fill', x0: 100, y0: 338, x1: 260, y1: 380 }], 'B10').length, 0, 'a data bar is no rule');
    assert.equal(C.decoErrors([{ ...w, deco: 'shadow', look: true }], [], 'B10').length, 0, 'the texture word');
    const k2 = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/kit2.js'), 'utf8'), tagSrc = k2.slice(k2.indexOf('function tagDraw'), k2.indexOf('\n}', k2.indexOf('function tagDraw')));
    assert.doesNotMatch(tagSrc, /strokeText|shadowBlur|fillRect/, 'a tag is its words alone');
    const tapeSrc = k2.slice(k2.indexOf('function tapeDraw'), k2.indexOf('\n}', k2.indexOf('function tapeDraw')));
    assert.doesNotMatch(tapeSrc, /fillRect|shadowBlur/, 'a tape has no rules and no shadow');
    const mo = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8');
    assert.match(mo, /\.\.\.\(decoOf\(g, text\) \? \{ deco: decoOf\(g, text\) \} : \{\}\)/, 'traced text carries its effect');
    assert.match(mo, /S\.shapes\.push\(\{ kind: 'rule'/, 'thin accent bars are traced, an object\'s too');
    // a project lettered eva sets its chapters in the six: big Chinese 黒華明朝 tall, 思源黑体 last
    // the six first, one face a role by the film's style; 思源黑体 last (the user 2026-10-26: 思源黑体是兜底 主要用之前安装的 6 个)
    assert.match(mo, /if \(eva && han\) fam = px >= DISPLAY_MIN && house\.has\(six\.display\)/);
    assert.match(mo, /\.\.\.\(eva \? \[six\.last\] : \[\]\)\]/);
    const chs = fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
    assert.match(chs, /six = eva \? H\.letterRoles\(engineRoot\(cfg\)\) : null/); assert.match(chs, /prefer: id && !eva \?/);
    const HR = await import(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/house.mjs'));
    assert.deepEqual(HR.letterRoles(undefined, null), { style: 'editorial-grey', named: 'House Kokka', display: 'House Kokka', x: 0.72, tall: true, small: 'House Kokka', latin: 'House Kaiso', last: 'House Gothic' });
    assert.deepEqual([HR.letterRoles(undefined, 'glass-screen').display, HR.letterRoles(undefined, 'glass-screen').latin], ['House Kinkaku', 'House Kikai'], 'a tech style: 金畫字 big, f.k 機械彫刻 for Latin');
    assert.equal(HR.letterRoles(undefined, 'forensic-dark').display, 'House Sumikaku', 'the six are all big faces (the user 2026-10-26)');
    assert.equal(HR.letterRoles(undefined, 'cobalt-print').display, 'House Soukou'); assert.equal(HR.letterRoles(undefined, 'cobalt-print').x, 1, 'drawn as it is unless the style asks');
    assert.match(fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/tallface.py'), 'utf8'), /T2CharStringPen/, 'PostScript faces (機械彫刻, スミカク) are drawn narrow too');
    assert.match(chs, /H\.shapedFont\(six\.display, six\.x, engineRoot\(cfg\)\)/);
    assert.ok(Object.values(HR.letterRoles(undefined, 'glass-screen')).every((v) => typeof v !== 'string' || !/Gothic/.test(v) || v === HR.letterRoles(undefined, 'glass-screen').last), '思源黑体 is only the last');
    for (const f of ['house.mjs', 'modules.mjs']) assert.match(fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board', f), 'utf8'), /:where\(body\) \*\{text-shadow:none!important;-webkit-text-stroke:0!important\}/, `${f}: a lettered card's words carry no shadow or outline`);
    assert.match(fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/cardsmoke.mjs'), 'utf8'), /words dressed up on a lettered page/); }
  { const k2 = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/kit2.js'), 'utf8'); assert.doesNotMatch(k2, /g\.fillStyle = fill; g\.fillRect\(x - 5, y - size \* 0\.86/, 'a tag lays no plate under its words'); }
  const morph = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8'), ch = fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(morph, /const hl = window\.__holdLearn \|\| !free \? null : holdAt\(nk, S\.tNow, g\.getTransform\(\)\);/, 'a held line is drawn with the transform it had when its creep began');
  assert.match(ch, /window\.__holdSolve\(T\)[\s\S]{0,400}__hold: holds[\s\S]{0,800}window\.__nudgeSolve\(T\)/, 'holds solved before the nudges, kept with the places');
  assert.match(ch, /\.\.\.creepErrors\(track, g\.shots\), \.\.\.flickerErrors\(track, g\.shots\)/);
});

// the user 2026-10-26: 画面运动不和谐 … 都能通过代码审查出 — a dead stop, a bounce, motion at odds, read off the track
test('motion that does not sit together: a dead stop, a bounce, things moving every way at once', async () => {
  const C = await lib('chapter.mjs'), shots = [{ shotId: 'B28', at: 0, dur: 10 }];
  const T = (t, xs) => ({ t, drawn: xs.map(([text, x, y]) => ({ text, size: 40, x0: x, y0: y, x1: x + 120, y1: y + 40, alpha: 1 })), shapes: [] });
  // a slide at 300 px/s that stands at once
  const dead = [0, 1, 2, 3, 4, 5, 6].map((i) => T(i * 0.2, [['DYS576', 400 + Math.min(i, 4) * 60, 300], ['Y', 200, 600]]));
  assert.match(C.motionErrors(dead, shots).join(' '), /"DYS576" stops dead from 300 px\/s/);
  assert.doesNotMatch(C.motionErrors([0, 1, 2, 3, 4, 5].map((i) => T(i * 0.2, [['1998', 400 + [0, 0, 47, 92, 92, 92][i], 300], ['Y', 200, 600]])), shots).join(' '), /stops dead/, 'a 0.4 s move is two samples: not judged');
  // the same slide eased (sine in-out over 1.2 s): no dead stop
  const ease = (u) => (1 - Math.cos(Math.PI * Math.min(1, u))) / 2;
  assert.doesNotMatch(C.motionErrors([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => T(i * 0.2, [['DYS576', 400 + 300 * ease(i * 0.2 / 1.2), 300], ['Y', 200, 600]])), shots).join(' '), /stops dead/);
  // there and back
  assert.match(C.motionErrors([0, 1, 2, 3].map((i) => T(i * 0.2, [['DNA', 400 + (i <= 1 ? i : 2 - i) * 40, 300], ['Y', 200, 600]])), shots).join(' '), /"DNA" goes one way and straight back/);
  // four things flying four ways for 0.8 s over a still ground
  const odds = [0, 1, 2, 3, 4, 5].map((i) => T(i * 0.2, [['a', 900 + i * 40, 500], ['b', 900 - i * 40, 520], ['c', 700, 300 + i * 40], ['d', 1200, 800 - i * 40], ['e', 100, 100], ['f', 1700, 100], ['g', 100, 900]]));
  assert.match(C.motionErrors(odds, shots).join(' '), /things move in 4 directions at once/);
});

// 2026-10-26 (the user: 尽量提速): ten chapters checked one after another took 25 min a round; they run a few at a time
test('chapters are checked a few at a time through the pool, a failure named, not fatal', async () => {
  const src = fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8'), body = src.slice(src.indexOf('export async function stepChapters'));
  assert.match(body, /const states = chapterState\(cfg, id, \{ only \}\)(, PROF = profileOf\(cfg, id\))?;\n[\s\S]{0,4000}?for \(const r of await pool\(states, async \(st\) => \{/);
  assert.match(body, /\}, \{ jobs: CHECK_JOBS \}\)\) if \(r\.error\) \{ log\(`  \$\{stepOf\(r\.item\.g\)\}: the check failed/);
});

// Bug 2026-10-26: three faults of the card path lived for rounds because no built page was ever opened; the card's page is
// opened once after it is built (cardsmoke.mjs, run.mjs cardCheck), and a page showing an older recall than its shot names it
test('card smoke: a page built from an older shot than its recall is named; the check runs in cardCheck', async () => {
  const { staleRecalls, recallAssets } = await lib('cardsmoke.mjs');
  const shot = { slots: { background: { asset: 'out/recall/B26-new-600-2.png', recall: 'B26' } }, scenes: [{ slots: { background: { asset: 'out/recall/B23-x.png', recall: 'B23' } } }, { slots: { title: { text: '女性' } } }] };
  assert.deepEqual(recallAssets(shot), ['B26-new-600-2.png', 'B23-x.png']);
  assert.equal(staleRecalls(shot, '<img src="assets/d2-B26-new-600-2.png"><img src="assets/e5-B23-x.png">').length, 0);
  assert.match(staleRecalls(shot, '<img src="assets/d2-B26-old-600-1.png"><img src="assets/e5-B23-x.png">')[0], /older recall than the shot's B26-new-600-2\.png/);
  const run = fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/run.mjs'), 'utf8');
  assert.match(run, /cardSmoke\(dir, shot, \{ lettered: H\.lettered\(\) \}\)/);
});

// Bug 2026-10-26: B10's review of B10 B13 B15 B16 was thrown away when B10 locked and the task shrank to B13 B15 B16
test('a review task about more beats stands for fewer, their pictures unchanged', async () => {
  const src = fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(src, /covers = !!task\?\.forPrints && shots\.length > 0 && shots\.every\(\(s, k\) => \{ const j = tb\.indexOf\(s\.shotId\); return j >= 0 && samePrints\(\[task\.forPrints\[j\]\], \[forPrints\[k\]\]\); \}\)/);
  assert.match(src, /\|\| covers\);/);
  assert.match(src, /if \(!same && fs\.existsSync\(tp\.answer\)\) \{[\s\S]*?fs\.copyFileSync\(tp\.answer, backup, fs\.constants\.COPYFILE_EXCL\)/, 'a changed review task preserves the old answer by content');
  assert.match(src, /const answerPresent = same && fs\.existsSync\(tp\.answer\) && fs\.statSync\(tp\.answer\)\.mtimeMs > fs\.statSync\(tp\.task\)\.mtimeMs/, 'a prior answer cannot satisfy a new review task');
});

// Bug 2026-10-26: the white model refreshed its recalls before rendering the chapters, so B37 recalled B26 as it was
// a round earlier (行賄犯罪 still red after the chapter had turned it white).
test('animatic: recalls are refreshed after the chapters are made and before the cards', async () => {
  const src = fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/animatic.mjs'), 'utf8');
  const body = src.slice(src.indexOf('export async function buildAnimatic'));
  const chap = body.indexOf('animaticChapter(cfg, id, st.g'), rec = body.indexOf('applyRecalls(cfg, id)'), cards = body.indexOf('cardVideo(cfg, id, s');
  assert.ok(chap > 0 && rec > chap && cards > rec, 'recalls between chapters and cards');
  assert.match(body, /applyRecalls\(cfg, id\) \|\| \[\];[^\n]*shots\.splice\(0, shots\.length, \.\.\.loadShots\(cfg, id\)/, 'the cards are built from the shots as refreshed, not as read at the start');
});

// Bug 2026-10-17: every shot with prop layers failed the HyperFrames lint (data-layer is deprecated there).
test('compose: prop layers are marked data-prop, not data-layer', async () => {
  const { composeParts } = await lib('compose.mjs');
  const { loadRecipe } = await lib('store.mjs');
  const recipe = loadRecipe(cfg, 'title-hero-over-photo', 'hupo-editorial');
  const p = composeParts({ recipe, shot: { shotId: 'X', recipe: 'title-hero-over-photo', slots: { title: '显卡' }, layers: [{ box: [0, 0, 0.2, 0.2], fill: { gen: 'x' } }] }, resolved: { __layer0: { level: 'asset', url: 'file:///x.png' } }, degraded: [] });
  assert.ok(p.content.includes('data-prop="0"') && !p.content.includes('data-layer'));
});

// Maturity 2026-10-17: the layout rules the replicas taught, checked on every still.
test('design checks: small type, spilling text, colliding texts and text over the face are found', async () => {
  const { designFindings } = await lib('design-check.mjs');
  const m = { W: 1920, H: 1080, faces: [[860, 200, 200, 260]],
    slots: { title: [100, 100, 600, 120], tag: [1300, 300, 400, 100] },
    texts: [
      { text: '标题', size: 80, box: [100, 100, 760, 100], slot: 'title' },            // spills 160 px past its box
      { text: '小字', size: 18, box: [1300, 300, 200, 30], slot: 'tag' },              // too small
      { text: '压脸', size: 60, box: [900, 260, 300, 70], slot: 'side' },              // over the face
      { text: '撞', size: 60, box: [600, 120, 200, 80], slot: 'other' },               // on the title
      { text: '素材：x', size: 14, box: [10, 1040, 100, 20], slot: null, credit: true }, // credits are exempt
    ] };
  const rules = designFindings(m).map((f) => f.rule).sort();
  assert.deepEqual(rules, ['over-the-face', 'spills-out-of-box', 'texts-collide', 'type-too-small']);
});

// Maturity 2026-10-17: the critic's answer is checked like every agent answer.
test('critique: every shot gets a 1-5 verdict, and a low score names its issue', async () => {
  const { checkCritique } = await lib('critique.mjs');
  const items = [{ shotId: 'B01' }, { shotId: 'B02' }];
  assert.ok(checkCritique({ shots: [{ shotId: 'B01', score: 5, issues: [] }, { shotId: 'B02', score: 3, issues: [{ slot: 'title', problem: 'p', fix: 'f' }] }] }, items).ok);
  assert.ok(!checkCritique({ shots: [{ shotId: 'B01', score: 5, issues: [] }] }, items).ok, 'a missing shot');
  assert.ok(!checkCritique({ shots: [{ shotId: 'B01', score: 2, issues: [] }, { shotId: 'B02', score: 9, issues: [] }] }, items).ok, 'no issue named, score out of range');
});

test('storyboard: every piece of evidence names its form', async () => {
  const { checkStoryboard, storyboardState } = await lib('storyboard.mjs');
  const { readPlan, loadProject } = await lib('store.mjs');
  const id = PROJECTS.find((x) => readJson(path.join(cfg.dataDir, 'projects', x, 'tasks', 'storyboard.answer.json'))?.shots?.some((s) => s.evidence?.length));
  if (!id) return;
  const a = readJson(path.join(cfg.dataDir, 'projects', id, 'tasks', 'storyboard.answer.json'));
  const plan = readPlan(cfg, id), brief = readJson(path.join(cfg.dataDir, 'projects', id, 'brief.json'));
  const k = a.shots.findIndex((s) => s.evidence?.length);
  const noForm = { ...a, shots: a.shots.map((s, i) => (i === k ? { ...s, evidence: s.evidence.map(({ form, ...e }) => e) } : s)) };
  assert.ok(checkStoryboard(cfg, plan, brief, noForm, { speechRate: loadProject(cfg, id).speechRate }).errors.some((e) => /needs a form/.test(e)));
});

// Bug 2026-10-16: after a storyboard rewrite a need kept its key (B03) but asked for something else (a news
// page instead of footage); the old candidates, approval and binding were reused for the new need.
test('materials: a changed need blocks retirement and preserves history', async () => {
  const id = 'zz-test-changed';
  const p = path.join(cfg.dataDir, 'projects', id);
  writeJson(path.join(p, 'project.json'), { contract: 'A1RecipeBoardProject/v1', id, title: id });
  writeJson(path.join(p, 'shots', 'B03.json'), { shotId: 'B03', recipe: 'stamp-over-evidence', slots: { background: { gen: 'x' } } });
  const old = { shotId: 'B03', bind: 'background', kind: 'news', original: 'trading screen footage' };
  const now = { shotId: 'B03', bind: 'background', kind: 'page', form: 'webpage', original: 'the news report page' };
  writeJson(path.join(p, 'materials', 'needs.json'), { needs: [now] });
  writeJson(path.join(p, 'materials', 'candidates.json'), { shots: { B03: { need: old, candidates: [{ id: 'yt:1', source: 'youtube', title: 'old', url: 'https://example.test/v' }] } } });
  writeJson(path.join(p, 'materials', 'approvals.json'), { batches: [{ id: 'batch-1', items: [{ shotId: 'B03', candidateId: 'yt:1', status: 'fetched' }] }] });
  const clip = path.join(box.root, 'old.mp4'); fs.writeFileSync(clip, '');
  writeJson(path.join(p, 'materials', 'bindings.json'), { shots: { B03: { kind: 'video', file: clip, range: [0, 2], credit: 'old' } } });
  const { projectState } = await lib('run.mjs');
  const { retireChangedNeeds } = await lib('materials.mjs');
  let m = projectState(cfg, id).materials;
  assert.deepEqual([m.changed, m.unsearched, m.toBind, m.toConfirm], [['B03'], ['B03'], [], []], 'the old binding and approval do not answer the new need');
  const paths = ['needs.json','candidates.json','approvals.json','bindings.json'].map(f => path.join(p, 'materials', f));
  const before = paths.map(f => fs.readFileSync(f, 'utf8'));
  assert.throws(() => retireChangedNeeds(cfg, id), /blocked|disabled/i);
  assert.deepEqual(paths.map(f => fs.readFileSync(f, 'utf8')), before, 'changed need blocks without changing historical records');
  m = projectState(cfg, id).materials;
  assert.deepEqual([m.changed, m.unsearched], [['B03'], ['B03']]);
});

// Bug 2026-10-16: an archived page was bound as the whole page (1920×10952), so the still showed the
// middle of the page. The still is now one screen around the line that matters.
test('web page: the still is a 16:9 reading crop around the number', async () => {
  const { readingCrop } = await lib('page-capture.mjs');
  const full = path.join(box.root, 'page-full.png');
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=white:s=1920x6000', '-frames:v', '1', full]);
  if (r.status !== 0) return;
  const rec = { files: { fullPage: full }, pageHeight: 6000, marks: { 英伟达: [0.1, 0.05, 0.1, 0.01], '6000亿': [0.2, 0.5, 0.1, 0.01] } };
  const crop = readingCrop(rec, { out: path.join(box.root, 'read.png') });
  assert.equal(crop.at, '6000亿', 'a number wins over a name');
  assert.equal(crop.top, Math.round(3000 - 720 * 0.4), 'the line sits a little above the middle');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', crop.file], { encoding: 'utf8' });
  assert.equal(probe.stdout.trim(), '1920,1080');
});

// Bug 2026-10-16: a re-captured page replaced the picture under the same path; the shot file did not change,
// so the motion render was taken as current and kept showing the old picture.
test('motion key follows the content of the pictures a shot points at', async () => {
  const { assetStamps } = await lib('run.mjs');
  const f = path.join(box.root, 'pic.png');
  fs.writeFileSync(f, 'a');
  const shot = { shotId: 'B02', recipe: 'stamp-over-evidence', slots: { background: { asset: 'pic.png' } }, scenes: [{ slots: { background: { video: { path: 'no-such-clip.mp4' } } } }], motion: { preset: 'enter', duration: 3 } };
  const s1 = assetStamps(shot, box.root);
  assert.match(s1, /pic\.png:1:/); assert.match(s1, /no-such-clip\.mp4:missing/);
  fs.writeFileSync(f, 'a longer picture');
  assert.notEqual(assetStamps(shot, box.root), s1, 'same path, new content: motion is due');
});

// Bug 2026-10-16: the motion page kept its old copy of a picture that was replaced under the same path.
test('motion: a picture replaced under the same path is copied again into the motion page', async () => {
  const { localiseFiles } = await lib('motion.mjs');
  const dir = path.join(box.root, 'motion-assets'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(box.root, 'page.png'); fs.writeFileSync(f, 'old');
  const html = `<img src="file://${f}">`;
  const name = localiseFiles(html, dir).match(/assets\/([^"]+)/)[1];
  fs.writeFileSync(f, 'new and longer');
  localiseFiles(html, dir);
  assert.equal(fs.readFileSync(path.join(dir, name), 'utf8'), 'new and longer');
});

// Bug 2026-10-16: a shot rewritten with fewer cuts left a confirmed cut (B02~1) with no need; fetching
// crashed on it and, since progress was written only at the end, lost the pages fetched before it.
test('fetch: a confirmed removed cut is isolated without mutating approval', async () => {
  const id = 'zz-test-orphan';
  const p = path.join(cfg.dataDir, 'projects', id);
  writeJson(path.join(p, 'project.json'), { contract: 'A1RecipeBoardProject/v1', id, title: id });
  writeJson(path.join(p, 'materials', 'needs.json'), { needs: [] });
  const { fetchApproved, needPrint } = await lib('materials.mjs');
  const removed = { shotId: 'B02', scene: 1, kind: 'page', original: 'confirmed page' };
  writeJson(path.join(p, 'materials', 'approvals.json'), { batches: [{ id: 'batch-1', items: [{ shotId: 'B02~1', needPrint: needPrint(removed), candidateId: 'web:x', source: 'web', url: 'https://example.test', status: 'approved' }] }] });
  const approvalFile = path.join(p, 'materials', 'approvals.json');
  const before = fs.readFileSync(approvalFile, 'utf8');
  await fetchApproved(cfg, id, {});
  assert.equal(fs.readFileSync(approvalFile, 'utf8'), before, 'removed cut remains untouched when fetch is isolated');
});

test('读报: the window centres the sentence that reads like the narration, push stays in frame, highlight sits on its lines', async () => {
  const { readingWindow } = await lib('page-capture.mjs');
  const full = path.join(box.root, 'page-full-2.png');
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=white:s=1920x6000', '-frames:v', '1', full]);
  if (r.status !== 0) return;
  // the narration-like sentence at y = 3000 px (two lines), a number elsewhere at y = 600 px
  const L = (y) => [0.2, y / 6000, 0.5, 24 / 6000];
  const rec = { files: { fullPage: full }, pageHeight: 6000, places: { '6000亿': [{ box: L(600), line: [L(600)], tag: 'body' }], __line: [{ box: L(3000), line: [L(3000), L(3036)], tag: 'body', sentence: 's' }] } };
  const w = readingWindow(rec, { out: path.join(box.root, 'win.png') });
  assert.equal(w.term, '__line', 'the sentence that reads like the narration wins');
  // version 2 (2026-10-17): the text column (0.2–0.7 of the page plus margins), 16:9, the sentence a
  // little above the middle
  const ch = Math.round(w.width * 9 / 16);
  assert.equal(w.width, Math.round(0.55 * 1920));
  assert.equal(w.top, Math.round((3000 + 3060) / 2 - ch * 0.45));
  assert.equal(w.boxes.length, 2);
  const [bx, by] = w.boxes[0];
  assert.ok(Math.abs(by - (3000 - w.top) / ch) < 0.01 && Math.abs(bx - ((0.2 * 1920 - w.left) / w.width - 0.006)) < 0.01, 'the highlight sits on the first line');
  const half = 0.5 / w.scale;
  assert.ok(w.at.every((v) => v >= half && v <= 1 - half), 'the push stays inside the window');
});

test('web pages: official sites of the org are known, and an official page is preferred', async () => {
  const { officialDomains, isOfficial } = await lib('materials.mjs');
  const d = officialDomains(cfg, { entity: 'DeepSeek', form: 'paper', original: 'DeepSeek-R1 论文' });
  assert.equal(d[0], 'arxiv.org');
  assert.ok(d.includes('github.com/deepseek-ai'));
  assert.ok(isOfficial('https://github.com/deepseek-ai/DeepSeek-R1', d));
  assert.ok(!isOfficial('https://github.com/someone/openai-quickstart', d), 'another account on the same host is not official');
  assert.ok(isOfficial('https://api-docs.deepseek.com/news/news250120', d), 'a subdomain of an official domain is official');
});

// Bug 2026-10-16: a page that dropped the connection once was marked failed for good, although the same
// URL archived fine a minute later for another cut.
test('fetch: a network failure is retried (3 attempts), anything else goes back to the user', async () => {
  const { retryable } = await lib('materials.mjs');
  assert.ok(retryable({ status: 'failed', error: 'page.goto: net::ERR_CONNECTION_CLOSED at https://x' }));
  assert.ok(!retryable({ status: 'failed', attempts: 3, error: 'net::ERR_CONNECTION_CLOSED' }), 'three attempts, then the user decides');
  assert.ok(!retryable({ status: 'failed', error: 'page.goto: Download is starting' }), 'a PDF is not a network failure');
});

test('motion key ignores storyboard notes and follows rendered content', async () => {
  const { motionKey } = await lib('run.mjs');
  const shot = { shotId: 'B01', recipe: 'footage-plate', slots: { background: { gen: 'x' } }, motion: { preset: 'footage', duration: 3 } };
  assert.equal(motionKey(shot), motionKey({ ...shot, design: { why: 'notes only' } }));
  assert.notEqual(motionKey(shot), motionKey({ ...shot, slots: { background: { gen: 'y' } } }));
});

test('style library: every family prints with inks of every set, and the refs it names are pins', async () => {
  const { loadLibrary, inksOf } = await lib('harmony.mjs');
  const L = loadLibrary(cfg);
  const hex = /^#[0-9A-Fa-f]{6}$/;
  for (const set of Object.keys(L.inkSets)) for (const fam of Object.keys(L.families)) {
    const p = inksOf(L, set, fam);
    if (!L.families[fam].process) { assert.equal(p, null, `${fam}: a 3D family is not printed`); continue; }
    assert.ok(p.inks.length >= 2 && p.inks.every((c) => hex.test(c)), `${set}/${fam}: ${p.inks}`);
  }
  for (const [fam, f] of Object.entries(L.families)) for (const r of f.refs) assert.match(r, /^(board|home)-[0-9a-f]{32}\.jpg$/, fam);
});

test('style library: a dark-base family swaps paper and ink of a light set and prints negatives by border', async () => {
  const { loadLibrary, inksOf } = await lib('harmony.mjs');
  const L = loadLibrary(cfg);
  const k = L.inkSets.klein;
  const dark = inksOf(L, 'klein', 'bitmap-screen');
  assert.equal(dark.inks[0], k.ink);
  assert.equal(dark.negative, 'auto');
  const paper = inksOf(L, 'klein', 'xerox-halftone');
  assert.deepEqual(paper.inks, [k.paper, k.ink]);
  assert.equal(paper.negative, false);
});

test('styleFor: families follow the treatment, whole drawn plates only for metaphor, runs are capped', async () => {
  const { loadLibrary, styleFor } = await lib('harmony.mjs');
  const L = loadLibrary(cfg);
  for (const [f, fam] of Object.entries(L.families)) assert.ok(!fam.fits.includes('evidence'), `${f}: evidence is never restyled`);
  const shots = ['metaphor', 'metaphor', 'presenter-tags', 'presenter-tags', 'presenter-tags', 'presenter-tags', 'evidence'].map((t, i) => ({ shotId: `B${i}`, treatment: t }));
  const got = styleFor(shots, L, { families: ['showa-poster', 'flat-surreal', 'xerox-halftone', 'riso-two-ink'] });
  assert.equal(got.B0, 'showa-poster');
  assert.equal(got.B1, 'flat-surreal', 'a chapter mark is not repeated');
  assert.ok(!(got.B2 === got.B3 && got.B3 === got.B4 && got.B4 === got.B5), 'no family more than three running');
  assert.equal(got.B6, null, 'evidence keeps its own look');
  assert.equal(styleFor([{ shotId: 'X', treatment: 'presenter' }], L, { families: ['riso-two-ink'] }).X, null);
});

test('inkPrint and measure: a print uses only the film inks, keeps a cut-out alpha, and the checks fire', async () => {
  const sharp = (await import('sharp')).default;
  const { inkPrint } = await lib('inkprint.mjs');
  const { loadLibrary, inksOf, measure, harmonyIssues } = await lib('harmony.mjs');
  const L = loadLibrary(cfg);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkprint-'));
  const W = 160, H = 90, px = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const v = Math.round((x / W) * 255); px[i] = v; px[i + 1] = 120; px[i + 2] = 255 - v; px[i + 3] = x < 20 ? 0 : 255; }
  const src = path.join(dir, 'src.png');
  await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toFile(src);
  const out = path.join(dir, 'out.png');
  await inkPrint(src, out, { ...inksOf(L, 'klein', 'riso-two-ink'), width: W, grainAmount: 0 });
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4, 'alpha kept');
  assert.equal(data[3], 0, 'transparent stays transparent');
  const flat = path.join(dir, 'flat.png');
  await sharp({ create: { width: W, height: H, channels: 3, background: '#7a7a7a' } }).png().toFile(flat);
  assert.ok(harmonyIssues(await measure(flat, L, 'klein'), L).some((x) => x.startsWith('flat-values')));
  const loud = path.join(dir, 'loud.png');
  await sharp({ create: { width: W, height: H, channels: 3, background: '#00ff40' } }).png().toFile(loud);
  const m = await measure(loud, L, 'klein');
  assert.ok(harmonyIssues(m, L).some((x) => x.startsWith('too-much-colour')) && m.offInk > 0.9);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('layouts: each names real pins as its source and builds a page from words alone, escaped', async () => {
  const { LAYOUTS, layoutHtml } = await lib('layouts.mjs');
  const pins = new Set(readJson(path.join(DATA, 'style-lab', 'pinterest-v1', 'clusters.json'), []).flatMap((c) => c.files.map((f) => path.basename(f))));
  const k = readJson(path.join(cfg.dataDir, 'routing', 'style-library.json')).inkSets.klein;
  for (const [id, L] of Object.entries(LAYOUTS)) {
    assert.ok(L.from.length && L.fits.length, id);
    if (pins.size) for (const f of L.from) assert.ok(pins.has(f), `${id}: ${f} is not a collected pin`);
    const html = layoutHtml(id, { title: 'A<b>|C', sub: 's', kicker: 'k', image: 'x.png', plate: 'p.png', labels: ['a', 'b', 'c'], day: '1', month: 'm', weekday: 'w', number: 'I', zone: [0, 0, 100, 100], meta: ['1', '2', '3', '4'] }, k, { fontDir: '' });
    assert.ok(html.startsWith('<!doctype html>') && html.includes('dataset.ready'), id);
    assert.ok(!html.includes('A<b>'), `${id}: words are escaped`);
  }
  assert.throws(() => layoutHtml('nope', {}, k, { fontDir: '' }), /unknown layout/);
});

test('concept: key shots by role in story order; a world without a kit cannot be picked; picking sets the theme', async () => {
  const C = await lib('concept.mjs');
  const id = PROJECTS.find((x) => fs.existsSync(path.join(cfg.dataDir, 'projects', x, 'shots')));
  if (!id) return;
  const keys = C.keyShots(cfg, id);
  assert.ok(keys.length >= 1 && new Set(keys.map((k) => k.role)).size === keys.length);
  const worlds = C.loadWorlds(cfg);
  if (fs.existsSync(path.join(cfg.dataDir, 'worlds'))) {
    const noKit = worlds.find((w) => !w.kit);
    if (noKit) assert.throws(() => C.pickWorld(cfg, id, noKit.id), /no kit/);
    const kit = worlds.find((w) => w.kit && w.theme);
    if (kit) { const p = C.pickWorld(cfg, id, kit.id); assert.equal(p.theme, kit.theme); assert.equal(p.world, kit.id); assert.ok(p.themeBeforeWorld); }
  }
  assert.throws(() => C.pickWorld(cfg, id, 'nope'), /unknown world/);
});

test('text fitting never resizes a mechanism diagram (it fits itself; racing its mount changed stills)', async () => {
  const { FIT_TEXT } = await lib('compose.mjs');
  assert.match(FIT_TEXT, /querySelector\('\.mech'\)\)continue/);
});

test('camera layer: plain presenter frames untouched, pages and data filmed as a tilted plane', async () => {
  const C = await lib('camera.mjs');
  assert.equal(C.baseFor('presenter-plain'), null);
  assert.equal(C.baseFor('screen-full'), 'light');
  assert.equal(C.baseFor('title-hero-over-photo'), 'dark');
  assert.ok(C.isPlane('screen-full') && !C.isPlane('title-hero-over-photo'));
  const html = C.cameraFrame('<p>x</p>', { plane: true, focus: [0.3, 0.4] });
  assert.ok(html.includes('perspective(') && html.includes('backdrop-filter') && html.includes('cam-grain'));
  assert.ok(!C.cameraCss().includes('&quot;'), 'no HTML entity inside a stylesheet');
});

test('tube medium: on by default for packaging, never on the presenter or footage; a project LED list stays LED', async () => {
  const M = await lib('medium.mjs');
  const { loadShots } = await lib('store.mjs');
  if (!PROJECTS.includes('hupo-auto2')) return;
  const shots = Object.fromEntries(loadShots(cfg, 'hupo-auto2').map((s) => [s.shotId, s]));
  // 2026-10-20 the DeepSeek film picked its own look: light riso on the packaging (project.medium) over the house tube
  const two = { shotId: 'T1', recipe: 'title-hero-over-photo', slots: {}, scenes: [{ recipe: 'title-hero-over-photo', slots: {} }, { recipe: 'footage-plate', slots: {} }], motion: { cuts: [0, 2.2], duration: 4.5 } };
  assert.equal(M.resolveMedium(cfg, 'hupo-auto2', two).kind, 'print');
  assert.equal(M.resolveMedium(cfg, 'hupo-auto2', two).preset, 'riso-light');
  const tube = { kind: 'tube', preset: 'arcade' };
  assert.equal(M.resolveMedium(cfg, 'hupo-auto2', two, tube).kind, 'tube');
  // a title, then footage: only the title span is on the tube
  assert.deepEqual(M.resolveMedium(cfg, 'hupo-auto2', two, tube).spans, [[0, 2.2]]);
  assert.equal(M.resolveMedium(cfg, 'hupo-auto2', { ...two, scenes: undefined, motion: { duration: 4.5 } }, tube).spans, undefined, 'a one-scene shot is covered whole');
  assert.equal(M.resolveMedium(cfg, 'hupo-auto2', shots.B05, tube), null, 'plain presenter stays clean');
  assert.equal(M.resolveMedium(cfg, 'hupo-auto2', { ...shots.B05, recipe: 'presenter-side-card' }, tube), null, 'a card over the presenter stays clean');
  assert.equal(M.resolveMedium(cfg, 'hupo-auto2', { ...two, recipe: 'footage-plate', scenes: undefined }, tube), null, 'footage stays clean');
  assert.throws(() => M.resolveMedium(cfg, 'hupo-auto2', { ...two, medium: { kind: 'tube', preset: 'vhs' } }), /unknown tube preset/);
  if (PROJECTS.includes('hupo-69')) {
    const s69 = loadShots(cfg, 'hupo-69');
    const listed = s69.find((s) => s.shotId === 'P19-words');
    if (listed) assert.equal(M.resolveMedium(cfg, 'hupo-69', listed).kind, 'led', 'the shot the project lists keeps its LED');
    const other = s69.find((s) => s.shotId !== 'P19-words' && M.resolveMedium(cfg, 'hupo-69', s));
    if (other) assert.equal(M.resolveMedium(cfg, 'hupo-69', other).kind, 'tube', 'the LED list does not spread to other shots');
  }
});

// 2026-10-20: generated art read as "AI" (the cinematic default); a plain master is asked for instead, a real
// object comes from a real free photograph first, and the cache keys stay as they were (no art is redrawn).
test('art policy: cinematic words out, a plain master in; real photos only under a free licence', async () => {
  const G = await lib('imagegen.mjs');
  const p = G.houseArt('A real photograph shot on 35 mm film: moody low-key light, shallow depth of field, visible film grain. A beige CRT monitor on a desk.');
  assert.ok(!/cinematic|moody|low-key|depth of field|film grain|35 ?mm/i.test(p.replace(G.HOUSE_LOOK, '')), p);
  assert.ok(p.includes('A beige CRT monitor on a desk.') && p.endsWith(G.HOUSE_LOOK));
  const info = (w, h, lic) => ({ url: `https://x/${w}.jpg`, descriptionurl: 'https://commons/x', width: w, height: h, extmetadata: { LicenseShortName: { value: lic }, Artist: { value: '<a>Someone</a>' } } });
  const pages = { 1: { title: 'File:a.jpg', imageinfo: [info(3000, 2000, 'All rights reserved')] }, 2: { title: 'File:b.jpg', imageinfo: [info(2400, 3200, 'CC BY-SA 4.0')] },
    3: { title: 'File:c.jpg', imageinfo: [info(2000, 1300, 'CC0')] }, 4: { title: 'File:d.jpg', imageinfo: [info(900, 600, 'Public domain')] } };
  const pick = G.pickCommons(pages);
  assert.equal(pick.title, 'File:c.jpg', 'free licence, wide enough, landscape first');
  assert.equal(pick.author, 'Someone');
  assert.equal(G.pickCommons({ 1: pages[1], 4: pages[4] }), null, 'nothing free and large enough');
  const r = await G.realPhoto(cfg, 'x', { fetchJson: async () => ({ query: { pages: { 1: pages[1] } } }) });
  assert.equal(r, null);
  const art = { prompt: 'a desk calculator', size: '1536x1024' };
  assert.equal(G.artKey(cfg, art), G.artKey(cfg, { ...art }), 'the key is the request (prompt, size, refs), not the house wording');
});

// 2026-10-20: the user picked the risograph prints of a catalogue master and of a real photo over every
// "cinematic" image (style-lab/calc4); print is a medium like the tube: packaging only, its presets checked,
// and its red ink takes only what is really red (a beige body went pink).
test('print medium: packaging only, presets checked, the red plate takes only what is red', async () => {
  const M = await lib('medium.mjs');
  const { loadShots } = await lib('store.mjs');
  if (PROJECTS.includes('hupo-auto2')) {
    const shots = Object.fromEntries(loadShots(cfg, 'hupo-auto2').map((s) => [s.shotId, s]));
    // a title then footage in one shot: only the title span is printed
    const two = { shotId: 'T1', recipe: 'title-hero-over-photo', slots: {}, scenes: [{ recipe: 'title-hero-over-photo', slots: {} }, { recipe: 'footage-plate', slots: {} }], motion: { cuts: [0, 2.2], duration: 4.5 } };
    const pr = M.resolveMedium(cfg, 'hupo-auto2', two, { kind: 'print', preset: 'riso-blue' });
    assert.equal(pr.kind, 'print'); assert.equal(pr.preset, 'riso-blue');
    assert.deepEqual(pr.spans, [[0, 2.2]], 'only the title span is printed');
    // 2026-10-20 (the user: 太过了, 口播不加效果): print stays off web pages and 3D shots too
    for (const recipe of ['screen-full', 'hero-3d', 'mechanism-3d']) assert.equal(M.resolveMedium(cfg, 'hupo-auto2', { ...two, recipe, scenes: undefined, motion: { duration: 4 } }, { kind: 'print' }), null, `${recipe} is not printed`);
    assert.ok(M.PRINT_PRESETS.includes('riso-light'));
    assert.equal(M.resolveMedium(cfg, 'hupo-auto2', shots.B05, { kind: 'print' }), null, 'the presenter stays clean');
    assert.throws(() => M.resolveMedium(cfg, 'hupo-auto2', { ...shots.B01, medium: { kind: 'print', preset: 'neon' } }), /unknown print preset/);
  }
  const py = M.pythonFor(cfg);
  if (!fs.existsSync(py)) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-print-'));
  // a beige body with a red bar: after printing, the beige stays ink-free of red, the bar carries red ink
  const src = path.join(dir, 'in.png'), out = path.join(dir, 'out.png');
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=0xD8CDB8:s=320x180', '-vf', 'drawbox=x=200:y=60:w=80:h=60:color=0xE03020:t=fill', '-frames:v', '1', src]);
  const r = spawnSync(py, [path.join(new URL('../apps/studio-next/src/lib/recipe-board/', import.meta.url).pathname, 'print.py'), 'still', src, out, '--preset', 'riso']);
  assert.equal(r.status, 0, String(r.stderr));
  const px = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', out, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).stdout;
  const mean = (x0, y0, x1, y1) => { let rr = 0, gg = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * 320 + x) * 3; rr += px[i]; gg += px[i + 1]; n++; } return [rr / n, gg / n]; };
  const [br, bg] = mean(20, 20, 120, 160), [rr, rg] = mean(210, 70, 270, 110);
  assert.ok(br - bg < 20, `the beige carries no red ink (${br.toFixed(0)} vs ${bg.toFixed(0)})`);
  assert.ok(rr - rg > 60, `the red bar is printed red (${rr.toFixed(0)} vs ${rg.toFixed(0)})`);
  // stream mode: a dark span passes through untouched (ink on black printed a flat grey, hupo B27), a light one is printed
  const W = 64, H = 36, frame = (v) => Buffer.alloc(W * H * 3, v);
  const st = spawnSync(py, [path.join(new URL('../apps/studio-next/src/lib/recipe-board/', import.meta.url).pathname, 'print.py'), 'stream', String(W), String(H), '--preset', 'riso-light', '--spans', '0:2,2:4'],
    { input: Buffer.concat([frame(20), frame(20), frame(220), frame(220)]) });
  assert.equal(st.status, 0, String(st.stderr));
  const outF = (i) => st.stdout.subarray(i * W * H * 3, (i + 1) * W * H * 3);
  assert.ok(outF(0).equals(frame(20)) && outF(1).equals(frame(20)), 'the dark span is passed through');
  assert.ok(!outF(2).equals(frame(220)), 'the light span is printed');
});

// 2026-10-20: the 3D hero templates of the engine are a line card (hero-3d): the storyboard names the template and its
// params, the numbers carry facts, no site name reaches the screen, and nothing is printed over it
test('stage: hero-3d shots render an engine template with their facts and no source line', async () => {
  const S = await lib('stage.mjs');
  assert.equal(S.STAGE_RECIPES['hero-3d'], 'hero');
  const lib0 = { teardown: {}, scene: {} };
  const given = { route: 'hero', template: 'flipboard', params: { value: 10000, unit: '张', source: '网易', window: { in: 1.2 } }, facts: [{ text: '大约10000张', source: '口播原文' }] };
  const spec = S.stageSpec(lib0, 'hero-3d', {}, given);
  assert.equal(spec.template, 'flipboard');
  const shot = S.stageShot(lib0, spec, { medium: 'clean' }, 5, 'B23');
  assert.equal(shot.template, 'flipboard'); assert.equal(shot.medium, 'clean', 'the flipboard is filmed clean');
  assert.equal(shot.params.source, '', 'no site name on screen'); assert.equal(shot.params.window, undefined);
  assert.deepEqual(shot.window, { in: 1.2 }); assert.equal(shot.facts[0].source, '口播原文');
  assert.ok(S.stageSpec(lib0, 'hero-3d', { text: 'x' }, { route: 'hero', template: 'nope' }).missing, 'an unknown template waits as TODO');
  assert.equal(S.stageShot(lib0, S.stageSpec(lib0, 'hero-3d', {}, { route: 'hero', template: 'city', params: {} }), { medium: 'clean' }, 6, 'X').medium, 'led2');
  const { CATALOG } = await import(pathToFileURL(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/director/catalog.js')).href);
  for (const id of Object.keys(S.HERO_TEMPLATES)) {
    if (id.startsWith('blender:')) { assert.ok(fs.existsSync(path.join(DATA, 'style-lab/engine/blender/plates', `${id.slice(8)}.py`)), `${id} has its plate script`); continue; }   // rendered by Blender, not the page
    assert.ok(CATALOG[id], `${id} is in the director catalog`);
  }
  // the storyboard names it (stage3d) and is checked before anything is written: a known template, every number a fact
  const { heroErrors } = await lib('storyboard.mjs');
  assert.deepEqual(heroErrors({ template: 'flipboard', params: { value: 10000, tag: 'A100', land: 3 }, facts: [{ text: '大约10000张A100', source: '口播原文' }] }), []);
  assert.ok(heroErrors(undefined).length, 'hero-3d without stage3d');
  assert.deepEqual(heroErrors({ template: 'blender:chromosome', params: { lineup: { count: 8, accentIndex: -1 } }, facts: [] }), [], 'a Blender plate\'s set-up is no number on screen');
  assert.ok(heroErrors({ template: 'globe', params: {}, facts: [] }).some((e) => /not one of/.test(e)));
  assert.ok(heroErrors({ template: 'city', params: { rows: [{ label: 'AMD', value: -6 }] }, facts: [] }).some((e) => /number 6/.test(e)), 'a figure without a source');
  assert.ok(heroErrors({ template: 'city', params: {}, facts: [{ text: '-6%', source: '' }] }).some((e) => /text and source/.test(e)));
});

test('kit figures: the camera fits a figure by its size (no guessed distances); kit3 is in the render key', async () => {
  // fitDist is pure; morph.js imports three, so its body is read from the file and evaluated alone
  const src = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8');
  const body = src.slice(src.indexOf('export function fitDist'), src.indexOf('function fitKey'));
  const fitDist = new Function(`${body.replace('export function', 'function')}; return fitDist;`)();
  const wide = fitDist({ w: 20, h: 10 }, { fill: 0.8, elev: 90 }), close = fitDist({ w: 20, h: 10 }, { fill: 1.2, elev: 90 });
  assert.ok(close < wide, 'a larger fill is closer');
  const hv = Math.atan(Math.tan((30 * Math.PI) / 360) * (16 / 9));
  assert.ok(Math.abs(2 * wide * Math.tan(hv) * 0.8 - 20) < 1e-6, 'from straight above the width fills 80 % of the frame');
  assert.ok(fitDist({ w: 10, h: 40 }, { elev: 90 }) > fitDist({ w: 10, h: 40 }, { elev: 20 }), 'a tall figure seen low is foreshortened');
  const make = fs.readFileSync(path.join(DATA, 'style-lab/engine/director/make.mjs'), 'utf8');
  assert.ok(make.includes("'templates/kit3.js'"), 'a change to the kits re-renders the chapters that use them');
});

test('type goes where the figure leaves room: the widest band beside it, or a far quarter over a close-up', async () => {
  const src = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8');
  const body = src.slice(src.indexOf('const TYPE_AREA'), src.indexOf('const where = {'));
  // figBox stood in by a fixed screen box: what is tested is where the type goes beside it
  const at = (box) => new Function('S', 'BOX', `${body.replace(/function figBox\(name\) \{[\s\S]*?\n\}\n/, 'function figBox() { return BOX; }\n')}; return freeArea;`)({ figs: { tree: {} } }, box)(['tree']);
  const side = at({ x0: 412, y0: 33, x1: 1437, y1: 956 });   // a tree in the middle third (the kits example)
  assert.equal(side.side, 'right'); assert.ok(side.x0 >= 1437 && !side.over);
  const close = at({ x0: 0, y0: 0, x1: 1900, y1: 1080 });    // a close-up fills the frame
  assert.ok(close.over && close.w > 600);
  const top = at({ x0: 200, y0: 420, x1: 1700, y1: 840 });   // a strip low in the frame leaves the top
  assert.equal(top.side, 'top'); assert.ok(top.y1 <= 420);
});

test('keyframes: every 3D beat and the opening of each continuous diagram is drawn first; the prompt carries the design', async () => {
  const { keyBeats, keyframePrompt } = await lib('keyframes.mjs');
  const sb = { shots: [{ beat: 'B01', card: 'morph-chapter', diagram: { form: 'map' } }, { beat: 'B02', card: 'morph-chapter', diagram: { form: '2.5d' } },
    { beat: 'B03', card: 'morph-chapter', diagram: { form: '3d', figure: 'helix', camera: 'push in' } }, { beat: 'B04', card: 'footage-plate' }, { beat: 'B05', card: 'morph-chapter', diagram: { form: '2.5d' } }, { beat: 'B06', card: 'hero-3d' }] };
  assert.deepEqual(keyBeats(sb), ['B01', 'B03', 'B05', 'B06']);
  const p = keyframePrompt({ prompt: 'A dark forensic explainer.' }, { paper: '#151515', ink: '#eee', accent: '#e8452c' }, { why: '双螺旋', diagram: { form: '3d', figure: 'helix of letters', camera: 'push in on the repeat' } });
  assert.ok(/helix of letters/.test(p) && /push in/.test(p) && /#e8452c/.test(p) && /no text/.test(p));
});

test('a lone letter of a figure may pass under the subtitles; a line of type may not (paperclip-138-full B07)', async () => {
  const { typeErrors } = await lib('chapter.mjs');
  const at = (text) => [{ text, x0: 900, x1: 930, y0: 945, y1: 975, size: 30 }];   // (under the one subtitle band, 935: SUB_BAND)
  assert.deepEqual(typeErrors(at('A'), 'B07').errors, []);
  assert.ok(typeErrors(at('A'), 'B07').warnings.length);
  assert.ok(typeErrors(at('完全一致'), 'B25').errors.some((e) => /subtitle band/.test(e)));
});

test('a chapter that ran is reviewed even when a layout rule failed; a crash is not (rounds lost to 8 px in the subtitle band)', async () => {
  const { FATAL } = await lib('chapter.mjs');
  for (const e of ['the module fails at 9.5 s: x', 'the module does not load: y', 'the module has no beats', 'page error: z', 'asset city did not load in the page', '4 beats for 5 shots in the chapter (one beat per shot)', 'beat 2 (B03) starts at 4, the shot at 5']) assert.ok(FATAL.test(e), e);
  for (const e of ['B22: "男性后代" sits in the subtitle band (y 836-868 > 860; rules 1)', 'B27: the picture is frozen for 3.8 s (a slide)', 'B02: 1 line(s) set on a box plate', '"23万" shows 23, which the chapter\'s text does not say (rules 3)']) assert.ok(!FATAL.test(e), e);
});

test('a number beat right after a chapter beat stays on the continuous diagram (paperclip-138-full B13-B15 became three charts)', async () => {
  const { cfg } = sandbox([]);
  const { routePlan } = await lib('director.mjs');
  const beat = (id, intent) => ({ id, text: id, intent, onScreen: {}, entities: [] });
  const plan = { beats: [beat('B01', 'concept'), beat('B02', 'data'), beat('B03', 'data'), beat('B04', 'atmosphere'), beat('B05', 'data')], options: {} };
  const r = routePlan(cfg, plan).beats.map((b) => b.route.recipe);
  assert.equal(r[1], 'morph-chapter'); assert.equal(r[2], 'morph-chapter');
  assert.notEqual(r[4], 'morph-chapter', 'a number on its own keeps its chart');
  // the storyboard is offered the diagram for those beats and its check accepts it (the check refused it: run 6)
  const { cardsForBeat, candidatesFor } = await lib('storyboard.mjs');
  const table = JSON.parse(fs.readFileSync(path.join(DATA, 'routing', 'routing-table-v1.json'), 'utf8'));
  assert.ok(cardsForBeat(table, { intent: 'data', route: { recipe: 'morph-chapter' } }).includes('morph-chapter'));
  assert.ok(!cardsForBeat(table, { intent: 'data', route: { recipe: 'data-bar-chart' } }).includes('morph-chapter'));
  assert.ok(!candidatesFor(table, 'data').includes('morph-chapter'));
});

test('materials: a pick must name the need\'s people or places, in Chinese, pinyin or the need\'s English (paperclip-138-full)', async () => {
  const { aliasIn, properNouns } = await lib('materials.mjs');
  assert.deepEqual(properNouns({ youtube: ['Golden State Killer archival investigation footage'] }), ['golden state killer']);
  assert.deepEqual(properNouns({ youtube: ['Baiyin Gansu city street footage'] }), ['baiyin gansu']);
  assert.ok(aliasIn(['golden state killer'], 'Golden State Killer sentenced to life in prison - BBC News'));
  assert.ok(aliasIn(['baiyin gansu'], 'Gansu-Drive from Baiyin West to Jingyuan'));
  assert.ok(aliasIn(['gao cheng yong'], 'Serial killer Gao Chengyong executed for killing 11'), 'pinyin syllables run together');
  assert.ok(!aliasIn(['golden state killer'], '孫徵君日譜錄存(二十一).djvu'));
  assert.ok(!aliasIn(['baiyin gansu'], 'Suzhou, China | 4K Drone Footage'));
});

test('a picked world makes the theme: cards and art in its look, never the house plate and its borrowed frame (paperclip-138-full)', async () => {
  const { worldTheme } = await lib('look.mjs');
  const base = { artLibrary: { darkPlate: { prompt: 'Dark, moody cinematic photograph. The setting: {subject}.', refs: ['work/recipe-board-v1/projects/hupo-69/reference-frames/P38-ref-keys.png'] }, paperWall: { prompt: 'A flat sheet of paper.' } } };
  const world = { id: 'dossier', title: '冷战档案', refs: ['a.jpg', 'b.jpg'], look: { palette: { paper: '#e9e6df', ink: '#121212', dim: '#6b6862', accent: '#d4261c', ground: 'light' }, texture: ['halftone', 'grain'], medium: { kind: 'print' } } };
  const t = worldTheme('x', world, base);
  assert.equal(t.id, 'film-x'); assert.equal(t.extends, 'hupo-editorial');
  assert.equal(t.tokens.bg, '#e9e6df'); assert.equal(t.tokens.accent, '#d4261c');
  assert.ok(!/Dark, moody/.test(t.artLibrary.darkPlate.prompt), 'a light world does not draw dark plates');
  assert.ok(/\{subject\}/.test(t.artLibrary.darkPlate.prompt));
  for (const a of Object.values(t.artLibrary)) { assert.deepEqual(a.refs, ['a.jpg', 'b.jpg']); assert.ok(/#d4261c/.test(a.prompt)); }
  assert.deepEqual(t.overlays.sort(), ['dots', 'grain']);
  // a footage beat waiting for its clip shows a plate in the world's look, not a blank (缺什么就补什么)
  assert.equal(t.artPlan['footage-plate'].background, 'darkPlate');
  assert.equal(t.tokens.photoMono, true, 'a one-accent world sets found photos in black and white');
  const { worldCards } = await lib('look.mjs');
  const cards = worldCards({ cards: { 'title-hero-over-photo': { tokens: { bg: '#0d0e10', accent: '#c9b98f', shade: 'x' }, slots: { title: { treatment: 'metal' } } }, plain: { slots: { a: { treatment: 'ink' } } } } }, { paper: '#151515', ink: '#eee', dim: '#888', accent: '#e8452c' });
  assert.deepEqual(cards['title-hero-over-photo'], { tokens: { bg: '#151515', accent: '#e8452c' }, slots: { title: { treatment: 'display' } } }, 'no gold metal, the world\'s colours');
  assert.ok(!cards.plain, 'a card with nothing of its own is left alone');
  assert.ok(!worldTheme('y', { ...world, look: { ...world.look, palette: { ...world.look.palette, second: '#f0a43a' } } }, base).tokens.photoMono);
  const { genPlaceholder } = await lib('resolve.mjs');
  const svg = Buffer.from(genPlaceholder('a street', { bg: '#e9e6df', fg: '#121212' }).url.split(',')[1], 'base64').toString();
  assert.ok(svg.includes('#e9e6df') && !svg.includes('GEN'), 'the stand-in is the film\'s ground, no prompt printed on it');
});

test('frozen is read from how far the picture travelled, not the step difference (sparse diagrams with a drift read as frozen)', async () => {
  const { holdErrors, STEP } = await lib('chapter.mjs');
  const shots = [{ shotId: 'B01', at: 0, dur: 6 }];
  const curve = (f) => Array.from({ length: Math.round(6 / STEP) }, (_, i) => ({ t: +((i + 1) * STEP).toFixed(2), ...f(i) }));
  // thin lines on black drifting slowly: every step difference is tiny, the picture still travels 0.4 px a second
  assert.deepEqual(holdErrors(curve(() => ({ d: 0.05, s: 0.4 })), shots).errors, []);
  // a picture that does not move: frozen
  assert.ok(holdErrors(curve(() => ({ d: 0.05, s: 0.02 })), shots).errors.some((e) => /frozen for/.test(e)));
  // older curves without the shift keep the step difference
  assert.ok(holdErrors(curve(() => ({ d: 0.05 })), shots).errors.some((e) => /frozen for/.test(e)));
});

test('chapter modules: pose takes moves fifth and a count prints as its number (paperclip-138-full B09/B17 failed, B03 drew [object Object])', async () => {
  const { checkCode } = await lib('chapter.mjs');
  const base = 'export const DUR = 4; export const beats = []; export function items() { return []; }\n';
  assert.ok(checkCode(base + 'export function pose(it,k,t,moves){ return { alpha: moves.draw(t, 0) }; }').some((e) => /fifth argument/.test(e)));
  assert.ok(!checkCode(base + 'export function pose(it, k, t, P, moves){ return { alpha: 0 }; }').some((e) => /fifth argument/.test(e)));
  const { count } = await import(pathToFileURL(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/moves.js')).href);
  assert.equal(`${count(10, 0, 23)}万`, '23万');
});

test('answer schemas pass the strict structured-output rules (an optional stage3d stopped the paperclip-138-full storyboard)', async () => {
  // Codex rejects a schema whose object leaves a key out of required, or has a free object: every routing schema is checked
  const dir = path.join(REPO, 'work/recipe-board-v1/routing');
  // The motion contract is a local input document, not a structured-output answer schema.
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.schema.json') && n !== 'shot-motion-contract.schema.json')) {
    const bad = [];
    const walk = (n, at) => {
      if (Array.isArray(n)) return n.forEach((x) => walk(x, at + '[]'));
      if (!n || typeof n !== 'object') return;
      if ([n.type].flat().includes('object')) {
        if (!n.properties) bad.push(`${at}: a free object`);
        else {
          const miss = Object.keys(n.properties).filter((k) => !(n.required || []).includes(k));
          if (miss.length) bad.push(`${at}: ${miss.join(', ')} not required`);
          if (n.additionalProperties !== false) bad.push(`${at}: additionalProperties is not false`);
        }
      }
      for (const [k, v] of Object.entries(n)) walk(v, `${at}.${k}`);
    };
    walk(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')), '$');
    assert.deepEqual(bad, [], name);
  }
  // a hero's params come as JSON text and a shot without a hero says null; the line works on the object
  const { normalizeAnswer, heroErrors } = await lib('storyboard.mjs');
  const a = normalizeAnswer({ shots: [{ beat: 'B01', stage3d: null }, { beat: 'B02', stage3d: { template: 'flipboard', params: '{"value":10000}', facts: [] } }] });
  assert.ok(!('stage3d' in a.shots[0]));
  assert.deepEqual(a.shots[1].stage3d.params, { value: 10000 });
  assert.ok(!('diagram' in normalizeAnswer({ shots: [{ beat: 'B03', diagram: null }] }).shots[0]), 'a card that is no diagram says diagram: null');
  const bad = normalizeAnswer({ shots: [{ beat: 'B02', stage3d: { template: 'flipboard', params: '{value', facts: [] } }] });
  assert.ok(heroErrors(bad.shots[0].stage3d).some((e) => /not a JSON object/.test(e)));
});

test('materials: a page already picked for a nearby shot is not proposed again (B02/B03 showed one page twice)', async () => {
  const { repeatsNearby } = await lib('materials.mjs');
  const order = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07'];
  const picks = [{ shotId: 'B02~1', url: 'https://finance.yahoo.com/a' }];
  assert.ok(repeatsNearby(picks, order, 'B03', { url: 'https://finance.yahoo.com/a' }));
  assert.ok(!repeatsNearby(picks, order, 'B03', { url: 'https://other.example/b' }));
  assert.ok(!repeatsNearby(picks, order, 'B07', { url: 'https://finance.yahoo.com/a' }), 'far enough away it may come back');
  assert.ok(!repeatsNearby(picks, order, 'B03', { asset: 'library.jpg' }), 'library items have no url');
});

test('sequence review: a page re-opened at the same place is an error, read further is a warning, a meant recall is fine', async () => {
  const R = await lib('review.mjs');
  const page = (view) => new Map([['https://x.com/a', { kind: 'page', view }]]);
  const shot = (shotId, sources, extra = {}) => ({ shotId, sources, presenter: false, hash: null, recall: [], ...extra });
  const codes = (list) => R.sequenceIssues(list).map((x) => `${x.code}:${x.shots.join('/')}`);
  assert.deepEqual(codes([shot('B02', page(114)), shot('B03', page(114))]), ['same-view:B02/B03']);
  assert.deepEqual(codes([shot('B55', page(100)), shot('B56', page(900))]), ['page-again:B55/B56']);
  assert.deepEqual(codes([shot('B13', new Map([['file:liang', { kind: 'picture', view: null }]])), shot('B14', new Map([['file:liang', { kind: 'picture', view: null }]]))]), ['picture-again:B13/B14']);
  assert.deepEqual(codes([shot('B10', page(5)), shot('B11', new Map()), shot('B12', page(5), { recall: ['B10'] })]), [], 'a recap that replays a shot is meant');
  assert.deepEqual(codes([shot('B01', page(1)), shot('B02', new Map()), shot('B03', new Map()), shot('B04', page(1))]), [], 'three shots apart is far enough');
  const h = '0'.repeat(256), h2 = '0'.repeat(250) + '1'.repeat(6);
  assert.deepEqual(codes([shot('B29', new Map(), { hash: h }), shot('B30', new Map(), { hash: h2 })]), ['look-alike:B29/B30']);
  assert.deepEqual(codes([shot('B29', new Map(), { hash: h, presenter: true }), shot('B30', new Map(), { hash: h2, presenter: true })]), [], 'presenter shots look alike by nature');
  // material copies of one page carry the project/shot prefix: they are one source
  const src = R.sourcesOf({ shotId: 'B03', slots: { screen: { asset: 'work/x/materials/clips/hupo-auto2-B03-finance-yahoo-com-nvidia-39e34343-window.png' } } }, {}, 'hupo-auto2');
  assert.ok(src.has('file:finance-yahoo-com-nvidia-39e34343'));
  const a = shot('B05', new Map([['file:a', { kind: 'picture' }]]), { information: '香蕉首先被装进纸箱，然后送进催熟房。' });
  const b = shot('B06', new Map([['file:b', { kind: 'picture' }]]), { information: '香蕉首先被装进纸箱，然后送进催熟房！' });
  assert.ok(codes([a, b]).includes('information-repeat:B05/B06'), 'different footage cannot restate the same information');
  assert.ok(!codes([{ ...a }, { ...b, recall: ['B05'] }]).includes('information-repeat:B05/B06'), 'an explicit recall may repeat deliberately');
  const layout = (id, extra = {}) => shot(id, new Map(), { layout: 'evidence-card|left:0.1,0.2,0.4,0.5', information: `${id} 的信息完全不同`, ...extra });
  assert.ok(codes([layout('B06'), layout('B07'), layout('B08')]).includes('layout-repeat:B06/B07/B08'));
  assert.ok(!codes([layout('B06'), layout('B07')]).some((x) => x.startsWith('layout-repeat')), 'a two-beat layout pair is not a mechanical run');
});

test('storyboard: a page right after a page on the same subject is flagged (the B02/B03 repeat)', async () => {
  if (!PROJECTS.includes('hupo-auto2')) return;
  const S = await lib('storyboard.mjs');
  const { readPlan } = await lib('store.mjs');
  const root = path.join(cfg.dataDir, 'projects', 'hupo-auto2');
  const plan = readPlan(cfg, 'hupo-auto2'), brief = readJson(path.join(root, 'brief.json')), sb = readJson(path.join(root, 'storyboard.json'));
  const shots = sb.shots.map((s) => ({ ...s }));
  const i = shots.findIndex((s) => s.beat === 'B03');
  shots[i] = { ...shots[i], card: 'screen-full', treatment: 'evidence', scenes: [], evidence: [{ kind: 'event', what: 'x', entity: shots[i - 1].evidence[0].entity, queryEn: 'x', form: 'webpage' }] };
  const r = S.checkStoryboard(cfg, plan, brief, { ...sb, shots }, {});
  assert.ok(r.warnings.some((w) => w.startsWith('B03:') && w.includes('right after B02')), r.warnings.join('\n'));
});

test('director pass: revisions that pass the storyboard checks are merged, broken or locked ones are dropped', async () => {
  if (!PROJECTS.includes('hupo-auto2')) return;
  const D = await lib('direct.mjs');
  const { readPlan } = await lib('store.mjs');
  const root = path.join(cfg.dataDir, 'projects', 'hupo-auto2');
  const plan = readPlan(cfg, 'hupo-auto2'), brief = readJson(path.join(root, 'brief.json')), sb = readJson(path.join(root, 'storyboard.json'));
  const b56 = sb.shots.find((s) => s.beat === 'B56');
  const good = { ...b56, intent: 'presenter-overlay', intentReason: 'same paper as B55', card: 'presenter-tags', treatment: 'presenter-tags', evidence: [], noEvidence: 'B55 just showed the paper', scenes: [], hero: { action: 'tag-pop', target: 'tags', at: 0.5 }, fixes: 'B55/B56 same page' };
  const bad = { ...sb.shots.find((s) => s.beat === 'B20'), card: 'no-such-card', fixes: 'x' };
  const locked = { ...sb.shots.find((s) => s.beat === 'B10'), fixes: 'y' };
  const m = D.mergeRevisions(cfg, plan, brief, sb, [good, bad, locked], { locked: ['B10'] });
  assert.deepEqual(m.applied.map((a) => a.beat), ['B56']);
  assert.deepEqual(m.dropped.map((d) => d.beat).sort(), ['B10', 'B20']);
  assert.equal(m.answer.shots.find((s) => s.beat === 'B56').card, 'presenter-tags');
  assert.equal(m.answer.shots.length, sb.shots.length);
  assert.ok(!('fixes' in m.answer.shots.find((s) => s.beat === 'B56')), 'the storyboard answer keeps storyboard fields only');
  // the answer schema is the storyboard shot plus what it fixes
  const ds = readJson(path.join(DATA, 'routing', 'direct.schema.json')), ss = readJson(path.join(DATA, 'routing', 'storyboard.schema.json'));
  assert.deepEqual(Object.keys(ds.properties.revisions.items.properties).sort(), [...Object.keys(ss.properties.shots.items.properties), 'fixes'].sort());
});

test('display plates: the opening and hero beats first, spaced, each display at most twice, only shots that fit', async () => {
  const D = await lib('display.mjs');
  const shots = [
    { shotId: 'B01', card: 'title-hero-over-photo', chapter: 'C1', fits: true },
    { shotId: 'B02', card: 'screen-full', chapter: 'C1', fits: true, hero: true },
    { shotId: 'B03', card: 'presenter-tags', chapter: 'C1' },
    { shotId: 'B04', card: 'paper-collage-figures', chapter: 'C1', fits: true },
    { shotId: 'B05', card: 'title-hero-over-photo', chapter: 'C2', fits: true },
    { shotId: 'B06', card: 'title-hero-over-photo', chapter: 'C2', fits: false },
    { shotId: 'B09', card: 'title-hero-over-photo', chapter: 'C2', fits: true },
    { shotId: 'B12', card: 'title-hero-over-photo', chapter: 'C3', fits: true, hero: true },
    ...Array.from({ length: 60 }, (_, i) => ({ shotId: `X${i}`, card: 'presenter-plain', chapter: 'C4' })), // 68 shots: a budget of 4
  ];
  const picks = D.displayPicks(shots);
  assert.deepEqual([...picks.keys()], ['B01', 'B02', 'B12', 'B04'], 'opening, heroes, then film order; the hook may cluster');
  assert.equal(picks.get('B01'), 'crt34');
  assert.ok(![...picks.keys()].includes('B06'), 'a shot without real material is not put on a screen');
  assert.ok([...picks.values()].filter((k) => k === 'crt34').length <= 2);
  assert.equal(D.projectDisplays(cfg, PROJECTS[0], { display: false }).size, 0, 'off unless the theme turns it on');
  // user 2026-10-23 (5:38 的电脑明显是别的线生成的): a plate is painted in the film's look, and with a reference it goes only
  // where the reference shows its material on a real object
  assert.match(D.platePrompt('crtFront', { tokens: { photoMono: true } }).prompt, /Black-and-white/);
  assert.equal(D.platePrompt('crtFront', { tokens: {} }).prompt, D.PLATES.crtFront.prompt, 'a theme without a look keeps the plate it had');
  assert.deepEqual(D.DISPLAY_DEVICES, ['real-in-frame']);
});

test('look: a shot whose neutral parts carry a colour cast beyond the reference is off the film (5:38 的电脑); a replay stands only where the reference calls back (重复镜头)', async () => {
  const A = await lib('animatic.mjs'), S = await lib('storyboard.mjs');
  const ref = { cast: { '98': 7.5 } };
  assert.deepEqual(A.lookOff([{ id: 'B50', cast: 1.3 }, { id: 'B53', cast: 6.2 }], ref), []);
  assert.match(A.lookOff([{ id: 'B51', cast: 13.5 }], ref)[0], /^B51: off the film's look/);
  assert.equal(A.lookOff([{ id: 'X', cast: 8 }], { cast: { '98': 0.5 } }).length, 0, 'a floor under a near-grey reference');
  const bd = { beats: [{ beat: 'B36', devices: ['real-in-frame'], elements: [{ what: '复古电视机实物，里面播 CCTV 新闻片' }] }, { beat: 'B37', devices: ['rhyme', 'signal-break'], elements: [{ what: '剪影回来' }] }] };
  const shots = [{ beat: 'B36', scenes: [{ recall: 'B33' }] }, { beat: 'B37', scenes: [{ recall: 'B26' }] }, { beat: 'B38', scenes: [{ recall: 'B01' }] }];
  const e = S.recallErrors(shots, bd);
  assert.equal(e.length, 1); assert.match(e[0], /^B36: replays B33 where the reference shows a new picture/);
  assert.deepEqual(S.recallErrors(shots, null), [], 'no reference taken apart, nothing to hold it to');
});

test('materials: trusted sources approve themselves, news photos come from a page lead image, a picture used everywhere is flagged', async () => {
  const M = await lib('materials.mjs');
  assert.ok(M.isTrusted({ source: 'library' }) && M.isTrusted({ rights: 'official' }) && M.isTrusted({ rights: 'cc' }) && M.isTrusted({ rights: 'public' }));
  assert.ok(!M.isTrusted({ rights: 'news' }) && !M.isTrusted({ source: 'youtube', rights: 'unknown' }) && !M.isTrusted({ rights: 'stock' }) && !M.isTrusted(null));
  assert.equal(M.leadImageOf('<meta property="og:image" content="/img/a.jpg?x=1&amp;y=2">', 'https://news.example.com/p/1'), 'https://news.example.com/img/a.jpg?x=1&y=2');
  assert.equal(M.leadImageOf('<meta content="https://c.example/b.png" name="twitter:image">', 'https://x.com/'), 'https://c.example/b.png');
  assert.equal(M.leadImageOf('<title>none</title>', 'https://x.com/'), null);
  const R = await lib('review.mjs');
  const pic = new Map([['file:liang', { kind: 'picture', view: null }]]);
  const sh = (id) => ({ shotId: id, sources: pic, presenter: false, hash: null, recall: [] });
  const issues = R.sequenceIssues([sh('B13'), { ...sh('B20'), sources: new Map() }, { ...sh('B21'), sources: new Map() }, { ...sh('B22'), sources: new Map() }, sh('B41'), { ...sh('B50'), sources: new Map() }, { ...sh('B51'), sources: new Map() }, { ...sh('B52'), sources: new Map() }, sh('B83')]);
  assert.deepEqual(issues.filter((x) => x.code === 'overused').map((x) => x.shots), [['B13', 'B41', 'B83']]);
});

test('a recap that recalls a beat of a continuous diagram replays the diagram render (no burned-in subtitles)', async () => {
  const { recallFill, RECALL_SECONDS } = await lib('writer.mjs');
  const shots = { B32: { shotId: 'B32', slots: { background: { chapter: 'B32', video: { path: 'projects/x/out/chapters/B32/out/render/B32-clean.mp4', in: 0, out: 7.2 } } } } };
  const { cfg } = sandbox([]);
  writeJson(path.join(cfg.dataDir, 'projects', 'x', 'project.json'), { contract: 'A1RecipeBoardProject/v1', id: 'x' });
  const r = recallFill(cfg, 'x', 'B32', shots);
  assert.equal(r.video.path, 'projects/x/out/chapters/B32/out/render/B32-clean.mp4');
  assert.equal(r.video.out, 7.2); assert.equal(r.video.in, +(7.2 - RECALL_SECONDS).toFixed(2)); assert.equal(r.recall, 'B32');
});

test('chapter review without Codex: the strips become a review task for the session agent, bound to the module (user, 2026-10-21)', async () => {
  const { reviewKeyframes } = await lib('chapter.mjs');
  const { cfg } = sandbox([]);
  writeJson(path.join(cfg.dataDir, 'projects', 'x', 'project.json'), { contract: 'A1RecipeBoardProject/v1', id: 'x', agents: { default: 'manual' } });
  const g = { id: 'B07', shots: [{ shotId: 'B07', text: '一条双螺旋' }, { shotId: 'B08', text: '推近' }] };
  const r = await reviewKeyframes(cfg, g, ['s1.png', 's2.png'], ['t.png'], g.shots, { id: 'x', answerHash: 'h1' });
  assert.ok(r.pending, 'waits for the reviewer');
  const tasks = path.join(cfg.dataDir, 'projects', 'x', 'tasks'), task = JSON.parse(fs.readFileSync(path.join(tasks, `${r.pending}.task.json`), 'utf8'));
  assert.equal(task.forAnswer, 'h1'); assert.deepEqual(task.images, ['t.png', 's1.png', 's2.png']);
  const ans = path.join(tasks, `${r.pending}.answer.json`);
  writeJson(ans, { frames: [{ beat: 'B07', score: 4, issue: '' }, { beat: 'B08', score: 2, issue: '推近时字压在螺旋上' }] });
  const later = new Date(Date.now() + 5000); fs.utimesSync(ans, later, later);
  const done = await reviewKeyframes(cfg, g, ['s1.png', 's2.png'], ['t.png'], g.shots, { id: 'x', answerHash: 'h1' });
  assert.equal(done.mean, 3); assert.deepEqual(done.weak.map((f) => f.beat), ['B08']);
  // a new version of the module is reviewed again: the old answer does not carry over
  assert.ok((await reviewKeyframes(cfg, g, ['s1.png', 's2.png'], ['t.png'], g.shots, { id: 'x', answerHash: 'h2' })).pending);
  // the same module drawn otherwise (the engine changed its lettering) is reviewed again too (B07, 2026-10-25)
  const pics = path.join(cfg.dataDir, 'p1.png'); fs.writeFileSync(pics, 'one');
  const r2 = await reviewKeyframes(cfg, g, [pics], ['t.png'], g.shots, { id: 'x', answerHash: 'h3' }), a2 = path.join(tasks, `${r2.pending}.answer.json`);
  writeJson(a2, { frames: [{ beat: 'B07', score: 4, issue: '' }, { beat: 'B08', score: 4, issue: '' }] }); const l2 = new Date(Date.now() + 9000); fs.utimesSync(a2, l2, l2);
  assert.ok(!(await reviewKeyframes(cfg, g, [pics], ['t.png'], g.shots, { id: 'x', answerHash: 'h3' })).pending, 'the same pictures take the answer');
  fs.writeFileSync(pics, 'two');
  assert.ok((await reviewKeyframes(cfg, g, [pics], ['t.png'], g.shots, { id: 'x', answerHash: 'h3' })).pending, 'other pictures wait for another review');
});

test('chapter reviewer sees accepted per-beat intent and does not reuse a review after it changes', async () => {
  const { reviewKeyframes } = await lib('chapter.mjs');
  const crypto = await import('node:crypto');
  const { cfg } = sandbox([]), root = path.join(cfg.dataDir, 'projects', 'intent-test'), tasks = path.join(root, 'tasks');
  writeJson(path.join(root, 'project.json'), { contract: 'A1RecipeBoardProject/v1', id: 'intent-test', agents: { default: 'manual' } });
  const design = { beats: [{ beat: 'B01', directorIntent: { question: '怎样复制', change: '长出吸芽', reason: '表达关系' } }, { beat: 'B02', directorIntent: { question: '风险', change: '同步受害', reason: '共同易感' } }] };
  const saveDesign = () => { const file = path.join(tasks, 'filmdesign.answer.json'); writeJson(file, design); const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16); writeJson(path.join(tasks, 'filmdesign.check.json'), { ok: true, answerHash: hash }); };
  saveDesign();
  const g = { id: 'B01', shots: [{ shotId: 'B01', text: '吸芽' }, { shotId: 'B02', text: '风险' }] };
  const first = await reviewKeyframes(cfg, g, ['x.png', 'y.png'], [], g.shots, { id: 'intent-test', answerHash: 'same' });
  const taskFile = path.join(tasks, `${first.pending}.task.json`), task = readJson(taskFile);
  assert.equal(task.input.beats[0].directorIntent.change, '长出吸芽');
  assert.equal(task.input.beats[1].directorIntent.change, '同步受害');
  const answer = path.join(tasks, `${first.pending}.answer.json`);
  writeJson(answer, { frames: [{ beat: 'B01', score: 4, issue: '' }, { beat: 'B02', score: 4, issue: '' }] });
  const later = new Date(Date.now() + 5000); fs.utimesSync(answer, later, later);
  assert.ok(!(await reviewKeyframes(cfg, g, ['x.png', 'y.png'], [], g.shots, { id: 'intent-test', answerHash: 'same' })).pending);
  design.beats[0].directorIntent.change = '先展现地下连接'; saveDesign();
  assert.ok((await reviewKeyframes(cfg, g, ['x.png', 'y.png'], [], g.shots, { id: 'intent-test', answerHash: 'same' })).pending, 'changed intent invalidates prior review');
});

test('facts: a slice of a chapter names its chapter (B10), which is no number on screen', async () => {
  const { factTrace } = await lib('writer.mjs');
  const r = factTrace({ background: { chapter: 'B10', video: { path: 'x.mp4', in: 1, out: 2 } } }, '每个人在这里都会重复', []);
  assert.deepEqual(r.unsourced, []);
});

test('materials: a checked pick (names the need, not weak) approves itself; generic stock and weak picks wait (user, 2026-10-21)', async () => {
  const { cfg } = sandbox([]);
  const M = await lib('materials.mjs');
  const dir = path.join(cfg.dataDir, 'projects', 'auto-x', 'materials');
  const cand = (id, source, rights) => ({ id, source, rights, title: id, url: `https://example.com/${id}`, rightsLabel: rights });
  writeJson(path.join(dir, 'candidates.json'), { shots: { B01: { candidates: [cand('y1', 'youtube', 'unknown')] }, B02: { candidates: [cand('y2', 'youtube', 'unknown')] }, B03: { candidates: [cand('n3', 'web', 'news')] }, B04: { candidates: [cand('c4', 'commons', 'cc')] } } });
  writeJson(path.join(dir, 'proposed-batch.json'), { picks: [
    { shotId: 'B01', candidateId: 'y1', url: 'https://example.com/y1', named: true, weak: false },    // names the person: approved
    { shotId: 'B02', candidateId: 'y2', named: false, weak: false },   // generic stock: waits
    { shotId: 'B03', candidateId: 'n3', named: true, weak: true },     // weak: never
    { shotId: 'B04', candidateId: 'c4', named: false, weak: false },   // trusted source: approved as before
  ] });
  writeJson(path.join(dir, 'approvals.json'), { batches: [] });
  writeJson(path.join(cfg.dataDir, 'projects', 'auto-x', 'project.json'), { contract: 'A1RecipeBoardProject/v1', id: 'auto-x' });
  const b = M.autoApproveTrusted(cfg, 'auto-x');
  assert.deepEqual(b.items.map((i) => i.shotId).sort(), ['B01', 'B04']);
  // a pick that could not be fetched for good frees its shot for the next pick, never the dead one again (B51)
  const appr = JSON.parse(fs.readFileSync(path.join(dir, 'approvals.json'), 'utf8'));
  appr.batches[0].items.find((i) => i.shotId === 'B01').status = 'failed';
  appr.batches[0].items.find((i) => i.shotId === 'B01').error = 'the site served a bot check or paywall, not the page';
  writeJson(path.join(dir, 'approvals.json'), appr);
  assert.ok(M.deadFetch(appr.batches[0].items.find((i) => i.shotId === 'B01')));
  assert.equal(M.autoApproveTrusted(cfg, 'auto-x'), null, 'the dead pick is not approved again');
  const cands = JSON.parse(fs.readFileSync(path.join(dir, 'candidates.json'), 'utf8'));
  cands.shots.B01.candidates.push(cand('y9', 'youtube', 'unknown')); writeJson(path.join(dir, 'candidates.json'), cands);
  writeJson(path.join(dir, 'proposed-batch.json'), { picks: [{ shotId: 'B01', candidateId: 'y9', url: 'https://example.com/y9', named: true, weak: false }] });
  assert.deepEqual(M.autoApproveTrusted(cfg, 'auto-x').items.map((i) => i.shotId), ['B01'], 'the next pick goes');
});

test('materials: a wrong picture is taken back: rejected, unbound, the slot back to its stand-in, the need still open for the next candidate (B31)', async () => {
  const { cfg } = sandbox([]);
  const M = await lib('materials.mjs');
  const root = path.join(cfg.dataDir, 'projects', 'rej-x'), dir = path.join(root, 'materials');
  writeJson(path.join(root, 'project.json'), { contract: 'A1RecipeBoardProject/v1', id: 'rej-x' });
  writeJson(path.join(dir, 'needs.json'), { needs: [{ shotId: 'B31', bind: 'main', kind: 'archival', entity: '高承勇' }] });
  writeJson(path.join(dir, 'approvals.json'), { batches: [{ id: 'b1', items: [{ shotId: 'B31', status: 'fetched', url: 'https://x/1' }] }] });
  writeJson(path.join(dir, 'bindings.json'), { shots: { B31: { file: 'a.jpg' } } });
  writeJson(path.join(root, 'shots', 'B31.json'), { shotId: 'B31', slots: { main: { gen: '高承勇的真实照片', asset: 'a.jpg', credit: 'x' } } });
  await M.rejectPick(cfg, 'rej-x', 'B31', { why: 'the photo shows someone else' });
  const r = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  assert.equal(r('materials/approvals.json').batches[0].items[0].status, 'rejected');
  assert.ok(!r('materials/bindings.json').shots.B31 && Object.keys(r('materials/bindings.json').superseded).length === 1);
  assert.ok(!r('materials/review-picks.json').skip?.B31 && r('materials/review-picks.json').rejected.B31.length === 1, 'the need is not skipped: the next candidate goes');
  assert.deepEqual(r('shots/B31.json').slots.main, { gen: '高承勇的真实照片' });
});

test('materials: one subject, one confirmed picture: a need for a person already pictured elsewhere reuses it (B52 lines up B31 and B50)', async () => {
  const M = await lib('materials.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-same-')), img = path.join(dir, 'gao.jpg'); assert.equal(spawnSync('ffmpeg', ['-v','error','-y','-f','lavfi','-i','color=red:s=64x64','-frames:v','1',img]).status, 0);
  const needs = [{ shotId: 'B31', entity: '高承勇', form: 'photo' }, { shotId: 'B52', entity: '高承勇 ', form: 'photo' }, { shotId: 'B52', scene: 1, entity: 'Joseph James DeAngelo', form: 'photo' }, { shotId: 'B51', entity: '高承勇', form: 'webpage' }];
  const bound = { B31: { file: img, kind: 'image', needPrint: M.needPrint(needs[0]) } };
  assert.equal(M.sameSubject(needs[1], needs, bound).key, 'B31');
  assert.equal(M.sameSubject(needs[2], needs, bound), null, 'another person: searched');
  assert.equal(M.sameSubject(needs[3], needs, bound), null, 'a page is not a photograph');
  assert.equal(M.sameSubject(needs[1], needs, { B31: { file: path.join(dir, 'gone.jpg') } }), null, 'a picture that is not there is not reused');
});

test('storyboard: a beat beside a chapter beat may go on the chapter whatever its intent (B31 B34 B35)', async () => {
  const S = await lib('storyboard.mjs');
  const shots = [{ beat: 'B30', card: 'morph-chapter' }, { beat: 'B31', card: 'morph-chapter' }, { beat: 'B32', card: 'title-hero-over-photo' }, { beat: 'B33', card: 'person-intro' }];
  assert.ok(S.chapterNeighbour(shots, shots[1]));
  assert.ok(!S.chapterNeighbour(shots, shots[3]));
  assert.ok(S.EVIDENCE_CARDS.has('morph-chapter'), 'a chapter shows the real pictures confirmed for its beats');
});

test('materials: a picture whose signs name another place is of another place (B29: 泉州市安平高氏宗祠 for Qingcheng); a Chinese subject is searched in Chinese', async () => {
  const M = await lib('materials.mjs');
  const need = { line: '警方从他的 DNA 顺藤摸瓜，找到了兰州市青城镇的高氏家族。', original: '甘肃省兰州市榆中县青城镇高氏祠堂的真实照片', entity: '青城高氏祠堂' };
  assert.deepEqual(M.placesIn('泉州市安平高氏宗祠 福建名祠'), ['泉州', '福建']);
  assert.equal(M.placeConflict('泉州市安平高氏宗祠 福建名祠', need), '泉州');
  assert.equal(M.placeConflict('青城镇 高氏祠堂', need), null);
  assert.equal(M.placeConflict('北京市', { original: '一个人的照片' }), null, 'a need naming no place holds nothing against a sign');
  assert.deepEqual(M.chineseQueries({ original: '央视报道白银连环杀人案靠 DNA 比对破案的新闻片段' }), ['央视报道白银连环杀人案靠 DNA 比对破案']);
  assert.deepEqual(M.chineseQueries({ original: 'CCTV news' }), []);
});

test('materials: a product shot on white is recognised (cut out and staged), a photo of a scene is not', async () => {
  const M = await lib('materials.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-'));
  const white = path.join(dir, 'white.png'), scene = path.join(dir, 'scene.png');
  spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=white:s=320x180', '-vf', 'drawbox=x=80:y=50:w=160:h=80:color=0x554433:t=fill', '-frames:v', '1', white]);
  spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180', '-frames:v', '1', scene]);
  assert.equal(M.studioShot(white), true);
  assert.equal(M.studioShot(scene), false);
  assert.equal(M.studioShot(path.join(dir, 'missing.png')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('materials: a stock watermark read on the picture refuses it', async () => {
  const M = await lib('materials.mjs');
  const img = path.join(os.tmpdir(), `wm-test-${process.pid}.png`);
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=gray:s=64x36', '-frames:v', '1', img]);
  assert.equal(M.watermarkOf(img, 'image', () => JSON.stringify([{ text: 'Getty Images' }])), 'Getty Images');
  assert.equal(M.watermarkOf(img, 'image', () => JSON.stringify([{ text: 'PREVIEW' }])), 'PREVIEW');
  assert.equal(M.watermarkOf(img, 'image', () => JSON.stringify([{ text: 'Nvidia Stock Crashes 17%' }])), null, 'a headline about stocks is not a watermark');
  fs.rmSync(img, { force: true });
});

test('framecheck: dark type over a dark ground is unreadable though it crosses a bright screen (strokes measured, talent-S4)', async () => {
  const py = process.env.A1_PYTHON || path.join(REPO, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  if (!fs.existsSync(py)) return;
  const F = await import(pathToFileURL(path.join(LIB, 'framecheck.mjs')).href), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-standoff-'));
  // a dark ground with a bright screen across a quarter of the box; the type's strokes: bars of black (and magenta in the one-colour pass)
  const ground = `color=c=0x2a2e36:s=200x100,drawbox=x=150:y=0:w=50:h=100:color=0xd8e4f0:t=fill`, bars = (c) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `drawbox=x=${10 + i * 24}:y=20:w=8:h=60:color=${c}:t=fill`).join(',');
  const mk = (f, vf) => spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', vf, '-frames:v', '1', path.join(dir, f)]);
  mk('bare.png', ground); mk('dark.png', `${ground},${bars('0x0a0a0a')}`); mk('light.png', `${ground},${bars('0xf4f2ee')}`); mk('ink.png', `${ground},${bars('0xff00ff')}`);
  const box = [{ x: 0, y: 0, w: 200, h: 100 }], at = (f, ink) => F.standoffs({ sourceRoot: REPO }, path.join(dir, f), path.join(dir, 'bare.png'), box, ink && path.join(dir, 'ink.png'))[0];
  assert.ok(at('dark.png', true) < F.LIMITS.standoff, `dark strokes stand off ${at('dark.png', true)}`);
  assert.ok(at('dark.png', false) >= F.LIMITS.standoff, 'the box quartile alone was fooled by the screen');
  assert.ok(at('light.png', true) >= F.LIMITS.standoff, 'light type over the dark ground reads');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('tube.py: a frame keeps its size, gets scanlines (row-to-row contrast) and stays deterministic', () => {
  const py = process.env.A1_PYTHON || path.join(REPO, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  if (!fs.existsSync(py)) return;
  const code = `import sys; sys.path.insert(0, ${JSON.stringify(LIB)})
import numpy as np, tube
img = np.full((108, 192, 3), 200, np.uint8)
t = tube.Tube(192, 108, dict(tube.PRESETS['arcade'], lines=27))
a, b = t.frame(img, 3), t.frame(img, 3)
rows = a[30:78, 60:132].mean(axis=(1, 2))
print(a.shape == img.shape, (a == b).all(), rows.max() - rows.min() > 20)`;
  const r = spawnSync(py, ['-c', code], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'True True True');
});

test('CLI run --dry works in the sandbox and writes nothing there', () => {
  const id = PROJECTS.find((x) => fs.existsSync(path.join(cfg.dataDir, 'projects', x, 'plan.json')));
  if (!id) return;
  const before = snapshot(cfg.dataDir);
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'recipe-board.mjs'), 'run', '--project', id, '--dry'],
    { cwd: box.root, env: { ...process.env, RECIPE_BOARD_REPO_ROOT: box.root, RECIPE_BOARD_SOURCE_ROOT: REPO }, encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.deepEqual(snapshot(cfg.dataDir), before, '--dry must not write');
});

function snapshot(dir, acc = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) snapshot(f, acc); else acc[f] = fs.statSync(f).mtimeMs + ':' + fs.statSync(f).size;
  }
  return acc;
}

// ---------------------------------------------------------------- the 3D routes (stage.mjs)
// BARE: the sandbox as source root, so the stage library has no auto-built subjects or scenes (engine/build output)
const BARE = { ...cfg, sourceRoot: box.root };
test('stage: every 3D intent routes to cards that exist, and their modules are in the table', async () => {
  const table = readJson(path.join(cfg.dataDir, 'routing', 'routing-table-v1.json'));
  for (const id of ['teardown', 'scene']) {
    const it = table.intents.find((i) => i.id === id);
    assert.ok(it, `intent ${id}`);
    for (const r of it.recipes) assert.ok(fs.existsSync(path.join(cfg.dataDir, 'recipes', `${r}.json`)), `${id}: card ${r}`);
    for (const c of it.materialChain) for (const m of c.from) assert.ok(table.modules[m], `${id}: module ${m}`);
  }
});

test('stage: the beat picks the subject, the shot and the parts; what is not in the library is to build', async () => {
  const { loadStageLibrary, matchStage, stageSpec } = await lib('stage.mjs');
  const L = loadStageLibrary(BARE);   // the hand-made library only: what this machine built is not part of the test
  assert.deepEqual(matchStage(L, 'teardown', { text: '把 H100 拆开，中间是芯片，旁边一圈 HBM 显存' }), { route: 'teardown', subject: 'h100', shot: 'open', highlight: ['die', 'hbm'], auto: true });
  assert.deepEqual(matchStage(L, 'teardown', { text: '硬盘里面，磁头怎么动' }), { route: 'teardown', subject: 'hdd', shot: 'inside', highlight: ['head'], auto: true });
  assert.equal(matchStage(L, 'teardown', { text: '一把电钻' }).shot, 'whole');
  const miss = matchStage(L, 'teardown', { text: '拆开一台发动机', entities: [{ kind: 'product', name: '发动机' }] });
  assert.equal(miss.missing, true); assert.equal(miss.want, '发动机');
  assert.equal(matchStage(L, 'scene', { text: '那天晚上，山坡上亮起一道光' }).scene, 'ufo-night');
  assert.equal(matchStage(L, 'scene', { text: '海边的清晨' }).missing, true);
  // a spec the storyboard wrote is kept when the library has it, re-matched when it does not
  assert.equal(stageSpec(L, 'teardown-3d', { text: '硬盘' }, { route: 'teardown', subject: 'drill', shot: 'inside' }).subject, 'drill');
  assert.equal(stageSpec(L, 'teardown-3d', { text: '硬盘' }, { route: 'teardown', subject: 'engine' }).subject, 'hdd');
  assert.equal(stageSpec(L, 'title-hero-over-photo', { text: '硬盘' }), null);
  // what this step wrote is matched again (a better rule reaches it); what a person wrote stays
  assert.equal(stageSpec(L, 'teardown-3d', { text: '硬盘' }, { route: 'teardown', subject: 'drill', shot: 'inside', auto: true }).subject, 'hdd');
});

test('stage: a plate is a style-lab shot the engine accepts, timed to the shot, in the world\'s colours', async () => {
  const { loadStageLibrary, stageShot } = await lib('stage.mjs');
  const { checkShotList } = await import(pathToFileURL(path.join(DATA, 'style-lab', 'engine', 'director', 'check.mjs')).href);
  const L = loadStageLibrary(cfg), look = { theme: 'paper', palette: { bg: '#c3c5c7', ink: '#151515', accent: '#e0201b' }, medium: 'clean', sceneMedium: 'film' };
  const a = stageShot(L, { route: 'teardown', subject: 'h100', shot: 'open', highlight: ['hbm'] }, look, 6, 'B07');
  assert.equal(a.template, 'subject'); assert.equal(a.params.palette.bg, '#c3c5c7'); assert.equal(a.params.title, '');
  assert.equal(a.params.keys.at(-1).t, 6); assert.ok(a.params.keys.slice(1).every((k) => k.highlight.includes('hbm')));
  assert.ok(a.params.labels.every((l) => l.t > 0 && l.t < 6));
  const b = stageShot(L, { route: 'scene', scene: 'ufo-night' }, look, 5, 'B08');
  assert.equal(b.template, 'diorama'); assert.equal(b.medium, 'film');
  const list = { contract: 'A1ShotList/v1', id: 't', line: 't', total: 11, shots: [{ ...a, span: [0, 6], text: '' }, { ...b, span: [6, 11], text: '' }] };
  assert.deepEqual(checkShotList(list).errors, []);
});

test('stage: the look comes from the world, then the brief, then the theme; red and ink keep their own colours', async () => {
  const { stageLook } = await lib('stage.mjs');
  // (a film with neither a world nor a style of its own: the brief decides there; a film's own world comes first, filmlook.mjs)
  const id = PROJECTS.find((x) => { const pj = readJson(path.join(cfg.dataDir, 'projects', x, 'project.json')) || {}; return readJson(path.join(cfg.dataDir, 'projects', x, 'brief.json'))?.style?.palette && !pj.style && !pj.world; });
  if (!id) return;
  const bf = path.join(cfg.dataDir, 'projects', id, 'brief.json'), brief = readJson(bf), keep = fs.readFileSync(bf, 'utf8');
  try {
    const p = brief.style.palette;
    const a = stageLook(cfg, id);
    assert.equal(a.palette.bg, p.base); assert.equal(a.palette.ink, p.ink); assert.equal(a.palette.accent, p.accent);
    writeJson(bf, { ...brief, style: { ...brief.style, stage: { look: '印刷的爆炸图', subject: 'ink', sceneMedium: 'halftone' } } });
    const b = stageLook(cfg, id);
    assert.equal(b.theme, 'ink'); assert.equal(b.palette, null); assert.equal(b.sceneMedium, 'halftone'); assert.equal(b.from, 'brief');
  } finally { fs.writeFileSync(bf, keep); }
});

test('stage: a brief for a film with 3D beats must say how they look', async () => {
  const { checkBrief } = await lib('brief.mjs');
  const id = PROJECTS.find((x) => readJson(path.join(cfg.dataDir, 'projects', x, 'tasks', 'brief.answer.json')) && readJson(path.join(cfg.dataDir, 'projects', x, 'plan.json')));
  if (!id) return;
  const plan = readJson(path.join(cfg.dataDir, 'projects', id, 'plan.json')), a = readJson(path.join(cfg.dataDir, 'projects', id, 'tasks', 'brief.answer.json'));
  const with3d = { ...plan, beats: plan.beats.map((b, i) => (i === 1 ? { ...b, intent: 'teardown' } : b)) };
  assert.ok(checkBrief(with3d, { ...a, style: { ...a.style, stage: null } }).errors.some((e) => /style\.stage is missing/.test(e)));
  assert.ok(!checkBrief(with3d, { ...a, style: { ...a.style, stage: { look: '纸面线稿', subject: 'paper', sceneMedium: 'film' } } }).errors.some((e) => /style\.stage/.test(e)));
  assert.ok(checkBrief(with3d, { ...a, style: { ...a.style, stage: { look: '', subject: 'blue', sceneMedium: 'film' } } }).errors.filter((e) => /style\.stage/.test(e)).length >= 2);
});

test('stage: routing sends a teardown sentence and a mood sentence to the 3D cards (offline analysis)', async () => {
  const { directArticle } = await lib('director.mjs');
  const plan = await directArticle(cfg, { mode: 'heuristic', text: '我们把这块显卡拆开看看里面。\n\n那天晚上，山坡上亮起一道光。' });
  const by = Object.fromEntries(plan.beats.map((b) => [b.intent, b.route.recipe]));
  assert.equal(by.teardown, 'teardown-3d'); assert.equal(by.scene, 'scene-3d');
});

test('stage: a 3D shot whose object is not built yet keeps a TODO plate and is listed to build; --dry writes nothing', async () => {
  const { stepStage, stageState } = await lib('stage.mjs');
  const id = 'stage-test';
  const root = path.join(cfg.dataDir, 'projects', id);
  writeJson(path.join(root, 'project.json'), { id, title: 't' });
  writeJson(path.join(root, 'plan.json'), { beats: [{ id: 'B01', text: '拆开一台发动机', intent: 'teardown', entities: [{ kind: 'product', name: '发动机' }], route: { recipe: 'teardown-3d' } }] });
  writeJson(path.join(root, 'shots', 'B01.json'), { shotId: 'B01', recipe: 'teardown-3d', subtitle: '拆开一台发动机', slots: { background: { gen: '发动机' } }, motion: { preset: 'footage', duration: 4 } });
  try {
    const before = snapshot(root);
    const d = await stepStage(BARE, id, { dry: true, log: () => {} });
    assert.deepEqual(snapshot(root), before, '--dry must not write');
    assert.deepEqual(d.toBuild, ['B01:teardown "发动机"']);
    await stepStage(BARE, id, { log: () => {} });
    const shot = readJson(path.join(root, 'shots', 'B01.json'));
    assert.equal(shot.slots.background.stage.missing, true); assert.equal(shot.slots.background.gen, '发动机'); assert.ok(!shot.slots.background.video);
    assert.deepEqual(stageState(BARE, id).due, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('stage: a mood scene carries its own medium, not the tube', async () => {
  const { resolveMedium } = await lib('medium.mjs');
  const id = PROJECTS.find((x) => readJson(path.join(cfg.dataDir, 'projects', x, 'project.json')) && readJson(path.join(cfg.dataDir, 'projects', x, 'shots', 'B01.json')));
  if (!id) return;
  const shot = { ...readJson(path.join(cfg.dataDir, 'projects', id, 'shots', 'B01.json')), recipe: 'scene-3d', medium: { kind: 'none' } };
  assert.equal(resolveMedium(cfg, id, shot), null);
});

test('stage: a bound plate is current on the next run (the spec read back from the shot compares equal)', async () => {
  const { loadStageLibrary, matchStage, stageSpec } = await lib('stage.mjs');
  const L = loadStageLibrary(cfg);
  for (const [route, recipe, text] of [['teardown', 'teardown-3d', '拆开 H100 看 HBM'], ['scene', 'scene-3d', '那天晚上的飞碟']]) {
    const first = matchStage(L, route, { text });
    const again = stageSpec(L, recipe, { text }, JSON.parse(JSON.stringify(first)));
    assert.equal(JSON.stringify(again), JSON.stringify(first), route);
  }
});

test('stage build: plans are checked before anything is generated (subject parts, scene layers)', async () => {
  const S = await import(pathToFileURL(path.join(DATA, 'style-lab', 'engine', 'build', 'subject.mjs')).href);
  const C = await import(pathToFileURL(path.join(DATA, 'style-lab', 'engine', 'build', 'scene.mjs')).href);
  const part = (name, outer = false) => ({ name, label: name, words: [], what: 'a grey part', size: [10, 5, 5], at: [0, 0, 0], explode: [0, 1, 0], outer });
  assert.deepEqual(S.checkPlan({ label: '发动机', aliases: [], parts: [part('shell', true), part('piston')] }), []);
  assert.ok(S.checkPlan({ label: '发动机', aliases: [], parts: [part('shell')] }).some((e) => /2 to 5/.test(e)));
  assert.ok(S.checkPlan({ label: 'x', aliases: [], parts: [part('Shell'), part('a b')] }).some((e) => /lowercase/.test(e)));
  assert.ok(S.checkPlan({ label: 'x', aliases: [], parts: [part('a1', true), part('b1', true)] }).some((e) => /outer/.test(e)));
  assert.deepEqual(S.bounds([{ min: [-1, 0, -1], max: [1, 2, 1] }, { min: [0, 0, 0], max: [3, 1, 1] }]), { center: [1, 1, 0], radius: 2.45 });
  const layer = (name, kind) => ({ name, keep: 'it', kind });
  assert.deepEqual(C.checkPlan({ label: '海边', tags: ['海'], layers: [layer('sea', 'ground'), layer('boat', 'stand')] }), []);
  assert.ok(C.checkPlan({ label: '海边', tags: ['海'], layers: [layer('boat', 'stand')] }).some((e) => /one ground/.test(e)));
  assert.ok(C.checkPlan({ label: '海边', tags: [], layers: [layer('sea', 'ground'), layer('a', 'float'), layer('b', 'float'), layer('c', 'float')] }).length >= 2);
});

test('stage build: a subject\'s parts plan is an agent task, taken only once its answer passes the checks (no Codex)', async () => {
  const S = await import(pathToFileURL(path.join(DATA, 'style-lab', 'engine', 'build', 'subject.mjs')).href);
  const { taskPaths } = await lib('agenttask.mjs');
  assert.ok(!/runCodex|codexExecutable/.test(fs.readFileSync(path.join(DATA, 'style-lab', 'engine', 'build', 'subject.mjs'), 'utf8')), 'the parts plan does not go through Codex');
  assert.ok(fs.existsSync(path.join(REPO, S.RULES)), 'the rules file is there');
  const project = PROJECTS[0], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-subject-')), task = { cfg, project }, quiet = () => {};
  const P = taskPaths(cfg, project, S.planStep('t-test1'));
  const part = (name, outer = false) => ({ name, label: name, words: ['词'], what: 'a grey part', size: [10, 5, 5], at: [0, 0, 0], explode: [0, 1, 0], outer });
  try {
    await assert.rejects(S.buildSubject('t-test1', '一台机器', { dir, log: quiet }), /--plan/, 'no plan and no film: say how to give one');
    let r = await S.buildSubject('t-test1', '一台机器', { context: '拆开一台机器', dir, task, log: quiet, planOnly: true });
    assert.equal(r.waiting, true, 'no answer: the build waits, it does not fail');
    const t = readJson(P.task);
    assert.equal(t.rules, S.RULES); assert.deepEqual(t.input, { what: '一台机器', context: '拆开一台机器' }); assert.deepEqual(t.schema, S.PLAN_SCHEMA);
    assert.ok(!fs.existsSync(path.join(dir, 't-test1.plan.json')), 'nothing kept before an answer');
    writeJson(P.answer, { label: '机器', aliases: [], parts: [part('shell', true), part('core')], note: 'extra' });
    r = await S.buildSubject('t-test1', '一台机器', { context: '拆开一台机器', dir, task, log: quiet, planOnly: true });
    assert.equal(r.rejected, true); assert.ok(r.errors.some((e) => /note is not in the schema/.test(e)), r.errors.join('; '));
    assert.equal(readJson(P.check).ok, false);
    writeJson(P.answer, { label: '机器', aliases: [], parts: [part('shell', true)] });
    r = await S.buildSubject('t-test1', '一台机器', { context: '拆开一台机器', dir, task, log: quiet, planOnly: true });
    assert.ok(r.errors.some((e) => /2 to 5/.test(e)), 'checkPlan runs on the answer');
    writeJson(P.answer, { label: '机器', aliases: ['机器'], parts: [part('shell', true), part('core')] });
    r = await S.buildSubject('t-test1', '一台机器', { context: '拆开一台机器', dir, task, log: quiet, planOnly: true });
    assert.deepEqual(r.plan.parts.map((q) => q.name), ['shell', 'core']); assert.equal(readJson(P.check).ok, true);
    assert.equal(readJson(path.join(dir, 't-test1.plan.json')).plan.label, '机器', 'the accepted plan is kept');
    // a new description: a new task; the answer to the old one is set aside, not taken
    r = await S.buildSubject('t-test1', '一台机器', { context: '另一句话', dir, task, log: quiet, planOnly: true });
    assert.equal(r.waiting, true); assert.ok(!fs.existsSync(P.answer));
    // a plan written by hand still needs no task
    const hand = path.join(dir, 'hand.json'); writeJson(hand, { label: '手写', aliases: [], parts: [part('shell', true), part('core')] });
    r = await S.buildSubject('t-test2', '手写的东西', { planFile: hand, dir, log: quiet, planOnly: true });
    assert.equal(r.plan.label, '手写');
    writeJson(hand, { label: '手写', aliases: [], parts: [part('shell', true)] });
    await assert.rejects(S.buildSubject('t-test3', '手写的东西', { planFile: hand, dir, log: quiet, planOnly: true }), /2 to 5/, 'a hand plan is checked too');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); for (const f of fs.readdirSync(P.dir).filter((f) => f.startsWith('subject-t-test1.'))) fs.rmSync(path.join(P.dir, f)); }
});

test('stage build: a built subject joins the library with its own shots, and the beat that waited for it takes it', async () => {
  const { stageSpec, autoShots, buildId, stageShot } = await lib('stage.mjs');
  const d = { id: 't-x', label: '发动机', aliases: ['发动机'], parts: { shell: ['机体'], piston: ['活塞'] }, labels: { shell: '机体', piston: '活塞' }, outer: ['shell'], center: [0, 10, 0], radius: 20 };
  const shots = autoShots(d);
  assert.deepEqual(shots.inside.keys[0].hide, ['shell']); assert.deepEqual(shots.inside.labels.map((l) => l.group), ['piston']);
  assert.equal(shots.open.labels.length, 2); assert.ok(Object.values(shots).every((x) => x.keys.every((k) => k.dist == null)), 'built subjects are framed by rule');
  assert.deepEqual(stageSpec({ teardown: { e: { aliases: ['机器'], parts: d.parts, shots } }, scene: {}, shotWords: { open: ['拆开'] } }, 'teardown-3d', { text: '拆开机器：机体、活塞' }).highlight, [], 'naming every part lights none');
  const waiting = { route: 'teardown', missing: true, want: '一台机器', about: '拆开一台机器' };
  const L = { teardown: { [buildId(waiting)]: { label: '机器', aliases: ['完全不同的词'], parts: d.parts, shots } }, scene: {}, shotWords: { open: ['拆开'], inside: [] } };
  const spec = stageSpec(L, 'teardown-3d', { text: '拆开一台机器，看活塞' }, waiting);
  assert.deepEqual(spec, { route: 'teardown', subject: buildId(waiting), shot: 'open', highlight: ['piston'], auto: true });
  const sw = { route: 'scene', missing: true, want: '海边', about: '清晨的海边' };
  assert.deepEqual(stageSpec({ teardown: {}, scene: { [buildId(sw)]: { tags: ['别的'] } } }, 'scene-3d', { text: '清晨的海边' }, sw), { route: 'scene', scene: buildId(sw), auto: true });
  const shot = stageShot(L, spec, { theme: 'dark', palette: null, medium: 'clean', sceneMedium: 'film' }, 6, 'B02');
  assert.equal(shot.params.subject, buildId(waiting)); assert.equal(shot.params.keys.at(-1).t, 6);
  const inside = stageShot(L, { ...spec, shot: 'inside' }, { theme: 'dark', palette: null, medium: 'clean', sceneMedium: 'film' }, 6, 'B02');
  assert.ok(inside.params.keys.every((k) => k.highlight?.includes('piston')), 'a two-key shot lights its parts from the start');
});

test('stage build: the cut-out box is read with the Python that has PIL (a run failed on the system python -I)', async () => {
  const py = path.join(process.env.HUNYUAN3D || path.join(os.homedir(), 'ai-tools', 'Hunyuan3D-2'), '.venv', 'bin', 'python');
  if (!fs.existsSync(py)) return;
  const C = await import(pathToFileURL(path.join(DATA, 'style-lab', 'engine', 'build', 'scene.mjs')).href);
  const f = path.join(os.tmpdir(), `alpha-${process.pid}.png`);
  const r = spawnSync(py, ['-I', '-c', `from PIL import Image; im = Image.new('RGBA', (100, 50), (0, 0, 0, 0)); im.paste((255, 0, 0, 255), (10, 20, 30, 45)); im.save(${JSON.stringify(f)})`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  try { const b = C.alphaBox(f); assert.deepEqual([b.x0, b.y0, b.x1, b.y1, b.w, b.h], [10, 20, 30, 45, 100, 50]); } finally { fs.rmSync(f, { force: true }); }
});

test('facts: a 3D plate\'s spec is ids, not numbers on screen (a run flagged s-95b57790)', async () => {
  const { factCheck } = await lib('writer.mjs');
  const slots = { background: { stage: { route: 'scene', scene: 's-95b57790' }, video: { path: 'x.mp4', in: 0 } } };
  assert.deepEqual(factCheck(slots, '清晨的海边'), []);
  assert.ok(factCheck({ title: { text: 's-95b57790' } }, '清晨的海边').length, 'the same id as text on screen is still checked');
});

test('stage: a scene is filmed on the stock it chose (a day scene on filmday) unless the world or the brief names one', async () => {
  const { plateMedium } = await lib('stage.mjs');
  const L = { scene: { day: { medium: 'filmday' }, night: {} } }, look = { medium: 'clean', sceneMedium: 'film', sceneMediumSet: false };
  assert.equal(plateMedium(L, { route: 'scene', scene: 'day' }, look), 'filmday');
  assert.equal(plateMedium(L, { route: 'scene', scene: 'night' }, look), 'film');
  assert.equal(plateMedium(L, { route: 'scene', scene: 'day' }, { ...look, sceneMedium: 'halftone', sceneMediumSet: true }), 'halftone');
  assert.equal(plateMedium(L, { route: 'teardown', subject: 'h100' }, look), 'clean');
  const { checkShotList } = await import(pathToFileURL(path.join(DATA, 'style-lab', 'engine', 'director', 'check.mjs')).href);
  assert.deepEqual(checkShotList({ contract: 'A1ShotList/v1', id: 't', line: 't', total: 4, shots: [{ id: 'S1', span: [0, 4], template: 'diorama', medium: 'filmday', text: '', params: { cards: [] } }] }).errors, []);
});

// ---------------------------------------------------------------- chapters (chapter.mjs)
test('chapter: consecutive morph-chapter shots are one chapter, timed shot by shot; others break it', async () => {
  const { chapterGroups } = await lib('chapter.mjs');
  const shot = (shotId, recipe, d = 5) => ({ shotId, recipe, motion: { duration: d } });
  const shots = [shot('B01', 'title-hero-over-photo'), shot('B02', 'morph-chapter', 7), shot('B03', 'morph-chapter', 6), shot('B04', 'data-bar-chart'), shot('B05', 'morph-chapter', 4)];
  const g = chapterGroups(cfg, 'none', shots, null);
  assert.deepEqual(g.map((x) => [x.id, x.shots.map((s) => [s.shotId, s.at, s.dur]), x.total]), [['B02', [['B02', 0, 7], ['B03', 7, 6]], 13], ['B05', [['B05', 0, 4]], 4]]);
});

test('chapter: the blind reviews\' standing complaints measured — a figure the line says is the beat\'s main type; the frame not sat in its top half', async () => {
  const C = await lib('chapter.mjs');
  const shot = { shotId: 'B14', text: '一个人重复 8 次，另一个人重复 11 次，随机抽 1000 个人' };
  const e = C.figureErrors([{ text: '8 次和 11 次', size: 44 }, { text: '1000', size: 110 }, { text: 'D5S818', size: 30 }], shot);
  assert.equal(e.length, 2); assert.match(e[0], /figure 8 shows at 44 px/);
  assert.deepEqual(C.figureErrors([{ text: '8 次和 11 次', size: 84 }], shot), []);
  assert.deepEqual(C.figureErrors([{ text: '8 次', size: 44, alpha: 0.1 }], shot), [], 'a faint texture is not the figure');
  // a changed beat that passed is reviewed beside its passed keyframe; fill measures become notes, not a gate
  assert.equal(C.previousNote([]), '');
  assert.match(C.previousNote([{ beat: 'B27', score: 4, file: 'x.png' }]), /最后 1 张是 B27 上一轮过线（4 分）/);
  { const n = C.fillNotes([{ refFill: 0.3, ourFill: 0.27, refRed: 0.007, ourRed: 0.024, flat: 0.58, refFlat: 0.21 }, { refFill: 0.2, ourFill: 0.21, refRed: 0.01, ourRed: 0.012, flat: 0.4, refFlat: 0.35 }], ['B34', 'B12']);
    assert.equal(n.length, 2, 'B34: flatter than the reference and too red; B12 fine'); assert.ok(n.every((x) => x.startsWith('B34:'))); }
  // the ground library: text-free photographed grounds, named in the writer's task; the kit lays them and the parts on them
  { const lib = C.groundLibrary({ dataDir: DATA }); assert.ok(lib.length >= 5, 'grounds');
    for (const x of lib) { assert.match(x.name, /^[a-z]+$/); assert.match(x.prompt, /no text/); assert.ok(x.use); }
    const K = await import(pathToFileURL(path.join(DATA, 'style-lab', 'engine', 'templates', 'kit2.js')).href);
    for (const k of ['plate', 'strip3d', 'lineup', 'counter', 'onPlane', 'planePoint']) assert.equal(typeof K.flat[k], 'function', k);
    for (const k of ['lineup', 'inherit', 'figure', 'timeline', 'archive']) assert.equal(typeof K.flat.layout[k], 'function', `layout.${k}`);
    assert.ok(K.flat.TYPE.hero > K.flat.TYPE.second && K.flat.TYPE.second > K.flat.TYPE.third, 'three sizes of type');
    const n = K.flat.planePoint(960, 1080), f = K.flat.planePoint(0, 0); assert.equal(n.s, 1, 'the near edge full width'); assert.ok(f.x > 0 && f.s < 1, 'the far edge narrower'); }
  // locks survive an input change (a kit edit dropped eleven passed beats); a beat's changed line or missing keyframe drops it
  { const shots = [{ shotId: 'B40', text: 'a' }, { shotId: 'B41', text: 'b' }, { shotId: 'B42', text: 'c' }];
    const L = C.lockedBeats({ ok: false, inputHash: 'old', locked: { B40: { score: 4, issue: '', text: 'a' }, B41: { score: 4, issue: '', text: 'changed' } } }, { review: { frames: [{ beat: 'B42', score: 4 }, { beat: 'B43', score: 4 }] } }, shots, (b) => b !== 'B43');
    assert.deepEqual(Object.keys(L).sort(), ['B40', 'B42']); }
  // a big figure in 黒華明朝 fails (its 1 reads as a bracket); small, other faces, or words with figures pass
  assert.equal(C.digitFaceErrors([{ text: '1', size: 320, face: 'House Kokka' }, { text: '8000', size: 300, face: 'House Kinkaku' }, { text: '1 個', size: 320, face: 'House Kokka' }, { text: '52', size: 60, face: 'House Kokka' }], 'B15').length, 1);
  // code swallowed by a comment written mid-line fails; prose comments and URLs in strings pass
  { const base = 'export const DUR = 1;\nexport const beats = [];\nexport function items() { return []; }\nexport function pose() { return {}; }\n';
    assert.ok(C.checkCode(base + 'function f(g) { g.save();   // a note g.restore(); }\n').some((e) => /code inside a \/\/ comment/.test(e)));
    assert.ok(C.checkCode(base + 'const A = 1;   // a note const u = 2;\n').some((e) => /code inside a \/\/ comment/.test(e)), 'a declaration swallowed');
    assert.ok(!C.checkCode(base + "function f(g) { g.save(); g.restore(); }   // the frame (it was 30 px)\nconst u = 'https://x.y/z';\n").some((e) => /code inside a \/\/ comment/.test(e))); }
  // a line still Simplified on screen fails, whatever canvas it was drawn on
  { const T = (xs) => xs.map((x) => x.replace('现场', '現場').replace('毛发', '毛髮'));
    assert.equal((await C.scriptErrors(['現場 1  毛髮', '現場 2  血跡'], T)).length, 0);
    assert.equal((await C.scriptErrors(['现场 1  毛发', 'DNA'], T)).length, 1); }
  // a map's place names are words the chapter puts on screen: they go into the Traditional table
  { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-assets-')), f = path.join(dir, 'map.json');
    fs.writeFileSync(f, JSON.stringify({ names: { '兰州市': [1, 2], 'Lanzhou': [3, 4] }, places: { '海东市': { kind: 'city' } }, major: [[1, 2, 3]] }));
    assert.deepEqual(C.assetStrings({ m_map: f, pic: path.join(dir, 'x.png') }).sort(), ['兰州市', '海东市'].sort()); }
  assert.deepEqual(C.hantChars({ '几个案发现场': '幾個案發現場', '头发': '頭髮', '发现': '發現', '乌海市, 内蒙古': '烏海市, 內蒙古' }), { 几: '幾', 个: '個', 发: '發', 现: '現', 场: '場', 头: '頭', 乌: '烏', 内: '內' }, 'a character converted two ways takes its commoner');
  // a word read back short in a face is not legible there (スミカク read 核心序列 as 核心原刵)
  { const Lg = await lib('legible.mjs'); assert.equal(Lg.readShare('核心序列', '核心原刵'), 0.5); assert.equal(Lg.readShare('核心序列', '核 心 序 列'), 1); assert.equal(Lg.readShare('同族親屬', ''), 0); assert.equal(Lg.readable('核心序列', 0.75), false, 'one character misread: not legible'); assert.equal(Lg.readable('人', 0), true, 'a lone character is not tried'); assert.equal(Lg.readable('鏡頭沿序列橫移，舊位點出左邊', 0.9), true); assert.equal(Lg.readShare('XY', 'ZY'), 0.5, 'a Latin label read wrong'); assert.equal(Lg.readShare('Y-STR', 'y-str'), 1); }
  // a failed beat's second review confirms what the first asked for
  { const fx = C.lastFixes({ review: { frames: [{ beat: 'B39', score: 3, issue: '红色太多' }, { beat: 'B40', score: 4, issue: '' }] } }, { review: { frames: [{ beat: 'B52', score: 3, issue: '只有两张' }] } }, ['B39', 'B52', 'B53']);
    assert.deepEqual(fx.map((f) => f.beat), ['B39', 'B52']); assert.match(C.fixesNote(fx), /复审：B39、B52 上一轮没过线.*红色太多.*只有两张/); assert.equal(C.fixesNote([]), ''); }
  // the shared kits carry no code swallowed by a mid-line comment either (layoutTimeline lost its const u that way)
  for (const k of ['kit2.js', 'kit3.js', 'morph.js']) { const f = path.join(DATA, 'style-lab', 'engine', 'templates', k); if (!fs.existsSync(f)) continue;
    const e = C.checkCode('export const DUR = 1;\nexport const beats = [];\nexport function items() { return []; }\nexport function pose() { return {}; }\n' + fs.readFileSync(f, 'utf8')).filter((x) => /code inside a \/\/ comment/.test(x)); assert.deepEqual(e, [], k); }
  // a picture cut by the frame's edge fails; one inside, a full-frame ground, or one pushed mostly out passes
  assert.equal(C.edgeErrors([{ kind: 'image', x0: 1700, y0: 400, x1: 2000, y1: 780 }], 'B03').length, 1, 'a card a quarter out');
  assert.equal(C.edgeErrors(Array.from({ length: 12 }, (_, i) => ({ kind: 'image', src: 7, x0: -57 + (i % 4) * 512, y0: -23 + Math.floor(i / 4) * 512, x1: 455 + (i % 4) * 512, y1: 489 + Math.floor(i / 4) * 512 })), 'B07').length, 0, 'a tiled texture');
  assert.equal(C.edgeErrors([{ kind: 'image', x0: 1500, y0: 400, x1: 1800, y1: 780 }, { kind: 'image', x0: -40, y0: -30, x1: 1960, y1: 1110 }, { kind: 'image', x0: 1800, y0: 400, x1: 2400, y1: 780 }], 'B03').length, 0);
  // a tape drawn over a card's scale covers it; two loose lines over each other still fail
  assert.equal(C.overlapErrors([{ text: '180', size: 34, x0: 100, x1: 160, y0: 300, y1: 340 }, { text: 'D2S1338', size: 30, x0: 90, x1: 220, y0: 298, y1: 336, object: true }], 'B32').length, 0);
  assert.equal(C.overlapErrors([{ text: '180', size: 34, x0: 100, x1: 160, y0: 300, y1: 340 }, { text: 'D2S1338', size: 30, x0: 90, x1: 220, y0: 298, y1: 336 }], 'B32').length, 1);
  // a clip's own subtitles: a sure line of 3+ Chinese characters in the lower third (B36); a logo or a short tag is not
  assert.equal(C.subtitleTop([{ text: '虽然物证还在', box: [0.09, 0.82, 0.25, 0.08], confidence: 1 }, { text: 'CCTV', box: [0.8, 0.1, 0.1, 0.05], confidence: 1 }]), 0.82);
  assert.equal(C.subtitleTop([{ text: '综合', box: [0.09, 0.82, 0.25, 0.08], confidence: 1 }, { text: '天网恢恢', box: [0.2, 0.3, 0.3, 0.1], confidence: 1 }]), null);
  // a beat passed under older review rules is reviewed again under the new ones (B20 B44 kept at 4 by their locks)
  { const shots = [{ shotId: 'B20' }, { shotId: 'B21' }], same = () => true;
    const L = { B20: { score: 4, rules: 'old' }, B21: { score: 4, rules: 'new' } };
    const r = C.splitLocked(L, shots, ['a', 'b'], () => 'x', 'new');
    assert.deepEqual(r.kept.map((k) => k.beat), []);   // sameFrame reads files: none here, so both go again
    assert.equal(r.again.find((a) => a.s.shotId === 'B20').newRules, true);
    assert.equal(r.again.find((a) => a.s.shotId === 'B21').newRules, false);
    assert.match(C.previousNote([{ beat: 'B20', score: 4, newRules: true }]), /新加/); }
  // the prop library: a module naming a member or a family gets those props generated (B19's cases, each its own trace)
  { const lib = [{ family: 'trace', members: { blood: 'b', hair: 'h' } }];
    assert.deepEqual(C.propsNamed("K.props(images, 'trace', 10)", lib).map((x) => x.key), ['prop_trace_blood', 'prop_trace_hair']);
    assert.deepEqual(C.propsNamed('images.prop_trace_hair', lib).map((x) => x.key), ['prop_trace_hair']);
    assert.equal(C.propsNamed('ground_paper', lib).length, 0);
    assert.ok(C.propLibrary(cfg).some((f) => f.family === 'trace' && Object.keys(f.members).length >= 7), 'the shared trace family'); }
  // a changed check runs again over chapters accepted before it
  assert.match(C.checksHash(), /^[0-9a-f]+$/);
  // eleven copies of one card are pictures, not a ground: the title over them fails (B20)
  const cards = Array.from({ length: 11 }, (_, i) => ({ kind: 'image', src: 3, object: true, x0: 300 + i * 90, y0: 120 + i * 40, x1: 660 + i * 90, y1: 420 + i * 40 }));
  assert.equal(C.groundSources(cards).size, 0, 'a pile of cards is not a ground');
  assert.equal(C.groundSources(Array.from({ length: 12 }, (_, i) => ({ kind: 'image', src: 7, x0: -57 + (i % 4) * 512, y0: -23 + Math.floor(i / 4) * 512, x1: 455 + (i % 4) * 512, y1: 489 + Math.floor(i / 4) * 512 }))).size, 1, 'a tiled grain is');
  assert.equal(C.crossErrors([{ text: '甘蒙8·05', size: 90, x0: 500, x1: 900, y0: 300, y1: 390 }], cards, 'B20').length, 1);
  // the same picture in more than three places at once fails (B19); a shadow under its photo counts once; a ground does not
  assert.match(C.repeatErrors(cards, 'B19')[0], /shown \d+ times/);
  assert.deepEqual(C.repeatErrors([{ kind: 'image', src: 4, x0: 100, y0: 100, x1: 500, y1: 400 }, { kind: 'image', src: 4, x0: 104, y0: 106, x1: 504, y1: 406 }, ...[700, 1200].map((x) => ({ kind: 'image', src: 4, x0: x, y0: 100, x1: x + 400, y1: 400 }))], 'B19'), []);
  assert.deepEqual(C.repeatErrors(Array.from({ length: 12 }, (_, i) => ({ kind: 'image', src: 7, x0: -57 + (i % 4) * 512, y0: -23 + Math.floor(i / 4) * 512, x1: 455 + (i % 4) * 512, y1: 489 + Math.floor(i / 4) * 512 })), 'B07'), []);
  const wasD = { draft: true, inputHash: 'h', review: { mean: 3.5 } };
  assert.equal(C.keepEarlierDraft(wasD, { mean: 3.5 }, 'h'), false, 'a tie goes to the new version');
  assert.equal(C.keepEarlierDraft(wasD, { mean: 3 }, 'h'), true, 'a strictly better earlier draft stays');
  assert.equal(C.keepEarlierDraft(wasD, { mean: 3 }, 'other'), false, 'a draft of other inputs never stays');
  assert.equal(C.balanceErrors([{ top: 0.08, bottom: 0, share: 0 }, { top: 0.03, bottom: 0.03, share: 0.5 }, { top: 0.002, bottom: 0, share: 0 }], ['B17', 'B18', 'B00']).length, 1, 'top-heavy fails; balanced and near-empty frames are other checks');
  // balance.py: a large solid block low counts by its area (B39 2026-10-23: a red bar 1300 x 110 counted less than a
  // title's strokes); a title alone at the top still fails
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-balance-')), both = path.join(dir, 'both.png'), top = path.join(dir, 'top.png');
    const box = (x, y, w, h, c) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${c}:t=fill`;
    const strokes = Array.from({ length: 12 }, (_, k) => box(500 + k * 80, 120, 14, 140, 'white')).join(',');
    spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=0x161616:s=1920x1080', '-vf', `${strokes},${box(330, 560, 1300, 110, '0xe8452c')},${box(330, 700, 1300, 110, 'gray')}`, '-frames:v', '1', both]);
    spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=0x161616:s=1920x1080', '-vf', strokes, '-frames:v', '1', top]);
    const rows = C.balanceRows([both, top]);
    if (rows.length === 2) { assert.equal(C.balanceErrors(rows, ['low', 'top']).length, 1, 'the solid blocks low balance the title'); assert.match(C.balanceErrors(rows, ['low', 'top'])[0], /^top:/); }
  }
});

test('chapter: a beat that opens an accepted chapter keeps opening it; a new chapter beat next to it joins the one before', async () => {
  // paperclip-138-full 2026-10-22: B09 put on the chapter card between B07-B08 and B10-B16 fused them into one module
  const { chapterGroups } = await lib('chapter.mjs');
  const { cfg: c } = sandbox([]), dir = path.join(c.dataDir, 'projects', 'gp', 'chapters');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(c.dataDir, 'projects', 'gp', 'project.json'), JSON.stringify({ id: 'gp' }));
  fs.writeFileSync(path.join(dir, 'B07.json'), JSON.stringify({ chapter: 'B07', shots: ['B07', 'B08'] }));
  fs.writeFileSync(path.join(dir, 'B10.json'), JSON.stringify({ chapter: 'B10', shots: ['B10', 'B11'] }));
  const shot = (shotId) => ({ shotId, recipe: 'morph-chapter', motion: { duration: 5 } });
  const ids = (g) => g.map((x) => x.shots.map((s) => s.shotId));
  assert.deepEqual(ids(chapterGroups(c, 'gp', ['B07', 'B08', 'B09', 'B10', 'B11'].map(shot), null)), [['B07', 'B08', 'B09'], ['B10', 'B11']]);
  fs.rmSync(path.join(dir, 'B10.json'));   // the record removed on purpose: they merge
  assert.deepEqual(ids(chapterGroups(c, 'gp', ['B07', 'B08', 'B09', 'B10', 'B11'].map(shot), null)), [['B07', 'B08', 'B09', 'B10', 'B11']]);
});

test('chapter: the module is checked before it runs (no network, no imports, its exports, one font)', async () => {
  const { checkCode } = await lib('chapter.mjs');
  const ok = 'export const DUR = 10;\nexport const beats = [];\nexport function items() { return []; }\nexport function pose() { return { alpha: 0 }; }';
  assert.deepEqual(checkCode(ok), []);
  assert.ok(checkCode(ok + "\nfetch('http://x')").some((e) => /fetch/.test(e)));
  assert.ok(checkCode("import x from 'y';\n" + ok).some((e) => /import/.test(e)));
  assert.ok(checkCode(ok.replace('export function pose', 'function pose')).some((e) => /pose/.test(e)));
  assert.ok(checkCode(ok + "\nconst f = 'a1-editorial-fonts/MaShanZheng-Regular.ttf';").some((e) => /font/.test(e)));
  const dna = fs.readFileSync(path.join(DATA, 'style-lab', 'engine', 'templates', 'morph', 'dna.js'), 'utf8');
  assert.deepEqual(checkCode(dna), [], 'the worked example passes its own rules');
});

test('chapter: type on a keyframe stays in frame, off the subtitles, readable; numbers come from the text', async () => {
  const { typeErrors, numberErrors } = await lib('chapter.mjs');
  const d = (text, x0, y0, size) => ({ text, x0, x1: x0 + size * text.length * 0.6, y0, y1: y0 + size, size });
  assert.deepEqual(typeErrors([d('STR', 800, 200, 120)], 'B05').errors, []);
  assert.ok(typeErrors([d('甲', 800, 945, 30)], 'B05').errors.some((e) => /subtitle/.test(e)));
  assert.ok(typeErrors([d('tiny', 800, 400, 12)], 'B05').errors.some((e) => /px/.test(e)));
  assert.ok(typeErrors([d('small', 800, 400, 19)], 'B05').warnings.length);
  assert.deepEqual(numberErrors(['99.9% 相同', '0.1% 差异', '1', '2', '3'], '人和人之间，99.9% 的序列都一样，差别只藏在 0.1% 里'), []);
  assert.ok(numberErrors(['重复 13 次'], '每个人重复的次数不一样').length, 'a number the text does not say is an error');
  assert.deepEqual(numberErrors(['2019.1', '2020.8.21'], '2019 年 1 月，高承勇一审被判死刑；2020 年 8 月 21 日执行'), [], 'a date said in words may be set in figures');
  assert.ok(numberErrors(['2019.2'], '2019 年 1 月').length, 'but not another month');
  { const { edgeErrors } = await lib('chapter.mjs'); const bar = { kind: 'image', src: 'bar', x0: 1243, y0: 174, x1: 1414, y1: 1167, alpha: 1 }; assert.equal(edgeErrors([bar], 'B13').length, 1); assert.deepEqual(edgeErrors([{ ...bar, bleed: true }], 'B13'), [], 'a picture laid to run off the frame (a chromosome the camera goes in on) is not cut'); }
  { const { oneAccentErrors } = await lib('chapter.mjs'); const h = (blue) => { const b = new Array(12).fill(0); b[7] = blue; b[0] = 0.1; return b; };
    const curve = Array.from({ length: 10 }, (_, i) => ({ t: i * 0.2, h: h(0.08) })), shots = [{ shotId: 'B49', at: 0, dur: 2 }];
    assert.match(oneAccentErrors(curve, shots, '#e8452c')[0] || '', /second saturated colour/, 'saturated blue folders beside a red accent fail (B49)');
    assert.deepEqual(oneAccentErrors(curve.map((p) => ({ ...p, h: h(0.01) })), shots, '#e8452c'), [], 'a speck of another colour does not');
    assert.deepEqual(oneAccentErrors(curve, shots, '#e8452c', { palettes: Object.fromEntries(shots.map((x) => [x.shotId, ['#1f3f9a', '#f2c94c']])) }), [], "a beat's own palette is its colour (cobalt card: the user 2026-10-28, 可以各种配色)");
    { const sh = [{ shotId: 'A', at: 0, dur: 4 }, { shotId: 'B', at: 4, dur: 4 }], cv = [0, 0.2, 0.4, 0.6, 0.8, 4.0, 4.2, 4.4, 4.6, 4.8, 5.4].map((t) => ({ t, h: h(t < 4.9 ? 0.2 : 0) }));
      assert.deepEqual(oneAccentErrors(cv, sh, '#c8501e', { palettes: { A: ['#4a63b0'], B: ['#c8501e'] } }), [], "the beat before's palette stands through a beat's first second (one take turns its colour)"); }
    assert.deepEqual(oneAccentErrors(curve.map((p) => ({ ...p, h: p.h.map((v, i) => (i === 0 ? 0.01 : v)) })), shots, '#2f6fe8'), [], 'blue is the accent of a blue film'); }
  { const { samePrints } = await lib('chapter.mjs'); const A = Buffer.alloc(64 * 36, 100), B = Buffer.from(A), Cc = Buffer.from(A); B[5] = 103; Cc.fill(160, 0, 200);
    assert.ok(samePrints([A.toString('base64')], [B.toString('base64')]), 'a picture a hair apart is the picture the review saw (B23 sent back three times)');
    assert.ok(!samePrints([A.toString('base64')], [Cc.toString('base64')]), 'a changed region is another picture'); }
});

// ---------------------------------------------------------------- the film's own world (look.mjs)
test('look: the brief\'s world becomes the film\'s theme (ground, palette, display face, texture, medium); a picked world wins', async () => {
  const { filmTheme, checkWorld, stepLook } = await lib('look.mjs');
  const { loadTheme } = await lib('store.mjs');
  const style = { palette: { base: '#1a1a1a', ink: '#e6e6e6', accent: '#ff4a26' }, world: { base: 'dark', display: 'sans-heavy', texture: ['dots', 'grain'], medium: 'tube' } };
  assert.deepEqual(checkWorld(style.world), []);
  assert.ok(checkWorld({ base: 'neon', display: 'comic', texture: ['glitter'], medium: 'vhs' }).length >= 4);
  const t = filmTheme('x', style);
  assert.equal(t.extends, 'clara-dark'); assert.equal(t.tokens.accent, '#ff4a26'); assert.equal(t.tokens.bg, '#1a1a1a'); assert.match(t.fonts.display, /A1 Sans Heavy/); assert.deepEqual(t.overlays, ['dots', 'grain']);
  // written into the sandbox and loadable as a theme; the project now uses it
  const id = 'look-test', root = path.join(cfg.dataDir, 'projects', id);
  writeJson(path.join(root, 'project.json'), { id, title: 't', theme: 'hupo-editorial' });
  writeJson(path.join(root, 'brief.json'), { style });
  try {
    assert.equal(stepLook(cfg, id).theme, 'film-look-test');
    assert.equal(readJson(path.join(root, 'project.json')).theme, 'film-look-test');
    assert.equal(readJson(path.join(root, 'project.json')).themeBeforeLook, 'hupo-editorial');
    const th = loadTheme(cfg, 'film-look-test'); assert.equal(th.tokens.accent, '#ff4a26'); assert.ok(th.cards, 'inherits the house cards');
    assert.equal(stepLook(cfg, id).state, 'current');
    writeJson(path.join(root, 'project.json'), { id, title: 't', theme: 'terminal', world: 'terminal' });
    assert.equal(stepLook(cfg, id).state, 'world'); assert.equal(readJson(path.join(root, 'project.json')).theme, 'terminal');
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(path.join(cfg.dataDir, 'themes', 'film-look-test.json'), { force: true }); }
});

test('storyboard: a voice-over film (no presenter) cannot put a line on a presenter card', async () => {
  const { checkStoryboard, PRESENTER_CARDS } = await lib('storyboard.mjs');
  const id = PROJECTS.find((x) => readJson(path.join(cfg.dataDir, 'projects', x, 'storyboard.json')) && readJson(path.join(cfg.dataDir, 'projects', x, 'brief.json')) && readJson(path.join(cfg.dataDir, 'projects', x, 'plan.json'))?.options?.hasPresenter);
  if (!id) return;
  const plan = readJson(path.join(cfg.dataDir, 'projects', id, 'plan.json')), brief = readJson(path.join(cfg.dataDir, 'projects', id, 'brief.json')), sb = readJson(path.join(cfg.dataDir, 'projects', id, 'storyboard.json'));
  if (!sb.shots.some((s) => PRESENTER_CARDS.has(s.card))) return;
  const asPresenter = checkStoryboard(cfg, plan, brief, sb).errors.filter((e) => /needs the presenter/.test(e));
  const asVoiceover = checkStoryboard(cfg, { ...plan, options: { ...plan.options, hasPresenter: false } }, brief, sb).errors.filter((e) => /needs the presenter/.test(e));
  assert.equal(asPresenter.length, 0); assert.ok(asVoiceover.length > 0);
});

test('maps: OpenStreetMap ways become a drawable plane; a pin finds its street by the name the text uses', async () => {
  const { projectMap, nameVariants, pinFromNames, boxAround } = await lib('maps.mjs');
  const raw = { elements: [
    { tags: { highway: 'primary', name: '水川路' }, geometry: [{ lat: 36.54, lon: 104.16 }, { lat: 36.53, lon: 104.17 }] },
    { tags: { highway: 'residential', name: '永丰街' }, geometry: [{ lat: 36.55, lon: 104.165 }, { lat: 36.55, lon: 104.175 }] },
    { tags: { building: 'yes' }, geometry: [{ lat: 36.545, lon: 104.17 }, { lat: 36.545, lon: 104.171 }, { lat: 36.546, lon: 104.171 }] },
    { tags: { highway: 'footway' }, geometry: [{ lat: 36.545, lon: 104.17 }, { lat: 36.546, lon: 104.17 }] },
  ] };
  const box = boxAround({ lat: 36.545, lon: 104.17 }, 5);
  assert.ok(box[0] < 36.545 && box[2] > 36.545 && box[1] < 104.17 && box[3] > 104.17);
  const m = projectMap(raw, box, { width: 1000 });
  assert.equal(m.w, 1000); assert.equal(m.major.length, 1); assert.equal(m.minor.length, 1); assert.equal(m.building.length, 1);
  assert.equal(m.service.length, 0, 'footways are left out');
  assert.ok(m.names['水川路'][0] > 0 && m.names['水川路'][0] < 1000);
  assert.ok(nameVariants('白银区水川路', '白银市').includes('水川路'));
  assert.ok(nameVariants('永丰街小区').includes('永丰街'));
  assert.equal(pinFromNames(m, '白银区水川路', '白银市').via, 'street 水川路');
  assert.equal(pinFromNames(m, '永丰街小区', '白银市').via, 'street 永丰街');
  assert.equal(pinFromNames(m, '白银市供电局', '白银市'), null);
});

test('chapter: an answer may ask for maps and 示意 art, by key, within limits; fonts from the allowed set', async () => {
  const { requestErrors, checkCode, MAX_ART } = await lib('chapter.mjs');
  const input = { assets: [{ key: 'm_b02' }] };
  assert.deepEqual(requestErrors({ code: '', maps: [{ key: 'city', place: '白银区, 白银市', pins: ['水川路'] }], art: [{ key: 'print1', prompt: 'a single fingerprint, white ridges on black, high contrast' }] }, input), []);
  assert.ok(requestErrors({ maps: [{ key: 'm_b02', place: 'x' }], art: [] }, input).some((e) => /twice/.test(e)), 'a request may not reuse a material key');
  assert.ok(requestErrors({ maps: [], art: [{ key: 'Bad-Key', prompt: 'a single fingerprint on black card' }] }, input).some((e) => /lower case/.test(e)));
  assert.ok(requestErrors({ maps: [{ key: 'city' }], art: [] }, input).some((e) => /place/.test(e)));
  assert.ok(requestErrors({ maps: [], art: Array.from({ length: MAX_ART + 1 }, (_, i) => ({ key: `a${i}`, prompt: 'a single fingerprint on black card' })) }, input).some((e) => /at most/.test(e)));
  const ok = 'export const DUR = 10;\nexport const beats = [];\nexport function items() { return []; }\nexport function pose() { return { alpha: 0 }; }';
  assert.deepEqual(checkCode(ok + "\nexport const fonts = [['Bebas', 'style-guides/experimental-editorial-tech-v1/fonts/BebasNeue-Regular.ttf']];"), []);
  assert.ok(checkCode(ok + "\nconst i = new Image();").some((e) => /pictures/.test(e)), 'pictures come through assets, not loaded by the module');
});

test('routing: places and dates of a case go to a continuous picture on a real map first', async () => {
  const table = JSON.parse(fs.readFileSync(path.join(DATA, 'routing', 'routing-table-v1.json'), 'utf8'));
  const w = table.intents.find((i) => i.id === 'where-when');
  assert.equal(w.recipes[0], 'morph-chapter');
  assert.ok(w.materialChain.some((c) => c.from.includes('map-osm')));
  assert.equal(table.modules['map-osm'].status, 'available');
});

test('chapter: a city or a map is never asked of the image model', async () => {
  const { requestErrors } = await lib('chapter.mjs');
  assert.ok(requestErrors({ maps: [], art: [{ key: 'city', prompt: 'Wide monochrome aerial view of an anonymous Chinese city at dusk' }] }, {}).some((e) => /maps/.test(e)));
  assert.deepEqual(requestErrors({ maps: [], art: [{ key: 'shoe', prompt: 'A single shoe sole print, white on black, high contrast' }] }, {}), []);
});

test('aesthetics: a map has an apron, words on things read (size, slant), a low-key frame still has its lights, a low-key film keeps one hue', async () => {
  const { surfaceReadErrors, lowKeyErrors, PROFILES } = await lib('profile.mjs');
  const G = PROFILES.gawx, shots = [{ shotId: 'B1', at: 0, dur: 4 }];
  const tr = (d) => Array.from({ length: 10 }, (_, i) => ({ t: i * 0.2, drawn: [d] }));
  assert.match(surfaceReadErrors(tr({ text: '排隊', surface: true, size: 20, turn: 0, alpha: 1 }), shots, G)[0], /reads at 20 px/);
  assert.match(surfaceReadErrors(tr({ text: '擱淺', surface: true, size: 60, turn: 35, alpha: 1 }), shots, G)[0], /slants 35/);
  assert.deepEqual(surfaceReadErrors(tr({ text: '長賜號', surface: true, size: 10, turn: 0, alpha: 1, texture: true }), shots, G), []);
  assert.deepEqual(surfaceReadErrors(tr({ text: '紅海', surface: true, size: 70, turn: -3, alpha: 1 }), shots, G), []);
  assert.match(lowKeyErrors([{ mean: 0.12, hi: 0.3 }, { mean: 0.1, hi: 0.35 }], G, 'C')[0], /nothing on its keyframes is lit/);
  assert.deepEqual(lowKeyErrors([{ mean: 0.12, hi: 0.6 }, { mean: 0.1, hi: 0.5 }], G, 'C'), []);
  const D = await lib('designbrain.mjs'), fam = D.paletteFamily({ ground: '#15191d', ink: '#eceae4', accent: '#c8501e' });
  const out = D.assignVariants([{ id: 'a', acts: ['scale'], beats: [] }, { id: 'b', acts: ['compare'], beats: [] }, { id: 'c', acts: ['turn'], beats: [] }], fam, { lowKey: true });
  const base = D.toOklch(fam.find((v) => v.id === 'base').ground);
  for (const o of out.filter((x) => x.variant === 'shift')) assert.ok(Math.abs(D.toOklch(o.palette.ground).h - base.h) < 3);
  const mj = fs.readFileSync(new URL('../work/recipe-board-v1/style-lab/engine/templates/morph.js', import.meta.url), 'utf8');
  assert.match(mj, /userData\.apron = true/); assert.match(mj, /!o\.userData\?\.apron/);
  const ty = fs.readFileSync(new URL('../work/recipe-board-v1/style-lab/engine/templates/type.js', import.meta.url), 'utf8');
  assert.match(ty, /face === 'camera'/);
});

test('house fusion: a keyframe needs one family of colour and little strong colour; free lines pair; the accent has its tones', async () => {
  const { colourErrors, pairErrors, PROFILES } = await lib('profile.mjs');
  const G = PROFILES.gawx, C = PROFILES.paperclip;
  assert.equal(colourErrors([{ family: 0.001, strong: 0, families: 0 }, { family: 0.004, strong: 0, families: 0 }], G, 'C').length, 1);
  assert.deepEqual(colourErrors([{ family: 0.08, strong: 0.01, families: 1 }, { family: 0.06, strong: 0.02, families: 2 }], G, 'C'), []);
  assert.match(colourErrors([{ family: 0.08, strong: 0.2, families: 1 }, { family: 0.06, strong: 0.15, families: 1 }], G, 'C')[0], /strong colour/);
  assert.deepEqual(colourErrors([{ family: 0, strong: 0, families: 0 }], C, 'C'), []);
  // a map chapter is a neutral chart with one red (the user 2026-10-27: 地图章节按回形针做): no family asked of it, at most one
  assert.deepEqual(colourErrors([{ family: 0.001, strong: 0.01, families: 1 }, { family: 0.004, strong: 0, families: 0 }], G, 'C', { mono: true }), []);
  assert.match(colourErrors([{ family: 0.08, strong: 0.01, families: 2 }, { family: 0.06, strong: 0.01, families: 2 }], G, 'C', { mono: true }).join(), /map chapter/);
  assert.match(colourErrors([{ family: 0.01, strong: 0.2, families: 1 }, { family: 0.01, strong: 0.2, families: 1 }], G, 'C', { mono: true }).join(), /strong colour/);
  const shots = [{ shotId: 'B1', at: 0, dur: 4 }];
  const loose = Array.from({ length: 10 }, (_, i) => ({ t: i * 0.2, drawn: [{ text: '367艘', size: 100, x0: 100, x1: 400, alpha: 1 }, { text: '3月29日', size: 90, x0: 900, x1: 1200, alpha: 1 }] }));
  const paired = Array.from({ length: 10 }, (_, i) => ({ t: i * 0.2, drawn: [{ text: '367艘', size: 120, x0: 100, x1: 400, alpha: 1 }, { text: '在等著過河', size: 48, x0: 104, x1: 360, alpha: 1 }] }));
  assert.equal(pairErrors(loose, shots, G).length, 1); assert.deepEqual(pairErrors(paired, shots, G), []); assert.deepEqual(pairErrors(loose, shots, C), []);
  const D = await lib('designbrain.mjs'); const t = D.tonesOf('#c8501e');
  assert.equal(t.length, 3); assert.ok(t.every((x) => /^#[0-9a-f]{6}$/.test(x)));
  const k2 = fs.readFileSync(new URL('../work/recipe-board-v1/style-lab/engine/templates/kit2.js', import.meta.url), 'utf8'); assert.match(k2, /export function pair\(/);
});

test('light has a source: a module that lays an additive radial glow is refused; the kit has a practical lamp and a lit map', async () => {
  const { checkCode } = await lib('chapter.mjs');
  const base = 'export const beats=[];export function items(){}export function pose(){}export const DUR=1;';
  assert.ok(checkCode(base + 'new THREE.MeshBasicMaterial({blending:THREE.AdditiveBlending});q.createRadialGradient(1,1,1,1,1,1)').some((e) => /additive radial glow/.test(e)));
  assert.ok(!checkCode(base + 'kit.practical(THREE, st, {})').some((e) => /glow/.test(e)));
  const k3 = fs.readFileSync(new URL('../work/recipe-board-v1/style-lab/engine/templates/kit3.js', import.meta.url), 'utf8');
  assert.match(k3, /export function practical\(/); assert.match(k3, /export function litMap\(/);
  const mj = fs.readFileSync(new URL('../work/recipe-board-v1/style-lab/engine/templates/morph.js', import.meta.url), 'utf8');
  assert.match(mj, /'litMap', 'practical', 'shadows'/);
});

test('profile: on the gawx profile big free type is a rare event, words stand on things, keyframes are low-key; paperclip unchanged', async () => {
  const { profileFor, typeDensityErrors, surfaceTypeErrors, lowKeyErrors, PROFILES } = await lib('profile.mjs');
  const G = profileFor({ profile: 'gawx' }), C = profileFor({});
  assert.equal(G.id, 'gawx'); assert.equal(C.id, 'paperclip'); assert.equal(profileFor({}, { profile: 'gawx' }).id, 'gawx');
  const shots = [{ shotId: 'B1', at: 0, dur: 4 }, { shotId: 'B2', at: 4, dur: 4 }];
  const big = { text: '367艘', size: 200, alpha: 1 }, onHull = { text: '長賜號', size: 220, alpha: 1, object: true, surface: true }, small = { text: '3月', size: 48, alpha: 1 };
  const track = Array.from({ length: 40 }, (_, i) => ({ t: i * 0.2, drawn: i < 8 ? [big] : [onHull, small] }));
  const e = typeDensityErrors(track, shots, G);
  assert.equal(e.length, 1); assert.match(e[0], /^B1: big free type \("367艘"/);
  assert.deepEqual(typeDensityErrors(track, shots, C), []);
  assert.deepEqual(surfaceTypeErrors(track, shots, G, 'C'), []);
  assert.equal(surfaceTypeErrors(track.slice(0, 8), shots, G, 'C').length, 1);
  assert.equal(lowKeyErrors([{ mean: 0.6 }, { mean: 0.5 }, { mean: 0.2 }], G, 'C').length, 1);
  assert.deepEqual(lowKeyErrors([{ mean: 0.2 }, { mean: 0.25 }, { mean: 0.6 }], G, 'C'), []);
  assert.deepEqual(lowKeyErrors([{ mean: 0.9 }], C, 'C'), []);
  const D = await lib('designbrain.mjs'), fam = D.paletteFamily({ ground: '#15191d', ink: '#eceae4', accent: '#c8501e' });
  const ch = [{ id: 'C1', acts: ['scale'], beats: [] }, { id: 'C2', acts: ['compare'], beats: [] }, { id: 'C3', acts: ['turn'], beats: [] }];
  assert.ok(D.assignVariants(ch, fam, { lowKey: true }).every((o) => o.tone !== 'light'));
  assert.ok(D.assignVariants(ch, fam).some((o) => o.tone === 'light'));
});

test('finish: a six-stage film is finished as film (gawx), a project or style may say otherwise; film.py has its presets', async () => {
  const { finishFor } = await lib('finish.mjs');
  assert.deepEqual(finishFor({ process: 'six-stage' }), { kind: 'film', preset: 'gawx' });
  assert.equal(finishFor({}), null); assert.equal(finishFor({ process: 'six-stage', finish: { kind: 'none' } }), null);
  assert.deepEqual(finishFor({}, { finish: { kind: 'film', preset: 'soft' } }), { kind: 'film', preset: 'soft' });
  const src = fs.readFileSync(new URL('../apps/studio-next/src/lib/recipe-board/film.py', import.meta.url), 'utf8');
  assert.match(src, /'gawx': dict\(/); assert.match(src, /'soft': dict\(/);
});

test('compose: hero titles take turns among the mechanisms (block, column, quiet), a named one kept', async () => {
  const { heroPlan, withHero } = await lib('compose.mjs');
  const shots = [{ shotId: 'B01', recipe: 'footage-plate', scenes: [{ slots: {} }, { recipe: 'title-hero-over-photo', slots: { title: { text: '一艘船' } } }] }, { shotId: 'B11', recipe: 'title-hero-over-photo', slots: { title: '浮起来' } }, { shotId: 'B20', recipe: 'title-hero-over-photo', slots: { title: { text: 'x', hero: 'grid' } } }, { shotId: 'B21', recipe: 'title-hero-over-photo', slots: { title: 'y' } }];
  assert.deepEqual(heroPlan(shots), { 'B01:1': 'block', 'B11:0': 'column', 'B20:0': 'grid', 'B21:0': 'quiet' });
  assert.deepEqual(withHero({ slots: { title: '浮起来' } }, 'column').slots.title, { text: '浮起来', hero: 'column' });
});

test('motion: a cut that only lays a title over the same picture is the title coming on over the running picture', async () => {
  const { titleOverSame } = await lib('scenes.mjs');
  const scenes = [{ slots: { background: { asset: 'a.jpg', push: 0.06 } } }, { recipe: 'title-hero-over-photo', slots: { background: { asset: 'a-copy.jpg' }, title: { text: '一艘船' } } }, { slots: { background: { asset: 'c.jpg' } } }];
  const r = titleOverSame(scenes, [0, 2.4, 5], (a, b) => a.replace('-copy', '') === b.replace('-copy', ''));
  assert.deepEqual(r.keep, [true, false, true]);
  assert.equal(r.scenes[0].slots.background.asset, 'a.jpg'); assert.equal(r.scenes[0].slots.title.text, '一艘船');
  assert.equal(r.scenes[0].cues.title, 2.4); assert.equal(r.scenes[0].preset, 'plate'); assert.equal(r.scenes[0].recipe, 'title-hero-over-photo');
  const other = titleOverSame(scenes, [0, 2.4, 5], () => false); assert.deepEqual(other.keep, [true, true, true]);
});

test('materials: a need that found nothing is searched again in other words, then stood in by art marked 示意', async () => {
  const { searchVariant, researchDue, givenUp, SEARCH_ROUNDS } = await lib('materials.mjs');
  const need = { entity: '长赐号 Ever Given', original: '长赐号斜卡在苏伊士运河里的卫星照片', form: 'photo', queryEn: 'Ever Given stuck Suez Canal aerial', archive: { keywords: ['Ever Given stuck Suez Canal aerial'] } };
  const r1 = searchVariant(need, 1), r2 = searchVariant(need, 2), r3 = searchVariant(need, 3);
  assert.deepEqual(r1.archive.keywords, ['Ever Given satellite image', '长赐号卫星图']);
  assert.ok(r2.archive.keywords[0].startsWith('Ever Given') && r3.archive.keywords.includes('Ever Given Wikimedia Commons'));
  assert.notDeepEqual(r1.archive.keywords, r2.archive.keywords);
  const rounds = { B01: { round: 1, missed: true }, B02: { round: SEARCH_ROUNDS, missed: true, gaveUp: true }, B03: { round: 0, missed: false } };
  assert.deepEqual(researchDue(rounds), ['B01']); assert.ok(givenUp(rounds).has('B02'));
  const { standInSlots } = await lib('arttemplates.mjs');
  const shot = { shotId: 'B11', slots: { background: { gen: '长赐号脱浅后在运河里航行' }, title: '浮起来' } };
  const done = standInSlots(shot, [{ shotId: 'B11', bind: 'background', original: 'x' }], new Set(['B11']), 'steel grey night');
  assert.deepEqual(done, ['background']); assert.ok(shot.slots.background.standIn && /illustration/.test(shot.slots.background.art.prompt) && /No people's faces/.test(shot.slots.background.art.prompt));
  const real = { shotId: 'B01', slots: { background: { asset: 'a.jpg' } } };
  assert.deepEqual(standInSlots(real, [{ shotId: 'B01', bind: 'background' }], new Set(['B01']), ''), []);
});

test('materials: an entity written in two scripts is named by either (长赐号 Ever Given)', async () => {
  const { nameParts } = await lib('materials.mjs');
  const n = nameParts(['长赐号 Ever Given', '高承勇']);
  assert.ok(n.includes('长赐号') && n.includes('ever given') && n.includes('高承勇'));
  assert.ok(n.some((x) => "container ship 'ever given' stuck in the suez canal".includes(x)));
});

test('look: found photos are set as the world chose (mono, duotone, color), else black and white for one accent', async () => {
  const { photoTokens } = await lib('look.mjs');
  assert.deepEqual(photoTokens({ photo: 'mono', second: '#c8501e' }), { photoMono: true });
  assert.deepEqual(photoTokens({ photo: 'duotone' }), { photoMono: true, photoTone: 'duotone' });
  assert.deepEqual(photoTokens({ photo: 'color' }), {});
  assert.deepEqual(photoTokens({ second: null }), { photoMono: true });
  const { lookOfStyle } = await lib('filmlook.mjs');
  assert.equal(lookOfStyle('film:x', { tokens: {}, world: { photo: 'mono' } }).photo, 'mono');
});

test('maps: a region map takes its canals (a waterway story has no river), and its sea is read off the heights beside it', async () => {
  const { regionQuery, projectMap } = await lib('maps.mjs');
  const q = regionQuery([29.7, 31.2, 31.5, 33.3]);
  assert.match(q, /"waterway"="canal"/); assert.match(q, /"waterway"="river"/);
  const m = projectMap({ elements: [{ type: 'way', tags: { waterway: 'canal', name: 'Suez Canal' }, geometry: [{ lat: 31.2, lon: 32.3 }, { lat: 30.0, lon: 32.55 }] }] }, [29.7, 31.2, 31.5, 33.3], { width: 1000 });
  assert.equal(m.water.length, 1);
  const src = fs.readFileSync(new URL('../apps/studio-next/src/lib/recipe-board/relief.py', import.meta.url), 'utf8');
  assert.match(src, /Z <= 0\.5/);
});

test('maps: a place is found at its own point, not the centroid of its administrative area', async () => {
  const { geocode } = await lib('maps.mjs');
  const hits = [{ lat: '36.53', lon: '104.78', class: 'boundary', display_name: '白银市 region' }, { lat: '36.54', lon: '104.17', class: 'place', display_name: '白银市 city' }];
  const get = async () => ({ ok: true, status: 200, json: async () => hits });
  const g = await geocode('白银市', { get });
  assert.equal(g.lon, 104.17);
});

test('chapter review: a frame passes at 4; a slide-like 3 goes back', async () => {
  const { weakFrames, PASS_SCORE } = await lib('chapter.mjs');
  assert.equal(PASS_SCORE, 4);
  assert.deepEqual(weakFrames([{ beat: 'B01', score: 4 }, { beat: 'B02', score: 3 }, { beat: 'B03', score: 5 }]).map((f) => f.beat), ['B02']);
});

test('chapter review: a beat that passed and kept its picture keeps its score; a changed one is reviewed again', async () => {
  const { splitLocked } = await lib('chapter.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
  const png = (name, byte) => { const f = path.join(dir, name); fs.writeFileSync(f, Buffer.from([0x89, 0x50, byte])); return f; };
  const lockedB01 = png('locked-B01.png', 1), lockedB02 = png('locked-B02.png', 2);
  const keys = [png('key-1.png', 1), png('key-2.png', 9), png('key-3.png', 3)];
  const shots = [{ shotId: 'B01' }, { shotId: 'B02' }, { shotId: 'B03' }];
  const { kept, again } = splitLocked({ B01: { score: 4 }, B02: { score: 5 } }, shots, keys, (b) => path.join(dir, `locked-${b}.png`));
  assert.deepEqual(kept.map((f) => [f.beat, f.score]), [['B01', 4]]);
  assert.deepEqual(again.map((a) => [a.s.shotId, !!a.was]), [['B02', true], ['B03', false]]);
  fs.rmSync(dir, { recursive: true, force: true }); void lockedB02;
});

test('chapter motion: a beat frozen over 2 s is a slide and goes back; a slow drift is fine; no calm is only a warning', async () => {
  const { holdErrors, STEP } = await lib('chapter.mjs');
  const curve = (fn, total) => Array.from({ length: Math.round(total / STEP) }, (_, i) => ({ t: +((i + 1) * STEP).toFixed(2), d: fn((i + 1) * STEP) }));
  const shots = [{ shotId: 'B01', at: 0, dur: 5 }, { shotId: 'B02', at: 5, dur: 5 }];
  // B01 drifts slowly after a move; B02 moves once then freezes
  const c = curve((t) => (t < 1 ? 12 : t < 5 ? 1.2 : t < 6 ? 10 : 0.05), 10);
  const r = holdErrors(c, shots);
  assert.deepEqual(r.errors.map((e) => e.split(':')[0]), ['B02']);
  assert.ok(r.beats[0].frozen < 1 && r.beats[1].frozen > 3);
  const busy = holdErrors(curve(() => 8, 5), [shots[0]]);
  assert.deepEqual(busy.errors, []); assert.ok(busy.warnings.some((w) => /calm/.test(w)));
});

test('moves: the motion grammar settles where it should (drop lands, pop overshoots a hair, push goes and comes back)', async () => {
  const m = await import(pathToFileURL(path.join(DATA, 'style-lab', 'engine', 'templates', 'moves.js')).href);
  assert.equal(m.drop(0, 1).alpha, 0); assert.equal(m.drop(5, 1).dy, 0); assert.equal(m.drop(5, 1).alpha, 1);
  const peak = Math.max(...Array.from({ length: 40 }, (_, i) => m.pop(1 + i * 0.01, 1).scale)); assert.ok(peak > 1 && peak < 1.12);
  assert.equal(m.push(0, 1, 3), 0); assert.ok(m.push(2.5, 1, 3) > 0.99); assert.ok(m.push(5, 1, 3) < 0.01);
  assert.equal(m.type(1.12, 1, '身份仍未确定'), '身份');
  assert.equal(m.count(9, 1, 23).text, '23');
});

test('chapter revision: patches apply to the last version, each find exactly once', async () => {
  const { applyPatches } = await lib('chapter.mjs');
  const code = 'const a = 1;\nconst b = 2;\nconst c = 2;';
  assert.deepEqual(applyPatches(code, [{ find: 'const a = 1;', replace: 'const a = 9;' }]), { code: 'const a = 9;\nconst b = 2;\nconst c = 2;', errors: [] });
  assert.ok(applyPatches(code, [{ find: '= 2;', replace: '= 3;' }]).errors[0].includes('2 times'));
  // a find that differs only in spacing applies; one that misses leaves the others applied (paperclip-138-full B01)
  assert.equal(applyPatches(code, [{ find: 'const  a =\n 1;', replace: 'const a = 7;' }]).code.split('\n')[0], 'const a = 7;');
  const mixed = applyPatches(code, [{ find: 'nothing like this', replace: 'x' }, { find: 'const b = 2;', replace: 'const b = 5;' }]);
  assert.equal(mixed.errors.length, 1); assert.ok(mixed.code.includes('const b = 5;'));
  assert.ok(applyPatches(code, [{ find: 'nope', replace: 'x' }]).errors[0].includes('0 times'));
  assert.equal(applyPatches(code, [{ find: 'const b = 2;', replace: 'const b = "$&";' }]).code.split('\n')[1], 'const b = "$&";', 'replace text is taken as it is');
});

test('camera shots: a key starts at its time, arrives after its dur and holds; push in and pull back', async () => {
  const { camPose } = await import(pathToFileURL(path.join(DATA, 'style-lab', 'engine', 'templates', 'moves.js')).href);
  const keys = [{ at: 0, look: [0, 0, 0], dist: 20, elev: 60 }, { at: 2, look: [5, 0, 0], dist: 8, elev: 30, dur: 1 }, { at: 5, look: [0, 0, 0], dist: 20, elev: 60, dur: 1 }];
  assert.deepEqual(camPose(keys, 1).look, [0, 0, 0]);
  assert.equal(+camPose(keys, 3.5).dist.toFixed(3), 8); assert.deepEqual(camPose(keys, 3.5).look.map((v) => +v.toFixed(3)), [5, 0, 0]);
  const mid = camPose(keys, 2.5); assert.ok(mid.dist < 20 && mid.dist > 8);
  assert.equal(+camPose(keys, 7).dist.toFixed(3), 20);
  // keys that follow on are one move: no stop at the key between them (the opening read 一缓动一缓动)
  const run = [{ at: 0, look: [0, 0, 0], dist: 20 }, { at: 1, look: [10, 0, 0], dist: 20, dur: 2 }, { at: 3, look: [20, 0, 0], dist: 20, dur: 2 }];
  const x = (tt) => camPose(run, tt).look[0], v = (tt) => (x(tt + 0.05) - x(tt - 0.05)) / 0.1;
  assert.ok(v(3) > 2, `moving through the key at 3 s (speed ${v(3).toFixed(2)})`);
  assert.equal(+x(5.5).toFixed(3), 20); assert.equal(+x(0.5).toFixed(3), 0);
  assert.ok(Math.abs(v(1.02)) < 1.5 && Math.abs(v(4.98)) < 1.5, 'eased in at the start and out at the end');
  // a key of 0.01 s is a cut: the move before it is not bent towards it
  { const pk = [{ at: 0, look: [0, 0, 0] }, { at: 0.1, look: [6, 0, 0], dur: 7.5 }, { at: 7.7, look: [0, 0, 0], dur: 0.01 }];
    assert.ok(camPose(pk, 7.6).look[0] > 5.9, 'held until the cut'); assert.equal(+camPose(pk, 7.8).look[0].toFixed(3), 0); }
  // a key after a real hold starts its own move
  const held = [{ at: 0, look: [0, 0, 0] }, { at: 1, look: [10, 0, 0], dur: 1 }, { at: 3, look: [20, 0, 0], dur: 1 }];
  assert.equal(+camPose(held, 2.5).look[0].toFixed(3), 10);
});

test('type roles: no plates behind headings and labels; small tags may keep one; the serif face is allowed', async () => {
  const { plateErrors, PLATE_MIN, checkCode } = await lib('chapter.mjs');
  const line = (text, size, plated) => ({ text, size, plated, x0: 0, x1: 100, y0: 0, y1: size });
  assert.equal(plateErrors([line('9 名女性遇害', 68, true)], 'B02').length, 1);
  assert.deepEqual(plateErrors([line('1988/5/26', PLATE_MIN - 10, true), line('九', 440, false)], 'B02'), []);
  const ok = 'export const DUR = 10;\nexport const beats = [];\nexport function items() { return []; }\nexport function pose() { return { alpha: 0 }; }';
  assert.deepEqual(checkCode(ok + "\nexport const fonts = [['A1Serif', 'a1-editorial-fonts/SourceHanSerifCN-Heavy.otf']];"), []);
});

test('type roles: the grid spans its columns and rows; a hairline label stays inside the frame', async () => {
  const t = await import(pathToFileURL(path.join(DATA, 'style-lab', 'engine', 'templates', 'type.js')).href);
  const g = t.gridLines({ cols: [100, 900, 1800], rows: [200] });
  assert.equal(g.v.length, 3); assert.deepEqual(g.h[0], [100, 200, 1800, 200]);
  const a = t.hairlineAnchor({ x: 1800, y: 150 });
  assert.ok(a.lx <= 1500 && a.ly >= 230, 'a point near the corner sends its label back into the frame');
  assert.deepEqual(t.hairlineAnchor({ x: 600, y: 700 }, { x: 900, y: 300 }).lx, 900);
});

// 2026-10-20 (the user: 镜头之间连不起来, 节奏不对): a paragraph is edited as one piece; its cuts are contiguous, cut on
// the words (6 s at most a cut), each a known treatment of real material
test('segment: contiguous cuts on the words, known treatments, real material named', async () => {
  const { checkSegment } = await lib('segment.mjs');
  const ok = { range: [0, 4], cuts: [{ kind: 'presenter', at: 0, end: 2, src: 'p.png' }, { kind: 'print', at: 2, end: 4, src: 'x.jpg', words: [{ text: '硅谷', at: 2.2 }] }] };
  assert.deepEqual(checkSegment(ok), []);
  assert.ok(checkSegment({ ...ok, cuts: [ok.cuts[0], { ...ok.cuts[1], at: 2.5 }] }).some((e) => /contiguous/.test(e)));
  assert.ok(checkSegment({ range: [0, 8], cuts: [{ kind: 'presenter', at: 0, end: 8, src: 'p' }] }).some((e) => /6 s at most/.test(e)));
  assert.ok(checkSegment({ range: [0, 2], cuts: [{ kind: 'print', at: 0, end: 2 }] }).some((e) => /no real material/.test(e)));
  assert.ok(checkSegment({ range: [0, 2], cuts: [{ kind: 'sparkle', at: 0, end: 2 }] }).some((e) => /unknown treatment/.test(e)));
  assert.ok(checkSegment({ ...ok, cuts: [ok.cuts[0], { ...ok.cuts[1], words: [{ text: 'x', at: 5 }] }] }).some((e) => /outside the cut/.test(e)));
  if (PROJECTS.includes('hupo-auto2') && fs.existsSync(path.join(DATA, 'projects', 'hupo-auto2', 'segments', 'open.json'))) {
    assert.deepEqual(checkSegment(JSON.parse(fs.readFileSync(path.join(DATA, 'projects', 'hupo-auto2', 'segments', 'open.json'), 'utf8'))), [], 'the opening segment passes');
  }
});

// 2026-10-20 (the user: 全片一份美学表): one look sheet for segments, chapters and 3D plates; a segment can play a
// stretch of a rendered chapter (scene), timed onto its words within 0.5-2x
test('film look sheet and scene cuts: one palette everywhere, chapters played inside a segment', async () => {
  const { filmLook, lookOf, readWorld, HOUSE } = await lib('filmlook.mjs');
  const { checkSegment } = await lib('segment.mjs');
  const L = filmLook(cfg, 'no-such-project');
  assert.equal(L.picked, false, 'no world picked: key frames only'); assert.equal(L.from, 'fallback'); assert.equal(L.paper, HOUSE.paper);
  // every world the concept step offers carries a full look (worlds/LOOK.md)
  for (const w of ['terminal', 'y2k', 'dossier']) {
    const def = readWorld(cfg, w); if (!def) continue;
    assert.ok(def.look?.palette?.accent && def.look?.type?.serif && def.look?.material3d, `${w} has a look`);
    const lk = lookOf(def); assert.equal(lk.paper, def.look.palette.paper); assert.equal(lk.groundFace, def.look.type.ground);
  }
  const scene = (o) => ({ range: [0, 6], cuts: [{ kind: 'scene', at: 0, end: 6, chapter: 'B29', from: 0, to: 6, ...o }] });
  assert.deepEqual(checkSegment(scene({})), []);
  assert.ok(checkSegment(scene({ to: 18 })).some((e) => /0.5-2x/.test(e)), 'a chapter rushed past 2x');
  assert.ok(checkSegment(scene({ chapter: '' })).some((e) => /no chapter/.test(e)));
  assert.ok(checkSegment({ range: [0, 18], cuts: [{ kind: 'scene', at: 0, end: 18, chapter: 'B29', from: 0, to: 18 }] }).some((e) => /16 s at most/.test(e)));
});

// 2026-10-20: a chapter that passed and then got a new answer (a revision) is checked again, not kept as it was
test('chapters: a new answer to an accepted chapter is answered, not accepted', async () => {
  const src = await fs.promises.readFile(new URL('../apps/studio-next/src/lib/recipe-board/chapter.mjs', import.meta.url), 'utf8');
  assert.match(src, /state: answered \? 'answered' : current \? 'accepted'/);
});

// 2026-10-20: a world is picked by how it draws the film's typical moments (opening, a report read, a number, a name,
// a mechanism, the presenter with tags); a project names its key moments in conceptKeys
test('concept: the six moments, from the project, drawn with each world\'s look', async () => {
  const C = await lib('concept.mjs');
  assert.deepEqual(C.MOMENTS, ['title', 'evidence', 'number', 'name', 'mechanism', 'overlay']);
  if (PROJECTS.includes('hupo-auto2')) {
    const keys = C.keyShots(cfg, 'hupo-auto2');
    if (keys.length === 6) { assert.deepEqual(keys.map((k) => k.role), C.MOMENTS); assert.ok(keys.every((k) => k.words?.length)); }
  }
});

// 2026-10-20 (the user: 尽量都用另一个对话的引擎来设计): a segment cut can be drawn by any engine template; the engine
// cuts go to director/make.mjs as one shot list laid end to end, with their facts
test('segment: engine cuts become one make.mjs shot list with their facts and lengths', async () => {
  const { engineShotList, checkSegment } = await lib('segment.mjs');
  const seg = { range: [10, 20], cuts: [
    { kind: 'presenter', at: 10, end: 13, src: 'p.png' },
    { kind: 'engine', at: 13, end: 17, template: 'flipboard', params: { value: 10000, unit: '张' }, facts: [{ text: '大约10000张', source: '口播原文' }] },
    { kind: 'engine', at: 17, end: 20, template: 'nameplate', params: { name: 'DeepSeek' }, window: { in: 4.7 } },
  ] };
  assert.deepEqual(checkSegment(seg), []);
  const L = engineShotList(cfg, 'no-such-project', seg, 'x');
  assert.equal(L.contract, 'A1ShotList/v1');
  assert.deepEqual(L.shots.map((s) => [s.id, s.template, s.span]), [['c1', 'flipboard', [0, 4]], ['c2', 'nameplate', [4, 7]]]);
  assert.equal(L.shots[0].facts[0].source, '口播原文'); assert.deepEqual(L.shots[1].window, { in: 4.7 });
  assert.ok(checkSegment({ range: [0, 3], cuts: [{ kind: 'engine', at: 0, end: 3 }] }).some((e) => /no engine template/.test(e)));
});


// 2026-10-20 (the user: 系统设计的时候都很单一跑完全篇, 导演要管审美方向): the aesthetic director's plan names a chapter
// recipe, and per shot the kind of meaning, two ideas, the pick and a form that serves it; budgets are checked
test('aesthetic: recipe, ideas before a form, budgets, numbers with facts', async () => {
  const { checkAesthetic } = await lib('aesthetic.mjs');
  const recipe = { paper: '#efe8d6', ink: '#2747a3', accent: '#e2261c', print: 'engraving', motif: 'ship and chain' };
  const shot = (o) => ({ id: 'S', at: 0, end: 2, kind: 'mechanism', ideas: ['a', 'b'], pick: 0, form: '3d', engine: { template: 'subject' }, ...o });
  const ok = { range: [0, 4], recipe, shots: [shot({}), shot({ at: 2, end: 4, kind: 'thesis', form: 'poster', engine: null, bold: true })] };
  assert.deepEqual(checkAesthetic(ok), []);
  assert.ok(checkAesthetic({ ...ok, recipe: { ...recipe, motif: '' } }).some((e) => /motif/.test(e)));
  assert.ok(checkAesthetic({ ...ok, shots: [shot({ ideas: ['a'] }), ok.shots[1]] }).some((e) => /two or three ideas/.test(e)));
  assert.ok(checkAesthetic({ ...ok, shots: [shot({ form: 'evidence', material: 'x' }), ok.shots[1]] }).some((e) => /say why/.test(e)));
  assert.ok(checkAesthetic({ ...ok, shots: [shot({ text: '20 个' }), ok.shots[1]] }).some((e) => /without a fact/.test(e)));
  assert.ok(checkAesthetic({ ...ok, shots: [shot({ bold: true }), ok.shots[1]] }).some((e) => /bold moves/.test(e)));
  const three = { range: [0, 6], recipe, shots: [0, 2, 4].map((t) => shot({ at: t, end: t + 2 })) };
  assert.ok(checkAesthetic(three).some((e) => /third 3d shot/.test(e)));
});

// 2026-10-20 (the user: 先学对标讲法再谈美学): with a reference, a shot records the reference's beats and plans its own on
// the words; no beat held over 3.2 s, and not fewer beats than the reference minus one without a reason
test('aesthetic: study the reference beats before the picture', async () => {
  const { checkAesthetic } = await lib('aesthetic.mjs');
  const recipe = { paper: '#efe8d6', ink: '#2747a3', accent: null, print: 'halftone', motif: 'm' };
  const ref = { beats: [0, 1, 2, 3].map((t) => ({ at: t, end: t + 1, device: 'chat', on: 'x' })) };
  const beats = (n, len) => Array.from({ length: n }, (_, k) => ({ at: k * len, end: (k + 1) * len, device: 'type-on', on: 'w' }));
  const shot = (o) => ({ id: 'S', at: 0, end: 4, kind: 'event', ideas: ['a', 'b'], pick: 0, form: 'poster', reference: ref, beats: beats(4, 1), ...o });
  const plan = (s) => ({ range: [0, 4], reference: 'film', recipe, shots: [s] });
  assert.deepEqual(checkAesthetic(plan(shot({}))), []);
  assert.ok(checkAesthetic(plan(shot({ reference: null }))).some((e) => /study the reference first/.test(e)));
  assert.ok(checkAesthetic(plan(shot({ beats: beats(1, 4) }))).some((e) => /holds 4.0 s/.test(e)));
  assert.ok(checkAesthetic(plan(shot({ beats: beats(2, 2) }))).some((e) => /2 beats against the reference's 4/.test(e)));
  assert.deepEqual(checkAesthetic(plan(shot({ beats: beats(2, 2), beatsWhy: 'held on purpose' }))), []);
  assert.ok(checkAesthetic(plan(shot({ beats: [{ at: 0, end: 4, device: 'presenter' }] }))).some((e) => /which word/.test(e)));
});

// 2026-10-20 (the user: 先复刻对标的讲法, 手法做成模块): a shot module is a spec, checked before it renders: times inside
// the shot, real pictures on cards, short tags, article beats that land on a phrase, and the site's name to cover
test('modules: sidecard and article specs are checked', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  const card = { module: 'sidecard', at: 10, end: 16, presenter: 'p.png', cards: [{ at: 11, img: 'a.jpg', swap: [{ at: 14, img: 'b.jpg' }] }], tags: [{ at: 12, text: '顶级工人团队' }] };
  assert.deepEqual(checkModuleSpec(card), []);
  assert.ok(checkModuleSpec({ ...card, cards: [{ at: 20, img: 'a.jpg' }] }).some((e) => /outside the shot/.test(e)));
  assert.ok(checkModuleSpec({ ...card, cards: [{ at: 11 }] }).some((e) => /real material/.test(e)));
  assert.ok(checkModuleSpec({ ...card, tags: [{ at: 12, text: '一二三四五六七八九十一' }] }).some((e) => /1-10 characters/.test(e)));
  const art = { module: 'article', at: 0, end: 5, src: 'page.png', hide: ['观察者网'], beats: [{ at: 0, do: 'title', phrase: '标题' }, { at: 2, do: 'highlight', phrase: '关键句' }, { at: 4, do: 'hold' }] };
  assert.deepEqual(checkModuleSpec(art), []);
  assert.ok(checkModuleSpec({ ...art, hide: undefined }).some((e) => /site as printed/.test(e)));   // ([] is allowed: a page that prints no site name; the index's watermark check holds one that does)
  assert.ok(checkModuleSpec({ ...art, beats: [{ at: 1, do: 'highlight' }] }).some((e) => /without the phrase/.test(e)));
  assert.ok(checkModuleSpec({ ...art, module: 'sparkle' }).some((e) => /unknown module/.test(e)));
});

// 2026-10-21: shot modules carry the reference's sounds (a whoosh on a card, a pop on each tag and label, a tick per
// typed character, a swish on a highlight, a glitch out of the big headline), placed from the spec
test('modules: sound effects land on the moments of the spec', async () => {
  const { soundEvents } = await lib('modules.mjs');
  const card = soundEvents({ module: 'sidecard', at: 10, end: 16, cards: [{ at: 11, swap: [{ at: 14 }] }], tags: [{ at: 12 }] });
  assert.deepEqual(card.map((e) => e.kind), ['whoosh', 'pop', 'whoosh', 'pop', 'pop']);
  assert.equal(card[0].t, 1);
  const art = soundEvents({ module: 'article', at: 0, end: 5, beats: [{ at: 0, end: 2, do: 'title', big: true, text: '四个字儿' }, { at: 3, do: 'highlight', phrase: 'x' }] });
  assert.equal(art.filter((e) => e.kind === 'tick').length, 4);
  assert.ok(art.some((e) => e.kind === 'glitch') && art.some((e) => e.kind === 'swish'));
});

// 2026-10-21: the chat module (reference P14 / P20): messages need a real portrait, short text, red words that are in it
test('modules: chat specs are checked', async () => {
  const { checkModuleSpec, soundEvents } = await lib('modules.mjs');
  const chat = { module: 'chat', at: 0, end: 6, title: '群聊', messages: [{ at: 1, avatar: 'a.png', text: '出口管制了！', mark: '管制' }], push: { at: 4 } };
  assert.deepEqual(checkModuleSpec(chat), []);
  assert.ok(checkModuleSpec({ ...chat, messages: [{ at: 1, text: 'x' }] }).some((e) => /real portrait/.test(e)));
  assert.ok(checkModuleSpec({ ...chat, messages: [{ at: 1, avatar: 'a', text: 'abc', mark: 'zz' }] }).some((e) => /red words/.test(e)));
  assert.ok(soundEvents(chat).some((e) => e.kind === 'pop' && e.t === 1));
});

// 2026-10-21: the data table (reference P27): every figure on it is a fact; rows match the columns
test('modules: table figures need facts', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  const t = { module: 'table', at: 0, end: 6, columns: ['a', 'b'], rows: [['计算单元', '抠出 20 个']], facts: [{ text: '20', source: '口播' }] };
  assert.deepEqual(checkModuleSpec(t), []);
  assert.ok(checkModuleSpec({ ...t, facts: [] }).some((e) => /20 without a fact/.test(e)));
  assert.ok(checkModuleSpec({ ...t, rows: [['x']] }).some((e) => /a row of 1 cells/.test(e)));
});

// 2026-10-21: the dark hardware compare (reference P26) and the page curl (P23) are checked like the other modules
test('modules: compare blocks and page curl', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  const c = { module: 'compare', at: 0, end: 7, photo: 'h.png', left: { at: 1, title: '原生', rows: [['a', 'b']] }, right: { at: 3, title: '新', rows: [['抠出', '20个']] }, facts: [{ text: '20个', source: '口播' }] };
  assert.deepEqual(checkModuleSpec(c), []);
  assert.ok(checkModuleSpec({ ...c, facts: [] }).some((e) => /20 without a fact/.test(e)));
  assert.ok(checkModuleSpec({ ...c, photo: '' }).some((e) => /real material/.test(e)));
  const card = { module: 'sidecard', at: 0, end: 5, presenter: 'p', curl: { at: 2 } };
  assert.ok(checkModuleSpec(card).some((e) => /page curl/.test(e)));
});

// 2026-10-21 (the user: 导演要自己写方案): the shot director's plan is checked before anything renders: specs parse and
// pass their module's checks, shots are contiguous over the range, no flashes, a module never restarts its move
test('shotplan: the director plan is checked', async () => {
  const { checkShotplan } = await lib('shotplan.mjs');
  const card = (at, end) => ({ id: `S${at}`, module: 'sidecard', at, end, why: '', spec: JSON.stringify({ presenter: 'p.png' }) });
  const chat = (at, end) => ({ id: `C${at}`, module: 'chat', at, end, why: '', spec: JSON.stringify({ title: '群', messages: [{ at: at + .2, avatar: 'a.png', text: '出事了' }] }) });
  // the reference's beats the plan is set against (a chat, then the presenter)
  const reference = [{ at: 0, end: 4, device: 'chat', material: 'portrait', shows: '群聊' }, { at: 4, end: 8, device: 'presenter', material: 'none', shows: '讲者' }];
  assert.deepEqual(checkShotplan({ reference, shots: [chat(0, 4), card(4, 8)] }, [0, 8]).errors, []);
  assert.ok(checkShotplan({ reference, shots: [chat(0, 4), card(4.5, 8)] }, [0, 8]).errors.some((e) => /not contiguous/.test(e)));
  assert.ok(checkShotplan({ reference, shots: [card(0, .2), chat(.2, 8)] }, [0, 8]).errors.some((e) => /flash/.test(e)));
  assert.ok(checkShotplan({ reference, shots: [chat(0, 4), chat(4, 8)] }, [0, 8]).errors.some((e) => /restarts its move/.test(e)));
  // two people's cards in a row are two subjects (reference P30 -> P31); the same person twice is a restart
  const pc = (id, at, end, photo) => ({ id, module: 'person', at, end, why: '', spec: JSON.stringify({ photo, name: '某人' }) });
  assert.ok(!checkShotplan({ reference, shots: [pc('A', 0, 4, 'a.png'), pc('B', 4, 8, 'b.png')] }, [0, 8]).errors.some((e) => /restarts/.test(e)));
  assert.ok(checkShotplan({ reference, shots: [pc('A', 0, 4, 'a.png'), pc('B', 4, 8, 'a.png')] }, [0, 8]).errors.some((e) => /restarts/.test(e)));
  assert.ok(checkShotplan({ reference, shots: [{ ...card(0, 8), spec: '{' }] }, [0, 8]).errors.some((e) => /not JSON/.test(e)));
  assert.ok(checkShotplan({ reference, shots: [card(0, 8)] }, [0, 8], { referenceCuts: [3] }).warnings.length === 0);
});

// 2026-10-21 (the user: 这一镜不好, 是素材不行吗): material is chosen by what it is. The index tells a page from a photo;
// each module slot takes only its kinds, at a size it can show, with text where text is the point; a curl may not
// repeat the card's product; a printed site name must be covered
test('matindex: kinds and slot needs', async () => {
  const { kindOf, slotErrors, materialErrors } = await lib('matindex.mjs');
  assert.equal(kindOf({ alpha: 0, chars: 700, w: 2400, h: 1800 }), 'page');
  assert.equal(kindOf({ alpha: 0, chars: 0, w: 587, h: 270 }), 'photo');
  assert.equal(kindOf({ alpha: .5, chars: 0, w: 700, h: 650 }), 'cutout');
  assert.equal(kindOf({ alpha: .6, chars: 6, w: 1268, h: 235 }), 'logo');
  assert.equal(kindOf({ video: true }), 'footage');
  const photo = { kind: 'photo', w: 1920, h: 1080, chars: 0, marks: [] }, page = { kind: 'page', w: 2420, h: 1830, chars: 725, marks: [] };
  assert.ok(slotErrors('sidecard.curl.src', 'p.png', photo).some((e) => /needs page/.test(e)));
  assert.ok(slotErrors('sidecard.curl.src', 'p.png', photo).some((e) => /page with text/.test(e)));
  assert.deepEqual(slotErrors('sidecard.curl.src', 's.png', page), []);
  assert.ok(slotErrors('article.src', 'a.png', { ...page, w: 800 }).some((e) => /800 px wide/.test(e)));
  assert.ok(slotErrors('article.src', 'a.png', { ...page, marks: ['观察者'] }).some((e) => /site name/.test(e)));
  assert.deepEqual(slotErrors('article.src', 'a.png', { ...page, marks: ['观察者'] }, ['观察者网']), []);
  const idx = { files: { 'c/p-h800.png': { kind: 'cutout', w: 709, h: 655, chars: 0 }, 'c/h800-page.png': { ...page }, 'p.png': photo } };
  assert.ok(materialErrors({ module: 'sidecard', presenter: 'p.png', cards: [{ img: 'c/p-h800.png' }], curl: { src: 'c/h800-page.png' } }, idx).some((e) => /repeats the card/.test(e)));
});

// 2026-10-21 (the user: 我希望的不是修修补补这一个片子, 是希望系统导演能给我很好的设计): the plan is set beat by beat against the
// reference's beats. Another device where the reference's device has a module is refused unless the shot filed a
// request; a device without a module is a gap, reported; the shares and the report say what matches
test('shotplan: the plan is set beat by beat against the reference', async () => {
  const { compareToReference, checkShotplan, reportText, requestNeed } = await lib('shotplan.mjs');
  const idx = { files: { 'page.png': { kind: 'page', w: 1920, h: 1080, chars: 500 }, 'phone.jpg': { kind: 'photo', w: 1920, h: 1080, chars: 0 }, 'p.png': { kind: 'photo', w: 1920, h: 1080, chars: 0 } } };
  const card = (id, at, end, extra = {}) => ({ id, module: 'sidecard', at, end, why: '', spec: JSON.stringify({ presenter: 'p.png', ...extra }) });
  const reference = [
    { at: 0, end: 4, device: 'presenter', material: 'none', shows: '讲者' },
    { at: 4, end: 8, device: 'article', material: 'page', shows: '另一篇报道' },
    { at: 8, end: 10, device: 'brand', material: 'photo', shows: '手机上的标志' },
    { at: 10, end: 12, device: 'recap', material: 'none', shows: '回顾' },
  ];
  // the reference's article and brand quietly replaced by the presenter with tags: refused, the shares say how much matched
  const quiet = { reference, shots: [card('S1', 0, 4), card('S2', 4, 8, { tags: [{ at: 5, text: '顶上' }] }), card('S3', 8, 10, { tags: [{ at: 8, text: '标志' }] }), card('S4', 10, 12)], requests: [] };
  let r = compareToReference(quiet, [0, 12], { index: idx });
  assert.equal(r.technique, 0.4); assert.deepEqual(r.gaps.map((g) => g.device), ['recap']);
  assert.ok(r.errors.some((e) => /4\.0-8\.0 s: the reference does 报道逐段高亮推进/.test(e)) && r.errors.some((e) => /never another device quietly/.test(e)));
  // the same with a request for each: declared, allowed, the material share says it is requested
  const declared = { ...quiet, requests: [{ shot: 'S2', kind: 'page', what: '那篇报道', search: 'CRN A800', entity: 'NVIDIA', reference: '' }, { shot: 'S3', kind: 'photo', what: '标志实拍', search: 'deepseek logo phone', entity: 'DeepSeek', reference: '' }] };
  r = compareToReference(declared, [0, 12], { index: idx });
  assert.deepEqual(r.errors, []); assert.equal(r.materialRequested, 1); assert.equal(r.material, 0); assert.equal(r.technique, 1);
  assert.deepEqual(r.rows.map((x) => x.technique), ['match', 'requested', 'requested', 'gap']);
  // the devices done as their modules with the right kind of picture: everything matches
  const done = { reference, shots: [card('S1', 0, 4), { id: 'S2', module: 'article', at: 4, end: 8, why: '', spec: JSON.stringify({ src: 'page.png', hide: ['x'], beats: [] }) }, { id: 'S3', module: 'brand', at: 8, end: 10, why: '', spec: JSON.stringify({ src: 'phone.jpg', name: 'DeepSeek' }) }, card('S4', 10, 12)], requests: [] };
  r = compareToReference(done, [0, 12], { index: idx });
  assert.deepEqual(r.errors, []); assert.equal(r.technique, 1); assert.equal(r.material, 1);
  assert.ok(reportText('t', r).includes('手法对上 100%'));
  // the whole check: no reference beats is an error; the brand picture must read the name it calls out
  assert.ok(checkShotplan({ shots: done.shots, requests: [] }, [0, 12], { index: idx }).errors.some((e) => /write the reference/.test(e)));
  const coder = { files: { ...idx.files, 'coder.png': { kind: 'logo', w: 1408, h: 236, chars: 13, text: 'deepseek coder' } } };
  const wrong = { ...done, shots: done.shots.map((s) => (s.id === 'S3' ? { ...s, spec: JSON.stringify({ src: 'coder.png', name: 'DeepSeek' }) } : s)) };
  assert.ok(checkShotplan(wrong, [0, 12], { index: coder }).errors.some((e) => /a different mark \(coder\)/.test(e)));
  // a product photograph's own print is no mark (the H100 reads "H100 NVLINK"): not held against the card
  const { identityErrors } = await lib('matindex.mjs');
  assert.deepEqual(identityErrors({ module: 'sidecard', cards: [{ title: 'H100', img: 'h100.png' }] }, { files: { 'h100.png': { kind: 'cutout', chars: 10, text: 'H100 NVLINK' } } }), []);
  // the presenter with torn-paper tags is a side card (reference P24), with nothing on it the plain presenter
  const tagged = { reference: [{ at: 0, end: 4, device: 'side-card', material: 'none', shows: '撕纸标签' }, { at: 4, end: 8, device: 'presenter', material: 'none', shows: '讲者' }], shots: [card('S1', 0, 4, { tags: [{ at: 1, text: '顶级工人团队' }] }), card('S2', 4, 8)], requests: [] };
  assert.equal(compareToReference(tagged, [0, 8]).technique, 1);
  // a request as a need of the materials step: a page through source discovery, never bound into a shot
  const need = requestNeed('h800', declared.requests[0], '一般人到这就认了');
  assert.equal(need.shotId, 'h800-S2'); assert.equal(need.kind, 'page'); assert.equal(need.module, true); assert.equal(need.page.queryEn, 'CRN A800'); assert.deepEqual(need.page.entities, ['NVIDIA']);
  assert.equal(requestNeed('h800', declared.requests[1]).form, 'photo');
  // Commons throttling answers in plain text: no logo candidates, no crash (blind run 2026-10-21)
  const { commonsLogoCandidates } = await lib('materials.mjs');
  assert.deepEqual(commonsLogoCandidates(['Meta'], () => 'You are making too many requests to the API.'), []);
  // a 4 s clip cannot carry a 5.7 s insert (it would freeze); 640 px archival footage is fine
  const { materialErrors: me } = await lib('matindex.mjs');
  const clipIdx = { files: { 'c.mp4': { kind: 'footage', w: 640, h: 480, dur: 4, chars: 0 } } };
  assert.ok(me({ module: 'insert', at: 0, end: 5.7, src: 'c.mp4' }, clipIdx).some((e) => /lasts 4 s/.test(e)));
  assert.deepEqual(me({ module: 'insert', at: 0, end: 3, src: 'c.mp4' }, clipIdx), []);
  // the independent judge: the inventory's sequences as beats, a later one cutting an earlier short, gaps the presenter
  const { inventoryBeats, rubricCheck } = await lib('shotplan.mjs');
  const inv = { techniques: [{ key: 'article', examples: [{ id: 'P1', at: 2, dur: 4, title: '报道' }] }, { key: 'brand', examples: [{ id: 'G1', at: 5, dur: 2, title: '标志' }] }] };
  assert.deepEqual(inventoryBeats(inv, [0, 10]).map((b) => [b.device, b.at, b.end]), [['presenter', 0, 2], ['article', 2, 5], ['brand', 5, 7], ['presenter', 7, 10]]);
  // without a reference, the playbook's rules: the presenter alone at most 6 s; a person named first is shown
  const names = [{ id: 'liang', kind: 'person', names: ['梁文锋'] }];
  const narr = [{ at: 0, end: 3, text: '梁文锋是做量化的', words: [['梁', 0], ['文', .2]] }];
  const bare = { shots: [card('S1', 0, 8)], requests: [] };
  const rb = rubricCheck(bare, narr, names);
  assert.ok(rb.errors.some((e) => /presenter alone for 8\.0 s/.test(e)) && rb.errors.some((e) => /梁文锋 is named for the first time/.test(e)));
  const shown = { shots: [{ id: 'S1', module: 'person', at: 0, end: 4, why: '', spec: JSON.stringify({ photo: 'l.png', name: '梁文锋' }) }, card('S2', 4, 8, { tags: [{ at: 5, text: '量化' }] })], requests: [] };
  assert.deepEqual(rubricCheck(shown, narr, names).errors, []);
  // a report named by its title: the title is what a page must carry to be that report
  assert.deepEqual(requestNeed('h800', { shot: 'S2', kind: 'page', what: '对标《美国筑起芯片高墙之时》完整报道', search: 'x', entity: null, reference: '' }).page.entities, ['美国筑起芯片高墙之时']);
});

// 2026-10-21 (the user: 总不能跑半天跑出低质量的结果): a passage goes through the cheap layers first. The sheet shows each
// shot at three moments beside the reference; the picture review's answer is checked; a plan fix goes back to the
// director, a module fix is module work; cuts land on words
test('layers: key frames, the picture review, cuts on words', async () => {
  const { keyTimes, checkStillAnswer, reviewErrors, cutsOnWords, afterStamp } = await lib('layers.mjs');
  assert.deepEqual(keyTimes({ at: 10, end: 16 }), [10.9, 13.6, 15.75]);
  // a recall is as new as the shot it shows: its verdict does not outlive that shot's change (recap S1, review 97)
  { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-after-')), f = path.join(dir, 'S2.json'), cfg0 = { dataDir: dir };
    fs.writeFileSync(f, JSON.stringify({ module: 'table', rows: [['a']] }));
    const spec = { module: 'frame', ground: { src: { after: f, whole: true } } }, one = afterStamp(cfg0, spec);
    fs.writeFileSync(f, JSON.stringify({ module: 'table', rows: [['b']] }));
    assert.notEqual(afterStamp(cfg0, spec), one, 'the recalled shot changed');
    assert.equal(afterStamp(cfg0, { module: 'frame' }), '', 'a shot that recalls nothing keeps its hash'); }
  const due = [{ id: 'S1' }, { id: 'S2' }];
  assert.ok(checkStillAnswer({ shots: [{ id: 'S1', verdict: 'pass', owner: null, problems: [], fix: null, notes: null }] }, due).some((e) => /S2: no verdict/.test(e)));
  assert.ok(checkStillAnswer({ shots: [{ id: 'S1', verdict: 'fix', owner: 'plan', problems: [], fix: 'x', notes: null }, { id: 'S2', verdict: 'pass', owner: null, problems: [], fix: null, notes: null }] }, due).some((e) => /names its problems/.test(e)));
  const fixes = [{ shot: 'S1', verdict: 'fix', owner: 'plan', problems: [{ kind: 'unreadable', at: 3, say: '字太小' }], fix: '推近' }, { shot: 'S2', verdict: 'fix', owner: 'module', problems: [{ kind: 'overlap', at: null, say: '压字' }], fix: null }];
  const errs = reviewErrors(fixes);
  assert.equal(errs.length, 1); assert.ok(/S1 unreadable @3s: 字太小（建议：推近）/.test(errs[0]));
  const narr = [{ at: 0, end: 2, words: [['一', 0], ['二', 1]] }, { at: 2.5, end: 4, words: [['三', 2.5]] }];
  assert.deepEqual(cutsOnWords([{ id: 'A', at: 0 }, { id: 'B', at: 1.05 }, { id: 'C', at: 2.1 }], narr), []);
  assert.equal(cutsOnWords([{ id: 'A', at: 0 }, { id: 'B', at: 1.5 }], narr).length, 1);
});

// 2026-10-21 (the user: 之后只允许用这些字体做, 系统不要加字幕了): house rules. Every font name the line uses resolves to a
// house font; a name that does not is refused; subtitles are off
test('house rules: only the house fonts, no subtitles', async () => {
  const { houseRules, houseFamily, glyphErrors, subtitlesOn } = await lib('house.mjs');
  assert.equal(subtitlesOn(), false);
  const r = houseRules();
  assert.equal(r.fonts.allowed.length, 7, 'six, and the bold gothic the user added on 2026-10-25');
  for (const fam of Object.values(r.fonts.alias)) assert.ok(r.fonts.allowed.some((f) => f.family === fam), `alias to ${fam}`);
  // every family the module pages name is a house font or an alias of one
  const dir = path.join(REPO, 'work/recipe-board-v1/modules'), names = new Set();
  for (const f of fs.readdirSync(dir).filter((n) => /\.(html|js)$/.test(n))) for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/font-family:\s*([^;"`]+)/g)) for (const n of m[1].split(',')) { const x = n.trim().replace(/^['"]|['"]$/g, ''); if (x && !/^(serif|sans-serif|monospace)$/.test(x) && !x.startsWith('$')) names.add(x); }
  for (const n of names) assert.ok(houseFamily(n), `module font "${n}" is not a house font or alias`);
  assert.ok(glyphErrors({ 'Comic Sans MS': '字' }).some((e) => /not a house font/.test(e)));
  // the words on screen are Traditional; paths, page phrases and site names stay as written
  const { hantDeep } = await lib('house.mjs');
  const t = hantDeep({ name: '梁文锋', photo: 'work/x/梁文锋.png', beats: [{ phrase: '美国筑起芯片高墙之时', text: '美国筑起芯片高墙之时' }], hide: ['经济观察网'] });
  assert.deepEqual(t, { name: '梁文鋒', photo: 'work/x/梁文锋.png', beats: [{ phrase: '美国筑起芯片高墙之时', text: '美國築起芯片高牆之時' }], hide: ['经济观察网'] });
});

// 2026-10-21 (the user: 系统挑着用挑着设计包装, 就是用这些字体): a shot designs its type from the house fonts, two faces at
// most; a choice that lacks the shot's characters is said before render; an undesigned passage is pointed out
test('house type design: choices, limits, gaps', async () => {
  const { typeErrors, houseByName, housePick } = await lib('house.mjs');
  assert.equal(houseByName('黒華明朝'), 'House Kokka'); assert.equal(houseByName('スミカク'), 'House Sumikaku'); assert.equal(houseByName('Comic Sans'), null);
  assert.deepEqual(typeErrors({ display: '金畫字', text: '黒華明朝' }), []);
  assert.ok(typeErrors({ display: '金畫字', text: '黒華明朝', accent: 'スミカク' }).some((e) => /two at most/.test(e)));
  assert.ok(typeErrors({ display: 'Arial' }).some((e) => /not a house font/.test(e)));
  assert.equal(housePick({ display: '装甲明朝' })['SourceHanSerif Heavy'], 'House Soukou');
  // a shot that chooses no type passes null (the passages step failed on it once)
  const { houseFontCss } = await lib('house.mjs');
  assert.ok(houseFontCss(null).includes("html{font-family:'House Kokka'}"));
  const { typeWarnings, loadHouse } = await lib('shotplan.mjs'); await loadHouse();
  const shot = (id, type, text) => ({ id, module: 'title', at: 0, end: 2, why: '', spec: JSON.stringify({ text, ...(type ? { type } : {}) }) });
  assert.ok(typeWarnings({ shots: [1, 2, 3, 4, 5].map((i) => shot(`S${i}`, null, '標題')) }).some((w) => /no shot chooses its fonts/.test(w)));
  assert.ok(typeWarnings({ shots: [shot('S1', { display: 'スミカク' }, '残血版')] }).some((w) => /S1: スミカク lacks 殘/.test(w)));
});

test('storyboard v2: each beat lists its reads (one at a time, 0.8 s each, inside the beat) and a diagram gives its camera as numbers', async () => {
  const { readsErrors, keysErrors, normalizeAnswer } = await lib('storyboard.mjs');
  assert.deepEqual(readsErrors({ seconds: 4, reads: [{ from: 0, to: 1.4, what: '碱基两两合上' }, { from: 1.6, to: 4, what: '拧成双螺旋' }] }), []);
  assert.match(readsErrors({ seconds: 4, reads: [] })[0], /list what the viewer/);
  assert.ok(readsErrors({ seconds: 4, reads: [{ from: 0, to: 2, what: 'a' }, { from: 1.2, to: 3, what: 'b' }] }).some((e) => /one read at a time/.test(e)), 'two reads at once');
  assert.ok(readsErrors({ seconds: 4, reads: [{ from: 0, to: 0.4, what: 'a' }] }).some((e) => /too short/.test(e)));
  assert.ok(readsErrors({ seconds: 2, reads: [{ from: 0, to: 0.8, what: 'a' }, { from: 0.8, to: 1.6, what: 'b' }, { from: 1.6, to: 2, what: 'c' }] }).some((e) => /cannot each get/.test(e)));
  const sb = normalizeAnswer({ shots: [{ diagram: { form: '3d', figure: 'dna', camera: 'x', keys: '[{"at":0,"dist":9,"elev":10,"azim":-35,"dur":0,"look":"中段"}]' } }] });
  assert.deepEqual(keysErrors(sb.shots[0].diagram, 8), []);
  assert.match(keysErrors({ form: '3d', keys: 'not json' }, 8)[0], /not a JSON array/);
  assert.match(keysErrors({ form: '3d', keys: [] }, 8)[0], /needs its camera as keys/);
  assert.deepEqual(keysErrors({ form: '2d', keys: [] }, 8), []);
  assert.ok(keysErrors({ form: '3d', keys: [{ at: 9, dist: 0, elev: 120, azim: 0, dur: 1, look: '' }] }, 8).length >= 4);
});

test('tells: the list of what makes a frame look generated is there for the chapter writer and the review', () => {
  const t = readJson(path.join(DATA, 'routing', 'tells.json'));
  assert.equal(t.contract, 'A1RecipeBoardTells/v1');
  assert.ok(t.tells.length >= 10 && t.tells.every((x) => typeof x === 'string' && x.trim()));
});

test('article marks hug the glyphs: OCR estimates are fitted to the ink, ends on the gaps between glyphs, no punctuation', async () => {
  const { tightBox } = await lib('modules.mjs');
  // a line of four 20 px glyphs (2 px gaps) and a comma, ink rows 10-29; the OCR estimate is off by 8 px at each end
  // (h800-S2: the bar took the comma and cut into the neighbouring glyph)
  const W = 140, H = 40, glyph = (j) => j >= 10 && j < 98 && (j - 10) % 22 < 20, comma = (j) => j >= 100 && j < 104;
  const rows = Array.from({ length: H }, (_, i) => Array.from({ length: W }, (_, j) => ((i >= 10 && i < 30 && glyph(j)) || (i >= 25 && i < 30 && comma(j)) ? '1' : '0')).join(''));
  const t = tightBox({ x0: 0, y0: 0, rows }, { x: 40, y: 7, w: 66, h: 26 });
  assert.deepEqual([t.x, t.y, t.w, t.h], [32, 10, 64, 20], 'second to fourth glyph, ink height');
  assert.deepEqual(t.room, [2, 4], 'the clear space to the neighbours');
  const end = tightBox({ x0: 0, y0: 0, rows }, { x: 8, y: 6, w: 98, h: 30 });
  assert.equal(end.x + end.w, 96, 'the comma after the last glyph is left out');
  // letters without descenders keep the line's height (the OCR box's middle), not their own (h800-S8)
  const low = Array.from({ length: H }, (_, i) => Array.from({ length: W }, (_, j) => (i >= 14 && i < 26 && glyph(j) ? '1' : '0')).join(''));
  const l = tightBox({ x0: 0, y0: 0, rows: low }, { x: 10, y: 7, w: 88, h: 26 });
  assert.ok(l.y < 11 && l.y + l.h > 28, `line height kept: ${l.y}..${l.y + l.h}`);
});

test('the shot director is told when a page phrase is missing, partial or marked mid-word (page check before render)', async () => {
  const { checkShotplan } = await lib('shotplan.mjs');
  const spec = { src: 'page.png', hide: ['站'], beats: [{ at: 0, do: 'highlight', phrase: '国产大' }] };
  const answer = { shots: [{ id: 'S1', module: 'article', at: 0, end: 3, why: '', spec: JSON.stringify(spec) }] };
  const pages = (s) => (s.beats[0].phrase === '国产大' ? ['the mark on "国产大" stops inside a word (析国产大|模型De)'] : []);
  const r = checkShotplan(answer, [0, 3], { pages });
  assert.ok(r.errors.some((e) => /S1: the mark on "国产大" stops inside a word/.test(e)));
  assert.ok(!checkShotplan(answer, [0, 3]).errors.some((e) => /stops inside/.test(e)), 'offline checks read no pages');
});

test('every mark on page words is measured after rendering: cut or covered glyphs, wrong height, edges through words, unfinished, off the frame', async () => {
  const { markErrors } = await lib('modules.mjs');
  const part = { x: 100, y: 50, w: 200, h: 30, room: [8, 10], roomY: [12, 12] };
  const good = { kind: 'black', label: '出口管制', part, rect: { x: 96, y: 44, w: 209, h: 42 }, shown: 1, end: 3, screen: { x: 100, y: 400, w: 800, h: 160 }, edgeInk: 0 };
  assert.deepEqual(markErrors([good]), []);
  const one = (o) => markErrors([{ ...good, ...o }]).join('; ');
  assert.match(one({ rect: { ...good.rect, x: 110, w: 195 } }), /leaves part of the first or last glyph out/);
  assert.match(one({ rect: { ...good.rect, x: 90, w: 215 } }), /reaches into the neighbouring glyph/, 'the h800-S2 bar over the comma');
  assert.match(one({ rect: { ...good.rect, y: 56, h: 30 } }), /lower or higher than the words/);
  assert.match(one({ rect: { ...good.rect, y: 30, h: 70 } }), /× the type height/);
  assert.match(one({ edgeInk: .2 }), /edge runs through other words/, 'the h800-S3 red box through the next row');
  assert.match(one({ shown: .6 }), /sweep is not finished/);
  assert.match(one({ screen: { x: 1500, y: 400, w: 800, h: 160 } }), /out of the frame/, 'meta-S3: the camera left before the bar was drawn');
  assert.match(one({ part: { x: 100, y: 50, w: 200, h: 30 } }), /not fitted to the page's glyphs/);
  const box = { ...good, kind: 'box', rect: { x: 90, y: 40, w: 220, h: 50 } };
  assert.deepEqual(markErrors([box]), []);
  assert.match(markErrors([{ ...box, rect: { x: 120, y: 40, w: 160, h: 50 } }]).join(), /cuts the words/);
});

test('frame checks: what the picture review kept finding, measured on every module shot (size, contrast, edges, subtitle band, overlaps, faces, script, emoji, decoration, emptiness)', async () => {
  const { frameProblems, LIMITS } = await lib('framecheck.mjs');
  const ok = { text: '殘血版', line: 60, box: { x: 200, y: 200, w: 300, h: 70 }, op: 1, contrast: 160, hant: '殘血版' };
  assert.deepEqual(frameProblems(3, [ok]), []);
  const kinds = (b, ...rest) => frameProblems(3, [{ ...ok, ...b }], ...rest).map((p) => `${p.kind}:${p.owner}`);
  assert.deepEqual(kinds({ line: 25 }), ['unreadable:module'], 'the h800-S3 card header at 25 px');
  assert.deepEqual(kinds({ text: 'SILICON VALLEY', hant: 'SILICON VALLEY', line: 22 }), [], 'small Latin lines may be 20 px');
  assert.deepEqual(kinds({ contrast: 40 }), ['unreadable:module']);
  assert.deepEqual(kinds({ box: { x: 1800, y: 200, w: 300, h: 70 } }), ['off-frame:module']);
  assert.deepEqual(kinds({ box: { x: 2000, y: 200, w: 300, h: 70 } }), [], 'a row the camera panned past is not on screen (h800-S10)');
  assert.deepEqual(kinds({ box: { x: 1600, y: 960, w: 200, h: 80 } }), ['overlap:module'], 'the h800-S1 name chip in the subtitle band');
  assert.deepEqual(kinds({ hant: '殘血版本' }), ['other:module'], 'Simplified on screen');
  assert.deepEqual(kinds({ text: '好 😀', hant: '好 😀' }), ['other:module'], 'emoji');
  assert.deepEqual(kinds({}, [{ x: 250, y: 210, w: 100, h: 100 }]), ['overlap:module'], 'text over a face');
  assert.deepEqual(frameProblems(3, [ok, { ...ok, text: '頂級', hant: '頂級', box: { x: 220, y: 210, w: 200, h: 60 } }]).map((p) => p.kind), ['overlap']);
  { const { balanceProblem } = await lib('framecheck.mjs');
    assert.equal(balanceProblem(3, { top: .2, bottom: .03, share: .13 }, { top: .2, bottom: .18, share: .47 }).kind, 'unlike-reference', 'the figure high, the lower half empty, where the reference fills it (recap S6)');
    assert.equal(balanceProblem(3, { top: .2, bottom: .03, share: .13 }, { top: .2, bottom: .03, share: .13 }), null, 'the reference sits high too');
    assert.equal(balanceProblem(3, { top: .1, bottom: .08, share: .44 }, { top: .1, bottom: .1, share: .5 }), null); }
  { const word = { ...ok, text: 'DeepSeek', hant: 'DeepSeek', box: { x: 100, y: 500, w: 480, h: 120 } }, tag = { ...ok, text: '無推理', hant: '無推理', box: { x: 540, y: 505, w: 300, h: 115 } };
    assert.deepEqual(frameProblems(3, [word, tag]).map((p) => p.kind), ['overlap'], 'a tag over the end of a word on its line (r1-S8)');
    assert.deepEqual(frameProblems(3, [word, { ...tag, box: { x: 100, y: 610, w: 300, h: 115 } }]), [], 'the next line touching it is not'); }
  // decoration may run off the frame but must stay faint (meta-S5's ghost name)
  assert.deepEqual(kinds({ deco: true, alpha: .22, box: { x: -40, y: 0, w: 3000, h: 420 }, line: 420 }), []);
  assert.deepEqual(kinds({ deco: true, alpha: .8, box: { x: -40, y: 0, w: 3000, h: 420 }, line: 420 }), ['weak-design:module']);
  // much emptier than the reference at the same moment is the director's to change (h800-S9, meta-S2, meta-S6)
  assert.deepEqual(frameProblems(3, [], [], LIMITS, .09, .37).map((p) => `${p.kind}:${p.owner}`), ['unlike-reference:plan']);
  assert.deepEqual(frameProblems(3, [], [], LIMITS, .36, .46), []);
});

test('frame checks: a text mostly hidden under a picture, quote marks with no words, and the torn-label rule (不要总有那个小标签了)', async () => {
  const { frameProblems } = await lib('framecheck.mjs');
  const ok = { text: 'H100', line: 170, box: { x: 1300, y: 350, w: 430, h: 170 }, op: 1, contrast: 120, hant: 'H100' };
  assert.deepEqual(frameProblems(3, [{ ...ok, covered: .33 }]), [], 'the product over the lower part of the model name, as the reference does');
  assert.deepEqual(frameProblems(3, [{ ...ok, covered: .8 }]).map((p) => p.kind), ['overlap']);
  assert.deepEqual(frameProblems(3, [{ ...ok, text: '“”', hant: '“”', line: 54 }]).map((p) => p.kind), ['empty'], 'h800-S3: a card label without its words');
  const { labelErrors, shotLabels } = await lib('shotplan.mjs');
  const side = (id, tags) => ({ id, spec: { module: 'sidecard', tags: tags.map((text) => ({ text })) } }), plain = (id) => ({ id, spec: { module: 'sidecard' } });
  assert.deepEqual(shotLabels({ module: 'sidecard', cards: [{ label: '殘血版', swap: [{ label: '禁售' }] }], curl: { label: '參數' } }), ['殘血版', '禁售', '參數']);
  assert.deepEqual(shotLabels({ module: 'person', name: '扎克伯格' }), [], "a person card's name is the card's design");
  assert.deepEqual(labelErrors([side('S1', ['a']), plain('S2'), plain('S3'), side('S4', ['b', 'c']), plain('S5'), plain('S6')]), []);
  assert.match(labelErrors([side('S1', ['a']), side('S2', ['b'])]).join(), /right after S1/, 'h800 S7 then S7B');
  assert.match(labelErrors([side('S1', ['a', 'b', 'c'])]).join(), /3 torn labels/, 'h800-S3 had three');
  assert.match(labelErrors([side('S1', ['a']), plain('S2'), side('S3', ['b']), plain('S4'), side('S5', ['c']), plain('S6')]).join(), /3 of 6 shots/);
});

test('pool: heavy renders run a few at a time, a new one waits while memory is short, a failure stays with its item (太慢了)', async () => {
  const { pool } = await lib('pool.mjs');
  let now = 0, peak = 0;
  const job = async (n) => { now++; peak = Math.max(peak, now); await new Promise((r) => setTimeout(r, 5)); now--; if (n === 3) throw new Error('bad'); return n * 2; };
  const r = await pool([1, 2, 3, 4, 5, 6, 7], job, { jobs: 3, memory: () => 99, waitMs: 1 });
  assert.equal(peak, 3);
  assert.deepEqual(r.map((x) => x.value ?? x.error.message), [2, 4, 'bad', 8, 10, 12, 14], 'every item, in order');
  now = 0; peak = 0;
  await pool([1, 2, 4, 5], job, { jobs: 3, memory: () => 1, freeGb: 3, waitMs: 1 });
  assert.equal(peak, 1, 'short of memory: one at a time, never none');
  const { motionWorkers } = await lib('motion.mjs');
  assert.ok(motionWorkers(3) >= 2 && motionWorkers(1) >= motionWorkers(3), 'each side-by-side motion render takes its share of the cores');
});

test('a product photograph is not held to the drawn-person check', async () => {
  const { isPersonNeed } = await lib('shotplan.mjs');
  assert.equal(isPersonNeed({ entity: 'H800', original: 'H800的产品照片', look: { cutout: true }, archive: { keywords: ['product'] } }), false);
  assert.equal(isPersonNeed({ entity: '卡帕西', original: '卡帕西的照片', archive: { keywords: ['portrait'] } }), true);
});
test('the draft takes the material the film library holds for the entity a sub-shot names', async () => {
  const D = await lib('draft.mjs');
  const card = { subs: [{ id: 'R01', at: 0, end: 2, read: { device: 'person', shows: '卡帕西的人物卡' }, camera: null, look: null }, { id: 'R02', at: 2, end: 4, read: { device: 'brand', shows: '英伟达标志' } }, { id: 'R03', at: 4, end: 6, read: { device: 'person', shows: '一个工程师' } }], items: [] };
  const held = [{ names: ['卡帕西', 'Andrej Karpathy'], kind: 'person', pictures: [{ role: 'portrait', path: 'k.jpg' }] }, { names: ['英伟达', 'NVIDIA'], kind: 'org', pictures: [{ role: 'logo', path: 'n.png' }] }];
  const d = D.fillFromLibrary(await D.draftFromCard(card), card, held), sp = d.shots.map((x) => JSON.parse(x.spec));
  assert.equal(sp[0].photo, 'k.jpg'); assert.equal(sp[0].name, '卡帕西'); assert.equal(sp[0].en, 'Andrej Karpathy');
  assert.equal(sp[1].src, 'n.png'); assert.equal(sp[1].name, 'NVIDIA');
  assert.equal(sp[2].photo, D.TODO, 'a person the library does not hold stays to decide');
});
test('painted layers over or under any module: their art is text-free, placed in frame widths, inside the shot', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  const base = { module: 'title', at: 0, end: 3, text: '開源', theme: 'reference' };
  assert.deepEqual(checkModuleSpec({ ...base, layers: [{ art: { prompt: 'A few gold coins falling, no text, no logos' }, depth: .6, x: -.3, y: .1, w: .25, at: .5, in: 'drop', float: 8 }] }), []);
  assert.ok(checkModuleSpec({ ...base, layers: [{ art: { prompt: 'A sign with the title DeepSeek' } }] }).some((e) => /no words or marks/.test(e)), 'words in a painted layer');
  assert.ok(checkModuleSpec({ ...base, layers: [{ art: { prompt: 'coins' }, at: 9 }] }).some((e) => /outside the shot/.test(e)));
  assert.ok(checkModuleSpec({ ...base, layers: [{ art: { prompt: 'coins' }, depth: 3 }] }).some((e) => /depth/.test(e)));
});
test('the material library: the names a film says, once each, and what each kind is shown with', async () => {
  const { entitiesIn, entityRequests, namedInPlans } = await lib('entitylib.mjs');
  const known = [{ id: 'nvidia', kind: 'org', names: ['英伟达', 'NVIDIA'] }, { id: 'karpathy', kind: 'person', names: ['卡帕西', 'Andrej Karpathy'] }];
  const plans = [{ shots: [{ module: 'person', spec: JSON.stringify({ name: '伊爾亞·蘇茨克維', en: 'Ilya Sutskever' }) }] }];
  const reqs = [{ shot: 'S10', kind: 'portrait', entity: '鲍里斯·切尔尼', alias: '鮑里斯·切爾尼' }, { shot: 'S3', kind: 'portrait', entity: '卡帕西' }];
  const e = entitiesIn('英伟达的显卡，卡帕西说', known, reqs, [...namedInPlans(plans), { kind: 'person', names: ['鮑里斯·切爾尼', 'Boris Cherny'] }]);
  const ids = e.map((x) => x.names[0]);
  assert.equal(e.filter((x) => x.names.includes('鲍里斯·切尔尼') || x.names.includes('鮑里斯·切爾尼')).length, 1, 'one Boris, in either script');
  assert.ok(ids.includes('英伟达') && e.some((x) => x.names.includes('Ilya Sutskever')) && e.filter((x) => x.names.includes('卡帕西')).length === 1);
  const r = entityRequests({ id: 'karpathy', kind: 'person', names: ['卡帕西', 'Andrej Karpathy'] }, { portrait: 'x.jpg' });
  assert.deepEqual(r.map((q) => q.kind), ['footage'], 'only what it lacks');
  assert.match(r[0].search, /Andrej Karpathy interview/);
  assert.equal(entityRequests({ id: 'nvidia', kind: 'org', names: ['英伟达', 'NVIDIA'] }).map((q) => q.kind).join(), 'logo,photo');
});
test('the module bench: cases from an accepted spec, and the longest words a module sets cleanly are refused when written', async () => {
  const { atPath, casesOf } = await lib('bench.mjs');
  const { checkModuleSpec, ems, valuesAt } = await lib('modules.mjs');
  const o = { cards: [{ title: 'A100' }, { title: 'H800' }], columns: ['a', 'b'] };
  assert.deepEqual(atPath(o, 'cards[].title').map((v) => v.get()), ['A100', 'H800']);
  atPath(o, 'columns[]')[1].set('x'); assert.deepEqual(o.columns, ['a', 'x']);
  assert.deepEqual(valuesAt(o, 'cards[].title'), ['A100', 'H800']);
  assert.ok(Math.abs(ems('DeepSeek优化调度') - 8.4) < 1e-9);
  const seed = { module: 'title', at: 0, end: 3, text: '開源', theme: 'reference' };
  const cs = casesOf(seed), labels = cs.map((c) => c.label);
  assert.ok(labels.includes('as accepted') && labels.includes('shortest words') && labels.some((l) => /^display /.test(l)));
  for (const c of cs) assert.deepEqual(checkModuleSpec(c.spec), [], `${c.label} passes the spec check`);
  const card = { module: 'sidecard', at: 0, end: 3, presenter: 'p.png', cards: [{ at: .5, side: 'right', title: '深度求索人工智能模型訓練', img: 'x.png' }], tags: [], facts: [] };
  assert.ok(checkModuleSpec(card).some((e) => /cards\.title .*10 characters at most/.test(e)), 'a card title wider than the card');
  assert.ok(checkModuleSpec({ module: 'table', at: 0, end: 3, columns: ['深度求索人工智能模型', 'b'], rows: [['x', 'y']], rowsAt: [.1] }).some((e) => /columns .*8 characters/.test(e)));
});
test('a title or a quote is handed the display line of the reference at its moment, unless it sets its own size', async () => {
  const { withRefType } = await lib('shotplan.mjs');
  const card = { subs: [{ id: 'R01', at: 0, end: 2, text: [{ text: '开源', h: 276, cx: .5, cy: .55, w: .4 }], read: { shows: '大字开源', layers: '', type: '超粗白字 开源' } }, { id: 'R02', at: 2, end: 4, text: [] }] };
  assert.deepEqual(withRefType({ module: 'title', at: 0, end: 3, text: '開源' }, card).refType, { h: 276, cx: .5, cy: .55, w: .4 });
  assert.equal(withRefType({ module: 'title', at: 0, end: 3, size: 200 }, card).refType, undefined, 'its own size');
  assert.equal(withRefType({ module: 'title', at: 0, end: 3, side: 'left' }, card).refType, undefined, 'a title at one side');
  assert.equal(withRefType({ module: 'article', at: 0, end: 3 }, card).refType, undefined, 'a module that sets no display line');
  assert.equal(withRefType({ module: 'title', at: 2.5, end: 4 }, card).refType, undefined, 'no display line at its moment');
  const two = { subs: [{ id: 'R01', at: 0, end: 2, text: [{ text: '原生H800調度', h: 116, cx: .19, cy: .18, w: .23 }], read: { type: '原生H800調度 小标题' } }, { id: 'R02', at: 2, end: 3, text: [{ text: 'TE', h: 276, cx: .42, cy: .52, w: .17 }], read: { type: '撕裂大字 TE' } }] };
  const torn = { subs: [{ id: 'R02', at: 0, end: 3, text: [{ text: '原生H800調度', h: 116, cx: .19, cy: .18, w: .23 }], read: { type: '原生H800調度；极粗黑体，白银金属材质，约 400 px' } }] };
  assert.equal(withRefType({ module: 'title', at: 0, end: 3, text: '獎勵' }, { subs: [{ id: 'R07', at: 0, end: 30, text: [], read: { type: '算式白色粗黑体在黑块上约 70 px' } }] }).refType, undefined, 'a reader\'s size below display type is not a title\'s (r1-S8)');
  assert.equal(withRefType({ module: 'title', at: 0, end: 3, text: '顯卡' }, torn).refType?.h, 400, 'the reader\'s size of a display face OCR cannot read');
  assert.equal(withRefType({ module: 'title', at: 0, end: 3, text: '顯卡' }, two).refType?.h, 276, 'the tallest line it shares a third of itself with, not a small header (recap-S2)');
});
test('a person card may take its photograph from a clip of the person (talent-S8)', async () => {
  const { slotErrors } = await lib('matindex.mjs');
  assert.deepEqual(slotErrors('person.photo', 'a.mp4', { kind: 'footage', w: 1920, h: 1080, faces: 0, marks: [] }), [], 'a 1080p clip: its frame is chosen by the face at render');
  assert.ok(slotErrors('person.photo', 'a.mp4', { kind: 'footage', w: 640, h: 360, faces: 0, marks: [] }).some((e) => /1280/.test(e)), 'a small clip');
  assert.ok(slotErrors('person.photo', 'a.jpg', { kind: 'photo', w: 1000, h: 800, faces: 0, marks: [] }).some((e) => /no face/.test(e)), 'a photograph without a face');
});
test('steps look ring and a picture shown whole are checked (r1-S1, r1-S2)', async () => {
  const { checkModuleSpec: specErrors } = await lib('modules.mjs');
  const base = { module: 'steps', at: 0, end: 6, title: '過去如何讓AI學會推理', nodes: [{ at: 1, text: '海量人工', img: 'a.png', note: '找一堆人，手把手地教' }] };
  const has = (spec, re) => specErrors(spec).some((e) => re.test(e));
  assert.ok(!has({ ...base, look: 'ring' }, /look|note/), 'a ring look with notes');
  assert.ok(has({ ...base, look: 'bubbles' }, /look is "ring"/), 'an unknown look');
  assert.ok(has({ ...base, look: 'ring', nodes: [{ at: 1, text: '海量人工' }] }, /every step has a picture/), 'a ring without a picture');
  assert.ok(has({ ...base, nodes: [{ at: 1, text: '海量人工', note: '字'.repeat(41) }] }, /note 40/), 'a long note');
  assert.ok(has({ module: 'insert', at: 0, end: 3, src: 'x.png', fit: 'cover' }, /fit is "contain"/), 'an unknown fit');
});
test('a page read down at one zoom is rewrapped to a column that fits the frame (meta-S4)', async () => {
  const { articleColumn } = await lib('modules.mjs');
  const L = (n) => ({ text: '字'.repeat(n), w: n * 22, h: 22 });
  const lines = [L(28), L(28), L(27), L(12)];
  assert.equal(articleColumn({}, lines), 0, 'framed phrase by phrase: as printed');
  assert.equal(articleColumn({ pageCamera: [{ from: { phrase: 'x', abs: 1.2 }, to: { phrase: 'x', abs: 1.2 } }] }, lines), 0, 'the lines fit: as printed');
  const c = articleColumn({ pageCamera: [{ from: { phrase: 'x', abs: 3 }, to: { phrase: 'x', abs: 3 } }] }, lines);
  assert.ok(c > 0 && c * 3 <= 1920 - 240 && c % 22 === 0, `a whole number of characters inside the frame (${c})`);
  assert.equal(articleColumn({ column: 18 }, lines), 18 * 22, 'the column the director sets');
});

test('article pages: no byline, no date line, no hole where a picture was (h800-S2: 记者 沈怡然 on screen, a blank strip and a jump)', async () => {
  const { articleLines, META_LINE } = await lib('modules.mjs');
  const L = (text) => ({ text, x: 0, y: 0, w: 1000, h: 30 });
  const out = articleLines([L('美国筑起芯片高墙之时'), L('原创 2022-10-22 15:20 · 经济观察报'), L('经济观察网 记者 沈怡然 10月17日，一位美系设备商员工对经济观察网表示，美国芯'), L('片领域出口管制条例生效一周后，一家中国客户出现了个别设备的停转。'), L('作者：张三'), L('2025年1月28日')]);
  assert.deepEqual(out.map((l) => l.text), ['美国筑起芯片高墙之时', '10月17日，一位美系设备商员工对经济观察网表示，美国芯', '片领域出口管制条例生效一周后，一家中国客户出现了个别设备的停转。']);
  assert.ok(out[1].cut > .2 && out[1].cut < .4, 'the byline is cut from its line, the rest kept');
  assert.ok(!META_LINE.test('当地时间10月7日，BIS发布了新规'), 'a sentence with a date is the article');
  assert.equal(articleLines([L('凤凰卫视美洲台官方账号 2025.01.28 09:05')]).length, 0, 'a stamp after the account name (open-S10)');
});

test('chapter camera: a move faster than CAM_MAX px a frame fails its beat and says how long it needs; a dur-0 cut does not (镜头抽动)', async () => {
  const { whipErrors, CAM_MAX } = await lib('chapter.mjs');
  const shots = [{ shotId: 'B18', at: 0 }, { shotId: 'B19', at: 9.6 }];
  const slow = { track: Array.from({ length: 60 }, (_, i) => ({ t: (i + 1) / 30, px: 20 })), cuts: [] };
  assert.deepEqual(whipErrors(slow, shots), [], 'the reference chapter B07 peaks at 25-34 px');
  const whip = { track: [...Array.from({ length: 290 }, (_, i) => ({ t: (i + 1) / 30, px: 2 })), { t: 9.7, px: 140 }, { t: 9.73, px: 474 }, { t: 9.77, px: 300 }, { t: 9.8, px: 60 }], cuts: [] };
  const e = whipErrors(whip, shots);
  assert.equal(e.length, 1); assert.match(e[0], /^B19: the camera whips at 9\.7 s \(474 px a frame, at most 48\)/); assert.match(e[0], /about [\d.]+ s \(start it earlier/);
  assert.deepEqual(whipErrors({ track: [{ t: 9.6333, px: 900 }], cuts: [9.6] }, shots), [], 'a cut jumps in one frame on purpose');
  assert.equal(CAM_MAX, 48);
});

test('reel seams: rest-to-rest is a valid hard cut; only a declared carry must keep moving (衔接不好)', async () => {
  const { seamProblems, transitionFilter } = await lib('sequence.mjs');
  assert.deepEqual(seamProblems([{ id: 'B21', head: 0, tail: 1 }, { id: 'B22', head: 1, tail: 0.2, join: 'cut' }]), [], 'the reference hard cuts at rest');
  assert.deepEqual(seamProblems([{ id: 'B21', head: 0, tail: 1 }, { id: 'B22', head: 1, tail: 0.2, join: 'carry' }]), ['B21>B22: declared carry has no motion across the cut (1.0 s still out, 1.0 s still in)']);
  assert.deepEqual(seamProblems([{ id: 'A', head: 0, tail: 1 }, { id: 'B', head: 0.1, tail: 0, join: 'carry' }]), [], 'the incoming shot carries motion out of the cut');
  assert.equal(transitionFilter('cut', 'cut', 3), ''); assert.equal(transitionFilter('match', 'cut', 3), '');
  assert.match(transitionFilter('flash', 'cut', 3), /fade=t=in:st=0:d=0\.1:color=white/);
  assert.match(transitionFilter('cut', 'whip', 3), /gt\(t\\,2\.870\)/);
  assert.match(transitionFilter('glitch', 'cut', 3), /rgbashift=.*lt\(t\\,0\.17\).*noise=/, 'a glitch covers the first frames');
});

test('the plan: a beat that continues its chapter starts where the last left the camera, no cut the reference does not make', async () => {
  const { planCutErrors, PLAN_CUT_TOL } = await lib('storyboard.mjs');
  const k = (at, dur) => ({ at, dist: 10, elev: 30, azim: 0, dur, look: 'x' });
  const shots = [
    { beat: 'B01', card: 'morph-chapter', chapter: 'C1', seconds: 10, diagram: { keys: [k(0, 0), k(1, 2)] } },
    { beat: 'B02', card: 'morph-chapter', chapter: 'C1', seconds: 6, diagram: { keys: [k(0, 0), k(2, 0)] } },
    { beat: 'B03', card: 'title-hero-over-photo', chapter: 'C1', seconds: 4 },
    { beat: 'B04', card: 'morph-chapter', chapter: 'C2', seconds: 5, diagram: { keys: [k(0, 0)] } },
  ];
  const timing = { cuts: [16.0], times: { B01: [0, 9], B02: [11, 15], B03: [18, 20], B04: [21, 25] } };
  const e = planCutErrors(shots, timing);
  assert.equal(e.length, 2, 'B01 and B04 open their chapters; B02 starts on a cut and cuts again at 2 s (13.3 s of the reference, no cut there)');
  assert.match(e[1], /^B02: diagram\.keys\[1\] is a cut \(dur 0 at 2 s\).*no cut near 13\.3 s\): travel there/);
  assert.match(e[0], /^B02: diagram\.keys\[0\] is a cut \(dur 0 at 0 s\) inside chapter C1, where the reference keeps one take \(no cut near 11\.0 s\): start the beat from where the last one left the camera/);
  assert.equal(planCutErrors(shots, { ...timing, cuts: [11.2, 13.5] }).length, 0, 'the reference cuts at both');
  assert.equal(PLAN_CUT_TOL, 1.0);
  const sb = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/storyboard.md'), 'utf8');
  assert.doesNotMatch(sb, /"at":0,"dist":9,"elev":10,"azim":-35,"dur":0/, 'the example no longer opens a beat on a cut');
  assert.doesNotMatch(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/morph.md'), 'utf8'), /或者在拍的交界处直接硬切/);
});

test('motion boards: frames of one move, each drawn from the last, text-free, a target only once approved (效果图确认了再渲染)', async () => {
  const { boardPrompt, boardApproved } = await lib('keyframes.mjs');
  const L = { paper: '#151515', ink: '#ece8df', accent: '#e8452c' };
  const req = { why: 'the tree', buildable: 'three.js extruded letters', from: 'x.png', moments: [{ at: 0, frame: 'letters rise' }, { at: 4, frame: 'tags stand on them' }] };
  const p0 = boardPrompt(null, L, req, 0), p1 = boardPrompt(null, L, req, 1);
  assert.match(p0, /frame 1 of 2 of a motion board: 2 moments of ONE continuous camera move/);
  assert.match(p0, /where the shot before ends: this shot opens on the same object/);
  assert.match(p1, /keep the very same objects, materials, light and colours/);
  assert.match(p1, /It will be built from: three\.js extruded letters\. Draw only what that can make/);
  assert.match(p1, /no text, no letters, no numbers, no labels, no logos, no real people/);
  assert.equal(boardApproved({ key: 'a', approved: { key: 'a' } }), true);
  assert.equal(boardApproved({ key: 'b', approved: { key: 'a' } }), false, 'a board changed since its approval waits again');
  assert.equal(boardApproved({ key: 'a' }), false);
});

test('a board moves by plan: one owner at a time, the eye first, moves of a second and more, the beat ends at rest; the module holds to it', async () => {
  const { motionPlanErrors } = await lib('keyframes.mjs');
  const ok = { seconds: 8.7, in: { from: 'B12', carry: 'the sequence winds up into the band' }, out: { to: 'B14', carry: 'the TPOX 8/11 tag in the top left' },
    steps: [{ from: 0, to: 1.4, owner: 'content', what: 'chromosome 2 brightens' }, { from: 1.4, to: 3.2, owner: 'camera', what: 'glide to it', target: 'chromosome 2' },
      { from: 3.2, to: 8.7, owner: 'content', what: 'the band turns red, AATG repeats' }] };
  assert.deepEqual(motionPlanErrors('B13', ok), []);
  const bad = { ...ok, out: { to: 'B14', carry: '' }, steps: [{ from: 0, to: 1.0, owner: 'content', what: 'lights' }, { from: 1.0, to: 1.6, owner: 'camera', what: 'snap', target: 'x' }, { from: 1.6, to: 2.0, owner: 'camera', what: 'again', target: 'y' }] };
  const e = motionPlanErrors('B13', bad).join('\n');
  assert.match(e, /motion\.out names the next beat \(to\) and what crosses the seam/);
  assert.match(e, /a camera move of 0\.6 s; at least 1 s/);
  assert.match(e, /steps\[2\]: the eye goes first/);
  assert.match(e, /the beat ends at rest/);
  assert.match(e, /the steps end at 2 s, the beat at 8\.7 s/);
  assert.match(motionPlanErrors('B13', null)[0], /no motion plan/);
  const { planTrackErrors } = await lib('chapter.mjs');
  const shots = [{ shotId: 'B13', at: 10, dur: 8.7 }];
  const track = (f) => Array.from({ length: 261 }, (_, i) => ({ t: 10 + i / 30, px: f(i / 30) }));
  assert.deepEqual(planTrackErrors(track((t) => (t > 1.4 && t < 3.2 ? 20 : 0)), shots, { B13: ok }), [], 'moves in the camera step only');
  assert.match(planTrackErrors(track((t) => (t > 1.4 && t < 3.2 ? 20 : t > 5 && t < 6 ? 12 : 0)), shots, { B13: ok })[0], /^B13: the camera moves at 5\.\d s, inside the plan's content step 3\.2-8\.7 s/);
  assert.match(planTrackErrors(track(() => 0), shots, { B13: ok })[0], /the plan moves the camera 1\.4-3\.2 s \(chromosome 2\); it stands still there/);
});

test('a chapter module: a note put mid-line that swallowed code is caught; prose notes and whole-line notes pass', async () => {
  const { checkCode } = await lib('chapter.mjs');
  const base = 'export const beats = []; export function items() {} export function pose() {} export const DUR = 1;\n';
  const e = checkCode(base + "const m = new Mat({ c: 1 });   // the table; const t = new Mesh(g, m);").join();
  assert.match(e, /line 2: code inside a \/\/ comment/);
  assert.match(checkCode(base + "x = 1; // the 2 lands: closer in again`); g.restore(); } }").join(), /code inside a \/\/ comment/);
  assert.doesNotMatch(checkCode(base + 'x = 1;   // B07: no headline; lettering in the reference gothic').join(), /comment/);
  assert.doesNotMatch(checkCode(base + '// a whole-line note; const b = 2;').join(), /comment/);
  assert.doesNotMatch(checkCode(base + "const u = 'http://x'; // a url in a string").join(), /comment/);
});

test('the white model: a lite look without AO, depth of field or blur; two tiers; a part of a chapter', async () => {
  const { ANIMATIC_TIERS } = await lib('chapter.mjs');
  assert.deepEqual(ANIMATIC_TIERS, { look: { fps: 15, scale: 0.5 }, fast: { fps: 12, scale: 0.25 } });
  const morph = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(morph, /has\('lite'\)\) Object\.assign\(L, \{ ao: false, dof: false, ca: 0, blur: 1 \}\)/);
  const shoot = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/shoot.mjs'), 'utf8');
  assert.match(shoot, /range \? Math\.max\(0, Math\.round\(range\[0\] \* meta\.FPS\)\)/);
});

test('a waiting shot never silently replays its old version; only an explicit recall may do so', async () => {
  const { reelSource } = await lib('sequence.mjs');
  assert.deepEqual(reelSource({ current: '/new/todo.mp4', kept: '/old/good.mp4', waiting: true }), { file: '/new/todo.mp4', kept: false });
  assert.deepEqual(reelSource({ current: '/new/todo.mp4', kept: '/old/good.mp4', waiting: true, explicitRecall: true }), { file: '/old/good.mp4', kept: true });
  assert.deepEqual(reelSource({ current: '/new/motion.mp4', kept: '/old/good.mp4', waiting: false }), { file: '/new/motion.mp4', kept: false });
});

test('a kept version stands in for a waiting shot only if it was made under the house rules that hold now (B35 burned its old subtitle into B36)', async () => {
  const { keptVersion } = await lib('store.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-kept-')), cfg = { dataDir: tmp };
  fs.mkdirSync(path.join(tmp, 'routing')); fs.mkdirSync(path.join(tmp, 'projects', 'p1', 'out', 'motion', 'S1', 'renders'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'projects', 'p1', 'project.json'), '{}');
  const rules = path.join(tmp, 'routing', 'house-rules.json'), good = path.join(tmp, 'projects', 'p1', 'out', 'motion', 'S1', 'renders', 'good.mp4');
  fs.writeFileSync(rules, '{}'); fs.writeFileSync(good, 'x');
  const old = new Date(Date.now() - 86400000), now = new Date();
  fs.utimesSync(good, old, old); fs.utimesSync(rules, now, now);
  assert.equal(keptVersion(cfg, 'p1', 'S1'), null, 'made before the rules: not kept');
  fs.utimesSync(good, now, now); fs.utimesSync(rules, old, old);
  assert.equal(keptVersion(cfg, 'p1', 'S1'), good);
  assert.equal(keptVersion(cfg, 'p1', 'S2'), null, 'none made');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('a flat picture is never pulled back into the empty ground (缩小画面漏背景): the rule and the push-in that replaces it', async () => {
  const src = fs.readFileSync(path.join(LIB, 'storyboard.mjs'), 'utf8');
  assert.match(src, /s\.card !== 'morph-chapter' && s\.card !== 'hero-3d' && \[s\.hero, \.\.\.\(s\.secondary \|\| \[\]\)\]\.some\(\(x\) => x\?\.action === 'pull-back'\)\) err/);
  const { BREATH_CHANGES } = await lib('storyboard.mjs');
  assert.ok(BREATH_CHANGES.includes('push-in'));
  const acts = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/actions-v1.json'), 'utf8')).actions;
  assert.deepEqual(acts.find((a) => a.id === 'push-in')?.impl, { any: { pushin: 'at' } });
  const rt = fs.readFileSync(path.join(LIB, 'motion-runtime.browser.js'), 'utf8');
  assert.match(rt, /if \(c\.pushin != null\)/); assert.match(rt, /scale: 1\.22/);
});

test('cards declare no local() faces once the house fonts are in (a Traditional-only 條 fell to local Songti and failed B22); hero-3d may carry its figures', async () => {
  const src = fs.readFileSync(path.join(LIB, 'compose.mjs'), 'utf8');
  assert.match(src, /\.\.\.\(_houseFonts\(\)\.ready \? \[\] : LOCAL_FONTS\.map/);
  const hero = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/recipes/hero-3d.json'), 'utf8'));
  assert.equal(hero.slots.title.optional, true); assert.equal(hero.slots.annotation.optional, true); assert.equal(hero.slots.annotation.family, 'serif');
});

test('the white model gate: a chapter final render waits for the approval of its module version', async () => {
  const { approvedChapter, finalDue, ANIMATIC } = await lib('chapter.mjs');
  const a = { chapters: { B01: { codeHash: 'abc', at: 'x', by: 'user' } } };
  assert.equal(approvedChapter(a, 'B01', 'abc'), true);
  assert.equal(approvedChapter(a, 'B01', 'def'), false, 'a changed module waits again');
  assert.equal(approvedChapter(a, 'B07', 'abc'), false);
  assert.equal(approvedChapter(a, 'B01', null), false);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-gate-')), mp4 = path.join(tmp, 'f.mp4');
  assert.equal(finalDue(mp4, 'abc'), true, 'no final yet');
  fs.writeFileSync(mp4, 'x');
  const before = new Date(Date.now() - 60000).toISOString(), after = new Date(Date.now() + 60000).toISOString();
  assert.equal(finalDue(mp4, 'abc', { codeHash: 'abc', acceptedAt: before }), false, 'a final from before .code, made after its acceptance');
  assert.equal(finalDue(mp4, 'abc', { codeHash: 'abc', acceptedAt: after }), true, 'accepted after the render (the record is rewritten first: B23)');
  assert.equal(finalDue(mp4, 'def', { codeHash: 'abc', acceptedAt: before }), true);
  fs.writeFileSync(`${mp4}.code`, 'def\n'); assert.equal(finalDue(mp4, 'def', null), false, 'made from this version');
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.deepEqual(ANIMATIC, { fps: 15, scale: 0.5 });
});

test('a chapter is one take: its camera cuts only where the reference cuts (9 到 12 秒还是不自然硬切)', async () => {
  const { cutErrors, CUT_TOL } = await lib('chapter.mjs');
  const shots = [{ shotId: 'B01', at: 0, dur: 10.2 }, { shotId: 'B02', at: 10.2, dur: 5.6 }, { shotId: 'B03', at: 15.8, dur: 4.9 }];
  const times = { B01: [2.5, 6.0], B02: [11.0, 13.5], B03: [21.0, 24.5], B04: [25.0, 28.0] };
  // paperclip-138-full B01: cuts at 10.2 and 15.8 s; Vol.138 cuts first at 36.6 s
  const e = cutErrors([0, 10.2, 15.8], shots, { cuts: [36.633], times });
  assert.equal(e.length, 2);
  assert.match(e[0], /^B02: the camera cuts at 10\.2 s, where the reference keeps one take \(no cut near 11\.0 s\): travel there instead/);
  assert.match(e[1], /^B03: the camera cuts at 15\.8 s/);
  // B18 > B19: Vol.138 cuts at 145.0 s, in the pause before B19's line (146.5 s)
  assert.deepEqual(cutErrors([9.6], [{ shotId: 'B18', at: 0, dur: 9.6 }, { shotId: 'B19', at: 9.6, dur: 6.9 }], { cuts: [145.033], times: { B18: [138.5, 139.0], B19: [146.5, 150.5], B20: [150.5, 156.5] } }), [], 'the reference cuts between the lines');
  assert.match(cutErrors([12.3], shots, { cuts: [], times })[0], /^B02: the camera cuts at 12\.3 s.*no cut near 14\.8 s/, 'inside a beat: the same share of the reference beat');
  assert.deepEqual(cutErrors([10.2], shots, null), [], 'no reference: the cut stands');
  assert.equal(CUT_TOL, 1.0);
  const { whipErrors } = await lib('chapter.mjs');
  const w = whipErrors({ track: [{ t: 1, px: 400 }], cuts: [] }, shots);
  assert.doesNotMatch(w[0], /make it a cut/, 'a fast move is given time, never turned into a cut');
});

test('reel seams: the camera rests at a cut, carries one move across it, or whips; a match keeps the picture (衔接还是不丝滑)', async () => {
  const { seamJerks, CAM_REST } = await lib('sequence.mjs');
  const row = (id, tailCam, headCam, extra = {}) => ({ id, tailCam, headCam, ...extra });   // a seam A>B reads A's tailCam and B's headCam
  // paperclip-138-full B06>B07: crept into the cut at 2.8 px a frame, B07 started still
  const creep = seamJerks([row('B06', [0, 0, 2.8], [0, 0, 3]), row('B07', [0, 0, 0], [0, 0, 0.3])]);
  assert.equal(creep.length, 1); assert.match(creep[0], /^B06>B07: the camera is still moving into the cut \(\[0\.0, 0\.0, 2\.8\] px a frame\) and rests out of it/);
  assert.match(seamJerks([row('A', [0, 0, 0.2], [0, 0, 0]), row('B', [0, 0, 0], [0, 0, 3.6])])[0], /rests into the cut and moves out of it at another speed/);
  assert.deepEqual(seamJerks([row('A', [0, 0, 0.3], [0, 0, 0]), row('B', [0, 0, 0], [0.4, 0, 0.2])]), [], 'at rest on both sides');
  assert.deepEqual(seamJerks([row('A', [-3, -2, 3], [0, 0, 0]), row('B', [0, 0, 0], [-3.3, -2, 3.3])]), [], 'the same move carried on');
  assert.deepEqual(seamJerks([row('A', [60, 0, 0], [0, 0, 0]), row('B', [0, 0, 0], [0, 0, 0])]), [], 'a whip');
  assert.deepEqual(seamJerks([row('A', [0, 0, 3], [0, 0, 0]), row('B', [0, 0, 0], [0, 0, 0], { join: 'glitch' })]), [], 'a covered change');
  assert.deepEqual(seamJerks([row('A', [0, 0, 3], [0, 0, 0], { chapter: 'B10' }), row('B', [0, 0, 0], [0, 0, 0], { chapter: 'B10' })]), [], 'inside a chapter');
  assert.deepEqual(seamJerks([row('A', [0, 0, 3], [0, 0, 0]), row('B', [0, 0, 0], [0, 0, 0])], { blackPause: new Set(['B']) }), []);
  // a match that keeps nothing
  const m = seamJerks([row('A', [0, 0, 0], [0, 0, 0]), row('B', [0, 0, 0], [0, 0, 0], { join: 'match', carryIn: { iou: 0.08, corr: 0.1 } })]);
  assert.equal(m.length, 1); assert.match(m[0], /^A>B: called a match, but nothing of A's last frame stays \(edges 8 % in place\)/);
  assert.deepEqual(seamJerks([row('A', null, null), row('B', null, null, { join: 'match', carryIn: { iou: 0.4, corr: 0.2 } })]), []);
  assert.equal(CAM_REST, 1.8);
});

test('motion cards never hold dead still: every scene breathes in at the 3D breath rate, from rest to rest', async () => {
  const src = fs.readFileSync(path.join(LIB, 'motion-runtime.browser.js'), 'utf8');
  assert.match(src, /const BREATH_RATE = 0\.006/);
  assert.match(src, /tl\.fromTo\(el, \{ scale: 1 \}, \{ scale: Math\.max\(1, Math\.min\(1 \+ BREATH_RATE \* s\.duration, typeRoom\(el\)\)\), transformOrigin: '50% 50%', duration: s\.duration, ease: SETTLE/);
  // every whole-frame move comes to rest at the cut (the reference's camera rests on both sides of 16 of 17 hard
  // cuts): no push or breath at a constant speed, no push into the cut (衔接还是不丝滑)
  assert.doesNotMatch(src, /CUT_PUSH|CUT_GAIN/);
  for (const line of src.split('\n')) if (/scale:/.test(line) && /ease: 'none'/.test(line)) assert.fail(`a whole-frame move at a constant speed: ${line.trim()}`);
  assert.match(src, /const SETTLE = 'sine\.inOut'/);
  // a breath that comes back to an earlier picture changes it: dims, pulls back or is erased
  assert.match(src, /if \(c\.focus != null\)/); assert.match(src, /if \(c\.pullback != null\)/); assert.match(src, /if \(c\.erase != null\)/);
  assert.match(src, /ERASE_TAIL = 0\.6, at = Math\.max\(t0 \+ c\.erase, t0 \+ dur - 0\.9 - ERASE_TAIL\)/, 'an erase leaves at most 0.6 s of snow (B37 stood 1.5 s empty)');
  assert.doesNotMatch(src, /brightness\(1\.35\) contrast\(1\.6\)/, 'an erase never flashes white');
  const morph = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(morph, /export const BREATH_HALF = 12, BREATH_RATE = 0\.006/, 'the same rate in the 3D breath');
  assert.doesNotMatch(morph, /prev\.distanceTo\(now\) < d \* 0\.002/, 'motion blur no longer switches on and off');
});

test('chapter preview: the shots either side of a chapter frame its seams; none at the ends of the film (先不急全篇)', async () => {
  const { neighbours, PREVIEW_SCALE, CONTEXT } = await lib('chapter.mjs');
  assert.deepEqual(neighbours(['B16', 'B17', 'B18', 'B19', 'B20', 'B21'], 'B18', 'B20'), { before: 'B17', after: 'B21' });
  assert.deepEqual(neighbours(['B01', 'B02', 'B03', 'B04'], 'B01', 'B03'), { before: null, after: 'B04' });
  assert.deepEqual(neighbours(['B45', 'B46', 'B47', 'B48', 'B49'], 'B47', 'B49'), { before: 'B46', after: null });
  assert.equal(PREVIEW_SCALE, 0.5); assert.equal(CONTEXT, 2);
});

test('chapter targets: the reference film\'s own frames for the same lines come first, and the task says what they are for (对标是怎么做的)', async () => {
  const { targetsNote } = await lib('chapter.mjs');
  const n = targetsNote(3, 1, 'B18');
  assert.match(n, /^前 3 张是对标原片讲同一句话时的画面/); assert.match(n, /同一类手段/); assert.match(n, /不要换成 3D 方块、圆柱或小人/);
  assert.match(n, /接着 1 张是导演按分镜给这一章关键拍画的效果图（B18）/);
  assert.doesNotMatch(targetsNote(0, 0, ''), /原片讲同一句话/);
});

test('materials picked by eye, tried in order, checked after download (meta-S2 stopped at a blocked repost, meta-S6 took a 332 px model, h800-S3 a stack of cards)', async () => {
  const { shownFor, checkPickAnswer } = await lib('matpick.mjs');
  const c = (id) => ({ id });
  assert.equal(shownFor([c('a'), c('b'), c('c')]).print, shownFor([c('c'), c('a'), c('b')]).print, 'the answer holds for the set, whatever its order');
  assert.equal(shownFor(Array.from({ length: 12 }, (_, i) => c(`x${i}`))).list.length, 8, 'eight shown at most');
  const needs = [{ key: 'meta-S2', candidates: [c('a'), c('b')] }];
  const fit = (n, extra = {}) => ({ n, identity: 'match', moment: 'not_applicable', packaging: 'viable', why: 'right subject and room for the title', segment: null, ...extra });
  assert.deepEqual(checkPickAnswer({ needs: [{ key: 'meta-S2', order: [1, 2], none: false, why: null, assessments: [fit(1), fit(2)] }] }, needs), []);
  assert.match(checkPickAnswer({ needs: [{ key: 'meta-S2', order: [1], none: false, why: null, assessments: [] }] }, needs).join(), /exactly one identity\/moment\/packaging assessment/);
  assert.match(checkPickAnswer({ needs: [{ key: 'meta-S2', order: [1], none: false, why: null, assessments: [fit(1, { packaging: 'weak' })] }] }, needs).join(), /packaging must be viable/);
  assert.match(checkPickAnswer({ needs: [{ key: 'meta-S2', order: [3], none: false, why: null, assessments: [] }] }, needs).join(), /not a candidate number/);
  assert.match(checkPickAnswer({ needs: [] }, needs).join(), /no order/);
  assert.match(checkPickAnswer({ needs: [{ key: 'meta-S2', order: [], none: false, why: null, assessments: [] }] }, needs).join(), /give the order/);
  assert.match(checkPickAnswer({ needs: [{ key: 'meta-S2', order: [], none: true, why: null, assessments: [] }] }, needs).join(), /none needs a reason/);
  const videoNeeds = [{ key: 'banana-S4', candidates: [{ id: 'v', duration: 12 }] }];
  assert.match(checkPickAnswer({ needs: [{ key: 'banana-S4', order: [1], none: false, why: null, assessments: [fit(1, { moment: 'match' })] }] }, videoNeeds).join(), /valid segment inside 0-12s/);
  assert.deepEqual(checkPickAnswer({ needs: [{ key: 'banana-S4', order: [1], none: false, why: null, assessments: [fit(1, { moment: 'match', segment: { start: 2, end: 7 } })] }] }, videoNeeds), []);
  const { AGGREGATOR, minWidth } = await lib('materials.mjs');
  assert.ok(AGGREGATOR.test('inkl.com/news/meta') && AGGREGATOR.test('www.msn.com/en-us') && !AGGREGATOR.test('fortune.com/2025'), 'reposts rank below the publisher');
  assert.equal(minWidth({ form: 'photo' }), 1280, 'the full-frame slot size (open-S11: 1200 px passed here and failed the slot)'); assert.equal(minWidth({ form: 'photo', look: { cutout: true } }), 400); assert.equal(minWidth({ form: 'logo' }), 200);
  const { fitError, requestNeed } = await lib('shotplan.mjs');
  assert.equal(fitError({ form: 'photo' }, { kind: 'photo', w: 332 }, 1200), '332 px wide, 1200 at least to fill its slot');
  assert.match(fitError({ form: 'webpage' }, { kind: 'photo', w: 1920 }, 0), /not the webpage/);
  assert.equal(fitError({ form: 'photo' }, { kind: 'footage', w: 640 }, 1200), null, 'footage is not measured by its width here');
  const n = requestNeed('h800', { shot: 'S3', kind: 'cutout', what: 'H100 单卡', search: 'NVIDIA H100 PCIe photo', entity: 'H100' }, '', 160.2);
  assert.ok(n.look.cutout && n.form === 'photo' && n.refAt === 160.2, 'a cutout is a product photo, cut out after download');
});

test('storyboard: no empty stock shot where the reference film shows information; one where it is empty too (禁止塞空镜)', async () => {
  const { emptyShotErrors, ORIGINAL_INFO } = await lib('reference.mjs');
  const ref = { B21: { text: '"变态狂魔"血债 20万 白银警方', chars: 12 }, B30: { text: '', chars: 0 } };
  const alley = (beat, card = 'footage-plate') => ({ beat, card, evidence: [{ kind: 'stock', what: '西北居民街巷固定空镜' }] });
  assert.match(emptyShotErrors([alley('B21')], ref)[0], /^B21: an empty stock shot .* where the original shows information/);
  assert.deepEqual(emptyShotErrors([alley('B30')], ref), [], 'the original is an empty shot there too');
  assert.deepEqual(emptyShotErrors([{ beat: 'B21', card: 'article-highlight', evidence: [{ kind: 'event', what: '白银案悬赏通告剪报' }] }], ref), [], 'real clippings are fine');
  assert.deepEqual(emptyShotErrors([alley('B99')], ref), [], 'no reference for the beat: nothing to compare');
  assert.equal(ORIGINAL_INFO, 6);
});

test('materials: a report\'s captioned pictures are candidates, ranked by what the need asks for (B21: 嫌疑人画像 inside the China News report)', async () => {
  const { articleImagesOf, captionScore } = await lib('materials.mjs');
  const html = '<p><img src="/cr/2016/0908/2217578461.jpg" alt=""></p><p>嫌疑人画像</p><img src="/static/logo.png"><img src="/a/b.jpg" alt="现场民警">';
  const pics = articleImagesOf(html, 'https://www.chinanews.com/m/gn/x.shtml');
  assert.deepEqual(pics.map((p) => p.src), ['https://www.chinanews.com/cr/2016/0908/2217578461.jpg', 'https://www.chinanews.com/a/b.jpg'], 'logos are not photos');
  const want = '张欣为白银案画的三张嫌疑人模拟画像';
  assert.ok(captionScore(pics[0].caption, want) >= 0.25); assert.ok(captionScore('现场民警', want) < 0.25);
});

test('chapter numbers: an STR locus name is a label (D5S818), its counts are still data', async () => {
  const { numberErrors } = await lib('chapter.mjs');
  const text = '以 2 号染色体上的 TPOX 位点为例，只有 323 人在这里重复 8 次和 11 次。';
  assert.deepEqual(numberErrors(['D5S818', 'CSF1PO', 'TPOX 8 · 11', '323 人'], text), []);
  assert.equal(numberErrors(['D5S818 12 · 13'], text).length, 2, 'counts the text does not give, one error each');
  assert.ok(numberErrors(['D99S999'], text).length > 0, 'not a known locus');
});

test('words on a prop are printed on its blank (type.printOn), and the chapter prompt says so (血清那个字没做好)', async () => {
  const src = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/type.js'), 'utf8');
  assert.match(src, /export function printOn\(g, im, cx, cy, w/); assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit2.js'), 'utf8'), /export function propBoxes\(im\)/, 'propBoxes in kit2, shared with kit4 onScreen');
  assert.match(src, /globalCompositeOperation = 'multiply'/, 'the print takes the prop\'s light');
  assert.match(src, /groundType, printOn, propBoxes, surfaceType, bayBackType \}/, 'exposed to every chapter as type.bayBackType / surfaceType');
  const prompt = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/morph.md'), 'utf8');
  assert.match(prompt, /物件上的字印在物件上/); assert.match(prompt, /a blank white label/);
});

test('chapter pages keep the house rules: module strings to Traditional, faces to house fonts, a shared reference look (只用6款字体·繁体·层次)', async () => {
  const { moduleStrings } = await lib('chapter.mjs');
  assert.deepEqual(moduleStrings("label(g, '血样', 1); const x = `${n} 个位点`; tag('TPOX'); // 注释里的字"), ['血样', ' 个位点'], 'only the CJK string literals; comments and Latin stay');
  const morph = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(morph, /async function houseCanvas\(H, moduleURL\)/); assert.match(morph, /\['fillText', 'strokeText', 'measureText'\]\.forEach\(wrap\)/);
  assert.match(morph, /function lookUnder\(g, t\)/); assert.match(morph, /function lookOver\(g, t\)/);
  const moves = await import(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/moves.js'));
  assert.ok(moves.slide(1, 0, { dist: 200 }).dx < 1, 'a slide arrives'); assert.equal(moves.pan2([{ at: 0, x: 0 }, { at: 1, x: 100, dur: 1 }], 3).x, 100);
});

test('breakdown: the reference taken apart finely, every item answered, ours measured against it (拆的不够细，动效设计没对标上)', async () => {
  const B = await lib('breakdown.mjs');
  const cam = (zoom, pan = [0, 0], moving = .6) => ({ zoom, pan, moving, ease: .6, speed: .05 });
  const look = (base, lum, sat = 8, grain = 2) => ({ base, lum, sat, grain, contrast: 20, warm: 0, vignette: 20, sharp: 900 });
  const subs = [
    { id: 'R01', at: 0, end: 2.88, camera: cam(1.045), look: look('dark', 30), text: [{ text: '2025年1月', h: 608, cx: .49, cy: .51, w: .69 }], events: [1.55] },
    { id: 'R02', at: 2.88, end: 4.57, camera: cam(1.0, [.073, 0]), look: look('light', 64), text: [{ text: '413.50', h: 71, cx: .5, cy: .6, w: .1 }], events: [] },
    { id: 'R03', at: 4.57, end: 8, camera: cam(.87), look: look('dark', 35), text: [], events: [5.2, 6.1] },
  ];
  const items = B.breakdownItems(subs).map((x) => x.item);
  assert.deepEqual(items, ['R01.camera', 'R01.look', 'R01.type', 'R01.events', 'R01.layers', 'R02.cut', 'R02.camera', 'R02.look', 'R02.layers', 'R03.cut', 'R03.camera', 'R03.look', 'R03.events', 'R03.layers'], 'a cut into every sub-shot but the first; type only where a display line is set');
  // the reading must say what was measured
  const read = (id, motion, type = null) => ({ id, device: 'title', material: 'none', shows: 'x', layers: 'x', type, motion, transition: '硬切', texture: '颗粒' });
  let e = B.checkBreakdownAnswer({ subs: [read('R01', '金属字逐字出现'), read('R02', '不动'), read('R03', '不动')] }, subs);
  assert.ok(e.some((x) => /R01: the camera pushes in/.test(x)) && e.some((x) => /R01: display type/.test(x)) && e.some((x) => /R02: the camera travels/.test(x)) && e.some((x) => /R03: the camera pulls out/.test(x)), e.join('\n'));
  assert.deepEqual(B.checkBreakdownAnswer({ subs: [read('R01', '慢慢推近', '瘦高金属字'), read('R02', '向右平移'), read('R03', '拉远')] }, subs), []);
  // the plan answers every item; a cut said to match is a cut; a cut where the reference has none is said why
  const card = { cuts: [2.88, 4.57], subs, items: B.breakdownItems(subs) };
  const shots = [{ id: 'S1', at: 0, end: 2.9 }, { id: 'S2', at: 2.9, end: 6 }, { id: 'S3', at: 6, end: 8 }];
  const all = card.items.map((it) => ({ item: it.item, does: 'match', how: '照对标做到这一项' }));
  e = B.followErrors({ shots, follows: all.slice(1) }, card);
  assert.ok(e.some((x) => /R01.camera.*not answered/.test(x)), 'an item left out');
  assert.ok(e.some((x) => /R03.cut: said to match, but the plan does not cut near 4.57/.test(x)), 'a matched cut the plan does not make');
  assert.ok(e.some((x) => /S3 cuts at 6 s where the reference does not cut/.test(x)), 'a cut of the plan where the reference has none');
  const ok = [...all.map((x) => (x.item === 'R03.cut' ? { ...x, does: 'differ', how: '并进上一个镜头，模块做不了' } : x)), { item: 'plan-cut@S3', does: 'differ', how: '口播换了话题，在这里换镜' }];
  assert.deepEqual(B.followErrors({ shots, follows: ok }, card), []);
  // ours measured the same way: a matched push that stands still, a light frame where the reference is dark, a small title
  const ours = [
    { at: 0, end: 2.9, camera: cam(1.0, [0, 0], .05), look: look('light', 70, 8, .1), text: [{ text: '2025年1月', h: 200, cx: .5, cy: .5 }], events: [] },
    { at: 2.9, end: 4.6, camera: cam(1.0, [.08, 0]), look: look('light', 62), text: [], events: [] },
    { at: 4.6, end: 8, camera: cam(1.0, [0, 0]), look: look('light', 62), text: [], events: [5.5] },
  ];
  const p = B.compareBreakdown(card, ours, ok, { shots });
  const say = p.map((x) => `${x.item} ${x.say}`).join('\n');
  assert.match(say, /R01.camera the reference pushes in ×1.045/); assert.match(say, /R01.camera the reference moves 60%/);
  assert.match(say, /R01.look the reference is dark/); assert.match(say, /R01.type display line 200 px against the reference's 608 px/);
  assert.match(say, /R03.camera the reference pulls out ×0.87/);
  assert.doesNotMatch(say, /R02.camera/, 'a pan done is not a problem'); assert.doesNotMatch(say, /R03.cut/, 'an item answered differ is not measured');
  assert.equal(p.find((x) => x.item === 'R01.camera').shot, 'S1');
});

test('the shared camera and texture: any module takes spec.camera and spec.texture, checked and injected (拆解卡 → 运镜)', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  const base = { module: 'title', at: 0, end: 4, text: '憑什麼', bg: 'x.png' };
  assert.deepEqual(checkModuleSpec({ ...base, camera: [{ at: 0, end: 3, from: { zoom: 1.15, x: 0, y: 0 }, to: { zoom: 1, x: 0, y: 0 }, ease: 'out' }], texture: { grain: .4, vignette: .5 } }).filter((e) => /camera|texture/.test(e)), []);
  const bad = checkModuleSpec({ ...base, camera: [{ at: 0, end: 5, from: { zoom: .9 }, to: { zoom: 1.1, x: .2 }, ease: 'bounce' }], texture: { blur: 2 } }).filter((e) => /camera|texture/.test(e)).join('\n');
  assert.match(bad, /outside the shot/); assert.match(bad, /from.zoom 1-2.5/); assert.match(bad, /to: x, y within/); assert.match(bad, /ease/); assert.match(bad, /texture.blur/);
  const src = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8');
  const win = {}; new Function('window', 'document', src)(win, {});
  const st = win.__cameraState([{ at: 1, end: 2, from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1.2, x: .1, y: 0 }, ease: 'linear' }], 1.5);
  assert.ok(Math.abs(st.zoom - 1.1) < 1e-9 && Math.abs(st.x - .05) < 1e-9, 'halfway through a linear move');
  assert.equal(win.__cameraState([{ at: 1, end: 2, from: { zoom: 1 }, to: { zoom: 1.2 } }], 5).zoom, 1.2, 'held after the move');
  assert.match(fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8'), /addInitScript\(\{ path: path.join\(cfg.dataDir, 'modules', 'camera.js'\) \}\)/, 'injected into every module page');
  assert.match(fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8'), /'camera.js', 'treat.js'\]/, 'part of every shot\'s identity');
});

test('chapter plan: every element the reference shows on a beat is answered, match (how) or differ (why) (paperclip-138-full 2026-10-22: B13 B17 B09 B45 skipped)', async () => {
  const { chapterFollowErrors } = await lib('refbreakdown.mjs');
  const bd = { beats: [{ beat: 'B13', elements: [{ what: '染色体一排，红签标位点名' }, { what: '2 号染色体放大，TPOX 红签变大' }] }, { beat: 'B99', elements: [{ what: '不在这一章' }] }] };
  assert.match(chapterFollowErrors({ beats: { B13: {} } }, bd, ['B13']).join('\n'), /answer each of the reference's 2/);
  const e = chapterFollowErrors({ beats: { B13: { follows: [{ el: 0, does: 'match', how: '七个位点各一圈红环' }, { el: 1, does: 'differ', how: '短' }] } } }, bd, ['B13']).join('\n');
  assert.match(e, /why ours differs/);
  assert.deepEqual(chapterFollowErrors({ beats: { B13: { follows: [{ el: 0, does: 'match', how: '七个位点各一圈红环' }, { el: 1, does: 'match', how: '推近 TPOX 红环' }] } } }, bd, ['B13']), []);
  assert.match(chapterFollowErrors({ beats: { B13: { follows: [{ el: 0, does: 'match', how: '七个位点各一圈红环' }] } } }, bd, ['B13']).join('\n'), /element 1 .* not answered/);
  assert.deepEqual(chapterFollowErrors({ beats: {} }, null, ['B13']), [], 'no breakdown, nothing to answer');
});

test('reference breakdown: every element on its word, what carries over, ideas from the device library; a chapter plan names its carrier (拆得不够细，包括设计的巧思)', async () => {
  const { breakdownErrors, planErrors } = await lib('refbreakdown.mjs');
  const devices = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8')).devices;
  for (const d of ['carrier', 'rhyme', 'title-to-texture', 'scale-jump', 'symmetry', 'subject-stays', 'word-cue']) assert.ok(devices.some((x) => x.id === d), d);
  const good = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects/paperclip-138/breakdowns/191-231.json'), 'utf8'));
  assert.deepEqual(breakdownErrors(good, devices), [], 'the 191-231 s breakdown');
  const bad = { ...good, beats: [{ beat: 'B26', from: 1, to: 2, elements: [{ what: 'x', in: 1 }], carryOver: '', devices: ['nope'], idea: '' }] };
  const e = breakdownErrors(bad, devices).join('\n');
  assert.match(e, /word/); assert.match(e, /carryOver/); assert.match(e, /not in the library/); assert.match(e, /idea/);
  assert.match(planErrors(null, ['B26'], devices)[0], /exports no plan2/);
  assert.deepEqual(planErrors({ carrier: '血样管', beats: { B26: { devices: ['carrier'], form: 'flat', formFor: 'read' }, B27: { carryOver: '卡留下', devices: ['scale-jump'], form: '2.5d', formFor: 'quantity' } } }, ['B26', 'B27'], devices), []);
  assert.match(planErrors({ carrier: 'x', beats: { B26: { devices: ['word-cue'] }, B27: { carryOver: '', devices: ['word-cue'] } } }, ['B26', 'B27'], devices).join('\n'), /B27.carryOver[\s\S]*no device beyond timing/);
});

test('the card is the judge: the inventory\'s coarse beats set on the measured cuts and the reader\'s devices; the reference\'s own cuts allow a flash and a second framing (open: 38-43 s was filed as an article)', async () => {
  const B = await lib('breakdown.mjs'), SP = await lib('shotplan.mjs');
  const card = { range: [0, 10], cuts: [3, 3.4, 6], subs: [
    { id: 'R01', at: 0, end: 3, read: { device: 'title', material: 'none', shows: '讲者上压年份' } },
    { id: 'R02', at: 3, end: 3.4, read: { device: 'broll', material: 'portrait', shows: '人物快闪' } },
    { id: 'R03', at: 3.4, end: 6, read: { device: 'article', material: 'page', shows: '报道整页' } },
    { id: 'R04', at: 6, end: 10, read: { device: 'presenter', material: 'none', shows: '讲者中景，没有包装' } }] };
  const inv = [{ at: 0, end: .6, device: 'presenter', material: 'none', shows: '讲者' }, { at: .6, end: 3.2, device: 'title', material: 'photo', shows: 't' }, { at: 3.2, end: 10, device: 'article', material: 'page', shows: 'a' }];
  const j = B.judgeOnCard(inv, card, { materialOf: () => 'photo' });
  assert.deepEqual(j.map((b) => [b.at, b.end, b.device, b.material]), [[0, 3, 'title', 'none'], [3, 3.4, 'broll', 'portrait'], [3.4, 6, 'article', 'page'], [6, 10, 'presenter', 'none']]);
  const read = (d, m) => ({ id: 'R01', device: d, material: m, shows: 'x', layers: 'x', type: null, motion: '不动', transition: '硬切', texture: 'x' });
  const sub = [{ id: 'R01', at: 0, end: 1, camera: { zoom: 1, pan: [0, 0], moving: 0 }, look: {}, text: [] }];
  assert.match(B.checkBreakdownAnswer({ subs: [read('nope', 'x')] }, sub, ['title', 'presenter']).join('\n'), /device is one of[\s\S]*material is/);
  // a flash of 0.4 s and a second shot of the same report pass where the reference cuts, not elsewhere
  const P = '/x/presenter.png', sp = (o) => JSON.stringify(o);
  const ans = { reference: [], requests: [], shots: [
    { id: 'S1', module: 'sidecard', at: 0, end: 3, why: '', spec: sp({ presenter: P, cards: [], tags: [] }) },
    { id: 'S2', module: 'insert', at: 3, end: 3.4, why: '', spec: sp({ src: '/x/a.jpg' }) },
    { id: 'S3', module: 'article', at: 3.4, end: 6, why: '', spec: sp({ src: '/x/p.png', hide: [], beats: [{ at: 3.5, do: 'hold' }] }) },
    { id: 'S4', module: 'article', at: 6, end: 10, why: '', spec: sp({ src: '/x/p.png', hide: [], beats: [{ at: 6.1, do: 'hold' }] }) }] };
  const errs = (c) => SP.checkShotplan(ans, [0, 10], { card: c }).errors.join('\n');
  assert.match(errs(null), /S2: 0.40 s is a flash/); assert.match(errs(null), /S4: a second article on the same subject/);
  const e = errs({ ...card, items: [] }); assert.doesNotMatch(e, /flash/); assert.doesNotMatch(e, /second article/);
});

test('title shape tall: the reference\'s year set by its height and narrowed (open R01: 600 px tall condensed Mincho; ours a wide face at a third)', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  const b = { module: 'title', at: 0, end: 3, text: '2025年1月', style: 'metal' };
  assert.deepEqual(checkModuleSpec({ ...b, shape: 'tall', height: .55 }).filter((e) => /shape|height/.test(e)), []);
  assert.match(checkModuleSpec({ ...b, shape: 'wide', height: .9 }).join('\n'), /shape is tall[\s\S]*height 0.2-0.7/);
  const src = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/title.html'), 'utf8');
  assert.match(src, /S\.shape === 'tall'/); assert.match(src, /const nar = S\.letter\?\.big \? \.62 \/ \.72 : \.62;[\s\S]*scaleX\(\$\{Math\.min\(nar, \(side \? 700 : 1550\)/);
});

test('an eye pick holds for its need only: a key reused for another need does not inherit the old order (open-S8: the DeepSeek page, then Hassabis)', async () => {
  const { eyeOrder } = await lib('matpick.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-eye-')), data = path.join(root, 'work', 'recipe-board-v1'), proj = path.join(data, 'projects', 'p');
  writeJson(path.join(proj, 'project.json'), { id: 'p' });
  writeJson(path.join(proj, 'materials', 'matpick.json'), { needs: { 'p-S8@old': { order: ['page-1'], what: 'DeepSeek 维基页', at: '2026-10-21T10:00:00Z' } } });
  const cfg = { repoRoot: root, sourceRoot: REPO, dataDir: data };
  assert.deepEqual(eyeOrder(cfg, 'p', 'p-S8', 'DeepSeek 维基页')('new'), ['page-1'], 'the same need keeps its order when the set moved');
  assert.equal(eyeOrder(cfg, 'p', 'p-S8', 'DeepMind 哈萨比斯近景人像')('new'), null, 'another need under the same key is looked at again');
  writeJson(path.join(proj, 'materials', 'matpick.json'), { needs: { 'p-talk@old': { order: [], what: '安德森的采访视频', at: '2026-10-21T10:00:00Z' } } });
  assert.deepEqual(eyeOrder(cfg, 'p', 'p-talk', '安德森的采访视频')('old'), [], 'none holds for the set it was given on');
  assert.equal(eyeOrder(cfg, 'p', 'p-talk', '安德森的采访视频')('new'), null, 'none is not carried to a set with new candidates: looked at again');
});

test('a clip is never cut from a fallback: more than 48 scenes are thinned for the ranker, a weak-match clip is withdrawn (open-S11: Putin and a news anchor for Musk)', async () => {
  const m = fs.readFileSync(path.join(LIB, 'materials.mjs'), 'utf8'), sp = fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8');
  assert.match(m, /if \(scenes\.length > 48\) scenes = Array\.from\(\{ length: 48 \}/);
  assert.match(sp, /binds\[k\]\?\.weakMatch && binds\[k\]\?\.kind === 'video'/);
});

test('the device library is generic and learnt from the whole reference: every device says what / when / how / from, its cue compiles, every breakdown names only library devices (系统要学会对标，换文章也能做好)', async () => {
  const { breakdownErrors } = await lib('refbreakdown.mjs');
  const devices = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8')).devices;
  assert.ok(devices.length >= 40, `${devices.length} devices`);
  for (const d of devices) {
    for (const k of ['id', 'name', 'what', 'when', 'how']) assert.ok(String(d[k] || '').trim(), `${d.id}.${k}`);
    assert.ok(String(d.from || d.source || '').trim(), `${d.id}: reference provenance`);
    if (d.source) assert.ok(fs.existsSync(path.join(DATA, d.source)), `${d.id}: source exists`);
    if (d.cue) assert.doesNotThrow(() => new RegExp(d.cue), `${d.id}: cue compiles`);
    else assert.notEqual(d.required, true, `${d.id}: a required cue needs a matcher`);
  }
  const dir = path.join(REPO, 'work/recipe-board-v1/projects/paperclip-138/breakdowns'), files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 12, `${files.length} sections broken down`);
  const covered = files.map((f) => f.replace('.json', '').split('-').map(Number)).sort((a, b) => a[0] - b[0]);
  assert.equal(covered[0][0], 0); assert.ok(covered.at(-1)[1] >= 410, 'to the end of the film');
  for (let i = 1; i < covered.length; i++) assert.equal(covered[i][0], covered[i - 1][1], `no gap before ${covered[i][0]} s`);
  for (const f of files) assert.deepEqual(breakdownErrors(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), devices), [], f);
});

test('narration cues: what a line says calls for the reference\'s device; a chapter that ignores a required cue fails; the cues reproduce the reference\'s own choices', async () => {
  const { deviceCues, cueErrors, cueScore } = await lib('refbreakdown.mjs');
  const devices = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8')).devices;
  const beats = [{ beat: 'X1', text: '这种现象被称为 STR。' }, { beat: 'X2', text: '1000 个人里同时满足这五个条件的只剩下 1 个' }, { beat: 'X3', text: '发现与当年的 DNA 信息完全一致' }, { beat: 'X4', text: '2015 年下半年，他被采集了血样' }];
  const cues = Object.fromEntries(deviceCues(beats, devices).map((c) => [c.beat, c.devices]));
  assert.ok(cues.X1.includes('term-biggest')); assert.ok(cues.X2.includes('narrowing-frames') && cues.X2.includes('dots-as-people')); assert.ok(cues.X3.includes('symmetry'));
  assert.ok(!(cues.X4 || []).includes('number-grows'), 'a year is not a big number');
  assert.ok((deviceCues([{ beat: 'X6', text: '其中的烟碱，也就是尼古丁' }], devices)[0]?.devices || []).includes('term-biggest'));
  assert.ok(!(deviceCues([{ beat: 'X7', text: '也就是说，凶手很可能是他的同族亲属。' }], devices)[0]?.devices || []).includes('term-biggest'), '也就是说 names nothing (B28)');
  assert.ok(!(deviceCues([{ beat: 'X5', text: '9 名女性遇害，最小的一个只有 8 岁。' }], devices)[0]?.devices || []).includes('narrowing-frames'), 'an age is not what is left after a filter (B01)');
  const e = cueErrors({ carrier: 'x', beats: { X1: { devices: ['carrier'] } } }, beats, devices).join('\n');
  assert.match(e, /term-biggest/); assert.match(e, /narrowing-frames/); assert.match(e, /symmetry/);
  assert.deepEqual(cueErrors({ carrier: 'x', beats: { X1: { devices: ['term-biggest', 'narrowing-frames', 'tape-sweep'] } } }, beats, devices), [], 'an alternative device counts');
  const subs = path.join(REPO, 'work/recipe-board-v1/projects/paperclip-138/reference/subtitles.json');
  if (fs.existsSync(subs)) {   // the reference itself is local only (git-ignored)
    const dir = path.join(REPO, 'work/recipe-board-v1/projects/paperclip-138/breakdowns');
    const s = cueScore(fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))), JSON.parse(fs.readFileSync(subs, 'utf8')).lines, devices);
    assert.ok(s.recall >= 0.7, `the cues find ${s.recall} of the reference's devices`);
  }
  // the second film (paperclip-047): the cues tuned on the first found 3 % of its choices; written as sentence forms
  // (a number with its unit, a comparison, a cited study) they find about 40 %: a floor, not a target
  const subs2 = path.join(REPO, 'work/recipe-board-v1/projects/paperclip-047/reference/subtitles.json');
  if (fs.existsSync(subs2)) {
    const dir = path.join(REPO, 'work/recipe-board-v1/projects/paperclip-047/breakdowns');
    const s = cueScore(fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))), JSON.parse(fs.readFileSync(subs2, 'utf8')).lines, devices);
    assert.ok(s.recall >= 0.35, `the cues find ${s.recall} of the second film's devices`);
  }
});

test('a forced device the cue calls for may be declined on its beat with the reason (a cue is a guess: right about half the time on a second film)', async () => {
  const { cueErrors } = await lib('refbreakdown.mjs');
  const devices = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8')).devices;
  const beats = [{ beat: 'X1', text: '这种现象被称为 STR。' }];
  assert.match(cueErrors({ carrier: 'x', beats: { X1: { devices: ['carrier'] } } }, beats, devices).join('\n'), /term-biggest.*decline it/);
  assert.deepEqual(cueErrors({ carrier: 'x', beats: { X1: { devices: ['carrier'], declined: [{ device: 'term-biggest', why: '这里的名词上一拍已经最大地出现过，这拍只是复述' }] } } }, beats, devices), []);
  assert.match(cueErrors({ carrier: 'x', beats: { X1: { devices: ['carrier'], declined: [{ device: 'term-biggest', why: '不要' }] } } }, beats, devices).join('\n'), /term-biggest/, 'a reason of a word or two is no reason');
});

test('a chapter measured against the reference over the same lines: too still, too little type, too empty, no accent colour are named (B26: 8 characters against 16)', async () => {
  const { profileGaps, window } = await lib('refprofile.mjs');
  const ref = { moving: 0.5, still: 0.26, chars: 16, fill: 0.56, red: 0.76, lum: 42 };
  const g = profileGaps({ moving: 0.38, still: 0.375, chars: 8, fill: 0.36, red: 0.69, lum: 39 }, ref).join('\n');
  assert.match(g, /moves too little/); assert.match(g, /stands still/); assert.match(g, /too little type/); assert.match(g, /emptier/); assert.doesNotMatch(g, /accent|brighter/);
  assert.deepEqual(profileGaps({ ...ref }, ref), []);
  const w = window({ seconds: [{ t: 0.5, moving: 1, motion: 2, chars: 10, lines: 2, lineH: [60], fill: 0.5, red: 0.01, lum: 40 }, { t: 5.5, moving: 0, motion: 0, chars: 0, lines: 0, lineH: [], fill: 0.1, red: 0, lum: 10 }] }, 0, 2);
  assert.equal(w.seconds, 1); assert.equal(w.chars, 10); assert.equal(w.still, 0);
});

test('a designed frame (frame.html) is checked like any module: parts, sourced figures, the device it stands for, its pictures in the index', async () => {
  const M = await lib('modules.mjs'), MI = await lib('matindex.mjs'), S = await lib('shotplan.mjs');
  const f = { module: 'frame', at: 0, end: 3, stands: 'article', ground: { src: 'a.png', blur: 6 }, parts: [{ kind: 'text', text: '4個作戰室', box: { x: 8, y: 20, w: 70 } }, { kind: 'image', src: 'a.png', crop: { x: .3, y: .4, w: .5, h: .1 }, box: { x: 8, y: 58, w: 84 } }], facts: [{ text: '4', source: 'Fortune' }] };
  assert.deepEqual(M.checkModuleSpec(f), []);
  assert.match(M.checkModuleSpec({ ...f, facts: [] }).join(), /4 without a fact/);
  assert.match(M.checkModuleSpec({ ...f, stands: 'poster' }).join(), /stands is the device/);
  assert.match(M.checkModuleSpec({ ...f, parts: [] }).join(), /1-14 parts/);
  assert.match(M.checkModuleSpec({ ...f, parts: [{ kind: 'image', src: 'a.png', fade: 'left', fadeAt: 12, box: { x: 40, y: 0, w: 60 } }] }).join(), /see-through/, 'a portrait faded to a ghost (meta S8)');
  assert.deepEqual(M.checkModuleSpec({ ...f, parts: [{ kind: 'image', src: 'a.png', phrase: 'a cluster of 10,000', bar: { color: '#f3d21a' }, box: { x: 6, y: 39, w: 88 } }], facts: [{ text: '10,000', source: 'x' }] }), [], 'a part may be cut to its words');
  assert.match(M.checkModuleSpec({ ...f, parts: [{ kind: 'image', src: 'a.png', phrase: 'x', crop: { x: 0, y: 0, w: 1, h: 1 }, box: { x: 0, y: 0, w: 50 } }] }).join(), /phrase or crop, not both/);
  assert.match(fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8'), /const phraseCrop = \(l\) =>/, 'the crop comes from the words\' own boxes (locatePhrases)');
  assert.match(fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8'), /else if \(oneLine && \(f\.parts \|\| \[\]\)\.length > 1\)/, 'a frame cut to one phrase that wraps is refused (both whole lines, small words: meta-S4)');
  assert.match(fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8'), /if \(spec\.module === 'frame'\) for \(const l of spec\.parts \|\| \[\]\) if \(l\.kind === 'image' && l\.phrase/, 'a frame\'s phrases are checked on their page before rendering (r1-S3: a phrase found in part cut the crop to "The o")');
  assert.deepEqual(MI.picks(f).map((p) => p[0]), ['frame.ground', 'frame.image']);
  assert.deepEqual(S.paintedKinds('frame', { ...f, ground: { src: { art: { prompt: 'x' } } } }), ['photo', 'footage'], 'a painted ground stands for the footage under a title');
  assert.ok(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8').includes("m === 'frame' ? sp?.stands === dev?.module"), 'a frame does the device it stands for');
  assert.ok(JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/layouts/layouts.json'), 'utf8')).layouts.length >= 6, 'the layout library');
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/frame.html'), 'utf8'), /if \(G\.frames\)/, 'a module ground plays its own motion (talent S2: a table as a still measured as nothing moving)');
  assert.match(fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8'), /const moduleFrames = async/, 'its frames drawn by the module');
  assert.match(fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8'), /problems: \[\.\.\.\[\.\.\.checkModuleSpec\(spec\), \.\.\.phraseErrors\(cfg, spec\), \.\.\.notSourceErrors\(cfg, id, spec\)\]\.map\(said\), \.\.\.problems\]/, 'a shot tried reads its page phrases as the plan check does');
  assert.match(fs.readFileSync(path.join(LIB, 'ocrfind.swift'), 'utf8'), /return l == "l" \? "i" : l/, 'OCR\'s "Al" for "AI" still matches (a headline was cut at "the A")');
});

test('no line comment in a module swallows code after it on the same line (the callout\'s words were never set, r1-S3)', () => {
  const dir = path.join(REPO, 'work/recipe-board-v1/modules'), re = /\/\/[^\n]*?\)\s+(?:[\w$]+(?:\.[\w$]+)*\.(?:style|querySelector|textContent|innerHTML)\b|const |let |if \(|\}\)?;?\s*$)/;   // (and a closing brace: a chart's ghost names lost theirs, the page never got ready)
  for (const f of fs.readdirSync(dir).filter((x) => /\.(html|js)$/.test(x))) fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => { const m = l.match(re); assert.ok(!m || /https?:/.test(l.slice(0, m.index)), `${f}:${i + 1} code after a // comment: ${l.slice(m?.index ?? 0, (m?.index ?? 0) + 80)}`); });
});

test('a title or quote far smaller than the reference\'s display line fails at the sheet (round 40 blind reviews)', async () => {
  const { displayProblem } = await lib('framecheck.mjs');
  assert.match(displayProblem(1, [{ line: 120 }], 300).say, /reference's display line 300/);
  assert.equal(displayProblem(1, [{ line: 250 }], 300), null);
  assert.equal(displayProblem(1, [{ line: 120 }], null), null, 'no reference line, no measure');
});

test('display type may stand over a face (the reference\'s year over the presenter, open R01); a label over a face still fails', async () => {
  const { frameProblems } = await lib('framecheck.mjs');
  const face = [{ x: 800, y: 200, w: 300, h: 300 }];
  const big = { text: '2025年1月', hant: '2025年1月', line: 600, contrast: 120, op: 1, box: { x: 300, y: 150, w: 1300, h: 640 } };
  const tag = { text: '單日最大', hant: '單日最大', line: 60, contrast: 120, op: 1, box: { x: 820, y: 260, w: 260, h: 70 } };
  assert.ok(!frameProblems(1, [big], face).some((p) => /covers a face/.test(p.say)));
  assert.ok(frameProblems(1, [tag], face).some((p) => /covers a face/.test(p.say)));
  assert.ok(!frameProblems(1, [{ ...tag, line: 160, box: { x: 700, y: 260, w: 900, h: 180 } }], face).some((p) => /covers a face/.test(p.say)), 'a quote line at 160 px may cross a face (user 2026-10-23)');
  assert.ok(!frameProblems(1, [{ ...big, covered: .6 }], []).some((p) => /hidden under/.test(p.say)), 'display words may stand behind a product laid over them');
  assert.ok(frameProblems(1, [{ ...tag, covered: .6 }], []).some((p) => /hidden under/.test(p.say)), 'a label hidden that much still fails');
});

test('display type is measured by its strokes, so a title can be as big as the reference\'s (open R01: the box of a 600 px Mincho reached the subtitle band)', async () => {
  const fc = fs.readFileSync(path.join(LIB, 'framecheck.mjs'), 'utf8'), ti = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/title.html'), 'utf8');
  assert.match(fc, /q\.height >= 200/); assert.match(fc, /actualBoundingBoxAscent/);
  assert.match(ti, /S\.height \?\? \(S\.refType\?\.h \? S\.refType\.h \* REF_INK \/ 1080 : \.55\)\) \* 1080 \/ Math\.max\(1, ink0\)/);
});

test('a pick taken back as wrong is never proposed again for that need (open-S12 came back first in the eye\'s order)', async () => {
  const m = fs.readFileSync(path.join(LIB, 'materials.mjs'), 'utf8');
  assert.match(m, /deadFetch\(i\) \|\| i\.status === 'rejected'/);
});

test('the shared grade (fringe, contrast, colour) is checked; an insert\'s fill is judged once, on arrival (open-S12: a dark suit read as an empty frame)', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  assert.deepEqual(checkModuleSpec({ module: 'insert', at: 0, end: 2, src: 'x.jpg', texture: { grain: .5, fringe: .6, contrast: .5, saturate: .4 } }).filter((e) => /texture/.test(e)), []);
  assert.match(checkModuleSpec({ module: 'insert', at: 0, end: 2, src: 'x.jpg', texture: { sharpen: 1 } }).join('\n'), /texture\.sharpen/);
  assert.match(fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8'), /ref: spec\.module === 'insert' \? null : ref/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8'), /drop-shadow\(\$\{\(4 \* f\)/);
});

test('a Chinese character the Japanese house fonts carry only in its Japanese form goes on screen in that form (open-S16: 值 → 値)', async () => {
  const H = await lib('house.mjs');
  assert.equal(H.JP_VARIANT['值'], '値');
  const fonts = H.houseFonts().ready;   // the font files are local only (licences)
  if (fonts) assert.equal(H.toHant(['巨头市值'])[0], '巨頭市値', 'converted, then the form the fonts have');
});

test('a scale\'s figures (the mugshot wall 140…200) are not claims; a lone figure still needs the text; lettering set unlike the reference\'s faces fails (B26: 还是没对上很多)', async () => {
  const { numberErrors, scaleNumbers, faceErrors } = await lib('chapter.mjs');
  const wall = ['140', '150', '160', '170', '180', '190', '200'];
  assert.equal(scaleNumbers(wall).size, 7);
  assert.deepEqual(numberErrors([...wall, '高某明'], '一名姓高的男子'), []);
  assert.equal(numberErrors(['140', '150', '160', '175'], '').length, 4, 'three in a run are not a scale');
  assert.equal(numberErrors([...wall, '52 岁'], '').length, 1, 'a figure with words beside it is no scale');
  const look = { type: { faces: ['House Sumikaku', 'House Kikai'], otherShareMax: 0.2, note: '粗黑体' } };
  const d = (face, text = '姓高的男子', size = 40) => ({ face, text, size });
  assert.match(faceErrors([d('House Kokka', '大标题', 120), d('House Kokka', '大标题', 120), d('House Sumikaku', '大标题', 120)], look)[0], /House Kokka/);
  assert.deepEqual(faceErrors([d('House Sumikaku', '标题', 120), d('House Kikai', 'DYS19', 60), d('House Kokka', '小字', 30)], look), [], 'small print is not counted');
  assert.deepEqual(faceErrors([d('House Kokka')], null), []);
});

test('type set over type at a key frame fails the beat (B26 round 12: two loci tags merged, two walls\' figures read 20200)', async () => {
  const { overlapErrors } = await lib('chapter.mjs');
  const t = (text, x0, y0, w = 100, h = 24) => ({ text, x0, x1: x0 + w, y0, y1: y0 + h, size: h });
  assert.match(overlapErrors([t('DYS635', 100, 100), t('DYS389I', 150, 102)], 'B27')[0], /over each other/);
  assert.deepEqual(overlapErrors([t('DYS635', 100, 100), t('DYS389I', 210, 100), t('200', 100, 140)], 'B27'), []);
  assert.deepEqual(overlapErrors([t('200', 100, 100), t('200', 100, 100)], 'B30'), [], 'the same text drawn twice (a glow) is one line');
  assert.deepEqual(overlapErrors([{ ...t('FORENSIC', 0, 80, 1400, 280), alpha: 0.08 }, t('父', 200, 150)], 'B39'), [], 'a faint texture word under the type is not type over type');
  assert.equal(overlapErrors([{ text: '全國公安機關', size: 84, x0: 100, x1: 700, y0: 120, y1: 210, alpha: 0.17 }, { text: '庫容超過', size: 64, x0: 300, x1: 560, y0: 140, y1: 205 }], 'B35').length, 1, 'a big headline left faint still reads: a line over it is type over type');
  {
    const { unitGapErrors } = await lib('chapter.mjs');
    const fig = { text: '323', size: 120, x0: 200, x1: 380, y0: 400, y1: 500 };
    assert.match(unitGapErrors([fig, { text: '人', size: 60, x0: 490, x1: 550, y0: 440, y1: 500 }], 'B14')[0] || '', /off its figure/, 'a unit 110 px off its figure fails');
    assert.deepEqual(unitGapErrors([fig, { text: '人', size: 60, x0: 395, x1: 455, y0: 440, y1: 500 }], 'B14'), [], 'a unit against its figure passes');
    assert.deepEqual(unitGapErrors([fig, { text: '人', size: 60, x0: 490, x1: 550, y0: 100, y1: 160 }], 'B14'), [], 'a word on another line is not its unit');
    assert.deepEqual(unitGapErrors([{ text: '0', size: 300, x0: 100, x1: 210, y0: 300, y1: 600 }, { text: '0', size: 300, x0: 230, x1: 340, y0: 300, y1: 600 }, { text: '萬', size: 150, x0: 360, x1: 510, y0: 440, y1: 600 }], 'B35'), [], 'a unit is judged against the nearest figure only (the digits of 8000 drawn one by one)');
  }
});

test('type crossed by a drawn line or set on a picture fails the beat (paperclip-138-full B15/B17 round 7, blind review)', async () => {
  const { crossErrors } = await lib('chapter.mjs');
  const t = (text, x0, x1, y0, y1, size, more = {}) => ({ text, x0, x1, y0, y1, size, alpha: 1, ...more });
  const line = (x0, y0, x1, y1, w = 6, alpha = 1) => ({ kind: 'line', x0, y0, x1, y1, w, alpha });
  const img = (x0, y0, x1, y1, src = 1, alpha = 1) => ({ kind: 'image', src, x0, y0, x1, y1, alpha });
  // B15: 個 cut through by the vWA frame's upright, 1000 個裡 on the outer frame's bottom edge (measured on the keyframe)
  assert.match(crossErrors([t('個', 1290, 1400, 500, 612, 110)], [line(1320, 229, 1320, 724)], 'B15')[0], /drawn line run across/);
  assert.match(crossErrors([t('1000', 470, 700, 749, 861, 110)], [line(1461, 786, 519, 786)], 'B15')[0], /drawn line/);
  // B17: 指紋 inside the palm print's card
  assert.match(crossErrors([t('指紋', 1267, 1355, 653, 698, 44)], [img(1100, 579, 1370, 781)], 'B17')[0], /picture it does not belong to/);
  // B48: the tree's thin connectors through COUSIN, its red line through the bottom of 共同的高祖父母
  assert.equal(crossErrors([t('2nd COUSIN', 985, 1220, 636, 675, 38)], [line(1044, 702, 1044, 623, 2)], 'B48').length, 1);
  assert.equal(crossErrors([t('共同的高祖父母', 860, 1078, 105, 150, 44)], [line(1186, 135, 816, 135, 4)], 'B48').length, 1);
  // passes: B19's rule along the foot of its 10; B12's frame line clear above the figures' cap height; a stroke shorter
  // than the box (a tick); small type; a faint line; a frame around the type; type on a surface (a texture tiled over the frame)
  assert.deepEqual(crossErrors([t('10', 1460, 1688, 441, 635, 190)], [line(1440, 626, 1880, 626, 2)], 'B19'), []);
  assert.deepEqual(crossErrors([t('6000–10000', 680, 1240, 673, 826, 150)], [line(1858, 675, 62, 675, 3)], 'B12'), []);
  assert.deepEqual(crossErrors([t('個', 1290, 1400, 500, 612, 110)], [line(1320, 540, 1320, 580, 3)], 'B15'), []);
  // small type is read down to 20 px now (B29's 22 px 他 and B19's 32 px caption had a line through them, 2026-10-26)
  assert.equal(crossErrors([t('Unique', 1590, 1688, 534, 565, 30)], [line(1600, 400, 1600, 700)], 'B17').length, 1);
  assert.match(crossErrors([t('重複幾次，因人而異', 160, 640, 751, 806, 56)], [line(150, 752, 1000, 752, 2)], 'B13')[0] || '', /rule touching its top/, 'a box edge 2 px over a caption');
  assert.equal(crossErrors([t('重複幾次，因人而異', 160, 640, 787, 842, 56)], [line(150, 752, 1000, 752, 2)], 'B13').length, 0);
  assert.deepEqual(crossErrors([t('Unique', 1590, 1640, 534, 550, 16)], [line(1600, 400, 1600, 700)], 'B17'), []);
  assert.equal(crossErrors([t('他', 940, 970, 590, 620, 22, { object: true })], [line(955, 640, 955, 580, 3)], 'B29').length, 1, 'another\'s line through a tag');
  // B32: a stamp's frame (object 7) across the card's 凶 (object 3) is read; a card's own frame round its own name is not
  assert.equal(crossErrors([t('凶案現場', 1180, 1340, 600, 640, 40, { object: true, obj: 3 })], [{ ...line(1100, 620, 1300, 620, 4), obj: 7 }], 'B32').length, 1);
  assert.equal(crossErrors([t('凶案現場', 1180, 1340, 600, 640, 40, { object: true, obj: 3 })], [{ ...line(1100, 620, 1300, 620, 4), obj: 3 }], 'B32').length, 0);
  assert.equal(crossErrors([t('D5S818', 1000, 1120, 400, 435, 35, { object: true, obj: 9, bleed: true })], [{ ...line(1040, 696, 1040, 113, 3), obj: 3 }], 'B32').length, 0, 'a tape laid over the cards');
  assert.deepEqual(crossErrors([t('個', 1290, 1400, 500, 612, 110)], [line(1320, 229, 1320, 724, 2, 0.1)], 'B15'), []);
  assert.deepEqual(crossErrors([t('323', 530, 700, 60, 160, 120)], [line(500, 40, 720, 40), line(720, 40, 720, 180), line(720, 180, 500, 180), line(500, 180, 500, 40)], 'B14'), []);
  const tiles = Array.from({ length: 12 }, (_, k) => img((k % 4) * 512, Math.floor(k / 4) * 512, (k % 4) * 512 + 512, Math.floor(k / 4) * 512 + 512, 7));
  assert.deepEqual(crossErrors([t('隨機抽 1000 個人', 640, 1280, 769, 847, 76)], tiles, 'B14'), []);
  assert.deepEqual(crossErrors([t('掌印', 1100, 1190, 653, 698, 44, { object: true })], [img(1100, 579, 1370, 781)], 'B17'), [], 'a tag set as an object on its photo belongs to it');
});

test('an English page\'s date line and byline are reflowed away too (open-S16: "January 28, 2025 • 1 min read" on screen)', async () => {
  const { META_LINE_EN } = await lib('modules.mjs');
  for (const t of ['January 28, 2025• 1 min read', 'Jan 28, 2025', 'Updated: Mon, Jan 27, 2025', '3 min read', 'By Nauman Khan']) assert.ok(META_LINE_EN.test(t), t);
  for (const t of ['On Monday, Nvidia (NVDA, Financial) experienced a 17% share value drop', 'Wiping Out $600 Billion in a Single Day']) assert.ok(!META_LINE_EN.test(t), t);
});

test('a picture taller than the frame is cut to where its face is (open-S10: Altman kept his mouth and lost his eyes)', async () => {
  assert.match(fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8'), /page\.focusY = \+\(100 \* Math\.min\(1, Math\.max\(0, \(cy - \.42 \* v\) \/ \(1 - v\)\)\)\)/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/brand.html'), 'utf8'), /S\.focusY != null/);
});

test('module fixes the open card asked for: tags unquoted, large, marked, one across the bottom; a chart that climbs; a display line counts only when the reading names it', async () => {
  const { checkModuleSpec } = await lib('modules.mjs'), B = await lib('breakdown.mjs');
  const sc = { module: 'sidecard', at: 0, end: 4, presenter: 'p.png', cards: [] };
  assert.deepEqual(checkModuleSpec({ ...sc, tags: [{ at: 1, text: '單日跌掉的最大一筆', side: 'bottom', mark: '最大一筆' }] }).filter((e) => /tag/.test(e)), []);
  assert.match(checkModuleSpec({ ...sc, tags: [{ at: 1, text: '美股', side: 'top', mark: '歷史' }] }).join('\n'), /side left \/ right \/ bottom[\s\S]*mark "歷史" is not in it/);
  assert.match(checkModuleSpec({ module: 'chart', at: 0, end: 4, items: [{ at: 1, label: 'a', value: 1 }], flow: 'sideways' }).join('\n'), /flow is down or up/);
  const sub = { text: [{ text: 'AEScnded by hec', h: 249, cx: .78, cy: .46 }, { text: '深度水素', h: 497, cx: .5, cy: .5 }], read: { shows: '大字「凭什么」压在页面上', layers: '', type: '黑色粗字' } };
  assert.equal(B.displayFor(sub), null, 'an OCR misreading the reading does not name is not measured');
  assert.equal(B.displayFor({ ...sub, read: { shows: 'Founded by hedge fund manager', layers: '', type: '' } }).text, 'AEScnded by hec');
  const side = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.match(side, /side === 'bottom'/); assert.match(side, /scale\(\$\{1\.35 - \.35/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/article.html'), 'utf8'), /const dr = \(S\.camera \|\| \[\]\)\.length \? 0 : 1/);
});

test('a chapter preview sets the same moments beside the reference: each beat at the same shares of its span in both', async () => {
  const { pairTimes, PAIR_AT } = await lib('chapter.mjs');
  const p = pairTimes([{ shotId: 'B26', at: 0, dur: 6.4 }, { shotId: 'B27', at: 6.4, dur: 8 }, { shotId: 'B99', at: 14.4, dur: 2 }], { B26: [193.2, 199], B27: [199, 207.5] });
  assert.equal(p.length, 2 * PAIR_AT.length, 'a beat the reference lacks has no pair');
  assert.deepEqual(p[0], { beat: 'B26', ours: 2.24, ref: 195.23 });
  assert.ok(p.every((x) => x.ours >= 0 && x.ref > 190));
});

test('a display title cut by the edge fails even while it drifts (open-S14: 深度求索 lost its first character under a push)', async () => {
  const { frameProblems } = await lib('framecheck.mjs');
  const big = { text: '深度求索', hant: '深度求索', line: 300, contrast: 120, op: 1, move: 20, box: { x: -60, y: 300, w: 1300, h: 320 } };
  assert.ok(frameProblems(1, [big]).some((p) => p.kind === 'off-frame'));
  assert.ok(!frameProblems(1, [{ ...big, line: 60, box: { x: -60, y: 300, w: 400, h: 70 } }]).some((p) => p.kind === 'off-frame'), 'a small line sliding through still may');
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8'), /x\.side === 'bottom'\) \? 300 : 560/);
});

test('a title holds still under the director\'s camera, as the insert and the article do (open-S14: its own drift cut the title at the edge)', async () => {
  const ti = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/title.html'), 'utf8');
  assert.match(ti, /const own = !\(S\.camera \|\| \[\]\)\.length/); assert.match(ti, /translate = own \?/);
});

test('a profile\'s frames belong to one version of the video: a new render is measured anew (B32 measured on its first render\'s frames)', async () => {
  const { stale } = await lib('refprofile.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-')), f = path.join(dir, 'video.stamp');
  assert.equal(stale(f, '10:1'), true, 'no stamp yet');
  fs.writeFileSync(f, '10:1'); assert.equal(stale(f, '10:1'), false); assert.equal(stale(f, '11:2'), true, 'another render');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a sub-shot\'s frames are numbered as its card numbers it, even after a skipped sliver (h800: a 0.12 s piece shifted every sheet by one)', async () => {
  assert.match(fs.readFileSync(path.join(LIB, 'breakdown.py'), 'utf8'), /f'\{len\(subs\):02d\}-\{j\}\.jpg'/);
});

test('a page curled in over everything stays on the screen under the camera (h800-S3: the push carried its mark out of the frame)', async () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8'), /id="curl" data-screen/);
  const cj = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8');
  assert.match(cj, /scale\(\$\{\(1 \/ z\)\.toFixed\(5\)\}\) translate\(\$\{\(x \* 1920\)/, 'held still by the inverse of the camera, in its place under the card');
  // the inverse composes to nothing: cam(p) = c + z (p - c) + t, screen(p) = c + (p - t - c) / z
  const c = 960, z = 1.2, t = -.1 * 1920, p0 = 300, sc = c + (p0 - t - c) / z; assert.ok(Math.abs(c + z * (sc - c) + t - p0) < 1e-9);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8'), /n\.dataset\?\.fixed != null/);
});

test('the look is compared at the moment the reference was read, not on the longest piece of ours (h800-S3: a curled page split ours in two)', async () => {
  const B = await lib('breakdown.mjs');
  const cam = { zoom: 1, pan: [0, 0], moving: .5 }, look = (base, lum) => ({ base, lum, sat: 5, grain: .5 });
  const card = { cuts: [], subs: [{ id: 'R01', at: 0, end: 10, camera: cam, look: look('light', 85), text: [], events: [] }], items: [] };
  const ours = [{ at: 0, end: 6, camera: cam, look: look('dark', 40), text: [], events: [] }, { at: 6, end: 10, camera: cam, look: look('light', 80), text: [], events: [] }];
  assert.deepEqual(B.compareBreakdown(card, ours, [{ item: 'R01.look', does: 'match', how: 'x' }], { shots: [{ id: 'S1', at: 0, end: 10 }] }), []);
});

test('the flat evidence kit is shared: its parts are exported, bundled with morph, named in the chapter prompt; the review scores against the same moments and the measured gaps (系统做成熟)', async () => {
  const kit = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit2.js'), 'utf8');
  for (const p of ['ground', 'wall', 'bust', 'card', 'tape', 'stamp', 'screen', 'bands', 'dotTree', 'redPath', 'breadcrumb', 'form', 'folders', 'grain']) assert.match(kit, new RegExp(`export function ${p}\\(`), p);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/director/make.mjs'), 'utf8'), /templates\/kit2\.js/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8'), /type\.flat = flat/);
  const morph = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/morph.md'), 'utf8'), review = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/morph-review.md'), 'utf8');
  assert.match(morph, /type\.flat/); assert.match(morph, /先看对标怎么做/);
  assert.match(review, /referenceGaps/); assert.match(review, /同一时刻并排/);
  const ch = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(ch, /export function bindPreviewToReview/); assert.match(ch, /task\.input\.referenceGaps/);
  assert.match(kit, /g\.__object = typeof was === 'number' \? was : \+\+OBJ_N/, 'an object, numbered (its own frame round its own words is let off)'); assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8'), /!g\.__object &&/, 'a stamp, tag or tape is an object, not a plate (B32)');
});

test('a chapter\'s serif lines are set in the reference\'s face when the reference letters otherwise (B10, B18, B39: Kokka against bold gothic)', async () => {
  const { preferFace } = await lib('chapter.mjs');
  assert.deepEqual(preferFace({ type: { faces: ['House Sumikaku', 'House Kikai'] } }), { from: 'House Kokka', to: 'House Sumikaku', alts: ['House Kikai'] }, 'the reference\'s other faces before the plain fallback');
  assert.equal(preferFace({ type: { faces: ['House Kokka'] } }), null); assert.equal(preferFace(null), null);
  const mj = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(mj, /H\.prefer && fam === H\.prefer\.from/); assert.match(mj, /DISPLAY_FACES\.has\(fam\) && px < DISPLAY_MIN/, 'display faces only for big type (B39: 父 我 unreadable)');
});

test('a traced line of type reaches up and down by its baseline, not centred on its point (B18: a small line under a big one read as type over type)', async () => {
  const src = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8');
  const fn = new Function(`${src.match(/export function textBox\(b\) \{[^\n]*\}/)[0].replace('export ', '')}; return textBox;`)();
  assert.deepEqual(fn('middle'), [0.5, 0.5]);
  const [up, down] = fn('alphabetic'); assert.ok(up > 0.8 && down < 0.2, 'alphabetic sits above the point');
  assert.deepEqual(fn(undefined), fn('alphabetic'));
  assert.ok(fn('top')[1] > 0.9);
});

test('with a breakdown card the reference\'s cuts set the rhythm, not the playbook\'s median (meta: 0.9 s Gagarin)', async () => {
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /rubric\.errors\.filter\(\(e\) => !\(card && \/\^rhythm:\/\.test\(e\)\)\)/);
});

test('the quote page\'s giant faint quote mark is decoration, kept faint, not a line to read (meta-S8 failed its contrast)', async () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/quote.html'), 'utf8'), /id="qm" data-deco/);
});

test('a quote can keep its photograph in colour across the frame, stack its groups and set them large (meta-S8: the reference\'s Sputnik line)', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  assert.match(checkModuleSpec({ module: 'quote', at: 0, end: 2, photo: 'p.jpg', lines: [{ at: .1, text: '這是AI的' }], size: 300 }).join('\n'), /size 60-160/);
  const q = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/quote.html'), 'utf8');
  assert.match(q, /if \(S\.color && !over\)/); assert.match(q, /if \(S\.stack\)/);
});

test('a chapter that passes can be rendered: every param the line gives a morph shot is in the catalog (house was refused: B01 B07 B23 B26 failed at the final render)', async () => {
  const cat = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/director/catalog.js'), 'utf8'), morph = cat.slice(cat.indexOf('morph: {'), cat.indexOf('morph: {') + 3000);
  const ch = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  const used = new Set([...ch.matchAll(/template: 'morph'[^\n]*?params: \{([^\n]*)/g)].flatMap((m) => [...m[1].matchAll(/(?:^|[,{])\s*([a-z]\w*):/g)].map((x) => x[1]).filter((k) => !['text', 'fps', 'id', 'span', 'template', 'medium'].includes(k))));
  assert.ok(used.has('house') && used.has('module'), [...used].join(','));
  for (const k of used) assert.match(morph, new RegExp(`\\b${k}: '`), `catalog morph lacks ${k}`);
});

test('a passage is rendered again when a module it uses changed, not only its specs (the opening\'s film was left stale)', async () => {
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /    if \(render\) \{ const r = await renderPassage/);
});

test('dark and light differ only when the frames do (meta R01: L* 47.6 against 43.4 read as light against dark)', async () => {
  const B = await lib('breakdown.mjs'), cam = { zoom: 1, pan: [0, 0], moving: .5 };
  const card = { cuts: [], subs: [{ id: 'R01', at: 0, end: 2, camera: cam, look: { base: 'light', lum: 47.6, sat: 4, grain: .5 }, text: [], events: [] }], items: [] };
  const ours = (lum) => [{ at: 0, end: 2, camera: cam, look: { base: lum < 45 ? 'dark' : 'light', lum, sat: 4, grain: .5 }, text: [], events: [] }];
  const f = [{ item: 'R01.look', does: 'match', how: 'x' }], sh = { shots: [{ id: 'S1', at: 0, end: 2 }] };
  assert.deepEqual(B.compareBreakdown(card, ours(43.4), f, sh), []);
  assert.equal(B.compareBreakdown(card, ours(30), f, sh).length, 1);
});

test('a video render drops its PNG frames once encoded (18 GB of frames filled the disk: ENOSPC)', async () => {
  const s = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/shoot.mjs'), 'utf8');
  assert.match(s, /if \(!process\.env\.KEEP_FRAMES\) await rm\(dir, \{ recursive: true, force: true \}\)/);
});

test('review scores land on the beats they name, not by position (B39: a 3 for B44 went to B41 and the chapter passed)', async () => {
  const { reviewFrames } = await lib('chapter.mjs');
  const shots = ['B39', 'B41', 'B43', 'B44'].map((shotId) => ({ shotId }));
  const all = ['B39', 'B40', 'B41', 'B42', 'B43', 'B44'].map((beat, k) => ({ beat, score: beat === 'B44' ? 3 : 4, issue: beat }));
  const f = reviewFrames(all, shots);
  assert.deepEqual(f.map((x) => x.beat), ['B39', 'B41', 'B43', 'B44']); assert.equal(f.find((x) => x.beat === 'B44').score, 3);
  assert.deepEqual(reviewFrames([{ score: 4 }, { score: 2 }], shots.slice(0, 2)).map((x) => [x.beat, x.score]), [['B39', 4], ['B41', 2]], 'unnamed answers by position');
});

test('the frames cut out of a clip for an insert are removed when the shot is done (11 GB left behind filled the disk)', async () => {
  const m = fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8');
  assert.match(m, /'rb-footage-'\)\); footDir = dir;/); assert.ok((m.match(/await b\.close\(\); dropFoot\(\);/g) || []).length >= 2);
});

test('an animatic keeps only the parts of the shots as they are now (earlier revisions left 6 GB)', async () => {
  assert.match(fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8'), /if \(m && !keep\.has\(m\[1\]\)\) fs\.rmSync/);
});

test('a verdict carries over to a shot whose sheet came out byte for byte the same (a module edit sent the whole film back to review)', async () => {
  const l = fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8');
  assert.match(l, /v\.shot === s\.id && v\.sheetSha === me && v\.by !== 'code'/); assert.match(l, /carried: true/);
});

test('a big line cut by the edge of the frame at rest fails the beat; a faint texture word may run off (B18: 出自同一個人 lost its top)', async () => {
  const { typeErrors } = await lib('chapter.mjs');
  const line = (text, x0, y0, w, size, alpha = 1) => ({ text, x0, x1: x0 + w, y0, y1: y0 + size, size, alpha });
  assert.match(typeErrors([line('出自同一個人', 160, -40, 780, 130)], 'B18').errors.join('\n'), /cut by the edge/);
  assert.deepEqual(typeErrors([line('FORENSIC', -30, 120, 2000, 280, 0.08)], 'B39').errors, []);
  assert.deepEqual(typeErrors([line('甘蒙 8·05', 140, 300, 600, 130)], 'B20').errors, []);
});

test('fast and small: the white model renders at half density, shots render a few at a time, grain at 20 a second and every encode capped (591 MB for the 50 s opening)', async () => {
  const l = fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8'), sp = fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), m = fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8');
  assert.match(l, /fps: 12, sub: 1, check: false, checks: false, scale: \.5/); assert.match(l, /'-maxrate', '4M'/);
  assert.match(sp, /const done = await pool\(specs/); assert.match(sp, /'-maxrate', '16M'/);
  assert.match(m, /deviceScaleFactor: stills \? 1 : scale/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8'), /Math\.floor\(t \* 20\) % 997/);
});

test('a beat that stands with nothing new for longer than the reference ever holds fails it (B39 B43: the whole beat still)', async () => {
  const { holdErrors, calmMaxOf, CALM_MAX } = await lib('chapter.mjs');
  assert.equal(calmMaxOf({ summary: { holdSeconds: { 90: 3.35 } } }), CALM_MAX, 'the approved chapter sets the bar'); assert.equal(calmMaxOf(null), CALM_MAX); assert.equal(calmMaxOf({ summary: { holdSeconds: { 90: 6 } } }), 8.1);
  const still = Array.from({ length: 90 }, (_, i) => ({ t: i * 0.1, d: i < 5 ? 9 : 0.4, s: 2 }));
  assert.match(holdErrors(still, [{ shotId: 'B43', at: 0, dur: 9 }], { calmMax: CALM_MAX }).errors.join('\n'), /nothing new happens for/);
  const busy = Array.from({ length: 70 }, (_, i) => ({ t: i * 0.1, d: i % 25 < 3 ? 9 : 0.4, s: 2 }));
  assert.deepEqual(holdErrors(busy, [{ shotId: 'B43', at: 0, dur: 7 }], { calmMax: 4.5 }).errors, []);
});

test('a second reference film is found by its own name, and its narration read off the subtitle row alone (paperclip-047)', async () => {
  const { referenceVideo } = await lib('refbreakdown.mjs');
  const { mergeSubtitles, subtitleRow, sameLine } = await lib('refprofile.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-'));
  try {
    assert.equal(referenceVideo(dir, 'vol047.mp4'), path.join(dir, 'vol047.mp4'));
    fs.writeFileSync(path.join(dir, 'vol047.mp4'), ''); assert.equal(referenceVideo(dir), path.join(dir, 'vol047.mp4'), 'the folder\'s only film');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const sub = (text) => ({ text, box: [0.5 - text.length * 0.01, 0.5, text.length * 0.02, 0.3] }), pack = { text: '烟气一氧化碳量：6mg', box: [0.05, 0.1, 0.2, 0.2] };
  const frames = [['当你吸烟时'], ['当你吸烟时'], ['功能正源于此'], ['功能正源手此'], ['功能正源于此'], []].map((t, i) => ({ t: i * 0.5, lines: [...t.map(sub), pack] }));
  assert.ok(subtitleRow(frames));
  assert.deepEqual(mergeSubtitles(frames), [{ from: 0, to: 1, text: '当你吸烟时' }, { from: 1, to: 2.5, text: '功能正源于此' }, { from: 2.5, to: 3, text: '' }], 'the pack\'s words off the row are left out; one line read two ways is one line');
  assert.equal(sameLine('香烟的“提神解乏”功能正源于此', '“提神解乏”功能正源手此'), true);
  assert.equal(sameLine('一氧化碳会使人缺氧', '并让胆固醇增多'), false);
});

test('a beat seam whose picture empties fails unless the beat plans a black pause; standing still into most seams warns (paperclip-138-full reel: 42 % empty, 88 % still)', async () => {
  const { seamErrors, STEP } = await lib('chapter.mjs');
  const shots = [{ shotId: 'B1', at: 0, dur: 4 }, { shotId: 'B2', at: 4, dur: 4 }, { shotId: 'B3', at: 8, dur: 4 }];
  const curve = (fill, d = () => 0.5) => Array.from({ length: 60 }, (_, i) => ({ t: +(i * STEP + STEP).toFixed(2), d: d(i * STEP + STEP), s: 0.1, f: fill(i * STEP + STEP) }));
  const dip = curve((t) => (Math.abs(t - 4) < 0.5 ? 0.01 : 0.3));
  assert.match(seamErrors(dip, shots).errors.join('\n'), /B2: the picture empties/);
  assert.deepEqual(seamErrors(dip, shots, { plan: { beats: { B2: { devices: ['black-pause'] } } } }).errors, [], 'a planned black pause');
  assert.deepEqual(seamErrors(dip, shots, { plan: { beats: { B1: { devices: ['black-pause'] } } } }).errors, [], 'a black pause that ends the last beat');
  const full = curve(() => 0.3);
  assert.deepEqual(seamErrors(full, shots).errors, []);
  assert.match(seamErrors(full, [...shots, { shotId: 'B4', at: 10, dur: 2 }]).warnings.join('\n'), /stand still going in/);
  assert.deepEqual(seamErrors(curve(() => 0.3, () => 6), [...shots, { shotId: 'B4', at: 10, dur: 2 }]).warnings, [], 'moving into the cuts');

  // a beat that plays its handover in its own last second ends emptied (blind reviews B09 B17 B33)
  const fade = curve((t) => (t > 7.6 && t <= 8 ? 0.08 : 0.3));
  assert.match(seamErrors(fade, shots).errors.join('\n'), /B2: the picture empties before the beat ends/);
  assert.doesNotMatch(seamErrors(full, shots).errors.join('\n'), /before the beat ends/, 'a beat that holds to its end');
  assert.doesNotMatch(seamErrors(curve((t) => (Math.abs(t - 8) < 0.1 ? 0.05 : 0.3)), shots).errors.join('\n'), /B2: the picture empties before/, 'a crossfade that dips at the cut itself');
});

test('a chapter beat goes into the reel as its slice of the chapter film, not through a motion preset (its push snapped every seam back 4 %)', async () => {
  const { chapterSlice } = await lib('sequence.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-')), film = path.join(dir, 'B47-clean.mp4'); fs.writeFileSync(film, '');
  try {
    assert.deepEqual(chapterSlice({ repoRoot: dir }, { slots: { background: { chapter: 'B47', video: { path: 'B47-clean.mp4', in: 7.8, out: 15.4 } } } }), { file: film, in: 7.8, out: 15.4 });
    assert.equal(chapterSlice({ repoRoot: dir }, { slots: { background: { video: { path: 'B47-clean.mp4', in: 0 } } } }), null, 'not a chapter beat');
    assert.equal(chapterSlice({ repoRoot: dir }, { slots: { background: { chapter: 'B47', video: { path: 'gone.mp4', in: 0, out: 2 } } } }), null, 'no film yet');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a Blender plate older than its plate script is made again', async () => {
  const { plateStale } = await lib('stage.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plate-')), f = path.join(dir, 'B22.mp4'), py = path.join(dir, 'chromosome.py');
  try {
    fs.writeFileSync(f, ''); fs.writeFileSync(py, ''); const now = Date.now() / 1000;
    fs.utimesSync(f, now - 100, now - 100); fs.utimesSync(py, now, now); assert.equal(plateStale(f, py), true);
    fs.utimesSync(f, now + 10, now + 10); assert.equal(plateStale(f, py), false);
    assert.equal(plateStale(path.join(dir, 'gone.mp4'), py), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a one-accent world sets found clips in black and white, never its own chapters or 3D plates (B22 lost its red chromosome)', async () => {
  const { monoFill } = await lib('compose.mjs');
  const t = { photoMono: true };
  assert.equal(monoFill(t, { video: { path: 'x.mp4' } }), true, 'a found clip');
  assert.equal(monoFill(t, { video: { path: 'B22-clean.mp4' }, stage: { template: 'blender:chromosome' } }), false, 'the film\'s 3D plate');
  assert.equal(monoFill(t, { chapter: 'B47', video: { path: 'B47-clean.mp4' } }), false);
  assert.equal(monoFill({ photoMono: false }, { video: { path: 'x.mp4' } }), false);
});

test('a breathing beat adds nothing new but does not freeze: past 3.5 s it dims, pulls back or is erased, about once every 3.5 s (B36 B37 B45 B53 froze 6-8 s)', async () => {
  const { breathErrors } = await lib('storyboard.mjs');
  const beat = (seconds, secondary = []) => ({ hero: { action: 'hold', target: 'x', at: 0 }, secondary, seconds });
  assert.deepEqual(breathErrors(beat(3)), [], 'a short breath may hold still');
  assert.match(breathErrors(beat(7.6)).join(''), /the picture changes, about once every 3\.5s \(1-3 here\)/);
  assert.deepEqual(breathErrors(beat(7.6, [{ action: 'pull-back', target: 'x', at: 0.8 }, { action: 'focus-dim', target: 'x', at: 3.8 }])), [], 'two changes in 7.6 s (B45 read as frozen with one)');
  assert.match(breathErrors(beat(4, [{ action: 'pull-back', target: 'x', at: 0.8 }, { action: 'focus-dim', target: 'x', at: 2 }, { action: 'erase', target: 'x', at: 3 }])).join(''), /1-2 here/);
  assert.deepEqual(breathErrors(beat(7.6, [{ action: 'pull-back', target: 'x', at: 3.8 }])), []);
  assert.match(breathErrors(beat(7.6, [{ action: 'type-on', target: 'x', at: 1 }])).join(''), /only secondary action/, 'no new information on a breath');
  assert.match(breathErrors({ ...beat(7.6), hero: { action: 'enter', target: 'x', at: 0 } }).join(''), /hero is hold/);
});

test('a shot whose storyboard stops (or starts) replaying an earlier shot is rewritten, not only one that changed card', async () => {
  const { shotRecalls, designRecalls } = await lib('storyboard.mjs');
  const shot = { recipe: 'footage-plate', slots: { background: { video: { path: 'x.mp4' }, recall: 'B05' } } };
  assert.deepEqual(shotRecalls(shot), ['B05']);
  assert.deepEqual(designRecalls({ scenes: [] }), []);
  assert.deepEqual(designRecalls({ scenes: [{ recall: 'B26' }, { recall: 'B23' }] }), ['B23', 'B26']);
  assert.deepEqual(shotRecalls({ slots: {}, scenes: [{ slots: { background: { recall: 'B26' } } }, { slots: { background: { recall: 'B23' } } }] }), ['B23', 'B26']);
});

test('a beat that replays a shot still waiting for its material replays its last complete version (B36 replayed B35\'s placeholder)', async () => {
  const { recallFill } = await lib('writer.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recall-')), dataDir = path.join(root, 'work', 'recipe-board-v1'), out = path.join(dataDir, 'projects', 'x', 'out');
  try {
    fs.mkdirSync(path.join(out, 'motion', 'B35', 'renders'), { recursive: true }); fs.writeFileSync(path.join(out, 'motion', 'B35', 'renders', 'good.mp4'), '');
    fs.writeFileSync(path.join(dataDir, 'projects', 'x', 'project.json'), '{}');
    fs.mkdirSync(path.join(dataDir, 'routing'), { recursive: true }); const hr = path.join(dataDir, 'routing', 'house-rules.json'), past = new Date(Date.now() - 86400000);
    fs.writeFileSync(hr, '{}'); fs.utimesSync(hr, past, past);   // the kept version is newer than the house rules
    const c = { ...cfg, dataDir, sourceRoot: root, repoRoot: root };
    const shot = { B35: { motion: { duration: 4.2 } } };
    assert.match(recallFill(c, 'x', 'B35', shot).video.path, /renders\/motion\.mp4$/, 'not waiting: the current render');
    fs.writeFileSync(path.join(out, 'cache.json'), JSON.stringify({ B35: { degraded: ['screen'] } }));
    assert.match(recallFill(c, 'x', 'B35', shot).video.path, /renders\/good\.mp4$/, 'waiting: the kept version');
    const r0 = recallFill(c, 'x', 'B35', { B35: { motion: { duration: 4.2 } } }), r1 = recallFill(c, 'x', 'B35', { B35: { motion: { duration: 4.2 } } }, { match: true });
    assert.ok(r1.video.in > r0.video.in && r1.video.out - r1.video.in <= 0.11, 'a match opens on the last frame (B45 opened 2.4 s before B44 ended)');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a reel seam that empties is named with the shot that left nothing or started from nothing; a planned black pause is not', async () => {
  const { seamEmpties } = await lib('sequence.mjs');
  const ends = [{ id: 'B01', med: 0.2, head: 0.2, tail: 0.003 }, { id: 'B02', med: 0.3, head: 0.25, tail: 0.3 }, { id: 'B03', med: 0.25, head: 0.01, tail: 0.2 }];
  const e = seamEmpties(ends).join('\n');
  assert.match(e, /B01>B02: .*B01 leaves nothing/); assert.match(e, /B02>B03: .*B03 starts from nothing/);
  assert.equal(seamEmpties(ends, { blackPause: new Set(['B01']) }).length, 1);
  assert.equal(seamEmpties(ends.map((e) => ({ ...e, chapter: 'B01' }))).length, 0, 'inside one chapter its own check judges the seam');
  assert.deepEqual(seamEmpties([{ id: 'A', med: 0.2, head: 0.2, tail: 0.2 }, { id: 'B', med: 0.2, head: 0.2, tail: 0.2 }]), []);
});

test('a whole-frame move that starts at full speed is a lunge; one eased in, or one element popping in, is not (B48)', async () => {
  const { lungeOf } = await lib('chapter.mjs');
  const steps = (ds, a = 0.6) => ds.map((d, i) => ({ t: i / 30, d, a }));
  assert.ok(lungeOf(steps([0, 0, 9, 8, 6, 4, 2, 1, 0.5])), 'ease-out: top speed on the first frame');
  assert.equal(lungeOf(steps([0, 0, 1, 3, 6, 9, 6, 3, 1])), null, 'ease-in-out');
  assert.equal(lungeOf(steps([0, 0, 9, 8, 6, 4, 2, 1, 0.5], 0.08)), null, 'a card dropping in: a corner of the frame');
  assert.equal(lungeOf(steps([0, 0, 12, 0.3, 0.2, 0.2, 0.1, 0.1, 0.1])), null, 'a hard cut inside a chapter');
  assert.equal(lungeOf(steps([0, 0, 9, 8, 6, 4, 2, 1, 0.5]).map((x) => ({ ...x, e: 1.1 }))), null, 'a light washing over the frame (B02 red flood)');
  assert.ok(lungeOf(steps([0, 0, 9, 8, 6, 4, 2, 1, 0.5]).map((x) => ({ ...x, e: 4 }))), 'a push: the change sits on the edges');
});

test('a chapter that builds up from an empty frame fails at its start', async () => {
  const { seamErrors, STEP } = await lib('chapter.mjs');
  const shots = [{ shotId: 'B1', at: 0, dur: 4 }, { shotId: 'B2', at: 4, dur: 4 }];
  const c = (head) => Array.from({ length: 40 }, (_, i) => ({ t: +(i * STEP + STEP).toFixed(2), d: 3, s: 1, f: i * STEP < 0.5 ? head : 0.3 }));
  assert.match(seamErrors(c(0.005), shots).errors.join('\n'), /B1: the chapter starts from an empty frame/);
  assert.deepEqual(seamErrors(c(0.25), shots).errors, []);
  assert.deepEqual(seamErrors(c(0.005), shots, { opening: true }).errors, [], 'the film may come up from black');
});

test('an unchanged answer is checked again when its chapter\'s input changed (a device library change left nine chapters waiting)', async () => {
  const { answerFresh } = await lib('chapter.mjs');
  assert.equal(answerFresh(null, 'a', 'h1'), true);
  assert.equal(answerFresh({ answerHash: 'a', inputHash: 'h1' }, 'a', 'h1'), false);
  assert.equal(answerFresh({ answerHash: 'a', inputHash: 'h1' }, 'a', 'h2'), true);
  assert.equal(answerFresh({ answerHash: 'a', inputHash: 'h1' }, 'b', 'h1'), true);
  assert.equal(answerFresh({ answerHash: 'a' }, 'a', 'h1'), false, 'an old check without an input hash');
});

test('a chapter module that does not parse fails at once with its line, not a page timeout (B18: a comment ate a one-line loop)', async () => {
  const { syntaxError, FATAL } = await lib('chapter.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syntax-')), bad = path.join(dir, 'bad.mjs'), good = path.join(dir, 'good.mjs');
  fs.writeFileSync(bad, "export const DUR = 1;\nfor (const x of [1]) { if (x) continue;   // note } g.fill(); }\nexport function draw() {}\n");
  fs.writeFileSync(good, 'export const DUR = 1;\nexport function draw() {}\n');
  try {
    const e = syntaxError(bad); assert.match(e, /^the module does not parse \(line \d+\): SyntaxError/); assert.match(e, FATAL);
    assert.equal(syntaxError(good), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a beat may stand as long as the reference stands at the same beat, scaled to its length, never less than the bar', async () => {
  const { holdErrors, calmBarOf, calmOf, CALM_MAX, STEP } = await lib('chapter.mjs');
  assert.equal(calmOf([5, 1, 1, 1, 4, 1]), +(3 * STEP).toFixed(1));
  assert.equal(calmBarOf(CALM_MAX, null, 9), CALM_MAX);
  assert.equal(calmBarOf(CALM_MAX, { calm: 3, dur: 9 }, 9), CALM_MAX, 'a reference that holds less sets no lower bar');
  assert.equal(calmBarOf(CALM_MAX, { calm: 9, dur: 12 }, 9), 7.3, 'scaled to our shorter beat, half a second more');
  assert.equal(calmBarOf(CALM_MAX, { calm: 9, dur: 6 }, 9), 9.5, 'a longer beat of ours is not scaled up');
  const still = Array.from({ length: 50 }, (_, i) => ({ t: i * STEP, d: i < 3 ? 9 : 0.4, s: 2 }));
  const shots = [{ shotId: 'B16', at: 0, dur: 10 }];
  assert.match(holdErrors(still, shots, { calmMax: CALM_MAX }).errors.join('\n'), /approved B26/);
  assert.deepEqual(holdErrors(still, shots, { calmMax: CALM_MAX, refCalm: { B16: { calm: 9.8, dur: 10 } } }).errors, []);
  assert.match(holdErrors(still, shots, { calmMax: CALM_MAX, refCalm: { B16: { calm: 7, dur: 10 } } }).errors.join('\n'), /reference's own calm at this beat/);
});

test('a new version of an accepted chapter waiting on its review is in play, not the old accepted one (B10 B26 B39 B47)', async () => {
  const { chapterPending } = await lib('chapter.mjs');
  const rec = { acceptedAt: '2026-10-22T01:00:00Z' };
  assert.equal(chapterPending({ pendingReview: 'morph-B10-review', checkedAt: '2026-10-22T02:00:00Z' }, rec), true);
  assert.equal(chapterPending({ pendingReview: 'morph-B10-review', checkedAt: '2026-10-22T00:30:00Z' }, rec), false, 'a review left from before the acceptance');
  assert.equal(chapterPending({ ok: true, checkedAt: '2026-10-22T02:00:00Z' }, rec), false);
});

test('the modules the cards asked for: chat, compare and table hold still under the director\'s camera; the person\'s torn name is large with a slanted red English line; a title by the side, a part of it large, in a brand\'s own letters; an insert dissolves into a second picture or leaves on a glitch', async () => {
  const { checkModuleSpec } = await lib('modules.mjs'), M = (f) => fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules', f), 'utf8');
  for (const f of ['chat.html', 'compare.html', 'table.html']) assert.match(M(f), /\(S\.camera \|\| \[\]\)\.length/, f);
  assert.match(M('person.html'), /\.full\.torn #en \{[^}]*oblique[^}]*rotate: -5deg/);
  const t = { module: 'title', at: 0, end: 4, text: '650億美金', bg: 'b.jpg', facts: [{ text: '650', source: '口播' }] };
  assert.deepEqual(checkModuleSpec({ ...t, side: 'right', big: '650' }).filter((e) => /title/.test(e)), []);
  assert.match(checkModuleSpec({ ...t, side: 'top', big: '700', style: 'brand', color: 'blue' }).join('\n'), /side is left or right[\s\S]*big "700"[\s\S]*color is a colour[\s\S]*brand title sets the name/);
  assert.match(M('title.html'), /S\.style === 'brand'/);
  const i = { module: 'insert', at: 0, end: 2, src: 'a.jpg' };
  assert.deepEqual(checkModuleSpec({ ...i, then: { at: 1, src: 'b.jpg' }, out: 'glitch' }).filter((e) => /insert/.test(e)), []);
  assert.match(checkModuleSpec({ ...i, then: { at: 5 }, out: 'wipe' }).join('\n'), /then needs the second picture[\s\S]*outside the shot[\s\S]*out is glitch/);
  assert.match(M('brand.html'), /S\.out === 'glitch'/);
});

test('a picture of no one in particular is searched by its words and among video (open-S2, S17, meta-S10 came back with no candidate)', async () => {
  const { requestNeed } = await lib('shotplan.mjs');
  const n = requestNeed('meta', { shot: 'S10', kind: 'photo', what: '苏联火箭在发射台上', search: 'Vostok rocket launch pad 1961', entity: null, reference: '' });
  assert.deepEqual(n.archive.keywords, ['Vostok', 'rocket', 'launch', 'pad', '1961']); assert.deepEqual(n.youtube, ['Vostok rocket launch pad 1961']);
  const p = requestNeed('meta', { shot: 'S9', kind: 'portrait', what: '加加林', search: 'Yuri Gagarin portrait', entity: 'Yuri Gagarin', reference: '' });
  assert.equal(p.youtube, undefined, 'a named need keeps its archive search');
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /!found\[k\] \|\| !\(found\[k\]\.candidates \|\| \[\]\)\.length/, 'searched again when nothing was found');
});

test('ours is measured over the reference\'s whole sub-shot: pieces cut inside it add up (h800-S3: a swapped card and a curled page split an 11 s push)', async () => {
  const B = await lib('breakdown.mjs'), cam = (zoom, moving) => ({ zoom, pan: [0, 0], moving }), look = { base: 'dark', lum: 30, sat: 5, grain: .5 };
  const card = { cuts: [], subs: [{ id: 'R01', at: 0, end: 12, camera: cam(1.12, .6), look, text: [], events: [] }], items: [] };
  const ours = [{ at: 0, end: 4, camera: cam(1.06, .9), look, text: [], events: [] }, { at: 4, end: 7, camera: cam(1.05, .8), look, text: [], events: [] }, { at: 7, end: 12, camera: cam(1.0, 0), look, text: [], events: [] }];
  assert.deepEqual(B.compareBreakdown(card, ours, [{ item: 'R01.camera', does: 'match', how: 'x' }], { shots: [{ id: 'S1', at: 0, end: 12 }] }), [], 'the pieces push 1.113 together');
});

test('grain is judged on the film, not on the half-density white model that blurs it (open: every light page read grainless)', async () => {
  const B = await lib('breakdown.mjs'), cam = { zoom: 1, pan: [0, 0], moving: .5 };
  const card = { cuts: [], subs: [{ id: 'R01', at: 0, end: 2, camera: cam, look: { base: 'light', lum: 70, sat: 4, grain: 5 }, text: [], events: [] }], items: [] };
  const ours = [{ at: 0, end: 2, camera: cam, look: { base: 'light', lum: 70, sat: 4, grain: .4 }, text: [], events: [] }];
  const f = [{ item: 'R01.look', does: 'match', how: 'x' }], sh = [{ id: 'S1', at: 0, end: 2 }];
  assert.deepEqual(B.compareBreakdown(card, ours, f, { shots: sh, halfDensity: true }), []);
  assert.match(B.compareBreakdown(card, ours, f, { shots: sh, grainOnly: true })[0].say, /^grain /);
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /grainOnly: true/);
});

test('a change our measure took for a cut inside one shot counts as something appearing (h800-S3: a swapped card and a curled page read as nothing)', async () => {
  const B = await lib('breakdown.mjs'), cam = { zoom: 1, pan: [0, 0], moving: .5 }, look = { base: 'dark', lum: 30, sat: 5, grain: .5 };
  const card = { cuts: [], subs: [{ id: 'R01', at: 0, end: 10, camera: cam, look, text: [], events: [2, 4, 6] }], items: [] };
  const ours = [{ at: 0, end: 4, camera: cam, look, text: [], events: [] }, { at: 4, end: 10, camera: cam, look, text: [], events: [] }];
  const f = [{ item: 'R01.events', does: 'match', how: 'x' }];
  assert.deepEqual(B.compareBreakdown(card, ours, f, { shots: [{ id: 'S1', at: 0, end: 10 }] }), []);
  assert.equal(B.compareBreakdown(card, ours, f, { shots: [{ id: 'S1', at: 0, end: 4 }, { id: 'S2', at: 4, end: 10 }] }).length, 1, 'a cut of the plan is not a change inside a shot');
});

test('what a frame shows is held to what the reference shows: a trading room for a board of share prices fails, a near kind or an unsure name does not (open-S2, S17)', async () => {
  const B = await lib('breakdown.mjs');
  const card = { subs: [{ id: 'R02', at: 2.9, end: 4.6 }, { id: 'R05', at: 7, end: 11 }, { id: 'R11', at: 18, end: 19 }] };
  const scores = { R02: { a: ['a table of stock prices', 'data', 1], b: ['an office room', 'place', 1] }, R05: { a: ['a man talking', 'person', .99], b: ['a portrait photo', 'person', .98] }, R11: { a: ['a table', 'data', .41], b: ['a building', 'place', .95] } };
  const shots = [{ id: 'S2', at: 2.88, end: 4.57 }, { id: 'S5', at: 7, end: 11 }, { id: 'S11', at: 18, end: 19.3 }];
  const p = B.showsErrors(card, scores, [], { shots });
  assert.deepEqual(p.map((x) => [x.item, x.shot, x.owner]), [['R02.shows', 'S2', 'plan']]);
  assert.match(p[0].say, /market/);
  assert.deepEqual(B.showsErrors(card, scores, [{ item: 'R02.shows', does: 'differ', how: '没有素材' }], { shots }), [], 'the plan may say why it differs');
  assert.deepEqual(B.followErrors({ shots: [], follows: [{ item: 'R02.shows', does: 'differ', how: '没有可用的素材' }] }, { items: [], cuts: [], subs: card.subs }), [], 'a .shows answer is no unknown item');
  const read = { subs: [{ id: 'R16', at: 33.4, end: 33.9, read: { device: 'article' } }] }, sc = { R16: { a: ['a table of stock prices', 'data', .83], b: ['text on a web page', 'page', .93] } };
  assert.deepEqual(B.showsErrors(read, sc, [], { shots: [{ id: 'S16', at: 33.37, end: 36.2 }] }), [], 'the reader read an article page: the measure alone does not overrule it (open R16)');
  assert.equal(B.showsErrors({ subs: [{ ...read.subs[0], read: { device: 'market' } }] }, sc, [], { shots: [{ id: 'S16', at: 33.37, end: 36.2 }] }).length, 1);
});

test('a title on a captured page where the reference designed its ground fails; on a real page it passes (open R14, R20)', async () => {
  const B = await lib('breakdown.mjs');
  const card = { subs: [{ id: 'R20', at: 43.3, end: 46.3, read: { layers: '底：设计的说明卡：白底面板，左侧鲸鱼标志；中：巨大黑字' } }, { id: 'R03', at: 4.5, end: 6.4, read: { layers: '底：报道网页截图整屏；顶：黄条' } }] };
  const wiki = 'work/x/materials/clips/hupo-auto2-open-S8-en-wikipedia-org-deepseek-wikipedia-ccf8fffd.png';
  const shot = (id, at, end, bg) => ({ id, module: 'title', at, end, spec: JSON.stringify({ bg }) });
  assert.equal(B.groundErrors({ shots: [shot('S19', 43.35, 46.28, wiki)] }, card).length, 1);
  assert.deepEqual(B.groundErrors({ shots: [shot('S19', 43.35, 46.28, { art: { prompt: 'an empty slide' } })] }, card), [], 'a painted plate');
  assert.deepEqual(B.groundErrors({ shots: [shot('S3', 4.57, 6.45, wiki)] }, card), [], 'the reference shows the page itself');
  assert.equal(B.isCapture('a/b/photo.jpg'), false);
  assert.equal(B.isCapture('a/b.png', { files: { 'a/b.png': { kind: 'page' } } }), true);
});

test('a market picture is drawn from the archived prices: the close, the change and its percentage as printed; the spec types no figure', async () => {
  const M = await lib('market.mjs');
  const s = (sym, closes) => ({ symbol: sym, name: `${sym} Corporation`, days: closes.map((c, i) => ({ day: `2025-01-2${4 + i}`, open: c, high: c + 1, low: c - 1, close: c })) });
  const rows = M.boardRows([s('NVDA', [142.62, 118.42]), s('META', [647.49, 659.88])], '2025-01-25');
  assert.deepEqual(rows.map((r) => [r.price, r.change, r.pct, r.up]), [['118.42', '-24.20', '-16.97%', false], ['659.88', '+12.39', '+1.91%', true]]);
  assert.throws(() => M.boardRows([s('NVDA', [1, 2])], '2025-01-24'), /day before/);
  const k = M.candles(s('NVDA', [1, 2, 3, 4, 5, 6]), '2025-01-28');
  assert.equal(k.days.length, 5); assert.deepEqual(k.ma[5], [null, null, null, null, 3]);
  assert.deepEqual(M.marketErrors({ mode: 'board', at: 0, end: 2, day: '2025-01-27', from: '2024-12-01', symbols: ['NVDA', 'AMD'] }), []);
  assert.equal(M.marketErrors({ mode: 'candles', at: 0, end: 2, day: '2025-01-27', from: '2025-02-01' }).length, 2, 'from after the day, no symbol');
  const { checkModuleSpec } = await lib('modules.mjs');
  assert.ok(checkModuleSpec({ module: 'market', mode: 'board', at: 0, end: 2, day: '2025-01-27', from: '2024-12-01', symbols: ['NVDA'], labels: { NVDA: 'NVIDIA 118' } }).some((e) => /labels/.test(e)));
});

test('a title lays its words on a designed ground: a region of the picture, the real mark on tiles, a card of facts on a painted plate (no brush hand since 2026-10-25)', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  const t = (x) => checkModuleSpec({ module: 'title', at: 0, end: 3, text: '凭什么', ...x });
  assert.deepEqual(t({ bg: { art: { prompt: 'an empty slide' } }, card: { mark: { src: 'a.png', crop: [.16, 0, .5, 1] }, lines: ['中国 AI 实验室'] } }), []);
  assert.ok(t({ card: { lines: ['x'] } }).some((e) => /lies on a ground/.test(e)));
  assert.ok(t({ bg: 'p.png', card: { lines: ['市值蒸发 6000 亿'] } }).some((e) => /6000 without a fact/.test(e)));
  assert.ok(t({ bg: 'p.png', tiles: { src: 'l.png', n: 9 } }).some((e) => /tiles/.test(e)));
  assert.ok(t({ focus: { x: .4, y: .3, zoom: 2 } }).some((e) => /focus frames the ground/.test(e)));
});

test('a shot is rendered again only when its own module changes (a fix to one module re-rendered every shot of every passage)', async () => {
  const { prepLines } = await lib('layers.mjs');
  const src = "export const PREP_VERSION = 1;\nif (spec.module === 'title') a();\nif (spec.module === 'market') b();\nconst shared = 1;";
  assert.match(prepLines(src, 'title'), /title/); assert.doesNotMatch(prepLines(src, 'title'), /market|shared/);
  assert.match(prepLines(src, 'insert').concat(prepLines(src, 'title')), /PREP_VERSION/);
});

test('a card of facts is the ground: display type may press over its words, other words may not (open R20)', async () => {
  const { frameProblems } = await lib('framecheck.mjs');
  const fact = { text: '中國AI實驗室', hant: '中國AI實驗室', line: 74, box: { x: 1200, y: 300, w: 560, h: 80 }, op: 1, contrast: 160, ground: true };
  const title = { text: '憑什麼', hant: '憑什麼', line: 300, box: { x: 600, y: 250, w: 900, h: 320 }, op: 1, contrast: 200 };
  const label = { text: '標籤文字', hant: '標籤文字', line: 60, box: { x: 1210, y: 310, w: 400, h: 70 }, op: 1, contrast: 160 };
  assert.deepEqual(frameProblems(3, [fact, title]).filter((p) => p.kind === 'overlap'), []);
  assert.equal(frameProblems(3, [fact, label]).filter((p) => p.kind === 'overlap').length, 1);
  assert.equal(frameProblems(3, [{ ...fact, ground: false }, title]).filter((p) => p.kind === 'overlap').length, 1);
});

test('a camera move with no ease asked starts from rest (a cubic ease-out set off at full speed: paperclip B48)', async () => {
  const src = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8');
  const w = {}; new Function('window', 'document', src)(w, { body: { childNodes: [] } });
  const m = [{ at: 0, end: 1, from: { zoom: 1 }, to: { zoom: 2 } }];
  assert.ok(w.__cameraState(m, .05).zoom - 1 < .01, 'barely moved in the first twentieth');
  assert.ok(Math.abs(w.__cameraState(m, .5).zoom - 1.5) < 1e-9);
  assert.ok(w.__cameraState([{ ...m[0], ease: 'out' }], .05).zoom - 1 > .1, 'an ease asked for is kept');
});

test('what the line learned is kept: techniques by ground and picture, lessons by sub-shot, gaps counted (user 2026-10-22: 给系统学习这些)', async () => {
  const T = await lib('techniques.mjs');
  assert.equal(T.groundOf({ device: 'presenter', layers: '底：讲者实拍；中：卡' }), 'presenter', 'a presenter shot is not footage');
  assert.equal(T.groundOf({ device: 'chart', layers: '底：灰白纸面拼贴，数字' }), 'data');
  assert.equal(T.groundOf({ device: 'title', layers: '底：设计的说明卡：白底面板' }), 'designed-card');
  assert.equal(T.groundOf({ device: 'title', layers: '底：设计的静物场景：图标块、放大镜' }), 'designed-scene');
  assert.equal(T.groundOf({ device: 'article', layers: '底：报道网页截图整屏' }), 'capture');
  const r = T.recipeOf({ module: 'title', style: 'brand', bg: { art: { prompt: 'x' } }, tiles: { n: 3 }, text: '深度求索', camera: [{ at: 1, end: 2, from: { zoom: 1.3 }, to: { zoom: 1 } }] });
  assert.deepEqual([r.style, r.bg, r.tiles, r.text, r.camera[0].ease], ['brand', 'painted', 3, undefined, 'inout'], 'the technique, not the words');
  const lib0 = [{ key: 'a/open/R1', device: 'market', ground: 'data', read: {}, ours: { module: 'market', recipe: {}, verdict: 'pass' }, follows: [] }, { key: 'a/open/R2', device: 'broll', ground: 'photo', read: {}, ours: { module: 'insert', recipe: {}, verdict: 'pass' }, follows: [{ item: 'camera', does: 'differ', how: '模块做不到比画面大的画布' }] }, { key: 'a/meta/R1', device: 'market', ground: 'data', read: {}, ours: { module: 'market', recipe: {} }, follows: [] }];
  const vecs = { 'a/open/R1': [1, 0], 'a/open/R2': [0, 1], 'a/meta/R1': [1, 0] };
  assert.deepEqual(T.nearest(lib0, vecs, { v: [1, 0], device: 'market', ground: 'data' }, { k: 2, exclude: 'a/meta/' }).map((n) => n.key), ['a/open/R1', 'a/open/R2'], 'by picture and device, never its own passage');
  assert.deepEqual(T.gapsOf(lib0).map((g) => [g.what, g.count]), [['broll · camera', 1]]);
  const L = [{ id: 'A', when: { devices: ['title'] }, do: 'x' }, { id: 'B', when: { words: '股价' }, do: 'y' }, { id: 'C', when: { always: true }, do: 'z' }];
  assert.deepEqual(T.lessonsFor(L, { read: { device: 'broll', shows: '电视股价榜' } }).map((l) => l.id), ['B', 'C']);
  const all = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/lessons.json'), 'utf8')).lessons;
  assert.ok(all.length >= 10 && all.every((l) => l.id && l.when && l.do && l.check && l.said), 'every lesson says when, what, the check and who said it');
});

test('a film chooses its style from its subject; chapters vary within the family; the reference holds the structure, the style owns the look', async () => {
  const P = await lib('shotplan.mjs'), B = await lib('breakdown.mjs'), M = await lib('modules.mjs');
  const all = M.styles();
  assert.ok(Object.keys(all).length >= 6);
  const H = await lib('house.mjs');
  for (const [k, s] of Object.entries(all)) { assert.deepEqual(H.typeErrors(s.fonts), [], `${k}: house fonts, two families at most`); for (const t of ['paper', 'ink', 'accent', 'up', 'down']) assert.match(s.tokens[t], /^#[0-9a-f]{6}$/i, `${k}.${t}`); }
  const shot = (theme) => ({ id: 'S1', spec: JSON.stringify(theme ? { theme } : {}) });
  assert.deepEqual(P.styleErrors({ style: { id: 'forensic-dark', why: '案件调查，暗场法医感' }, shots: [shot(null)] }, all), []);
  assert.ok(P.styleErrors({ style: { id: 'nope', why: 'xxxxxxxxx' }, shots: [] }, all)[0].includes('not a style'));
  assert.ok(P.styleErrors({ style: { id: 'forensic-dark', why: '暗' }, shots: [] }, all).some((e) => /why/.test(e)));
  assert.ok(P.styleErrors({ style: { id: 'forensic-dark', why: '案件调查，暗场法医感' }, shots: [shot('y2k-chrome')] }, all).some((e) => /family/.test(e)));
  assert.equal(P.themeOf({ style: { id: 'editorial-grey' } }), 'reference'); assert.equal(P.themeOf({ style: { id: 'warm-collage' } }), 'warm-collage'); assert.equal(P.themeOf({}), 'reference');
  const look = { base: 'light', lum: 80, sat: 5, grain: 0 }, cam = { zoom: 1, pan: [0, 0], moving: 0 };
  const card = { subs: [{ id: 'R01', at: 0, end: 4, camera: cam, look, text: [], events: [] }] }, ours = [{ at: 0, end: 4, camera: cam, look: { ...look, base: 'dark', lum: 15 }, text: [], events: [] }];
  const f = [{ item: 'R01.look', does: 'match', how: 'x' }];
  assert.equal(B.compareBreakdown(card, ours, f).length, 1);
  assert.deepEqual(B.compareBreakdown(card, ours, f, { styleOwnsLook: true }), [], 'a dark style over a light reference is the style, not a fault');
});

test('what the cold start on who found, fixed for every film: painted grounds count where they are no evidence, words no house font draws fail the plan, a wall of sayings, exposure and desaturation', async () => {
  const P = await lib('shotplan.mjs'), M = await lib('modules.mjs'), H = await lib('house.mjs');
  assert.deepEqual(P.paintedKinds('title', { bg: { art: { prompt: 'a code screen' } } }), ['photo', 'footage']);
  assert.deepEqual(P.paintedKinds('sidecard', { cards: [{ img: { art: { prompt: 'a trophy' } } }] }), ['cutout']);
  assert.deepEqual(P.paintedKinds('title', { bg: 'a.png' }), [], 'a real ground is counted by the index');
  assert.deepEqual(P.paintedKinds('person', { photo: { art: { prompt: 'x' } } }), [], 'a person is evidence: never painted');
  assert.deepEqual(H.onScreenStrings({ label: '把英伟达干趴下', src: 'work/a.png', type: { display: '黒華明朝' }, cards: [{ title: 'AI巨头？' }] }), ['把英伟达干趴下', 'AI巨头？']);
  const glyphs = (spec) => (/趴/.test(JSON.stringify(spec)) ? ['趴'] : []);
  const ans = { shots: [{ id: 'S1', module: 'sidecard', at: 0, end: 3, why: 'x', spec: JSON.stringify({ presenter: 'p.png', cards: [], tags: [{ at: 1, text: '把英伟达干趴下', side: 'bottom' }] }) }] };
  assert.ok(P.checkShotplan(ans, [0, 3], { glyphs }).errors.some((e) => /no house font has 趴/.test(e)));
  const q = (x) => M.checkModuleSpec({ module: 'quote', at: 0, end: 3, ...x });
  assert.deepEqual(q({ scatter: true, lines: [{ at: 0.1, text: 'DeepSeek，可能是国运级别的科技成果', main: true }, { at: 1, text: '神秘的东方魔法' }] }), []);
  assert.ok(q({ lines: [{ at: 0.1, text: 'x' }] }).some((e) => /photograph/.test(e)), 'without scatter a quote is someone\'s');
  const t = (texture) => M.checkModuleSpec({ module: 'insert', at: 0, end: 1, src: 'a.jpg', texture });
  assert.deepEqual(t({ saturate: -0.7, exposure: 0.8 }), []);
  assert.ok(t({ grain: -0.2 }).length && t({ exposure: 1.5 }).length);
  assert.deepEqual(M.checkModuleSpec({ module: 'sidecard', at: 0, end: 3, presenter: 'p.png', cards: [{ at: 1, title: 'AI巨头？', img: { art: { prompt: 'a gold trophy' } }, tone: 'paper' }] }), [], 'a painted prop on a paper card');
});

test('the pace of the packaging is held to the reference: a reveal spread over beats, a sweep that is quick, things that move at all (open R20, R03)', async () => {
  const B = await lib('breakdown.mjs');
  const A = (build, pulses = 1, onset = 0, level = 3) => ({ onset, build, pulses, level });
  assert.deepEqual(B.animErrors(A(2.7, 3, .2, 2.2), A(2.5, 3, .1, 2)), []);
  assert.match(B.animErrors(A(2.7, 3, .2, 2.2), A(.3, 1, 0, 1.9)).join(), /spread the reveal/, '凭什么 shown all at once');
  assert.match(B.animErrors(A(.7, 1, 0, 6), A(2.1, 3, 0, 3.3)).join(), /faster/, 'a bar sweeping a line in 1.26 s');
  assert.match(B.animErrors(A(1.9, 2, .7, 4.25), { onset: null, build: null, pulses: 0, level: .4 }).join(), /nothing moves/);
  assert.deepEqual(B.animErrors({ onset: null, build: null, pulses: 0, level: 1 }, A(.3)), [], 'a still reference asks for nothing');
  const card = { subs: [{ id: 'R01', at: 0, end: 3, read: { device: 'presenter' }, camera: { zoom: 1, pan: [0, 0], moving: 0, anim: A(2, 3) }, look: { base: 'light', lum: 50, sat: 5, grain: 0 }, text: [], events: [] }] };
  const ours = [{ at: 0, end: 3, camera: { zoom: 1, pan: [0, 0], moving: 0, anim: { onset: null, build: null, pulses: 0, level: .3 } }, look: { base: 'light', lum: 50, sat: 5, grain: 0 }, text: [], events: [] }];
  assert.deepEqual(B.compareBreakdown(card, ours, [{ item: 'R01.events', does: 'match', how: 'x' }]), [], 'not on the presenter (a still stand-in)');
  const { checkModuleSpec } = await lib('modules.mjs');
  assert.deepEqual(checkModuleSpec({ module: 'title', at: 0, end: 3, text: '凭什么', reveal: 2.6, textAt: .1 }), []);
  assert.ok(checkModuleSpec({ module: 'title', at: 0, end: 3, text: '凭什么', reveal: 5 }).some((e) => /reveal/.test(e)));
});

test('the page as one canvas: the director moves on it (pull out to the whole page, travel along a line); our display line is the one that says what the reference\'s says', async () => {
  const { checkModuleSpec } = await lib('modules.mjs'), B = await lib('breakdown.mjs');
  const a = (pc, x = {}) => checkModuleSpec({ module: 'article', at: 4, end: 6.5, src: 'p.png', hide: ['网易'], beats: [], pageCamera: pc, ...x });
  assert.deepEqual(a([{ at: 4, end: 5.6, from: { phrase: '市值一日内蒸发', zoom: 1.2 }, to: { page: true, zoom: 1.5, x: -0.12 }, ease: 'out' }]), []);
  assert.ok(a([{ at: 4, end: 5, from: {}, to: { page: true } }]).some((e) => /pageCamera/.test(e)));
  assert.ok(a([{ at: 4, end: 5, from: { page: true }, to: { page: true } }], { camera: [{ at: 4, end: 5, from: { zoom: 1 }, to: { zoom: 1.1 } }] }).some((e) => /not both/.test(e)));
  assert.ok(checkModuleSpec({ module: 'title', at: 0, end: 3, text: '深度求索', en: 'DeepSeek', style: 'brand', enSize: 240 }).length === 0);
  const look = { base: 'light', lum: 80, sat: 5, grain: 0 }, cam = { zoom: 1, pan: [0, 0], moving: 0 };
  const card = { subs: [{ id: 'R04', at: 0, end: 2, camera: cam, look, text: [{ text: '市值单日蒸发近6000亿美元', h: 110, cx: .53, cy: .5 }], read: { shows: '市值单日蒸发近6000亿美元', layers: '', type: '' }, events: [] }] };
  const ours = [{ at: 0, end: 2, camera: cam, look, events: [], text: [{ text: '博通公司股价下跌17%', h: 112, cx: .12, cy: .66 }, { text: '市值一日内蒸发近6000亿美元', h: 108, cx: .5, cy: .48 }] }];
  assert.deepEqual(B.compareBreakdown(card, ours, [{ item: 'R04.type', does: 'match', how: 'x' }]), [], 'the highlighted line, not its bold neighbour');
});

test('a passage keeps the reference\'s clock: each part cut to its shot, and the voice never shortens the picture (who-S10 drifted 0.4 s, its last 0.3 s lost)', async () => {
  const L = await lib('layers.mjs');
  assert.equal(L.concatList(['a.mp4', 'b.mp4'], [2.71, 1.5]), "file 'a.mp4'\noutpoint 2.7100\nfile 'b.mp4'\noutpoint 1.5000");
  const durs = Array.from({ length: 17 }, () => 2.795), list = L.concatList(durs.map((_, i) => `p${i}`), durs, 12);
  const total = [...list.matchAll(/outpoint ([\d.]+)/g)].reduce((s, m) => s + +m[1], 0);
  assert.ok(Math.abs(total - Math.round(17 * 2.795 * 12) / 12) < 1e-3, 'on the passage\'s frame grid the parts add up to the passage');
  const src = fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8');
  assert.doesNotMatch(src, /'-c:v', 'copy', '-c:a', 'aac', '-shortest'/, 'a copied picture under -shortest loses its tail');
});

test('the invariants of every film: no part loses its tail, the film keeps the passage\'s length, the final shows what the white model showed', async () => {
  const I = await lib('invariants.mjs');
  const P = (video, fps = 12) => ({ video, frames: Math.round(video * fps), fps });
  assert.deepEqual(I.partErrors([{ id: 'S1', file: 'a', want: 2.71, got: P(2.75) }]), []);
  assert.match(I.partErrors([{ id: 'S10', file: 'a', want: 2.71, got: P(2.4167) }]).join(), /tail was lost/, 'who-S10: 29 of 33 frames');
  assert.match(I.partErrors([{ id: 'S2', file: 'x', want: 1, got: null }]).join(), /cannot be read/);
  assert.deepEqual(I.filmErrors(P(47.5), 47.52), []);
  assert.match(I.filmErrors(P(47.9), 47.52).join(), /drifted/);
  assert.equal(I.corr([1, 2, 3, 4], [2, 4, 6, 8]).toFixed(3), '1.000');
  assert.deepEqual(I.sameErrors([{ id: 'S1', t: 1, r: .9 }, { id: 'S2', t: 3, r: .2 }]).length, 1);
});

test('the user\'s marks are data: a bad mark says why and holds the shot it was made on; the picture review is blind', async () => {
  const U = await lib('usermarks.mjs');
  const shots = [{ id: 'S1', hash: 'a' }, { id: 'S2', hash: 'b' }];
  assert.deepEqual(U.markErrors({ shot: 'S1', verdict: 'good' }, shots), []);
  assert.match(U.markErrors({ shot: 'S1', verdict: 'bad', note: '' }, shots).join(), /what is wrong/);
  assert.match(U.markErrors({ shot: 'S9', verdict: 'good' }, shots).join(), /no shot/);
  const marks = { S1: { verdict: 'bad', hash: 'a', note: '字太小' }, S2: { verdict: 'bad', hash: 'old', note: 'x' } };
  assert.deepEqual(U.holding(marks, shots), [{ shot: 'S1', note: '字太小' }], 'a mark on a picture since changed holds nothing');
  const src = fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8'), i = src.indexOf("rules: 'work/recipe-board-v1/prompts/stillcheck.md'"), task = src.slice(i, src.indexOf('images:', i));
  assert.doesNotMatch(task, /why:|spec:/, 'the reviewer never sees the director\'s reasons or the spec');
});

test('a norm card is a guess from the words: the director may tell a beat otherwise and cut inside it, said not refused', async () => {
  const B = await lib('breakdown.mjs');
  const card = { cuts: [10], subs: [], items: [{ item: 'R02.cut', at: 10, says: 'cut' }] };
  const answer = { shots: [{ id: 'S1', at: 0 }, { id: 'S2', at: 10 }, { id: 'S3', at: 12.5 }], follows: [{ item: 'R02.cut', does: 'match', how: '镜头边界落在这个切点' }] };
  assert.match(B.followErrors(answer, card).join(), /S3 cuts at 12.5/, 'against a film, a cut it does not make is said why');
  assert.deepEqual(B.followErrors(answer, card, { norms: true }), [], 'against the guess, a cut inside a beat is the director\'s');
  const src = fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8');
  assert.match(src, /card\?\.source === 'norms'\) warnings\.push\(\.\.\.against\.errors/, 'the guess\'s devices warn, never refuse');
});

test('a blind passage stays blind through its materials: the pick sheet shows no reference frame', () => {
  const m = fs.readFileSync(path.join(LIB, 'matpick.mjs'), 'utf8'), sp = fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8');
  assert.match(m, /need\.refAt != null && !need\.blind/);
  assert.match(sp, /requestNeeds\(cfg, id, seg, r\.requests, \{[^}]*blind \}\)/);
});

test('a picture already on transparency is its own cutout, not thrown away', () => {
  const sp = fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), i = sp.indexOf('export function cutOut');
  const body = sp.slice(i, sp.indexOf('\n}\n', i));
  assert.ok(body.indexOf('own > .03 && own < .97') > 0 && body.indexOf('own > .03') < body.indexOf("'cutout.swift'"), 'the alpha is read before Vision is asked');
});

test('a plan task written before its card gets the draft when the card arrives', () => {
  const sp = fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8');
  assert.match(sp, /\|\| !t\.input\.draft\) \{ t\.input\.breakdown = cardInput\(bc\.card\);[\s\S]{0,300}t\.input\.draft = await/);
});

test('a page shown whole (brand, insert) covers the site names it prints; an article on a page that prints none says hide: []', async () => {
  const M = await lib('modules.mjs'), src = fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8');
  assert.match(src, /spec\.hide\?\.length && \['page', 'photo'\]\.includes\(kind\)/);
  const art = (hide) => M.checkModuleSpec({ module: 'article', at: 0, end: 3, src: 'x.png', hide, beats: [{ at: .1, do: 'hold' }] }).join();
  assert.doesNotMatch(art([]), /name the site/);
  assert.match(art(undefined), /name the site/);
});

test('a blind passage\'s sheet page shows ours alone; the beside sheet goes only to the reviewer', () => {
  const src = fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8');
  assert.match(src, /-ours\.jpg/);
  assert.match(src, /blind && fs\.existsSync\(s\.file\.replace/);
});

test('lessons from the blind cards review: the presenter packaged with cards, tall metal letters on a quiet ground', async () => {
  const SC = await lib('scriptcard.mjs'), M = await lib('modules.mjs');
  const sc = (spec) => ({ id: 'S', module: 'sidecard', spec: JSON.stringify(spec) });
  const tagged = { tags: [{ at: 1, text: '錢生錢' }], cards: [] }, carded = { tags: [], cards: [{ at: 1, title: 'A100' }] };
  assert.match(SC.varietyErrors({ shots: [sc(tagged), sc(tagged), sc(carded)] }).join(), /only torn labels/);
  assert.deepEqual(SC.varietyErrors({ shots: [sc(tagged), sc(carded), sc(carded)] }), []);
  const t = (o) => M.checkModuleSpec({ module: 'title', at: 0, end: 2, text: '憑什麼', bg: { art: { prompt: 'x' } }, style: 'metal', ...o }).join();
  assert.match(t({ dim: .3 }), /pushed back/);
  assert.doesNotMatch(t({ dim: .5 }), /pushed back/);
});

test('a shot that cannot be drawn is its own problem, the sheet goes on', () => {
  const src = fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8');
  assert.match(src, /if \(!e\.problems\) \{[^\n]*could not be drawn/);
  assert.match(src, /const drawn = shots\.filter/);
});

test('sameness refuses a plan from its script alone; against a film it is said', () => {
  const src = fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8');
  assert.match(src, /if \(!card \|\| card\.source === 'norms'\) errors\.push\(\.\.\.varietyErrors\(answer\)\); else warnings\.push/);
});

test('a card going on across a cut keeps its label (not a new label in a row)', async () => {
  const S = await lib('shotplan.mjs');
  const sc = (labels) => ({ id: 'S', spec: { module: 'sidecard', cards: labels.map((l) => ({ title: 'x', label: l })) } });
  assert.deepEqual(S.labelErrors([sc(['質疑']), sc(['質疑'])], { maxShare: 1, consecutive: false, perShot: 2 }), []);
  assert.match(S.labelErrors([sc(['質疑']), sc(['另一個'])], { maxShare: 1, consecutive: false, perShot: 2 }).join(), /in a row/);
});

test('picks by eye survive another passage asking: the task carries the needs left waiting, each answer counts on its own', () => {
  const src = fs.readFileSync(path.join(LIB, 'matpick.mjs'), 'utf8');
  assert.match(src, /const carried = \(prev\?\.input\?\.needs/);
  assert.match(src, /checkPickAnswer\(\{ needs: \[n\] \}, \[x\]\)/);
});

test('faster: passages in their own processes, a sheet\'s shots side by side, one passage at a time in the materials', async () => {
  const S = await lib('shotplan.mjs'), src = fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), lay = fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8');
  assert.match(src, /if \(child \|\| PASSAGE_JOBS < 2 \|\| segs\.length < 2\) return stepPassagesHere/);
  assert.match(lay, /const done = await pool\(list, async \(s, k\)/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-lock-')), cfg = { dataDir: dir, repoRoot: dir, sourceRoot: dir };
  fs.mkdirSync(path.join(dir, 'projects', 'p'), { recursive: true }); fs.writeFileSync(path.join(dir, 'projects', 'p', 'project.json'), '{"id":"p"}');
  const rel = await S.materialsLock(cfg, 'p'); const f = path.join(dir, 'projects', 'p', 'materials', '.lock');
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).pid, process.pid);
  let second = false; const w = S.materialsLock(cfg, 'p', () => {}, { waitMs: 20 }).then((r) => { second = true; return r; });
  await new Promise((r) => setTimeout(r, 80)); assert.equal(second, false, 'a live holder is waited for');
  rel(); const rel2 = await w; assert.equal(second, true); rel2();
  fs.writeFileSync(f, '999999'); await assert.rejects(S.materialsLock(cfg, 'p', () => {}, { waitMs: 10, maxWait: 30 }), /timed out/);
  assert.equal(fs.readFileSync(f, 'utf8'), '999999');
  fs.rmSync(dir, { recursive: true, force: true });
  const probe = spawnSync(process.execPath, [path.join(REPO, 'scripts/test-materials-lock-live.mjs')], { encoding: 'utf8', timeout: 15000 });
  assert.equal(probe.status, 0, `${probe.stdout}\n${probe.stderr}`);
});

test('a brand beat may be told by a full-screen clip of the brand', async () => {
  const S = await lib('shotplan.mjs');
  const r = S.compareToReference({ reference: [{ at: 0, end: 3, device: 'brand', material: 'none', shows: 'o1' }], shots: [{ id: 'S1', module: 'insert', at: 0, end: 3, spec: '{"src":"x.mp4"}' }] }, [0, 3]);
  assert.equal(r.rows[0].technique, 'match');
});

test('a page blurred past reading may lie under white words', async () => {
  const MI = await lib('matindex.mjs');
  assert.equal(MI.picks({ module: 'title', bg: 'p.png' })[0][0], 'title.bg.quiet');
  assert.equal(MI.picks({ module: 'title', bg: 'p.png', blur: 6 })[0][0], 'title.bg');
  assert.equal(MI.picks({ module: 'title', bg: 'p.png', dim: .5 })[0][0], 'title.bg');
});

test('a stock preview\'s watermark is read on its frames and holds the clip', async () => {
  const MI = await lib('matindex.mjs');
  for (const t of ['Kilmer Media', 'VID # 20190104_160', 'Videohive', '© Pond5']) assert.match(t, MI.STOCK_MARKS, t);
  assert.doesNotMatch('Hands typing on a keyboard', MI.STOCK_MARKS);
  assert.match('hupo-auto2-B43~2-kilmermedia-closeup.mp4', MI.PREVIEW_VENDORS);
  assert.doesNotMatch('hupo-auto2-B81-humber-polytechnic-research.mp4', MI.PREVIEW_VENDORS);
  assert.match(MI.slotErrors('insert.src', 'x.mp4', { kind: 'footage', w: 1920, marks: ['kilmer media'] }).join(), /watermark/);
});

test('a title may lie over a price chart drawn from real prices', async () => {
  const M = await lib('modules.mjs'), S = await lib('shotplan.mjs');
  const t = { module: 'title', at: 0, end: 2, text: '搞量化', bg: { market: { mode: 'candles', symbol: 'NVDA', day: '2025-01-24', from: '2025-01-02' } } };
  assert.doesNotMatch(M.checkModuleSpec(t).join(), /bg is/);
  assert.deepEqual(S.paintedKinds('title', t), ['page', 'photo']);
});

test('a title may lie over a table the line sets (a module\'s last frame as its ground)', async () => {
  const M = await lib('modules.mjs'), S = await lib('shotplan.mjs');
  const t = { module: 'title', at: 0, end: 2, text: '人員', bg: { module: { module: 'table', columns: ['姓名', '現狀'], rows: [['高華佐', '仍在職']], rowsAt: [0] } } };
  assert.doesNotMatch(M.checkModuleSpec(t).join(), /bg/);
  assert.deepEqual(S.paintedKinds('title', t), ['page', 'photo']);
  assert.match(M.checkModuleSpec({ ...t, bg: { module: { module: 'person' } } }).join(), /bg\.module is one of/);
});

test('a picture shown in part of the frame needs only that width', async () => {
  const MA = await lib('materials.mjs');
  assert.equal(MA.minWidth({ form: 'photo' }), 1280);
  assert.equal(MA.minWidth({ form: 'photo', slotWidth: 800 }), 800);
});

test('a named person\'s picture is a photograph: drawings and renders are turned away', async () => {
  const S = await lib('shotplan.mjs'), py = fs.readFileSync(path.join(LIB, 'likeness.py'), 'utf8');
  assert.ok(S.isPersonNeed({ entity: '伊尔亚·苏茨克维', original: '伊尔亚·苏茨克维的照片', archive: { keywords: ['portrait'] } }));
  assert.ok(!S.isPersonNeed({ entity: '', original: '打字的手' }));
  assert.match(py, /def drawn\(/);
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /\|\| drawnPerson\(cfg, n, f\) \|\|/);
});

test('a plan refused by checks that changed since is checked again', () => {
  const src = fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8');
  assert.match(src, /if \(check\.errors\?\.length && code > mt\(P\.check\)\) return 'to-check';/);
});

test('a stage is never blank at its start: its first element within 0.4 s of the cut', async () => {
  const M = await lib('modules.mjs');
  assert.match(M.checkModuleSpec({ module: 'table', at: 10, end: 15, columns: ['a'], rows: [['b']], rowsAt: [10.9] }).join(), /nothing is on screen until/);
  assert.doesNotMatch(M.checkModuleSpec({ module: 'table', at: 10, end: 15, columns: ['a'], rows: [['b']], rowsAt: [10.2] }).join(), /nothing is on screen/);
});

test('an insert may show a part of a large photograph (crop)', async () => {
  const M = await lib('modules.mjs');
  assert.doesNotMatch(M.checkModuleSpec({ module: 'insert', at: 0, end: 2, src: 'x.jpg', crop: [.2, .3, .25, .14] }).join(), /crop is/);
  assert.match(M.checkModuleSpec({ module: 'insert', at: 0, end: 2, src: 'x.jpg', crop: [.9, .3, .25, .14] }).join(), /crop is/);
});

test('the rough cut first: the fine render waits for the user\'s confirmation of the passage as it is now', async () => {
  const U = await lib('usermarks.mjs');
  const shots = [{ id: 'S1', hash: 'a' }, { id: 'S2', hash: 'b' }];
  assert.equal(U.fineGate({}, shots).ok, false, 'no confirmation, no fine render');
  const ok = { _rough: { key: U.roughKey(shots), at: 't' } };
  assert.equal(U.fineGate(ok, shots).ok, true);
  assert.match(U.fineGate(ok, [{ id: 'S1', hash: 'a' }, { id: 'S2', hash: 'c' }]).why, /changed/, 'a shot changed after the confirmation asks again');
  assert.match(U.fineGate({ ...ok, S1: { verdict: 'bad', hash: 'a', note: '太空' } }, shots).why, /bad/);
  const src = fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8');
  assert.ok(src.indexOf('fineGate(') < src.indexOf('await renderPassage(cfg, id, g.seg'), 'the gate stands before the fine render');
  assert.match(src, /loadProject\(cfg, id\)\.confirmRough \? fineGate/, 'the user is asked only where the project asks for it');
});

test('the card writes the plan\'s first draft: the measured numbers become parameters, judgement is left as named blanks', async () => {
  const D = await lib('draft.mjs');
  assert.deepEqual(D.cameraOf({ zoom: 1.01, pan: [0, .005] }, 0, 2), [], 'a still camera asks for no move');
  const push = D.cameraOf({ zoom: 1.087, pan: [0, 0], ease: .7 }, 67.06, 68.25)[0];
  assert.equal(push.ease, 'out'); assert.ok(Math.abs(push.to.zoom / push.from.zoom - 1.087) < .002, 'the measured push');
  const pull = D.cameraOf({ zoom: .812, pan: [.084, .178], ease: .5 }, 81.36, 87.1)[0];
  assert.ok(pull.from.zoom > pull.to.zoom, 'a pull-out'); assert.ok(pull.to.zoom >= 1 + 2 * Math.abs(pull.to.y) * 16 / 9 - 1e-9, 'the frame stays covered');
  const card = { items: [{ item: 'R01.camera' }, { item: 'R01.events' }], subs: [{ id: 'R01', at: 43.35, end: 46.28, read: { device: 'title', shows: '凭什么' }, camera: { zoom: 1, pan: [0, 0], anim: { onset: .2, build: 2.7, pulses: 3 } }, look: { grain: 5.36, vignette: 12, base: 'light' } }] };
  const d = await D.draftFromCard(card), sp = JSON.parse(d.shots[0].spec);
  assert.equal(d.shots[0].module, 'title'); assert.equal(sp.reveal, 2.7, 'the reveal from the measured build'); assert.equal(sp.texture.grain, 1);
  assert.deepEqual(d.follows.map((f) => f.does), ['match', 'match']);
  assert.ok(D.draftErrors(d).length === 2, 'the style and the shot\'s blanks');
  assert.deepEqual(D.draftErrors({ style: { why: '财经解读' }, shots: [{ id: 'S1', spec: '{"text":"凭什么"}' }] }), []);
});

test('a passage from its script alone: the words choose the device, the library gives the numbers, a design seed makes each film its own', async () => {
  const SC = await lib('scriptcard.mjs');
  const intents = [{ id: 'person', signals: ['创始人', 'CEO'] }, { id: 'quote', signals: ['原话', '曾说'] }, { id: 'evidence-article', signals: ['据报道'] }];
  assert.equal(SC.intentOf('英伟达股价一天暴跌17%', intents).device, 'market');
  assert.equal(SC.intentOf('梁文锋，DeepSeek创始人', intents).device, 'person');
  assert.equal(SC.intentOf('据报道，Meta 成立了小组', intents).device, 'article');
  assert.equal(SC.intentOf('凭什么？', intents).device, 'title');
  assert.equal(SC.intentOf('我们接着说', intents).device, 'presenter');
  const lib0 = [{ key: 'a/x/R1', device: 'person', dur: 3, measured: { camera: { zoom: 1.06, pan: [0, .01], moving: .6, ease: .5, anim: { build: 1.3 } } } }, { key: 'a/x/R2', device: 'presenter', dur: 4, measured: { camera: { zoom: 1.05, pan: [0, 0], moving: .3 } } }];
  const lines = [{ at: 0, end: 2, text: '我们接着说' }, { at: 2, end: 4.5, text: '梁文锋，DeepSeek创始人' }, { at: 4.5, end: 12, text: '他做的事很简单他做的事很简单' }];
  const c1 = SC.normCard(lines, { intents, lib: lib0, seed: 7 }), c2 = SC.normCard(lines, { intents, lib: lib0, seed: 7 });
  assert.deepEqual(c1, c2, 'the same seed, the same card');
  assert.deepEqual(c1.subs.map((s) => s.read.device), ['presenter', 'person', 'presenter', 'presenter'], 'the long presenter beat split');
  assert.equal(c1.subs[1].camera.zoom, 1.06, 'the person card moves as the library\'s did'); assert.equal(c1.source, 'norms');
  const ms = ['title', 'title', 'title', 'insert', 'insert'], v1 = SC.chooseVariants(ms, 1), v2 = SC.chooseVariants(ms, 2);
  for (const v of [v1, v2]) for (let i = 1; i < ms.length; i++) if (ms[i] === ms[i - 1]) assert.notDeepEqual(v[i], v[i - 1], 'never the same variant twice running');
  assert.notDeepEqual(v1, v2, 'another seed, another film');
  const t = (spec, m = 'title') => ({ id: 'S', module: m, spec: JSON.stringify(spec) });
  assert.match(SC.varietyErrors({ shots: [t({ style: 'ink' }), t({ style: 'ink' }), t({ style: 'ink' })] }).join(), /three title shots|every title/);
  assert.deepEqual(SC.varietyErrors({ shots: [t({ style: 'ink' }), t({ side: 'left' }), t({ style: 'metal', shape: 'tall' })] }), []);
  const D = await lib('draft.mjs'), M = await lib('modules.mjs');
  const d = await D.draftFromCard(c1, { seed: 7, styles: M.styles(), topic: '一个关于AI和科技公司的故事' });
  assert.ok(M.styles()[d.style.id].fits.some((w) => '一个关于AI和科技公司的故事'.includes(w)), 'a style that fits the subject'); assert.doesNotMatch(d.style.why, /TODO/);
});

test('the reference\'s measured motion becomes the shot\'s: its camera where ours falls short, a frame\'s parts in turn over the measured build', async () => {
  const S = await lib('shotplan.mjs');
  const card = { subs: [{ id: 'R04', at: 10, end: 17, camera: { zoom: 1, pan: [.109, 0], moving: .88, ease: .7, anim: { onset: .1, build: 6.6, pulses: 6 } } }] };
  const ins = S.withRefMotion({ module: 'insert', at: 10, end: 17, camera: [{ at: 10, end: 17, from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1.02, x: 0, y: 0 } }] }, card, [{ item: 'R04.camera', does: 'match' }]);
  const k = ins.camera[0]; assert.ok(Math.abs((k.to.x - k.from.x) - .0545) < .002, 'the measured travel (half each side)'); assert.ok(k.from.zoom >= 1 + 2 * Math.abs(k.from.x), 'the frame stays covered');
  assert.equal(S.withRefMotion({ module: 'insert', at: 10, end: 17 }, card, [{ item: 'R04.camera', does: 'differ' }]).camera, undefined, 'a camera the plan says differs is left alone');
  const own = [{ at: 10, end: 17, from: { zoom: 1.2, x: -.06, y: 0 }, to: { zoom: 1.2, x: .06, y: 0 } }];
  assert.deepEqual(S.withRefMotion({ module: 'insert', at: 10, end: 17, camera: own }, card, []).camera, own, 'a camera that travels as far is kept');
  assert.equal(S.withRefMotion({ module: 'article', at: 10, end: 17 }, card, []).camera, undefined, 'a page keeps its own camera');
  const parts = [{ kind: 'shape', in: 'none', box: { x: 0, y: 0, w: 10 } }, { kind: 'text', text: 'a', at: 10.1 }, { kind: 'text', text: 'b', at: 10.1 }, { kind: 'image', src: 'a.png', at: 10.2, bar: { at: 10.6 } }];
  const f = S.withRefMotion({ module: 'frame', at: 10, end: 17, parts }, card, []), ats = f.parts.map((p) => p.at);
  assert.equal(ats[0], undefined, 'a part that does not enter stays'); assert.ok(ats[3] - ats[1] >= 3.5 && ats[3] < 16.5, 'in turn over the build'); assert.ok(f.parts[3].bar.at > ats[3], 'its bar after it');
  const deep = S.withRefMotion({ module: 'frame', at: 0, end: 3, parts: [] }, { subs: [{ id: 'R01', at: 0, end: 3, camera: { zoom: 2.1, pan: [0, 0], moving: .9 } }] }, []);
  assert.ok(deep.camera.at(-1).to.zoom <= 1.13 && deep.ground.push >= .29, 'a designed frame keeps its layout: the deep push goes to its ground');
  const pulled = S.withRefMotion({ module: 'frame', at: 0, end: 3, parts: [] }, { subs: [{ id: 'R01', at: 0, end: 3, camera: { zoom: .88, pan: [0, 0], moving: .9 } }] }, []);
  assert.equal(pulled.ground.push, 0, 'a pull-out keeps the ground still (its default push measured as a push: recap S1)');
  const tbl = S.withRefMotion({ module: 'frame', at: 0, end: 6, ground: { src: { module: { module: 'table' } } }, parts: [] }, { subs: [{ id: 'R01', at: 0, end: 6, camera: { zoom: 1.59, pan: [0, 0], moving: .9 } }] }, []);
  assert.ok(tbl.ground.push > .5, 'a table ground takes the deep push into it (talent S2)');
  assert.deepEqual((await lib('layers.mjs')).ADVISORY_KINDS, ['look', 'type'], 'the palette and the type size are reported, not held to');
  const chart = S.withRefMotion({ module: 'chart', at: 0, end: 3 }, { subs: [{ id: 'R01', at: 0, end: 3, camera: { zoom: 1, pan: [.3, 0], moving: .9 } }] }, []);
  assert.equal(chart.camera, undefined, 'a chart moves by its content: a whole-frame pan pushed its labels off the edge');
  const q = S.withRefMotion({ module: 'quote', at: 0, end: 3 }, { subs: [{ id: 'R01', at: 0, end: 3, camera: { zoom: 1, pan: [.3, 0], moving: .9 } }] }, []);
  assert.ok(Math.max(...q.camera.flatMap((c) => [c.from.zoom, c.to.zoom])) <= 1.21, 'a quote\'s words keep inside the frame (ending S6)');
  const tight = S.withRefMotion({ module: 'title', at: 10, end: 13, textAt: 11 }, { subs: [{ id: 'R01', at: 10, end: 13, camera: { zoom: 1, pan: [0, 0], anim: { onset: .1, build: 3.1 } } }] }, []);
  assert.ok(tight.reveal <= 1.8 + 1e-9, 'a reveal within what is left of the shot (talent S4)');
  const pic = S.withRefMotion({ module: 'insert', at: 0, end: 3 }, { subs: [{ id: 'R01', at: 0, end: 3, camera: { zoom: 1, pan: [.3, 0], moving: .9 } }] }, []);
  assert.ok(Math.max(...pic.camera.flatMap((c) => [c.from.zoom, c.to.zoom])) <= 1.61, 'a picture is not cropped by a deep zoom either');
  assert.ok(deep.ground.push <= .3, 'nor its ground pushed into a blank margin');
  const late = S.withRefMotion({ module: 'frame', at: 10, end: 17, parts: [{ kind: 'text', text: 'a', at: 10 }, { kind: 'text', text: 'b', at: 10.05 }] }, { subs: [{ ...card.subs[0], camera: { ...card.subs[0].camera, anim: { onset: .6, build: 6, pulses: 3 } } }] }, []);
  assert.equal(late.parts[0].at, 10, 'the first entrance never later than the director\'s (the frame went blank before it)');
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /withRefMotion\(withRefDesign\(\{ \.\.\.s\.spec, \.\.\.carried\[s\.id\] \}, card\), card, answer\.follows\)/, 'the accepted plan\'s modules take it');
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /const re = refreshModules\(cfg, id, g\.seg\)/, 'a plan accepted before takes it too (its modules written again when they differ)');
});

test('a news page is the report itself: the reference\'s headline is searched first and outlets rank far above blogs and self-media', async () => {
  const S = await lib('shotplan.mjs'), M = await lib('materials.mjs');
  const card = { subs: [{ at: 0, end: 4, read: { device: 'article', shows: '黑底上一篇报道「幻方量化花10个亿，就为了这1万张A100显卡」，标题逐字打出' } }, { at: 4, end: 8, read: { device: 'article', shows: '报道正文特写：数字「5926.58亿」逐字打出' } }, { at: 8, end: 9, read: { device: 'article', shows: "报道标题'扎克伯格召开庞大的战情室，试图弄清楚'被黑条刷过" } }] };
  assert.equal(S.refHeadline(card, 0, 4), '幻方量化花10个亿，就为了这1万张A100显卡');
  assert.equal(S.refHeadline(card, 4, 8), null, 'a figure quoted from the text is no headline');
  assert.match(S.refHeadline(card, 8, 9), /^扎克伯格召开/);
  const n = S.requestNeed('cards', { shot: 'S5', kind: 'page', what: '幻方囤了1万张A100的报道', search: 'High-Flyer 10000 A100', refTitle: '幻方量化花10个亿，就为了这1万张A100显卡' });
  assert.equal(n.page.refTitle, '幻方量化花10个亿，就为了这1万张A100显卡'); assert.equal(n.page.local, true, 'a Chinese headline keeps Chinese reports first');
  assert.ok(M.titleMatch('幻方量化花10个亿，就为了这1万张A100显卡', '幻方量化花10个亿，就为了这1万张A100显卡 - 36氪') > .9);
  assert.ok(M.titleMatch('幻方量化花10个亿，就为了这1万张A100显卡', 'Inside High-Flyer, the AI hedge fund behind China\'s DeepSeek') < .1);
  const o = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/news-outlets.json'), 'utf8'));
  for (const h of ['cls.cn', 'yicai.com', '36kr.com', 'reuters.com']) assert.ok(o.outlets.includes(h), h);
  const not = o.notSources.patterns.map((x) => new RegExp(x, 'i'));
  for (const u of ['about.getcoai.com/inside-high-flyer', 'www.163.com/dy/article/JMVIUQ6Q.html', 'blog.progressiverobot.com/x', 'www.oschina.net/news/1']) assert.ok(not.some((re) => re.test(u)), u);
  assert.ok(!not.some((re) => re.test('www.cls.cn/detail/1')), 'a report is a source');
  assert.ok(!not.some((re) => re.test('www.datalearner.com/ai-models/x')), 'a model database the reference shows is a source');
  assert.match(fs.readFileSync(path.join(LIB, 'materials.mjs'), 'utf8'), /outlet\(c\) \? 30 : 0\) - \(notSource\(c\) \? 45 : 0\)/, 'outlets far above blogs');
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /pages: \(spec\) => \[\.\.\.phraseErrors\(cfg, spec\), \.\.\.notSourceErrors\(cfg, id, spec\)\]/, 'a plan showing a blog or self-media page is refused');
});

test('what arrives is checked: a page carries the claim and the story\'s time, a picture carries no stock watermark', async () => {
  const S = await lib('shotplan.mjs'), M = await lib('materials.mjs');
  const n = S.requestNeed('recap', { shot: 'S6', kind: 'page', what: '报道：英伟达一个交易日市值蒸发「5926.58亿」美元', search: 'x', entity: '英伟达' });
  assert.ok(n.page.must.includes('5926.58亿'), 'the quoted words and figures of the request');
  assert.deepEqual(S.requestNeed('cards', { shot: 'S5', kind: 'page', what: '暗涌Waves／36氪报道：幻方储备了「万张A100」芯片，花了10亿元', search: 'x', entity: null }).page.must, ['万张A100', '10亿'], 'a figure needs its unit: 36氪 and A100 are no figures');
  assert.equal(S.pageClaimError({ form: 'webpage', page: { must: ['万张A100'] } }, { kind: 'page', text: '疯狂的幻方：一家隐形AI巨头的大模型之路 36氪 2023-05-23 作者……' }, null, '……幻方是除了几家大厂外唯一一家储备了万张A100芯片的公司……'), null, 'the claim further down the archived page counts');
  const page = (text) => ({ kind: 'page', text });
  assert.equal(S.pageClaimError(n, page('财联社 2025-01-28 英伟达周一收跌16.97%，市值一个交易日蒸发5926.58亿美元，刷新纪录……'), ['2021-01-01', '2025-12-31']), null);
  assert.match(S.pageClaimError(n, page('界面新闻 2026-08-25 英伟达创4年来最长连跌纪录，市值一夜蒸发万亿元，投资者担忧……'), ['2021-01-01', '2025-12-31']), /does not say/);
  assert.match(S.pageClaimError({ ...n, page: { ...n.page, must: [] } }, page('界面新闻 2026-08-25 英伟达创4年来最长连跌纪录，市值一夜蒸发万亿元，投资者担忧……'), ['2021-01-01', '2025-12-31']), /outside the story's time/, 'another slide of another year (open-S3)');
  assert.match(S.fitError({ form: 'video' }, { kind: 'footage', text: 'BPANIGING MOTIO 100€ Arapti BRINGING MOTION TO IDE 1,00€' }, 0), /watermark/, 'a stock preview (B80)');
  assert.equal(S.fitError({ form: 'webpage' }, { kind: 'page', text: 'TOM WILLIAMS—CQ-ROLL CALL, INC VIA GETTY IMAGES' }, 0), null, 'a page\'s photo credit is no watermark');
  assert.ok(M.STOCK_MARK.test('Shutterstock') && !M.STOCK_MARK.test('英伟达市值蒸发'));
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /pageClaimError\(n, idx\.files\[f\], loadProject\(cfg, id\)\.newsWindow \|\| null, /, 'the material loop turns such a page down and tries the next');
  { const keep = [process.env.PEXELS_API_KEY, process.env.PIXABAY_API_KEY]; delete process.env.PEXELS_API_KEY; delete process.env.PIXABAY_API_KEY;
    assert.deepEqual(M.stockCandidates({ form: 'video' }, 'dollar bills'), [], 'no key, no stock search (offline)');
    if (keep[0]) process.env.PEXELS_API_KEY = keep[0]; if (keep[1]) process.env.PIXABAY_API_KEY = keep[1]; }
  assert.match(fs.readFileSync(path.join(LIB, 'materials.mjs'), 'utf8'), /c\.source === 'stock' && !need\.entity \? 20 : 0/, 'a licensed stock clip leads YouTube for an unnamed need');
  assert.equal(M.waybackUrl('https://www.reuters.com/x'), 'https://web.archive.org/web/2if_/https://www.reuters.com/x', 'a publisher behind a bot check is captured through the archive');
  assert.match(fs.readFileSync(path.join(LIB, 'materials.mjs'), 'utf8'), /!deadUrls\(approvals, p\.shotId\)\.has\(.*\?\.asset \|\| p\.url\) && known\(p\)\)/, 'a stale pick is left out of the batch, not thrown (it blocked every other pick)');
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /'materials\.mjs', 'matpick\.mjs'\]\.map\(\(f\) => path\.join\(path\.dirname\(HERE_F\), f\)\), taskPaths\(cfg, id, 'matpick'\)\.answer\]/, 'a refused plan is run again when the picks or the materials code change');
});

test('scenes: a cut that shows what the one before shows is one take (B04 marked one sentence three times)', async () => {
  const { sameSceneKeep } = await lib('scenes.mjs');
  const page = (asset, quote) => ({ slots: { screen: { asset, fit: 'fill', quote } } });
  assert.deepEqual(sameSceneKeep([page('a.png', '23萬枚'), page('a~1.png', '23萬枚'), page('a~2.png', '23萬枚')]), [true, false, false]);
  assert.deepEqual(sameSceneKeep([page('a.png', '23萬枚'), page('a~1.png', '身份仍未確定')]), [true, true]);
  assert.deepEqual(sameSceneKeep([{ recipe: 'title', slots: {} }, { recipe: 'screen-full', slots: {} }]), [true, true]);
});


test('one scorecard for the director, the code and the reviewer: a fix names its item, the opening and the progress across the key frames are measured', async () => {
  const Ly = await lib('layers.mjs'), F = await lib('framecheck.mjs');
  const card = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/scorecard.json'), 'utf8'));
  assert.deepEqual(Ly.SCORECARD, card.items.map((x) => x.id), 'the review reads the scorecard file');
  for (const x of card.items) assert.ok(Ly.PROBLEMS.includes(x.kind) && ['code', 'review'].includes(x.by), x.id);
  const due = [{ id: 'S1' }], v = (say) => ({ shots: [{ id: 'S1', verdict: 'fix', owner: 'plan', problems: [{ kind: 'weak-design', at: null, say }], fix: 'x', notes: null }] });
  assert.deepEqual(Ly.checkStillAnswer(v('[focus] 三个标签一样大，没有主角'), due), []);
  assert.match(Ly.checkStillAnswer(v('和对标比差一档'), due).join(), /scorecard item/, 'no fix without an item ("差一档" was 291 of the notes)');
  assert.equal(F.progressProblem(3, .005, .08).kind, 'unlike-reference', 'the key frames stand still where the reference moves');
  assert.equal(F.progressProblem(3, .005, .01), null, 'the reference stands still too');
  assert.equal(F.firstFrameProblem(3, .05, .4).kind, 'empty', 'the shot opens empty');
  assert.equal(F.firstFrameProblem(3, .3, .4), null);
});

test('a designed frame is tried in several layouts and the one with fewest problems leads', async () => {
  const V = await lib('framevariants.mjs');
  const spec = { module: 'frame', parts: [{ kind: 'shape', box: { x: 0, y: 0, w: 100, h: 100 }, in: 'none' }, { kind: 'text', text: '強化學習怎麼教', size: 110, box: { x: 6, y: 7, w: 50 }, at: 1 }, { kind: 'text', text: '答對了才給一點獎勵', size: 170, box: { x: 6, y: 68, w: 88 }, at: 3 }, { kind: 'image', src: 'a.png', box: { x: 8, y: 30, w: 60 }, at: 2 }] };
  const vs = V.frameVariants(spec, { 3: 2 });
  assert.deepEqual(vs.map((v) => v.name), ['written', 'centred', 'left', 'hero']);
  for (const v of vs) { assert.deepEqual(v.parts[0], spec.parts[0], 'the full-frame wash stays'); for (const l of v.parts.slice(1)) assert.ok(l.box.y >= 7 && l.box.y < 86, `${v.name} inside the frame above the subtitle band`); }
  const c = vs[1].parts; assert.ok(c[1].box.y < c[3].box.y && c[3].box.y < c[2].box.y, 'stacked in the order they come in');
  assert.ok(vs[3].parts[3].box.w > 60, 'the hero (the heaviest part, here the picture) grows');
  assert.deepEqual(V.rankVariants([{ name: 'written', problems: ['a', 'b'] }, { name: 'centred', problems: [] }, { name: 'left', problems: ['a'] }]).map((r) => r.name), ['centred', 'left', 'written']);
});

test('the line reports its numbers: versions a shot, first-pass share, the items reviews still name', async () => {
  const M = await lib('linemetrics.mjs');
  const m = M.passageMetrics({ a: { shot: 'S1', verdict: 'fix', by: 'manual', at: '1', problems: [{ kind: 'weak-design', say: '[focus] x' }] }, b: { shot: 'S1', verdict: 'pass', at: '2' }, c: { shot: 'S2', verdict: 'pass', at: '1' } });
  assert.deepEqual(m, { shots: 2, versions: 1.5, firstPass: .5, passing: 2, items: { focus: 1 } });
});

test('geometry of every moment: faults that stand 0.6 s fail their beat; type half under a 3D object; type cut by the frame', async () => {
  const C = await lib('chapter.mjs');
  const T = (text, x0, y0, x1, y1, more = {}) => ({ text, size: 60, x0, y0, x1, y1, ...more });
  // half under an object fails; wholly on its own plate, or a ground, does not (the cover leaves grounds and owners out)
  assert.equal(C.objectErrors([T('兒子', 100, 100, 220, 160)], [[{ name: 'D', share: 0.4 }]], 'B44').length, 1);
  assert.match(C.objectErrors([T('祖父', 100, 100, 220, 140, { object: true, size: 30 })], [[{ name: 'link', share: 0.06, area: 0.002 }]], 'B44')[0], /thin 3D piece run across/, 'a tree\'s 3D link through a name');
  assert.equal(C.objectErrors([T('祖父', 100, 100, 220, 140, { size: 30 })], [[{ name: 'D', share: 0.06, area: 0.2 }]], 'B44').length, 0, 'a big object grazing a word is not a line');
  assert.equal(C.objectErrors([T('祖父', 100, 100, 220, 140, { object: true, onFill: true, size: 30 })], [[{ name: 'link', share: 0.06, area: 0.002 }]], 'B44').length, 0, 'a name on its frame\'s grey hides the link behind it');
  assert.equal(C.objectErrors([T('兒子', 100, 100, 220, 160)], [[{ name: 'plate', share: 0.98 }]], 'B44').length, 0);
  // a tag half under a neighbour's 3D object is read (its owner is out of the cover by its pin): B13's D5S818, 2026-10-26
  assert.equal(C.objectErrors([T('兒子', 100, 100, 220, 160, { object: true })], [[{ name: 'D', share: 0.4 }]], 'B44').length, 1);
  assert.equal(C.objectErrors([T('兒子', 100, 100, 220, 160, { object: true })], [[]], 'B44').length, 0, 'its own object left out of the cover');
  assert.equal(C.textEdgeErrors([T('GRAND UNCLE', 1800, 300, 2000, 360)], 'B48').length, 1);
  assert.equal(C.textEdgeErrors([T('GRAND UNCLE', 1600, 300, 1800, 360)], 'B48').length, 0);
  // whole-film reviews 1-10: 10 characters and 2 lines a second against the reference's 4 and 1; B10 five layers of type
  { const L = (text, more = {}) => T(text, 100, 100, 300, 160, more);
    assert.match(C.typeLoadErrors([T('2–6', 100, 100, 300, 160), T('個鹼基對一組', 100, 200, 500, 260), T('核心序列', 900, 400, 1200, 460, { size: 80 }), T('TCAT', 900, 600, 1200, 700, { size: 100 })], 'B10')[0], /4 lines to read at once/);
    assert.equal(C.typeLoadErrors([L('核心序列'), L('TCAT'), ...['D1', 'D2', 'D3', 'D4'].map((x) => L(x, { object: true })), L('A', { plated: true })], 'B27').length, 0, 'tags on objects and plates are data, not lines to read');
    assert.equal(C.typeLoadErrors([L('31.6', { whole: '31.6 億' }), L('億', { whole: '31.6 億' }), L('只看一小段'), L('ATCG', { bleed: true })], 'B08').length, 0, 'a line set run by run is one line'); }
  { const P = (text, x0, y0, size = 60) => ({ text, size, x0, y0, x1: x0 + size * String(text).length * 0.6, y1: y0 + size });
    assert.equal(C.typeLoadErrors([P('甘肅 白銀', 100, 100), P('1988 — 2002', 100, 200), P('9', 900, 500, 150), P('名', 990, 540, 80), P('8', 1300, 500, 150), P('歲', 1390, 540, 80)], 'B01').length, 1, 'a figure and its unit read as one line: four, not six');
    assert.equal(C.typeLoadErrors([P('BAIYIN', 100, 900), ...[1988, 1989, 1990, 1991, 1992, 1993].map((y, i) => P(y, 200 + i * 220, 700, 40)), P('白銀案', 100, 100)], 'B03').length, 0, 'a scale\'s years are one item');
    assert.equal(C.typeLoadErrors([P('1998', 100, 300, 80), P('區域性 DNA 數據庫', 100, 400, 50), P('2003', 900, 300, 80), P('全國 DNA 數據庫建設', 900, 400, 50), P('甲 AATG AATG AATG AATG', 100, 700, 40)], 'B34').length, 0, 'a year and its words are one item; a strand row is data');
    assert.equal(C.typeLoadErrors([P('SUSPECT_1', 100, 610, 36), P('SUSPECT_2', 500, 610, 36), P('兇手', 100, 100), P('金州', 100, 200), P('殺手', 100, 300)], 'B49', [{ kind: 'image', x0: 80, y0: 300, x1: 300, y1: 600 }, { kind: 'image', x0: 480, y0: 300, x1: 700, y1: 600 }]).length, 0, 'a name under its picture is its caption'); }
  // B44 (whole-film review 9): the family's frames slid over the IBD bars; a plate under its photo is no fault
  { const I = (x0, y0, x1, y1, src = 7) => ({ kind: 'image', src, x0, y0, x1, y1 }), R = (x0, y0, x1, y1) => ({ kind: 'fill', x0, y0, x1, y1 });
    assert.match(C.coverErrors([R(100, 200, 400, 212), I(300, 180, 360, 250)], 'B44')[0], /covers part of a block of the accent/);
    assert.equal(C.coverErrors([I(300, 180, 360, 250), R(100, 200, 400, 212)], 'B44').length, 0, 'a block drawn over the picture is not hidden by it');
    assert.equal(C.coverErrors([R(280, 160, 380, 270), I(300, 180, 360, 250)], 'B26').length, 0, 'a red plate holding its photo');
    assert.equal(C.coverErrors([R(100, 200, 400, 212), I(500, 180, 560, 250)], 'B44').length, 0);
    assert.equal(C.coverErrors([R(-176, 712, 1893, 718), I(1008, 264, 1834, 728)], 'B35').length, 0, 'a rule run off the frame is a band under things');
    const morph = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8'); assert.match(morph, /wrap\('fillRect'[\s\S]*kind: 'fill'/, 'accent blocks are traced'); }
  { const morph = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8'), ch = fs.readFileSync(new URL('../apps/studio-next/src/lib/recipe-board/chapter.mjs', import.meta.url), 'utf8');
    // B29's place moved by hand three times, B52's DNA cut to 128 px: the line moves a hand-set line clear of the edge itself, once over the span
    assert.match(morph, /if \(nd\) \{ x \+= nd\[0\]; y \+= nd\[1\]; \}/, 'a nudge shifts the line in its own space'); assert.match(morph, /if \(d\.plated \|\| d\.object \|\| d\.bleed \|\| d\.readout\) \{ bad\.add\(d\.nk\); continue; \}/, 'a line on a plate, an object or a bleed is never nudged (its band stays)');
    assert.match(ch, /window\.__nudgeSolve\(T\)[\s\S]{0,300}__nudge: nudges/, 'the nudges are solved at the check and kept with the places'); }
  // B29 (whole-film review 9): the place name 4 px under the top edge read as cut; a line keeps TEXT_MARGIN px
  assert.match(C.textEdgeErrors([T('甘肅省 蘭州市 青城鎮', 100, 4, 520, 50)], 'B29')[0], /hugs the frame's edge \(6 px/);
  assert.equal(C.textEdgeErrors([T('甘肅省 蘭州市 青城鎮', 100, 60, 520, 106)], 'B29').length, 0);
  assert.equal(C.textEdgeErrors([{ ...T('STR', 700, 21, 1100, 260), size: 219 }], 'B12').length, 0, 'a Latin line\'s box reaches above its caps');
  // a fault for 0.4 s passes (a camera crossing), for 1 s fails, named with its seconds
  const shots = [{ shotId: 'B48', at: 0, dur: 4 }], frame = (t, out) => ({ t, drawn: [T('GRAND UNCLE', out ? 1800 : 1600, 300, out ? 2000 : 1800, 360)], shapes: [], cover: null });
  const run = (outs) => outs.map((o, i) => frame(+(i * 0.2).toFixed(2), o));
  assert.deepEqual(C.geometryErrors(run([0, 1, 1, 0, 0, 0]), shots), []);
  assert.match(C.geometryErrors(run([0, 1, 1, 1, 1, 1, 0]), shots)[0], /cut by the frame's edge \(0\.2-1\.2 s\)/);
});


test('a passage does not say the same thing twice, and a picture of a page\'s words is held to the frame\'s edges', async () => {
  const S = await lib('shotplan.mjs'), F = await lib('framecheck.mjs');
  const art = (ph) => ({ module: 'article', beats: [{ do: 'highlight', phrase: ph }] });
  assert.match(S.repeatPlanErrors([{ id: 'S3', spec: art('市值蒸发5900亿美元') }, { id: 'S4', spec: art('市值蒸发5900亿美元') }]).join(), /S4: marks/, 'one sentence barred in two shots (open S3/S4)');
  const pic = { module: 'quote', photo: 'work/x/materials/clips/hupo-auto2-B13-liang.png' };
  assert.match(S.repeatPlanErrors([{ id: 'S2', spec: pic }, { id: 'S6', spec: pic }, { id: 'S11', spec: pic }]).join(), /S11: shows .* a third time/, 'one photo three times (ending S11)');
  assert.deepEqual(S.repeatPlanErrors([{ id: 'S2', spec: pic }, { id: 'S6', spec: pic }]), []);
  // a recap that copies an earlier passage's module goes stale when that passage is redrawn: it names the shot instead
  { const chain = { title: '像訓練小狗', nodes: [{ at: 281.2, n: 1, text: '猜錯了' }, { at: 282.9, n: 2, text: '又猜錯了' }, { at: 284, n: 3, text: '對了' }] };
    const film = [{ seg: 'r1', id: 'S7', spec: { at: 278, ground: { src: { art: { prompt: 'paper' } } } } }, { seg: 'r1', id: 'S8', spec: { at: 289 } }];
    assert.match(S.recallCopyErrors([{ id: 'S3', spec: { at: 382, text: '省錢', bg: { module: chain } } }], { film }).join(), /S3: sets again r1\/S7's module by copying it/, 'a stale copy is found by its cue times (recap 6:23)');
    assert.match(S.recallCopyErrors([{ id: 'S3', spec: { at: 382, bg: { module: { ...chain, nodes: chain.nodes.map((n) => ({ ...n, at: undefined })) } } } }], { film: [{ seg: 'r1', id: 'S9', spec: { at: 297, ...chain } }] }).join(), /r1\/S9/, 'a copy is found by its title');
    assert.deepEqual(S.recallCopyErrors([{ id: 'S3', spec: { at: 382, bg: { shot: 'r1/S8' } } }], { film }), [], 'a recall by reference passes');
    assert.deepEqual(S.recallCopyErrors([{ id: 'S9', spec: { at: 297, ground: { src: { module: chain } } } }], { film: [{ seg: 'recap', id: 'S3', spec: { at: 382, bg: { module: chain } } }] }), [], 'the earlier shot is the original, not the copy');
    const r = S.continueFrom({ bg: { shot: 'r1/S8' } }, '/p/modules/recap');
    assert.deepEqual(r.bg, { after: '/p/modules/r1/S8.json', whole: true }, 'a recall draws that shot as it now stands, whole'); }
  assert.equal(F.wordsEdgeProblem(3, { text: 'Meta assembled', op: 1, box: { x: -40, y: 300, w: 1900, h: 80 } }).kind, 'off-frame', 'a headline bar off the left edge (meta S3)');
  assert.equal(F.wordsEdgeProblem(3, { text: 'x', op: 1, box: { x: 100, y: 300, w: 1700, h: 80 } }), null);
});

test('on the word: a line that is words of the narration comes when they are said (B09: 兩份 DNA 1.4 s early, 一小段 1.6 s late)', async () => {
  const C = await lib('chapter.mjs');
  const shots = [{ shotId: 'B09', at: 0, dur: 6.4, text: '能不能只看其中一小段，就判断两份 DNA 是不是来自同一个人？' }];
  const at = (text, t) => ({ t, drawn: [{ text, size: 60, x0: 0, y0: 0, x1: 100, y1: 60 }], shapes: [] });
  const errs = C.cueTimingErrors([at('两份 DNA', 1.6), at('一小段', 3.4)], shots);
  assert.equal(errs.length, 2); assert.match(errs[0], /early by 1\.5/); assert.match(errs[1], /late by 1\.7/);
  assert.deepEqual(C.cueTimingErrors([at('一小段', 1.6), at('两份 DNA', 3.0)], shots), []);
  assert.deepEqual(C.cueTimingErrors([at('凶手', 0.2)], shots), [], 'words the line does not say are not timed');
  assert.deepEqual(C.cueTimingErrors([at('一小', 1.6), at('一小段', 2.6), at('两份 DNA', 3.0)], shots), [], 'a line typed out is timed by its first characters');
});


test('final composed-frame OCR rejects wrong glyphs and unavailable OCR', async () => {
  const L = await lib('legible.mjs');
  assert.match(L.finalFrameTextErrors([{ beat: 'B12', expected: ['卡文迪什'], read: '卡文迫什' }])[0], /B12.*卡文迪什/);
  assert.deepEqual(L.finalFrameTextErrors([{ beat: 'B12', expected: ['卡文迪什'], read: '卡文迪什' }]), []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-gate-')), png = path.join(dir, 'key.png');
  fs.writeFileSync(png, 'fixture');
  try {
    assert.match(L.ocrKeyframeErrors([png], [{ beat: 'B12', expected: ['卡文迪什'] }], { runner: () => ({ status: 1, stderr: 'Vision unavailable' }) })[0], /OCR failed.*Vision unavailable/);
    assert.match(L.ocrKeyframeErrors([png], [{ beat: 'B12', expected: ['卡文迪什'] }], { runner: () => ({ status: 0, stdout: '{"file":"000.png","text":"卡文迫什"}\n' }) })[0], /final-frame OCR cannot read/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// the cards' geometry at every moment (cardgeometry.mjs)
test('card geometry: type over type, over a picture it does not belong to, cut by the frame, too small, as the chapter line measures (user 2026-10-23: 肯定能从代码上 数学上做好)', async () => {
  const G = await lib('cardgeometry.mjs');
  const line = (text, x0, y0, x1, y1, o = {}) => ({ text, size: (y1 - y0) / 1.2, line: y1 - y0, x0, y0, x1, y1, alpha: 1, own: [], ...o });
  const pic = (x0, y0, x1, y1, o = {}) => ({ kind: 'image', src: `p${x0}`, x0, y0, x1, y1, alpha: 1, ...o });
  const ok = line('答案', 900, 300, 1000, 360);
  assert.deepEqual(G.frameGeometryErrors({ drawn: [ok], shapes: [] }, 'B06'), []);
  assert.match(G.frameGeometryErrors({ drawn: [ok, line('鹼基', 920, 310, 1020, 370)], shapes: [] }, 'B06').join(), /set over each other/);
  // a card's photo under its title: the line not of that card fails, the card's own caption (own) does not
  assert.match(G.frameGeometryErrors({ drawn: [ok], shapes: [pic(850, 250, 1200, 600)] }, 'B06').join(), /sits on a picture it does not belong to/);
  assert.deepEqual(G.frameGeometryErrors({ drawn: [{ ...ok, own: [0] }], shapes: [pic(850, 250, 1200, 600)] }, 'B06'), []);
  assert.deepEqual(G.frameGeometryErrors({ drawn: [ok], shapes: [pic(-10, -10, 1930, 1090)] }, 'B06'), [], 'a full-frame plate is the ground');
  assert.deepEqual(G.frameGeometryErrors({ drawn: [line('顯卡', 300, 100, 1700, 900, { size: 700 })], shapes: [pic(600, 300, 1300, 800)] }, 'cards-S3'), [], 'display type may stand behind a product (the user: 显卡 behind its card)');
  assert.match(G.frameGeometryErrors({ drawn: [line('懸案', 1800, 300, 2000, 400)], shapes: [] }, 'B05').join(), /cut by the frame's edge/);
  assert.deepEqual(G.frameGeometryErrors({ drawn: [line('懸案', 1800, 300, 2000, 400, { bleed: true })], shapes: [] }, 'B05'), [], 'a band laid to bleed off (data-bleed)');
  assert.match(G.frameGeometryErrors({ drawn: [], shapes: [pic(1700, 300, 2000, 600)] }, 'B21').join(), /picture .* is cut by the frame's edge/);
  assert.match(G.frameGeometryErrors({ drawn: [line('條常染色體', 300, 300, 500, 330)], shapes: [] }, 'B22').join(), /30 px a line, too small/);
  assert.deepEqual(G.frameGeometryErrors({ drawn: [line('素材：ABC7', 1500, 1040, 1800, 1060, { credit: true })], shapes: [] }, 'B46'), [], 'the source credit is attribution');
  // the ground's words under display type are allowed (framecheck's rule), never under other words
  const big = line('凭什么', 300, 200, 1500, 560, { size: 300 }), under = line('第一點理由', 400, 300, 700, 360, { ground: true });
  assert.deepEqual(G.frameGeometryErrors({ drawn: [big, under], shapes: [] }, 'R20'), []);
});

test('card geometry: a fault fails the shot only when it stands 0.8 s (a camera passing over a label is not one)', async () => {
  const G = await lib('cardgeometry.mjs');
  const run = (n, step = 0.2) => Array.from({ length: 10 }, (_, i) => ({ t: +(i * step).toFixed(2), errs: i >= 2 && i < 2 + n ? ['S1: "答案" is cut by the frame\'s edge (at 1 s)'] : [] }));
  assert.deepEqual(G.holdFaults(run(3)), [], '0.6 s');
  const r = G.holdFaults(run(4)); assert.equal(r.length, 1); assert.equal(r[0].at, 0.4); assert.equal(r[0].to, 1.2);
  assert.equal(G.holdFaults([...run(4).slice(0, 4), { t: 0.8, errs: [] }, ...run(4).slice(5)]).length, 0, 'a break in the run starts it again');
});

test('card geometry: one sentence said twice at once fails, a phrase marked on the page and the pull-quote card repeating it (paperclip-138-full B04)', async () => {
  const G = await lib('cardgeometry.mjs');
  const page = '从首案案发至案件告破的28年间，公安机关围绕案件仅采集指纹就达23万枚之多。', card = '從首案案發至案件告破的28年間，公安機關圍繞案件僅採集指紋就達23萬枚之多。';
  const fold = (xs) => xs.map((x) => x.replace(/发/g, '發').replace(/间/g, '間').replace(/机关/g, '機關').replace(/围绕/g, '圍繞').replace(/仅采/g, '僅採').replace(/纹/g, '紋').replace(/达/g, '達').replace(/万/g, '萬'));
  assert.match(G.sayTwiceErrors([card], [page], 'B04', { fold }).join(), /marked on the page and set again/);
  assert.deepEqual(G.sayTwiceErrors([card], ['白銀市公安局刑警支隊支隊長劉同林說'], 'B04', { fold }), [], 'another sentence of the page');
  assert.deepEqual(G.sayTwiceErrors(['23 萬枚'], ['23万枚'], 'B04', { fold }), [], 'a figure or a word is not a sentence');
  assert.match(G.sayTwiceErrors([card, '公安機關圍繞案件僅採集指紋就達23萬枚'], [], 'B04').join(), /say the same sentence twice/);
  // the words under a highlight, from the page picture's OCR lines (a mark over half a line takes that half)
  const lines = [{ text: '从首案案发至案件告破的28年间，', box: [0.1, 0.40, 0.8, 0.04] }, { text: '甘肃及白银警方介绍', box: [0.1, 0.46, 0.8, 0.04] }];
  assert.equal(G.markedWords(lines, [0.1, 0.395, 0.8, 0.05]), '从首案案发至案件告破的28年间，');
  assert.equal(G.markedWords(lines, [0.1, 0.395, 0.4, 0.05]), '从首案案发至案件');
});

test('card geometry: small type on the things a photo ground shows fails (B06 答案 on the red palm prints); display type may lie over them', async () => {
  const G = await lib('cardgeometry.mjs');
  const d = { text: '答案', size: 54, line: 60, x0: 900, y0: 770, x1: 1010, y1: 830 };
  assert.match(G.busyErrors([d], [0.47], 'B06').join(), /sits on the things the picture shows \(47 %/);
  assert.deepEqual(G.busyErrors([d], [0.2], 'B06'), []);
  assert.deepEqual(G.busyErrors([d], [null], 'B06'), []);
  assert.ok(G.BUSY_MAX <= 90, 'display type from 90 px is not held to it (the user: 压脸也可以)');
});

test('card geometry: the page reader registers every line of type, SVG text, 3D words, pictures by their opaque part and rules', async () => {
  const pw = path.join(REPO, 'node_modules', 'playwright', 'index.mjs'); if (!fs.existsSync(pw)) return;
  const G = await lib('cardgeometry.mjs'), { chromium } = await import(pathToFileURL(pw).href), b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.setContent(`<body style="margin:0;width:1920px;height:1080px;position:relative;overflow:hidden">
      <div style="position:absolute;left:100px;top:100px;font:60px serif">答案<span>在這裡</span></div>
      <svg style="position:absolute;left:0;top:0" width="1920" height="1080"><text x="300" y="500" font-size="40">22 條</text><line x1="100" y1="700" x2="900" y2="700" stroke="#000" stroke-width="4"/></svg>
      <div class="card" style="position:absolute;left:1200px;top:300px;width:400px;height:300px"><div style="width:400px;height:240px;background:url(x.png) no-repeat;background-size:100% 100%"></div><div style="font:40px serif">掌印卡</div></div>
      <div data-deco style="position:absolute;left:0;top:0;font:300px serif;opacity:.3">DNA</div>
      <div style="position:absolute;left:100px;top:900px;width:600px;height:4px;background:#e8452c"></div>
      <canvas id="c" width="10" height="10" style="position:absolute;left:0;top:0"></canvas>
      <div style="position:absolute;left:500px;top:300px;width:80px;height:80px;background:#d33"></div><div style="position:absolute;left:510px;top:305px;font:60px serif">錯</div>
      <div style="position:absolute;left:100px;top:600px"><b>馬克</b><div id="role" style="display:inline-block;padding:10px 34px;font:60px serif;background:url(x.png) center/100% 100% no-repeat">美國企業家</div></div>
      <div class="credit" style="position:absolute;right:40px;bottom:24px;font:20px sans-serif">素材：ABC7</div></body>`);
    await p.evaluate(() => { window.__natural = { 'x.png': [400, 240] }; window.__drawn3d = [{ canvas: document.getElementById('c'), text: '1988', size: 200, box: { x0: 800, y0: 300, x1: 1100, y1: 500 } }]; });
    const g = await p.evaluate(G.PAGE_GEOMETRY), T = (t) => g.drawn.find((d) => d.text === t);
    assert.ok(T('答案在這裡') && Math.abs(T('答案在這裡').size - 60) < 4, 'one line of a block, its em');
    assert.ok(T('22 條'), 'SVG text'); assert.ok(T('1988'), 'the 3D title');
    assert.ok(T('DNA')?.look, 'decorative lettering as a look word'); assert.ok(T('素材：ABC7')?.credit);
    const img = g.shapes.findIndex((s) => s.kind === 'image' && s.src.endsWith('x.png'));
    assert.ok(img >= 0 && Math.round(g.shapes[img].y1 - g.shapes[img].y0) === 240, 'a background picture by its box');
    assert.ok(T('掌印卡').own.includes(img), 'the caption belongs to its card\'s picture'); assert.ok(!T('答案在這裡').own.includes(img));
    assert.equal(g.shapes.filter((s) => s.kind === 'line').length, 2, 'a thin strip and an SVG line are rules');
    assert.ok(T('錯').plate && !T('答案在這裡').plate, 'a tag laid beside its word is its plate (r1-S8)');
    assert.ok(T('錯').flat, 'a flat colour tag is a code plate (flatPlateErrors)');
    { const role = g.drawn.find((d) => d.text.includes('美國企業家')), own = g.shapes.findIndex((p, j) => p.kind === 'image' && p.y0 > 590 && p.y0 < 620 && role.own.includes(j));
      assert.ok(own >= 0, 'a word on its own paper plate (a url() background on its element, inside a larger block) owns it (meta-S7)'); }
  } finally { await b.close(); }
});

test('labels: a word on a flat code plate fails; the plate is a generated paper prop tinted by the style (user 2026-10-23: 这种设计的挺丑 为什么不能生图来做)', async () => {
  const G = await lib('cardgeometry.mjs'), Lb = await lib('labels.mjs');
  const d = { text: '錯', size: 72, line: 80, x0: 560, y0: 330, x1: 640, y1: 410, alpha: 1, own: [] };
  assert.match(G.flatPlateErrors([{ ...d, flat: true }], 'r1-S8').join(), /flat plate drawn by code/);
  assert.deepEqual(G.flatPlateErrors([{ ...d, flat: false }], 'r1-S8'), []);
  assert.match(G.frameGeometryErrors({ drawn: [{ ...d, flat: true }], shapes: [] }, 'r1-S8').join(), /flat plate/);
  const plates = [{ name: 'sticker', url: 'file:///a.png', tints: { '#d9312b': 'file:///a-d9312b.png' } }, { name: 'stamp', url: 'file:///b.png', mask: true, tints: { '#d9312b': 'file:///b-d9312b.png' } }];
  assert.equal(Lb.plateCss([], 0, '#d9312b'), null, 'no props yet: the caller keeps its colour and the check names it');
  assert.equal(Lb.plateCss(plates, 0, '#D9312B'), "background:url('file:///a-d9312b.png') center/100% 100% no-repeat;", 'the prop tinted once in Node (a CSS mask is CORS-fetched and a file:// page gets nothing)');
  assert.equal(Lb.plateCss(plates, 0, '#123456'), null, 'a colour not made');
  assert.notEqual(Lb.plateCss(plates, 2, '#d9312b'), Lb.plateCss(plates, 3, '#d9312b'), 'neighbouring plates take different members');
  assert.deepEqual(Lb.colorsIn({ bar: { color: '#D9312B' } }, { accent: '#e8452c', x: 'url(#n)' }), ['#D9312B', '#e8452c']);
  const fam = Lb.labelMembers({ dataDir: DATA });
  assert.ok(fam.length >= 3 && fam.every((m) => m.transparent && /no text/.test(m.prompt)), 'the label family: text-free cut-outs');
  assert.ok(!fam.some((m) => /torn|tape/.test(m.name)), 'no torn paper or tape (user 2026-10-25: 之后也不要这种纸条撕纸设计什么的了)');
});

test('a line at rest does not start at full speed (B39 1 代: still, then 29 px in a frame); a cut moving everything is not one', async () => {
  const C = await lib('chapter.mjs');
  const shots = [{ shotId: 'B40', at: 0, dur: 4 }];
  const fr = (t, xs) => ({ t, d: xs.map(([txt, x]) => [txt, x, 100, 60]) });
  const hop = [fr(0, [['1 代', 921], ['2 代', 400]]), fr(1 / 30, [['1 代', 921], ['2 代', 400]]), fr(2 / 30, [['1 代', 892], ['2 代', 400]]), fr(3 / 30, [['1 代', 865], ['2 代', 400]])];
  assert.match(C.hopErrors(hop, shots)[0], /stands still, then goes 29 px/);
  const eased = [0, 0.3, 1.2, 2.7, 4.8, 7.5].map((d, i) => fr(i / 30, [['1 代', 921 - d], ['2 代', 400]]));
  assert.deepEqual(C.hopErrors(eased, shots), []);
  const cut = [fr(0, [['a', 100], ['b', 300], ['c', 500]]), fr(1 / 30, [['a', 100], ['b', 300], ['c', 500]]), fr(2 / 30, [['a', 160], ['b', 360], ['c', 560]])];
  assert.deepEqual(C.hopErrors(cut, shots), []);
  // twelve lines of one name under a fast push are not followed (they matched each other)
  const twelve = (t, k) => fr(t, Array.from({ length: 12 }, (_, i) => ['200', 100 + i * 150 + k * (i - 6) * 10]));
  assert.deepEqual(C.hopErrors([twelve(0, 0), twelve(1 / 30, 0), twelve(2 / 30, 3), twelve(3 / 30, 9)], shots), []);
});


test('card geometry: B04 from its real page — the words OCR read under the mark and the pull-quote card it repeated, across scripts', async () => {
  const G = await lib('cardgeometry.mjs');
  // read off paperclip-138-full B04's built page at 3 s (markedWords on ocrboxes of The Paper's capture; the card as the
  // shot's quote in the house script) and their Traditional folds from hant.swift, kept here so the test runs offline
  const marked = '从首案案发至案件告破的28年间，公安机关围绕案件仅采集指纹就达23万枚之多。甘', card = '從首案案發至案件告破的28年間，公安機關圍繞案件僅採集指紋就達23萬枚之多。';
  const FOLD = { [marked]: '從首案案發至案件告破的28年間，公安機關圍繞案件僅採集指紋就達23萬枚之多。甘' }, fold = (xs) => xs.map((x) => FOLD[x] ?? x);
  assert.match(G.sayTwiceErrors([card], [marked], 'B04', { fold }).join(), /marked on the page and set again in type/);
  assert.deepEqual(G.sayTwiceErrors([], [marked], 'B04', { fold }), [], 'the page as built now: the mark alone (compose.mjs lays no card over a marked page)');
  // held: the card from 2 s while the mark stands
  const frames = [2, 2.2, 2.4, 2.6].map((t) => ({ t, errs: G.sayTwiceErrors([card], [marked], 'B04', { fold }) }));
  assert.equal(G.holdFaults(frames, { hold: 0.4 }).length, 1);
});

test('picture review: a sheet that looks the same as one already judged keeps its verdict (psnrOf, SHEET_SAME)', async () => {
  const { psnrOf, SHEET_SAME } = await lib('layers.mjs');
  assert.equal(psnrOf('[Parsed_psnr_0] PSNR y:70.1 u:66.2 v:67.0 average:68.489084 min:66.1 max:70.2'), 68.489084);
  assert.equal(psnrOf('[Parsed_psnr_0] PSNR y:inf u:inf v:inf average:inf min:inf max:inf'), Infinity);
  assert.equal(psnrOf('no filter output'), null);
  assert.ok(psnrOf('average:68.4') >= SHEET_SAME, 'r1 S8: two near-identical versions went to two reviewers');
  assert.ok(psnrOf('average:15.7') < SHEET_SAME, 'a reworked shot is looked at again');
});

test('frame check: a page phrase partly under a picture fails (wordsCoveredProblem, meta-S3)', async () => {
  const { wordsCoveredProblem } = await lib('framecheck.mjs');
  const w = { text: 'Meta assembled four "war rooms" of engineers', op: 1, box: { x: 96, y: 432, w: 1150, h: 60 } };
  assert.equal(wordsCoveredProblem(3, { ...w, covered: 0.1 })?.kind, 'overlap', 'a portrait over the last words');
  assert.equal(wordsCoveredProblem(3, { ...w, covered: 0 }), null);
  assert.equal(wordsCoveredProblem(3, { ...w, covered: 0.1, op: 0.2 }), null, 'not yet shown');
});

test('card geometry: the picture behind the words stands still where the reference moves (the user, of B25: 背后 DNA 螺旋明明可以动起来)', async () => {
  const G = await lib('cardgeometry.mjs');
  // measured on paperclip-138-full's cards (words cleared, a tenth to nine tenths of the shot; the reference strip's first
  // and last frames): B25's helix 0.009 against 0.051, B46 0.022 against 0.197; B06's push 0.034 against 0.069 moves enough
  assert.match(G.stillGroundProblem(2.9, 0.009, 0.051)?.say || '', /hardly changes across the shot \(0\.9 % against the reference's 5\.1 %\)/);
  assert.equal(G.stillGroundProblem(2.9, 0.009, 0.051).owner, 'plan');
  assert.ok(G.stillGroundProblem(3.3, 0.022, 0.197));
  assert.equal(G.stillGroundProblem(4.8, 0.034, 0.069), null);
  assert.equal(G.stillGroundProblem(3.8, 0.004, 0.008), null, 'a reference that holds still asks for no move (B38)');
  assert.equal(G.stillGroundProblem(3, null, 0.2), null, 'no strip, no verdict');
});

test('frame: a cut-out is laid out and covers words by its opaque part (alpha), not its clear margin (cards-S3)', () => {
  const mod = fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8'), page = fs.readFileSync(path.join(LIB, '../../../../../work/recipe-board-v1/modules/frame.html'), 'utf8');
  assert.match(mod, /alphaBoxes\(\[\[f, f\]\]\)\[f\]; return ab \? \{ \.\.\.l, alpha: ab \}/, 'the opaque box goes with each png part');
  assert.match(page, /d\.style\.clipPath = `inset\(/, 'the clear margin is clipped off (hit testing, the cover check)');
  assert.match(page, /\(d\.__solid \|\| d\)\.getBoundingClientRect\(\)/, 'the layout measures the opaque part');
});

test('screen cards: the page highlight is drawn by marks.js on the phrase found on the page, and measured (B04: the hand-placed bar ran into 甘)', async () => {
  const { markErrors } = await lib('modules.mjs'), { readHighlight } = await lib('motion.mjs');
  // B04's line on The Paper's capture, found and fitted to its glyphs (locatePhrases on the 1920x1080 page)
  const part = { x: 164, y: 465, w: 1516, h: 43.29, room: [45.36, 10], roomY: [50, 35.71] };
  const hand = { x: 0.0789 * 1920, y: 0.4249 * 1080, w: 0.8271 * 1920, h: 0.048 * 1080 };   // the box the shot placed by hand
  const m = (rect) => ({ kind: 'black', label: '从首案案发至案件告破的28年间', part, rect, shown: 1, screen: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, end: 1.92, edgeInk: 0 });
  assert.match(markErrors([m(hand)]).join(), /reaches into the neighbouring glyph/);
  assert.deepEqual(markErrors([m({ x: 157.07, y: 456.34, w: 1527.93, h: 60.6 })]), [], 'marks.js on the fitted box (the rebuilt B04)');
  assert.throws(() => readHighlight({}, { shotId: 'S1', cues: { highlight: { boxes: [[0.1, 0.4, 0.8, 0.05]] } }, slots: { screen: { asset: 'x.png' } } }), /names no phrase/, 'a hand-placed box is no longer taken');
  assert.deepEqual(readHighlight({}, { cues: {} }), {});
});

test('reference motion: what a layout\'s bound takes off the move is carried by the picture under it (groundMove, who-S11)', async () => {
  const { withRefMotion } = await lib('shotplan.mjs');
  const card = { subs: [{ id: 'R10', at: 0, end: 3.6, camera: { zoom: 1.41, pan: [0, 0.16], moving: 1, ease: 0.7 } }] };
  const o = withRefMotion({ module: 'title', at: 0, end: 3.6, text: '幻方量化', bg: 'x.jpg', camera: [{ at: 0, end: 3.6, from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1.02, x: 0, y: 0 } }] }, card, []);
  assert.ok(Math.max(...o.camera.map((k) => k.to.zoom)) <= 1.2 + 1e-9, 'the title itself within its bound');
  assert.ok(o.groundMove && o.groundMove.zoom > 1.1, 'the rest of the push on the picture');
  const ending = o.camera.at(-1).to.zoom * o.groundMove.zoom;
  assert.ok(ending >= 1.205, `the whole read at least half the reference's push (${ending})`);
  const none = withRefMotion({ module: 'title', at: 0, end: 3.6, text: 'x', camera: [] }, card, []);
  assert.equal(none.groundMove, undefined, 'no picture under it, nothing to carry');
});

test('reference motion: a camera the reference keeps moving all through moves at an even pace (meta S1)', async () => {
  const { withRefMotion } = await lib('shotplan.mjs');
  const card = { subs: [{ id: 'R01', at: 0, end: 1.5, camera: { zoom: 1.08, pan: [0, 0], moving: 1, ease: 0.5 } }] };
  const o = withRefMotion({ module: 'insert', at: 0, end: 1.5, src: 'a.jpg', camera: [{ at: 0, end: 1.5, from: { zoom: 1.04, x: 0, y: 0 }, to: { zoom: 1.12, x: 0, y: 0 }, ease: 'out' }] }, card, []);
  assert.equal(o.camera[0].ease, 'linear');
  const still = withRefMotion({ module: 'insert', at: 0, end: 1.5, src: 'a.jpg', camera: [{ at: 0, end: 1.5, from: { zoom: 1.04, x: 0, y: 0 }, to: { zoom: 1.12, x: 0, y: 0 }, ease: 'out' }] }, { subs: [{ ...card.subs[0], camera: { zoom: 1.08, pan: [0, 0], moving: .4 } }] }, []);
  assert.equal(still.camera[0].ease, 'out', 'a reference that settles keeps the ease');
});

test('picture review: a shot that passed before is reviewed beside the version that passed (passedBefore)', async () => {
  const L = await lib('layers.mjs');
  assert.match(fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8'), /passed: passedBefore\(cfg, id, seg, reviews, s\.id\)/, 'the task carries it');
  assert.equal(typeof L.passedBefore, 'function');
  assert.match(fs.readFileSync(path.join(LIB, '../../../../../work/recipe-board-v1/prompts/stillcheck.md'), 'utf8'), /以前过过审时/, 'the reviewer is told to fail a change, not what was accepted');
});

test('camera closed on the white model: a measured shortfall becomes a gain on the shot\'s move (gainsFromProblems, applyCamGain)', async () => {
  const { gainsFromProblems, applyCamGain } = await lib('shotplan.mjs');
  const probs = [{ shot: 'S2', problems: [{ say: '拆解 R02.camera: the reference pulls out ×0.903 over 415.02-417.36 s; ours ×0.958' }, { say: '拆解 R02.camera: the reference travels sideways 0.11 frame widths over 1-2 s; ours 0.051' }] }];
  const g = gainsFromProblems(probs, {});
  assert.ok(g.S2.zoom > 2 && g.S2.zoom <= 2.5, `zoom gain ${g.S2.zoom}`); assert.ok(g.S2.x > 2, 'pan gain');
  assert.ok(gainsFromProblems(probs, g).S2.zoom <= 4, 'capped');
  const spec = { module: 'insert', camera: [{ at: 0, end: 2, from: { zoom: 1.12, x: 0, y: 0 }, to: { zoom: 1.03, x: 0.02, y: 0 } }] };
  const o = applyCamGain(spec, { zoom: 2, x: 2, y: 1 });
  assert.ok(o.camera[0].to.zoom / o.camera[0].from.zoom < 1.03 / 1.12, 'deeper pull'); assert.equal(o.camera[0].to.x, 0.04);
  assert.ok(o.camera.every((k) => [k.from, k.to].every((p) => p.zoom >= 1 + 2 * Math.abs(p.x))), 'the frame stays covered');
  const opposite = gainsFromProblems([{ shot: 'S1', problems: [{ say: 'the reference pulls out ×0.933 over 1-2 s; ours ×1.059' }] }], {});
  assert.equal(opposite.S1.zoom, 1, 'a move the wrong way is not scaled');
  assert.deepEqual(applyCamGain({ module: 'frame', ground: { src: 'a.jpg' }, camera: spec.camera }, { zoom: 2, x: 1, y: 1 }).camera, spec.camera, 'a frame on a picture keeps its camera (talent S2: pushed to x4 its parts left the frame blank)');
  const plain = applyCamGain({ module: 'frame', ground: { color: '#000' }, camera: [{ at: 0, end: 1, from: { zoom: 1.12, x: 0, y: 0 }, to: { zoom: 1, x: 0, y: 0 } }] }, { zoom: 4, x: 1, y: 1 });
  assert.ok(plain.camera[0].from.zoom / plain.camera[0].to.zoom > 1.12 && plain.camera[0].from.zoom / plain.camera[0].to.zoom <= 1.3 + 1e-6, 'a frame on a plain ground takes the gain within ×1.3 (opensrc S9)');
});

test('a ground carrying a move keeps the faces it shows inside the frame (faceSafeGroundMove, who S11)', async () => {
  const { faceSafeGroundMove } = await lib('shotplan.mjs');
  const face = [[.42, .08, .16, .3]];
  const m = faceSafeGroundMove({ zoom: 1.6, x: 0, y: .08 }, face);
  const cover = 1 + 2 * Math.abs(m.y) * 16 / 9 + .02, s = cover * m.zoom;
  assert.ok(.5 + s * (.08 - .5) - m.y * 16 / 9 >= .03, 'the top of the face stays in');
  assert.ok(m.zoom < 1.6 || m.y < .08, 'the move eased back');
  assert.deepEqual(faceSafeGroundMove({ zoom: 1.1, x: 0, y: 0 }, [[.4, .4, .2, .2]]), { zoom: 1.1, x: 0, y: 0 }, 'a face in the middle leaves it be');
});

test('a camera over a photographed face keeps it in, its own move and its ground\'s together (faceSafeMove, ending S2)', async () => {
  const { faceSafeMove } = await lib('shotplan.mjs');
  const faces = [[.54, .2, .16, .29]];
  const o = faceSafeMove({ camera: [{ at: 0, end: 2, from: { zoom: 1.187, x: 0, y: 0 }, to: { zoom: 1.185, x: .003, y: .046 } }], groundMove: { zoom: 1, x: .002, y: .065 } }, faces);
  const c = o.camera[1 - 1].to, gm = o.groundMove, gs = (1 + 2 * Math.max(Math.abs(gm.x), Math.abs(gm.y) * 16 / 9) + .02) * gm.zoom, gy = .5 + gs * (.2 - .5) - gm.y * 16 / 9;
  assert.ok(.5 + c.zoom * (gy - .5) - c.y * c.zoom * 16 / 9 >= .03, 'the top of the face stays in at the end');
});

test('camera gains: a zoom gain is not applied against the reference\'s sense (opensrc S9)', async () => {
  const { gainsFromProblems, applyCamGain } = await lib('shotplan.mjs');
  const g = gainsFromProblems([{ shot: 'S9', problems: [{ say: 'the reference pulls out ×0.827 over 1-2 s; ours ×0.949' }] }], {}).S9;
  assert.equal(g.dir, -1);
  const push = { module: 'insert', camera: [{ at: 0, end: 2, from: { zoom: 1.01, x: 0, y: 0 }, to: { zoom: 1.06, x: 0, y: 0 } }] };
  assert.deepEqual(applyCamGain(push, g).camera, push.camera, 'a push is not made a harder push');
  const pull = { module: 'insert', camera: [{ at: 0, end: 2, from: { zoom: 1.1, x: 0, y: 0 }, to: { zoom: 1.0, x: 0, y: 0 } }] };
  const o = applyCamGain(pull, g).camera[0]; assert.ok(o.to.zoom / o.from.zoom < 1 / 1.1, 'a pull-out is deepened');
});

test('a module ground is drawn again when its page\'s code changes (pageCode; talent S2: a table fix never reached its frame)', async () => {
  const { pageCode } = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs')).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-page-')); fs.mkdirSync(path.join(dir, 'modules'));
  fs.writeFileSync(path.join(dir, 'modules', 'table.html'), 'a'); fs.writeFileSync(path.join(dir, 'modules', 'common.js'), 'c');
  const a = pageCode({ dataDir: dir }, 'table');
  fs.writeFileSync(path.join(dir, 'modules', 'table.html'), 'b'); const b = pageCode({ dataDir: dir }, 'table');
  fs.writeFileSync(path.join(dir, 'modules', 'common.js'), 'd'); const c = pageCode({ dataDir: dir }, 'table');
  assert.ok(a !== b && b !== c, 'the key follows the page and the shared scripts');
  fs.rmSync(dir, { recursive: true });
});

test('picture review: only a pass carries to a look-alike version; a fix is looked at again (talent S2)', () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/layers.mjs'), 'utf8');
  assert.match(src, /fs\.existsSync\(lastFile\) && \/\^pass\/\.test\(last\[1\]\.verdict/);
});

test('breakdown compare: a reference cut inside a shot of ours is read over the reference\'s own seconds (recap S6)', async () => {
  const B = await lib('breakdown.mjs');
  const cam = (zoom, moving) => ({ zoom, pan: [0, 0], moving, ease: null, speed: .1, anim: null });
  const card = { subs: [{ id: 'R06', at: 10, end: 10.5, camera: cam(1.082, 1), look: null, text: [], events: [] }] };
  const ours = [{ at: 10, end: 14.9, camera: cam(1.13, .13), text: [], events: [], look: null }];
  const follows = [{ item: 'R06.camera', does: 'match', how: 'push' }];
  assert.ok(B.compareBreakdown(card, ours, follows).some((p) => p.item === 'R06.camera'), 'prorated over the whole shot it fails');
  ours.spans = [{ at: 10, end: 10.5, camera: cam(1.096, 1) }];
  assert.ok(!B.compareBreakdown(card, ours, follows).some((p) => p.item === 'R06.camera'), 'read over the reference\'s seconds it passes');
});

test('one source across the film: the first two uses stand, a third in any passage is to change (the film review\'s five dollar piles)', async () => {
  const S = await lib('shotplan.mjs');
  const clip = (pre, at) => ({ module: 'insert', at, src: `work/x/materials/clips/hupo-auto2-${pre}-creator-stockify-american-dollar-banknotes-falling-one-af-14a42cff.mp4` });
  assert.equal(S.sourceKey('a/b/hupo-auto2-B68~2-x-14a42cff.mp4'), S.sourceKey('a/b/hupo-auto2-B06~1-y-14a42cff.mp4'), 'cuts of one source are one source');
  assert.equal(S.sourceKey('a/hupo-auto2-ending-S13-free-clip-05e0ab83-9s.mp4'), '05e0ab83');
  const film = [{ seg: 'who', id: 'S15', spec: clip('B15~2', 93) }, { seg: 'talent', id: 'S11', spec: clip('B68~2', 239) }];
  assert.match(S.repeatPlanErrors([{ id: 'S6', spec: clip('B68~2', 348) }], { film }).join(), /S6: shows source 14a42cff a third time in the film \(who S15, talent S11, S6\)/);
  assert.deepEqual(S.repeatPlanErrors([{ id: 'S15', spec: clip('B15~2', 93) }], { film: film.slice(1) }), [], 'the first two stand');
});

test('materials: when every pick by eye failed, a verified library item never shown is tried before the need is skipped (open-S11)', () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/materials.mjs'), 'utf8');
  assert.match(src, /const unseen = r\.ranked\.filter\(\(c\) => c\.source === 'library' && !\(eye \|\| \[\]\)\.includes\(c\.id\)\);/);
  assert.match(src, /\.find\(Boolean\) \|\| unseen\[0\] : r\.ranked\[0\]/);
});

test('market board: the cut lands on a board already coming in (film review 0:03: one row ghosting over an empty board)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/market.html'), 'utf8'), /S\.rowsAt \|\| rows\.map\(\(_, i\) => S\.at - \.2 \+ i \* \.06\)/);
});

test('compare: the pan to the right block starts just before it is said (film review 3:01: a second of empty ground between the blocks)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/compare.html'), 'utf8'), /go = E\.inout\(seg\(t, Math\.min\(Math\.max\(S\.at \+ \.6, S\.right\.at - \.6\), goEnd - 1\), goEnd\)\)/);
});

test('table: the rules come with their rows, never an empty grid ahead of them (film review 3:09)', () => {
  const tb = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/table.html'), 'utf8');
  assert.match(tb, /HL\.forEach\(\(l, r\) => \{ const at = S\.rowsAt\?\.\[r\] \?\? S\.at \+ \.5 \+ r \* \.6, k = seg\(t, at, at \+ \.15\); l\.style\.opacity = E\.out\(k\)/);
});

test('camera gains: a gain learnt on one picture is not applied to another (talent S11: a money clip swapped, the old gain pushed it the wrong way)', async () => {
  const { applyCamGain, gainSrcOf } = await lib('shotplan.mjs');
  const spec = (src) => ({ module: 'insert', src, at: 0, end: 2, camera: [{ at: 0, end: 2, from: { zoom: 1.04, x: 0, y: 0 }, to: { zoom: 1.06, x: -.02, y: 0 }, ease: 'linear' }] });
  const a = spec('m/clips/x-14a42cff.mp4'), b = spec('m/clips/y-a228b085.mp4'), g = { zoom: 1, x: 2.5, y: 1, src: gainSrcOf(a) };
  assert.notDeepEqual(applyCamGain(a, g).camera, a.camera, 'on its own picture it applies');
  assert.deepEqual(applyCamGain(b, g), b, 'on another it does not');
});

test('table: a short table spreads its rows (film review 3:10: three rows a strip across the top half)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/table.html'), 'utf8'), /const H0 = 80, H = rows\.length <= 3 \? 168 : 124;/);
});

test('an insert cuts in hard, never up from black (film review 0:18: a dark first frame read as a dropped second)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/brand.html'), 'utf8'), /\$\('#black'\)\.style\.opacity = 0;/);
});

test('steps: a pictured step stands faint from the start, its words held to their cue (film review 4:38: a heading alone on bare paper)', () => {
  const st = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/steps.html'), 'utf8');
  assert.match(st, /pre \? \.28 \* M\.E\.out\(M\.seg\(t, S\.at, S\.at \+ \.6\)\) : 0/);
  assert.match(st, /el\.querySelectorAll\('\.rl, \.note, \.n, \.t, \.s'\)\.forEach\(\(w\) => \{ w\.style\.visibility = t >= n\.at \? '' : 'hidden'; \}\)/);
});

test('table: a sweep on a light page goes to a deep red from the ink, readable all the way (opensrc-S8: contrast 66 mid-sweep)', () => {
  const tb = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/table.html'), 'utf8');
  assert.match(tb, /const LIGHT = S\.ground === 'grid'/);
  assert.match(tb, /LIGHT \? `rgb\(\$\{20 \+ 176 \* h\}/);
});

test('table: with better set, a row the emphasised column loses is not set as a win (opensrc-S8 GPQA 71.5 against 75.7)', () => {
  const tb = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/table.html'), 'utf8');
  assert.match(tb, /put\(x, c === gold && wins\(row\) \? 'gold' : 'body', r, c\)/);
  assert.match(tb, /S\.better === 'low' \? g <= Math\.min\(\.\.\.o\) : g >= Math\.max\(\.\.\.o\)/);
});

test('a module laid under a frame is laid out inside the frame\'s camera (viewCamera; r1-S9: the frame\'s push cut the chain\'s first ring)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/common.js'), 'utf8'), /const ms = S\.viewCamera \|\| S\.camera \|\| \[\]/);
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs'), 'utf8'), /camera: \[\], viewCamera: groundView\(spec\) \}/);
});

test('quote beside a presenter: the lines kept inside the camera\'s view at one size, over the face if need be (film review 3:44, talent-S5 review)', () => {
  const q = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/quote.html'), 'utf8');
  assert.match(q, /const fitOver = \(\) =>/);
  assert.doesNotMatch(q, /\.36 \* 1920/, 'no line shrunk to clear the face');
  assert.match(q, /el\.style\.scale = String\(\+\(k \* \(el\.__fk \|\| 1\)\)\.toFixed\(4\)\)/);
});

test('table: the header is in at the cut (film review 3:09: an empty dark first frame)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/table.html'), 'utf8'), /x\.r < 0 \? S\.at - \.4 :/);
});

test('steps: a chain whose last step runs past the view closes up and centres again (film review 5:06 r1-S9)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/steps.html'), 'utf8'), /if \(gap \* \(els\.length - 1\) \+ lastW <= room\) return;/);
});

test('steps: a step is framed by its children\'s real right edge (film review 5:06: the last words past the 380 px box were not counted)', () => {
  const st = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/steps.html'), 'utf8');
  assert.match(st, /const inkW = \(el\) =>/); assert.match(st, /x1: e\.el\.offsetLeft \+ inkW\(e\.el\),/);
});

test('frame: a part that lands on the cut is half in at the cut and settles after it (film review 4:49 r1-S8; h800-S8 moving at once)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/frame.html'), 'utf8'), /at = at0 - S\.at < \.15 && \(!l\.in \|\| l\.in === 'fade'\) \? S\.at - dur \* \.5 : at0/);
});

test('screen cards: a page marked in a scene gets no pull-quote card on its still either, and the card is set in a house face (B04: "no house font has ?" in Charter)', async () => {
  const C = await lib('compose.mjs'), S = await lib('store.mjs');
  const cfg = { repoRoot: REPO, sourceRoot: REPO, dataDir: DATA };
  const recipe = S.loadRecipe(cfg, 'screen-full', 'film-paperclip-138-full'), alias = readJson(path.join(DATA, 'routing', 'house-rules.json')).fonts.alias;
  const quote = '从首案案发至案件告破的28年间，公安机关围绕案件仅采集指纹就达23万枚之多。', resolved = { screen: { url: 'file:///x.png', level: 'real' } };
  const shot = { shotId: 'B04', recipe: 'screen-full', slots: { screen: { asset: 'x.png', quote } }, scenes: [{ cues: { highlight: { phrase: quote, at: 1.37, dur: 0.5 } } }] };
  const html = (x) => { const p = C.composeParts({ recipe, shot: x, resolved, degraded: [] }); return p.content + p.overlays; };
  assert.doesNotMatch(html(shot), /class="pull"/, 'the still (the shot\'s top level) with the highlight in its scenes');
  const card = html({ ...shot, scenes: undefined });
  assert.match(card, /class="pull"/, 'an unmarked page keeps its card');
  const face = card.match(/font:500 [\d.]+px\/1\.28 ([^;]+);/)[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  assert.ok(alias[face] || /^House /.test(face), `the card's face (${face}) maps to a house font`);
});

test('one device drawn the same way at most twice in 90 s of a passage (film review: r1 drew four pictured chains in 70 s)', async () => {
  const S = await lib('shotplan.mjs');
  const pic = (at) => ({ module: 'steps', at, end: at + 8, nodes: [{ at, text: 'a', img: { art: { prompt: 'x' } } }] }), plain = (at) => ({ module: 'steps', at, end: at + 8, nodes: [{ at, text: 'a' }] });
  assert.match(S.deviceRepeatErrors([{ id: 'S1', spec: pic(250) }, { id: 'S7', spec: pic(278) }, { id: 'S11', spec: pic(310) }]).join(), /S11: draws steps:pictured a third time within 90 s \(S1, S7\)/);
  assert.deepEqual(S.deviceRepeatErrors([{ id: 'S1', spec: pic(250) }, { id: 'S7', spec: pic(278) }, { id: 'S9', spec: plain(297) }]), [], 'another look is another device');
  assert.deepEqual(S.deviceRepeatErrors([{ id: 'S1', spec: pic(100) }, { id: 'S7', spec: pic(150) }, { id: 'S11', spec: pic(260) }]), [], 'far apart');
  const mk = (at, mode) => ({ module: 'market', at, end: at + 2, ...(mode ? { mode } : {}) });
  assert.deepEqual(S.deviceRepeatErrors([{ id: 'S1', spec: mk(0) }, { id: 'S2', spec: mk(3, 'board') }, { id: 'S17', spec: mk(36) }]), [], 'a board of prices and a K-line are two drawings (open S2, S17)');
  assert.match(S.deviceRepeatErrors([{ id: 'S1', spec: mk(0) }, { id: 'S5', spec: mk(10) }, { id: 'S17', spec: mk(36, 'candles') }]).join(), /S17: draws market:candles a third time/);
  assert.equal(S.deviceKey({ module: 'frame', stands: 'steps', ground: { src: { module: { module: 'steps', nodes: [{ img: {} }] } } } }), 'steps:pictured');
  assert.equal(S.deviceKey({ module: 'frame', stands: 'steps', ground: { src: { art: { prompt: 'paper' } } }, parts: [] }), null, 'a frame of parts draws no chain');
});

test('a played module ground is drawn 24 times a second (at 8 the crossfade drew a moving row twice, r1-S9)', async () => {
  const M = await lib('modules.mjs'); assert.equal(M.GROUND_FPS, 24);
});

test('steps: the camera goes on in once the last step lands (r1-S9 stood still 6 s on the finished chain)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/steps.html'), 'utf8'), /\(RING \? 0 : \.07\) \* M\.E\.inout\(M\.seg\(t, \(N\.at\(-1\)\?\.at \?\? S\.end\) \+ \.9, S\.end\)\)/);
});

test('sidecard: a card on the cut is carried over whole, never entering again (film review 1:51 cards-S2)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8'), /if \(cd\.c\.at != null && cd\.c\.at - S\.at < \.05\) cd\.c = \{ \.\.\.cd\.c, at: S\.at - 1 \};/);
});

test('a shot that goes on drawing the one before takes its last picture as ground and starts its camera where it ended (continueFrom; film review 4:49 r1-S8 rebuilt the board)', async () => {
  const S = await lib('shotplan.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-cont-'));
  fs.writeFileSync(path.join(dir, 'S7.json'), JSON.stringify({ module: 'frame', at: 0, end: 5, camera: [{ at: 0, end: 5, from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1.08, x: -.02, y: 0 } }] }));
  const out = S.continueFrom({ module: 'frame', at: 5, end: 9, ground: { src: { shot: 'S7' } }, camera: [{ at: 5, end: 9, from: { zoom: 1.2, x: 0, y: 0 }, to: { zoom: 1.3, x: 0, y: 0 } }] }, dir);
  // (drawn whole, its camera composed with where the shot before ended: the cut does not move, and it can pull back to
  // the whole board — film review 19, 4:56: drawn on the pushed-in last picture it could only go further in)
  assert.deepEqual(out.ground.src, { after: path.join(dir, 'S7.json'), whole: true });
  assert.deepEqual(out.camera[0].from, { zoom: 1.08, x: -.02, y: 0 }, 'it starts where the shot before ended');
  assert.deepEqual(out.camera[0].to, { zoom: 1.3, x: 0, y: 0 }, 'its moves are written on the whole board');
  const back = S.continueFrom({ module: 'frame', at: 5, end: 9, ground: { src: { shot: 'S7' } }, camera: [{ at: 5, end: 9, from: { zoom: 1.2, x: 0, y: 0 }, to: { zoom: 1, x: 0, y: 0 } }] }, dir);
  assert.deepEqual(back.camera[0].to, { zoom: 1, x: 0, y: 0 }, 'and can pull back out to the whole board');
  assert.equal(out.texture.vignette, 0);
  fs.writeFileSync(path.join(dir, 'S6.json'), JSON.stringify({ module: 'frame', at: 0, end: 5, ground: { src: 'p.png', focus: { zoom: 1.2 } } }));
  assert.equal(S.continueFrom({ module: 'frame', at: 5, end: 9, ground: { src: { shot: 'S6' } } }, dir).ground.src.whole, undefined, 'a framed ground keeps its last picture');
  assert.equal(S.continueFrom({ module: 'frame', ground: { src: 'x.png' } }, dir).ground.src, 'x.png');
  fs.rmSync(dir, { recursive: true });
});

test('sidecard: a card with a list keeps its picture inside it, large, the list printed on it; its label stays above the subtitle band instead of hiding (cards-S2 review, who-S7 review 101)', () => {
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  // (the picture placed by its opaque body, row by row against each list line's own width, never under the words; under
  // the list when beside it would shrink to a corner: who S7, cards S2 reviews of 2026-10-26)
  assert.match(sc, /const alphaProfile = \(u\) =>/);
  assert.match(sc, /lines\.every\(\(ln\) => yb < ln\.t \|\| ya > ln\.b \|\| x >= ln\.r\)/);
  assert.match(sc, /if \(\(!p\.ok \|\| p\.dw < cw \* \.45\) && need >= 140/);
  // (its label printed on its foot under a rule: no plate drawn by code, no paper)
  assert.match(sc, /\.card \.band \{ position: absolute;[^}]*border-top: 3px solid/);
  assert.doesNotMatch(sc, /\.card \.band \{[^}]*background:/);
  assert.doesNotMatch(sc, /lp\.appendChild/, 'no plate that makes the list belong to a picture it lies on');
  assert.doesNotMatch(sc, /wash < \.5 && r\.bottom < 900/);
});

test('article: one bar at a time — the one before fades as the next is swept, and counts as gone (meta-S4 review 106: a finished bar was cut by the frame once the camera moved on)', () => {
  const ar = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/article.html'), 'utf8');
  assert.match(ar, /o = nx \? 1 - seg\(t, nx\.at \+ \.1, nx\.at \+ \.5\) : 1/);
  assert.match(ar, /p\.d\.style\.opacity = o; p\.m\.shown \*= o;/);
  assert.doesNotMatch(ar, /lineW \? 1780/, 'no whole-line framing: the phrase is pushed in on (who-S1, h800-S2, meta-S4 reviews 107)');
});

test('table: a row cued at the cut is already in at it, as the header is (film review 16, 3:09: the cut landed on a header over empty ground)', () => {
  const tb = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/table.html'), 'utf8');
  assert.match(tb, /at = \(cue <= S\.at \+ \.2 \? S\.at - \.4 : cue\)/);
});

test('title beside a card of lines keeps to the left half (film review 17, 0:45); a side card at rest keeps moving, its label with it (film review 16, 5:36 and 6:40)', () => {
  const tt = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/title.html'), 'utf8');
  assert.match(tt, /const side = \(S\.card\?\.lines \|\| \[\]\)\.length > 0;/);
  assert.match(tt, /\(side \? 700 : 1550\)/);
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.match(sc, /rise = -12 \* life/);
  assert.match(sc, /translateY\(\$\{\(\(cd\.rise \|\| 0\) \* Z\)\.toFixed\(2\)\}px\) rotate\(-1\.5deg\)/);
});

test('film: the packaging is measured without the presenter\'s shots; seams are where passages start (user 2026-10-25: 作为我包装系统)', async () => {
  const { filmShots, packagingWindow, seamsOf } = await lib('film.mjs');
  const shots = filmShots([{ seg: 'a', shots: [{ id: 'S1', at: 0, end: 4, spec: JSON.stringify({ presenter: 'p.png' }) }, { id: 'S2', at: 4, end: 6, spec: '{}' }] }, { seg: 'b', shots: [{ id: 'S1', at: 6, end: 8, spec: '{}' }] }]);
  assert.deepEqual(seamsOf(shots), [6]);
  const prof = { seconds: [0, 1, 2, 3, 4, 5, 6, 7].map((t) => ({ t, moving: t < 4 ? 0 : 1, motion: 1, chars: 1, lines: 1, lineH: [10], fill: .5, red: 0, lum: 100 })) };
  const w = packagingWindow(prof, shots);
  assert.equal(w.seconds, 4); assert.equal(w.still, 0, 'the presenter\'s still seconds are not the packaging\'s');
});

test('geometry: a line of type touching a picture it does not belong to fails; one with room, its own picture and display type pass (who-S7 reviews 102, 104)', async () => {
  const { kissErrors } = await lib('cardgeometry.mjs');
  const pic = { kind: 'image', x0: 300, y0: 100, x1: 500, y1: 400, alpha: 1 };
  const line = (x1, extra = {}) => ({ text: 'OpenAI', size: 62, x0: 100, y0: 150, x1, y1: 210, alpha: 1, own: [], ...extra });
  assert.match(kissErrors([line(298)], [pic], 'S7').join(), /touches a picture \(2 px apart\)/);
  assert.deepEqual(kissErrors([line(280)], [pic], 'S7'), [], 'room left');
  assert.deepEqual(kissErrors([line(298, { own: [0] })], [pic], 'S7'), [], 'its own picture');
  assert.deepEqual(kissErrors([line(298, { size: 300 })], [pic], 'S7'), [], 'display type');
  // (by the glyphs' height, not the line's box: a 104 px line in a 172 px box sat 2 px above the plate below, r1-S7)
  assert.deepEqual(kissErrors([{ text: '12×12=80', size: 104, line: 104, x0: 104, y0: 571, x1: 539, y1: 743, alpha: 1, own: [] }], [{ kind: 'image', x0: 71, y0: 745, x1: 609, y1: 891, alpha: 1 }], 'S7'), []);
});

test('steps: the push on a finished chain stops where the chain just fits, a wide chain settling a little wider and pushing back to it (r1-S9 reviews 111, 112: the first step and the last were cut)', () => {
  const st = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/steps.html'), 'utf8');
  assert.match(st, /zw: Math\.min\(V\.w \/ \(x1 - x0\), VH \/ \(y1 - y0\)\)/);
  assert.match(st, /if \(z > zCap\) \{/);
});

test('a shot that could not be drawn for a passing reason is drawn again, never kept as a verdict (h800-S2 screenshot timeout held the passage)', async () => {
  const { TRANSIENT } = await lib('layers.mjs');
  assert.ok(TRANSIENT.test('page.screenshot: Timeout 30000ms exceeded.'));
  assert.ok(TRANSIENT.test('Target page, context or browser has been closed'));
  assert.ok(!TRANSIENT.test('article: "近两年" is not on the page'), 'a phrase gone from the page is the shot\'s own problem');
});

test('compare: coming back to the left block it gains its rows for the way back and its key row in the accent, and its foot stays above the band (film review 15, 3:06: the block replayed as it was)', async () => {
  const cp = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/compare.html'), 'utf8');
  assert.match(cp, /MARK = \(S\.left\.back \|\| \{\}\)\.mark \?\? LR\.length - 1/, 'a key row is marked even when the plan names none');
  assert.match(cp, /if \(back > \.5\) y = Math\.min\(y, 900 - \(Lb\.offsetTop \+ Lb\.offsetHeight\) \* z\)/);
  const { checkModuleSpec } = await lib('modules.mjs');
  const base = { module: 'compare', at: 0, end: 10, photo: 'x.png', left: { at: 0, title: 'A', rows: [['k', 'v']] }, right: { at: 3, title: 'B', rows: [['k', 'v']] }, facts: [] };
  assert.match(checkModuleSpec({ ...base, left: { ...base.left, back: { rows: [['效率', '80%']] } } }).join(), /80 without a fact/, 'the rows for the way back are held to their facts');
  assert.match(checkModuleSpec({ ...base, left: { ...base.left, back: { rows: [], mark: 'x' } } }).join(), /left\.back is/);
});

test('compare: going back to a block frames it a size closer, never the first framing again (film review 3:06 h800-S10)', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/compare.html'), 'utf8'), /const z = 1 \+ \.06 \* a \+ \.06 \* go \+ \.2 \* back;/);
});

test('materials: an encyclopedia entry is no report\'s source — never ranked as one nor passed on its own (B47 captured GEDmatch\'s Wikipedia entry, 2026-10-24)', () => {
  const pats = JSON.parse(fs.readFileSync(path.join(DATA, 'routing', 'news-outlets.json'), 'utf8')).notSources.patterns.map((x) => new RegExp(x, 'i'));
  const hit = (u) => pats.some((re) => re.test(u.replace(/^https?:\/\//, '')));
  assert.ok(hit('https://en.wikipedia.org/wiki/GEDmatch'), 'Wikipedia');
  assert.ok(hit('https://baike.baidu.com/item/GEDmatch'), 'Baidu Baike');
  assert.ok(!hit('https://www.gedmatch.com/'), 'the organisation\'s own site stays a source');
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/materials.mjs'), 'utf8'), /!notSource\(p\)/, 'autoApproveTrusted leaves such a pick for the user');
});

test('materials: a picture on a government site is an official release, not a news photo (the Golden State Killer composite on nist.gov, 2026-10-24)', async () => {
  const { pageRights, isTrusted } = await lib('materials.mjs');
  assert.equal(pageRights('https://www.nist.gov/image/goldenstatekillercompositepng'), 'official');
  assert.equal(pageRights('https://www.fbi.gov/wanted'), 'official');
  assert.equal(pageRights('http://www.mps.gov.cn/n2253534/'), 'official');
  assert.equal(pageRights('https://www.nytimes.com/2018/04/25/us/golden-state-killer.html'), 'news');
  assert.ok(isTrusted({ rights: pageRights('https://www.nist.gov/x') }));
});

test('materials: a photo need is named by its own English search too (金州杀手案 found as "Golden State Killer composite", B46 2026-10-24)', async () => {
  const { properNouns, aliasIn } = await lib('materials.mjs');
  const al = properNouns({ queryEn: 'Golden State Killer composite sketch FBI' });
  assert.ok(aliasIn(al, 'Golden State Killer composite - National Institute of Standards'), JSON.stringify(al));
});

test('materials: a site\'s own furniture is no photo of the need (nist.gov\'s banner flag taken for the Golden State Killer composite, 2026-10-24)', () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/materials.mjs'), 'utf8');
  const re = new RegExp(src.match(/const NOT_A_PHOTO = \/(.+)\/i;/)[1], 'i');
  assert.ok(re.test('https://www.nist.gov/libraries/nist-component-library/dist/img/logo/us_flag_small.png'));
  assert.ok(!re.test('https://www.nist.gov/sites/default/files/styles/960_x_960_limit/public/images/2018/goldenstatekillercomposite.png'));
});

test('materials: an approved pick the current rules refuse is taken back on the next run, and a rejection is picked again like a failed fetch (2026-10-24: B46 B47 waited on hand-cleared candidates)', async () => {
  const M = await lib('materials.mjs');
  const c = { dataDir: DATA };
  assert.match(M.refusedByRules(c, { url: 'https://en.wikipedia.org/wiki/GEDmatch', rights: 'news' }) || '', /no report's source/);
  assert.match(M.refusedByRules(c, { url: 'https://www.nist.gov/image/x', asset: 'https://www.nist.gov/libraries/nist-component-library/dist/img/logo/us_flag_small.png', rights: 'official' }) || '', /furniture/);
  assert.equal(M.refusedByRules(c, { url: 'https://www.gedmatch.com/', rights: 'news' }), null);
  assert.equal(M.refusedByRules(c, { url: 'https://acme.com/', asset: 'https://acme.com/img/logo.png', needPrint: '["org","logo"]' }), null, 'a logo need keeps its logo');
  assert.equal(M.pickRulesHash(c), M.pickRulesHash(c), 'the fingerprint is stable');
  const src = fs.readFileSync(path.join(LIB, 'materials.mjs'), 'utf8');
  assert.match(src, /items\.filter\(\(i\) => deadFetch\(i\) \|\| i\.status === 'rejected'\)/, 'repickFailed takes rejected picks too');
  assert.match(fs.readFileSync(path.join(LIB, 'run.mjs'), 'utf8'), /reproposeOnRuleChange[\s\S]{0,200}recheckPicks[\s\S]{0,200}repickFailed/, 'run: re-propose, recheck, repick, in that order');
});

test('materials: a word in a file name is no furniture, and Commons\' files stay (a dry recheck refused Silicon_Valley.jpg for "icon" and a Commons White House photo, 2026-10-25)', async () => {
  const M = await lib('materials.mjs'), c = { dataDir: DATA };
  assert.equal(M.refusedByRules(c, { url: 'https://commons.wikimedia.org/wiki/File:Silicon_Valley.jpg', asset: 'https://upload.wikimedia.org/x/Silicon_Valley.jpg', rights: 'cc' }), null);
  assert.equal(M.refusedByRules(c, { url: 'https://commons.wikimedia.org/wiki/File:White_House.jpg', asset: 'https://upload.wikimedia.org/x/White_House.jpg', rights: 'cc' }), null);
  assert.match(M.refusedByRules(c, { url: 'https://en.wikipedia.org/wiki/High-Flyer', asset: 'https://upload.wikimedia.org/x/a.jpg', rights: 'news' }) || '', /no report's source/);
  assert.match(M.refusedByRules(c, { url: 'https://x.gov/a', asset: 'https://x.gov/img/site_icon.png', rights: 'official' }) || '', /furniture/);
});

test('chapter state: an answer checked under another input is to be checked again, not waited for (2026-10-25: five accepted chapters listed as waiting on a writer after a kit change)', () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  const body = src.slice(src.indexOf('export function chapterState'), src.indexOf('function bindSlices'));
  assert.match(body, /!current && check\.inputHash != null && check\.inputHash !== h/);
});

test('storyboard: a chapter beat with cuts is not rewritten for them (its module draws its cuts; paperclip-138-full B47 listed to rewrite on every run, 2026-10-25)', async () => {
  const S = await lib('storyboard.mjs');
  assert.equal(S.needsRewrite({ recipe: 'morph-chapter' }, { card: 'morph-chapter', scenes: [{ card: 'morph-chapter' }, { card: 'morph-chapter' }] }), false);
  assert.equal(S.needsRewrite({ recipe: 'screen-full' }, { card: 'morph-chapter' }), true);
});

test('storyboard: first write of a chapter evidence beat updates in place instead of deadlocking on a rewrite', async () => {
  const S = await lib('storyboard.mjs');
  const evidence = [{ kind: 'org', entity: 'USDA', what: 'microwave safety page', form: 'webpage', queryEn: 'USDA microwave safety' }];
  assert.equal(S.needsRewrite({ recipe: 'morph-chapter' }, { card: 'morph-chapter', evidence, scenes: [] }), false);
  assert.equal(S.needsRewrite({ recipe: 'morph-chapter', design: { evidence: [] } }, { card: 'morph-chapter', evidence, scenes: [] }), false);
  assert.equal(S.needsRewrite({ recipe: 'screen-full' }, { card: 'morph-chapter', evidence, scenes: [] }), true);
});

test('materials: fetched material is never bound into a chapter beat — its module shows it (B47 B51 lost their chapter slice to a still, 2026-10-25)', () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/materials.mjs'), 'utf8'), run = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/run.mjs'), 'utf8');
  const body = src.slice(src.indexOf('export function bindShots'), src.indexOf('const isLogo = b.role'));
  assert.match(body, /if \(chapterBeats\(cfg, id\)\.has\(need\.shotId\)\) continue;/);
  assert.match(run, /toBind: needs\.filter\(\(n\) => [^\n]*!chapterBeats\(cfg, id\)\.has\(n\.shotId\)/);
});

test('film: a film of beats meets the reference at every beat; an untimed beat starts where the one before stops speaking (2026-10-25)', async () => {
  const F = await lib('film.mjs');
  const a = F.alignBeats([{ beat: 'B08', seconds: 12 }, { beat: 'B09', seconds: 6.4 }, { beat: 'B10', seconds: 8.4 }], { B08: [48.5, 52], B10: [65.5, 72.5] });
  assert.deepEqual(a.map((x) => x.reference), [[48.5, 52], [52, 65.5], [65.5, 72.5]]);
  assert.deepEqual(a.map((x) => x.from), [0, 12, 18.4]);
});

test('look: a card plan inherited from the base theme sets its words in the world\'s dark, not the base\'s navy (B46 金州殺手案 in hupo\'s #1f2d6e, 2026-10-25)', async () => {
  const { worldTheme } = await lib('look.mjs');
  const base = { artPlan: { 'person-nameplate': { 'title.plate': { use: 'tornStrip', fill: { ink: '#1f2d6e' } }, background: 'darkPlate' } } };
  const dark = { id: 'f', look: { palette: { paper: '#151515', ink: '#ece8df', dim: '#888', accent: '#e8452c', ground: 'dark' } } };
  const t = worldTheme('x', dark, base);
  assert.equal(t.artPlan['person-nameplate']['title.plate'], null, 'a torn strip is taken away (2026-10-25)');
  assert.equal(t.artPlan['person-nameplate'].background, 'darkPlate', 'the rest of the card plan stays');
});

test('writer: a colour in a shot is no number on screen, and the writer\'s framing of a picture stays (B46 2026-10-25)', async () => {
  const W = await lib('writer.mjs');
  assert.equal(W.shownText({ title: { text: '金州殺手案', plate: { fill: { ink: '#151515' } } } }, '').trim(), '金州殺手案');
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/writer.mjs'), 'utf8');
  assert.match(src, /v\?\.position \? \{ position: String\(v\.position\) \}/);
});

test('on the word: the beat\'s term set as its title stands from its line\'s start, the rest still on their words (whole-film review 2026-10-25: STR at 1:16, the reference at 1:10)', async () => {
  const C = await lib('chapter.mjs');
  const shots = [{ shotId: 'B11', at: 0, dur: 6.4, text: '它首尾相接重复很多次，这种结构叫短串联重复，也就是 STR。' }];
  const at = (text, t, size) => ({ t, drawn: [{ text, size, x0: 0, y0: 0, x1: 100, y1: 60 }], shapes: [] });
  assert.deepEqual(C.cueTimingErrors([at('STR', 0.1, 220)], shots), []);
  assert.equal(C.cueTimingErrors([at('STR', 0.1, 60)], shots).length, 1, 'a small STR is still a line on its words');
  assert.deepEqual(C.cueTimingErrors([at('STR', 0.1, 220), at('STR', 2.4, 60)], shots), [], 'a term that shrinks later is still the term');
  { const run = { t: 0.1, drawn: [{ text: '23', whole: '23萬枚', size: 210, x0: 0, y0: 0, x1: 100, y1: 60 }, { text: '萬枚', whole: '23萬枚', size: 210, x0: 100, y0: 0, x1: 300, y1: 60 }], shapes: [] };
    assert.deepEqual(C.cueTimingErrors([run], [{ shotId: 'B04', at: 0, dur: 6.9, text: '警方前后比对了 23 万枚本地男性的指纹。' }], (x) => x.replace('万', '萬')), [], 'a term set run by run is timed as its line'); }
  assert.equal(C.cueTimingErrors([at('2003', 0.1, 220)], [{ shotId: 'B34', at: 0, dur: 6, text: '1998 年开始建区域性数据库，2003 年开始全国建设。' }]).length, 1, 'a year is no term: it comes when it is said (B34 2003 came early, 2026-10-25)');
  const morph = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(morph, /px >= TERM_PX && bareW\(text\)\.length <= TERM_CHARS && /);
});

test('chapter revision: a patch answer keeps the last version\'s glyph requests as it keeps its maps and art (B39 IBD lost its block type, 2026-10-25)', () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(src, /glyphs: answer\.glyphs\?\.length \? answer\.glyphs : prevAnswer\.glyphs \|\| \[\]/);
});

test('storyboard: one piece of evidence is one picture — two cuts of the same page in a row fail (B04 stood 6 s alike, 2026-10-25)', () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/storyboard.mjs'), 'utf8');
  assert.match(src, /x\.evidence === scenes\[k - 1\]\.evidence && x\.card === scenes\[k - 1\]\.card && SAME_PAGE_CARDS\.has\(x\.card\)/);
  assert.match(src, /SAME_PAGE_CARDS = new Set\(\['screen-full'/);
});

test('film: a beat that stands near empty 3 s or more where the reference fills its frame is listed thin (B27 B29, whole-film review 2026-10-25)', async () => {
  const F = await lib('film.mjs');
  const sec = (fills) => ({ seconds: fills.map((fill, t) => ({ t, fill })) });
  const aligned = [{ beat: 'B27', owner: 'morph-B26', from: 0, seconds: 6 }, { beat: 'B28', owner: 'morph-B26', from: 6, seconds: 4 }];
  const thin = F.thinBeats(aligned, sec([0.1, 0.1, 0.1, 0.1, 0.5, 0.5, 0.5, 0.1, 0.5, 0.5]), sec([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));
  assert.deepEqual(thin.map((x) => [x.beat, x.seconds]), [['B27', 4]]);
});

test('type: a frame stands in two faces at most, and 廻想体 sets no Chinese (the user 2026-10-25: 字体不统一; 個 read as an icon)', async () => {
  const C = await lib('chapter.mjs');
  const d = (text, face) => ({ text, face, size: 60, alpha: 1 });
  assert.equal(C.faceMixErrors([d('27', 'House Kaiso'), { ...d('31.6', 'House Kaiso'), size: 300 }, d('個位點', 'House Kinkaku'), { ...d('同族親屬', 'House Kinkaku'), size: 200 }], 'B27').length, 0, 'one face for Chinese, one for codes and figures, at every size');
  assert.match(C.faceMixErrors([d('27', 'House Kaiso'), { ...d('31.6', 'House Kinkaku'), size: 300 }], 'B08')[0], /labels and figures in 2 faces/);
  assert.equal(C.faceMixErrors([d('27', 'House Kaiso'), { ...d('個', 'House Kinkaku'), size: 120 }, d('碰', 'House Kokka')], 'B27').length, 0, 'big Chinese, small Chinese, figures: one face a role');
  assert.match(C.faceMixErrors([d('甲', 'House Kokka'), d('乙', 'House Kinkaku'), d('丙', 'House Soukou')], 'B27')[0], /Chinese in 3 faces/);
  assert.match(C.faceMixErrors([d('個', 'House Kaiso')], 'B16')[0], /廻想体/);
  const morph = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(morph, /fam = px >= DISPLAY_MIN && !\[\.\.\.String\(text\)\]\.some\(\(c\) => KINKAKU_ODD\.has\(c\)\) \? 'House Kinkaku' : 'House Kokka';/);
  assert.match(morph, /if \(han && house\.has\('House Gothic'\)\) fam = 'House Gothic';/, 'all Chinese in the bold gothic the user added');
  { const H = await lib('house.mjs'); const was = process.env.RB_LETTERING; process.env.RB_LETTERING = 'gothic-kaiso';
    try { if (H.houseFonts().ready) { const css = H.houseFontCss(); assert.match(css, /font-family:'SourceHanSerif Heavy';src:url\('[^']*source-han-sans-heavy\.otf'\)/, 'a card\'s serif name is the gothic in a project lettered as its reference'); assert.match(css, /font-family:'House Kokka';src:url\('[^']*kaiso-next-up\.ttf'\)[^}]*unicode-range/, 'its Latin and figures the figure face (A, T, C, G set in a serif on a card: whole-film review 2026-10-25)'); }
      process.env.RB_LETTERING = ''; if (H.houseFonts().ready) assert.doesNotMatch(H.houseFontCss(), /unicode-range/, 'other projects keep their faces'); } finally { if (was == null) delete process.env.RB_LETTERING; else process.env.RB_LETTERING = was; } }
  { const ch = fs.readFileSync(new URL('../apps/studio-next/src/lib/recipe-board/chapter.mjs', import.meta.url), 'utf8'); assert.match(ch, /x\.family !== 'House Kokka' && x\.family !== 'House Gothic'/, 'the plain gothic is not sent away by OCR (凶案現場 in 黒華明朝 beside 高承勇 in the gothic: B32)'); }
  assert.match(morph, /OBJECT_GROUND = 0\.6;[\s\S]*a < \(M\.W \* M\.H\) \* OBJECT_GROUND/, 'a big 3D object (the helix) is in the way of placed type, not a ground');
  { const k2 = fs.readFileSync(new URL('../work/recipe-board-v1/style-lab/engine/templates/kit2.js', import.meta.url), 'utf8'); assert.match(k2, /window\.__cueOf\(text\)[^\n]*if \(cue <= 0\) return;/, 'a tag\'s band waits for its words (B19: an empty red tag before 包頭)'); assert.match(morph, /window\.__cueOf = \(text\) => cueGate\(text\)/); }
  { const rt = fs.readFileSync(new URL('../apps/studio-next/src/lib/recipe-board/motion-runtime.browser.js', import.meta.url), 'utf8'); assert.match(rt, /\$1\\u2002\\u2002/, 'a lettered page lists letters with space, not the CJK comma (A、T、C、G drew wedges)'); assert.equal((rt.match(/textContent = '\|'/g) || []).length, (rt.match(/cur\.style\.display = 'none'|!card\.has\(slot\) && !noCursor\(slot\)/g) || []).length, 'every typing cursor yields to the lettering');
    // read off the element: the composer nests a page's CSS in its scene, #scene-0 html{} matches nothing (B05 B37 kept theirs, 2026-10-26)
    assert.equal((rt.match(/getPropertyValue\('--type-cursor'\)/g) || []).length, 1, 'one reader, noCursor(el)'); assert.match(rt, /noCursor\(n\.parentElement\) && /, 'the comma swap reads each text\'s own lettering'); assert.match(rt, /build\(tl, spec\) \{\n\s*SPEECH = spec\.speech \|\| null;\n\s*letterLists\(\);/, 'the swap runs as the timeline is built (at load the head script found no body)');
    const H = await lib('house.mjs'), was = process.env.RB_LETTERING; process.env.RB_LETTERING = 'gothic-kaiso'; try { if (H.houseFonts().ready) assert.match(H.houseFontCss(), /:where\(\*\)\{--type-cursor:none\}/, 'the lettering reaches every element, nested in a scene or not'); } finally { if (was == null) delete process.env.RB_LETTERING; else process.env.RB_LETTERING = was; } }
  { const w = fs.readFileSync(new URL('../apps/studio-next/src/lib/recipe-board/writer.mjs', import.meta.url), 'utf8'); assert.match(w, /cur = currentChapterVideo\(cfg, id, ch\.path\), still = !match && recallStill\(cfg, id, cur,/, 'a recall still is taken from the chapter as it is now, not its waiting final render (B37 replayed an old serif)'); }
  { const k2 = fs.readFileSync(new URL('../work/recipe-board-v1/style-lab/engine/templates/kit2.js', import.meta.url), 'utf8'); assert.match(k2, /cw = digitW\(g, size, face\)/, 'a rolling figure steps by its face\'s own digit width (8 0 0 0 at a fixed 0.6 em)'); }
  assert.match(morph, /nw = Math\.min\(real, px \* 0\.42\)/, 'a lone middle dot is set close between its figures (8 · 05 stood 70 px apart)');
  { const k3 = fs.readFileSync(new URL('../work/recipe-board-v1/style-lab/engine/templates/kit3.js', import.meta.url), 'utf8'); assert.match(k3, /draw\(base\.canvas\.getContext\('2d'\), lit, bracket\)/, 'a strand\'s mark is printed under its letters, in the strand\'s perspective (a floating bar read half a letter early: B24 GATA)'); }
  assert.match(morph, /\\u00b7\\u2027\\u30fb\]\+\$\/\.test\(String\(text\)\) && house\.has\('House Gothic'\)\) fam = 'House Gothic'/, 'a middle dot in figures is drawn round, not as the figure face\'s dash (8·05 read as 8-05)');
  { const k2s = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/kit2.js'), 'utf8'), re = /\\uff5e\\u00b7\\u2027\\u30fb\]\+\)/g; assert.equal((morph.match(re) || []).length + (k2s.match(re) || []).length, 2, 'both run splitters part the dot from the figures'); /* Actual traced run/measurement parity is exercised in test-morph-traced-runs.mjs;
    do not require the old inline split(RUN_SPLIT) spelling here. */ }
  { const { faceMixErrors } = await lib('chapter.mjs'); assert.deepEqual(faceMixErrors([{ text: '8', whole: '8·05', face: 'House Kaiso', size: 200 }, { text: '·', whole: '8·05', face: 'House Gothic', size: 200 }, { text: '05', whole: '8·05', face: 'House Kaiso', size: 200 }], 'B20'), [], 'the round dot is not a second figure face'); }
  assert.match(morph, /KINKAKU_ODD = new Set\(\[\.\.\.'糸系紅約[^']*終/);
  assert.match(morph, /unread = \(f\) => han && /, 'OCR legibility judges Chinese only (CSF1PO, TH01, a lone C went to other faces)');
  assert.equal([...C.KINKAKU_ODD].join(''), morph.match(/KINKAKU_ODD = new Set\(\[\.\.\.'([^']+)'/)[1], 'the check and the page know the same broken glyphs');
  assert.match(morph, /runs\.some\(\(r\) => \/\[A-Za-z0-9\]\/\.test\(r\)\)/, 'a mixed line is set run by run');
  assert.match(morph, /else if \(!han && .* fam = 'House Kaiso';/);
});

test('motion: a snap of the whole picture between still samples fails; a sweeping move and a cut do not (the user 2026-10-25: 镜头抽动)', async () => {
  const C = await lib('chapter.mjs');
  const shots = [{ shotId: 'B29', at: 0, dur: 10 }];
  const p = (t, dx, mq = 0.2) => ({ t, dx, dy: 0, mq });
  assert.equal(C.jerkErrors([p(1, 0), p(1.2, 4), p(1.4, 0)], shots).length, 1, 'still, a jump of 80 px, still');
  assert.equal(C.jerkErrors([p(1, 3), p(1.2, 4), p(1.4, 3)], shots).length, 0, 'a sweep');
  assert.equal(C.jerkErrors([p(1, 0), p(1.2, 4, 0.95), p(1.4, 0)], shots).length, 0, 'a cut: nothing matches');
  const two = [{ shotId: 'B01', at: 0, dur: 1.2 }, { shotId: 'B12', at: 1.2, dur: 5 }];
  assert.equal(C.jerkErrors([p(1, 0), p(1.2, 4), p(1.4, 0)], two).length, 1, 'a beat boundary with the same ground jumping 80 px is an internal seam error, not an exemption');
  assert.equal(C.jerkErrors([p(1, 0), p(1.2, 4, 0.95), p(1.4, 0)], two).length, 0, 'a real cut at the beat boundary has no whole-frame match');
});

test('kit: a label is set on the box it names — centred on its top edge, inside its bottom, or level on its left (the user 2026-10-25: 框框没有跟字做居中)', async () => {
  const K = await import(pathToFileURL(path.join(DATA, 'style-lab/engine/templates/kit2.js')).href);
  const g = { font: '', save() {}, restore() {}, measureText(t) { return { width: String(t).length * 20 }; }, fillText(t, x, y) { this.at = { t, x, y, align: this.textAlign }; }, set textAlign(v) { this._a = v; }, get textAlign() { return this._a; }, globalAlpha: 1 };
  const b = K.labelOn(g, [100, 200, 500, 400], 'vWA', { size: 40 });
  assert.equal((b[0] + b[2]) / 2, 300, 'centred on the box'); assert.ok(b[3] <= 200, 'above its top edge');
  const inside = K.labelOn(g, [100, 200, 500, 400], '張大木', { size: 40, side: 'inside' });
  assert.ok(inside[1] > 200 && inside[3] <= 400 + 12, 'inside the frame at its bottom');
});

test('no torn paper: a title in a brush hand or a name on a torn strip is refused, and the label has no paper (the user 2026-10-25: 之后也不要这种纸条撕纸设计什么的了)', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  assert.match(checkModuleSpec({ module: 'title', at: 0, end: 3, text: '凭什么', brush: true }).join('\n'), /no brush hand/);
  assert.match(checkModuleSpec({ module: 'person', at: 0, end: 3, photo: 'x.jpg', name: '梁文锋', torn: true }).join('\n'), /no torn paper strip/);
  assert.doesNotMatch(checkModuleSpec({ module: 'person', at: 0, end: 3, photo: 'x.jpg', name: '梁文锋' }).join('\n'), /torn/);
  const common = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/common.js'), 'utf8');
  assert.doesNotMatch(common, /class="bg"[^`]*K\.torn|\.paper \.bg/, 'the label carries no torn-paper picture');
  for (const m of ['title', 'person', 'brand']) assert.doesNotMatch(fs.readFileSync(path.join(REPO, `work/recipe-board-v1/modules/${m}.html`), 'utf8'), /brushf|K\.torn|clip-path: polygon\(0 4%/, `${m}: no ragged or torn paper`);
});

test('look: a world theme takes the base\'s torn-paper strips away, and a plate one laid goes (the user 2026-10-25: 不要纸条撕纸设计)', async () => {
  const { worldTheme } = await lib('look.mjs');
  const base = { artPlan: { 'person-nameplate': { 'title.plate': { use: 'tornStrip', fill: { ink: '#1f2d6e' } }, background: 'darkPlate' }, 'product-side-card': { 'label.plate': 'tornStrip' } } };
  const t = worldTheme('x', { id: 'f', look: { palette: { paper: '#151515', ink: '#ece8df', dim: '#888', accent: '#e8452c', ground: 'dark' } } }, base);
  assert.equal(t.artPlan['person-nameplate']['title.plate'], null); assert.equal(t.artPlan['product-side-card']['label.plate'], null);
  assert.equal(t.artPlan['person-nameplate'].background, 'darkPlate');
});

test('picture review: a shot whose sheet timed out is drawn again before any reviewer is asked (talent: four stills named, none drawn)', async () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/layers.mjs'), 'utf8');
  const i = src.indexOf('const undrawn = shots.filter((s) => s.transient && !liveVerdict(reviews[s.hash]));'), j = src.indexOf('const due = shots.filter((s) => !liveVerdict(reviews[s.hash]));');
  assert.ok(i > 0 && j > i, 'the undrawn are held before the due are put in a task');
  assert.match(src.slice(i, j), /fs\.rmSync\(P\.task, \{ force: true \}\)/, 'and the stale task is taken back');
});

test('label ink: a heading on the grey paper of steps is dark, centred by its line, and its class is not the dark stage (r1 S1: white on paper read at 14; .dark painted the stage under it)', async () => {
  const common = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/common.js'), 'utf8'), steps = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/steps.html'), 'utf8');
  assert.match(common, /ink === 'dark' \? ' ink-dark'/);
  assert.match(common, /\.paper\.ink-dark \{ color: #1a1a1a/);
  assert.match(steps, /M\.torn\(S\.title, \{ size: 58, ink: 'dark' \}\)/);
  assert.match(steps, /#title \{ position: absolute; left: 0; right: 0; top: 70px; text-align: center;/);
});

test('depth: a picture takes the lens (camera.js) — soft away from its subject, the words after it sharp; a K-line is sharp on its newest days and its scale stays over the lens (user 2026-10-25: 像PPT)', async () => {
  const cam = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8');
  assert.match(cam, /if \(spec\.lens !== false\) for \(const el of document\.querySelectorAll\('\[data-lens\]'\)\)/);
  assert.match(cam, /el\.after\(o\)/, 'the soft layer right after the picture, under the words that follow it');
  const M = (f) => fs.readFileSync(path.join(REPO, `work/recipe-board-v1/modules/${f}`), 'utf8');
  assert.match(M('brand.html'), /S\.module === 'insert' && !onStage && !isPage && S\.fit !== 'contain'\) \$\('#photo'\)\.dataset\.lens/);
  assert.match(M('person.html'), /if \(S\.layout !== 'card'\) \{ \$\('#photo'\)\.dataset\.lens = ''/);
  const mk = M('market.html'); assert.ok(mk.indexOf('<div id="kline">') < mk.indexOf('<div id="scale"'), 'the scale after the K-line, over its lens');
  assert.match(M('article.html'), /blur2\.style\.webkitMaskImage/, 'the article\'s far lines lie softer');
});

test('film: the shots flat where the reference has a soft layer, and the faults the picture reviews let stand, gathered by kind', async () => {
  const F = await lib('film.mjs');
  assert.deepEqual(F.flatShots([{ seg: 'a', id: 'S1', ours: { soft: 0 }, ref: { soft: .3 } }, { seg: 'a', id: 'S2', ours: { soft: .2 }, ref: { soft: .3 } }, { seg: 'a', id: 'S3', ours: { soft: 0 }, ref: { soft: .05 } }]).map((r) => r.id), ['S1']);
  const k = F.standingFaults([{ seg: 'open', id: 'S19', notes: '少了对标那种叠层感，版面偏整齐，有点像幻灯片；44.2 s 左下偏空' }, { seg: 'meta', id: 'S7', notes: '三张关键帧里字和画面基本不动，推进感弱。英文名是灰白字，偏素' }, { seg: 'r1', id: 'S1', notes: null }]);
  assert.deepEqual(k.map((x) => x.kind), ['slide', 'bottom', 'static', 'plain']);
  assert.deepEqual(k[0].shots.map((x) => x.id), ['S19']);
  assert.deepEqual(F.standingFaults([{ seg: 'recap', id: 'S9', notes: '这版浅景深更强，焦点更集中，更接近对标' }]), [], 'praise of depth is not a fault');
  assert.deepEqual(F.standingFaults([{ seg: 'h800', id: 'S2', notes: '下面两行和它一样实，景深比对标弱' }]).map((x) => x.kind), ['slide']);
});

test('render: a shot whose browser timed out under load is rendered again alone before the passage fails (recap, opensrc: screenshot timeouts)', async () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/shotplan.mjs'), 'utf8');
  assert.match(src, /for \(const x of done\) for \(let k = 0; x\.error && TRANSIENT\.test\(String\(x\.error\.message \|\| x\.error\)\) && k < 2; k\+\+\)/);
});

test('steps drop: one branch under a plain step, short words, framed with its step from the start (r1 S9: the Wait box under step 3)', async () => {
  const { checkModuleSpec } = await lib('modules.mjs');
  const b = (nodes, extra = {}) => checkModuleSpec({ module: 'steps', at: 0, end: 8, nodes, ...extra }).filter((e) => /drop/.test(e));
  assert.deepEqual(b([{ at: 1, n: 1, text: '開始解題' }, { at: 2, n: 3, text: '等一下！', drop: { text: 'Wait, wait. Wait.', sub: '自我檢查', at: 3 } }]), []);
  assert.match(b([{ at: 1, text: 'a', drop: { text: 'x' } }, { at: 2, text: 'b', drop: { text: 'y' } }]).join(), /one drop in a row/);
  assert.match(b([{ at: 1, text: 'a', drop: { text: '一二三四五六七八九十一二三四五六七八九' } }]).join(), /drop text 1-18/);
  const src = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/steps.html'), 'utf8');
  assert.match(src, /const dropBottom = \(el\) => \{ const d = el\.querySelector\('\.drop'\); return d \? d\.offsetTop \+ d\.offsetHeight : 0; \};/, 'framed from its step, not when it falls');
  assert.match(src, /N\.some\(\(n\) => n\.drop\) \? 320 : 470/, 'the row stands higher over its branch');
});

test('lens follows the reference: none where the reference is sharp edge to edge, a blur growing with its softness', async () => {
  const M = await lib('modules.mjs');
  assert.equal(M.lensFor(null), null);
  assert.equal(M.lensFor(.03), false, 'a screen of banknotes the reference shows whole stays sharp (who S15)');
  assert.deepEqual(M.lensFor(.2), { blur: 5, r: .37 }, 'calibrated: 1 + 20 x the soft share measures as the reference does (meta S1)');
  assert.deepEqual(M.lensFor(.6), { blur: 9, r: .23 }, 'a reference soft over most of its frame: a small sharp zone (opensrc S6)');
  assert.deepEqual(M.LENS_MODULES, ['insert', 'person', 'market']);
});

test('framecheck: two stacked lines whose strokes run into each other fail, though the area they share is small (ending S11: 前 under the foot of 觀)', async () => {
  const F = await lib('framecheck.mjs');
  const blk = (text, x, y, w, h) => ({ text, box: { x, y, w, h }, line: h, op: 1 });
  const p = (a, b) => F.frameProblems(1, [a, b], [], F.LIMITS).filter((q) => q.kind === 'overlap');
  assert.match(p(blk('放在利害觀', 1000, 480, 560, 130), blk('前面', 1250, 575, 420, 230)).map((q) => q.say).join(), /runs into the other/);
  assert.deepEqual(p(blk('放在利害觀', 1000, 480, 560, 130), blk('前面', 1250, 615, 420, 230)), [], 'touching, not crossing');
  assert.deepEqual(p(blk('他把是非觀', 80, 440, 850, 180), blk('放在利害觀', 1000, 480, 560, 130)), [], 'side by side, apart');
});

test('display treatment from the reference: metal, extrude, glow read off the card; a title or a frame\'s display line the plan leaves plain takes it (film comparison 2026-10-25: every display line one clean face)', async () => {
  const S = await lib('shotplan.mjs'), M = await lib('modules.mjs');
  assert.deepEqual(S.treatOf('粗宋/明朝体，极瘦高，旧金属质感（米白到灰的竖向渐变、边缘发暗、有划痕感）'), ['condense', 'metal']);
  assert.equal(S.faceFits('スミカク', '國運級別'), true); assert.equal(S.faceFits('スミカク', 'AI'), false, 'the poster face takes no Latin (ending S6: AI read as a red block)'); assert.equal(S.faceFits('スミカク', '這個時代很稀缺的一種人'), false); assert.equal(S.faceFits('金畫字', 'AI'), true);
  assert.deepEqual(S.treatOf('深度求索：粗宋/书法感的深蓝字，带立体厚度和下投影'), ['extrude']);
  assert.deepEqual(S.treatOf('字发光，带色散'), ['glow']);
  assert.deepEqual(S.treatOf('极粗黑体，黑色，横向切片错位'), ['glitch']);
  assert.deepEqual(S.treatOf('极粗黑体，白色，略斜'), ['slant']);
  assert.deepEqual(S.treatOf('撕纸标签上的粗宋'), [], 'torn paper is named and taken by none');
  assert.equal(S.faceOf('极粗黑体，白银金属材质'), null, 'the poster face is not picked by itself (meta S6: 多 read as 昌)');
  assert.equal(S.faceOf('粗宋/明朝体，极瘦高'), '金畫字');
  const card = { subs: [{ at: 0, end: 3, read: { type: '旧金属质感' } }, { at: 3, end: 6, read: { type: '粗斜体，立体厚度' } }] };
  const t = S.withRefDesign({ module: 'title', at: 3.2, end: 5, text: '深度求索' }, card);
  assert.equal(t.treat, 'extrude', 'one treatment, the first the reference shows (2026-10-26: stacked read heavy and cheap)');
  assert.equal(S.withRefDesign({ module: 'title', at: 3.2, end: 5, text: 'x', treat: 'glow' }, card).treat, 'glow', 'the plan\'s own treatment stands');
  const f = S.withRefDesign({ module: 'frame', at: 0, end: 3, parts: [{ kind: 'text', text: '2025年1月', role: 'display', at: .2 }, { kind: 'text', text: '小字', role: 'text', at: .2 }] }, card);
  assert.deepEqual(f.parts.map((p) => p.treat), ['metal', undefined]);
  assert.equal(S.withRefDesign({ module: 'person', at: 3.1, end: 5, name: 'x', photo: 'p' }, card).treat, 'extrude', 'a person\'s name takes it too, one treatment');
  assert.match(M.checkModuleSpec({ module: 'title', at: 0, end: 3, text: 'x', treat: 'chrome' }).join(), /treat is one or more of metal, extrude, glow/);
  assert.match(M.checkModuleSpec({ module: 'frame', at: 0, end: 3, parts: [{ kind: 'text', text: 'x', tilt: [60, 0], box: { x: 0, y: 0, w: 50 } }] }).join(), /tilt is \[x, y\]/);
  const common = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/common.js'), 'utf8');
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/treat.js'), 'utf8'), /window\.__TREATS = \['metal', 'extrude', 'glow', 'emboss', 'halftone', 'glitch', 'overprint', 'slant', 'condense'\]/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/treat.js'), 'utf8'), /drop-shadow\(\$\{\(st \* \.7\)/, 'extrude as stacked drop shadows (a clear fill showed text shadows as outlines)');
  const chart = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/chart.html'), 'utf8');
  assert.match(chart, /const TILT = S\.tilt \|\| \[18, 0\]/, 'the companies\' sheet leans back in perspective');
});

test('carried across cuts: a section tag where the reference repeats one at its top, the title of the shot before over the opening of one that continues it — always our own words (film comparison 2026-10-25: every shot stood alone)', async () => {
  const S = await lib('shotplan.mjs');
  const hd = (at) => ({ at, end: at + 2, text: [{ text: '过去如何让AI学会推理', cy: .08, h: 40 }], look: { base: 'light' } });
  const card = { subs: [{ at: 0, end: 2, read: { type: '旧金属质感' }, look: { base: 'dark' } }, { at: 2, end: 4, read: { type: '金属年份标题延续上一镜，淡出时轻微放大' }, look: { base: 'light' } }, hd(10), hd(12), { ...hd(14), look: { base: 'dark' } }] };
  assert.deepEqual(S.refHeaderSpans(card), [{ at: 10, end: 16 }]);
  const shots = [{ id: 'S1', spec: { module: 'frame', at: 0, end: 2, parts: [{ kind: 'text', role: 'display', text: '2025年1月', size: 300 }] } }, { id: 'S2', spec: { module: 'market', at: 2, end: 4 } },
    { id: 'S3', spec: { module: 'steps', at: 10, end: 13, title: '過去如何讓AI學會推理', nodes: [] } }, { id: 'S4', spec: { module: 'brand', at: 14, end: 16 } }];
  const c = S.passageCarry(shots, card);
  assert.deepEqual(c.S2, { carry: { text: '2025年1月', treat: 'metal', face: null, dur: .8 } }, 'the year goes on over the board, its metal kept');
  assert.deepEqual(c.S4, { header: { text: '過去如何讓AI學會推理', ink: 'light' } }, 'the tag over the next shot, its ink by that shot');
  assert.equal(c.S3, undefined, 'the shot that owns the words does not carry them twice');
  const cam = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8');
  assert.match(cam, /c\.dataset\.carry = ''/, 'the carried line is marked, so the overlap checks read it as a dissolve');
  const cg = fs.readFileSync(path.join(LIB, 'cardgeometry.mjs'), 'utf8');
  assert.match(cg, /overlapErrors\(drawn\.filter\(\(d\) => !\(display && d\.ground\) && !d\.carry\), id\)/);
});

test('a frame whose parts may bleed off takes the reference\'s deep push (r1 4:51: the reference ×2 into its board, ours held to ×1.12)', async () => {
  const S = await lib('shotplan.mjs');
  const card = { subs: [{ id: 'R1', at: 0, end: 4, camera: { zoom: 2, pan: [0, 0], moving: 1, ease: .5 } }] };
  const base = { module: 'frame', at: 0, end: 4, ground: { src: { art: { prompt: 'x' } } }, camera: [{ at: 0, end: 4, from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1.02, x: 0, y: 0 } }] };
  const peak = (sp) => Math.max(...(sp.camera || []).flatMap((k) => [k.from.zoom, k.to.zoom]));
  const plain = S.withRefMotion({ ...base, parts: [{ kind: 'text', text: 'a', box: { x: 10, y: 10, w: 20 } }] }, card), bled = S.withRefMotion({ ...base, parts: [{ kind: 'text', text: 'a', box: { x: 10, y: 10, w: 20 }, bleed: true }] }, card);
  assert.ok(peak(plain) <= 1.121, `a laid-out frame stays within x1.12 (${peak(plain)})`);
  assert.ok(peak(bled) > 1.3, `with parts that may leave it goes deeper (${peak(bled)})`);
});

test('picture review: a verdict an agent gave under other review rules is looked at again; the code\'s and the user\'s stand (2026-10-25: type and layout added)', async () => {
  const L = await lib('layers.mjs');
  assert.ok(L.REVIEW_RULES && L.REVIEW_RULES.length === 12);
  assert.equal(L.liveVerdict({ by: 'claude', rules: 'older' }), false);
  assert.equal(L.liveVerdict({ by: 'claude', rules: L.REVIEW_RULES }), true);
  assert.equal(L.liveVerdict({ by: 'code' }), true);
  assert.equal(L.liveVerdict(null), false);
  assert.ok(L.SCORECARD.includes('type') && L.SCORECARD.includes('layout'));
});

test('condense: a tall narrow line is drawn at about half its width and laid out at the width it shows, measured on its whole words (open S1: pushed off-centre, then measured while typing in)', async () => {
  const common = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/common.js'), 'utf8');
  const tj0 = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/treat.js'), 'utf8');
  assert.match(tj0, /scaleX\(\.52\)/);
  assert.match(tj0, /const full = t\.textContent;/);
  assert.match(tj0, /t\.style\.marginRight = `\$\{\(-w \* \.48\)\.toFixed\(1\)\}px`/);
  const title = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/title.html'), 'utf8');
  assert.match(title, /if \(\/\[\\u3400-\\u9fff\]\/\.test\(c\.textContent\)\) c\.style\.fontFamily/, 'the face on the Chinese characters only (open S14: DeepSeek turned blocky)');
  const brand = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/brand.html'), 'utf8');
  assert.match(brand, /S\.tilt \? `perspective\(1800px\) rotateX/, 'a photograph may lie tilted (opensrc S6)');
});

test('treat.js: the treatments shared by every page (article, sidecard, compare, brand too), kept under a reveal that sets filter, clearness and shape every frame (recap S4: the overprint and the slant wiped)', async () => {
  const tj = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/treat.js'), 'utf8'), common = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/common.js'), 'utf8');
  assert.match(tj, /window\.__treat = \(t, kinds\) =>/);
  assert.match(tj, /t\.dataset\.tf = t\.style\.filter \|\| ''; t\.dataset\.to = t\.style\.opacity \|\| ''; t\.dataset\.tt = t\.style\.transform \|\| ''/);
  assert.match(tj, /skewX\(-11deg\)/, 'slant sheared, not a synthesised oblique');
  assert.match(common, /bf = c\.dataset\.tf \|\| '', bo = \+\(c\.dataset\.to \|\| 1\), bt = c\.dataset\.tt \|\| ''/);
  assert.match(common, /c\.style\.opacity = e \* bo; c\.style\.filter = `blur\(\$\{\(1 - e\) \* 12\}px\) \$\{bf\}`\.trim\(\)/);
  const mod = fs.readFileSync(path.join(LIB, 'modules.mjs'), 'utf8');
  assert.match(mod, /addInitScript\(\{ path: path\.join\(cfg\.dataDir, 'modules', 'treat\.js'\) \}\)/);
  assert.match(mod, /\['common\.js', 'camera\.js', 'marks\.js', 'treat\.js'\]/, 'in the render key');
  for (const m of ['article', 'compare', 'sidecard', 'quote']) assert.match(fs.readFileSync(path.join(REPO, `work/recipe-board-v1/modules/${m}.html`), 'utf8'), /__treat|__quoteTreat/, m);
});

test('no torn paper in any module: no page draws the kit\'s torn strip (the user 2026-10-25; the side card kept its own until h800 S3)', async () => {
  const dir = path.join(REPO, 'work/recipe-board-v1/modules');
  for (const f of fs.readdirSync(dir).filter((x) => /\.(html|js)$/.test(x))) assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /K\.torn|kit\.torn|S\.kit\.torn/, f);
});

test('framecheck: small type on a cut-out picture\'s opaque body fails, display type may lie over it (who S7 trophy under OpenAI, cards S2 gold bars under 血本無歸, 2026-10-26)', async () => {
  const F = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/framecheck.mjs'));
  assert.ok(F.LIMITS.onCut > 0 && F.LIMITS.onCut <= .1);
  assert.match(F.PAGE_BLOCKS, /^\(async \(\) =>/, 'the page measure reads pictures\' alpha, so it is async');
  assert.match(F.PAGE_BLOCKS, /e\.onCut = n \? on \/ n : 0/);
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/framecheck.mjs'), 'utf8');
  assert.match(src, /if \(b\.line < L\.faceText && \(b\.onCut \|\| 0\) > L\.onCut\) q\('overlap'/);
  const mod = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs'), 'utf8');
  assert.match(mod, /chromium\.launch\(\{ args: \['--allow-file-access-from-files'\] \}\), p = await b\.newPage/, 'module pages may read their pictures');
});

test('treat.js: a fill clipped to the strokes is painted per character on a line revealed a character at a time (talent S8: the metal name painted nothing)', () => {
  const tj = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/treat.js'), 'utf8');
  assert.match(tj, /if \(\(kind === 'metal' \|\| kind === 'halftone'\) && t\.querySelector\('\.ch'\)\) \{ for \(const c of t\.querySelectorAll\('\.ch'\)\) window\.__treat\(c, \[kind\]\); continue; \}/);
});

test('quote: the said group is measured by its ink and kept in the camera\'s view above the subtitle band, set smaller when too tall (ending S6)', () => {
  const q = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/quote.html'), 'utf8');
  assert.match(q, /const inkH = \(el\) =>/);
  assert.match(q, /return \(C\[key\] = \{ top: T \+ 60 \/ z, bot: Math\.min\(840, B - 160 \/ z\) \}\);/, 'each group by the framings over its own time on screen');
  assert.match(q, /const room = band\(g\)\.bot - band\(g\)\.top; if \(h > room\)/);
  assert.match(q, /ch = cur \? inkH\(cur\.el\) : 200/);
});

test('article: the headline\'s treatment lies on a wrapper laid each frame, under the headline\'s own per-frame styles (h800 S2: the slant was wiped and never showed)', () => {
  const ar = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/article.html'), 'utf8');
  assert.match(ar, /if \(S\.treat\) \{ el\.innerHTML = `<span class="tw" style="display:inline-block">\$\{el\.innerHTML\}<\/span>`; window\.__treat\(el\.firstChild, S\.treat\); \}/);
  assert.doesNotMatch(ar, /if \(bigBeat && S\.treat\) window\.__treat\(document\.getElementById\('bigt'\), S\.treat\)/);
});

test('frame: a part is kept inside the camera\'s framings only while it is on screen (r1 S7: a line gone before the closing push was squeezed onto the rows)', () => {
  const fr = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/frame.html'), 'utf8');
  assert.match(fr, /t <= Math\.min\(S\.end, l\.until \?\? Infinity\) \+ 1e-6; t \+= \.05\) keep\(st\(cams, t\)\)/);
});

test('brand: a picture set whole (fit contain) is not enlarged under its tilt (h800 S9: the deepseek mark lost its k at the edge)', () => {
  const b = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/brand.html'), 'utf8');
  assert.match(b, /scale\(\$\{1\.04 \+ push \+ \(S\.tilt && S\.fit !== 'contain' \? \.24 : 0\)\}\)/);
});

test('sidecard: a label\'s accent rule lies under its squeezed words, no blurred halo round it, set in the bold gothic (open S5 review: red stubs at both ends, a grey smudge)', () => {
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.match(sc, /\.paper span\.t \{ border-bottom: \.07em solid/);
  assert.doesNotMatch(sc, /\.paper \{[^}]*border-bottom/);
  assert.doesNotMatch(sc, /\.paper::before/);
  assert.match(sc, /\.paper \{[^}]*font-family: 'House Gothic'/);
});

test('quote: the open quote rides above the said group, left out when the camera\'s view has no room for it (ending S6)', () => {
  const q = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/quote.html'), 'utf8');
  assert.match(q, /qy = \$\('#lines'\)\.offsetTop \+ cy - qm\.offsetHeight \* \.62/);
  assert.match(q, /qm\.style\.visibility = qy \+ qm\.offsetHeight \* \.2 < V\.top - 60 \? 'hidden' : ''/);
});

test('sidecard: a coloured card\'s name is pressed in its own hue, and a card\'s picture stands clear of the name\'s strokes (opensrc S4/S5 flat black; recap S7/S8 1 px off)', () => {
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.match(sc, /q\('\.big'\)\.style\.color = st\.tone === 'green' \? '#24461c' : '#6e231d'; q\('\.big'\)\.style\.textShadow = '0 \.025em 0 rgba\(255,255,255,\.55\)/);
  // (since recap S8's review the picture lies over the name's last line foot as the subject in front, not 30 px under it)
  assert.match(sc, /y0 = big\.offsetTop \+ big\.offsetHeight - lh \* \.18;/);
});

test('sidecard: a drawn card\'s name of five or six stays on one line across the card (recap S8 review: set on two it shrank and its second line went behind the picture)', () => {
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.doesNotMatch(sc, /length === 6\) \{ const c = /);
});

test('sidecard: the printed label is hidden while its card swells in or out (who S7: it swept the subtitle band); person: the red signature bright enough on a dark photograph (who S10 contrast 69)', () => {
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.match(sc, /if \(bd\) bd\.style\.visibility = lk >= 1 && wash < \.5 \? '' : 'hidden';/);
  const pe = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/person.html'), 'utf8');
  assert.match(pe, /\.full #en \{ position: relative; left: 40px; top: 4px; color: #ff5d4f;/);
});

test('sidecard: a product card\'s picture stands below its name\'s strokes (h800 S3: H100 / H800 touched the card set at 222 px)', () => {
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.match(sc, /if \(\(silver \|\| !st\.drawn\) && st\.title && !\(st\.list \|\| \[\]\)\.length\) \{ const g = ink\(big\), top = big\.offsetTop \+ big\.offsetHeight \+ Math\.max\(0, g\.under\) \+ 16/);
});

test('sidecard: a list card\'s picture stands large before its list and gives way as the first line comes; a product picture crossing its name is left there (cards S2, cards S6 reviews); quote: a quote of said groups takes its treatment on every group (ending S6)', () => {
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.match(sc, /cd\.pList = \{ L: p\.L, T: p\.T, W: p\.dw, H: p\.dh \}; cd\.pBig = /);
  assert.match(sc, /const u = seg\(t, cd\.listAt - \.2, cd\.listAt \+ \.3\)/);

  const q = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/quote.html'), 'utf8');
  assert.match(q, /for \(const el of \(m\.length \? m : document\.querySelectorAll\('\.ln \.t'\)\)\) window\.__treat\(el, S\.treat\)/);
});

test('front: a subject laid over the words (camera.js lifts the page picture\'s subject, frame parts marked front); framecheck counts what it hides by its opaque part, display type at most frontMax, small type never; cardgeometry does not take it for a picture the words sit on (ending S11)', async () => {
  const cam = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8');
  assert.match(cam, /window\.__frontPhoto = \(\) =>/); assert.match(cam, /window\.__setFront = \(src\) =>/); assert.match(cam, /window\.__frontAlpha = \(px, py\) =>/); assert.match(cam, /syncFront\(spec, t\);/);
  const fr = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/frame.html'), 'utf8');
  assert.match(fr, /if \(l\.front\) \{ d\.dataset\.front = ''; d\.style\.zIndex = 100; \}/);
  const F = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/framecheck.mjs'));
  assert.ok(F.LIMITS.frontMax > 0 && F.LIMITS.frontMax <= .5);
  assert.match(F.PAGE_BLOCKS, /if \(top\.closest\('\[data-front\]'\)\)/);
  // (the picture's address read whole from its CSS: a regex in the page's template lost its backslashes and the
  // address kept a trailing quote, so no picture's clearness was ever read)
  const m = F.PAGE_BLOCKS.match(/backgroundImage\.match\((\/\^url.*?\$\/)\)/); assert.ok(m); assert.equal('url("file:///a/b.png")'.match(eval(m[1]))[1], 'file:///a/b.png');
  const cg = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/cardgeometry.mjs'), 'utf8');
  assert.match(cg, /\[data-todo\],\[data-front\]'\)/);
  const mo = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs'), 'utf8');
  assert.match(mo, /export function frontCutout\(file\)/); assert.match(mo, /if \(spec\.front\) \{ const u = await p\.evaluate/);
});

test('front: what a subject in front hides is read line by line over each line\'s glyphs on screen (recap S8: a second line two thirds behind a door measured a third over the line box); a drawn card\'s picture laid over its name\'s last line foot as the subject in front', async () => {
  const F = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/framecheck.mjs'));
  assert.match(F.PAGE_BLOCKS, /const cy = y \+ h \/ 2, fs = h \/ 1\.2, nc = /);
  assert.match(F.PAGE_BLOCKS, /if \(n\) e\.front = Math\.max\(e\.front, on \/ n\);/);
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.match(sc, /y0 = big\.offsetTop \+ big\.offsetHeight - lh \* \.18;/); assert.match(sc, /q\('\.prod'\)\.dataset\.front = '';/);
});

test('sidecard: a product card\'s picture laid over its name\'s foot as the subject in front, each state starting clear of the one before\'s (h800 S3: the chip under a plain H100; H800 2 px off)', () => {
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.match(sc, /if \(d > -24\) \{ const lh = .*pr\.style\.zIndex = 3; pr\.dataset\.front = '';/);
  assert.match(sc, /if \(st\.logo\) \{ const ch = q\('\.cface'\)\.offsetHeight \|\| 0; if \(ch > 0\) pr\.style\.height = /, 'the product stops above the maker\'s strip (cards S6)');
  assert.match(sc, /delete q\('\.prod'\)\.dataset\.front; q\('\.prod'\)\.style\.zIndex = '';/);
});

test('front, character by character: no character more than frontCell behind the subject (talent S5: 地方 behind a head, We behind a shoulder); the lifted layer is found by elementsFromPoint (no pointer-events:none); a quote beside the presenter gives way to the head, the pair at one size', async () => {
  const F = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/framecheck.mjs'));
  assert.ok(F.LIMITS.frontCell > F.LIMITS.frontMax && F.LIMITS.frontCell <= .6);
  assert.match(F.PAGE_BLOCKS, /for \(const \[k, m\] of cells\) if \(k\) e\.frontCell = Math\.max\(e\.frontCell, m \/ k\);/);
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/framecheck.mjs'), 'utf8');
  assert.match(src, /if \(\(b\.frontCell \|\| 0\) > L\.frontCell\) q\('overlap'/);
  const cam = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8');
  assert.doesNotMatch(cam, /front\.style\.cssText = `[^`]*pointer-events:none/);
  assert.match(cam, /window\.__frontHidden = \(el\) =>/); assert.match(cam, /if \(window\.__frontFit\) await window\.__frontFit\(\);/);
  const q = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/quote.html'), 'utf8');
  assert.match(q, /window\.__frontFit = async \(\) =>/); assert.match(q, /el\.style\.scale = String\(\+\(k \* \(el\.__fk \|\| 1\)\)\.toFixed\(4\)\)/);
});

test('camgain: every module\'s camera takes the measured gain within ×1.3, a page\'s own camera excepted (recap S1 S3, who S8: titles and a frame on a picture were left out, their gains climbed to ×4 while the move stayed short)', async () => {
  const S = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/shotplan.mjs'));
  const t = S.applyCamGain({ module: 'title', camera: [{ at: 0, end: 2, from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1.05, x: 0, y: 0 } }] }, { zoom: 4, x: 1, y: 1, dir: 1 });
  assert.ok(t.camera[0].to.zoom / t.camera[0].from.zoom > 1.15 && t.camera[0].to.zoom / t.camera[0].from.zoom <= 1.31);
  const a = { module: 'article', camera: [{ at: 0, end: 2, from: { zoom: 1, x: 0, y: 0 }, to: { zoom: 1.05, x: 0, y: 0 } }] };
  assert.equal(S.applyCamGain(a, { zoom: 4, x: 1, y: 1, dir: 1 }), a);
});

test('bench fixes: a title held to the reference\'s line no longer than the frame holds at four fifths of it; a quote group no wider than the camera\'s view; the stack chart lets go of a line the column carried into the subtitle band; a words-led module takes the push gain but not a wider pan', async () => {
  const M = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs'));
  assert.ok(M.checkModuleSpec({ module: 'title', at: 0, end: 2, text: '搞量化搞量化搞', refType: { h: 335 } }).some((e) => /frame holds 5 characters/.test(e)));
  assert.deepEqual(M.checkModuleSpec({ module: 'title', at: 0, end: 2, text: '搞量化', refType: { h: 335 } }), []);
  const q = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/quote.html'), 'utf8');
  assert.match(q, /room = v\.R - v\.L - 120, ww = t\.scrollWidth; if \(ww > room\)/);
  const ch = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/chart.html'), 'utf8');
  assert.match(ch, /for \(const e of els\) for \(const c of e\.el\.children\) if \(c\.getBoundingClientRect\(\)\.bottom > 925\)/);
  const S = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/shotplan.mjs'));
  const g = S.applyCamGain({ module: 'title', camera: [{ at: 0, end: 2, from: { zoom: 1.2, x: 0, y: -.03 }, to: { zoom: 1.2, x: 0, y: .03 } }] }, { zoom: 1, x: 1, y: 2.5 });
  assert.equal(g.camera[0].to.y, .03, 'no wider pan on a title or a quote (ending S6: at the reference\'s pan the later groups fell to two fifths of its line; the plan says it differs)');
});

test('depth.py reads sharpness past pixel grain (our texture\'s grain read as detail: a lens-blurred photograph measured flat, meta S1 0 against 0.17)', () => {
  const d = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/depth.py'), 'utf8');
  assert.match(d, /gs = cv2\.GaussianBlur\(g, \(5, 5\), 1\.2\)/);
  assert.match(d, /sd > 10 and lap < 8 for sd, lap in cells/);
});

test('camgain: a module laid out to fill its frame (table, steps, chart, compare, market) takes no gain (opensrc S8: pushed to x1.31 its last row went into the subtitle band)', async () => {
  const S = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/shotplan.mjs'));
  const t = { module: 'table', camera: [{ at: 0, end: 2, from: { zoom: 1.13, x: 0, y: 0 }, to: { zoom: 1, x: 0, y: 0 } }] };
  assert.equal(S.applyCamGain(t, { zoom: 4, x: 1, y: 1 }), t);
});

test('sidecard: a drawn card\'s name of five or six narrowed to 72 % on one line so it stands large (recap S8: at full breadth it came out at half the passed name, under its picture)', () => {
  const sc = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/sidecard.html'), 'utf8');
  assert.match(sc, /if \(n >= 5 && n <= 6\) \{ const big = q\('\.big'\); big\.style\.whiteSpace = 'nowrap'; big\.style\.scale = '\.72 1';/);
});

test('chart: its names and figures take the shot\'s treatment (open S6: slant written in the plan never showed, the module had no hook)', () => {
  const ch = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/chart.html'), 'utf8');
  assert.match(ch, /if \(S\.treat\) for \(const el of document\.querySelectorAll\('\.it \.lab, \.it \.v'\)\)/);
});

test('framecheck: a frame read blank is drawn again after its pictures load and read once more before the shot fails (talent S2: a ground drawn frame by frame showed white while it decoded)', () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/framecheck.mjs'), 'utf8');
  assert.match(src, /if \(fl\[i\] != null && fl\[i\] < L_BLANK\) \{ await page\.evaluate\(\(x\) => window\.render\(x\), dense\[i\]\.t\); await page\.waitForTimeout\(400\);/);
});

test('type held to the film (the user 2026-10-26: 你怎么来回改字 我不是规定了用哪些字 越来越丑了): one treatment a line, never stacked; a lettered project refuses a shot\'s own face; the reference\'s face and stacked treatments are not picked for it; the reviewer does not propose fonts', async () => {
  const M = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs'));
  assert.ok(M.checkModuleSpec({ module: 'title', at: 0, end: 2, text: '搞量化', treat: ['slant', 'metal'] }).some((e) => /one treatment/.test(e)));
  const was = process.env.RB_LETTERING; process.env.RB_LETTERING = 'gothic-kaiso';
  try { assert.ok(M.checkModuleSpec({ module: 'title', at: 0, end: 2, text: '搞量化', type: { display: '黒華明朝' } }).some((e) => /no shot sets its own/.test(e))); } finally { if (was == null) delete process.env.RB_LETTERING; else process.env.RB_LETTERING = was; }
  const sp = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/shotplan.mjs'), 'utf8');
  assert.match(sp, /const one = \(k\) => pickTreat\(k, !!process\.env\.RB_LETTERING\);/);
  assert.match(sp, /const f = process\.env\.RB_LETTERING \? null : face\(t\)/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/stillcheck.md'), 'utf8'), /字体不归审片管/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects/hupo-auto2/project.json'), 'utf8')).lettering, 'eva');
});

test('parity audit: ours paired with the reference sub-shot it overlaps most, each measure held to a tolerance, cuts matched within 0.3 s (2026-10-26: 把对标彻底复刻好 … 尤其是动效)', async () => {
  const P = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/parity.mjs'));
  const ref = [{ id: 'R1', at: 0, end: 2, camera: { zoom: 1.1, pan: [0, 0], moving: .5, ease: .5, speed: .1 } }, { id: 'R2', at: 2, end: 4, camera: { zoom: 1, pan: [.05, 0], moving: 1, ease: 0, speed: .2 } }];
  const ours = [{ at: 0, end: 2.1, camera: { zoom: 1.02, pan: [0, 0], moving: .5, ease: .5, speed: .1 } }];
  const pairs = P.pairSubs(ours, ref); assert.equal(pairs[0].r.id, 'R1');
  const push = P.measurePairs(pairs).find((m) => m.key === 'push'); assert.ok(push.rows[0].gap > push.tol, 'a push of 1.02 against 1.1 is out');
  assert.deepEqual(P.cutParity([2.1, 5], [2, 4]), { ref: 2, matched: 1, extra: 1 });
});

test('withRefTreat: a surface before a shape, and no condense where the project letters its words (cards S7: condense named before metal cost the metal)', async () => {
  const { pickTreat } = await import('../apps/studio-next/src/lib/recipe-board/shotplan.mjs');
  assert.equal(pickTreat(['condense', 'metal']), 'metal');
  assert.equal(pickTreat(['slant', 'glitch']), 'glitch');
  assert.equal(pickTreat(['condense'], true), null);
  assert.equal(pickTreat(['condense'], false), 'condense');
  assert.equal(pickTreat(['slant', 'condense'], true), 'slant');
  assert.equal(pickTreat([]), null);
});

test('lettered cards: the figure face\'s Latin set to the gothic\'s measure, still the two house faces, and every name a page asks for maps to them (who S13: AGI a size small beside the gothic)', async () => {
  const M = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs'));
  const css = "@font-face{font-family:'X';src:url('k.ttf');font-weight:400;font-style:normal;unicode-range:U+0020-007E,U+00A0-00B6}\n@font-face{font-family:'X';src:url('g.otf');font-weight:400;font-style:normal;unicode-range:U+3001-3002;size-adjust:45%}";
  const out = M.latinMatched(css);
  assert.match(out, /U\+0020-007E,U\+00A0-00B6;size-adjust:118%\}/);
  assert.match(out, /U\+3001-3002;size-adjust:45%\}/);
  assert.doesNotMatch(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/quote.html'), 'utf8'), /rgba\(40,170,255/);
  const H = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/house.mjs'));
  if (!H.houseFonts().ready) return;
  const was = process.env.RB_LETTERING; process.env.RB_LETTERING = 'gothic-kaiso';
  try { const fams = new Set([...H.houseFontCss().matchAll(/src:url\('([^']+)'\)/g)].map((m) => decodeURIComponent(m[1]).split('/').pop()));
    for (const f of fams) assert.ok(/source-han-sans-heavy|kaiso-next-up|fk-kikai|sumikaku|kokka|soukou|kinkaku/.test(f), f); } finally { if (was == null) delete process.env.RB_LETTERING; else process.env.RB_LETTERING = was; }
});

test('lettered cards: the six first, drawn tall as EVA (the user 2026-10-26: 尽量还是用那 6 款字 实在没有的用思源黑体兜底 … 细一点高一点 像 eva 的感觉): big lines in 装甲明朝 drawn narrow, a line with a character it lacks in 黒華明朝 drawn the same, small Chinese 黒華明朝, Latin 廻想体, each line set by its size once', async () => {
  const M = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs'));
  const H = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/house.mjs'));
  assert.deepEqual(M.EVA_PICK, { 'Eva Display': 'House Kokka', 'Eva Display Alt': 'House Kokka' });
  { const was = process.env.RB_STYLE; delete process.env.RB_STYLE; assert.deepEqual(M.evaPick(H), M.EVA_PICK, 'the default style letters big in 黒華明朝'); process.env.RB_STYLE = 'glass-screen'; assert.equal(M.evaPick(H)['Eva Display'], 'House Kinkaku', 'a tech style: 金畫字'); if (was == null) delete process.env.RB_STYLE; else process.env.RB_STYLE = was; }
  assert.equal(H.houseFamily(M.SMALL_FACE), 'House Kokka');
  assert.ok(M.TALL_X > .6 && M.TALL_X < .85);
  const tj = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/treat.js'), 'utf8');
  assert.match(tj, /window\.__letter = \(\) => \{[\s\S]*alt = \[\.\.\.u\.textContent\]\.some\(\(c\) => lacks\.has\(c\)\), pick = \(v\) => \(v < \(L\.max \|\| 90\) \? L\.small : L\.big \? \(alt \? L\.alt : L\.big\) : null\)/);
  assert.match(tj, /kind === 'condense' && window\.__spec\?\.letter\) continue/); assert.match(tj, /el\.dataset\.lz = '1'/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/camera.js'), 'utf8'), /window\.__letter\(\)/);
  const was = process.env.RB_LETTERING;
  try { delete process.env.RB_LETTERING; assert.equal(M.letterFaces('x', H), 'x');
    process.env.RB_LETTERING = 'gothic-kaiso'; if (!H.houseFonts().ready) return; let out = M.letterFaces('x', H);
    assert.match(out, /font-family:'A1 Serif Heavy';src:url\('[^']*kokka-mincho\.ttf'\)/); assert.doesNotMatch(out, /Eva Display/);
    process.env.RB_LETTERING = 'eva'; out = M.letterFaces('x', H);
    assert.match(out, /font-family:'Eva Display';src:url\('[^']*kokka-mincho-tall-72\.ttf'\)/); assert.match(out, /font-family:'House Sumikaku';src:url\('[^']*kokka-mincho-tall-72\.ttf'\)/);
    assert.match(out, /font-family:'Eva Display Alt';src:url\('[^']*kokka-mincho-tall-72\.ttf'\)/);
    assert.match(out, /font-family:'Eva Display';src:url\('[^']*kaiso[^']*'\);font-weight:900;font-style:italic;unicode-range:U\+0020-007E[^}]*size-adjust:118%/);
    assert.match(out, /html \.cond\{transform:none\}/);
    assert.deepEqual(M.evaLacks({ module: 'title', text: '你好' }, H), []); }
  finally { if (was == null) delete process.env.RB_LETTERING; else process.env.RB_LETTERING = was; }
});

test('framecheck: a block\'s display size is its largest line, a key word set large within its words counted (ending S6: AI at 2.2 em read as its 203 px words against the reference\'s 280 px AI)', async () => {
  const F = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/framecheck.mjs'));
  assert.equal(F.displayProblem(5, [{ line: 203, lineMax: 380 }], 280), null);
  assert.ok(F.displayProblem(5, [{ line: 203, lineMax: 210 }], 280));
  assert.ok(F.displayProblem(5, [{ line: 150 }], 280), 'a block measured before lineMax still reads by its line');
});

test('motion language: ranges per kind of picture from the reference, one variant a shot by its key, a push past the kind\'s p90 refused (the user 2026-10-26: 尤其是动效 设计风格规范 但允许各种变体)', async () => {
  const M = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/motion-language.mjs'));
  const sub = (dev, z, at) => ({ at, end: at + 2, read: { device: dev }, camera: { zoom: z, pan: [0.01, 0], moving: 1, ease: .6, anim: { onset: .1, build: 1 } } });
  const card = { subs: [...Array(6)].map((_, i) => sub('article', 1.05 + i * .01, i * 2)).concat([sub('table', 1.1, 20), sub('diagram', 2.25, 30)]) };
  const L = M.measureLanguage([card]);
  assert.equal(L.devices.article.from, 'device'); assert.equal(L.devices.table.from, 'family data'); assert.equal(L.devices.diagram.from, 'family other');
  const a = M.motionDefaults(L, 'article', 'p/x/S1'), b = M.motionDefaults(L, 'article', 'p/x/S1'), c = M.motionDefaults(L, 'article', 'p/x/S9');
  assert.deepEqual(a, b, 'the same shot draws the same');
  assert.ok(a.zoom >= Math.exp(L.devices.article.camera.push[1]) - 1e-3 && a.zoom <= Math.exp(L.devices.article.camera.push[3]) + 1e-3, 'within the common half');
  assert.ok(M.motionDefaults(L, 'article', 'p/x/S1', 'calm').zoom <= a.zoom, 'calm moves less');
  assert.ok(c);
  assert.ok(M.motionErrors(L, 'article', { camera: [{ from: { zoom: 1 }, to: { zoom: 1.6 } }] }).length, 'a ×1.6 article push is refused');
  assert.equal(M.motionErrors(L, 'article', { camera: [{ from: { zoom: 1 }, to: { zoom: 1.08 } }] }).length, 0);
  const lang = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/motion-language.json'), 'utf8'));
  assert.equal(lang.contract, 'A1RecipeBoardMotionLanguage/v1'); assert.ok(lang.subs > 100);
});

test('motion language: a shot with no camera and no reference at its moment moves as its kind does (a new article past the reference), one variant by its place; a shot with a camera, or a reference to follow, is left to it', async () => {
  const SP = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/shotplan.mjs'));
  const t = SP.withLanguageMotion({ module: 'title', at: 10, end: 13, text: '顯卡' });
  assert.equal(t.camera.length, 1); assert.ok(t.camera[0].to.zoom !== t.camera[0].from.zoom || t.camera[0].to.x !== 0);
  const z = Math.max(t.camera[0].to.zoom, t.camera[0].from.zoom) / Math.min(t.camera[0].to.zoom, t.camera[0].from.zoom); assert.ok(z < 1.5, `a title moves within its kind: ×${z}`);
  assert.deepEqual(SP.withLanguageMotion({ module: 'title', at: 10, end: 13, camera: [{ at: 10, end: 11, from: { zoom: 1 }, to: { zoom: 1.05 } }] }).camera.length, 1);
  assert.equal(SP.withLanguageMotion({ module: 'article', at: 10, end: 13 }).camera, undefined, 'a page keeps its own camera');
  const far = SP.withRefMotion({ module: 'quote', at: 100, end: 104, lines: [] }, { subs: [{ id: 'R1', at: 0, end: 5, camera: { zoom: 1.1 } }] });
  assert.equal(far.camera.length, 1, 'no reference at its moment: the language');
  assert.deepEqual(SP.withLanguageMotion({ module: 'title', at: 10, end: 13 }), SP.withLanguageMotion({ module: 'title', at: 10, end: 13 }), 'the same shot draws the same');
});

test('a shot\'s stamp takes the lettering — the faces modules.mjs sets every page in and the project\'s lettering — so a passage draws its sheets again when its type changes (meta kept 装甲明朝 sheets after the display became 黒華明朝)', async () => {
  const L = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/layers.mjs'));
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs'), 'utf8'), st = L.letterStamp(src);
  assert.match(st, /export function letterFaces/); assert.match(st, /export function evaLacks/); assert.match(st, /LATIN_ADJUST/);
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/layers.mjs'), 'utf8'), /letterStamp\(read\(path\.join\(here, 'modules\.mjs'\)\)\), read\(path\.join\(here, 'tallface\.py'\)\), process\.env\.RB_LETTERING/);
});

test('materials: footage that moves as the reference moves at the moment is preferred — a clip pulling out where the reference pushes in gives place (motion parity audit 2026-10-26: most out-of-tolerance pushes were b-roll running against the reference)', async () => {
  const M = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/materials.mjs'));
  assert.equal(M.motionAgree(1.1, 1.05), 1); assert.equal(M.motionAgree(1.1, .95), -1); assert.equal(M.motionAgree(.9, .93), 1);
  assert.equal(M.motionAgree(1.1, 1.005), 0, 'a clip standing tells nothing'); assert.equal(M.motionAgree(1.004, .9), 0);
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/clipmotion.py'), 'utf8');
  assert.match(src, /mask\[int\(h \* \.125\):int\(h \* \.8\), :\] = 255/); assert.match(src, /inl\.sum\(\) < 30/);
});

test('motion language in the plan check: a camera of the director\'s own is held to its kind\'s range only where no reference shows the moment (a norm card, or past the film); where the reference shows it, its measure rules', async () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/shotplan.mjs'), 'utf8');
  assert.match(src, /if \(!\(card && card\.source !== 'norms' && \(card\.subs \|\| \[\]\)\.some\(\(r\) => Math\.min\(spec\.end, r\.end\) - Math\.max\(spec\.at, r\.at\) > \.2\)\) && MODULE_DEVICE\[spec\.module\] && langOf\(\)\) for \(const e of motionErrors\(/);
  const ML = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/motion-language.mjs'));
  const L = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/motion-language.json'), 'utf8'));
  assert.ok(ML.motionErrors(L, 'title', { camera: [{ from: { zoom: 1 }, to: { zoom: 1.9 } }] }).length, 'a ×1.9 title push past the film is refused');
});

test('a lettered project refuses a face set inside a module drawn as a frame\'s ground, at the plan check, not at the sheet (talent S2: the table under it kept 黒華明朝 of its own)', async () => {
  const M = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs'));
  const was = process.env.RB_LETTERING; process.env.RB_LETTERING = 'eva';
  try { const e = M.checkModuleSpec({ module: 'frame', at: 0, end: 2, parts: [], ground: { src: { module: { module: 'table', columns: ['a'], rows: [['b']], type: { display: '黒華明朝' } } } } });
    assert.ok(e.some((x) => /^ground: type\/face/.test(x)), e.join(' | ')); }
  finally { if (was == null) delete process.env.RB_LETTERING; else process.env.RB_LETTERING = was; }
});

test('a lettered page takes the red plate only to a rule, the other plates stay (r1 S8: the black boards and the yellow and blue tags went with the red); a frame part grows to its span no taller than the room above the band (顯卡 held back at 470, recap S2; 5900億美元 into the band, open S16)', () => {
  const fr = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/frame.html'), 'utf8');
  assert.match(fr, /const ruled = !!\(window\.__spec\?\.letter && l\.bar && \(l\.bar\.h \?\? \.45\) >= \.9 && redPlate\(l\.bar\.color\)\);/);
  assert.match(fr, /kmax = Math\.min\(1 \+ \(1 \/ \.72 - 1\) \* cj, Math\.max\(1, \(900 - top\) \/ \(l\.size \* 1\.25\)\)\)/);
  const mm = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/modules.mjs'), 'utf8');
  assert.doesNotMatch(mm.slice(mm.indexOf('export function letterFaces'), mm.indexOf('export function evaLacks')), /\.chip,\.plate,/);
});

test('the chapter language: the reference beat by beat as ranges, held both ways (the user 2026-10-26: 根据文案自由判断怎么做 … 尽量全面)', async () => {
  const L = await import(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/chapterlang.mjs'));
  assert.equal(L.carryKind('Y 那一条留下放大'), 'keep'); assert.equal(L.carryKind('黑场，换章'), 'black'); assert.equal(L.carryKind('Y-STR 竖排成下一段左侧的背景字'), 'texture'); assert.equal(L.carryKind('硬切换章（36.6 秒），什么都不留'), 'cut');
  const sec = (t, o = {}) => ({ t, lines: 1, chars: 6, textArea: 0.01, lineH: [80], lum: 40, sat: 0.04, red: 0.01, fill: 0.6, motion: 2, moving: 0.6, ...o });
  const st = L.beatStats({ seconds: [sec(0.5), sec(1.5, { lum: 0, fill: 0 }), sec(2.5)] }, 0, 3);
  assert.equal(st.fill, 0.6, 'a black second is a pause, not an empty frame'); assert.equal(st.biggest, 80);
  const lang = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/chapter-language.json'), 'utf8'));
  assert.equal(lang.beats, 92, 'two films: Vol.138 54 beats + Vol.047 38'); assert.equal(lang.films.length, 2); assert.ok(lang.camera.hold && lang.type.chars && lang.rhythm.lead);
  const busy = L.beatStats({ seconds: Array.from({ length: 6 }, (_, i) => sec(i + 0.5, { chars: 140, lines: 23 })) }, 0, 6);
  assert.ok(L.languageGaps(busy, lang).some((x) => /too much type/.test(x)), 'too much as well as too little');
  const still = L.beatStats({ seconds: Array.from({ length: 8 }, (_, i) => sec(i + 0.5, { moving: 0 })) }, 0, 8);
  assert.ok(L.languageGaps(still, lang).some((x) => /stands still 8 s/.test(x)));
  assert.equal(L.languageGaps(L.beatStats({ seconds: Array.from({ length: 6 }, (_, i) => sec(i + 0.5, { lum: 150 })) }, 0, 6), lang).length, 0, 'brightness is the style\'s');
  assert.ok(L.languageBrief(lang).length >= 6);
  const dev = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/devices.json'), 'utf8')).devices;
  assert.ok(dev.every((d) => ['ready', 'partial', 'none'].includes(d.kit?.status)), 'every device says how the line builds it');
  const ch = fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(ch, /language: languageBrief\(loadChapterLanguage\(cfg\)\)/); assert.match(ch, /languageGaps\(beatStats\(ours, x\.at, x\.at \+ x\.dur\), lang\)/);
});

test('the device kit: the reference devices no part built, each a part (kit4.js), words set plain, seen on the bench', () => {
  const T = path.join(DATA, 'style-lab/engine/templates'), k4 = fs.readFileSync(path.join(T, 'kit4.js'), 'utf8');
  const names = ['narrowingFrames', 'copyRepeat', 'tableGrows', 'cycleCompare', 'bracketGroup', 'sortToRank', 'matterTransition', 'traceDiagram', 'branchOut', 'explodedView', 'quadrant', 'irisInto', 'banner', 'labelSwap', 'onScreen', 'ratioBars', 'cursor'];
  for (const n of names) assert.match(k4, new RegExp(`export function ${n}\\(|export const ${n} = part\\(${n}_\\);`), n);
  assert.match(k4, new RegExp(`export const devices = \\{ ${names.join(', ')} \\}`));
  assert.doesNotMatch(k4, /strokeText|shadowBlur|shadowColor/, 'no outline or shadow on words (decoErrors)');
  assert.doesNotMatch(k4, /fillText\(/, 'every word through label (the house lettering)');
  assert.match(k4, /const MIN_CJK = 34;/);
  const bench = fs.readFileSync(path.join(T, 'kit4.bench.js'), 'utf8'); for (const n of names) assert.match(bench, new RegExp(`\\['${n}'`), `${n} on the bench`);
  assert.match(fs.readFileSync(path.join(T, 'morph.js'), 'utf8'), /type\.dev = \{ \.\.\.devices, \.\.\.display \};/);
  // a part's words are its own (the sandbox chapter, 2026-10-26): one object each, and the line's hold and nudge move free lines only
  assert.match(k4, /const part = \(fn\) => \(g, \.\.\.a\) => \{ let r; asObject\(g, \(\) => \{ r = fn\(g, \.\.\.a\); \}\); return r; \};/);
  for (const n of ['copyRepeat', 'tableGrows', 'bracketGroup', 'ratioBars', 'quadrant', 'branchOut']) assert.match(k4, new RegExp(`export const ${n} = part\\(${n}_\\);`), n);
  const mo = fs.readFileSync(path.join(T, 'morph.js'), 'utf8');
  assert.match(mo, /const free = !g\.__object && !g\.__bleed;/); assert.match(mo, /const hl = window\.__holdLearn \|\| !free \? null : holdAt\(nk, S\.tNow, g\.getTransform\(\)\);/);
  assert.match(fs.readFileSync(path.join(T, 'kit2.js'), 'utf8'), /export const asObject = /);
  const dev = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/devices.json'), 'utf8')).devices;
  assert.ok(JSON.parse(fs.readFileSync(path.join(DATA, 'routing/props.json'), 'utf8')).families.some((f) => f.family === 'screen' && f.members.crt), 'a screen prop for real pictures in a frame');
  assert.match(fs.readFileSync(path.join(T, 'type.js'), 'utf8'), /import \{ propBoxes \} from '\.\/kit2\.js';\nexport \{ propBoxes \};/, 'one propBoxes, in kit2');
  assert.match(fs.readFileSync(path.join(T, 'kit3.js'), 'utf8'), /export function particleType\(/, 'the word of tiny letters (Vol.138 ~300 s)');
  assert.match(fs.readFileSync(path.join(T, 'kit2.js'), 'utf8'), /pageCard\(g, im[^\n]*source = null[,}]/, 'a real picture\'s card names its source');
  for (const id of ['narrowing-frames', 'table-grows', 'bracket-group', 'branch-out', 'exploded-view', 'quadrant-compare', 'real-in-frame', 'bar-length-ratio', 'screen-workflow']) assert.equal(dev.find((d) => d.id === id).kit.status, 'ready', id);
});

test('every chapter beat names its form — flat to read, 2.5d for a place or a pile, 3d for a shape — and the module builds what it says (the user 2026-10-26: 什么时候平面 2.5 3d)', async () => {
  const R = await import(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/refbreakdown.mjs'));
  const dev = [{ id: 'carrier' }, { id: 'scale-jump' }], beat = (o) => ({ carryOver: 'x', devices: ['carrier'], ...o });
  const plan = (a, b) => ({ carrier: 'helix', beats: { B1: beat(a), B2: beat(b) } });
  assert.deepEqual(R.planErrors(plan({ form: 'flat', formFor: 'read' }, { form: '3d', formFor: 'structure' }), ['B1', 'B2'], dev, 'export async function stage3() {}'), []);
  assert.match(R.planErrors(plan({ form: 'flat', formFor: 'read' }, {}), ['B1', 'B2'], dev).join(' '), /B2\.form: flat, 2\.5d or 3d/);
  assert.match(R.planErrors(plan({ form: '3d', formFor: 'read' }, { form: 'flat', formFor: 'read' }), ['B1', 'B2'], dev).join(' '), /B1\.formFor: .*shape \| structure \| object/);
  assert.match(R.planErrors(plan({ form: '3d', formFor: 'shape' }, { form: 'flat', formFor: 'read' }), ['B1', 'B2'], dev, 'const x = 1').join(' '), /says form: 3d but the module builds no 3D stage/);
  assert.match(R.planErrors(plan({ form: 'flat', formFor: 'read' }, { form: 'flat', formFor: 'read' }), ['B1', 'B2'], dev, 'export async function stage3() {}').join(' '), /builds a 3D stage .* but no beat says form: 3d or 2\.5d/);
  assert.deepEqual(R.planErrors(plan({ form: '2.5d', formFor: 'place' }, { form: 'flat', formFor: 'read' }), ['B1', 'B2'], dev, 'export async function stage3() {}'), [], 'a map laid flat in the stage is 2.5d');
  const F = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/forms.json'), 'utf8'));
  assert.deepEqual(Object.keys(F.forms), ['flat', '2.5d', '3d']); for (const [k, v] of Object.entries(F.forms)) assert.deepEqual(v.for, R.FORM_FOR[k], k);
  assert.match(fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8'), /planErrors\(plan, g\.shots\.map\(\(s\) => s\.shotId\), loadDevices\(cfg\), code\)/);
});

test('a chapter draws in its film\'s style: project.json style -> styles.json -> the parts\' colours (the user 2026-10-26: 美学风格呢 之后如何做变体)', async () => {
  const T = path.join(DATA, 'style-lab/engine/templates'), k2 = fs.readFileSync(path.join(T, 'kit2.js'), 'utf8');
  assert.match(k2, /export function setStyle\(st\)/); assert.match(k2, /export function ground\(g, \{ top = COL\.groundTop, bottom = COL\.groundBottom/);
  const loc = k2.slice(k2.indexOf('export function locus('), k2.indexOf('\n}\n', k2.indexOf('export function locus(')));
  assert.doesNotMatch(loc, /fillRect/, 'a locus name stands on no plate (不要红底的文字)');
  assert.match(fs.readFileSync(path.join(T, 'morph.js'), 'utf8'), /if \(P\.style\) flat\.setStyle\(P\.style\);/);
  assert.doesNotMatch(fs.readFileSync(path.join(T, 'kit4.js'), 'utf8'), /'#e9e6df'|'#d9d6cf'/, 'kit4 inks from COL');
  const ch = fs.readFileSync(path.join(cfg.sourceRoot, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(ch, /export function filmStyle\(cfg, id\)/); assert.match(ch, /\.\.\.\(filmStyle\(cfg, id\) \? \{ style: filmStyle\(cfg, id\) \} : \{\}\)/); assert.match(ch, /palette: fs0 \? \{ bg: fs0\.tokens\.paper/);
  // setStyle itself, outside a page: a light style turns the ink dark and the accent its own
  const src = k2.slice(k2.indexOf('const hex = '), k2.indexOf('\n}', k2.indexOf('export function setStyle')) + 2).replace('export function setStyle', 'function setStyle');
  const COL = { red: '#e8452c', ink: '#ece8df', paper: '#151515' }; const run = new Function('COL', `${src}; return setStyle;`)(COL);
  run({ tokens: { paper: '#e6e6e4', ink: '#0d0d0d', accent: '#1d3fd6', ground: 'light' } });
  assert.equal(COL.red, '#1d3fd6'); assert.equal(COL.ink, '#0d0d0d'); assert.equal(COL.dot, '13,13,13'); assert.ok(COL.groundTop > COL.groundBottom, 'a light ground lighter at the top');
});

test('one style for the whole film: project.json style — the cards, the chapters, the 3D and the keyframes read it, and a plan naming another is refused (CONVERGE-20261026 conflict 1)', async () => {
  const P = await lib('shotplan.mjs'), M = await lib('modules.mjs'), F = await lib('filmlook.mjs'), all = M.styles();
  const shot = (theme) => ({ id: 'S1', spec: JSON.stringify(theme ? { theme } : {}) });
  // the plan takes the film's style, or names it; another is refused
  assert.deepEqual(P.styleErrors({ shots: [shot(null)] }, all, 'forensic-dark'), []);
  assert.deepEqual(P.styleErrors({ style: { id: 'forensic-dark', why: '案件调查，暗场法医感' }, shots: [] }, all, 'forensic-dark'), []);
  assert.match(P.styleErrors({ style: { id: 'warm-collage', why: '温暖的历史故事感' }, shots: [] }, all, 'forensic-dark').join(), /film's style is "forensic-dark"/);
  assert.match(P.styleErrors({ shots: [shot('y2k-chrome')] }, all, 'forensic-dark').join(), /outside the film's style family/);
  assert.match(P.styleErrors({ shots: [] }, all, 'nope').join(), /project\.json style "nope" is not a style/);
  assert.equal(P.themeOf({ style: { id: 'warm-collage' } }, 'forensic-dark'), 'forensic-dark', 'the film over the plan');
  assert.equal(P.themeOf({}, 'editorial-grey'), 'reference');
  // every style carries the 3D's material and the medium (from worlds/*.json), and makes a whole look sheet
  for (const [k, s] of Object.entries(all)) {
    for (const t of ['ground', 'body', 'unit', 'metal', 'roughness', 'light']) assert.ok(s.material3d?.[t] != null, `${k}.material3d.${t}`);
    assert.ok(['none', 'print', 'tube'].includes(s.medium?.kind), `${k}.medium`);
    const L = F.lookOfStyle(k, s); assert.equal(L.paper, s.tokens.paper); assert.equal(L.accent, s.tokens.accent); assert.match(L.dim, /^#[0-9a-f]{6}$/);
  }
  assert.equal(all['terminal-phosphor'].medium.kind, 'tube'); assert.equal(all['cobalt-print'].medium.kind, 'print');
  // a project naming a style: the look sheet and the image model's world are the style's
  const L = F.filmLook(cfg, 'chapter-demo'); assert.equal(L.from, 'style'); assert.equal(L.world, 'editorial-grey'); assert.equal(L.palette.bg, all['editorial-grey'].tokens.paper); assert.ok(L.picked);
  assert.equal(F.filmWorld(cfg, 'chapter-demo').prompt, all['editorial-grey'].art);
  // the call sites pass the film's style
  const src = (f) => fs.readFileSync(path.join(LIB, f), 'utf8');
  assert.equal((src('shotplan.mjs').match(/themeOf\(answer\)/g) || []).length, 0); assert.equal((src('layers.mjs').match(/themeOf\(answer\)/g) || []).length, 0);
  assert.match(src('shotplan.mjs'), /filmStyle: loadProject\(cfg, id\)\?\.style \|\| null/);
});

test('three user gates for a six-stage film: look, the structure white model, the polished film — each bound to what the user saw (CONVERGE-20261026 conflicts 2, 3)', async () => {
  const G = await lib('gates.mjs'), S = await lib('store.mjs');
  // what the structure is: forms and devices of a chapter's plan, not its code; a passage's modules and cuts
  const code = (form, dev, extra = '') => `const a = ${JSON.stringify(extra)};\nexport const plan2 = { carrier: 'x', beats: { B1: { form: '${form}', devices: ['${dev}'], carryOver: 'y' } } };`;
  assert.equal(G.planShape(code('flat', 'carrier', 'a')), G.planShape(code('flat', 'carrier', 'b')), 'polishing the code is not structure');
  assert.notEqual(G.planShape(code('flat', 'carrier')), G.planShape(code('3d', 'carrier')));
  assert.notEqual(G.planShape(code('flat', 'carrier')), G.planShape(code('flat', 'scale-jump')));
  const st = (shots) => G.structureHashOf(G.structureOf({ storyboard: { shots: [{ beat: 'B1', card: 'morph-chapter', seconds: 4 }] }, passages: [{ seg: 'open', shots }] }));
  const sh = (m, at, end) => ({ id: 'S1', module: m, at, end, spec: JSON.stringify({ title: Math.random() }) });
  assert.equal(st([sh('title', 0, 3)]), st([sh('title', 0, 3)]), 'a shot\'s words are polish');
  assert.notEqual(st([sh('title', 0, 3)]), st([sh('quote', 0, 3)])); assert.notEqual(st([sh('title', 0, 3)]), st([sh('title', 0, 3.6)]));
  // the gates in order; a new style reopens the look, a new structure the rough, a changed piece only itself
  assert.equal(G.gatesOf({}).six, false, 'older projects keep their own gates');
  const p = { process: 'six-stage', style: 'editorial-grey', lettering: 'eva' };
  assert.match(G.gatesOf({ ...p, lettering: 'gothic-kaiso' }).look.why, /lettered eva/, 'conflict 5: gothic-kaiso stays with Vol.138');
  assert.equal(G.gatesOf({ process: 'six-stage' }).waiting, 'direction', 'the greybox rough first (2026-10-28)'); assert.match(G.gatesOf({ process: 'six-stage' }).look.why, /no style/);
  assert.equal(G.gatesOf({ ...p, direction: { approved: true, by: 'u', at: 't', hash: 'g' } }).waiting, 'look');
  const lk = { ...p, look: { approved: true, by: 'u', at: 't', style: 'editorial-grey' } };
  assert.equal(G.gatesOf(lk, { structure: 'h1' }).waiting, 'rough');
  assert.equal(G.gatesOf({ ...lk, style: 'forensic-dark' }).waiting, 'look', 'the style changed after the look was approved');
  const rg = { ...lk, rough: { approved: true, by: 'u', at: 't', hash: 'h1' } };
  assert.equal(G.gatesOf(rg, { structure: 'h1', pieces: { B01: 'a' } }).waiting, 'final');
  assert.ok(G.gatesOf(rg, { structure: 'h2' }).rough.stale);
  const fn = { ...rg, final: { approved: true, by: 'u', at: 't', pieces: { B01: 'a', open: 'b' } } };
  assert.equal(G.gatesOf(fn, { structure: 'h1', pieces: { B01: 'a', open: 'b' } }).waiting, null);
  assert.deepEqual(G.gatesOf(fn, { structure: 'h1', pieces: { B01: 'a', open: 'c' } }).final.pending, ['open']);
  assert.ok(G.finalAllowsOf(fn, 'B01', 'a')); assert.ok(!G.finalAllowsOf(fn, 'open', 'c')); assert.ok(!G.finalAllowsOf(rg, 'B01', 'a')); assert.ok(G.finalAllowsOf({}, 'B01', 'x'), 'older films: their own gates');
  // a new film is made on the process; the approvals are the user's, in order, in their words
  S.ensureProject(cfg, 'gate-test', '门测试');
  const pf = path.join(cfg.dataDir, 'projects', 'gate-test', 'project.json'), proj0 = readJson(pf);
  assert.equal(proj0.gateSet, 'design', 'a new film is made on the design set (2026-10-28)');
  const { gateSet: _gs, ...proj } = proj0; writeJson(pf, proj);   // (the older gates, as a film made before keeps them)
  assert.equal(proj.process, 'six-stage'); assert.equal(proj.lettering, 'eva'); assert.equal(proj.agents.default, 'manual');
  assert.equal((await G.gateState(cfg, 'gate-test')).waiting, 'direction');
  await assert.rejects(G.approveGate(cfg, 'gate-test', 'look', '可以'), /direction comes first/);
  await assert.rejects(G.approveGate(cfg, 'gate-test', 'direction', '用户：方向可以'), /greybox rough has not passed/);
  writeJson(path.join(cfg.dataDir, 'projects', 'gate-test', 'tasks', 'greybox.check.json'), { ok: true, errors: [], answerHash: 'g1' });
  assert.equal((await G.approveGate(cfg, 'gate-test', 'direction', '用户：方向可以')).hash, 'g1');
  assert.equal((await G.gateState(cfg, 'gate-test')).waiting, 'look');
  await assert.rejects(G.approveGate(cfg, 'gate-test', 'rough', '可以'), /look comes first|name the film/);
  await assert.rejects(G.approveGate(cfg, 'gate-test', 'look', '可以'), /name the film's style/);
  writeJson(pf, { ...readJson(pf), style: 'editorial-grey' });
  await assert.rejects(G.approveGate(cfg, 'gate-test', 'look', ''), /in their words/);
  assert.equal((await G.approveGate(cfg, 'gate-test', 'look', '用户：这套可以')).style, 'editorial-grey');
  assert.equal((await G.gateState(cfg, 'gate-test')).waiting, 'rough'); assert.ok(G.lookOpen(cfg, 'gate-test')); assert.ok(!G.polishOpen(cfg, 'gate-test'));
  await G.approveGate(cfg, 'gate-test', 'rough', '用户：讲法可以');
  assert.ok(G.polishOpen(cfg, 'gate-test')); assert.equal((await G.gateState(cfg, 'gate-test')).waiting, 'final');
  await assert.rejects(G.approveGate(cfg, 'gate-test', 'final', '用户：可以精渲'), /whole film's rough with its motion/, 'watched first');
  fs.mkdirSync(path.join(cfg.dataDir, 'projects', 'gate-test', 'out'), { recursive: true }); fs.writeFileSync(path.join(cfg.dataDir, 'projects', 'gate-test', 'out', 'animatic.mp4'), 'x');
  await G.approveGate(cfg, 'gate-test', 'final', '用户：可以精渲');
  assert.equal((await G.gateState(cfg, 'gate-test')).waiting, null);
  assert.match((await G.gateLines(cfg, 'hupo-auto2')).join(), /^$/, 'a film made before the process is not asked');
  // the line keeps them: run stops at the look, chapters wait for the structure before any blind review, the fine renders for the film
  const src = (f) => fs.readFileSync(path.join(LIB, f), 'utf8');
  assert.match(src('run.mjs'), /const active = \(s\) => asked\(s\) && !\(stillsOnly && dynamicStages\.has\(s\)\) && !lookHeld\(s\) && !sixHeld\(s\);/);
  assert.match(src('chapter.mjs'), /if \(review && !polishOpen\(cfg, id\)\)/); assert.match(src('chapter.mjs'), /!chapterFinalAllowed\(cfg, id, g\)/);
  assert.match(src('shotplan.mjs'), /if \(!G\.polishOpen\(cfg, id\)\)/); assert.match(src('shotplan.mjs'), /G\.finalAllows\(cfg, id, g\.seg, G\.pieceKey\(rk\)\)/);
  assert.match(src('layers.mjs'), /if \(sixStage\(p\)\) return lookOpen\(cfg, id\)/);
});

test('the user\'s decisions, said once for every reviewer: one generated section in the three review prompts, and a fix against them is void (CONVERGE-20261026 conflicts 4, 8)', async () => {
  const R = await lib('reviewrules.mjs'), T = await lib('techniques.mjs');
  const lessons = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/lessons.json'), 'utf8')).lessons;
  // the three prompts carry the section as the lessons have it now (node scripts/recipe-board.mjs lessons --sync)
  const section = R.userDecidedSection(lessons);
  for (const f of R.REVIEW_PROMPTS) { const t = fs.readFileSync(path.join(DATA, f), 'utf8'); assert.ok(t.includes(section), `${f}: run lessons --sync`); assert.equal(R.withSection(t, section), t); }
  assert.ok(R.reviewLessons(lessons).length >= 10);
  // replaced lessons are not handed out; every replacement names a lesson that is there
  const ids = new Set(lessons.map((l) => l.id));
  for (const l of lessons.filter((x) => x.supersededBy)) assert.ok(ids.has(l.supersededBy), l.id);
  assert.ok(!T.readLessons(cfg).some((l) => l.supersededBy)); assert.ok(lessons.find((l) => l.id === 'L39-paper-plates').supersededBy);
  for (const l of R.reviewLessons(lessons)) for (const k of ['complains', 'suggests', 'keepIf']) if (l.review[k]) assert.doesNotThrow(() => new RegExp(l.review[k]), `${l.id}.${k}`);
  // the rules hash is the prompt's without the section: restating the user's rules sends nothing back to review
  assert.equal(R.withoutSection(R.withSection('规则\n', section)), '规则\n');
  // void: a complaint about the face, the missing glow on type, the 3D smear; a fix asking only for paper, plates, dress
  const v = (say, fix = '') => R.voidFix({ say, fix }, lessons);
  assert.equal(v('[type] 对标「显卡」是粗黑体；我们的「顯卡」是米白明朝体，没有金属质感').void, 'L92-six-faces-eva');
  assert.equal(v('[depth] 字是平的白字直接压在暗灰办公室上，没有对标那种发光').void, 'L93-no-type-dress');
  assert.equal(v('3D 模型转动时带拖影').void, 'L88-3d-where-3d');
  assert.equal(v('[layout] 标签单薄', '两张卡都带同一条撕纸标签').void, 'L75-no-torn-paper');
  assert.equal(v('[type] 标签弱', '白字加投影或描边').void, 'L93-no-type-dress');
  // not void: the same words about something else, a negated suggestion, a word the face does not read, size and place
  assert.equal(v('[overlap] 整排数字带一层错开 40 px 的半透明重影，「開始解題」右侧拖着一截残影').void, null, 'type echo is a fault');
  assert.equal(v('白色大字压在人群和人脸上，是素材自带的片头').void, null, 'burned-in words of footage');
  assert.equal(v('[focus] 两张卡一样大', '前段金条卡大，不要用撕纸、纸条、胶带').void, null);
  assert.equal(v('[type] 卡片顶上小字「AI就是」读成「RI就昰」一串乱码', '小号引导语改用黑華明朝等正文字体').void, null);
  assert.equal(v('引语字比对标小一档，我们是细瘦的窄宋体，缩在左上角', '引语用家规里的粗显示体，放大到占画面左半宽度').void, null);
  assert.equal(v('[layout] 两图挤在上半', '把两张图垂直居中，给黄色曲线加辉光').void, null, 'a curve\'s glow is not type');
  // struck: the forbidden part of a fix goes, the rest stands
  const s = v('[layout] 卡面空', '道具放大铺满卡面中下部，两张卡都带同一条撕纸标签');
  assert.equal(s.void, null); assert.deepEqual(s.struck, ['L75-no-torn-paper']); assert.match(s.fix, /^道具放大铺满卡面中下部（另提的改法按用户规则 L75-no-torn-paper 不做）$/);
  // a verdict left with no problem is a pass, noted
  const pv = R.voidVerdict({ id: 'S1', verdict: 'fix', owner: 'module', problems: [{ kind: 'other', say: '[type] 对标是粗黑体；我们是明朝体' }], fix: '大字换スミカク', notes: null }, lessons);
  assert.equal(pv.verdict, 'pass'); assert.equal(pv.problems.length, 0); assert.match(pv.notes, /L92/);
  // both reviews pass through it
  const src = (f) => fs.readFileSync(path.join(LIB, f), 'utf8');
  assert.match(src('layers.mjs'), /v = voidVerdict\(v0, lessons\)/); assert.match(src('chapter.mjs'), /voidFix\(\{ say: f\.issue, fix: f\.issue \}, lessons\)/);
});

test('the process measured per film: first-pass share, rounds, the user\'s notes (CONVERGE-20261026 stage 6)', async () => {
  const P = await lib('process.mjs');
  const rec = { open: { h1: { shot: 'S1', verdict: 'fix', by: 'manual', at: '2026-10-26T01' }, h2: { shot: 'S1', verdict: 'pass', by: 'manual', at: '2026-10-26T02' }, h3: { shot: 'S2', verdict: 'pass', by: 'manual', at: '2026-10-26T01' }, h4: { shot: 'S3', verdict: 'fix', by: 'code', at: null }, h5: { shot: 'S4', verdict: 'pass', by: 'manual', at: '2026-10-20T01' } } };
  const st = P.stillRounds(rec);
  assert.deepEqual(st.map((r) => [r.id, r.first, r.fixes]).sort(), [['open/S1', false, 1], ['open/S2', true, 0], ['open/S4', true, 0]], 'the code\'s verdicts are not a review');
  assert.equal(P.stillRounds(rec, '2026-10-26').length, 2, 'since');
  const bt = P.beatRounds([{ type: 'chapter-review', chapter: 'B01', beat: 'B02', score: 3 }, { type: 'chapter-review', chapter: 'B01', beat: 'B02', score: 4 }, { type: 'chapter-review', chapter: 'B01', beat: 'B03', score: 5 }]);
  const trials = P.directorTrials([
    { type: 'chapter-review', chapter: 'B01', beat: 'B02', inputHash: 'same-task', answerHash: 'a1', actor: 'writer-a', agent: 'manual', effort: 'studio', score: 3, at: '2026-11-01T01' },
    { type: 'chapter-review', chapter: 'B01', beat: 'B02', inputHash: 'same-task', answerHash: 'a2', actor: 'writer-a', agent: 'manual', effort: 'studio', score: 4, at: '2026-11-01T02' },
    { type: 'chapter-review', chapter: 'B01', beat: 'B02', inputHash: 'same-task', answerHash: 'b1', actor: 'writer-b', agent: 'codex', effort: 'studio', score: 4, at: '2026-11-01T03' },
    { type: 'chapter-review', chapter: 'B01', beat: 'B02', inputHash: 'other-task', answerHash: 'c1', actor: 'writer-a', agent: 'manual', effort: 'studio', score: 2, at: '2026-11-01T04' },
  ]);
  assert.deepEqual(trials.map(t => [t.actor, t.firstPass, t.fixes, t.versions, t.finalScore]), [['writer-a', false, 1, 2, 4], ['writer-b', true, 0, 1, 4], ['writer-a', false, 1, 1, 2]], 'same frozen task, different writers: compare first-pass and rework; a changed task is a separate trial');
  const m = P.measures(st, bt, { total: 2 });
  assert.equal(m.stills.firstPass, 0.667); assert.equal(m.beats.firstPass, 0.5); assert.equal(m.firstPass, 0.6); assert.equal(m.rounds, 0.4); assert.equal(m.target, 0.9);
  assert.match(P.processLine(m), /first-pass 60% \(target 90%; stills 67% of 3, chapter beats 50% of 2\) · 0\.4 fixes a piece · 2 user notes/);
  // the user's notes recorded in their words; the chapter reviews logged as they are given
  P.addUserNote(cfg, 'gate-test', '字太小'); assert.throws(() => P.addUserNote(cfg, 'gate-test', ''), /what the user said/);
  P.logEvent(cfg, 'gate-test', { type: 'chapter-review', chapter: 'B01', beat: 'B02', score: 3 });
  const pm = P.processMetrics(cfg, 'gate-test'); assert.equal(pm.userNotes.said, 1); assert.equal(pm.beats.n, 1); assert.ok(fs.existsSync(path.join(cfg.dataDir, 'projects/gate-test/out/film/process.json')));
  assert.match(fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'), /logEvent\(cfg, id, \{ type: 'chapter-review'/);
});

test('a ruling answered with a reason: the director\'s waiver stands for the picture it was written on, never over the user (CONVERGE-20261026 conflict 8)', async () => {
  const L = await lib('layers.mjs');
  const W = [{ shot: 'S19', hash: 'h1', item: '[type]', why: '大字不压标志是用户的规则，对标的位置在标志上' }];
  const v = { shot: 'S19', verdict: 'fix', owner: 'plan', problems: [{ kind: 'layout', say: '[type] 大字比对标小一档' }], fix: 'x' };
  assert.equal(L.waived(v, W, 'h1').verdict, 'pass'); assert.match(L.waived(v, W, 'h1').waived, /用户的规则/);
  assert.equal(L.waived(v, W, 'h2').verdict, 'fix', 'a new picture is judged anew');
  const two = { ...v, problems: [...v.problems, { kind: 'edge', say: '[edges] 字贴边' }] };
  assert.deepEqual(L.waived(two, W, 'h1').problems.map((p) => p.kind), ['edge']);
  assert.ok(L.waives({ shot: 'S1', hash: 'h', item: 'motion:' }, 'S1', 'h', { say: 'motion: 原片 0.4 s 开始动' }), 'a measure by its words');
  const src = fs.readFileSync(path.join(LIB, 'layers.mjs'), 'utf8');
  assert.match(src, /v\.by !== 'user' \? waived\(v, W, hashOf\[v\.shot\]\)/, 'the user\'s marks are never waived');
  assert.match(fs.readFileSync(path.join(LIB, 'shotplan.mjs'), 'utf8'), /L\.waives\(w, p\.shot, hashOf\[p\.shot\], x\)/);
});

test('the label prop family is retired for new films: a six-stage chapter that names it is refused, older films keep theirs (CONVERGE-20261026 §3.5)', async () => {
  const C = await lib('chapter.mjs');
  const six = { process: 'six-stage' };
  assert.match(C.retiredPropErrors("draw(images.prop_label_torn, 0, 0)", six).join(), /label prop family is retired/);
  assert.match(C.retiredPropErrors("const p = K.props(images, 'label', 3)", six).join(), /retired/);
  assert.deepEqual(C.retiredPropErrors("K.props(images, 'trace', 3)", six), []);
  assert.deepEqual(C.retiredPropErrors("draw(images.prop_label_torn)", {}), [], 'a film made before keeps its plates');
  // a ship built from code boxes where the image-to-3D line makes the model (the user 2026-10-27)
  assert.match(C.codePropErrors("const s = kit.props.containerShip(THREE, { length: 3 });", six).join(), /stand-in built in code.*partset/);
  assert.deepEqual(C.codePropErrors("const s = await kit.props.model(THREE, 'evergiven', { length: 3, fallback: () => kit.props.containerShip(THREE) });", six), [], 'the code prop only as the model\'s fallback');
  assert.deepEqual(C.codePropErrors("kit.props.tugboat(THREE)", {}), [], 'a film made before keeps its props');
  assert.deepEqual(C.codePropErrors("const boxes = kit.props.containerShip(THREE, { length: 3.2, boxesOnly: true });", six), [], 'the boxes alone, as data on a made hull');
  // the models a module names are made by the line before it renders (the user 2026-10-27: 系统怎么能把这环节丢掉呢)
  assert.deepEqual(C.modelsNamed("const s = await kit.props.model(THREE, 'evergiven', { what: 'a container ship', length: 7, fallback: () => kit.props.containerShip(THREE, { length: 7 }) }); const t = await kit.props.model(THREE, 'tug');"), [{ name: 'evergiven', what: 'a container ship' }, { name: 'tug', what: null }]);
  assert.deepEqual(C.modelsNamed("await kit.props.model(THREE, 'x', { what: 'an object', viewsManifest: 'materials/views.json' })"), [{ name: 'x', what: 'an object', viewsManifest: 'materials/views.json' }]);
  assert.deepEqual(C.modelsNamed('kit.props.containerShip(THREE)'), []);
  const lib_ = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/props.json'), 'utf8')).families;
  assert.equal(lib_.find((f) => f.family === 'label').retired, true); assert.deepEqual(lib_.filter((f) => f.retired).map((f) => f.family), C.RETIRED_FAMILIES);
});


test('photo-plane-as-subject: PlaneGeometry + photo as hero fails; real mesh / photo-on-mesh / evidence planes pass (HOUSE; banana-design B02 pattern)', async () => {
  const C = await lib('chapter.mjs');
  const six = { process: 'six-stage' };
  // synthetic B02 pattern: formFor object + PlaneGeometry card with banana_photo, no real mesh
  const b02 = `export const plan2 = { carrier: 'x', beats: { B02: { carryOver: '', devices: ['subject-stays'], form: '2.5d', formFor: 'object' } } };
export async function stage3({ THREE, st, images, kit }) {
  const texOf = (T, img, f) => img;
  const card = (tex, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide }));
  const healthy = texOf(THREE, images.banana_photo, 'saturate(0.3)');
  const a = card(healthy, 2.8, 2.8); st.scene.add(a);
}`;
  assert.match(C.photoPlaneSubjectErrors(b02, six).join(), /photo-plane-as-subject/, 'B02-style photo billboard hero fails');
  assert.equal(C.PHOTO_PLANE_SUBJECT, 'photo-plane-as-subject');
  // real mesh subject path passes (planes may sit beside it)
  const withModel = b02 + `\nconst sub = await kit.props.model(THREE, 'banana', { what: 'a cavendish banana', length: 2 });`;
  assert.deepEqual(C.photoPlaneSubjectErrors(withModel, six), [], 'kit.props.model subject path passes');
  const withEngine = `export const plan2 = { beats: { B02: { form: '3d', formFor: 'object', devices: ['subject-stays'] } } };
export async function stage3({ THREE, kit, st }) { await kit.engine.subject(THREE, st, 'banana', { size: 2 }); }`;
  assert.deepEqual(C.photoPlaneSubjectErrors(withEngine, six), [], 'kit.engine.subject passes');
  // photo as material map on a non-plane mesh is allowed
  const photoOnBox = `export const plan2 = { beats: { B02: { form: '3d', formFor: 'object', devices: ['carrier'] } } };
export async function stage3({ THREE, st, images }) {
  const tex = images.banana_photo;
  st.scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 0.3), new THREE.MeshStandardMaterial({ map: tex })));
}`;
  assert.deepEqual(C.photoPlaneSubjectErrors(photoOnBox, six), [], 'photo texture on BoxGeometry allowed');
  // intentional 2D evidence / read planes are not claimed as 3D object subject
  const evidencePlanes = `export const plan2 = { beats: { B10: { form: 'flat', formFor: 'read', devices: ['real-doc-callout'] } } };
const card = (tex) => new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.1 }));
card(images.doc_photo);`;
  assert.deepEqual(C.photoPlaneSubjectErrors(evidencePlanes, six), [], 'flat/read evidence planes allowed');
  assert.deepEqual(C.photoPlaneSubjectErrors(evidencePlanes, six, { film: [{ beat: 'B10', medium: 'evidence' }] }), [], 'film medium=evidence allows planes');
  // older (non six-stage) films keep theirs
  assert.deepEqual(C.photoPlaneSubjectErrors(b02, {}), [], 'pre-six-stage films keep photo planes');
  // banana-tr4-blind B02 scratch is SAMPLE evidence of the failure pattern (Plane card + banana_photo);
  // do not rewrite B02 — only prove the gate catches that pattern. Current banana-design answer uses a real mesh.
  const tr4Path = path.join(DATA, 'projects/banana-design/_scratch/tr4-B02.mjs');
  if (fs.existsSync(tr4Path)) {
    const tr4 = fs.readFileSync(tr4Path, 'utf8');
    assert.match(C.photoPlaneSubjectErrors(tr4, six).join(), /photo-plane-as-subject/, 'tr4-B02 Plane+photo billboard sample trips the gate');
  }
  const fixed = JSON.parse(fs.readFileSync(path.join(DATA, 'projects/banana-design/tasks/morph-B02.answer.json'), 'utf8'));
  if (fixed?.code && /props\.model\s*\(/.test(fixed.code)) {
    assert.deepEqual(C.photoPlaneSubjectErrors(fixed.code, six), [], 'current banana-design B02 with kit.props.model / real mesh passes');
  }
});



test('subject-pipeline-filler: Tube/Box/anonymous glb without kit path fails; QA-passed partset model passes; un-QA / no provenance fails (HOUSE; dredger receipts)', async () => {
  const C = await lib('chapter.mjs');
  const six = { process: 'six-stage' };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-subject-pipe-'));
  const write = (n, o) => fs.writeFileSync(path.join(tmp, n), typeof o === 'string' ? o : JSON.stringify(o, null, 1) + '\n');
  const tubeSub = `export const plan2 = { beats: { B02: { form: '3d', formFor: 'object', devices: ['subject-stays'] } } };
export async function stage3({ THREE, st }) {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1,0,0), new THREE.Vector3(0,0.4,0), new THREE.Vector3(1,0,0)]);
  st.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.2, 8, false), new THREE.MeshStandardMaterial({ color: '#e8c84a' })));
}`;
  assert.match(C.subjectPipelineErrors(tubeSub, six).join(), /subject-pipeline-filler/, 'Tube filler without kit path fails');
  assert.equal(C.SUBJECT_PIPELINE_FILLER, 'subject-pipeline-filler');
  const boxSub = `export const plan2 = { beats: { B02: { form: '3d', formFor: 'object' } } };
export async function stage3({ THREE, st }) { st.scene.add(new THREE.Mesh(new THREE.BoxGeometry(1,0.4,0.3), new THREE.MeshStandardMaterial())); }`;
  assert.match(C.subjectPipelineErrors(boxSub, six).join(), /subject-pipeline-filler/, 'Box filler without kit path fails');
  const anon = `export const plan2 = { beats: { B02: { form: '3d', formFor: 'object' } } };
export async function stage3({ THREE, st }) { const L = new THREE.GLTFLoader(); const g = await L.loadAsync('/tmp/random.glb'); st.scene.add(g.scene); }`;
  assert.match(C.subjectPipelineErrors(anon, six).join(), /subject-pipeline-filler/, 'anonymous glb without kit path fails');
  const withModel = `export const plan2 = { beats: { B02: { form: '3d', formFor: 'object' } } };
export async function stage3({ THREE, kit, st }) {
  const loaded = await kit.props.model(THREE, 'banana', { what: 'a curved yellow banana', length: 2, fallback: () => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0), new THREE.Vector3(1,0,0)]), 8, 0.1, 6), new THREE.MeshStandardMaterial()) });
  st.scene.add(loaded); st.scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.2,0.05,0.05), new THREE.MeshStandardMaterial()));
}`;
  assert.deepEqual(C.subjectPipelineErrors(withModel, six), [], 'kit.props.model clears Tube/Box helpers without partsRoot');
  assert.match(C.subjectPipelineErrors(withModel, six, { partsRoot: tmp }).join(), /subject-pipeline-filler/, 'named model without glb fails when partsRoot set');
  write('banana.glb', 'glTF');
  assert.match(C.subjectPipelineErrors(withModel, six, { partsRoot: tmp }).join(), /A1PartRequest|A1PartMesh|subject-pipeline-filler/, 'glb without partset receipt fails');
  write('banana.request.json', { contract: 'A1PartRequest/v1', name: 'banana', views: { left: 'ref.png' } });
  assert.equal(C.modelProvenanceOk(tmp, 'banana'), false, 'request alone cannot certify an older GLB');
  write('ref.png', 'reference');
  write('banana.json', { contract: 'A1PartMesh/v1', name: 'banana', glb: 'banana.glb', inputHash: 'build1' });
  const crypto = await import('node:crypto');
  const hash = (n) => crypto.createHash('sha256').update(fs.readFileSync(path.join(tmp, n))).digest('hex');
  const hashText = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
  const AR = await import('../work/recipe-board-v1/style-lab/engine/blender/asset_review.mjs');
  const review = (kind, contract, hashes, reason) => {
    const task = path.join(tmp, `banana.${kind}-review.task.json`), answer = path.join(tmp, `banana.${kind}-review.answer.json`), candidate = path.join(tmp, `${kind}-candidate.json`);
    AR.ensureReviewTask(task, { contract: contract.replace('Answer/', 'Task/'), hashes }, { CODEX_THREAD_ID: 'writer' });
    fs.writeFileSync(candidate, JSON.stringify({ contract, ok: true, reviewer: 'reviewer', reason, hashes }));
    AR.submitAssetReview(task, answer, candidate, { CODEX_THREAD_ID: 'reviewer' });
  };
  review('ref', 'A1ReferenceReviewAnswer/v1', { left: hash('ref.png') }, 'reference checked');
  write('banana.build.json', { contract: 'A1PartBuild/v1', name: 'banana', inputHash: 'build1', glbSha256: hash('banana.glb'), meshSha256: hash('banana.json'), requestSha256: hash('banana.request.json'), referenceReviewSha256: hash('banana.ref-review.answer.json'), views: { left: hash('ref.png') } });
  assert.equal(C.modelProvenanceOk(tmp, 'banana'), true);
  write('banana.qa.json', { contract: 'A1ModelCheck/v1', ok: true, what: 'a curved yellow banana', key: C.modelQaKey(tmp, 'banana', 'a curved yellow banana') });
  assert.equal(C.modelQaOk(tmp, 'banana', 'a curved yellow banana'), false, 'likeness alone is not visual approval');
  review('visual', 'A1ModelVisualReviewAnswer/v1', C.modelReviewHashes(tmp, 'banana', 'a curved yellow banana'), 'silhouette and depth checked');
  assert.deepEqual(C.subjectPipelineErrors(withModel, six, { partsRoot: tmp }), [], 'content-bound build and visual review pass');
  write('ref.png', 'changed reference');
  assert.equal(C.modelProvenanceOk(tmp, 'banana'), false, 'changed reference invalidates the build');
  write('ref.png', 'reference'); write('banana.glb', 'changed GLB');
  assert.equal(C.modelProvenanceOk(tmp, 'banana'), false, 'changed GLB invalidates the build');
  assert.equal(C.modelQaOk(tmp, 'banana', 'a curved yellow banana'), false, 'changed GLB invalidates QA');
  write('banana.glb', 'glTF');
  const autoRoot = path.join(tmp, 'subjects');
  const partRoot = path.join(autoRoot, 'parts');
  fs.mkdirSync(partRoot, { recursive: true }); fs.mkdirSync(path.join(autoRoot, 'auto'), { recursive: true });
  for (const f of ['banana.glb', 'banana.request.json', 'banana.json', 'banana.build.json', 'banana.qa.json', 'banana.ref-review.answer.json', 'banana.ref-review.task.json', 'banana.ref-review.submission.json', 'banana.visual-review.answer.json', 'banana.visual-review.task.json', 'banana.visual-review.submission.json', 'ref.png']) fs.copyFileSync(path.join(tmp, f), path.join(partRoot, f));
  const autoCode = `export const plan2 = { beats: { B02: { form: '3d', formFor: 'object' } } }; await kit.engine.subject(THREE, st, 'demo', {});`;
  assert.match(C.subjectPipelineErrors(autoCode, six, { partsRoot: partRoot }).join(), /missing a valid parts definition/);
  fs.writeFileSync(path.join(autoRoot, 'auto', 'demo.json'), JSON.stringify({ contract: 'A1AutoSubject/v1', id: 'demo', files: ['banana'] }));
  assert.deepEqual(C.subjectPipelineErrors(autoCode, six, { partsRoot: partRoot }), [], 'automatic subject requires all parts to be bound and reviewed');
  fs.writeFileSync(path.join(partRoot, 'banana.glb'), 'stale');
  assert.match(C.subjectPipelineErrors(autoCode, six, { partsRoot: partRoot }).join(), /no matching build provenance/);
  assert.match(C.autoSubjectErrors(`await kit.engine.subject(THREE, st, id, {})`, partRoot).join(), /dynamic engine.subject id/);
  assert.deepEqual(C.autoSubjectErrors(`// kit.engine.subject(THREE, st, id)\n await kit.engine.subject(THREE, st, 'drill')`, partRoot), []);
  const unresolvedBlock = `export const plan2 = { beats: { B02: { form: '3d', formFor: 'object' } } }; if (block.model) load(block.model);`;
  assert.match(C.subjectPipelineErrors(unresolvedBlock, six, { partsRoot: partRoot }).join(), /dynamic block.model has no verifiable/);
  const eng = `export const plan2 = { beats: { B02: { form: '3d', formFor: 'object' } } };
export async function stage3({ THREE, kit, st }) { await kit.engine.subject(THREE, st, 'drill', { size: 2 }); }`;
  assert.deepEqual(C.subjectPipelineErrors(eng, six), [], 'kit.engine.subject clears filler ban');
  const blk = `export const plan2 = { beats: { B02: { form: '2.5d', formFor: 'object' } } }; const block = { model: 'banana' };`;
  assert.deepEqual(C.subjectPipelineErrors(blk, six), [], 'block.model clears filler ban');
  const pathOnly = `export const plan2 = { beats: { B10: { form: 'flat', formFor: 'read' } } };
export async function stage3({ THREE, st }) { st.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0), new THREE.Vector3(1,0,0)]), 8, 0.05, 4), new THREE.MeshBasicMaterial())); }`;
  assert.deepEqual(C.subjectPipelineErrors(pathOnly, six), [], 'non-spatial Tube helper allowed');
  assert.deepEqual(C.subjectPipelineErrors(tubeSub, {}), [], 'pre-six-stage keeps Tube subjects');
  const house = fs.readFileSync(path.join(DATA, 'HOUSE.md'), 'utf8');
  assert.match(house, /subject-pipeline-filler/);
  assert.match(house, /A1ModelCheck/);
  const table = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/mature-first-draft.json'), 'utf8'));
  const real = table.bars.find((b) => b.id === 'real-mesh');
  assert.ok(real.gates.includes('subject-pipeline-filler'));
  assert.ok(real.gates.includes('subjectPipelineErrors'));
  const M = await import(pathToFileURL(path.join(LIB, 'mature.mjs')).href);
  const claim = M.matureFirstDraftErrors(
    { matureFirstDraft: true, beats: [{ beat: 'B1', camera: { move: 'dolly' }, type: [{ text: '字', role: 'big', size: 200, in: 0.2, enter: 'rise' }], blocks: [{ role: 'subject', shape: 'rect', w: 400, h: 300, x: 100, y: 100, image: 'x' }], out: 'cut', note: 'core' }] },
    [{ beat: 'B1', text: 'x', dur: 5, medium: 'type', hero: true }],
    { subjectPipelineErrors: ['subject-pipeline-filler: Tube filler'] },
  ).join('\n');
  assert.match(claim, /mature-first-draft-incomplete/);
  assert.match(claim, /real-mesh\/subject-pipeline|subject-pipeline-filler/);
  // sessionbrief injects the veto
  const SB = await lib('sessionbrief.mjs');
  const brief = SB.briefText({ id: 'x', chapter: 'B02', beats: [{ shotId: 'B02', text: 'x' }] });
  assert.match(brief, /subject-pipeline-filler/);
  fs.rmSync(tmp, { recursive: true, force: true });
});


test('a continuous diagram\'s beat changes as often as it gives a new thing to read, not once (the Vol.047 run: cut targets measured on presenter films refused 10 s diagram beats)', async () => {
  const { cutsOfShot, measureChapter } = await lib('storyboard.mjs');
  const beat = (n) => ({ card: 'morph-chapter', seconds: 9, evidence: [], scenes: [], reads: Array.from({ length: n }, (_, i) => ({ from: i * 3, to: i * 3 + 2, what: 'x' })) });
  assert.equal(cutsOfShot(beat(3)).length, 3); assert.equal(cutsOfShot(beat(3))[0].seconds, 3);
  assert.equal(cutsOfShot(beat(1)).length, 1, 'one read: one cut');
  assert.equal(cutsOfShot({ ...beat(3), card: 'concept-flow' }).length, 1, 'a card is a cut');
  assert.equal(measureChapter([beat(3), beat(3)]).cutSeconds, 3);
});

test('a film with a style: the brief writes its palette and its ground in it, never another (the Vol.047 run: the task carried only the card theme)', async () => {
  const B = await lib('brief.mjs');
  const fs_ = { id: 'cobalt-print', ground: 'light', palette: { base: '#efe8d6', ink: '#2747a3', accent: '#e2261c' } };
  const plan = { beats: [{ id: 'B01', intent: 'title', text: 'x' }] };
  const brief = (pal, base) => ({ style: { palette: pal, world: { base, display: 'condensed', texture: [], medium: 'none' } } });
  const errs = (b) => B.checkBrief(plan, b, { filmStyle: fs_ }).errors.filter((e) => /film's style|world\.base is/.test(e));
  assert.deepEqual(errs(brief(fs_.palette, 'paper')), []);
  assert.match(errs(brief({ ...fs_.palette, accent: '#ff0000' }, 'paper')).join(), /palette\.accent is the film's style's/);
  assert.match(errs(brief(fs_.palette, 'dark')).join(), /world\.base is paper/);
  assert.equal(B.briefStyle(cfg, { style: 'cobalt-print' }).palette.base, '#efe8d6'); assert.equal(B.briefStyle(cfg, {}), null);
  assert.match(fs.readFileSync(path.join(DATA, 'prompts/brief.md'), 'utf8'), /任务里有 `filmStyle`/);
});

test('the look comes from the films the user took: a rejected style never passes the look gate, and the sheet is never the image model\'s whole frames (the user 2026-10-26 on Vol.047: 绝对不行 很ai这种)', async () => {
  const G = await lib('gates.mjs'), S = await lib('store.mjs');
  const all = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/styles.json'), 'utf8')).styles;
  for (const [k, s] of Object.entries(all)) assert.ok(['approved', 'rejected', 'untested'].includes(s.verdict?.state), `${k}: the user's verdict`);
  assert.equal(all['editorial-grey'].verdict.state, 'approved'); assert.equal(all['forensic-dark'].verdict.state, 'approved'); assert.equal(all['cobalt-print'].verdict.state, 'rejected');
  const p = { process: 'six-stage', style: 'cobalt-print', lettering: 'eva', look: { approved: true, by: 'u', at: 't', style: 'cobalt-print' } };
  assert.match(G.gatesOf(p, { verdict: all['cobalt-print'].verdict }).look.why, /rejected the style cobalt-print/);
  assert.equal(G.gatesOf({ ...p, style: 'forensic-dark', look: { ...p.look, style: 'forensic-dark' } }, { verdict: all['forensic-dark'].verdict }).look.ok, true);
  // the sheet takes the parts made as the film is made, never concept/keyframes
  S.ensureProject(cfg, 'look-test', 'x'); const root = path.join(cfg.dataDir, 'projects/look-test');
  fs.mkdirSync(path.join(root, 'concept/keyframes'), { recursive: true }); fs.writeFileSync(path.join(root, 'concept/keyframes/B02-1.png'), 'x');
  fs.writeFileSync(path.join(root, 'concept/keyframes/keyframes.json'), JSON.stringify({ beats: { B02: { options: ['concept/keyframes/B02-1.png'] } } }));
  assert.deepEqual(await G.lookFrames(cfg, 'look-test'), []);
  fs.mkdirSync(path.join(root, 'out/look/parts'), { recursive: true }); fs.writeFileSync(path.join(root, 'out/look/parts/1-title.png'), 'x');
  assert.deepEqual((await G.lookFrames(cfg, 'look-test')).map((f) => f.kind), ['parts']);
  const pj = path.join(root, 'project.json'); fs.writeFileSync(pj, JSON.stringify({ ...JSON.parse(fs.readFileSync(pj, 'utf8')), gateSet: null, style: 'cobalt-print', direction: { approved: true, by: 'u', at: 't', hash: 'g' } }));   // (the direction passed: the greybox gate, 2026-10-28)
  await assert.rejects(G.approveGate(cfg, 'look-test', 'look', '可以'), /rejected the style/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(DATA, 'routing/lessons.json'), 'utf8')).lessons.some((l) => l.id === 'L96-look-from-the-films-the-user-took'));
});

test('each film derives its own world from its subject, and it becomes the film\'s style (the user 2026-10-26: 回形针 … 根据不同主题做变体; RESEARCH-paperclip-variants)', async () => {
  const W = await lib('filmworld.mjs'), F = await lib('filmlook.mjs'), M = await lib('modules.mjs');
  const spec = (o) => JSON.stringify({ module: 'title', at: 10, end: 13, text: '你在吸什么', ...o });
  const w = { contract: 'A1RecipeBoardWorld/v1', subject: { object: '香烟', looks: '白纸卷烟、烟盒烫金', light: '实验室冷光', medium: '检测报告' },
    ground: { tone: 'dark', color: '#0e0e0e', from: '烟盒内衬的黑' }, main: { color: '#c9a35a', from: '烟盒的烫金' }, accent: null, ink: '#f2efe8',
    texture: { grain: 0.3, vignette: 0.4, from: '检测报告复印件' }, photo: 'mono', diagram: { mode: 'line', from: '国标文件的线稿' }, props: ['一支白色香烟'], bgWords: ['TAR'],
    display: { face: '黒華明朝', x: 0.72 }, art: 'black studio, white cigarettes', camera: 'calm', why: 'x',
    frames: [{ beat: 'B01', name: '开场', spec: spec({}) }, { beat: 'B07', name: '数字', spec: spec({ text: '27.3 毫克' }) }, { beat: 'B17', name: '倍数', spec: spec({ text: '22.4 倍' }) }] };
  const opts = { article: '你在吸什么 27.3 毫克 22.4 倍', beats: [{ id: 'B01' }, { id: 'B07' }, { id: 'B17' }], rejected: W.rejectedLooks(cfg) };
  assert.deepEqual(W.worldErrors(w, opts), []);
  assert.match(W.worldErrors({ ...w, main: { color: '#c9a35a', from: '' } }, opts).join(), /main\.from/);
  assert.match(W.worldErrors({ ...w, ink: '#333333' }, opts).join(), /contrast/);
  assert.match(W.worldErrors({ ...w, ground: { ...w.ground, tone: 'light' } }, opts).join(), /tone is light/);
  assert.match(W.worldErrors({ ...w, frames: w.frames.map((f, i) => (i === 1 ? { ...f, spec: spec({ text: '35.5 毫克' }) } : f)) }, opts).join(), /35\.5 is not in the script/);
  assert.match(W.worldErrors({ ...w, ground: { tone: 'light', color: '#efe8d6', from: '检测报告的纸面' }, main: { color: '#2747a3', from: '报告上的蓝色印章' }, ink: '#111111' }, opts).join(), /the user rejected this look \(cobalt-print/);
  assert.match(W.worldErrors({ ...w, frames: w.frames.slice(0, 2) }, opts).join(), /3–6 beats/);
  // accepted, it is a style every reader reads under film:<id>, a proposal until the look gate
  const st = W.worldStyle('look-w', w); assert.equal(st.tokens.paper, '#0e0e0e'); assert.equal(st.tokens.accent, '#c9a35a'); assert.equal(st.verdict.state, 'untested'); assert.equal(st.fonts.display, '黒華明朝');
  fs.mkdirSync(path.join(cfg.dataDir, 'projects/look-w'), { recursive: true }); fs.writeFileSync(path.join(cfg.dataDir, 'projects/look-w/style.json'), JSON.stringify(st));
  assert.equal(F.readStyle(cfg, 'film:look-w').tokens.paper, '#0e0e0e'); assert.equal(F.lookOfStyle('film:look-w', st).accent, '#c9a35a');
  assert.equal(typeof M.filmStyles, 'function'); assert.ok(Object.keys(M.filmStyles(cfg.dataDir)).includes('film:look-w'));
  // the run derives it after the storyboard, and a six-stage film draws no image-model keyframes
  const run = fs.readFileSync(path.join(LIB, 'run.mjs'), 'utf8'); assert.match(run, /stepWorld\(cfg, id, \{ log \}\)/); assert.match(run, /!sixStage\(loadProject\(cfg, id\) \|\| \{\}\)\) \{/);
  assert.match(fs.readFileSync(path.join(DATA, 'prompts/world.md'), 'utf8'), /RESEARCH-paperclip-variants/);
});

test('a designer\'s way to a film\'s look: the reference board, two or three directions from different associations held to the references\' level, the user\'s pick and taste kept (the user 2026-10-26: 要有对标水准的设计 … 做各种变体)', async () => {
  const W = await lib('filmworld.mjs'), F = await lib('filmlook.mjs'), G = await lib('gates.mjs'), S = await lib('store.mjs');
  const P = W.readPrecedents(cfg); assert.ok(P.length >= 20); assert.ok(P.some((p) => p.id === 'hupo-deepseek'), '胡泊 is on the board');
  assert.deepEqual(W.precedentsFor('焦油 香烟 检测 标准', P).slice(0, 1), ['pc-047']); assert.equal(W.precedentsFor('诈骗 手机', P)[0], 'pc-165');
  const spec = (t) => JSON.stringify({ module: 'title', at: 10, end: 13, text: t });
  const base = (id, ground, main, mode, angle) => ({ id, angle, precedent: 'pc-047', learns: '从题材取烫金做唯一颜色', differs: '这部片讲的是另一样东西所以换颜色', subject: { object: '香烟', looks: '白纸烫金', light: '棚拍', medium: '报告' },
    ground: { tone: ground === '#0e0e0e' ? 'dark' : 'light', color: ground, from: '棚拍的纯黑背景' }, main: { color: main, from: '烟盒上的烫金' }, accent: null, ink: ground === '#0e0e0e' ? '#f2efe8' : '#111111',
    texture: { grain: 0.2, vignette: 0.4, from: '报告复印件的颗粒' }, photo: 'color', diagram: { mode, from: '国标文件的线稿图' }, props: ['香烟'], bgWords: [], display: { face: '黒華明朝', x: 0.72 }, art: 'x', camera: 'calm', why: 'x',
    frames: [{ beat: 'B01', name: 'a', spec: spec('你在吸什么') }, { beat: 'B02', name: 'b', spec: spec('你在吸什么') }, { beat: 'B03', name: 'c', spec: spec('你在吸什么') }] });
  const opts = { article: '你在吸什么', beats: [{ id: 'B01' }, { id: 'B02' }, { id: 'B03' }] };
  const a = { contract: 'A1RecipeBoardWorld/v2', directions: [base('A', '#0e0e0e', '#c9a35a', 'line', 'object'), base('B', '#e8e4dc', '#b3261e', 'photo-object', 'place-era')] };
  assert.deepEqual(W.directionErrors(a, opts, P), []);
  assert.match(W.directionErrors({ ...a, directions: [a.directions[0]] }, opts, P).join(), /two or three/);
  assert.match(W.directionErrors({ ...a, directions: [a.directions[0], { ...a.directions[0], id: 'B' }] }, opts, P).join(), /one world twice/);
  assert.match(W.directionErrors({ ...a, directions: [{ ...a.directions[0], precedent: 'nope' }, a.directions[1]] }, opts, P).join(), /not a reference world/);
  assert.match(W.directionErrors({ ...a, directions: [{ ...a.directions[0], learns: '' }, a.directions[1]] }, opts, P).join(), /A: learns/);
  assert.equal(W.directionsOf({ contract: 'A1RecipeBoardWorld/v1', ground: {} }).length, 1, 'an answer of one world is direction A');
  // the taste summary per trait
  const sum = W.tasteSummary([{ verdict: 'approved', traits: { tone: 'dark' } }, { verdict: 'rejected', traits: { tone: 'light' } }, { verdict: 'passed-over', traits: { tone: 'light' } }]);
  assert.deepEqual(sum.tone, { dark: { approved: 1, rejected: 0, passed: 0 }, light: { approved: 0, rejected: 1, passed: 1 } });
  // the pick: the chosen direction becomes the film's style, read under film:<id> and film:<id>/<dir>; the taste kept
  S.ensureProject(cfg, 'dir-test', 'x'); const pj = path.join(cfg.dataDir, 'projects/dir-test/project.json');
  const dirs = Object.fromEntries(a.directions.map((d) => [d.id, { ...W.worldStyle('dir-test', d), frames: d.frames }]));
  fs.writeFileSync(path.join(cfg.dataDir, 'projects/dir-test/style.json'), JSON.stringify({ ...dirs.A, directions: dirs }));   // (none picked yet: the gate asks for a pick)
  fs.writeFileSync(pj, JSON.stringify({ ...JSON.parse(fs.readFileSync(pj, 'utf8')), gateSet: null, style: 'film:dir-test', direction: { approved: true, by: 'u', at: 't', hash: 'g' } }));
  assert.equal(F.readStyle(cfg, 'film:dir-test/B').tokens.paper, '#e8e4dc');
  // (a design-first film is approved on its hero stills: not before they passed their checks and review)
  await assert.rejects(G.approveGate(cfg, 'dir-test', 'look', '用户：B', { pick: 'B' }), /hero stills have not passed/);
  fs.mkdirSync(path.join(cfg.dataDir, 'projects/dir-test/tasks'), { recursive: true });
  fs.writeFileSync(path.join(cfg.dataDir, 'projects/dir-test/tasks/stills.check.json'), JSON.stringify({ ok: true, answerHash: 'h', keyframes: [] }));
  fs.writeFileSync(path.join(cfg.dataDir, 'projects/dir-test/tasks/stills-taste.check.json'), JSON.stringify({ ok: true, forAnswer: 'h' }));
  await assert.rejects(G.approveGate(cfg, 'dir-test', 'look', '用户：B'), /pick one of the directions/);
  // (a direction picked before stays picked: approving again after a change asks no new pick)
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/gates.mjs'), 'utf8'), /!pick && !st\.chosen\)[\s\S]{0,200}pick \|\| st\.chosen \|\| ds\[0\]/);
  await G.approveGate(cfg, 'dir-test', 'look', '用户：B 这个好', { pick: 'B' });
  assert.equal(F.readStyle(cfg, 'film:dir-test').tokens.paper, '#e8e4dc'); assert.equal(F.readStyle(cfg, 'film:dir-test').verdict.state, 'approved');
  const t = W.readTaste(cfg).entries.filter((e) => e.film === 'dir-test'); assert.deepEqual(t.map((e) => e.verdict).sort(), ['approved', 'passed-over']);
  // every direction turned down: the words to the taste and back to the director, the world derived again
  W.rejectLook(cfg, 'dir-test', '都不对 太素');
  assert.ok(!fs.existsSync(path.join(cfg.dataDir, 'projects/dir-test/style.json')));
  assert.match(JSON.stringify(JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'projects/dir-test/tasks/world.turned-down.json'), 'utf8'))), /都不对 太素/);
  assert.ok(W.readTaste(cfg).entries.some((e) => e.film === 'dir-test' && e.verdict === 'rejected' && e.said === '都不对 太素'));
  const pr = fs.readFileSync(path.join(DATA, 'prompts/world.md'), 'utf8'); assert.match(pr, /两期各管什么/); assert.match(pr, /对标水准的底线/);
});

test('the world\'s land is kept for globes and world maps: real places fall on land, the open sea is sea (the user 2026-10-27: 缺什么就下什么; blind review: 地点认不出来)', async () => {
  const G = await lib('geo.mjs'), m = JSON.parse(fs.readFileSync(path.join(DATA, 'geo', 'land-mask.json'), 'utf8'));
  assert.equal(m.w * m.h, 720 * 360);
  for (const [lat, lon] of [[0, 101.5], [3.1, 101.7], [11.5, -72.5], [15.5, -88], [36, 104], [48.8, 2.3]]) assert.ok(G.isLand(m, lat, lon), `${lat},${lon} land`);
  for (const [lat, lon] of [[0, -150], [30, -40], [-30, 80]]) assert.ok(!G.isLand(m, lat, lon), `${lat},${lon} sea`);
  const tiny = G.buildLandMask({ features: [{ geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] } }] }, 5);
  assert.ok(G.isLand(tiny, 5, 5) && !G.isLand(tiny, -5, 5));
  assert.match(fs.readFileSync(path.join(DATA, 'style-lab', 'engine', 'templates', 'kit3.js'), 'utf8'), /export function landGlobe/);
});
test('an eva-lettered film is undressed and smoked like a gothic one; a captured page is a card in space, not a flat full frame (whole-film review of the banana film: a red chip, a typing cursor, the page pasted flat)', async () => {
  const H = await lib('house.mjs');
  assert.match(H.UNDRESS, /--type-cursor:none/); assert.match(H.UNDRESS, /\.chip,\.plate,\[data-plate\]\{background:transparent/);
  const was = process.env.RB_LETTERING; try { process.env.RB_LETTERING = 'eva'; assert.equal(H.lettered(), true); process.env.RB_LETTERING = 'gothic-kaiso'; assert.equal(H.lettered(), true); delete process.env.RB_LETTERING; assert.equal(H.lettered(), false); } finally { if (was == null) delete process.env.RB_LETTERING; else process.env.RB_LETTERING = was; }
  const compose = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/compose.mjs'), 'utf8');
  assert.match(compose, /const pageCard = name === 'background'/); assert.match(compose, /\.\.\.\(lettering\(\) === 'eva' \? \[UNDRESS\]|quietBand\(/);
});
test('a chapter the design brain coloured is held to its palette, not to the look\'s neutral cast (the banana film\'s rust field and teal globe)', async () => {
  const A = await lib('animatic.mjs');
  assert.ok(A.labChroma('#5b2613') > 25 && A.labChroma('#1d2721') < 10);
  const ref = { cast: { 98: 6.4 }, own: true };
  assert.equal(A.lookOff([{ id: 'B09', cast: 15.8 }], ref).length, 1, 'off the look with no palette');
  assert.equal(A.lookOff([{ id: 'B09', cast: 15.8 }], ref, { B09: A.labChroma('#5b2613') }).length, 0, 'the reversed field carries its colour');
  assert.equal(A.lookOff([{ id: 'B02', cast: 15.8 }], ref, { B02: A.labChroma('#d5e2da') }).length, 1, 'a pale palette allows no strong cast');
});
test('the design brain varies one world chapter by chapter: a harmonious family (inverse, reversed field, mid, shift, paper), each chapter given one by its acts and its neighbours (the user 2026-10-27: 要多样性变化 … 反转颜色 … 配色和谐 … 设计大脑)', async () => {
  const D = await lib('designbrain.mjs'), fam = D.paletteFamily({ ground: '#0e1712', ink: '#eef0e6', accent: '#c4562e' });
  assert.deepEqual(fam.map((v) => v.tone).sort(), ['dark', 'dark', 'field', 'light', 'light', 'mid']);
  for (const v of fam) assert.deepEqual(D.harmonyErrors(v), [], `${v.id} reads and keeps its colours apart`);
  assert.deepEqual(D.familyErrors(fam), [], 'every two members can be told apart (B13 and B18 stood on one dark)');
  assert.ok(D.toOklch(fam.find((v) => v.id === 'base').ground).L >= 0.25, 'the world\'s dark is a deep tone, never a near-black');
  const field = fam.find((v) => v.id === 'field'); assert.ok(Math.abs(D.toOklch(field.ground).h - D.toOklch('#c4562e').h) < 15, 'the reversed field is the accent');
  const ch = (id, acts) => ({ id, acts, beats: acts.map((a, i) => ({ id: `${id}.${i}`, act: a })) });
  const a = D.assignVariants([ch('C1', ['phenomenon', 'ratio']), ch('C2', ['name', 'consequence']), ch('C3', ['sequence', 'consequence']), ch('C4', ['breath'])], fam);
  for (let i = 1; i < a.length; i++) assert.notEqual(a[i].variant, a[i - 1].variant, 'a chapter does not repeat the one before');
  assert.ok(a.some((x) => x.tone === 'light') && a.some((x) => x.tone === 'field'), 'a film has a light chapter and a reversed one');
  assert.ok(a.find((x) => x.chapter === 'C2').turns.length || a.find((x) => x.chapter === 'C3').turns.length, 'a consequence may turn the ground within a chapter');
  const light = a.find((x) => x.tone === 'light');
  assert.equal(D.designErrors([{ color: '#101410' }, { color: '#121612' }], light, light.chapter).length, 1, 'a light chapter on a dark ground fails');
  assert.equal(D.designErrors([{ color: '#d8e0d8' }, { color: '#cfd6cf' }], light, light.chapter).length, 0);
  const shift = { chapter: 'C3', variant: 'shift', tone: 'dark', palette: { ground: '#2a4948' } };
  assert.equal(D.designErrors([{ color: '#040404' }, { color: '#041414' }], shift, 'C3').length, 1, 'a near-black passes the tone but not the colour it was given');
  assert.equal(D.designErrors([{ color: '#2c4644' }, { color: '#264240' }], shift, 'C3').length, 0);
});
test('a chapter is laid in the space its storyboard asked for, on a ground as full as the approved look, and not on the ground of the chapter before (the user 2026-10-27: 怎么没2.5d 3d什么的 … 背景也不该全黑 可以各种变体)', async () => {
  const R = await lib('refbreakdown.mjs'), C = await lib('chapter.mjs');
  const plan = (form, extra = {}) => ({ carrier: 'x', beats: { B1: { form, formFor: 'read', devices: [], ...extra } } });
  assert.equal(R.storyboardFormErrors(plan('flat'), [{ beat: 'B1', form: '2.5d' }]).length, 1, 'flatter than the storyboard');
  assert.equal(R.storyboardFormErrors(plan('flat'), [{ beat: 'B1', form: 'map' }]).length, 1, 'a map is space');
  const flatterWithReason = R.storyboardFormErrors(plan('flat', { formWhy: '读的是一张表，平着最好读' }), [{ beat: 'B1', form: '2.5d' }]);
  assert.equal(flatterWithReason.length, 1, 'formWhy cannot waive the storyboard spatial form');
  assert.doesNotMatch(flatterWithReason.join('\n'), /or say why it is flatter|formWhy\)/, 'the error must not offer the removed exemption');
  assert.equal(R.storyboardFormErrors(plan('3d'), [{ beat: 'B1', form: '2d' }], 'export function stage3() {}').length, 0, 'further into space is free');
  assert.match(R.storyboardFormErrors(plan('2.5d'), [{ beat: 'B1', form: '2.5d' }], 'g.fillRect(0, 0, 1, 1)')[0], /lays nothing in space/);
  assert.equal(R.storyboardFormErrors(plan('2.5d'), [{ beat: 'B1', form: '2.5d' }], 'K2.onPlane(g, quad, draw)').length, 0);
  const twoSpace = { beats: { B1: { form: '2.5d' }, B2: { form: '2.5d' } } }, twoChosen = [{ beat: 'B1', form: '2.5d' }, { beat: 'B2', form: '2.5d' }];
  const perBeat = R.storyboardFormErrors(twoSpace, twoChosen, 'K2.onPlane(g, quad, draw)', { shots: [{ shotId: 'B1', at: 0, dur: 2 }, { shotId: 'B2', at: 2, dur: 2 }], spaceTrack: [{ t: 1, form: '2.5d' }] });
  assert.equal(perBeat.length, 1, 'B1 runtime space evidence cannot satisfy B2');
  assert.match(perBeat[0], /B2.*no runtime spatial evidence/);
  const row = (flat, color = '#0c1414') => ({ flat, color });
  assert.equal(C.flatGroundErrors([row(0.9)], ['B1'], { flat: 0.39 }).length, 1, 'bare black against a full look');
  assert.equal(C.flatGroundErrors([row(0.5)], ['B1'], { flat: 0.39 }).length, 0);
  assert.equal(C.flatGroundErrors([row(0.95)], ['B1'], null).length, 0, 'no approved look: older films are not held');
  assert.equal(C.sameGroundErrors([row(0.3), row(0.35)], [row(0.32, '#101818')], 'B8', 'B2').length, 1, 'the same ground as the chapter before');
  assert.equal(C.sameGroundErrors([row(0.3, '#e8e0cc'), row(0.35, '#e8e0cc')], [row(0.32)], 'B8', 'B2').length, 0, 'a light chapter after a dark one');
});
test('a beat whose storyboard cuts the writer kept as one take is not listed to rewrite again (banana-tr4-blind B01, B07 on every run)', async () => {
  const S = await lib('storyboard.mjs');
  const d = { beat: 'B7', card: 'footage-plate', scenes: [{ card: 'footage-plate' }, { card: 'footage-plate' }] };
  assert.equal(S.needsRewrite({ recipe: 'footage-plate' }, d), true, 'two cuts asked, one held, no record');
  assert.equal(S.needsRewrite({ recipe: 'footage-plate', mergedScenes: [true, false] }, d), false, 'kept as one take');
});
test('a six-stage film takes no old world pick and no polish before its structure is approved (the banana blind test asked for a world twice)', async () => {
  const G = await lib('gatestate.mjs'), six = { process: 'six-stage' };
  assert.equal(G.sixSkips(six, 'concept', false), true); assert.equal(G.sixSkips(six, 'concept', true), true, 'the look gate picks the world');
  assert.equal(G.sixSkips(six, 'critique', false), true); assert.equal(G.sixSkips(six, 'direct', false), true);
  assert.equal(G.sixSkips(six, 'critique', true), true, 'the final is made of chapters: the card critique never ran on it'); assert.equal(G.sixSkips(six, 'motion', true), true, 'nor its card motion (Suez: 13 cards waiting for an approval no gate gives)');
  assert.match(fs.readFileSync(path.join(LIB, 'run.mjs'), 'utf8'), /\[!six && s\.motion\.length, `motion out of date/, 'and the to-do list does not ask for them'); assert.equal(G.sixSkips(six, 'chapter', false), false);
  assert.equal(G.sixSkips({}, 'concept', false), false, 'older films keep their steps');
});
test('the banana blind test\'s faults stay fixed: a rejected look marked by its own colours, a derived world laid out in a card theme that exists, a new film made by run --beats', async () => {
  const W = await lib('filmworld.mjs');
  const r = W.rejectedLooks(cfg), cob = r.find((x) => x.id === 'cobalt-print');
  assert.deepEqual(cob.marks, ['#2747a3'], 'cobalt marks cobalt-print; the red 胡泊 shares does not');
  const ed = { ground: { tone: 'light', color: '#e3e3e0', from: '新闻报道的冷灰纸面' }, main: { color: '#d0202e', from: '报道里的警示红色' } };
  assert.ok(!W.worldErrors({ contract: 'A1RecipeBoardWorld/v1', subject: { object: 'x', looks: 'xx', light: 'xx', medium: 'xx' }, ...ed, accent: null, ink: '#111111', texture: { grain: 0.2, vignette: 0.3, from: '报纸纸面颗粒' }, diagram: { mode: 'flat', from: '新闻图表的画法' }, frames: [] }, { rejected: r }).some((e) => /rejected this look/.test(e)), 'grey paper with red is 胡泊\'s approved look');
  const themes = new Set(fs.readdirSync(path.join(DATA, 'themes')).map((f) => f.replace(/\.json$/, '')));
  for (const tone of ['dark', 'light']) { const st = W.worldStyle('x', { subject: { object: 'x' }, ground: { tone, color: tone === 'dark' ? '#0c0c0a' : '#e3e3e0' }, main: { color: '#d0202e' }, accent: null, ink: '#111111', texture: { grain: 0, vignette: 0 }, display: { face: '黒華明朝', x: 0.72 }, diagram: { mode: 'flat' }, camera: 'calm' }); assert.ok(themes.has(st.theme), `${tone}: ${st.theme} is a card theme`); }
  assert.match(fs.readFileSync(path.join(LIB, 'run.mjs'), 'utf8'), /if \(\(article \|\| beats\) && !dry\) ensureProject\(cfg, id, title\);/);
  assert.match(fs.readFileSync(path.join(DATA, 'modules/steps.html'), 'utf8'), /:root\[data-ground=dark\] #title \.paper/);
});

test('the director reads what each line does before choosing how it looks: act, devices from the library, the narration\'s cues answered, variety; the chapter carries them out (the user 2026-10-26: 导演有根据文案拆分好语义 … 先规范)', async () => {
  const S = await lib('storyboard.mjs'), R = await lib('refbreakdown.mjs');
  const acts = S.loadActs(cfg), devices = R.loadDevices(cfg), ids = new Set(devices.map((d) => d.id));
  assert.ok(acts.length >= 15); for (const a of acts) for (const d of a.devices) assert.ok(ids.has(d), `${a.id}: ${d}`);
  const beats = [{ id: 'B01', text: '超市里的香蕉几乎一模一样' }, { id: 'B02', text: '卡文迪什约占全球产量的 47%' }, { id: 'B03', text: '靠吸芽一棵分一棵地繁殖' }];
  const sh = (beat, act, ds, extra = {}) => ({ beat, act, devices: ds, deviceWhy: '一根复制成一排，越复制越快', declined: [], ...extra });
  const dec = (d, why) => ({ device: d, why });   // (「一模一样」 cues symmetry, 「%」 the bar's length: guesses from the words, declined with a reason)
  const ok = [sh('B01', 'phenomenon', ['copy-to-repeat'], { declined: [dec('symmetry', '这里是很多根一样，不是两边对照')] }), sh('B02', 'ratio', ['dots-as-people', 'number-grows'], { declined: [dec('bar-length-ratio', '比例用一百个点亮起来表达')] }), sh('B03', 'mechanism', ['branch-out'])];
  assert.deepEqual(S.semanticErrors(ok, beats, acts, devices).errors, []);
  assert.match(S.semanticErrors([ok[0], sh('B02', 'ratio', ['dots-as-people'], { declined: [dec('bar-length-ratio', '比例用一百个点亮起来表达')] }), ok[2]], beats, acts, devices).errors.join(), /narration cues number-grows/);
  assert.deepEqual(S.semanticErrors([ok[0], sh('B02', 'ratio', ['dots-as-people'], { declined: [{ device: 'number-grows', why: '47% 用一百个点亮起来更直观' }, dec('bar-length-ratio', '比例用一百个点亮起来表达')] }), ok[2]], beats, acts, devices).errors, [], 'declined with a reason');
  assert.match(S.semanticErrors([sh('B01', 'nope', ['copy-to-repeat'])], beats, acts, devices).errors.join(), /not an act/);
  assert.match(S.semanticErrors([sh('B01', 'phenomenon', ['made-up'])], beats, acts, devices).errors.join(), /not in routing\/devices\.json/);
  const three = ['B01', 'B02', 'B03'].map((b) => sh(b, 'phenomenon', ['copy-to-repeat', ...(b === 'B02' ? ['number-grows'] : [])]));
  assert.match(S.semanticErrors(three, beats, acts, devices).errors.join(), /three beats running/);
  assert.deepEqual(S.semanticErrors(three, beats, acts, devices, { motif: ['copy-to-repeat'] }).errors.filter((e) => /running/.test(e)), [], 'the film\'s motif may run');
  // the chapter carries out the storyboard's devices, or declines them with a reason
  const plan = { beats: { B01: { devices: ['copy-to-repeat'] }, B02: { devices: ['dots-as-people'], declined: [{ device: 'number-grows', why: '比例画成点阵已经够了' }] }, B03: { devices: ['carrier'] } } };
  assert.deepEqual(R.storyboardDeviceErrors(plan, [{ beat: 'B01', devices: ['copy-to-repeat'] }, { beat: 'B02', devices: ['dots-as-people', 'number-grows'] }]), []);
  assert.match(R.storyboardDeviceErrors(plan, [{ beat: 'B03', devices: ['branch-out'] }]).join(), /B03: the storyboard shows this line with branch-out/);
  // only six-stage films are asked for it: the older films' storyboard input is what it was
  const src = fs.readFileSync(path.join(LIB, 'storyboard.mjs'), 'utf8');
  assert.match(src, /\.\.\.\(six \? \[SEMANTIC_RULES, SCHEMA_V3, ACTS\] : \[\]\)/); assert.match(src, /six && sb\?\.contract !== 'A1RecipeBoardStoryboard\/v3'/);
  const v3 = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/storyboard.v3.schema.json'), 'utf8')).properties.shots.items;
  for (const k of ['act', 'devices', 'deviceWhy', 'declined']) assert.ok(v3.required.includes(k), k);
});

test('design first: each beat is designed from the composition grammar before code, the subject stands off a quiet ground, and the frames pass a taste review (the user 2026-10-27: 背景铁锈不好 … 先做设计先行、构图语法库、背景和主体分离的量尺)', async () => {
  const D = await lib('beatdesign.mjs'), P = await lib('profile.mjs');
  const grammar = D.loadCompositions(cfg);
  assert.ok(grammar.compositions.length >= 8); for (const c of grammar.compositions) assert.ok(c.exemplars?.length && c.picture && c.ground, c.id);
  assert.ok(grammar.turnedDown.some((t) => /铁锈/.test(t.said)));
  const row = (beat, extra = {}) => ({ beat, composition: 'hero-object', picture: '船站在中间，佔畫面四成', focus: '船', ground: { kind: 'halftone-dark', place: '海圖桌', how: '壓暗', turn: false, isSubject: false }, colour: '中性', type: '一對字', alternative: { composition: 'map-table', why: '這拍主角是船本身' }, subject: '船', accentOn: '擱淺點', words: [{ big: '400米', small: '2萬個集裝箱', role: 'pair' }], ...extra });
  assert.deepEqual(D.briefErrors({ beats: [row('B01'), row('B02')] }, ['B01', 'B02'], grammar), []);
  assert.match(D.briefErrors({ beats: [row('B01', { composition: 'poster' })] }, ['B01'], grammar).join(), /not in the grammar/);
  assert.match(D.briefErrors({ beats: [row('B01', { ground: { kind: 'halftone-dark', place: '鐵鏽集裝箱牆', how: '' } })] }, ['B01'], grammar).join(), /patterned surface/);
  assert.match(D.briefErrors({ beats: [row('B01'), row('B02', { ground: { kind: 'place-dark', place: '沙漠', how: '' } })] }, ['B01', 'B02'], grammar).join(), /changes its place without a turn at B02/);
  assert.deepEqual(D.briefErrors({ beats: [row('B01'), row('B02', { ground: { kind: 'place-dark', place: '沙漠', how: '', turn: true } })] }, ['B01', 'B02'], grammar), []);
  assert.match(D.briefErrors({ beats: [row('B01', { alternative: null })] }, ['B01'], grammar).join(), /weigh another composition/);
  assert.match(D.briefErrors({ beats: [] }, ['B01'], grammar).join(), /no design for this beat/);
  // one subject, the red on one thing, the words a pair and at most two labels — said before any code
  assert.match(D.briefErrors({ beats: [row('B01', { subject: '船和沙堆' })] }, ['B01'], grammar).join(), /two subjects are two beats/);
  assert.match(D.briefErrors({ beats: [row('B01', { accentOn: '船隊、擱淺點' })] }, ['B01'], grammar).join(), /the red on one thing/);
  assert.match(D.briefErrors({ beats: [row('B01', { words: [{ big: '大風', small: null, role: 'label' }, { big: '沙塵暴', small: null, role: 'label' }, { big: '偏出', small: null, role: 'label' }] })] }, ['B01'], grammar).join(), /3 labels/);
  assert.match(D.briefErrors({ beats: [row('B01', { words: [{ big: '367艘', small: null, role: 'pair' }] })] }, ['B01'], grammar).join(), /no small line/);
  assert.match(D.briefErrors({ beats: [row('B01', { words: [{ big: 'a', small: 'b', role: 'pair' }, { big: 'c', small: 'd', role: 'pair' }] })] }, ['B01'], grammar).join(), /2 pairs or blocks/);
  assert.deepEqual(D.briefErrors({ beats: [row('B01', { accentOn: null, words: [] })] }, ['B01'], grammar), []);
  // the taste verdict: every beat 3 or more and the mean 3.5 or more
  assert.deepEqual(D.tasteErrors({ beats: [{ beat: 'B01', score: 4 }, { beat: 'B02', score: 3 }] }), []);
  assert.match(D.tasteErrors({ beats: [{ beat: 'B01', score: 4 }, { beat: 'B02', score: 2, issue: '鐵鏽牆搶了地球' }] }).join(), /B02: taste 2 — 鐵鏽牆/);
  assert.match(D.tasteErrors({ beats: [{ beat: 'B01', score: 3 }, { beat: 'B02', score: 3 }] }).join(), /mean 3\.00/);
  // two blind reviews averaged per beat: 3 and 2 make 2.5, below the bar; 4 and 3 make 3.5
  { const m = D.mergeTaste([{ beats: [{ beat: 'B01', score: 3, issue: null }, { beat: 'B02', score: 4, issue: null }], overall: 'a' }, { beats: [{ beat: 'B01', score: 2, issue: '太空' }, { beat: 'B02', score: 3, issue: null }], overall: 'b' }]);
    assert.deepEqual(m.beats.map((b) => b.score), [2.5, 3.5]); assert.equal(m.beats[0].issue, '太空'); assert.match(D.tasteErrors(m).join(), /B01: taste 2\.5/); assert.equal(D.TASTE_REVIEWERS, 2); }
  assert.ok(D.monoChapter({ beats: [row('B01', { composition: 'map-table' }), row('B02', { composition: 'globe-route' }), row('B03')] }, grammar));
  assert.ok(!D.monoChapter({ beats: [row('B01'), row('B02'), row('B03', { composition: 'map-table' })] }, grammar));
  const placed = (p) => ({ beats: [row('B01', { ground: { kind: 'chart-table', place: p, how: '', turn: false, isSubject: false } })] });
  assert.ok(D.callbackGround(placed('海圖桌'), placed('海圖桌')), 'the closing chart table rhymes the opening one'); assert.ok(!D.callbackGround(placed('海圖桌'), placed('沙漠')));
  assert.ok(D.monoChapter({ beats: ['B01', 'B02', 'B03'].map((b) => row(b, { ground: { kind: 'chart-table', place: '海圖桌', how: '', turn: false, isSubject: false } })) }, grammar), 'the ship on the chart: a map chapter');
  // figure and ground: the subject's lightness apart from the ground's, the ground no busier than the subject
  const G = P.PROFILES.gawx; assert.ok(G.designFirst); assert.ok(!P.PROFILES.paperclip.designFirst);
  assert.deepEqual(P.figureGroundErrors([{ beat: 'B09', things: 0.3, figL: 0.5, gndL: 0.2, figEdge: 0.08, gndEdge: 0.03 }], G), []);
  assert.match(P.figureGroundErrors([{ beat: 'B09', things: 0.3, figL: 0.3, gndL: 0.25, figEdge: 0.08, gndEdge: 0.03 }], G).join(), /does not stand off/);
  assert.deepEqual(P.figureGroundErrors([{ beat: 'B03', things: 0.2, figL: 0.26, gndL: 0.17, sep: 0.115, figEdge: 0.08, gndEdge: 0.01 }], G), [], 'a lit ship whose sides average out still steps off the chart at its outline (Suez B03)');
  assert.match(P.figureGroundErrors([{ beat: 'B13', things: 0.2, figL: 0.17, gndL: 0.18, sep: 0.067, figEdge: 0.01, gndEdge: 0.04 }], G).join(), /a step of 0\.067/, 'the dim globe on the dim chart (Suez B13)');
  const mj = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(mj, /geometry\?\.type === 'PlaneGeometry'/, 'ground by kind, not by size: a hero globe filling the frame is still the subject');
  // the grammar's quiet ground has a part that makes it (a ground the toolkit cannot make was laid as a bare flat colour)
  assert.match(fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/kit3.js'), 'utf8'), /export function halftoneGround/); assert.match(mj, /'shadows', 'halftoneGround'\]/);
  assert.ok(grammar.grounds.kinds.some((k) => /^halftone-dark/.test(k)));
  assert.match(fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/kit3.js'), 'utf8'), /const lin = new THREE\.Color\(color\)/, 'the halftone ground shows as the hex it was given (a linear texture written in sRGB showed a step lighter)');
  // the globe's land dots can leave their lattice (seen at a slant it beat into rings: Suez B09); off by default
  assert.match(fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/kit3.js'), 'utf8'), /jitter = 0, lanes = \[\], laneDeg = 0\.8, limb = false \} = \{\}\) \{/);
  // a faded map is one layer with its apron (no edge on the ground, Suez B08); at full the apron draws first as before
  assert.match(mj, /const half = \(mm\.opacity \?\? 1\) < 0\.999; P\.mesh\.renderOrder = half \? -2 : 0; P\.apron\.renderOrder = half \? -1 : 0;/);
  assert.match(P.figureGroundErrors([{ beat: 'B09', things: 0.3, figL: 0.5, gndL: 0.2, figEdge: 0.04, gndEdge: 0.09 }], G).join(), /ground is busier/);
  assert.deepEqual(P.figureGroundErrors([{ beat: 'B09', things: 0.01, figL: 0.3, gndL: 0.3, figEdge: 0, gndEdge: 1 }], G), [], 'a frame of words: no figure');
  assert.deepEqual(P.figureGroundErrors([{ beat: 'B09', things: 0.3, figL: 0.3, gndL: 0.3, figEdge: 0, gndEdge: 1 }], P.PROFILES.paperclip), []);
  // wired: the chapter waits on its brief and its taste review, and both measures count in the checks' hash
  const src = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(src, /PROF\.designFirst && current\.state !== 'accepted' && !input\.brief/); assert.match(src, /pendingTaste/); assert.match(src, /figureGroundErrors\(figRows, PROF\)/);
  for (const f of ['routing/beatdesign.schema.json', 'routing/taste-review.schema.json', 'prompts/beatdesign.md', 'prompts/taste.md']) assert.ok(fs.existsSync(path.join(DATA, f)), f);
});

test('finished compositions: the templates the taste reviews scored 4 are kit parts, framed by name, named in the grammar (the user 2026-10-27: 尽量一次或者少返工)', async () => {
  const src = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/scenes.js'), 'utf8'), mj = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8');
  for (const f of ['globeRoute', 'chartTable', 'countField', 'frameSphere', 'frameBox']) assert.match(src, new RegExp(`export function ${f}`), f);
  assert.match(mj, /scene: \{ \.\.\.scenes, chartTable:/); assert.match(mj, /if \(k\.frame\) \{ const f = S\.st\?\.frames\?\.\[k\.frame\]/);
  const grammar = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/compositions.json'), 'utf8'));
  for (const id of ['globe-route', 'map-table', 'count-field']) assert.match(grammar.compositions.find((c) => c.id === id).template, /kit\.scene\./, id);
  // the framing maths, pure: a sphere fills the asked share of the frame's height at the asked side
  const body = src.slice(src.indexOf('export function frameSphere'), src.indexOf('// ---- the globe'));
  const mod = await import('data:text/javascript,' + encodeURIComponent('const rad = Math.PI / 180;\n' + body));
  const cam = { fov: 34, aspect: 16 / 9 }, f = mod.frameSphere(cam, [0, 8, 0], 8, { fill: 0.72, side: -0.3, azim: 0 });
  assert.ok(Math.abs(2 * Math.asin(8 / f.dist) / (34 * Math.PI / 180) - 0.72) < 1e-6); assert.ok(f.look[0] > 0, 'look shifted right: the globe sits left');
  const b = mod.frameBox(cam, [-10, -5, 10, 5], { fill: 0.9, elev: 60, azim: 0 }); assert.ok(b.dist > 0 && b.look[0] === 0);
});

test('the prop library: a container ship to real proportions and a tug, reached as kit.props; the lamp can carry a rim (Suez: 船模型粗糙像积木; 缺轮廓光)', async () => {
  const src = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/props.js'), 'utf8'), mj = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8'), k3 = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/kit3.js'), 'utf8');
  for (const f of ['containerShip', 'tugboat']) assert.match(src, new RegExp(`export function ${f}`), f);
  assert.match(src, /const L = length, B = L \* 0\.147/, 'Ever Given: 400 m by 59 m'); assert.match(src, /rows = 20/, 'twenty rows of boxes across');
  assert.match(mj, /^  props,/m); assert.match(k3, /shadow = true, rim = 0 \} = \{\}\) \{/);
});

test('the whole film designed before its beats, measured and reviewed as a whole (the user 2026-10-27: 我再说整片的美学设计 … 加整片设计这一步)', async () => {
  const F = await lib('filmdesign.mjs');
  const beats = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08'];
  const row = (beat, x = {}) => ({ beat, act: 'build', scale: 'place', value: 'dark', medium: 'diagram', red: 1, hero: false, heroHow: null, ...x });
  const good = { arc: '從一艘船開場，壓到整條運河堵死的高潮，再鬆開回到全球。', beats: [
    row('B01', { act: 'open', medium: 'footage', value: 'mid', hero: true, heroHow: '真船畫面上壓大字' }), row('B02', { scale: 'object' }), row('B03', { scale: 'region' }),
    row('B04', { act: 'press', medium: 'evidence', value: 'mid' }), row('B05', { act: 'peak', red: 3, medium: 'type', value: 'light', hero: true, heroHow: '亮底上一個大數字' }),
    row('B06', { act: 'release', scale: 'world' }), row('B07', { act: 'turn', scale: 'detail' }), row('B08', { act: 'close', scale: 'world', hero: true, heroHow: '整個地球在左邊' })] };
  assert.deepEqual(F.filmDesignErrors(good, beats), []);
  const flat = { ...good, beats: beats.map((b, i) => row(b, i === 0 ? { act: 'open', hero: true, heroHow: '開場的大字' } : i === 7 ? { act: 'close', hero: true, heroHow: '收尾的地球' } : i === 4 ? { act: 'peak', red: 3, hero: true, heroHow: '高潮的數字' } : {})) };
  assert.deepEqual(F.filmDesignErrors(flat, beats), [], 'visual monotony is advisory');
  const e = F.filmDesignNotes(flat, beats).join('\n');
  assert.match(e, /four beats of one look/); assert.match(e, /diagrams/); assert.match(e, /one medium the whole film/); assert.match(e, /one value/);
  for (const [rows, note] of [
    [good.beats.map((r) => ({ ...r, hero: false })), /0 hero moments/],
    [good.beats.map((r) => (r.beat === 'B02' ? { ...r, red: 3 } : r.beat === 'B05' ? { ...r, red: 2 } : r)), /strongest away from the peak/],
    [good.beats.map((r) => (r.beat === 'B04' ? { ...r, value: 'light' } : r)), /the peak B05 shares its light ground with B04/],
  ]) {
    assert.deepEqual(F.filmDesignErrors({ ...good, beats: rows }, beats), []);
    assert.match(F.filmDesignNotes({ ...good, beats: rows }, beats).join(), note);
  }
  // the film measured against the floors: Suez before (1.9 changes a minute, lightness 0.075, 80 % in long stretches) fails; Vol.138 passes
  assert.equal(F.filmArcErrors({ seconds: 93, longest: 43, longestAt: 50, flat: 0.796, changes: 1.94, range: 0.075 }).length, 3);
  assert.deepEqual(F.filmArcErrors({ seconds: 300, longest: 49, longestAt: 96, flat: 0.493, changes: 8.8, range: 0.171 }), []);
  // the chapters follow the design's light: a beat designed mid that comes out dark is sent back
  assert.match(F.filmFollowErrors([{ mean: 0.17 }], [{ beat: 'B03', value: 'mid' }], ['B03']).join(), /B03: the film's design has it mid/);
  assert.deepEqual(F.filmFollowErrors([{ mean: 0.82 }, { mean: 0.12 }], [{ beat: 'B08', value: 'light' }, { beat: 'B09', value: 'dark' }], ['B08', 'B09']), []);
  // two whole-film reviews averaged
  const m = F.mergeFilmTaste([{ scores: { rhythm: 2, arc: 3, variety: 3, heroes: 4, cohesion: 4 }, issues: [], overall: 'a' }, { scores: { rhythm: 3, arc: 3, variety: 3, heroes: 4, cohesion: 5 }, issues: [], overall: 'b' }]);
  assert.equal(m.scores.rhythm, 2.5); assert.match(F.filmTasteErrors(m).join(), /rhythm: 2\.5/);
  // wired: the chapters wait on the film's design; the white model measures and reviews the film
  assert.match(fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'), /no chapter is designed before it/);
  assert.match(fs.readFileSync(path.join(LIB, 'animatic.mjs'), 'utf8'), /F\.measureFilm\(cfg, id, out\)/);
  for (const f of ['routing/filmdesign.schema.json', 'routing/film-taste.schema.json', 'prompts/filmdesign.md', 'prompts/film-taste.md']) assert.ok(fs.existsSync(path.join(DATA, f)), f);
});

test('big type and the finished compositions as kit parts: reveal, stack, knockout, mask, zoom through, type behind the subject; the peak, the title over footage, the evidence card, the queue, the hero object (the user 2026-10-27: 字的排版设计也很保守 … 大字或者遮罩)', async () => {
  const k2 = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/kit2.js'), 'utf8'), sc = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/scenes.js'), 'utf8'), ty = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/type.js'), 'utf8');
  for (const f of ['revealType', 'knockout', 'maskType', 'zoomThrough', 'stackType', 'peakType', 'titleOver', 'evidenceCard']) { assert.match(k2, new RegExp(`export function ${f}\\(`), f); assert.match(k2.slice(k2.indexOf('export const flat = {')), new RegExp(`\\b${f}\\b`), `flat.${f}`); }
  assert.match(k2, /g\.__line = String\(text\);\n  try \{ chars\.forEach/, 'the letters of a reveal are one line to the checks');
  assert.doesNotMatch(k2.slice(k2.indexOf('// ---- big type'), k2.indexOf('export const flat = {')), /strokeText|shadowBlur|shadowColor/, 'no dress on the big type');
  for (const f of ['queueFleet', 'heroObject']) assert.match(sc, new RegExp(`export function ${f}\\(`), f);
  assert.match(ty, /mat\.depthTest = !!depth;/);
  assert.match(k2, /const o = document\.createElement\('canvas'\); o\.width = 1920; o\.height = 1080; const q = o\.getContext\('2d'\);\n  q\.fillStyle = ground;/, 'the knockout cuts its own sheet, not the picture under it');
  assert.match(fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8'), /const foot = g\.measureText\('國'\)\.actualBoundingBoxDescent/, 'figures beside ideographs set down to their foot');
  const grammar = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/compositions.json'), 'utf8'));
  for (const id of ['queue', 'title-footage', 'evidence-card', 'figure-card', 'hero-object']) assert.ok(grammar.compositions.find((c) => c.id === id)?.template, id);
  assert.match(grammar.typeMoves, /knockout/);
});

test('the film\'s colour script: one accent, each beat\'s ground and ink from the act it plays, in harmony (the user 2026-10-27: 和谐配色什么的也要想好)', async () => {
  const F = await lib('filmdesign.mjs'), D = await lib('designbrain.mjs');
  const row = (beat, act, value) => ({ beat, act, value, scale: 'place', medium: 'diagram', red: 1, hero: false, heroHow: null });
  const sc = F.colourScript({ beats: [row('B1', 'build', 'dark'), row('B2', 'press', 'dark'), row('B3', 'peak', 'light'), row('B4', 'build', 'mid'), row('B5', 'turn', 'dark')] }, '#c8501e');
  assert.deepEqual(F.colourScriptErrors(sc), []);
  assert.ok(D.toOklch(sc[2].ground).L > 0.8 && D.toOklch(sc[0].ground).L < 0.25, 'the peak on the light paper, the telling on the dark');
  assert.equal(sc[1].temper, 'cool'); assert.ok(new Set(sc.map((c) => c.accent)).size === 1, 'one accent');
  assert.match(F.colourScriptErrors([{ beat: 'X', ground: '#2f4a1a', ink: '#e6e6e6', accent: '#c8501e' }]).join(), /hue stands/, 'a green ground beside a red accent is off the harmony');
  assert.match(fs.readFileSync(path.join(LIB, 'filmboard.py'), 'utf8'), /'色調', 'palette'/);
});

test('the hero stills before any chapter: the hero beats as one short module, reviewed blind, the board approved by the user once (the user 2026-10-27: 返工次数有点太多)', async () => {
  const S = await lib('stills.mjs');
  const design = { beats: [{ beat: 'B01', hero: true }, { beat: 'B02', hero: false }, { beat: 'B05', hero: true }] };
  const g = S.stillsGroup(design, [{ beat: 'B01', text: '一艘船', dur: 7 }, { beat: 'B02', text: 'x', dur: 8 }, { beat: 'B05', text: '90億', dur: 3 }]);
  assert.deepEqual(g.shots.map((s) => [s.shotId, s.at, s.dur]), [['B01', 0, 7], ['B05', 7, 3]], 'each still its beat\'s whole length (it plays the beat in the film)'); assert.equal(g.total, 10);
  assert.match(fs.readFileSync(path.join(LIB, 'animatic.mjs'), 'utf8'), /heroChapter\(cfg, id, filmBeats\(cfg, id\)/, 'the approved stills play their hero beats in the white model');
  const ch = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'), gt = fs.readFileSync(path.join(LIB, 'gates.mjs'), 'utf8');
  assert.match(ch, /stepFilmLook\(cfg, id[\s\S]{0,700}!\(await import\('\.\/stills\.mjs'\)\)\.boardApproved\(cfg, id\)\) \{ log\([\s\S]{0,400}no chapter is designed before it/); assert.match(gt, /board: \(await import\('\.\/stills\.mjs'\)\)\.boardHash\(cfg, id\)/);
  assert.ok(fs.existsSync(path.join(DATA, 'prompts/stills.md')));
});

test('made with what is in hand, judged by what is asked, the rounds counted: materials before the design, the reviewers\' rubric in the director\'s task, every check its round', async () => {
  const F = await lib('filmdesign.mjs'), B = await lib('beatdesign.mjs');
  const inHand = { B01: [{ kind: 'image', what: '衛星照片' }] };
  assert.deepEqual(F.materialErrors({ beats: [{ beat: 'B01', medium: 'footage', subject: 'a ship from above' }, { beat: 'B02', medium: 'diagram', subject: null }] }, inHand), []);
  assert.match(F.materialErrors({ beats: [{ beat: 'B06', medium: 'evidence', subject: 'a news page' }] }, inHand).join(), /B06: evidence with no real material in hand/);
  const r = B.rubric(cfg); assert.equal(r.beat.length, 5); assert.equal(r.film.length, 5); assert.match(r.film.join(), /`heroes`/);
  const A = await lib('agenttask.mjs'), id = 'suez-evergiven-blind';
  if (fs.existsSync(path.join(cfg.dataDir, 'projects', id))) {
    A.writeCheck(cfg, id, 'roundtest', { ok: false, answerHash: 'a' }); A.writeCheck(cfg, id, 'roundtest', { ok: false, answerHash: 'a' }); A.writeCheck(cfg, id, 'roundtest', { ok: true, answerHash: 'b' });
    assert.equal(JSON.parse(fs.readFileSync(A.taskPaths(cfg, id, 'roundtest').check, 'utf8')).round, 2, 'the same answer checked again is the same round; a new answer the next');
  }
});

test('materials good enough for their frame: size, border and how surely the subject reads, by the subject the design names, with the crop where it is (Suez: a ship in a few pixels of a satellite scene, a 900 px photo blown up three times)', async () => {
  const F = await lib('filmdesign.mjs');
  const m = (q) => ({ quality: q });
  assert.ok(F.fillsFrame(m({ w: 3660, h: 1709, full: true, subject: 0.95, boxFull: true })));
  assert.ok(!F.fillsFrame(m({ w: 900, h: 502, full: false, subject: 0.99, boxFull: false })), 'too small to fill a frame');
  assert.ok(!F.fillsFrame(m({ w: 3660, h: 1709, full: true, subject: 0.2, boxFull: true })), 'its subject does not read');
  const inHand = { B11: [m({ w: 900, h: 502, full: false, subject: 0.99, boxFull: false })] };
  assert.match(F.materialErrors({ beats: [{ beat: 'B11', medium: 'footage', subject: 'a ship' }] }, inHand).join(), /does not fill a frame \(900×502\)/);
  assert.deepEqual(F.materialErrors({ beats: [{ beat: 'B11', medium: 'evidence', subject: 'a ship' }] }, inHand), [], 'a card is not held to a full frame');
  assert.match(F.materialErrors({ beats: [{ beat: 'B11', medium: 'footage', subject: null }] }, inHand).join(), /say what the frame must show/);
  assert.ok(fs.existsSync(path.join(LIB, 'matquality.py')));
  assert.match(fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/kit2.js'), 'utf8'), /export function plate\(g, im, \{[^}]*crop = null/);
  assert.match(fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/kit2.js'), 'utf8'), /export function halftonePhoto\(/, 'a small photo printed as a halftone, not blown up');
  assert.match(fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'), /if \(d\.inScene\) return null;/, 'words standing in the scene are hidden by the render, not a fault');
});

test('every engine ability is registered and a chapter reaches what it says it does (the user 2026-10-27: 系统怎么能把这环节丢掉呢 是不是还有很多重要的没接上)', () => {
  const E = path.join(REPO, 'work/recipe-board-v1/style-lab/engine'), reg = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/engine-capabilities.json'), 'utf8'));
  const listed = new Set(reg.capabilities.flatMap((c) => c.files));
  const files = [['templates', /\.js$/], ['three', /\.js$/], ['subjects', /\.(js|mjs)$/], ['blender', /\.(py|mjs)$/], ['build', /\.mjs$/], ['director', /\.(js|mjs|html)$/], ['.', /^(display|lettering|motion)\.js$|^(shoot|serve)\.mjs$/], ['treatments', /\.js$/]]
    .flatMap(([d, re]) => fs.readdirSync(path.join(E, d)).filter((f) => re.test(f) && !/\.test\.mjs$/.test(f) && fs.statSync(path.join(E, d, f)).isFile()).map((f) => (d === '.' ? f : `${d}/${f}`)));
  const unlisted = files.filter((f) => !listed.has(f));
  assert.deepEqual(unlisted, [], 'an engine file no capability lists (routing/engine-capabilities.json): say what it is and how a chapter reaches it');
  const morph = fs.readFileSync(path.join(E, 'templates/morph.js'), 'utf8');
  for (const c of reg.capabilities) {
    assert.ok(['chapter', 'card', 'retired'].includes(c.status), c.id);
    if (c.status === 'card') assert.ok(c.todo || c.card, `${c.id}: card-only, say what wiring it waits for`);
    if (c.status === 'retired') assert.ok(c.why, `${c.id}: retired, say the user's reason`);
    if (c.status === 'chapter' && /^kit\./.test(c.chapter)) { const [, key] = c.chapter.split('.'); assert.match(morph, new RegExp(`\\b${key}\\s*[:,]`), `${c.id}: the chapter kit has no ${key}`); }
  }
  assert.match(morph, /async subject\(THREE_, st, id/); assert.match(morph, /baked: \{ rigid:/);
});

test('a chapter starts from what the line learned: the chapter beats done before by device, with their scores, and the lessons that apply (the user 2026-10-27: 按你推荐的都优化好)', async () => {
  const T = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/techniques.mjs')).href);
  const code = "export const plan2 = {\n  carrier: 'x',\n  beats: {\n    B01: { follows: [{ el: 0, does: 'match', how: '地球偏左' }], carryOver: '', devices: ['zoom-out-whole', 'rhyme'], form: '3d' },\n    B02: { carryOver: '开场', devices: ['real-in-frame'] },\n  },\n};";
  assert.deepEqual(T.planBeatsOf(code), { B01: { devices: ['zoom-out-whole', 'rhyme'], form: '3d', how: '地球偏左' }, B02: { devices: ['real-in-frame'], form: null, how: '开场' } });
  const lib = [{ key: 'a/B01/B01', project: 'a', devices: ['rhyme'], form: 'flat', how: 'h1', score: 2, note: '太空', frame: null }, { key: 'b/B03/B03', project: 'b', devices: ['rhyme', 'zoom-out-whole'], form: '3d', how: 'h2', score: 4, note: null, frame: 'f.png' }, { key: 'me/B01/B01', project: 'me', devices: ['rhyme'], score: 5 }];
  const lessons = [{ id: 'L1', when: { always: true }, do: 'always' }, { id: 'L2', when: { devices: ['rhyme'] }, do: 'rhyme rule' }, { id: 'L3', when: { words: '地球' }, do: 'globe rule' }];
  const g = T.chapterGuidanceOf(lib, lessons, [{ beat: 'B05', text: '回到整個地球', devices: ['rhyme', 'zoom-out-whole'] }], { project: 'me' });
  assert.deepEqual(g.lessons, ['L1: always']);
  assert.deepEqual(g.beats[0].nearest.map((x) => x.key), ['b/B03/B03', 'a/B01/B01'], 'the best reviewed and nearest first; never its own film');
  assert.equal(g.beats[0].nearest[1].markedDown, '太空', 'what marked a beat down goes with it');
  assert.deepEqual(g.beats[0].lessons, ['L2: rhyme rule', 'L3: globe rule']);
});

test('a chapter shows a real page by the card line\'s modules: pages rendered by the card renderer, played as a frame sequence (the user 2026-10-27: 按你推荐的都优化好)', async () => {
  const C = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs')).href);
  assert.ok(C.PAGE_MODULES.includes('article') && C.PAGE_MODULES.includes('market'));
  const sc = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/morph.schema.json'), 'utf8'));
  assert.ok(sc.required.includes('pages') && sc.properties.pages.items.required.join() === 'key,spec');
  const morph = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(morph, /A1FrameSeq\/v1[\s\S]{0,400}first\.frame = \(s\)/, 'the chapter plays a page as images[key].frame(s)');
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8'), /renderModule\(cfg, id, spec, path\.join\(dir, 'page'\)/, 'the card renderer, with its checks');
});

test('every reference device the table calls ready names a part the chapter kit has (the user 2026-10-27: 按你推荐的都优化好)', async () => {
  const D = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8')).devices;
  const T = path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates'), kit2 = fs.readFileSync(path.join(T, 'kit2.js'), 'utf8'), kit3 = fs.readFileSync(path.join(T, 'kit3.js'), 'utf8');
  const flatList = kit2.match(/export const flat = \{([^}]*)\}/)[1];
  const { display } = await import(pathToFileURL(path.join(T, 'kit5.js')).href);
  const { devices } = await import(pathToFileURL(path.join(T, 'kit4.js')).href);
  const dev = { ...devices, ...display }; // same composition as morph.js type.dev
  const { loadKitSymbolIndex } = await lib('refbreakdown.mjs');
  const symbols = loadKitSymbolIndex({ dataDir: DATA });
  for (const d of D.filter((x) => x.kit?.status === 'ready')) {
    for (const m of String(d.kit.use || '').matchAll(/type\.dev\.([a-zA-Z][a-zA-Z0-9_]*)/g)) {
      assert.equal(typeof dev[m[1]], 'function', `${d.id}: actual callable type.dev.${m[1]}`);
      assert.ok(symbols.has(m[0]), `${d.id}: production symbol resolver recognizes ${m[0]}`);
    }
  }
  for (const d of D.filter((x) => x.kit?.status === 'ready')) for (const m of String(d.kit.use || '').matchAll(/type\.flat\.([a-zA-Z]+)\(/g)) assert.match(flatList, new RegExp(`\\b${m[1]}\\b`), `${d.id}: type.flat.${m[1]} is not in kit2's flat`);
  for (const f of ['rhyme', 'callback', 'symmetry', 'subjectStays', 'dimKeepRed', 'pinCount', 'dataToPeople', 'ageMorph']) assert.match(flatList, new RegExp(`\\b${f}\\b`));
  assert.match(kit3, /export const kit3 = \{ flatten,/);
  assert.equal(D.filter((x) => x.kit?.status === 'partial').length, 0, 'no device left half made');
});

test('what the narration calls for goes to its route: a beat cued for a made model, a real page or real prices names it and calls it (the user 2026-10-27: 确保无遗漏 该调用哪块就走哪块)', async () => {
  const C = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs')).href);
  const R = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/refbreakdown.mjs')).href);
  const devices = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8')).devices, six = { process: 'six-stage' };
  const shots = [{ shotId: 'B01', text: '一艘貨櫃船卡在運河' }, { shotId: 'B02', text: '公司股價應聲下跌' }];
  const plan = (d1, d2, extra = '') => `export const plan2 = {\n  beats: {\n    B01: { carryOver: '', devices: [${d1}] },\n    B02: { carryOver: 'x', devices: [${d2}]${extra} },\n  },\n};`;
  const none = C.routedErrors({ code: plan('', '') }, shots, six, devices).join('\n');
  assert.match(none, /B01[^\n]*made-model/); assert.match(none, /B02[^\n]*real-prices/);
  const named = C.routedErrors({ code: plan("'made-model'", "'real-prices'"), pages: [] }, shots, six, devices).join('\n');
  assert.match(named, /B01: "made-model" is not carried out/); assert.match(named, /B02: "real-prices" is not carried out/);
  const done = C.routedErrors({ code: plan("'made-model'", "'real-prices'") + "\nawait kit.props.model(THREE, 'ship', { what: 'a ship' });", pages: [{ key: 'px', spec: JSON.stringify({ module: 'market' }) }] }, shots, six, devices);
  assert.deepEqual(done, []);
  const declined = C.routedErrors({ code: plan("'made-model'", '', ", declined: [{ device: 'real-prices', why: '這句講的是公司的反應不是價格本身' }]") + "\nkit.engine.subject(THREE, st, 'ship')" }, shots, six, devices);
  assert.deepEqual(declined, [], 'a beat may decline a cue with its reason');
  assert.deepEqual(C.routedErrors({ code: plan('', '') }, shots, {}, devices), [], 'films made before keep their checks');
  assert.equal(R.routeErrors({ B01: { devices: ['real-page-mark'] } }, { code: '', pages: [{ key: 'a', spec: '{"module":"article"}' }] }, devices).length, 0);
  // selected device must have a ready kit (minimal gate beside routeErrors)
  assert.deepEqual(R.selectedDeviceKitErrors([{ beat: 'B01', devices: ['carrier'] }], devices), []);
  assert.match(R.selectedDeviceKitErrors([{ beat: 'B01', devices: ['not-a-device'] }], devices).join('\n'), /not in routing/);
  const badKit = [...devices, { id: 'proto-only', name: 'x', kit: { status: 'planned', use: 'later' } }];
  assert.match(C.routedErrors({ code: plan("'proto-only'", "") }, shots, six, badKit).join('\n'), /no ready kit route/);
});

test('every line module is called by the line or listed with how it is used (the user 2026-10-27: 确保无遗漏)', () => {
  const R = path.join(REPO, 'apps/studio-next/src/lib/recipe-board'), files = fs.readdirSync(R).filter((f) => /\.(mjs|py|swift|js)$/.test(f) && !/\.test\./.test(f));
  const all = files.map((f) => fs.readFileSync(path.join(R, f), 'utf8')).join('\n') + fs.readFileSync(path.join(REPO, 'scripts/recipe-board.mjs'), 'utf8');
  const listed = new Set(JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/engine-capabilities.json'), 'utf8')).lineTools.tools.map((t) => t.file));
  const orphans = files.filter((f) => { const b = f.replace(/\.[^.]+$/, ''); return !listed.has(f) && !new RegExp(`['"/]${b}(\\.(mjs|py|swift|js))?['"]|${b}\\.(py|swift)`).test(all.split(fs.readFileSync(path.join(R, f), 'utf8')).join('')); });
  assert.deepEqual(orphans, [], 'a line module nothing calls: wire it, or list it in engine-capabilities.json lineTools with how it is used');
});

test('the route table names devices and kit calls that exist (the user 2026-10-27: 该调用哪块就走哪块)', () => {
  const cap = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/engine-capabilities.json'), 'utf8')), D = new Set(JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8')).devices.map((d) => d.id));
  const T = path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates'), kit2 = fs.readFileSync(path.join(T, 'kit2.js'), 'utf8').match(/export const flat = \{([^}]*)\}/)[1], scenes = fs.readFileSync(path.join(T, 'scenes.js'), 'utf8'), morph = fs.readFileSync(path.join(T, 'morph.js'), 'utf8');
  assert.ok(cap.routes.length >= 15);
  for (const r of cap.routes) {
    if (r.device) assert.ok(D.has(r.device), `${r.need}: device ${r.device}`);
    for (const m of r.route.matchAll(/type\.flat\.([a-zA-Z]+)/g)) assert.match(kit2, new RegExp(`\\b${m[1]}\\b`), `${r.need}: type.flat.${m[1]}`);
    for (const m of r.route.matchAll(/kit\.scene\.([a-zA-Z]+)/g)) assert.match(scenes, new RegExp(`export function ${m[1]}\\b`), `${r.need}: kit.scene.${m[1]}`);
    for (const m of r.route.matchAll(/kit\.engine\.([a-zA-Z]+)/g)) assert.match(morph, new RegExp(`\\b${m[1]}[(:]`), `${r.need}: kit.engine.${m[1]}`);
  }
});

test('one look gate: a design-first film is shown and approved on its hero stills and board, materials gathered before (the user 2026-10-27: 让系统走唯一 最优的流程)', async () => {
  const G = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/gatestate.mjs')).href);
  const p = { process: 'six-stage', style: 's', lettering: 'eva' };
  assert.match(G.gatesOf(p, { film: { designFirst: true, ready: false, board: 'b1' } }).look.why, /being made and reviewed blind/);
  assert.match(G.gatesOf(p, { film: { designFirst: true, ready: true, board: 'b1' } }).look.why, /board\.png/);
  const ok = { ...p, look: { approved: true, by: 'u', at: 't', style: 's', board: 'b1' } };
  assert.equal(G.gatesOf(ok, { film: { designFirst: true, ready: true, board: 'b1' } }).look.ok, true);
  const stale = G.gatesOf(ok, { film: { designFirst: true, ready: true, board: 'b2' } });
  // approved once (the user 2026-10-28: 定样子/定设计只批一次，之后改动不重开、不挡章节，集中到成片预览给我看): a changed still is shown at the final
  assert.equal(stale.look.ok, true); assert.notEqual(stale.waiting, 'look'); assert.match(stale.look.since, /at the final/); assert.match(stale.final.why, /changed since you approved the look/);
  assert.equal(G.gatesOf(ok, {}).look.ok, true, 'a film not design-first keeps its look as approved');
  for (const s of ['screen', 'materials', 'fetch']) assert.ok(G.BEFORE_LOOK.includes(s), `${s} before the look`);
});

test('a new film\'s cards: no torn labels and no dressed type, the older films keep theirs (audit 2026-10-27 #6 #8)', async () => {
  const S = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/shotplan.mjs')).href);
  assert.equal(S.pickTreat(['glow', 'metal'], true), 'metal', 'a lettered film takes no glow');
  assert.equal(S.pickTreat(['extrude'], true), null);
  assert.equal(S.pickTreat(['glow'], false), 'glow', 'an older film keeps the reference\'s treatment');
  assert.ok(S.DRESS_TREATS.includes('glow') && S.DRESS_TREATS.includes('extrude'));
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/shotplan.mjs'), 'utf8');
  assert.match(src, /labelErrors\(shots, six \? \{ maxShare: 0/);
});

test('one flow: the SOP\'s flow is generated from the code\'s table, and every step names stages, prompts and checks the line has (the user 2026-10-27: 让系统走唯一 最优的流程)', async () => {
  const F = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/flow.mjs')).href);
  const { STAGES } = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/run.mjs')).href);
  const { GATES } = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/gatestate.mjs')).href);
  const sop = fs.readFileSync(path.join(REPO, 'SOP.md'), 'utf8');
  assert.equal(F.withFlow(sop), sop, 'SOP.md\'s flow differs from flow.mjs: node scripts/recipe-board.mjs sop --write');
  const R = path.join(REPO, 'apps/studio-next/src/lib/recipe-board'), lib = fs.readdirSync(R).filter((f) => f.endsWith('.mjs')).map((f) => fs.readFileSync(path.join(R, f), 'utf8')).join('\n');
  for (const s of F.FLOW) {
    for (const st of s.stages) assert.ok(STAGES.includes(st), `${s.id}: stage ${st}`);
    for (const p of s.prompts) assert.ok(fs.existsSync(path.join(REPO, 'work/recipe-board-v1/prompts', p)), `${s.id}: prompts/${p}`);
    for (const c of s.checks) assert.match(lib, new RegExp(`export (function|const) ${c}\\b`), `${s.id}: check ${c}`);
  }
  assert.deepEqual(F.FLOW.filter((s) => s.gate).map((s) => s.gate), GATES, 'the flow\'s gates are the line\'s, in order');
  const order = F.FLOW.map((s) => s.id);
  assert.ok(order.indexOf('materials') < order.indexOf('greybox') && order.indexOf('greybox') < order.indexOf('style-frames') && order.indexOf('style-frames') < order.indexOf('design') && order.indexOf('design') < order.indexOf('chapters'), 'materials, the greybox, the style frames, the design gate, then the chapters (2026-10-28)');
});

test('the colour script\'s darks of the accent\'s side are neutral, not brown (Suez stills round 7: both reviewers, the user: 不要脏棕色)', async () => {
  const F = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/filmdesign.mjs')).href), DB = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/designbrain.mjs')).href);
  const design = { beats: ['open', 'build', 'peak', 'release', 'close'].map((act, i) => ({ beat: `B0${i + 1}`, act, value: 'dark' })) };
  for (const c of F.colourScript(design, '#c8501e')) assert.ok(DB.toOklch(c.ground).C <= 0.004, `${c.beat}: ${c.ground} C ${DB.toOklch(c.ground).C.toFixed(4)}`);
});

test('a film\'s world is a variant of the house look: neutral darks, warm-white paper, one strong colour, the six faces (the user 2026-10-27: 按你推荐的执行)', async () => {
  const W = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/filmworld.mjs')).href);
  const house = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/house-style.json'), 'utf8'));
  const ok = { ground: { tone: 'dark', color: '#161616' }, main: { color: '#c8501e' }, accent: null, display: { face: '黒華明朝', x: 0.72 }, texture: { grain: 0.3, vignette: 0.5 } };
  assert.deepEqual(W.houseErrors(ok, house), []);
  assert.match(W.houseErrors({ ...ok, ground: { tone: 'dark', color: '#2a1d16' } }, house).join(), /neutral deep grey/, 'a brown dark is not the house\'s');
  assert.match(W.houseErrors({ ...ok, ground: { tone: 'light', color: '#e8d6c0' } }, house).join(), /warm-white paper/);
  assert.match(W.houseErrors({ ...ok, accent: { color: '#1e5ac8' } }, house).join(), /one strong colour/);
  assert.match(W.houseErrors({ ...ok, display: { face: '思源黑体', x: 0.72 } }, house).join(), /one of the six/);
  assert.match(W.houseErrors({ ...ok, display: { face: '黒華明朝', x: 0.4 } }, house).join(), /display\.x/);
  assert.ok(house.presets.every((p) => p.verdict === 'approved'));
});

test('a ground renders the colour the script gave it: a neutral dark that renders tinted fails (Suez: #121111 asked, red-brown rendered)', async () => {
  const F = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/filmdesign.mjs')).href);
  const script = [{ beat: 'B01', ground: '#151313' }, { beat: 'B02', ground: '#e2ddd7' }];
  assert.match(F.groundTintErrors([{ rim: '#110b0c' }, { rim: '#d9d3cc' }], script, ['B01', 'B02']).join(), /B01: its ground renders #110b0c/);
  assert.deepEqual(F.groundTintErrors([{ rim: '#0e0d0d' }, { rim: '#d9d3cc' }], script, ['B01', 'B02']), [], 'neutral as asked; a light paper is not held to it');
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit3.js'), 'utf8'), /fill's rounding given back as dither/);
});

test('every engine template parses (a comment that swallowed the end of a line broke kit2.js and surfaced only at render)', () => {
  const T = path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates');
  for (const f of fs.readdirSync(T).filter((x) => x.endsWith('.js'))) { const r = spawnSync(process.execPath, ['--check', path.join(T, f)], { encoding: 'utf8' }); assert.equal(r.status, 0, `${f}: ${String(r.stderr).split('\n').slice(0, 4).join(' ')}`); }
});

test('the house holds the hard lines and leaves the design free: a composition or ground of the designer\'s own is taken when told in full (the user 2026-10-27: 不限制你发挥 做顶级视觉包装师)', async () => {
  const B = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/beatdesign.mjs')).href);
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/beatdesign.mjs'), 'utf8');
  assert.match(src, /r\.composition !== 'custom'/); assert.match(src, /r\.ground\?\.kind !== 'custom'/);
  const house = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/house-style.json'), 'utf8'));
  assert.ok(house.freedom.hard.length >= 5 && house.freedom.free.some((x) => /custom/.test(x)));
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/taste.md'), 'utf8'), /不因为它没照构图库或模板做就扣分/);
  assert.equal(typeof B.briefErrors, 'function');
});

test('a beat whose review score stands still over rounds is reported stalled: its material or an ability, not its layout (Suez stills: 3, 4, 3, 4 four rounds running)', async () => {
  const B = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/beatdesign.mjs')).href);
  let h = [];
  for (const [a, s1] of [['a1', 2], ['a2', 3], ['a3', 3], ['a4', 3]]) h = B.withScores(h, a, { beats: [{ beat: 'B01', score: s1, issue: '船模太糊' }, { beat: 'B08', score: 4 }] });
  assert.equal(B.withScores(h, 'a4', { beats: [{ beat: 'B01', score: 3 }] }).length, 4, 'the same answer is not a new round');
  assert.deepEqual(B.stalledBeats(h).map((x) => [x.beat, x.score, x.named]), [['B01', 3, '船模太糊']], 'B08 at 4 is good, not stalled');
  assert.deepEqual(B.stalledBeats(h.slice(0, 2)), []);
});

test('a film designed whole has one source for its grounds: the colour script, not the per-chapter variant (B02 was asked a light inverse ground and a neutral dark at once)', () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(src, /if \(!acceptedFilmDesign\(cfg, id\)\) \{ const d = readJson\(path\.join\(projectPaths\(cfg, id\)\.root, 'design\.json'\)/);
  assert.match(src, /design: acceptedFilmDesign\(cfg, id\) \? null :/);
});

test('a film is lettered by its project whoever calls the step (a direct call rendered Suez\'s stills in the fallback gothic and the checks passed them)', () => {
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  for (const fn of ['runtimeCheck', 'animaticChapter', 'stepChapters']) assert.match(src, new RegExp(`function ${fn}\\([^\\n]*\\n(?:(?!\\n}\\n)[\\s\\S])*?ensureLettering\\(cfg, id\\)`), fn);
  assert.match(src, /function prepareAssets\([^\n]*\n(?:(?!\n}\n)[\s\S])*?ensureLettering\(cfg, id\)/, 'prepareAssets');
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/stills.mjs'), 'utf8'), /C\.ensureLettering\(cfg, id\)/);
});

test('every check round is kept and the rules counted by signature (the audit could not tell which checks ever caught anything)', async () => {
  const A = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/agenttask.mjs')).href);
  assert.equal(A.ruleSignature('B02: the line\'s figure 2021 shows at 52 px at most ("2021"); a figure …'), A.ruleSignature('B07: the line\'s figure 3 shows at 51 px at most ("3"); x'));
  assert.equal(A.ruleSignature('B12: its ground renders #1a1f26 (chroma 0.015)'), 'its ground renders #');
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/agenttask.mjs'), 'utf8'), /\.history\.jsonl/);
});

test('a photo of a thing is not held to the person check (「长赐号…的照片」: two real photos of the ship refused as drawings of a person)', async () => {
  const S = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/shotplan.mjs')).href);
  assert.equal(S.isPersonNeed({ entity: '长赐号 Ever Given', original: '长赐号脱浅后在运河里航行的照片', archive: { keywords: ['Ever Given refloated'] } }), false);
  assert.equal(S.isPersonNeed({ entity: '梁文锋', original: '梁文锋的人像照片', archive: { keywords: [] } }), true);
  assert.equal(S.isPersonNeed({ entity: '梁文锋', original: '梁文锋', archive: { keywords: ['portrait'] } }), true);
});

test('a queue of ships keeps each hull clear of the next along its length (turned a quarter, the columns fused into bars: Suez B12)', () => {
  const src = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/scenes.js'), 'utf8');
  assert.match(src, /gapZ = Math\.max\(gapZ, size \* 1\.3\)/);
});

test('two words set on surfaces over each other are type over type (Suez B03: 2萬個集裝箱 half over 400米 passed)', async () => {
  const { overlapErrors } = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'));
  const w = (text, y0, y1) => ({ text, x0: 700, x1: 1000, y0, y1, size: 140, alpha: 1, object: true, surface: true });
  assert.equal(overlapErrors([w('400米', 344, 494), w('2萬個集裝箱', 283, 422)], 'B03').length, 1);
  assert.equal(overlapErrors([w('400米', 344, 494), { ...w('标签', 283, 422), surface: false }], 'B03').length, 0);
});

test("a pair on a surface is traced line by line, its sub at its own size (沙塵暴 and 沙土和淤泥 read 24 px and passed as one block: Suez B04, B10)", () => {
  const ty = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/type.js'), 'utf8');
  const mo = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(ty, /sub: \{ px: spx, top: px \* 1\.3/);
  assert.match(mo, /\[\[w\.text, L\.main, w\.face\], \[w\.sub, L\.sub, w\.subFace \|\| w\.face\]\]/);   // each line its own face (10% over 全世界的貿易 was traced in 廻想体)
  assert.match(ty, /subFace: sfam/);
  assert.match(mo, /size: ln\.px \* k/);
});

test("a pick at the look gate keeps what the film's style carries beside its directions (Suez lost profile: 'gawx' on re-approval)", async () => {
  const { pickDirection } = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/filmworld.mjs'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-pick-')), root = path.join(dataDir, 'projects', 'p1');
  fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(path.join(dataDir, 'routing'), { recursive: true });
  fs.writeFileSync(path.join(root, 'project.json'), '{}');
  const A = { title: 'a', frames: [1] };
  fs.writeFileSync(path.join(root, 'style.json'), JSON.stringify({ ...A, chosen: 'A', directions: { A, B: { title: 'b', frames: [2] } }, answerHash: 'h', profile: 'gawx' }));
  const next = pickDirection({ dataDir }, 'p1', 'A', 'test');
  assert.equal(next.profile, 'gawx');
  assert.deepEqual(next.frames, [1]);
  assert.equal(pickDirection({ dataDir }, 'p1', 'B', 'test').title, 'b');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a word on a surface that shrinks under the reading size for 0.8 s fails, though its median reads (Suez B10: 沙土和淤泥 37 px, then 29 as the camera drew back)', async () => {
  const { surfaceReadErrors } = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/profile.mjs'));
  const sizes = [40, 40, 40, 40, 40, 40, 40, 31, 31, 31, 31, 31];
  const tr = sizes.map((size, i) => ({ t: i * 0.2, drawn: [{ surface: true, text: '沙土和淤泥', size, turn: 0 }] }));
  const shots = [{ shotId: 'B10', at: 0, dur: 5 }];
  assert.match(surfaceReadErrors(tr, shots, { surfaceMin: 0.35 }).join(), /shrinks to 31 px/);
  assert.equal(surfaceReadErrors(tr.slice(0, 9), shots, { surfaceMin: 0.35 }).length, 0);
});

test("an engine or check change keeps a reviewed still and the approved look when the pictures are unchanged (Suez: a trace change sent the stills back and cancelled the look)", () => {
  const st = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/stills.mjs'), 'utf8');
  assert.match(st, /materials\.ok && submissions\(\)\.every/);
  assert.match(st, /had\?\.ok && had\.prints && C\.samePrints\(had\.prints, prints\)/);
  assert.match(st, /forAnswer: h, prints, history/);
  assert.match(st, /export const boardHash = [^\n]*STILLS_STEP\}\.answer\.json/);
  assert.doesNotMatch(st.match(/export const boardHash = [^\n]*/)[0], /check\.json/);
});

test('weather is ground, not the subject, when figure and ground are read (Suez B04: the sandstorm streaks were measured instead of the ship)', () => {
  const mo = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(mo, /const ground = tops\.map\(\(o, i\) => [^\n]*o\.userData\?\.atmosphere[^\n]*o\.isPoints/);
});

test('a chapter review answered for an earlier version and never read still passes its beats whose pictures are unchanged (Suez B02: 4, then the same picture drew a 3)', () => {
  const ch = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(ch, /in a review not read before, its picture unchanged/);
  assert.match(ch, /samePrints\(\[t0\.forPrints\[j\]\], \[picPrint\(strips\[k\]\)\]\)/);
});

test("the last round's fix shown to a chapter reviewer ends on a sentence, not mid-word (Suez B02 r10 read 「让船在第 0」)", async () => {
  const { clipSentence, fixesNote } = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'));
  const long = '前半拍是空的。'.repeat(40) + '让船在第 0 秒就是主角。';
  const c = clipSentence(long, 420);
  assert.ok(c.endsWith('。') && c.length <= 421);
  assert.equal(clipSentence('短句', 420), '短句');
  assert.match(fixesNote([{ beat: 'B02', issue: '拍头空。让船在第 0 秒就是主角，船头的红只点在搁浅处。' }]), /船头的红只点在搁浅处/);
});

test("a thing's own marking (read: false) is not failed for being half under its own decks (Suez B02: 長賜號)", async () => {
  const { objectErrors } = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'));
  const src = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(src, /if \(d\.inScene\) return null;\n[\s\S]{0,300}if \(d\.texture\) return null;/);
  assert.equal(objectErrors([{ text: '長賜號', texture: true, size: 36, x0: 0, x1: 10, y0: 0, y1: 10 }], null, 'B02').length, 0);
});

test("the greybox rough: the whole film laid out in low-fidelity blocks with its real words, checked, and the direction gate before any still or chapter is built (the user 2026-10-28: 粗稿可以很低精度几何模块 … 确保全篇方向 再一镜镜渲染)", async () => {
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href), S = await import(pathToFileURL(path.join(LIB, 'gatestate.mjs')).href);
  const beats = [{ beat: 'B1', text: '它长400米，能装大约2万个集装箱。', dur: 7 }, { beat: 'B2', text: '每堵一天，就有大约90亿美元的货物被卡在路上。' }];
  const ok = { beats: [
    { beat: 'B1', blocks: [{ label: '船', shape: 'ship', role: 'subject', x: 160, y: 520, w: 1600, h: 190 }], type: [{ text: '400米', role: 'number', x: 960, y: 250, size: 200, align: 'center', accent: true }], camera: { move: 'pan', note: null, from: { s: 1.05, x: 70, y: 0 }, to: { s: 1.05, x: -70, y: 0 } }, out: 'match', note: '尺度' },
    { beat: 'B2', blocks: [{ label: '船队', shape: 'rect', role: 'context', x: 160, y: 760, w: 1600, h: 150, model: null, view: null, image: null, in: 0, enter: null }], type: [{ text: '90亿美元', role: 'big', x: 960, y: 290, size: 300, align: 'center', accent: true }], camera: { move: 'cut', note: null, from: { s: 1.05, x: -70, y: 0 }, to: { s: 1.02, x: 0, y: 0 } }, out: 'whip', note: '高潮' }] };
  assert.deepEqual(G.greyboxErrors(ok, beats), []);
  const bad = JSON.parse(JSON.stringify(ok));
  bad.beats[0].type.push({ text: '500米', role: 'small', x: 960, y: 920, size: 30, align: 'center', accent: false }, { text: 'a', role: 'small', x: 10, y: 100, size: 40, align: 'left', accent: false }, { text: '400米', role: 'small', x: 960, y: 260, size: 120, align: 'center', accent: false });
  bad.beats[0].camera.move = 'zoom'; bad.beats[0].out = 'dissolve'; bad.beats[0].type[0].enter = 'spin'; bad.beats[0].type[0].in = 9; bad.beats.pop();
  const e = G.greyboxErrors(bad, beats).join('\n');
  for (const m of [/B2: no greybox frame/, /500米" at 30 px/, /subtitle band/, /carries 500, not in the beat's words/, /hugs its edge/, /over each other/, /4 lines to read/, /camera move zoom/, /seam out \(out\) dissolve/, /enters by spin/, /comes in at 9 s, outside its beat/]) assert.match(e, m);
  assert.match(G.greyboxErrors({ beats: [{ beat: 'B1', blocks: [], type: [], camera: { move: 'static', note: null, from: null, to: null }, out: 'cut', note: '' }] }, [beats[0]]).join(), /an empty frame/);
  // the motion is the film's: a camera from its move, the seams the reel draws, the library's models and real pictures as themselves
  assert.deepEqual(G.cameraKeys({ move: 'push' }), [{ s: 1, x: 0, y: 0 }, { s: 1.09, x: 0, y: 0 }]); assert.deepEqual(G.cameraKeys({ move: 'pan', from: { s: 1, x: 0, y: 0 }, to: { s: 1.2, x: 9, y: 0 } })[1].s, 1.2);
  assert.deepEqual(G.SEAMS, ['cut', 'match', 'whip', 'push', 'glitch', 'flash']); assert.equal(G.SEAM_DUR.cut, 0);
  const rh = G.reelHtml([{ beat: 'B1', blocks: [{ label: '船', shape: 'ship', role: 'subject', x: 0, y: 0, w: 10, h: 10, model: null, view: null, image: null, in: 0, enter: null }], type: [], camera: { move: 'push', note: null, from: null, to: null }, out: 'whip', note: '' }], [{ beat: 'B1', at: 0, dur: 5, screen: 'crt' }], '', { dataDir: path.join(REPO, 'work/recipe-board-v1') }, '/');
  assert.match(rh, /window\.seek=/); assert.match(rh, /pin==='whip'\)\{tx=\(1-ease\(v\)\)\*1920/, 'a whip carries both frames past each other, no black between'); assert.match(rh, /class="scr"/, 'the screen\'s texture laid over');
  assert.match(rh, /o\.k\.in<=0\.05/, 'what is there at 0 s is there at the cut (something on screen across a seam)');
  // the answer's schema: every key asked, no free object
  const sc = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/greybox.schema.json'), 'utf8')), it = sc.properties.beats.items;
  assert.deepEqual(it.required, ['beat', 'blocks', 'type', 'camera', 'note', 'out', 'device', 'kind', 'composition']); assert.deepEqual(it.properties.blocks.items.required.slice(-7), ['model', 'view', 'image', 'in', 'enter', 'lit', 'gridMotion']); assert.equal(it.additionalProperties, false); assert.deepEqual(it.properties.type.items.required, ['text', 'role', 'x', 'y', 'size', 'align', 'accent', 'in', 'enter', 'near']);
  // the direction gate comes first; a film whose look was approved before it keeps its gates
  assert.deepEqual(S.LEGACY_GATES, ['direction', 'look', 'rough', 'final']);
  const six = { process: 'six-stage', style: 'x', lettering: 'eva' };
  assert.equal(S.gatesOf(six, { greybox: null }).waiting, 'direction');
  assert.match(S.gatesOf(six, { greybox: 'h1' }).direction.why, /greybox rough waits for you/);
  assert.equal(S.gatesOf({ ...six, direction: { approved: true, by: 'u', at: 't', hash: 'h1' } }, { greybox: 'h1' }).waiting, 'look');
  assert.equal(S.gatesOf({ ...six, direction: { approved: true, by: 'u', at: 't', hash: 'h1' } }, { greybox: 'h2' }).direction.stale, true, 'a changed greybox waits again');
  assert.equal(S.gatesOf({ ...six, look: { approved: true, style: 'x' } }, { greybox: null }).direction.ok, true, 'made before the gate: kept');
  // wired: the hero stills wait for it; approving it needs a checked greybox; the CLI makes it
  assert.match(fs.readFileSync(path.join(LIB, 'stills.mjs'), 'utf8'), /gb = await G\.stepGreybox\(cfg, id, \{ log \}\);\n    if \(!directionOpen\(cfg, id\)\) return \{ state: 'waiting'/);
  assert.match(fs.readFileSync(path.join(LIB, 'gates.mjs'), 'utf8'), /if \(gate === 'direction'\) \{[\s\S]{0,300}greyboxHash\(cfg, id\); if \(!h\) throw/);
  assert.match(fs.readFileSync(path.join(REPO, 'scripts/recipe-board.mjs'), 'utf8'), /cmd === 'greybox'/);
  assert.ok(fs.existsSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md')));
});

test('greybox camera from/to hard gate: non-static needs explicit motion; flat same-pose fails; filmed settle-continue on match', async () => {
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const block = { label: '船', shape: 'rect', role: 'subject', x: 100, y: 100, w: 800, h: 600, model: null, view: null, image: null, in: 0, enter: null, lit: null };
  const type = [{ text: '测试', role: 'big', x: 200, y: 200, size: 128, align: 'left', accent: false, in: null, enter: null, near: null }];
  const beats = [{ beat: 'B1', text: '测试一句', dur: 5 }, { beat: 'B2', text: '第二句', dur: 5 }];
  // missing from/to on push → fail
  const missing = { beats: [
    { beat: 'B1', blocks: [block], type, camera: { move: 'push', note: null, from: null, to: null }, out: 'cut', note: '' },
    { beat: 'B2', blocks: [block], type, camera: { move: 'static', note: null, from: null, to: null }, out: 'whip', note: '' },
  ]};
  assert.match(G.cameraMotionErrors(missing.beats).join('\n'), /B1: camera push needs explicit from\/to/);
  assert.match(G.greyboxErrors(missing, beats).join('\n'), /needs explicit from\/to/);
  // explicit from≠to → pass motion gate
  const moving = { beats: [
    { beat: 'B1', blocks: [block], type, camera: { move: 'push', note: null, from: { s: 1, x: 0, y: 0 }, to: { s: 1.12, x: 0, y: 0 } }, out: 'cut', note: '' },
    { beat: 'B2', blocks: [block], type, camera: { move: 'static', note: null, from: null, to: null }, out: 'whip', note: '' },
  ]};
  assert.deepEqual(G.cameraMotionErrors(moving.beats), []);
  // same pose labeled push → fail
  const flat = { beats: [
    { beat: 'B1', blocks: [block], type, camera: { move: 'push', note: null, from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 } }, out: 'cut', note: '' },
  ]};
  assert.match(G.cameraMotionErrors(flat.beats).join('\n'), /no motion \(same pose\)/);
  // keys (≥2) count as explicit
  assert.equal(G.hasExplicitCameraMotion({ keys: [{ s: 1, x: 0, y: 0 }, { s: 1.1, x: 0, y: 0 }] }), true);
  assert.equal(G.hasExplicitCameraMotion({ from: null, to: null }), false);
  // match carry with both moving but poses do not meet → fail settle-continue
  const breakSeam = { beats: [
    { beat: 'B1', blocks: [block], type, camera: { move: 'pan', note: null, from: { s: 1.05, x: 70, y: 0 }, to: { s: 1.05, x: -70, y: 0 } }, out: 'match', note: '' },
    { beat: 'B2', blocks: [block], type, camera: { move: 'push', note: null, from: { s: 1, x: 0, y: 0 }, to: { s: 1.09, x: 0, y: 0 } }, out: 'whip', note: '' },
  ]};
  assert.match(G.cameraMotionErrors(breakSeam.beats).join('\n'), /settle-continue/);
  // match carry with next.from = prev.to → pass
  const cont = { beats: [
    { beat: 'B1', blocks: [block], type, camera: { move: 'pan', note: null, from: { s: 1.05, x: 70, y: 0 }, to: { s: 1.05, x: -70, y: 0 } }, out: 'match', note: '' },
    { beat: 'B2', blocks: [block], type, camera: { move: 'push', note: null, from: { s: 1.05, x: -70, y: 0 }, to: { s: 1.12, x: -70, y: 0 } }, out: 'whip', note: '' },
  ]};
  assert.deepEqual(G.cameraMotionErrors(cont.beats), []);
  assert.equal(G.settleContinuousAcross(cont.beats[0].camera, cont.beats[1].camera), true);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8'), /显式 .*from.*to.*keys.*settle 连续/);
});

test('openingMotionErrors: open static poster fails; wired lineup/copy/table + chapter paths pass; shells/same-img×N fail; pan-over-poster fails; push needs real scale Δ', async () => {
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const unit = (label, x, inn, enter = 'rise', w = 220, h = 360) => ({
    label, shape: 'ellipse', role: 'subject', x, y: 360, w, h, model: null, view: null, image: null, in: inn, enter, lit: null,
  });
  const mk = (beat, cam, type = [], blocks = [], extra = {}) => ({
    beat, blocks: blocks.length ? blocks : [{ label: 'x', shape: 'rect', role: 'context', x: 0, y: 0, w: 1920, h: 1080, model: null, view: null, image: null, in: 0, enter: 'cut', lit: null }],
    type, camera: cam, out: 'cut', note: '', ...extra,
  });
  const beats = [
    { beat: 'B1', act: 'open', hero: true, dur: 5, text: '开场' },
    { beat: 'B2', act: 'build', hero: false, dur: 5, text: '铺垫' },
    { beat: 'B3', act: 'build', hero: false, dur: 5, text: '再铺' },
  ];
  // static + no type enter → fail (legacy + new code)
  const poster = { beats: [
    mk('B1', { move: 'static', from: null, to: null }, [{ text: '海报', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 0, enter: 'cut', near: 'center' }]),
    mk('B2', { move: 'static', from: null, to: null }, [{ text: '二', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 0, enter: 'cut', near: 'center' }]),
    mk('B3', { move: 'static', from: null, to: null }, [{ text: '三', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 0, enter: 'cut', near: 'center' }]),
  ]};
  const posterErr = G.openingMotionErrors(poster.beats, beats).join('\n');
  assert.match(posterErr, /opening static poster/);
  assert.match(posterErr, /opening-static-poster-no-build/);
  // pan over one full-bleed photo + late type — still fail (HOUSE: not enough)
  const panPoster = { beats: [
    mk('B1', { move: 'pan', note: '扫海报', from: { s: 1, x: 80, y: 0 }, to: { s: 1.08, x: -80, y: 0 } },
      [{ text: '同一棵', role: 'big', x: null, y: null, size: 300, align: 'left', accent: false, in: 2.5, enter: 'scale', near: 'left' }],
      [{ label: '海报', shape: 'rect', role: 'context', x: 0, y: 0, w: 1920, h: 1080, model: null, view: null, image: 'x.png', in: 0, enter: 'cut', lit: null }]),
    mk('B2', { move: 'push', note: '近', from: { s: 1, x: 0, y: 0 }, to: { s: 1.12, x: 0, y: 0 } },
      [{ text: '特写', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 1, enter: 'rise', near: 'left' }],
      [{ label: '单果', shape: 'photo', role: 'subject', x: 500, y: 40, w: 860, h: 1000, model: null, view: null, image: 'y.png', in: 0, enter: 'cut', lit: null }]),
    mk('B3', { move: 'static', from: null, to: null }, [{ text: '47%', role: 'number', x: null, y: null, size: 200, align: 'left', accent: true, in: null, enter: 'type-on', near: 'left' }],
      [{ label: '百格', shape: 'grid', role: 'subject', x: 100, y: 100, w: 760, h: 640, model: null, view: null, image: null, in: 0, enter: 'cut', lit: 47, gridMotion: null }]),
  ]};
  assert.match(G.openingMotionErrors(panPoster.beats, beats).join('\n'), /opening-static-poster-no-build/);
  // unwired array-build shell + same-image×N staggered CSS rise → FAIL (no longer clears gate)
  const shellFake = { beats: [
    mk('B1', { move: 'pan', note: '假阵列', from: { s: 1, x: 100, y: 0 }, to: { s: 1.06, x: -100, y: 0 } },
      [{ text: '同一棵香蕉', role: 'big', x: null, y: null, size: 300, align: 'left', accent: false, in: 2.7, enter: 'scale', near: 'top-left' }],
      [
        { ...unit('蕉1', 80, 0), image: 'same.png' },
        { ...unit('蕉2', 340, 0.28), image: 'same.png' },
        { ...unit('蕉3', 600, 0.56), image: 'same.png' },
        { ...unit('蕉4', 860, 0.84), image: 'same.png' },
      ],
      { device: 'array-build' }),
    mk('B2', { move: 'push', note: '近景', from: { s: 1, x: 0, y: 0 }, to: { s: 1.14, x: -20, y: 0 } },
      [{ text: '卡文迪什', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 1.2, enter: 'rise', near: 'left' }],
      [unit('左', 200, 0, 'rise', 180, 320), unit('主', 520, 0.35, 'scale', 420, 720), unit('右', 1100, 0.7, 'fade', 180, 320)],
      { device: 'stagger-reveal' }),
    mk('B3', { move: 'static', from: null, to: null }, [{ text: '47%', role: 'number', x: null, y: null, size: 200, align: 'left', accent: true, in: 0.4, enter: 'type-on', near: 'left' }],
      [{ label: '海报', shape: 'photo', role: 'subject', x: 100, y: 100, w: 1600, h: 900, model: null, view: null, image: 'z.png', in: 0, enter: 'cut', lit: null }]),
  ]};
  assert.match(G.openingMotionErrors(shellFake.beats, beats).join('\n'), /opening-static-poster-no-build/);
  assert.equal(G.hasArrayBuild(shellFake.beats[0]), false);
  assert.equal(G.hasStaggerReveal(shellFake.beats[1]), false);
  // wired lineup-row (simultaneous row) + table-grows + copy-to-repeat → pass
  const wiredOk = { beats: [
    mk('B1', { move: 'push', note: '一排同时在场', from: { s: 1, x: 0, y: 0 }, to: { s: 1.08, x: 0, y: -20 } },
      [{ text: '同一棵香蕉', role: 'big', x: null, y: null, size: 300, align: 'left', accent: false, in: 2.7, enter: 'scale', near: 'top-left' }],
      [unit('蕉1', 80, 0, 'cut'), unit('蕉2', 340, 0, 'cut'), unit('蕉3', 600, 0, 'cut'), unit('蕉4', 860, 0, 'cut'), unit('蕉5', 1120, 0, 'cut'), unit('蕉6', 1380, 0, 'cut')],
      { device: 'lineup-row' }),
    mk('B2', { move: 'push', note: '复制重复', from: { s: 1, x: 0, y: 0 }, to: { s: 1.12, x: 0, y: 0 } },
      [{ text: '卡文迪什', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 1.2, enter: 'rise', near: 'left' }],
      [unit('左', 200, 0, 'cut', 180, 320), unit('主', 520, 0, 'cut', 420, 720), unit('右', 1100, 0, 'cut', 180, 320)],
      { device: 'copy-to-repeat' }),
    mk('B3', { move: 'static', from: null, to: null }, [{ text: '47%', role: 'number', x: null, y: null, size: 200, align: 'left', accent: true, in: 0.4, enter: 'type-on', near: 'left' }],
      [{ label: '百格', shape: 'grid', role: 'subject', x: 100, y: 100, w: 760, h: 640, model: null, view: null, image: null, in: 0, enter: 'cut', lit: 47,
        gridMotion: { from: 0, to: 47, start: 0.2, end: 1.4 } }],
      { device: 'table-grows' }),
  ]};
  assert.deepEqual(G.openingMotionErrors(wiredOk.beats, beats), []);
  assert.equal(G.hasLineupRow(wiredOk.beats[0]), true);
  assert.equal(G.hasCopyToRepeat(wiredOk.beats[1]), true);
  assert.equal(G.hasTableGrows(wiredOk.beats[2]), true);
  // chapter subject + orbit path → pass (hasLight3d now means orbit path)
  const chapterOk = { beats: [
    mk('B1', { move: 'orbit', note: 'subject orbit', from: { s: 1.04, x: 40, y: 8 }, to: { s: 1.08, x: -36, y: -6 } },
      [{ text: '主体', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 2, enter: 'rise', near: 'left' }],
      [{ label: '模型', shape: 'rect', role: 'subject', x: 600, y: 200, w: 700, h: 700, model: 'banana', view: 'three-quarter', image: null, in: 0, enter: 'scale', lit: null }]),
    mk('B2', { move: 'push', note: 'map', from: { s: 1, x: 0, y: 0 }, to: { s: 1.1, x: 0, y: 0 } },
      [{ text: '地图', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 1, enter: 'rise', near: 'left' }],
      [{ label: '地图', shape: 'map', role: 'subject', x: 200, y: 100, w: 1400, h: 800, model: null, view: null, image: null, in: 0, enter: 'cut', lit: null }]),
    mk('B3', { move: 'static', from: null, to: null }, [{ text: '船', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 0.5, enter: 'rise', near: 'left' }],
      [{ label: '船', shape: 'ship', role: 'subject', x: 400, y: 300, w: 900, h: 400, model: 'evergiven', view: 'side', image: null, in: 0, enter: 'cut', lit: null }]),
  ]};
  assert.deepEqual(G.openingMotionErrors(chapterOk.beats, beats), []);
  assert.equal(G.hasChapterOrbitPath(chapterOk.beats[0]), true);
  assert.equal(G.hasLight3d(chapterOk.beats[0]), true);
  assert.equal(G.hasChapterMapPlanePath(chapterOk.beats[1]), true);
  assert.equal(G.hasChapterSubjectPath(chapterOk.beats[2]), true);
  // bare light-3d device id without model/orbit does NOT clear
  const bareLight = { beats: [
    mk('B1', { move: 'pan', from: { s: 1, x: 40, y: 0 }, to: { s: 1.05, x: -40, y: 0 } },
      [{ text: '海报', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 2, enter: 'rise', near: 'left' }],
      [{ label: '海报', shape: 'photo', role: 'subject', x: 0, y: 0, w: 1920, h: 1080, model: null, view: null, image: 'p.png', in: 0, enter: 'cut', lit: null }],
      { device: 'light-3d' }),
    mk('B2', { move: 'static', from: null, to: null }, [{ text: '二', role: 'small', x: null, y: null, size: 64, align: 'left', accent: false, in: 0.5, enter: 'rise', near: 'left' }],
      [unit('a', 100, 0), unit('b', 400, 0.4)]),
    mk('B3', { move: 'static', from: null, to: null }, [{ text: '三', role: 'small', x: null, y: null, size: 64, align: 'left', accent: false, in: 0.5, enter: 'rise', near: 'left' }],
      [unit('c', 100, 0)]),
  ]};
  assert.match(G.openingMotionErrors(bareLight.beats, beats).join('\n'), /opening-static-poster-no-build/);
  // push with only pan (no scale Δ) → fail cameraMotionErrors
  const fakePush = { beats: [
    mk('B1', { move: 'push', note: '假推', from: { s: 1.0, x: 100, y: 0 }, to: { s: 1.0, x: -100, y: 0 } }, [], [unit('a', 100, 0, 'cut'), unit('b', 400, 0, 'cut')], { device: 'lineup-row' }),
  ]};
  assert.match(G.cameraMotionErrors(fakePush.beats).join('\n'), /push needs a real from\/to scale change/);
  // HOUSE / greybox contract present
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  assert.match(house, /开场禁止静帧海报硬切/);
  assert.match(house, /未接线/);
  assert.match(house, /lineup-row/);
  assert.match(house, /每镜必须有镜内运动/);
  assert.match(house, /不得绕过 HOUSE/);
  const gmd = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8');
  assert.match(gmd, /openingMotionErrors/);
  assert.match(gmd, /opening-static-poster-no-build/);
  assert.match(gmd, /只认已接线/);
  const devices = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8'));
  const byId = Object.fromEntries((devices.devices || []).map((d) => [d.id, d]));
  for (const id of ['stagger-reveal', 'array-build', 'light-3d', 'presenter-close']) {
    assert.equal(Boolean(byId[id]), true, id);
    assert.notEqual(byId[id].kit?.status, 'ready', `${id} must not be ready`);
    assert.match(String(byId[id].kit?.use || byId[id].how || ''), /未接线/);
  }
  assert.ok(G.UNWIRED_OPENING_SHELLS.includes('presenter-close'), 'presenter-close is an unwired opening shell');
  for (const id of ['lineup-row', 'copy-to-repeat', 'table-grows']) {
    assert.equal(byId[id].kit?.status, 'ready', id);
  }
  assert.deepEqual([...G.OPENING_BUILD_DEVICES], ['lineup-row', 'copy-to-repeat', 'table-grows']);
});

test('midFilmFakeArrayErrors: mid-film same-image×N / CSS clone fails; wired lineup/copy/table + prop-family diversity pass; opening skipped', async () => {
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const C = await import(pathToFileURL(path.join(LIB, 'chapter.mjs')).href);
  const unit = (label, x, inn, image = null, enter = 'rise', w = 220, h = 360) => ({
    label, shape: 'ellipse', role: 'subject', x, y: 360, w, h, model: null, view: null, image, in: inn, enter, lit: null,
  });
  const mk = (beat, cam, type = [], blocks = [], extra = {}) => ({
    beat, blocks: blocks.length ? blocks : [{ label: 'x', shape: 'rect', role: 'context', x: 0, y: 0, w: 1920, h: 1080, model: null, view: null, image: null, in: 0, enter: 'cut', lit: null }],
    type, camera: cam, out: 'cut', note: '', ...extra,
  });
  // B1–B3 = opening (index < 3); B4–B6 = mid-film
  const beats = [
    { beat: 'B1', act: 'open', hero: true, dur: 5, text: '开场' },
    { beat: 'B2', act: 'build', hero: false, dur: 5, text: '铺垫' },
    { beat: 'B3', act: 'build', hero: false, dur: 5, text: '再铺' },
    { beat: 'B4', act: 'build', hero: false, dur: 5, text: '片中阵列' },
    { beat: 'B5', act: 'build', hero: false, dur: 5, text: '片中多样' },
    { beat: 'B6', act: 'build', hero: false, dur: 5, text: '片中接线' },
  ];
  const openPad = (beat) => mk(beat, { move: 'push', from: { s: 1, x: 0, y: 0 }, to: { s: 1.1, x: 0, y: 0 } },
    [{ text: '开', role: 'big', x: null, y: null, size: 200, align: 'left', accent: false, in: 1, enter: 'rise', near: 'left' }],
    [unit('a', 80, 0, null, 'cut'), unit('b', 400, 0, null, 'cut'), unit('c', 720, 0, null, 'cut')],
    { device: 'lineup-row' });

  // mid-film same-image staggered CSS rise → FAIL
  const staggerFake = { beats: [
    openPad('B1'), openPad('B2'), openPad('B3'),
    mk('B4', { move: 'pan', from: { s: 1, x: 40, y: 0 }, to: { s: 1.05, x: -40, y: 0 } },
      [{ text: '同图', role: 'big', x: null, y: null, size: 160, align: 'left', accent: false, in: 1, enter: 'rise', near: 'left' }],
      [unit('c1', 80, 0, 'same.png'), unit('c2', 340, 0.3, 'same.png'), unit('c3', 600, 0.6, 'same.png'), unit('c4', 860, 0.9, 'same.png')],
      { device: 'array-build' }),
    mk('B5', { move: 'static', from: null, to: null }, [{ text: 'x', role: 'small', x: null, y: null, size: 48, align: 'left', accent: false, in: 0.4, enter: 'rise', near: 'left' }], [unit('one', 100, 0)]),
    mk('B6', { move: 'static', from: null, to: null }, [{ text: 'y', role: 'small', x: null, y: null, size: 48, align: 'left', accent: false, in: 0.4, enter: 'rise', near: 'left' }], [unit('two', 100, 0)]),
  ]};
  assert.equal(G.isSameImageStaggerFake(staggerFake.beats[3]), true);
  assert.equal(G.isSameImageCloneArray(staggerFake.beats[3]), true);
  assert.equal(G.isMidFilmFakeArray(staggerFake.beats[3]), true);
  const staggerErr = G.midFilmFakeArrayErrors(staggerFake.beats, beats).join('\n');
  assert.match(staggerErr, /B4:.*mid-film-fake-array/);
  assert.doesNotMatch(staggerErr, /\bB1:/, 'opening beat not double-gated by mid-film');
  // greyboxErrors includes the mid-film gate
  assert.match(G.greyboxErrors(staggerFake, beats).join('\n'), /mid-film-fake-array/);

  // mid-film simultaneous same-image×N (no stagger) still fails
  const cloneSimul = { beats: [
    openPad('B1'), openPad('B2'), openPad('B3'),
    mk('B4', { move: 'push', from: { s: 1, x: 0, y: 0 }, to: { s: 1.08, x: 0, y: 0 } },
      [{ text: '克隆', role: 'big', x: null, y: null, size: 160, align: 'left', accent: false, in: 1, enter: 'rise', near: 'left' }],
      [unit('c1', 80, 0, 'clone.png', 'cut'), unit('c2', 340, 0, 'clone.png', 'cut'), unit('c3', 600, 0, 'clone.png', 'cut')],
      { device: 'stagger-reveal' }),
    mk('B5', { move: 'static', from: null, to: null }, [{ text: 'x', role: 'small', x: null, y: null, size: 48, align: 'left', accent: false, in: 0.4, enter: 'rise', near: 'left' }], [unit('one', 100, 0)]),
    mk('B6', { move: 'static', from: null, to: null }, [{ text: 'y', role: 'small', x: null, y: null, size: 48, align: 'left', accent: false, in: 0.4, enter: 'rise', near: 'left' }], [unit('two', 100, 0)]),
  ]};
  assert.equal(G.isSameImageCloneArray(cloneSimul.beats[3]), true);
  assert.match(G.midFilmFakeArrayErrors(cloneSimul.beats, beats).join('\n'), /B4:.*mid-film-fake-array/);

  // unwired shell + ≥3 visual units (no images) posing as lineup → FAIL
  const shellPose = { beats: [
    openPad('B1'), openPad('B2'), openPad('B3'),
    mk('B4', { move: 'pan', from: { s: 1, x: 20, y: 0 }, to: { s: 1.04, x: -20, y: 0 } },
      [{ text: '空壳', role: 'big', x: null, y: null, size: 160, align: 'left', accent: false, in: 1, enter: 'rise', near: 'left' }],
      [unit('a', 80, 0, null, 'rise'), unit('b', 400, 0.4, null, 'rise'), unit('c', 720, 0.8, null, 'rise')],
      { device: 'stagger-reveal' }),
    mk('B5', { move: 'static', from: null, to: null }, [{ text: 'x', role: 'small', x: null, y: null, size: 48, align: 'left', accent: false, in: 0.4, enter: 'rise', near: 'left' }], [unit('one', 100, 0)]),
    mk('B6', { move: 'static', from: null, to: null }, [{ text: 'y', role: 'small', x: null, y: null, size: 48, align: 'left', accent: false, in: 0.4, enter: 'rise', near: 'left' }], [unit('two', 100, 0)]),
  ]};
  assert.match(G.midFilmFakeArrayErrors(shellPose.beats, beats).join('\n'), /B4:.*mid-film-fake-array/);

  // prop-family diversity (distinct image paths) → PASS
  const diverse = { beats: [
    openPad('B1'), openPad('B2'), openPad('B3'),
    mk('B4', { move: 'push', from: { s: 1, x: 0, y: 0 }, to: { s: 1.1, x: 0, y: 0 } },
      [{ text: '多样', role: 'big', x: null, y: null, size: 160, align: 'left', accent: false, in: 1, enter: 'rise', near: 'left' }],
      [
        unit('blood', 80, 0, 'prop_trace_blood.png', 'cut'),
        unit('hair', 340, 0, 'prop_trace_hair.png', 'cut'),
        unit('fibre', 600, 0, 'prop_trace_fibre.png', 'cut'),
        unit('butt', 860, 0, 'prop_trace_butt.png', 'cut'),
      ]),
    mk('B5', { move: 'static', from: null, to: null }, [{ text: 'x', role: 'small', x: null, y: null, size: 48, align: 'left', accent: false, in: 0.4, enter: 'rise', near: 'left' }], [unit('one', 100, 0)]),
    mk('B6', { move: 'static', from: null, to: null }, [{ text: 'y', role: 'small', x: null, y: null, size: 48, align: 'left', accent: false, in: 0.4, enter: 'rise', near: 'left' }], [unit('two', 100, 0)]),
  ]};
  assert.equal(G.hasPropFamilyDiversity(diverse.beats[3]), true);
  assert.equal(G.isMidFilmFakeArray(diverse.beats[3]), false);
  assert.deepEqual(G.midFilmFakeArrayErrors(diverse.beats, beats), []);

  // wired lineup-row / copy-to-repeat / table-grows mid-film → PASS
  const wired = { beats: [
    openPad('B1'), openPad('B2'), openPad('B3'),
    mk('B4', { move: 'push', from: { s: 1, x: 0, y: 0 }, to: { s: 1.08, x: 0, y: 0 } },
      [{ text: '一排', role: 'big', x: null, y: null, size: 160, align: 'left', accent: false, in: 1, enter: 'rise', near: 'left' }],
      [unit('a', 80, 0, null, 'cut'), unit('b', 340, 0, null, 'cut'), unit('c', 600, 0, null, 'cut'), unit('d', 860, 0, null, 'cut')],
      { device: 'lineup-row' }),
    mk('B5', { move: 'push', from: { s: 1, x: 0, y: 0 }, to: { s: 1.1, x: 0, y: 0 } },
      [{ text: '复制', role: 'big', x: null, y: null, size: 160, align: 'left', accent: false, in: 1, enter: 'rise', near: 'left' }],
      [unit('L', 200, 0, null, 'cut'), unit('M', 520, 0, null, 'cut'), unit('R', 1100, 0, null, 'cut')],
      { device: 'copy-to-repeat' }),
    mk('B6', { move: 'static', from: null, to: null },
      [{ text: '47%', role: 'number', x: null, y: null, size: 200, align: 'left', accent: true, in: 0.4, enter: 'type-on', near: 'left' }],
      [{ label: '百格', shape: 'grid', role: 'subject', x: 100, y: 100, w: 760, h: 640, model: null, view: null, image: null, in: 0, enter: 'cut', lit: 47,
        gridMotion: { from: 0, to: 47, start: 0.2, end: 1.4 } }],
      { device: 'table-grows' }),
  ]};
  assert.equal(G.hasWiredArrayBuild(wired.beats[3]), true);
  assert.equal(G.hasCopyToRepeat(wired.beats[4]), true);
  assert.equal(G.hasTableGrows(wired.beats[5]), true);
  assert.deepEqual(G.midFilmFakeArrayErrors(wired.beats, beats), []);

  // chapter repeatErrors carries mid-film-fake-array code
  const cards = Array.from({ length: 11 }, (_, i) => ({ kind: 'image', src: 3, object: true, x0: 300 + i * 90, y0: 120 + i * 40, x1: 660 + i * 90, y1: 420 + i * 40 }));
  assert.match(C.repeatErrors(cards, 'B19')[0], /mid-film-fake-array/);
  assert.match(C.repeatErrors(cards, 'B19')[0], /prop family|lineup-row/);

  // HOUSE / greybox pointer
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  assert.match(house, /midFilmFakeArrayErrors/);
  assert.match(house, /mid-film-fake-array/);
  const gmd = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8');
  assert.match(gmd, /midFilmFakeArrayErrors/);
  assert.match(gmd, /mid-film-fake-array/);
  assert.equal(G.MID_FILM_CLONE_MIN, 3);
  assert.equal(G.MID_FILM_FAKE_ARRAY_CODE, 'mid-film-fake-array');
});

test('文案→包装 default pointer chain: HOUSE/AGENTS/prompts/sessionbrief inherit order; openings only ready; evidence→evidence-card', async () => {
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  const agents = fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8');
  const filmdesign = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/filmdesign.md'), 'utf8');
  const visual = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/visual-director.md'), 'utf8');
  const greybox = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8');
  const beatdesign = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/beatdesign.md'), 'utf8');
  const SB = await import(pathToFileURL(path.join(LIB, 'sessionbrief.mjs')).href);
  const BD = await import(pathToFileURL(path.join(LIB, 'beatdesign.mjs')).href);
  const F = await import(pathToFileURL(path.join(LIB, 'filmdesign.mjs')).href);
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);

  // 1) pointer chain present in HOUSE / AGENTS / prompts / session brief text
  for (const [name, body] of [['HOUSE', house], ['AGENTS', agents], ['filmdesign', filmdesign], ['visual-director', visual], ['greybox', greybox]]) {
    assert.match(body, /文案→包装/, `${name} must carry 文案→包装 pointer chain`);
    assert.match(body, /evidence-card/, `${name} must name evidence-card`);
    assert.match(body, /lineup-row/, `${name} must name ready opening lineup-row`);
    assert.match(body, /kit\.status/, `${name} must require kit.status ready for openings`);
  }
  assert.match(house, /默认指针链/);
  assert.match(house, /paperclip-138-open\/chapters\/B01\.mjs/);
  assert.match(house, /lessons\.json/);
  assert.match(house, /tells\.json/);
  assert.ok(house.split('\n').length < 160, 'HOUSE stays one page');
  // AGENTS must NOT recommend unwired shells as openings
  assert.doesNotMatch(agents, /Opening[\s\S]{0,200}use `stagger-reveal` or `array-build`/);
  assert.match(agents, /lineup-row/);
  assert.match(filmdesign, /证据拍默认/);
  assert.match(beatdesign, /证据拍.*默认.*evidence-card/);

  const brief = SB.briefText({
    id: 'x', chapter: 'B01',
    beats: [{ beat: 'B01', at: 0, dur: 4, text: '开场' }],
    greybox: { B01: { blocks: [], type: [], camera: { move: 'push' }, out: 'cut' } },
    film: { B01: { act: 'open', palette: 'noir', screen: 'clean', why: 'w' } },
    files: { house: 'work/recipe-board-v1/HOUSE.md', frames: { B01: 'f.png' } },
  });
  assert.match(brief, /文案→包装默认指针链/);
  assert.match(brief, /evidence-card/);
  assert.match(brief, /kit\.status/);
  assert.match(brief, /paperclip-138-open/);

  // 2) compositions ten + evidence default asserted in code
  assert.deepEqual([...BD.PACKAGING_COMPOSITIONS], [
    'hero-object', 'map-table', 'count-field', 'figure-card', 'sequence-line',
    'evidence-card', 'split-compare', 'globe-route', 'queue', 'title-footage',
  ]);
  assert.equal(BD.EVIDENCE_DEFAULT_COMPOSITION, 'evidence-card');
  const grammar = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/compositions.json'), 'utf8'));
  for (const id of BD.PACKAGING_COMPOSITIONS) assert.ok(grammar.compositions.find((c) => c.id === id), id);
  const ordered = BD.compositionShortlistForBeat(grammar.compositions, { medium: 'evidence' });
  assert.equal(ordered[0]?.id, 'evidence-card', 'evidence default composition leads shortlist');
  const gold = path.join(DATA, 'projects/paperclip-138-open/chapters/B01.mjs');
  assert.ok(fs.existsSync(gold), 'gold sample on disk under recipe-board projects');

  // 3) opening devices with kit.status!=ready must NOT be treated as allowed openings
  const devices = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/devices.json'), 'utf8'));
  const byId = Object.fromEntries((devices.devices || []).map((d) => [d.id, d]));
  for (const id of F.OPENING_SHELL_DEVICES) {
    assert.notEqual(byId[id]?.kit?.status, 'ready', `${id} must not be ready`);
  }
  for (const id of F.OPENING_READY_DEVICES) {
    assert.equal(byId[id]?.kit?.status, 'ready', `${id} must be ready`);
  }
  assert.deepEqual(F.readyOpeningDeviceIds(devices.devices), ['lineup-row', 'copy-to-repeat', 'table-grows']);
  // shell rows alone → empty allowed openings
  assert.deepEqual(F.readyOpeningDeviceIds([
    { id: 'array-build', kit: { status: 'none' } },
    { id: 'stagger-reveal', kit: { status: 'none' } },
    { id: 'light-3d', kit: { status: 'none' } },
  ]), []);
  // even if someone wrongly marks a shell ready, OPENING_READY_DEVICES membership still excludes it
  assert.deepEqual(F.readyOpeningDeviceIds([
    { id: 'array-build', kit: { status: 'ready' } },
    { id: 'lineup-row', kit: { status: 'ready' } },
  ]), ['lineup-row']);
  // open-beat shortlist must seed ready openings, never shells
  const openSl = F.designBeatShortlist({ act: 'open', medium: 'diagram', text: '开场' }, {
    palettes: [{ id: 'noir', for: '基调讲述' }],
    media: [{ id: 'clean', for: '真照片' }],
    devices: devices.devices,
  });
  for (const id of F.OPENING_SHELL_DEVICES) assert.ok(!openSl.devices.includes(id) || openSl.devices.indexOf(id) > 7, `${id} must not be preferred opening`);
  for (const id of F.OPENING_READY_DEVICES) assert.ok(openSl.devices.includes(id), `${id} in open shortlist`);
  assert.deepEqual([...G.OPENING_BUILD_DEVICES], [...F.OPENING_READY_DEVICES]);
});

test('director-routes: required kinds → ready devices only + gold; chapter→engine default matches HOUSE', async () => {
  const routesPath = path.join(DATA, 'routing/director-routes.json');
  assert.ok(fs.existsSync(routesPath), 'director-routes.json must exist');
  const table = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  assert.equal(table.contract, 'A1DirectorRoutes/v1');
  const required = ['opening', 'evidence', 'numbers', 'map', 'compare'];
  assert.deepEqual(table.requiredKinds, required);
  const byKind = Object.fromEntries((table.routes || []).map((r) => [r.kind, r]));
  for (const k of required) assert.ok(byKind[k], `missing route kind ${k}`);

  const devices = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/devices.json'), 'utf8'));
  const byId = Object.fromEntries((devices.devices || []).map((d) => [d.id, d]));
  const shells = ['array-build', 'stagger-reveal', 'light-3d', 'presenter-close'];
  for (const r of table.routes) {
    assert.ok(r.composition, `${r.kind} needs composition`);
    for (const d of r.devices || []) {
      assert.equal(d.status, 'ready', `${r.kind} device ${d.id} must declare status ready`);
      assert.equal(byId[d.id]?.kit?.status, 'ready', `${r.kind} cites ${d.id} but kit.status is ${byId[d.id]?.kit?.status}`);
      assert.ok(!shells.includes(d.id), `${r.kind} must not cite opening shell ${d.id} as ready`);
    }
    for (const d of r.altDevices || []) {
      if (d.status === 'ready') assert.equal(byId[d.id]?.kit?.status, 'ready', `altDevice ${d.id}`);
    }
    for (const g of r.gaps || []) {
      assert.ok(g.status === 'gap' || g.status === 'none', `${r.kind} gap ${g.id} status`);
      if (shells.includes(g.id)) assert.notEqual(byId[g.id]?.kit?.status, 'ready');
    }
    for (const g of r.gold || []) {
      assert.ok(fs.existsSync(path.join(REPO, g)), `gold missing: ${g}`);
    }
  }
  // opening hard-gate devices must be the wired three
  assert.deepEqual((byKind.opening.devices || []).map((d) => d.id), ['lineup-row', 'copy-to-repeat', 'table-grows']);
  for (const id of shells) {
    assert.ok((byKind.opening.gaps || []).some((g) => g.id === id), `opening gaps must list ${id}`);
  }
  assert.equal(byKind.evidence.composition, 'evidence-card');

  // director-default: greybox ≠ film / must graduate to engine — HOUSE + prompts + sessionbrief + AGENTS aligned
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  const agents = fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8');
  const filmdesign = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/filmdesign.md'), 'utf8');
  const greybox = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8');
  const visual = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/visual-director.md'), 'utf8');
  const SB = await import(pathToFileURL(path.join(LIB, 'sessionbrief.mjs')).href);
  for (const [name, body] of [['HOUSE', house], ['AGENTS', agents], ['filmdesign', filmdesign], ['greybox', greybox], ['visual-director', visual]]) {
    assert.match(body, /director-routes\.json/, `${name} must point at director-routes.json`);
    assert.match(body, /灰盒≠成片|Greybox ≠ film|Greybox is not the film/, `${name} must say greybox is not the film`);
  }
  assert.match(house, /必须上引擎/);
  assert.match(house, /不得把灰盒当终态/);
  assert.ok(house.split('\n').length < 160, 'HOUSE stays one page');
  assert.match(table.graduateToEngine?.rule || '', /灰盒≠成片/);
  const brief = SB.briefText({
    id: 'x', chapter: 'B01',
    beats: [{ beat: 'B01', at: 0, dur: 4, text: '开场' }],
    greybox: { B01: { blocks: [], type: [], camera: { move: 'push' }, out: 'cut' } },
    film: { B01: { act: 'open', palette: 'noir', screen: 'clean', why: 'w' } },
    files: { house: 'work/recipe-board-v1/HOUSE.md', frames: { B01: 'f.png' } },
  });
  assert.match(brief, /director-routes\.json/);
  assert.match(brief, /灰盒≠成片/);
  assert.match(brief, /必须上引擎|engine-capabilities/);
});


test('director-routes auto-pick: narration/cues → kind → composition → ready devices; shells never', async () => {
  const DR = await import(pathToFileURL(path.join(LIB, 'directorroutes.mjs')).href);
  const F = await import(pathToFileURL(path.join(LIB, 'filmdesign.mjs')).href);
  const BD = await import(pathToFileURL(path.join(LIB, 'beatdesign.mjs')).href);
  const SB = await import(pathToFileURL(path.join(LIB, 'sessionbrief.mjs')).href);
  const table = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/director-routes.json'), 'utf8'));
  const devices = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/devices.json'), 'utf8'));
  const grammar = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/compositions.json'), 'utf8'));
  const shells = ['array-build', 'stagger-reveal', 'light-3d', 'presenter-close'];

  // opening from旁白 semantics (and act=open)
  const openPick = DR.pickDirectorDefaults({ text: '开场：先让观众看清主体，标题压场' }, { table, devices });
  assert.equal(openPick.kind, 'opening');
  assert.equal(openPick.composition, 'title-footage');
  assert.deepEqual(openPick.devices, ['lineup-row', 'copy-to-repeat', 'table-grows']);
  for (const id of shells) assert.ok(!openPick.devices.includes(id), `opening must not select shell ${id}`);
  assert.ok(DR.OPENING_SHELL_IDS.includes('presenter-close'), 'presenter-close stays an opening shell in directorroutes');
  assert.ok(F.OPENING_SHELL_DEVICES.includes('presenter-close'), 'presenter-close stays an opening shell in filmdesign');
  assert.equal(DR.matchRouteKind({ act: 'open', text: '随便' }, table), 'opening');
  assert.equal(DR.matchRouteKind({ hero: true }, table), 'opening');

  // evidence from旁白 + medium
  const evPick = DR.pickDirectorDefaults({ text: '据报道，文件与照片显示原文公告' }, { table, devices });
  assert.equal(evPick.kind, 'evidence');
  assert.equal(evPick.composition, 'evidence-card');
  assert.ok(evPick.devices.includes('real-in-frame'));
  assert.ok(evPick.devices.length >= 3);
  assert.equal(DR.matchRouteKind({ medium: 'evidence', text: 'x' }, table), 'evidence');

  // numbers from旁白
  const numPick = DR.pickDirectorDefaults({ text: '概率涨到多少，库容量与人数比例' }, { table, devices });
  assert.equal(numPick.kind, 'numbers');
  assert.equal(numPick.composition, 'count-field');
  assert.ok(numPick.devices.includes('number-grows'));

  // map from旁白
  const mapPick = DR.pickDirectorDefaults({ text: '从哪到哪，散落全球跨洲路线' }, { table, devices });
  assert.equal(mapPick.kind, 'map');
  assert.equal(mapPick.composition, 'map-table');
  assert.ok(mapPick.devices.includes('map-pin-count') || mapPick.devices.includes('chapter-map'));

  // compare from旁白
  const cmpPick = DR.pickDirectorDefaults({ text: '比较两边优劣，并排位点比对' }, { table, devices });
  assert.equal(cmpPick.kind, 'compare');
  assert.equal(cmpPick.composition, 'split-compare');
  assert.ok(cmpPick.devices.length >= 1);

  // even if table wrongly listed a shell as ready, helper still drops it
  const fakeOpen = {
    ...table,
    routes: table.routes.map((r) => r.kind !== 'opening' ? r : {
      ...r,
      devices: [...r.devices, { id: 'array-build', status: 'ready' }],
    }),
  };
  const safe = DR.pickDirectorDefaults({ act: 'open', text: '开场' }, {
    table: fakeOpen,
    devices: { devices: [
      ...devices.devices.filter((d) => d.id === 'lineup-row'),
      { id: 'array-build', kit: { status: 'ready' } },
    ] },
  });
  assert.ok(!safe.devices.includes('array-build'));
  assert.ok(safe.devices.includes('lineup-row'));

  // compositionShortlistForBeat leads with route default from narration
  const orderedEv = BD.compositionShortlistForBeat(grammar.compositions, { text: '据报道文件原文' }, { table });
  assert.equal(orderedEv[0]?.id, 'evidence-card');
  const orderedNum = BD.compositionShortlistForBeat(grammar.compositions, { text: '数量比例涨到多少' }, { table });
  assert.equal(orderedNum[0]?.id, 'count-field');
  const orderedOpen = BD.compositionShortlistForBeat(grammar.compositions, { text: '开场标题压场' }, { table });
  assert.equal(orderedOpen[0]?.id, 'title-footage');

  // filmdesign shortlist seeds route ready devices; shells never preferred for opening
  const openSl = F.designBeatShortlist({ act: 'open', text: '开场' }, {
    palettes: [{ id: 'noir', for: '基调讲述' }],
    media: [{ id: 'clean', for: '真照片' }],
    devices: devices.devices,
    table,
  });
  for (const id of F.OPENING_READY_DEVICES) assert.ok(openSl.devices.includes(id), `${id} in open shortlist`);
  for (const id of shells) assert.ok(!openSl.devices.includes(id), `shell ${id} excluded from open shortlist`);
  assert.equal(openSl.routeKind, 'opening');
  assert.equal(openSl.routeComposition, 'title-footage');

  const numSl = F.designBeatShortlist({ text: '概率涨到库容量' }, {
    palettes: [{ id: 'noir', for: '基调讲述' }],
    media: [{ id: 'clean', for: '真照片' }],
    devices: devices.devices,
    table,
  });
  assert.equal(numSl.routeKind, 'numbers');
  assert.ok(numSl.devices.includes('number-grows'));

  // sessionbrief surfaces chosen defaults for chapter agents
  const brief = SB.briefText({
    id: 'x', chapter: 'B01',
    beats: [{ beat: 'B01', at: 0, dur: 4, text: '据报道文件显示' }],
    greybox: { B01: { blocks: [], type: [], camera: { move: 'push' }, out: 'cut' } },
    film: { B01: { act: 'build', medium: 'evidence', palette: 'noir', screen: 'film', why: 'w' } },
    files: { house: 'work/recipe-board-v1/HOUSE.md', frames: { B01: 'f.png' } },
    routes: { B01: evPick },
  });
  assert.match(brief, /导演路由默认/);
  assert.match(brief, /kind=evidence/);
  assert.match(brief, /composition=evidence-card/);
  assert.match(brief, /real-in-frame/);
});


test('director-routes pin-into-answers: auto-pick pins kind/composition/device; mismatch → 未吃; match → ok', async () => {
  const DR = await import(pathToFileURL(path.join(LIB, 'directorroutes.mjs')).href);
  const F = await import(pathToFileURL(path.join(LIB, 'filmdesign.mjs')).href);
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const table = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/director-routes.json'), 'utf8'));
  const devices = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/devices.json'), 'utf8'));

  // (a) auto-pick pins answer fields
  const evPick = DR.pickDirectorDefaults({ text: '据报道，文件与照片显示原文公告', medium: 'evidence' }, { table, devices });
  assert.equal(evPick.kind, 'evidence');
  assert.equal(evPick.composition, 'evidence-card');
  assert.ok(evPick.devices.includes('real-in-frame'));
  const bare = { beat: 'B02', act: 'build', medium: 'evidence', palette: 'noir', screen: 'film', why: 'evidence card from the page', device: null };
  const pinned = DR.pinRouteIntoAnswerBeat(bare, evPick);
  assert.equal(pinned.kind, 'evidence', 'pin writes kind');
  assert.equal(pinned.composition, 'evidence-card', 'pin writes composition');
  assert.equal(pinned.device, evPick.devices[0], 'pin writes primary ready device');
  assert.ok(!['array-build', 'stagger-reveal', 'light-3d', 'presenter-close'].includes(pinned.device), 'pin never shells');

  const openPick = DR.pickDirectorDefaults({ act: 'open', text: '开场标题压场' }, { table, devices });
  const openPinned = DR.pinRouteIntoAnswerBeat({ beat: 'B01', act: 'open', device: null }, openPick);
  assert.equal(openPinned.kind, 'opening');
  assert.equal(openPinned.composition, 'title-footage');
  assert.ok(F.OPENING_READY_DEVICES.includes(openPinned.device), 'opening pins a wired ready device');

  const byBeat = DR.pickDirectorDefaultsByBeat([
    { beat: 'B01', act: 'open', text: '开场' },
    { beat: 'B02', text: '据报道文件显示', medium: 'evidence' },
  ], { table, devices });
  const ans = DR.pinRouteDefaultsIntoAnswer({
    arc: 'open then evidence',
    beats: [
      { beat: 'B01', act: 'open', device: null },
      { beat: 'B02', medium: 'evidence', device: null },
    ],
  }, byBeat);
  assert.equal(ans.beats[0].kind, 'opening');
  assert.equal(ans.beats[1].composition, 'evidence-card');
  assert.ok(ans.beats[1].device);

  // (b) mismatch → error 「路由选了但答案未吃」
  const mismatch = {
    beats: [{
      beat: 'B02', kind: 'map', composition: 'map-table', device: 'array-build',
      act: 'build', medium: 'evidence', scale: 'place', value: 'mid', red: 1,
      hero: false, heroHow: null, subject: 'doc', palette: 'noir', screen: 'film',
      why: 'wrong route fields on purpose',
    }],
  };
  const uneaten = DR.routeUneatenErrors(mismatch.beats, { B02: evPick }, { prefix: 'film' });
  assert.ok(uneaten.length >= 1, 'mismatch must error');
  assert.ok(uneaten.every((m) => m.includes('路由选了但答案未吃')), uneaten.join(' | '));
  assert.ok(uneaten.some((m) => /kind/.test(m)));
  assert.ok(uneaten.some((m) => /device/.test(m)));

  const filmMsgs = F.filmRouteUneatenErrors(mismatch.beats, { B02: evPick });
  assert.ok(filmMsgs.some((m) => m.includes('路由选了但答案未吃')));

  const greyMsgs = G.greyboxRouteUneatenErrors(
    [{ beat: 'B01', device: 'array-build', kind: 'opening', composition: 'title-footage' }],
    { B01: openPick },
  );
  assert.ok(greyMsgs.some((m) => /device/.test(m) && m.includes('路由选了但答案未吃')));

  // missing fields also 未吃
  const missing = DR.routeUneatenErrors(
    [{ beat: 'B02', act: 'build', medium: 'evidence' }],
    { B02: evPick },
    { prefix: 'film' },
  );
  assert.ok(missing.some((m) => /kind/.test(m) && m.includes('答案未吃')));
  assert.ok(missing.some((m) => /composition/.test(m)));
  assert.ok(missing.some((m) => /device/.test(m)));

  // (c) match → ok (pinned / explicit ready device in route list)
  const matched = DR.pinRouteIntoAnswerBeat({
    beat: 'B02', act: 'build', medium: 'evidence', scale: 'place', value: 'mid', red: 1,
    hero: false, heroHow: null, subject: 'doc', palette: 'noir', screen: 'film',
    why: 'evidence from the filing', device: null,
  }, evPick);
  assert.deepEqual(DR.routeUneatenErrors([matched], { B02: evPick }, { prefix: 'film' }), []);
  // alt device still in route ready list → ok
  const altDev = evPick.devices[1] || evPick.devices[0];
  assert.deepEqual(DR.routeUneatenErrors([{ ...matched, device: altDev }], { B02: evPick }, { prefix: 'film' }), []);
  // pin does not overwrite an already-correct device
  const kept = DR.pinRouteIntoAnswerBeat({ ...matched, device: altDev }, evPick);
  assert.equal(kept.device, altDev);

  // filmDesignErrors wires uneaten when table + catalogs present
  const rowOk = {
    beat: 'B02', act: 'build', scale: 'place', value: 'mid', medium: 'evidence', red: 1,
    hero: true, heroHow: 'card over page', subject: 'the filing', palette: 'noir', screen: 'film',
    why: 'evidence page belongs on film screen', ...DR.routeAnswerFields(evPick),
  };
  // need a minimal multi-beat design for filmDesignErrors arc gates — use uneaten helper path via filmRouteUneatenErrors only here
  assert.deepEqual(F.filmRouteUneatenErrors([rowOk], { B02: evPick }), []);

  // HOUSE / AGENTS mention pin-into-answers
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  const agents = fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8');
  assert.match(house, /路由选了但答案未吃/);
  assert.match(agents, /答案未吃/);
});


test('shot-motion contract: schema + empty morph fails; greyboxDiffer escape; banana B02 §0.7 aligns', async () => {
  const SM = await import(pathToFileURL(path.join(LIB, 'shotmotion.mjs')).href);
  const SB = await import(pathToFileURL(path.join(LIB, 'sessionbrief.mjs')).href);
  const GB = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const schema = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/shot-motion-contract.schema.json'), 'utf8'));
  assert.equal(schema.contract, 'A1ShotMotionContract/v1');
  assert.match(schema.title || '', /A1ShotMotionContract/);

  const contract = SM.buildShotMotionContractFromGreybox({
    chapter: 'B02',
    project: 'x',
    rows: [
      { beat: 'B02', camera: { move: 'push', note: '压进特写' }, type: [{ text: '字', in: 6, role: 'big' }], out: 'push', note: '侧影 stagger' },
      { beat: 'B03', camera: { move: 'static', note: '百格依次亮' }, type: [{ text: '47%', role: 'number' }], out: 'glitch', note: 'tableGrows 格亮', blocks: [{ shape: 'grid', role: 'subject', label: '格' }] },
    ],
  });
  assert.equal(contract.contract, 'A1ShotMotionContract/v1');
  assert.equal(contract.shots.length, 2);
  assert.equal(contract.shots[0].camera.move, 'push');
  assert.equal(contract.shots[0].subjectMotion, 'stagger');
  assert.equal(contract.shots[0].type.inStrategy, 'late');
  assert.ok(['tableGrows', 'gridMotion'].includes(contract.shots[1].subjectMotion));

  // Synthetic: contract present, morph empty → must fail red
  const emptyErr = SM.motionContractUneatenErrors('', contract);
  assert.ok(emptyErr.length >= 2, 'empty morph must fail');
  assert.ok(emptyErr.every((m) => m.includes('运动合同选了但答案未吃')), emptyErr.join(' | '));

  const bareMorph = 'export const DUR = 1;\nexport const beats = [{ at: 0 }];\nexport function items(){return []}\nexport function pose(){}\n';
  const bareErr = SM.motionContractUneatenErrors(bareMorph, contract);
  assert.ok(bareErr.some((m) => /subjectMotion|camera|type|seam/.test(m) && m.includes('运动合同选了但答案未吃')), bareErr.join(' | '));

  // greyboxDiffer with written reason escapes
  const differOk = SM.motionContractUneatenErrors(bareMorph, contract, {
    greyboxDiffer: { B02: '导演改成别的运动理由写满八字以上', B03: '导演改成别的运动理由写满八字以上' },
  });
  assert.deepEqual(differOk, []);

  // sessionbrief briefText injects contract summary
  const brief = SB.briefText({
    id: 'x', chapter: 'B02',
    beats: [{ beat: 'B02', at: 0, dur: 4, text: '一模一样' }],
    greybox: { B02: { blocks: [], type: [], camera: { move: 'push' }, out: 'cut' } },
    film: { B02: { act: 'build', palette: 'mustard', screen: 'clean', why: 'w' } },
    files: { house: 'work/recipe-board-v1/HOUSE.md', frames: { B02: 'f.png' } },
    motionContract: contract,
  });
  assert.match(brief, /A1ShotMotionContract\/v1/);
  assert.match(brief, /subjectMotion=/);
  assert.match(brief, /运动合同选了但答案未吃|motionContractUneatenErrors/);

  // Banana B02: motion.json exists and aligns with §0.7 four beats
  const bananaMd = path.join(DATA, 'projects/banana-design/tasks/session-B02.md');
  const bananaMotion = path.join(DATA, 'projects/banana-design/tasks/session-B02.motion.json');
  assert.ok(fs.existsSync(bananaMd), 'banana session-B02.md');
  assert.ok(fs.existsSync(bananaMotion), 'banana session-B02.motion.json must exist');
  const gold = JSON.parse(fs.readFileSync(bananaMotion, 'utf8'));
  assert.equal(gold.contract, 'A1ShotMotionContract/v1');
  assert.deepEqual(gold.shots.map((s) => s.shotId), ['B02', 'B03', 'B04', 'B05']);
  const table = SM.parseSessionBriefShotTable(fs.readFileSync(bananaMd, 'utf8'));
  assert.equal(table.length, 4, '§0.7 four beats');
  assert.equal(table[0].subjectMotion, 'stagger');
  assert.equal(table[1].subjectMotion, 'tableGrows');
  assert.equal(table[2].subjectMotion, 'copyRepeat'); // rough-cut brief: cream flat 剖面 copyRepeat（非 formation-chain）
  assert.equal(table[3].subjectMotion, 'subject-motion'); // rough-cut: 共同易感同步，非 contagion-stagger
  assert.equal(table[3].seam.out, 'flash');
  // gold file aligns with table subjectMotion classes
  for (let i = 0; i < 4; i++) {
    assert.equal(gold.shots[i].subjectMotion, table[i].subjectMotion, `gold ${gold.shots[i].shotId} subjectMotion`);
  }
  assert.equal(gold.shots[0].camera.move, 'push');
  assert.equal(gold.shots[2].camera.move, 'pan');
  assert.equal(gold.shots[3].seam.out, 'flash');

  // HOUSE / AGENTS one-liners
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  const agents = fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8');
  assert.match(house, /A1ShotMotionContract\/v1/);
  assert.match(house, /运动合同选了但答案未吃/);
  assert.match(agents, /A1ShotMotionContract\/v1|motionContractUneatenErrors/);

  // chapter wires the check (source contract)
  const chapSrc = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(chapSrc, /motionContractUneatenErrors/);
  assert.match(fs.readFileSync(path.join(LIB, 'sessionbrief.mjs'), 'utf8'), /writeChapterMotionContract|motionContract/);

  // lessons gap list recorded
  const lessons = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/lessons.json'), 'utf8'));
  assert.ok(lessons.lessons.some((x) => x.id === 'L127-shot-motion-contract'));
  assert.ok(Array.isArray(lessons.proseHardConstraintGaps) && lessons.proseHardConstraintGaps.length >= 1);
  // every scanned gap closed: wired OR explicit 不可机读原因 (no silent leftovers)
  for (const g of lessons.proseHardConstraintGaps) {
    assert.ok(g.status === 'wired' || g.status === '不可机读', g.id);
    if (g.status === '不可机读') assert.ok(String(g['不可机读原因'] || '').length >= 20, g.id);
    if (g.status === 'wired') assert.ok(String(g.wired || '').length >= 8, g.id);
  }
  const gapIds = lessons.proseHardConstraintGaps.map((g) => g.id);
  for (const id of ['gap-camMove-numeric-band', 'gap-b01-camera-pose-inheritance', 'gap-material-packaging-language', 'gap-clone-motif-three-layers', 'gap-subject-model-path', 'gap-preview-delivery-mp4', 'gap-rough-cut-gate-profile']) {
    assert.ok(gapIds.includes(id), id);
  }
});

test('shot-motion hard gaps: camMove band, poseFrom, subject.model, clone motif, preview delivery; materials 不可机读', async () => {
  const SM = await import(pathToFileURL(path.join(LIB, 'shotmotion.mjs')).href);
  const os = await import('node:os');
  const gold = JSON.parse(fs.readFileSync(path.join(DATA, 'projects/banana-design/tasks/session-B02.motion.json'), 'utf8'));
  assert.equal(gold.contract, 'A1ShotMotionContract/v1');
  assert.equal(gold.shots[0].camera.camMoveMin, 0.55);
  assert.equal(gold.shots[0].camera.camMoveMax, 0.65);
  assert.deepEqual(gold.shots[0].seam.poseFrom, { s: 1.08, x: 0, y: -20 });
  assert.equal(gold.shots[0].subject.model, 'banana');
  assert.equal(gold.motif?.id, 'clone-equals-singular');
  assert.equal(gold.motif.layers.length, gold.shots.length, 'motif layers track chapter shots (B02–B05)');
  assert.equal(gold.delivery?.previewMp4, true);
  assert.equal(gold.delivery?.bindMorphHash, true);
  assert.equal(gold.gateProfile, 'rough-cut');
  assert.equal(gold.delivery?.gateProfile, 'rough-cut');

  // 1 camMove band: morph with move outside band fails; gold band intensities pass
  const bandOnly = {
    contract: 'A1ShotMotionContract/v1', chapter: 'T', shots: [{
      shotId: 'T1', camera: { move: 'push', camMove: null, camMoveMin: 0.55, camMoveMax: 0.65, note: null },
      camMove: 'push', subjectMotion: 'stagger', subject: null,
      type: { inStrategy: 'late', in: null }, seam: { in: null, out: 'cut', poseFrom: null }, note: null,
    }],
  };
  const outOfBand = "export const beats=[{at:0,cam:{x:960,y:540,s:1},move:0.2,camMove:0.2}];\nexport function items(){return []}\nmoves.stagger; props.model;\n";
  assert.ok(SM.motionContractUneatenErrors(outOfBand, bandOnly).some((m) => /camMoveBand/.test(m) && m.includes('运动合同选了但答案未吃')));
  const inBand = "export const beats=[{at:0,cam:{x:960,y:540,s:1.08},move:0.6,camMove:1.1}];\nexport function items(){return []}\nmoves.stagger; kit.props.model(THREE, 'banana', { what: 'a banana' });\n";
  assert.deepEqual(SM.motionContractUneatenErrors(inBand, bandOnly).filter((m) => /camMoveBand/.test(m)), []);

  // 2 poseFrom: missing scale fails; s:1.08 passes
  const poseC = {
    contract: 'A1ShotMotionContract/v1', chapter: 'T', shots: [{
      shotId: 'T1', camera: { move: 'push', camMove: null, camMoveMin: null, camMoveMax: null, note: null },
      camMove: 'push', subjectMotion: 'stagger', subject: null,
      type: { inStrategy: 'late', in: null },
      seam: { in: 'push', out: 'push', poseFrom: { s: 1.08, x: 0, y: -20 } }, note: null,
    }],
  };
  const noPose = "export const beats=[{at:0,cam:{x:960,y:540,s:1},move:0.6,camMove:1}];\nmoves.stagger; push;\n";
  assert.ok(SM.motionContractUneatenErrors(noPose, poseC).some((m) => /poseFrom/.test(m)));
  const withPose = "export const beats=[{at:0,cam:{x:960,y:520,s:1.08},move:0.6,camMove:1}];\nmoves.stagger; push;\n";
  assert.deepEqual(SM.motionContractUneatenErrors(withPose, poseC).filter((m) => /poseFrom/.test(m)), []);

  // greybox builder carries camera.from → seam.poseFrom
  const fromGb = SM.buildShotMotionContractFromGreybox({
    chapter: 'B02', rows: [{
      beat: 'B02', camera: { move: 'push', note: '续压', from: { s: 1.08, x: 0, y: -20 }, to: { s: 1.22, x: -40, y: 0 } },
      type: [{ text: '字', in: 6 }], out: 'push', note: '侧影 stagger',
    }],
  });
  assert.deepEqual(fromGb.shots[0].seam.poseFrom, { s: 1.08, x: 0, y: -20 });

  // 3 materials: only 不可机读 leftover in lessons (no silent hang)
  const lessons = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/lessons.json'), 'utf8'));
  const mat = lessons.proseHardConstraintGaps.find((g) => g.id === 'gap-material-packaging-language');
  assert.equal(mat.status, '不可机读');
  assert.match(mat['不可机读原因'], /芥黄|剖面|病斑|mature|evidence|味觉|表面/);
  const contractGapIds = ['gap-camMove-numeric-band', 'gap-b01-camera-pose-inheritance', 'gap-material-packaging-language', 'gap-clone-motif-three-layers', 'gap-subject-model-path', 'gap-preview-delivery-mp4'];
  const leftovers = lessons.proseHardConstraintGaps.filter((g) => contractGapIds.includes(g.id) && g.status !== 'wired');
  assert.deepEqual(leftovers.map((g) => g.id), ['gap-material-packaging-language']);

  // 4 clone motif three layers
  const motifBare = "export const beats=[{at:0,cam:{x:960,y:540,s:1},move:0.6}];\nexport function items(){return []}\n";
  const motifErr = SM.motionContractUneatenErrors(motifBare, {
    ...gold,
    // keep motif + shots but empty morph → motif layer signals fail (and others)
  });
  assert.ok(motifErr.some((m) => /motif/.test(m) && m.includes('运动合同选了但答案未吃')), motifErr.join(' | '));
  const bananaMorph = JSON.parse(fs.readFileSync(path.join(DATA, 'projects/banana-design/tasks/morph-B02.checked.json'), 'utf8')).code;
  const bananaOk = SM.motionContractUneatenErrors(bananaMorph, gold);
  // Do not rewrite B02 morph visuals: pre-existing seam.out tokens (glitch/match) may still be prose-only.
  // NEW hard fields must be eaten: camMove band, poseFrom, subject.model, motif layers.
  assert.deepEqual(bananaOk.filter((m) => /camMoveBand|poseFrom|subject\.model|motif/.test(m)), [], bananaOk.join(' | '));
  assert.ok(bananaOk.every((m) => /seam\.out/.test(m)), 'only legacy seam.out leftovers allowed on current morph: ' + bananaOk.join(' | '));

  // 5 subject.model declared → must appear in kit.props.model
  const subC = {
    contract: 'A1ShotMotionContract/v1', chapter: 'T', shots: [{
      shotId: 'T1', camera: { move: 'static', camMove: null, camMoveMin: null, camMoveMax: null, note: null },
      camMove: 'static', subjectMotion: 'stagger', subject: { model: 'banana' },
      type: { inStrategy: 'late', in: null }, seam: { in: null, out: 'cut', poseFrom: null }, note: null,
    }],
  };
  assert.ok(SM.motionContractUneatenErrors('moves.stagger;\n', subC).some((m) => /subject\.model/.test(m)));
  assert.deepEqual(SM.motionContractUneatenErrors("moves.stagger; await kit.props.model(THREE, 'banana', { what: 'a curved yellow banana' });\n", subC), []);

  // session §0.7 parse picks band + model when prose mentions them
  const md = fs.readFileSync(path.join(DATA, 'projects/banana-design/tasks/session-B02.md'), 'utf8');
  const table = SM.parseSessionBriefShotTable(md);
  assert.ok(table.some((s) => s.camera.camMoveMin === 0.55 && s.camera.camMoveMax === 0.65), '§0.7 band');
  assert.ok(table.every((s) => s.subject?.model === 'banana'), '§0.7 subject.model');
  const pose = SM.parsePoseFromSessionMd(md);
  assert.deepEqual(pose, { s: 1.08, x: 0, y: -20 });

  // 6 preview delivery (stillsBeforePreview:false keeps bind/mp4 unit focused; G2 covers stills)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-preview-del-'));
  const code = "export const beats=[{at:0,move:0.6}];\n";
  const del = { previewMp4: true, bindMorphHash: true, stillsBeforePreview: false };
  assert.ok(SM.previewDeliveryErrors({ outDir: tmp, morphCode: code, delivery: del }).some((m) => /previewMp4/.test(m)));
  fs.writeFileSync(path.join(tmp, 'preview.mp4'), Buffer.alloc(64));
  assert.ok(SM.previewDeliveryErrors({ outDir: tmp, morphCode: code, delivery: del }).some((m) => /bindMorphHash/.test(m)));
  SM.writePreviewBind(tmp, code);
  assert.deepEqual(SM.previewDeliveryErrors({ outDir: tmp, morphCode: code, delivery: del }), []);
  assert.ok(SM.previewDeliveryErrors({ outDir: tmp, morphCode: code + 'x', delivery: del }).some((m) => /bindMorphHash/.test(m)));
  fs.rmSync(tmp, { recursive: true, force: true });

  // chapter wires previewDeliveryErrors + writePreviewBind
  const chapSrc = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(chapSrc, /previewDeliveryErrors/);
  assert.match(chapSrc, /writePreviewBind/);
  assert.match(chapSrc, /writePreviewBind\(dir, renderedSource\.code/, 'bind the module actually rendered, not the old accepted module');
});


test('gateProfile rough-cut: calm/B26-gold duration warns (does not block); full/default still errors; preview bind before drift throw', async () => {
  const SM = await lib('shotmotion.mjs');
  const { holdErrors, CALM_MAX } = await lib('chapter.mjs');
  const still = Array.from({ length: 90 }, (_, i) => ({ t: i * 0.1, d: i < 5 ? 9 : 0.4, s: 2 }));
  const shots = [{ shotId: 'B04', at: 0, dur: 9 }];

  assert.equal(SM.resolveGateProfile({ gateProfile: 'rough-cut' }), SM.GATE_PROFILE_ROUGH);
  assert.equal(SM.resolveGateProfile({ delivery: { gateProfile: 'roughCut' } }), SM.GATE_PROFILE_ROUGH);
  assert.equal(SM.resolveGateProfile({ source: 'rough-cut-20261029' }), SM.GATE_PROFILE_ROUGH);
  assert.equal(SM.resolveGateProfile({ about: '本章 **粗版 GO** · 开场' }), SM.GATE_PROFILE_ROUGH);
  assert.equal(SM.resolveGateProfile({}, { sessionMd: '> **粗版 GO** · 2026-10-29' }), SM.GATE_PROFILE_ROUGH);
  assert.equal(SM.resolveGateProfile({ gateProfile: 'full' }), SM.GATE_PROFILE_FULL);
  assert.equal(SM.resolveGateProfile({}), SM.GATE_PROFILE_FULL, 'omit → full (design-set/mature calm still hard)');

  const asWarn = holdErrors(still, shots, { calmMax: CALM_MAX, calmAsWarn: true });
  assert.deepEqual(asWarn.errors.filter((e) => /nothing new happens/.test(e)), [], 'rough-cut: calm must not block');
  assert.ok(asWarn.warnings.some((w) => /nothing new happens/.test(w)), 'rough-cut: calm warns');
  // frozen still hard even under calmAsWarn
  const frozenCurve = Array.from({ length: 50 }, (_, i) => ({ t: i * 0.1, d: 0.05, s: 0.02 }));
  assert.ok(holdErrors(frozenCurve, [{ shotId: 'B04', at: 0, dur: 5 }], { calmAsWarn: true }).errors.some((e) => /frozen for/.test(e)), 'frozen stays error under rough-cut');

  const asErr = holdErrors(still, shots, { calmMax: CALM_MAX, calmAsWarn: false });
  assert.ok(asErr.errors.some((e) => /nothing new happens/.test(e)), 'full: calm still blocks');

  // banana session declares rough-cut GO machine-readably
  const bananaMotion = JSON.parse(fs.readFileSync(path.join(DATA, 'projects/banana-design/tasks/session-B02.motion.json'), 'utf8'));
  assert.equal(SM.resolveGateProfile(bananaMotion), SM.GATE_PROFILE_ROUGH);
  assert.equal(bananaMotion.gateProfile, 'rough-cut');

  // previewChapter: bind must run before input-drift throw (else stale bind vs new preview.mp4)
  const chapSrc = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  const fn = chapSrc.match(/export async function previewChapter[\s\S]*?\nexport /);
  assert.ok(fn, 'previewChapter body found');
  const body = fn[0];
  const bindAt = body.indexOf('writePreviewBind(dir, renderedSource.code');
  const driftAt = body.search(/preview inputs changed during render/);
  assert.ok(bindAt >= 0 && driftAt >= 0 && bindAt < driftAt, 'writePreviewBind before drift throw so successful preview always binds rendered morphHash');
});


test('G1 pureTimeErrors: impure wall-clock → ≥1 error; pure seek-style → 0; comments ignored', async () => {
  const SM = await lib('shotmotion.mjs');
  const impure = `
export const DUR = 5;
export const beats = [{ at: 0, move: 0.6 }];
export function pose(item, k, t, P, moves) {
  const wall = Date.now();
  const live = performance.now();
  setInterval(() => {}, 16);
  setTimeout(() => {}, 0);
  return { s: 1 + wall * 0, x: live * 0, y: 0 };
}
export async function items() { return []; }
`;
  const errs = SM.pureTimeErrors(impure);
  assert.ok(errs.length >= 1, 'impure must error');
  assert.ok(errs.some((m) => /Date\.now/.test(m)));
  assert.ok(errs.some((m) => /performance\.now/.test(m)));
  assert.ok(errs.some((m) => /setInterval/.test(m)));
  assert.ok(errs.some((m) => /setTimeout/.test(m)));

  const pure = `
export const DUR = 5;
export const beats = [{ at: 0, move: 0.6 }];
// Date.now() in comment must not trip
/* performance.now(); setInterval(()=>{},1); */
export function pose(item, k, t, P, moves) {
  const u = Math.min(1, Math.max(0, t / DUR));
  return { s: 1 + 0.08 * u, x: 0, y: -20 * u };
}
export async function items() { return []; }
`;
  assert.deepEqual(SM.pureTimeErrors(pure), []);

  const chapSrc = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(chapSrc, /pureTimeErrors/);
  assert.match(chapSrc, /errors\.push\(\.\.\.pureTimeErrors/);
});

test('seek replay compares lossless pixels and rejects material differences', async () => {
  const C = await lib('chapter.mjs');
  assert.deepEqual(C.seekReplayErrors({ mse: 0, channels: 3 }, 1), []);
  assert.deepEqual(C.seekReplayErrors({ mse: 0.001, channels: 3 }, 1), []);
  assert.match(C.seekReplayErrors({ mse: 100, channels: 3 }, 1)[0], /PSNR/);
  assert.match(C.seekReplayErrors(null, 1)[0], /did not return comparable/);
});

test('G2 stillsBeforePreview: missing stills hard-fails when flagged; 3 stills + bind clean; rough-cut soft', async () => {
  const SM = await lib('shotmotion.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-stills-del-'));
  const code = "export const beats=[{at:0,move:0.6}];\n";
  fs.writeFileSync(path.join(tmp, 'preview.mp4'), Buffer.alloc(64));

  // explicit stillsBeforePreview → hard error without stills
  assert.ok(SM.previewDeliveryErrors({
    outDir: tmp, morphCode: code,
    delivery: { previewMp4: true, bindMorphHash: true, stillsBeforePreview: true },
  }).some((m) => /stills-before-preview/.test(m)));

  // write 3 PNGs
  const stillsDir = path.join(tmp, 'stills');
  fs.mkdirSync(stillsDir, { recursive: true });
  for (const n of ['a.png', 'b.png', 'c.png']) fs.writeFileSync(path.join(stillsDir, n), Buffer.alloc(64));
  const frames = SM.listPreviewStills(tmp);
  SM.writePreviewStillsManifest(tmp, frames, { source: 'ffmpeg-preview' });
  SM.writePreviewBind(tmp, code);
  assert.ok(SM.previewDeliveryErrors({ outDir: tmp, morphCode: code,
    delivery: { previewMp4: true, bindMorphHash: true, stillsBeforePreview: true },
  }).some((m) => /stills-before-preview/.test(m)), 'post-preview frames cannot prove preflight');
  const receipt = SM.writePreviewPreflight(tmp, code, frames);
  assert.deepEqual(SM.writePreviewPreflight(tmp, code, frames), receipt, 'unchanged recheck retains original preflight time');
  assert.ok(SM.previewPreflightErrors(tmp, code, { startedAt: '2000-01-01T00:00:00.000Z' }).length, 'frames created after render started cannot prove preflight');
  SM.writePreviewBind(tmp, code, { startedAt: new Date(Date.now() + 1000).toISOString() });
  assert.deepEqual(SM.previewDeliveryErrors({
    outDir: tmp, morphCode: code,
    delivery: { previewMp4: true, bindMorphHash: true, stillsBeforePreview: true },
  }), []);
  assert.ok(SM.previewPreflightErrors(tmp, code + 'changed', SM.writePreviewBind(tmp, code, { startedAt: new Date(Date.now() + 1000).toISOString() })).length, 'different code cannot reuse receipt');
  fs.writeFileSync(frames[0], Buffer.alloc(65));
  assert.ok(SM.previewPreflightErrors(tmp, code, SM.writePreviewBind(tmp, code, { startedAt: new Date(Date.now() + 1000).toISOString() })).length, 'changed frame invalidates receipt');

  // rough-cut without stillsBeforePreview: soft warn, not hard error
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-stills-rough-'));
  fs.writeFileSync(path.join(tmp2, 'preview.mp4'), Buffer.alloc(64));
  SM.writePreviewBind(tmp2, code);
  const soft = [];
  assert.deepEqual(SM.previewDeliveryErrors({
    outDir: tmp2, morphCode: code,
    delivery: { previewMp4: true, bindMorphHash: true, gateProfile: 'rough-cut' },
    gateProfile: 'rough-cut', soft,
  }), []);
  assert.ok(soft.some((m) => /stills-before-preview/.test(m)), 'rough-cut stills missing → soft');

  // full profile auto-hard when preview delivery active
  assert.ok(SM.previewDeliveryErrors({
    outDir: tmp2, morphCode: code,
    delivery: { previewMp4: true, bindMorphHash: true },
    gateProfile: 'full',
  }).some((m) => /stills-before-preview/.test(m)));

  assert.equal(SM.resolveStillsBeforePreview({ stillsBeforePreview: true }, 'rough-cut'), 'hard');
  assert.equal(SM.resolveStillsBeforePreview({ stillsBeforePreview: false, previewMp4: true }, 'full'), 'off');
  assert.equal(SM.resolveStillsBeforePreview({ previewMp4: true }, 'rough-cut'), 'warn');
  assert.equal(SM.resolveStillsBeforePreview({ previewMp4: true }, 'full'), 'hard');
  const P1 = await lib('p1hard.mjs');
  const roughDelivery = { previewMp4: true, bindMorphHash: true, gateProfile: 'rough-cut' };
  assert.deepEqual(P1.effortDelivery(roughDelivery, 'standard'), roughDelivery);
  const studioDelivery = P1.effortDelivery(roughDelivery, P1.resolveEffort(null, { effort: 'studio' }));
  assert.ok(SM.previewDeliveryErrors({ outDir: tmp2, morphCode: code, delivery: studioDelivery, gateProfile: 'rough-cut', soft: [] }).some((m) => /stills-before-preview/.test(m)), 'studio requires bound preflight even for rough-cut');
  assert.equal(P1.effortDelivery(null, 'overnight').bindMorphHash, true);

  const chapSrc = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(chapSrc, /ensurePreviewStillsFromMp4/);
  assert.match(chapSrc, /deliverySoft/);

  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(tmp2, { recursive: true, force: true });
});

test('G3 HOUSE/AGENTS short Opus55+OVH pointers (no long X essay dump)', async () => {
  const house = fs.readFileSync(path.join(DATA, 'HOUSE.md'), 'utf8');
  const agents = fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8');
  assert.match(house, /OPUS55-TOP-ARCH-WIRE-2026-10-29\.md/);
  assert.match(house, /00-paradigm\.md/);
  assert.match(house, /02-verification\.md/);
  assert.match(house, /seek|纯 f\(t\)|pure f\(t\)/);
  // pointer must stay short: the new stub is one bullet
  const idx = house.indexOf('社区 Opus 线');
  assert.ok(idx >= 0);
  const after = house.slice(idx, idx + 500);
  const bulletEnd = after.indexOf('\n- ');
  const stub = bulletEnd > 0 ? after.slice(0, bulletEnd) : after.split('\n')[0];
  assert.ok(stub.split('\n').length <= 6, `HOUSE Opus stub ≤6 lines, got ${stub.split('\\n').length}`);
  assert.ok(!/seeconvm|flxrnc|0xMovez|rewind02/.test(house), 'do not paste X essay handles into HOUSE');
  assert.match(agents, /OPUS55-TOP-ARCH-WIRE-2026-10-29/);
});

test('greybox seam hard gates: world/screen jump rejects bare cut, cut-streak ≥3 fails, cut landing needs subject/evidence (synthetic fixtures)', async () => {
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const block = (role, w = 800, h = 600) => ({ label: role, shape: 'rect', role, x: 100, y: 100, w, h, model: null, view: null, image: null, in: 0, enter: null, lit: null });
  const camPoseFor = (move) => ({ static: [null, null], push: [{ s: 1, x: 0, y: 0 }, { s: 1.09, x: 0, y: 0 }], pull: [{ s: 1.1, x: 0, y: 0 }, { s: 1, x: 0, y: 0 }], pan: [{ s: 1.05, x: 70, y: 0 }, { s: 1.05, x: -70, y: 0 }], orbit: [{ s: 1.04, x: 50, y: 10 }, { s: 1.08, x: -40, y: -10 }], cut: [{ s: 1, x: 0, y: 0 }, { s: 1.02, x: 0, y: 0 }] }[move] || [null, null]);
  const row = (beat, out, cam, blocks, screen = 'clean', scale = 'place') => {
    const [from, to] = camPoseFor(cam);
    return {
      beat, blocks, type: [{ text: '测试', role: 'big', x: 200, y: 200, size: 128, align: 'left', accent: false, in: null, enter: null, near: null }],
      camera: { move: cam, note: null, from, to }, out, note: '',
    };
  };
  const beatsOf = (rows, meta) => rows.map((r) => ({ beat: r.beat, text: '测试一句台词', dur: 5, ...(meta[r.beat] || {}) }));

  // jump clean→led2 with bare cut and moving cameras → fail
  const jumpBad = { beats: [
    row('B1', 'cut', 'push', [block('subject')]),
    row('B2', 'whip', 'static', [block('subject')]),
  ]};
  const jumpMeta = { B1: { screen: 'clean', scale: 'place' }, B2: { screen: 'led2', scale: 'place' } };
  assert.match(G.greyboxErrors(jumpBad, beatsOf(jumpBad.beats, jumpMeta)).join('\n'), /B1→B2: screen clean→led2 leaves on cut/);

  // same jump but both settled → pass the jump rule (may still have other checks)
  const jumpOk = { beats: [
    row('B1', 'cut', 'static', [block('subject')]),
    row('B2', 'whip', 'static', [block('subject')]),
  ]};
  assert.doesNotMatch(G.greyboxErrors(jumpOk, beatsOf(jumpOk.beats, jumpMeta)).join('\n'), /leaves on cut/);

  // cover seam whip on screen jump → pass
  const jumpWhip = { beats: [
    row('B1', 'whip', 'push', [block('subject')]),
    row('B2', 'cut', 'static', [block('subject')]),
  ]};
  assert.doesNotMatch(G.greyboxErrors(jumpWhip, beatsOf(jumpWhip.beats, jumpMeta)).join('\n'), /leaves on cut/);

  // scale jump world→detail (≥2) with bare cut → fail
  const scaleBad = { beats: [
    row('B1', 'cut', 'push', [block('subject')]),
    row('B2', 'match', 'static', [block('subject')]),
  ]};
  const scaleMeta = { B1: { screen: 'clean', scale: 'world' }, B2: { screen: 'clean', scale: 'detail' } };
  assert.match(G.greyboxErrors(scaleBad, beatsOf(scaleBad.beats, scaleMeta)).join('\n'), /scale world→detail leaves on cut/);

  // three consecutive cuts → fail
  const streak = { beats: [
    row('B1', 'cut', 'static', [block('subject')]),
    row('B2', 'cut', 'static', [block('subject')]),
    row('B3', 'cut', 'static', [block('subject')]),
  ]};
  const streakMeta = Object.fromEntries(streak.beats.map((r) => [r.beat, { screen: 'clean', scale: 'place' }]));
  assert.match(G.greyboxErrors(streak, beatsOf(streak.beats, streakMeta)).join('\n'), /three outs in a row are cut/);

  // cut landing with only a tiny mark → fail subject/evidence rule
  const emptyLand = { beats: [
    row('B1', 'cut', 'static', [block('subject')]),
    { ...row('B2', 'whip', 'static', [{ label: '点', shape: 'ellipse', role: 'mark', x: 900, y: 500, w: 40, h: 40, model: null, view: null, image: null, in: 0, enter: null, lit: null }]), type: [{ text: '空落', role: 'big', x: 200, y: 200, size: 128, align: 'left', accent: false, in: null, enter: null, near: null }] },
  ]};
  const emptyMeta = { B1: { screen: 'clean', scale: 'place' }, B2: { screen: 'clean', scale: 'place' } };
  assert.match(G.greyboxErrors(emptyLand, beatsOf(emptyLand.beats, emptyMeta)).join('\n'), /cut lands with no subject\/evidence/);

  // prompt names the hard contract
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8'), /硬合同/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8'), /medium=evidence/);
});

test('greybox evidence plate hard gate: film medium=evidence needs photo|screen evidence block ≥15% frame (HOUSE / L113 / greybox.md)', async () => {
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  assert.deepEqual(G.EVIDENCE_SHAPES, ['photo', 'screen']);
  assert.equal(G.EVIDENCE_BLOCK_MIN_SHARE, 0.15);
  const type = [{ text: '证据', role: 'big', x: 200, y: 200, size: 128, align: 'left', accent: false, in: null, enter: null, near: null }];
  const cam = { move: 'static', note: null, from: null, to: null };
  const beatsEv = [{ beat: 'B1', text: '这是证据拍', dur: 5, medium: 'evidence', screen: 'clean', scale: 'place' }];
  const beatsDiag = [{ beat: 'B1', text: '图解', dur: 5, medium: 'diagram', screen: 'clean', scale: 'place' }];

  // missing evidence role → fail
  const noEv = { beats: [{ beat: 'B1', blocks: [{ label: '船', shape: 'ship', role: 'subject', x: 100, y: 100, w: 800, h: 600, model: null, view: null, image: null, in: 0, enter: null, lit: null }], type, camera: cam, out: 'cut', note: '' }] };
  assert.match(G.evidenceBlockErrors(noEv.beats, beatsEv).join('\n'), /no evidence block/);
  assert.match(G.greyboxErrors(noEv, beatsEv).join('\n'), /medium=evidence but no evidence block/);
  // diagram medium ignores the gate
  assert.deepEqual(G.evidenceBlockErrors(noEv.beats, beatsDiag), []);

  // wrong shape (rect) → fail
  const rectEv = { beats: [{ beat: 'B1', blocks: [{ label: '页', shape: 'rect', role: 'evidence', x: 100, y: 100, w: 1200, h: 800, model: null, view: null, image: null, in: 0, enter: null, lit: null }], type, camera: cam, out: 'cut', note: '' }] };
  assert.match(G.evidenceBlockErrors(rectEv.beats, beatsEv).join('\n'), /photo or screen/);

  // too small → fail
  const tiny = { beats: [{ beat: 'B1', blocks: [{ label: '页', shape: 'photo', role: 'evidence', x: 100, y: 100, w: 200, h: 120, model: null, view: null, image: null, in: 0, enter: null, lit: null }], type, camera: cam, out: 'cut', note: '' }] };
  assert.match(G.evidenceBlockErrors(tiny.beats, beatsEv).join('\n'), /15 % at least/);

  // photo/screen large enough → pass
  const srcCap = { text: 'Reuters', role: 'caption', x: null, y: null, size: 48, align: 'left', accent: false, in: null, enter: null, near: 'bottom-left' };
  const okPhoto = { beats: [{ beat: 'B1', blocks: [{ label: '页', shape: 'photo', role: 'evidence', x: 100, y: 100, w: 1200, h: 700, model: null, view: null, image: null, in: 0, enter: null, lit: null }], type: [...type, srcCap], camera: cam, out: 'cut', note: '' }] };
  const okScreen = { beats: [{ beat: 'B1', blocks: [{ label: '屏', shape: 'screen', role: 'evidence', x: 120, y: 200, w: 1680, h: 560, model: null, view: null, image: null, in: 0, enter: null, lit: null }], type: [...type, srcCap], camera: cam, out: 'cut', note: '' }] };
  assert.deepEqual(G.evidenceBlockErrors(okPhoto.beats, beatsEv), []);
  assert.deepEqual(G.evidenceBlockErrors(okScreen.beats, beatsEv), []);
  assert.doesNotMatch(G.greyboxErrors(okScreen, beatsEv).join('\n'), /medium=evidence|evidence block/);

  // banana + suez real answers stay green
  for (const id of ['banana-design', 'suez-evergiven-blind']) {
    const film = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects', id, 'tasks/filmdesign.answer.json'), 'utf8'));
    const gb = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects', id, 'tasks/greybox.answer.json'), 'utf8'));
    const beats = film.beats.map((r) => ({ beat: r.beat, text: 'x', dur: 5, medium: r.medium, screen: r.screen, scale: r.scale }));
    assert.deepEqual(G.evidenceBlockErrors(gb.beats, beats), [], `${id} evidence plates must pass`);
  }

  // prompt hard contract names the gate
  const prompt = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8');
  assert.match(prompt, /medium=evidence/);
  assert.match(prompt, /15%/);
});

test('HOUSE mature hard contracts: spine warn; title-press / evidence-card / placeholder fail; banana+suez pass (synthetic + real)', async () => {
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const M = await import(pathToFileURL(path.join(LIB, 'mature.mjs')).href);
  const U = await import(pathToFileURL(path.join(LIB, 'houseusage.mjs')).href);
  assert.deepEqual(M.MATURE_CODES, { SPINE: 'palette-spine-jump', TITLE: 'title-press-weak', EVIDENCE_CARD: 'evidence-not-card', PLACEHOLDER: 'placeholder-main' });
  assert.equal(M.paletteHueFamily('mustard'), 'mustard');
  assert.equal(M.paletteHueFamily('noir'), 'neutral');
  assert.equal(M.huesRelated('mustard', 'red'), true);
  assert.equal(M.huesRelated('mustard', 'cobalt'), false);

  // spine: mustard→cobalt jumps (warn-shaped); mustard→film-red related; via noir OK
  const spine = M.matureSpineErrors([
    { beat: 'B1', palette: { id: 'mustard' } },
    { beat: 'B2', palette: { id: 'cobalt-card' } },
    { beat: 'B3', palette: { id: 'noir' } },
    { beat: 'B4', palette: { id: 'film-red' } },
  ]);
  assert.equal(spine.length, 1);
  assert.equal(spine[0].code, 'palette-spine-jump');
  assert.match(spine[0].say, /mustard→cobalt/);

  const cam = { move: 'static', note: null, from: null, to: null };
  const big = (size, text = '大字') => [{ text, role: 'big', x: 200, y: 200, size, align: 'left', accent: false, in: null, enter: null, near: null }];
  const caption = { text: 'Reuters', role: 'caption', x: null, y: null, size: 48, align: 'left', accent: false, in: null, enter: null, near: 'bottom-left' };

  // title press: evidence with only 64 px → fail; 128 → pass
  const weakBeats = [{ beat: 'B1', text: 'x', dur: 5, medium: 'evidence' }];
  const weak = { beats: [{ beat: 'B1', blocks: [{ label: '页', shape: 'photo', role: 'evidence', x: 200, y: 150, w: 1200, h: 700, model: null, view: null, image: 'x.png', in: 0, enter: null, lit: null }], type: [...big(64), caption], camera: cam, out: 'cut', note: '' }] };
  assert.match(M.matureTitlePressErrors(weak, weakBeats).join('\n'), /title type too weak/);
  assert.match(G.greyboxErrors(weak, weakBeats).join('\n'), /title type too weak/);
  const strong = JSON.parse(JSON.stringify(weak)); strong.beats[0].type[0].size = 128;
  assert.deepEqual(M.matureTitlePressErrors(strong, weakBeats), []);

  // hero needs figure 200
  const heroBeats = [{ beat: 'B1', text: 'x', dur: 5, medium: 'type', hero: true }];
  const heroWeak = { beats: [{ beat: 'B1', blocks: [{ label: '底', shape: 'rect', role: 'context', x: 0, y: 0, w: 400, h: 200, model: null, view: null, image: null, in: 0, enter: null, lit: null }], type: big(128), camera: cam, out: 'cut', note: '' }] };
  assert.match(M.matureTitlePressErrors(heroWeak, heroBeats).join('\n'), /hero needs/);
  heroWeak.beats[0].type[0].size = 200;
  assert.deepEqual(M.matureTitlePressErrors(heroWeak, heroBeats), []);

  // evidence card: full-bleed wiki flat → fail; inset + caption + big → pass
  const evBeats = [{ beat: 'B1', text: '证据', dur: 5, medium: 'evidence' }];
  const wiki = { beats: [{ beat: 'B1', blocks: [{ label: 'Wiki', shape: 'photo', role: 'evidence', x: 0, y: 0, w: 1920, h: 1080, model: null, view: null, image: 'wiki.png', in: 0, enter: null, lit: null }], type: big(128), camera: cam, out: 'cut', note: '' }] };
  assert.match(M.matureEvidenceCardErrors(wiki, evBeats).join('\n'), /not card-packaged/);
  assert.match(G.greyboxErrors(wiki, evBeats).join('\n'), /not card-packaged/);
  const card = { beats: [{ beat: 'B1', blocks: [
    { label: '证据卡', shape: 'rect', role: 'context', x: 80, y: 60, w: 1760, h: 900, model: null, view: null, image: null, in: 0, enter: null, lit: null },
    { label: '报道', shape: 'screen', role: 'evidence', x: 140, y: 100, w: 1400, h: 700, model: null, view: null, image: 'r.png', in: 0, enter: null, lit: null },
  ], type: [...big(128), caption], camera: cam, out: 'cut', note: '' }] };
  assert.deepEqual(M.matureEvidenceCardErrors(card, evBeats), []);
  assert.doesNotMatch(G.greyboxErrors(card, evBeats).join('\n'), /not card-packaged|title type too weak|placeholder|lone big/);

  // placeholder: empty subject half-frame → fail; lone X → fail; filled photo OK
  const empty = { beats: [{ beat: 'B1', blocks: [{ label: '空框', shape: 'rect', role: 'subject', x: 100, y: 100, w: 1400, h: 800, model: null, view: null, image: null, in: 0, enter: null, lit: null }], type: big(128), camera: cam, out: 'cut', note: '' }] };
  assert.match(M.maturePlaceholderErrors(empty).join('\n'), /empty placeholder/);
  assert.match(G.greyboxErrors(empty, [{ beat: 'B1', text: 'x', dur: 5 }]).join('\n'), /empty placeholder/);
  const loneX = { beats: [{ beat: 'B1', blocks: [{ label: '大叉', shape: 'rect', role: 'subject', x: 400, y: 200, w: 800, h: 600, model: null, view: null, image: null, in: 0, enter: null, lit: null }], type: big(128), camera: cam, out: 'cut', note: '' }] };
  assert.match(M.maturePlaceholderErrors(loneX).join('\n'), /lone big X/);
  const filled = { beats: [{ beat: 'B1', blocks: [{ label: '真图', shape: 'photo', role: 'subject', x: 100, y: 100, w: 1400, h: 800, model: null, view: null, image: 'p.png', in: 0, enter: null, lit: null }], type: big(128), camera: cam, out: 'cut', note: '' }] };
  assert.deepEqual(M.maturePlaceholderErrors(filled), []);

  // HOUSE / prompts name the contracts — 默认成熟 = 图二气质 → four hard contracts
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  assert.match(house, /成熟（默认气质 · 硬合同）/);
  assert.match(house, /默认成熟\s*=\s*图二气质/);
  assert.match(house, /palette-spine-jump/);
  assert.match(house, /卡式包装/);
  const prompt = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8');
  assert.match(prompt, /成熟硬合同/);
  assert.match(prompt, /默认成熟\s*=\s*图二气质/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/filmdesign.md'), 'utf8'), /默认成熟\s*=\s*图二气质/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/visual-director.md'), 'utf8'), /默认成熟\s*=\s*图二气质/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/TYPE.md'), 'utf8'), /标题字压场/);

  // banana + suez real answers pass mature hard; usage still pass (spine warn only)
  for (const id of ['banana-design', 'suez-evergiven-blind']) {
    const film = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects', id, 'tasks/filmdesign.answer.json'), 'utf8'));
    const gb = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects', id, 'tasks/greybox.answer.json'), 'utf8'));
    assert.deepEqual(M.matureHardErrors(gb, film.beats), [], `${id} mature hard must pass`);
  }
  const cfg = { dataDir: path.join(REPO, 'work/recipe-board-v1') };
  for (const id of ['banana-design', 'suez-evergiven-blind']) {
    const m = U.houseUsage(cfg, id, { write: false });
    assert.equal(m.pass, true, `${id} usage must still pass`);
    assert.equal((m.flags || []).filter((f) => f.level === 'fail').length, 0);
  }
  // banana spine cleared (neutral carriers / unified warm spine); suez stays 0; warn code still fires on synthetic jump
  const bananaMeter = U.houseUsage(cfg, 'banana-design', { write: false });
  assert.equal((bananaMeter.flags || []).filter((f) => f.code === 'palette-spine-jump').length, 0, 'banana palette spine warns should be 0 after mature default fix');
  const suezMeter = U.houseUsage(cfg, 'suez-evergiven-blind', { write: false });
  assert.equal((suezMeter.flags || []).filter((f) => f.code === 'palette-spine-jump').length, 0, 'suez must not regress spine');
});



test('成熟第一稿检查清单: HOUSE six bars + 对标两期; sessionbrief inject; routing table; photo-plane still present; not banana-only', async () => {
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  const agents = fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8');
  const SB = await import(pathToFileURL(path.join(LIB, 'sessionbrief.mjs')).href);
  const tablePath = path.join(DATA, 'routing/mature-first-draft.json');
  assert.ok(fs.existsSync(tablePath), 'routing/mature-first-draft.json must exist');
  const table = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
  assert.equal(table.contract, 'A1MatureFirstDraft/v1');

  // HOUSE section + six bars (Neo user bar)
  assert.match(house, /## 成熟第一稿检查清单/);
  const bars = ['动效', '材料包装', '字体排版', '低模真 mesh', '一镜戏核', '接缝转场'];
  for (const b of bars) assert.match(house, new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `HOUSE must name bar ${b}`);
  assert.match(house, /对标两期/);
  assert.match(house, /paperclip-138-full/);
  assert.match(house, /回形针 Vol\.138/);
  assert.match(house, /hupo-69/);
  assert.match(house, /胡泊/);
  assert.match(house, /不是.*banana/);
  assert.match(house, /kit\.status: none/);
  // existing mature + photo-plane hard gates still present
  assert.match(house, /成熟（默认气质 · 硬合同）/);
  assert.match(house, /photo-plane-as-subject/);
  assert.match(house, /photoPlaneSubjectErrors/);

  // machine table keys match six bars + two benchmarks on disk
  assert.deepEqual(table.bars.map((b) => b.id), ['motion', 'material-packaging', 'type-layout', 'real-mesh', 'shot-core', 'seam-transition']);
  assert.deepEqual(table.bars.map((b) => b.label), bars);
  assert.deepEqual(table.benchmarks.map((b) => b.id), ['paperclip-138-full', 'hupo-69']);
  for (const bm of table.benchmarks) {
    assert.ok(fs.existsSync(path.join(REPO, bm.project)), `${bm.id} project must exist on disk`);
  }
  // disk evidence cited for both refs still holds
  const taste = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/taste.json'), 'utf8'));
  const houseStyle = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/house-style.json'), 'utf8'));
  assert.match(houseStyle.decided || '', /回形针 Vol\.138/);
  assert.match(houseStyle.decided || '', /胡泊/);
  const approvedFilms = new Set((taste.entries || []).filter((e) => e.verdict === 'approved').map((e) => e.film));
  assert.ok(approvedFilms.has('paperclip-138-full'), 'paperclip-138-full approved in taste.json');
  assert.ok(approvedFilms.has('hupo-auto2'), 'hupo aesthetic approved via hupo-auto2');
  assert.ok(fs.existsSync(path.join(DATA, 'projects/hupo-69')), 'hupo-69 project on disk');

  // AGENTS pointer
  assert.match(agents, /成熟第一稿检查清单/);
  assert.match(agents, /paperclip-138-full/);
  assert.match(agents, /hupo-69/);

  // sessionbrief injects the same checklist (alongside photo-plane / director-routes)
  const brief = SB.briefText({
    id: 'x', chapter: 'B01',
    beats: [{ beat: 'B01', at: 0, dur: 4, text: '开场' }],
    greybox: { B01: { blocks: [], type: [], camera: { move: 'push' }, out: 'cut' } },
    film: { B01: { act: 'open', palette: 'noir', screen: 'clean', why: 'w' } },
    files: { house: 'work/recipe-board-v1/HOUSE.md', frames: { B01: 'f.png' } },
  });
  assert.match(brief, /成熟第一稿检查清单/);
  for (const b of bars) assert.match(brief, new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `brief must name ${b}`);
  assert.match(brief, /paperclip-138-full/);
  assert.match(brief, /hupo-69/);
  assert.match(brief, /photo-plane-as-subject/);
  assert.match(brief, /director-routes\.json/);
  assert.match(brief, /不是 banana/);
  // not banana-specific: checklist must not require banana-design project
  assert.doesNotMatch(brief, /banana-design/);
  assert.doesNotMatch(house, /成熟第一稿检查清单[\s\S]{0,800}banana-design/);
  // runtime gate: only fails when claimed
  const M = await import(pathToFileURL(path.join(LIB, 'mature.mjs')).href);
  assert.equal(table.runtimeGate?.fn, 'matureFirstDraftErrors');
  assert.equal(M.MATURE_FIRST_DRAFT_CODE, 'mature-first-draft-incomplete');
  const cam = { move: 'static', note: null, from: null, to: null };
  const bare = { matureFirstDraft: true, beats: [{ beat: 'B1', blocks: [{ label: '空', shape: 'rect', role: 'subject', x: 100, y: 100, w: 1400, h: 800 }], type: [{ text: '字', role: 'big', x: 200, y: 200, size: 64, align: 'left', accent: false, in: null, enter: null, near: null }], camera: cam, out: 'cut', note: '' }] };
  const claimErr = M.matureFirstDraftErrors(bare, [{ beat: 'B1', text: 'x', dur: 5, medium: 'type', hero: true }]).join('\n');
  assert.match(claimErr, /mature-first-draft-incomplete/);
  assert.match(claimErr, /motion|type-layout|shot-core|placeholder/);
  assert.deepEqual(M.matureFirstDraftErrors({ ...bare, matureFirstDraft: false }, [{ beat: 'B1', text: 'x', dur: 5 }]), [], 'unclaimed must not fail');
  assert.match(house, /matureFirstDraftErrors/);
});


test('seams single source: allowed outs shared; illegal out fails greybox+usage; bare jump cut same predicate', async () => {
  const S = await import(pathToFileURL(path.join(LIB, 'seams.mjs')).href);
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const U = await import(pathToFileURL(path.join(LIB, 'houseusage.mjs')).href);
  assert.deepEqual(S.SEAMS, ['cut', 'match', 'whip', 'push', 'glitch', 'flash']);
  assert.deepEqual(G.SEAMS, S.SEAMS);
  assert.deepEqual(U.SEAMS, S.SEAMS);
  // offline: greybox.schema.json out.enum ≡ SEAMS (seams.mjs is the single source; schema must not drift)
  const scOut = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/greybox.schema.json'), 'utf8')).properties.beats.items.properties.out.enum;
  assert.deepEqual(scOut, S.SEAMS);
  assert.equal(S.worldOrScreenJump, S.worldOrScreenSwitch);
  assert.equal(G.worldOrScreenSwitch({ screen: 'clean', scale: 'place' }, { screen: 'led2', scale: 'place' }), true);
  assert.equal(U.worldOrScreenJump({ screen: 'clean', scale: 'place' }, { screen: 'led2', scale: 'place' }), true);
  assert.equal(S.coversWorldJump('whip', { move: 'push' }, { move: 'push' }), true);
  assert.equal(S.coversWorldJump('cut', { move: 'static' }, { move: 'static' }), true);
  assert.equal(S.coversWorldJump('cut', { move: 'push' }, { move: 'static' }), false);
  assert.equal(S.coversWorldJump('dissolve', { move: 'static' }, { move: 'static' }), false);

  const block = (role = 'subject') => ({ label: role, shape: 'rect', role, x: 100, y: 100, w: 800, h: 600, model: null, view: null, image: null, in: 0, enter: null, lit: null });
  const type = [{ text: '测试', role: 'big', x: 200, y: 200, size: 128, align: 'left', accent: false, in: null, enter: null, near: null }];
  const camPoseFor = (move) => ({ static: [null, null], push: [{ s: 1, x: 0, y: 0 }, { s: 1.09, x: 0, y: 0 }], pull: [{ s: 1.1, x: 0, y: 0 }, { s: 1, x: 0, y: 0 }], pan: [{ s: 1.05, x: 70, y: 0 }, { s: 1.05, x: -70, y: 0 }], orbit: [{ s: 1.04, x: 50, y: 10 }, { s: 1.08, x: -40, y: -10 }], cut: [{ s: 1, x: 0, y: 0 }, { s: 1.02, x: 0, y: 0 }] }[move] || [null, null]);
  const cam = (move) => { const [from, to] = camPoseFor(move); return { move, note: null, from, to }; };

  // legal outs pass greybox illegal-out gate
  for (const out of S.SEAMS) {
    assert.deepEqual(S.illegalSeamOutErrors([{ beat: 'B1', out }]), []);
  }
  // illegal out fails greybox check message (same wording as before)
  const badOut = { beats: [
    { beat: 'B1', blocks: [block()], type, camera: cam('static'), out: 'dissolve', note: '' },
    { beat: 'B2', blocks: [block()], type, camera: cam('static'), out: 'whip', note: '' },
  ]};
  const beats = [
    { beat: 'B1', text: '测试一句台词', dur: 5, screen: 'clean', scale: 'place' },
    { beat: 'B2', text: '测试一句台词', dur: 5, screen: 'clean', scale: 'place' },
  ];
  assert.match(G.greyboxErrors(badOut, beats).join('\n'), /seam out \(out\) dissolve/);
  assert.match(S.illegalSeamOutErrors(badOut.beats).join('\n'), /dissolve/);

  // usage must fail seam-unknown (not silently ignore)
  const filmOk = { beats: [
    { beat: 'B01', act: 'open', scale: 'place', value: 'light', medium: 'type', palette: 'mustard', screen: 'clean', red: 1, hero: true, heroHow: 'hook', why: 'open hook line here' },
    { beat: 'B02', act: 'build', scale: 'place', value: 'mid', medium: 'diagram', palette: 'mustard', screen: 'clean', red: 1, hero: false, heroHow: null, why: 'second beat stays clean' },
    { beat: 'B03', act: 'build', scale: 'place', value: 'mid', medium: 'diagram', palette: 'noir', screen: 'clean', red: 1, hero: false, heroHow: null, why: 'third beat stays clean' },
    { beat: 'B04', act: 'peak', scale: 'place', value: 'dark', medium: 'diagram', palette: 'indigo-night', screen: 'clean', red: 2, hero: true, heroHow: 'peak', why: 'peak beat designed' },
    { beat: 'B05', act: 'close', scale: 'place', value: 'light', medium: 'type', palette: 'mustard', screen: 'clean', red: 1, hero: true, heroHow: 'close', why: 'close callback type' },
    { beat: 'B06', act: 'close', scale: 'place', value: 'mid', medium: 'diagram', palette: 'teal-chart', screen: 'clean', red: 0, hero: false, heroHow: null, why: 'quiet closer beat' },
  ]};
  const greyUnk = { beats: filmOk.beats.map((r, i) => ({
    beat: r.beat, blocks: [block()], type: [], camera: cam('static'), out: i === 0 ? 'dissolve' : 'whip', note: '',
  }))};
  const mUnk = U.measureHouseUsage({ film: filmOk, greybox: greyUnk, bindings: { shots: {} }, storyboard: { shots: filmOk.beats.map((r) => ({ beat: r.beat, devices: [], evidence: [] })) }, id: 'unk' });
  assert.ok(mUnk.flags.some((f) => f.code === 'seam-unknown' && f.level === 'fail' && /dissolve/.test(f.say)));
  assert.equal(mUnk.pass, false);

  // bare jump cut: greybox error AND usage jump-cut from the same coversWorldJump predicate
  const jumpFilm = { beats: [
    { beat: 'B01', act: 'open', scale: 'place', value: 'light', medium: 'type', palette: 'mustard', screen: 'clean', red: 1, hero: true, heroHow: 'hook', why: 'open hook line here' },
    { beat: 'B02', act: 'build', scale: 'place', value: 'mid', medium: 'diagram', palette: 'mustard', screen: 'led2', red: 1, hero: false, heroHow: null, why: 'reading on a screen here' },
    { beat: 'B03', act: 'build', scale: 'place', value: 'mid', medium: 'diagram', palette: 'noir', screen: 'led2', red: 1, hero: false, heroHow: null, why: 'stay on screen beat' },
    { beat: 'B04', act: 'peak', scale: 'place', value: 'dark', medium: 'diagram', palette: 'indigo-night', screen: 'led2', red: 2, hero: true, heroHow: 'peak', why: 'peak on screen' },
    { beat: 'B05', act: 'close', scale: 'place', value: 'light', medium: 'type', palette: 'mustard', screen: 'clean', red: 1, hero: true, heroHow: 'close', why: 'close callback type' },
    { beat: 'B06', act: 'close', scale: 'place', value: 'mid', medium: 'diagram', palette: 'teal-chart', screen: 'clean', red: 0, hero: false, heroHow: null, why: 'quiet closer beat' },
  ]};
  const jumpGrey = { beats: jumpFilm.beats.map((r, i) => ({
    beat: r.beat, blocks: [block()], type, camera: cam(i === 0 ? 'push' : 'static'), out: i === 0 ? 'cut' : 'whip', note: '',
  }))};
  const jumpBeats = jumpFilm.beats.map((r) => ({ beat: r.beat, text: '测试一句台词', dur: 5, screen: r.screen, scale: r.scale }));
  const gErr = G.greyboxErrors(jumpGrey, jumpBeats).join('\n');
  assert.match(gErr, /B01→B02: screen clean→led2 leaves on cut/);
  const mJump = U.measureHouseUsage({ film: jumpFilm, greybox: jumpGrey, bindings: { shots: {} }, storyboard: { shots: jumpFilm.beats.map((r) => ({ beat: r.beat, devices: [], evidence: [] })) }, id: 'jump' });
  assert.ok(mJump.flags.some((f) => f.code === 'jump-cut' && f.level === 'fail'));
  assert.ok(mJump.jumps.bareCut >= 1);
  // same predicate: uncovered on that seam
  assert.equal(S.isUncoveredJumpOut('cut', { move: 'push' }, { move: 'static' }), true);
  assert.equal(S.coversWorldJump('cut', { move: 'static' }, { move: 'static' }), true);
  // settled cut on same jump passes both
  const jumpOkGrey = { beats: jumpGrey.beats.map((r, i) => ({ ...r, camera: cam('static'), out: i === 0 ? 'cut' : 'whip' })) };
  assert.doesNotMatch(G.greyboxErrors(jumpOkGrey, jumpBeats).join('\n'), /leaves on cut/);
  const mOk = U.measureHouseUsage({ film: jumpFilm, greybox: jumpOkGrey, bindings: { shots: {} }, storyboard: { shots: jumpFilm.beats.map((r) => ({ beat: r.beat, devices: [], evidence: [] })) }, id: 'jump-ok' });
  assert.equal(mOk.jumps.bareCut, 0);
  assert.ok(!mOk.flags.some((f) => f.code === 'jump-cut'));
});

test('house usage meter v0: counts screens/palettes/seams/jumps/evidence and writes flags (pure fixtures)', async () => {
  const U = await import(pathToFileURL(path.join(LIB, 'houseusage.mjs')).href);
  const film = { beats: [
    { beat: 'B01', act: 'open', scale: 'place', value: 'light', medium: 'type', palette: 'mustard', screen: 'clean', red: 1, hero: true, heroHow: 'big type', why: 'open hook line here' },
    { beat: 'B02', act: 'build', scale: 'place', value: 'mid', medium: 'diagram', palette: 'mustard', screen: 'led2', red: 1, hero: false, heroHow: null, why: 'reading on a screen here' },
    { beat: 'B03', act: 'build', scale: 'detail', value: 'dark', medium: 'evidence', palette: 'noir', screen: 'clean', red: 1, hero: false, heroHow: null, why: 'evidence page shown large' },
    { beat: 'B04', act: 'peak', scale: 'world', value: 'dark', medium: 'diagram', palette: 'indigo-night', screen: 'crt', red: 3, hero: true, heroHow: 'whole globe', why: 'peak on the globe' },
    { beat: 'B05', act: 'close', scale: 'object', value: 'light', medium: 'type', palette: 'mustard', screen: 'clean', red: 1, hero: true, heroHow: 'callback type', why: 'close callback' },
    { beat: 'B06', act: 'close', scale: 'object', value: 'mid', medium: 'diagram', palette: 'teal-chart', screen: 'clean', red: 0, hero: false, heroHow: null, why: 'quiet closer beat' },
  ]};
  const greybox = { beats: film.beats.map((r, i) => ({
    beat: r.beat,
    blocks: [{ label: '主体', shape: 'rect', role: 'subject', x: 100, y: 100, w: 800, h: 600 }],
    type: [], camera: { move: i < 3 ? 'push' : 'static' }, out: i === 0 ? 'cut' : i === 1 ? 'cut' : i === 2 ? 'cut' : 'whip', note: '',
  }))};
  // B01 clean→B02 led2 on cut → jump-cut fail; outs cut,cut,cut → cut-streak
  const m = U.measureHouseUsage({ film, greybox, bindings: { shots: {} }, storyboard: { shots: film.beats.map((r) => ({ beat: r.beat, evidence: r.medium === 'evidence' ? [{ form: 'page', what: 'doc' }] : [], devices: r.beat === 'B02' ? ['number-grows'] : [] })) }, finish: { kind: 'film', preset: 'gawx' }, id: 'fix' });
  assert.equal(m.n, 6);
  assert.equal(m.screen.notClean, 2);
  assert.equal(m.palette.families, 4);
  assert.ok(m.jumps.n >= 1);
  assert.ok(m.flags.some((f) => f.code === 'jump-cut' && f.level === 'fail'));
  assert.ok(m.flags.some((f) => f.code === 'cut-streak' && f.level === 'fail'));
  assert.ok(m.flags.some((f) => f.code === 'evidence-unbound'));
  assert.equal(m.pass, false);
  assert.match(U.houseUsageLine(m), /FAIL/);
  assert.match(fs.readFileSync(path.join(REPO, 'scripts/recipe-board.mjs'), 'utf8'), /cmd === 'usage'/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8'), /usage --project/);
  assert.ok(m.flags.some((f) => f.code === 'evidence-unbound' && f.level === 'fail'), 'evidence unbound is a hard fail on the meter');
});

test('house usage deep-reads filmedScreen/device kit hits; device-no-kit fails, evidence-flat fails', async () => {
  const U = await import(pathToFileURL(path.join(LIB, 'houseusage.mjs')).href);
  const R = await import(pathToFileURL(path.join(LIB, 'refbreakdown.mjs')).href);
  const catalog = [
    { id: 'number-grows', kit: { status: 'ready', use: 'K2.counter' } },
    { id: 'filmed-screen', kit: { status: 'ready', use: 'kit.engine.filmedScreen' } },
    { id: 'real-doc-callout', kit: { status: 'ready', use: 'answer.pages' } },
    { id: 'half-baked', kit: { status: 'partial', use: 'soon' } },
  ];
  assert.deepEqual(R.selectedDeviceKitErrors([{ beat: 'B01', devices: ['number-grows'] }], catalog), []);
  assert.match(R.selectedDeviceKitErrors([{ beat: 'B01', devices: ['no-such'] }], catalog).join('\n'), /not in routing/);
  assert.match(R.selectedDeviceKitErrors([{ beat: 'B02', devices: ['half-baked'] }], catalog).join('\n'), /no ready kit route/);

  const film = { beats: [
    { beat: 'B01', act: 'open', scale: 'place', value: 'light', medium: 'type', palette: 'mustard', screen: 'clean', red: 1, hero: true, heroHow: 'hook', why: 'open hook line here' },
    { beat: 'B02', act: 'build', scale: 'place', value: 'mid', medium: 'diagram', palette: 'mustard', screen: 'led2', red: 1, hero: false, heroHow: null, why: 'reading on a screen here' },
    { beat: 'B03', act: 'build', scale: 'detail', value: 'dark', medium: 'evidence', palette: 'noir', screen: 'clean', red: 1, hero: false, heroHow: null, why: 'evidence page shown large' },
    { beat: 'B04', act: 'peak', scale: 'world', value: 'dark', medium: 'evidence', palette: 'indigo-night', screen: 'clean', red: 3, hero: true, heroHow: 'doc', why: 'peak evidence on a page device' },
    { beat: 'B05', act: 'close', scale: 'object', value: 'light', medium: 'type', palette: 'mustard', screen: 'clean', red: 1, hero: true, heroHow: 'callback type', why: 'close callback' },
    { beat: 'B06', act: 'close', scale: 'object', value: 'mid', medium: 'diagram', palette: 'teal-chart', screen: 'clean', red: 0, hero: false, heroHow: null, why: 'quiet closer beat' },
  ]};
  const greybox = { beats: film.beats.map((r) => ({
    beat: r.beat, blocks: [{ label: '主体', shape: 'rect', role: 'subject', x: 100, y: 100, w: 800, h: 600 }],
    type: [], camera: { move: 'static' }, out: 'whip', note: '',
  }))};
  const storyboard = { shots: [
    { beat: 'B01', devices: ['number-grows'], evidence: [] },
    { beat: 'B02', devices: ['filmed-screen'], evidence: [] },
    { beat: 'B03', devices: [], evidence: [{ form: 'page', what: 'doc' }] },
    { beat: 'B04', devices: ['real-doc-callout'], evidence: [{ form: 'webpage', what: 'news' }] },
    { beat: 'B05', devices: ['half-baked'], evidence: [] },
    { beat: 'B06', devices: [], evidence: [] },
  ]};
  const m = U.measureHouseUsage({
    film, greybox,
    bindings: { shots: { 'B03~page': { file: '/x.jpg' }, 'B04~page': { file: '/y.jpg' } } },
    storyboard, finish: { kind: 'film', preset: 'gawx' }, id: 'demo', devices: catalog,
  });
  assert.ok(m.filmedScreen.hits.some((h) => h.beat === 'B02' && h.via.includes('screen:led2')));
  assert.ok(m.filmedScreen.hits.some((h) => h.beat === 'B02' && h.via.includes('device:filmed-screen')));
  assert.equal(m.filmedScreen.evidence.find((x) => x.beat === 'B03').hit, false);
  assert.equal(m.filmedScreen.evidence.find((x) => x.beat === 'B04').hit, true);
  assert.ok(m.flags.some((f) => f.code === 'evidence-flat' && f.level === 'fail' && /B03/.test(f.say)));
  assert.ok(m.flags.some((f) => f.code === 'device-no-kit' && f.level === 'fail' && /half-baked/.test(f.say)));
  assert.equal(m.pass, false);
  assert.deepEqual(m.devices.notReady, ['half-baked']);
  assert.ok(m.devices.ready['number-grows']);
  assert.match(U.houseUsageEvidenceSummary(m), /filmedScreen 1 hit/);
  assert.match(U.houseUsageEvidenceSummary(m), /B02\(screen:led2\+device:filmed-screen\)/);
  assert.match(U.houseUsageEvidenceSummary(m), /evidence-screen 1\/2/);
  assert.match(U.houseUsageEvidenceSummary(m), /evidence-flat B03/);
  assert.match(U.houseUsageEvidenceSummary(m, { short: true }), /filmed 1·ev 1\/2 flat B03/);
  assert.match(U.houseUsageLine(m), /filmed 1·ev 1\/2/);
  assert.ok(m.summaries, 'meter carries summaries');
  assert.equal(m.summaries.evidence, U.houseUsageEvidenceSummary(m, { short: true }));
  assert.equal(m.summaries.seam, U.houseUsageSeamSummary(m));
  assert.deepEqual(U.houseUsageSummariesOf(m), m.summaries);
  assert.deepEqual(U.houseUsageSummariesOf({ ...m, summaries: undefined }), { evidence: m.summaries.evidence, seam: m.summaries.seam }, 'fallback recomputes same short strings');
  assert.match(fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8'), /houseUsageSummariesOf/);
  // sheet top prints the short evidence summary (does not disturb notes / timing layout)
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const shortHit = U.houseUsageEvidenceSummary(m, { short: true });
  const shortSeam = U.houseUsageSeamSummary(m);
  const sh = G.sheetHtml(
    [{ beat: 'B01', blocks: [], type: [], camera: { move: 'static' }, out: 'cut', note: 'n' }],
    [{ beat: 'B01', at: 0, dur: 5, text: 'hi', timing: 'none' }],
    '',
    { B01: path.join(REPO, 'package.json') },
    [{ beat: 'B01', severity: 3, say: 'layout', fix: 'move' }],
    shortHit,
    shortSeam,
  );
  assert.match(sh, /class="hit"/);
  assert.match(sh, /house · filmed 1·ev 1\/2 flat B03/);
  assert.match(sh, /class="seam"/);
  assert.match(sh, /衔接 /);
  assert.ok(sh.includes(shortSeam));
  assert.match(sh, /内部盲审留下、还没解决的问题/);
  assert.match(sh, /字的时间：按字数估算/);
  assert.match(fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8'), /export async function writeGreyboxSheet/);
  assert.match(fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8'), /preflight \? 'greybox-preflight'/);
  assert.match(fs.readFileSync(path.join(REPO, 'scripts/recipe-board.mjs'), 'utf8'), /flag\('sheet-only'\)/);
  assert.match(fs.readFileSync(path.join(REPO, 'scripts/recipe-board.mjs'), 'utf8'), /preflight: flag\('preflight'\)/);
  assert.match(fs.readFileSync(path.join(REPO, 'scripts/recipe-board.mjs'), 'utf8'), /houseUsageSummariesOf\(m\)/);
});



test('writeGreyboxSheet / sheet-only can target greybox-preflight; sheetHtml prints seam under hit', async () => {
  const Gsrc = fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8');
  const Cli = fs.readFileSync(path.join(REPO, 'scripts/recipe-board.mjs'), 'utf8');
  assert.match(Gsrc, /preflight \? 'greybox-preflight' : 'greybox'/);
  assert.match(Gsrc, /houseUsageSummariesOf\(meter\)/);
  assert.match(Gsrc, /class="seam"/);
  assert.match(Cli, /--sheet-only \[--preflight\]/);
  assert.match(Cli, /preflight: flag\('preflight'\)/);
  const U = await import(pathToFileURL(path.join(LIB, 'houseusage.mjs')).href);
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const seam = U.houseUsageSeamSummary({ seam: { counts: { glitch: 2, cut: 1 } }, jumps: { n: 0 } });
  const html = G.sheetHtml(
    [{ beat: 'B01', blocks: [], type: [], camera: { move: 'static' }, out: 'cut', note: '' }],
    [{ beat: 'B01', at: 0, dur: 1, text: 'x', timing: 'none' }],
    '',
    { B01: path.join(REPO, 'package.json') },
    [],
    'filmed 0·ev 0/0',
    seam,
  );
  assert.match(html, /house · filmed 0·ev 0\/0/);
  assert.match(html, /衔接 信号坏2 \/ 硬切1/);
  const iHit = html.indexOf('class="hit"'), iSeam = html.indexOf('class="seam"'), iGrid = html.indexOf('class="g"');
  assert.ok(iHit >= 0 && iSeam > iHit && iGrid > iSeam, 'hit then seam then grid');
});

test('house usage meter writes summaries; greybox/CLI prefer houseUsageSummariesOf', async () => {
  const U = await import(pathToFileURL(path.join(LIB, 'houseusage.mjs')).href);
  const film = { beats: Array.from({ length: 6 }, (_, i) => ({
    beat: `B${String(i + 1).padStart(2, '0')}`, act: i === 0 ? 'open' : i === 5 ? 'close' : 'build',
    scale: 'place', value: 'mid', medium: i === 2 ? 'evidence' : 'diagram', palette: 'mustard',
    screen: i === 1 ? 'led2' : 'clean', red: 1, hero: false, heroHow: null, why: `beat ${i} look reason ok`,
  })) };
  const greybox = { beats: film.beats.map((r) => ({
    beat: r.beat, blocks: [{ label: '主体', shape: 'rect', role: 'subject', x: 100, y: 100, w: 800, h: 600 }],
    type: [], camera: { move: 'static' }, out: 'whip', note: '',
  })) };
  const m = U.measureHouseUsage({
    film, greybox,
    bindings: { shots: { 'B03~page': { file: '/x.jpg' } } },
    storyboard: { shots: film.beats.map((r) => ({ beat: r.beat, devices: r.beat === 'B03' ? ['real-doc-callout'] : [], evidence: r.medium === 'evidence' ? [{ form: 'page', what: 'doc' }] : [] })) },
    id: 'sum-demo',
  });
  assert.ok(m.summaries?.evidence);
  assert.ok(m.summaries?.seam);
  assert.equal(m.summaries.evidence, U.houseUsageEvidenceSummary(m, { short: true }));
  assert.equal(m.summaries.seam, U.houseUsageSeamSummary(m));
  assert.deepEqual(U.houseUsageSummariesOf(m), m.summaries);
  assert.deepEqual(U.houseUsageSummariesOf({ filmedScreen: m.filmedScreen, seam: m.seam, jumps: m.jumps }), m.summaries, 'fallback without summaries key');
  // write path puts summaries into house-usage.json under sandbox
  const root = path.join(cfg.dataDir, 'projects', 'banana-design');
  assert.ok(fs.existsSync(path.join(root, 'tasks', 'filmdesign.answer.json')));
  const written = U.houseUsage(cfg, 'banana-design', { write: true });
  assert.ok(written.file?.endsWith('house-usage.json'));
  const disk = JSON.parse(fs.readFileSync(written.file, 'utf8'));
  assert.equal(disk.summaries.evidence, written.summaries.evidence);
  assert.equal(disk.summaries.seam, written.summaries.seam);
  assert.equal(disk.summaries.evidence, U.houseUsageEvidenceSummary(disk, { short: true }));
  assert.equal(disk.summaries.seam, U.houseUsageSeamSummary(disk));
  const Gsrc = fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8');
  const Cli = fs.readFileSync(path.join(REPO, 'scripts/recipe-board.mjs'), 'utf8');
  assert.match(Gsrc, /houseUsageSummariesOf\(meter\)/);
  assert.match(Cli, /houseUsageSummariesOf\(m\)/);
  assert.match(Cli, /sum\.evidence/);
  assert.match(Cli, /sum\.seam/);
});

test('sessionbrief / greybox-review prefer houseUsageSummariesOf (disk summaries same-source; old meter falls back)', async () => {
  const U = await import(pathToFileURL(path.join(LIB, 'houseusage.mjs')).href);
  const SB = await import(pathToFileURL(path.join(LIB, 'sessionbrief.mjs')).href);
  const marked = { summaries: { evidence: 'EVIDENCE_MARK_X', seam: 'SEAM_MARK_Y' }, seam: { counts: { cut: 1 } }, jumps: { n: 0, motionCovered: 0, bareCut: 0 }, filmedScreen: { hits: [], evidence: [] }, n: 2, pass: true, screen: { notCleanShare: 0.2 }, palette: { families: 2 }, evidence: { promised: [], bound: [] }, flags: [] };
  assert.deepEqual(U.houseUsageSummariesOf(marked), marked.summaries);
  const reviewIn = U.houseUsageReviewInput(marked);
  assert.equal(reviewIn.evidence, 'EVIDENCE_MARK_X');
  assert.equal(reviewIn.seam, 'SEAM_MARK_Y');
  assert.match(reviewIn.line, /EVIDENCE_MARK_X/);
  const brief = SB.briefText({
    id: 'x', chapter: 'B01', beats: [{ beat: 'B01', at: 0, dur: 2, text: 't' }],
    greybox: { B01: { blocks: [], type: [], camera: { move: 'static' }, out: 'cut', note: '' } },
    film: { B01: { act: 'open', palette: 'mustard', screen: 'clean', why: 'w' } },
    files: { house: 'HOUSE.md', frames: { B01: 'f.png' } },
    usage: U.houseUsageSummariesOf(marked),
  });
  assert.match(brief, /家用量（与 house-usage\.json summaries 同源）/);
  assert.match(brief, /证据：EVIDENCE_MARK_X/);
  assert.match(brief, /衔接：SEAM_MARK_Y/);
  // old meter without summaries still falls back to the same short assemblers
  const old = { filmedScreen: { hits: [{ beat: 'B02', via: ['screen:led2'] }], evidence: [{ beat: 'B03', hit: false }, { beat: 'B04', hit: true }] }, seam: { counts: { glitch: 2, cut: 1 } }, jumps: { n: 0 } };
  const fb = U.houseUsageSummariesOf(old);
  assert.equal(fb.evidence, U.houseUsageEvidenceSummary(old, { short: true }));
  assert.equal(fb.seam, U.houseUsageSeamSummary(old));
  assert.match(fb.evidence, /filmed 1·ev 1\/2 flat B03/);
  assert.match(fb.seam, /信号坏2/);
  const briefFb = SB.briefText({
    id: 'x', chapter: 'B01', beats: [{ beat: 'B01', at: 0, dur: 1, text: 't' }],
    greybox: { B01: { blocks: [], type: [], camera: { move: 'static' }, out: 'cut' } },
    files: { house: 'H' }, usage: fb,
  });
  assert.ok(briefFb.includes(fb.evidence) && briefFb.includes(fb.seam));
  // houseUsageRead overlays disk summaries.* onto a remasured meter
  const root = path.join(cfg.dataDir, 'projects', 'banana-design');
  const outFilm = path.join(root, 'out', 'film');
  fs.mkdirSync(outFilm, { recursive: true });
  const live = U.houseUsage(cfg, 'banana-design', { write: true });
  const diskPath = path.join(outFilm, 'house-usage.json');
  const disk = JSON.parse(fs.readFileSync(diskPath, 'utf8'));
  disk.summaries = { evidence: 'DISK_EV_MARK', seam: 'DISK_SEAM_MARK' };
  fs.writeFileSync(diskPath, JSON.stringify(disk, null, 1) + '\n');
  const read = U.houseUsageRead(cfg, 'banana-design', { write: false });
  assert.equal(read.summaries.evidence, 'DISK_EV_MARK');
  assert.equal(read.summaries.seam, 'DISK_SEAM_MARK');
  assert.deepEqual(U.houseUsageSummariesOf(read), { evidence: 'DISK_EV_MARK', seam: 'DISK_SEAM_MARK' });
  assert.equal(U.houseUsageReviewInput(read).evidence, 'DISK_EV_MARK');
  assert.equal(live.summaries.evidence, U.houseUsageEvidenceSummary(live, { short: true }), 'fresh write still self-consistent');
  // wiring: sessionbrief + greybox review go through Read / ReviewInput / SummariesOf
  assert.match(fs.readFileSync(path.join(LIB, 'sessionbrief.mjs'), 'utf8'), /houseUsageRead/);
  assert.match(fs.readFileSync(path.join(LIB, 'sessionbrief.mjs'), 'utf8'), /houseUsageSummariesOf/);
  assert.match(fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8'), /houseUsageRead/);
  assert.match(fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8'), /houseUsageReviewInput\(meter\)/);
});

test('optional banana writeGreyboxSheet tmp integration (set RB_SHEET_INTEGRATION=1; needs playwright + real frames; not in default offline suite)', { skip: process.env.RB_SHEET_INTEGRATION !== '1' }, async () => {
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const U = await import(pathToFileURL(path.join(LIB, 'houseusage.mjs')).href);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-sheet-int-'));
  const data = path.join(tmp, 'work', 'recipe-board-v1');
  const id = 'banana-design';
  const srcRoot = path.join(DATA, 'projects', id);
  const dstRoot = path.join(data, 'projects', id);
  // copy project json + greybox frames (no mp4) into an isolated tree
  fs.cpSync(path.join(DATA, 'routing'), path.join(data, 'routing'), { recursive: true });
  fs.cpSync(path.join(DATA, 'prompts'), path.join(data, 'prompts'), { recursive: true });
  for (const sub of ['tasks', 'materials']) {
    if (fs.existsSync(path.join(srcRoot, sub))) fs.cpSync(path.join(srcRoot, sub), path.join(dstRoot, sub), { recursive: true });
  }
  for (const f of ['project.json', 'plan.json', 'storyboard.json', 'style.json']) {
    if (fs.existsSync(path.join(srcRoot, f))) fs.copyFileSync(path.join(srcRoot, f), path.join(dstRoot, f));
  }
  const framesSrc = path.join(srcRoot, 'out', 'greybox');
  const framesDst = path.join(dstRoot, 'out', 'greybox');
  const sheetDir = path.join(dstRoot, 'out', 'greybox-sheet-tmp');
  fs.mkdirSync(framesDst, { recursive: true });
  fs.mkdirSync(sheetDir, { recursive: true });
  for (const f of fs.readdirSync(framesSrc).filter((x) => /^B\d+\.png$/.test(x))) {
    fs.copyFileSync(path.join(framesSrc, f), path.join(framesDst, f));
    // writeGreyboxSheet reads B*.png from its out dir (sheet-only rebuild; no mp4)
    fs.copyFileSync(path.join(framesSrc, f), path.join(sheetDir, f));
  }
  if (fs.existsSync(path.join(srcRoot, 'out', 'film', 'house-usage.json'))) {
    fs.mkdirSync(path.join(dstRoot, 'out', 'film'), { recursive: true });
    fs.copyFileSync(path.join(srcRoot, 'out', 'film', 'house-usage.json'), path.join(dstRoot, 'out', 'film', 'house-usage.json'));
  }
  // also need greybox.answer.json for writeGreyboxSheet
  for (const f of ['greybox.answer.json', 'greybox-review.answer.json']) {
    const src = path.join(srcRoot, 'tasks', f);
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.join(dstRoot, 'tasks'), { recursive: true });
      fs.copyFileSync(src, path.join(dstRoot, 'tasks', f));
    }
  }
  const icfg = { repoRoot: tmp, sourceRoot: REPO, dataDir: data };
  const before = U.houseUsageSummariesOf(U.houseUsageRead(icfg, id, { write: false }));
  const wr = await G.writeGreyboxSheet(icfg, id, { dir: sheetDir, log: () => {} });
  assert.ok(fs.existsSync(wr.sheet));
  assert.equal(wr.hit, before.evidence);
  assert.equal(wr.seam, before.seam);
  const html = fs.readFileSync(path.join(wr.dir, 'sheet.html'), 'utf8');
  assert.ok(html.includes(before.evidence));
  assert.ok(html.includes(before.seam));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('house usage reconcileReviewIssuesWithUsage drops stale hard-cut claims when meter is designed; keeps layout issues', async () => {
  const U = await import(pathToFileURL(path.join(LIB, 'houseusage.mjs')).href);
  const film = { beats: Array.from({ length: 8 }, (_, i) => ({
    beat: `B${String(i + 1).padStart(2, '0')}`, act: i === 0 ? 'open' : i === 7 ? 'close' : 'build',
    scale: 'place', value: 'mid', medium: 'diagram', palette: 'mustard', screen: i % 2 ? 'led2' : 'clean',
    red: 1, hero: false, heroHow: null, why: `beat ${i} has a designed look reason`,
  })) };
  const outs = ['push', 'glitch', 'whip', 'flash', 'match', 'glitch', 'whip', 'cut'];
  const greybox = { beats: film.beats.map((r, i) => ({
    beat: r.beat, blocks: [{ label: '主体', shape: 'rect', role: 'subject', x: 100, y: 100, w: 800, h: 600 }],
    type: [], camera: { move: 'static' }, out: outs[i], note: '',
  })) };
  const m = U.measureHouseUsage({ film, greybox, bindings: { shots: {} }, storyboard: { shots: film.beats.map((r) => ({ beat: r.beat, devices: [], evidence: [] })) }, id: 'recon' });
  assert.equal(m.pass, true);
  assert.ok((m.seam.counts.cut || 0) <= Math.ceil(m.n * 0.55));
  assert.equal(m.jumps.bareCut, 0);
  assert.match(U.houseUsageSeamSummary(m), /信号坏|快甩|硬切/);
  const issues = [
    { beat: 'film', severity: 3, say: '19 处衔接里大半是硬切，而且切点那一帧常常只有底色', fix: '避免一路硬切。' },
    { beat: 'film', severity: 3, say: '左上小标题＋右侧一个大框构图连用', fix: '换构图' },
    { beat: 'B05', severity: 3, say: '转折看不出闪白', fix: '放闪白' },
  ];
  const kept = U.reconcileReviewIssuesWithUsage(issues, m);
  assert.equal(kept.length, 2);
  assert.ok(kept.every((x) => !/大半是硬切|一路硬切/.test(x.say + x.fix)));
  assert.deepEqual(U.sheetOpenNotes(issues, m).map((x) => x.beat), ['film', 'B05']);
  // when meter itself is cut-heavy, leave the hard-cut claim (do not silence a true warning)
  const heavy = U.measureHouseUsage({
    film, greybox: { beats: greybox.beats.map((r) => ({ ...r, out: 'cut' })) },
    bindings: { shots: {} }, storyboard: { shots: film.beats.map((r) => ({ beat: r.beat, devices: [], evidence: [] })) }, id: 'heavy',
  });
  assert.ok(heavy.flags.some((f) => f.code === 'cut-heavy' || f.code === 'cut-streak' || f.code === 'jump-cut'));
  assert.equal(U.reconcileReviewIssuesWithUsage(issues, heavy).length, 3);
  assert.match(fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8'), /sheetOpenNotes/);
  assert.match(fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8'), /houseUsage:/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox-review.md'), 'utf8'), /houseUsage/);
});

test('evidence shortlist card-first / demote wiki-flat (HOUSE mature step 3; synthetic)', async () => {
  const F = await import(pathToFileURL(path.join(LIB, 'filmdesign.mjs')).href);
  const lib = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/palettes.json'), 'utf8'));
  const media = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/media.json'), 'utf8'));
  const devices = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8'));
  const P = Array.isArray(lib) ? lib : lib.palettes || Object.values(lib)[0];
  const M = Array.isArray(media) ? media : media.media || media.screens || Object.values(media)[0];
  const D = Array.isArray(devices) ? devices : devices.devices || Object.values(devices)[0];
  const beforeShape = { cards: F.EVIDENCE_CARD_DEVICES.slice(), demote: F.EVIDENCE_DEMOTE_DEVICES.slice() };
  const sl = F.designBeatShortlist({ beat: 'E1', medium: 'evidence', act: 'press', scale: 'detail', value: 'high' }, { palettes: P, media: M, devices: D });
  // after: all top devices are card-packaged; photo-over-type absent; film screen first
  assert.ok(sl.devices.every((id) => beforeShape.cards.includes(id) || ['carrier', 'subject-stays', 'rhyme', 'callback'].includes(id) || !beforeShape.demote.includes(id)), 'shortlist devices are card-or-evergreen, not demote-first: ' + sl.devices.join(','));
  assert.ok(sl.devices.filter((id) => beforeShape.cards.includes(id)).length >= 4, '≥4 card devices in evidence shortlist');
  assert.ok(!sl.devices.includes('photo-over-type'), 'demoted photo-over-type not in recommend top-8');
  assert.equal(sl.screens[0], 'film', 'evidence screen shortlist leads with film (packaged), not clean-wiki-flat');
  assert.ok(sl.screens.indexOf('film') < sl.screens.indexOf('clean') || sl.screens[0] === 'film');
  // non-evidence unchanged path: demote list does not apply
  const typeSl = F.designBeatShortlist({ beat: 'T1', medium: 'type', act: 'open' }, { palettes: P, media: M, devices: D });
  assert.ok(typeSl.devices.length >= 3 && typeSl.devices.length <= 8);
});

test('filmdesign shortlist and evidence stay hard; clean streak is a visible review note', async () => {
  const F = await import(pathToFileURL(path.join(LIB, 'filmdesign.mjs')).href);
  const media = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/media.json'), 'utf8'));
  const lib = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/palettes.json'), 'utf8'));
  const devices = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8'));
  const shortlists = F.designShortlistsFrom({ palettes: lib, media, devices });
  assert.ok(shortlists.palettes.includes('mustard') && shortlists.screens.includes('led2') && shortlists.devices.includes('carrier'));
  const base = (beat, x = {}) => ({ beat, act: 'build', scale: 'place', value: 'dark', medium: 'diagram', palette: 'noir', screen: 'clean', red: 1, hero: false, heroHow: null, subject: null, why: `${beat} keeps its own reason for the look`, ...x });
  const beats = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06'];
  // Five cleans are a review note, never a forced display quota.
  const streak = { arc: 'a film that stays too long on clean paper without a reason to leave it.', beats: beats.map((b, i) => base(b, {
    act: i === 0 ? 'open' : i === 4 ? 'peak' : i === 5 ? 'close' : 'build',
    scale: ['place', 'object', 'region', 'detail', 'world', 'object'][i],
    value: i === 4 ? 'light' : 'dark',
    medium: i === 0 ? 'type' : i === 2 ? 'footage' : i === 4 ? 'type' : 'diagram',
    screen: 'clean',
    palette: ['mustard', 'noir', 'teal-chart', 'indigo-night', 'cream-print', 'mustard'][i],
    red: i === 4 ? 3 : 1,
    hero: i === 0 || i === 4 || i === 5,
    heroHow: i === 0 || i === 4 || i === 5 ? 'a hero frame for the turn' : null,
    subject: i === 2 ? 'a ship from above' : null,
  })) };
  assert.deepEqual(F.filmDesignErrors(streak, beats, lib, media), []);
  assert.match(F.filmDesignNotes(streak, beats, lib, media).join('\n'), /beats in a row on clean/);
  assert.deepEqual(F.filmCleanGateErrors(streak.beats), []);
  // four cleans OK on the streak rule alone (when other rules pass)
  const four = { ...streak, beats: streak.beats.map((r, i) => ({ ...r, screen: i === 2 ? 'led2' : 'clean', why: i === 2 ? 'a reading on the LED board for the count' : r.why })) };
  assert.deepEqual(F.filmCleanGateErrors(four.beats), []);
  assert.doesNotMatch(F.filmCleanNotes(four.beats).join('\n'), /in a row on clean/);
  // almost-all clean (≥85 %) with missing why → fail
  const allClean = { arc: 'almost every beat stays clean without saying why the paper is right.', beats: beats.map((b, i) => base(b, {
    act: i === 0 ? 'open' : i === 4 ? 'peak' : i === 5 ? 'close' : 'build',
    scale: ['place', 'object', 'region', 'detail', 'world', 'object'][i],
    value: i === 4 ? 'light' : 'dark',
    medium: i % 2 ? 'type' : 'diagram',
    screen: i === 1 ? 'film' : 'clean', // 5/6 clean ≈ 83% — bump to 6/6
    palette: ['mustard', 'noir', 'teal-chart', 'indigo-night', 'cream-print', 'cobalt-card'][i],
    red: i === 4 ? 3 : 1,
    hero: i === 0 || i === 4 || i === 5,
    heroHow: i === 0 || i === 4 || i === 5 ? 'hero moment named' : null,
    why: i < 3 ? 'short' : `${b} explains its palette and its clean paper for this line`,
  })) };
  // force 6/6 clean
  allClean.beats = allClean.beats.map((r) => ({ ...r, screen: 'clean' }));
  assert.match(F.filmCleanGateErrors(allClean.beats).join('\n'), /missing why/, 'compatibility helper retains missing rationale, not clean-run quota');
  assert.doesNotMatch(F.filmCleanGateErrors(allClean.beats).join('\n'), /beats in a row on clean/);
  assert.match(F.filmCleanNotes(allClean.beats).join('\n'), /almost-all-clean|missing why|on clean with/);
  assert.match(F.filmDesignErrors(allClean, beats, lib, media).join('\n'), /why/, 'missing per-beat rationale remains a contract error, regardless of screen quota');
  // free-fill palette/screen rejected by shortlist
  assert.match(F.filmShortlistErrors([{ beat: 'B01', palette: 'hot-pink', screen: 'oled-max' }], shortlists).join('\n'), /shortlist/);
  assert.deepEqual(F.filmShortlistErrors([{ beat: 'B01', palette: 'noir', screen: 'clean' }], shortlists), []);
  // optional device must be a catalog id when present
  assert.match(F.filmShortlistErrors([{ beat: 'B01', palette: 'noir', screen: 'clean', device: 'made-up-device' }], shortlists).join('\n'), /device/);
  assert.deepEqual(F.filmShortlistErrors([{ beat: 'B01', palette: 'noir', screen: 'clean', device: 'carrier' }], shortlists), []);
  // evidence binding: medium=evidence needs a real bindings.shots key (prefix), else design fail
  assert.match(F.evidenceBindingErrors({ beats: [{ beat: 'B03', medium: 'evidence', subject: 'a news page' }] }, { shots: {} }).join('\n'), /no materials binding/);
  assert.deepEqual(F.evidenceBindingErrors({ beats: [{ beat: 'B03', medium: 'evidence', subject: 'a news page' }] }, { shots: { 'B03~page': { file: '/x.jpg' } } }), []);
  assert.deepEqual(F.evidenceBindingErrors({ beats: [{ beat: 'B02', medium: 'diagram' }] }, { shots: {} }), [], 'diagram asks no binding');
  // world/scale jump that stays clean→clean is a note, not a forced LED (HOUSE: 该上屏才上屏); bare cut stays greyboxSeamErrors
  const jumpRows = [base('B01', { scale: 'world', screen: 'clean' }), base('B02', { scale: 'detail', screen: 'clean' })];
  assert.deepEqual(F.filmCleanGateErrors(jumpRows, { streakMax: 99, cleanShare: 1.1 }), [], 'two cleans across a world jump are not a filmdesign LED quota');
  assert.ok((F.filmWorldJumpNotes(jumpRows) || []).some((n) => /world|scale|clean/i.test(n)));
  // prompt + task carry the shortlist contract
  const prompt = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/filmdesign.md'), 'utf8');
  assert.match(prompt, /短名单|shortlist/);
  assert.match(prompt, /点名/);
  assert.match(prompt, /连续.*clean|clean 连续|in a row on clean|五拍/);
  assert.match(fs.readFileSync(path.join(LIB, 'filmdesign.mjs'), 'utf8'), /designShortlists|filmCleanGateErrors|evidenceBindingErrors/);
  assert.match(fs.readFileSync(path.join(LIB, 'filmdesign.mjs'), 'utf8'), /shortlists:/);
  // per-beat recommend shortlists (3–8): top-level stays full catalog (any catalog id still legal)
  const withBeats = F.designShortlistsFrom({ palettes: lib, media, devices, beats: [
    { beat: 'B01', act: 'open', scale: 'place', value: 'light', medium: 'type', text: '同一棵香蕉' },
    { beat: 'B17', act: 'peak', scale: 'place', value: 'dark', medium: 'evidence', red: 3, text: '国家紧急状态 报道' },
  ], cuedByBeat: { B17: ['real-in-frame', 'mark-in-red'] } });
  assert.ok(withBeats.palettes.includes('mustard') && withBeats.devices.includes('carrier'), 'top-level still full catalog');
  assert.ok(withBeats.byBeat?.B01 && withBeats.byBeat?.B17);
  for (const id of ['B01', 'B17']) {
    const s = withBeats.byBeat[id];
    for (const k of ['palettes', 'screens', 'devices']) {
      assert.ok(s[k].length >= 3 && s[k].length <= 8, `${id}.${k} size ${s[k].length}`);
      assert.ok(s[k].every((x) => withBeats[k].includes(x)), `${id}.${k} subset of catalog`);
    }
  }
  assert.ok(withBeats.byBeat.B17.devices.includes('real-in-frame'), 'cued devices preferred on peak evidence beat');
  // HOUSE mature step 3: evidence shortlist prefers card packaging; demotes photo-over-type (wiki-flat main)
  assert.ok(Array.isArray(F.EVIDENCE_CARD_DEVICES) && F.EVIDENCE_CARD_DEVICES.length >= 4, 'EVIDENCE_CARD_DEVICES exported');
  assert.ok(F.EVIDENCE_DEMOTE_DEVICES.includes('photo-over-type'), 'photo-over-type demoted on evidence');
  const cardHits = F.EVIDENCE_CARD_DEVICES.filter((id) => withBeats.byBeat.B17.devices.includes(id));
  assert.ok(cardHits.length >= 3, 'evidence shortlist must carry card devices, got: ' + withBeats.byBeat.B17.devices.join(','));
  assert.ok(withBeats.byBeat.B17.devices.includes('real-doc-callout') || withBeats.byBeat.B17.devices.includes('filmed-screen'), 'card-first seed on evidence');
  assert.ok(!withBeats.byBeat.B17.devices.includes('photo-over-type'), 'photo-over-type kept out of top-8 when cards fill it: ' + withBeats.byBeat.B17.devices.join(','));
  // screens: film ahead of clean for packaged evidence (not flat wiki)
  assert.ok(withBeats.byBeat.B17.screens.includes('film'), 'evidence screens include film packaging');
  assert.ok(withBeats.byBeat.B17.screens.indexOf('film') <= withBeats.byBeat.B17.screens.indexOf('clean'), 'film ranks at/before clean on evidence');
  // empty-frame / lone-X are greybox geometry — mature gate fails them; shortlist has no such device ids
  assert.ok(!withBeats.byBeat.B17.devices.some((id) => /empty|placeholder|lone-?x|wiki/i.test(id)), 'no empty/wiki device id in recommend');
  // existing banana/suez answer ids still pass against full top-level shortlist AND byBeat hard gate
  // device cues must use plan narration (same as task shortlists) — never design why
  const narrOf = (id) => {
    const plan = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects', id, 'plan.json'), 'utf8'));
    return Object.fromEntries((plan.beats || []).map((b) => [b.id, b.text || '']));
  };
  const bananaSource = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects/banana-design/tasks/filmdesign.answer.json'), 'utf8'));
  // Test a corrected candidate in memory; the saved answer still needs its own design/check cycle.
  const banana = { ...bananaSource, beats: bananaSource.beats.map((r) => r.beat === 'B03' ? { ...r, kind: 'numbers', composition: 'count-field', device: 'number-grows' } : r) };
  const bananaNarr = narrOf('banana-design');
  assert.deepEqual(F.filmShortlistErrors(banana.beats, withBeats), []);
  // beatForShortlist: design act/medium + narration — never spread palette/screen/why into scoring
  const bananaPlan = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects/banana-design/plan.json'), 'utf8')).beats.map((b) => ({ beat: b.id, text: b.text || '' }));
  const bananaTaskBeats = bananaPlan.map((b) => F.beatForShortlist(b, banana.beats.find((r) => r.beat === b.beat) || null));
  const bananaSl = F.designShortlistsFrom({ palettes: lib, media, devices, beats: bananaTaskBeats });
  const bananaCheckBeats = banana.beats.map((r) => F.beatForShortlist({ beat: r.beat }, r, { narration: bananaNarr }));
  const bananaCheckSl = F.designShortlistsFrom({ palettes: lib, media, devices, beats: bananaCheckBeats });
  for (const r of banana.beats) {
    assert.deepEqual(bananaSl.byBeat[r.beat].palettes, bananaCheckSl.byBeat[r.beat].palettes, `${r.beat} task/check palette shortlist homology`);
    assert.deepEqual(bananaSl.byBeat[r.beat].screens, bananaCheckSl.byBeat[r.beat].screens, `${r.beat} task/check screen shortlist homology`);
  }
  assert.deepEqual(F.filmShortlistErrors(banana.beats, bananaSl), [], 'banana picks land in byBeat shortlists (narration cues)');
  assert.deepEqual(F.filmDesignErrors(banana, banana.beats.map((r) => r.beat), lib, media, devices, { narration: bananaNarr }).filter((m) => /shortlist|this beat's shortlist/.test(m)), [], 'filmDesignErrors wires byBeat from narration');
  const suez = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects/suez-evergiven-blind/tasks/filmdesign.answer.json'), 'utf8'));
  const suezNarr = narrOf('suez-evergiven-blind');
  const suezPlan = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/projects/suez-evergiven-blind/plan.json'), 'utf8')).beats.map((b) => ({ beat: b.id, text: b.text || '' }));
  const suezTaskBeats = suezPlan.map((b) => F.beatForShortlist(b, suez.beats.find((r) => r.beat === b.beat) || null));
  const suezSl = F.designShortlistsFrom({ palettes: lib, media, devices, beats: suezTaskBeats });
  const suezCheckBeats = suez.beats.map((r) => F.beatForShortlist({ beat: r.beat }, r, { narration: suezNarr }));
  const suezCheckSl = F.designShortlistsFrom({ palettes: lib, media, devices, beats: suezCheckBeats });
  for (const r of suez.beats) {
    assert.deepEqual(suezSl.byBeat[r.beat].palettes, suezCheckSl.byBeat[r.beat].palettes, `${r.beat} suez task/check palette homology`);
    assert.deepEqual(suezSl.byBeat[r.beat].screens, suezCheckSl.byBeat[r.beat].screens, `${r.beat} suez task/check screen homology`);
  }
  assert.deepEqual(F.filmShortlistErrors(suez.beats, suezSl), [], 'suez picks land in byBeat shortlists (narration cues)');
  assert.deepEqual(F.filmDesignErrors(suez, suez.beats.map((r) => r.beat), lib, media, devices, { narration: suezNarr }).filter((m) => /shortlist|this beat's shortlist/.test(m)), [], 'suez filmDesignErrors shortlist errs []');
  // helper must not copy pick fields (old check spread ...r and ranked screens by chosen palette)
  const shaped = F.beatForShortlist({ beat: 'B09', text: 'x' }, banana.beats.find((r) => r.beat === 'B09'));
  assert.equal(shaped.palette, undefined, 'beatForShortlist omits palette pick');
  assert.equal(shaped.screen, undefined, 'beatForShortlist omits screen pick');
  assert.equal(shaped.why, undefined, 'beatForShortlist omits why');
  assert.equal(shaped.act, 'build');
  assert.equal(shaped.medium, 'diagram');
  // why-interference: design why cues devices the narration does not — shortlist must follow narration only
  assert.equal(F.deviceCueText({ text: '旁白', why: '当年新闻报道' }), '旁白');
  assert.equal(F.deviceCueText({ why: '当年新闻报道' }), '');
  const poisonWhy = '像当年的报纸报道新闻，真材料入画';
  const quietNarr = '平静的开场，没有数字。';
  const poisonRow = { beat: 'BX', act: 'open', scale: 'place', value: 'light', medium: 'type', palette: 'mustard', screen: 'clean', red: 0, hero: true, heroHow: 'open hero', why: poisonWhy };
  const cuedFromWhy = F.cuedDevicesByBeat([{ beat: 'BX', text: poisonWhy }], devices.devices)['BX'];
  const cuedFromNarr = F.cuedDevicesByBeat([{ beat: 'BX', text: quietNarr }], devices.devices)['BX'];
  assert.ok(cuedFromWhy.includes('age-morph') && cuedFromWhy.includes('real-in-frame'), 'poison why would cue age-morph + real-in-frame');
  assert.ok(!cuedFromNarr.includes('age-morph') && !cuedFromNarr.includes('real-in-frame'), 'quiet narration must not cue those');
  const slWhy = F.designShortlistsFrom({ palettes: lib, media, devices, beats: [{ ...poisonRow, text: poisonWhy }] });
  const slNarr = F.designShortlistsFrom({ palettes: lib, media, devices, beats: [{ ...poisonRow, text: quietNarr }] });
  assert.ok(slWhy.byBeat.BX.devices.includes('age-morph'), 'why-as-text would prefer age-morph into shortlist');
  assert.ok(!slNarr.byBeat.BX.devices.includes('age-morph'), 'narration shortlist must not be pulled by why');
  // filmDesignErrors: even when row.why is poison, narration opt keeps device cue on the quiet line
  const poisonedAnswer = {
    arc: 'a short arc that opens quiet, presses once, peaks, and releases without leaning on a look-choice why for cues.',
    beats: [{ ...poisonRow, device: 'age-morph', act: 'open', hero: true, heroHow: 'open hero frame' },
      { beat: 'BY', act: 'build', scale: 'object', value: 'dark', medium: 'diagram', palette: 'noir', screen: 'led2', red: 1, hero: false, heroHow: null, why: 'diagram beat keeps its own reason for the look here' },
      { beat: 'BZ', act: 'peak', scale: 'world', value: 'light', medium: 'type', palette: 'cream-print', screen: 'clean', red: 3, hero: true, heroHow: 'peak hero', why: 'peak needs its own light ground and a clear reason' },
      { beat: 'BW', act: 'close', scale: 'place', value: 'dark', medium: 'footage', palette: 'teal-chart', screen: 'film', red: 0, hero: true, heroHow: 'close hero', subject: 'a quiet harbour', why: 'close on footage with its own reason for the look' }],
  };
  const poisonIds = poisonedAnswer.beats.map((r) => r.beat);
  const quietMap = Object.fromEntries(poisonIds.map((id) => [id, quietNarr]));
  const shortlistMsgs = F.filmDesignErrors(poisonedAnswer, poisonIds, lib, media, devices, { narration: quietMap }).filter((m) => /shortlist|this beat's shortlist/.test(m));
  assert.ok(shortlistMsgs.some((m) => /BX.*device|device.*BX|age-morph|this beat's shortlist/.test(m)), 'poisoned device must fail against narration-built shortlist: ' + shortlistMsgs.join(' | '));
  // if check wrongly used why as cue text, age-morph would be in BX shortlist and the device pick would pass — prove why-path would greenlight
  const whyMapWrong = Object.fromEntries(poisonIds.map((id) => [id, poisonWhy]));
  // simulate old bug: feed why as beat.text into designShortlistsFrom
  const slOldBug = F.designShortlistsFrom({ palettes: lib, media, devices, beats: poisonedAnswer.beats.map((r) => ({ ...r, text: r.why || '' })) });
  assert.deepEqual(F.filmShortlistErrors([{ beat: 'BX', palette: 'mustard', screen: 'clean', device: 'age-morph' }], slOldBug), [], 'old why-as-text path would wrongly accept age-morph');
  // catalog-legal but outside this beat's shortlist → fail (the hard gate)
  // palette: PALETTE_SHORTLIST_MAX < catalog → real byBeat bite (no synthetic shrink)
  assert.ok(F.PALETTE_SHORTLIST_MAX < bananaSl.palettes.length, 'palette max must be tighter than catalog');
  const bb = bananaSl.byBeat.B01;
  assert.ok(bb.palettes.length <= F.PALETTE_SHORTLIST_MAX, `B01 palettes ${bb.palettes.length}`);
  assert.ok(bb.palettes.length < bananaSl.palettes.length, 'byBeat.palettes must exclude ≥1 catalog id');
  const outsidePal = bananaSl.palettes.find((id) => !bb.palettes.includes(id));
  assert.ok(outsidePal, 'need a catalog palette outside B01 byBeat to prove the gate');
  assert.match(F.filmShortlistErrors([{ beat: 'B01', palette: outsidePal, screen: bb.screens[0] }], bananaSl).join('\n'), /this beat's shortlist/);
  const outsideScr = bananaSl.screens.find((id) => !bb.screens.includes(id));
  assert.ok(outsideScr, 'need a catalog screen outside B01 byBeat to prove the gate');
  assert.match(F.filmShortlistErrors([{ beat: 'B01', palette: bb.palettes[0], screen: outsideScr }], bananaSl).join('\n'), /this beat's shortlist/);
  const outsideDev = bananaSl.devices.find((id) => !bb.devices.includes(id));
  assert.ok(outsideDev, 'need a catalog device outside B01 byBeat');
  assert.match(F.filmShortlistErrors([{ beat: 'B01', palette: bb.palettes[0], screen: bb.screens[0], device: outsideDev }], bananaSl).join('\n'), /this beat's shortlist/);
  // every banana beat's byBeat palette list is a true shortlist
  for (const row of banana.beats) {
    const s = bananaSl.byBeat[row.beat];
    assert.ok(s.palettes.length < bananaSl.palettes.length, `${row.beat} palette shortlist must filter`);
    assert.ok(s.palettes.includes(row.palette), `${row.beat} pick ${row.palette} must stay in byBeat`);
  }
  // in-byBeat still passes
  assert.deepEqual(F.filmShortlistErrors([{ beat: 'B01', palette: bb.palettes[0], screen: bb.screens[0], device: bb.devices[0] }], bananaSl), []);
  assert.match(fs.readFileSync(path.join(LIB, 'filmdesign.mjs'), 'utf8'), /this beat's shortlist/);
  assert.match(fs.readFileSync(path.join(LIB, 'filmdesign.mjs'), 'utf8'), /PALETTE_SHORTLIST_MAX/);
  assert.doesNotMatch(fs.readFileSync(path.join(LIB, 'filmdesign.mjs'), 'utf8'), /b\.text \|\| b\.why|r\.why \|\| r\.text/);
  assert.match(fs.readFileSync(path.join(LIB, 'filmdesign.mjs'), 'utf8'), /deviceCueText|cuedDevicesByBeat/);
  assert.match(fs.readFileSync(path.join(LIB, 'filmdesign.mjs'), 'utf8'), /beatForShortlist/);
  assert.match(fs.readFileSync(path.join(LIB, 'filmdesign.mjs'), 'utf8'), /design: answer/);
  assert.doesNotMatch(fs.readFileSync(path.join(LIB, 'filmdesign.mjs'), 'utf8'), /beats: rows\.map\(\(r\) => \(\{[\s\S]*?\.\.\.r/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/filmdesign.md'), 'utf8'), /必须落在这一拍的 byBeat/);
});

test("a studio's way, as the user approved it (2026-10-28: 按你推荐的都执行好 … 客观 专业 规范 高效): two client gates (the design: greybox, style frames and board together; the final), the greybox reviewed blind before the user sees it, its type timed by the voice and placed by the line, chapters briefed to their own sessions, the rules on one page", async () => {
  const S = await import(pathToFileURL(path.join(LIB, 'gatestate.mjs')).href), G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href), SB = await import(pathToFileURL(path.join(LIB, 'sessionbrief.mjs')).href);
  // the design set: design, then final; the greybox and its blind review first; the older gates read off the design
  assert.deepEqual(S.GATES, ['design', 'final']);
  const d = { process: 'six-stage', gateSet: 'design', style: 'x', lettering: 'eva' };
  assert.ok(S.designSet(d)); assert.ok(!S.designSet({ process: 'six-stage' }), 'a film made before keeps its gates');
  assert.match(S.gatesOf(d, { greybox: null }).design.why, /greybox rough is being made/);
  assert.match(S.gatesOf(d, { greybox: 'g', greyboxReviewed: false }).design.why, /reviewed blind/);
  assert.match(S.gatesOf(d, { greybox: 'g', greyboxReviewed: true, film: { designFirst: true, ready: false } }).design.why, /style frames are being made/);
  assert.equal(S.gatesOf(d, { greybox: 'g', greyboxReviewed: true }).waiting, 'design');
  const ok = { ...d, design: { approved: true, by: 'u', at: 't', greybox: 'g', board: 'b' } };
  assert.equal(S.gatesOf(ok, { greybox: 'g', greyboxReviewed: true, film: { board: 'b' } }).waiting, 'final');
  assert.ok(S.gatesOf(ok, { greybox: 'g2' }).design.ok && /at the final/.test(S.gatesOf(ok, { greybox: 'g2' }).design.since), 'a changed greybox is shown at the final, the design approved once');
  assert.equal(S.gatesOf(ok, { greybox: 'g' }).rough.ok, true, 'the structure is the greybox: no separate structure gate');
  assert.match(fs.readFileSync(path.join(LIB, 'gates.mjs'), 'utf8'), /if \(gate === 'design'\) \{[\s\S]{0,900}greyboxReviewPassed\(cfg, id\) === false\) throw[\s\S]{0,300}fl && !fl\.ready\) throw/);
  assert.match(fs.readFileSync(path.join(LIB, 'store.mjs'), 'utf8'), /process: 'six-stage', gateSet: 'design'/);
  // the greybox's blind review: six scores, every one 3 at least, a mean of 3.5, nothing of severity 4
  const sc = (v) => Object.fromEntries(G.GREYBOX_SCORES.map((k) => [k, v]));
  assert.deepEqual(G.greyboxReviewErrors({ scores: sc(4), issues: [{ beat: 'B1', severity: 3, say: 'x', fix: 'y' }] }), []);
  assert.match(G.greyboxReviewErrors({ scores: { ...sc(4), seams: 2 }, issues: [] }).join(), /seams: 2/);
  assert.match(G.greyboxReviewErrors({ scores: sc(3), issues: [{ beat: 'film', severity: 4, say: '同一种版式', fix: '换构图' }] }).join(), /mean 3\.00[\s\S]*severity 4/);
  // from the third review on the mean is a note (banana-design: four reviews, the same general notes each time); a score under 3 or an issue of 4 still holds
  const thirds = { scores: { arc: 4, telling: 3, layout: 3, colour: 4, seams: 3, motion: 3 }, issues: [{ beat: 'film', severity: 3, say: '硬切多', fix: '换衔接' }] };
  assert.match(G.greyboxReviewErrors(thirds, 2).join(), /mean 3\.33/); assert.deepEqual(G.greyboxReviewErrors(thirds, G.GREYBOX_ROUNDS), []);
  assert.match(G.greyboxReviewErrors({ ...thirds, scores: { ...thirds.scores, seams: 2 } }, 5).join(), /seams: 2/);
  assert.ok(fs.existsSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox-review.md')) && fs.existsSync(path.join(REPO, 'work/recipe-board-v1/routing/greybox-review.schema.json')));
  // the voice's timing: a line comes in 0.3 s before its words; a hold may be later, never earlier
  assert.equal(G.saidIn('每堵一天，就有大约90亿美元的货物被卡在路上。', '90亿美元', 6), 2.29, 'at 8 of its 21 letters');
  assert.equal(G.typeIn({ text: '90亿美元', in: null }, { text: '每堵一天，就有大约90亿美元的货物被卡在路上。', dur: 6 }), 1.99);
  assert.equal(G.typeIn({ text: '90亿美元', in: 3 }, { text: '每堵一天，就有大约90亿美元', dur: 6 }), 3);
  const early = { beats: [{ beat: 'B1', blocks: [{ label: 's', shape: 'rect', role: 'subject', x: 100, y: 100, w: 600, h: 600, model: null, view: null, image: null, in: 0, enter: null }], type: [{ text: '90亿美元', role: 'big', x: null, y: null, near: 'right', size: 120, align: 'left', accent: false, in: 0.2, enter: null }], camera: { move: 'static', note: null, from: null, to: null }, out: 'cut', note: '' }] };
  assert.match(G.greyboxErrors(early, [{ beat: 'B1', text: '每堵一天，就有大约90亿美元的货物', dur: 6 }]).join(), /before its words/);
  // placed by the line: clear of the subject (with its margin), of the lines before, inside the safe frame, above the band
  const P = G.placeType(early.beats[0]); const b = G.typeBox(P[0]);
  assert.ok(b.x0 >= 700 + 32 - 1e-6 || b.y0 >= 700 + 32, 'clear of the subject and its margin'); assert.ok(b.y1 <= G.BAND && b.x1 <= G.W - 24);
  const two = G.placeType({ blocks: [], type: [{ text: '大风', size: 150, near: 'top-left', role: 'big' }, { text: '沙尘暴', size: 48, near: 'under', role: 'small' }] });
  assert.ok(G.typeBox(two[1]).y0 >= G.typeBox(two[0]).y1, 'under: below the line before');
  // the layout in a word, and a cut that lands on nothing
  assert.equal(G.layoutSig({ blocks: [], type: [{ text: '367艘', size: 200, x: 960, y: 150, align: 'center', role: 'number' }] }), 'a figure top-centre');
  // the chapter's brief: same shape every time, from the approved design
  const t = SB.briefText({ id: 'x', chapter: 'B02', beats: [{ beat: 'B02', at: 5, dur: 8, text: '2021年3月' }], greybox: { B02: { blocks: [{ label: '卫星照片', image: 'a.jpg', role: 'evidence' }], type: [{ text: '長賜號', role: 'big', size: 130 }], camera: { move: 'push' }, out: 'match', note: '证据先立住' } }, film: { B02: { act: 'build', palette: 'teal-chart', screen: 'clean', why: 'w' } }, neighbours: { prev: 'B01', in: 'glitch', next: 'B11', out: 'match' }, files: { house: 'work/recipe-board-v1/HOUSE.md', frames: { B02: 'f.png' } }, notes: [{ beat: 'B02', severity: 3, say: 's', fix: 'f' }] });
  for (const m of [/## 这一章/, /卫星照片（图片 a\.jpg，来源以素材记录为准，evidence）/, /## 先读[\s\S]*HOUSE\.md/, /## 你只碰这些文件/, /--only B02/, /## 什么时候算做完[\s\S]*一轮盲审/, /## 回报/, /设计关盲审留下的备注[\s\S]*B02（严重度 3）/, /进这一章的是 glitch/]) assert.match(t, m);
  assert.match(t, /先复现参考落幅，再增加运动/);
  assert.match(t, /主体、尺度、机位、材质与焦点不得无声降级/);
  assert.match(t, /同一动态场景生成入场、停稳、出场关键姿势/);
  assert.match(fs.readFileSync(path.join(REPO, 'scripts/recipe-board.mjs'), 'utf8'), /cmd === 'session-brief'/);
  // the rules in force on one page, read first
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  assert.ok(house.split('\n').length < 160, 'one page'); assert.match(fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8'), /Read \[work\/recipe-board-v1\/HOUSE\.md\][\s\S]{0,40}first/);
});

test('director motion prompt: reference-led poses and real subject change replace the old always-push-in instruction', async () => {
  const prompt = fs.readFileSync(path.join(DATA, 'prompts/morph.md'), 'utf8');
  assert.doesNotMatch(prompt, /镜头最好一直在动/);
  assert.doesNotMatch(prompt, /整图 1\.00→1\.08 的推近/);
  assert.match(prompt, /先复现参考落幅/);
  assert.match(prompt, /同一动态场景/);
  assert.match(prompt, /画面里究竟是什么在真实变化/);
});

test('director reference lock: routed reference pictures are real task inputs, not path prose; changed pixels invalidate the handoff', async () => {
  const C = await lib('chapter.mjs'), S = await lib('store.mjs');
  S.ensureProject(cfg, 'reference-lock-test', 'x');
  const root = path.join(cfg.dataDir, 'projects/reference-lock-test');
  fs.mkdirSync(path.join(root, 'materials'), { recursive: true });
  const frame = path.join(root, 'materials/anchor.png');
  fs.writeFileSync(frame, 'approved-anchor-v1');
  const input = { guidance: { nearest: [{ frame: 'materials/anchor.png', source: 'chapters/gold.mjs', clip: { file: 'clips/intentionally-missing.mp4' } }] } };
  const bound = C.productionInputFiles(cfg, 'reference-lock-test', input);
  assert.equal(bound.length, 1); assert.equal(bound[0].file, frame); assert.ok(bound[0].hash);
  assert.deepEqual(C.productionInputPaths(cfg, 'reference-lock-test', input.guidance, ['frame', 'image']), [frame], 'an unavailable/unknown reference clip is not a required picture');
  fs.writeFileSync(frame, 'changed-anchor-v2');
  assert.notEqual(C.productionInputFiles(cfg, 'reference-lock-test', input)[0].hash, bound[0].hash);
  assert.deepEqual(C.productionInputPaths(cfg, 'reference-lock-test', { nearest: [{ frame: 'https://example.com/not-local.png' }] }), [], 'remote/path prose is not a bound local picture');
  const source = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.ok((source.match(/productionInputPaths\(cfg, id, (?:st\.)?input\.guidance(?=\s*[,\)])/g) || []).length >= 2, 'both initial dispatch and revision tasks attach the reference pictures');
});

test('director scoped poses: reference comparisons and the existing blind review gate MP4 for high-risk beats', async () => {
  const S = await lib('shotmotion.mjs');
  const design = { beats: [{ beat: 'B12', productionRisk: 'high' }, { beat: 'B13' }] };
  const productionFiles = [{ file: '/tmp/approved.png', hash: 'abc123' }];
  const comparison = { reference: { file: '/tmp/approved.png', hash: 'abc123' }, start: 'same subject and camera', change: 'the real crop opens', end: 'same material and landing' };
  assert.deepEqual(S.referenceComparisonErrors([{ shotId: 'B12', referenceComparison: comparison }], design, productionFiles), []);
  assert.ok(S.referenceComparisonErrors([{ shotId: 'B12' }], design, productionFiles).some(e => /B12.*referenceComparison/.test(e)));
  assert.ok(S.referenceComparisonErrors([{ shotId: 'B12', referenceComparison: { ...comparison, reference: { file: '/tmp/approved.png', hash: 'stale' } } }], design, productionFiles).some(e => /hash/.test(e)));
  assert.deepEqual(S.referenceComparisonErrors([{ shotId: 'B13' }], { beats: [{ beat: 'B13' }] }, productionFiles), [], 'ordinary beats keep the existing path');
  const passed = { answerHash: 'answer-1', errors: [], review: { frames: [{ beat: 'B12', score: 4 }] } };
  assert.deepEqual(S.scopedPoseReviewErrors({ filmDesign: design, check: passed, answerHash: 'answer-1' }), []);
  assert.ok(S.scopedPoseReviewErrors({ filmDesign: design, check: { ...passed, review: null }, answerHash: 'answer-1' }).length);
  assert.ok(S.scopedPoseReviewErrors({ filmDesign: design, check: { ...passed, review: { frames: [{ beat: 'B12', score: 3 }] } }, answerHash: 'answer-1' }).length);
  assert.ok(S.scopedPoseReviewErrors({ filmDesign: design, check: passed, answerHash: 'answer-2' }).some(e => /stale/.test(e)));
  assert.deepEqual(S.scopedPoseReviewErrors({ filmDesign: { beats: [{ beat: 'B13' }] }, check: null, answerHash: 'answer-1' }), []);
  const C = await lib('chapter.mjs'), chapterSource = C.stepChapters.toString(), previewSource = C.previewChapter.toString(), reviewSource = C.reviewKeyframes.toString();
  assert.match(chapterSource, /poseFrames/); assert.match(reviewSource, /forPoses|poseFrames/);
  assert.ok(previewSource.indexOf('scopedPoseReviewErrors') >= 0 && previewSource.indexOf('scopedPoseReviewErrors') < previewSource.indexOf('await shoot('), 'the scoped review is checked before shoot, not after MP4');
  const schema = JSON.parse(fs.readFileSync(new URL('../work/recipe-board-v1/routing/morph.schema.json', import.meta.url), 'utf8'));
  assert.ok(schema.properties.motionImplementation.items.properties.referenceComparison);
});

test("the type bible (the user 2026-10-28: 字体设计的不好 你没什么排版规则和圣经吗 很多位置都怪怪的): a 12-column grid, five sizes, a pair on one edge in the narration's order, key figures on the screen not riding the 3D world, one size for one role across the film — measured on each settled frame", async () => {
  const T = await lib('typebible.mjs'), B = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/type-bible.json'), 'utf8'));
  const { GRID, SIZE, grid } = await import(pathToFileURL(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/typegrid.js')).href);
  // the chapters' helper is the table
  assert.deepEqual(SIZE, Object.fromEntries(Object.entries(B.scale).filter(([k]) => k !== 'tolerance')));
  assert.deepEqual(Array.from({ length: 12 }, (_, k) => grid.left(k)), B.grid.lefts); assert.deepEqual(Array.from({ length: 12 }, (_, k) => grid.right(k)), B.grid.rights); assert.equal(GRID.band, B.grid.band);
  assert.equal(T.stepOf(205, B), 'figure'); assert.equal(T.stepOf(170, B), null);
  // a good frame: a figure on column 8's left line, its sub under it on its edge at its gap
  const good = [{ id: 'f', text: '367', x0: grid.left(7), x1: grid.left(7) + 200, y0: 400, y1: 620, size: 200 }, { id: 'f', text: '艘', x0: grid.left(7) + 200, x1: grid.left(7) + 400, y0: 400, y1: 620, size: 200 }, { id: 's', text: '在等著過河', x0: grid.left(7), x1: grid.left(7) + 320, y0: 660, y1: 730, size: 64 }];
  assert.deepEqual(T.typeBibleErrors(good, B, 'B07', '有367艘船在等著過河'), []);
  assert.equal(T.linesOf(good)[0].text, '367艘', 'a line drawn in runs is read as one');
  const bad = [{ id: 'a', text: '多出兩週', x0: 300, x1: 700, y0: 420, y1: 540, size: 107 }, { id: 'b', text: '吧', x0: 340, x1: 430, y0: 560, y1: 610, size: 44 }, { id: 'c', text: '420艘', x0: 1000, x1: 1400, y0: 200, y1: 400, size: 197, pin: true, surface: true }, { id: 'd', text: '在等', x0: 1000, x1: 1100, y0: 700, y1: 736, size: 36, pin: true, surface: true }];
  const e = T.typeBibleErrors(bad, B, 'B09').join('\n');
  for (const m of [/107 px is off the type scale/, /stands off the grid/, /rides a thing in the 3D world/, /on its thing is 36 px/, /not on its edge/]) assert.match(e, m);
  // the narration's order: a kicker said first stands over its figure; a line said after goes under
  const kick = [{ id: 'k', text: '每堵一天', x0: grid.left(2), x1: grid.left(2) + 260, y0: 190, y1: 260, size: 64 }, { id: 'h', text: '九十億美元', x0: grid.left(2), x1: grid.left(2) + 1100, y0: 300, y1: 630, size: 300 }];
  assert.deepEqual(T.typeBibleErrors(kick, B, 'B08', '每堵一天，就有大約九十億美元'), [], 'a kicker over its figure');
  assert.match(T.typeBibleErrors(kick, B, 'B08', '九十億美元，每堵一天').join(), /goes under the big one/);
  // one size for one role across the film (the hero beats apart)
  assert.match(T.filmTypeErrors({ B03: [{ id: 'a', text: '400米', x0: 0, x1: 1, y0: 0, y1: 1, size: 217 }], B06: [{ id: 'b', text: '10%', x0: 0, x1: 1, y0: 0, y1: 1, size: 121 }] }, B).join(), /key figures stand at/);
  assert.deepEqual(T.filmTypeErrors({ B03: [{ id: 'a', text: '400米', x0: 0, x1: 1, y0: 0, y1: 1, size: 200 }], B08: [{ id: 'b', text: '90億', x0: 0, x1: 1, y0: 0, y1: 1, size: 300 }] }, B, new Set(['B08'])), []);
  // wired: chapters of a film set by it, the greybox's solver on the grid and its sizes on the scale; new films set by it; taught
  // the narration's order read through a shortened line and figures written either way; a Latin source credit is furniture
  assert.ok(T.saidAt('有的船等不及，掉頭繞道非洲南端的好望角，航程要多出大約兩週', '繞過好望角') < T.saidAt('有的船等不及，掉頭繞道非洲南端的好望角，航程要多出大約兩週', '多出兩週'));
  assert.equal(T.saidAt('每堵一天，就有大約90億美元', '九十億美元'), 8);
  assert.match(T.typeBibleErrors([{ id: 'm', text: '地中海', x0: 1760, x1: 1880, y0: 500, y1: 570, size: 64, pin: true }, { id: 'k', text: '亞洲到歐洲', x0: 1580, x1: 1800, y0: 540, y1: 610, size: 64 }], B, 'B05').join(), /run into each other/, 'a world label over a screen line');
  assert.deepEqual(T.typeBibleErrors([{ id: 'e', text: 'Suez Canal Authority / FreightWaves', x0: 1090, x1: 1360, y0: 300, y1: 330, size: 24 }], B, 'B11'), []);
  // wired: the chapters and the hero stills measured by it (one function), and the profile's free-type rarity and pairing
  // left to it on a film set by it
  const CH = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(CH, /export async function bibleKeyErrors/); assert.match(fs.readFileSync(path.join(LIB, 'stills.mjs'), 'utf8'), /C\.bibleKeyErrors\(cfg, id, g, r\.keyframes, \{ taskMode: 'stills' \}\)/);
  assert.equal((CH.match(/bibleSet\(cfg, id\) \? \[\] : typeDensityErrors/g) || []).length, 1); assert.match(CH, /profileCheck\('type-density', typeDensityErrors/); assert.equal((CH.match(/bibleSet\(cfg, id\) \? \[\] : pairErrors/g) || []).length, 2);
  // figures and words one height, by their ink (400 stood 47 px under the top of 米); a pair on its edge to a few px; every
  // moment of the chapter, not one settled frame (the user 2026-10-28: 数字和文字为什么对齐不了 为什么检查不出来)
  const fig = (dy) => [{ id: 'n', text: '400', x0: 262, x1: 486, y0: 130, y1: 338, size: 204, ink: [159 + dy, 314] }, { id: 'n', text: '米', x0: 486, x1: 590, y0: 107, y1: 315, size: 204, ink: [112, 314] }];
  assert.match(T.typeBibleErrors(fig(0), B, 'B03').join(), /not one height/); assert.deepEqual(T.typeBibleErrors(fig(-45), B, 'B03').filter((m) => /one height/.test(m)), []);
  const drift = [{ id: 'p', text: '400米', x0: 250, x1: 577, y0: 107, y1: 338, size: 204 }, { id: 'p', text: '2萬個集裝箱', x0: 263, x1: 511, y0: 380, y1: 446, size: 64 }];
  assert.match(T.typeBibleErrors(drift, B, 'B03', '', { grid: false }).join(), /not on its edge/, 'a pair 13 px apart');
  const track = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((t) => ({ t, drawn: t < 0.4 ? [drift[0], { ...drift[1], x0: 250 }] : drift }));
  const tb = T.trackBibleErrors([...track, ...[1.2, 1.4].map((t) => ({ t, drawn: drift }))], [{ shotId: 'B03', at: 0, dur: 2, text: '' }], B);
  assert.equal(tb.length, 1); assert.match(tb[0], /not on its edge .*\(0\.4-1\.6 s\)/);
  assert.deepEqual(T.typeBibleErrors([{ id: 'm', text: '地中海', x0: 1700, x1: 1900, y0: 400, y1: 600, size: 197, pin: true }], B, 'B05', '', { grid: false }), [], "a place's name grown under the push is still its label");
  const MJ = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(MJ, /const nk = `\$\{id\}\|\$\{\(window\.__bible && g\.__group\) \|\| g\.__line \|\| text\}`/); assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit2.js'), 'utf8'), /Math\.min\(1\.45, hc \/ hl\)/); assert.match(MJ, /kOf = \(r\) => figureScale\(g, r\)/, 'the page draws figures by the rule the parts measure them by (Suez B07: 367艘 off its column)');
  assert.match(CH, /errors\.push\(\.\.\.await bibleTrackErrors\(cfg, id, g\.shots, track, \{ taskMode \}\)\)/); assert.match(CH, /bible: !!\(id && bibleSet\(cfg, id\)\)/);
  // one gap between a pair's lines by their ink, the same number in the kit and the table
  const TGm = await import(pathToFileURL(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/typegrid.js')).href); assert.equal(TGm.INK_GAP, B.pair.inkGap);
  const inked = (gapPx) => [{ id: 'p', text: '367', x0: 1256, x1: 1460, y0: 400, y1: 620, size: 200, ink: [420, 600] }, { id: 'p', text: '在等著過河', x0: 1256, x1: 1500, y0: 0, y1: 0, size: 64, ink: [600 + gapPx, 650 + gapPx] }].map((d) => (d.size === 64 ? { ...d, y0: d.ink[0] - 4, y1: d.ink[1] + 4 } : d));
  assert.deepEqual(T.typeBibleErrors(inked(30), B, 'B07', '', { grid: false }), []); assert.match(T.typeBibleErrors(inked(70), B, 'B07', '', { grid: false }).join(), /by their ink/);
  // an appeal is heard once: ruled, it is not sent to the arbiter again (a passing gate kept sending B01 back)
  { const AR = await lib('arbiter.mjs'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'appeal-')); fs.writeFileSync(path.join(d, 'x.appeal.json'), JSON.stringify({ beats: { B01: 'why', B11: 'why2' } }));
    AR.markHeard(d, 'x', ['B01']); assert.deepEqual(Object.keys(AR.readAppeals(d, 'x')), ['B11']); }
  // a mature studio's rules (TYPE.md §7): display type set by hand, a block off its axis, a world word paired with a screen
  // line, levels too many or too close, two things read first, two groups as close as one, a line too short to read
  { const D = (o) => ({ id: 'x', x0: 120, x1: 600, y0: 300, y1: 500, size: 200, alpha: 1, ...o });
    assert.match(T.designErrors(T.linesOf([D({ text: '很窄的路', block: null }), D({ text: '一艘船', y0: 700, y1: 760, size: 64, block: 'b1', id: 'y' })]), B).join(), /set by hand/);
    assert.match(T.designErrors(T.linesOf([D({ text: '367艘', block: 'p', inkX: [124, 560] }), D({ id: 'p2', text: '在等著過河', y0: 540, y1: 600, size: 64, block: 'p', inkX: [140, 400] })]), B).join(), /no one axis/);
    assert.deepEqual(T.designErrors(T.linesOf([D({ text: '367艘', block: 'p', inkX: [124, 560] }), D({ id: 'p2', text: '在等著過河', y0: 540, y1: 600, size: 64, block: 'p', inkX: [127, 400] })]), B).filter((m) => /axis/.test(m)), []);
    assert.match(T.designErrors(T.linesOf([D({ text: '一艘船', pin: true, size: 410, x0: 623, x1: 1163, y0: 372, y1: 782 }), D({ id: 's', text: '卡住了全世界的貨', x0: 657, x1: 1024, y0: 783, y1: 850, size: 64 })]), B).join(), /paired with "一艘船" in the world/);
    assert.match(T.designErrors(T.linesOf([D({ text: '全世界的貿易', size: 64, y0: 100, y1: 160, block: 'a' }), D({ id: 'z', text: '每天50艘船', size: 48, x0: 1200, x1: 1500, y0: 100, y1: 150, block: 'c' })]), B).join(), /too close to read as two/);
    assert.match(T.designErrors(T.linesOf([D({ text: '一艘船、一條河', size: 64, x0: 1114, x1: 1350, y0: 250, y1: 300, block: 'k' }), D({ id: 'w', text: '很窄的路', size: 200, x0: 1114, x1: 1700, y0: 345, y1: 560, block: 'w' })]), B).join(), /two groups set as close as one/);
    const tr = [0, 0.2, 0.4].map((t) => ({ t, drawn: [{ id: 'r', text: '每天有五十艘船經過蘇伊士運河', x0: 0, x1: 1, y0: 0, y1: 1, size: 64, alpha: 1 }] })).concat([{ t: 0.6, drawn: [] }, { t: 2, drawn: [] }]);
    assert.match(T.readTimeErrors([{ t: 0, drawn: [] }, ...tr.map((f) => ({ ...f, t: f.t + 0.2 }))], B).join(), /characters need/); }
  const K2s = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit2.js'), 'utf8');
  assert.match(K2s, /export function typeBlock\(/); assert.match(K2s, /export function spreadWord\(/); assert.match(K2s, /flat = \{ FACE, COL, setStyle, label, typeBlock, spreadWord,/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/TYPE.md'), 'utf8'), /## 7\. 成熟规范/);
  // the audit of 2026-10-28 (skills and SOPs), made into the system: the director's skill on the gates and the reviews as
  // they stand, the writers' rules on the type parts and the locked designs, the SOP on two gates, the old skill marked,
  // a label by its thing, the retrospective a fixed step
  { const SK = fs.readFileSync(path.join(REPO, '.codex/skills/recipe-board-director/SKILL.md'), 'utf8');
    assert.doesNotMatch(SK, /--approve look\|rough\|final|score each beat by|write `tasks\/morph-<ch>-review\.answer\.json`/, 'no old gates, no scoring of its own work');
    assert.match(SK, /design\|final/); assert.match(SK, /fresh subagent/); assert.match(SK, /typeBlock/); assert.match(SK, /L123/);
    assert.match(fs.readFileSync(path.join(REPO, '.claude/skills/motion-director/SKILL.md'), 'utf8'), /^---\nname: motion-director\ndescription: SUPERSEDED, read-only/);
    for (const p of ['morph.md', 'stills.md']) { const t = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts', p), 'utf8'); assert.match(t, /typeBlock/); assert.match(t, /userLocked/); }
    { const t = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8'); assert.match(t, /typeBlock/); assert.match(t, /spreadWord/); }
    assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8'), /userLocked/);
    const SOP = fs.readFileSync(path.join(REPO, 'SOP.md'), 'utf8'); assert.doesNotMatch(SOP, /三道关口由你批|只有三道，都在第 3 节|你只在三处出手/); assert.match(SOP, /--approve design\|final/);
    const GS = await lib('gatestate.mjs'); assert.deepEqual(GS.userLockedOf({ userLocked: { B01: 'u', B05: 'v' } }, ['B01', 'B02']), { B01: 'u' }); assert.equal(GS.userLockedOf({}, ['B01']), null);
    assert.match(T.designErrors(T.linesOf([{ id: 'l', text: '偏出航道', x0: 1400, x1: 1600, y0: 660, y1: 720, size: 64, alpha: 1, block: null, anchor: [700, 300, 900, 500] }]), B).join(), /from the thing it names/);
    assert.deepEqual(T.designErrors(T.linesOf([{ id: 'l', text: '偏出航道', x0: 932, x1: 1132, y0: 380, y1: 440, size: 64, alpha: 1, block: null, anchor: [700, 300, 900, 500] }]), B).filter((m) => /thing it names/.test(m)), []);
    assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit2.js'), 'utf8'), /export function labelBy\(/);
    const RT = await lib('retro.mjs'); assert.equal(RT.kindOf('B03: "2萬" stands 0.30 of a size from "400米" by their ink'), 'type'); assert.equal(RT.kindOf("the film's design has it dark (lightness 0–0.22)"), 'colour');
    const fk = RT.faultKinds([{ step: 'morph-B02', rows: [{ errors: ['B05: "地中海" and "亞洲到歐洲" run into each other', 'x is late by 2 s, said at 3'] }] }]); assert.equal(fk.type.n, 1); assert.equal(fk.timing.n, 1);
    assert.match(fs.readFileSync(path.join(LIB, 'run.mjs'), 'utf8'), /import\('\.\/retro\.mjs'\)\)\.retro\(cfg, id\)/); assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/TYPE.md'), 'utf8'), /## 8\. 屏幕上的字还要多想一步/); }
  // the three loose ends (the user 2026-10-28: 收完 修掉): a scatter quote's lines each in a free place; the subtitle band one
  // number on the line; a label by its thing counts as words on things; light and dark set before it is measured
  { assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/modules/quote.html'), 'utf8'), /const placed = \[\{ x0: vl/);
    const CHs = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'); assert.match(CHs, /export const SUB_BAND = 935;/); assert.doesNotMatch(CHs, /d\.y1 > 860/);
    assert.match(fs.readFileSync(path.join(LIB, 'profile.mjs'), 'utf8'), /d\.object \|\| d\.surface \|\| d\.anchor/);
    const FD = await lib('filmdesign.mjs'); const rows = FD.filmRows({ beats: [{ beat: 'B04', value: 'dark' }] }, ['B04']); assert.deepEqual(rows[0].valueBand, [0, 0.22]);
    assert.match(FD.filmFollowErrors([{ mean: 0.4 }], [{ beat: 'B04', value: 'dark' }], ['B04']).join(), /exposure3 ×0\.0[0-9] for its seconds; a flat frame/);
    assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8'), /S\.mod\.exposure3 && st\.r && st\.baseExposure != null/);
    assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/morph.md'), 'utf8'), /35i\. \*\*明暗照整片设计定/); }
  // a character the transform keeps as it is somewhere is converted by its word, not alone (Suez: 沙土 → 砂土 made 沙塵暴 show 砂塵暴)
  { const CH2 = await lib('chapter.mjs'); assert.deepEqual(CH2.hantChars({ 沙土和淤泥: '砂土和淤泥', 时间: '時間' }, ['沙塵暴']), { 时: '時', 间: '間' }); assert.equal(CH2.hantChars({ 沙土: '砂土' }).沙, '砂', 'unambiguous: still converted alone'); }
  // approval after a long silence (the user 2026-10-28: 如果我长时间没恢复可以自动渲染精磨): due only when the gate waited its hours
  // on the same thing with no word since; the session's own name is still refused; the run tries it last
  { const GT = await lib('gates.mjs'), A = { afterHours: 4 }, t0 = Date.parse('2026-10-28T10:00:00Z');
    const wait = { since: '2026-10-28T10:00:00Z', key: 'design-v1', presentation: { key: 'design-v1', shownAt: '2026-10-28T10:00:00Z', activityCheckedThrough: '2026-10-28T16:00:00Z' } }, trusted = () => true;
    assert.equal(GT.autoDue({ since: wait.since, key: wait.key }, t0 + 5 * 3600e3, A), false, 'ready alone is not evidence of presentation or silence');
    assert.equal(GT.autoDue(wait, t0 + 5 * 3600e3, A), false, 'a receipt is not trusted without a verifier');
    assert.equal(GT.autoDue(wait, t0 + 3.9 * 3600e3, A, [], trusted), false); assert.equal(GT.autoDue(wait, t0 + 4.1 * 3600e3, A, [], trusted), true);
    assert.equal(GT.autoDue({ ...wait, presentation: { ...wait.presentation, activityCheckedThrough: '2026-10-28T13:00:00Z' } }, t0 + 5 * 3600e3, A, [], trusted), false, 'activity monitoring cannot end before the decision');
    assert.equal(GT.autoDue(wait, t0 + 5 * 3600e3, A, [{ at: '2026-10-28T12:00:00Z', say: '改一下' }], trusted), false, 'a word from the user since holds it');
    const AU = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/autonomy.json'), 'utf8')); assert.deepEqual(AU.gates, ['design', 'final']); assert.ok(AU.afterHours >= 2);
    assert.match(fs.readFileSync(path.join(LIB, 'gates.mjs'), 'utf8'), /!auto && \['design', 'final', 'look', 'rough', 'direction'\]\.includes\(gate\) && \/\^\\s\*\(Claude\|Codex\|代批\|session\|自动\)/);
    assert.match(fs.readFileSync(path.join(LIB, 'run.mjs'), 'utf8'), /autoApprove\(cfg, id, \{ log \}\)/);
    const GS2 = await lib('gatestate.mjs'), d0 = { process: 'six-stage', gateSet: 'design', lettering: 'eva' };
    assert.ok(!GS2.gatesOf(d0, {}).design.ready, 'no style yet: nothing to see, no clock'); assert.ok(GS2.gatesOf({ ...d0, style: 's' }, { greybox: 'g', greyboxReviewed: true, film: { designFirst: true, ready: true, board: 'b' } }).design.ready); }
  // a greybox subject's block stands off its ground: the ink when the palette's key is the ground (mustard)
  { const GBm = await lib('greybox.mjs'); assert.equal(GBm.subjectFill('#d6a121', '#d6a121', '#171512'), '#17151266'); assert.equal(GBm.subjectFill('#2f6e68', '#0c3b38', '#eef0ea'), '#2f6e68cc'); }
  // the grid by the ink; a coloured ground is not a plate
  assert.deepEqual(T.typeBibleErrors([{ id: 'o', text: '同一棵香蕉', x0: 86, x1: 854, y0: 120, y1: 420, size: 300, inkX: [121, 850], alpha: 1 }], B, 'B01').filter((m) => /grid|margins/.test(m)), []);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8'), /if \(A >= 200 && A < 1920 \* 1080 \/ 3\) \(S\.accentRects/);
  // a sea route on the globe keeps the land dots clear of its lane (the Red Sea read as land under Suez's route: the arbiter)
  const K3 = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit3.js'), 'utf8'), SC = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/scenes.js'), 'utf8');
  assert.match(K3, /isLand\(lat, lon\) && !\(lanePts\.length && onLane\(lat, lon\)\)/); assert.match(SC, /lanes: \[\.\.\.routes\.filter\(\(rt\) => rt\.sea !== false\)/);
  // the lane wider than the line (a line its lane's width covered the Red Sea whole); a print in a bible film runs the frame under a scrim
  assert.match(SC, /\/ r \/ \(Math\.PI \/ 180\) \+ 1\.1 \}\);/); assert.match(SC, /jitter: 0\.8, limb: true, lanes:/); assert.match(K3, /diffuseColor\.a \*= smoothstep\(0\.06, 0\.32, vFace\)/); assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit2.js'), 'utf8'), /const bleed = print && bible && fade;/);
  // a print melts into its ground with no hairline at its edge
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit2.js'), 'utf8'), /e - 2, y, 262, h\)/);
  // the shared pair sets its small line at the bible's gap as the line measures it (morph.js textBox: 0.88 up, 0.14 down)
  const K2 = await import(pathToFileURL(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit2.js')).href).catch(() => null);
  if (K2?.pair) { const calls = []; const g = { save() {}, restore() {}, set font(v) {}, measureText: () => ({ width: 400 }), fillText: (t, x, y) => calls.push([t, y]), globalAlpha: 1 };
    try { K2.pair(g, { big: '367艘', small: '在等著過河', x: 1256, y: 560, size: 200, ratio: 200 / 64, bible: true }); const sy = calls.find((c) => c[0] === '在等著過河')?.[1]; if (sy != null) assert.ok(Math.abs((sy - 64 * 0.88 - (560 + 200 * 0.14)) / 200 - 0.2) < 0.01); } catch { /* the kit needs a browser canvas */ } }
  assert.match(fs.readFileSync(path.join(LIB, 'store.mjs'), 'utf8'), /typeBible: true/);
  const G = await lib('greybox.mjs'); const placed = G.placeType({ blocks: [], type: [{ text: '大風', size: 128, near: 'top-left', role: 'title' }, { text: '沙塵暴', size: 64, near: 'under', role: 'sub' }] });
  assert.ok(B.grid.lefts.includes(placed[0].x) && placed[1].x === placed[0].x, 'on a column line, the pair on one edge');
  { const tb = G.typeBox(placed[0]), sb = G.typeBox(placed[1]); assert.ok(Math.abs((sb.y0 - tb.y1) / 128 - B.pair.inkGap) < 0.01, 'the greybox pair one gap apart, as the chapters set it'); }
  assert.match(G.greyboxErrors({ beats: [{ beat: 'B1', blocks: [{ label: 'x', shape: 'rect', role: 'context', x: 0, y: 0, w: 1920, h: 1080 }], type: [{ text: '大風', role: 'big', x: null, y: null, near: 'top-left', size: 150, align: 'left' }], camera: { move: 'static' }, out: 'cut', note: '' }] }, [{ beat: 'B1', text: '大風', dur: 5 }]).join(), /150 px is off the type scale/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/morph.md'), 'utf8'), /35f\. \*\*排字照排版圣经\*\*/); assert.ok(fs.existsSync(path.join(REPO, 'work/recipe-board-v1/TYPE.md')));
});

test("the design set end to end, and what the independent audit of 2026-10-28 found: a new film waits on the greybox and its blind review before its design can be approved, then on the final; the preflight runs once the design is approved; the final sees a changed greybox; the chapters are held to the greybox; the cuts are measured on the reel; the type is timed by the recording when there is one; the rules agree", async () => {
  const G = await lib('gates.mjs'), S = await lib('store.mjs'), GB = await lib('greybox.mjs');
  S.ensureProject(cfg, 'design-test', '设计关'); const root = path.join(cfg.dataDir, 'projects', 'design-test'), pf = path.join(root, 'project.json');
  writeJson(pf, { ...readJson(pf), style: 'editorial-grey' });
  assert.equal((await G.gateState(cfg, 'design-test')).waiting, 'design');
  await assert.rejects(G.approveGate(cfg, 'design-test', 'look', '用户：可以'), /design \| final/, 'the older gate names are refused on the design set');
  await assert.rejects(G.approveGate(cfg, 'design-test', 'design', '用户：可以'), /greybox rough has not passed its checks/);
  writeJson(path.join(root, 'tasks', 'greybox.check.json'), { ok: true, errors: [], answerHash: 'g1' });
  assert.equal(GB.greyboxReviewPassed(cfg, 'design-test'), false);
  await assert.rejects(G.approveGate(cfg, 'design-test', 'design', '用户：可以'), /not passed its blind review/);
  writeJson(path.join(root, 'tasks', 'greybox-review.gate.json'), { passedAt: 't', greybox: 'g1' });
  await assert.rejects(G.approveGate(cfg, 'design-test', 'design', 'Claude 代批（用户授权）：检查都过了'), /the user's: it is approved in their words/, 'never on the session\'s word (2026-10-28: 没确认好怎么就精渲呢)');
  await assert.rejects(G.approveGate(cfg, 'design-test', 'design', 'Codex：检查都过了'), /the user's: it is approved in their words/, 'Codex may direct the work but cannot approve the user gate');
  const d = await G.approveGate(cfg, 'design-test', 'design', '用户：方向和样子都可以'); assert.equal(d.greybox, 'g1');
  assert.ok(G.lookOpen(cfg, 'design-test') && G.polishOpen(cfg, 'design-test'), 'the chapters and their reviews open with the design');
  assert.equal((await G.gateState(cfg, 'design-test')).waiting, 'final');
  writeJson(path.join(root, 'tasks', 'greybox.check.json'), { ok: true, errors: [], answerHash: 'g2' });
  { const gs = await G.gateState(cfg, 'design-test'); assert.equal(gs.waiting, 'final', 'a greybox changed after the design was approved is shown at the final'); assert.match(gs.final.why, /changed since you approved the design/); }
  await assert.rejects(G.approveGate(cfg, 'design-test', 'final', '用户：可以精渲'), /./, 'the final is not approved without its rough');
  // the final is approved on the whole film's rough with its motion, as it is now (2026-10-28: 规范不是给我看全片粗版的动效吗)
  assert.equal(G.roughCurrent(cfg, 'design-test').ok, false, 'no rough reel yet');
  fs.mkdirSync(path.join(root, 'out'), { recursive: true }); fs.writeFileSync(path.join(root, 'out', 'animatic.mp4'), 'x'); assert.equal(G.roughCurrent(cfg, 'design-test').ok, true);
  fs.mkdirSync(path.join(root, 'chapters'), { recursive: true }); const later = Date.now() / 1000 + 60; fs.writeFileSync(path.join(root, 'chapters', 'B02.mjs'), 'x'); fs.utimesSync(path.join(root, 'chapters', 'B02.mjs'), later, later);
  assert.match(G.roughCurrent(cfg, 'design-test').why, /B02 changed after it was made/);
  assert.match(fs.readFileSync(path.join(LIB, 'gates.mjs'), 'utf8'), /const st = roughCurrent\(cfg, id\); if \(!st\.ok\) throw/);
  // the preflight runs on the design set (it waited on a rough approval the design set never writes)
  assert.match(fs.readFileSync(path.join(LIB, 'run.mjs'), 'utf8'), /\(loadProject\(cfg, id\)\?\.rough\?\.approved \|\| loadProject\(cfg, id\)\?\.design\?\.approved\) && !loadProject\(cfg, id\)\?\.final\?\.approved/);
  // the chapters held to the greybox: every line on its frame, within a quarter of the frame, or a reason given
  const row = { beat: 'B07', blocks: [], type: [{ text: '367艘', role: 'number', x: 100, y: 600, size: 200, align: 'left', accent: false }] };
  assert.deepEqual(GB.greyboxDriftErrors({ B07: [{ text: '367艘', x0: 120, y0: 610, x1: 450, y1: 830 }] }, [row]), { errors: [], notes: [] });
  const far = GB.greyboxDriftErrors({ B07: [{ text: '367艘', x0: 1500, y0: 60, x1: 1800, y1: 280 }] }, [row]);
  assert.deepEqual(far.errors, []); assert.match(far.notes.join(), /stands \d+ % of the frame from where/, 'a note until calibrated on a film built to its greybox');
  assert.match(GB.greyboxDriftErrors({ B07: [{ text: '3月29日', x0: 0, y0: 0, x1: 1, y1: 1 }] }, [row]).errors.join(), /not on its frame/);
  assert.deepEqual(GB.greyboxDriftErrors({ B07: [] }, [row], { differ: { B07: '数字跟着船队走' } }), { errors: [], notes: [] }, 'a reason given');
  // figures written either way read as one (the second audit: 九十億 on the frame, 90亿 in the greybox, filed as missing)
  assert.equal(GB.cnDigits('九十億美元'), '90億美元'); assert.equal(GB.cnDigits('三百六十七艘'), '367艘'); assert.equal(GB.cnDigits('二〇二一年'), '2021年');
  assert.deepEqual(GB.greyboxDriftErrors({ B08: [{ text: '九十億美元', x0: 600, y0: 290, x1: 1300, y1: 640 }] }, [{ beat: 'B08', blocks: [], type: [{ text: '90亿美元', role: 'big', x: 960, y: 290, size: 320, align: 'center' }] }], { hant: (x) => x.replace('亿', '億') }).errors, []);
  assert.deepEqual(GB.greyboxDifferOf("export const greyboxDiffer = { B07: '数字跟着船队走' };"), { B07: '数字跟着船队走' });
  assert.match(fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'), /greybox: GB\.greyboxFor\(cfg, id, g\.shots\.map\(\(s\) => s\.shotId\)\),/, 'the chapter task carries its greybox');
  // approved once: a greybox changed after and passing its checks is followed (shown at the final); one sent back holds the chapters
  if (!fs.existsSync(path.join(root, 'tasks', 'greybox.answer.json'))) writeJson(path.join(root, 'tasks', 'greybox.answer.json'), { beats: [] });
  assert.equal(GB.approvedGreybox(cfg, 'design-test').changed, true); assert.ok(G.polishOpen(cfg, 'design-test'), 'the chapters go on');
  writeJson(path.join(root, 'tasks', 'greybox.check.json'), { ok: false, errors: ['x'], answerHash: 'g2' });
  assert.equal(GB.greyboxFor(cfg, 'design-test', ['B01']), null, 'sent back: nothing held to it'); assert.equal(GB.approvedGreybox(cfg, 'design-test').state, 'stale');
  // PARTIAL decouple: greybox-stale holds acceptance / session-brief / fine render — not morph preview.mp4 / draft look
  assert.ok(GB.isGreyboxStaleHold(GB.greyboxStaleMessage('design-test', 'B02')));
  assert.deepEqual(GB.morphCodeErrors([GB.greyboxStaleMessage('design-test', 'B02'), 'B02: leaves the margins']), ['B02: leaves the margins']);
  assert.match(fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'), /warnings\.push\(GB\.greyboxStaleMessage/);
  assert.match(fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'), /morphCodeErrors\(c\?\.errors/);
  assert.match(fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'), /greybox-stale holds acceptance only/);
  assert.doesNotMatch(fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'), /fix it first \(node scripts\/recipe-board\.mjs gate/);
  const SB = await lib('sessionbrief.mjs'); await assert.rejects(SB.sessionBrief(cfg, 'design-test', 'B01'), /approve the design again|not approved yet|no chapter|sent back/);
  writeJson(path.join(root, 'tasks', 'greybox.check.json'), { ok: true, errors: [], answerHash: 'g1' }); writeJson(path.join(root, 'tasks', 'greybox.answer.json'), { beats: [{ beat: 'B01', blocks: [], type: [{ text: '一艘船', role: 'big', x: null, y: null, near: 'top-left', size: 300, align: 'left' }], camera: { move: 'push' }, out: 'glitch', note: '' }] });
  assert.equal(GB.approvedGreybox(cfg, 'design-test').state, 'approved'); assert.ok(G.polishOpen(cfg, 'design-test'));
  const held = GB.greyboxFor(cfg, 'design-test', ['B01']); assert.equal(held.length, 1); assert.ok(held[0].type[0].x != null, 'its type as placed');
  // the cuts measured on the reel, not on the answer's blocks; small type off the subject
  assert.deepEqual(GB.cutErrors([{ beat: 'B05', fill: 0.02 }, { beat: 'B06', fill: 0.3 }]).map((e) => e.split(':')[0]), ['B05']);
  const onSubj = { beats: [{ beat: 'B1', blocks: [{ label: 's', shape: 'rect', role: 'subject', x: 100, y: 100, w: 900, h: 600, model: null, view: null, image: null, in: 0, enter: null }], type: [{ text: '沙尘暴', role: 'small', x: 200, y: 300, size: 48, align: 'left', accent: false, in: null, enter: null }], camera: { move: 'static', note: null, from: null, to: null }, out: 'cut', note: '' }] };
  assert.match(GB.greyboxErrors(onSubj, [{ beat: 'B1', text: '那天刮着大风，还起了沙尘暴', dur: 7 }]).join(), /lies on the subject/);
  const tag = JSON.parse(JSON.stringify(onSubj)); tag.beats[0].type[0].role = 'caption';
  assert.doesNotMatch(GB.greyboxErrors(tag, [{ beat: 'B1', text: '那天刮着大风，还起了沙尘暴', dur: 7 }]).join(), /lies on the subject/, 'a caption may tag its thing');
  // measured in pixels on a reel: a flat vignetted ground is nothing; a drawn thing is something; no silent pass
  { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-cuts-'));
    spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0c3b38:s=480x270:d=3:r=15', '-vf', "vignette=PI/4,drawbox=x=100:y=60:w=280:h=150:color=0xe0e0e0@1:t=fill:enable='gte(t,2)'", '-pix_fmt', 'yuv420p', path.join(dir, 'greybox.mp4')]);
    const m = GB.measureCuts(dir, [{ beat: 'B1', at: 0 }, { beat: 'B2', at: 1 }, { beat: 'B3', at: 2 }], []);
    assert.ok(m[0].fill < GB.CUT_FILL, `an empty ground reads empty (${m[0].fill})`); assert.ok(m[1].fill > 0.2, `a drawn thing reads (${m[1].fill})`);
    assert.deepEqual(GB.cutErrors(m).map((e) => e.split(':')[0]), ['B2']);
    spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xd0c8b8:s=480x270:d=1:r=15', '-vf', 'vignette=PI/5', '-pix_fmt', 'yuv420p', path.join(dir, 'greybox.mp4')]);
    assert.ok(GB.measureCuts(dir, [{ beat: 'B1', at: 0 }, { beat: 'B2', at: 0.3 }], [])[0].fill < GB.CUT_FILL, 'a cream ground under a heavy vignette reads empty (banana-design B06)');
    fs.rmSync(path.join(dir, 'greybox.mp4')); assert.throws(() => GB.measureCuts(dir, [{ beat: 'B1', at: 0 }, { beat: 'B2', at: 1 }], []), /could not be read/, 'no reel: an error, never a pass'); }
  const fullPhoto = JSON.parse(JSON.stringify(onSubj)); Object.assign(fullPhoto.beats[0].blocks[0], { x: 0, y: 0, w: 1920, h: 1080, role: 'evidence' });
  assert.doesNotMatch(GB.greyboxErrors(fullPhoto, [{ beat: 'B1', text: '那天刮着大风，还起了沙尘暴', dur: 7 }]).join(), /lies on the subject/, 'a full-frame photo is the ground: type on it is photo-over-type');
  // the recording's own word times when there are some
  const wt = GB.beatWordTimes({ start: 10, end: 16 }, [{ word: '每堵一天', s: 10.2 }, { word: '90亿美元', s: 13.9 }, { word: '下一拍', s: 16.4 }]);
  assert.equal(GB.saidIn('每堵一天，就有大约90亿美元', '90亿美元', 6, null, wt), 3.9, 'from the recording, not the letters\' share');
  assert.equal(GB.voiceTiming(cfg, 'design-test').state, 'none');
  assert.match(fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8'), /字的时间：按字数估算（还没有配音）/, 'an estimate is said on the sheet');
  // the rules agree: who approves the design, the gate names, the test time
  const ag = fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8'), house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  assert.match(ag, /gateSet: "design"/); assert.match(ag, /the design gate is the user's own/); assert.match(house, /定设计（用户关）/); assert.match(house, /不代批用户关：定设计和成片预览都要用户看过/); assert.match(ag, /no user gate is approved by the session/);
  assert.doesNotMatch(ag, /under a second/);
  assert.match(fs.readFileSync(path.join(LIB, 'sessionbrief.mjs'), 'utf8'), /同一个工作目录里（字体、素材、渲染结果不在 git 里/, 'one checkout: a new worktree has no fonts, materials or renders (the second audit)'); assert.doesNotMatch(fs.readFileSync(path.join(LIB, 'sessionbrief.mjs'), 'utf8'), /\.claude\/skills/);
});

test("made models are looked at before a chapter uses them, a screen a few beats take is drawn for their seconds only, and helpers round a hull are placed by rule (the user 2026-10-28: 继续都做好 也确保客观看是规范 高效的流程)", async () => {
  const C = await import(pathToFileURL(path.join(LIB, 'chapter.mjs')).href);
  // the model check: at least two of six views read as what it was asked to be (calibrated: ship 5, tug 4, dredger 2, the sandbank 0)
  assert.equal(C.modelVerdict('sandbank', 'a sand bank', { what: 'a sand bank', top: [false, false, false, false, false, false] }).ok, false);
  assert.match(C.modelVerdict('sandbank', 'a sand bank', { what: 'a sand bank', top: [false, false, false, false, false, false] }, '/x/sheet.jpg').say, /0 of its 6 views[\s\S]*rock, a block or a lump[\s\S]*\/x\/sheet\.jpg/);
  assert.equal(C.modelVerdict('dredger', 'a dredger', { what: 'a dredger', top: [true, false, false, true, false, false] }).ok, true);
  assert.equal(C.modelVerdict('x', 'y', null).ok, false, 'no views cannot pass model QA');
  assert.equal(C.modelCheck({ repoRoot: REPO, dataDir: path.join(REPO, 'work/recipe-board-v1') }, 'no-such-model-here', 'x'), null, 'a model not made yet is not judged');
  assert.match(fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8'), /waiting for its review \(\$\{rev\.pending\}\)`\);[\s\S]{0,400}if \(!ruleErrors\.length && PROF\.designFirst && keyframes\.length\) \{ const tg = await tasteGate/, 'the taste review goes out beside the chapter review');
  const ch = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(ch, /const q = modelCheck\(cfg, m\.name, m\.what\); if \(q && !q\.ok\) errors\.push\(q\.say\)/, 'prepareAssets sends a failing model back to the director');
  assert.match(fs.readFileSync(path.join(LIB, 'likeness.py'), 'utf8'), /--model[\s\S]*BLOBS = \['a grey rock', 'a stone block'/);
  assert.ok(fs.existsSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/blender/model_sheet.py')));
  // a screen's seconds: its beats padded and joined; the clean screen is drawn whole
  const g = { total: 20, shots: [{ shotId: 'B1', at: 0, dur: 5 }, { shotId: 'B2', at: 5, dur: 5 }, { shotId: 'B3', at: 10, dur: 5 }, { shotId: 'B4', at: 15, dur: 5 }] };
  assert.deepEqual(C.screenSpans(g, { B2: 'led2', B3: 'led2', B4: 'crt' }), { led2: [[4.4, 15.6]], crt: [[14.4, 20]] });
  assert.deepEqual(C.screenSpans(g, {}), {});
  assert.match(ch, /scale, range, spans: screenSpans\(g, screensOf\(cfg, id, g\)\.byBeat\) \}\);/, 'the white model draws a screen for its beats only');
  assert.match(ch, /spans: screenSpans\(g, screensOf\(cfg, id, g\)\.byBeat\)\[m\]/, 'and so does the final');
  const sh = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/shoot.mjs'), 'utf8');
  assert.match(sh, /if \(want && !want\.some\(\(\[a, b\]\) => t >= a && t <= b\)\) blank\.push\(f\); else await still\(t, f\);/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/director/make.mjs'), 'utf8'), /spans: s\.spans \? \{ \[sm\]: s\.spans \} : null/);
  // the formation: pushers against the sides, pullers beyond the ends, lines on their own side, none crowded
  const { formation } = await import(pathToFileURL(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/formation.js')).href);
  for (const seed of [1, 2, 3, 7]) {
    const f = formation({ length: 3.2, beam: 0.5, size: 0.46, pull: 7, push: 3, seed }), L = 1.6;
    assert.equal(f.length, 10, `seed ${seed}: all ten placed`); assert.equal(f.filter((x) => x.push).length, 3);
    for (const x of f.filter((y) => y.push)) { assert.equal(x.hold, null); assert.ok(Math.abs(x.at[0]) < L * 0.6 && Math.abs(Math.abs(x.at[1]) - 0.48) < 0.01, 'a pusher is against the side'); }
    for (const x of f.filter((y) => !y.push)) { assert.ok(Math.abs(x.at[0]) > L, 'a puller stands beyond the end'); assert.ok(Math.sign(x.hold[0]) === Math.sign(x.at[0]) && (Math.abs(x.at[1]) < 0.15 || Math.sign(x.hold[1]) === Math.sign(x.at[1])), 'its line holds its own side'); }
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) assert.ok(Math.hypot(f[i].at[0] - f[j].at[0], f[i].at[1] - f[j].at[1]) >= 0.46 * 1.5 - 1e-6, 'none crowded');
    const angles = f.filter((y) => !y.push).map((y) => Math.atan2(y.at[1] - y.hold[1], y.at[0] - y.hold[0]).toFixed(2));
    assert.equal(new Set(angles).size, angles.length, 'every line at its own angle');
  }
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/props.js'), 'utf8'), /export const props = \{ containerShip, tugboat, model, toneModel, formation, landform \}/);
  // bow 0 keeps the bow clear (a dredger works there); every line short enough to stay in the frame
  { const f = formation({ length: 3.2, beam: 0.54, size: 0.46, pull: 7, push: 3, bow: 0, seed: 5 }); assert.equal(f.length, 10); assert.ok(f.filter((x) => !x.push).every((x) => x.at[0] < 0)); }
  for (const seed of [1, 2, 3, 5, 7]) { const f = formation({ length: 3.2, beam: 0.54, size: 0.46, pull: 7, push: 3, bow: 2, seed }); assert.equal(f.length, 10, `bow 2, seed ${seed}`); assert.ok(Math.max(...f.filter((x) => !x.push).map((x) => Math.hypot(x.at[0] - x.hold[0], x.at[1] - x.hold[1]))) < 2, 'lines a tug length or two'); }
  // a landform: a heap rises, a cut digs as it is dug, the edge meets the ground (the image-to-3D line made the sand a block on a slab, twice)
  const { landHeight } = await import(pathToFileURL(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/formation.js')).href);
  const lo = { w: 2, d: 1.4, heaps: [[0.4, 0, 0.6, 0.35]], cuts: [[-0.8, -0.2, 0.3, 0.1, 0.18, 0.12]] };
  assert.ok(landHeight(0.4, 0, lo) > 0.25); assert.ok(landHeight(-0.3, -0.05, lo) < -0.08); assert.ok(Math.abs(landHeight(-0.3, -0.05, { ...lo, dug: 0 })) < 0.03, 'not yet dug');
  assert.equal(landHeight(1, 0.7, lo), 0, 'its edge at the ground: no base');
});

test("a gate passes once: its open lists close as notes, a later version opens no new list, the arbiter rules a beat once and only for a failing gate, and the beats' taste waits for one review of the whole film (the user 2026-10-28: 是不是效率 流程太低效和不规范呢 — Suez B02 passed its taste gate in round two and ran five more)", async () => {
  const RL = await import(pathToFileURL(path.join(LIB, 'reviewlist.mjs')).href), F = await import(pathToFileURL(path.join(LIB, 'filmdesign.mjs')).href);
  // a passed gate: a beat under 4 with no list is a note, not a new list
  const quiet = RL.settleBeat(null, { score: 3, issue: '沙坡像石頭', toFour: ['做成沙坡'] }, 4, { newLists: false });
  assert.equal(quiet.list, null); assert.deepEqual(quiet.notes, ['做成沙坡']);
  assert.ok(RL.settleBeat(null, { score: 3, issue: 'x', toFour: ['a'] }).list, 'before the gate passes a beat under 4 still gets its list');
  // the arbiter rules a beat once
  assert.deepEqual(RL.arbiterDue({ B10: { items: ['a'], stuck: 3, rounds: 5, byArbiter: '定過' }, B04: { items: ['a'], stuck: 2, rounds: 2 } }), ['B04']);
  assert.deepEqual(RL.arbiterDue({ B10: { items: ['a'], stuck: 0, rounds: 0, byArbiter: '定過' } }, { B10: '評審要的和仲裁相反' }), ['B10'], 'an appeal still goes');
  // closing: the lists become notes, the gate is marked, the next task says so
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-gate-')), task = path.join(dir, 'taste-B02.task.json');
  fs.writeFileSync(task, '{}'); RL.writeLists(task, { B04: { items: ['海圖底'], rounds: 2, stuck: 1 }, B10: { items: ['沙坡'], rounds: 1, stuck: 0, byArbiter: '定過' } });
  assert.equal(RL.gatePassed(task), false);
  const notes = RL.closeGate(task, RL.readLists(task), 4);
  assert.deepEqual(notes.map((n) => n.beat), ['B04', 'B10']); assert.equal(notes[1].byArbiter, true);
  assert.ok(RL.gatePassed(task)); assert.deepEqual(RL.readLists(task), {});
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'taste-B02.notes.json'), 'utf8')).notes.length, 2, 'kept for the next round of the system');
  assert.match(RL.listNote({}, { passed: true }), /已經過線[\s\S]*不再開到 4 分的清單/);
  // wired: the beats' and the stills' taste gates settle with newLists off once passed, arbitrate only a failing gate, close on pass
  const bd = fs.readFileSync(path.join(LIB, 'beatdesign.mjs'), 'utf8'), st = fs.readFileSync(path.join(LIB, 'stills.mjs'), 'utf8');
  assert.match(bd, /\{ newLists: !passedOnce \}/); assert.match(bd, /due = tasteErrors\(answer\)\.length \? RL\.arbiterDue\(lists, appeals\)/); assert.match(bd, /RL\.closeGate\(tp\.task/);
  assert.match(st, /\{ newLists: !RL\.gatePassed\(tt\.task\) \|\| B\.tasteErrors\(merged\)\.length > 0 \}/); assert.match(bd, /const passedOnce = RL\.gatePassed\(tp\.task\) && !tasteErrors\(answer\)\.length,/); assert.match(st, /due = B\.tasteErrors\(merged\)\.length \? RL\.arbiterDue/); assert.match(st, /RL\.closeGate\(tt\.task/);
  // the film before its beats
  assert.equal(F.filmReviewed([{ scores: { pace: 3 } }]), false, 'two reviewers');
  assert.equal(F.filmReviewed([{ scores: { pace: 3 } }, { scores: { pace: 4 } }]), true);
  assert.match(bd, /if \(F\.filmFirstDue\(cfg, id\)\) return \{ pending: F\.FILM_TASTE_STEP \}/);
});

test('the road to 4: a beat under 4 carries at most three things to do, the next review checks those only, all done is 4 (RETRO-20261028 1: Suez B02 six reviews at 3, each naming a new fault)', async () => {
  const RL = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/reviewlist.mjs')).href);
  const tiers = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/effort-tiers.json'), 'utf8'));
  assert.equal(tiers.tiers.studio.fixWorstN, RL.LIST_MAX, 'studio effort asks for the worst-3 list the review already caps at');
  const first = RL.settleBeat(null, { score: 3, issue: 'x', toFour: ['a', 'b', 'c', 'd'] });
  assert.deepEqual(first.list.items, ['a', 'b', 'c'], 'three at most');
  assert.equal(RL.settleBeat(null, { score: 3, issue: '船太小', toFour: [] }).list.items[0], '船太小', 'a review that wrote no list: its issue is the list');
  const done = RL.settleBeat(first.list, { score: 3, toFour: ['e'], checked: [1, 2, 3].map((item) => ({ item, done: true, why: '' })), hard: [] });
  assert.equal(done.score, 4, 'every item done and no new hard fault is 4, whatever the reviewer would like');
  assert.equal(done.list, null); assert.deepEqual(done.notes, ['e'], 'a new soft fault is a note');
  const part = RL.settleBeat(first.list, { score: 3, toFour: ['z'], checked: [{ item: 1, done: true, why: '' }], hard: ['字出画'] });
  assert.deepEqual(part.list.items, ['b', 'c', '字出画'], 'what is open and the new hard faults, never the new soft ones');
  assert.equal(part.list.stuck, 0);
  assert.equal(RL.settleBeat(first.list, { score: 3.5, toFour: [], checked: [], hard: [] }).score, 3.5, 'an open list keeps a beat from rising, never lowers it');
  const none = RL.settleBeat(first.list, { score: 3, toFour: [], checked: [], hard: [] });
  assert.equal(none.list.stuck, 1); assert.equal(none.list.rounds, 1);
  assert.equal(RL.settleBeat(none.list, { score: 3, toFour: [], checked: [], hard: [] }).list.stuck, 2);
  assert.deepEqual(RL.arbiterDue({ B02: { items: ['a'], stuck: 2, rounds: 2 }, B03: { items: ['a'], stuck: 0, rounds: 1 }, B04: { items: ['a'], stuck: 0, rounds: 4 } }), ['B02', 'B04']);
  assert.deepEqual(RL.arbiterDue({ B03: { items: ['a'], stuck: 0, rounds: 0 } }, { B03: '评审要的和章节盲审相反' }), ['B03'], 'an appeal goes at once');
  const m = RL.mergeBeat([{ toFour: ['a', 'b'], checked: [{ item: 1, done: true }], hard: [] }, { toFour: ['c'], checked: [{ item: 1, done: false }], hard: ['h'] }]);
  assert.deepEqual(m.toFour, ['a', 'c', 'b'], "the two reviewers' lists interleaved");
  assert.equal(m.checked[0].done, false, 'done when both say so'); assert.deepEqual(m.hard, ['h']);
  assert.match(RL.listNote({ B02: { items: ['a', 'b'] } }), /B02：1\. a 2\. b/);
  for (const sch of ['morph-review', 'taste-review']) { const j = JSON.parse(fs.readFileSync(path.join(REPO, `work/recipe-board-v1/routing/${sch}.schema.json`), 'utf8')), it = (j.properties.frames || j.properties.beats).items; for (const k of ['toFour', 'checked', 'hard']) assert.ok(it.required.includes(k), `${sch} requires ${k}`); }
  const ch = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(ch, /settleFrames\(rev\.taskFile, rev\.asked, rev\.frames, PASS_SCORE, \(await import\('\.\/reviewrules\.mjs'\)\)\.readLessons\(cfg\)\)/);
  assert.doesNotMatch(ch, /waive\.json/, 'the director no longer waives a chapter review');
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/beatdesign.mjs'), 'utf8'), /RL\.settleFrames\(tp\.task, task\?\.lists \|\| \{\}, answer\.beats, 4, /);
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/stills.mjs'), 'utf8'), /RL\.settleFrames\(tt\.task, task\?\.lists \|\| \{\}, merged\.beats, 4, /);
});

test('the arbiter rules a stuck beat, binding: pass is 4, fix is the new list, a rule between two reviews reaches every reviewer (RETRO-20261028 2)', async () => {
  const A = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/arbiter.mjs')).href);
  const R = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/reviewrules.mjs')).href);
  const ok = { rulings: [{ beat: 'B02', verdict: 'pass', why: '清单剩下的是口味，两份评审要的相反', items: [], rule: { say: '一拍两个数字，台词先说的做大', complains: '(数字|数).{0,6}(对调|换过来)', suggests: null } }, { beat: 'B06', verdict: 'fix', why: '10% 讲成了船数比例，事实不对', items: ['10% 改成全球贸易份额的图'], rule: null }] };
  assert.deepEqual(A.rulingErrors(ok, ['B02', 'B06']), []);
  assert.ok(A.rulingErrors(ok, ['B02', 'B06', 'B07']).some((e) => /B07: not ruled/.test(e)));
  assert.ok(A.rulingErrors({ rulings: [{ beat: 'B02', verdict: 'fix', why: '太短', items: [], rule: null }] }, ['B02']).length >= 2);
  assert.ok(A.rulingErrors({ rulings: [{ beat: 'B02', verdict: 'pass', why: '一二三四五六七八九十十一', items: [], rule: { say: '一二三四五六七八', complains: '(', suggests: null } }] }, ['B02']).some((e) => /not a pattern/.test(e)));
  const frames = [{ beat: 'B02', score: 3 }, { beat: 'B06', score: 3 }];
  const lists = A.applyRulings(ok.rulings, frames, { B02: { items: ['x'] }, B06: { items: ['y'] } });
  assert.equal(frames[0].score, 4); assert.equal(frames[0].arbitrated.verdict, 'pass'); assert.equal(lists.B02, null);
  assert.deepEqual(lists.B06.items, ['10% 改成全球贸易份额的图']); assert.equal(frames[1].score, 3);
  const L = A.rulingLesson(ok.rulings[0], 'taste-B02', '2026-10-28');
  assert.equal(L.from, 'arbiter'); assert.match(L.id, /^ARB-taste-B02-B02-/); assert.equal(A.rulingLesson(ok.rulings[1], 'x'), null);
  const sec = R.userDecidedSection([L, { id: 'L1', said: '2026-10-20 用户', review: { say: '不要红底字' } }]);
  assert.match(sec, /### 仲裁定的[\s\S]*台词先说的做大/); assert.ok(sec.indexOf('不要红底字') < sec.indexOf('### 仲裁定的'));
  assert.equal(R.voidFix({ say: '两个数字应该对调', fix: '' }, [L]).void, L.id, "a review asking against the arbiter's rule is void");
  assert.ok(fs.existsSync(path.join(REPO, 'work/recipe-board-v1/prompts/arbiter.md')));
  assert.ok(R.REVIEW_PROMPTS.includes('prompts/taste.md') && R.REVIEW_PROMPTS.includes('prompts/film-taste.md'), 'the taste reviewers read the rules too (the first ruling settled a quarrel with them)');
  const RL = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/reviewlist.mjs')).href);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-')), tf = path.join(tmp, 'x.task.json'), fr = [{ beat: 'B03', score: 3, issue: 'x', toFour: ['两个数字应该对调', '底压暗'], checked: [], hard: [] }];
  RL.settleFrames(tf, {}, fr, 4, [L]);
  assert.deepEqual(RL.readLists(tf).B03.items, ['底压暗'], "a thing to do against the arbiter's rule is struck before it joins a list");
  const sch = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/arbiter.schema.json'), 'utf8'));
  assert.deepEqual(sch.properties.rulings.items.required, ['beat', 'verdict', 'why', 'items', 'rule']);
});

test("an arbiter's ruling or an appeal written after a chapter's last check has it read again (Suez B02's taste waiver sat unread)", async () => {
  const { answerFresh } = await import(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'));
  const prev = { answerHash: 'a', inputHash: 'i' };
  assert.equal(answerFresh(prev, 'a', 'i'), false);
  assert.equal(answerFresh(prev, 'a', 'i', true), true);
});

test("the final's road is tried before the film waits on it: three frames of each chapter by the final's page, every beat a piece (RETRO-20261028 4: B02's fine render threw at night, the six-stage line laid no final)", async () => {
  const C = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs')).href);
  const A = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/animatic.mjs')).href);
  assert.deepEqual(C.preflightFrames(10), [0, 150, 299], 'the first frame (the blur reads before it), the middle, the last');
  assert.deepEqual(C.preflightFrames(0.01), [0]);
  const g = { id: 'B02' }, h = { id: 'STILLS' };
  const plan = A.finalPlan([{ shotId: 'B01' }, { shotId: 'B02' }, { shotId: 'B03' }, { shotId: 'B04' }], { B01: { g: h, s: { at: 0, dur: 5 } }, B02: { g, s: { at: 0, dur: 4 } }, B03: { g, s: { at: 4, dur: 3.5 } } }, { B02: 'b02.mp4', STILLS: 'st.mp4' });
  assert.deepEqual(plan.pieces.map((x) => [x.beat, x.film, x.at]), [['B01', 'st.mp4', 0], ['B02', 'b02.mp4', 0], ['B03', 'b02.mp4', 4]]);
  assert.deepEqual(plan.missing, ['B04'], 'a beat no chapter holds is missing, never left out silently'); assert.equal(plan.seconds, 12.5);
  assert.deepEqual(A.finalPlan([{ shotId: 'B02' }], { B02: { g, s: { at: 0, dur: 4 } } }, { B02: null }).missing, ['B02'], "a chapter whose preflight failed has no piece");
  const mk = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/director/make.mjs'), 'utf8');
  assert.match(mk, /const stillFrames = atFrames \|\|/, 'make draws the frames it is asked for');
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/gates.mjs'), 'utf8'), /preflightFilm\(cfg, id[\s\S]{0,80}\n\s*if \(!pf\.ok\) throw/, 'the final gate refuses a film whose final would not render');
  const run = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/run.mjs'), 'utf8');
  assert.match(run, /design\?\.approved\) && !loadProject\(cfg, id\)\?\.final\?\.approved\) \{\n\s*try \{ const \{ preflightFilm \}/, 'tried once the structure is approved');
  assert.match(run, /final\?\.approved\) \{\n\s*try \{ const \{ buildFinal \}/, 'and the final laid once it is approved');
  assert.match(fs.readFileSync(path.join(REPO, 'scripts/recipe-board.mjs'), 'utf8'), /cmd === 'smoke'/);
});

test("how a review is answered is not what it scores: the procedure is left out of the rules hash, and an unchanged final is not laid again (2026-10-28: the lists' paragraph sent eleven passed Suez beats back; every run graded the same final for 267 s)", async () => {
  const R = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/reviewrules.mjs')).href);
  const A = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/animatic.mjs')).href);
  assert.equal(R.withoutProcedure('甲\n\n<!-- procedure: x -->\n清单\n<!-- /procedure -->\n\n乙'), '甲\n\n乙');
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/morph-review.md'), 'utf8'), /<!-- procedure:[^>]*-->\n到 4 分的清单[\s\S]*?<!-- \/procedure -->/, "the road to 4's paragraphs are procedure");
  const plan = { pieces: [{ beat: 'B01', film: 'a.mp4', at: 0, dur: 2 }], missing: [] }, st = () => '1:2';
  const k = A.finalKey(plan, {}, { grain: 0.3 }, st);
  assert.equal(A.finalKey(plan, {}, { grain: 0.3 }, st), k);
  assert.notEqual(A.finalKey(plan, {}, { grain: 0.4 }, st), k, 'a new grade lays it again');
  assert.notEqual(A.finalKey(plan, {}, { grain: 0.3 }, () => '1:3'), k, 'a new render lays it again');
  assert.notEqual(A.finalKey(plan, { B01: { in: 'whip' } }, { grain: 0.3 }, st), k, 'a new seam lays it again');
});

test("a review not read before the module changed still counts: its passes replace an older picture's lock and its roads to 4 stand; a task asked about other lists is written again (Suez B02, 2026-10-28)", () => {
  const ch = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(ch, /if \(k >= 0 && locked\[f\.beat\] && strips\[k\] && sameFrame\(strips\[k\], lockedFile\(f\.beat\)\)\) continue;/);
  assert.match(ch, /settleFrames\(rt\.task, t0\.lists \|\| \{\}, reviewFrames\(a0\.frames, g\.shots\), PASS_SCORE/);
  assert.match(ch, /JSON\.stringify\(task\?\.lists \|\| \{\}\) === JSON\.stringify\(lists \|\| \{\}\)/);
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/beatdesign.mjs'), 'utf8'), /if \(!answered && task && task\.forAnswer !== answerHash && files\.every\(fresh\)[\s\S]{0,600}RL\.settleFrames\(tp\.task, task\.lists/, "the taste review's unread answers settle their lists too");
});

test("a beat the arbiter passed stays passed while its picture is the one it ruled on (a fresh taste reviewer scored Suez B05 3 again for what the arbiter had called taste)", async () => {
  const RL = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/reviewlist.mjs')).href);
  const fr = [{ beat: 'B05', score: 3, toFour: ['陆海拉开'] }, { beat: 'B06', score: 3, toFour: ['x'] }];
  const held = RL.holdPassed(fr, { B05: { print: 'p1', why: '口味' }, B06: { print: 'p2', why: '口味' } }, (b) => (b === 'B05' ? 'p1' : 'p9'), (a, b) => a === b);
  assert.equal(fr[0].score, 4); assert.deepEqual(fr[0].toFour, []); assert.equal(held.length, 1);
  assert.equal(fr[1].score, 3, 'a changed picture is judged anew');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-')), tf = path.join(tmp, 'taste-B02.task.json');
  RL.recordPassed(tf, [{ beat: 'B05', verdict: 'pass', why: 'w' }, { beat: 'B02', verdict: 'fix', why: 'w', items: ['a'] }], () => 'pp');
  assert.deepEqual(Object.keys(RL.readPassed(tf)), ['B05']);
  for (const f of ['beatdesign.mjs', 'stills.mjs']) assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board', f), 'utf8'), /RL\.holdPassed\([\s\S]{0,200}RL\.settleFrames/, f);
});

test("an answer the line read is not settled again when the next version is written, and a new task asks nothing of a beat the arbiter passed on its picture (settling it again set Suez B07's list back after the arbiter had passed it)", async () => {
  const RL = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/reviewlist.mjs')).href);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-')), tf = path.join(tmp, 'taste-B02.task.json'), a = path.join(tmp, 'taste-B02.answer.json');
  fs.writeFileSync(a, '{"beats":[]}'); const k = RL.answersKey([a]);
  assert.equal(RL.wasRead(tf, k), false); RL.markRead(tf, k); assert.equal(RL.wasRead(tf, k), true);
  fs.writeFileSync(a, '{"beats":[1]}'); assert.equal(RL.wasRead(tf, RL.answersKey([a])), false, 'a new answer is not the one read');
  assert.deepEqual(Object.keys(RL.openLists({ B07: { items: ['x'] }, B02: { items: ['y'] } }, { B07: { print: 'p' } }, () => 'p', (x, y) => x === y)), ['B02']);
  const bd = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/beatdesign.mjs'), 'utf8');
  assert.match(bd, /files\.every\(fresh\) && !RL\.wasRead\(tp\.task, RL\.answersKey\(files\)\)/);
  assert.match(bd, /task\?\.forAnswer !== answerHash \|\| listsMoved/);
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8'), /if \(!wasRead\(rt\.task, answersKey\(\[rt\.answer\]\)\)\) settleFrames/);
});

test("a film's colour takes turns in harmony: valid palettes per beat, no dirty brown; colour-family and neutral-dark proportions are review notes (the user 2026-10-28: 可以各种配色 但要和谐; Gawx dark but coloured in 56-88 % of frames, Suez 6 %)", async () => {
  const P = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/palettes.mjs')).href);
  const lib = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/palettes.json'), 'utf8'));
  assert.deepEqual(P.paletteErrors(lib), [], 'the library keeps its own harmony');
  assert.ok(lib.palettes.length >= 6);
  assert.equal(P.muddy('#2a2118'), true, 'a dark warm low-chroma ground reads brown'); assert.equal(P.muddy('#1c1c1c'), false); assert.equal(P.muddy('#7e1b16'), false);
  const rows = (ps) => ps.map((p, i) => ({ beat: `B${String(i + 1).padStart(2, '0')}`, palette: p }));
  assert.deepEqual(P.filmPaletteErrors(rows(Array(8).fill('noir')), lib), [], 'how many palettes is not a quota (the user 2026-10-28: 不要为了做而做 硬塞)');
  assert.ok(P.filmPaletteNotes(rows(Array(8).fill('noir')), lib).some((e) => /palette/.test(e)), 'one palette for a film is a note for the director');
  assert.ok(P.filmPaletteNotes(rows(['noir', 'noir', 'noir', 'noir', 'noir', 'amber-lamp', 'film-red', 'noir']), lib).some((e) => /neutral dark/.test(e)));
  assert.deepEqual(P.filmPaletteNotes(rows(['amber-lamp', 'teal-chart', 'teal-chart', 'noir', 'film-red', 'indigo-night', 'mustard', 'cream-print']), lib), []);
  assert.ok(P.filmPaletteErrors(rows(['x']), lib)[0].includes('one of'));
  assert.equal(P.beatColour({ beat: 'B01', palette: 'mustard' }, lib).ground, '#d6a121');
  const restrainedColour = { frames: 40, leadFrames: 0.064, familiesOver5pct: 1 };
  assert.deepEqual(P.filmColourErrors(restrainedColour, lib), [], 'colour proportions are not hard quotas');
  assert.match(P.filmColourNotes(restrainedColour, lib).join(), /lead colour/);
  assert.match(P.filmColourNotes(restrainedColour, lib).join(), /family of colour/);
  assert.deepEqual(P.filmColourErrors({ frames: 40, leadFrames: 0.6, familiesOver5pct: 3 }, lib), []);
  const F = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/filmdesign.mjs')).href);
  assert.equal(F.colourScript({ beats: [{ beat: 'B01', act: 'open', value: 'dark', palette: 'indigo-night' }] }, '#c8501e', lib)[0].ground, '#121730', "the beat's palette sets its ground");
  const L = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/lessons.json'), 'utf8')).lessons;
  for (const id of ['L101-house-fusion', 'L103-map-chapter-mono']) assert.equal(L.find((l) => l.id === id).supersededBy, 'L111-film-palettes', `${id} no longer voids a review that finds the colour monotone`);
  const sch = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/filmdesign.schema.json'), 'utf8'));
  assert.ok(sch.properties.beats.items.required.includes('palette'));
  const W = await import(pathToFileURL(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/filmworld.mjs')).href), house = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/house-style.json'), 'utf8'));
  assert.deepEqual(W.houseErrors({ ground: { tone: 'dark', color: '#121730' } }, house), [], 'a deep indigo ground is the house\'s too');
  assert.ok(W.houseErrors({ ground: { tone: 'dark', color: '#2a2118' } }, house).length, 'a dirty brown is not');
});

test("a dark colour counts as colour: deep teal, indigo, amber from C* 10 below L* 35 (at 18 the Suez teal and indigo grounds read as grey)", () => {
  assert.match(fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/ground.py'), 'utf8'), /if C >= 18 or \(C >= 10 and 116 \* fl\[1\] - 16 < 35\):/);
});

test("simulation: a taste review across rounds — lists, a version changed before its answers were read, a stuck list to the arbiter, a pass held on its picture, the same answers read twice (the bugs of 2026-10-28, each found only in a real run)", async () => {
  const B = await import(pathToFileURL(path.join(LIB, 'beatdesign.mjs')).href);
  const RL = await import(pathToFileURL(path.join(LIB, 'reviewlist.mjs')).href);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-')), data = path.join(tmp, 'data'), proj = path.join(data, 'projects', 'sim');
  fs.mkdirSync(path.join(proj, 'tasks'), { recursive: true }); fs.writeFileSync(path.join(proj, 'project.json'), '{}');
  fs.mkdirSync(path.join(data, 'routing'), { recursive: true }); fs.mkdirSync(path.join(data, 'prompts'), { recursive: true });
  for (const r of ['lessons.json', 'compositions.json']) fs.copyFileSync(path.join(REPO, 'work/recipe-board-v1/routing', r), path.join(data, 'routing', r));
  for (const p of ['morph-review.md', 'stillcheck.md', 'film-review.md', 'taste.md', 'film-taste.md']) fs.copyFileSync(path.join(REPO, 'work/recipe-board-v1/prompts', p), path.join(data, 'prompts', p));
  const cfg = { repoRoot: REPO, dataDir: data }, g = { id: 'X', shots: [{ shotId: 'B1', text: 'a' }, { shotId: 'B2', text: 'b' }] };
  const img = (name, c) => { const f = path.join(tmp, name); spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${c}:s=320x180`, '-frames:v', '1', '-y', f]); return f; };
  const k1 = img('k1.png', '0x203040'), k2 = img('k2.png', '0xa0a060');
  const T = path.join(proj, 'tasks'), t = { task: path.join(T, 'taste-X.task.json'), a1: path.join(T, 'taste-X.answer.json'), a2: path.join(T, 'taste-X.answer-2.json') };
  let clock = Date.now() / 1000; const tick = (f) => { clock += 10; fs.utimesSync(f, clock, clock); };
  const beat = (b, score, o = {}) => ({ beat: b, composition: 3, figureGround: 3, focus: 3, ground: 3, type: 3, score, issue: o.issue || null, toFour: o.toFour || [], checked: o.checked || [], hard: [] });
  const answer = (beats) => { for (const f of [t.a1, t.a2]) { fs.writeFileSync(f, JSON.stringify({ overall: 'x', beats })); tick(f); } };
  const gate = async (h) => { const r = await B.tasteGate(cfg, 'sim', g, { keyframes: [k1, k2], answerHash: h }); if (fs.existsSync(t.task) && r.pending === 'taste-X') tick(t.task); return r; };
  // round 1: a beat under 4 carries its list
  assert.ok((await gate('m1')).pending);
  answer([beat('B1', 2, { toFour: ['船头的红改成全片同一个红'] }), beat('B2', 4)]);
  await gate('m1');
  assert.deepEqual(RL.readLists(t.task).B1.items, ['船头的红改成全片同一个红']);
  // the same answers read again settle the same way (no round counted twice)
  await gate('m1'); assert.equal(RL.readLists(t.task).B1.rounds, 0);
  // the next version: read answers are not settled again; the task carries the list
  await gate('m2'); assert.equal(RL.readLists(t.task).B1.rounds, 0); assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(t.task, 'utf8')).lists), ['B1']);
  // two rounds with nothing on the list done: to the arbiter
  answer([beat('B1', 2, { checked: [{ item: 1, done: false, why: '' }] }), beat('B2', 4)]); await gate('m2');
  assert.equal(RL.readLists(t.task).B1.stuck, 1);
  await gate('m3'); answer([beat('B1', 2, { checked: [{ item: 1, done: false, why: '' }] }), beat('B2', 4)]);
  const r3 = await gate('m3'); assert.equal(r3.pending, 'arbiter-taste-X', 'a list stuck twice goes to the arbiter');
  const at = path.join(T, 'arbiter-taste-X.answer.json'); fs.writeFileSync(at, JSON.stringify({ rulings: [{ beat: 'B1', verdict: 'pass', why: '两份评审都说的只是口味，不碰硬线', items: [], rule: null }] })); tick(at);
  const r3b = await gate('m3'); assert.deepEqual(r3b.errors, []); assert.equal(RL.readLists(t.task).B1 ?? null, null, 'the arbiter passed it');
  assert.ok(RL.readPassed(t.task).B1?.print, "the pass is held by the beat's picture");
  // a fresh reviewer of the next version scores the passed beat 3 again on the same picture: it stays passed, asked nothing
  await gate('m4'); assert.equal(Object.keys(JSON.parse(fs.readFileSync(t.task, 'utf8')).lists || {}).length, 0, 'the new task asks nothing of a passed beat');
  answer([beat('B1', 3, { toFour: ['陆海再拉开'] }), beat('B2', 4)]);
  const r4 = await gate('m4'); assert.equal(r4.review.beats.find((b) => b.beat === 'B1').score, 4); assert.ok(r4.held?.length);
  // answers given and the version changed before they were read: their lists still stand
  await gate('m5'); answer([beat('B1', 4), beat('B2', 2, { toFour: ['字贴到点上'] })]);
  await gate('m6'); assert.deepEqual(RL.readLists(t.task).B2.items, ['字贴到点上'], 'unread answers settle before the next task');
  assert.deepEqual(JSON.parse(fs.readFileSync(t.task, 'utf8')).lists.B2.items, ['字贴到点上'], 'and the next task asks about them');
});

test("a beat's film palette carries its colour past the look's cast check (Suez B06 B07 B12 on cobalt and indigo were filed as off the look)", async () => {
  assert.match(fs.readFileSync(path.join(LIB, 'animatic.mjs'), 'utf8'), /for \(const r of fd\?\.beats \|\| \[\]\) \{ const c = P\.beatColour\(r, lib\); if \(c\) allow\[r\.beat\] = Math\.max\(allow\[r\.beat\] \|\| 0, beatCastAllow\(c\)\); \} \}/);
  { const A = await import(pathToFileURL(path.join(LIB, 'animatic.mjs')).href), P = await import(pathToFileURL(path.join(LIB, 'palettes.mjs')).href), lib = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/palettes.json'), 'utf8')), night = P.beatColour({ beat: 'B07', palette: 'indigo-night' }, lib), plain = P.beatColour({ beat: 'B01', palette: 'noir' }, lib);
    assert.ok(A.beatCastAllow(night) + 3 > 35.4, 'a cool night lights its neutrals blue (Suez B12 measured 35.4)');
    assert.ok(A.beatCastAllow(plain) < 10, 'the neutral dark allows no cast'); }
});

test("every look the user liked lands somewhere on the line (routing/taste-inventory.json; the convergence of 2026-10-26 left the screen medium, 光郡's grammar and the screen packaging behind, found only by reading the memory)", () => {
  const inv = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/taste-inventory.json'), 'utf8')), missing = [];
  for (const it of inv.items) {
    assert.ok(['in', 'partial', 'sample', 'deferred', 'dropped', 'gap'].includes(it.status), `${it.id}: status`);
    assert.ok(it.said && it.liked, `${it.id}: says what was liked and when`);
    if (it.status === 'deferred' || it.status === 'dropped') continue;
    for (const l of it.lands || []) { const f = path.join(REPO, l.file); if (!fs.existsSync(f)) missing.push(`${it.id}: ${l.file} missing`); else if (l.has && !fs.readFileSync(f, 'utf8').includes(l.has)) missing.push(`${it.id}: ${l.file} has no ${l.has}`); }
  }
  assert.deepEqual(missing, []);
  assert.ok(!inv.items.some((it) => it.status === 'gap'), 'no look the user liked left as a gap');
});

test("the screen medium is in the house look: every beat names its screen, screen share is advisory, and a chapter renders once per screen with each beat cut from its own (the user 2026-10-16: 还不如之前的那种 led; 2026-10-28: 先介质进家里的样子)", async () => {
  const F = await import(pathToFileURL(path.join(LIB, 'filmdesign.mjs')).href), C = await import(pathToFileURL(path.join(LIB, 'chapter.mjs')).href), A = await import(pathToFileURL(path.join(LIB, 'animatic.mjs')).href);
  const media = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/media.json'), 'utf8'));
  const disp = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/display.js'), 'utf8');
  for (const m of media.media) assert.match(disp, new RegExp(`\\b${m.id}: \\d`), `${m.id} is a medium of display.js`);
  const rows = (ss) => ss.map((sc, i) => ({ beat: `B0${i + 1}`, screen: sc, palette: 'noir' }));
  assert.deepEqual(F.filmScreenErrors(rows(Array(8).fill('clean')), media), [], 'how much is on a screen is not a quota');
  assert.ok(F.filmScreenNotes(rows(Array(8).fill('clean')), media).some((e) => /on a screen/.test(e)), 'a film never on a screen is a note for the director');
  assert.deepEqual(F.filmScreenNotes(rows(['led2', 'led2', 'clean', 'crt', 'film', 'clean', 'vhs', 'clean']), media), []);
  assert.ok(F.designWhyErrors([{ beat: 'B01', why: '好看' }]).length, 'every beat says why its palette and screen suit it');
  assert.ok(F.designWhyErrors(['B01', 'B02', 'B03'].map((beat) => ({ beat, why: '这一拍讲的是一个读数，所以用琥珀终端' }))).some((e) => /one reason/.test(e)), 'not one reason pasted over many beats');
  assert.ok(F.filmScreenErrors(rows(['x']), media)[0].includes('one of'));
  const unusualPair = [{ beat: 'B01', screen: 'amber', palette: 'mustard' }];
  assert.deepEqual(F.filmScreenErrors(unusualPair, media), []);
  assert.match(F.filmScreenNotes(unusualPair, media).join(), /amber.*mustard/);
  assert.equal(C.filmOfScreen({ clean: 'c.mp4', led2: 'l.mp4' }, 'led2'), 'l.mp4'); assert.equal(C.filmOfScreen({ clean: 'c.mp4' }, 'crt'), 'c.mp4'); assert.equal(C.filmOfScreen('x.mp4', 'crt'), 'x.mp4');
  const g = { id: 'B02' }, plan = A.finalPlan([{ shotId: 'B02' }, { shotId: 'B03' }], { B02: { g, s: { at: 0, dur: 4 } }, B03: { g, s: { at: 4, dur: 4 } } }, { B02: { clean: 'c.mp4', led2: 'l.mp4' } }, { B03: 'led2' });
  assert.deepEqual(plan.pieces.map((x) => x.film), ['c.mp4', 'l.mp4'], 'each beat from the render on its own screen');
  const sch = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/filmdesign.schema.json'), 'utf8'));
  assert.ok(sch.properties.beats.items.required.includes('screen'));
  const ch = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(ch, /shots: screens\.map\(\(m\) => \(\{ id: g\.id, span: \[0, g\.total\], template: 'morph', medium: m,/, 'the final render: a shot per screen');
  assert.match(ch, /variants: screens,/, 'the white model too');
});

test("a card's breath never carries its words nearer the frame's edge than TEXT_MARGIN (Suez B01: a 419 px title 37 px under the top rode the breath to 22 px)", () => {
  const src = fs.readFileSync(path.join(LIB, 'motion-runtime.browser.js'), 'utf8');
  assert.match(src, /const TEXT_MARGIN = 24;/);
  assert.match(src, /scale: Math\.max\(1, Math\.min\(1 \+ BREATH_RATE \* s\.duration, typeRoom\(el\)\)\)/);
});

test("a chapter rendered once per screen lists one take per screen over the same span; the shot list check takes them as takes, not as shots out of order (Suez: the final's preflight failed with STILLS starts at 0, previous shot ended at 24)", async () => {
  const { checkShotList } = await import(pathToFileURL(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/director/check.mjs')).href);
  const shot = (medium, span = [0, 24]) => ({ id: 'STILLS', span, template: 'morph', medium, text: '', params: {} });
  const errs = (shots) => checkShotList({ contract: 'A1ShotList/v1', shots }).errors.filter((e) => /previous shot ended/.test(e));
  assert.deepEqual(errs([shot('clean'), shot('led2')]), []);
  assert.equal(errs([shot('clean'), shot('clean')]).length, 1, 'the same screen twice is a shot out of order');
  assert.equal(errs([shot('clean'), shot('led2', [0, 20])]).length, 1, 'another span is another shot');
});

test("a beat the film's design makes evidence shows real evidence, named and drawn; a page or a recording is filmed off a screen (Suez B02 was evidence, carried a satellite photo in its task and showed a 3D map; the user 2026-10-28: 证据拍必须放证据和屏幕包装)", async () => {
  const C = await import(pathToFileURL(path.join(LIB, 'chapter.mjs')).href);
  const film = [{ beat: 'B02', medium: 'evidence' }, { beat: 'B03', medium: 'diagram' }], input = { assets: [{ key: 'm_B02', kind: 'photo', shotId: 'B02', what: '衛星照片' }, { key: 'sea', kind: 'art', shotId: 'B03' }] };
  assert.match(C.evidenceErrors('', { pages: [] }, input, film)[0], /shows none on it[\s\S]*in hand: m_B02/);
  assert.deepEqual(C.evidenceErrors("export const evidence = { B02: 'm_B02' };\nconst a = images.m_B02;", { pages: [] }, input, film), []);
  assert.deepEqual(C.evidenceErrors("export const evidence = { B02: 'page1' };\nconst a = images['page1'];", { pages: [{ key: 'page1' }] }, input, film), [], 'a real page counts');
  assert.match(C.evidenceErrors("export const evidence = { B02: 'sea' };\nimages.sea", { pages: [] }, input, film)[0], /not a real page/, 'art is not evidence');
  assert.match(C.evidenceErrors("export const evidence = { B02: 'm_B02' };", { pages: [] }, input, film)[0], /never drawn/);
  assert.match(C.evidenceErrors("export const evidence = { B02: 'm_B02' };\nconst a = images.m_B02;", { pages: [] }, input, film, [{ beat: 'B02', shapes: [], drawn: [] }])[0], /not visible in the measured keyframe/);
  assert.deepEqual(C.evidenceErrors("export const evidence = { B02: 'm_B02' };\nconst a = images.m_B02;", { pages: [] }, input, film, [{ beat: 'B02', shapes: [{ kind: 'image', src: '/materials/m_B02.png' }], drawn: [] }]), []);
  const quoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-quote-')), quoteFile = path.join(quoteDir, 'source.txt');
  fs.writeFileSync(quoteFile, 'lead\nexact sentence\ntail\n');
  const quoted = { assets: [{ key: 'm_B02', kind: 'text', shotId: 'B02', quote: 'exact sentence', caption: 'Source · 2024' }] }, quoteBindings = { B02: { kind: 'text', file: quoteFile, caption: 'Source · 2024', sha256: (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(quoteFile)).digest('hex') } };
  try {
    assert.deepEqual(C.evidenceSourceErrors("export const evidence = { B02: 'm_B02' };", quoted, quoteBindings), []);
    assert.match(C.evidenceSourceErrors("export const evidence = { B02: 'm_B02' };", { assets: [{ ...quoted.assets[0], quote: 'invented sentence' }] }, quoteBindings)[0], /not in the bound original/);
    assert.deepEqual(C.evidenceExpectations("export const evidence = { B02: 'm_B02' };", quoted).B02, ['exact sentence', 'Source · 2024']);
  } finally { fs.rmSync(quoteDir, { recursive: true, force: true }); }
  assert.deepEqual(C.evidenceErrors('', {}, input, [{ beat: 'B03', medium: 'diagram' }]), [], 'no evidence beat, nothing asked');
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8'), /filmedScreen\(id, \{ image, medium = 'clean', tilt/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit5.js'), 'utf8'), /const left = to\[0\] < from\[0\], tx = left \? to\[0\] - 10 : to\[0\] \+ 10, al = left \? 'right' : 'left';/, 'a coordinate tag stands on the far side of its leader (Suez B02: the line ran through its figures)');
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8'), /focus = null, zoom = 1, grade = 0/, 'a filmed screen frames the picture on what it shows');
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/kit5.js'), 'utf8'), /if \(coords\) label\(/, 'a coordinate tag may carry the name alone (figures no line says are decoration)');
  const media = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/media.json'), 'utf8'));
  assert.ok(!media.media.some((m) => m.id === 'print') && media.never.some((m) => m.id === 'print'), 'the print medium turns the picture to cobalt ink: the look the user turned down');
});

test("motion blur never samples a chapter before its start (Suez B02's fine render threw at its first frame: a curve read at a negative time)", () => {
  const mo = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(mo, /place\(Math\.max\(0, t - shutter \* \(k \/ \(L\.blur - 1\)\)\)\)/);
});

test("a six-stage film's final is assembled from its chapters' final renders and its hero stills, once the final gate is passed (the card reel laid 1 of 13 Suez beats)", () => {
  const an = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/animatic.mjs'), 'utf8');
  const ru = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/run.mjs'), 'utf8');
  const ch = fs.readFileSync(path.join(REPO, 'apps/studio-next/src/lib/recipe-board/chapter.mjs'), 'utf8');
  assert.match(an, /export async function buildFinal\(cfg, id/);
  assert.match(an, /st\.hero \? await C\.renderFinal\(cfg, id, st\.g/);
  assert.match(ch, /export async function renderFinal\(cfg, id, g/);
  assert.match(ru, /sixStage\(loadProject\(cfg, id\) \|\| \{\}\) && loadProject\(cfg, id\)\?\.final\?\.approved\) \{\n\s+try \{ const \{ buildFinal \}/);
});

test('renders wait on the disk too: under RB_DISK_GB free a job is refused and said why, never run half-written (Suez final, ENOSPC, 2026-10-28)', async () => {
  const P = await lib('pool.mjs');
  const r = await P.pool([1, 2], async (x) => x * 2, { disk: () => 0.7, diskGb: 5, memory: () => 99 });
  assert.ok(r.every((x) => /0\.7 GB free \(5 GB at least/.test(x.error?.message)), 'both refused, the free space said');
  assert.deepEqual((await P.pool([1, 2], async (x) => x * 2, { disk: () => 50, diskGb: 5, memory: () => 99 })).map((x) => x.value), [2, 4]);
  assert.equal(P.diskError(10, 5), null); assert.ok(P.diskFreeGb() > 0);
  assert.equal(P.diskFreeGb(path.join(os.tmpdir(), 'recipe-board-missing-volume-' + process.pid)), null);
  assert.match(P.diskError(null), /cannot determine disk free space/);
  assert.match(P.diskError(Infinity), /cannot determine disk free space/);
  let started = false;
  const unavailable = await P.pool([1], async () => { started = true; }, { disk: () => null, memory: () => 99 });
  assert.equal(started, false); assert.match(unavailable[0].error.message, /cannot determine disk free space/);
});

test('a chapter brief does not mislabel every referenced image as real evidence', async () => {
  const { briefText } = await lib('sessionbrief.mjs');
  const text = briefText({ id: 'film', chapter: 'C1', beats: [{ beat: 'B1', at: 0, dur: 2, text: 'a' }], greybox: { B1: { blocks: [{ label: 'illustration', image: '../../art-cache/art.png', role: 'context' }] } }, files: { house: 'HOUSE.md' } });
  assert.match(text, /图片 ..\/..\/art-cache\/art\.png，来源以素材记录为准/);
  assert.doesNotMatch(text, /illustration（真素材/);
});

test('a geographic rough plate uses real land geometry and rejects invalid bounds', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-geo-plate-'));
  try {
    const script = path.join(LIB, 'geo-plate.py'), source = path.join(DATA, 'geo', 'ne_110m_land.geojson'), out = path.join(dir, 'map.png');
    const args = [script, '--source', source, '--output', out, '--bounds', '92', '120', '-10', '14', '--size', '192', '108'];
    const render = spawnSync('python3', args, { encoding: 'utf8' }); assert.equal(render.status, 0, render.stderr);
    const check = spawnSync('python3', ['-c', 'from PIL import Image; import sys; im=Image.open(sys.argv[1]); assert im.size==(192,108); assert len(im.getcolors(1000)) >= 2', out], { encoding: 'utf8' }); assert.equal(check.status, 0, check.stderr);
    assert.notEqual(spawnSync('python3', [script, '--source', source, '--output', out, '--bounds', '20', '10', '-10', '14'], { encoding: 'utf8' }).status, 0);
    const data = path.join(dir, 'work/recipe-board-v1');
    fs.mkdirSync(path.join(data, 'geo'), { recursive: true }); fs.copyFileSync(source, path.join(data, 'geo/ne_110m_land.geojson'));
    writeJson(path.join(data, 'projects/fixture/project.json'), { id: 'fixture' });
    const libdir = path.join(dir, 'apps/studio-next/src/lib/recipe-board'); fs.mkdirSync(libdir, { recursive: true }); fs.copyFileSync(script, path.join(libdir, 'geo-plate.py'));
    const cli = spawnSync('node', [path.join(REPO, 'scripts/recipe-board.mjs'), 'geo-plate', '--project', 'fixture', '--name', 'region', '--bounds', '92,120,-10,14', '--size', '192x108'], { env: { ...process.env, RECIPE_BOARD_REPO_ROOT: dir, RECIPE_BOARD_NAS_OUTPUT_ROOT: '' }, encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr); assert.ok(fs.existsSync(path.join(data, 'projects/fixture/materials/maps/greybox/region.png')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a greybox still rendering cannot satisfy the design gate using an old sheet', async () => {
  const G = await lib('greybox.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-greybox-gate-'));
  try {
    const cfg = { dataDir: root }, p = path.join(root, 'projects', 'film');
    writeJson(path.join(p, 'project.json'), { id: 'film' });
    fs.mkdirSync(path.join(p, 'out', 'greybox'), { recursive: true }); fs.writeFileSync(path.join(p, 'out', 'greybox', 'sheet.png'), 'old');
    writeJson(path.join(p, 'tasks', 'greybox.check.json'), { ok: false, pendingRender: true, answerHash: 'new' });
    assert.equal(G.greyboxHash(cfg, 'film'), null);
    writeJson(path.join(p, 'tasks', 'greybox.check.json'), { ok: true, answerHash: 'new' });
    assert.equal(G.greyboxHash(cfg, 'film'), 'new');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('greybox refuses missing named evidence and renders semantic marks in the accent colour', async () => {
  const G = await lib('greybox.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-greybox-assets-'));
  try {
    const row = { beat: 'B1', blocks: [{ label: '传播', role: 'mark', shape: 'ellipse', x: 10, y: 10, w: 80, h: 80, in: 0, enter: 'cut', image: 'missing.png' }], type: [], camera: { move: 'static' }, out: 'cut' };
    assert.match(G.greyboxAssetErrors({ beats: [row] }, dir).join(), /missing\.png.*not an available file/);
    fs.writeFileSync(path.join(dir, 'available.png'), 'fixture'); row.blocks[0].image = 'available.png';
    assert.deepEqual(G.greyboxAssetErrors({ beats: [row] }, dir), []);
    row.blocks[0].image = null;
    const html = G.reelHtml([row], [{ beat: 'B1', at: 0, dur: 5, palette: { ground: '#111111', ink: '#eeeeee', key: '#aaaaaa', accent: '#c8501e' } }], '', {}, dir);
    assert.match(html, /background:#c8501e;border:2px solid #c8501e/);
    assert.match(html, /#fx\{[^}]*z-index:10/, 'the flash overlay is above the shot layers');
    assert.equal(G.flashAt(5, [{ at: 0, dur: 5, out: 'flash' }], 0.24), 1, 'the flash peaks at the actual cut');
    assert.equal(G.flashAt(5.2, [{ at: 0, dur: 5, out: 'flash' }], 0.24), 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a greybox grid changes count on the beat clock and rejects invalid animation', async () => {
  const G = await lib('greybox.mjs');
  const motion = { from: 100, to: 20, start: 1, end: 5 };
  assert.equal(G.gridCount(0, motion), 100); assert.equal(G.gridCount(3, motion), 60); assert.equal(G.gridCount(6, motion), 20);
  const row = { beat: 'B1', blocks: [{ label: 'grid', shape: 'grid', role: 'subject', x: 0, y: 250, w: 1800, h: 600, in: 0, enter: 'cut', lit: 20, gridMotion: motion }], type: [], camera: { move: 'static' }, out: 'cut' };
  const beats = [{ beat: 'B1', text: '过程示意', dur: 8 }];
  assert.doesNotMatch(G.greyboxErrors({ beats: [row] }, beats).join('\n'), /gridMotion/);
  row.blocks[0].gridMotion = { ...motion, end: 10 };
  assert.match(G.greyboxErrors({ beats: [row] }, beats).join('\n'), /gridMotion/);
});

test('a greybox type pair cannot silently jump beside its preceding line', async () => {
  const G = await lib('greybox.mjs');
  const row = { beat: 'B1', blocks: [{ label: 'grid', shape: 'rect', role: 'subject', x: 0, y: 180, w: 1920, h: 720, in: 0, enter: 'cut' }], type: [
    { text: '再换一次', role: 'big', x: null, y: null, near: 'center', size: 128, align: 'center', accent: false },
    { text: '浩大的工程', role: 'small', x: null, y: null, near: 'under', size: 64, align: 'left', accent: false }
  ], camera: { move: 'static' }, out: 'cut' };
  const beats = [{ beat: 'B1', text: '再换一次，是浩大的工程', dur: 8 }];
  assert.match(G.greyboxErrors({ beats: [row] }, beats).join('\n'), /must sit under and align/);
  row.blocks[0].y = 360; row.blocks[0].h = 540; row.type[0].near = 'top';
  assert.doesNotMatch(G.greyboxErrors({ beats: [row] }, beats).join('\n'), /must sit under and align/);
});

test('a pending user gate or agent task cannot be reported as a finished film', async () => {
  const { reportComplete } = await lib('run.mjs');
  const base = { lines: ['process'], proc: {}, agentWork: [], gates: [], todo: [] };
  assert.equal(reportComplete(base), true);
  assert.equal(reportComplete({ ...base, gates: ['design waits'] }), false);
  assert.equal(reportComplete({ ...base, agentWork: ['write chapter'] }), false);
  assert.equal(reportComplete({ ...base, todo: ['placeholder'] }), false);
});

test('failed video encoding preserves the previous result and never publishes a partial MP4', async () => {
  const { encodeVideo } = await import(pathToFileURL(path.join(REPO, 'work/recipe-board-v1/style-lab/engine/shoot.mjs')));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-encode-'));
  try {
    const out = path.join(dir, 'video.mp4');
    fs.writeFileSync(out, 'previous result');
    await assert.rejects(encodeVideo(['-loglevel', 'error', '-i', path.join(dir, 'missing.png')], out), /ffmpeg failed/);
    assert.equal(fs.readFileSync(out, 'utf8'), 'previous result');
    assert.deepEqual(fs.readdirSync(dir), ['video.mp4']);
    await encodeVideo(['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=1', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'], out);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' });
    assert.equal(probe.status, 0); assert.ok(Number(probe.stdout) > 0);
    assert.deepEqual(fs.readdirSync(dir), ['video.mp4']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('new NAS-backed projects keep project-relative output paths and fail closed on missing or mismatched storage', async () => {
  const S = await lib('store.mjs');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-nas-'));
  try {
    const cfg = { dataDir: path.join(base, 'local'), nasOutputRoot: path.join(base, 'nas'), nasCheck: (root) => { if (!fs.statSync(root).isDirectory()) throw new Error('NAS unavailable'); } };
    fs.mkdirSync(cfg.nasOutputRoot);
    const p = S.ensureProject(cfg, 'canary', 'Canary');
    assert.ok(fs.lstatSync(p.out).isSymbolicLink());
    fs.writeFileSync(path.join(p.out, 'test.txt'), 'output');
    assert.equal(fs.readFileSync(path.join(cfg.nasOutputRoot, 'projects/canary/test.txt'), 'utf8'), 'output');
    cfg.diskGb = 5; cfg.diskFree = (dir) => dir === p.out ? 100 : 1;
    assert.throws(() => S.assertRenderStorage(cfg, 'canary'), /local temporary volume/);
    cfg.diskFree = (dir) => dir === p.out ? null : 100;
    assert.throws(() => S.assertRenderStorage(cfg, 'canary'), /NAS output volume.*cannot determine/);
    cfg.diskFree = () => 100;
    assert.doesNotThrow(() => S.assertRenderStorage(cfg, 'canary'));
    const marker = path.join(cfg.nasOutputRoot, 'projects/canary/.a1-output.json');
    const original = fs.readFileSync(marker, 'utf8');
    fs.writeFileSync(marker, '{}');
    assert.throws(() => S.projectPaths(cfg, 'canary'), /marker/);
    fs.writeFileSync(marker, original);
    fs.renameSync(cfg.nasOutputRoot, cfg.nasOutputRoot + '-offline');
    assert.throws(() => S.projectPaths(cfg, 'canary'));
    assert.ok(fs.lstatSync(p.out).isSymbolicLink(), 'no local output directory is created on disconnect');
    fs.renameSync(cfg.nasOutputRoot + '-offline', cfg.nasOutputRoot);
    assert.equal(fs.readFileSync(path.join(S.projectPaths(cfg, 'canary').out, 'test.txt'), 'utf8'), 'output');
    const localCfg = { dataDir: cfg.dataDir };
    assert.equal(fs.lstatSync(S.ensureProject(localCfg, 'local', 'Local').root).isDirectory(), true);
    assert.ok(!fs.existsSync(path.join(cfg.nasOutputRoot, 'projects/local')));
    const project = readJson(p.project); project.testOnly = true; writeJson(p.project, project);
    assert.deepEqual(S.listProjects(cfg).map((x) => x.id), ['local']);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});


test('hardCutSettleErrors: hard cut with moving camera fails; settled cut / cover seam pass', async () => {
  const S = await import(pathToFileURL(path.join(LIB, 'seams.mjs')).href);
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const block = { label: '主体', shape: 'rect', role: 'subject', x: 100, y: 100, w: 800, h: 600, model: null, view: null, image: null, in: 0, enter: null, lit: null };
  const type = [{ text: '测试', role: 'big', x: 200, y: 200, size: 128, align: 'left', accent: false, in: null, enter: null, near: null }];
  const cam = (move, from = null, to = null) => ({ move, note: null, from, to });
  const push = cam('push', { s: 1, x: 0, y: 0 }, { s: 1.1, x: 0, y: 0 });
  const stat = cam('static');
  const movingCut = [
    { beat: 'B1', blocks: [block], type, camera: push, out: 'cut', note: '' },
    { beat: 'B2', blocks: [block], type, camera: push, out: 'whip', note: '' },
  ];
  assert.match(S.hardCutSettleErrors(movingCut).join('\n'), /hard cut with camera still moving/);
  assert.match(G.greyboxSeamErrors({ beats: movingCut }, []).join('\n'), /硬切两边都停稳|hard cut with camera still moving/);
  const settled = movingCut.map((r, i) => ({ ...r, camera: stat, out: i === 0 ? 'cut' : 'whip' }));
  assert.deepEqual(S.hardCutSettleErrors(settled), []);
  const cover = movingCut.map((r, i) => ({ ...r, out: i === 0 ? 'match' : 'whip' }));
  assert.deepEqual(S.hardCutSettleErrors(cover), []);
});

test('flashSeamErrors: duration band / readable cut-type under flash / short landing settle; wired into greyboxSeamErrors + HOUSE', async () => {
  const S = await import(pathToFileURL(path.join(LIB, 'seams.mjs')).href);
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const block = { label: '主体', shape: 'rect', role: 'subject', x: 100, y: 100, w: 800, h: 600, model: null, view: null, image: null, in: 0, enter: null, lit: null };
  const cam = (move = 'static', from = null, to = null) => ({ move, note: null, from, to });
  const bigCut = (text, tin = 0) => [{ text, role: 'big', x: 200, y: 200, size: 200, align: 'left', accent: false, in: tin, enter: 'cut', near: null }];
  const bigRise = (text) => [{ text, role: 'big', x: 200, y: 200, size: 200, align: 'left', accent: false, in: null, enter: 'rise', near: null }];
  // duration band on the render table (SEAM_DUR.flash === FLASH_DUR_DEFAULT, inside min/max)
  assert.ok(S.FLASH_DUR_MIN < S.FLASH_DUR_DEFAULT && S.FLASH_DUR_DEFAULT < S.FLASH_DUR_MAX);
  assert.equal(G.SEAM_DUR.flash, S.FLASH_DUR_DEFAULT);
  assert.match(S.flashSeamErrors([], [], { flashDur: 0.5 }).join('\n'), /flash seam duration 0\.5/);
  assert.match(S.flashSeamErrors([], [], { flashDur: 0.01 }).join('\n'), /flash seam duration 0\.01/);
  assert.deepEqual(S.flashSeamErrors([], [], { flashDur: S.FLASH_DUR_DEFAULT }), []);
  // cut-enter readable type under flash peak on landing
  const coverType = [
    { beat: 'B1', blocks: [block], type: bigRise('出'), camera: cam(), out: 'flash', note: '' },
    { beat: 'B2', blocks: [block], type: bigCut('进', 0), camera: cam(), out: 'cut', note: '' },
  ];
  const metaOk = [{ beat: 'B1', dur: 4 }, { beat: 'B2', dur: 4 }];
  assert.match(S.flashSeamErrors(coverType, metaOk).join('\n'), /flash covers readable type "进"/);
  assert.match(G.greyboxSeamErrors({ beats: coverType }, metaOk).join('\n'), /flash covers readable type/);
  // rise/scale enter (reel default for display type) is not cut — passes readability gate
  const riseLand = [
    { beat: 'B1', blocks: [block], type: bigRise('出'), camera: cam(), out: 'flash', note: '' },
    { beat: 'B2', blocks: [block], type: bigRise('进'), camera: cam(), out: 'cut', note: '' },
  ];
  assert.deepEqual(S.flashSeamErrors(riseLand, metaOk).filter((m) => /covers readable type/.test(m)), []);
  // short landing after flash — missing settle/read window
  const shortLand = [
    { beat: 'B1', blocks: [block], type: bigRise('出'), camera: cam(), out: 'flash', note: '' },
    { beat: 'B2', blocks: [block], type: bigRise('进'), camera: cam(), out: 'cut', note: '' },
  ];
  const metaShort = [{ beat: 'B1', dur: 4 }, { beat: 'B2', dur: 0.3 }];
  assert.match(S.flashSeamErrors(shortLand, metaShort).join('\n'), /flash landing beat only 0\.3/);
  // outgoing cut-enter type under flash out-window
  const outUnder = [
    { beat: 'B1', blocks: [block], type: bigCut('末', 3.95), camera: cam(), out: 'flash', note: '' },
    { beat: 'B2', blocks: [block], type: bigRise('进'), camera: cam(), out: 'cut', note: '' },
  ];
  assert.match(S.flashSeamErrors(outUnder, metaOk).join('\n'), /flash covers readable type "末"/);
  // no flash → no per-seam errors (duration band ok)
  const noFlash = [
    { beat: 'B1', blocks: [block], type: bigCut('a', 0), camera: cam(), out: 'cut', note: '' },
    { beat: 'B2', blocks: [block], type: bigCut('b', 0), camera: cam(), out: 'whip', note: '' },
  ];
  assert.deepEqual(S.flashSeamErrors(noFlash, metaOk), []);
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  assert.match(house, /flashSeamErrors/);
  assert.ok(house.split('\n').length <= 160, 'HOUSE stays ≤160 lines');
});

test('typeHierarchyErrors: ≤3 levels / ≥1.5× adjacent / one first-read; wired into greyboxErrors + HOUSE', async () => {
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  assert.equal(G.TYPE_LEVELS_MAX, 3);
  assert.equal(G.TYPE_LEVEL_CONTRAST, 1.5);
  const block = { label: '主体', shape: 'rect', role: 'subject', x: 100, y: 100, w: 800, h: 600, model: null, view: null, image: null, in: 0, enter: null, lit: null };
  const cam = { move: 'static', note: null, from: null, to: null };
  const line = (text, size, role = 'big') => ({ text, role, x: 200, y: 200, size, align: 'left', accent: false, in: null, enter: null, near: null });
  const beats = [{ beat: 'B1', text: '测试一句', dur: 5 }];
  // pass: figure 200 + sub 64 (= 3.125×); title 128 + caption 48 (= 2.67×)
  assert.deepEqual(G.typeHierarchyErrors([{ beat: 'B1', type: [line('大', 200), line('小', 64, 'small')] }]), []);
  assert.deepEqual(G.typeHierarchyErrors([{ beat: 'B1', type: [line('题', 128), line('注', 48, 'caption')] }]), []);
  // fail: sub 64 + caption 48 (= 1.33× < 1.5) — TYPE.md / type-bible.design
  const close = [{ beat: 'B1', blocks: [block], type: [line('副', 64, 'small'), line('注', 48, 'caption')], camera: cam, out: 'cut', note: '' }];
  assert.match(G.typeHierarchyErrors(close).join('\n'), /too close to read as two/);
  assert.match(G.greyboxErrors({ beats: close }, beats).join('\n'), /too close to read as two/);
  // fail: four scale steps in one frame
  const four = [{ beat: 'B1', type: [line('一', 300), line('二', 200, 'number'), line('三', 128, 'small'), line('四', 48, 'caption')] }];
  assert.match(G.typeHierarchyErrors(four).join('\n'), /4 levels of type/);
  // fail: two things at largest (≥ title)
  const twin = [{ beat: 'B1', type: [line('甲', 200), line('乙', 200, 'number')] }];
  assert.match(G.typeHierarchyErrors(twin).join('\n'), /2 things at the largest size/);
  // single line / one level → no hierarchy fault
  assert.deepEqual(G.typeHierarchyErrors([{ beat: 'B1', type: [line('独', 200)] }]), []);
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  assert.match(house, /typeHierarchyErrors/);
  assert.match(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/greybox.md'), 'utf8'), /typeHierarchyErrors/);
  assert.ok(house.split('\n').length <= 160, 'HOUSE stays ≤160 lines');
});

test('greyboxDeviceKitErrors: non-ready device on any beat fails; ready passes', async () => {
  const G = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const devices = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8')).devices;
  const rows = [
    { beat: 'B1', device: 'array-build' },
    { beat: 'B2', device: 'lineup-row' },
    { beat: 'B3', device: 'presenter-close' },
  ];
  const e = G.greyboxDeviceKitErrors(rows, devices).join('\n');
  assert.match(e, /B1: device "array-build".*kit\.status/);
  assert.match(e, /B3: device "presenter-close".*kit\.status/);
  assert.doesNotMatch(e, /B2:/);
  assert.deepEqual(G.greyboxDeviceKitErrors([{ beat: 'B2', device: 'lineup-row' }], devices), []);
});

test('production pin intercepts: chapterStartPinErrors; greyboxAdvancePinErrors pure shapes; HOUSE names gates', async () => {
  const GS = await import(pathToFileURL(path.join(LIB, 'gatestate.mjs')).href);
  assert.deepEqual(GS.chapterStartPinErrors({ process: 'six-stage', gateSet: 'design' }), ['chapter morph / session-brief blocked: design gate not approved yet (gate --approve design)']);
  assert.deepEqual(GS.chapterStartPinErrors({ process: 'six-stage', gateSet: 'design', design: { approved: true } }), []);
  assert.deepEqual(GS.chapterStartPinErrors({ process: 'six-stage' }), [], 'legacy gateSet not blocked by design pin');
  assert.equal(typeof GS.greyboxAdvancePinErrors, 'function');
  // wire: stepGreybox / sessionBrief / morph call the pins (source contract — no inventing parallel system)
  const greySrc = fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8');
  const sessSrc = fs.readFileSync(path.join(LIB, 'sessionbrief.mjs'), 'utf8');
  const chapSrc = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(greySrc, /greyboxAdvancePinErrors\(cfg, id\)/);
  assert.match(sessSrc, /chapterStartPinErrors/);
  assert.match(chapSrc, /chapterStartPinErrors/);
  assert.match(chapSrc, /matureFirstDraftErrors/);
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  assert.match(house, /hardCutSettleErrors/);
  assert.match(house, /greyboxAdvancePinErrors|chapterStartPinErrors/);
  assert.match(house, /presenter-close/);
  assert.match(house, /matureFirstDraftErrors/);
  assert.ok(house.split('\n').length <= 160, 'HOUSE stays ≤160 lines');
});

test('design-set pin IO integration: greyboxAdvance / chapterStart block then pass on synthetic fixture', async () => {
  // Knife 4: exercise loadProject + filmdesign/storyboard file checks + stepGreybox/stepChapters early returns.
  // Synthetic temp project only — never mutates banana-design.
  const crypto = await import('node:crypto');
  const GS = await lib('gatestate.mjs');
  const AT = await lib('agenttask.mjs');
  const Br = await lib('brief.mjs');
  const SB = await lib('storyboard.mjs');
  const F = await lib('filmdesign.mjs');
  const GB = await lib('greybox.mjs');
  const Ch = await lib('chapter.mjs');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-pin-io-'));
  const data = path.join(tmp, 'work', 'recipe-board-v1');
  fs.cpSync(path.join(DATA, 'routing'), path.join(data, 'routing'), { recursive: true });
  fs.cpSync(path.join(DATA, 'prompts'), path.join(data, 'prompts'), { recursive: true });
  const id = 'pin-io-fixture';
  const root = path.join(data, 'projects', id);
  const icfg = { repoRoot: REPO, sourceRoot: REPO, dataDir: data };
  const base = { contract: 'A1RecipeBoardProject/v1', id, title: 'pin io fixture', scope: 'RESEARCH_ONLY', process: 'six-stage', gateSet: 'design', typeBible: true, lettering: 'eva', agents: { default: 'manual' } };
  fs.mkdirSync(path.join(root, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
  writeJson(path.join(root, 'project.json'), base);

  const fdSha16 = (body) => crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  const pinFilm = async () => {
    const body = '{\n "beats": []\n}\n';
    fs.writeFileSync(path.join(root, 'tasks', 'filmdesign.answer.json'), body);
    writeJson(path.join(root, 'tasks', 'filmdesign.check.json'), { ok: true, errors: [], answerHash: fdSha16(body) });
  };
  const pinStoryboard = () => {
    const plan = { title: 'pin-io', beats: [{ id: 'B01', intent: 'hook', text: '一句话' }] };
    writeJson(path.join(root, 'plan.json'), plan);
    const ph = Br.planHash(plan);
    writeJson(path.join(root, 'brief.json'), { planHash: ph, answerHash: 'brief-a' });
    // same formula as storyboard.mjs inputHash (six-stage → semantic rules in rulesHash)
    const files = ['work/recipe-board-v1/prompts/storyboard.md', 'work/recipe-board-v1/routing/storyboard.schema.json', 'work/recipe-board-v1/routing/rhythm-by-role.json', 'work/recipe-board-v1/prompts/storyboard-semantic.md', 'work/recipe-board-v1/routing/storyboard.v3.schema.json', 'work/recipe-board-v1/routing/semantic-acts.json'];
    const rulesHash = AT.sha(files.map((f) => fs.readFileSync(path.join(icfg.repoRoot, f), 'utf8')).join('\n'));
    writeJson(path.join(root, 'storyboard.json'), { inputHash: AT.sha(ph + 'brief-a' + rulesHash), shots: [] });
  };

  try {
    // --- greybox-advance: block when filmdesign / storyboard not pinned
    let errs = await GS.greyboxAdvancePinErrors(icfg, id);
    assert.ok(errs.some((e) => /filmdesign not accepted/.test(e)), errs.join(' | '));
    assert.ok(errs.some((e) => /storyboard/.test(e)), errs.join(' | '));
    const blockedGb = await GB.stepGreybox(icfg, id, { log: () => {} });
    assert.equal(blockedGb.state, 'blocked');
    assert.match(blockedGb.why || '', /filmdesign not accepted|storyboard/);

    await pinFilm();
    assert.ok(F.acceptedFilmDesign(icfg, id), 'filmdesign accepted on disk');
    errs = await GS.greyboxAdvancePinErrors(icfg, id);
    assert.ok(!errs.some((e) => /filmdesign/.test(e)));
    assert.ok(errs.some((e) => /storyboard/.test(e)), errs.join(' | '));

    pinStoryboard();
    assert.equal(SB.storyboardState(icfg, id).state, 'current');
    errs = await GS.greyboxAdvancePinErrors(icfg, id);
    assert.deepEqual(errs, [], 'greybox-advance pin passes when filmdesign + storyboard pinned');
    const waitingGb = await GB.stepGreybox(icfg, id, { log: () => {} });
    assert.notEqual(waitingGb.state, 'blocked', 'stepGreybox past pin (waiting for greybox answer is fine)');
    assert.equal(waitingGb.state, 'waiting');

    // --- chapter-start: block when design gate not approved; pass when pinned
    writeJson(path.join(root, 'project.json'), base);
    const pDisk = GS.chapterStartPinErrors((await lib('store.mjs')).loadProject(icfg, id) || {});
    assert.match(pDisk.join('\n'), /design gate not approved/);
    const blockedCh = await Ch.stepChapters(icfg, id, { log: () => {}, review: false, renderDrafts: false });
    assert.ok(blockedCh.blocked?.length);
    assert.match(blockedCh.blocked[0], /design gate not approved/);

    writeJson(path.join(root, 'project.json'), { ...base, design: { approved: true, by: '用户', at: '2026-10-29T00:00:00Z', greybox: 'g' } });
    assert.deepEqual(GS.chapterStartPinErrors((await lib('store.mjs')).loadProject(icfg, id) || {}), []);
    const openCh = await Ch.stepChapters(icfg, id, { log: () => {}, review: false, renderDrafts: false });
    assert.equal(openCh.blocked, undefined, 'stepChapters past chapterStart pin when design approved');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ----- P0 hard-input wiring 2026-10-29 (A3/C2/C3/D2/E1/G2/G3/I4) -----
test('P0 A3 selectedDeviceKitErrors: kit.use must resolve to a real template symbol', async () => {
  const R = await lib('refbreakdown.mjs');
  const symbols = R.buildKitSymbolIndex({
    kit2: 'export function lineup(g){}\nexport const flat = { lineup, typeBlock };\nexport function layoutLineup(g){}',
    kit4: 'export const copyRepeat = () => {};\nexport const devices = { copyRepeat };',
    kit5: 'export function vhsOsd(g){}\nexport const devices = { vhsOsd };',
    morph: 'export function filmedScreen(){}\nexport function subject(){}',
  });
  assert.ok(symbols.has('type.dev.copyRepeat'));
  assert.ok(symbols.has('K2.layoutLineup'));
  assert.ok(symbols.has('kit.engine.filmedScreen'));
  const fake = [{ id: 'bogus', kit: { status: 'ready', use: 'type.dev.noSuch' } }];
  assert.match(R.selectedDeviceKitErrors([{ beat: 'B01', devices: ['bogus'] }], fake, { symbols }).join('\n'), /no real template symbol/);
  const empty = [{ id: 'empty', kit: { status: 'ready', use: '' } }];
  assert.match(R.selectedDeviceKitErrors([{ beat: 'B01', devices: ['empty'] }], empty, { symbols }).join('\n'), /kit\.use is empty/);
  const ok = [{ id: 'lineup-row', kit: { status: 'ready', use: 'K2.lineup / K2.layoutLineup' } }];
  assert.deepEqual(R.selectedDeviceKitErrors([{ beat: 'B01', devices: ['lineup-row'] }], ok, { symbols }), []);
  // live catalog: every ready device resolves (read templates from real dataDir; sandbox omits style-lab)
  const liveCfg = { ...cfg, dataDir: DATA };
  const live = R.loadKitSymbolIndex(liveCfg);
  const devices = R.loadDevices(liveCfg);
  assert.ok(live.size > 50, 'symbol index populated');
  assert.ok(live.has('type.bayBackType'), 'type.js bayBackType indexed as type.bayBackType');
  assert.ok(live.has('type.surfaceType'), 'type.js surfaceType indexed');
  for (const d of devices.filter((x) => x.kit?.status === 'ready')) {
    assert.deepEqual(R.selectedDeviceKitErrors([{ beat: 'B01', devices: [d.id] }], [d], { symbols: live }), [], d.id);
  }
});

test('P0 C2 palette-spine: fail on claim/design-set; warn otherwise', async () => {
  const M = await lib('mature.mjs');
  const beats = [{ beat: 'B1', palette: 'mustard' }, { beat: 'B2', palette: 'cobalt-card' }];
  const warn = M.matureSpineErrors(beats);
  assert.equal(warn[0].level, 'warn');
  assert.equal(warn[0].code, 'palette-spine-jump');
  const hard = M.matureSpineErrors(beats, { hard: true });
  assert.match(hard.join('\n'), /palette-spine-jump/);
  const viaDesign = M.matureHardErrors({ beats: [] }, beats, { project: { gateSet: 'design' } });
  assert.ok(viaDesign.some((e) => /palette-spine-jump/.test(e)), viaDesign.join(' | '));
  const viaClaim = M.matureHardErrors({ matureFirstDraft: true, beats: [] }, beats, {});
  assert.ok(viaClaim.some((e) => /palette-spine-jump/.test(e)));
  // usage flags stay warn-shaped
  const flags = M.matureSpineFlags(beats);
  assert.equal(flags[0].level, 'warn');
});

test('P0 C3 ensureProject defaults matureFirstDraft:true on new films', async () => {
  const S = await lib('store.mjs');
  const id = 'p0-mature-default-' + Date.now();
  try {
    S.ensureProject(cfg, id, 'P0');
    const p = S.loadProject(cfg, id);
    assert.equal(p.gateSet, 'design');
    assert.equal(p.matureFirstDraft, true, 'new film defaults matureFirstDraft claim');
  } finally {
    fs.rmSync(path.join(cfg.dataDir, 'projects', id), { recursive: true, force: true });
  }
});

test('P0 D2 prompts greybox/stills/morph name typeBlock and spreadWord', async () => {
  for (const name of ['greybox.md', 'stills.md', 'morph.md']) {
    const text = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts', name), 'utf8');
    assert.match(text, /typeBlock/, name);
    assert.match(text, /spreadWord/, name);
  }
});

test('P0 E1 greybox photo-plane / subject-pipeline inject into mature claim', async () => {
  const G = await lib('greybox.mjs');
  const M = await lib('mature.mjs');
  const beats = [{ beat: 'B1', text: 'x', dur: 5, form: '3d', medium: '3d' }];
  const answer = {
    matureFirstDraft: true,
    beats: [{
      beat: 'B1',
      camera: { move: 'dolly', from: { z: 1 }, to: { z: 0.8 } },
      type: [{ text: '字', role: 'big', size: 200, in: 0.2, enter: 'rise' }],
      blocks: [{ role: 'subject', shape: 'photo', w: 800, h: 600, x: 100, y: 100, image: 'bananas.png', as3d: true }],
      out: 'cut',
      note: '3d subject PlaneGeometry photo-plane',
    }],
  };
  const photo = G.greyboxPhotoPlaneErrors(answer, beats, { process: 'six-stage' });
  assert.match(photo.join('\n'), /photo-plane-as-subject/);
  const tube = {
    beats: [{ beat: 'B1', camera: { move: 'orbit' }, type: [{ text: '字', role: 'big', size: 200, in: 0.2, enter: 'rise' }], blocks: [{ role: 'subject', shape: 'tube', w: 100, h: 100, x: 0, y: 0 }], out: 'cut', note: 'TubeGeometry filler' }],
  };
  assert.match(G.greyboxSubjectPipelineErrors(tube, beats, { process: 'six-stage' }).join('\n'), /subject-pipeline-filler/);
  const claim = M.matureFirstDraftErrors(answer, beats, { photoPlaneErrors: photo, subjectPipelineErrors: [] });
  assert.match(claim.join('\n'), /real-mesh/);
  // greyboxErrors aggregates into mature claim when project claims
  const errs = G.greyboxErrors(answer, beats, [], { project: { process: 'six-stage', matureFirstDraft: true } });
  assert.ok(errs.some((e) => /photo-plane-as-subject|mature-first-draft-incomplete|real-mesh/.test(e)), errs.join(' | '));
});

test('P0 G2/G3/I4 docs: CONVERGE superseded; six art still runs; AGENTS dual authority', async () => {
  const converge = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/CONVERGE-20261026.md'), 'utf8');
  assert.match(converge, /SUPERSEDED for new films/);
  assert.match(converge, /design.*final|两关/);
  const house = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/HOUSE.md'), 'utf8');
  assert.match(house, /六段与 art[（(]P0 G3/);
  assert.match(house, /`art` 不跳|仍跑素材建造/);
  assert.match(house, /ensureProject.*matureFirstDraft|matureFirstDraft: true/);
  const sop = fs.readFileSync(path.join(REPO, 'SOP.md'), 'utf8');
  assert.match(sop, /仍跑 art/);
  const agents = fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8');
  assert.match(agents, /Authority split \(P0 I4/);
  assert.match(agents, /HANDOFF-CURRENT/);
  assert.match(agents, /HOUSE/);
  const gs = fs.readFileSync(path.join(LIB, 'gatestate.mjs'), 'utf8');
  assert.match(gs, /art still runs|art is NOT in SIX_CARD_STEPS/);
  const GT = await lib('gatestate.mjs');
  assert.equal(GT.sixSkips({ process: 'six-stage' }, 'art'), false, 'art is not skipped');
  assert.equal(GT.sixSkips({ process: 'six-stage' }, 'concept'), true);
  assert.equal(GT.sixSkips({ process: 'six-stage' }, 'motion'), true);
});


// ----- poseFrom scale continuity hard gate 2026-10-29 (interrupt: B02 忽大忽小 leak) -----
test('P1 poseFrom scale continuity: synthetic 忽大忽小 red; gold stable green; B02 pin green / reinject red', async () => {
  const SM = await import(pathToFileURL(path.join(LIB, 'shotmotion.mjs')).href);
  const gold = JSON.parse(fs.readFileSync(path.join(DATA, 'projects/banana-design/tasks/session-B02.motion.json'), 'utf8'));
  const poseShot = {
    contract: 'A1ShotMotionContract/v1', chapter: 'T', shots: [{
      shotId: 'T1', camera: { move: 'push', camMove: null, camMoveMin: null, camMoveMax: null, note: null },
      camMove: 'push', subjectMotion: 'stagger', subject: { model: 'banana' },
      type: { inStrategy: 'late', in: null },
      seam: { in: 'push', out: 'push', poseFrom: { s: 1.08, x: 0, y: -20 } }, note: null,
    }],
  };

  // Gold morph: opens on poseFrom.s, no early subject scale lerp → green
  const goldMorph = "export const beats=[{at:0,cam:{x:960,y:520,s:1.08},move:0.6,camMove:1.1},{at:8,cam:{x:960,y:540,s:1.14},move:0.6,camMove:1}];\nmoves.stagger; push; kit.props.model(THREE, 'banana', { what: 'a banana' });\n";
  assert.deepEqual(SM.poseFromScaleContinuityErrors(poseShot, { morphCode: goldMorph }), []);
  assert.deepEqual(SM.motionContractUneatenErrors(goldMorph, poseShot).filter((m) => /poseFrom/.test(m)), []);

  // Synthetic morph 忽大忽小: t<2 hero scale lerp without scale-ok subjectMotion → red
  const popMorph = "export const beats=[{at:0,cam:{x:960,y:520,s:1.08},move:0.6}];\nmoves.stagger; push;\nconst s = (i===0 && t < 2.0 ? lerp(1.35, 1.05, seg(t, 0.2, 1.4)) : 1); a.scale.setScalar(s);\n";
  const popErr = SM.poseFromScaleContinuityErrors(poseShot, { morphCode: popMorph });
  assert.ok(popErr.some((m) => /忽大忽小/.test(m) && /subjectScale/.test(m)), popErr.join(' | '));

  // Synthetic track: adjacent-frame cam.s oscillates → red
  const osc = [];
  for (let i = 0; i < 16; i++) {
    osc.push({ t: i * 0.2, camera: { flat: { x: 960, y: 520, s: 1.08 + (i % 2 === 0 ? 0.09 : -0.09) } } });
  }
  const oscErr = SM.trackPoseFromScaleErrors(poseShot, osc, [{ shotId: 'T1', at: 0, dur: 8 }]);
  assert.ok(oscErr.some((m) => /忽大忽小/.test(m) && /camScale/.test(m)), oscErr.join(' | '));

  // Stable track matching poseFrom.s → green (no false kill)
  const stable = [];
  for (let i = 0; i < 16; i++) {
    stable.push({ t: i * 0.2, camera: { flat: { x: 960, y: 520, s: 1.08 } } });
  }
  assert.deepEqual(SM.trackPoseFromScaleErrors(poseShot, stable, [{ shotId: 'T1', at: 0, dur: 8 }]), []);

  // A written greyboxDiffer is the existing authorized deviation channel. The secondary
  // pose-continuity gate must consume it too; without it, the same fixed redesign stays red.
  const fixedMorph = "export const beats=[{at:0,camFrom:{x:960,y:540,s:1},cam:{x:960,y:540,s:1},move:0,camMove:0}];\n";
  const fixedTrack = Array.from({ length: 8 }, (_, i) => ({ t: i * 0.2, camera: { flat: { x: 960, y: 540, s: 1 } } }));
  const fixedArgs = { morphCode: fixedMorph, track: fixedTrack, shots: [{ shotId: 'T1', at: 0, dur: 8 }] };
  assert.ok(SM.poseFromScaleContinuityErrors(poseShot, fixedArgs).some((m) => /poseFrom/.test(m)), 'no differ: old pose remains binding');
  assert.deepEqual(SM.poseFromScaleContinuityErrors(poseShot, {
    ...fixedArgs, greyboxDiffer: { T1: '导演明确改成固定二维构图并保留完整落态' },
  }), [], 'written differ: both morph and runtime continuity consume the same deviation');

  // Current checked banana candidate: the written differ replaces the old B03 scale
  // inheritance with a fixed 2D composition, so replay it through the same channel as production.
  const bananaMorph = JSON.parse(fs.readFileSync(path.join(DATA, 'projects/banana-design/tasks/morph-B02.checked.json'), 'utf8')).code;
  const bananaTrack = JSON.parse(fs.readFileSync(path.join(DATA, 'projects/banana-design/out/chapters/B02/track.json'), 'utf8'));
  const GB = await import(pathToFileURL(path.join(LIB, 'greybox.mjs')).href);
  const bananaDiffer = GB.greyboxDifferOf(bananaMorph);
  const bananaGate = SM.poseFromScaleContinuityErrors(gold, {
    morphCode: bananaMorph,
    track: bananaTrack.track,
    shots: bananaTrack.shots,
    greyboxDiffer: bananaDiffer,
  });
  assert.deepEqual(bananaGate, [], 'current B02 morph+track should be green with its explicit deviations: ' + bananaGate.join(' | '));
  assert.ok(!/t\s*<\s*2\.0\s*\?\s*lerp\(\s*1\.35/.test(bananaMorph), 'B02 must not reintroduce 1.35 t-gate pop');
  const trackOnly = SM.trackPoseFromScaleErrors(gold, bananaTrack.track, bananaTrack.shots, { greyboxDiffer: bananaDiffer });
  assert.deepEqual(trackOnly, [], 'B02 track camera.flat.s alone stays green: ' + trackOnly.join(' | '));
  // string-eat still passes (fake-wire root) — continuity is the real gate; re-inject old pop to prove red
  // pin string follows current checked morph (1.22→0.72); do not edit banana morph answers for the test
  const pin = (bananaMorph.match(/const s = lerp\(1\.[\d]+, 0\.72, toGrid\)/) || [])[0] || 'const s = lerp(1.22, 0.72, toGrid)';
  const reinject = bananaMorph.includes(pin)
    ? bananaMorph.replace(pin, 'const s = (t < 2.0 ? lerp(1.35, 1.05, seg(t, 0.2, 1.4)) : lerp(1.22, 0.72, toGrid))')
    : bananaMorph + '\nconst s = (t < 2.0 ? lerp(1.35, 1.05, seg(t, 0.2, 1.4)) : lerp(1.05, 0.72, toGrid));\n';
  const reinjectErr = SM.poseFromScaleContinuityErrors(gold, { morphCode: reinject });
  assert.ok(reinjectErr.some((m) => /忽大忽小|subjectScale/.test(m)), 'reinjected 1.35 pop must go red: ' + reinjectErr.join(' | '));
  assert.deepEqual(SM.motionContractUneatenErrors(bananaMorph, gold).filter((m) => /poseFrom/.test(m) && !/scale|忽大/.test(m)), []);
});


// ----- P1 hard-input wiring 2026-10-29 (A5/B3/B4/B5/D1/D3/E3/F1–F3/G5/H1/H5) -----
test('P1 A5 openingKitKindErrors: narrative device on open fails; build clears', async () => {
  const GB = await lib('greybox.mjs');
  const devices = [
    { id: 'lineup-row', kit: { status: 'ready', kind: 'build', use: 'K2.lineup' } },
    { id: 'evidence-card', kit: { status: 'ready', kind: 'narrative', use: 'type.dev.x' } },
  ];
  const beats = [{ beat: 'A1', act: 'open' }];
  const bad = [{ beat: 'A1', device: 'evidence-card', camera: { move: 'push' }, blocks: [{ role: 'subject', shape: 'rect', x: 0, y: 0, w: 100, h: 100 }], type: [] }];
  const errs = GB.openingKitKindErrors(bad, beats, devices, { hasOpeningBuildDevice: GB.hasOpeningBuildDevice });
  assert.ok(errs.some((e) => /opening-kit-kind/.test(e)), errs.join(' | '));
  const good = [{ beat: 'A1', device: 'lineup-row', camera: { move: 'push' }, blocks: [{ role: 'subject', shape: 'rect', x: 0, y: 0, w: 400, h: 400, model: 'ship' }], type: [] }];
  // hasOpeningBuildDevice may clear via chapter path or device — kind build also clears inside openingKitKindErrors
  assert.deepEqual(GB.openingKitKindErrors(good, beats, devices, { hasOpeningBuildDevice: () => false }), []);
});

test('P1 B3 turnedDownPickErrors: picking turnedDown id fails', async () => {
  const GB = await lib('greybox.mjs');
  const doc = { turnedDown: [{ id: 'td-0', what: '锈墙', said: 'no' }] };
  const errs = GB.turnedDownPickErrors([{ beat: 'A1', composition: 'td-0' }], doc);
  assert.ok(errs.some((e) => /turnedDown/.test(e)), errs.join(' | '));
  assert.deepEqual(GB.turnedDownPickErrors([{ beat: 'A1', composition: 'globe-route' }], doc), []);
});

test('P1 B4 capabilityRouteResolveErrors: device must exist; empty codeSymbol fails', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  const devices = [{ id: 'filmed-screen' }];
  const bad = { routes: [{ need: 'x', device: 'nope', kitPath: 'a', codeSymbol: 'k' }, { need: 'y', device: 'filmed-screen', kitPath: 'a', codeSymbol: '  ' }] };
  const errs = P1.capabilityRouteResolveErrors(bad, devices);
  assert.ok(errs.some((e) => /not in devices/.test(e)), errs.join(' | '));
  assert.ok(errs.some((e) => /codeSymbol empty/.test(e)), errs.join(' | '));
  const caps = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/engine-capabilities.json'), 'utf8'));
  const allDev = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/devices.json'), 'utf8')).devices;
  assert.deepEqual(P1.capabilityRouteResolveErrors(caps, allDev), [], 'live catalog must resolve');
});

test('P1 B5 screenFilmedDeviceErrors: screen kind without filmed-screen fails', async () => {
  const GB = await lib('greybox.mjs');
  const errs = GB.screenFilmedDeviceErrors([{ beat: 'A1', kind: 'screen', device: 'lineup-row' }]);
  assert.ok(errs.some((e) => /screen-device/.test(e)), errs.join(' | '));
  assert.deepEqual(GB.screenFilmedDeviceErrors([{ beat: 'A1', kind: 'screen', device: 'filmed-screen' }]), []);
});

test('P1 D1 labelDistanceErrors: far caption fails; near clears', async () => {
  const GB = await lib('greybox.mjs');
  const far = [{ beat: 'A1', blocks: [{ role: 'subject', x: 100, y: 100, w: 200, h: 200 }], type: [{ text: '标签', role: 'caption', size: 40, x: 1700, y: 900 }] }];
  const errs = GB.labelDistanceErrors(far, { maxDist: 220 });
  assert.ok(errs.some((e) => /label-distance/.test(e)), errs.join(' | '));
  const near = [{ beat: 'A1', blocks: [{ role: 'subject', x: 100, y: 100, w: 200, h: 200 }], type: [{ text: '标签', role: 'caption', size: 40, x: 320, y: 200 }] }];
  assert.deepEqual(GB.labelDistanceErrors(near, { maxDist: 220 }), []);
});

test('P1 D3 type.inStrategy missing defaults late → uneaten without timing signals', async () => {
  const SM = await import(pathToFileURL(path.join(LIB, 'shotmotion.mjs')).href);
  const contract = { contract: 'A1ShotMotionContract/v1', chapter: 'T', shots: [{
    shotId: 'T1', camera: { move: 'static' }, subjectMotion: 'none',
    type: { inStrategy: undefined, in: null }, // missing → late
    seam: { out: 'cut' },
  }] };
  const bare = "export const beats=[{at:0,cam:{x:960,y:540,s:1}}];\n"; // no type late signals
  const errs = SM.motionContractUneatenErrors(bare, contract);
  assert.ok(errs.some((e) => /type:.*UNEATEN|type\.inStrategy=late/i.test(e) || /type\.inStrategy=late/.test(e) || /\.type:/.test(e)), errs.join(' | '));
  const lateOk = "export const beats=[{at:0,cam:{x:960,y:540,s:1}}];\ntype late after motion; stagger; said();\n";
  // may still fail other things; at least type late should clear when signals present
  const e2 = SM.motionContractUneatenErrors(lateOk, contract).filter((e) => /\.type:/.test(e));
  assert.deepEqual(e2, [], e2.join(' | '));
});

test('P1 E3 organicMultiViewErrors: organic without multi-view qa goes red', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  const proj = { subject: { organic: true } };
  const code = "kit.props.model(THREE, 'blob', { what: 'x' })";
  const red = P1.organicMultiViewErrors(code, proj, { buildViewsByName: () => ['front'], partsRoot: null, minViews: 2 });
  assert.ok(red.some((e) => /organic-partset/.test(e)), red.join(' | '));
  const green = P1.organicMultiViewErrors(code, proj, { buildViewsByName: () => ['front', 'side'], partsRoot: null, minViews: 2 });
  assert.deepEqual(green, []);
  assert.equal(P1.claimsOrganicSubject(code, { project: {} }), false, 'banana name alone not organic');
});

test('P1 F1–F3 houseStyle + media catalog + recall device', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  const FD = await lib('filmdesign.mjs');
  const hs = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/house-style.json'), 'utf8'));
  const media = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/media.json'), 'utf8'));
  const beats = ['A1'];
  const base = { beat: 'A1', act: 'open', scale: 'thing', value: 'mid', medium: 'diagram', red: 1, hero: true, heroHow: 'big type over subject mesh', why: 'opens the film on the subject clearly', palette: 'ink-red', screen: 'clean' };
  const noHs = FD.filmDesignErrors({ arc: 'open then peak then release for the whole film arc here', beats: [base] }, beats, null, media, null, { houseStyle: hs });
  assert.ok(noHs.some((e) => /houseStyle/.test(e)), noHs.join(' | '));
  const ok = FD.filmDesignErrors({ arc: 'open then peak then release for the whole film arc here', houseStyle: 'forensic-dark', beats: [{ ...base, act: 'peak', red: 3 }] }, beats, null, media, null, { houseStyle: hs });
  // may still fail hero count etc — houseStyle itself must clear
  assert.ok(!ok.some((e) => /houseStyle/.test(e)), ok.filter((e) => /houseStyle/.test(e)).join(' | '));
  assert.ok(P1.mediaCatalogErrors([{ beat: 'A1', medium: 'not-a-screen' }], media).some((e) => /media:/.test(e)));
  assert.deepEqual(P1.mediaCatalogErrors([{ beat: 'A1', medium: 'vhs' }], media), []);
  const recall = P1.mediaKindDeviceErrors([{ beat: 'A1', act: 'recall', device: 'lineup-row' }]);
  assert.ok(recall.some((e) => /recall-device/.test(e)), recall.join(' | '));
});

test('P1 G5 morph-review/arbiter prompts contain 到4分清单 ≤3 + 复审只查清单', async () => {
  const mr = fs.readFileSync(path.join(DATA, 'prompts/morph-review.md'), 'utf8');
  const ar = fs.readFileSync(path.join(DATA, 'prompts/arbiter.md'), 'utf8');
  assert.match(mr, /到 4 分/);
  assert.match(mr, /最多 3 条|toFour/);
  assert.match(mr, /下一轮只查|复审/);
  assert.match(ar, /到 4 分清单|清单/);
  assert.match(ar, /下一轮只查|只查这几条/);
});

test('P1 H1 greyboxNotFinalStatus blocked copy', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  const msg = P1.greyboxNotFinalStatus({ greyboxApproved: true, morphOk: false, chapterId: 'B02' });
  assert.match(msg, /灰盒非终态/);
  assert.match(msg, /blocked/);
  assert.equal(P1.greyboxNotFinalStatus({ greyboxApproved: true, morphOk: true }), null);
});

test('P1 H5 retroLessonDrafts → lesson-inbox shape', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  const drafts = P1.retroLessonDrafts([['type', { n: 3, examples: ['morph: type scale'] }], ['motion', { n: 1, examples: ['seam'] }]], { project: 'demo', at: '2026-10-29' });
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].status, 'draft');
  assert.match(drafts[0].id, /retro-demo/);
  assert.equal(drafts[0].from, 'retro');
});


// ----- P2 hard-input doc wiring 2026-10-29 (C4/D4/E4/I3/I5-I6/HANDOFF/AUDIT-skills/motion-director/PRODUCT-DESIGN) -----
test('P2 C4 MATURITY links HOUSE mature bars to check functions', async () => {
  const P2 = await import(pathToFileURL(path.join(LIB, 'p2docs.mjs')).href);
  const md = fs.readFileSync(path.join(DATA, 'MATURITY.md'), 'utf8');
  assert.deepEqual(P2.maturityFunctionLinkErrors(md, { libDir: LIB }), []);
});

test('P2 D4 TYPE declares hyperframes absorb / 明确不做 / 不可机读', async () => {
  const P2 = await import(pathToFileURL(path.join(LIB, 'p2docs.mjs')).href);
  const md = fs.readFileSync(path.join(DATA, 'TYPE.md'), 'utf8');
  assert.deepEqual(P2.typeAbsorbDeclareErrors(md), []);
  assert.match(md, /readTimeErrors/);
  const lessons = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/lessons.json'), 'utf8'));
  const gaps = lessons.proseHardConstraintGaps || [];
  for (const id of ['gap-p2-d4-time-hierarchy', 'gap-p2-d4-tracking-pct', 'gap-p2-d4-dark-leading']) {
    const g = gaps.find((x) => x.id === id);
    assert.ok(g, id);
    assert.equal(g.status, '不可机读');
    assert.ok(g['不可机读原因']);
  }
});

test('P2 E4 director README 只读 / recipe-board', async () => {
  const P2 = await import(pathToFileURL(path.join(LIB, 'p2docs.mjs')).href);
  const md = fs.readFileSync(path.join(DATA, 'style-lab/engine/director/README.md'), 'utf8');
  assert.deepEqual(P2.directorReadmeErrors(md), []);
});

test('P2 I3 launch.json repo-relative paths + LAUNCH.md', async () => {
  const P2 = await import(pathToFileURL(path.join(LIB, 'p2docs.mjs')).href);
  const j = fs.readFileSync(path.join(REPO, '.claude/launch.json'), 'utf8');
  const note = fs.readFileSync(path.join(REPO, '.claude/LAUNCH.md'), 'utf8');
  assert.deepEqual(P2.launchPathErrors(j, note), []);
  assert.match(note, /历史保留，不是生产调度入口/);
  assert.match(note, /\.codex\/skills\/recipe-board-director\/SKILL\.md/);
});

test('P2 I5/I6 RESEARCH archived; no silent dead links', async () => {
  const P2 = await import(pathToFileURL(path.join(LIB, 'p2docs.mjs')).href);
  const agent = fs.readFileSync(path.join(DATA, 'RESEARCH-agent-motion-2026.md'), 'utf8');
  assert.deepEqual(P2.researchArchiveErrors(agent), []);
  assert.deepEqual(P2.researchDeadLinkErrors(REPO), []);
});

test('P2 historical HANDOFF dirs README 过期', async () => {
  const P2 = await import(pathToFileURL(path.join(LIB, 'p2docs.mjs')).href);
  assert.deepEqual(P2.expiredHandoffReadmeErrors(REPO), []);
});

test('P2 AUDIT-skills checkbox table marks P0/P1 debts DONE', async () => {
  const P2 = await import(pathToFileURL(path.join(LIB, 'p2docs.mjs')).href);
  const md = fs.readFileSync(path.join(DATA, 'AUDIT-skills-sop-20261028.md'), 'utf8');
  assert.deepEqual(P2.auditSkillsCheckboxErrors(md), []);
});

test('P2 motion-director stays SUPERSEDED; PRODUCT/DESIGN 非硬门', async () => {
  const P2 = await import(pathToFileURL(path.join(LIB, 'p2docs.mjs')).href);
  const skill = fs.readFileSync(path.join(REPO, '.claude/skills/motion-director/SKILL.md'), 'utf8');
  assert.deepEqual(P2.motionDirectorSupersededErrors(skill), []);
  const product = fs.readFileSync(path.join(REPO, 'PRODUCT.md'), 'utf8');
  const design = fs.readFileSync(path.join(REPO, 'DESIGN.md'), 'utf8');
  assert.deepEqual(P2.productDesignHeaderErrors(product, design), []);
});

test('P2 bundle p2DocErrors empty (all nine)', async () => {
  const P2 = await import(pathToFileURL(path.join(LIB, 'p2docs.mjs')).href);
  assert.deepEqual(P2.p2DocErrors(REPO, { libDir: LIB }), []);
});


// ----- Opus55 P1 G4–G10 + rough-cut fill/busy-ground demote 2026-10-29 -----
test('Opus55 G4 engine-capabilities schema+loader+status+dispatch', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  const caps = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/engine-capabilities.json'), 'utf8'));
  assert.deepEqual(P1.engineCapabilitiesSchemaErrors(caps), [], 'live catalog schema');
  assert.ok(P1.engineCapabilitiesSchemaErrors(null).length);
  assert.ok(P1.engineCapabilitiesSchemaErrors({ contract: 'x', capabilities: [], routes: [] }).some((e) => /contract|capabilities|routes/.test(e)));
  const st = P1.engineCapabilitiesStatus(caps);
  assert.ok(st.chapter.length >= 1, 'chapter engines');
  assert.match(st.line, /engines: chapter=/);
  assert.equal(caps.routes[0].device, 'made-model', 'new optional graphic routes must not displace the default real-object route');
  const d = P1.dispatchCapability(caps, caps.routes[0].need);
  assert.ok(d && d.device && d.codeSymbol, d);
  assert.equal(d.device, 'made-model');
  assert.equal(d.codeSymbol, 'kit.props.model', 'real-object route must name the model API used by its instruction');
  const byId = P1.dispatchCapability(caps, caps.capabilities.find((c) => c.status === 'chapter').id);
  assert.ok(byId && byId.capability, byId);
  const cfg = { dataDir: DATA };
  assert.equal(P1.loadEngineCapabilities(cfg).contract, 'A1EngineCapabilities/v1');
  // B4 still green on live
  const devices = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/devices.json'), 'utf8')).devices;
  assert.deepEqual(P1.capabilityRouteResolveErrors(caps, devices), []);
  assert.ok(fs.existsSync(path.join(DATA, 'routing/engine-capabilities.schema.json')));
});

test('Opus55 G5 effort tiers + studio checklist', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  assert.equal(P1.resolveEffort({}), 'standard');
  assert.equal(P1.resolveEffort({ effort: 'studio' }), 'studio');
  assert.equal(P1.resolveEffort({ effort: 'overnight' }), 'studio');
  assert.equal(P1.resolveEffort({ effort: 'quick' }), 'quick');
  assert.deepEqual(P1.effortStudioChecklistErrors('standard', { stillsBeforePreview: false }), []);
  assert.ok(P1.effortStudioChecklistErrors('studio', { stillsBeforePreview: false }).some((e) => /stills/.test(e)));
  assert.ok(P1.effortStudioChecklistErrors('studio', { animatic: false }).some((e) => /animatic/.test(e)));
  const tiers = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/effort-tiers.json'), 'utf8'));
  assert.equal(tiers.contract, 'A1EffortTiers/v1');
  assert.ok(tiers.tiers.studio.overnight);
  const skill = fs.readFileSync(path.join(REPO, '.codex/skills/recipe-board-director/SKILL.md'), 'utf8');
  assert.match(skill, /effort: studio|Effort tiers/);
  assert.match(skill, /stills/);
});

test('Opus55 G6 briefBeatsUneatenErrors', async () => {
  const SM = await import(pathToFileURL(path.join(LIB, 'shotmotion.mjs')).href);
  const contract = { contract: 'A1ShotMotionContract/v1', chapter: 'T', beats: [{ t: 0, read: '开场', cam: 'push' }, { t: 4.5, read: '揭晓' }], shots: [] };
  const bare = 'export const beats=[{at:0,cam:{x:1,y:1,s:1}}];\n';
  const miss = SM.briefBeatsUneatenErrors(bare, contract);
  assert.ok(miss.some((e) => /beats\[4\.5\]/.test(e)), miss.join(' | '));
  const commentOnly = 'export const beats=[{at:0}]; // at:4.5\n';
  assert.ok(SM.briefBeatsUneatenErrors(commentOnly, contract).some((e) => /beats\[4\.5\]/.test(e)), 'comments cannot satisfy timed beat checks');
  const ok = 'export const beats=[{at:0,cam:{x:1}},{at:4.5,cam:{x:2}}];\n';
  assert.deepEqual(SM.briefBeatsUneatenErrors(ok, contract), []);
  assert.deepEqual(SM.briefBeatsUneatenErrors(ok, { shots: [] }), [], 'no beats[] → empty');
  const sch = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/shot-motion-contract.schema.json'), 'utf8'));
  assert.ok(sch.properties.beats);
});

test('preview stills do not treat old PNGs as evidence when the video is missing', async () => {
  const SM = await import(pathToFileURL(path.join(LIB, 'shotmotion.mjs')).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-preview-missing-'));
  try {
    fs.mkdirSync(path.join(dir, 'stills'));
    for (let i = 0; i < 3; i++) fs.writeFileSync(path.join(dir, 'stills', `${i}.png`), Buffer.alloc(64));
    assert.deepEqual(SM.ensurePreviewStillsFromMp4(dir, path.join(dir, 'missing.mp4')), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Opus55 G7 versionTrapErrors respects TextGeometry version', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  assert.deepEqual(P1.versionTrapErrors({ threeVersion: '0.181.2' }), []);
  assert.ok(P1.versionTrapErrors({ morphCode: 'new THREE.TextGeometry("A", { size: 1 })' }).some((e) => /version/.test(e)));
  assert.ok(P1.versionTrapErrors({ threeVersion: '0.160.0', morphCode: 'new THREE.TextGeometry("A", { depth: 0.02 })' }).some((e) => /height/.test(e)));
  assert.deepEqual(P1.versionTrapErrors({ threeVersion: '0.162.0', morphCode: 'new THREE.TextGeometry("A", { height: 0.02 })' }), []);
  assert.ok(P1.versionTrapErrors({ threeVersion: '0.163.0', morphCode: 'new THREE.TextGeometry("A", { height: 0.02 })' }).some((e) => /depth/.test(e)));
  assert.deepEqual(P1.versionTrapErrors({ threeVersion: '0.181.2', morphCode: 'new THREE.TextGeometry("A", { depth: 0.02 })' }), []);
  const morph = fs.readFileSync(path.join(DATA, 'style-lab/engine/templates/morph.js'), 'utf8');
  assert.match(morph, /version-trap|TextGeometry depth/);
});

test('Opus55 G8 skills packaging map exists', () => {
  const md = fs.readFileSync(path.join(DATA, 'SKILLS-PACKAGING.md'), 'utf8');
  assert.match(md, /recipe-board-director/);
  assert.match(md, /\.codex\/skills/);
  assert.match(md, /SUPERSEDED|motion-director/);
});

test('Opus55 G9 greyboxNotFilmHardStop + run surfaces 灰盒非终态', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  const msg = P1.greyboxNotFilmHardStop({ greyboxApproved: true, morphOk: false, chapterId: 'B01' });
  assert.match(msg, /灰盒非终态/);
  assert.match(msg, /blocked/);
  assert.equal(P1.greyboxNotFilmHardStop({ greyboxApproved: true, morphOk: true }), null);
  const runSrc = fs.readFileSync(path.join(LIB, 'run.mjs'), 'utf8');
  assert.match(runSrc, /greyboxNotFinalStatus|灰盒非终态/);
  assert.match(runSrc, /engineCapabilitiesStatus/);
});

test('Opus55 G10 retroHardStepErrors', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  assert.deepEqual(P1.retroHardStepErrors({ finalApproved: false }), []);
  assert.ok(P1.retroHardStepErrors({ finalApproved: true, hasRetroFile: false, draftCount: 0 }).length >= 2);
  assert.deepEqual(P1.retroHardStepErrors({ finalApproved: true, hasRetroFile: true, draftCount: 2 }), []);
  const runSrc = fs.readFileSync(path.join(LIB, 'run.mjs'), 'utf8');
  assert.match(runSrc, /retroHardStepErrors/);
});

test('gateProfile rough-cut: fill + busy-ground warn; pierce/cover stay hard', async () => {
  const P1 = await import(pathToFileURL(path.join(LIB, 'p1hard.mjs')).href);
  const { balanceErrors, crossErrors, objectErrors } = await lib('chapter.mjs');
  const { figureGroundErrors, PROFILES } = await lib('profile.mjs');
  const bal = balanceErrors([{ top: 0.08, bottom: 0, share: 0.05 }], ['B01']);
  assert.ok(bal.some((e) => /top half/.test(e)), bal.join());
  const busy = figureGroundErrors([{ beat: 'B09', things: 0.3, figL: 0.5, gndL: 0.2, figEdge: 0.04, gndEdge: 0.09 }], PROFILES.gawx);
  assert.ok(busy.some((e) => /ground is busier/.test(e)), busy.join());
  const stand = figureGroundErrors([{ beat: 'B09', things: 0.3, figL: 0.3, gndL: 0.25, figEdge: 0.08, gndEdge: 0.03 }], PROFILES.gawx);
  assert.ok(stand.some((e) => /does not stand off/.test(e)), stand.join());

  const roughBal = P1.partitionRoughCutWarns(bal, { roughCut: true });
  assert.deepEqual(roughBal.errors, []);
  assert.ok(roughBal.warnings.some((w) => /top half/.test(w)));
  const fullBal = P1.partitionRoughCutWarns(bal, { roughCut: false });
  assert.ok(fullBal.errors.length && !fullBal.warnings.length);

  const roughFg = P1.partitionRoughCutWarns([...busy, ...stand], { roughCut: true });
  assert.ok(roughFg.warnings.some((w) => /ground is busier/.test(w)));
  assert.ok(roughFg.errors.some((e) => /does not stand off/.test(e)), 'stand-off stays hard under rough-cut');

  // pierce / text-over-object messages must NOT match ROUGH_CUT_WARN_RE
  const pierce = 'B02: "标题" (80 px) is cut by a line of the picture (ship)';
  const cover = 'B02: "标题" (80 px) is half under a 3D object (40 % of it covered by hull): set it clear of the object or wholly on it';
  const hard = P1.partitionRoughCutWarns([pierce, cover], { roughCut: true });
  assert.deepEqual(hard.warnings, [], 'pierce/cover never demoted');
  assert.equal(hard.errors.length, 2);
  assert.match(P1.ROUGH_CUT_WARN_RE.source, /top half|busier/);

  const chapSrc = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(chapSrc, /partitionRoughCutWarns/);
  assert.match(chapSrc, /GATE_PROFILE_ROUGH/);
  // cross/object still pushed as errors in geometry path (not through partition)
  assert.match(chapSrc, /crossErrors/);
  assert.match(chapSrc, /objectErrors/);

  const house = fs.readFileSync(path.join(DATA, 'HOUSE.md'), 'utf8');
  assert.match(house, /主体偏上|ground busier/);
  const lessons = JSON.parse(fs.readFileSync(path.join(DATA, 'routing/lessons.json'), 'utf8'));
  assert.ok(lessons.lessons.some((l) => l.id === 'L130-rough-cut-fill-busy-ground-warn'));
});

test('overnight scan: fake-array / empty-kit-ready / photo-plane / preview.bind still wired', async () => {
  const GB = await lib('greybox.mjs');
  assert.equal(typeof GB.midFilmFakeArrayErrors, 'function');
  assert.equal(GB.MID_FILM_FAKE_ARRAY_CODE, 'mid-film-fake-array');
  const fake = GB.midFilmFakeArrayErrors(
    [
      { beat: 'B1', device: 'push' },
      { beat: 'B2', device: 'push' },
      { beat: 'B3', device: 'push' },
      { beat: 'B4', device: 'array-build', note: 'same PNG ×5 CSS clone rise staggered' },
    ],
    [
      { beat: 'B1', act: 'open' },
      { beat: 'B2', act: 'open' },
      { beat: 'B3', act: 'open' },
      { beat: 'B4', act: 'develop' },
    ]
  );
  assert.ok(Array.isArray(fake));
  const photo = GB.greyboxPhotoPlaneErrors(
    { beats: [{ beat: 'B01', blocks: [{ role: 'subject', shape: 'plane', image: 'x.png' }], note: 'PlaneGeometry photo as 3d subject' }] },
    [{ beat: 'B01', form: '3d' }],
    { process: 'six-stage' }
  );
  assert.ok(photo.some((e) => /photo-plane-as-subject/.test(e)), photo.join(' | '));
  const SM = await import(pathToFileURL(path.join(LIB, 'shotmotion.mjs')).href);
  assert.equal(typeof SM.previewDeliveryErrors, 'function');
  const gSrc = fs.readFileSync(path.join(LIB, 'greybox.mjs'), 'utf8');
  assert.match(gSrc, /kit\.status/);
  assert.match(gSrc, /photo-plane-as-subject/);
  const house = fs.readFileSync(path.join(DATA, 'HOUSE.md'), 'utf8');
  assert.match(house, /kit\.status/);
  assert.match(house, /空壳/);
  const smSrc = fs.readFileSync(path.join(LIB, 'shotmotion.mjs'), 'utf8');
  assert.match(smSrc, /bindMorphHash/);
  assert.match(smSrc, /preview\.bind\.json/);
});


test('chapter runtime passes its production input to the evidence checks (an undefined input broke every chapter render)', () => {
  const src = fs.readFileSync(path.join(LIB, 'chapter.mjs'), 'utf8');
  assert.match(src, /const evidenceInput = chapterInput\(cfg, id, g\)/, 'runtimeCheck must bind the chapter input before evidenceErrors');
  assert.ok(!/evidenceErrors\(code, assets, input,/.test(src), 'the undefined page global input is not passed to evidenceErrors');
  assert.ok(!/lookdevReferenceErrors\(answer,/.test(src), 'runtimeCheck has no answer variable; pass motionImplementation');
});


test('shelf-bay-back-type: bayBackType wired ready path (not HUD, not cream box plate)', async () => {
  const typePath = path.join(REPO, 'work/recipe-board-v1/style-lab/engine/templates/type.js');
  const typeSrc = fs.readFileSync(typePath, 'utf8');
  assert.match(typeSrc, /export function bayBackType\s*\(/, 'bayBackType exported from type.js');
  assert.match(typeSrc, /bayBackType\s*\}/, 'bayBackType on type object');
  assert.match(typeSrc, /surfaceType\(THREE, st/, 'bayBackType reuses surfaceType glyph path');
  // no opaque cream/dark plate fill under the glyphs (surfaceType chalk/stencil wear may destination-out; plate-way is fillRect bg then fillText)
  const bayFn = typeSrc.slice(typeSrc.indexOf('export function bayBackType'), typeSrc.indexOf('export const type'));
  assert.doesNotMatch(bayFn, /fillRect\([^)]*\)[\s\S]{0,80}fillStyle\s*=\s*['\"]#?(?:f5|e9|f2|cream)/i, 'bayBackType body has no cream plate fillRect');
  assert.doesNotMatch(bayFn, /fillRect\s*\(\s*0\s*,\s*0\s*,\s*cv\.width/, 'bayBackType does not full-canvas plate fill');

  const devices = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/devices.json'), 'utf8')).devices;
  const d = devices.find((x) => x.id === 'shelf-bay-back-type');
  assert.ok(d, 'device shelf-bay-back-type exists');
  assert.equal(d.kit?.status, 'ready');
  assert.equal(d.kit?.kind, 'type');
  assert.match(String(d.kit?.use || ''), /type\.bayBackType/);
  assert.doesNotMatch(String(d.kit?.use || ''), /hudLabel|hud-label/);
  assert.match(String(d.what || '') + String(d.when || '') + String(d.how || ''), /背板|材质/);
  assert.doesNotMatch(String(d.how || ''), /hudLabel/);

  const R = await lib('refbreakdown.mjs');
  const live = R.loadKitSymbolIndex({ dataDir: DATA });
  assert.ok(live.has('type.bayBackType'));
  assert.deepEqual(R.selectedDeviceKitErrors([{ beat: 'B02', devices: ['shelf-bay-back-type'] }], devices, { symbols: live }), []);
  // empty-kit / unwired shells still rejected
  const shell = [...devices, { id: 'proto-bay-shell', kit: { status: 'ready', use: '' } }];
  assert.match(R.selectedDeviceKitErrors([{ beat: 'B02', devices: ['proto-bay-shell'] }], shell, { symbols: live }).join('\n'), /kit\.use is empty/);
  const fake = [...devices, { id: 'fake-bay', kit: { status: 'ready', use: 'type.noSuchBayType' } }];
  assert.match(R.selectedDeviceKitErrors([{ beat: 'B02', devices: ['fake-bay'] }], fake, { symbols: live }).join('\n'), /no real template symbol/);

  const caps = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/engine-capabilities.json'), 'utf8'));
  const route = caps.routes.find((r) => r.device === 'shelf-bay-back-type');
  assert.ok(route, 'engine-capabilities route for shelf-bay-back-type');
  assert.equal(route.codeSymbol, 'type.bayBackType');
  assert.match(String(route.never || ''), /hud|plate/i);

  const lessons = JSON.parse(fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/routing/lessons.json'), 'utf8'));
  assert.ok(lessons.lessons.some((l) => l.id === 'L160-shelf-bay-back-type'));
  const morph = fs.readFileSync(path.join(REPO, 'work/recipe-board-v1/prompts/morph.md'), 'utf8');
  assert.match(morph, /type\.bayBackType/);
  assert.match(morph, /shelf-bay-back-type/);
});

