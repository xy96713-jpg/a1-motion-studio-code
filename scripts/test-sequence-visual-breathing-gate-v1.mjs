#!/usr/bin/env node
import assert from "node:assert/strict";
import {evaluateSequenceVisualBreathingGate, A1_SEQUENCE_VISUAL_BREATHING_SUPPRESSION_REASON} from "../apps/studio-next/src/lib/a1-sequence-visual-breathing-gate-v1.mjs";

const result = evaluateSequenceVisualBreathingGate({
  previous: {shotId: "ED-12", finalPackageDecision: "PACKAGE", informationOwner: {kind: "GENERATED_PACKAGING"}},
  current: {shotId: "ED-13", finalPackageDecision: "PACKAGE", finalPackageMode: "OVERLAY", baseVisualCarrier: "PRESENTER_BASE", rhythmRole: "TURN", typographyTreatment: "CONTRAST_OVERLAY"},
  next: {shotId: "ED-14", finalPackageDecision: "PACKAGE", informationOwner: {kind: "REAL_SOURCE"}},
});
assert.equal(result.status, "SUPPRESS_PACKAGE");
assert.equal(result.reason, A1_SEQUENCE_VISUAL_BREATHING_SUPPRESSION_REASON);
const keep = evaluateSequenceVisualBreathingGate({
  previous: {shotId: "ED-12", finalPackageDecision: "PACKAGE", informationOwner: {kind: "GENERATED_PACKAGING"}},
  current: {shotId: "ED-13", finalPackageDecision: "PACKAGE", finalPackageMode: "OVERLAY", baseVisualCarrier: "PRESENTER_BASE", rhythmRole: "TURN", typographyTreatment: "CONTRAST_OVERLAY"},
  next: {shotId: "ED-14", finalPackageDecision: "NO_PACKAGE", informationOwner: {kind: "PRESENTER_BASE"}},
});
assert.equal(keep.status, "KEEP_PACKAGE");
console.log(JSON.stringify({status: "PASS", presenterTurnBetweenEvidenceSuppressed: true, isolatedPresenterPackagePreserved: true}, null, 2));

