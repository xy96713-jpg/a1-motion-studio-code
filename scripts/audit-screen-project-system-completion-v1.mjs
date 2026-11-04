#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const adapter = read("work/reference-study-BV11Ren6REA4/post-production/owned-candidate/project-adapter-blind-matrix-v1.json");
const capture = read("work/cross-project-screen-validation-v1/englishflow-geometry-truth-v2/capture-report.json");
const feedback = read("work/reference-study-BV11Ren6REA4/post-production/owned-candidate/englishflow-feedback-owned-sync-v7.mp4.manifest.json");
const canvasAttempt = read("work/reference-study-BV11Ren6REA4/post-production/owned-candidate/personal-webgl-adapter-audit-v1.json");
const canvasNative = read("work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-cap-native-v1/report.json");
const failures = [];
const actualBrowserDomProof = capture.captureSync?.syncPass === true
  && capture.geometryTruth?.status === "PASS_REVIEW_ONLY"
  && capture.clickTargetProof?.length >= 3
  && capture.clickTargetProof.every((item) => item.insideTarget === true && item.centerErrorPx <= 4)
  && capture.output?.fullDecodePass === true;
if (!actualBrowserDomProof) failures.push("REAL_BROWSER_DOM_PROOF_INCOMPLETE");
if (adapter.status !== "PASS" || adapter.fixtures?.length !== 4 || adapter.negativeControls?.missingSync?.length < 1 || adapter.negativeControls?.missHit?.length < 1) failures.push("ADAPTER_BLIND_MATRIX_INCOMPLETE");
if (feedback.contract !== "A1GeometryFeedbackCanary/v1" || feedback.feedback?.cameraMode !== "NONE" || feedback.feedback?.timingBinding !== "ENDS_BEFORE_NATIVE_STATE") failures.push("FEEDBACK_CANARY_TIMING_POLICY_INCOMPLETE");
const realKinds = ["BROWSER_DOM", ...(canvasNative.status === "PASS_REVIEW_ONLY" ? ["BROWSER_CANVAS"] : [])];
const fixtureKinds = adapter.fixtures?.map((item) => item.kind) || [];
const gaps = [
  {id: "REAL_CANVAS_CAPTURE", status: canvasNative.status === "PASS_REVIEW_ONLY" ? "REVIEW_ONLY" : canvasAttempt.status === "BLOCKED_CLEAN_SOURCE_ONLY" ? "BLOCKED" : "OPEN", reason: canvasNative.status === "PASS_REVIEW_ONLY" ? "Native Cap/ScreenCaptureKit timestamp capture passes; pointer interaction evidence and formal behavior manifest are still open." : canvasAttempt.adapter?.failures?.includes("VIDEO_SYNC_NOT_PROVEN") ? `Live WebGL canvas was captured, but dynamic pixels defeated sync-frame matching (MSE ${canvasAttempt.captureSync?.pixelMse ?? "unknown"}); requires native timestamp capture or a stable sync marker.` : "BROWSER_CANVAS real proof remains incomplete."},
  {id: "REAL_DESKTOP_CAPTURE", status: "OPEN", reason: "DESKTOP_NATIVE is contract-tested only; no ScreenCaptureKit/accessibility-node canary is bound."},
  {id: "REAL_VIDEO_ONLY_MATRIX", status: "OPEN", reason: "VIDEO_ONLY has a fixture, but no independent manual/vision keyframe review report across a second source."},
  {id: "FORMAL_BEHAVIOR_MANIFEST", status: "OPEN", reason: "Generic browser proof still aliases behavior evidence; formal A1SourceBehaviorFidelity binding is not yet universal."},
  {id: "USER_VISUAL_APPROVAL", status: "OPEN", reason: "The current system authority remains review-gated and productionAdmission=false."},
  {id: "AUDIO_REVIEW", status: "OPEN", reason: "The feedback canary is muted/review-only; audio/narration timing has not been admitted."},
];
const report = {
  contract: "A1ScreenProjectSystemCompletionAudit/v1",
  status: failures.length ? "FAIL" : "IN_PROGRESS_NOT_COMPLETE",
  proof: {adapterBlindMatrix: adapter.status, fixtureKinds, realKinds, actualBrowserDomProof, realCanvasAttempt: {playwright: canvasAttempt.status, native: canvasNative.status, syncPixelMse: canvasAttempt.captureSync?.pixelMse}, feedbackProof: feedback.contract === "A1GeometryFeedbackCanary/v1"},
  checks: {fourKindContractCoverage: fixtureKinds.length === 4, negativeControls: true, realBrowserDom: actualBrowserDomProof, timingBoundFeedback: feedback.feedback?.timingBinding === "ENDS_BEFORE_NATIVE_STATE", productionAdmission: false},
  remainingGaps: gaps,
  boundary: {sharedSourceMutation: false, productionAdmission: false},
  failures,
};
report.auditSha256 = hash(report);
const outputPath = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/project-system-completion-audit-v1.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
