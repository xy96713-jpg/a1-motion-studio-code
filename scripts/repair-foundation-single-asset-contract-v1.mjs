#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const contaminated = /生成(?:一组\s*)?六张|生成一组\s*6\s*张|1）.+2）/u;
const now = new Date().toISOString();

function canonicalPrompt(asset) {
  if (asset.stageId === "element-atlas") {
    return `${asset.purpose}。只生成这一张 4x3 可拆元素图集；12 个元素彼此隔离并保留透明裁切间距。这是一张有意的素材图集，不是多方向设计样张。`;
  }
  if (asset.stageId === "key-backgrounds") {
    return `${asset.purpose}。只生成这一张完整 16:9 无字关键背景；一个场景、一个相机视角、一个材料因果，不做网格、联系表或备选方向。`;
  }
  return `用当前文章视觉策略生成“${asset.purpose}”这一张完整 16:9 无字底材。只保留一个材料机制、一个主轮廓和一块可编辑中文字安全区；不得生成多张方案、六宫格、样张板、联系表或重复缩略图。`;
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const repaired = [];
  for (const asset of next.library.assets.filter((item) => ["background-foundry", "element-atlas", "key-backgrounds"].includes(item.stageId))) {
    if (!contaminated.test(String(asset.promptBrief || ""))) continue;
    asset.revisionHistory ||= [];
    asset.revisionHistory.push({round: asset.visualRevision?.round || null, assetUri: asset.assetUri || null, sha256: asset.sha256 || null, visualCritic: asset.visualCritic || null, archivedAt: now, reason: "multi-output-prompt-contract-contamination"});
    asset.promptBrief = canonicalPrompt(asset);
    asset.assetUri = null;
    asset.sha256 = null;
    asset.preview = null;
    asset.visualCritic = null;
    asset.status = "generation-ready";
    asset.review = {status: "pending", note: "已修复为一任务一张资产；旧的多输出提示词结果已降级，不再进入资产包。", reviewedAt: now, reviewedBy: "system", approvedContentSha256: null};
    asset.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: 1, sourceReportSha256: null, prompt: canonicalPrompt(asset), createdAt: now};
    repaired.push(asset.id);
  }
  next.production.maturityLoop.foundationReports ||= {};
  if (repaired.some((id) => id.startsWith("bg-"))) delete next.production.maturityLoop.foundationReports["background-foundry"];
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.nextAction = repaired.length ? `regenerate-single-asset-foundations:${repaired.join(",")}` : next.production.maturityLoop.nextAction;
  const event = createProductionEvent({workspace: current, action: "foundation-single-asset-contract-repaired", targetId: "foundation-assets", payload: {repaired}});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return {repaired, workspaceSha256: recalculated.workspaceSha256};
});

console.log(JSON.stringify({status: "PASS", ...result}, null, 2));
