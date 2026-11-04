#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileEventSettleScreenMotion} from "../apps/studio-next/src/lib/a1-event-settle-screen-motion-v1.mjs";
import {derivePersistentScreenResultTarget} from "./lib/derive-persistent-screen-result-target-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "work/event-settle-screen-wave15-v1");
const sourcePlanPath = path.join(root, "work/remotion-screen-coverage-wave15-v1/plan.json");
const sourceReadinessPath = path.join(root, "work/screen-result-region-readiness-v1/audit-report.json");
const expectedShotIds = [
  "ED-02", "ED-03", "ED-04", "ED-05", "ED-06",
  "ED-21", "ED-22", "ED-23", "ED-24", "ED-25",
  "ED-26", "ED-27", "ED-28", "ED-29", "ED-30",
];

const TARGET_POLICY = Object.freeze({
  "ED-02": "DOM", "ED-03": "MANUAL", "ED-04": "DOM", "ED-05": "DOM",
  "ED-06": "FULL_STATE", "ED-21": "DOM", "ED-22": "FULL_STATE",
  "ED-23": "FULL_STATE", "ED-24": "FULL_STATE", "ED-25": "DOM",
  "ED-26": "MANUAL", "ED-27": "DOM", "ED-28": "MANUAL",
  "ED-29": "DOM", "ED-30": "FULL_STATE",
});

// Times and positions are always recovered from the bound capture report. The
// mapping only declares which semantic event is the decisive action.
const ACTION_SPEC = Object.freeze({
  "ED-02": {event: null, click: "rewrite_click"},
  "ED-03": {event: "like_click", click: "like_click"},
  "ED-04": {event: "paragraph_request_run", click: "paragraph_request_run"},
  "ED-05": {event: "review_click", click: "review_click"},
  "ED-06": {event: "presentation_open", click: "presentation_open"},
  "ED-21": {event: "document_opened", click: "edit_started", initializeFullStateWithoutClick: true},
  "ED-22": {event: "save_shortcut", click: "save_edit_marker"},
  "ED-23": {event: "current_topic_five_versions", click: "current_topic_versions_open"},
  "ED-24": {event: "ban_click", click: "ban_click"},
  "ED-25": {event: "similar_phrase_selected", click: "intercept_panel_hold", initializeIfBeforeMs: 80},
  "ED-26": {event: "rewrite_click", click: "rewrite_click"},
  "ED-27": {event: "paragraph_slot_created", click: "paragraph_slot_created"},
  "ED-28": {event: "paragraph_request_run", click: "paragraph_request_run"},
  "ED-29": {event: "review_click", click: "review_click"},
  "ED-30": {event: "presentation_open", click: "presentation_open"},
});

const RESULT_EVENT = Object.freeze({
  "ED-02": "result_hold",
  "ED-03": "style_library_hold",
  "ED-04": "paragraph_candidates_hold",
  "ED-05": "review_findings_hold",
  "ED-21": "edit_applied",
  "ED-25": "preference_intercept_matched",
  "ED-26": "candidates_with_memory_hold",
  "ED-27": "paragraph_request_ready",
  "ED-28": "paragraph_candidate_applied",
  "ED-29": "review_findings_hold",
});
const RESULT_SCALE_CAP = Object.freeze({
  "ED-03": 1.24,
  "ED-04": 1.3,
  "ED-05": 1.28,
  "ED-21": 1.24,
  "ED-25": 1.24,
  "ED-26": 1.22,
  "ED-27": 1.28,
  "ED-28": 1.28,
  "ED-29": 1.28,
});
const RESULT_PLANNED_AT_MIN = Object.freeze({"ED-25": 840});

