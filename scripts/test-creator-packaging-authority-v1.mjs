#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  A1_CREATOR_PACKAGING_PALETTE_BLOCKED_LANE_C_TARGET_UNRESOLVED,
  A1_CREATOR_PALETTE_LANES,
  assertCreatorPaletteApprovedForStaticBoard,
  buildCanonicalCreatorPackagingSequence,
  buildCreatorPackagingPaletteRegistry,
  deriveCreatorPackagingProjection,
} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";

const hash = (character) => character.repeat(64);
const projectOverrides = JSON.parse(fs.readFileSync(path.join(process.cwd(), "apps/studio-next/src/data/system-line-creator-packaging-overrides-v1.json"), "utf8"));
projectOverrides.projectId = "fixture-project";
projectOverrides.sourceRevisionHash = hash("a");
const shotIds = Array.from({length: 34}, (_, index) => `ED-${String(index + 1).padStart(2, "0")}`);
const workspace = {
  article: {shotCount: 34, sourceTextSha256: hash("a")},
  library: {assets: shotIds.map((shotId, index) => ({route: "shot-composition", shotDemand: {shotId, order: index + 1, sourceText: `shot ${shotId}`}}))},
  production: {
    project: {projectId: "fixture-project"},
    creatorPackagingProjectOverrides: projectOverrides,
    referenceConditioning: {referenceCorpusContract: "A1ReferenceSequenceCorpus/v2", referenceCorpusSha256: hash("b")},
    wholeFilmPackagingDirection: {shotPlans: shotIds.map((shotId) => ({shotId, route: shotId === "ED-20" || shotId === "ED-23" ? "SCREEN_EVIDENCE" : "PRESENTER_BASE"}))},
    shotIntelligence: {semanticDesignBriefSet: {briefs: []}, packageLookMasterPlans: [], lookMasterRawReferences: []},
  },
};

const sequence = buildCanonicalCreatorPackagingSequence(workspace, {now: "2026-08-08T00:00:00.000Z"});
workspace.production.canonicalCreatorPackagingSequence = sequence;
const opening = sequence.decisions.find((item) => item.shotId === "ED-01");
assert.deepEqual(opening.requiredFormalText, ["智能写作工具台"]);
assert.equal(opening.displayCopyPolicy.mode, "TITLE_ONLY");
assert.equal(opening.displayCopyPolicy.allowSupportingText, false);
assert.equal(opening.displayCopyPolicy.allowSourceTextExpansion, false);
assert.equal(sequence.conflictAudit.status, "PASS");
assert.equal(sequence.conflictAudit.conflictCount, 0);
assert.equal(sequence.rhythmAudit.status, "PASS");
assert.equal(sequence.rhythmAudit.packageCount, sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length);
assert.equal(sequence.rhythmAudit.fullFrameTakeoverCount, 2);
assert.equal(sequence.rhythmAudit.policyRerouteCount, 0);

const heroFullFrame = deriveCreatorPackagingProjection({contentTreatment: "HERO_TYPOGRAPHY", frameOccupation: "FULL_FRAME_TAKEOVER", packageDecision: "PACKAGE"});
assert.deepEqual(heroFullFrame, {route: "PACKAGE_LOOK_MASTER", assemblyMode: "TYPOGRAPHY", presentationMode: "FULLSCREEN"});
const ed10 = sequence.decisions.find((item) => item.shotId === "ED-10");
assert.equal(ed10.contentTreatment, "HERO_TYPOGRAPHY");
assert.equal(ed10.frameOccupation, "FULL_FRAME_TAKEOVER");
assert.equal(ed10.fullFramePolicy.status, "NORMAL_RHYTHM_MODE");
assert.equal(ed10.fullFramePolicy.fallbackAllowed, false);

const ed20 = sequence.decisions.find((item) => item.shotId === "ED-20");
assert.deepEqual({packageDecision: ed20.packageDecision, contentTreatment: ed20.contentTreatment, frameOccupation: ed20.frameOccupation, route: ed20.route, status: ed20.currentStatus}, {packageDecision: "NO_PACKAGE", contentTreatment: "REAL_EVIDENCE", frameOccupation: "CLEAN_BASE", route: "SCREEN_EVIDENCE", status: "SOURCE_CAPTURE_REQUIRED"});
assert.equal(sequence.decisions.find((item) => item.shotId === "ED-32").packageDecision, "NO_PACKAGE");

