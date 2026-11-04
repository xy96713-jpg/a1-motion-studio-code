#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const cancelled = [];
  for (const shot of next.library.assets.filter((asset) => asset.route === "shot-composition" && ["ED-04"].includes(asset.shotDemand?.shotId))) {
    if (shot.review?.status === "approved" || (!shot.candidates?.length && !shot.candidateRender)) continue;
    shot.revisionHistory ||= [];
    shot.revisionHistory.push({
      contract: "A1RejectedShotCandidateRound/v1",
      round: Number(shot.visualRevision?.round || 1),
      reason: "progressive-shot-candidate-created-before-anchor-suite-approval",
      candidates: shot.candidates || [],
      candidateRender: shot.candidateRender || null,
      visualCritic: shot.visualCritic || null,
      archivedAt: now,
    });
    shot.candidates = [];
    shot.candidateRender = null;
    shot.selectedCandidateId = null;
    shot.visualCritic = null;
    shot.status = "brief-ready";
    shot.review = {status: "pending", note: "渐进镜头候选已因六镜锚点未通过而撤回；锚点门禁通过前不再排产。", reviewedAt: now, reviewedBy: "system-scope-guard", approvedContentSha256: null};
    shot.candidateSetAudit = {
      ...(shot.candidateSetAudit || {contract: "A1ShotCandidateSetAudit/v1"}),
      status: "WAITING_ANCHOR_SUITE",
      candidateCount: 0,
      distinctSilhouetteCount: 0,
      preflightAt: now,
      blockingReason: "anchor-suite-approval-required-before-progressive-shot-candidates",
    };
    cancelled.push(shot.shotDemand.shotId);
  }
  if (!cancelled.length) return {workspaceSha256: current.workspaceSha256, cancelled};
  const event = createProductionEvent({
    workspace: current,
    action: "progressive-shot-candidates-cancelled-before-anchor-approval",
    targetId: cancelled.join(","),
    payload: {cancelled, reason: "anchor-suite-approval-required-before-progressive-shot-candidates"},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.nextAction = "continue-anchor-suite-only";
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  assertEditorialAssetWorkbench(recalculated);
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      "anchor-suite-scheduler-fix-v1/cancelled-progressive-shot-candidates.json": {
        contract: "A1OutOfScopeShotCandidateCancellation/v1",
        cancelledAt: now,
        cancelled,
        workspaceSha256: recalculated.workspaceSha256,
      },
    },
  });
  return {workspaceSha256: recalculated.workspaceSha256, cancelled};
});

console.log(JSON.stringify({status: "OUT_OF_SCOPE_SHOT_CANDIDATES_CANCELLED", ...result}, null, 2));
