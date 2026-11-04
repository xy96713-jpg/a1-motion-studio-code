#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = "79a0253e160b135894e0af7070ff91df11149e2f4e4b04421ab72493db3123bd";
const now = new Date().toISOString();
const commitId = "look-master-exception-authority-repair-" + now.replace(/[-:.TZ]/gu, "").slice(0, 14);
const exceptionShotIds = ["ED-01", "ED-14", "ED-16"];
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error("workspace-sha-precondition-failed:" + current.workspaceSha256);
  const generation = current.production.generation;
  if (generation.summary.queued !== 0 || generation.summary.running !== 0 || generation.workerStatus !== "frozen") throw new Error("exception-authority-repair-requires-frozen-idle-runtime");
  const currentBatch = current.production.shotIntelligence.wholeFilmBatchRecommendation;
  assert.equal(currentBatch.reconciliationRequired, true);
  assert.equal(currentBatch.assemblyCreationAllowed, false);
  assert.equal(currentBatch.layerReconstructionAllowed, false);
  assert.equal(currentBatch.criticAllowed, false);
  assert.equal(currentBatch.motionAllowed, false);
  assert.deepEqual(currentBatch.exceptions.map((item) => item.shotId), exceptionShotIds);
  assert.deepEqual(currentBatch.currentAssembly || [], []);

  const artifactShaBefore = (current.production.shotIntelligence.lookMasterRawReferences || [])
    .map((reference) => reference.artifact?.sha256)
    .filter(Boolean)
    .sort();
  const staged = structuredClone(current);
  const batch = staged.production.shotIntelligence.wholeFilmBatchRecommendation;
  batch.reconciliationRequired = false;
  batch.reconciliationStatus = "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED";
  batch.nextUserGate = null;
  batch.reconciliation = {
    ...(batch.reconciliation || {}),
    status: "PASS",
    exceptionShotIds,
    exceptionRepairRequired: true,
    artifactSha256Changed: false,
    actualPixelAuditRerun: false,
    ocrRerun: false,
    duplicateAuditRerun: false,
    boardPublished: false,
    assemblyCreated: false,
    layerReconstructionStarted: false,
    criticPerformed: false,
    motionPerformed: false,
    completedAt: batch.reconciliation?.completedAt || now,
  };
  batch.assemblyCreationAllowed = false;
  batch.layerReconstructionAllowed = false;
  batch.criticAllowed = false;
  batch.motionAllowed = false;
  batch.currentAssembly = [];
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(staged, now));
  const artifactShaAfter = (recalculated.production.shotIntelligence.lookMasterRawReferences || [])
    .map((reference) => reference.artifact?.sha256)
    .filter(Boolean)
    .sort();
  assert.deepEqual(artifactShaAfter, artifactShaBefore);
  assert.equal(recalculated.production.authority.currentStage, "film-look-master-exception-repair-required");
  assert.equal(recalculated.production.authority.nextAction.id, "repair-look-master-exceptions");
  assert.deepEqual(recalculated.production.authority.nextAction.targetShotIds, exceptionShotIds);
  assert.equal(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.reconciliationRequired, false);
  assert.deepEqual(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.exceptions.map((item) => item.shotId), exceptionShotIds);
  const event = createProductionEvent({
    workspace: current,
    action: "repair-current-look-master-exception-authority",
    targetId: "WHOLE_FILM_STATIC_BOARD",
    payload: {
      contract: "A1CurrentLookMasterExceptionAuthorityRepair/v1",
      exceptionShotIds,
      reconciliationCompleted: true,
      generatedAssetsChanged: false,
      artifactSha256Changed: false,
      actualPixelAuditRerun: false,
      assemblyCreated: false,
      layerReconstructionStarted: false,
      criticPerformed: false,
      motionPerformed: false,
      commitId,
    },
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: "A1CurrentLookMasterExceptionAuthorityRepairReport/v1",
    status: "PASS",
    commitId,
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    journal: {status: "COMMITTED", journalPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/checkpoint-journal.json"},
    exceptionShotIds,
    reconciliationRequired: false,
    reconciliationStatus: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    artifactSha256Changed: false,
    artifactSha256: artifactShaAfter,
    generatedAssetsChanged: false,
    actualPixelAuditRerun: false,
    staticBoardPublished: false,
    assemblyCreationAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed,
    layerReconstructionAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.layerReconstructionAllowed,
    criticAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.criticAllowed,
    motionAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.motionAllowed,
    authority: {currentStage: recalculated.production.authority.currentStage, nextAction: recalculated.production.authority.nextAction},
    queue: recalculated.production.generation.summary,
    worker: recalculated.production.generation.workerStatus,
    generatedAt: now,
    reportSha256: sha256({contract: "A1CurrentLookMasterExceptionAuthorityRepairReport/v1", commitId, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: recalculated.workspaceSha256, exceptionShotIds}),
  };
  persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId,
    files: {"current-look-master-exception-authority-repair-v1/report.json": report},
  });
  return report;
});

console.log(JSON.stringify(result, null, 2));
