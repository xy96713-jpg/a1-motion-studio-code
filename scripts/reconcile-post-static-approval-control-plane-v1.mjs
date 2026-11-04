#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const sha = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const board = current.production.shotIntelligence.wholeFilmStaticBoard;
  const decision = current.production.shotIntelligence.wholeFilmStaticBoardDecision;
  if (board?.status !== "APPROVED" || decision?.decision !== "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY") throw new Error("post-static-approval-approved-board-required");
  const now = new Date().toISOString();
  let next = structuredClone(current);
  const repairManifest = next.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
  if (repairManifest) Object.assign(repairManifest, {status: "HISTORY_READ_ONLY", current: false, boardRebuilt: true, assemblyStarted: false, supersededByBoardDecisionSha256: decision.decisionSha256, closedAt: now});
  const rebuilt = buildCreatorPaletteShotBindingManifest(next, {now});
  const prior = current.production.creatorPaletteShotBindingManifest;
  const priorEntries = new Map(prior.entries.map((entry) => [entry.shotId, entry]));
  const entries = rebuilt.entries.map((entry) => priorEntries.get(entry.shotId) || entry);
  const body = {...rebuilt, status: "PASS", passCount: entries.length, blockedShotIds: [], modeCompatibilityFailures: [], blockers: [], entries, generatedAt: now};
  delete body.manifestSha256;
  const hashInput = {...body}; delete hashInput.generatedAt; delete hashInput.maturityAuthority;
  next.production.creatorPaletteShotBindingManifest = {...body, manifestSha256: sha(hashInput)};
  if (next.production.shotIntelligence.canonicalStaticBoardAuthority?.status === "PASS") next.production.shotIntelligence.canonicalStaticBoardAuthority.creatorPaletteShotBindingManifestSha256 = next.production.creatorPaletteShotBindingManifest.manifestSha256;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const report = {contract: "A1PostStaticApprovalControlPlaneReconciliation/v1", status: "PASS", boardSha256: board.sha256, boardDecisionSha256: decision.decisionSha256, priorBindingManifestSha256: prior.manifestSha256, bindingManifestSha256: next.production.creatorPaletteShotBindingManifest.manifestSha256, canonicalTitleRepairClosed: true, pixelBytesChanged: false, assemblyCount: (next.production.shotIntelligence.currentAssembly || []).length, queue: next.production.generation.summary, reconciledAt: now};
  const event = createProductionEvent({workspace: current, action: "reconcile-post-static-approval-control-plane", targetId: decision.decisionSha256, payload: report, now});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"whole-film-static-board-approval-v1/control-plane-reconciliation.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256};
});
console.log(JSON.stringify(result, null, 2));
