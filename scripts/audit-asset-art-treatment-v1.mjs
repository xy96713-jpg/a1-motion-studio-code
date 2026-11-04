#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = path.join(root, "work/asset-art-treatment-v1");
const render = JSON.parse(fs.readFileSync(path.join(outputRoot, "render-result.json"), "utf8"));
const visualReview = JSON.parse(fs.readFileSync(path.join(outputRoot, "actual-pixel-review.json"), "utf8"));
const failures = [];
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const secondaryOnly = new Set(["XEROX_GRAIN", "HALFTONE_ECHO", "DITHER_1BIT", "PRINT_MISREGISTER"]);

if (render.fixtures?.length !== 7) failures.push("SEVEN_TREATMENT_FIXTURES_REQUIRED");
const treatments = new Set((render.fixtures || []).map((row) => row.treatment));
if (treatments.size !== 7) failures.push(`TREATMENT_COVERAGE_FAILED:${treatments.size}`);
const genres = new Set((render.fixtures || []).map((row) => row.genre));
if (genres.size < 3) failures.push(`GENRE_DIVERSITY_BELOW_3:${genres.size}`);
for (const row of render.fixtures || []) {
  if (row.boundaries?.assetOnly !== true || row.boundaries?.fixedCardRatio !== false || row.boundaries?.backgroundGenerated !== false || row.boundaries?.titleRendered !== false || row.boundaries?.productionAdmission !== false) failures.push(`ART_TREATMENT_SCOPE_FAILED:${row.id}`);
  if (secondaryOnly.has(row.treatment) && row.outputRole !== "SECONDARY") failures.push(`SECONDARY_ONLY_TREATMENT_LEAK:${row.id}`);
  const cleanFile = path.join(root, row.cleanAsset.path || "");
  const artifactFile = path.join(root, row.artifact.path || "");
  if (!fs.existsSync(cleanFile) || shaFile(cleanFile) !== row.cleanAsset.sha256) failures.push(`CLEAN_MASTER_SHA_FAILED:${row.id}`);
  if (!fs.existsSync(artifactFile) || shaFile(artifactFile) !== row.artifact.sha256) failures.push(`TREATMENT_ARTIFACT_SHA_FAILED:${row.id}`);
  if (["INK_MONO", "HALFTONE_ECHO", "DITHER_1BIT", "PRINT_MISREGISTER", "TORN_PAPER_EDGE"].includes(row.treatment) && (row.artifact.alphaMin !== 0 || row.artifact.alphaMax !== 255)) failures.push(`TREATMENT_ALPHA_FAILED:${row.id}`);
  if (row.treatment === "CLEAN" && row.artifact.sha256 !== row.cleanAsset.sha256) failures.push(`CLEAN_EVIDENCE_NOT_BYTE_IDENTICAL:${row.id}`);
  if (row.treatment === "CLEAN" && row.protection?.evidenceCopyPreserved !== true) failures.push(`CLEAN_EVIDENCE_POLICY_FAILED:${row.id}`);
}
for (const [key, relative] of Object.entries(render.cleanMasterSnapshot || {})) {
  const candidates = render.fixtures.filter((row) => row.cleanAsset.sha256 === relative);
  if (!candidates.length) failures.push(`CLEAN_MASTER_SNAPSHOT_UNBOUND:${key}`);
}
const styleDnaFile = path.join(root, render.styleDna?.path || "");
if (!fs.existsSync(styleDnaFile) || shaFile(styleDnaFile) !== render.styleDna.sha256) failures.push("STYLE_DNA_BINDING_FAILED");
for (const artifact of Object.values(render.visibleArtifacts || {})) {
  const file = path.join(root, artifact.path || "");
  if (!fs.existsSync(file) || shaFile(file) !== artifact.sha256) failures.push(`VISIBLE_ARTIFACT_SHA_FAILED:${artifact.path || "missing"}`);
  else {
    const metadata = await sharp(file).metadata();
    if (Number(metadata.width || 0) !== artifact.width || Number(metadata.height || 0) !== artifact.height) failures.push(`VISIBLE_ARTIFACT_DIMENSIONS_FAILED:${artifact.path}`);
  }
}
if (render.boundary?.authorityUnchanged !== true || render.boundary?.storyboardMutationPerformed !== false || render.boundary?.workbenchBindingPerformed !== false || render.boundary?.productionAdmission !== false) failures.push("FORMAL_AUTHORITY_BOUNDARY_FAILED");
if (visualReview.status !== "PASS_WITH_LIMITS" || visualReview.productionAdmission !== false || visualReview.workbenchBindingAllowed !== false) failures.push("ACTUAL_PIXEL_REVIEW_BOUNDARY_FAILED");
if (visualReview.authorityFreshness?.workspaceFileSha256 !== render.boundary.authoritySnapshot.workspace || visualReview.authorityFreshness?.actualWorkspaceIdentitySha256 !== render.boundary.workspaceIdentitySha256 || visualReview.authorityFreshness?.projectedWorkspaceSha256 !== render.boundary.projectedWorkspaceSha256 || visualReview.authorityFreshness?.currentAuthorityAuditFresh !== render.boundary.currentAuthorityAuditFresh) failures.push("AUTHORITY_FRESHNESS_REVIEW_MISMATCH");

const result = {
  contract: "A1AssetArtTreatmentQualification/v1",
  status: failures.length ? "FAIL" : "PASS",
  fixtures: render.fixtures,
  styleDna: render.styleDna,
  coverage: {
    fixtureCount: render.fixtures.length,
    genres: [...genres],
    treatments: [...treatments],
    secondaryOnlyTreatments: render.fixtures.filter((row) => secondaryOnly.has(row.treatment)).map((row) => row.treatment),
    cleanEvidenceCount: render.fixtures.filter((row) => row.treatment === "CLEAN" && row.protection.evidenceCopyPreserved).length,
    fixedCardCount: render.fixtures.filter((row) => row.boundaries.fixedCardRatio !== false).length,
    titleOrBackgroundCount: render.fixtures.filter((row) => row.boundaries.titleRendered !== false || row.boundaries.backgroundGenerated !== false).length,
  },
  visibleArtifacts: render.visibleArtifacts,
  actualPixelReview: visualReview,
  boundary: render.boundary,
  failures,
};
fs.writeFileSync(path.join(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, coverage: result.coverage, visibleArtifacts: result.visibleArtifacts, boundary: result.boundary, failures}, null, 2));
if (failures.length) process.exitCode = 1;
