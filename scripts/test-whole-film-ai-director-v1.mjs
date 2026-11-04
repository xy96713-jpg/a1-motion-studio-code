#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {auditWholeFilmMediumRhythm, runWholeFilmAiDirector, revalidateWholeFilmAiPlanV1} from "../apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {buildScreenSourceCapabilityProfile} from "../apps/studio-next/src/lib/a1-screen-source-capability-v1.mjs";

const repeatedScreenAudit = auditWholeFilmMediumRhythm([
  {editMode: "screen-demo", topology: "source-action-detail", editWindow: {durationMs: 1000}},
  {editMode: "screen-demo", topology: "source-surface-crop", editWindow: {durationMs: 1000}},
  {editMode: "screen-demo", topology: "source-action-detail", editWindow: {durationMs: 1000}},
  {editMode: "presenter-overlay", topology: "presenter-negative-space", editWindow: {durationMs: 1000}},
]);
assert.equal(repeatedScreenAudit.pass, true);
assert.equal(repeatedScreenAudit.screenRatioIsMetricOnly, true);
assert.ok(repeatedScreenAudit.reviewRisks.includes("review-consecutive-screen-demo-sequence-continuity"));
assert.equal(repeatedScreenAudit.hardFailures.length, 0);

const facelessRhythmAudit = auditWholeFilmMediumRhythm(Array.from({length: 14}, () => ({
  editMode: "full-package", topology: "editorial-evidence-field", editWindow: {durationMs: 1000},
})));
assert.equal(facelessRhythmAudit.pass, true);
assert.ok(facelessRhythmAudit.reviewRisks.includes("review-no-presenter-overlay-against-source-and-brief"));
assert.ok(facelessRhythmAudit.reviewRisks.includes("review-closing-beat-without-type-only-verdict"));
assert.ok(facelessRhythmAudit.reviewRisks.includes("review-three-consecutive-shots-share-topology"));
const sourceScreenRhythmAudit = auditWholeFilmMediumRhythm(Array.from({length: 12}, () => ({
  editMode: "screen-demo", topology: "source-surface-crop", editWindow: {durationMs: 1000},
})));
assert.equal(sourceScreenRhythmAudit.pass, true);
assert.ok(sourceScreenRhythmAudit.reviewRisks.includes("review-no-mechanism-package-against-argument-needs"));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strategySchema = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-whole-film-strategy-output.schema.json"), "utf8"));
const shotSchema = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-whole-film-shot-plan-output.schema.json"), "utf8"));
const syntheticScreenSourceSha256 = "e".repeat(64);
const syntheticScreenCapabilityProfile = buildScreenSourceCapabilityProfile({
  sourceSha256: syntheticScreenSourceSha256,
  durationMs: 4800,
  applicationIdentity: "synthetic-reviewed-test-capture",
  reviewStatus: "verified",
  verifiedOperations: [{id: "edit-one-sentence", action: "select and edit one sentence", target: "the chosen sentence",
    result: "the replacement sentence appears in the source page", startMs: 1000, endMs: 2200,
    frameEvidence: [{atMs: 1000, sha256: "f".repeat(64)}, {atMs: 2200, sha256: "a".repeat(64)}]}],
  reviewEvidence: {artifactPath: "/fixtures/screen-review.json", artifactSha256: "b".repeat(64),
    reviewerId: "director-test-fixture", reviewedAt: "2026-09-28T00:00:00Z"},
});

const cues = [
  {cueId: 1, sourceStartMs: 0, sourceEndMs: 1000, sourceText: "Hi，我用 vibe coding 做了一款智能写作工作台"},
  {cueId: 2, sourceStartMs: 1000, sourceEndMs: 2200, sourceText: "我先打开真实页面并修改一句话"},
  {cueId: 3, sourceStartMs: 2200, sourceEndMs: 3500, sourceText: "真正的问题不是换模型，而是写作之前没有建立判断"},
  {cueId: 4, sourceStartMs: 3500, sourceEndMs: 4800, sourceText: "最后仍然要由人写出自己的风格"},
];

const articleText = cues.map((cue) => `${cue.sourceText}。`).join("\n");

