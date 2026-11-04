import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  assertEditorialAssetWorkbench,
  editorialAssetContentSha256,
  recalculateEditorialAssetWorkbench,
  sha256Json,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticlePackagingKit} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {
  deriveProductionAuthority,
} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildVisualCompositionSequence} from "../apps/studio-next/src/lib/a1-visual-composition-system-v1.mjs";
import {ensureVisualGenerationDirector} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const publicRoot = path.join(appRoot, "public/generated/system-line");
const phaseDir = path.join(publicRoot, "editorial-asset-workbench-v1");
const currentRunPath = path.join(publicRoot, "current-project-visual-contract-upgrade-v1/current-article-run.json");
const rawSrtPath = "/Users/a1/Documents/Codex/声音/outputs/subtitles_july1/july1_full_voice_bright_natural_corrected.srt";
const CORRECTION_ID = "ED-20-source-fact-correction-v1";
const CORRECTED_SOURCE_TEXT = "Codex 先整理材料、读取风格库并明确约束，整理后的全文进入工作台继续编辑与收稿。";
const RETAINED_CUES = [58, 59];
const CONTEXT_CUES = [53, 54, 55, 56, 57, 62, 63, 64, 65];
const EXCLUDED_CUES = [60, 61];
const VALID_REQUIRED_MATERIAL_IDS = [
  "source-documentary-document-surface",
  "source-entity-codex",
  "atlas-evidence-connectors",
  "article-element-torn-note-strip",
  "article-element-torn-paper-strip",
  "type-pixel-correction",
  "type-condensed-impact",
];

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJsonAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
};
const unique = (items) => [...new Set(items.filter(Boolean))];
const clone = (value) => structuredClone(value);

const correctedChapterArc = "先以值得记忆的判断明确“材料—角度—动笔”，再将它扩展为本地工作流：Codex负责编排、主线、风格库、约束和收稿检查，整理后的全文进入工作台继续编辑。视觉重点是执行闭环和信息如何流动，不引入外部模型交接。";
const correctedPackageRole = "完整视觉包装承担录屏无法解释的抽象关系：流畅文本为何趋向常见表达，材料、角度、偏好与人工修改如何共同约束生成，以及 Codex 如何把材料、风格库、约束、全文编辑和收稿接成一条本地工作流。包装必须围绕明确对象及其状态变化组织，可使用文本材料、编辑痕迹、分流与回流、版本沉淀、约束前后结果对照；不得退化为通用卡片阵列、漂浮 HUD、无对象连线或白色文档卡。";

function sourceCorrectionMetadata(originalSourceText, originalSourceReportSha256) {
  return {
    contract: "A1SemanticSourceCorrection/v1",
    correctionId: CORRECTION_ID,
    status: "APPLIED",
    shotId: "ED-20",
    sourceTextOriginal: originalSourceText,
    sourceCueIdsRetained: RETAINED_CUES,
    sourceCueIdsContext: CONTEXT_CUES,
    sourceCueIdsExcluded: EXCLUDED_CUES,
    derivedLayer: "subtitle-semantic-and-storyboard",
    sourceReportOriginalSha256: originalSourceReportSha256,
    rawSource: {
      path: rawSrtPath,
      srtSha256: sha256File(rawSrtPath),
      nonDestructive: true,
    },
    note: "仅修正分镜、字幕语义和视觉绑定层；原始录音、原始 SRT、原始时间轴与文章 sourceTextSha256 不覆盖。排除 cue 60–61 的不受支持外部模型/API 叙事。",
  };
}

