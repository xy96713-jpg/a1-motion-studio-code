// Stage: the two 3D routes of the line. A shot on a 3D card (STAGE_RECIPES) gets a full-frame plate made by the
// style-lab engine, then flows on like footage (render: its poster frame; motion: the clip; reel):
//   teardown-3d  an object taken apart: a subject model (style-lab engine/subjects), its shot preset (whole / open /
//                inside) chosen from the words of the beat, the parts it names highlighted, labels in code type;
//   scene-3d     a mood scene: a diorama of generated layers (engine/templates/diorama.js), filmed on the world's medium;
//   hero-3d      a 3D hero shot from a frozen engine template (HERO_TEMPLATES: a number, a name, a ranking, a date) with
//                the beat's own figures as params; the storyboard names the template, numbers keep their sources.
// What can be staged is listed in routing/stage-library.json. A beat whose object or scene is not there keeps a TODO
// plate and is listed as 'to build' (a model or a scene is made in style-lab, then added to the library).
// The film's world (worlds/<id>.json `stage`, else the project theme's tokens) sets the plate's colours and medium,
// so 3D shots and cards share one look. Plates are cached by the style-lab render cache (shot body + engine code).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadShots, projectPaths, readPlan, projectTheme, loadRecipe } from './store.mjs';
import { filmLook } from './filmlook.mjs';

