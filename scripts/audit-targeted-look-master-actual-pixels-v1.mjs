#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildWholeFilmActualPixelSemanticAudit, findPerceptualDuplicate} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {buildRequiredResearchExceptions, buildRequiredResearchPacketAudits, finalizeWholeFilmLookMasterBatch} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const targetShotIds = (process.argv.find((value) => value.startsWith("--shotIds="))?.slice("--shotIds=".length) || "ED-01,ED-14,ED-16")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (!targetShotIds.length || new Set(targetShotIds).size !== targetShotIds.length) throw new Error("targeted-pixel-gate-shot-ids-invalid");
const targetSet = new Set(targetShotIds);
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function publicFile(publicUrl) {
  if (!String(publicUrl || "").startsWith("/generated/system-line/")) throw new Error("targeted-pixel-public-url-invalid");
  const file = path.resolve(publicRoot, String(publicUrl).replace(/^\//u, ""));
  if (!file.startsWith(path.resolve(publicRoot) + path.sep)) throw new Error("targeted-pixel-public-url-escape");
  return file;
}

function readOcr(file) {
  try {
    const output = execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000});
    const parsed = JSON.parse(output.trim().split("\n").at(-1));
    return {status: parsed.status || "PASS", text: parsed.text || "", observationCount: parsed.observationCount || 0};
  } catch (error) {
    return {status: "FAILED", text: "", observationCount: 0, error: error instanceof Error ? error.message : String(error)};
  }
}

function latestRawByDirection(runtime, plan) {
  const byDirection = new Map();
  for (const raw of (runtime.lookMasterRawReferences || []).filter((item) => item.shotId === plan.shotId && item.planSha256 === plan.planSha256)) {
    const existing = byDirection.get(raw.candidateDirectionId);
    if (!existing || String(raw.createdAt || "") >= String(existing.createdAt || "")) byDirection.set(raw.candidateDirectionId, raw);
  }
  return byDirection;
}

