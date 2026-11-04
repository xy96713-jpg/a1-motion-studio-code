#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  approveRecommendedArticleDesignKit,
  assertArticlePackagingKit,
  buildArticlePackagingKit,
  packagingAssetIdsForShot,
  reviewArticlePackagingKit,
} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildTypographyFoundry, reviewTypographyPhrase} from "../apps/studio-next/src/lib/a1-typography-foundry-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "apps/studio-next/public");
let workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/article-packaging-kit-v1/element-manifest.json"), "utf8"));
const now = "2026-08-02T10:00:00.000Z";

workspace.library.assets = workspace.library.assets.filter((asset) => asset.route !== "editorial-element");
for (const actor of manifest.actors) {
  workspace.library.assets.push({
    id: `test-element-${actor.id}`,
    stageId: "element-atlas",
    name: actor.role,
    purpose: "test packaging actor",
    semanticRole: actor.role,
    route: "editorial-element",
    promptBrief: "none",
    sourceRequirement: "derived transparent actor",
    outputPolicy: "transparent actor",
    status: "approved",
    contentSha256: actor.sha256,
    requiredForShotComposition: true,
    assetUri: actor.publicUrl,
    sha256: actor.sha256,
    usedByShotIds: workspace.library.assets.filter((asset) => asset.route === "shot-composition").slice(actor.cellIndex % 4, actor.cellIndex % 4 + 8).map((asset) => asset.shotDemand.shotId),
    extractionPolicy: "test",
    typographyRole: null,
    typographySpec: null,
    preview: {kind: "transparent-element", publicUrl: actor.publicUrl},
    provenance: {sourceType: "test-derived-article-atlas", sourceUri: manifest.sourceAtlas.publicUrl, license: "test", reviewed: true},
    candidates: null,
    creativeInputOnly: true,
    evidenceUseAllowed: false,
    productionStyleAuthority: {
      contract: "A1ProductionStyleAuthority/v1",
      referencePackId: workspace.visualBible.visualGenerationPolicy.visualReferencePack.id,
      policySha256: workspace.visualBible.visualGenerationPolicy.sha256,
      productionEligible: true,
      reason: "test-fixture-current-policy",
    },
    packagingActor: {contract: "A1PackagingElementActor/v1", sourceAtlasAssetId: manifest.sourceAtlas.assetId, sourceAtlasSha256: manifest.sourceAtlas.sha256, cellIndex: actor.cellIndex, role: actor.role, tags: actor.tags, transparent: true},
    review: {status: "approved", note: "test", reviewedAt: now, reviewedBy: "user", approvedContentSha256: actor.sha256},
  });
}

// The live workspace intentionally uses the current single-font policy and
// therefore has no required generated-glyph board IDs. This unit test covers
// the legacy typography-foundry packaging contract, so make that boundary
// explicit in the isolated fixture instead of relying on a stale live-policy
// assumption.
workspace.typographySystem = {
  ...workspace.typographySystem,
  policy: {
    ...workspace.typographySystem.policy,
    requiredGeneratedGlyphBoardIds: workspace.library.assets.filter((asset) => asset.route === "generated-glyph").map((asset) => asset.id),
  },
};
workspace.production.typographyFoundry = buildTypographyFoundry(workspace, now);
// This test isolates packaging approval. The live workspace remains treatment-blocked;
// give the fixture an explicit synthetic treatment approval so the packaging gate can
// be exercised without weakening the production gate.
workspace.production.visualDirector.treatmentHash = "test-treatment-approval-hash";
workspace.production.visualDirector.creativeReviews.gates = workspace.production.visualDirector.creativeReviews.gates.map((gate) => gate.id === "treatment"
  ? {...gate, status: "approved", approvedAt: now, approvedBy: "test-fixture", note: "synthetic treatment approval for packaging unit test", evidenceHash: "test-treatment-evidence"}
  : gate);
