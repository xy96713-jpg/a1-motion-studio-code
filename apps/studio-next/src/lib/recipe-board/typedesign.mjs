// Type direction: the design step between the storyboard and any frame. Every line on screen says why it is
// there, what it is attached to, what it is made of, what light it answers, and how it is integrated; a 3D word
// without an anchor, a plate environment map and a contact shadow is refused before anything renders.
// Rules: work/recipe-board-v1/prompts/typedesign.md · answer schema: routing/type-plan.schema.json
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths, loadProject, readPlan } from './store.mjs';
import { agentFor, readAnswer, readTask, writeCheck, writeTask } from './agenttask.mjs';
import { hantDeep } from './house.mjs';
import { contrastRatio } from './contrast.mjs';
import { placeType, typeBox, fontCss } from './greybox.mjs';
import { spawnSync } from 'node:child_process';

export const CONTRACT = 'A1TypePlan/v1';
export const ROLES = { hero: 300, figure: 200, title: 128, sub: 64, caption: 48 };
export const ANCHORS = ['graphic', 'print', 'card', 'surface', 'attached', 'occluded', 'screen'];
export const MATERIALS = ['paper', 'ink', 'print', 'card', 'metal', 'light'];
export const INTEGRATIONS = ['graphic', 'print', 'card', 'occlusion', '3d'];
export const COMPOSE = { align: ['left', 'centre', 'right'], edge: ['top', 'bottom', 'left', 'right'] };
const RULES = 'work/recipe-board-v1/prompts/typedesign.md';
const SCHEMA = 'work/recipe-board-v1/routing/type-plan.schema.json';
const STEP = 'typedesign';
const REVIEW_STEP = 'type-review';
const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n'); };
export const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 20);
export const planHash = (plan) => sha(JSON.stringify((plan?.beats || []).map((b) => [b.id, b.intent, b.text])));
export const typePlanFile = (cfg, id) => path.join(projectPaths(cfg, id).root, 'typeplan.json');
const budgetOf = (project = {}, answer = {}) => ({ type3dShots: 2, ...(project.type3dBudget || {}), ...(answer.budget || {}) });
// The film as it actually is: the greybox's type solver gives each on-screen line's box; the frame gives its light.
export function measureLight(frames) {
  if (!frames.length) return [];
  const py = process.env.A1_PYTHON || 'python3';
  const code = [
    'import cv2,json,sys,numpy as np',
    'out=[]',
    'for f in sys.argv[1:]:',
    '  im=cv2.imread(f)',
    '  if im is None: out.append(None); continue',
    '  b=im[:int(im.shape[0]*0.62)]',
    '  g=cv2.GaussianBlur(cv2.cvtColor(b,cv2.COLOR_BGR2GRAY),(0,0),5).astype(np.float32)',
    '  y,x=np.mgrid[0:g.shape[0],0:g.shape[1]]',
    '  w=np.clip(g-np.percentile(g,60),0,None)**2',
    '  s=w.sum()+1e-6',
    '  cx=(x*w).sum()/s; cy=(y*w).sum()/s',
    '  H,W=b.shape[:2]',
    '  dir=float(np.degrees(np.arctan2(cy-H*0.62/2, cx-W/2)))',
    '  m=b.reshape(-1,3).mean(axis=0); rb=float(m[2]-m[0])',
    '  out.append({"dir":round(dir,1),"temp":"warm" if rb>8 else ("cool" if rb<-8 else "neutral")})',
    'print(json.dumps(out))',
  ].join(String.fromCharCode(10));
  const r = spawnSync(py, ['-c', code, ...frames], { encoding: 'utf8' });
  try { return r.status === 0 ? JSON.parse(r.stdout) : frames.map(() => null); } catch { return frames.map(() => null); }
}


