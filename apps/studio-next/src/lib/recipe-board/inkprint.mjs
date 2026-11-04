// Ink print: put an image through a print process using only the episode's inks (routing/style-library.json).
// This is what makes several looks sit in one film: every family prints with the same few inks on the same
// paper, only the process changes (flat screen print, halftone, dither, two-ink riso). It also takes the
// generated look out of a plate: smooth gradients and glossy light become flat ink, dots and grain.
import sharp from 'sharp';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function lab([r, g, b]) {
  const f = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * t(y) - 16, 500 * (t(x) - t(y)), 200 * (t(y) - t(z))];
}

// seeded noise so the same plate always prints the same grain (still caches stay pixel-identical)
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const lum = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;

// screen print: every pixel becomes the nearest ink (in Lab, lightness weighted so value structure holds),
// speckles are cleaned with a mode filter, each ink layer is slightly off register
function screen(d, w, h, inks, { register = 3, seed = 7 } = {}) {
  const L = inks.map((c) => lab(hex(c)));
  const label = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const q = lab([d[p * 4], d[p * 4 + 1], d[p * 4 + 2]]);
    let best = 0, bd = Infinity;
    for (let k = 0; k < L.length; k++) {
      const dl = (q[0] - L[k][0]) * 1.6, da = q[1] - L[k][1], db = q[2] - L[k][2];
      const dd = dl * dl + da * da + db * db;
      if (dd < bd) { bd = dd; best = k; }
    }
    label[p] = best;
  }
  const clean = new Uint8Array(label);
  const count = new Uint16Array(inks.length);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    count.fill(0);
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) count[label[(y + j) * w + x + i]]++;
    let m = label[y * w + x];
    for (let k = 0; k < inks.length; k++) if (count[k] > count[m]) m = k;
    clean[y * w + x] = m;
  }
  const r = rng(seed);
  const shift = inks.map((_, k) => (k === 0 ? [0, 0] : [Math.round((r() - 0.5) * 2 * register), Math.round((r() - 0.5) * 2 * register)]));
  const rgb = inks.map(hex);
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 3;
    // paper (ink 0) underneath, then each ink's layer read at its own offset; overlapping inks multiply
    let c = [...rgb[0]];
    for (let k = 1; k < inks.length; k++) {
      const sx = Math.min(w - 1, Math.max(0, x - shift[k][0])), sy = Math.min(h - 1, Math.max(0, y - shift[k][1]));
      if (clean[sy * w + sx] === k) c = c.map((v, i) => (v * rgb[k][i]) / 255);
    }
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  }
  return out;
}

// halftone: one ink on paper, round dots on a rotated grid, dot area = darkness
function halftone(d, w, h, [paper, ink], { cell = 9, angle = 45, gamma = 1 } = {}) {
  const P = hex(paper), I = hex(ink), out = Buffer.alloc(w * h * 3);
  const a = (angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x * ca + y * sa, v = -x * sa + y * ca;
    const cu = (Math.floor(u / cell) + 0.5) * cell, cv = (Math.floor(v / cell) + 0.5) * cell;
    const sx = Math.round(cu * ca - cv * sa), sy = Math.round(cu * sa + cv * ca);
    const i = (Math.min(h - 1, Math.max(0, sy)) * w + Math.min(w - 1, Math.max(0, sx))) * 4;
    const dark = (1 - lum(d, i)) ** gamma;
    const rad = Math.sqrt(dark / Math.PI) * cell * 1.08;
    const on = Math.hypot(u - cu, v - cv) < rad;
    const c = on ? I : P, o = (y * w + x) * 3;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  }
  return out;
}

// Atkinson dither to two inks (the classic Mac look), on a coarse pixel grid
function dither(d, w, h, [paper, ink], { pixel = 3 } = {}) {
  const gw = Math.ceil(w / pixel), gh = Math.ceil(h / pixel), g = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = lum(d, (Math.min(h - 1, y * pixel) * w + Math.min(w - 1, x * pixel)) * 4);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const p = y * gw + x, old = g[p], nv = old > 0.5 ? 1 : 0, e = (old - nv) / 8;
    g[p] = nv;
    for (const [dx, dy] of [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) if (x + dx >= 0 && x + dx < gw && y + dy < gh) g[(y + dy) * gw + x + dx] += e;
  }
  const P = hex(paper), I = hex(ink), out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = g[Math.floor(y / pixel) * gw + Math.floor(x / pixel)] ? P : I, o = (y * w + x) * 3;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  }
  return out;
}