const fastLaneFixture = structuredClone(workspace);
fastLaneFixture.production.articlePackagingKit = {contract: "A1ArticlePackagingKit/v1", sourceCheckpoint: null, createdAt: now};
assert.throws(() => approveRecommendedArticleDesignKit(fastLaneFixture, "one-click design kit test", now), /article-packaging-kit-exact-bindings-required/);
for (const phrase of workspace.production.typographyFoundry.phrases) {
  workspace = reviewTypographyPhrase(workspace, phrase.assetId, phrase.suggestedCandidateId, "approved", "packaging-kit-test typography selection", now);
}
workspace.production.articlePackagingKit = {contract: "A1ArticlePackagingKit/v1", sourceCheckpoint: null, createdAt: now};
workspace.production.articlePackagingKit = buildArticlePackagingKit(workspace, now);
const kit = assertArticlePackagingKit(workspace.production.articlePackagingKit, workspace);
assert.equal(kit.policies.perShotFullSceneGenerationAllowed, false);
assert.equal(kit.policies.globalMaterialSpillAllowed, false);
assert.equal(kit.policies.maximumGenerationConcurrency, 2);
// The current authority may carry more than the original 12-cell atlas after
// a visual repair. The contract is a minimum viable transparent-actor lane,
// not a frozen asset count.
assert.ok(kit.lanes.elementActors.length >= 12);
assert.equal(kit.shotAssignments.length, workspace.article.shotCount);
assert.ok(kit.lanes.backgrounds.length >= 3);
assert.ok(kit.lanes.fonts.length >= 3);
assert.equal(kit.lanes.generatedGlyphs.length, 4);
assert.equal(kit.gates.typographyFoundryApproved, true);
assert.ok(kit.lanes.sourceMedia.length >= 1);
assert.ok(kit.shotAssignments.every((assignment) => assignment.elementActorIds.length <= 2 && assignment.fontAssetIds.length <= 2 && assignment.generatedGlyphAssetIds.length <= 1 && assignment.sourceMediaAssetIds.length <= 8));
assert.ok(kit.shotAssignments.every((assignment) => assignment.layerPlan.contract === "A1ShotAssetLayerPlan/v1" && assignment.layerPlan.slots.length === 5));
assert.ok(kit.bindingSummary.completeShotCount < workspace.article.shotCount, "current fixture keeps source-material blockers explicit");
assert.ok(kit.bindingSummary.exactBoundSlotCount < kit.bindingSummary.requiredSlotCount);
assert.ok(kit.bindingSummary.exactBoundRequirementCount < kit.bindingSummary.requirementCount);
assert.equal(kit.bindingSummary.exactBindingComplete, false);

const first = kit.shotAssignments.find((assignment) => assignment.editMode === "full-package") || kit.shotAssignments[0];
const firstIds = packagingAssetIdsForShot(workspace, first.shotId);
assert.deepEqual(firstIds, [...new Set([first.backgroundAssetId, ...first.elementActorIds, ...first.fontAssetIds, ...first.generatedGlyphAssetIds, first.conceptIllustrationAssetId, ...first.sourceMediaAssetIds].filter(Boolean))]);
assert.ok(firstIds.length < kit.lanes.backgrounds.length + kit.lanes.elementActors.length + kit.lanes.fonts.length + kit.lanes.conceptIllustrations.length, "shot assignment must not receive the entire global asset library");

const pending = recalculateEditorialAssetWorkbench(workspace, now);
assert.equal(pending.production.articlePackagingKit.review.status, "pending");
assert.equal(pending.gates.articlePackagingKitApproved, false);
assert.equal(pending.gates.shotCompositionAllowed, false);
assert.equal(pending.gates.articlePackagingKitApproved, false);
assert.equal(pending.gates.exactAssetBindingsComplete, false);
assert.equal(pending.gates.packagingDeliveryGates.layerPlansComplete, false);
assert.ok(pending.production.visualDirector.shotBriefs.every((brief) => Array.isArray(brief.assignedPackagingAssetIds)));
assert.equal(pending.production.visualDirector.summary.generatedLayerCount, 15);
assert.equal(pending.production.visualDirector.summary.generatedTypographyCount, 2);
assert.equal(pending.production.visualDirector.summary.productionBindableBriefCount, 17);

assert.throws(() => reviewArticlePackagingKit(pending, "approved", "test approval", now), /article-packaging-kit-exact-bindings-required/);

console.log(JSON.stringify({
  status: "PASS",
  contract: kit.contract,
  lanes: Object.fromEntries(Object.entries(kit.lanes).map(([key, entries]) => [key, entries.length])),
  shotAssignments: kit.shotAssignments.length,
  pendingGate: pending.gates.shotCompositionAllowed,
  approvedGate: false,
  generatedLayerCount: pending.production.visualDirector.summary.generatedLayerCount,
  productionBindableBriefCount: pending.production.visualDirector.summary.productionBindableBriefCount,
  approvalBlockedByExactBindings: true,
}, null, 2));
