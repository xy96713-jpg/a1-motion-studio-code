#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-text-motion-renderer-adoption-plan-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const candidatePropsPath = path.join(artifactRoot, "candidate-microbeatLayeredFullProps.json");
const publicCandidatePropsPath = path.join(publicRoot, "candidate-microbeatLayeredFullProps.json");
const patchOpsPath = path.join(artifactRoot, "renderer-source-adoption-patch-ops.json");
const publicPatchOpsPath = path.join(publicRoot, "renderer-source-adoption-patch-ops.json");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const targetedProofPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-targeted-proof-v1/report.json");
const stillProofPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-targeted-still-proof-v1/report.json");
const movingPreviewPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-targeted-moving-preview-v1/report.json");
const patchPlanPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-targeted-proof-v1/projected-motion-patches.json");
const mainMp4Path = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/review-960x540-with-source-audio.mp4");
const mainManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/web-review-manifest.json");
const expectedVisualMasterId = "july1-retro-print-archive-wireframe-v1";

const sha256String = (value) => createHash("sha256").update(value).digest("hex");
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const stableJson = (value) => JSON.stringify(value, null, 2);

function motionSignature(plan) {
  return [plan?.motionStyle, plan?.primaryCurve, plan?.kineticText?.mode].join("|");
}

function withoutKeys(value, keys) {
  const copy = structuredClone(value);
  for (const key of keys) delete copy[key];
  return copy;
}

