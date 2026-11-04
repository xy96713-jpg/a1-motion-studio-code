#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {assertPackageAssetKitPlan, assertPackageAssemblyRecipe, buildPackageAssetKitPlan, buildPackageAssemblyRecipe, discoverReusablePackageLayerCandidates} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const routeSource = fs.readFileSync(path.join(appRoot, "src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8");
const workspaceFile = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspaceFile, "utf8"));
const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const targetShotId = "ED-07";
const event = workspace.production.packagingBeatPlan.packagingEvents.find((item) => item.sourceBeatIds.includes(targetShotId));
const decision = workspace.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === targetShotId);
const videoContext = workspace.production.shotIntelligence.videoPackagingContexts.items.find((item) => item.shotId === targetShotId);
const styleBrief = compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext, now: "2026-08-05T00:00:00.000Z"});

// A generic approved editorial-artwork record must not become a background
// merely because its stage/route string looks plausible.
const genericArtwork = {
  id: "generic-atlas-not-a-background",
  status: "approved",
  route: "editorial-artwork",
  stageId: "background-foundry",
  semanticRole: "proofing-bench-evidence",
  assetUri: "/generated/system-line/generic-atlas.png",
  sha256: "a".repeat(64),
  usedByShotIds: [targetShotId],
};
const built = buildPackageAssetKitPlan(decision, {
  styleBriefSha256: styleBrief.styleBriefSha256,
  styleBriefBinding: styleBrief,
  referenceManifest,
  existingAssets: [...workspace.library.assets, genericArtwork],
  now: "2026-08-05T00:00:00.000Z",
});
const background = built.layers.find((layer) => layer.kind === "BACKGROUND");
assert.equal(background.slotContract.contract, "A1PackageLayerSlotContract/v1");
assert.notEqual(background.route, "REUSE", "untyped approved artwork must never route to REUSE");
assert.equal(background.cacheKeyInputs.existingAssetIds.includes(genericArtwork.id), false);
assert.ok(background.routeAudit.rejectedAssets.some((item) => item.assetId === genericArtwork.id && item.reasons.includes("REJECTED_NOT_SLOT_COMPATIBLE")));
assertPackageAssetKitPlan(built);

// The old workspace has REUSE routes without authoritative audit/selected
// master evidence. A forged request-body audit is ignored and the route is
// atomically downgraded to GENERATE rather than waiting forever.
const clone = structuredClone(workspace);
const forged = Object.fromEntries((clone.library.assets || []).slice(0, 3).map((asset) => [asset.id, {
  contract: "A1PackageArtifactAudit/v1",
  serverGenerated: false,
  status: "PASS",
  assetId: asset.id,
  artifactSha256: asset.sha256,
  slotKind: "BACKGROUND",
  width: 1920,
  height: 1080,
  mimeType: "image/png",
  alphaVerified: true,
  policyAuditStatus: "PASS",
  visualAuditStatus: "PASS",
  styleAuditStatus: "PASS",
  styleBriefSha256: "forged",
  singleLayer: true,
  crossLayerComposite: false,
  textFree: true,
  fullFrame: true,
}]));
const discovered = discoverReusablePackageLayerCandidates(clone, targetShotId, {artifactAudits: forged, now: "2026-08-05T00:00:01.000Z"});
assert.equal(discovered.discovered.length, 0, "client-provided audit must not admit a reuse candidate");
const downgradedPlan = discovered.runtime.packageAssetKitPlans.find((plan) => plan.shotId === targetShotId);
assert.equal(downgradedPlan.layers.find((layer) => layer.kind === "BACKGROUND").route, "GENERATE");
assert.ok(Array.isArray(discovered.skipped));
assert.match(routeSource, /package-layer-reuse-client-audit-forbidden/u, "API must reject client-supplied reuse audit PASS fields");

// SOURCE is slot-scoped too: a production-allowed article URL without an
// explicit layer contract must not become a background/illustration source.
const genericProductionSource = {
  url: "https://example.test/official-evidence",
  usageClass: "PRODUCTION_ALLOWED",
  license: {status: "approved"},
};
const sourceWithoutSlot = buildPackageAssetKitPlan(decision, {
  styleBriefSha256: styleBrief.styleBriefSha256,
  styleBriefBinding: styleBrief,
  referenceManifest,
  existingAssets: [],
  researchPacket: {shotId: decision.shotId, sources: [genericProductionSource]},
  now: "2026-08-05T00:00:01.500Z",
});
assert.notEqual(sourceWithoutSlot.layers.find((layer) => layer.kind === "BACKGROUND").route, "SOURCE");
assert.ok(sourceWithoutSlot.layers.find((layer) => layer.kind === "BACKGROUND").routeAudit.rejectedSources.some((item) => item.reason === "REJECTED_NOT_SLOT_COMPATIBLE"));
const explicitBackgroundSource = {
  ...genericProductionSource,
  layerKind: "BACKGROUND",
  assetUri: "/generated/system-line/approved-background.png",
  textFree: true,
  fullFrame: true,
  containsTypography: false,
};
const sourceWithSlot = buildPackageAssetKitPlan(decision, {
  styleBriefSha256: styleBrief.styleBriefSha256,
  styleBriefBinding: styleBrief,
  referenceManifest,
  existingAssets: [],
  researchPacket: {shotId: decision.shotId, sources: [explicitBackgroundSource]},
  now: "2026-08-05T00:00:01.600Z",
});
assert.equal(sourceWithSlot.layers.find((layer) => layer.kind === "BACKGROUND").route, "SOURCE");
assert.notEqual(sourceWithSlot.layers.find((layer) => layer.kind === "ILLUSTRATION").route, "SOURCE");

// A style brief without its active binding is invalid for both newly built
// kits and recipes; this prevents future builders from silently regressing.
const missingBinding = structuredClone(built);
delete missingBinding.styleBinding;
assert.throws(() => assertPackageAssetKitPlan(missingBinding), /style-binding/);
const recipe = buildPackageAssemblyRecipe(built, {now: "2026-08-05T00:00:02.000Z"});
const missingRecipeBinding = structuredClone(recipe);
delete missingRecipeBinding.styleBinding;
assert.throws(() => assertPackageAssemblyRecipe(built, missingRecipeBinding), /presentation-binding|style-binding/);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1PackageArtifactAudit/v1",
  genericArtworkRejected: true,
  forgedClientAuditIgnored: true,
  reuseFallback: "GENERATE",
  styleBindingRequired: true,
  workspaceSha256: workspace.workspaceSha256,
}, null, 2));
