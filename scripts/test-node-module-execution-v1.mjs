#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {executeRegisteredNode, createNodeAdapterRegistry,
  createNodeArtifactVerificationContextV1, getNodeArtifactVerificationContextSummaryV1,
  closeNodeArtifactVerificationContextV1, NODE_ARTIFACT_VERIFICATION_ATTESTATION_V1} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts, NODE_ARTIFACT_MANIFEST_CONTRACT} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";

const ffmpegPath = process.env.A1_TEST_FFMPEG_PATH || "/Users/a1/.local/bin/ffmpeg";
const ffprobePath = process.env.A1_TEST_FFPROBE_PATH || "/Users/a1/.local/bin/ffprobe";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-module-execution-v1-"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const moduleId = "verification-consumer";
const moduleImplementationSha256 = sha256(Buffer.from("synthetic-verification-consumer-v1", "utf8"));

function runCli(binary, args, {timeout = 120_000, maxBuffer = 2 * 1024 * 1024} = {}) {
  return execFileSync(binary, args, {encoding: "utf8", timeout, maxBuffer, stdio: ["ignore", "pipe", "pipe"]});
}

async function acceptSyntheticVideo(filename) {
  const bytes = fs.readFileSync(filename), relativePath = path.basename(filename), nodeId = "source:verification-context";
  const artifactManifest = {
    contract: NODE_ARTIFACT_MANIFEST_CONTRACT,
    nodeId,
    inputSha256: sha256(Buffer.from(`${nodeId}/input`, "utf8")),
    productionAdmission: false,
    artifacts: [{path: relativePath, role: "source-video", kind: "VIDEO",
      expectedMedia: {width: 160, height: 90, fps: 30}, sha256: sha256(bytes), bytes: bytes.length}],
  };
  const accepted = await acceptNodeArtifacts({scope: "REVIEW_ONLY", productionAdmission: false,
    nodes: [{id: nodeId, inputSha256: artifactManifest.inputSha256, state: "needs-review",
      result: {state: "needs-review", productionAdmission: false, artifactManifest}, acceptance: null}]}, nodeId,
  {artifactRoot: path.dirname(filename), reviewerId: "verification-context-source-acceptance", ffprobePath});
  return accepted.nodes[0];
}

function makeWorkflow(sourceNode, childIds, now = Date.now()) {
  const children = childIds.map((id, index) => {
    const input = {projectId: "synthetic-verification-context-test", module: moduleId, moduleVersion: 1,
      implementationSha256: moduleImplementationSha256, need: true, context: {}, shot: {id, source: "Synthetic verification consumer."}};
    const inputSha256 = nodeInputHash({input, dependencies: {inputs: [{id: sourceNode.id,
      inputSha256: sourceNode.inputSha256, acceptedManifestSha256: sourceNode.acceptance.manifestSha256}],
      artifactKinds: {[sourceNode.id]: ["VIDEO"]}}});
    return {id, shotId: id, module: moduleId, input, inputSha256,
      dependencies: [sourceNode.id], dependencyArtifactKinds: {[sourceNode.id]: ["VIDEO"]},
      state: "running", reason: null, attempt: 1, maxAttempts: 2, acceptance: null,
      lease: {workerId: "verification-context-test", token: `lease-${index}-${id}`, expiresAt: now + 120_000}};
  });
  return {scope: "REVIEW_ONLY", productionAdmission: false,
    modules: {[moduleId]: {label: "synthetic consumer", version: 1, available: true, optional: true,
      implementationSha256: moduleImplementationSha256}}, nodes: [sourceNode, ...children]};
}

