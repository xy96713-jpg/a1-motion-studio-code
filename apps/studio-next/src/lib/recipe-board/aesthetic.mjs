// The aesthetic director (美学导演): between the storyboard and the pictures, decides what each line is about, what to
// show for it and how a chapter looks, so a film is neither one style run end to end nor a different world every cut
// (the user, 2026-10-20: 系统设计的时候都很单一跑完全篇, 系统导演肯定也要管审美方向).
// Three layers (prompts/aesthetic.md): the film's character (taste profile, style-lab/taste-v2), a chapter's recipe
// (paper, one ink and at most one accent, a print process, a motif that comes back), and per shot the kind of meaning,
// two or three ideas, the chosen idea and the form that serves it. The agent writes tasks/aesthetic-<seg>.answer.json;
// checkAesthetic checks it before it becomes projects/<id>/aesthetic/<seg>.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectPaths, loadProject, sourcePath } from './store.mjs';

// what a line is about -> the forms that serve it (first = usual)
export const FORM_FOR = {
  event: ['poster', 'evidence', 'presenter'],
  fact: ['evidence', 'poster'],
  object: ['3d', 'person', 'poster'],
  mechanism: ['diagram', '3d', '2.5d'],
  place: ['2.5d', 'footage'],
  metaphor: ['poster', 'footage'],
  number: ['number', 'diagram', '3d', 'poster'],
  person: ['person', 'evidence'],
  attitude: ['presenter', 'poster'],
  thesis: ['poster', 'presenter'],
};
export const KINDS = Object.keys(FORM_FOR);
export const FORMS = ['3d', '2.5d', 'diagram', 'evidence', 'poster', 'number', 'person', 'footage', 'presenter'];
// forms that print real material: they name it
const NEEDS_MATERIAL = new Set(['evidence', 'footage', 'person']);
const HEX = /^#[0-9a-f]{6}$/i;
const NUM = /\d+(?:\.\d+)?/g;

// how the reference film tells a line (the user, 2026-10-20: 先学对标讲法再谈美学): a shot first records the reference's
// beats in its span (what each beat does, which device, on which words), then plans its own beats on the words. A
// beautiful picture held for the whole line lost to the reference's four quick beats (chat -> headline typed ->
// scroll into the text -> highlight following the voice), so a shot may not have fewer beats than the reference
// minus one without saying why. Devices are named so the two can be compared.
export const DEVICES = ['presenter', 'chat', 'type-on', 'highlight', 'scroll', 'card', 'stamp', 'poster', 'photo', 'footage', 'diagram', '3d', 'number', 'map', 'big-word', 'cut'];
const MAX_BEAT = 3.2;   // a beat longer than this is a held picture, not a beat (presenter and 3d excepted)

export function checkBeats(s, id) {
  const err = [];
  const ref = s.reference?.beats, own = s.beats;
  if (!Array.isArray(ref) || !ref.length) err.push(`${id}: study the reference first: reference.beats (what it does in this span)`);
  if (!Array.isArray(own) || !own.length) { err.push(`${id}: plan the shot's own beats on the words`); return err; }
  own.forEach((bt, k) => {
    if (k && Math.abs(bt.at - own[k - 1].end) > 0.05) err.push(`${id}: beat ${k + 1} not contiguous`);
    if (!DEVICES.includes(bt.device)) err.push(`${id}: beat ${k + 1} unknown device "${bt.device}"`);
    if (!bt.on) err.push(`${id}: beat ${k + 1} does not say which word it lands on`);
    if (bt.end - bt.at > MAX_BEAT && !['presenter', '3d', 'diagram'].includes(bt.device)) err.push(`${id}: beat ${k + 1} holds ${(bt.end - bt.at).toFixed(1)} s; break it on the words`);
  });
  if (Math.abs(own[0].at - s.at) > 0.05 || Math.abs(own.at(-1).end - s.end) > 0.05) err.push(`${id}: beats do not cover the shot`);
  if (Array.isArray(ref) && own.length < ref.length - 1 && !s.beatsWhy) err.push(`${id}: ${own.length} beats against the reference's ${ref.length}; say why (beatsWhy)`);
  return err;
}

