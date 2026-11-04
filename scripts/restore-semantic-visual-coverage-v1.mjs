#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {projectCanonicalStaticBoardWorkspace} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {compileCurrentStoryboardTasteBriefs} from "../apps/studio-next/src/lib/a1-current-storyboard-taste-compiler-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {buildCreatorPaletteBoundRepairTransition} from "./compile-creator-packaging-palette-bound-repair-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const overridesFile = path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json");
const expectedWorkspaceSha256 = process.argv.find((arg) => /^[a-f0-9]{64}$/u.test(arg)) || null;
const expectedPackageShotIds = ["ED-01", "ED-07", "ED-09", "ED-10", "ED-12", "ED-13", "ED-14", "ED-16", "ED-17", "ED-19", "ED-31", "ED-34"];

function historyOnly(brief, now) {
  return {
    ...structuredClone(brief),
    current: false,
    status: "HISTORY_READ_ONLY",
    authorityScope: "HISTORY_READ_ONLY",
    supersededReason: "CANONICAL_SEMANTIC_VISUAL_COVERAGE_RECOMPILED",
    supersededAt: now,
  };
}

function appendUniqueHistory(history, entries) {
  const seen = new Set((history || []).map((entry) => entry.styleBriefSha256).filter(Boolean));
  return [...(history || []), ...entries.filter((entry) => entry.styleBriefSha256 && !seen.has(entry.styleBriefSha256))];
}

function reprojectAndRebuildTemporal(workspace, now) {
  let next = projectCanonicalStaticBoardWorkspace(workspace, {now}).workspace;
  delete next.production.packagingTemporalReadabilityAuthority;
  next = recalculateEditorialAssetWorkbench(next, now);
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  return assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
}

