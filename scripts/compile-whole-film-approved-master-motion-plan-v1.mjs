#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import {normalizeMotionActorTrack} from "../lib/a1-motion-ir-parity-v1.js";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("whole-film-motion-plan-valid-workspace-sha-required");
const fps = 30;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));
const frameAt = (milliseconds) => Math.round(Number(milliseconds || 0) * fps / 1000);

const packageDirections = {
  "ED-07": {mode: "SHORT_FULLSCREEN_TYPOGRAPHY_LOOK_MASTER", semanticIntent: "问题句先锁定，输入动作在右侧终端失控并像素化扩散", order: ["illustration", "element-kit", "typography"], constraints: ["FULLSCREEN_TAKEOVER", "TERMINAL_IN_PLACE", "DISSOLUTION_CLIP_REVEAL", "TYPOGRAPHY_NO_FREE_DRIFT"]},
  "ED-08": {mode: "PRESENTER_INTEGRATED_LOOK_MASTER", semanticIntent: "原视频人物保持前景，包装场从其后建立，标题成为第一落点", order: ["element-kit", "typography"], constraints: ["DYNAMIC_ORIGINAL_PRESENTER_VIDEO_MATTE", "PACKAGE_BEHIND_PRESENTER", "TYPOGRAPHY_IN_PLACE_REVEAL"]},
  "ED-09": {mode: "FULLSCREEN_SEMANTIC_DISSOLUTION", semanticIntent: "中文可读表象先建立，语义在下半部逐步碎裂并落到看不懂", order: ["element-kit", "illustration", "typography"], constraints: ["DISSOLUTION_FIELD_IN_PLACE", "COBALT_ACCENT_ONLY", "TYPOGRAPHY_CLIP_REVEAL"]},
  "ED-10": {mode: "HERO_TYPOGRAPHY_TAKEOVER", semanticIntent: "卷曲材料场先展开，完成度很高的废稿以强标题完成反差锁定", order: ["illustration", "element-kit", "typography"], constraints: ["SHORT_TAKEOVER", "SCROLL_SCALE_ONLY", "HERO_TITLE_IN_PLACE"]},
  "ED-12": {mode: "SOURCE_MODEL_ROUTE_EXPLAINER", semanticIntent: "模型名单建立后，路径线与节点逐级连接到同一问题", order: ["illustration", "element-kit", "typography"], constraints: ["ROUTE_PATH_CLIP_REVEAL", "NODES_STAGGER_AS_ONE_ACTOR", "MODEL_NAMES_READABLE"]},
  "ED-13": {mode: "PRESENTER_INTEGRATED_CONTRAST_LOOK_MASTER", semanticIntent: "原视频人物保持在右侧，两个材质标题依次建立顺一些与根因未解的反差", order: ["element-kit", "typography"], constraints: ["DYNAMIC_TRANSFORMED_ORIGINAL_PRESENTER_VIDEO_MATTE", "GENERATED_PRESENTER_LAYER_FORBIDDEN", "TWO_TITLE_STRIPS_IN_PLACE"]},
  "ED-14": {mode: "SOURCE_EVIDENCE_EXPLAINER", semanticIntent: "真实论文页先建立来源，再由收窄机制与标签完成解释", order: ["illustration", "element-kit", "typography"], constraints: ["SOURCE_PAGE_IDENTITY_READABLE", "MECHANISM_IN_PLACE", "NO_FAKE_SOURCE"]},
  "ED-16": {mode: "HERO_CAUSAL_EXPLAINER", semanticIntent: "材料不足与角度不清先出现，因果机制收束到泛泛而谈", order: ["illustration", "typography", "element-kit"], constraints: ["HOURGLASS_SCALE_ONLY", "CAUSE_BEFORE_CONCLUSION", "NO_FREE_LAYER_DRIFT"]},
  "ED-17": {mode: "THREE_STEP_METHOD_EXPLAINER", semanticIntent: "卷纸建立后，材料、角度、动笔由蓝色动作箭头依次贯通", order: ["illustration", "element-kit", "typography"], constraints: ["SCROLL_IN_PLACE", "ACTION_ARROWS_REVEAL", "THREE_STEP_COPY_READABLE"]},
  "ED-19": {mode: "FULLSCREEN_TYPOGRAPHY_SEQUENCE", semanticIntent: "整理、编排、读取、检查形成一条由游标收束的执行链", order: ["illustration", "typography", "element-kit"], constraints: ["STRUCTURAL_ILLUSTRATION_STATIC", "TYPOGRAPHY_LEFT_TO_RIGHT_CLIP", "CURSOR_FINAL_LOCK"]},
  "ED-31": {mode: "PRESENTER_CUTOUT_WORKFLOW", semanticIntent: "原视频人物保持前景，工作流轨道在其后建立并锁定可控性", order: ["element-kit", "typography"], constraints: ["DYNAMIC_ORIGINAL_PRESENTER_VIDEO_MATTE", "WORKFLOW_BEHIND_PRESENTER", "TYPOGRAPHY_IN_PLACE_REVEAL"]},
  "ED-33": {mode: "HERO_CONTROLLABILITY_CONCLUSION", semanticIntent: "纸卷与蓝色路径形成可控方向，结论标题最后稳定落下", order: ["illustration", "element-kit", "typography"], constraints: ["ROLL_AND_RIBBON_IN_PLACE", "SCULPTURE_ANCHOR_FIXED", "CONCLUSION_TITLE_READABLE"]},
  "ED-34": {mode: "SHORT_FULLSCREEN_TYPOGRAPHY_LOOK_MASTER", semanticIntent: "蓝色方向路径贯通判断依据并收束到自己的风格", order: ["element-kit", "illustration", "typography"], constraints: ["TERMINAL_TAKEOVER", "BLUE_PATH_SCALE_OR_OPACITY_ONLY", "TYPOGRAPHY_IN_PLACE"]},
};

