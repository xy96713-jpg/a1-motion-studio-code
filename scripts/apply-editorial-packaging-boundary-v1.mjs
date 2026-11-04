#!/usr/bin/env node
import path from "node:path";
import {
  A1_EDITORIAL_PACKAGING_BOUNDARY_CONTRACT,
  A1_PACKAGING_BEAT_PLAN_CONTRACT,
  buildPackagingBoundary,
  buildPackagingPlanFromWorkspace,
  assertPackagingBeatPlan,
  packagingPlanWithAnchorSampling,
} from "../apps/studio-next/src/lib/a1-editorial-packaging-boundary-v1.mjs";
import {auditRetroPixelStyleBriefs, compileRetroPixelEditorialStyleBrief, mergeRetroPixelDiversityHistory} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const boundary = buildPackagingBoundary({projectId: current.production.project.projectId, sourceHash: current.article.sourceTextSha256, now});
  const rawPlan = buildPackagingPlanFromWorkspace(current, {now});
  const {plan} = packagingPlanWithAnchorSampling(rawPlan, {maxAnchors: 3, anchorSampleLimit: 3});
  assertPackagingBeatPlan(plan);
  const styleBriefs = plan.packagingEvents.map((event) => compileRetroPixelEditorialStyleBrief({event, appRoot, now}));
  const previousHistory = (current.production.retroPixelEditorialDiversityHistory?.entries || [])
    .filter((entry) => entry.visualStatus === "VISUAL_APPROVED" || entry.status === "VISUAL_APPROVED");
  const styleBriefAudit = auditRetroPixelStyleBriefs(styleBriefs, {appRoot, recentHistory: previousHistory, distinctEventIds: plan.anchorSampling.selectedEventIds});
  const proposedFingerprints = styleBriefs.map((brief) => ({outputId: brief.outputId, styleBriefSha256: brief.styleBriefSha256, fingerprint: brief.fingerprint, status: "READY_FOR_REVIEW"}));
  const diversityHistory = mergeRetroPixelDiversityHistory(previousHistory, []);
  diversityHistory.proposedFingerprints = proposedFingerprints;
  const planChanged = current.production.packagingBeatPlan?.sha256 !== plan.sha256;
  const next = structuredClone(current);
  next.production.packagingBoundary = {
    ...boundary,
    supersedes: ["A1ShotPresentationDecisionSet/v1", "A1MaterialManifest/v2", "A1PresentationRendererStaticProof/v1"],
    reason: "user-clarified-packaging-only-boundary",
    legacyVisualAuthority: {status: "SUPERSEDED", advisoryOnly: true, reason: "user-clarified-packaging-only-boundary"},
  };
  next.production.packagingBeatPlan = plan;
  next.production.packagingStyleBriefs = styleBriefs;
  next.production.packagingStyleBriefAudit = styleBriefAudit;
  next.production.retroPixelEditorialDiversityHistory = diversityHistory;
  if (planChanged) next.production.packagingAnchorProof = null;
  next.production.legacyVisualAuthority = {
    contract: "A1LegacySixShotVisualAuthority/v1",
    status: "SUPERSEDED",
    advisoryOnly: true,
    reason: "user-clarified-packaging-only-boundary",
    supersededBy: A1_PACKAGING_BEAT_PLAN_CONTRACT,
    supersededAt: now,
  };
  if (next.production.presentationRendererProof) {
    next.production.presentationRendererProof = {
      ...next.production.presentationRendererProof,
      status: "SUPERSEDED",
      supersededBy: A1_PACKAGING_BEAT_PLAN_CONTRACT,
      supersededReason: "user-clarified-packaging-only-boundary",
    };
  }
  if (next.production.presentationDecisions) {
    next.production.presentationDecisions = {
      ...next.production.presentationDecisions,
      authorityScope: "legacy-advisory",
      advisoryOnly: true,
      supersededBy: A1_PACKAGING_BEAT_PLAN_CONTRACT,
      supersededReason: "user-clarified-packaging-only-boundary",
    };
  }
  if (next.production.materialManifestV2) {
    next.production.materialManifestV2 = {
      ...next.production.materialManifestV2,
      authorityScope: "legacy-advisory",
      advisoryOnly: true,
      supersededBy: A1_PACKAGING_BEAT_PLAN_CONTRACT,
      supersededReason: "user-clarified-packaging-only-boundary",
    };
  }
  next.production.packagingBoundary.legacySupersededBlocks = next.library.assets
    .filter((asset) => ["ED-03", "ED-32"].includes(asset.shotDemand?.shotId) && asset.automationBlock)
    .map((asset) => ({shotId: asset.shotDemand.shotId, automationBlock: asset.automationBlock}));
  next.library.assets = next.library.assets.map((asset) => {
    if (asset.shotDemand?.shotId !== "ED-03" || !asset.automationBlock) return asset;
    const {automationBlock, ...withoutCurrentBlock} = asset;
    return withoutCurrentBlock;
  });
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const validated = assertEditorialAssetWorkbench(recalculated);
  const event = createProductionEvent({
    workspace: current,
    action: "migrate-to-editorial-packaging-only-boundary",
    targetId: plan.sha256,
    payload: {
      boundaryContract: A1_EDITORIAL_PACKAGING_BOUNDARY_CONTRACT,
      planContract: A1_PACKAGING_BEAT_PLAN_CONTRACT,
      semanticBeatCount: plan.semanticBeatCount,
      packagingEventCount: plan.packagingEventCount,
      noPackageCount: plan.noPackageCount,
      supersededSixShotProof: true,
      generatedImages: false,
      criticPerformed: false,
      renderedVideo: false,
    },
    now,
  });
  validated.production.eventLedger.eventCount += 1;
  validated.production.eventLedger.lastEventId = event.eventId;
  validated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: A1_EDITORIAL_PACKAGING_BOUNDARY_CONTRACT,
    planContract: A1_PACKAGING_BEAT_PLAN_CONTRACT,
    status: "PASS",
    workspaceSha256: validated.workspaceSha256,
    boundary,
      plan,
      styleBriefs,
      styleBriefAudit,
      diversityHistory,
    superseded: {sixShotProof: "A1PresentationRendererStaticProof/v1", presentationDecisions: "A1ShotPresentationDecisionSet/v1", materialManifest: "A1MaterialManifest/v2", reason: "user-clarified-packaging-only-boundary"},
    generatedImages: false,
    criticPerformed: false,
    renderedVideo: false,
    migratedAt: now,
  };
  persistProjectState(appRoot, validated, {event, files: {"packaging-boundary-v1.json": boundary, "packaging-beat-plan-v1.json": plan, "packaging-boundary-v1/report.json": report}});
  console.log(JSON.stringify({status: report.status, workspaceSha256: report.workspaceSha256, semanticBeatCount: plan.semanticBeatCount, packagingEventCount: plan.packagingEventCount, noPackageCount: plan.noPackageCount, packagingEvents: plan.packagingEvents.map((event) => ({eventId: event.eventId, sourceBeatIds: event.sourceBeatIds, packagingType: event.packagingType})), nextAction: validated.production.authority.nextAction, queue: validated.production.generation.summary, worker: validated.production.generation.workerStatus}, null, 2));
});
