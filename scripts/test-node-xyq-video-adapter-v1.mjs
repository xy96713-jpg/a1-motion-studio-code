#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {execFileSync} from "node:child_process";
import {createXyqVideoNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-xyq-video-adapter-v1.mjs";
import {mediaSha256} from "../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs";
import {verifyNodeArtifactManifest} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-xyq-adapter-"));
const image = path.join(root, "first.png"), lastImage = path.join(root, "last.png"), clip = path.join(root, "fixture.mp4");
const receipt = {thread_id: "fixture-thread", run_id: "fixture-run", web_thread_link: "https://xyq.jianying.com/thread/fixture-thread"};
const calls = [], checkpoints = [];
let milliseconds = 100000, completed = false;
try {
  // Local test media only: no provider or paid command is invoked.
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:r=10:d=0.3", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
  execFileSync("ffmpeg", ["-v", "error", "-i", clip, "-frames:v", "1", image]);
  fs.copyFileSync(image, lastImage);
  const frameSha = mediaSha256(fs.readFileSync(image));
  const parameters = {submitAuthorized: true, motion: true, startFrameSha256: frameSha, startFrameReview: {status: "PASS", sha256: frameSha},
    request: {prompt: "用户原文 $() `不经 shell`", model: "explicit-provider-model", duration: 5,
      images: [{path: image, sha256: frameSha, referenceOnly: false}]}};
  const nodeFor = () => ({id: "shot:xyq-video", module: "xyq-video", inputSha256: "a".repeat(64), input: {parameters: structuredClone(parameters)}});
  const executeFixture = async (command, args, options) => {
    calls.push({command, args, options});
    if (args[0] === "generate-video") return {stdout: JSON.stringify(receipt)};
    assert.equal(args[0], "query-result");
    assert.equal(args[args.indexOf("--thread-id") + 1], receipt.thread_id);
    assert.equal(args[args.indexOf("--run-id") + 1], receipt.run_id);
    const directory = args[args.indexOf("--download-dir") + 1];
    if (!completed) return {stdout: JSON.stringify({completed: false})};
    const output = path.join(directory, "video.mp4"); fs.copyFileSync(clip, output);
    return {stdout: JSON.stringify({completed: true, videos: [{output_path: output}]})};
  };
  const makeAdapter = (exec = executeFixture) => createXyqVideoNodeAdapterV1({cliPath: process.execPath, execFileAsync: exec, now: () => milliseconds});
  const node = nodeFor();
  const context = {artifactRoot: path.join(root, "artifacts"), checkpoint: async (progress) => {
    checkpoints.push(structuredClone(progress)); node.progress = structuredClone(progress); return progress;
  }};
  const unauthorized = nodeFor(); unauthorized.input.parameters.submitAuthorized = false;
  assert.equal((await makeAdapter().execute(unauthorized, context)).reason, "REMOTE_SUBMIT_AUTHORIZATION_REQUIRED");
  assert.equal(calls.length, 0);
  const first = await makeAdapter().execute(node, context);
  assert.equal(first.reason, "REMOTE_JOB_PENDING");
  assert.equal(first.web_thread_link, receipt.web_thread_link);
  assert.equal(checkpoints[0].status, "SUBMITTING");
  assert.deepEqual(node.progress.providerReceipt, receipt);
  assert.equal(node.progress.status, "PENDING");
  const submitArgs = calls[0].args;
  assert.deepEqual(submitArgs, ["generate-video", "--prompt", parameters.request.prompt, "--model", parameters.request.model, "--duration", "5", "--image", image]);
  assert.equal(calls[0].options.shell, undefined);
  assert.equal(calls.length, 2);
  assert.equal((await makeAdapter().execute(node, context)).reason, "REMOTE_JOB_PENDING");
  assert.equal(calls.length, 2, "poll throttle prevents repeated query clicks");

  // Reconstruct the adapter and node from persisted checkpoint, as after a restart.
  const resumed = JSON.parse(JSON.stringify(node)); completed = true; milliseconds += 10001;
  const resumedContext = {...context, checkpoint: async (progress) => { resumed.progress = structuredClone(progress); return progress; }};
  const finished = await makeAdapter().execute(resumed, resumedContext);
  assert.equal(finished.state, "needs-review", JSON.stringify(finished));
  assert.equal(finished.visualApproval, "NOT_GRANTED"); assert.equal(finished.productionAdmission, false);
  assert.equal(calls.filter((call) => call.args[0] === "generate-video").length, 1);
  assert.equal(resumed.progress.status, "COMPLETED");
  assert.equal(resumed.progress.jobId, node.progress.jobId);
  const verified = await verifyNodeArtifactManifest(finished.artifactManifest, {artifactRoot: context.artifactRoot, node: resumed});
  assert.equal(verified.artifacts[0].metadata.width, 64);
  assert.equal(verified.artifacts[0].sha256, mediaSha256(fs.readFileSync(clip)));

  const wrongFrame = nodeFor(); wrongFrame.input.parameters.request.images[0].sha256 = "b".repeat(64);
  assert.equal((await makeAdapter().execute(wrongFrame, context)).reason, "XYQ_MEDIA_SHA_MISMATCH");
  const unreviewed = nodeFor(); unreviewed.input.parameters.startFrameReview.status = "PENDING";
  assert.equal((await makeAdapter().execute(unreviewed, context)).reason, "AI_VIDEO_START_FRAME_REVIEW_REQUIRED");
  const reference = nodeFor(); reference.input.parameters.referenceOnlySha256 = [frameSha];
  assert.equal((await makeAdapter().execute(reference, context)).reason, "REFERENCE_MEDIA_FORBIDDEN");
  const unknown = nodeFor(); unknown.input.parameters.request.command = "rm";
  assert.equal((await makeAdapter().execute(unknown, context)).reason, "XYQ_REQUEST_PARAMETER_UNSUPPORTED");

  const lost = nodeFor(); let lostSubmits = 0;
  const lostContext = {...context, checkpoint: async (progress) => { lost.progress = structuredClone(progress); return progress; }};
  const lostAdapter = makeAdapter(async () => { lostSubmits++; throw new Error("response lost"); });
  assert.equal((await lostAdapter.execute(lost, lostContext)).reason, "REMOTE_SUBMISSION_RECONCILIATION_REQUIRED");
  assert.equal((await lostAdapter.execute(lost, lostContext)).reason, "REMOTE_SUBMISSION_RECONCILIATION_REQUIRED");
  assert.equal(lostSubmits, 1, "ambiguous submit never resubmits");

  const ordered = nodeFor(); ordered.input.parameters.request.generateType = 1;
  ordered.input.parameters.request.images = [
    {...parameters.request.images[0], frameRole: "first"}, {path: lastImage, sha256: frameSha, referenceOnly: false, frameRole: "last"},
  ];
  let orderedArgs;
  await makeAdapter(async (_command, args) => { if (args[0] === "generate-video") orderedArgs = args; return {stdout: JSON.stringify(args[0] === "generate-video" ? receipt : {completed: false})}; }).execute(ordered, {
    ...context, checkpoint: async (progress) => { ordered.progress = structuredClone(progress); return progress; },
  });
  assert.deepEqual(orderedArgs.slice(-4), ["--image", image, "--image", lastImage]);
  assert.ok(orderedArgs.includes("--generate-type"));
  const swapped = nodeFor(); swapped.input.parameters.request.generateType = 1;
  swapped.input.parameters.request.images = [...ordered.input.parameters.request.images].reverse();
  assert.equal((await makeAdapter().execute(swapped, context)).reason, "XYQ_FIRST_LAST_FRAME_ORDER_REQUIRED");
  console.log("PASS XYQ fixture: explicit CLI arguments, locked frame SHA, durable thread/run/link, 10s query throttle, restart/download MP4, ambiguous-submit no duplicate; no real provider calls");
} finally { fs.rmSync(root, {recursive: true, force: true}); }
