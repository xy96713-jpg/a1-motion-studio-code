#!/usr/bin/env node

import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {canonicalTitleRepairActualPixelAuditPassed, canonicalTitleRepairRawBindingIsAdmissible, canonicalTitleRepairUnboundShotIds} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";
import {buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const audit = runtime.canonicalTitleRepairActualPixelAudit;
  if (!canonicalTitleRepairActualPixelAuditPassed(current)) throw new Error("canonical-title-repair-pixel-audit-not-current-pass");

  const next = structuredClone(current);
  const boundShotIds = [];
  const skipped = [];
  for (const auditItem of audit.audits || []) {
    const plan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === auditItem.shotId);
    const raw = next.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === auditItem.shotId
      && canonicalTitleRepairRawBindingIsAdmissible(plan, item)
      && item.recommendationEligible === true
      && item.selectionEligible === true
      && item.artifact?.sha256 === auditItem.artifactSha256
      && item.semanticPixelAudit?.status === "PASS"
      && item.pixelAudit?.admissionAllowed === true
      && item.pixelAudit?.auditSha256 === auditItem.auditSha256);
    if (!plan || !raw) {
      const planStyle = plan?.canonicalRepair?.formalTypographyStyleMode || null;
      const hasHashMatch = next.production.shotIntelligence.lookMasterRawReferences.some((item) => item.shotId === auditItem.shotId
        && item.current === true
        && item.planSha256 === plan?.planSha256
        && item.artifact?.sha256 === auditItem.artifactSha256);
      skipped.push({
        shotId: auditItem.shotId,
        reason: String(planStyle).startsWith("EVA_") && hasHashMatch
          ? "EVA_FORMAL_HERO_STYLE_BINDING_REQUIRED"
          : "NO_CURRENT_PLAN_HASH_MATCHING_AUDITED_ARTIFACT",
      });
      continue;
    }
    plan.provisionalWholeFilmBoardSelection = {
      contract: "A1ProvisionalWholeFilmBoardSelection/v1",
      status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL",
      candidateId: raw.referenceId || `raw-${raw.shotId}-${raw.artifact.sha256.slice(0, 12)}`,
      directionId: raw.canonicalPrimitiveId || plan.canonicalRepair?.primitiveId || null,
      artifact: structuredClone(raw.artifact),
      compositePreview: raw.pixelAudit?.compositePreview ? structuredClone(raw.pixelAudit.compositePreview) : null,
      actualPixelAuditSha256: raw.pixelAudit.auditSha256,
      semanticPixelAuditSha256: raw.semanticPixelAudit?.auditSha256 || null,
      selectedAt: raw.pixelAudit.generatedAt || raw.importedAt || null,
      selectionSource: "CURRENT_PLAN_HASH_BOUND_ACTUAL_PIXEL_PASS",
    };
    boundShotIds.push(plan.shotId);
  }

  const now = new Date().toISOString();
  // Recompute the downstream palette binding in the same transaction. The
  // title-repair bind changes the current candidate pointer; leaving the
  // older manifest in place makes the authority report a false mode conflict.
  next.production.creatorPaletteShotBindingManifest = buildCreatorPaletteShotBindingManifest(next, {now});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const remaining = canonicalTitleRepairUnboundShotIds(recalculated);
  const event = createProductionEvent({
    workspace: recalculated,
    action: "bind-canonical-title-repair-candidates-v1",
    targetId: recalculated.production.authority.nextAction?.id || recalculated.production.authority.currentStage,
    payload: {
      contract: "A1CanonicalTitleRepairCandidateBinding/v1",
      sourceWorkspaceSha256: current.workspaceSha256,
      boundShotIds,
      skipped,
      remainingUnboundShotIds: remaining,
      imageGenerationPerformed: false,
      assemblyCreated: false,
      motionPerformed: false,
    },
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `canonical-title-repair-binding-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
  });
  return {
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: persisted.workspaceSha256,
    boundShotIds,
    skipped,
    remainingUnboundShotIds: remaining,
    nextAction: recalculated.production.authority.nextAction,
    imageGenerationPerformed: false,
    assemblyCreated: false,
    motionPerformed: false,
  };
});

console.log(JSON.stringify(result, null, 2));
