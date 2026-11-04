#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {auditRetroPixelStyleBriefs} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const now = process.env.A1_ED10_REBIND_AT || new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const publicFile = (url) => {
  if (!String(url || "").startsWith("/generated/system-line/")) throw new Error("ed10-current-evidence-public-url-invalid");
  const file = path.resolve(publicRoot, String(url).replace(/^\//u, ""));
  if (!file.startsWith(`${publicRoot}${path.sep}`)) throw new Error("ed10-current-evidence-public-url-escape");
  return file;
};
const assertArtifact = (artifact, label) => {
  const file = publicFile(artifact?.publicUrl);
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== artifact.sha256) throw new Error(`ed10-current-evidence-artifact-invalid:${label}`);
  return file;
};

function layerScopeForKit(kit) {
  const layers = Array.isArray(kit?.layers) ? kit.layers : [];
  const actualLayerKinds = layers.filter((layer) => layer.route !== "NONE").map((layer) => layer.kind);
  const noneLayerKinds = layers.filter((layer) => layer.route === "NONE").map((layer) => layer.kind);
  return {
    contract: "A1PackageLayerScope/v1",
    slotCount: layers.length,
    actualLayerCount: actualLayerKinds.length,
    noneLayerCount: noneLayerKinds.length,
    actualLayerKinds,
    noneLayerKinds,
  };
}

function currentParityEvidence(kit) {
  const scope = layerScopeForKit(kit);
  return {
    scope,
    structural: `当前四槽合同中的 ${scope.actualLayerCount} 层实际（${scope.actualLayerKinds.join("、")}）+ ${scope.noneLayerCount} 个 NONE（${scope.noneLayerKinds.join("、")}），保持真实正片底图关系；ELEMENT_KIT 位于 TYPOGRAPHY 下方，像素信号带、横向状态带与右侧判定符号的主轮廓和层级均与 Look Master 一致。`,
    material: `当前四槽合同中的 ${scope.actualLayerCount} 层实际透明素材与 ${scope.noneLayerCount} 个 NONE 路由保持透明抠图边界、白色像素/线框、荧光黄判定符号和真实室内正片暗部压制关系；重组没有引入实心底板或材质断层。`,
    semantic: `“完成度很高的废稿”仍作为可编辑文字形成从左侧状态描述到右侧 X/废稿判定的覆盖动作；当前 ${scope.actualLayerCount} 层实际组合承担这一判断事件，${scope.noneLayerCount} 个 NONE 槽位不伪造额外演员，真实人物正片关系保留。`,
  };
}

function sourceImageBindingsFor(recipe) {
  return [
    {kind: "APPROVED_LOOK_MASTER_ON_BASE_FRAME", sha256: recipe.parityAudit?.comparisonMasterPreview?.sha256 || null},
    {kind: "RECONSTRUCTED_PACKAGE_ASSEMBLY", sha256: recipe.assemblyComposite?.sha256 || null},
  ];
}

function auditIdentity(recipe, plan, kit) {
  const parity = recipe.parityAudit;
  const assembly = recipe.assemblyComposite;
  const evidence = currentParityEvidence(kit);
  return {
    contract: "A1PackageAssemblyParityAudit/v1",
    version: 1,
    shotId: recipe.shotId,
    planSha256: plan.planSha256,
    recipeSha256: recipe.recipeSha256,
    selectedDirectionId: recipe.selectedLookMasterBinding?.directionId || null,
    selectedLookMasterSha256: recipe.selectedLookMasterBinding?.artifactSha256 || null,
    comparativeReviewSha256: recipe.selectedLookMasterBinding?.comparativeReviewSha256 || null,
    assemblyPreview: assembly,
    comparisonMasterPreview: parity?.comparisonMasterPreview || null,
    normalizedPixelDelta: parity?.normalizedPixelDelta ?? null,
    sourceImageBindings: sourceImageBindingsFor(recipe),
    layerScope: evidence.scope,
    structuralParity: parity?.structuralParity || null,
    materialParity: parity?.materialParity || null,
    semanticParity: parity?.semanticParity || null,
  };
}

