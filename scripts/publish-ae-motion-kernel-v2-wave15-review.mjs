#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import { createProductionEvent } from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  appRoot = path.join(root, "apps/studio-next"),
  expected = process.argv[2],
  waveRoot = path.join(root, "work/remotion-screen-coverage-wave15-v1"),
  kernelRoot = path.join(root, "work/ae-motion-kernel-v2"),
  plan = JSON.parse(fs.readFileSync(path.join(waveRoot, "plan.json"), "utf8")),
  audit = JSON.parse(
    fs.readFileSync(path.join(kernelRoot, "wave15/audit-report.json"), "utf8"),
  ),
  reel = JSON.parse(
    fs.readFileSync(path.join(waveRoot, "review-reel.json"), "utf8"),
  ),
  parity = JSON.parse(
    fs.readFileSync(
      path.join(kernelRoot, "cavalry-remotion-parity.json"),
      "utf8",
    ),
  ),
  require = createRequire(path.join(root, "apps/studio-next/package.json")),
  sharp = require("sharp"),
  sha = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.match(String(expected || ""), /^[a-f0-9]{64}$/u);
assert.equal(plan.status, "READY");
assert.equal(audit.status, "PASS");
assert.equal(reel.status, "READY_FOR_USER_ACTUAL_PIXEL_REVIEW");
assert.equal(parity.status, "PASS");
assert.equal(audit.sourcePlanSha256, plan.planSha256);
assert.equal(reel.sourcePlanSha256, plan.planSha256);
assert.equal(reel.sourceAuditSha256, audit.auditSha256);
const reelFile = path.join(root, reel.output.path),
  contactFile = path.join(root, audit.contactSheet.path),
  curveFile = path.join(kernelRoot, "curve-calibration-board.png"),
  cavalrySceneFile = path.join(kernelRoot, "cavalry-calibration-scene.jpeg");
assert.equal(sha(reelFile), reel.output.sha256);
assert.equal(sha(contactFile), audit.contactSheet.sha256);
const contactMeta = await sharp(contactFile).metadata(),
  family = "screen-storyboard-wave-15-v11-focus-window-repair",
  reelKey = `${family}/ae-motion-v2-wave15-review-960x540.mp4`,
  contactKey = `${family}/ae-motion-v2-contact-sheet.png`,
  curveKey = `${family}/ae-motion-v2-curve-board.png`,
  cavalryKey = `${family}/cavalry-calibration-scene.jpeg`,
  reelAsset = {
    publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reelKey}`,
    sha256: reel.output.sha256,
    width: 960,
    height: 540,
    durationMs: reel.output.durationMs,
    fps: "60/1",
  },
  contactAsset = {
    publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${contactKey}`,
    sha256: audit.contactSheet.sha256,
    width: contactMeta.width,
    height: contactMeta.height,
  };
const files = {
  [reelKey]: fs.readFileSync(reelFile),
  [contactKey]: fs.readFileSync(contactFile),
  [curveKey]: fs.readFileSync(curveFile),
  [cavalryKey]: fs.readFileSync(cavalrySceneFile),
};
for (const registration of audit.registrations) {
  const source = path.join(root, registration.triptych.path),
    key = `${family}/registration-${registration.shotId.toLowerCase()}-${registration.actorId}.png`;
  files[key] = fs.readFileSync(source);
}
const now = new Date().toISOString(),
  saved = withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(
      readProjectWorkspace(appRoot),
    );
    assert.equal(current.workspaceSha256, expected);
    const currentWave =
      current.production.shotIntelligence.currentStoryboardAuthority
        .screenStoryboardWave;
    assert.equal(currentWave.version, "VISIBLE_MOTION_SIGNAL_V2_FRAME_EXACT_V1");
    assert.equal(currentWave.userVisualApproval, "REJECTED");
    assert.ok(
      currentWave.maturityRejectionHistory?.some(
        (item) => item.contract === "A1ScreenWaveFocusWindowRejection/v1",
      ),
    );
    assert.equal(
      current.production.motion.visibleMotionV2.status,
      "REPRESENTATIVE_PASS_READY_FOR_WAVE15_RENDER",
    );
    let next = structuredClone(current),
      wave =
        next.production.shotIntelligence.currentStoryboardAuthority
          .screenStoryboardWave;
    wave.version = "FOCUS_WINDOW_OCCLUSION_REPAIRED_V1";
    wave.status = "READY_FOR_USER_SHOT_BY_SHOT_REVIEW";
    wave.userVisualApproval = "NOT_APPROVED";
    wave.contactSheet = contactAsset;
    wave.continuousReview = reelAsset;
    wave.curatedReview = {
      contract: "A1VisibleMotionSignalWave15Review/v1",
      status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
      sourcePlanSha256: plan.planSha256,
      sourceAuditSha256: audit.auditSha256,
      reviewReelSha256: reel.reelSha256,
      cavalryParitySha256: parity.paritySha256,
      screenActionDirectionContract: "A1ScreenActionDirection/v2",
      counts: audit.counts,
      visibleMotionCounts: audit.visibleMotionCounts,
      focusWindowPolicy: {
        actorOpacityZeroOutsideEvidencePhase: true,
        sourcePixelsUncovered: true,
        focusOutlineForbidden: true,
        maximumOutsideDimOpacity: 0.16,
      },
      requirements: audit.requirements,
      generatedAt: now,
    };
    next.production.motion.visibleMotionV2 = {
      ...next.production.motion.visibleMotionV2,
      status: "WAVE15_READY_FOR_USER_REVIEW",
      wave15AuditSha256: audit.auditSha256,
      reviewReelSha256: reel.reelSha256,
      updatedAt: now,
    };
    next.production.motion.status =
      "visible-motion-v2-wave15-awaiting-user-review";
    next.production.motion.fullMotionAllowed = false;
    next = recalculateEditorialAssetWorkbench(next, now);
    const event = createProductionEvent({
      workspace: current,
      action: "publish-ae-motion-kernel-v2-wave15-review",
      targetId: reel.output.sha256,
      payload: {
        planSha256: plan.planSha256,
        auditSha256: audit.auditSha256,
        reelSha256: reel.output.sha256,
        cavalryParitySha256: parity.paritySha256,
        userVisualApproval: "NOT_APPROVED",
        productionAdmission: false,
      },
      now,
    });
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    return persistProjectState(appRoot, next, {
      event,
      expectedWorkspaceSha256: current.workspaceSha256,
      binaryFiles: files,
      files: {
        [`${family}/report.json`]: {
          contract: "A1VisibleMotionSignalWave15Review/v1",
          status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
          planSha256: plan.planSha256,
          auditSha256: audit.auditSha256,
          reel: reelAsset,
          contactSheet: contactAsset,
          cavalryParitySha256: parity.paritySha256,
          boundary: {
            userVisualApproval: "NOT_APPROVED",
            productionAdmission: false,
            fullMotionSpecAllowed: false,
          },
        },
      },
    });
  });
console.log(
  JSON.stringify(
    {
      status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
      workspaceSha256After: saved.workspaceSha256,
      reel: reelAsset,
      contactSheet: contactAsset,
      cavalryParitySha256: parity.paritySha256,
      userVisualApproval: "NOT_APPROVED",
      productionAdmission: false,
    },
    null,
    2,
  ),
);
