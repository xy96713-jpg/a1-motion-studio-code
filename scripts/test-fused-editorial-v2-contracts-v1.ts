#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {fusedEditorialV2VisualMaster, A1VisualMasterProfileV2Schema} from "../apps/studio-next/src/lib/a1-visual-master-profile-v2.ts";
import {fusedEditorialV2Anchors} from "../apps/studio-next/src/lib/fused-editorial-v2-anchor-data.ts";
import {A1LayeredShotDesignV2Schema, adaptFourLayerCompositionToLayeredShotDesignV2} from "../apps/studio-next/src/lib/a1-layered-shot-design-v2.ts";
import {buildFourLayerComposition} from "../apps/studio-next/src/lib/a1-four-layer-composition.ts";
import {A1DesignBoardManifestV1Schema, affectedShotIdsForDesignChange, canUnlockMotion} from "../apps/studio-next/src/lib/a1-design-board-manifest-v1.ts";
import {assertMotionMayBeBuilt, selectRepresentativeShotIds} from "../apps/studio-next/src/lib/a1-motion-plan-v2.ts";
import {A1MaskBenchmarkFixtureManifestSchema, selectBiRefNetVariant} from "../apps/studio-next/src/lib/a1-mask-asset-v1.ts";
import {A1SystemMaturityManifestV1Schema, buildPendingFusedEditorialV2MaturityManifest} from "../apps/studio-next/src/lib/a1-system-maturity-v1.ts";

const hash = "a".repeat(64);
const still = {publicUrl: "/fixture.png", sha256: hash, width: 960, height: 540};

assert.equal(A1VisualMasterProfileV2Schema.parse(fusedEditorialV2VisualMaster).sceneFamilies.length, 8);
assert.deepEqual(fusedEditorialV2VisualMaster.typography.bakedTitlePolicy.allowedRoles, ["film-title", "section-opener", "finale"]);
assert.equal(fusedEditorialV2VisualMaster.generation.maxConcurrency, 2);
assert.equal(fusedEditorialV2Anchors.length, 3);

for (const anchor of fusedEditorialV2Anchors) {
  const design = A1LayeredShotDesignV2Schema.parse(anchor.design);
  assert.deepEqual(Object.keys(design.layers), ["background", "material", "foreground", "semanticElements", "typography", "finish"]);
  assert.equal(design.review.humanVisualApprovalRequired, true);
  assert.equal(design.layers.typography.source, "editable-text");
  if (design.layers.material.source !== "none") assert.ok(design.treatment.cropAlternatives.length >= 3);
}

const disallowedBaked = structuredClone(fusedEditorialV2Anchors[1].design);
disallowedBaked.layers.typography.bakedTitle = {enabled: true, assetUri: "/baked.png", ocrStatus: "pending", humanCharacterReview: "pending", editableTruth: "完成度很高"};
assert.equal(A1LayeredShotDesignV2Schema.safeParse(disallowedBaked).success, false, "ordinary headline must not be baked");

const oldComposition = buildFourLayerComposition({shotId: "legacy-01", visualMasterId: "a1-editorial-annotation-blue-v1", visualFamily: "narrative-editorial", role: "claim", relationFrom: "opening", functionName: "claim", templateId: "text-highlight", materialMode: "none", illustrationMode: "none", headline: "旧四层合同仍能只读适配", index: 0});
const adapted = adaptFourLayerCompositionToLayeredShotDesignV2({composition: oldComposition, shotId: "legacy-01", order: 1, headline: "旧四层合同仍能只读适配", task: "兼容历史项目"});
assert.equal(adapted.contract, "A1LayeredShotDesign/v2");
assert.equal(adapted.layers.material.source, "none");
assert.ok(adapted.layers.material.emptyReason);

const anchorBoard = A1DesignBoardManifestV1Schema.parse({
  contract: "A1DesignBoardManifest/v1", projectId: "fixture", visualMasterId: "fused-editorial-v2", visualMasterSha256: hash, sourceHash: hash, phase: "anchor-review", currentAuthorityMutated: false, reviewOnly: true, fullBoardGenerationAllowed: false, motionDesignAllowed: false, fullMp4RenderAllowed: false, finalRenderAllowed: false,
  shots: fusedEditorialV2Anchors.map((anchor, index) => ({order: index + 1, shotId: anchor.anchorId, designSha256: hash, still, review: {status: "pending", reviewedDesignSha256: null}, neighborShotIds: [fusedEditorialV2Anchors[index - 1]?.anchorId, fusedEditorialV2Anchors[index + 1]?.anchorId].filter(Boolean)})),
  summary: {shotCount: 3, approvedCount: 0, pendingCount: 3, reviseCount: 0}, nextAction: "review anchors",
});
assert.deepEqual(affectedShotIdsForDesignChange(anchorBoard, "FE2-A02"), ["FE2-A02", "FE2-A01", "FE2-A03"]);
assert.equal(canUnlockMotion(anchorBoard), false);
assert.throws(() => assertMotionMayBeBuilt(anchorBoard), /full design board is not 100% approved/u);

