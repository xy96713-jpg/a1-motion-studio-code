#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const familyRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2");
const plans = JSON.parse(fs.readFileSync(path.join(familyRoot, "shot-performance-plans.json"), "utf8"));
const overrides = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/system-line-screen-demo-overrides-v1.json"), "utf8"));
const expectedShotIds = ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-20", "ED-21", "ED-22", "ED-23", "ED-24", "ED-25", "ED-26", "ED-27", "ED-28", "ED-29", "ED-30"];
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shotById = new Map(plans.shots.map((shot) => [shot.shotId, shot]));
const overrideById = new Map(overrides.entries.map((entry) => [entry.shotId, entry]));
const nativeShotIds = [];
const nonNativeShotIds = [];
const stillSegmentShotIds = [];
const captureBindingFailures = [];
for (const shotId of expectedShotIds) {
  const shot = shotById.get(shotId);
  const entry = overrideById.get(shotId);
  const native = shot?.screenDirection?.cameraModel === "CAP_NATIVE_RENDERED_NO_A1_CAMERA"
    && shot?.screenDirection?.narrationActionTrack?.timingSource === "CAP_NATIVE_EXACT_SRT_CUE_EVENT_BINDING"
    && shot?.cameraTrack?.every((keyframe) => keyframe.scale === 1)
    && shot?.sourceSegments?.every((segment) => segment.kind === "video");
  if (native) nativeShotIds.push(shotId); else nonNativeShotIds.push(shotId);
  if (shot?.sourceSegments?.some((segment) => segment.kind !== "video")) stillSegmentShotIds.push(shotId);
  if (!native) continue;
  const candidate = entry?.capNativeCandidate;
  if (!candidate) { captureBindingFailures.push(`${shotId}:candidate-binding-missing`); continue; }
  for (const [kind, publicUrl, expectedSha] of [["report", candidate.reportPublicUrl, candidate.reportSha256], ["audit", candidate.auditPublicUrl, candidate.auditSha256]]) {
    const file = path.join(root, "apps/studio-next/public", publicUrl || "");
    if (!publicUrl || !expectedSha || !fs.existsSync(file) || sha256(file) !== expectedSha) captureBindingFailures.push(`${shotId}:${kind}-sha-drift`);
  }
}
const failures = [];
if (JSON.stringify(plans.screenEvidenceShotIds) !== JSON.stringify(expectedShotIds)) failures.push("SCREEN_SHOT_MEMBERSHIP_DRIFT");
if (nativeShotIds.length !== expectedShotIds.length) failures.push("NATIVE_SCREEN_CAPTURE_COVERAGE_INCOMPLETE");
if (stillSegmentShotIds.length) failures.push("STATIC_HOLD_SEGMENTS_FORBIDDEN");
if (captureBindingFailures.length) failures.push("CAPTURE_REPORT_BINDING_INVALID");
const report = {
  contract: "A1MatureScreenCaptureAdmissionAudit/v1",
  status: failures.length ? "BLOCKED" : "PASS",
  expectedShotCount: expectedShotIds.length,
  nativeCaptureShotCount: nativeShotIds.length,
  expectedShotIds,
  nativeShotIds,
  nonNativeShotIds,
  stillSegmentShotIds,
  captureBindingFailures,
  requiredStack: {
    deterministicInteraction: "PLAYWRIGHT_REAL_PRODUCT_DOM",
    nativeCaptureAndCursor: "CAP_NATIVE_PROJECT",
    narrationEventBinding: "EXACT_SRT_CUE_TO_CAPTURE_EVENT",
    editorialTimeline: "DAVINCI_RESOLVE_60FPS_NATIVE_TIMELINE",
    validation: ["FULL_DECODE", "NO_BLACK_INTERRUPTION", "IMMUTABLE_REPORT_SHA", "ACTUAL_PIXEL_REVIEW"],
  },
  forbiddenProductionPaths: ["A1_SYNTHETIC_CAMERA", "STATIC_SCREENSHOT_MONTAGE", "SYNTHETIC_CURSOR", "UNBOUND_ATTEMPT_OUTPUT"],
  productionAdmission: failures.length === 0,
  assemblyAllowed: failures.length === 0,
  userVisualApproval: "NOT_APPROVED",
  failures,
  auditedAt: new Date().toISOString(),
};
const publicPath = path.join(familyRoot, "mature-screen-capture-admission-v1.json");
const artifactPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/mature-screen-capture-admission-v1.json");
for (const file of [publicPath, artifactPath]) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`); }
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
