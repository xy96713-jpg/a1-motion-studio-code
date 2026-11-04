import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";

// Read-only preflight. Gaps remain explicit: concatenating shot durations loses actions.
const [reportPath, outputPath] = process.argv.slice(2);
if (!reportPath || !outputPath) throw new Error("usage: source-report.json new-audit.json");
if (fs.existsSync(outputPath)) throw new Error("AUDIT_OUTPUT_ALREADY_EXISTS");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const report = read(reportPath);
const workspace = read("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const binding = report.sequenceBinding;
if (!binding?.shotIds?.length || binding.versions?.length !== binding.shotIds.length) throw new Error("SEQUENCE_BINDING_REQUIRED");
if (hash(report.output.path) !== report.output.sha256) throw new Error("SOURCE_SHA_MISMATCH");
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", report.output.path], {encoding: "utf8"}));
execFileSync("ffmpeg", ["-v", "error", "-i", report.output.path, "-f", "null", "-"], {stdio: "pipe"});
const video = probe.streams.find((stream) => stream.codec_type === "video");
const [numerator, denominator] = video.avg_frame_rate.split("/").map(Number);
const fps = numerator / denominator;
if (!Number.isFinite(fps) || fps <= 0) throw new Error("INVALID_SOURCE_FPS");
const sourceDurationMs = Number(probe.format.duration) * 1000;
const slots = [];
let cursor = binding.startMs;
binding.shotIds.forEach((shotId, index) => {
  const shot = workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find((item) => item.shotId === shotId);
  if (!shot || shot.versionId !== binding.versions[index]) throw new Error(`STALE_SHOT:${shotId}`);
  const {startMs, endMs, durationMs} = shot.timeRange;
  if (![startMs, endMs, durationMs].every(Number.isFinite) || startMs < cursor || endMs <= startMs || endMs - startMs !== durationMs) throw new Error(`INVALID_INTERVAL:${shotId}`);
  if (startMs > cursor) slots.push({kind: "INTER_SHOT_GAP", startMs: cursor, endMs: startMs});
  slots.push({kind: "SHOT", shotId, versionId: shot.versionId, startMs, endMs});
  cursor = endMs;
});
if (cursor !== binding.endMs) throw new Error("SEQUENCE_END_MISMATCH");
for (const slot of slots) {
  slot.sourceStartMs = slot.startMs - binding.startMs;
  slot.sourceEndMs = slot.endMs - binding.startMs;
  slot.events = report.events.filter((event) => event.outputTimeMs >= slot.sourceStartMs && event.outputTimeMs < slot.sourceEndMs)
    .map((event) => ({name: event.name, sourceTimeMs: event.outputTimeMs, localTimeMs: event.outputTimeMs - slot.sourceStartMs}));
  slot.measuredLayoutSamples = report.layoutStability.samples.filter((sample) => sample.outputTimeMs >= slot.sourceStartMs && sample.outputTimeMs < slot.sourceEndMs).length;
}
const gapEvents = slots.filter((slot) => slot.kind === "INTER_SHOT_GAP").flatMap((slot) => slot.events);
const terminalShortfallMs = Math.max(0, binding.endMs - binding.startMs - sourceDurationMs);
const result = {
  contract: "A1ContinuousScreenShotMappingAudit/v1",
  status: gapEvents.length || terminalShortfallMs > 0 ? "MAPPING_REPAIR_REQUIRED" : "MAPPING_VERIFIED_VIEWING_PENDING",
  workspaceSha256: workspace.workspaceSha256,
  sourceReportPath: reportPath, sourceReportSha256: hash(reportPath),
  sourcePath: report.output.path, sourceSha256: report.output.sha256,
  sourceDecode: "PASS", sourceDurationMs, fps, sequenceBinding: binding, slots,
  gapEvents, terminalShortfallMs,
  terminalShortfallFrames: terminalShortfallMs * fps / 1000,
  constraints: ["Preserve original timeline gap and its events in the connected sequence", "Do not silently concatenate shot durations", "Keep telemetry in source time until a verified mapping is applied", "No inferred full-card geometry from candidate-body measurement", "Normal-speed narrated viewing remains required"],
  productionAdmission: false, workspaceMutation: false,
};
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n", {flag: "wx"});
console.log(JSON.stringify({status: result.status, outputPath, gapEvents, terminalShortfallMs, sourceDecode: result.sourceDecode, workspaceMutation: false}, null, 2));
