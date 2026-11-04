#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {markRepairManifestHistoryReadOnly} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {persistGoldenFilmVisualSystemMaturityRun} from "./run-golden-film-visual-system-maturity-v1.mjs";

export const GOLDEN_FILM_MATURITY_AUTHORITY_SYNC_ACTION = "sync-golden-film-visual-system-maturity-authority-v1";
export const GOLDEN_FILM_MATURITY_AUTHORITY_CONTRACT = "A1GoldenFilmVisualSystemMaturityAuthority/v1";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const maturityRelativePath = "golden-film-visual-system-maturity-v1/maturity-run.json";
const bindingRelativePath = "creator-packaging-palette-binding-v1/manifest.json";
const repairRelativePath = "incremental-repair-executor-v1/repair-manifest.json";
const reviewReportRelativePath = "creator-packaging-palette-review-v1/report.json";
const staticBoardReportRelativePath = "whole-film-static-board-v1/report.json";
const historicalRepairPath = path.join(root, ".codex-artifacts/system-progress-system-line/incremental-repair-executor-v1/repair-manifest.json");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJsonAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
};

function bindingSha(manifest) {
  const normalized = {...manifest, manifestSha256: undefined, generatedAt: undefined};
  delete normalized.maturityAuthority;
  return sha256(normalized);
}

function repairSha(manifest) {
  const normalized = {...manifest, manifestSha256: undefined};
  delete normalized.maturityAuthority;
  return sha256(normalized);
}

function summaryFromRun(run) {
  return {
    contract: GOLDEN_FILM_MATURITY_AUTHORITY_CONTRACT,
    maturityId: run.maturityId,
    current: true,
    status: run.overallStatus,
    maturityRunSha256: run.maturityRunSha256,
    phaseStatuses: Object.fromEntries(Object.entries(run.phases || {}).map(([phase, value]) => [phase, value?.status || null])),
    nextAction: run.nextAction,
    targetShotIds: [...(run.phases?.PHASE_3?.targetShotIds || [])],
    currentWaveJobIds: [...(run.phases?.PHASE_3?.queuedJobIds || run.phases?.PHASE_3?.currentWaveJobIds || [])],
    waveDispatchMaturityRunSha256: run.phases?.PHASE_3?.waveDispatchMaturityRunSha256 || null,
    referencePackagingContract: "A1UniversalReferenceToImagegenPackaging/v1",
    productionMethod: run.phases?.PHASE_3?.productionMethod || "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION",
    imagegenActualAttachmentRequired: run.phases?.PHASE_3?.imagegenActualAttachmentRequired === true,
    publicPath: "/generated/system-line/editorial-asset-workbench-v1/golden-film-visual-system-maturity-v1/maturity-run.json",
    updatedAt: run.generatedAt,
  };
}

function currentStaticBoardReport(workspace, {run, repair, now}) {
  const runtime = workspace.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  if (board?.status !== "PENDING_USER_APPROVAL" || board?.reviewScope !== "WHOLE_FILM_STATIC_BOARD") return null;
  return {
    contract: "A1WholeFilmStaticBoardFinalizationReport/v1",
    status: "PASS",
    current: true,
    historyReadOnly: false,
    authorityScope: "CURRENT",
    workspaceSha256: workspace.workspaceSha256,
    stage: "WHOLE_FILM_STATIC_BOARD_READY",
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    nextAction: "CONFIRM_WHOLE_FILM_STATIC_BOARD",
    userApprovalRequired: true,
    items: structuredClone(board.items || []),
    board: {publicUrl: board.publicUrl, sha256: board.sha256, width: board.width, height: board.height, itemCount: board.itemCount, itemSeedSha256: board.itemSeedSha256},
    timelineBoard: board.timelineBoard ? {publicUrl: board.timelineBoard.publicUrl, sha256: board.timelineBoard.sha256, width: board.timelineBoard.width, height: board.timelineBoard.height, itemCount: board.timelineBoard.itemCount} : null,
    packageCount: board.itemCount,
    noPackageCount: Number(workspace.article?.shotCount || 0) - Number(board.itemCount || 0),
    exceptions: [],
    provisionalSelectionCount: board.itemCount,
    formalAssemblyCount: (runtime.currentAssembly || []).length,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    queue: structuredClone(workspace.production.generation.summary),
    workerStatus: workspace.production.generation.workerStatus,
    maturityRunSha256: run.maturityRunSha256,
    repairManifestSha256: repair.manifestSha256,
    generatedAt: board.generatedAt,
    updatedAt: now,
  };
}

