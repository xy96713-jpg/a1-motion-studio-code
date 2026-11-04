#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

import {
  A1_CREATOR_PACKAGING_PALETTE_SYSTEM_APPROVED,
  assertCreatorPaletteSelectionNotBindingBlocked,
  auditCreatorPaletteCurrentAestheticGate,
  buildCreatorPaletteActualModeMigration,
} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {compileGenerationDispatch} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {
  buildCreatorPaletteBoundRepairTransition,
  PALETTE_REPAIR_NOOP_ADVANCE_ACTION,
  buildPaletteRepairNoopAdvancePayload,
  isRepeatedPaletteRepairNoopAdvance,
} from "./compile-creator-packaging-palette-bound-repair-v1.mjs";

const root = "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1";
const read = (file) => JSON.parse(fs.readFileSync(`${root}/${file}`, "utf8"));
const workspace = read("workspace.json");
const binding = read("creator-packaging-palette-binding-v1/manifest.json");
const repair = read("incremental-repair-executor-v1/repair-manifest.json");
const registry = read("creator-packaging-palette-review-v1/registry.json");

const packageRepair = new Map(repair.entries.filter((entry) => entry.reasonCodes?.includes("PACKAGE_ROUTE")).map((entry) => [entry.shotId, entry]));
const canonicalPackageCount = workspace.production.canonicalCreatorPackagingSequence.decisions.filter((entry) => entry.packageDecision === "PACKAGE").length;
const canonicalNoPackageCount = workspace.production.canonicalCreatorPackagingSequence.decisions.filter((entry) => entry.packageDecision === "NO_PACKAGE").length;
assert.equal(repair.status, binding.blockedShotIds.length ? "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED" : "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED");
assert.deepEqual({packageCount: repair.summary.packageCount, noPackageCount: repair.summary.noPackageCount, readyForGenerationCount: repair.summary.readyForGenerationCount}, {packageCount: canonicalPackageCount, noPackageCount: canonicalNoPackageCount, readyForGenerationCount: binding.blockedShotIds.length});
assert.equal(repair.summary.cachedPassCount, binding.passCount);
assert.equal(repair.entries.find((entry) => entry.shotId === "ED-15").packageDecision, "NO_PACKAGE");
assert.equal(repair.entries.find((entry) => entry.shotId === "ED-15").route, "PRESENTER_BASE");
assert.equal(repair.entries.find((entry) => entry.shotId === "ED-15").staticPackageBoardBlocking, false);
assert.equal(repair.generationLedger.attemptedGeneratedCount, repair.generationLedger.candidateShas.length);
assert.equal(repair.generationLedger.adoptedGeneratedCount, 0);
assert.equal(repair.generationLedger.rejectedGeneratedCount + repair.generationLedger.pendingGeneratedCount, repair.generationLedger.attemptedGeneratedCount);
for (const entry of binding.entries) {
  const projected = packageRepair.get(entry.shotId);
  assert.ok(projected, `repair projection exists:${entry.shotId}`);
  assert.equal(projected.bindingFailureProjection.bindingManifestSha256, binding.manifestSha256, `binding sha projected:${entry.shotId}`);
  assert.deepEqual(projected.bindingFailureProjection.blockerCodes, entry.blockers, `binding blockers projected:${entry.shotId}`);
}
console.log("PASS binding failure projects deterministically into repair manifest");

const migrationFixture = structuredClone(workspace);
const migrationShotId = migrationFixture.production.canonicalCreatorPackagingSequence.decisions.find((item) => item.packageDecision === "PACKAGE")?.shotId;
const migrationPlan = migrationFixture.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === migrationShotId);
const migrationRaw = migrationFixture.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === migrationShotId && item.artifact?.sha256 === migrationPlan?.provisionalWholeFilmBoardSelection?.artifact?.sha256);
assert.ok(migrationRaw, `migration fixture raw exists:${migrationShotId}`);
delete migrationRaw.pixelAudit.actualPixelMetrics.visualFingerprint;
delete migrationRaw.goldenFilmMaturityAudit;
delete migrationRaw.actualPixelAssessment;
delete migrationRaw.actualPixelAssessmentSha256;
delete migrationRaw.fullLookMasterStatus;
delete migrationRaw.classification;
delete migrationRaw.referencePackagingContract;
delete migrationRaw.productionMethod;
delete migrationRaw.artifact.referencePackagingContract;
delete migrationRaw.artifact.productionMethod;
migrationRaw.pixelAudit.actualPixelMetrics.transparentFraction = 0.9;
migrationRaw.pixelAudit.actualPixelMetrics.alphaMean = 0.1;
migrationRaw.pixelAudit.actualPixelMetrics.averageLuminance = 0.2;
const migrationA = buildCreatorPaletteActualModeMigration(migrationFixture, {now: "2026-08-09T00:00:00.000Z"});
const migrationB = buildCreatorPaletteActualModeMigration(migrationFixture, {now: "2026-08-09T00:00:00.000Z"});
assert.equal(migrationA.migrationSha256, migrationB.migrationSha256);
assert.equal(migrationA.entries.find((entry) => entry.shotId === migrationShotId)?.status, "MIGRATED_ONCE");
assert.equal(migrationA.entries.find((entry) => entry.shotId === migrationShotId)?.visualFingerprint.startsWith("OVERLAY|"), true);
console.log("PASS legacy actual-mode migration is one-shot and hash-stable");

