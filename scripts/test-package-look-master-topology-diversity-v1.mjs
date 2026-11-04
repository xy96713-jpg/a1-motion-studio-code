#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {auditPackageLookMasterTopologyDiversity, buildPackageLookMasterPlan, representativePackageLookMasterDirection, topologyFingerprint} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {compileRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const workspace = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const plans = workspace.production.shotIntelligence.packageLookMasterPlans.filter((plan) => plan.dataChainVersion >= 3);
assert.ok(plans.length >= 1);
const sharedDirection = {...plans[0].candidateDirections[0], directionId: "shared-direction"};
const synthetic = ["ED-A", "ED-B", "ED-C"].map((shotId) => ({
  dataChainVersion: 2,
  shotId,
  styleBriefSha256: `brief-${shotId}`,
  semanticRole: "key-claim",
  currentCandidateDirections: [{...sharedDirection, directionId: `${shotId}-direction`}],
}));
const audit = auditPackageLookMasterTopologyDiversity(synthetic);
assert.equal(audit.status, "PASS", "unselected catalogue directions are advisory and cannot block an unrelated package event");
assert.equal(audit.duplicateGroups.length, 0);
assert.equal(audit.candidateDuplicateGroups.length, 1);
assert.deepEqual(audit.candidateDuplicateGroups[0].entries.map((item) => item.shotId), ["ED-A", "ED-B", "ED-C"]);
assert.equal(audit.pendingSelectionCount, 3);
assert.equal(audit.candidateDirectionCount, 3);

// The selected direction, not the first legacy catalogue entry, is the
// cross-event representative used by production routing.
const selectedDuplicate = ["ED-X", "ED-Y"].map((shotId, index) => ({
  dataChainVersion: 2,
  shotId,
  styleBriefSha256: `brief-${shotId}`,
  semanticRole: "key-claim",
  candidateDirections: [
    {...sharedDirection, directionId: `${shotId}-unique-${index}`, composition: `unique-${index}`},
    {...sharedDirection, directionId: `${shotId}-selected`, composition: sharedDirection.composition},
  ],
  activeCandidateSet: {status: "ACTIVE", directionIds: [`${shotId}-unique-${index}`, `${shotId}-selected`], selectedDirectionId: `${shotId}-selected`},
}));
assert.equal(representativePackageLookMasterDirection(selectedDuplicate[0]).directionId, "ED-X-selected");
const selectedAudit = auditPackageLookMasterTopologyDiversity(selectedDuplicate);
assert.equal(selectedAudit.status, "REVIEW_REQUIRED", "selected representatives must be the hard cross-event gate");
const missingRepresentativeAudit = auditPackageLookMasterTopologyDiversity([{
  dataChainVersion: 2,
  shotId: "ED-MISSING",
  styleBriefSha256: "brief-missing",
  semanticRole: "key-claim",
  currentCandidateDirections: [],
}]);
assert.equal(missingRepresentativeAudit.status, "PASS", "a package pending selection is not a selected-representative hard-gate failure");
assert.equal(missingRepresentativeAudit.pendingSelectionCount, 1);

const decision = workspace.production.shotIntelligence.decisionSet.items.find((item) => item.packageDecision === "PACKAGE"
  && workspace.production.packagingBeatPlan.packagingEvents.some((eventItem) => eventItem.sourceBeatIds.includes(item.shotId)));
assert.ok(decision, "topology fixture requires a package decision with a bound legacy packaging event");
const event = workspace.production.packagingBeatPlan.packagingEvents.find((item) => item.sourceBeatIds.includes(decision.shotId));
assert.ok(event, "topology fixture requires a bound legacy packaging event");
const videoContext = workspace.production.shotIntelligence.videoPackagingContexts.items.find((item) => item.shotId === decision.shotId);
const brief = compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext, now: "2026-08-05T00:00:00.000Z"});
const blockedTopology = topologyFingerprint({
  composition: "single-off-axis-actor-with-active-counterfield",
  surface: brief.variation.surfaceLogic,
  material: brief.variation.material,
  paletteRole: "charcoal-base-cobalt-structure-one-accent",
});
const nextPlan = buildPackageLookMasterPlan(decision, brief, {
  referenceManifest,
  videoContext,
  recentTopologyFingerprints: [blockedTopology],
  now: "2026-08-05T00:00:01.000Z",
});
assert.equal(nextPlan.candidateDirections.some((direction) => topologyFingerprint(direction) === blockedTopology), false);
console.log(JSON.stringify({status: "PASS", contract: "A1PackageLookMasterCrossEventDiversityAudit/v1", selectedDuplicateGroups: selectedAudit.duplicateGroups.length, advisoryCandidateDuplicateGroups: audit.candidateDuplicateGroups.length, blockedTopologyRejected: true}, null, 2));
