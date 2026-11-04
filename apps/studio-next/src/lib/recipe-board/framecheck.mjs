// Frame checks: what a picture review kept finding, measured by code on every shot module after it renders, so the
// same kind of bad frame cannot come back (user decision 2026-10-21: 修系统级别的，其他类型也按这个方法都补上检查).
// Measured on the words the module sets (the DOM text; a real page's own words are measured by the marks check),
// at the shot's key frames (layers.mjs keyTimes), each text only once it has settled (it does not move or fade over
// the next 0.1 s: an entrance or an exit in progress is not judged):
//   small      type too small to read at 1080p (CJK under 34 px a line, Latin under 20 px)
//   contrast   type that does not stand off what is behind it
//   off-frame  a settled text cut by the frame's edge
//   subtitles  text in the bottom band the user's subtitles take (below 935 px; the system adds no subtitles)
//   overlap    two texts over each other; a text over a face; a text mostly hidden under a picture drawn over it
//   script     Simplified characters or emoji on screen (house rules: Traditional, no emoji)
//   blank      the frame gone blank for a third of a second or more inside the shot
//   sparse     the middle and late frames carry less than half of what the reference's do at the same moment
// Problems name the shot's time, the words and what is wrong; they become the code's verdict in the picture review
// (layers.mjs): the module's faults go to its to-do list, the director's back to the director; a shot with any does
// not go on to the final render.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MIN } from './contrast.mjs';
import { spawnSync } from 'node:child_process';

// the review's key frames (as layers.mjs keyTimes: just after the first thing is out, the middle, near the end)
export const keyTimes = (s) => { const d = s.end - s.at; return [s.at + Math.min(.9, d * .3), s.at + d * .6, s.end - Math.min(.25, d * .1)].map((t) => +t.toFixed(2)); };
const L_BLANK = .03;
export const LIMITS = { restMove: 8, lightDeg: 40, dofMin: 0.5, dofMax: 2, quadIou: 0.9, hierarchyN: 3, covered: .45, coveredDisplay: .85, deco: .55, fill: .5, cjk: 34, latin: 20, contrast: 70, standoff: 60, bottom: 935, display: 250, overlap: .15, overlapLine: .04, stackCross: .15, wordsCovered: .05, onCut: .06, frontMax: .4, frontCell: .55, face: .1, faceText: 90, display_share: .8, outside: .02, balance: .3, balanceGap: .15, firstFill: .35, progress: .25, progressRef: .04 };

