// The display treatments every module page shares (injected by modules.mjs before the page's own script, as camera.js
// is): a module that does not load common.js (article, sidecard, compare, brand) treats its display line the same way.
  // a display line's treatment (the reference's display type is never plain: open R01 old metal, R14 blue lettering with
  // depth and a drop shadow, the ending's lines glowing; ours were all one clean face and every frame read alike, user
  // 2026-10-25: 很多细节都不好). Sized in em, so it scales with the line:
  //   metal    a cream-to-grey vertical gradient on the strokes, a dark band at the middle, a soft drop shadow
  //   extrude  a solid depth of the line's own colour darkened, stepped down and right, and a shadow under it
  //   glow     a soft bloom and a red and blue fringe at the edges
  // t: the element that holds the glyphs (the whole line, or each character of a line that moves by character)
  //   emboss     pressed into its card: the colour of what is under it, darkened, a light lip below and a shade above
  //   halftone   printed in coarse dots, the ground showing between them (worn print, the reference's 「网点做旧」)
  //   glitch     cut into horizontal slices shifted a little sideways, red and cyan at the cuts (the reference's sliced
  //              titles; at a shift of 34 the strokes broke into holes, recap S1)
  //   overprint  laid over what is under it like ink, a little clear (the reference's 「半透明叠印」)
  //   slant      leaning right (sheared: the house faces have no italic)
  // A line may take several (treat: ['metal', 'slant']).
  //   condense   drawn narrow, about half its width (the reference's 「极瘦高」 year, 「字宽约正常的一半」; the house faces' figures are wide)
