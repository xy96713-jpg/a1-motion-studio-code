// The geometry of a card at every moment (the user 2026-10-23: 系统连这么基础的问题都还做不好吗 肯定能从代码上 数学上做好):
// the chapter line's measures (chapter.mjs overlapErrors, crossErrors, edgeErrors, textEdgeErrors, GEO_STEP, GEO_HOLD)
// on the pages the card line draws: the shot modules (modules/*.html, window.render) and the recipe cards (motion.mjs
// builds, a GSAP timeline and CSS animations). Every GEO_STEP s the page is read (PAGE_GEOMETRY): every line of type
// (HTML and SVG text, the 3D title's words, decorative lettering as look words), every picture by its opaque part (an
// image's transparent margins and what an ancestor clips away left out), every thin rule; a fault that stands GEO_HOLD
// s or more fails the shot:
//   type over type; type over a picture it does not belong to (a caption inside its picture's card belongs, a page or a
//   plate a third of the frame or more is a ground); a picture or a line of type cut by the frame's edge (a band laid
//   to bleed off is marked data-bleed, a line the camera reads along data-reading)
// and one structure check (sayTwiceErrors): the same sentence shown twice at once, a phrase marked on a page and the
// same words again in set type (paperclip-138-full B04: the page's line swept black and the pull-quote card repeating
// it word for word) or two lines of set type saying the same: say it once.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { overlapErrors, crossErrors, edgeErrors, textEdgeErrors, GEO_STEP, GEO_HOLD } from './chapter.mjs';
import { LIMITS, changes } from './framecheck.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DISPLAY_MIN = 250;   // display type (framecheck LIMITS.display): the ground's words may lie under it