const understanding = {
  contract: "A1ArticleUnderstanding/v1",
  analyzerMode: "codex-director-v1",
  title: "为什么换模型仍有 AI 味",
  thesis: "写作判断比单纯换模型重要",
  sentences: cues.map((cue, index) => ({
    id: `sentence-${String(index + 1).padStart(2, "0")}`,
    sourceText: cue.sourceText,
    paragraphIndex: index,
    sentenceIndex: index,
    function: index === 0 ? "setup" : index === 3 ? "closing" : index === 2 ? "claim" : "method",
    relationToPrevious: index === 0 ? "opening" : index === 3 ? "conclusion" : index === 2 ? "contrast" : "sequence",
    semanticClaim: index === 0 ? "智能写作工作台" : index === 3 ? "写出自己的风格" : cue.sourceText.slice(0, 16),
    topicKeys: [],
    signals: [],
    reasons: ["fixture"],
    confidence: 0.9,
  })),
  sections: cues.map((cue, index) => ({
    id: `section-${String(index + 1).padStart(2, "0")}`,
    memberSentenceIds: [`sentence-${String(index + 1).padStart(2, "0")}`],
    sourceText: cue.sourceText,
    paragraphIndexes: [index],
    dominantFunction: index === 0 ? "setup" : index === 3 ? "closing" : index === 2 ? "claim" : "method",
    relationFromPrevious: index === 0 ? "opening" : index === 3 ? "conclusion" : index === 2 ? "contrast" : "sequence",
    semanticClaim: cue.sourceText.slice(0, 16),
    groupingReason: "fixture",
    confidence: 0.9,
  })),
  coverage: {
    acceptedSentenceIds: ["sentence-01", "sentence-02", "sentence-03", "sentence-04"],
    assignedSentenceIds: ["sentence-01", "sentence-02", "sentence-03", "sentence-04"],
    missingSentenceIds: [],
    duplicateSentenceIds: [],
    exact: true,
  },
  confidence: 0.9,
};

const strategy = {
  contract: "A1WholeFilmStrategyOutput/v1",
  visualThesis: "人物建立可信立场，真实屏幕证明动作，包装只解释不可实拍的判断，纯字负责最终停顿。",
  presenterRole: "人物承担第一人称开场、可信边界和价值收束。",
  screenRole: "真实屏幕只证明可验证的操作链。",
  packageRole: "包装解释换模型与写作判断的核心对照。",
  typeOnlyRule: "只在最终可独立记忆的价值句使用。",
  rhythmArc: ["人物开场", "真实操作", "判断重击", "安静收束"],
  chapters: [
    {chapterId: "C01", title: "工作台真的能用", firstCueId: 1, lastCueId: 2, narrativeArc: "从作者到真实动作"},
    {chapterId: "C02", title: "把方向交还作者", firstCueId: 3, lastCueId: 4, narrativeArc: "从核心判断到终句"},
  ],
  globalRules: [
    "真人镜头保护眼睛和嘴",
    "录屏必须来自真实界面",
    "禁止通用标题卡和 HUD",
    "缺素材必须显式阻塞",
  ],
};

const nonPresenterPackage = {
  intensity: "not-applicable",
  keyPhrases: [],
  spatialAnchor: "not-applicable",
  faceSafeZone: "not-applicable",
  occlusionRule: "not-applicable",
};

