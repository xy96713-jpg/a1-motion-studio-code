// Medium stage: a finished flat motion render is put on an emulated display (LED / CRT / halftone) and
// filmed by a virtual camera (medium-runtime.browser.js), or (`tube`) shown whole on an old CRT: scanlines
// whose width follows brightness, phosphor mask, glow, convergence, curved glass, analogue noise (tube.py,
// frame by frame, no browser). The house themes set `tube` for every packaging shot by default. Runs after `motion`; a shot without a medium
// (shot.medium, project.medium, theme.medium — or an explicit override) is skipped, so projects that
// never set one are untouched.
//
//   out/medium/<kind>/<shot>/medium.mp4   the shot as filmed
//   out/medium/<kind>/<shot>/strip.jpg    2 fps contact strip
//   out/medium/<kind>/<shot>/source.key   input + settings + code hash (re-run only when it changes)
//
// Medium settings (any level; later levels override earlier ones, objects merge):
//   { kind: 'led'|'crt'|'halftone'|'tube', preset: 'arcade'|'pvm'|'soft' (tube), strength: 'subtle'|'medium'|'full'|0..1, cells: [480, 270], lens: {...}, led: {...}, polarity: 'auto'|0|1,
//     shots: [shot ids that use it] (project level), apply: 'marked' (default) | 'all',
//     bypass: [recipe ids that stay clean] (default BYPASS_RECIPES),
//     camera: { move: 'locked'|'push'|'reframe'|'punch', amount, at, frames, to, in: 'cut'|'whip', out: 'cut'|'whip', shake: [...], handheld } }
// A shot uses the medium only when marked: shot.medium (true or settings) or project.medium.shots.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { projectPaths, loadProject, loadTheme, projectTheme } from './store.mjs';
import { assertScopeAllows } from './project-scope.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE = ['medium.mjs', 'medium-runtime.browser.js', 'tube.py', 'print.py'];
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 20);
const ff = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const probe = (file, entries) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', entries, '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();

// Numbers measured on the display-v2 style lab (480x270 cells for 1080p delivery: beads >= 4 px).
export const MEDIUM_DEFAULTS = {
  led: { cells: [480, 270], led: { gain: 1.75, radius: 0.36 }, lens: { bloom: 0.55, threshold: 0.45, chroma: 0.5, defocus: 0.4, vignette: 0.32, grain: 0.035 } },
  crt: { cells: [480, 270], led: { gain: 1.75, radius: 0.36 }, lens: { bloom: 0.6, threshold: 0.4, chroma: 1.2, defocus: 0.35, vignette: 0.45, grain: 0.04 } },
  halftone: { cells: [480, 270], led: { gain: 1.75, radius: 0.36 }, lens: { bloom: 0, threshold: 0.9, chroma: 0.6, defocus: 0.25, vignette: 0.22, grain: 0.03 } },
  // presets in tube.py (style-lab/c1-v2/out/crt/sheet.jpg compares them)
  tube: { preset: 'arcade' },
  // the print medium (print.py): the frame printed in one or two inks on paper (style-lab/calc4)
  print: { preset: 'riso' },
};
// the python that has numpy and opencv (the repo's tool venv unless A1_PYTHON says otherwise)
export const pythonFor = (cfg) => process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
export const TUBE_PRESETS = ['arcade', 'pvm', 'soft'];
export const PRINT_PRESETS = ['riso', 'riso-light', 'riso-blue', 'dither', 'gameboy'];
// media run frame by frame in python (no browser): the script and its presets
const STREAM = { tube: { script: 'tube.py', presets: TUBE_PRESETS, preset: 'arcade' }, print: { script: 'print.py', presets: PRINT_PRESETS, preset: 'riso' } };
// Real footage stays clean, like the reference: the presenter and footage plates are not filmed off a
// screen. A shot is kept clean when any slot shows the presenter plate, or its card is a footage card;
// a shot opts in anyway with its own shot.medium.
export const BYPASS_RECIPES = ['footage-plate', 'presenter-plain'];
// print is for the packaging only: a web page or a screen recording is shown as it is, and a 3D shot stands on its own
// material and light (DESIGN-harmony.md, 3D); the presenter stays clean as everywhere
export const PRINT_BYPASS = [...BYPASS_RECIPES, 'screen-full', 'hero-3d', 'scene-3d', 'teardown-3d', 'mechanism-3d'];
export function showsPresenter(project, shot, slotsList = [shot.slots, ...(shot.scenes || []).map((sc) => sc.slots)]) {
  const assets = [];
  const walk = (o) => { if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (k === 'asset' && typeof v === 'string') assets.push(v); else walk(v); } };
  slotsList.forEach(walk);
  const plate = typeof project.presenter === 'string' ? project.presenter : project.presenter?.asset;
  return assets.some((a) => a === plate || /presenter/i.test(a));
}
// The tube covers packaging only: in a shot of several scenes (a title, then footage) the spans, in
// seconds of the shot, whose scene is neither footage nor the presenter. [] when none.
export function tubeSpans(project, shot, bypass = BYPASS_RECIPES) {
  const scenes = shot.scenes || [shot];
  const cuts = shot.scenes ? shot.motion?.cuts || [0] : [0];
  const end = shot.motion?.duration ?? 0;
  const spans = [];
  scenes.forEach((sc, i) => {
    const clean = bypass.includes(sc.recipe || shot.recipe) || showsPresenter(project, shot, [sc.slots || shot.slots]);
    if (clean) return;
    const from = cuts[i] ?? 0, to = cuts[i + 1] ?? end;
    if (spans.length && spans.at(-1)[1] === from) spans.at(-1)[1] = to; else spans.push([from, to]);
  });
  return spans;
}
// Locked by default (see CAMERA.md): the card preset may already move its content; one camera owner per shot.
const CAMERA = { move: 'locked', in: 'cut', out: 'cut', overscan: 0.02 };
// Strength 0..1 fades screen structure and lens together; the medium is an accent, so the default is subtle.
export const STRENGTH = { subtle: 0.45, medium: 0.7, full: 1 };

