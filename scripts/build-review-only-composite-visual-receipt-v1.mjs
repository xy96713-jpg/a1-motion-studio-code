#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {createA1NodeVisualReviewStatementV1, assertA1NodeVisualReviewStatementV1} from "../apps/studio-next/src/lib/a1-node-visual-review-statement-v1.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRequire = createRequire(path.join(ROOT, "apps/studio-next/package.json"));
const sharp = appRequire("sharp");
const SOURCE_DIR = path.join(ROOT, "work/director-plan-to-composite-dag-v1");
const OUTPUT_DIR = path.join(ROOT, "work/review-only-composite-visual-receipt-v1");
const SOURCE_RESULT_PATH = path.join(SOURCE_DIR, "result.json");
const SOURCE_REVIEW_PATH = path.join(SOURCE_DIR, "independent-review-v1.json");
const SOURCE_RESULT_RELATIVE = "work/director-plan-to-composite-dag-v1/result.json";
const SOURCE_REVIEW_RELATIVE = "work/director-plan-to-composite-dag-v1/independent-review-v1.json";
const CONTACT_SHEET_PATH = path.join(ROOT, "work/director-plan-to-composite-dag-v1/composite-contact-sheet.png");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function readJson(filename) {
  const bytes = fs.readFileSync(filename);
  return {bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes)};
}

function ensureRelativeFile(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.posix.isAbsolute(relativePath)
    || /[\\\0]/u.test(relativePath) || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("VISUAL_REVIEW_ARTIFACT_PATH_INVALID");
  }
  const rootReal = fs.realpathSync(root);
  const requested = path.resolve(rootReal, ...relativePath.split("/"));
  const relative = path.relative(rootReal, requested);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("VISUAL_REVIEW_ARTIFACT_PATH_OUTSIDE_ROOT");
  let cursor = rootReal;
  for (const segment of relativePath.split("/")) {
    cursor = path.join(cursor, segment);
    const entry = fs.lstatSync(cursor);
    if (entry.isSymbolicLink()) throw new Error("VISUAL_REVIEW_ARTIFACT_SYMLINK_FORBIDDEN");
  }
  const actualPath = fs.realpathSync(requested);
  if (!actualPath.startsWith(rootReal + path.sep)) throw new Error("VISUAL_REVIEW_ARTIFACT_PATH_OUTSIDE_ROOT");
  const stat = fs.statSync(actualPath);
  if (!stat.isFile() || stat.size < 1) throw new Error("VISUAL_REVIEW_ARTIFACT_FILE_REQUIRED");
  return {absolutePath: actualPath, bytes: fs.readFileSync(actualPath), stat};
}

