#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
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
  expected = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expected || "")))
  throw new Error("whole-film-540p-authority-cas-required");
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expected)
    throw new Error(`whole-film-540p-authority-cas:${current.workspaceSha256}`);
  if (
    current.production.release?.review540p?.status !==
    "READY_FOR_USER_WHOLE_FILM_REVIEW"
  )
    throw new Error("whole-film-540p-review-artifact-required");
  if (
    current.production.motion?.fullFilmMotionSpecPlan?.status !== "READY" ||
    current.production.motion.fullFilmMotionSpecPlan.readyShotIds?.length !== 34 ||
    current.production.motion.fullFilmMotionSpecPlan.blockedShotIds?.length !== 0
  )
    throw new Error("whole-film-540p-motion-spec-plan-not-ready");
  const reviewReportPath = path.join(
    appRoot,
    "public/generated/system-line/editorial-asset-workbench-v1/current-full-film-540p-v1/report.json",
  );
  const reviewReport = JSON.parse(fs.readFileSync(reviewReportPath, "utf8"));
  const resets = reviewReport.screenRunBreathing?.resets || [];
  if (resets.length !== 3)
    throw new Error("whole-film-540p-screen-run-reset-count-invalid");
  const now = new Date().toISOString();
  let next = structuredClone(current);
  next.production.motion = {
    ...next.production.motion,
    status: "full-film-motion-specs-ready",
    fullMotionAllowed: true,
  };
  next.production.release.review540p = {
    ...next.production.release.review540p,
    screenRunBreathing: {
      resetCount: resets.length,
      approvedPreHoldMs:
        reviewReport.screenRunBreathing.approvedPreHoldMs || 550,
      preHoldShotIds:
        reviewReport.screenRunBreathing.preHoldShotIds ||
        resets.map((item) => item.afterShotId),
    },
  };
  next = assertEditorialAssetWorkbench(
    recalculateEditorialAssetWorkbench(next, now),
  );
  if (
    next.production.authority?.nextAction?.id !==
      "review-current-whole-film-540p" ||
    next.production.authority.nextAction.requiresUser !== true
  )
    throw new Error(
      `whole-film-540p-authority-projection-invalid:${next.production.authority?.nextAction?.id}`,
    );
  const report = {
    contract: "A1CurrentWholeFilm540pAuthorityReconciliation/v1",
    status: "PASS",
    videoSha256: current.production.release.review540p.sha256,
    motionStatus: next.production.motion.status,
    screenRunBreathing: next.production.release.review540p.screenRunBreathing,
    nextAction: next.production.authority.nextAction,
    reconciledAt: now,
  };
  const event = createProductionEvent({
    workspace: current,
    action: "reconcile-current-whole-film-540p-authority",
    targetId: report.videoSha256,
    payload: report,
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {
      "current-full-film-540p-v1/authority-reconciliation.json": report,
    },
  });
  return { ...report, workspaceSha256After: committed.workspaceSha256 };
});
console.log(JSON.stringify(result, null, 2));
