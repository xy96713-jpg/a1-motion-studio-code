#!/usr/bin/env node
import crypto from "node:crypto";
import assert from "node:assert/strict";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = new URL("../apps/studio-next", import.meta.url).pathname;
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("canonical-title-repair-checkpoint-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const targetShotIds = ["ED-07", "ED-08", "ED-13", "ED-19"];

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`canonical-title-repair-checkpoint-workspace-cas-failed:${current.workspaceSha256}`);
  const runtime = current.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  const manifest = runtime.canonicalDirectorTargetRepairManifest;
  if (board?.status !== "PENDING_USER_APPROVAL" || board.itemCount !== 15 || runtime.wholeFilmBatchRecommendation?.status !== "COMPLETE") throw new Error("canonical-title-repair-checkpoint-board-not-ready");
  if (runtime.wholeFilmBatchRecommendation?.assemblyCreationAllowed !== false || (runtime.currentAssembly || []).length !== 0) throw new Error("canonical-title-repair-checkpoint-downstream-not-locked");
  if (manifest?.boardRebuilt === true) return {status: "ALREADY_COMPLETE", workspaceSha256: current.workspaceSha256, boardSha256: board.sha256};
  if (manifest?.authoritySha256 !== runtime.canonicalDirectorAuthority?.authoritySha256) throw new Error("canonical-title-repair-checkpoint-authority-binding-invalid");
  const itemsByShot = new Map((board.items || []).map((item) => [item.shotId, item]));
  if (targetShotIds.some((shotId) => !itemsByShot.has(shotId))) throw new Error("canonical-title-repair-checkpoint-target-board-item-missing");
  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  const nextManifest = {
    ...manifest,
    checkpoint: "WHOLE_FILM_STATIC_BOARD_READY",
    generationDispatched: true,
    boardRebuilt: true,
    assemblyStarted: false,
    imageGenCalls: null,
    imageGenCallsMeasured: false,
    finalizedAt: new Date().toISOString(),
    finalBoardSha256: board.sha256,
    entries: (manifest.entries || []).map((entry) => {
      const item = itemsByShot.get(entry.shotId);
      if (!item) return entry;
      const raw = nextRuntime.lookMasterRawReferences.find((candidate) => candidate.shotId === item.shotId && candidate.artifact?.sha256 === item.artifactSha256);
      return {
        ...entry,
        status: "STATIC_BOARD_FINALIZED",
        candidateSha: item.artifactSha256,
        auditStatus: "PASS_CACHED",
        auditSha256: raw?.pixelAudit?.auditSha256 || null,
        finalSha: item.artifactSha256,
        finalBoardSha256: board.sha256,
      };
    }),
  };
  nextManifest.manifestSha256 = sha256({...nextManifest, manifestSha256: undefined});
  nextRuntime.canonicalDirectorTargetRepairManifest = nextManifest;
  next.production.semanticAuthorityConvergence = {
    ...(next.production.semanticAuthorityConvergence || {}),
    checkpoint: "WHOLE_FILM_STATIC_BOARD_READY",
    manifestSha256: nextManifest.manifestSha256,
    generationDispatched: true,
    imageGenCalls: null,
    imageGenCallsMeasured: false,
    boardRebuilt: true,
    finalBoardSha256: board.sha256,
  };
  const now = new Date().toISOString();
  const event = createProductionEvent({workspace: current, action: "complete-canonical-title-repair-checkpoint", targetId: targetShotIds.join(","), payload: {contract: "A1CanonicalTitleRepairCheckpointFinalization/v1", boardSha256: board.sha256, manifestSha256: nextManifest.manifestSha256, generationDispatched: true, imageGenCallsMeasured: false, assemblyStarted: false}, now});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `canonical-title-repair-checkpoint-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "semantic-authority-convergence-v1/target-repair-manifest.json": nextManifest,
      "canonical-title-repair-v1/finalization.json": {contract: "A1CanonicalTitleRepairCheckpointFinalization/v1", status: "PASS", boardSha256: board.sha256, manifestSha256: nextManifest.manifestSha256, targetShotIds, imageGenCallsMeasured: false, assemblyStarted: false, finalizedAt: now},
    },
  });
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, boardSha256: board.sha256, manifestSha256: nextManifest.manifestSha256, targetShotIds, assemblyStarted: false};
});

assert.ok(result.status === "PASS" || result.status === "ALREADY_COMPLETE");
console.log(JSON.stringify(result, null, 2));