// exact text metrics from the house font itself: the layout slot is not the ink (the display face draws ~0.49 em wide)
export async function measureTextBoxes(items, cfg, id) {
  if (!items.length) return [];
  try {
    const css = await fontCss(cfg, id), { chromium } = await import('playwright');
    const { pathToFileURL } = await import('node:url');
    const dir = path.join(projectPaths(cfg, id).out, '.measure'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'measure.html');
    fs.writeFileSync(file, '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body style="margin:0"><canvas id="c" width="1920" height="1080"></canvas></body></html>');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const out = [];
      for (const it of items) {
        const m = await page.evaluate(async ({ text, size, family }) => {
          for (const f of family.split(',')) { try { await document.fonts.load(size + 'px ' + f); } catch { } }
          const ctx = document.getElementById('c').getContext('2d');
          ctx.font = size + 'px ' + family;
          const t = ctx.measureText(text);
          return { x0: -t.actualBoundingBoxLeft, y0: (t.fontBoundingBoxAscent || size * 0.88) - t.actualBoundingBoxAscent, w: t.actualBoundingBoxLeft + t.actualBoundingBoxRight, h: t.actualBoundingBoxAscent + t.actualBoundingBoxDescent };
        }, { text: it.text, size: it.size, family: it.size >= 90 ? 'GBLatin,GBDisplay,GBLast' : 'GBLatin,GBSmall,GBLast' });
        out.push(m);
      }
      return out;
    } finally { await browser.close(); }
  } catch { return items.map(() => null); }
}

export function measureInk(items) {
  const py = process.env.A1_PYTHON || 'python3';
  const code = [
    'import cv2,json,sys,numpy as np',
    'data=json.load(sys.stdin); out=[]',
    'for it in data:',
    '  im=cv2.imread(it["frame"])',
    '  if im is None: out.append(None); continue',
    '  b=it["box"]; x0=int(b["x0"])-8; y0=int(b["y0"])-8; x1=int(b["x1"])+8; y1=int(b["y1"])+8',
    '  x0=max(0,x0); y0=max(0,y0); x1=min(im.shape[1],x1); y1=min(im.shape[0],y1)',
    '  crop=cv2.cvtColor(im[y0:y1,x0:x1],cv2.COLOR_BGR2GRAY).astype(np.float32)',
    '  if crop.size==0: out.append(None); continue',
    '  ring=np.concatenate([crop[0:2,:].ravel(),crop[-2:,:].ravel(),crop[:,0:2].ravel(),crop[:,-2:].ravel()])',
    '  bg=float(np.median(ring))',
    '  mask=(np.abs(crop-bg)>42).astype(np.uint8)',
    '  ys,xs=np.where(mask>0)',
    '  if len(xs)<20: out.append({"box":b,"bg":bg}); continue',
    '  out.append({"box":{"x0":float(x0+xs.min()),"y0":float(y0+ys.min()),"x1":float(x0+xs.max()+1),"y1":float(y0+ys.max()+1)},"bg":bg})',
    'print(json.dumps(out))',
  ].join(String.fromCharCode(10));
  const r = spawnSync(py, ['-c', code], { input: JSON.stringify(items), encoding: 'utf8' });
  try { return r.status === 0 ? JSON.parse(r.stdout) : items.map(() => null); } catch { return items.map(() => null); }
}

export async function greyboxFilm(cfg, id) {
  const root = projectPaths(cfg, id).root;
  const answer = path.join(root, 'tasks', 'greybox.answer.json');
  if (!fs.existsSync(answer)) return null;
  const g = readJson(answer, { beats: [] });
  const out = {};
  for (const b of g.beats || []) {
    const lines = placeType(b).map((t) => { const box = typeBox(t); return { text: hantDeep(t.text), size: t.size, role: t.role, box, slot: box, origSlot: { ...box } }; });
    out[b.beat] = { lines, frame: path.join(projectPaths(cfg, id).out, 'greybox', b.beat + '.png'), light: null };
  }
  // the frame was rendered from the typeplan: the line's origin is the declared quad minus its ink offset
  const savedPlan = readJson(path.join(root, 'typeplan.json'));
  const planBeats = savedPlan?.answer?.beats || [];
  for (const b of g.beats || []) {
    const pb = planBeats.find((x) => x.beat === b.beat); if (!pb) continue;
    for (const l of out[b.beat].lines) {
      const pl = (pb.lines || []).find((x) => x.text === l.text); if (!pl?.perspective?.quad) continue;
      const q = pl.perspective.quad, x0 = Math.min(...q.map((p) => p[0])) * 1920, y0 = Math.min(...q.map((p) => p[1])) * 1080;
      l.slot = { x0: x0 - (pl.inkOffset?.dx || 0), y0: y0 - (pl.inkOffset?.dy || 0), x1: 0, y1: 0 };
      const pl0 = (pb.lines || []).find((x) => x.text === l.text);
      if (pl0?.size) l.size = pl0.size;
    }
  }
  const items = Object.entries(out).filter(([, v]) => fs.existsSync(v.frame));
  const lights = measureLight(items.map(([, v]) => v.frame));
  items.forEach(([k], i) => { out[k].light = lights[i] || null; });
  // exact ink boxes from the house font's own metrics (canvas), not from thresholding the png
  const flat = items.flatMap(([k, v]) => v.lines.map((l) => ({ beat: k, line: l })));
  const metrics = await measureTextBoxes(flat.map((x) => ({ text: x.line.text, size: x.line.size })), cfg, id);
  flat.forEach((x, i) => { const m = metrics[i]; if (!m) return; x.line.box = { x0: x.line.slot.x0 + m.x0, y0: x.line.slot.y0 + m.y0, x1: x.line.slot.x0 + m.x0 + m.w, y1: x.line.slot.y0 + m.y0 + m.h }; });
  const inkItems = [];
  for (const [k, v] of items) for (const l of v.lines) inkItems.push({ frame: v.frame, box: l.slot, beat: k, text: l.text });
  const inks = measureInk(inkItems);
  inks.forEach((m, i) => { if (!m) return; const line = out[inkItems[i].beat].lines.find((l) => l.text === inkItems[i].text); if (line) line.bg = m.bg; });
  return out;
}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const quadOk = (q) => Array.isArray(q) && q.length === 4 && q.every((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]));

