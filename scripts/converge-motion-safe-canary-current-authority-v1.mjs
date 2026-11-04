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
const targetShotIds = ["ED-08", "ED-14", "ED-31"];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("motion-safe-authority-convergence-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => path.join(appRoot, "public", String(publicUrl || "").replace(/^\//u, ""));

const result = await withProjectLock(appRoot, async () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(before.workspaceSha256, expectedWorkspaceSha256, `motion-safe-authority-convergence-cas-failed:${before.workspaceSha256}`);
  assert.equal(before.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_REVIEW");
  assert.equal(before.production.authority.nextAction.id, "EXPAND_REMAINING_TEN_PACKAGE_LAYERS");
  assert.equal(before.production.authority.nextAction.requiresUser, false);
  assert.equal(before.production.assembly.status, "NOT_CREATED");
  assert.equal(before.production.motion.status, "NOT_CREATED");
  assert.equal(before.production.generation.summary.queued, 0);
  assert.equal(before.production.generation.summary.running, 0);
  assert.equal(before.production.generation.workerStatus, "frozen");

  const canary = structuredClone(before.production.shotIntelligence.threeShotLayerCanary);
  assert.equal(canary.status, "THREE_SHOT_LAYER_CANARY_REVIEW");
  assert.equal(canary.passCount, 3);
  assert.equal(canary.failureCount, 0);
  assert.deepEqual(canary.items.map((item) => item.shotId), targetShotIds);
  assert.ok(canary.items.every((item) => item.status === "PASS" && item.actualVisualAudit?.status === "PASS" && item.motionSafeRepair?.status === "PASS"));

  const reviewPath = path.join(publicDir, "three-shot-layer-canary-v1/visual-review-manifest.json");
  const staleAuditPath = path.join(publicDir, "three-shot-layer-canary-v1/actual-visual-audit.json");
  const review = readJson(reviewPath);
  const staleAudit = readJson(staleAuditPath);
  assert.equal(review.contract, "A1MotionSafeThreeShotVisualReview/v1");
  assert.equal(review.status, "PASS");
  assert.equal(review.reviewSha256, canary.visualReviewSha256);
  assert.deepEqual(review.items.map((item) => item.shotId), targetShotIds);
  assert.ok(review.items.every((item) => item.actualPixelVisualInspection === "PASS" && item.semanticOwnershipStatus === "PASS" && item.cleanPlateStatus === "PASS" && item.motionExposureEnvelopeStatus === "PASS"));
  assert.equal(staleAudit.status, "FAIL");
  assert.ok((staleAudit.failureCodes || []).includes("MOTION_EXPOSURE_GHOST_CONTAMINATION"));

  for (const item of canary.items) {
    for (const layer of item.layers) assert.equal(fileSha256(publicFile(layer.publicUrl)), layer.sha256, `motion-safe-authority-layer-sha:${item.shotId}:${layer.kind}`);
    assert.equal(fileSha256(publicFile(item.recomposed.publicUrl)), item.recomposed.sha256, `motion-safe-authority-recompose-sha:${item.shotId}`);
    assert.equal(fileSha256(publicFile(item.contactSheet.publicUrl)), item.contactSheet.sha256, `motion-safe-authority-contact-sha:${item.shotId}`);
  }

  const now = new Date().toISOString();
  const auditBody = {
    contract: "A1MotionSafeThreeShotActualVisualAudit/v1",
    status: "PASS",
    authorityScope: "CURRENT",
    sourceWorkspaceSha256: before.workspaceSha256,
    sourceCanaryManifestSha256: canary.manifestSha256,
    sourceVisualReviewSha256: review.reviewSha256,
    targetShotIds,
    layerCount: 12,
    passCount: 3,
    failureCount: 0,
    failureCodes: [],
    items: canary.items.map((item) => {
      const reviewItem = review.items.find((entry) => entry.shotId === item.shotId);
      return {
        shotId: item.shotId,
        status: "PASS",
        actualPixelVisualInspection: "PASS",
        semanticOwnershipStatus: reviewItem.semanticOwnershipStatus,
        cleanPlateStatus: reviewItem.cleanPlateStatus,
        motionExposureEnvelopeStatus: reviewItem.motionExposureEnvelopeStatus,
        contactSheet: item.contactSheet,
        backgroundAudit: reviewItem.backgroundAudit,
        masterParity: item.masterParity,
        sourceEvidenceIdentity: item.sourceEvidenceIdentity,
        originalPresenterIdentity: item.originalPresenterIdentity,
        hardRuleFailures: [],
      };
    }),
    assemblyCreated: false,
    criticRun: false,
    motionRun: false,
    userVisualApproval: "NOT_APPROVED",
    nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS",
    requiresUser: false,
    auditedAt: now,
  };
  const audit = {...auditBody, auditSha256: sha256({...auditBody, auditedAt: undefined})};
  const historyAudit = {
    ...staleAudit,
    authorityScope: "HISTORY_READ_ONLY",
    current: false,
    supersededAt: now,
    supersededByAuditSha256: audit.auditSha256,
    supersededReason: "Replaced after motion-safe clean-plate reconstruction and actual-pixel review; original failure evidence is preserved.",
  };

  const previousCanaryManifestSha256 = canary.manifestSha256;
  canary.actualVisualAuditSha256 = audit.auditSha256;
  canary.visualReviewSha256 = review.reviewSha256;
  canary.failureCodes = [];
  canary.passCount = 3;
  canary.failureCount = 0;
  canary.nextAction = "EXPAND_REMAINING_TEN_PACKAGE_LAYERS";
  canary.requiresUser = false;
  canary.userVisualApproval = "NOT_APPROVED";
  canary.updatedAt = now;
  const canaryHashInput = structuredClone(canary);
  delete canaryHashInput.manifestSha256;
  delete canaryHashInput.updatedAt;
  canary.manifestSha256 = sha256(canaryHashInput);

  let next = structuredClone(before);
  next.production.shotIntelligence.threeShotLayerCanary = canary;
  next.production.objectiveVisualGate = {
    ...next.production.objectiveVisualGate,
    internalCanary: {
      ...next.production.objectiveVisualGate.internalCanary,
      status: canary.status,
      manifestSha256: canary.manifestSha256,
      actualVisualAuditSha256: audit.auditSha256,
      visualReviewSha256: review.reviewSha256,
      passCount: 3,
      failureCount: 0,
      failureCodes: [],
    },
    nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS",
    requiresUser: false,
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };
  next.production.packagingReview = {...next.production.packagingReview, status: canary.status, nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", layerReconstructionAllowed: true, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false, updatedAt: now};
  next.production.universalReferencePackagingGate = {...next.production.universalReferencePackagingGate, nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", layerReconstructionAllowed: true, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false, updatedAt: now};
  next.production.assembly = {...next.production.assembly, status: "NOT_CREATED", currentAssemblyCount: 0, assemblyCreated: false, productionWired: false, previewArtifact: null, updatedAt: now};
  next.production.motion = {...next.production.motion, status: "NOT_CREATED", representativePlan: null, previewArtifact: null, fullMotionAllowed: false, motionApproved: false, updatedAt: now};

  const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
  const maturityRun = readJson(maturityPath);
  maturityRun.overallStatus = canary.status;
  maturityRun.nextAction = "EXPAND_REMAINING_TEN_PACKAGE_LAYERS";
  maturityRun.userVisualApproval = "NOT_APPROVED";
  maturityRun.postStaticBoard = {
    ...(maturityRun.postStaticBoard || {}),
    status: canary.status,
    manifestSha256: canary.manifestSha256,
    actualVisualAuditSha256: audit.auditSha256,
    visualReviewSha256: review.reviewSha256,
    layerCount: 12,
    passCount: 3,
    failureCount: 0,
    failureCodes: [],
    remainingTenExpansionAllowed: true,
    assemblyCreationAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
  };
  maturityRun.generatedAt = now;
  maturityRun.maturityRunSha256 = sha256({...maturityRun, maturityRunSha256: undefined});
  next.production.goldenFilmVisualSystemMaturity = {...next.production.goldenFilmVisualSystemMaturity, current: true, status: canary.status, nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", maturityRunSha256: maturityRun.maturityRunSha256, threeShotLayerCanaryManifestSha256: canary.manifestSha256, actualVisualAuditSha256: audit.auditSha256, visualReviewSha256: review.reviewSha256, userVisualApproval: "NOT_APPROVED", updatedAt: now};

  const event = createProductionEvent({workspace: before, action: "converge-motion-safe-canary-current-authority-v1", targetId: audit.auditSha256, payload: {previousCanaryManifestSha256, currentCanaryManifestSha256: canary.manifestSha256, actualVisualAuditSha256: audit.auditSha256, staleFailureAuditPreserved: true, passCount: 3, failureCount: 0, assemblyCreated: false, criticRun: false, motionRun: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(next.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_REVIEW");
  assert.equal(next.production.authority.nextAction.id, "EXPAND_REMAINING_TEN_PACKAGE_LAYERS");
  assert.equal(next.production.authority.nextAction.requiresUser, false);
  assert.equal(next.gates.packagingDeliveryGates.layerReconstructionAllowed, true);
  assert.equal(next.gates.packagingDeliveryGates.assemblyCreationAllowed, false);
  assert.equal(next.gates.packagingDeliveryGates.motionAllowed, false);

  const committed = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: before.workspaceSha256,
    commitId: `motion-safe-authority-convergence-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      [`three-shot-layer-canary-v1/history/actual-visual-audit-fail-${fileSha256(staleAuditPath)}.json`]: historyAudit,
      [`three-shot-layer-canary-v1/history/manifest-${previousCanaryManifestSha256}.json`]: before.production.shotIntelligence.threeShotLayerCanary,
      "three-shot-layer-canary-v1/manifest.json": canary,
      "three-shot-layer-canary-v1/actual-visual-audit.json": audit,
      "golden-film-visual-system-maturity-v1/maturity-run.json": maturityRun,
    },
  });
  return {
    status: "PASS",
    workspaceSha256Before: before.workspaceSha256,
    workspaceSha256After: committed.workspaceSha256,
    previousCanaryManifestSha256,
    currentCanaryManifestSha256: canary.manifestSha256,
    actualVisualAuditSha256: audit.auditSha256,
    visualReviewSha256: review.reviewSha256,
    staleFailureAuditPreserved: true,
    nextAction: next.production.authority.nextAction,
    assemblyStatus: next.production.assembly.status,
    motionStatus: next.production.motion.status,
  };
});

console.log(JSON.stringify(result, null, 2));
