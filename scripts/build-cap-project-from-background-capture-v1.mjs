#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {compileScreenInteractionTimeline} from "../apps/studio-next/src/lib/a1-screen-interaction-timeline-v1.mjs";
import {compileCapScreenAnnotationOverlay} from "../apps/studio-next/src/lib/a1-screen-annotation-cap-adapter-v1.mjs";
import {evaluateScreenRecordingDuration} from "../apps/studio-next/src/lib/a1-screen-recording-production-policy-v1.mjs";
import sharp from "sharp";
import {deriveScreenResultRegion} from "./lib/derive-screen-result-region-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.resolve(root, process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(reportPath)) throw new Error("usage:build-cap-project-from-background-capture-v1 <headless-report.json> [output.cap]");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (report.contract !== "A1HeadlessWritingWorkbenchShot/v1" || report.status !== "READY_FOR_ACTUAL_PIXEL_REVIEW") throw new Error("background-capture-report-invalid");
if (report.captureScope !== "BROWSER_PAGE_VIEWPORT_ONLY" || report.headedWindowCreated !== false || report.frontmostApplicationMutation !== false) throw new Error("background-capture-isolation-invalid");
if (report.cursorPixelPolicy !== "SOURCE_VIDEO_CURSOR_HIDDEN_TELEMETRY_ONLY") throw new Error("background-source-cursor-must-be-hidden");
if (!report.cursorTelemetry?.moves?.length || !report.cursorTelemetry?.clicks?.length) throw new Error("background-cursor-telemetry-missing");
const plan = JSON.parse(fs.readFileSync(path.join(root, "work/cap-native-production-v2/plan.json"), "utf8"));
const storyboardShot = plan.shots.find((shot) => shot.shotId === report.shotId);
const reviewOnlyCameraRecompile = process.env.A1_REVIEW_ONLY_RECOMPILE_CAMERA === "1";
if (!storyboardShot
  || report.storyboardBinding?.versionId !== storyboardShot.authority.versionId
  || report.storyboardBinding?.revisionSha256 !== storyboardShot.authority.revisionSha256
  || (!reviewOnlyCameraRecompile && report.storyboardBinding?.workspaceSha256 !== plan.source.workspaceSha256)
  || (!reviewOnlyCameraRecompile && report.storyboardBinding?.cameraRecipeSha256 !== storyboardShot.execution.cameraRecipe.recipeSha256)) throw new Error(`background-storyboard-binding-invalid:${report.shotId}`);

const sourceVideo = path.join(root, report.output.path);
const shellProject = path.join(root, process.env.A1_CAP_BACKGROUND_SHELL || "work/cap-native-ed02-native-adapter-v3/ed-02-preference.cap");
const outputProject = path.resolve(root, process.argv[3] || `work/background-cap-production-v1/${report.shotId.toLowerCase()}.cap`);
if (!fs.existsSync(sourceVideo) || !fs.existsSync(shellProject)) throw new Error("background-cap-input-missing");
if (fs.existsSync(outputProject)) throw new Error(`background-cap-output-exists:${path.relative(root, outputProject)}`);

const ffprobe = path.join(root, ".tools/bin/ffprobe");
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration,size", "-of", "json", sourceVideo], {encoding: "utf8"}));
const video = probe.streams.find((stream) => stream.codec_type === "video");
const duration = Number(probe.format.duration);
const sourceWidth = Number(report.output.width), sourceHeight = Number(report.output.height);
if (video?.width !== sourceWidth || video?.height !== sourceHeight || !["1280x720","2560x1440","3840x2160"].includes(`${sourceWidth}x${sourceHeight}`) || video?.r_frame_rate !== "60/1" || probe.streams.some((stream) => stream.codec_type === "audio")) throw new Error(`background-cap-video-invalid:${JSON.stringify(probe)}`);

fs.mkdirSync(path.dirname(outputProject), {recursive: true});
fs.cpSync(shellProject, outputProject, {recursive: true, errorOnExist: true});
const metaPath = path.join(outputProject, "recording-meta.json");
const configPath = path.join(outputProject, "project-config.json");
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const displayRelative = meta.segments?.[0]?.display?.path || "content/segments/segment-0/display.mp4";
const displayPath = path.join(outputProject, displayRelative);
const persistentResultRegion = report.persistentResultDom?.status === "PASS" && report.persistentResultDom?.finalRect
  ? {x: report.persistentResultDom.finalRect.x / sourceWidth, y: report.persistentResultDom.finalRect.y / sourceHeight, width: report.persistentResultDom.finalRect.width / sourceWidth, height: report.persistentResultDom.finalRect.height / sourceHeight}
  : null;

