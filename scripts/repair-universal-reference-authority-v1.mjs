#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_UNIVERSAL_REFERENCE_AUTHORITY_CONTRACT, UNIVERSAL_REFERENCE_AUTHORITY_PRECEDENCE} from "../apps/studio-next/src/lib/a1-universal-reference-authority-v1.mjs";
import {A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const migrationRelativePath = "golden-film-visual-system-maturity-v1/universal-reference-packaging-migration.json";
const maturityRelativePath = "golden-film-visual-system-maturity-v1/maturity-run.json";
const boardReportRelativePath = "whole-film-static-board-v1/report.json";
const migrationHistoryRelativePath = "golden-film-visual-system-maturity-v1/history/universal-reference-packaging-migration-v1-legacy.json";
const boardReportHistoryRelativePath = "whole-film-static-board-v1/history/report-v1-pre-universal-reference-gate.json";
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const REQUIRED_REFERENCE_SHOTS = new Set(["ED-08", "ED-13", "ED-14", "ED-31"]);
const VISUAL_REBUILD_SHOTS = new Set(["ED-08", "ED-13", "ED-14", "ED-19", "ED-31"]);
const LEGACY_DIRECTION_ONLY_SHOTS = new Set(["ED-34"]);
const NO_REFERENCE_GENERATIVE_SHOTS = new Set(["ED-07", "ED-09", "ED-10", "ED-12", "ED-16", "ED-17", "ED-19", "ED-33", "ED-34"]);

function publicPathForUrl(url) {
  if (!String(url || "").startsWith("/generated/system-line/")) return null;
  return path.resolve(path.join(appRoot, "public", String(url).replace(/^\//u, "")));
}

function normalizeReference(input, index) {
  return {
    sourcePath: input.sourcePath,
    sourceSha256: input.sourceSha256 || input.sha256,
    sourceType: input.sourceType || "OBJECT_PHOTO",
    semanticRole: input.semanticRole || input.role || input.id,
    transformPolicy: input.transformPolicy || "COMPOSITION_ANCHOR",
    generationAttachmentIndex: index,
  };
}

function uniqueReferences(inputs) {
  const seen = new Set();
  return inputs.filter((input) => input?.sourcePath && input?.sourceSha256).filter((input) => {
    const key = `${input.sourcePath}:${input.sourceSha256}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(normalizeReference).map((input, index) => ({...input, generationAttachmentIndex: index}));
}

function explicitNoReferenceReason(shotId) {
  if (shotId === "ED-07") return "纯命题标题与口播动作；无外部事实或语义图像能增加信息，现有 hold frame 只作为视频底层而非 ImageGen 证据。";
  if (shotId === "ED-34") return "结尾方向标题是抽象风格裁决，不需要外部事实素材；保留现有构图只作方向种子，不能当用户批准母版。";
  if (shotId === "ED-19") return "整理→编排→读取→检查是抽象编辑动作，不需要外部来源；现有视觉仍需冷白/炭黑重做。";
  return "当前 semantic beat 没有外部事实、真实 UI 或证据窗口的信息增益；由 classifier 显式选择 NO_REFERENCE_GENERATIVE，不是附件缺失的静默降级。";
}

function buildReferenceInputs(shotId, plan, jobs, beat) {
  if (NO_REFERENCE_GENERATIVE_SHOTS.has(shotId)) return [];
  const job = jobs.find((item) => item.shotId === shotId && item.targetKind === "package-look-master" && item.referenceAttachmentManifest?.stage === "ATTACHED_TO_CODEX_INITIAL_PROMPT" && Array.isArray(item.referenceInputs))
    || jobs.find((item) => item.shotId === shotId && item.targetKind === "package-look-master" && Array.isArray(item.referenceInputs));
  const inputs = [];
  if (job) inputs.push(...job.referenceInputs);
  else inputs.push(...(plan.referenceInputs || []));
  if (plan.videoContext?.baseFrame?.publicUrl && plan.videoContext.baseFrame.sha256) {
    inputs.unshift({
      sourcePath: publicPathForUrl(plan.videoContext.baseFrame.publicUrl),
      sourceSha256: plan.videoContext.baseFrame.sha256,
      sourceType: "REAL_HOLD_FRAME",
      semanticRole: "real-hold-frame-composition-anchor",
      transformPolicy: "PIXEL_EXACT_RESTORE",
    });
  }
  if (shotId === "ED-14") {
    for (const source of beat.sourceReferences || []) {
      inputs.unshift({
        sourcePath: publicPathForUrl(source.publicUrl),
        sourceSha256: source.sha256,
        sourceType: "RESEARCH_EVIDENCE",
        semanticRole: source.role || "real-research-evidence-window",
        transformPolicy: "EVIDENCE_WINDOW",
      });
    }
  }
  return uniqueReferences(inputs);
}

function attachmentEvidence(shotId, references, jobs) {
  if (NO_REFERENCE_GENERATIVE_SHOTS.has(shotId)) return {
    contract: "A1ImagegenActualAttachmentEvidence/v1",
    status: "NOT_REQUIRED_EXPLICIT_NO_REFERENCE_GENERATIVE",
    hardBlock: false,
    attachmentCount: 0,
    attachedSourceSha256s: [],
    reason: explicitNoReferenceReason(shotId),
  };
  const candidates = jobs.filter((job) => job.shotId === shotId && job.targetKind === "package-look-master");
  const attachedJobs = candidates.filter((job) => {
    const manifest = job.referenceAttachmentManifest;
    return manifest?.stage === "ATTACHED_TO_CODEX_INITIAL_PROMPT"
      && Array.isArray(manifest.attachments)
      && manifest.attachments.length === references.length
      && manifest.attachments.every((item) => item.attachedToInitialPrompt === true && item.attachedSha256 === item.sourceSha256);
  });
  if (attachedJobs.length > 0) {
    const manifest = attachedJobs[0].referenceAttachmentManifest;
    return {
      contract: "A1ImagegenActualAttachmentEvidence/v1",
      status: "PASS",
      hardBlock: false,
      attachmentCount: manifest.attachments.length,
      attachedSourceSha256s: manifest.attachments.map((item) => item.attachedSha256),
      jobId: attachedJobs[0].id,
      reason: "real image attachments are recorded against the initial ImageGen prompt",
    };
  }
  return {
    contract: "A1ImagegenActualAttachmentEvidence/v1",
    status: "MISSING",
    hardBlock: true,
    attachmentCount: 0,
    attachedSourceSha256s: [],
    inspectedJobIds: candidates.map((job) => job.id),
    reason: "旧 job 只有 reference path/SHA 声明，未证明图像附件实际进入 ImageGen initial prompt。",
  };
}

function classifyEntry({shotId, boardItem, plan, beat, jobs, rawReferences}) {
  const referenceDecision = NO_REFERENCE_GENERATIVE_SHOTS.has(shotId)
    ? "NO_REFERENCE_GENERATIVE"
    : REQUIRED_REFERENCE_SHOTS.has(shotId) ? "REQUIRED" : "HELPFUL";
  const referenceInputs = buildReferenceInputs(shotId, plan, jobs, beat);
  const evidence = attachmentEvidence(shotId, referenceInputs, jobs);
  const passingRaw = [...(rawReferences || [])].reverse().find((raw) => raw.shotId === shotId
    && raw.current === true
    && raw.referencePackagingContract === A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT
    && raw.semanticPixelAudit?.status === "PASS"
    && raw.recommendationEligible === true);
  const visualRebuildRequired = VISUAL_REBUILD_SHOTS.has(shotId) && !passingRaw;
  const systemPixelPass = shotId === "ED-34" && Boolean(passingRaw);
  const directionOnly = LEGACY_DIRECTION_ONLY_SHOTS.has(shotId) && !systemPixelPass;
  const blockers = [];
  if (evidence.hardBlock) blockers.push("ACTUAL_IMAGEGEN_ATTACHMENT_MISSING");
  if (visualRebuildRequired) blockers.push(`VISUAL_DIRECTION_REBUILD_REQUIRED:${shotId}`);
  const status = blockers.length > 0 ? "BLOCKED" : systemPixelPass ? "SYSTEM_PIXEL_PASS" : directionOnly ? "LEGACY_DIRECTION_ONLY" : "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS";
  const selectedCandidate = passingRaw || null;
  return {
    shotId,
    order: boardItem?.order || null,
    referenceDecision,
    classifierReason: referenceDecision === "NO_REFERENCE_GENERATIVE" ? explicitNoReferenceReason(shotId) : "真实 hold frame / research evidence 与本镜语义直接相关，必须作为实际图像附件。",
    referenceInputs,
    actualGenerationAttachmentEvidence: evidence,
    currentCandidateId: selectedCandidate?.referenceId || boardItem?.candidateId || null,
    currentCandidateSha: selectedCandidate?.artifact?.sha256 || boardItem?.artifactSha256 || null,
    currentCompositeSha: selectedCandidate?.artifact?.sha256 || boardItem?.compositeSha256 || null,
    currentMode: {
      presentationMode: boardItem?.presentationMode || plan.presentationMode || null,
      assemblyMode: boardItem?.assemblyMode || plan.assemblyMode || null,
      frameOccupation: boardItem?.frameOccupation || plan.frameOccupation || null,
    },
    actualModeEvidence: status === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" ? "UNIVERSAL_REFERENCE_FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS" : status === "SYSTEM_PIXEL_PASS" ? "SYSTEM_PIXEL_PASS" : status === "LEGACY_DIRECTION_ONLY" ? "LEGACY_DIRECTION_ONLY" : "BLOCKED_UNIVERSAL_REFERENCE_ATTACHMENT_GATE",
    status,
    hardBlock: status === "BLOCKED",
    blockers,
    nextAction: status === "BLOCKED" ? (evidence.hardBlock ? "REGENERATE_WITH_VERIFIED_IMAGE_ATTACHMENTS" : "REBUILD_CURRENT_VISUAL_DIRECTION") : status === "LEGACY_DIRECTION_ONLY" ? "USE_AS_STYLE_OR_LAYOUT_SEED_ONLY" : status === "SYSTEM_PIXEL_PASS" ? "HOLD_FOR_USER_APPROVAL" : "LOCK_CURRENT_NO_REFERENCE_MASTER_PENDING_USER_BOARD_REVIEW",
    generationAllowed: false,
    userVisualApproval: "NOT_APPROVED",
  };
}

function buildSupersededBoardReport(previous, {workspaceSha256, migrationSha256, now}) {
  return {
    ...previous,
    status: "SUPERSEDED_UNIVERSAL_REFERENCE_ATTACHMENT_BLOCKED",
    current: false,
    historyReadOnly: true,
    authorityScope: "HISTORY_READ_ONLY",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    productionWired: false,
    motionApproved: false,
    stage: "HISTORY_READ_ONLY",
    nextUserGate: "UNIVERSAL_REFERENCE_PACKAGING_MIGRATION",
    nextAction: "COMPLETE_UNIVERSAL_REFERENCE_MIGRATION",
    userApprovalRequired: false,
    supersededBy: {authority: A1_UNIVERSAL_REFERENCE_AUTHORITY_CONTRACT, migrationSha256: migrationSha256, workspaceSha256},
    updatedAt: now,
  };
}

export function repairUniversalReferenceAuthority({now = new Date().toISOString()} = {}) {
  return withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("universal-reference-authority-repair-requires-frozen-idle-runtime");
    const migrationPath = path.join(publicDir, migrationRelativePath);
    const maturityPath = path.join(publicDir, maturityRelativePath);
    const boardReportPath = path.join(publicDir, boardReportRelativePath);
    const previousMigration = readJson(migrationPath);
    const maturity = readJson(maturityPath);
    const previousBoardReport = readJson(boardReportPath);
    const existingGate = before.production.universalReferencePackagingGate;
    const actualAttachmentProofPresent = (before.production.generation.jobs || []).some((job) => job.referenceAttachmentManifest?.stage === "ATTACHED_TO_CODEX_INITIAL_PROMPT"
      && job.referenceAttachmentManifest?.requireAttached === true
      && Array.isArray(job.referenceAttachmentManifest?.attachments)
      && job.referenceAttachmentManifest.attachments.length > 0
      && job.referenceAttachmentManifest.attachments.every((item) => item.attachedToInitialPrompt === true && item.attachedSha256 === item.sourceSha256));
    if (existingGate?.contract === A1_UNIVERSAL_REFERENCE_AUTHORITY_CONTRACT
      && existingGate.current === true
      && existingGate.status === "BLOCKED"
      && previousMigration.current === true
      && previousMigration.manifestSha256 === existingGate.migrationManifestSha256
      && previousMigration.packageCount === 13
      && previousMigration.noPackageCount === 21
      && !actualAttachmentProofPresent) {
      return {status: "NOOP_ALREADY_UNIVERSAL_REFERENCE_AUTHORITY", workspaceSha256: before.workspaceSha256, migrationSha256: previousMigration.manifestSha256, maturityRunSha256: before.production.goldenFilmVisualSystemMaturity?.maturityRunSha256 || null, blockedShotIds: [...(existingGate.blockedShotIds || [])], imageGenerationPerformed: false, assemblyCreated: false};
    }
    const runtime = before.production.shotIntelligence;
    const board = runtime.wholeFilmStaticBoard;
    const packageIds = [...(runtime.canonicalStaticBoardAuthority?.requiredPackageBoardShotIds || [])];
    if (packageIds.length !== 13 || Number(before.article?.shotCount || 0) - packageIds.length !== 21) throw new Error("universal-reference-authority-current-13-21-contract-required");
    const boardByShot = new Map((board.items || []).map((item) => [item.shotId, item]));
    const planByShot = new Map((runtime.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
    const beatByShot = new Map((maturity.decisionContract?.beats || []).map((beat) => [beat.shotId, beat]));
    const jobs = before.production.generation.jobs || [];
    const entries = packageIds.map((shotId) => classifyEntry({shotId, boardItem: boardByShot.get(shotId), plan: planByShot.get(shotId) || {}, beat: beatByShot.get(shotId) || {}, jobs, rawReferences: runtime.lookMasterRawReferences || []}));
    for (const entry of entries) for (const input of entry.referenceInputs) {
      if (!fs.existsSync(input.sourcePath)) throw new Error(`universal-reference-source-missing:${entry.shotId}:${input.sourcePath}`);
      if (sha256(fs.readFileSync(input.sourcePath)) !== input.sourceSha256) throw new Error(`universal-reference-source-sha-mismatch:${entry.shotId}:${input.sourcePath}`);
    }
    const blockedShotIds = entries.filter((entry) => entry.status === "BLOCKED").map((entry) => entry.shotId);
    const passShotIds = entries.filter((entry) => entry.status === "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS").map((entry) => entry.shotId);
    const systemPixelPassShotIds = entries.filter((entry) => entry.status === "SYSTEM_PIXEL_PASS").map((entry) => entry.shotId);
    const legacyDirectionOnlyShotIds = entries.filter((entry) => entry.status === "LEGACY_DIRECTION_ONLY").map((entry) => entry.shotId);
    const referenceInputShotIds = entries.filter((entry) => entry.referenceDecision !== "NO_REFERENCE_GENERATIVE").map((entry) => entry.shotId);
    const actualAttachmentCoverageCount = entries.filter((entry) => entry.actualGenerationAttachmentEvidence.status === "PASS").length;
    const migrationBase = {
      contract: "A1UniversalReferencePackagingMigration/v2",
      current: true,
      authorityScope: "CURRENT",
      status: blockedShotIds.length ? "CURRENT_UNIVERSAL_REFERENCE_MIGRATION_BLOCKED" : "CURRENT_UNIVERSAL_REFERENCE_MIGRATION_READY",
      authorityPrecedence: [...UNIVERSAL_REFERENCE_AUTHORITY_PRECEDENCE],
      productionMethod: "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION",
      packageCount: 13,
      noPackageCount: 21,
      entries,
      blockedShotIds,
      fullLookMasterActualPixelPassShotIds: passShotIds,
      fullLookMasterActualPixelPassCount: passShotIds.length,
      systemPixelPassShotIds,
      systemPixelPassCount: systemPixelPassShotIds.length,
      legacyDirectionOnlyShotIds,
      legacyDirectionOnlyCount: legacyDirectionOnlyShotIds.length,
      referenceInputShotIds,
      referenceInputShotCount: referenceInputShotIds.length,
      actualAttachmentCoverageCount,
      actualAttachmentCoverageShotIds: entries.filter((entry) => entry.actualGenerationAttachmentEvidence.status === "PASS").map((entry) => entry.shotId),
      generationReadyShotIds: [],
      generationAllowed: false,
      imageGenerationPerformed: false,
      assemblyCreated: false,
      queue: 0,
      running: 0,
      workerStatus: "frozen",
      sourceWorkspaceSha256: before.workspaceSha256,
      supersedes: {status: previousMigration.status, reportSha256: previousMigration.reportSha256 || null, historyReadOnly: true},
      generatedAt: now,
    };
    const migration = {...migrationBase, manifestSha256: sha256(migrationBase)};
    const migrationFileSha256 = sha256(jsonBytes(migration));
    const fullLookMasterActualPixelPassCount = passShotIds.length;
    const nextMaturity = structuredClone(maturity);
    nextMaturity.current = true;
    nextMaturity.authority = "CURRENT_CANONICAL_ROLLBACK_AUTHORITY_THEN_UNIVERSAL_REFERENCE_ATTACHMENT_GATE";
    nextMaturity.overallStatus = blockedShotIds.length ? "CURRENT_UNIVERSAL_REFERENCE_MIGRATION_BLOCKED" : "CURRENT_UNIVERSAL_REFERENCE_MIGRATION_READY";
    nextMaturity.nextAction = blockedShotIds.length ? "COMPLETE_UNIVERSAL_REFERENCE_MIGRATION" : "REBUILD_WHOLE_FILM_STATIC_BOARD";
    nextMaturity.generatedAt = now;
    nextMaturity.inputHashes = {...(nextMaturity.inputHashes || {}), workspaceSha256: before.workspaceSha256, migrationSha256: migration.manifestSha256, migrationFileSha256, boardSha256: board.sha256};
    nextMaturity.actualModeEvidence = {
      contract: "A1UniversalReferenceActualModeEvidence/v1",
      source: "CURRENT_UNIVERSAL_REFERENCE_MIGRATION",
      fullLookMasterActualPixelPassCount,
      fullLookMasterActualPixelPassShotIds: passShotIds,
      systemPixelPassCount: systemPixelPassShotIds.length,
      systemPixelPassShotIds,
      legacyDirectionOnlyCount: legacyDirectionOnlyShotIds.length,
      legacyDirectionOnlyShotIds,
      blockedCount: blockedShotIds.length,
      blockedShotIds,
    };
    nextMaturity.fullLookMasterActualPixelPassCount = fullLookMasterActualPixelPassCount;
    nextMaturity.fullLookMasterActualPixelPassShotIds = passShotIds;
    nextMaturity.systemPixelPassCount = systemPixelPassShotIds.length;
    nextMaturity.systemPixelPassShotIds = systemPixelPassShotIds;
    nextMaturity.legacyDirectionOnlyCount = legacyDirectionOnlyShotIds.length;
    nextMaturity.blockedShotIds = blockedShotIds;
    nextMaturity.phases = {
      ...nextMaturity.phases,
      PHASE_0: {...nextMaturity.phases.PHASE_0, status: blockedShotIds.length ? "BLOCKED_REFERENCE_ATTACHMENT_GATE" : "PASS", packageCount: 13, noPackageCount: 21, fullLookMasterActualPixelPassCount, blockedShotIds, generationRequiredShotIds: [...blockedShotIds]},
      PHASE_2: {...nextMaturity.phases.PHASE_2, status: blockedShotIds.length ? "BLOCKED_REFERENCE_ATTACHMENT_GATE" : "PASS", planModeConflicts: [], generationPreflight: [], attachmentGate: {status: blockedShotIds.length ? "BLOCKED" : "PASS", blockedShotIds}},
      PHASE_3: {...nextMaturity.phases.PHASE_3, status: blockedShotIds.length ? "BLOCKED_REFERENCE_ATTACHMENT_GATE" : "NOT_DISPATCHED", generationAllowed: false, generationDispatched: false, targetShotIds: [], currentWaveJobIds: [], queuedJobIds: [], nextAction: blockedShotIds.length ? "COMPLETE_UNIVERSAL_REFERENCE_MIGRATION" : "REBUILD_WHOLE_FILM_STATIC_BOARD"},
      PHASE_4: {...nextMaturity.phases.PHASE_4, status: blockedShotIds.length ? "SUPERSEDED_UNIVERSAL_REFERENCE_MIGRATION_BLOCKED" : "READY_TO_REBUILD", boardRebuilt: false, userApproval: false, approvedBoardSha: null, nextAction: blockedShotIds.length ? "REBUILD_WHOLE_FILM_STATIC_BOARD_AFTER_MIGRATION" : "REBUILD_WHOLE_FILM_STATIC_BOARD"},
    };
    nextMaturity.imageLedger = {
      ...nextMaturity.imageLedger,
      generationDispatched: false,
      pendingGeneratedCount: 0,
      adoptedGeneratedCount: Number(nextMaturity.imageLedger?.adoptedGeneratedCount || 0),
      referenceAttachmentAudit: {status: blockedShotIds.length ? "BLOCKED" : "PASS", blockedShotIds, actualAttachmentCoverageCount, referenceInputShotCount: referenceInputShotIds.length},
    };
    nextMaturity.runtimeFreeze = {queue: 0, running: 0, workerStatus: "frozen", assemblyCount: 0, assemblyCreationAllowed: false};
    const maturityHashBase = {...nextMaturity};
    delete maturityHashBase.maturityRunSha256;
    nextMaturity.maturityRunSha256 = sha256(maturityHashBase);
    const nextBoardReport = buildSupersededBoardReport(previousBoardReport, {workspaceSha256: before.workspaceSha256, migrationSha256: migration.manifestSha256, now});
    const next = structuredClone(before);
    next.production.universalReferencePackagingGate = {
      contract: A1_UNIVERSAL_REFERENCE_AUTHORITY_CONTRACT,
      current: true,
      status: blockedShotIds.length ? "BLOCKED" : "PASS",
      authorityScope: "CURRENT",
      authorityPrecedence: [...UNIVERSAL_REFERENCE_AUTHORITY_PRECEDENCE],
      migrationManifestSha256: migration.manifestSha256,
      migrationManifestFileSha256: migrationFileSha256,
      packageCount: 13,
      noPackageCount: 21,
      blockedShotIds,
      fullLookMasterActualPixelPassCount,
      fullLookMasterActualPixelPassShotIds: passShotIds,
      systemPixelPassShotIds,
      systemPixelPassCount: systemPixelPassShotIds.length,
      legacyDirectionOnlyShotIds,
      referenceInputShotCount: referenceInputShotIds.length,
      actualAttachmentCoverageCount,
      actualAttachmentCoverageShotIds: migration.actualAttachmentCoverageShotIds,
      generationReadyShotIds: [],
      generationAllowed: false,
      assemblyCreationAllowed: false,
      productionWired: false,
      motionApproved: false,
      nextAction: blockedShotIds.length ? "COMPLETE_UNIVERSAL_REFERENCE_MIGRATION" : "REBUILD_WHOLE_FILM_STATIC_BOARD",
      sourceWorkspaceSha256: before.workspaceSha256,
      updatedAt: now,
    };
    next.production.goldenFilmVisualSystemMaturity = {
      ...next.production.goldenFilmVisualSystemMaturity,
      current: true,
      authorityScope: "CURRENT",
      status: nextMaturity.overallStatus,
      maturityRunSha256: nextMaturity.maturityRunSha256,
      phaseStatuses: Object.fromEntries(Object.entries(nextMaturity.phases).map(([id, phase]) => [id, phase?.status || null])),
      nextAction: nextMaturity.nextAction,
      targetShotIds: blockedShotIds,
      currentWaveJobIds: [],
      referencePackagingContract: "A1UniversalReferenceToImagegenPackaging/v1",
      productionMethod: "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION",
      imagegenActualAttachmentRequired: true,
      actualModeEvidence: nextMaturity.actualModeEvidence,
      fullLookMasterActualPixelPassCount,
      systemPixelPassShotIds,
      systemPixelPassCount: systemPixelPassShotIds.length,
      approvedBoardSha256: null,
      awaitingApprovalBoardSha256: null,
      updatedAt: now,
    };
    next.production.shotIntelligence.wholeFilmStaticBoard = {
      ...next.production.shotIntelligence.wholeFilmStaticBoard,
      status: "SUPERSEDED_UNIVERSAL_REFERENCE_ATTACHMENT_BLOCKED",
      approvalAllowed: false,
      authorizationStatus: "SUPERSEDED_UNIVERSAL_REFERENCE_ATTACHMENT_GATE",
    };
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {
      ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
      status: "BLOCKED_UNIVERSAL_REFERENCE_ATTACHMENT_GATE",
      nextUserGate: "UNIVERSAL_REFERENCE_PACKAGING_MIGRATION",
      exceptions: entries.filter((entry) => entry.status === "BLOCKED").map((entry) => ({shotId: entry.shotId, status: entry.status, reason: entry.blockers.join(",")})),
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
    };
    next.production.generation.summary.queued = 0;
    next.production.generation.summary.running = 0;
    next.production.generation.workerStatus = "frozen";
    next.production.generation.automaticDispatchAllowed = false;
    const event = createProductionEvent({workspace: next, action: "repair-universal-reference-authority", targetId: migration.manifestSha256, payload: {contract: A1_UNIVERSAL_REFERENCE_AUTHORITY_CONTRACT, precedence: [...UNIVERSAL_REFERENCE_AUTHORITY_PRECEDENCE], packageCount: 13, noPackageCount: 21, blockedShotIds, fullLookMasterActualPixelPassCount, referenceInputShotCount: referenceInputShotIds.length, actualAttachmentCoverageCount, imageGenerationPerformed: false, assemblyCreated: false}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const committed = persistProjectState(appRoot, recalculated, {
      event,
      expectedWorkspaceSha256: before.workspaceSha256,
      files: {
        [migrationRelativePath]: migration,
        [maturityRelativePath]: nextMaturity,
        [migrationHistoryRelativePath]: {...previousMigration, current: false, historyReadOnly: true, authorityScope: "HISTORY_READ_ONLY", supersededBy: migration.manifestSha256},
        [boardReportRelativePath]: nextBoardReport,
        [boardReportHistoryRelativePath]: {...previousBoardReport, current: false, historyReadOnly: true, authorityScope: "HISTORY_READ_ONLY", supersededBy: migration.manifestSha256},
      },
    });
    return {status: "PASS", workspaceSha256: committed.workspaceSha256, migration, migrationFileSha256, maturityRunSha256: nextMaturity.maturityRunSha256, blockedShotIds, passShotIds, legacyDirectionOnlyShotIds, referenceInputShotIds, actualAttachmentCoverageCount, boardSha256: board.sha256, timelineBoardSha256: board.timelineBoard?.sha256 || null};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(repairUniversalReferenceAuthority(), null, 2));
