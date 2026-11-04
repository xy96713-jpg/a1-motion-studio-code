#!/usr/bin/env node
/**
 * audit-module-reachability-v1.mjs — READ-ONLY module reachability audit.
 *
 * Purpose: answer "the workspace has too many modules" with a measured list.
 * It builds a static import graph over the runtime source roots, walks it from
 * the real entry points, and reports the difference (orphan candidates).
 *
 * It writes nothing except its own report under work/module-reachability-audit-v1/.
 * It never mutates workspace, current-phase, authority, or generated artifacts.
 *
 * Usage: node scripts/audit-module-reachability-v1.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'work/module-reachability-audit-v1');

const SOURCE_ROOTS = [
  'apps/studio-next/src',
  'remotion-renderer/src',
  'lib',
];
const EXTS = ['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.json'];
const CODE_EXTS = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx']);

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (CODE_EXTS.has(path.extname(entry.name))) acc.push(full);
  }
  return acc;
}

const files = SOURCE_ROOTS.flatMap((r) => walk(path.join(root, r)));
const fileSet = new Set(files);

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // package import — outside this graph
  const base = path.resolve(path.dirname(fromFile), spec);
  if (fs.existsSync(base) && fs.statSync(base).isFile() && CODE_EXTS.has(path.extname(base))) return base;
  for (const ext of EXTS) {
    for (const candidate of [`${base}${ext}`, path.join(base, `index${ext}`)]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
  }
  return null;
}

const IMPORT_RE = /(?:^|[^\w.])(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const graph = new Map();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const deps = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1] || m[2] || m[3];
    const resolved = resolveSpec(file, spec);
    if (resolved) deps.add(resolved);
  }
  graph.set(file, [...deps]);
}

// ---- entry points -----------------------------------------------------------
const entries = new Set();
const addEntry = (p) => { if (p && fileSet.has(p)) entries.add(p); };

// 1. Next.js app routes and pages
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (/^apps\/studio-next\/src\/app\/.*\/(page|layout|route|template|default)\.(tsx|ts|js|jsx)$/.test(rel)) addEntry(file);
  if (rel === 'apps/studio-next/src/middleware.ts') addEntry(file);
}
// 2. Express API surface
addEntry(path.join(root, 'server.js'));
// 3. Remotion composition entry points
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (/^remotion-renderer\/src\/(index|Root|registerRoot)\.(tsx|ts|jsx|js)$/.test(rel)) addEntry(file);
}
// 4. Node adapter registry — a module is live if the shot-task runtime registers it
const registryFile = path.join(root, 'apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs');
if (fileSet.has(registryFile)) addEntry(registryFile);
// 5. Documented operator entry
addEntry(path.join(root, 'scripts/run-system-line-current-v1.mjs'));

// ---- reachability -----------------------------------------------------------
const seen = new Set();
const stack = [...entries];
while (stack.length) {
  const cur = stack.pop();
  if (seen.has(cur)) continue;
  seen.add(cur);
  for (const dep of graph.get(cur) || []) if (!seen.has(dep)) stack.push(dep);
}

const orphans = files.filter((f) => !seen.has(f));
const relOf = (f) => path.relative(root, f).split(path.sep).join('/');

// ---- second pass: is the orphan referenced outside the runtime import graph? --
// A module can be legitimately live via a CLI script, a registry table, or a
// config entry. Reverse-text search for its basename over scripts/, docs/ and
// repo-root config files separates "CLI-only" from "candidate dead".
const REFERENCE_ROOTS = ['scripts', 'docs', 'remotion-renderer', 'apps/studio-next/src'];
const referenceCorpus = [];
function collectCorpus(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectCorpus(full);
    else if (/\.(mjs|js|cjs|ts|tsx|jsx|json|md)$/.test(entry.name)) {
      try { referenceCorpus.push(fs.readFileSync(full, 'utf8')); } catch { /* unreadable */ }
    }
  }
}
for (const r of REFERENCE_ROOTS) collectCorpus(path.join(root, r));
for (const extra of ['package.json', 'server.js']) {
  const p = path.join(root, extra);
  if (fs.existsSync(p)) referenceCorpus.push(fs.readFileSync(p, 'utf8'));
}
const corpus = referenceCorpus.join('\n');