function parseSrtTime(value) {
  const match = String(value).match(/^(\d+):(\d+):(\d+)[,.](\d+)$/u);
  if (!match) throw new Error(`whole-film-motion-plan-invalid-srt-time:${value}`);
  return Number(match[1]) * 3_600_000 + Number(match[2]) * 60_000 + Number(match[3]) * 1000 + Number(match[4].padEnd(3, "0").slice(0, 3));
}

function parseSrt(file) {
  return fs.readFileSync(file, "utf8").replace(/\r/gu, "").trim().split(/\n\s*\n/gu).map((block) => {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    const [start, end] = lines[timingIndex].split("-->").map((value) => value.trim());
    return {startFrame: frameAt(parseSrtTime(start)), endFrame: frameAt(parseSrtTime(end)), text: lines.slice(timingIndex + 1).join(" ").trim()};
  }).filter((cue) => cue.text && cue.endFrame > cue.startFrame);
}

async function metadataBinding(publicUrl) {
  const file = publicFile(publicUrl);
  if (!fs.existsSync(file)) throw new Error(`whole-film-motion-plan-asset-missing:${publicUrl}`);
  const metadata = await sharp(file).metadata();
  return {publicUrl, sha256: fileSha256(file), width: metadata.width, height: metadata.height};
}

async function unionAlphaMask({assets, width, height}) {
  const alphaMasks = [];
  for (const asset of assets) {
    const data = asset.useAlpha === true
      ? await sharp(publicFile(asset.publicUrl)).resize(width, height, {fit: "fill"}).ensureAlpha().raw().toBuffer({resolveWithObject: true}).then((result) => {
        const alpha = Buffer.alloc(width * height);
        for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = result.data[pixel * 4 + 3];
        return alpha;
      })
      : await sharp(publicFile(asset.publicUrl)).resize(width, height, {fit: "fill"}).greyscale().raw().toBuffer({resolveWithObject: true}).then((result) => result.data);
    alphaMasks.push(data);
  }
  const output = Buffer.alloc(width * height * 4, 255);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const alpha = Math.max(...alphaMasks.map((mask) => mask[pixel]));
    output[pixel * 4] = 255;
    output[pixel * 4 + 1] = 255;
    output[pixel * 4 + 2] = 255;
    output[pixel * 4 + 3] = alpha;
  }
  return sharp(output, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
}

function fixedActor(id, role, semanticJob) {
  return normalizeMotionActorTrack({id, role, semanticJob, startFrame: 0, endFrame: 1, curve: "quiet-hold", from: {opacity: 1}, to: {opacity: 1}});
}

