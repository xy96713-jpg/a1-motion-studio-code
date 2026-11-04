#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const isV2 = process.argv.includes("--v2");
const version = isV2 ? "v2" : "v1";
const publicRoot = path.join(root, "apps/studio-next/public");
const outputRoot = path.join(publicRoot, `generated/system-line/editorial-asset-workbench-v1/representative-mature-motion-${version}`);
const manifestFile = path.join(outputRoot, "manifest.json");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const publicFile = (url) => path.join(publicRoot, url.replace(/^\//u, ""));
assert(manifest.contract === `A1RepresentativeMatureMotionManifest/${version}`, "representative-motion-manifest-contract-invalid");
assert(manifest.status === "CANDIDATE_ONLY_PENDING_USER_MOTION_REVIEW", "representative-motion-status-invalid");
assert(manifest.boundaries.userVisualApproval === "NOT_APPROVED" && manifest.boundaries.productionEligible === false, "representative-motion-approval-boundary-invalid");
assert(manifest.boundaries.workspaceMutationPerformed === false && manifest.boundaries.currentPhaseMutationPerformed === false, "representative-motion-authority-mutation-boundary-invalid");
assert(manifest.boundaries.assemblyPerformed === false && manifest.boundaries.layerExtractionPerformed === false && manifest.boundaries.resolvePerformed === false && manifest.boundaries.finalRenderPerformed === false, "representative-motion-downstream-boundary-invalid");
assert(manifest.renderMetrics.imageGenCalls === 0 && manifest.renderMetrics.concurrency <= 2, "representative-motion-generation-boundary-invalid");
const outputFile = publicFile(manifest.output.publicUrl);
assert(fs.existsSync(outputFile) && sha256File(outputFile) === manifest.output.sha256, "representative-motion-output-sha-invalid");
assert(fs.existsSync(publicFile(manifest.contactSheet.publicUrl)) && sha256File(publicFile(manifest.contactSheet.publicUrl)) === manifest.contactSheet.sha256, "representative-motion-contact-sheet-sha-invalid");
const probe = spawnSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-show_entries", "stream=codec_name,width,height,r_frame_rate", "-of", "json", outputFile], {encoding: "utf8"});
assert(probe.status === 0, `representative-motion-ffprobe-failed:${probe.stderr}`);
const metadata = JSON.parse(probe.stdout);
const video = metadata.streams.find((stream) => stream.codec_name === "h264");
const audio = metadata.streams.find((stream) => stream.codec_name === "aac");
assert(video?.width === 960 && video?.height === 540 && video?.r_frame_rate === "30/1", "representative-motion-video-metadata-invalid");
assert(Boolean(audio), "representative-motion-audio-track-missing");
assert(Math.abs(Number(metadata.format.duration) - 1730 / 30) < 0.12, "representative-motion-duration-invalid");
if (isV2) {
  assert(manifest.semanticStylePlan?.contract === "A1SemanticMotionStylePlan/v1", "representative-motion-semantic-style-plan-contract-invalid");
  assert(manifest.semanticStylePlan.audit?.status === "PASS", "representative-motion-semantic-style-sequence-invalid");
  assert(manifest.semanticStylePlan.audit.diversity.primaryFamilies >= 4, "representative-motion-primary-family-diversity-insufficient");
  assert(manifest.semanticStylePlan.audit.diversity.surfaceLogics >= 3, "representative-motion-surface-diversity-insufficient");
  assert(manifest.semanticStylePlan.audit.diversity.compositions >= 3, "representative-motion-composition-diversity-insufficient");
  assert(manifest.semanticStylePlan.audit.diversity.palettes >= 3, "representative-motion-palette-diversity-insufficient");
}
const decode = spawnSync(path.join(root, ".tools/bin/ffmpeg"), ["-v", "error", "-i", outputFile, "-f", "null", "-"], {encoding: "utf8"});
assert(decode.status === 0, `representative-motion-decode-failed:${decode.stderr}`);
process.stdout.write(`${JSON.stringify({status: "PASS", version, outputSha256: manifest.output.sha256, durationSeconds: Number(metadata.format.duration), sampleCount: manifest.contactSheet.samples.length, semanticStyleAudit: manifest.semanticStylePlan?.audit?.status || null, userVisualApproval: manifest.boundaries.userVisualApproval, productionEligible: manifest.boundaries.productionEligible}, null, 2)}\n`);
