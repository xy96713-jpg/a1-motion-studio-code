#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = path.join(root, "work/external-source-asset-archetype-v1");
const render = JSON.parse(fs.readFileSync(path.join(outputRoot, "render-result.json"), "utf8"));
const visualReview = JSON.parse(fs.readFileSync(path.join(outputRoot, "actual-pixel-review.json"), "utf8"));
const failures = [];
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

if (render.fixtures?.length !== 9) failures.push("NINE_ASSET_FIXTURES_REQUIRED");
const genres = new Set((render.fixtures || []).map((row) => row.genre));
if (genres.size < 3) failures.push(`GENRE_DIVERSITY_BELOW_3:${genres.size}`);
const archetypes = new Set((render.fixtures || []).map((row) => row.archetype));
if (archetypes.size < 7) failures.push(`ARCHETYPE_DIVERSITY_BELOW_7:${archetypes.size}`);
for (const row of render.fixtures || []) {
  if (row.geometry?.aspectPolicy !== "SOURCE_DRIVEN" || row.geometry?.fixedCardRatio !== null || row.geometry?.visibleCard !== false) failures.push(`FIXED_CARD_LEAK:${row.id}`);
  if (row.visibleCopy !== false || row.backgroundGenerated !== false || row.fixedCardRatio !== false || row.productionAdmission !== false) failures.push(`ASSET_SCOPE_FAILED:${row.id}`);
  const file = path.join(root, row.artifact.path || "");
  if (!fs.existsSync(file) || shaFile(file) !== row.artifact.sha256) failures.push(`ASSET_SHA_FAILED:${row.id}`);
  if (["TIGHT_CUTOUT", "CUTOUT_CONTRAST_STROKE", "HALFTONE_ECHO", "PHOTO_DIPTYCH"].includes(row.archetype) && (row.artifact.alphaMin !== 0 || row.artifact.alphaMax !== 255)) failures.push(`TRANSPARENT_ASSET_ALPHA_FAILED:${row.id}`);
  if (row.archetype === "DOCUMENT_EVIDENCE_PRESERVE" && (row.treatment.effects.length || row.pixelTreatment !== "RESAMPLE_ONLY")) failures.push(`DOCUMENT_EVIDENCE_STYLIZED:${row.id}`);
  if (row.archetype === "HALFTONE_ECHO" && row.id !== "halftone-secondary") failures.push(`HALFTONE_PRIMARY_LEAK:${row.id}`);
}
const creators = new Set((render.referenceEvidence || []).map((row) => row.creatorId));
if (creators.size < 3 || creators.has("covacut")) failures.push("REFERENCE_CREATOR_EVIDENCE_FAILED");
for (const row of render.referenceEvidence || []) {
  const file = path.join(root, row.frame || "");
  if (!fs.existsSync(file) || shaFile(file) !== row.frameSha256) failures.push(`REFERENCE_FRAME_FAILED:${row.id}`);
}
for (const artifact of Object.values(render.visibleArtifacts || {})) {
  const file = path.join(root, artifact.path || "");
  if (!fs.existsSync(file) || shaFile(file) !== artifact.sha256) failures.push(`VISIBLE_ARTIFACT_SHA_FAILED:${artifact.path || "missing"}`);
  else {
    const metadata = await sharp(file).metadata();
    if (Number(metadata.width || 0) !== artifact.width || Number(metadata.height || 0) !== artifact.height) failures.push(`VISIBLE_ARTIFACT_DIMENSIONS_FAILED:${artifact.path}`);
  }
}
if (render.boundary?.authorityUnchanged !== true || render.boundary?.storyboardMutationPerformed !== false || render.boundary?.productionAdmission !== false) failures.push("FORMAL_AUTHORITY_BOUNDARY_FAILED");
if (visualReview.status !== "PASS_WITH_LIMITS" || visualReview.productionAdmission !== false || !visualReview.limits?.includes("USER_VISUAL_APPROVAL_REMAINS_PENDING")) failures.push("ACTUAL_PIXEL_REVIEW_BOUNDARY_FAILED");

const result = {
  contract: "A1ExternalSourceAssetArchetypeQualification/v1",
  status: failures.length ? "FAIL" : "PASS",
  fixtures: render.fixtures,
  referenceEvidence: render.referenceEvidence,
  coverage: {
    fixtureCount: render.fixtures.length,
    genres: [...genres],
    archetypes: [...archetypes],
    archetypeCount: archetypes.size,
    referenceCreators: [...creators],
    fixedCardCount: render.fixtures.filter((row) => row.geometry.fixedCardRatio !== null || row.geometry.visibleCard !== false).length,
    titleOrBackgroundCount: render.fixtures.filter((row) => row.visibleCopy !== false || row.backgroundGenerated !== false).length,
    evidenceStylizationCount: render.fixtures.filter((row) => row.archetype === "DOCUMENT_EVIDENCE_PRESERVE" && row.treatment.effects.length).length,
  },
  visibleArtifacts: render.visibleArtifacts,
  actualPixelReview: visualReview,
  boundary: render.boundary,
  failures,
};
fs.writeFileSync(path.join(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, coverage: result.coverage, visibleArtifacts: result.visibleArtifacts, boundary: result.boundary, failures}, null, 2));
if (failures.length) process.exitCode = 1;
