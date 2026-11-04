#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, createSceneGraphCandidates} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const shotArg = process.argv.find((item) => item.startsWith("--shot="))?.split("=")[1];
if (!shotArg) throw new Error("shot-candidate-build-shot-required");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const target = current.library.assets.find((asset) => asset.route === "shot-composition" && (asset.id === shotArg || asset.shotDemand?.shotId === shotArg));
  if (!target) throw new Error(`shot-composition-asset-not-found:${shotArg}`);
  let next = createSceneGraphCandidates(current, target.id, now);
  next.production.maturityLoop.status = "building-representative-shot-candidates";
  next.production.maturityLoop.currentStage = "shot-candidates";
  next.production.maturityLoop.nextAction = `render-shot-candidates:${target.shotDemand.shotId}`;
  next.production.maturityLoop.lastTickAt = now;
  next.production.maturityLoop.updatedAt = now;
  const event = createProductionEvent({
    workspace: current,
    action: "shot-scene-graph-candidates-rebuilt-after-visual-audit",
    targetId: target.id,
    payload: {shotId: target.shotDemand.shotId, candidateCount: next.library.assets.find((asset) => asset.id === target.id)?.candidates?.length || 0},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return recalculated.library.assets.find((asset) => asset.id === target.id);
});

console.log(JSON.stringify({
  status: "SHOT_SCENE_GRAPH_CANDIDATES_READY",
  shotId: result.shotDemand.shotId,
  editMode: result.shotDemand.editMode,
  primaryMaterialIds: [...new Set(result.candidates.map((candidate) => candidate.sceneGraph.primaryMaterialId))],
  headlines: [...new Set(result.candidates.map((candidate) => {
    const graph = candidate.sceneGraph;
    const phraseActors = graph.nodes.filter((node) => /^presenter-word-/u.test(String(node.id || "")) && node.visualMode !== "editable-shadow");
    return phraseActors.length
      ? phraseActors.map((node) => node.text).join(" / ")
      : graph.nodes.find((node) => node.id === "headline" && node.visualMode !== "editable-shadow")?.text || null;
  }))],
  candidateCount: result.candidates.length,
}, null, 2));
