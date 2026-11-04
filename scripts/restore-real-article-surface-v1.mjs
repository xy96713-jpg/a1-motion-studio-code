#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sourcePath = path.join(root, "remotion-renderer/public/editorial-documentary-reset-v1/source/document-surface.png");
const outputRelative = "generated/system-line/editorial-asset-workbench-v1/source-cache/document-surface.png";
const outputPath = path.join(publicRoot, outputRelative);
const rendererOutputPath = path.join(root, "remotion-renderer/public", outputRelative);
const now = new Date().toISOString();

if (!fs.existsSync(sourcePath)) throw new Error(`real-article-surface-missing:${sourcePath}`);
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.copyFileSync(sourcePath, outputPath);
fs.mkdirSync(path.dirname(rendererOutputPath), {recursive: true});
fs.copyFileSync(sourcePath, rendererOutputPath);
const fileSha256 = crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const assetId = "source-documentary-document-surface";
  const asset = next.library.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error(`article-surface-asset-missing:${assetId}`);
  const previousSha256 = asset.sha256 || null;

  asset.assetUri = `/${outputRelative}`;
  asset.sha256 = fileSha256;
  asset.contentSha256 = fileSha256;
  asset.sourceUri = "remotion-renderer/public/editorial-documentary-reset-v1/source/document-surface.png";
  asset.preview = {kind: "source-image", publicUrl: `/${outputRelative}`};
  asset.provenance = {
    sourceType: "real-local-writing-workbench",
    sourceUri: "http://127.0.0.1:8766/v2/?documentId=first_video_concise_strengthened_20260617",
    documentId: "first_video_concise_strengthened_20260617",
    captureReport: "remotion-renderer/public/editorial-documentary-reset-v1/source/report.json",
    license: "user-owned local writing-workbench capture",
    reviewed: true,
    evidenceBoundary: "real article document surface; source-bound crop and grade only",
  };
  asset.status = "approved";
  asset.review = {
    status: "approved",
    note: "恢复为真实文章证据页；不再把工作台总览误当成文章表面。",
    reviewedAt: now,
    reviewedBy: "system-source-audit",
    approvedContentSha256: editorialAssetContentSha256(asset),
  };
  asset.contentSha256 = editorialAssetContentSha256(asset);

  const dependentShotIds = asset.usedByShotIds || [];
  const invalidatedShotIds = [];
  for (const shot of next.library.assets.filter((item) => item.route === "shot-composition" && dependentShotIds.includes(item.shotDemand?.shotId))) {
    invalidatedShotIds.push(shot.shotDemand.shotId);
    shot.revisionHistory ||= [];
    shot.revisionHistory.push({
      contract: "A1RejectedShotCandidateRound/v1",
      round: Number(shot.visualRevision?.round || 1),
      reason: "real-article-surface-restored",
      candidates: shot.candidates || [],
      candidateRender: shot.candidateRender || null,
      visualCritic: shot.visualCritic || null,
      archivedAt: now,
    });
    shot.candidates = [];
    shot.selectedCandidateId = null;
    delete shot.candidateRender;
    delete shot.visualCritic;
    shot.status = "brief-ready";
    shot.review = {status: "pending", note: "真实文章证据表面更新，旧候选自动失效。", reviewedAt: now, reviewedBy: "system-source-audit", approvedContentSha256: null};
    shot.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: Number(shot.visualRevision?.round || 1) + 1, sourceReportSha256: null, prompt: "只使用真实文章证据表面与对象绑定裁切；禁止工作台总览、伪 UI、漂浮面板和 HUD。", createdAt: now};
  }

  next.production.maturityLoop.shotReports = Object.fromEntries(Object.entries(next.production.maturityLoop.shotReports || {}).filter(([shotId]) => !invalidatedShotIds.includes(shotId)));
  next.production.maturityLoop.provisionalVisualAdmissions = (next.production.maturityLoop.provisionalVisualAdmissions || []).filter((shotId) => !invalidatedShotIds.includes(shotId));
  next.production.maturityLoop.status = "paused-for-real-article-surface-rebuild";
  next.production.maturityLoop.nextAction = "rebuild-and-critique-ED-09-with-real-article-surface";
  next.production.maturityLoop.updatedAt = now;

  const event = createProductionEvent({
    workspace: current,
    action: "real-article-surface-restored",
    payload: {assetId, previousSha256, fileSha256, outputRelative, invalidatedShotIds},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return {invalidatedShotIds, eventId: event.eventId};
});

console.log(JSON.stringify({
  status: "REAL_ARTICLE_SURFACE_RESTORED",
  assetId: "source-documentary-document-surface",
  publicUrl: `/${outputRelative}`,
  fileSha256,
  invalidatedShotIds: result.invalidatedShotIds,
  eventId: result.eventId,
  gatesRemainClosed: true,
}, null, 2));
