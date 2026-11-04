// Keyframes: the picture a beat is built to, drawn before it is built (the user, 2026-10-21: 先出效果图再复刻). After the
// storyboard, every beat the director set in 3D and the first beat of each continuous diagram gets a design keyframe
// from the image model (imagegen.mjs), in the film's world (worlds/<id>.json prompt and refs, the look sheet), from the
// storyboard's design: why, the hero move, the diagram's form, figure and camera. Text-free: the type is the code's.
// The chapter writer is shown the keyframes of its beats, and the review scores the chapter against them (chapter.mjs
// targetFrames): the aesthetic is decided by the picture, the code only rebuilds it and makes it move.
// projects/<id>/concept/keyframes/<beat>-<n>.png and keyframes.json { beats: { B07: { options: [...], pick, key } } };
// a pick the user changes (pick: n) stands; options are made again only when the design they were drawn from changes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { projectPaths, loadProject } from './store.mjs';
import { filmLook, filmWorld } from './filmlook.mjs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const dirOf = (cfg, id) => path.join(projectPaths(cfg, id).root, 'concept', 'keyframes');
const fileOf = (cfg, id) => path.join(dirOf(cfg, id), 'keyframes.json');

// the beats that get a keyframe: every 3D beat (a diagram in 3d, a hero shot) and the first beat of each run of
// continuous-diagram beats (the chapter's opening picture)
export function keyBeats(storyboard) {
  const shots = storyboard?.shots || [], out = [];
  shots.forEach((s, i) => {
    const prev = shots[i - 1];
    const opensChapter = s.card === 'morph-chapter' && prev?.card !== 'morph-chapter';
    const is3d = s.card === 'hero-3d' || s.diagram?.form === '3d';
    if (opensChapter || is3d) out.push(s.beat);
  });
  return out;
}

export function keyframePrompt(world, L, shot) {
  const d = shot.diagram || {}, h = shot.hero || {};
  return [
    world?.prompt || `A documentary explainer in one look: ground ${L.paper}, ink ${L.ink}, one accent ${L.accent}.`,
    'This is a design keyframe for one moment of the film: a finished frame a motion designer will rebuild in 3D and animate.',
    shot.why ? `What the moment is about: ${shot.why}.` : '',
    d.figure ? `The subject: ${d.figure}.` : h.target ? `The subject: ${h.target}.` : '',
    d.form ? `Form: ${{ '3d': 'a solid object with volume and light, depth of field', '2.5d': 'flat figures laid on a dark table, seen from an angle, the camera close', map: 'a real street map laid flat in perspective, the camera low over it', '2d': 'a clean flat diagram' }[d.form] || d.form}.` : '',
    d.camera ? `Camera: ${d.camera}.` : '',
    `Colours: ground ${L.paper}, the figure in ${L.ink} and greys, exactly one accent ${L.accent} on the one thing being followed, nothing else saturated.`,
    'Leave a calm area for a title. Absolutely no text, no letters, no numbers, no labels, no logos, no real people.',
  ].filter(Boolean).join(' ');
}

export function keyframesFor(cfg, id, beats) {
  const k = readJson(fileOf(cfg, id), { beats: {} }), root = projectPaths(cfg, id).root;
  const keys = beats.map((b) => { const e = k.beats?.[b]; const f = e?.options?.[e.pick ?? 0]; return f ? path.join(root, f) : null; }).filter((f) => f && fs.existsSync(f));
  return [...keys, ...boardFramesFor(cfg, id, beats)];   // an approved motion board is a target too
}

