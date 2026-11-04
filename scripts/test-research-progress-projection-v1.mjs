#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {projectResearchProgressV1, readRegisteredResearchProgressV1} from "./lib/project-research-progress-v1.mjs";

import {MAX_RESEARCH_TASK_ARTIFACTS_V1, MAX_RESEARCH_TASK_CANDIDATES_V1} from "../apps/studio-next/src/lib/a1-system-line-research-task-manifest-v1.mjs";

const taskId = "unseen-progress-fixture";
const seal = (body) => ({...body, sha256: nodeInputHash(body)});
const body = {
  contract: "A1SystemLineResearchTaskManifest/v1", taskId, scope: "RESEARCH_ONLY", productionAdmission: false,
  summary: {sequenceCount: 3, visuallyAcceptedCount: 0, registeredRenderCount: 0}, blockers: ["CONTINUOUS_REVIEW_PENDING"],
  sequences: ["S01", "S02", "S03"].map((sequenceId) => ({sequenceId,
    referenceAnchors: [{state: "ENTRY", sourceFrame: 0}, {state: "HOLD", sourceFrame: 50}, {state: "HANDOFF", sourceFrame: 100}]})),
  artifacts: [{id: "candidate.png"}, {id: "reference.png"}, {id: "old-video.mp4"}],
  candidates: [],
};
const candidate = (id, frames, extra = {}) => ({id, sequenceIds: ["S01"], status: "REVIEWED_PARTIAL_PASS",
  mediaClass: "STATIC_FRAME_SET", currentLocalCandidate: true, localReview: {status: "PASS"},
  staticSamples: frames.map((sourceFrame) => ({imageArtifactId: "candidate.png", referenceArtifactId: "reference.png", sourceFrame})), ...extra});
body.candidates = [candidate("two-frames", [0, 50]), candidate("same-frame-reused", [50]),
  candidate("stale", [100], {status: "STALE_INPUT_SHA_REVIEW_ONLY"}),
  {id: "old-video", sequenceIds: ["S03"], status: "REVIEW_ONLY", artifactIds: ["old-video.mp4"]}];
const project = (value) => projectResearchProgressV1(seal(value), taskId);
const result = project(body);
assert.equal(result.counts.shotsWithLocalStaticPass, 1);
assert.equal(result.counts.uniqueLocalPassFrameIdentities, 2, "reused frames are counted once; frame zero is valid");
assert.equal(result.counts.shotsWithoutLocalStaticPass, 2);
assert.equal(result.counts.registeredWholeShotApprovals, 0);
assert.equal(result.counts.registeredRenderCount, 0);
assert.equal(result.counts.registeredVideoCandidates, 1, "zero registered renders must not hide existing video candidates");
assert.deepEqual(result.reuseBeforeMakingNewFrames[0].missingPlannedFrame, {state: "HANDOFF", sourceFrame: 100});
assert.equal(result.evidenceBoundary.dispatchAuthorized, false);

const change = (mutate) => {const value = structuredClone(body); mutate(value); return value;};
const three = project(change((v) => v.candidates[0].staticSamples.push({imageArtifactId: "candidate.png", referenceArtifactId: "reference.png", sourceFrame: 100})));
assert.equal(three.counts.registeredWholeShotApprovals, 0, "three frames never promote an entire shot");
assert.equal(three.reuseBeforeMakingNewFrames.length, 0);
const core = project(change((v) => {v.candidates[0].staticSamples[1].coreOnlyReview = {status: "PASS"}; v.candidates.splice(1, 1);}));
assert.equal(core.counts.coreOnlyFrameIdentities, 1);
assert.equal(core.reuseBeforeMakingNewFrames.length, 0, "core-only PASS does not fill a whole-frame gap");
const standaloneCore=project(change(v=>{v.candidates[0].blockers=['CORE_ONLY_WHOLE_ANCHOR_MISSING_SOURCE'];v.candidates.splice(1,1);}));
assert.equal(standaloneCore.counts.uniqueLocalPassFrameIdentities,2,'legacy count includes locally reviewed core comparisons');
assert.equal(standaloneCore.counts.uniqueWholeFramePassIdentities,0);
assert.equal(standaloneCore.counts.shotsWithWholeFrameLocalPass,0);
assert.equal(standaloneCore.counts.coreOnlyFrameIdentities,2,'structured standalone core scope must agree with the workbench even without atlas metadata');
const unknown = project(change((v) => v.candidates[0].staticSamples.push({imageArtifactId: "candidate.png", referenceArtifactId: null, sourceFrame: null})));
assert.equal(unknown.counts.passSamplesWithUnknownFrame, 1);
assert.equal(unknown.counts.uniqueLocalPassFrameIdentities, 2);
const synthetic = project(change((v) => v.candidates.push(candidate("synthetic-layout", [100], {sequenceIds: ["S02"], currentLocalCandidate: false}))));
assert.equal(synthetic.counts.shotsWithLocalStaticPass, 1, "test outputs cannot fill real shot coverage");
assert.throws(() => projectResearchProgressV1({...seal(body), taskId: "different-task"}, taskId), /manifest-invalid/u);
assert.throws(() => projectResearchProgressV1({...seal(body), sha256: "0".repeat(64)}, taskId), /sha-mismatch/u);
assert.throws(() => project(change((v) => v.candidates[0].sequenceIds = ["UNKNOWN"])), /identity-invalid/u);
assert.throws(() => project(change((v) => v.candidates.push(v.candidates[0]))), /identity-invalid/u);
assert.throws(() => project(change((v) => v.candidates[0].staticSamples[0].imageArtifactId = "missing")), /sample-invalid/u);
assert.throws(() => project(change((v) => v.summary.visuallyAcceptedCount = 4)), /manifest-invalid/u);


