#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {automaticallyAdmitReferenceMatureShot, createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {runVisualMaturityCritic} from "../apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRelative = "generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02";
const publicRoot = path.join(appRoot, "public", publicRelative);
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/operation-traces/ED-02");
const force = process.argv.includes("--force");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const operation = workspace.production.operationOrchestration;
if (!operation?.preview || operation.currentShotId !== "ED-02") throw new Error("operation-packaging-proof-not-ready");
const proof = readJson(path.join(publicRoot, "operation-packaging-proof.json"));
const trace = readJson(path.join(publicRoot, "interaction-trace.json"));
const performance = readJson(path.join(publicRoot, "screen-performance-ir.json"));
if (proof.sha256 !== operation.preview.sha256 || proof.sourceTraceSha256 !== trace.sha256 || proof.sourcePerformanceSha256 !== performance.sha256) throw new Error("operation-packaging-proof-source-stale");
if (!Array.isArray(proof.reviewFrames) || proof.reviewFrames.length !== trace.events.length || trace.events.length !== 5) throw new Error("operation-packaging-review-frames-invalid");

const images = proof.reviewFrames.map((item) => {
  const file = path.join(appRoot, "public", item.publicUrl.replace(/^\//u, ""));
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== item.sha256) throw new Error(`operation-packaging-review-frame-stale:${item.eventType}`);
  return file;
});
const candidates = proof.reviewFrames.map((item, index) => ({
  candidateId: `ED-02-operation-${String(index + 1).padStart(2, "0")}-${item.eventType}`,
  direction: `真实操作连续状态 ${index + 1}/5：${item.eventType}。按时间顺序评估，不是互斥构图候选。`,
  expectedText: null,
  imagePublicUrl: item.publicUrl,
}));
const sourceReport = readJson(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/source-cache/causal-writing-workbench-v1/report.json"));
const report = await runVisualMaturityCritic({
  scope: "sequence-contact-sheet",
  images,
  candidates,
  context: {
    articleTitle: workspace.article.title,
    shotId: "ED-02",
    editMode: "screen-demo",
    chronological: true,
    durationMs: proof.durationMs,
    eventTypes: trace.events.map((event) => event.eventType),
    sourceBoundChecks: sourceReport.checks,
    sourceBoundOperationOverlay: proof.sourceBoundOperationOverlayUsed === true,
    candidateSetPolicy: {mode: "chronological-operation-states", sharedRealSurfaceRequired: true, alternatives: false},
    referenceRequirement: "Judge the five images as chronological evidence of one premium real-screen operation package: native drag selection, real candidate appearance, actual candidate press, contenteditable typing, and accepted result hold. The same sentence and screen coordinate must remain the causal anchor. Shared real UI topology is required and must not be penalized as template reuse. Require deliberate near→wide→medium→near density, readable source text, visible pointer/caret, source-bound click feedback, and a stable final hold. Reject fake UI, detached labels, explanatory HUD, arbitrary arrows, generic bottom strips, decorative lines, screenshot crossfades, or camera motion that loses the sentence.",
    dimensionInterpretation: {
      silhouette: "For screen-demo, score camera density, side-panel ingress/egress and selection/result shapes; do not require unrelated poster silhouettes.",
      typeRoles: "Score the real selected sentence, candidate copy, input caret, line-bound trace and accepted result as text actors; do not require detached giant display typography.",
      depthOcclusion: "Score native selection menu, candidate panel, focus veil, pointer/button press and source-bound crop depth.",
      transitionHandoff: "Score whether the selected sentence hands off to the chosen candidate and returns to the exact insertion point.",
    },
    benchmark: "Reference maturity remains 22/24 with zero hard failures. Screen-specific interpretation does not lower the threshold.",
  },
  cacheDir: path.join(artifactRoot, "visual-critic-cache"),
  force,
});

const passed = report.verdict === "PASS" && report.totalScore >= 22 && report.hardFailures.length === 0;
const now = new Date().toISOString();
const reportSha256 = sha256(report);
const reportName = "operation-packaging-critic-v1-latest.json";
writeJson(path.join(publicRoot, reportName), report);
writeJson(path.join(artifactRoot, reportName), report);

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentOperation = current.production.operationOrchestration;
  if (currentOperation?.preview?.sha256 !== proof.sha256 || currentOperation.trace.sha256 !== trace.sha256) throw new Error("operation-packaging-critic-workspace-stale");
  let next = structuredClone(current);
  const nextOperation = structuredClone(currentOperation);
  nextOperation.visualReview = {
    contract: "A1OperationPackagingVisualReview/v1",
    verdict: passed ? "PASS" : report.verdict,
    totalScore: report.totalScore,
    maxScore: 24,
    hardFailures: report.hardFailures,
    referenceMaturity: passed,
    sourceProofSha256: proof.sha256,
    reportPublicUrl: `/${publicRelative}/${reportName}`,
    reportSha256,
    reviewedAt: now,
  };
  nextOperation.nextAction = passed ? "continue-automatic-shot-production" : "revise-operation-packaging-from-visual-critic";
  delete nextOperation.sha256;
  nextOperation.sha256 = sha256(nextOperation);
  next.production.operationOrchestration = nextOperation;
  if (passed && next.production.automationPolicy?.automaticCandidateAdmission === true) {
    const operationShot = next.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-02");
    if (!operationShot) throw new Error("operation-shot-composition-missing");
    next = automaticallyAdmitReferenceMatureShot(next, operationShot.id, now, `系统动态审美门禁 ${report.totalScore}/24 自动采用真实操作序列。`);
  }
  next.production.maturityLoop.operationReports ||= {};
  next.production.maturityLoop.operationReports["ED-02"] = {
    contract: "A1OperationPackagingVisualReview/v1",
    ...nextOperation.visualReview,
  };
  next.production.maturityLoop.rounds.push({
    contract: "A1VisualMaturityRound/v1",
    targetType: "screen-operation-sequence",
    targetId: "ED-02",
    round: (next.production.maturityLoop.rounds.filter((item) => item.targetType === "screen-operation-sequence" && item.targetId === "ED-02").length || 0) + 1,
    verdict: nextOperation.visualReview.verdict,
    score: report.totalScore,
    maxScore: 24,
    hardFailures: report.hardFailures,
    reportSha256,
    sourceProofSha256: proof.sha256,
    completedAt: now,
  });
  next.production.maturityLoop.rounds = next.production.maturityLoop.rounds.slice(-200);
  next.production.maturityLoop.updatedAt = now;
  const event = createProductionEvent({workspace: current, action: passed ? "operation-packaging-visual-critic-passed" : "operation-packaging-visual-critic-revision-required", targetId: "ED-02", payload: {proofSha256: proof.sha256, reportSha256, totalScore: report.totalScore, hardFailures: report.hardFailures, reviewOnly: true}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return recalculated;
});

console.log(JSON.stringify({
  status: passed ? "PASS_AUTO_ADMITTED" : report.verdict,
  shotId: "ED-02",
  score: report.totalScore,
  maxScore: 24,
  hardFailures: report.hardFailures,
  referenceMaturity: passed,
  acceptedShotIrAllowed: updated.production.operationOrchestration.gates.acceptedShotIrAllowed,
  reportPublicUrl: `/${publicRelative}/${reportName}`,
  nextAction: updated.production.operationOrchestration.nextAction,
}, null, 2));
