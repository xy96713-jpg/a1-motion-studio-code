#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileScreenInteractionTimeline} from "../apps/studio-next/src/lib/a1-screen-interaction-timeline-v1.mjs";
import {deriveScreenResultRegion} from "./lib/derive-screen-result-region-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const runRoot = path.join(root, "work/background-cap-production-v1/runs/2026-08-30T04-54-53-490Z");
const outputRoot = path.join(root, "work/remotion-screen-coverage-proof-v1");
const publicRoot = path.join(root, "remotion-renderer/public/proof-only/remotion-screen-coverage-v1");
const plan = JSON.parse(fs.readFileSync(path.join(root, "work/cap-native-production-v2/plan.json"), "utf8"));
const fixtureIds = ["ED-24", "ED-27", "ED-29"];
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");

fs.mkdirSync(outputRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const items = [];
for (const shotId of fixtureIds) {
  const shot = plan.shots.find((item) => item.shotId === shotId);
  if (!shot) throw new Error(`coverage-proof-plan-shot-missing:${shotId}`);
  const slug = shotId.toLowerCase();
  const receipt = JSON.parse(fs.readFileSync(path.join(runRoot, `${slug}.cap/a1-background-receipt.json`), "utf8"));
  const reportPath = path.join(root, receipt.sourceReport);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const initialTimeline = compileScreenInteractionTimeline({
    durationMs: report.authorityDurationMs || report.output.durationMs,
    actionId: shot.execution.actionId,
    actionContract: shot.authority.actionContract,
    screenActions: shot.execution.screenActions || [],
    events: report.events || [],
    cursorTelemetry: report.cursorTelemetry,
    domTargets: report.domTargets || [],
    pointerTargets: report.pointerTargets || [],
  });
  const source = path.join(root, report.output.path);
  const lastInteractionMs = initialTimeline.interactions.at(-1)?.anchorMs ?? Math.max(0, initialTimeline.resultHold.startMs - 1200);
  const resultDelta = await deriveScreenResultRegion({source, beforeMs: lastInteractionMs + 200, resultMs: initialTimeline.resultHold.startMs, durationMs: Number(report.authorityDurationMs || report.output.durationMs), shotId, outputDir: outputRoot, ffmpeg});
  const timeline = compileScreenInteractionTimeline({
    durationMs: report.authorityDurationMs || report.output.durationMs,
    actionId: shot.execution.actionId,
    actionContract: shot.authority.actionContract,
    screenActions: shot.execution.screenActions || [],
    events: report.events || [],
    cursorTelemetry: report.cursorTelemetry,
    domTargets: report.domTargets || [],
    pointerTargets: report.pointerTargets || [],
    resultRegion: resultDelta.region,
  });
  if (timeline.status !== "PASS" || timeline.coveragePlan?.status !== "PASS") throw new Error(`coverage-proof-timeline-failed:${shotId}`);
  if (!fs.existsSync(source) || sha256(source) !== report.output.sha256) throw new Error(`coverage-proof-source-sha:${shotId}`);
  const publicName = `${slug}-${report.output.sha256.slice(0, 12)}.mp4`;
  const publicFile = path.join(publicRoot, publicName);
  if (!fs.existsSync(publicFile)) fs.copyFileSync(source, publicFile);
  if (sha256(publicFile) !== report.output.sha256) throw new Error(`coverage-proof-public-copy-sha:${shotId}`);
  const cameraTrack = timeline.coveragePlan.poses.map((item) => ({
    atMs: item.atMs,
    x: item.center.x,
    y: item.center.y,
    scale: item.scale,
    easingToNext: "hold",
  }));
  const durationMs = Number(report.authorityDurationMs || report.output.durationMs);
  const props = {
    contract: "A1ContinuousScreenEvidenceReel/v2",
    width: 960,
    height: 540,
    fps: 60,
    audioUri: "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav",
    scenes: [{
      shotId: `${shotId}-COVERAGE-PROOF`,
      timelineStartMs: shot.authority.timeRange.startMs,
      timelineEndMs: shot.authority.timeRange.endMs,
      durationMs,
      sourceActionId: shot.execution.actionId,
      sourceVideoUri: `proof-only/remotion-screen-coverage-v1/${publicName}`,
      sourceSegments: [{kind: "video", outputStartMs: 0, outputEndMs: durationMs, sourceStartMs: 0, sourceEndMs: durationMs, evidenceRole: "REAL_HEADLESS_WRITING_WORKBENCH_SOURCE"}],
      screenDirection: {contract: "A1ScreenActionDirection/v1", grammar: "WIDE_MEDIUM_RESULT_COVERAGE", cameraModel: "C4_BEZIER_EVENT_FOCUS_HOLD_V1", cameraTrack, attentionTrack: [], cursorPolicy: "HIDDEN_TELEMETRY_CAMERA_ONLY"},
      pointerTrack: null,
      cameraTrack,
      editCoverage: {mode: timeline.coveragePlan.strategy, fullSourceActionShown: true},
    }],
    showReviewLabels: false,
    boundaryTransitionFrames: 0,
  };
  const propsPath = path.join(outputRoot, `${slug}-props.json`);
  fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
  items.push({
    shotId,
    actionId: shot.execution.actionId,
    directorFamily: timeline.directorFamily.id,
    timelineSha256: timeline.timelineSha256,
    coverageSha256: timeline.coveragePlan.coverageSha256,
    strategy: timeline.coveragePlan.strategy,
    resultRegionSource: timeline.coveragePlan.resultRegionSource,
    resultDelta: {...resultDelta, frames: {...resultDelta.frames, beforeFile: path.relative(root, resultDelta.frames.beforeFile), afterFile: path.relative(root, resultDelta.frames.afterFile)}},
    poses: timeline.coveragePlan.poses,
    source: {path: report.output.path, sha256: report.output.sha256},
    propsPath: path.relative(root, propsPath),
    propsSha256: sha256(propsPath),
    expectedRenderPath: `work/remotion-screen-coverage-proof-v1/${slug}-coverage-review-960x540.mp4`,
  });
}

const body = {
  contract: "A1RemotionScreenCoverageProofPlan/v1",
  status: items.length >= 3 && new Set(items.map((item) => item.directorFamily)).size >= 3 ? "READY" : "FAIL",
  renderer: "REMOTION_EXISTING_CONTINUOUS_SCREEN_EVIDENCE_V2",
  fixtureCount: items.length,
  familyCount: new Set(items.map((item) => item.directorFamily)).size,
  items,
  boundary: {diagnosticOnly: true, productionAdmission: false, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"},
};
const report = {...body, planSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(outputRoot, "plan.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "READY") process.exitCode = 1;
