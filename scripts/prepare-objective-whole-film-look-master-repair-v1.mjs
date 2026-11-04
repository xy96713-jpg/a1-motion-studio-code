#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertPackageLookMasterPlan, displayProtectedPhrasesForLookMaster, planIdentity, recompilePackageLookMasterCandidateDirections} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {classifyTypographyTreatment} from "../apps/studio-next/src/lib/a1-typography-treatment-policy-v1.mjs";
import {compileWholeFilmVisualArchitecture} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

export const OBJECTIVE_WHOLE_FILM_LOOK_MASTER_REPAIR_CONTRACT = "A1ObjectiveWholeFilmLookMasterRepair/v1";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const DEFAULT_TARGET_SHOT_IDS = ["ED-16", "ED-17"];

const repairSpecs = new Map([
  ["ED-01", {
    aestheticRoute: "PRODUCT_IDENTITY_TITLE",
    failureCodes: ["OLD_PLAIN_OVERLAY_TYPOGRAPHY", "MISSING_VIBE_CODING_SECONDARY_LINE", "AESTHETIC_FUSION_NOT_VISIBLE"],
    requiredVisualAction: "Preserve the real presenter hold frame. In the measured top-left negative space, build one integrated presenter-crt-overlay identity title. The exact editable secondary line is 用 vibe coding 做的 and the exact editable hero title is 智能写作工作台. One compact unequal CRT title surface and one cursor/select action may support the typography; do not turn the presenter into a poster or cover the face, eyes, mouth, microphone, boom, or subtitle zone.",
    forbiddenPatterns: ["plain one-line subtitle", "workflow diagram", "machine explainer", "full-canvas wash", "generic card", "warm cream field", "generated readable text", "unrelated readable filler"],
    requiredProtectedPhrases: ["用 vibe coding 做的", "智能写作工作台"],
    typographyOverride: {
      baseVisualCarrier: "PRESENTER_BASE",
      enhancementPackaging: "TYPE_OVERLAY",
      strongLanguageEvent: true,
      eventKinds: ["SUMMARY"],
      typographyTreatment: "KEYWORD_OVERLAY",
      typographyActor: true,
      typographyVisualRole: "PRESENTER_HEADLINE",
      preferredPresentationMode: "OVERLAY",
    },
  }],
  ["ED-16", {
    aestheticRoute: "CAUSE_CONSEQUENCE",
    failureCodes: ["GENERIC_CENTERED_CARD_FLOWCHART", "MISSING_PROTECTED_PHRASE_INPUTS", "SEMANTIC_INPUTS_UNDER_SPECIFIED_AT_BOARD_SCALE"],
    requiredVisualAction: "Use one continuous full-frame causal material actor: an visibly underfilled evidence field and an unresolved angle register must physically flatten into bland generic prose. Keep 材料不够, 角度不清, 泛泛而谈 large and exact. No centered card, icon row, dashboard, or generic arrow flowchart.",
    forbiddenPatterns: ["centered card", "generic arrow flowchart", "document icon substitute", "small labels", "warm cream field", "unrelated readable filler"],
  }],
  ["ED-17", {
    aestheticRoute: "METHOD_SEQUENCE",
    failureCodes: ["MISSING_PROTECTED_PHRASE_STEP_ONE", "INTRO_PHRASE_MISCLASSIFIED_AS_ACTION", "OCR_EXACT_COPY_MISMATCH"],
    requiredVisualAction: "Build one continuous full-frame method actor whose exact ordered actions are 先给材料, 再找角度, 最后再让 AI 动笔. The introductory clause is narration, not a visual step. Use one material ribbon or one typesetting rail, never three cards or numbered boxes.",
    forbiddenPatterns: ["introductory clause used as step one", "missing 先给材料", "numbered card sequence", "generic process boxes", "warm cream field", "unrelated readable filler"],
  }],
  ["ED-34", {
    aestheticRoute: "PERSONAL_STYLE_RESOLUTION",
    failureCodes: ["OLD_BLUE_BRUSH_SWIRL_OUTSIDE_ACTIVE_MATERIAL_FAMILY", "DIRECTION_AND_STYLE_SEMANTICS_SPLIT", "AESTHETIC_FUSION_NOT_VISIBLE"],
    requiredVisualAction: "Build one quiet full-frame crt-title-takeover. A single authored pixel direction path must select, narrow, and lock into one personal fingerprint terminal mark. Reserve one exact editable hero phrase: 真正写出自己的风格. Use the A1 neutral/cool editorial field, shared square lattice, one restrained cobalt action accent, and one select-to-lock CRT response. No expressive paint swirl, robot sticker, particle vortex, dashboard, or decorative window pile.",
    forbiddenPatterns: ["expressive brush swirl", "particle vortex", "robot sticker", "generic technology poster", "dashboard", "equal-size windows", "warm cream field", "generated readable text", "unrelated readable filler"],
    requiredProtectedPhrases: ["真正写出自己的风格"],
    typographyOverride: {
      baseVisualCarrier: "NONE_OR_TAKEOVER",
      enhancementPackaging: "TYPE_OVERLAY",
      strongLanguageEvent: true,
      eventKinds: ["SUMMARY"],
      typographyTreatment: "FULL_TYPOGRAPHY",
      typographyActor: true,
      typographyVisualRole: "HERO_TAKEOVER",
      preferredPresentationMode: "TYPOGRAPHY",
    },
  }],
]);