const merge = (a, b) => {
  if (!b) return a;
  const o = { ...a };
  for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' ? merge(a[k], v) : v;
  return o;
};

// The medium for one shot, or null when none applies. override: { kind } or a full settings object.
export function resolveMedium(cfg, id, shot, override = null, { force = false } = {}) {
  const theme = loadTheme(cfg, projectTheme(cfg, id));
  const project = loadProject(cfg, id);
  // The medium is an accent, not a global filter: theme/project set the look, a shot uses it only when it is
  // marked (shot.medium, or listed in project.medium.shots), or when `force` (an explicit --only list) asks.
  // A project medium with a shot list is for those shots only; without one it covers the project.
  const listed = (project.medium?.shots || []).includes(shot.shotId);
  const projectLayer = project.medium && (!project.medium.shots || listed || project.medium.apply === 'all' || shot.medium || force) ? project.medium : null;
  const marked = !!shot.medium || listed || force || (projectLayer?.apply || theme.medium?.apply) === 'all';
  if (!marked) return null;
  const shotLayer = shot.medium === true ? {} : shot.medium;
  let m = null;
  for (const layer of [theme.medium, projectLayer, shotLayer, override]) if (layer) m = merge(m || {}, layer);
  if (!m || !m.kind || m.kind === 'none') return null;
  const bypass = m.bypass || (m.kind === 'print' ? PRINT_BYPASS : BYPASS_RECIPES);
  let spans = null;
  if (!shotLayer && STREAM[m.kind]) {
    spans = tubeSpans(project, shot, bypass);
    if (!spans.length) return null;
    if (spans.length === 1 && spans[0][0] === 0 && spans[0][1] === (shot.motion?.duration ?? 0)) spans = null;
  } else if (!shotLayer && ([shot.recipe, ...(shot.scenes || []).map((s) => s.recipe)].some((r) => bypass.includes(r)) || showsPresenter(project, shot))) return null;
  if (!MEDIUM_DEFAULTS[m.kind]) throw new Error(`${shot.shotId}: unknown medium "${m.kind}" (have: ${Object.keys(MEDIUM_DEFAULTS).join(', ')})`);
  if (STREAM[m.kind] && m.preset && !STREAM[m.kind].presets.includes(m.preset)) throw new Error(`${shot.shotId}: unknown ${m.kind} preset "${m.preset}" (have: ${STREAM[m.kind].presets.join(', ')})`);
  const full = merge(merge({ ...MEDIUM_DEFAULTS[m.kind], camera: CAMERA, polarity: 'auto' }, m), {});
  full.camera = merge(CAMERA, m.camera);
  full.strength = typeof m.strength === 'number' ? m.strength : STRENGTH[m.strength || 'subtle'];
  delete full.shots; delete full.apply;
  if (spans) full.spans = spans;
  return full;
}

export const mediumDir = (cfg, id, kind, shotId) => path.join(projectPaths(cfg, id).out, 'medium', kind, shotId);
export const mediumVideo = (cfg, id, kind, shotId) => path.join(mediumDir(cfg, id, kind, shotId), 'medium.mp4');
const motionVideo = (cfg, id, shotId) => path.join(projectPaths(cfg, id).out, 'motion', shotId, 'renders', 'motion.mp4');