// Retained evidence must remain readable after crossing the old CLI-only caps.
const capacityFixture = change(value => {
  while (value.artifacts.length < MAX_RESEARCH_TASK_ARTIFACTS_V1)
    value.artifacts.push({id: `retained-${value.artifacts.length}`});
  while (value.candidates.length < MAX_RESEARCH_TASK_CANDIDATES_V1)
    value.candidates.push({id: `retained-${value.candidates.length}`, sequenceIds: ["S01"], status: "REVIEW_ONLY", artifactIds: []});
});
const capacityResult = project(capacityFixture);
assert.equal(capacityResult.counts.registeredCandidates, MAX_RESEARCH_TASK_CANDIDATES_V1);
assert.equal(capacityResult.counts.uniqueLocalPassFrameIdentities, result.counts.uniqueLocalPassFrameIdentities);
assert.equal(capacityResult.counts.registeredWholeShotApprovals, 0);
assert.equal(capacityResult.evidenceBoundary.dispatchAuthorized, false);
assert.throws(() => project({...capacityFixture, artifacts: [...capacityFixture.artifacts, {id: "over-limit"}]}), /manifest-invalid/u);
assert.throws(() => project({...capacityFixture, candidates: [...capacityFixture.candidates, {id: "over-limit"}]}), /manifest-invalid/u);
assert.throws(() => projectResearchProgressV1({...seal(capacityFixture), sha256: "0".repeat(64)}, taskId), /sha-mismatch/u);

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-progress-test-"));
try {
  const taskRoot = path.join(root, "work", taskId);
  fs.mkdirSync(taskRoot, {recursive: true});
  const file = path.join(taskRoot, "research-task-manifest-v1.json");
  const bytes = JSON.stringify(seal(body));
  fs.writeFileSync(file, bytes);
  const reads = [];
  const actual = readRegisteredResearchProgressV1({root, taskId, reads});
  assert.equal(reads.length, 1);
  assert.equal(reads[0].bytes, Buffer.byteLength(bytes));
  assert.equal(actual.counts.uniqueLocalPassFrameIdentities, 2);
  assert.equal(fs.readFileSync(file, "utf8"), bytes, "probe does not write the manifest");
  fs.writeFileSync(file, JSON.stringify(seal(capacityFixture)));
  const capacityReads = [];
  assert.equal(readRegisteredResearchProgressV1({root, taskId, reads: capacityReads}).counts.registeredCandidates, MAX_RESEARCH_TASK_CANDIDATES_V1);
  assert.equal(capacityReads.length, 1);
  assert.throws(() => readRegisteredResearchProgressV1({root, taskId: "../outside", reads}), /task-id-invalid/u);
  fs.writeFileSync(file, Buffer.alloc(8 * 1024 * 1024 + 1));
  assert.throws(() => readRegisteredResearchProgressV1({root, taskId, reads}), /size-invalid/u);
  fs.writeFileSync(file, "{bad json");
  assert.throws(() => readRegisteredResearchProgressV1({root, taskId, reads}), SyntaxError);
  fs.renameSync(file, path.join(root, "different-task.json"));
  fs.symlinkSync(path.join(root, "different-task.json"), file);
  assert.throws(() => readRegisteredResearchProgressV1({root, taskId, reads}), /path-outside-task/u);
} finally { fs.rmSync(root, {recursive: true, force: true}); }
console.log(JSON.stringify({status: "PASS", checks: ["reuse-and-frame-zero", "duplicate-frame-dedup", "stale-candidate-excluded",
  "core-versus-whole-frame", "unknown-frame-not-invented", "synthetic-output-excluded", "no-three-frame-approval",
  "existing-video-not-hidden", "metadata-tamper", "task-and-candidate-identity", "artifact-reference", "summary-bound",
  "shared-capacity-admitted", "capacity-overflow-rejected", "capacity-sha-checked", "one-exact-read-no-write", "path-admission", "size-bound", "malformed-json", "symlink-outside-task"]}, null, 2));
const cleanBody=structuredClone(body);cleanBody.input={sourceVideoSha256:'a'.repeat(64)};
cleanBody.artifacts.push({id:'clean',path:'work/frame-00100.jpg',sha256:'b'.repeat(64)});
cleanBody.sequences[0].statePackagingDecisions=[{state:'HANDOFF',sourceFrame:100,sourceVideoSha256:'a'.repeat(64),referenceSha256:'b'.repeat(64),packagingForm:'NO_PACKAGE',observation:'CLEAN_PRESENTER',packagingElementsVisible:false,reason:'Return to presenter.'}];
assert.equal(project(cleanBody).reuseBeforeMakingNewFrames.length,0);
assert.equal(project(cleanBody).counts.uniqueLocalPassFrameIdentities,2);
cleanBody.sequences[0].statePackagingDecisions[0].referenceSha256='c'.repeat(64);
assert.equal(project(cleanBody).reuseBeforeMakingNewFrames.length,1);
console.log('PASS no-package metadata exemption preserves actual frame counts and rejects SHA drift');
