// Motion presets for recipe-board cards, run inside a HyperFrames composition (browser, GSAP).
// Each preset adds tweens for one scene to the shared paused timeline. Everything is computed from
// the composed DOM and the shot's cue times, so the same card + cues always produce the same motion.
(function () {
  const q = (root, sel) => Array.from(root.querySelectorAll(sel));
  // every whole-frame move starts from rest and comes to rest (user 2026-10-22: 衔接还是不丝滑). The reference's camera is
  // still on both sides of 16 of its 17 hard cuts (paperclip-138 measured frame by frame); ours crept at a constant
  // speed into the cut ('none' eases stacked: the preset's push, the breath, data-push) and the next shot started at
  // another speed, the jerk at the seam. Things in the picture keep entering; the camera settles.
  const SETTLE = 'sine.inOut';
  // the page's lettering says no cursor (house.mjs: --type-cursor none), read off the element itself: the composer nests a
  // page's CSS in its scene (#scene-0 html{} matches nothing: every multi-scene card kept its cursor and its A、T、C、G, 2026-10-26)
  const noCursor = (el) => { try { return getComputedStyle(el || document.documentElement).getPropertyValue('--type-cursor').trim() === 'none'; } catch { return false; } };
  // a lettered page (house.mjs: --type-cursor none) lists letters with space, not the CJK comma: A、T、C、G set its comma
  // in the gothic as a wedge at each letter's foot (whole-film reviews of 2026-10-26)
  // (run as the timeline is built: the script loads in the head, before the body exists, and the swap at load found no
  // body and did nothing: B06's A、T、C、G kept its commas through two rounds, whole-film review 10)
  function letterLists() {
    if (!document.body) return;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const ns = []; while (w.nextNode()) ns.push(w.currentNode);
    for (const n of ns) if (noCursor(n.parentElement) && /[A-Za-z0-9][、，,][A-Za-z0-9]/.test(n.textContent) && !n.parentElement?.closest('script,style')) n.textContent = n.textContent.replace(/([A-Za-z0-9])\s*[、，]\s*(?=[A-Za-z0-9])/g, '$1\u2002\u2002');
  }

  // Split an element's text into per-glyph spans so it can type in with discrete sets (seek-safe).
  function splitGlyphs(el) {
    if (!el || el.dataset.split) return [];
    el.dataset.split = '1';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    const spans = [];
    for (const node of texts) {
      const frag = document.createDocumentFragment();
      for (const ch of node.textContent) {
        const s = document.createElement('span');
        s.textContent = ch;
        s.style.opacity = '0';
        frag.appendChild(s);
        spans.push(s);
      }
      node.parentNode.replaceChild(frag, node);
    }
    return spans;
  }
  function typeIn(tl, el, t, perGlyph = 0.06) {
    splitGlyphs(el).forEach((s, i) => tl.set(s, { opacity: 1 }, t + i * perGlyph));
  }

  // Centre of an element in stage coordinates, measured before any camera transform.
  function centreOf(el, stage) {
    const a = el.getBoundingClientRect();
    const b = stage.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2, w: a.width, h: a.height };
  }
  // Camera transform that puts point p at stage position (ax, ay) at the given scale (origin 0 0).
  const aim = (p, scale, ax = 960, ay = 540) => ({ x: ax - p.x * scale, y: ay - p.y * scale, scale });

  const presets = {
    // chat-thread: panel hinges down, header types, avatar pops + bubble stretches, onlookers pop,
    // slow drift, optional hard cut to an extreme close-up of one bubble that keeps sliding.
    chat(tl, scene, c, t0, dur) {
      const stage = scene.querySelector('.stage');
      const cam = scene.querySelector('.cam');
      const device = scene.querySelector('.device');
      const persp = device.parentElement;
      persp.style.perspective = '2400px';
      persp.style.perspectiveOrigin = '50% 0%';
      device.style.transformOrigin = '50% 0%';
      const punchTarget = c.punch && (c.punch.target === 'last' ? q(scene, '.bubble').slice(-1)[0] : q(scene, '.bubble')[c.punch.target]);
      const p = punchTarget && centreOf(punchTarget, stage);
      tl.fromTo(device, { rotationX: -78, y: -120, opacity: 0.6 }, { rotationX: 0, y: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, t0 + (c.panel || 0));
      const head = scene.querySelector('.chat-head');
      if (head) typeIn(tl, head, t0 + (c.head ?? 0.05), 0.075);
      q(scene, '.msg').forEach((m, i) => {
        const t = t0 + (c.bubbles?.[i] ?? 1.5 + i * 0.5);
        const av = m.querySelector('.av');
        if (av) tl.fromTo(av, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: 'back.out(2.2)' }, t);
        const b = m.querySelector('.bubble');
        b.style.transformOrigin = '0% 50%';
        tl.fromTo(b, { scaleX: 0.04, skewX: -24, opacity: 0 }, { scaleX: 1, skewX: 0, opacity: 1, duration: 0.42, ease: 'power4.out' }, t + 0.08);
      });
      const reacts = scene.querySelector('.reacts');
      if (reacts) {
        const rt = c.reacts ?? 3.7;
        const tag = reacts.querySelector('.rtag');
        if (tag) tl.fromTo(tag, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }, t0 + rt);
        tl.fromTo(q(reacts, '.rdot'), { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.24, ease: 'back.out(2.4)', stagger: 0.08 }, t0 + rt + 0.12);
      }
      cam.style.transformOrigin = '0 0';
      const cut = c.punch ? c.punch.at : dur;
      tl.fromTo(cam, { scale: 1, x: 0, y: 0 }, { scale: 1.035, x: -18 - 960 * 0.035, y: -6 - 540 * 0.035, duration: cut, ease: SETTLE }, t0);
      if (p) {
        const from = aim(p, c.punch.scale || 3.1, c.punch.ax ?? 1180, c.punch.ay ?? 300);
        tl.set(cam, { ...from, filter: 'blur(6px)' }, t0 + cut);
        if (reacts) tl.set(reacts, { opacity: 0 }, t0 + cut);
        tl.to(cam, { filter: 'blur(0px)', duration: 0.18, ease: 'power2.out' }, t0 + cut);
        tl.to(cam, { x: from.x + (c.punch.slide ?? -420), duration: dur - cut, ease: 'power1.inOut' }, t0 + cut);
      }
    },

    // concept-flow steps: rule draws, each step's numeral pops then its label types, bracket draws,
    // bracket label types, black card rises, card text types; slow push throughout.
    steps(tl, scene, c, t0, dur) {
      // Optional hero word (cue `title`): the big headline lands first, the steps run over it.
      const hero = scene.querySelector('[data-slot="title"] .t');
      // it settles in rather than slamming down from 112 %: a headline filling the frame reads as the camera (B51>B52 jerked)
      if (hero && c.title != null) tl.fromTo(hero, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }, t0 + c.title);
      const rule = scene.querySelector('.srule');
      rule.style.transformOrigin = '0 50%';
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power2.inOut' }, t0 + (c.rule ?? 0.2));
      q(scene, '.step').forEach((st, i) => {
        const t = t0 + (c.steps?.[i] ?? 1 + i);
        const num = st.querySelector('.snum');
        num.style.display = 'inline-block';
        tl.fromTo(num, { scale: 1.6, opacity: 0, y: -10 }, { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }, t);
        typeIn(tl, st.querySelector('.slab'), t + 0.35, 0.07);
        const en = st.querySelector('.en');
        if (en) tl.fromTo(en, { opacity: 0 }, { opacity: 1, duration: 0.3 }, t + 0.5);
        const dot = st.querySelector('.sdot');
        if (dot) tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.2, ease: 'back.out(3)' }, t + 0.3);
      });
      const br = scene.querySelector('.bracket');
      if (br) {
        const tb = t0 + (c.bracket ?? 5);
        tl.fromTo(q(br, '.bline'), { scaleY: 0, transformOrigin: '50% 0%' }, { scaleY: 1, duration: 0.3, ease: 'power2.out' }, tb);
        tl.fromTo(br.querySelector('.bfoot'), { scaleX: 0, transformOrigin: '50% 50%' }, { scaleX: 1, duration: 0.35, ease: 'power2.out' }, tb + 0.25);
        typeIn(tl, br.querySelector('.blabel'), tb + 0.6, 0.12);
      }
      const card = scene.querySelector('.scard');
      if (card) {
        const tc = t0 + (c.card ?? 8);
        tl.fromTo(card, { y: 420, opacity: 1 }, { y: 0, duration: 0.9, ease: 'power3.out' }, tc);
        q(card, '.sch, .scb').forEach((el, i) => typeIn(tl, el, tc + 1.2 + i * 0.6, 0.09));
      }
      const cam = scene.querySelector('.cam');
      cam.style.transformOrigin = '50% 45%';
      tl.fromTo(cam, { scale: 1 }, { scale: c.push ?? 1.05, duration: dur, ease: SETTLE }, t0);
    },

    // article-highlight: page fades up from black, title highlight sweeps, paragraph marks appear one
    // by one during a slow push, then a hard cut to a close read that drifts.
    article(tl, scene, c, t0, dur) {
      const stage = scene.querySelector('.stage');
      const cam = scene.querySelector('.cam');
      cam.style.transformOrigin = '0 0';
      const marks = q(scene, '.box, .bar');
      const inv = scene.querySelector('.inv');
      // Close-up aims at one mark (cue `target`, default the first); measured before any transform.
      const aimAt = marks[c.target ?? 0];
      const p0 = aimAt ? centreOf(aimAt, stage) : { x: 960, y: 540 };
      tl.fromTo(cam, { opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power2.out' }, t0);
      if (inv) {
        inv.style.backgroundRepeat = 'no-repeat';
        tl.fromTo(inv, { backgroundSize: '0% 100%', color: '#d9d6cf' }, { backgroundSize: '100% 100%', color: '#111', duration: 0.35, ease: 'power2.out' }, t0 + (c.title ?? 0.4));
        inv.style.backgroundImage = `linear-gradient(${getComputedStyle(inv).backgroundColor},${getComputedStyle(inv).backgroundColor})`;
        inv.style.backgroundColor = 'transparent';
      }
      marks.forEach((m, i) => {
        const t = t0 + (c.marks?.[i] ?? 1.4 + i * 0.5);
        const cs = getComputedStyle(m);
        const before = getComputedStyle(m.parentElement).color;
        tl.fromTo(m, { borderColor: 'rgba(0,0,0,0)', backgroundColor: 'rgba(0,0,0,0)', color: before }, { borderColor: cs.borderTopColor, backgroundColor: cs.backgroundColor, color: cs.color, duration: 0.2, ease: 'none' }, t);
      });
      const mk = scene.querySelector('.mk');
      if (mk) {
        mk.style.backgroundRepeat = 'no-repeat';
        tl.fromTo(mk, { backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%', duration: 0.5, ease: 'power2.out' }, t0 + (c.title ?? 0.4));
      }
      const cut = c.cut ?? dur;
      tl.fromTo(cam, { scale: 1, x: 0, y: 0 }, { scale: 1.12, x: -960 * 0.12, y: -540 * 0.12, duration: cut, ease: SETTLE }, t0);
      if (c.cut != null) {
        const from = aim(p0, c.closeScale ?? 2.1, c.ax ?? 820, c.ay ?? 420);
        tl.set(cam, from, t0 + cut);
        tl.to(cam, { x: from.x + (c.slide ?? -160), y: from.y - 20, scale: from.scale * 1.03, duration: dur - cut, ease: SETTLE }, t0 + cut);
      }
    },

    // person intro: photo slow push, name wipes in from the left, english + role fade up.
    person(tl, scene, c, t0, dur) {
      const photo = scene.querySelector('[data-slot="main"] :is(img,video)') || scene.querySelector('[data-slot="background"] :is(img,video)');
      if (photo) tl.fromTo(photo, { scale: 1.0 }, { scale: c.push ?? 1.06, duration: dur, ease: SETTLE }, t0);
      if (photo) breathe(tl, [photo], c, t0, dur);
      // Name plates (paper strips) wipe in one after another; a plain name wipes in as one line.
      const plates = q(scene, '[data-slot="title"] .plate');
      const names = plates.length ? plates : q(scene, '[data-slot="title"] .t').slice(0, 1);
      names.forEach((el, i) => tl.fromTo(el, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.35, ease: 'power3.out' }, t0 + (c.name ?? 0.05) + i * 0.18));
      q(scene, '[data-slot="title"] .en, [data-slot="annotation"] > div').forEach((el, i) =>
        tl.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, t0 + (c.name ?? 0.05) + 0.2 + i * 0.1));
    },
  };

  // Count a numeric label up to its final value (keeps the label's decimals and sign).
  function countUp(tl, el, t, dur) {
    const target = Number(el.dataset.value);
    const unit = el.dataset.unit || '';
    const decimals = (String(el.dataset.value).split('.')[1] || '').length;
    // Accessor tween: GSAP writes `v` on every seek, the setter renders the text.
    const acc = { _v: 0, get v() { return this._v; }, set v(x) { this._v = x; el.textContent = (decimals ? x.toFixed(decimals) : Math.round(x).toLocaleString('en-US')) + unit; } };
    tl.fromTo(acc, { v: 0 }, { v: target, duration: dur, ease: 'power2.out' }, t);
  }

  // chart: bars grow from the baseline (or from the left for hbar), values count up, slow push.
  presets.chart = function (tl, scene, c, t0, dur) {
    const bars = q(scene, '.cbar');
    // Each bar enters at cue `at[i]` when given (uneven, following the voice), else on an even stagger.
    const barTime = (i) => t0 + (c.at?.[i] ?? (c.bars ?? 0.4) + i * (c.stagger ?? 0.12));
    bars.forEach((b, i) => {
      const t = barTime(i);
      if (b.classList.contains('v')) {
        const y = Number(b.getAttribute('y')), h = Number(b.getAttribute('height'));
        tl.fromTo(b, { attr: { y: y + h, height: 0 } }, { attr: { y, height: h }, duration: 0.7, ease: 'power3.out' }, t);
      } else {
        const w = Number(b.getAttribute('width'));
        tl.fromTo(b, { attr: { width: 0 } }, { attr: { width: w }, duration: 0.7, ease: 'power3.out' }, t);
      }
    });
    q(scene, '.cval').forEach((v, i) => {
      const t = barTime(i);
      tl.fromTo(v, { opacity: 0 }, { opacity: 1, duration: 0.15 }, t);
      countUp(tl, v, t, 0.8);
    });
    q(scene, '[data-slot="title"], [data-slot="kicker"], [data-slot="annotation"]').forEach((el, i) =>
      tl.fromTo(el, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, t0 + 0.05 + i * 0.08));
    const cam = scene.querySelector('.cam');
    cam.style.transformOrigin = c.origin || '55% 55%';
    tl.fromTo(cam, { scale: 1 }, { scale: c.push ?? 1.06, duration: dur, ease: SETTLE }, t0);
  };

  // table: header fades, each row's label types then its values appear, one column turns accent.
  presets.table = function (tl, scene, c, t0, dur) {
    const head = scene.querySelector('thead');
    if (head) tl.fromTo(head, { opacity: 0 }, { opacity: 1, duration: 0.3 }, t0 + (c.header ?? 0.1));
    q(scene, 'tbody tr').forEach((tr, i) => {
      const t = t0 + (c.rows?.[i] ?? 0.5 + i * 0.5);
      typeIn(tl, tr.querySelector('.k'), t, 0.05);
      q(tr, '.v').forEach((v, j) => tl.fromTo(v, { opacity: 0 }, { opacity: 1, duration: 0.12 }, t + 0.25 + j * 0.18));
    });
    if (c.highlight) {
      q(scene, `.v[data-col="${c.highlight.col}"]`).forEach((v, i) =>
        tl.to(v, { color: c.highlight.color || '#d2402b', duration: 0.2 }, t0 + c.highlight.at + i * 0.08));
    }
    const cam = scene.querySelector('.cam');
    cam.style.transformOrigin = '45% 45%';
    tl.fromTo(cam, { scale: 1 }, { scale: c.push ?? 1.04, duration: dur, ease: SETTLE }, t0);
  };

  // trials: caption types, question pill stretches out, attempt pills + their tags in turn, then
  // the verdict types in; optional cut to a closer frame that keeps pushing.
  presets.trials = function (tl, scene, c, t0, dur) {
    const cap = scene.querySelector('.pcap');
    if (cap) q(cap, 'div').forEach((d, i) => typeIn(tl, d, t0 + (c.caption ?? 0.5) + i * 0.4, 0.04));
    const pills = q(scene, '.pill');
    pills.forEach((p, i) => {
      p.style.transformOrigin = '0% 50%';
      const t = t0 + (i === 0 ? c.question ?? 1.0 : c.tries?.[i - 1] ?? 2.5 + i * 0.3);
      tl.fromTo(p, { scaleX: 0.05, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.35, ease: 'power3.out' }, t);
    });
    q(scene, '.prow').forEach((row, i) => {
      const t = t0 + (c.tags?.[i] ?? 3.2 + i * 0.4);
      q(row, '.ptag').forEach((tag, j) => tl.fromTo(tag, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.18, ease: 'none' }, t + j * 0.25));
    });
    const v = scene.querySelector('.verdict');
    if (v) typeIn(tl, v, t0 + (c.verdict ?? 6.5), 0.12);
    const cam = scene.querySelector('.cam');
    cam.style.transformOrigin = '0 0';
    const cut = c.cut ? c.cut.at : dur;
    tl.fromTo(cam, { scale: 1, x: 0, y: 0 }, { scale: 1.02, x: -19, y: -11, duration: cut, ease: SETTLE }, t0);
    if (c.cut) {
      const s0 = c.cut.scale || 1.5;
      tl.set(cam, { scale: s0, x: c.cut.x ?? -300, y: c.cut.y ?? -220 }, t0 + cut);
      tl.to(cam, { scale: s0 * 1.04, x: (c.cut.x ?? -300) - 60, duration: dur - cut, ease: SETTLE }, t0 + cut);
    }
  };

  // quote: photo drifts; each line types in on its cue; the whole stack fades before the scene ends.
  presets.quote = function (tl, scene, c, t0, dur) {
    const photo = scene.querySelector('[data-slot="main"] :is(img,video)');
    if (photo) tl.fromTo(photo, { scale: 1.02 }, { scale: 1.07, duration: dur, ease: SETTLE }, t0);
    q(scene, '.ql').forEach((l, i) => typeIn(tl, l, t0 + (c.lines?.[i] ?? 0.2 + i * 0.6), c.perGlyph ?? 0.09));
    const mark = scene.querySelector('.qmark2');
    if (mark) tl.fromTo(mark, { opacity: 0 }, { opacity: 1, duration: 0.3 }, t0 + (c.mark ?? 0.4));
    const stack = scene.querySelector('.qlines');
    if (stack && c.out !== false) tl.to(stack, { opacity: 0, duration: 0.3 }, t0 + dur - 0.35);
  };

  // sidecard: presenter plate holds; the product card peels in from its corner (first scene) or
  // flips in (later scenes); card contents settle.
  presets.sidecard = function (tl, scene, c, t0, dur) {
    const card = q(scene, '[data-slot="card"], [data-slot="base"], [data-slot="cardTop"], [data-slot="model"], [data-slot="product"], [data-slot="label"]');
    const t = t0 + (c.in ?? 0.08);
    if (c.flip) {
      card.forEach((el) => tl.fromTo(el, { rotationY: 90, transformPerspective: 1600, opacity: 0.4 }, { rotationY: 0, opacity: 1, duration: 0.35, ease: 'power3.out' }, t));
    } else {
      // the reference (128 s): a larger, faint, blurred card settles down to size and sharpens, as one piece
      const panel = scene.querySelector('[data-slot="card"]');
      const r = panel?.getBoundingClientRect();
      const origin = r ? `${r.left + r.width / 2}px ${r.top + r.height / 2}px` : '50% 50%';
      card.forEach((el) => { const b = el.getBoundingClientRect(); el.style.transformOrigin = r ? `${r.left + r.width / 2 - b.left}px ${r.top + r.height / 2 - b.top}px` : origin; });
      tl.fromTo(card, { scale: 1.16, opacity: 0, filter: 'blur(14px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out' }, t);
    }
    const page = q(scene, '[data-slot="page"], [data-slot="data"], [data-slot="source"]');
    if (page.length && c.page != null) {
      page.forEach((el) => tl.fromTo(el, { clipPath: 'polygon(0 0,0 0,0 0)' }, { clipPath: 'polygon(0 0,220% 0,0 220%)', duration: 0.6, ease: 'power2.inOut' }, t0 + c.page));
    }
    const plate = scene.querySelector('[data-slot="background"] :is(img,video)');
    if (plate) tl.fromTo(plate, { scale: 1 }, { scale: 1.02, duration: dur, ease: SETTLE }, t0);
  };

  // tags: presenter plate holds; paper tags tear in (left-to-right wipe + settle) on their cues.
  // A dry-brush stroke reveals an element left to right: solid behind the brush, a ragged band of
  // noise at the brush head (mask layers: solid lead ∪ (noise ∩ soft band)); --w is the brush position.
  const BRUSH_NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='80'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.08 .9' numOctaves='3' seed='3'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 4 -1.6'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;
  function brushIn(tl, el, t, d = 0.5) {
    const m = `linear-gradient(90deg,#000 calc(var(--w) - 16%),transparent calc(var(--w) - 16%)), ${BRUSH_NOISE}, linear-gradient(90deg,#000 calc(var(--w) - 16%),transparent var(--w))`;
    Object.assign(el.style, { maskImage: m, webkitMaskImage: m, maskComposite: 'add, intersect', webkitMaskComposite: 'source-over, source-in', maskSize: '100% 100%, 160px 80px, 100% 100%', webkitMaskSize: '100% 100%, 160px 80px, 100% 100%' });
    el.style.setProperty('--w', '-20%');
    tl.fromTo(el, { '--w': '-20%' }, { '--w': '135%', duration: d, ease: 'power2.out' }, t);
    tl.set(el, { maskImage: 'none', webkitMaskImage: 'none' }, t + d + 0.01);
  }

  presets.tags = function (tl, scene, c, t0, dur) {
    // scan-paper tags (the reference): each is brushed on when it is said, then sits with a tiny settle
    const scan = q(scene, '.ptag2w');
    let prev = t0 + 0.15;
    scan.forEach((tag, i) => {
      // a cue wins (the layout order need not be the order they are said); else when it is said
      const cue = c.tags?.[i];
      const said = cue == null ? saidAt(tag.textContent, t0, t0 + dur) : null;
      const t = Math.min(cue != null ? t0 + cue : Math.max(prev, said ?? prev + 0.9), t0 + dur - 0.6);
      if (cue == null) prev = t + 0.25;
      brushIn(tl, tag, t, 0.55);
      tl.fromTo(tag, { scale: 1.035 }, { scale: 1, duration: 0.7, ease: 'power2.out' }, t);
    });
    // air quotes (the reference, 222 s): each glyph clears out of a blur in turn when the line is said,
    // then the English types in and the hairline draws under it
    // in the order they are said (not the order of the page); one nobody says follows the one before
    const pqs = q(scene, '.pq').map((pq, i) => ({ pq, i, said: c.tags?.[i] != null ? t0 + c.tags[i] : saidAt(pq.querySelector('.pq-zh').textContent, t0, t0 + dur) }));
    let prevQ = t0 + 0.2;
    pqs.sort((a, b) => (a.said ?? 1e9) - (b.said ?? 1e9)).forEach(({ pq, said }) => {
      const zh = pq.querySelector('.pq-zh'), en = pq.querySelector('.pq-en'), rule = pq.querySelector('.pq-rule');
      const t = Math.min(said ?? prevQ + 0.8, t0 + dur - 0.8);
      prevQ = Math.max(prevQ, t + 0.4);
      const glyphs = splitGlyphs(zh);
      glyphs.forEach((g, k) => { g.style.display = 'inline-block'; tl.fromTo(g, { opacity: 0, filter: 'blur(8px)', y: 6 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.35, ease: 'power2.out' }, t + k * 0.075); });
      const tEn = t + glyphs.length * 0.075 * 0.6;
      if (en) splitGlyphs(en).forEach((g, k) => tl.set(g, { opacity: 1 }, tEn + k * 0.028));
      if (rule) tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, tEn);
    });
    q(scene, '.ptagp').forEach((tag, i) => {
      const t = t0 + (c.tags?.[i] ?? 0.2 + i * 1.5);
      tl.fromTo(tag, { clipPath: 'polygon(0 0,0 0,0 100%,0 100%)', scale: 1.08 }, { clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)', scale: 1, duration: 0.3, ease: 'power3.out' }, t);
      // A generated paper plate brings its own torn edge; the CSS tag gets the torn clip.
      tl.set(tag, { clipPath: tag.dataset.artplate ? 'none' : 'polygon(0 8%,4% 0,18% 6%,33% 1%,52% 7%,70% 0,86% 6%,100% 2%,98% 30%,100% 58%,97% 100%,80% 94%,62% 100%,44% 93%,27% 99%,10% 93%,0 100%,2% 60%)' }, t + 0.31);
    });
    const plate = scene.querySelector('[data-slot="background"] :is(img,video)');
    if (plate) tl.fromTo(plate, { scale: 1 }, { scale: 1.02, duration: dur, ease: SETTLE }, t0);
  };

  // titleword: a single headline word blurs into focus over a slowly pushing plate.
  presets.titleword = function (tl, scene, c, t0, dur) {
    const cam = scene.querySelector('.cam');
    cam.style.transformOrigin = '50% 50%';
    tl.fromTo(cam, { scale: 1, opacity: c.fadeIn ? 0 : 1 }, { scale: c.push ?? 1.06, opacity: 1, duration: dur, ease: SETTLE }, t0);
    if (c.fadeIn) tl.to(cam, { opacity: 1, duration: c.fadeIn }, t0);
    const title = scene.querySelector('[data-slot="title"] .t');
    if (title) tl.fromTo(title, { opacity: 0, filter: 'blur(14px)', scale: 1.06 }, { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 0.45, ease: 'power2.out' }, t0 + (c.title ?? 0.1));
    const en = scene.querySelector('[data-slot="title"] .en');
    if (en) tl.fromTo(en, { opacity: 0 }, { opacity: 1, duration: 0.35 }, t0 + (c.title ?? 0.1) + 0.25);
  };

  presets.plate = function (tl, scene, c, t0, dur) {
    // Background plate: fade in, slow push; optional white flash at the end.
    const cam = scene.querySelector('.cam');
    cam.style.transformOrigin = '50% 50%';
    tl.fromTo(cam, { opacity: c.fadeIn ? 0 : 1, scale: 1 }, { opacity: 1, scale: c.push ?? 1.05, duration: dur, ease: SETTLE }, t0);
    if (c.fadeIn) tl.to(cam, { opacity: 1, duration: c.fadeIn }, t0);
    // the title types in with a cursor while the card settles from a slight tilt (the reference's 3D
    // titles); the line under it comes up when the title is done
    const title = scene.querySelector('[data-slot="title"] .t');
    // assemble (the reference's 显卡, 113 s): each glyph flies back from a scattered spot with an orange
    // glow and settles, one after another (seeded spots, so every render is the same)
    if (title && c.assemble != null) {
      const glyphs = splitGlyphs(title);
      glyphs.forEach((g, i) => {
        const a = (i * 2.399963) % (2 * Math.PI), d = 260 + (i % 3) * 90;
        g.style.display = 'inline-block';
        tl.fromTo(g, { opacity: 0, x: Math.cos(a) * d, y: Math.sin(a) * d * 0.6, rotation: (i % 2 ? 1 : -1) * 18, scale: 1.25, textShadow: '0 0 40px rgba(255,140,30,.95)' },
          { opacity: 1, x: 0, y: 0, rotation: 0, scale: 1, textShadow: '0 0 0px rgba(255,140,30,0)', duration: 0.7, ease: 'power3.out' }, t0 + c.assemble + i * 0.12);
      });
    } else if (title && normT(title.textContent)) {
      const t = t0 + (c.title ?? 0.12);
      const glyphs = splitGlyphs(title);
      const per = Math.min(0.085, 0.75 / Math.max(1, glyphs.length));
      glyphs.forEach((g, i) => tl.set(g, { opacity: 1 }, t + i * per));
      const cur = document.createElement('span');
      cur.textContent = '|'; cur.style.cssText = 'opacity:0;font-weight:200;margin-left:0.03em;color:inherit';
      if (noCursor(title)) cur.style.display = 'none';   // (the page's lettering: no cursor)
      title.appendChild(cur);
      tl.set(cur, { opacity: 1 }, t); tl.set(cur, { opacity: 0 }, t + glyphs.length * per + 0.4);
      const box = title.closest('.slot');
      tl.fromTo(box, { rotationX: 14, y: 26, transformPerspective: 1400, transformOrigin: '50% 100%' }, { rotationX: 0, y: 0, duration: 0.9, ease: 'power3.out' }, t);
      q(scene, '[data-slot="annotation"], [data-slot="kicker"]').forEach((a) => tl.fromTo(a, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, t + glyphs.length * per + 0.15));
    }
    breathe(tl, q(scene, '[data-slot="background"] :is(img,video)'), c, t0, dur);
    if (c.flash != null) {
      const fl = document.createElement('div');
      fl.style.cssText = 'position:absolute;inset:0;background:#e9e9e7;opacity:0;z-index:8';
      scene.querySelector('.stage').appendChild(fl);
      tl.fromTo(fl, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.in' }, t0 + c.flash);
    }
  };

  // stack: cards slide in one by one; a "?" card turns into its label at its data-reveal-at time.
  presets.stack = function (tl, scene, c, t0) {
    q(scene, '.scard2').forEach((card, i) => {
      if (card.dataset.revealAt != null) gsap.set([card.querySelector('.onbg'), card.querySelector('.lab')], { opacity: 0 });
      if (card.dataset.revealAt != null) gsap.set(card.querySelector('.qm'), { opacity: 0.75 });
      tl.fromTo(card, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power3.out' }, t0 + (c.enter ?? 0.1) + i * (c.stagger ?? 0.12));
      const at = card.dataset.revealAt;
      if (at == null) return;
      // Reveal is a card flip: turn edge-on, swap "?" for the label, turn back.
      const t = t0 + Number(at);
      tl.fromTo(card, { rotationY: 0, transformPerspective: 700 }, { rotationY: 90, duration: 0.16, ease: 'power2.in' }, t - 0.16);
      tl.set(card.querySelector('.onbg'), { opacity: 1 }, t);
      tl.set(card.querySelector('.lab'), { opacity: 1 }, t);
      tl.set(card.querySelector('.qm'), { opacity: 0 }, t);
      tl.fromTo(card, { rotationY: -90 }, { rotationY: 0, duration: 0.28, ease: 'back.out(1.4)' }, t);
    });
  };

  // enter: general entrance for any card: content slots come in one after another (fade + small shift,
  // or from the side with cue from: 'right' | 'left'); the background plate pushes in slowly.
  // With the shot's speech (spec.speech: each character of the beat and the second it is said), the card
  // is built to the narration, as the reference does it: every line comes in when it is said (short
  // titles type in with a cursor), every keyword gets a marker stroke when it is said, and the camera
  // drifts the whole time. A line nobody says comes in after the one before it.
  presets.enter = function (tl, scene, c, t0, dur) {
    const plate = scene.querySelector('[data-slot="background"] :is(img,video)');
    if (plate) tl.fromTo(plate, { scale: 1 }, { scale: c.push ?? 1.04, duration: dur, ease: SETTLE }, t0);
    const dx = c.from === 'right' ? 60 : c.from === 'left' ? -60 : 0;
    const slots = q(scene, '.slot[data-slot]').filter((el) => !['background', 'backdrop', 'plate'].includes(el.dataset.slot) && !el.closest('.ghost-sheet'));
    if (!SPEECH?.chars) {
      slots.forEach((el, i) => tl.fromTo(el, { opacity: 0, x: dx, y: dx ? 0 : 18 }, { opacity: 1, x: 0, y: 0, duration: 0.45, ease: 'power3.out' }, t0 + (c.in ?? 0.15) + i * (c.stagger ?? 0.12)));
      return;
    }
    buildToSpeech(tl, scene, slots, t0, dur, c);
  };

  let SPEECH = null;
  const normT = (t) => String(t || '').replace(/[\s，。！？、,.!?;；:："“”'‘’（）()《》\-—…\[\]|]/g, '').toLowerCase();
  // first second, inside [a, b), at which some piece of the text is said (longer pieces first)
  function saidAt(text, a, b) {
    const n = normT(text);
    if (!n || !SPEECH) return null;
    // a short word only whole ("XAI" must not match the "AI" of another line; "我们" is said everywhere)
    for (const L of n.length <= 3 ? [n.length] : [4, 3]) for (let k = 0; k + L <= Math.min(n.length, 14); k++) {
      const piece = n.slice(k, k + L);
      for (let i = SPEECH.chars.indexOf(piece); i >= 0; i = SPEECH.chars.indexOf(piece, i + 1)) {
        const t = SPEECH.times[i];
        if (t >= a - 0.05 && t < b) return t;
      }
    }
    return null;
  }
  const UNIT = '.t, .bubble, li, tr, .node, .fig, .row, .item, .label, .num, .cell, .line';
  function unitsOf(slot) {
    const all = q(slot, UNIT).filter((u) => normT(u.textContent));
    const leaves = all.filter((u) => !all.some((v) => v !== u && u.contains(v)));
    return leaves.length ? leaves : normT(slot.textContent) ? [slot] : [];
  }
  // A card (a panel and what sits on it) whips in from the side with motion blur, as one piece.
  function cardGroup(scene, slots) {
    const panel = scene.querySelector('[data-slot="panel"]');
    if (!panel) return new Set();
    const p = panel.getBoundingClientRect();
    return new Set(slots.filter((el) => { const r = el.getBoundingClientRect(); return el === panel || (r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top); }));
  }
  function whipIn(tl, els, t) {
    tl.fromTo(els, { x: 420, filter: 'blur(14px)', opacity: 0.35 }, { x: 0, filter: 'blur(0px)', opacity: 1, duration: 0.24, ease: 'power3.out' }, t);
  }
  function buildToSpeech(tl, scene, slots, t0, dur, c) {
    const end = t0 + dur;
    const card = cardGroup(scene, slots);
    if (card.size) whipIn(tl, [...card], t0 + 0.04);
    const cam = scene.querySelector('.cam');
    // the camera never quite stops (a slow push with a little drift)
    if (cam) { cam.style.transformOrigin = '50% 45%'; tl.fromTo(cam, { scale: 1, x: 0 }, { scale: 1.035, x: -14, duration: dur, ease: 'sine.inOut' }, t0); }
    let last = t0 + (c.in ?? 0.1);
    let shown = false;
    slots.forEach((slot) => {
      // a mechanism diagram runs its own build (motion-mechanism.browser.js): it only fades in
      const units = slot.querySelector('.mech') ? [] : unitsOf(slot);
      if (!units.length) {   // a picture, a diagram, a shape: on screen as the cut comes in
        if (!card.has(slot)) tl.fromTo(slot, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out' }, t0 + 0.08);
        return;
      }
      let times = units.map((u) => saidAt(u.textContent, t0, end));
      // a list (several lines in one slot) comes in together when any line of it is said, a line a beat
      // apart; one nobody says follows what came before
      if (units.length > 1 && units.every((u) => u.classList.contains('line'))) {
        const said = times.filter((t) => t != null);
        const at = said.length ? Math.min(...said) : last + 0.45;
        times = units.map((_, k) => at + k * 0.12);
      }
      // the frame is never empty for long: the first line is up within 0.9 s (or a fifth of a short cut),
      // the rest follow the words
      // a first line nobody says is there as the cut comes in
      const lead = t0 + Math.min(0.9, dur * 0.2);
      const quiet = t0 + 0.12;
      tl.set(slot, { opacity: 1 }, t0);
      units.forEach((u, k) => {
        let t = times[k] ?? (k ? last + 0.35 : quiet);
        // only the first words of the whole cut are pulled forward (the frame is never empty for long)
        if (!shown) t = Math.min(t, lead);
        shown = true;
        t = Math.max(t0 + 0.08, Math.min(t, end - 0.5));
        const text = u.textContent.trim();
        const isTitle = /title|kicker|headline|word/.test(slot.dataset.slot || '') || text.length <= 16;
        if (isTitle && text.length <= 24) {
          // type in, a glyph every ~45 ms, with a cursor that blinks out after the last glyph
          tl.set(u, { opacity: 1 }, t0);
          const glyphs = splitGlyphs(u);
          const per = Math.min(0.06, 0.7 / Math.max(1, glyphs.length));
          glyphs.forEach((g, i) => tl.set(g, { opacity: 1 }, t + i * per));
          // a cursor on free type; type on a card has none (the reference)
          // (and none where the page's lettering says so: --type-cursor none, house.mjs, read as a stray rule beside the title)
          if (!card.has(slot) && !noCursor(slot)) {
            const cur = document.createElement('span');
            cur.textContent = '|'; cur.style.cssText = 'opacity:0;font-weight:300;margin-left:0.04em;color:inherit';
            u.appendChild(cur);
            tl.set(cur, { opacity: 1 }, t); tl.set(cur, { opacity: 0 }, t + glyphs.length * per + 0.45);
          }
        } else {
          tl.fromTo(u, { opacity: 0, y: 14, x: dxOf(c) }, { opacity: 1, y: 0, x: 0, duration: 0.32, ease: 'power3.out' }, t);
        }
        last = Math.max(last, t);
        // keywords: a marker stroke under the word when it is said
        q(u, '.hl').forEach((h) => {
          const th = Math.max(t + 0.15, Math.min(saidAt(h.textContent, t0, end) ?? t + 0.3, end - 0.3));
          const col = getComputedStyle(h).color.replace('rgb(', 'rgba(').replace(')', ',0.28)');
          h.style.backgroundImage = `linear-gradient(${col}, ${col})`; h.style.backgroundRepeat = 'no-repeat'; h.style.backgroundPosition = '0 92%';
          tl.fromTo(h, { backgroundSize: '0% 42%' }, { backgroundSize: '100% 42%', duration: 0.28, ease: 'power2.out' }, th);
        });
      });
    });
  }
  const dxOf = (c) => (c.from === 'right' ? 40 : c.from === 'left' ? -40 : 0);

  // posters: two poster cards rise in one after the other, titles type in on their cues, tags settle,
  // camera drifts slightly.
  // posters (the reference, 98 s): two cards come in like glass settling, each title types in with a
  // cursor when it is said, and the camera goes to the card whose question is being asked, then back.
  presets.posters = function (tl, scene, c, t0, dur) {
    const stage = scene.querySelector('.stage');
    const cam = scene.querySelector('.cam');
    cam.style.transformOrigin = '0 0';
    const visits = [];
    ['left', 'right'].forEach((side, i) => {
      const card = scene.querySelector(`[data-slot="${side}Card"]`);
      const tIn = t0 + (c.cards?.[i] ?? 0.05 + i * 0.22);
      const group = [card, ...q(scene, `[data-slot="${side}Tag"], [data-slot="${side}Title"]`)].filter(Boolean);
      tl.fromTo(group, { opacity: 0, scale: 0.965, filter: 'blur(10px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.6, ease: 'power2.out' }, tIn);
      const box = scene.querySelector(`[data-slot="${side}Title"]`);
      const title = box?.querySelector('.t') || box;
      if (!title) return;
      const said = c.titles?.[i] != null ? t0 + c.titles[i] : saidAt(title.textContent, t0, t0 + dur);
      const t = Math.max(tIn + 0.4, said ?? tIn + 0.6 + i * 1.2);
      const glyphs = splitGlyphs(title);
      const per = c.perGlyph ?? 0.1;
      glyphs.forEach((g, k) => tl.set(g, { opacity: 1 }, t + k * per));
      const cur = document.createElement('span');
      cur.textContent = '|'; cur.style.cssText = 'opacity:0;font-weight:200;margin-left:.04em;color:inherit';
      if (noCursor(title)) cur.style.display = 'none';   // (the page's lettering: no cursor)
      title.appendChild(cur);
      tl.set(cur, { opacity: 1 }, t); tl.set(cur, { opacity: 0 }, t + glyphs.length * per + 0.5);
      if (card && t > t0 + 1.5) visits.push({ t, p: centreOf(card, stage), side });
    });
    // the camera: wide, then to each card as its question starts (in the order they are asked), wide again
    visits.sort((a, b) => a.t - b.t);
    let at = t0;
    tl.set(cam, { x: 0, y: 0, scale: 1 }, t0);
    visits.forEach((v) => {
      const s = c.focus ?? 1.32;
      const to = aim(v.p, s, v.side === 'left' ? 760 : 1160, 560);
      // never past the edge of the frame
      to.x = Math.min(0, Math.max(1920 - 1920 * s, to.x)); to.y = Math.min(0, Math.max(1080 - 1080 * s, to.y));
      const go = Math.max(at, v.t - 0.9);
      tl.to(cam, { ...to, duration: 0.9, ease: 'power2.inOut' }, go);
      at = go + 0.9;
    });
    if (visits.length) tl.to(cam, { x: 0, y: 0, scale: 1, duration: 1.0, ease: 'power2.inOut' }, Math.max(at, t0 + dur - 1.2));
  };

  // screen: screenshot or recording in the `screen` slot (or cue `slot`), driven by a camera track
  // compiled in node (screen.mjs) from the main-line follow / grammar compilers: one pose per output
  // frame, replayed as discrete sets so any seek lands on the exact compiled pose. Pose x/y is the crop
  // centre in normalised source coordinates; a source point p appears at (p - centre) * scale + 0.5.
  // Static callouts (ring, cursor, lens) cannot follow the camera and are hidden while it moves.
  presets.screen = function (tl, scene, c, t0, dur) {
    const track = c.screenTrack;
    if (!track) throw new Error('screen preset without a compiled camera track');
    const media = scene.querySelector(`[data-slot="${c.slot || 'screen'}"] .media`);
    if (!media) throw new Error('screen preset: no media in slot ' + (c.slot || 'screen'));
    const w = media.offsetWidth;
    const h = media.offsetHeight;
    media.style.transformOrigin = '0 0';
    if (track.samples.some(([, , s]) => s > 1.0001)) q(scene, '.ring,.cursor,.leader,.lens,.lens-label').forEach((el) => tl.set(el, { opacity: 0 }, t0));
    // Reading a page (cue highlight: the phrase's box found on the page by OCR and fitted to its glyphs, motion.mjs
    // readHighlight): marks.js draws it (the reference's reverse print: the page under it inverted; a cue colour gives a
    // marker), on a layer the size of the picture moved with the same camera poses; it sweeps in on the timeline
    let layer = null;
    if (c.highlight?.box) {
      const [iw, ih] = c.highlight.size;
      layer = document.createElement('div');
      layer.className = 'hl-layer';
      Object.assign(layer.style, { position: 'absolute', left: media.offsetLeft + 'px', top: media.offsetTop + 'px', width: w + 'px', height: h + 'px', transformOrigin: '0 0', pointerEvents: 'none', mixBlendMode: c.highlight.color ? 'multiply' : 'difference' });   // (the blend on the layer: the scaled page inside it is a group of its own)
      const page = document.createElement('div');
      Object.assign(page.style, { position: 'absolute', left: 0, top: 0, width: iw + 'px', height: ih + 'px', transformOrigin: '0 0', transform: `scale(${w / iw}, ${h / ih})` });
      layer.appendChild(page); media.parentElement.appendChild(layer);
      const at = t0 + (c.highlight.at ?? 0), sweep = c.highlight.dur ?? 0.5;
      const mk = window.TextMarks.sweep(page, c.highlight.box, { kind: c.highlight.color ? 'marker' : 'black', color: c.highlight.color || undefined, label: c.highlight.label, at, end: at + sweep });
      const proxy = { _k: 0, get k() { return this._k; }, set k(v) { this._k = v; mk.draw(v); } };
      mk.draw(0);
      tl.fromTo(proxy, { k: 0 }, { k: 1, duration: sweep, ease: 'power2.out', immediateRender: false }, at);
    } else if (c.highlight) throw new Error('screen preset: a highlight without its phrase box (motion.mjs readHighlight)');
    track.samples.forEach(([x, y, s], f) => {
      const t = f / track.fps;
      if (t > dur + 1e-6) return;
      const pose = { x: (0.5 - x * s) * w, y: (0.5 - y * s) * h, scale: s };
      tl.set(media, pose, t0 + t);
      if (layer) tl.set(layer, pose, t0 + t);
    });
  };

  // Full-frame footage: the slow push comes from data-push on the media. A beat that comes back to a picture shown
  // before (a breath, a callback) changes it instead of freezing it (user 2026-10-22: 重复、停住): focus dims it,
  // pullback draws the camera out so it becomes a part of a larger frame, erase tears it away with signal noise
  // (the reference's 如果他没出现过: the silhouette at the height wall wiped out by snow).
  presets.footage = function (tl, scene, c, t0, dur) {
    const media = q(scene, 'video.clip, .slot img');
    if (!media.length) return;
    breathe(tl, media, c, t0, dur);
  };
  // the breathing beat's one change to its picture (actions-v1 focus-dim / pull-back / push-in / erase), shared by every
  // preset that shows a picture: footage, plate and person (2026-10-24: B05 B25 B50 asked for them and plate and person
  // ignored them, so their ground stood still while the reference's moved — cardgeometry stillGround)
  function breathe(tl, media, c, t0, dur) {
    if (!media.length) return;
    if (c.focus != null) tl.to(media, { filter: 'brightness(0.34) contrast(1.15)', duration: 0.9, ease: 'power2.inOut' }, t0 + c.focus);
    if (c.pullback != null) {
      // its own layer around the media: the slot and the scene already carry the push and the cut pushes, and a tween
      // on the same element cancelled this one (B36's pull-back never showed)
      const m = media[0], layer = document.createElement('div');
      layer.style.cssText = 'position:absolute;inset:0;transform-origin:50% 50%;';
      m.parentElement.insertBefore(layer, m); layer.appendChild(m);
      tl.fromTo(layer, { scale: 1 }, { scale: 0.78, duration: Math.min(2.2, Math.max(0.8, dur - c.pullback - 0.3)), ease: 'power2.inOut', immediateRender: false }, t0 + c.pullback);
    }
    // push in on the picture (the flat breath's camera move: the frame stays full; a pull-back here only shrank it)
    if (c.pushin != null) {
      const m = media[0], layer = document.createElement('div');
      layer.style.cssText = 'position:absolute;inset:0;transform-origin:50% 48%;';
      m.parentElement.insertBefore(layer, m); layer.appendChild(m);
      tl.fromTo(layer, { scale: 1 }, { scale: 1.22, duration: Math.max(1.0, dur - c.pushin), ease: 'power1.inOut', immediateRender: false }, t0 + c.pushin);   // on into the cut: stopped 0.4 s early it stood dead still at the seam (B25>B26, 2026-10-24)
    }
    if (c.erase != null) {
      const box = media[0].parentElement, noise = document.createElement('div');
      noise.style.cssText = 'position:absolute;inset:0;opacity:0;pointer-events:none;mix-blend-mode:screen;background:repeating-linear-gradient(0deg,rgba(255,255,255,.55) 0 2px,rgba(0,0,0,0) 2px 5px),repeating-linear-gradient(90deg,rgba(255,255,255,.12) 0 1px,rgba(0,0,0,0) 1px 3px)';
      box.appendChild(noise);
      // the erase lands late enough that at most ERASE_TAIL s of snow stand before the scene ends (review 2026-10-22: B37
      // held 1.5 s of empty snow before its next picture, a dead frame mid-film), and it never flashes: the flicker
      // stays under half and the picture darkens as it goes (at .85 with brightness 1.35 a whole frame read white)
      const ERASE_TAIL = 0.6, at = Math.max(t0 + c.erase, t0 + dur - 0.9 - ERASE_TAIL);
      for (let k = 0; k < 9; k++) tl.set(noise, { opacity: k % 2 ? 0.18 : 0.46, y: ((k * 37) % 23) - 11 }, at + k * 0.06);
      tl.to(noise, { opacity: 0.4, duration: 0.3 }, at + 0.55);
      tl.to(media, { opacity: 0.12, filter: 'brightness(0.8) contrast(1.4) blur(1.5px)', duration: 0.5, ease: 'power2.in' }, at + 0.3);
      tl.to(noise, { opacity: 0.32, duration: 0.4, ease: 'power2.out' }, at + 0.9);
    }
  }

  // The terminal world (world-terminal.mjs). Ambient: filler windows open in steps, the ticker runs, the
  // meters move, cursors blink. The world preset adds the frame it rebuilt: windows open in order, pixel
  // headlines type on, tags draw open, highlight boxes sweep, the zoom window opens last, photos push.
  // Everything is a function of time and DOM order (seek-safe, no randomness at run time).
  function worldAmbient(tl, scene, t0, dur, main) {
    q(scene, '.tw-win').forEach((w, k) => {
      if (w === main) return;
      const at = t0 + 0.04 + k * 0.05 + (w.querySelector('.tw-zoom') ? 1.25 : 0);
      tl.fromTo(w, { opacity: 0, scale: 0.94, transformOrigin: '0% 0%' }, { opacity: w.classList.contains('dim') ? 0.42 : 1, scale: 1, duration: 0.24, ease: 'steps(4)', immediateRender: true }, at);
    });
    q(scene, '.tw-tick').forEach((t) => tl.fromTo(t, { x: 0 }, { x: -160, duration: dur, ease: 'none', immediateRender: true }, t0));
    q(scene, '.tw-meter i').forEach((m, k) => {
      const base = parseFloat(m.style.width) || 50;
      for (let f = 0, n = Math.floor(dur / 0.25); f <= n; f++) tl.set(m, { width: Math.max(8, Math.min(98, base + Math.sin(k * 1.7 + f * 1.3) * 14)) + '%' }, t0 + f * 0.25);
    });
    q(scene, '.tw-cursor').forEach((c) => { for (let f = 0, n = Math.floor(dur / 0.4); f <= n; f++) tl.set(c, { opacity: f % 2 ? 0 : 1 }, t0 + f * 0.4); });
  }
  presets.world = function (tl, scene, c, t0, dur) {
    worldAmbient(tl, scene, t0, dur, null);
    q(scene, '[data-twfit], [data-twbox]').forEach((e, k) => typeIn(tl, e, t0 + 0.35 + k * 0.2, Math.min(0.07, 0.9 / Math.max(1, e.textContent.length))));
    q(scene, '.tw-tag').forEach((g, k) => tl.fromTo(g, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.3, ease: 'steps(6)', immediateRender: true }, t0 + 0.75 + k * 0.28));
    q(scene, '.tw-hl').forEach((h, k) => tl.fromTo(h, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.4, ease: 'power2.out', immediateRender: true }, t0 + 0.9 + k * 0.3));
    q(scene, '.tw-photo').forEach((ph) => tl.fromTo(ph, { scale: 1 }, { scale: 1.06, duration: dur, ease: SETTLE, immediateRender: true }, t0));
  };

  const BREATH_RATE = 0.006;   // as morph.js BREATH_RATE
  // the most a scene may grow about its centre and keep its words TEXT_MARGIN px inside the frame (Suez B01: the breath
  // carried a 419 px title placed 37 px under the top edge to 22 px from it; chapter.mjs textEdgeErrors)
  const TEXT_MARGIN = 24;
  function typeRoom(el) {
    const R = el.getBoundingClientRect(); if (!R.width) return Infinity;
    const k = 1920 / R.width, cx = 960, cy = 540; let room = Infinity;
    for (const n of el.querySelectorAll('*')) {
      if (![...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
      const r = n.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const x0 = (r.left - R.left) * k, x1 = (r.right - R.left) * k, y0 = (r.top - R.top) * k, y1 = (r.bottom - R.top) * k;
      if (x0 < 0 || y0 < 0 || x1 > 1920 || y1 > 1080) continue;   // a word already off the frame on purpose (a bleed)
      for (const [d, lim] of [[cx - x0, cx - TEXT_MARGIN], [x1 - cx, cx - TEXT_MARGIN], [cy - y0, cy - TEXT_MARGIN], [y1 - cy, cy - TEXT_MARGIN]]) if (d > lim * 0.5) room = Math.min(room, lim / d);
    }
    return room;
  }
  window.A1Motion = {
    build(tl, spec) {
      SPEECH = spec.speech || null;
      letterLists();
      spec.scenes.forEach((s, i) => {
        const el = document.getElementById(s.id);
        // Scene cuts (scenes are plain wrappers; later ones start hidden in markup).
        if (i > 0) tl.set(el, { opacity: 1 }, s.start);
        if (i < spec.scenes.length - 1) tl.set(el, { opacity: 0 }, s.start + s.duration);
        // Focus: everything marked data-dim starts lit and dims at cue `focus` (hold state in the still).
        const cues = { ...(spec.cues || {}), ...(s.cues || {}) };
        if (cues.focus != null) q(el, '[data-dim]').forEach((d) => tl.fromTo(d, { opacity: 1 }, { opacity: Number(d.dataset.dim), duration: 0.5, ease: 'power2.inOut' }, s.start + cues.focus));
        // Layers (props): enter at data-in from data-from, then drift gently (data-float px).
        q(el, "[data-prop]").forEach((ly) => {
          const tIn = s.start + Number(ly.dataset.in ?? 0.1);
          const d = { left: [-140, 0], right: [140, 0], top: [0, -120], bottom: [0, 120] }[ly.dataset.from] || [0, 24];
          tl.fromTo(ly, { opacity: 0, x: d[0], y: d[1] }, { opacity: 1, x: 0, y: 0, duration: 0.6, ease: 'power3.out' }, tIn);
          const f = Number(ly.dataset.float || 0);
          if (f) tl.to(ly, { y: -f, duration: Math.max(0.5, s.start + s.duration - tIn - 0.6), ease: 'sine.inOut' }, tIn + 0.6);
        });
        // A layer marked data-reveal="wire" comes in as a blown-out ghost (a wireframe read) and turns solid.
        q(el, '[data-reveal="wire"]').forEach((ly) => tl.fromTo(ly, { filter: 'grayscale(1) brightness(3.2) contrast(2.4) blur(2px)', opacity: 0.55 }, { filter: 'grayscale(0) brightness(1) contrast(1) blur(0px)', opacity: 1, duration: 0.8, ease: 'power2.inOut' }, s.start + Number(ly.dataset.in ?? 0.3)));
        // Offset outlines behind a cutout slide out from under the subject, staggered.
        q(el, '.ol').forEach((o, k) => tl.fromTo(o, { translate: '0px 0px' }, { translate: `${o.dataset.dx}px ${o.dataset.dy}px`, duration: 0.35, ease: 'power3.out' }, s.start + (cues.outline ?? 0.15) + k * 0.08));
        // Slow push on footage / plates marked data-push="0.06".
        q(el, '[data-push]').forEach((m) => tl.fromTo(m, { scale: 1 }, { scale: 1 + Number(m.dataset.push), duration: s.duration, ease: SETTLE }, s.start));
        const fn = presets[s.preset || spec.preset];
        if (!fn) throw new Error('unknown motion preset ' + (s.preset || spec.preset));
        fn(tl, el, { ...(spec.cues || {}), ...(s.cues || {}) }, s.start, s.duration);
        // never dead (user, 2026-10-21: 衔接不好): the whole scene breathes in 0.6 % a second, the 3D chapters' breath, from
        // rest to rest (SETTLE): what keeps a card alive at its cut is what enters it, not a camera still moving
        tl.fromTo(el, { scale: 1 }, { scale: Math.max(1, Math.min(1 + BREATH_RATE * s.duration, typeRoom(el))), transformOrigin: '50% 50%', duration: s.duration, ease: SETTLE, immediateRender: true }, s.start);
        // a card the world framed keeps its own motion; the world around it moves too (main window stays)
        if ((s.preset || spec.preset) !== 'world' && el.querySelector('.tw-win')) worldAmbient(tl, el, s.start, s.duration, el.querySelector('.tw-win:not(.dim)[style*="z-index:3"]'));
      });
      q(document, '[data-sub-at]').forEach((sub) => {
        tl.set(sub, { opacity: 1 }, Number(sub.dataset.subAt));
        tl.set(sub, { opacity: 0 }, Number(sub.dataset.subTo));
      });
      return tl;
    },
  };
})();
