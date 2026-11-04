#!/usr/bin/env node
import assert from "node:assert/strict";
import {assertProjectVisualBiblePack, buildProjectVisualBiblePack} from "../apps/studio-next/src/lib/a1-project-visual-bible-v1.mjs";

const presenterPackage = {intensity: "none", keyPhrases: [], spatialAnchor: "negative-space", faceSafeZone: "LOCK_EYES_AND_MOUTH", occlusionRule: "保护脸部"};
const naPackage = {intensity: "not-applicable", keyPhrases: [], spatialAnchor: "not-applicable", faceSafeZone: "not-applicable", occlusionRule: "not-applicable"};
const plan = {
  contract: "A1WholeFilmAiDirectorPlan/v1",
  projectId: "unseen-article-fixture",
  source: {title: "未见文章", articleSha256: "a".repeat(64), timelineSha256: "b".repeat(64), srtSha256: "c".repeat(64), timelineAuthority: "corrected-srt", cueCount: 3, durationMs: 6000},
  articleUnderstanding: {thesis: "真实判断必须进入工作流"},
  strategy: {visualThesis: "人物给出立场，真实屏幕完成证明，包装只解释抽象因果。", presenterRole: "建立可信立场", screenRole: "证明真实操作", packageRole: "解释抽象机制", typeOnlyRule: "只用于终句", rhythmArc: ["人物", "操作", "判断"], globalRules: ["禁止假界面"]},
  chapters: [{chapterId: "C01", title: "从人到动作", firstCueId: 1, lastCueId: 3, narrativeArc: "立场、动作、结论"}],
  shots: [
    {shotId: "ED-01", order: 1, chapterId: "C01", editMode: "presenter-clean", editWindow: {startMs: 0, endMs: 2000, durationMs: 2000}, sourceText: "我先说明我的判断", visualJob: "建立可信立场", primaryActor: "presenter-face", materialRoute: "presenter-real-footage", topology: "presenter-clean-frame", typographyRole: "none", keyPhrases: [], layoutConstraints: ["保护眼睛和嘴"], motionPhrase: "人物自然开口后硬切真实界面", handoffActor: "hard-cut-to-real-screen", structureDirections: ["正面中近景", "带真实桌面的侧前方中景"], requiredMaterialIds: ["presenter-opening"], missingMaterialIds: ["presenter-footage"], materialGate: "BLOCKED_MEDIA_MISSING", fallbackPolicy: "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD", presenterPackage},
    {shotId: "ED-02", order: 2, chapterId: "C01", editMode: "screen-demo", editWindow: {startMs: 2000, endMs: 4000, durationMs: 2000}, sourceText: "选择一句并改写", visualJob: "证明真实操作", primaryActor: "selected-sentence", materialRoute: "real-screen-capture", topology: "source-action-detail", typographyRole: "source-interface-text-only", keyPhrases: ["选择一句"], layoutConstraints: ["保持界面文字可读"], motionPhrase: "选区出现，句子就地改写，结果在原位确认", handoffActor: "selected-sentence", structureDirections: ["局部推近", "屏幕上下文与选区双层裁切"], requiredMaterialIds: ["screen-edit-action"], missingMaterialIds: ["screen-recording"], materialGate: "BLOCKED_MEDIA_MISSING", fallbackPolicy: "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD", presenterPackage: naPackage},
    {shotId: "ED-03", order: 3, chapterId: "C01", editMode: "type-only", editWindow: {startMs: 4000, endMs: 6000, durationMs: 2000}, sourceText: "最后仍要由人判断", visualJob: "留下终句", primaryActor: "由人判断", materialRoute: "editable-typography", topology: "typographic-field", typographyRole: "quiet-verdict", keyPhrases: ["由人判断"], layoutConstraints: ["大面积留黑"], motionPhrase: "选中句收束成由人判断，停住后切黑", handoffActor: "hard-cut-to-black", structureDirections: ["孤立字形", "边缘窄行字块"], requiredMaterialIds: [], missingMaterialIds: [], materialGate: "READY_FOR_DESIGN_AFTER_PLAN_APPROVAL", fallbackPolicy: "BLOCK_DO_NOT_SUBSTITUTE_GENERIC_CARD", presenterPackage: naPackage},
  ],
  coverage: {exact: true, editTimelineContinuous: true},
};

const pack = assertProjectVisualBiblePack(buildProjectVisualBiblePack({plan, planSha256: "d".repeat(64), compiledAt: "2026-07-30T00:00:00.000Z"}));
assert.equal(pack.source.shotCount, 3);
assert.equal(pack.shotBlueprints.length, 3);
assert.equal(pack.shotBlueprints[1].primaryActor, "selected-sentence");
assert.equal(pack.typographyDirection.shotAssignments.length, 3);
assert.ok(pack.assetBriefs.counts.total >= 10);
assert.ok(pack.assetBriefs.items.some((item) => item.route === "real-presenter-source"));
assert.ok(pack.assetBriefs.items.some((item) => item.route === "real-screen-source"));
assert.ok(pack.assetBriefs.items.every((item) => !/fake|generic-card/u.test(item.sourcePolicy)));
assert.equal(pack.gates.assetGenerationAllowed, false);

const incomplete = structuredClone(plan);
delete incomplete.shots[1].topology;
assert.throws(() => buildProjectVisualBiblePack({plan: incomplete}), /shot-field-missing:ED-02:topology/u);

console.log(JSON.stringify({contract: "A1ProjectVisualBibleTest/v1", status: "PASS", checks: {dynamicShotCount: true, aiVisualContractConsumed: true, realMediaSlotsCreated: true, assetAndRenderGatesLocked: true, incompleteDirectorPlanFailsClosed: true}}, null, 2));