// These two regions were classified for manual proof because neither result is
// reducible to one stable automatic DOM target: ED-26 is a causal candidate
// rail and ED-28 is the paragraph writeback surface.
const MANUAL_RESULT = Object.freeze({
  "ED-03": {
    targetKey: "preference-status-and-selected-line",
    region: {x: 0.16, y: 0.42, width: 0.52, height: 0.35},
    semanticSource: "MANUAL_VERIFIED_PERSISTENT_PREFERENCE_STATUS_COMPOSITION",
    reviewBasis: "PERSISTENT_SELECTION_MENU_STATUS_PLUS_SELECTED_SENTENCE_REQUIRE_COMBINED_FRAMING",
  },
  "ED-26": {
    targetKey: "preference-memory-candidate-rail",
    region: {x: 0.67, y: 0.07, width: 0.31, height: 0.84},
    semanticSource: "MANUAL_VERIFIED_PERSISTENT_CAUSAL_CANDIDATE_RAIL",
    reviewBasis: "CURRENT_RESULT_FRAME_SHOWS_MEMORY_PROOF_AND_THREE_CANDIDATES",
  },
  "ED-28": {
    targetKey: "paragraph-writeback-surface",
    region: {x: 0.075, y: 0.285, width: 0.455, height: 0.13},
    semanticSource: "MANUAL_VERIFIED_PERSISTENT_PARAGRAPH_WRITEBACK",
    reviewBasis: "CURRENT_RESULT_FRAME_SHOWS_APPLIED_PARAGRAPH_IN_EDITOR",
  },
});

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const inUnitFrame = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const outputTime = (event) => Number(event?.outputTimeMs ?? event?.tMs);

const executionPlanPath = path.join(root, "work/cap-native-production-v2/plan.json");
const executionPlan = fs.existsSync(executionPlanPath) ? readJson(executionPlanPath) : null;
function latestCurrentPersistentReport(shotId) {
  const directory = path.join(root, "work", `headless-${shotId.toLowerCase()}-v1`);
  const expectedRevision = executionPlan?.shots?.find((item) => item.shotId === shotId)?.authority?.revisionSha256;
  const expectedWorkspaceSha256 = executionPlan?.source?.workspaceSha256;
  if (!fs.existsSync(directory) || !expectedRevision || !expectedWorkspaceSha256) return null;
  return fs.readdirSync(directory, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(directory, entry.name, "report.json")))
    .map((entry) => path.join(directory, entry.name, "report.json"))
    .map((file) => ({file, report: readJson(file)}))
    .filter(({report}) => report.sourceWorkspaceSha256 === expectedWorkspaceSha256
      && report.sourceStoryboardRevisionSha256 === expectedRevision
      && report.persistentResultDom?.status === "PASS")
    .sort((left, right) => String(right.report.generatedAt || "").localeCompare(String(left.report.generatedAt || "")))[0] || null;
}

