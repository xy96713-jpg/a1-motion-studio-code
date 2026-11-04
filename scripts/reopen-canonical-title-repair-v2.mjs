#!/usr/bin/env node

import crypto from "node:crypto";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = new URL("../apps/studio-next/", import.meta.url).pathname;
const targetRepairShotIds = ["ED-07", "ED-08", "ED-13", "ED-19"];
const generationEligibleShotIds = ["ED-07", "ED-13", "ED-19"];
const retainedShotIds = ["ED-08"];
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const authority = runtime.canonicalDirectorAuthority;
  const previousManifest = runtime.canonicalDirectorTargetRepairManifest;
  if (authority?.status !== "PASS" || previousManifest?.authoritySha256 !== authority.authoritySha256 || previousManifest?.sourceRevisionHash !== authority.sourceRevisionHash) throw new Error("canonical-title-repair-reopen-authority-drift");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("canonical-title-repair-reopen-requires-frozen-idle-runtime");
  if ((runtime.currentAssembly || []).length !== 0) throw new Error("canonical-title-repair-reopen-assembly-must-remain-empty");
  const alreadyCurrent = JSON.stringify(previousManifest.targetRepairShotIds) === JSON.stringify(targetRepairShotIds)
    && JSON.stringify(previousManifest.generationEligibleShotIds) === JSON.stringify(generationEligibleShotIds)
    && previousManifest.boardRebuilt === false
    && runtime.wholeFilmStaticBoard?.status === "SUPERSEDED_REPAIR_PENDING";
  if (alreadyCurrent) return {workspace: current, manifest: previousManifest, alreadyCurrent: true};

  const now = new Date().toISOString();
  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  const manifestBase = {
    ...structuredClone(previousManifest),
    checkpoint: "CANONICAL_TITLE_REPAIR_PENDING",
    targetRepairShotIds,
    generationEligibleShotIds,
    retainedCurrentPassShotIds: retainedShotIds,
    generationDispatched: false,
    dispatchedShotIds: [],
    imageGenCalls: 0,
    imageGenCallsMeasured: true,
    boardRebuilt: false,
    assemblyStarted: false,
    finalBoardSha256: null,
    reopenedAt: now,
    reopenReason: "user-global-review-keeps-ed08-and-requires-true-pixel-repair-for-ed07-ed13-ed19",
    entries: (previousManifest.entries || []).map((entry) => {
      if (retainedShotIds.includes(entry.shotId)) return {...entry, status: "RETAINED_CURRENT_PASS", generationAllowed: false, retainedCandidateSha: entry.finalSha || entry.candidateSha || null, finalBoardSha256: null};
      if (!generationEligibleShotIds.includes(entry.shotId)) return entry.shotId === "ED-32"
        ? {...entry, status: "SUPERSEDED_NO_PACKAGE", generationAllowed: false, supersededCandidateSha: entry.finalSha || entry.candidateSha || null, finalBoardSha256: null}
        : entry;
      return {
        ...entry,
        status: "TARGET_REPAIR_GENERATION_ELIGIBLE",
        generationAllowed: true,
        supersededCandidateSha: entry.finalSha || entry.candidateSha || null,
        candidateSha: null,
        auditStatus: "PENDING_DELTA_AUDIT",
        auditSha256: null,
        finalSha: null,
        finalBoardSha256: null,
      };
    }),
  };
  const manifest = {...manifestBase, manifestSha256: sha256({...manifestBase, manifestSha256: undefined})};
  nextRuntime.canonicalDirectorTargetRepairManifestHistory = [
    ...(nextRuntime.canonicalDirectorTargetRepairManifestHistory || []),
    {...structuredClone(previousManifest), current: false, authorityScope: "HISTORY_READ_ONLY", supersededAt: now},
  ];
  nextRuntime.canonicalDirectorTargetRepairManifest = manifest;
  nextRuntime.wholeFilmStaticBoard = {
    ...(nextRuntime.wholeFilmStaticBoard || {}),
    status: "SUPERSEDED_REPAIR_PENDING",
    decision: null,
    approvalAllowed: false,
    supersededShotIds: ["ED-32"],
    repairTargetShotIds: generationEligibleShotIds,
    supersededAt: now,
  };
  nextRuntime.wholeFilmBatchRecommendation = {
    ...(nextRuntime.wholeFilmBatchRecommendation || {}),
    status: "CANONICAL_TITLE_REPAIR_PENDING",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "CANONICAL_TITLE_REPAIR",
    staticBoard: nextRuntime.wholeFilmStaticBoard,
  };
  next.production.visualProductionRun = {
    ...(next.production.visualProductionRun || {}),
    status: "CANONICAL_TITLE_REPAIR_PENDING",
    nextUserGate: "CANONICAL_TITLE_REPAIR",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
  };
  next.production.semanticAuthorityConvergence = {
    ...(next.production.semanticAuthorityConvergence || {}),
    checkpoint: "CANONICAL_TITLE_REPAIR_PENDING",
    authoritySha256: authority.authoritySha256,
    sourceRevisionHash: authority.sourceRevisionHash,
    manifestSha256: manifest.manifestSha256,
    targetRepairShotIds,
    generationEligibleShotIds,
    retainedCurrentPassShotIds: retainedShotIds,
    generationAllowedByCanonicalAuthority: true,
    generationDispatched: false,
    imageGenCalls: 0,
    boardRebuilt: false,
  };
  next.production.packagingAutomation = {
    ...(next.production.packagingAutomation || {}),
    status: "CANONICAL_TITLE_REPAIR_PENDING",
    targetShotIds: generationEligibleShotIds,
    generationFreeze: {...(next.production.packagingAutomation?.generationFreeze || {}), frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"},
  };
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "reopen-canonical-title-repair-v2", targetId: generationEligibleShotIds.join(","), payload: {authoritySha256: authority.authoritySha256, previousManifestSha256: previousManifest.manifestSha256, manifestSha256: manifest.manifestSha256, targetRepairShotIds, generationEligibleShotIds, retainedCurrentPassShotIds: retainedShotIds, supersededBoardSha256: runtime.wholeFilmStaticBoard?.sha256 || null}});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {"semantic-authority-convergence-v1/target-repair-manifest.json": manifest},
  });
  return {workspace: recalculated, manifest, committed, alreadyCurrent: false};
});

console.log(JSON.stringify({
  status: "PASS",
  checkpoint: "CANONICAL_TITLE_REPAIR_PENDING",
  workspaceSha256: result.workspace.workspaceSha256,
  manifestSha256: result.manifest.manifestSha256,
  targetRepairShotIds,
  generationEligibleShotIds,
  retainedCurrentPassShotIds: retainedShotIds,
  boardStatus: result.workspace.production.shotIntelligence.wholeFilmStaticBoard.status,
  boardSha256: result.workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256,
  queue: result.workspace.production.generation.summary,
  workerStatus: result.workspace.production.generation.workerStatus,
  assemblyCount: result.workspace.production.shotIntelligence.currentAssembly.length,
  alreadyCurrent: result.alreadyCurrent,
}, null, 2));
