#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, createSceneGraphCandidates} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();
const requestedShotId = process.argv.find((argument) => argument.startsWith("--shot="))?.slice("--shot=".length) || null;

const rebuilt = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  let next = structuredClone(current);
  const targets = next.library.assets
    .filter((asset) => asset.route === "shot-composition"
      && asset.shotDemand.editMode !== "screen-demo"
      && (!requestedShotId || asset.shotDemand.shotId === requestedShotId))
    .sort((left, right) => left.shotDemand.order - right.shotDemand.order);
  if (!targets.length) throw new Error(`nonscreen-best-effect-shot-not-found:${requestedShotId || "all"}`);
  const previousSelections = new Map(targets.map((target) => [target.shotDemand.shotId, target.selectedCandidateId]));
  for (const target of targets) next = createSceneGraphCandidates(next, target.id, now);
  const event = createProductionEvent({
    workspace: current,
    action: "nonscreen-best-effect-static-candidates-rebuilt",
    targetId: current.workspaceSha256,
    payload: {
      shotIds: targets.map((target) => target.shotDemand.shotId),
      typographyFitPolicy: "single-line-canvas-width-solver",
      renderScope: "static-only",
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return {shotIds: targets.map((target) => target.shotDemand.shotId), previousSelections: Object.fromEntries(previousSelections)};
});

for (const shotId of rebuilt.shotIds) {
  execFileSync(process.execPath, [path.join(root, "scripts/render-shot-scene-graph-candidates-v1.mjs"), `--shot=${shotId}`], {cwd: root, stdio: "inherit"});
}

const selected = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const selections = [];
  const rebuiltShotIds = new Set(rebuilt.shotIds);
  const retainedSelections = (next.production.maturityLoop.bestEffectBoard?.nonScreenSelections || [])
    .filter((selection) => !rebuiltShotIds.has(selection.shotId));
  for (const shot of next.library.assets.filter((asset) => asset.route === "shot-composition"
    && asset.shotDemand.editMode !== "screen-demo"
    && rebuilt.shotIds.includes(asset.shotDemand.shotId))) {
    const previousCandidateId = rebuilt.previousSelections[shot.shotDemand.shotId];
    const candidate = shot.candidates.find((item) => item.candidateId === previousCandidateId) || shot.candidates[0];
    if (!candidate?.preview?.publicUrl) throw new Error(`nonscreen-best-effect-preview-missing:${shot.shotDemand.shotId}`);
    shot.selectedCandidateId = candidate.candidateId;
    shot.bestEffectHeroFrame = {
      contract: "A1NonScreenBestEffectHeroFrame/v1",
      typographyFitPolicy: "single-line-canvas-width-solver",
      previewPublicUrl: candidate.preview.publicUrl,
      selectedAt: now,
    };
    shot.status = "ready-for-best-effect-board-review";
    shot.review = {
      status: "pending",
      note: "已按真实画布宽度重新求解文字并恢复当前语义方向，等待整片静态联系表审计。",
      reviewedAt: now,
      reviewedBy: "system-best-effect-director",
      approvedContentSha256: null,
    };
    shot.visualCritic = null;
    selections.push({shotId: shot.shotDemand.shotId, candidateId: candidate.candidateId});
  }
  delete next.production.maturityLoop.allShotSelectedReview;
  const mergedSelections = [...retainedSelections, ...selections]
    .sort((left, right) => Number(left.shotId?.match(/\d+/u)?.[0] || 0) - Number(right.shotId?.match(/\d+/u)?.[0] || 0));
  next.production.maturityLoop.bestEffectBoard = {
    ...next.production.maturityLoop.bestEffectBoard,
    status: "ALL_STATIC_HERO_FRAMES_READY_FOR_BOARD_REVIEW",
    nonScreenSelections: mergedSelections,
    updatedAt: now,
  };
  const event = createProductionEvent({workspace: current, action: "nonscreen-best-effect-hero-frames-selected", targetId: current.workspaceSha256, payload: {selections}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {"nonscreen-best-effect-hero-frame-selections-v1.json": {contract: "A1NonScreenBestEffectHeroFrameSelectionSet/v1", selections: mergedSelections, createdAt: now}}});
  return selections;
});

execFileSync(process.execPath, [path.join(root, "scripts/render-all-shot-selected-contact-sheet-v1.mjs"), "--persist"], {cwd: root, stdio: "inherit"});
console.log(JSON.stringify({status: "NONSCREEN_BEST_EFFECT_STATIC_BOARD_REBUILT", shotCount: selected.length, selections: selected}, null, 2));
