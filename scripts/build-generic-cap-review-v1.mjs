#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {selectMatureScreenMotionTechniques} from "../apps/studio-next/src/lib/a1-screen-motion-technique-selector-v2.mjs";
import {auditCapExecutionReadback, describeCapExecutedEffects} from './lib/cap-execution-readback.mjs';
import {preflightCapRequest} from './lib/cap-request-preflight.mjs';

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.resolve(root, process.argv[2] || "");
const outputProject = path.resolve(root, process.argv[3] || "");
const outputVideo = path.resolve(root, process.argv[4] || "");
if (!process.argv[2] || !process.argv[3] || !process.argv[4] || !fs.existsSync(reportPath)) {
  throw new Error("usage:build-generic-cap-review-v1 <capture-report.json> <output.cap> <output.mp4>");
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (
  report.contract !== "A1GenericBrowserScreenProof/v1" ||
  report.status !== "READY_FOR_CAP_REVIEW" ||
  report.boundary?.targetProjectMutation !== false
) {
  throw new Error("generic-cap-capture-report-invalid");
}

const downClicks = report.cursorTelemetry.clicks.filter((item) => item.down === true);
const requestPreflight = preflightCapRequest(report);
if (requestPreflight.status === 'BLOCKED') throw new Error(`CAP_REQUEST_BLOCKED:${requestPreflight.failures.join(',')}`);
const decisiveClick = downClicks.at(-1) || null;
const geometryTargetByKey = new Map((report.geometryTruth?.status === "PASS_REVIEW_ONLY" ? report.geometryTruth.targets : []).map((item) => [item.targetKey, item]));
const decisiveTarget = geometryTargetByKey.get(decisiveClick?.event) || geometryTargetByKey.get(report.primaryTarget?.event) || null;
const decisiveEvent = report.events.find((item) => item.name === decisiveTarget?.event) || null;
const matureDirection = selectMatureScreenMotionTechniques({
  shotId: report.scenarioId,
  shotFunction: "ACTION",
  durationMs: report.output.durationMs,
  primaryTarget: decisiveTarget?.sourceRect || null,
  targetVisibleMs: decisiveEvent?.tMs || 0,
  nativeActionReadable: false,
  cursorIsDecisive: Boolean(decisiveClick && decisiveTarget),
  stateChangeKind: "SAME_SURFACE",
  resultNeedsReading: true,
  contextRetention: 0.9,
  geometryConfidence: decisiveTarget ? 1 : 0,
  explicitEmphasisRequired: false,
  sourceAlreadyEmphasizes: true,
  requestedScale: 1.06,
});
if (matureDirection.status !== "PASS") throw new Error(`mature-screen-direction-invalid:${matureDirection.failures.join(",")}`);
const cursorVisible = matureDirection.techniques.some((item) => item.technique === "CURSOR_PUNCH");

const shell = path.join(
  root,
  process.env.A1_GENERIC_CAP_SHELL || "work/cap-native-ed02-native-adapter-v3/ed-02-preference.cap",
);
const source = path.join(root, report.output.path);
const capCli = "/Applications/Cap.app/Contents/MacOS/cap-cli";
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (!fs.existsSync(shell) || !fs.existsSync(source) || fs.existsSync(outputProject)) {
  throw new Error("generic-cap-input-or-output-invalid");
}

fs.mkdirSync(path.dirname(outputProject), {recursive: true});
fs.cpSync(shell, outputProject, {recursive: true, errorOnExist: true});
const metaPath = path.join(outputProject, "recording-meta.json");
const configPath = path.join(outputProject, "project-config.json");
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const displayRel = meta.segments?.[0]?.display?.path || "content/segments/segment-0/display.mp4";
const displayPath = path.join(outputProject, displayRel);
const duration = report.output.durationMs / 1000;
fs.copyFileSync(source, displayPath);
meta.segments[0].display = {...meta.segments[0].display, path: displayRel, fps: 60, start_time: 0};
delete meta.segments[0].keyboard;
meta.genericBrowserCapture = {
  contract: "A1GenericBrowserScreenProof/v1",
  productId: report.productId,
  scenarioSha256: report.scenarioSha256,
  sourceSha256: report.output.sha256,
  cursorHidden: true,
  cursorPixelPolicy: report.cursorPixelPolicy,
  browserPointerEventsSha256: crypto.createHash("sha256").update(JSON.stringify(report.sourcePointerEvents || [])).digest("hex"),
  matureDirectionSha256: matureDirection.decisionSha256,
};

const cursorRel = "content/segments/segment-0/cursor.json";
const cursorPath = path.join(outputProject, cursorRel);
const pointerViewport = report.geometryTruth?.frame?.viewportCss || {width:report.output.width,height:report.output.height};
const activeMoves = report.cursorTelemetry.moves.filter((item) => item.tMs > 0).map((item) => ({
  active_modifiers: [],
  cursor_id: "0",
  time_ms: item.tMs,
  x: item.x,
  y: item.y,
}));
if (cursorVisible && !activeMoves.length) throw new Error("generic-cap-active-cursor-moves-required");
const moves = (report.sourcePointerEvents || []).filter((event)=>event.isTrusted===true&&event.pointerType==="mouse"&&event.type==="pointermove").map((event)=>({active_modifiers:[],cursor_id:event.cursorCss==="pointer"||event.cursorCss==="grab"||event.cursorCss==="grabbing"?"2":"0",time_ms:event.captureTimeMs,x:event.cssX/pointerViewport.width,y:event.cssY/pointerViewport.height}));
const clicks = (report.sourcePointerEvents || []).filter((event)=>event.isTrusted===true&&event.pointerType==="mouse"&&(event.type==="pointerdown"||event.type==="pointerup")).map((event)=>({active_modifiers:[],cursor_num:1,cursor_id:event.cursorCss==="pointer"||event.cursorCss==="grab"||event.cursorCss==="grabbing"?"2":"0",time_ms:event.captureTimeMs,down:event.type==="pointerdown"}));
if (!moves.length || !clicks.some((event)=>event.down)) throw new Error("CAP_SOURCE_POINTER_EVENTS_REQUIRED");
fs.writeFileSync(cursorPath, `${JSON.stringify({moves, clicks})}\n`);
const upstreamCursorDir = path.join(root,"work/cap-official-upstream/apps/cli/skill/cap-demo/assets");
const upstreamCursorMetadata = JSON.parse(fs.readFileSync(path.join(upstreamCursorDir,"cursors.json"),"utf8"));
fs.mkdirSync(path.join(outputProject,"content/cursors"),{recursive:true});
for (const id of ["0","2"]) fs.copyFileSync(path.join(upstreamCursorDir,`cursor_${id}.png`),path.join(outputProject,`content/cursors/cursor_${id}.png`));
meta.cursors={"0":upstreamCursorMetadata["0"],"2":upstreamCursorMetadata["2"]};
meta.segments[0].cursor=cursorRel;
meta.genericBrowserCapture.nativeCursorAssetSha256={"0":sha(path.join(outputProject,"content/cursors/cursor_0.png")),"2":sha(path.join(outputProject,"content/cursors/cursor_2.png"))};
meta.segments[0].cursorPixelPolicy = "CAP_NATIVE_CURSOR_REPLAY_FROM_SOURCE_EVENTS";
fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

const eventByName = new Map(report.events.map((item) => [item.name, item]));
const targetByEvent = new Map((report.geometryTruth?.status === "PASS_REVIEW_ONLY" ? report.geometryTruth.targets : []).map((item) => [item.targetKey, item.sourceRect]));
const resolveCenter = (eventName) => {
  const rect = targetByEvent.get(eventName);
  return rect
    ? {
        x: Math.max(0.08, Math.min(0.92, rect.x + rect.width / 2)),
        y: Math.max(0.08, Math.min(0.92, rect.y + rect.height / 2)),
      }
    : {x: 0.5, y: 0.5};
};
config.timeline.segments = [
  {
    recordingSegment: 0,
    timescale: 1,
    start: 0,
    end: duration,
    name: `${report.productId} · directed cross-project introduction`,
  },
];
config.timeline.audioSegments = [];
config.timeline.maskSegments = (report.directorPlan?.beats || []).filter(beat => beat.technique === 'FOCUS_DIM').map(beat => {
  const target = targetByEvent.get(beat.event);
  return {start: beat.startMs / 1000, end: beat.endMs / 1000, track: 0, enabled: true, maskType: 'highlight', center: {x: target.x + target.width / 2, y: target.y + target.height / 2}, size: {x: target.width, y: target.height}, feather: .01, opacity: 1, pixelation: 0, darkness: .65, fadeDuration: .3, keyframes: {position: [], size: [], intensity: []}};
});
const decisiveDownClick = downClicks.at(-1) || null;
const decisiveZoomTarget = decisiveTarget?.sourceRect || null;
const allowClickZoom = report.directorPlan?.allowClickZoom === true;
const primaryTechnique = matureDirection.techniques?.[0]?.technique || null;
const actionFirstCameraSuppressed = ['CURSOR_PUNCH', 'SOURCE_ACTION_ONLY'].includes(primaryTechnique) && report.directorPlan?.allowCameraWithCursor !== true;
const directorCameraBeats = actionFirstCameraSuppressed ? [] : (Array.isArray(report.directorPlan?.cameraBeats) ? report.directorPlan.cameraBeats : []);
const eventTimeMs = (eventName) => Number(eventByName.get(eventName)?.tMs);
const safeCenter = (value, amount) => {
  const min = 0.5 / amount;
  const max = 1 - min;
  return Math.max(min, Math.min(max, value));
};
const resolveBeatTimeMs = (beat, side) => {
  const explicit = side === "start" ? beat.startMs : beat.endMs;
  if (Number.isFinite(explicit)) return explicit;
  const eventName = side === "start" ? beat.targetEvent : (beat.endEvent || beat.targetEvent);
  const eventMs = eventTimeMs(eventName);
  if (!Number.isFinite(eventMs)) return null;
  const offset = side === "start" ? Number(beat.startOffsetMs || 0) : Number(beat.endOffsetMs || 0);
  return eventMs + offset;
};
const maxCameraScale = Number(matureDirection.admission?.maximumCameraScale || 1.24);
const directorZoomSegments = directorCameraBeats.map((beat) => {
  const startMs = resolveBeatTimeMs(beat, "start");
  const endMs = resolveBeatTimeMs(beat, "end");
  const targetEvent = beat.targetEvent || beat.endEvent;
  const target = targetByEvent.get(targetEvent) || null;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || !target) throw new Error(`DIRECTOR_BEAT_UNEXECUTABLE:${beat.id || "unnamed"}`);
  const observedAtMs = geometryTargetByKey.get(targetEvent)?.observedAtMs;
  if (!Number.isFinite(observedAtMs)) throw new Error(`DIRECTOR_TARGET_TIME_MISSING:${targetEvent}`);
  const effectiveStart = Math.max(0.15, startMs / 1000, observedAtMs / 1000);
  const resultHoldEndGuard = targetEvent === 'result_hold' || beat.endEvent === 'result_hold' ? 0.8 : 0.15;
  const effectiveEnd = Math.min(duration - resultHoldEndGuard, endMs / 1000);
  if (effectiveEnd - effectiveStart < 0.6) throw new Error(`DIRECTOR_BEAT_TOO_SHORT:${beat.id}`);
  return {
    start: effectiveStart,
    end: effectiveEnd,
    amount: Math.max(1.03, Math.min(maxCameraScale, Number(beat.amount || 1.08))),
    mode: "auto",
    center: {
      x: safeCenter(target.x + target.width / 2, Math.max(1.03, Math.min(1.24, Number(beat.amount || 1.08)))),
      y: safeCenter(target.y + target.height / 2, Math.max(1.03, Math.min(1.24, Number(beat.amount || 1.08)))),
    },
    targetInteractionId: targetEvent || beat.id || "director-camera-beat",
    glideDirection: beat.glideDirection || "none",
    glideSpeed: Number(beat.glideSpeed || 0.4),
    instantAnimation: false,
    edgeSnapRatio: 0.2,
    directorBeatId: beat.id || null,
  };
}).filter((segment) => segment && segment.end > segment.start);
const decisiveZoomSegment = directorZoomSegments.length ? null : (allowClickZoom && decisiveDownClick && decisiveZoomTarget ? {
  start: Math.max(0.35, Number(decisiveDownClick.tMs) / 1000 - 0.26),
  end: Math.min(duration - 0.25, Number(decisiveDownClick.tMs) / 1000 + 0.78),
  amount: 1.08,
  mode: "auto",
  center: {x: decisiveZoomTarget.x + decisiveZoomTarget.width / 2, y: decisiveZoomTarget.y + decisiveZoomTarget.height / 2},
  targetInteractionId: decisiveTarget?.targetKey || decisiveTarget?.event || "decisive-click",
  glideDirection: "none",
  glideSpeed: 0.34,
  instantAnimation: false,
  edgeSnapRatio: 0.2,
} : null);
config.timeline.zoomSegments = (directorZoomSegments.length ? directorZoomSegments : (decisiveZoomSegment ? [decisiveZoomSegment] : [])).map(({center, targetInteractionId, directorBeatId, ...segment}) => ({...segment, mode: {manual: center}}));
config.background = {...config.background, padding: 0, rounding: 0, inset: 0, shadow: 0, border: null, frame: null};
config.cursor = {
  ...config.cursor,
  hide: false,
  hideWhenIdle: false,
  size: 68,
  raw: true,
  motionBlur: 0,
  rotationAmount: 0,
  clickSpring: null,
  ripple: {enabled: false},
};
config.screenMovementSpring = {stiffness: 180, damping: 44, mass: 2.6};
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

