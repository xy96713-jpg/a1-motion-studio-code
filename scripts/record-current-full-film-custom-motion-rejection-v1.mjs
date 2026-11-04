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
const phase = "generated/system-line/editorial-asset-workbench-v1";
const expected = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expected || ""))) throw new Error("custom-motion-rejection-cas-required");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (workspace.workspaceSha256 !== expected) throw new Error(`custom-motion-rejection-cas:${workspace.workspaceSha256}`);
if (workspace.production.authority?.nextAction?.id !== "review-current-whole-film-540p") throw new Error("custom-motion-rejection-review-stage-required");
const filmReportPath = path.join(publicRoot, phase, "current-full-film-540p-v1/report.json");
const film = JSON.parse(fs.readFileSync(filmReportPath, "utf8"));
const now = new Date().toISOString();
const body = {
  contract: "A1CurrentFullFilmCustomMotionRejection/v1",
  status: "VISUAL_REJECTED_CUSTOM_MOTION_DRIFT",
  userQuote: "根本不行 还是你自己一点点拼凑是不是 还是很漂移 不能用成熟的吗 不要自己造可以吗",
  rejectedVideoSha256: film.video.sha256,
  diagnosis: [
    "THIRTEEN_SCREEN_SHOTS_STILL_USE_CUSTOM_C4_CAMERA",
    "FULL_FILM_ASSEMBLED_BY_CUSTOM_REMOTION_AND_FFMPEG_CHAIN",
    "LOCAL_FREEZE_AND_CROSSFADE_PATCHES_MASK_BUT_DO_NOT_REMOVE_DRIFT",
    "MACHINE_GATES_PASSED_WITHOUT_MATCHING_USER_VISUAL_MATURITY",
  ],
  requiredReplacementRoute: {
    screenCaptureAndCamera: "CAP_NATIVE_FOR_ALL_SIXTEEN_SCREEN_SHOTS",
    editorialAssembly: "DAVINCI_RESOLVE_NATIVE_TIMELINE_AND_STANDARD_TRANSITIONS",
    customCameraAllowed: false,
    customCrossfadeAllowed: false,
    existingCapProjects: ["ED-03", "ED-24", "ED-26"],
    missingCapActionFamilies: ["causalRewrite", "paragraph", "review", "presentation", "saveHistory", "historyIsolation", "preferenceIntercept"],
    resolveStatusAtDecision: "RUNNING_BLANK_UNTITLED_PROJECT_NO_TIMELINE",
  },
  locks: {
    rejectedCandidateNotApprovable: true,
    final1080pAllowed: false,
    resolveAssemblyFromRejectedCandidateAllowed: false,
    publicationAllowed: false,
  },
  rejectedAt: now,
};
const decision = {...body, decisionSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
const saved = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expected) throw new Error(`custom-motion-rejection-persist-cas:${current.workspaceSha256}`);
  let next = structuredClone(current);
  next.production.release.review540p = {
    ...next.production.release.review540p,
    userVisualApproval: "REJECTED",
    rejectionDecisionSha256: decision.decisionSha256,
    rejectedAt: now,
  };
  next.production.motion = {
    ...next.production.motion,
    status: "mature-tool-native-rebuild-required",
    currentFullFilmVisualRejection: decision,
    matureToolRebuild: {
      status: "CAP_NATIVE_SOURCE_REBUILD_REQUIRED_BEFORE_RESOLVE_ASSEMBLY",
      missingCapActionFamilies: decision.requiredReplacementRoute.missingCapActionFamilies,
      resolveAssemblyAllowed: false,
    },
    updatedAt: now,
  };
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "reject-current-full-film-custom-motion-drift", targetId: film.video.sha256, payload: decision, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"current-full-film-540p-v1/custom-motion-user-rejection.json": decision}});
});
console.log(JSON.stringify({status: decision.status, decisionSha256: decision.decisionSha256, rejectedVideoSha256: decision.rejectedVideoSha256, missingCapActionFamilies: decision.requiredReplacementRoute.missingCapActionFamilies, workspaceSha256After: saved.workspaceSha256}, null, 2));