function resolveActionBeat(report, shotId, policy, blockers) {
  const spec = ACTION_SPEC[shotId];
  const click = report.cursorTelemetry?.clicks?.find((item) => item.down === true && item.event === spec.click);
  const event = spec.event ? report.events?.find((item) => item.name === spec.event) : null;
  if (policy === "FULL_STATE") {
    const sourceAtMs = event ? outputTime(event) : 0;
    return {
      beat: {id: `${shotId.toLowerCase()}-full-state`, atMs: Math.max(0, Math.round(sourceAtMs)), center: {x: .5, y: .5}, scale: 1, role: "STATIC_STATE", moveDurationMs: 340},
      evidence: {status: "PASS", timingSource: "FULL_STATE_INITIALIZATION", captureEvent: spec.event, clickEvent: spec.click, sourceAtMs: Math.max(0, Math.round(sourceAtMs)), plannedAtMs: Math.max(0, Math.round(sourceAtMs)), initializedAtShotStart: sourceAtMs <= 0, click: null},
    };
  }
  if (spec.initializeFullStateWithoutClick) {
    const sourceAtMs = event ? outputTime(event) : 0;
    return {
      beat: {id: `${shotId.toLowerCase()}-action`, atMs: Math.max(0, Math.round(sourceAtMs)), center: {x: .5, y: .5}, scale: 1, role: "ACTION", moveDurationMs: 340},
      evidence: {status: "PASS", timingSource: "FULL_STATE_INITIALIZATION", captureEvent: spec.event, clickEvent: spec.click, sourceAtMs: Math.max(0, Math.round(sourceAtMs)), plannedAtMs: Math.max(0, Math.round(sourceAtMs)), initializedAtShotStart: sourceAtMs <= 0, click: null},
    };
  }
  if (!click) {
    blockers.push(`ACTION_CLICK_TELEMETRY_MISSING:${spec.click}`);
    return {beat: null, evidence: {status: "BLOCKED", clickEvent: spec.click, captureEvent: spec.event}};
  }
  if (!inUnitFrame(Number(click.x)) || !inUnitFrame(Number(click.y))) {
    blockers.push(`ACTION_CLICK_TELEMETRY_OUT_OF_FRAME:${spec.click}`);
    return {
      beat: null,
      evidence: {status: "BLOCKED", clickEvent: spec.click, captureEvent: spec.event, click: {tMs: click.tMs, x: click.x, y: click.y}},
    };
  }
  if (spec.event && !event) {
    blockers.push(`ACTION_CAPTURE_EVENT_MISSING:${spec.event}`);
    return {beat: null, evidence: {status: "BLOCKED", clickEvent: spec.click, captureEvent: spec.event}};
  }
  const sourceAtMs = spec.event ? outputTime(event) : Number(click.tMs);
  if (!Number.isFinite(sourceAtMs)) {
    blockers.push(`ACTION_TIME_INVALID:${spec.event || spec.click}`);
    return {beat: null, evidence: {status: "BLOCKED", clickEvent: spec.click, captureEvent: spec.event}};
  }
  const plannedAtMs = sourceAtMs <= Number(spec.initializeIfBeforeMs || -1) ? 0 : Math.round(sourceAtMs);
  const scale = policy === "DOM" ? 1.16 : policy === "MANUAL" ? 1.12 : 1.08;
  return {
    beat: {
      id: `${shotId.toLowerCase()}-action`,
      atMs: plannedAtMs,
      center: {x: Number(click.x), y: Number(click.y)},
      scale,
      role: "ACTION",
      moveDurationMs: 340,
    },
    evidence: {
      status: "PASS",
      timingSource: spec.event ? "CAPTURE_EVENT" : "CLICK_TELEMETRY",
      captureEvent: spec.event,
      clickEvent: spec.click,
      sourceAtMs: Math.round(sourceAtMs),
      plannedAtMs,
      initializedAtShotStart: plannedAtMs === 0,
      click: {tMs: click.tMs, x: click.x, y: click.y, down: true},
    },
  };
}

function domPersistencePasses(dom, durationMs) {
  return dom?.status === "PASS"
    && dom.finalVisible === true
    && dom.rectDrift?.status === "PASS"
    && Number(dom.rectDrift?.maxAbsPx) <= 2
    && Number.isFinite(Number(dom.finalObservedAtMs))
    && Math.abs(Number(dom.finalObservedAtMs) - (durationMs - 250)) <= 50
    && typeof dom.identitySha256 === "string"
    && /^[a-f0-9]{64}$/u.test(dom.identitySha256);
}