// in the page (window.__geoT: the moment, for media timed by data-start / data-duration): { drawn, shapes, marks }
//   drawn  one entry a line of type: { text, size (em, px on the frame), x0, y0, x1, y1, alpha, look, bleed, ground, own }
//          own: the pictures (indices into shapes) the line belongs to
//   shapes { kind: 'image', src, x0..y1, alpha } (the opaque part on the frame) | { kind: 'line', x0, y0, x1, y1, w, alpha }
//   marks  what is marked on a page now: { words } (marks.js label) or { src, frac: [x, y, w, h] } (a card's highlight)
export const PAGE_GEOMETRY = `(() => {
  const T = window.__geoT ?? null, FW = 1920, FH = 1080, D = window.__geoDebug = [];
  const SKIP = (el) => !el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName) || el.closest('#sub,.subtitle,.todo,[data-todo],[data-front]');   // (the subject in front is no picture the words sit on: framecheck holds what it hides, frontMax)
  const timed = (el) => { if (T == null) return true; for (let a = el; a && a.getAttribute; a = a.parentElement) { const s = a.getAttribute('data-start'), d = a.getAttribute('data-duration'); if (a.id !== 'root' && s != null && d != null && !(T >= +s && T < +s + +d)) return false; } return true; };
  const vis = (el) => { if (!timed(el)) return 0; let o = 1; for (let a = el; a && a !== document.documentElement; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= +cs.opacity; } return o; };
  const full = (q) => q.width >= FW - 20 && q.height >= FH - 20 && q.left <= 10 && q.top <= 10;
  const ctx = (window.__geoCtx = window.__geoCtx || document.createElement('canvas').getContext('2d')), ratio = {};
  // the em of a line from its box: a range's box is the face's content area (ascent + descent), whatever the transforms
  const emOf = (cs, h) => { const k = cs.fontStyle + ' ' + cs.fontWeight + ' 100px ' + cs.fontFamily; if (!(k in ratio)) { ctx.font = k; const m = ctx.measureText('永M'); ratio[k] = (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent) / 100 || 1.2; } return h / ratio[k]; };
  const alphaOf = (c) => { const m = String(c).match(/rgba?\\(([^)]+)\\)/); return m && m[1].split(',').length > 3 ? +m[1].split(',')[3] : 1; };
  const blockOf = (el) => { if (el instanceof SVGElement) return el.closest('text') || el; let a = el; while (a.parentElement && a.parentElement !== document.body && /^inline/.test(getComputedStyle(a).display)) a = a.parentElement; return a; };
  const blocks = new Map(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.textContent.replace(/\\s+/g, ' ').trim(), el = n.parentElement;
    if (!t || SKIP(el)) continue;
    const o = vis(el); if (o < .05) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const rects = [...r.getClientRects()].filter((q) => q.width > 1 && q.height > 1); if (!rects.length) continue;
    const b = blockOf(el), cs = getComputedStyle(el);
    if (!blocks.has(b)) blocks.set(b, { el: b, text: '', rects: [], op: 0, alpha: alphaOf(cs.color), cs,
      look: !!el.closest('[data-deco]'), carry: !!el.closest('[data-carry]'), ground: !!el.closest('[data-ground]'), bleed: !!el.closest('[data-bleed]'), credit: !!el.closest('.credit,[data-credit]'), reading: !!el.closest('[data-reading]') });
    const e = blocks.get(b); e.text += t; e.op = Math.max(e.op, o); (e.els ||= new Set()).add(el);
    // (text painted by its background, background-clip: text, has a transparent colour: its alpha is the paint's)
    if (e.alpha < .05 && (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text')) e.alpha = 1;
    e.rects.push(...rects.map((q) => ({ x0: q.left, y0: q.top, x1: q.right, y1: q.bottom, cs })));
  }
  // plates: solid or pictured layers smaller than a third of the frame; a line is on a plate of its own when one of them
  // holds nine tenths of it and is not six times its size (a tag behind 錯, r1-S8: a layer beside the words, not their parent)
  const plates = [];
  for (const el of document.body.querySelectorAll('*')) { if (SKIP(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8 || r.width * r.height > FW * FH / 3) continue;
    const c = getComputedStyle(el); if (!((alphaOf(c.backgroundColor) > .6 && c.backgroundColor !== 'rgba(0, 0, 0, 0)') || /url\\(/.test(c.backgroundImage) || el.tagName === 'IMG')) continue;
    if (vis(el) < .6) continue; const m = c.maskImage || c.webkitMaskImage || 'none';
    plates.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, flat: el.tagName !== 'IMG' && !/url\\(/.test(c.backgroundImage) && m === 'none' && !el.closest('[data-ui]') }); }   // (data-ui: a real app's screen drawn by code, a chat thread or a trading board: its chips are the screen's)
  // the glyphs of a line: an em about its middle (its box is the face's content area, a Mincho's a third taller)
  const glyphs = (l, em) => { const c = (l.y0 + l.y1) / 2, h = Math.min(l.y1 - l.y0, em); return { x0: l.x0, x1: l.x1, y0: c - h / 2, y1: c + h / 2 }; };
  // a flat plate: a tag-sized solid colour under the line (not twice and a quarter its height, not six times its area)
  const flatOf = (l) => { const A = Math.max(1, (l.x1 - l.x0) * (l.y1 - l.y0)), h = l.y1 - l.y0; return plates.some((r) => { if (!r.flat) return false; const ix = Math.min(l.x1, r.right) - Math.max(l.x0, r.left), iy = Math.min(l.y1, r.bottom) - Math.max(l.y0, r.top); return ix > 0 && iy > 0 && ix * iy >= .9 * A && r.width * r.height <= 6 * A && r.height <= 2.25 * h; }); };
  const plateOf = (l) => { const A = Math.max(1, (l.x1 - l.x0) * (l.y1 - l.y0)); return plates.some((r) => { const ix = Math.min(l.x1, r.right) - Math.max(l.x0, r.left), iy = Math.min(l.y1, r.bottom) - Math.max(l.y0, r.top); return ix > 0 && iy > 0 && ix * iy >= .9 * A && r.width * r.height <= 6 * A; }); };
  const drawn = [], owners = [];
  for (const e of blocks.values()) {
    // one entry a line: the rects of a block that share most of their height
    const lines = []; for (const q of e.rects.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) { const l = lines.find((L) => Math.min(L.y1, q.y1) - Math.max(L.y0, q.y0) >= .5 * Math.min(L.y1 - L.y0, q.y1 - q.y0));
      if (l) { l.x0 = Math.min(l.x0, q.x0); l.x1 = Math.max(l.x1, q.x1); l.y0 = Math.min(l.y0, q.y0); l.y1 = Math.max(l.y1, q.y1); l.h = Math.min(l.h, q.y1 - q.y0); } else lines.push({ ...q, h: q.y1 - q.y0 }); }
    for (const l of lines) {
      // display type (a line 200 px tall or more) by its strokes, not its box (framecheck PAGE_BLOCKS: a Mincho's box
      // is a third taller than its strokes; 顯卡 at 669 px read as cut by the top edge with its ink inside)
      if (l.h >= 200) { ctx.font = l.cs.fontStyle + ' ' + l.cs.fontWeight + ' 100px ' + l.cs.fontFamily; const m = ctx.measureText(e.text), fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
        if (fa + fd > 0) { const top = Math.max(0, (fa - m.actualBoundingBoxAscent) / (fa + fd)), bot = Math.max(0, (fd - m.actualBoundingBoxDescent) / (fa + fd)), h0 = l.y1 - l.y0; l.y0 += h0 * top; l.y1 -= h0 * bot; } }
      const size = emOf(l.cs, l.h), ins = Math.max(0, Math.min(l.x1, FW) - Math.max(l.x0, 0)) * Math.max(0, Math.min(l.y1, FH) - Math.max(l.y0, 0)) / Math.max(1, (l.x1 - l.x0) * (l.y1 - l.y0));
      drawn.push({ text: e.text.slice(0, 40), size, line: l.h, x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1, alpha: e.op * e.alpha, look: e.look, carry: e.carry, ground: e.ground, credit: e.credit, plate: plateOf(glyphs(l, size)), flat: flatOf(glyphs(l, size)), bleed: e.bleed || (e.reading && ins >= .6), own: [] });
      owners.push(e);
    }
  }
  // words drawn in 3D (the extruded title, motion-title3d: its projected box, registered by the module)
  for (const x of window.__drawn3d || []) { const c = x.canvas, o = c ? vis(c) : 1; if (x.box && o >= .05) { drawn.push({ text: x.text, size: x.size, ...x.box, alpha: o, look: false, ground: false, bleed: false, own: [] }); owners.push(c ? { el: c, els: new Set([c]) } : null); } }
  // pictures: their content box (object-fit, background-size), its opaque part (window.__alphaBox), cut by any ancestor
  // that clips (overflow) and is smaller than the frame
  const shapes = [], picEls = [], NAT = window.__natural || {}, AB = window.__alphaBox || {};
  const pos = (v, free) => { const s = String(v).trim(); if (s.endsWith('%')) return free * parseFloat(s) / 100; if (s === 'left' || s === 'top') return 0; if (s === 'right' || s === 'bottom') return free; if (s === 'center') return free / 2; return parseFloat(s) || 0; };
  const fit = (r, nw, nh, mode, px, py) => { if (!nw || !nh || mode === 'fill') return { x: r.left, y: r.top, w: r.width, h: r.height };
    let k = mode === 'cover' ? Math.max(r.width / nw, r.height / nh) : mode === 'contain' ? Math.min(r.width / nw, r.height / nh) : mode === 'scale-down' ? Math.min(1, r.width / nw, r.height / nh) : 1;
    const w = nw * k, h = nh * k; return { x: r.left + pos(px, r.width - w), y: r.top + pos(py, r.height - h), w, h }; };
  for (const el of document.body.querySelectorAll('*')) {
    if (SKIP(el) || el.closest('.hl-layer')) continue;
    const cs = getComputedStyle(el); let src = null, box = null; const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (el.tagName === 'IMG') { if (!el.complete || !el.naturalWidth) continue; src = el.currentSrc || el.src; const [px, py] = cs.objectPosition.split(' '); box = fit(r, el.naturalWidth, el.naturalHeight, cs.objectFit, px, py || '50%'); }
    else if (el.tagName === 'VIDEO') { src = el.currentSrc || el.getAttribute('src') || 'video'; const [px, py] = cs.objectPosition.split(' '); box = fit(r, el.videoWidth, el.videoHeight, cs.objectFit, px, py || '50%'); }
    else if (el.tagName === 'CANVAS') { if (!el.width) continue; src = 'canvas:' + (el.id || el.className || shapes.length); box = { x: r.left, y: r.top, w: r.width, h: r.height }; }
    else { const m = cs.backgroundImage.match(/url\\(["']?([^"')]+)["']?\\)/); if (!m || /^data:image\\/svg/.test(m[1])) continue; src = m[1];
      const n = NAT[src] || [0, 0], bs = cs.backgroundSize, [px, py] = cs.backgroundPosition.split(',')[0].trim().split(' ');
      if (/repeat/.test(cs.backgroundRepeat) && !/no-repeat/.test(cs.backgroundRepeat) && bs !== 'cover') box = { x: r.left, y: r.top, w: r.width, h: r.height };
      else if (bs === 'cover' || bs === 'contain') box = fit(r, n[0], n[1], bs, px, py || '50%');
      else { const [a, b2] = bs.split(' '), W = a === 'auto' || !a ? null : a.endsWith('%') ? r.width * parseFloat(a) / 100 : parseFloat(a), H = !b2 || b2 === 'auto' ? null : b2.endsWith('%') ? r.height * parseFloat(b2) / 100 : parseFloat(b2);
        const w2 = W ?? (H && n[1] ? n[0] * H / n[1] : n[0] || r.width), h2 = H ?? (W && n[0] ? n[1] * W / n[0] : n[1] || r.height); box = { x: r.left + pos(px, r.width - w2), y: r.top + pos(py || '50%', r.height - h2), w: w2, h: h2 }; } }
    const o = vis(el); if (o < .05) continue;
    if (cs.mixBlendMode !== 'normal' && full(r)) continue;   // a texture laid over the whole frame (grain, a vignette)
    const ab = AB[src]; if (ab) box = { x: box.x + ab[0] * box.w, y: box.y + ab[1] * box.h, w: (ab[2] - ab[0]) * box.w, h: (ab[3] - ab[1]) * box.h };
    let x0 = Math.max(box.x, r.left), y0 = Math.max(box.y, r.top), x1 = Math.min(box.x + box.w, r.right), y1 = Math.min(box.y + box.h, r.bottom);
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflow === 'visible' && s.clipPath === 'none') continue; const q = a.getBoundingClientRect(); if (full(q)) continue; x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom); }
    if (x1 - x0 < 4 || y1 - y0 < 4) continue;
    shapes.push({ kind: 'image', src: String(src).slice(0, 300), x0, y0, x1, y1, alpha: o }); picEls.push(el);
    // words lit into a picture (a display plate's LED board, display.mjs: data-words, their box as fractions of it) are type
    if (el.dataset && el.dataset.words && el.dataset.wordsBox) { const [a, b2, c, d2] = el.dataset.wordsBox.split(',').map(Number), q = { x0: box.x + a * box.w, y0: box.y + b2 * box.h, x1: box.x + c * box.w, y1: box.y + d2 * box.h };
      drawn.push({ text: el.dataset.words.slice(0, 40), size: (q.y1 - q.y0) / 2, line: (q.y1 - q.y0) / 2, ...q, alpha: o, look: false, ground: false, credit: false, bleed: false, own: [shapes.length - 1] }); owners.push({ el, els: new Set([el]) }); }
  }
  // thin rules (a solid strip 8 px or less across, 40 px or more long) and SVG lines
  const marksEls = new Set((window.__marks || []).map((m) => m.el));
  for (const el of document.body.querySelectorAll('div,span,i,hr,b')) {
    if (SKIP(el) || marksEls.has(el) || el.closest('.hl-layer') || el.textContent.trim()) continue;
    const r = el.getBoundingClientRect(), a = Math.min(r.width, r.height), L = Math.max(r.width, r.height); if (a > 8 || a < .5 || L < 40) continue;
    const cs = getComputedStyle(el); if (alphaOf(cs.backgroundColor) < .5 || cs.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
    const o = vis(el); if (o < .25) continue;
    const hz = r.width >= r.height; shapes.push(hz ? { kind: 'line', x0: r.left, y0: r.top + r.height / 2, x1: r.right, y1: r.top + r.height / 2, w: a, alpha: o } : { kind: 'line', x0: r.left + r.width / 2, y0: r.top, x1: r.left + r.width / 2, y1: r.bottom, w: a, alpha: o }); picEls.push(null);
  }
  for (const el of document.querySelectorAll('svg line')) { const m = el.getScreenCTM(), o = vis(el); if (!m || o < .25) continue; const P = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    const [x0, y0] = P(el.x1.baseVal.value, el.y1.baseVal.value), [x1, y1] = P(el.x2.baseVal.value, el.y2.baseVal.value), sw = parseFloat(getComputedStyle(el).strokeWidth) * Math.hypot(m.a, m.b);
    if (sw > 0 && Math.hypot(x1 - x0, y1 - y0) >= 40) { shapes.push({ kind: 'line', x0, y0, x1, y1, w: sw, alpha: o * (+getComputedStyle(el).strokeOpacity || 1) }); picEls.push(null); } }
  // what a line of type belongs to: a picture it is drawn inside (a name printed on its plate), or one that shares a
  // close ancestor with it (a caption inside its picture's card: the ancestor not much bigger than the picture)
  // (the elements that hold the line's words, not only its block: a role set on its own paper is an inline-block inside
  // the name's block, meta-S7)
  drawn.forEach((d, i) => { const ow = owners[i]; if (!ow) return; const te = ow.el;
    picEls.forEach((pe, j) => { if (!pe) return; if (pe.contains(te) || [...ow.els].some((x) => pe.contains(x))) { d.own.push(j); return; }
      let a = pe.parentElement; while (a && !a.contains(te)) a = a.parentElement; if (!a || a === document.body) return;
      const q = a.getBoundingClientRect(), p = shapes[j]; if (!full(q) && q.width * q.height <= 2.5 * (p.x1 - p.x0) * (p.y1 - p.y0)) d.own.push(j); }); });
  // marks on page words now on screen
  const marks = [];
  for (const m of window.__marks || []) if (m.shown > .5 && m.el && vis(m.el) >= .3) marks.push({ words: m.label || '' });
  for (const L of document.querySelectorAll('.hl-layer')) { if (vis(L) < .3) continue; const img = L.parentElement && L.parentElement.querySelector('.media img'); if (!img) continue;
    const W = parseFloat(L.style.width) || 1, H = parseFloat(L.style.height) || 1;
    for (const k of L.children) { const sx = (new DOMMatrixReadOnly(getComputedStyle(k).transform)).a; if (!(sx > .6)) continue;
      marks.push({ src: img.currentSrc || img.src, frac: [parseFloat(k.style.left) / W, parseFloat(k.style.top) / H, parseFloat(k.style.width) / W, parseFloat(k.style.height) / H] }); } }
  return { drawn, shapes, marks };
})()`;

