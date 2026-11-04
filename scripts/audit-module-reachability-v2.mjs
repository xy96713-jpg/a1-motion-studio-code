#!/usr/bin/env node
/**
 * audit-module-reachability-v2.mjs — READ-ONLY, entry-point-complete reachability.
 *
 * Why v2 exists: v1 treated only app routes + a hand-picked CLI as entries, so it
 * classified everything driven by server.js or by one-off scripts/ tools as an
 * "orphan". That is a false negative: those are the most-exercised capabilities
 * in this repo. v2 classifies each module by WHICH entry class can reach it.
 *
 * Entry classes:
 *   app       Next.js app router (pages, layouts, route handlers)
 *   server    server.js (the 4288 Express service)
 *   render    Remotion composition roots
 *   cli       operator CLI + every file referenced by package.json scripts
 *   script    every runnable file under scripts/ (these ARE entry points)
 *   registry  node module definitions that are registered with an execute fn
 *
 * Output: work/module-reachability-audit-v2/{report.json,SUMMARY.md}
 * Writes nothing else. Never mutates workspace/current-phase/authority/generated.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'work/module-reachability-audit-v2');
const SOURCE_ROOTS = ['apps/studio-next/src', 'remotion-renderer/src', 'lib'];
const EXTS = ['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.json'];
const CODE_EXTS = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx']);

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['node_modules', '.next', '.git'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (CODE_EXTS.has(path.extname(e.name))) acc.push(full);
  }
  return acc;
}

const moduleFiles = SOURCE_ROOTS.flatMap((r) => walk(path.join(root, r)));
const fileSet = new Set(moduleFiles);
const rel = (f) => path.relative(root, f).split(path.sep).join('/');

// Files that are real entry points but live OUTSIDE the scanned module roots.
// server.js and every scripts/ tool must be in the graph, otherwise traversal
// from them starts nowhere and their capabilities look unreachable.
const serverFile = path.join(root, 'server.js');
const scriptsDir = path.join(root, 'scripts');
const scriptFiles = fs.existsSync(scriptsDir)
  ? fs.readdirSync(scriptsDir).filter((n) => /\.(mjs|js|cjs|ts)$/.test(n)).map((n) => path.join(scriptsDir, n)) : [];
const entrySideFiles = [serverFile, ...scriptFiles].filter((f) => fs.existsSync(f));
const graphFiles = [...new Set([...moduleFiles, ...entrySideFiles])];

// ---- import graph -----------------------------------------------------------
const graph = new Map();
const IMPORT_RE = /(?:^|[^\w.])(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
function resolveSpec(fromFile, spec) {
  const base = spec.startsWith('@/')
    ? path.join(root, 'apps/studio-next/src', spec.slice(2))
    : spec.startsWith('.') ? path.resolve(path.dirname(fromFile), spec) : null;
  if (!base) return null;
  const direct = [base, ...[`${base}.mjs`], ...EXTS.map((x) => `${base}${x}`), ...EXTS.map((x) => path.join(base, `index${x}`))];
  for (const c of direct) if (fs.existsSync(c) && fs.statSync(c).isFile() && CODE_EXTS.has(path.extname(c))) return c;
  return null;
}
for (const f of graphFiles) {
  const deps = new Set();
  let m; IMPORT_RE.lastIndex = 0;
  const src = fs.readFileSync(f, 'utf8');
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const r = resolveSpec(f, m[1] || m[2] || m[3]);
    if (r) deps.add(r);
  }
  graph.set(f, [...deps]);
}

// ---- entry classes ----------------------------------------------------------
const classes = {app: [], server: [], render: [], cli: [], script: []};

// app: every Next router file
for (const f of moduleFiles) {
  if (/^apps\/studio-next\/src\/app\/.*(page|layout|route|template|default)\.(tsx|ts|jsx|js)$/.test(rel(f))) classes.app.push(f);
  if (rel(f) === 'apps/studio-next/src/middleware.ts') classes.app.push(f);
}
// server: the Express service itself
if (fs.existsSync(serverFile)) classes.server.push(serverFile);
// render: Remotion roots
for (const f of moduleFiles) {
  if (/^remotion-renderer\/src\/(index|Root|registerRoot)\.(tsx|ts|jsx|js)$/.test(rel(f))) classes.render.push(f);
}
// script: every runnable file under scripts/
classes.script = scriptFiles;
// cli: files referenced by package.json script bodies
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const body of Object.values(pkg.scripts || {})) {
  for (const tok of String(body).split(/\s+/)) {
    const cand = path.resolve(root, tok);
    if (fs.existsSync(cand) && fs.statSync(cand).isFile() && CODE_EXTS.has(path.extname(cand))) classes.cli.push(cand);
  }
}

// ---- reverse reachability ---------------------------------------------------
const reachedBy = new Map(); // file -> Set(class)
for (const [cls, entries] of Object.entries(classes)) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const d of graph.get(cur) || []) if (!seen.has(d)) stack.push(d);
  }
  for (const f of seen) {
    if (!fileSet.has(f)) continue;
    if (!reachedBy.has(f)) reachedBy.set(f, new Set());
    reachedBy.get(f).add(cls);
  }
}

// ---- classification ---------------------------------------------------------
const summary = {app: 0, server: 0, render: 0, cli: 0, scriptOnly: 0, unreachable: 0};
const scriptOnly = [];
const unreachable = [];
const classesOf = (f) => [...(reachedBy.get(f) || [])].sort();
for (const f of moduleFiles) {
  const c = classesOf(f);
  const graphTouch = c.filter((x) => x !== 'script' && x !== 'cli');
  if (graphTouch.length) { for (const x of graphTouch) summary[x] += 1; }
  else if (c.includes('cli')) summary.cli += 1;
  else if (c.includes('script')) { summary.scriptOnly += 1; scriptOnly.push(rel(f)); }
  else { summary.unreachable += 1; unreachable.push(rel(f)); }
}

// ---- capability families by name -------------------------------------------
const FAMILIES = [
  ['素材搜索/发现', /search|discover|retriev|external.?media|material/i],
  ['来源证据/授权', /source|provenance|evidence|license|official/i],
  ['录屏/浏览器', /screen|record|browser|capture|cap-|playwright/i],
  ['文字排版/字体', /typograph|font|glyph|type-/i],
  ['生图/生成', /imagegen|generat|remote-generation|xyq|video-adapter/i],
  ['图解/信息图', /diagram|chart|infographic/i],
  ['合成/渲染', /composit|render|remotion|hyperframe|ffmpeg|scdet/i],
  ['审查/门控', /review|gate|audit|approv|critic|verdict/i],
  ['装配/时间线', /assembl|timeline|montage|sequence/i],
  ['动效', /motion|kinetic|animat/i],
];
const familyCounts = FAMILIES.map(([name, re]) => {
  const hits = moduleFiles.filter((f) => re.test(path.basename(f)));
  const only = hits.filter((f) => classesOf(f).every((x) => ['script', 'cli'].includes(x)));
  return {name, total: hits.length, scriptOrCliOnly: only.length};
});
const criticalPaths = [
  'apps/studio-next/src/lib/a1-article-external-media-program-v1.mjs',
  'apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs',
  'apps/studio-next/src/lib/a1-storyboard-live-media-search-v1.mjs',
  'apps/studio-next/src/lib/a1-node-screen-recording-adapter-v1.mjs',
  'apps/studio-next/src/lib/a1-node-cap-export-adapter-v1.mjs',
  'apps/studio-next/src/lib/a1-asset-treatment-orchestrator-v1.mjs',
  'apps/studio-next/src/lib/a1-external-source-packaging-router-v1.mjs',
  'apps/studio-next/src/lib/a1-node-asset-treatment-adapter-v1.mjs',
  'apps/studio-next/src/lib/a1-node-composite-adapter-v1.mjs',
  'apps/studio-next/src/lib/a1-node-remotion-render-adapter-v1.mjs',
  'apps/studio-next/src/lib/a1-shot-packaging-decision-v1.mjs',
  'apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs',
];
const criticalCapabilities = criticalPaths.map((p) => ({path:p, exists:fs.existsSync(path.join(root,p)), reachedBy:classesOf(path.join(root,p))}));
const invariantFailures = [];
for (const name of ['a1-shot-task-runtime-v1.mjs', 'a1-node-screen-recording-adapter-v1.mjs']) {
  if (!criticalCapabilities.find((item) => item.path.endsWith(`/${name}`))?.reachedBy.includes('app')) {
    invariantFailures.push(`APP_ALIAS_REACHABILITY_MISSING:${name}`);
  }
}

const report = {
  contract: 'A1ModuleReachabilityAudit/v2',
  status: invariantFailures.length ? 'FAIL' : 'PASS',
  generatedAt: new Date().toISOString(),
  scope: 'READ_ONLY_ENTRY_POINT_COMPLETE',
  whyThisVersion: 'v2 includes server.js, scripts, and the studio-next @/ import alias so live workbench modules are not mislabeled as orphans.',
  entryCounts: Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, v.length])),
  moduleCounts: {
    total: moduleFiles.length,
    reachableFromApp: summary.app,
    reachableFromServer: summary.server,
    reachableFromRender: summary.render,
    reachableFromCliOnly: summary.cli,
    reachableFromScriptsOnly: summary.scriptOnly,
    unreachableFromAnyEntry: summary.unreachable,
  },
  npmScripts: Object.keys(pkg.scripts || {}).length,
  scriptFilesOnDisk: scriptFiles.length,
  capabilitiesByFamily: familyCounts,
  criticalCapabilities,
  invariantFailures,
  deletionEligibleFromThisAudit: false,
  scriptOnlyModules: scriptOnly.sort(),
  unreachableModules: unreachable.sort(),
  caveats: [
    'Static import analysis resolves relative paths and the studio-next @/ alias; computed dynamic specifiers and config-driven discovery are not resolved.',
    'reachedBy is a superset: a module reachable from a script may also be imported by the app in ways static analysis cannot see.',
    'A scripts-only module is NOT dead code — it is a capability that only a hand-run script can reach.',
    'An unreachable module is not a deletion candidate until literal Remotion entry paths, manifests, tests and recovery references are checked.',
  ],
};
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

const L = [
  '# Module reachability audit v2 (entry-point complete, read-only)', '',
  `Scanned **${moduleFiles.length}** modules. npm scripts: **${Object.keys(pkg.scripts || {}).length}**. Files under scripts/: **${scriptFiles.length}**.`, '',
  '## Entry classes', '',
  '| class | entries |', '| --- | --- |',
  ...Object.entries(report.entryCounts).map(([k, v]) => `| ${k} | ${v} |`), '',
  '## Where modules are reachable from', '',
  '| reached by | modules |', '| --- | --- |',
  `| app (4311) | ${summary.app} |`,
  `| server.js (4288) | ${summary.server} |`,
  `| remotion render | ${summary.render} |`,
  `| CLI only | ${summary.cli} |`,
  `| **scripts only** | **${summary.scriptOnly}** |`,
  `| unreachable from any entry | ${summary.unreachable} |`, '',
  '## Capability families', '',
  '| family | modules | script/CLI-only |', '| --- | --- | --- |',
  ...familyCounts.map((f) => `| ${f.name} | ${f.total} | **${f.scriptOrCliOnly}** |`), '',
  '## Caveats', '',
  ...report.caveats.map((c) => `- ${c}`), '',
];
fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), L.join('\n'));

console.log(JSON.stringify({
  ok: invariantFailures.length === 0,
  status: report.status,
  invariantFailures,
  entryCounts: report.entryCounts,
  moduleCounts: report.moduleCounts,
  capabilitiesByFamily: familyCounts,
  reportPath: rel(path.join(outDir, 'report.json')),
}, null, 2));
if (invariantFailures.length) process.exitCode = 1;
