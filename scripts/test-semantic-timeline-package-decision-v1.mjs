#!/usr/bin/env node
import assert from "node:assert/strict";
import {buildShotIntelligenceDecisionSet, deriveShotIntelligenceDecision, reconcileSemanticTimelineRevision} from "../apps/studio-next/src/lib/a1-shot-intelligence-v1.mjs";
import {A1_SEMANTIC_TIMELINE_SUPPRESSION_REASON, applySemanticTimelineToDecisionSet, deriveSemanticTimelineReconciliationScope} from "../apps/studio-next/src/lib/a1-semantic-timeline-decision-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {compileWholeFilmVisualArchitecture} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";

const common = {
  semanticRole: "chapter-turn",
  packagingType: "OVERLAY_PACKAGE",
  valueAdded: 6,
  typeFit: 2,
  narrativeJob: "作者交代产品事实",
  viewerTakeaway: "知道这是作者做的工作台",
  viewerQuestion: "这款工作台具体怎么工作？",
  semanticActor: {identity: "作者本人", action: "用 vibe coding 做出工作台", beforeState: "没有工作台", afterState: "拥有可用工作台", target: "工作台"},
};

const beats = [
  {beatId: "ED-01", shotId: "ED-01", order: 1, sourceText: "Hi，我用 vibe coding 做了一款智能写作工作台。", editMode: "presenter-overlay", evidenceOwnerShotIds: ["ED-02", "ED-03"], ...common},
  {beatId: "ED-02", shotId: "ED-02", order: 2, sourceText: "写到任何句子，划一下就能让它改。", editMode: "screen-demo", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0},
  {beatId: "ED-03", shotId: "ED-03", order: 3, sourceText: "对胃口的句子就标喜欢，形成你自己的写作风格库。", editMode: "screen-demo", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0},
];

const first = buildShotIntelligenceDecisionSet({beats, sourceHash: "article-hash", projectId: "test", now: "2026-08-06T00:00:00.000Z"});
const ed01 = first.items.find((item) => item.shotId === "ED-01");
assert.equal(ed01.packageDecision, "NO_PACKAGE");
assert.equal(ed01.sequenceReview.packageSuppressedReason, A1_SEMANTIC_TIMELINE_SUPPRESSION_REASON);
assert.deepEqual(ed01.sequenceReview.evidenceOwner.shotIds, ["ED-02", "ED-03"]);
assert.equal(ed01.semanticRouteOverride, "PRESENTER_BASE");
assert.equal(first.sourceRevisionHash.length, 64);
assert.equal(ed01.sequenceReview.claimAssociation.status, "MATCH");
assert.ok(ed01.sequenceReview.redundancyWithAdjacentBeats >= 0.7);
assert.ok(ed01.sequenceReview.informationGainVsNoPackage <= 2);

const isolated = buildShotIntelligenceDecisionSet({beats: [beats[0]], sourceHash: "article-hash", projectId: "test", now: "2026-08-06T00:00:00.000Z"});
assert.equal(isolated.items[0].packageDecision, "PACKAGE", "without downstream evidence the intro may still earn a package");

const rewritten = buildShotIntelligenceDecisionSet({
  beats: [{...beats[0], sourceText: "Hi，我用 vibe coding 做了一个真实可用的智能写作工作台。"}, beats[1], beats[2]],
  sourceHash: "article-hash",
  projectId: "test",
  now: "2026-08-06T00:00:00.000Z",
});
assert.notEqual(rewritten.sourceRevisionHash, first.sourceRevisionHash);
assert.notEqual(rewritten.items[0].rewriteSourceHash, first.items[0].rewriteSourceHash);
assert.notEqual(rewritten.sha256, first.sha256);

const unrelatedScreen = buildShotIntelligenceDecisionSet({
  beats: [
    {shotId: "T-01", order: 1, sourceText: "这一章讲模型表达范围研究结论。", editMode: "presenter-base", semanticRole: "chapter-turn", packagingType: "FULLSCREEN_PACKAGE", valueAdded: 6, typeFit: 2},
    {shotId: "T-02", order: 2, sourceText: "打开设置调字号。", editMode: "screen-demo", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0},
  ],
  sourceHash: "article-hash",
  projectId: "test",
  now: "2026-08-06T00:00:00.000Z",
});
const t01 = unrelatedScreen.items[0];
assert.equal(t01.packageDecision, "PACKAGE", "unrelated screen evidence must not suppress a research claim");
assert.equal(t01.sequenceReview.claimAssociation.status, "NO_MATCH");
assert.equal(t01.sequenceReview.redundancyWithAdjacentBeats, 0);
assert.ok(t01.sequenceReview.informationGainVsNoPackage > 0);

