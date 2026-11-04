#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/insertion-pack-v2");
const manifestPath = path.join(outputRoot, "insertion-manifest.json");
const plansPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/shot-performance-plans.json");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const exportScriptPath = path.join(root, "scripts/export-continuous-screen-evidence-insertion-pack-v2.mjs");
const ffprobePath = path.join(root, "node_modules/@ffprobe-installer/darwin-arm64/ffprobe");
const expectedShotIds = ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-20", "ED-21", "ED-22", "ED-23", "ED-24", "ED-25", "ED-26", "ED-27", "ED-28", "ED-29", "ED-30"];
const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(`continuous-screen-insertion-pack-v2:${message}`);
};
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const probe = (filePath) => {
  const result = spawnSync(ffprobePath, [
    "-v", "error", "-count_frames",
    "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration",
    "-of", "json", filePath,
  ], {encoding: "utf8"});
  assert(result.status === 0, `probe-failed:${path.basename(filePath)}`);
  const body = JSON.parse(result.stdout);
  const video = body.streams.find((stream) => stream.codec_type === "video");
  return {
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    fps: video?.r_frame_rate,
    frameCount: Number(video?.nb_read_frames || 0),
    audioStreamCount: body.streams.filter((stream) => stream.codec_type === "audio").length,
  };
};
const runExporter = (extraEnvironment = {}) => spawnSync(process.execPath, [exportScriptPath], {
  cwd: root,
  encoding: "utf8",
  env: {...process.env, ...extraEnvironment},
});

const plans = readJson(plansPath);
const manifest = readJson(manifestPath);
const workspaceSha256 = sha256File(workspacePath);
const phaseSha256 = sha256File(phasePath);
assert(manifest.contract === "A1ContinuousScreenEvidenceInsertionManifest/v2", "manifest-contract");
assert(manifest.status === "CANDIDATE_ONLY_READY_FOR_EDITOR_INSERT_REVIEW", "manifest-status");
assert(manifest.entryCount === 16 && manifest.entries.length === 16, "entry-count");
assert(manifest.timingAuthority?.semanticWindowExactBoardBindingCount === 16, "timing-authority-semantic-count");
assert(manifest.timingAuthority?.editWindowCount === 16, "timing-authority-edit-count");
assert(manifest.timingAuthority?.tailHoldMinMs === 0 && manifest.timingAuthority?.tailHoldMaxMs === 980, "timing-authority-tail-hold");
assert(JSON.stringify(manifest.entries.map((entry) => entry.shotId)) === JSON.stringify(expectedShotIds), "shot-membership");
assert(manifest.cache?.perShotContentAddressed === true, "per-shot-cache-missing");
assert(manifest.cache?.atomicManifestAdmission === true, "atomic-admission-missing");
assert(manifest.authorityMutationAudit?.mutated === false, "authority-mutation-declared");
assert(/^[a-f0-9]{64}$/u.test(manifest.authorityMutationAudit?.after?.workspaceSha256 || ""), "source-workspace-sha-invalid");
assert(/^[a-f0-9]{64}$/u.test(manifest.authorityMutationAudit?.after?.phaseSha256 || ""), "source-phase-sha-invalid");
assert(manifest.boundary?.candidateOnly === true, "candidate-only-boundary");
assert(manifest.boundary?.productionAdmission === false, "production-admission-drift");
assert(manifest.boundary?.canonicalLayerExtractionPerformed === false, "layer-extraction-drift");
assert(manifest.boundary?.resolveWritePerformed === false, "resolve-write-drift");
assert(manifest.boundary?.finalRender === false, "final-render-drift");
assert(manifest.boundary?.userVisualApproval === "NOT_APPROVED", "user-approval-drift");