// the pictures on a page, before it is read: their natural sizes (background images are not elements) and the opaque
// part of each local image with transparency (a cut-out's empty margins are not the picture)
export async function preparePictures(page) {
  const srcs = await page.evaluate(async () => {
    const out = new Set(); for (const el of document.body.querySelectorAll('*')) { if (el.tagName === 'IMG' && el.src) out.add(el.currentSrc || el.src); const m = getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/); if (m && !/^data:image\/svg/.test(m[1])) out.add(m[1]); }
    window.__natural = {};
    await Promise.all([...out].map((s) => new Promise((r) => { const im = new Image(); im.onload = () => { window.__natural[s] = [im.naturalWidth, im.naturalHeight]; r(); }; im.onerror = r; im.src = s; })));
    return [...out];
  });
  const ab = alphaBoxes(srcs.filter((s) => s.startsWith('file:') && /\.png$/i.test(s)).map((s) => [s, fileURLToPath(s)]));
  await page.evaluate((ab) => { window.__alphaBox = ab; }, ab);
}
const ALPHA = new Map();
// the opaque part of each PNG (alpha above 24 of 255), as fractions of the picture: [x0, y0, x1, y1]
export function alphaBoxes(pairs) {
  const todo = pairs.filter(([, f]) => !ALPHA.has(f) && fs.existsSync(f));
  if (todo.length) {
    const code = `import cv2,json,sys\nout=[]\nfor f in sys.argv[1:]:\n  im=cv2.imread(f,cv2.IMREAD_UNCHANGED)\n  if im is None or im.ndim<3 or im.shape[2]<4: out.append(None); continue\n  a=im[:,:,3]>24;H,W=a.shape;ys=a.any(1).nonzero()[0];xs=a.any(0).nonzero()[0]\n  out.append(None if not len(xs) else [xs[0]/W,ys[0]/H,(xs[-1]+1)/W,(ys[-1]+1)/H])\nprint(json.dumps(out))`;
    const py = process.env.A1_PYTHON || path.join(HERE, '../../../../../work/external-source-tool-canaries-v1/.venv/bin/python');
    const r = spawnSync(fs.existsSync(py) ? py : 'python3', ['-c', code, ...todo.map(([, f]) => f)], { encoding: 'utf8', maxBuffer: 1 << 24 });
    let res = []; try { res = JSON.parse(r.stdout); } catch { res = []; }
    todo.forEach(([, f], i) => ALPHA.set(f, res[i] ?? null));
  }
  return Object.fromEntries(pairs.map(([s, f]) => [s, ALPHA.get(f)]).filter(([, v]) => v && (v[0] > .01 || v[1] > .01 || v[2] < .99 || v[3] < .99)));
}

