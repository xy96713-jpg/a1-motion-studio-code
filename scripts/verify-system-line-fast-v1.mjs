#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const timeoutMs = 15000;
const checks = [
  ["syntax", "node --check apps/studio-next/src/lib/a1-orchestration-observability-v1.mjs && node --check apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs && node --check apps/studio-next/src/lib/a1-anti-ppt-motion-admission-v1.mjs && node --check scripts/fast-current-authority-summary-v1.mjs"],
  ["hot-status", "npm run status:system-line-fast"],
  ["orchestration-observability", "npm run test:orchestration-observability-v1"],
  ["presenter-output-gate", "npm run test:presenter-packaging-output-gate-v1"],
  ["anti-ppt-motion-admission", "npm run test:anti-ppt-motion-admission-v1"],
  ["sequence-visual-breathing", "npm run test:sequence-visual-breathing-gate-v1"],
  ["screen-run-breathing", "npm run test:screen-run-breathing-v1"],
  ["current-static-review-bootstrap", "node scripts/test-current-static-review-client-bootstrap-v1.mjs"],
  ["candidate-existence", "node scripts/test-current-candidate-existence-contract-v1.mjs"],
  ["history-route-isolation", "test ! -e scripts/build-ed13-approved-static-triptych-v1.mjs && test ! -e scripts/record-ed13-a-r1-visual-director-recommendation-v1.mjs && ! rg -q 'repair-v1/visual-director-recommendation' apps/studio-next/src/lib/a1-execution-status-v1.mjs"],
  ["latest-visual-board-authority", "npm run test:latest-visual-board-authority-v1"],
  ["paragraph-auto-review", "node scripts/test-packaging-paragraph-auto-review-v1.mjs"],
  ["hot-authority-projection", "node scripts/test-hot-path-authority-projection-v1.mjs"],
  ["production-authority", "node scripts/test-packaging-production-authority-v1.mjs"],
  ["execution-status", "node scripts/test-execution-status-v1.mjs"],
  ["current-authority-audit", "npm run audit:system-line-current-authority"],
  ["diff-check", "git diff --check"],
];

const results = [];
for (const [id, command] of checks) {
  const started = process.hrtime.bigint();
  const result = spawnSync("/bin/zsh", ["-lc", command], {cwd: root, encoding: "utf8", timeout: timeoutMs, maxBuffer: 50000});
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const timedOut = result.error?.code === "ETIMEDOUT";
  const passed = !timedOut && result.status === 0;
  results.push({id, passed, elapsedMs: Number(elapsedMs.toFixed(1)), timeoutMs, timedOut, exitCode: result.status, output: `${result.stdout || ""}${result.stderr || ""}`.trim().slice(-1200)});
  if (!passed && !process.argv.includes("--keep-going")) break;
}

const status = results.every((item) => item.passed) && results.length === checks.length ? "PASS" : "FAIL";
const gitStatus = spawnSync("git", ["status", "--short"], {cwd: root, encoding: "utf8"});
const report = {contract: "A1SystemLineFastVerification/v1", status, timeoutMs, checkCount: checks.length, completedCount: results.length, checks: results, fileState: {gitStatus: (gitStatus.stdout || "").trim().split("\n").filter(Boolean), diffCheckExecuted: results.some((item) => item.id === "diff-check"), diffCheckPassed: results.find((item) => item.id === "diff-check")?.passed ?? null}};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (status !== "PASS") process.exitCode = 1;
