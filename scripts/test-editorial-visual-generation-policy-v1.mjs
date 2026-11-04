#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  A1_EDITORIAL_VISUAL_GENERATION_POLICY,
  A1_CREATIVE_ASSET_STYLE_POLICY,
  A1_REVIEW_PREVIEW_POLICY,
  A1_GENERATED_VISUAL_SURFACE_POLICY,
  auditGeneratedVisualSurfaceGraph,
  auditSceneGraphAgainstEditorialVisualPolicy,
  assertCreativeAssetStylePolicy,
  editorialVisualGenerationPromptClause,
  motionPolicyProhibitedFallbacks,
  visualPolicySnapshot,
} from "../apps/studio-next/src/lib/a1-editorial-visual-generation-policy-v1.mjs";
import {buildPixelEditorialTypographyAssignment} from "../apps/studio-next/src/lib/a1-pixel-editorial-typography-policy-v1.mjs";

const shot = {
  shotId: "ED-POLICY-01",
  order: 1,
  editMode: "presenter-overlay",
  typographyRole: "opening-identity",
  visualJob: "建立作者身份",
  sourceText: "Hi，我用 vibe coding 做了一款智能写作工作台。",
  keyPhrases: ["vibe coding", "智能写作工作台"],
  presenterPackage: {intensity: "hero"},
};
shot.typographyAssignment = buildPixelEditorialTypographyAssignment({shot, headlineText: "vibe coding\n智能写作工作台"});

const goodSceneGraph = {
  shotId: shot.shotId,
  editMode: shot.editMode,
  primaryMaterialId: "source-presenter-continuous-video",
  visualPolicy: visualPolicySnapshot(),
  typography: {assignment: shot.typographyAssignment},
  safeZones: {face: {x: .33, y: .1, width: .34, height: .52}},
  nodes: [
    {id: "primary", type: "asset-reference", assetId: "source-presenter-continuous-video", role: "presenter", geometry: {x: 0, y: 0, width: 1, height: 1}},
    {id: "presenter-word-1", type: "editable-text", text: "vibe coding", fontAssetId: "type-pixel-correction", fontSize: 64, objectBinding: "real-footage-negative-space:left-type-cluster", groupId: "presenter-type-cluster-1", surfaceTreatment: "acid-strip", role: "presenter-semantic-phrase-lead", geometry: {x: .04, y: .68, width: .28, height: .16}},
    {id: "presenter-word-2", type: "editable-text", text: "智能写作工作台", fontAssetId: "type-editorial-heavy", fontSize: 96, objectBinding: "real-footage-negative-space:right-type-cluster", groupId: "presenter-type-cluster-1", surfaceTreatment: "none", role: "presenter-semantic-phrase-resolve", geometry: {x: .67, y: .68, width: .29, height: .18}},
  ],
};

const goodAudit = auditSceneGraphAgainstEditorialVisualPolicy({shot, sceneGraph: goodSceneGraph});
assert.equal(goodAudit.status, "PASS");

const badSceneGraph = structuredClone(goodSceneGraph);
badSceneGraph.nodes[1].role = "floating-hud-label";
badSceneGraph.nodes[1].fontAssetId = null;
badSceneGraph.nodes[1].objectBinding = null;
badSceneGraph.nodes[1].groupId = null;
badSceneGraph.nodes[1].geometry = {x: .4, y: .18, width: .2, height: .15};
const badAudit = auditSceneGraphAgainstEditorialVisualPolicy({shot, sceneGraph: badSceneGraph});
assert.equal(badAudit.status, "BLOCK");
assert.ok(badAudit.failures.some((failure) => failure.startsWith("default-system-font-fallback")));
assert.ok(badAudit.failures.some((failure) => failure.startsWith("footage-type-not-object-bound")));
assert.ok(badAudit.failures.some((failure) => failure.startsWith("presenter-face-occlusion")));
assert.ok(badAudit.failures.some((failure) => failure.startsWith("forbidden-composition-primitive")));
assert.ok(badAudit.failures.some((failure) => failure.startsWith("presenter-type-cluster-binding-missing")));

