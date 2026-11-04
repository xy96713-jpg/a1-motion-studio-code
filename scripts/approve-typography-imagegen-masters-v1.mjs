#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {reviewTypographyPhrase} from "../apps/studio-next/src/lib/a1-typography-foundry-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();
const approvals = [
  {assetId: "glyph-board-ai-taste", candidateId: "glyph-board-ai-taste-direction-02", exactText: "AI 味"},
  {assetId: "glyph-board-polished-waste", candidateId: "glyph-board-polished-waste-direction-02", exactText: "完成度很高的废稿"},
];

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  let next = ensureProductionState(current, now);
  const approvedAssets = [];
  for (const item of approvals) {
    const asset = next.library.assets.find((candidate) => candidate.id === item.assetId);
    if (!asset?.typographySpec) throw new Error(`typography-asset-missing:${item.assetId}`);
    const candidate = asset.typographySpec.generatedCandidates.find((entry) => entry.id === item.candidateId);
    if (!candidate || candidate.textVerification?.status !== "verified" || !candidate.cutoutPublicUrl) throw new Error(`typography-candidate-not-verified:${item.candidateId}`);
    if (Number(candidate.visualCritic?.score || 0) < 22) throw new Error(`typography-candidate-score-below-threshold:${item.candidateId}`);
    const contentSha256 = editorialAssetContentSha256(asset);
    asset.status = "approved";
    asset.review = {
      status: "approved",
      note: "图像生成母版已作为 reference-only styleframe 接入；正式字形仍采用逐字核验且带透明 cutout 的候选，editable text shadow 保持权威。",
      reviewedAt: now,
      reviewedBy: "system-visual-critic",
      approvedContentSha256: contentSha256,
    };
    approvedAssets.push({assetId: item.assetId, candidateId: item.candidateId, exactText: item.exactText, contentSha256});
  }
  for (const item of approvals) {
    next = reviewTypographyPhrase(
      next,
      item.assetId,
      item.candidateId,
      "approved",
      "保留 22/24+、逐字核验且透明 cutout 完整的正式字形；新 imagegen master 只作为 reference-only styleframe，不替代可编辑文字或真实来源。",
      now,
      "system-visual-critic",
    );
  }
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const event = createProductionEvent({
    workspace: current,
    action: "typography-imagegen-master-bindings-approved",
    targetId: "glyph-board-ai-taste,glyph-board-polished-waste",
    payload: {approvedAssets},
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      "typography-imagegen-master-approval-v1.json": {
        contract: "A1TypographyImagegenMasterApproval/v1",
        approvedAt: now,
        approvedAssets,
        workspaceSha256: recalculated.workspaceSha256,
      },
    },
  });
  console.log(JSON.stringify({status: "APPROVED_REFERENCE_ONLY", approvedAt: now, approvedAssets, gates: recalculated.gates, workspaceSha256: recalculated.workspaceSha256}, null, 2));
});
