#!/usr/bin/env node
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildCandidateRecommendationAuditAuthority} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {auditSubjectOcclusionGeometry} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {assertVideoPackagingContext} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("overlay-geometry-reconcile-expected-sha-required");

const TARGET_SHOT_IDS = new Set(["ED-08", "ED-13", "ED-31", "ED-32", "ED-34"]);
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const now = new Date().toISOString();

function contextHash(context) {
  const copy = structuredClone(context);
  delete copy.contextSha256;
  delete copy.createdAt;
  return sha256(copy);
}

function pixelAuditHash(audit) {
  const copy = structuredClone(audit);
  delete copy.auditSha256;
  delete copy.generatedAt;
  return sha256(copy);
}

function regionForShot(shotId) {
  if (shotId === "ED-08") {
    return {
      id: "expanded-left-presenter-body-tolerant",
      x: 0.04,
      y: 0.285,
      width: 0.45,
      height: 0.55,
      semanticRole: "expanded-left-field-with-low-body-occlusion-tolerance",
    };
  }
  return {
    id: "expanded-left",
    x: 0.04,
    y: 0.285,
    width: 0.33,
    height: 0.55,
    semanticRole: "expanded-left-negative-space-derived-from-presenter-hold-frame",
  };
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`overlay-geometry-reconcile-sha-precondition-failed:${current.workspaceSha256}`);
  const generation = current.production.generation;
  if (generation.summary.queued !== 0 || generation.summary.running !== 0 || generation.workerStatus !== "frozen") throw new Error("overlay-geometry-reconcile-requires-idle-frozen-worker");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("overlay-geometry-reconcile-assembly-already-created");

  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const decisions = new Map((runtime.decisionSet?.items || []).map((item) => [item.shotId, item]));
  const changed = [];

  for (const plan of runtime.packageLookMasterPlans.filter((item) => TARGET_SHOT_IDS.has(item.shotId) && item.assemblyMode === "OVERLAY" && item.videoContext?.subjectBounds)) {
    const decision = decisions.get(plan.shotId);
    const contextItem = runtime.videoPackagingContexts?.items?.find((item) => item.shotId === plan.shotId);
    if (!decision || !contextItem) throw new Error(`overlay-geometry-reconcile-input-missing:${plan.shotId}`);
    const previousPlanSha256 = plan.planSha256;
    const previousContextSha256 = contextItem.contextSha256;
    const region = regionForShot(plan.shotId);
    const context = structuredClone(contextItem);
    context.availableRegions = [...(context.availableRegions || []).filter((item) => item.id !== region.id), region];
    context.createdAt = now;
    context.contextSha256 = contextHash(context);
    assertVideoPackagingContext(context);

    runtime.videoPackagingContextHistory = [
      ...(runtime.videoPackagingContextHistory || []),
      {...structuredClone(contextItem), current: false, status: "HISTORY_READ_ONLY", supersededAt: now, supersededBy: "current-overlay-geometry-reconcile-v2"},
    ];
    runtime.packageLookMasterPlanHistory = [
      ...(runtime.packageLookMasterPlanHistory || []),
      {...structuredClone(plan), current: false, status: "HISTORY_READ_ONLY", supersededAt: now, supersededBy: "current-overlay-geometry-reconcile-v2"},
    ];
    runtime.videoPackagingContexts = {
      ...runtime.videoPackagingContexts,
      items: runtime.videoPackagingContexts.items.map((item) => item.shotId === plan.shotId ? context : item),
    };
    plan.videoContext = structuredClone(context);
    plan.planSha256 = sha256(planIdentity(plan));
    assertPackageLookMasterPlan(plan);

    const rawResults = [];
    for (const raw of (runtime.lookMasterRawReferences || []).filter((item) => item.shotId === plan.shotId && item.current === true && item.planSha256 === previousPlanSha256)) {
      const artifactFile = path.join(appRoot, "public", String(raw.artifact.publicUrl || "").replace(/^\//u, ""));
      const geometry = await auditSubjectOcclusionGeometry({
        candidateFile: artifactFile,
        subjectBounds: context.subjectBounds,
        faceBounds: context.faceBounds,
        eyesBounds: context.eyesBounds,
        availableRegions: context.availableRegions,
        targetWidth: context.baseFrame.width,
        targetHeight: context.baseFrame.height,
      });
      const pixel = structuredClone(raw.pixelAudit || {});
      pixel.planSha256 = plan.planSha256;
      pixel.footageCompatibility = {
        ...(pixel.footageCompatibility || {}),
        status: pixel.status === "PASS" && geometry.status === "PASS" ? "PASS" : "FAIL",
        reason: geometry.status === "PASS" ? "actual-base-frame-composite-readable" : "base-subject-or-available-region-geometry-failed",
        subjectOcclusion: geometry,
      };
      pixel.admissionAllowed = pixel.status === "PASS" && pixel.footageCompatibility.status === "PASS";
      pixel.generatedAt = now;
      pixel.auditSha256 = pixelAuditHash(pixel);
      raw.pixelAudit = pixel;
      raw.pixelAuditPublicUrl = raw.pixelAuditPublicUrl || null;
      raw.planSha256 = plan.planSha256;
      raw.styleBriefSha256 = plan.styleBriefSha256;
      raw.current = true;
      raw.candidateAuditAuthority = buildCandidateRecommendationAuditAuthority({rawReference: raw, plan, decision, now});
      raw.recommendationEligible = raw.candidateAuditAuthority.status === "PASS";
      raw.selectionEligible = raw.recommendationEligible;
      raw.assemblyEligible = raw.recommendationEligible;
      if (!raw.recommendationEligible && raw.status !== "VISUAL_REJECTED_ACTUAL_PIXEL_SEMANTIC_AUDIT") raw.status = "VISUAL_REJECTED_ACTUAL_PIXEL_SEMANTIC_AUDIT";
      if (raw.recommendationEligible && raw.status === "VISUAL_REJECTED_ACTUAL_PIXEL_SEMANTIC_AUDIT") raw.status = "CANDIDATE_AUDIT_AUTHORITY_PASS_REBOUND";
      for (const job of next.production.generation.jobs || []) {
        if (job.status === "complete" && job.output?.sha256 === raw.artifact?.sha256 && job.lookMasterPlanSha256 === previousPlanSha256) job.lookMasterPlanSha256 = plan.planSha256;
      }
      rawResults.push({directionId: raw.candidateDirectionId, artifactSha256: raw.artifact.sha256, geometryStatus: geometry.status, authorityStatus: raw.candidateAuditAuthority.status, geometry});
    }
    delete plan.wholeFilmBoardRecommendation;
    delete plan.provisionalWholeFilmBoardSelection;
    if (rawResults.some((item) => item.authorityStatus === "PASS")) plan.status = "LOOK_MASTER_CANDIDATES_READY";
    changed.push({shotId: plan.shotId, previousPlanSha256, currentPlanSha256: plan.planSha256, previousContextSha256, currentContextSha256: context.contextSha256, addedRegion: region, rawResults});
  }

  next.production.generationRecompile = {
    ...(next.production.generationRecompile || {}),
    contract: "A1CurrentOverlayGeometryReconcile/v2",
    status: "APPLIED",
    targetShotIds: [...TARGET_SHOT_IDS],
    changed,
    generatedImageCount: 0,
    artifactSha256Changed: false,
    appliedAt: now,
  };
  const event = createProductionEvent({
    workspace: current,
    action: "reconcile-current-overlay-geometry-v2",
    targetId: [...TARGET_SHOT_IDS].join(","),
    payload: {contract: "A1CurrentOverlayGeometryReconcile/v2", changed, generatedImageCount: 0, artifactSha256Changed: false, assemblyCreated: false, downstreamStarted: false},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.production.shotIntelligence.currentAssembly = [];
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {
    ...(next.production.shotIntelligence.wholeFilmBatchRecommendation || {}),
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    updatedAt: now,
  };
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (recalculated.production.generation.summary.queued !== 0 || recalculated.production.generation.summary.running !== 0 || recalculated.production.generation.workerStatus !== "frozen") throw new Error("overlay-geometry-reconcile-generation-state-changed");
  if (recalculated.production.shotIntelligence.currentAssembly.length !== 0) throw new Error("overlay-geometry-reconcile-created-assembly");
  const report = {contract: "A1CurrentOverlayGeometryReconcileReport/v2", status: "PASS", workspaceSha256Before: current.workspaceSha256, targetShotIds: [...TARGET_SHOT_IDS], changed, generatedImageCount: 0, artifactSha256Changed: false, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: 0, downstreamLocked: true, generatedAt: now};
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `overlay-geometry-reconcile-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"look-master-exception-repair-v2/overlay-geometry-reconcile-v2.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, journal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
