#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";

import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createSceneGraphCandidates} from "../apps/studio-next/src/lib/editorial-production/index.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const expected = {
  "ED-01": {primitive: "presenter-object-bound-pixel-relay", graphPrimitives: ["presenter-object-bound-pixel-relay", "presenter-letterpress-desk-surface"], overrideIds: ["presenter-object-bound-pixel-relay", "presenter-letterpress-desk-v1"], minimum: 1, nodes: ["presenter-word-1", "presenter-word-2"], text: "vibe coding\n智能写作工作台"},
  "ED-14": {primitive: "evidence-bound-pixel-choice-funnel", minimum: 1, nodes: ["choice-funnel-rail", "word-actor-1", "word-actor-2", "word-actor-3", "choice-funnel-output"], text: "可复用表达"},
  "ED-10": {primitive: "proof-sheet-corruption-reveal", minimum: 1, nodes: ["proof-sheet-eraser-correction"], text: "完成度很高的废稿"},
};

assert.equal(workspace.production.visualDirector.generationFreeze.reason, null);
assert.equal(workspace.production.visualDirector.generationFreeze.frozen, false);
assert.equal(workspace.production.visualDirector.generationFreeze.imageGenerationAllowed, true);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.authority.nextAction.id, "resolve-calibration-source-evidence");
assert.deepEqual(workspace.production.incrementalReviewCheckpoint.invalidatedShotIds, ["ED-20"]);
assert.equal(workspace.production.incrementalReviewCheckpoint.factCorrectionId, "ED-20-source-fact-correction-v1");

for (const [shotId, contract] of Object.entries(expected)) {
  const asset = workspace.library.assets.find((item) => item.shotDemand?.shotId === shotId);
  assert.ok(asset, `missing ${shotId}`);
  assert.equal(asset.shotDemand.visualPrimitiveId, contract.primitive);
  const automaticallyAdmitted = asset.visualCritic?.verdict === "PASS"
    && Number(asset.visualCritic?.totalScore || 0) >= 22
    && workspace.production.automationPolicy?.automaticCandidateAdmission === true;
  if (automaticallyAdmitted) assert.ok(asset.selectedCandidateId, `${shotId} stable 22+ candidate should be automatically admitted`);
  else assert.equal(asset.selectedCandidateId, null);
  assert.ok(["pending", "revise", "approved"].includes(asset.review.status), `${shotId} review state must match the real static gate`);
  assert.ok(["STATIC_SCENE_GRAPH_PREFLIGHT", "STABLE_VISUAL_REVIEW_BLOCKED", "PASS"].includes(asset.candidateSetAudit.status));
  assert.ok(asset.candidates.length >= contract.minimum, `${shotId} candidate minimum`);
  assert.ok(asset.candidates.every((candidate) => (candidate.sceneGraph.hardFailures || []).length === 0), `${shotId} static candidate hard failures cleared`);
  const graph = asset.candidates[0].sceneGraph;
  assert.ok((contract.graphPrimitives || [contract.primitive]).includes(graph.compositionPrimitive));
  assert.equal(graph.visualPrimitiveOverride.applied, true);
  assert.ok((contract.overrideIds || [contract.primitive]).includes(graph.visualPrimitiveOverride.id));
  assert.equal(graph.typography.assignment.headlineText, contract.text);
  for (const nodeId of contract.nodes) assert.ok(graph.nodes.some((node) => node.id === nodeId), `${shotId} missing ${nodeId}`);
  if (shotId === "ED-14") assert.equal(graph.nodes.find((node) => node.id === "choice-funnel-rail")?.assetId, "pixel-choice-funnel-rail-v1");
  if (shotId === "ED-10") assert.equal(graph.nodes.find((node) => node.id === "proof-sheet-eraser-correction")?.assetId, "pixel-proof-eraser-actor-v1");
  assert.deepEqual(graph.hardFailures || [], []);
}

const calibrationByShotId = new Map(workspace.production.authority.designCalibrationBatch.items.map((item) => [item.shotId, item]));
for (const shotId of Object.keys(expected)) {
  const calibration = calibrationByShotId.get(shotId);
  assert.ok(calibration, `missing calibration ${shotId}`);
  const currentAsset = workspace.library.assets.find((item) => item.shotDemand?.shotId === shotId);
  const currentHardFailures = currentAsset?.visualCritic?.hardFailures || [];
  // The preflight must not leak an archived failure after a strategy switch,
  // but a fresh critic failure is authoritative and must remain visible. This
  // keeps the test from “fixing” a real visual BLOCK by forcing an empty list.
  assert.deepEqual(calibration.hardFailures, currentHardFailures, `${shotId} calibration hard failures must mirror current critic state`);
  assert.ok(["NOT_REVIEWED", "VISUAL_REVIEW_CALIBRATING", "REVISE", "BLOCK", "PASS"].includes(calibration.verdict), `${shotId} calibration verdict must preserve the real review state`);
}

const ed20 = workspace.library.assets.find((item) => item.shotDemand?.shotId === "ED-20");
assert.equal(ed20.candidates.length, 0);
assert.equal(ed20.shotDemand.sourceText.includes("DeepSeek"), false);
assert.ok(workspace.library.assets.find((item) => item.id === "source-entity-deepseek")?.usedByShotIds?.includes("ED-12"));

// Recompile on a clone to prove the explicit primitive cannot be overwritten
// by the presenter/type master-anchor branches.
for (const shotId of Object.keys(expected)) {
  const current = workspace.library.assets.find((item) => item.shotDemand?.shotId === shotId);
  const clone = createSceneGraphCandidates(structuredClone(workspace), current.id);
  const compiled = clone.library.assets.find((item) => item.id === current.id);
  assert.equal(compiled.candidates[0].sceneGraph.compositionPrimitive, expected[shotId].primitive);
}

console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, shots: Object.keys(expected), generationDispatched: false, renderDispatched: false}, null, 2));
