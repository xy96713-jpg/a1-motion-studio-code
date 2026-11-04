#!/usr/bin/env node
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {readSystemLineResearchTaskManifestV1, A1_SYSTEM_LINE_RESEARCH_TASK_MANIFEST_V1, INLINE_ARTIFACT_SHA_LIMIT_V1, MAX_RESEARCH_TASK_ARTIFACTS_V1} from "../apps/studio-next/src/lib/a1-system-line-research-task-manifest-v1.mjs";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "a1-research-task-manifest-"));
const repoRoot = path.join(temp, "repo"), taskId = "cross-theme-fixture";
const taskRoot = path.join(repoRoot, "work", taskId);
fs.mkdirSync(taskRoot, {recursive: true});
const artifactPath = path.join(taskRoot, "candidate.json"), artifactBytes = Buffer.from('{"status":"review-only"}\n');
fs.writeFileSync(artifactPath, artifactBytes);
const artifact = {id: "candidate", label: "review-only candidate", path: `work/${taskId}/candidate.json`,
  sha256: createHash("sha256").update(artifactBytes).digest("hex"), bytes: artifactBytes.length};
const extraPath = path.join(taskRoot, "notes.json"), extraBytes = Buffer.from('{"notes":true}\n');
fs.writeFileSync(extraPath, extraBytes);
const extraArtifact = {id: "notes", label: "research notes", path: `work/${taskId}/notes.json`,
  sha256: createHash("sha256").update(extraBytes).digest("hex"), bytes: extraBytes.length};
const largePath = path.join(taskRoot, "large.mov"), largeBytes = INLINE_ARTIFACT_SHA_LIMIT_V1 + 1;
fs.writeFileSync(largePath, Buffer.alloc(largeBytes));
const largeHash = createHash("sha256").update(fs.readFileSync(largePath)).digest("hex"), largeStat = fs.statSync(largePath);
const largeArtifact = {id: "large", label: "large alpha layer", path: `work/${taskId}/large.mov`, sha256: largeHash,
  bytes: largeStat.size, device: largeStat.dev, inode: largeStat.ino, mtimeMs: largeStat.mtimeMs, ctimeMs: largeStat.ctimeMs};
const seal = (body) => ({...body, sha256: nodeInputHash(body)});
const body = {contract: A1_SYSTEM_LINE_RESEARCH_TASK_MANIFEST_V1, taskId, title: "Cross-theme research fixture",
  status: "REVIEW_ONLY", scope: "RESEARCH_ONLY", productionAdmission: false, generatedAt: "2026-09-27T00:00:00.000Z",
  input: {planPath: `work/${taskId}/candidate.json`, planSha256: artifact.sha256, sourceLockPath: `work/${taskId}/candidate.json`, sourceLockSha256: artifact.sha256, sourceVideoSha256: "a".repeat(64), sourceDurationSeconds: 10, fps: 60},
  summary: {sequenceCount: 1, cueCount: 1, asrDraftCount: 1, registeredRenderCount: 0, candidateCoverageCount: 1, visuallyAcceptedCount: 0},
  blockers: ["VISUAL_REVIEW_REQUIRED"], nodes: [{id: "render", label: "Render", status: "REVIEW_REQUIRED", dependsOn: [], blockers: ["VISUAL_REVIEW_REQUIRED"]}],
  sequences: [{sequenceId: "S01", order: 1, sourceFrames: [0, 600], sourceTimeSeconds: [0, 10], cueIds: [0], spokenCopyStatus: "LOCKED", designedCopyStatus: "LOCKED", renderStatus: "REVIEW_ONLY", visualReviewStatus: "PENDING", blockers: []}],
  candidates: [{id: "candidate-v1", sequenceIds: ["S01"], status: "REVIEW_ONLY", artifactIds: ["candidate"], visualApproval: false, blockers: ["VISUAL_REVIEW_REQUIRED"],
    inputBinding: [{name: "renderer", path: extraArtifact.path, expectedSha256: extraArtifact.sha256, actualSha256: extraArtifact.sha256,
      status: "SHA_MATCH", expectedByteCount: extraArtifact.bytes, actualByteCount: extraArtifact.bytes, byteCountWarning: false}]}],
  artifacts: [artifact, extraArtifact, largeArtifact], nodeRuns: []};
const manifestPath = path.join(taskRoot, "research-task-manifest-v1.json");
fs.writeFileSync(manifestPath, JSON.stringify(seal(body), null, 2));

