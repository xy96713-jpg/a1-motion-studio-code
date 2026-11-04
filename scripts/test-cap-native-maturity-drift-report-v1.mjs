#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = spawnSync(process.execPath, ["scripts/audit-cap-native-three-shot-maturity-v1.mjs"], {cwd: root, encoding: "utf8", maxBuffer: 2_000_000});
assert.equal(run.status, 1);
assert.doesNotMatch(run.stderr, /TypeError/u);
const report = JSON.parse(run.stdout);
assert.equal(report.status, "BLOCKED");
assert.ok(report.failures.includes("CANARY_ARTIFACT_IDENTITY_DRIFT"));
assert.deepEqual(report.expectedShotIds, ["ED-03", "ED-24", "ED-26"]);
assert.deepEqual(report.actualShotIds, ["ED-06", "ED-30"]);
console.log(JSON.stringify({status: "PASS", contract: "A1CapNativeMaturityDriftReportTest/v1"}, null, 2));
