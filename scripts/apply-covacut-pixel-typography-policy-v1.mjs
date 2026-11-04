#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {assertReferenceSourceEligible} from "../apps/studio-next/src/lib/a1-reference-source-exclusions-v1.mjs";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY,
  auditPixelEditorialTypographyAssignments,
  buildPixelEditorialTypographyAssignment,
} from "../apps/studio-next/src/lib/a1-pixel-editorial-typography-policy-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const now = new Date().toISOString();
assertReferenceSourceEligible("covacut");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const shots = next.library.assets
    .filter((asset) => asset.route === "shot-composition" && asset.shotDemand)
    .sort((left, right) => left.shotDemand.order - right.shotDemand.order);

  for (const asset of shots) {
    const previous = asset.shotDemand.typographyAssignment || {};
    const generatedGlyphAssetId = previous.generatedGlyphAssetIds?.[0] || null;
    asset.shotDemand.typographyAssignment = buildPixelEditorialTypographyAssignment({
      shot: asset.shotDemand,
      headlineText: previous.headlineText,
      generatedGlyphAssetId,
    });
    asset.candidates = [];
    asset.candidateRender = null;
    asset.selectedCandidateId = null;
    asset.visualCritic = null;
    asset.status = "brief-ready";
    asset.review = {
      status: "pending",
      note: "covacut 像素字体主视觉策略已写入；旧候选的字体职责和真人贴纸语法已失效，必须重新构图。",
      reviewedAt: now,
      reviewedBy: "system",
      approvedContentSha256: null,
    };
  }

  const audit = auditPixelEditorialTypographyAssignments(shots.map((asset) => asset.shotDemand));
  if (audit.status !== "PASS") throw new Error(`covacut-pixel-policy-audit-failed:${audit.failures.join(",")}`);

  next.typographySystem.referenceProfile = A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY;
  next.typographySystem.thesis = "Fusion Pixel 成为全文识别性主角：短语、动作和判断直接绑定真人、实物或证据对象；长证据文字才交给辅助字体。";
  next.typographySystem.policy.minimumPixelAssignedShotRatio = A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY.minimumPixelAssignedShotRatio;
  next.typographySystem.policy.minimumDominantPixelShotRatioAmongPackagedShots = A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY.minimumDominantPixelShotRatioAmongPackagedShots;
  next.typographySystem.shotAssignments = shots.map((asset) => structuredClone(asset.shotDemand.typographyAssignment));
  next.visualBible.typographyReferenceProfile = A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY;
  next.visualBible.globalRules = [...new Set([
    ...(next.visualBible.globalRules || []),
    "Fusion Pixel 是全文识别性主角；辅助字体只负责长句可读性或少量反差。",
    "真人镜头的像素短语必须绑定真实负空间、手或实物动作；禁止漂浮贴纸、HUD、底条和无对象线条。",
    "大字号像素冲击只用于身份、转折和判断；普通口播使用小尺度浅黄色像素字幕，不堆满画面。",
  ])];

  const pixelFontAsset = next.library.assets.find((asset) => asset.id === "type-pixel-correction");
  if (!pixelFontAsset) throw new Error("covacut-pixel-font-asset-missing");
  pixelFontAsset.name = "全文像素主视觉字";
  pixelFontAsset.purpose = "Fusion Pixel 承担全文身份、动作与判断重音；真人镜头直接贴合真实空间，长证据文字由辅助字体承担。";
  pixelFontAsset.semanticRole = "whole-film-pixel-signature";
  pixelFontAsset.usedByShotIds = shots.filter((asset) => asset.shotDemand.editMode !== "presenter-clean").map((asset) => asset.shotDemand.shotId);
  pixelFontAsset.promptBrief = "用文章核心短语检查 Fusion Pixel 的中文覆盖、短语轮廓、浅黄色小字幕与大字判断两档；禁止做成漂浮贴纸或通用标题卡。";

  const typographyPlan = next.library.assets.find((asset) => asset.route === "typography-plan");
  if (typographyPlan) {
    typographyPlan.purpose = "批准 covacut 参考约束下的全文像素主视觉、辅助字体职责、逐镜占空比和对象绑定规则。";
    typographyPlan.promptBrief = "审核像素字体是否在真人、实物和证据中成为识别性主角；禁止退回小标签、贴纸、HUD 或统一标题卡。";
    typographyPlan.review = {
      status: "approved",
      note: "用户已明确指定 covacut 像素字体感觉为系统偏好；本次将其固化为全文字体策略，仍不代表逐镜视觉成熟。",
      reviewedAt: now,
      reviewedBy: "user-explicit-direction",
      approvedContentSha256: null,
    };
  }

  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.currentStage = "shot-candidates";
  next.production.maturityLoop.allShotSelectedReview = null;
  next.production.maturityLoop.nextAction = "rebuild-34-shots-with-covacut-pixel-typography-policy";
  const policyReport = {
    contract: "A1CovacutPixelTypographyPolicyApplication/v1",
    status: "APPLIED_REBUILD_REQUIRED",
    policy: A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY,
    audit,
    invalidatedShotIds: shots.map((asset) => asset.shotDemand.shotId),
    appliedAt: now,
  };
  policyReport.sha256 = sha256(policyReport);
  const event = createProductionEvent({
    workspace: current,
    action: "covacut-pixel-typography-policy-applied",
    targetId: policyReport.sha256,
    payload: {referenceUrl: A1_PIXEL_EDITORIAL_TYPOGRAPHY_POLICY.reference.url, invalidatedShotCount: shots.length, audit},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const refreshedPlan = recalculated.library.assets.find((asset) => asset.route === "typography-plan");
  if (refreshedPlan) refreshedPlan.review = {
    status: "approved",
    note: "用户已明确指定 covacut 像素字体感觉为系统偏好；本次批准字体职责，不代表逐镜视觉成熟。",
    reviewedAt: now,
    reviewedBy: "user-explicit-direction",
    approvedContentSha256: refreshedPlan.contentSha256,
  };
  const refreshedPixelFont = recalculated.library.assets.find((asset) => asset.id === "type-pixel-correction");
  if (refreshedPixelFont) refreshedPixelFont.review = {
    status: "approved",
    note: "用户明确采用现有 Fusion Pixel 为整片像素主视觉；字体文件和中文覆盖未改变，仅升级镜头职责。",
    reviewedAt: now,
    reviewedBy: "user-explicit-direction",
    approvedContentSha256: refreshedPixelFont.contentSha256,
  };
  const finalState = recalculateEditorialAssetWorkbench(recalculated, now);
  persistProjectState(appRoot, finalState, {event, files: {
    "covacut-pixel-typography-policy-v1-latest.json": policyReport,
    "typography-direction.json": finalState.typographySystem,
    "visual-bible.json": finalState.visualBible,
  }});
  return {workspace: finalState, report: policyReport};
});

console.log(JSON.stringify({
  status: result.report.status,
  workspaceSha256: result.workspace.workspaceSha256,
  audit: result.report.audit,
  invalidatedShotCount: result.report.invalidatedShotIds.length,
  nextAction: result.workspace.production.maturityLoop.nextAction,
}, null, 2));
