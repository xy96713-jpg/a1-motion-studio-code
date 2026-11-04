#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {applyDirectLookMasterAssemblyApproval, packagingProductionAllowed} from "../apps/studio-next/src/lib/a1-packaging-review-controller-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspaceFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const beforeSha256 = crypto.createHash("sha256").update(fs.readFileSync(workspaceFile)).digest("hex");
const workspace = readProjectWorkspace(path.join(root, "apps/studio-next"));
const current = structuredClone(workspace);
const liveBatch = current.production.shotIntelligence.wholeFilmBatchRecommendation;
assert.equal(current.production.visualProductionRun.status, "WHOLE_FILM_STATIC_BOARD_READY");
assert.equal(current.production.authority.currentStage, "whole-film-static-board-review");
assert.equal(current.production.authority.nextAction.id, "review-whole-film-static-board");
assert.equal(liveBatch?.status, "WHOLE_FILM_STATIC_BOARD_READY");
assert.equal(liveBatch?.exceptions?.length, 0);
assert.equal(liveBatch?.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
assert.equal(current.production.shotIntelligence.wholeFilmStaticBoard?.status, "PENDING_USER_APPROVAL");
assert.equal(current.production.shotIntelligence.wholeFilmStaticBoard?.decision, null);
assert.deepEqual(current.production.packagingLifecycleProjection?.blockedShotIds, []);
assert.equal(current.production.packagingLifecycleProjection?.approvalAllowed, true);
assert.notEqual(current.production.shotIntelligence.wholeFilmBatchRecommendation?.reconciliationRequired, true);
assert.equal(packagingProductionAllowed(current), false);
assert.throws(
  () => applyDirectLookMasterAssemblyApproval(current, {shotId: "ED-10", now: "2026-08-05T08:30:00.000Z"}),
  /direct-look-master-assembly-not-ready|whole-film-static-board/u,
);
const historicalFixture = structuredClone(workspace);
historicalFixture.production.shotIntelligence.status = "LOOK_MASTER_CANDIDATES_READY";
historicalFixture.production.shotIntelligence.wholeFilmBatchRecommendation = {...historicalFixture.production.shotIntelligence.wholeFilmBatchRecommendation, status: "PARTIAL_WITH_EXCEPTIONS", assemblyCreationAllowed: false, nextUserGate: null};
historicalFixture.production.visualProductionRun = {...historicalFixture.production.visualProductionRun, status: "CANDIDATE_SELECTION_PENDING"};
assert.throws(() => applyDirectLookMasterAssemblyApproval(historicalFixture, {shotId: "ED-10", now: "2026-08-05T08:30:00.000Z"}), /direct-look-master-assembly-not-ready|whole-film-static-board/u);
const afterSha256 = crypto.createHash("sha256").update(fs.readFileSync(workspaceFile)).digest("hex");
assert.equal(afterSha256, beforeSha256, "direct-approval gate regression must not persist the workspace");

console.log(JSON.stringify({
  status: "PASS",
  userApproval: "WHOLE_FILM_STATIC_BOARD_REQUIRED",
  directAssemblyBlocked: true,
  wholeFilmStaticBoardGateCurrent: true,
  historicalPerShotBypassBlocked: true,
  nextUserGate: liveBatch?.nextUserGate,
  workspaceUnchanged: afterSha256 === beforeSha256,
}, null, 2));