const shotPlan = {
  contract: "A1WholeFilmShotPlanOutput/v1",
  shots: [
    {
      firstCueId: 1,
      lastCueId: 1,
      chapterId: "C01",
      editMode: "presenter-overlay",
      narrativeJob: "作者直接建立产品来自真实使用的可信开场",
      viewerTakeaway: "这是作者亲自做出的工作台",
      viewerQuestion: "观众是否明白这是作者亲自做出的写作工作台？",
      semanticActor: {identity: "作者本人和智能写作工作台", action: "在开场同时建立身份与产品归属", beforeState: "观众尚不知道作者与产品关系", afterState: "作者身份和产品来源同时成立", target: "开场可信度"},
      mediumDecisionReason: "第一人称身份必须由人物承担，关键短语在脸旁完成一次包装。",
      presenterDirection: "中近景看镜头，第一句自然说完。",
      overlayBrief: "Hi 与 vibe coding 在人物右侧负空间分两拍锁定。",
      presenterPackage: {
        intensity: "hero",
        keyPhrases: ["Hi", "vibe coding", "智能写作工作台"],
        spatialAnchor: "negative-space",
        faceSafeZone: "LOCK_EYES_AND_MOUTH",
        occlusionRule: "文字只进入右侧负空间，不遮挡眼睛和嘴。",
      },
      screenActions: [],
      packageBrief: null,
      transitionOut: "工作台一词匹配切到真实页面",
      requiredMaterialIds: ["presenter-take-opening"],
      materialRequirements: [{id: "presenter-take-opening", duty: "presenter-footage", evidenceIds: []}],
      visualJob: "让本人和产品身份在第一句同时成立",
      primaryActor: "presenter-face-and-vibe-coding-phrase",
      materialRoute: "presenter-real-footage-plus-approved-assets",
      topology: "presenter-negative-space",
      typographyRole: "hero-phrase-and-editorial-accent",
      keyPhrases: ["Hi", "vibe coding", "智能写作工作台"],
      layoutConstraints: ["保护眼睛和嘴", "只使用人物右侧负空间", "最多两个字体角色"],
      motionPhrase: "人物先开口，Hi 在负空间短暂出现，vibe coding 接替并锁到真实工作台对象",
      handoffActor: "智能写作工作台",
      structureDirections: ["右侧负空间纵向错峰", "肩部后景压叠并让出脸部", "桌面对象承接短语"],
    },
    {
      firstCueId: 2,
      lastCueId: 2,
      chapterId: "C01",
      editMode: "screen-demo",
      narrativeJob: "用真实界面证明选择和修改动作",
      viewerTakeaway: "工作台可以直接修改一句话",
      viewerQuestion: "观众是否看懂一句话如何在真实工作台里被直接修改？",
      semanticActor: {identity: "真实文章页面中的被选句子", action: "被选中并在原位置完成修改", beforeState: "原句尚未被处理", afterState: "修改结果在同源界面确认", target: "可验证的编辑动作"},
      mediumDecisionReason: "这是可验证操作，必须由真实屏幕承担。",
      presenterDirection: null,
      overlayBrief: null,
      presenterPackage: nonPresenterPackage,
      screenActions: ["打开真实文章页面", "选择一句并完成修改"],
      packageBrief: null,
      transitionOut: "被修改的句子放大成为下一镜判断",
      requiredMaterialIds: ["capture-edit-one-sentence"],
      materialRequirements: [{id: "capture-edit-one-sentence", duty: "screen-capture", evidenceIds: ["edit-one-sentence"]}],
      visualJob: "证明选择和改写在真实界面同一空间发生",
      primaryActor: "selected-sentence",
      materialRoute: "real-screen-capture",
      topology: "source-action-detail",
      typographyRole: "source-interface-text-only",
      keyPhrases: ["修改一句话"],
      layoutConstraints: ["界面文字保持可读", "选区和修改结果必须同源", "禁止重绘按钮"],
      motionPhrase: "真实选区出现，句子被就地改写，修改结果在原位置确认",
      handoffActor: "被修改的句子",
      structureDirections: ["原屏幕局部推近", "选择区域与上下文双层裁切", "鼠标动作和文本结果同框"],
    },
    {
      firstCueId: 3,
      lastCueId: 3,
      chapterId: "C02",
      editMode: "full-package",
      narrativeJob: "把换模型和写作判断形成一次结构对照",
      viewerTakeaway: "真正问题发生在写作之前",
      viewerQuestion: "观众是否明白换模型无效的原因是缺少写作前判断？",
      semanticActor: {identity: "被多个模型反复处理的真实稿件", action: "穿过模型更换后仍不改变并被判断标记切断", beforeState: "稿件在模型之间循环", afterState: "判断介入并终止无效循环", target: "写作之前的判断"},
      mediumDecisionReason: "抽象因果需要完整包装，但不能做成卡片陈列。",
      presenterDirection: null,
      overlayBrief: null,
      presenterPackage: nonPresenterPackage,
      screenActions: [],
      packageBrief: "让真实稿件对象先经过多个模型仍不改变，再由判断标记切断循环。",
      transitionOut: "判断标记收束成终句中的自己的风格",
      requiredMaterialIds: ["real-manuscript-object"],
      materialRequirements: [{id: "real-manuscript-object", duty: "verified-source", evidenceIds: []}],
      visualJob: "把换模型无效和缺少判断做成可见因果",
      primaryActor: "real-manuscript-object",
      materialRoute: "approved-asset-pack",
      topology: "editorial-evidence-field",
      typographyRole: "editorial-judgment",
      keyPhrases: ["真正的问题", "写作之前", "判断"],
      layoutConstraints: ["真实稿件是唯一证据锚点", "模型痕迹不能成为漂浮 Logo 卡", "判断词必须与稿件发生遮挡"],
      motionPhrase: "稿件穿过重复模型痕迹仍不改变，判断标记切断循环，关键句在证据上锁定",
      handoffActor: "判断",
      structureDirections: ["稿件横向穿越多个处理痕迹", "版本纸层围绕同一稿件叠压", "判断标记从稿件批注中长出"],
    },
    {
      firstCueId: 4,
      lastCueId: 4,
      chapterId: "C02",
      editMode: "type-only",
      narrativeJob: "用安静终句把价值交还作者",
      viewerTakeaway: "最终目标是自己的风格",
      viewerQuestion: "观众是否记住最终决定权属于作者自己的风格？",
      semanticActor: {identity: "自己的风格这句终判断", action: "从上一镜判断词接入并独立停住", beforeState: "决定权仍在工具判断中", afterState: "决定权明确回到作者", target: "作者的最终所有权"},
      mediumDecisionReason: "终句可以独立记忆，适合纯字停顿。",
      presenterDirection: null,
      overlayBrief: null,
      presenterPackage: nonPresenterPackage,
      screenActions: [],
      packageBrief: "只保留自己的风格并留出足够停顿，不做产品 Logo 结尾。",
      transitionOut: "hold-to-black",
      requiredMaterialIds: [],
      materialRequirements: [],
      visualJob: "用一个可记忆的终句把决定权交回作者",
      primaryActor: "自己的风格",
      materialRoute: "editable-typography",
      topology: "typographic-field",
      typographyRole: "quiet-verdict",
      keyPhrases: ["自己的风格"],
      layoutConstraints: ["只保留一个主判断", "大面积留黑", "不得添加产品 Logo"],
      motionPhrase: "自己的风格从上一镜判断词接入，完整停住，再硬切黑场",
      handoffActor: "hard-cut-to-black",
      structureDirections: ["孤立字形居中偏下", "窄行字块贴近画面边缘", "大字裁切后回到完整可读"],
    },
  ],
};
const chapterOneShotPlan = {contract: shotPlan.contract, shots: shotPlan.shots.slice(0, 2)};
const chapterTwoShotPlan = {contract: shotPlan.contract, shots: shotPlan.shots.slice(2)};
const chapterOneMissingMediaRepairPlan = structuredClone(chapterOneShotPlan);
chapterOneMissingMediaRepairPlan.shots = chapterOneMissingMediaRepairPlan.shots.map((shot, index) => ({
  ...shot,
  editMode: "full-package",
  presenterDirection: null,
  overlayBrief: null,
  presenterPackage: nonPresenterPackage,
  packageBrief: index === 0
    ? "This source-bound passage remains blocked until the real presenter take is available."
    : "This operation remains blocked until the real screen capture is available.",
  requiredMaterialIds: [index === 0 ? "presenter-take-opening" : "capture-edit-one-sentence"],
  materialRequirements: [{id: index === 0 ? "presenter-take-opening" : "capture-edit-one-sentence",
    duty: index === 0 ? "presenter-footage" : "screen-capture", evidenceIds: []}],
  materialRoute: "approved-asset-pack",
  topology: "editorial-material-world",
}));

