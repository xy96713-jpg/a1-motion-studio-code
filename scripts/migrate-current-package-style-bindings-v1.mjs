#!/usr/bin/env node
/**
 * Bind every active PACKAGE look plan to the audited retro-pixel style
 * contract and the exact project-local Pinterest reference subset.
 *
 * This is a metadata/hash migration only. It never queues imagegen, critic,
 * layer generation, motion, or render work.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertPackageLookMasterPlan, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildPackageLayerCandidateCacheKey} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {assertRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const now = process.env.A1_STYLE_BINDING_MIGRATION_AT || new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const withoutHash = (value, key, volatile = []) => {
  const copy = structuredClone(value);
  delete copy[key];
  for (const field of volatile) delete copy[field];
  return copy;
};
const historyOnly = (value, replacementField, replacement) => ({
  ...structuredClone(value),
  status: "HISTORY_READ_ONLY",
  current: false,
  advisoryOnly: true,
  [replacementField]: replacement,
  supersededAt: now,
});
const hashKitPlan = (plan) => sha256(withoutHash(plan, "planSha256", ["createdAt"]));
const hashCandidate = (candidate) => sha256(withoutHash(candidate, "candidateSha256"));
const hashRecipeIdentity = (recipe) => {
  const copy = withoutHash(recipe, "recipeSha256", ["createdAt"]);
  // Evidence is bound after the recipe identity is known and therefore cannot
  // be part of the recipe hash without creating a cycle.
  delete copy.parityAudit;
  delete copy.finalAssemblyReview;
  delete copy.legacyParityAudit;
  delete copy.legacyFinalAssemblyReview;
  delete copy.assemblyComposite;
  delete copy.approvalBinding;
  return sha256(copy);
};
const hashDiscovery = (value) => sha256(withoutHash(value, "discoverySha256", ["generatedAt"]));
const hashBoard = (value) => sha256(withoutHash(value, "boardSha256", ["generatedAt"]));
const hashReview = (value) => sha256(withoutHash(value, "reviewSha256", ["generatedAt"]));
const hashPortfolio = (value) => sha256(withoutHash(value, "auditSha256"));

const packageShots = (runtime) => runtime.packageLookMasterPlans
  .filter((plan) => plan?.dataChainVersion === 2 && plan?.styleBriefSha256)
  .map((plan) => plan.shotId);

function buildStyleBinding(plan, brief) {
  const references = (plan.referenceInputs || []).map((reference) => ({
    id: reference.id,
    publicUrl: reference.publicUrl,
    sha256: reference.sha256 || reference.sourceSha256,
    role: reference.role,
    adoptedTraits: [...(reference.adoptedTraits || [])],
  }));
  if (references.some((reference) => !reference.id || !reference.publicUrl || !reference.sha256 || !reference.role || !reference.adoptedTraits.length)) throw new Error(`style-binding-reference-input-incomplete:${plan.shotId}`);
  return {
    contract: "A1ActiveEditorialStyleBinding/v1",
    styleSkillId: brief.styleSkillId,
    styleSkillContractVersion: brief.styleSkillContractVersion,
    styleBriefSha256: brief.styleBriefSha256,
    fingerprint: brief.fingerprint,
    primaryFamily: brief.variation?.primaryFamily || null,
    referencePackId: brief.referencePackId,
    referenceIds: references.map((reference) => reference.id),
    referenceSha256: references.map(({id, sha256: sourceSha256}) => ({id, sha256: sourceSha256})),
    referenceSources: references,
    referenceManifestSha256: sha256(referenceManifest),
    referenceManifestReferences: referenceManifest.sources.map((reference) => ({id: reference.id, publicUrl: reference.publicUrl, sha256: reference.sha256, role: reference.role})),
  };
}

function buildReferenceBindingAudit(plan, brief, styleBinding) {
  const selectedReferences = styleBinding.referenceSources.map((reference) => ({...reference}));
  return {
    contract: "A1ReferenceBindingAudit/v1",
    status: "PASS",
    current: true,
    selectionMode: "STYLE_BRIEF_SEMANTIC_SUBSET",
    selectedSubsetCount: selectedReferences.length,
    manifestSourceCount: referenceManifest.sources.length,
    selectedReferenceIds: selectedReferences.map((reference) => reference.id),
    selectedReferenceSha256: selectedReferences.map((reference) => ({id: reference.id, sha256: reference.sha256})),
    selectedReferences,
    manifestReferences: styleBinding.referenceManifestReferences,
    referenceManifestSha256: plan.referenceManifestSha256,
    activeStyleSkillId: brief.styleSkillId,
    activeStyleSkillContractVersion: brief.styleSkillContractVersion,
    styleBriefSha256: brief.styleBriefSha256,
    fingerprint: brief.fingerprint,
    note: "当前 look plan 只绑定 brief 选择的参考子集；7 张 manifest 全量仍是活动 Pinterest pack，未选参考不宣称已送入本次候选任务。",
  };
}

function rebindCurrentLookEvidence(plan, oldPlanSha) {
  const discovery = plan.fastCandidateDiscovery;
  const board = plan.comparativeReviewBoard;
  const review = plan.comparativeReview;
  const portfolio = plan.portfolioAudit;
  if (!discovery || !board || !review || !portfolio) return;
  if (!plan.legacyStyleBindingEvidence) {
    plan.legacyStyleBindingEvidence = {
      status: "HISTORY_READ_ONLY",
      current: false,
      advisoryOnly: true,
      planSha256: oldPlanSha,
      discoverySha256: discovery.discoverySha256,
      boardSha256: board.boardSha256,
      reviewSha256: review.reviewSha256,
      portfolioAuditSha256: portfolio.auditSha256,
      supersededAt: now,
    };
  }
  discovery.planSha256 = plan.planSha256;
  discovery.discoverySha256 = hashDiscovery(discovery);
  board.planSha256 = plan.planSha256;
  board.discoverySha256 = discovery.discoverySha256;
  board.boardSha256 = hashBoard(board);
  review.planSha256 = plan.planSha256;
  review.discoverySha256 = discovery.discoverySha256;
  review.boardSha256 = board.board?.sha256 || null;
  review.reviewSha256 = hashReview(review);
  portfolio.planSha256 = plan.planSha256;
  portfolio.comparativeReviewSha256 = review.reviewSha256;
  portfolio.auditSha256 = hashPortfolio(portfolio);
  plan.activeCandidateSet.reviewSha256 = review.reviewSha256;
  if (plan.recommendation) plan.recommendation.reviewSha256 = review.reviewSha256;
  if (plan.selectedLookMasterBinding) {
    plan.selectedLookMasterBinding.lookMasterPlanSha256 = plan.planSha256;
    plan.selectedLookMasterBinding.comparativeReviewSha256 = review.reviewSha256;
  }
}

function rebindCurrentRawEvidence(runtime, plan) {
  const activeDirectionId = plan.activeCandidateSet?.selectedDirectionId || plan.selectedLookMasterBinding?.directionId;
  const candidate = plan.fastCandidateDiscovery?.candidates?.find((item) => item.directionId === activeDirectionId);
  const raw = (runtime.lookMasterRawReferences || []).find((item) => item.referenceId === candidate?.rawReferenceId && item.current === true);
  if (!candidate || !raw?.currentPassEvidence) return;
  if (raw.planSha256 === plan.planSha256
    && raw.currentPassEvidence.planSha256 === plan.planSha256
    && raw.serverVisualAssessment?.planSha256 === plan.planSha256
    && candidate.previousServerAssessment?.currentBindingSha256 === raw.currentPassEvidence.evidenceSha256) return;
  const evidenceCore = {...raw.currentPassEvidence, planSha256: plan.planSha256};
  delete evidenceCore.evidenceSha256;
  raw.currentPassEvidence = {...evidenceCore, evidenceSha256: sha256(evidenceCore)};
  raw.planSha256 = plan.planSha256;
  if (raw.serverVisualAssessment) {
    const assessment = {...raw.serverVisualAssessment, planSha256: plan.planSha256};
    if (assessment.reassessment) assessment.reassessment = {...assessment.reassessment, evidenceSha256: raw.currentPassEvidence.evidenceSha256};
    delete assessment.assessmentSha256;
    raw.serverVisualAssessment = {...assessment, assessmentSha256: sha256(assessment)};
  }
  candidate.currentPassEvidence = structuredClone(raw.currentPassEvidence);
  if (candidate.previousServerAssessment) candidate.previousServerAssessment.currentBindingSha256 = raw.currentPassEvidence.evidenceSha256;
}

function layerScope(kit) {
  const layers = kit.layers || [];
  return {
    contract: "A1PackageLayerScope/v1",
    slotCount: layers.length,
    actualLayerCount: layers.filter((layer) => layer.route !== "NONE").length,
    noneLayerCount: layers.filter((layer) => layer.route === "NONE").length,
    actualLayerKinds: layers.filter((layer) => layer.route !== "NONE").map((layer) => layer.kind),
    noneLayerKinds: layers.filter((layer) => layer.route === "NONE").map((layer) => layer.kind),
  };
}

function rebindAssemblyEvidence(recipe, plan, kit) {
  if (recipe.shotId !== "ED-10" || recipe.parityAudit?.status !== "PASS" || recipe.finalAssemblyReview?.status !== "PASS") return;
  if (recipe.parityAudit?.bindingMigrationMode === "CURRENT_STYLE_BINDING_HASH_REBIND"
    && recipe.finalAssemblyReview?.bindingMigrationMode === "CURRENT_STYLE_BINDING_HASH_REBIND"
    && recipe.parityAudit.planSha256 === plan.planSha256
    && recipe.parityAudit.recipeSha256 === recipe.recipeSha256) return;
  if (!recipe.legacyParityAudit) recipe.legacyParityAudit = historyOnly(recipe.parityAudit, "supersededByAuditSha256", null);
  if (!recipe.legacyFinalAssemblyReview) recipe.legacyFinalAssemblyReview = historyOnly(recipe.finalAssemblyReview, "supersededByAssessmentSha256", null);
  const scope = layerScope(kit);
  const sourceImageBindings = recipe.parityAudit.sourceImageBindings || [
    {kind: "APPROVED_LOOK_MASTER_ON_BASE_FRAME", sha256: recipe.parityAudit.comparisonMasterPreview?.sha256 || null},
    {kind: "RECONSTRUCTED_PACKAGE_ASSEMBLY", sha256: recipe.assemblyComposite?.sha256 || null},
  ];
  const identity = {
    contract: "A1PackageAssemblyParityAudit/v1",
    version: 1,
    shotId: recipe.shotId,
    planSha256: plan.planSha256,
    recipeSha256: recipe.recipeSha256,
    selectedDirectionId: recipe.selectedLookMasterBinding?.directionId || null,
    selectedLookMasterSha256: recipe.selectedLookMasterBinding?.artifactSha256 || null,
    comparativeReviewSha256: recipe.selectedLookMasterBinding?.comparativeReviewSha256 || null,
    assemblyPreview: recipe.assemblyComposite,
    comparisonMasterPreview: recipe.parityAudit.comparisonMasterPreview || null,
    normalizedPixelDelta: recipe.parityAudit.normalizedPixelDelta ?? null,
    sourceImageBindings,
    layerScope: scope,
    structuralParity: recipe.parityAudit.structuralParity || null,
    materialParity: recipe.parityAudit.materialParity || null,
    semanticParity: recipe.parityAudit.semanticParity || null,
  };
  const serverVisualAssessmentSha256 = sha256({contract: "A1ServerAssemblyParityAssessment/v1", ...identity});
  const auditSha256 = sha256({contract: "A1PackageAssemblyParityAudit/v1", ...identity, serverVisualAssessmentSha256});
  recipe.parityAudit = {
    ...recipe.parityAudit,
    planSha256: plan.planSha256,
    recipeSha256: recipe.recipeSha256,
    comparativeReviewSha256: recipe.selectedLookMasterBinding?.comparativeReviewSha256 || null,
    selectedLookMasterSha256: recipe.selectedLookMasterBinding?.artifactSha256 || null,
    selectedDirectionId: recipe.selectedLookMasterBinding?.directionId || null,
    layerScope: scope,
    sourceImageBindings,
    serverVisualAssessmentSha256,
    auditSha256,
    rebindMode: "CURRENT_LOOK_REVIEW_HASH_REBIND",
    bindingMigrationMode: "CURRENT_STYLE_BINDING_HASH_REBIND",
    rebindSourceAuditSha256: recipe.legacyParityAudit.auditSha256 || null,
    pixelsUnchanged: true,
    pixelsRecheckedAt: now,
    generatedAt: now,
  };
  recipe.finalAssemblyReview = {
    ...recipe.finalAssemblyReview,
    planSha256: plan.planSha256,
    recipeSha256: recipe.recipeSha256,
    comparativeReviewSha256: recipe.selectedLookMasterBinding?.comparativeReviewSha256 || null,
    masterSha256: recipe.selectedLookMasterBinding?.artifactSha256 || null,
    selectedDirectionId: recipe.selectedLookMasterBinding?.directionId || null,
    assemblySha256: recipe.assemblyComposite?.sha256 || null,
    layerScope: scope,
    sourceImageBindings,
    assessmentSha256: serverVisualAssessmentSha256,
    rebindMode: "CURRENT_LOOK_REVIEW_HASH_REBIND",
    bindingMigrationMode: "CURRENT_STYLE_BINDING_HASH_REBIND",
    rebindSourceAssessmentSha256: recipe.legacyFinalAssemblyReview.assessmentSha256 || null,
    evidenceReboundWithoutRegeneration: true,
    evidenceIdentitySha256: sha256(identity),
    generatedAt: now,
  };
}

function migrate(current) {
  const next = structuredClone(current);
  const production = next.production;
  const runtime = production?.shotIntelligence;
  const briefs = production?.packagingStyleBriefs || [];
  const briefByEvent = new Map(briefs.map((brief) => [brief.eventId, brief]));
  const targetIds = packageShots(runtime);
  if (targetIds.length !== 5) throw new Error(`current-package-look-plan-count-invalid:${targetIds.length}`);
  for (const shotId of targetIds) {
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
    const brief = briefByEvent.get(plan.eventId);
    if (!brief || brief.styleBriefSha256 !== plan.styleBriefSha256) throw new Error(`style-brief-plan-parity-invalid:${shotId}`);
    assertRetroPixelEditorialStyleBrief(brief, {appRoot});
    const oldPlanSha = plan.planSha256;
    const oldStyleBinding = plan.styleBinding;
    const oldReferenceAudit = plan.referenceBindingAudit;
    const styleBinding = buildStyleBinding(plan, brief);
    const referenceBindingAudit = buildReferenceBindingAudit(plan, brief, styleBinding);
    if (oldStyleBinding && JSON.stringify(oldStyleBinding) !== JSON.stringify(styleBinding) && !plan.legacyStyleBinding) {
      plan.legacyStyleBinding = historyOnly(oldStyleBinding, "supersededByStyleBriefSha256", styleBinding.styleBriefSha256);
    }
    if (oldReferenceAudit && JSON.stringify(oldReferenceAudit) !== JSON.stringify(referenceBindingAudit) && !plan.legacyReferenceBindingAudit) {
      plan.legacyReferenceBindingAudit = historyOnly(oldReferenceAudit, "supersededByStyleBindingSha256", styleBinding.styleBriefSha256);
    }
    plan.styleBinding = styleBinding;
    plan.referenceBindingAudit = referenceBindingAudit;
    plan.planSha256 = sha256(planIdentity(plan));
    rebindCurrentRawEvidence(runtime, plan);
    rebindCurrentLookEvidence(plan, oldPlanSha);

    const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === shotId);
    const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
    if (!kit || !recipe) throw new Error(`current-package-kit-recipe-missing:${shotId}`);
    if (kit.styleBinding && JSON.stringify(kit.styleBinding) !== JSON.stringify(styleBinding) && !kit.legacyStyleBinding) kit.legacyStyleBinding = historyOnly(kit.styleBinding, "supersededByStyleBriefSha256", styleBinding.styleBriefSha256);
    if (recipe.styleBinding && JSON.stringify(recipe.styleBinding) !== JSON.stringify(styleBinding) && !recipe.legacyStyleBinding) recipe.legacyStyleBinding = historyOnly(recipe.styleBinding, "supersededByStyleBriefSha256", styleBinding.styleBriefSha256);
    kit.styleBinding = structuredClone(styleBinding);
    recipe.styleBinding = structuredClone(styleBinding);
    if (kit.selectedLookMasterBinding) {
      kit.selectedLookMasterBinding.lookMasterPlanSha256 = plan.planSha256;
      kit.selectedLookMasterBinding.comparativeReviewSha256 = plan.comparativeReview?.reviewSha256 || kit.selectedLookMasterBinding.comparativeReviewSha256;
    }
    if (kit.reconstructionSource) {
      kit.reconstructionSource.lookMasterPlanSha256 = plan.planSha256;
      kit.reconstructionSource.comparativeReviewSha256 = plan.comparativeReview?.reviewSha256 || kit.reconstructionSource.comparativeReviewSha256;
    }
    kit.planSha256 = hashKitPlan(kit);
    for (const layer of kit.layers || []) {
      for (const candidate of layer.candidates || []) {
        candidate.planSha256 = kit.planSha256;
        candidate.cache ||= {};
        candidate.cache.key = buildPackageLayerCandidateCacheKey({planSha256: kit.planSha256, layerKind: layer.kind, route: layer.route, contentSha256: candidate.cache.contentSha256 || candidate.artifact?.sha256 || "", variantNonce: candidate.cache.variantNonce || null});
        candidate.candidateSha256 = hashCandidate(candidate);
      }
    }
    recipe.planSha256 = kit.planSha256;
    if (recipe.selectedLookMasterBinding) {
      recipe.selectedLookMasterBinding.lookMasterPlanSha256 = plan.planSha256;
      recipe.selectedLookMasterBinding.comparativeReviewSha256 = plan.comparativeReview?.reviewSha256 || recipe.selectedLookMasterBinding.comparativeReviewSha256;
    }
    if (recipe.reconstructionSource) {
      recipe.reconstructionSource.lookMasterPlanSha256 = plan.planSha256;
      recipe.reconstructionSource.comparativeReviewSha256 = plan.comparativeReview?.reviewSha256 || recipe.reconstructionSource.comparativeReviewSha256;
    }
    recipe.recipeSha256 = hashRecipeIdentity(recipe);
    const selectedLayerHashes = (kit.layers || []).flatMap((layer) => {
      const selectedId = recipe.layerCandidateIds?.[layer.kind];
      const selected = (layer.candidates || []).find((candidate) => candidate.candidateId === selectedId);
      return selected ? [selected.candidateSha256] : [];
    }).sort();
    recipe.approvalBinding = {
      ...(recipe.approvalBinding || {}),
      planSha256: kit.planSha256,
      recipeSha256: recipe.recipeSha256,
      layerHashes: selectedLayerHashes,
      buildKey: recipe.buildKey || null,
      selectedDirectionId: recipe.selectedLookMasterBinding?.directionId || null,
      selectedMasterSha256: recipe.selectedLookMasterBinding?.artifactSha256 || null,
    };
    // Assembly parity is bound to the package-kit plan (the recipe's
    // `planSha256`), while look-master evidence remains bound to the look
    // plan through selectedLookMasterBinding.lookMasterPlanSha256.
    rebindAssemblyEvidence(recipe, kit, kit);
  }
  runtime.updatedAt = now;
  return recalculateEditorialAssetWorkbench(next, now);
}

withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  const beforeWorkspaceSha256 = current.workspaceSha256;
  const migrated = migrate(current);
  const validated = assertEditorialAssetWorkbench(migrated);
  if (process.env.A1_STYLE_BINDING_MIGRATION_DRY_RUN === "1") {
    console.log(JSON.stringify({status: "DRY_RUN_PASS", beforeWorkspaceSha256, workspaceSha256: validated.workspaceSha256, persisted: false}, null, 2));
    return;
  }
  const event = createProductionEvent({
    workspace: validated,
    action: "migrate-current-package-style-bindings",
    targetId: "PACKAGING_LANE",
    payload: {
      beforeWorkspaceSha256,
      afterWorkspaceSha256: validated.workspaceSha256,
      shotIds: packageShots(validated.production.shotIntelligence),
      activeStyleSkillId: "a1-retro-pixel-editorial-style",
      referencePackId: "pinterest-retro-pixel-v1",
      imageGenerationPerformed: false,
      candidateDispatchPerformed: false,
      criticPerformed: false,
      renderPerformed: false,
    },
    now,
  });
  persistProjectState(appRoot, validated, {event});
  console.log(JSON.stringify({status: "PASS", beforeWorkspaceSha256, workspaceSha256: validated.workspaceSha256, plans: validated.production.shotIntelligence.packageLookMasterPlans.map((plan) => ({shotId: plan.shotId, planSha256: plan.planSha256, styleBriefSha256: plan.styleBriefSha256, styleBinding: plan.styleBinding, referenceBindingAudit: plan.referenceBindingAudit})), queue: validated.production.generation.summary, worker: validated.production.generation.workerStatus}, null, 2));
});