function referencedElsewhere(file) {
  const base = path.basename(file).replace(/\.(mjs|js|cjs|ts|tsx|jsx)$/, '');
  if (base.length < 6) return null;
  let hits = 0;
  let idx = -1;
  while ((idx = corpus.indexOf(base, idx + 1)) !== -1) hits += 1;
  // The file's own source is in the corpus; a single self-reference is not a user.
  return hits > 1 ? hits : null;
}

const f_referenceClass = new Map();
for (const f of orphans) {
  const hits = referencedElsewhere(f);
  f_referenceClass.set(f, hits ? {class: 'CLI_OR_REGISTRY_ONLY', references: hits} : {class: 'UNREFERENCED'});
}
const cls = {CLI_OR_REGISTRY_ONLY: 0, UNREFERENCED: 0};
for (const v of f_referenceClass.values()) cls[v.class] += 1;

// ---- grouping ---------------------------------------------------------------
const byDir = new Map();
for (const f of orphans) {
  const parts = relOf(f).split('/');
  const key = parts.slice(0, Math.min(parts.length - 1, 3)).join('/');
  if (!byDir.has(key)) byDir.set(key, []);
  byDir.get(key).push(path.basename(f));
}

const totalFiles = files.length;
const reachable = seen.size;
const scriptsOnDisk = fs.existsSync(path.join(root, 'scripts'))
  ? fs.readdirSync(path.join(root, 'scripts')).filter((n) => /\.(mjs|js|ts)$/.test(n)).length : 0;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const report = {
  contract: 'A1ModuleReachabilityAudit/v1',
  generatedAt: new Date().toISOString(),
  scope: 'READ_ONLY_STATIC_IMPORT_GRAPH',
  sourceRoots: SOURCE_ROOTS,
  counts: {
    sourceFilesScanned: totalFiles,
    entryPoints: entries.size,
    reachableFromEntries: reachable,
    orphanCandidates: orphans.length,
    orphanCliOrRegistryOnly: cls.CLI_OR_REGISTRY_ONLY,
    orphanUnreferenced: cls.UNREFERENCED,
    npmScripts: Object.keys(pkg.scripts || {}).length,
    scriptsOnDisk,
  },
  caveats: [
    'Static import analysis only: dynamic specifier construction, string-based route tables, and config-driven module discovery are not resolved.',
    'An orphan here is a candidate for retirement, not proof of dead code. Confirm by checking runtime config/registry references before archiving.',
    'scripts/ CLI files are not scanned as modules; they are counted separately.',
  ],
  entryPointList: [...entries].map(relOf).sort(),
  orphanCandidates: orphans
    .map((f) => ({path: relOf(f), ...f_referenceClass.get(f)}))
    .sort((a, b) => a.path.localeCompare(b.path)),
  orphansByDirectory: [...byDir.entries()]
    .map(([dir, names]) => ({dir, count: names.length, files: names.sort()}))
    .sort((a, b) => b.count - a.count),
};

fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

const lines = [
  '# Module reachability audit (read-only)',
  '',
  `Scanned ${totalFiles} source files under ${SOURCE_ROOTS.join(', ')}.`,
  `Entry points: ${entries.size}. Reachable: ${reachable}. **Orphan candidates: ${orphans.length}** (${(orphans.length / Math.max(totalFiles, 1) * 100).toFixed(1)}%).`,
  `npm scripts: ${Object.keys(pkg.scripts || {}).length}. Files under scripts/: ${scriptsOnDisk}.`,
  '',
  '## Orphan candidates by directory',
  '',
  '| dir | count | files |',
  '| --- | --- | --- |',
  ...report.orphansByDirectory.slice(0, 40).map((g) => `| \`${g.dir}\` | ${g.count} | ${g.files.slice(0, 6).join(', ')}${g.files.length > 6 ? ', …' : ''} |`),
  '',
  '## Caveats',
  '',
  ...report.caveats.map((c) => `- ${c}`),
  '',
];
fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), lines.join('\n'));

console.log(JSON.stringify({
  ok: true,
  counts: report.counts,
  topOrphanDirs: report.orphansByDirectory.slice(0, 12).map((g) => `${g.dir}:${g.count}`),
  reportPath: path.relative(root, path.join(outDir, 'report.json')),
}, null, 2));