// (pure) the faults of one moment, as the chapter line names them: type over type (the ground's words under display type
// excepted, as framecheck allows), type over a picture it does not belong to, pictures and type cut by the frame
export function frameGeometryErrors({ drawn, shapes }, id) {
  const display = drawn.some((d) => d.size >= DISPLAY_MIN && (d.alpha ?? 1) >= .5);
  // (the shot before's line leaving over the cut, camera.js carry, is a dissolve of words, not type set over type)
  const errs = [...overlapErrors(drawn.filter((d) => !(display && d.ground) && !d.carry), id)];
  // (display type may stand on or behind a picture, as framecheck's coveredDisplay allows and the user asked: 显卡 behind
  // its card, 压脸也可以; the rules across it still count)
  for (const d of drawn) errs.push(...crossErrors([d], d.size >= DISPLAY_MIN ? shapes.map((p) => (p.kind === 'image' ? { ...p, alpha: 0 } : p)) : d.own?.length ? shapes.map((p, j) => (d.own.includes(j) ? { ...p, alpha: 0 } : p)) : shapes, id));
  errs.push(...edgeErrors(shapes, id), ...textEdgeErrors(drawn, id), ...smallErrors(drawn, id), ...flatPlateErrors(drawn, id), ...kissErrors(drawn, shapes, id));
  return [...new Set(errs)];
}
// (pure) a line of type touching a picture it does not belong to: beside it, along a good part of its height or width,
// closer than KISS px without crossing it (the trophy's handle against OpenAI's I, who-S7 reviews 102 and 104: read as
// type and picture run into each other; a picture under the words is crossErrors' and display type may stand on one)
export const KISS = 4;
export function kissErrors(drawn, shapes, id) {
  const out = [];
  for (const d of drawn) {
    if (d.look || d.ground || d.credit || (d.alpha ?? 1) < .5 || d.size >= DISPLAY_MIN || !String(d.text).trim()) continue;
    // (the glyphs' height, not the line's box: a 104 px line in a 172 px box "touched" the plate below it, r1-S7)
    const cy = (d.y0 + d.y1) / 2, ih = Math.min(d.y1 - d.y0, (d.line || d.size || (d.y1 - d.y0)) * .85)   /* (a CJK glyph's ink is .85 of its line, as title.html REF_INK) */, dy0 = cy - ih / 2, dy1 = cy + ih / 2;
    shapes.forEach((p, j) => {
      if (p.kind !== 'image' || (p.alpha ?? 1) < .5 || d.own?.includes(j)) return;
      const ox = Math.min(d.x1, p.x1) - Math.max(d.x0, p.x0), oy = Math.min(dy1, p.y1) - Math.max(dy0, p.y0);
      if (ox > 0 && oy > 0) return;   // crossing: crossErrors'
      const gx = Math.max(p.x0 - d.x1, d.x0 - p.x1), gy = Math.max(p.y0 - dy1, dy0 - p.y1);
      const side = oy > ih * .4 && gx >= 0 && gx < KISS, end = ox > (d.x1 - d.x0) * .4 && gy >= 0 && gy < KISS;
      if (side || end) out.push(`${id}: "${String(d.text).slice(0, 20)}" touches a picture (${Math.round(side ? gx : gy)} px apart): leave it room or lay it apart`);
    });
  }
  return [...new Set(out)];
}
// (pure) a word on a flat plate drawn by code (a solid tag, chip or board the size of the word: hupo-auto2 r1-S8's 錯/對,
// 有推理, the 12×12 boards; the user: 这种设计的挺丑 为什么不能生图来做): art is never assembled from basic shapes in code
// (house rules); the plate is a paper prop of the label family (labels.mjs, modules/common.js M.plate)
export function flatPlateErrors(drawn, id) {
  return [...new Set(drawn.filter((d) => d.flat && !d.look && (d.alpha ?? 1) >= .5 && String(d.text).trim()).map((d) => `${id}: "${d.text}" sits on a flat plate drawn by code: lay it on a paper prop of the label family (labels.mjs, M.plate)`))];
}
// (pure) type too small to read on the frame (framecheck's limits: CJK 34 px a line, Latin 20), read every moment and
// not only at the key frames a module page is judged at (a recipe card had no such check: paperclip-138-full B22's
// 22 條常染色體 at 30 px, B50's 就在其中); decorative lettering, type mostly off the frame and a source credit
// (compose.mjs .credit: the attribution the user set at 20 px, 2026-10-17) are not read
const HAN = /[\u3400-\u9fff\uf900-\ufaff]/;
export function smallErrors(drawn, id, L = LIMITS) {
  return [...new Set(drawn.filter((d) => !d.look && !d.credit && (d.alpha ?? 1) >= .5 && d.line != null && String(d.text).trim() && d.x0 >= -1 && d.y0 >= -1 && d.x1 <= 1921 && d.y1 <= 1081).map((d) => { const min = HAN.test(d.text) ? L.cjk : L.latin;
    return d.line < min - .5 ? `${id}: "${d.text}" is set ${Math.round(d.line)} px a line, too small to read (at least ${min} px)` : null; }).filter(Boolean))];
}
// (pure) faults that stand: one standing `hold` s or more (as chapter.mjs geometryErrors: a key is the message before
// its first parenthesis, a run is broken by a gap of more than one and a half steps)
export function holdFaults(frames, { step = GEO_STEP, hold = GEO_HOLD } = {}) {
  const runs = new Map(), out = [];
  for (const f of frames) for (const e of f.errs) { const k = e.split(' (')[0], r = runs.get(k);
    if (r && r.last >= f.t - step * 1.5) r.last = f.t; else { if (r && r.last - r.first + step >= hold) out.push(r); runs.set(k, { first: f.t, last: f.t, msg: e }); } }
  for (const r of runs.values()) if (r.last - r.first + step >= hold) out.push(r);
  return out.map((r) => ({ at: +r.first.toFixed(2), to: +(r.last + step).toFixed(2), say: r.msg }));
}

