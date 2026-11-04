#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildPackagingParagraphUpgradeMarker} from "../apps/studio-next/src/lib/a1-packaging-paragraph-quality-v1.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const dryRun = process.argv.includes("--dry-run");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const tasteMigration = current.production?.staticPackageReview?.tasteMigration;
  if (current.status !== "PACKAGING_LANE_VISUAL_REPAIR_REQUIRED"
    || tasteMigration?.contract !== "A1LegacyPixelTasteMigrationDisposition/v1"
    || tasteMigration.status !== "LEGACY_PIXELS_NOT_TASTE_BOUND"
    || tasteMigration.productionAdmitted !== false
    || current.production?.generation?.summary?.queued !== 0
    || current.production?.generation?.summary?.running !== 0
    || current.production?.generation?.automaticDispatchAllowed !== false
    || current.production?.generation?.workerStatus !== "frozen") throw new Error("packaging-paragraph-canary-activation-invalid:precondition");

  const marker = buildPackagingParagraphUpgradeMarker({legacyPixelReviewShotIds: tasteMigration.legacyShotIds});
  const alreadyCurrent = tasteMigration.packagingParagraphCanary?.markerSha256 === marker.markerSha256
    && current.production.packagingLifecycleProjection?.nextActionId === "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY"
    && JSON.stringify(current.production.packagingLifecycleProjection?.targetShotIds || []) === JSON.stringify(marker.targetShotIds);
  if (alreadyCurrent && !dryRun) {
    const bootstrapPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/client-bootstrap.json");
    const bootstrap = fs.existsSync(bootstrapPath) ? JSON.parse(fs.readFileSync(bootstrapPath, "utf8")) : null;
    const bootstrapCurrent = bootstrap?.workspaceSha256 === current.workspaceSha256
      && bootstrap?.workspace?.production?.staticPackageReview?.tasteMigration?.packagingParagraphCanary?.markerSha256 === marker.markerSha256;
    const persisted = bootstrapCurrent ? null : persistProjectState(appRoot, current, {
      expectedWorkspaceSha256: current.workspaceSha256,
      commitId: `packaging-paragraph-bootstrap-refresh-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    });
    return {
      contract: "A1PackagingParagraphCanaryActivationReport/v1",
      status: bootstrapCurrent ? "PASS_ALREADY_CURRENT_NO_MUTATION" : "PASS_CLIENT_BOOTSTRAP_REFRESHED",
      mode: "APPLY",
      workspaceSha256Before: current.workspaceSha256,
      workspaceSha256After: current.workspaceSha256,
      marker,
      nextAction: structuredClone(current.production.authority.nextAction),
      proof: {legacyV8PixelsPreserved: true, imageGenerationPerformed: false, generationQueued: current.production.generation.summary.queued, generationRunning: current.production.generation.summary.running, generationWorkerStatus: current.production.generation.workerStatus, automaticDispatchAllowed: current.production.generation.automaticDispatchAllowed, userVisualApproval: current.production.storyboardProductionProjection.gate.userVisualApproval, motionAllowed: current.production.storyboardProductionProjection.gate.motionAllowed, resolveInsertAuthorized: current.production.packagingLifecycleProjection.resolveInsertAuthorized, finalRenderAllowed: current.production.storyboardProductionProjection.gate.finalRenderAllowed, workspaceMutationPerformed: false, bootstrapRefreshed: !bootstrapCurrent},
      generatedAt: current.updatedAt,
      persisted,
    };
  }
  const next = structuredClone(current);
  next.production.staticPackageReview.tasteMigration.packagingParagraphCanary = marker;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const lifecycle = recalculated.production.packagingLifecycleProjection;
  if (lifecycle.nextActionId !== "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY"
    || lifecycle.nextUserGate !== "PACKAGING_PARAGRAPH_CANARY_AUTHORIZATION"
    || JSON.stringify(lifecycle.targetShotIds) !== JSON.stringify(["ED-12", "ED-13", "ED-14"])
    || lifecycle.requiresExplicitApproval !== true
    || recalculated.production.authority.nextAction.id !== lifecycle.nextActionId
    || recalculated.production.authority.nextAction.requiresUser !== true
    || recalculated.production.storyboardProductionProjection.gate.userVisualApproval !== "NOT_APPROVED"
    || recalculated.production.storyboardProductionProjection.gate.motionAllowed !== false
    || recalculated.production.storyboardProductionProjection.gate.finalRenderAllowed !== false) throw new Error("packaging-paragraph-canary-activation-invalid:authority");

  const report = {
    contract: "A1PackagingParagraphCanaryActivationReport/v1",
    status: "PASS",
    mode: dryRun ? "DRY_RUN" : "APPLY",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    marker,
    nextAction: structuredClone(recalculated.production.authority.nextAction),
    lifecycle: {
      status: lifecycle.status,
      nextActionId: lifecycle.nextActionId,
      nextUserGate: lifecycle.nextUserGate,
      targetShotIds: [...lifecycle.targetShotIds],
      legacyPixelReviewShotIds: [...lifecycle.legacyPixelReviewShotIds],
      blockers: [...lifecycle.blockers],
    },
    proof: {
      legacyV8PixelsPreserved: true,
      imageGenerationPerformed: false,
      generationQueued: recalculated.production.generation.summary.queued,
      generationRunning: recalculated.production.generation.summary.running,
      generationWorkerStatus: recalculated.production.generation.workerStatus,
      automaticDispatchAllowed: recalculated.production.generation.automaticDispatchAllowed,
      userVisualApproval: recalculated.production.storyboardProductionProjection.gate.userVisualApproval,
      motionAllowed: recalculated.production.storyboardProductionProjection.gate.motionAllowed,
      resolveInsertAuthorized: lifecycle.resolveInsertAuthorized,
      finalRenderAllowed: recalculated.production.storyboardProductionProjection.gate.finalRenderAllowed,
    },
    generatedAt: now,
  };
  if (dryRun) return {...report, persisted: null};

  const event = createProductionEvent({
    workspace: current,
    action: "packaging-paragraph-canary-activated",
    targetId: marker.markerSha256,
    payload: {targetShotIds: marker.targetShotIds, qualityAuthoritySha256: marker.qualityAuthoritySha256, sourceStudySha256: marker.sourceStudySha256, imageGenerationPerformed: false, userVisualApproval: "NOT_APPROVED"},
    now,
  });
  const eventBound = structuredClone(recalculated);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const finalWorkspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  report.workspaceSha256After = finalWorkspace.workspaceSha256;
  const persisted = persistProjectState(appRoot, finalWorkspace, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `packaging-paragraph-canary-activation-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "current-storyboard-production-v1/packaging-paragraph-canary-activation.json": report,
      "current-storyboard-production-v1/storyboard-production-projection.json": finalWorkspace.production.storyboardProductionProjection,
    },
  });
  return {...report, persisted};
});

console.log(JSON.stringify({...result, persistedWorkspaceSha256: result.persisted?.workspaceSha256 || null, transitionSha256: result.persisted?.transitionSha256 || null}, null, 2));
