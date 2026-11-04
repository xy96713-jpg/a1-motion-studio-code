#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {a1ReferenceSequenceCorpusV2} from "../apps/studio-next/src/lib/a1-reference-sequence-corpus-v2.ts";
import {auditReferenceConditionedPlan, bindPlanToReferenceSequences, bindShotToReferenceSequences, restoreFullFrameScreenOperation, shouldRestoreFullFrameScreenOperation} from "../apps/studio-next/src/lib/a1-reference-conditioned-director-v2.mjs";
import {isReferenceSourceExcluded} from "../apps/studio-next/src/lib/a1-reference-source-exclusions-v1.mjs";

const causalPresenter = {
  shotId: "TEST-01",
  order: 1,
  chapterId: "test",
  editMode: "presenter-overlay",
  materialRoute: "presenter-real-footage-plus-approved-assets",
  topology: "presenter-object-depth",
  sourceText: "选择一句并修改",
  screenActions: ["选择真实句子", "输入修改", "确认结果"],
  supportingMaterialIds: ["source-real-operation"],
  requiredMaterialIds: ["presenter-footage", "source-real-operation"],
  missingMaterialIds: ["presenter-footage"],
  handoffActor: "修改后的句子",
  motionPhrase: "旧的错误动作",
  editWindow: {durationMs: 4000},
};

assert.equal(shouldRestoreFullFrameScreenOperation(causalPresenter), true);
const restored = restoreFullFrameScreenOperation(causalPresenter);
assert.equal(restored.editMode, "screen-demo");
assert.equal(restored.materialRoute, "real-screen-capture");
assert.equal(restored.primaryMaterialId, "source-real-operation");
assert.deepEqual(restored.missingMaterialIds, []);
assert.match(restored.layoutConstraints.join(" "), /至少占画面 65%/u);
assert.match(restored.layoutConstraints.join(" "), /禁止人物画中画/u);

const sourceMechanism = {
  ...causalPresenter,
  shotId: "TEST-02",
  editMode: "full-package",
  materialRoute: "approved-asset-pack",
  topology: "editorial-evidence-field",
  primaryMaterialId: "source-history-proof",
  packageBrief: "用真实历史界面解释版本隔离机制。",
};
assert.equal(shouldRestoreFullFrameScreenOperation(sourceMechanism), false);

const bound = bindShotToReferenceSequences(restored);
assert.equal(bound.referenceConditioning.contract, "A1ReferenceConditionedShot/v2");
assert.ok(bound.referenceConditioning.referenceGrammarIds.includes("H-R02"));
assert.ok(bound.referenceConditioning.forbiddenPrimitives.includes("small screenshot inset"));
assert.equal(bound.referenceConditioning.runtimeReferenceAssetsAllowed, false);

assert.equal(a1ReferenceSequenceCorpusV2.sources.length, 2);
assert.equal(a1ReferenceSequenceCorpusV2.sources.find((source) => source.id === "hupo")?.sequences.length, 10);
assert.equal(a1ReferenceSequenceCorpusV2.sources.find((source) => source.id === "covacut")?.sequences.length, 6);
assert.equal(isReferenceSourceExcluded("covacut"), true);
assert.equal(a1ReferenceSequenceCorpusV2.analysisRule, "sample-cuts-and-semantic-motion-beats-not-fixed-one-fps-style-tags");

const workspacePath = "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json";
const runPath = "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/whole-film-director-input.json";
if (fs.existsSync(workspacePath) && fs.existsSync(runPath)) {
  const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
  const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
  const demands = new Map(workspace.library.assets.filter((asset) => asset.route === "shot-composition").map((asset) => [asset.shotDemand.shotId, asset.shotDemand]));
  const fields = ["editMode", "materialRoute", "topology", "typographyRole", "keyPhrases", "mediumDecisionReason", "visualJob", "primaryActor", "motionPhrase", "handoffActor", "screenActions", "presenterDirection", "overlayBrief", "presenterPackage", "packageBrief", "requiredMaterialIds", "structureDirections", "layoutConstraints", "supportingMaterialIds", "primaryMaterialId", "missingMaterialIds", "materialGate", "transitionOut"];
  const shots = run.plan.shots.map((shot) => {
    const next = {...shot};
    const demand = demands.get(shot.shotId);
    for (const field of fields) if (Object.hasOwn(demand, field)) next[field] = structuredClone(demand[field]);
    return restoreFullFrameScreenOperation(next);
  });
  const mediumNames = ["presenter-clean", "presenter-overlay", "screen-demo", "full-package", "type-only"];
  const chapterDirectives = workspace.visualBible.chapterDirectives.map((chapter) => ({...chapter, mediumCounts: Object.fromEntries(mediumNames.map((mode) => [mode, shots.filter((shot) => shot.chapterId === chapter.chapterId && shot.editMode === mode).length]))}));
  const plan = bindPlanToReferenceSequences({...run.plan, shots}, {referenceCorpusSha256: "fixture", chapterDirectives});
  assert.deepEqual(plan.referenceConditioning.referenceSourceIds, ["hupo"]);
  assert.equal(plan.referenceConditioning.audit.pass, true);
  assert.deepEqual(plan.referenceConditioning.audit.mediumCounts, {"presenter-clean": 3, "presenter-overlay": 6, "screen-demo": 14, "full-package": 9, "type-only": 2});
  assert.equal(plan.referenceConditioning.audit.screenRatioIsMetricOnly, true);
  assert.equal(plan.shots.find((shot) => shot.shotId === "ED-03")?.editMode, "screen-demo");
  assert.equal(plan.shots.find((shot) => shot.shotId === "ED-06")?.editMode, "screen-demo");
  assert.equal(plan.shots.find((shot) => shot.shotId === "ED-25")?.editMode, "screen-demo");
  assert.equal(plan.shots.find((shot) => shot.shotId === "ED-27")?.editMode, "screen-demo");
  assert.equal(plan.shots.find((shot) => shot.shotId === "ED-30")?.editMode, "screen-demo");
}

const failed = auditReferenceConditionedPlan([bindShotToReferenceSequences(causalPresenter)]);
assert.ok(failed.hardFailures.includes("causal-screen-operation-not-full-frame:TEST-01"));
assert.ok(failed.hardFailures.includes("presenter-overlay-absorbs-screen-actions:TEST-01"));

console.log(JSON.stringify({status: "PASS", contract: "A1ReferenceConditionedDirectorTest/v2", historicalSourceCount: 2, activeSourceIds: ["hupo"], excludedSourceIds: ["covacut"], historicalSequenceCount: 16}, null, 2));
