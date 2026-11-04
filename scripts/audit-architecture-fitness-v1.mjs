#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const budgetPath = path.join(root, "configs/architecture-fitness-v1.json");
const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
assert.equal(budget.contract, "A1ArchitectureFitnessBudget/v1");
assert.equal(budget.status, "RATCHET_ACTIVE");

// These ceilings are code-owned so raising the JSON budget cannot silently
// turn an architectural regression green. A future reduction may lower them.
assert.ok(budget.sourceFileMaxBytes <= 150_000, "source file ceiling may not exceed 150KB");
assert.ok(budget.activeSopMaxBytes <= 12_000, "active SOP ceiling may not exceed 12KB");
assert.ok(budget.scriptBudget.maxRecursiveFiles <= 1_203, "recursive script file budget may not increase");
assert.ok(budget.scriptBudget.maxRecursiveMjs <= 1_166, "recursive .mjs budget may not increase");
assert.ok(budget.scriptBudget.maxOperationScripts <= 682, "operation script budget may not increase");
assert.ok(budget.moduleBudgets["remotion-renderer/src/MicrobeatLayeredFullReview.tsx"] <= 210_000, "renderer god-file ratchet may not increase");
assert.ok(budget.moduleLineBudgets["remotion-renderer/src/MicrobeatLayeredFullReview.tsx"] <= 1_900, "renderer god-file line ratchet may not increase");

const walk = (directory) => fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(target) : [target];
});
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const failures = [];