fs.mkdirSync(path.dirname(outputVideo), {recursive: true});
const capExportVideo = `${outputVideo}.cap-export.mp4`;
execFileSync(
  capCli,
  ["export", outputProject, "--output", capExportVideo, "--fps", "60", "--resolution", "1280x720", "--quality", "maximum", "--json"],
  {stdio: ["ignore", "pipe", "pipe"]},
);
execFileSync(ffmpeg, ["-v", "error", "-y", "-i", capExportVideo, "-map", "0:v:0", "-an", "-c:v", "copy", "-movflags", "+faststart", outputVideo]);
const exportedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const executionReadback = auditCapExecutionReadback(config, exportedConfig);
if (executionReadback.status !== 'PASS') throw new Error(`CAP_EXECUTION_MISMATCH:${executionReadback.failures.join(',')}`);
for (const [index, expected] of config.timeline.zoomSegments.entries()) {
  const actual = exportedConfig.timeline?.zoomSegments?.[index];
  if (!actual?.mode?.manual || ["x", "y"].some((axis) => Math.abs(actual.mode.manual[axis] - expected.mode.manual[axis]) > 0.00001) || Math.abs(actual.amount - expected.amount) > 0.00001) throw new Error(`CAP_EXPORT_DROPPED_CAMERA_TARGET:${index}`);
}
if (exportedConfig.cursor?.ripple?.enabled) throw new Error("CAP_EXPORT_CURSOR_POLICY_MISMATCH");
const probe = JSON.parse(
  execFileSync(
    ffprobe,
    ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", outputVideo],
    {encoding: "utf8"},
  ),
);
const video = probe.streams.find((item) => item.codec_type === "video");
const decode = spawnSync(ffmpeg, ["-v", "error", "-i", outputVideo, "-f", "null", "-"], {
  encoding: "utf8",
});
if (decode.status !== 0 || video.width !== 1280 || video.height !== 720 || video.r_frame_rate !== "60/1") {
  throw new Error(`generic-cap-export-invalid:${JSON.stringify(probe)}`);
}
const receipt = {
  contract: "A1GenericCapReviewReceipt/v1",
  status: "PASS",
  productId: report.productId,
  scenarioId: report.scenarioId,
  captureReport: {path: path.relative(root, reportPath), sha256: sha(reportPath)},
  sourceVideo: {path: report.output.path, sha256: report.output.sha256},
  capProject: {
    path: path.relative(root, outputProject),
    configSha256: sha(configPath),
    cursorSha256: sha(cursorPath),
  },
  reviewVideo: {
    path: path.relative(root, outputVideo),
    sha256: sha(outputVideo),
    width: video.width,
    height: video.height,
    fps: video.r_frame_rate,
    frameCount: Number(video.nb_read_frames),
    durationMs: Math.round(Number(probe.format.duration) * 1000),
    fullDecodePass: true,
  },
  directorPlan: report.directorPlan,
  executionEffects: describeCapExecutedEffects(report, exportedConfig, {actionFirstCameraSuppressed}),
  sourcePointerEvidence: {policy: report.cursorPixelPolicy, captureEventCount: report.sourcePointerEvents?.length || 0, trustedMouseDownCount: (report.sourcePointerEvents || []).filter((event) => event.type === "pointerdown" && event.isTrusted && event.pointerType === "mouse").length, capCursorOverlay: "CAP_NATIVE_ASSET_REPLAY", sourceEventPathCount: moves.length, clickSpring: false, motionBlur: 0, assetHashes: {"0":sha(path.join(outputProject,"content/cursors/cursor_0.png")),"2":sha(path.join(outputProject,"content/cursors/cursor_2.png"))}, visualPixels: "CAP_NATIVE_CURSOR_RENDERED_FROM_SOURCE_EVENTS"},
  configurationReadback: executionReadback,
  executedMasks: exportedConfig.timeline?.maskSegments || [],
  decisionOwnership: {execution: 'INPUT_DIRECTOR_PLAN', legacySelector: 'CURSOR_SELECTION_ONLY', visualAcceptance: 'NOT_REVIEWED'},
  matureDirection,
  camera: {semanticZoomCount: config.timeline.zoomSegments.length, segments: config.timeline.zoomSegments},
  feedback: {clickRipple: false, clickSpring: false, cursorPixelPolicy: "CAP_NATIVE_CURSOR_REPLAY_FROM_SOURCE_EVENTS", cursorOverlay: "CAP_NATIVE_ASSET_NO_SPRING_OR_BLUR", sourcePointerEventCount: report.sourcePointerEvents?.length || 0, decisiveZoom: Boolean(decisiveZoomSegment), clickSource: "SAME_CAPTURE_TELEMETRY", cameraPolicy: actionFirstCameraSuppressed ? "ACTION_FIRST_CAMERA_SUPPRESSED" : (directorZoomSegments.length ? "DIRECTOR_CAMERA_BEATS" : (allowClickZoom ? "EXPLICIT_DIRECTOR_PERMISSION" : "LOCKED_SOURCE_DEFAULT")), actionFirstCameraSuppressed},
  geometryTruth: {contract: report.geometryTruth?.contract || null, sha256: report.geometryTruth?.geometryTruthSha256 || null, status: report.geometryTruth?.status || "MISSING", targetCount: report.geometryTruth?.targets?.length || 0},
  runtimeId: "GENERIC_CAP_ADAPTER_V1",
  boundary: {reviewOnly: true, currentStoryboardMutationPerformed: false, productionAdmission: false},
  generatedAt: new Date().toISOString(),
};
receipt.receiptSha256 = crypto.createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
fs.writeFileSync(
  path.join(path.dirname(outputVideo), "cap-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
console.log(JSON.stringify(receipt, null, 2));
