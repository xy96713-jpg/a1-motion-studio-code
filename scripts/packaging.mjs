#!/usr/bin/env node
// Packaging codebook CLI: validate the taxonomy, list variants, pick a recipe, resolve params.
//   node scripts/packaging.mjs --check
//   node scripts/packaging.mjs --list [--category type-surface]
//   node scripts/packaging.mjs --variant ts-page-margin [--params '{"column":3}']
//   node scripts/packaging.mjs --pick --intent title --surface page [--recent ec-inset-page] [--count 3]
import path from 'node:path';
import fs from 'node:fs';
import { loadPackaging, loadBenchmarks, loadGawx, packagingErrors, benchmarkErrors, gawxErrors, benchmarkForCategory, allVariants, variantById, pickVariants, resolveParams, contractErrors, assignPackaging, packagingShotErrors, sequencePackagingErrors } from '../apps/studio-next/src/lib/recipe-board/packaging.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, d = null) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const dataDir = path.resolve(opt('--data', 'work/recipe-board-v1'));
const pkg = loadPackaging(dataDir);
const bench = loadBenchmarks(dataDir);
const gawx = loadGawx(dataDir);
if (!pkg) { console.error('packaging: taxonomy not found under ' + dataDir); process.exit(2); }

if (has('--check')) {
  const errors = packagingErrors(pkg).concat(benchmarkErrors(bench, pkg), gawxErrors(gawx));
  if (errors.length) { for (const e of errors) console.error('✖ ' + e); process.exit(1); }
  console.log('packaging ok: ' + pkg.categories.length + ' categories, ' + allVariants(pkg).length + ' variants, ' + Object.keys(bench.films || {}).length + ' benchmark films');
  process.exit(0);
}

if (has('--gawx')) {
  if (!gawx) { console.error('packaging: gawx measurements not found'); process.exit(2); }
  const t = gawx.typography.gawx;
  console.log('Gawx type (' + t.frames + ' frames): withWords ' + t.withWords + ' · biggest ' + t.biggest.join('/') + ' · lines ' + t.lines.join('/') + ' · margin ' + t.margin.join('-') + ' · chars ' + t.chars.join('-') + ' · align ' + JSON.stringify(t.align));
  console.log('colour: ' + gawx.colourVariants.map((v) => v.id).join(', '));
  console.log('layout: ' + gawx.layoutVariants.map((v) => v.id).join(', '));
  console.log('harmony: ' + gawx.harmonyRules.maxColouredFamiliesPerFrame + ' families max · analogous <=45° · complementary 150-210° · contrast 90-150° · ink/ground >=4.5 body');
  process.exit(0);
}

if (has('--bench')) {
  if (!bench) { console.error('packaging: benchmarks not found'); process.exit(2); }
  const cat = opt('--category');
  for (const c of pkg.categories || []) {
    if (cat && c.id !== cat) continue;
    const ev = benchmarkForCategory(bench, c.id) || {};
    if (ev.gawx) console.log(c.id + ': films ' + (ev.films || []).join('+') + ' | gawx variants ' + (ev.gawx.variants || []).join(','));
    else console.log(c.id + ': films ' + (ev.films || []).join('+') + ' | hupo labels ' + ((ev.hupo && ev.hupo.labels) || []).join(',') + ' | paperclip devices ' + ((ev.paperclip && ev.paperclip.devices) || []).slice(0, 5).join(','));
  }
  console.log('gaps: ' + (bench.gaps || []).join(' / '));
  process.exit(0);
}

if (has('--list')) {
  const cat = opt('--category');
  const rows = allVariants(pkg).filter((v) => !cat || v.category === cat);
  for (const v of rows) console.log(v.category + '/' + v.id + '  ' + v.label + '  [' + (v.appliesTo || []).join(',') + ']');
  process.exit(0);
}

if (has('--variant')) {
  const v = variantById(pkg, opt('--variant'));
  if (!v) { console.error('packaging: no variant ' + opt('--variant')); process.exit(2); }
  let overrides = {};
  try { overrides = JSON.parse(opt('--params', '{}')); } catch { console.error('packaging: --params is not JSON'); process.exit(2); }
  const out = { id: v.id, category: v.category, contract: v.contract, params: resolveParams(v, overrides), refs: v.refs, benchmarks: v.refs.benchmarks, failureModes: v.failureModes, checks: v.checks };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (has('--pick')) {
  const recent = String(opt('--recent', '')).split(',').map((x) => x.trim()).filter(Boolean);
  const picked = pickVariants(pkg, { intent: opt('--intent', 'title'), surface: opt('--surface', 'any'), palette: opt('--palette'), recent, count: Number(opt('--count', '3')) });
  console.log(JSON.stringify({ intent: opt('--intent', 'title'), surface: opt('--surface', 'any'), recent, picked }, null, 2));
  process.exit(0);
}


const projectId = opt('--project');
const projectDir = projectId ? path.join(dataDir, 'projects', projectId) : null;
const readShots = (dir) => {
  const d = path.join(dir, 'shots');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => /^B\d+\.json$/.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((f) => ({ file: path.join(d, f), shot: JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) }));
};

if (has('--assign') || has('--check-project')) {
  if (!projectId || !fs.existsSync(projectDir)) { console.error('packaging: --project <id> required and must exist'); process.exit(2); }
  const pkgOk = packagingErrors(pkg).concat(benchmarkErrors(bench, pkg), gawxErrors(gawx));
  if (pkgOk.length) { for (const e of pkgOk) console.error('✖ ' + e); process.exit(1); }
  const planDoc = fs.existsSync(path.join(projectDir, 'plan.json')) ? JSON.parse(fs.readFileSync(path.join(projectDir, 'plan.json'), 'utf8')) : null;
  const list = readShots(projectDir), recent = [], errors = [];
  for (const { file, shot } of list) {
    if (has('--write') || !shot.design?.packaging) {
      const intent = shot.design?.intent || 'concept';
      const planBeat = planDoc?.beats?.find((b) => b.id === shot.shotId);
      const headline = planBeat?.onScreen?.headline || shot.design?.hero?.target || '';
      const assigned = assignPackaging(pkg, { headline, dur: shot.motion?.duration || 5 }, { intent, surface: 'any', recent, gawx });
      if (!assigned) { errors.push(shot.shotId + ': no assignable packaging variant'); continue; }
      shot.design = shot.design || {};
      shot.design.packaging = assigned;
      if (has('--write')) fs.writeFileSync(file, JSON.stringify(shot, null, 1) + '\n');
    }
    recent.push(shot.design.packaging.variant);
  }
  const after = list.map((x) => x.shot);
  for (const s of after) errors.push(...packagingShotErrors(s, pkg, bench, gawx));
  errors.push(...sequencePackagingErrors(after, pkg));
  if (has('--write') && !errors.length) console.log('packaging assigned + written: ' + after.length + ' shots');
  else if (errors.length) { for (const e of errors) console.error('✖ ' + e); process.exitCode = 1; }
  else console.log(JSON.stringify(after.map((s) => ({ shot: s.shotId, variant: s.design?.packaging?.variant })), null, 2));
  process.exit(process.exitCode || 0);
}
console.error('nothing to do: try --check, --gawx, --list, --variant <id>, --pick --intent <title|concept|data>, --assign --project <id> [--write]');
process.exit(2);
