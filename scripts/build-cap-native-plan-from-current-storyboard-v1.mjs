#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileScreenInteractionIntent} from "../apps/studio-next/src/lib/a1-screen-interaction-timeline-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phaseRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const workspacePath = path.join(phaseRoot, "workspace.json");
const overridesPath = path.join(root, "apps/studio-next/src/data/system-line-screen-demo-overrides-v1.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const outputDir = path.join(root, "work/cap-native-production-v2");
const outputPath = path.join(outputDir, "plan.json");

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const cameraRecipeFor = (shot, plan) => {
  const actionId=plan.screenActionId||null;
  const interactionIntent=compileScreenInteractionIntent({actionId,actionContract:shot.actionContract,durationMs:shot.timeRange?.durationMs,screenActions:plan.screenActions||[]});
  const body={contract:"A1CapStoryboardCameraRecipe/v1",shotId:shot.shotId,actionId,actionContract:shot.actionContract,intent:"SEMANTIC_INTERACTION_TIMELINE",interactionIntent,phases:interactionIntent.phases,handoff:shot.actionContract?.handoff||null,maximumConcurrentFocusActors:interactionIntent.maximumConcurrentFocusActors,maximumSemanticZooms:interactionIntent.maximumSemanticZooms,minimumResultHoldMs:interactionIntent.minimumResultHoldMs,hardJumpZoomForbidden:interactionIntent.hardJumpZoomForbidden};
  return {...body,recipeSha256:sha(body)};
};
const workspace = read(workspacePath);
const overrides = read(overridesPath);
const currentPhase = read(currentPhasePath);
const authority = workspace?.production?.shotIntelligence?.currentStoryboardAuthority;
const coverage = workspace?.production?.shotVisualCoveragePlan?.shotPlans;
const timeline = workspace?.production?.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.items;

if (authority?.contract !== "A1CurrentStoryboardAuthority/v1" || authority.current !== true) throw new Error("current-storyboard-authority-unavailable");
if (!Array.isArray(authority.shots) || authority.shots.length !== 34 || !Array.isArray(coverage) || !Array.isArray(timeline)) throw new Error("current-storyboard-projection-incomplete");
const screenCaptureAuthorization = workspace?.production?.screenCaptureAuthorization;
const captureAuthorityGranted = (currentPhase?.reviewDecision?.motionPrototypeAllowed === true
  && currentPhase?.authority?.state !== "whole-film-static-board-review")
  || (screenCaptureAuthorization?.contract === "A1ScreenCaptureAuthorization/v1"
    && screenCaptureAuthorization.status === "AUTHORIZED_BY_EXPLICIT_USER_DIRECTIVE"
    && screenCaptureAuthorization.current === true
    && Array.isArray(screenCaptureAuthorization.targetShotIds)
    && screenCaptureAuthorization.targetShotIds.length > 0);
const currentPhaseBlocker = captureAuthorityGranted
  ? null
  : `CAPTURE_BLOCKED_BY_CURRENT_PHASE:${currentPhase?.authority?.state || currentPhase?.status || "UNKNOWN"}`;

const coverageByShot = new Map(coverage.map((item) => [item.shotId, item]));
const timelineByShot = new Map(timeline.map((item) => [item.shotId, item]));
const overrideByShot = new Map(overrides.entries.map((item) => [item.shotId, item]));
const failures = [];
const unfinishedActionIds = new Set();
const unfinishedShotIds = new Set();
const authorizedShotIds = new Set(screenCaptureAuthorization?.targetShotIds || authority.shots.map((shot) => shot.shotId));
const shots = authority.shots.filter((shot) => coverageByShot.get(shot.shotId)?.route === "SCREEN_EVIDENCE" && authorizedShotIds.has(shot.shotId)).map((shot) => {
  const plan = coverageByShot.get(shot.shotId);
  const timelineItem = timelineByShot.get(shot.shotId);
  const currentCandidate = overrideByShot.get(shot.shotId)?.capNativeCandidate || null;
  const actionId = plan.screenActionId || null;
  const isUnfinishedAction = unfinishedActionIds.has(actionId) || unfinishedShotIds.has(shot.shotId);
  const cameraRecipe = isUnfinishedAction ? {contract:"A1CapStoryboardCameraRecipe/v1",shotId:shot.shotId,actionId,actionContract:shot.actionContract,intent:"FUTURE_FEATURE_PENDING_8766_INGEST",phases:[],handoff:shot.actionContract?.handoff||null,maximumConcurrentFocusActors:1,hardJumpZoomForbidden:true,recipeSha256:"future-feature-pending"} : cameraRecipeFor(shot, plan);
  const authorityCandidate=shot.capNativeCandidate||null;
  const reportPath = currentCandidate?.reportPublicUrl ? path.join(root, "apps/studio-next/public", currentCandidate.reportPublicUrl.replace(/^\//u, "")) : null;
  const report = reportPath && fs.existsSync(reportPath) ? read(reportPath) : null;
  const legacyCandidateBound = Boolean(
    report
    && currentCandidate?.reportSha256
    && report.sourceWorkspaceSha256 === workspace.workspaceSha256
    && report.sourceStoryboardVersionId === shot.versionId
    && report.sourceStoryboardRevisionSha256 === shot.revisionSha256
    && report.shotId === shot.shotId
  );
  const authorityCandidateBound=Boolean(authorityCandidate&&authorityCandidate.sourceStoryboardVersionId===shot.versionId&&authorityCandidate.sourceStoryboardRevisionSha256===shot.revisionSha256&&authorityCandidate.cameraRecipeSha256===cameraRecipe.recipeSha256);
  const candidateBound=authorityCandidateBound||legacyCandidateBound;
  if (!shot.versionId || !shot.revisionSha256 || !shot.actionContract || !timelineItem?.timeRange) failures.push(`SHOT_AUTHORITY_INCOMPLETE:${shot.shotId}`);
  return {
    shotId: shot.shotId,
    order: shot.order,
    authority: {
      versionId: shot.versionId,
      revisionSha256: shot.revisionSha256,
      route: shot.route,
      sourceText: shot.sourceText,
      semanticJob: shot.semanticJob,
      actionContract: shot.actionContract,
      timeRange: timelineItem?.timeRange || shot.timeRange || null,
    },
    execution: {
      actionId: plan.screenActionId || null,
      screenActions: plan.screenActions || [],
      motionContract: plan.screenMotionContract || null,
      cameraRecipe,
      expectedProductIdentity: "A1_WRITING_WORKBENCH_V2",
      captureTargetPolicy: "EXACT_WINDOW_PLUS_PIXEL_IDENTITY",
    },
    candidate: candidateBound
      ? {status: "CURRENT_REVISION_BOUND", source:authorityCandidateBound?"CURRENT_STORYBOARD_AUTHORITY":"LEGACY_OVERRIDE", reportPublicUrl: currentCandidate?.reportPublicUrl||null, reportSha256: currentCandidate?.reportSha256||null}
      : {status: "CAPTURE_REQUIRED_FOR_CURRENT_REVISION", rejectedExistingReason: authorityCandidate||report ? "CANDIDATE_NOT_BOUND_TO_CURRENT_CAMERA_RECIPE" : "NO_EXISTING_CAP_CANDIDATE"},
  };
});

if (shots.length === 0 || shots.length > 16) failures.push(`SCREEN_SHOT_COUNT_INVALID:${shots.length}`);
if (shots.some((shot) => !shot.execution.actionId)) failures.push("SCREEN_ACTION_ID_MISSING");
if (currentPhaseBlocker) failures.push(currentPhaseBlocker);
const unfinishedShots = shots.filter((shot) => shot.execution.cameraRecipe.intent === "FUTURE_FEATURE_PENDING_8766_INGEST").map((shot) => shot.shotId);
const warnings = [];
if (unfinishedShots.length) warnings.push(`UNFINISHED_8766_ACTIONS:${unfinishedShots.join(",")}`);
const body = {
  contract: "A1CapNativeStoryboardExecutionPlan/v1",
  status: failures.length ? "BLOCKED" : "READY",
  source: {
    workspaceSha256: workspace.workspaceSha256,
    storyboardAuthorityContract: authority.contract,
    storyboardAuthorityUpdatedAt: authority.updatedAt || null,
    userVisualApproval: authority.userVisualApproval,
    productionAdmission: authority.productionAdmission,
    currentPhase: {
      status: currentPhase?.status || null,
      state: currentPhase?.authority?.state || null,
      captureAuthorityGranted,
    },
  },
  policy: {
    solePlanningAuthority: "workspace.production.shotIntelligence.currentStoryboardAuthority",
    frontendProjection: "/system-line-storyboard",
    candidateMustBindCurrentRevision: true,
    titleOnlyWindowSelectionForbidden: true,
    pixelIdentityRequiredBeforeCapture: true,
    directGeneratedReportMutationForbidden: true,
    currentPhaseCaptureAuthorityRequired: true,
  },
  summary: {
    shotCount: shots.length,
    currentRevisionBoundCount: shots.filter((shot) => shot.candidate.status === "CURRENT_REVISION_BOUND").length,
    captureRequiredCount: shots.filter((shot) => shot.candidate.status !== "CURRENT_REVISION_BOUND").length,
  },
  shots,
  failures,
  warnings,
};
const output = {...body, planSha256: sha(body)};
fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({status:output.status,contract:output.contract,outputPath:path.relative(root,outputPath),planSha256:output.planSha256,summary:output.summary,failures,warnings},null,2));
if (failures.length) process.exitCode = 1;
