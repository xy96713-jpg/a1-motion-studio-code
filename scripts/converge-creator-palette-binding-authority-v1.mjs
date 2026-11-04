#!/usr/bin/env node

import {createHash, randomBytes} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {
  buildCanonicalCreatorPackagingSequence,
  buildCreatorPackagingPaletteRegistry,
  buildCreatorPaletteShotBindingManifest,
  approveCreatorPackagingPaletteBySystemAuthority,
} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED, markRepairManifestHistoryReadOnly, normalizeCreatorPaletteRepairManifest} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const now = new Date().toISOString();
const canonicalRepairPath = path.join(artifactDir, "incremental-repair-executor-v1/repair-manifest.json");
const publicRepairPath = path.join(publicDir, "incremental-repair-executor-v1/repair-manifest.json");
const historicalRepairPath = path.join(root, ".codex-artifacts/system-progress-system-line/incremental-repair-executor-v1/repair-manifest.json");
const paletteReportPath = path.join(artifactDir, "creator-packaging-palette-review-v1/report.json");
const projectOverrides = JSON.parse(fs.readFileSync(path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json"), "utf8"));
const sha256 = (value) => createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("creator-palette-convergence-requires-frozen-idle-runtime");
if ((before.production.shotIntelligence.currentAssembly || []).length || before.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("creator-palette-convergence-requires-assembly-lock");
if (!fs.existsSync(canonicalRepairPath)) throw new Error("creator-palette-convergence-current-repair-manifest-missing");

const boardSha256Before = before.production.shotIntelligence.wholeFilmStaticBoard?.sha256 || null;
const candidateShasBefore = (before.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean);
const sequenceWorkspace = structuredClone(before);
sequenceWorkspace.production.creatorPackagingProjectOverrides = structuredClone(projectOverrides);
const sequence = buildCanonicalCreatorPackagingSequence(sequenceWorkspace, {now});
const previousRegistry = before.production.creatorPackagingPaletteRegistry;
const registryEntries = (previousRegistry?.entries || []).map((entry) => {
  const decision = sequence.decisions.find((item) => item.shotId === entry.shotId);
  return {...structuredClone(entry), canonicalDecisionSha256: decision?.decisionSha256 || entry.canonicalDecisionSha256, approvalState: "PALETTE_CANDIDATE"};
});
const registry = buildCreatorPackagingPaletteRegistry({
  sequence,
  entries: registryEntries,
  contactSheet: structuredClone(previousRegistry.contactSheet),
  sourceWorkspaceSha256: previousRegistry?.sourceWorkspaceSha256 || before.workspaceSha256,
  sourceBoardSha256: boardSha256Before,
  recommendedTrio: structuredClone(previousRegistry.recommendedTrio),
  now,
});
if (registry.status !== "CREATOR_PACKAGING_PALETTE_REVIEW" || !registry.laneCTargetResolution.targetShotIds.length) throw new Error("creator-palette-convergence-lane-c-taxonomy-not-resolved");
const approvedRegistry = approveCreatorPackagingPaletteBySystemAuthority(registry, registry.recommendedTrio, {
  authoritySequenceSha256: sequence.sequenceSha256,
  registrySourceSha256: registry.registrySha256,
  rationale: "用户已接受 Lane C 语义裁决；当前风格 authority 选择已有实际像素 PASS 的三 Lane 代表，ED-14 保留 canonical SPLIT，不强造 FULL_FRAME Explainer。",
  now,
});

const currentRepairManifest = JSON.parse(fs.readFileSync(canonicalRepairPath, "utf8"));

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== before.workspaceSha256) throw new Error("creator-palette-convergence-workspace-cas-mismatch");
  const next = structuredClone(current);
  next.production.creatorPackagingProjectOverrides = structuredClone(projectOverrides);
  next.production.canonicalCreatorPackagingSequence = sequence;
  next.production.creatorPackagingPaletteRegistry = approvedRegistry;
  const bindingManifest = buildCreatorPaletteShotBindingManifest(next, {now});
  next.production.creatorPaletteShotBindingManifest = bindingManifest;
  const normalizedRepairManifest = normalizeCreatorPaletteRepairManifest(currentRepairManifest, {sequenceSha256: sequence.sequenceSha256, registrySha256: approvedRegistry.registrySha256, bindingManifestSha256: bindingManifest.manifestSha256, bindingManifest, currentPlans: next.production.shotIntelligence.packageLookMasterPlans, status: A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED, now});
  const repairAuthority = {
    contract: "A1IncrementalRepairManifestAuthority/v1",
    status: "CURRENT",
    manifestSha256: normalizedRepairManifest.manifestSha256,
    artifactPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
    publicPath: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
    mirrorStatus: "IN_SYNC",
  };
  next.production.incrementalRepairManifestAuthority = repairAuthority;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  const bindingBlocked = bindingManifest.status !== "PASS";
  const currentStage = bindingBlocked ? "creator-packaging-palette-binding-blocked" : "creator-packaging-palette-approved-preflight-required";
  next.production.packagingAutomation = {...(next.production.packagingAutomation || {}), status: approvedRegistry.status, currentStage, targetShotIds: bindingManifest.blockedShotIds, generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
  next.production.project.currentStage = currentStage;
  next.production.project.updatedAt = now;
  next.production.shotIntelligence.wholeFilmStaticBoard = {...next.production.shotIntelligence.wholeFilmStaticBoard, status: "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED", approvalAllowed: false, decision: null};
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, status: approvedRegistry.status, autoRecommendationAllowed: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "CREATOR_PACKAGING_PREFLIGHT", staticBoard: structuredClone(next.production.shotIntelligence.wholeFilmStaticBoard)};
  next.production.shotIntelligence.canonicalStaticBoardAuthority = buildCanonicalStaticBoardScope(next);
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  const event = createProductionEvent({workspace: next, action: "converge-creator-palette-binding-authority", targetId: bindingManifest.manifestSha256, payload: {sequenceSha256: sequence.sequenceSha256, registrySha256: approvedRegistry.registrySha256, bindingManifestSha256: bindingManifest.manifestSha256, repairManifestSha256: normalizedRepairManifest.manifestSha256, imageGenerationPerformed: false}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const paletteReportBefore = fs.existsSync(paletteReportPath) ? JSON.parse(fs.readFileSync(paletteReportPath, "utf8")) : {};
  const paletteReport = {
    ...paletteReportBefore,
    status: approvedRegistry.status,
    sequenceSha256: sequence.sequenceSha256,
    registrySha256: approvedRegistry.registrySha256,
    bindingManifestSha256: bindingManifest.manifestSha256,
    repairManifestSha256: normalizedRepairManifest.manifestSha256,
    workspaceSha256: recalculated.workspaceSha256,
    boardSha256After: boardSha256Before,
    boardRebuilt: false,
    laneC: {status: "RESOLVED", targetShotIds: approvedRegistry.laneCTargetResolution.targetShotIds, semanticAdjudicationRequired: false, generationAllowed: false, requiredContentTreatment: "EDITORIAL_EXPLAINER", requiredFrameOccupation: "CANONICAL_SHOT_OCCUPATION", representativeShotId: approvedRegistry.selection.selectedByLane[Object.keys(approvedRegistry.selection.selectedByLane).find((laneId) => laneId === "EDITORIAL_EXPLAINER_STRUCTURE")] || null},
    paletteBinding: {status: bindingManifest.status, packageShotCount: bindingManifest.packageShotCount, blockedShotIds: bindingManifest.blockedShotIds, modeCompatibilityFailures: bindingManifest.modeCompatibilityFailures},
    maturity: sequence.maturity,
    imageGenerationPerformed: false,
    queue: structuredClone(recalculated.production.generation.summary),
    workerStatus: recalculated.production.generation.workerStatus,
    assemblyCount: (recalculated.production.shotIntelligence.currentAssembly || []).length,
    assemblyCreationAllowed: false,
    updatedAt: now,
  };
  persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {
      "creator-packaging-palette-review-v1/registry.json": approvedRegistry,
      "creator-packaging-palette-review-v1/report.json": paletteReport,
      "creator-packaging-palette-binding-v1/manifest.json": bindingManifest,
      "incremental-repair-executor-v1/repair-manifest.json": normalizedRepairManifest,
    },
  });
  return {workspace: recalculated, bindingManifest, normalizedRepairManifest, paletteReport};
});

