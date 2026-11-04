#!/usr/bin/env node

import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");

const result = withProjectLock(appRoot, () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(before);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-16");
  const raw = [...(runtime.lookMasterRawReferences || [])].reverse().find((item) => item.shotId === "ED-16" && item.pixelAudit?.status === "PASS" && item.semanticPixelAudit?.status === "PASS" && item.recommendationEligible === true && item.selectionEligible === true);
  if (!plan || !raw) throw new Error("golden-film-maturity-pass-selection-missing");
  plan.provisionalWholeFilmBoardSelection = {
    ...(plan.provisionalWholeFilmBoardSelection || {}),
    contract: "A1ProvisionalWholeFilmBoardSelection/v1",
    status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL",
    candidateId: raw.referenceId,
    directionId: raw.candidateDirectionId,
    artifact: structuredClone(raw.artifact),
    compositePreview: structuredClone(raw.pixelAudit.compositePreview),
    actualPixelAuditSha256: raw.pixelAudit.auditSha256,
    semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256,
    selectedAt: new Date().toISOString(),
    selectionSource: "MATURITY_LOCAL_ACTUAL_PIXEL_PASS_NO_CRITIC",
  };
  const event = createProductionEvent({workspace: before, action: "select-golden-film-maturity-pass-v1", targetId: raw.artifact.sha256, payload: {contract: "A1GoldenFilmMaturityCandidateSelection/v1", shotId: "ED-16", rawReferenceId: raw.referenceId, artifactSha256: raw.artifact.sha256, pixelAuditSha256: raw.pixelAudit.auditSha256, semanticAuditSha256: raw.semanticPixelAudit.auditSha256, noAssembly: true, noCritic: true}, now: new Date().toISOString()});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, event.createdAt)), {expectedWorkspaceSha256: before.workspaceSha256, event});
  return {workspaceSha256: committed.workspaceSha256, shotId: "ED-16", rawReferenceId: raw.referenceId, artifactSha256: raw.artifact.sha256, pixelAuditSha256: raw.pixelAudit.auditSha256, semanticAuditSha256: raw.semanticPixelAudit.auditSha256};
});

console.log(JSON.stringify({status: "PASS", ...result}, null, 2));