function correctedShotSemantics(shot) {
  const originalSourceText = shot.sourceTextOriginal || shot.sourceText;
  return {
    ...shot,
    sourceTextOriginal: originalSourceText,
    sourceText: CORRECTED_SOURCE_TEXT,
    semanticSourceMode: "corrected-derived-bridge-v1",
    sourceCueIdsRetained: RETAINED_CUES,
    sourceCueIdsContext: CONTEXT_CUES,
    sourceCueIdsExcluded: EXCLUDED_CUES,
    semanticSourceNote: "由 ED-19 的真实后台编排/风格库口播、ED-20 的真实整理材料口播和 ED-21 的真实工作台正文口播组成的派生桥接；不是新增录音。",
    typographyAssignment: shot.typographyAssignment
      ? {...shot.typographyAssignment, headlineText: "整理材料 继续编辑"}
      : shot.typographyAssignment,
    narrativeJob: "把 Codex 的整理材料、风格库读取、约束和全文编辑收稿接成同一条本地工作流。",
    viewerTakeaway: "整理后的全文进入真实工作台继续编辑与收稿，主角是 Codex 的执行闭环，不是外部模型交接。",
    mediumDecisionReason: "这段用完整包装解释本地工作台如何把整理、风格约束、全文编辑和收稿接起来；只表现 Codex 执行的本地连续动作。",
    packageBrief: "继续使用上一镜的实体编辑材料世界。Codex 先把任务材料归类、整理主线、读取风格库并明确可执行约束；整理后的全文进入真实工作台正文，继续进行编辑、保存与收稿。画面只表现材料、风格库标记、约束边界和真实文章表面之间的本地连续动作，不出现外部模型交接、虚构界面或品牌擂台。",
    transitionOut: "整理后的全文正文表面进入下一镜真实前端页面的标题与全文区域，硬切到可编辑、可保存的工作台。",
    requiredMaterialIds: [...VALID_REQUIRED_MATERIAL_IDS],
    candidateAssetIds: unique([
      ...(shot.candidateAssetIds || []).filter((id) => id !== "source-entity-deepseek"),
      "source-documentary-document-surface",
    ]),
    materialGate: "READY_FOR_CANDIDATE_GENERATION",
    missingMaterialIds: [],
    fallbackPolicy: "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD",
    visualJob: "明确展示“接任务—整理材料—读取风格库—明确约束—全文进入工作台继续编辑与收稿”的本地连续工作流。",
    primaryActor: "由 Codex 执行的材料—风格约束—全文编辑收稿闭环",
    keyPhrases: ["整理材料", "读取风格库", "明确约束", "继续编辑", "收稿"],
    layoutConstraints: [
      "Codex 作为唯一执行主角，所有材料、风格库和约束都汇入同一工作台，不出现外部模型交接。",
      "本地动作接口只作为不可见的内部动作，不把接口画成可见的交接节点。",
      "全文必须落到真实文章表面并与 ED-21 标题/全文区域连续，不用生成的假文档替代。",
      "证据先于判断，风格库与约束作为绑定到材料的编辑痕迹，不做品牌卡片。",
    ],
    motionPhrase: "写作任务先落到 Codex 工作台；材料被归类、主线被整理、风格库与约束被绑定；整理后的全文进入真实文章表面并继续完成编辑与收稿。",
    handoffActor: "整理后的全文正文表面进入真实工作台",
    structureDirections: [
      "材料叠先被归类和整理，风格库标记与约束边界附着到同一个任务包，再把全文正文带回工作台。",
      "编辑案台到正文表面：材料在同一空间完成排序与装订，整理后的全文沿连续纸面进入可编辑区域。",
      "证据带式流程：任务、整理痕迹、风格库约束和全文结果沿一条本地连续阅读带依次出现。",
      "中心工作台对象结构：材料与正文共享一个明确的工作台接点，不设置外部模型交接节点。",
    ],
    referenceConditioning: {
      ...shot.referenceConditioning,
      handoffActor: "整理后的全文正文表面进入真实工作台",
    },
  };
}

function actualReferenceInputs(brief, assetsById) {
  const grammarReferences = (brief.referenceInputs || []).filter((item) => String(item.role || "").startsWith("reference-grammar"));
  const supportingIds = [
    "source-documentary-document-surface",
    "source-entity-codex",
    "atlas-evidence-connectors",
    "article-element-torn-note-strip",
    "article-element-torn-paper-strip",
    "type-pixel-correction",
    "type-condensed-impact",
  ];
  const supporting = supportingIds.map((assetId) => {
    const asset = assetsById.get(assetId);
    return {
      role: "supporting-reference",
      assetId,
      publicUrl: asset?.preview?.publicUrl || asset?.assetUri || null,
      sha256: asset?.sha256 || asset?.contentSha256 || null,
      strength: "medium",
    };
  });
  return [...grammarReferences, ...supporting];
}

