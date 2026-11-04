#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {compileReferenceFrameReviewPlanV1} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";
import {A1_REFERENCE_FRAME_BATCH_PLAN_V1, planReferenceFrameExtractionBatchesV1} from "../apps/studio-next/src/lib/a1-reference-frame-batch-planner-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taskRoot = path.join(repoRoot, "work/source-bound-frame-extraction-batch-planner-v1");
const planRelativePath = "work/bv1a63d6ceba-packaging-study-20260923/execution-v3/whole-film-plan.json";
const planPath = path.join(repoRoot, planRelativePath);
const baselinePath = path.join(repoRoot, "work/hupo-69-shot-reconstruction-v1/reference-frame-review-policy-hubo-plan-audit-v1.json");
const resultPath = path.join(taskRoot, "result.json");
const timelinePath = path.join(taskRoot, "batch-timeline.png");
const sharp = createRequire(path.join(repoRoot, "apps/studio-next/package.json"))("sharp");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const planBytes = fs.readFileSync(planPath);
const baselineBytes = fs.readFileSync(baselinePath);
const sourcePlan = JSON.parse(planBytes.toString("utf8"));
const sourceBaseline = JSON.parse(baselineBytes.toString("utf8"));
assert.equal(sourcePlan.contract, "HuBoFullFilmExecutionPlan/v3");
assert.equal(sourcePlan.sequencePlans.length, 69);
assert.equal(sha256(planBytes), sourceBaseline.input.planSha256, "the compiled source plan must match the recorded SHA");

const policyModulePath = path.join(repoRoot, "apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs");
const plannerModulePath = path.join(repoRoot, "apps/studio-next/src/lib/a1-reference-frame-batch-planner-v1.mjs");
const policyPlan = compileReferenceFrameReviewPlanV1({
  sourceVideoSha256: sourcePlan.source.videoSha256,
  fps: sourcePlan.source.fps,
  totalFrames: sourcePlan.source.totalFrames,
  sequences: sourcePlan.sequencePlans.map((sequence) => ({
    sequenceId: sequence.sequenceId,
    startFrame: sequence.sourceInterval.startFrame,
    endFrameExclusive: sequence.sourceInterval.endFrameExclusive,
    mode: "explicit-reference",
    anchors: (sequence.referenceFrames || []).map((frame) => ({role: frame.state, sourceFrame: frame.sourceFrame})),
  })),
});
assert.equal(policyPlan.summary.referenceCount, 441);
assert.equal(policyPlan.summary.uniqueSourceFrames, 344);
assert.equal(policyPlan.summary.reusedReferences, 97);
assert.equal(policyPlan.summary.extractedImages, 0);

const batchPlan = planReferenceFrameExtractionBatchesV1({plan: policyPlan});
assert.equal(batchPlan.contract, A1_REFERENCE_FRAME_BATCH_PLAN_V1);
assert.equal(batchPlan.sourcePlanSha256, policyPlan.sha256);
assert.equal(batchPlan.summary.sourcePlanReferenceCount, 441);
assert.equal(batchPlan.summary.uniqueSourceFrameCount, 344);
assert.equal(batchPlan.summary.batchCount, 6);
assert.equal(batchPlan.batches.length, 6);
assert.deepEqual(batchPlan.batches.map((batch) => batch.uniqueFrameCount), [60, 60, 60, 60, 60, 44]);
assert.ok(batchPlan.batches.every((batch) => batch.assets.length <= 60 && batch.assets.length + 1 <= 64));
assert.equal(batchPlan.summary.extractedImages, 0);
assert.equal(batchPlan.summary.visualApproval, false);

