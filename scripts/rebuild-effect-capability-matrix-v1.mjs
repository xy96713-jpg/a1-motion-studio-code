#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {SCREEN_PACKAGING_EFFECTS} from "../apps/studio-next/src/lib/a1-screen-packaging-effect-ontology-v1.mjs";
import {inspectEvidenceBindings, isEvidencePass, summarizeFindings, writeAudit} from "./lib/screen-validation-evidence-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const sha = (relative) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const output = "work/screen-recording-maturity-test-v1/effect-capability-matrix.json";
const sources = [
  "work/screen-recording-maturity-test-v1/motion-dynamics-v1/effect-capability-matrix.json",
  "work/screen-recording-maturity-test-v1/article-motion-batch-v1/render/effect-capability-matrix.json",
  "work/screen-recording-maturity-test-v1/menu-maturity-batch-v1/effect-capability-matrix.json",
  "work/screen-recording-maturity-test-v1/drag-batch-v1/render/effect-capability-matrix.json",
  "work/screen-recording-maturity-test-v1/annotation-batch-v1/render/effect-capability-matrix.json",
  "work/screen-recording-maturity-test-v1/editor-state-maturity-batch-v1/effect-capability-matrix.json",
  "work/screen-recording-maturity-test-v1/layout-maturity-batch-v1/effect-capability-matrix.json",
];
const rank = {PASS_REAL: 5, PASS_REVIEW_ONLY: 4, NOT_IMPLEMENTED: 3, BLOCKED_REQUIRED_EVIDENCE: 2, NOT_APPLICABLE: 1};
const collected = new Map();
for (const source of sources) {
  if (!fs.existsSync(path.join(root, source))) continue;
  const body = read(source);
  for (const row of body.items || body.effects || []) {
    const current = collected.get(row.id);
    if (!current || (rank[row.status] || 0) > (rank[current.status] || 0)) collected.set(row.id, {...row, source});
  }
}
const motionAuditPath = "work/screen-recording-maturity-test-v1/motion-dynamics-v1/audit-report.json";
if (fs.existsSync(path.join(root, motionAuditPath))) {
  const motionAudit = read(motionAuditPath);
  if (motionAudit.status === "PASS_REVIEW_ONLY" && motionAudit.checks?.realCursorTelemetryReplayed === true && motionAudit.checks?.finalWideHoldAtLeastOneSecond === true) {
    collected.set("IDLE_CURSOR_HIDE", {id: "IDLE_CURSOR_HIDE", status: "PASS_REAL", evidence: "motion-dynamics-v1 real cursor telemetry ends before the stable final hold", reason: "cursor is absent after the captured telemetry and the final wide hold remains clean", source: motionAuditPath});
  }
}
const bubbleAuditPath = "work/screen-recording-maturity-test-v1/camera-bubble-reflow-review-v1/audit-report.json";
if (fs.existsSync(path.join(root, bubbleAuditPath))) {
  const bubbleAudit = read(bubbleAuditPath);
  if (bubbleAudit.status === "PASS_REVIEW_ONLY" && bubbleAudit.output?.fullDecodePass === true && bubbleAudit.pixelProof?.nonZeroDelta === true) {
    collected.set("CAMERA_BUBBLE_REFLOW", {id: "CAMERA_BUBBLE_REFLOW", status: "PASS_REVIEW_ONLY", evidence: "camera-bubble-reflow-review-v1 real presenter source moves through three safe positions over a real screen", reason: "real presenter overlay and encoded pixel delta are verified in review-only mode", source: bubbleAuditPath});
  }
}
const retryAuditPath = "work/screen-recording-maturity-test-v1/retry-montage-evidence-v1/audit-report.json";
if (fs.existsSync(path.join(root, retryAuditPath))) {
  const retryAudit = read(retryAuditPath);
  if (retryAudit.status === "PASS_REVIEW_ONLY" && retryAudit.output?.fullDecodePass === true && retryAudit.retryIntervals?.some((row) => row.status === "FAILED") && retryAudit.retryIntervals?.some((row) => row.status === "SUCCEEDED")) {
    collected.set("RETRY_MONTAGE", {id: "RETRY_MONTAGE", status: "PASS_REVIEW_ONLY", evidence: "retry-montage-evidence-v1 real temporary-document failed save followed by successful save", reason: "real failed and successful attempts are captured, adapter-compiled, and encoded into a review montage", source: retryAuditPath});
  }
}
const causalDragAuditPath = "work/screen-recording-maturity-test-v1/causal-drag-effect-audit.json";
if (fs.existsSync(path.join(root, causalDragAuditPath))) {
  const causalDragAudit = read(causalDragAuditPath);
  if (causalDragAudit.status === "PASS_REVIEW_ONLY" && causalDragAudit.effect?.status === "PASS_REAL") {
    collected.set("DRAG_PATH_FOLLOW", {id: "DRAG_PATH_FOLLOW", status: "PASS_REAL", evidence: causalDragAudit.effect.evidence, reason: "real writing workbench native pointer drag selection and downstream product action are bound to one source video", source: causalDragAuditPath});
  }
}
const realRetryAuditPath = "work/screen-recording-maturity-test-v1/real-retry-effect-audit.json";
if (fs.existsSync(path.join(root, realRetryAuditPath))) {
  const realRetryAudit = read(realRetryAuditPath);
  if (realRetryAudit.status === "PASS_REVIEW_ONLY" && realRetryAudit.effect?.status === "PASS_REAL") {
    collected.set("RETRY_MONTAGE", {id: "RETRY_MONTAGE", status: "PASS_REAL", evidence: realRetryAudit.effect.evidence, reason: "real failed and successful product attempts are ordered, pointer-bound, persisted, and decoded", source: realRetryAuditPath});
  }
}
const realPrivacyAuditPath = "work/screen-recording-maturity-test-v1/real-privacy-effect-audit.json";
if (fs.existsSync(path.join(root, realPrivacyAuditPath))) {
  const realPrivacyAudit = read(realPrivacyAuditPath);
  if (realPrivacyAudit.status === "PASS_REVIEW_ONLY" && realPrivacyAudit.effect?.status === "PASS_REAL") {
    collected.set("PRIVACY_BLUR", {id: "PRIVACY_BLUR", status: "PASS_REAL", evidence: realPrivacyAudit.effect.evidence, reason: "source-bound test-account text range, encoded blur delta, and unchanged source are verified", source: realPrivacyAuditPath});
  }
}
const realBubbleAuditPath = "work/screen-recording-maturity-test-v1/real-camera-bubble-effect-audit.json";
if (fs.existsSync(path.join(root, realBubbleAuditPath))) {
  const realBubbleAudit = read(realBubbleAuditPath);
  if (realBubbleAudit.status === "PASS_REVIEW_ONLY" && realBubbleAudit.effect?.status === "PASS_REAL") {
    collected.set("CAMERA_BUBBLE_REFLOW", {id: "CAMERA_BUBBLE_REFLOW", status: "PASS_REAL", evidence: realBubbleAudit.effect.evidence, reason: "real presenter source is source-bound, reflowed through three safe positions, and pixel-proven", source: realBubbleAuditPath});
  }
}
const realLayoutAuditPath = "work/screen-recording-maturity-test-v1/real-layout-effects-audit.json";
if (fs.existsSync(path.join(root, realLayoutAuditPath))) {
  const realLayoutAudit = read(realLayoutAuditPath);
  if (realLayoutAudit.status === "PASS_REVIEW_ONLY") {
    for (const effect of realLayoutAudit.effects || []) if (effect.status === "PASS_REAL") collected.set(effect.id, {id: effect.id, status: "PASS_REAL", evidence: effect.evidence, reason: "real source pixels, bounded geometry, full decode, and encoded frame proof are verified", source: realLayoutAuditPath});
  }
}
const realFileDropAuditPath = "work/screen-recording-maturity-test-v1/real-file-drop-v1/render/audit-report.json";
if (fs.existsSync(path.join(root, realFileDropAuditPath))) {
  const realFileDropAudit = read(realFileDropAuditPath);
  if (realFileDropAudit.status === "PASS_REVIEW_ONLY" && realFileDropAudit.effect?.status === "PASS_REAL") {
    collected.set("DRAG_TETHER", {id: "DRAG_TETHER", status: "PASS_REAL", evidence: realFileDropAudit.effect.evidence, reason: "real product drop zone accepted an actual local file through a real browser drop event with source-bound pointer path", source: realFileDropAuditPath});
  }
}
collected.set("CLICK_RIPPLE", {id: "CLICK_RIPPLE", status: "POLICY_DISABLED", evidence: "mature source-led interaction policy", reason: "decorative click rings are disabled; press feedback and real state change carry the interaction", source: "policy"});
collected.set("TYPE_SPEED_RAMP", {id: "TYPE_SPEED_RAMP", status: "POLICY_DISABLED", evidence: "mature real-input policy", reason: "visible typing stays at captured speed; only verified idle waits may compress", source: "policy"});
const items = SCREEN_PACKAGING_EFFECTS.map((effect) => {
  const row = collected.get(effect.id);
  if (effect.id === "CAMERA_BUBBLE_REFLOW") return {id: effect.id, family: effect.family, status: "OUT_OF_SCOPE", reason: "This task covers real screen recordings and related post effects, excluding presenter footage."};
  if (!row) return {id: effect.id, family: effect.family, status: "BLOCKED_REQUIRED_EVIDENCE", reason: "没有可绑定证据", source: null};
  if (row.status === "POLICY_DISABLED") return {id: effect.id, family: effect.family, ...row};
  const sourceFiles = [row.source];
  if (row.source.endsWith("effect-capability-matrix.json")) sourceFiles.push(path.posix.join(path.posix.dirname(row.source), "audit-report.json"));
  const evidenceSources = sourceFiles.filter((file) => fs.existsSync(path.join(root, file))).map((file) => ({path: file, sha256: sha(file)}));
  const bindingAudit = inspectEvidenceBindings(root, evidenceSources);
  const companion = sourceFiles.at(-1);
  const body = fs.existsSync(path.join(root, companion)) ? read(companion) : {};
  const controlledFixture = body.source?.controlledFixture === true;
  // Keep legacy implementation evidence, but never promote prose/MAE/decode claims to visual acceptance.
  return {id: effect.id, family: effect.family, status: bindingAudit.status !== "PASS" ? "STALE_EVIDENCE" : "REVIEW_REQUIRED", claimedStatus: row.status, evidence: row.evidence, source: row.source, evidenceSources, evidenceBindingStatus: bindingAudit.status, evidenceFailures: bindingAudit.failures, controlledFixture, visualAcceptance: "NOT_REVIEWED", generalization: "NOT_QUALIFIED", reason: bindingAudit.status !== "PASS" ? "Declared evidence does not match current files." : controlledFixture ? "A controlled fixture cannot establish real-product maturity." : "Bound implementation evidence retained; scenario suitability and continuous playback acceptance are still required."};
});
const counts = Object.fromEntries([...new Set(items.map((item) => item.status))].map((status) => [status, items.filter((item) => item.status === status).length]));
const report = {contract: "A1ScreenRecordingMaturityEffectMatrix/v2", ...summarizeFindings(items), items, counts, sources: [...new Set(items.flatMap((item) => (item.evidenceSources || []).map((entry) => entry.path)))].map((source) => ({path: source, sha256: sha(source)})), boundary: {reviewOnly: true, productionAdmission: false, formal34ShotMutation: false}};
report.sha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
report.producer = {path: "scripts/rebuild-effect-capability-matrix-v1.mjs", sha256: sha("scripts/rebuild-effect-capability-matrix-v1.mjs")};
writeAudit(root, output, report, report.sources);
console.log(JSON.stringify({status: report.status, counts, output, sha256: report.sha256}, null, 2));
if (!isEvidencePass(report.status)) process.exitCode = 1;
