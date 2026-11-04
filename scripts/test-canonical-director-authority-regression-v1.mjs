#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildCanonicalDirectorAuthority,
  buildCanonicalDirectorDecision,
  buildCanonicalTargetRepairManifest,
} from "../apps/studio-next/src/lib/a1-canonical-director-authority-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const correction = (shotId, editMode, packageDecision, visualRole, titleRepairTarget = false) => ({
  correctionId: "fixture-correction-v1",
  shotId,
  precedence: "EXPLICIT_USER_LOCKED_OVERRIDE",
  editMode,
  canonicalPackageDecision: packageDecision,
  canonicalTypographyVisualRole: visualRole,
  titleRepairTarget,
});
const basePlan = {planSha256: "plan-fixture", decisionHash: "decision-fixture", styleBriefSha256: "style-fixture", styleBinding: {styleBriefSha256: "style-fixture"}, networkDecision: "SKIP"};
const baseContext = {baseFrame: {publicUrl: "/fixture.jpg", sha256: "hold-fixture"}, subjectBounds: {x: 0.4, y: 0.2, width: 0.3, height: 0.7}, safeZones: [{id: "left"}], availableRegions: [{id: "left"}]};

const fixtureBase = {
  production: {
    packagingBoundary: {baseFootageNeverBlocksPackaging: true},
    canonicalAuthorityCorrectionLedger: {
      history: [{
        correctionId: "fixture-correction-v1",
        corrections: [
          correction("ED-01", "presenter-clean", "NO_PACKAGE", "NONE"),
          correction("ED-23", "screen-demo", "NO_PACKAGE", "NONE"),
          correction("ED-32", "presenter-clean", "NO_PACKAGE", "NONE"),
        ],
      }],
    },
    shotIntelligence: {
      videoPackagingContexts: {items: [{shotId: "ED-07", ...baseContext}]},
      packageLookMasterPlans: [{shotId: "ED-07", ...basePlan}],
      decisionSet: {sourceRevisionHash: "fixture-source", items: []},
    },
  },
};

const noGeneration = buildCanonicalDirectorDecision({
  workspace: fixtureBase,
  director: {shotId: "ED-01", order: 1, editMode: "presenter-overlay", sourceText: "clean", materialGate: "BLOCKED_MEDIA_MISSING", missingMaterialIds: ["presenter-footage"]},
  presentation: {shotId: "ED-01", informationOwner: "presenter", frameOccupation: "negative-space", generationAllowed: false},
  coverage: {shotId: "ED-01", packageDecision: "PACKAGE"},
  runtime: {shotId: "ED-01", packageDecision: "NO_PACKAGE"},
  sourceRevisionHash: "fixture-source",
});
assert.equal(noGeneration.status, "EXPECTED_NO_GENERATION");
assert.equal(noGeneration.expectedNoGeneration, true);
assert.equal(noGeneration.conflictAudit.status, "PASS", "expected no-generation is not a conflict");

const baseFootageNonBlocking = buildCanonicalDirectorDecision({
  workspace: fixtureBase,
  director: {shotId: "ED-07", order: 7, editMode: "presenter-overlay", sourceText: "question", materialGate: "BLOCKED_MEDIA_MISSING", missingMaterialIds: ["presenter-footage"]},
  presentation: {shotId: "ED-07", informationOwner: "presenter", frameOccupation: "negative-space", generationAllowed: false},
  coverage: {shotId: "ED-07", packageDecision: "NO_PACKAGE"},
  runtime: {shotId: "ED-07", packageDecision: "PACKAGE"},
  sourceRevisionHash: "fixture-source",
});
assert.equal(baseFootageNonBlocking.generationAllowed, true);
assert.equal(baseFootageNonBlocking.generationGate.status, "READY");
assert.deepEqual(baseFootageNonBlocking.generationGate.blockers, []);
assert.deepEqual(baseFootageNonBlocking.generationGate.editorOwnedMissingMaterialIds, ["presenter-footage"]);

