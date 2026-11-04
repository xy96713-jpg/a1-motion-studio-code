#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {resolveCurrentStoryboardAsset} from "../apps/studio-next/src/lib/a1-current-storyboard-asset-resolver-v1.mjs";
import {assertStoryboardPackagingDirectorPlan} from "../apps/studio-next/src/lib/a1-storyboard-packaging-director-plan-v1.mjs";
import {assertAutomaticMotionRoute, resolveAutomaticMotionRoute, isPresenterContextOnly} from "../apps/studio-next/src/lib/a1-automatic-motion-router-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const generatedRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1");
const workspacePath = path.join(generatedRoot, "workspace.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const executionManifestPath = path.join(root, "work/current-hyperframes-storyboard-execution-v1/execution-manifest.json");
const outputPath = path.join(generatedRoot, "current-production-lanes-v1.json");
const artifactOutputPath = path.join(artifactRoot, "current-production-lanes-v1.json");
const noWrite = process.argv.includes("--no-write");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const phase = JSON.parse(fs.readFileSync(phasePath, "utf8"));
const executionManifest = fs.existsSync(executionManifestPath) ? JSON.parse(fs.readFileSync(executionManifestPath, "utf8")) : null;
const authority = workspace.production?.shotIntelligence?.currentStoryboardAuthority;
const directorPointer = authority?.packagingDirectorPlan;
const directorPlanPath = path.join(generatedRoot, "current-storyboard-packaging-director-plan-v1/plan.json");
if (!directorPointer || !fs.existsSync(directorPlanPath)) throw new Error("current-packaging-director-plan-required");
const directorPlan = assertStoryboardPackagingDirectorPlan(JSON.parse(fs.readFileSync(directorPlanPath, "utf8")));
if (directorPointer.planSha256 !== directorPlan.planSha256 || directorPlan.status !== "READY" || directorPlan.shotCount !== 34) throw new Error("current-packaging-director-plan-stale-or-incomplete");
const plans = workspace.production?.shotVisualCoveragePlan?.shotPlans || [];
if (authority?.current !== true || authority?.shots?.length !== 34 || plans.length !== 34) throw new Error("current-34-shot-authority-required");
const planById = new Map(plans.map((plan) => [plan.shotId, plan]));
const executableShot = (shot) => {
  const plan = planById.get(shot.shotId) || {};
  const route = shot.route || plan.route;
  let sourceBinding = null;
  let sourceBindingFailure = null;
  try {
    sourceBinding = resolveCurrentStoryboardAsset(workspace, {shotId: shot.shotId});
  } catch (error) {
    sourceBindingFailure = error.code || error.message;
  }
  const staticReady = sourceBinding?.productionEligible === true;
  const hasActionContract = ["before", "hold", "after", "handoff"].every((key) => Boolean(shot.actionContract?.[key]));
  const compositionReady = executionManifest?.shots?.some((item) => item.shotId === shot.shotId) === true;
  const persistedMotionDesign = shot.motionDesignContract || null;
  const motionDesignCurrent = persistedMotionDesign
    && persistedMotionDesign.source?.versionId === shot.versionId
    && persistedMotionDesign.source?.artifactSha256 === sourceBinding?.artifactSha256
    && persistedMotionDesign.geometryFingerprint === sourceBinding?.artifactSha256;
  const motionDesignContract = motionDesignCurrent ? persistedMotionDesign : null;
  const motionDesignFailure = motionDesignCurrent ? null : persistedMotionDesign ? "CURRENT_STORYBOARD_MOTION_DESIGN_STALE" : "CURRENT_STORYBOARD_MOTION_DESIGN_REQUIRED";
  const automaticRoute = assertAutomaticMotionRoute(resolveAutomaticMotionRoute(shot));
  const lane = route === 'PRESENTER_BASE' && !isPresenterContextOnly(shot) && motionDesignContract?.executionRoute === 'PRESENTER_SOURCE' ? 'PACKAGE_COMPOSITION' : motionDesignContract?.executionRoute || (route === "SCREEN_EVIDENCE" ? "SCREEN_CAP_NATIVE" : route === "PRESENTER_BASE" ? "PRESENTER_SOURCE" : "PACKAGE_COMPOSITION");
  const prerequisite = lane === "XIAOYUNQUE_MOTION" ? "PACKAGE_STATIC_MASTER" : lane === "SCREEN_CAP_NATIVE" ? "SCREEN_CAPTURE_PREP" : lane === "PRESENTER_SOURCE" ? "GLOBAL_STORYBOARD_APPROVAL" : "PACKAGE_STATIC_MASTER";
  const contextOnly = isPresenterContextOnly(shot);
  const nextAction = contextOnly ? null : sourceBindingFailure
    ? "REPAIR_CURRENT_STORYBOARD_ASSET_BINDING"
    : motionDesignFailure
      ? "COMPILE_CURRENT_STORYBOARD_MOTION_DESIGN"
    : !hasActionContract
      ? "REPAIR_ACTION_CONTRACT"
      : !staticReady
        ? "REVIEW_CURRENT_STORYBOARD_ASSET_BINDING"
        : lane;
  const directorShot = directorPlan.shots.find((item) => item.shotId === shot.shotId);
  return {shotId: shot.shotId, order: shot.order, route, packageType: shot.packageType || null, contextOnly, lane, prerequisite, staticReady, hasActionContract, compositionReady, sourceBinding, sourceBindingFailure, motionDesignContract, motionDesignFailure, automaticRoute, directorPlanSha256: directorPlan.planSha256, directorPlanStatus: directorShot?.status || "MISSING", nextAction};
};
const shotRecords = authority.shots.map(executableShot);
const groups = [
  {id: "GLOBAL_STORYBOARD_APPROVAL", label: "全片分镜批准", mode: "gated", requiresUser: true, shotIds: shotRecords.map((shot) => shot.shotId), nextAction: "APPROVE_WHOLE_FILM_STORYBOARD_ONCE"},
  {id: "PACKAGE_STATIC_MASTER", label: "PACKAGE 静态视觉 master", mode: "parallel-after-approval", requiresUser: false, shotIds: shotRecords.filter((shot) => shot.route === "PACKAGE_LOOK_MASTER").map((shot) => shot.shotId), nextAction: "RUN_IMAGEGEN_OR_REUSE_VERIFIED_STATIC_MASTER"},
  {id: "SCREEN_CAPTURE_PREP", label: "录屏准备", mode: "parallel-after-approval", requiresUser: false, shotIds: shotRecords.filter((shot) => shot.route === "SCREEN_EVIDENCE").map((shot) => shot.shotId), nextAction: "PREPARE_PLAYWRIGHT_AND_WORKBENCH"},
  {id: "PRESENTER_SOURCE", label: "真人上下文（非包装制作）", mode: "context-only", requiresUser: false, shotIds: shotRecords.filter((shot) => shot.contextOnly).map((shot) => shot.shotId), nextAction: null},
  {id: "XIAOYUNQUE_MOTION", label: "小云雀无字动画", mode: "parallel-after-static-master", requiresUser: false, shotIds: shotRecords.filter((shot) => shot.lane === "XIAOYUNQUE_MOTION").map((shot) => shot.shotId), nextAction: "GENERATE_MOTION_FROM_APPROVED_STATIC_MASTER"},
  {id: "LOCAL_DETERMINISTIC_MOTION", label: "本地确定性实体动效", mode: "parallel-after-static-master", requiresUser: false, shotIds: shotRecords.filter((shot) => shot.lane === "LOCAL_DETERMINISTIC_MOTION").map((shot) => shot.shotId), nextAction: "RENDER_EXACT_IDENTITY_BOUND_MOTION"},
  {id: "LOCAL_EVIDENCE_MOTION", label: "本地真实证据动效", mode: "parallel-after-static-master", requiresUser: false, shotIds: shotRecords.filter((shot) => shot.lane === "LOCAL_EVIDENCE_MOTION").map((shot) => shot.shotId), nextAction: "RENDER_SOURCE_PRESERVING_EVIDENCE_MOTION"},
  {id: "PACKAGE_COMPOSITION", label: "本地视觉包装合成", mode: "parallel-after-static-master", requiresUser: false, shotIds: shotRecords.filter((shot) => shot.lane === "PACKAGE_COMPOSITION").map((shot) => shot.shotId), nextAction: "RENDER_CONTRACT_BOUND_PACKAGE_COMPOSITION"},
  {id: "SCREEN_CAP_NATIVE", label: "Cap 原生录屏（虚拟屏）", mode: "parallel-after-prep", requiresUser: false, shotIds: shotRecords.filter((shot) => shot.lane === "SCREEN_CAP_NATIVE").map((shot) => shot.shotId), nextAction: "CAP_SCREEN_CAPTURE_ON_BETTERDISPLAY_VIRTUAL_DISPLAY"},
  {id: "EVIDENCE_AUDIT", label: "证据审计", mode: "join", requiresUser: false, shotIds: shotRecords.map((shot) => shot.shotId), nextAction: "RUN_PIXEL_SEMANTIC_PROVENANCE_AUDITS"},
  {id: "HYPERFRAMES_RENDER", label: "HyperFrames composition → timeline → render", mode: "join", requiresUser: false, shotIds: shotRecords.map((shot) => shot.shotId), nextAction: "COMPILE_CHECK_AND_RENDER"},
];
const result = {contract: "A1CurrentProductionLanes/v1", status: "PASS", generatedAt: new Date().toISOString(), source: {workspaceSha256: workspace.workspaceSha256, packagingDirectorPlanSha256: directorPlan.planSha256, authorityRevision: authority.updatedAt || null, phasePath: path.relative(root, phasePath), phaseStage: phase.stage || phase.currentStage || null}, approvalPolicy: {preflight: "APPROVE_WHOLE_FILM_STORYBOARD_ONCE", perShotApproval: "EXCEPTION_ONLY_ON_AUTHORITY_OR_CONTRACT_CHANGE", finalDeliveryApproval: "REQUIRED_AFTER_EVIDENCE_AUDIT", captureAuthorization: "INHERITS_WHOLE_FILM_STORYBOARD_APPROVAL_FOR_ELIGIBLE_SHOTS"}, ordering: {staticBeforeMotion: true, screenCaptureMayRunInParallelWithStaticMaster: true, presenterMayRunInParallelWithStaticMaster: true, renderAfterEvidenceAudit: true}, groups, shots: shotRecords};
result.manifestSha256 = sha256(JSON.stringify(result));
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (!noWrite) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.mkdirSync(path.dirname(artifactOutputPath), {recursive: true});
  fs.writeFileSync(outputPath, serialized);
  fs.writeFileSync(artifactOutputPath, serialized);
}
console.log(JSON.stringify({status: result.status, contract: result.contract, noWrite, writePerformed: !noWrite, outputPath: path.relative(root, outputPath), artifactOutputPath: path.relative(root, artifactOutputPath), publicArtifactParity: noWrite ? null : sha256(fs.readFileSync(outputPath)) === sha256(fs.readFileSync(artifactOutputPath)), shotCount: result.shots.length, blockedBindingCount: result.shots.filter((shot) => shot.sourceBindingFailure || !shot.sourceBinding?.productionEligible).length, groups: result.groups.map((group) => ({id: group.id, shotCount: group.shotIds.length, mode: group.mode, requiresUser: group.requiresUser})), approvalPolicy: result.approvalPolicy, ordering: result.ordering, manifestSha256: result.manifestSha256}, null, 2));
