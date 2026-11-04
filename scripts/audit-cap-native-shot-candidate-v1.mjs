#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportRelative = process.argv[2];
if (!reportRelative) throw new Error("usage:audit-cap-native-shot-candidate-v1 <report-path>");
const reportPath = path.resolve(root, reportRelative);
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const delta = (a, b) => {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return Number((sum / a.length / 255).toFixed(6));
};
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed:${result.stderr || result.stdout}`);
  return result.stdout;
};
const officialClickZoomSegments = (clicks, durationSeconds) => {
  const durationMs = durationSeconds * 1000;
  const clickCutoffMs = durationMs - 1000;
  const endLimitMs = durationMs - 800;
  const intervals = clicks
    .map((click) => Math.floor(click.time_ms))
    .filter((time) => time < clickCutoffMs)
    .map((time) => [Math.max(1, time - 300), Math.min(endLimitMs, time + 2500)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + 2500) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged.map(([start, end]) => ({start: Math.round(start) / 1000, end: Math.round(end) / 1000}));
};

const failures = [];
if (report.contract !== "A1CapNativeShotCandidate/v1") failures.push("report-contract");
if (report.status !== "READY_FOR_USER_SHOT_REVIEW") failures.push("report-status");
if (report.narrationBinding?.contract !== "A1CapNarrationBinding/v1" || report.narrationBinding?.status !== "PASS") failures.push("narration-binding");
if (report.shotId === "ED-26") {
  if (!(report.semanticProof?.approvedCount >= 1 && report.semanticProof?.preferApplied === true && report.semanticProof?.candidateCount >= 1)) failures.push("preference-memory-semantic-proof");
  if (!report.semanticProof?.engine || /fallback|heuristic|mock|fixture/iu.test(report.semanticProof.engine)) failures.push("preference-generation-real-engine-unavailable");
  if (report.semanticProof?.cacheProof?.status !== "HIT"
    || !report.semanticProof?.cacheProof?.generatedAt
    || report.semanticProof?.cacheProof?.keySha256 !== report.semanticProof?.prewarmProof?.cacheProof?.keySha256
    || report.semanticProof?.prewarmProof?.engine !== report.semanticProof?.engine) failures.push("preference-generation-cache-proof-invalid");
}
if (report.shotId === "ED-02") {
  if (!report.semanticProof?.engine || /fallback|heuristic|mock|fixture/iu.test(report.semanticProof.engine) || report.semanticProof?.candidateCount < 3) failures.push("causal-rewrite-real-engine-proof");
  if (report.semanticProof?.cacheProof?.status !== "HIT" || report.semanticProof?.cacheProof?.keySha256 !== report.semanticProof?.prewarmProof?.cacheProof?.keySha256) failures.push("causal-rewrite-cache-proof");
}
const bindings = report.narrationBinding?.bindings || [];
if (!bindings.every((binding, index) => binding.eventTimeMs >= binding.startMs && binding.eventTimeMs <= binding.endMs && (index === 0 || binding.eventTimeMs > bindings[index - 1].eventTimeMs))) failures.push("cue-event-order-or-window");

const projectPath = path.join(root, report.capProject.path);
const configPath = path.join(projectPath, "project-config.json");
const cursorPath = path.join(projectPath, "content/segments/segment-0/cursor.json");
if (!fs.existsSync(configPath) || sha256(configPath) !== report.capProject.projectConfigSha256) failures.push("project-config-sha");
if (!fs.existsSync(cursorPath) || sha256(cursorPath) !== report.capProject.cursorTrackSha256) failures.push("cursor-track-sha");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const cursor = JSON.parse(fs.readFileSync(cursorPath, "utf8"));
const timelineDurationSeconds = report.narrationBinding.timelineDurationMs / 1000;
const expectedZooms = report.shotId === "ED-02" ? [] : officialClickZoomSegments(cursor.clicks || [], timelineDurationSeconds);
const actualZooms = config.timeline?.zoomSegments || [];
if (expectedZooms.length !== actualZooms.length || !expectedZooms.every((expected, index) => Math.abs(expected.start - actualZooms[index].start) <= .001 && Math.abs(expected.end - actualZooms[index].end) <= .001)) failures.push("official-click-zoom-timing-drift");
if (!actualZooms.every((zoom) => zoom.mode === "auto" && zoom.amount >= 1.25 && zoom.amount <= 1.4 && zoom.instantAnimation === false)) failures.push("zoom-maturity-range");
if (!actualZooms.every((zoom) => timelineDurationSeconds - zoom.end >= .79)) failures.push("zoom-result-hold-too-short");
const minimumCursorMoves = timelineDurationSeconds < 3 ? 12 : 30;
if ((cursor.moves?.length || 0) < minimumCursorMoves || (cursor.clicks?.length || 0) < 2) failures.push("cursor-evidence-insufficient");
if (!["mellow", "smooth"].includes(config.cursor?.animationStyle) || config.cursor?.raw !== false || config.cursor?.motionBlur > .8) failures.push("cursor-maturity-config");
if (config.screenMovementSpring?.stiffness !== 200 || config.screenMovementSpring?.damping !== 40 || config.screenMovementSpring?.mass !== 2.25) failures.push("cap-spring-config");
if (report.capProject.a1CameraApplied !== false) failures.push("a1-camera-applied");

const outputPath = path.join(root, report.output.path);
if (!fs.existsSync(outputPath) || sha256(outputPath) !== report.output.sha256) failures.push("output-sha");
const probe = JSON.parse(run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration,size", "-of", "json", outputPath]));
const video = probe.streams.find((stream) => stream.codec_type === "video");
if (video?.width !== report.output.width || video?.height !== report.output.height || video?.r_frame_rate !== `${report.output.fps}/1` || Number(video?.nb_read_frames) !== report.output.frameCount || probe.streams.some((stream) => stream.codec_type === "audio")) failures.push("output-probe");
run(ffmpeg, ["-v", "error", "-i", outputPath, "-f", "null", "-"]);
const black = spawnSync(ffmpeg, ["-hide_banner", "-i", outputPath, "-vf", "blackdetect=d=0.04:pix_th=0.02", "-an", "-f", "null", "-"], {encoding: "utf8"});
if (black.status !== 0 || `${black.stdout}\n${black.stderr}`.includes("black_start:")) failures.push("black-interruption");
const structuralScan = spawnSync(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-i", outputPath,
  "-vf", "select='gt(scene,0.02)',metadata=print:file=-",
  "-an", "-f", "null", "-",
], {encoding: "utf8"});
if (structuralScan.status !== 0) failures.push("structural-scene-scan-failed");
const structuralSceneScores = [...String(structuralScan.stdout || "").matchAll(/lavfi\.scene_score=([0-9.]+)/gu)].map((match) => Number(match[1]));
const maxStructuralSceneScore = Number(Math.max(0, ...structuralSceneScores).toFixed(6));
if (maxStructuralSceneScore >= .15) failures.push(`structural-jump:${maxStructuralSceneScore}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "a1-cap-native-audit-"));
run(ffmpeg, ["-v", "error", "-y", "-i", outputPath, "-vf", "fps=30,scale=160:90", path.join(tmp, "%04d.png")]);
const scanFiles = fs.readdirSync(tmp).filter((name) => name.endsWith(".png")).sort();
const scanFrames = [];
for (const file of scanFiles) scanFrames.push(await sharp(path.join(tmp, file)).removeAlpha().grayscale().raw().toBuffer());
let maxAdjacentMeanDelta = 0;
let maxAdjacentFrame = 0;
for (let index = 1; index < scanFrames.length; index += 1) {
  const value = delta(scanFrames[index - 1], scanFrames[index]);
  if (value > maxAdjacentMeanDelta) { maxAdjacentMeanDelta = value; maxAdjacentFrame = index; }
}
if (maxAdjacentMeanDelta >= .12) failures.push(`flash-delta:${maxAdjacentMeanDelta}`);

