#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  A1_UNIVERSAL_REFERENCE_ATTACHMENT_MANIFEST_CONTRACT,
  A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
  UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
  assertUniversalReferenceAttachmentManifest,
  buildCodexImageAttachmentArgs,
  buildUniversalReferenceAttachmentManifest,
  classifyReferencePackagingDecision,
} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";
import {queuePackageLayerGenerationJobs} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const referencePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-15-hold-frame.jpg");
const referenceSha256 = crypto.createHash("sha256").update(fs.readFileSync(referencePath)).digest("hex");
const input = {
  id: "fixture-real-hold-frame",
  sourcePath: referencePath,
  sourceSha256: referenceSha256,
  sourceType: "REAL_HOLD_FRAME",
  semanticRole: "presenter-geometry-anchor",
  transformPolicy: "PIXEL_EXACT_RESTORE",
  generationAttachmentIndex: 0,
  role: "base-video-hold-frame",
};

assert.equal(classifyReferencePackagingDecision({packageDecision: "PACKAGE", informationGain: true, referenceCount: 1}), "UNIVERSAL_REFERENCE_TO_IMAGEGEN_PACKAGING");
const declared = buildUniversalReferenceAttachmentManifest({jobId: "fixture-job", referenceInputs: [input], stage: "DECLARED"});
assert.equal(declared.contract, A1_UNIVERSAL_REFERENCE_ATTACHMENT_MANIFEST_CONTRACT);
assert.equal(declared.packagingContract, A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT);
assert.equal(declared.productionMethod, UNIVERSAL_REFERENCE_PRODUCTION_METHOD);
assert.equal(declared.requireAttached, true);
assertUniversalReferenceAttachmentManifest(declared);

const attached = buildUniversalReferenceAttachmentManifest({jobId: "fixture-job", referenceInputs: [input], attachedImagePaths: [referencePath], stage: "ATTACHED_TO_CODEX_INITIAL_PROMPT"});
assertUniversalReferenceAttachmentManifest(attached, {requireAttached: true});
assert.equal(attached.attachments[0].attachedSha256, referenceSha256);
assert.deepEqual(buildCodexImageAttachmentArgs([referencePath]), ["--image", referencePath]);

assert.throws(() => buildUniversalReferenceAttachmentManifest({jobId: "fixture-bad-sha", referenceInputs: [{...input, sourceSha256: "0".repeat(64)}], attachedImagePaths: [referencePath]}), /sha-mismatch/);
const tampered = {...attached, attachments: [{...attached.attachments[0], attachedToInitialPrompt: false}, ...attached.attachments.slice(1)]};
tampered.manifestSha256 = crypto.createHash("sha256").update(JSON.stringify({...tampered, manifestSha256: undefined})).digest("hex");
assert.throws(() => assertUniversalReferenceAttachmentManifest(tampered, {requireAttached: true}), /attachment-proof-missing/);

const workerSource = fs.readFileSync(path.join(root, "scripts/run-editorial-asset-workbench-jobs-v2.mjs"), "utf8");
assert.match(workerSource, /buildCodexImageAttachmentArgs/);
assert.match(workerSource, /ATTACHED_TO_CODEX_INITIAL_PROMPT/);
assert.match(workerSource, /universal-reference-declared-attachment-manifest-mismatch/);
assert.match(workerSource, /This is post-approval pixel extraction, not Look Master design/);
assert.match(workerSource, /Return a real RGBA PNG with alpha zero everywhere outside the isolated layer/);

const live = readProjectWorkspace(path.join(root, "apps/studio-next"));
const queuedLayerShotId = live.production.shotIntelligence.packageAssetKitPlans.find((plan) => plan.layers.some((layer) => layer.route === "GENERATE"))?.shotId;
assert.ok(queuedLayerShotId);
assert.throws(
  () => queuePackageLayerGenerationJobs(live, queuedLayerShotId),
  /blocked-until-imagegen-master-assembly-approved|look-master-approval-required|reconstruction-plan-not-ready/u,
  "the current unapproved workspace must remain frozen",
);
const fixture = structuredClone(live);
const fixtureRuntime = fixture.production.shotIntelligence;
const fixturePlan = fixtureRuntime.packageAssetKitPlans.find((plan) => plan.shotId === queuedLayerShotId);
const historicalRecipe = fixtureRuntime.packageAssemblyRecipes.find((recipe) => recipe.shotId === queuedLayerShotId);
assert.ok(fixturePlan?.masterPreservationPolicy && fixturePlan.selectedLookMasterBinding && historicalRecipe);
fixtureRuntime.status = "LAYER_RECONSTRUCTION_READY";
fixturePlan.status = "LAYER_RECONSTRUCTION_READY";
fixturePlan.current = true;
fixturePlan.authorityScope = "CURRENT";
fixturePlan.selectedLookMasterBinding = {...fixturePlan.selectedLookMasterBinding, status: "VISUAL_APPROVED"};
for (const layer of fixturePlan.layers) {
  layer.candidates = [];
  layer.selectedCandidateId = null;
  if (layer.route !== "NONE") layer.status = "RECONSTRUCTION_REQUIRED";
}
const fixtureRecipe = {
  ...structuredClone(historicalRecipe),
  current: true,
  authorityScope: "CURRENT",
  status: "ASSEMBLY_REVIEW_REQUIRED",
  assemblySource: {
    mode: "IMAGEGEN_APPROVED_LOOK_MASTER",
    localLayerRecompositionPerformed: false,
    localSecondDesignPerformed: false,
  },
  userAssemblyDecision: {decision: "approved", approvedBy: "test-fixture", userApprovalRequired: false},
};
fixtureRuntime.packageAssemblyRecipes = [fixtureRecipe];
fixture.production.generation.jobs = [];
fixture.production.generation.summary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: 0};
const recompiled = queuePackageLayerGenerationJobs(fixture, queuedLayerShotId);
const layerJobs = recompiled.jobs.filter((job) => job.targetKind === "package-layer");
assert.ok(layerJobs.length > 0);
for (const job of layerJobs) {
  assert.equal(job.operation, "EXTRACT_APPROVED_MASTER_PIXELS");
  assert.equal(job.productionMethod, UNIVERSAL_REFERENCE_PRODUCTION_METHOD);
  assert.equal(job.referencePackagingContract, A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT);
  assert.equal(job.referenceInputs.length, 1);
  assert.equal(job.referenceInputs[0].sourceSha256, job.masterPreservationPolicy.selectedMaster.sha256);
  assert.equal(job.referenceInputs[0].transformPolicy, "PIXEL_EXACT_RESTORE");
  assert.equal(job.referenceAttachmentManifest.fileCount, 1);
  assert.equal(job.referenceAttachmentManifest.requireAttached, true);
  assert.equal(job.visualAlternativesAllowed, false);
}

console.log(JSON.stringify({status: "PASS", contract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, referenceSha256, declaredManifestSha256: declared.manifestSha256, attachedManifestSha256: attached.manifestSha256, attachmentCount: attached.fileCount, currentUnapprovedWorkspaceRejected: true, fixtureOnlyApprovalPrecondition: true, workerImageAttachmentGate: true, packageLayerExtractionJobCount: layerJobs.length}, null, 2));
