#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_EDITORIAL_PACKAGING_BOUNDARY_CONTRACT, A1_PACKAGING_BEAT_PLAN_CONTRACT, A1_PACKAGING_ANCHOR_SAMPLING_CONTRACT, assertPackagingBeatPlan, buildPackagingBeatPlan, packagingDispatchDecision, samplePackagingAnchors} from "../apps/studio-next/src/lib/a1-editorial-packaging-boundary-v1.mjs";

const workspace = readProjectWorkspace(path.resolve("apps/studio-next"));
const boundary = workspace.production.packagingBoundary;
const plan = workspace.production.packagingBeatPlan;
assert.equal(boundary?.contract, A1_EDITORIAL_PACKAGING_BOUNDARY_CONTRACT);
assert.equal(plan?.contract, A1_PACKAGING_BEAT_PLAN_CONTRACT);
assertPackagingBeatPlan(plan);
assert.equal(plan.semanticBeatCount, workspace.article.shotCount);
assert.ok(plan.packagingEventCount < plan.semanticBeatCount);
assert.equal(plan.noPackageMajority, true);
assert.ok(plan.noPackageCount > plan.packagingEventCount);
assert.equal(plan.selector.contract, "A1PackagingSelectorPolicy/v2");
assert.equal(plan.selector.maxPackagingEvents, undefined);
assert.equal(plan.anchorSampling.contract, A1_PACKAGING_ANCHOR_SAMPLING_CONTRACT);
assert.equal(plan.anchorSampling.maxAnchors, 3);
assert.equal(plan.anchorSampling.anchorSampleLimit, 3);
assert.ok(plan.items.every((item) => ["selected", "NO_PACKAGE", "incompatible-packaging", "below-value-threshold", "spacing-suppressed", "density-suppressed"].includes(item.selectionStatus)));
assert.ok(plan.items.filter((item) => item.selectionStatus === "selected").every((item) => item.valueAdded > 0 && item.whyPackagingIsBetterThanNoPackage));
const sampledAnchors = samplePackagingAnchors(plan, {maxAnchors: 3, anchorSampleLimit: 3});
assert.equal(sampledAnchors.length, Math.min(3, plan.packagingEvents.length));
assert.equal(new Set(sampledAnchors.map((event) => event.eventId)).size, sampledAnchors.length);
assert.ok(sampledAnchors.every((event) => plan.packagingEvents.some((candidate) => candidate.eventId === event.eventId)));
assert.equal(new Set(sampledAnchors.map((event) => event.packagingType)).size, sampledAnchors.length, "anchor sampling should prefer distinct package types");
if (workspace.production.packagingAnchorProof?.advisoryOnly !== true) assert.deepEqual(plan.anchorSampling.selectedEventIds, workspace.production.packagingAnchorProof.eventIds);
assert.ok(!plan.packagingEvents.some((event) => event.sourceBeatIds.includes("ED-01")));
assert.equal(plan.items.find((item) => item.beatId === "ED-01")?.itemType, "NO_PACKAGE");
assert.ok(plan.packagingEvents.some((event) => event.sourceBeatIds.includes("ED-09")));
assert.ok(plan.packagingEvents.some((event) => event.sourceBeatIds.includes("ED-10")));
assert.ok(plan.packagingEvents.some((event) => event.sourceBeatIds.includes("ED-14")));
assert.equal(plan.summary.packagingEventCount, plan.packagingEvents.length);
assert.equal(Object.values(plan.summary.packagingTypes).reduce((sum, count) => sum + count, 0), plan.packagingEventCount);
for (const [packagingType, count] of Object.entries(plan.summary.packagingTypes)) {
  assert.equal(plan.packagingEvents.filter((event) => event.packagingType === packagingType).length, count);
}
for (const event of plan.packagingEvents) {
  assert.ok(event.assemblyModeReason && event.whyThisModeBeatsOtherModes, `${event.eventId} needs explicit assembly-mode reasoning`);
}
for (const beatId of ["ED-33", "ED-34"]) assert.ok(plan.items.find((item) => item.beatId === beatId)?.candidateEvaluation?.status, `${beatId} must have an objective candidate evaluation`);
for (const beatId of ["ED-02", "ED-03"]) {
  const item = plan.items.find((candidate) => candidate.beatId === beatId);
  assert.equal(item.itemType, "NO_PACKAGE", `${beatId} must be NO_PACKAGE`);
  assert.equal(item.generationAllowed, false);
  assert.equal(packagingDispatchDecision(item), false);
}
const ed32 = plan.items.find((candidate) => candidate.beatId === "ED-32");
assert.equal(ed32.selectionStatus, "selected", "ED-32's three boundary phrases must be recalled as a typography event");
assert.equal(ed32.generationAllowed, true);
assert.equal(packagingDispatchDecision(ed32), true);
assert.ok(["KEYWORD_OVERLAY", "CONTRAST_OVERLAY", "FULL_TYPOGRAPHY"].includes(ed32.typographyTreatment));
const currentSequence = workspace.production.canonicalCreatorPackagingSequence;
const effectivePackageItems = currentSequence.decisions.filter((item) => item.packageDecision === "PACKAGE");
const effectiveNoPackageItems = currentSequence.decisions.filter((item) => item.packageDecision === "NO_PACKAGE");
assert.equal(effectivePackageItems.length + effectiveNoPackageItems.length, currentSequence.decisions.length);
assert.equal(currentSequence.decisions.find((item) => item.shotId === "ED-01")?.packageDecision, "PACKAGE", "current canonical authority must promote the opening product identity title");
assert.deepEqual(currentSequence.decisions.find((item) => item.shotId === "ED-01")?.requiredFormalText, ["智能写作工作台"]);
assert.equal(currentSequence.decisions.find((item) => item.shotId === "ED-32")?.packageDecision, "NO_PACKAGE", "current canonical authority must suppress recalled ED-32 packaging");
assert.equal(currentSequence.decisions.find((item) => item.shotId === "ED-15")?.packageDecision, "NO_PACKAGE", "ED-15 presenter breathing beat must remain NO_PACKAGE");
for (const event of plan.packagingEvents) {
  const item = plan.items.find((candidate) => candidate.beatId === event.sourceBeatIds[0]);
  assert.equal(packagingDispatchDecision(item), true);
}
const crossBeat = buildPackagingBeatPlan({projectId: "fixture", sourceHash: "source", selectionPolicy: {maxDensityRatio: 0.5, minGapBeats: 1}, semanticBeats: [
  {beatId: "b1", order: 1, sourceRange: {shotIds: ["b1"]}, sourceText: "关键观点选择", editMode: "full-package", semanticRole: "key-claim", importanceScore: 7, packagingGroupId: "method"},
  {beatId: "b2", order: 2, sourceRange: {shotIds: ["b2"]}, sourceText: "补充机制说明", editMode: "full-package", semanticRole: "core-method", importanceScore: 4, packagingGroupId: "method"},
  {beatId: "b3", order: 3, sourceRange: {shotIds: ["b3"]}, sourceText: "普通口播", editMode: "presenter-clean", semanticRole: "ordinary-narration", importanceScore: 0},
  {beatId: "b4", order: 4, sourceRange: {shotIds: ["b4"]}, sourceText: "另一段普通口播", editMode: "presenter-clean", semanticRole: "ordinary-narration", importanceScore: 0},
]});
assert.equal(crossBeat.packagingEvents.length, 1);
assert.deepEqual(crossBeat.packagingEvents[0].sourceBeatIds, ["b1", "b2"]);
assertPackagingBeatPlan(crossBeat);
console.log(JSON.stringify({status: "PASS", contract: A1_PACKAGING_BEAT_PLAN_CONTRACT, semanticBeatCount: plan.semanticBeatCount, classifierRecalledPackagingEventCount: plan.packagingEventCount, currentCanonicalPackagingEventCount: effectivePackageItems.length, currentCanonicalNoPackageCount: effectiveNoPackageItems.length, currentCanonicalPackagingShotIds: effectivePackageItems.map((item) => item.shotId), crossBeatRange: ["b1", "b2"]}, null, 2));