export async function stepKeyframes(cfg, id, { only = null, options = 1, log = () => {} } = {}) {
  const root = projectPaths(cfg, id).root;
  const sb = readJson(path.join(root, 'storyboard.json'), null);
  if (!sb) return { made: [], kept: [] };
  const project = loadProject(cfg, id), world = filmWorld(cfg, id), L = filmLook(cfg, id);
  const { generateArt } = await import('./imagegen.mjs');
  const file = fileOf(cfg, id), k = readJson(file, { contract: 'A1RecipeBoardKeyframes/v1', beats: {} });
  const refs = [...(world?.refs || []).slice(0, 2), ...(project.reference?.frames || []).slice(0, 1)];
  const made = [], kept = [];
  fs.mkdirSync(dirOf(cfg, id), { recursive: true });
  for (const beat of keyBeats(sb).filter((b) => !only || only.has(b))) {
    const shot = sb.shots.find((s) => s.beat === beat), prompt = keyframePrompt(world, L, shot), key = sha(prompt + refs.join());
    const e = k.beats[beat];
    if (e?.key === key && (e.options || []).every((f) => fs.existsSync(path.join(root, f)))) { kept.push(beat); continue; }
    const opts = [];
    for (let n = 1; n <= options; n++) {
      // the image tool sometimes answers without an image: one more try before the beat goes without its keyframe
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const r = generateArt(cfg, { prompt: `${n > 1 ? `${prompt} (variation ${n})` : prompt}${attempt > 1 ? ' ' : ''}`, refs, size: '1536x1024', cinematic: true }, { log: (l) => log(`  ${beat} ${l}`) });
          const src = r?.file || r;
          if (typeof src === 'string' && fs.existsSync(src)) { const dst = path.join(dirOf(cfg, id), `${beat}-${n}.png`); fs.copyFileSync(src, dst); opts.push(path.relative(root, dst)); break; }
        } catch (err) { log(`  ${beat} keyframe failed (try ${attempt}): ${String(err.message || err).split('\n')[0]}`); }
      }
    }
    if (!opts.length) continue;
    k.beats[beat] = { options: opts, pick: e?.key === key ? e.pick ?? 0 : 0, key, prompt, at: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(k, null, 1) + '\n');
    made.push(beat); log(`  keyframe ${beat}: ${opts.length} option(s)`);
  }
  return { made, kept };
}

