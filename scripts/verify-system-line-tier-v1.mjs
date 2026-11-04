#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {performance} from "node:perf_hooks";

const root = path.resolve(import.meta.dirname, "..");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/verification-tier-v1");
const cachePath = path.join(artifactRoot, "cache.json");
const runnerRelativePath = "scripts/verify-system-line-tier-v1.mjs";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file));
const runNode = (script) => ({command: `node ${script}`, executable: process.execPath, args: [path.join(root, script)]});
const runNpm = (script) => ({command: `npm run ${script}`, executable: "npm", args: ["run", script]});

export const VERIFICATION_TIERS = Object.freeze({
  FAST: {
    description: "changed-contract and hot-pointer checks; no browser, media playback, or full workspace audit",
    cacheable: true,
    inputs: [
      runnerRelativePath,
      "package.json",
      "package-lock.json",
      "apps/studio-next/package.json",
      "apps/studio-next/package-lock.json",
      "apps/studio-next/src/lib/a1-typography-role-authority-v1.mjs",
      "apps/studio-next/src/lib/a1-presenter-depth-title-route-v1.mjs",
      "apps/studio-next/src/lib/a1-pixel-editorial-typography-policy-v1.mjs",
      "scripts/test-typography-role-authority-v1.mjs",
      "scripts/test-presenter-depth-title-route-v1.mjs",
      "scripts/test-pixel-editorial-typography-policy-v1.mjs",
      "scripts/test-canonical-title-repair-eva-binding-v1.mjs",
      "scripts/test-execution-status-v1.mjs",
      "scripts/test-editorial-production-module-split-v1.mjs",
      "scripts/test-record-engine-parity-v1.mjs",
      "scripts/test-user-selected-packaging-uniques-v1.mjs",
      "scripts/test-current-packaging-style-grammar-v1.mjs",
      "apps/studio-next/src/lib/a1-execution-status-v1.mjs",
      "apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs",
      "apps/studio-next/src/lib/visual-generation-director/foundations.mjs",
      "apps/studio-next/src/lib/visual-generation-director/audit.mjs",
      "scripts/test-visual-generation-director-v2.mjs",
      "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/canonical-user-selected-packaging-v1/manifest.json",
      ".codex-artifacts/system-progress-system-line/current-packaging-review-v1/manifest.json",
      ".codex-artifacts/system-progress-system-line/current-phase.json",
      "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/active-run.json",
      "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/transition-receipt.json",
    ],
    commands: [
      runNode("scripts/test-typography-role-authority-v1.mjs"),
      runNode("scripts/test-presenter-depth-title-route-v1.mjs"),
      runNode("scripts/test-pixel-editorial-typography-policy-v1.mjs"),
      runNode("scripts/test-canonical-title-repair-eva-binding-v1.mjs"),
      runNode("scripts/test-execution-status-v1.mjs"),
      runNode("scripts/test-editorial-production-module-split-v1.mjs"),
      runNode("scripts/test-record-engine-parity-v1.mjs"),
      runNode("scripts/test-user-selected-packaging-uniques-v1.mjs"),
      runNode("scripts/test-current-packaging-style-grammar-v1.mjs"),
      runNode("scripts/test-visual-generation-director-v2.mjs"),
    ],
  },
  BOARD: {
    description: "FAST plus real browser structure/API smoke; no video playback or full workspace hashing",
    cacheable: false,
    inputs: [
      runnerRelativePath,
      "package.json",
      "package-lock.json",
      "apps/studio-next/package.json",
      "apps/studio-next/package-lock.json",
      "apps/studio-next/src/lib/a1-typography-role-authority-v1.mjs",
      "apps/studio-next/src/lib/a1-presenter-depth-title-route-v1.mjs",
      "apps/studio-next/src/lib/a1-pixel-editorial-typography-policy-v1.mjs",
      "scripts/test-typography-role-authority-v1.mjs",
      "scripts/test-presenter-depth-title-route-v1.mjs",
      "scripts/test-pixel-editorial-typography-policy-v1.mjs",
      "scripts/test-canonical-title-repair-eva-binding-v1.mjs",
      "scripts/test-execution-status-v1.mjs",
      "scripts/test-editorial-production-module-split-v1.mjs",
      "scripts/test-record-engine-parity-v1.mjs",
      "scripts/test-user-selected-packaging-uniques-v1.mjs",
      "scripts/test-current-packaging-style-grammar-v1.mjs",
      "apps/studio-next/src/lib/a1-execution-status-v1.mjs",
      "apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs",
      "apps/studio-next/src/lib/visual-generation-director/foundations.mjs",
      "apps/studio-next/src/lib/visual-generation-director/audit.mjs",
      "scripts/test-visual-generation-director-v2.mjs",
      "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/canonical-user-selected-packaging-v1/manifest.json",
      ".codex-artifacts/system-progress-system-line/current-packaging-review-v1/manifest.json",
      "scripts/audit-system-line-board-smoke-v1.mjs",
      "apps/studio-next/src/app/system-line-visual-workbench/page.tsx",
      "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx",
      "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/route.ts",
      "apps/studio-next/src/app/api/system-line/execution-status/route.ts",
      ".codex-artifacts/system-progress-system-line/current-phase.json",
      "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/active-run.json",
      "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/transition-receipt.json",
      "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/client-bootstrap.json",
    ],
    commands: [
      runNode("scripts/test-typography-role-authority-v1.mjs"),
      runNode("scripts/test-presenter-depth-title-route-v1.mjs"),
      runNode("scripts/test-pixel-editorial-typography-policy-v1.mjs"),
      runNode("scripts/test-canonical-title-repair-eva-binding-v1.mjs"),
      runNode("scripts/test-execution-status-v1.mjs"),
      runNode("scripts/test-editorial-production-module-split-v1.mjs"),
      runNode("scripts/test-record-engine-parity-v1.mjs"),
      runNode("scripts/test-user-selected-packaging-uniques-v1.mjs"),
      runNode("scripts/test-current-packaging-style-grammar-v1.mjs"),
      runNode("scripts/test-visual-generation-director-v2.mjs"),
      runNode("scripts/audit-system-line-board-smoke-v1.mjs"),
    ],
  },
  STAGE: {
    description: "full stage-boundary delivery/readiness gate; intentionally uncached",
    cacheable: false,
    inputs: [],
    commands: [runNpm("verify:system-line-workbench")],
  },
});

