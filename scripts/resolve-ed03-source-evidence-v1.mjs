#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench, sha256Json} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = ensureProductionState(structuredClone(current), now);
  const shot = next.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-03");
  if (!shot) throw new Error("ed03-shot-composition-missing");
  const primary = next.library.assets.find((asset) => asset.id === "source-documentary-preference-action" && asset.review?.status === "approved" && asset.videoEvidence);
  const support = next.library.assets.find((asset) => asset.id === "source-documentary-preference-intercept-action" && asset.review?.status === "approved" && asset.videoEvidence);
  if (!primary || !support) throw new Error("ed03-real-preference-evidence-assets-missing");
  const finalFrame = support.videoEvidence.evidenceFrames.find((frame) => frame.beat === "later-style-proof-intercepts-line") || support.videoEvidence.evidenceFrames.at(-1);
  if (!finalFrame?.publicUrl) throw new Error("ed03-style-proof-final-frame-missing");
  const previousBlock = structuredClone(shot.automationBlock || null);
  const previousAudit = structuredClone(shot.candidateSetAudit || null);
  support.usedByShotIds = [...new Set([...(support.usedByShotIds || []), "ED-03"])]
    .sort((left, right) => left.localeCompare(right));
  support.contentSha256 = editorialAssetContentSha256(support);
  support.review = {
    status: "approved",
    note: "真实风格库结果录屏作为 ED-03 支持证据绑定；仍保留 separate-capture 边界，不冒充同一连续录屏。",
    reviewedAt: now,
    reviewedBy: "system-source-audit",
    approvedContentSha256: support.contentSha256,
  };
  const evidenceBundle = {
    contract: "A1ScreenSemanticEvidenceBundle/v1",
    status: "real-multi-capture-support-bound",
    continuity: "same-real-product-interface-separate-captures",
    primaryActionAssetId: primary.id,
    primaryActionEvidenceSha256: primary.videoEvidence.sha256,
    supportingResultAssetId: support.id,
    supportingResultEvidenceSha256: support.videoEvidence.sha256,
    supportingResultBeat: finalFrame.beat,
    supportingResultFramePublicUrl: finalFrame.publicUrl,
    supportingResultProof: support.videoEvidence.proof || null,
    claimsCovered: ["style-library-result-state", "liked-and-disliked-records-visible"],
    falseContinuityClaimsForbidden: true,
  };
  shot.shotDemand.sourceEvidenceSupportMaterialIds = [support.id];
  shot.shotDemand.sourceEvidenceBundle = evidenceBundle;
  shot.shotDemand.sourceEvidenceResolution = {
    contract: "A1ShotSourceEvidenceResolution/v1",
    status: "support-bound-review-required",
    resolvedAt: now,
    evidenceSha256: sha256Json(evidenceBundle),
    note: "支持证据已绑定，但审片仍须确认静态候选是否把结果状态呈现得足够清楚。",
  };
  shot.shotDemand.missingEvidenceIds = [];
  shot.shotDemand.materialGate = "READY_FOR_CANDIDATE_GENERATION";
  shot.revisionHistory ||= [];
  shot.revisionHistory.push({
    contract: "A1ShotSourceEvidenceBlockResolution/v1",
    reason: "ed03-real-style-library-result-support-bound",
    resolvedAt: now,
    previousAutomationBlock: previousBlock,
    previousCandidateSetAudit: previousAudit,
    evidenceBundle,
  });
  delete shot.automationBlock;
  shot.candidateSetAudit = {
    contract: "A1ShotCandidateSetAudit/v1",
    status: "READY_FOR_CANDIDATE_GENERATION",
    candidateCount: 0,
    structureDirectionCount: shot.shotDemand.structureDirections.length,
    distinctSilhouetteCount: 0,
    requiredDistinctSilhouetteCount: 3,
    visualPrimitiveId: shot.shotDemand.visualPrimitiveId || null,
    imageGenerationDispatched: false,
    renderDispatched: false,
    preflightAt: now,
    blockingReason: null,
  };
  shot.candidates = [];
  shot.selectedCandidateId = null;
  shot.candidateRender = null;
  shot.visualCritic = null;
  shot.status = "brief-ready";
  shot.review = {status: "pending", note: "真实喜欢/讨厌操作与风格库结果支持证据已绑定，等待同一产品界面候选审片。", reviewedAt: now, reviewedBy: "system-source-audit", approvedContentSha256: null};
  const graphDemand = next.assetRequirementGraph?.shotDemands?.find((item) => item.shotId === "ED-03");
  if (graphDemand) {
    graphDemand.candidateAssetIds = [...new Set([...(graphDemand.candidateAssetIds || []), support.id])];
    graphDemand.bindingRepair = {contract: "A1ShotSourceEvidenceResolution/v1", resolvedAt: now, evidenceBundleSha256: sha256Json(evidenceBundle)};
  }
  const event = createProductionEvent({
    workspace: current,
    action: "ed03-real-style-library-result-support-bound",
    targetId: "ED-03",
    payload: {evidenceBundle, primaryAssetId: primary.id, supportingAssetId: support.id},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  assertEditorialAssetWorkbench(recalculated);
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      "anchor-source-evidence-v1/ed03-style-library-result-support.json": {
        contract: "A1ScreenSemanticEvidenceBundle/v1",
        shotId: "ED-03",
        evidenceBundle,
        workspaceSha256: recalculated.workspaceSha256,
      },
    },
  });
  return {workspaceSha256: recalculated.workspaceSha256, evidenceBundle, authorityNextAction: recalculated.production.authority.nextAction};
});

console.log(JSON.stringify({status: "ED03_SOURCE_EVIDENCE_SUPPORT_BOUND", ...result}, null, 2));