function inspectAlphaPixels(data, info) {
  if (info.channels !== 4) throw new Error("VISUAL_REVIEW_RGBA_REQUIRED");
  let nonzeroAlphaPixels = 0, minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const alpha = data[(y * info.width + x) * info.channels + 3];
    if (alpha > 0) {
      nonzeroAlphaPixels += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return {nonzeroAlphaPixels, alphaBounds: maxX >= 0
    ? {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1} : null};
}

const sourceResult = readJson(SOURCE_RESULT_PATH);
const sourceReview = readJson(SOURCE_REVIEW_PATH);
const source = sourceResult.value;
const review = sourceReview.value;
assert.equal(source.contract, "A1DirectorPlanCompositeDagIntegration/v1");
assert.equal(source.status, "PASS");
assert.equal(source.scope, "SYNTHETIC_REVIEW_ONLY");
assert.equal(source.proofBoundary.visualApproval, "NOT_GRANTED");
assert.equal(source.proofBoundary.productionAdmission, false);
assert.equal(review.contract, "A1DirectorPlanCompositeDagIndependentReview/v1");
assert.equal(review.status, "PASS");
assert.equal(review.reviewedResultSha256, sourceResult.sha256);
assert.equal(review.coverage.fixtureCount, source.fixtures.length);
assert.equal(review.coverage.fixturesPass, source.fixtures.length);
assert.equal(review.pixelAndVisualChecks.fullSizePreviewsInspected, source.fixtures.length);
assert.equal(review.pixelAndVisualChecks.obviousClipping, false);
assert.equal(review.pixelAndVisualChecks.blankOutputs, false);
assert.equal(review.authorityBoundary.visualApproval, "NOT_GRANTED");
assert.equal(review.authorityBoundary.productionAdmission, false);
assert.equal(source.fixtures.length, 6);

const contactRelative = path.relative(ROOT, CONTACT_SHEET_PATH).split(path.sep).join("/");
const contactBytes = fs.readFileSync(CONTACT_SHEET_PATH);
const contactSha256 = sha256(contactBytes);
assert.equal(source.visibleArtifact.path, contactRelative);
assert.equal(contactSha256, source.visibleArtifact.sha256);
assert.equal(contactSha256, review.reviewedContactSheetSha256);

const checkedOutputs = [];
for (const fixture of source.fixtures) {
  assert.equal(fixture.status, "PASS");
  assert.equal(fixture.technicalAcceptance, "BYTES_AND_FORMAT_ONLY");
  assert.equal(fixture.visualApproval, "NOT_GRANTED");
  assert.equal(fixture.productionAdmission, false);
  assert.equal(fixture.sourceEvidenceResolved, false);
  assert.match(fixture.compositeManifestSha256, /^[a-f0-9]{64}$/u);
  assert.match(fixture.diagramManifestSha256, /^[a-f0-9]{64}$/u);
  assert.match(fixture.compositePngSha256, /^[a-f0-9]{64}$/u);
  assert.match(fixture.diagramSvgSha256, /^[a-f0-9]{64}$/u);
  const artifactRoot = path.join(SOURCE_DIR, "artifacts", fixture.id);
  const output = ensureRelativeFile(artifactRoot, fixture.previewArtifactPath);
  const outputSha256 = sha256(output.bytes);
  assert.equal(outputSha256, fixture.compositePngSha256);
  const decoded = await sharp(output.bytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const pixels = inspectAlphaPixels(decoded.data, decoded.info);
  assert.equal(decoded.info.width, fixture.pixels.width);
  assert.equal(decoded.info.height, fixture.pixels.height);
  assert.equal(decoded.info.channels, fixture.pixels.channels);
  assert.equal(pixels.nonzeroAlphaPixels, fixture.pixels.nonzeroAlphaPixels);
  assert.deepEqual(pixels.alphaBounds, fixture.pixels.alphaBounds);
  assert.ok(pixels.nonzeroAlphaPixels > 0);
  checkedOutputs.push({fixture, outputPath: path.relative(ROOT, output.absolutePath).split(path.sep).join("/"), outputSha256,
    outputBytes: output.bytes.length, pixels});
}

const normalizedReviewEvidence = {
  contract: "A1NodeVisualReviewEvidenceProjection/v1",
  status: "PASS",
  visualDecision: "PASS",
  reviewReportSha256: sourceReview.sha256,
  reviewedResultSha256: sourceResult.sha256,
  reviewedContactSheetSha256: contactSha256,
  reviewerRole: "independent-read-only-subagent",
  method: "INDEPENDENT_FULL_SIZE_PNG_INSPECTION_AND_SHA_RECHECK",
  coverage: {
    fixtureCount: review.coverage.fixtureCount,
    genreCount: review.coverage.genreCount,
    genres: review.coverage.genres,
    fixturesPass: review.coverage.fixturesPass,
  },
  pixelChecks: {
    decodedPngCount: review.pixelAndVisualChecks.decodedPngCount,
    dimensions: "1280x720",
    channels: review.pixelAndVisualChecks.channels,
    alphaBoundsMatchResultAndStayInFrame: review.pixelAndVisualChecks.alphaBoundsMatchResultAndStayInFrame,
    nonzeroAlphaPixelCountsMatchResult: review.pixelAndVisualChecks.nonzeroAlphaPixelCountsMatchResult,
    inspectedFullSizeCount: review.pixelAndVisualChecks.fullSizePreviewsInspected,
  },
  reviewChecks: {
    sourceCopyShaMatchesDiagramPlan: review.sourceCopyAndReceiptChecks.sourceCopyShaMatchesDiagramPlan,
    sourceLabelsPresentInSourceAndVisibleLabelReceipt: review.sourceCopyAndReceiptChecks.sourceLabelsPresentInSourceAndVisibleLabelReceipt,
    diagramAndCompositeManifestShasRecomputedAndMatched: review.sourceCopyAndReceiptChecks.diagramAndCompositeManifestShasRecomputedAndMatched,
    compositionPlansMatchAcceptedDiagramNodeSvgAndManifest: review.sourceCopyAndReceiptChecks.compositionPlansMatchAcceptedDiagramNodeSvgAndManifest,
  },
  outputs: checkedOutputs.map(({fixture, outputPath, outputSha256}) => ({
    fixtureId: fixture.id,
    outputPath,
    artifactSha256: outputSha256,
    compositeManifestSha256: fixture.compositeManifestSha256,
    diagramManifestSha256: fixture.diagramManifestSha256,
    decision: "PASS",
    reasonCodes: [],
    fullSizeInspected: true,
    legible: true,
    obviousClipping: false,
    blank: false,
  })),
  boundary: {visualApproval: "NOT_GRANTED", productionAdmission: false, signed: false},
};
assert.equal(normalizedReviewEvidence.reviewChecks.sourceCopyShaMatchesDiagramPlan, source.fixtures.length);
assert.equal(normalizedReviewEvidence.reviewChecks.diagramAndCompositeManifestShasRecomputedAndMatched, source.fixtures.length * 2);
assert.equal(normalizedReviewEvidence.reviewChecks.compositionPlansMatchAcceptedDiagramNodeSvgAndManifest, source.fixtures.length);
const normalizedReviewBytes = Buffer.from(`${JSON.stringify(normalizedReviewEvidence, null, 2)}\n`, "utf8");
const normalizedReviewSha256 = sha256(normalizedReviewBytes);
fs.mkdirSync(OUTPUT_DIR, {recursive: true});
const normalizedReviewPath = path.join(OUTPUT_DIR, "review-evidence-v1.json");
const normalizedReviewTemp = `${normalizedReviewPath}.${process.pid}.tmp`;
fs.writeFileSync(normalizedReviewTemp, normalizedReviewBytes);
fs.renameSync(normalizedReviewTemp, normalizedReviewPath);

const reviewerId = "independent-read-only-subagent";
const statement = createA1NodeVisualReviewStatementV1({
  result: source,
  resultSha256: sourceResult.sha256,
  reviewEvidence: normalizedReviewEvidence,
  reviewEvidenceSha256: normalizedReviewSha256,
  reviewerId,
});
assertA1NodeVisualReviewStatementV1(statement, {
  result: source,
  resultSha256: sourceResult.sha256,
  reviewEvidence: normalizedReviewEvidence,
  reviewEvidenceSha256: normalizedReviewSha256,
  reviewerId,
});

const statementPath = path.join(OUTPUT_DIR, "visual-review-statement.json");
fs.mkdirSync(OUTPUT_DIR, {recursive: true});
const statementBytes = Buffer.from(`${JSON.stringify(statement, null, 2)}\n`, "utf8");
const statementSha256 = sha256(statementBytes);
const temporary = `${statementPath}.${process.pid}.tmp`;
fs.writeFileSync(temporary, statementBytes);
fs.renameSync(temporary, statementPath);

const fixtureIdBySourceId = {
  "dag-explainer-canopy-heat-v1": "receipt-explainer-canopy-heat-v1",
  "dag-explainer-river-data-v1": "receipt-explainer-river-data-v1",
  "dag-tutorial-import-crop-v1": "receipt-tutorial-import-crop-v1",
  "dag-tutorial-review-export-v1": "receipt-tutorial-review-export-v1",
  "dag-opinion-tool-judgment-v1": "receipt-opinion-tool-judgment-v1",
  "dag-opinion-author-choice-v1": "receipt-opinion-author-choice-v1",
};
const result = {
  contract: "A1NodeVisualReviewStatementBuild/v1",
  status: "PASS",
  scope: "SYNTHETIC_REVIEW_ONLY_UNSIGNED_STATEMENT",
  fixtureCount: checkedOutputs.length,
  genreCount: new Set(source.fixtures.map((fixture) => fixture.genre)).size,
  sourceResult: {path: SOURCE_RESULT_RELATIVE, sha256: sourceResult.sha256},
  sourceReviewEvidence: {path: SOURCE_REVIEW_RELATIVE, sha256: sourceReview.sha256},
  normalizedReviewEvidence: {path: "work/review-only-composite-visual-receipt-v1/review-evidence-v1.json", sha256: normalizedReviewSha256},
  statement: {contract: statement._type, predicateType: statement.predicateType,
    path: "work/review-only-composite-visual-receipt-v1/visual-review-statement.json", sha256: statementSha256,
    subjectCount: statement.subject.length, signed: false},
  visibleArtifact: {path: contactRelative, sha256: contactSha256, width: source.visibleArtifact.width, height: source.visibleArtifact.height},
  fixtures: checkedOutputs.map(({fixture, outputPath, outputSha256, pixels}) => ({
    id: fixtureIdBySourceId[fixture.id], sourceFixtureId: fixture.id, genre: fixture.genre, status: "PASS",
    outputPath, outputSha256, diagramManifestSha256: fixture.diagramManifestSha256,
    compositeManifestSha256: fixture.compositeManifestSha256,
    technicalAcceptance: fixture.technicalAcceptance, visualReviewDecision: "PASS",
    visualApproval: "NOT_GRANTED", productionAdmission: false,
    nonzeroAlphaPixels: pixels.nonzeroAlphaPixels, alphaBounds: pixels.alphaBounds,
  })),
  proofBoundary: {resultShaBound: true, reviewEvidenceShaBound: true, eachOutputSubjectShaBound: true,
    acceptedManifestShaBound: true, technicalAcceptance: "BYTES_AND_FORMAT_ONLY",
    visualApproval: "NOT_GRANTED", productionAdmission: false, statementAuthentication: "UNSIGNED_LOCAL_REVIEW_RECORD",
    cryptographicIdentityClaim: false, realSourceOrFactualProvenance: false, productionAuthorityChanged: false},
};
const resultBytes = Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8");
const resultPath = path.join(OUTPUT_DIR, "result.json");
const resultTemp = `${resultPath}.${process.pid}.tmp`;
fs.writeFileSync(resultTemp, resultBytes);
fs.renameSync(resultTemp, resultPath);
console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtureCount, genreCount: result.genreCount,
  statementSubjectCount: statement.subject.length, statementSha256, resultSha256: sha256(resultBytes),
  sourceResultSha256: sourceResult.sha256, sourceReviewSha256: sourceReview.sha256,
  contactSheetSha256: contactSha256, output: "work/review-only-composite-visual-receipt-v1/result.json"}, null, 2));
