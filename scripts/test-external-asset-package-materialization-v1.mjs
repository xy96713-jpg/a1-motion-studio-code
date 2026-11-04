import assert from "node:assert/strict";
import crypto from "node:crypto";
import {discoverAutomaticAssetCandidates} from "../apps/studio-next/src/lib/a1-automatic-asset-candidates.js";

const sourceBuffer = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g"><stop stop-color="#0f365f"/><stop offset="1" stop-color="#e4d29d"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="290" cy="280" r="150" fill="#df8740"/><path d="M80 500 Q300 280 720 470" fill="none" stroke="#f4f1e8" stroke-width="30"/></svg>`);
const sourceSha256 = crypto.createHash("sha256").update(sourceBuffer).digest("hex");

const state = {
  contract: "A1NextLegacyBridgeState/v1",
  source: "fallback",
  legacyOrigin: "http://legacy.test",
  projectId: "external-package-materialization",
  projectTitle: "素材包物化测试",
  sourceUrl: "https://official.test/science",
  projectCount: 1,
  assetCount: 0,
  generatedAt: new Date(0).toISOString(),
  usagePolicy: {contract: "A1ProjectUsagePolicy/v1", mode: "personal-noncommercial", allowSourcePageScreenshots: true, sourcePreference: "original-media-then-page-screenshot", confirmationBasis: "user-confirmed", confirmedAt: new Date(0).toISOString()},
  shots: [{id: "01", role: "依据", source: "A verified scientific field photograph supports the explanation.", screenTitle: "Scientific field photograph", template: "rve-image-zoom-reveal", assetTreatmentSemantics: {domain: "SCIENCE", visualIntent: "SOURCE_CONTEXT"}}],
  assets: [],
  templateOptions: [],
  renderBridge: {contract: "A1NextRenderPropsBridge/v1", ok: true},
};
const candidate = {
  id: "candidate:science-source",
  canonicalName: "Verified scientific field photograph",
  kind: "reference-image",
  source: "official-media",
  cachedImageUrl: "/assets/web-assets/cache/science-source.png",
  cachedImageSha256: sourceSha256,
  sourceUrl: state.sourceUrl,
  sourceQualityTier: "official",
  sourceQualityScore: 98,
  license: "by",
  evidenceFields: {cachedImageSha256: sourceSha256, sourceQualityTier: "official", license: "by", semanticMatchScore: 96},
  materialCarrierPixelReview: {
    contract: "A1MaterialCarrierPixelReview/v1",
    status: "PASS",
    score: 95,
    entityCorrect: true,
    sceneContextCorrect: true,
    actionCarrierFit: true,
    carrierVisible: true,
    materialRegion: {x: 0, y: 0, width: 1, height: 1},
    labels: [{id: "coral_reef", confidence: .94}],
    featurePrintDigest: "science-source-pixel-proof",
    fatalFailures: [],
  },
};
const jsonResponse = (candidates) => new Response(JSON.stringify({candidates}), {status: 200, headers: {"content-type": "application/json"}});
const result = await discoverAutomaticAssetCandidates(state, {
  slotPlans: [{contract: "A1AssetSlotPlan/v1", shotId: "01", slotKind: "single-image", status: "blocked", requiredCount: 1, query: "scientific field photograph", subSlots: []}],
  fetchImpl: async () => jsonResponse([candidate]),
  treatmentFetchImpl: async () => new Response(sourceBuffer, {status: 200, headers: {"content-type": "image/svg+xml"}}),
  legacyOrigin: "http://legacy.test",
  renderAutomaticTreatments: true,
});
const asset = result.state.assets[0];
assert.equal(result.report.treatmentDecisionCount, 1);
assert.equal(result.report.treatmentArtifactCount, 1);
assert.equal(result.report.externalAssetPackageCount, 1);
assert.equal(asset.automaticTreatmentDecision?.art?.selectedTreatment, "CYANOTYPE_CONTACT");
assert.equal(asset.automaticTreatmentArtifact?.status, "READY_FOR_REVIEW");
assert.equal(asset.externalAssetPackage?.status, "READY_FOR_REVIEW");
assert.equal(asset.externalAssetPackage?.boundaries?.assetOnly, true);
assert.equal(asset.externalAssetPackage?.boundaries?.storyboardMutationAllowed, false);
assert.equal(asset.externalAssetPackage?.boundaries?.productionAdmission, false);
assert.ok(asset.automaticTreatmentArtifact?.reviewUrl);
console.log(JSON.stringify({
  contract: "A1ExternalAssetPackageMaterializationTest/v1",
  status: "PASS",
  decision: {presentation: asset.automaticTreatmentDecision.presentation.mode, separation: asset.automaticTreatmentDecision.separation.effectIntent, treatment: asset.automaticTreatmentDecision.art.selectedTreatment},
  artifact: asset.automaticTreatmentArtifact,
  packageSha256: asset.externalAssetPackage.packageSha256,
}, null, 2));
