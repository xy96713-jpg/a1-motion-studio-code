#!/usr/bin/env node

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("motion-review-authority-reconcile-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`motion-review-authority-reconcile-workspace-cas-failed:${current.workspaceSha256}`);
  const candidate = current.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate;
  if (candidate?.status !== "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW" || candidate.current !== true || candidate.completeness?.authorizedTechnicalScope !== "PASS" || candidate.typography?.canonicalEditableLayerReadyCount !== 13 || candidate.typography?.postApprovalRebuildCount !== 0 || candidate.userVisualApproval !== "NOT_APPROVED" || candidate.finalRenderAllowed !== false) throw new Error("motion-review-authority-reconcile-current-candidate-invalid");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("motion-review-authority-reconcile-frozen-empty-runtime-required");
  const now = new Date().toISOString();
  let next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(current), now));
  if (next.production.packagingLifecycleProjection?.status !== "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW" || next.production.authority?.currentStage !== "whole-film-540p-motion-review" || next.production.authority?.nextAction?.id !== "review-whole-film-motion-candidate" || next.production.authority?.nextAction?.requiresUser !== true || next.gates.finalRenderAllowed !== false) throw new Error("motion-review-authority-reconcile-projection-invalid");
  const report = {contract: "A1CurrentMotionReviewAuthorityReconciliation/v1", status: "PASS", candidateSha256: candidate.candidateSha256, lifecycleStatus: next.production.packagingLifecycleProjection.status, currentStage: next.production.authority.currentStage, nextAction: next.production.authority.nextAction, userVisualApproval: "NOT_APPROVED", finalRenderAllowed: false, reconciledAt: now};
  const event = createProductionEvent({workspace: current, action: "reconcile-current-motion-review-authority", targetId: candidate.candidateSha256, payload: report, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `motion-review-authority-reconcile-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"system-validation-candidate-v1/current-motion-review-authority.json": report}});
  return {...report, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, transitionSha256: committed.transitionSha256};
});

console.log(JSON.stringify(result, null, 2));
