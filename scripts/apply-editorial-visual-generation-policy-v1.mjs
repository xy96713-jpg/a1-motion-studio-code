#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  A1_EDITORIAL_VISUAL_GENERATION_POLICY,
} from "../apps/studio-next/src/lib/a1-editorial-visual-generation-policy-v1.mjs";
import {createProductionEvent, createProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const previousPolicySha256 = next.visualBible.visualGenerationPolicy?.sha256 || null;
  const shotAssets = next.library.assets.filter((asset) => asset.route === "shot-composition" && asset.shotDemand);
  const previousCandidateCount = shotAssets.reduce((sum, asset) => sum + (asset.candidates?.length || 0), 0);
  const previousSelectedCount = shotAssets.filter((asset) => asset.selectedCandidateId).length;

  next.visualBible.visualGenerationPolicy = A1_EDITORIAL_VISUAL_GENERATION_POLICY;
  next.visualBible.globalRules = [...new Set([
    ...(next.visualBible.globalRules || []),
    "Fusion Pixel 是整片识别性主角；像素短语绑定真人负空间、真实动作、实物或证据，不做通用标题卡。",
    "长中文与事实文字保持本地可编辑；禁止默认系统字体、位图正文和未经逐字核验的 AI 中文。",
    "禁止假界面、假截图、假文档、假证据、漂浮 Logo 卡、解释性 HUD、通用底条、白文档占位卡、无对象箭头和装饰线。",
    "人物镜头必须保护眼睛、嘴部和表情；录屏镜头必须由真实操作形成因果动作。",
    "AI 生图只允许扁平编辑、印刷拼贴、像素、墨纸图形和抽象几何；绝对禁止写实、电影感写实、产品照、库存照、胶片剧照和超写实人物/桌面。",
    "真实人物、真实界面、真实截图、真实文档和事实证据只能来自已批准源素材，AI 不能替代。",
    "动效禁止 opacity-only、统一 scale、统一 index 错峰和通用 clip/translate reveal。",
  ])];
  next.visualBible.hardFailures = [...new Set([
    ...(next.visualBible.hardFailures || []),
    ...Object.values(A1_EDITORIAL_VISUAL_GENERATION_POLICY.forbidden).flat(),
    ...A1_EDITORIAL_VISUAL_GENERATION_POLICY.creativeGeneration.forbiddenModes,
    ...A1_EDITORIAL_VISUAL_GENERATION_POLICY.creativeGeneration.forbiddenGenerationDirectives,
  ])];
  next.typographySystem.visualGenerationPolicy = {
    contract: A1_EDITORIAL_VISUAL_GENERATION_POLICY.contract,
    sha256: A1_EDITORIAL_VISUAL_GENERATION_POLICY.sha256,
    reference: A1_EDITORIAL_VISUAL_GENERATION_POLICY.reference,
    signatureFontAssetId: A1_EDITORIAL_VISUAL_GENERATION_POLICY.typography.signatureFontAssetId,
  };
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.currentStage = "shot-candidates";
  next.production.maturityLoop.allShotSelectedReview = null;
  next.production.maturityLoop.nextAction = "按锁定像素字体与视觉禁令重建逐镜候选";
  if (previousPolicySha256 && previousPolicySha256 !== A1_EDITORIAL_VISUAL_GENERATION_POLICY.sha256) {
    const freshProduction = createProductionState(next, now);
    next.production.maturityLoop.shotReports = {};
    next.production.maturityLoop.rounds = (next.production.maturityLoop.rounds || []).filter((round) => !String(round.targetType || "").startsWith("shot-frame") && round.targetType !== "representative-motion");
    next.production.maturityLoop.provisionalVisualAdmissions = [];
    next.production.maturityLoop.representativeMotionReport = null;
    next.production.maturityLoop.mediumRhythmRevision = null;
    next.production.acceptedShotIr = freshProduction.acceptedShotIr;
    next.production.motion = freshProduction.motion;
    next.production.release = freshProduction.release;
  }

  const event = createProductionEvent({
    workspace: current,
    action: "editorial-visual-generation-policy-applied",
    targetId: A1_EDITORIAL_VISUAL_GENERATION_POLICY.sha256,
    payload: {
      policyContract: A1_EDITORIAL_VISUAL_GENERATION_POLICY.contract,
      policySha256: A1_EDITORIAL_VISUAL_GENERATION_POLICY.sha256,
      previousPolicySha256,
      previousCandidateCount,
      previousSelectedCount,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const invalidatedCandidateCount = previousCandidateCount - recalculated.library.assets
    .filter((asset) => asset.route === "shot-composition")
    .reduce((sum, asset) => sum + (asset.candidates?.length || 0), 0);
  const report = {
    contract: "A1EditorialVisualGenerationPolicyApplication/v1",
    status: "APPLIED",
    policyContract: A1_EDITORIAL_VISUAL_GENERATION_POLICY.contract,
    policySha256: A1_EDITORIAL_VISUAL_GENERATION_POLICY.sha256,
    previousPolicySha256,
    invalidatedCandidateCount,
    invalidatedSelectedCount: previousSelectedCount - recalculated.library.assets.filter((asset) => asset.route === "shot-composition" && asset.selectedCandidateId).length,
    enforcementStages: ["asset-generation-prompt", "scene-graph-candidate", "candidate-approval", "accepted-shot-ir", "motion-ir", "visual-critic"],
    appliedAt: now,
  };
  report.sha256 = sha256(report);
  persistProjectState(appRoot, recalculated, {event, files: {
    "editorial-visual-generation-policy-v1-latest.json": report,
    "editorial-visual-generation-policy-v1.json": A1_EDITORIAL_VISUAL_GENERATION_POLICY,
    "visual-bible.json": recalculated.visualBible,
    "typography-direction.json": recalculated.typographySystem,
  }});
  return {workspace: recalculated, report};
});

console.log(JSON.stringify({
  status: result.report.status,
  policyContract: result.report.policyContract,
  policySha256: result.report.policySha256,
  invalidatedCandidateCount: result.report.invalidatedCandidateCount,
  invalidatedSelectedCount: result.report.invalidatedSelectedCount,
  nextAction: result.workspace.production.maturityLoop.nextAction,
}, null, 2));
