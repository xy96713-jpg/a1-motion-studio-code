#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("representative-motion-canary-reconcile-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`representative-motion-canary-reconcile-cas:${current.workspaceSha256}`);
  const canary = current.production.motion?.representativeCanary;
  if (canary?.status !== "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW" || canary.actualPixelGate?.status !== "PASS" || canary.userVisualApproval !== "PENDING") throw new Error("representative-motion-canary-review-ready-state-required");
  for (const artifact of [canary.video, canary.contactSheet]) {
    const file = path.join(publicRoot, artifact.publicUrl.replace(/^\//u, ""));
    if (!fs.existsSync(file) || shaFile(file) !== artifact.sha256) throw new Error("representative-motion-canary-artifact-invalid");
  }
  const now = new Date().toISOString();
  let next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(current), now));
  if (next.production.authority?.nextAction?.id !== "review-representative-motion-canary") throw new Error(`representative-motion-canary-review-projection-invalid:${next.production.authority?.nextAction?.id}`);
  const event = createProductionEvent({workspace: current, action: "reconcile-representative-motion-canary-authority", targetId: canary.reportSha256, payload: {status: canary.status, reportSha256: canary.reportSha256, videoSha256: canary.video.sha256, actualPixelGate: canary.actualPixelGate, userVisualApproval: "PENDING"}, now});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `representative-motion-canary-review-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {status: "READY_FOR_USER_REPRESENTATIVE_MOTION_CANARY_REVIEW", workspaceSha256After: committed.workspaceSha256, nextAction: next.production.authority.nextAction, video: canary.video, contactSheet: canary.contactSheet};
});
console.log(JSON.stringify(result, null, 2));