function invalidateHistory(history, now) {
  return (history || []).map((entry) => ({
    ...entry,
    validForCurrentProduction: false,
    invalidatedBy: CORRECTION_ID,
    invalidatedAt: now,
    invalidationReason: "ED-20 事实源纠偏后，旧候选只保留为历史审计证据。",
    candidates: Array.isArray(entry.candidates)
      ? entry.candidates.map((candidate) => ({
        ...candidate,
        validForCurrentProduction: false,
        invalidatedBy: CORRECTION_ID,
        invalidatedAt: now,
      }))
      : entry.candidates,
  }));
}

function updateCurrentBrief(workspace, correctedShot, now) {
  const director = workspace.production.visualDirector;
  const brief = director.shotBriefs.find((item) => item.shotId === "ED-20");
  if (!brief) throw new Error("ed20-visual-brief-missing");
  const assetsById = new Map(workspace.library.assets.map((asset) => [asset.id, asset]));
  const allShots = workspace.assetRequirementGraph.shotDemands;
  const nextPlan = buildVisualCompositionSequence(allShots).find((plan) => plan.shotId === "ED-20");
  if (!nextPlan) throw new Error("ed20-composition-plan-missing");
  const focalPoint = nextPlan.orientation === "left-origin" ? "32% 48%" : nextPlan.orientation === "right-origin" ? "68% 48%" : "50% 48%";
  const nextBrief = {
    ...brief,
    semanticBeat: correctedShot.sourceText,
    visualTask: correctedShot.visualJob,
    subject: correctedShot.primaryActor,
    compositionPlan: nextPlan,
    visualProposition: nextPlan.visualProposition,
    compositionSignature: nextPlan.compositionSignature,
    focalPoint,
    negativeSpace: "keep the lower caption lane clear; negative space must be created by the assigned editorial-spread silhouette, not by a universal left-right split",
    assignedPackagingAssetIds: (brief.assignedPackagingAssetIds || []).filter((id) => id !== "source-entity-deepseek"),
    referenceInputs: actualReferenceInputs(brief, assetsById),
    motionIntent: correctedShot.motionPhrase,
    transitionHandoff: correctedShot.handoffActor,
    factCorrectionId: CORRECTION_ID,
    updatedAt: now,
  };
  director.shotBriefs = director.shotBriefs.map((item) => item.shotId === "ED-20" ? nextBrief : item);
  director.generatedCandidates = (director.generatedCandidates || []).filter((candidate) => candidate.shotId !== "ED-20");
  director.selectedCandidateBindings = (director.selectedCandidateBindings || []).filter((binding) => binding.shotId !== "ED-20");
  director.compositeReviews = (director.compositeReviews || []).filter((review) => review.shotId !== "ED-20");
  director.updatedAt = now;
  ensureVisualGenerationDirector(workspace, now);
}

