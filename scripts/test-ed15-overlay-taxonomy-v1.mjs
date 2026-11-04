#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {runEd15OverlayTaxonomyAdjudication} from "./adjudicate-ed15-overlay-taxonomy-v1.mjs";
import {assertCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const maturityRelativePath = path.join("golden-film-visual-system-maturity-v1", "maturity-run.json");
const maturityArtifactPath = path.join(artifactDir, maturityRelativePath);
const maturityPublicPath = path.join(publicDir, maturityRelativePath);
const repairRelativePath = path.join("incremental-repair-executor-v1", "repair-manifest.json");
const repairArtifactPath = path.join(artifactDir, repairRelativePath);
const repairPublicPath = path.join(publicDir, repairRelativePath);

const workspace = readProjectWorkspace(appRoot);
const maturityBytes = fs.readFileSync(maturityPublicPath);
const maturity = readJson(maturityPublicPath);
const {maturityRunSha256, ...maturityBody} = maturity;
const primitiveSwitchExhausted = maturity.overallStatus === "ED15_OVERLAY_PRIMITIVE_SWITCH_EXHAUSTED";
const taxonomyReauthorReady = maturity.overallStatus === "ED15_OVERLAY_TAXONOMY_REAUTHOR_READY";
const taxonomyReauthorExhausted = maturity.overallStatus === "ED15_OVERLAY_TAXONOMY_REAUTHOR_EXHAUSTED";
const currentNextAction = taxonomyReauthorReady
  ? "DISPATCH_ED15_OVERLAY_TAXONOMY_REAUTHOR_WAVE_MAX_2"
  : taxonomyReauthorExhausted
    ? "ACCEPT_ED15_NO_PACKAGE_OR_USER_REWRITE_SOURCE"
    : primitiveSwitchExhausted ? "REAUTHOR_ED15_OVERLAY_TAXONOMY_OR_ACCEPT_NO_PACKAGE" : "DISPATCH_ED15_DUAL_GAP_OVERLAY_REPAIR_WAVE_MAX_2";
assert.equal(sha256(maturityBytes), sha256(fs.readFileSync(maturityArtifactPath)), "maturity artifact/public bytes must match");
assert.equal(sha256(Buffer.from(JSON.stringify(maturityBody))), maturityRunSha256, "maturity self-hash must match canonical JSON");
assert.equal(sha256(fs.readFileSync(repairPublicPath)), sha256(fs.readFileSync(repairArtifactPath)), "repair artifact/public bytes must match");

const plans = workspace.production.shotIntelligence.packageLookMasterPlans;
const ed15Plan = plans.find((item) => item.shotId === "ED-15");
const ed15Context = workspace.production.shotIntelligence.videoPackagingContexts.items.find((item) => item.shotId === "ED-15");
const visualActor = ed15Plan.typographyVisualContract;
assert.equal(ed15Plan.assemblyMode, "OVERLAY");
assert.equal(ed15Plan.presentationMode, "OVERLAY");
assert.equal(ed15Plan.canonicalCreatorDecision.frameOccupation, "OVERLAY");
assert.equal(ed15Plan.baseVisualCarrier, "PRESENTER_BASE");
assert.deepEqual(ed15Plan.protectedPhrases, ["讨厌什么句式", "带到哪里"]);
assert.equal(visualActor.contract, "A1PresenterAwareDualGapTypographyActor/v1");
assert.equal(visualActor.status, "PASS");
assert.equal(visualActor.laneCRequired, false);
assert.equal(visualActor.fullFrameTakeoverLegal, false);
assert.deepEqual(visualActor.visiblePhrases, ["讨厌什么句式", "带到哪里"]);
assert.equal(ed15Context.assemblyMode, "OVERLAY");
assert.equal(ed15Context.presentationMode, "OVERLAY");
assert.equal(ed15Context.baseVisualCarrier, "PRESENTER_BASE");
assert.deepEqual(ed15Context.protectedPhrases, ["讨厌什么句式", "带到哪里"]);

const geometry = ed15Context.holdFrameGeometry;
assert.equal(geometry.sourceHoldFrameSha256, "ccb19f607bf6de09ad93f2bc2946381785c69f01ee621c16f1730892953d9d15");
assert.equal(geometry.measurementMethod, "ACTUAL_HOLD_FRAME_PIXEL_REVIEW");
assert.equal(geometry.noTemplateDefaults, true);
for (const key of ["subjectBounds", "protectedBounds", "microphoneAndBoomExclusion", "availableRegions", "safeZones"]) assert.ok(geometry[key], `ED-15 geometry must include ${key}`);
for (const key of ["face", "eyes", "mouth", "body"]) assert.ok(geometry.protectedBounds[key], `ED-15 geometry must protect ${key}`);
for (const key of ["microphone", "boom"]) assert.ok(geometry.microphoneAndBoomExclusion[key], `ED-15 geometry must exclude ${key}`);

const repair = readJson(repairPublicPath);
const ed15Repair = repair.entries.find((entry) => entry.shotId === "ED-15");
assert.equal(ed15Repair.planSha256, ed15Plan.planSha256);
assert.equal(ed15Repair.status, "READY_FOR_GENERATION");
assert.equal(ed15Repair.nextAction, "PREPARE_CANONICAL_MODE_REPAIR_NO_DISPATCH");
assert.equal(ed15Repair.planMetadataMigration.auditBytesUnchanged, true);
assert.equal(ed15Repair.planMetadataMigration.generationPerformed, false);

const binding = workspace.production.creatorPaletteShotBindingManifest;
assert.equal(binding.status, "BLOCKED");
assert.equal(binding.passCount, 13);
assert.deepEqual(binding.blockedShotIds, ["ED-15"]);
assertCreatorPaletteShotBindingManifest(binding, {workspace, requirePass: false});

assert.equal(maturity.overallStatus, taxonomyReauthorReady ? "ED15_OVERLAY_TAXONOMY_REAUTHOR_READY" : taxonomyReauthorExhausted ? "ED15_OVERLAY_TAXONOMY_REAUTHOR_EXHAUSTED" : primitiveSwitchExhausted ? "ED15_OVERLAY_PRIMITIVE_SWITCH_EXHAUSTED" : "ED15_DUAL_GAP_OVERLAY_REPAIR_READY");
assert.equal(maturity.nextAction, currentNextAction);
assert.equal(maturity.phases.PHASE_2.planModeConflicts.length, 0);
assert.equal(maturity.phases.PHASE_3.status, primitiveSwitchExhausted || taxonomyReauthorExhausted ? "ACTUAL_PIXEL_AUDIT_WITH_REJECTIONS" : "READY");
assert.deepEqual(maturity.phases.PHASE_3.targetShotIds, ["ED-15"]);
assert.equal(maturity.phases.PHASE_3.generationAllowed, false);
const latestWaveDispatched = primitiveSwitchExhausted || taxonomyReauthorExhausted;
assert.equal(maturity.phases.PHASE_3.generationDispatched, latestWaveDispatched);
assert.equal(maturity.phases.PHASE_4.status, "BLOCKED");
assert.equal(maturity.imageLedger.newGeneratedCount, latestWaveDispatched ? 2 : 0);
assert.equal(maturity.imageLedger.generationDispatched, latestWaveDispatched);
assert.equal(maturity.imageLedger.historicalGeneratedCount, taxonomyReauthorReady || taxonomyReauthorExhausted ? 8 : primitiveSwitchExhausted ? 6 : 4);
if (primitiveSwitchExhausted) assert.equal(maturity.phases.PHASE_3.visualPrimitiveSwitch.toPrimitive, "presenter-aware-dual-gap-offset-wordforms");
if (taxonomyReauthorReady) {
  assert.equal(maturity.phases.PHASE_3.repairAttempt, 3);
  assert.equal(maturity.phases.PHASE_3.taxonomyReauthor.toPrimitive, "presenter-aware-dual-gap-type-lockup");
}
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal((workspace.production.shotIntelligence.currentAssembly || []).length, 0);
assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);

const rerun = runEd15OverlayTaxonomyAdjudication();
assert.equal(rerun.noop, true, "repeating the adjudication must be a stable NOOP");
assert.equal(rerun.maturityRun.maturityRunSha256, maturityRunSha256);

console.log(JSON.stringify({
  status: "PASS",
  decision: visualActor.decision,
  lane: visualActor.lane,
  laneCRequired: visualActor.laneCRequired,
  blockedShotIds: binding.blockedShotIds,
  historicalGeneratedCount: maturity.imageLedger.historicalGeneratedCount,
  generationDispatched: maturity.imageLedger.generationDispatched,
  idempotent: rerun.noop,
}, null, 2));