function resolveResultTarget({report, shotId, policy, frame, readinessItem, blockers}) {
  if (policy === "FULL_STATE") {
    return {
      admission: {status: "NOT_REQUIRED", reason: "FULL_STATE_KEEP_ACTION_COMPOSITION", cameraTarget: null},
      resultBeat: null,
      sourceEvidence: {kind: "FULL_STATE", pixelDeltaConsumed: false},
    };
  }

  let admission;
  let sourceEvidence;
  if (policy === "DOM") {
    const dom = report.persistentResultDom;
    if (!dom) {
      blockers.push("PERSISTENT_RESULT_DOM_MISSING");
      return {
        admission: {status: "BLOCKED", reason: "PERSISTENT_RESULT_DOM_MISSING", cameraTarget: null},
        resultBeat: null,
        sourceEvidence: {kind: "DOM", persistentResultDom: null, pixelDeltaConsumed: false},
      };
    }
    if (dom.resultEvent !== RESULT_EVENT[shotId]) blockers.push(`PERSISTENT_RESULT_DOM_EVENT_MISMATCH:${dom.resultEvent || "NONE"}`);
    const persistencePass = domPersistencePasses(dom, Number(report.authorityDurationMs || report.output?.durationMs));
    if (!persistencePass) blockers.push("PERSISTENT_RESULT_DOM_FINAL_HOLD_UNVERIFIED");
    admission = derivePersistentScreenResultTarget({
      region: dom.finalRect,
      frame,
      semanticSource: {
        type: "DOM_VERIFIED_RESULT",
        status: dom.status,
        finalHoldVerified: persistencePass,
        persistsThroughFinalHold: persistencePass,
      },
      persistenceEvidence: {status: persistencePass ? "PASS" : "FAIL", finalHoldVerified: persistencePass},
    });
    sourceEvidence = {kind: "DOM", persistentResultDom: dom, pixelDeltaConsumed: false};
  } else {
    const manual = MANUAL_RESULT[shotId];
    admission = derivePersistentScreenResultTarget({
      region: manual.region,
      frame,
      semanticSource: {
        type: manual.semanticSource,
        status: "PASS",
        finalHoldVerified: true,
        persistsThroughFinalHold: true,
      },
      persistenceEvidence: {status: "PASS", finalHoldVerified: true},
    });
    sourceEvidence = {
      kind: "MANUAL",
      ...manual,
      finalFrame: readinessItem?.latestUsable?.resultRegionProof?.frames?.afterFile || null,
      finalFrameSha256: readinessItem?.latestUsable?.resultRegionProof?.frames?.afterSha256 || null,
      pixelDeltaConsumed: false,
    };
  }

  if (admission.status !== "PASS") {
    blockers.push(`PERSISTENT_RESULT_TARGET_REJECTED:${admission.reason}`);
    return {admission, resultBeat: null, sourceEvidence};
  }
  const resultEvent = report.events?.find((item) => item.name === RESULT_EVENT[shotId]);
  const atMs = outputTime(resultEvent);
  if (!resultEvent || !Number.isFinite(atMs)) {
    blockers.push(`RESULT_CAPTURE_EVENT_MISSING:${RESULT_EVENT[shotId]}`);
    return {admission, resultBeat: null, sourceEvidence};
  }
  const durationMs = Number(report.authorityDurationMs || report.output?.durationMs);
  if (durationMs - atMs < 1150) {
    return {
      admission,
      resultBeat: null,
      sourceEvidence: {...sourceEvidence, resultMoveOmittedReason: "SHORT_SHOT_PRESERVE_ACTION_COMPOSITION", persistentResultEventAtMs: Math.round(atMs)},
    };
  }
  return {
    admission,
    resultBeat: {
      id: `${shotId.toLowerCase()}-result`,
      atMs: Math.max(Math.round(atMs), RESULT_PLANNED_AT_MIN[shotId] || 0),
      center: admission.cameraTarget.center,
      scale: Math.min(admission.cameraTarget.suggestedScale, RESULT_SCALE_CAP[shotId] || 1.3),
      role: "RESULT",
      moveDurationMs: 380,
    },
    sourceEvidence,
  };
}

if (!fs.existsSync(sourcePlanPath) || !fs.existsSync(sourceReadinessPath)) throw new Error("event-settle-wave15-source-index-missing");
const sourcePlan = readJson(sourcePlanPath);
const readiness = readJson(sourceReadinessPath);
if (!["A1RemotionScreenCoverageWave15Plan/v1", "A1RemotionScreenCoverageWave15Plan/v2"].includes(sourcePlan.contract)) {
  throw new Error("event-settle-wave15-source-contract");
}
if (expectedShotIds.some((shotId) => !sourcePlan.items.some((item) => item.shotId === shotId))) throw new Error("event-settle-wave15-source-shot-set");