function baseInput(mediaInventory) {
  return {
    projectId: "article-ai-writing",
    title: "为什么换模型仍有 AI 味",
    articleText,
    cues,
    timeline: {authority: "corrected-srt", srtPath: "/fixtures/article.srt", srtSha256: "a".repeat(64)},
    mediaInventory: mediaInventory || {
      presenterFootage: {status: "bound", assetUri: "/fixtures/presenter.mov"},
      screenRecording: {status: "bound", assetUri: "/fixtures/screen.mov", sourceSha256: syntheticScreenSourceSha256,
        capabilityProfile: syntheticScreenCapabilityProfile},
      boundMaterialIds: ["presenter-take-opening", "capture-edit-one-sentence", "real-manuscript-object"],
    },
  };
}

function dependencies(outputs, prompts = []) {
  let passIndex = 0;
  return {
    capabilityRunner: async () => ({available: true, version: "codex-test"}),
    articleUnderstandingRunner: async () => ({
      contract: "A1CodexArticleDirector/v1",
      status: "completed",
      taskId: "article-task",
      analyzerMode: "codex-director-v1",
      durationMs: 11,
      codexVersion: "codex-test",
      understanding,
    }),
    structuredPassRunner: async (request) => {
      prompts.push(request);
      const output = outputs[passIndex++];
      if (output instanceof Error) throw output;
      return {output, model: "test-model", taskId: request.taskId, durationMs: 17, codexVersion: "codex-test"};
    },
    randomId: () => `task-${passIndex}`,
  };
}

assert.equal(strategySchema.additionalProperties, false);
assert.equal(strategySchema.properties.contract.const, "A1WholeFilmStrategyOutput/v1");
assert.equal(shotSchema.additionalProperties, false);
assert.equal(shotSchema.properties.shots.items.additionalProperties, false);
assert.deepEqual(shotSchema.properties.shots.items.properties.structureDirections.minItems, 2);

