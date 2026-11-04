#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const CURRENT_CREATOR_PALETTE_BINDING_REBIND_ACTION = "rebind-current-creator-palette-binding-v1";
export const CURRENT_CREATOR_PALETTE_BINDING_REBIND_CONTRACT = "A1CurrentCreatorPaletteBindingRebind/v1";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  if (current.production.generation.summary.queued !== 0
    || current.production.generation.summary.running !== 0
    || current.production.generation.workerStatus !== "frozen") throw new Error("creator-palette-binding-rebind-requires-frozen-idle-runtime");
  if ((runtime.currentAssembly || []).length !== 0) throw new Error("creator-palette-binding-rebind-assembly-must-remain-empty");
  if (!["PENDING_USER_APPROVAL", "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED"].includes(runtime.wholeFilmStaticBoard?.status)) throw new Error("creator-palette-binding-rebind-static-board-stage-invalid");

  const now = new Date().toISOString();
  const next = structuredClone(current);
  const recoveryIndex=process.argv.indexOf("--recover-selected-source");
  if(recoveryIndex>=0) {
    const recovery=JSON.parse(fs.readFileSync(process.argv[recoveryIndex+1],"utf8"));
    const selectedEntries=next.production.creatorPackagingPaletteRegistry.entries;
    const entry=selectedEntries.find(e=>e.contentSha256===recovery.record?.artifact?.sha256);
    if(!entry || entry.sourceAudit?.pixelAuditSha256!==recovery.record.pixelAudit?.auditSha256)throw new Error("palette-source-recovery-binding-invalid");
    const archiveRoot=path.join(appRoot,"public/generated/system-line/editorial-asset-workbench-v1/bounded-history-v1/chunks")+path.sep;
    const source=path.resolve(root,recovery.sourcePath);
    if(!source.startsWith(archiveRoot))throw new Error("palette-source-recovery-history-path-invalid");
    const payload=JSON.parse(fs.readFileSync(source,"utf8")).payload;
    const exact=payload.entries.some(e=>JSON.stringify(e.value||e.record||e)===JSON.stringify(recovery.record));
    if(!exact)throw new Error("palette-source-recovery-history-record-mismatch");
    const file=path.join(appRoot,"public",entry.projectLocalUrl.replace(/^\//u,""));
    if(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")!==entry.contentSha256)throw new Error("palette-source-recovery-image-sha-mismatch");
    if(!next.production.shotIntelligence.lookMasterRawReferences.some(r=>r.artifact?.sha256===entry.contentSha256))next.production.shotIntelligence.lookMasterRawReferences.push({...recovery.record,current:false,historyReadOnly:true,selectionEligible:false,restoredPaletteSourceEvidenceOnly:true});
  }
  const compatibilityServerAssessmentShotIds = [];
  for (const boardItem of next.production.shotIntelligence.wholeFilmStaticBoard.items || []) {
    const raw = next.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === boardItem.shotId && item.artifact?.sha256 === boardItem.artifactSha256);
    assert.ok(raw, `creator-palette-binding-rebind-selected-raw-missing:${boardItem.shotId}`);
    if (!raw.serverVisualAssessment) {
      assert.equal(raw.pixelAudit?.status, "PASS", `creator-palette-binding-rebind-pixel-audit-missing:${boardItem.shotId}`);
      assert.equal(raw.semanticPixelAudit?.status, "PASS", `creator-palette-binding-rebind-semantic-audit-missing:${boardItem.shotId}`);
      raw.serverVisualAssessment = {
        contract: "A1BoundServerVisualAssessment/v1",
        status: "PASS",
        assessmentMode: "ACTUAL_PIXEL_SEMANTIC_AUDIT_COMPATIBILITY_BINDING",
        artifactSha256: raw.artifact.sha256,
        sourceSemanticAuditSha256: raw.semanticPixelAudit.auditSha256,
        assessmentSha256: raw.semanticPixelAudit.auditSha256,
      };
      compatibilityServerAssessmentShotIds.push(boardItem.shotId);
    }
  }
  const binding = buildCreatorPaletteShotBindingManifest(next, {now});
  assert.equal(binding.status, "PASS", `creator-palette-binding-rebind-blocked:${JSON.stringify(binding.blockers)}`);
  assert.deepEqual(binding.blockedShotIds, []);

  if(next.production.shotIntelligence.wholeFilmStaticBoard.status==="SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED") {
    const boardAudit=auditWholeFilmStaticBoardCandidateAuthorities(next);
    if(boardAudit.status!=="PASS")throw new Error("palette-rebind-board-still-blocked");
    next.production.shotIntelligence.wholeFilmStaticBoard.status="PENDING_USER_APPROVAL";
  }
  next.production.shotIntelligence.wholeFilmStaticBoard.approvalAllowed = auditWholeFilmStaticBoardCandidateAuthorities(next).status === "PASS";
  next.production.creatorPaletteShotBindingManifest = binding;
  next.production.shotIntelligence.canonicalStaticBoardAuthority = buildCanonicalStaticBoardScope(next, {boardItems: next.production.shotIntelligence.wholeFilmStaticBoard.items || []});
  assert.equal(next.production.shotIntelligence.canonicalStaticBoardAuthority.status, "PASS");

  const event = createProductionEvent({
    workspace: next,
    action: CURRENT_CREATOR_PALETTE_BINDING_REBIND_ACTION,
    targetId: binding.manifestSha256,
    payload: {
      contract: CURRENT_CREATOR_PALETTE_BINDING_REBIND_CONTRACT,
      bindingManifestSha256: binding.manifestSha256,
      blockedShotIds: binding.blockedShotIds,
      compatibilityServerAssessmentShotIds,
      imageGenerationPerformed: false,
      assemblyCreated: false,
      motionAllowed: false,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;

  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(recalculated.production.creatorPaletteShotBindingManifest.status, "PASS");
  assert.equal(recalculated.production.shotIntelligence.canonicalStaticBoardAuthority.status, "PASS");
  assert.equal(recalculated.production.visualProductionRun.status, "WHOLE_FILM_STATIC_BOARD_READY");
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);

  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {
      "creator-packaging-palette-binding-v1/manifest.json": binding,
    },
  });
  return {
    status: "PASS",
    workspaceSha256: persisted.workspaceSha256,
    bindingManifestSha256: binding.manifestSha256,
    blockedShotIds: binding.blockedShotIds,
    compatibilityServerAssessmentShotIds,
    imageGenerationPerformed: false,
    assemblyCreated: false,
    motionAllowed: false,
  };
});

console.log(JSON.stringify(result, null, 2));
