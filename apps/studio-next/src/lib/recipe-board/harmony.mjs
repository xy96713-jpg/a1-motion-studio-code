// Harmony: one film, several looks, one ink set (routing/style-library.json, DESIGN-harmony.md).
// - styleFor: the ink set and families a film uses, and which family each shot gets
// - inksOf: a family's print process with the film's inks filled in (for inkprint.mjs)
// - measure: the colour facts of a still (value range, colour area, ink drift) that the rules are written in
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export function loadLibrary(cfg) {
  return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'style-library.json'), 'utf8'));
}

export function inksOf(lib, inkSet, family) {
  const set = lib.inkSets[inkSet], fam = lib.families[family];
  if (!set) throw new Error(`unknown ink set ${inkSet}`);
  if (!fam) throw new Error(`unknown family ${family}`);
  // a 3D family is not printed: it stands on its material and light (DESIGN-harmony.md, 3D)
  if (!fam.process) return null;
  // on a dark-base family the paper is the dark colour; a set that is already dark keeps its order
  const dark = fam.base === 'dark' && lightness(set.paper) > 50;
  const role = (r) => (dark && r === 'paper' ? set.ink : dark && r === 'ink' ? set.paper : set[r] || set.accent);
  // dots and dither put ink where the image is dark and leave the base where it is light. On a dark base a
  // plate with a dark background is printed as a negative, decided from its border ('auto'); screen print
  // maps each colour to its nearest ink and needs no flip
  const negative = fam.base === 'dark' && fam.process.process !== 'screen' ? 'auto' : false;
  return { ...fam.process, inks: fam.process.inks.map(role), negative };
}

export function refsOf(cfg, lib, family) {
  return (lib.families[family]?.refs || []).map((f) => path.join(cfg.dataDir, lib.refsDir, f)).filter((f) => fs.existsSync(f));
}

// family per shot: the first family the film uses that fits the shot's treatment, with two limits:
// a chapter-mark family (poster, metaphor illustration) never twice in a row, and no family more than
// sameFamilyRunMax shots running. A shot whose treatment no family fits keeps the theme's own look (null).
export function styleFor(shots, lib, { families }) {
  const { sameFamilyRunMax = 3, chapterMarkFamilies = [] } = lib.harmony || {};
  const out = {};
  let prev = null, run = 0;
  for (const s of shots) {
    const fits = families.filter((f) => (lib.families[f]?.fits || []).includes(s.treatment));
    const ok = fits.filter((f) => !(f === prev && (run >= sameFamilyRunMax || chapterMarkFamilies.includes(f))));
    const pick = ok[0] || null;
    out[s.shotId] = pick;
    run = pick && pick === prev ? run + 1 : 1;
    prev = pick;
  }
  return out;
}

const toLin = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
function lab(r, g, b) {
  const [R, G, B] = [toLin(r), toLin(g), toLin(b)];
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const x = t((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), y = t(0.2126 * R + 0.7152 * G + 0.0722 * B), z = t((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const hexLab = (h) => lab(...[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const lightness = (h) => hexLab(h)[0];

// value range (L* 5th-95th percentile), colour area (share with chroma > 30), and ink drift: the share of
// pixels further than inkDeltaMax from every ink of the set (only meaningful on designed frames)
export async function measure(png, lib, inkSet) {
  const { data, info } = await sharp(png).resize(240, 135, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const set = lib.inkSets[inkSet];
  // the inks, and every two inks printed over each other (transparent inks multiply)
  const hexes = set ? Object.values(set).filter((v) => typeof v === 'string' && v.startsWith('#')) : [];
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const over = hexes.slice(1).flatMap((a, i) => hexes.slice(i + 2).map((b) => lab(...rgb(a).map((v, j) => (v * rgb(b)[j]) / 255))));
  const inks = [...hexes.map(hexLab), ...over];
  const max = lib.harmony?.inkDeltaMax ?? 14;
  const Ls = [];
  let chroma = 0, off = 0;
  const n = info.width * info.height;
  for (let p = 0; p < n; p++) {
    const q = lab(data[p * 3], data[p * 3 + 1], data[p * 3 + 2]);
    Ls.push(q[0]);
    if (Math.hypot(q[1], q[2]) > 30) chroma++;
    // tints of an ink (ink laid thin over paper) count as that ink: distance to the paper-ink line
    if (inks.length && !inks.some((k) => segDist(q, inks[0], k) < max)) off++;
  }
  Ls.sort((a, b) => a - b);
  return {
    valueRange: +(Ls[Math.floor(n * 0.95)] - Ls[Math.floor(n * 0.05)]).toFixed(1),
    chromaShare: +(chroma / n).toFixed(3),
    offInk: inks.length ? +(off / n).toFixed(3) : null,
  };
}

function segDist(q, a, b) {
  const ab = b.map((v, i) => v - a[i]), aq = q.map((v, i) => v - a[i]);
  const len = ab.reduce((s, v) => s + v * v, 0) || 1;
  const t = Math.max(0, Math.min(1, aq.reduce((s, v, i) => s + v * ab[i], 0) / len));
  return Math.hypot(...q.map((v, i) => v - (a[i] + t * ab[i])));
}

// the rules, as findings on a measured still
export function harmonyIssues(m, lib) {
  const h = lib.harmony || {};
  const out = [];
  if (m.valueRange < (h.valueRangeMin ?? 55)) out.push(`flat-values(${m.valueRange})`);
  if (m.chromaShare > (h.chromaShareMax ?? 0.35)) out.push(`too-much-colour(${m.chromaShare})`);
  if (m.offInk != null && m.offInk > (h.offInkMax ?? 0.15)) out.push(`off-ink(${m.offInk})`);
  return out;
}
