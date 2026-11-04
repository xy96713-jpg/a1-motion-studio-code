#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {compileCurrentStoryboardTasteBriefs} from "../apps/studio-next/src/lib/a1-current-storyboard-taste-compiler-v1.mjs";
import {buildPackagingParagraphUpgradeMarker} from "../apps/studio-next/src/lib/a1-packaging-paragraph-quality-v1.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const now = new Date().toISOString();
const dryRun = process.argv.includes("--dry-run");

function historyEntry(brief, {supersededBy = null, reason}) {
  return {...structuredClone(brief), current: false, status: "HISTORY_READ_ONLY", authorityScope: "HISTORY_READ_ONLY", supersededByStyleBriefSha256: supersededBy, supersededReason: reason};
}

function appendUniqueHistory(history, entries) {
  const seen = new Set((history || []).map((item) => item.styleBriefSha256).filter(Boolean));
  return [...(history || []), ...entries.filter((item) => item.styleBriefSha256 && !seen.has(item.styleBriefSha256))];
}

function buildMigration(current) {
  const result = compileCurrentStoryboardTasteBriefs(current, {appRoot, now});
  const newByShot = new Map(result.briefs.flatMap((brief) => (brief.sourceBeatIds || []).map((shotId) => [shotId, brief])));
  const oldCurrent = current.production.packagingStyleBriefs || [];
  const activeShotIds = new Set(result.compilation.shotIds);
  const superseded = oldCurrent.filter((brief) => (brief.sourceBeatIds || []).some((shotId) => activeShotIds.has(shotId))).map((brief) => {
    const replacement = (brief.sourceBeatIds || []).map((shotId) => newByShot.get(shotId)).find(Boolean);
    return historyEntry(brief, {supersededBy: replacement?.styleBriefSha256 || null, reason: "Current semantic timeline Taste migration; prior style brief remains evidence only."});
  });
  const removedLegacy = oldCurrent.filter((brief) => !(brief.sourceBeatIds || []).some((shotId) => activeShotIds.has(shotId))).map((brief) => historyEntry(brief, {reason: "Current semantic timeline resolves this shot to NO_PACKAGE; prior style brief is not production authority."}));
  const next = structuredClone(current);
  next.production.packagingStyleBriefHistory = appendUniqueHistory(next.production.packagingStyleBriefHistory, [...superseded, ...removedLegacy]);
  next.production.packagingStyleBriefs = result.briefs;
  next.production.packagingStyleBriefAudit = result.audit;
  next.production.currentStoryboardTasteCompilation = result.compilation;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  if (next.production.staticPackageReview?.current === true) {
    next.production.staticPackageReview = {
      ...next.production.staticPackageReview,
      status: "VISUAL_REPAIR_REQUIRED",
      userVisualApproval: "NOT_APPROVED",
      tasteMigration: {
        contract: "A1LegacyPixelTasteMigrationDisposition/v1",
        status: "LEGACY_PIXELS_NOT_TASTE_BOUND",
        legacyShotIds: ["ED-10", "ED-13", "ED-31"],
        storyboardRevisionSha256: result.compilation.source.storyboardRevisionSha256,
        currentStyleBriefSha256ByShot: Object.fromEntries(result.briefs.filter((brief) => ["ED-10", "ED-13", "ED-31"].includes(brief.sourceBeatIds?.[0])).map((brief) => [brief.sourceBeatIds[0], brief.styleBriefSha256])),
        productionAdmitted: false,
        imageGenerationPerformed: false,
        userVisualApproval: "NOT_APPROVED",
        packagingParagraphCanary: buildPackagingParagraphUpgradeMarker(),
      },
    };
  }
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const projection = recalculated.production.storyboardProductionProjection;
  if (projection.counts.package !== 13 || projection.counts.tasteBound !== 13 || projection.counts.tasteUnbound !== 0 || projection.counts.legacyReview !== 3) throw new Error("current-storyboard-taste-migration-projection-invalid");
  if (projection.gate.generationFrozen !== true || projection.gate.userVisualApproval !== "NOT_APPROVED") throw new Error("current-storyboard-taste-migration-freeze-invalid");
  const report = {
    contract: "A1CurrentStoryboardTasteMigrationReport/v1",
    status: "PASS",
    mode: dryRun ? "DRY_RUN" : "APPLY",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    storyboardRevisionSha256: projection.storyboardRevisionSha256,
    projectionSha256: projection.projectionSha256,
    compilationSha256: result.compilation.compilationSha256,
    styleAuditSha256: result.audit.auditSha256,
    currentPackageShotIds: result.compilation.shotIds,
    tasteBoundCount: projection.counts.tasteBound,
    historyAddedCount: [...superseded, ...removedLegacy].length,
    legacyReviewShotIds: projection.items.filter((item) => item.productionStatus === "LEGACY_REVIEW").map((item) => item.shotId),
    imageGenerationPerformed: false,
    generationAutomaticDispatchAllowed: recalculated.production.generation.automaticDispatchAllowed,
    queue: {queued: recalculated.production.generation.summary.queued, running: recalculated.production.generation.summary.running},
    userVisualApproval: projection.gate.userVisualApproval,
    motionAllowed: projection.gate.motionAllowed,
    finalRenderAllowed: projection.gate.finalRenderAllowed,
    generatedAt: now,
  };
  return {recalculated, report, compilation: result.compilation, audit: result.audit, directionEnvelope: result.directionEnvelope};
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const migration = buildMigration(current);
  if (dryRun) return {...migration, persisted: null};
  const event = createProductionEvent({workspace: current, action: "current-storyboard-taste-briefs-migrated", targetId: migration.report.storyboardRevisionSha256, payload: {compilationSha256: migration.report.compilationSha256, currentPackageShotIds: migration.report.currentPackageShotIds, imageGenerationPerformed: false, generationAutomaticDispatchAllowed: false, userVisualApproval: "NOT_APPROVED"}, now});
  const eventBoundWorkspace = structuredClone(migration.recalculated);
  eventBoundWorkspace.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBoundWorkspace.production.eventLedger.lastEventId = event.eventId;
  eventBoundWorkspace.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBoundWorkspace, now));
  const report = {
    ...migration.report,
    workspaceSha256After: recalculated.workspaceSha256,
    projectionSha256: recalculated.production.storyboardProductionProjection.projectionSha256,
  };
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `current-storyboard-taste-migration-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "current-storyboard-production-v1/taste-migration-report.json": report,
      "current-storyboard-production-v1/taste-compilation.json": migration.compilation,
      "current-storyboard-production-v1/taste-style-audit.json": migration.audit,
      "current-storyboard-production-v1/storyboard-production-projection.json": recalculated.production.storyboardProductionProjection,
    },
    systemFiles: {
      "current-storyboard-production-v1/storyboard-interop-v1/visual-direction-envelope.json": migration.directionEnvelope,
    },
  });
  return {...migration, recalculated, report, persisted};
});

console.log(JSON.stringify({...result.report, persistedWorkspaceSha256: result.persisted?.workspaceSha256 || null, transitionSha256: result.persisted?.transitionSha256 || null}, null, 2));
