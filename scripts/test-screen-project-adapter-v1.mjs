#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertScreenProjectAdapter, compileScreenProjectAdapter} from "../apps/studio-next/src/lib/a1-screen-project-adapter-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sha = (char) => char.repeat(64);
const base = {
  source: {sha256: sha("a"), width: 1920, height: 1080, fps: 60},
  capture: {runtime: "PLAYWRIGHT_CDP", headedWindowCreated: false, projectUnchanged: true},
  sync: {contract: "A1VideoFrameSync/v1", status: "PASS", pixelMse: 1.7},
  behavior: {status: "PASS", manifestSha256: sha("b"), eventCount: 3},
  geometry: {mode: "DOM_LOCATOR", targetCount: 3, clickTargetProof: [{insideTarget: true, centerErrorPx: 0}]},
  director: {cameraPolicy: "LOCKED_SOURCE_DEFAULT"},
  actualPixel: {status: "PASS", fullDecodePass: true},
};
const browserDom = assertScreenProjectAdapter(compileScreenProjectAdapter({projectId: "blind-browser-dom", kind: "BROWSER_DOM", ...base}));
const browserCanvas = assertScreenProjectAdapter(compileScreenProjectAdapter({projectId: "blind-browser-canvas", kind: "BROWSER_CANVAS", ...base, geometry: {mode: "VISUAL_TRACK", targetCount: 2, clickTargetProof: [{insideTarget: true, centerErrorPx: 3}]}}));
const desktop = assertScreenProjectAdapter(compileScreenProjectAdapter({projectId: "blind-desktop", kind: "DESKTOP_NATIVE", ...base, capture: {runtime: "SCREENCAPTUREKIT", headedWindowCreated: false, projectUnchanged: true}, geometry: {mode: "ACCESSIBILITY_NODE", targetCount: 2, clickTargetProof: [{insideTarget: true, centerErrorPx: 2}]}}));
const videoOnly = assertScreenProjectAdapter(compileScreenProjectAdapter({projectId: "blind-video", kind: "VIDEO_ONLY", source: base.source, capture: {runtime: "VIDEO_FILE", headedWindowCreated: false, projectUnchanged: true}, sync: base.sync, geometry: {mode: "NONE", targetCount: 0}, director: base.director, actualPixel: base.actualPixel}));
const missingSync = compileScreenProjectAdapter({projectId: "missing-sync", kind: "BROWSER_DOM", ...base, sync: {...base.sync, status: "MISSING"}});
assert.equal(missingSync.status, "BLOCKED_CLEAN_SOURCE_ONLY");
assert.ok(missingSync.failures.includes("VIDEO_SYNC_NOT_PROVEN"));
const missHit = compileScreenProjectAdapter({projectId: "miss-hit", kind: "BROWSER_DOM", ...base, geometry: {mode: "DOM_LOCATOR", targetCount: 1, clickTargetProof: [{insideTarget: false, centerErrorPx: 200}]} });
assert.equal(missHit.status, "BLOCKED_CLEAN_SOURCE_ONLY");
assert.ok(missHit.failures.includes("CLICK_TARGET_PROOF_FAILED"));
const fixtures = [browserDom, browserCanvas, desktop, videoOnly];
const report = {
  contract: "A1ScreenProjectAdapterBlindMatrix/v1",
  status: "PASS",
  fixtures: fixtures.map((item) => ({projectId: item.project.projectId, kind: item.project.kind, status: item.status, adapterSha256: item.adapterSha256})),
  negativeControls: {missingSync: missingSync.failures, missHit: missHit.failures},
  boundary: {productionAdmission: false, sharedSourceMutation: false},
};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
const outputDir = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate");
fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(path.join(outputDir, "project-adapter-blind-matrix-v1.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