export function mediumKey(cfg, id, shot, medium) {
  const src = motionVideo(cfg, id, shot.shotId);
  const st = fs.existsSync(src) ? fs.statSync(src) : null;
  const code = CODE.map((f) => fs.readFileSync(path.join(HERE, f), 'utf8')).join('\n');
  return sha(JSON.stringify(medium) + (st ? `${st.size}:${st.mtimeMs}` : 'missing') + sha(code));
}

// Shots whose medium render is missing or out of date (and whose motion exists).
export function mediumDue(cfg, id, shots, override = null, opts = {}) {
  return shots.filter((s) => {
    const m = resolveMedium(cfg, id, s, override, opts);
    if (!m || !fs.existsSync(motionVideo(cfg, id, s.shotId))) return false;
    const keyFile = path.join(mediumDir(cfg, id, m.kind, s.shotId), 'source.key');
    return !fs.existsSync(mediumVideo(cfg, id, m.kind, s.shotId)) || !fs.existsSync(keyFile) || fs.readFileSync(keyFile, 'utf8').trim() !== mediumKey(cfg, id, s, m);
  });
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block}</style></head>
<body><canvas id="out"></canvas><script src="medium-runtime.js"></script><script>
  const load = async (i) => createImageBitmap(await (await fetch('in/' + String(i + 1).padStart(5, '0') + '.png')).blob());
  // auto polarity: a mostly light frame is a paper theme (dark content is ink), a mostly dark frame is a screen theme
  async function meanLuma(i) {
    const b = await load(i); const c = new OffscreenCanvas(64, 36); const x = c.getContext('2d'); x.drawImage(b, 0, 0, 64, 36);
    const d = x.getImageData(0, 0, 64, 36).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
    return s / (d.length / 4) / 255;
  }
  window.__setup = async (cfg) => { if (cfg.polarity === 'auto') cfg.polarity = (await meanLuma(0)) < 0.5 ? 1 : 0; A1Medium.setup(document.getElementById('out'), cfg); return cfg.polarity; };
  window.__frame = async (i) => { const b = await load(i); A1Medium.frame(b, i); b.close(); };
