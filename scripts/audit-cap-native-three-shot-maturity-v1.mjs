#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const family = "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2";
const capRoot = path.join(root, family, "cap-native-v1");
const canaryRoot = path.join(root, family, "event-directed-canary-v1");
const plansPath = path.join(root, family, "shot-performance-plans.json");
const manifestPath = path.join(canaryRoot, "manifest.json");
const overridesPath = path.join(root, "apps/studio-next/src/data/system-line-screen-demo-overrides-v1.json");
const shotIds = ["ED-03", "ED-24", "ED-26"];
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const failures = [];

const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
const actualShotIds = Array.isArray(manifest.shotIds) ? manifest.shotIds : [];
const artifactIdentityDrift = JSON.stringify(actualShotIds) !== JSON.stringify(shotIds);
if (plans.status !== "PASS") failures.push("compiled-plans-not-pass");
if (manifest.status !== "READY_FOR_ACTUAL_PIXEL_REVIEW") failures.push("canary-not-review-ready");
if (artifactIdentityDrift) failures.push("CANARY_ARTIFACT_IDENTITY_DRIFT");
if (manifest.cameraAudit?.status !== "PASS" || manifest.output?.fullDecodePass !== true || manifest.output?.blackInterruptions !== false) failures.push("canary-media-or-camera");
if (!manifest.cache?.recipeInputs?.renderScriptSha256) failures.push("render-script-not-cache-bound");
for (const artifact of [manifest.output, manifest.contactSheet]) {
  const file = path.join(root, artifact.path);
  if (!fs.existsSync(file) || sha256(file) !== artifact.sha256) failures.push(`canary-artifact-sha:${artifact.path}`);
}
const canaryStructuralScan = spawnSync(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-i", path.join(root, manifest.output.path),
  "-vf", "select='gt(scene,0.02)',metadata=print:file=-",
  "-an", "-f", "null", "-",
], {encoding: "utf8"});
if (canaryStructuralScan.status !== 0) failures.push("canary-structural-scan-failed");
const canaryStructuralEvents = [];
let structuralTime = 0;
for (const line of String(canaryStructuralScan.stdout || "").split(/\r?\n/u)) {
  const timeMatch = line.match(/pts_time:([0-9.]+)/u);
  if (timeMatch) structuralTime = Number(timeMatch[1]);
  const scoreMatch = line.match(/lavfi\.scene_score=([0-9.]+)/u);
  if (scoreMatch) canaryStructuralEvents.push({timeSeconds: structuralTime, score: Number(scoreMatch[1])});
}
const maxCanaryStructuralSceneScore = Number(Math.max(0, ...canaryStructuralEvents.map((event) => event.score)).toFixed(6));
const sceneBoundarySeconds = [6.04, 16.66];
const boundaryStructuralScores = sceneBoundarySeconds.map((boundarySeconds) => {
  const event = canaryStructuralEvents.find((candidate) => Math.abs(candidate.timeSeconds - boundarySeconds) <= .05);
  return {boundarySeconds, score: Number((event?.score || 0).toFixed(6))};
});
if (maxCanaryStructuralSceneScore >= .15) failures.push(`canary-structural-jump:${maxCanaryStructuralSceneScore}`);
if (boundaryStructuralScores.some((item) => item.score >= .08)) failures.push(`canary-scene-boundary-jump:${boundaryStructuralScores.map((item) => item.score).join(",")}`);

