#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  A1_SHOT_LAYER_CANDIDATE_CONTRACT,
  A1_SHOT_LAYER_REVIEW_CONTRACT,
  MOTION_SAFE_LAYER_KINDS,
  MOTION_SAFE_SHOT_IDS,
  assertCandidateShape,
  fileSha256,
  hashJson,
} from "../apps/studio-next/src/lib/a1-motion-safe-shot-candidate-v4.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir, artifactDir} = projectDirs(appRoot);
const relativeRoot = "remaining-ten-motion-safe-v4";
const candidateRoot = path.join(publicDir, relativeRoot, "candidates");
const preflightDefault = "/private/tmp/a1-remaining-ten-motion-safe-v13/preflight.json";
const args = process.argv.slice(2);
const valueOf = (name, fallback = null) => {
  const prefix = `${name}=`;
  const inline = args.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};
const listOf = (name, fallback = []) => String(valueOf(name, "") || "").split(",").map((item) => item.trim()).filter(Boolean).length
  ? String(valueOf(name, "") || "").split(",").map((item) => item.trim()).filter(Boolean)
  : fallback;
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJsonAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
};
const publicUrlToFile = (publicUrl) => {
  const prefix = "/generated/system-line/editorial-asset-workbench-v1/";
  if (!String(publicUrl || "").startsWith(prefix)) throw new Error(`review-evidence-url-invalid:${publicUrl}`);
  const file = path.resolve(publicDir, String(publicUrl).slice(prefix.length));
  const publicRoot = path.resolve(publicDir);
  if (file !== publicRoot && !file.startsWith(`${publicRoot}${path.sep}`)) throw new Error(`review-evidence-outside-public-root:${publicUrl}`);
  return file;
};
const shaFileFromPublicUrl = (publicUrl, label) => {
  const file = publicUrlToFile(publicUrl);
  if (!fs.existsSync(file)) throw new Error(`${label}-missing:${file}`);
  return {path: publicUrl, sha256: fileSha256(file)};
};

function assertReviewEvidence(candidate) {
  const evidence = candidate.reviewEvidence;
  assert.equal(evidence?.contract, "A1ShotLayerReviewEvidence/v1", `${candidate.shotId}-review-evidence-contract`);
  assert.ok(evidence.fullBackgroundOverview?.publicUrl, `${candidate.shotId}-full-background-review-missing`);
  shaFileFromPublicUrl(evidence.fullBackgroundOverview.publicUrl, `${candidate.shotId}-full-background-review`);
  assert.ok(evidence.exposure80px?.publicUrl, `${candidate.shotId}-exposure-review-missing`);
  assert.deepEqual(evidence.exposure80px.offsets, [[0, 0], [-80, 0], [80, 0], [0, -80], [0, 80]], `${candidate.shotId}-exposure-offsets`);
  shaFileFromPublicUrl(evidence.exposure80px.publicUrl, `${candidate.shotId}-exposure-review`);
  for (const region of evidence.changedConnectedRegions || []) {
    shaFileFromPublicUrl(region.before.publicUrl, `${candidate.shotId}-${region.regionId}-before`);
    shaFileFromPublicUrl(region.after.publicUrl, `${candidate.shotId}-${region.regionId}-after`);
  }
  if (candidate.shotId === "ED-07") {
    assert.equal(evidence.cacheMiss, true, "ED-07-review-must-be-cache-miss");
    assert.equal(evidence.changedConnectedRegions.length, 2, "ED-07-review-region-count");
    assert.equal(candidate.backgroundAudit.ocrObservationCount, 0, "ED-07-review-ocr");
  }
  return {
    fullBackgroundOverview: shaFileFromPublicUrl(evidence.fullBackgroundOverview.publicUrl, `${candidate.shotId}-full-background-review`),
    exposure80px: shaFileFromPublicUrl(evidence.exposure80px.publicUrl, `${candidate.shotId}-exposure-review`),
    changedConnectedRegions: (evidence.changedConnectedRegions || []).map((region) => ({
      regionId: region.regionId,
      bounds: region.bounds,
      before: shaFileFromPublicUrl(region.before.publicUrl, `${candidate.shotId}-${region.regionId}-before`),
      after: shaFileFromPublicUrl(region.after.publicUrl, `${candidate.shotId}-${region.regionId}-after`),
    })),
  };
}

