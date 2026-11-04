#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = path.join(root, "work/asset-treatment-orchestrator-v1");
const render = JSON.parse(fs.readFileSync(path.join(outputRoot, "render-result.json"), "utf8"));
const visualReview = JSON.parse(fs.readFileSync(path.join(outputRoot, "actual-pixel-review.json"), "utf8"));
const failures = [];
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

if (render.fixtures?.length !== 16) failures.push("SIXTEEN_ROUTING_FIXTURES_REQUIRED");
const genres = new Set((render.fixtures || []).map((row) => row.genre));
if (genres.size < 3) failures.push(`GENRE_DIVERSITY_BELOW_3:${genres.size}`);
for (const row of render.fixtures || []) {
  const decision = row.decision;
  if (decision.semantics?.derivedAutomatically !== true || !decision.semantics?.axes) failures.push(`SEMANTIC_DERIVATION_FAILED:${row.id}`);
  if (decision.boundaries?.automaticDecision !== true || decision.boundaries?.cleanMasterPreserved !== true || decision.boundaries?.titleRendered !== false || decision.boundaries?.backgroundGenerated !== false || decision.boundaries?.productionAdmission !== false) failures.push(`DECISION_BOUNDARY_FAILED:${row.id}`);
  if (decision.presentation.cutout && decision.presentation.alphaVerified !== true) failures.push(`UNVERIFIED_CUTOUT:${row.id}`);
  if (decision.source.authoritativeEvidence && (decision.presentation.mode !== "EVIDENCE_PRESERVE" || decision.art.selectedTreatment !== "CLEAN")) failures.push(`EVIDENCE_NOT_PRESERVED:${row.id}`);
  if (decision.art.selectedTreatment !== "CLEAN" && (decision.art.score < 5 || !decision.art.reasons.length)) failures.push(`UNJUSTIFIED_ART_TREATMENT:${row.id}`);
  if (decision.sequence.stylizedCountInWindow >= 3 && decision.art.selectedTreatment !== "CLEAN") failures.push(`SEQUENCE_STYLE_BUDGET_FAILED:${row.id}`);
  if (decision.sequence.recentTreatments.includes(decision.art.selectedTreatment) && decision.art.selectedTreatment !== "CLEAN") failures.push(`RECENT_TREATMENT_REPEAT_FAILED:${row.id}`);
  const cleanFile = path.join(root, row.cleanAsset.relativePath || "");
  const artifactFile = path.join(root, row.artifact.path || "");
  if (!fs.existsSync(cleanFile) || shaFile(cleanFile) !== row.cleanAsset.sha256) failures.push(`CLEAN_ASSET_SHA_FAILED:${row.id}`);
  if (!fs.existsSync(artifactFile) || shaFile(artifactFile) !== row.artifact.sha256) failures.push(`ARTIFACT_SHA_FAILED:${row.id}`);
  if (decision.source.authoritativeEvidence && row.artifact.sha256 !== row.cleanAsset.sha256) failures.push(`EVIDENCE_OUTPUT_NOT_BYTE_IDENTICAL:${row.id}`);
}
const expected = {
  "person-busy-identity": ["CUTOUT", "OUTLINE", "CLEAN"],
  "object-plane-explainer": ["CUTOUT", "SHADOW", "CLEAN"],
  "person-no-matte-fallback": ["SOURCE_RECT", "DEFAULT", "CLEAN"],
  "document-evidence": ["EVIDENCE_PRESERVE", "DEFAULT", "CLEAN"],
  "archive-historical": ["ARCHIVE_PRINT", "DEFAULT", "INK_MONO"],
  "science-blueprint": ["SOURCE_RECT", "DEFAULT", "CYANOTYPE_CONTACT"],
  "digital-signal": ["CUTOUT", "CLEAN", "ATKINSON_GRAIN"],
  "conflict-duplicate": ["CUTOUT", "CLEAN", "PRINT_MISREGISTER"],
  "fractured-scene": ["SOURCE_RECT", "DEFAULT", "TORN_PAPER_EDGE"],
  "plain-scene": ["SOURCE_RECT", "DEFAULT", "CLEAN"],
  "sequence-budget-clean": ["SOURCE_RECT", "DEFAULT", "CLEAN"],
  "recent-repeat-clean": ["CUTOUT", "CLEAN", "CLEAN"],
  "concept-bridge-duotone": ["CUTOUT", "CLEAN", "SPOT_DUOTONE"],
  "archive-repeat-xerox": ["ARCHIVE_PRINT", "DEFAULT", "XEROX_GRAIN"],
  "person-echo-halftone": ["CUTOUT", "CLEAN", "HALFTONE_ECHO"],
  "technical-abstraction-dither": ["CUTOUT", "CLEAN", "DITHER_1BIT"],
};
for (const row of render.fixtures || []) {
  const actual = [row.decision.presentation.mode, row.decision.separation.effectIntent, row.decision.art.selectedTreatment];
  if (JSON.stringify(actual) !== JSON.stringify(expected[row.id])) failures.push(`EXPECTED_DECISION_FAILED:${row.id}:${actual.join("/")}`);
}
const board = path.join(root, render.visibleArtifact?.path || "");
if (!fs.existsSync(board) || shaFile(board) !== render.visibleArtifact.sha256) failures.push("VISIBLE_BOARD_SHA_FAILED");
else {
  const metadata = await sharp(board).metadata();
  if (Number(metadata.width || 0) !== render.visibleArtifact.width || Number(metadata.height || 0) !== render.visibleArtifact.height) failures.push("VISIBLE_BOARD_DIMENSIONS_FAILED");
}
const separationProof = path.join(root, render.separationProof?.path || "");
if (!fs.existsSync(separationProof) || shaFile(separationProof) !== render.separationProof.sha256) failures.push("SEPARATION_PROOF_SHA_FAILED");
else {
  const metadata = await sharp(separationProof).metadata();
  if (Number(metadata.width || 0) !== render.separationProof.width || Number(metadata.height || 0) !== render.separationProof.height) failures.push("SEPARATION_PROOF_DIMENSIONS_FAILED");
}
if (render.boundary?.authorityUnchanged !== true || render.boundary?.workbenchBindingPerformed !== false || render.boundary?.productionAdmission !== false) failures.push("FORMAL_AUTHORITY_BOUNDARY_FAILED");
if (visualReview.status !== "PASS_WITH_LIMITS" || visualReview.workbenchBindingAllowed !== false || visualReview.productionAdmission !== false) failures.push("ACTUAL_PIXEL_REVIEW_BOUNDARY_FAILED");
if (visualReview.authorityFreshness?.workspaceFileSha256 !== render.boundary.authoritySnapshot.workspace || visualReview.authorityFreshness?.actualWorkspaceIdentitySha256 !== render.boundary.workspaceIdentitySha256 || visualReview.authorityFreshness?.projectedWorkspaceSha256 !== render.boundary.projectedWorkspaceSha256 || visualReview.authorityFreshness?.currentAuthorityAuditFresh !== render.boundary.currentAuthorityAuditFresh) failures.push("AUTHORITY_FRESHNESS_REVIEW_MISMATCH");