const laneEntries = [
  [A1_CREATOR_PALETTE_LANES.OVERLAY, "ED-07", "PIXEL_WINDOW", "OVERLAY"],
  [A1_CREATOR_PALETTE_LANES.OVERLAY, "ED-08", "PIXEL_WINDOW", "OVERLAY"],
  [A1_CREATOR_PALETTE_LANES.TYPOGRAPHY, "ED-15", "HERO_TYPOGRAPHY", "OVERLAY"],
  [A1_CREATOR_PALETTE_LANES.TYPOGRAPHY, "ED-16", "HERO_TYPOGRAPHY", "SPLIT"],
].map(([laneId, shotId, contentTreatment, frameOccupation], index) => ({
  paletteEntryId: `entry-${index + 1}`,
  laneId,
  shotId,
  candidateId: `candidate-${index + 1}`,
  projectLocalUrl: `/generated/system-line/fixture-${index + 1}.png`,
  contentSha256: String(index + 1).repeat(64),
  packageType: `${contentTreatment}_${frameOccupation}`,
  primaryPrimitive: laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? "PIXEL_WINDOW_OVERLAY" : laneId === A1_CREATOR_PALETTE_LANES.TYPOGRAPHY ? "PIXEL_TYPE_ACTOR" : "PIXEL_EXPLAINER",
  semanticRole: "TURN",
  dominantActor: "fixture-actor",
  composition: "fixture-composition",
  surfaceLogic: "fixture-surface",
  paletteRoles: ["cool-gray", "charcoal"],
  windowCount: laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? 2 : 0,
  typographyBehavior: "fixture-type",
  contentTreatment,
  frameOccupation,
  rhythmRole: "TURN",
  sourceAudit: {status: "PASS", actualPixelStatus: "PASS", semanticStatus: "PASS", duplicateStatus: "PASS", exception: false},
  ...(laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? {holdFrameCompatibility: "PASS", overlayCompositeAudit: {status: "PASS", artifactSha256: String(index + 1).repeat(64), compositeSha256: hash("c"), holdFrameSha256: hash("d"), subjectExclusionStatus: "PASS", safeZoneStatus: "PASS", availableRegionStatus: "PASS"}} : {}),
}));
const recommendedTrio = {
  [A1_CREATOR_PALETTE_LANES.OVERLAY]: "entry-1",
  [A1_CREATOR_PALETTE_LANES.TYPOGRAPHY]: "entry-3",
};
const registry = buildCreatorPackagingPaletteRegistry({sequence, entries: laneEntries, contactSheet: {publicUrl: "/generated/system-line/contact.png", sha256: hash("c"), width: 1920, height: 1128}, sourceWorkspaceSha256: hash("d"), sourceBoardSha256: hash("e"), recommendedTrio, now: "2026-08-08T00:00:00.000Z"});
assert.equal(registry.entries.find((item) => item.shotId === "ED-15").contentTreatment, "HERO_TYPOGRAPHY");
assert.equal(registry.entries.find((item) => item.shotId === "ED-15").primaryPrimitive, "PIXEL_TYPE_ACTOR");
assert.equal(registry.status, "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_MISSING_LANE_C");
assert.equal(registry.laneReadiness[A1_CREATOR_PALETTE_LANES.FULL_FRAME].status, "MISSING_ACTUAL_CANDIDATE");
workspace.production.creatorPackagingPaletteRegistry = registry;
assert.throws(() => assertCreatorPaletteApprovedForStaticBoard(workspace), /creator-packaging-palette-user-approval-required/);

workspace.production.shotIntelligence.packageLookMasterPlans = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").map((item, index) => ({shotId: item.shotId, planSha256: String((index % 9) + 1).repeat(64), provisionalWholeFilmBoardSelection: {artifact: {sha256: String.fromCharCode(102 - (index % 5)).repeat(64), publicUrl: `/generated/system-line/${item.shotId}.png`}}}));
const scope = buildCanonicalStaticBoardScope(workspace);
assert.equal(scope.authorityKind, "CREATOR_PACKAGING_SEQUENCE");
assert.equal(scope.canonicalPackageShotIds.length, sequence.rhythmAudit.packageCount);
assert.equal(scope.canonicalPackageShotIds.includes("ED-20"), false);
assert.equal(scope.canonicalPackageShotIds.includes("ED-32"), false);
assert.equal(scope.status, "BLOCKED");
assert.ok(scope.bindingManifestFailures.some((item) => item.includes("creator-palette-shot-binding-contract-invalid")));

console.log(JSON.stringify({status: "PASS", sequenceSha256: sequence.sequenceSha256, conflictCount: sequence.conflictAudit.conflictCount, packageCount: sequence.rhythmAudit.packageCount, fullFrameTakeoverCount: sequence.rhythmAudit.fullFrameTakeoverCount, laneCount: 3, ed15Status: sequence.decisions.find((item) => item.shotId === "ED-15").currentStatus, ed20Status: ed20.currentStatus}, null, 2));