const sameProductDifferentCapability = buildShotIntelligenceDecisionSet({
  beats: [
    {shotId: "T-03", order: 1, sourceText: "我做了一款写作工作台，它能自动导出视频。", editMode: "presenter-base", semanticRole: "chapter-turn", semanticClaimId: "claim:export", packagingType: "OVERLAY_PACKAGE", valueAdded: 6, typeFit: 2},
    {shotId: "T-04", order: 2, sourceText: "打开同一工作台调字号。", editMode: "screen-demo", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0},
  ],
  sourceHash: "article-hash",
  projectId: "test",
  now: "2026-08-06T00:00:00.000Z",
});
assert.equal(sameProductDifferentCapability.items[0].packageDecision, "PACKAGE", "same product with a different capability must not suppress the current claim");
assert.equal(sameProductDifferentCapability.items[0].sequenceReview.claimAssociation.status, "NO_MATCH");
assert.equal(sameProductDifferentCapability.items[0].sequenceReview.redundancyWithAdjacentBeats, 0);

const explicitConflict = buildShotIntelligenceDecisionSet({
  beats: [
    {shotId: "T-05", order: 1, sourceText: "我做了一款写作工作台，它能自动导出视频。", editMode: "presenter-base", semanticRole: "chapter-turn", semanticClaimId: "claim:export", packagingType: "OVERLAY_PACKAGE", valueAdded: 6, typeFit: 2},
    {shotId: "T-06", order: 2, sourceText: "打开同一工作台调字号。", evidenceForClaimId: "claim:font", editMode: "screen-demo", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0},
  ],
  sourceHash: "article-hash",
  projectId: "test",
  now: "2026-08-06T00:00:00.000Z",
});
assert.equal(explicitConflict.items[0].packageDecision, "PACKAGE");
assert.equal(explicitConflict.items[0].sequenceReview.claimAssociation.method, "EXPLICIT_CLAIM_ID_CONFLICT");
assert.equal(explicitConflict.items[0].sequenceReview.claimAssociation.status, "NO_MATCH");

const declaredOwnership = buildShotIntelligenceDecisionSet({
  beats: [
    {shotId: "T-07", order: 1, sourceText: "我做了一款写作工作台。", evidenceOwnerShotIds: ["T-08"], editMode: "presenter-base", semanticRole: "chapter-turn", packagingType: "OVERLAY_PACKAGE", valueAdded: 6, typeFit: 2},
    {shotId: "T-08", order: 2, sourceText: "打开这款工作台完成真实操作。", editMode: "screen-demo", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0},
  ],
  sourceHash: "article-hash",
  projectId: "test",
  now: "2026-08-06T00:00:00.000Z",
});
assert.equal(declaredOwnership.items[0].packageDecision, "NO_PACKAGE");
assert.equal(declaredOwnership.items[0].sequenceReview.claimAssociation.method, "DECLARED_EVIDENCE_OWNERSHIP");
assert.equal(declaredOwnership.items[0].sequenceReview.evidenceOwner.shotIds[0], "T-08");

const explicitEvidence = buildShotIntelligenceDecisionSet({
  beats: [
    {shotId: "T-09", order: 1, sourceText: "这一章先提出一个证据命题。", semanticClaimId: "claim:source-1", editMode: "presenter-base", semanticRole: "chapter-turn", packagingType: "FULLSCREEN_PACKAGE", valueAdded: 6, typeFit: 2},
    {shotId: "T-10", order: 2, sourceText: "打开原始页面。", evidenceForClaimId: "claim:source-1", editMode: "screen-demo", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0},
  ],
  sourceHash: "article-hash",
  projectId: "test",
  now: "2026-08-06T00:00:00.000Z",
});
assert.equal(explicitEvidence.items[0].packageDecision, "NO_PACKAGE");
assert.equal(explicitEvidence.items[0].sequenceReview.claimAssociation.method, "EXPLICIT_CLAIM_ID");