// two-ink riso: shadows in the dark ink, midtones in the colour ink, each its own screen angle, off register
function riso(d, w, h, [paper, dark, colour], { cell = 7, register = 4 } = {}) {
  const P = hex(paper), D = hex(dark), C = hex(colour), out = Buffer.alloc(w * h * 3);
  const layer = (x, y, ang, tone) => {
    const a = (ang * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const u = x * ca + y * sa, v = -x * sa + y * ca;
    const cu = (Math.floor(u / cell) + 0.5) * cell, cv = (Math.floor(v / cell) + 0.5) * cell;
    const sx = Math.min(w - 1, Math.max(0, Math.round(cu * ca - cv * sa))), sy = Math.min(h - 1, Math.max(0, Math.round(cu * sa + cv * ca)));
    const t = tone(lum(d, (sy * w + sx) * 4));
    return Math.hypot(u - cu, v - cv) < Math.sqrt(t / Math.PI) * cell * 1.08;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = [...P];
    if (layer(x + register, y, 15, (l) => Math.max(0, Math.min(1, (0.85 - l) / 0.6)))) c = c.map((v, i) => (v * C[i]) / 255);
    if (layer(x, y, 75, (l) => Math.max(0, Math.min(1, (0.45 - l) / 0.45)) ** 1.2)) c = c.map((v, i) => (v * D[i]) / 255);
    const o = (y * w + x) * 3;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  }
  return out;
}

// mean lightness of the outer 8% of the frame (transparent pixels count as missing)
async function borderLuma(input) {
  const { data, info } = await sharp(input).resize(64, 64, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0, n = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (x > 5 && x < info.width - 6 && y > 5 && y < info.height - 6) continue;
    const i = (y * info.width + x) * 4;
    if (data[i + 3] < 128) continue;
    sum += lum(data, i); n++;
  }
  return n ? sum / n : 1;
}

export const PROCESSES = { screen, halftone, dither, riso };

// paper grain over every process, so all looks share one surface
function grain(buf, w, h, amount, seed) {
  if (!amount) return buf;
  const r = rng(seed);
  for (let p = 0; p < w * h; p++) {
    const n = (r() - 0.5) * 2 * amount * 255;
    for (let i = 0; i < 3; i++) buf[p * 3 + i] = Math.max(0, Math.min(255, buf[p * 3 + i] + n));
  }
  return buf;
}

// inkPrint(input, output, { process, inks, width, negative, ...options }): inks[0] is the paper (the base).
// A cut-out prop keeps its outline: it is printed over the paper colour and its alpha put back after.
// negative: print the light parts in ink. 'auto' (dark-base families) flips only a plate whose own background
// (its border) is dark, so the background always lands on the base colour and the subject takes the ink
export async function inkPrint(input, output, { process = 'screen', inks, width = 1920, blur = 1.2, grainAmount = 0.035, seed = 7, negative = false, ...opt }) {
  if (!PROCESSES[process]) throw new Error(`unknown print process ${process}`);
  if (!inks?.length) throw new Error('inkPrint needs inks (paper first)');
  if (negative === 'auto') negative = (await borderLuma(input)) < 0.5;
  const meta = await sharp(input).metadata();
  const cut = meta.hasAlpha;
  const base = sharp(input).resize({ width, withoutEnlargement: false });
  const alpha = cut ? await base.clone().ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true }) : null;
  let img = cut ? base.clone().flatten({ background: negative ? '#000000' : '#ffffff' }) : base.clone().removeAlpha();
  if (blur) img = img.blur(blur);
  if (negative) img = img.negate({ alpha: false });
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgb = grain(PROCESSES[process](data, info.width, info.height, inks, { seed, ...opt }), info.width, info.height, grainAmount, seed);
  const raw = { width: info.width, height: info.height, channels: 3 };
  if (!cut) { await sharp(rgb, { raw }).png().toFile(output); return output; }
  await sharp(rgb, { raw }).joinChannel(alpha.data, { raw: { width: alpha.info.width, height: alpha.info.height, channels: 1 } }).png().toFile(output);
  return output;
}