export function checkAesthetic(plan) {
  const err = [];
  const r = plan?.recipe || {};
  if (!HEX.test(r.paper || '')) err.push('recipe: paper colour (hex) missing');
  if (!HEX.test(r.ink || '')) err.push('recipe: one ink (hex) missing');
  if (r.accent != null && !HEX.test(r.accent)) err.push('recipe: accent must be one hex colour or null');
  if (!r.print) err.push('recipe: print process missing (engraving, halftone, riso, screen, pixel)');
  if (!r.motif) err.push('recipe: a motif that comes back in the chapter is missing');
  const shots = plan?.shots || [];
  if (!shots.length) err.push('no shots');
  const [a, b] = plan?.range || [];
  if (shots.length && (Math.abs(shots[0].at - a) > 0.05 || Math.abs(shots.at(-1).end - b) > 0.05)) err.push('shots do not cover the range');
  let bold = 0, run = 1, presenter = 0;
  shots.forEach((s, i) => {
    const id = s.id || `#${i + 1}`;
    if (i && Math.abs(s.at - shots[i - 1].end) > 0.05) err.push(`${id}: not contiguous with the shot before`);
    if (!(s.end > s.at)) err.push(`${id}: empty span`);
    if (!KINDS.includes(s.kind)) err.push(`${id}: unknown kind of meaning "${s.kind}"`);
    if (!FORMS.includes(s.form)) err.push(`${id}: unknown form "${s.form}"`);
    else if (FORM_FOR[s.kind] && !FORM_FOR[s.kind].includes(s.form) && !s.why) err.push(`${id}: ${s.form} does not usually serve a ${s.kind} line; say why`);
    if (s.form !== 'presenter') {
      if (!Array.isArray(s.ideas) || s.ideas.length < 2) err.push(`${id}: two or three ideas first, then pick one`);
      else if (!(s.pick >= 0 && s.pick < s.ideas.length)) err.push(`${id}: pick is not one of the ideas`);
    }
    if (s.form === '3d' && !s.engine?.template) err.push(`${id}: a 3d shot names its engine template`);
    if (NEEDS_MATERIAL.has(s.form) && !s.material) err.push(`${id}: ${s.form} prints real material; name it`);
    for (const n of String(s.text || '').match(NUM) || []) if (!(s.facts || []).some((f) => String(f.text).includes(n) && f.source)) err.push(`${id}: ${n} on screen without a fact`);
    if (plan.reference) err.push(...checkBeats(s, id));
    if (s.bold) bold++;
    if (s.form === 'presenter') presenter += s.end - s.at;
    run = i && s.form === shots[i - 1].form && s.form !== 'presenter' ? run + 1 : 1;
    if (run > 2) err.push(`${id}: a third ${s.form} shot in a row; vary the form`);
  });
  if (bold > 1) err.push(`${bold} bold moves (big display type); one a chapter at most`);
  if (shots.length && presenter / (b - a) > 0.4) err.push('presenter over 40% of the chapter');
  return err;
}

export function aestheticDir(cfg, id) { return path.join(projectPaths(cfg, id).root, 'aesthetic'); }

// tasks/aesthetic-<seg>.answer.json -> checked -> aesthetic/<seg>.json
export function acceptAesthetic(cfg, id, seg) {
  const P = projectPaths(cfg, id);
  const file = path.join(P.root, 'tasks', `aesthetic-${seg}.answer.json`);
  if (!fs.existsSync(file)) throw new Error(`no answer: ${file} (follow prompts/aesthetic.md)`);
  const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = checkAesthetic(plan);
  fs.writeFileSync(path.join(P.root, 'tasks', `aesthetic-${seg}.check.json`), JSON.stringify({ errors, checkedAt: new Date().toISOString() }, null, 1) + '\n');
  if (errors.length) return { errors };
  fs.mkdirSync(aestheticDir(cfg, id), { recursive: true });
  const out = path.join(aestheticDir(cfg, id), `${seg}.json`);
  fs.writeFileSync(out, JSON.stringify(plan, null, 1) + '\n');
  return { errors: [], file: out, plan };
}

// frames of the reference film over each shot's span (4 a second, time-stamped), for the director to study before
// planning: tasks/aesthetic-<seg>-ref/<shot>.jpg. The project's recording is on the reference's timeline.
export function studyReference(cfg, id, seg, plan) {
  const P = projectPaths(cfg, id), src = sourcePath(cfg, loadProject(cfg, id).sourceVideo || '');
  if (!src || !fs.existsSync(src)) throw new Error('no reference recording (project.sourceVideo)');
  const dir = path.join(P.root, 'tasks', `aesthetic-${seg}-ref`); fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const s of plan.shots) {
    const from = Math.max(0, s.at - 0.75), len = s.end - s.at + 1.5, n = Math.ceil(len * 4), cols = 6, rows = Math.ceil(n / cols);
    const file = path.join(dir, `${s.id}.jpg`);
    const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(from), '-t', String(len), '-i', src, '-vf',
      `fps=4,scale=480:-2,drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='%{pts\\:flt}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@.6,tile=${cols}x${rows}`, '-frames:v', '1', file]);
    // and where the reference cuts inside the span (frame-difference bursts), so beats are planned on its real cut points
    const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
    const code = "import cv2,sys,numpy as np\ncap=cv2.VideoCapture(sys.argv[1]);fps=cap.get(5);cap.set(0,float(sys.argv[2])*1000);p=None;d=[]\nfor i in range(int(float(sys.argv[3])*fps)):\n ok,f=cap.read()\n if not ok:break\n g=cv2.cvtColor(cv2.resize(f,(320,180)),6).astype('f')[:150]\n d.append(0 if p is None else float(np.mean(abs(g-p))));p=g\nm=np.median(d)+1e-3;c=[]\nfor i,x in enumerate(d):\n  t=round(float(sys.argv[2])+i/fps,2)\n  if x>max(18,6*m) and (not c or t-c[-1]>.3):c.append(t)\nprint(c)";
    const cuts = spawnSync(py, ['-c', code, src, String(from), String(len)], { encoding: 'utf8' }).stdout.trim();
    if (r.status === 0) out.push({ shot: s.id, from, file, referenceCuts: cuts ? JSON.parse(cuts) : [] });
  }
  return { dir, sheets: out };
}
