#!/usr/bin/env node
import assert from "node:assert/strict";
import {assertPostProductionReframePlan, compilePostProductionReframePlan} from "../apps/studio-next/src/lib/a1-post-production-reframe-plan-v1.mjs";
import {assertPersistentEvidenceFocusTrack, compilePersistentEvidenceFocusTrack} from "../apps/studio-next/src/lib/a1-persistent-evidence-focus-track-v1.mjs";

const sha = (character) => character.repeat(64);
const full = {x: 0, y: 0, width: 1, height: 1};
const primarySplit = {x: 0, y: 0, width: 0.64, height: 1};
const secondarySplit = {x: 0.68, y: 0.06, width: 0.29, height: 0.82};
const pip = {x: 0.72, y: 0.08, width: 0.23, height: 0.22};
const blockRegion = {x: 0.1, y: 0.16, width: 0.7, height: 0.12};
const lineRegion = {x: 0.12, y: 0.52, width: 0.72, height: 0.04};
const canvas = {width: 1920, height: 1080};
const media = (sourceId, outputRect, sourceStartMs, sourceTimePolicy = "CONTINUE") => ({sourceId, sourceCrop: full, outputRect, sourceStartMs, sourceTimePolicy});
const projection = () => ({sourceId: "primary"});

const fixtures = [
  ["heldout-product-document", "product-tutorial", "1", "2"],
  ["heldout-product-settings", "product-tutorial", "3", "4"],
  ["heldout-evidence-report", "evidence-explainer", "5", "6"],
  ["heldout-evidence-study", "evidence-explainer", "7", "8"],
  ["heldout-opinion-quote", "personal-opinion", "9", "a"],
  ["heldout-opinion-timeline", "personal-opinion", "b", "c"],
];

function sources(genre, primaryCharacter, secondaryCharacter) {
  const primary = {id: "primary", sha256: sha(primaryCharacter), kind: genre === "product-tutorial" ? "CAP_EXPORT" : "PRESENTER", safeCrop: full, minimumReadablePx: {width: 320, height: 180}, telemetryEligible: genre === "product-tutorial"};
  if (primary.kind === "CAP_EXPORT") Object.assign(primary, {capReceiptSha256: sha("d"), interactionTimelineSha256: sha("e"), behaviorManifestSha256: sha("f")});
  return [primary, {id: "evidence", sha256: sha(secondaryCharacter), kind: "DOCUMENT", safeCrop: full, minimumReadablePx: {width: 160, height: 90}, telemetryEligible: false}];
}

const compileFixture = ([id, genre, primaryCharacter, secondaryCharacter]) => {
  const sourceBindings = sources(genre, primaryCharacter, secondaryCharacter);
  const token = `${genre}-primary-continuity`;
  const plan = assertPostProductionReframePlan(compilePostProductionReframePlan({
    shotId: id, genre, durationMs: 5200, canvas, sourceBindings,
    persistentAnchor: {id: "primary-anchor", sourceSha256: sourceBindings[0].sha256, sourceRegion: {x: 0.2, y: 0.2, width: 0.22, height: 0.34}, minimumVisiblePixels: 50000},
    protectedOutputRegions: [{id: "subtitle", rect: {x: 0, y: 0.92, width: 1, height: 0.08}}],
    returnTarget: {stateId: "primary", continuityToken: token, sourceTimePolicy: "CONTINUE", sourceTimeTransform: {mode: "CONTINUOUS", toleranceMs: 50}},
    states: [
      {id: "primary", mode: "PRIMARY_MEDIA", startMs: 0, endMs: 1000, continuityToken: token, primary: media("primary", full, 0), anchorProjection: projection()},
      {id: "split", mode: "SPLIT_EXPLAIN", startMs: 1000, endMs: 2800, continuityToken: token, motivation: "EVIDENCE_ENTERS", primary: media("primary", primarySplit, 1000), secondary: media("evidence", secondarySplit, 0, "FREEZE"), anchorProjection: projection()},
      {id: "pip", mode: "PIP_CONTEXT", startMs: 2800, endMs: 4000, continuityToken: token, motivation: "CONTEXT_STAYS_VISIBLE", primary: media("primary", full, 2800), secondary: media("evidence", pip, 0, "FREEZE"), anchorProjection: projection()},
      {id: "return", mode: "RETURN_PRIMARY", startMs: 4000, endMs: 5200, continuityToken: token, motivation: "RETURN_TO_PRIMARY", primary: media("primary", full, 4000), anchorProjection: projection()},
    ],
  }));
  const narrationCues = [{id: "claim-cue", sha256: sha("d"), startMs: 900, endMs: 2100}, {id: "result-cue", sha256: sha("e"), startMs: 2100, endMs: 3300}];
  const track = assertPersistentEvidenceFocusTrack(compilePersistentEvidenceFocusTrack({
    shotId: `${id}-focus`, genre, durationMs: 4200,
    document: {sourceSha256: sourceBindings[1].sha256, regions: [{id: "claim", kind: "BLOCK", rect: blockRegion, readingUnits: 12}, {id: "result", kind: "LINE", rect: lineRegion, readingUnits: 10}]},
    narrationCues,
    cues: [
      {id: "establish", phase: "ESTABLISH", startMs: 0, endMs: 900},
      {id: "claim", phase: "FOCUS", startMs: 900, endMs: 2100, regionId: "claim", narrationCueId: "claim-cue", narrationCueSha256: sha("d")},
      {id: "result", phase: "MIGRATE", startMs: 2100, endMs: 3300, regionId: "result", narrationCueId: "result-cue", narrationCueSha256: sha("e")},
      {id: "restore", phase: "RESTORE", startMs: 3300, endMs: 4200},
    ],
  }));
  return {id, genre, plan, track};
};

