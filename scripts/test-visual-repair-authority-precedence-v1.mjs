#!/usr/bin/env node
import assert from "node:assert/strict";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";
import {buildPackagingParagraphUpgradeMarker} from "../apps/studio-next/src/lib/a1-packaging-paragraph-quality-v1.mjs";

const projection = derivePackagingLifecycleProjection({
  production: {
    staticPackageReview: {
      status: "VISUAL_REPAIR_REQUIRED",
      objectiveCanary: {status: "OBJECTIVE_VISUAL_CANARY_PASS", current: true},
      visualRepairMatrix: {canaryShotIds: ["ED-12", "ED-17", "ED-31"]},
    },
    objectiveVisualGate: {status: "VISUAL_REPAIR_REQUIRED"},
  },
});
assert.equal(projection.status, "VISUAL_REPAIR_REQUIRED");
assert.equal(projection.authorityStage, "visual-repair-required");
assert.equal(projection.nextActionId, "REVIEW_V8_BOUNDED_REPAIR");
assert.equal(projection.motionAllowed, false);
assert.deepEqual(projection.targetShotIds, ["ED-12", "ED-17", "ED-31"]);
const paragraph = derivePackagingLifecycleProjection({
  production: {
    staticPackageReview: {
      status: "VISUAL_REPAIR_REQUIRED",
      tasteMigration: {
        contract: "A1LegacyPixelTasteMigrationDisposition/v1",
        status: "LEGACY_PIXELS_NOT_TASTE_BOUND",
        productionAdmitted: false,
        legacyShotIds: ["ED-10", "ED-13", "ED-31"],
        packagingParagraphCanary: buildPackagingParagraphUpgradeMarker(),
      },
    },
    objectiveVisualGate: {status: "VISUAL_REPAIR_REQUIRED"},
  },
});
assert.equal(paragraph.nextActionId, "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY");
assert.equal(paragraph.nextUserGate, "PACKAGING_PARAGRAPH_CANARY_AUTHORIZATION");
assert.deepEqual(paragraph.targetShotIds, ["ED-12", "ED-13", "ED-14"]);
assert.deepEqual(paragraph.legacyPixelReviewShotIds, ["ED-10", "ED-13", "ED-31"]);
assert.equal(paragraph.requiresExplicitApproval, true);
assert.equal(paragraph.motionAllowed, false);
const ready = derivePackagingLifecycleProjection({production: {staticPackageReview: {status: "READY_FOR_ACTUAL_PIXEL_REVIEW"}, objectiveVisualGate: {status: "READY_FOR_ACTUAL_PIXEL_REVIEW"}}});
assert.equal(ready.status, "READY_FOR_ACTUAL_PIXEL_REVIEW");
assert.equal(ready.motionAllowed, false);
assert.equal(ready.nextActionId, "INDEPENDENT_ACTUAL_PIXEL_REVIEW_V8_BOUNDED_REPAIR");
console.log(JSON.stringify({status: "PASS", projection: projection.status, paragraphCanaryAction: paragraph.nextActionId, paragraphShotIds: paragraph.targetShotIds, staleCanaryCannotOverrideRepair: true, readyForReviewDoesNotUnlockMotion: true}));
