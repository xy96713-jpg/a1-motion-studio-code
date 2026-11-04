#!/usr/bin/env node
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {reviewArticlePackagingKit} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {assertShotPresentationSystem, correctEd32PresenterSourceBoundary} from "../apps/studio-next/src/lib/a1-shot-presentation-system-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  const correction = correctEd32PresenterSourceBoundary(structuredClone(current), now);
  let recalculated = recalculateEditorialAssetWorkbench(correction.workspace, now);
  recalculated = reviewArticlePackagingKit(
    recalculated,
    "approved",
    "系统仅把 ED-32 重新绑定到已审核的同一连续真人源，并新增逐镜导演决策与素材清单合同；没有改变文章设计包像素、风格或其他 33 镜绑定。",
    now,
    "system-visual-critic",
  );
  recalculated = recalculateEditorialAssetWorkbench(recalculated, now);
  assertShotPresentationSystem(recalculated);
  const validated = assertEditorialAssetWorkbench(recalculated);
  const decisions = validated.production.presentationDecisions;
  const manifest = validated.production.materialManifestV2;
  const event = createProductionEvent({
    workspace: current,
    action: "shot-presentation-decisions-and-material-manifest-v2-compiled",
    targetId: decisions.sha256,
    payload: {
      decisionContract: decisions.contract,
      decisionCount: decisions.shotCount,
      materialManifestContract: manifest.contract,
      materialSlotCount: manifest.summary.materialSlotCount,
      blindFullFilmGenerationAllowed: manifest.policy.blindFullFilmGenerationAllowed,
      ed32SourceBoundaryCorrected: correction.changed,
      generatedImages: false,
      renderedVideo: false,
    },
    now,
  });
  validated.production.eventLedger.eventCount += 1;
  validated.production.eventLedger.lastEventId = event.eventId;
  validated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: "A1ShotPresentationSystemMigration/v1",
    status: "PASS",
    workspaceSha256: validated.workspaceSha256,
    presentationDecisionSetSha256: decisions.sha256,
    materialManifestV2Sha256: manifest.sha256,
    decisionSummary: {
      shotCount: decisions.shotCount,
      status: decisions.status,
      genericTitleExecutorCount: decisions.sequenceAudit.genericTitleExecutorCount,
      ordinaryExplanationTypePrimaryCount: decisions.sequenceAudit.ordinaryExplanationTypePrimaryCount,
      longScreenRunsPass: decisions.sequenceAudit.longScreenRunsPass,
      screenRuns: decisions.sequenceAudit.screenRuns,
    },
    materialSummary: manifest.summary,
    policy: manifest.policy,
    ed32SourceBoundary: {
      changed: correction.changed,
      sourceAssetId: correction.sourceAssetId,
      sourceSha256: correction.sourceSha256,
      inventedDeskOrHandsRequirementAllowed: false,
      reviewCriteria: ["face-continuity", "mouth-movement", "ending-pause", "direct-gaze"],
    },
    generatedImages: false,
    renderedVideo: false,
    migratedAt: now,
  };
  persistProjectState(appRoot, validated, {
    event,
    files: {
      "presentation-decision-set-v1.json": decisions,
      "material-manifest-v2.json": manifest,
      "shot-presentation-system-v1/report.json": report,
    },
  });
  console.log(JSON.stringify(report, null, 2));
});