const batchIndexByAsset = new Map();
const batchedReferences = [];
for (const [batchIndex, batch] of batchPlan.batches.entries()) {
  const {sha256: batchSha256, ...batchBody} = batch;
  assert.equal(batchSha256, sha256(Buffer.from(JSON.stringify(batchBody), "utf8")), `${batch.id} digest`);
  assert.equal(batch.inputPlanSha256, policyPlan.sha256);
  assert.equal(batch.sourceVideoSha256, sourcePlan.source.videoSha256);
  for (const asset of batch.assets) {
    assert.equal(asset.sourceVideoSha256, sourcePlan.source.videoSha256);
    const key = `${asset.sourceVideoSha256}:${asset.sourceFrame}`;
    assert.equal(batchIndexByAsset.has(key), false, `unique source frame may appear in one batch only: ${key}`);
    batchIndexByAsset.set(key, batchIndex);
    for (const reference of asset.references) {
      batchedReferences.push(JSON.stringify([asset.sourceVideoSha256, asset.sourceFrame, reference.sequenceId,
        reference.role, reference.scope, reference.reason]));
    }
  }
}
assert.equal(batchIndexByAsset.size, 344);
const expectedReferences = policyPlan.references.map((reference) => JSON.stringify([
  sourcePlan.source.videoSha256, reference.sourceFrame, reference.sequenceId,
  reference.role, reference.scope, reference.reason,
]));
assert.deepEqual(batchedReferences.sort(), expectedReferences.sort(), "all actual source-plan roles must be conserved in exactly one batch");
const {sha256: batchPlanSha256, ...batchPlanBody} = batchPlan;
assert.equal(batchPlanSha256, sha256(Buffer.from(JSON.stringify(batchPlanBody), "utf8")), "batch-plan digest");

const palette = ["#d84a32", "#3169b3", "#198d78", "#a34a9b", "#c58519", "#526b38"];
const imageWidth = 1_760;
const rowStartY = 260;
const chartX = 170;
const chartWidth = 1_550;
const sourceFrameX = (frame) => chartX + Math.round((frame / (sourcePlan.source.totalFrames - 1)) * chartWidth);
const markerRadius = 2;
const markerLaneGap = 5;
const markerSeparationPx = 5;
const timelineRows = sourcePlan.sequencePlans.map((sequence, index) => {
  const byFrame = new Map();
  for (const reference of sequence.referenceFrames || []) {
    const marker = byFrame.get(reference.sourceFrame) || {sourceFrame: reference.sourceFrame, roles: []};
    marker.roles.push(reference.state);
    byFrame.set(reference.sourceFrame, marker);
  }
  const markers = [...byFrame.values()].sort((a, b) => a.sourceFrame - b.sourceFrame);
  const laneEnds = [];
  for (const marker of markers) {
    const x = sourceFrameX(marker.sourceFrame);
    let lane = laneEnds.findIndex((lastX) => x - lastX >= markerSeparationPx);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(Number.NEGATIVE_INFINITY); }
    marker.x = x;
    marker.lane = lane;
    laneEnds[lane] = x;
  }
  const laneCount = Math.max(1, laneEnds.length);
  const height = Math.max(15, (laneCount - 1) * markerLaneGap + 8);
  return {sequence, index, markers, laneCount, height};
});
let rowCursor = rowStartY;
for (const row of timelineRows) {
  row.top = rowCursor;
  row.centerY = rowCursor + row.height / 2;
  rowCursor += row.height;
}
const imageHeight = rowCursor + 76;
const timelineMarkerCount = timelineRows.reduce((sum, row) => sum + row.markers.length, 0);
const batchCards = batchPlan.batches.map((batch, index) => {
  const frames = batch.assets.map((asset) => asset.sourceFrame);
  const sequenceIds = new Set(batch.assets.flatMap((asset) => asset.references.map((reference) => reference.sequenceId)));
  return {ordinal: index + 1, frameCount: batch.uniqueFrameCount,
    firstFrame: Math.min(...frames), lastFrame: Math.max(...frames), sequenceCount: sequenceIds.size,
    referenceCount: batch.referenceCount, color: palette[index % palette.length]};
});

