#!/usr/bin/env node
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  assertShotIntelligenceDecisionSet,
  alignShotIntelligenceDecisionSetWithCoveragePlan,
  reconcileSemanticTimelineRevision,
} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";
import {
  assertShotResearchPacket,
  buildShotResearchPacket,
} from "../apps/studio-next/src/lib/a1-shot-research-packet-v1.mjs";
import {
  assertPackageAssetKitPlan,
} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {
  auditPackageLookMasterTopologyDiversity,
  assertPackageLookMasterRuntime,
  buildResearchSourceConditioningInputs,
  buildWebSourceConditioningInputs,
  buildPackageLookMasterPlan,
  representativePackageLookMasterDirection,
  topologyFingerprint,
} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {auditRetroPixelStyleBriefs, compileRetroPixelEditorialStyleBrief, mergeRetroPixelDiversityHistory} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertVideoPackagingContext} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";

const appRoot = path.resolve("apps/studio-next");
const now = new Date().toISOString();
const sourceResearch = {
  modelCapabilities: [
    {
      url: "https://platform.openai.com/docs/models",
      title: "Models - OpenAI API",
      author: "OpenAI",
      publisher: "OpenAI Developers",
      date: null,
      sourceTier: "official",
      usageClass: "RESEARCH_ONLY",
      relevance: "官方模型目录可核对当前模型家族与能力边界；只作为命名模型的事实入口，不替代用户对模型输出的体验判断。",
      authority: "first-party model documentation",
      visualUse: "metadata-only",
      risk: "模型目录会变化；检索时间与 URL 必须绑定，不能把页面截图当生产素材。",
      selectionReason: "ED-12 点名模型能力，优先记录官方模型目录。",
    },
    {
      url: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
      title: "Models overview - Claude Platform Docs",
      author: "Anthropic",
      publisher: "Anthropic",
      date: null,
      sourceTier: "official",
      usageClass: "RESEARCH_ONLY",
      relevance: "官方 Claude 模型总览，用于核对命名实体与能力说明的来源边界。",
      authority: "first-party model documentation",
      visualUse: "metadata-only",
      risk: "文档内容与模型版本会变化；不把官方宣传页当独立质量证据。",
      selectionReason: "ED-12 明确包含 Claude，登记一手模型文档。",
    },
    {
      url: "https://platform.kimi.com/docs/overview",
      title: "快速开始 - Kimi API 开放平台",
      author: "Moonshot AI",
      publisher: "Kimi API 开放平台",
      date: null,
      sourceTier: "official",
      usageClass: "RESEARCH_ONLY",
      relevance: "官方 Kimi 开放平台入口，用于核对命名实体及其文档边界。",
      authority: "first-party product documentation",
      visualUse: "metadata-only",
      risk: "官方产品文档不是对写作质量的独立评估；不下载或烘焙其 UI。",
      selectionReason: "ED-12 点名 Kimi，登记官方入口而非第三方截图。",
    },
    {
      url: "https://api-docs.deepseek.com/api/list-models",
      title: "Lists Models - DeepSeek API Docs",
      author: "DeepSeek",
      publisher: "DeepSeek API Docs",
      date: null,
      sourceTier: "official",
      usageClass: "RESEARCH_ONLY",
      relevance: "官方模型列表接口，明确说明模型标识与所有者；用于 ED-12 的实体核对。",
      authority: "first-party API documentation",
      visualUse: "metadata-only",
      risk: "模型清单会更新；只能作为来源登记，不把 API 文档当成文章事实画面。",
      selectionReason: "ED-12 点名 DeepSeek，优先登记官方模型列表。",
    },
    {
      url: "https://docs.bigmodel.cn/cn/guide/start/introduction",
      title: "平台介绍 - 智谱AI开放文档",
      author: "智谱AI",
      publisher: "智谱AI开放文档",
      date: null,
      sourceTier: "official",
      usageClass: "RESEARCH_ONLY",
      relevance: "官方智谱开放文档入口，用于核对命名实体与产品文档边界。",
      authority: "first-party product documentation",
      visualUse: "metadata-only",
      risk: "文档不直接证明中文写作体验；不把其页面或标识作为生成画面素材。",
      selectionReason: "ED-12 点名智谱，登记官方一手入口。",
    },
  ],
  researchDiversity: [
    {
      url: "https://aclanthology.org/2026.acl-long.1803/",
      title: "More Aligned, Less Diverse? Analyzing the Grammar and Lexicon of Two Generations of LLMs",
      author: "Adrián Gude; Roi Santos-Rios; Francis Bond; Dan Flickinger; Carlos Gómez-Rodríguez; Olga Zamaraeva",
      publisher: "Association for Computational Linguistics",
      date: "2026-07",
      sourceTier: "primary",
      usageClass: "PRODUCTION_ALLOWED",
      relevance: "ACL 一手论文比较两代 LLM 与人类英文新闻文本，摘要明确报告更新的 instruction-tuned 模型句法、尤其词汇多样性降低；只能收窄为‘与更窄的表达范围相关’，不能升级成优先选择稳妥表达的完整因果链。",
      authority: "ACL Anthology first-party conference paper and PDF",
      visualUse: "title-and-abstract-page-reference",
      risk: "研究对象是英文新闻与特定模型代际；不能直接证明中文口播或所有模型，也不能凭论文生成数字/伪图表。",
      selectionReason: "直接提供可追溯的一手论文标题页与摘要页，作为 ED-14 研究 grounding 的真实视觉证据。",
      groundedClaim: "一项 ACL 2026 对英文新闻文本的比较报告：较新的 instruction-tuned LLM 相比较旧的非 instruction-tuned 模型，句法多样性降低，词汇多样性尤其明显；这提示表达范围可能变窄，但不直接证明‘优先走常见、稳妥、可复用表达’的完整因果说法。",
      supportedClaims: [
        "较新的 instruction-tuned LLM 在该研究样本中显示出较低的句法多样性。",
        "该研究报告词汇多样性下降更明显，并将其表述为表达范围可能变窄的线索。",
      ],
      referenceArtifact: {
        publicUrl: "/generated/system-line/web-source-packaging-pilot-v1/sources/acl-2026-acl-long-1803-title-abstract.png",
        sha256: "747566071afd35f7265a4b30d4f08607132c0c7650769617e62abf7edffd7a46",
        artifactKind: "OFFICIAL_ACL_PAPER_TITLE_ABSTRACT_PAGE",
      },
    },
  ],
  researchStyle: [
    {
      url: "https://aclanthology.org/2025.emnlp-main.1155/",
      title: "Persona-Augmented Benchmarking: Evaluating LLMs Across Diverse Writing Styles",
      author: "Kimberly Truong; Riccardo Fogliato; Hoda Heidari; Steven Wu",
      publisher: "ACL Anthology / EMNLP 2025",
      date: "2025-11",
      sourceTier: "primary",
      usageClass: "RESEARCH_ONLY",
      relevance: "说明写作风格与提示格式变化会影响模型表现，适合作为‘AI 不说人话/风格上下文’的研究语境，而非对中文口播的直接证据。",
      authority: "conference proceedings and primary benchmark description",
      visualUse: "none; metadata only",
      risk: "不是中文真人表达研究；不能把 benchmark 结果当作当前文章的事实素材。",
      selectionReason: "当前 beat 是抽象风格问题，研究只用于界定语境，不会替代用户的个人判断。",
    },
  ],
};

