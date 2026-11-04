#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/review-queue-v1/current.json");
const publicPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/review-queue-v1/current.json");
const badgePath = path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/SystemReviewQueueBadge.tsx");
const failures = [];
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let queue = null;
if (!fs.existsSync(artifactPath) || !fs.existsSync(publicPath)) failures.push("REVIEW_QUEUE_PROJECTION_MISSING");
else {queue = JSON.parse(fs.readFileSync(artifactPath, "utf8")); if (sha(artifactPath) !== sha(publicPath)) failures.push("REVIEW_QUEUE_MIRROR_MISMATCH"); if (queue.boundaries?.userApprovalGranted !== false || queue.boundaries?.motionAllowed !== false) failures.push("REVIEW_QUEUE_GATE_BYPASS");}
if (!fs.existsSync(badgePath)) failures.push("WORKBENCH_REVIEW_QUEUE_BADGE_MISSING");
const test = spawnSync(process.execPath, [path.join(root, "scripts/test-system-line-review-queue-v1.mjs")], {cwd: root, encoding: "utf8", timeout: 5000});
const results = test.status === 0 ? JSON.parse(test.stdout).results || [] : [];
if (test.status !== 0) failures.push("REVIEW_QUEUE_FIXTURE_TEST_FAILED");
const report = {contract: "A1CurrentReviewQueueAudit/v1", status: failures.length ? "FAIL" : "PASS", counts: queue?.counts || null, queueSha256: queue?.queueSha256 || null, results, failures, checkedAt: new Date().toISOString()};
if (process.argv.includes("--write-baseline")) fs.writeFileSync(path.join(root, "work/current-review-queue-v1-baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes("--write")) {const out = path.join(root, "work/current-review-queue-v1"); fs.mkdirSync(out, {recursive: true}); fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(report, null, 2)}\n`);}
console.log(JSON.stringify(report, null, 2)); if (failures.length) process.exitCode = 1;