fs.mkdirSync(outputRoot, {recursive: true});
const items = [];
const scenes = [];
for (const shotId of expectedShotIds) {
  const blockers = [];
  const sourceItem = sourcePlan.items.find((item) => item.shotId === shotId);
  const policy = TARGET_POLICY[shotId];
  const latestPersistent = latestCurrentPersistentReport(shotId);
  const reportPath = latestPersistent?.file || path.join(root, sourceItem.sourceReport);
  const propsPath = path.join(root, sourceItem.propsPath);
  if (!fs.existsSync(reportPath) || !fs.existsSync(propsPath)) throw new Error(`event-settle-wave15-source-file:${shotId}`);
  const report = readJson(reportPath);
  const existingProps = readJson(propsPath);
  const sourceScene = existingProps.scenes?.[0];
  if (!sourceScene) throw new Error(`event-settle-wave15-source-scene:${shotId}`);
  const durationMs = Number(report.authorityDurationMs || report.output?.durationMs);
  const frame = {width: Number(report.output?.width), height: Number(report.output?.height)};
  if (!Number.isFinite(durationMs) || durationMs <= 0) blockers.push("CAPTURE_DURATION_INVALID");
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height)) blockers.push("CAPTURE_FRAME_INVALID");
  const sourceVideoPath = path.join(root, report.output?.path || "");
  if (!report.output?.path || !fs.existsSync(sourceVideoPath) || sha256File(sourceVideoPath) !== report.output?.sha256) blockers.push("CAPTURE_SOURCE_SHA_MISMATCH");

  if (policy === "DOM" && !latestPersistent) blockers.push("CURRENT_PERSISTENT_RESULT_REPORT_MISSING");
  const action = resolveActionBeat(report, shotId, policy, blockers);
  const result = resolveResultTarget({
    report,
    shotId,
    policy,
    frame,
    readinessItem: readiness.items?.find((item) => item.shotId === shotId),
    blockers,
  });
  const beats = [action.beat, result.resultBeat].filter(Boolean);
  const motion = compileEventSettleScreenMotion({durationMs, beats, minimumResultHoldMs: 800});
  if (motion.status !== "PASS") blockers.push(...motion.failures.map((failure) => `MOTION_COMPILE:${failure}`));
  const safeCameraTrack = motion.status === "PASS" ? motion.cameraTrack : [
    {atMs: 0, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold", phase: "HOLD", beatId: null},
    {atMs: durationMs, x: 0.5, y: 0.5, scale: 1, easingToNext: "hold", phase: "HOLD_END", beatId: null},
  ];
  const scene = {
    ...sourceScene,
    shotId: `${shotId}-EVENT-SETTLE-DRAFT`,
    screenDirection: {
      ...sourceScene.screenDirection,
      grammar: "EVENT_BOUND_MOVE_SETTLE_HOLD",
      cameraPath: "LINEAR_EVENT_SETTLE",
      motionBlurPolicy: "NONE",
      cameraTrack: safeCameraTrack,
      attentionTrack: result.resultBeat ? [{
        beat: result.resultBeat.id,
        startMs: result.resultBeat.atMs,
        endMs: Math.min(durationMs, result.resultBeat.atMs + 520),
        region: result.admission.cameraTarget.region,
        treatment: "SOURCE_BOUND_SOFT_FOCUS",
      }] : [],
      cursorPolicy: "SOURCE_PIXELS_ONLY_NO_SYNTHETIC_CURSOR",
    },
    pointerTrack: null,
    cameraTrack: safeCameraTrack,
    editCoverage: {
      ...sourceScene.editCoverage,
      mode: "EVENT_BOUND_MOVE_SETTLE_HOLD",
      resultMoveOmitted: result.resultBeat == null,
      finalCompositionRole: result.resultBeat ? "PERSISTENT_RESULT_HOLD" : "ACTION_HOLD",
    },
  };
  scenes.push(scene);
  items.push({
    shotId,
    status: blockers.length ? "BLOCKED" : "READY",
    targetPolicy: policy,
    source: {
      reportPath: path.relative(root, reportPath),
      reportSha256: sha256File(reportPath),
      videoPath: report.output?.path || null,
      videoSha256: report.output?.sha256 || null,
      oldPixelDeltaReadinessConsumed: false,
    },
    actionBeat: action.beat,
    actionEvidence: action.evidence,
    resultTargetAdmission: result.admission,
    resultTargetEvidence: result.sourceEvidence,
    resultBeat: result.resultBeat,
    beats,
    motion,
    propsDraft: {
      sceneIndex: scenes.length - 1,
      cameraTrackStatus: motion.status,
      renderAllowed: false,
      finalCompositionRole: result.resultBeat ? "PERSISTENT_RESULT_HOLD" : "ACTION_HOLD",
    },
    blockers,
  });
}

