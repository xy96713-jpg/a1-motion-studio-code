#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackagingTemporalReadabilityAuthority, auditPackagingTemporalReadability} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.automaticDispatchAllowed !== false || current.production.generation.workerStatus !== "frozen" || Number(current.production.generation.summary.queued || 0) !== 0 || Number(current.production.generation.summary.running || 0) !== 0) throw new Error("storyboard-orchestration-refresh-requires-frozen-idle-generation");
  const temporalAuthority = assertPackagingTemporalReadabilityAuthority(current.production.packagingTemporalReadabilityAuthority, {workspace: current});
  let next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(current), now));
  const projection = next.production.storyboardProductionProjection;
  if (projection.counts.total !== 34 || projection.counts.package !== 13 || projection.counts.noPackage !== 21 || projection.counts.tasteBound !== 13 || projection.counts.temporalPlanPass !== 13 || projection.counts.tasteUnbound !== 0 || projection.counts.temporalUnbound !== 0) throw new Error("storyboard-orchestration-refresh-coverage-invalid");
  if (projection.gate.imageGenerationAllowed !== false || projection.gate.temporalActualArtifactReviewPass !== false || projection.gate.motionAllowed !== false || projection.gate.finalRenderAllowed !== false || projection.gate.userVisualApproval !== "NOT_APPROVED") throw new Error("storyboard-orchestration-refresh-freeze-invalid");
  const temporalAudit = auditPackagingTemporalReadability(next, {now});
  if (temporalAudit.status !== "PASS_STATIC_TIMING_PLAN" || temporalAudit.summary.sourceWindowBlockedCount !== 0) throw new Error("storyboard-orchestration-refresh-temporal-audit-invalid");
  const event = createProductionEvent({workspace: current, action: "current-storyboard-orchestration-refreshed", targetId: projection.projectionSha256, payload: {storyboardRevisionSha256: projection.storyboardRevisionSha256, projectionSha256: projection.projectionSha256, tasteBoundCount: projection.counts.tasteBound, temporalPlanPassCount: projection.counts.temporalPlanPass, temporalAuthoritySha256: temporalAuthority.authoritySha256, temporalAuditSha256: temporalAudit.auditSha256, generationPerformed: false, userVisualApprovalChanged: false, motionAllowed: false}, now});
  next.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const persisted = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `storyboard-orchestration-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "current-storyboard-production-v1/storyboard-production-projection.json": next.production.storyboardProductionProjection,
      "current-storyboard-production-v1/packaging-temporal-readability-current-audit.json": auditPackagingTemporalReadability(next, {now}),
    },
  });
  return {current, next, persisted, temporalAuthority};
});

console.log(JSON.stringify({status: "PASS_CURRENT_STORYBOARD_ORCHESTRATION_REFRESHED", workspaceSha256Before: result.current.workspaceSha256, workspaceSha256After: result.persisted.workspaceSha256, transitionSha256: result.persisted.transitionSha256, storyboardRevisionSha256: result.next.production.storyboardProductionProjection.storyboardRevisionSha256, projectionSha256: result.next.production.storyboardProductionProjection.projectionSha256, tasteBoundCount: result.next.production.storyboardProductionProjection.counts.tasteBound, temporalPlanPassCount: result.next.production.storyboardProductionProjection.counts.temporalPlanPass, temporalAuthoritySha256: result.temporalAuthority.authoritySha256, actualArtifactTimingReviewStatus: result.next.production.storyboardProductionProjection.gate.temporalActualArtifactReviewStatus, imageGenerationPerformed: false, userVisualApproval: result.next.production.storyboardProductionProjection.gate.userVisualApproval, motionAllowed: result.next.production.storyboardProductionProjection.gate.motionAllowed, finalRenderAllowed: result.next.production.storyboardProductionProjection.gate.finalRenderAllowed}, null, 2));