// the same sentence twice at once. Words are compared by their characters (letters and figures, in one script: fold),
// a sentence being SAY_MIN characters or more; two say the same when SAY_SHARE of the shorter one's three-character runs
// are in the other
export const SAY_MIN = 8, SAY_SHARE = 0.6;
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const grams = (s) => { const g = new Set(); for (let i = 0; i + 3 <= s.length; i++) g.add(s.slice(i, i + 3)); return g; };
export function saysSame(a, b) {
  const [x, y] = [norm(a), norm(b)].sort((p, q) => p.length - q.length);
  if (x.length < SAY_MIN) return false;
  if (y.includes(x)) return true;
  const gx = grams(x), gy = grams(y); let n = 0; for (const g of gx) if (gy.has(g)) n++;
  return gx.size > 0 && n / gx.size >= SAY_SHARE;
}
// (pure) texts: the set lines shown now (a block's text, once a block); marked: the words marked on a page now.
// fold: one script for both (the page's Simplified against the set Traditional)
export function sayTwiceErrors(texts, marked, id, { fold = (xs) => xs } = {}) {
  const T = [...new Set(texts.map((t) => String(t).trim()).filter((t) => norm(t).length >= SAY_MIN))], M = [...new Set(marked.filter((m) => norm(m).length >= SAY_MIN))];
  const f = fold([...T, ...M]), ft = f.slice(0, T.length), fm = f.slice(T.length), out = [];
  for (let i = 0; i < T.length; i++) {
    for (let j = 0; j < M.length; j++) if (saysSame(ft[i], fm[j])) out.push(`${id}: "${T[i].slice(0, 24)}" is marked on the page and set again in type at the same time: say it once (the mark on the page, or the card, not both)`);
    for (let j = i + 1; j < T.length; j++) if (saysSame(ft[i], ft[j])) out.push(`${id}: "${T[i].slice(0, 24)}" and "${T[j].slice(0, 24)}" say the same sentence twice at once: say it once`);
  }
  return [...new Set(out)];
}
// the words of a page under a mark, from the page picture's OCR (ocrboxes.swift: lines with their boxes, 0-1): each
// line the mark covers for half its height, cut to the share of its width the mark covers
export function markedWords(lines, [mx, my, mw, mh]) {
  const out = [];
  for (const l of lines) { const [x, y, w, h] = l.box; if (!(w > 0 && h > 0)) continue;
    const vy = Math.min(y + h, my + mh) - Math.max(y, my), vx0 = Math.max(x, mx), vx1 = Math.min(x + w, mx + mw);
    if (vy < .5 * h || vx1 <= vx0) continue;
    const ch = [...l.text], a = Math.floor(((vx0 - x) / w) * ch.length), b = Math.ceil(((vx1 - x) / w) * ch.length);
    out.push(ch.slice(a, b).join('')); }
  return out.join('');
}
const OCR = new Map();
function pageLines(file) {
  if (OCR.has(file)) return OCR.get(file);
  const key = crypto.createHash('sha1').update(`${file}:${fs.statSync(file).size}:${fs.statSync(file).mtimeMs}`).digest('hex').slice(0, 16), cache = path.join(os.tmpdir(), `rb-ocr-${key}.json`);
  let lines = null; try { lines = JSON.parse(fs.readFileSync(cache, 'utf8')); } catch { /* not yet */ }
  if (!lines) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-ocrpage-')); fs.copyFileSync(file, path.join(dir, 'page' + path.extname(file)));
    const r = spawnSync('swift', [path.join(HERE, 'ocrboxes.swift'), dir], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 180000 });
    try { lines = JSON.parse(r.stdout.split('\n').find(Boolean)).lines; fs.writeFileSync(cache, JSON.stringify(lines)); } catch { lines = []; }
    fs.rmSync(dir, { recursive: true, force: true }); }
  OCR.set(file, lines); return lines;
}