const cells = [];
const batchCardY = 116;
const cardWidth = 1_760 / batchCards.length;
for (const [index, batch] of batchCards.entries()) {
  const x = index * cardWidth;
  cells.push(`<rect x="${x + 5}" y="${batchCardY}" width="${cardWidth - 10}" height="90" rx="7" fill="#fffdf7" stroke="#ddd8cd"/>`);
  cells.push(`<rect x="${x + 5}" y="${batchCardY}" width="6" height="90" fill="${batch.color}"/>`);
  cells.push(`<text x="${x + 22}" y="${batchCardY + 24}" class="batch">BATCH ${String(batch.ordinal).padStart(2, "0")} · ${batch.frameCount} frames</text>`);
  cells.push(`<text x="${x + 22}" y="${batchCardY + 47}" class="detail">source n ${batch.firstFrame}–${batch.lastFrame}</text>`);
  cells.push(`<text x="${x + 22}" y="${batchCardY + 68}" class="detail">${batch.referenceCount} role refs · ${batch.sequenceCount} sequences</text>`);
}

for (const {sequence, index, markers, laneCount, top, centerY, height} of timelineRows) {
  const y = centerY;
  const left = sourceFrameX(sequence.sourceInterval.startFrame);
  const right = sourceFrameX(Math.max(sequence.sourceInterval.startFrame, sequence.sourceInterval.endFrameExclusive - 1));
  const fill = index % 2 === 0 ? "#eeece6" : "#f5f3ed";
  cells.push(`<rect x="0" y="${top}" width="${imageWidth}" height="${height}" fill="${fill}"/>`);
  cells.push(`<text x="16" y="${y + 3}" class="sequence">${sequence.sequenceId}</text>`);
  cells.push(`<line x1="${left}" y1="${y}" x2="${Math.max(left + 1, right)}" y2="${y}" stroke="#a7a39a" stroke-width="2"/>`);
  for (const marker of markers) {
    const batchIndex = batchIndexByAsset.get(`${sourcePlan.source.videoSha256}:${marker.sourceFrame}`);
    assert.ok(Number.isInteger(batchIndex), `sequence ${sequence.sequenceId} reference ${marker.sourceFrame} must resolve to a batch`);
    const roleText = marker.roles.map((role) => String(role).replace(/[<>&"']/gu, "")).join(", ");
    const tooltip = `${sequence.sequenceId} · ${roleText} · n=${marker.sourceFrame}`;
    const markerY = y + (marker.lane - (laneCount - 1) / 2) * markerLaneGap;
    cells.push(`<circle cx="${marker.x}" cy="${markerY}" r="${markerRadius}" fill="${palette[batchIndex % palette.length]}" stroke="#fffdf7" stroke-width="0.6"><title>${tooltip}</title></circle>`);
  }
}

const axisY = rowStartY - 18;
for (const tick of [0, 5_000, 10_000, 15_000, 20_000, 25_000, 31_286]) {
  const x = sourceFrameX(tick);
  cells.push(`<line x1="${x}" y1="${axisY + 4}" x2="${x}" y2="${imageHeight - 50}" stroke="#dfdcd3" stroke-width="1"/>`);
  cells.push(`<text x="${x}" y="${axisY - 3}" text-anchor="middle" class="axis">n=${tick}</text>`);
}

const legend = batchCards.map((batch, index) => {
  const x = 16 + index * 180;
  return `<rect x="${x}" y="31" width="10" height="10" rx="2" fill="${batch.color}"/><text x="${x + 16}" y="40" class="legend">B${String(index + 1).padStart(2, "0")}</text>`;
}).join("");
const timelineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
<rect width="100%" height="100%" fill="#f8f6f0"/>
<style>.title{font:700 24px Arial,sans-serif;fill:#17202b}.subtitle{font:13px Arial,sans-serif;fill:#606975}.batch{font:700 14px Arial,sans-serif;fill:#202a34}.detail{font:12px Arial,sans-serif;fill:#535e69}.sequence{font:700 9px Arial,sans-serif;fill:#373c41}.axis{font:10px Arial,sans-serif;fill:#626b72}.legend{font:700 10px Arial,sans-serif;fill:#323a41}.foot{font:11px Arial,sans-serif;fill:#5d6268}</style>
<text x="16" y="27" class="title">REFERENCE FRAME BATCH MAP</text>
<text x="420" y="26" class="subtitle">69 sequences · 441 role refs · 344 unique frames → 6 bounded batches · 0 images extracted</text>
${legend}
${cells.join("\n")}
<text x="16" y="${imageHeight - 18}" class="foot">Bars show sequence source intervals. Dots are planned role references, colored by deterministic batch. Metadata-only plan; formal visual approval and production admission remain false.</text>
</svg>`;
const timelineBytes = await sharp(Buffer.from(timelineSvg, "utf8")).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
fs.writeFileSync(timelinePath, timelineBytes);

const batchSummaries = batchPlan.batches.map((batch, index) => {
  const frames = batch.assets.map((asset) => asset.sourceFrame);
  return {ordinal: index + 1, id: batch.id, sha256: batch.sha256,
    uniqueFrameCount: batch.uniqueFrameCount, referenceCount: batch.referenceCount,
    sequenceCount: new Set(batch.assets.flatMap((asset) => asset.references.map((reference) => reference.sequenceId))).size,
    firstFrame: Math.min(...frames), lastFrame: Math.max(...frames),
    artifactCountIfExtracted: batch.assets.length + 1, color: palette[index % palette.length]};
});
const result = {
  contract: "A1SourceBoundFrameExtractionBatchPlanIntegration/v1",
  status: "PASS",
  phaseId: "source-bound-frame-extraction-batch-planner-v1",
  createdAt: "2026-09-28",
  input: {planPath: planRelativePath, planFileSha256: sha256(planBytes), baselineAuditPath:
    path.relative(repoRoot, baselinePath).split(path.sep).join("/"), baselineAuditSha256: sha256(baselineBytes),
    referencePlanSha256: policyPlan.sha256, referencePolicyModuleSha256: sha256(fs.readFileSync(policyModulePath)),
    batchPlannerModuleSha256: sha256(fs.readFileSync(plannerModulePath)),
    sourceVideoSha256: sourcePlan.source.videoSha256, fps: sourcePlan.source.fps, totalFrames: sourcePlan.source.totalFrames},
  summary: {sequenceCount: sourcePlan.sequencePlans.length, referenceCount: policyPlan.summary.referenceCount,
    uniqueFrameCount: policyPlan.summary.uniqueSourceFrames, reusedReferences: policyPlan.summary.reusedReferences,
    conservedBatchedReferences: batchedReferences.length,
    distinctTimelineMarkers: timelineMarkerCount,
    batchCount: batchPlan.summary.batchCount, perBatchImageLimit: 60,
    maxArtifactCount: 64, largestBatch: Math.max(...batchPlan.batches.map((batch) => batch.uniqueFrameCount)),
    extractedImages: 0, sourceVideoDecoded: false},
  batchPlanSha256: batchPlan.sha256,
  fixtures: [
    {id: "batch-evidence-explainer", genre: "evidence-explainer", status: "PASS", evidence: "scripts/test-a1-reference-frame-batch-planner-v1.mjs"},
    {id: "batch-product-tutorial", genre: "product-tutorial", status: "PASS", evidence: "scripts/test-a1-reference-frame-batch-planner-v1.mjs"},
    {id: "batch-personal-opinion", genre: "personal-opinion", status: "PASS", evidence: "scripts/test-a1-reference-frame-batch-planner-v1.mjs"},
  ],
  batches: batchSummaries,
  visibleArtifact: {path: path.relative(repoRoot, timelinePath).split(path.sep).join("/"), sha256: sha256(timelineBytes),
    bytes: timelineBytes.length, width: imageWidth, height: imageHeight},
  proofBoundary: {sourcePlanRead: true, sourceVideoRead: false, imageExtractionPerformed: false,
    humanImageReview: false, visualApproval: "NOT_GRANTED", productionAdmission: false,
    defaultRegistryRegistered: false, formalAuthorityModified: false},
  independentReview: {status: "PENDING", visualApproval: "NOT_GRANTED", productionAdmission: false},
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({...result, resultPath: path.relative(repoRoot, resultPath).split(path.sep).join("/")}, null, 2));
