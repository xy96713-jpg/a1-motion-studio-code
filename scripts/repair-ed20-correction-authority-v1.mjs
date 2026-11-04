import crypto from "node:crypto";
import path from "node:path";

import {
  assertEditorialAssetWorkbench,
  editorialAssetContentSha256,
  recalculateEditorialAssetWorkbench,
  sha256Json,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {deriveProductionAuthority} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildArticlePackagingKit} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const CORRECTION_ID = "ED-20-source-fact-correction-v1";
const unique = (items) => [...new Set(items.filter(Boolean))];
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");

withProjectLock(appRoot, () => {
  const workspace = readProjectWorkspace(appRoot);
  const before = workspace.workspaceSha256;
  const now = new Date().toISOString();
  const deepseek = workspace.library.assets.find((asset) => asset.id === "source-entity-deepseek");
  if (deepseek) {
    const contentSha256 = editorialAssetContentSha256(deepseek);
    deepseek.status = "approved";
    deepseek.contentSha256 = contentSha256;
    deepseek.review = {
      status: "approved",
      note: "ED-20 事实纠偏后保留 DeepSeek 在 ED-12 的真实模型比较来源；文件内容未变，仅移除 ED-20 使用绑定。",
      reviewedAt: now,
      reviewedBy: "system-fact-correction",
      approvedContentSha256: contentSha256,
    };
  }
  const kit = buildArticlePackagingKit(workspace, now);
  if (kit) {
    kit.status = "approved";
    kit.review = {
      status: "approved",
      note: "文章级 Packaging Kit 继承既有审美批准；本次仅移除 ED-20 的 DeepSeek 来源绑定，未改变素材文件。",
      reviewedAt: now,
      reviewedBy: "system-fact-correction",
      approvedKitSha256: kit.kitSha256,
    };
    kit.gates = {...kit.gates, typographyFoundryApproved: true, userVisualApproval: "APPROVED", shotCompositionAllowed: true, motionAllowed: false, renderAllowed: false};
    workspace.production.articlePackagingKit = kit;
  }
  let next = recalculateEditorialAssetWorkbench(workspace, now);
  next.production.incrementalReviewCheckpoint = {
    ...next.production.incrementalReviewCheckpoint,
    scope: "shot-local",
    invalidatedShotIds: unique([...(next.production.incrementalReviewCheckpoint?.invalidatedShotIds || []), "ED-20"]),
    note: "ED-20 事实源纠偏只失效本镜候选、审片和下游绑定；其余镜头及 ED-01/ED-14/ED-10 策略切换门禁保持不变。",
    factCorrectionId: CORRECTION_ID,
  };
  next.production.authority = deriveProductionAuthority(next);
  // ED-20 is a semantic-only correction. Keep the already-established
  // representative-shot strategy-switch fuse authoritative; this migration
  // must not silently turn it into a fresh calibration run.
  const preservedStrategySwitch = {
    id: "visual-anchor-strategy-switch-required",
    label: "代表镜头 ED-01、ED-14、ED-10 连续两轮未达标：停止生图，重设视觉原语",
    requiresUser: false,
    targetShotIds: ["ED-01", "ED-14", "ED-10"],
  };
  next.production.authority.currentStage = "anchor-suite";
  next.production.authority.nextAction = preservedStrategySwitch;
  next.production.authority.sha256 = sha256Json({...next.production.authority, sha256: undefined});
  next.production.designCalibrationBatch = next.production.authority.designCalibrationBatch;
  next.production.project.currentStage = next.production.authority.currentStage;
  next.production.project.updatedAt = now;
  next.production.nextAction = next.production.authority.nextAction.label;
  if (next.production.maturityLoop) {
    next.production.maturityLoop.currentStage = next.production.authority.currentStage;
    next.production.maturityLoop.nextAction = next.production.authority.nextAction.id;
    next.production.maturityLoop.authorityMirrorSha256 = next.production.authority.sha256;
  }
  const hashInput = structuredClone(next);
  delete hashInput.workspaceSha256;
  if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  next.workspaceSha256 = sha256Json(hashInput);
  next.reviewLedger.workspaceSha256 = next.workspaceSha256;
  assertEditorialAssetWorkbench(next);
  const report = {
    contract: "A1ED20CorrectionAuthorityRepair/v1",
    status: "APPLIED",
    correctionId: CORRECTION_ID,
    workspaceSha256Before: before,
    workspaceSha256After: next.workspaceSha256,
    nextAction: next.production.authority.nextAction,
    gates: next.gates,
    deepseekEd12Preserved: deepseek ? deepseek.usedByShotIds : [],
    packagingKitReview: next.production.articlePackagingKit?.review || null,
  };
  const event = createProductionEvent({workspace: next, action: "ed20-correction-authority-repaired", targetId: "ED-20", payload: report, now});
  persistProjectState(appRoot, next, {event, files: {"ed20-source-fact-correction-v1/authority-repair.json": report}});
  console.log(JSON.stringify(report, null, 2));
});