// in the page: every visible text, as blocks (the nearest non-inline ancestor of its text: a title split into a span
// per character is one text), with its box on the frame, its smallest line height, its opacity
export const PAGE_BLOCKS = `(async () => {
  const vis = (el) => { let o = 1; for (let a = el; a && a !== document.documentElement; a = a.parentElement) { const cs = getComputedStyle(a);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= +cs.opacity; } return o; };
  const blockOf = (el) => { let a = el; while (a.parentElement && a.parentElement !== document.body && /^inline/.test(getComputedStyle(a).display)) a = a.parentElement; return a; };
  const blocks = new Map(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.textContent.replace(/\\s+/g, ' ').trim(), el = n.parentElement;
    if (!t || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || el.closest('#sub')) continue;
    const o = vis(el); if (o < .05) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const rects = [...r.getClientRects()].filter((q) => q.width > 1 && q.height > 1); if (!rects.length) continue;
    const b = blockOf(el); if (!blocks.has(b)) { const m = getComputedStyle(el).color.match(/rgba?\(([^)]+)\)/), alpha = m && m[1].split(',').length > 3 ? +m[1].split(',')[3] : 1;
      blocks.set(b, { key: '', text: '', rects: [], op: 0, line: 1e9, lineMax: 0, deco: !!el.closest('[data-deco]'), carry: !!el.closest('[data-carry]'), ground: !!el.closest('[data-ground]'), reading: !!el.closest('[data-reading]'), alpha,
        anchor: b.dataset.anchor ?? undefined, material: b.dataset.material || null, integration: b.dataset.integration || null,
        lightDir: b.dataset.lightDir != null ? +b.dataset.lightDir : null, plateLight: b.dataset.plateLight != null ? +b.dataset.plateLight : null,
        contact: b.dataset.contact === 'true', env: b.dataset.env === 'true', rank: b.dataset.rank != null ? +b.dataset.rank : null,
        quad: (() => { try { return b.dataset.quad ? JSON.parse(b.dataset.quad) : null; } catch { return null; } })() }); if (!b.dataset.fk) b.dataset.fk = String(window.__fk = (window.__fk || 0) + 1); }   // unique for the page's life (numbering per call collided: h800-S1)
    // display type (a box 200 px tall or more) is measured by its strokes, not its box: a Mincho's box is a third
    // taller than the strokes, and the reference's year (open R01) fills half the frame in strokes; measured by the
    // box it could never be that big without reaching the subtitle band (the font's own metrics, canvas measureText)
    let ink = null;
    if (rects.some((q) => q.height >= 200)) { const cs = getComputedStyle(el), cx = (window.__inkCtx = window.__inkCtx || document.createElement('canvas').getContext('2d'));
      cx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; const m = cx.measureText(t), fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
      if (fa + fd > 0) ink = [Math.max(0, (fa - m.actualBoundingBoxAscent) / (fa + fd)), Math.max(0, (fd - m.actualBoundingBoxDescent) / (fa + fd))]; }
    const e = blocks.get(b); e.key = b.dataset.fk; e.text += t; e.rects.push(...rects.map((q) => (ink && q.height >= 200 ? [q.x, q.y + q.height * ink[0], q.width, q.height * (1 - ink[0] - ink[1])] : [q.x, q.y, q.width, q.height]))); e.op = Math.max(e.op, o);
    e.line = Math.min(e.line, ...rects.map((q) => q.height));
    e.lineMax = Math.max(e.lineMax, ...rects.map((q) => q.height));   // (a block's largest line, for its display size: a key word set large within its words, ending S6's AI)
  }
  // covered: the share of points over its glyph boxes where something else is drawn on top (a picture over the title;
  // overlays that take no pointer, like vignettes, do not count). The block's element is found by its key.
  for (const [el, e] of blocks) { let n = 0, hid = 0;
    for (const [x, y, w, h] of e.rects) for (let i = 1; i < 6; i++) for (let j = 1; j < 4; j++) { const px = x + w * i / 6, py = y + h * j / 4;
      if (px < 0 || py < 0 || px > 1920 || py > 1080) continue; n++;
      // what lies above the text at this point: only opaque content hides it (a picture, a solid fill), never a
      // full-frame overlay (grain, vignette, grid) or a layer blended into the frame
      for (const top of document.elementsFromPoint(px, py)) { if (el.contains(top) || top.contains(el)) break;
        // (the subject in front, camera.js spec.front: counted apart, only where its cut-out is opaque)
        if (top.closest('[data-front]')) break;   // (the subject in front is measured apart, below)
        const cs = getComputedStyle(top), r = top.getBoundingClientRect();
        if (r.width >= 1900 && r.height >= 1060) continue;
        if (cs.mixBlendMode !== 'normal' || vis(top) < .6) continue;
        const pic = /^(IMG|VIDEO|CANVAS)$/.test(top.tagName) || (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage));
        const solid = (cs.backgroundColor.match(/[\d.]+/g) || []).length === 3 || +((cs.backgroundColor.match(/[\d.]+/g) || [])[3] ?? 0) > .6;
        if (pic || (solid && cs.backgroundColor !== 'rgba(0, 0, 0, 0)')) { hid++; break; } } }
    e.covered = n ? hid / n : 0; }
  // onCut: the share of points over its glyph boxes that lie on the opaque body of a cut-out picture under it (a prop: a
  // picture with transparent margins, smaller than the text's own ground). Small type there reads blurred into the
  // picture (the trophy's handle under OpenAI, the gold bars under 血本無歸: who S7, cards S2, reviews of 2026-10-26);
  // a picture holding the whole text is its ground (a card, a page), not counted. Unread pictures count nothing.
  const A = (window.__alphaCache = window.__alphaCache || {});
  const alphaOf = (u) => A[u] !== undefined ? Promise.resolve(A[u]) : new Promise((res) => { const i = new Image(); i.onerror = () => res(A[u] = null); i.onload = () => { try {
    const W = Math.min(256, i.naturalWidth), H = Math.max(1, Math.round(W * i.naturalHeight / i.naturalWidth)), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(i, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data; let clear = 0; for (let k = 3; k < d.length; k += 4) if (d[k] < 16) clear++;
    A[u] = clear > W * H * .05 ? { W, H, iw: i.naturalWidth, ih: i.naturalHeight, d } : null; } catch (e) { A[u] = null; } res(A[u]); }; i.src = u; });
  const picOf = (el) => { const cs = getComputedStyle(el); if (el.tagName === 'IMG') return { u: el.currentSrc || el.src, fit: cs.objectFit === 'fill' ? 'fill' : cs.objectFit, pos: cs.objectPosition.split(' ') };
    const m = cs.backgroundImage.match(/^url\\("?(.*?)"?\\)$/); return m ? { u: m[1], fit: cs.backgroundSize, pos: [cs.backgroundPositionX, cs.backgroundPositionY] } : null; };
  const alphaAt = (el, P, a, px, py) => { const r = el.getBoundingClientRect(), W = el.clientWidth || r.width, H = el.clientHeight || r.height; if (!r.width || !r.height) return 0;
    const lx = (px - r.left) / r.width * W, ly = (py - r.top) / r.height * H; let dw, dh;
    const f = P.fit.split(' ');
    if (f[0] === 'contain' || f[0] === 'cover') { const k = (f[0] === 'contain' ? Math.min : Math.max)(W / a.iw, H / a.ih); dw = a.iw * k; dh = a.ih * k; }
    else if (f[0] === 'fill') { dw = W; dh = H; }
    else { const v = (x, L) => x === 'auto' || x == null ? null : x.endsWith('%') ? parseFloat(x) / 100 * L : parseFloat(x); dw = v(f[0], W); dh = v(f[1], H); if (dw == null && dh == null) { dw = a.iw; dh = a.ih; } else if (dw == null) dw = dh * a.iw / a.ih; else if (dh == null) dh = dw * a.ih / a.iw; }
    const at = (x, L, D) => /%$/.test(x) ? parseFloat(x) / 100 * (L - D) : x === 'center' ? (L - D) / 2 : x === 'right' || x === 'bottom' ? L - D : x === 'left' || x === 'top' ? 0 : parseFloat(x) || 0;
    const u = (lx - at(P.pos[0], W, dw)) / dw, v = (ly - at(P.pos[1] ?? '50%', H, dh)) / dh; if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
    return a.d[(Math.floor(v * a.H) * a.W + Math.floor(u * a.W)) * 4 + 3] / 255; };
  for (const [el, e] of blocks) { let n = 0, on = 0; const xs = e.rects.map((q) => q[0]), ys = e.rects.map((q) => q[1]), bx = { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...e.rects.map((q) => q[0] + q[2])), b: Math.max(...e.rects.map((q) => q[1] + q[3])) };
    for (const [x, y, w, h] of e.rects) for (let i = 1; i < 8; i++) for (let j = 1; j < 4; j++) { const px = x + w * i / 8, py = y + h * j / 4;
      if (px < 0 || py < 0 || px > 1920 || py > 1080) continue; n++; let seen = false;
      for (const top of document.elementsFromPoint(px, py)) { if (el.contains(top)) { seen = true; continue; } if (!seen || top.contains(el)) continue;
        const r = top.getBoundingClientRect(); if (r.width >= 1900 && r.height >= 1060) break;
        const P = picOf(top); if (!P || vis(top) < .6 || top.closest('[data-ground]')) continue;
        if (r.left <= bx.l + 2 && r.top <= bx.t + 2 && r.right >= bx.r - 2 && r.bottom >= bx.b - 2) break;   // the text's own ground
        const a = await alphaOf(P.u); if (a && alphaAt(top, P, a, px, py) > .5) on++; break; } }
    e.onCut = n ? on / n : 0; }
  // what of the words lies behind the subject in front (camera.js's lifted subject, a frame part or a card's picture
  // marked front), where its picture is opaque, line by line over each line's glyphs (an em about its middle: sampled
  // over the line box, a two-line name with its second line two thirds behind a cabinet door measured a third, recap S8)
  for (const [el, e] of blocks) { e.front = 0; if (!document.querySelector('[data-front]')) break;
    // (and character by character, an em a cell: a line 30 % behind a head lost 地方 whole and the sentence broke off, talent
    // S5; e.frontCell, the most hidden cell)
    e.frontCell = e.frontCell || 0;
    for (const [x, y, w, h] of e.rects) { let n = 0, on = 0; const cy = y + h / 2, fs = h / 1.2, nc = Math.max(1, Math.round(w / fs)), cells = Array.from({ length: nc }, () => [0, 0]);   // (the em on screen, from the line's own box: zoom and camera included)
      for (let i = 0; i < nc * 3; i++) for (let j = 0; j < 5; j++) { const px = x + w * (i + .5) / (nc * 3), py = cy - .38 * fs + j * .19 * fs; if (px < 0 || py < 0 || px > 1920 || py > 1080) continue; n++; const cell = cells[Math.floor(i / 3)]; cell[0]++;
        for (const top of document.elementsFromPoint(px, py)) { if (el.contains(top) || top.contains(el)) break; const fr = top.closest('[data-front]'); if (!fr) continue;
          let a; if (top.id === '__front' && window.__frontAlpha) a = window.__frontAlpha(px, py); else { const P = picOf(top); const al = P ? await alphaOf(P.u) : null; a = al ? alphaAt(top, P, al, px, py) : (P ? 1 : 0); }
          if (a > .5) { on++; cell[1]++; } break; } }
      if (n) e.front = Math.max(e.front, on / n); for (const [k, m] of cells) if (k) e.frontCell = Math.max(e.frontCell, m / k); } }
  return [...blocks.values()].map((e) => { const xs = e.rects.map((q) => q[0]), ys = e.rects.map((q) => q[1]);
    const x = Math.min(...xs), y = Math.min(...ys); return { key: e.key, text: e.text.slice(0, 40), op: e.op, line: e.line, lineMax: e.lineMax, deco: e.deco, carry: e.carry, ground: e.ground, reading: e.reading, alpha: e.alpha, covered: e.covered, front: e.front, frontCell: e.frontCell, onCut: e.onCut,
      box: { x, y, w: Math.max(...e.rects.map((q) => q[0] + q[2])) - x, h: Math.max(...e.rects.map((q) => q[1] + q[3])) - y },
      anchor: e.anchor, material: e.material, integration: e.integration, lightDir: e.lightDir, plateLight: e.plateLight, contact: e.contact, env: e.env, rank: e.rank, quad: e.quad }; });
})()`;

