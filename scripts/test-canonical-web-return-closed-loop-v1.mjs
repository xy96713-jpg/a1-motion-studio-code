#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {applyGenerationEventToManifest} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {buildCanonicalWebImportRecord, validateCanonicalWebCurrentBinding, validateCanonicalWebReturn} from "../apps/studio-next/src/lib/a1-canonical-web-generation-v1.mjs";
import {auditSubjectOcclusionGeometry} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-canonical-web-return-loop-"));
const candidatePath = path.join(root, "opaque-recomposed-presenter.png");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shotId = "ED-13";
const planSha256 = "1".repeat(64);
const holdFrameSha256 = "2".repeat(64);
const authoritySha256 = "3".repeat(64);
const manifestSha256 = "4".repeat(64);
const sourceRevisionHash = "5".repeat(64);
const styleSha256 = "6".repeat(64);
const promptSha256 = "7".repeat(64);
const publicUrl = "/generated/system-line/editorial-asset-workbench-v1/canonical-web-generation-v1/ed-13/ed-13-return.png";
const conversation = {id: "fixed-conversation-fixture", url: "https://chatgpt.com/c/fixed-conversation-fixture"};
const job = {
  jobId: "web-ed-13-fixture",
  shotId,
  planSha256,
  authoritySha256,
  manifestSha256,
  sourceRevisionHash,
  styleSha256,
  promptSha256,
  holdFrame: {sha256: holdFrameSha256, publicUrl: "/generated/system-line/hold/ED-13.jpg"},
  preflight: {preflightSha256: "8".repeat(64)},
  assemblyMode: "OVERLAY",
};
const queue = {
  contract: "A1CanonicalWebGenerationQueue/v1",
  authoritySha256,
  manifestSha256,
  sourceRevisionHash,
  styleSha256,
  conversation,
  jobs: [job],
  batch: {contract: "A1CanonicalWebGenerationBatch/v1", responseOrder: [shotId], separateImagesRequired: true, collageForbidden: true},
};
const workspace = {
  production: {
    shotIntelligence: {
      packageLookMasterPlans: [{
        shotId,
        planSha256,
        styleBriefSha256: "style-brief",
        videoContext: {
          baseFrame: {sha256: holdFrameSha256, publicUrl: job.holdFrame.publicUrl},
          subjectBounds: {x: 0.38, y: 0.2, width: 0.4, height: 0.72},
          availableRegions: [{x: 0.04, y: 0.38, width: 0.28, height: 0.34}],
        },
      }],
    },
  },
};

await sharp({create: {width: 1672, height: 941, channels: 3, background: {r: 220, g: 220, b: 220}}}).png().toFile(candidatePath);
const artifactSha256 = sha256File(candidatePath);
assert.equal(validateCanonicalWebReturn({queue, job, artifactSha256, width: 1672, height: 941, publicUrl}).status, "PASS");
assert.equal(validateCanonicalWebCurrentBinding({workspace, job}).status, "PASS");
const imported = buildCanonicalWebImportRecord({queue, job, artifactSha256, publicUrl, width: 1672, height: 941});
assert.equal(imported.reviewStatus, "PENDING_ACTUAL_PIXEL_AUDIT");
assert.equal(imported.recommendationEligible, false);
assert.equal(imported.assemblyEligible, false);

const geometry = await auditSubjectOcclusionGeometry({
  candidateFile: candidatePath,
  subjectBounds: workspace.production.shotIntelligence.packageLookMasterPlans[0].videoContext.subjectBounds,
  availableRegions: workspace.production.shotIntelligence.packageLookMasterPlans[0].videoContext.availableRegions,
  targetWidth: 1672,
  targetHeight: 941,
});
assert.equal(geometry.status, "FAIL", "opaque web recomposition must fail the overlay geometry audit");
assert.equal(geometry.face.status, "FAIL");
assert.equal(geometry.availableRegionOverflow.status, "FAIL");

const manifest = {
  contract: "A1IncrementalRepairManifest/v2",
  entries: [{
    shotId,
    reasonCodes: ["PACKAGE_ROUTE"],
    status: "AUDIT_DELTA_REQUIRED",
    generationState: "COMPLETED",
    primitiveId: "presenter-headline-material-contrast-v2",
    primitiveCandidates: ["presenter-headline-material-contrast-v2", "presenter-headline-negative-space-v2"],
    attempt: 1,
    retryHistory: [],
    exceptions: [],
    candidateSha: artifactSha256,
    auditStatus: "NOT_RUN",
  }],
};
const retry = applyGenerationEventToManifest(manifest, {shotId, event: "FAILED", candidateSha: artifactSha256, now: "2026-08-07T00:00:00.000Z"});
assert.equal(retry.entries[0].status, "RETRY_SAME_PRIMITIVE_PENDING");
assert.equal(retry.entries[0].retryHistory.length, 1);
const switched = applyGenerationEventToManifest(retry, {shotId, event: "FAILED", candidateSha: artifactSha256, now: "2026-08-07T00:00:01.000Z"});
assert.equal(switched.entries[0].status, "SWITCH_PRIMITIVE_PENDING");
assert.equal(switched.entries[0].primitiveId, "presenter-headline-negative-space-v2");
assert.equal(switched.entries[0].retryHistory.length, 2);

fs.rmSync(root, {recursive: true, force: true});
console.log(JSON.stringify({status: "PASS", contract: "A1CanonicalWebReturnClosedLoopTest/v1", importedStatus: imported.reviewStatus, opaqueOverlayGeometry: geometry.status, firstFailureAction: retry.entries[0].nextAction.action, secondFailureAction: switched.entries[0].nextAction.action, recommendationEligible: imported.recommendationEligible, assemblyEligible: imported.assemblyEligible, imageGenCalls: 0, boardRebuilt: false, assemblyStarted: false}, null, 2));
