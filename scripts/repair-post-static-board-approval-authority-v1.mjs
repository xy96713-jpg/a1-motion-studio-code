#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {canonicalTitleRepairCheckpoint} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("post-static-board-authority-expected-workspace-sha-required");

const result = await withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`post-static-board-authority-workspace-cas-failed:${current.workspaceSha256}`);
  const runtime = current.production.shotIntelligence;
  if (runtime.wholeFilmStaticBoard?.status !== "APPROVED" || runtime.wholeFilmStaticBoardDecision?.decision !== "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY") throw new Error("post-static-board-authority-approved-board-required");
  if (runtime.status !== "LAYER_RECONSTRUCTION_IN_PROGRESS") throw new Error(`post-static-board-authority-runtime-stage-invalid:${runtime.status}`);
  if (current.production.generation.summary.running !== 0) throw new Error("post-static-board-authority-idle-worker-required");
  if (!["frozen", "starting"].includes(current.production.generation.workerStatus)) throw new Error("post-static-board-authority-worker-state-invalid");
  if (runtime.canonicalDirectorTargetRepairManifest?.status !== "HISTORY_READ_ONLY" || runtime.canonicalDirectorTargetRepairManifest?.current !== false) throw new Error("post-static-board-authority-canonical-history-required");

  const now = new Date().toISOString();
  const draft = structuredClone(current);
  draft.production.generation.workerStatus = "frozen";
  draft.production.generation.automaticDispatchAllowed = false;
  if (draft.policy) {
    draft.policy.automaticDispatchAllowed = false;
    draft.policy.queuedJobCount = draft.production.generation.summary.queued;
  }
  const next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(draft, now));
  assert.equal(canonicalTitleRepairCheckpoint(next), false);
  assert.equal(next.production.authority.currentStage, "layer-reconstruction-in-progress");
  assert.equal(next.production.authority.nextAction.id, "continue-integrated-presenter-package-extraction");
  assert.equal(next.production.generation.workerStatus, "frozen");
  assert.equal(next.production.generation.summary.running, 0);
  assert.equal(next.production.generation.summary.queued, current.production.generation.summary.queued);
  assert.equal(next.production.gates?.finalRenderAllowed, undefined);
  assert.equal(next.gates.finalRenderAllowed, false);

  const report = {
    contract: "A1PostStaticBoardApprovalAuthorityRepair/v1",
    status: "PASS",
    boardSha256: runtime.wholeFilmStaticBoard.sha256,
    approvalDecisionSha256: runtime.wholeFilmStaticBoardDecision.decisionSha256,
    canonicalTitleRepairCurrent: false,
    currentStage: next.production.authority.currentStage,
    nextAction: next.production.authority.nextAction.id,
    queue: structuredClone(next.production.generation.summary),
    workerStatusBefore: current.production.generation.workerStatus,
    workerStatus: next.production.generation.workerStatus,
    finalRenderAllowed: next.gates.finalRenderAllowed === true,
    repairedAt: now,
  };
  const event = createProductionEvent({workspace: current, action: "repair-post-static-board-approval-authority", targetId: runtime.wholeFilmStaticBoard.sha256, payload: report, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `post-static-board-authority-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {"whole-film-static-board-approval-v1/post-approval-authority-repair.json": report},
  });
  return {...report, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId};
});

console.log(JSON.stringify(result, null, 2));
