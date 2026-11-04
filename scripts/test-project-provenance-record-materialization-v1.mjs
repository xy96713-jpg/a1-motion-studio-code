#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {buildProjectMaterializationPlan} from "../apps/studio-next/src/lib/a1-project-materialization-v1.mjs";
import {buildProjectProvenanceIndex, resolveProjectEvidenceIds} from "../apps/studio-next/src/lib/a1-project-provenance-record-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const escapeXml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/test-fixtures/a1-six-unseen-articles-v1.json"), "utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(root, "work/project-provenance-record-materialization-v1/baseline.json"), "utf8"));
assert.equal(baseline.status, "BASELINE_GAP_REPRODUCED");
assert.equal(baseline.gaps.claimReferencesMissing, 6);
assert.equal(baseline.gaps.ambiguousEvidenceIdIncorrectlyAccepted, true);
const pack = {projectId: "provenance-canary", source: {articleSha256: "a".repeat(64)}, sha256: "b".repeat(64),
  assetRequirementGraph: {contract: "A1ArticleAssetRequirementGraph/v1", requirements: []}, shotBlueprints: []};
const assets = [];
for (const article of fixtures.articles) {
  const shotId = `${article.id}-claim`;
  const evidenceId = `source-${article.id}`;
  const claimText = article.shots[2];
  pack.shotBlueprints.push({shotId, sourceText: claimText, viewerTakeaway: claimText, chapterId: "C01", cueIds: [1]});
  pack.assetRequirementGraph.requirements.push({materialId: `proof-${article.id}`, duty: "provenance-record", sourceEvidenceIds: [evidenceId], usedByShotIds: [shotId]});
  const outputSha = sha(`${article.id}-source-bytes`);
  assets.push({id: evidenceId, name: `source file · ${article.id}`, materialDuty: "verified-source", sourcePolicy: "verified-source-and-rights-review-required",
    binding: {status: "bound", publicUrl: `/projects/provenance-canary/source-${article.id}.png`, sha256: outputSha, sourceType: "user-owned-article-screenshot", rights: "user-provided:permission-not-verified", slotKind: "article-screenshot"},
    output: {publicUrl: `/projects/provenance-canary/source-${article.id}.png`, sha256: outputSha},
    outputReview: {status: "approved", note: "来源文件外观和可读性已复核", reviewedBy: "user"},
    sourceIdentity: {originalFileName: `${article.id}.png`, sourceUri: `/projects/provenance-canary/source-${article.id}.png`, slotKind: "article-screenshot"},
    sourceMetadata: {originalFileName: `${article.id}.png`, mimeType: "image/png", extension: ".png", sizeBytes: 4096, width: 640, height: 360, probeStatus: "complete"}});
}
const plan = buildProjectMaterializationPlan({pack, assets});
assert.equal(plan.records.length, 6);
assert.ok(plan.records.every((item) => item.status === "READY_FOR_PROVENANCE_RECORD"));
const rows = plan.records.map((materialization) => {
  const record = materialization.payload.record;
  const articleId = materialization.usedByShotIds[0].replace(/-claim$/u, "");
  const source = record.sources[0].source;
  assert.equal(record.claims.length, 1, articleId);
  assert.equal(record.claims[0].claimText, pack.shotBlueprints.find((shot) => shot.shotId === record.claims[0].shotId).viewerTakeaway);
  assert.equal(record.claims[0].evidenceRelation, "REFERENCED_FOR_REVIEW");
  assert.equal(record.claims[0].factualReviewStatus, "NOT_FACTUALLY_REVIEWED");
  assert.equal(record.reviewBoundary.factualClaimsApproved, false);
  assert.equal(record.reviewBoundary.sourceIdentityStatus, "USER_DECLARED");
  assert.equal(record.reviewBoundary.sourceIdentityVerified, false);
  assert.equal(source.sourceName, `${articleId}.png`);
  assert.equal(source.sourceSha256, assets.find((asset) => asset.id === record.sources[0].evidenceId).binding.sha256);
  assert.equal(source.rights.declaration, "user-provided:permission-not-verified");
  assert.equal(source.rights.reviewStatus, "REVIEW_REQUIRED");
  assert.equal(source.rights.rightsApproved, false);
  assert.equal(record.recordSha256, sha(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "recordSha256"))));
  return {id: articleId, genre: fixtures.articles.find((item) => item.id === articleId).genre, status: "PASS", claimText: record.claims[0].claimText,
    evidenceId: record.sources[0].evidenceId, sourceName: source.sourceName, sourceSha256: source.sourceSha256,
    sourceReviewStatus: source.sourceReview.status, rightsStatus: source.rights.reviewStatus, factualReviewStatus: record.claims[0].factualReviewStatus,
    recordSha256: record.recordSha256, bindingSha256: materialization.bindingSha256};
});

