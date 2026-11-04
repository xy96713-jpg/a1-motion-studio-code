#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertMotionComponentBinding, auditThreePhasePreview, compileOrderedActorTimeline, deriveStoryboardMotionDesignContract} from "../apps/studio-next/src/lib/a1-storyboard-motion-design-contract-v1.mjs";

const sha = (char) => char.repeat(64);
const base = {versionId: "current-v1", artifactPublicUrl: "/generated/current.png", artifactSha256: sha("a"), revisionSha256: sha("b"), semanticJob: "Make the semantic change visible", actionContract: {before: "stable initial state", hold: "one causal response", after: "readable final state", handoff: "next beat"}};
const entity = deriveStoryboardMotionDesignContract({...base, shotId: "FIXTURE_ENTITY", route: "PACKAGE_LOOK_MASTER", source: "GENERATED_EDITORIAL"}, {exactIdentityBinding: true, visualActor: "verified entity marks", semanticAction: "accumulate verified attempts", geometryFingerprint: sha("c")});
const evidence = deriveStoryboardMotionDesignContract({...base, shotId: "FIXTURE_EVIDENCE", route: "PACKAGE_LOOK_MASTER", source: "REAL_SOURCE"}, {visualActor: "verified paper evidence"});
const generative = deriveStoryboardMotionDesignContract({...base, shotId: "FIXTURE_MECHANICAL", route: "PACKAGE_LOOK_MASTER", source: "GENERATED_EDITORIAL"}, {independentGenerativeActor: true, visualActor: "textless mechanical actor"});
const screen = deriveStoryboardMotionDesignContract({...base, shotId: "FIXTURE_SCREEN", route: "SCREEN_EVIDENCE", source: "REAL_SOURCE"});
assert.equal(entity.executionRoute, "LOCAL_DETERMINISTIC_MOTION");
assert.equal(evidence.executionRoute, "LOCAL_EVIDENCE_MOTION");
assert.equal(generative.executionRoute, "XIAOYUNQUE_MOTION");
assert.equal(screen.executionRoute, "SCREEN_CAP_NATIVE");
assert.ok(entity.forbiddenTechniques.includes("GENERATIVE_IDENTITY_REDRAW"));
assert.ok(evidence.forbiddenTechniques.includes("GENERATIVE_EVIDENCE_REDRAW"));
assertMotionComponentBinding(entity, {versionId: "current-v1", artifactSha256: sha("a"), motionDesignSha256: entity.motionDesignSha256, geometryFingerprint: sha("c")});
assert.equal(entity.visualConstructionContract.independentElementAnimation, "REQUIRES_VERIFIED_ALPHA_SOURCE");
assert.equal(entity.visualConstructionContract.safeFallback, "STATIC_CURRENT_STORYBOARD_HOLD");
assert.deepEqual(compileOrderedActorTimeline({shotId: "ED-12", actionContract: {hold: "GPT、Claude、Kimi、DeepSeek、智谱按顺序"}, timeRange: {durationMs: 5000}}).map((item) => item.actorId), ["GPT", "Claude", "Kimi", "DeepSeek", "智谱"]);
assert.equal(compileOrderedActorTimeline({shotId: "N-01", actionContract: {hold: "one continuous evidence actor"}})[0].entry, "CONTINUOUS_FIELD_REVEAL");
assert.throws(() => assertMotionComponentBinding(entity, {versionId: "old-v1", artifactSha256: sha("a"), motionDesignSha256: entity.motionDesignSha256, geometryFingerprint: sha("c")}), /motion-component-version-stale/u);
assert.throws(() => assertMotionComponentBinding(entity, {versionId: "current-v1", artifactSha256: sha("d"), motionDesignSha256: entity.motionDesignSha256, geometryFingerprint: sha("c")}), /motion-component-artifact-stale/u);
assert.throws(() => assertMotionComponentBinding(entity, {versionId: "current-v1", artifactSha256: sha("a"), motionDesignSha256: sha("d"), geometryFingerprint: sha("c")}), /motion-component-design-stale/u);
assert.throws(() => assertMotionComponentBinding(entity, {versionId: "current-v1", artifactSha256: sha("a"), motionDesignSha256: entity.motionDesignSha256, geometryFingerprint: sha("d")}), /motion-component-geometry-stale/u);
assert.equal(auditThreePhasePreview(entity, {setup: {sha256: sha("d"), actualPixelReviewed: true}, action: {sha256: sha("e"), actualPixelReviewed: true}, hold: {sha256: sha("f"), actualPixelReviewed: true}}).videoRenderAllowed, true);
assert.equal(auditThreePhasePreview(entity, {setup: {sha256: sha("d"), actualPixelReviewed: true}, action: {sha256: sha("d"), actualPixelReviewed: true}, hold: {sha256: sha("f"), actualPixelReviewed: true}}).videoRenderAllowed, false);
assert.equal(auditThreePhasePreview(entity, {setup: {sha256: sha("d"), actualPixelReviewed: true}, action: {sha256: sha("e"), actualPixelReviewed: false}, hold: {sha256: sha("f"), actualPixelReviewed: true}}).videoRenderAllowed, false);
console.log(JSON.stringify({status: "PASS", contract: "A1StoryboardMotionDesignContractTest/v1", fixtureGenres: ["verified-entity-enumeration", "research-evidence", "textless-mechanical-explainer", "screen-operation"], routes: [entity.executionRoute, evidence.executionRoute, generative.executionRoute, screen.executionRoute], staleGeometryBlocked: true, threePhaseGate: true}, null, 2));
