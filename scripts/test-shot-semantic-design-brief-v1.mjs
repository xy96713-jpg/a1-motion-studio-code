#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileShotSemanticDesignBriefSet, auditUniqueArtifactCandidates} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "workspace.json"), "utf8"));
const directorRun = JSON.parse(fs.readFileSync(path.join(publicRoot, "whole-film-director-input.json"), "utf8"));

const upgradedRun = structuredClone(directorRun);
for (const shot of upgradedRun.plan.shots) {
  shot.viewerQuestion ||= `观众是否理解：${shot.viewerTakeaway}`;
  shot.semanticActor ||= {
    identity: shot.primaryActor,
    action: shot.visualJob,
    beforeState: `尚未理解：${shot.narrativeJob}`,
    afterState: shot.viewerTakeaway,
    target: shot.viewerTakeaway,
  };
}

const compiled = compileShotSemanticDesignBriefSet({workspace, directorRun: upgradedRun, appRoot, now: "2026-08-05T12:00:00.000Z"});
assert.equal(compiled.shotCount, workspace.production.shotIntelligence.decisionSet.items.length, "shot count must stay dynamic and cover the current decision set");
const byId = new Map(compiled.briefs.map((brief) => [brief.shotId, brief]));
const ed17 = byId.get("ED-17");
assert.match(`${ed17.narrativeJob} ${ed17.semanticActor.identity} ${ed17.semanticActor.action}`, /材料|角度|动笔/u);
assert.doesNotMatch(`${ed17.narrativeJob} ${ed17.semanticActor.identity} ${ed17.semanticActor.action}`, /完成度很高|废稿/u);
const ed15 = byId.get("ED-15");
assert.doesNotMatch(`${ed15.narrativeJob} ${ed15.semanticActor.identity} ${ed15.semanticActor.action}`, /候选.*收敛|默认轨道|稳妥.*可复用/u);
const ed19 = byId.get("ED-19");
const ed23 = byId.get("ED-23");
assert.notEqual(`${ed19.semanticActor.identity}|${ed19.semanticActor.action}`, `${ed23.semanticActor.identity}|${ed23.semanticActor.action}`);
assert.equal(ed23.evidenceRoute, "SCREEN_EVIDENCE");
assert.equal(ed23.packageDecision, "NO_PACKAGE");
const liveEd20 = workspace.production.shotIntelligence.semanticDesignBriefSet.briefs.find((brief) => brief.shotId === "ED-20");
const liveEd20Binding = liveEd20.productionSourceBindings.find((binding) => binding.sourceKind === "SCREEN_EVIDENCE" && binding.productionReady === true);
const liveEd20File = path.join(appRoot, "public", liveEd20Binding.publicUrl.replace(/^\/+/, ""));
const liveEd20ReportFile = path.join(appRoot, "public", liveEd20Binding.sourceReportPublicUrl.replace(/^\/+/, ""));
const liveEd20Report = JSON.parse(fs.readFileSync(liveEd20ReportFile, "utf8"));
assert.equal(liveEd20.status, "READY", "ED-20 may become ready only after a verified editor-owned real-screen capture is bound");
assert.equal(crypto.createHash("sha256").update(fs.readFileSync(liveEd20File)).digest("hex"), liveEd20Binding.sha256);
assert.equal(liveEd20Binding.actualSha256, liveEd20Binding.sha256);
assert.equal(liveEd20Report.contract, "A1RealWritingWorkbenchActionPack/v1");
assert.equal(liveEd20Report.status, "PASS");
assert.equal(liveEd20Report.source.kind, "real-local-writing-workbench-runtime");
assert.equal(liveEd20Report.checks.fakeUiUsed, false);
assert.equal(liveEd20.directorSourceBinding.status, "MATCH");
assert.equal(liveEd20.exactCopy, "Codex 先整理材料、读取风格库并明确约束，整理后的全文进入工作台继续编辑与收稿。");
assert.doesNotMatch(`${liveEd20.narrativeJob} ${liveEd20.semanticActor.identity} ${liveEd20.semanticActor.action}`, /DeepSeek|外部模型交接|调用 API/u);
assert.equal(liveEd20.sourceCaptureHandoff?.owner, "EDITOR");
assert.equal(liveEd20.sourceCaptureHandoff?.generationFallbackAllowed, false);
assert.equal(liveEd20.sourceCaptureHandoff?.status, "VERIFIED_SOURCE_BOUND");
assert.equal(ed12Status(), "READY", "AUTHOR_PROOF may use the registered real hold frame, but not research metadata as a fake image");
assert.equal(byId.get("ED-12").productionSourceBindings.some((item) => item.sourceKind === "OFFICIAL_NAMED_ENTITY_SOURCE_PLATE"), false);
assert.equal(byId.get("ED-12").productionSourceBindings.some((item) => item.kind === "BASE_VIDEO_HOLD_FRAME" && item.productionReady === true), true);

const duplicateAudit = auditUniqueArtifactCandidates([
  {candidateId: "ED-15-c01", shotId: "ED-15", artifact: {sha256: "a".repeat(64)}},
  {candidateId: "ED-15-c02", shotId: "ED-15", artifact: {sha256: "a".repeat(64)}},
  {candidateId: "ED-17-c01", shotId: "ED-17", artifact: {sha256: "b".repeat(64)}},
  {candidateId: "ED-19-c01", shotId: "ED-19", artifact: {sha256: "b".repeat(64)}},
]);
assert.equal(duplicateAudit.status, "RECOMMENDATION_BLOCKED");
assert.equal(duplicateAudit.uniqueArtifactCount, 2);
assert.equal(duplicateAudit.blockingDuplicateGroups.length, 2);

const synthetic = structuredClone(workspace);
synthetic.production.shotIntelligence.decisionSet.items = synthetic.production.shotIntelligence.decisionSet.items.slice(0, 3);
const syntheticRun = structuredClone(upgradedRun);
syntheticRun.plan.shots = syntheticRun.plan.shots.slice(0, 3);
const syntheticCompiled = compileShotSemanticDesignBriefSet({workspace: synthetic, directorRun: syntheticRun, appRoot, now: "2026-08-05T12:00:00.000Z"});
assert.equal(syntheticCompiled.shotCount, 3, "compiler must not lock to 34 shots");

function ed12Status() { return byId.get("ED-12").status; }

  console.log(JSON.stringify({contract: "A1ShotSemanticDesignBriefTest/v1", status: "PASS", checks: {dynamicShotCount: true, exactHashBinding: true, currentBriefStatusesExplicit: true, ed20CorrectionRecompiled: true, ed20EditorOwnedSourceCapturePreserved: true, ed17MethodSequenceProtected: true, ed15TemplateReuseRejected: true, ed19Ed23TopologySeparated: true, ed23ScreenEvidenceNoPackage: true, ed12AuthorProofUsesRealHoldFrame: true, duplicateArtifactRecommendationBlocked: true}}, null, 2));