const result = {
  contract: "A1AssetTreatmentOrchestratorQualification/v1",
  status: failures.length ? "FAIL" : "PASS",
  fixtures: render.fixtures,
  coverage: {
    fixtureCount: render.fixtures.length,
    genres: [...genres],
    presentationModes: [...new Set(render.fixtures.map((row) => row.decision.presentation.mode))],
    separationIntents: [...new Set(render.fixtures.map((row) => row.decision.separation.effectIntent))],
    artTreatments: [...new Set(render.fixtures.map((row) => row.decision.art.selectedTreatment))],
    cutoutCount: render.fixtures.filter((row) => row.decision.presentation.cutout).length,
    cleanFallbackCount: render.fixtures.filter((row) => row.decision.art.selectedTreatment === "CLEAN").length,
    evidencePreserveCount: render.fixtures.filter((row) => row.decision.source.authoritativeEvidence && row.decision.art.selectedTreatment === "CLEAN").length,
    sequenceSuppressionCount: render.fixtures.filter((row) => row.decision.art.reasons.some((reason) => reason.includes("BUDGET") || reason.includes("THRESHOLD"))).length,
    automaticallyDerivedSemanticCount: render.fixtures.filter((row) => row.decision.semantics.derivedAutomatically).length,
  },
  visibleArtifact: render.visibleArtifact,
  separationProof: render.separationProof,
  actualPixelReview: visualReview,
  boundary: render.boundary,
  failures,
};
fs.writeFileSync(path.join(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, coverage: result.coverage, visibleArtifact: result.visibleArtifact, boundary: result.boundary, failures}, null, 2));
if (failures.length) process.exitCode = 1;
