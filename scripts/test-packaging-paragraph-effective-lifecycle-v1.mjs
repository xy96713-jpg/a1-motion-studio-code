#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createPackagingParagraphEffectiveLifecycle, assertPackagingParagraphEffectiveLifecycleCheckpoint, createPackagingParagraphEffectiveLifecycleCheckpoint, packagingParagraphEffectiveLifecyclePaths, readPackagingParagraphEffectiveLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-effective-lifecycle-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
// A checkpoint unit test must not depend on a retired production canary.
const baseLifecycle = {status: "VISUAL_REPAIR_REQUIRED", lifecycleSha256: "a".repeat(64), source: {requestPackSha256: "b".repeat(64)}, evidence: {visualDirectorAssessmentSha256: "c".repeat(64), objectivePixelAuditSha256: "d".repeat(64)}};
const plan = {planSha256: "e".repeat(64), source: {visualDirectorAssessmentSha256: baseLifecycle.evidence.visualDirectorAssessmentSha256, requestPackSha256: baseLifecycle.source.requestPackSha256, originalObjectivePixelAuditSha256: baseLifecycle.evidence.objectivePixelAuditSha256, implementationSha256: "f".repeat(64)}};
const manifest = {manifestSha256: "1".repeat(64), source: {planSha256: plan.planSha256}};
const audit = {auditSha256: "2".repeat(64), source: {manifestSha256: manifest.manifestSha256}};
const assessment = {status: "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW", assessmentSha256: "3".repeat(64), source: {objectiveAuditSha256: audit.auditSha256}};
const current = createPackagingParagraphEffectiveLifecycle({baseLifecycle, plan, manifest, audit, assessment, implementation: {implementationSha256: plan.source.implementationSha256}});
assert.equal(current.status, "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW");
assert.equal(current.nextAction.id, "USER_FINAL_ACTUAL_PIXEL_DECISION");
assert.equal(current.boundary.userVisualApproval, "NOT_APPROVED");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-effective-lifecycle-"));
try {
  const tempAppRoot = path.join(tempRoot, "apps/studio-next");
  const sealedPath = path.join(tempRoot, "sealed-evidence.json");
  fs.mkdirSync(tempAppRoot, {recursive: true});
  fs.writeFileSync(sealedPath, "{\"status\":\"PASS\"}\n");
  assert.equal(readPackagingParagraphEffectiveLifecycle(tempAppRoot, {baseLifecycle}), null, "missing checkpoint is inactive");
  const checkpoint = createPackagingParagraphEffectiveLifecycleCheckpoint({projectRoot: tempRoot, lifecycle: current, validatedFiles: [sealedPath], publishedAt: "2026-08-13T00:00:00.000Z"});
  assertPackagingParagraphEffectiveLifecycleCheckpoint(checkpoint, {projectRoot: tempRoot, baseLifecycle});
  const checkpointPath = packagingParagraphEffectiveLifecyclePaths(tempAppRoot).checkpoint;
  fs.mkdirSync(path.dirname(checkpointPath), {recursive: true});
  fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
  assert.equal(readPackagingParagraphEffectiveLifecycle(tempAppRoot, {baseLifecycle})?.status, "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW");
  assert.equal(readPackagingParagraphEffectiveLifecycle(tempAppRoot, {baseLifecycle: null}), null);
  assert.equal(readPackagingParagraphEffectiveLifecycle(tempAppRoot), null);
  assert.equal(readPackagingParagraphEffectiveLifecycle(tempAppRoot, {baseLifecycle: {...baseLifecycle, lifecycleSha256: "9".repeat(64)}}), null, "stale base cannot reuse checkpoint");
  fs.appendFileSync(sealedPath, "tamper\n");
  assert.equal(readPackagingParagraphEffectiveLifecycle(tempAppRoot, {baseLifecycle}), null);
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}

const source = fs.readFileSync(path.join(projectRoot, "apps/studio-next/src/lib/a1-packaging-paragraph-effective-lifecycle-v1.mjs"), "utf8");
assert.doesNotMatch(source, /buildPackagingParagraphVisualRepairImplementationBinding/u);
assert.doesNotMatch(source, /assertPackagingParagraphVisualRepairPlan/u);
assert.doesNotMatch(source, /sharp/u);
assert.match(source, /boundedStatSealCheckOnRead/u);
assert.match(source, /fallbackToBaseLifecycleOnSealFailure/u);
console.log(JSON.stringify({status: "PASS", contract: "A1PackagingParagraphEffectiveLifecycleCheckpoint/v1", effectiveStatus: current.status, fullValidationCheckpointPublished: true, boundedStatSealHotRead: true, tamperFallsBackToBaseLifecycle: true, fullWorkspaceRead: false, recursiveMediaScan: false, sourceAssetRehashOnPoll: false, userVisualApproval: "NOT_APPROVED"}, null, 2));