try {
  const valid = await readSystemLineResearchTaskManifestV1({repoRoot, taskId});
  assert.equal(valid.contract, "A1SystemLineResearchTaskProjection/v1");
  assert.equal(valid.productionAdmission, false);
  assert.equal(valid.manifestSha256, seal(body).sha256);
  assert.equal(valid.artifacts[0].status, "VERIFIED");
  assert.equal(valid.artifacts[2].status, "SHA_DEFERRED_METADATA_MATCH");
  assert.equal(valid.artifacts[2].sha256VerifiedNow, false);
  assert.equal(valid.sequences.length, 1);
  assert.equal(valid.summary.currentCandidateCoverageCount, 1);
  const changedMetadata = new Date(Date.now() - 12000);
  fs.utimesSync(artifactPath, changedMetadata, changedMetadata);
  const [readA, readB] = await Promise.all([
    readSystemLineResearchTaskManifestV1({repoRoot, taskId}),
    readSystemLineResearchTaskManifestV1({repoRoot, taskId}),
  ]);
  assert.strictEqual(readA, readB, "identical concurrent reads share one verification");
  const verifiedIdentity = readA.artifacts[0].verifiedFileIdentity, actualStat = fs.statSync(artifactPath);
  assert.equal(readA.artifacts[0].sha256, artifact.sha256);
  assert.equal(verifiedIdentity.device, actualStat.dev);
  assert.equal(verifiedIdentity.inode, actualStat.ino);
  assert.equal(verifiedIdentity.bytes, actualStat.size);
  assert.equal(verifiedIdentity.mtimeMs, actualStat.mtimeMs);
  assert.equal(verifiedIdentity.ctimeMs, actualStat.ctimeMs);
  // Subsequent mutation must be checked again, rather than reusing the completed read.
  fs.writeFileSync(artifactPath, Buffer.from('same length other bytes!!'));
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot, taskId}), /artifact-(?:size|sha)-mismatch/);
  fs.writeFileSync(artifactPath, artifactBytes);

  const verifiedLarge = await readSystemLineResearchTaskManifestV1({repoRoot, taskId, verifyArtifactIds: ["large"]});
  assert.equal(verifiedLarge.artifacts[2].status, "VERIFIED");
  assert.equal(verifiedLarge.artifacts[2].sha256VerifiedNow, true);
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot, taskId, verifyArtifactIds: ["missing"]}), /artifact-not-found/);
  const expanded = structuredClone(body);
  expanded.artifacts.push(...Array.from({length:126},(_,i)=>({...extraArtifact,id:`extra-${i}`})));
  fs.writeFileSync(manifestPath,JSON.stringify(seal(expanded)));
  assert.equal((await readSystemLineResearchTaskManifestV1({repoRoot,taskId})).artifacts.length,129);
  expanded.artifacts.push(...Array.from({length:896},(_,i)=>({...extraArtifact,id:`overflow-${i}`})));
  fs.writeFileSync(manifestPath,JSON.stringify(seal(expanded)));
  assert.equal((await readSystemLineResearchTaskManifestV1({repoRoot,taskId})).artifacts.length,1025,'full timeline source references remain readable');
  expanded.artifacts.push(...Array.from({length:MAX_RESEARCH_TASK_ARTIFACTS_V1+1-expanded.artifacts.length},(_,i)=>({...extraArtifact,id:`bounded-overflow-${i}`})));
  fs.writeFileSync(manifestPath,JSON.stringify(seal(expanded)));
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot,taskId}),/artifact-limit-invalid/);
  fs.writeFileSync(manifestPath,JSON.stringify(seal(body)));

  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot, taskId: "../outside"}), /task-id-invalid/);

  fs.writeFileSync(extraPath, Buffer.from('{"notes":"new renderer input"}\n'));
  const stale = await readSystemLineResearchTaskManifestV1({repoRoot, taskId});
  assert.equal(stale.artifacts[1].status, "STALE_INPUT_SHA");
  assert.equal(stale.candidates[0].status, "STALE_INPUT_SHA_REVIEW_ONLY");
  assert.equal(stale.sequences[0].renderStatus, "STALE_CANDIDATE_REVIEW_ONLY");
  assert.equal(stale.summary.currentCandidateCoverageCount, 0);
  assert.equal(stale.summary.staleCandidateCoverageCount, 1);
  fs.writeFileSync(extraPath, extraBytes);

  const mismatch = Buffer.from("changed after manifest\n");
  fs.writeFileSync(artifactPath, mismatch);
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot, taskId}), /artifact-(?:size|sha)-mismatch/);

  fs.writeFileSync(artifactPath, artifactBytes);
  const traversal = structuredClone(body);
  traversal.artifacts[1].path = `work/${taskId}/../outside.json`;
  fs.writeFileSync(manifestPath, JSON.stringify(seal(traversal), null, 2));
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot, taskId}), /artifact-(?:entry|path)-invalid/);

  const badSummary = structuredClone(body);
  badSummary.summary.sequenceCount = 0;
  fs.writeFileSync(manifestPath, JSON.stringify(seal(badSummary), null, 2));
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot, taskId}), /summary-invalid/);

  const badFrames = structuredClone(body);
  badFrames.sequences[0].sourceFrames = [10, 0];
  fs.writeFileSync(manifestPath, JSON.stringify(seal(badFrames), null, 2));
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot, taskId}), /sequence-invalid/);

  const badMetadata = structuredClone(body);
  badMetadata.artifacts[2].ctimeMs += 1;
  fs.writeFileSync(manifestPath, JSON.stringify(seal(badMetadata), null, 2));
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot, taskId}), /metadata-mismatch/);

  fs.writeFileSync(manifestPath, JSON.stringify(seal(body), null, 2));
  const outsidePath = path.join(repoRoot, "outside.json");
  fs.writeFileSync(outsidePath, artifactBytes);
  fs.unlinkSync(artifactPath);
  fs.symlinkSync(outsidePath, artifactPath);
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot, taskId}), /artifact-file-invalid/);
  fs.unlinkSync(artifactPath);
  fs.writeFileSync(artifactPath, artifactBytes);

  fs.writeFileSync(manifestPath, JSON.stringify({...seal(body), sha256: "0".repeat(64)}, null, 2));
  await assert.rejects(readSystemLineResearchTaskManifestV1({repoRoot, taskId}), /manifest-sha-mismatch/);
  console.log(JSON.stringify({status: "PASS", checks: ["manifest-contract-and-sha", "work-scoped-task-id", "small-file-sha", "fresh-verified-file-identity", "inflight-read-only-dedup-no-completed-cache", "large-file-metadata-fast-path", "on-demand-large-file-sha", "candidate-input-drift-stales-only-candidate", "unknown-artifact-block", "path-traversal-block", "work-outside-symlink-block", "summary-and-sequence-schema", "metadata-tamper-block", "manifest-tamper-block", "research-only-admission"]}, null, 2));
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
