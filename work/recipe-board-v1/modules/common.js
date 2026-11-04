// Shared by the reference-look module pages (title, person, quote, steps, chart, insert): the reference's ground
// (grey paper with grain and a heavy vignette, or a dark stage), its type (heavy Song, condensed, a small English line),
// torn-paper labels from the art kit, colour fringes on display type, subtitles from the word timing, and the eases.
// Every page reads window.__spec, draws any time t with window.render(t) and sets window.__ready.
(function () {
  const S = window.__spec;
  const M = window.M = {
    S, $: (q) => document.querySelector(q),
    E: { out: (k) => 1 - Math.pow(1 - k, 3), inout: (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), back: (k) => { const c = 1.5; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); } },
    seg: (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a))),
    esc: (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    // a label: the words alone, heavy and white, lifted off the ground by a shadow, a thin rule in the accent under them —
    // no paper strip, torn or clean (user 2026-10-25: 之后也不要这种纸条撕纸设计什么的了; it was a torn grey strip, P12/P24);
    // quotes in the accent when asked; ink 'dark' on a light ground (the paper of steps)
    torn: (text, { size = 46, quotes = false, ink = 'light' } = {}) => `<div class="paper${ink === 'dark' ? ' ink-dark' : ''}" style="font-size:${size}px">${quotes ? `<span class="q">“</span>` : ''}<span class="t">${M.esc(text)}</span>${quotes ? `<span class="q">”</span>` : ''}</div>`,
    // characters that rise out of a blur one after another (the reference's title entrance)
    chars: (text) => [...String(text)].map((c) => `<span class="ch">${M.esc(c)}</span>`).join(''),
    // pop: each character lands hard, one a beat (the reference's 凭什么, open R20: a soft rise out of a blur read as
    // no beat at all), a short overshoot and settle
    reveal: (el, t, at, { step = .045, dur = .32, rise = 26, pop = false } = {}) => {
      // (a character's own treatment, its filter, clearness and shape, kept under the reveal's: set over it every frame,
      // the glitch, the metal's shadow, the depth and the overprint were wiped, recap S4: treat.js records them)
      el.querySelectorAll('.ch').forEach((c, i) => { const t0 = at + i * step, bf = c.dataset.tf || '', bo = +(c.dataset.to || 1), bt = c.dataset.tt || '';
        // (it drops in a few pixels rather than shrinking from large: a shrink read as the camera pulling out, who-S8)
        if (pop) { const k = M.seg(t, t0, t0 + .1); c.style.opacity = t >= t0 ? bo : 0; c.style.filter = bf || 'none'; c.style.transform = `${t >= t0 ? `translateY(${(-22 * (1 - M.E.out(k))).toFixed(1)}px) scale(${(1 + .06 * (1 - M.E.out(k))).toFixed(3)})` : ''} ${bt}`.trim() || 'none'; return; }
        const k = M.seg(t, t0, t0 + dur), e = M.E.out(k);
        c.style.opacity = e * bo; c.style.filter = `blur(${(1 - e) * 12}px) ${bf}`.trim(); c.style.transform = `translateY(${(1 - e) * rise}px) ${bt}`.trim(); });
    },
    fade: (el, t, at, dur = .3, dx = 0, dy = 0) => { const e = M.E.out(M.seg(t, at, at + dur)); el.style.opacity = e; el.style.transform = `translate(${(1 - e) * dx}px, ${(1 - e) * dy}px)`; return e; },
    // the plate under a word (a tag, a chip, a board): a generated paper prop of the label family (labels.mjs), its colour
    // multiplied by the paper and cut to the paper's edge (tinted once in Node: labels.mjs tintPlates); plate i takes member i
    // (neighbours differ). Null when the
    // line has none (the line then keeps its flat colour, and the frame check fails a word on it: flatPlateErrors)
    plate: (i, color) => { const P = S.labels || []; if (!P.length) return null; const p = P[((i % P.length) + P.length) % P.length], c = String(color || '').trim().toLowerCase(), h = /^#[0-9a-f]{3}$/.test(c) ? '#' + [...c.slice(1)].map((x) => x + x).join('') : c, u = p.tints && p.tints[h];
      if (u) (M.platesUsed = M.platesUsed || []).push(u);   // (waited for with the page's pictures: M.ready)
      return u ? `background:url('${u}') center/100% 100% no-repeat;` : null; },
    // a picture under the layout carrying a move of its own: zoom (above 1 a push from 1, under 1 a pull to 1) and travel
    // (x, y in frame widths, the camera's sense), scaled to keep the frame covered all the way (shotplan.mjs withRefMotion)
    groundMove: (g, e) => { const z = g.zoom || 1, s = z >= 1 ? Math.pow(z, e) : Math.pow(z, e - 1), cover = 1 + 2 * Math.max(Math.abs(g.x || 0), Math.abs(g.y || 0) * 16 / 9) + .02;
      return `translate(${(-(g.x || 0) * 1920 * e).toFixed(1)}px, ${(-(g.y || 0) * 1920 * e).toFixed(1)}px) scale(${(cover * s).toFixed(4)})`; },
    subs: (t) => { const sb = (S.subs || []).find((x) => t >= x.at && t < x.end); M.$('#sub').textContent = sb ? sb.text : ''; },
  };
  document.head.insertAdjacentHTML('beforeend', `<style>
    html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #0d0d0d; }
    .paperbg { position: absolute; inset: 0; background: var(--paper, #d9d9d6); }
    .paperbg .tex { position: absolute; inset: 0; background-size: cover; mix-blend-mode: multiply; opacity: .55; }
    .dark { position: absolute; inset: 0; background: radial-gradient(ellipse 80% 70% at 50% 45%, #232120 0%, #0d0c0b 75%); }
    :root[data-ground=dark] .paperbg .tex { mix-blend-mode: screen; opacity: .12; }
    #vig { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 75% 70% at 50% 50%, transparent 40%, rgba(0,0,0,.45)); z-index: 40; }
    .song { font-family: 'SourceHanSerif Heavy'; line-height: 1.05; white-space: nowrap; }
    .cond { display: inline-block; transform: scaleX(.86); transform-origin: 0 50%; }
    .en { font-family: 'Times New Roman', serif; font-style: italic; white-space: nowrap; }
    .fringe { text-shadow: -2px 0 rgba(255,40,40,.45), 2px 0 rgba(40,200,255,.45), 0 10px 30px rgba(0,0,0,.35); }
    .ch { display: inline-block; }
    .paper { position: absolute; padding: 8px 4px 10px; font-family: 'SourceHanSerif Heavy'; color: #f6f4ef; line-height: 1; white-space: nowrap; text-shadow: 0 2px 4px rgba(0,0,0,.8), 0 6px 22px rgba(0,0,0,.65); border-bottom: .07em solid ${S.theme?.accent || '#e0281f'}; }
    .paper.ink-dark { color: #1a1a1a; text-shadow: 0 1px 0 rgba(255,255,255,.35); }   /* (on the grey paper ground: white with no paper under it read at a contrast of 14, r1 S1/S11) */
   /* a soft halo under the words, blurred and edgeless (no plate, no paper): set bare on a shelf, a shirt or a photograph the
       label read as a subtitle once its strip was gone (open S5, recap S7/S8, ending S7 reviews) */
    .paper::before { content: ''; position: absolute; inset: -.45em -.7em; z-index: -1; background: radial-gradient(ellipse at center, rgba(0,0,0,.55) 0%, rgba(0,0,0,.3) 45%, transparent 72%); filter: blur(8px); pointer-events: none; }
    .paper.ink-dark::before { background: radial-gradient(ellipse at center, rgba(255,255,255,.7) 0%, rgba(255,255,255,.35) 45%, transparent 72%); }
    .paper .q { font-style: italic; font-size: 1.15em; vertical-align: -.08em; color: ${S.theme?.accent || '#e0281f'}; }
    .paper span.t { display: inline-block; transform: scaleX(.85); margin: 0 -.08em; }
    #sub { position: absolute; left: 0; right: 0; top: 930px; text-align: center; font-family: 'SourceHanSans Regular', 'PingFang SC'; font-size: 58px; color: #fff; text-shadow: 0 0 6px rgba(0,0,0,.55), 0 2px 3px rgba(0,0,0,.6); transform: scaleX(.86); z-index: 50; }
  </style>`);
  // a paper ground: the kit's paper texture over grey
  // what the director's camera shows of the page at every moment (spec.camera; camera.js), in page pixels: words kept
  // inside it stay in the frame however the camera pushes and travels (who-S11: a title by the side cut by a 1.28 push)
  // from: only the moments the words are on screen count (a title that comes in after the pull-out has begun is not
  // fitted to the 1.3 push before it: open-S14 came out small)
  // (viewCamera: the camera of the frame this page is laid under as its ground, for the layout only — the page itself
  // does not move by it: a steps chain filled the frame to its edge and the frame's push cut its first ring, r1-S9)
  M.view = (from = null) => { let L = 0, R = 1920, T = 0, B = 1080; const ms = S.viewCamera || S.camera || [], st = window.__cameraState;
    // (the framings the camera rests in while the words are up: the end of each move after they come, and where it
    // stands when they come if it is not moving then; mid-move a display line may pass the edge, as the reference's
    // does and the frame check allows: fitted to the middle of a 1.3 pull-out open-S14 came out small)
    const moving = (t) => ms.some((m) => t > m.at && t < m.end);
    const states = from != null && st && ms.length ? [...ms.filter((m) => m.end > from).map((m) => m.to), ...(moving(from) ? [] : [st(ms, from)]), st(ms, S.end)] : ms.flatMap((m) => [m.from, m.to]);
    for (const q of states) { const z = Math.max(1, q.zoom || 1), lim = (z - 1) / 2, x = Math.max(-lim, Math.min(lim, q.x || 0)), y = Math.max(-lim * 9 / 16, Math.min(lim * 9 / 16, q.y || 0));
    L = Math.max(L, 960 + x * 1920 - 960 / z); R = Math.min(R, 960 + x * 1920 + 960 / z); T = Math.max(T, 540 + y * 1920 - 540 / z); B = Math.min(B, 540 + y * 1920 + 540 / z); } return { L, R, T, B, w: R - L, h: B - T }; };
  M.paper = (parent) => { const d = document.createElement('div'); d.className = 'paperbg'; d.innerHTML = `<div class="tex" style="background-image:url('${S.paperTex || ''}')"></div>`; parent.prepend(d); return d; };
  // everything the page shows must be loaded before the first frame (fonts and pictures)
  // the display treatments and the house faces by name (treat.js, injected into every module page)
  M.TREATS = window.__TREATS; M.FACE = window.__FACE; M.treat = (t, kinds) => window.__treat(t, kinds);
  // where a face of a picture shown with background-size cover lands on the screen (faceN: [x, y, w, h] as shares of
  // the picture, from modules.mjs; size: the picture's [w, h]); null without one. The modules keep their words off it.
  // (the picture's own size on the element: cover, contain, or a width as a percentage or pixels (the quote zooms its
  // photo with '220% auto': read as cover, the face was placed far left and the words shrank away from nothing, meta-S8))
  M.faceOn = (el, faceN = S.faceN, size = S.photoSize) => { if (!el || !faceN || !size) return null; const r = el.getBoundingClientRect(), [iw, ih] = size, bs = getComputedStyle(el).backgroundSize.split(' ')[0], sx = r.width / (el.offsetWidth || r.width);
    const k = bs === 'contain' ? Math.min(r.width / iw, r.height / ih) : /%$/.test(bs) ? r.width * parseFloat(bs) / 100 / iw : /px$/.test(bs) ? parseFloat(bs) * sx / iw : Math.max(r.width / iw, r.height / ih), dw = iw * k, dh = ih * k;
    const [px, py] = getComputedStyle(el).backgroundPosition.split(' ').map((v) => (/%$/.test(v) ? parseFloat(v) / 100 : .5)), ox = r.left + (r.width - dw) * px, oy = r.top + (r.height - dh) * (py ?? .5);
    return { x: ox + faceN[0] * dw, y: oy + faceN[1] * dh, w: faceN[2] * dw, h: faceN[3] * dh }; };
  // (a DOMRect or a box of x, y, w, h; a rect's own width and height when it has no w, h)
  M.box = (r) => (r ? { x: r.x ?? r.left, y: r.y ?? r.top, w: r.w ?? r.width, h: r.h ?? r.height } : null);
  M.hits = (a, b, pad = 30) => { a = M.box(a); b = M.box(b); return !!a && !!b && a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; };
  // an element's extent with what it holds (a holder of absolutely placed children has no size of its own)
  // parts never over each other (r1-S8: 對's plate on 144; open-S6: one company's line under the next's): each part,
  // in order, that crosses an earlier one moves past it, right when they share a row (more than half the smaller's
  // height), else down; a few passes. box(el) gives a part's ink and plate on the frame; parts are moved by left/top px
  M.apart = (els, box = (e) => e.getBoundingClientRect(), gapK = .15) => {
    const move = (d, dx, dy) => { d.style.left = `${parseFloat(d.style.left || 0) + dx}px`; d.style.top = `${parseFloat(d.style.top || 0) + dy}px`; };
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < els.length; i++) for (let j = 0; j < i; j++) {
      const a = box(els[j]), b = box(els[i]), ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top), h = Math.min(a.height, b.height);
      if (ix > 2 && iy > 2) { const gap = gapK * h; if (iy > .5 * h && b.left >= a.left) move(els[i], a.right + gap - b.left, 0); else move(els[i], 0, a.bottom + gap - b.top); } } };
  M.extent = (el) => { const rs = [el, ...el.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0); if (!rs.length) return null; const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top)); return { x, y, w: Math.max(...rs.map((r) => r.right)) - x, h: Math.max(...rs.map((r) => r.bottom)) - y }; };
  // layout that measures set type (M.settle): run once the faces the page draws in are really loaded. fonts.ready
  // resolves before a face is asked for, so the words were measured in a narrower stand-in face and a quote in 廻想体
  // ran across the face it had been fitted to miss (the module bench); the page is drawn once, the faces it asked for
  // awaited, then the settling runs and the page is drawn again
  const settle = []; M.settle = (fn) => settle.push(fn);
  M.ready = (imgs = []) => Promise.all([document.fonts.ready, ...[...imgs, ...(M.platesUsed || [])].filter(Boolean).map((src) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = ok; i.src = src; }))])
    .then(() => { window.render(S.at); return document.fonts.ready; }).then(() => { for (const f of settle) { try { f(); } catch (e) { console.error(e); } } window.__ready = true; window.render(S.at); });
})();