// ---- motion boards (user 2026-10-22: 需要 3d 建模 blender 什么的专业镜头可以给 ai 生图做效果图生成几张动效图，确认了可以按照
// 效果图渲染): for a shot that needs a 3D hero, a few frames of ONE move (its start, middle, end) before anything is built.
// The director writes the request in concept/boards/boards.json { beats: { B44: { why, buildable, from?, moments: [{ at,
// frame }] } } }: `buildable` says what the 3D kit or Blender will make it from (an image model draws what cannot be
// built), `from` a frame the board continues (the shot before's last frame: the same object across the cut). Each frame
// is drawn with the frames before it as references: one object, one light, only the camera and the object's state
// change (B09's ladder and B10's helix, B22's X and B23's red one, were two objects). The user approves a board
// (approveBoard); an approved board is the chapter writer's and the review's target (keyframesFor), and a board changed
// since waits again. Text-free as all art: the letters, numbers and tags are the code's.
const boardsDir = (cfg, id) => path.join(projectPaths(cfg, id).root, 'concept', 'boards');
export const boardsFile = (cfg, id) => path.join(boardsDir(cfg, id), 'boards.json');
export function boardPrompt(world, L, req, k) {
  const m = req.moments[k], n = req.moments.length;
  return [
    world?.prompt || `A documentary explainer in one look: ground ${L.paper}, ink ${L.ink}, one accent ${L.accent}.`,
    `This is frame ${k + 1} of ${n} of a motion board: ${n} moments of ONE continuous camera move in one 3D scene, which a motion designer will build and render to match.`,
    req.why ? `What the shot is about: ${req.why}.` : '',
    `This moment (${m.at} s): ${m.frame}.`,
    k ? 'The attached earlier frames of this board show the same scene: keep the very same objects, materials, light and colours; only the camera and what the move changes may differ.' : req.from ? 'The attached frame is where the shot before ends: this shot opens on the same object, in the same look.' : '',
    req.buildable ? `It will be built from: ${req.buildable}. Draw only what that can make: solid objects with real materials and light, no effects it cannot render.` : '',
    `Colours: ground ${L.paper}, the figures in ${L.ink} and greys, exactly one accent ${L.accent} on the one thing being followed, nothing else saturated.`,
    'Leave calm areas where titles and labels will be set. Absolutely no text, no letters, no numbers, no labels, no logos, no real people.',
  ].filter(Boolean).join(' ');
}
// The board's motion plan (user 2026-10-22: 有想好怎么运动？运动方式和动画动效要成熟): what moves, when, and who owns
// the move, written before a frame is drawn, then built as the chapter's camera3 and timings and seen on the white
// model. motion { seconds, in: { from, carry }, out: { to, carry }, steps: [{ from, to, owner: camera|content|hold,
// what, target? }] }. The grammar the reference keeps: the steps run end to end over the beat; one owner at a time (the
// camera does not move while the picture changes a lot); a camera move takes MOVE_MIN s or more, eased, and goes to
// a named target that something on screen pointed to first (a content or hold step of HOLD_MIN s before it, unless
// the beat opens on the move carried from the last); the beat ends at rest (its last step holds or changes the picture
// for HOLD_MIN s or more); what crosses each seam is named (in.carry from the beat before, out.carry into the next).
export const MOVE_MIN = 1.0, HOLD_MIN = 0.6, OWNERS = ['camera', 'content', 'hold'];
export function motionPlanErrors(beat, m) {
  if (!m) return [`${beat}: the board has no motion plan (motion { seconds, in, out, steps })`];
  const e = [], st = Array.isArray(m.steps) ? m.steps : [], T = +m.seconds;
  if (!(T > 0)) e.push(`${beat}: motion.seconds`);
  if (!st.length) e.push(`${beat}: motion.steps is empty`);
  for (const [k, side, other] of [['in', 'from', 'the beat before'], ['out', 'to', 'the next beat']])
    if (!String(m[k]?.[side] || '').trim() || String(m[k]?.carry || '').trim().length < 6) e.push(`${beat}: motion.${k} names ${other} (${side}) and what crosses the seam (carry)`);
  st.forEach((s, i) => {
    const tag = `${beat}: motion.steps[${i}]`, len = s.to - s.from;
    if (!OWNERS.includes(s.owner)) e.push(`${tag}: owner is camera, content or hold`);
    if (!(len > 0)) e.push(`${tag}: to after from`);
    if (i === 0 && Math.abs(s.from) > 0.05) e.push(`${tag}: the first step starts at 0`);
    if (i > 0 && Math.abs(s.from - st[i - 1].to) > 0.05) e.push(`${tag}: starts at ${s.from} s, the step before ends at ${st[i - 1].to} s (end to end, one owner at a time)`);
    if (String(s.what || '').trim().length < 4) e.push(`${tag}: what happens`);
    if (s.owner === 'camera') {
      if (len < MOVE_MIN) e.push(`${tag}: a camera move of ${len.toFixed(1)} s; at least ${MOVE_MIN} s, eased`);
      if (!String(s.target || '').trim()) e.push(`${tag}: where the camera goes (target)`);
      const prev = st[i - 1];
      if (i > 0 && !(prev && prev.owner !== 'camera' && prev.to - prev.from >= HOLD_MIN - 1e-6)) e.push(`${tag}: the eye goes first: a content or hold step of ${HOLD_MIN} s or more before the camera moves (stop, move, stop)`);
    }
  });
  const last = st.at(-1);
  if (last && (last.owner === 'camera' || last.to - last.from < HOLD_MIN - 1e-6)) e.push(`${beat}: the beat ends at rest: its last step holds or changes the picture for ${HOLD_MIN} s or more, the camera still`);
  if (last && T > 0 && Math.abs(last.to - T) > 0.05) e.push(`${beat}: the steps end at ${last.to} s, the beat at ${T} s`);
  return e;
}
// One scene across a board's frames (B13's first frame came back as a wooden wardrobe, 2026-10-22): each frame is held
// against the board's other frames by what it shows (OpenCLIP embeddings, likeness.py --embed). Frames of one board
// measured .83-.88 to each other, the stray .33-.39: under BOARD_SAME it is drawn once more, then the board stops.
export const BOARD_SAME = 0.7;
export function boardLikeness(cfg, file, others) {
  if (!others.length) return null;
  const root = cfg.sourceRoot || cfg.repoRoot, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-board-')), inp = path.join(tmp, 'in.json'), out = path.join(tmp, 'out.json');
  try {
    fs.writeFileSync(inp, JSON.stringify([file, ...others].map((f, i) => ({ id: String(i), image: f }))));
    const py = process.env.A1_PYTHON || path.join(root, 'work/external-source-tool-canaries-v1/.venv/bin/python');
    const r = spawnSync(py, [path.join(path.dirname(new URL(import.meta.url).pathname), 'likeness.py'), '--embed', inp, out], { encoding: 'utf8', timeout: 300000, env: { ...process.env, A1_OPENCLIP_CACHE: path.join(root, '.codex-artifacts/runtime/openclip') } });
    if (r.status) return null;
    const E = readJson(out, {}), v = (k) => E[k] || [], cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return d / Math.sqrt(na * nb || 1); };
    return Math.min(...others.map((_, i) => cos(v('0'), v(String(i + 1)))));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
export const boardApproved = (e) => !!(e?.approved && e.approved.key === e.key);
export async function stepBoards(cfg, id, { only = null, redraw = {}, log = () => {} } = {}) {   // redraw: { beat: [frame numbers] } drawn again from the board's other frames
  const root = projectPaths(cfg, id).root, file = boardsFile(cfg, id), B = readJson(file, null);
  if (!B?.beats) return { made: [], kept: [] };
  const project = loadProject(cfg, id), world = filmWorld(cfg, id), L = filmLook(cfg, id);
  const { generateArt } = await import('./imagegen.mjs');
  const worldRefs = (world?.refs || []).slice(0, 1), made = [], kept = [];
  for (const [beat, req] of Object.entries(B.beats)) {
    if (only && !only.has(beat)) continue;
    const planErr = motionPlanErrors(beat, req.motion);
    if (planErr.length) { log(`  board ${beat}: not drawn, its motion plan does not hold:\n    ${planErr.join('\n    ')}`); continue; }
    const from = req.from ? (path.isAbsolute(req.from) ? req.from : path.join(root, req.from)) : null;
    const key = sha(JSON.stringify({ why: req.why, buildable: req.buildable, from: req.from, moments: req.moments, world: world?.prompt, L }));   // the motion plan is not drawn: changing it keeps the frames
    const again = (redraw[beat] || []).map((n) => n - 1), whole = req.key === key && (req.frames || []).length === req.moments.length && req.frames.every((f) => fs.existsSync(path.join(root, f)));
    if (whole && !again.length) { kept.push(beat); continue; }
    const frames = whole ? [...req.frames] : [];
    for (let k = 0; k < req.moments.length; k++) {
      if (whole && !again.includes(k)) continue;
      // a frame drawn again takes the board's other frames as its references (the same objects as theirs)
      const others = whole ? frames.filter((_, j) => j !== k) : frames;
      const refs = [...worldRefs, ...(from && fs.existsSync(from) && !whole ? [from] : []), ...others.map((f) => path.join(root, f))].slice(-3);
      let ok = null;
      for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
        try {
          const r = generateArt(cfg, { prompt: boardPrompt(world, L, req, k) + (attempt > 1 ? ' ' : ''), refs, size: '1536x1024', cinematic: true }, { log: (l) => log(`  ${beat} ${l}`) });
          const src = r?.file || r;
          if (typeof src === 'string' && fs.existsSync(src)) {
            const like = boardLikeness(cfg, src, others.map((f) => path.join(root, f)));
            if (like != null && like < BOARD_SAME) { log(`  board ${beat}: frame ${k + 1} shows another scene (likeness ${like.toFixed(2)}, at least ${BOARD_SAME}); drawing it again`); continue; }
            const dst = path.join(boardsDir(cfg, id), `${beat}-${k + 1}.png`); fs.copyFileSync(src, dst); ok = path.relative(root, dst);
          }
        } catch (err) { log(`  ${beat} frame ${k + 1} failed (try ${attempt}): ${String(err.message || err).split('\n')[0]}`); }
      }
      if (!ok) break;
      if (whole) frames[k] = ok; else frames.push(ok);
      log(`  board ${beat}: frame ${k + 1} of ${req.moments.length}`);
    }
    if (frames.length !== req.moments.length) continue;
    B.beats[beat] = { ...req, frames, key, made: new Date().toISOString(), approved: null };   // a board drawn again waits for its approval again
    fs.writeFileSync(file, JSON.stringify(B, null, 1) + '\n');
    made.push(beat);
  }
  return { made, kept };
}
export function approveBoard(cfg, id, beats, by) {
  const file = boardsFile(cfg, id), B = readJson(file, { beats: {} }), done = [];
  for (const b of beats) { const e = B.beats?.[b]; if (!e?.frames?.length || !e.key) continue; e.approved = { key: e.key, at: new Date().toISOString(), by }; done.push(b); }
  fs.writeFileSync(file, JSON.stringify(B, null, 1) + '\n');
  return done;
}
// the approved boards' frames for these beats (the chapter's targets, after the keyframes)
export function boardFramesFor(cfg, id, beats) {
  const B = readJson(boardsFile(cfg, id), null), root = projectPaths(cfg, id).root;
  return beats.flatMap((b) => (boardApproved(B?.beats?.[b]) ? B.beats[b].frames.map((f) => path.join(root, f)) : [])).filter((f) => fs.existsSync(f));
}
// the approved boards' motion plans by beat (the chapter check holds the module to them)
export function boardPlans(cfg, id) {
  const B = readJson(boardsFile(cfg, id), null);
  return Object.fromEntries(Object.entries(B?.beats || {}).filter(([, e]) => boardApproved(e) && e.motion).map(([b, e]) => [b, e.motion]));
}