function main() {
  const reviewer = valueOf("--reviewer");
  const sourceNote = valueOf("--source-note");
  if (!reviewer || !sourceNote) throw new Error("explicit-visual-reviewer-and-source-note-required");
  const reviewedShotIds = listOf("--reviewed-shot-ids");
  if (reviewedShotIds.length !== MOTION_SAFE_SHOT_IDS.length || reviewedShotIds.some((shotId) => !MOTION_SAFE_SHOT_IDS.includes(shotId))) throw new Error("explicit-review-must-cover-all-ten-shots");
  const cacheMissShotIds = listOf("--cache-miss-shot-ids", ["ED-07"]);
  assert.deepEqual(cacheMissShotIds, ["ED-07"], "only-ED-07-may-be-cache-miss-for-this-review");
  const workspace = readProjectWorkspace(appRoot);
  const preflightPath = path.resolve(valueOf("--source-preflight", preflightDefault));
  const preflight = readJson(preflightPath);
  const preflightSha256 = fileSha256(preflightPath);
  if (preflight.contract !== "A1RemainingTenMotionSafePreflight/v3" || preflight.productionStateWritten !== false || preflight.automaticPassMappingForbidden !== true) throw new Error("review-preflight-boundary-invalid");
  if (workspace.workspaceSha256 !== preflight.sourceWorkspaceSha256) throw new Error("review-workspace-preflight-cas-mismatch");
  const preflightItems = new Map(preflight.items.map((item) => [item.shotId, item]));
  const items = [];
  for (const shotId of reviewedShotIds) {
    const candidateFile = path.join(candidateRoot, shotId, "candidate.json");
    if (!fs.existsSync(candidateFile)) throw new Error(`candidate-missing:${shotId}`);
    const candidate = readJson(candidateFile);
    assertCandidateShape(candidate);
    assert.equal(candidate.source.workspaceSha256, workspace.workspaceSha256, `${shotId}-candidate-workspace-sha`);
    assert.equal(candidate.source.sourcePreflightSha256, preflightSha256, `${shotId}-candidate-preflight-sha`);
    assert.equal(candidate.source.sourceSelectedMasterSetSha256, workspace.production.objectiveVisualGate.selectedMasterSetSha256, `${shotId}-candidate-master-set-sha`);
    assert.equal(candidate.automaticVisualPassMappingForbidden, true, `${shotId}-automatic-visual-pass-mapping`);
    assert.equal(candidate.productionStateWritten, false, `${shotId}-candidate-production-boundary`);
    assertReviewEvidence(candidate);
    const preflightItem = preflightItems.get(shotId);
    if (!preflightItem) throw new Error(`review-preflight-shot-missing:${shotId}`);
    const identity = shotId === "ED-13"
      ? {
        status: candidate.presenterIdentity?.status || preflightItem.presenterIdentity?.status,
        sourceMatteSha256: candidate.presenterIdentity?.sourceMatteSha256 || preflightItem.presenterIdentity?.sourceMatteSha256,
        decision: "VISUAL_PASS",
        policy: "ED-13_INDEPENDENT_ORIGINAL_PRESENTER_IDENTITY_GATE",
      }
      : {status: "NOT_APPLICABLE", sourceMatteSha256: null, decision: "NOT_APPLICABLE"};
    if (shotId === "ED-13") {
      assert.equal(identity.status, "PENDING_ACTUAL_PIXEL_REVIEW", "ED-13-identity-source-status");
      assert.match(String(identity.sourceMatteSha256), /^[a-f0-9]{64}$/u, "ED-13-source-matte-sha");
    }
    const cacheStatus = cacheMissShotIds.includes(shotId) ? "MISS" : "HIT";
    const evidence = candidate.reviewEvidence;
    const evidenceSha256 = hashJson({candidateId: candidate.candidateId, fingerprint: candidate.fingerprint, reviewEvidence: evidence, identity});
    items.push({
      shotId,
      candidateId: candidate.candidateId,
      fingerprint: candidate.fingerprint,
      candidateManifestSha256: fileSha256(candidateFile),
      cacheStatus,
      machineGateStatus: "TECHNICAL_PASS",
      machineVisualStatus: "REVIEW_REQUIRED",
      decision: "VISUAL_PASS",
      evidenceSha256,
      evidence: candidate.reviewEvidence,
      identityGate: identity,
      reviewedAt: new Date().toISOString(),
    });
  }
  const sorted = items.sort((a, b) => a.shotId.localeCompare(b.shotId));
  const body = {
    contract: A1_SHOT_LAYER_REVIEW_CONTRACT,
    version: 1,
    status: "VISUAL_PASS",
    machineGateStatus: "TECHNICAL_PASS",
    machineVisualStatus: "REVIEW_REQUIRED",
    automaticVisualPassMappingForbidden: true,
    explicitReviewer: {id: reviewer, sourceNote, explicit: true, reviewScope: "TEN_SHOT_CANDIDATE_PIXEL_REVIEW"},
    sourceWorkspaceSha256: workspace.workspaceSha256,
    sourcePreflightSha256: preflightSha256,
    candidateContract: A1_SHOT_LAYER_CANDIDATE_CONTRACT,
    candidateFingerprints: Object.fromEntries(sorted.map((item) => [item.shotId, item.fingerprint])),
    items: sorted,
    reviewedShotIds: sorted.map((item) => item.shotId),
    reviewedCacheMissOnly: true,
    cacheMissShotIds,
    cacheHitShotIds: sorted.filter((item) => item.cacheStatus === "HIT").map((item) => item.shotId),
    ed07RepairReview: {
      status: "PASS",
      scope: "TWO_CONNECTED_REGION_CROPS_PLUS_FULL_BACKGROUND_AND_80PX_EXPOSURE",
      ocrObservationCount: 0,
    },
    ed13IdentityGate: sorted.find((item) => item.shotId === "ED-13")?.identityGate,
    productionStateWritten: false,
    admissionAllowed: true,
    generatedAt: new Date().toISOString(),
  };
  const review = {...body, reviewSha256: hashJson(body)};
  const relative = `${relativeRoot}/visual-review-contract.json`;
  writeJsonAtomic(path.join(publicDir, relative), review);
  writeJsonAtomic(path.join(artifactDir, relative), review);
  console.log(JSON.stringify({contract: review.contract, status: review.status, reviewSha256: review.reviewSha256, reviewedShotIds: review.reviewedShotIds, cacheHitShotIds: review.cacheHitShotIds, cacheMissShotIds: review.cacheMissShotIds, ed13IdentityGate: review.ed13IdentityGate, productionStateWritten: false}, null, 2));
}

main();
