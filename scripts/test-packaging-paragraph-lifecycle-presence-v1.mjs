#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {assertPackagingParagraphCanaryLifecycle, packagingParagraphCanaryLifecyclePaths, readPackagingParagraphCanaryLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-lifecycle-v1.mjs";
import {A1_PACKAGING_PARAGRAPH_CANARY_IMPLEMENTATION_FILES} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-implementation-binding-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "a1-lifecycle-presence-"));
const appRoot = path.join(temp, "apps/studio-next");
const paths = packagingParagraphCanaryLifecyclePaths(appRoot);
const write = (file, value) => {fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, JSON.stringify(value));};
const read = () => readPackagingParagraphCanaryLifecycle(appRoot);
const pack = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/packaging-paragraph-canary-v1/request-pack.json"), "utf8"));
const phase = {authority: {workspaceSha256: pack.source.workspaceSha256, workspaceFileSha256: pack.source.workspaceFileSha256 || "b".repeat(64)}, transitionSha256: "c".repeat(64)};
try {
  assert.equal(read(), null, "absent phase and pack means no paragraph lifecycle, not candidate PASS");
  write(paths.pack, pack);
  assert.equal(read(), null, "pack without phase cannot establish current authority");
  fs.rmSync(paths.pack);
  write(paths.phase, phase);
  assert.equal(read(), null, "phase without pack leaves the paragraph lane inactive");
  assert.throws(() => assertPackagingParagraphCanaryLifecycle(null), /invalid:contract/);
  for (const relative of A1_PACKAGING_PARAGRAPH_CANARY_IMPLEMENTATION_FILES) {
    const target = path.join(temp, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(root, relative), target);
  }
  write(paths.pack, pack);
  const active = assertPackagingParagraphCanaryLifecycle(read());
  assert.equal(active.status, "AWAITING_EXPLICIT_USER_AUTHORIZATION", "missing reference with current valid pack is not an admitted candidate");
  assert.equal(active.evidence.imagegenResultReceiptSha256, null);
  assert.equal(active.nextAction.requiresUser, true);
  const stalePhase = structuredClone(phase);
  stalePhase.authority.workspaceSha256 = "d".repeat(64);
  write(paths.phase, stalePhase);
  const stalePack = assertPackagingParagraphCanaryLifecycle(read());
  assert.equal(stalePack.status, "CURRENT_CANDIDATE_GENERATION_REQUIRED");
  assert.equal(stalePack.evidence.reason, "CURRENT_REQUEST_PACK_STALE_NO_VALID_CURRENT_CANDIDATE");
  assert.equal(stalePack.evidence.candidateExistence, "NO_VALID_CURRENT_CANDIDATE");
  assert.equal(stalePack.nextAction.id, "GENERATE_NEW_CURRENT_CANDIDATE");
  assert.equal(stalePack.nextAction.requiresUser, true);
  write(paths.currentCandidateReference, {contract: "A1PackagingParagraphCurrentCandidateReference/v1", version: 1, status: "READY_FOR_CURRENT_ACTUAL_PIXEL_REVIEW", source: phase.authority});
  const staleReference = assertPackagingParagraphCanaryLifecycle(read());
  assert.equal(staleReference.status, "CURRENT_CANDIDATE_REFERENCE_STALE");
  assert.deepEqual(staleReference.failures, ["current-reference:current-candidate-reference-stale:workspace"]);
  assert.equal(staleReference.nextAction.id, "RECONCILE_CURRENT_CANARY_REFERENCE");
  write(paths.currentCandidateReference, null);
  const nullReference = assertPackagingParagraphCanaryLifecycle(read());
  assert.equal(nullReference.status, "CURRENT_CANDIDATE_REFERENCE_STALE");
  assert.deepEqual(nullReference.failures, ["current-reference:current-candidate-reference-invalid:contract"]);
  for (const lifecycle of [active, stalePack, staleReference, nullReference]) {
    assert.equal(lifecycle.boundary.productionAdmitted, false);
    assert.equal(lifecycle.boundary.motionAllowed, false);
    assert.equal(lifecycle.boundary.workspaceMutationAllowed, false);
  }
  fs.rmSync(paths.pack);
  assert.equal(read(), null, "removing pack must not resurrect cached active/stale evidence");
  write(paths.pack, pack);
  fs.rmSync(paths.phase);
  assert.equal(read(), null, "removing phase must not resurrect cached evidence");
  console.log(JSON.stringify({status: "PASS", contract: "A1ParagraphLifecyclePresenceTest/v1", missingInputsInactive: true, nullReferenceRejected: true, stalePackRequiresGeneration: true, staleReferenceBlocked: true, cachedEvidenceNotResurrected: true}));
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
