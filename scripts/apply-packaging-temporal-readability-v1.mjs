#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildPackagingTemporalReadabilityAuthority, auditPackagingTemporalReadability} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.automaticDispatchAllowed !== false || current.production.generation.workerStatus !== "frozen" || Number(current.production.generation.summary.queued || 0) !== 0 || Number(current.production.generation.summary.running || 0) !== 0) throw new Error("packaging-temporal-readability-apply-requires-frozen-idle-generation");
  if (current.production.storyboardProductionProjection?.gate?.motionAllowed !== false || current.production.storyboardProductionProjection?.gate?.finalRenderAllowed !== false || current.production.storyboardProductionProjection?.gate?.userVisualApproval !== "NOT_APPROVED") throw new Error("packaging-temporal-readability-apply-requires-downstream-freeze");
  const baselineWorkspace = structuredClone(current);
  delete baselineWorkspace.production.packagingTemporalReadabilityAuthority;
  const baselineAudit = auditPackagingTemporalReadability(baselineWorkspace, {now});
  if (baselineAudit.status !== "DURATION_REPAIR_REQUIRED" || baselineAudit.blockedSourceWindowShotIds.length || JSON.stringify(baselineAudit.repairRequiredShotIds) !== JSON.stringify(["ED-07", "ED-13", "ED-19", "ED-34"])) throw new Error("packaging-temporal-readability-apply-baseline-unexpected");
  const authority = buildPackagingTemporalReadabilityAuthority(baselineWorkspace, {now});
  let next = structuredClone(current);
  next.production.packagingTemporalReadabilityAuthority = authority;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const currentAudit = auditPackagingTemporalReadability(next, {now});
  if (currentAudit.status !== "PASS_STATIC_TIMING_PLAN" || currentAudit.repairRequiredShotIds.length || currentAudit.blockedSourceWindowShotIds.length) throw new Error("packaging-temporal-readability-apply-current-audit-failed");
  const event = createProductionEvent({workspace: current, action: "packaging-temporal-readability-authority-applied", targetId: authority.authoritySha256, payload: {authoritySha256: authority.authoritySha256, baselineAuditSha256: baselineAudit.auditSha256, currentAuditSha256: currentAudit.auditSha256, overrideShotIds: authority.summary.overrideShotIds, generationPerformed: false, workspaceApprovalChanged: false, motionAllowed: false}, now});
  next.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const persisted = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `packaging-temporal-readability-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "current-storyboard-production-v1/packaging-temporal-readability-baseline.json": baselineAudit,
      "current-storyboard-production-v1/packaging-temporal-readability-authority.json": authority,
      "current-storyboard-production-v1/packaging-temporal-readability-current-audit.json": auditPackagingTemporalReadability(next, {now}),
    },
  });
  return {workspaceSha256Before: current.workspaceSha256, workspaceSha256After: persisted.workspaceSha256, transitionSha256: persisted.transitionSha256, authority, baselineAudit, currentAudit: auditPackagingTemporalReadability(next, {now})};
});

console.log(JSON.stringify({status: "PASS_STATIC_TIMING_PLAN_AWAITING_ACTUAL_ARTIFACT_REVIEW", workspaceSha256Before: result.workspaceSha256Before, workspaceSha256After: result.workspaceSha256After, transitionSha256: result.transitionSha256, authoritySha256: result.authority.authoritySha256, packageShotCount: result.authority.summary.packageShotCount, overrideShotIds: result.authority.summary.overrideShotIds, effectiveDurations: Object.fromEntries(result.authority.shots.filter((shot) => shot.overrideApplied).map((shot) => [shot.shotId, shot.effectivePlannedDurationMs])), sourceWindowBlockedCount: result.currentAudit.summary.sourceWindowBlockedCount, generationPerformed: false, userVisualApproval: "NOT_APPROVED", motionAllowed: false, finalRenderAllowed: false}, null, 2));