const results = fixtures.map(compileFixture);
assert.equal(results.length, 6);
assert.equal(new Set(results.map((result) => result.genre)).size, 3);
assert.ok(results.every(({plan}) => plan.version === "1.2" && plan.returnProof.identityPreserved && plan.diagnostics.anchorProjectionVerified));
assert.ok(results.every(({track}) => track.version === "1.2" && track.events.at(-1).phase === "RESTORE" && track.events[2].visualMode === "SOURCE_BOUND_LINE_HIGHLIGHT"));

const base = compileFixture(fixtures[0]);
const baseInput = {shotId: "negative", genre: "product-tutorial", durationMs: 2000, canvas, protectedOutputRegions: [], returnTarget: {stateId: "primary", continuityToken: "token", sourceTimePolicy: "CONTINUE", sourceTimeTransform: {mode: "CONTINUOUS", toleranceMs: 50}}};
const badCap = compilePostProductionReframePlan({...baseInput, sourceBindings: [{id: "primary", sha256: sha("1"), kind: "CAP_EXPORT", safeCrop: full, minimumReadablePx: {width: 100, height: 100}, telemetryEligible: true}], persistentAnchor: {id: "a", sourceSha256: sha("1"), sourceRegion: {x: 0.2, y: 0.2, width: 0.2, height: 0.2}, minimumVisiblePixels: 100}, states: []});
assert.ok(badCap.failures.some((failure) => failure.startsWith("CAP_THREE_RECEIPTS_REQUIRED")));
const missingAnchorProjection = structuredClone(base.plan);
const rawMissingAnchor = compilePostProductionReframePlan({shotId: "missing-anchor", genre: base.genre, durationMs: base.plan.durationMs, canvas, sourceBindings: base.plan.sourceBindings, persistentAnchor: base.plan.persistentAnchor, protectedOutputRegions: base.plan.protectedOutputRegions, returnTarget: base.plan.returnTarget, states: base.plan.stateSnapshots.map((state, index) => ({...state, motivation: index ? base.plan.transitions[index - 1].motivation : undefined, anchorProjection: index === 1 ? null : state.anchorProjection}))});
assert.ok(rawMissingAnchor.failures.some((failure) => failure.startsWith("PERSISTENT_ANCHOR_PROJECTION_REQUIRED")));
const missingMotivationStates = base.plan.stateSnapshots.map((state, index) => ({...state, motivation: index === 1 ? "" : index ? base.plan.transitions[index - 1].motivation : undefined}));
const missingMotivation = compilePostProductionReframePlan({shotId: "missing-motivation", genre: base.genre, durationMs: base.plan.durationMs, canvas, sourceBindings: base.plan.sourceBindings, persistentAnchor: base.plan.persistentAnchor, protectedOutputRegions: base.plan.protectedOutputRegions, returnTarget: base.plan.returnTarget, states: missingMotivationStates});
assert.ok(missingMotivation.failures.some((failure) => failure.startsWith("TRANSITION_MOTIVATION_REQUIRED")));
const timeJumpStates = base.plan.stateSnapshots.map((state, index) => ({...state, motivation: index ? base.plan.transitions[index - 1].motivation : undefined, anchorProjection: {sourceId: state.anchorProjection.sourceId}, primary: index === base.plan.stateSnapshots.length - 1 ? {...state.primary, sourceStartMs: 99999} : state.primary}));
const timeJump = compilePostProductionReframePlan({shotId: "time-jump", genre: base.genre, durationMs: base.plan.durationMs, canvas, sourceBindings: base.plan.sourceBindings, persistentAnchor: base.plan.persistentAnchor, protectedOutputRegions: base.plan.protectedOutputRegions, returnTarget: base.plan.returnTarget, states: timeJumpStates});
assert.ok(timeJump.failures.includes("RETURN_SOURCE_TIME_DISCONTINUITY"));