const prompts = [];
const missingMediaRun = await runWholeFilmAiDirector(baseInput({
  presenterFootage: {status: "missing"},
  screenRecording: {status: "planning-evidence-only"},
  boundMaterialIds: [],
}), dependencies([strategy, chapterOneShotPlan, chapterOneMissingMediaRepairPlan, chapterTwoShotPlan], prompts));

assert.equal(missingMediaRun.status, "completed");
assert.equal(missingMediaRun.aiDirected, true);
assert.equal(missingMediaRun.plan.authorship.decisionSource, "ai-whole-film-director");
assert.equal(missingMediaRun.plan.authorship.newArticleGeneralizationProven, false);
assert.equal(missingMediaRun.plan.source.alignment.status, "PASS");
assert.deepEqual(missingMediaRun.plan.coverage.acceptedCueIds, [1, 2, 3, 4]);
assert.deepEqual(missingMediaRun.plan.coverage.assignedCueIds, [1, 2, 3, 4]);
assert.equal(missingMediaRun.plan.coverage.editTimelineContinuous, true);
assert.equal(missingMediaRun.plan.shots.length, 4);
assert.equal(missingMediaRun.plan.shots[0].editMode, "full-package");
assert.equal(missingMediaRun.plan.shots[0].presenterPackage.faceSafeZone, "not-applicable");
assert.equal(missingMediaRun.plan.shots[0].topology, "editorial-material-world");
assert.equal(missingMediaRun.plan.shots[1].primaryActor, "selected-sentence");
assert.equal(missingMediaRun.plan.shots[2].structureDirections.length, 3);
assert.equal(missingMediaRun.plan.shots[3].motionPhrase.includes("完整停住"), true);
assert.equal(missingMediaRun.plan.shots[0].materialGate, "BLOCKED_MEDIA_MISSING");
assert.ok(missingMediaRun.plan.shots[0].missingMaterialIds.includes("presenter-take-opening"));
assert.equal(missingMediaRun.plan.shots[1].materialGate, "BLOCKED_MEDIA_MISSING");
assert.ok(missingMediaRun.plan.shots[1].missingMaterialIds.includes("capture-edit-one-sentence"));
assert.equal(missingMediaRun.plan.shots[2].materialGate, "BLOCKED_MEDIA_MISSING");
assert.equal(missingMediaRun.plan.shots[3].materialGate, "READY_FOR_DESIGN_AFTER_PLAN_APPROVAL");
assert.equal(missingMediaRun.plan.gates.materialExecutionAllowed, false);
assert.equal(missingMediaRun.plan.gates.layoutCandidateGenerationAllowed, false);
assert.equal(missingMediaRun.plan.gates.shotRenderAllowed, false);
assert.equal(missingMediaRun.traces.length, 5);
assert.ok(missingMediaRun.traces.every((trace) => trace.outputHash?.length === 64));
assert.equal(prompts[0].pass, "whole-film-strategy");
assert.ok(prompts[0].prompt.includes("必须先理解全文论证"));
assert.ok(prompts[0].prompt.includes(cues[3].sourceText));
assert.equal(prompts[1].pass, "contextual-shot-design");
assert.equal(prompts[1].segmentId, "C01");
assert.ok(prompts[1].prompt.includes("previousCue"));
assert.ok(prompts[1].prompt.includes("nextCue"));
assert.ok(prompts[1].prompt.includes("露脸处允许成熟文字包装") === false);
assert.ok(prompts[1].prompt.includes("presenter-overlay"));
assert.equal(prompts[2].segmentId, "C01-exact-copy-repair-01");
assert.equal(prompts[3].segmentId, "C02");

const boundMediaRun = await runWholeFilmAiDirector(baseInput({
  presenterFootage: {status: "bound", assetUri: "/media/presenter.mov"},
  screenRecording: {status: "bound", assetUri: "/media/screen.mov", sourceSha256: syntheticScreenSourceSha256,
    capabilityProfile: syntheticScreenCapabilityProfile},
  boundMaterialIds: ["presenter-take-opening", "capture-edit-one-sentence", "real-manuscript-object"],
}), dependencies([strategy, chapterOneShotPlan, chapterTwoShotPlan]));
assert.equal(boundMediaRun.status, "completed");
assert.ok(boundMediaRun.plan.shots.every((shot) => shot.materialGate === "READY_FOR_DESIGN_AFTER_PLAN_APPROVAL"));

