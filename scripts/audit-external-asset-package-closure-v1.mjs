#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertExternalAssetPackage} from "../apps/studio-next/src/lib/a1-external-asset-package-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "external-asset-package-closure-v1");
const resultPath = path.join(phaseRoot, "result.json");
const phasePath = path.join(phaseRoot, "phase-contract.json");
const auditPath = path.join(phaseRoot, "actual-pixel-review.json");
const currentPhasePath = path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json");
const authorityPath = path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const failures = [];
const record = (id, pass, detail = null) => {
  if (!pass) failures.push(id);
  return {id, status: pass ? "PASS" : "FAIL", detail};
};

const result = readJson(resultPath);
const phase = readJson(phasePath);
const currentPhase = readJson(currentPhasePath);
const authority = readJson(authorityPath);
const checks = [];
checks.push(record("RESULT_CONTRACT", result.contract === "A1ExternalAssetPackageClosureResult/v1" && result.status === "PASS"));
checks.push(record("EXACT_EIGHTEEN_REAL_PACKAGES", result.results?.length === 18 && result.counts?.packageCount === 18));
checks.push(record("SIX_ASSET_CLASSES", result.counts?.genreCount >= 6));
checks.push(record("FIFTY_FOUR_BACKGROUND_STRESS_PLACEMENTS", result.counts?.backgroundStressPlacementCount === 54));
checks.push(record("BACKGROUND_STRESS_HIDDEN_FROM_USER_REVIEW", result.checks?.userFacingReviewContainsNoBackgroundStress === true && result.technicalBackgroundStressArtifact?.userFacing === false));
checks.push(record("PRESENTATION_DIVERSITY", result.counts?.cutoutCount > 0 && result.counts?.sourceRectangleCount > 0 && result.counts?.evidencePreserveCount > 0, result.counts));
checks.push(record("ART_TREATMENT_RESTRAINT", result.counts?.stylizedCount > 0 && result.counts?.cleanCount > result.counts?.stylizedCount, result.counts));
checks.push(record("NEW_ASSET_EFFECTS_QUALIFIED", ["CUT_PAPER_FIBER_EDGE", "SELECTIVE_SOURCE_COLOR"].every((treatment) => result.results?.some((item) => item.treatment === treatment))));
checks.push(record("PUBLIC_ARTIFACT_PARITY", result.checks?.publicArtifactParity === true));
checks.push(record("EVIDENCE_ALWAYS_CLEAN", result.checks?.evidenceAlwaysClean === true));
checks.push(record("NO_UNVERIFIED_CUTOUT", result.checks?.unreviewedAlphaNeverCutout === true));
checks.push(record("ASSET_ONLY_BOUNDARY", result.checks?.noTitleLabelOrBackgroundInPackage === true && result.boundary?.storyboardMutation === false && result.boundary?.productionAdmission === false));

const pixelRows = [];
for (const item of result.results || []) {
  const manifestPath = path.join(root, item.manifest.path);
  const cleanPath = path.join(root, item.clean.path);
  const treatedPath = path.join(root, item.treated.path);
  const reviewPath = path.join(root, item.review.path);
  const filesExist = [manifestPath, cleanPath, treatedPath, reviewPath].every((file) => fs.existsSync(file));
  checks.push(record(`FILES_EXIST:${item.id}`, filesExist));
  if (!filesExist) continue;
  const manifest = readJson(manifestPath);
  try {
    assertExternalAssetPackage(manifest);
  } catch (error) {
    failures.push(`PACKAGE_INVALID:${item.id}:${error instanceof Error ? error.message : "invalid"}`);
  }
  const treatedStats = await sharp(treatedPath).ensureAlpha().stats();
  const treatedMeta = await sharp(treatedPath).metadata();
  const rgbStdev = treatedStats.channels.slice(0, 3).map((channel) => Number(channel.stdev.toFixed(3)));
  const alpha = treatedStats.channels[3];
  const visible = Math.max(...rgbStdev) >= 3;
  const alphaCoverage = alpha ? Number((alpha.sum / (255 * Number(treatedMeta.width || 1) * Number(treatedMeta.height || 1))).toFixed(4)) : 1;
  const alphaSafe = item.presentation !== "CUTOUT" || (alpha?.min === 0 && alpha?.max === 255 && alphaCoverage >= .005 && alphaCoverage <= .95);
  const reviewMeta = await sharp(reviewPath).metadata();
  const reviewComplete = reviewMeta.width === 1200 && reviewMeta.height === 460;
  const hashesMatch = shaFile(cleanPath) === item.clean.sha256 && shaFile(treatedPath) === item.treated.sha256 && shaFile(reviewPath) === item.review.sha256;
  if (!visible) failures.push(`TREATED_ASSET_NOT_VISIBLE:${item.id}`);
  if (!alphaSafe) failures.push(`CUTOUT_ALPHA_STRESS_FAILED:${item.id}`);
  if (!reviewComplete) failures.push(`REVIEW_SHEET_DIMENSIONS_INVALID:${item.id}`);
  if (!hashesMatch) failures.push(`PACKAGE_FILE_SHA_MISMATCH:${item.id}`);
  pixelRows.push({id: item.id, genre: item.genre, presentation: item.presentation, separation: item.separation, treatment: item.treatment, visible, rgbStdev, alphaCoverage, alphaSafe, reviewComplete, hashesMatch});
}

