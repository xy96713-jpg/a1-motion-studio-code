#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {buildProjectProvenanceIndex, buildProjectProvenanceRecord, addProjectClaimSourceSpanReview, refreshProjectProvenanceRecord} from "../apps/studio-next/src/lib/a1-project-provenance-record-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const xml = (value) => String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/test-fixtures/a1-six-unseen-articles-v1.json"), "utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(root, "work/claim-source-span-review-v1/baseline.json"), "utf8"));
assert.equal(baseline.status, "BASELINE_GAP_REPRODUCED");
assert.equal(baseline.observed.exactSourceExcerptPresent, 0);

const relations = ["SUPPORTS", "LIMITS", "SUPPORTS", "LIMITS", "CONTRADICTS", "SUPPORTS"];
const excerpts = [
  "管网漏损和计量口径会改变表面结果",
  "这次变化不能直接外推给每个人",
  "可验证恢复比看见备份文件更重要",
  "先锁定光线，再调整人物肤色和背景层次",
  "讨论只会制造完成感",
  "没有问题意识，收藏只是推迟判断",
];
const rows = [];
const records = [];
for (let index = 0; index < fixtures.articles.length; index += 1) {
  const article = fixtures.articles[index];
  const projectId = "claim-span-" + article.id;
  const shotId = article.id + "-claim";
  const claimText = article.shots[2];
  const evidenceId = "source-" + article.id;
  const sourceSha256 = sha(article.id + "-source-image-bytes");
  const sourceUrl = "/generated/projects/" + projectId + "/source.png";
  const assets = [{id: evidenceId, name: article.id + ".png", materialDuty: "verified-source",
    binding: {status: "bound", publicUrl: sourceUrl, sha256: sourceSha256, sourceType: "user-owned-article-screenshot", rights: "permission-not-verified"},
    output: {publicUrl: sourceUrl, sha256: sourceSha256}, outputReview: {status: "approved", note: "image reviewed"},
    sourceIdentity: {originalFileName: article.id + ".png", sourceUri: sourceUrl, slotKind: "article-screenshot"},
    sourceMetadata: {mimeType: "image/png", extension: ".png", sizeBytes: 1024, width: 640, height: 360, probeStatus: "complete"}}];
  const shot = {shotId, chapterId: "C01", cueIds: [3], sourceText: claimText, viewerTakeaway: claimText};
  const record = buildProjectProvenanceRecord({projectId, materialId: "proof-" + article.id, usedByShotIds: [shotId], sourceEvidenceIds: [evidenceId], shots: [shot], assets});
  assert.equal(record.status, "READY_FOR_PROVENANCE_RECORD");
  const reviewed = addProjectClaimSourceSpanReview({record, claimId: record.claims[0].claimId, evidenceId, sourceSha256,
    excerpt: excerpts[index], locator: index === 1 ? "PDF p. 4 · Results paragraph 2" : "source capture · paragraph 3",
    relation: relations[index], transcriptionVerified: true, assessmentNote: "I visually checked the source and assessed the passage relation.", reviewedBy: "user", reviewedAt: "2026-09-27T09:00:00.000Z"});
  const span = reviewed.spanReviews[0];
  assert.equal(span.status, "ASSESSMENT_RECORDED");
  assert.equal(span.sourceSha256, sourceSha256);
  assert.equal(span.excerptSha256, sha(excerpts[index]));
  assert.equal(span.transcriptionStatus, "VISUALLY_TRANSCRIBED_AND_CONFIRMED");
  assert.equal(span.factualClaimApproval, "NOT_APPROVED");
  assert.equal(span.rightsApproval, false);
  assert.equal(reviewed.reviewBoundary.factualClaimsApproved, false);
  assert.equal(reviewed.claims[0].factualReviewStatus, "SOURCE_SPAN_ASSESSED_NOT_APPROVED");
  assert.throws(() => addProjectClaimSourceSpanReview({record: reviewed, claimId: span.claimId, evidenceId, sourceSha256, excerpt: excerpts[index], locator: span.locator, relation: relations[index], transcriptionVerified: true, assessmentNote: "duplicate"}), /review-duplicate/u);
  records.push(reviewed);
  rows.push({id: article.id, genre: article.genre, claimText, excerpt: span.excerpt, locator: span.locator, relation: span.relation,
    sourceSha256, excerptSha256: span.excerptSha256, transcriptionStatus: span.transcriptionStatus, reviewedBy: span.reviewedBy, reviewedAt: span.reviewedAt,
    factualClaimApproval: span.factualClaimApproval, rightsApproval: span.rightsApproval});
}

