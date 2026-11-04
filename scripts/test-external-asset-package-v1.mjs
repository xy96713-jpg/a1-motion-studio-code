import assert from "node:assert/strict";
import {compileAssetTreatmentDecision} from "../apps/studio-next/src/lib/a1-asset-treatment-orchestrator-v1.mjs";
import {assertExternalAssetPackage, compileExternalAssetPackage} from "../apps/studio-next/src/lib/a1-external-asset-package-v1.mjs";

const sha = (letter) => letter.repeat(64);
const source = {id: "source", assetUri: "/source.png", sha256: sha("a"), provenance: {sourceUri: "https://source.test/item", license: "internal-review-only", reviewed: true}};
const pixelReview = {contract: "A1MaterialCarrierPixelReview/v1", status: "PASS", score: 94, featurePrintDigest: "pixel-proof"};
const artifact = (assetUri, sha256, extra = {}) => ({assetUri, sha256, width: 800, height: 600, hasAlpha: false, ...extra});

const cutoutDecision = compileAssetTreatmentDecision({
  source: {sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", sourceAuthority: "NON_EVIDENCE", cleanAssetAvailable: true, alphaAvailable: true, matteReviewStatus: "PASS", assetCount: 1},
  shot: {shotFunction: "TRANSITION", viewerTask: "识别人并完成概念转场", carrierRole: "PERSON_IDENTITY", copyDensity: "LOW", placementPlane: "FLOATING", effectIntensity: "LOW", spotColor: "A1_COBALT"},
  semantics: {temporalContext: "CURRENT", domain: "GENERAL", memoryMode: "NONE", visualIntent: "CONCEPTUAL_BRIDGE", tone: "NEUTRAL", conceptualActions: []},
  background: {complexity: "BUSY", subjectSeparation: "LOW"},
  sequence: {stylizedCountInWindow: 0, recentTreatments: [], recentFamilies: []},
});
const cutoutPackage = compileExternalAssetPackage({
  id: "cutout-package",
  source,
  pixelReview,
  decision: cutoutDecision,
  matte: {status: "PASS", assetUri: "/mask.png", sha256: sha("b"), reviewed: true},
  cleanMaster: artifact("/clean.png", sha("c"), {hasAlpha: true, alphaMin: 0, alphaMax: 255}),
  treatedAsset: artifact("/treated.png", sha("d"), {hasAlpha: true, alphaMin: 0, alphaMax: 255}),
  reviewAsset: artifact("/review.png", sha("e")),
});
assertExternalAssetPackage(cutoutPackage);
assert.equal(cutoutPackage.semantic.presentation, "CUTOUT");
assert.equal(cutoutPackage.boundaries.titleRendered, false);
assert.equal(cutoutPackage.boundaries.backgroundGenerated, false);

const badMatte = compileExternalAssetPackage({
  id: "bad-matte",
  source,
  pixelReview,
  decision: cutoutDecision,
  matte: {status: "PENDING", assetUri: "/mask.png", sha256: sha("b"), reviewed: false},
  cleanMaster: artifact("/clean.png", sha("c"), {hasAlpha: true, alphaMin: 0, alphaMax: 255}),
  treatedAsset: artifact("/treated.png", sha("d"), {hasAlpha: true, alphaMin: 0, alphaMax: 255}),
  reviewAsset: artifact("/review.png", sha("e")),
});
assert.equal(badMatte.status, "BLOCKED");
assert.ok(badMatte.failures.includes("REVIEWED_MATTE_PASS_REQUIRED"));

const evidenceDecision = compileAssetTreatmentDecision({
  source: {sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", sourceAuthority: "AUTHORITATIVE_EVIDENCE", cleanAssetAvailable: true, alphaAvailable: false, matteReviewStatus: "NOT_REVIEWED", evidenceFocusVerified: true, assetCount: 1},
  shot: {shotFunction: "RESULT_HOLD", viewerTask: "核对来源页面", carrierRole: "SOURCE_CONTEXT", copyDensity: "DENSE", placementPlane: "SOURCE_PLANE", effectIntensity: "LOW", spotColor: "A1_COBALT"},
  semantics: {temporalContext: "CURRENT", domain: "RESEARCH", memoryMode: "NONE", visualIntent: "SOURCE_CONTEXT", tone: "NEUTRAL", conceptualActions: []},
  background: {complexity: "QUIET", subjectSeparation: "ADEQUATE"},
  sequence: {stylizedCountInWindow: 0, recentTreatments: [], recentFamilies: []},
});
const badEvidence = compileExternalAssetPackage({
  id: "bad-evidence",
  source,
  pixelReview,
  decision: evidenceDecision,
  cleanMaster: artifact("/clean.png", sha("c")),
  treatedAsset: artifact("/treated.png", sha("d")),
  reviewAsset: artifact("/review.png", sha("e")),
});
assert.equal(badEvidence.status, "BLOCKED");
assert.ok(badEvidence.failures.includes("EVIDENCE_BYTES_CHANGED"));

const cleanEvidence = compileExternalAssetPackage({
  id: "clean-evidence",
  source,
  pixelReview,
  decision: evidenceDecision,
  cleanMaster: artifact("/clean.png", sha("c")),
  treatedAsset: artifact("/clean.png", sha("c")),
  reviewAsset: artifact("/review.png", sha("e")),
});
assertExternalAssetPackage(cleanEvidence);

console.log(JSON.stringify({
  contract: "A1ExternalAssetPackageTest/v1",
  status: "PASS",
  results: [
    {id: "cutout-ready", status: cutoutPackage.status},
    {id: "unreviewed-matte-blocked", status: badMatte.status},
    {id: "evidence-byte-change-blocked", status: badEvidence.status},
    {id: "evidence-clean-ready", status: cleanEvidence.status}
  ]
}, null, 2));
