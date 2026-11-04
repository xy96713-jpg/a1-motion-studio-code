#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  displayProtectedPhrasesForLookMaster,
  recompilePackageLookMasterCandidateDirections,
  topologyFingerprint,
} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {
  A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
  UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const UNIVERSAL_REFERENCE_RETRY_RECOMPILE_CONTRACT = "A1UniversalReferenceLookMasterRetryRecompile/v1";
export const UNIVERSAL_REFERENCE_RETRY_REVISION_ID = "EXACT_COPY_LEGIBILITY_ROUTE_DIVERSE_V3";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir} = projectDirs(appRoot);
const maturityRelativePath = "golden-film-visual-system-maturity-v1/maturity-run.json";
const reportRelativePath = "golden-film-visual-system-maturity-v1/universal-reference-retry-recompile.json";
const actualPixelAuditRelativePath = "golden-film-visual-system-maturity-v1/actual-pixel-audit.json";
const visualDirectorReviewRelativePath = "golden-film-visual-system-maturity-v1/full-look-master-visual-director-review.json";
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function sorted(values = []) {
  return [...new Set(values)].sort();
}

function retryDirectiveIdentity(value = {}) {
  return JSON.stringify({
    shotId: value.shotId || null,
    status: value.status || null,
    failureCodes: sorted(value.failureCodes || []),
    displayProtectedPhrases: value.displayProtectedPhrases || [],
    requiredVisualAction: value.requiredVisualAction || null,
    forbiddenPatterns: value.forbiddenPatterns || [],
    primitiveSwitchRequired: value.primitiveSwitchRequired === true,
  });
}

function currentRetryDirectionsAreValid(plan) {
  const directions = plan.candidateDirections || [];
  return directions.length === plan.candidateBudget
    && new Set(directions.map((item) => item.primaryFamily)).size >= Math.min(2, plan.candidateBudget)
    && new Set(directions.map((item) => topologyFingerprint(item))).size === directions.length;
}

function machineDerivedRepairDirective(plan, candidateAudits) {
  const auditFailureCodes = sorted(candidateAudits.flatMap((item) => item.rejectionReasons || []));
  const exactCopyFailure = auditFailureCodes.some((code) => /OCR_EXACT_COPY_MISMATCH|CHARACTER_VERIFICATION|MISSING_PROTECTED_PHRASE/iu.test(code));
  const visualPrimitiveFailure = auditFailureCodes.some((code) => /VISUAL_DIRECTOR_REJECTED/iu.test(code));
  return {
    contract: "A1FullLookMasterRepairDirective/v1",
    shotId: plan.shotId,
    status: "STRUCTURAL_RETRY_REQUIRED",
    failureCodes: sorted([
      ...auditFailureCodes,
      ...(exactCopyFailure ? ["OCR_GLYPH_LEGIBILITY_HARD_FAIL"] : []),
      ...(visualPrimitiveFailure ? ["VISUAL_PRIMITIVE_TOO_GENERIC"] : []),
    ]),
    displayProtectedPhrases: displayProtectedPhrasesForLookMaster(plan.protectedPhrases || []),
    requiredVisualAction: "Keep every protected phrase as large, solid, undistorted Simplified-Chinese glyphs with complete strokes. Make the semantic state change happen once in a separate continuous paper, registration, object, or material path around the type; never erode, fold, fragment, texture, occlude, crop, or replace any glyph. Use one full-frame actor and one reading path, not a numbered sequence or card row.",
    forbiddenPatterns: [
      "distorted or missing Chinese glyph",
      "destructive texture through readable type",
      "extra readable filler copy",
      "numbered card sequence",
      "generic dashboard or UI",
      "duplicate headline",
      "small isolated labels",
    ],
    primitiveSwitchRequired: true,
    evidenceSource: "CURRENT_ACTUAL_PIXEL_AUDIT_AND_VISUAL_DIRECTOR_REVIEW",
  };
}