const neighborSeed = buildShotIntelligenceDecisionSet({
  beats: [
    {shotId: "T-11", order: 1, sourceText: "这一章讲一个关键工作流。", editMode: "presenter-base", semanticRole: "chapter-turn", packagingType: "FULLSCREEN_PACKAGE", valueAdded: 6, typeFit: 2},
    {shotId: "T-12", order: 2, sourceText: "打开页面完成工作流。", editMode: "screen-demo", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0},
  ],
  sourceHash: "article-hash",
  projectId: "test",
  now: "2026-08-06T00:00:00.000Z",
});
const neighborChanged = applySemanticTimelineToDecisionSet(neighborSeed, {
  beats: [
    {shotId: "T-11", order: 1, sourceText: "这一章讲一个关键工作流。", editMode: "presenter-base", semanticRole: "chapter-turn", packagingType: "FULLSCREEN_PACKAGE", valueAdded: 6, typeFit: 2},
    {shotId: "T-12", order: 2, sourceText: "打开设置调字号。", editMode: "screen-demo", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0},
  ],
  sourceHash: "article-hash",
  now: "2026-08-06T00:00:00.000Z",
});
assert.notEqual(neighborChanged.items[0].rewriteSourceHash, neighborSeed.items[0].rewriteSourceHash, "a neighbor rewrite must invalidate the current beat cache");
assert.equal(neighborChanged.items[0].packageDecision, "PACKAGE");
assert.equal(neighborChanged.items[0].sequenceReview.claimAssociation.status, "NO_MATCH");

const decisionInputsA = buildShotIntelligenceDecisionSet({
  beats: [{shotId: "T-13", order: 1, sourceText: "同一句话", editMode: "presenter-base", evidenceRoute: "PRESENTER", semanticRole: "chapter-turn", packagingType: "OVERLAY_PACKAGE", valueAdded: 6, typeFit: 2, presentationModeOverride: "OVERLAY", visualContext: "人物负空间", viewerQuestion: "看懂身份"}],
  sourceHash: "article-hash",
  projectId: "test",
  now: "2026-08-06T00:00:00.000Z",
});
const decisionInputsB = buildShotIntelligenceDecisionSet({
  beats: [{shotId: "T-13", order: 1, sourceText: "同一句话", editMode: "screen-demo", evidenceRoute: "PRODUCT_PROOF", semanticRole: "supporting-explanation", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0, presentationModeOverride: "FULLSCREEN", visualContext: "真实界面", viewerQuestion: "看懂操作"}],
  sourceHash: "article-hash",
  projectId: "test",
  now: "2026-08-06T00:00:00.000Z",
});
assert.notEqual(decisionInputsA.sourceRevisionHash, decisionInputsB.sourceRevisionHash, "all decision inputs must participate in revision hashing");
assert.notEqual(decisionInputsA.items[0].rewriteSourceHash, decisionInputsB.items[0].rewriteSourceHash);

const groupedMechanism = buildShotIntelligenceDecisionSet({
  beats: [
    {shotId: "T-14", order: 1, sourceText: "先收集材料，再做筛选。", mechanismId: "mechanism:material-filter", semanticRole: "core-method", editMode: "presenter-base", packagingType: "EXPLAINER_PACKAGE", valueAdded: 6, typeFit: 2},
    {shotId: "T-15", order: 2, sourceText: "筛选后再形成最终结果。", mechanismId: "mechanism:material-filter", semanticRole: "core-method", editMode: "presenter-base", packagingType: "EXPLAINER_PACKAGE", valueAdded: 6, typeFit: 2},
  ],
  sourceHash: "article-hash",
  projectId: "test",
  now: "2026-08-06T00:00:00.000Z",
});
assert.equal(groupedMechanism.items[0].sequenceReview.finalPackageMode, "EXPLAINER");
assert.equal(groupedMechanism.items[1].sequenceReview.finalPackageMode, "EXPLAINER");
assert.equal(groupedMechanism.items[0].sequenceReview.eventGrouping.groupId, "PACKAGE:MECHANISM:mechanism:material-filter");
assert.equal(groupedMechanism.items[1].sequenceReview.eventGrouping.groupId, groupedMechanism.items[0].sequenceReview.eventGrouping.groupId);
assert.deepEqual(groupedMechanism.items[0].sequenceReview.eventGrouping.memberShotIds, ["T-14", "T-15"]);
assert.equal(groupedMechanism.items[0].sequenceReview.packageModeDecision.source, "EXPLICIT_MECHANISM_ID");