const boundReplayInput = baseInput({
  presenterFootage: {status: "bound", assetUri: "/media/presenter.mov"},
  screenRecording: {status: "bound", assetUri: "/media/screen.mov", sourceSha256: syntheticScreenSourceSha256,
    capabilityProfile: syntheticScreenCapabilityProfile},
  boundMaterialIds: ["presenter-take-opening", "capture-edit-one-sentence", "real-manuscript-object"],
});
const replayArgs = {input: boundReplayInput, plan: boundMediaRun.plan, expectedPlanSha256: nodeInputHash(boundMediaRun.plan)};
const planReplay = revalidateWholeFilmAiPlanV1(replayArgs);
assert.equal(planReplay.pass, true);assert.equal(planReplay.newModelCalls, 0);
assert.equal(planReplay.creativeDirectionReevaluated, false);assert.equal(planReplay.visualApproval, false);
assert.throws(() => revalidateWholeFilmAiPlanV1({...replayArgs, input: {...boundReplayInput, articleText: articleText + "新事实"}}), /source-or-cues-changed/u);
assert.throws(() => revalidateWholeFilmAiPlanV1({...replayArgs, input: {...boundReplayInput, mediaInventory: {...boundReplayInput.mediaInventory, presenterFootage: {status: "missing"}}}}), /media-inventory-changed/u);
const tamperedPlan = structuredClone(boundMediaRun.plan);
tamperedPlan.shots[0].viewerTakeaway = "changed";
assert.throws(() => revalidateWholeFilmAiPlanV1({...replayArgs, plan: tamperedPlan}), /snapshot-changed/u);
const badLiteralReplay = structuredClone(boundMediaRun.plan);
badLiteralReplay.shots[3].requiredMaterialIds = ["bad-copy"];
badLiteralReplay.shots[3].materialRequirements = [{id: "bad-copy", duty: "editable-type", evidenceIds: [], exactCopy: "source did not say this"}];
assert.throws(() => revalidateWholeFilmAiPlanV1({...replayArgs, plan: badLiteralReplay, expectedPlanSha256: nodeInputHash(badLiteralReplay)}), /not-source-substring/u);

const providedAnalysisPrompts = [];
const providedAnalysisRun = await runWholeFilmAiDirector({
  ...baseInput(),
  articleAnalysis: {
    analysis: {
      contract: "A1ArticleUnderstanding/v1",
      source: {cueCount: 4},
      directorUnderstanding: "这不是按钮介绍，而是把人的写作判断固化为可复用流程。",
      coreClaim: "人的判断必须先进入流程，AI 才会更像作者。",
      argumentMovement: ["展示功能", "提出反问", "解释根因", "交还作者"],
      antiMisreadings: ["不要包装成模型广告"],
    },
    provenance: {path: "/fixtures/article-understanding.json", sha256: "b".repeat(64)},
  },
}, {
  ...dependencies([strategy, chapterOneShotPlan, chapterTwoShotPlan], providedAnalysisPrompts),
  articleUnderstandingRunner: async () => { throw new Error("provided analysis must prevent duplicate article AI pass"); },
});
assert.equal(providedAnalysisRun.status, "completed");
assert.equal(providedAnalysisRun.plan.articleUnderstanding.analyzerMode, "upstream-source-bound-v1");
assert.equal(providedAnalysisRun.plan.source.articleAnalysisPath, "/fixtures/article-understanding.json");
assert.equal(providedAnalysisRun.traces[0].model, "upstream-source-bound-analysis");
assert.equal(providedAnalysisPrompts.length, 3);

const providedStrategyPrompts = [];
const providedStrategyRun = await runWholeFilmAiDirector({
  ...baseInput(),
  strategyCandidate: {strategy, provenance: {taskId: "cached-strategy-task", outputHash: "c".repeat(64)}},
}, dependencies([chapterOneShotPlan, chapterTwoShotPlan], providedStrategyPrompts));
assert.equal(providedStrategyRun.status, "completed");
assert.equal(providedStrategyRun.traces[1].model, "provided-validated-strategy");
assert.equal(providedStrategyPrompts.length, 2);
assert.ok(providedStrategyPrompts.every((request) => request.pass === "contextual-shot-design"));

// A source-valid prefix must not hide an invented suffix via the compiler's
// previous 120-character truncation. Repairs receive the rejected bytes and
// the particular shot's cues, rather than just an error path.
const longSourceInput = baseInput();
longSourceInput.cues = structuredClone(cues);
longSourceInput.cues[3].sourceText = "最后仍然要由人写出自己的风格。".repeat(12);
longSourceInput.articleText = longSourceInput.cues.map((cue) => cue.sourceText).join("\n");
const badCopyPlan = structuredClone(chapterTwoShotPlan);
badCopyPlan.shots[1].requiredMaterialIds = ["closing-copy"];
badCopyPlan.shots[1].materialRequirements = [{id: "closing-copy", duty: "editable-type", evidenceIds: [],
  exactCopy: `${longSourceInput.cues[3].sourceText.slice(0, 120)}虚构后缀`, diagramSpec: null}];