const emptyIds = buildProjectMaterializationPlan({pack: {...pack, projectId: "no-evidence", assetRequirementGraph: {contract: "A1ArticleAssetRequirementGraph/v1", requirements: [{materialId: "proof-empty", duty: "provenance-record", sourceEvidenceIds: [], usedByShotIds: [pack.shotBlueprints[0].shotId]}]}}, assets});
assert.ok(emptyIds.records[0].blockers.includes("PROVENANCE_EVIDENCE_IDS_REQUIRED"));
const missingPack = structuredClone(pack);
missingPack.assetRequirementGraph.requirements = [{materialId: "proof-missing", duty: "provenance-record", sourceEvidenceIds: ["missing-source"], usedByShotIds: [pack.shotBlueprints[0].shotId]}];
assert.ok(buildProjectMaterializationPlan({pack: missingPack, assets}).records[0].blockers.includes("PROVENANCE_EVIDENCE_SOURCE_NOT_FOUND"));
const ambiguous = resolveProjectEvidenceIds({evidenceIds: ["ambiguous-source"], assets: [
  {...assets[0], id: "copy-a", name: "ambiguous-source"}, {...assets[1], id: "copy-b", name: "ambiguous-source"},
]});
assert.ok(ambiguous.blockers.includes("PROVENANCE_EVIDENCE_ID_AMBIGUOUS"));
const duplicateIds = resolveProjectEvidenceIds({evidenceIds: [assets[0].id, assets[0].id], assets});
assert.ok(duplicateIds.blockers.includes("PROVENANCE_EVIDENCE_ID_DUPLICATE"));
const pendingSource = structuredClone(assets);
pendingSource[0].outputReview.status = "pending";
assert.ok(resolveProjectEvidenceIds({evidenceIds: [assets[0].id], assets: pendingSource}).blockers.includes("PROVENANCE_EVIDENCE_SOURCE_NOT_BOUND_AND_REVIEWED"));
const shaMismatch = structuredClone(assets);
shaMismatch[0].output.sha256 = "f".repeat(64);
assert.ok(resolveProjectEvidenceIds({evidenceIds: [assets[0].id], assets: shaMismatch}).blockers.includes("PROVENANCE_EVIDENCE_SOURCE_SHA_OR_URI_MISMATCH"));
const badDuty = structuredClone(assets);
badDuty[0].materialDuty = "generated-visual";
assert.ok(resolveProjectEvidenceIds({evidenceIds: [assets[0].id], assets: badDuty}).blockers.includes("PROVENANCE_EVIDENCE_SOURCE_DUTY_INVALID"));
const provenanceIndex = buildProjectProvenanceIndex(pack.projectId, plan.records.map((item) => item.payload.record));
assert.equal(provenanceIndex.recordCount, 6);
assert.equal(provenanceIndex.factualApprovalCount, 0);

