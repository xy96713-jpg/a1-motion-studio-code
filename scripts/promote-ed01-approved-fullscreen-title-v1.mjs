#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const source = path.join(root, ".codex-artifacts/system-progress-system-line/ed01-approved-fullscreen-title-v1/ED-01-fullscreen-title.png");
const reportPath = path.join(root, ".codex-artifacts/system-progress-system-line/ed01-approved-fullscreen-title-v1/report.json");
if (!fs.existsSync(source) || !fs.existsSync(reportPath)) throw new Error("ed01-approved-fullscreen-candidate-missing");
const bytes = fs.readFileSync(source);
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
if (report.output?.sha256 !== sha256 || report.layout?.fullFrameTakeover !== true || report.exactCopy?.[0] !== "智能写作工作台") throw new Error("ed01-approved-fullscreen-candidate-invalid");
const publicUrl = "/generated/system-line/editorial-asset-workbench-v1/current-storyboard-authority-v1/ED-01-fullscreen-title.png";
const now = new Date().toISOString();

const result = await withProjectLock(appRoot, async () => {
  const current = readProjectWorkspace(appRoot);
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const authority = runtime.currentStoryboardAuthority;
  const shot = authority?.shots?.find((item) => item.shotId === "ED-01");
  const coverage = next.production.shotVisualCoveragePlan?.shotPlans?.find((item) => item.shotId === "ED-01");
  const boardItem = runtime.wholeFilmStaticBoard?.items?.find((item) => item.shotId === "ED-01");
  const timelineItem = runtime.wholeFilmStaticBoard?.timelineBoard?.items?.find((item) => item.shotId === "ED-01");
  if (!shot || !coverage || !boardItem || !timelineItem) throw new Error("ed01-current-storyboard-target-missing");
  const binding = {
    artifactPublicUrl: publicUrl,
    artifactSha256: sha256,
    artifactKind: "SINGLE_RENDERABLE_FRAME",
    versionId: "ed01-approved-fullscreen-title-v1",
    route: "PACKAGE_LOOK_MASTER",
    packageType: "FULLSCREEN_PACKAGE",
    presentationMode: "FULLSCREEN_WORKBENCH_OPENING",
    frameOccupation: "FULL_FRAME_TAKEOVER",
    source: "LOCAL_GLYPH_BOUND_APPROVED_STYLEFRAME",
    sourceAuthority: "full-static-storyboard-rework-v4/ED-01.png",
    styleGrammar: report.preservedGrammar,
    exactCopy: report.exactCopy,
    fontBinding: report.font,
    assetProducer: "LOCAL_TYPOGRAPHY_COMPOSITE",
    assetBindingStatus: "CURRENT_REVIEW_REQUIRED",
    current: true,
    authoritativeOverride: true,
    reviewOnly: true,
    productionAdmission: false,
    promotedAt: now,
  };
  Object.assign(shot, binding);
  Object.assign(coverage, {
    preview: {publicUrl, sha256, width: 1920, height: 1080},
    actualVisualReady: true,
    route: binding.route,
    routeLabel: "全屏文字包装",
    packageDecision: "PACKAGE",
    packageType: binding.packageType,
    presentationMode: binding.presentationMode,
    frameOccupation: binding.frameOccupation,
    productionStatus: "CURRENT_VISUAL_REVIEW_REQUIRED",
    storyboardRevisionStatus: "CURRENT_REVIEW_REQUIRED",
    planOnly: false,
    semanticRecompileRequired: false,
  });
  for (const item of [boardItem, timelineItem]) Object.assign(item, {
    artifactPublicUrl: publicUrl,
    artifactSha256: sha256,
    previewPublicUrl: publicUrl,
    previewSha256: sha256,
    currentStoryboardVersionId: binding.versionId,
    currentStoryboardVersionStatus: "CURRENT_REVIEW_REQUIRED",
    route: binding.route,
    routeLabel: "FULLSCREEN TITLE",
    presentationMode: binding.presentationMode,
    frameOccupation: binding.frameOccupation,
    packageBoardItem: true,
  });
  authority.status = "PENDING_USER_APPROVAL";
  authority.userVisualApproval = "NOT_APPROVED";
  authority.productionAdmission = false;
  authority.motionAllowed = false;
  authority.updatedAt = now;
  authority.lastEditedShotId = "ED-01";
  runtime.wholeFilmStaticBoard.status = "PENDING_USER_APPROVAL";
  runtime.wholeFilmStaticBoard.userVisualApproval = "NOT_APPROVED";
  runtime.wholeFilmStaticBoard.approvalAllowed = true;
  runtime.wholeFilmStaticBoard.reviewOnly = true;
  runtime.wholeFilmStaticBoard.productionAdmission = false;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const event = createProductionEvent({workspace: current, action: "promote-ed01-approved-fullscreen-title", targetId: "ED-01", payload: {versionId: binding.versionId, artifactSha256: sha256, exactCopy: report.exactCopy, userVisualApproval: "NOT_APPROVED", productionAdmission: false}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    binaryFiles: {
      "current-storyboard-authority-v1/ED-01-fullscreen-title.png": bytes,
      "ed01-approved-fullscreen-title-v1/ED-01-fullscreen-title.png": bytes,
    },
    files: {
      "ed01-approved-fullscreen-title-v1/report.json": {...report, status: "PROMOTED_FOR_USER_REVIEW", publicUrl, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, promotedAt: now},
      "current-storyboard-authority-v1/ED-01-fullscreen-title-promotion.json": {contract: "A1Ed01FullscreenTitlePromotion/v1", status: "PASS", shotId: "ED-01", versionId: binding.versionId, artifactPublicUrl: publicUrl, artifactSha256: sha256, previousArtifactPublicUrl: current.production.shotIntelligence.currentStoryboardAuthority.shots.find((item) => item.shotId === "ED-01")?.artifactPublicUrl || null, userVisualApproval: "NOT_APPROVED", productionAdmission: false, promotedAt: now},
    },
  });
  return recalculated;
});
console.log(JSON.stringify({status: "PASS", shotId: "ED-01", versionId: "ed01-approved-fullscreen-title-v1", artifactPublicUrl: publicUrl, artifactSha256: sha256, workspaceSha256: result.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmission: false}, null, 2));
