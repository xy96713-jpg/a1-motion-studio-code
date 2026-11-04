#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {deriveProductionAuthority} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {isPackagingOnlyBlockedAction} from "../apps/studio-next/src/lib/a1-packaging-review-controller-v1.mjs";

const root = process.cwd();
const clientSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx"), "utf8");
const panelSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/ShotIntelligencePanel.tsx"), "utf8");
const routeSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8");
const workspace = readProjectWorkspace(path.join(root, "apps/studio-next"));
const plan = workspace.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10");

if (workspace.production.wholeFilmPackagingDirection?.contract === "A1WholeFilmPackagingDirection/v1") {
  const direction = workspace.production.wholeFilmPackagingDirection;
  const derivedAuthority = deriveProductionAuthority(workspace);
  assert.equal(direction.counts.shotCount, 34);
  assert.equal(derivedAuthority.currentStage, "whole-film-visual-coverage");
  assert.equal(derivedAuthority.nextAction?.id, "produce-whole-film-visual-coverage");
  assert.equal(derivedAuthority.nextAction?.requiresUser, false);
  assert.equal(workspace.production.packagingReview?.advisoryOnly, true);
  assert.equal(workspace.production.packagingReview?.current, false);
  assert.equal(workspace.production.packagingReview?.supersededBy, "A1WholeFilmPackagingDirection/v1");
  assert.equal(workspace.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10")?.layers.reduce((sum, layer) => sum + (layer.candidates?.length || 0), 0), 0);
  console.log(JSON.stringify({status: "PASS", packagingOnlyLegacyUi: "HISTORY_READ_ONLY", currentSurface: "WHOLE_FILM_DIRECTION_AND_34_SHOT_BOARD", nextAction: derivedAuthority.nextAction.id}, null, 2));
  process.exit(0);
}

assert.match(clientSource, /!packagingOnly\s*&&\s*workspaceView === "director"\s*\?\s*<WholeFilmVisualAuditCard/);
assert.match(clientSource, /data-a1-legacy-whole-film-ui="HISTORY_READ_ONLY"/);
assert.match(clientSource, /HISTORY_READ_ONLY · LEGACY WHOLE-FILM AUDIT/);
assert.match(panelSource, /口播帧\/网页素材作为参考图/);
assert.match(panelSource, /四大元素是确认后的交付合同，不是前置拼图零件/);
assert.match(panelSource, /完整生图 Assembly 是构图权威；禁止本地零件重拼/);
assert.match(clientSource, /生图反向透明包装/);
assert.doesNotMatch(clientSource, /选稿后四槽合同重建/);
assert.match(panelSource, /lookPlan\?\.activeCandidateSet \? \[\] :/);
assert.ok(["ACTIVE", "AUTO_SELECTED"].includes(plan.activeCandidateSet.status));
assert.equal(plan.activeCandidateSet.candidateCount, 4);
assert.equal(plan.activeCandidateSet.selectedDirectionId, workspace.production.shotIntelligence.integratedPresenterPackage?.selectedDirectionId || "direction-05");
assert.equal(plan.historicalPortfolioAudit.status, "HISTORY_READ_ONLY");
assert.equal(plan.historicalPortfolioAudit.advisoryOnly, true);
assert.equal(plan.legacyCandidates.every((candidate) => candidate.status === "HISTORY_READ_ONLY"), true);
const authority = workspace.production.authority;
const derivedAuthority = deriveProductionAuthority(workspace);
assert.equal(authority.visualTreatmentAudit, undefined, "packaging-only current authority must not expose old treatment audit");
assert.equal(authority.legacyVisualTreatmentAudit?.status, "HISTORY_READ_ONLY");
assert.equal(authority.legacyVisualTreatmentAudit?.advisoryOnly, true);
assert.equal(authority.legacyDesignCalibrationBatch?.status, "HISTORY_READ_ONLY");
assert.equal(authority.legacyDesignCalibrationBatch?.advisoryOnly, true);
assert.notEqual(authority.nextAction?.id, "queue-treatment-anchor-generation");
assert.equal(derivedAuthority.nextAction?.id, "review-recommended-package-assembly");
assert.equal(derivedAuthority.visualTreatmentAudit, undefined);
assert.equal(derivedAuthority.legacyVisualTreatmentAudit?.status, "HISTORY_READ_ONLY");
const legacyActions = [
  "queue-treatment-anchor-generation", "revise-visual-treatment-anchors", "recheck-visual-treatment-composites", "approve-visual-treatment",
  "queue-visual-anchor-suite-generation", "queue-visual-generation-brief", "adopt-generated-visual-candidate", "approve-visual-creative-review",
  "prepare-design-calibration-batch", "render-design-calibration-batch", "review-design-calibration-batch", "generate-candidates",
  "resume-automatic-production", "compile-project-accepted-shot-ir", "run-project-autopilot", "run-project-director",
  "queue-project-asset-generation", "dispatch-project-asset-generation", "build-project-scene-graph-workspace",
];
for (const action of legacyActions) assert.equal(isPackagingOnlyBlockedAction(action), true, `packaging-only action must be denied: ${action}`);
assert.equal(isPackagingOnlyBlockedAction("queue-package-look-master-generation"), false);
const routeActionLiterals = new Set();
for (const match of routeSource.matchAll(/body\.action!?\s*===\s*["']([^"']+)["']/g)) routeActionLiterals.add(match[1]);
for (const match of routeSource.matchAll(/\[([^\]]+)\]\.includes\(body\.action!?\)/gs)) {
  for (const literal of match[1].matchAll(/["']([^"']+)["']/g)) routeActionLiterals.add(literal[1]);
}
const currentPackagingActions = new Set([
  "build-package-assembly-parity",
  "build-package-motion-ir",
  "reopen-package-look-master-diversity",
  "queue-package-look-master-generation",
  "admit-package-look-master-candidate",
  "review-package-look-master",
  "queue-package-layer-generation",
  "admit-package-layer-candidate",
  "complete-package-provenance-trace",
]);
for (const action of routeActionLiterals) {
  if (!currentPackagingActions.has(action)) assert.equal(isPackagingOnlyBlockedAction(action), true, `every legacy route action must be denied: ${action}`);
}
assert.match(routeSource, /isPackagingOnlyBlockedAction\(body\.action\)/);
assert.match(routeSource, /packaging-only-route-409/);
assert.match(clientSource, /NOT_APPLICABLE_PACKAGING_ONLY/);
assert.match(clientSource, /data-a1-legacy-design-calibration-status/);
assert.match(clientSource, /data-a1-design-calibration-status=\{packagingOnly \? "NOT_APPLICABLE_PACKAGING_ONLY"/);
assert.match(clientSource, /data-a1-visual-autopilot-status=\{packagingOnly \? "HISTORY_READ_ONLY"/);
assert.match(clientSource, /data-a1-maturity-loop-status=\{packagingOnly \? "HISTORY_READ_ONLY"/);
assert.match(clientSource, /data-a1-whole-system-maturity-status=\{packagingOnly \? "HISTORY_READ_ONLY"/);
const legacyAudit = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/audit-report.json"), "utf8"));
assert.equal(legacyAudit.status, "HISTORY_READ_ONLY");
assert.equal(legacyAudit.current, false);
assert.equal(legacyAudit.advisoryOnly, true);
assert.equal(legacyAudit.supersededBy?.currentWorkspaceSha256, workspace.workspaceSha256);
assert.equal(legacyAudit.nextAction, "history-read-only");
const kit = workspace.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const activeLayerCount = kit.layers.reduce((sum, layer) => sum + layer.candidates.filter((candidate) => candidate.status === "READY" && candidate.admission?.status === "PASS").length, 0);
const noneLayerCount = kit.layers.filter((layer) => layer.route === "NONE").length;
const currentRecipe = workspace.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
if (workspace.production.shotIntelligence.integratedPresenterPackage?.status === "ASSEMBLY_REVIEW_REQUIRED") {
  assert.equal(currentRecipe.assemblySource?.mode, "IMAGEGEN_INTEGRATED_PRESENTER_FRAME");
  assert.equal(currentRecipe.assemblySource?.localLayerRecompositionPerformed, false);
  assert.deepEqual(currentRecipe.layerCandidateIds, {BACKGROUND: null, TYPOGRAPHY: null, ELEMENT_KIT: null, ILLUSTRATION: null});
  assert.equal(currentRecipe.prePresenterFirstLayerSelection?.status, "HISTORY_READ_ONLY");
  assert.equal(currentRecipe.approvalBinding?.bindingMode, "IMAGEGEN_INTEGRATED_ASSEMBLY");
  assert.deepEqual(currentRecipe.approvalBinding?.layerHashes, []);
  assert.equal(activeLayerCount, 3, "old admitted layer artifacts remain historical only");
  assert.equal(noneLayerCount, 2);
} else if (workspace.production.shotIntelligence.ed10FourLayerTrial?.status === "ASSEMBLY_REVIEW_REQUIRED") {
  assert.deepEqual(Object.fromEntries(kit.layers.map((layer) => [layer.kind, layer.route])), {BACKGROUND: "GENERATE", TYPOGRAPHY: "GENERATE", ELEMENT_KIT: "GENERATE", ILLUSTRATION: "GENERATE"});
  assert.equal(activeLayerCount, 7);
  assert.equal(noneLayerCount, 0);
} else {
  assert.deepEqual(Object.fromEntries(kit.layers.map((layer) => [layer.kind, layer.route])), {BACKGROUND: "NONE", TYPOGRAPHY: "GENERATE", ELEMENT_KIT: "GENERATE", ILLUSTRATION: "NONE"});
  assert.equal(activeLayerCount, 2);
  assert.equal(noneLayerCount, 2);
}
console.log(JSON.stringify({status: "PASS", packagingOnlyLegacyUi: "HISTORY_READ_ONLY", presenterFirstIntegratedAssembly: workspace.production.shotIntelligence.integratedPresenterPackage?.status === "ASSEMBLY_REVIEW_REQUIRED", activeEffectiveDirectionCount: plan.activeCandidateSet.candidateCount, selectedDirectionId: plan.activeCandidateSet.selectedDirectionId, legacyCandidateCount: plan.legacyCandidates.length}, null, 2));