window.__TREATS = ['metal', 'extrude', 'glow', 'emboss', 'halftone', 'glitch', 'overprint', 'slant', 'condense'];
window.__FACE = { 'スミカク': 'House Sumikaku', '金畫字': 'House Kinkaku', '黒華明朝': 'House Kokka', '装甲明朝': 'House Soukou', '廻想体 ネクスト': 'House Kaiso', 'f.k 機械彫刻': 'House Kikai' };
window.__treat = (t, kinds) => { if (!t || !kinds) return; for (const kind of [].concat(kinds)) {
    /* a fill clipped to the strokes (metal, halftone) is painted per character on a line revealed a character at a time:
       on the line itself it painted nothing, each character being a layer of its own (talent S8's name stood clear, 0 of
       255 over its ground) */
    if ((kind === 'metal' || kind === 'halftone') && t.querySelector('.ch')) { for (const c of t.querySelectorAll('.ch')) window.__treat(c, [kind]); continue; }
    if (kind === 'metal') Object.assign(t.style, { backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #d3d9e1 38%, #5f6873 52%, #e9eef4 100%)', webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', webkitTextFillColor: 'transparent', textShadow: 'none', filter: 'drop-shadow(0 .05em .08em rgba(0,0,0,.55))' });
    // (as stacked drop shadows, not text shadows: a line filled by a gradient clipped to its strokes showed a text shadow
    // through its clear fill as black outlines, open S14)
    if (kind === 'extrude') { const cs = getComputedStyle(t), m = cs.color.match(/[\d.]+/g) || [], clear = m.length > 3 && +m[3] === 0 || cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)';
      const d = clear || m.length < 3 ? '18,24,70' : m.slice(0, 3).map((v) => Math.round(+v * .45)).join(','), fs = parseFloat(cs.fontSize) || 100, st = Math.max(1, fs * .007);
      t.style.filter = `${[...Array(7)].map(() => `drop-shadow(${(st * .7).toFixed(1)}px ${st.toFixed(1)}px 0 rgb(${d}))`).join(' ')} drop-shadow(${(fs * .05).toFixed(0)}px ${(fs * .09).toFixed(0)}px ${(fs * .08).toFixed(0)}px rgba(0,0,0,.4))`; }
    // (a halo that reads at a glance: at .45 the reviewers saw a soft shadow, not the reference's glow, who S2)
    if (kind === 'glow') t.style.textShadow = '0 0 .08em rgba(255,255,255,.6), 0 0 .3em rgba(255,255,255,.4), .025em 0 0 rgba(255,50,70,.5), -.025em 0 0 rgba(40,170,255,.5)';
    if (kind === 'emboss') Object.assign(t.style, { color: 'rgba(0,0,0,.3)', mixBlendMode: 'multiply', textShadow: '0 .012em 0 rgba(255,255,255,.55), 0 -.012em .01em rgba(0,0,0,.35)' });
    // (fine dots over the stroke's own colour, not dots in place of it: coarse and alone they broke the strokes and turned
    // white type pink and dim, who S8/S9 review)
    if (kind === 'halftone') { const c0 = getComputedStyle(t).color, m = c0.match(/[\d.]+/g) || [255, 255, 255], c = (+m[0] + +m[1] + +m[2]) / 3 > 140 ? '#f4f2ee' : c0; /* (light type stays a bright white under its dots: a tinted light read pink, who S8) */ Object.assign(t.style, { backgroundImage: `radial-gradient(circle, rgba(0,0,0,.28) 32%, transparent 36%), linear-gradient(${c}, ${c})`, backgroundSize: '.03em .03em, 100% 100%', webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', webkitTextFillColor: 'transparent', textShadow: 'none', filter: 'drop-shadow(0 .03em .06em rgba(0,0,0,.6))' }); }   /* (no text shadow: painted over a fill clipped to the strokes, the title's red fringe tinted the type pink, who S8) */
    // (glitch's slices shift 14 px on a heavy face; on a lettered page's thin tall strokes half that, or the line shreds: who S11)
    if (kind === 'glitch') { if (!document.getElementById('__glitchf')) { const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('width', '0'); sv.setAttribute('height', '0'); sv.style.position = 'absolute';
        sv.innerHTML = '<filter id="__glitchf" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0 .045" numOctaves="1" seed="3" result="n"/><feComponentTransfer in="n" result="b"><feFuncR type="discrete" tableValues="0 .5 .5 1 .5 .5"/></feComponentTransfer><feDisplacementMap in="SourceGraphic" in2="b" scale="' + (window.__spec?.letter?.big ? 7 : 14) + '" xChannelSelector="R" yChannelSelector="A"/></filter>'; document.body.appendChild(sv); }
      t.style.filter = `${t.style.filter || ''} url(#__glitchf)`.trim(); t.style.textShadow = `${t.style.textShadow && t.style.textShadow !== 'none' ? t.style.textShadow + ', ' : ''}.05em 0 0 rgba(255,0,60,.55), -.05em 0 0 rgba(0,200,255,.55)`; }
    if (kind === 'overprint') { const m = getComputedStyle(t).color.match(/[\d.]+/g) || [0, 0, 0], lum = (+m[0] + +m[1] + +m[2]) / 3; Object.assign(t.style, { opacity: '.86', mixBlendMode: lum < 128 ? 'multiply' : 'screen' }); }
    // (sheared, not a synthesised oblique: the house faces declared upright were drawn upright whatever was asked, recap S4)
    if (kind === 'slant') { if (getComputedStyle(t).display === 'inline') t.style.display = 'inline-block'; t.style.transform = `${t.style.transform || ''} skewX(-11deg)`.trim(); }
    // (narrowed from its left and its box closed up to the narrowed width once the faces are in, so the line lays out at
    // the width it shows: transformed alone it kept its full width, ran past the frame and was pushed off-centre, open S1)
    // (not on a lettered page: its faces are drawn at their own width, the tall display narrow of itself — condensed again,
    // open S1's 2025年1月 ran past both edges; shotplan pickTreat drops it from the reference's picks too)
    if (kind === 'condense' && window.__spec?.letter) continue;
    if (kind === 'condense') { Object.assign(t.style, { display: 'inline-block', transform: `${t.style.transform || ''} scaleX(.52)`.trim(), transformOrigin: '0 50%' }); const full = t.textContent;   // (measured on its whole words: a line that types in held two characters when it settled)
      (window.M?.settle || ((f) => document.fonts.ready.then(f)))(() => { const c = t.cloneNode(); c.textContent = full; Object.assign(c.style, { transform: 'none', position: 'absolute', visibility: 'hidden', marginRight: '0' }); t.parentElement.appendChild(c); const w = c.offsetWidth; c.remove(); t.style.marginRight = `${(-w * .48).toFixed(1)}px`; }); }
  }
  // (what the treatment set, recorded so an animation that sets the same properties every frame keeps it: common.js reveal)
  t.dataset.tf = t.style.filter || ''; t.dataset.to = t.style.opacity || ''; t.dataset.tt = t.style.transform || ''; };
// a lettered project's lines each in the face of its role (modules.mjs letterFaces; the user's roles of 2026-10-25 and
// 2026-10-26: 尽量还是用那 6 款字 … 细一点高一点 像 eva 的感觉): under 90 px the small face (黒華明朝); at 90 and over, on an
// eva-lettered project, the tall display (装甲明朝 drawn narrow), or its alternate (黒華明朝 drawn the same) where the line
// holds a character 装甲明朝 lacks — the whole line, never split across faces; a gothic-lettered project's big lines stay
// the gothic. Set from the moment the page builds its words (so a module measures them in their face) and kept from the
// first frame a line shows: a line growing in or out never changes face mid-shot.
window.__letter = () => {
  const L = window.__spec?.letter; if (!L) return;
  const lacks = new Set([...(L.lacks || '')]), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const el = n.parentElement; if (!el || el.dataset.sf === 'kept' || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName) || !n.textContent.trim()) continue;
    if (!L.big && !/[㐀-鿿]/.test(n.textContent)) continue;
    const cs = getComputedStyle(el), px = parseFloat(cs.fontSize); if (!(px > 0)) continue;
    let u = el; while (u.parentElement && u.parentElement !== document.body && /^inline/.test(getComputedStyle(u).display)) u = u.parentElement;
    const alt = [...u.textContent].some((c) => lacks.has(c)), pick = (v) => (v < (L.max || 90) ? L.small : L.big ? (alt ? L.alt : L.big) : null), set = (a, f) => { if (f && a.style.fontFamily !== `'${f}'` && a.style.fontFamily !== `"${f}"`) a.style.fontFamily = `'${f}'`; };
    set(el, pick(px));
    // (a line of Latin and figures alone is set at its own size: the figure face is raised to the CJK's measure (118 %) to
    // stand beside Chinese, and alone it grew a sixth past its design — 650 to the frame's edge, meta S6; 16.97 into the
    // subtitle band, open S6. Once, before the line shows: the size the module gave it, divided back)
    if (L.big && !el.dataset.lz && !/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(u.textContent)) { el.dataset.lz = '1'; const par = el.parentElement ? parseFloat(getComputedStyle(el.parentElement).fontSize) : 0; el.style.fontSize = !el.style.fontSize && Math.abs(par - px) < .5 ? `${(1 / 1.18).toFixed(4)}em` : `${(px / 1.18).toFixed(2)}px`; }
    // (and every box from the words out to their line, each by its own size: a module measures its title by an outer box —
    // title.html's tall shape read its ink off the wrapper still in the old face and set 思考 two fifths too tall, recap S4)
    for (let a = el.parentElement; a && a !== u.parentElement && a !== document.body; a = a.parentElement) { if (a.dataset.sf === 'kept') break; set(a, pick(parseFloat(getComputedStyle(a).fontSize))); }
    const r = el.getClientRects(); if (r.length && r[0].width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden') el.dataset.sf = 'kept'; }
};
document.addEventListener('DOMContentLoaded', () => { if (!window.__spec?.letter) return; let due = false;
  // (the faces asked for at once, so document.fonts.ready waits for them: a module that measures its words once the fonts
  // are ready measured them in a face still loading, open S1's 2025年1月 set past both edges)
  for (const f of [window.__spec.letter.small, window.__spec.letter.big, window.__spec.letter.alt]) if (f) document.fonts.load(`100px '${f}'`, '國A1');
  new MutationObserver(() => { if (due) return; due = true; queueMicrotask(() => { due = false; window.__letter(); }); }).observe(document.body, { childList: true, subtree: true, characterData: true }); window.__letter(); });