const initialInteractionTimeline = compileScreenInteractionTimeline({
  durationMs: report.authorityDurationMs || report.output.durationMs,
  actionId: storyboardShot.execution.actionId,
  actionContract: storyboardShot.authority.actionContract,
  screenActions: storyboardShot.execution.screenActions || [],
  events: report.events || [],
  cursorTelemetry: report.cursorTelemetry,
  domTargets: report.domTargets || [],
  pointerTargets: report.pointerTargets || [],
  textRangeEvidence: report.textRangeEvidence || [],
  persistentResultRegion,
});
const lastInteractionMs = initialInteractionTimeline.interactions.at(-1)?.anchorMs ?? Math.max(0, initialInteractionTimeline.resultHold.startMs - 1200);
const staticStateCoverage = initialInteractionTimeline.directorFamily.target === "NONE";
const resultRegionProof = staticStateCoverage
  ? {contract: "A1VerifiedScreenResultRegion/v1", status: "NOT_REQUIRED_STATIC_STATE", shotId: report.shotId, region: null, changedPixelCount: null, timing: null, frames: {beforeFile: null, afterFile: null, beforeSha256: null, afterSha256: null}}
  : await deriveScreenResultRegion({source: sourceVideo, beforeMs: Math.max(0, lastInteractionMs - 200), resultMs: initialInteractionTimeline.resultHold.startMs, durationMs: report.authorityDurationMs || report.output.durationMs, shotId: report.shotId, outputDir: outputProject, ffmpeg: path.join(root, ".tools/bin/ffmpeg")});
const interactionTimeline = compileScreenInteractionTimeline({
  durationMs: report.authorityDurationMs || report.output.durationMs,
  actionId: storyboardShot.execution.actionId,
  actionContract: storyboardShot.authority.actionContract,
  screenActions: storyboardShot.execution.screenActions || [],
  events: report.events || [],
  cursorTelemetry: report.cursorTelemetry,
  domTargets: report.domTargets || [],
  pointerTargets: report.pointerTargets || [],
  textRangeEvidence: report.textRangeEvidence || [],
  resultRegion: resultRegionProof.region,
  persistentResultRegion,
});
if (interactionTimeline.status !== "PASS") throw new Error(`background-interaction-timeline-invalid:${report.shotId}:${interactionTimeline.audit.failures.join(",")}`);
const timelineDurationMs=Math.round((report.authorityDurationMs||report.output.durationMs||duration*1000));
const beatBoundaries=[0,...interactionTimeline.interactions.map((item)=>item.anchorMs),interactionTimeline.resultHold.startMs,timelineDurationMs].filter(Number.isFinite).map((value)=>Math.max(0,Math.min(timelineDurationMs,Math.round(value)))).sort((a,b)=>a-b).filter((value,index,array)=>index===0||value!==array[index-1]);
const beatDurationsMs=beatBoundaries.slice(1).map((value,index)=>value-beatBoundaries[index]).filter((value)=>value>0);
const durationDecision=evaluateScreenRecordingDuration(timelineDurationMs,{beatDurationsMs,informationBearing:true});
const expectedResultRegionSource = staticStateCoverage ? "FULL_STATE" : "VERIFIED_PIXEL_DELTA";
if (interactionTimeline.coveragePlan?.resultRegionSource !== expectedResultRegionSource) throw new Error(`background-result-region-not-verified:${report.shotId}:${interactionTimeline.coveragePlan?.resultRegionSource}`);
const interactionTimelineRelative = "a1-interaction-timeline.json";
fs.writeFileSync(path.join(outputProject, interactionTimelineRelative), `${JSON.stringify(interactionTimeline, null, 2)}\n`);
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const annotationActor=interactionTimeline.generatedActors.find((actor)=>compileCapScreenAnnotationOverlay({actor,width:sourceWidth,height:sourceHeight}));
const annotationOverlay=annotationActor?compileCapScreenAnnotationOverlay({actor:annotationActor,width:sourceWidth,height:sourceHeight}):null;
const legacyActors=interactionTimeline.generatedActors.filter((actor)=>actor!==annotationActor);
const overlayFilters = legacyActors.flatMap((actor) => {
  const geometry = actor.geometry, x = Math.round(geometry.x * sourceWidth), y = Math.round(geometry.y * sourceHeight), width = Math.max(8, Math.round(geometry.width * sourceWidth)), height = Math.max(8, Math.round(geometry.height * sourceHeight));
  const enter = (actor.phases.enterMs / 1000).toFixed(3), exit = (actor.phases.exitEndMs / 1000).toFixed(3), peakStart = Math.max(0, actor.phases.peakMs / 1000 - .08).toFixed(3), peakEnd = (actor.phases.peakMs / 1000 + .14).toFixed(3);
  return [`drawbox=x=${x}:y=${y}:w=${width}:h=${height}:color=0x52e0ff@0.78:t=4:enable='between(t,${enter},${exit})'`, `drawbox=x=${x}:y=${y}:w=${width}:h=${height}:color=0xdfff68@0.95:t=7:enable='between(t,${peakStart},${peakEnd})'`];
});
let annotationOverlayRelative=null,annotationAdapterSha256=null;
if(annotationOverlay){annotationOverlayRelative="a1-screen-annotation-overlay.png";const overlayPath=path.join(outputProject,annotationOverlayRelative);await sharp(Buffer.from(annotationOverlay.svg)).png().toFile(overlayPath);const enter=(annotationOverlay.timing.enterMs/1000).toFixed(3),exit=Math.max(annotationOverlay.timing.enterMs/1000+.2,annotationOverlay.timing.exitEndMs/1000-.18).toFixed(3);execFileSync(ffmpeg,["-hide_banner","-loglevel","error","-y","-i",sourceVideo,"-loop","1","-i",overlayPath,"-filter_complex",`[1:v]format=rgba,fade=t=in:st=${enter}:d=0.18:alpha=1,fade=t=out:st=${exit}:d=0.18:alpha=1[a];[0:v][a]overlay=shortest=1,fps=60,format=yuv420p[v]`,"-map","[v]","-t",String(duration),"-an","-c:v","libx264","-crf","16","-preset","veryfast","-movflags","+faststart",displayPath]);annotationAdapterSha256=annotationOverlay.adapterSha256;}
else if (overlayFilters.length) execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", sourceVideo, "-vf", `${overlayFilters.join(",")},fps=60,format=yuv420p`, "-an", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", displayPath]);
else fs.copyFileSync(sourceVideo, displayPath);