</script></body></html>`;

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const file = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// Render the medium pass for the given shots, one browser for all of them (one claim under the cap of 2).
export async function renderMedium(cfg, id, shots, { override = null, force = false, log = () => {} } = {}) {
  assertScopeAllows(loadProject(cfg, id), 'medium');
  const done = [];
  const all = shots.map((s) => ({ shot: s, medium: resolveMedium(cfg, id, s, override, { force }) })).filter((w) => w.medium);
  for (const w of all.filter((x) => STREAM[x.medium.kind])) {
    const r = renderStream(cfg, id, w.shot, w.medium);
    if (r) { done.push(r); log(`${w.shot.shotId.padEnd(12)} ${w.medium.kind.padEnd(8)} ${r.frames} frames  ${r.seconds}s`); } else log(`${w.shot.shotId} no motion render, skipped`);
  }
  const work = all.filter((x) => !STREAM[x.medium.kind]);
  if (!work.length) return done;
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    for (const { shot, medium } of work) {
      const t0 = Date.now();
      const src = motionVideo(cfg, id, shot.shotId);
      if (!fs.existsSync(src)) { log(`${shot.shotId} no motion render, skipped`); continue; }
      const dir = mediumDir(cfg, id, medium.kind, shot.shotId);
      const inDir = path.join(dir, 'in'), outDir = path.join(dir, 'frames');
      for (const d of [inDir, outDir]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
      const [num, den] = probe(src, 'stream=r_frame_rate').split('/').map(Number);
      const fps = num / (den || 1);
      // Full-resolution frames; the runtime samples LED beads from the mip level that matches the bead grid.
      ff(['-i', src, '-vf', 'scale=1920:1080:flags=area', path.join(inDir, '%05d.png')]);
      const n = fs.readdirSync(inDir).filter((f) => f.endsWith('.png')).length;
      fs.writeFileSync(path.join(dir, 'index.html'), PAGE);
      fs.copyFileSync(path.join(HERE, 'medium-runtime.browser.js'), path.join(dir, 'medium-runtime.js'));
      const server = await serve(dir);
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
        const polarity = await page.evaluate((c) => window.__setup(c), { ...medium, fps, duration: n / fps, subframes: 8, shutter: 0.75, width: 1920, height: 1080 });
        const canvas = page.locator('#out');
        for (let i = 0; i < n; i++) {
          await page.evaluate((k) => window.__frame(k), i);
          await canvas.screenshot({ path: path.join(outDir, `${String(i + 1).padStart(5, '0')}.png`) });
        }
        const mp4 = mediumVideo(cfg, id, medium.kind, shot.shotId);
        ff(['-framerate', String(fps), '-i', path.join(outDir, '%05d.png'), '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', mp4]);
        const secs = n / fps;
        ff(['-i', mp4, '-vf', `fps=2,scale=320:-1,tile=${Math.min(Math.ceil(secs * 2), 12)}x${Math.ceil(Math.ceil(secs * 2) / 12)}`, '-frames:v', '1', path.join(dir, 'strip.jpg')]);
        fs.writeFileSync(path.join(dir, 'source.key'), mediumKey(cfg, id, shot, medium) + '\n');
        fs.writeFileSync(path.join(dir, 'medium.json'), JSON.stringify({ shotId: shot.shotId, source: path.relative(dir, src), frames: n, fps, polarity, medium }, null, 1) + '\n');
        done.push({ shotId: shot.shotId, kind: medium.kind, mp4, frames: n, seconds: Math.round((Date.now() - t0) / 1000) });
        log(`${shot.shotId.padEnd(12)} ${medium.kind.padEnd(8)} ${n} frames  ${Math.round((Date.now() - t0) / 1000)}s`);
      } finally {
        await page.close(); server.close();
        for (const d of [inDir, outDir]) fs.rmSync(d, { recursive: true, force: true });
      }
    }
  } finally { await browser.close(); }
  return done;
}

// A python medium (tube, print): decode the motion render, run every frame through its script, encode. Also
// the shot's still (candidates/<shot>.png) through the same script, as a preview next to the video (still.png).
export function renderStream(cfg, id, shot, medium) {
  assertScopeAllows(loadProject(cfg, id), 'medium');
  const t0 = Date.now();
  const kind = medium.kind, spec = STREAM[kind];
  const src = motionVideo(cfg, id, shot.shotId);
  if (!fs.existsSync(src)) return null;
  const dir = mediumDir(cfg, id, kind, shot.shotId);
  fs.mkdirSync(dir, { recursive: true });
  const fps = probe(src, 'stream=r_frame_rate');
  const mp4 = mediumVideo(cfg, id, kind, shot.shotId);
  const py = pythonFor(cfg), script = path.join(HERE, spec.script), preset = medium.preset || spec.preset;
  // frames outside the packaging spans (footage, presenter) pass through untouched
  const [fn, fd] = fps.split('/').map(Number), rate = fn / (fd || 1);
  const spansArg = (medium.spans || [[0, 1e6]]).map(([a, b]) => `${Math.round(a * rate)}:${Math.round(b * rate)}`).join(',');
  execFileSync('bash', ['-o', 'pipefail', '-c',
    'ffmpeg -loglevel error -i "$1" -vf scale=1920:1080:flags=area -f rawvideo -pix_fmt rgb24 - | "$2" "$3" stream 1920 1080 --preset "$4" --spans "$7" | ' +
    'ffmpeg -loglevel error -y -f rawvideo -pix_fmt rgb24 -s 1920x1080 -r "$5" -i - -c:v libx264 -crf 16 -pix_fmt yuv420p -movflags +faststart "$6"',
    kind, src, py, script, preset, fps, mp4, spansArg], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 16 << 20 });
  const still = path.join(projectPaths(cfg, id).candidates, `${shot.shotId}.png`);
  if (fs.existsSync(still)) execFileSync(py, [script, 'still', still, path.join(dir, 'still.png'), '--preset', preset]);
  const frames = Number(probe(mp4, 'stream=nb_frames')) || 0;
  const secs = frames / rate;
  ff(['-i', mp4, '-vf', `fps=2,scale=320:-1,tile=${Math.min(Math.ceil(secs * 2), 12)}x${Math.max(1, Math.ceil(Math.ceil(secs * 2) / 12))}`, '-frames:v', '1', path.join(dir, 'strip.jpg')]);
  fs.writeFileSync(path.join(dir, 'source.key'), mediumKey(cfg, id, shot, medium) + '\n');
  fs.writeFileSync(path.join(dir, 'medium.json'), JSON.stringify({ shotId: shot.shotId, source: path.relative(dir, src), frames, fps, medium }, null, 1) + '\n');
  return { shotId: shot.shotId, kind, mp4, frames, seconds: Math.round((Date.now() - t0) / 1000) };
}
export const renderTube = (cfg, id, shot, medium) => renderStream(cfg, id, shot, { ...medium, kind: 'tube' });