function resolveTargetShotIds(targetShotIds) {
  const resolved = [...new Set((targetShotIds || DEFAULT_TARGET_SHOT_IDS).map((value) => String(value || "").trim()).filter(Boolean))];
  if (!resolved.length) throw new Error("objective-look-master-repair-targets-required");
  const unsupported = resolved.filter((shotId) => !repairSpecs.has(shotId));
  if (unsupported.length) throw new Error(`objective-look-master-repair-target-unsupported:${unsupported.join(",")}`);
  return resolved;
}

function applySpecTypographyPolicy(policy, spec) {
  const body = {
    ...structuredClone(policy),
    ...(spec.typographyOverride || {}),
    protectedPhrases: spec.requiredProtectedPhrases ? [...spec.requiredProtectedPhrases] : [...policy.protectedPhrases],
    typographyVisualContract: {
      ...structuredClone(policy.typographyVisualContract),
      ...(spec.typographyOverride?.typographyVisualRole ? {role: spec.typographyOverride.typographyVisualRole} : {}),
    },
    reason: spec.requiredProtectedPhrases
      ? `${policy.reason} Current objective repair binds exact renderer-owned phrases from the current user-directed shot route.`
      : policy.reason,
    policySha256: undefined,
  };
  return {...body, policySha256: sha256(body)};
}

function typographyInput(workspace, decision) {
  const demand = (workspace.library.assets || []).find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === decision.shotId)?.shotDemand || {};
  return {
    ...demand,
    sourceText: decision.sourceText,
    semanticRole: decision.semanticRole,
    evidenceRoute: decision.baseVisualCarrier === "PRESENTER_BASE" ? "PRESENTER" : decision.baseVisualCarrier === "SCREEN_EVIDENCE" ? "SCREEN_EVIDENCE" : demand.evidenceRoute,
  };
}

function resolveRepairPolicies(workspace, targetSet) {
  const current = workspace.production.shotIntelligence.decisionSet;
  const policies = new Map();
  const decisions = new Map();
  for (const decision of current.items) {
    if (!targetSet.has(decision.shotId)) continue;
    const policy = applySpecTypographyPolicy(classifyTypographyTreatment(typographyInput(workspace, decision)), repairSpecs.get(decision.shotId));
    policies.set(decision.shotId, policy);
    decisions.set(decision.shotId, decision);
  }
  const missing = [...targetSet].filter((shotId) => !policies.has(shotId) || !decisions.has(shotId));
  if (missing.length) throw new Error(`objective-look-master-repair-decision-missing:${missing.join(",")}`);
  return {policies, decisions};
}

function preparePlan({plan, policy, decision, styleBrief, spec, now}) {
  const base = structuredClone(plan);
  base.decisionHash = decision.decisionHash;
  base.baseVisualCarrier = policy.baseVisualCarrier;
  base.enhancementPackaging = policy.enhancementPackaging;
  base.strongLanguageEvent = policy.strongLanguageEvent;
  base.typographyTreatment = policy.typographyTreatment;
  base.typographyActor = policy.typographyActor;
  base.typographyVisualRole = policy.typographyVisualRole;
  base.typographyVisualContract = structuredClone(policy.typographyVisualContract);
  base.protectedPhrases = [...policy.protectedPhrases];
  base.displayProtectedPhrases = displayProtectedPhrasesForLookMaster(policy.protectedPhrases);
  base.typographyPolicy = structuredClone(policy);
  base.activeCandidateSet = null;
  base.currentCandidateDirections = null;
  base.currentCandidateBudget = null;
  base.candidateDirectionAuthority = "CURRENT_PLAN_DIRECTIONS";
  base.comparativeReviewBoard = null;
  base.comparativeReview = null;
  base.portfolioAudit = null;
  base.provisionalWholeFilmBoardSelection = null;
  base.wholeFilmBoardRecommendation = null;
  base.recommendation = null;
  base.selectedLookMasterId = null;
  base.reviewDecision = null;
  base.planSha256 = sha256(planIdentity(base));
  assertPackageLookMasterPlan(base);
  return recompilePackageLookMasterCandidateDirections(base, styleBrief, {
    now,
    revisionId: "OBJECTIVE_WHOLE_FILM_VISUAL_REPAIR_V1",
    repairDirective: {
      contract: OBJECTIVE_WHOLE_FILM_LOOK_MASTER_REPAIR_CONTRACT,
      status: "STRUCTURAL_RETRY_REQUIRED",
      failureCodes: [...spec.failureCodes],
      aestheticRoute: spec.aestheticRoute,
      requiredVisualAction: spec.requiredVisualAction,
      forbiddenPatterns: [...spec.forbiddenPatterns],
      displayProtectedPhrases: [...policy.protectedPhrases],
      priorCandidateDisposition: "HISTORY_READ_ONLY_VISUAL_REJECTED",
      fullLookMasterRequired: true,
      actualPixelReviewRequired: true,
      userApprovalRequired: true,
    },
  });
}

