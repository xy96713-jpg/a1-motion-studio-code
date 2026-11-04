#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {activeEd10OldArtifactReferences, ED10_RETIRED_ARTIFACT_SHA256} from "../apps/studio-next/src/lib/a1-ed10-current-look-master-retirement-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const expectedIndex = process.argv.indexOf("--expected-workspace-sha");
const expectedWorkspaceSha256 = expectedIndex >= 0 ? process.argv[expectedIndex + 1] : null;
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ed10-retirement-reconcile-expected-workspace-sha-required");
const appRoot = path.resolve("apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed10-retirement-reconcile-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  const receipt = current.production.shotIntelligence.retiredLookMasterArtifacts?.find((item) => item.artifactSha256 === ED10_RETIRED_ARTIFACT_SHA256 && item.selectionEligible === false);
  if (!receipt) throw new Error("ed10-retirement-reconcile-receipt-required");
  const beforeReferences = activeEd10OldArtifactReferences(current);
  if (beforeReferences.length) throw new Error(`ed10-retirement-reconcile-active-reference-remains:${beforeReferences.join(",")}`);
  const next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(current), now));
  const afterReferences = activeEd10OldArtifactReferences(next);
  if (afterReferences.length) throw new Error(`ed10-retirement-reconcile-post-recalculate-active-reference-remains:${afterReferences.join(",")}`);
  if (next.production.authority.currentStage !== "ed10-look-master-replacement-review") throw new Error(`ed10-retirement-reconcile-authority-stage-invalid:${next.production.authority.currentStage}`);
  if (next.production.authority.nextAction?.id !== "review-existing-ed10-replacement-candidates" || next.production.authority.nextAction?.requiresUser !== true) throw new Error("ed10-retirement-reconcile-next-action-invalid");
  const event = createProductionEvent({workspace: current, action: "reconcile-ed10-retirement-authority-v2", targetId: "ED-10", payload: {retirementReceiptSha256: receipt.receiptSha256, activeOldArtifactReferences: [], generatedImages: false, assemblyCreated: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `reconcile-ed10-retirement-authority-v2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {status: "PASS", previousWorkspaceSha256: current.workspaceSha256, workspaceSha256: committed.workspaceSha256, currentStage: next.production.authority.currentStage, nextAction: next.production.authority.nextAction, activeOldArtifactReferences: afterReferences, generation: next.production.generation.summary, assemblyCreationAllowed: next.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed};
});

console.log(JSON.stringify(result, null, 2));
