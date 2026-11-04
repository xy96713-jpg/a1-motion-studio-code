#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const board = current.production.shotIntelligence.wholeFilmStaticBoard;
  const decision = current.production.shotIntelligence.wholeFilmStaticBoardDecision;
  if (board?.status !== "APPROVED" || decision?.decision !== "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY" || current.production.shotIntelligence.status !== "MOTION_READY") throw new Error("raster-slice-motion-ir-approved-motion-ready-state-required");
  const breathingFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/screen-run-breathing-plan-v1/plan.json");
  const breathing = JSON.parse(fs.readFileSync(breathingFile, "utf8"));
  const packageByShot = new Map(board.items.map((item) => [item.shotId, item]));
  const scenes = board.timelineBoard.items.map((item) => {
    const pkg = packageByShot.get(item.shotId);
    const reset = breathing.resets.find((entry) => entry.afterShotId === item.shotId) || null;
    const carrier = pkg ? "APPROVED_MASTER_RASTER" : item.route === "SCREEN_EVIDENCE" ? "VERIFIED_SCREEN_SOURCE" : "VERIFIED_REAL_PRESENTER";
    const motionFamily = pkg
      ? pkg.assemblyMode === "OVERLAY" ? "PRESENTER_DEPTH_OVERLAY" : pkg.assemblyMode === "TYPOGRAPHY" ? "HERO_TYPOGRAPHY_EVENT" : "SEMANTIC_RASTER_SLICE"
      : item.route === "SCREEN_EVIDENCE" ? "SOURCE_BOUND_SCREEN_ACTION" : "PRESENTER_CLEAN_HOLD";
    return {shotId: item.shotId, order: item.order, startMs: item.timeRange.startMs, endMs: item.timeRange.endMs, durationMs: item.timeRange.durationMs, route: item.route, carrier, motionFamily, source: pkg ? {publicUrl: pkg.artifactPublicUrl, sha256: pkg.artifactSha256, boardDecisionSha256: decision.decisionSha256} : item.preview, primitives: motionFamily === "PRESENTER_DEPTH_OVERLAY" ? ["MASTER_HOLD", "TITLE_OR_SIGNAL_REVEAL", "REAL_PRESENTER_FOREGROUND_RESTORE", "READABLE_HOLD"] : motionFamily === "HERO_TYPOGRAPHY_EVENT" ? ["MASTER_HOLD", "TYPOGRAPHY_MASK_REVEAL", "ONE_SEMANTIC_SIGNAL", "READABLE_HOLD"] : motionFamily === "SEMANTIC_RASTER_SLICE" ? ["MASTER_HOLD", "SEMANTIC_REGION_EMPHASIS", "ONE_CAUSAL_RESPONSE", "READABLE_HOLD"] : motionFamily === "SOURCE_BOUND_SCREEN_ACTION" ? ["SOURCE_ACTION_1X", "TARGET_FOCUS", "RESULT_HOLD"] : ["REAL_PRESENTER_CONTINUOUS", "NO_PACKAGING"], breathingReset: reset, deterministic: true, renderPerformed: false};
  });
  const body = {contract: "A1ApprovedMasterRasterSliceMotionIR/v1", status: "READY_FOR_REPRESENTATIVE_MOTION_CANARY", architecture: "APPROVED_MASTER_RASTER_SLICE_MOTION_WITH_HASH_BOUND_EDITABLE_TYPOGRAPHY_SHADOW", sourceBoardSha256: board.sha256, sourceTimelineBoardSha256: board.timelineBoard.sha256, sourceApprovalDecisionSha256: decision.decisionSha256, durationMs: Math.max(...scenes.map((scene) => scene.endMs)), sceneCount: scenes.length, packageSceneCount: scenes.filter((scene) => scene.carrier === "APPROVED_MASTER_RASTER").length, screenSceneCount: scenes.filter((scene) => scene.carrier === "VERIFIED_SCREEN_SOURCE").length, presenterSceneCount: scenes.filter((scene) => scene.carrier === "VERIFIED_REAL_PRESENTER").length, representativeShotIds: ["ED-01", "ED-10", "ED-17", "ED-23", "ED-34"], breathingPlanSha256: breathing.planSha256, breathingResetCount: breathing.resets.length, scenes, boundaries: {planningOnly: true, fullMotionRendered: false, finalRenderAllowed: false, resolveWritePerformed: false, representativeCanaryRequired: true}};
  const plan = {...body, planSha256: sha(body), generatedAt: new Date().toISOString()};
  const relative = "generated/system-line/editorial-asset-workbench-v1/approved-master-raster-slice-motion-ir-v1/plan.json";
  const now = plan.generatedAt;
  let next = structuredClone(current);
  next.production.motion = {...next.production.motion, status: "motion-ir-ready-for-representative-canary", approvedMasterRasterSliceMotionIr: {contract: plan.contract, status: plan.status, publicUrl: `/${relative}`, planSha256: plan.planSha256, representativeShotIds: plan.representativeShotIds, breathingPlanSha256: plan.breathingPlanSha256, fullMotionRendered: false}, updatedAt: now};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "compile-approved-master-raster-slice-motion-ir", targetId: plan.planSha256, payload: {sceneCount: plan.sceneCount, packageSceneCount: plan.packageSceneCount, representativeShotIds: plan.representativeShotIds, breathingResetCount: plan.breathingResetCount, fullMotionRendered: false}, now});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"approved-master-raster-slice-motion-ir-v1/plan.json": plan}});
  return {status: plan.status, planSha256: plan.planSha256, sceneCount: plan.sceneCount, representativeShotIds: plan.representativeShotIds, breathingResetCount: plan.breathingResetCount, fullMotionRendered: false, workspaceSha256After: committed.workspaceSha256};
});
console.log(JSON.stringify(result, null, 2));