export function prepareObjectiveWholeFilmLookMasterRepair({now = new Date().toISOString(), targetShotIds = DEFAULT_TARGET_SHOT_IDS, stateOnly = false} = {}) {
  const resolvedTargetShotIds = resolveTargetShotIds(targetShotIds);
  const targetSet = new Set(resolvedTargetShotIds);
  return withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    if (before.production.generation.summary.queued !== 0 || before.production.generation.summary.running !== 0 || before.production.generation.workerStatus !== "frozen") throw new Error("objective-look-master-repair-requires-frozen-idle-runtime");
    if ((before.production.shotIntelligence.currentAssembly || []).length) throw new Error("objective-look-master-repair-requires-empty-assembly");
    const existingPlans = new Map((before.production.shotIntelligence.packageLookMasterPlans || []).map((plan) => [plan.shotId, plan]));
    if (stateOnly) {
      const missingPreparedPlans = resolvedTargetShotIds.filter((shotId) => existingPlans.get(shotId)?.fullLookMasterRepairDirective?.status !== "STRUCTURAL_RETRY_REQUIRED");
      if (missingPreparedPlans.length) throw new Error(`objective-look-master-repair-state-only-plan-missing:${missingPreparedPlans.join(",")}`);
    }
    const {policies, decisions} = stateOnly ? {policies: new Map(), decisions: new Map()} : resolveRepairPolicies(before, targetSet);
    const next = structuredClone(before);
    const styleBriefBySha = new Map([
      ...(next.production.packagingStyleBriefHistory || []),
      ...(next.production.packagingStyleBriefs || []),
    ].map((item) => [item.styleBriefSha256, item]));
    const planHistory = next.production.shotIntelligence.packageLookMasterPlanHistory || [];
    const prepared = [];
    next.production.shotIntelligence.packageLookMasterPlans = next.production.shotIntelligence.packageLookMasterPlans.map((plan) => {
      const spec = targetSet.has(plan.shotId) ? repairSpecs.get(plan.shotId) : null;
      if (!spec) return plan;
      if (stateOnly) {
        prepared.push({shotId: plan.shotId, priorPlanSha256: plan.planSha256, planSha256: plan.planSha256, protectedPhrases: [...plan.displayProtectedPhrases], directionIds: plan.candidateDirections.map((item) => item.directionId)});
        return plan;
      }
      const policy = policies.get(plan.shotId);
      const decision = decisions.get(plan.shotId);
      const styleBrief = styleBriefBySha.get(plan.styleBriefSha256);
      if (!policy || !decision || !styleBrief) throw new Error(`objective-look-master-repair-input-missing:${plan.shotId}`);
      planHistory.push({...structuredClone(plan), current: false, status: "HISTORY_READ_ONLY_VISUAL_REJECTED", authorityScope: "HISTORY_READ_ONLY", supersededAt: now, supersededBy: OBJECTIVE_WHOLE_FILM_LOOK_MASTER_REPAIR_CONTRACT});
      const repaired = preparePlan({plan, policy, decision, styleBrief, spec, now});
      prepared.push({shotId: plan.shotId, priorPlanSha256: plan.planSha256, planSha256: repaired.planSha256, protectedPhrases: repaired.displayProtectedPhrases, directionIds: repaired.candidateDirections.map((item) => item.directionId)});
      return repaired;
    });
    next.production.shotIntelligence.packageLookMasterPlanHistory = planHistory;
    const rejectedShas = [];
    next.production.shotIntelligence.lookMasterRawReferences = (next.production.shotIntelligence.lookMasterRawReferences || []).map((raw) => {
      if (stateOnly) return raw;
      if (!targetSet.has(raw.shotId) || raw.current !== true) return raw;
      if (raw.artifact?.sha256) rejectedShas.push(raw.artifact.sha256);
      return {...raw, current: false, historyReadOnly: true, status: "HISTORY_READ_ONLY_VISUAL_REJECTED", recommendationEligible: false, selectionEligible: false, assemblyEligible: false, userVisualApproval: null, visualRejection: {contract: OBJECTIVE_WHOLE_FILM_LOOK_MASTER_REPAIR_CONTRACT, status: "REJECTED_BY_CURRENT_ACTUAL_PIXEL_REVIEW", failureCodes: repairSpecs.get(raw.shotId).failureCodes, rejectedAt: now}};
    });
    for (const job of next.production.generation.jobs || []) {
      if (stateOnly) continue;
      if (targetSet.has(job.shotId) && job.targetKind === "package-look-master") job.semanticDisposition = "HISTORY_READ_ONLY_OBJECTIVE_VISUAL_REPAIR";
    }
    const architecture = compileWholeFilmVisualArchitecture(next, {now});
    next.production.shotVisualCoveragePlan = architecture.coveragePlan;
    next.production.wholeFilmGenerationReadiness = architecture.generationReadiness;
    next.production.visualProductionRun = architecture.productionRun;
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "frozen";
    next.production.generation.summary.queued = 0;
    next.production.generation.summary.running = 0;
    if (next.production.shotIntelligence.wholeFilmStaticBoard) {
      next.production.shotIntelligence.wholeFilmStaticBoard = {
        ...next.production.shotIntelligence.wholeFilmStaticBoard,
        status: "VISUAL_REPAIR_REQUIRED",
        current: true,
        approvalAllowed: false,
        reviewActionDisabled: true,
        userVisualApproval: "NOT_APPROVED",
        decision: null,
        blockedShotIds: resolvedTargetShotIds,
        blockers: resolvedTargetShotIds.map((shotId) => `OBJECTIVE_ACTUAL_PIXEL_VISUAL_REPAIR_REQUIRED:${shotId}`),
        repairKind: "OBJECTIVE_ACTUAL_PIXEL_AESTHETIC_REPAIR",
        nextAction: "GENERATE_OBJECTIVE_LOOK_MASTER_REPAIRS",
      };
    }
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {
      ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
      status: "SEMANTIC_PIXEL_REPAIR_REQUIRED",
      exceptions: resolvedTargetShotIds.map((shotId) => ({shotId, failures: repairSpecs.get(shotId).failureCodes})),
      autoRecommendationAllowed: false,
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
      nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    };
    next.production.visualProductionRun = {
      ...next.production.visualProductionRun,
      status: "WHOLE_FILM_STATIC_BOARD_SEMANTIC_REPAIR_REQUIRED",
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
      nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    };
    next.production.packagingAutomation = {
      ...next.production.packagingAutomation,
      status: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
      targetShotIds: resolvedTargetShotIds,
      automaticDispatchAllowed: false,
      workerStatus: "frozen",
    };
    const event = createProductionEvent({workspace: next, action: stateOnly ? "reconcile-objective-whole-film-look-master-repair-state-v1" : "prepare-objective-whole-film-look-master-repair-v1", targetId: sha256(prepared), payload: {contract: OBJECTIVE_WHOLE_FILM_LOOK_MASTER_REPAIR_CONTRACT, targetShotIds: resolvedTargetShotIds, prepared, rejectedShas, stateOnly, imageGenerationPerformed: false, assemblyCreated: false, layerReconstructionPerformed: false, criticPerformed: false, motionPerformed: false}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const manifest = {contract: OBJECTIVE_WHOLE_FILM_LOOK_MASTER_REPAIR_CONTRACT, status: "GENERATION_REQUIRED", generatedAt: now, workspaceSha256Before: before.workspaceSha256, workspaceSha256After: recalculated.workspaceSha256, targetShotIds: resolvedTargetShotIds, prepared, rejectedCandidateShas: [...new Set(rejectedShas)], generationAllowed: false, workerStatus: "frozen", queue: {queued: 0, running: 0}, assemblyCreated: false, nextAction: "RUN_STATIC_PREFLIGHT_THEN_DISPATCH_BOUNDED_WAVE"};
    manifest.manifestSha256 = sha256({...manifest, manifestSha256: undefined});
    const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: before.workspaceSha256, files: {"objective-whole-film-look-master-repair-v1/manifest.json": manifest}});
    return {...manifest, workspaceSha256After: persisted.workspaceSha256};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const shotIdsArgument = process.argv.find((value) => value.startsWith("--shotIds="))?.slice("--shotIds=".length);
  const targetShotIds = shotIdsArgument ? shotIdsArgument.split(",") : DEFAULT_TARGET_SHOT_IDS;
  console.log(JSON.stringify(prepareObjectiveWholeFilmLookMasterRepair({targetShotIds, stateOnly: process.argv.includes("--stateOnly")}), null, 2));
}
