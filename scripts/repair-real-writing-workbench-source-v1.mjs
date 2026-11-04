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
const sourcePath = "/Users/a1/Documents/Codex/声音/outputs/packaging_july1/editorial_packaging_v2/assets/workbench_main.png";
const outputRelative = "generated/system-line/editorial-asset-workbench-v1/source-cache/real-writing-workbench-main.png";
const outputPath = path.join(publicRoot, outputRelative);
const now = new Date().toISOString();
if (!fs.existsSync(sourcePath)) throw new Error(`real-writing-workbench-source-missing:${sourcePath}`);
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.copyFileSync(sourcePath, outputPath);
const fileSha256 = crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex");
const targetIds = [
  "source-documentary-selection-action",
  "source-documentary-document-surface",
  "source-documentary-workbench-overview",
];

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  for (const assetId of targetIds) {
    const asset = next.library.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error(`documentary-source-asset-missing:${assetId}`);
    asset.assetUri = `/${outputRelative}`;
    asset.sha256 = fileSha256;
    asset.sourceUri = path.relative(root, sourcePath);
    asset.preview = {kind: "source-image", publicUrl: `/${outputRelative}`};
    asset.provenance = {
      sourceType: "verified-user-owned-writing-workbench-capture",
      sourceUri: path.relative(root, sourcePath),
      license: "user-owned local product capture",
      reviewed: true,
      evidenceBoundary: assetId === "source-documentary-selection-action"
        ? "static-design-proof-only; causal selection-rewrite screen recording still required"
        : "real writing workbench surface",
    };
    asset.contentSha256 = editorialAssetContentSha256(asset);
    asset.status = "approved";
    asset.review = {
      status: "approved",
      note: assetId === "source-documentary-selection-action"
        ? "已替换为真实稿台截图；只允许做静态对象绑定设计，未把它冒充真实划选录屏。"
        : "已替换为用户真实稿台截图，不再使用旧 4311 审片页作为界面证据。",
      reviewedAt: now,
      reviewedBy: "system-source-audit",
      approvedContentSha256: asset.contentSha256,
    };
  }

  const invalidatedShotIds = [];
  for (const shot of next.library.assets.filter((asset) => asset.route === "shot-composition" && (asset.candidates?.length || asset.selectedCandidateId || asset.candidateRender))) {
    invalidatedShotIds.push(shot.shotDemand.shotId);
    shot.revisionHistory ||= [];
    shot.revisionHistory.push({
      contract: "A1RejectedShotCandidateRound/v1",
      round: Number(shot.visualRevision?.round || 1),
      reason: "source-asset-pack-replaced-with-real-writing-workbench",
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
    shot.review = {status: "pending", note: "真实来源包已更新，旧候选自动失效。", reviewedAt: now, reviewedBy: "system-source-audit", approvedContentSha256: null};
    shot.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: 1, sourceReportSha256: null, prompt: "只使用真实稿台表面与对象绑定裁切；禁止旧审片页、伪 UI、漂浮面板和 HUD。", createdAt: now};
  }

  next.production.assembly.screenMediaBound = false;
  next.production.assembly.writingWorkbenchStaticBound = true;
  next.production.assembly.causalScreenRecordingBound = false;
  next.production.assembly.status = "design-proof-ready-real-presenter-and-causal-screen-video-missing";
  for (const key of ["screen-1", "screen-2"]) if (next.production.assembly.mediaBindings[key]) {
    next.production.assembly.mediaBindings[key].admissionStatus = "REJECTED_UNRELATED_TO_CURRENT_ARTICLE_CAUSAL_ACTION";
  }
  next.production.maturityLoop.shotReports = Object.fromEntries(Object.entries(next.production.maturityLoop.shotReports || {}).filter(([shotId]) => !invalidatedShotIds.includes(shotId)));
  next.production.maturityLoop.provisionalVisualAdmissions = (next.production.maturityLoop.provisionalVisualAdmissions || []).filter((id) => !invalidatedShotIds.includes(id));
  next.production.maturityLoop.status = "paused-for-representative-shot-rebuild";
  next.production.maturityLoop.nextAction = "rebuild-and-inspect-ED-02-ED-07-ED-10-ED-12-ED-14-with-real-source-pack";
  next.production.maturityLoop.updatedAt = now;

  const event = createProductionEvent({
    workspace: current,
    action: "fake-review-ui-source-replaced-with-real-writing-workbench",
    payload: {targetIds, sourcePath, outputRelative, fileSha256, invalidatedShotIds, causalScreenRecordingBound: false},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return {workspace: recalculated, invalidatedShotIds};
});

console.log(JSON.stringify({
  status: "REAL_WRITING_WORKBENCH_SOURCE_BOUND",
  targetIds,
  fileSha256,
  invalidatedShotIds: updated.invalidatedShotIds,
  writingWorkbenchStaticBound: true,
  causalScreenRecordingBound: false,
  nextAction: updated.workspace.production.maturityLoop.nextAction,
}, null, 2));
