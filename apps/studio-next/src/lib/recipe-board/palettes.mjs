// A film's colour, palette by palette (2026-10-28, the user: 可以各种配色 但要和谐 比如 gawx 会用些胶片感的红 黄 蓝等等
// 还有字体颜色也是的多样性 … 不能硬做 要变通). The house had read Gawx frame by frame (mostly neutral, one family) and
// made every film neutral dark with one red; measured across whole films (style-lab/tools/palette-arc.py), Gawx stays
// dark four frames in five but carries a lead colour in 56-88 % of them, three to five families taking turns every few
// seconds, a coloured ground in 12-30 %. Suez came out at 6 %, one family, no coloured ground.
// routing/palettes.json: film palettes (a ground, a key, an accent, the type's inks, a light), the harmony they keep and
// the film's floors. The film's design names a palette per beat (filmdesign: palette); the colour script takes the
// beat's ground and inks from it; the white model is measured for monotony (filmColourErrors).
import fs from 'node:fs';
import path from 'node:path';
import { toOklch, contrast } from './designbrain.mjs';

export const loadPalettes = (cfg) => JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'palettes.json'), 'utf8'));
// (pure, tested) a colour that reads dirty: a warm hue, in the dark, of a low chroma (between a neutral and a colour)
export const muddy = (hex) => { const c = toOklch(hex); return c.L < 0.5 && c.C >= 0.012 && c.C < 0.04 && c.h >= 20 && c.h <= 100; };
export const coloured = (hex) => toOklch(hex).C >= 0.04;
// (pure, tested) the library keeps its own harmony: no dirty ground, the inks legible on their ground
export function paletteErrors(lib) {
  const e = [];
  for (const p of lib?.palettes || []) {
    if (muddy(p.ground)) e.push(`${p.id}: its ground ${p.ground} reads dirty (a warm hue, dark, of low chroma): neutral (C < 0.012) or a clear colour (C ≥ 0.04)`);
    for (const ink of p.inks || []) if (contrast(ink, p.ground) < 4.5 && ink !== p.inks[1]) e.push(`${p.id}: ink ${ink} on ${p.ground} is ${contrast(ink, p.ground).toFixed(1)}:1 (4.5 at least)`);
    if (contrast(p.inks[0], p.ground) < 4.5) e.push(`${p.id}: its first ink ${p.inks[0]} on ${p.ground} is ${contrast(p.inks[0], p.ground).toFixed(1)}:1 (4.5 at least)`);
  }
  return e;
}
// (pure, tested) the film's palettes: a name the library has (an error otherwise). How many, how much of the neutral dark,
// how long one holds, how many coloured grounds are notes for the director and the film's review, never a quota (the user
// 2026-10-28: 对 但是要合适 要客观设计 不要为了做而做 硬塞 导演要知道这些): a palette is chosen for what the beat says
export function filmPaletteErrors(rows, lib) {
  const ids = new Set((lib?.palettes || []).map((p) => p.id)), e = [];
  for (const r of rows || []) if (!ids.has(r.palette)) e.push(`film.${r.beat}.palette: one of ${[...ids].join(', ')}`);
  return e;
}
export function filmPaletteNotes(rows, lib) {
  const F = lib?.film || {}, out = [];
  if (!rows?.length || filmPaletteErrors(rows, lib).length) return out;
  const n = rows.length, used = new Set(rows.map((r) => r.palette)), by = Object.fromEntries((lib.palettes || []).map((p) => [p.id, p]));
  if (n >= 6 && used.size < (F.palettesMin || 3)) out.push(`film: ${used.size} palette${used.size === 1 ? '' : 's'} for ${n} beats (Gawx turns 3-5 families across a film): if the story turns, let the colour turn with it`);
  const noir = rows.filter((r) => r.palette === 'noir').length / n;
  if (n >= 6 && noir > (F.noirMaxShare ?? 0.5)) out.push(`film: ${Math.round(noir * 100)} % of its beats on the neutral dark (the film read grey, 2026-10-28)`);
  let run = 1; for (let i = 1; i < n; i++) { run = rows[i].palette === rows[i - 1].palette ? run + 1 : 1; if (run === (F.sameRunMax || 4) + 1) out.push(`film: ${rows[i - (F.sameRunMax || 4)].beat}–${rows[i].beat} hold one palette (${rows[i].palette}) for ${run} beats`); }
  const groundCol = rows.filter((r) => by[r.palette] && coloured(by[r.palette].ground)).length / n;
  if (n >= 6 && groundCol < (F.colouredGroundMin ?? 0.15)) out.push(`film: ${Math.round(groundCol * 100)} % of its beats on a coloured ground (Gawx 12-30 % of its frames)`);
  return out;
}
// (pure) a beat's colour from its palette: the ground, the type's inks, the accent and the light (filmdesign colourScript)
export function beatColour(r, lib) {
  const p = (lib?.palettes || []).find((x) => x.id === r.palette); if (!p) return null;
  return { beat: r.beat, palette: p.id, ground: p.ground, key: p.key, ink: p.inks[0], ink2: p.inks[1] || null, accent: p.accent, light: p.light, temper: p.light };
}
// (pure, tested) the white model measured for monotony (palette-arc.py on out/animatic.mp4): a lead colour in too few
// frames, or too few families across the film (Gawx 56-88 % of frames, 3-5 families; the floor below them)
// Compatibility API: these measurements diagnose style, not objective failure.
// Production consumers deliver filmColourNotes through the existing notes channel.
export function filmColourErrors(m, lib) { return []; }
export function filmColourNotes(m, lib) {
  const F = lib?.film?.measured; if (!m || !F || !m.frames) return [];
  const e = [];
  if (m.leadFrames < F.leadFramesMin) e.push(`film: a lead colour in ${Math.round(m.leadFrames * 100)} % of its frames (${Math.round(F.leadFramesMin * 100)} % or more; Gawx 56–88 %): the colour is in the light, on the things and on the cards, not only a red dot`);
  if (m.familiesOver5pct < F.familiesMin) e.push(`film: ${m.familiesOver5pct} famil${m.familiesOver5pct === 1 ? 'y' : 'ies'} of colour across it (${F.familiesMin} or more; Gawx 3–5): the palettes take turns`);
  return e.map((note) => `review only (not a quota): ${note}`);
}
