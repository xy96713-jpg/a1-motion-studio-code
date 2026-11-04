#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const outputRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/editorial-shot-director-v1/candidate-v3/representative-motion-v1");
const manifestFile = path.join(outputRoot, "manifest.json");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const {manifestSha256, ...manifestBody} = manifest;
assert(manifestSha256 === sha256Value(manifestBody), "presenter-motion-manifest-sha-invalid");
assert(manifest.contract === "A1PresenterSemanticMotionManifest/v1", "presenter-motion-manifest-contract-invalid");
assert(manifest.status === "AGENT_REPRESENTATIVE_MOTION_REVIEW_PENDING_ACTUAL_PIXEL_INSPECTION" || manifest.status === "AGENT_REPRESENTATIVE_MOTION_ACTUAL_PIXEL_PASS", "presenter-motion-status-invalid");
assert(manifest.shots.length === 5 && new Set(manifest.shots.map((shot) => shot.grammar)).size === 5, "presenter-motion-grammar-coverage-invalid");
assert(manifest.motionStateBoard.samples.length === 25, "presenter-motion-state-sample-count-invalid");
assert(manifest.motionStateBoard.columns.join(",") === "PRE,ENTER,PEAK,HOLD,POST", "presenter-motion-state-columns-invalid");
assert(manifest.renderEvidence.allFiveStatesPixelDistinct === true && manifest.renderEvidence.imageGenCalls === 0, "presenter-motion-render-evidence-invalid");
assert(manifest.boundaries.delegatedAgentApproval === "APPROVED_FOR_BOUNDED_REPRESENTATIVE_MOTION", "presenter-motion-delegated-authority-invalid");
assert(manifest.boundaries.userVisualApproval === "NOT_APPROVED" && manifest.boundaries.productionEligible === false, "presenter-motion-user-approval-boundary-invalid");
for (const key of ["canonicalWholeFilmMutationPerformed", "workspaceMutationPerformed", "currentPhaseMutationPerformed", "assemblyPerformed", "layerExtractionPerformed", "resolvePerformed", "finalRenderPerformed", "externalPublicationPerformed"]) {
  assert(manifest.boundaries[key] === false, `presenter-motion-forbidden-boundary-crossed:${key}`);
}
for (const binding of [manifest.output, manifest.motionStateBoard, manifest.delegatedAuthority]) {
  const file = publicFile(binding.publicUrl);
  assert(fs.existsSync(file) && sha256File(file) === binding.sha256, `presenter-motion-artifact-invalid:${binding.publicUrl}`);
}
if (manifest.status === "AGENT_REPRESENTATIVE_MOTION_ACTUAL_PIXEL_PASS") {
  const reviewFile = publicFile(manifest.actualPixelReview?.publicUrl);
  assert(manifest.actualPixelReview?.status === "PASS" && fs.existsSync(reviewFile) && sha256File(reviewFile) === manifest.actualPixelReview.sha256, "presenter-motion-actual-pixel-review-invalid");
  assert(manifest.shots.every((shot) => shot.actualPixelReview === "PASS"), "presenter-motion-shot-review-incomplete");
}
for (const sample of manifest.motionStateBoard.samples) {
  const file = publicFile(sample.publicUrl);
  assert(fs.existsSync(file) && sha256File(file) === sample.sha256, `presenter-motion-sample-invalid:${sample.shotId}:${sample.state}`);
}
const probe = spawnSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-show_entries", "stream=codec_name,width,height,r_frame_rate", "-of", "json", publicFile(manifest.output.publicUrl)], {encoding: "utf8"});
assert(probe.status === 0, `presenter-motion-ffprobe-failed:${probe.stderr}`);
const metadata = JSON.parse(probe.stdout);
const video = metadata.streams.find((stream) => stream.codec_name === "h264");
const audio = metadata.streams.find((stream) => stream.codec_name === "aac");
assert(video?.width === 960 && video?.height === 540 && video?.r_frame_rate === "30/1", "presenter-motion-video-metadata-invalid");
assert(Boolean(audio), "presenter-motion-audio-track-missing");
assert(Math.abs(Number(metadata.format.duration) - manifest.output.durationInFrames / 30) < 0.12, "presenter-motion-duration-invalid");
const decode = spawnSync(path.join(root, ".tools/bin/ffmpeg"), ["-v", "error", "-i", publicFile(manifest.output.publicUrl), "-f", "null", "-"], {encoding: "utf8"});
assert(decode.status === 0, `presenter-motion-decode-failed:${decode.stderr}`);
process.stdout.write(`${JSON.stringify({status: "PASS", shotCount: manifest.shots.length, grammarCount: new Set(manifest.shots.map((shot) => shot.grammar)).size, durationSeconds: Number(metadata.format.duration), outputSha256: manifest.output.sha256, stateBoardSha256: manifest.motionStateBoard.sha256, delegatedAgentApproval: manifest.boundaries.delegatedAgentApproval, userVisualApproval: manifest.boundaries.userVisualApproval, productionEligible: manifest.boundaries.productionEligible}, null, 2)}\n`);