const shotChecks = [];
let sceneStartFrame = 0;
for (const shotId of shotIds) {
  const slug = shotId.toLowerCase();
  const reportPath = path.join(capRoot, `${slug}-report.json`);
  const auditPath = path.join(capRoot, `${slug}-audit.json`);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  const override = overrides.entries.find((entry) => entry.shotId === shotId);
  const plan = plans.shots.find((shot) => shot.shotId === shotId);
  const bindings = report.narrationBinding?.bindings || [];
  const expectedFocusFrame = sceneStartFrame + Math.round((bindings[0].eventTimeMs / 1000) * 60);
  const expectedResultFrame = sceneStartFrame + Math.round((bindings.at(-1).eventTimeMs / 1000) * 60);
  const focusFrame = manifest.frames.find((frame) => frame.shotId === shotId && frame.label === "focus");
  const resultFrame = manifest.frames.find((frame) => frame.shotId === shotId && frame.label === "result");
  const stableRoles = audit.checks?.evidenceRoles?.filter((item) => item.expected === "STABLE_RESULT_HOLD") || [];
  const shotFailures = [];
  if (audit.status !== "PASS" || audit.failures?.length) shotFailures.push("candidate-audit");
  if (override?.capNativeCandidate?.reportSha256 !== sha256(reportPath) || override?.capNativeCandidate?.auditSha256 !== sha256(auditPath)) shotFailures.push("override-sha-binding");
  if (plan?.screenDirection?.cameraModel !== "CAP_NATIVE_RENDERED_NO_A1_CAMERA" || !plan?.cameraTrack?.every((keyframe) => keyframe.scale === 1)) shotFailures.push("a1-camera-not-disabled");
  if (plan?.screenDirection?.narrationActionTrack?.timingSource !== "CAP_NATIVE_EXACT_SRT_CUE_EVENT_BINDING") shotFailures.push("narration-binding-not-cap-native");
  if (focusFrame?.frame !== expectedFocusFrame || resultFrame?.frame !== expectedResultFrame) shotFailures.push("semantic-review-frame-drift");
  for (const frame of [focusFrame, resultFrame]) {
    const file = path.join(canaryRoot, frame?.file || "");
    if (!frame || !fs.existsSync(file) || sha256(file) !== frame.sha256) shotFailures.push(`review-frame-sha:${frame?.label || "missing"}`);
  }
  if (stableRoles.some((item) => item.localDelta > .02)) shotFailures.push("result-hold-unstable");
  if (Number(audit.checks?.maxAdjacentMeanDelta) >= .12) shotFailures.push("flash-threshold");
  if (Number(audit.checks?.maxStructuralSceneScore) >= .15) shotFailures.push("structural-jump-threshold");
  if (shotId === "ED-26") {
    if (report.semanticProof?.engine !== "codex" || report.semanticProof?.candidateCount < 3 || report.semanticProof?.preferApplied !== true) shotFailures.push("real-codex-preference-proof");
    if (report.semanticProof?.cacheProof?.status !== "HIT" || report.semanticProof?.cacheProof?.keySha256 !== report.semanticProof?.prewarmProof?.cacheProof?.keySha256) shotFailures.push("cache-proof");
  }
  failures.push(...shotFailures.map((failure) => `${shotId}:${failure}`));
  shotChecks.push({shotId, status: shotFailures.length ? "FAIL" : "PASS", expectedFocusFrame, expectedResultFrame, stableHoldDeltas: stableRoles.map((item) => item.localDelta), maxAdjacentMeanDelta: audit.checks?.maxAdjacentMeanDelta, maxStructuralSceneScore: audit.checks?.maxStructuralSceneScore, failures: shotFailures});
  sceneStartFrame += Math.round((plan.durationMs / 1000) * 60);
}

const ed26ResultFrame = manifest.frames.find((frame) => frame.shotId === "ED-26" && frame.label === "result");
const ed26Result = ed26ResultFrame ? path.join(canaryRoot, ed26ResultFrame.file) : null;
const ed26Evidence = path.join(capRoot, "ed-26-cue-85-candidates_with_memory_hold.png");
let ed26ResultEvidenceDelta = null;
if (ed26Result && fs.existsSync(ed26Result) && fs.existsSync(ed26Evidence)) {
  const [renderedPixels, evidencePixels] = await Promise.all([ed26Result, ed26Evidence].map((file) => sharp(file).resize(320, 180).removeAlpha().grayscale().raw().toBuffer()));
  let pixelSum = 0;
  for (let index = 0; index < renderedPixels.length; index += 1) pixelSum += Math.abs(renderedPixels[index] - evidencePixels[index]);
  ed26ResultEvidenceDelta = Number((pixelSum / renderedPixels.length / 255).toFixed(6));
  if (ed26ResultEvidenceDelta > .02) failures.push(`ED-26:result-evidence-pixel-drift:${ed26ResultEvidenceDelta}`);
} else {
  failures.push("ED-26:result-evidence-frame-missing");
}

const report = {
  contract: "A1CapNativeThreeShotMaturityAudit/v1",
  status: artifactIdentityDrift ? "BLOCKED" : failures.length ? "FAIL" : "PASS",
  shotIds,
  expectedShotIds: shotIds,
  actualShotIds,
  checks: {
    compiledPlansPass: plans.status === "PASS",
    candidateAuditsPass: shotChecks.every((shot) => shot.status === "PASS"),
    semanticReviewFramesBound: shotChecks.every((shot) => !shot.failures.includes("semantic-review-frame-drift")),
    renderScriptCacheBound: Boolean(manifest.cache?.recipeInputs?.renderScriptSha256),
    canaryCameraAuditPass: manifest.cameraAudit?.status === "PASS",
    fullDecodePass: manifest.output?.fullDecodePass === true,
    blackInterruptionsAbsent: manifest.output?.blackInterruptions === false,
    maxCanaryStructuralSceneScore,
    canaryStructuralJumpThreshold: .15,
    boundaryStructuralScores,
    sceneBoundaryJumpThreshold: .08,
    ed26ResultEvidenceDelta,
  },
  shots: shotChecks,
  output: {...manifest.output},
  contactSheet: {...manifest.contactSheet},
  boundary: {candidateOnly: true, productionAdmission: false, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"},
  failures,
  auditedAt: new Date().toISOString(),
};
const outputPath = path.join(canaryRoot, "three-shot-maturity-audit.json");
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/event-directed-canary-v1/three-shot-maturity-audit.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
fs.mkdirSync(path.dirname(artifactPath), {recursive: true});
fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
