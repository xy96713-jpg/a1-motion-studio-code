#!/usr/bin/env node
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createSceneGraphCandidates} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const targetShotId = "ED-01";
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  let next = structuredClone(current);
  const asset = next.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === targetShotId);
  if (!asset) throw new Error(`three-anchor-preflight-shot-not-found:${targetShotId}`);
  const beforeCandidateCount = asset.candidates?.length || 0;

  // Recompile only the affected static scene-graph batch. This is not an
  // image-generation or render dispatch, and does not touch the other 33
  // shots or the six-shot suite membership.
  next = createSceneGraphCandidates(next, asset.id, now);
  const compiled = next.library.assets.find((item) => item.id === asset.id);
  compiled.status = "brief-ready";
  compiled.review = {
    status: "pending",
    note: "ED-01 静态 scene graph 预检重新编译；旧候选中的脸部遮挡状态已失效，等待受控视觉审片。",
    reviewedAt: now,
    reviewedBy: "system",
    approvedContentSha256: null,
  };
  compiled.candidateSetAudit = {
    ...(compiled.candidateSetAudit || {}),
    contract: "A1ShotCandidateSetAudit/v1",
    status: "STATIC_SCENE_GRAPH_PREFLIGHT",
    validForCurrentProduction: true,
    visualPrimitiveId: "presenter-object-bound-pixel-relay",
    imageGenerationDispatched: false,
    renderDispatched: false,
    preflightAt: now,
  };

  next = recalculateEditorialAssetWorkbench(next, now);
  // Recalculation is authoritative for the calibration item. The expected
  // result is review-only (candidate render missing), not a stale hard block.
  const calibration = next.production.authority.designCalibrationBatch.items.find((item) => item.shotId === targetShotId);
  if (!calibration) throw new Error(`three-anchor-preflight-calibration-item-missing:${targetShotId}`);
  if (calibration.hardFailures.length) throw new Error(`three-anchor-preflight-hard-failure-remains:${calibration.hardFailures.join(",")}`);
  next.production.visualDirector.generationFreeze = {
    frozen: true,
    status: "frozen",
    reason: "visual-anchor-strategy-switch-required",
    scope: "anchor-strategy-switch",
    imageGenerationAllowed: false,
    automaticDispatchAllowed: false,
    requiresUser: false,
    targetShotIds: ["ED-01", "ED-14", "ED-10"],
  };
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.visualDirector.anchorStrategySwitchRequired = true;
  next.production.authority = {
    ...next.production.authority,
    nextAction: {
      id: "visual-anchor-strategy-switch-required",
      label: "代表镜头 ED-01、ED-14、ED-10 连续两轮未达标：停止生图，重设视觉原语",
      requiresUser: false,
      targetShotIds: ["ED-01", "ED-14", "ED-10"],
    },
  };
  next.production.designCalibrationBatch = next.production.authority.designCalibrationBatch;
  next.production.nextAction = next.production.authority.nextAction.label;
  next.production.maturityLoop.nextAction = next.production.authority.nextAction.id;
  next.production.maturityLoop.currentStage = "anchor-suite";
  next.production.maturityLoop.authorityMirrorSha256 = next.production.authority.sha256;

  // Recalculate once more through the normal authority path so the final
  // workspace hash and authority/legacy mirrors reflect the freeze override.
  next = recalculateEditorialAssetWorkbench(next, now);
  assertEditorialAssetWorkbench(next);
  const finalCalibration = next.production.authority.designCalibrationBatch.items.find((item) => item.shotId === targetShotId);
  if (!finalCalibration || finalCalibration.hardFailures.length) throw new Error("three-anchor-preflight-final-authority-invalid");
  persistProjectState(appRoot, next, {files: {
    "three-anchor-primitive-strategy-v1/preflight-repair.json": {
      contract: "A1ThreeAnchorPreflightVisualStateRepair/v1",
      status: "PASS",
      shotId: targetShotId,
      beforeCandidateCount,
      candidateCount: compiled.candidates.length,
      staleHardFailureRemoved: "presenter-face-occlusion:ED-01",
      imageGenerationDispatched: false,
      renderDispatched: false,
      visualReviewStatus: "NOT_REVIEWED",
      workspaceSha256: next.workspaceSha256,
      repairedAt: now,
    },
  }});
  return {
    status: "PASS",
    shotId: targetShotId,
    candidateCount: compiled.candidates.length,
    calibrationHardFailures: calibration.hardFailures,
      calibrationExceptions: finalCalibration.exceptions,
    imageGenerationDispatched: false,
    renderDispatched: false,
    workspaceSha256: next.workspaceSha256,
  };
});

console.log(JSON.stringify(result, null, 2));
