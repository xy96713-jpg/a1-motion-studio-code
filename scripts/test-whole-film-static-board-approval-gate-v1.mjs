#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";

import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditWholeFilmStaticBoardApprovalEvidence, auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";

const boardSha256 = "a".repeat(64);
const incomplete = auditWholeFilmStaticBoardApprovalEvidence({
  boardSha256,
  approvedAt: "2026-08-09T22:54:45.115Z",
  approvalAuthority: {actor: "user-delegated-a1-visual-director"},
}, {expectedBoardSha256: boardSha256});
assert.equal(incomplete.status, "BLOCK");
assert.equal(incomplete.legalApprovalFound, false);
assert.deepEqual(incomplete.missingEvidence, ["USER_QUOTE_MISSING", "USER_MESSAGE_ID_MISSING"]);

const complete = auditWholeFilmStaticBoardApprovalEvidence({
  boardSha256,
  approvedAt: "2026-08-09T22:54:45.115Z",
  userQuote: "我确认这张全片静态板，可以进入 Assembly。",
  userMessageId: "msg-user-approval-1",
}, {expectedBoardSha256: boardSha256});
assert.equal(complete.status, "PASS");
assert.equal(complete.legalApprovalFound, true);
assert.deepEqual(complete.missingEvidence, []);

const live = readProjectWorkspace(path.resolve(import.meta.dirname, "../apps/studio-next"));
const currentCandidateGate = auditWholeFilmStaticBoardCandidateAuthorities(live);
assert.equal(currentCandidateGate.status, "PASS");
assert.equal(currentCandidateGate.storyboardPixelConsistency.status, "PASS");
const modeDrift = structuredClone(live);
modeDrift.production.shotIntelligence.wholeFilmStaticBoard.items[0].assemblyMode = "FORGED_MODE";
const blockedCandidateGate = auditWholeFilmStaticBoardCandidateAuthorities(modeDrift);
assert.equal(blockedCandidateGate.status, "BLOCK");
assert.ok(blockedCandidateGate.storyboardPixelConsistency.blockedShotIds.includes(modeDrift.production.shotIntelligence.wholeFilmStaticBoard.items[0].shotId));

const compositePixelAuditDrift = structuredClone(live);
const compositePixelItem = compositePixelAuditDrift.production.shotIntelligence.wholeFilmStaticBoard.items.find((item) => item.styleLineage?.pixelTreatment === "RECOMPOSED");
compositePixelItem.styleLineage.compositeVisualAudit.actualPixelsViewed = false;
const compositePixelBlockedGate = auditWholeFilmStaticBoardCandidateAuthorities(compositePixelAuditDrift);
assert.equal(compositePixelBlockedGate.status, "BLOCK");
assert.ok(compositePixelBlockedGate.blockedShotIds.includes(compositePixelItem.shotId));

console.log("whole-film-static-board-approval-gate-v1: PASS");