function updateWorkspace(workspace, correctedRun, originalWorkspaceSha256, originalSourceReportSha256, now) {
  const graph = workspace.assetRequirementGraph;
  const correctedShot = graph.shotDemands.find((shot) => shot.shotId === "ED-20");
  if (!correctedShot) throw new Error("ed20-shot-demand-missing");
  const nextShot = correctedShotSemantics(correctedShot);
  graph.shotDemands = graph.shotDemands.map((shot) => shot.shotId === "ED-20" ? nextShot : shot);
  graph.requirements = graph.requirements
    .map((requirement) => ({...requirement, usedByShotIds: (requirement.usedByShotIds || []).filter((shotId) => shotId !== "ED-20")}))
    .filter((requirement) => requirement.usedByShotIds.length > 0);
  graph.requirementCount = graph.requirements.length;
  graph.exactOutputBoundCount = graph.requirements.filter((requirement) => requirement.exactOutputBound === true).length;
  if (Array.isArray(workspace.typographySystem?.shotAssignments)) {
    workspace.typographySystem.shotAssignments = workspace.typographySystem.shotAssignments.map((assignment, index) => index === 19
      ? {...assignment, headlineText: "整理材料 继续编辑"}
      : assignment);
  }

  const ed20Asset = workspace.library.assets.find((asset) => asset.id === "composition-ED-20");
  if (!ed20Asset) throw new Error("ed20-composition-asset-missing");
  const previousAudit = ed20Asset.candidateSetAudit || null;
  const correctedAssetShot = {
    ...ed20Asset.shotDemand,
    ...nextShot,
    order: ed20Asset.shotDemand?.order || 20,
    typographyAssignment: ed20Asset.shotDemand?.typographyAssignment
      ? {...ed20Asset.shotDemand.typographyAssignment, headlineText: "整理材料 继续编辑"}
      : undefined,
  };
  Object.assign(ed20Asset, {
    name: "镜头 20 · Codex 整理材料并将全文带回工作台",
    purpose: "把 Codex 的材料整理、风格库约束、全文编辑和收稿动作接成同一条本地工作流。",
    promptBrief: "在已批准的同一篇文章资产包内，为 ED-20 组合可编辑 scene graph 候选。观众必须看到 Codex 整理材料、读取风格库、明确约束，并把整理后的全文带回真实工作台继续编辑与收稿；不得出现外部模型交接、DeepSeek 品牌素材、假 UI、白卡或漂浮 HUD。",
    sourceRequirement: `chapter=ch05-method-to-system; requiredMaterialIds=${VALID_REQUIRED_MATERIAL_IDS.join(",")}; materialGate=READY_FOR_CANDIDATE_GENERATION; sourceFactCorrection=${CORRECTION_ID}.`,
    status: "brief-ready",
    candidates: [],
    candidateRender: null,
    selectedCandidateId: null,
    visualCritic: null,
    bestEffectHeroFrame: null,
    candidateSetAudit: previousAudit ? {
      ...previousAudit,
      status: "INVALIDATED_FACT_CORRECTION",
      validForCurrentProduction: false,
      invalidatedBy: CORRECTION_ID,
      invalidatedAt: now,
      invalidationReason: "旧候选依赖外部模型事实源，事实纠偏后不得继续采用。",
    } : {
      contract: "A1ShotCandidateSetAudit/v1",
      status: "INVALIDATED_FACT_CORRECTION",
      candidateCount: 0,
      structureDirectionCount: 0,
      distinctSilhouetteCount: 0,
      requiredDistinctSilhouetteCount: 3,
      validForCurrentProduction: false,
      invalidatedBy: CORRECTION_ID,
      invalidatedAt: now,
    },
    revisionHistory: invalidateHistory(ed20Asset.revisionHistory, now),
    review: {
      status: "pending",
      note: "ED-20 事实源已纠偏；旧候选、审片和下游绑定已局部失效，等待按新语义重新构图。",
      reviewedAt: now,
      reviewedBy: "system-fact-correction",
      approvedContentSha256: null,
    },
    visualRevision: {
      ...(ed20Asset.visualRevision || {}),
      factCorrectionId: CORRECTION_ID,
      sourceReportSha256: null,
      createdAt: now,
    },
    shotDemand: correctedAssetShot,
  });

  const deepseekAsset = workspace.library.assets.find((asset) => asset.id === "source-entity-deepseek");
  if (deepseekAsset) deepseekAsset.usedByShotIds = (deepseekAsset.usedByShotIds || []).filter((shotId) => shotId !== "ED-20");

  workspace.visualBible.mediumRules.package = correctedPackageRole;
  const chapter = workspace.visualBible.chapterDirectives.find((item) => item.chapterId === "ch05-method-to-system");
  if (chapter) chapter.narrativeArc = correctedChapterArc;

  workspace.article.semanticSourceCorrection = sourceCorrectionMetadata(
    correctedShot.sourceTextOriginal || correctedShot.sourceText,
    workspace.article.semanticSourceCorrection?.sourceReportOriginalSha256 || originalSourceReportSha256,
  );
  workspace.article.sourceReportSha256 = sha256(JSON.stringify(correctedRun, null, 2) + "\n");
  workspace.directorInput.sha256 = workspace.article.sourceReportSha256;
  workspace.production.factCorrectionLedger = {
    contract: "A1ProductionFactCorrectionLedger/v1",
    updatedAt: now,
    corrections: [{
      correctionId: CORRECTION_ID,
      shotId: "ED-20",
      excludedCueIds: EXCLUDED_CUES,
      preservedRawSource: true,
      invalidatedDependencies: ["ED-20 candidates", "ED-20 visual reviews", "ED-20 downstream bindings", "ED-20 legacy external-model requirement records"],
      preservedDependencies: ["ED-01/ED-14/ED-10 strategy-switch blocker", "Pinterest policy", "visual maturity cycle normalization", "4311 fuse UI", "ED-12 truthful model comparison"],
    }],
  };

  updateCurrentBrief(workspace, correctedAssetShot, now);
  let recalculated = recalculateEditorialAssetWorkbench(workspace, now);
  // Removing ED-20 from the DeepSeek usage list changes only the usage
  // binding, not the approved source bytes. Re-assert that unchanged source
  // approval so ED-12 remains truthful and the source gate does not regress.
  const deepseekAfterRecalc = recalculated.library.assets.find((asset) => asset.id === "source-entity-deepseek");
  if (deepseekAfterRecalc) {
    const contentSha256 = editorialAssetContentSha256(deepseekAfterRecalc);
    deepseekAfterRecalc.status = "approved";
    deepseekAfterRecalc.review = {
      status: "approved",
      note: "ED-20 事实纠偏后保留 DeepSeek 在 ED-12 的真实模型比较来源；文件内容未变，仅移除 ED-20 使用绑定。",
      reviewedAt: now,
      reviewedBy: "system-fact-correction",
      approvedContentSha256: contentSha256,
    };
    deepseekAfterRecalc.contentSha256 = contentSha256;
  }
  const packagingKit = recalculated.production.articlePackagingKit;
  if (packagingKit) {
    packagingKit.status = "approved";
    packagingKit.review = {
      status: "approved",
      note: "文章级 Packaging Kit 继承既有审美批准；本次仅移除 ED-20 的 DeepSeek 来源绑定，未改变素材文件。",
      reviewedAt: now,
      reviewedBy: "system-fact-correction",
      approvedKitSha256: packagingKit.kitSha256,
    };
    packagingKit.gates = {
      ...(packagingKit.gates || {}),
      typographyFoundryApproved: true,
      userVisualApproval: "APPROVED",
      shotCompositionAllowed: true,
      motionAllowed: false,
      renderAllowed: false,
    };
    assertArticlePackagingKit(packagingKit, recalculated);
  }
  // Recalculate once more so source/packaging approvals and the existing
  // ED-01/ED-14/ED-10 strategy-switch authority are reflected consistently.
  recalculated = recalculateEditorialAssetWorkbench(recalculated, now);
  const checkpoint = recalculated.production.incrementalReviewCheckpoint;
  checkpoint.scope = "shot-local";
  checkpoint.invalidatedShotIds = unique([...(checkpoint.invalidatedShotIds || []), "ED-20"]);
  checkpoint.note = "ED-20 事实源纠偏只失效本镜候选、审片和下游绑定；其余镜头及 ED-01/ED-14/ED-10 策略切换门禁保持不变。";
  checkpoint.factCorrectionId = CORRECTION_ID;

  recalculated.production.authority = deriveProductionAuthority(recalculated);
  recalculated.production.designCalibrationBatch = recalculated.production.authority.designCalibrationBatch;
  recalculated.production.project.currentStage = recalculated.production.authority.currentStage;
  recalculated.production.project.updatedAt = now;
  recalculated.production.nextAction = recalculated.production.authority.nextAction.label;
  if (recalculated.production.maturityLoop) {
    recalculated.production.maturityLoop.currentStage = recalculated.production.authority.currentStage;
    recalculated.production.maturityLoop.nextAction = recalculated.production.authority.nextAction.id;
    recalculated.production.maturityLoop.authorityMirrorSha256 = recalculated.production.authority.sha256;
  }
  recalculated.factCorrectionWorkspaceSha256Before = originalWorkspaceSha256;
  const hashInput = clone(recalculated);
  delete hashInput.workspaceSha256;
  if (hashInput.reviewLedger) hashInput.reviewLedger.workspaceSha256 = null;
  recalculated.workspaceSha256 = sha256Json(hashInput);
  recalculated.reviewLedger.workspaceSha256 = recalculated.workspaceSha256;
  return recalculated;
}

