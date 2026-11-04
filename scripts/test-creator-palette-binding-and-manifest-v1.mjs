#!/usr/bin/env node

import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {
  A1_CREATOR_PALETTE_LANES,
  approveCreatorPackagingPalette,
  assertCreatorPaletteApprovedForStaticBoard,
  assertCreatorPaletteShotBindingManifest,
  buildCanonicalCreatorPackagingSequence,
  buildCreatorPackagingPaletteRegistry,
  buildCreatorPaletteShotBindingManifest,
  deriveCreatorPackagingProjection,
} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {assertUniqueCurrentRepairManifestAuthority} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const repeatHash = (value) => String(value).repeat(64).slice(0, 64);
const overrides = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/data/system-line-creator-packaging-overrides-v1.json"), "utf8"));
overrides.projectId = "binding-fixture";
overrides.sourceRevisionHash = repeatHash("a");
overrides.entries.find((item) => item.shotId === "ED-14").frameOccupation = "FULL_FRAME_TAKEOVER";
const shotIds = Array.from({length: 34}, (_, index) => `ED-${String(index + 1).padStart(2, "0")}`);
const fixture = {
  workspaceSha256: repeatHash("b"),
  article: {shotCount: 34, sourceTextSha256: repeatHash("a")},
  library: {assets: shotIds.map((shotId, index) => ({route: "shot-composition", shotDemand: {shotId, order: index + 1, sourceText: `fixture ${shotId}`}}))},
  production: {
    project: {projectId: "binding-fixture"},
    creatorPackagingProjectOverrides: overrides,
    referenceConditioning: {referenceCorpusContract: "A1ReferenceSequenceCorpus/v2", referenceCorpusSha256: repeatHash("c")},
    shotIntelligence: {semanticDesignBriefSet: {briefs: []}, packageLookMasterPlans: [], lookMasterRawReferences: [], videoPackagingContexts: {items: []}},
  },
};
const sequence = buildCanonicalCreatorPackagingSequence(fixture, {now: "2026-08-08T00:00:00.000Z"});
fixture.production.canonicalCreatorPackagingSequence = sequence;
const expectedPackageCount = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length;
assert.deepEqual(sequence.decisions.filter((item) => item.contentTreatment === "EDITORIAL_EXPLAINER" && item.frameOccupation === "FULL_FRAME_TAKEOVER").map((item) => item.shotId), ["ED-14"]);

const makePaletteEntry = ({id, laneId, shotId, contentTreatment, frameOccupation}) => ({
  paletteEntryId: id,
  laneId,
  shotId,
  candidateId: `palette-${id}`,
  projectLocalUrl: `/generated/system-line/${id}.png`,
  contentSha256: hash(`palette-${id}`),
  packageType: `${contentTreatment}_${frameOccupation}`,
  primaryPrimitive: laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? "PIXEL_WINDOW_OVERLAY" : laneId === A1_CREATOR_PALETTE_LANES.TYPOGRAPHY ? "PIXEL_TYPE_ACTOR" : "PIXEL_EXPLAINER",
  semanticRole: "TURN",
  dominantActor: "fixture",
  composition: "fixture",
  surfaceLogic: "fixture",
  paletteRoles: ["cool-gray", "charcoal"],
  windowCount: laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? 1 : 0,
  typographyBehavior: "fixture",
  contentTreatment,
  frameOccupation,
  rhythmRole: "TURN",
  holdFrameCompatibility: laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? "PASS" : "NOT_REQUIRED",
  sourceAudit: {status: "PASS", actualPixelStatus: "PASS", semanticStatus: "PASS", duplicateStatus: "PASS", exception: false},
  ...(laneId === A1_CREATOR_PALETTE_LANES.OVERLAY ? {overlayCompositeAudit: {status: "PASS", artifactSha256: hash(`palette-${id}`), compositeSha256: hash(`palette-composite-${id}`), holdFrameSha256: hash(`palette-hold-${id}`), subjectExclusionStatus: "PASS", safeZoneStatus: "PASS", availableRegionStatus: "PASS"}} : {}),
});
const paletteEntries = [
  makePaletteEntry({id: "overlay-a", laneId: A1_CREATOR_PALETTE_LANES.OVERLAY, shotId: "ED-07", contentTreatment: "PIXEL_WINDOW", frameOccupation: "OVERLAY"}),
  makePaletteEntry({id: "overlay-b", laneId: A1_CREATOR_PALETTE_LANES.OVERLAY, shotId: "ED-08", contentTreatment: "PIXEL_WINDOW", frameOccupation: "OVERLAY"}),
  makePaletteEntry({id: "type-a", laneId: A1_CREATOR_PALETTE_LANES.TYPOGRAPHY, shotId: "ED-16", contentTreatment: "HERO_TYPOGRAPHY", frameOccupation: "SPLIT"}),
  makePaletteEntry({id: "type-b", laneId: A1_CREATOR_PALETTE_LANES.TYPOGRAPHY, shotId: "ED-19", contentTreatment: "HERO_TYPOGRAPHY", frameOccupation: "FULL_FRAME_TAKEOVER"}),
  makePaletteEntry({id: "explainer-a", laneId: A1_CREATOR_PALETTE_LANES.FULL_FRAME, shotId: "ED-14", contentTreatment: "EDITORIAL_EXPLAINER", frameOccupation: "FULL_FRAME_TAKEOVER"}),
];
const selectedByLane = {[A1_CREATOR_PALETTE_LANES.OVERLAY]: "overlay-a", [A1_CREATOR_PALETTE_LANES.TYPOGRAPHY]: "type-a", [A1_CREATOR_PALETTE_LANES.FULL_FRAME]: "explainer-a"};
const registry = buildCreatorPackagingPaletteRegistry({sequence, entries: paletteEntries, contactSheet: {publicUrl: "/contact.png", sha256: repeatHash("d"), width: 1920, height: 1128}, sourceWorkspaceSha256: fixture.workspaceSha256, sourceBoardSha256: repeatHash("e"), recommendedTrio: selectedByLane, now: "2026-08-08T00:00:00.000Z"});
fixture.production.creatorPackagingPaletteRegistry = approveCreatorPackagingPalette(registry, selectedByLane, {now: "2026-08-08T00:01:00.000Z"});

