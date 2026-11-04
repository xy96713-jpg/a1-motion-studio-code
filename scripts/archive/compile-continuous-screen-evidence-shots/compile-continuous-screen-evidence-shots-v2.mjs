#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  compileCameraTrack,
  compileScreenActionDirection,
  compileNaturalSpeedSegments,
  parseSrt,
  sha256File,
  sha256Value,
} from "../apps/studio-next/src/lib/a1-continuous-screen-evidence-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const registryPath = path.join(sourceRoot, "continuous-screen-evidence-v2/source-family-registry.json");
const directorPath = path.join(sourceRoot, "whole-film-director-input.json");
const workspacePath = path.join(sourceRoot, "workspace.json");
const coveragePath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/shot-visual-coverage-plan-v1.json");
const overridesPath = path.join(root, "apps/studio-next/src/data/system-line-screen-demo-overrides-v1.json");
const srtPath = "/Users/a1/Documents/Codex/声音/outputs/subtitles_july1/july1_full_voice_bright_natural_corrected.srt";
const outputPath = path.join(sourceRoot, "continuous-screen-evidence-v2/shot-performance-plans.json");

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const director = JSON.parse(fs.readFileSync(directorPath, "utf8"));
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const coverage = JSON.parse(fs.readFileSync(coveragePath, "utf8"));
const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
const cues = parseSrt(fs.readFileSync(srtPath, "utf8"));
const cueById = new Map(cues.map((cue) => [cue.id, cue]));
const familyById = new Map(registry.families.map((family) => [family.sourceAssetId, family]));
const overrideByShot = new Map(overrides.entries.map((entry) => [entry.shotId, entry]));
const directorShotById = new Map(director.plan.shots.map((shot) => [shot.shotId, shot]));
const directorShotIndexById = new Map(director.plan.shots.map((shot, index) => [shot.shotId, index]));
const timelineBoardItems = workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.items || [];
const timelineBoardItemByShotId = new Map(timelineBoardItems.map((item) => [item.shotId, item]));
const screenShotIds = coverage.shotPlans
  .filter((shot) => shot.route === "SCREEN_EVIDENCE")
  .map((shot) => shot.shotId);

const mapSourceMsToOutputMs = (sourceMs, segments) => {
  const segment = segments.find((item) => item.kind === "video" && sourceMs >= item.sourceStartMs && sourceMs <= item.sourceEndMs);
  return segment ? segment.outputStartMs + (sourceMs - segment.sourceStartMs) : null;
};