const systemRegistry = structuredClone(registry);
systemRegistry.status = A1_CREATOR_PACKAGING_PALETTE_SYSTEM_APPROVED;
systemRegistry.entries = systemRegistry.entries.map((entry) => ({...entry, approvalState: systemRegistry.selection.selectedByLane && Object.values(systemRegistry.selection.selectedByLane).includes(entry.paletteEntryId) ? "SYSTEM_APPROVED" : entry.approvalState}));
const syntheticBlockedBinding = structuredClone(binding);
syntheticBlockedBinding.entries = syntheticBlockedBinding.entries.map((entry) => entry.shotId === "ED-14"
  ? {...entry, status: "BLOCKED", blockers: ["TEST_BINDING_BLOCKED"]}
  : entry);
assert.throws(() => assertCreatorPaletteSelectionNotBindingBlocked({registry: systemRegistry, bindingManifest: syntheticBlockedBinding}), /binding-blocked/);
console.log("PASS system-approved palette cannot retain a binding-blocked master");

const refs = workspace.production.shotIntelligence.lookMasterRawReferences;
const currentEd14Sha = binding.entries.find((entry) => entry.shotId === "ED-14")?.actualShotCandidateSha256;
const currentEd14 = refs.find((entry) => entry.artifact?.sha256 === currentEd14Sha);
assert.ok(currentEd14?.artifact?.sha256);
assert.equal(auditCreatorPaletteCurrentAestheticGate(currentEd14).status, "PASS", "reused ED-14 candidate passes current aesthetic gate");
const staleWarmEd14 = refs.find((entry) => entry.artifact?.sha256 === "79f7e1cc07011e7a8b74b21bbd4b42fbbe82c37ec0b63e50cfa43dcf4b7bb454");
assert.equal(auditCreatorPaletteCurrentAestheticGate(staleWarmEd14).status, "BLOCKED", "stale warm ED-14 candidate remains blocked");
const currentEd16Sha = binding.entries.find((entry) => entry.shotId === "ED-16")?.actualShotCandidateSha256;
const currentEd16 = refs.find((entry) => entry.artifact?.sha256 === currentEd16Sha);
assert.equal(auditCreatorPaletteCurrentAestheticGate(currentEd16).status, "PASS", "current ED-16 replacement passes current aesthetic gate");
const staleWarmEd16 = refs.find((entry) => entry.artifact?.sha256 === "d144bc403ba16c51de2c5453a90772de8e63a29b465a077eeea3da4bd33d2e4e");
assert.equal(auditCreatorPaletteCurrentAestheticGate(staleWarmEd16).status, "BLOCKED", "stale warm ED-16 candidate remains blocked");
console.log("PASS reused old candidate is checked by current aesthetic gate");

const noReady = {...repair, entries: repair.entries.map((entry) => ({...entry, status: "CACHED_PASS", preflightStatus: "PASS"}))};
const dispatch = compileGenerationDispatch(noReady, {automaticDispatchAllowed: true, workerStatus: "starting"});
assert.equal(dispatch.jobs.length, 0);
console.log("PASS no generation-ready entries produce no worker jobs");

const noopWorkspace = structuredClone(workspace);
noopWorkspace.production.eventLedger.lastEventId = "event-noop-1";
const noopProjected = structuredClone(workspace);
noopProjected.production.authority.nextAction = {id: "repair-workbench-current-authority"};
const noopPayload = buildPaletteRepairNoopAdvancePayload(noopProjected);
const noopTargetId = "repair-manifest-sha";
const noopEvent = {
  eventId: "event-noop-1",
  action: PALETTE_REPAIR_NOOP_ADVANCE_ACTION,
  targetId: noopTargetId,
  payloadSha256: crypto.createHash("sha256").update(JSON.stringify(noopPayload)).digest("hex"),
};
assert.equal(isRepeatedPaletteRepairNoopAdvance({workspace: noopWorkspace, lastEvent: noopEvent, targetId: noopTargetId, payload: noopPayload}), true);
assert.equal(isRepeatedPaletteRepairNoopAdvance({workspace: noopWorkspace, lastEvent: {...noopEvent, targetId: "changed-target"}, targetId: noopTargetId, payload: noopPayload}), false);
assert.equal(isRepeatedPaletteRepairNoopAdvance({workspace: noopWorkspace, lastEvent: {...noopEvent, eventId: "stale-event"}, targetId: noopTargetId, payload: noopPayload}), false);
const changedPayload = {...noopPayload, nextActionId: "changed-next-action"};
assert.equal(isRepeatedPaletteRepairNoopAdvance({workspace: noopWorkspace, lastEvent: noopEvent, targetId: noopTargetId, payload: changedPayload}), false);
console.log("PASS second identical palette-repair NOOP stalls without masking changed evidence");

console.log(JSON.stringify({status: "PASS", packageCount: binding.packageShotCount, bindingStatus: binding.status, repairSummary: repair.summary}, null, 2));

const closedRepairFixture=structuredClone(workspace);
closedRepairFixture.production.creatorPaletteBoundRepair.repairInputSha256="force-pure-recompile-test";
const closedTransition=buildCreatorPaletteBoundRepairTransition(closedRepairFixture,{now:"2026-09-06T00:00:00.000Z"});
if(closedTransition.bindingManifest?.blockedShotIds.length===0)assert.equal(closedTransition.workspace.production.shotIntelligence.wholeFilmStaticBoard.status,workspace.production.shotIntelligence.wholeFilmStaticBoard.status,"closed palette repair must preserve current board review status");