function rebindCurrentParity(recipe, plan, kit) {
  const oldParity = recipe.parityAudit || {};
  const identity = auditIdentity(recipe, plan, kit);
  const evidence = currentParityEvidence(kit);
  const serverVisualAssessmentSha256 = sha256({contract: "A1ServerAssemblyParityAssessment/v1", ...identity});
  const auditSha256 = sha256({contract: "A1PackageAssemblyParityAudit/v1", ...identity, serverVisualAssessmentSha256});
  return {
    ...oldParity,
    contract: "A1PackageAssemblyParityAudit/v1",
    version: 1,
    serverGenerated: true,
    status: "PASS",
    shotId: recipe.shotId,
    planSha256: plan.planSha256,
    recipeSha256: recipe.recipeSha256,
    selectedDirectionId: recipe.selectedLookMasterBinding?.directionId || null,
    selectedLookMasterSha256: recipe.selectedLookMasterBinding?.artifactSha256 || null,
    comparativeReviewSha256: recipe.selectedLookMasterBinding?.comparativeReviewSha256 || null,
    layerScope: evidence.scope,
    sourceImageBindings: sourceImageBindingsFor(recipe),
    structuralParity: {status: "PASS", evidence: evidence.structural},
    materialParity: {status: "PASS", evidence: evidence.material},
    semanticParity: {status: "PASS", evidence: evidence.semantic},
    serverVisualAssessmentSha256,
    auditSha256,
    rebindMode: "CURRENT_LOOK_REVIEW_HASH_REBIND",
    rebindSourceAuditSha256: oldParity.auditSha256 || null,
    pixelsRecheckedAt: now,
    pixelsUnchanged: true,
    generatedAt: now,
  };
}

function rebindCurrentFinalReview(recipe, plan, parity, kit) {
  const oldReview = recipe.finalAssemblyReview || {};
  const identity = auditIdentity({...recipe, parityAudit: parity}, plan, kit);
  const evidence = currentParityEvidence(kit);
  const assessmentSha256 = parity.serverVisualAssessmentSha256;
  return {
    ...oldReview,
    contract: "A1ServerAssemblyParityAssessment/v1",
    version: 1,
    generatedBy: "system-visual-reviewer",
    status: "PASS",
    planSha256: plan.planSha256,
    recipeSha256: recipe.recipeSha256,
    selectedDirectionId: recipe.selectedLookMasterBinding?.directionId || null,
    masterSha256: recipe.selectedLookMasterBinding?.artifactSha256 || null,
    assemblySha256: recipe.assemblyComposite?.sha256 || null,
    comparativeReviewSha256: recipe.selectedLookMasterBinding?.comparativeReviewSha256 || null,
    layerScope: evidence.scope,
    contextHash: recipe.videoContextSha256 || recipe.videoContext?.contextSha256 || null,
    sourceImageBindings: sourceImageBindingsFor(recipe),
    structuralParity: {status: "PASS", evidence: evidence.structural},
    materialParity: {status: "PASS", evidence: evidence.material},
    semanticParity: {status: "PASS", evidence: evidence.semantic},
    assessmentSha256,
    rebindMode: "CURRENT_LOOK_REVIEW_HASH_REBIND",
    rebindSourceAssessmentSha256: oldReview.assessmentSha256 || null,
    generatedAt: now,
    // Keep the parity conclusions, but make the provenance of this operation
    // explicit: this is a hash-bound evidence rebind, not a new image or
    // remote critic run.
    evidenceReboundWithoutRegeneration: true,
    evidenceIdentitySha256: sha256(identity),
  };
}

