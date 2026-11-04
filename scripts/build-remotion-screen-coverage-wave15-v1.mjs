#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {compileScreenInteractionTimeline} from "../apps/studio-next/src/lib/a1-screen-interaction-timeline-v1.mjs";
import {compileScreenActionDirectionV2} from "../apps/studio-next/src/lib/a1-screen-action-direction-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const plan = JSON.parse(fs.readFileSync(path.join(root, "work/cap-native-production-v2/plan.json"), "utf8"));
const readiness = JSON.parse(fs.readFileSync(path.join(root, "work/screen-result-region-readiness-v1/audit-report.json"), "utf8"));
if (readiness.status !== "PASS" || readiness.readyCount !== plan.shots.length) throw new Error("coverage-wave15-result-readiness-required");
const evidenceBatchPath = path.resolve(root, process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(evidenceBatchPath)) throw new Error("coverage-wave15-current-evidence-batch-required");
const evidenceBatch = JSON.parse(fs.readFileSync(evidenceBatchPath, "utf8"));
if (evidenceBatch.contract !== "A1TelemetryDrivenScreenWave/v1" || evidenceBatch.status !== "PASS" || evidenceBatch.fixtureCount !== 15) throw new Error("coverage-wave15-current-evidence-batch-invalid");
const outputRoot = path.join(root, "work/remotion-screen-coverage-wave15-v1");
const publicRoot = path.join(root, "remotion-renderer/public/proof-only/remotion-screen-coverage-wave15-v1");
const registrationRoot=path.join(outputRoot,"registration-v2"),ffmpeg=path.join(root,".tools/bin/ffmpeg"),require=createRequire(path.join(root,"apps/studio-next/package.json")),sharp=require("sharp");
fs.mkdirSync(outputRoot, {recursive: true}); fs.mkdirSync(publicRoot, {recursive: true});fs.mkdirSync(registrationRoot,{recursive:true});
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const items = [];
for (const shot of plan.shots) {
  const ready = readiness.items.find((item) => item.shotId === shot.shotId);
  const evidenceFixture = evidenceBatch.fixtures.find((item) => item.id === shot.shotId);
  if (!evidenceFixture || evidenceFixture.status !== "PASS") throw new Error(`coverage-wave15-evidence-fixture:${shot.shotId}`);
  const reportPath = path.join(root, evidenceFixture.sourceReport), report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const resultProof = ready.latestUsable.resultRegionProof;
  const resultRegion = resultProof?.status === "PASS" ? resultProof.region : null;
  const persistentResultRegion = report.persistentResultDom?.status === "PASS" && report.persistentResultDom?.finalRect
    ? {x: report.persistentResultDom.finalRect.x / 1280, y: report.persistentResultDom.finalRect.y / 720, width: report.persistentResultDom.finalRect.width / 1280, height: report.persistentResultDom.finalRect.height / 720}
    : null;
  const timeline = compileScreenInteractionTimeline({durationMs: report.authorityDurationMs || report.output.durationMs, actionId: shot.execution.actionId, actionContract: shot.authority.actionContract, screenActions: shot.execution.screenActions || [], events: report.events || [], cursorTelemetry: report.cursorTelemetry, domTargets: report.domTargets || [], pointerTargets: report.pointerTargets || [], textRangeEvidence: report.textRangeEvidence || [], resultRegion, persistentResultRegion});
  if (timeline.status !== "PASS" || timeline.coveragePlan?.status !== "PASS") throw new Error(`coverage-wave15-timeline:${shot.shotId}`);
  const expectedRegionSource = timeline.directorFamily.target === "NONE" ? "FULL_STATE" : "VERIFIED_PIXEL_DELTA";
  if (timeline.coveragePlan.resultRegionSource !== expectedRegionSource) throw new Error(`coverage-wave15-region-source:${shot.shotId}`);
  const source = path.join(root, report.output.path);
  if (!fs.existsSync(source) || sha256(source) !== report.output.sha256) throw new Error(`coverage-wave15-source:${shot.shotId}`);
  const publicName = `${shot.shotId.toLowerCase()}-${report.output.sha256.slice(0, 12)}.mp4`, publicFile = path.join(publicRoot, publicName);
  if (!fs.existsSync(publicFile)) fs.copyFileSync(source, publicFile);
  if (sha256(publicFile) !== report.output.sha256) throw new Error(`coverage-wave15-public-sha:${shot.shotId}`);
  const durationMs = Number(report.authorityDurationMs || report.output.durationMs);
  const attentionActors=[];for(const actor of timeline.generatedActors){const evidenceAtMs=Number(actor.phases?.peakMs||actor.phases?.enterMs||0),frameFile=path.join(registrationRoot,`${shot.shotId.toLowerCase()}-${actor.id}-source.png`),cropFile=path.join(registrationRoot,`${shot.shotId.toLowerCase()}-${actor.id}-crop.png`);execFileSync(ffmpeg,["-hide_banner","-loglevel","error","-y","-ss",(evidenceAtMs/1000).toFixed(3),"-i",source,"-frames:v","1",frameFile]);const geometry=actor.geometry,left=Math.max(0,Math.floor(geometry.x*1280)),top=Math.max(0,Math.floor(geometry.y*720)),width=Math.max(1,Math.min(1280-left,Math.ceil(geometry.width*1280))),height=Math.max(1,Math.min(720-top,Math.ceil(geometry.height*720)));await sharp(frameFile).extract({left,top,width,height}).png().toFile(cropFile);const textEvidence=(report.textRangeEvidence||[]).find((item)=>item.qualification?.status==="ANNOTATION_QUALIFIED"),selector=actor.kind==="SOURCE_BOUND_CIRCLE"?textEvidence?.evidence?.rangeToken:report.persistentResultDom?.selector;attentionActors.push({...actor,selector,evidenceAtMs,sourceCropSha256:sha256(cropFile)});}
  const primaryInteraction=timeline.interactions[0]||null,direction=compileScreenActionDirectionV2({shotId:shot.shotId,durationMs,fps:60,sourceCanvas:{width:1280,height:720},outputCanvas:{width:960,height:540},actionAtMs:primaryInteraction?.anchorMs||0,actionRegion:primaryInteraction?.geometry||null,attentionActors,resultHoldStartMs:timeline.resultHold.startMs,transitionIntent:["FULLSCREEN_RESULT_TRANSITION","STATE_SWITCH_HARD_CUT"].includes(timeline.directorFamily.id)?"FULLSCREEN_THEME_PIVOT":"AUTO",requestedScale:1.18});if(direction.status!=="PASS")throw new Error(`screen-action-direction-v2:${shot.shotId}:${direction.failures.join(",")}`);
  const props = {contract: "A1ContinuousScreenEvidenceReel/v2", width: 960, height: 540, fps: 60, audioUri: "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav", scenes: [{shotId: `${shot.shotId}-COVERAGE-REVIEW`, timelineStartMs: shot.authority.timeRange.startMs, timelineEndMs: shot.authority.timeRange.endMs, durationMs, sourceActionId: shot.execution.actionId, sourceVideoUri: `proof-only/remotion-screen-coverage-wave15-v1/${publicName}`, sourceSegments: [{kind: "video", outputStartMs: 0, outputEndMs: durationMs, sourceStartMs: 0, sourceEndMs: durationMs, evidenceRole: "CURRENT_RECIPE_BOUND_REAL_SOURCE"}], screenDirection: direction, pointerTrack: null, cameraTrack: [], editCoverage: {mode: timeline.coveragePlan.strategy, fullSourceActionShown: true}}], showReviewLabels: false, boundaryTransitionFrames: 0};
  const propsPath = path.join(outputRoot, `${shot.shotId.toLowerCase()}-props.json`); fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  items.push({shotId: shot.shotId, order: shot.order, actionId: shot.execution.actionId, directorFamily: timeline.directorFamily.id, strategy: timeline.coveragePlan.strategy,screenDirectionContract:direction.contract,directionSha256:direction.directionSha256,cameraTransitionMode:direction.cameraPerformance.mode,coordinateBoundEmphasisPolicy:attentionActors.length?"FULL_FRAME_LOCK":"NO_COORDINATE_BOUND_ACTOR",sourceReport: evidenceFixture.sourceReport, sourceSha256: report.output.sha256, timelineSha256: timeline.timelineSha256, coverageSha256: timeline.coveragePlan.coverageSha256, resultRegionSource: timeline.coveragePlan.resultRegionSource, poses: timeline.coveragePlan.poses, cameraTrack:direction.samples.map((sample)=>sample.camera),diagnostics:direction.diagnostics,emphasisActors: attentionActors.map((actor) => actor.kind), propsPath: path.relative(root, propsPath), propsSha256: sha256(propsPath), outputPath: `work/remotion-screen-coverage-wave15-v1/${shot.shotId.toLowerCase()}-coverage-review-960x540.mp4`});
}
const body = {contract: "A1RemotionScreenCoverageWave15Plan/v2", status: items.length === 15 ? "READY" : "FAIL", sourceCapPlanSha256: plan.planSha256, sourceResultReadinessAuditSha256: readiness.auditSha256, sourceEvidenceBatchPath: path.relative(root,evidenceBatchPath), sourceEvidenceBatchSha256: sha256(evidenceBatchPath), shotCount: items.length, familyCount: new Set(items.map((item) => item.directorFamily)).size, items, boundary: {reviewOnly: true, productionAdmission: false, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"}};
const report = {...body, planSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")}; fs.writeFileSync(path.join(outputRoot, "plan.json"), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({status: report.status, shotCount: report.shotCount, familyCount: report.familyCount, planSha256: report.planSha256}, null, 2)); if (report.status !== "READY") process.exitCode = 1;
