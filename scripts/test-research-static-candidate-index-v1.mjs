import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {verifyResearchStaticCandidateV1} from "../work/hupo-69-shot-reconstruction-v1/build-research-task-manifest-v1.mjs";
import {readSystemLineResearchTaskManifestV1} from "../apps/studio-next/src/lib/a1-system-line-research-task-manifest-v1.mjs";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-static-index-")), taskId = "static-index-fixture";
const sourceVideoSha256 = "a".repeat(64), checks = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
fs.mkdirSync(path.join(root, "work", taskId), {recursive: true});
function file(name, bytes, mimeType) {
  const relative = `work/${taskId}/${name}`, absolute = path.join(root, relative);
  fs.writeFileSync(absolute, bytes); return {path: relative, sha256: hash(bytes), bytes: bytes.length, ...(mimeType ? {mimeType} : {})};
}
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const image = file("candidate.png", png, "image/png"), reference = file("reference.png", png, "image/png");
const review = file("review.json", Buffer.from('{"wholeShotPASS":false}'));
const input = file("receipt.json", Buffer.from('{"actual":true}'));
const proof = file("ledger.json", Buffer.from(JSON.stringify({sourceSha256: sourceVideoSha256,
  frames: [{frame: 60, path: reference.path, sha256: reference.sha256, actualPtsSeconds: 1}]})));
const entry = {id: "static-fixture", sequenceIds: ["P01"], status: "LOCAL_PASS_FULL_FAIL", mediaClass: "STATIC_FRAME_SET",
  coverageScope: "RESEARCH_SUBFRAGMENT", currentLocalCandidate: true, selectionScope: "LATEST_REVIEWED_LOCAL_COMPARISON_UNAPPROVED",
  visualApproval: false, wholeShotPASS: false, productionAdmission: false, localReview: {status: "PASS", label: "局部PASS · 整图FAIL"},
  blockers: ["WHOLE_SHOT_NOT_COMPLETE", "STATIC_VISUAL_REFERENCE_FAIL"], inputs: [input], review, existingAlternativesPreserved: [],
  staticSamples: [{id: "one", image, reference, localFrame: null, sourceFrame: 60, visualApproval: false,
    referenceClock: {status: "BOUND_EXISTING_LEDGER", seconds: 1, proof}}]};
