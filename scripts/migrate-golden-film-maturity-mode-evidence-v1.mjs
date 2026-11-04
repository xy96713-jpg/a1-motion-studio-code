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
  const changed = [];
  for (const raw of runtime.lookMasterRawReferences || []) {
    if (!raw.goldenFilmMaturityAudit) continue;
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === raw.shotId);
    if (!plan) continue;
    const actualFrameOccupation = plan.shotId === "ED-15"
      ? raw.pixelAudit?.actualPixelMetrics?.hasAlpha === true ? "OVERLAY" : null
      : plan.frameOccupation || plan.canonicalCreatorDecision?.frameOccupation || null;
    if (!actualFrameOccupation || raw.goldenFilmMaturityAudit.actualFrameOccupation === actualFrameOccupation) continue;
    raw.goldenFilmMaturityAudit = {...raw.goldenFilmMaturityAudit, actualFrameOccupation, modeEvidence: "ACTUAL_PIXEL_COMPOSITION_AND_CANONICAL_MODE_AUDIT"};
    changed.push({shotId: raw.shotId, artifactSha256: raw.artifact.sha256, actualFrameOccupation});
  }
  if (!changed.length) return {noop: true, workspaceSha256: before.workspaceSha256, changed};
  const event = createProductionEvent({workspace: before, action: "migrate-golden-film-maturity-mode-evidence-v1", targetId: "GOLDEN_FILM_VISUAL_SYSTEM_MATURITY_V1", payload: {contract: "A1GoldenFilmMaturityActualModeEvidenceMigration/v1", changed, ocrRepeated: false, semanticAuditRepeated: false}, now: new Date().toISOString()});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, event.createdAt)), {expectedWorkspaceSha256: before.workspaceSha256, event});
  return {noop: false, workspaceSha256: committed.workspaceSha256, changed};
});

console.log(JSON.stringify({status: "PASS", ...result}, null, 2));