export function recompileUniversalReferenceLookMasterRetry({now = new Date().toISOString()} = {}) {
  return withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const runtime = before.production.shotIntelligence || {};
    const maturity = readJson(path.join(publicDir, maturityRelativePath));
    const binding = before.production.creatorPaletteShotBindingManifest || {};
    const actualPixelAudit = readJson(path.join(publicDir, actualPixelAuditRelativePath));
    const visualDirectorReview = readJson(path.join(publicDir, visualDirectorReviewRelativePath));
    const bindingBlockedShotIds = new Set(binding.blockedShotIds || []);
    const maturityTargets = sorted(maturity.phases?.PHASE_3?.targetShotIds || []);
    const targetShotIds = sorted(maturityTargets.filter((shotId) => {
      const candidateAudits = (actualPixelAudit.audits || []).filter((item) => item.shotId === shotId);
      return candidateAudits.length > 0 && !candidateAudits.some((item) => item.recommendationEligible === true);
    }));
    if (!targetShotIds.length || targetShotIds.some((shotId) => !bindingBlockedShotIds.has(shotId) || !maturityTargets.includes(shotId))) throw new Error(`universal-reference-retry-target-authority-mismatch:${targetShotIds.join(",")}:${maturityTargets.join(",")}`);
    if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("universal-reference-retry-recompile-requires-frozen-idle-runtime");
    if ((runtime.currentAssembly || []).length || runtime.wholeFilmBatchRecommendation?.assemblyCreationAllowed === true) throw new Error("universal-reference-retry-recompile-requires-assembly-lock");

    const next = structuredClone(before);
    const targetSet = new Set(targetShotIds);
    const priorPlans = new Map((runtime.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
    const generatedPlanShas = new Set([
      ...(runtime.lookMasterRawReferences || []).filter((raw) => raw.artifact?.sha256).map((raw) => raw.planSha256 || raw.provenance?.planSha256).filter(Boolean),
      ...(before.production.generation.jobs || []).filter((job) => job.output?.sha256).map((job) => job.lookMasterPlanSha256).filter(Boolean),
    ]);
    const nonTargetPlanShas = Object.fromEntries((runtime.packageLookMasterPlans || []).filter((plan) => !targetSet.has(plan.shotId)).map((plan) => [plan.shotId, plan.planSha256]));
    const revisions = [];
    const repairByShot = new Map((visualDirectorReview.shotRepairs || []).map((item) => [item.shotId, item]));
    const allTargetTopologies = [];

    next.production.shotIntelligence.packageLookMasterPlans = next.production.shotIntelligence.packageLookMasterPlans.map((plan) => {
      if (!targetSet.has(plan.shotId)) return plan;
      const styleBrief = next.production.packagingStyleBriefs.find((brief) => brief.sourceBeatIds?.includes(plan.shotId) && brief.styleBriefSha256 === plan.styleBriefSha256);
      if (!styleBrief) throw new Error(`universal-reference-retry-style-brief-missing:${plan.shotId}`);
      if (plan.referencePackaging?.contract !== A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT || plan.referencePackaging?.productionMethod !== UNIVERSAL_REFERENCE_PRODUCTION_METHOD) throw new Error(`universal-reference-retry-plan-contract-invalid:${plan.shotId}`);
      const candidateAudits = (actualPixelAudit.audits || []).filter((item) => item.shotId === plan.shotId);
      const repair = repairByShot.get(plan.shotId) || machineDerivedRepairDirective(plan, candidateAudits);
      const repairDirective = {...structuredClone(repair), displayProtectedPhrases: repair.displayProtectedPhrases?.length ? [...repair.displayProtectedPhrases] : displayProtectedPhrasesForLookMaster(plan.protectedPhrases || [])};
      const alreadyCurrent = plan.candidateDirectionRevision?.revisionId === UNIVERSAL_REFERENCE_RETRY_REVISION_ID
        && retryDirectiveIdentity(plan.fullLookMasterRepairDirective) === retryDirectiveIdentity(repairDirective)
        && currentRetryDirectionsAreValid(plan);
      const currentPlanProducedPixels = generatedPlanShas.has(plan.planSha256);
      const rebuilt = alreadyCurrent
        ? plan
        : recompilePackageLookMasterCandidateDirections(plan, styleBrief, {
            now,
            revisionId: UNIVERSAL_REFERENCE_RETRY_REVISION_ID,
            repairDirective,
            recentDirectionFingerprints: currentPlanProducedPixels ? (plan.candidateDirections || []).map((item) => item.fingerprint).filter(Boolean) : [],
            recentTopologyFingerprints: currentPlanProducedPixels ? (plan.candidateDirections || []).map((item) => topologyFingerprint(item)).filter(Boolean) : [],
          });
      const planShaChanged = rebuilt.planSha256 !== plan.planSha256;
      const revised = planShaChanged ? rebuilt : plan;
      if (revised.assemblyMode !== plan.assemblyMode || revised.presentationMode !== plan.presentationMode || revised.frameOccupation !== plan.frameOccupation || revised.presenterPackagingMode !== plan.presenterPackagingMode) throw new Error(`universal-reference-retry-canonical-mode-mutated:${plan.shotId}`);
      const directions = revised.candidateDirections.map((direction, index) => ({
        candidateIndex: index + 1,
        directionId: direction.directionId,
        primaryFamily: direction.primaryFamily,
        aestheticRoute: direction.aestheticRoute,
        topologyFingerprint: topologyFingerprint(direction),
        directionFingerprint: direction.fingerprint,
      }));
      if (directions.length !== revised.candidateBudget || new Set(directions.map((item) => item.primaryFamily)).size < Math.min(2, revised.candidateBudget) || new Set(directions.map((item) => item.topologyFingerprint)).size !== directions.length) throw new Error(`universal-reference-retry-directions-not-distinct:${plan.shotId}`);
      allTargetTopologies.push(...directions.map((item) => item.topologyFingerprint));
      revisions.push({shotId: plan.shotId, changed: planShaChanged, previousPlanSha256: plan.planSha256, currentPlanSha256: revised.planSha256, previousPlanProducedPixels: currentPlanProducedPixels, assemblyMode: revised.assemblyMode, presentationMode: revised.presentationMode, frameOccupation: revised.frameOccupation, presenterPackagingMode: revised.presenterPackagingMode, displayProtectedPhrases: revised.displayProtectedPhrases, repairDirective: revised.fullLookMasterRepairDirective, directions});
      return revised;
    });
    if (revisions.length !== targetShotIds.length) throw new Error("universal-reference-retry-revision-count-mismatch");

    let supersededCandidateCount = 0;
    next.production.shotIntelligence.lookMasterRawReferences = next.production.shotIntelligence.lookMasterRawReferences.map((raw) => {
      if (!targetSet.has(raw.shotId) || raw.userVisualApproval === "APPROVED" || raw.userVisualApproval === true) return raw;
      const previousPlan = priorPlans.get(raw.shotId);
      if (!previousPlan || !raw.artifact?.sha256) return raw;
      supersededCandidateCount += 1;
      return {
        ...raw,
        current: false,
        historyReadOnly: true,
        recommendationEligible: false,
        selectionEligible: false,
        assemblyEligible: false,
        supersededByPlanSha256: revisions.find((item) => item.shotId === raw.shotId)?.currentPlanSha256 || null,
        supersededReason: "MODE_AWARE_FULL_LOOK_MASTER_RETRY_RECOMPILE",
      };
    });

    const report = {
      contract: UNIVERSAL_REFERENCE_RETRY_RECOMPILE_CONTRACT,
      status: "PASS",
      current: true,
      targetShotIds,
      actualPixelAuditStatus: actualPixelAudit.status,
      visualDirectorReviewStatus: visualDirectorReview.status,
      productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
      referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
      revisionId: UNIVERSAL_REFERENCE_RETRY_REVISION_ID,
      revisions,
      changedShotIds: revisions.filter((item) => item.changed).map((item) => item.shotId),
      nonTargetPlanShas,
      nonTargetPlanShasUnchanged: Object.entries(nonTargetPlanShas).every(([shotId, planSha256]) => next.production.shotIntelligence.packageLookMasterPlans.find((plan) => plan.shotId === shotId)?.planSha256 === planSha256),
      crossShotUniqueTopologyCount: new Set(allTargetTopologies).size,
      candidateTopologyCount: allTargetTopologies.length,
      crossShotDiversityDeferredToActualPixelSelection: true,
      supersededCandidateCount,
      generatedImageCount: 0,
      existingPngBytesChanged: false,
      assemblyCreated: false,
      layerExtractionStarted: false,
      criticStarted: false,
      motionStarted: false,
      nextAction: "RUN_UNIVERSAL_REFERENCE_STATIC_PREFLIGHT",
      generatedAt: now,
    };
    next.production.shotIntelligence.universalReferenceLookMasterRetryRecompile = structuredClone(report);
    next.production.goldenFilmVisualSystemMaturity = {
      ...next.production.goldenFilmVisualSystemMaturity,
      current: true,
      status: "RETRY_STATIC_PREFLIGHT_REQUIRED",
      nextAction: "RUN_UNIVERSAL_REFERENCE_STATIC_PREFLIGHT",
      targetShotIds,
      currentWaveJobIds: [],
      queuedJobIds: [],
      updatedAt: now,
    };
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "frozen";
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {
      ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
    };
    const event = createProductionEvent({workspace: next, action: "recompile-universal-reference-look-master-retry-v1", targetId: targetShotIds.join(","), payload: {contract: UNIVERSAL_REFERENCE_RETRY_RECOMPILE_CONTRACT, targetShotIds, revisions, generatedImageCount: 0, noAssembly: true, noLayerExtraction: true, noCritic: true, noMotion: true}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const committed = persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: before.workspaceSha256, event, files: {[reportRelativePath]: report}});
    return {workspace: committed, report};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = recompileUniversalReferenceLookMasterRetry();
  console.log(JSON.stringify({status: "PASS", workspaceSha256: result.workspace.workspaceSha256, targetShotIds: result.report.targetShotIds, planShas: Object.fromEntries(result.report.revisions.map((item) => [item.shotId, item.currentPlanSha256])), uniqueTopologyCount: result.report.crossShotUniqueTopologyCount, generatedImageCount: result.report.generatedImageCount, nextAction: result.report.nextAction}, null, 2));
}
