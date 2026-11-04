#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileEventSettleScreenMotion} from "../apps/studio-next/src/lib/a1-event-settle-screen-motion-v1.mjs";
import {derivePersistentScreenResultTarget} from "./lib/derive-persistent-screen-result-target-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const waveRoot = path.join(root, "work/remotion-screen-coverage-wave15-v1");
const outputRoot = path.join(root, "work/event-settle-screen-motion-boundary-proof-v1");
const wavePlan = JSON.parse(fs.readFileSync(path.join(waveRoot, "plan.json"), "utf8"));
const readiness = JSON.parse(fs.readFileSync(path.join(root, "work/screen-result-region-readiness-v1/audit-report.json"), "utf8"));
const shotIds = ["ED-04", "ED-24"];
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const specs = {
  "ED-04": {
    beats: [
      {id: "paragraph-slot", event: "paragraph_slot_created", center: {x: .44, y: .58}, scale: 1.12, role: "ACTION", moveDurationMs: 340},
      {id: "paragraph-run", event: "paragraph_request_run", center: {x: .424, y: .5}, scale: 1.18, role: "ACTION", moveDurationMs: 320},
      {id: "paragraph-candidates", event: "paragraph_candidates_hold", center: {x: .56, y: .52}, scale: 1.26, role: "RESULT", moveDurationMs: 380},
    ],
    resultRegion: {x: .32, y: .28, width: .54, height: .48},
    resultTargetSource: "MANUAL_VERIFIED_PERSISTENT_CANDIDATE_PANEL",
  },
  "ED-24": {
    beats: [
      {id: "selected-phrase", event: "selected_phrase_hold", center: {x: .45, y: .52}, scale: 1.08, role: "PREPARE", moveDurationMs: 380},
      {id: "ban-reason", event: "ban_reason_open", source: "click", center: {x: .44, y: .484}, scale: 1.16, role: "ACTION", moveDurationMs: 340},
      {id: "style-library-confirmed", event: "style_library_hold", center: {x: .5, y: .55}, scale: 1.2, role: "RESULT", moveDurationMs: 360},
    ],
    resultRegion: {x: .32, y: .4, width: .42, height: .3},
    resultTargetSource: "MANUAL_VERIFIED_PERSISTENT_EDITOR_SURFACE_NOT_TOAST",
  },
};
const eventTime = (report, beat) => {
  if (beat.source === "click") {
    const click = report.cursorTelemetry?.clicks?.find((item) => item.down === true && item.event === beat.event);
    if (!click) throw new Error(`boundary-click-missing:${report.shotId}:${beat.event}`);
    return Number(click.tMs);
  }
  const event = report.events?.find((item) => item.name === beat.event);
  if (!event) throw new Error(`boundary-event-missing:${report.shotId}:${beat.event}`);
  return Number(event.outputTimeMs ?? event.tMs);
};

fs.mkdirSync(outputRoot, {recursive: true});
const scenes = [], items = [];
for (const shotId of shotIds) {
  const item = wavePlan.items.find((candidate) => candidate.shotId === shotId);
  if (!item) throw new Error(`boundary-shot-missing:${shotId}`);
  const existingProps = JSON.parse(fs.readFileSync(path.join(root, item.propsPath), "utf8"));
  const sourceScene = existingProps.scenes[0];
  const report = JSON.parse(fs.readFileSync(path.join(root, item.sourceReport), "utf8"));
  const spec = specs[shotId];
  const originalRegion = readiness.items.find((entry) => entry.shotId === shotId)?.latestUsable?.resultRegionProof?.region;
  const rejectedOriginalResultTarget = derivePersistentScreenResultTarget({region: originalRegion, frame: {width: 1280, height: 720}, semanticSource: "PIXEL_DELTA"});
  const resultTargetAdmission = derivePersistentScreenResultTarget({region: spec.resultRegion, frame: {width: 1280, height: 720}, semanticSource: "MANUAL_VERIFIED_PERSISTENT"});
  if (resultTargetAdmission.status !== "PASS" || rejectedOriginalResultTarget.status !== "REJECT") throw new Error(`boundary-result-target-gate:${shotId}`);
  const beats = spec.beats.map((beat) => ({...beat, atMs: eventTime(report, beat), center: beat.role === "RESULT" ? resultTargetAdmission.cameraTarget.center : beat.center}));
  const motion = compileEventSettleScreenMotion({durationMs: sourceScene.durationMs, beats, minimumResultHoldMs: 800});
  if (motion.status !== "PASS") throw new Error(`boundary-motion:${shotId}:${motion.failures.join(",")}`);
  const result = beats.find((beat) => beat.role === "RESULT");
  scenes.push({
    ...sourceScene,
    shotId: `${shotId}-EVENT-SETTLE-BOUNDARY`,
    screenDirection: {
      ...sourceScene.screenDirection,
      grammar: "EVENT_BOUND_MOVE_SETTLE_HOLD",
      cameraPath: "LINEAR_EVENT_SETTLE",
      motionBlurPolicy: "NONE",
      cameraTrack: motion.cameraTrack,
      attentionTrack: [{beat: result.id, startMs: result.atMs, endMs: Math.min(sourceScene.durationMs, result.atMs + 520), region: spec.resultRegion, treatment: "SOURCE_BOUND_SOFT_FOCUS"}],
      cursorPolicy: "SOURCE_PIXELS_ONLY_NO_SYNTHETIC_CURSOR",
    },
    pointerTrack: null,
    cameraTrack: motion.cameraTrack,
    editCoverage: {...sourceScene.editCoverage, mode: "EVENT_BOUND_MOVE_SETTLE_HOLD"},
  });
  items.push({shotId, sourceCurrentWaveOutput: item.outputPath, sourceSha256: item.sourceSha256, beats, resultTargetSource: spec.resultTargetSource, rejectedOriginalResultTarget, resultTargetAdmission, motion});
}
const props = {contract: "A1ContinuousScreenEvidenceReel/v2", width: 960, height: 540, fps: 60, audioUri: "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav", scenes, showReviewLabels: false, boundaryTransitionFrames: 6};
fs.writeFileSync(path.join(outputRoot, "render-props.json"), `${JSON.stringify(props, null, 2)}\n`);
const body = {contract: "A1EventSettleScreenMotionBoundaryProof/v1", status: items.every((item) => item.motion.status === "PASS") ? "READY" : "FAIL", sourceWavePlanSha256: wavePlan.planSha256, shotIds, items, boundary: {blindBoundaryTest: true, proofOnly: true, currentAuthorityMutated: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED"}};
const plan = {...body, planSha256: sha256(body)};
fs.writeFileSync(path.join(outputRoot, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({status: plan.status, shotIds, motions: items.map((item) => ({shotId: item.shotId, moveCount: item.motion.motionWindows.length, motionDutyCycle: item.motion.motionDutyCycle, resultHoldMs: item.motion.resultHoldMs, resultTargetSource: item.resultTargetSource}))}, null, 2));
if (plan.status !== "READY") process.exitCode = 1;