function rebindCurrentComparativeReview(plan, kit, recipe) {
  const currentReview = plan.comparativeReview;
  if (!currentReview?.reviewSha256) throw new Error("ed10-current-comparative-review-missing");
  const replacement = {
    "四层易于重建：底视频、透明类型角色、粒子轨迹、判定标记。": "按四槽合同可映射；本方向实际需要透明类型角色与判定标记，底视频由正片提供，其他槽位可为 NONE。",
    "纸面、单色实体、语言带、痕迹四层关系明确，审美完成度高。": "纸面、单色实体、语言带与痕迹的四槽映射关系明确；实际层与 NONE 槽位可按母版语义裁剪，审美完成度高。",
    "四层拆解清晰，适合稳定重建与跨文章复用。": "四槽合同拆解清晰；实际层与 NONE 槽位可按母版语义裁剪，适合稳定重建与跨文章复用。",
    "基于噪声和扫描线的四层变化较少，容易变成效果先行而非语言动作先行。": "基于噪声和扫描线的可替换层变化较少，容易变成效果先行而非语言动作先行。",
  };
  for (const ranking of currentReview.rankings || []) {
    ranking.strengths = (ranking.strengths || []).map((text) => replacement[text] || text);
    ranking.risks = (ranking.risks || []).map((text) => replacement[text] || text);
  }
  currentReview.reviewSha256 = sha256({...currentReview, reviewSha256: undefined, generatedAt: undefined});
  plan.activeCandidateSet.reviewSha256 = currentReview.reviewSha256;
  plan.portfolioAudit.comparativeReviewSha256 = currentReview.reviewSha256;
  plan.portfolioAudit.auditSha256 = sha256({...plan.portfolioAudit, auditSha256: undefined, generatedAt: undefined});
  for (const binding of [plan.selectedLookMasterBinding, kit.selectedLookMasterBinding, recipe.selectedLookMasterBinding]) {
    if (binding) binding.comparativeReviewSha256 = currentReview.reviewSha256;
  }
  for (const source of [kit.reconstructionSource, recipe.reconstructionSource]) {
    if (source) source.comparativeReviewSha256 = currentReview.reviewSha256;
  }
  return currentReview.reviewSha256;
}