function findDependencyCycles(graph) {
  const cycles = [];
  const visited = new Set();
  const active = new Set();
  const stack = [];
  const walkNode = (node) => {
    if (active.has(node)) {
      const cycleStart = stack.indexOf(node);
      cycles.push([...stack.slice(cycleStart), node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    active.add(node);
    stack.push(node);
    for (const dependency of graph.get(node) || []) walkNode(dependency);
    stack.pop();
    active.delete(node);
  };
  for (const node of graph.keys()) walkNode(node);
  return cycles;
}

// Fitness functions must prove their own negative path, not only the current
// repository's happy path.
assert.equal(findDependencyCycles(new Map([["a", ["b"]], ["b", ["a"]]])).length, 1);

const sourceFiles = walk(path.join(root, "apps/studio-next/src/lib"))
  .filter((file) => /\.(?:[cm]?js|tsx?)$/u.test(file));
for (const file of sourceFiles) {
  const bytes = fs.statSync(file).size;
  if (bytes > budget.sourceFileMaxBytes) failures.push(`${relative(file)} exceeds ${budget.sourceFileMaxBytes} bytes: ${bytes}`);
}

for (const [modulePath, maxBytes] of Object.entries(budget.moduleBudgets || {})) {
  const file = path.join(root, modulePath);
  if (!fs.existsSync(file)) {
    failures.push(`missing budgeted module: ${modulePath}`);
    continue;
  }
  const bytes = fs.statSync(file).size;
  if (bytes > maxBytes) failures.push(`${modulePath} exceeds module budget ${maxBytes} bytes: ${bytes}`);
}

for (const [modulePath, maxLines] of Object.entries(budget.moduleLineBudgets || {})) {
  const file = path.join(root, modulePath);
  if (!fs.existsSync(file)) {
    failures.push(`missing line-budgeted module: ${modulePath}`);
    continue;
  }
  const lines = fs.readFileSync(file, "utf8").split("\n").length;
  if (lines > maxLines) failures.push(`${modulePath} exceeds module line budget ${maxLines}: ${lines}`);
}

const dependencyFiles = [...new Set(budget.dependencyGraph.groups.flatMap((group) => {
  if (group.root) {
    return walk(path.join(root, group.root))
      .filter((file) => budget.dependencyGraph.extensions.some((extension) => file.endsWith(extension)));
  }
  return (group.files || []).map((file) => path.join(root, file));
}).map((file) => path.resolve(file)))];
for (const file of dependencyFiles) if (!fs.existsSync(file)) failures.push(`missing dependency-graph module: ${relative(file)}`);
const dependencyFileSet = new Set(dependencyFiles);
const dependencyGraph = new Map(dependencyFiles.map((file) => [file, []]));
let dependencyEdges = 0;
for (const file of dependencyFiles) {
  const source = fs.readFileSync(file, "utf8");
  const relativeImports = [...source.matchAll(/(?:from\s+|import\s*)["'](\.{1,2}\/[^"']+)["']/gu)].map((match) => match[1]);
  for (const specifier of relativeImports) {
    const rawTarget = path.resolve(path.dirname(file), specifier);
    const candidates = [rawTarget, ...budget.dependencyGraph.extensions.map((extension) => `${rawTarget}${extension}`), ...budget.dependencyGraph.extensions.map((extension) => path.join(rawTarget, `index${extension}`))];
    const target = candidates.find((candidate) => dependencyFileSet.has(candidate));
    if (!target) continue;
    dependencyGraph.get(path.resolve(file)).push(target);
    dependencyEdges += 1;
    if (budget.dependencyGraph.forbidInternalFacadeImports && path.basename(target) === "index.mjs" && path.resolve(file) !== target) {
      failures.push(`internal module imports facade: ${relative(file)} -> ${relative(target)}`);
    }
  }
}
const dependencyCycles = findDependencyCycles(dependencyGraph);
if (budget.dependencyGraph.forbidCycles && dependencyCycles.length) {
  for (const cycle of dependencyCycles) failures.push(`module dependency cycle: ${cycle.map(relative).join(" -> ")}`);
}

const activeSop = path.join(root, "docs/A1_MOTION_ENGINE_SOP.md");
const activeSopBytes = fs.statSync(activeSop).size;
if (activeSopBytes > budget.activeSopMaxBytes) failures.push(`active SOP exceeds ${budget.activeSopMaxBytes} bytes: ${activeSopBytes}`);

const scriptFiles = walk(path.join(root, "scripts"));
const scriptMjs = scriptFiles.filter((file) => file.endsWith(".mjs"));
if (scriptFiles.length > budget.scriptBudget.maxRecursiveFiles) failures.push(`script file budget exceeded: ${scriptFiles.length}/${budget.scriptBudget.maxRecursiveFiles}`);
if (scriptMjs.length > budget.scriptBudget.maxRecursiveMjs) failures.push(`script .mjs budget exceeded: ${scriptMjs.length}/${budget.scriptBudget.maxRecursiveMjs}`);

const topLevelMjsNames = fs.readdirSync(path.join(root, "scripts"), {withFileTypes: true})
  .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
  .map((entry) => entry.name)
  .sort();
const operationNames = topLevelMjsNames.filter((name) => budget.operationPrefixes.some((prefix) => name.startsWith(`${prefix}-`)));
const operationNamesSha256 = crypto.createHash("sha256").update(`${operationNames.join("\n")}\n`).digest("hex");
if (operationNames.length > budget.scriptBudget.maxOperationScripts) failures.push(`operation script budget exceeded: ${operationNames.length}/${budget.scriptBudget.maxOperationScripts}`);
const legacyOperationInventoryPath = path.join(root, budget.legacyOperationInventory);
const legacyOperationNames = fs.readFileSync(legacyOperationInventoryPath, "utf8").trim().split("\n").filter(Boolean);
const legacyOperationNamesSha256 = crypto.createHash("sha256").update(`${legacyOperationNames.join("\n")}\n`).digest("hex");
if (legacyOperationNames.length > budget.scriptBudget.maxOperationScripts) failures.push("legacy operation inventory exceeds its ratchet budget");
if (legacyOperationNamesSha256 !== budget.scriptBudget.operationNamesSha256) failures.push("legacy operation inventory hash changed without an explicit budget update");
const legacyOperationNameSet = new Set(legacyOperationNames);
for (const operationName of operationNames.filter((name) => !legacyOperationNameSet.has(name))) {
  const source = fs.readFileSync(path.join(root, "scripts", operationName), "utf8").trim();
  if (source.split("\n").length > 3 || !source.includes("./engines/")) {
    failures.push(`new operation must be a thin engine wrapper or a config entry: scripts/${operationName}`);
  }
}

for (const family of budget.wrapperFamilies) {
  const engine = path.join(root, family.engine);
  if (!fs.existsSync(engine)) failures.push(`missing engine: ${family.engine}`);
  const config = path.join(root, family.config);
  if (!fs.existsSync(config)) {
    failures.push(`missing operation config: ${family.config}`);
  } else {
    const operationConfig = JSON.parse(fs.readFileSync(config, "utf8"));
    if (operationConfig.contract !== "A1OperationVariantConfig/v1" || operationConfig.status !== "ACTIVE") failures.push(`invalid operation config contract: ${family.config}`);
    const actualVariantIds = Object.keys(operationConfig.variants || {});
    if (JSON.stringify(actualVariantIds) !== JSON.stringify(family.variantIds)) failures.push(`operation variant inventory mismatch: ${family.config}`);
    if (actualVariantIds.length !== family.wrappers.length) failures.push(`operation config/wrapper count mismatch: ${family.config}`);
    const engineSource = fs.existsSync(engine) ? fs.readFileSync(engine, "utf8") : "";
    if (!engineSource.includes(path.basename(family.config))) failures.push(`engine bypasses operation config: ${family.engine}`);
  }
  for (const wrapperPath of family.wrappers) {
    const wrapper = path.join(root, wrapperPath);
    if (!fs.existsSync(wrapper)) {
      failures.push(`missing compatibility wrapper: ${wrapperPath}`);
      continue;
    }
    const source = fs.readFileSync(wrapper, "utf8").trim();
    if (source.split("\n").length > 3) failures.push(`wrapper is no longer thin: ${wrapperPath}`);
    const engineRelative = path.relative(path.dirname(wrapper), engine).split(path.sep).join("/");
    const importTarget = engineRelative.startsWith(".") ? engineRelative : `./${engineRelative}`;
    if (!source.includes(importTarget)) failures.push(`wrapper bypasses its engine: ${wrapperPath}`);
  }
}

if (failures.length) {
  console.error("Architecture fitness audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1ArchitectureFitnessAudit/v1",
  sourceFileMaxBytes: budget.sourceFileMaxBytes,
  largestSourceFile: sourceFiles.map((file) => ({file: relative(file), bytes: fs.statSync(file).size})).sort((a, b) => b.bytes - a.bytes)[0],
  activeSopBytes,
  scriptFiles: scriptFiles.length,
  scriptMjs: scriptMjs.length,
  operationScripts: operationNames.length,
  operationNamesSha256,
  legacyOperationScripts: legacyOperationNames.length,
  newEngineWrappers: operationNames.filter((name) => !legacyOperationNameSet.has(name)).length,
  engineFamilies: budget.wrapperFamilies.length,
  thinWrappers: budget.wrapperFamilies.reduce((sum, family) => sum + family.wrappers.length, 0),
  operationConfigVariants: budget.wrapperFamilies.reduce((sum, family) => sum + family.variantIds.length, 0),
  dependencyModules: dependencyFiles.length,
  dependencyEdges,
  dependencyCycles: dependencyCycles.length,
  moduleBudgets: Object.fromEntries(Object.entries(budget.moduleBudgets || {}).map(([modulePath, maxBytes]) => [modulePath, {bytes: fs.statSync(path.join(root, modulePath)).size, maxBytes}])),
  moduleLineBudgets: Object.fromEntries(Object.entries(budget.moduleLineBudgets || {}).map(([modulePath, maxLines]) => [modulePath, {lines: fs.readFileSync(path.join(root, modulePath), "utf8").split("\n").length, maxLines}])),
}, null, 2));