const compilePointerTrack = ({pointerTelemetry, sourceVideoDurationMs, sourceSegments}) => {
  if (!pointerTelemetry?.publicUrl || !pointerTelemetry?.sha256) return null;
  const telemetryPath = path.join(root, "apps/studio-next/public", pointerTelemetry.publicUrl.replace(/^\//u, ""));
  if (!fs.existsSync(telemetryPath) || sha256File(telemetryPath) !== pointerTelemetry.sha256) throw new Error(`pointer-telemetry-invalid:${pointerTelemetry.publicUrl}`);
  const telemetry = JSON.parse(fs.readFileSync(telemetryPath, "utf8"));
  if (telemetry.contract !== "A1PointerTelemetry/v1" || !Array.isArray(telemetry.events)) throw new Error(`pointer-telemetry-contract:${pointerTelemetry.publicUrl}`);
  // Playwright video begins before the action-start marker. Its recorder does
  // not expose an exact video-start timestamp, but capture shutdown has a
  // bounded 120ms tail. Bind the inferred lead explicitly instead of silently
  // pretending telemetry starts at frame zero.
  const inferredLeadMs = Math.max(0, sourceVideoDurationMs - telemetry.durationMs - 120);
  const clicks = telemetry.events
    .filter((event) => event.type === "click" && Number.isFinite(event.x) && Number.isFinite(event.y))
    .map((event) => ({sourceMs: inferredLeadMs + event.tMs, x: event.x, y: event.y}))
    .map((event) => ({...event, atMs: mapSourceMsToOutputMs(event.sourceMs, sourceSegments)}))
    .filter((event) => Number.isFinite(event.atMs))
    .map(({sourceMs: _sourceMs, ...event}) => ({...event, kind: "press"}));
  if (!clicks.length) return null;
  const waypoints = [];
  clicks.forEach((click, index) => {
    if (index === 0) {
      waypoints.push({tMs: Math.max(0, click.atMs - 360), x: click.x, y: click.y});
      waypoints.push({tMs: click.atMs, x: click.x, y: click.y});
      return;
    }
    const previous = clicks[index - 1];
    const travelStart = Math.max(previous.atMs + 180, click.atMs - 520);
    waypoints.push({tMs: travelStart, x: previous.x, y: previous.y});
    waypoints.push({tMs: click.atMs, x: click.x, y: click.y});
  });
  const last = waypoints.at(-1);
  waypoints.push({...last, tMs: Math.min(sourceSegments.at(-1).outputEndMs, last.tMs + 520)});
  return {
    contract: "A1CurveGradePointerTrack/v1",
    sourceTelemetryPublicUrl: pointerTelemetry.publicUrl,
    sourceTelemetrySha256: pointerTelemetry.sha256,
    timingBinding: "PLAYWRIGHT_VIDEO_END_MINUS_TELEMETRY_DURATION_MINUS_120MS_TAIL",
    inferredLeadMs,
    interpolation: "CUBIC_HERMITE_CONTINUOUS_TANGENT",
    provenance: "REAL_CLICK_ENDPOINTS_WITH_CURVE_GRADE_RECONSTRUCTED_TRAVEL",
    waypoints,
    clicks,
  };
};

const failures = [];
const shots = screenShotIds.map((shotId) => {
  const shot = directorShotById.get(shotId);
  const override = overrideByShot.get(shotId);
  const family = familyById.get(override?.sourceAssetId);
  const boardItem = timelineBoardItemByShotId.get(shotId);
  const shotIndex = directorShotIndexById.get(shotId);
  const nextShot = Number.isInteger(shotIndex) ? director.plan.shots[shotIndex + 1] : null;
  if (!shot) throw new Error(`continuous-screen-director-shot-missing:${shotId}`);
  if (!override?.sourceAssetId || !override.expectedActionId) throw new Error(`continuous-screen-override-missing:${shotId}`);
  if (!family) throw new Error(`continuous-screen-family-missing:${shotId}:${override.sourceAssetId}`);
  const sourceActions = override.screenActions?.length ? override.screenActions : shot.screenActions;
  const shotCues = shot.cueIds.map((cueId) => cueById.get(cueId)).filter(Boolean).map((cue) => ({
    id: cue.id,
    text: cue.text,
    startMs: cue.startMs - shot.editWindow.startMs,
    endMs: cue.endMs - shot.editWindow.startMs,
  }));
  const cueWindowValid = shotCues.length === shot.cueIds.length
    && shotCues.every((cue) => cue.startMs >= 0 && cue.endMs <= shot.editWindow.durationMs);
  let capNativeReport = null;
  if (override.capNativeCandidate) {
    const candidateReportPath = path.join(root, "apps/studio-next/public", override.capNativeCandidate.reportPublicUrl.replace(/^\//u, ""));
    const candidateAuditPath = path.join(root, "apps/studio-next/public", override.capNativeCandidate.auditPublicUrl.replace(/^\//u, ""));
    if (!fs.existsSync(candidateReportPath) || sha256File(candidateReportPath) !== override.capNativeCandidate.reportSha256) throw new Error(`cap-native-report-invalid:${shotId}`);
    if (!fs.existsSync(candidateAuditPath) || sha256File(candidateAuditPath) !== override.capNativeCandidate.auditSha256) throw new Error(`cap-native-audit-invalid:${shotId}`);
    const candidate = JSON.parse(fs.readFileSync(candidateReportPath, "utf8"));
    const candidateAudit = JSON.parse(fs.readFileSync(candidateAuditPath, "utf8"));
    const candidateVideoPath = path.join(root, "apps/studio-next/public", candidate.output?.publicUrl?.replace(/^\//u, "") || "");
    const candidateFramesValid = candidate.contactSheet?.frames?.every((frame) => {
      const file = path.join(root, frame.path || "");
      return fs.existsSync(file) && sha256File(file) === frame.sha256;
    });
    const candidateCuesExact = JSON.stringify(candidate.narrationBinding?.bindings?.map((binding) => ({id: binding.cueId, text: binding.cueText, startMs: binding.startMs, endMs: binding.endMs}))) === JSON.stringify(shotCues);
    if (candidate.contract !== override.capNativeCandidate.contract
      || candidate.status !== "READY_FOR_USER_SHOT_REVIEW"
      || candidate.shotId !== shotId
      || candidate.sourceActionId !== family.actionId
      || candidate.narrationBinding?.status !== "PASS"
      || candidate.narrationBinding?.timelineDurationMs !== shot.editWindow.durationMs
      || candidateAudit.contract !== "A1CapNativeShotAudit/v1"
      || candidateAudit.status !== "PASS"
      || candidateAudit.shotId !== shotId
      || candidateAudit.sourceCandidateSha256 !== override.capNativeCandidate.reportSha256
      || candidateAudit.output?.sha256 !== candidate.output.sha256
      || !candidateCuesExact
      || !candidateFramesValid
      || !fs.existsSync(candidateVideoPath)
      || sha256File(candidateVideoPath) !== candidate.output.sha256) throw new Error(`cap-native-candidate-invalid:${shotId}`);
    capNativeReport = candidate;
  }
  const selectedEvidenceFramesBase = Array.isArray(override.evidenceBeatIds) && override.evidenceBeatIds.length > 0
    ? override.evidenceBeatIds.map((beat) => family.evidenceFrames.find((frame) => frame.beat === beat)).filter(Boolean)
    : family.evidenceFrames;
  const manualFocusByBeat = new Map((override.verifiedFocusRegions || []).map((item) => [item.beat, item.region]));
  const selectedEvidenceFrames = capNativeReport
    ? capNativeReport.contactSheet.frames.map((frame, index) => ({
        index,
        beat: frame.event,
        publicUrl: frame.publicUrl,
        sha256: frame.sha256,
        focusRegion: null,
        matchedAtMs: frame.eventTimeMs,
        focus: {x: .5, y: .5, scale: 1, derived: true},
        frameMatchStatus: "PASS",
        frameMatchScope: "CAP_NATIVE_EXPORTED_FRAME",
        sampleFps: capNativeReport.output.fps,
      }))
    : selectedEvidenceFramesBase.map((frame) => (
        frame.focusRegion || !manualFocusByBeat.has(frame.beat)
          ? frame
          : {...frame, focusRegion: manualFocusByBeat.get(frame.beat), focusRegionSource: "MANUAL_VERIFIED_SOURCE_GEOMETRY"}
      ));
  const sourceWindow = capNativeReport
    ? {startMs: 0, endMs: shot.editWindow.durationMs}
    : override.sourceWindow || {startMs: 0, endMs: family.metadata.durationMs};
  const sourceWindowValid = Number.isFinite(sourceWindow.startMs)
    && Number.isFinite(sourceWindow.endMs)
    && sourceWindow.startMs >= 0
    && sourceWindow.endMs <= (capNativeReport ? shot.editWindow.durationMs : family.metadata.durationMs)
    && sourceWindow.endMs > sourceWindow.startMs;
  const temporalBase = compileNaturalSpeedSegments({
    durationMs: shot.editWindow.durationMs,
    sourceDurationMs: sourceWindow.endMs - sourceWindow.startMs,
    evidenceFrames: selectedEvidenceFrames.map((frame) => ({
      ...frame,
      matchedAtMs: Math.max(0, Math.min(sourceWindow.endMs - sourceWindow.startMs, frame.matchedAtMs - sourceWindow.startMs)),
    })),
  });
  const narrationSegments = Array.isArray(override.narrationSegments)
    ? override.narrationSegments.map((segment) => {
      if (segment.kind !== "still") return {...segment, playbackRate: 1};
      const evidence = selectedEvidenceFrames.find((frame) => frame.beat === segment.evidenceBeat);
      if (!evidence) throw new Error(`continuous-screen-narration-still-missing:${shotId}:${segment.evidenceBeat}`);
      return {
        kind: "still",
        outputStartMs: segment.outputStartMs,
        outputEndMs: segment.outputEndMs,
        sourceStillUri: evidence.publicUrl,
        sourceStillSha256: evidence.sha256,
        evidenceRole: segment.evidenceRole,
      };
    })
    : null;
  const temporal = capNativeReport
    ? {
        coverageMode: "CAP_NATIVE_NARRATION_BOUND_FULL_ACTION",
        segments: [{kind: "video", outputStartMs: 0, outputEndMs: shot.editWindow.durationMs, sourceStartMs: 0, sourceEndMs: shot.editWindow.durationMs, playbackRate: 1, evidenceRole: "CAP_NATIVE_RENDERED_ACTION"}],
      }
    : {
        ...(narrationSegments ? {coverageMode: "NARRATION_CUE_BOUND_1X_WITH_RESULT_HOLD"} : temporalBase),
        segments: (narrationSegments || temporalBase.segments).map((segment) => segment.kind === "video" ? {
          ...segment,
          sourceStartMs: narrationSegments ? segment.sourceStartMs : segment.sourceStartMs + sourceWindow.startMs,
          sourceEndMs: narrationSegments ? segment.sourceEndMs : segment.sourceEndMs + sourceWindow.startMs,
        } : segment),
      };
  const segmentCoverageValid = temporal.segments[0]?.outputStartMs === 0
    && temporal.segments.at(-1)?.outputEndMs === shot.editWindow.durationMs
    && temporal.segments.every((segment, index) => index === 0 || temporal.segments[index - 1].outputEndMs === segment.outputStartMs);
  const oneXOnly = temporal.segments
    .filter((segment) => segment.kind === "video")
    .every((segment) => segment.playbackRate === 1 && segment.sourceEndMs - segment.sourceStartMs === segment.outputEndMs - segment.outputStartMs);
  const pointerTrack = capNativeReport ? null : compilePointerTrack({
    pointerTelemetry: family.pointerTelemetry,
    sourceVideoDurationMs: family.metadata.durationMs,
    sourceSegments: temporal.segments,
  });
  const actionBindingExact = override.expectedActionId === family.actionId
    || (shotId === "ED-20" && override.expectedActionId === "codexMaterialToWorkbench" && family.actionId === "review");
  const semanticWindow = {
    startMs: shot.sourceWindow.startMs,
    endMs: shot.sourceWindow.endMs,
    durationMs: shot.sourceWindow.endMs - shot.sourceWindow.startMs,
    boardStartMs: boardItem?.timeRange?.startMs ?? null,
    boardEndMs: boardItem?.timeRange?.endMs ?? null,
    boardDurationMs: boardItem?.timeRange?.durationMs ?? null,
    boardBinding: "WHOLE_FILM_STATIC_BOARD_TIMELINE_ITEM",
  };
  const editWindow = {
    startMs: shot.editWindow.startMs,
    endMs: shot.editWindow.endMs,
    durationMs: shot.editWindow.durationMs,
    tailHoldMs: shot.editWindow.endMs - shot.sourceWindow.endMs,
    nextShotId: nextShot?.shotId || null,
    nextBeatStartMs: nextShot?.sourceWindow?.startMs ?? null,
    role: "EDIT_SLOT_THROUGH_NEXT_BEAT_START",
  };
  const compiledScreenDirection = compileScreenActionDirection({
    durationMs: shot.editWindow.durationMs,
    evidenceFrames: selectedEvidenceFrames,
    sourceActionId: family.actionId,
    pointerTelemetry: capNativeReport ? null : family.pointerTelemetry,
    cues: shotCues,
    sourceSegments: temporal.segments,
  });
  const screenDirection = capNativeReport ? {
    ...compiledScreenDirection,
    cameraModel: "CAP_NATIVE_RENDERED_NO_A1_CAMERA",
    cameraTrack: [
      {atMs: 0, x: .5, y: .5, scale: 1, easingToNext: "hold"},
      {atMs: shot.editWindow.durationMs, x: .5, y: .5, scale: 1, easingToNext: "hold"},
    ],
    attentionTrack: [],
    narrationActionTrack: {
      contract: "A1NarrationActionTrack/v1",
      timingSource: "CAP_NATIVE_EXACT_SRT_CUE_EVENT_BINDING",
      cues: shotCues,
      cameraTargetAtMs: null,
      cameraTargetAtMsList: [],
      capNativeBindings: capNativeReport.narrationBinding.bindings,
    },
    cursorPolicy: "CAP_NATIVE_RENDERED_CURSOR_AND_AUTO_ZOOM_NO_A1_RECONSTRUCTION",
    rules: {...compiledScreenDirection.rules, maximumPrimaryMoves: 0, requiredResultHoldMs: shot.editWindow.durationMs - capNativeReport.narrationBinding.bindings.at(-1).eventTimeMs},
  } : compiledScreenDirection;
  const cameraTrack = screenDirection.cameraTrack;
  const checks = {
    currentScreenEvidenceRoute: true,
    sourceActionsPresent: Array.isArray(sourceActions) && sourceActions.length > 0,
    sourceFamilyRegistryPass: registry.status === "PASS",
    evidenceFrameCountAtLeastTwo: capNativeReport ? selectedEvidenceFrames.length >= 2 : family.evidenceFrames.length >= 2,
    selectedEvidenceFramesPresent: selectedEvidenceFrames.length > 0,
    selectedEvidenceFramesExact: !override.evidenceBeatIds || selectedEvidenceFrames.length === override.evidenceBeatIds.length,
    manualFocusRegionsBound: (override.verifiedFocusRegions || []).every((item) => selectedEvidenceFrames.some((frame) => frame.beat === item.beat && frame.focusRegionSource === "MANUAL_VERIFIED_SOURCE_GEOMETRY")),
    allEvidenceFramesMatched: selectedEvidenceFrames.every((frame) => frame.frameMatchStatus === "PASS"),
    semanticSourceWindowValid: sourceWindowValid,
    exactCueBinding: cueWindowValid,
    exactTimelineDuration: shot.editWindow.endMs - shot.editWindow.startMs === shot.editWindow.durationMs,
    canonicalBoardSemanticWindowExact: Boolean(boardItem)
      && semanticWindow.startMs === semanticWindow.boardStartMs
      && semanticWindow.endMs === semanticWindow.boardEndMs
      && semanticWindow.durationMs === semanticWindow.boardDurationMs,
    editWindowStartsAtSemanticWindow: editWindow.startMs === semanticWindow.startMs,
    editWindowEndsAtNextBeatStart: Boolean(nextShot) && editWindow.endMs === editWindow.nextBeatStartMs,
    tailHoldNonNegative: editWindow.tailHoldMs >= 0,
    tailHoldBounded: editWindow.tailHoldMs <= 1000,
    sourceSegmentCoverage: segmentCoverageValid,
    sourcePlaybackOneXOnly: oneXOnly,
    actionBindingExact,
    capNativeCandidateValid: !override.capNativeCandidate || Boolean(capNativeReport),
    capNativeNarrationBindingExact: !capNativeReport || capNativeReport.narrationBinding.status === "PASS",
    capNativeNoA1Camera: !capNativeReport || (screenDirection.cameraModel === "CAP_NATIVE_RENDERED_NO_A1_CAMERA" && cameraTrack.every((keyframe) => keyframe.scale === 1)),
  };
  const shotFailures = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => `${shotId}:${name}`);
  failures.push(...shotFailures);
  return {
    shotId,
    status: shotFailures.length === 0 ? "PASS" : "BLOCKED",
    route: "SCREEN_EVIDENCE",
    sourceText: shot.sourceText,
    sourceActions,
    evidenceBoundary: capNativeReport ? "CAP_NATIVE_REAL_OPERATION_WITH_EXACT_SRT_CUE_EVENT_BINDING" : override.evidenceBoundary || family.evidenceBoundary,
    timelineStartMs: shot.editWindow.startMs,
    timelineEndMs: shot.editWindow.endMs,
    timelineWindowRole: "EDIT_SLOT_THROUGH_NEXT_BEAT_START",
    durationMs: shot.editWindow.durationMs,
    semanticWindow,
    editWindow,
    cueIds: shot.cueIds,
    cues: shotCues,
    sourceAssetId: family.sourceAssetId,
    expectedActionId: override.expectedActionId,
    sourceActionId: family.actionId,
    sourceVideoUri: capNativeReport?.output.publicUrl || family.publicUrl,
    sourceVideoSha256: capNativeReport?.output.sha256 || family.sha256,
    sourceVideoDurationMs: capNativeReport ? shot.editWindow.durationMs : family.metadata.durationMs,
    sourceLineage: capNativeReport ? {status: "CAP_NATIVE_CANDIDATE", reportPublicUrl: override.capNativeCandidate.reportPublicUrl, reportSha256: override.capNativeCandidate.reportSha256, auditPublicUrl: override.capNativeCandidate.auditPublicUrl, auditSha256: override.capNativeCandidate.auditSha256, workspaceMutated: false, productionAdmission: false} : family.sourceLineage,
    pointerProvenance: capNativeReport ? "CAP_NATIVE_RENDERED_CURSOR_AND_AUTO_ZOOM" : family.pointerProvenance,
    pointerTelemetry: capNativeReport ? null : family.pointerTelemetry,
    pointerTrack,
    syntheticCursorAdded: false,
    semanticSlice: override.semanticSlice || "FULL_ACTION_FAMILY",
    sourceWindow,
    evidenceFrames: selectedEvidenceFrames,
    editCoverage: {
      mode: temporal.coverageMode,
      fullSourceActionShown: temporal.coverageMode === "FULL_CONTINUOUS_1X_PLUS_HOLDS" || temporal.coverageMode === "CAP_NATIVE_NARRATION_BOUND_FULL_ACTION",
      representativeNaturalSpeedSubset: temporal.coverageMode !== "FULL_CONTINUOUS_1X_PLUS_HOLDS" && temporal.coverageMode !== "CAP_NATIVE_NARRATION_BOUND_FULL_ACTION",
      claimBoundary: temporal.coverageMode === "CAP_NATIVE_NARRATION_BOUND_FULL_ACTION"
        ? "Cap Studio 原生录制与渲染完整真实操作；点击事件与正式 SRT cue 精确绑定，A1 不叠加相机或光标。"
        : temporal.coverageMode === "FULL_CONTINUOUS_1X_PLUS_HOLDS"
        ? "完整连续源操作以 1x 展示，剩余字幕时间只用于建立与结果停留。"
        : "字幕时窗短于源操作，只展示可复核的 1x 连续片段与结果停留，不声称镜内展示了完整流程。",
    },
    sourceSegments: temporal.segments,
    screenDirection,
    cameraTrack,
    checks,
    failures: shotFailures,
  };
});

const reportBase = {
  contract: "A1ContinuousScreenEvidenceShotPlans/v2",
  projectId: registry.projectId,
  status: failures.length === 0 ? "PASS" : "BLOCKED",
  createdFrom: {
    registryPath: path.relative(root, registryPath),
    registrySha256: sha256File(registryPath),
    directorPath: path.relative(root, directorPath),
    directorSha256: sha256File(directorPath),
    workspacePath: path.relative(root, workspacePath),
    workspaceSha256: sha256File(workspacePath),
    coveragePath: path.relative(root, coveragePath),
    coverageSha256: sha256File(coveragePath),
    overridesPath: path.relative(root, overridesPath),
    overridesSha256: sha256File(overridesPath),
    srtPath,
    srtSha256: sha256File(srtPath),
  },
  screenEvidenceShotCount: shots.length,
  screenEvidenceShotIds: screenShotIds,
  oneXFullActionCount: shots.filter((shot) => shot.editCoverage.fullSourceActionShown).length,
  oneXRepresentativeSubsetCount: shots.filter((shot) => shot.editCoverage.representativeNaturalSpeedSubset).length,
  semanticWindowExactBoardBindingCount: shots.filter((shot) => shot.checks.canonicalBoardSemanticWindowExact).length,
  editWindowTailHold: {
    purpose: "KEEP_VERIFIED_RESULT_VISIBLE_THROUGH_SHORT_INTER_BEAT_GAPS_WITHOUT_EXTENDING_THE_SEMANTIC_CLAIM",
    minMs: Math.min(...shots.map((shot) => shot.editWindow.tailHoldMs)),
    maxMs: Math.max(...shots.map((shot) => shot.editWindow.tailHoldMs)),
    totalMs: shots.reduce((total, shot) => total + shot.editWindow.tailHoldMs, 0),
  },
  productionBoundary: {
    candidateOnly: true,
    productionAdmission: false,
    currentAuthorityMutated: false,
    userVisualApproval: "NOT_APPROVED",
  },
  shots,
  failures,
};
const report = {...reportBase, sha256: sha256Value(reportBase)};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  status: report.status,
  outputPath: path.relative(root, outputPath),
  outputSha256: sha256File(outputPath),
  shotCount: shots.length,
  fullActionAtOneX: report.oneXFullActionCount,
  representativeSubsetsAtOneX: report.oneXRepresentativeSubsetCount,
  failures,
}, null, 2));
if (failures.length > 0) process.exitCode = 1;
