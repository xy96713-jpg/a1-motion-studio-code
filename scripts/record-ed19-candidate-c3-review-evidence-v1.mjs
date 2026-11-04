#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const sourceRelativePath = ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/ed19-reference-attached-look-master-v1/candidate-c3.png";
const sourcePath = path.join(root, sourceRelativePath);
const publicRelativePath = "creator-packaging-candidate-decision-v1/ED-19-c3.png";
const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/${publicRelativePath}`;
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const protectedPhrases = ["Codex 在后台", "整理", "编排", "读取", "检查"];
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

if (!fs.existsSync(sourcePath)) throw new Error("ed19-c3-source-missing");
if (!fs.existsSync(ocrBinary)) throw new Error("ed19-c3-ocr-binary-missing");
const bytes = fs.readFileSync(sourcePath);
const artifactSha256 = sha256(bytes);
const metadata = await sharp(bytes).metadata();
if (metadata.format !== "png" || metadata.width !== 1672 || metadata.height !== 941) throw new Error("ed19-c3-raster-invalid");

const ocrRun = spawnSync(ocrBinary, [sourcePath], {encoding: "utf8"});
if (ocrRun.status !== 0) throw new Error(`ed19-c3-ocr-failed:${ocrRun.stderr.trim()}`);
const ocrRaw = JSON.parse(ocrRun.stdout.trim());
const acceptedSegments = (ocrRaw.segmentDetails || [])
  .filter((segment) => Number(segment.confidence) >= 0.5)
  .map((segment) => String(segment.text || "").trim())
  .filter(Boolean);
for (const phrase of protectedPhrases) {
  if (!acceptedSegments.includes(phrase)) throw new Error(`ed19-c3-protected-phrase-missing:${phrase}`);
}
if (acceptedSegments.some((segment) => !protectedPhrases.includes(segment))) throw new Error(`ed19-c3-high-confidence-extra-text:${acceptedSegments.join("|")}`);

const now = new Date().toISOString();
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.authority?.nextAction?.id !== "review-current-packaging-candidate-or-authorize-regeneration") throw new Error("ed19-c3-decision-gate-not-current");
  assert.deepEqual(current.production.authority.nextAction.targetShotIds, ["ED-19"]);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("ed19-c3-runtime-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("ed19-c3-assembly-forbidden");

  const decision = {
    contract: "A1CreatorPackagingCandidateDecisionEvidence/v1",
    status: "READY_FOR_USER_REVIEW",
    shotId: "ED-19",
    candidateId: "ED-19-c3",
    artifact: {publicUrl, sha256: artifactSha256, width: metadata.width, height: metadata.height, format: metadata.format},
    route: "semantic-crt-explainer",
    styleProfile: "minimal-retro-pixel-editorial-v2",
    primaryFamily: "retro-computer-window",
    informationOwner: "backstage-orchestration-machine",
    semanticAction: "four-operations-resolve-through-one-machine-to-one-verified-output",
    taitMechanisms: ["shared-square-pixel-lattice", "single-dominant-crt-workspace", "unequal-result-terminal", "sequence-trace"],
    evaRole: "TYPOGRAPHY_ONLY",
    palette: "neutral-cool-white-charcoal-cobalt",
    actualPixelReview: {
      status: "READY_FOR_REVIEW",
      onePrimaryActor: true,
      oneReadingPath: true,
      unequalWindowHierarchy: true,
      genericFlowchartRejectedAndRemoved: true,
      presenterPixelsUsedAsStyle: false,
      formalTextExactAtConfidenceThreshold: true,
      highConfidenceExtraTextDetected: false,
      visualDirectorRecommendation: "RECOMMEND_C3_FOR_CURRENT_PLAN_ADOPTION",
    },
    ocrAudit: {
      contract: "A1LocalVisionOCRAudit/v1",
      status: "PASS_PROTECTED_PHRASES_ONLY_AT_THRESHOLD",
      method: "MACOS_VISION_ACCURATE_ZH_EN",
      confidenceThreshold: 0.5,
      protectedPhrases,
      acceptedSegments,
      rawObservationCount: Number(ocrRaw.observationCount || 0),
      lowConfidenceNoiseObserved: (ocrRaw.segmentDetails || []).some((segment) => Number(segment.confidence) < 0.5),
    },
    attachmentManifestSha256: "2d9c392125169a180ea404ab6221f8ee7ce2b5b2b71ae5f3ba7958c909424aa5",
    sourceCandidateId: "ED-19-c2",
    sourceCandidateDisposition: "VISUAL_REJECTED_GENERIC_EQUAL_WINDOW_FLOWCHART",
    generatedAttemptCount: 1,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    assemblyCreated: false,
    motionStarted: false,
    resolveStarted: false,
    nextAction: "ADOPT_ED19_C3_OR_REJECT_AND_HOLD",
    reviewedAt: now,
  };
  decision.decisionEvidenceSha256 = sha256(JSON.stringify(decision));

  const next = structuredClone(current);
  next.production.creatorPackagingCandidateDecision = decision;
  const event = createProductionEvent({
    workspace: current,
    action: "record-ed19-candidate-c3-review-evidence",
    targetId: artifactSha256,
    payload: {contract: decision.contract, status: decision.status, shotId: "ED-19", candidateId: "ED-19-c3", artifactSha256, productionAdmission: false, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionStarted: false, resolveStarted: false},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `ed19-c3-review-evidence-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {"creator-packaging-candidate-decision-v1/ED-19-c3-review.json": decision},
    binaryFiles: {[publicRelativePath]: bytes},
  });
  return {status: decision.status, candidateId: decision.candidateId, artifactSha256, decisionEvidenceSha256: decision.decisionEvidenceSha256, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, nextAction: recalculated.production.authority.nextAction.id, userVisualApproval: decision.userVisualApproval, productionAdmission: decision.productionAdmission, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