const workspace = readProjectWorkspace(appRoot);
const directorRun = readJson(path.join(phaseRoot, "typography-recall-recompile-v1/director-input.json"));
const presentationSet = readJson(path.join(phaseRoot, "presentation-decision-set-v1.json"));
const coveragePlan = readJson(path.join(phaseRoot, "shot-visual-coverage-plan-v1.json"));
const authority = buildCanonicalDirectorAuthority({workspace, directorRun, presentationSet, coveragePlan});
assert.equal(authority.status, "PASS");
assert.equal(authority.summary.conflictCount, 0);
const targetManifest = buildCanonicalTargetRepairManifest(authority, {
  workspaceSha256: workspace.workspaceSha256,
  repairScopeShotIds: ["ED-07", "ED-08", "ED-13", "ED-19"],
});
assert.deepEqual(targetManifest.targetRepairShotIds, ["ED-07", "ED-08", "ED-13", "ED-19"]);
assert.deepEqual(targetManifest.generationEligibleShotIds, ["ED-08", "ED-13"]);
const persistedAuthority = workspace.production.shotIntelligence.canonicalDirectorAuthority;
const persistedManifest = workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
const currentCreatorSequence = workspace.production.canonicalCreatorPackagingSequence;
assert.equal(persistedAuthority.status, "PASS");
assert.equal(persistedAuthority.checkpoint, "CODE_ONLY_CANONICAL_AUTHORITY_PASS");
assert.equal(persistedAuthority.authoritySha256, persistedManifest.authoritySha256);
assert.equal(persistedAuthority.authoritySha256, authority.authoritySha256);
assert.equal(persistedManifest.checkpoint, "CODE_ONLY_CANONICAL_AUTHORITY_PASS");
assert.equal(persistedManifest.generationDispatched, false);
assert.equal(persistedManifest.imageGenCalls, 0);
assert.equal(currentCreatorSequence.current, true);
assert.equal(currentCreatorSequence.sequenceSha256, workspace.production.creatorPackagingPaletteRegistry.sequenceSha256);
assert.equal(currentCreatorSequence.maturity.status, "CURRENT_PROJECT_CURATED");
assert.equal(currentCreatorSequence.maturity.crossArticleStatus, "CROSS_ARTICLE_UNPROVEN");
assert.equal(authority.authoritySha256, persistedAuthority.authoritySha256, "recomputed canonical authority must match the current persisted authority");
assert.deepEqual(persistedManifest.targetRepairShotIds, ["ED-07", "ED-08", "ED-13", "ED-19"]);
assert.deepEqual(persistedManifest.generationEligibleShotIds, ["ED-08", "ED-13"]);
const expectedCurrentPlans = {
  "ED-07": {visualRole: "PRESENTER_HEADLINE", assemblyMode: "OVERLAY", presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER"},
  "ED-08": {visualRole: "PRESENTER_HEADLINE", assemblyMode: "OVERLAY", presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER"},
  "ED-13": {visualRole: "PRESENTER_HEADLINE", assemblyMode: "OVERLAY", presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER"},
  "ED-19": {visualRole: "PRESENTER_HEADLINE", assemblyMode: "EXPLAINER", presentationMode: "FULLSCREEN_EXPLAINER_TAKEOVER"},
};
for (const [shotId, expected] of Object.entries(expectedCurrentPlans)) {
  const plan = workspace.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const currentDecision = currentCreatorSequence.decisions.find((item) => item.shotId === shotId);
  assert.ok(plan, `current canonical plan missing: ${shotId}`);
  assert.equal(plan.typographyVisualRole, expected.visualRole);
  assert.equal(plan.assemblyMode, expected.assemblyMode);
  assert.equal(plan.presentationMode, expected.presentationMode);
  if (currentDecision.packageDecision === "PACKAGE") {
    assert.equal(plan.assemblyMode, currentDecision.assemblyMode);
    assert.equal(plan.presentationMode, currentDecision.presentationMode);
  } else {
    assert.equal(currentDecision.contentTreatment, "PRESENTER");
    assert.equal(currentDecision.assemblyMode, null);
    assert.equal(currentDecision.presentationMode, null);
  }
}

const ruling = (shotId) => authority.decisions.find((item) => item.shotId === shotId);
assert.equal(ruling("ED-01").selectedAuthority, "EXPLICIT_USER_LOCKED_OVERRIDE");
assert.deepEqual([ruling("ED-01").canonicalMedium, ruling("ED-01").canonicalPackageDecision, ruling("ED-01").canonicalTypographyVisualRole], ["presenter-clean", "NO_PACKAGE", "NONE"]);
assert.equal(ruling("ED-14").selectedAuthority, "CURRENT_SOURCE_CORRECTION_AND_VERIFIED_EVIDENCE_GROUNDING");
assert.equal(ruling("ED-14").sourceAudit.status, "CURRENT_CORRECTION_BOUND");
assert.deepEqual([ruling("ED-23").canonicalMedium, ruling("ED-23").canonicalPackageDecision], ["screen-demo", "NO_PACKAGE"]);
assert.equal(ruling("ED-23").status, "EXPECTED_NO_GENERATION");
assert.deepEqual([ruling("ED-32").canonicalMedium, ruling("ED-32").canonicalPackageDecision, ruling("ED-32").canonicalTypographyVisualRole], ["presenter-clean", "NO_PACKAGE", "NONE"]);
for (const shotId of ["ED-01", "ED-14", "ED-23", "ED-32"]) assert.equal(ruling(shotId).conflictAudit.status, "PASS");

const boardReport = readJson(path.join(phaseRoot, "whole-film-static-board-v1/report.json"));
const boardFile = path.join(phaseRoot, "whole-film-static-board-v1/whole-film-package-board.png");
assert.equal(fileSha256(boardFile), workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256);
assert.equal(boardReport.board.sha256, workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256);
assert.equal(boardReport.current, true);
assert.equal(boardReport.authorityScope, "CURRENT");
assert.equal(boardReport.items.length, currentCreatorSequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length);
assert.equal(boardReport.formalAssemblyCount, 0);
assert.equal(boardReport.assemblyCreationAllowed, false);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(workspace.production.packagingBoundary.baseFootageNeverBlocksPackaging, true);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.canonicalAuthorityCorrectionLedger.activeCorrectionId, "canonical-authority-p0-user-correction-20260819-v2");

console.log(JSON.stringify({
  status: "PASS",
  checkpoint: "CREATOR_PACKAGING_AUTHORITY_CUTOVER_REGRESSION_PASS",
  authorityStatus: authority.status,
  conflictCount: authority.summary.conflictCount,
  legacyAuthoritySha256: persistedAuthority.authoritySha256,
  recomputedLegacyAuthoritySha256: authority.authoritySha256,
  currentCreatorSequenceSha256: currentCreatorSequence.sequenceSha256,
  manifestSha256: persistedManifest.manifestSha256,
  sourceRevisionHash: persistedManifest.sourceRevisionHash,
  titleRepairScope: ["ED-07", "ED-08", "ED-13", "ED-19"],
  generationEligibleShotIds: persistedManifest.generationEligibleShotIds,
  boardSha256: fileSha256(boardFile),
  currentBoardItemCount: boardReport.items.length,
  currentPackageCount: currentCreatorSequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length,
  queue: {queued: workspace.production.generation.summary.queued, running: workspace.production.generation.summary.running},
  workerStatus: boardReport.workerStatus,
  assemblyCount: boardReport.formalAssemblyCount,
  assemblyCreationAllowed: boardReport.assemblyCreationAllowed,
}, null, 2));