const screenShot = {
  shotId: "ED-POLICY-SCREEN",
  editMode: "screen-demo",
  typographyAssignment: buildPixelEditorialTypographyAssignment({shot: {...shot, shotId: "ED-POLICY-SCREEN", editMode: "screen-demo"}, headlineText: ""}),
};
const screenSceneGraph = {
  shotId: screenShot.shotId,
  editMode: "screen-demo",
  primaryMaterialId: "source-documentary-selection-action",
  visualPolicy: visualPolicySnapshot(),
  typography: {assignment: screenShot.typographyAssignment},
  sourceEvidence: {realCausalRecording: true},
  nodes: [
    {id: "primary", type: "source-bound-operation-stage", assetId: "source-documentary-selection-action", geometry: {x: 0, y: 0, width: 1, height: 1}},
    {id: "screen-action-word", type: "editable-text", text: "划一下", fontAssetId: "type-pixel-correction", fontSize: 52, typeTreatment: "screen-causal-word", objectBinding: "real-screen-region:selected", sourceRegion: {x: .2, y: .35, width: .5, height: .12}, sourceAnchor: {x: .45, y: .41}, geometry: {x: .72, y: .34, width: .21, height: .082}},
    {id: "screen-action-caption", type: "editable-text", text: "SELECT → REWRITE", fontAssetId: "type-pixel-correction", fontSize: 18, typeTreatment: "screen-causal-caption", objectBinding: "real-screen-region:selected", sourceRegion: {x: .2, y: .35, width: .5, height: .12}, sourceAnchor: {x: .45, y: .41}, geometry: {x: .72, y: .425, width: .21, height: .032}},
  ],
};
assert.equal(auditSceneGraphAgainstEditorialVisualPolicy({shot: screenShot, sceneGraph: screenSceneGraph}).status, "PASS");
const badScreenSceneGraph = structuredClone(screenSceneGraph);
badScreenSceneGraph.nodes[1].fontSize = 108;
badScreenSceneGraph.nodes[1].geometry = {x: .03, y: .08, width: .34, height: .18};
delete badScreenSceneGraph.nodes[1].sourceRegion;
const badScreenAudit = auditSceneGraphAgainstEditorialVisualPolicy({shot: screenShot, sceneGraph: badScreenSceneGraph});
assert.equal(badScreenAudit.status, "BLOCK");
assert.ok(badScreenAudit.failures.some((failure) => failure.startsWith("screen-overlay-source-anchor-missing")));
assert.ok(badScreenAudit.failures.some((failure) => failure.startsWith("screen-overlay-scale-not-object-label")));
assert.ok(badScreenAudit.failures.some((failure) => failure.startsWith("screen-overlay-becomes-floating-logo")));