for (const required of [propsPath, targetedProofPath, stillProofPath, movingPreviewPath, patchPlanPath, mainMp4Path, mainManifestPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const currentProps = readJson(propsPath);
const targetedProof = readJson(targetedProofPath);
const stillProof = readJson(stillProofPath);
const movingPreview = readJson(movingPreviewPath);
const patchPlan = readJson(patchPlanPath);
const mainManifest = readJson(mainManifestPath);
const currentPropsSha256 = sha256File(propsPath);
const mainMp4Sha256 = sha256File(mainMp4Path);
const patchByBeatId = new Map((patchPlan.patches || []).map((patch) => [patch.beatId, patch]));
const movingByBeatId = new Map((movingPreview.motionItems || []).map((item) => [item.beatId, item]));
const selectedBeatIds = (targetedProof.proofItems || []).map((item) => item.beatId);
const failures = [];

if (currentProps.contract !== "A1MicrobeatLayeredFullPlan/v1") failures.push("invalid-current-props-contract");
if (currentProps.reviewOnly !== true || currentProps.finalRenderAllowed !== false) failures.push("current-props-not-review-locked");
if (targetedProof.contract !== "A1HSeriesTextMotionTargetedProof/v1" || targetedProof.status !== "READY_FOR_BOUNDED_PREVIEW_REVIEW") failures.push("targeted-proof-not-ready");
if (stillProof.contract !== "A1HSeriesTextMotionTargetedStillProof/v1" || stillProof.status !== "PASS") failures.push("still-proof-not-pass");
if (movingPreview.contract !== "A1HSeriesTextMotionTargetedMovingPreview/v1" || movingPreview.status !== "PASS") failures.push("moving-preview-not-pass");
if (targetedProof.visualMasterId !== expectedVisualMasterId || stillProof.visualMasterId !== expectedVisualMasterId || movingPreview.visualMasterId !== expectedVisualMasterId) failures.push("visual-master-mismatch");
if (patchPlan.contract !== "A1HSeriesProjectedMotionPatches/v1" || patchPlan.proofOnly !== true || patchPlan.rendererPatchAllowed !== false || patchPlan.fullMp4RenderAllowed !== false || patchPlan.finalRenderAllowed !== false || patchPlan.resolveExportAllowed !== false) failures.push("patch-plan-locks-invalid");
if (selectedBeatIds.length < 10 || patchPlan.patches?.length !== selectedBeatIds.length) failures.push(`patch-count-mismatch:${patchPlan.patches?.length || 0}/${selectedBeatIds.length}`);
if (mainMp4Sha256 !== mainManifest.video?.sha256) failures.push("current-main-mp4-sha-mismatch");

const candidateProps = structuredClone(currentProps);
const adoptionItems = [];
for (const [sceneIndex, scene] of candidateProps.scenes.entries()) {
  const patch = patchByBeatId.get(scene.beatId);
  if (!patch) continue;
  const originalScene = currentProps.scenes[sceneIndex];
  const movingItem = movingByBeatId.get(scene.beatId);
  const currentMotionPlan = originalScene.motionPlan;
  const projectedMotionPlan = patch.projectedMotionPlan;
  scene.motionPlan = projectedMotionPlan;
  adoptionItems.push({
    beatId: scene.beatId,
    macroId: scene.macroId,
    screenText: scene.screenText,
    sceneIndex,
    jsonPointer: `/scenes/${sceneIndex}/motionPlan`,
    currentSignature: motionSignature(currentMotionPlan),
    proposedSignature: motionSignature(projectedMotionPlan),
    currentMotionPlanSha256: sha256String(stableJson(currentMotionPlan)),
    projectedMotionPlanSha256: sha256String(stableJson(projectedMotionPlan)),
    projectedMotionStyle: projectedMotionPlan.motionStyle,
    projectedPrimaryCurve: projectedMotionPlan.primaryCurve,
    evidence: movingItem ? {
      projectedMotionMeanAbsDiff: movingItem.projectedMotionMeanAbsDiff,
      projectedMotionActiveFraction: movingItem.projectedMotionActiveFraction,
      currentProjectedHoldDiff: movingItem.currentProjectedHoldDiff,
    } : null,
    guard: {
      sourcePropsSha256MustEqual: currentPropsSha256,
      currentMotionPlanSha256MustEqual: sha256String(stableJson(currentMotionPlan)),
      applyOnlyToWorktreeBasename: "a1-motion-studio-system-line",
      applyOnlyToBranch: "codex/system-maturity-line-20260722",
    },
  });
}

const candidateWithoutContentHash = withoutKeys(candidateProps, ["contentHash"]);
candidateProps.contentHash = sha256String(stableJson(candidateWithoutContentHash));

const changedSceneIds = [];
const nonMotionSceneChanges = [];
for (let index = 0; index < currentProps.scenes.length; index += 1) {
  const beforeScene = currentProps.scenes[index];
  const afterScene = candidateProps.scenes[index];
  if (stableJson(beforeScene) === stableJson(afterScene)) continue;
  changedSceneIds.push(beforeScene.beatId);
  const beforeWithoutMotion = withoutKeys(beforeScene, ["motionPlan"]);
  const afterWithoutMotion = withoutKeys(afterScene, ["motionPlan"]);
  if (stableJson(beforeWithoutMotion) !== stableJson(afterWithoutMotion)) {
    nonMotionSceneChanges.push(beforeScene.beatId);
  }
}

const topLevelBefore = withoutKeys(currentProps, ["scenes", "contentHash"]);
const topLevelAfter = withoutKeys(candidateProps, ["scenes", "contentHash"]);
if (stableJson(topLevelBefore) !== stableJson(topLevelAfter)) failures.push("unexpected-top-level-change");
if (nonMotionSceneChanges.length) failures.push(`non-motion-scene-changes:${nonMotionSceneChanges.join(",")}`);
if (changedSceneIds.length !== selectedBeatIds.length) failures.push(`changed-scene-count:${changedSceneIds.length}/${selectedBeatIds.length}`);
if (!selectedBeatIds.every((beatId) => changedSceneIds.includes(beatId))) failures.push("changed-scene-ids-do-not-match-selected-beats");
if (adoptionItems.some((item) => !item.evidence || item.evidence.projectedMotionMeanAbsDiff < 0.65 || item.evidence.projectedMotionActiveFraction < 0.006 || item.evidence.currentProjectedHoldDiff?.meanAbsDiff < 0.65)) failures.push("adoption-item-evidence-too-weak");

const candidatePropsJson = `${stableJson(candidateProps)}\n`;
fs.writeFileSync(candidatePropsPath, candidatePropsJson);
fs.copyFileSync(candidatePropsPath, publicCandidatePropsPath);

const patchOps = {
  contract: "A1HSeriesRendererSourceAdoptionPatchOps/v1",
  phaseId,
  generatedAt: new Date().toISOString(),
  sourceFile: "remotion-renderer/src/generated/microbeatLayeredFullProps.json",
  sourcePropsSha256MustEqual: currentPropsSha256,
  candidatePropsSha256: sha256File(candidatePropsPath),
  operationCount: adoptionItems.length + 1,
  operations: [
    ...adoptionItems.map((item) => ({
      op: "replace",
      path: item.jsonPointer,
      beatId: item.beatId,
      macroId: item.macroId,
      currentMotionPlanSha256MustEqual: item.currentMotionPlanSha256,
      value: patchByBeatId.get(item.beatId).projectedMotionPlan,
    })),
    {
      op: "replace",
      path: "/contentHash",
      value: candidateProps.contentHash,
    },
  ],
  locks: {
    planOnly: true,
    applyAllowedBeforeExplicitApproval: false,
    refreshCurrent540pMp4Allowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  },
};
fs.writeFileSync(patchOpsPath, `${stableJson(patchOps)}\n`);
fs.copyFileSync(patchOpsPath, publicPatchOpsPath);

const status = failures.length ? "FAIL" : "READY_FOR_EXPLICIT_APPROVAL";
const report = {
  contract: "A1HSeriesTextMotionRendererAdoptionPlan/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  visualMasterId: expectedVisualMasterId,
  planOnly: true,
  candidatePropsOnly: true,
  sourcePropsModified: false,
  currentMainMp4Modified: false,
  rendererSourceAdoptionAllowed: false,
  applyAllowedBeforeExplicitApproval: false,
  refreshCurrent540pMp4Allowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    propsPath: path.relative(root, propsPath),
    propsSha256: currentPropsSha256,
    targetedProofPath: path.relative(root, targetedProofPath),
    targetedProofSha256: sha256File(targetedProofPath),
    stillProofPath: path.relative(root, stillProofPath),
    stillProofSha256: sha256File(stillProofPath),
    movingPreviewPath: path.relative(root, movingPreviewPath),
    movingPreviewSha256: sha256File(movingPreviewPath),
    patchPlanPath: path.relative(root, patchPlanPath),
    patchPlanSha256: sha256File(patchPlanPath),
    currentMainMp4Path: path.relative(root, mainMp4Path),
    currentMainMp4Sha256: mainMp4Sha256,
  },
  prerequisites: {
    targetedProof: targetedProof.status,
    renderedStillProof: stillProof.status,
    movingPreview: movingPreview.status,
    currentMainMp4ShaMatchesManifest: mainMp4Sha256 === mainManifest.video?.sha256,
  },
  summary: {
    sceneCount: currentProps.scenes.length,
    selectedBeatCount: selectedBeatIds.length,
    adoptionItemCount: adoptionItems.length,
    changedSceneCount: changedSceneIds.length,
    nonMotionSceneChangeCount: nonMotionSceneChanges.length,
    candidateContentHash: candidateProps.contentHash,
    averageProjectedMotionMeanAbsDiff: movingPreview.summary?.averageProjectedMotionMeanAbsDiff || 0,
    lowMotionItemCount: movingPreview.summary?.lowMotionItemCount ?? null,
    lowHoldDiffItemCount: movingPreview.summary?.lowHoldDiffItemCount ?? null,
    uniqueProjectedMotionStyles: [...new Set(adoptionItems.map((item) => item.projectedMotionStyle))],
  },
  candidateProps: {
    path: path.relative(root, candidatePropsPath),
    publicUrl: `/generated/system-line/${phaseId}/candidate-microbeatLayeredFullProps.json`,
    sha256: sha256File(candidatePropsPath),
  },
  patchOps: {
    path: path.relative(root, patchOpsPath),
    publicUrl: `/generated/system-line/${phaseId}/renderer-source-adoption-patch-ops.json`,
    sha256: sha256File(patchOpsPath),
    operationCount: patchOps.operationCount,
  },
  adoptionItems,
  guards: {
    worktreeBasename: "a1-motion-studio-system-line",
    branch: "codex/system-maturity-line-20260722",
    sourcePropsSha256MustEqual: currentPropsSha256,
    userApprovalRequiredBeforeSourceWrite: true,
  },
  failures,
  nextAction: failures.length ? "repair-renderer-adoption-plan-before-approval-review" : "await-explicit-approval-before-applying-renderer-source-adoption-plan",
};

fs.writeFileSync(reportPath, `${stableJson(report)}\n`);
fs.writeFileSync(publicReportPath, `${stableJson(report)}\n`);

console.log(JSON.stringify({
  status,
  summary: report.summary,
  candidateProps: report.candidateProps.path,
  patchOps: report.patchOps.path,
  failures,
  reportPath: path.relative(root, reportPath),
  publicReportPath: path.relative(root, publicReportPath),
  nextAction: report.nextAction,
}, null, 2));

if (status === "FAIL") process.exitCode = 2;
