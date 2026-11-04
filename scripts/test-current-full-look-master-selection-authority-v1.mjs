#!/usr/bin/env node

import assert from "node:assert/strict";

import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildPackageItems} from "./build-whole-film-static-board-pending-v1.mjs";
import {buildCreatorPaletteBoundRepairTransition} from "./compile-creator-packaging-palette-bound-repair-v1.mjs";

const appRoot = new URL("../apps/studio-next/", import.meta.url).pathname;
const workspace = readProjectWorkspace(appRoot);
const fixture = structuredClone(workspace);
fixture.production.creatorPaletteBoundRepair = {
  ...(fixture.production.creatorPaletteBoundRepair || {}),
  repairInputSha256: null,
};

const transition = buildCreatorPaletteBoundRepairTransition(fixture, {now: "2026-08-10T00:00:00.000Z"});
assert.equal(transition.noop, false);

const expectedSelections = new Map([
  ["ED-07", "925c608f27ea77ab17e4019ca480d4c1f30036117e882e1ab775429cff519d71"],
  ["ED-13", "cf14c0daa693a6e9e3c66560d96d442e3a297f2938f3df34e470ec61939aa12b"],
  ["ED-14", "51fc2a241c635ddb5128e859298bf365ce406df737f5cb940b5cdf953a3a4e19"],
  ["ED-16", "97c6ceeddc020fb33591cdeeb9891e9be2ba081d541dbb777b95ca528804eed3"],
  ["ED-19", "07e283756dd8138de020a84b9bf5b98110cb47cf29f351f2923a656d8fd18791"],
]);

for (const [shotId, expectedSha256] of expectedSelections) {
  const plan = transition.workspace.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const binding = transition.bindingManifest.entries.find((item) => item.shotId === shotId);
  assert.equal(plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256, expectedSha256, `${shotId}: current full Look Master remains selected`);
  assert.equal(binding?.actualShotCandidateSha256, expectedSha256, `${shotId}: binding follows current full Look Master`);
  assert.equal(binding?.status, "PASS", `${shotId}: selected full Look Master binds deterministically`);
  assert.equal(binding?.fullLookMasterBindingEvidence?.status, "PASS", `${shotId}: universal reference evidence passes`);
}

const ed16 = transition.bindingManifest.entries.find((item) => item.shotId === "ED-16");
assert.equal(ed16?.fullLookMasterBindingEvidence?.actualPixelAdmission?.evidencePath, "TRUSTED_FULL_FRAME_ACTUAL_PIXEL_ASSESSMENT");
const staticBoardScope = buildCanonicalStaticBoardScope(transition.workspace);
assert.equal(staticBoardScope.status, "PASS");
const staticBoardItems = buildPackageItems(transition.workspace, staticBoardScope);
assert.equal(staticBoardItems.length, 13);
assert.ok(staticBoardItems.some((item) => item.shotId === "ED-16"), "static board accepts the same trusted full-frame actual-pixel evidence as binding");
assert.equal(transition.workspace.production.generation.workerStatus, "frozen");
assert.equal(transition.workspace.production.generation.summary.queued, 0);
assert.equal(transition.workspace.production.generation.summary.running, 0);

console.log(JSON.stringify({
  status: "PASS",
  selectedShotIds: [...expectedSelections.keys()],
  passCount: transition.bindingManifest.passCount,
  blockedShotIds: transition.bindingManifest.blockedShotIds,
  ed16ActualPixelEvidencePath: ed16.fullLookMasterBindingEvidence.actualPixelAdmission.evidencePath,
  staticBoardPackageCount: staticBoardItems.length,
  workerStatus: transition.workspace.production.generation.workerStatus,
}, null, 2));
