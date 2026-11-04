#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {applySemanticTimelineToDecisionSet} from "../apps/studio-next/src/lib/a1-semantic-timeline-decision-v1.mjs";
import {assertShotSemanticDesignBrief, rehashShotSemanticDesignBrief} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";
import {buildVideoPackagingContext, buildVideoPackagingContextSet} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {assertRetroPixelEditorialStyleBrief, compileRetroPixelEditorialStyleBrief, rehashRetroPixelEditorialStyleBrief} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {assertPackageLookMasterPlan, buildPackageLookMasterPlan, buildResearchSourceConditioningInputs, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {assertShotResearchPacket} from "../apps/studio-next/src/lib/a1-shot-research-packet-v1.mjs";
import {hashResearchPacket, researchPacketReadiness} from "../apps/studio-next/src/lib/a1-research-claim-policy-v1.mjs";
import {buildCandidateRecommendationAuditAuthority, hashCandidateAuditMigration} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {compileWholeFilmGenerationReadiness, finalizeWholeFilmLookMasterBatch} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {compileShotVisualCoveragePlan, compileVisualProductionRun} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("research-mode-candidate-authority-expected-workspace-sha-required");

const now = new Date().toISOString();
const commitId = `research-mode-candidate-authority-${now.replace(/[:.]/gu, "-")}`;
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const jsonFileSha256 = (value) => sha256(`${JSON.stringify(value, null, 2)}\n`);
const packageTypeForMode = (mode) => mode ? `${mode}_PACKAGE` : "NO_PACKAGE";

const ED14_ORIGINAL = "后来我查了一下关于 AI 写作的研究。 大体的意思是， 模型在生成文字时， 会优先走常见、稳妥、 可复用的表达方式。";
const ED14_NARROWED = "后来我查了一下关于 AI 写作的研究。大体的意思是，在这项英文新闻样本里，较新的 instruction-tuned 模型呈现出更低的句法多样性，词汇多样性下降尤其明显，表达范围可能变窄。";
const ED14_JOB = "把已核验论文的样本范围和观察结论放在同一画面：较新的 instruction-tuned LLM 在英文新闻样本中呈现更低的句法、尤其词汇多样性，表达范围可能收窄。";
const ED14_TAKEAWAY = "这项研究支持的是特定英文新闻样本里的表达多样性下降线索，不是‘模型必然优先选择稳妥表达’的完整因果结论。";
const ED14_QUESTION = "这项研究到底观察到了什么，又没有证明什么？";
const ED14_BOUNDARY = {
  contract: "A1ResearchClaimBoundary/v1",
  status: "BOUND",
  supportedScope: "较新的 instruction-tuned LLM 在英文新闻样本中呈现更低的句法多样性，词汇多样性下降尤其明显；这提示表达范围可能变窄。",
  prohibitedExpansions: [
    "优先走常见、稳妥、可复用",
    "优先选择低风险、可复用表达",
    "高频、安全、可复用",
    "默认路径",
    "低风险路径",
    "可复用路径",
  ],
};
const ED14_SOURCE_ARTIFACT = {
  kind: "OFFICIAL_ACL_PAPER_TITLE_ABSTRACT_PAGE",
  publicUrl: "/generated/system-line/web-source-packaging-pilot-v1/sources/acl-2026-acl-long-1803-title-abstract.png",
  sha256: "747566071afd35f7265a4b30d4f08607132c0c7650769617e62abf7edffd7a46",
  role: "REAL_SOURCE",
  sourceKind: "OFFICIAL_RESEARCH_TITLE_ABSTRACT_CAPTURE",
  productionReady: true,
};
const PRESERVED_PASS_ARTIFACTS = new Map(Object.entries({
  "ED-09": "2e7d5bec2653c5d16f1a35e5fc0b85c3f17a3391eaef31f8f1c8e39fdc58d006",
  "ED-10": "4ffd636d05a60503edcaa9a6a605898aefbf73974521f6a6f141963b7a370e9f",
  "ED-12": "945e4c24324ffb9b639835250e5c66799958c0116b5e2dbe22d143e38326ffa8",
  "ED-15": "ebfa8ebed05a78e764ad7ca08aacee6e08bf63705655cdaa3d7443ed33f519b2",
  "ED-16": "ba87af779229656f7da9678b12bc69d22a4e431c1a354e90b884dd12a8604b28",
  "ED-17": "9a9e2d3b705af0823faa299838e2ce61ea72bb102d3872fbb509284af171d91d",
  "ED-19": "5851509a0ea13f09d8a3f2ce67fd68225d0432aeb83a3d8266ab6595ed7f556b",
  "ED-20": "a4306e1f826659256a8023d8df4cd77feb0697bf6b024bda58be1991a8412410",
  "ED-33": "398bcf3f06865828e148b3b15897994ce6240e1c1c39f427ea32d45bc7ca1122",
}));
const MODE_REBIND_SHOT_IDS = new Set(["ED-09", "ED-17", "ED-19"]);

function updateEd14DirectorShot(shot) {
  return {
    ...shot,
    sourceTextOriginal: shot.sourceTextOriginal || shot.sourceText,
    sourceText: ED14_NARROWED,
    narrativeJob: ED14_JOB,
    viewerTakeaway: ED14_TAKEAWAY,
    viewerQuestion: ED14_QUESTION,
    mediumDecisionReason: "这段需要把一手论文的样本范围、观察结果和事实边界同时讲清；真实论文标题/摘要页是主证据，视觉隐喻只能辅助。",
    packageBrief: "以已核验的 ACL 2026 标题/摘要页作为主视觉证据；只解释英文新闻样本中句法、尤其词汇多样性降低与表达范围可能变窄。不得画成‘模型主动选择稳妥默认答案’的因果机制。",
    transitionOut: "论文证据与‘表达多样性变窄’结论停住，再进入下一镜关于个人偏好与写作方向的独立论证。",
    requiredMaterialIds: ["acl-2026-title-abstract-verified-source", "expression-diversity-range-visual-metaphor"],
    materialGate: "READY",
    missingMaterialIds: [],
    visualJob: "让观众一眼区分论文实际观察到的多样性下降，与论文没有证明的默认/低风险表达因果链。",
    primaryActor: "真实 ACL 论文标题/摘要页与被标注的句法、词汇多样性范围",
    topology: "verified-source-plus-bounded-diversity-range",
    typographyRole: "只承担样本范围、句法多样性、词汇多样性与‘可能变窄’；禁止新增研究结论。",
    keyPhrases: ["英文新闻样本", "句法多样性降低", "词汇多样性下降尤其明显", "表达范围可能变窄"],
    layoutConstraints: [
      "真实 ACL 标题/摘要页必须作为可识别证据锚点，不得伪造论文、作者、年份、图表或数字。",
      "视觉关系只能表示多样性范围变窄，不得出现 DEFAULT PATH、低风险路径、稳妥表达或可复用路径。",
      "样本范围和不支持的因果扩展必须在 brief 与审计中可追溯。",
    ],
    motionPhrase: "真实论文证据先成立，句法与词汇多样性的可视范围随后收窄；画面停在‘可能变窄’，不继续推导默认选择机制。",
    handoffActor: "被明确限定样本范围的‘表达多样性变窄’结论",
    structureDirections: [
      "论文标题/摘要页作为一侧主证据，另一侧只显示多样性范围由宽到窄。",
      "把句法与词汇两类观察绑定到同一来源，不使用流水线、默认轨道或安全路径。",
    ],
    semanticSourceCorrection: {contract: "A1SemanticSourceCorrection/v1", status: "APPLIED", sourceTextOriginal: ED14_ORIGINAL, boundedClaim: ED14_BOUNDARY.supportedScope},
  };
}

function updatePackagingBeatPlan(plan, decisionSet) {
  const decisions = new Map(decisionSet.items.map((item) => [item.shotId, item]));
  const updateItem = (item) => {
    const shotId = item.beatId || item.shotId;
    const decision = decisions.get(shotId);
    if (!decision) return item;
    const ed14 = shotId === "ED-14";
    const selected = decision.packageDecision === "PACKAGE";
    return {
      ...item,
      ...(ed14 ? {
        sourceText: ED14_NARROWED,
        sourceTextOriginal: item.sourceTextOriginal || item.sourceText,
        evidenceRoute: "REAL_SOURCE",
        narrativeJob: ED14_JOB,
        visualJob: ED14_JOB,
        visualContext: "真实 ACL 标题/摘要页是主证据；视觉只表达英文新闻样本中的句法、尤其词汇多样性下降与表达范围可能变窄。",
        viewerTakeaway: ED14_TAKEAWAY,
        viewerQuestion: ED14_QUESTION,
        packageBrief: "真实来源 + 有边界的多样性范围收窄；禁止默认/低风险/稳妥/可复用路径。",
        claimBoundary: ED14_BOUNDARY,
      } : {}),
      networkDecision: decision.networkDecision,
      networkReason: decision.networkReason,
      claimType: decision.claimType,
      packageDecision: decision.packageDecision,
      packageReason: decision.packageReason,
      assemblyMode: selected ? decision.assemblyMode : null,
      presentationMode: selected ? decision.presentationMode : null,
      modeBinding: selected ? decision.modeBinding || null : null,
      assemblyModeReason: selected ? decision.assemblyModeReason : null,
      whyThisModeBeatsOtherModes: selected ? decision.whyThisModeBeatsOtherModes : null,
      presentationModeReason: selected ? decision.presentationModeReason : null,
      whyPresentationModeBeatsOtherModes: selected ? decision.whyPresentationModeBeatsOtherModes : null,
      decisionHash: decision.decisionHash,
      itemType: selected ? packageTypeForMode(decision.assemblyMode) : "NO_PACKAGE",
      packagingType: selected ? packageTypeForMode(decision.assemblyMode) : "NO_PACKAGE",
      packageModeDecision: decision.sequenceReview?.packageModeDecision || null,
      eventGrouping: decision.sequenceReview?.eventGrouping || null,
      sequenceReview: decision.sequenceReview || null,
      selectionStatus: selected ? "selected" : "incompatible-packaging",
      generationAllowed: selected,
    };
  };
  const semanticBeats = (plan.semanticBeats || []).map(updateItem);
  const items = (plan.items || plan.semanticBeats || []).map(updateItem);
  const oldEvents = new Map((plan.packagingEvents || []).map((event) => [event.sourceBeatIds?.[0], event]));
  const packagingEvents = semanticBeats.filter((item) => item.packageDecision === "PACKAGE").map((item) => ({
    ...(oldEvents.get(item.beatId || item.shotId) || {}),
    eventId: item.packagingEventId || oldEvents.get(item.beatId || item.shotId)?.eventId || `packaging-event-${item.beatId || item.shotId}`,
    sourceBeatIds: [item.beatId || item.shotId],
    sourceText: item.sourceText,
    semanticRole: item.semanticRole,
    packagingType: item.packagingType,
    assemblyMode: item.assemblyMode,
    presentationMode: item.presentationMode,
    modeBinding: item.modeBinding || null,
    contentSha256: sha256({sourceText: item.sourceText, decisionHash: item.decisionHash, assemblyMode: item.assemblyMode, presentationMode: item.presentationMode}),
    generationAllowed: true,
  }));
  const currentEventIds = new Set(packagingEvents.map((event) => event.eventId));
  const anchorSampling = {
    ...(plan.anchorSampling || {}),
    selectedEventIds: (plan.anchorSampling?.selectedEventIds || []).filter((eventId) => currentEventIds.has(eventId)),
  };
  const packagingTypes = packagingEvents.reduce((counts, event) => ({...counts, [event.packagingType]: (counts[event.packagingType] || 0) + 1}), {});
  const withoutHash = {
    ...plan,
    semanticBeats,
    items,
    packagingEvents,
    anchorSampling,
    packagingEventCount: packagingEvents.length,
    noPackageCount: semanticBeats.length - packagingEvents.length,
    noPackageMajority: semanticBeats.length - packagingEvents.length > semanticBeats.length / 2,
    summary: {...(plan.summary || {}), semanticBeatCount: semanticBeats.length, packagingEventCount: packagingEvents.length, noPackageCount: semanticBeats.length - packagingEvents.length, packagingTypes},
    generatedAt: now,
    sha256: undefined,
  };
  return {...withoutHash, sha256: sha256(withoutHash)};
}

function updatedBrief(base, decision) {
  const ed14 = decision.shotId === "ED-14";
  const sourceBinding = {...ED14_SOURCE_ARTIFACT, actualSha256: ED14_SOURCE_ARTIFACT.sha256};
  const next = {
    ...structuredClone(base),
    decisionHash: decision.decisionHash,
    semanticTimeline: decision.sequenceReview,
    semanticTimelineHash: decision.sequenceReview?.rewriteSourceHash || null,
    rewriteSourceHash: decision.sequenceReview?.rewriteSourceHash || null,
    presentation: {type: decision.presentationMode, reason: decision.presentationModeReason || decision.packageReason},
    generatedAt: now,
    ...(ed14 ? {
      exactCopy: ED14_NARROWED,
      sourceTextOriginal: base.sourceTextOriginal || base.exactCopy,
      context: {...base.context, currentSummary: ED14_NARROWED},
      narrativeJob: ED14_JOB,
      viewerTakeaway: ED14_TAKEAWAY,
      viewerQuestion: ED14_QUESTION,
      semanticActor: {
        identity: "已核验 ACL 论文中的英文新闻样本与两代 LLM 输出",
        action: "比较句法与词汇多样性，并把观察范围限制在论文实际样本",
        beforeState: "不同来源文本的表达多样性等待比较",
        afterState: "较新 instruction-tuned 模型呈现更低句法、尤其词汇多样性",
        target: "论文支持的表达范围可能变窄这一有限结论",
      },
      evidenceRoute: "REAL_SOURCE",
      claimType: "research_claim",
      claimBoundary: ED14_BOUNDARY,
      requiredMaterials: [{id: "acl-2026-title-abstract-verified-source", required: true, bindingRequired: true, productionReady: true, bindings: [sourceBinding]}],
      productionSourceBindings: [sourceBinding, ...(base.productionSourceBindings || []).filter((item) => item.role === "BASE_VIDEO_HOLD_FRAME")],
      forbiddenGenericSubstitutions: [...new Set([...(base.forbiddenGenericSubstitutions || []), "default path", "safe reusable path", "generic convergence pipeline", "invented research conclusion"])],
      directorSourceBinding: {...base.directorSourceBinding, status: "SEMANTIC_SOURCE_CORRECTION_BOUND", generatedSourceTextHash: sha256(ED14_NARROWED)},
    } : {}),
  };
  return assertShotSemanticDesignBrief(rehashShotSemanticDesignBrief(next));
}

function updateBriefSet(runtime, decisionsByShot) {
  const targetIds = new Set(["ED-09", "ED-14", "ED-17", "ED-19"]);
  const currentPlans = new Map(runtime.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
  const sourceBriefs = new Map(runtime.semanticDesignBriefSet.briefs.map((brief) => [brief.shotId, brief]));
  const briefs = runtime.semanticDesignBriefSet.briefs.map((brief) => targetIds.has(brief.shotId)
    ? updatedBrief(currentPlans.get(brief.shotId)?.semanticDesignBrief || sourceBriefs.get(brief.shotId), decisionsByShot.get(brief.shotId))
    : brief);
  const briefByShot = new Map(briefs.map((brief) => [brief.shotId, brief]));
  const routeMap = runtime.semanticDesignBriefSet.routeMap.map((route) => targetIds.has(route.shotId)
    ? {...route, packageDecision: decisionsByShot.get(route.shotId).packageDecision, evidenceRoute: briefByShot.get(route.shotId).evidenceRoute, presentationType: decisionsByShot.get(route.shotId).presentationMode}
    : route);
  const next = {...runtime.semanticDesignBriefSet, briefs, routeMap, generatedAt: now, briefSetSha256: undefined};
  next.briefSetSha256 = sha256({...next, briefSetSha256: undefined, generatedAt: undefined});
  runtime.semanticDesignBriefSet = next;
  runtime.semanticRouteMap = {...runtime.semanticRouteMap, routeMap, routeMapSha256: next.briefSetSha256, semanticTimelineHash: runtime.decisionSet.semanticTimelineHash, rewriteRevisionHash: runtime.decisionSet.sourceRevisionHash, generatedAt: now};
  return briefByShot;
}

function updateResearchPacket(runtime, decision) {
  const packet = runtime.researchPackets.find((item) => item.shotId === "ED-14");
  if (!packet) throw new Error("ed14-research-packet-missing");
  packet.sourceText = ED14_NARROWED;
  packet.sourceTextOriginal = packet.sourceTextOriginal || ED14_ORIGINAL;
  packet.decisionHash = decision.decisionHash;
  packet.claimBoundary = structuredClone(ED14_BOUNDARY);
  packet.searchQueries = [
    "ACL 2026 More Aligned Less Diverse grammar lexicon instruction-tuned LLM English news diversity",
    "site:aclanthology.org/2026.acl-long.1803 lexical syntactic diversity abstract",
  ];
  packet.sources = packet.sources.map((source) => ({...source, claimBoundary: structuredClone(ED14_BOUNDARY)}));
  packet.researchReadiness = researchPacketReadiness(packet, {claimType: packet.claimType, sourceText: packet.sourceText});
  packet.status = packet.researchReadiness.status === "READY" ? "RESEARCH_READY" : "RESEARCH_PARTIAL";
  packet.generatedAt = now;
  packet.packetSha256 = hashResearchPacket(packet);
  return assertShotResearchPacket(packet);
}

function updateContexts(runtime, decisionsByShot) {
  const targetIds = new Set(["ED-09", "ED-14", "ED-17", "ED-19"]);
  const contexts = runtime.videoPackagingContexts.items.map((context) => {
    if (!targetIds.has(context.shotId)) return context;
    const decision = decisionsByShot.get(context.shotId);
    return buildVideoPackagingContext({
      decision,
      demand: {editWindow: context.timelineRange},
      holdFrame: context.baseFrame,
      subjectBounds: context.subjectBounds,
      safeZones: context.safeZones,
      visualAnchors: context.visualAnchors,
      createdAt: now,
    });
  });
  const history = [...(runtime.videoPackagingContextHistory || [])];
  for (const item of runtime.videoPackagingContexts.items.filter((entry) => targetIds.has(entry.shotId))) {
    if (!history.some((entry) => entry.contextSha256 === item.contextSha256)) history.push({...item, status: "HISTORY_READ_ONLY", current: false});
  }
  runtime.videoPackagingContextHistory = history;
  runtime.videoPackagingContexts = buildVideoPackagingContextSet(contexts, {createdAt: now});
  return new Map(contexts.map((context) => [context.shotId, context]));
}

function updateStyles(next, runtime, briefByShot, contextByShot) {
  const targetIds = new Set(["ED-09", "ED-14", "ED-17", "ED-19"]);
  const eventByShot = new Map(next.production.packagingBeatPlan.packagingEvents.map((event) => [event.sourceBeatIds?.[0], event]));
  const styles = next.production.packagingStyleBriefs.map((style) => {
    const shotId = style.sourceBeatIds?.[0];
    if (!targetIds.has(shotId)) return style;
    const updated = shotId === "ED-14"
      ? compileRetroPixelEditorialStyleBrief({event: eventByShot.get(shotId), appRoot, videoContext: contextByShot.get(shotId), semanticBrief: briefByShot.get(shotId), now})
      : rehashRetroPixelEditorialStyleBrief({
      ...style,
      contentSha256: sha256({sourceText: eventByShot.get(shotId)?.sourceText || "", semanticBriefSha256: briefByShot.get(shotId).briefSha256, assemblyMode: eventByShot.get(shotId)?.assemblyMode, presentationMode: eventByShot.get(shotId)?.presentationMode}),
      semanticJob: briefByShot.get(shotId).narrativeJob,
      semanticBriefSha256: briefByShot.get(shotId).briefSha256,
      derivation: {...style.derivation, semanticActionId: briefByShot.get(shotId).briefSha256, videoContextSha256: contextByShot.get(shotId).contextSha256},
      generatedAt: now,
    });
    assertRetroPixelEditorialStyleBrief(updated, {appRoot});
    return updated;
  });
  next.production.packagingStyleBriefs = styles;
  return new Map(styles.flatMap((style) => (style.sourceBeatIds || []).map((shotId) => [shotId, style])));
}

function updatePlans(next, runtime, decisionsByShot, briefByShot, contextByShot, styleByShot, packet) {
  const referenceManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
  const targetIds = new Set(["ED-09", "ED-14", "ED-17", "ED-19"]);
  const planHistory = [...(runtime.packageLookMasterPlanHistory || [])];
  for (const plan of runtime.packageLookMasterPlans.filter((item) => targetIds.has(item.shotId))) {
    if (!planHistory.some((item) => item.planSha256 === plan.planSha256)) planHistory.push({...structuredClone(plan), status: "HISTORY_READ_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY", supersededAt: now});
  }
  runtime.packageLookMasterPlanHistory = planHistory;
  runtime.packageLookMasterPlans = runtime.packageLookMasterPlans.map((sourcePlan) => {
    if (!targetIds.has(sourcePlan.shotId)) return sourcePlan;
    const decision = decisionsByShot.get(sourcePlan.shotId);
    const brief = briefByShot.get(sourcePlan.shotId);
    const context = contextByShot.get(sourcePlan.shotId);
    const style = styleByShot.get(sourcePlan.shotId);
    if (sourcePlan.shotId === "ED-14") return assertPackageLookMasterPlan(buildPackageLookMasterPlan(decision, style, {now, videoContext: context, semanticBrief: brief, referenceManifest, researchPacket: packet, sourceEvidenceInputs: buildResearchSourceConditioningInputs(packet, {shotId: "ED-14"})}));
    const plan = structuredClone(sourcePlan);
    plan.decisionHash = decision.decisionHash;
    plan.semanticDesignBrief = structuredClone(brief);
    plan.semanticDesignBriefSha256 = brief.briefSha256;
    plan.semanticJob = brief.narrativeJob;
    plan.viewerTakeaway = brief.viewerTakeaway;
    plan.viewerQuestion = brief.viewerQuestion;
    plan.assemblyMode = decision.assemblyMode;
    plan.assemblyModeReason = decision.assemblyModeReason;
    plan.whyThisModeBeatsOtherModes = decision.whyThisModeBeatsOtherModes;
    plan.presentationMode = decision.presentationMode;
    plan.presentationModeReason = decision.presentationModeReason;
    plan.whyPresentationModeBeatsOtherModes = decision.whyPresentationModeBeatsOtherModes;
    plan.modeBinding = structuredClone(decision.modeBinding || null);
    plan.videoContext = structuredClone(context);
    plan.styleBriefSha256 = style.styleBriefSha256;
    plan.styleBinding = {...plan.styleBinding, styleBriefSha256: style.styleBriefSha256, fingerprint: style.fingerprint, primaryFamily: style.variation.primaryFamily, simplicityPolicy: structuredClone(style.simplicityPolicy), aestheticApplication: structuredClone(style.aestheticApplication), aestheticRoute: style.derivation.aestheticRoute};
    plan.referenceBindingAudit = {...plan.referenceBindingAudit, styleBriefSha256: style.styleBriefSha256, fingerprint: style.fingerprint};
    delete plan.wholeFilmBoardRecommendation;
    delete plan.provisionalWholeFilmBoardSelection;
    plan.status = "LOOK_MASTER_CANDIDATES_READY";
    plan.planSha256 = sha256(planIdentity(plan));
    return assertPackageLookMasterPlan(plan);
  });
  return new Map(runtime.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
}

function migratePreservedPassArtifacts(next, runtime, planByShot, decisionsByShot) {
  const records = [];
  for (const raw of runtime.lookMasterRawReferences || []) {
    raw.selectionEligible = false;
    raw.recommendationEligible = false;
    raw.current = false;
    delete raw.candidateAuditAuthority;
  }
  for (const [shotId, artifactSha256] of PRESERVED_PASS_ARTIFACTS) {
    const raw = runtime.lookMasterRawReferences.find((item) => item.shotId === shotId && item.artifact?.sha256 === artifactSha256);
    const plan = planByShot.get(shotId);
    const decision = decisionsByShot.get(shotId);
    if (!raw || !plan || !decision) throw new Error(`preserved-pass-binding-missing:${shotId}`);
    if (raw.pixelAudit?.status !== "PASS" || raw.pixelAudit?.admissionAllowed !== true || raw.pixelAudit?.footageCompatibility?.status !== "PASS" || raw.semanticPixelAudit?.status !== "PASS" || raw.semanticPixelAudit?.recommendationEligible !== true) throw new Error(`preserved-pass-hard-gate-failed:${shotId}`);
    const direct = raw.pixelAudit.planSha256 === plan.planSha256
      && raw.pixelAudit.styleBriefSha256 === plan.styleBriefSha256
      && raw.semanticPixelAudit.briefSha256 === plan.semanticDesignBriefSha256;
    if (!direct) {
      const prompt = String(raw.artifact?.prompt || "");
      const compatibilityChecks = {
        artifactShaUnchanged: raw.artifact.sha256 === artifactSha256,
        pixelAuditPass: raw.pixelAudit.status === "PASS" && raw.pixelAudit.admissionAllowed === true,
        footageCompatibilityPass: raw.pixelAudit.footageCompatibility.status === "PASS",
        semanticPixelAuditPass: raw.semanticPixelAudit.status === "PASS" && raw.semanticPixelAudit.recommendationEligible === true,
        previousCompatibilityPass: raw.rebindCompatibility?.status === "PASS" || raw.semanticPixelAudit.briefSha256 === plan.semanticDesignBriefSha256,
        exactCopyCompatible: raw.rebindCompatibility?.status === "PASS" || prompt.includes(plan.exactCopy.text),
        semanticActorActionCompatible: raw.rebindCompatibility?.status === "PASS" || (prompt.includes(plan.semanticDesignBrief.semanticActor.identity) && prompt.includes(plan.semanticDesignBrief.semanticActor.action)),
        presentationModeUnchanged: prompt.includes(`PRESENTATION: ${plan.presentationMode}`) || prompt.includes(`Presentation ${plan.presentationMode}`),
      };
      if (Object.values(compatibilityChecks).some((value) => value !== true)) throw new Error(`preserved-pass-migration-incompatible:${shotId}:${JSON.stringify(compatibilityChecks)}`);
      raw.candidateAuditMigration = {
        contract: "A1CandidateAuditMigration/v1",
        status: "PASS",
        artifactSha256,
        sourcePlanSha256: raw.pixelAudit.planSha256,
        sourcePixelAuditSha256: raw.pixelAudit.auditSha256,
        sourceSemanticAuditSha256: raw.semanticPixelAudit.auditSha256,
        sourceBriefSha256: raw.semanticPixelAudit.briefSha256,
        targetPlanSha256: plan.planSha256,
        targetBriefSha256: plan.semanticDesignBriefSha256,
        targetDecisionHash: plan.decisionHash,
        targetAssemblyMode: plan.assemblyMode,
        targetPresentationMode: plan.presentationMode,
        compatibility: {status: "PASS", checks: compatibilityChecks},
        createdAt: now,
      };
      raw.candidateAuditMigration.migrationSha256 = hashCandidateAuditMigration(raw.candidateAuditMigration);
    } else {
      delete raw.candidateAuditMigration;
    }
    const previousPlanSha256 = raw.planSha256;
    raw.planSha256 = plan.planSha256;
    raw.styleBriefSha256 = plan.styleBriefSha256;
    raw.current = true;
    const authority = buildCandidateRecommendationAuditAuthority({rawReference: raw, plan, decision, now});
    if (authority.status !== "PASS") throw new Error(`preserved-pass-candidate-authority-failed:${shotId}:${authority.failures.join(",")}`);
    raw.candidateAuditAuthority = authority;
    raw.selectionEligible = true;
    raw.recommendationEligible = true;
    raw.status = "CANDIDATE_AUDIT_AUTHORITY_PASS_NOT_SELECTED";
    for (const job of next.production.generation.jobs || []) {
      if (job.targetKind === "package-look-master" && job.status === "complete" && job.output?.sha256 === artifactSha256) {
        job.lookMasterPlanSha256 = plan.planSha256;
        job.styleBriefSha256 = plan.styleBriefSha256;
        job.reconciliation = {contract: "A1CandidateAuditMigration/v1", status: "PASS", artifactSha256, previousLookMasterPlanSha256: previousPlanSha256, currentLookMasterPlanSha256: plan.planSha256, candidateAuditAuthoritySha256: authority.authoritySha256};
      }
    }
    records.push({shotId, artifactSha256, previousPlanSha256, currentPlanSha256: plan.planSha256, candidateAuditAuthoritySha256: authority.authoritySha256, bindingMode: authority.bindingMode});
  }
  for (const raw of runtime.lookMasterRawReferences || []) {
    const plan = planByShot.get(raw.shotId);
    const decision = decisionsByShot.get(raw.shotId);
    if (!plan || !decision || (raw.planSha256 !== plan.planSha256 && raw.candidateAuditMigration?.targetPlanSha256 !== plan.planSha256)) continue;
    const authority = buildCandidateRecommendationAuditAuthority({rawReference: raw, plan, decision, now});
    raw.candidateAuditAuthority = authority;
    raw.selectionEligible = authority.status === "PASS";
    raw.recommendationEligible = authority.status === "PASS";
    raw.current = authority.status === "PASS";
    if (authority.status !== "PASS") raw.status = "CANDIDATE_AUDIT_AUTHORITY_BLOCKED";
  }
  for (const raw of runtime.lookMasterRawReferences.filter((item) => item.shotId === "ED-14")) {
    raw.status = "CLAIM_BOUNDARY_SUPERSEDED_EXPLORATION_ONLY";
    raw.current = false;
    raw.selectionEligible = false;
    raw.recommendationEligible = false;
    raw.claimBoundaryDisposition = {status: "FAIL", reason: "existing pixels visualize default/safe/reusable convergence beyond the verified ACL claim", currentClaimBoundary: ED14_BOUNDARY};
  }
  return records;
}

function updateDirectorInput(next) {
  const directorFile = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/whole-film-director-input.json");
  const director = JSON.parse(fs.readFileSync(directorFile, "utf8"));
  director.plan.shots = director.plan.shots.map((shot) => shot.shotId === "ED-14" ? updateEd14DirectorShot(shot) : shot);
  director.semanticSourceCorrections = [...(director.semanticSourceCorrections || []).filter((item) => item.correctionId !== "ED-14-research-claim-boundary-v1"), {contract: "A1SemanticSourceCorrection/v1", correctionId: "ED-14-research-claim-boundary-v1", status: "APPLIED", shotId: "ED-14", sourceTextOriginal: ED14_ORIGINAL, sourceText: ED14_NARROWED, rawSourcePreserved: true, claimBoundary: ED14_BOUNDARY}];
  const fileSha256 = jsonFileSha256(director);
  next.directorInput.sha256 = fileSha256;
  next.article.sourceReportSha256 = fileSha256;
  next.article.semanticSourceCorrections = [...(next.article.semanticSourceCorrections || []).filter((item) => item.correctionId !== "ED-14-research-claim-boundary-v1"), {contract: "A1SemanticSourceCorrection/v1", correctionId: "ED-14-research-claim-boundary-v1", status: "APPLIED", shotId: "ED-14", sourceTextOriginal: ED14_ORIGINAL, sourceText: ED14_NARROWED, rawSourcePreserved: true, derivedLayer: "director-storyboard-semantic-packaging", claimBoundary: ED14_BOUNDARY}];
  return director;
}

function updateEd14LibraryDemand(next) {
  const asset = next.library.assets.find((item) => item.shotDemand?.shotId === "ED-14");
  if (!asset) throw new Error("ed14-library-demand-missing");
  const corrected = updateEd14DirectorShot(asset.shotDemand);
  asset.shotDemand = corrected;
  asset.name = "镜头 14 · ACL 研究中的表达多样性变窄";
  asset.purpose = ED14_JOB;
  asset.promptBrief = "真实 ACL 标题/摘要页承担证据；只包装英文新闻样本中句法、尤其词汇多样性降低与表达范围可能变窄。禁止 DEFAULT PATH、稳妥/低风险/可复用表达因果扩展。";
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("reconciliation-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("reconciliation-assembly-must-remain-empty");
  const beforeArtifactShas = (current.production.shotIntelligence.lookMasterRawReferences || []).map((raw) => raw.artifact?.sha256).filter(Boolean).sort();
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const directorInput = updateDirectorInput(next);
  updateEd14LibraryDemand(next);
  next.production.factCorrectionLedger = {
    ...(next.production.factCorrectionLedger || {contract: "A1ProductionFactCorrectionLedger/v1", corrections: []}),
    updatedAt: now,
    corrections: [...(next.production.factCorrectionLedger?.corrections || []).filter((item) => item.correctionId !== "ED-14-research-claim-boundary-v1"), {correctionId: "ED-14-research-claim-boundary-v1", shotId: "ED-14", preservedRawSource: true, invalidatedDependencies: ["ED-14 existing Look Masters", "ED-14 candidate audits", "ED-14 old semantic brief"], preservedDependencies: ["verified ACL source artifact", "all non-ED-14 artifact SHA", "queue and downstream locks"]}],
  };

  const beat = next.production.packagingBeatPlan.semanticBeats.find((item) => item.beatId === "ED-14");
  if (!beat) throw new Error("ed14-packaging-beat-missing");
  Object.assign(beat, {sourceTextOriginal: beat.sourceTextOriginal || beat.sourceText, sourceText: ED14_NARROWED, evidenceRoute: "REAL_SOURCE", narrativeJob: ED14_JOB, visualJob: ED14_JOB, visualContext: "真实 ACL 标题/摘要页 + 有边界的句法/词汇多样性范围收窄", viewerTakeaway: ED14_TAKEAWAY, viewerQuestion: ED14_QUESTION, claimBoundary: ED14_BOUNDARY});
  const initialDecision = runtime.decisionSet.items.find((item) => item.shotId === "ED-14");
  if (!initialDecision) throw new Error("ed14-decision-missing");
  Object.assign(initialDecision, {
    sourceTextOriginal: initialDecision.sourceTextOriginal || initialDecision.sourceText,
    sourceText: ED14_NARROWED,
    semanticJob: ED14_JOB,
    viewerTakeaway: ED14_TAKEAWAY,
    viewerQuestion: ED14_QUESTION,
    evidenceRoute: "REAL_SOURCE",
    claimBoundary: ED14_BOUNDARY,
    packageReason: "该镜必须把真实论文、样本范围和有限结论同时呈现，避免口播把相关性扩展成未经支持的完整因果链。",
    assemblyModeReason: "真实来源、样本范围和多样性变化需要同时可见，EXPLAINER 才能保留事实边界。",
    whyThisModeBeatsOtherModes: "相较纯隐喻或字卡，解释型结构能让论文证据与有限结论保持一一对应。",
    networkDecision: "REQUIRED",
    networkReason: "研究证据语言确定性路由 REQUIRED；只有一手来源包、reference-use proof 和 claim boundary 全部就绪后才能生成或推荐。",
  });
  const timelineBeats = next.production.packagingBeatPlan.semanticBeats;
  runtime.decisionSet = applySemanticTimelineToDecisionSet(runtime.decisionSet, {beats: timelineBeats, sourceHash: next.article.sourceTextSha256, now});
  next.production.packagingBeatPlan = updatePackagingBeatPlan(next.production.packagingBeatPlan, runtime.decisionSet);
  runtime.decisionSet = applySemanticTimelineToDecisionSet(runtime.decisionSet, {beats: next.production.packagingBeatPlan.semanticBeats, sourceHash: next.article.sourceTextSha256, now});
  const decisionsByShot = new Map(runtime.decisionSet.items.map((item) => [item.shotId, item]));
  const ed01 = decisionsByShot.get("ED-01");
  assert.equal(ed01.packageDecision, "NO_PACKAGE");
  assert.equal(ed01.sequenceReview?.packageSuppressedReason, null);
  assert.equal(ed01.sequenceReview?.claimAssociation?.candidateRecall, true);
  next.production.packagingBeatPlan = updatePackagingBeatPlan(next.production.packagingBeatPlan, runtime.decisionSet);
  const briefByShot = updateBriefSet(runtime, decisionsByShot);
  const packet = updateResearchPacket(runtime, decisionsByShot.get("ED-14"));
  const contextByShot = updateContexts(runtime, decisionsByShot);
  const styleByShot = updateStyles(next, runtime, briefByShot, contextByShot);
  for (const beatItem of next.production.packagingBeatPlan.semanticBeats) {
    const style = styleByShot.get(beatItem.beatId);
    if (style) beatItem.styleBriefSha256 = style.styleBriefSha256;
  }
  next.production.packagingBeatPlan = updatePackagingBeatPlan(next.production.packagingBeatPlan, runtime.decisionSet);
  const planByShot = updatePlans(next, runtime, decisionsByShot, briefByShot, contextByShot, styleByShot, packet);
  const preservedPassRecords = migratePreservedPassArtifacts(next, runtime, planByShot, decisionsByShot);

  runtime.currentAssembly = [];
  for (const plan of runtime.packageLookMasterPlans) {
    delete plan.wholeFilmBoardRecommendation;
    delete plan.provisionalWholeFilmBoardSelection;
  }
  next.production.shotVisualCoveragePlan = compileShotVisualCoveragePlan(next, next.production.filmArtDirection, {now});
  const finalized = finalizeWholeFilmLookMasterBatch(next, next.production.shotVisualCoveragePlan, {now, actualPixelSemanticAuditRequired: true});
  const reconciled = finalized.workspace;
  const reconciledRuntime = reconciled.production.shotIntelligence;
  const exceptionShotIds = [...new Set(finalized.exceptions.map((item) => item.shotId))].sort();
  assert.deepEqual(exceptionShotIds, ["ED-14", "ED-34"]);
  for (const plan of reconciledRuntime.packageLookMasterPlans) {
    delete plan.wholeFilmBoardRecommendation;
    delete plan.provisionalWholeFilmBoardSelection;
    if (plan.shotId === "ED-14") plan.status = "LOOK_MASTER_CLAIM_BOUNDARY_REPAIR_REQUIRED";
    else if (plan.shotId === "ED-34") plan.status = "LOOK_MASTER_FOOTAGE_COMPATIBILITY_REPAIR_REQUIRED";
  }
  for (const raw of reconciledRuntime.lookMasterRawReferences || []) {
    if (raw.candidateAuditAuthority?.status === "PASS") raw.status = "CANDIDATE_AUDIT_AUTHORITY_PASS_NOT_SELECTED";
  }
  reconciledRuntime.wholeFilmBatchRecommendation = {
    ...reconciledRuntime.wholeFilmBatchRecommendation,
    status: "PARTIAL_WITH_EXCEPTIONS",
    finalizedShotIds: [],
    exceptions: finalized.exceptions,
    reconciliationRequired: false,
    reconciliationStatus: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    completedReconciliation: "RESEARCH_MODE_AND_CANDIDATE_AUTHORITY_RECONCILED",
    explorationOnly: true,
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    recommendation: null,
    selected: null,
    currentAssembly: [],
    nextUserGate: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    updatedAt: now,
  };
  reconciledRuntime.status = "LOOK_MASTER_CANDIDATES_READY";
  reconciled.production.wholeFilmGenerationReadiness = compileWholeFilmGenerationReadiness(reconciled, reconciled.production.shotVisualCoveragePlan, {now, allowPartialCandidateReview: true});
  reconciled.production.visualProductionRun = compileVisualProductionRun(reconciled, reconciled.production.shotVisualCoveragePlan, reconciled.production.wholeFilmGenerationReadiness, {now});
  reconciled.production.visualProductionRun.reviewGate = null;
  reconciled.production.visualProductionRun.nextUserGate = null;

  const event = createProductionEvent({workspace: current, action: "reconcile-research-mode-candidate-authority", targetId: "ED-09,ED-14,ED-17,ED-19,ED-34", payload: {contract: "A1ResearchModeCandidateAuthorityReconciliation/v1", ed14ClaimNarrowed: true, modeReboundShotIds: [...MODE_REBIND_SHOT_IDS], preservedPassArtifactSha256: preservedPassRecords.map((item) => item.artifactSha256), exceptionShotIds, generatedImageCount: 0, assemblyCreated: false, downstreamStarted: false}, now});
  reconciled.production.eventLedger.eventCount += 1;
  reconciled.production.eventLedger.lastEventId = event.eventId;
  reconciled.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(reconciled, now));
  const afterArtifactShas = (recalculated.production.shotIntelligence.lookMasterRawReferences || []).map((raw) => raw.artifact?.sha256).filter(Boolean).sort();
  assert.deepEqual(afterArtifactShas, beforeArtifactShas);
  assert.equal(recalculated.production.generation.summary.queued, 0);
  assert.equal(recalculated.production.generation.summary.running, 0);
  assert.equal(recalculated.production.generation.workerStatus, "frozen");
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);
  assert.equal(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(recalculated.production.authority.currentStage, "film-look-master-exception-repair-required");
  assert.deepEqual(recalculated.production.authority.nextAction.targetShotIds.sort(), ["ED-14", "ED-34"]);

  const currentCandidateAudits = recalculated.production.shotIntelligence.lookMasterRawReferences
    .filter((raw) => raw.candidateAuditAuthority)
    .map((raw) => ({shotId: raw.shotId, referenceId: raw.referenceId, artifactSha256: raw.artifact?.sha256 || null, recommendationEligible: raw.recommendationEligible === true, status: raw.candidateAuditAuthority.status, authoritySha256: raw.candidateAuditAuthority.authoritySha256, failures: raw.candidateAuditAuthority.failures}));
  const report = {
    contract: "A1ResearchModeCandidateAuthorityReconciliationReport/v1",
    status: "PASS_WITH_EXCEPTIONS",
    commitId,
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    ed14: {route: "NARROW_VERIFIED_CLAIM", sourceTextOriginal: ED14_ORIGINAL, sourceText: ED14_NARROWED, claimBoundary: ED14_BOUNDARY, researchPacketSha256: packet.packetSha256, existingCandidateDisposition: "ALL_SUPERSEDED_BY_CLAIM_BOUNDARY", generatedImageCount: 0},
    modeBindings: [...MODE_REBIND_SHOT_IDS].map((shotId) => {const decision = recalculated.production.shotIntelligence.decisionSet.items.find((item) => item.shotId === shotId); const plan = recalculated.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId); const context = recalculated.production.shotIntelligence.videoPackagingContexts.items.find((item) => item.shotId === shotId); return {shotId, decision: {assemblyMode: decision.assemblyMode, presentationMode: decision.presentationMode, modeBinding: decision.modeBinding}, plan: {assemblyMode: plan.assemblyMode, presentationMode: plan.presentationMode, planSha256: plan.planSha256}, context: {assemblyMode: context.assemblyMode, presentationMode: context.presentationMode, contextSha256: context.contextSha256}};}),
    candidateAuthority: {contract: "A1CandidateRecommendationAuditAuthority/v1", audits: currentCandidateAudits, eligibleArtifacts: currentCandidateAudits.filter((item) => item.recommendationEligible).map((item) => ({shotId: item.shotId, artifactSha256: item.artifactSha256, authoritySha256: item.authoritySha256}))},
    preservedPassRecords,
    exceptions: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.exceptions,
    ed01Truth: {packageDecision: ed01.packageDecision, localPackageDecision: ed01.sequenceReview.localPackageDecision, packageSuppressedReason: ed01.sequenceReview.packageSuppressedReason, associationMethod: ed01.sequenceReview.claimAssociation.method, candidateRecall: ed01.sequenceReview.claimAssociation.candidateRecall},
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    currentAssemblyCount: recalculated.production.shotIntelligence.currentAssembly.length,
    downstream: {assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, staticBoardPublished: false},
    artifactSha256Changed: false,
    generatedAt: now,
  };
  const actualPixelReport = {
    contract: "A1WholeFilmActualPixelRecommendationGateReport/v1",
    status: "PARTIAL_WITH_EXCEPTIONS",
    commitId,
    workspaceSha256: recalculated.workspaceSha256,
    packageShotIds: recalculated.production.shotIntelligence.decisionSet.items.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId),
    candidateAudits: currentCandidateAudits,
    exceptions: report.exceptions,
    excludedNoPackageShotIds: ["ED-01"],
    assemblyCreationAllowed: false,
    nextUserGate: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    generatedAt: now,
  };
  const persisted = persistProjectState(appRoot, recalculated, {expectedWorkspaceSha256: current.workspaceSha256, commitId, event, files: {"whole-film-director-input.json": directorInput, "research-mode-candidate-authority-reconciliation-v1/report.json": report, "whole-film-actual-pixel-recommendation-gate-v1/report.json": actualPixelReport}});
  return {...report, journalStatus: persisted.journal.status, journalTargetCount: persisted.journal.targets.length};
});

console.log(JSON.stringify(result, null, 2));
