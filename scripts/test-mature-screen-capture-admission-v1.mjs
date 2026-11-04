#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = spawnSync(process.execPath, ["scripts/audit-mature-screen-capture-admission-v1.mjs"], {cwd: root, encoding: "utf8"});
assert.equal(run.status, 1);
const report = JSON.parse(run.stdout);
assert.equal(report.status, "BLOCKED");
assert.equal(report.expectedShotCount, 16);
assert.equal(report.nativeCaptureShotCount, 4);
assert.equal(report.productionAdmission, false);
assert.deepEqual(report.nonNativeShotIds, ["ED-04", "ED-05", "ED-06", "ED-20", "ED-21", "ED-22", "ED-23", "ED-25", "ED-27", "ED-28", "ED-29", "ED-30"]);
console.log(JSON.stringify({status: "PASS", contract: "A1MatureScreenCaptureAdmissionGateTest/v1"}, null, 2));
