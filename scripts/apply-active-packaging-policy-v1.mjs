#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildActivePackagingPolicy, assertActivePackagingPolicy} from "../apps/studio-next/src/lib/a1-active-packaging-policy-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {ensurePackagingReviewState} from "../apps/studio-next/src/lib/a1-packaging-review-controller-v1.mjs";

const appRoot = path.resolve("apps/studio-next");
const now = process.env.A1_PACKAGING_POLICY_AT || new Date().toISOString();
withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const policy = buildActivePackagingPolicy({now});
  assertActivePackagingPolicy(policy);
  next.production.packagingPolicy = policy;
  next.production.shotIntelligence.activePackagingPolicy = policy;
  next.production.packagingReview ||= {};
  ensurePackagingReviewState(next, now);
  next.production.packagingReview.legacyStatusReadOnly = true;
  next.production.packagingReview.legacyPolicy = {status: "HISTORY_READ_ONLY", supersededBy: policy.contract, reason: policy.legacyLookMasterApproval.reason};
  const event = createProductionEvent({workspace: current, action: "activate-exception-only-packaging-attention-policy", targetId: "PACKAGING_LANE", payload: {policySha256: policy.sha256, lookMasterIntermediateApprovalRequired: false, finalAssemblyApprovalRequired: true, routinePerEventApprovalRequired: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  console.log(JSON.stringify({status: "PASS", workspaceSha256: recalculated.workspaceSha256, rootStatus: recalculated.status, runtimeStatus: recalculated.production.shotIntelligence.status, policySha256: policy.sha256, nextAction: recalculated.production.authority.nextAction}, null, 2));
});
