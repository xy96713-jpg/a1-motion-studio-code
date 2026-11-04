// The whole-film still book: one final-quality still per beat, in one sheet, is the design the user
// must see before a rough cut is built. The line already makes whole-film stills; this collects them,
// refuses a missing beat, and composes the sheet `out/look/stillbook.jpg` beside its manifest.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { projectPaths } from './store.mjs';
import { loadVariantMatrix, solveFilmVariants, variantDiversityReport } from './variants.mjs';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const STILLBOOK_CONTRACT = 'A1RecipeBoardStillbook/v1';

export function stillbookCoverageErrors(beats, entries) {
  const want = (beats || []).map((b) => b.beat || b.id).filter(Boolean);
  const got = (entries || []).map((e) => e.beat).filter(Boolean);
  const e = [];
  if (!want.length) e.push('stillbook: no beats in the plan/storyboard');
  for (const b of want) if (!got.includes(b)) e.push(`${b}: no final still (one frame per beat is the design)`);
  const dup = got.filter((b, i) => got.indexOf(b) !== i);
  if (dup.length) e.push(`duplicate stills: ${[...new Set(dup)].join(', ')}`);
  for (const x of entries || []) if (!x.file || !fs.existsSync(x.file)) e.push(`${x.beat}: still file does not exist`);
  return e;
}

function candidates(root, out, beat, dir) {
  const list = [];
  if (dir) list.push(path.join(dir, `${beat}-full.png`), path.join(dir, `${beat}-clean-030.png`), path.join(dir, `${beat}.png`));
  // Newest design sets first: mature-stills-20261102 -> 10-30 redesign -> 10-29 full stills.
  list.push(
    path.join(root, 'look-dev/mature-stills-20261102/frames', `${beat}.png`),
    path.join(root, 'materials/full-stills-redesign-20261030/out-type-preflight/stills', `${beat}-clean-030.png`),
    path.join(root, 'materials/full-stills-20261029', `${beat}-full.png`),
  );
  const stills = path.join(out, 'chapters/STILLS');
  if (fs.existsSync(stills)) for (const f of fs.readdirSync(stills)) if (new RegExp(`^key-\\d+-${beat}\\.png$`).test(f)) list.push(path.join(stills, f));
  list.push(path.join(out, 'film', `hero-${beat}.jpg`));
  return list;
}

export function collectStillbook(cfg, id, { dir = null } = {}) {
  const p = projectPaths(cfg, id), plan = readJson(path.join(p.root, 'plan.json'), null), sb = readJson(path.join(p.root, 'storyboard.json'), null);
  const beats = (plan?.beats || sb?.shots || []).map((b) => ({ beat: b.id || b.beat, text: b.text || '', why: b.why || '' })).filter((b) => b.beat);
  const matrix = loadVariantMatrix(cfg);
  const solved = matrix ? solveFilmVariants(beats, matrix) : [];
  const byBeat = Object.fromEntries(solved.map((r) => [r.beat, r]));
  const entries = beats.map((b) => {
    const file = candidates(p.root, p.out, b.beat, dir).find((f) => fs.existsSync(f)) || null;
    const v = byBeat[b.beat];
    return {
      ...b,
      file,
      ...(v ? {
        semanticAct: v.semanticAct,
        chosenVariant: v.chosenVariant,
        family: v.chosen?.family || null,
        carrier: v.chosen?.carrier || null,
        motionScore: v.chosen?.motionScore || null,
      } : {}),
    };
  });
  const diversity = matrix ? variantDiversityReport(solved, matrix) : null;
  return { contract: STILLBOOK_CONTRACT, project: id, beats, entries, diversity, errors: stillbookCoverageErrors(beats, entries) };
}

export async function buildStillbook(cfg, id, { dir = null, out = null } = {}) {
  const data = collectStillbook(cfg, id, { dir });
  if (data.errors.length) throw new Error(`stillbook: ${data.errors.join('; ')}`);
  const CW = 480, CH = 270, GAP = 12, LAB = 32, HEAD = 56, cols = 4, rows = Math.ceil(data.entries.length / cols);
  const W = cols * CW + (cols + 1) * GAP, H = HEAD + rows * (CH + LAB) + (rows + 1) * GAP;
  const images = [], labels = [];
  for (const [i, x] of data.entries.entries()) {
    const r = Math.floor(i / cols), c = i % cols, left = GAP + c * (CW + GAP), top = HEAD + GAP + r * (CH + LAB + GAP);
    images.push({ input: await sharp(x.file).resize(CW, CH).toBuffer(), left, top });
    labels.push(`<text x="${left}" y="${top + CH + 22}" font-family="sans-serif" font-size="20" fill="#cfc9ba">${x.beat}</text>`);
  }
  const svg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><text x="${GAP}" y="34" font-family="sans-serif" font-size="22" fill="#f2efe6">${path.basename(path.dirname(path.dirname(projectPaths(cfg, id).root)))} · whole-film still design (${data.entries.length} beats)</text>${labels.join('')}</svg>`);
  const file = out ? path.resolve(out) : path.join(projectPaths(cfg, id).out, 'look', 'stillbook.jpg');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#111111' } }).composite([...images, { input: svg, left: 0, top: 0 }]).jpeg({ quality: 90 }).toFile(file);
  const manifest = { ...data, file, at: new Date().toISOString() };
  fs.writeFileSync(file.replace(/\.jpg$/, '.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { ...manifest, file };
}
