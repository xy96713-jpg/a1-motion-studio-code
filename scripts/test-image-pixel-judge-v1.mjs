import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  computePerceptualHash,
  createEnvSemanticJudge,
  groupNearDuplicates,
  hammingDistance,
  judgeImagePixels,
  validRoi,
} from "../lib/visual-sourcing/image-pixel-judge-v1.mjs";
import {
  analyzeImages,
  featureDigest,
  featureSimilarity,
  localSemanticVerdict,
  textRegionUnion,
} from "../lib/visual-sourcing/macos-vision-analyze-v1.mjs";
import {scoreMaterialCarrierCandidate} from "../lib/visual-sourcing/material-carrier-fit-ranker-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sources = path.join(root, "apps/studio-next/public/generated/system-line/web-source-packaging-pilot-v1/sources");
const documentImage = path.join(sources, "acl-2026-acl-long-1803-title-abstract.png");
const portraitImage = path.join(sources, "dmitry-kobak-official-portrait.webp");
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "a1-pixel-judge-test-"));

/** Evidence shot that must bind a readable text range on a real record surface. */
const evidenceRequirement = {
  contract: "A1MaterialCarrierRequirement/v1",
  role: "evidence",
  requiredEntity: null,
  requiredAction: "append",
  requiredReadableDetail: "readable-source-detail",
  requiredVisualSignals: ["llms", "study"],
  sourceBinding: {mode: "CARRIER_MAY_BE_GENERATED", generationAllowed: true, requiresArticleSource: false},
  effectBinding: {targetType: "source-text-range", semanticAction: "append", requiresVerifiedCarrier: true},
};

const results = {};

// A generic context photograph may use the whole verified frame as its material
// region; this does not verify a named identity or invent an object box.
{
  const verdict = localSemanticVerdict({
    analysis: {labels: [{id: "indoor", confidence: 0.9}], observations: []},
    requirement: {role: "context", requiredAction: "hold", effectBinding: {targetType: "material-region", semanticAction: "hold"}},
    ocrText: "",
  });
  assert.equal(verdict.entityCorrect, true);
  assert.equal(verdict.sceneContextCorrect, true);
  assert.equal(verdict.actionCarrierFit, true);
  assert.deepEqual(verdict.materialRegion, {x: 0, y: 0, width: 1, height: 1});
  results.contextMaterialRegion = verdict.materialRegion;
}

// --- 1. one local pass yields text, labels and a feature print -------------
{
  const analysis = await analyzeImages([documentImage, portraitImage]);
  assert.equal(analysis.status, "PASS", `local analysis must run: ${analysis.error}`);
  const [doc, portrait] = analysis.images;
  assert.ok(doc.observations.length > 20, `expected many text observations, got ${doc.observations.length}`);
  assert.ok(doc.labels.some((label) => label.id.includes("document")), "paper page should classify as a document");
  assert.ok(Array.isArray(doc.featurePrint) && doc.featurePrint.length > 100, "feature print should be populated");
  assert.ok(portrait.labels.some((label) => label.id.includes("people") || label.id.includes("adult")), "portrait should classify as people");
  assert.ok(validRoi(textRegionUnion(doc.observations)), "text region union must be a valid ROI");
  results.localAnalysis = {
    documentLabels: doc.labels.slice(0, 3).map((label) => `${label.id}:${label.confidence.toFixed(2)}`),
    portraitLabels: portrait.labels.slice(0, 3).map((label) => `${label.id}:${label.confidence.toFixed(2)}`),
    textObservations: doc.observations.length,
    featureDimensions: doc.featurePrint.length,
  };

  // feature prints separate unrelated images, digests are stable and short
  const similarity = featureSimilarity(doc.featurePrint, portrait.featurePrint);
  assert.ok(similarity !== null && similarity < 0.98, `unrelated images should not be near-identical, got ${similarity}`);
  const digest = featureDigest(doc.featurePrint);
  assert.equal(typeof digest, "string");
  assert.equal(digest.length, 32);
  results.featurePrint = {crossImageSimilarity: similarity, digestLength: digest.length};
}