function runMigration() {
  const workspacePath = path.join(phaseDir, "workspace.json");
  return withProjectLock(appRoot, () => {
    const workspace = readProjectWorkspace(appRoot);
    const currentRun = readJson(currentRunPath);
    const originalWorkspaceSha256 = workspace.workspaceSha256;
    const originalSourceReportSha256 = sha256File(currentRunPath);
    const rawSrtSha256 = sha256File(rawSrtPath);
    if (workspace.article?.shotCount !== 34 || workspace.assetRequirementGraph?.shotCount !== 34) throw new Error("ed20-correction-shot-count-guard-failed");
    if (workspace.article?.sourceTextSha256 !== "108de8b4b4bc42448accd081363a347435973b5098c8a1b6ced04078ce5e14c3") throw new Error("article-source-hash-changed");
    if (rawSrtSha256 !== "997407683bd017f2b6fc35ce4afc2d0f59512d05c0d1dd17e9455cc28eb0facd") throw new Error("raw-srt-hash-unexpected");
    const originalShot = currentRun.plan?.shots?.find((shot) => shot.shotId === "ED-20");
    if (!originalShot || originalShot.firstCueId !== 58 || originalShot.lastCueId !== 61) throw new Error("ed20-cue-window-guard-failed");

    const correctedRun = clone(currentRun);
    correctedRun.plan.strategy.packageRole = correctedPackageRole;
    correctedRun.plan.strategy.chapters = correctedRun.plan.strategy.chapters.map((chapter) => chapter.chapterId === "ch05-method-to-system" ? {...chapter, narrativeArc: correctedChapterArc} : chapter);
    correctedRun.plan.chapters = correctedRun.plan.chapters.map((chapter) => chapter.chapterId === "ch05-method-to-system" ? {...chapter, narrativeArc: correctedChapterArc} : chapter);
    correctedRun.plan.shots = correctedRun.plan.shots.map((shot) => shot.shotId === "ED-20" ? correctedShotSemantics(shot) : shot);

    const nextWorkspace = updateWorkspace(workspace, correctedRun, originalWorkspaceSha256, originalSourceReportSha256, new Date().toISOString());
    assertEditorialAssetWorkbench(nextWorkspace);
    const nextRunSha256 = sha256(JSON.stringify(correctedRun, null, 2) + "\n");
    if (nextRunSha256 !== nextWorkspace.article.sourceReportSha256) throw new Error("corrected-source-report-hash-mismatch");
    writeJsonAtomic(currentRunPath, correctedRun);
    const report = {
      contract: "A1ED20SourceFactCorrectionMigrationReport/v1",
      status: "APPLIED",
      correctionId: CORRECTION_ID,
      appliedAt: nextWorkspace.updatedAt,
      workspaceSha256Before: originalWorkspaceSha256,
      workspaceSha256After: nextWorkspace.workspaceSha256,
      policySha256: nextWorkspace.visualBible.visualGenerationPolicy.sha256,
      rawSource: {path: rawSrtPath, sha256: rawSrtSha256, preserved: true, excludedCueIds: EXCLUDED_CUES},
      ed20Before: {sourceText: originalShot.sourceText, keyPhrases: originalShot.keyPhrases, visualJob: originalShot.visualJob, primaryActor: originalShot.primaryActor},
      ed20After: {sourceText: CORRECTED_SOURCE_TEXT, keyPhrases: ["整理材料", "读取风格库", "明确约束", "继续编辑", "收稿"], visualJob: "明确展示本地连续工作流", primaryActor: "由 Codex 执行的材料—风格约束—全文编辑收稿闭环"},
      invalidatedDependencies: ["ED-20 candidate set", "ED-20 visual review", "ED-20 best-effect hero frame", "ED-20 legacy external-model requirement records", "ED-20 visualDirector generated/selected/composite bindings"],
      preserved: {shotCount: nextWorkspace.article.shotCount, sixCalibrationShotIds: nextWorkspace.production.designCalibrationBatch.items.map((item) => item.shotId), nextAction: nextWorkspace.production.authority.nextAction, rawArticleSourceTextSha256: nextWorkspace.article.sourceTextSha256},
      currentRunSha256: nextRunSha256,
    };
    const event = createProductionEvent({workspace: nextWorkspace, action: "ed20-source-fact-correction-applied", targetId: "ED-20", payload: report, now: nextWorkspace.updatedAt});
    persistProjectState(appRoot, nextWorkspace, {
      event,
      files: {
        "whole-film-director-input.json": correctedRun,
        "ed20-source-fact-correction-v1/migration-report.json": report,
      },
    });
    // Keep the current-run derived file in sync with the phase copy. It is not
    // an authority store, but future rebuilds must not resurrect the old claim.
    writeJsonAtomic(currentRunPath, correctedRun);
    console.log(JSON.stringify(report, null, 2));
    return report;
  });
}

runMigration();
