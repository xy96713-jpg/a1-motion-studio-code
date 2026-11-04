#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileEventSettleScreenMotion} from "../apps/studio-next/src/lib/a1-event-settle-screen-motion-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const waveRoot = path.join(root, "work/remotion-screen-coverage-wave15-v1");
const outputRoot = path.join(root, "work/event-settle-screen-motion-proof-v1");
const plan = JSON.parse(fs.readFileSync(path.join(waveRoot, "plan.json"), "utf8"));
const shotIds = ["ED-02", "ED-03", "ED-27"];
const sha256 = (value) => crypto.createHash("sha256")
  .update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const specifications = {
  "ED-02": {
    beats: [
      {id: "rewrite-click", event: "rewrite_click", source: "click", center: {x: .424, y: .579}, scale: 1.18, role: "ACTION", moveDurationMs: 340},
      {id: "rewrite-result", event: "result_hold", source: "event", center: {x: .424, y: .579}, scale: 1.18, role: "RESULT", moveDurationMs: 280},
    ],
    resultRegion: {x: .29, y: .47, width: .42, height: .18},
  },
  "ED-03": {
    beats: [
      {id: "preference-action", event: "like_click", source: "event", center: {x: .44, y: .57}, scale: 1.16, role: "ACTION", moveDurationMs: 320},
      {id: "style-library-result", event: "style_library_hold", source: "event", center: {x: .56, y: .6}, scale: 1.28, role: "RESULT", moveDurationMs: 360},
    ],
    resultRegion: {x: .43, y: .57, width: .3, height: .24},
  },
  "ED-27": {
    beats: [
      {id: "paragraph-context", event: "paragraph_gap_context_hold", source: "event", center: {x: .48, y: .52}, scale: 1.08, role: "PREPARE", moveDurationMs: 420},
      {id: "paragraph-slot", event: "paragraph_slot_created", source: "event", center: {x: .44, y: .58}, scale: 1.18, role: "ACTION", moveDurationMs: 360},
      {id: "paragraph-ready", event: "paragraph_request_ready", source: "event", center: {x: .47, y: .61}, scale: 1.27, role: "RESULT", moveDurationMs: 400},
    ],
    resultRegion: {x: .33, y: .56, width: .32, height: .24},
  },
};

const eventTime = (report, beat) => {
  if (beat.source === "click") {
    const click = report.cursorTelemetry?.clicks?.find((item) =>
      item.down === true && item.event === beat.event);
    if (!click) throw new Error(`event-settle-click-missing:${report.shotId}:${beat.event}`);
    return Number(click.tMs);
  }
  const event = report.events?.find((item) => item.name === beat.event);
  if (!event) throw new Error(`event-settle-event-missing:${report.shotId}:${beat.event}`);
  return Number(event.outputTimeMs ?? event.tMs);
};

fs.mkdirSync(outputRoot, {recursive: true});
const scenes = [], items = [];
for (const shotId of shotIds) {
  const item = plan.items.find((candidate) => candidate.shotId === shotId);
  if (!item) throw new Error(`event-settle-plan-shot-missing:${shotId}`);
  const existingProps = JSON.parse(fs.readFileSync(path.join(root, item.propsPath), "utf8"));
  const sourceScene = existingProps.scenes[0];
  const report = JSON.parse(fs.readFileSync(path.join(root, item.sourceReport), "utf8"));
  const spec = specifications[shotId];
  const beats = spec.beats.map((beat) => ({
    id: beat.id,
    atMs: eventTime(report, beat),
    center: beat.center,
    scale: beat.scale,
    role: beat.role,
    moveDurationMs: beat.moveDurationMs,
  }));
  const motion = compileEventSettleScreenMotion({
    durationMs: sourceScene.durationMs,
    beats,
    minimumResultHoldMs: 800,
  });
  if (motion.status !== "PASS") throw new Error(`event-settle-motion-failed:${shotId}:${motion.failures.join(",")}`);
  const resultBeat = beats.find((beat) => beat.role === "RESULT");
  const attentionTrack = resultBeat ? [{
    beat: resultBeat.id,
    startMs: resultBeat.atMs,
    endMs: Math.min(sourceScene.durationMs, resultBeat.atMs + 520),
    region: spec.resultRegion,
    treatment: "SOURCE_BOUND_SOFT_FOCUS",
  }] : [];
  const scene = {
    ...sourceScene,
    shotId: `${shotId}-EVENT-SETTLE-PROOF`,
    screenDirection: {
      ...sourceScene.screenDirection,
      grammar: "EVENT_BOUND_MOVE_SETTLE_HOLD",
      cameraPath: "LINEAR_EVENT_SETTLE",
      motionBlurPolicy: "NONE",
      cameraTrack: motion.cameraTrack,
      attentionTrack,
      cursorPolicy: "SOURCE_PIXELS_ONLY_NO_SYNTHETIC_CURSOR",
    },
    pointerTrack: null,
    cameraTrack: motion.cameraTrack,
    editCoverage: {...sourceScene.editCoverage, mode: "EVENT_BOUND_MOVE_SETTLE_HOLD"},
  };
  scenes.push(scene);
  items.push({
    shotId,
    sourceSha256: item.sourceSha256,
    sourceReport: item.sourceReport,
    sourceCurrentWaveOutput: item.outputPath,
    directorFamily: item.directorFamily,
    beats,
    motion,
  });
}

const props = {
  contract: "A1ContinuousScreenEvidenceReel/v2",
  width: 960,
  height: 540,
  fps: 60,
  audioUri: "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav",
  scenes,
  showReviewLabels: false,
  boundaryTransitionFrames: 6,
};
const propsPath = path.join(outputRoot, "render-props.json");
fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
const body = {
  contract: "A1EventSettleScreenMotionProofPlan/v1",
  status: items.length === 3 && items.every((entry) => entry.motion.status === "PASS") ? "READY" : "FAIL",
  sourceWavePlanSha256: plan.planSha256,
  shotIds,
  items,
  propsPath: path.relative(root, propsPath),
  boundary: {proofOnly: true, currentAuthorityMutated: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED"},
};
const proof = {...body, proofPlanSha256: sha256(body)};
fs.writeFileSync(path.join(outputRoot, "plan.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify({status: proof.status, shotIds, proofPlanSha256: proof.proofPlanSha256, motions: items.map((item) => ({shotId: item.shotId, moveCount: item.motion.motionWindows.length, motionDutyCycle: item.motion.motionDutyCycle, resultHoldMs: item.motion.resultHoldMs}))}, null, 2));
if (proof.status !== "READY") process.exitCode = 1;