// --- 2. local semantics alone can PASS a real record surface ---------------
{
  const review = await judgeImagePixels({imagePath: documentImage, requirement: evidenceRequirement});
  assert.equal(review.semanticSource, "local", "the local classifier must be the default semantic layer");
  assert.equal(review.layers.semantic, "PASS");
  assert.equal(review.status, "PASS", `expected local PASS, got ${review.status} failures=${review.fatalFailures}`);
  assert.equal(review.entityCorrect, true);
  assert.equal(review.sceneContextCorrect, true);
  assert.equal(review.actionCarrierFit, true);
  assert.ok(review.rangeToken, "a text anchor token must be found");
  assert.ok(validRoi(review.rangeRoi), "rangeRoi must be a valid ROI");
  assert.ok(review.score >= 70, `PASS score should be high, got ${review.score}`);
  results.localPass = {
    status: review.status,
    score: review.score,
    rangeToken: review.rangeToken,
    rangeRoi: review.rangeRoi,
    labels: review.labels.map((label) => label.id),
  };

  // --- 3. the ranker accepts it end to end --------------------------------
  const ranked = scoreMaterialCarrierCandidate({
    id: "acl-page",
    title: "More Aligned, Less Diverse? LLM grammar and lexicon study page",
    sourceUrl: "https://aclanthology.org/2026.acl-long.1803/",
    sourceQualityTier: "official",
    width: 993,
    height: 1404,
    license: "by",
    materialCarrierPixelReview: review,
  }, evidenceRequirement, {articleSourceUrl: "https://aclanthology.org/2026.acl-long.1803/"});
  assert.equal(ranked.status, "CARRIER_FIT_PASS", `ranker should accept verified pixels, got ${ranked.status} ${ranked.hardFailures}`);
  results.rankerIntegration = {status: ranked.status, score: ranked.score};
}

// --- 4. a portrait cannot stand in as a record surface ---------------------
{
  // Pure portrait: the local classifier must contradict an append-on-record shot.
  const analysis = await analyzeImages([portraitImage]);
  const verdict = localSemanticVerdict({
    analysis: analysis.images[0],
    requirement: evidenceRequirement,
    ocrText: "",
  });
  assert.equal(verdict.actionCarrierFit, false, "a portrait has no writable record surface");
  assert.equal(verdict.sceneContextCorrect, false);

  // End to end it is rejected as well - at 192x192 the mechanical layer gets there first.
  const review = await judgeImagePixels({imagePath: portraitImage, requirement: evidenceRequirement});
  assert.equal(review.status, "REJECT", `portrait must not pass an append-on-record shot, got ${review.status}`);
  assert.ok(review.fatalFailures.includes("LOW_RESOLUTION"), `expected LOW_RESOLUTION, got ${review.fatalFailures}`);
  results.portraitReject = {
    verdict: {actionCarrierFit: verdict.actionCarrierFit, sceneContextCorrect: verdict.sceneContextCorrect},
    status: review.status,
    fatalFailures: review.fatalFailures,
  };
}

// --- 4b. a document-like page missing the required anchor stays unapproved -
{
  const profilePage = path.join(sources, "dmitry-kobak-official-profile-source.png");
  const review = await judgeImagePixels({imagePath: profilePage, requirement: evidenceRequirement});
  assert.notEqual(review.status, "PASS", `a page lacking the required text anchor must not PASS, got ${review.status}`);
  assert.ok(review.fatalFailures.includes("EFFECT_ANCHOR_MISSING"), `expected EFFECT_ANCHOR_MISSING, got ${review.fatalFailures}`);
  results.anchorRequired = {status: review.status, fatalFailures: review.fatalFailures};
}

// --- 5. an uncertain verdict stays PENDING, never PASS --------------------
{
  // A blank surface is document-like sizing but carries no readable text, so the
  // local layer must decline to affirm rather than approve.
  const blankPath = path.join(tmp, "blank-record.png");
  await sharp({create: {width: 900, height: 1200, channels: 3, background: {r: 250, g: 250, b: 245}}}).png().toFile(blankPath);
  const review = await judgeImagePixels({imagePath: blankPath, requirement: evidenceRequirement});
  assert.notEqual(review.status, "PASS", `blank surface must not PASS, got ${review.status}`);
  results.blankSurface = {status: review.status, actionCarrierFit: review.actionCarrierFit, ocrTextLength: review.ocrTextLength};
}