const propsDraft = {
  contract: "A1ContinuousScreenEvidenceReel/v2",
  status: items.every((item) => item.status === "READY") ? "READY" : "BLOCKED",
  width: 960,
  height: 540,
  fps: 60,
  audioUri: "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/source-audio-ad156741f33d.wav",
  scenes,
  showReviewLabels: false,
  boundaryTransitionFrames: 6,
  boundary: {
    proofOnly: true,
    draftOnly: true,
    renderAllowed: false,
    renderPerformed: false,
    workspaceMutationPerformed: false,
    currentPhaseMutationPerformed: false,
    productionAdmission: false,
  },
};
const propsDraftPath = path.join(outputRoot, "render-props.draft.json");
fs.writeFileSync(propsDraftPath, `${JSON.stringify(propsDraft, null, 2)}\n`);

const body = {
  contract: "A1EventSettleScreenWave15Plan/v1",
  status: items.every((item) => item.status === "READY") ? "READY" : "BLOCKED",
  sourceWavePlanPath: path.relative(root, sourcePlanPath),
  sourceWavePlanSha256: sourcePlan.planSha256,
  sourceResultReadinessPath: path.relative(root, sourceReadinessPath),
  sourceResultReadinessAuditSha256: readiness.auditSha256,
  shotIds: expectedShotIds,
  shotCount: items.length,
  readyCount: items.filter((item) => item.status === "READY").length,
  blockedCount: items.filter((item) => item.status === "BLOCKED").length,
  blockedShotIds: items.filter((item) => item.status === "BLOCKED").map((item) => item.shotId),
  targetPolicyCounts: Object.fromEntries(["DOM", "MANUAL", "FULL_STATE"].map((policy) => [policy, items.filter((item) => item.targetPolicy === policy).length])),
  items,
  propsDraftPath: path.relative(root, propsDraftPath),
  propsDraftSha256: sha256File(propsDraftPath),
  boundary: {
    proofOnly: true,
    sourceWaveDisposition: "USER_REJECTED_SYSTEM_GRAMMAR",
    currentAuthorityMutated: false,
    workspaceMutationPerformed: false,
    currentPhaseMutationPerformed: false,
    rendererAdoptionAllowed: false,
    renderAllowed: false,
    renderPerformed: false,
    fullMotionSpecAllowed: false,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    pixelDeltaFallbackAllowed: false,
  },
};
const plan = {...body, planSha256: sha256Value(body)};
fs.writeFileSync(path.join(outputRoot, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({
  status: plan.status,
  shotCount: plan.shotCount,
  readyCount: plan.readyCount,
  blockedCount: plan.blockedCount,
  blockedShotIds: plan.blockedShotIds,
  targetPolicyCounts: plan.targetPolicyCounts,
  planSha256: plan.planSha256,
  propsDraftPath: plan.propsDraftPath,
}, null, 2));
