#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/all-sixteen-shot-v2");
const manifestPath = path.join(outputRoot, "manifest.json");
const reportPath = path.join(outputRoot, "continuity-audit.json");
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/all-sixteen-shot-v2/continuity-audit.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const failures = [];

if (manifest.scope !== "all" || manifest.shotIds?.length !== 16) failures.push("scope-or-shot-count");
if (manifest.status !== "READY_FOR_ACTUAL_PIXEL_REVIEW") failures.push("manifest-not-review-ready");
if (manifest.output?.fullDecodePass !== true || manifest.output?.blackInterruptions !== false) failures.push("media-integrity");
if (manifest.cameraAudit?.status !== "PASS") failures.push("camera-audit");
if (manifest.cache?.recipeInputs?.props?.boundaryTransitionFrames !== 18) failures.push("boundary-transition-contract");
if (!manifest.cache?.recipeInputs?.sourceMediaSha256?.length) failures.push("source-media-cache-identity");
for (const artifact of [manifest.output, manifest.contactSheet]) {
  const file = path.join(root, artifact.path);
  if (!fs.existsSync(file) || sha256(file) !== artifact.sha256) failures.push(`artifact-sha:${artifact.path}`);
}

const outputPath = path.join(root, manifest.output.path);
const scan = spawnSync(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-i", outputPath,
  "-vf", "select='gt(scene,0.02)',metadata=print:file=-",
  "-an", "-f", "null", "-",
], {encoding: "utf8"});
if (scan.status !== 0) failures.push("structural-scan-failed");
const events = [];
let timeSeconds = 0;
for (const line of String(scan.stdout || "").split(/\r?\n/u)) {
  const time = line.match(/pts_time:([0-9.]+)/u);
  if (time) timeSeconds = Number(time[1]);
  const score = line.match(/lavfi\.scene_score=([0-9.]+)/u);
  if (score) events.push({timeSeconds, score: Number(score[1])});
}
const maxStructuralSceneScore = Number(Math.max(0, ...events.map((event) => event.score)).toFixed(6));
const scenes = manifest.cache?.recipeInputs?.props?.scenes || [];
const fps = Number(manifest.cache?.recipeInputs?.props?.fps || 60);
let cumulativeFrames = 0;
const boundaries = [];
for (let index = 0; index < scenes.length - 1; index += 1) {
  cumulativeFrames += Math.round((scenes[index].durationMs / 1000) * fps);
  const boundarySeconds = cumulativeFrames / fps;
  const nearby = events.filter((event) => Math.abs(event.timeSeconds - boundarySeconds) <= .05);
  boundaries.push({
    fromShotId: scenes[index].shotId,
    toShotId: scenes[index + 1].shotId,
    boundarySeconds: Number(boundarySeconds.toFixed(6)),
    score: Number(Math.max(0, ...nearby.map((event) => event.score)).toFixed(6)),
  });
}
const maxBoundaryScore = Number(Math.max(0, ...boundaries.map((boundary) => boundary.score)).toFixed(6));
const hardBreaks = events.filter((event) => event.score >= .25);
if (maxStructuralSceneScore >= .25) failures.push(`single-frame-structural-break:${maxStructuralSceneScore}`);
if (maxBoundaryScore >= .1) failures.push(`scene-boundary-jump:${maxBoundaryScore}`);
if (hardBreaks.length) failures.push(`hard-break-count:${hardBreaks.length}`);

const report = {
  contract: "A1AllSixteenScreenContinuityAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  shotIds: manifest.shotIds,
  checks: {
    boundaryTransitionFrames: manifest.cache?.recipeInputs?.props?.boundaryTransitionFrames || null,
    maxStructuralSceneScore,
    singleFrameBreakThreshold: .25,
    maxBoundaryScore,
    boundaryJumpThreshold: .1,
    hardBreakCount: hardBreaks.length,
    cameraAuditPass: manifest.cameraAudit?.status === "PASS",
    fullDecodePass: manifest.output?.fullDecodePass === true,
    blackInterruptionsAbsent: manifest.output?.blackInterruptions === false,
    sourceMediaCacheIdentityBound: Boolean(manifest.cache?.recipeInputs?.sourceMediaSha256?.length),
  },
  boundaries,
  topStructuralEvents: [...events].sort((a, b) => b.score - a.score).slice(0, 30),
  output: manifest.output,
  contactSheet: manifest.contactSheet,
  boundary: {candidateOnly: true, productionAdmission: false, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"},
  failures,
  auditedAt: new Date().toISOString(),
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.mkdirSync(path.dirname(artifactPath), {recursive: true});
fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