async function verifyDeclaredFile(relative, expected, {strictBytes}) {
  const absolute = path.join(root, relative), bytes = fs.readFileSync(absolute), stat = fs.statSync(absolute);
  if (expected.path !== relative || hash(bytes) !== expected.sha256 || strictBytes && bytes.length !== expected.bytes) {
    throw new Error("research-evidence-binding-mismatch");
  }
  return {path: relative, sha256: hash(bytes), bytes: stat.size, device: stat.dev, inode: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs};
}
const verify = (value) => verifyResearchStaticCandidateV1(value, {repoRoot: root, sourceVideoSha256, verifyDeclaredFile});
try {
  const paths = await verify(entry); assert.equal(paths.length, 5); checks.push("registered-PNG-and-exact-ledger-positive");
  const wholeFramePass=structuredClone(entry);wholeFramePass.blockers=['WHOLE_SHOT_NOT_COMPLETE'];
  wholeFramePass.localReview.label='完整静帧近似通过';
  assert.equal((await verify(wholeFramePass)).length,5);checks.push('complete-static-pass-does-not-require-false-visual-failure');
  const unlabelledFailure=structuredClone(wholeFramePass);unlabelledFailure.localReview.status='VISUAL_FAIL';
  await assert.rejects(verify(unlabelledFailure),/static-entry-invalid/);checks.push('visual-failure-still-requires-failure-blocker');
  const unknown = structuredClone(entry); unknown.staticSamples[0].reference = null;
  unknown.staticSamples[0].sourceFrame = null; unknown.staticSamples[0].referenceClock = {status: "UNKNOWN", seconds: null, proof: null};
  assert.equal((await verify(unknown)).length, 3); checks.push("missing-reference-and-PTS-remain-null");
  const cases = [
    ["wrong-image-SHA", (e) => e.staticSamples[0].image.sha256 = "0".repeat(64)],
    ["wrong-receipt-SHA", (e) => e.inputs[0].sha256 = "0".repeat(64)],
    ["wrong-byte-count", (e) => e.staticSamples[0].image.bytes++],
    ["path-traversal", (e) => e.staticSamples[0].image.path = "work/../candidate.png"],
    ["unknown-MIME", (e) => e.staticSamples[0].image.mimeType = "image/svg+xml"],
    ["MIME-extension-mismatch", (e) => e.staticSamples[0].image.mimeType = "image/jpeg"],
    ["false-ledger-time", (e) => e.staticSamples[0].referenceClock.seconds = 2],
    ["guessed-unknown-time", (e) => e.staticSamples[0].referenceClock = {status: "UNKNOWN", seconds: 1, proof: null}],
    ["duplicate-sample", (e) => e.staticSamples.push(structuredClone(e.staticSamples[0]))],
    ["production-promotion", (e) => e.productionAdmission = true],
    ["visual-promotion", (e) => e.visualApproval = true],
    ["static-playback-clock", (e) => e.referenceStartSeconds = 1],
  ];
  for (const [name, mutate] of cases) {const changed = structuredClone(entry); mutate(changed); await assert.rejects(verify(changed)); checks.push(name + "-rejected");}
  const fake = file("fake.png", Buffer.from("not an image"), "image/png"), badSignature = structuredClone(entry);
  badSignature.staticSamples[0].image = fake; await assert.rejects(verify(badSignature), /signature-invalid/); checks.push("fake-PNG-signature-rejected");
  fs.symlinkSync(path.join(root, image.path), path.join(root, "work", taskId, "linked.png"));
  const linked = structuredClone(entry); linked.staticSamples[0].image.path = `work/${taskId}/linked.png`;
  await assert.rejects(verify(linked), /path-invalid/); checks.push("symlink-rejected");
  const artifacts = await Promise.all(paths.map((relative) => verifyDeclaredFile(relative,
    [image, reference, proof, review, input].find((fact) => fact.path === relative), {strictBytes: true})));
  for (const item of artifacts) {item.id = item.path; item.label = path.basename(item.path);}
  const projected = {...entry, artifactIds: paths, staticSamples: [{id: "one", imageArtifactId: image.path, mimeType: "image/png",
    referenceArtifactId: reference.path, referenceMimeType: "image/png", localFrame: null, sourceFrame: 60, visualApproval: false,
    referenceClock: {status: "BOUND_EXISTING_LEDGER", seconds: 1, proofArtifactId: proof.path}}]};
  delete projected.inputs; delete projected.review;
  const body = {contract: "A1SystemLineResearchTaskManifest/v1", taskId, title: "Static fixture", scope: "RESEARCH_ONLY", productionAdmission: false,
    status: "REVIEW_ONLY", input: {planPath: review.path, planSha256: review.sha256, sourceLockPath: review.path,
      sourceLockSha256: review.sha256, sourceVideoSha256, sourceDurationSeconds: 10, fps: 60},
    summary: {sequenceCount: 1, cueCount: 0, asrDraftCount: 0, registeredRenderCount: 0, candidateCoverageCount: 1, visuallyAcceptedCount: 0},
    nodes: [], nodeRuns: [], blockers: [], artifacts, candidates: [projected],
    sequences: [{sequenceId: "P01", order: 1, sourceFrames: [0, 600], sourceTimeSeconds: [0, 10], cueIds: [], spokenCopyStatus: "UNKNOWN",
      designedCopyStatus: "UNKNOWN", renderStatus: "REVIEW_ONLY", visualReviewStatus: "FAIL", blockers: []}]};
  const manifestPath = path.join(root, "work", taskId, "research-task-manifest-v1.json");
  const write = (value) => fs.writeFileSync(manifestPath, JSON.stringify({...value, sha256: nodeInputHash(value)}));
  write(body); const read = await readSystemLineResearchTaskManifestV1({repoRoot: root, taskId});
  assert.equal(read.candidates[0].mediaClass, "STATIC_FRAME_SET"); assert.equal(read.candidates[0].wholeShotPASS, false);
  checks.push("normal-manifest-reader-static-roundtrip");
  const fullPassBody=structuredClone(body);fullPassBody.candidates[0].blockers=['WHOLE_SHOT_NOT_COMPLETE'];
  write(fullPassBody);assert.equal((await readSystemLineResearchTaskManifestV1({repoRoot:root,taskId})).candidates[0].localReview.status,'PASS');
  checks.push('normal-reader-complete-static-pass-without-false-failure');
  for (const [name, mutate] of [
    ["reader-unknown-MIME", (b) => b.candidates[0].staticSamples[0].mimeType = "unknown"],
    ["reader-unregistered-reference", (b) => b.candidates[0].staticSamples[0].referenceArtifactId = "missing"],
    ["reader-false-ledger-time", (b) => b.candidates[0].staticSamples[0].referenceClock.seconds = 2],
    ["reader-promote-whole-shot", (b) => b.candidates[0].wholeShotPASS = true],
    ["reader-bad-artifact-SHA", (b) => b.artifacts[0].sha256 = "0".repeat(64)],
    ["reader-path-traversal", (b) => b.artifacts[0].path = "work/../outside.png"],
  ]) {const changed = structuredClone(body); mutate(changed); write(changed);
    await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot: root, taskId})); checks.push(name + "-rejected");}
  console.log(JSON.stringify({status: "PASS", count: checks.length, checks, browser: 0, render: 0}, null, 2));
} finally {fs.rmSync(root, {recursive: true, force: true});}
