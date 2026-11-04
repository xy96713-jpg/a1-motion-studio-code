// Packaging codebook: the reference's packaging effects as reusable, checkable recipes.
// The taxonomy (routing/packaging-taxonomy.json) holds invariants + categories + variants.
// This module validates it, resolves variant parameters, and selects variants for a beat.
import fs from 'node:fs';
import path from 'node:path';

export const taxonomyPath = (dataDir) => path.join(dataDir, 'routing', 'packaging-taxonomy.json');
export const benchmarksPath = (dataDir) => path.join(dataDir, 'routing', 'packaging-benchmarks.json');
export const gawxPath = (dataDir) => path.join(dataDir, 'routing', 'gawx-layout-colour.json');
export function loadGawx(dataDir) {
  const f = gawxPath(dataDir);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

export function loadPackaging(dataDir) {
  const f = taxonomyPath(dataDir);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

export function loadBenchmarks(dataDir) {
  const f = benchmarksPath(dataDir);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

export function variantsInCategory(pkg, category) {
  return allVariants(pkg).filter((v) => v.category === category);
}

export function benchmarkForCategory(bench, category) { return bench?.categories?.[category] || null; }

export function variantsWithBenchmark(pkg, bench, category) {
  const cat = benchmarkForCategory(bench, category);
  if (!cat) return [];
  return variantsInCategory(pkg, category).filter((v) => (v.refs?.benchmarks?.films || []).length > 0);
}

export function benchmarkErrors(bench, pkg) {
  const e = [];
  if (!bench) return ['benchmarks missing'];
  if (bench.contract !== 'A1PackagingBenchmarks/v1') e.push('benchmarks contract must be A1PackagingBenchmarks/v1');
  const films = bench.films || {};
  for (const id of ['paperclip', 'hupo']) if (!films[id]) e.push('benchmarks.films.' + id + ' missing');
  if (!(films.paperclip?.sections >= 1)) e.push('paperclip needs sections');
  if (!(films.hupo?.shots >= 1)) e.push('hupo needs shots');
  if (!(films.paperclip?.beats >= 1)) e.push('paperclip needs beats');
  if (!(films.paperclip?.totalElements >= 1)) e.push('paperclip needs elements');
  if (!(films.hupo?.labels && Object.keys(films.hupo.labels).length >= 3)) e.push('hupo needs label stats');
  if (!Array.isArray(bench.gaps) || !bench.gaps.length) e.push('benchmarks.gaps must say what is not measured yet');
  const reqFor = (cat) => (bench.requirements?.categoryFilms?.[cat] || bench.requirements?.defaultFilms || ['paperclip', 'hupo']);
  for (const c of pkg?.categories || []) {
    const ev = bench.categories?.[c.id];
    if (!ev) { e.push('category ' + c.id + ' has no benchmark evidence'); continue; }
    const req = reqFor(c.id);
    for (const f of req) { if (!(ev.films || []).includes(f)) e.push('category ' + c.id + ' needs film ' + f); if (!ev[f]) e.push('category ' + c.id + ' needs ' + f + ' evidence block'); }
    for (const v of c.variants || []) {
      const refs = v.refs?.benchmarks;
      if (!refs || !Array.isArray(refs.films) || !refs.films.length) e.push(v.id + ': no benchmark film refs');
      else if (!refs.films.every((f) => ev.films.includes(f))) e.push(v.id + ': benchmark film not in category evidence');
    }
  }
  return e;
}


const hexToRgb = (h) => { const x = String(h || '').replace('#', ''); return [parseInt(x.slice(0,2),16), parseInt(x.slice(2,4),16), parseInt(x.slice(4,6),16)]; };
const lin = (c) => { c = c / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const relativeLuminance = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
export const contrastRatioHex = (a, b) => { const la = relativeLuminance(hexToRgb(a)), lb = relativeLuminance(hexToRgb(b)); const hi = Math.max(la, lb), lo = Math.min(la, lb); return +((hi + 0.05) / (lo + 0.05)).toFixed(2); };
export const hueOf = (h) => { const [r0,g0,b0] = hexToRgb(h).map((x) => x / 255); const mx = Math.max(r0,g0,b0), mn = Math.min(r0,g0,b0), d = mx - mn; if (!d) return null; let H; if (mx === r0) H = ((g0 - b0) / d) % 6; else if (mx === g0) H = (b0 - r0) / d + 2; else H = (r0 - g0) / d + 4; H *= 60; return +((H + 360) % 360).toFixed(1); };
export const hueDiff = (a, b) => { const d = Math.abs(hueOf(a) - hueOf(b)); return +(Math.min(d, 360 - d)).toFixed(1); };

export function gawxErrors(g) {
  const e = [];
  if (!g) return ['gawx-layout-colour missing'];
  if (g.contract !== 'A1GawxLayoutColour/v1') e.push('gawx contract must be A1GawxLayoutColour/v1');
  const films = g.films || {};
  if (Object.keys(films).length < 4) e.push('gawx needs 4 films');
  for (const [k, f] of Object.entries(films)) {
    if (!f.palette) { e.push(k + ': palette missing'); continue; }
    if (!/^#[0-9a-f]{6}$/i.test(f.palette.ground) || !/^#[0-9a-f]{6}$/i.test(f.palette.ink)) e.push(k + ': palette hex invalid');
    if (contrastRatioHex(f.palette.ink, f.palette.ground) < 3) e.push(k + ': ink/ground contrast under 3');
  }
  const t = g.typography?.gawx;
  if (!t) e.push('typography.gawx missing');
  else {
    if (!(t.frames >= 500)) e.push('Gawx type sample too small');
    if (!Array.isArray(t.biggest) || t.biggest.length !== 4) e.push('biggest must be 4 quantiles');
    else for (let i = 1; i < 4; i++) if (!(t.biggest[i] >= t.biggest[i-1])) e.push('biggest quantiles not ordered');
    if (!(t.lines[0] <= t.lines[1] && t.lines[1] <= t.lines[2])) e.push('lines not ordered');
    if (!(t.margin[0] < t.margin[1])) e.push('margin range invalid');
    if (!(t.chars[0] < t.chars[1])) e.push('chars range invalid');
    const align = Object.values(t.align || {}).reduce((a,b) => a+b, 0);
    if (Math.abs(align - 1) > 0.05) e.push('align shares must sum to 1');
  }
  for (const v of g.layoutVariants || []) {
    if (!v.contract || !v.params || !v.measured === undefined) e.push('layout ' + v.id + ' needs params/contract');
    const sf = v.params?.sizeFrac, mg = v.params?.margin;
    if (sf && (sf.min < t.biggest[0] - 0.005 || sf.max > t.biggest[3] + 0.005)) e.push('layout ' + v.id + ' sizeFrac outside measured biggest');
    if (mg && (mg.min < t.margin[0] - 0.005 || mg.max > t.margin[1] + 0.005)) e.push('layout ' + v.id + ' margin outside measured');
  }
  for (const v of g.colourVariants || []) {
    const m = v.measured || {}, c = v.contract || {}, rel = m.relations || {};
    if (!m.film) e.push('colour ' + v.id + ' needs a measured film');
    if (rel.inkContrast !== undefined && rel.inkContrast < (c.inkContrastMin || 3)) e.push('colour ' + v.id + ' measured ink contrast under contract');
    if (c.hueRule === 'analogous' && rel.hueLeadSecond !== undefined && rel.hueLeadSecond > (c.hueMaxDeg || 45)) e.push('colour ' + v.id + ' measured hue not analogous');
    if ((c.hueRule === 'complementary' || c.hueRule === 'contrast') && rel.hueWarmCool !== undefined) { const [lo, hi] = c.hueRangeDeg || [90, 210]; if (rel.hueWarmCool < lo || rel.hueWarmCool > hi) e.push('colour ' + v.id + ' measured hue outside ' + lo + '-' + hi); }
    const defaults = v.defaults || {};
    if (defaults.ground && defaults.ink && contrastRatioHex(defaults.ink, defaults.ground) < (c.inkContrastMin || 3)) e.push('colour ' + v.id + ' default ink/ground contrast under contract');
    const leadToken = defaults.lead || defaults.warm || defaults.accent;
    if (leadToken && defaults.ground && c.leadGroundContrastMin && contrastRatioHex(leadToken, defaults.ground) < c.leadGroundContrastMin) e.push('colour ' + v.id + ' default lead/ground contrast under contract');
  }
  if (!g.harmonyRules || g.harmonyRules.maxColouredFamiliesPerFrame !== 2) e.push('harmonyRules.maxColouredFamiliesPerFrame must be 2');
  if (!Array.isArray(g.gaps) || !g.gaps.length) e.push('gawx gaps must say what is not measured');
  return e;
}


const LADDER = { hero: 300, figure: 200, title: 128, sub: 64, caption: 48 };
const HARD_FLAGS = ['twoNumbersRequired', 'leaderRequired', 'axisRequired', 'bandMustClearCard', 'bandMustBeFlat', 'screenSafe', 'knockout', 'occlusionRequired', 'scrimRequired'];
const CLAIMABLE = ['cardRequired', 'captionRequired', 'unitRequired'];

export function paletteTokens(v) { return { ground: v.defaults?.ground, ink: v.defaults?.ink, lead: v.defaults?.lead || v.defaults?.warm || v.defaults?.accent, second: v.defaults?.second || v.defaults?.cool }; }

export function harmonyErrors(v, params = {}) {
  const e = [], c = v.contract || {}, p = { ...(v.defaults || {}), ...params };
  const g = p.ground, ink = p.ink;
  if (!g || !ink) return [];
  const cr = contrastRatioHex(ink, g);
  const min = c.inkContrastMin || 3;
  if (cr < min) e.push(v.id + ': ink/ground contrast ' + cr + ' under ' + min);
  if (c.maxColouredFamilies && c.maxColouredFamilies > 2) e.push(v.id + ': more than two coloured families');
  const a = p.lead, b = p.second;
  if (a && b) {
    const d = hueDiff(a, b);
    if (c.hueRule === 'analogous' && d > (c.hueMaxDeg || 45)) e.push(v.id + ': analogous hue ' + d + '° over ' + (c.hueMaxDeg || 45));
    if ((c.hueRule === 'complementary' || c.hueRule === 'contrast') && c.hueRangeDeg && (d < c.hueRangeDeg[0] || d > c.hueRangeDeg[1])) e.push(v.id + ': hue ' + d + '° outside ' + c.hueRangeDeg.join('-'));
    const leadCr = contrastRatioHex(a, g);
    if (c.leadGroundContrastMin && leadCr < c.leadGroundContrastMin) e.push(v.id + ': lead/ground contrast ' + leadCr + ' under ' + c.leadGroundContrastMin);
  }
  return e;
}

export function layoutErrors(v, params = {}, gawx) {
  const e = [], p = { ...(v.defaults || {}), ...params }, c = v.contract || {};
  const t = gawx?.typography?.gawx;
  if (!t) return e;
  if (c.sizePctOfHeight && Array.isArray(c.sizePctOfHeight)) {
    const sf = p.sizeFrac;
    if (sf !== undefined && (sf < c.sizePctOfHeight[0] - 0.005 || sf > c.sizePctOfHeight[1] + 0.005)) e.push(v.id + ': sizeFrac ' + sf + ' outside ' + c.sizePctOfHeight.join('-'));
  }
  if (c.marginPct && p.margin !== undefined) {
    if (p.margin < c.marginPct[0] || p.margin > c.marginPct[1]) e.push(v.id + ': margin ' + p.margin + ' outside ' + c.marginPct.join('-'));
  }
  if (c.linesMax && p.lines > c.linesMax) e.push(v.id + ': lines ' + p.lines + ' over ' + c.linesMax);
  if (c.charsMax && p.chars > c.charsMax) e.push(v.id + ': chars ' + p.chars + ' over ' + c.charsMax);
  return e;
}

export function specFor(v, beat = {}) {
  const c = v.contract || {}, sizes = {};
  for (const role of Object.keys(c.sizesMin || {})) sizes[role] = LADDER[role] || 300;
  if (!Object.keys(sizes).length) sizes.sub = 64;
  const roles = [...new Set([...Object.keys(sizes), ...(c.roles || [])])].filter((r) => !c.roles || c.roles.includes(r));
  const ground = v.defaults?.ground, ink = v.defaults?.ink;
  const claim = {};
  for (const k of CLAIMABLE) if (c[k]) claim[k] = true;
  return {
    roles,
    sizes,
    leadEm: c.leadEm ?? 0.15,
    contrastMin: ground && ink ? Math.max(c.contrastMin || 3, contrastRatioHex(ink, ground)) : (c.contrastMin || 3),
    margins: [120],
    chars: String(beat.headline || beat.onScreen?.headline || '').length || 1,
    duration: beat.dur || 5,
    grain: 0.2,
    ...claim,
    sizeFrac: v.defaults?.sizeFrac,
    margin: v.defaults?.margin,
    lines: v.defaults?.lines,
    charsLimit: v.defaults?.chars,
  };
}

export function assignPackaging(pkg, beat, { intent = 'concept', surface = 'any', recent = [], gawx = null } = {}) {
  const chars = String(beat.headline || beat.onScreen?.headline || '').length || 1;
  const allowed = pkg?.selection?.intentToCategories?.[intent] || null;
  const cands = variantsFor(pkg, intent, surface).filter((v) => { if (allowed && !allowed.includes(v.category)) return false;
    const c = v.contract || {};
    if (HARD_FLAGS.some((k) => c[k])) return false;
    if (v.category === 'type-effect' && !beat.scene) return false;
    const numeric = /\d/.test(String(beat.headline || beat.onScreen?.headline || ''));
    if (!numeric && (String(v.id).startsWith('dn-') || String(v.id) === 'gh-number-hero')) return false;
    if (c.maxChars !== undefined && chars > c.maxChars) return false;
    if (c.maxDurSec !== undefined && (beat.dur || 5) > c.maxDurSec) return false;
    return true;
  });
  cands.sort((a, b) => scoreVariant(b, { recent }) - scoreVariant(a, { recent }) || a.id.localeCompare(b.id));
  for (const v of cands) {
    const params = resolveParams(v, {});
    const spec = specFor(v, beat);
    const le = layoutErrors(v, { ...params, chars: spec.chars, lines: params.lines ?? spec.lines }, gawx);
    const errs = contractErrors(v, spec).concat(harmonyErrors(v, params), le);
    if (!errs.length) return { variant: v.id, category: v.category, params, spec };
  }
  return null;
}

export function packagingShotErrors(shot, pkg, bench, gawx) {
  const e = [], p = shot?.design?.packaging;
  if (!p) return ['no packaging assignment'];
  const v = variantById(pkg, p.variant);
  if (!v) return ['unknown packaging variant ' + p.variant];
  e.push(...contractErrors(v, p.spec || {}).map((x) => shot.shotId + ': ' + x));
  e.push(...harmonyErrors(v, p.params || {}).map((x) => shot.shotId + ': ' + x));
  e.push(...layoutErrors(v, { ...(p.params || {}), chars: p.spec?.chars, lines: p.params?.lines ?? p.spec?.lines }, gawx).map((x) => shot.shotId + ': ' + x));
  e.push(...typeCompositionErrors(v, p.spec || {}).map((x) => shot.shotId + ': ' + x));
  return e;
}

export function sequencePackagingErrors(shots, pkg, window = 4) {
  const e = [], ordered = shots.filter((s) => s.design?.packaging).sort((a, b) => String(a.shotId).localeCompare(String(b.shotId), undefined, { numeric: true }));
  for (let i = 0; i < ordered.length; i++) {
    const win = ordered.slice(Math.max(0, i - window + 1), i + 1).map((s) => s.design.packaging.variant);
    if (win.filter((x) => x === ordered[i].design.packaging.variant).length > 2) e.push(ordered[i].shotId + ': packaging variant ' + ordered[i].design.packaging.variant + ' used >2 times in ' + window + ' beats');
  }
  return e;
}


const TYPE_LADDER = [48, 64, 128, 200, 300];
export function typeCompositionErrors(v, spec = {}, opts = {}) {
  if (v?.category !== 'type-effect') return [];
  const e = [], s = spec || {};
  if (!s.scene) e.push(v.id + ': needs a scene (photo/page/3d), not a flat ground');
  const sizes = Object.values(s.sizes || {}).filter((x) => typeof x === 'number');
  if (!sizes.length) e.push(v.id + ': no type sizes');
  for (const size of sizes) { const near = TYPE_LADDER.reduce((a, b) => (Math.abs(b - size) < Math.abs(a - size) ? b : a)); if (Math.abs(size - near) / near > 0.06) e.push(v.id + ': size ' + size + ' is not on the 5-step ladder'); }
  if (sizes.filter((x) => x >= 282).length > 1) e.push(v.id + ': more than one hero');
  const levels = [...new Set(sizes)].sort((a, b) => b - a);
  if (levels.length > 3) e.push(v.id + ': more than three type levels');
  for (let i = 1; i < levels.length; i++) if (levels[i-1] / levels[i] < 1.5) e.push(v.id + ': levels ' + levels[i-1] + '/' + levels[i] + ' under 1.5x');
  const margin = (s.margins && s.margins[0]) ?? 0;
  if (margin < 120) e.push(v.id + ': margin ' + margin + ' under the 120 grid');
  if (s.effectCount && s.effectCount > 1) e.push(v.id + ': more than one type effect');
  if (s.fillContrast !== undefined && s.fillContrast < 4.5) e.push(v.id + ': fill/ground contrast ' + s.fillContrast + ' under 4.5');
  if ((v.id === 'te-image-fill' || v.id === 'te-knockout-window') && s.fillContrast === undefined) e.push(v.id + ': fillContrast must be measured before render');
  return e;
}


export const pairingPath = (dataDir) => path.join(dataDir, 'routing', 'type-image-pairing.json');
export function loadPairing(dataDir) {
  const f = pairingPath(dataDir); if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}
export function pairingErrors(doc, spec = {}) {
  const e = [], p = doc?.pairings?.find((x) => x.id === spec.pairing);
  if (!p) return ['pairing: unknown or missing pairing id'];
  if (spec.register && p.register !== spec.register) e.push('pairing ' + p.id + ': register ' + spec.register + ' is not ' + p.register);
  if (spec.face && !(p.faces || []).includes(spec.face)) e.push('pairing ' + p.id + ': face ' + spec.face + ' not for this register');
  if (spec.size && spec.size > p.sizeCap) e.push('pairing ' + p.id + ': size ' + spec.size + ' over cap ' + p.sizeCap);
  if (spec.placement && !(p.placement || []).includes(spec.placement)) e.push('pairing ' + p.id + ': placement ' + spec.placement + ' not allowed');
  if (spec.effect === 'black-scrim') e.push('pairing ' + p.id + ': black scrim is not a scene');
  if (spec.accentCount > 1) e.push('pairing ' + p.id + ': more than one accent');
  if (p.requires?.headlineVisible && spec.headlineVisible !== true) e.push('pairing ' + p.id + ': evidence headline must be visible');
  if (p.requires?.sourceLine && spec.sourceLine !== true) e.push('pairing ' + p.id + ': source line missing');
  if (p.requires?.dateLine && spec.dateLine !== true && spec.date !== true) e.push('pairing ' + p.id + ': date missing');
  if (p.requires?.sceneDetailMax !== undefined && spec.sceneDetail > p.requires.sceneDetailMax) e.push('pairing ' + p.id + ': scene too busy for this type');
  if (p.requires?.occlusionMin !== undefined) {
    const o = spec.occlusion;
    if (typeof o !== 'number' || o < p.requires.occlusionMin || o > p.requires.occlusionMax) e.push('pairing ' + p.id + ': occlusion must be ' + p.requires.occlusionMin + '-' + p.requires.occlusionMax);
  }
  if (spec.faceBox && spec.typeBox && p.register === 'person') {
    const overlap = !(spec.typeBox.x2 < spec.faceBox.x1 || spec.typeBox.x1 > spec.faceBox.x2 || spec.typeBox.y2 < spec.faceBox.y1 || spec.typeBox.y1 > spec.faceBox.y2);
    if (overlap) e.push('pairing ' + p.id + ': type overlaps the face');
  }
  if (spec.effectCount && spec.effectCount > (p.requires?.effectCount || 1)) e.push('pairing ' + p.id + ': more than one effect');
  return e;
}


export function compositeErrors(spec = {}) {
  const e = [];
  if (spec.pairing !== 'tip-object-behind') return [];
  if (spec.hardMatte !== true) e.push('composite: subject matte must be hard (interior opaque)');
  if (spec.backgroundSource && spec.subjectSource && spec.backgroundSource === spec.subjectSource) e.push('composite: background must not be the same photo as the subject');
  if (!(spec.backgroundScale >= 1.8)) e.push('composite: background scale ' + spec.backgroundScale + ' under 1.8x');
  if (!(spec.backgroundBlur >= 12)) e.push('composite: background blur ' + spec.backgroundBlur + ' under 12px');
  if (!(spec.backgroundBrightness <= 0.12)) e.push('composite: background brightness ' + spec.backgroundBrightness + ' over 0.12');
  if (spec.blackScrim) e.push('composite: black scrim is not a scene');
  if (!(spec.coverage >= 0.25 && spec.coverage <= 0.35)) e.push('composite: subject covers ' + spec.coverage + ' of type ink, need 0.25-0.35');
  const vis = spec.glyphVisible || [];
  if (vis.length && Math.min(...vis) < 0.65) e.push('composite: a glyph is under 65% visible');
  if (typeof spec.keepWholeGlyph === 'number' && (vis[spec.keepWholeGlyph] ?? 0) < 0.96) e.push('composite: glyph ' + spec.keepWholeGlyph + ' must stay whole (>=0.96)');
  if (spec.inkInsideSubject > 0) e.push('composite: ' + spec.inkInsideSubject + ' ink pixels inside the subject (bleed)');
  if (spec.lightMatch === false) e.push('composite: type light does not match the subject key');
  return e;
}

export function invariants(pkg) { return pkg?.invariants || null; }

export function allVariants(pkg) {
  const out = [];
  for (const c of pkg?.categories || []) for (const v of c.variants || []) out.push({ ...v, category: c.id, categoryLabel: c.label });
  return out;
}

export function variantById(pkg, id) { return allVariants(pkg).find((v) => v.id === id) || null; }

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
function paramErrors(variant, where) {
  const e = [], params = variant.params || {}, defs = variant.defaults || {};
  for (const [k, d] of Object.entries(params)) {
    if (d.enum) { if (!Array.isArray(d.enum) || !d.enum.length) e.push(where + ': param ' + k + ' enum empty'); }
    else if (d.type === 'bool') { /* boolean */ }
    else if (d.type === 'string') { /* any string */ }
    else if (d.type === 'int' || (d.min !== undefined || d.max !== undefined)) {
      if (!isNum(d.min) || !isNum(d.max) || d.min > d.max) e.push(where + ': param ' + k + ' needs min<=max');
    }
    const def = defs[k];
    if (def === undefined) { e.push(where + ': param ' + k + ' has no default'); continue; }
    if (d.enum && !d.enum.includes(def)) e.push(where + ': default ' + k + ' not in enum');
    if (d.type === 'bool' && typeof def !== 'boolean') e.push(where + ': default ' + k + ' must be boolean');
    if ((d.type === 'int' || d.type === 'number') && !isNum(def)) e.push(where + ': default ' + k + ' must be numeric');
    if (isNum(d.min) && isNum(def) && def < d.min) e.push(where + ': default ' + k + ' below min');
    if (isNum(d.max) && isNum(def) && def > d.max) e.push(where + ': default ' + k + ' above max');
  }
  for (const k of Object.keys(defs)) if (!params[k]) e.push(where + ': default ' + k + ' has no param definition');
  return e;
}

export function packagingErrors(pkg) {
  const e = [];
  if (!pkg) return ['taxonomy missing'];
  if (pkg.contract !== 'A1PackagingTaxonomy/v1') e.push('contract must be A1PackagingTaxonomy/v1');
  const inv = pkg.invariants || {};
  for (const k of ['grid', 'safeFrame', 'typeLadder', 'roleRatioMin', 'leadEm', 'contrastMin', 'dressBans', 'motionBudget', 'variantRepeatWindowBeats']) if (inv[k] === undefined) e.push('invariants.' + k + ' missing');
  if (!Array.isArray(inv.typeLadder) || inv.typeLadder.join(',') !== '300,200,128,64,48') e.push('typeLadder must be 300/200/128/64/48');
  if (!Array.isArray(inv.dressBans) || !inv.dressBans.includes('text-shadow')) e.push('dressBans must forbid text-shadow');
  if (!(inv.roleRatioMin >= 1.5)) e.push('roleRatioMin must be >= 1.5');
  const ids = new Set(), cats = new Set(), codes = new Set();
  for (const c of pkg.categories || []) {
    if (!c.id || cats.has(c.id)) e.push('category id missing/dup: ' + c.id); cats.add(c.id);
    if (!c.label) e.push('category ' + c.id + ' needs label');
    if (!Array.isArray(c.variants) || !c.variants.length) { e.push('category ' + c.id + ' has no variants'); continue; }
    for (const v of c.variants) {
      const w = c.id + '/' + (v.id || '?');
      if (!v.id || ids.has(v.id)) e.push('variant id missing/dup: ' + v.id); ids.add(v.id);
      if (!violatesSurface(v.surface, inv.surfaceKinds)) e.push(w + ': surface not in invariants.surfaceKinds');
      if (!Array.isArray(v.appliesTo) || !v.appliesTo.length) e.push(w + ': appliesTo empty');
      if (!v.contract || typeof v.contract !== 'object') e.push(w + ': contract missing');
      if (!Array.isArray(v.failureModes) || !v.failureModes.length) e.push(w + ': failureModes missing');
      if (!Array.isArray(v.checks) || !v.checks.length) e.push(w + ': checks missing');
      if (!v.refs || !v.refs.frames || !v.refs.frames.length || !v.refs.ranges) e.push(w + ': refs need frames + ranges');
      e.push(...paramErrors(v, w));
      if (/outline|shadow|glow/.test(JSON.stringify(v.contract))) e.push(w + ': contract must not ask for dress');
    }
  }
  for (const c of pkg.categories || []) for (const v of c.variants || []) for (const code of v.checks || []) codes.add(code);
  return e;
}
function violatesSurface(surface, allowed) { return !surface || surface === 'any' || (allowed || []).includes(surface); }
function surfaceMatches(requested, variantSurface) { if (!requested || requested === 'any') return true; return !variantSurface || variantSurface === 'any' || variantSurface === requested; }

export function resolveParams(v, overrides = {}) {
  const out = { ...(v.defaults || {}) };
  for (const [k, val] of Object.entries(overrides || {})) {
    const d = v.params?.[k]; if (!d) continue;
    if (d.enum) { if (d.enum.includes(val)) out[k] = val; }
    else if (d.type === 'bool') { if (typeof val === 'boolean') out[k] = val; }
    else if (d.type === 'string') { if (typeof val === 'string') out[k] = val; }
    else if (isNum(val)) { if ((d.min === undefined || val >= d.min) && (d.max === undefined || val <= d.max)) out[k] = val; }
  }
  return out;
}

export function variantsFor(pkg, intent, surface = 'any') {
  return allVariants(pkg).filter((v) => (v.appliesTo || []).includes(intent) || (v.appliesTo || []).includes('any')).filter((v) => surfaceMatches(surface, v.surface));
}

export function scoreVariant(v, { palette = null, recent = [] } = {}) {
  let s = 10;
  if (palette && v.params?.palette?.enum?.includes(palette)) s += 1;
  const used = recent.filter((x) => x === v.id).length;
  if (used >= 2) return -1;
  s -= used * 3;
  return s;
}

export function pickVariants(pkg, { intent, surface = 'any', palette = null, recent = [], count = 3 } = {}) {
  const allowedCats = pkg?.selection?.intentToCategories?.[intent] || null;
  const cands = variantsFor(pkg, intent, surface).filter((v) => !allowedCats || allowedCats.includes(v.category)).map((v) => ({ v, score: scoreVariant(v, { palette, recent }) })).filter((x) => x.score >= 0);
  cands.sort((a, b) => b.score - a.score || a.v.id.localeCompare(b.v.id));
  // round-robin over categories: a pick for one beat should cover layout + colour + type, not four of one kind
  const byCat = new Map();
  for (const x of cands) { if (!byCat.has(x.v.category)) byCat.set(x.v.category, []); byCat.get(x.v.category).push(x); }
  const order = [...byCat.keys()].sort((a, b) => (byCat.get(b)[0]?.score || 0) - (byCat.get(a)[0]?.score || 0) || a.localeCompare(b));
  const picked = [];
  for (let round = 0; picked.length < count && round < 2; round++) for (const cat of order) {
    const list = byCat.get(cat) || [];
    if (list.length <= round) continue;
    const x = list[round]; if (!x || picked.includes(x.v.id)) continue;
    picked.push(x.v.id);
    if (picked.length >= count) break;
  }
  return picked;
}

export function contractErrors(v, spec = {}) {
  const e = [], c = v.contract || {};
  const roles = spec.roles || [];
  if (c.roles && roles.some((r) => !c.roles.includes(r))) e.push(v.id + ': role outside contract ' + JSON.stringify(roles));
  for (const [role, min] of Object.entries(c.sizesMin || {})) {
    const got = (spec.sizes || {})[role];
    if (got === undefined) e.push(v.id + ': missing role size ' + role);
    else if (got < min) e.push(v.id + ': ' + role + ' ' + got + 'px under ' + min + 'px');
  }
  if (c.leadEm !== undefined && isNum(spec.leadEm) && Math.abs(spec.leadEm - c.leadEm) > 0.03) e.push(v.id + ': lead ' + spec.leadEm + 'em outside ' + c.leadEm + '±0.03');
  if (c.contrastMin !== undefined && isNum(spec.contrastMin) && spec.contrastMin < c.contrastMin) e.push(v.id + ': contrast ' + spec.contrastMin + ' under ' + c.contrastMin);
  if (c.marginPx !== undefined && Array.isArray(spec.margins)) for (const m of spec.margins) if (m < c.marginPx) e.push(v.id + ': margin ' + m + 'px under ' + c.marginPx + 'px');
  if (c.maxChars !== undefined && isNum(spec.chars) && spec.chars > c.maxChars) e.push(v.id + ': ' + spec.chars + ' chars over ' + c.maxChars);
  if (c.grainMin !== undefined && isNum(spec.grain) && spec.grain < c.grainMin) e.push(v.id + ': grain ' + spec.grain + ' under ' + c.grainMin);
  if (c.maxDurSec !== undefined && isNum(spec.duration) && spec.duration > c.maxDurSec) e.push(v.id + ': duration ' + spec.duration + 's over ' + c.maxDurSec);
  for (const k of ['cardRequired', 'captionRequired', 'unitRequired', 'twoNumbersRequired', 'leaderRequired', 'axisRequired', 'knockout', 'screenSafe', 'occlusionRequired', 'scrimRequired', 'bandMustClearCard', 'bandMustBeFlat']) if (c[k] && !spec[k]) e.push(v.id + ': ' + k + ' not met');
  return e;
}
