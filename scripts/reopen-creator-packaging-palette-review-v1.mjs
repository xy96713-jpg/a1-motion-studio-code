#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED,
  buildCreatorPackagingPaletteRegistry,
  buildCreatorPaletteShotBindingManifest,
  assertCreatorPackagingPaletteRegistry,
} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const reportPath = path.join(artifactDir, "creator-packaging-palette-review-v1/report.json");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const runtime = before.production;
const registry = assertCreatorPackagingPaletteRegistry(runtime.creatorPackagingPaletteRegistry);
if (registry.status !== A1_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED) throw new Error(`creator-palette-reopen-status-invalid:${registry.status}`);
if (runtime.generation.summary.queued !== 0 || runtime.generation.summary.running !== 0 || runtime.generation.workerStatus !== "frozen") throw new Error("creator-palette-reopen-generation-not-frozen");
if ((runtime.shotIntelligence.currentAssembly || []).length !== 0 || runtime.shotIntelligence.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("creator-palette-reopen-assembly-not-locked");
if (runtime.incrementalRepairManifestAuthority?.currentRepairStatus !== "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED" || runtime.incrementalRepairManifestAuthority?.readyForGenerationCount !== 0) throw new Error("creator-palette-reopen-repair-not-closed");
if (runtime.creatorPaletteShotBindingManifest?.status !== "PASS" || runtime.creatorPaletteShotBindingManifest?.blockedShotIds?.length) throw new Error("creator-palette-reopen-binding-not-pass");

const now = new Date().toISOString();
const beforeBoardSha256 = runtime.shotIntelligence.wholeFilmStaticBoard?.sha256 || null;
const beforeCandidateShas = (runtime.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean);
const selectedByLane = structuredClone(registry.recommendedTrio || registry.selection?.selectedByLane || {});
const reopened = structuredClone(registry);
reopened.status = "CREATOR_PACKAGING_PALETTE_REVIEW";
reopened.confirmationAllowed = true;
reopened.selection = {
  selectedByLane,
  approvalMode: "USER_REVIEW_PENDING",
  rationale: "绑定修复已闭合；保留当前 Palette PNG 与三 Lane 推荐作为用户审阅起点。此次开闸不批准静态板。",
  userDecisionAt: null,
  reopenedFrom: {
    status: registry.status,
    registrySha256: registry.registrySha256,
    repairManifestSha256: runtime.incrementalRepairManifestAuthority.manifestSha256,
    bindingManifestSha256: runtime.creatorPaletteShotBindingManifest.manifestSha256,
    at: now,
  },
};
reopened.entries = reopened.entries.map((entry) => ({...entry, approvalState: "PALETTE_CANDIDATE"}));
reopened.updatedAt = now;
reopened.registrySha256 = sha256({...reopened, registrySha256: undefined});
assertCreatorPackagingPaletteRegistry(reopened);

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== before.workspaceSha256) throw new Error("creator-palette-reopen-workspace-cas-mismatch");
  const next = structuredClone(current);
  next.production.creatorPackagingPaletteRegistry = reopened;
  const bindingManifest = buildCreatorPaletteShotBindingManifest(next, {now});
  next.production.creatorPaletteShotBindingManifest = bindingManifest;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  next.production.packagingAutomation = {
    ...(next.production.packagingAutomation || {}),
    status: reopened.status,
    currentStage: "creator-packaging-palette-review",
    targetShotIds: [],
    generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"},
    updatedAt: now,
  };
  next.production.project.currentStage = "creator-packaging-palette-review";
  next.production.project.updatedAt = now;
  next.production.shotIntelligence.wholeFilmStaticBoard = {
    ...next.production.shotIntelligence.wholeFilmStaticBoard,
    status: "SUPERSEDED_CREATOR_PACKAGING_PALETTE_PENDING",
    decision: null,
    approvalAllowed: false,
    supersededBySha256: reopened.sequenceSha256,
  };
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {
    ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
    status: reopened.status,
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "CREATOR_PACKAGING_PALETTE_SELECTION",
    staticBoard: structuredClone(next.production.shotIntelligence.wholeFilmStaticBoard),
  };
  const event = createProductionEvent({
    workspace: next,
    action: "reopen-creator-packaging-palette-review",
    targetId: reopened.registrySha256,
    payload: {
      registrySha256: reopened.registrySha256,
      bindingManifestSha256: bindingManifest.manifestSha256,
      repairManifestSha256: next.production.incrementalRepairManifestAuthority.manifestSha256,
      imageGenerationPerformed: false,
      boardRebuilt: false,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const reportBefore = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, "utf8")) : {};
  const report = {
    ...reportBefore,
    contract: "A1CreatorPackagingPaletteReviewReport/v1",
    status: reopened.status,
    registrySha256: reopened.registrySha256,
    bindingManifestSha256: bindingManifest.manifestSha256,
    repairManifestSha256: recalculated.production.incrementalRepairManifestAuthority.manifestSha256,
    workspaceSha256: recalculated.workspaceSha256,
    boardSha256Before: beforeBoardSha256,
    boardSha256After: recalculated.production.shotIntelligence.wholeFilmStaticBoard?.sha256 || null,
    boardRebuilt: false,
    imageGenerationPerformed: false,
    userApprovalRequired: true,
    candidateShasUnchanged: true,
    reopenedAt: now,
  };
  persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {
      "creator-packaging-palette-review-v1/registry.json": reopened,
      "creator-packaging-palette-review-v1/report.json": report,
      "creator-packaging-palette-binding-v1/manifest.json": bindingManifest,
    },
  });
  return {workspace: recalculated, bindingManifest, report};
});

const after = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const afterCandidateShas = (after.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean);
if (after.production.shotIntelligence.wholeFilmStaticBoard?.sha256 !== beforeBoardSha256) throw new Error("creator-palette-reopen-board-drift");
if (JSON.stringify(afterCandidateShas) !== JSON.stringify(beforeCandidateShas)) throw new Error("creator-palette-reopen-candidate-sha-drift");
console.log(JSON.stringify({
  status: after.production.creatorPackagingPaletteRegistry.status,
  confirmationAllowed: after.production.creatorPackagingPaletteRegistry.confirmationAllowed,
  workspaceSha256: after.workspaceSha256,
  registrySha256: after.production.creatorPackagingPaletteRegistry.registrySha256,
  bindingStatus: after.production.creatorPaletteShotBindingManifest.status,
  bindingBlockers: after.production.creatorPaletteShotBindingManifest.blockers,
  boardSha256: beforeBoardSha256,
  boardRebuilt: false,
  candidateShasUnchanged: true,
  imageGenerationPerformed: false,
}, null, 2));
