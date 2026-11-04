#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
const root = new URL("../", import.meta.url);
const output = new URL("work/screen-recording-maturity-test-v1/article-effect-readiness-v1/cap-bridge-test.json", root);
execFileSync(process.execPath, ["scripts/compile-article-effect-cap-bridge-v1.mjs", "work/screen-recording-maturity-test-v1/blind-test-v1/blind-nasa-ocean-v3-scenario.json", "work/screen-recording-maturity-test-v1/blind-test-v1/capture/blind-nasa-ocean-v2/capture-report.json", "work/screen-recording-maturity-test-v1/article-effect-readiness-v1/nasa-article-effect-execution-plan-v1.json", "work/screen-recording-maturity-test-v1/article-effect-readiness-v1/cap-bridge-test.json"], {cwd: new URL("../", import.meta.url), stdio: "pipe"});
const bridge = JSON.parse(fs.readFileSync(output, "utf8"));
assert.equal(bridge.status, "PARTIAL_REVIEW_ONLY_CAP_CAMERA");
assert.ok(bridge.cap.expectedEffects.some((row) => row.effectId === "SEMANTIC_PUSH"));
assert.ok(bridge.cap.blockedEffects.some((row) => row.effectId === "EVIDENCE_UNDERLINE"));
assert.equal(bridge.source.executionPlanSha256.length, 64);
console.log(JSON.stringify({status: "PASS", tests: ["cap-plan-sha-bound", "camera-effects-preserved", "annotation-gap-explicitly-blocked", "partial-cap-status-not-promoted"]}));