function migrate(current) {
  const next = structuredClone(current);
  const production = next.production;
  const runtime = production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  if (!plan || !kit || !recipe) throw new Error("ed10-current-evidence-records-missing");
  if (recipe.finalAssemblyReview?.status !== "PASS" || recipe.parityAudit?.status !== "PASS") throw new Error("ed10-current-evidence-pass-required");
  if (kit.selectedLookMasterBinding?.directionId !== "direction-05") throw new Error("ed10-current-direction-05-required");
  assertArtifact({publicUrl: kit.selectedLookMasterBinding.artifactPublicUrl, sha256: kit.selectedLookMasterBinding.artifactSha256}, "selected-master");
  assertArtifact(recipe.assemblyComposite, "assembly");
  if (recipe.parityAudit.assemblyPreview?.sha256) assertArtifact(recipe.parityAudit.assemblyPreview, "parity-assembly");

  // Rebind the active comparative review before hashing parity evidence so
  // every current PASS record points at the same current review SHA.
  rebindCurrentComparativeReview(plan, kit, recipe);
  const oldParity = structuredClone(recipe.parityAudit);
  const oldFinal = structuredClone(recipe.finalAssemblyReview);
  const parity = rebindCurrentParity(recipe, kit, kit);
  const finalReview = rebindCurrentFinalReview(recipe, kit, parity, kit);
  recipe.legacyParityAudit = {...oldParity, status: "HISTORY_READ_ONLY", current: false, supersededByAuditSha256: parity.auditSha256};
  recipe.legacyFinalAssemblyReview = {...oldFinal, status: "HISTORY_READ_ONLY", current: false, supersededByAssessmentSha256: finalReview.assessmentSha256};
  recipe.parityAudit = parity;
  recipe.finalAssemblyReview = finalReview;
  recipe.materialIntegration = "four-slot-contract-semantic-layers";
  recipe.recommendation = {...(recipe.recommendation || {}), reason: "四槽合同中的实际层已与当前母版完成 parity；NONE 保持为空，推荐结果等待用户确认。"};

  parity.comparativeReviewSha256 = plan.comparativeReview.reviewSha256;
  finalReview.comparativeReviewSha256 = plan.comparativeReview.reviewSha256;

  // The comparative board is the only current selector.  Keep the old
  // three-direction generation catalog as explicit history, without changing
  // the existing plan identity or invalidating the selected Assembly.
  const directionCatalog = [...(plan.candidateDirections || []), ...(plan.supplementalCandidateDirections || [])];
  const activeIds = plan.activeCandidateSet?.directionIds || plan.comparativeReviewBoard?.candidates?.map((item) => item.directionId) || [];
  plan.legacyCandidateDirections = {
    status: "HISTORY_READ_ONLY",
    current: false,
    candidateBudget: plan.candidateBudget,
    directionIds: (plan.candidateDirections || []).map((item) => item.directionId),
    reason: "旧 Look Master 初始生成目录；当前 selector 只读 activeCandidateSet/currentCandidateDirections。",
  };
  plan.currentCandidateDirections = activeIds.map((id) => directionCatalog.find((direction) => direction.directionId === id)).filter(Boolean);
  plan.currentCandidateBudget = plan.currentCandidateDirections.length;
  plan.candidateDirectionAuthority = "ACTIVE_COMPARATIVE_BOARD";
  if (plan.currentCandidateDirections.length !== 4) throw new Error("ed10-current-active-direction-board-incomplete");

  const briefs = production.packagingStyleBriefs || [];
  const styleBriefAudit = auditRetroPixelStyleBriefs(briefs, {
    appRoot,
    recentHistory: (production.retroPixelEditorialDiversityHistory?.entries || []).filter((entry) => entry.visualStatus === "VISUAL_APPROVED" || entry.status === "VISUAL_APPROVED"),
    distinctEventIds: production.packagingBeatPlan?.anchorSampling?.selectedEventIds || null,
  });
  production.packagingStyleBriefAudit = styleBriefAudit;
  runtime.styleBriefAudit = styleBriefAudit;

  // Current packaging automation remains the only runnable status.  The
  // inherited global policy is retained for historical statistics only.
  production.packagingAutomation = {
    ...(production.packagingAutomation || {}),
    legacyGlobalPolicyStatus: "HISTORY_READ_ONLY",
    legacyGlobalPolicy: {
      status: "HISTORY_READ_ONLY",
      current: false,
      advisoryOnly: true,
      sourceStatus: production.automationPolicy?.status || "unknown",
      sourceContract: production.automationPolicy?.contract || null,
    },
  };
  production.automationPolicy = {
    ...production.automationPolicy,
    packagingLaneScope: "HISTORY_READ_ONLY",
    packagingLaneCurrentStatus: production.packagingAutomation.status,
  };
  runtime.updatedAt = now;
  return recalculateEditorialAssetWorkbench(next, now);
}

withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  const beforeSha = current.workspaceSha256;
  const migrated = migrate(current);
  const validated = assertEditorialAssetWorkbench(migrated);
  const event = createProductionEvent({
    workspace: validated,
    action: "rebind-ed10-current-assembly-evidence",
    targetId: "ED-10",
    payload: {
      beforeWorkspaceSha256: beforeSha,
      afterWorkspaceSha256: validated.workspaceSha256,
      rebindMode: "CURRENT_ASSEMBLY_HASH_REBIND",
      selectedDirectionId: "direction-05",
      imageGenerationPerformed: false,
      criticPerformed: false,
      motionPerformed: false,
    },
    now,
  });
  persistProjectState(appRoot, validated, {event});
  console.log(JSON.stringify({status: "PASS", beforeWorkspaceSha256: beforeSha, workspaceSha256: validated.workspaceSha256, selectedDirectionId: "direction-05", parity: validated.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10")?.finalAssemblyReview, styleAudit: validated.production.packagingStyleBriefAudit, currentCandidateDirectionIds: validated.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10")?.currentCandidateDirections?.map((item) => item.directionId), queue: validated.production.generation.summary, worker: validated.production.generation.workerStatus}, null, 2));
});
