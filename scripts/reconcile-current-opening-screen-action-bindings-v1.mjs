#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import screenDemoOverrides from "../apps/studio-next/src/data/system-line-screen-demo-overrides-v1.json" with {type: "json"};
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("opening-screen-binding-expected-workspace-sha-required");
const targetShotIds = ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06"];
const targetSet = new Set(targetShotIds);
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const canonicalJson = (value) => JSON.stringify(value);

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`opening-screen-binding-cas:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("opening-screen-binding-runtime-not-frozen-idle");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("opening-screen-binding-assembly-must-remain-empty");
  if (current.production.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("opening-screen-binding-user-boundary-invalid");
  const currentBoard = current.production.shotIntelligence.wholeFilmStaticBoard;
  if (currentBoard.status !== "PENDING_USER_APPROVAL" || currentBoard.approvalAllowed !== true) throw new Error("opening-screen-binding-board-not-ready");

  const now = new Date().toISOString();
  const projected = structuredClone(current);
  projected.production.shotVisualCoveragePlan.shotPlans = projected.production.shotVisualCoveragePlan.shotPlans.map((shot) => {
    if (!targetSet.has(shot.shotId)) return shot;
    const override = screenDemoOverrides.entries.find((entry) => entry.shotId === shot.shotId);
    if (!override) throw new Error(`opening-screen-binding-override-missing:${shot.shotId}`);
    return {
      ...shot,
      screenActions: structuredClone(override.screenActions),
      screenActionId: override.expectedActionId,
      screenStateBindings: structuredClone(override.screenStateBindings),
      screenDemoOwnership: "SYSTEM_SIMULATED_FROM_VERIFIED_SOURCE",
      screenMotionContract: {
        cameraPath: "CUBIC_EASE_IN_OUT",
        maximumConcurrentFocusActors: 1,
        minimumSettleMs: 350,
        hardJumpZoomForbidden: true,
        cursorPathMustFollowActualAction: true,
        subtitleTimeRangeIsHardBoundary: true,
      },
    };
  });
  projected.production.shotVisualCoveragePlan.updatedAt = now;
  projected.production.shotVisualCoveragePlan.sha256 = sha256({...projected.production.shotVisualCoveragePlan, sha256: undefined, updatedAt: undefined});
  const beforePlans = new Map(current.production.shotVisualCoveragePlan.shotPlans.map((shot) => [shot.shotId, shot]));
  const afterPlans = new Map(projected.production.shotVisualCoveragePlan.shotPlans.map((shot) => [shot.shotId, shot]));
  for (const shotId of beforePlans.keys()) {
    if (targetSet.has(shotId)) continue;
    if (canonicalJson(beforePlans.get(shotId)) !== canonicalJson(afterPlans.get(shotId))) throw new Error(`opening-screen-binding-nontarget-drift:${shotId}`);
  }

  const checks = [];
  for (const shotId of targetShotIds) {
    const plan = afterPlans.get(shotId);
    const override = screenDemoOverrides.entries.find((entry) => entry.shotId === shotId);
    if (!plan || !override) throw new Error(`opening-screen-binding-target-missing:${shotId}`);
    if (plan.route !== "SCREEN_EVIDENCE" || plan.packageDecision !== "NO_PACKAGE") throw new Error(`opening-screen-binding-route-invalid:${shotId}`);
    if (plan.screenActionId !== override.expectedActionId) throw new Error(`opening-screen-binding-action-id-invalid:${shotId}`);
    if (!Array.isArray(plan.screenActions) || plan.screenActions.length !== 3) throw new Error(`opening-screen-binding-actions-invalid:${shotId}`);
    if (!Array.isArray(plan.screenStateBindings) || plan.screenStateBindings.length !== 3) throw new Error(`opening-screen-binding-states-invalid:${shotId}`);
    if (canonicalJson(plan.screenStateBindings.map((state) => state.role)) !== canonicalJson(["BEFORE", "ACTION", "RESULT"])) throw new Error(`opening-screen-binding-state-order-invalid:${shotId}`);
    for (const state of plan.screenStateBindings) {
      const file = publicFile(state.publicUrl);
      if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== state.sha256) throw new Error(`opening-screen-binding-state-file-invalid:${shotId}:${state.role}`);
    }
    if (plan.screenMotionContract?.cameraPath !== "CUBIC_EASE_IN_OUT" || plan.screenMotionContract?.minimumSettleMs !== 350 || plan.screenMotionContract?.subtitleTimeRangeIsHardBoundary !== true || plan.screenMotionContract?.hardJumpZoomForbidden !== true) throw new Error(`opening-screen-binding-motion-contract-invalid:${shotId}`);
    checks.push({shotId, actionId: plan.screenActionId, actionCount: plan.screenActions.length, stateCount: plan.screenStateBindings.length, ownership: plan.screenDemoOwnership});
  }

  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(projected, now));
  const nextBoard = recalculated.production.shotIntelligence.wholeFilmStaticBoard;
  if (nextBoard.sha256 !== currentBoard.sha256 || nextBoard.timelineBoard.sha256 !== currentBoard.timelineBoard.sha256) throw new Error("opening-screen-binding-board-pixels-drifted");
  if (recalculated.production.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("opening-screen-binding-user-approval-drifted");
  if ((recalculated.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("opening-screen-binding-assembly-created");
  const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
  if (gate.status !== "PASS") throw new Error(`opening-screen-binding-static-board-gate-blocked:${JSON.stringify(gate)}`);

  const reportBody = {
    contract: "A1CurrentOpeningScreenActionBindingReconciliation/v1",
    status: "PASS",
    sourceWorkspaceSha256: current.workspaceSha256,
    targetShotIds,
    checks,
    directorBoard: {
      publicUrl: "/generated/system-line/editorial-asset-workbench-v1/opening-ten-shot-director-board-v1/opening-10-shot-director-board.png",
      sha256: "e2b10498ca475454f3f341f2636503a04f2725fe5ddb08eb30c04854df48c5aa",
    },
    actualPixelReview: {
      publicUrl: "/generated/system-line/editorial-asset-workbench-v1/opening-ten-shot-director-board-v1/agent-actual-pixel-review.json",
      status: "PASS",
    },
    boardSha256: nextBoard.sha256,
    timelineBoardSha256: nextBoard.timelineBoard.sha256,
    pixelBytesChanged: false,
    userVisualApproval: "NOT_APPROVED",
    assemblyCreated: false,
    motionPerformed: false,
    reconciledAt: now,
  };
  const report = {...reportBody, reportSha256: sha256(reportBody)};
  const event = createProductionEvent({workspace: recalculated, action: "reconcile-current-opening-screen-action-bindings-v1", targetId: report.reportSha256, payload: report, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `opening-screen-bindings-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {"opening-ten-shot-director-board-v1/screen-action-binding-reconciliation.json": report},
  });
  return {
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: committed.workspaceSha256,
    targetShotIds,
    boardSha256: nextBoard.sha256,
    timelineBoardSha256: nextBoard.timelineBoard.sha256,
    gateStatus: gate.status,
    pixelBytesChanged: false,
    userVisualApproval: "NOT_APPROVED",
    motionPerformed: false,
    reportSha256: report.reportSha256,
  };
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
