#!/usr/bin/env node

import assert from "node:assert/strict";
import {buildCanonicalStaticBoardScope, projectCanonicalStaticBoardWorkspace} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";

const selection = (shotId) => ({candidateId: `candidate-${shotId}`, artifact: {publicUrl: `/generated/system-line/${shotId}.png`, sha256: shotId.padEnd(64, "0").slice(0, 64)}});
const workspace = {
  production: {
    packagingStyleBriefs: [],
    shotVisualCoveragePlan: {contract: "A1ShotVisualCoveragePlan/v1", shotPlans: [
      {shotId: "ED-A", order: 1, route: "PACKAGE_LOOK_MASTER", preview: null},
      {shotId: "ED-B", order: 2, route: "PRESENTER_BASE", preview: {publicUrl: "/generated/system-line/ED-B.jpg"}},
      {shotId: "ED-C", order: 3, route: "PACKAGE_LOOK_MASTER", preview: {publicUrl: "/generated/system-line/ED-C-overlay.png"}},
      {shotId: "ED-D", order: 4, route: "PACKAGE_LOOK_MASTER", preview: null},
    ]},
    shotIntelligence: {
      canonicalDirectorAuthority: {
        contract: "A1CanonicalDirectorAuthority/v1",
        status: "PASS",
        authoritySha256: "a".repeat(64),
        sourceRevisionHash: "b".repeat(64),
        decisions: [
          {shotId: "ED-A", order: 1, canonicalPackageDecision: "PACKAGE", canonicalMedium: "full-package", canonicalTypographyVisualRole: "HERO_TAKEOVER", expectedNoGeneration: false},
          {shotId: "ED-B", order: 2, canonicalPackageDecision: "PACKAGE", canonicalMedium: "presenter-overlay", canonicalTypographyVisualRole: "NONE", expectedNoGeneration: true},
          {shotId: "ED-C", order: 3, canonicalPackageDecision: "NO_PACKAGE", canonicalMedium: "presenter-clean", canonicalTypographyVisualRole: "NONE", expectedNoGeneration: true},
          {shotId: "ED-D", order: 4, canonicalPackageDecision: "PACKAGE", canonicalMedium: "presenter-overlay", canonicalTypographyVisualRole: "PRESENTER_HEADLINE", expectedNoGeneration: false},
        ],
      },
      packageLookMasterPlans: [
        {shotId: "ED-A", presentationMode: "FULLSCREEN", provisionalWholeFilmBoardSelection: selection("ED-A")},
        {shotId: "ED-B", presentationMode: null},
        {shotId: "ED-C", presentationMode: "OVERLAY", provisionalWholeFilmBoardSelection: selection("ED-C")},
        {shotId: "ED-D", presentationMode: "FULLSCREEN", canonicalRepair: {presentationMode: "SHORT_TAKEOVER_1_2S", takeoverDurationMs: 1600}, provisionalWholeFilmBoardSelection: selection("ED-D")},
      ],
      videoPackagingContexts: {items: [{shotId: "ED-C", baseFrame: {kind: "BASE_VIDEO_HOLD_FRAME", publicUrl: "/generated/system-line/ED-C-base.jpg", sha256: "c".repeat(64)}}]},
      decisionSet: {items: [
        {shotId: "ED-A"}, {shotId: "ED-B"}, {shotId: "ED-C"}, {shotId: "ED-D"},
      ]},
    },
  },
};

const pass = buildCanonicalStaticBoardScope(workspace, {boardItems: [{shotId: "ED-A"}, {shotId: "ED-D"}]});
assert.equal(pass.status, "PASS");
assert.deepEqual(pass.requiredPackageBoardShotIds, ["ED-A", "ED-D"]);
assert.deepEqual(pass.timelineOnlyPackageShotIds, ["ED-B"]);

const stale = buildCanonicalStaticBoardScope(workspace, {boardItems: [{shotId: "ED-A"}, {shotId: "ED-C"}, {shotId: "ED-D"}]});
assert.equal(stale.status, "BLOCKED");
assert.deepEqual(stale.extraBoardShotIds, ["ED-C"]);

const missingSelection = structuredClone(workspace);
delete missingSelection.production.shotIntelligence.packageLookMasterPlans[0].provisionalWholeFilmBoardSelection;
const missing = buildCanonicalStaticBoardScope(missingSelection, {boardItems: [{shotId: "ED-D"}]});
assert.equal(missing.status, "BLOCKED");
assert.deepEqual(missing.selectionMissingShotIds, ["ED-A"]);

const currentAuditedRaw = structuredClone(missingSelection);
currentAuditedRaw.production.shotIntelligence.packageLookMasterPlans[0].planSha256 = "1".repeat(64);
currentAuditedRaw.production.shotIntelligence.lookMasterRawReferences = [{
  referenceId: "current-ed-a",
  shotId: "ED-A",
  planSha256: "1".repeat(64),
  current: true,
  recommendationEligible: true,
  selectionEligible: true,
  artifact: {publicUrl: "/generated/system-line/ED-A-current.png", sha256: "2".repeat(64)},
  pixelAudit: {admissionAllowed: true, auditSha256: "3".repeat(64), policyAudit: {status: "PASS"}},
  semanticPixelAudit: {status: "PASS", auditSha256: "4".repeat(64)},
  importedAt: "2026-08-08T00:00:00.000Z",
}];
const recovered = buildCanonicalStaticBoardScope(currentAuditedRaw, {boardItems: [{shotId: "ED-A"}, {shotId: "ED-D"}]});
assert.equal(recovered.status, "PASS");
const recoveredProjection = projectCanonicalStaticBoardWorkspace(currentAuditedRaw).workspace;
assert.equal(recoveredProjection.production.shotIntelligence.packageLookMasterPlans[0].provisionalWholeFilmBoardSelection.artifact.sha256, "2".repeat(64));
assert.equal(recoveredProjection.production.shotIntelligence.packageLookMasterPlans[0].provisionalWholeFilmBoardSelection.selectionSource, "CURRENT_ACTUAL_PIXEL_PASS");

const projected = projectCanonicalStaticBoardWorkspace(workspace).workspace;
const projectedClean = projected.production.shotVisualCoveragePlan.shotPlans.find((shot) => shot.shotId === "ED-C");
assert.equal(projectedClean.route, "PRESENTER_BASE");
assert.equal(projectedClean.packageDecision, "NO_PACKAGE");
assert.equal(projectedClean.preview.publicUrl, "/generated/system-line/ED-C-base.jpg");

console.log(JSON.stringify({status: "PASS", contract: "A1CanonicalStaticBoardAuthorityTest/v1", expectedNoGenerationIsTimelineOnly: true, staleNoPackageOverlayBlocked: true, missingRequiredPackageSelectionBlocked: true, currentActualPixelPassRecoversSelection: true, shortTakeoverCompatible: true}, null, 2));