// small type on the things a picture shows (the blind review of paperclip-138-full B06: 「答案」 at 55 px on the row of
// red palm prints of the evidence table; the photo is the frame's ground, so the geometry above lets it be): on the frame
// with its words made clear, the share of the line's box (grown by a fifth of its em) in 16 px tiles that carry detail
// (std over 12 after a blur that takes out grain and paper); BUSY_SHARE or more fails when it stands. Display type
// (BUSY_MAX px and up) may lie over a picture, and type on a plate of its own (a tag, a card) is clear of it, as the user allows (压脸也可以); a ground of plain paper or a dark table carries none
export const BUSY_MIN = 20, BUSY_MAX = 90, BUSY_SHARE = 0.45;
export function busyErrors(small, shares, id) {
  return [...new Set(small.map((d, i) => (shares[i] != null && shares[i] >= BUSY_SHARE ? `${id}: "${d.text}" (${Math.round(d.size)} px) sits on the things the picture shows (${Math.round(shares[i] * 100)} % of its box): set it on a clear part of the ground or give it a plate of its own` : null)).filter(Boolean))];
}
export function busyShares(items) {
  const code = `import cv2,json,sys,numpy as np\nout=[]\nfor f,boxes in json.loads(sys.stdin.read()):\n  g=cv2.GaussianBlur(cv2.imread(f,0),(0,0),3).astype(float);H,W=g.shape;r=[]\n  for x0,y0,x1,y1 in boxes:\n    e=(y1-y0)*.2;x0,y0,x1,y1=int(max(0,x0-e)),int(max(0,y0-e)),int(min(W,x1+e)),int(min(H,y1+e));t=[]\n    for y in range(y0,max(y0+1,y1-15),16):\n      for x in range(x0,max(x0+1,x1-15),16):\n        c=g[y:y+16,x:x+16]\n        if c.size>=64: t.append(c.std()>12)\n    r.append(float(np.mean(t)) if t else None)\n  out.append(r)\nprint(json.dumps(out))`;
  const py = process.env.A1_PYTHON || path.join(HERE, '../../../../../work/external-source-tool-canaries-v1/.venv/bin/python');
  const r = spawnSync(fs.existsSync(py) ? py : 'python3', ['-c', code], { input: JSON.stringify(items), encoding: 'utf8', maxBuffer: 1 << 24 });
  try { return JSON.parse(r.stdout); } catch { return items.map(([, b]) => b.map(() => null)); }
}
// the words made clear and put back (their own grounds kept: a badge's panel stays, as framecheck's bare frame)
export const CLEAR_WORDS = () => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), els = new Set(); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim() && n.parentElement && !/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) els.add(n.parentElement);
  window.__geoClear = [...els].map((e) => [e, e.style.cssText]);
  for (const [e] of window.__geoClear) { const cs = getComputedStyle(e), clip = cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text';
    for (const [k, v] of [['color', 'transparent'], ['-webkit-text-fill-color', 'transparent'], ['text-shadow', 'none'], ['-webkit-text-stroke', '0'], ...(clip ? [['background', 'none']] : [])]) e.style.setProperty(k, v, 'important'); }
  for (const c of document.querySelectorAll('canvas')) if ((window.__drawn3d || []).some((x) => x.canvas === c)) { window.__geoClear.push([c, c.style.cssText]); c.style.setProperty('visibility', 'hidden', 'important'); } };
