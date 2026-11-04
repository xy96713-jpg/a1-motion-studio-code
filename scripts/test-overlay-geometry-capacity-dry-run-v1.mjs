#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const reportPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/golden-film-visual-system-maturity-v1/overlay-geometry-dry-run/geometry-capacity-dry-run.json");
const contactPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/golden-film-visual-system-maturity-v1/overlay-geometry-dry-run/presenter-matte-route-contact-sheet.png");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
assert.equal(report.contract, "A1PresenterMatteRouteDryRun/v1");
assert.equal(report.geometryContract, "A1ModeAwarePresenterPackagingGeometryContract/v2");
assert.deepEqual(report.safeRegionForegroundOverlayFeasibleShotIds, []);
assert.deepEqual(report.layeredCompositeRoutePassShotIds, ["ED-08", "ED-31"]);
assert.deepEqual(report.takeoverRoutePassShotIds, ["ED-07", "ED-13", "ED-34", "ED-19"]);
assert.equal(report.generationPolicy.generationAllowed, false);
assert.equal(report.secondWave.adoptedGeneratedCount, 0);
assert.equal(report.secondWave.allHistoryReadOnly, true);
assert.equal(fs.existsSync(contactPath), true);
for (const shot of report.shots) {
  assert.equal(shot.geometryContract.forbiddenLegacyFields.includes("SUBJECT_BBOX_ONLY_AS_FINAL_COMPOSITE_GATE"), true);
  assert.equal(shot.matte.contract, "A1StaticPresenterMatte/v1");
  assert.equal(shot.matte.componentMasks.hair.sha256.length, 64);
  assert.equal(shot.matte.componentMasks.microphone.sha256.length, 64);
  assert.deepEqual(shot.matte.zOrder, ["BASE_FRAME", "BEHIND_SUBJECT_PACKAGE", "PRESENTER_MATTE", "OPTIONAL_FOREGROUND_ACCENT"]);
  assert.equal(shot.modeAudit.status, "PASS");
  assert.equal(shot.finalComposite.sha256.length, 64);
}
console.log(JSON.stringify({status: "PASS", contract: report.contract, targetShotIds: report.targetShotIds, layeredCompositeRoutePassShotIds: report.layeredCompositeRoutePassShotIds, takeoverRoutePassShotIds: report.takeoverRoutePassShotIds, contactSheet: contactPath}, null, 2));
