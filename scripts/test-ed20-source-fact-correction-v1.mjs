import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(repoRoot, "apps/studio-next/public/generated/system-line");
const workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "editorial-asset-workbench-v1/workspace.json"), "utf8"));
const run = JSON.parse(fs.readFileSync(path.join(publicRoot, "current-project-visual-contract-upgrade-v1/current-article-run.json"), "utf8"));
const phaseInput = JSON.parse(fs.readFileSync(path.join(publicRoot, "editorial-asset-workbench-v1/whole-film-director-input.json"), "utf8"));
const rawSrtPath = "/Users/a1/Documents/Codex/声音/outputs/subtitles_july1/july1_full_voice_bright_natural_corrected.srt";
const CORRECTION_ID = "ED-20-source-fact-correction-v1";
const rawSrtSha256 = crypto.createHash("sha256").update(fs.readFileSync(rawSrtPath)).digest("hex");
const forbiddenActive = /(调用 API|API 调用|API 交接|api-bridge|DeepSeek 写全文|DeepSeek 负责全文|DeepSeek承担全文|source-bound-model-handoff)/i;
const ed20Demand = workspace.assetRequirementGraph.shotDemands.find((shot) => shot.shotId === "ED-20");
const ed20Asset = workspace.library.assets.find((asset) => asset.id === "composition-ED-20");
const ed20Brief = workspace.production.visualDirector.shotBriefs.find((brief) => brief.shotId === "ED-20");
const ed20RunShot = run.plan.shots.find((shot) => shot.shotId === "ED-20");
const forbiddenFields = [
  ed20Demand.sourceText,
  ed20Demand.visualJob,
  ed20Demand.primaryActor,
  ed20Demand.packageBrief,
  ed20Demand.motionPhrase,
  ed20Demand.handoffActor,
  ed20Brief.semanticBeat,
  ed20Brief.visualTask,
  ed20Brief.subject,
  ed20Brief.motionIntent,
  ed20Brief.transitionHandoff,
  ed20RunShot.sourceText,
  ed20RunShot.narrativeJob,
  ed20RunShot.viewerTakeaway,
  ed20RunShot.packageBrief,
  ed20RunShot.motionPhrase,
  ed20RunShot.handoffActor,
].filter(Boolean);

assert.equal(workspace.contract, "A1EditorialAssetWorkbench/v2");
assert.equal(workspace.article.shotCount, 34);
assert.equal(workspace.article.sourceTextSha256, "108de8b4b4bc42448accd081363a347435973b5098c8a1b6ced04078ce5e14c3");
assert.equal(rawSrtSha256, "997407683bd017f2b6fc35ce4afc2d0f59512d05c0d1dd17e9455cc28eb0facd");
assert.deepEqual(ed20Demand.sourceCueIdsExcluded, [60, 61]);
assert.deepEqual(ed20Demand.sourceCueIdsRetained, [58, 59]);
assert.equal(ed20Demand.sourceText, "Codex 先整理材料、读取风格库并明确约束，整理后的全文进入工作台继续编辑与收稿。");
assert.deepEqual(ed20Demand.keyPhrases, ["整理材料", "读取风格库", "明确约束", "继续编辑", "收稿"]);
assert.equal(ed20Asset.candidates.length, 0);
assert.equal(ed20Asset.selectedCandidateId, null);
assert.equal(ed20Asset.bestEffectHeroFrame, null);
assert.equal(ed20Asset.review.status, "pending");
assert.equal(ed20Asset.candidateSetAudit.status, "INVALIDATED_FACT_CORRECTION");
assert.equal(ed20Asset.candidateSetAudit.validForCurrentProduction, false);
assert.equal(ed20Brief.assignedPackagingAssetIds.includes("source-entity-deepseek"), false);
assert.equal(ed20Brief.referenceInputs.some((item) => /deepseek|api|approved-/i.test(JSON.stringify(item))), false);
assert.equal(ed20Asset.shotDemand.requiredMaterialIds.includes("approved-deepseek-official-mark"), false);
assert.equal(ed20Asset.shotDemand.requiredMaterialIds.includes("approved-api-handoff-object-pack"), false);
assert.equal(workspace.library.assets.find((asset) => asset.id === "source-entity-deepseek").usedByShotIds.includes("ED-20"), false);
assert.deepEqual(workspace.library.assets.find((asset) => asset.id === "source-entity-deepseek").usedByShotIds, ["ED-12"]);
assert.equal(workspace.production.incrementalReviewCheckpoint.invalidatedShotIds.includes("ED-20"), true);
assert.deepEqual(new Set(workspace.production.designCalibrationBatch.items.map((item) => item.shotId)), new Set(["ED-01", "ED-02", "ED-03", "ED-10", "ED-14", "ED-32"]));
assert.ok(["visual-anchor-strategy-switch-required", "refine-current-explicit-anchor-primitives"].includes(workspace.production.authority.nextAction.id));
const authorityTargets = workspace.production.authority.nextAction.targetShotIds || [];
assert.ok(authorityTargets.includes("ED-01"));
if (workspace.production.authority.nextAction.id === "visual-anchor-strategy-switch-required") {
  assert.deepEqual(authorityTargets, ["ED-01", "ED-14", "ED-10"]);
}
assert.equal(workspace.production.visualDirector.creativeReviews.gates.find((gate) => gate.id === "treatment").status, "approved");
assert.equal(workspace.production.articlePackagingKit.review.status, "approved");
assert.equal(workspace.production.articlePackagingKit.shotAssignments.find((item) => item.shotId === "ED-20").sourceMediaAssetIds.includes("source-entity-deepseek"), false);
assert.equal(workspace.article.semanticSourceCorrection.status, "APPLIED");
assert.equal(workspace.article.semanticSourceCorrection.rawSource.nonDestructive, true);
assert.equal(forbiddenFields.some((value) => forbiddenActive.test(value)), false);
assert.equal(JSON.stringify(run.plan.strategy.packageRole).includes("DeepSeek"), false);
assert.equal(JSON.stringify(run.plan.strategy.chapters[4]).includes("DeepSeek承担全文"), false);
assert.equal(JSON.stringify(phaseInput).includes(CORRECTION_ID), false, "phase input remains a pure director run, correction is recorded on workspace/report");
console.log(JSON.stringify({
  status: "PASS",
  workspaceSha256: workspace.workspaceSha256,
  rawSrtSha256,
  ed20CandidateCount: ed20Asset.candidates.length,
  invalidatedShotIds: workspace.production.incrementalReviewCheckpoint.invalidatedShotIds,
  preservedStrategySwitch: workspace.production.authority.nextAction,
}, null, 2));
