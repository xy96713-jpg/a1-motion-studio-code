// The design brain: how a film's one world is varied chapter by chapter (the user 2026-10-27: 要多样性变化 … 要智能不要死板
// 各种变体背景 反转颜色 搭配的配色和谐什么的都要有 要做有设计大脑的导演 设计系统). From the world's three colours (ground,
// ink, accent) it derives a family of palettes in OKLCH, so every member is in harmony with the world by construction
// (one hue family, the accent kept, chroma held low on grounds, contrast checked): the world's own dark, its inverse in
// light, the accent laid as a field (the colours reversed), a mid tone, an analogous shift and a paper neutral. Each
// palette goes with the grounds (materials) that suit its tone. Then each chapter is given one, from what its beats do
// (their semantic acts: a figure to read wants light, a consequence or a reversal the reversed field, a place the deep
// shift) and from its neighbours (tone, palette and ground all change from the chapter before; no tone three in a row).
// Pure: no files. chapter.mjs designPlan reads the film and writes projects/<id>/design.json.

// ---- colour: sRGB hex <-> OKLCH (Björn Ottosson's OKLab), gamut-clipped by lowering chroma
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) : [0, 0, 0]; };
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), gam = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
export function toOklch(hex) {
  const [r, g, b] = hexRgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}
function rawRgb({ L, C, h }) {
  const A = C * Math.cos((h * Math.PI) / 180), B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
export function fromOklch({ L, C, h }) {
  let c = C, rgb = rawRgb({ L, C: c, h });
  while (c > 0 && rgb.some((v) => v < -0.0005 || v > 1.0005)) { c -= 0.002; rgb = rawRgb({ L, C: Math.max(0, c), h }); }
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(1, gam(Math.max(0, v)))) * 255).toString(16).padStart(2, '0')).join('');
}
const relLum = (h) => { const [r, g, b] = hexRgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// the lightness of `hue` at chroma `c` whose contrast with `against` is at least `min`, searched from `from` toward `to`
function readable(hue, c, against, min, from, to) {
  for (let i = 0; i <= 60; i++) { const L = from + ((to - from) * i) / 60, x = fromOklch({ L, C: c, h: hue }); if (contrast(x, against) >= min) return x; }
  return fromOklch({ L: to, C: c, h: hue });
}

// ---- the family: every member keeps the world's hue family and its one accent; grounds carry little chroma (the look's
// cast stays near the approved look's: the banana grounds went off it at chroma 0.06 and more)
export const GROUND_C = 0.035, INK_MIN = 7, ACCENT_MIN = 2.2;
export const TONES = ['dark', 'light', 'field', 'mid'];
// the grounds a tone suits (materials the world's art paints, text-free); `art` is said to the image model with the world's art
export const MATERIALS = {
  dark: [{ id: 'board', art: 'a felt specimen board seen from above, worn, lit by a lamp in a pool' }, { id: 'scene', art: 'the place of the subject at dusk, low raking light, seen from above' }, { id: 'stone', art: 'a slate or dark stone surface, fine grain, soft side light' }, { id: 'deep', art: 'deep marbled endpaper, soft light falling off to the edges' }],
  light: [{ id: 'paper', art: 'an aged survey or record sheet, faint ruled grid, soft stains' }, { id: 'lightbox', art: 'a lit lightbox glass, faintly frosted, even light' }, { id: 'herbarium', art: 'a herbarium mounting sheet, heavy cotton paper, a little foxing' }],
  field: [{ id: 'dyed', art: 'a sheet of dyed paper in the colour, fine fibres, even light' }, { id: 'cloth', art: 'a dyed cloth surface in the colour, fine weave, soft light' }],
  mid: [{ id: 'concrete', art: 'a smooth grey concrete or plaster wall, soft diffuse light' }, { id: 'card', art: 'grey board card, fine grain, soft light' }],
};
export function paletteFamily(tokens) {
  const g = toOklch(tokens.ground || tokens.paper || '#151515'), a = toOklch(tokens.accent || '#c4562e'), hue = g.C > 0.01 ? g.h : a.h;
  const C = Math.min(GROUND_C, Math.max(0.012, g.C));
  const out = [];
  const add = (id, tone, ground, why) => {
    const gL = toOklch(ground).L, ink = gL > 0.55 ? readable(hue, 0.02, ground, INK_MIN, 0.32, 0.12) : readable(hue, 0.012, ground, INK_MIN, 0.88, 0.99);
    // the accent: the world's own when it stands off the ground, else moved in lightness until it does (same hue)
    let accent = tokens.accent; if (contrast(accent, ground) < ACCENT_MIN) accent = readable(a.h, a.C, ground, ACCENT_MIN, a.L, gL > 0.55 ? 0.3 : 0.85);
    out.push({ id, tone, ground, ink, accent, dim: fromOklch({ L: (gL + toOklch(ink).L) / 2, C: 0.01, h: hue }), why, materials: MATERIALS[tone].map((m) => m.id) });
  };
  // (never a near-black: the user 2026-10-27 on the banana white model, 背景也不该全黑 — the world's dark is lifted to a deep tone of its hue)
  add('base', 'dark', fromOklch({ L: Math.max(0.26, Math.min(0.32, g.L)), C, h: hue }), 'the world\'s own ground, as a deep tone of its hue');
  add('inverse', 'light', fromOklch({ L: 0.9, C: Math.min(C, 0.02), h: hue }), 'the world turned light: its ground hue as a pale sheet, its ground colour as ink');
  // the colours reversed: the accent laid as the field, dark and quiet enough to carry words; the marks turn light
  add('field', 'field', fromOklch({ L: 0.34, C: Math.min(0.09, a.C * 0.55), h: a.h }), 'the accent laid as the field (colours reversed): words light on it, the marks in a pale tint');
  add('mid', 'mid', fromOklch({ L: 0.7, C: Math.min(C, 0.018), h: hue }), 'a middle grey of the world\'s hue: dark words, the accent darkened');
  // (a step you can see: at the base's lightness and chroma a 35° turn read as the same dark — the banana film's B13 and
  // B18 were held to one ground by sameGroundErrors; the shift is lighter and a little more coloured)
  add('shift', 'dark', fromOklch({ L: 0.38, C: Math.min(0.05, C + 0.02), h: (hue + 35) % 360 }), 'an analogous step from the world\'s hue (35°), a tone lighter: the same family, another room');
  add('paper', 'light', fromOklch({ L: 0.84, C: 0.034, h: 80 }), 'warm paper neutral, the accent and ink of the world on it');
  // the reversed field's marks: on the accent ground the accent itself cannot mark, so the marks take a pale tint of it
  const f = out.find((x) => x.id === 'field'); f.accent = readable(a.h, Math.min(0.08, a.C), f.ground, 3, 0.78, 0.95);
  return out;
}
// two members of a family must be told apart on screen: OKLab distance (×100) at least FAMILY_GAP
export const FAMILY_GAP = 6, GROUND_NEAR = 12;
export function oklabDist(a, b) { const p = toOklch(a), q = toOklch(b), pa = p.C * Math.cos((p.h * Math.PI) / 180), pb = p.C * Math.sin((p.h * Math.PI) / 180), qa = q.C * Math.cos((q.h * Math.PI) / 180), qb = q.C * Math.sin((q.h * Math.PI) / 180); return 100 * Math.hypot(p.L - q.L, pa - qa, pb - qb); }
export function familyErrors(fam) { const e = []; for (let i = 0; i < fam.length; i++) for (let j = i + 1; j < fam.length; j++) { const d = oklabDist(fam[i].ground, fam[j].ground); if (d < FAMILY_GAP) e.push(`${fam[i].id} and ${fam[j].id} grounds ${d.toFixed(1)} apart (at least ${FAMILY_GAP})`); } return e; }
export function harmonyErrors(v) {
  const e = [];
  if (contrast(v.ink, v.ground) < INK_MIN) e.push(`${v.id}: ink ${v.ink} on ${v.ground} ${contrast(v.ink, v.ground).toFixed(1)} (at least ${INK_MIN})`);
  if (contrast(v.accent, v.ground) < (v.tone === 'field' ? 3 : ACCENT_MIN)) e.push(`${v.id}: accent ${v.accent} on ${v.ground} ${contrast(v.accent, v.ground).toFixed(1)}`);
  if (toOklch(v.ground).C > 0.1) e.push(`${v.id}: ground ${v.ground} too saturated`);
  return e;
}

// ---- which member a chapter takes: from what its beats do, and from its neighbours
// what each act asks of the ground (routing/semantic-acts.json acts): a figure to be read wants light; a consequence,
// a reversal or a verdict the reversed field; a place or a sequence across the world the deep or shifted dark; a
// mechanism a lit dark table or a lightbox; a pause the world's own dark
const ACT_WANTS = {
  ratio: { light: 2 }, scale: { light: 2, mid: 1 }, list: { light: 2 }, compare: { light: 1, mid: 1 },
  consequence: { field: 3 }, reversal: { field: 3 }, verdict: { field: 2, dark: 1 }, turn: { field: 1, mid: 1 },
  sequence: { dark: 2 }, evidence: { light: 1, mid: 1 }, mechanism: { dark: 2, light: 1 }, cause: { dark: 1, mid: 1 },
  name: { dark: 1, field: 1 }, phenomenon: { dark: 2 }, question: { dark: 1 }, breath: { dark: 2 }, close: { dark: 2 },
};
// lowKey (a film on the Gawx profile, profile.mjs): only the dark tones of the family (its own deep ground, the analogous
// step, the reversed field) and dark materials lit in a pool; no light chapter is forced in, a turn goes to the field
// (the user 2026-10-27: 画面低调化; Gawx measured at a median luma of 0.12-0.21)
// the tones of the accent's hue (style-lab RESEARCH-colour-type-20261027: the creators keep one family of colour, 4-12 %
// of the frame, in tones of one hue — rust, ochre, umber — and the strong accent on the one thing): three of its hue at a
// low chroma, dark to light, for the things of the scene; the accent stays for what is looked at
export function tonesOf(accent) {
  const a = toOklch(accent);
  return [[0.36, 0.06, -8], [0.5, 0.075, 6], [0.64, 0.06, 16]].map(([L, C, dh]) => fromOklch({ L, C, h: (a.h + dh + 360) % 360 }));
}
export function assignVariants(chapters, family0, { lowKey = false } = {}) {
  // (a low-key film keeps one hue: its analogous step is the same hue a tone lighter, not a hue 35 degrees off — Suez's
  // violet chapter beside its brown ones, 2026-10-27)
  const family = lowKey ? family0.filter((v) => v.tone === 'dark' || v.tone === 'field').map((v) => { if (v.id !== 'shift') return v; const b = family0.find((x) => x.id === 'base') || v, o = toOklch(b.ground); return { ...v, ground: fromOklch({ L: Math.min(0.42, o.L + 0.06), C: o.C, h: o.h }), why: 'the world\'s own hue a tone lighter: the same family, another room' }; }) : family0;
  const out = [];
  for (let i = 0; i < chapters.length; i++) {
    const want = {}; for (const a of chapters[i].acts || []) for (const [t, w] of Object.entries(ACT_WANTS[a] || {})) want[t] = (want[t] || 0) + w;
    const prev = out[i - 1], prev2 = out[i - 2];
    const score = (v) => { let s = (want[v.tone] || 0) * 2;
      if (prev) { if (v.tone !== prev.tone) s += 3; if (v.id === prev.variant) s -= 8; }
      if (prev && prev2 && prev.tone === prev2.tone && v.tone === prev.tone) s -= 10;   // no tone three in a row
      if (out.some((o) => o.variant === v.id)) s -= 2;   // spread the family over the film
      if (i === 0 && v.id === 'base') s += 2;   // the film opens in its own world
      return s; };
    const v = [...family].sort((x, y) => score(y) - score(x) || family.indexOf(x) - family.indexOf(y))[0];
    // its ground: a material of its tone not used by the chapter before
    const mats = MATERIALS[v.tone], used = new Set(out.map((o) => o.material)), m = mats.find((x) => x.id !== prev?.material && !used.has(x.id)) || mats.find((x) => x.id !== prev?.material) || mats[0];
    const top = Object.entries(want).sort((p, q) => q[1] - p[1])[0];
    out.push({ chapter: chapters[i].id, variant: v.id, tone: v.tone, palette: { ground: v.ground, ink: v.ink, accent: v.accent, dim: v.dim, tones: tonesOf(v.accent) }, material: m.id, art: m.art,
      why: `${v.why}${top ? `; its beats (${(chapters[i].acts || []).join(', ')}) ask for ${top[0]}` : ''}${prev ? `; the chapter before was ${prev.tone} (${prev.variant}, ${prev.material})` : ''}` });
  }
  // a film of three chapters or more has a light one and a reversed one: the chapter that asks for each most, where it
  // leaves no tone three in a row and does not sit beside one of its own tone
  if (chapters.length >= 3) for (const tone of lowKey ? ['field'] : ['light', 'field']) {
    if (out.some((o) => o.tone === tone)) continue;
    const v = family.find((x) => x.tone === tone), wants = chapters.map((c, i) => ({ i, w: (c.acts || []).reduce((s, a) => s + ((ACT_WANTS[a] || {})[tone] || 0), 0) }))
      .filter(({ i }) => out[i - 1]?.tone !== tone && out[i + 1]?.tone !== tone && !(tone === 'light' && out[i].tone === 'field') && !(tone === 'field' && out[i].tone === 'light')).sort((p, q) => q.w - p.w);
    if (!wants.length || !v) continue;
    const { i } = wants[0], mats = MATERIALS[tone], m = mats.find((x) => x.id !== out[i - 1]?.material) || mats[0];
    out[i] = { ...out[i], variant: v.id, tone, palette: { ground: v.ground, ink: v.ink, accent: v.accent, dim: v.dim, tones: tonesOf(v.accent) }, material: m.id, art: m.art, why: `${v.why}; the film had no ${tone} chapter and this one asks for it most` };
  }
  // within a chapter: a beat whose act turns the story (a consequence, a reversal, a verdict) may turn the ground too —
  // into the reversed field when the chapter is not one, else into the chapter's light
  for (const o of out) { const c = chapters.find((x) => x.id === o.chapter), to = o.tone === 'field' ? family.find((x) => x.tone === (lowKey ? 'dark' : 'light')) : family.find((x) => x.tone === 'field');
    if (!to) { o.turns = []; continue; }
    o.turns = (c.beats || []).filter((b) => ['consequence', 'reversal', 'verdict'].includes(b.act)).map((b) => ({ beat: b.id, variant: to.id, palette: { ground: to.ground, ink: to.ink, accent: to.accent }, why: `${b.act}: the ground may turn with the story` })); }
  return out;
}

// ---- the chapter held to its member: its keyframes' grounds (ground.py rows: dominant colour) read in its tone
export function toneOf(hex) { const { L, C, h } = toOklch(hex); return { L, C, h }; }
export function designErrors(rows, assigned, chapterId) {
  if (!assigned || !rows.length) return [];
  const want = assigned.tone, g = toOklch(assigned.palette.ground);
  const ok = (r) => { const c = toOklch(r.color); if (want === 'light') return c.L > 0.7; if (want === 'mid') return c.L > 0.55 && c.L < 0.82; if (want === 'field') return c.L < 0.6 && c.C > 0.025 && Math.abs(((c.h - g.h + 540) % 360) - 180) < 40; return c.L < 0.42; };
  const n = rows.filter(ok).length;
  // and near its colour, not only in its tone (B13 was given a lit teal #2a4948 and stood on #040404: the tone alone let a
  // near-black pass; the user 2026-10-27: 背景也不该全黑). OKLab ×100 within GROUND_NEAR on most keyframes
  const near = rows.filter((r) => oklabDist(r.color, assigned.palette.ground) <= GROUND_NEAR).length;
  if (n * 2 >= rows.length && near * 2 < rows.length) return [`${chapterId}: its ground reads ${rows.map((r) => r.color).join(' ')}, off the ${assigned.variant} palette's ${assigned.palette.ground} (${Math.round(Math.min(...rows.map((r) => oklabDist(r.color, assigned.palette.ground))))} apart, at most ${GROUND_NEAR}): light or tint the ground to it`];
  return n * 2 >= rows.length ? [] : [`${chapterId}: the design gives this chapter the ${assigned.variant} palette (${want}: ground ${assigned.palette.ground}, ${assigned.material}); its keyframes stand on ${rows.map((r) => r.color).join(' ')} — lay its ground in that palette`];
}