// the share of a frame picture that carries something (40 px tiles with detail after a blur that removes grain and
// texture; flat paper, a bare panel or plain ground has none), the subtitle band left out
export function fills(cfg, pngs) {
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  const code = `import cv2,json,sys,numpy as np\nout=[]\nfor f in sys.argv[1:]:\n  g=cv2.GaussianBlur(cv2.imread(f,0),(0,0),3)[:920].astype(float)\n  t=[g[y:y+40,x:x+40].std() for y in range(0,920-39,40) for x in range(0,1920-39,40)]\n  out.append(float(np.mean(np.array(t)>7)))\nprint(json.dumps(out))`;
  const r = spawnSync(py, ['-c', code, ...pngs], { encoding: 'utf8' });
  return r.status === 0 ? JSON.parse(r.stdout) : pngs.map(() => null);
}

// where the picture sits against the reference (balance.py: the lower half's share of the picture above the subtitle
// band). The blind reviews of hupo-auto2 round two sent back five shots for 头重脚轻 (the figure and its table high and
// left, the lower half an empty page: recap S6, opensrc S9 and S10, cards S5, r1 S8) while every check passed.
export function balances(pngs) {
  const r = spawnSync('python3', [path.join(path.dirname(new URL(import.meta.url).pathname), 'balance.py'), ...pngs], { encoding: 'utf8' });
  return r.status ? pngs.map(() => null) : r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
// pure: a problem when ours sits in its top half where the reference does not
export function balanceProblem(t, ours, ref, L = LIMITS) {
  if (!ours || !ref || ours.top + ours.bottom < .01) return null;
  if (ours.share < L.balance && ref.share >= ours.share + L.balanceGap) return { kind: 'unlike-reference', at: +t.toFixed(2), say: `the picture sits in the top half (its lower half carries ${Math.round(ours.share * 100)} % of it, the reference's ${Math.round(ref.share * 100)} %): bring the figure down to the middle or grow it`, owner: 'plan' };
  return null;
}
// (pure) the first key frame against the reference's at the same moment: under a third of what it carries
export function firstFrameProblem(t, fill, refFill, L = LIMITS) {
  return fill != null && refFill != null && refFill > .15 && fill < refFill * L.firstFill ? { kind: 'empty', at: +t.toFixed(2), say: `the shot opens nearly empty (${Math.round(fill * 100)} % of the frame carries anything, the reference ${Math.round(refFill * 100)} %): its focus should be there from the first key frame`, owner: 'plan' } : null;
}
// how much each pair of frames differs (the mean of the absolute difference of their greys, 0-1, blurred to 160 x 90:
// grain and type rendering aside)
export function changes(cfg, pairs) {
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  const code = `import cv2,json,sys,numpy as np\nf=sys.argv[1:]\nout=[]\nfor a,b in zip(f[0::2],f[1::2]):\n  x=cv2.imread(a,0);y=cv2.imread(b,0)\n  if x is None or y is None: out.append(None); continue\n  x=cv2.GaussianBlur(cv2.resize(x,(160,90)),(0,0),1.5).astype(float);y=cv2.GaussianBlur(cv2.resize(y,(160,90)),(0,0),1.5).astype(float)\n  out.append(float(np.abs(x-y).mean()/255))\nprint(json.dumps(out))`;
  const r = spawnSync(py, ['-c', code, ...pairs.flat()], { encoding: 'utf8' });
  return r.status === 0 ? JSON.parse(r.stdout) : pairs.map(() => null);
}
// (pure) ours stands still across the shot where the reference moves on
export function progressProblem(t, d, refD, L = LIMITS) {
  return d != null && refD != null && refD >= L.progressRef && d < refD * L.progress ? { kind: 'unlike-reference', at: +t.toFixed(2), say: `the frame hardly changes from the first key frame to the last (${(d * 100).toFixed(1)} % against the reference's ${(refD * 100).toFixed(1)} %): bring things in one after another or move the camera`, owner: 'plan' } : null;
}
// (pure) a picture of words cut by the frame's edge: more than the line's share outside 0..1920 x 0..1080
export function wordsEdgeProblem(t, w, L = LIMITS) {
  if (!w || w.op < .6 || !(w.box.w > 0) || !(w.box.h > 0)) return null;
  const inside = Math.max(0, Math.min(1920, w.box.x + w.box.w) - Math.max(0, w.box.x)) * Math.max(0, Math.min(1080, w.box.y + w.box.h) - Math.max(0, w.box.y)), out = 1 - inside / (w.box.w * w.box.h);
  return out > L.outside ? { kind: 'off-frame', at: +t.toFixed(2), say: `the page's words "${String(w.text).slice(0, 24)}": ${Math.round(out * 100)} % of them are cut by the frame's edge`, owner: 'plan' } : null;
}
// (pure) a picture of a page's words with something laid over a part of them (covered: the share of points over it
// where a picture lies on top)
export function wordsCoveredProblem(t, w, L = LIMITS) {
  if (!w || w.op < .6 || !(w.covered > L.wordsCovered)) return null;
  return { kind: 'overlap', at: +t.toFixed(2), say: `the page's words "${String(w.text).slice(0, 24)}": ${Math.round(w.covered * 100)} % of them lie under a picture (a phrase is read whole)`, owner: 'plan' };
}
const area = (b) => Math.max(0, b.w) * Math.max(0, b.h);
const inter = (a, b) => area({ w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) });
const HAN = /[㐀-鿿豈-﫿]/;
const EMOJI = /\p{Extended_Pictographic}/u;

