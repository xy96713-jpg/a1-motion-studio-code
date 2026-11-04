#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileScreenProjectAdapter} from "../apps/studio-next/src/lib/a1-screen-project-adapter-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const capturePath = path.join(root, "work/cross-project-screen-validation-v1/personal-webgl-reference-field/capture-report.json");
const capture = JSON.parse(fs.readFileSync(capturePath, "utf8"));
const behaviorManifestSha256 = crypto.createHash("sha256").update(JSON.stringify({events: capture.events, targets: capture.domTargets, project: capture.project})).digest("hex");
const adapter = compileScreenProjectAdapter({
  projectId: capture.productId,
  kind: "BROWSER_CANVAS",
  source: {sha256: capture.output.sha256, width: capture.output.width, height: capture.output.height, fps: 60},
  capture: {runtime: "PLAYWRIGHT_CDP", headedWindowCreated: capture.headedWindowCreated, projectUnchanged: capture.project.unchanged},
  sync: {contract: "A1VideoFrameSync/v1", status: capture.captureSync.syncPass ? "PASS" : "MISSING", pixelMse: capture.captureSync.pixelMse},
  behavior: {status: "ALIAS_REVIEW_ONLY", manifestSha256: behaviorManifestSha256, eventCount: capture.events.length},
  geometry: {mode: "VISUAL_TRACK", targetCount: capture.geometryTruth.targets.length},
  director: {cameraPolicy: "LOCKED_SOURCE_DEFAULT"},
  actualPixel: {status: capture.output.fullDecodePass ? "PASS" : "FAIL", fullDecodePass: capture.output.fullDecodePass},
});
const report = {contract: "A1RealBrowserCanvasAdapterAudit/v1", status: adapter.status, captureReport: path.relative(root, capturePath), captureSync: capture.captureSync, adapter, boundary: {productionAdmission: false, sharedSourceMutation: false}};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
const outputPath = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/personal-webgl-adapter-audit-v1.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