const staleRevision = {...first, sourceRevisionHash: "f".repeat(64)};
const revisionConsumer = reconcileSemanticTimelineRevision({decisionSet: staleRevision, beats, sourceHash: "article-hash", projectId: "test", now: "2026-08-06T00:00:00.000Z"});
assert.equal(revisionConsumer.invalidated, true);
assert.equal(revisionConsumer.revision.status, "RECOMPILED");
assert.equal(revisionConsumer.decisionSet.sourceRevisionHash, first.sourceRevisionHash);
const genericScope = deriveSemanticTimelineReconciliationScope({previousDecisionSet: neighborSeed, nextDecisionSet: neighborChanged});
assert.deepEqual(genericScope.targetShotIds, ["T-11", "T-12"]);
assert.equal(genericScope.targetShotIds.includes("ED-01"), false);

const liveWorkspace = readProjectWorkspace("./apps/studio-next");
const liveArchitecture = compileWholeFilmVisualArchitecture(liveWorkspace, {now: "2026-08-06T00:00:00.000Z"});
assert.equal(liveArchitecture.coveragePlan.semanticTimeline.recompileRequired, false);
assert.equal(liveArchitecture.coveragePlan.semanticTimeline.sourceRevisionHash, liveWorkspace.production.shotIntelligence.decisionSet.sourceRevisionHash);
assert.equal(liveArchitecture.coveragePlan.shotPlans.find((item) => item.shotId === "ED-01").route, "PACKAGE_LOOK_MASTER");
const livePackage = liveArchitecture.coveragePlan.shotPlans.find((item) => item.packageDecision === "PACKAGE" && item.eventGrouping?.role === "PACKAGE_EVENT");
assert.equal(livePackage.eventGrouping.role, "PACKAGE_EVENT");
assert.equal(livePackage.eventGrouping.mode, livePackage.assemblyMode);

const research = deriveShotIntelligenceDecision({shotId: "ED-14", order: 14, sourceText: "后来我查了一下关于 AI 写作的研究。", semanticRole: "decisive-contrast", editMode: "presenter-base", packagingType: "FULLSCREEN_PACKAGE", valueAdded: 6, typeFit: 2}, {sourceHash: "article-hash"});
assert.equal(research.claimType, "research_claim");
assert.equal(research.networkDecision, "REQUIRED");

const authorProof = deriveShotIntelligenceDecision({shotId: "ED-12", order: 12, sourceText: "我试了 GPT、Claude、Kimi、DeepSeek，还有智谱。", semanticRole: "narrative-or-operation", editMode: "presenter-base", packagingType: "NO_PACKAGE", valueAdded: 0, typeFit: 0}, {sourceHash: "article-hash"});
assert.equal(authorProof.proofRoute, "AUTHOR_PROOF");
assert.equal(authorProof.networkDecision, "SKIP");

console.log(JSON.stringify({status: "PASS", ed01: {packageDecision: ed01.packageDecision, evidenceOwner: ed01.sequenceReview.evidenceOwner, association: ed01.sequenceReview.claimAssociation}, unrelatedResearchRemainsPackage: t01.packageDecision === "PACKAGE", sameProductDifferentCapabilityRemainsPackage: sameProductDifferentCapability.items[0].packageDecision === "PACKAGE", explicitConflictHardNoMatch: explicitConflict.items[0].sequenceReview.claimAssociation.method === "EXPLICIT_CLAIM_ID_CONFLICT", declaredOwnershipSuppressed: declaredOwnership.items[0].packageDecision === "NO_PACKAGE", neighborRewriteInvalidated: neighborChanged.items[0].rewriteSourceHash !== neighborSeed.items[0].rewriteSourceHash, decisionInputsComplete: decisionInputsA.sourceRevisionHash !== decisionInputsB.sourceRevisionHash, groupedMechanism: groupedMechanism.items[0].sequenceReview.eventGrouping.groupId, explicitEvidenceSuppressed: explicitEvidence.items[0].packageDecision === "NO_PACKAGE", sourceRevisionChanged: rewritten.sourceRevisionHash !== first.sourceRevisionHash, staleRevisionRecompiled: revisionConsumer.invalidated, coverageRevisionCurrent: liveArchitecture.coveragePlan.semanticTimeline.recompileRequired === false, packageEventModeBound: livePackage.eventGrouping.mode === livePackage.assemblyMode, research: research.networkDecision, authorProof: authorProof.networkDecision}, null, 2));
