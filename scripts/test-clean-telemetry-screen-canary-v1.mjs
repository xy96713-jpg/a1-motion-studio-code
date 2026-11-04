#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(root, "work/clean-telemetry-screen-canary-v1/audit-report.json");
assert.ok(fs.existsSync(reportPath), "clean-telemetry-audit-required");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

assert.equal(report.contract, "A1CleanTelemetryScreenCanaryAudit/v1");
assert.equal(report.status, "PASS");
assert.deepEqual(report.failures, []);
assert.equal(report.boundary.reviewOnly, true);
assert.equal(report.boundary.productionAdmission, false);
assert.equal(report.boundary.workspaceMutationPerformed, false);
assert.equal(report.boundary.currentPhaseMutationPerformed, false);
assert.equal(report.source.cursorPixelPolicy, "SOURCE_VIDEO_CURSOR_HIDDEN_TELEMETRY_ONLY");
assert.equal(report.shotcraftReference.license, "Apache-2.0");
assert.equal(report.shotcraftReference.copiedAssets, false);
assert.equal(report.shotcraftReference.copiedAudio, false);

for (const item of [report.directorPlan, report.props, report.noCursorControl.props, report.noCursorControl.frame, report.media, report.abReview, report.contactSheet, report.abReview.baseline, ...report.proofFrames]) {
  const file = path.join(root, item.path);
  assert.ok(fs.existsSync(file), `${item.path}:missing`);
  assert.equal(sha(file), item.sha256, `${item.path}:sha-mismatch`);
}
for (const item of report.implementation) assert.equal(sha(path.join(root, item.path)), item.sha256, `${item.path}:implementation-sha-mismatch`);
assert.equal(sha(path.join(root, report.source.videoPath)), report.source.videoSha256);
assert.equal(sha(path.join(root, report.source.reportPath)), report.source.reportSha256);

const props = JSON.parse(fs.readFileSync(path.join(root, report.props.path), "utf8"));
const director = JSON.parse(fs.readFileSync(path.join(root, report.directorPlan.path), "utf8"));
assert.equal(props.contract, "A1CleanTelemetryScreenCanary/v1");
assert.equal(props.sourceVideoSha256, report.source.videoSha256);
assert.ok(props.cursorTelemetry.moves.length >= 30);
assert.ok(props.cursorTelemetry.clicks.filter((item) => item.down).length >= 2);
assert.ok(props.actionFrame < props.resultFrame);
assert.equal(director.contract, "A1ScreenDirectorBrain/v1");
assert.deepEqual(director.beatMap.map((beat) => beat.technique), [
  "LOCK_WIDE",
  "SOURCE_ACTION_ONLY",
  "SOURCE_ACTION_ONLY",
  "CURSOR_PUNCH",
  "LOCK_WIDE",
  "HARD_CUT_STATE_REPLACE+RESULT_HOLD",
]);

assert.ok(report.checks.actualSourceBytesVerified);
assert.ok(report.checks.sameCaptureCursorTelemetry);
assert.ok(report.checks.cursorOverlayPixelDelta >= 60);
assert.ok(report.checks.actionPunchPixelDelta >= 5000);
assert.ok(report.checks.resultHoldStable);
assert.ok(report.checks.noSpotlight);
assert.ok(report.checks.noDecorativeSweep);
assert.ok(report.checks.noMotionBlur);
assert.ok(report.checks.noBreathing);
assert.equal(report.checks.sourcePlaybackRate, 1);
assert.ok(report.checks.fullDecode);
assert.equal(report.media.width, 960);
assert.equal(report.media.height, 540);
assert.equal(report.media.fps, "60/1");
assert.equal(report.media.frameCount, props.sourceFrameCount);

assert.equal(sha(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json")), report.boundary.workspaceShaAfter);
assert.equal(sha(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json")), report.boundary.currentPhaseShaAfter);
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
for (const media of [report.media, report.abReview]) {
  const decode = spawnSync(ffmpeg, ["-v", "error", "-i", path.join(root, media.path), "-f", "null", "-"], {encoding: "utf8"});
  assert.equal(decode.status, 0, decode.stderr);
}

console.log(JSON.stringify({
  contract: "A1CleanTelemetryScreenCanaryTest/v1",
  status: "PASS",
  reviewOnly: true,
  fullDecode: true,
  workspaceAndAuthorityUnchanged: true,
}, null, 2));
