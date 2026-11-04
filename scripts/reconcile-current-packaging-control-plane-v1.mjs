#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("control-plane-reconcile-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (locked.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`control-plane-reconcile-cas-failed:${locked.workspaceSha256}`);
  const runtime = locked.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  const selectedArtifactSha256 = board.items.map((item) => item.artifactSha256);
  if (locked.production.generation.summary.queued !== 0 || locked.production.generation.summary.running !== 0 || locked.production.generation.workerStatus !== "frozen") throw new Error("control-plane-reconcile-requires-frozen-idle-runtime");
  if ((runtime.currentAssembly || []).length !== 0) throw new Error("control-plane-reconcile-assembly-must-remain-empty");
  if (board?.sha256 !== "659b2ac246f69933af2a58d40aea777e9cf12ea680644aacde05243da2cb4404" || board?.decision != null) throw new Error("control-plane-reconcile-board-binding-invalid");
  const beforeProjection = derivePackagingLifecycleProjection(locked);
  if (beforeProjection.status !== "WHOLE_FILM_STATIC_BOARD_READY") throw new Error(`control-plane-reconcile-stage-invalid:${beforeProjection.status}`);

  const now = new Date().toISOString();
  const next = structuredClone(locked);
  next.production.packagingAutomation = {
    ...next.production.packagingAutomation,
    status: beforeProjection.status,
    reason: "whole-film-static-board-pending-hash-bound-user-approval",
    currentStage: beforeProjection.authorityStage,
    targetShotIds: [],
    generationFreeze: {...next.production.packagingAutomation?.generationFreeze, frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"},
    updatedAt: now,
  };
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  const event = createProductionEvent({workspace: locked, action: "reconcile-current-packaging-control-plane", targetId: "WHOLE_FILM_STATIC_BOARD", payload: {contract: "A1PackagingControlPlaneReconciliation/v1", lifecycleStatus: beforeProjection.status, boardSha256: board.sha256, itemSeedSha256: board.itemSeedSha256, selectedArtifactSha256, formalAssemblyCount: 0, downstreamStarted: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const projection = derivePackagingLifecycleProjection(recalculated);
  assert.equal(projection.status, "WHOLE_FILM_STATIC_BOARD_READY");
  assert.equal(recalculated.status, projection.workspaceStatus);
  assert.equal(recalculated.gates.packagingDeliveryGates.status, projection.status);
  assert.equal(recalculated.production.authority.currentStage, projection.authorityStage);
  assert.equal(recalculated.production.authority.nextAction.id, projection.nextActionId);
  assert.equal(recalculated.production.packagingAutomation.status, projection.status);
  assert.equal(recalculated.production.packagingLifecycleProjection.status, projection.status);
  assert.deepEqual(recalculated.production.shotIntelligence.wholeFilmStaticBoard.items.map((item) => item.artifactSha256), selectedArtifactSha256);
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);

  const {publicDir} = projectDirs(appRoot);
  const historyPath = path.join(publicDir, "research-mode-candidate-authority-reconciliation-v1/report.json");
  const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
  const historicalReport = {
    ...history,
    status: "HISTORY_READ_ONLY",
    current: false,
    authorityScope: "HISTORY_READ_ONLY",
    supersededBy: {
      contract: "A1PackagingLifecycleProjection/v1",
      currentWorkspaceSha256: recalculated.workspaceSha256,
      currentStage: projection.status,
      nextUserGate: projection.nextUserGate,
      currentAuthorityStage: projection.authorityStage,
    },
  };
  const controlReport = {contract: "A1PackagingControlPlaneReconciliation/v1", status: "PASS", workspaceSha256Before: locked.workspaceSha256, workspaceSha256After: recalculated.workspaceSha256, lifecycleProjection: projection, historicalReportsIsolated: ["research-mode-candidate-authority-reconciliation-v1/report.json"], boardSha256: board.sha256, selectedArtifactSha256, formalAssemblyCount: 0, currentKitCount: recalculated.production.shotIntelligence.packageAssetKitPlans.filter((item) => item.current !== false && item.status !== "HISTORY_READ_ONLY").length, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, downstream: {imagegen: false, assembly: false, layerReconstruction: false, critic: false, motion: false, render: false}, generatedAt: now};
  const commitId = `packaging-control-plane-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: locked.workspaceSha256, commitId, files: {"research-mode-candidate-authority-reconciliation-v1/report.json": historicalReport, "packaging-control-plane-reconciliation-v1/report.json": controlReport}});
  return {...controlReport, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, checkpointJournal: committed.journal?.status || null};
});

console.log(JSON.stringify(result, null, 2));
