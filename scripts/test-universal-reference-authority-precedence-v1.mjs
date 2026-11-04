#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";
import {assertUniversalReferenceAuthorityPrecedence} from "../apps/studio-next/src/lib/a1-universal-reference-authority-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {repairUniversalReferenceAuthority} from "./repair-universal-reference-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const migrationPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/universal-reference-packaging-migration.json");
const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
const boardReportPath = path.join(publicDir, "whole-film-static-board-v1/report.json");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");

const workspace = readProjectWorkspace(appRoot);
const gate = workspace.production.universalReferencePackagingGate;
const migration = readJson(migrationPath);
const maturity = readJson(maturityPath);
const boardReport = readJson(boardReportPath);
const currentPhase = readJson(currentPhasePath);
const precedence = assertUniversalReferenceAuthorityPrecedence({
  canonical: {current: true, authorityScope: "CURRENT"},
  attachmentGate: gate,
  maturity: {current: true, overallStatus: "WHOLE_FILM_STATIC_BOARD"},
  history: {current: true, authorityScope: "CURRENT"},
});

assert.equal(precedence.status, "BLOCKED");
assert.equal(precedence.assemblyCreationAllowed, false);
assert.equal(gate.status, "BLOCKED");
assert.deepEqual(gate.authorityPrecedence, ["CURRENT_ROLLBACK_CANONICAL_AUTHORITY", "UNIVERSAL_REFERENCE_ATTACHMENT_GATE", "MATURITY_RUN", "HISTORY_READ_ONLY"]);
assert.equal(migration.current, true);
assert.deepEqual({packageCount: migration.packageCount, noPackageCount: migration.noPackageCount}, {packageCount: 13, noPackageCount: 21});
assert.equal(migration.actualAttachmentCoverageCount, 0);
assert.equal(migration.generationAllowed, false);
assert.equal(migration.assemblyCreated, false);
assert.equal(maturity.overallStatus, "CURRENT_UNIVERSAL_REFERENCE_MIGRATION_BLOCKED");
assert.equal(maturity.fullLookMasterActualPixelPassCount, 7);
assert.deepEqual(maturity.blockedShotIds, ["ED-08", "ED-13", "ED-14", "ED-19", "ED-31"]);
assert.equal(boardReport.current, false);
assert.equal(boardReport.historyReadOnly, true);
assert.equal(boardReport.authorityScope, "HISTORY_READ_ONLY");
assert.equal(boardReport.assemblyCreationAllowed, false);
assert.equal(currentPhase.status, "CURRENT_UNIVERSAL_REFERENCE_MIGRATION_BLOCKED");
assert.equal(currentPhase.authority.currentStage, "universal-reference-packaging-migration-blocked");
assert.equal(currentPhase.authority.nextAction.id, "COMPLETE_UNIVERSAL_REFERENCE_MIGRATION");
assert.equal(currentPhase.authority.packagingAutomation.currentStage, "universal-reference-packaging-migration-blocked");
assert.deepEqual(currentPhase.authority.packagingAutomation.targetShotIds, ["ED-08", "ED-13", "ED-14", "ED-19", "ED-31"]);
assert.equal(currentPhase.reviewDecision.requiresExplicitApproval, false);
assert.equal(currentPhase.boardReview.approvalAllowed, false);
assert.equal(workspace.production.packagingAutomation.status, "WHOLE_FILM_REFERENCE_MIGRATION_BLOCKED");
assert.equal(workspace.production.packagingAutomation.currentStage, "universal-reference-packaging-migration-blocked");
assert.deepEqual(workspace.production.packagingAutomation.targetShotIds, ["ED-08", "ED-13", "ED-14", "ED-19", "ED-31"]);
assert.equal(workspace.production.packagingAutomation.generationFreeze.frozen, true);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(derivePackagingLifecycleProjection(workspace).status, "WHOLE_FILM_REFERENCE_MIGRATION_BLOCKED");
assert.equal(sha256(fs.readFileSync(path.join(artifactDir, "golden-film-visual-system-maturity-v1/universal-reference-packaging-migration.json"))), sha256(fs.readFileSync(migrationPath)));

const apiResponse = await fetch("http://127.0.0.1:4311/api/system-line/editorial-asset-workbench");
assert.equal(apiResponse.status, 200);
const api = await apiResponse.json();
assert.equal(api.ok, true);
for (const projection of [api.report, api.report.gates, api.report.creatorPackagingPalette, api.report.summary, api.report.packagingLaneSummary]) {
  assert.deepEqual({packageCount: projection.packageCount, noPackageCount: projection.noPackageCount}, {packageCount: 13, noPackageCount: 21});
}
assert.equal(api.report.status, "WHOLE_FILM_REFERENCE_MIGRATION_BLOCKED");
assert.equal(api.report.gates.assemblyCreationAllowed, false);
assert.equal(api.report.gates.productionWired, false);
assert.equal(api.report.gates.motionApproved, false);
assert.equal(api.report.packagingLaneSummary.authorityPass, false);

const noop = repairUniversalReferenceAuthority({now: "2099-01-01T00:00:00.000Z"});
assert.equal(noop.status, "NOOP_ALREADY_UNIVERSAL_REFERENCE_AUTHORITY");
assert.equal(noop.workspaceSha256, workspace.workspaceSha256);
assert.equal(noop.migrationSha256, migration.manifestSha256);

console.log(JSON.stringify({status: "PASS", test: "universal-reference-authority-precedence-v1", gateStatus: gate.status, packageCount: migration.packageCount, noPackageCount: migration.noPackageCount, blockedShotIds: migration.blockedShotIds, fullLookMasterActualPixelPassCount: migration.fullLookMasterActualPixelPassCount, actualAttachmentCoverageCount: migration.actualAttachmentCoverageCount, idempotence: noop.status}, null, 2));