// pure: the problems of one key frame, { kind (the picture review's kinds, layers.mjs PROBLEMS), at, say, owner }:
// owner "module" when the module's layout or type is at fault, "plan" when the director's choice is (material,
// module). blocks: settled visible texts ({ text, line, box, op, contrast, hant }); faces: face boxes on the frame
// (px); fill / refFill: the share of the frame carrying something, ours and the reference's at the same moment
export function frameProblems(t, blocks, faces = [], L = LIMITS, fill = null, refFill = null) {
  const out = [], at = +t.toFixed(2), q = (kind, say, owner = 'module') => out.push({ kind, at, say, owner }), w = (b) => `"${b.text}"`;
  // sparse: much emptier than the reference at the same moment (a bare logo on a glow where the reference shows a
  // real photo, a dark logo on a dark stage, a panel with one message: h800-S9, meta-S2, h800-S1)
  if (fill != null && refFill != null && fill < refFill * L.fill) q('unlike-reference', `the frame carries far less than the reference at this moment (${Math.round(fill * 100)} % of it has anything, the reference ${Math.round(refFill * 100)} %): painted layers (spec.layers: props, light, paper over or under the content), richer material or another module`, 'plan');
  // decorative lettering (data-deco: a name set huge as a pattern behind a person card, meta-S5) is not words to read
  // and may run off the frame; it must stay faint (at most 0.35 of full strength) or it competes with the words
  for (const b of blocks.filter((x) => x.deco)) if (b.op * (b.alpha ?? 1) > L.deco) q('weak-design', `${w(b)}: decorative lettering at ${Math.round(b.op * (b.alpha ?? 1) * 100)} % strength competes with the words (at most ${Math.round(L.deco * 100)} %)`);
  // a text wholly outside the frame is not on screen (a row the camera has panned past: h800-S10): not judged
  blocks = blocks.filter((b) => !b.deco && inter(b.box, { x: 0, y: 0, w: 1920, h: 1080 }) > 0);
  for (const b of blocks) {
    const cjk = HAN.test(b.text), min = cjk ? L.cjk : L.latin;
    if (b.line < min) q('unreadable', `${w(b)}: type ${Math.round(b.line)} px a line, too small to read (at least ${min} px)`);
    if (b.contrast != null && b.contrast < L.contrast) q('unreadable', `${w(b)}: the type does not stand off what is behind it (contrast ${Math.round(b.contrast)}, at least ${L.contrast})`);
    // material type declares its WCAG ratio (the texture path has no pixel spread to measure): large 3:1, body 4.5:1
    if (b.ratio != null && b.ratio < (b.large ? MIN.large : MIN.body)) q('unreadable', w(b) + ': material contrast ' + (Math.round(b.ratio * 100) / 100) + ':1 under ' + (b.large ? MIN.large : MIN.body) + ':1 ' + (b.large ? '(large)' : '(body)'));
    // a word has to belong to the picture: display or 3D type with no anchor is a floating word (typedesign policy)
    if ((b.integration === '3d' && (!b.anchor || b.anchor === 'none')) || (b.anchor === 'none' && b.line >= L.display)) q('floating-type', w(b) + ': type with no anchor in the plate (typedesign: reason + anchor before render)');
    if (b.integration === '3d' && (!b.env || !b.contact)) q('cheap-3d', w(b) + ': 3D without ' + (!b.env ? 'an environment map' : 'a contact shadow') + ' (typedesign: no env/contact, no 3D)');
    if (b.lightDir != null && b.plateLight != null) {
      let d = Math.abs((((b.lightDir - b.plateLight) % 360) + 540) % 360 - 180);
      if (d > L.lightDeg) q('light-mismatch', w(b) + ': its light is ' + Math.round(d) + '° off the plate (at most ' + L.lightDeg + '°)');
    }
    if (b.sharp != null && b.plateSharp) { const r = b.sharp / b.plateSharp; if (r < L.dofMin || r > L.dofMax) q('dof-mismatch', w(b) + ': its edge sharpness is ' + r.toFixed(2) + 'x the plate (must be ' + L.dofMin + '–' + L.dofMax + ')'); }
    if (Array.isArray(b.quad) && b.quad.length === 4) {
      const qx = b.quad.map((p) => p[0] * 1920), qy = b.quad.map((p) => p[1] * 1080);
      const bx0 = Math.min(...qx), bx1 = Math.max(...qx), by0 = Math.min(...qy), by1 = Math.max(...qy);
      const iw = Math.max(0, Math.min(b.box.x + b.box.w, bx1) - Math.max(b.box.x, bx0));
      const ih = Math.max(0, Math.min(b.box.y + b.box.h, by1) - Math.max(b.box.y, by0));
      const inter = iw * ih, union = (b.box.w * b.box.h) + ((bx1 - bx0) * (by1 - by0)) - inter;
      const iou = union > 0 ? inter / union : 0;
      if (iou < L.quadIou) q('perspective-mismatch', w(b) + ': sits ' + Math.round(iou * 100) + ' % inside its declared plate quad (at least ' + Math.round(L.quadIou * 100) + ' %): the words are not on the surface they claim');
    }
    // the strokes against what is under them (the frame drawn again with the words hidden): grey metal letters on a
    // light ground passed the spread above because a dark product stood in their box (the bench, cards-S3 顯卡)
    if (b.standoff != null && b.standoff < L.standoff) q('unreadable', `${w(b)}: its strokes differ from what is under them by ${Math.round(b.standoff)} of 255 (at least ${L.standoff}); darken or lighten the ground, or the type`);
    const inside = inter(b.box, { x: 0, y: 0, w: 1920, h: 1080 });
    // cut by an edge while the frame is (nearly) at rest; a text crossing the edge in a pan is entering or leaving
    // (display type is never let off for moving: a title drifting under a push had its first character cut, open-S14)
    // a line the camera reads along (data-reading: a message close-up travelling along it, who R13) may leave what is
    // read behind the edge, as the reference's does, while most of it stays in the frame
    const readOk = b.reading && inside / Math.max(1, area(b.box)) >= .6;
    if (!readOk && area(b.box) && 1 - inside / area(b.box) > L.outside && ((b.move ?? 0) < L.restMove || b.line >= L.display)) q('off-frame', `${w(b)}: ${Math.round((1 - inside / area(b.box)) * 100)} % of it is cut by the frame's edge`);
    if (b.box.y + b.box.h > L.bottom) q('overlap', `${w(b)}: in the subtitle band (below ${L.bottom} px; the user's subtitles go there)`);
    if (b.hant != null && b.hant !== b.text) q('other', `${w(b)}: Simplified characters on screen (house rule: Traditional, "${b.hant}")`);
    if (EMOJI.test(b.text)) q('other', `${w(b)}: emoji on screen (house rule: none)`);
    // quote marks with no words between them (a label drawn for a card that has none: h800-S3)
    if (/^[“”"'‘’「」『』\s]{2,}$/.test(b.text)) q('empty', `${w(b)}: quote marks with nothing in them (a label without its words)`);
    // display type (a title a quarter of the frame tall) may stand over a person, as the reference sets its year over the
    // presenter (open R01): the face reads through its strokes; a label or a line of text over a face does not
    // (only small type over a face: display words may cross it or sit behind the person, user 2026-10-23: 压脸也可以…要灵活的设计)
    if (b.line < L.faceText) for (const f of faces) if (inter(b.box, f) > area(f) * L.face) q('overlap', `${w(b)}: the text covers a face`);
    // (display words may stand behind a product or a person laid over them, as the reference's 显卡 behind its card:
    // up to coveredDisplay; user 2026-10-23: 压脸也可以…或者分层出来放在人像后面)
    { const lim = b.line >= L.display ? L.coveredDisplay : L.covered; if (b.covered > lim) q('overlap', `${w(b)}: ${Math.round(b.covered * 100)} % of it is hidden under something drawn over it (at most ${Math.round(lim * 100)} %)`); }
    // small type on a cut-out picture's opaque body (display type may lie over a picture, as the reference's titles over
    // its props): its strokes run into the picture's (who S7, cards S2, 2026-10-26)
    // behind the subject in front (spec.front, user 2026-10-23: 分层出来放在人像后面): display type only, and at most part
    // of it, so it still reads; small type under a person is hidden, not layered
    if ((b.frontCell || 0) > L.frontCell) q('overlap', `${w(b)}: a character of it is ${Math.round(b.frontCell * 100)} % behind the subject in front (at most ${Math.round(L.frontCell * 100)} %): a word behind a head is lost, move the words or the subject`);
    if ((b.front || 0) > (b.line >= L.faceText ? L.frontMax : L.covered)) q('overlap', `${w(b)}: ${Math.round(b.front * 100)} % of it is behind the subject in front (at most ${Math.round((b.line >= L.faceText ? L.frontMax : L.covered) * 100)} %${b.line >= L.faceText ? '' : ': small type does not go behind a person'})`);
    if (b.line < L.faceText && (b.onCut || 0) > L.onCut) q('overlap', `${w(b)}: ${Math.round(b.onCut * 100)} % of it lies on a picture's body under it (at most ${Math.round(L.onCut * 100)} %): move the picture or the words clear of each other`);
  }
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i], b = blocks[j];
    // words of the ground (data-ground: a title's card of facts, as a page's words lie under a title) may lie under
    // display type pressed over them (open R20: 凭什么 over the whale and its three points); never under other words
    if ((a.ground && b.line >= L.display) || (b.ground && a.line >= L.display)) continue;
    // (the shot before's display line leaving over the cut, camera.js carry: a dissolve of words, fading out in its first
    // second as the reference's year over the stock board, open R02 — not a line set over the next)
    if (a.carry || b.carry) continue;
    // (side by side on one line, a word under another's tag shows: a tag over DeepSeek's "k" was 14 % of the tag and
    // passed, r1-S8; two lines stacked share little height and are not this)
    const vy = Math.max(0, Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y)) / Math.max(1, Math.min(a.box.h, b.box.h));
    if (inter(a.box, b.box) > Math.min(area(a.box), area(b.box)) * (vy >= .5 ? L.overlapLine : L.overlap)) q('overlap', `${w(a)} and ${w(b)} lie over each other`);
    // (two lines stacked whose strokes run into each other: the area they share is small, a stroke of 前 under the foot of
    // 觀 was 7 % of the smaller line and passed, ending-S11; stacked lines may touch, not cross a sixth of the shorter)
    else if (vy > L.stackCross && vy < .5 && Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x) > .1 * Math.min(a.box.w, b.box.w)) q('overlap', `${w(a)} and ${w(b)}: one line runs into the other (${Math.round(vy * 100)} % of the shorter's height)`);
  }
  // hierarchy: three or more lines at one size with no ranks is one flat voice, not a hierarchy
  const nonDeco = blocks.filter((x) => !x.deco && x.line >= 40);
  const clusters = [];
  for (const b of nonDeco) { const c = clusters.find((k) => Math.abs(k.line - b.line) <= k.line * 0.05); if (c) c.n++; else clusters.push({ line: b.line, n: 1 }); }
  const ranks = new Set(nonDeco.map((x) => x.rank).filter((r) => r != null));
  const typed = nonDeco.some((x) => x.anchor != null || x.integration);
  if (typed) for (const c of clusters) if (c.n >= L.hierarchyN && ranks.size < 2) q('hierarchy-flat', `${c.n} lines at one size (${Math.round(c.line)} px) and no rank: hierarchy is asserted, not designed (typedesign)`);
  return out;
}

