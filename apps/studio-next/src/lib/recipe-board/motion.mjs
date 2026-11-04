import { assertScopeAllows } from './project-scope.mjs';
// Motion builds: card + shot cues -> HyperFrames composition -> MP4 -> stacked comparison with the
// reference clip. A shot opts in with a `motion` block:
//   motion: { preset, duration, cues, ref: { start }, cuts: [0, 1.3, ...] }   (cuts only with scenes)
//   scenes: [{ slots, subtitle, cues }]   optional; each scene reuses the shot's recipe
// Output lives under projects/<id>/out/motion/<shotId>/ (generated, not committed).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { JOBS } from './pool.mjs';
import { fileURLToPath } from 'node:url';
import { worldContext } from './world.mjs';
import { filmPhotoTokens } from './filmlook.mjs';
import { displayContext } from './display.mjs';
import { composeParts, FONT_FILES, FIT_TEXT, heroPlan, withHero } from './compose.mjs';
import { resolveImageSlot, describeMissing, imageFills } from './resolve.mjs';
import { assertRenderStorage, projectPaths, loadProject, loadShots, loadRecipe, loadTheme, projectTheme, sourcePath, readPlan } from './store.mjs';
import { voiceState } from './voice.mjs';
import { compileScreenCamera, loadTelemetry, readingFocus } from './screen.mjs';
import { sameSceneKeep, titleOverSame } from './scenes.mjs';
import { samePicture } from './design-check.mjs';
import { locatePhrases } from './modules.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require_ = (p) => path.join(HERE, p);
const HYPERFRAMES = 'hyperframes@0.8.16';

const labelsFor = async (cfg, tokens) => { const L = await import('./labels.mjs'); return L.tintPlates(L.labelPlates(cfg, { generate: true }), L.colorsIn(tokens)); };
async function resolveScene(cfg, recipe, scene) {
  const ctx = { repoRoot: cfg.sourceRoot, browser: null, captureDir: null, force: false };
  // the paper props under words (labels.mjs): a chip is one of them, never a flat rectangle
  const resolved = { __labels: await labelsFor(cfg, recipe.tokens) };
  const degraded = [];
  for (const [name, fill] of imageFills(recipe, scene.slots)) {
    // URL screenshots need the static renderer's browser; motion builds use files or fall back.
    const r = await resolveImageSlot(ctx, name, { ...fill, screenshot: /^https?:/.test(fill.screenshot || '') ? null : fill.screenshot }, recipe.tokens);
    resolved[name] = r;
    if (r.level !== 'asset') degraded.push(describeMissing(name, fill, r));
  }
  for (const [name, slot] of Object.entries(recipe.slots)) {
    const fill = scene.slots?.[name];
    if (slot.kind === 'chat') {
      for (const [who, a] of Object.entries(fill?.avatars || {})) {
        const r = await resolveImageSlot(ctx, `avatar:${who}`, { asset: a.asset }, recipe.tokens);
        if (r.level === 'asset') (resolved.__avatars ||= {})[who] = { url: r.url, position: a.position, zoom: a.zoom };
      }
    }
  }
  for (const [i, l] of (scene.layers || []).entries()) {
    const r = await resolveImageSlot(ctx, `layer${i}`, l.fill || {}, recipe.tokens);
    resolved[`__layer${i}`] = r;
    if (r.level !== 'asset') degraded.push(describeMissing(`layer${i}`, l.fill || {}, r));
  }
  if (scene.backdrop) {
    const r = await resolveImageSlot(ctx, 'backdrop', scene.backdrop, recipe.tokens);
    resolved.__backdrop = r;
    if (r.level !== 'asset') degraded.push(describeMissing('backdrop', scene.backdrop, r));
  }
  return { resolved, degraded };
}

// Give each footage <video> the scene's window on the root timeline and its source in-point.
function timeVideos(html, { start, duration }, scene) {
  let n = 0;
  return html.replace(/<video src="([^"]+)" data-media-in="([\d.]+)"(?: data-media-out="([\d.]+)")?/g, (_, src, inPt, outPt) => {
    const len = outPt ? Math.min(duration, Number(outPt) - Number(inPt)) : duration;
    return `<video id="v${scene}-${n++}" class="clip" src="${src}" data-start="${start}" data-duration="${+len.toFixed(3)}" data-media-start="${inPt}" data-track-index="${scene + 1}"`;
  });
}