const repairedCopyPlan = structuredClone(badCopyPlan);
repairedCopyPlan.shots[1].materialRequirements[0].exactCopy = "自己的风格";
const copyRepairPrompts = [];
const copyRepairRun = await runWholeFilmAiDirector(longSourceInput,
  dependencies([strategy, chapterOneShotPlan, badCopyPlan, repairedCopyPlan], copyRepairPrompts));
assert.equal(copyRepairRun.status, "completed");
const rejectedCopyTrace = copyRepairRun.traces.find((trace) => trace.reason?.includes("max-length-exceeded"));
assert.ok(rejectedCopyTrace);
assert.equal(rejectedCopyTrace.validationFeedback.rejectedShot.materialRequirements[0].exactCopy,
  badCopyPlan.shots[1].materialRequirements[0].exactCopy);
assert.deepEqual(rejectedCopyTrace.validationFeedback.assignedCues.map((cue) => cue.cueId), [4]);
assert.ok(copyRepairPrompts.at(-1).prompt.includes("虚构后缀"));
assert.ok(copyRepairPrompts.at(-1).prompt.includes("assignedCues"));
assert.equal(copyRepairRun.plan.shots[3].materialRequirements[0].exactCopy, "自己的风格");

const fabricatedPunctuationPlan = structuredClone(repairedCopyPlan);
fabricatedPunctuationPlan.shots[1].materialRequirements[0].exactCopy = "自己的风格…";
const invalidCopyRun = await runWholeFilmAiDirector(baseInput(),
  dependencies([strategy, chapterOneShotPlan, fabricatedPunctuationPlan, fabricatedPunctuationPlan]));
assert.equal(invalidCopyRun.status, "blocked");
assert.match(invalidCopyRun.reason, /exactCopy:not-source-substring/u);
assert.equal(invalidCopyRun.gates.materialExecutionAllowed, false);

const wrongEvidencePlan = structuredClone(repairedCopyPlan);
wrongEvidencePlan.shots[1].materialRequirements[0].evidenceIds = ["current-text:cue-4"];
const evidenceRepairPrompts = [];
const evidenceRepairRun = await runWholeFilmAiDirector(baseInput(),
  dependencies([strategy, chapterOneShotPlan, wrongEvidencePlan, repairedCopyPlan], evidenceRepairPrompts));
assert.equal(evidenceRepairRun.status, "completed");
const evidenceFailure = evidenceRepairRun.traces.find((trace) => trace.reason?.includes("evidence-ids-not-applicable"));
assert.deepEqual(evidenceFailure.validationFeedback.rejectedShot.materialRequirements[0].evidenceIds, ["current-text:cue-4"]);
assert.deepEqual(evidenceRepairRun.plan.shots[3].materialRequirements[0].evidenceIds, []);
assert.equal(evidenceRepairRun.plan.shots[3].materialRequirements[0].exactCopy, "自己的风格");
assert.ok(evidenceRepairPrompts.at(-1).prompt.includes("not a source-text citation field"));
const repeatedEvidenceFailure = await runWholeFilmAiDirector(baseInput(),
  dependencies([strategy, chapterOneShotPlan, wrongEvidencePlan, wrongEvidencePlan]));
assert.equal(repeatedEvidenceFailure.status, "blocked");
assert.match(repeatedEvidenceFailure.reason, /evidence-ids-not-applicable/u);
assert.equal(repeatedEvidenceFailure.gates.materialExecutionAllowed, false);

const oversizedDiagramPlan = structuredClone(repairedCopyPlan);
oversizedDiagramPlan.shots[1].materialRequirements = [{id: "closing-copy", duty: "deterministic-diagram", evidenceIds: [], exactCopy: null,
  diagramSpec: {contract: "A1DeterministicDiagramSpec/v1", kind: "sequence", nodes: [
    {id: "before", label: `${longSourceInput.cues[3].sourceText.slice(0, 80)}虚构后缀`}, {id: "after", label: "自己的风格"},
  ], edges: [{from: "before", to: "after", relation: "before-after"}]}}];
const invalidDiagramRun = await runWholeFilmAiDirector(longSourceInput,
  dependencies([strategy, chapterOneShotPlan, oversizedDiagramPlan, oversizedDiagramPlan]));
assert.equal(invalidDiagramRun.status, "blocked");
assert.match(invalidDiagramRun.reason, /label:max-length-exceeded/u);

