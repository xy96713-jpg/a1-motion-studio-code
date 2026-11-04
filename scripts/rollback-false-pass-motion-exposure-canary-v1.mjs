#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const expectedWorkspaceSha256 = process.argv[2];
const failureCode = "MOTION_EXPOSURE_GHOST_CONTAMINATION";
const targetShotIds = ["ED-08", "ED-14", "ED-31"];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("motion-exposure-rollback-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const result = withProjectLock(appRoot, () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(before.workspaceSha256, expectedWorkspaceSha256, `motion-exposure-rollback-cas-failed:${before.workspaceSha256}`);
  assert.equal(before.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_REVIEW", "motion-exposure-rollback-review-state-required");
  assert.equal(before.production.generation.summary.queued, 0, "motion-exposure-rollback-queue-not-idle");
  assert.equal(before.production.generation.summary.running, 0, "motion-exposure-rollback-running-not-idle");
  assert.equal(before.production.generation.workerStatus, "frozen", "motion-exposure-rollback-worker-not-frozen");
  assert.equal((before.production.shotIntelligence.currentAssembly || []).length, 0, "motion-exposure-rollback-zero-assembly-required");

  const prior = before.production.shotIntelligence.threeShotLayerCanary;
  assert.equal(prior?.status, "THREE_SHOT_LAYER_CANARY_REVIEW", "motion-exposure-rollback-current-canary-review-required");
  assert.deepEqual(prior?.targetShotIds, targetShotIds, "motion-exposure-rollback-targets-invalid");
  assert.equal(prior?.items?.length, 3, "motion-exposure-rollback-three-items-required");

  const now = new Date().toISOString();
  const findings = prior.items.map((item) => ({
    shotId: item.shotId,
    status: "FAIL",
    failedLayer: "BACKGROUND",
    failureCode,
    reason: item.shotId === "ED-08"
      ? "BACKGROUND retains a readable title ghost inside the planned motion exposure envelope."
      : item.shotId === "ED-14"
        ? "BACKGROUND retains Chinese conclusion-box shadows and a source-paper rectangular void inside the planned motion exposure envelope."
        : "BACKGROUND retains title, workflow, presenter, and device silhouettes inside the planned motion exposure envelope.",
    contactSheetSha256: item.contactSheet.sha256,
    recompositionParityStatus: item.masterParity.status,
    recompositionParityIsNecessaryButNotSufficient: true,
    ocrEmptyIsNecessaryButNotSufficient: true,
    actualPixelInspected: true,
    semanticOwnershipStatus: "FAIL",
    cleanPlateStatus: "FAIL",
    motionExposureEnvelopeStatus: "FAIL",
  }));
  const reviewBody = {
    contract: "A1MotionExposureLayerVisualReview/v1",
    status: "FAIL",
    sourceCanaryManifestSha256: prior.manifestSha256,
    targetShotIds,
    passCount: 0,
    failureCount: 3,
    failureCodes: [failureCode],
    findings,
    gatePolicy: {
      recompositionExactRequired: true,
      semanticOwnershipRequired: true,
      cleanPlateRequired: true,
      motionExposureEnvelopeCleanRequired: true,
      alphaRequired: true,
      sourceIdentityRequired: true,
      presenterIdentityRequired: true,
      ocrOnlyApprovalForbidden: true,
      automaticPassMappingForbidden: true,
    },
    nextAction: "REPAIR_THREE_SHOT_LAYER_CANARY",
    requiresUser: false,
    userVisualApproval: "NOT_APPROVED",
    reviewedAt: now,
  };
  const visualReview = {...reviewBody, reviewSha256: sha256({...reviewBody, reviewedAt: undefined})};
  const failedItems = prior.items.map((item) => ({
    ...item,
    status: "FAIL",
    hardRuleFailures: [...new Set([...(item.hardRuleFailures || []), failureCode])],
    actualVisualAudit: {
      ...(item.actualVisualAudit || {}),
      status: "FAIL",
      semanticOwnershipStatus: "FAIL",
      cleanPlateStatus: "FAIL",
      motionExposureEnvelopeStatus: "FAIL",
      failureCode,
      visualReviewSha256: visualReview.reviewSha256,
      contactSheetSha256: item.contactSheet.sha256,
      actualContactSheetInspected: true,
    },
  }));
  const canaryBody = {
    ...prior,
    status: "THREE_SHOT_LAYER_CANARY_BLOCKED",
    technicalStatus: "TECHNICAL_RECOMPOSITION_PASS_VISUAL_MOTION_EXPOSURE_FAIL",
    passCount: 0,
    failureCount: 3,
    failureCodes: [failureCode],
    items: failedItems,
    actualVisualAuditSha256: visualReview.reviewSha256,
    motionExposureVisualReviewSha256: visualReview.reviewSha256,
    nextAction: "REPAIR_THREE_SHOT_LAYER_CANARY",
    requiresUser: false,
    wholeFilmExpansionPerformed: false,
    assemblyCreationAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    updatedAt: now,
  };
  delete canaryBody.manifestSha256;
  const canary = {...canaryBody, manifestSha256: sha256({...canaryBody, updatedAt: undefined})};

  let next = structuredClone(before);
  next.production.shotIntelligence.threeShotLayerCanary = canary;
  next.production.shotIntelligence.status = canary.status;
  next.production.shotIntelligence.currentAssembly = [];
  if (next.production.shotIntelligence.wholeFilmLayerReconstruction) {
    next.production.shotIntelligence.wholeFilmLayerReconstruction = {
      ...next.production.shotIntelligence.wholeFilmLayerReconstruction,
      status: "HISTORY_READ_ONLY_SUPERSEDED_FALSE_CANARY_PASS",
      current: false,
      authorityScope: "HISTORY_READ_ONLY",
      supersededReason: failureCode,
      supersededAt: now,
    };
  }
  for (const plan of next.production.shotIntelligence.packageAssetKitPlans || []) {
    if (!targetShotIds.includes(plan.shotId)) continue;
    plan.status = "THREE_SHOT_LAYER_CANARY_BLOCKED";
    plan.deterministicCanary = {
      ...(plan.deterministicCanary || {}),
      status: "FAIL",
      manifestSha256: canary.manifestSha256,
      actualVisualAuditSha256: visualReview.reviewSha256,
      hardRuleFailures: [failureCode],
      userVisualApproval: "NOT_APPROVED",
    };
  }
  next.production.objectiveVisualGate = {
    ...next.production.objectiveVisualGate,
    internalCanary: {status: canary.status, manifestSha256: canary.manifestSha256, actualVisualAuditSha256: visualReview.reviewSha256, targetShotIds, layerCount: 12, passCount: 0, failureCount: 3, failureCodes: [failureCode]},
    nextAction: "REPAIR_THREE_SHOT_LAYER_CANARY",
    requiresUser: false,
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };
  next.production.userVisualApprovalGate = {...next.production.userVisualApprovalGate, status: "NOT_APPROVED_EXTERNAL_RELEASE_ONLY", userVisualApproval: "NOT_APPROVED", blocksInternalCanary: false, blocksExternalRelease: true, nextAction: "NONE_FOR_INTERNAL_CANARY", checkedAt: now};
  next.production.assembly = {...next.production.assembly, status: "NOT_CREATED", current: true, currentAssemblyCount: 0, previewArtifact: null, assemblyCreated: false, productionWired: false, userVisualApproval: "NOT_APPROVED", updatedAt: now};
  next.production.motion = {...next.production.motion, status: "NOT_CREATED", current: true, representativePlan: null, previewArtifact: null, fullMotionAllowed: false, motionApproved: false, updatedAt: now};
  next.production.packagingReview = {...next.production.packagingReview, status: canary.status, userApprovalStatus: "NOT_APPROVED", userVisualApproval: "NOT_APPROVED", intermediateApprovalRequired: false, requiresExplicitApproval: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextAction: "REPAIR_THREE_SHOT_LAYER_CANARY", updatedAt: now};
  next.production.universalReferencePackagingGate = {...next.production.universalReferencePackagingGate, nextAction: "REPAIR_THREE_SHOT_LAYER_CANARY", assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, updatedAt: now};
  next.production.packagingAutomation = {...next.production.packagingAutomation, status: canary.status, currentStage: "three-shot-layer-canary-blocked", targetShotIds, reason: "motion-exposure-clean-plate-hard-gate-failed", generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};

  const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
  const maturityRun = readJson(maturityPath);
  maturityRun.overallStatus = canary.status;
  maturityRun.nextAction = "REPAIR_THREE_SHOT_LAYER_CANARY";
  maturityRun.current = true;
  maturityRun.targetShotIds = targetShotIds;
  maturityRun.userVisualApproval = "NOT_APPROVED";
  maturityRun.postStaticBoard = {status: canary.status, manifestSha256: canary.manifestSha256, actualVisualAuditSha256: visualReview.reviewSha256, targetShotIds, layerCount: 12, passCount: 0, failureCount: 3, failureCodes: [failureCode], assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false};
  maturityRun.generatedAt = now;
  maturityRun.maturityRunSha256 = sha256({...maturityRun, maturityRunSha256: undefined});
  next.production.goldenFilmVisualSystemMaturity = {...next.production.goldenFilmVisualSystemMaturity, current: true, status: canary.status, nextAction: "REPAIR_THREE_SHOT_LAYER_CANARY", maturityRunSha256: maturityRun.maturityRunSha256, targetShotIds, threeShotLayerCanaryManifestSha256: canary.manifestSha256, actualVisualAuditSha256: visualReview.reviewSha256, userVisualApproval: "NOT_APPROVED", updatedAt: now};

  const event = createProductionEvent({workspace: before, action: "rollback-false-pass-motion-exposure-canary-v1", targetId: canary.manifestSha256, payload: {status: canary.status, failureCode, targetShotIds, passCount: 0, failureCount: 3, recompositionExactIsNotVisualPass: true, remainingTenCommitCancelled: true, imageGenerationPerformed: false, assemblyCreated: false, criticRun: false, motionRun: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(next.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_BLOCKED");
  assert.equal(next.production.authority.nextAction.id, "REPAIR_THREE_SHOT_LAYER_CANARY");
  assert.equal(next.production.authority.nextAction.requiresUser, false);
  assert.equal(next.production.shotIntelligence.threeShotLayerCanary.passCount, 0);
  assert.equal(next.production.shotIntelligence.threeShotLayerCanary.failureCount, 3);
  assert.equal(next.production.shotIntelligence.currentAssembly.length, 0);
  assert.equal(next.production.assembly.status, "NOT_CREATED");
  assert.equal(next.production.motion.status, "NOT_CREATED");
  assert.equal(next.production.generation.summary.queued, 0);
  assert.equal(next.production.generation.summary.running, 0);

  const committed = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: before.workspaceSha256,
    commitId: `rollback-false-pass-motion-exposure-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "three-shot-layer-canary-v1/manifest.json": canary,
      "three-shot-layer-canary-v1/actual-visual-audit.json": visualReview,
      "three-shot-layer-canary-v1/motion-exposure-visual-review.json": visualReview,
      "golden-film-visual-system-maturity-v1/maturity-run.json": maturityRun,
    },
  });
  return {status: canary.status, workspaceSha256Before: before.workspaceSha256, workspaceSha256After: committed.workspaceSha256, canaryManifestSha256: canary.manifestSha256, visualReviewSha256: visualReview.reviewSha256, passCount: 0, failureCount: 3, failureCode, nextAction: "REPAIR_THREE_SHOT_LAYER_CANARY", requiresUser: false, userVisualApproval: "NOT_APPROVED", assemblyStatus: next.production.assembly.status, motionStatus: next.production.motion.status, queue: next.production.generation.summary, workerStatus: next.production.generation.workerStatus};
});

console.log(JSON.stringify(result, null, 2));
