import assert from "node:assert/strict";
import {compileResolvePackagingHandoffPlan, assertResolvePackagingHandoff} from "../apps/studio-next/src/lib/a1-resolve-packaging-handoff-v1.mjs";

const packageDecision = {
  shotId: "ED-01",
  route: "FULLSCREEN_PACKAGE",
  status: "BLOCKED_INDEPENDENT_PACKAGE_SOURCES_REQUIRED",
  routeDecisionReason: ["presenterVisibility=NOT_REQUIRED", "frameTakeoverAllowed=true", "independentMode=FULLSCREEN"],
  asset: null,
  textNodes: [],
  assetPixelSources: [],
  referenceContextBindings: [],
  forbiddenPixelSources: ["PRESENTER"],
};
const decisions = [packageDecision, {shotId: "ED-02", route: "NO_PACKAGE", status: "NO_PACKAGE", routeDecisionReason: ["packageDecision!=PACKAGE"], asset: null, textNodes: []}];

const unbound = compileResolvePackagingHandoffPlan({shotDecisions: decisions, sourceTimelineBindings: {}});
assert.equal(unbound.status, "UNBOUND_TIMELINE_PLAN");
assertResolvePackagingHandoff(unbound);
assert.ok(unbound.events.every((event) => event.startFrame === null && event.endFrame === null && event.duration === null && event.fps === null && event.sourceTimelineRange === null));

const liveBinding = {"ED-01": {status: "LIVE_READBACK", startFrame: 100, endFrame: 200, fps: 30, evidence: {source: "RESOLVE_READBACK", capturedAt: "2026-08-11T00:00:00.000Z", itemId: "ED-01"}}};
const liveReadback = {status: "LIVE_READBACK", projectId: "project-1", projectName: "Article", timelineId: "timeline-1", timelineName: "Article Main", timelineSha256: "a".repeat(64), fps: 30};
const bound = compileResolvePackagingHandoffPlan({shotDecisions: decisions.slice(0, 1), sourceTimelineBindings: liveBinding, liveTimelineReadback: liveReadback});
assert.equal(bound.status, "BOUND_LIVE_TIMELINE");
assert.equal(bound.events[0].startFrame, 100);
assert.equal(bound.events[0].duration, 100);
assertResolvePackagingHandoff(bound);
assert.throws(() => compileResolvePackagingHandoffPlan({shotDecisions: decisions.slice(0, 1), sourceTimelineBindings: liveBinding}), /live-readback-required/u);
assert.throws(() => compileResolvePackagingHandoffPlan({shotDecisions: decisions.slice(0, 1), sourceTimelineBindings: {"ED-01": {...liveBinding["ED-01"], evidence: null}}, liveTimelineReadback: liveReadback}), /live-binding-evidence-required/u);
assert.throws(() => compileResolvePackagingHandoffPlan({shotDecisions: [{...packageDecision, shotId: "ED-02"}, {...packageDecision, shotId: "ED-03"}], sourceTimelineBindings: {"ED-02": liveBinding["ED-01"], "ED-03": {...liveBinding["ED-01"], startFrame: 150, endFrame: 250}}, liveTimelineReadback: liveReadback}), /undeclared-timeline-overlap/u);

const fakeRange = structuredClone(unbound);
fakeRange.events[0].startFrame = 100;
assert.throws(() => assertResolvePackagingHandoff(fakeRange), /pretends-timeline/u);

const noPackageBad = {...unbound, events: unbound.events.map((event) => event.route === "NO_PACKAGE" ? {...event, fontProof: {bad: true}, editableTextSpec: {required: true, nodes: [{bad: true}]}} : event)};
assert.throws(() => assertResolvePackagingHandoff(noPackageBad), /no-package-payload/u);

const withText = compileResolvePackagingHandoffPlan({shotDecisions: [{...packageDecision, textNodes: [{nodeId: "node-1", text: "像素标题", sourcePhrase: "像素标题", semanticRole: "headline", fontAssetId: "a1-fusion-pixel", fontSha256: "b".repeat(64), glyphProof: {outlineSha256: "c".repeat(64)}, verbatimFromProtectedPhrases: true, wholeTranscript: false, productionAdmissionAllowed: true}]}]});
assertResolvePackagingHandoff(withText);
assert.equal(withText.events[0].timelineAssetEditableText, false);
assert.equal(withText.events[0].editableTextSpec.required, false);
assert.equal(withText.events[0].editableTextSpec.mode, "RECONSTRUCTION_METADATA_ONLY");

assert.equal(unbound.staleNonAuthoritativePlans.length, 0);
console.log(JSON.stringify({status: "PASS", contract: "A1ResolvePackagingHandoff/v4", unboundTimelineBlocked: true, liveReadbackBindingAccepted: true, missingReadbackRejected: true, overlapRejected: true, fakeRangeRejected: true, noPackagePayloadRejected: true, bakedTextEditabilityHonest: true, compatibilityPreviewExcluded: true}));