const cursorRelative = "content/segments/segment-0/cursor.json";
const cursorPath = path.join(outputProject, cursorRelative);
const moves = interactionTimeline.cursor.moves.map((item) => ({active_modifiers: [], cursor_id: "0", time_ms: item.timeMs, x: item.x, y: item.y}));
const clicks = interactionTimeline.cursor.clicks.map((item) => ({active_modifiers: [], cursor_num: 1, cursor_id: "0", time_ms: item.timeMs, down: item.down}));
fs.writeFileSync(cursorPath, `${JSON.stringify({moves, clicks})}\n`);

meta.segments[0].display = {...meta.segments[0].display, path: displayRelative, fps: 60, start_time: 0};
delete meta.segments[0].cursor;
meta.cursors = {};
meta.backgroundCapture = {contract: "A1BackgroundBrowserCapture/v1", backend: report.captureBackend, headedWindowCreated: false, frontmostApplicationMutation: false, sourceCursorHidden: true, finalCursorVisible: false, sourceReport: path.relative(root, reportPath), interactionTimeline: interactionTimelineRelative, interactionTimelineSha256: interactionTimeline.timelineSha256, generatedInteractionActorsComposited: interactionTimeline.generatedActors.length};
fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

const zoomSegments = interactionTimeline.camera.map((camera) => ({start: Math.max(.001, camera.startMs / 1000), end: Math.min(duration - .05, camera.endMs / 1000), amount: camera.scale, mode: "auto", center: camera.center, targetInteractionId: camera.targetInteractionId, glideDirection: "none", glideSpeed: .46, instantAnimation: false, edgeSnapRatio: .16})).filter((zoom) => zoom.end > zoom.start + .45);
const canvasByFamily = {
  SELECTION_REPLACEMENT: {padding: 5, rounding: 10, shadow: 42},
  JUDGMENT_STATE_COMPARE: {padding: 7.5, rounding: 14, shadow: 55},
  GAP_EXPANSION: {padding: 2, rounding: 5, shadow: 20},
  RESULT_PANEL_REVEAL: {padding: 0, rounding: 0, shadow: 0},
  STATE_SWITCH_HARD_CUT: {padding: 0, rounding: 0, shadow: 0},
  FULLSCREEN_RESULT_TRANSITION: {padding: 0, rounding: 0, shadow: 0},
};
const canvasPolicy = canvasByFamily[interactionTimeline.directorFamily.id] || canvasByFamily.SELECTION_REPLACEMENT;
config.timeline.segments = [{recordingSegment: 0, timescale: 1, start: 0, end: duration, name: `${report.shotId} · background CDP capture`}];
config.timeline.audioSegments = [];
config.timeline.zoomSegments = zoomSegments;
config.background = {...config.background, padding: canvasPolicy.padding, rounding: canvasPolicy.rounding, shadow: canvasPolicy.shadow};
config.cursor = {...config.cursor, hideWhenIdle: true, hideWhenIdleDelay: 0, size: 0, raw: false, animationStyle: "mellow", motionBlur: 0, rotationAmount: 0};
config.screenMovementSpring = {stiffness: 160, damping: 42, mass: 2.6};
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const receipt = {contract: "A1BackgroundCapProjectReceipt/v1", status: durationDecision.status==="PASS"?"READY_FOR_CAP_EXPORT":"REVIEW_ONLY_SPLIT_REQUIRED", shotId: report.shotId, captureBackend: report.captureBackend, headedWindowCreated: false, frontmostApplicationMutation: false, storyboardBinding: report.storyboardBinding, reviewOnlyCameraRecompile: {enabled: reviewOnlyCameraRecompile, sourceWorkspaceSha256: report.storyboardBinding?.workspaceSha256 || null, currentWorkspaceSha256: plan.source.workspaceSha256, sourceCameraRecipeSha256: report.storyboardBinding?.cameraRecipeSha256 || null, currentCameraRecipeSha256: storyboardShot.execution.cameraRecipe.recipeSha256, versionAndRevisionMatch: true, productionBindingAllowed: false}, projectPath: path.relative(root, outputProject), sourceReport: path.relative(root, reportPath), sourceVideo: {path: report.output.path, sha256: report.output.sha256, cursorHidden: true}, durationPolicy: {...durationDecision, defaultBandMs:[4000,8000], hardMaximumContinuousBeatMs:10000, splitRequired:durationDecision.status!=="PASS"}, productionRoute:{capture:"HEADLESS_CHROME_CDP_CFR60",director:"A1_SCREEN_INTERACTION_TIMELINE",editableProject:"CAP_PROJECT",screenPackagingRenderer:"CAP_EXPORT",finalFilmAssembly:"REMOTION"}, directorFamily: interactionTimeline.directorFamily, canvasPolicy, interactionComposite: {displaySha256: sha256(displayPath), generatedActorCount: interactionTimeline.generatedActors.length, sourceUiPixelsPreservedUnderActors: true, annotationOverlay:annotationOverlayRelative?{path:annotationOverlayRelative,adapterSha256:annotationAdapterSha256,actor:annotationOverlay.renderPlan.actor,rectangularFallback:false}:null, decorativeFrames: 0, clickRings: 0}, interactionTimeline: {contract: interactionTimeline.contract, timelineSha256: interactionTimeline.timelineSha256, path: interactionTimelineRelative, maximumSyncOffsetMs: interactionTimeline.audit.maximumSyncOffsetMs, generatedActorCount: interactionTimeline.generatedActors.length}, coveragePlan: interactionTimeline.coveragePlan, resultRegionProof: {...resultRegionProof, frames: {...resultRegionProof.frames, beforeFile: resultRegionProof.frames.beforeFile ? path.relative(root, resultRegionProof.frames.beforeFile) : null, afterFile: resultRegionProof.frames.afterFile ? path.relative(root, resultRegionProof.frames.afterFile) : null}}, cursorTelemetry: {moveCount: moves.length, clickCount: clicks.length, retainedForCameraOnly: true, visibleInFinal: false}, cameraPolicy: {semanticZoomCount: zoomSegments.length, maximumZoomAmount: zoomSegments.length ? Math.max(...zoomSegments.map((zoom) => zoom.amount)) : 1, adjacentClickZoomsMerged: true, resultHoldSeconds: interactionTimeline.resultHold.durationMs / 1000}, zoomSegmentCount: zoomSegments.length, projectConfigSha256: sha256(configPath), cursorSha256: sha256(cursorPath), productionAdmission: false, userVisualApproval: "NOT_APPROVED"};
const receiptPath = path.join(outputProject, "a1-background-receipt.json");
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({...receipt, receiptPath: path.relative(root, receiptPath)}, null, 2));
