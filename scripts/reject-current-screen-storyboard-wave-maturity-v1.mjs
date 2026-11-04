#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {applyScreenStoryboardShotDecision} from "../apps/studio-next/src/lib/a1-screen-storyboard-review-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expected = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expected || ""))) throw new Error("screen-wave-rejection-cas-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expected) throw new Error(`screen-wave-rejection-cas:${current.workspaceSha256}`);
  const wave = current.production?.shotIntelligence?.currentStoryboardAuthority?.screenStoryboardWave;
  if (wave?.contract !== "A1ScreenStoryboardWave15/v1" || !Array.isArray(wave.shotIds) || wave.shotIds.length !== 15) throw new Error("current-screen-wave-required");
  const now = new Date().toISOString();
  const quote = "好像都是放大缩小的感觉，没有更丰富的感觉。执行吧。";
  const reason = "整套录屏虽然干净，但所有动作仍被压成同一种全景到推近模板；需要按语义拆成不同镜头家族。";
  let next = structuredClone(current);
  for (const shotId of wave.shotIds) {
    const shot = next.production.shotIntelligence.currentStoryboardAuthority.shots.find((item) => item.shotId === shotId);
    next = applyScreenStoryboardShotDecision(next, {
      shotId,
      decision: "REVISE",
      note: reason,
      expectedRevisionSha256: shot.revisionSha256,
      expectedVideoSha256: shot.screenStoryboard.video.sha256,
      expectedBoardSha256: shot.screenStoryboard.board.sha256,
      now,
    });
  }
  const body = {
    contract: "A1ScreenStoryboardWaveMaturityRejection/v1",
    status: "USER_REJECTED_SYSTEM_GRAMMAR",
    userQuote: quote,
    rejectedShotIds: [...wave.shotIds],
    diagnosis: ["UNIFORM_ZOOM_GRAMMAR_OVERUSED", "ACTION_TYPES_VISUALLY_COLLAPSED", "CARRIER_VARIETY_INSUFFICIENT", "CREATOR_PACKAGING_MATURITY_NOT_MET"],
    replacementPolicy: {mode: "SEMANTIC_FAMILY_DIRECTED", requiredFamilies: ["SELECTION_REPLACEMENT", "JUDGMENT_STATE_COMPARE", "GAP_EXPANSION", "RESULT_PANEL_REVEAL", "STATE_SWITCH_HARD_CUT", "FULLSCREEN_RESULT_TRANSITION"], decorativeInteractionFramesAllowed: false, clickRingsAllowed: false, cursorInFinalAllowed: false, maximumSemanticZooms: 1, zeroZoomFamiliesRequired: true, resultStateMustCarryMeaning: true},
    boundaries: {userVisualApproval: "REJECTED", productionAdmission: false, assemblyAllowed: false, fullMotionSpecAllowed: false, resolveAllowed: false, releaseAllowed: false},
    rejectedAt: now,
  };
  const decision = {...body, decisionSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
  const rejectedWave = next.production.shotIntelligence.currentStoryboardAuthority.screenStoryboardWave;
  rejectedWave.status = "USER_REJECTED_SYSTEM_GRAMMAR";
  rejectedWave.userVisualApproval = "REJECTED";
  rejectedWave.maturityRejection = decision;
  rejectedWave.updatedAt = now;
  next.production.motion.status = "screen-storyboard-system-grammar-rebuild-required";
  next.production.motion.fullMotionAllowed = false;
  next.production.motion.screenPackagingPolicy = decision.replacementPolicy;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "reject-current-screen-storyboard-wave-maturity", targetId: decision.decisionSha256, payload: decision, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const saved = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"screen-storyboard-wave-15-v1/maturity-user-rejection-v1.json": decision}});
  return {decision, workspaceSha256After: saved.workspaceSha256};
});

console.log(JSON.stringify({status: result.decision.status, decisionSha256: result.decision.decisionSha256, rejectedShotCount: result.decision.rejectedShotIds.length, replacementPolicy: result.decision.replacementPolicy, workspaceSha256After: result.workspaceSha256After}, null, 2));