const W = 620, H = 350, G = 18, cols = 3, rowsCount = 2;
const boardW = cols * W + (cols + 1) * G, boardH = 64 + rowsCount * (H + G) + G;
const wrap = (value, length) => {
  const chars = [...String(value || "")];
  const lines = [];
  while (chars.length) lines.push(chars.splice(0, length).join(""));
  return lines.slice(0, 3);
};
const layers = [];
for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index], x = G + (index % cols) * (W + G), y = 64 + G + Math.floor(index / cols) * (H + G);
  const claimLines = wrap(row.claimText, 23);
  const claimSvg = claimLines.map((line, lineIndex) => `<text x="22" y="${98 + lineIndex * 20}" fill="#e5e7df" font-family="Arial" font-size="16">${escapeXml(line)}</text>`).join("");
  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" rx="5" fill="#121718" stroke="#3d5355"/><text x="22" y="34" fill="#8fd6dc" font-family="Arial" font-size="13">${escapeXml(row.genre)} · ${escapeXml(row.id)}</text><text x="22" y="70" fill="#7c8580" font-family="Arial" font-size="11">CLAIM · NOT FACTUALLY REVIEWED</text>${claimSvg}<line x1="22" y1="144" x2="598" y2="144" stroke="#283234"/><text x="22" y="173" fill="#e5e7df" font-family="Arial" font-size="14">SOURCE · ${escapeXml(row.sourceName)}</text><text x="22" y="198" fill="#8b9390" font-family="Arial" font-size="11">${escapeXml(row.evidenceId)}</text><text x="22" y="226" fill="#8b9390" font-family="Arial" font-size="10">SHA256 · ${escapeXml(row.sourceSha256.slice(0, 32))}</text><text x="22" y="261" fill="#d7b579" font-family="Arial" font-size="11">RIGHTS · ${escapeXml(row.rightsStatus)} · DECLARATION ONLY</text><text x="22" y="289" fill="#9ca6a1" font-family="Arial" font-size="11">SOURCE REVIEW · ${escapeXml(row.sourceReviewStatus)}</text><text x="22" y="324" fill="#d7b579" font-family="Arial" font-size="10">FACTS ${escapeXml(row.factualReviewStatus)} · RECEIPT ${escapeXml(row.status)}</text></svg>`;
  layers.push({input: Buffer.from(card), left: x, top: y});
}
const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boardW}" height="64"><rect width="100%" height="100%" fill="#080a0b"/><text x="${G}" y="27" fill="#eee9dc" font-family="Arial" font-size="19">PROJECT EVIDENCE RECEIPTS · SOURCE BYTES ≠ FACT APPROVAL</text><text x="${G}" y="49" fill="#8fd6dc" font-family="Arial" font-size="10">SYNTHETIC REVIEW ONLY · RIGHTS DECLARATIONS ARE NOT CLEARANCE</text></svg>`);
const board = await sharp({create: {width: boardW, height: boardH, channels: 4, background: "#080a0b"}}).composite([{input: header, left: 0, top: 0}, ...layers]).png().toBuffer();
const boardPath = path.join(root, "work/project-provenance-record-materialization-v1/evidence-receipt-board.png");
fs.writeFileSync(boardPath, board);
const result = {contract: "A1ProjectProvenanceRecordMaterializationTest/v1", status: "PASS", fixtureCount: rows.length, genreCount: new Set(rows.map((row) => row.genre)).size, fixtures: rows,
  checks: {sourceClaimsHashBound: true, sourceIdentitySeparatedFromVerification: true, rightsDeclarationNotApproval: true, factualReviewNeverAutoApproved: true,
    missingEvidenceBlocks: true, duplicateEvidenceIdBlocks: true, ambiguousEvidenceIdBlocks: true, sourceReviewRequired: true, sourceShaMismatchBlocks: true, unsupportedSourceDutyBlocks: true,
    projectProvenanceIndexHashBound: true, productionAdmission: false}, contactSheet: path.relative(root, boardPath), contactSheetSha256: sha(board)};
const out = path.join(root, "work/project-provenance-record-materialization-v1/result.json");
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtureCount, genreCount: result.genreCount, checks: result.checks, contactSheet: result.contactSheet, result: path.relative(root, out)}, null, 2));
