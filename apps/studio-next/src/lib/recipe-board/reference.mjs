// The reference film, beat by beat (user, 2026-10-21: 对着原片写分镜，禁止塞空镜). project.json reference.beats names a
// folder of one strip per beat (<beat>.jpg: five frames over the seconds the original says that line, matched by its
// burned-in subtitles); beside it beats-text.json holds what the original sets on screen there, above its subtitles
// (Vision OCR of those seconds). The storyboard and every chapter see the strip; the storyboard check reads the text.
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths } from './store.mjs';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// { beat: { strip, text, chars } } (empty when the project has no reference beats)
export function referenceBeats(cfg, id) {
  const project = readJson(path.join(projectPaths(cfg, id).root, 'project.json'), {}), dir = project.reference?.beats;
  if (!dir) return {};
  const root = path.isAbsolute(dir) ? dir : path.join(cfg.repoRoot, dir);
  const text = readJson(path.join(root, '..', 'beats-text.json'), {});
  const out = {};
  for (const f of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const m = f.match(/^(B\d+)\.jpg$/); if (!m) continue;
    out[m[1]] = { strip: path.join(root, f), text: text[m[1]]?.text || '', chars: text[m[1]]?.chars ?? null };
  }
  return out;
}

// Where the original shows information (on-screen text, labels, data: ORIGINAL_INFO characters or more), a beat may not
// stand on an empty stock shot (paperclip-138-full: four "西北居民街巷空镜" beats, B05 B06 B21 B38, where the original
// showed the evidence board and its title card, the four letters, newspaper clippings and a title card). An empty
// shot stays possible where the original is one too.
export const ORIGINAL_INFO = 6;
const EMPTY_CARDS = new Set(['footage-plate', 'title-hero-over-photo']);
export function emptyShotErrors(shots, ref, { min = ORIGINAL_INFO } = {}) {
  const errors = [];
  for (const s of shots || []) {
    const o = ref[s.beat]; if (!o || o.chars == null || o.chars < min) continue;
    const stock = (s.evidence || []).filter((e) => e.kind === 'stock');
    if (!stock.length || !(EMPTY_CARDS.has(s.card) || (s.evidence || []).every((e) => e.kind === 'stock'))) continue;
    errors.push(`${s.beat}: an empty stock shot (${stock.map((e) => e.what).join('；').slice(0, 40)}) where the original shows information ("${o.text.slice(0, 40)}…"): show what it shows there, in the same kind of means (the evidence, the document, a title card, a diagram), not a place to rest on`);
  }
  return errors;
}

// The same at the writer's level: a picture slot described as an empty place (空镜, a street, a landscape) where the
// original shows information (paperclip-138-full: the storyboard said 不用空镜 for B05 B06 B38 and the writer still
// filled their backdrops with 西北小城居民街巷空镜). shots: [{ beatId, slots }] (slots parsed).
export const EMPTY_SCENE = /空镜|街巷|小巷|街道|街景|风景|居民区|小城.{0,6}(街|巷)/;
export function emptyBackdropErrors(shots, ref, { min = ORIGINAL_INFO } = {}) {
  const errors = [];
  for (const s of shots || []) {
    const o = ref[s.beatId]; if (!o || o.chars == null || o.chars < min) continue;
    for (const [slot, v] of Object.entries(s.slots || {})) if (v && typeof v === 'object' && EMPTY_SCENE.test(String(v.gen || ''))) errors.push(`${s.beatId}: ${slot} is an empty place ("${String(v.gen).slice(0, 30)}") where the original shows information ("${o.text.slice(0, 30)}…"): draw what the storyboard asks for instead`);
  }
  return errors;
}

// where the reference cuts, and when it says each beat: { cuts: [film seconds], times: { beat: [from, to] } } from
// cuts.txt and beat-times.json beside the beats folder (empty when there is no reference)
export function referenceTiming(cfg, id) {
  const project = readJson(path.join(projectPaths(cfg, id).root, 'project.json'), {}), dir = project.reference?.beats;
  if (!dir) return { cuts: [], times: {} };
  const root = path.dirname(path.isAbsolute(dir) ? dir : path.join(cfg.repoRoot, dir));
  let cuts = []; try { cuts = fs.readFileSync(path.join(root, 'cuts.txt'), 'utf8').split(/\s+/).filter(Boolean).map(Number).filter(Number.isFinite); } catch { /* none */ }
  return { cuts, times: readJson(path.join(root, 'beat-times.json'), {}) };
}

// Does the reference cut at this moment of a beat? times: beat-times ({ beat: [from, to] } of its line), cuts: film
// seconds. A moment at the beat's start (at under 0.3 s) is matched by a cut anywhere in the pause between the last
// line and this one (Vol.138 cuts from the table to the map at 145.0 s, its next line starts at 146.5 s); a moment
// inside the beat by a cut within tol of the same share of the reference's beat (its start to the next start).
// -> { known, cut, at } (known: the reference has this beat; at: the reference second the moment maps to)
export function referenceCutAt({ cuts = [], times = {} } = {}, beat, at, seconds, tol = 1.0) {
  const order = Object.entries(times).sort((a, b) => a[1][0] - b[1][0]), i = order.findIndex(([b]) => b === beat);
  if (i < 0) return { known: false, cut: false, at: null };
  const [a0] = order[i][1], next = order[i + 1]?.[1][0] ?? order[i][1][1];
  if (at < 0.3) { const prevEnd = i ? order[i - 1][1][1] : a0 - 2; return { known: true, cut: cuts.some((c) => c >= prevEnd - tol && c <= a0 + tol), at: a0 }; }
  const r = a0 + (at / (seconds || 1)) * (next - a0);
  return { known: true, cut: cuts.some((c) => Math.abs(c - r) <= tol), at: r };
}
