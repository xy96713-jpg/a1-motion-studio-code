#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {compileReferenceFrameReviewPlanV1} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";
import {planReferenceFrameExtractionBatchesV1} from "../apps/studio-next/src/lib/a1-reference-frame-batch-planner-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taskRoot = path.join(repoRoot, "work/cross-article-blind-source-plan-validation-v1");
const policyModulePath = path.join(repoRoot, "apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs");
const batchModulePath = path.join(repoRoot, "apps/studio-next/src/lib/a1-reference-frame-batch-planner-v1.mjs");
const scriptPath = fileURLToPath(import.meta.url);
const resultPath = path.join(taskRoot, "result.json");
const boardPath = path.join(taskRoot, "cross-source-batch-board.png");
const sharp = createRequire(path.join(repoRoot, "apps/studio-next/package.json"))("sharp");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const jsonSha = (value) => sha256(Buffer.from(JSON.stringify(value), "utf8"));

const fixtures = [
  {
    id: "blind-evidence-transition", genre: "evidence-explainer", fps: 25, totalFrames: 2500,
    sequences: [
      {sequenceId: "proof-hold", startFrame: 0, endFrameExclusive: 500, mode: "stable-hold", representativeFrame: 199},
      {sequenceId: "evidence-reveal", startFrame: 500, endFrameExclusive: 1250, mode: "semantic-motion", anchors: [
        {role: "PREPARE", sourceFrame: 620}, {role: "SOURCE_REVEAL", sourceFrame: 875}, {role: "CLAIM_HOLD", sourceFrame: 1120},
      ]},
      {sequenceId: "conclusion", startFrame: 1250, endFrameExclusive: 2500, mode: "semantic-motion", anchors: [
        {role: "AFTER_CUT", sourceFrame: 1250}, {role: "MECHANISM", sourceFrame: 1790}, {role: "TAKEAWAY", sourceFrame: 2420},
      ]},
    ],
    hardCuts: [{id: "CUT_A", beforeSequenceId: "evidence-reveal", afterSequenceId: "conclusion", cutFrame: 1250}],
  },
  {
    id: "blind-product-result", genre: "product-tutorial", fps: 30, totalFrames: 1300,
    sequences: Array.from({length: 13}, (_, index) => ({
      sequenceId: `tutorial-step-${String(index + 1).padStart(2, "0")}`,
      startFrame: index * 100,
      endFrameExclusive: (index + 1) * 100,
      mode: "unmapped-motion",
      fallbackReason: "the interaction path has not yet been mapped to a verified action event",
    })),
    hardCuts: [],
  },
  {
    id: "blind-opinion-handoff", genre: "personal-opinion", fps: 60, totalFrames: 6000,
    sequences: [
      {sequenceId: "gesture-arc", startFrame: 0, endFrameExclusive: 2000, mode: "semantic-motion", anchors: [
        {role: "GESTURE_ENTER", sourceFrame: 200}, {role: "GESTURE_PEAK", sourceFrame: 900},
        {role: "GESTURE_HOLD", sourceFrame: 1200}, {role: "GESTURE_EXIT", sourceFrame: 1900},
      ]},
      {sequenceId: "uncertain-handoff", startFrame: 2000, endFrameExclusive: 3600, mode: "ambiguity-probe",
        question: "Does the visual handoff begin before the spoken transition?", probeFrames: [2400, 2401]},
      {sequenceId: "settled-opinion", startFrame: 3600, endFrameExclusive: 6000, mode: "stable-hold", representativeFrame: 5999},
    ],
    hardCuts: [],
  },
];