// contrast of each box on a frame picture: the spread between its dark and light pixels (p5 to p95 of luminance)
function contrasts(cfg, png, boxes) {
  if (!boxes.length) return [];
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  const code = `import cv2,json,sys,numpy as np\nim=cv2.imread(sys.argv[1],0);H,W=im.shape;out=[]\nfor b in json.loads(sys.argv[2]):\n  x0,y0=max(0,int(b['x'])),max(0,int(b['y']));x1,y1=min(W,int(b['x']+b['w'])),min(H,int(b['y']+b['h']))\n  c=im[y0:y1,x0:x1]\n  out.append(None if c.size<20 else float(np.percentile(c,95)-np.percentile(c,5)))\nprint(json.dumps(out))`;
  const r = spawnSync(py, ['-c', code, png, JSON.stringify(boxes)], { encoding: 'utf8' });
  return r.status === 0 ? JSON.parse(r.stdout) : boxes.map(() => null);
}
// how far the strokes of each box stand from what is under them: of the pixels the words change, how much the strokes
// change them (the upper quartile: a soft shadow round yellow letters changes many pixels a little, and their median
// called readable labels faint); 0-255, null where the words change too little of the box to judge
// the colours the judged blocks' strokes are painted in for the stroke pass (far from each other and from type colours)
const INK_COLOURS = ['#ff00ff', '#00ffff', '#ffff00', '#00ff00', '#ff8000', '#8000ff', '#0080ff', '#ff0080'];
export function standoffs(cfg, png, bare, boxes, ink = null) {
  const py = process.env.A1_PYTHON || path.join(cfg.sourceRoot, 'work/external-source-tool-canaries-v1/.venv/bin/python');
  // (ink: the same frame with the words in one flat colour and no shadow: its strokes are the pixels it changes from the
  // bare frame. Black type over a dark office passed where it crossed two bright monitors, the box's upper quartile
  // being their pixels: talent-S4. With the strokes known, their median colour distance from what is under them)
  const code = `import cv2,json,sys,numpy as np\na=cv2.imread(sys.argv[1]).astype(float);b=cv2.imread(sys.argv[2]).astype(float);c=cv2.imread(sys.argv[4]).astype(float) if sys.argv[4] else None;H,W=a.shape[:2];out=[]\nfor q in json.loads(sys.argv[3]):\n  x0,y0=max(0,int(q['x'])),max(0,int(q['y']));x1,y1=min(W,int(q['x']+q['w'])),min(H,int(q['y']+q['h']))\n  s,g=a[y0:y1,x0:x1],b[y0:y1,x0:x1];d=np.sqrt(((s-g)**2).sum(axis=2)/3)\n  if c is not None:\n    col=q.get('col','#ff00ff').lstrip('#');col=np.array([int(col[4:6],16),int(col[2:4],16),int(col[0:2],16)],float)\n    cc=c[y0:y1,x0:x1];m=(np.abs(cc-g).max(axis=2)>90)&(np.abs(cc-col).max(axis=2)<80)\n    if m.sum()>=60: out.append(float(np.median(d[m]))); continue\n  m=d>12\n  out.append(None if m.sum()<30 else float(np.percentile(d[m],75)))\nprint(json.dumps(out))`;
  const r = spawnSync(py, ['-c', code, png, bare, JSON.stringify(boxes), ink || ''], { encoding: 'utf8' });
  try { return JSON.parse(r.stdout); } catch { return boxes.map(() => null); }
}
function faceBoxes(png) {
  const r = spawnSync('swift', [path.join(path.dirname(new URL(import.meta.url).pathname), 'faces.swift'), png], { encoding: 'utf8', timeout: 120000 });
  try { return JSON.parse(r.stdout).map(([x, y, w, h]) => ({ x: x * 1920, y: y * 1080, w: w * 1920, h: h * 1080 })); } catch { return []; }
}