function parseTier(argv) {
  const raw = argv.find((item) => item.startsWith("--tier="))?.slice("--tier=".length) || "FAST";
  const tier = raw.toUpperCase();
  if (!VERIFICATION_TIERS[tier]) throw new Error(`verification-tier-invalid:${raw}`);
  return tier;
}

function inputFingerprint(files, tier) {
  const contract = [
    "A1VerificationTierContract/v1",
    tier,
    process.version,
    process.platform,
    process.arch,
    process.env.NODE_ENV || "",
    process.env.NODE_OPTIONS || "",
    process.env.A1_SYSTEM_LINE_URL || "http://127.0.0.1:4311",
    `${runnerRelativePath}:${hash(read(runnerRelativePath))}`,
  ];
  return hash(contract.concat(files.map((file) => {
    if (!exists(file)) return `${file}:MISSING`;
    return `${file}:${hash(read(file))}`;
  })).join("\n"));
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(cachePath, "utf8")); } catch { return {contract: "A1VerificationTierCache/v1", entries: {}}; }
}

const tier = parseTier(process.argv.slice(2));
const force = process.argv.includes("--force");
const spec = VERIFICATION_TIERS[tier];
const key = spec.cacheable ? inputFingerprint(spec.inputs, tier) : null;
const cache = loadCache();
const cached = !force && key && cache.entries?.[tier]?.key === key && cache.entries?.[tier]?.status === "PASS" ? cache.entries[tier] : null;
if (cached) {
  console.log(JSON.stringify({status: "CACHED_PASS", contract: "A1VerificationTierRun/v1", tier, cacheKey: key, durationMs: 0, commandCount: spec.commands.length, source: "content-addressed-tier-cache", checkedAt: cached.checkedAt}, null, 2));
  process.exit(0);
}

const startedAt = performance.now();
const results = [];
for (const command of spec.commands) {
  const commandStartedAt = performance.now();
  const child = spawnSync(command.executable, command.args, {cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024});
  const durationMs = Math.round((performance.now() - commandStartedAt) * 100) / 100;
  const output = `${child.stdout || ""}${child.stderr || ""}`;
  results.push({command: command.command, status: child.status === 0 ? "PASS" : "FAIL", exitCode: child.status, durationMs, outputTail: output.slice(-2000)});
  if (child.status !== 0) {
    console.error(JSON.stringify({status: "FAIL", contract: "A1VerificationTierRun/v1", tier, cacheKey: key, durationMs: Math.round((performance.now() - startedAt) * 100) / 100, failedCommand: command.command, results}, null, 2));
    process.exit(child.status || 1);
  }
}

const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
if (key) {
  cache.entries = {...cache.entries, [tier]: {key, status: "PASS", checkedAt: new Date().toISOString(), durationMs, commandCount: spec.commands.length}};
  fs.mkdirSync(artifactRoot, {recursive: true});
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify({status: "PASS", contract: "A1VerificationTierRun/v1", tier, cacheKey: key, durationMs, commandCount: spec.commands.length, cacheStored: Boolean(key), results}, null, 2));