export const RESTORE_WORDS = () => { for (const [e, c] of window.__geoClear || []) e.style.cssText = c; window.__geoClear = null; };

// every GEO_STEP s over [from, to): seek(t) runs in the page, then it is read. Returns the shot's problems
// ({ kind, at, say, owner }) and the frames read (FC_DEBUG)
// twice: false on the module bench (its filler words are one sentence in every slot by design)
export async function cardGeometry(page, { from, to, id = 'shot', seek, fold = null, step = GEO_STEP, hold = GEO_HOLD, busy = true, twice = true }) {
  await preparePictures(page);
  const frames = [], said = [], bare = [], dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-geo-'));
  for (let t = from, k = 0; t < to - 1e-6; t += step, k++) {
    await page.evaluate(seek, t);
    const g = await page.evaluate(`window.__geoT = ${t}; ${PAGE_GEOMETRY}`);
    frames.push({ t: +t.toFixed(2), errs: frameGeometryErrors(g, id) });
    // every other step, the frame with its words made clear: what lies under the small type (busyErrors)
    const small = g.drawn.filter((d) => !d.look && !d.plate && d.size >= BUSY_MIN && d.size < BUSY_MAX && (d.alpha ?? 1) >= .6 && d.x0 >= 0 && d.y0 >= 0 && d.x1 <= 1920 && d.y1 <= 1080);
    if (busy && k % 2 === 0 && small.length) { const f = path.join(dir, `${k}.png`); await page.evaluate(CLEAR_WORDS); await page.screenshot({ path: f }); await page.evaluate(RESTORE_WORDS); bare.push({ t: +t.toFixed(2), f, small }); }
    const texts = [...new Set(g.drawn.filter((d) => !d.look && (d.alpha ?? 1) >= .6 && d.x1 > 0 && d.y1 > 0 && d.x0 < 1920 && d.y0 < 1080).map((d) => d.text))];
    const marked = g.marks.map((m) => (m.words != null ? m.words : m.src?.startsWith('file:') && fs.existsSync(fileURLToPath(m.src)) ? markedWords(pageLines(fileURLToPath(m.src)), m.frac) : '')).filter(Boolean);
    said.push({ t: +t.toFixed(2), texts, marked });
    if (process.env.FC_DEBUG) console.error(t.toFixed(2), JSON.stringify({ drawn: g.drawn.map((d) => [d.text, Math.round(d.size), Math.round(d.x0), Math.round(d.y0), Math.round(d.x1), Math.round(d.y1), +(d.alpha ?? 1).toFixed(2), d.own, d.plate ? 'plate' : '', d.flat ? 'flat' : '']), shapes: g.shapes.map((p) => [p.kind, Math.round(p.x0), Math.round(p.y0), Math.round(p.x1), Math.round(p.y1), +(p.alpha ?? 1).toFixed(2)]), marked, errs: frames.at(-1).errs }));
  }
  const busyFrames = bare.length ? busyShares(bare.map((b) => [b.f, b.small.map((d) => [d.x0, d.y0, d.x1, d.y1])])).map((sh, i) => ({ t: bare[i].t, errs: busyErrors(bare[i].small, sh, id) })) : [];
  fs.rmSync(dir, { recursive: true, force: true });
  const all = [...new Set(said.flatMap((s) => [...s.texts, ...s.marked]))], folded = fold ? fold(all) : all, F = new Map(all.map((s, i) => [s, folded[i]]));
  const f = (xs) => xs.map((x) => F.get(x) ?? x);
  const twiceR = !twice ? [] : holdFaults(said.map((s) => ({ t: s.t, errs: sayTwiceErrors(s.texts, s.marked, id, { fold: f }) })), { step, hold: Math.min(hold, step * 2) });
  return [...holdFaults(frames, { step, hold }).map((r) => ({ kind: /cut by the frame/.test(r.say) ? 'off-frame' : /too small to read/.test(r.say) ? 'unreadable' : 'overlap', at: r.at, say: `${r.say} (${r.at.toFixed(1)}-${r.to.toFixed(1)} s)`, owner: 'module' })),
    ...holdFaults(busyFrames, { step: step * 2, hold }).map((r) => ({ kind: 'overlap', at: r.at, say: `${r.say} (${r.at.toFixed(1)}-${r.to.toFixed(1)} s)`, owner: 'module' })),
    ...twiceR.map((r) => ({ kind: 'other', at: r.at, say: `${r.say} (${r.at.toFixed(1)}-${r.to.toFixed(1)} s)`, owner: 'plan' }))];
}