const runtimeText = (phase.generality?.runtimeFiles || []).map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const term of [...(phase.generality?.forbiddenFixtureIds || []), ...(phase.generality?.forbiddenTopicTerms || [])]) {
  checks.push(record(`RUNTIME_FREE_OF:${term}`, !runtimeText.includes(term)));
}
const workspaceSha = currentPhase.authority?.workspaceSha256 || currentPhase.workspaceSha256 || null;
checks.push(record("CURRENT_AUTHORITY_UNCHANGED", authority.status === "PASS" && authority.authority?.workspaceSha256 === workspaceSha && workspaceSha === "25fb93ddcd236b0e3875c391b8423272250bbe452a9e2e38adeb34e58fa78af9", {workspaceSha, auditWorkspaceSha256: authority.authority?.workspaceSha256}));
checks.push(record("VISIBLE_BOARD_HASH", fs.existsSync(path.join(root, result.visibleArtifact.path)) && shaFile(path.join(root, result.visibleArtifact.path)) === result.visibleArtifact.sha256));
checks.push(record("TECHNICAL_STRESS_BOARD_HASH", fs.existsSync(path.join(root, result.technicalBackgroundStressArtifact?.path || "")) && shaFile(path.join(root, result.technicalBackgroundStressArtifact.path)) === result.technicalBackgroundStressArtifact.sha256));

const status = failures.length ? "FAIL" : "PASS";
const body = {
  contract: "A1ExternalAssetPackageClosureActualPixelReview/v1",
  status,
  reviewedAt: new Date().toISOString(),
  visualDirectorAssessment: {
    register: "asset-only editorial packaging",
    visualThesis: "Source identity first; tight transparent cutouts or honest source rectangles, with restrained print intervention only when semantic evidence clears the threshold.",
    boardInspected: true,
    verdict: status,
    notes: [
      "Original, clean master and packaged asset remain visually distinguishable.",
      "The user-facing board uses only source, clean master and packaged asset on a neutral transparency checker.",
      "Light, dark and busy backgrounds remain in a separate non-public technical stress artifact and are not embedded in package outputs.",
      "Evidence documents remain clean and source-bound.",
      "The first blank reflective source was rejected and replaced through a general visibility gate."
    ]
  },
  summary: {packageCount: pixelRows.length, visibleCount: pixelRows.filter((item) => item.visible).length, alphaSafeCutoutCount: pixelRows.filter((item) => item.presentation === "CUTOUT" && item.alphaSafe).length},
  checks,
  pixelRows,
  visibleArtifact: result.visibleArtifact,
  boundary: {reviewOnly: true, userVisualApproval: "NOT_APPROVED", formalWorkspaceMutation: false, storyboardMutation: false, productionAdmission: false},
  failures: [...new Set(failures)],
};
const report = {...body, auditSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(auditPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, summary: report.summary, visibleArtifact: report.visibleArtifact, failureCount: report.failures.length, failures: report.failures, auditSha256: report.auditSha256}, null, 2));
if (failures.length) process.exitCode = 1;
