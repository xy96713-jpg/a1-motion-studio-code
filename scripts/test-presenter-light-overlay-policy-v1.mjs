#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {auditPresenterLightOverlayPolicy, presenterLightOverlayProjection} from "../apps/studio-next/src/lib/a1-presenter-light-overlay-policy-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const sequence = workspace.production.canonicalCreatorPackagingSequence;
const plans = workspace.production.shotIntelligence.packageLookMasterPlans || [];
const targetShotIds = sequence.decisions.filter((decision) => decision.packageDecision === "PACKAGE" && String(decision.presentationMode || "").startsWith("PRESENTER_")).map((decision) => decision.shotId);
const targetDecisions = sequence.decisions.filter((decision) => targetShotIds.includes(decision.shotId));
const targetPlans = plans.filter((plan) => targetShotIds.includes(plan.shotId));

assert.equal(targetDecisions.length, targetShotIds.length, "presenter-light-overlay-policy:target-decisions-missing");
assert.equal(targetPlans.length, targetShotIds.length, "presenter-light-overlay-policy:target-plans-missing");

const audit = auditPresenterLightOverlayPolicy({decisions: targetDecisions, plans: targetPlans});
assert.equal(audit.status, "PASS", JSON.stringify(audit));
assert.deepEqual(audit.blockedShotIds, []);
for (const plan of targetPlans) {
  assert.equal(plan.assemblyMode, "OVERLAY", `${plan.shotId}:assembly-mode`);
  assert.equal(plan.frameOccupation, "OVERLAY", `${plan.shotId}:frame-occupation`);
  assert.notEqual(plan.presentationMode, "FULLSCREEN", `${plan.shotId}:fullscreen-presenter-route`);
  assert.equal(plan.videoContext?.baseSubjectMustRemainVisible, true, `${plan.shotId}:presenter-base-visibility`);
  assert.equal(plan.videoContext?.frameTakeoverAllowed, false, `${plan.shotId}:frame-takeover`);
}

// ED-19 is now bound to the same current presenter-overlay contract as the
// other presenter shots; the former full-frame C4 route is history-only.
const ed19Decision = sequence.decisions.find((decision) => decision.shotId === "ED-19");
const ed19Plan = plans.find((plan) => plan.shotId === "ED-19");
assert.equal(ed19Decision?.frameOccupation, "OVERLAY", "ED-19:canonical-presenter-routing-frame");
assert.equal(ed19Decision?.contentTreatment, "PIXEL_WINDOW", "ED-19:pixel-window-master");
assert.equal(ed19Decision?.presentationMode, "PRESENTER_INTEGRATED_LOOK_MASTER", "ED-19:canonical-presenter-routing-presentation");
assert.equal(ed19Plan?.assemblyMode, "OVERLAY", "ED-19:overlay-assembly-mode");
assert.equal(ed19Plan?.frameOccupation, "OVERLAY", "ED-19:overlay-frame-occupation");
assert.equal(ed19Plan?.presentationMode, "PRESENTER_INTEGRATED_LOOK_MASTER", "ED-19:overlay-presentation-mode");
assert.equal(ed19Plan?.typographyTreatment, "EVA_TEXTURE_ONLY", "ED-19:eva-packaging-only");
assert.equal(ed19Plan?.videoContext?.baseSubjectMustRemainVisible, true, "ED-19:presenter-base-visibility");
assert.equal(ed19Plan?.videoContext?.frameTakeoverAllowed, false, "ED-19:takeover-forbidden");

const incumbentDecision = targetDecisions.find((decision) => decision.shotId === "ED-07");
const incumbentPlan = targetPlans.find((plan) => plan.shotId === "ED-07");
const forgedFullscreenDecision = {
  ...structuredClone(incumbentDecision),
  packageDecision: "PACKAGE",
  frameOccupation: "OVERLAY",
  baseVisualCarrier: "PRESENTER_BASE",
  assemblyMode: "FULLSCREEN",
  presentationMode: "FULLSCREEN",
};
const forgedFullscreenPlan = {
  ...structuredClone(incumbentPlan),
  assemblyMode: "FULLSCREEN",
  frameOccupation: "OVERLAY",
  presentationMode: "FULLSCREEN",
  presenterPackagingMode: "FULLSCREEN_EXPLAINER_TAKEOVER",
  videoContext: {
    ...structuredClone(incumbentPlan.videoContext),
    frameTakeoverAllowed: true,
    baseSubjectMustRemainVisible: false,
  },
};
const forgedProjection = presenterLightOverlayProjection(forgedFullscreenDecision, forgedFullscreenPlan);
assert.equal(forgedProjection?.status, "BLOCK", "presenter-light-overlay-policy:fullscreen-must-block");
assert.ok(forgedProjection.failures.includes("FULLSCREEN_PRESENTATION_FORBIDDEN_ON_PRESENTER_BASE"));
assert.ok(forgedProjection.failures.includes("FRAME_TAKEOVER_FORBIDDEN_ON_PRESENTER_BASE"));
assert.ok(forgedProjection.failures.includes("PRESENTER_BASE_MUST_REMAIN_VISIBLE"));

console.log(JSON.stringify({
  status: "PASS",
  contract: audit.contract,
  workspaceSha256: workspace.workspaceSha256,
  targetShotIds,
  targetCount: audit.targetCount,
  blockedShotIds: audit.blockedShotIds,
  fullscreenMutationBlocked: forgedProjection.failures,
  userVisualApproval: workspace.production.shotIntelligence.wholeFilmStaticBoard?.userVisualApproval || "NOT_APPROVED",
  motionAllowed: workspace.production.shotIntelligence.wholeFilmBatchRecommendation?.motionAllowed || false,
}, null, 2));
