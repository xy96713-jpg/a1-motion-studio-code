#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  persistProjectState,
  projectDirs,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {hashJson} from "../apps/studio-next/src/lib/a1-motion-safe-shot-candidate-v4.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const formalRoot = "whole-film-layer-reconstruction-v4";
const maturityRelative = "golden-film-visual-system-maturity-v1/maturity-run.json";
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(publicDir, relative), "utf8"));
const jsonSafe = (value) => JSON.parse(JSON.stringify(value));

await withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  const manifestRelative = `${formalRoot}/manifest.json`;
  const auditRelative = `${formalRoot}/actual-pixel-audit.json`;
  const admissionRelative = `${formalRoot}/remaining-ten-admission.json`;
  const reviewRelative = "remaining-ten-motion-safe-v4/visual-review-contract.json";
  const manifest = readJson(manifestRelative);
  const audit = readJson(auditRelative);
  const admission = readJson(admissionRelative);
  const review = readJson(reviewRelative);
  const oldManifestSha = manifest.manifestSha256;
  const manifestBody = structuredClone(manifest);
  delete manifestBody.manifestSha256;
  const normalizedManifestSha = hashJson(jsonSafe(manifestBody));
  manifest.manifestSha256 = normalizedManifestSha;
  const auditBody = {...audit, sourceManifestSha256: normalizedManifestSha};
  delete auditBody.auditSha256;
  const normalizedAuditSha = hashJson(jsonSafe(auditBody));
  const nextAudit = {...auditBody, auditSha256: normalizedAuditSha};
  const admissionBody = {...admission, formalManifestSha256: normalizedManifestSha, actualPixelAuditSha256: normalizedAuditSha};
  delete admissionBody.admissionSha256;
  const normalizedAdmissionSha = hashJson(jsonSafe(admissionBody));
  const nextAdmission = {...admissionBody, admissionSha256: normalizedAdmissionSha};
  const maturity = readJson(maturityRelative);
  const maturityNext = {
    ...maturity,
    postStaticBoard: {...maturity.postStaticBoard, manifestSha256: normalizedManifestSha, actualVisualAuditSha256: normalizedAuditSha, admissionSha256: normalizedAdmissionSha},
  };
  const maturityHashInput = structuredClone(maturityNext);
  delete maturityHashInput.maturityRunSha256;
  maturityNext.maturityRunSha256 = hashJson(jsonSafe(maturityHashInput));
  const now = new Date().toISOString();
  const next = structuredClone(current);
  const shotIntelligence = next.production.shotIntelligence;
  shotIntelligence.wholeFilmLayerReconstruction = {...shotIntelligence.wholeFilmLayerReconstruction, manifestSha256: normalizedManifestSha};
  shotIntelligence.wholeFilmLayerActualPixelAudit = {...shotIntelligence.wholeFilmLayerActualPixelAudit, sourceManifestSha256: normalizedManifestSha, auditSha256: normalizedAuditSha};
  shotIntelligence.packageAssetKitPlans = shotIntelligence.packageAssetKitPlans.map((plan) => plan.deterministicWholeFilmLayers
    ? {...plan, deterministicWholeFilmLayers: {...plan.deterministicWholeFilmLayers, manifestSha256: normalizedManifestSha, visualReviewSha256: review.reviewSha256}}
    : plan);
  next.production.objectiveVisualGate = {...next.production.objectiveVisualGate, wholeFilmLayerManifestSha256: normalizedManifestSha, wholeFilmLayerActualPixelAuditSha256: normalizedAuditSha};
  next.production.goldenFilmVisualSystemMaturity = {...next.production.goldenFilmVisualSystemMaturity, maturityRunSha256: maturityNext.maturityRunSha256, wholeFilmLayerManifestSha256: normalizedManifestSha, wholeFilmLayerActualPixelAuditSha256: normalizedAuditSha, remainingTenAdmissionSha256: normalizedAdmissionSha};
  const event = createProductionEvent({workspace: current, action: "normalize-motion-safe-admission-hashes", targetId: "whole-film-layer-reconstruction-v4", payload: {oldManifestSha, normalizedManifestSha, normalizedAuditSha, normalizedAdmissionSha, pixelsUnchanged: true, candidateContract: "A1ShotLayerCandidate/v4"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `normalize-motion-safe-admission-hashes-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[manifestRelative]: manifest, [auditRelative]: nextAudit, [admissionRelative]: nextAdmission, [maturityRelative]: maturityNext}});
  assert.equal(committed.workspaceSha256, recalculated.workspaceSha256);
  console.log(JSON.stringify({status: "HASH_NORMALIZED", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, oldManifestSha, normalizedManifestSha, normalizedAuditSha, normalizedAdmissionSha, pixelsUnchanged: true}, null, 2));
});
