#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
const laneId = process.argv[3];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("storyboard-lane-approval-workspace-sha-required");
if (laneId !== "XIAOYUNQUE_MOTION") throw new Error("storyboard-lane-approval-lane-invalid");
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`storyboard-lane-approval-cas:${current.workspaceSha256}`);
  const authority = current.production?.shotIntelligence?.currentStoryboardAuthority;
  if (authority?.contract !== "A1CurrentStoryboardAuthority/v1" || authority.current !== true || authority.shots?.length !== 34) throw new Error("storyboard-lane-approval-current-authority-required");
  const targets = authority.shots.filter((shot) => shot.route === "PACKAGE_LOOK_MASTER" && shot.packageType === "EXPLAINER_PACKAGE");
  if (targets.length !== 5 || targets.some((shot) => !shot.versionId || !/^[a-f0-9]{64}$/u.test(String(shot.artifactSha256 || "")))) throw new Error("storyboard-lane-approval-five-bound-shots-required");
  const items = targets.map((shot) => ({shotId: shot.shotId, versionId: shot.versionId, artifactPublicUrl: shot.artifactPublicUrl, artifactSha256: shot.artifactSha256, source: shot.source, externalGenerationMode: shot.source === "REAL_SOURCE" ? "TEXTLESS_DERIVED_ACTOR_ONLY" : "CURRENT_STORYBOARD_DERIVED_ACTOR"}));
  const now = new Date().toISOString();
  const body = {contract: "A1StoryboardLaneApproval/v1", status: "APPROVED", laneId, approvalScope: "CURRENT_FIVE_EXPLAINER_PACKAGE_SHOTS_ONLY", sourceWorkspaceSha256: current.workspaceSha256, storyboardRevisionSha256: authority.lastRevisionSha256 || null, items, decision: {approvedBy: "user", instruction: "需要小云雀包装的都通过了；录屏仍在执行优化，不要求全片批准。", fullStoryboardApproved: false, screenLaneApproved: false, fullMotionSpecAllowed: false, finalRenderAllowed: false}, approvedAt: now};
  const approval = {...body, decisionSha256: hash(body)};
  let next = structuredClone(current);
  next.production.storyboardLaneApprovals = [...(next.production.storyboardLaneApprovals || []).filter((item) => item.laneId !== laneId || item.storyboardRevisionSha256 !== approval.storyboardRevisionSha256), approval];
  const approvedIds = new Set(items.map((item) => item.shotId));
  for (const shot of next.production.shotIntelligence.currentStoryboardAuthority.shots) {
    if (approvedIds.has(shot.shotId)) shot.assetBindingStatus = "USER_APPROVED_XIAOYUNQUE_LANE";
  }
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "approve-current-storyboard-lane", targetId: approval.decisionSha256, payload: {laneId, storyboardRevisionSha256: approval.storyboardRevisionSha256, shotIds: items.map((item) => item.shotId), fullStoryboardApproved: false, screenLaneApproved: false, fullMotionSpecAllowed: false, finalRenderAllowed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"storyboard-lane-approvals-v1/xiaoyunque-motion.json": approval}});
  return {status: "PASS", workspaceSha256After: committed.workspaceSha256, approval, globalAuthority: {currentStage: next.production.authority.currentStage, nextAction: next.production.authority.nextAction, fullMotionAllowed: next.production.motion.fullMotionAllowed}};
});
console.log(JSON.stringify(result, null, 2));