const narration = [{id: "n1", sha256: sha("1"), startMs: 500, endMs: 1200}, {id: "n2", sha256: sha("2"), startMs: 1200, endMs: 1900}];
const document = {sourceSha256: sha("3"), regions: [{id: "a", kind: "LINE", rect: lineRegion, readingUnits: 1}, {id: "b", kind: "BLOCK", rect: blockRegion, readingUnits: 1}]};
const reordered = compilePersistentEvidenceFocusTrack({shotId: "reordered", genre: "evidence", durationMs: 2400, document, narrationCues: narration, cues: [{id: "e", phase: "ESTABLISH", startMs: 0, endMs: 500}, {id: "m", phase: "MIGRATE", startMs: 500, endMs: 1200, regionId: "a", narrationCueId: "n1", narrationCueSha256: sha("1")}, {id: "f", phase: "FOCUS", startMs: 1200, endMs: 1900, regionId: "b", narrationCueId: "n2", narrationCueSha256: sha("2")}, {id: "r", phase: "RESTORE", startMs: 1900, endMs: 2400}]});
assert.ok(reordered.failures.some((failure) => failure.startsWith("FOCUS_PHASE_ORDER_INVALID")));
const oneMs = compilePersistentEvidenceFocusTrack({shotId: "one-ms", genre: "evidence", durationMs: 1800, document, narrationCues: [narration[0]], cues: [{id: "e", phase: "ESTABLISH", startMs: 0, endMs: 1}, {id: "f", phase: "FOCUS", startMs: 1, endMs: 1799, regionId: "a", narrationCueId: "n1", narrationCueSha256: sha("1")}, {id: "r", phase: "RESTORE", startMs: 1799, endMs: 1800}]});
assert.ok(oneMs.failures.filter((failure) => failure.startsWith("FOCUS_BOOKEND_TOO_SHORT")).length === 2);
const thinLine = compilePersistentEvidenceFocusTrack({shotId: "thin-line", genre: "evidence", durationMs: 2000, document: {sourceSha256: sha("4"), regions: [{id: "line", kind: "LINE", rect: {x: 0.1, y: 0.4, width: 0.7, height: 0.03}, readingUnits: 4}]}, narrationCues: [narration[0]], cues: [{id: "e", phase: "ESTABLISH", startMs: 0, endMs: 500}, {id: "f", phase: "FOCUS", startMs: 500, endMs: 1500, regionId: "line", narrationCueId: "n1", narrationCueSha256: sha("1")}, {id: "r", phase: "RESTORE", startMs: 1500, endMs: 2000}]});
assert.equal(thinLine.status, "PASS_REVIEW_ONLY");
assert.equal(thinLine.events[1].visualMode, "SOURCE_BOUND_LINE_HIGHLIGHT");
const wrongNarrationTime = compilePersistentEvidenceFocusTrack({shotId: "wrong-narration-time", genre: "evidence", durationMs: 2400, document, narrationCues: [{id: "n1", sha256: sha("1"), startMs: 1600, endMs: 1900}], cues: [{id: "e", phase: "ESTABLISH", startMs: 0, endMs: 500}, {id: "f", phase: "FOCUS", startMs: 500, endMs: 1200, regionId: "a", narrationCueId: "n1", narrationCueSha256: sha("1")}, {id: "r", phase: "RESTORE", startMs: 1200, endMs: 2400}]});
assert.ok(wrongNarrationTime.failures.includes("NARRATION_CUE_TIMING_MISMATCH:f"));

console.log(JSON.stringify({contract: "A1PostProductionReframePlanTest/v1", status: "PASS", fixtures: results.map(({id, genre, plan, track}) => ({id, genre, planSha256: plan.planSha256, trackSha256: track.trackSha256, status: "PASS"})), counterexampleReversals: {capThreeReceipts: true, computedVisibleAnchorProjection: true, motivationRequired: true, focusOrderRequired: true, readableBookends: true, thinLineSupported: true, narrationTimeBound: true, continuousSourceTimeBound: true}, gates: {reversibleReturn: true, sourceCropOutputRectSeparated: true, narrationCueBound: true, cleanSourceFallback: true, productionAdmission: false}}, null, 2));
