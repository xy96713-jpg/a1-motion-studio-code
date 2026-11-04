#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
const sha = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ppt-like-canary-rejection-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ppt-like-canary-rejection-cas:${current.workspaceSha256}`);
  const canary = current.production.motion?.representativeCanary;
  if (current.production.authority?.nextAction?.id !== "review-representative-motion-canary" || canary?.status !== "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW" || canary.userVisualApproval !== "PENDING") throw new Error("ppt-like-canary-current-review-required");
  const now = new Date().toISOString();
  const decisionBody = {contract: "A1RepresentativeMotionCanaryUserDecision/v1", status: "VISUAL_REJECTED_PPT_LIKE", decision: "REJECT_AND_REBUILD_ACTION_STORYBOARD", userQuote: "不可以这样拼接的，很简陋。要么分层，要么交给视频生成。", diagnosis: ["FLAT_RASTER_REGION_SPLICING", "NO_TRUE_LAYER_OCCLUSION", "NO_GENERATIVE_INBETWEENING", "VISUALLY_SIMPLE_ASSEMBLY"], requiredProductionRoutes: ["TRUE_TRANSPARENT_LAYER_RECONSTRUCTION", "BOUNDED_VIDEO_GENERATION"], rejectedReportSha256: canary.reportSha256, rejectedVideoSha256: canary.video.sha256, targetShotIds: canary.representativeShotIds, rejectedAt: now};
  const decision = {...decisionBody, decisionSha256: sha(decisionBody)};
  let next = structuredClone(current);
  next.production.motion.representativeCanary = {...canary, status: decision.status, userVisualApproval: "REJECTED", rejectionDecisionSha256: decision.decisionSha256, rejection: decision};
  next.production.motion.status = "representative-motion-action-storyboard-required";
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (next.production.authority?.nextAction?.id !== "build-representative-motion-action-storyboard") throw new Error(`ppt-like-canary-rejection-next-action-invalid:${next.production.authority?.nextAction?.id}`);
  const event = createProductionEvent({workspace: current, action: "reject-ppt-like-representative-motion-canary", targetId: canary.reportSha256, payload: decision, now});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `reject-ppt-canary-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-raster-slice-motion-canary-v1/user-rejection.json": decision}});
  return {status: decision.status, decisionSha256: decision.decisionSha256, workspaceSha256After: committed.workspaceSha256, nextAction: next.production.authority.nextAction};
});
console.log(JSON.stringify(result, null, 2));
