// Marks on the words of a real page (the article's bars, the screen's bars and boxes, the curled page's red box): one
// way to draw them for every module, the way the reference does (P21, P25). The boxes come from modules.mjs
// locatePhrases: found by OCR and fitted to the page's ink (tightBox), one part per line when a phrase wraps.
//   black   the page under it inverted (white paper to black, black type to white): the words stay the page's own,
//           never a cut-out pasted back (a cut-out cropped glyphs and covered its neighbours: hupo-auto2 h800-S2)
//   yellow  colour behind the words, the type printed over it (multiply)
//   marker  a stroke under the lower half of the words
//   box     a red frame round the words (all their lines)
// The ends stop short of the neighbouring glyphs (at most half the gap to them, part.room); the height is the line's
// type height plus a fifth above and below; square ends. A wrapped phrase is swept line after line at one speed.
// Every mark is registered in window.__marks (page pixels, its element, when it is drawn) and measured by the line
// after rendering (modules.mjs markErrors): cut or covered glyphs, wrong height, unfinished, out of the frame. A module
// that marks page words uses this file; no module draws its own.
(function () {
  const reg = window.__marks = window.__marks || [];
  const rectOf = (kind, q) => {
    const h = q.h, [ra, rb] = q.room || [h, h], [ua, ub] = q.roomY || [h, h], pl = Math.min(h * .16, ra * .5), pr = Math.min(h * .16, rb * .5);
    const pu = Math.min(h * .2, ua * .5), pd = Math.min(h * .2, ub * .5);
    if (kind === 'marker') return { x: q.x - pl, y: q.y + h * .55, w: q.w + pl + pr, h: h * .45 + pd };
    return { x: q.x - pl, y: q.y - pu, w: q.w + pl + pr, h: h + pu + pd };
  };
  const css = (kind, color) => (kind === 'black' ? 'background:#fff;mix-blend-mode:difference'
    : kind === 'marker' ? `background:${color};opacity:.85;mix-blend-mode:multiply` : `background:${color};mix-blend-mode:multiply`);
  // parent: an element whose coordinates are the page's scaled by s and moved by (ox, oy); label: the phrase;
  // at / end: when the sweep starts and is complete (the line checks the mark is whole and in the frame at end)
  function sweep(parent, box, { kind = 'black', color = '#f2d43a', s = 1, ox = 0, oy = 0, label = '', at = 0, end = 0 } = {}) {
    const parts = (box.parts || [box]).map((q) => {
      const r = rectOf(kind, q), d = document.createElement('div');
      d.style.cssText = `position:absolute;left:${ox + r.x * s}px;top:${oy + r.y * s}px;width:${r.w * s}px;height:${r.h * s}px;${css(kind, color)};visibility:hidden`;
      parent.appendChild(d);
      const m = { kind, label, part: q, rect: r, el: d, shown: 0, at, end }; reg.push(m);
      return { d, w: r.w, m };
    });
    const tot = parts.reduce((a, p) => a + p.w, 0);
    return { parts, draw(k) { let done = k * tot;
      for (const p of parts) { const f = Math.min(1, Math.max(0, done / p.w)); done -= p.w; p.m.shown = f;
        p.d.style.clipPath = `inset(0 ${(1 - f) * 100}% 0 0)`; p.d.style.visibility = f > 0 ? 'visible' : 'hidden'; } } };
  }
  // red boxes round the words: words on one row share a box; words on different rows get a box each (one box round
  // a label centred on a two-line cell and the first line beside it ran through the second line: h800-S3). Each box
  // stands a third of the line height clear of its words, never more than half the gap to the lines above and below
  // or the words beside (its edge would run through them). Returns { els, draw(k) } (k: 0-1, boxes drawn in turn).
  function frame(parent, box, { s = 1, ox = 0, oy = 0, label = '', at = 0, end = 0, el = null, color = '#e0281f' } = {}) {
    const rows = [];
    for (const q of [...(box.parts || [box])].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const row = rows.find((g) => g.some((o) => Math.min(o.y + o.h, q.y + q.h) - Math.max(o.y, q.y) > Math.min(o.h, q.h) * .5));
      if (row) row.push(q); else rows.push([q]);
    }
    const els = rows.map((ps, i) => {
      const x0 = Math.min(...ps.map((q) => q.x)), y0 = Math.min(...ps.map((q) => q.y)), h = Math.max(...ps.map((q) => q.h));
      const u = { x: x0, y: y0, w: Math.max(...ps.map((q) => q.x + q.w)) - x0, h: Math.max(...ps.map((q) => q.y + q.h)) - y0 };
      const pu = Math.min(h * .35, ...ps.map((q) => (q.roomY?.[0] ?? h) * .5)), pd = Math.min(h * .35, ...ps.map((q) => (q.roomY?.[1] ?? h) * .5));
      const left = ps.filter((q) => q.x - x0 < h * .5), right = ps.filter((q) => u.x + u.w - (q.x + q.w) < h * .5);
      const pl = Math.min(h * .35, ...left.map((q) => (q.room?.[0] ?? h) * .5)), pr = Math.min(h * .35, ...right.map((q) => (q.room?.[1] ?? h) * .5));
      const r = { x: u.x - pl, y: u.y - pu, w: u.w + pl + pr, h: u.h + pu + pd };
      const d = i === 0 && el ? el : document.createElement('div');
      if (d !== el) (el ? el.parentElement : parent).appendChild(d);
      d.style.cssText = `position:absolute;left:${ox + r.x * s}px;top:${oy + r.y * s}px;width:${r.w * s}px;height:${r.h * s}px;border:${Math.max(6, h * s * .16)}px solid ${color};border-radius:${h * s * .15}px;box-shadow:0 0 0 3px rgba(255,255,255,.8);box-sizing:border-box`;
      reg.push({ kind: 'box', label, part: { ...u, h }, rect: r, el: d, shown: 1, at, end });
      return d;
    });
    return { els, draw(k) { els.forEach((d, i) => { const f = Math.min(1, Math.max(0, k * els.length - i)); d.style.clipPath = `inset(0 ${(1 - f) * 100}% 0 0)`; }); } };
  }
  window.TextMarks = { sweep, frame };
})();