const policyModuleSha256 = sha256(fs.readFileSync(policyModulePath));
const batchModuleSha256 = sha256(fs.readFileSync(batchModulePath));
const scriptSha256 = sha256(fs.readFileSync(scriptPath));
const output = [];
const palette = ["#d84a32", "#3169b3", "#198d78", "#a34a9b", "#c58519", "#526b38"];
for (const [fixtureIndex, fixture] of fixtures.entries()) {
  const sourceVideoSha256 = sha256(Buffer.from(`unseen-metadata-source:${fixture.id}:v1`, "utf8"));
  const policyPlan = compileReferenceFrameReviewPlanV1({
    sourceVideoSha256,
    fps: fixture.fps,
    totalFrames: fixture.totalFrames,
    sequences: fixture.sequences,
    hardCuts: fixture.hardCuts,
  });
  const repeatedPolicyPlan = compileReferenceFrameReviewPlanV1({
    sourceVideoSha256,
    fps: fixture.fps,
    totalFrames: fixture.totalFrames,
    sequences: fixture.sequences,
    hardCuts: fixture.hardCuts,
  });
  assert.deepEqual(repeatedPolicyPlan, policyPlan, `${fixture.id} policy replay must be stable`);
  const batchPlan = planReferenceFrameExtractionBatchesV1({plan: policyPlan});
  const repeatedBatchPlan = planReferenceFrameExtractionBatchesV1({plan: policyPlan});
  assert.deepEqual(repeatedBatchPlan, batchPlan, `${fixture.id} batch replay must be stable`);
  assert.equal(policyPlan.summary.extractedImages, 0);
  assert.equal(policyPlan.summary.visualApproval, false);
  assert.equal(batchPlan.summary.extractedImages, 0);
  assert.equal(batchPlan.summary.visualApproval, false);

  const actualReferences = [];
  const uniqueFrameKeys = new Set();
  const batchMarkers = [];
  for (const [batchIndex, batch] of batchPlan.batches.entries()) {
    const {sha256: batchSha256, ...batchBody} = batch;
    assert.equal(batchSha256, jsonSha(batchBody));
    assert.equal(batch.inputPlanSha256, policyPlan.sha256);
    assert.ok(batch.uniqueFrameCount <= 60);
    assert.ok(batch.artifactCountWithReceipt <= 64);
    const frames = batch.assets.map((asset) => asset.sourceFrame);
    batchMarkers.push({ordinal: batchIndex + 1, count: frames.length, firstFrame: Math.min(...frames),
      lastFrame: Math.max(...frames), referenceCount: batch.referenceCount, color: palette[batchIndex % palette.length]});
    for (const asset of batch.assets) {
      const key = `${asset.sourceVideoSha256}:${asset.sourceFrame}`;
      assert.equal(uniqueFrameKeys.has(key), false, `${fixture.id} duplicates no frame across batches`);
      uniqueFrameKeys.add(key);
      for (const reference of asset.references) {
        actualReferences.push(JSON.stringify([asset.sourceVideoSha256, asset.sourceFrame, reference.sequenceId,
          reference.role, reference.scope, reference.reason]));
      }
    }
  }
  const expectedReferences = policyPlan.references.map((reference) => JSON.stringify([sourceVideoSha256,
    reference.sourceFrame, reference.sequenceId, reference.role, reference.scope, reference.reason]));
  assert.deepEqual(actualReferences.sort(), expectedReferences.sort(), `${fixture.id} must conserve every role reference`);
  const {sha256: batchPlanSha256, ...batchPlanBody} = batchPlan;
  assert.equal(batchPlanSha256, jsonSha(batchPlanBody));
  output.push({
    id: fixture.id,
    genre: fixture.genre,
    status: "PASS",
    evidence: "scripts/build-cross-article-frame-plan-validation-v1.mjs",
    sourceVideoSha256,
    fps: fixture.fps,
    totalFrames: fixture.totalFrames,
    sequenceCount: fixture.sequences.length,
    referenceCount: policyPlan.summary.referenceCount,
    uniqueFrameCount: policyPlan.summary.uniqueSourceFrames,
    reusedReferences: policyPlan.summary.reusedReferences,
    policyPlanSha256: policyPlan.sha256,
    batchPlanSha256,
    batches: batchMarkers,
    frameIdentityCount: uniqueFrameKeys.size,
    outputImages: 0,
    color: palette[fixtureIndex],
  });
}

assert.equal(output.length, 3);
assert.equal(new Set(output.map((item) => item.genre)).size, 3);
assert.equal(output.find((item) => item.genre === "product-tutorial").batches.map((batch) => batch.count).join(","), "60,5");

