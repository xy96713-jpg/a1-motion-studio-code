// The camera and texture every module shares (breakdown.mjs; user, 2026-10-21: 拆的不够细，很多没对标上动效、设计).
// The reference pushes in on a presenter, pulls out from a page, drifts across a photo, and lays grain and a vignette
// over its packaging; our modules each had their own fixed motion and the director could not ask for the reference's.
// Injected into every module page by modules.mjs (renderModule) before the page's own script: the page's render(t)
// draws its content, then this layer moves the whole content as a camera and lays the texture over it.
//   spec.camera:  [{ at, end, from: { zoom, x, y }, to: { zoom, x, y }, ease: 'out' | 'in' | 'inout' (the default) | 'linear' }]
//                 x, y: where the camera looks, in frame widths from the centre (x > 0 looks right: the picture moves
//                 left); before the first move the first `from`, between and after moves the last `to`
//   spec.texture: { grain: 0-1, vignette: 0-1, fringe: 0-1, contrast: 0-1, saturate: -1-1, exposure: -1-1 }   film grain (new each
//                 frame) and corner darkening over everything; the reference's grade on the picture itself: red and
//                 blue fringes on every edge (its footage and photos all carry them: open R07-R12), more contrast and
//                 colour
// The content is kept covering the frame: a look aside needs a zoom (|x| <= (zoom - 1) / 2). A layer that sits on the
// screen, not in the scene, is marked data-fixed (taken out, over everything) or data-screen (kept in its place among
// the layers, held still against the camera: the side card's curled page, under the card and over the presenter;
// the push carried it and its mark out of the frame: h800-S3).
//   spec.layers:  [{ src, depth, x, y, w, at, end, in: 'fade' | 'rise' | 'drop' | 'slide', float, rot, opacity, blur, under }]
//                 painted layers (image generation, text-free, on transparency: modules.mjs resolves { art }) laid
//                 over the module's content (depth > 0, the nearer the larger its parallax) or under it (depth < 0, on a
//                 page whose ground is the paper); x, y the layer's centre in frame widths from the frame's centre, w its
//                 width in frame widths; it comes in at `at` and leaves at `end`, floats by `float` px (user, 2026-10-22:
//                 巧用生图能力来包装，甚至分层包装)
//   spec.lens:    { x, y, r, blur } | false   depth of field on the picture (the element a module marks data-lens: the
//                 photograph, the clip): sharp round its subject (x, y in frame shares; by default where the module says
//                 its subject is, window.__lensFocus, else a little above the middle), soft toward the edges (blur px at
//                 the edge, by default 9 or the module's window.__lensBlur; r the sharp ellipse's half-width in frame
//                 widths, .42); the type laid after it stays sharp. modules.mjs sets it from the reference's own depth
//                 at the shot's moments (refLens: none where the reference is sharp edge to edge). On by
//                 default: the reference's photographs and pages carry a focus falloff on every one, ours were sharp edge to
//                 edge and read as pictures pasted on a slide (measured on hupo-auto2: textured-but-soft cells 0.08 against
//                 the reference's 0.13; user 2026-10-25: 像PPT)
//   spec.header:  { text, ink: 'dark' | 'light' }   a section's tag kept at the top over the shots of a span (shotplan
//                 passageCarry: where the reference keeps one), set the same way in every shot so it reads as one
//   spec.carry:   { text, treat, dur }   the shot before's display line laid over this one's opening, fading and growing
//                 a little as it goes (the reference's year over the stock board, open R02): the cut keeps the words
(function () {
  let inner = null, cam = null, tex = null, screens = [], layers = [], lenses = [], carryEl = null;
  // the subject in front (spec.front, user 2026-10-23: 分层出来放在人像后面): the page's picture's subject, cut out by
  // modules.mjs from the very picture the page shows (macOS Vision, cutout.swift, same size as the picture), laid over
  // the words in the picture's place every frame, so display words stand behind the person (ending S11's name crossing
  // behind a head, the reference's titles behind its people). The checks hold it: small type may not go under it, display
  // type at most half (framecheck frontMax); it is not a picture the words sit on (cardgeometry skips data-front)
  let front = null, frontOf = null;
  const urlOf = (el) => { if (el.tagName === 'IMG') return el.currentSrc || el.src; const m = getComputedStyle(el).backgroundImage.match(/^url\("?(.*?)"?\)$/); return m ? m[1] : null; };
  // the page's picture: the largest element showing one, a third of the frame or more
  window.__frontPhoto = () => { let best = null, A = 0;
    for (const el of document.querySelectorAll('body *')) { if (el.id === '__front' || el.closest('[data-fixed]')) continue; const u = urlOf(el); if (!u || /^data:/.test(u)) continue;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < .3) continue; const r = el.getBoundingClientRect(), a = r.width * r.height; if (a > A) { A = a; best = el; } }
    if (!best || A < 1920 * 1080 * .33) return null; frontOf = best; return urlOf(best); };
  window.__setFront = (src) => new Promise((res) => { front = document.createElement('div'); front.id = '__front'; front.dataset.front = '';
    front.style.cssText = `position:absolute;left:0;top:0;background-image:url("${src}");background-repeat:no-repeat;z-index:39`;   // (no pointer-events:none: the checks find it by elementsFromPoint, which skips such layers, and 地方 went behind a head unmeasured, talent S5)
    (cam || document.body).appendChild(front); const i = new Image(); i.onerror = () => res();
    i.onload = async () => { try { const W = 480, H = Math.max(1, Math.round(480 * i.naturalHeight / i.naturalWidth)), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(i, 0, 0, W, H); front.__a = { W, H, iw: i.naturalWidth, ih: i.naturalHeight, d: g.getImageData(0, 0, W, H).data }; } catch (e) {}
      // the module lays its words clear of the subject's head where it can (window.__frontFit), then the page is drawn
      try { if (window.__frontFit) await window.__frontFit(); } catch (e) {} res(); }; i.src = src; });
  // the most hidden character of an element's words behind the subject in front, at the current frame (an em a cell)
  window.__frontHidden = (el) => { if (!front || !front.__a) return 0; let worst = 0; const r = document.createRange(); r.selectNodeContents(el);
    for (const q of r.getClientRects()) { if (q.width < 2) continue; const fs = q.height / 1.2, nc = Math.max(1, Math.round(q.width / fs));
      for (let c = 0; c < nc; c++) { let n = 0, on = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) { const px = q.left + q.width * (c * 3 + i + .5) / (nc * 3), py = q.top + q.height / 2 - .38 * fs + j * .19 * fs; n++; if (window.__frontAlpha(px, py) > .5) on++; }
        worst = Math.max(worst, on / n); } }
    return worst; };
  // the cut-out's clearness at a point of the frame (0 clear, 1 opaque): what the checks read
  window.__frontAlpha = (px, py) => { const a = front && front.__a; if (!a) return 1; const r = front.getBoundingClientRect(), cs = getComputedStyle(front), W = r.width, H = r.height; if (!W || !H) return 0;
    const sz = cs.backgroundSize.split(' '); let dw, dh;
    if (sz[0] === 'cover' || sz[0] === 'contain') { const k = (sz[0] === 'cover' ? Math.max : Math.min)(W / a.iw, H / a.ih); dw = a.iw * k; dh = a.ih * k; }
    else { const k = W / (front.offsetWidth || W), v = (x, L) => x == null || x === 'auto' ? null : /%$/.test(x) ? parseFloat(x) / 100 * L : parseFloat(x) * k; dw = v(sz[0], W); dh = v(sz[1], H); if (dw == null && dh == null) { dw = a.iw * k; dh = a.ih * k; } else if (dw == null) dw = dh * a.iw / a.ih; else if (dh == null) dh = dw * a.ih / a.iw; }
    const ps = cs.backgroundPosition.split(' '), at = (x, L, D) => /%$/.test(x) ? parseFloat(x) / 100 * (L - D) : parseFloat(x) * (W / (front.offsetWidth || W)) || 0;
    const u = (px - r.left - at(ps[0] || '50%', W, dw)) / dw, v = (py - r.top - at(ps[1] || '50%', H, dh)) / dh; if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
    return a.d[(Math.floor(v * a.H) * a.W + Math.floor(u * a.W)) * 4 + 3] / 255; };
  // in the picture's place: its box on screen taken back through the camera, its size and position, its filter and
  // clearness with its ancestors'
  const syncFront = (spec, t) => { if (!front || !frontOf) return; const r = frontOf.getBoundingClientRect(); let z = 1, x = 0, y = 0;
    if (cam && (spec.camera || []).length) { const s = state(spec.camera, t); z = Math.max(1, s.zoom); const lim = (z - 1) / 2; x = Math.max(-lim, Math.min(lim, s.x)); y = Math.max(-lim * 9 / 16, Math.min(lim * 9 / 16, s.y)); }
    const lx = (r.left - 960 + x * 1920) / z + 960, ly = (r.top - 540 + y * 1920) / z + 540, w = r.width / z, h = r.height / z, k = w / (frontOf.offsetWidth || w), cs = getComputedStyle(frontOf);
    const px = (v) => v.split(' ').map((q) => /px$/.test(q) ? `${(parseFloat(q) * k).toFixed(2)}px` : q).join(' ');
    let f = [], o = 1; for (let a = frontOf; a && a !== cam && a !== document.body; a = a.parentElement) { const c = getComputedStyle(a); if (c.filter !== 'none') f.push(c.filter); o *= +c.opacity; if (c.display === 'none' || c.visibility === 'hidden') o = 0; }
    Object.assign(front.style, { left: `${lx.toFixed(1)}px`, top: `${ly.toFixed(1)}px`, width: `${w.toFixed(1)}px`, height: `${h.toFixed(1)}px`, backgroundSize: px(cs.backgroundSize === 'auto' && frontOf.tagName === 'IMG' ? '100% 100%' : cs.backgroundSize), backgroundPosition: px(cs.backgroundPosition), filter: f.join(' ') || 'none', opacity: String(o) }); };
  const E = { out: (k) => 1 - Math.pow(1 - k, 3), in: (k) => k * k * k, inout: (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), linear: (k) => k };
  const state = (moves, t) => {
    const at = (m, k) => ({ zoom: m.from.zoom + (m.to.zoom - m.from.zoom) * k, x: (m.from.x || 0) + ((m.to.x || 0) - (m.from.x || 0)) * k, y: (m.from.y || 0) + ((m.to.y || 0) - (m.from.y || 0)) * k });
    let s = at(moves[0], 0);
    for (const m of moves) { if (t < m.at) break; const k = Math.min(1, Math.max(0, (t - m.at) / Math.max(.01, m.end - m.at))); s = at(m, (E[m.ease] || E.inout)(k)); }   // (unasked, a move starts from rest: a cubic ease-out set off at full speed and read as a lunge, paperclip B48)
    return s;
  };
  window.__cameraState = state;
  function build(spec) {
    const fixed = (n) => n.id === 'sub' || n.id === 'vig' || n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE' || n.dataset?.fixed != null;
    const tx0 = spec.texture || {}, grade = tx0.fringe || tx0.contrast || tx0.saturate || tx0.exposure;
    const L = spec.layers || [];
    if ((spec.camera || []).length || grade || L.some((l) => (l.depth ?? 1) < 0)) {
      // one wrapper round the page's layers (one per layer broke the modules' blend modes: the article's paper and
      // grid, the title's wash went flat, open-S3, S19); a layer that belongs to the screen (data-screen: the side
      // card's curled page) stays in its place among the layers, between the presenter and the card, and is held
      // still by the inverse of the camera every frame (moved out it covered the card: h800-S3)
      cam = document.createElement('div'); cam.id = '__cam';
      cam.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:50% 50%;will-change:transform';
      for (const n of [...document.body.childNodes]) if (n.nodeType === 1 && !fixed(n)) cam.appendChild(n);
      document.body.prepend(cam);
      screens = [...cam.querySelectorAll(':scope > [data-screen]')];
      for (const n of screens) n.style.transformOrigin = '50% 50%';
      if (grade) { const f = tx0.fringe || 0; cam.style.filter = [f ? `drop-shadow(${(4 * f).toFixed(1)}px 0 0 rgba(255,0,60,${(.35 * f).toFixed(2)})) drop-shadow(${(-4 * f).toFixed(1)}px 0 0 rgba(0,180,255,${(.35 * f).toFixed(2)}))` : '', tx0.contrast ? `contrast(${(1 + .25 * tx0.contrast).toFixed(2)})` : '', tx0.saturate ? `saturate(${(1 + .4 * tx0.saturate).toFixed(2)})` : '', tx0.exposure ? `brightness(${(1 + .5 * tx0.exposure).toFixed(2)})` : ''].filter(Boolean).join(' '); }
    }
    // the painted layers: under the content inside the camera's wrapper (depth < 0), over it outside (depth >= 0), each
    // moved by the camera with its own parallax every frame
    for (const l of L) { if (!l.src) continue; const im = document.createElement('img'); im.src = l.src; im.dataset.art = ''; im.alt = '';
      im.style.cssText = `position:absolute;left:0;top:0;width:${((l.w ?? .3) * 1920).toFixed(0)}px;height:auto;pointer-events:none;transform-origin:50% 50%;will-change:transform,opacity;${l.blur ? `filter:blur(${l.blur}px);` : ''}z-index:${(l.depth ?? 1) < 0 ? 0 : 40}`;
      // (under: a selector of the page's words; the layer goes right before them, over the picture and under the words: a
      // painted stage haze over the quote's words greyed them, meta-S8)
      const below = l.under && cam ? cam.querySelector(l.under) : null;
      if (below) { im.style.zIndex = 'auto'; below.parentNode.insertBefore(im, below); }
      else if ((l.depth ?? 1) < 0 && cam) cam.prepend(im); else { im.dataset.fixed = ''; document.body.appendChild(im); }
      layers.push({ l, im }); }
    // the lens: a soft layer right after the picture, blurring what lies behind it outside the focus (backdrop-filter),
    // under every word that comes after it in the page
    if (spec.lens !== false) for (const el of document.querySelectorAll('[data-lens]')) { if (getComputedStyle(el).display === 'none') continue;
      const o = document.createElement('div'); o.className = '__lens';
      const b = Math.max(0, +(spec.lens?.blur ?? window.__lensBlur ?? 9));   // (window.__lensBlur: a module's own default, lighter for thin line work)
      o.style.cssText = `position:absolute;inset:0;pointer-events:none;backdrop-filter:blur(${b}px) brightness(.9);-webkit-backdrop-filter:blur(${b}px) brightness(.9)`;   // (a little darker as it softens, as a lens's out-of-focus is: blurred alone it read as grey fog, opensrc S6 review)
      el.after(o); lenses.push(o); }
    if (spec.header?.text) { const h = document.createElement('div'); h.dataset.fixed = ''; h.id = '__hdr'; const dark = spec.header.ink !== 'light';
      h.style.cssText = 'position:absolute;left:0;right:0;top:44px;text-align:center;z-index:44;pointer-events:none';
      h.innerHTML = `<span style="display:inline-block;font-family:'SourceHanSerif Heavy';font-size:46px;line-height:1;padding:0 6px 8px;color:${dark ? '#1a1a1a' : '#f4f1ea'};border-bottom:4px solid ${spec.theme?.accent || '#e0281f'};text-shadow:${dark ? '0 1px 0 rgba(255,255,255,.35)' : '0 2px 10px rgba(0,0,0,.75)'}"></span>`;
      h.firstChild.textContent = spec.header.text; document.body.appendChild(h); }
    if (spec.carry?.text) { const c = document.createElement('div'); c.dataset.fixed = ''; c.dataset.carry = ''; c.id = '__carry';
      c.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:145px;display:flex;align-items:center;justify-content:center;z-index:43;pointer-events:none';
      c.innerHTML = `<span style="font-family:'SourceHanSerif Heavy';font-size:280px;line-height:1;color:#f4f1ea;white-space:nowrap;text-shadow:0 14px 40px rgba(0,0,0,.6)"></span>`;
      c.firstChild.textContent = spec.carry.text; document.body.appendChild(c); if (spec.carry.treat && window.M?.treat) window.M.treat(c.firstChild, spec.carry.treat); carryEl = c; }
    const tx = spec.texture || {};
    if (tx.grain || tx.vignette) {
      tex = document.createElement('div'); tex.dataset.fixed = ''; tex.dataset.deco = '';
      tex.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:45';
      tex.innerHTML = `${tx.vignette ? `<div style="position:absolute;inset:0;background:radial-gradient(ellipse 72% 68% at 50% 48%, transparent 38%, rgba(0,0,0,${(.75 * tx.vignette).toFixed(2)}))"></div>` : ''}${tx.grain ? `<svg width="1920" height="1080" style="position:absolute;inset:0;opacity:${(.5 * tx.grain).toFixed(2)};mix-blend-mode:overlay"><filter id="__g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="1"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 1.6 -.3"/></filter><rect width="1920" height="1080" filter="url(#__g)"/></svg>` : ''}`;
      document.body.appendChild(tex);
    }
  }
  Object.defineProperty(window, 'render', {
    configurable: true,
    get() { return inner && ((t) => {
      const spec = window.__spec || {};
      if (!window.__camBuilt) { window.__camBuilt = true; build(spec); }
      const r = inner(t);
      if (cam && (spec.camera || []).length) { const s = state(spec.camera, t), z = Math.max(1, s.zoom), lim = (z - 1) / 2, x = Math.max(-lim, Math.min(lim, s.x)), y = Math.max(-lim * 9 / 16, Math.min(lim * 9 / 16, s.y));
        cam.style.transform = `translate(${(-x * 1920).toFixed(1)}px, ${(-y * 1920).toFixed(1)}px) scale(${z.toFixed(4)})`;
        for (const n of screens) n.style.transform = `scale(${(1 / z).toFixed(5)}) translate(${(x * 1920).toFixed(1)}px, ${(y * 1920).toFixed(1)}px)`; }
      if (layers.length) { const s = (spec.camera || []).length ? state(spec.camera, t) : { zoom: 1, x: 0, y: 0 };
        for (const { l, im } of layers) { const at = l.at ?? spec.at ?? 0, k = Math.min(1, Math.max(0, (t - at) / .5)), out = l.end != null ? Math.min(1, Math.max(0, (t - l.end) / .35)) : 0, e = E.out(k);
          // (a layer over the content is outside the camera's wrapper: it takes the camera's move times 1 + depth, so the
          // nearer it is the more it moves; one under the content is inside the wrapper and moves with the page)
          const d = l.depth ?? 1, back = d < 0, f = 1 + Math.max(0, d), z = back ? 1 : 1 + (Math.max(1, s.zoom) - 1) * f, w = im.offsetWidth || (l.w ?? .3) * 1920, h = im.offsetHeight || w;
          const cx = 960 + (l.x ?? 0) * 1920 * z - (back ? 0 : s.x * 1920 * f), cy = 540 + (l.y ?? 0) * 1920 * z - (back ? 0 : s.y * 1920 * f);
          const enter = l.in === 'rise' ? [0, (1 - e) * 120] : l.in === 'drop' ? [0, -(1 - e) * 260] : l.in === 'slide' ? [(1 - e) * ((l.x ?? 0) < 0 ? -300 : 300), 0] : [0, 0];
          const fl = l.float ? Math.sin((t - at) * 1.3 + (l.x ?? 0) * 7) * l.float : 0;
          im.style.opacity = String((l.opacity ?? 1) * (l.in === 'none' ? (t >= at ? 1 : 0) : e) * (1 - out));
          im.style.transform = `translate(${(cx - w / 2 + enter[0]).toFixed(1)}px, ${(cy - h / 2 + enter[1] + fl).toFixed(1)}px) scale(${z.toFixed(4)}) rotate(${((l.rot ?? 0) + (l.float ? Math.sin((t - at) * .9) * .8 : 0)).toFixed(2)}deg)`; } }
      if (lenses.length) { const L0 = spec.lens || {}, f = L0.x != null ? { x: L0.x * 1920, y: (L0.y ?? .42) * 1080 } : (window.__lensFocus && window.__lensFocus(t)) || { x: 960, y: 455 };
        const rx = (L0.r ?? .42) * 1920, ry = rx * .7, m = `radial-gradient(ellipse ${rx.toFixed(0)}px ${ry.toFixed(0)}px at ${f.x.toFixed(0)}px ${f.y.toFixed(0)}px, transparent 0%, transparent 62%, rgba(0,0,0,.75) 92%, #000 100%)`;   // (the sharp zone ~500 px across the subject: at 0.3 and 55 % it blurred a face a little off the middle, who S10, meta S7)
        for (const o of lenses) { o.style.maskImage = m; o.style.webkitMaskImage = m; } }
      if (carryEl) { const k = Math.min(1, Math.max(0, (t - (spec.at ?? 0)) / (spec.carry.dur || .8))); carryEl.style.opacity = String(1 - k * k); carryEl.style.transform = `scale(${(1 + .08 * k).toFixed(4)})`; }
      // the grain changes 20 times a second, as film's does at 24 (new on each of 60 frames it could not be compressed:
      // the opening came out at 98 Mbit/s, 591 MB for 50 s)
      if (tex) { const t0 = tex.querySelector('feTurbulence'); if (t0) t0.setAttribute('seed', String(Math.floor(t * 20) % 997)); }
      if (window.__letter) window.__letter();
      if (window.__afterCam) window.__afterCam(t);   // (a page's own pass once the camera has placed it: market hides a price label the push has carried into the subtitle band)
      syncFront(spec, t);
      return r;
    }); },
    set(f) { inner = f; },
  });
})();