let sourceCursor = 0;
let frameCalibrationCount = 0;
for (const entry of manifest.entries) {
  const shot = plans.shots.find((item) => item.shotId === entry.shotId);
  assert(Boolean(shot), `plan-missing:${entry.shotId}`);
  const expectedStartFrame = Math.round((shot.timelineStartMs / 1000) * 60);
  const expectedEndFrame = Math.round((shot.timelineEndMs / 1000) * 60);
  assert(entry.timeline.startFrame === expectedStartFrame, `timeline-start-frame:${entry.shotId}`);
  assert(entry.timeline.endFrameExclusive === expectedEndFrame, `timeline-end-frame:${entry.shotId}`);
  assert(entry.timeline.frameCount === expectedEndFrame - expectedStartFrame, `timeline-frame-count:${entry.shotId}`);
  assert(entry.timeline.role === "EDIT_SLOT_THROUGH_NEXT_BEAT_START", `timeline-role:${entry.shotId}`);
  assert(entry.semanticWindow.startMs === shot.semanticWindow.startMs && entry.semanticWindow.endMs === shot.semanticWindow.endMs, `semantic-window:${entry.shotId}`);
  assert(entry.editWindow.startMs === shot.editWindow.startMs && entry.editWindow.endMs === shot.editWindow.endMs, `edit-window:${entry.shotId}`);
  assert(entry.tailHoldMs === shot.editWindow.tailHoldMs && entry.tailHoldMs >= 0 && entry.tailHoldMs <= 1000, `tail-hold:${entry.shotId}`);
  assert(entry.sourceReelSlice.startFrame === sourceCursor, `source-reel-continuity:${entry.shotId}`);
  sourceCursor = entry.sourceReelSlice.endFrameExclusive;
  if (entry.timeline.frameCount !== entry.sourceReelSlice.frameCount) frameCalibrationCount += 1;
  const filePath = path.join(root, entry.file.path);
  assert(fs.existsSync(filePath), `file-missing:${entry.shotId}`);
  assert(sha256File(filePath) === entry.file.sha256, `file-sha:${entry.shotId}`);
  const measured = probe(filePath);
  assert(measured.width === 960 && measured.height === 540, `dimensions:${entry.shotId}`);
  assert(measured.fps === "60/1", `fps:${entry.shotId}`);
  assert(measured.frameCount === entry.timeline.frameCount, `measured-frame-count:${entry.shotId}`);
  assert(measured.audioStreamCount === 0 && entry.file.audio === false, `audio-present:${entry.shotId}`);
  assert(entry.file.alpha === false && entry.file.background === "OPAQUE", `delivery-mode:${entry.shotId}`);
  assert(entry.sourceBinding.syntheticCursorAdded === false, `synthetic-cursor:${entry.shotId}`);
  assert(entry.typographySpec.editableTextRequired === false, `typography-route:${entry.shotId}`);
}
assert(frameCalibrationCount === 3, `frame-calibration-count:${frameCalibrationCount}`);
assert(sourceCursor === plans.shots.reduce((total, shot) => total + Math.round((shot.durationMs / 1000) * 60), 0), "source-reel-total");
assert(fs.existsSync(path.join(root, manifest.contactSheet.path)), "contact-sheet-missing");
assert(sha256File(path.join(root, manifest.contactSheet.path)) === manifest.contactSheet.sha256, "contact-sheet-sha");

const manifestShaBefore = sha256File(manifestPath);
const firstFilePath = path.join(root, manifest.entries[0].file.path);
const firstFileShaBefore = sha256File(firstFilePath);
const firstFileMtimeBefore = fs.statSync(firstFilePath).mtimeMs;
const interrupted = runExporter({
  A1_FORCE_INSERTION_EXPORT: "1",
  A1_SCREEN_INSERTION_INJECT_FAILURE_AFTER_STAGE_SETUP: "1",
});
assert(interrupted.status !== 0, "injected-interruption-did-not-fail");
assert(interrupted.stderr.includes("continuous-screen-insertion-injected-failure-after-stage-setup"), "unexpected-interruption-error");
assert(sha256File(manifestPath) === manifestShaBefore, "interruption-mutated-manifest");
assert(sha256File(firstFilePath) === firstFileShaBefore, "interruption-mutated-clip");
assert(fs.readdirSync(outputRoot).some((name) => name.startsWith(".staging-")), "recoverable-stage-not-left");

const resumed = runExporter();
assert(resumed.status === 0, `resume-failed:${resumed.stderr}`);
const resumeReport = JSON.parse(resumed.stdout);
assert(resumeReport.cacheHit === true, "resume-cache-miss");
assert(resumeReport.reusedEntryCount === 16, "resume-reuse-count");
assert(resumeReport.renderedEntryCount === 0, "resume-rerendered-entry");
assert(resumeReport.recoveredStagingDirectoryCount >= 1, "resume-did-not-clean-staging");
assert(!fs.readdirSync(outputRoot).some((name) => name.startsWith(".staging-")), "staging-remains-after-resume");
assert(sha256File(manifestPath) === manifestShaBefore, "cache-hit-rewrote-manifest");
assert(sha256File(firstFilePath) === firstFileShaBefore, "cache-hit-rewrote-clip");
assert(fs.statSync(firstFilePath).mtimeMs === firstFileMtimeBefore, "cache-hit-changed-clip-mtime");
assert(sha256File(workspacePath) === workspaceSha256 && sha256File(phasePath) === phaseSha256, "test-mutated-current-authority");

console.log(JSON.stringify({
  status: "PASS",
  entryCount: manifest.entryCount,
  exactTimelineFrameCount: 16,
  frameCalibratedShotCount: frameCalibrationCount,
  audioStreamCount: 0,
  cacheHit: true,
  reusedEntryCount: resumeReport.reusedEntryCount,
  interruptedWriteIsolated: true,
  recoveredStagingDirectoryCount: resumeReport.recoveredStagingDirectoryCount,
  workspaceMutation: false,
  userVisualApproval: manifest.boundary.userVisualApproval,
}, null, 2));