export const STAGE_RECIPES = { 'teardown-3d': 'teardown', 'scene-3d': 'scene', 'hero-3d': 'hero' };
// the hero templates a shot may name (engine/templates/<id>.js) and the medium each is filmed on by default
export const HERO_TEMPLATES = { monolith: 'led2', city: 'led2', nameplate: 'led2', ticker: 'led2', tunnel: 'led2', flipboard: 'clean', ...blenderPlates() };
// Blender plates (style-lab/engine/blender/plates/<name>.py): a photographic 3D picture rebuilt in Blender after a
// keyframe the user picked (the chromosome close-up of style-lab/keyframe-v1), rendered straight to video for a hero
// beat; the line sets the type over it. Named 'blender:<name>' in the storyboard's stage3d.
function blenderPlates() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../../work/recipe-board-v1/style-lab/engine/blender/plates');
  return fs.existsSync(dir) ? Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.py')).map((f) => [`blender:${f.replace(/\.py$/, '')}`, 'clean'])) : {};
}
// render a Blender plate for one beat: job from the film's palette and the beat's params, frames -> mp4 at `out`
// a plate made before its plate script last changed is made again (the chromosome plate learnt to act, 2026-10-22: the
// old still plate stood because a rendered plate was never looked at again)
export const plateScript = (cfg, template) => path.join(cfg.sourceRoot || cfg.repoRoot, 'work/recipe-board-v1/style-lab/engine/blender/plates', `${String(template).replace(/^blender:/, '')}.py`);
export function plateStale(file, script) { try { return fs.statSync(file).mtimeMs < fs.statSync(script).mtimeMs; } catch { return false; } }
export function renderBlenderPlate(cfg, template, params, { dur, out, palette, log = () => {} }) {
  const name = template.replace(/^blender:/, '');
  const script = path.join(cfg.sourceRoot || cfg.repoRoot, 'work/recipe-board-v1/style-lab/engine/blender/plates', `${name}.py`);
  const work = out.replace(/\.mp4$/, '-frames'); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const job = path.join(work, 'job.json');
  fs.writeFileSync(job, JSON.stringify({ samples: 32, width: 1920, height: 1080, fps: 30, ...params, seconds: dur, out: work, palette }, null, 1));
  const blender = process.env.BLENDER || ['/Users/a1/.local/bin/blender', '/Applications/Blender.app/Contents/MacOS/Blender'].find((b) => fs.existsSync(b)) || 'blender';
  log(`  blender plate ${name}: ${dur.toFixed(1)} s`);
  const r = spawnSync(blender, ['-b', '--factory-startup', '-P', script, '--', job], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0 || !/PLATE DONE/.test(r.stdout || '')) throw new Error(`blender plate ${name} failed: ${String(r.stderr || r.stdout).split('\n').filter(Boolean).slice(-2).join(' ')}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const f = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '30', '-i', path.join(work, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', out]);
  if (f.status !== 0) throw new Error(`blender plate ${name}: mp4 failed`);
  return out;
}
// copy a hero never shows: a site name or address is not put on screen (user decision); the source stays in factSources
const heroParams = ({ window: _w, ...params } = {}) => ({ ...params, source: '', ...(params.kicker == null ? { kicker: '' } : {}) });
const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
// The library: routing/stage-library.json, plus what the engine built automatically (engine/build: subjects/auto/<id>.json,
// scenes/<id>/scene.json), each with generic shot presets
export function loadStageLibrary(cfg) {
  const lib = readJson(path.join(cfg.dataDir, 'routing', 'stage-library.json'), { teardown: {}, scene: {}, shotWords: {} });
  const engine = path.join(cfg.sourceRoot || cfg.repoRoot, lib.engine || 'work/recipe-board-v1/style-lab/engine');
  const autoDir = path.join(engine, 'subjects', 'auto'), sceneDir = path.join(engine, 'scenes');
  for (const f of fs.existsSync(autoDir) ? fs.readdirSync(autoDir).filter((x) => /^[a-z][a-z0-9-]*\.json$/.test(x) && !x.endsWith('.plan.json')) : []) {
    const d = readJson(path.join(autoDir, f));
    if (d?.contract === 'A1AutoSubject/v1' && !lib.teardown[d.id]) lib.teardown[d.id] = { label: d.label, aliases: d.aliases, parts: d.parts, shots: autoShots(d), auto: true };
  }
  for (const id of fs.existsSync(sceneDir) ? fs.readdirSync(sceneDir) : []) {
    const d = readJson(path.join(sceneDir, id, 'scene.json'));
    if (d?.contract === 'A1AutoScene/v1' && !lib.scene[d.id]) lib.scene[d.id] = { label: d.label, tags: d.tags, template: d.template, params: d.params, ...(d.medium ? { medium: d.medium } : {}), auto: true };
  }
  return lib;
}
// shots for a built subject: look at it whole, take it apart with every part named, look inside with the shell off
export function autoShots(d) {
  // no distances: the subject template frames each key to the parts it shows (auto), so any size of model fits
  const all = Object.keys(d.labels || {}), inner = all.filter((g) => !(d.outer || []).includes(g));
  const lab = (gs, t0) => gs.map((g, i) => ({ group: g, text: d.labels[g], t: +(t0 + 0.07 * i).toFixed(2) }));
  return {
    whole: { keys: [{ t: 0, yaw: 30, pitch: 22, mode: 'render' }, { t: 1, yaw: 55, pitch: 26, mode: 'render' }] },
    open: { keys: [{ t: 0, yaw: 30, pitch: 24, mode: 'line', explode: 0 }, { t: 0.45, yaw: 38, pitch: 22, mode: 'line', explode: 1 }, { t: 1, yaw: 46, pitch: 22, mode: 'line', explode: 1 }], labels: lab(all, 0.5), stagger: 0.5 },
    inside: { keys: [{ t: 0, yaw: 30, pitch: 26, mode: 'line', hide: d.outer || [] }, { t: 1, yaw: 50, pitch: 28, mode: 'line', hide: d.outer || [] }], labels: lab(inner, 0.3) },
  };
}
// ---------------------------------------------------------------- what to stage, from the beat
const has = (text, words) => (words || []).filter((w) => text.toLowerCase().includes(String(w).toLowerCase()));
export function matchStage(lib, route, beat = {}) {
  if (route === 'hero') return { route, missing: true, want: `3D 主视觉（${Object.keys(HERO_TEMPLATES).join(' / ')}）：${beat.onScreen?.headline || String(beat.text || '').slice(0, 24)}`, about: beat.text || '' };
  const text = [beat.text, beat.onScreen?.headline, ...(beat.entities || []).map((e) => e.name)].filter(Boolean).join(' ');
  if (route === 'teardown') {
    const hit = Object.entries(lib.teardown || {}).map(([id, s]) => [id, s, has(text, s.aliases).length]).filter((x) => x[2]).sort((a, b) => b[2] - a[2])[0];
    if (!hit) return { route, missing: true, want: (beat.entities || []).find((e) => e.kind === 'product')?.name || beat.onScreen?.headline || text.slice(0, 24), about: beat.text || '', auto: true };
    return teardownSpec(lib, hit[0], text);
  }
  const hit = Object.entries(lib.scene || {}).map(([id, s]) => [id, has(text, s.tags).length]).filter((x) => x[1]).sort((a, b) => b[1] - a[1])[0];
  return hit ? { route, scene: hit[0], auto: true } : { route, missing: true, want: beat.onScreen?.headline || text.slice(0, 24), about: beat.text || '', auto: true };
}
function teardownSpec(lib, subject, text) {
  const s = lib.teardown[subject];
  let highlight = Object.entries(s.parts || {}).filter(([, words]) => has(text, words).length).map(([g]) => g);
  // naming every part is a list, not a pointer: nothing stands out, so nothing is lit
  if (highlight.length > 1 && highlight.length === Object.keys(s.parts || {}).length) highlight = [];
  const shot = ['inside', 'open'].find((k) => has(text, lib.shotWords?.[k]).length) || (highlight.length ? 'open' : 'whole');
  return { route: 'teardown', subject, shot, highlight, auto: true };
}
// a spec the storyboard or the user wrote by hand is kept when the library has it; one this step wrote (auto: true)
// is matched again, so a better rule or a newly built subject reaches it
export function stageSpec(lib, recipe, beat, given = null) {
  const route = STAGE_RECIPES[recipe];
  if (!route) return null;
  // (a fixed key order: the spec is compared as written to the shot)
  if (given && !given.auto && given.route === route && route === 'teardown' && lib.teardown?.[given.subject]?.shots[given.shot || 'whole']) return { route, subject: given.subject, shot: given.shot || 'whole', highlight: given.highlight || [] };
  if (given && !given.auto && given.route === route && route === 'scene' && lib.scene?.[given.scene]) return { route, scene: given.scene };
  if (given && given.route === 'hero' && route === 'hero' && HERO_TEMPLATES[given.template]) return { route, template: given.template, params: given.params || {}, ...(given.facts ? { facts: given.facts } : {}), ...(given.medium ? { medium: given.medium } : {}) };
  const m = matchStage(lib, route, beat);
  // a beat that was waiting for a build takes what was built for it, whatever words the build gave it
  if (m.missing && given?.missing) {
    const id = buildId(given), text = [beat.text, beat.onScreen?.headline].filter(Boolean).join(' ');
    if (route === 'teardown' && lib.teardown?.[id]) return teardownSpec(lib, id, text);
    if (route === 'scene' && lib.scene?.[id]) return { route, scene: id, auto: true };
  }
  return m;
}

// ---------------------------------------------------------------- the world's look
const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const n = parseInt(m[1], 16); return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255; };
const mix = (a, b, k) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.slice(1 + i, 3 + i), 16) * (1 - k) + parseInt(b.slice(1 + i, 3 + i), 16) * k).toString(16).padStart(2, '0')).join('');
// The film's world, most specific first: worlds/<id>.json `stage` { theme, palette, medium, sceneMedium } (a picked
// world), then the brief (style.palette and style.stage: how the 3D shots sit in this film), then the world's and the
// theme's tokens (bg, fg, accent). A dark ground films the subject on 'dark', a light one on 'paper'.
export function stageLook(cfg, id) {
  // a picked world decides (filmlook.mjs, the one source of a film's look); the rest below is for films without one
  const F = filmLook(cfg, id);
  if (F.picked) {
    const pal = { bg: F.paper, ink: F.ink, fill: mix(F.paper, F.ink, 0.06), dim: F.dim, accent: F.accent };
    return { world: F.world, from: 'world', look: null, theme: F.ground === 'dark' ? 'dark' : 'paper', palette: pal, medium: 'clean', sceneMedium: 'film', sceneMediumSet: false, material3d: F.material3d };
  }
  const themeId = projectTheme(cfg, id);
  let tokens = {};
  try { tokens = loadRecipe(cfg, 'teardown-3d', themeId).tokens || {}; } catch { /* no card in this sandbox */ }
  const p = projectPaths(cfg, id), project = readJson(p.project, {});
  const world = project.world ? readJson(path.join(cfg.dataDir, 'worlds', `${project.world}.json`), {}) : {};
  const brief = readJson(path.join(p.root, 'brief.json'), null)?.style || {};
  const hex = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v || '')));
  const t = { ...hex(world.tokens ? { bg: world.tokens.desk, fg: world.tokens.ink, accent: world.tokens.violet || world.tokens.amber } : {}), ...hex(tokens),
    ...hex(brief.palette ? { bg: brief.palette.base, fg: brief.palette.ink, accent: brief.palette.accent } : {}) };
  const W = { ...(brief.stage ? { theme: brief.stage.subject, sceneMedium: brief.stage.sceneMedium } : {}), ...(world.stage || {}) };
  const dark = lum(t.bg) == null ? true : lum(t.bg) < 0.45;
  const palette = t.bg && t.fg ? { bg: t.bg, ink: t.fg, fill: mix(t.bg, t.fg, 0.06), dim: mix(t.bg, t.fg, 0.45), ...(t.accent ? { accent: t.accent } : {}) } : null;
  const theme = W.theme || (dark ? 'dark' : 'paper');
  // 'red' (a full accent page) and 'ink' (prints as ink on paper media) are looks of their own: the world's colours
  // go only on the dark and paper grounds
  const own = ['dark', 'paper'].includes(theme) ? palette : null;
  return { world: project.world || null, from: world.stage ? 'world' : brief.stage ? 'brief' : 'theme', look: brief.stage?.look || null,
    theme, palette: W.palette === null ? null : (own || W.palette ? { ...(own || {}), ...(W.palette || {}) } : null), medium: W.medium || 'clean', sceneMedium: W.sceneMedium || 'film', sceneMediumSet: !!W.sceneMedium };
}

// ---------------------------------------------------------------- spec -> a style-lab shot
// the medium a plate is filmed on: teardowns on the world's medium; a scene on the one the world or the brief names,
// else the stock the scene chose for itself (a day scene: filmday), else film
export const plateMedium = (lib, spec, look) => (spec.route === 'hero' ? spec.medium || HERO_TEMPLATES[spec.template] : spec.route === 'teardown' ? look.medium : look.sceneMediumSet ? look.sceneMedium : lib.scene?.[spec.scene]?.medium || look.sceneMedium);
const scaleKeys = (list, dur) => (list || []).map((k) => ({ ...k, t: +(k.t * dur).toFixed(3) }));
export function stageShot(lib, spec, look, dur, shotId) {
  // window.in: start later in the template (a long build-up cut to the beat); facts: every number shown, with its source
  if (spec.route === 'hero') return { id: shotId, template: spec.template, medium: plateMedium(lib, spec, look), params: heroParams(spec.params), ...(spec.params?.window?.in != null ? { window: { in: spec.params.window.in } } : {}), facts: spec.facts || [] };
  if (spec.route === 'teardown') {
    const S = lib.teardown[spec.subject], P = S.shots[spec.shot] || S.shots.whole;
    const hi = spec.highlight || [];
    // the named parts are lit from the first key on, and an explode shot lights them once they are apart (a two-key
    // shot lit only at its last key showed no red at all, stage-auto B01)
    const from = P.keys.some((k) => k.explode) ? P.keys.findIndex((k) => k.explode) : 0;
    const keys = scaleKeys(P.keys, dur).map((k, i) => (hi.length && i >= from ? { ...k, highlight: [...new Set([...(k.highlight || []), ...hi])] } : k));
    const labels = (P.labels || []).map((l) => ({ ...l, t: +(l.t * dur).toFixed(3) }));
    const params = { subject: spec.subject, theme: look.theme, ...(look.palette ? { palette: look.palette } : {}), keys, labels, title: '', sub: '', note: '示意', lines: 'screen', auto: true,
      ...(P.drive ? { drive: { ...P.drive, t0: +(P.drive.t0 * dur).toFixed(3) } } : {}), ...(P.spin ? { spin: P.spin } : {}), ...(P.stagger ? { stagger: P.stagger } : {}), ...(P.arc ? { arc: P.arc } : {}) };
    return { id: shotId, template: 'subject', medium: look.medium, params };
  }
  const S = lib.scene[spec.scene];
  return { id: shotId, template: S.template || 'diorama', medium: plateMedium(lib, spec, look), params: { ...S.params, title: '', sub: '', note: '示意' } };
}

// the id a built subject or scene gets: from what the beat asked for, so the same want is built once
export const buildId = (spec) => `${spec.route === 'teardown' ? 't' : 's'}-${crypto.createHash('sha256').update(String(spec.want)).digest('hex').slice(0, 8)}`;

// ---------------------------------------------------------------- state and the step
const stageDir = (cfg, id) => path.join(projectPaths(cfg, id).out, 'stage');
const plateOf = (cfg, id, shotId, medium) => path.join(stageDir(cfg, id), 'out', 'render', `${shotId}-${medium}.mp4`);
const rel = (cfg, f) => path.relative(cfg.sourceRoot || cfg.repoRoot, f).split(path.sep).join('/');
export function stageState(cfg, id, { only = null } = {}) {
  const lib = loadStageLibrary(cfg), plan = readPlan(cfg, id), look = stageLook(cfg, id);
  const beatOf = (shotId) => (plan?.beats || []).find((b) => b.id === shotId) || {};
  const shots = loadShots(cfg, id, only).filter((s) => STAGE_RECIPES[s.recipe]);
  // a hero's template and figures are the storyboard's (stage3d, checked there); the shot keeps the spec it was made with
  const sb = Object.fromEntries((readJson(path.join(projectPaths(cfg, id).root, 'storyboard.json'), {})?.shots || []).map((x) => [x.beat, x]));
  const heroOf = (s) => { const h = sb[s.shotId.split('~')[0]]?.stage3d; return h ? { route: 'hero', ...h } : s.slots?.background?.stage; };
  const items = shots.map((s) => ({ shot: s, spec: stageSpec(lib, s.recipe, beatOf(s.shotId), STAGE_RECIPES[s.recipe] === 'hero' ? heroOf(s) : s.slots?.background?.stage) }));
  const ready = items.filter((x) => !x.spec.missing);
  return {
    look, lib, items, ready,
    toBuild: items.filter((x) => x.spec.missing).map((x) => `${x.shot.shotId}:${x.spec.route} "${x.spec.want}"`),
    // a plate is due when the slot does not point at the current render (the render cache decides whether to redo it)
    due: ready.filter((x) => { const f = plateOf(cfg, id, x.shot.shotId, plateMedium(lib, x.spec, look)); return !fs.existsSync(f) || x.shot.slots?.background?.video?.path !== rel(cfg, f) || JSON.stringify(x.shot.slots?.background?.stage) !== JSON.stringify(x.spec); }).map((x) => x.shot.shotId),
  };
}

// one shot list for the project's 3D shots, rendered by style-lab make.mjs one at a time (its cache keeps unchanged
// plates), each plate bound back into the shot's background slot as a clip
export async function stepStage(cfg, id, { only = null, log = console.log, dry = false, build = false } = {}) {
  const id0 = id, st = stageState(cfg, id, { only });
  if (dry) return { ...st, made: [] };   // look only: nothing written, nothing rendered
  const p = projectPaths(cfg, id);
  const write = (shot, background) => {
    const f = path.join(p.shots, `${shot.shotId}.json`), s = JSON.parse(fs.readFileSync(f, 'utf8'));
    s.slots = { ...(s.slots || {}), background };
    // a scene plate is already filmed on its medium (film grain): the line's own medium (the tube) stays off it
    // a 3D hero is filmed on its own medium and lit by its own light: nothing is printed over it (DESIGN-harmony.md, 3D)
    if (['scene', 'hero'].includes(background.stage?.route) && !s.medium) s.medium = { kind: 'none' };
    fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\n');
  };
  // what cannot be staged yet: the spec says what to build, the slot keeps its picture of it (TODO plate)
  for (const x of st.items.filter((i) => i.spec.missing)) {
    const bg = x.shot.slots?.background || {};
    if (JSON.stringify(bg.stage) !== JSON.stringify(x.spec)) write(x.shot, { gen: bg.gen || `${{ teardown: '拆解模型', scene: '意境场景', hero: '3D 主视觉' }[x.spec.route]}：${x.spec.want}`, stage: x.spec });
  }
  // build what is missing (engine/build: a scene from a generated frame, a subject from image-to-3D parts), one at a
  // time; a failed build leaves its TODO plate and is reported
  const built = [], waiting = [];
  if (build && st.items.some((i) => i.spec.missing && i.spec.route !== 'hero')) {   // a hero is named, never built
    const engine = path.join(cfg.sourceRoot || cfg.repoRoot, st.lib.engine || 'work/recipe-board-v1/style-lab/engine');
    const done = new Set();
    for (const x of st.items.filter((i) => i.spec.missing && i.spec.route !== 'hero')) {
      const id = buildId(x.spec);
      if (done.has(id)) continue; done.add(id);
      log(`  building ${x.spec.route === 'teardown' ? 'subject' : 'scene'} ${id} for ${x.shot.shotId}: "${x.spec.want}"`);
      try {
        // a subject's parts plan is the agent's task (tasks/subject-<id>): until it is answered and passes, the beat keeps its TODO plate
        if (x.spec.route === 'teardown') {
          const r = await (await import(pathToFileURL(path.join(engine, 'build', 'subject.mjs')).href)).buildSubject(id, x.spec.want, { context: x.spec.about || '', log: (l) => log('  ' + l), task: { cfg, project: id0 } });
          if (r.waiting || r.rejected) { waiting.push({ id, shot: x.shot.shotId, task: r.task, ...(r.errors ? { errors: r.errors } : {}) }); continue; }
        } else await (await import(pathToFileURL(path.join(engine, 'build', 'scene.mjs')).href)).buildScene(id, x.spec.about || x.spec.want, { look: st.look.look || '', log: (l) => log('  ' + l) });
        built.push(id);
      } catch (e) { log(`  ${id} build failed: ${String(e.message || e).split('\n')[0]}`); }
    }
    // what was built answers its beat from now on: start over with the library as it is now
    if (built.length) return { ...(await stepStage(cfg, id0, { only, log, build: false })), built, waiting };
  }
  if (!st.ready.length) return { ...st, made: [], built, waiting };
  let t = 0;
  const list = { contract: 'A1ShotList/v1', id: `${id}-stage`, line: `${id}: 3D plates`, total: 0, shots: [] };
  for (const x of st.ready) {
    const dur = +(x.shot.motion?.duration || 5);
    list.shots.push({ ...stageShot(st.lib, x.spec, st.look, dur, x.shot.shotId), span: [+t.toFixed(3), +(t + dur).toFixed(3)], text: x.shot.subtitle || '', why: `${x.spec.route} ${x.spec.subject || x.spec.scene || x.spec.template}` });
    t += dur;
  }
  list.total = +t.toFixed(3);
  fs.mkdirSync(stageDir(cfg, id), { recursive: true });
  // Blender plates are rendered here, not by the engine's page renderer
  const plates = list.shots.filter((s) => String(s.template || '').startsWith('blender:'));
  list.shots = list.shots.filter((s) => !String(s.template || '').startsWith('blender:'));
  { let t2 = 0; for (const s of list.shots) { const d = s.span[1] - s.span[0]; s.span = [+t2.toFixed(3), +(t2 + d).toFixed(3)]; t2 += d; } list.total = +t2.toFixed(3); }   // the engine's list without the plates
  const L = filmLook(cfg, id);
  for (const s of plates) {
    const f = plateOf(cfg, id, s.id, s.medium);
    if (fs.existsSync(f) && !st.due.includes(s.id) && !plateStale(f, plateScript(cfg, s.template))) continue;
    try { renderBlenderPlate(cfg, s.template, s.params || {}, { dur: s.span[1] - s.span[0], out: f, palette: { paper: L.paper, ink: L.ink, accent: L.accent }, log }); st.due.push(s.id); }
    catch (e) { log(`  ${s.id} ${String(e.message || e).slice(0, 200)}`); }
  }
  const listFile = path.join(stageDir(cfg, id), 'shotlist.json');
  fs.writeFileSync(listFile, JSON.stringify(list, null, 1) + '\n');
  const engine = path.join(cfg.sourceRoot || cfg.repoRoot, st.lib.engine || 'work/recipe-board-v1/style-lab/engine');
  const { make, codeFiles } = await import(pathToFileURL(path.join(engine, 'director', 'make.mjs')).href);
  // also due: a plate older than the engine code it was made with (a rebuilt model, a changed template)
  const due = new Set(st.due);
  for (const s of list.shots) {
    const f = plateOf(cfg, id, s.id, s.medium);
    if (fs.existsSync(f) && codeFiles(s.template, s.params).some((c) => fs.statSync(c).mtimeMs > fs.statSync(f).mtimeMs)) due.add(s.id);
  }
  const engineDue = [...due].filter((d) => list.shots.some((s) => s.id === d));
  if (engineDue.length) await make(listFile, { fps: 30, only: engineDue });   // a film whose only 3D beat is a Blender plate calls no engine render
  const made = [];
  for (const x of st.ready) {
    const f = plateOf(cfg, id, x.shot.shotId, plateMedium(st.lib, x.spec, st.look));
    if (!fs.existsSync(f)) { log(`  ${x.shot.shotId} no plate rendered`); continue; }
    if (due.has(x.shot.shotId)) { write(x.shot, { stage: x.spec, video: { path: rel(cfg, f), in: 0 } }); made.push(x.shot.shotId); }
  }
  return { ...st, made, built, waiting };
}