// --- 6. a cloud judge overrides the local layer ---------------------------
{
  const review = await judgeImagePixels({
    imagePath: documentImage,
    requirement: evidenceRequirement,
    semanticJudge: async () => ({
      entityCorrect: true,
      sceneContextCorrect: true,
      actionCarrierFit: true,
      carrierVisible: true,
      objectRoi: null,
      confidence: 0.9,
      reason: "cloud audit",
    }),
  });
  assert.equal(review.semanticSource, "cloud");
  assert.equal(review.status, "PASS");
  results.cloudOverride = {semanticSource: review.semanticSource, status: review.status};
}

// --- 7. broken and low-resolution images are rejected mechanically --------
{
  const missing = await judgeImagePixels({imagePath: path.join(tmp, "does-not-exist.png"), requirement: evidenceRequirement});
  assert.equal(missing.status, "REJECT");
  assert.ok(missing.fatalFailures.includes("IMAGE_UNREADABLE"));

  const tinyPath = path.join(tmp, "tiny.png");
  await sharp({create: {width: 100, height: 60, channels: 3, background: {r: 200, g: 200, b: 200}}}).png().toFile(tinyPath);
  const tiny = await judgeImagePixels({imagePath: tinyPath, requirement: evidenceRequirement});
  assert.equal(tiny.status, "REJECT");
  assert.ok(tiny.fatalFailures.includes("LOW_RESOLUTION"));
  results.mechanicalReject = {missing: missing.fatalFailures, tiny: tiny.fatalFailures};
}

// --- 8. perceptual hash detects near-duplicates ---------------------------
{
  const original = path.join(tmp, "original.jpg");
  const reencoded = path.join(tmp, "reencoded.jpg");
  const different = path.join(tmp, "different.jpg");
  await sharp(documentImage).resize(600, 848).jpeg({quality: 90}).toFile(original);
  await sharp(documentImage).resize(420, 594).jpeg({quality: 55}).toFile(reencoded);
  await sharp({create: {width: 600, height: 848, channels: 3, background: {r: 5, g: 90, b: 200}}}).jpeg().toFile(different);
  const [hashA, hashB, hashC] = await Promise.all([original, reencoded, different].map((file) => computePerceptualHash(file)));
  const nearDistance = hammingDistance(hashA, hashB);
  const farDistance = hammingDistance(hashA, hashC);
  assert.ok(nearDistance !== null && nearDistance <= 4, `re-encode should stay near, got ${nearDistance}`);
  assert.ok(farDistance > nearDistance, `unrelated image should differ more, got ${farDistance}`);
  const groups = groupNearDuplicates([
    {id: "a", perceptualHash: hashA},
    {id: "b", perceptualHash: hashB},
    {id: "c", perceptualHash: hashC},
  ]);
  assert.equal(groups.length, 1, "one duplicate group expected");
  results.duplicates = {nearDistance, farDistance, groups: groups.length};
}

// --- 9. cloud judge stays opt-in ------------------------------------------
{
  assert.equal(createEnvSemanticJudge({}), null, "no env config means no cloud judge");
  const judge = createEnvSemanticJudge({A1_VISION_BASE_URL: "https://example.test/v1", A1_VISION_API_KEY: "k", A1_VISION_MODEL: "m"});
  assert.equal(typeof judge, "function");
  results.envJudge = {unconfiguredNull: true, configuredFunction: true};
}

// --- 10. local verdict is honest about what it cannot verify --------------
{
  const verdict = localSemanticVerdict({
    analysis: {labels: [{id: "people", confidence: 0.9}], observations: []},
    requirement: {...evidenceRequirement, requiredEntity: "Dmitry Kobak", requiredVisualSignals: ["portrait"]},
    ocrText: "",
  });
  assert.equal(verdict.entityCorrect, null, "a named identity cannot be verified locally");
  results.namedEntityStaysNull = {entityCorrect: verdict.entityCorrect};
}

console.log(JSON.stringify({
  ok: true,
  contract: "A1ImagePixelJudgeTest/v1",
  ...results,
}, null, 2));