if (fs.existsSync(historicalRepairPath)) {
  const historical = JSON.parse(fs.readFileSync(historicalRepairPath, "utf8"));
  writeJsonAtomic(historicalRepairPath, markRepairManifestHistoryReadOnly(historical, {currentManifestSha256: result.normalizedRepairManifest.manifestSha256, now}));
}

const after = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const candidateShasAfter = (after.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean);
if (after.production.shotIntelligence.wholeFilmStaticBoard?.sha256 !== boardSha256Before || JSON.stringify(candidateShasAfter) !== JSON.stringify(candidateShasBefore)) throw new Error("creator-palette-convergence-production-artifact-drift");
if (fileSha256(canonicalRepairPath) !== fileSha256(publicRepairPath)) throw new Error("creator-palette-convergence-repair-mirror-byte-drift");

console.log(JSON.stringify({
  status: approvedRegistry.status,
  workspaceSha256: after.workspaceSha256,
  boardSha256: boardSha256Before,
  sequenceSha256: sequence.sequenceSha256,
  registrySha256: approvedRegistry.registrySha256,
  bindingManifestSha256: result.bindingManifest.manifestSha256,
  repairManifestSha256: result.normalizedRepairManifest.manifestSha256,
  scopeStatus: after.production.shotIntelligence.canonicalStaticBoardAuthority?.status,
  conflictShotIds: [...new Set(result.bindingManifest.modeCompatibilityFailures.map((item) => item.shotId))],
  queue: after.production.generation.summary,
  workerStatus: after.production.generation.workerStatus,
  assemblyCount: (after.production.shotIntelligence.currentAssembly || []).length,
  assemblyCreationAllowed: after.production.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true,
  imageGenerationPerformed: false,
  boardRebuilt: false,
}, null, 2));