const norm = (s) => String(s || '').replace(/[\s·・,，。、:：;；!！?？'"“”「」『』()（）]/g, '').toLowerCase();
/**
 * film: { [beat]: { headline, keywords } } — the words the film actually sets, from plan.onScreen (Traditional).
 * A plan whose copy is not the film's copy cannot be verified against any frame.
 */
export function filmErrors(answer, film) {
  if (!film) return [];
  const out = [];
  const norm = (s) => String(s || '').replace(/[\s·・,，。、:：;；!！?？'"“”「」『』()（）→-]/g, '').toLowerCase();
  const quadBox = (q) => q && q.length === 4 ? [Math.min(...q.map((p) => p[0])) * 1920, Math.min(...q.map((p) => p[1])) * 1080, Math.max(...q.map((p) => p[0])) * 1920, Math.max(...q.map((p) => p[1])) * 1080] : null;
  const iou = (a, b) => { const x0 = Math.max(a[0], b.x0), y0 = Math.max(a[1], b.y0), x1 = Math.min(a[2], b.x1), y1 = Math.min(a[3], b.y1); const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0); const u = (a[2] - a[0]) * (a[3] - a[1]) + (b.x1 - b.x0) * (b.y1 - b.y0) - i; return u > 0 ? i / u : 0; };
  for (const [beat, f] of Object.entries(film)) {
    const plan = (answer.beats || []).find((b) => b.beat === beat);
    if (!f?.lines?.length) continue;
    if (!plan) { if ((answer.beats || []).length) out.push(beat + ': no plan for a beat the film sets type on'); continue; }
    const words = f.lines.map((l) => norm(l.text));
    for (const line of plan.lines || []) if (!words.includes(norm(line.text))) out.push(beat + ' "' + line.text + '": text-not-in-film (the film sets: ' + f.lines.map((l) => l.text).join(' / ') + ')');
    for (const l of f.lines) if (!(plan.lines || []).some((x) => norm(x.text) === norm(l.text))) out.push(beat + ' "' + l.text + '": film-line-missing (the frame shows this line and the plan does not)');
    for (const line of plan.lines || []) {
      if (!['print', 'card'].includes(line.integration)) continue;
      const target = f.lines.find((l) => norm(l.text) === norm(line.text));
      const m = f.lines.find((l) => norm(l.text) === norm(line.text));
      if (m && m.slot && m.box) {
        const dx = line.inkOffset?.dx, dy = line.inkOffset?.dy;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) out.push(beat + ' "' + line.text + '": inkOffset missing');
        else { const tol = 6 + 0.06 * (line.size || 128); if (Math.abs(dx - (m.box.x0 - m.slot.x0)) > tol || Math.abs(dy - (m.box.y0 - m.slot.y0)) > tol) out.push(beat + ' "' + line.text + '": inkOffset does not match the frame (dx ' + Math.round(dx) + ' vs ' + Math.round(m.box.x0 - m.slot.x0) + ', dy ' + Math.round(dy) + ' vs ' + Math.round(m.box.y0 - m.slot.y0) + ')'); }
      }
      const box = quadBox(line.perspective?.quad);
      const fb = f.lines.find((l) => norm(l.text) === norm(line.text));
      if (fb && (fb.box.x0 < 40 || fb.box.y0 < 60 || fb.box.x1 > 1880 || fb.box.y1 > 935)) out.push(beat + ' "' + line.text + '": type-off-frame (the ink runs outside the safe frame: ' + Math.round(fb.box.x0) + ',' + Math.round(fb.box.y0) + ' - ' + Math.round(fb.box.x1) + ',' + Math.round(fb.box.y1) + ')');
      if (target && box) { const v = iou(box, target.box); if (v < 0.85) out.push(beat + ' "' + line.text + '": quad-off-box (' + Math.round(v * 100) + '% overlap with where the frame sets it; the quad is not measured from the ink)'); }
    }
    // leading and left axis, on the ink the frame actually drew (TYPE.md: gap 0.15x the big line, one left edge)
    {
      const items = (plan.lines || []).map((line) => { const t = f.lines.find((l) => norm(l.text) === norm(line.text)); return t?.box ? { line, box: t.box } : null; }).filter(Boolean).sort((a, b) => a.box.y0 - b.box.y0);
      for (let i = 1; i < items.length; i++) {
        const up = items[i - 1], lo = items[i];
        if (up.line.role === 'caption' || lo.line.role === 'caption') continue;   // a source caption is not the block's sub
        const ov = Math.min(up.box.x1, lo.box.x1) - Math.max(up.box.x0, lo.box.x0);
        if (ov < Math.min(up.box.x1 - up.box.x0, lo.box.x1 - lo.box.x0) * 0.2) continue;   // different zones across the frame
        const big = Math.max(up.line.size || 128, lo.line.size || 128);
        if (lo.box.y0 - up.box.y1 > big * 3) continue;   // different zones in the frame, not one block
        const gap = lo.box.y0 - up.box.y1, want = big * 0.15;
        if (gap < want * 0.5 || gap > want * 1.8) out.push(beat + ' "' + lo.line.text + '": lead-mismatch (' + Math.round(gap) + 'px above it, 0.15x' + big + '≈' + Math.round(want) + 'px)');
        const dx = Math.abs(up.box.x0 - lo.box.x0);
        if (dx > 6) out.push(beat + ' "' + lo.line.text + '": axis-mismatch (' + Math.round(dx) + 'px off the line above it; 6px at most)');
      }
    }

    if (f.light && Number.isFinite(f.light.dir)) {
      for (const line of plan.lines || []) {
        if (line.light?.source === 'frame') {
          const d = Math.abs((((line.light?.dir ?? 0) - f.light.dir) % 360 + 540) % 360 - 180);
          if (d > 45) out.push(beat + ' "' + line.text + '": light-mismatch-plan (' + Math.round(d) + '° off the frame light)');
          if (f.light.temp && line.light?.temp && line.light.temp !== f.light.temp) out.push(beat + ' "' + line.text + '": temp-mismatch-plan (frame is ' + f.light.temp + ', plan says ' + line.light.temp + ')');
        }
        if (!['frame', 'declared'].includes(line.light?.source)) out.push(beat + ' "' + line.text + '": light.source must be frame or declared');
      }
    }
  }
  return out;
}

export function typeDesignErrors(answer, { plan = null, project = null, film = null } = {}) {
  const errors = [], warn = [];
  if (!answer || typeof answer !== 'object') return { errors: ['answer is not an object'], warnings: warn };
  const err = (s) => errors.push(s), warnAt = (s) => warn.push(s);
  if (answer.contract !== CONTRACT) err('contract must be ' + CONTRACT);
  const hash = plan ? planHash(plan) : null;
  if (hash && answer.planHash !== hash) err('planHash does not match the plan');
  if (!Array.isArray(answer.beats) || !answer.beats.length) { err('beats is empty'); return { errors, warnings: warn }; }
  const budget = budgetOf(project || {}, answer);
  const planBeats = new Map((plan?.beats || []).map((b) => [b.id, b]));
  const seen = new Set();
  let type3d = 0;
  errors.push(...filmErrors(answer, film));
  // every planned beat with words has to be designed
  if (plan) for (const b of plan.beats || []) if (b.onScreen?.headline && !answer.beats.some((x) => x.beat === b.id)) err(b.id + ': no line planned for this beat');
  for (const beat of answer.beats) {
    if (!beat || !beat.beat) { err('a beat has no id'); continue; }
    if (seen.has(beat.beat)) err(beat.beat + ' is listed twice');
    seen.add(beat.beat);
    if (planBeats.size && !planBeats.has(beat.beat)) err(beat.beat + ' is not in the plan');
    if (!Array.isArray(beat.lines) || !beat.lines.length) { err(beat.beat + ': no lines'); continue; }
    const heroes = beat.lines.filter((l) => l.role === 'hero').length;
    if (heroes > 1) err(beat.beat + ': ' + heroes + ' hero lines; one a beat');
    if (heroes === 0) warnAt(beat.beat + ': no hero line (a beat may be a breath)');
    const sizes = [];
    for (const line of beat.lines) {
      const at = beat.beat + ' "' + String(line.text || '?') + '"';
      if (!line.text) err(at + ': no text');
      if (!ROLES[line.role]) err(at + ': role ' + (line.role || 'none') + ' is not one of ' + Object.keys(ROLES).join('/'));
      else if (line.size != null) {
        const want = ROLES[line.role];
        if (Math.abs(line.size - want) > want * 0.06) err(at + ': size ' + line.size + ' is off the ' + line.role + ' step ' + want + ' by more than 6%');
      }
      if (typeof line.reason !== 'string' || line.reason.trim().length < 4) err(at + ': no reason (why is this word here)');
      if (!line.anchor || !ANCHORS.includes(line.anchor.kind)) err(at + ': anchor.kind must be one of ' + ANCHORS.join('/') + ' (none is a floating word)');
      else if (!line.anchor.target) err(at + ': anchor.target is empty');
      if (line.material && !MATERIALS.includes(line.material)) err(at + ': material ' + line.material + ' is not one of ' + MATERIALS.join('/'));
      if (!INTEGRATIONS.includes(line.integration)) err(at + ': integration must be one of ' + INTEGRATIONS.join('/'));
      if (!line.light || !isNum(line.light.dir)) err(at + ': light.dir must be a number (degrees, from the plate)');
      if (line.integration === '3d') {
        type3d++;
        if (!line.envMap) err(at + ': 3D needs an environment map taken from the plate');
        if (!line.contactShadow) err(at + ': 3D needs a contact shadow');
        if (!line.anchor || line.anchor.kind === 'none') err(at + ': 3D needs an anchor');
        const budget3d = budget.type3dShots;
        if (type3d > budget3d) err(at + ': 3D budget is ' + budget3d + ' in the film');
      }
      if (['print', 'card'].includes(line.integration) && !quadOk(line.perspective?.quad)) err(at + ': ' + line.integration + ' needs perspective.quad (4 points on the plate)');
      if (!/^#[0-9a-fA-F]{6}$/.test(String(line.ink || ''))) err(at + ': ink must be a hex colour (the typeplan has no dress; colour is the only emphasis)');
      else {
        const f0 = film && film[beat.beat];
        const fl = f0 && (f0.lines || []).find((l) => norm(l.text) === norm(line.text));
        if (fl && Number.isFinite(fl.bg)) {
          const g = Math.max(0, Math.min(255, fl.bg));
          const hx = String(line.ink).replace('#', '');
          const rgb = [parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16)];
          const ratio = contrastRatio(rgb, [g, g, g]);
          const min = (isNum(line.size) ? line.size : ROLES[line.role] || 128) >= 90 ? 3 : 4.5;
          if (ratio < min) err(at + ': ink ' + line.ink + ' on ground L' + Math.round(g) + ' is ' + ratio.toFixed(2) + ':1, under ' + min + ':1 (light measured from the frame)');
        }
      }

      if (line.integration === 'graphic') {
        if (!line.anchor || !['graphic', 'screen'].includes(line.anchor.kind)) err(at + ': graphic type is anchored to the frame (anchor.kind graphic/screen), not to a physical surface');
        const c = line.composition;
        if (!c || !COMPOSE.align.includes(c.align) || !Number.isInteger(c.column) || c.column < 1 || c.column > 12 || typeof c.crop !== 'boolean') err(at + ': graphic type needs composition {align, column 1-12, crop, edge}');
        else {
          if (c.crop && !COMPOSE.edge.includes(c.edge)) err(at + ': cropped graphic type needs edge top/bottom/left/right');
          const est = [...String(line.text)].reduce((w, ch) => w + (/[\u3400-\u9fff]/.test(ch) ? 0.5 : 0.32), 0) * (isNum(line.size) ? line.size : ROLES[line.role] || 128);
          if (!c.crop && est > 1920 * 0.92) err(at + ': the line is about ' + Math.round(est) + ' px wide and does not crop; set crop with an edge, or a smaller role');
          const f = film && film[beat.beat];
          if (f && f.headline && norm(line.text) !== norm(f.headline) && line.role !== 'hero') err(at + ': graphic type is the beat\'s headline; in-film copy belongs on a surface (print/card/occlusion)');
        }
      }
      if (line.integration === 'occlusion') {
        const o = line.occlusion;
        if (!o || !Array.isArray(o.covers) || !o.covers.length || !o.edge || o.contactShadow !== true) err(at + ': occlusion needs which glyphs are covered, the edge, and a contact shadow');
      }

      if (['rotate', 'float', 'spin'].includes(line.motion?.type) && (!line.anchor || line.anchor.kind === 'none')) err(at + ': a floating word may not rotate or float');
      if (line.size == null && ROLES[line.role]) sizes.push(ROLES[line.role]);
      else if (isNum(line.size)) sizes.push(line.size);
    }
    const ranks = beat.lines.map((l) => l.hierarchy?.rank).filter((r) => r != null);
    if (beat.lines.length > 1 && new Set(ranks).size !== ranks.length) err(beat.beat + ': hierarchy ranks repeat');
    if (sizes.length > 1) { const mx = Math.max(...sizes), mn = Math.min(...sizes); if (mx / mn < 1.5) err(beat.beat + ': the two sizes differ by ' + (mx / mn).toFixed(2) + 'x; hierarchy needs 1.5x'); }
  }
  // a reveal written once and pasted onto every beat is not a motion decision
  const reveals = answer.beats.flatMap((b) => (b.lines || []).map((l) => l.motion?.reveal).filter(Boolean));
  const revealCounts = reveals.reduce((m, r) => m.set(r, (m.get(r) || 0) + 1), new Map());
  for (const [r, n] of revealCounts) if (n >= 5 && !/null|none|n\/a/i.test(r)) err('motion: one reveal ("' + String(r).slice(0, 40) + '") is used ' + n + ' times; a reveal is decided a beat at a time');
  // one parallelogram reused across the film is an overlay, not a surface
  const quads = answer.beats.flatMap((b) => (b.lines || []).filter((l) => ['print', 'card'].includes(l.integration) && Array.isArray(l.perspective?.quad)).map((l) => [JSON.stringify(l.perspective.quad), l]));
  const quadCounts = quads.reduce((m, [k]) => m.set(k, (m.get(k) || 0) + 1), new Map());
  for (const [k, n] of quadCounts) if (n >= 6) err('anchor: one quad is reused ' + n + ' times; anchors must be measured on the actual plate, not pasted');
  // a long line in a narrow anchor does not fit on the surface it claims (B01 5x300px in a 422px column)
  const widthOf = (s) => [...String(s)].reduce((w, ch) => w + (/[\u3400-\u9fff]/.test(ch) ? 0.5 : 0.32), 0);
  for (const line of answer.beats.flatMap((b) => b.lines || [])) {
    if (!['print', 'card'].includes(line.integration) || !Array.isArray(line.perspective?.quad)) continue;
    const q = line.perspective.quad; if (q.length !== 4) continue;
    const top = Math.abs(q[1][0] - q[0][0]), bot = Math.abs(q[2][0] - q[3][0]);
    const qw = Math.max(top, bot) * 1920, size = isNum(line.size) ? line.size : ROLES[line.role] || 128;
    if (widthOf(line.text) * size > qw * 1.05) err('anchor: "' + line.text + '" needs about ' + Math.round(widthOf(line.text) * size) + ' px but its quad is ' + Math.round(qw) + ' px wide (it does not fit on the surface it claims)');
  }

  // an anchor repeated for every line names nothing (the rubric's vague case)
  const allLinesG = answer.beats.flatMap((b) => b.lines || []);
  const tCount = allLinesG.reduce((m, l) => { const t = String(l.anchor?.target || ''); m.set(t, (m.get(t) || 0) + 1); return m; }, new Map());
  for (const [t, n] of tCount) if (t && n > Math.max(2, allLinesG.length * 0.5)) err('anchor-generic: "' + t + '" is the anchor of ' + n + ' lines; name the real surface each line sits on');
  // the reference puts in-film type on the film's surfaces; graphic type is for the beats that are posters
  const allLines = answer.beats.flatMap((b) => b.lines || []);
  const graphic = allLines.filter((l) => l.integration === 'graphic').length;
  if (allLines.length >= 8 && graphic / allLines.length > 0.25) err('graphic-share: ' + graphic + ' of ' + allLines.length + ' lines are graphic; in-film type belongs on the film\'s surfaces (at most 25% graphic)');
  return { errors, warnings: warn };
}

export function typeDesignStats(answer) {
  const lines = (answer?.beats || []).flatMap((b) => b.lines || []);
  return {
    beats: (answer?.beats || []).length,
    lines: lines.length,
    roles: Object.fromEntries(Object.keys(ROLES).map((r) => [r, lines.filter((l) => l.role === r).length])),
    integrations: Object.fromEntries(INTEGRATIONS.map((x) => [x, lines.filter((l) => l.integration === x).length])),
    type3d: lines.filter((l) => l.integration === '3d').length,
    anchors: Object.fromEntries((ANCHORS || []).map((a) => [a, lines.filter((l) => l.anchor?.kind === a).length])),
  };
}

export async function typeDesignInput(cfg, id) {
  const plan = readPlan(cfg, id);
  if (!plan) throw new Error(id + ' has no plan');
  const project = loadProject(cfg, id) || {};
  const refs = readJson(path.join(cfg.dataDir, 'type-references.json'), { cards: [] }).cards || [];
  return {
    planHash: planHash(plan),
    title: plan.title || project.title || '',
    style: project.style || null,
    budget: budgetOf(project, {}),
    beats: (plan.beats || []).map((b) => ({ id: b.id, intent: b.intent, text: b.text, headline: hantDeep(b.onScreen?.headline || ''), keywords: (b.onScreen?.keywords || []).map((k) => hantDeep(k)), frame: path.join(projectPaths(cfg, id).out, 'greybox', b.id + '.png') })),
    referenceCards: refs.slice(0, 20),
    film: await greyboxFilm(cfg, id),
  };
}

export async function typeDesignState(cfg, id) {
  const plan = readPlan(cfg, id);
  if (!plan) return { state: 'none' };
  const hash = planHash(plan);
  const saved = readJson(typePlanFile(cfg, id));
  const answer = readAnswer(cfg, id, STEP);
  if (saved && saved.planHash === hash && (!answer || saved.answerHash === sha(JSON.stringify(answer)))) {
    const result = typeDesignErrors(saved.answer, { plan, project: loadProject(cfg, id) || {}, film: await greyboxFilm(cfg, id) });
    if (result.errors.length) return { state: 'rejected', errors: result.errors, plan: saved };
    return { state: 'current', plan: saved };
  }
  const check = readJson(path.join(projectPaths(cfg, id).root, 'tasks', STEP + '.check.json'));
  if (answer && check && check.answerHash === sha(JSON.stringify(answer)) && !check.ok) return { state: 'rejected', check };
  return { state: saved ? 'stale' : 'waiting', plan: saved };
}

export async function stepTypeDesign(cfg, id, { log = () => {} } = {}) {
  const plan = readPlan(cfg, id);
  if (!plan) throw new Error(id + ' has no plan');
  const hash = planHash(plan);
  const initial = readTask(cfg, id, STEP);
  if (!initial || initial.planHash !== hash || !initial.input?.film) writeTask(cfg, id, STEP, { planHash: hash, rules: RULES, schema: SCHEMA, input: await typeDesignInput(cfg, id) });
  const current = readJson(typePlanFile(cfg, id));
  const pending = readAnswer(cfg, id, STEP);
  if (current?.planHash === hash && (!pending || current.answerHash === sha(JSON.stringify(pending)))) {
    const r = typeDesignErrors(current.answer, { plan, project: loadProject(cfg, id) || {}, film: await greyboxFilm(cfg, id) });
    if (r.errors.length) return { state: 'rejected', errors: r.errors };
    return { state: 'current' };
  }
  const task = readTask(cfg, id, STEP);
  if (!task || task.planHash !== hash || !task.input?.film) {
    writeTask(cfg, id, STEP, { planHash: hash, rules: RULES, schema: SCHEMA, input: await typeDesignInput(cfg, id) });
    log('typedesign task written: ' + path.join(projectPaths(cfg, id).root, 'tasks', STEP + '.task.json'));
  }
  if (!pending) return { state: 'waiting', task: path.join(projectPaths(cfg, id).root, 'tasks', STEP + '.task.json') };
  const project = loadProject(cfg, id) || {};
  const result = typeDesignErrors(pending, { plan, project, film: await greyboxFilm(cfg, id) });
  writeCheck(cfg, id, STEP, { ok: !result.errors.length, errors: result.errors, warnings: result.warnings, answerHash: sha(JSON.stringify(pending)) });
  if (result.errors.length) return { state: 'rejected', errors: result.errors };
  const saved = { contract: CONTRACT, planHash: hash, answerHash: sha(JSON.stringify(pending)), acceptedAt: new Date().toISOString(), budget: budgetOf(project, pending), answer: pending };
  writeJson(typePlanFile(cfg, id), saved);
  log('typedesign accepted: ' + typeDesignStats(pending).lines + ' lines, ' + typeDesignStats(pending).type3d + ' 3D');
  return { state: 'accepted', stats: typeDesignStats(pending) };
}

export function writeTypeReviewTask(cfg, id) {
  const name = typeVerdictName(cfg, id);
  const saved = readJson(typePlanFile(cfg, id));
  if (!name || !saved) throw new Error(id + ' has no typeplan to review');
  const refs = readJson(path.join(cfg.dataDir, 'type-references.json'), { cards: [] }).cards || [];
  const out = projectPaths(cfg, id).out;
  const frames = [];
  for (const dir of ['look', 'greybox', 'stills', 'type']) {
    const d = path.join(out, dir);
    if (!fs.existsSync(d)) continue;
    const cap = dir === 'greybox' ? 30 : 4;
    for (const f of fs.readdirSync(d).filter((x) => /.(png|jpg)$/i.test(x)).sort().slice(0, cap)) frames.push(path.join(d, f));
  }
  writeTask(cfg, id, REVIEW_STEP, { rules: 'work/recipe-board-v1/prompts/type-review.md', schema: 'work/recipe-board-v1/routing/type-review.schema.json', verdictFile: 'reviews/' + name + '.verdict.json', input: { planHash: saved.planHash, typeplan: saved.answer, referenceCards: refs.slice(0, 10), frames } });
  return path.join(projectPaths(cfg, id).root, 'tasks', REVIEW_STEP + '.task.json');
}

export function typeVerdictName(cfg, id) {
  const plan = readPlan(cfg, id); if (!plan) return null;
  const saved = readJson(typePlanFile(cfg, id));
  return 'type-' + planHash(plan) + '-' + String(saved?.answerHash || 'none').slice(0, 8);
}

export async function typeGateState(cfg, id) {
  const plan = readPlan(cfg, id);
  if (!plan) return { state: 'none', errors: ['no plan'] };
  const hash = planHash(plan);
  const saved = readJson(typePlanFile(cfg, id));
  if (!saved || saved.planHash !== hash) return { state: 'waiting', errors: ['no typeplan for this plan'] };
  const result = typeDesignErrors(saved.answer, { plan, project: loadProject(cfg, id) || {}, film: await greyboxFilm(cfg, id) });
  const name = typeVerdictName(cfg, id);
  const verdict = readJson(path.join(cfg.repoRoot || cfg.dataDir.replace(/\/work\/recipe-board-v1$/, ''), 'work/recipe-board-v1/reviews', name + '.verdict.json'));
  const verdictErrors = !verdict ? ['no type review verdict'] : verdict.verdict !== 'pass' ? ['type review verdict=' + verdict.verdict] : (verdict.mustFix || []).filter((m) => (m.severity || 0) >= 3).length ? ['type review has open severity-3 fixes'] : [];
  const errors = [...result.errors.map((e) => 'typedesign: ' + e), ...verdictErrors];
  return { state: errors.length ? 'failed' : 'passed', errors, verdict: name, stats: typeDesignStats(saved.answer) };
}
