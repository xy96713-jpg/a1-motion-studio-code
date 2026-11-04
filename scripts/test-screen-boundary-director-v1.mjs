import assert from "node:assert/strict";
import {compileScreenBoundaryPlan} from "../apps/studio-next/src/lib/a1-screen-boundary-director-v1.mjs";

const fixtures = [
  {genre: "EDITOR_TUTORIAL", delta: .12, expected: "HARD_MATCH_CUT", modulePivot: false},
  {genre: "ANALYTICS_WALKTHROUGH", delta: .38, expected: "SHORT_CONTINUITY_DISSOLVE", modulePivot: false},
  {genre: "MULTI_MODULE_PRODUCT_DEMO", delta: .84, expected: "STABLE_RESET_DISSOLVE", modulePivot: true},
];
for (const fixture of fixtures) {
  const shots = [{shotId: "A", surfaceId: "surface", actionContract: {handoff: "B_NEXT"}}, {shotId: "B", surfaceId: "surface", semanticKey: "B_NEXT"}];
  const plan = compileScreenBoundaryPlan({shots, visualDeltas: [fixture.delta], modulePivotIndexes: fixture.modulePivot ? [0] : []});
  assert.equal(plan.boundaries[0].transitionKind, fixture.expected, fixture.genre);
  assert.equal(plan.boundaries[0].productionAdmission, false);
  assert.equal(plan.policy.maximumOverlapMs, 220);
}
const sequence = compileScreenBoundaryPlan({shots: Array.from({length: 6}, (_, index) => ({shotId: `S${index}`, surfaceId: "same"})), visualDeltas: [.1, .2, .3, .15, .8], modulePivotIndexes: [4]});
assert.equal(sequence.policy.mostChangesRemainHardCuts, true);
assert.equal(sequence.summary.hardMatchCutCount, 3);
const structureChange = compileScreenBoundaryPlan({shots: [{shotId: "EDIT", surfaceId: "same"}, {shotId: "PRESENT", surfaceId: "same"}], visualDeltas: [.08], structureChangeIndexes: [0]});
assert.equal(structureChange.boundaries[0].transitionKind, "STABLE_RESET_DISSOLVE");
assert.equal(structureChange.boundaries[0].structureChange, true);
console.log(JSON.stringify({status: "PASS", contract: sequence.contract, fixtureGenres: fixtures.map((item) => item.genre), sequenceSummary: sequence.summary}, null, 2));