function compileTasteTwice(workspace, now) {
  const first = compileCurrentStoryboardTasteBriefs(workspace, {appRoot, now});
  const staged = structuredClone(workspace);
  staged.production.packagingStyleBriefs = first.briefs;
  staged.production.packagingStyleBriefAudit = first.audit;
  staged.production.currentStoryboardTasteCompilation = first.compilation;
  const second = compileCurrentStoryboardTasteBriefs(staged, {appRoot, now});
  return second;
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (expectedWorkspaceSha256 && current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`semantic-visual-coverage-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("semantic-visual-coverage-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("semantic-visual-coverage-requires-no-assembly");
  const now = new Date().toISOString();
  let next = structuredClone(current);
  next.production.creatorPackagingProjectOverrides = JSON.parse(fs.readFileSync(overridesFile, "utf8"));
  next.production.canonicalCreatorPackagingSequence = buildCanonicalCreatorPackagingSequence(next, {now});
  const packageShotIds = next.production.canonicalCreatorPackagingSequence.decisions.filter((decision) => decision.packageDecision === "PACKAGE").map((decision) => decision.shotId);
  if (JSON.stringify(packageShotIds) !== JSON.stringify(expectedPackageShotIds)) throw new Error(`semantic-visual-coverage-membership-invalid:${JSON.stringify(packageShotIds)}`);
  if (next.production.canonicalCreatorPackagingSequence.rhythmAudit.status !== "PASS") throw new Error(`semantic-visual-coverage-rhythm-invalid:${next.production.canonicalCreatorPackagingSequence.rhythmAudit.failures.join(",")}`);

  next = reprojectAndRebuildTemporal(next, now);
  const taste = compileTasteTwice(next, now);
  next.production.packagingStyleBriefHistory = appendUniqueHistory(next.production.packagingStyleBriefHistory, (next.production.packagingStyleBriefs || []).map((brief) => historyOnly(brief, now)));
  next.production.packagingStyleBriefs = taste.briefs;
  next.production.packagingStyleBriefAudit = taste.audit;
  next.production.currentStoryboardTasteCompilation = taste.compilation;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));

  const bound = buildCreatorPaletteBoundRepairTransition(next, {now});
  next = bound.workspace;
  next = reprojectAndRebuildTemporal(next, now);
  if (next.production.creatorPaletteShotBindingManifest.status !== "PASS" || next.production.creatorPaletteShotBindingManifest.packageShotCount !== expectedPackageShotIds.length) throw new Error(`semantic-visual-coverage-binding-blocked:${JSON.stringify(next.production.creatorPaletteShotBindingManifest.blockedShotIds)}`);
  next.production.shotIntelligence.wholeFilmStaticBoard = {
    ...next.production.shotIntelligence.wholeFilmStaticBoard,
    status: "SUPERSEDED_BY_CANONICAL_SEMANTIC_VISUAL_COVERAGE_REBUILD",
    approvalAllowed: false,
    decision: null,
    userVisualApproval: "NOT_APPROVED",
  };
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {
    ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
    status: "CANONICAL_STATIC_BOARD_REBUILD_REQUIRED",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
  };
  next.production.shotIntelligence.currentAssembly = [];
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.authority = {
    ...next.production.authority,
    currentStage: "whole-film-static-board-rebuild",
    state: "whole-film-static-board-rebuild",
    nextAction: {id: "rebuild-whole-film-static-board", label: `按当前 ${expectedPackageShotIds.length} 个语义包装事件重建 34 镜静态板`, requiresUser: false, targetShotIds: expectedPackageShotIds, reviewGate: "WHOLE_FILM_STATIC_BOARD"},
  };
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));

  const event = createProductionEvent({
    workspace: current,
    action: "restore-semantic-visual-coverage-v1",
    targetId: next.production.canonicalCreatorPackagingSequence.sequenceSha256,
    payload: {packageShotIds, restoredShotIds: ["ED-10", "ED-17"], retainedNoPackageShotIds: ["ED-08", "ED-33"], imageGenerationPerformed: false, userVisualApproval: "NOT_APPROVED", motionPerformed: false},
    now,
  });
  next.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));

  const report = {
    contract: "A1SemanticVisualCoverageRestoration/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    canonicalPackageShotIds: packageShotIds,
    restoredShotIds: ["ED-10", "ED-17"],
    retainedNoPackageShotIds: ["ED-08", "ED-33"],
    creatorSequenceSha256: next.production.canonicalCreatorPackagingSequence.sequenceSha256,
    tasteCompilationSha256: taste.compilation.compilationSha256,
    visualDirectionEnvelopeSha256: taste.directionEnvelope.directionEnvelopeSha256,
    bindingManifestSha256: next.production.creatorPaletteShotBindingManifest.manifestSha256,
    bindingStatus: next.production.creatorPaletteShotBindingManifest.status,
    imageGenerationPerformed: false,
    userVisualApproval: "NOT_APPROVED",
    assemblyCount: 0,
    motionPerformed: false,
    generatedAt: now,
  };
  const persisted = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `semantic-visual-coverage-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "semantic-visual-coverage-restoration-v1/report.json": report,
      "current-storyboard-production-v1/taste-compilation.json": taste.compilation,
      "current-storyboard-production-v1/taste-style-audit.json": taste.audit,
      "current-storyboard-production-v1/storyboard-production-projection.json": next.production.storyboardProductionProjection,
      "creator-packaging-palette-review-v1/registry.json": bound.registry,
      "creator-packaging-palette-review-v1/report.json": bound.report,
      "creator-packaging-palette-binding-v1/manifest.json": next.production.creatorPaletteShotBindingManifest,
      "creator-packaging-palette-binding-v1/actual-mode-migration.json": next.production.creatorPaletteActualModeMigration,
      "incremental-repair-executor-v1/repair-manifest.json": bound.repairManifest,
    },
    systemFiles: {"current-storyboard-production-v1/storyboard-interop-v1/visual-direction-envelope.json": taste.directionEnvelope},
  });
  return {...report, workspaceSha256After: persisted.workspaceSha256, transitionSha256: persisted.transitionSha256};
});

console.log(JSON.stringify(result, null, 2));