// Copy every file:// reference into assets/ and point the markup at the copy. A copy is refreshed when the
// source changed under the same path (size or modification time), e.g. a re-captured page.
export function localiseFiles(html, assetsDir) {
  return html.replace(/file:\/\/(\/[^'")\s]+)/g, (_, abs) => {
    const file = decodeURIComponent(abs);
    const name = crypto.createHash('sha256').update(file).digest('hex').slice(0, 10) + '-' + path.basename(file);
    const dest = path.join(assetsDir, name);
    const src = fs.statSync(file);
    const stale = !fs.existsSync(dest) || fs.statSync(dest).size !== src.size || fs.statSync(dest).mtimeMs < src.mtimeMs;
    if (stale) { fs.copyFileSync(file, dest); fs.utimesSync(dest, src.atime, src.mtime); }
    return `assets/${name}`;
  });
}

// When each character of the beat is spoken, in seconds of the shot: from the recording's word timings
// (its span stretched to the shot's length), or spread over the shot by character when there is none.
// The runtime builds the card to it: a line types in when it is said, a keyword lights up when it is said.
const normChars = (t) => String(t || '').replace(/[\s，。！？、,.!?;；:："“”'‘’（）()《》\-—…\[\]]/g, '').toLowerCase();
export function speechFor(cfg, id, shot) {
  const dur = shot.motion?.duration || 4;
  const beat = (readPlan(cfg, id)?.beats || []).find((b) => b.id === shot.shotId);
  const v = voiceState(cfg, id);
  // a replica shot is one cut of the reference: its words are the reference's words in that window
  const replicaWords = shot.replica && loadProject(cfg, id).replicaWords;
  const span = replicaWords ? { start: shot.replica.start, end: shot.replica.start + shot.replica.len } : v.state === 'current' ? v.timings.beats?.[shot.shotId] : null;
  const wordsFile = replicaWords || (v.state === 'current' ? v.timings.words : null);
  let chars = '', times = [];
  if (span && wordsFile) {
    const wf = path.isAbsolute(wordsFile) ? wordsFile : fs.existsSync(path.join(cfg.sourceRoot, wordsFile)) ? path.join(cfg.sourceRoot, wordsFile) : path.join(projectPaths(cfg, id).root, wordsFile);
    const words = JSON.parse(fs.readFileSync(wf, 'utf8')).segments.flatMap((x) => x.words || []);
    const k = dur / Math.max(0.5, span.end - span.start);
    for (const w of words) {
      const t = w.startMs / 1000;
      if (t < span.start - 0.05 || t >= span.end) continue;
      for (const c of normChars(w.word)) { chars += c; times.push(+(Math.max(0, t - span.start) * k).toFixed(2)); }
    }
  }
  if (!chars) {
    // no recording (or a synthetic read without word timings): the beat's text spread over the shot
    const text = normChars(beat?.text || '');
    const a = Math.min(0.3, dur * 0.1), z = dur * 0.88;
    chars = text; times = [...text].map((_, i) => +(a + ((z - a) * i) / Math.max(1, text.length)).toFixed(2));
  }
  return { chars, times };
}

// Subtitles the way the reference sets them: short phrases, each up while it is said. From the recording's
// word timings (a new phrase at each recognised segment, a pause over 0.35 s, or past 14 characters),
// or, without one, the beat's text cut at punctuation and every 14 characters, spread over the shot.
export const SUB_MAX = 15;
// where a long phrase breaks best: after a particle, before a pronoun / conjunction, at digit|CJK edges
const AFTER = new Set([...'的了是就在和也都把被给着过']), BEFORE = new Set([...'一这那但而所我你他她它们也又才还再']);
export function splitPhrase(units, max = SUB_MAX) {
  const len = (us) => us.reduce((a, u) => a + [...u.text].length, 0);
  if (len(units) <= max || units.length < 2) return [units];
  const total = len(units);
  let best = 1, bestScore = -1e9, acc = 0;
  for (let k = 1; k < units.length; k++) {
    acc += [...units[k - 1].text].length;
    const a = units[k - 1].text.slice(-1), b = units[k].text[0];
    const edge = (/[0-9a-z%]/i.test(a) !== /[0-9a-z%]/i.test(b)) ? 2 : 0;
    const score = (AFTER.has(a) ? 3 : 0) + (BEFORE.has(b) ? 2 : 0) + edge - Math.abs(acc - total / 2) * 0.6 - (acc < 3 || total - acc < 3 ? 20 : 0);
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return [...splitPhrase(units.slice(0, best), max), ...splitPhrase(units.slice(best), max)];
}
export function subtitlesFor(cfg, id, shot) {
  const dur = shot.motion?.duration || 4;
  const v = voiceState(cfg, id);
  const replicaWords = shot.replica && loadProject(cfg, id).replicaWords;
  const span = replicaWords ? { start: shot.replica.start, end: shot.replica.start + shot.replica.len } : v.state === 'current' ? v.timings.beats?.[shot.shotId] : null;
  const wordsFile = replicaWords || (v.state === 'current' ? v.timings.words : null);
  let groups = [];
  if (span && wordsFile) {
    const wf = path.isAbsolute(wordsFile) ? wordsFile : fs.existsSync(path.join(cfg.sourceRoot, wordsFile)) ? path.join(cfg.sourceRoot, wordsFile) : path.join(projectPaths(cfg, id).root, wordsFile);
    const k = dur / Math.max(0.5, span.end - span.start);
    let cur = null, lastEnd = 0;
    JSON.parse(fs.readFileSync(wf, 'utf8')).segments.forEach((seg, si) => (seg.words || []).forEach((w) => {
      const t = w.startMs / 1000;
      if (t < span.start - 0.05 || t >= span.end) return;
      const text = String(w.word).trim().replace(/[，。！？；、,.!?;]+$/, '');
      if (!text) return;
      if (!cur || cur.seg !== si || t - lastEnd > 0.35) { cur = { seg: si, units: [] }; groups.push(cur); }
      cur.units.push({ text, at: +(Math.max(0, t - span.start) * k).toFixed(2) });
      lastEnd = w.endMs / 1000;
    }));
    groups = groups.map((g) => g.units);
  }
  if (!groups.length) {
    const beat = (readPlan(cfg, id)?.beats || []).find((b) => b.id === shot.shotId);
    const text = String(beat?.text || shot.subtitle || '').replace(/\s+/g, '');
    const chars = [...text];
    const n = chars.filter((c) => !/[，。！？；、,.!?;]/.test(c)).length || 1;
    let i = 0, g = [];
    for (const c of chars) {
      if (/[，。！？；、,.!?;]/.test(c)) { if (g.length) groups.push(g); g = []; continue; }
      g.push({ text: c, at: +(0.1 + (dur - 0.3) * i++ / n).toFixed(2) });
    }
    if (g.length) groups.push(g);
  }
  const join = (us) => us.reduce((s, u) => s + (/[a-z]$/i.test(s) && /^[a-z]/i.test(u.text) ? ' ' : '') + u.text, '');
  // the transcript's misheard names are corrected as on the cards (project glossary)
  const glossary = loadProject(cfg, id).glossary || {};
  const fix = (t) => Object.entries(glossary).reduce((x, [wrong, right]) => x.split(wrong).join(right), t);
  return groups.flatMap((g) => splitPhrase(g)).map((us) => [us[0].at, fix(join(us))]);
}

// Preset names the browser runtime defines; a shot naming anything else fails here, not silently.
const RUNTIME_PRESETS = new Set([...fs.readFileSync(require_('motion-runtime.browser.js'), 'utf8').matchAll(/(?:presets\.(\w+) = |^ {4}(\w+)\(tl, scene)/gm)].map((m) => m[1] || m[2]));

export async function buildMotion(cfg, id, shot) {
  assertScopeAllows(loadProject(cfg, id), 'motion');
  assertRenderStorage(cfg, id);
  const m = shot.motion;
  if (!m) throw new Error(`${shot.shotId} has no motion block`);
  for (const p of [m.preset, ...(shot.scenes || []).map((s) => s.preset)].filter(Boolean)) {
    if (!RUNTIME_PRESETS.has(p)) throw new Error(`${shot.shotId}: unknown motion preset "${p}" (have: ${[...RUNTIME_PRESETS].join(', ')})`);
  }
  const theme = projectTheme(cfg, id);
  const photo = filmPhotoTokens(cfg, id), withPhoto = (r) => ({ ...r, tokens: { ...r.tokens, ...photo } });   // the film's way with found photos (filmlook.mjs)
  const baseRecipe = withPhoto(loadRecipe(cfg, shot.recipe, theme));
  const dir = path.join(projectPaths(cfg, id).out, 'motion', shot.shotId);
  const assets = path.join(dir, 'assets');
  fs.mkdirSync(path.join(assets, 'fonts'), { recursive: true });
  for (const file of Object.values(FONT_FILES)) {
    const dest = path.join(assets, 'fonts', file);
    if (!fs.existsSync(dest)) fs.copyFileSync(new URL(`../../../public/a1-editorial-fonts/${file}`, import.meta.url), dest);
  }
  fs.copyFileSync(path.join(cfg.repoRoot, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), path.join(assets, 'gsap.min.js'));
  fs.copyFileSync(require_('motion-runtime.browser.js'), path.join(assets, 'motion-runtime.js'));
  // marks on page words: one way for every module (modules/marks.js)
  fs.copyFileSync(path.join(cfg.dataDir, 'modules', 'marks.js'), path.join(assets, 'marks.js'));

  // a beat cut from a continuous diagram is one picture: the diagram makes its own moves, so the storyboard's cuts
  // inside the beat (each with a stand-in of its own) are not played over it (paperclip-138-full: 31 chapter beats
  // came out grey in the reel, their cuts showing the stand-ins while the still showed the diagram)
  // a cut that shows what the one before shows is no cut (writer sameSceneKeep: B04 marked one sentence three times)
  // and a cut that only lays a title over the same picture is the title coming on over the running picture (scenes.mjs
  // titleOverSame; the picture compared by its look, design-check.mjs samePicture: two copies of one photograph)
  // the film's turn of hero title mechanisms (compose.mjs heroPlan), given before the scenes merge
  const heroes = heroPlan(loadShots(cfg, id));
  if (shot.scenes) shot = { ...shot, scenes: shot.scenes.map((sc, i) => withHero(sc, heroes[`${shot.shotId}:${i}`])) }; else shot = withHero(shot, heroes[`${shot.shotId}:0`]);
  const over = shot.scenes ? titleOverSame(shot.scenes, m.cuts || [], (a, b) => samePicture(path.resolve(cfg.sourceRoot, a), path.resolve(cfg.sourceRoot, b)), (sc) => sc.recipe || shot.recipe) : null;
  const keep0 = shot.scenes ? sameSceneKeep(shot.scenes, (sc) => sc.recipe || shot.recipe) : null;
  const keepS = keep0 ? keep0.map((k, i) => k && over.keep[i]) : null;
  const ownCuts = shot.scenes && !shot.slots?.background?.chapter ? over.scenes.filter((_, i) => keepS[i]) : null;
  const scenes = (ownCuts || [shot]).map((s) => ({ ...shot, ...s, slots: s.slots || shot.slots, scenes: undefined }));
  const cuts = ownCuts ? (m.cuts || []).filter((_, i) => keepS[i]) : [0];
  const timing = scenes.map((_, i) => ({ start: cuts[i], duration: (cuts[i + 1] ?? m.duration) - cuts[i] }));
  let css = '';
  let body = '';
  const degradedAll = [];
  for (const [i, scene] of scenes.entries()) {
    // A scene may use its own card (e.g. a market table after a title plate).
    const recipe = scene.recipe ? withPhoto(loadRecipe(cfg, scene.recipe, theme)) : baseRecipe;
    const { resolved, degraded } = await resolveScene(cfg, recipe, scene);
    degradedAll.push(...degraded);
    if (recipe.world) resolved.__world = worldContext(cfg, projectPaths(cfg, id).root, recipe.world, scene);
    const dc = displayContext(cfg, id, loadTheme(cfg, theme), scene, scene.recipe || shot.recipe, resolved, i);
    if (dc) resolved.__display = { ...dc, url: 'file://' + dc.file };
    const p = composeParts({ recipe, shot: scene, resolved, degraded, fontBase: 'assets/fonts/', video: true });
    // a frame the world rebuilt is moved by the world's own preset (windows open, type comes on)
    if (p.display) { scenes[i].preset = 'plate'; if (!ownCuts) m.preset = 'plate'; }
    else if (p.ownsFocus) { scenes[i].preset = 'world'; if (!ownCuts) m.preset = 'world'; }
    if (i === 0) css += p.css.split('\n').filter((l) => l.startsWith('@font-face')).join('\n') + '\n';
    // Scope each scene's rules under its section (native CSS nesting) so scenes cannot collide.
    css += `#scene-${i}{${p.css.split('\n').filter((l) => !l.startsWith('@font-face')).join('\n')}}\n`;
    // Scenes are untimed wrappers shown/hidden by the runtime, so footage inside them can carry its
    // own HyperFrames timing (a timed <video> may not sit under a timed ancestor).
    const content = timeVideos(p.content, timing[i], i);
    body += `<section id="scene-${i}" class="scene"${i ? ' style="opacity:0"' : ''}>
  <div class="stage"><div class="cam">${content}</div>${p.overlays}${subtitles(m, i, p.onLight) ?? p.subtitle}${p.todo}</div>
</section>\n`;
  }
  // Screen scenes: the camera is compiled here by the main-line compilers and replayed per frame.
  const screenCues = scenes.map((s, i) => {
    if ((s.preset || m.preset) !== 'screen') return {};
    const cam = screenCamera(cfg, id, s, timing[i].duration);
    fs.writeFileSync(path.join(dir, scenes.length > 1 ? `screen-camera-${i}.json` : 'screen-camera.json'), JSON.stringify(cam.report, null, 1) + '\n');
    return { screenTrack: { fps: cam.fps, claim: cam.claim, samples: cam.samples }, ...readHighlight(cfg, s) };
  });
  // Chat scenes: messages land within the scene (a short chat cut used to end before its bubbles came in)
  const chatTimes = scenes.map((s, i) => {
    const cues = { ...(m.cues || {}), ...(s.cues || {}) };
    if ((s.preset || m.preset) !== 'chat' || cues.bubbles) return {};
    return { bubbles: chatCues((s.slots?.data?.messages || []).length, timing[i].duration) };
  });
  const speech = speechFor(cfg, id, shot);
  // short timed subtitles unless the shot sets its own (or none)
  // none at all under the house rules (the user adds subtitles in the edit)
  const { subtitlesOn, houseFonts, houseCoverScript } = await import('./house.mjs');
  const houseCover = houseFonts().ready ? houseCoverScript() : '';
  if (!subtitlesOn()) m.subtitles = null;
  else if (!m.subtitles && !shot.noSubtitle) m.subtitles = subtitlesFor(cfg, id, shot);
  const spec = { preset: m.preset, cues: m.cues || {}, speech, scenes: scenes.map((s, i) => ({ id: `scene-${i}`, ...timing[i], preset: s.preset, cues: { ...(s.cues || {}), ...chatTimes[i], ...screenCues[i] } })) };
  const title3d = m.title3d ? buildTitle3D(cfg, m, assets) : null;
  // mechanism diagrams (mechanism-3d): three.js + the module, mounted on the timeline at their scene's start
  const mech = body.includes('class="mech"');
  if (mech) {
    copyThree(cfg, assets);
    fs.copyFileSync(require_('motion-mechanism.browser.js'), path.join(assets, 'mechanism.js'));
  }
  const importmap = title3d ? title3d.head : mech ? `<script type="importmap">{"imports":{"three":"./assets/three/three.module.js"}}</script>` : '';
  const mechMount = mech ? `for (const el of document.querySelectorAll('.mech')) {
  const i = Number(el.closest('.scene').id.replace('scene-', ''));
  mountMechanism({ root: el, spec: JSON.parse(el.dataset.spec), theme: JSON.parse(el.dataset.theme), duration: ${JSON.stringify(timing.map((x) => x.duration))}[i], offset: ${JSON.stringify(timing.map((x) => x.start))}[i], tl });
}` : '';
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" /><meta name="viewport" content="width=1920, height=1080" />
<!-- Generated by recipe-board motion build for ${id}/${shot.shotId} (card ${shot.recipe}, preset ${m.preset}). Do not edit. -->
<script src="assets/gsap.min.js"></script><script src="assets/marks.js"></script><script src="assets/motion-runtime.js"></script>
<style>
html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:${baseRecipe.tokens.bg}}
#three-layer{position:absolute;inset:0;width:100%;height:100%;z-index:5;pointer-events:none}
#root{position:relative;width:100%;height:100%;overflow:hidden}
.scene{position:absolute;inset:0}
.cam{position:absolute;inset:0}
${css}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="${m.duration}" data-width="1920" data-height="1080">
${body}${title3d ? '<canvas id="three-layer"></canvas>' : ''}</div>
${importmap}
${houseCover ? `<script>${houseCover}</script>` : ''}
<script${title3d || mech ? ' type="module"' : ''}>
${title3d ? "import { mountTitle3D } from './assets/title3d.js';" : ''}
${mech ? "import { mountMechanism } from './assets/mechanism.js';" : ''}
const tl = gsap.timeline({ paused: true });
${FIT_TEXT}
document.fonts.ready.then(() => { ${FIT_TEXT} });
A1Motion.build(tl, ${JSON.stringify(spec)});
${mechMount}
${title3d ? `mountTitle3D({ canvas: document.getElementById('three-layer'), glyphs: ${title3d.glyphs}, cfg: ${JSON.stringify({ ...m.title3d, duration: m.duration })}, tl });` : ''}
window.__timelines["main"] = tl;
</script></body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), localiseFiles(html, assets));
  if (!fs.existsSync(path.join(dir, 'hyperframes.json'))) {
    fs.writeFileSync(path.join(dir, 'hyperframes.json'), JSON.stringify({ paths: { assets: 'assets' }, media: { autoProxy: true } }, null, 2) + '\n');
  }
  return { dir, degraded: degradedAll };
}

// Timed subtitles over the whole shot (motion.subtitles: [[at, text], ...]), placed in the first
// scene and switched by the runtime; null keeps the card's single subtitle.
const escHtml = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
function subtitles(m, sceneIndex, onLight = false) {
  if (!m.subtitles) return null;
  if (sceneIndex) return '';
  return m.subtitles.map(([at, text], k) => `<div class="subtitle${onLight ? ' on-light' : ''}" data-sub-at="${at}" data-sub-to="${m.subtitles[k + 1]?.[0] ?? m.duration}" style="opacity:0">${escHtml(text)}</div>`).join('');
}

// A read page's highlight (cue highlight: { phrase?, at, dur, color? }): the phrase found on the page picture by OCR and
// fitted to its glyphs (modules.mjs locatePhrases), drawn by marks.js and measured by markErrors as every mark on page
// words is (AGENTS.md: no module draws its own). The phrase is the cue's, else the card's quote (the sentence read). A
// hand-placed box is no longer taken: B04's black bar ran into 甘, the next line's first character.
const PHRASES = new Map();
export function readHighlight(cfg, scene) {
  const h = scene.cues?.highlight; if (!h) return {};
  const src = scene.slots?.screen?.asset, phrase = h.phrase || scene.slots?.screen?.quote;
  if (!src || !phrase) throw new Error(`${scene.shotId}: the page's highlight names no phrase (cue highlight.phrase, or the screen's quote): its box is found on the page, never placed by hand`);
  const abs = sourcePath(cfg, src), key = `${abs}:${fs.statSync(abs).mtimeMs}:${phrase}`;
  if (!PHRASES.has(key)) PHRASES.set(key, locatePhrases(cfg, src, [phrase]));
  const { boxes, size } = PHRASES.get(key);
  return { highlight: { at: h.at ?? 0, dur: h.dur ?? 0.5, color: h.color || null, label: phrase, size, box: boxes[phrase] } };
}

// Telemetry defaults to the capture output (materials/screen/<shot>/telemetry.json); manual mode has none.
export function defaultScreenPush(duration) {
  return { at: [0.5, 0.5], scale: 1, start: 0.05, end: Math.max(0.6, duration * 0.6) };
}
function screenCamera(cfg, id, shot, duration) {
  // A screen without an explicit reading focus stays locked; a real focus may direct a push.
  const bindingsFile = path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json');
  const focus = readingFocus(fs.existsSync(bindingsFile) ? JSON.parse(fs.readFileSync(bindingsFile, 'utf8')) : null, shot);
  const push = focus ? { at: focus.at, scale: focus.scale, start: 0.1, end: Math.min(1.4, Math.max(0.6, duration * 0.35)) } : defaultScreenPush(duration);
  const screen = shot.screen?.camera ? shot.screen : { ...(shot.screen || {}), camera: { mode: 'manual', push } };
  const file = screen.telemetry ? sourcePath(cfg, screen.telemetry) : path.join(projectPaths(cfg, id).root, 'materials', 'screen', shot.shotId, 'telemetry.json');
  const telemetry = screen.camera?.mode !== 'manual' && fs.existsSync(file) ? loadTelemetry(file) : null;
  return compileScreenCamera({ shotId: shot.shotId, duration, screen, telemetry });
}

// When each chat message lands (seconds into the scene): just after the card settles (0.6 s), then every
// 0.5 s, pulled in for a short scene so the last message is up 0.6 s before the cut. At 1.5 s a one-line
// chat showed an empty card for a third of its shot (clara B34, reel 2026-10-20).
export function chatCues(n, duration) {
  const start = Math.min(0.6, Math.max(0.3, duration * 0.2));
  const step = n > 1 ? Math.min(0.5, Math.max(0.12, (duration - 0.6 - start) / (n - 1))) : 0;
  return Array.from({ length: n }, (_, i) => +(start + i * step).toFixed(3));
}

// three.js copied into the motion page's assets (the page is served, not opened from disk)
function copyThree(cfg, assets) {
  const three = path.join(cfg.sourceRoot, 'remotion-renderer', 'node_modules', 'three');
  fs.mkdirSync(path.join(assets, 'three'), { recursive: true });
  for (const f of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(three, 'build', f), path.join(assets, 'three', f));
  return three;
}

// Extruded real-font title layer: glyph outlines from the font file, three.js copied locally.
function buildTitle3D(cfg, m, assets) {
  const font = new URL(`../../../public/a1-editorial-fonts/${FONT_FILES[m.title3d.font || 'A1 Serif Heavy']}`, import.meta.url);
  const glyphs = execFileSync('python3', [require_('glyph_paths.py'), fileURLToPath(font), m.title3d.text], { encoding: 'utf8', maxBuffer: 32 << 20 });
  const three = copyThree(cfg, assets);
  const dest = path.join(assets, 'three');
  fs.mkdirSync(path.join(dest, 'addons', 'loaders'), { recursive: true });
  fs.copyFileSync(path.join(three, 'examples', 'jsm', 'loaders', 'SVGLoader.js'), path.join(dest, 'addons', 'loaders', 'SVGLoader.js'));
  fs.copyFileSync(require_('motion-title3d.browser.js'), path.join(assets, 'title3d.js'));
  const head = `<script type="importmap">{"imports":{"three":"./assets/three/three.module.js","three/addons/":"./assets/three/addons/"}}</script>`;
  return { glyphs, head };
}

// Directory-only renderers have no cfg/id: check every existing real ancestor for
// project authority before creating output or invoking the renderer. Standalone
// directories with no discoverable project retain their legacy behaviour.
function assertMotionDirectoryScope(dir) {
  let current = path.resolve(dir);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  // Check lexical ancestors too: a project-owned symlink may point outside it.
  for (const start of [current, fs.realpathSync(current)]) {
    for (let ancestor = start;;) {
      const manifest = path.join(ancestor, 'project.json');
      if (fs.existsSync(manifest)) assertScopeAllows(JSON.parse(fs.readFileSync(manifest, 'utf8')), 'motion');
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
  }
}

export function renderMotion(dir, { fps = 60 } = {}) {
  assertMotionDirectoryScope(dir);
  fs.mkdirSync(path.join(dir, 'renders'), { recursive: true });
  const out = path.join(dir, 'renders', 'motion.mp4');
  const run = (env) => execFileSync('npx', ['--yes', HYPERFRAMES, 'render', dir, '-q', 'high', '--fps', String(fps), '-o', out], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PRODUCER_BROWSER_GPU_MODE: 'hardware', ...env }, maxBuffer: 64 << 20,
  });
  try { run({}); } catch (e) {
    // the renderer's shared frame-extraction cache (in the system temp folder) can hold a bad entry for a
    // clip (0 frames), and every later render of that clip fails on it: try once more with a fresh cache
    if (!/captured 0 of expected|Extracting video frames/i.test(String(e.stderr || e.stdout || e.message))) throw e;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-hf-'));
    try { run({ TMPDIR: tmp + '/' }); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  return out;
}

// the same render without blocking, for renders run side by side (pool.mjs): each takes its share of the cores
// as Chrome workers (HyperFrames' own auto count assumes it has the machine to itself)
export const motionWorkers = (jobs = JOBS) => Math.max(2, Math.floor(os.cpus().length / jobs));
// quality / out: the white model (animatic.mjs) renders the same page at draft quality and a low rate beside the final
export async function renderMotionAsync(dir, { fps = 60, workers = motionWorkers(), quality = 'high', out = path.join(dir, 'renders', 'motion.mp4') } = {}) {
  assertMotionDirectoryScope(dir);
  assertMotionDirectoryScope(path.dirname(path.resolve(out)));
  fs.mkdirSync(path.join(dir, 'renders'), { recursive: true });
  const run = (env) => new Promise((ok, fail) => execFile('npx', ['--yes', HYPERFRAMES, 'render', dir, '-q', quality, '--fps', String(fps), '--workers', String(workers), '-o', out], {
    env: { ...process.env, PRODUCER_BROWSER_GPU_MODE: 'hardware', ...env }, maxBuffer: 64 << 20,
  }, (e, stdout, stderr) => (e ? fail(Object.assign(e, { stdout, stderr })) : ok())));
  try { await run({}); } catch (e) {
    if (!/captured 0 of expected|Extracting video frames/i.test(String(e.stderr || e.stdout || e.message))) throw e;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-hf-'));
    try { await run({ TMPDIR: tmp + '/' }); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  return out;
}

export function lintMotion(dir) {
  try {
    return execFileSync('npx', ['--yes', HYPERFRAMES, 'lint', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return String(e.stdout || '') + String(e.stderr || '');
  }
}

// HyperFrames' own checks on a built shot: lint, runtime errors, layout (text clipped, panels off the
// canvas), motion and contrast. Lint errors stop the shot as before; the rest is a report beside the render
// (renders/check.json) that the run lists. Info-level notes are left out.
export function checkMotion(dir) {
  let raw = '';
  try {
    raw = execFileSync('npx', ['--yes', HYPERFRAMES, 'check', dir, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, env: { ...process.env, PRODUCER_BROWSER_GPU_MODE: 'hardware' } });
  } catch (e) { raw = String(e.stdout || ''); }
  return parseCheck(raw);
}
export function parseCheck(raw) {
  const i = raw.indexOf('\n{'), j = raw.lastIndexOf('}');
  let r;
  try { r = JSON.parse(raw.slice(raw.startsWith('{') ? 0 : i + 1, j + 1)); } catch { return { ok: false, lintErrors: 1, findings: [{ section: 'check', severity: 'error', code: 'no-report', message: raw.slice(-400) }] }; }
  const findings = [];
  for (const [section, v] of Object.entries(r)) {
    if (!v || typeof v !== 'object' || !Array.isArray(v.findings)) continue;
    for (const x of v.findings) if (x.severity !== 'info') findings.push({ section, severity: x.severity, code: x.code, message: x.message, selector: x.selector, time: x.time, text: x.text });
  }
  return { ok: !!r.ok, lintErrors: r.lint?.errorCount ?? 0, findings };
}

// Reference clip on top, motion build below, same timecode, plus a 2 fps strip for quick reading.
export function compareMotion(cfg, id, shot, motionFile) {
  const project = loadProject(cfg, id);
  const clip = sourcePath(cfg, (project.referenceClips || '').replace('{shot}', shot.motion.refShot || shot.referenceShot || shot.shotId));
  if (!clip || !fs.existsSync(clip)) return null;
  const dir = path.dirname(motionFile);
  const out = path.join(dir, 'vs-original.mp4');
  const start = shot.motion.ref?.start ?? 0;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(start), '-t', String(shot.motion.duration), '-i', clip, '-i', motionFile,
    '-filter_complex', '[0:v]fps=60,scale=960:540[a];[1:v]scale=960:540[b];[a][b]vstack', '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', out]);
  const strip = path.join(dir, 'vs-strip.jpg');
  const n = Math.ceil(shot.motion.duration * 2);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', out, '-vf', `fps=2,scale=300:-1,tile=${Math.min(n, 12)}x${Math.ceil(n / 12)}`, '-frames:v', '1', strip]);
  return { video: out, strip };
}