function byMeaning(items, predicate) { return items.find((item) => predicate(String(item.sourceText || ""))); }
function assemblyToPackagingType(mode) { return mode === "OVERLAY" ? "OVERLAY_PACKAGE" : mode === "FULLSCREEN" ? "FULLSCREEN_PACKAGE" : mode === "TYPOGRAPHY" ? "TYPOGRAPHY_PACKAGE" : mode === "EXPLAINER" ? "EXPLAINER_PACKAGE" : "NO_PACKAGE"; }
function rebuildPackagingPlan(plan, decisions, now) {
  const decisionByShot = new Map(decisions.map((decision) => [decision.shotId, decision]));
  const oldEvents = new Map((plan.packagingEvents || []).flatMap((event) => (event.sourceBeatIds || []).map((shotId) => [shotId, event])));
  let eventIndex = 0;
  const items = (plan.semanticBeats || plan.items || []).map((rawBeat) => {
    const decision = decisionByShot.get(rawBeat.beatId || rawBeat.shotId);
    if (!decision) return rawBeat;
    const selected = decision.packageDecision === "PACKAGE";
    const sequenceReview = decision.sequenceReview || decision.semanticTimeline || null;
    const selectedMode = selected ? (sequenceReview?.finalPackageMode || decision.assemblyMode) : null;
    const previousCandidateStatus = rawBeat.candidateEvaluation?.status;
    const nonPackageStatus = previousCandidateStatus && previousCandidateStatus !== "selected"
      ? previousCandidateStatus
      : "incompatible-packaging";
    const packagingEventId = selected
      ? sequenceReview?.eventGrouping?.groupId || `packaging-event-${String(++eventIndex).padStart(2, "0")}`
      : null;
    return {
      ...rawBeat,
      networkDecision: decision.networkDecision,
      networkReason: decision.networkReason,
      claimType: decision.claimType,
      searchIntents: decision.searchIntents,
      searchQueries: decision.searchQueries,
      packageDecision: decision.packageDecision,
      packageReason: decision.packageReason,
      assemblyMode: selectedMode,
      presentationMode: selected ? selectedMode : null,
      presentationModeReason: selected ? decision.presentationModeReason : null,
      whyPresentationModeBeatsOtherModes: selected ? decision.whyPresentationModeBeatsOtherModes : null,
      assemblyModeReason: selected ? decision.assemblyModeReason : null,
      whyThisModeBeatsOtherModes: selected ? decision.whyThisModeBeatsOtherModes : null,
      decisionVersion: decision.decisionVersion,
      decisionHash: decision.decisionHash,
      itemType: selected ? assemblyToPackagingType(selectedMode) : "NO_PACKAGE",
      packagingType: selected ? assemblyToPackagingType(selectedMode) : "NO_PACKAGE",
      packagingEventId,
      selectionStatus: selected ? "selected" : nonPackageStatus,
      selectionReason: selected ? decision.packageReason : rawBeat.selectionReason || rawBeat.candidateEvaluation?.downgradeReason || decision.packageReason,
      whyPackage: selected ? decision.packageReason : null,
      whyPackagingIsBetterThanNoPackage: decision.whyPackagingBeatsNoPackage,
      generationAllowed: selected,
      candidateEvaluation: {
        ...(rawBeat.candidateEvaluation || {}),
        candidate: selected,
        typeFit: selected ? assemblyToPackagingType(selectedMode) : "NO_PACKAGE",
        valueAdded: decision.valueAdded,
        status: selected ? "selected" : nonPackageStatus,
        downgradeReason: selected ? null : rawBeat.candidateEvaluation?.downgradeReason || "不适配独立包装：基础口播或录屏已能承载语义。",
      },
    };
  });
  const packagingEventsById = new Map();
  for (const item of items.filter((candidate) => candidate.packageDecision === "PACKAGE")) {
    const shotId = item.beatId || item.shotId;
    const oldEvent = oldEvents.get(shotId);
    const existing = packagingEventsById.get(item.packagingEventId);
    const memberShotIds = item.sequenceReview?.eventGrouping?.memberShotIds || item.semanticTimeline?.eventGrouping?.memberShotIds || [shotId];
    packagingEventsById.set(item.packagingEventId, {
      ...(existing || oldEvent || {}),
      eventId: item.packagingEventId,
      sourceBeatIds: [...new Set([...(existing?.sourceBeatIds || []), ...memberShotIds])],
      packagingType: item.packagingType,
      semanticRole: existing?.semanticRole || item.semanticRole,
      sourceText: existing?.sourceText || item.sourceText,
      whyPackage: existing?.whyPackage || item.whyPackage,
      whyPackagingIsBetterThanNoPackage: existing?.whyPackagingIsBetterThanNoPackage || item.whyPackagingIsBetterThanNoPackage,
      assemblyMode: item.assemblyMode,
      presentationMode: item.presentationMode,
      presentationModeReason: item.presentationModeReason,
      whyPresentationModeBeatsOtherModes: item.whyPresentationModeBeatsOtherModes,
      assemblyModeReason: item.assemblyModeReason,
      whyThisModeBeatsOtherModes: item.whyThisModeBeatsOtherModes,
      valueAdded: Math.max(Number(existing?.valueAdded || 0), Number(item.valueAdded || 0)),
      generationAllowed: true,
      editorOwnsBaseFootage: true,
      groupingMethod: item.sequenceReview?.eventGrouping?.groupingMethod || item.semanticTimeline?.eventGrouping?.groupingMethod || "SINGLE_SHOT_PACKAGE",
      insertionHint: existing?.insertionHint || oldEvent?.insertionHint || {placement: "editor-places-after-source-beat"},
    });
  }
  const packagingEvents = [...packagingEventsById.values()];
  const withoutHash = {
    ...plan,
    generatedAt: now,
    semanticBeats: items,
    items,
    packagingEvents,
    packagingEventCount: packagingEvents.length,
    noPackageCount: items.length - packagingEvents.length,
    noPackageMajority: items.length - packagingEvents.length > items.length / 2,
    selector: {...(plan.selector || {}), candidateCount: Math.max(Number(plan.selector?.candidateCount || 0), packagingEvents.length), selectedCount: packagingEvents.length, selectionModel: "per-shot-network-and-package-two-axis"},
    summary: {
      ...(plan.summary || {}),
      semanticBeatCount: items.length,
      packagingEventCount: packagingEvents.length,
      noPackageCount: items.length - packagingEvents.length,
      noPackageMajority: items.length - packagingEvents.length > items.length / 2,
      packagingTypes: packagingEvents.reduce((counts, event) => ({...counts, [event.packagingType]: (counts[event.packagingType] || 0) + 1}), {}),
    },
    sha256: undefined,
  };
  return {...withoutHash, sha256: crypto.createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex")};
}

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
  const videoContextManifestPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/manifest.json");
  const webSourcePilotManifestPath = path.join(appRoot, "public/generated/system-line/web-source-packaging-pilot-v1/manifest.json");
  if (!fs.existsSync(referenceManifestPath)) throw new Error("pinterest-retro-pixel-project-manifest-missing");
  if (!fs.existsSync(videoContextManifestPath)) throw new Error("video-packaging-context-manifest-missing");
  const referenceManifest = JSON.parse(fs.readFileSync(referenceManifestPath, "utf8"));
  const videoContextSet = JSON.parse(fs.readFileSync(videoContextManifestPath, "utf8"));
  const webSourcePilotManifest = fs.existsSync(webSourcePilotManifestPath) ? JSON.parse(fs.readFileSync(webSourcePilotManifestPath, "utf8")) : null;
  const videoContextByShot = new Map((videoContextSet.items || []).map((context) => [context.shotId, assertVideoPackagingContext(context)]));
  const plan = current.production.packagingBeatPlan;
  if (!plan || !Array.isArray(plan.semanticBeats) || plan.semanticBeats.length !== current.article.shotCount) throw new Error("semantic-beat-plan-missing-or-count-mismatch");
  const sourceHash = current.article.sourceTextSha256;
  const revisionReconciliation = reconcileSemanticTimelineRevision({
    decisionSet: current.production.shotIntelligence.decisionSet,
    beats: plan.semanticBeats,
    sourceHash,
    projectId: current.production.project.projectId,
    now,
  });
  const baseDecisions = revisionReconciliation.decisionSet;
  const decisions = alignShotIntelligenceDecisionSetWithCoveragePlan(baseDecisions, current.production.shotVisualCoveragePlan, {now});
  assertShotIntelligenceDecisionSet(decisions);
  const nextPlan = rebuildPackagingPlan(plan, decisions.items, now);

  const researchPackets = [];
  const researchBeat = byMeaning(plan.semanticBeats, (sourceText) => /研究|论文|查了一下/.test(sourceText));
  const styleBeat = byMeaning(plan.semanticBeats, (sourceText) => /不说人话|AI\s*味|没人味/.test(sourceText));
  const modelBeat = byMeaning(plan.semanticBeats, (sourceText) => /ChatGPT|Claude|Kimi|DeepSeek|智谱|模型能力|大模型/u.test(sourceText));
  const sourceTextAll = plan.semanticBeats.map((beat) => beat.sourceText || "").join(" ");
  const hallucinationClaimPresent = /幻觉|虚构来源|事实错误|编造来源/.test(sourceTextAll);
  for (const decision of decisions.items.filter((item) => ["REQUIRED", "HELPFUL"].includes(item.networkDecision))) {
    const isResearchTrial = researchBeat && decision.shotId === researchBeat.beatId;
    const isStyleTrial = styleBeat && decision.shotId === styleBeat.beatId;
    const isModelTrial = modelBeat && decision.shotId === modelBeat.beatId;
    const sources = isResearchTrial ? sourceResearch.researchDiversity : isStyleTrial ? sourceResearch.researchStyle : isModelTrial ? sourceResearch.modelCapabilities : [];
    const evidenceSufficiency = sources.length && (isResearchTrial || isModelTrial) ? "sufficient" : sources.length ? "partial" : "not-run";
    const packet = buildShotResearchPacket({
      decision,
      sources,
      evidenceSufficiency,
      unresolvedGaps: sources.length
        ? isResearchTrial
          ? ["没有找到当前原文所称具体论文/中文样本绑定；本包只登记研究入口，不产生事实画面。"]
          : isModelTrial
            ? ["官方模型文档只完成命名与能力边界核对；不把研究来源自动转成生产图片或 UI 证据。"]
            : ["研究未直接测量中文口播的‘不说人话’；需要用户语料或额外中文研究才能升级证据。"]
        : ["本轮只编译 query，不执行大规模联网；等待用户查看研究意图后再扩展。"],
      budget: {maxQueries: 3, maxSources: 4},
      now,
    });
    assertShotResearchPacket(packet);
    researchPackets.push(packet);
  }

  const styleBriefs = nextPlan.packagingEvents.map((event) => compileRetroPixelEditorialStyleBrief({event, appRoot, videoContext: videoContextByShot.get(event.sourceBeatIds[0]) || null, now}));
  if (styleBriefs.length !== nextPlan.packagingEvents.length || new Set(styleBriefs.map((brief) => brief.eventId)).size !== styleBriefs.length) throw new Error("packaging-style-brief-event-parity-invalid");
  const approvedHistory = (current.production.retroPixelEditorialDiversityHistory?.entries || [])
    .filter((entry) => entry.visualStatus === "VISUAL_APPROVED" || entry.status === "VISUAL_APPROVED");
  const styleBriefAudit = auditRetroPixelStyleBriefs(styleBriefs, {appRoot, recentHistory: approvedHistory, distinctEventIds: nextPlan.anchorSampling?.selectedEventIds || []});
  const diversityHistory = mergeRetroPixelDiversityHistory(approvedHistory, []);
  diversityHistory.proposedFingerprints = styleBriefs.map((brief) => ({outputId: brief.outputId, contentSha256: brief.contentSha256, styleBriefSha256: brief.styleBriefSha256, fingerprint: brief.fingerprint, status: "READY_FOR_REVIEW"}));
  const styleBriefByShot = new Map(styleBriefs.flatMap((brief) => brief.sourceBeatIds.map((shotId) => [shotId, brief])));
  const styleBoundEvents = nextPlan.packagingEvents.map((event) => ({...event, styleBriefSha256: styleBriefByShot.get(event.sourceBeatIds[0])?.styleBriefSha256 || null}));
  const styleBoundItems = nextPlan.items.map((item) => item.packagingEventId ? {...item, styleBriefSha256: styleBriefByShot.get(item.beatId)?.styleBriefSha256 || null} : item);
  const styleBoundPlanBase = {...nextPlan, packagingEvents: styleBoundEvents, semanticBeats: styleBoundItems, items: styleBoundItems, sha256: undefined};
  const styleBoundPlan = {...styleBoundPlanBase, sha256: crypto.createHash("sha256").update(JSON.stringify(styleBoundPlanBase)).digest("hex")};
  const packageShotIds = new Set(decisions.items.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId));
  const kitPlans = (current.production.shotIntelligence?.packageAssetKitPlans || [])
    .filter((kit) => packageShotIds.has(kit.shotId))
    .map((kit) => ({...assertPackageAssetKitPlan(kit), authorityScope: "HISTORY_READ_ONLY", current: false, preApprovalReusable: false}));
  const assemblyRecipes = (current.production.shotIntelligence?.packageAssemblyRecipes || [])
    .filter((recipe) => packageShotIds.has(recipe.shotId));
  const previousLookMasterPlans = new Map((current.production.shotIntelligence?.packageLookMasterPlans || []).map((item) => [item.shotId, item]));
  const shotDemandById = new Map(current.library.assets.filter((asset) => asset.shotDemand?.shotId).map((asset) => [asset.shotDemand.shotId, asset.shotDemand]));
  // Recompile the batch against the representatives of the *other* package
  // events. The current event's old topology is not a collision with itself;
  // including it here would make an idempotent apply silently rotate a frozen
  // event on every run.
  const packageLookMasterPlans = decisions.items.filter((item) => item.packageDecision === "PACKAGE").reduce((plans, decision) => {
    const brief = styleBriefByShot.get(decision.shotId);
    const videoContext = videoContextByShot.get(decision.shotId);
    if (!videoContext || videoContext.decisionHash !== decision.decisionHash) throw new Error(`video-packaging-context-stale:${decision.shotId}`);
    const previousOtherTopologies = [...previousLookMasterPlans.values()]
      .filter((item) => item.shotId !== decision.shotId && (item.status === "VISUAL_APPROVED" || item.activeCandidateSet?.selectedDirectionId || item.selectedLookMasterBinding?.directionId))
      .map((item) => representativePackageLookMasterDirection(item))
      .filter(Boolean)
      .map((direction) => topologyFingerprint(direction))
      .filter((fingerprint) => fingerprint && fingerprint !== "|||");
    const researchPacket = researchPackets.find((packet) => packet.shotId === decision.shotId) || null;
    const researchSourceInputs = buildResearchSourceConditioningInputs(researchPacket, {shotId: decision.shotId});
    const plan = buildPackageLookMasterPlan(decision, brief, {
      now,
      previousPlan: previousLookMasterPlans.get(decision.shotId) || null,
      videoContext,
      referenceManifest,
      semanticBrief: previousLookMasterPlans.get(decision.shotId)?.semanticDesignBrief || null,
      researchPacket,
      sourceEvidenceInputs: researchSourceInputs.length
        ? researchSourceInputs
        : buildWebSourceConditioningInputs(webSourcePilotManifest, {shotId: decision.shotId}),
      recentDirectionFingerprints: [...previousLookMasterPlans.values()].filter((item) => item.shotId !== decision.shotId && item.status === "VISUAL_APPROVED").flatMap((item) => (item.candidateDirections || []).map((direction) => direction.fingerprint)),
      recentTopologyFingerprints: previousOtherTopologies,
    });
    plans.push(plan);
    return plans;
  }, []);
  const crossEventTopologyAudit = auditPackageLookMasterTopologyDiversity(packageLookMasterPlans);
  if (crossEventTopologyAudit.status !== "PASS") throw new Error(`package-look-master-cross-event-topology-duplicate:${JSON.stringify(crossEventTopologyAudit.duplicateGroups)}`);
  if (kitPlans.some((kit) => !packageShotIds.has(kit.shotId))) throw new Error("no-package-kit-created");
  const preservedBatch = current.production.shotIntelligence?.wholeFilmBatchRecommendation || {};
  const researchExceptions = researchPackets
    .filter((packet) => packet.networkDecision === "REQUIRED" && packet.status !== "RESEARCH_READY")
    .map((packet) => ({shotId: packet.shotId, code: "REQUIRED_RESEARCH_SOURCE_PACKET_BLOCKED", blockers: packet.researchReadiness?.blockers || []}));
  const targetedExceptions = ["ED-01", "ED-14", "ED-16"].map((shotId) => ({shotId, code: "TARGETED_LOOK_MASTER_REPLACEMENT_REQUIRED", immediateRegenerationAllowed: false}));
  const wholeFilmBatchRecommendation = {
    ...preservedBatch,
    contract: "A1WholeFilmBatchRecommendation/v1",
    status: "PARTIAL_WITH_EXCEPTIONS",
    exceptions: [...(preservedBatch.exceptions || []).filter((item) => ![...targetedExceptions, ...researchExceptions].some((nextItem) => nextItem.shotId === item.shotId && nextItem.code === item.code)), ...targetedExceptions, ...researchExceptions],
    explorationOnly: false,
    recommendation: null,
    selected: null,
    currentAssembly: [],
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    reviewScope: "WHOLE_FILM_STATIC_BOARD",
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    researchPacketAudits: researchPackets.filter((packet) => packet.networkDecision === "REQUIRED").map((packet) => ({shotId: packet.shotId, packetSha256: packet.packetSha256, status: packet.status, readiness: packet.researchReadiness})),
    updatedAt: now,
  };
  const decisionSet = {...decisions, summary: {...decisions.summary, researchPacketCount: researchPackets.length}, sha256: undefined};
  decisionSet.sha256 = crypto.createHash("sha256").update(JSON.stringify({...decisionSet, sha256: undefined})).digest("hex");
  const runtimeWithoutHash = {
    contract: "A1ShotIntelligenceRuntime/v1",
    version: 1,
    projectId: current.production.project.projectId,
    sourceHash,
    status: "LOOK_MASTER_PLANS_READY",
    stateMachine: ["SEMANTIC_STORYBOARD_READY", "CONDITIONAL_RESEARCH_READY", "LOOK_MASTER_PLANS_READY", "LOOK_MASTER_CANDIDATES_READY", "LOOK_MASTER_REVIEW_REQUIRED", "LAYER_RECONSTRUCTION_READY", "LAYER_RECONSTRUCTION_IN_PROGRESS", "ASSEMBLY_PARITY_REVIEW_REQUIRED", "MOTION_READY"],
    decisionSet,
    semanticTimelineRevision: revisionReconciliation.revision,
    videoPackagingContexts: videoContextSet,
    researchPackets,
    // Semantic briefs are the current beat-level routing authority.  Keep
    // them on the rebuilt runtime; dropping them makes the next normal
    // recalculate fall back to legacy editMode and can resurrect a generated
    // package for a beat already covered by real screen evidence.
    semanticDesignBriefSet: current.production.shotIntelligence?.semanticDesignBriefSet || null,
    semanticRouteMap: current.production.shotIntelligence?.semanticRouteMap || null,
    semanticPilot: current.production.shotIntelligence?.semanticPilot || null,
    packageLookMasterPlans,
    crossEventTopologyAudit,
    lookMasterRawReferences: current.production.shotIntelligence?.lookMasterRawReferences || [],
    packageAssetKitPlans: kitPlans,
    packageAssemblyRecipes: assemblyRecipes,
    wholeFilmBatchRecommendation,
    styleBriefAudit,
    trial: {
      conducted: true,
      actualResearchBeatId: researchBeat?.beatId || null,
      actualStyleBeatId: styleBeat?.beatId || null,
      actualModelBeatId: modelBeat?.beatId || null,
      hallucinationOrFalseSourceClaimPresent: hallucinationClaimPresent,
      hallucinationOrFalseSourceNote: hallucinationClaimPresent ? "源文存在对应语义，后续需为该 beat 单独补 primary/official evidence。" : "当前 34 段源文未出现‘幻觉/虚构来源/事实错误’的精确或等价主张，本轮不捏造对应研究任务。",
      actualSourcesRegistered: researchPackets.reduce((sum, packet) => sum + packet.sources.length, 0),
      actualSourcePacketCount: researchPackets.filter((packet) => packet.sources.length).length,
      generatedAssets: false,
      requiredResearchResolved: researchPackets.filter((packet) => packet.networkDecision === "REQUIRED").every((packet) => packet.status === "RESEARCH_READY" && packet.sources.length > 0),
    },
    postApprovalLayerPolicy: {status: "DEFERRED_UNTIL_WHOLE_FILM_STATIC_BOARD_APPROVAL", preApprovalKitCreationForbidden: true, selectedMasterBecomesAssemblyDirectly: true, extractionCandidatesPerRequiredLayer: 1, localVisibleSecondDesignForbidden: true},
    legacyAnchorPolicy: {status: "ADVISORY_ONLY", fixedThreeAnchorGate: false, retainedProofContract: current.production.packagingAnchorProof?.contract || null, reason: "whole-film-static-board-is-current-review-boundary"},
    queuePolicy: {automaticDispatchAllowed: false, workerStatus: "frozen", generationConcurrencyHardMax: 2},
    createdAt: now,
  };
  assertPackageLookMasterRuntime({...runtimeWithoutHash, sha256: "pending"});
  const runtime = {...runtimeWithoutHash, sha256: crypto.createHash("sha256").update(JSON.stringify(runtimeWithoutHash)).digest("hex")};
  const next = structuredClone(current);
  next.production.packagingBeatPlan = {...styleBoundPlan, authorityScope: "DERIVED_FROM_SHOT_VISUAL_COVERAGE_PLAN", businessAuthority: false, productionInput: true, current: false, advisoryOnly: false, supersededBy: current.production.shotVisualCoveragePlan.contract};
  next.production.shotIntelligence = runtime;
  next.production.packagingStyleBriefs = styleBriefs;
  next.production.packagingStyleBriefAudit = styleBriefAudit;
  next.production.retroPixelEditorialDiversityHistory = diversityHistory;
  next.production.generation.automaticDispatchAllowed = false;
  if (next.production.generation.summary.queued === 0 && next.production.generation.summary.running === 0) next.production.generation.workerStatus = "frozen";
  next.production.packagingReview = next.production.packagingReview ? {
    ...next.production.packagingReview,
    authorityScope: "SHOT_LOCAL_HISTORY",
    status: "DEFERRED_TO_WHOLE_FILM_STATIC_ASSEMBLY",
    intermediateApprovalRequired: false,
    requiresExplicitApproval: false,
    userApprovalStatus: "NOT_REQUIRED_BEFORE_FINAL_RELEASE",
    requiresUserFor: ["exception-source-adoption", "exact-copy-anomaly", "recommended-look-master-or-final-assembly", "final-release"],
    finalReleaseApprovalRequired: true,
    advisoryOnly: true,
    current: false,
    legacyStatus: next.production.packagingReview.status || "PENDING_USER_REVIEW",
    legacyStatusReadOnly: true,
    supersededBy: "A1ShotVisualCoveragePlan/v1",
    nextAction: "prepare-whole-film-generation-inputs",
  } : null;
  next.production.packagingAnchorProof = next.production.packagingAnchorProof ? {
    ...next.production.packagingAnchorProof,
    advisoryOnly: true,
    supersededBy: "A1ShotIntelligenceRuntime/v1",
    supersededReason: "per-shot-network-and-package-recipe-review",
  } : next.production.packagingAnchorProof;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const validated = assertEditorialAssetWorkbench(recalculated);
  const event = createProductionEvent({workspace: current, action: "compile-per-shot-shot-intelligence-look-master-and-reconstruction-plans", targetId: runtime.sha256, payload: {decisionContract: "A1ShotIntelligenceDecision/v1", decisionCount: decisions.items.length, researchPacketCount: researchPackets.length, researchTrialSourceCount: researchPackets.reduce((sum, packet) => sum + packet.sources.length, 0), lookMasterPlanCount: packageLookMasterPlans.length, packageKitPlanCount: kitPlans.length, assemblyRecipeCount: assemblyRecipes.length, generatedAssets: false, imagegenPerformed: false, criticPerformed: false, renderPerformed: false}, now});
  validated.production.eventLedger.eventCount += 1;
  validated.production.eventLedger.lastEventId = event.eventId;
  validated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1ShotIntelligenceRuntime/v1", status: "PASS", runtime, packagingPlanSha256: styleBoundPlan.sha256, styleBriefAudit, workspaceSha256: validated.workspaceSha256, sourceHash, generatedAssets: false, imagegenPerformed: false, criticPerformed: false, renderPerformed: false, appliedAt: now};
  persistProjectState(appRoot, validated, {event, files: {"shot-intelligence-v1.json": runtime, "shot-intelligence-v1/report.json": report}});
  console.log(JSON.stringify({status: report.status, workspaceSha256: report.workspaceSha256, runtimeSha256: runtime.sha256, decisionCount: decisions.items.length, network: decisionSet.summary, styleBriefCount: styleBriefs.length, crossEventTopologyAudit: {status: crossEventTopologyAudit.status, representativeCount: crossEventTopologyAudit.representativeCount, uniqueTopologyCount: crossEventTopologyAudit.uniqueTopologyCount, duplicateGroups: crossEventTopologyAudit.duplicateGroups}, lookMasterPlans: packageLookMasterPlans.map((look) => ({shotId: look.shotId, mode: look.assemblyMode, candidateBudget: look.candidateBudget, status: look.status, timelineRange: look.videoContext.timelineRange})), researchPackets: researchPackets.map((packet) => ({shotId: packet.shotId, networkDecision: packet.networkDecision, status: packet.status, sourceCount: packet.sources.length, packetSha256: packet.packetSha256})), packageKitPlans: kitPlans.map((kit) => ({shotId: kit.shotId, assemblyMode: kit.assemblyMode, planSha256: kit.planSha256, routes: kit.layers.map((layer) => `${layer.kind}:${layer.route}`)})), queue: validated.production.generation.summary, worker: validated.production.generation.workerStatus, nextAction: validated.production.authority.nextAction}, null, 2));
});