export function syncGoldenFilmMaturityAuthority({now = new Date().toISOString()} = {}) {
  return withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    let run = readJson(path.join(publicDir, maturityRelativePath));
    if (run.overallStatus === "GENERATION_COMPLETE_AUDIT_BLOCKED"
      && run.phases?.PHASE_3?.status === "ACTUAL_PIXEL_AUDIT_WITH_REJECTIONS"
      && run.nextAction === "DISPATCH_ED15_DUAL_GAP_OVERLAY_REPAIR_WAVE_MAX_2"
      && !run.phases.PHASE_3.repairAttempt) {
      run = structuredClone(run);
      run.generatedAt = now;
      run.phases.PHASE_3.repairAttempt = 1;
      run.imageLedger = {...run.imageLedger, repairAttempt: 1};
      run.maturityRunSha256 = sha256({...run, maturityRunSha256: undefined});
      persistGoldenFilmVisualSystemMaturityRun(run);
    }
    const summary = summaryFromRun(run);
    const currentBinding = readJson(path.join(publicDir, bindingRelativePath));
    const currentRepair = readJson(path.join(publicDir, repairRelativePath));
    const currentReviewReport = readJson(path.join(publicDir, reviewReportRelativePath));
    const currentBoardReport = fs.existsSync(path.join(publicDir, staticBoardReportRelativePath)) ? readJson(path.join(publicDir, staticBoardReportRelativePath)) : null;
    const maturityAuthority = {
      ...summary,
      syncedAt: now,
    };
    const binding = {
      ...structuredClone(currentBinding),
      maturityAuthority,
    };
    binding.manifestSha256 = bindingSha(binding);
    const repair = {
      ...structuredClone(currentRepair),
      maturityAuthority,
      creatorPaletteShotBindingManifestSha256: binding.manifestSha256,
    };
    if (run.imageLedger?.scope === "CURRENT_UNIVERSAL_REFERENCE_MATURITY_WAVE_DEDUPED_BY_SHA") {
      repair.generationLedger = structuredClone(run.imageLedger);
    }
    repair.entries = (repair.entries || []).map((entry) => {
      if (!entry.bindingFailureProjection) return entry;
      return {
        ...entry,
        bindingFailureProjection: {
          ...entry.bindingFailureProjection,
          bindingManifestSha256: binding.manifestSha256,
        },
      };
    });
    repair.manifestSha256 = repairSha(repair);
    const repairManifestFileSha256 = sha256(jsonBytes(repair));
    // The compiler archives the superseded 14-package manifest before this
    // authority sync adds maturity/binding pointers. Keep the archive's
    // reverse pointer aligned with the final current semantic SHA.
    if (repair.supersedesCurrentManifest?.supersededManifestSha256) {
      for (const archivePath of [
        path.join(artifactDir, "incremental-repair-executor-v1/history", `repair-manifest-${repair.supersedesCurrentManifest.supersededManifestSha256}.json`),
        path.join(publicDir, "incremental-repair-executor-v1/history", `repair-manifest-${repair.supersedesCurrentManifest.supersededManifestSha256}.json`),
      ]) {
        if (!fs.existsSync(archivePath)) continue;
        const archive = readJson(archivePath);
        archive.supersededByManifestSha256 = repair.manifestSha256;
        archive.manifestSha256 = repairSha(archive);
        writeJsonAtomic(archivePath, archive);
      }
    }
    const historicalRepair = fs.existsSync(historicalRepairPath) ? readJson(historicalRepairPath) : null;
    const historicalRepairAligned = historicalRepair?.authorityState === "HISTORY_READ_ONLY"
      && historicalRepair?.current === false
      && historicalRepair?.historyReadOnly === true
      && historicalRepair?.supersededByManifestSha256 === repair.manifestSha256;
    const legacyBeatPlanQuarantined = before.production.packagingBeatPlan?.current === false
      && before.production.packagingBeatPlan?.historyReadOnly === true
      && before.production.packagingBeatPlan?.authorityScope === "HISTORY_READ_ONLY"
      && before.production.packagingBeatPlan?.supersededBy === "A1CanonicalCreatorPackagingSequence/v1";
    const currentBoard = before.production.shotIntelligence.wholeFilmStaticBoard;
    const currentBoardReportAligned = currentBoard?.status !== "PENDING_USER_APPROVAL" || (
      currentBoardReport?.current === true
      && currentBoardReport?.authorityScope === "CURRENT"
      && currentBoardReport?.board?.sha256 === currentBoard.sha256
      && currentBoardReport?.items?.length === currentBoard.itemCount
      && currentBoardReport?.timelineBoard?.sha256 === currentBoard.timelineBoard?.sha256
      && currentBoardReport?.timelineBoard?.itemCount === currentBoard.timelineBoard?.itemCount
      && currentBoardReport?.assemblyCreationAllowed === false
    );
    const existing = before.production.goldenFilmVisualSystemMaturity;
    if (existing?.maturityRunSha256 === summary.maturityRunSha256
    && existing?.status === summary.status
    && existing?.nextAction === summary.nextAction
    && before.production.authority?.nextAction?.id === summary.nextAction
    && JSON.stringify(before.production.authority?.nextAction?.targetShotIds || []) === JSON.stringify(summary.targetShotIds)
    && before.production.authority?.nextAction?.requiresUser === (summary.nextAction === "CONFIRM_WHOLE_FILM_STATIC_BOARD")
      && before.production.maturityLoop?.nextAction === summary.nextAction
      && before.production.packagingLifecycleProjection?.nextActionId === summary.nextAction
      && before.production.shotIntelligence.wholeFilmBatchRecommendation?.status === summary.status
      && before.production.shotIntelligence.wholeFilmBatchRecommendation?.nextUserGate === "WHOLE_FILM_STATIC_BOARD"
    && before.production.creatorPaletteShotBindingManifest?.manifestSha256 === binding.manifestSha256
      && before.production.incrementalRepairManifestAuthority?.manifestSha256 === repair.manifestSha256
      && before.production.incrementalRepairManifestAuthority?.currentRepairStatus === repair.status
      && before.production.incrementalRepairManifestAuthority?.packageCount === repair.summary.packageCount
      && before.production.incrementalRepairManifestAuthority?.noPackageCount === repair.summary.noPackageCount
      && before.production.incrementalRepairManifestAuthority?.readyForGenerationCount === repair.summary.readyForGenerationCount
      && currentReviewReport?.status === summary.status
      && currentReviewReport?.authorityStatus === summary.status
      && currentReviewReport?.nextAction === summary.nextAction
      && currentReviewReport?.repairManifestSha256 === repair.manifestSha256
      && currentReviewReport?.creatorPackagingPalette?.status === summary.status
      && historicalRepairAligned
      && legacyBeatPlanQuarantined
      && currentBoardReportAligned
      && before.production.generation.workerStatus === (["GENERATION_QUEUED", "GENERATION_RUNNING"].includes(summary.status) ? "starting" : "frozen")) {
      if (!historicalRepairAligned && historicalRepair) writeJsonAtomic(historicalRepairPath, markRepairManifestHistoryReadOnly(historicalRepair, {currentManifestSha256: repair.manifestSha256, now}));
      return {noop: true, workspace: before, summary, binding, repair};
    }
    const next = structuredClone(before);
    // The old density-selected beat plan contains a 15/19 snapshot.  Keep it
    // for provenance, but never let it participate in current workspace/API
    // authority after the canonical 13/21 sequence has been compiled.
    if (next.production.packagingBeatPlan?.contract === "A1PackagingBeatPlan/v1") {
      next.production.packagingBeatPlan = {
        ...next.production.packagingBeatPlan,
        current: false,
        historyReadOnly: true,
        advisoryOnly: true,
        authorityScope: "HISTORY_READ_ONLY",
        supersededBy: "A1CanonicalCreatorPackagingSequence/v1",
        supersededBySequenceSha256: next.production.canonicalCreatorPackagingSequence?.sequenceSha256 || null,
      };
    }
    next.production.goldenFilmVisualSystemMaturity = maturityAuthority;
    const maturityNextAction = {
      id: summary.nextAction,
      label: summary.nextAction,
      requiresUser: summary.nextAction === "CONFIRM_WHOLE_FILM_STATIC_BOARD",
      targetShotIds: summary.targetShotIds,
      reviewGate: "GOLDEN_FILM_VISUAL_SYSTEM_MATURITY_V1",
    };
    next.production.authority = {
      ...next.production.authority,
      nextAction: maturityNextAction,
    };
    next.production.maturityLoop = {
      ...next.production.maturityLoop,
      currentStage: next.production.authority.currentStage,
      nextAction: summary.nextAction,
      legacyAdvisoryOnly: true,
    };
    next.production.creatorPaletteShotBindingManifest = binding;
    next.production.incrementalRepairManifestAuthority = {
      ...(next.production.incrementalRepairManifestAuthority || {}),
      contract: "A1IncrementalRepairManifestAuthority/v1",
      status: "CURRENT",
      manifestSha256: repair.manifestSha256,
      manifestShaAlgorithm: "A1IncrementalRepairManifestSemanticSha/v1",
      manifestFileSha256: repairManifestFileSha256,
      manifestFileShaAlgorithm: "SHA-256(UTF-8-JSON-BYTES)",
      currentRepairStatus: repair.status,
      packageCount: repair.summary.packageCount,
      noPackageCount: repair.summary.noPackageCount,
      readyForGenerationCount: repair.summary.readyForGenerationCount,
      artifactPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
      publicPath: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
      mirrorStatus: "IN_SYNC",
    };
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = ["GENERATION_QUEUED", "GENERATION_RUNNING"].includes(summary.status) ? "starting" : "frozen";
    const generationSummary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: 0};
    for (const job of next.production.generation.jobs || []) {
      const status = ["queued", "running", "complete", "failed", "stale", "cancelled"].includes(job.status) ? job.status : "cancelled";
      generationSummary[status] += 1;
      generationSummary.total += 1;
    }
    next.production.generation.summary = generationSummary;
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {
      ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
      status: summary.status,
      nextUserGate: "WHOLE_FILM_STATIC_BOARD",
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
    };
    const event = createProductionEvent({workspace: next, action: GOLDEN_FILM_MATURITY_AUTHORITY_SYNC_ACTION, targetId: summary.maturityRunSha256, payload: {contract: GOLDEN_FILM_MATURITY_AUTHORITY_CONTRACT, status: summary.status, nextAction: summary.nextAction, maturityRunSha256: summary.maturityRunSha256, bindingManifestSha256: binding.manifestSha256, repairManifestSha256: repair.manifestSha256}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const reviewReport = {
      ...structuredClone(currentReviewReport),
      status: summary.status,
      authorityStatus: summary.status,
      nextAction: summary.nextAction,
      referencePackagingContract: summary.referencePackagingContract,
      productionMethod: summary.productionMethod,
      imagegenActualAttachmentRequired: summary.imagegenActualAttachmentRequired,
      workspaceSha256: recalculated.workspaceSha256,
      bindingManifestSha256: binding.manifestSha256,
      repairManifestSha256: repair.manifestSha256,
      repairManifestFileSha256,
      repair: repair.manifestSha256,
      maturity: {
        ...(currentReviewReport?.maturity || {}),
        status: summary.status,
        nextAction: summary.nextAction,
        maturityRunSha256: summary.maturityRunSha256,
        phaseStatuses: summary.phaseStatuses,
      },
      creatorPackagingPalette: {
        ...(currentReviewReport?.creatorPackagingPalette || {}),
        status: summary.status,
        registryStatus: currentReviewReport?.creatorPackagingPalette?.registryStatus || null,
        bindingManifestSha256: binding.manifestSha256,
        repairManifestSha256: repair.manifestSha256,
        repairManifestFileSha256,
        repairSummary: repair.summary,
      },
      lifecycleStatus: summary.status,
      updatedAt: now,
    };
    const staticBoardReport = currentStaticBoardReport(recalculated, {run, repair, now});
    const committed = persistProjectState(appRoot, recalculated, {
      event,
      expectedWorkspaceSha256: before.workspaceSha256,
      files: {
        [bindingRelativePath]: binding,
        [repairRelativePath]: repair,
        [reviewReportRelativePath]: reviewReport,
        ...(staticBoardReport ? {[staticBoardReportRelativePath]: staticBoardReport} : {}),
      },
    });
    if (historicalRepair) writeJsonAtomic(historicalRepairPath, markRepairManifestHistoryReadOnly(historicalRepair, {currentManifestSha256: repair.manifestSha256, now}));
    return {noop: false, workspace: committed, summary, binding, repair};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = syncGoldenFilmMaturityAuthority();
  console.log(JSON.stringify({status: result.noop ? "NOOP_ALREADY_CURRENT" : "PASS", noop: result.noop, workspaceSha256: result.workspace.workspaceSha256, maturityRunSha256: result.summary.maturityRunSha256, maturityStatus: result.summary.status, nextAction: result.summary.nextAction, bindingManifestSha256: result.binding.manifestSha256, repairManifestSha256: result.repair.manifestSha256}, null, 2));
}