const evidencePixels = [];
const evidenceColors = [];
for (const frame of report.contactSheet.frames) {
  const file = path.join(root, frame.path);
  if (!fs.existsSync(file) || sha256(file) !== frame.sha256) failures.push(`evidence-frame-sha:${frame.cueId}`);
  else {
    evidencePixels.push(await sharp(file).resize(320, 180).removeAlpha().grayscale().raw().toBuffer());
    evidenceColors.push(await sharp(file).resize(320, 180).removeAlpha().raw().toBuffer());
  }
}
const evidenceDeltas = [];
for (let index = 1; index < evidencePixels.length; index += 1) evidenceDeltas.push(delta(evidencePixels[index - 1], evidencePixels[index]));
const scanFrameAtMs = (timeMs) => scanFrames[Math.min(scanFrames.length - 1, Math.max(0, Math.round(timeMs / 1000 * 30)))];
const evidenceRoles = report.contactSheet.frames.map((frame) => {
  const isHold = /_hold$/u.test(frame.event);
  const isClick = /_click$/u.test(frame.event);
  const isSelection = /selected/u.test(frame.event);
  const beforeOrAt = scanFrameAtMs(isHold ? frame.eventTimeMs : frame.eventTimeMs - 200);
  const after = scanFrameAtMs(frame.eventTimeMs + (isHold ? 500 : 350));
  const nearestClickDeltaMs = isClick
    ? Math.min(...(cursor.clicks || []).map((click) => Math.abs(Number(click.time_ms) - frame.eventTimeMs)))
    : null;
  const color = evidenceColors[report.contactSheet.frames.indexOf(frame)];
  let selectionHighlightRatio = null;
  if (isSelection && color) {
    let selectedPixels = 0;
    for (let index = 0; index < color.length; index += 3) {
      if (color[index + 2] > 160 && color[index + 2] - color[index] > 14 && color[index + 2] - color[index + 1] > 5) selectedPixels += 1;
    }
    selectionHighlightRatio = Number((selectedPixels / (color.length / 3)).toFixed(6));
  }
  return {
    event: frame.event,
    localWindowMs: isHold ? [frame.eventTimeMs, frame.eventTimeMs + 500] : [Math.max(0, frame.eventTimeMs - 200), frame.eventTimeMs + 350],
    localDelta: delta(beforeOrAt, after),
    nearestClickDeltaMs,
    selectionHighlightRatio,
    expected: isHold ? "STABLE_RESULT_HOLD" : isClick ? "CURSOR_TRIGGER_WITH_BOUND_RESULT" : isSelection ? "SELECTION_HIGHLIGHT_VISIBLE" : "VISIBLE_ACTION_CHANGE",
  };
});
// Small text/status mutations occupy little of the full frame; 0.001 remains
// materially above codec shimmer while avoiding a false failure for a real
// button-state change. Holds retain the much stricter 0.02 stability ceiling.
if (evidenceRoles.some((item) => item.expected === "VISIBLE_ACTION_CHANGE" && item.localDelta < .001)) failures.push(`evidence-action-not-visible:${evidenceRoles.map((item) => item.localDelta).join(",")}`);
if (evidenceRoles.some((item) => item.expected === "CURSOR_TRIGGER_WITH_BOUND_RESULT" && item.nearestClickDeltaMs > 150)) failures.push(`evidence-click-trigger-missing:${evidenceRoles.map((item) => item.nearestClickDeltaMs).join(",")}`);
if (evidenceRoles.some((item) => item.expected === "SELECTION_HIGHLIGHT_VISIBLE" && item.selectionHighlightRatio < .0005)) failures.push(`evidence-selection-highlight-missing:${evidenceRoles.map((item) => item.selectionHighlightRatio).join(",")}`);
if (evidenceRoles.some((item) => item.expected === "STABLE_RESULT_HOLD" && item.localDelta > .02)) failures.push(`evidence-result-hold-unstable:${evidenceRoles.map((item) => item.localDelta).join(",")}`);