function packageScene({item, timelineItem, direction, startFrame, durationInFrames, presenterMatte}) {
  const animationEnd = Math.max(40, Math.min(Math.round(durationInFrames * 0.52), 72));
  const timingFor = (index) => {
    const start = Math.round(4 + index * Math.max(5, animationEnd * 0.12));
    return {start, end: Math.min(animationEnd, start + Math.max(14, Math.round(animationEnd * 0.28)))};
  };
  const layerByKind = Object.fromEntries(item.layers.map((layer) => [layer.kind, layer]));
  const actors = [fixedActor("background", "approved-master-underpaint", "stable local underpaint and exact residual pixels")];
  direction.order.forEach((actorId, index) => {
    const kind = actorId === "element-kit" ? "ELEMENT_KIT" : actorId.toUpperCase();
    const layer = layerByKind[kind];
    if (!layer) return;
    const timing = timingFor(index);
    if (layer.motionOperationConstraint?.startsWith("MOTION_DISABLED")) {
      actors.push(fixedActor(actorId, "static-structural-layer", direction.semanticIntent));
      return;
    }
    const clipReveal = actorId === "typography" || actorId === "element-kit";
    actors.push(normalizeMotionActorTrack({id: actorId, role: actorId === "typography" ? "imagegen-typography-actor" : actorId === "element-kit" ? "semantic-mechanism-actor" : "semantic-illustration-actor", semanticJob: direction.semanticIntent, startFrame: timing.start, endFrame: timing.end, curve: actorId === "typography" ? "selection-snap" : actorId === "illustration" ? "archive-settle" : "editorial-reveal", from: clipReveal ? {opacity: 0.18, clip: 0, scale: actorId === "typography" ? 1 : 0.985, blur: 1.5} : {opacity: 0, scale: 1.035, blur: 2}, to: {opacity: 1, clip: 1, scale: 1, blur: 0}}));
  });
  const lockStart = Math.min(Math.max(animationEnd, 42), Math.max(42, durationInFrames - 30));
  const lockEnd = Math.min(durationInFrames - 16, lockStart + 12);
  actors.push(normalizeMotionActorTrack({id: "final-lock", role: "approved-full-look-master-lock", semanticJob: "restore the exact approved final composite for the stable reading hold", startFrame: lockStart, endFrame: Math.max(lockStart + 1, lockEnd), curve: "quiet-hold", from: {opacity: 0}, to: {opacity: 1}}));
  if (presenterMatte) actors.push(fixedActor("presenter-video-matte", "dynamic-original-presenter-video-pixels", "preserve moving original face body microphone and boom above the approved package"));
  return {contract: "A1MotionIRScene/v2", sceneId: timelineItem.shotId, sourceMotionContract: "A1WholeFilmPackageMotionDirector/v1", sourceAuthority: "whole-film-approved-master-layer-actual-pixel-pass", reviewOnly: true, promotedRender: false, timing: {fps, frameStart: startFrame, frameDuration: durationInFrames, duration: durationInFrames / fps}, phases: {setup: {startFrame: 0, endFrame: Math.min(12, animationEnd)}, action: {startFrame: Math.min(8, animationEnd), endFrame: animationEnd}, lock: {startFrame: lockStart, endFrame: Math.max(lockStart + 1, lockEnd)}, stableReadingHold: {startFrame: Math.max(lockStart + 1, lockEnd), endFrame: Math.max(lockStart + 2, durationInFrames - 8)}, handoff: {startFrame: Math.max(0, durationInFrames - 8), endFrame: durationInFrames - 1}}, kineticText: {source: "APPROVED_IMAGEGEN_MASTER_PIXELS", localRetypesetting: false}, textMotion: {operation: "IN_PLACE_CLIP_REVEAL_OR_MASK_SAFE_TRANSFORM", constraints: direction.constraints}, actors, sourceLayerManifestSha256: item.sourceLayerManifestSha256 || null};
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`whole-film-motion-plan-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.workerStatus !== "frozen" || current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.automaticDispatchAllowed !== false) throw new Error("whole-film-motion-plan-frozen-runtime-required");
  const layerManifest = current.production.shotIntelligence.wholeFilmDeterministicLayerReconstruction;
  if (layerManifest?.status !== "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS" || layerManifest.packageCount !== 13 || layerManifest.actualPixelVisualPassCount !== 13 || layerManifest.motionPlanCompilationAllowed !== true) throw new Error("whole-film-motion-plan-layer-visual-pass-required");
  const representative = current.production.shotIntelligence.representativeApprovedMasterMotionPilot;
  if (representative?.status !== "PASS_FOR_WHOLE_FILM_MOTION_PLAN_COMPILATION" || representative.wholeFilmMotionPlanCompilationAllowed !== true || representative.wholeFilmMotionRenderAllowed !== false) throw new Error("whole-film-motion-plan-representative-review-required");
  const board = current.production.shotIntelligence.wholeFilmStaticBoard;
  const timeline = board?.timelineBoard?.items || [];
  if (timeline.length !== 34 || timeline.filter((item) => item.packageBoardItem).length !== 13 || timeline.filter((item) => item.route === "SCREEN_EVIDENCE").length !== 16 || timeline.filter((item) => item.route === "PRESENTER_BASE").length !== 5) throw new Error("whole-film-motion-plan-timeline-counts-invalid");
  const discoveryFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/film-media-discovery-v1-latest.json");
  const discovery = JSON.parse(fs.readFileSync(discoveryFile, "utf8"));
  if (discovery.status !== "REAL_MEDIA_COMPLETE") throw new Error("whole-film-motion-plan-real-media-required");
  for (const asset of [discovery.imported.presenter, discovery.imported.audio, discovery.imported.subtitles]) if (!fs.existsSync(publicFile(asset.publicUrl)) || fileSha256(publicFile(asset.publicUrl)) !== asset.sha256) throw new Error(`whole-film-motion-plan-media-sha-invalid:${asset.assetId}`);
  const totalFrames = frameAt(discovery.imported.presenter.durationMs);
  const binaryFiles = {};
  const presenterMattes = {};
  const restorePlan = current.production.shotIntelligence.originalPresenterPixelRestorePlan;
  for (const shotId of ["ED-08", "ED-31"]) {
    const restore = restorePlan.items.find((item) => item.shotId === shotId);
    if (!restore) throw new Error(`whole-film-motion-plan-presenter-restore-missing:${shotId}`);
    const maskBuffer = await unionAlphaMask({assets: ["presenter", "microphone", "boom"].map((key) => ({publicUrl: restore.masks[key].publicUrl})), width: 1920, height: 1080});
    const relative = `whole-film-motion-plan-v1/mattes/${shotId}-dynamic-original-video-alpha.png`;
    binaryFiles[relative] = maskBuffer;
    presenterMattes[shotId] = {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relative}`, sha256: sha256(maskBuffer), width: 1920, height: 1080, transform: {scaleX: 1, scaleY: 1, translateX: 0, translateY: 0}, source: "STATIC_MATTE_OVER_DYNAMIC_ORIGINAL_VIDEO", reviewStatus: "PENDING_WHOLE_FILM_ACTUAL_PIXEL_MOTION_REVIEW"};
  }
  {
    const ed13Root = "/generated/system-line/editorial-asset-workbench-v1/original-presenter-pixel-restore-v1/ED-13";
    const maskBuffer = await unionAlphaMask({assets: [{publicUrl: `${ed13Root}/transformed-presenter.png`, useAlpha: true}, {publicUrl: `${ed13Root}/visible-microphone-boom.png`, useAlpha: true}], width: 1672, height: 941});
    const relative = "whole-film-motion-plan-v1/mattes/ED-13-dynamic-transformed-original-video-alpha.png";
    binaryFiles[relative] = maskBuffer;
    const transform = restorePlan.items.find((item) => item.shotId === "ED-13").affineMapping;
    presenterMattes["ED-13"] = {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relative}`, sha256: sha256(maskBuffer), width: 1672, height: 941, transform: {scaleX: transform.scaleX, scaleY: transform.scaleY, translateX: transform.translateX / 1672 * 1920, translateY: transform.translateY / 941 * 1080}, source: "STATIC_TRANSFORMED_MATTE_OVER_DYNAMIC_ORIGINAL_VIDEO", reviewStatus: "PENDING_WHOLE_FILM_ACTUAL_PIXEL_MOTION_REVIEW"};
  }
  const beats = [];
  for (let index = 0; index < timeline.length; index += 1) {
    const timelineItem = timeline[index];
    const startFrame = frameAt(timelineItem.timeRange.startMs);
    const authoredEndFrame = frameAt(timelineItem.timeRange.endMs);
    const nextStartFrame = index + 1 < timeline.length ? frameAt(timeline[index + 1].timeRange.startMs) : totalFrames;
    const holdGap = nextStartFrame - authoredEndFrame;
    const endFrame = holdGap >= 0 && holdGap <= fps ? nextStartFrame : authoredEndFrame;
    const durationInFrames = Math.max(1, endFrame - startFrame);
    const base = {shotId: timelineItem.shotId, startFrame, endFrame, authoredEndFrame, durationInFrames, sourceText: timelineItem.sourceText, route: timelineItem.route, routeLabel: timelineItem.routeLabel, sourceRole: timelineItem.sourceRole, titleRole: timelineItem.titleRole, transitionIn: "HARD_CUT_AT_AUTHORED_BEAT_BOUNDARY", transitionOut: "HOLD_LAST_FRAME_THROUGH_SUBSECOND_GAP"};
    if (timelineItem.packageBoardItem) {
      const item = layerManifest.items.find((entry) => entry.shotId === timelineItem.shotId);
      const direction = packageDirections[timelineItem.shotId];
      if (!item || item.status !== "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS" || !direction) throw new Error(`whole-film-motion-plan-package-binding-invalid:${timelineItem.shotId}`);
      const layerBindings = Object.fromEntries(item.layers.map((layer) => [layer.kind, {publicUrl: layer.publicUrl, sha256: layer.sha256, motionOperationConstraint: layer.motionOperationConstraint}]));
      const presenterMatte = presenterMattes[timelineItem.shotId] || null;
      const motionIrScene = packageScene({item, timelineItem, direction, startFrame, durationInFrames, presenterMatte});
      beats.push({...base, kind: "PACKAGE", package: {mode: direction.mode, semanticIntent: direction.semanticIntent, selectedLookMaster: item.selectedLookMaster, finalComposite: item.finalComposite, layers: layerBindings, presenterMatte, motionIrScene}});
      continue;
    }
    if (timelineItem.route === "SCREEN_EVIDENCE") {
      const publicUrl = timelineItem.preview?.publicUrl || (timelineItem.shotId === "ED-20" ? "/generated/system-line/editorial-asset-workbench-v1/source-cache/real-writing-workbench-main.png" : null);
      if (!publicUrl) throw new Error(`whole-film-motion-plan-screen-asset-missing:${timelineItem.shotId}`);
      const asset = await metadataBinding(publicUrl);
      beats.push({...base, kind: "SCREEN_EVIDENCE", screen: {asset, transform: {scaleFrom: 1.006, scaleTo: 1.026, translateXFrom: index % 2 === 0 ? 5 : -5, translateXTo: index % 2 === 0 ? -8 : 8, translateYFrom: 0, translateYTo: -4}, actualSourcePixels: true, syntheticUiAllowed: false}});
      continue;
    }
    beats.push({...base, kind: "PRESENTER_BASE", presenter: {asset: {publicUrl: discovery.imported.presenter.publicUrl, sha256: discovery.imported.presenter.sha256}, sourceStartFrame: startFrame, continuousBaseVideo: true}});
  }
  const subtitles = parseSrt(publicFile(discovery.imported.subtitles.publicUrl));
  const propsBody = {contract: "A1WholeFilmApprovedMasterMotionProps/v1", reviewOnly: true, promotedRender: false, finalRelease: false, fps, totalFrames, durationMs: discovery.imported.presenter.durationMs, media: {presenterVideo: discovery.imported.presenter, narrationAudio: discovery.imported.audio, subtitles: discovery.imported.subtitles}, beats, captions: {sourceSha256: discovery.imported.subtitles.sha256, cueCount: subtitles.length, cues: subtitles, style: "FUNCTIONAL_BOTTOM_CENTER_NO_TITLE_REDESIGN"}};
  const props = {...propsBody, propsSha256: sha256(propsBody)};
  const now = new Date().toISOString();
  const planBody = {contract: "A1WholeFilmApprovedMasterMotionPlan/v1", status: "PLAN_READY_REVIEW_ONLY", reviewOnly: true, promotedRender: false, finalRelease: false, sourceBoardSha256: board.sha256, sourceTimelineBoardSha256: board.timelineBoard.sha256, sourceLayerManifestSha256: layerManifest.manifestSha256, sourceLayerVisualReviewSha256: layerManifest.actualPixelVisualReviewSha256, representativeMotionReviewSha256: representative.actualVisualReviewSha256, routeCounts: {PACKAGE: 13, SCREEN_EVIDENCE: 16, PRESENTER_BASE: 5}, beatCount: beats.length, fps, totalFrames, durationMs: discovery.imported.presenter.durationMs, packageShotIds: beats.filter((beat) => beat.kind === "PACKAGE").map((beat) => beat.shotId), dynamicPresenterMatteShotIds: Object.keys(presenterMattes), sourceBindingCount: beats.length, propsSha256: props.propsSha256, renderer: {formal: "remotion", compositionId: "A1WholeFilmApprovedMasterMotionReviewV1", width: 1920, height: 1080, reviewScale: 0.5}, transitionPolicy: "ACTUAL_ADJACENT_BEAT_HARD_CUT_WITH_PREVIOUS_FRAME_HOLD_ACROSS_SUBSECOND_GAPS", gates: {wholeFilmReviewRenderAllowed: true, assemblyAllowed: false, final1080RenderAllowed: false, resolveAllowed: false, releaseAllowed: false}, generationCount: 0, workerStatus: "frozen", generatedAt: now};
  const plan = {...planBody, planSha256: sha256({...planBody, generatedAt: undefined})};
  let next = structuredClone(current);
  next.production.shotIntelligence.wholeFilmApprovedMasterMotionPlan = {contract: plan.contract, status: plan.status, planSha256: plan.planSha256, propsSha256: props.propsSha256, beatCount: plan.beatCount, routeCounts: plan.routeCounts, totalFrames: plan.totalFrames, durationMs: plan.durationMs, dynamicPresenterMatteShotIds: plan.dynamicPresenterMatteShotIds, reviewOnly: true, promotedRender: false, wholeFilmReviewRenderAllowed: true, assemblyAllowed: false, final1080RenderAllowed: false, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-motion-plan-v1/plan.json", updatedAt: now};
  next.production.shotIntelligence.approvedMasterLayerPilot = {...next.production.shotIntelligence.approvedMasterLayerPilot, status: "WHOLE_FILM_MOTION_PLAN_READY_REVIEW_ONLY", wholeFilmMotionPlanSha256: plan.planSha256, wholeFilmMotionPropsSha256: props.propsSha256, wholeFilmReviewRenderAllowed: true, assemblyAllowed: false, final1080RenderAllowed: false};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "compile-whole-film-approved-master-motion-plan", targetId: "34-beats", payload: {planSha256: plan.planSha256, propsSha256: props.propsSha256, beatCount: 34, routeCounts: plan.routeCounts, dynamicPresenterMatteShotIds: plan.dynamicPresenterMatteShotIds, wholeFilmReviewRenderAllowed: true, assemblyAllowed: false, final1080RenderAllowed: false, workerStatus: "frozen"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `whole-film-motion-plan-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"whole-film-motion-plan-v1/plan.json": plan, "whole-film-motion-plan-v1/input-props.json": props}, binaryFiles});
  return {status: plan.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, planSha256: plan.planSha256, propsSha256: props.propsSha256, beatCount: plan.beatCount, routeCounts: plan.routeCounts, dynamicPresenterMatteShotIds: plan.dynamicPresenterMatteShotIds, totalFrames: plan.totalFrames, durationMs: plan.durationMs, subtitleCueCount: subtitles.length, wholeFilmReviewRenderAllowed: true, assemblyAllowed: false, final1080RenderAllowed: false, workerStatus: "frozen"};
});

console.log(JSON.stringify(result, null, 2));
