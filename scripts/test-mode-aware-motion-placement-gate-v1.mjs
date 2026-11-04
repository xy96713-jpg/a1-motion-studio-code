#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {derivePackageSubjectBoundsPlacementGate, deriveRepresentativeMotionPlacementGate} from "../apps/studio-next/src/lib/a1-package-video-placement-gate-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.join(process.cwd(), "apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const ed10 = derivePackageSubjectBoundsPlacementGate(workspace, "ED-10");
assert.equal(ed10.confirmed, true);
assert.equal(ed10.status, "NOT_REQUIRED_FULL_FRAME_TAKEOVER");
assert.equal(ed10.subjectBounds, null);
const ed31 = derivePackageSubjectBoundsPlacementGate(workspace, "ED-31");
assert.equal(ed31.confirmed, false);
assert.equal(ed31.status, "REROUTE_REQUIRED_FULL_FRAME_TAKEOVER");
assert.equal(ed31.subjectBounds?.status, "DECLARED_FROM_ACTUAL_HOLD_FRAME_REVIEW");
const ed31Takeover = derivePackageSubjectBoundsPlacementGate(workspace, "ED-31", {routeOverride: {presentationMode: "FULLSCREEN_EXPLAINER_TAKEOVER", frameOccupation: "FULL_FRAME_TAKEOVER", baseVideoRelationship: "TEMPORARY_FULL_FRAME_TAKEOVER", baseSubjectMustRemainVisible: false}});
assert.equal(ed31Takeover.confirmed, true);
assert.equal(ed31Takeover.status, "NOT_REQUIRED_FULL_FRAME_TAKEOVER");
const missing = structuredClone(workspace);
for (const collection of [missing.production.shotIntelligence.packageAssetKitPlans, missing.production.shotIntelligence.packageLookMasterPlans, missing.production.shotIntelligence.packageAssemblyRecipes]) {
  const item = collection?.find((entry) => entry.shotId === "ED-31");
  if (item?.videoContext) item.videoContext.subjectBounds = null;
  if (item?.videoContextReconciliation) item.videoContextReconciliation.subjectBounds = null;
}
const missingGate = derivePackageSubjectBoundsPlacementGate(missing, "ED-31");
assert.equal(missingGate.confirmed, false);
assert.equal(missingGate.status, "REROUTE_REQUIRED_FULL_FRAME_TAKEOVER");
const simpleMissing = derivePackageSubjectBoundsPlacementGate(missing, "ED-31", {semanticContext: {sourceText: "简单标题", semanticIntent: "一个关键词标题", semanticStructure: {kind: "TITLE", stepCount: 1, relationshipCount: 0, regionCount: 1}}});
assert.equal(simpleMissing.confirmed, false);
assert.equal(simpleMissing.status, "REQUIRED_BEFORE_FORMAL_MULTI_POINT_OR_MOTION");
const representative = deriveRepresentativeMotionPlacementGate(workspace, ["ED-10", "ED-13", "ED-14", "ED-17", "ED-31"], {packageOnlyShotIds: ["ED-14", "ED-17"], routeOverrides: {"ED-31": {presentationMode: "FULLSCREEN_EXPLAINER_TAKEOVER", frameOccupation: "FULL_FRAME_TAKEOVER", baseVideoRelationship: "TEMPORARY_FULL_FRAME_TAKEOVER", baseSubjectMustRemainVisible: false}}});
assert.equal(representative.status, "PASS");
assert.deepEqual(representative.blockerShotIds, []);
assert.notEqual(workspace.production.assembly.productionWired, true);
assert.notEqual(workspace.production.motion.aeLevelProven, true);
assert.equal(workspace.production.goldenFilmVisualSystemMaturity.userVisualApproval, "NOT_APPROVED");
console.log(JSON.stringify({status: "PASS", ed10: ed10.status, ed31: ed31.status, ed31Takeover: ed31Takeover.status, representative: representative.status, immutable: {productionWired: false, aeLevelProven: false, userVisualApproval: "NOT_APPROVED"}}));