for (const [index, decision] of sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").entries()) {
  const projection = deriveCreatorPackagingProjection(decision);
  const artifactSha256 = hash(`shot-${decision.shotId}`);
  const planSha256 = hash(`plan-${decision.shotId}`);
  const holdFrameSha256 = hash(`hold-${decision.shotId}`);
  const compositeSha256 = hash(`composite-${decision.shotId}`);
  const fingerprintPrefix = decision.frameOccupation === "OVERLAY" ? "OVERLAY" : decision.frameOccupation === "SPLIT" ? "SPLIT" : "FULLSCREEN";
  fixture.production.shotIntelligence.packageLookMasterPlans.push({shotId: decision.shotId, planSha256, assemblyMode: projection.assemblyMode, presentationMode: projection.presentationMode, referencePackaging: {classifierDecision: "NO_REFERENCE_GENERATIVE"}, referenceInputs: [], provisionalWholeFilmBoardSelection: {candidateId: `candidate-${index}`, artifact: {sha256: artifactSha256, publicUrl: `/generated/system-line/${decision.shotId}.png`}}});
  fixture.production.shotIntelligence.lookMasterRawReferences.push({shotId: decision.shotId, referenceId: `raw-${decision.shotId}`, planSha256, current: true, historyReadOnly: false, artifact: {sha256: artifactSha256, publicUrl: `/generated/system-line/${decision.shotId}.png`}, pixelAudit: {contract: "A1CanonicalModeAudit/v1", admissionAllowed: true, failures: [], auditSha256: hash(`pixel-${decision.shotId}`), actualPixelMetrics: {visualFingerprint: `${fingerprintPrefix}|fixture`}, compositePreview: {publicUrl: `/generated/system-line/${decision.shotId}-composite.png`, sha256: compositeSha256}, footageCompatibility: {status: "PASS", baseFrameSha256: holdFrameSha256, subjectOcclusion: {status: "PASS", availableRegionOverflow: {status: "PASS"}}}}, semanticPixelAudit: {status: "PASS", auditSha256: hash(`semantic-${decision.shotId}`)}});
  if (decision.frameOccupation === "OVERLAY") fixture.production.shotIntelligence.videoPackagingContexts.items.push({shotId: decision.shotId, baseFrame: {publicUrl: `/generated/system-line/${decision.shotId}-hold.png`, sha256: holdFrameSha256}, subjectBounds: {x: 0.2, y: 0.1, width: 0.3, height: 0.7}, safeZones: [{id: "safe"}], availableRegions: [{id: "available"}]});
}

const passingBinding = buildCreatorPaletteShotBindingManifest(fixture, {now: "2026-08-08T00:02:00.000Z"});
fixture.production.creatorPaletteShotBindingManifest = passingBinding;
assert.equal(passingBinding.status, "PASS");
assert.equal(passingBinding.passCount, expectedPackageCount);
assert.doesNotThrow(() => assertCreatorPaletteApprovedForStaticBoard(fixture));
assert.equal(buildCanonicalStaticBoardScope(fixture).status, "PASS");

