#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {assertCreatorPackagingPaletteRegistry, buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("static-board-projection-reconcile-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`static-board-projection-reconcile-cas:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("static-board-projection-reconcile-runtime-not-frozen-idle");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("static-board-projection-reconcile-assembly-must-remain-empty");
  if (current.production.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("static-board-projection-reconcile-user-boundary-invalid");
  const board = current.production.shotIntelligence.wholeFilmStaticBoard;
  if (board.status !== "PENDING_USER_APPROVAL" || board.approvalAllowed !== true) throw new Error("static-board-projection-reconcile-board-not-ready");

  const now = new Date().toISOString();
  const next = structuredClone(current);
  const sequence = next.production.canonicalCreatorPackagingSequence;
  const priorRegistry = next.production.creatorPackagingPaletteRegistry;
  const migratedRegistryBody = {...priorRegistry, sequenceSha256: sequence.sequenceSha256, registrySha256: undefined};
  const migratedRegistry = {...migratedRegistryBody, registrySha256: sha256(migratedRegistryBody)};
  assertCreatorPackagingPaletteRegistry(migratedRegistry);
  next.production.creatorPackagingPaletteRegistry = migratedRegistry;
  const bindingManifest = buildCreatorPaletteShotBindingManifest(next, {now});
  if (bindingManifest.status !== "PASS") throw new Error(`static-board-projection-reconcile-binding-blocked:${JSON.stringify({blockers: bindingManifest.blockers, entries: bindingManifest.entries.filter((entry) => entry.status !== "PASS")})}`);
  next.production.creatorPaletteShotBindingManifest = bindingManifest;
  const canonicalScope = buildCanonicalStaticBoardScope(next, {boardItems: board.items});
  if (canonicalScope.status !== "PASS") throw new Error(`static-board-projection-reconcile-scope-blocked:${JSON.stringify(canonicalScope)}`);
  next.production.shotIntelligence.canonicalStaticBoardAuthority = canonicalScope;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
  if (gate.status !== "PASS") throw new Error(`static-board-projection-reconcile-gate-blocked:${JSON.stringify(gate)}`);
  recalculated.production.shotIntelligence.wholeFilmBatchRecommendation = {...recalculated.production.shotIntelligence.wholeFilmBatchRecommendation, candidateAuthorityAudit: gate, staticBoard: structuredClone(recalculated.production.shotIntelligence.wholeFilmStaticBoard), assemblyCreationAllowed: false, layerReconstructionAllowed: false, motionAllowed: false, nextUserGate: "WHOLE_FILM_STATIC_BOARD"};
  const currentBoard = recalculated.production.shotIntelligence.wholeFilmStaticBoard;
  const report = {
    contract: "A1WholeFilmStaticBoardFinalizationReport/v1",
    status: "PASS",
    stage: "WHOLE_FILM_STATIC_BOARD_READY",
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    userApprovalRequired: true,
    userVisualApproval: "NOT_APPROVED",
    packageShotIds: currentBoard.items.map((item) => item.shotId),
    noPackageCount: sequence.decisions.filter((decision) => decision.packageDecision === "NO_PACKAGE").length,
    styleLineageAuthority: currentBoard.styleLineageAuthority,
    items: currentBoard.items,
    board: {publicUrl: currentBoard.publicUrl, sha256: currentBoard.sha256, width: currentBoard.width, height: currentBoard.height},
    timelineBoard: {...currentBoard.timelineBoard, itemCount: currentBoard.timelineBoard.items.length},
    storyboardPixelConsistency: currentBoard.storyboardPixelConsistency,
    canonicalStaticBoardAuthority: canonicalScope,
    creatorPaletteShotBindingManifestSha256: bindingManifest.manifestSha256,
    formalAssemblyCount: 0,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    motionAllowed: false,
    generatedAt: now,
  };
  const reconciliation = {
    contract: "A1CurrentStaticBoardProjectionReconciliation/v2",
    status: "PASS",
    sourceWorkspaceSha256: current.workspaceSha256,
    priorRegistrySequenceSha256: priorRegistry.sequenceSha256,
    currentSequenceSha256: sequence.sequenceSha256,
    migratedRegistrySha256: migratedRegistry.registrySha256,
    bindingManifestSha256: bindingManifest.manifestSha256,
    canonicalStaticBoardAuthoritySha256: canonicalScope.auditSha256,
    boardSha256: currentBoard.sha256,
    timelineBoardSha256: currentBoard.timelineBoard.sha256,
    pixelBytesChanged: false,
    userVisualApproval: "NOT_APPROVED",
    assemblyCreated: false,
    motionPerformed: false,
    reconciledAt: now,
  };
  const event = createProductionEvent({workspace: recalculated, action: "reconcile-current-static-board-projections-v2", targetId: currentBoard.sha256, payload: reconciliation, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `static-board-projections-v2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "whole-film-static-board-v1/report.json": report,
      "whole-film-static-board-v1/projection-reconciliation-v2.json": reconciliation,
      "creator-packaging-palette-review-v1/registry.json": migratedRegistry,
      "creator-packaging-palette-binding-v1/manifest.json": bindingManifest,
    },
  });
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, boardSha256: currentBoard.sha256, timelineBoardSha256: currentBoard.timelineBoard.sha256, bindingManifestSha256: bindingManifest.manifestSha256, canonicalScopeStatus: canonicalScope.status, candidateGateStatus: gate.status, userVisualApproval: "NOT_APPROVED", pixelBytesChanged: false};
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
