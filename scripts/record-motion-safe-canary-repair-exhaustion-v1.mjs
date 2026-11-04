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
const preflightPath = path.resolve(process.argv[3] || "");
const targetShotIds = ["ED-08", "ED-14", "ED-31"];
const ghostCode = "MOTION_EXPOSURE_GHOST_CONTAMINATION";
const exhaustionCode = "MASKED_EDIT_CLEAN_PLATE_COMPOSITE_BOUNDARY_FAILURE";

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("motion-safe-exhaustion-expected-workspace-sha-required");
if (!fs.existsSync(preflightPath)) throw new Error("motion-safe-exhaustion-preflight-required");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const preflight = readJson(preflightPath);

const result = withProjectLock(appRoot, () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(before.workspaceSha256, expectedWorkspaceSha256, `motion-safe-exhaustion-cas-failed:${before.workspaceSha256}`);
  assert.equal(before.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_BLOCKED");
  assert.equal(before.production.generation.summary.queued, 0);
  assert.equal(before.production.generation.summary.running, 0);
  assert.equal(before.production.generation.workerStatus, "frozen");
  assert.equal(preflight.contract, "A1MotionSafeThreeShotImagegenCleanPlatePreflight/v1");
  assert.equal(preflight.sourceWorkspaceSha256, before.workspaceSha256);
  assert.deepEqual(preflight.targetShotIds, targetShotIds);
  assert.equal(preflight.items.length, 3);
  for (const item of preflight.items) {
    assert.equal(item.deterministicInpaintAttemptCount, 1, `motion-safe-exhaustion-deterministic-attempt-count:${item.shotId}`);
    assert.equal(item.imagegenMaskedEditAttemptCount, 1, `motion-safe-exhaustion-imagegen-attempt-count:${item.shotId}`);
    assert.equal(item.recomposed.parity.exactPixelRatio, 1, `motion-safe-exhaustion-parity:${item.shotId}`);
    assert.equal(item.recomposed.parity.meanAbsoluteRgbDifference, 0, `motion-safe-exhaustion-parity-mad:${item.shotId}`);
    assert.equal(sha256(fs.readFileSync(item.contactSheet.path)), item.contactSheet.sha256, `motion-safe-exhaustion-contact-sha:${item.shotId}`);
    assert.equal(sha256(fs.readFileSync(item.imagegenSource.copiedPath)), item.imagegenSource.sha256, `motion-safe-exhaustion-imagegen-sha:${item.shotId}`);
  }

  const now = new Date().toISOString();
  const failureReasons = {
    "ED-08": "Exact recomposition retained a readable title-shaped residual in the clean background; residual correlation and actual pixels fail.",
    "ED-14": "Exact recomposition retained conclusion-box/document-shaped residuals in the clean background; actual pixels fail.",
    "ED-31": "Exact recomposition retained presenter, title, workflow, and equipment silhouettes; residual correlation and actual pixels fail.",
  };
  const repairBody = {
    contract: "A1MotionSafeThreeShotCanaryRepairManifest/v1",
    status: "BLOCKED_METHOD_BUDGET_EXHAUSTED",
    sourceWorkspaceSha256: before.workspaceSha256,
    sourceCanaryManifestSha256: before.production.shotIntelligence.threeShotLayerCanary.manifestSha256,
    targetShotIds,
    failureCodes: [ghostCode, exhaustionCode],
    deterministicInpaintMaxAttemptsPerShot: 1,
    imagegenMaskedEditMaxAttemptsPerShot: 1,
    retrySameMethodAllowed: false,
    items: preflight.items.map((item) => ({
      shotId: item.shotId,
      status: "FAIL",
      deterministicInpaint: {attemptCount: 1, status: "FAIL", reason: ghostCode},
      imagegenMaskedEdit: {attemptCount: 1, status: "FAIL", sourceSha256: item.imagegenSource.sha256, actualImageAttachmentUsed: true, reason: exhaustionCode},
      recompositionParity: item.recomposed.parity,
      cleanPlateResidualMetrics: item.cleanPlateResidualMetrics,
      actualPixelVisualReview: {status: "FAIL", contactSheetSha256: item.contactSheet.sha256, reason: failureReasons[item.shotId]},
      sourceEvidenceIdentityPreservedInVisibleRecomposition: item.shotId === "ED-14",
      presenterIdentityPreservedInVisibleRecomposition: item.shotId === "ED-31",
    })),
    passCount: 0,
    failureCount: 3,
    remainingTenExpansionAllowed: false,
    assemblyCreationAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    userVisualApproval: "NOT_APPROVED",
    nextAction: "MOTION_SAFE_CANARY_BLOCKED_METHOD_BUDGET_EXHAUSTED",
    requiresUser: false,
    recordedAt: now,
  };
  const repairManifest = {...repairBody, manifestSha256: sha256({...repairBody, recordedAt: undefined})};

  let next = structuredClone(before);
  const canary = next.production.shotIntelligence.threeShotLayerCanary;
  canary.status = "THREE_SHOT_LAYER_CANARY_BLOCKED";
  canary.passCount = 0;
  canary.failureCount = 3;
  canary.failureCodes = [ghostCode, exhaustionCode];
  canary.repairManifestSha256 = repairManifest.manifestSha256;
  canary.nextAction = "MOTION_SAFE_CANARY_BLOCKED_METHOD_BUDGET_EXHAUSTED";
  canary.requiresUser = false;
  canary.updatedAt = now;
  canary.items = canary.items.map((item) => {
    const attempt = repairManifest.items.find((entry) => entry.shotId === item.shotId);
    return {...item, status: "FAIL", hardRuleFailures: [ghostCode, exhaustionCode], motionSafeRepair: attempt};
  });
  const canaryHashInput = structuredClone(canary);
  delete canaryHashInput.manifestSha256;
  delete canaryHashInput.updatedAt;
  canary.manifestSha256 = sha256(canaryHashInput);
  next.production.shotIntelligence.status = "THREE_SHOT_LAYER_CANARY_BLOCKED";
  next.production.shotIntelligence.currentAssembly = [];
  next.production.objectiveVisualGate = {...next.production.objectiveVisualGate, internalCanary: {status: canary.status, manifestSha256: canary.manifestSha256, repairManifestSha256: repairManifest.manifestSha256, targetShotIds, layerCount: 12, passCount: 0, failureCount: 3, failureCodes: canary.failureCodes}, nextAction: repairManifest.nextAction, requiresUser: false, userVisualApproval: "NOT_APPROVED", updatedAt: now};
  next.production.packagingReview = {...next.production.packagingReview, status: canary.status, nextAction: repairManifest.nextAction, layerReconstructionAllowed: false, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false, userVisualApproval: "NOT_APPROVED", updatedAt: now};
  next.production.universalReferencePackagingGate = {...next.production.universalReferencePackagingGate, nextAction: repairManifest.nextAction, layerReconstructionAllowed: false, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false, updatedAt: now};
  next.production.packagingAutomation = {...next.production.packagingAutomation, status: canary.status, currentStage: "three-shot-layer-canary-blocked", targetShotIds, reason: "motion-safe-canary-method-budget-exhausted", generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
  next.production.assembly = {...next.production.assembly, status: "NOT_CREATED", current: true, currentAssemblyCount: 0, previewArtifact: null, assemblyCreated: false, productionWired: false, updatedAt: now};
  next.production.motion = {...next.production.motion, status: "NOT_CREATED", current: true, representativePlan: null, previewArtifact: null, fullMotionAllowed: false, motionApproved: false, updatedAt: now};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};

  const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
  const maturityRun = readJson(maturityPath);
  maturityRun.overallStatus = canary.status;
  maturityRun.nextAction = repairManifest.nextAction;
  maturityRun.targetShotIds = targetShotIds;
  maturityRun.userVisualApproval = "NOT_APPROVED";
  maturityRun.postStaticBoard = {status: canary.status, manifestSha256: canary.manifestSha256, repairManifestSha256: repairManifest.manifestSha256, targetShotIds, layerCount: 12, passCount: 0, failureCount: 3, failureCodes: canary.failureCodes, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false};
  maturityRun.generatedAt = now;
  maturityRun.maturityRunSha256 = sha256({...maturityRun, maturityRunSha256: undefined});
  next.production.goldenFilmVisualSystemMaturity = {...next.production.goldenFilmVisualSystemMaturity, current: true, status: canary.status, nextAction: repairManifest.nextAction, maturityRunSha256: maturityRun.maturityRunSha256, targetShotIds, threeShotLayerCanaryManifestSha256: canary.manifestSha256, repairManifestSha256: repairManifest.manifestSha256, userVisualApproval: "NOT_APPROVED", updatedAt: now};

  const event = createProductionEvent({workspace: before, action: "record-motion-safe-canary-repair-exhaustion-v1", targetId: repairManifest.manifestSha256, payload: {status: repairManifest.status, targetShotIds, failureCodes: repairManifest.failureCodes, deterministicAttemptCountPerShot: 1, imagegenAttemptCountPerShot: 1, passCount: 0, failureCount: 3, remainingTenExpansionAllowed: false, assemblyCreated: false, criticRun: false, motionRun: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(next.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_BLOCKED");
  assert.equal(next.production.authority.nextAction.id, "REPAIR_THREE_SHOT_LAYER_CANARY");
  assert.equal(next.production.authority.nextAction.requiresUser, false);
  assert.equal(next.gates.packagingDeliveryGates.layerReconstructionAllowed, false);
  assert.equal(next.production.assembly.status, "NOT_CREATED");
  assert.equal(next.production.motion.status, "NOT_CREATED");

  const binaryFiles = {};
  for (const item of preflight.items) {
    binaryFiles[`three-shot-layer-canary-v1/failed-motion-safe-repair/${item.shotId}/imagegen-clean-plate-source.png`] = fs.readFileSync(item.imagegenSource.copiedPath);
    binaryFiles[`three-shot-layer-canary-v1/failed-motion-safe-repair/${item.shotId}/contact-sheet.png`] = fs.readFileSync(item.contactSheet.path);
  }
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: before.workspaceSha256, commitId: `motion-safe-canary-repair-exhausted-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"three-shot-layer-canary-v1/manifest.json": canary, "three-shot-layer-canary-v1/motion-safe-repair-manifest.json": repairManifest, "golden-film-visual-system-maturity-v1/maturity-run.json": maturityRun}, binaryFiles});
  return {status: repairManifest.status, workspaceSha256Before: before.workspaceSha256, workspaceSha256After: committed.workspaceSha256, canaryManifestSha256: canary.manifestSha256, repairManifestSha256: repairManifest.manifestSha256, passCount: 0, failureCount: 3, failureCodes: repairManifest.failureCodes, remainingTenExpansionAllowed: false, assemblyStatus: next.production.assembly.status, motionStatus: next.production.motion.status, queue: next.production.generation.summary, workerStatus: next.production.generation.workerStatus};
});

console.log(JSON.stringify(result, null, 2));
