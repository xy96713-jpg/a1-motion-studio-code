import assert from "node:assert/strict";
import fs from "node:fs";
import {buildEd10FourLayerCoveragePlan, assertEd10FourLayerCoveragePlan, buildEd10TrialGenerationInputHash, assertEd10TrialCandidateCounts, assertServerOwnedPackageLayerProvenance} from "../apps/studio-next/src/lib/a1-ed10-four-layer-trial-v1.mjs";
import {assertServerOwnedLayerAdmission} from "../apps/studio-next/src/lib/a1-package-layer-server-admission-v1.mjs";

const workspace = JSON.parse(fs.readFileSync(".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/workspace.json", "utf8"));
const runtime = workspace.production.shotIntelligence;
const current = runtime.packageAssetKitPlans.find((plan) => plan.shotId === "ED-10");
assert.ok(current, "ED-10 current kit exists");
const trial = buildEd10FourLayerCoveragePlan({currentPlan: current, reuseByKind: {BACKGROUND: [], ELEMENT_KIT: []}, now: "2026-08-05T00:00:00.000Z"});
assertEd10FourLayerCoveragePlan(trial);
assert.equal(trial.fourLayerTrial.currentAssemblyPreserved, true);
assert.deepEqual(trial.layers.map((layer) => [layer.kind, layer.route, layer.candidateBudget]), [
  ["BACKGROUND", "GENERATE", 1],
  ["TYPOGRAPHY", "GENERATE", 3],
  ["ELEMENT_KIT", "GENERATE", 1],
  ["ILLUSTRATION", "GENERATE", 2],
]);
assert.equal(trial.layers.find((layer) => layer.kind === "BACKGROUND").routeAudit.fallback, "GENERATE");
assert.equal(trial.layers.find((layer) => layer.kind === "ELEMENT_KIT").routeAudit.fallback, "GENERATE");
assert.equal(buildEd10TrialGenerationInputHash({plan: trial, layer: trial.layers.find((layer) => layer.kind === "TYPOGRAPHY"), candidateIndex: 1}), buildEd10TrialGenerationInputHash({plan: trial, layer: trial.layers.find((layer) => layer.kind === "TYPOGRAPHY"), candidateIndex: 1}));
assert.notEqual(buildEd10TrialGenerationInputHash({plan: trial, layer: trial.layers.find((layer) => layer.kind === "TYPOGRAPHY"), candidateIndex: 1}), buildEd10TrialGenerationInputHash({plan: trial, layer: trial.layers.find((layer) => layer.kind === "TYPOGRAPHY"), candidateIndex: 2}));
assert.deepEqual(Object.fromEntries(Object.entries(assertEd10TrialCandidateCounts(trial, {requireAll: false})).map(([kind, value]) => [kind, value.readyCount])), {BACKGROUND: 0, TYPOGRAPHY: 0, ELEMENT_KIT: 0, ILLUSTRATION: 0});
assert.throws(() => assertEd10TrialCandidateCounts(trial), /candidate-count-invalid/);
assert.throws(() => assertServerOwnedPackageLayerProvenance({provenance: {}}, null, {}), /server-generation/);
assert.throws(() => assertServerOwnedLayerAdmission({plan: trial, layer: trial.layers[0], candidateInput: {artifact: {sha256: "x"}, provenance: {}}, registry: {}}), /server-admission-record-required/);
console.log(JSON.stringify({status: "PASS", contract: "A1Ed10FourLayerCoverageTrial/v1", selectedDirectionId: trial.fourLayerTrial.selectedDirectionId, routes: Object.fromEntries(trial.layers.map((layer) => [layer.kind, layer.route])), budgets: Object.fromEntries(trial.layers.map((layer) => [layer.kind, layer.candidateBudget]))}, null, 2));
