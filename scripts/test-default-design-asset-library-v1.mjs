#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertDefaultDesignAssetLibraryPlan, buildDefaultDesignAssetLibraryPlan} from "../apps/studio-next/src/lib/a1-default-design-asset-library-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const note = fs.readFileSync(path.join(root, "work/style-research/a1-pinterest-system-maturity-audit-2026-08-14.md"));
const workspace = readJson(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"));
const laneRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1");
const styleDna = readJson(path.join(laneRoot, "style-dna.json"));
const nextBackgroundBatchPlan = readJson(path.join(laneRoot, "next-variety-batch-plan.json"));
const researchNoteSha256 = crypto.createHash("sha256").update(note).digest("hex");
const plan = assertDefaultDesignAssetLibraryPlan(buildDefaultDesignAssetLibraryPlan({workspace, styleDna, nextBackgroundBatchPlan, researchNoteSha256, now: "2026-08-13T10:00:00.000Z"}));

assert.equal(plan.libraryShape.backgroundCatalog.initialUsableGoal, 24);
assert.deepEqual(plan.libraryShape.backgroundCatalog.foundationMotifs.map((item) => item.id), ["ordinary-dot-field", "small-cross-field", "one-bit-grain-field"]);
assert.equal(plan.libraryShape.backgroundCatalog.quietFoundationPolicy.edgeWeightedMinimumQuietFieldRatio, 0.7);
assert.ok(plan.libraryShape.backgroundCatalog.quietFoundationPolicy.supportedSpatialModes.includes("FULL_BLEED_UNIFORM_GRID"));
assert.equal(plan.libraryShape.typographyTemplates.templates.length, 1);
assert.equal(plan.libraryShape.typographyTemplates.historyOnlyTemplateIds.length, 5);
assert.equal(plan.libraryShape.typographyTemplates.singleFontFamily, "A1 Fusion Pixel");
assert.equal(plan.libraryShape.typographyTemplates.singleFontAssetId, "type-pixel-correction");
assert.equal(plan.libraryShape.elementKits.kits.length, 4);
assert.equal(plan.currentWave.imagegenElementKitContinuation?.actorCount || 0, workspace.production.articleAssetProductionAuthority.imagegenElementKitContinuation?.review?.actorCount || 0);
assert.equal(plan.currentWave.defaultTypographyTemplateContinuation?.templateCount || 0, workspace.production.articleAssetProductionAuthority.defaultTypographyTemplateContinuation?.review?.templateCount || 0);
assert.equal(plan.currentWave.storyboardDefaultLibraryBinding?.assignmentCount || 0, workspace.production.articleAssetProductionAuthority.storyboardDefaultLibraryBinding?.assignmentCount || 0);
assert.equal(plan.currentWave.storyboardLibraryStaticCanaryReview?.canaryCount || 0, workspace.production.articleAssetProductionAuthority.storyboardLibraryStaticCanaryReview?.canaryCount || 0);
assert.equal(plan.currentWave.storyboardLibraryStaticCanaryReview?.typography?.fontId, "type-pixel-correction");
assert.equal(plan.currentWave.storyboardLibraryStaticCanaryReview?.typography?.fontFamily, "Fusion Pixel");
assert.equal(plan.currentWave.storyboardLibraryStaticCanaryReview?.typography?.allVisibleFormalTextUsesSameFont, true);
assert.equal(plan.libraryShape.effectPrimitives.primitives.length, 6);
assert.equal(plan.libraryShape.effectPrimitives.transparentOverlayCount, 4);
assert.equal(plan.libraryShape.effectPrimitives.backgroundFieldCount, 2);
assert.equal(plan.libraryShape.effectPrimitives.maximumCrtFamilyInAnySix, 2);
assert.equal(plan.libraryShape.effectPrimitives.globalFilterForbidden, true);
assert.equal(plan.libraryShape.illustrations.defaultLibraryMember, false);
assert.equal(plan.currentWave.sourceBatchPlanSha256, nextBackgroundBatchPlan.batchPlanSha256);
assert.deepEqual(plan.currentWave.requests.map((item) => item.candidateId), nextBackgroundBatchPlan.requests.map((item) => item.candidateId));
assert.deepEqual(plan.currentWave.supplementalCanaries.map((item) => item.candidateId), ["background-cool-ordinary-dot-field-v1", "background-charcoal-small-cross-field-v1", "background-cool-uniform-dot-grid-v1", "background-cobalt-uniform-cross-grid-v1"]);
assert.equal(plan.currentWave.review?.candidateCount || 0, workspace.production.articleAssetProductionAuthority.nextBackgroundVarietyBatchReview?.candidateCount || 0);
assert.equal(plan.storyboardBinding.carrierRules.VERIFIED_SOURCE_EVIDENCE.illustration, "FORBIDDEN_AS_EVIDENCE");
assert.equal(plan.storyboardBinding.repetitionRules.paletteOnlyChangeCountsAsNewConstruction, false);
assert.throws(() => assertDefaultDesignAssetLibraryPlan({...plan, boundaries: {...plan.boundaries, motionAllowed: true}}), /default-library-boundary-invalid/u);

console.log(JSON.stringify({status: "PASS", contract: plan.contract, planSha256: plan.planSha256, backgroundGoal: 24, typographyTemplateCount: plan.libraryShape.typographyTemplates.templates.length, elementKitCount: 4, currentWaveCandidateIds: plan.currentWave.requests.map((item) => item.candidateId)}, null, 2));