const approvedBoard = A1DesignBoardManifestV1Schema.parse({...anchorBoard, phase: "full-board-review", fullBoardGenerationAllowed: true, shots: anchorBoard.shots.map((shot) => ({...shot, review: {status: "approved", reviewedDesignSha256: hash}})), summary: {shotCount: 3, approvedCount: 3, pendingCount: 0, reviseCount: 0}});
assert.equal(canUnlockMotion(approvedBoard), true);
assert.doesNotThrow(() => assertMotionMayBeBuilt(approvedBoard));

const representativeInput = Array.from({length: 24}, (_, index) => ({shotId: `S${String(index + 1).padStart(2, "0")}`, sceneFamily: fusedEditorialV2VisualMaster.sceneFamilies[index % 8].id, complexity: index % 7}));
const representatives = selectRepresentativeShotIds(representativeInput);
assert.ok(representatives.length <= 12);
assert.equal(representatives[0], "S01");
assert.ok(representatives.includes("S24"));
for (const family of fusedEditorialV2VisualMaster.sceneFamilies) assert.ok(representatives.some((id) => representativeInput.find((shot) => shot.shotId === id)?.sceneFamily === family.id));

const benchmarkBase = {contract: "A1MaskBenchmarkResult/v1" as const, sampleCount: 30 as const, standard: {edgePassFraction: .9, p95DurationMs: 6000, peakMemoryMb: 6144, loadSucceeded: true}, lite: {edgePassFraction: .8, p95DurationMs: 3000, peakMemoryMb: 3000, loadSucceeded: true}};
assert.equal(selectBiRefNetVariant(benchmarkBase), "standard");
assert.equal(selectBiRefNetVariant({...benchmarkBase, standard: {...benchmarkBase.standard, p95DurationMs: 6001}}), "lite");
assert.equal(selectBiRefNetVariant({...benchmarkBase, standard: {...benchmarkBase.standard, loadSucceeded: false}, lite: {...benchmarkBase.lite, loadSucceeded: false}}), "unavailable");

const categories = ["portrait-hair", "multi-person", "device-product", "paper-document", "transparent-reflective", "mixed-hard-edge"] as const;
const fixture = {
  contract: "A1MaskBenchmarkFixtureManifest/v1" as const,
  sampleCount: 30 as const,
  samples: categories.flatMap((category) => Array.from({length: 5}, (_, index) => ({
    id: `${category}-${index + 1}`,
    category,
    sourcePath: `/fixtures/${category}-${index + 1}.png`,
    sourceSha256: hash,
    rightsNote: "review fixture",
    standard: {reportPath: null, edgeReviewStatus: "pending" as const},
    lite: {reportPath: null, edgeReviewStatus: "pending" as const},
  }))),
};
assert.equal(A1MaskBenchmarkFixtureManifestSchema.parse(fixture).samples.length, 30);
const invalidFixture = structuredClone(fixture);
invalidFixture.samples[0].category = "paper-document";
assert.equal(A1MaskBenchmarkFixtureManifestSchema.safeParse(invalidFixture).success, false, "six stress categories need five samples each");

const maturityPending = buildPendingFusedEditorialV2MaturityManifest({approvedAnchorCount: 0});
assert.equal(maturityPending.outputLabel, "NOT_MATURE");
assert.equal(maturityPending.articles.length, 5);
assert.equal(maturityPending.status, "ANCHOR_REVIEW_REQUIRED");
const forgedMaturity = {...maturityPending, status: "MATURE_REVIEWED_V1" as const, outputLabel: "MATURE_REVIEWED_V1" as const};
assert.equal(A1SystemMaturityManifestV1Schema.safeParse(forgedMaturity).success, false, "machine state cannot forge MATURE_REVIEWED_V1");
const maturityPath = "apps/studio-next/public/generated/system-line/maturity-acceptance-v1/maturity-manifest.json";
if (fs.existsSync(maturityPath)) {
  const reviewedMaturity = JSON.parse(fs.readFileSync(maturityPath, "utf8"));
  assert.equal(A1SystemMaturityManifestV1Schema.safeParse(reviewedMaturity).success, true, "reviewed maturity artifact must satisfy the contract");
}

console.log(JSON.stringify({status: "PASS", contracts: ["A1VisualMasterProfile/v2", "A1LayeredShotDesign/v2", "A1DesignBoardManifest/v1", "A1MaskAsset/v1", "A1MotionPlan/v2", "A1SystemMaturityManifest/v1"], anchorCount: fusedEditorialV2Anchors.length, representativeCount: representatives.length}, null, 2));