// (pure) the picture behind the words stands still where the reference moves (the user, of paperclip-138-full B25's
// title over a still DNA helix: 背后 DNA 螺旋明明可以动起来; B05, B46, B50 alike): the card with its words cleared changes
// from a tenth of the shot to nine tenths less than a quarter as much as the reference's strip does from its first frame
// to its last (framecheck's progress limits: the reference must change by progressRef or more). The words typing in do
// not count: it is the ground that must move (a turning model, footage, a push on the photo)
export function stillGroundProblem(t, dBare, refD, L = LIMITS) {
  return dBare != null && refD != null && refD >= L.progressRef && dBare < refD * L.progress ? { kind: 'unlike-reference', at: +t.toFixed(2), say: `the picture behind the words hardly changes across the shot (${(dBare * 100).toFixed(1)} % against the reference's ${(refD * 100).toFixed(1)} %): give the ground its own move (a turning model, footage, a push or pan on the photo)`, owner: 'plan' } : null;
}
// the reference beat's strip (reference.mjs referenceBeats: five frames over the seconds the original says the line):
// its first and last frames at frame size
export function stripEnds(strip, dir) {
  return [0, 4].map((i) => { const f = path.join(dir, `ref-${i}.png`); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', strip, '-vf', `crop=iw/5:ih:${i}*iw/5:0,scale=1920:1080`, f]); return fs.existsSync(f) ? f : null; });
}
export async function stillGround(cfg, page, { from, to, seek, strip }) {
  if (!strip || !fs.existsSync(strip)) return [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-still-')), ours = [];
  try {
    for (const k of [.1, .9]) { await page.evaluate(seek, from + (to - from) * k); await page.evaluate(CLEAR_WORDS); const f = path.join(dir, `bare-${k}.png`); await page.screenshot({ path: f }); await page.evaluate(RESTORE_WORDS); ours.push(f); }
    const refs = stripEnds(strip, dir); if (refs.some((f) => !f)) return [];
    const [d, rd] = changes(cfg, [ours, refs]); const p = stillGroundProblem(to, d, rd); return p ? [p] : [];
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// a recipe card's built page (motion.mjs buildMotion: index.html with a paused GSAP timeline and CSS animations, as
// HyperFrames renders it): measured over its whole length
export const MOTION_SEEK = (t) => { window.__timelines.main.seek(t, false); for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; } window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: t } })); };
// every mark on page words a card draws (marks.js registers them), measured as the module pages' are (modules.mjs
// markErrors, edgeInk) at the moment it is complete: on the glyphs, not into the neighbouring ones, the line's height,
// its edge through no other words, finished and in the frame (B04's hand-placed bar ran into 甘)
export async function cardMarks(cfg, page, { seek, end }) {
  const n = await page.evaluate(() => (window.__marks || []).length); if (!n) return [];
  const M = await import('./modules.mjs'), list = [];
  for (let i = 0; i < n; i++) {
    const t = await page.evaluate((k) => window.__marks[k].end || 0, i), at = Math.min(end - .02, t + .05);
    await page.evaluate(seek, at);
    list.push({ ...(await page.evaluate((k) => { const m = window.__marks[k], r = m.el.getBoundingClientRect(), on = getComputedStyle(m.el).visibility !== 'hidden' && r.width > 0;
      const img = m.el.closest('.hl-layer')?.parentElement?.querySelector('.media img');
      return { kind: m.kind, label: m.label, part: m.part, rect: m.rect, shown: m.shown, screen: on ? { x: r.x, y: r.y, w: r.width, h: r.height } : null, page: img ? img.currentSrc || img.src : null }; }, i)), end: at });
  }
  for (const m of list) if (m.page?.startsWith('file:')) m.edgeInk = M.edgeInk(cfg, fileURLToPath(m.page), [m.rect])[0];
  return list.flatMap((m) => M.markErrors([m]).map((say) => ({ kind: 'bad-mark', at: +m.end.toFixed(2), say, owner: 'module' })));
}
// strip: the reference beat's strip, when the project has one (the still-ground measure)
export async function motionGeometry(cfg, dir, duration, id, { fold = null, strip = null } = {}) {
  const { chromium } = await import(pathToFileURL(path.join(cfg.sourceRoot || cfg.repoRoot, 'node_modules', 'playwright', 'index.mjs')).href);
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.addInitScript(() => { window.__timelines = window.__timelines || {}; });
    await p.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await p.waitForFunction(() => !!(window.__timelines && window.__timelines.main), null, { timeout: 30000, polling: 100 });
    await p.evaluate(() => document.fonts.ready.then(() => true));
    return [...await cardGeometry(p, { from: 0, to: duration, id, seek: MOTION_SEEK, fold }), ...await cardMarks(cfg, p, { seek: MOTION_SEEK, end: duration }), ...await stillGround(cfg, p, { from: 0, to: duration, seek: MOTION_SEEK, strip })];
  } finally { await b.close(); }
}