// on a rendered module page (Playwright page with window.render): every key frame measured; returns the errors
// pure: the shot's largest line against the reference's display line at its moment (refType, px of 1080): a title or a
// quote that sets it well smaller reads a size down (seven blind reviews of hupo-auto2 round 40: 顯卡, 人員, 頓悟時刻, 650,
// DeepSeek 深度求索 at a half to a third of the reference's); the first key frame may still be building up
export function displayProblem(t, blocks, display, L = LIMITS) {
  if (!display || !blocks.length) return null;
  // (each block by its largest line: by its smallest, AI at 2.2 em among its words read as the words, 203 px against the
  // reference's 280 px AI — the reference's display line is its largest type, OCR)
  const big = Math.max(...blocks.map((b) => b.lineMax || b.line || 0));
  return big > 0 && big < display * L.display_share ? { kind: 'unlike-reference', at: +t.toFixed(2), say: `its largest line is ${Math.round(big)} px, the reference's display line ${Math.round(display)} px: set it at the reference's size`, owner: 'module' } : null;
}
export async function measureFrames(cfg, page, times, { toHant = null, ref = null, span = null, display = null, twice = true } = {}) {
  const out = [], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-frames-'));
  // the geometry (edges, the subtitle band, overlaps) every quarter second across the shot, not only at the key frames
  // (a drift slid a title off the edge between them: h800-S10); pixels (contrast, faces, fill) at the key frames
  const dense = [];
  if (span) for (let t = span[0] + .25; t < span[1] - .05; t += .25) {
    await page.evaluate((x) => window.render(x), t + .1); const later = Object.fromEntries((await page.evaluate(PAGE_BLOCKS)).map((b) => [b.key, b]));
    await page.evaluate((x) => window.render(x), t); const now = await page.evaluate(PAGE_BLOCKS);
    const blocks = now.filter((b) => { const l = later[b.key]; return b.op >= .6 && l && Math.abs(l.op - b.op) < .05 && Math.abs(l.box.w - b.box.w) < Math.max(3, b.box.w * .03) && Math.abs(l.box.h - b.box.h) < Math.max(3, b.box.h * .03) && Math.hypot(l.box.x - b.box.x, l.box.y - b.box.y) < 40; });
    for (const b of blocks) b.move = Math.hypot(later[b.key].box.x - b.box.x, later[b.key].box.y - b.box.y);
    out.push(...frameProblems(t, blocks.map((b) => ({ ...b, contrast: null, hant: null })), [], LIMITS).filter((p) => ['off-frame', 'overlap'].includes(p.kind)));
    const f = path.join(dir, `d${dense.length}.jpg`); await page.screenshot({ path: f, type: 'jpeg', quality: 60 }); dense.push({ t, f });
  }
  // the frame gone blank in the middle of a shot for a third of a second or more (the camera crossed the strip a removed
  // picture left on a page and jumped: h800-S2)
  if (dense.length) { const fl = fills(cfg, dense.map((d) => d.f)); let run = [];
    // (a frame read blank is drawn again once its pictures have had time to load and read once more: a ground drawn
    // frame by frame showed white while its next picture decoded, talent S2 measured blank where the film is not)
    for (let i = 0; i < dense.length; i++) if (fl[i] != null && fl[i] < L_BLANK) { await page.evaluate((x) => window.render(x), dense[i].t); await page.waitForTimeout(400); await page.evaluate((x) => window.render(x), dense[i].t); await page.screenshot({ path: dense[i].f, type: 'jpeg', quality: 60 }); fl[i] = fills(cfg, [dense[i].f])[0]; }
    for (let i = 0; i <= dense.length; i++) { const blank = i < dense.length && fl[i] != null && fl[i] < L_BLANK;
      if (blank) run.push(dense[i].t); else { if (run.length >= 2) out.push({ kind: 'empty', at: +run[0].toFixed(2), say: `the frame goes blank for ${(run.length * .25).toFixed(2)} s in the middle of the shot (from ${run[0].toFixed(2)} s)`, owner: 'module' }); run = []; } } }
  // every 0.2 s, the chapter line's geometry (cardgeometry.mjs): type over type, over a picture it does not belong to,
  // over the things a picture shows, pictures and type cut by the frame, type too small, standing 0.8 s; the same
  // sentence marked on a page and set again at once
  if (span) { const G = await import('./cardgeometry.mjs'); out.push(...await G.cardGeometry(page, { from: span[0], to: span[1], id: 'the shot', seek: (x) => { window.render(x); }, fold: toHant, twice })); }
  const keys = [];
  for (const t of times) {
    await page.evaluate((x) => window.render(x), t + .1); const later = Object.fromEntries((await page.evaluate(PAGE_BLOCKS)).map((b) => [b.key, b]));
    await page.evaluate((x) => window.render(x), t); const now = await page.evaluate(PAGE_BLOCKS);
    // settled and shown: mostly opaque, its opacity and size steady over the next 0.1 s (a camera's slow drift or push
    // moves every text all the time and is allowed: requiring a still place left the person cards' captions of meta-S4
    // and S5 unmeasured; an entrance, an exit or a fast move is not judged)
    const blocks = now.filter((b) => { const l = later[b.key]; return b.op >= .6 && l && Math.abs(l.op - b.op) < .05 && Math.abs(l.box.w - b.box.w) < Math.max(3, b.box.w * .03) && Math.abs(l.box.h - b.box.h) < Math.max(3, b.box.h * .03) && Math.hypot(l.box.x - b.box.x, l.box.y - b.box.y) < 40; });
    // FC_DEBUG=1: every text block found and whether it was judged (a check that let something through is debugged here)
    for (const b of blocks) b.move = Math.hypot(later[b.key].box.x - b.box.x, later[b.key].box.y - b.box.y);
    if (process.env.FC_DEBUG) console.error(t, JSON.stringify(now.map((b) => ({ text: b.text, judged: blocks.includes(b), line: Math.round(b.line), op: +b.op.toFixed(2), covered: b.covered, box: Object.fromEntries(Object.entries(b.box).map(([k, v]) => [k, Math.round(v)])), later: later[b.key] && Object.fromEntries(Object.entries(later[b.key].box).map(([k, v]) => [k, Math.round(v)])) }))));
    const png = path.join(dir, `${t.toFixed(2)}.png`); await page.screenshot({ path: png });
    contrasts(cfg, png, blocks.map((b) => b.box)).forEach((c, i) => { blocks[i].contrast = c; });
    // the same frame with the words hidden: what the strokes add over their ground
    // the same frame with the words made clear (their own grounds kept: a name on a dark badge was judged against the
    // light page behind the badge, hupo chat h800-S1), then with each judged block's strokes in a colour of its own and
    // every other word still clear (the chart's huge faded letters behind its labels were taken for their strokes)
    if (blocks.length) { const bare = path.join(dir, `${t.toFixed(2)}-bare.png`), ink = path.join(dir, `${t.toFixed(2)}-ink.png`);
      const COLS = INK_COLOURS, keys = blocks.map((b) => b.key);
      await page.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), els = new Set(); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim() && n.parentElement && !/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) els.add(n.parentElement);
        window.__clear = [...els].map((e) => [e, e.style.cssText]);
        for (const [e] of window.__clear) { const cs = getComputedStyle(e), clip = cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text';
          for (const [k, v] of [['color', 'transparent'], ['-webkit-text-fill-color', 'transparent'], ['text-shadow', 'none'], ['-webkit-text-stroke', '0'], ...(clip ? [['background', 'none']] : [])]) e.style.setProperty(k, v, 'important'); } });
      await page.screenshot({ path: bare });
      await page.evaluate(({ keys, COLS }) => { for (const [e] of window.__clear) { const b = e.closest('[data-fk]'), i = b ? keys.indexOf(b.dataset.fk) : -1; if (i < 0) continue;
        for (const [k, v] of [['color', COLS[i % COLS.length]], ['-webkit-text-fill-color', COLS[i % COLS.length]], ['filter', 'none'], ['background', 'none']]) e.style.setProperty(k, v, 'important'); } }, { keys, COLS });
      await page.screenshot({ path: ink });
      await page.evaluate(() => { for (const [e, c] of window.__clear || []) e.style.cssText = c; window.__clear = null; });
      standoffs(cfg, png, bare, blocks.map((b, i) => ({ ...b.box, col: COLS[i % COLS.length] })), ink).forEach((c, i) => { blocks[i].standoff = c; }); }
    if (toHant) { const h = toHant(blocks.map((b) => b.text)); blocks.forEach((b, i) => { b.hant = h[i]; }); }
    // fill against the reference: the middle and late key frames (the first may still be building up)
    // (the first key frame is held to the reference too, at a lower bar: it may still be building up, but a frame that
    // opens on a line of small type where the reference has its figure was sent back again and again, 开头空)
    const rf0 = ref ? ref(t, path.join(dir, `ref-${t.toFixed(2)}.png`)) : null, rf = t !== times[0] ? rf0 : null;
    keys.push({ t, png, ref: rf0 });
    // pictures of a page's words (frame parts cut to a phrase: data-words) are held to the edges as type is (meta-S3's
    // headline bars ran off both sides and the check, reading only set type, let them through)
    // ... and to what lies over them (meta-S3: a portrait laid over the bars' last words, a tenth of them, passed the
    // check for set type, which allows display words partly under a picture): a page's phrase is read whole
    for (const w of await page.evaluate(() => [...document.querySelectorAll('[data-words]')].map((e) => { const r = e.getBoundingClientRect(); let n = 0, hid = 0;
      for (let i = 1; i < 12; i++) for (let j = 1; j < 4; j++) { const px = r.left + r.width * i / 12, py = r.top + r.height * j / 4; if (px < 0 || py < 0 || px > 1920 || py > 1080) continue; n++;
        for (const top of document.elementsFromPoint(px, py)) { if (e.contains(top) || top.contains(e)) break; const cs = getComputedStyle(top), q = top.getBoundingClientRect(); if (q.width >= 1900 && q.height >= 1060) continue;
          if (cs.mixBlendMode !== 'normal' || +cs.opacity < .6) continue; const pic = /^(IMG|VIDEO|CANVAS)$/.test(top.tagName) || (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)); if (pic) { hid++; break; } } }
      return { text: e.dataset.words, op: parseFloat(getComputedStyle(e).opacity), box: { x: r.left, y: r.top, w: r.width, h: r.height }, covered: n ? hid / n : 0 }; }))) { for (const p of [wordsEdgeProblem(t, w), wordsCoveredProblem(t, w)]) if (p) out.push(p); }
    const [fill, refFill] = rf ? fills(cfg, [png, rf]) : [null, null];
    out.push(...frameProblems(t, blocks, blocks.length ? faceBoxes(png) : [], LIMITS, fill, refFill));
    if (rf) { const [o, r] = balances([png, rf]); const p = balanceProblem(t, o, r); if (p) out.push(p); }
    if (t === times[0] && rf0) { const [f0, r0] = fills(cfg, [png, rf0]); const p = firstFrameProblem(t, f0, r0); if (p) out.push(p); }
    if (t !== times[0]) { const p = displayProblem(t, blocks, display); if (p) out.push(p); }
  }
  // the key frames barely change across the shot where the reference's do (三帧几乎一样: 75 of the reviews' notes):
  // measured here at the still sheet, before the white model
  if (keys.length >= 2 && keys[0].ref && keys.at(-1).ref) { const [d, rd] = changes(cfg, [[keys[0].png, keys.at(-1).png], [keys[0].ref, keys.at(-1).ref]]); const p = progressProblem(keys.at(-1).t, d, rd); if (p) out.push(p); }
  fs.rmSync(dir, { recursive: true, force: true });
  // one report per problem of a text (the first moment it happens), not one for every quarter second it lasts
  const seen = new Set(); return out.filter((p) => { const k = p.kind + p.say.replace(/\d+ %/g, ''); if (seen.has(k)) return false; seen.add(k); return true; });
}