const audit = {
  contract: "A1CapNativeShotAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  shotId: report.shotId,
  sourceCandidateSha256: sha256(reportPath),
  checks: {
    narrationCueEventExact: !failures.includes("cue-event-order-or-window"),
    officialClickZoomTimingExact: !failures.includes("official-click-zoom-timing-drift"),
    zoomMaturityRange: !failures.includes("zoom-maturity-range"),
    resultHoldAtLeastMs: actualZooms.length ? Math.round(Math.min(...actualZooms.map((zoom) => timelineDurationSeconds - zoom.end)) * 1000) : Math.round((timelineDurationSeconds - Number(bindings.at(-1)?.eventTimeMs || 0) / 1000) * 1000),
    minimumCursorMoves,
    cursorMoveCount: cursor.moves?.length || 0,
    cursorClickEventCount: cursor.clicks?.length || 0,
    a1CameraApplied: report.capProject.a1CameraApplied,
    preferenceMemoryApplied: report.shotId !== "ED-26" || (report.semanticProof?.approvedCount >= 1 && report.semanticProof?.preferApplied === true && report.semanticProof?.candidateCount >= 1),
    preferenceGenerationEngine: report.shotId === "ED-26" ? report.semanticProof?.engine || null : null,
    preferenceGenerationRealEngine: report.shotId !== "ED-26" || !failures.includes("preference-generation-real-engine-unavailable"),
    preferenceGenerationCacheProof: report.shotId === "ED-26" ? report.semanticProof?.cacheProof || null : null,
    fullDecodePass: true,
    blackInterruptions: false,
    maxStructuralSceneScore,
    structuralJumpThreshold: .15,
    maxAdjacentMeanDelta,
    maxAdjacentAtSeconds: Number((maxAdjacentFrame / 30).toFixed(3)),
    evidenceDeltas,
    evidenceRoles,
  },
  output: report.output,
  failures,
  auditedAt: new Date().toISOString(),
};
const publicAuditPath = reportPath.replace(/-report\.json$/u, "-audit.json");
fs.writeFileSync(publicAuditPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
if (failures.length) process.exitCode = 2;