const fixedSkeleton = shotPlan.shots.map(({firstCueId, lastCueId, chapterId, editMode}) => ({firstCueId, lastCueId, chapterId, editMode}));
const fixedSkeletonPrompts = [];
const fixedSkeletonRun = await runWholeFilmAiDirector({
  ...baseInput(),
  strategyCandidate: {strategy},
  shotSkeletonCandidate: {shots: fixedSkeleton, provenance: {path: "/fixtures/approved-shot-boundaries.json", sha256: "d".repeat(64)}},
}, dependencies([chapterOneShotPlan, chapterTwoShotPlan], fixedSkeletonPrompts));
assert.equal(fixedSkeletonRun.status, "completed");
assert.equal(fixedSkeletonRun.plan.shots.length, fixedSkeleton.length);
assert.ok(fixedSkeletonPrompts.every((request) => request.prompt.includes("不得增删、合并、拆分或改换媒介")));
const changedSkeletonOutput = structuredClone(chapterOneShotPlan);
changedSkeletonOutput.shots[0].editMode = "presenter-clean";
const changedSkeletonRun = await runWholeFilmAiDirector({...baseInput(), strategyCandidate: {strategy}, shotSkeletonCandidate: {shots: fixedSkeleton}}, dependencies([changedSkeletonOutput, chapterTwoShotPlan]));
assert.equal(changedSkeletonRun.status, "blocked");
assert.match(changedSkeletonRun.reason, /shotSkeleton:C01:boundary-or-mode-changed/u);

const missingCueChapterTwoPlan = structuredClone(chapterTwoShotPlan);
missingCueChapterTwoPlan.shots = missingCueChapterTwoPlan.shots.slice(0, 1);
const coverageFailure = await runWholeFilmAiDirector(baseInput({
  presenterFootage: {status: "bound"},
  screenRecording: {status: "bound", sourceSha256: syntheticScreenSourceSha256,
    capabilityProfile: syntheticScreenCapabilityProfile},
  boundMaterialIds: ["presenter-take-opening", "capture-edit-one-sentence", "real-manuscript-object"],
}), dependencies([strategy, chapterOneShotPlan, missingCueChapterTwoPlan]));
assert.equal(coverageFailure.status, "blocked");
assert.equal(coverageFailure.aiDirected, false);
assert.equal(coverageFailure.blockedAt, "validation");
assert.match(coverageFailure.reason, /cue-coverage-failed/u);
assert.equal(coverageFailure.gates.shotRenderAllowed, false);

const strategyExecutionFailure = await runWholeFilmAiDirector(baseInput(), dependencies([new Error("strategy-provider-down")]));
assert.equal(strategyExecutionFailure.status, "blocked");
assert.equal(strategyExecutionFailure.blockedAt, "whole-film-strategy");
assert.equal(strategyExecutionFailure.aiDirected, false);
assert.equal(strategyExecutionFailure.traces.at(-1).status, "blocked");
assert.equal(strategyExecutionFailure.traces.at(-1).outputHash, null);

const articleFailure = await runWholeFilmAiDirector(baseInput(), {
  capabilityRunner: async () => ({available: true, version: "codex-test"}),
  articleUnderstandingRunner: async () => { throw new Error("article-director-down"); },
  structuredPassRunner: async () => { throw new Error("must-not-run"); },
});
assert.equal(articleFailure.status, "blocked");
assert.equal(articleFailure.blockedAt, "article-understanding");
assert.equal(articleFailure.traces.length, 0);

const unrelatedTimeline = await runWholeFilmAiDirector({
  ...baseInput(),
  articleText: "这是一篇只讨论火山监测、地震数据和撤离路线的完整文章。",
}, {
  capabilityRunner: async () => { throw new Error("alignment must block before capability"); },
});
assert.equal(unrelatedTimeline.status, "blocked");
assert.equal(unrelatedTimeline.blockedAt, "input");
assert.match(unrelatedTimeline.reason, /article-cue-alignment-blocked/u);

console.log(JSON.stringify({
  contract: "A1WholeFilmAiDirectorTest/v1",
  status: "PASS",
  checks: {
    twoLayerAiDirector: true,
    fullArticleAndCueContextInPrompts: true,
    exactCueCoverageFailsClosed: true,
    presenterScreenAndMaterialGates: true,
    perShotVisualDesignContract: true,
    noSilentFallback: true,
    validatedUpstreamArticleAnalysisReuse: true,
    fixedApprovedShotSkeletonPreserved: true,
    traceHashes: true,
    unrelatedArticleTimelineBlocked: true,
  },
}, null, 2));