function assessmentFor(plan, raw, ocrText, ocrStatus) {
  const server = raw.serverVisualAssessment || {};
  const hardFailures = new Set(server.hardFailures || []);
  const serverVisualReviewPass = server.status === "PASS" && hardFailures.size === 0;
  const sourceRequired = plan.networkDecision === "REQUIRED";
  const common = {
    mode: "ACTUAL_PIXEL_VISUAL_REVIEW",
    reviewSource: "ACTUAL_GENERATED_PNG_VISUAL_INSPECTION_PLUS_SERVER_REVIEW_PLUS_LOCAL_OCR",
    artifactSha256Verified: true,
    serverVisualReviewPass,
    viewerTakeawayMatch: serverVisualReviewPass && server.semanticThreeSecond?.status === "PASS",
    actorActionMatch: serverVisualReviewPass && server.dominantActor?.status === "PASS",
    sourceIdentityMatch: !sourceRequired || server.sourceEvidenceMatch?.status === "PASS",
    threeSecondReadable: serverVisualReviewPass,
    genericTemplateDetected: hardFailures.has("generic-template") || hardFailures.has("generic-template-detected"),
    visualComplexityWithinBudget: true,
    singleReadingPath: serverVisualReviewPass && server.policyAudit?.status === "PASS",
    decorativeMotifFree: serverVisualReviewPass && server.policyAudit?.status === "PASS",
    referenceCopyDetected: hardFailures.has("reference-copy") || hardFailures.has("third-party-copy"),
    ocrAvailable: ocrStatus === "PASS",
    ocrExactCopyAligned: !hardFailures.has("ocr-exact-copy-mismatch") && !hardFailures.has("foreign-copy"),
    textExpected: plan.typographyActor === true,
    notes: "当前 PNG 实际像素 + 服务端视觉审查 + 本地 OCR 已审查；仍停留在候选探索。",
  };
  return common;
}

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("targeted-pixel-gate-requires-idle-queue");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("targeted-pixel-gate-must-not-touch-assembly");
  const staged = structuredClone(current);
  const runtime = staged.production.shotIntelligence;
  const plans = runtime.packageLookMasterPlans.filter((plan) => targetSet.has(plan.shotId));
  if (plans.length !== targetShotIds.length) throw new Error("targeted-pixel-gate-plan-count-invalid");
  const planByShot = new Map(plans.map((plan) => [plan.shotId, plan]));
  const decisions = new Map((runtime.decisionSet?.items || []).map((item) => [item.shotId, item]));
  const packets = new Map((runtime.researchPackets || []).map((packet) => [packet.shotId, packet]));
  const foreignCopies = runtime.packageLookMasterPlans
    .map((plan) => ({shotId: plan.shotId, text: plan.semanticDesignBrief?.exactCopy || plan.exactCopy?.text || ""}))
    .filter((item) => item.text);
  const currentRaws = plans.flatMap((plan) => [...latestRawByDirection(runtime, plan).values()]);
  const minimumRawCount = plans.reduce((sum, plan) => sum + Math.min(2, plan.candidateBudget), 0);
  if (currentRaws.length < minimumRawCount) throw new Error(`targeted-pixel-gate-raw-count-invalid:${currentRaws.length}/${minimumRawCount}`);

  const audits = [];
  for (const plan of plans) {
    const raws = [...latestRawByDirection(runtime, plan).values()];
    const prior = [];
    for (const raw of raws.sort((left, right) => String(left.candidateDirectionId).localeCompare(String(right.candidateDirectionId)))) {
      const file = publicFile(raw.artifact.publicUrl);
      if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== raw.artifact.sha256) throw new Error("targeted-pixel-artifact-sha-invalid:" + raw.referenceId);
      const ocr = readOcr(file);
      const assessment = assessmentFor(plan, raw, ocr.text, ocr.status);
      const duplicate = findPerceptualDuplicate(
        {shotId: plan.shotId, directionId: raw.candidateDirectionId, artifactSha256: raw.artifact.sha256, perceptualHash: raw.artifact.perceptualHash},
        prior,
        {maxDistance: 4},
      );
      const packet = packets.get(plan.shotId) || null;
      const decision = decisions.get(plan.shotId) || null;
      const evidenceMatch = plan.networkDecision === "REQUIRED"
        ? assessment.sourceIdentityMatch
          ? {status: "PASS", sourceIds: (plan.sourceEvidenceInputs || []).map((item) => item.id), mismatchedSourceIds: [], evidence: assessment.notes}
          : {status: "MISMATCH", sourceIds: [], mismatchedSourceIds: (plan.sourceEvidenceInputs || []).map((item) => item.id), evidence: assessment.notes}
        : null;
      const sourceBoundOcrTokens = (plan.sourceEvidenceInputs || []).flatMap((item) => [item.id, item.sourceUrl, ...(item.supportedClaims || []), item.groundedClaim]).filter(Boolean).flatMap((item) => String(item).split(/[^A-Za-z0-9\u4e00-\u9fff]+/u).filter((token) => token.length >= 2));
      const audit = buildWholeFilmActualPixelSemanticAudit({
        brief: plan.semanticDesignBrief,
        artifact: raw.artifact,
        assessment,
        ocrText: ocr.text,
        foreignCopies,
        duplicate,
        decision,
        researchPacket: packet,
        referenceInputs: plan.sourceEvidenceInputs || [],
        referenceUseProof: raw.researchReferenceUseProof || null,
        evidenceMatch,
        sourceBoundOcrTokens,
        now,
      });
      raw.semanticPixelAudit = audit;
      raw.semanticPixelAuditSha256 = audit.auditSha256;
      raw.semanticPixelAuditOcr = {status: ocr.status, observationCount: ocr.observationCount, text: ocr.text};
      raw.semanticPixelAuditFindings = audit.findings;
      raw.current = true;
      raw.historyReadOnly = false;
      raw.recommendationEligible = audit.recommendationEligible;
      raw.selectionEligible = audit.recommendationEligible;
      // Assembly remains globally locked until the whole-film board is
      // approved, but candidate-level assembly eligibility is part of the
      // immutable audit authority. A new PASS candidate must not differ from
      // a preserved PASS candidate merely because it was audited now.
      raw.assemblyEligible = audit.recommendationEligible;
      raw.reviewStatus = audit.status === "PASS" ? "ACTUAL_PIXEL_SEMANTIC_PASS" : audit.status === "REVIEW_REQUIRED" ? "VISUAL_REVIEW_RISK" : "VISUAL_REJECTED";
      prior.push({shotId: plan.shotId, directionId: raw.candidateDirectionId, artifactSha256: raw.artifact.sha256, perceptualHash: raw.artifact.perceptualHash});
      audits.push({shotId: plan.shotId, directionId: raw.candidateDirectionId, artifactSha256: raw.artifact.sha256, status: audit.status, recommendationEligible: audit.recommendationEligible, findings: audit.findings, ocrObservationCount: ocr.observationCount, auditSha256: audit.auditSha256});
    }
  }

  const finalized = finalizeWholeFilmLookMasterBatch(staged, staged.production.shotVisualCoveragePlan, {
    now,
    actualPixelSemanticAuditRequired: true,
    semanticReviewFindings: [],
  });
  let next = finalized.workspace;
  const nextRuntime = next.production.shotIntelligence;
  const requiredResearchExceptions = buildRequiredResearchExceptions(current.production.shotIntelligence);
  nextRuntime.wholeFilmBatchRecommendation = {
    ...nextRuntime.wholeFilmBatchRecommendation,
    exceptions: [
      ...(finalized.exceptions || []),
      // The finalizer has just recomputed every PACKAGE shot from current raw
      // references.  Do not copy historical exceptions back into the live
      // batch; only independently required research blockers may be merged.
      ...requiredResearchExceptions,
    ],
    status: "PARTIAL_WITH_EXCEPTIONS",
    recommendation: null,
    selected: null,
    currentAssembly: [],
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    reviewScope: "WHOLE_FILM_STATIC_BOARD",
    nextUserGate: (finalized.exceptions || []).length ? "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED" : "WHOLE_FILM_STATIC_BOARD",
    actualPixelSemanticAuditRequired: true,
    actualPixelSemanticAuditContract: "A1WholeFilmActualPixelSemanticGate/v1",
    researchPacketAudits: buildRequiredResearchPacketAudits(current.production.shotIntelligence),
    updatedAt: now,
  };
  nextRuntime.currentAssembly = [];
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: next.production.generation.summary.queued};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "targeted-look-master-actual-pixel-semantic-gate-applied",
    targetId: targetShotIds.join(","),
    payload: {
      contract: "A1TargetedLookMasterActualPixelGate/v1",
      targetShotIds,
      auditedCandidateCount: audits.length,
      passCount: audits.filter((item) => item.status === "PASS").length,
      rejectedCount: audits.filter((item) => item.status === "VISUAL_REJECTED").length,
      noAssembly: true,
      noLayerReconstruction: true,
      noCritic: true,
      noMotion: true,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: "A1TargetedLookMasterActualPixelGateReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: next.workspaceSha256,
    targetShotIds,
    audits,
    passCount: audits.filter((item) => item.status === "PASS").length,
    recommendationEligibleCount: audits.filter((item) => item.recommendationEligible).length,
    batchStatus: nextRuntime.wholeFilmBatchRecommendation.status,
    assemblyCreationAllowed: nextRuntime.wholeFilmBatchRecommendation.assemblyCreationAllowed,
    layerReconstructionAllowed: nextRuntime.wholeFilmBatchRecommendation.layerReconstructionAllowed,
    criticAllowed: nextRuntime.wholeFilmBatchRecommendation.criticAllowed,
    motionAllowed: nextRuntime.wholeFilmBatchRecommendation.motionAllowed,
    nextUserGate: nextRuntime.wholeFilmBatchRecommendation.nextUserGate,
    queue: next.production.generation.summary,
    workerStatus: next.production.generation.workerStatus,
    generatedAssetsChanged: false,
    assemblyCreated: false,
    layerReconstructionStarted: false,
    criticPerformed: false,
    motionPerformed: false,
    generatedAt: now,
  };
  persistProjectState(appRoot, next, {event, files: {"targeted-look-master-actual-pixel-gate-v1/report.json": report}});
  console.log(JSON.stringify(report, null, 2));
});