const source = records[0].sources[0];
const baseInput = {record: records[0], claimId: records[0].claims[0].claimId, evidenceId: source.evidenceId, sourceSha256: source.source.sourceSha256, locator: "page 1", relation: "SUPPORTS", transcriptionVerified: true, assessmentNote: "checked"};
assert.throws(() => addProjectClaimSourceSpanReview({...baseInput, excerpt: ""}), /excerpt-required/u);
assert.throws(() => addProjectClaimSourceSpanReview({...baseInput, excerpt: "quote", locator: ""}), /locator-required/u);
assert.throws(() => addProjectClaimSourceSpanReview({...baseInput, excerpt: "quote", relation: "AUTO_APPROVE"}), /relation-invalid/u);
assert.throws(() => addProjectClaimSourceSpanReview({...baseInput, excerpt: "quote", sourceSha256: "f".repeat(64)}), /source-sha-mismatch/u);
assert.throws(() => addProjectClaimSourceSpanReview({...baseInput, excerpt: "quote", transcriptionVerified: false}), /transcription-review-required/u);
const staleAssets = [{id: source.evidenceId, name: "source.png", materialDuty: "verified-source", binding: {status: "bound", publicUrl: source.source.sourceUri, sha256: "e".repeat(64), rights: "permission-not-verified"}, output: {publicUrl: source.source.sourceUri, sha256: "e".repeat(64)}, outputReview: {status: "approved"}}];
const stale = refreshProjectProvenanceRecord(records[0], staleAssets);
assert.equal(stale.spanReviews[0].status, "STALE_SOURCE_SHA");
assert.equal(stale.claims[0].sourceSpanAssessmentStatus, "NOT_ASSESSED");
assert.equal(stale.reviewBoundary.factualClaimsApproved, false);
const index = buildProjectProvenanceIndex("claim-span-index", records);
assert.equal(index.sourceSpanReviewCount, 6);
assert.equal(index.staleSourceSpanReviewCount, 0);
assert.equal(index.factualApprovalCount, 0);

const width = 620, height = 350, gap = 18, columns = 3, rowsCount = 2;
const boardWidth = columns * width + (columns + 1) * gap, boardHeight = 64 + rowsCount * (height + gap) + gap;
const cards = rows.map((row, itemIndex) => {
  const x = gap + (itemIndex % columns) * (width + gap);
  const y = 64 + gap + Math.floor(itemIndex / columns) * (height + gap);
  const card = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><rect width="100%" height="100%" rx="5" fill="#111617" stroke="#3e4b48"/><text x="20" y="30" fill="#8fd6dc" font-family="Arial" font-size="12">' + xml(row.genre) + " · " + xml(row.id) + '</text><text x="20" y="62" fill="#6e7b74" font-family="Arial" font-size="10">CLAIM</text><text x="20" y="84" fill="#e5e8e1" font-family="Arial" font-size="13">' + xml(row.claimText) + '</text><line x1="20" y1="101" x2="600" y2="101" stroke="#283234"/><text x="20" y="125" fill="#6e7b74" font-family="Arial" font-size="10">USER-TRANSCRIBED SOURCE SPAN · ' + xml(row.relation) + '</text><text x="20" y="151" fill="#e5e8e1" font-family="Arial" font-size="13">' + xml(row.excerpt) + '</text><text x="20" y="179" fill="#8b9690" font-family="Arial" font-size="10">LOCATOR · ' + xml(row.locator) + '</text><text x="20" y="208" fill="#8b9690" font-family="Arial" font-size="10">SOURCE SHA · ' + xml(row.sourceSha256.slice(0, 24)) + '</text><text x="20" y="236" fill="#8b9690" font-family="Arial" font-size="10">EXCERPT SHA · ' + xml(row.excerptSha256.slice(0, 24)) + '</text><text x="20" y="281" fill="#d7b579" font-family="Arial" font-size="10">FACTUAL CLAIM NOT_APPROVED · RIGHTS REVIEW REQUIRED</text><text x="20" y="319" fill="#8fd6dc" font-family="Arial" font-size="10">ASSESSMENT RECORDED · NO AUTO-APPROVAL</text></svg>';
  return {input: Buffer.from(card), left: x, top: y};
});
const reviewerNotes = rows.map((row, itemIndex) => {
  const x = gap + (itemIndex % columns) * (width + gap);
  const y = 64 + gap + Math.floor(itemIndex / columns) * (height + gap);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><text x="20" y="260" fill="#8b9690" font-family="Arial" font-size="9">' + xml(row.transcriptionStatus) + ' · ' + xml(row.reviewedBy) + ' · ' + xml(row.reviewedAt) + '</text></svg>';
  return {input: Buffer.from(svg), left: x, top: y};
});
const headerSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + boardWidth + '" height="64"><rect width="100%" height="100%" fill="#080a0b"/><text x="' + gap + '" y="28" fill="#eee9dc" font-family="Arial" font-size="18">CLAIM ↔ SOURCE SPAN REVIEW · HUMAN ASSESSMENT ONLY</text><text x="' + gap + '" y="49" fill="#8fd6dc" font-family="Arial" font-size="10">SYNTHETIC SOURCES · SUPPORT / LIMIT / CONTRADICT / INSUFFICIENT</text></svg>';
const png = await sharp({create: {width: boardWidth, height: boardHeight, channels: 4, background: "#080a0b"}}).composite([{input: Buffer.from(headerSvg), left: 0, top: 0}, ...cards, ...reviewerNotes]).png().toBuffer();
const boardPath = path.join(root, "work/claim-source-span-review-v1/claim-span-review-board.png");
fs.writeFileSync(boardPath, png);
const result = {contract: "A1ClaimSourceSpanReviewTest/v1", status: "PASS", fixtureCount: rows.length, genreCount: new Set(rows.map((row) => row.genre)).size, fixtures: rows,
  checks: {sourceSpanBoundToCurrentSha: true, exactExcerptHasHash: true, locatorRequired: true, transcriptionConfirmationRequired: true, relationEnumBounded: true,
    duplicatesRejected: true, staleShaInvalidatesAssessment: true, factualApprovalNeverGranted: true, rightsReviewRemainsSeparate: true, productionAdmission: false},
  visibleArtifact: path.relative(root, boardPath), visibleArtifactSha256: sha(png)};
const out = path.join(root, "work/claim-source-span-review-v1/result.json");
fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtureCount, genreCount: result.genreCount, checks: result.checks, visibleArtifact: result.visibleArtifact, result: path.relative(root, out)}, null, 2));