const calls = [];
const consumerAdapter = {
  label: "synthetic verification consumer", version: 1, implementationSha256: moduleImplementationSha256,
  enabled: true, optional: true,
  async execute(node, context) {
    const source = context.dependencies[node.dependencies[0]];
    const attestation = source.verificationAttestation;
    if (attestation) {
      assert.equal(attestation.contract, NODE_ARTIFACT_VERIFICATION_ATTESTATION_V1);
      assert.equal(attestation.acceptedNodeId, source.nodeId);
      assert.equal(attestation.manifestSha256, source.manifestSha256);
      assert.equal(attestation.sourceVideoSha256, source.artifacts[0].sha256);
      calls.push({nodeId: node.id, contextId: attestation.contextId, sourcePath: attestation.artifacts[0].absolutePath});
    } else {
      assert.equal(context.verificationContext, undefined, "no-context calls keep the legacy verified dependency shape");
      calls.push({nodeId: node.id, contextId: null, sourcePath: source.artifacts[0].absolutePath});
    }
    return {state: "needs-review", reason: "SYNTHETIC_CONTEXT_TEST", visualApproval: "NOT_GRANTED", productionAdmission: false};
  },
};
const registry = createNodeAdapterRegistry({[moduleId]: consumerAdapter});

async function runClaim(workflow, node, context, {toolPath = ffprobePath} = {}) {
  return executeRegisteredNode(workflow, node, {registry: registry.registry, artifactRoot: tempRoot,
    verificationContext: context, ffprobePath: toolPath});
}

