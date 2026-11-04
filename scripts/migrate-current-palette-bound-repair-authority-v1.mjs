#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = await withProjectLock(appRoot, async () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("palette-bound-repair-migration-requires-frozen-idle-runtime");
  if ((before.production.shotIntelligence.currentAssembly || []).length) throw new Error("palette-bound-repair-migration-assembly-forbidden");
  const next = structuredClone(before);
  const packageDecisions = next.production.canonicalCreatorPackagingSequence.decisions.filter((item) => item.packageDecision === "PACKAGE");
  const bindings = {};
  for (const decision of packageDecisions) {
    const plan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === decision.shotId);
    const sha = plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256;
    const raw = next.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === decision.shotId && item.artifact?.sha256 === sha);
    const prior = before.production.creatorPaletteBoundRepair?.shotBindings?.[decision.shotId] || {};
    if (!plan || !sha || !raw) throw new Error(`palette-bound-repair-migration-binding-missing:${decision.shotId}`);
    bindings[decision.shotId] = {
      ...structuredClone(prior),
      contract: "A1CreatorPaletteBoundRepairShotBinding/v1",
      shotId: decision.shotId,
      bindingMode: "ZERO_GENERATION_PALETTE_REBIND",
      reboundCandidateId: raw.referenceId,
      reboundCandidateSha256: sha,
      effectiveAssemblyMode: decision.assemblyMode,
      effectivePresentationMode: decision.presentationMode,
      immutableHistoryAlias: null,
      overlayCompositeAudit: null,
      reason: "CURRENT_CANONICAL_SYSTEM_PIXEL_PASS_REBIND_NO_GENERATION",
      updatedAt: now,
    };
  }
  const migratedRepair = {contract: "A1CreatorPaletteBoundRepair/v1", version: 1, status: "PREPARED_NO_GENERATION", shotBindings: bindings, imageGenerationPerformed: false, workerStartAllowed: false, migration: {contract: "A1CurrentPaletteBoundRepairAuthorityMigration/v1", status: "PASS", reason: "stale repair bindings were rebound to current canonical SYSTEM_PIXEL_PASS candidates and independent presentation modes; no image generation", sourceWorkspaceSha256: before.workspaceSha256, updatedAt: now}};
  migratedRepair.repairInputSha256 = sha256({sourceWorkspaceSha256: before.workspaceSha256, sequenceSha256: next.production.canonicalCreatorPackagingSequence.sequenceSha256, bindings: Object.fromEntries(Object.entries(bindings).map(([shotId, binding]) => [shotId, {shotId, reboundCandidateSha256: binding.reboundCandidateSha256, effectiveAssemblyMode: binding.effectiveAssemblyMode, effectivePresentationMode: binding.effectivePresentationMode}]))});
  migratedRepair.repairSha256 = sha256({...migratedRepair, repairSha256: undefined});
  next.production.creatorPaletteBoundRepair = migratedRepair;
  next.production.packagingAutomation = {...(next.production.packagingAutomation || {}), currentStage: "creator-packaging-palette-binding-authority-migrated", targetShotIds: [], updatedAt: now};
  const event = createProductionEvent({workspace: next, action: "migrate-current-palette-bound-repair-authority", targetId: migratedRepair.repairSha256, payload: {contract: migratedRepair.migration.contract, packageShotCount: packageDecisions.length, imageGenerationPerformed: false, assemblyCreated: false, criticPerformed: false, motionPerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: before.workspaceSha256, commitId: `palette-bound-repair-migration-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {workspaceSha256After: committed.workspaceSha256, repairSha256: migratedRepair.repairSha256, packageShotCount: packageDecisions.length, imageGenerationPerformed: false, assemblyCreationAllowed: false};
});
console.log(JSON.stringify(result, null, 2));