const attachmentRequired = structuredClone(fixture);
attachmentRequired.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-07").referencePackaging.classifierDecision = "UNIVERSAL_REFERENCE_TO_IMAGEGEN_PACKAGING";
const attachmentBlockedBinding = buildCreatorPaletteShotBindingManifest(attachmentRequired, {now: "2026-08-08T00:02:30.000Z"});
assert.equal(attachmentBlockedBinding.status, "BLOCKED");
assert.ok(attachmentBlockedBinding.entries.find((item) => item.shotId === "ED-07").blockers.includes("UNIVERSAL_REFERENCE_FULL_LOOK_MASTER_BINDING_BLOCKED"));

const classifierMissing = structuredClone(fixture);
delete classifierMissing.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-13").referencePackaging.classifierDecision;
const classifierBlockedBinding = buildCreatorPaletteShotBindingManifest(classifierMissing, {now: "2026-08-08T00:02:40.000Z"});
assert.equal(classifierBlockedBinding.status, "BLOCKED");
assert.ok(classifierBlockedBinding.entries.find((item) => item.shotId === "ED-13").blockers.includes("REFERENCE_PACKAGING_CLASSIFIER_MISSING"));

const missingBinding = structuredClone(fixture);
delete missingBinding.production.creatorPaletteShotBindingManifest;
assert.throws(() => assertCreatorPaletteApprovedForStaticBoard(missingBinding), /creator-palette-shot-binding-contract-invalid/);
assert.equal(buildCanonicalStaticBoardScope(missingBinding).status, "BLOCKED");

const singleConflict = structuredClone(fixture);
singleConflict.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-07").presentationMode = "OVERLAY";
const conflictedBinding = buildCreatorPaletteShotBindingManifest(singleConflict, {now: "2026-08-08T00:03:00.000Z"});
assert.equal(conflictedBinding.status, "BLOCKED");
assert.deepEqual([...new Set(conflictedBinding.modeCompatibilityFailures.map((item) => item.shotId))], ["ED-07"]);

const appRoot = path.join(root, "apps/studio-next");
const canonicalManifestPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json");
const publicManifestPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json");
if (fs.existsSync(canonicalManifestPath) && fs.existsSync(publicManifestPath)) {
  const liveWorkspace = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
  const canonicalManifest = JSON.parse(fs.readFileSync(canonicalManifestPath, "utf8"));
  const publicManifest = JSON.parse(fs.readFileSync(publicManifestPath, "utf8"));
  if (canonicalManifest.authorityState === "CURRENT" && liveWorkspace.production?.incrementalRepairManifestAuthority?.manifestSha256 === canonicalManifest.manifestSha256) {
    const currentPhase = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"), "utf8"));
    const authorityReport = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/report.json"), "utf8"));
    const historicalManifestPath = path.join(root, ".codex-artifacts/system-progress-system-line/incremental-repair-executor-v1/repair-manifest.json");
    const historicalManifest = JSON.parse(fs.readFileSync(historicalManifestPath, "utf8"));
    const historyBoundToCurrentFixture = {...historicalManifest, supersededByManifestSha256: canonicalManifest.manifestSha256};
    assert.doesNotThrow(() => assertUniqueCurrentRepairManifestAuthority({workspace: liveWorkspace, manifest: canonicalManifest, publicMirror: publicManifest, currentPhase, authorityReport, historicalMirrors: [historyBoundToCurrentFixture]}));
    const staleMirror = structuredClone(publicManifest);
    staleMirror.manifestSha256 = repeatHash("f");
    assert.throws(() => assertUniqueCurrentRepairManifestAuthority({workspace: liveWorkspace, manifest: canonicalManifest, publicMirror: staleMirror, currentPhase, authorityReport, historicalMirrors: [historyBoundToCurrentFixture]}), /incremental-repair-public-mirror-stale/);
    const mutableHistorical = structuredClone(historyBoundToCurrentFixture);
    mutableHistorical.current = true;
    assert.throws(() => assertUniqueCurrentRepairManifestAuthority({workspace: liveWorkspace, manifest: canonicalManifest, publicMirror: publicManifest, currentPhase, authorityReport, historicalMirrors: [mutableHistorical]}), /incremental-repair-historical-mirror-not-read-only/);
  }
}

console.log(JSON.stringify({status: "PASS", passingBindingShotCount: passingBinding.passCount, missingBindingFailClosed: true, universalReferenceAttachmentMissingFailClosed: true, referenceClassifierMissingFailClosed: true, singleConflictShotIds: [...new Set(conflictedBinding.modeCompatibilityFailures.map((item) => item.shotId))], genericFixtureUsesDifferentAuthorityTarget: "ED-14"}, null, 2));