async function main() {
  assert.ok(fs.existsSync(ffmpegPath), `synthetic FFmpeg unavailable: ${ffmpegPath}`);
  assert.ok(fs.existsSync(ffprobePath), `trusted FFprobe unavailable: ${ffprobePath}`);
  const sourcePath = path.join(tempRoot, "synthetic-source.mp4");
  runCli(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
    "testsrc2=size=160x90:rate=30:duration=2", "-frames:v", "60", "-c:v", "libx264", "-preset", "ultrafast",
    "-crf", "0", "-pix_fmt", "yuv420p", "-g", "30", "-bf", "0", "-x264-params", "open-gop=0",
    "-fps_mode", "cfr", "-threads", "1", "-y", sourcePath]);
  const originalBytes = fs.readFileSync(sourcePath);
  const sourceNode = await acceptSyntheticVideo(sourcePath);
  const context = createNodeArtifactVerificationContextV1({ffprobePath});
  assert.equal(context.enabled, true);
  const workflow = makeWorkflow(sourceNode, ["consumer:one", "consumer:two"]);
  const children = workflow.nodes.slice(1);
  const concurrent = await Promise.all(children.map((node) => runClaim(workflow, node, context)));
  assert.ok(concurrent.every((result) => result.state === "needs-review"), JSON.stringify(concurrent));
  assert.equal(new Set(calls.map((call) => call.contextId)).size, 1);
  const firstSummary = getNodeArtifactVerificationContextSummaryV1(context);
  assert.equal(firstSummary.counters.sourceVideoShaPassCount, 1);
  assert.equal(firstSummary.counters.sourceVideoBytesHashed, originalBytes.length);
  assert.equal(firstSummary.counters.genericMediaMetadataProbeCount, 1);
  assert.equal(firstSummary.counters.toolVersionProbeProcessCount, 1);
  assert.equal(firstSummary.counters.inFlightCoalescedWaitCount, 1);
  assert.equal(firstSummary.counters.cacheHitCount + firstSummary.counters.inFlightCoalescedWaitCount, 1);
  const noContextWorkflow = makeWorkflow(sourceNode, ["consumer:no-context"]);
  const noContextResult = await runClaim(noContextWorkflow, noContextWorkflow.nodes[1], null);
  assert.equal(noContextResult.state, "needs-review");
  assert.equal(calls.at(-1).contextId, null, "calls without an explicit context retain the legacy verification path");

  const currentStats = getNodeArtifactVerificationContextSummaryV1(context);
  assert.equal(currentStats.acceptedNodeVerificationCacheEntryCount, 1);
  const changedBytes = Buffer.from(originalBytes);
  changedBytes[Math.floor(changedBytes.length / 2)] ^= 0x01;
  fs.writeFileSync(sourcePath, changedBytes);
  const mutatedWorkflow = makeWorkflow(sourceNode, ["consumer:mutated"]);
  const mutatedResult = await runClaim(mutatedWorkflow, mutatedWorkflow.nodes[1], context);
  assert.equal(mutatedResult.state, "blocked");
  assert.equal(mutatedResult.reason, "DEPENDENCY_ARTIFACT_VERIFICATION_FAILED");
  assert.equal(getNodeArtifactVerificationContextSummaryV1(context).counters.invalidationCount, 1);

  const restorePath = path.join(tempRoot, "restored-source.mp4");
  fs.writeFileSync(restorePath, originalBytes);
  fs.renameSync(restorePath, sourcePath);
  const restoredWorkflow = makeWorkflow(sourceNode, ["consumer:restored"]);
  const restoredResult = await runClaim(restoredWorkflow, restoredWorkflow.nodes[1], context);
  assert.equal(restoredResult.state, "needs-review", "restored accepted bytes must receive fresh SHA and media verification");
  assert.equal(getNodeArtifactVerificationContextSummaryV1(context).counters.sourceVideoShaPassCount, 3);
  assert.equal(getNodeArtifactVerificationContextSummaryV1(context).counters.genericMediaMetadataProbeCount, 2);

  const replacementPath = path.join(tempRoot, "replacement-source.mp4");
  fs.writeFileSync(replacementPath, originalBytes);
  fs.renameSync(replacementPath, sourcePath);
  const replacedWorkflow = makeWorkflow(sourceNode, ["consumer:replacement"]);
  const replacedResult = await runClaim(replacedWorkflow, replacedWorkflow.nodes[1], context);
  assert.equal(replacedResult.state, "needs-review", "same accepted bytes at a new inode must be fully reverified");
  assert.equal(getNodeArtifactVerificationContextSummaryV1(context).counters.sourceVideoShaPassCount, 4);
  assert.equal(getNodeArtifactVerificationContextSummaryV1(context).counters.genericMediaMetadataProbeCount, 3);
  const cachedWorkflow = makeWorkflow(sourceNode, ["consumer:cache-hit"]);
  const cachedResult = await runClaim(cachedWorkflow, cachedWorkflow.nodes[1], context);
  assert.equal(cachedResult.state, "needs-review");

  const raceSourceNode = structuredClone(sourceNode);
  const raceWorkflow = makeWorkflow(raceSourceNode, ["consumer:receipt-change-before-adapter"]);
  const raceExecution = runClaim(raceWorkflow, raceWorkflow.nodes[1], context);
  raceSourceNode.acceptance.manifestSha256 = "e".repeat(64);
  const raceResult = await raceExecution;
  assert.equal(raceResult.state, "blocked",
    "a receipt changed after cache lookup but before adapter use must not pass on the old attestation");
  assert.equal(raceResult.reason, "DEPENDENCY_ARTIFACT_VERIFICATION_FAILED");

  const changedReceiptNode = structuredClone(sourceNode);
  changedReceiptNode.acceptance.manifestSha256 = "f".repeat(64);
  const changedReceiptWorkflow = makeWorkflow(changedReceiptNode, ["consumer:changed-receipt"]);
  const changedReceiptResult = await runClaim(changedReceiptWorkflow, changedReceiptWorkflow.nodes[1], context);
  assert.equal(changedReceiptResult.state, "blocked",
    "a changed accepted receipt must not be served from a prior cache entry");
  assert.equal(changedReceiptResult.reason, "DEPENDENCY_ARTIFACT_VERIFICATION_FAILED");

  const finalSummary = getNodeArtifactVerificationContextSummaryV1(context);
  assert.equal(finalSummary.counters.sourceVideoShaPassCount, 4,
    "stable identity reuse must skip another full source hash pass");
  assert.equal(finalSummary.counters.genericMediaMetadataProbeCount, 3,
    "stable identity reuse must skip another generic media probe");
  assert.equal(finalSummary.counters.cacheHitCount, 2);
  assert.equal(finalSummary.counters.invalidationCount, 3);

  const mismatchWorkflow = makeWorkflow(sourceNode, ["consumer:tool-path-mismatch"]);
  const mismatchResult = await runClaim(mismatchWorkflow, mismatchWorkflow.nodes[1], context, {toolPath: ffmpegPath});
  assert.equal(mismatchResult.state, "blocked");
  assert.equal(mismatchResult.reason, "RUN_SCOPED_VERIFICATION_TOOL_PATH_MISMATCH");

  const newProcessContext = createNodeArtifactVerificationContextV1({ffprobePath});
  assert.notEqual(newProcessContext.contextId, context.contextId);
  const newProcessWorkflow = makeWorkflow(sourceNode, ["consumer:new-context"]);
  const newProcessResult = await runClaim(newProcessWorkflow, newProcessWorkflow.nodes[1], newProcessContext);
  assert.equal(newProcessResult.state, "needs-review");
  const newProcessSummary = getNodeArtifactVerificationContextSummaryV1(newProcessContext);
  assert.equal(newProcessSummary.counters.sourceVideoShaPassCount, 1,
    "a new process context must perform fresh verification rather than reuse prior context state");
  assert.equal(newProcessSummary.counters.genericMediaMetadataProbeCount, 1);

  const copiedToolPath = path.join(fs.realpathSync(tempRoot), "ffprobe-copy");
  fs.copyFileSync(ffprobePath, copiedToolPath);
  fs.chmodSync(copiedToolPath, 0o700);
  const toolContext = createNodeArtifactVerificationContextV1({ffprobePath: copiedToolPath});
  assert.equal(toolContext.enabled, true);
  const toolWorkflow = makeWorkflow(sourceNode, ["consumer:tool-identity"]);
  const toolAccepted = await runClaim(toolWorkflow, toolWorkflow.nodes[1], toolContext,
    {toolPath: copiedToolPath});
  assert.equal(toolAccepted.state, "needs-review");
  const toolFd = fs.openSync(copiedToolPath, "r+");
  try {
    const lastByte = Buffer.alloc(1);
    const lastOffset = fs.fstatSync(toolFd).size - 1;
    fs.readSync(toolFd, lastByte, 0, 1, lastOffset);
    lastByte[0] ^= 0x01;
    fs.writeSync(toolFd, lastByte, 0, 1, lastOffset);
  } finally {
    fs.closeSync(toolFd);
  }
  const changedToolWorkflow = makeWorkflow(sourceNode, ["consumer:changed-tool"]);
  const changedToolResult = await runClaim(changedToolWorkflow, changedToolWorkflow.nodes[1], toolContext,
    {toolPath: copiedToolPath});
  assert.equal(changedToolResult.state, "blocked");
  assert.equal(changedToolResult.reason, "RUN_SCOPED_VERIFICATION_TOOL_CHANGED",
    "a mutated verifier binary must invalidate the run context and fail closed");

  const closingContext = createNodeArtifactVerificationContextV1({ffprobePath});
  const closingWorkflow = makeWorkflow(sourceNode, ["consumer:close-during-verification"]);
  const inFlightExecution = runClaim(closingWorkflow, closingWorkflow.nodes[1], closingContext);
  closeNodeArtifactVerificationContextV1(closingContext);
  const closedExecutionResult = await inFlightExecution;
  assert.equal(closedExecutionResult.state, "blocked");
  assert.equal(closedExecutionResult.reason, "RUN_SCOPED_VERIFICATION_CONTEXT_CLOSED",
    "closing during dependency verification must stop the pending child");
  const closingSummary = getNodeArtifactVerificationContextSummaryV1(closingContext);
  assert.equal(closingSummary.acceptedNodeVerificationCacheEntryCount, 0,
    "a verification that finishes after close must not repopulate the context");
  assert.equal(closingSummary.inFlightVerificationCount, 0);

  closeNodeArtifactVerificationContextV1(context);
  closeNodeArtifactVerificationContextV1(newProcessContext);
  closeNodeArtifactVerificationContextV1(toolContext);
  assert.equal(getNodeArtifactVerificationContextSummaryV1(context).acceptedNodeVerificationCacheEntryCount, 0);
  console.log(`PASS node-module-execution-v1: process-local verification reuse; first source checks=${JSON.stringify({versionProbes:firstSummary.counters.toolVersionProbeProcessCount,sourceShaPasses:firstSummary.counters.sourceVideoShaPassCount,sourceBytes:firstSummary.counters.sourceVideoBytesHashed,metadataProbes:firstSummary.counters.genericMediaMetadataProbeCount,inFlightCoalesces:firstSummary.counters.inFlightCoalescedWaitCount})}; final context counters=${JSON.stringify(finalSummary.counters)}; changed bytes/receipt/verifier fail closed, restored/replaced files reverify, new context starts cold, close-during-verification fails closed`);
}

try {
  await main();
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