const promptClause = editorialVisualGenerationPromptClause({route: "editorial-artwork"});
for (const marker of ["pixel", "fake UI", "floating logo cards", "generic bottom strips", "default system fonts", "fully visible", "paired bilingual hierarchy", "bind every label, line and arrow", "never draw renderer-authored CSS/SVG lines", "title takeover", "focus depth plus causal action", "one memorable semantic object", "three consecutive text-primary shots"]) assert.ok(promptClause.includes(marker));
for (const marker of ["photorealistic", "cinematic realism", "product photography", "stock photography", "real people, real UI, real screenshots"]) assert.ok(promptClause.includes(marker));
assert.equal(A1_CREATIVE_ASSET_STYLE_POLICY.status, "ABSOLUTE_USER_LOCK");
assert.doesNotThrow(() => assertCreativeAssetStylePolicy({mode: "flat-editorial", prompt: "flat editorial print collage; never photorealistic"}));
assert.throws(() => assertCreativeAssetStylePolicy({mode: "photorealistic", prompt: "generate a surface"}), /creative-asset-style-blocked/);
assert.throws(() => assertCreativeAssetStylePolicy({mode: "flat-editorial", prompt: "generate a photorealistic desk scene"}), /creative-asset-style-directive-blocked/);
for (const fallback of ["opacity-only", "uniform-scale-only", "uniform-index-stagger", "generic-clip-translate-reveal"]) assert.ok(motionPolicyProhibitedFallbacks().includes(fallback));
assert.equal(A1_EDITORIAL_VISUAL_GENERATION_POLICY.typography.signatureFontAssetId, "type-pixel-correction");
assert.equal(A1_EDITORIAL_VISUAL_GENERATION_POLICY.required.titleTakeoverMustHaveAuthoredHierarchyAndSemanticActor, true);
assert.equal(A1_EDITORIAL_VISUAL_GENERATION_POLICY.required.screenOperationMustUseVerifiedEvidenceAsPrimaryActor, true);
assert.equal(A1_EDITORIAL_VISUAL_GENERATION_POLICY.required.minimalExplainerMustUseOneMemorableSemanticObject, true);
assert.ok(A1_EDITORIAL_VISUAL_GENERATION_POLICY.forbidden.composition.includes("dense-full-frame-maze-as-explanation"));
assert.ok(A1_EDITORIAL_VISUAL_GENERATION_POLICY.forbidden.sequence.includes("three-consecutive-text-primary-shots"));
assert.equal(A1_REVIEW_PREVIEW_POLICY.typographyVisibility, "fully-visible-front-layer");
assert.equal(A1_REVIEW_PREVIEW_POLICY.clippingAllowed, false);
assert.equal(A1_REVIEW_PREVIEW_POLICY.occlusionSimulationAllowed, false);
assert.equal(A1_REVIEW_PREVIEW_POLICY.mixedCjkLatinLayout, "paired-bilingual-cluster");
assert.equal(A1_GENERATED_VISUAL_SURFACE_POLICY.status, "ABSOLUTE_USER_LOCK");
assert.equal(auditGeneratedVisualSurfaceGraph({enabled: true, nodes: [
  {id: "generated-visual-layer", type: "asset-reference", role: "generated-visual-layer"},
  {id: "word-actor-1", type: "editable-text", text: "完成", role: "treatment-anchor-word"},
]}).status, "PASS");
const generatedDecorationAudit = auditGeneratedVisualSurfaceGraph({enabled: true, nodes: [
  {id: "generated-visual-layer", type: "asset-reference", role: "generated-visual-layer"},
  {id: "fake-line", type: "editorial-correction-mark", objectAnchor: "generated-visual-layer", pathKind: "reading-branch-blue"},
]});
assert.equal(generatedDecorationAudit.status, "BLOCK");
assert.ok(generatedDecorationAudit.failures.some((failure) => failure.startsWith("generated-surface-forbidden-node-type")));
assert.ok(generatedDecorationAudit.failures.some((failure) => failure.startsWith("generated-surface-css-svg-decoration-forbidden")));
const generatedSceneGraph = structuredClone(goodSceneGraph);
generatedSceneGraph.generatedVisualSurface = true;
generatedSceneGraph.nodes.push({id: "generated-line", type: "editorial-correction-mark", objectAnchor: "generated-visual-layer", pathKind: "reading-branch-blue"});
const generatedSceneAudit = auditSceneGraphAgainstEditorialVisualPolicy({shot, sceneGraph: generatedSceneGraph});
assert.equal(generatedSceneAudit.status, "BLOCK");
assert.ok(generatedSceneAudit.failures.some((failure) => failure.startsWith("generated-surface-forbidden-node-type")));

console.log(JSON.stringify({status: "PASS", policyContract: A1_EDITORIAL_VISUAL_GENERATION_POLICY.contract, policySha256: A1_EDITORIAL_VISUAL_GENERATION_POLICY.sha256, goodAudit, blockedFailures: badAudit.failures}, null, 2));