const imageWidth = 1_520, imageHeight = 570;
const yStarts = [160, 290, 420];
const svgParts = [
  `<rect width="100%" height="100%" fill="#f8f6f0"/>`,
  `<style>.title{font:700 24px Arial,sans-serif;fill:#17202b}.sub{font:13px Arial,sans-serif;fill:#606975}.genre{font:700 14px Arial,sans-serif;fill:#202a34}.small{font:11px Arial,sans-serif;fill:#56616c}.batch{font:700 11px Arial,sans-serif;fill:#202a34}.foot{font:12px Arial,sans-serif;fill:#606975}</style>`,
  `<text x="24" y="32" class="title">BLIND SOURCE-PLAN GENERALITY CHECK</text>`,
  `<text x="560" y="31" class="sub">3 unseen metadata plans · 3 genres · 0 videos decoded · 0 images extracted</text>`,
];
for (const [index, fixture] of output.entries()) {
  const top = yStarts[index];
  svgParts.push(`<rect x="24" y="${top - 36}" width="1472" height="110" rx="10" fill="#fffdf7" stroke="#d9d5ca"/>`);
  svgParts.push(`<rect x="24" y="${top - 36}" width="7" height="110" fill="${fixture.color}"/>`);
  svgParts.push(`<text x="48" y="${top - 12}" class="genre">${fixture.genre} · ${fixture.sequenceCount} sequences</text>`);
  svgParts.push(`<text x="48" y="${top + 11}" class="small">${fixture.fps} fps · ${fixture.referenceCount} refs · ${fixture.uniqueFrameCount} unique frames · ${fixture.reusedReferences} reused</text>`);
  svgParts.push(`<text x="48" y="${top + 34}" class="small">source SHA ${fixture.sourceVideoSha256.slice(0, 16)}… · batch SHA ${fixture.batchPlanSha256.slice(0, 16)}…</text>`);
  const xStart = 790, cellWidth = 690 / Math.max(1, fixture.batches.length);
  for (const [batchIndex, batch] of fixture.batches.entries()) {
    const x = xStart + batchIndex * cellWidth;
    svgParts.push(`<rect x="${x + 3}" y="${top - 23}" width="${cellWidth - 8}" height="80" rx="7" fill="#f6f4ee" stroke="#ddd8cd"/>`);
    svgParts.push(`<rect x="${x + 3}" y="${top - 23}" width="5" height="80" fill="${batch.color}"/>`);
    svgParts.push(`<text x="${x + 17}" y="${top}" class="batch">B${String(batch.ordinal).padStart(2, "0")} · ${batch.count} frames</text>`);
    svgParts.push(`<text x="${x + 17}" y="${top + 20}" class="small">n ${batch.firstFrame}–${batch.lastFrame}</text>`);
    svgParts.push(`<text x="${x + 17}" y="${top + 40}" class="small">${batch.referenceCount} role refs</text>`);
  }
}
svgParts.push(`<text x="24" y="550" class="foot">Stable policy and batch SHA replay passed for all three held-out plans. Plan authoring remains supplied metadata; no visual sufficiency or aesthetic approval is claimed.</text>`);
const boardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">${svgParts.join("\n")}</svg>`;
const boardBytes = await sharp(Buffer.from(boardSvg, "utf8")).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
fs.writeFileSync(boardPath, boardBytes);

const result = {
  contract: "A1CrossArticleBlindSourcePlanValidation/v1",
  status: "PASS",
  phaseId: "cross-article-blind-source-plan-validation-v1",
  createdAt: "2026-09-28",
  implementation: {policyModuleSha256, batchPlannerModuleSha256: batchModuleSha256, validationScriptSha256: scriptSha256},
  fixtures: output,
  summary: {sourceCount: output.length, genreCount: new Set(output.map((item) => item.genre)).size,
    referenceCount: output.reduce((sum, item) => sum + item.referenceCount, 0),
    uniqueFrameCount: output.reduce((sum, item) => sum + item.uniqueFrameCount, 0),
    totalBatches: output.reduce((sum, item) => sum + item.batches.length, 0),
    sourceVideosDecoded: 0, imagesExtracted: 0, deterministicReplay: true,
    allRoleReferencesConserved: true, allBatchesWithin60Images: true},
  visibleArtifact: {path: path.relative(repoRoot, boardPath).split(path.sep).join("/"), sha256: sha256(boardBytes),
    bytes: boardBytes.length, width: imageWidth, height: imageHeight},
  proofBoundary: {metadataOnly: true, sourceVideoRead: false, sourceVideoDecoded: false,
    actualFramesExtracted: 0, visualApproval: "NOT_GRANTED", productionAdmission: false,
    defaultRegistryRegistered: false, formalAuthorityModified: false,
    topicSpecificRuntimeBranches: false},
  independentReview: {status: "PENDING", visualApproval: "NOT_GRANTED", productionAdmission: false},
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({...result, resultPath: path.relative(repoRoot, resultPath).split(path.sep).join("/")}, null, 2));
