#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  resolveShotFamilyCompositorSpec,
  resolveTreatmentCompositorSpec,
  resolveTreatmentMaterialRouting,
  validateShotFamilyCompositorGraph,
  validateTreatmentCompositorGraph,
} from "../apps/studio-next/src/lib/a1-treatment-compositor-contract-v1.mjs";

const plan = (orientation = "left-origin", archetypeId = "human-negative-space") => ({
  contract: "A1VisualCompositionSystem/v1",
  archetypeId,
  orientation,
  planSha256: `${archetypeId}-${orientation}`,
});

const presenterRightSupport = resolveShotFamilyCompositorSpec({brief: {shotId: "ED-01", shotFamily: "presenter-packaging", productionBindingAllowed: true, compositionPlan: plan("left-origin")}});
assert.equal(presenterRightSupport.contract, "A1ShotFamilyCompositor/v1");
assert.deepEqual(presenterRightSupport.generatedGeometry, {x: .54, y: 0, width: .46, height: 1});
assert.deepEqual(presenterRightSupport.primaryGeometry, {x: 0, y: 0, width: .7, height: 1});

const presenterLeftSupport = resolveShotFamilyCompositorSpec({brief: {shotId: "ED-18", shotFamily: "presenter-packaging", productionBindingAllowed: true, compositionPlan: plan("right-origin", "field-interruption")}});
assert.deepEqual(presenterLeftSupport.generatedGeometry, {x: 0, y: 0, width: .46, height: 1});
assert.deepEqual(presenterLeftSupport.primaryGeometry, {x: .3, y: 0, width: .7, height: 1});

const conceptual = resolveShotFamilyCompositorSpec({brief: {shotId: "ED-12", shotFamily: "conceptual-editorial", productionBindingAllowed: true, compositionPlan: plan("right-origin", "object-pressure")}});
assert.equal(conceptual.primitive, "object-pressure");
assert.equal(conceptual.generatedZ, 12, "conceptual generated surface must replace the generic primary plate");
const conceptualValidation = validateShotFamilyCompositorGraph({
  spec: conceptual,
  nodes: [{id: "generated-visual-layer", type: "asset-reference", geometry: {x: 0, y: 0, width: 1, height: 1}, z: 12}],
});
assert.equal(conceptualValidation.valid, true);

const typography = resolveShotFamilyCompositorSpec({brief: {shotId: "ED-10", shotFamily: "typography-actor", productionBindingAllowed: true, compositionPlan: plan("center-or-axis-led", "typographic-monument")}});
const missingEditableShadow = validateShotFamilyCompositorGraph({
  spec: typography,
  nodes: [{id: "generated-visual-layer", type: "asset-reference", geometry: {x: 0, y: 0, width: 1, height: 1}, z: 12}],
});
assert.equal(missingEditableShadow.valid, false);
assert.ok(missingEditableShadow.issues.includes("editable-text-shadow-missing"));

const sourceOnly = resolveShotFamilyCompositorSpec({brief: {shotId: "ED-02", shotFamily: "recording-replaceable", productionBindingAllowed: false, compositionPlan: plan("right-origin", "evidence-detail-macro")}});
assert.equal(sourceOnly.generatedSurfaceAllowed, false);
const fakeScreen = validateShotFamilyCompositorGraph({spec: sourceOnly, nodes: [{id: "generated-visual-layer"}]});
assert.ok(fakeScreen.issues.includes("generated-surface-forbidden-for-source-family"));

const pixel = resolveTreatmentCompositorSpec({treatmentId: "newtro-pixel-pop", shotId: "ED-09"});
assert.equal(pixel.contract, "A1TreatmentCompositor/v1");
assert.equal(pixel.primitive, "field-interruption");
assert.deepEqual(pixel.requiredActionActors, ["generated-visual-layer", "semantic-bridge"]);

const flatField = resolveTreatmentCompositorSpec({treatmentId: "flat-editorial-evidence", shotId: "ED-09"});
assert.equal(flatField.primitive, "field-interruption");
assert.deepEqual(flatField.requiredActionActors, ["generated-visual-layer"]);
assert.equal(flatField.generatedSurfaceConstraint.purpose, "exclude-unverified-raster-text");

const materialRouting = resolveTreatmentMaterialRouting({
  candidate: {raw: {publicUrl: "/candidate.png", sha256: "candidate-sha"}},
  typographyReference: {publicUrl: "/reference.png", sha256: "reference-sha", referenceOnly: true, rasterReferenceFinal: false},
});
assert.equal(materialRouting.renderedMaterial.publicUrl, "/candidate.png");
assert.equal(materialRouting.typographyReference.publicUrl, "/reference.png");
assert.equal(materialRouting.typographyReference.rendererBindingAllowed, false);
assert.equal(materialRouting.typographyReferenceRendered, false);
assert.throws(() => resolveTreatmentMaterialRouting({
  candidate: {raw: {publicUrl: "/candidate.png", sha256: "candidate-sha"}},
  typographyReference: {publicUrl: "/reference.png", sha256: "reference-sha", referenceOnly: false, rasterReferenceFinal: true},
}), /treatment-typography-reference-boundary-invalid/u);

const monument = resolveTreatmentCompositorSpec({treatmentId: "flat-editorial-evidence", shotId: "ED-10"});
const valid = validateTreatmentCompositorGraph({
  spec: monument,
  nodes: [{id: "word-actor-1", type: "editable-text"}, {id: "word-actor-2", type: "editable-text", surfaceTreatment: "verdict-red-ring"}, {id: "generated-visual-layer", type: "asset-reference"}],
  motionPhrase: {contract: "A1TreatmentAnchorMotionPhrase/v1", beats: monument.motionBeats},
});
assert.equal(valid.valid, true);

const invalid = validateTreatmentCompositorGraph({
  spec: monument,
  nodes: [{id: "word-actor-1"}],
  motionPhrase: {contract: "A1TreatmentAnchorMotionPhrase/v1", beats: ["order"]},
});
assert.equal(invalid.valid, false);
assert.ok(invalid.issues.includes("missing-word-actor:word-actor-2"));
assert.ok(invalid.issues.includes("missing-action-actor:generated-visual-layer"));
assert.ok(invalid.issues.includes("motion-beat-not-expressed:extract"));
assert.ok(invalid.issues.includes("required-surface-treatment-missing:word-actor-2:verdict-red-ring"));

const fieldValid = validateTreatmentCompositorGraph({
  spec: flatField,
  nodes: [
    {id: "word-actor-1", type: "editable-text"},
    {id: "word-actor-2", type: "editable-text", surfaceTreatment: "vermillion-proof-underline"},
    {id: "generated-visual-layer", type: "asset-reference", focalPoint: "90% 52%", mediaScale: 2.8},
  ],
  motionPhrase: {contract: "A1TreatmentAnchorMotionPhrase/v1", beats: flatField.motionBeats},
});
assert.equal(fieldValid.valid, true);

const staleDrawnGraph = validateTreatmentCompositorGraph({
  spec: monument,
  nodes: [
    {id: "word-actor-1"},
    {id: "word-actor-2"},
    {id: "generated-visual-layer"},
    {id: "old-svg-line", type: "editorial-correction-mark", objectAnchor: "generated-visual-layer", pathKind: "reading-branch-blue"},
  ],
  motionPhrase: {contract: "A1TreatmentAnchorMotionPhrase/v1", beats: monument.motionBeats},
});
assert.equal(staleDrawnGraph.valid, false);
assert.ok(staleDrawnGraph.issues.includes("generated-surface-forbidden-node-type:old-svg-line"));
console.log("A1TreatmentCompositor/v1 PASS");
