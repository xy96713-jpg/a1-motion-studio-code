#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assertEditorialShotDirector,
  compileEditorialShotDirector,
  EDITORIAL_PROGRAM_MODES,
  EDITORIAL_SHOT_ROUTES,
  inferPresenterMarkerGrammar,
  inferScreenActionGrammar,
  PACKAGE_EVENT_PHASES,
  PRESENTER_MARKER_GRAMMARS,
  SCREEN_ACTION_GRAMMARS,
} from "../apps/studio-next/src/lib/a1-editorial-shot-director-v1.mjs";
import {
  A1_CREATIVE_CORE_EXECUTION_OWNERS,
  assertCreativeCoreRoutePlan,
  compileCreativeCoreRoutePlan,
} from "../apps/studio-next/src/lib/a1-creative-core-route-plan-v1.mjs";
import {A1_HERO_TITLE_CARRIERS} from "../apps/studio-next/src/lib/a1-typography-role-authority-v1.mjs";

const timeline = [
  {shotId: "S-01", order: 1, sourceText: "人物开场"},
  {shotId: "S-02", order: 2, sourceText: "点击目标并查看结果"},
  {shotId: "S-03", order: 3, sourceText: "论文给出有限观察"},
  {shotId: "S-04", order: 4, sourceText: "先给材料，再找角度，最后动笔"},
  {shotId: "S-05", order: 5, sourceText: "人物继续讲述"},
];
const workspace = {
  workspaceSha256: "a".repeat(64),
  production: {
    shotVisualCoveragePlan: {shotPlans: timeline.map((item) => ({...item, route: item.shotId === "S-02" ? "SCREEN_EVIDENCE" : "PRESENTER_BASE", screenActions: item.shotId === "S-02" ? ["定位目标", "点击目标并查看结果"] : []}))},
    shotIntelligence: {
      wholeFilmStaticBoard: {
        items: [
          {shotId: "S-01", sourceText: "人物开场", presentationMode: "PRESENTER_INTEGRATED", sourceRole: "PRESENTER_BASE", styleLineage: {presenterBinding: {sha256: "b".repeat(64)}}},
          {shotId: "S-03", sourceText: "论文给出有限观察", presentationMode: "SOURCE_EVIDENCE_TAKEOVER", sourceRole: "REAL_SOURCE"},
          {shotId: "S-04", sourceText: "先给材料，再找角度，最后动笔", presentationMode: "MECHANISM_EXPLAINER", sourceRole: "GENERATED_EDITORIAL"},
        ],
        timelineBoard: {items: timeline},
      },
    },
  },
};

const modes = Object.values(EDITORIAL_PROGRAM_MODES);
const directors = modes.map((programMode) => assertEditorialShotDirector(compileEditorialShotDirector(workspace, {programMode, generatedAt: "2026-08-17T00:00:00.000Z"})));
for (const director of directors) {
  assert.equal(director.densityPolicy, "NO_FIXED_GLOBAL_RATIO_SEMANTIC_EVENTS_ONLY");
  assert.equal("targetPackagingRatio" in director, false);
  assert.deepEqual(director.packageEventPhases, PACKAGE_EVENT_PHASES);
  assert.equal(director.shots.find((shot) => shot.shotId === "S-01").route, EDITORIAL_SHOT_ROUTES.PRESENTER_LOCAL_MARKER);
  assert.equal(director.shots.find((shot) => shot.shotId === "S-02").route, EDITORIAL_SHOT_ROUTES.SCREEN_FOCUS);
  assert.equal(director.shots.find((shot) => shot.shotId === "S-02").screenAction.grammar, SCREEN_ACTION_GRAMMARS.SELECT_FOCUS);
  assert.equal(director.shots.find((shot) => shot.shotId === "S-03").route, EDITORIAL_SHOT_ROUTES.SOURCE_WINDOW);
  assert.equal(director.shots.find((shot) => shot.shotId === "S-04").route, EDITORIAL_SHOT_ROUTES.RELATION_GRAPH);
  assert.equal(director.shots.find((shot) => shot.shotId === "S-05").route, EDITORIAL_SHOT_ROUTES.PRESENTER_CLEAN);
}
assert.equal(new Set(directors.map((director) => director.profile.thesis)).size, modes.length);
assert.equal(inferScreenActionGrammar({expectedActionId: "paragraph", screenActions: ["输入需求", "写回正文"]}), SCREEN_ACTION_GRAMMARS.EDIT_REPLACE);
assert.equal(inferScreenActionGrammar({expectedActionId: "saveHistory", sourceText: "保存后重开还是最新版", screenActions: ["保存", "重开"]}), SCREEN_ACTION_GRAMMARS.COMPARE_BEFORE_AFTER);
assert.equal(inferScreenActionGrammar({expectedActionId: "review", screenActions: ["检查", "确认结果"]}), SCREEN_ACTION_GRAMMARS.CONFIRM_RESULT);
assert.equal(inferPresenterMarkerGrammar({sourceText: "我用 vibe coding 做了一款智能写作工作台"}), PRESENTER_MARKER_GRAMMARS.IDENTITY_LOCKUP);
assert.equal(inferPresenterMarkerGrammar({sourceText: "为什么不让它直接写完全文？"}), PRESENTER_MARKER_GRAMMARS.QUESTION_ECHO);
assert.equal(inferPresenterMarkerGrammar({sourceText: "中文确实顺一些，但问题并没有彻底解决"}), PRESENTER_MARKER_GRAMMARS.CONTRAST_CORRECTION);
assert.equal(inferPresenterMarkerGrammar({sourceText: "负责后台编排、整理主线，以及读取风格库"}), PRESENTER_MARKER_GRAMMARS.PROCESS_CLUSTER);
assert.equal(inferPresenterMarkerGrammar({sourceText: "把不方便的地方变成一套可控的工作流"}), PRESENTER_MARKER_GRAMMARS.PROBLEM_TO_CONTROL);

const heroWorkspace = {
  workspaceSha256: "c".repeat(64),
  production: {
    shotVisualCoveragePlan: {shotPlans: [
      {shotId: "H-01", order: 1, route: "PRESENTER_BASE", sourceText: "所以结论已经明确"},
      {shotId: "H-02", order: 2, route: "PRESENTER_BASE", sourceText: "中文顺了，但问题还在"},
    ]},
    shotIntelligence: {wholeFilmStaticBoard: {
      items: [
        {shotId: "H-01", sourceText: "所以结论已经明确", semanticEvent: "CONCLUSION", presentationMode: "PRESENTER_INTEGRATED", sourceRole: "PRESENTER_BASE", typographyActor: true, typographyVisualRole: "HERO_TAKEOVER", presenterSemanticValue: false, protectedPhrases: ["结论已经明确"], styleLineage: {presenterBinding: {sha256: "d".repeat(64)}}},
        {shotId: "H-02", sourceText: "中文顺了，但问题还在", semanticEvent: "STRONG_CONTRAST", presentationMode: "PRESENTER_INTEGRATED", sourceRole: "PRESENTER_BASE", typographyActor: true, typographyVisualRole: "PRESENTER_HEADLINE", presenterSemanticValue: true, protectedPhrases: ["中文顺了", "问题还在"], styleLineage: {presenterBinding: {sha256: "e".repeat(64)}}},
      ],
      timelineBoard: {items: [
        {shotId: "H-01", order: 1, sourceText: "所以结论已经明确"},
        {shotId: "H-02", order: 2, sourceText: "中文顺了，但问题还在"},
      ]},
    }},
  },
};
const heroDirector = assertEditorialShotDirector(compileEditorialShotDirector(heroWorkspace, {programMode: EDITORIAL_PROGRAM_MODES.LONG_TAKE_OPINION, generatedAt: "2026-08-18T00:00:00.000Z"}));
const fullscreenHero = heroDirector.shots.find((shot) => shot.shotId === "H-01");
const presenterHero = heroDirector.shots.find((shot) => shot.shotId === "H-02");
assert.equal(fullscreenHero.route, EDITORIAL_SHOT_ROUTES.TYPE_HIT);
assert.equal(fullscreenHero.heroTitlePresentation.carrier, A1_HERO_TITLE_CARRIERS.FULLSCREEN_HERO_TYPE);
assert.equal(presenterHero.route, EDITORIAL_SHOT_ROUTES.PRESENTER_LOCAL_MARKER);
assert.equal(presenterHero.heroTitlePresentation.carrier, A1_HERO_TITLE_CARRIERS.PRESENTER_HERO_TYPE);
assert.equal(presenterHero.presenterMarker.microphoneOverlapAllowed, true);
assert.equal(presenterHero.presenterMarker.protectionScope, "PRESENTER_FACE_AND_BODY_ONLY");

function blindWorkspace({sha, shots, packageItems}) {
  return {
    workspaceSha256: sha.repeat(64),
    production: {
      shotVisualCoveragePlan: {shotPlans: shots},
      shotIntelligence: {wholeFilmStaticBoard: {items: packageItems, timelineBoard: {items: shots}}},
    },
  };
}

const blindFixtureConfig = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../configs/creative-core-blind-fixtures-v1.json"), "utf8"));
assert.equal(blindFixtureConfig.contract, "A1CreativeCoreBlindFixtureSet/v1");
const blindFixtures = blindFixtureConfig.fixtures;

const blindResults = blindFixtures.map((fixture) => {
  const director = assertEditorialShotDirector(compileEditorialShotDirector(fixture.workspace, {programMode: fixture.mode, generatedAt: "2026-08-20T07:00:00.000Z"}));
  const plan = assertCreativeCoreRoutePlan(compileCreativeCoreRoutePlan(director, {generatedAt: "2026-08-20T07:01:00.000Z"}));
  assert.equal(plan.itemCount, 3);
  assert.equal(plan.registryTemplateCount, 8);
  assert.equal(plan.gates.motionRenderAllowed, false);
  assert.equal(plan.gates.productionAdmission, false);
  assert(plan.items.every((item) => item.exactCopy.length > 0 && item.status === "PLANNED_NOT_RENDERED"));
  return {id: fixture.id, genre: fixture.genre, programMode: plan.programMode, planSha256: plan.planSha256, executionOwnerCounts: plan.executionOwnerCounts, templateIds: plan.items.map((item) => item.templateId).filter(Boolean)};
});

const ownersCovered = new Set(blindResults.flatMap((result) => Object.entries(result.executionOwnerCounts).filter(([, count]) => count > 0).map(([owner]) => owner)));
assert.deepEqual([...ownersCovered].sort(), Object.values(A1_CREATIVE_CORE_EXECUTION_OWNERS).sort());
const runtimeSource = fs.readFileSync(path.resolve(import.meta.dirname, "../apps/studio-next/src/lib/a1-creative-core-route-plan-v1.mjs"), "utf8");
for (const fixture of blindFixtures) assert.equal(runtimeSource.includes(fixture.id), false, `runtime leaked fixture id: ${fixture.id}`);
for (const term of ["智能写作工作台", "ACL 2026", "ED-10"]) assert.equal(runtimeSource.includes(term), false, `runtime leaked topic term: ${term}`);

const longCopyWorkspace = blindWorkspace({
  sha: "4",
  shots: [{shotId: "L-01", order: 1, sourceText: "这是一段故意超过模板字数限制而且必须保持原文逐字不变的长句子用来确认编译器不会为了通过模板约束而偷偷截断正式文字同时也不能把后半段藏进未渲染字段冒充完整复制因为观众最终必须看到原文里的每一个字符", route: "PRESENTER_BASE"}],
  packageItems: [{shotId: "L-01", sourceText: "这是一段故意超过模板字数限制而且必须保持原文逐字不变的长句子用来确认编译器不会为了通过模板约束而偷偷截断正式文字同时也不能把后半段藏进未渲染字段冒充完整复制因为观众最终必须看到原文里的每一个字符", presentationMode: "FULLSCREEN_TYPOGRAPHY", sourceRole: "VERDICT", typographyActor: true, typographyVisualRole: "HERO_TAKEOVER", protectedPhrases: ["必须保持原文逐字不变"]}],
});
const longCopyDirector = assertEditorialShotDirector(compileEditorialShotDirector(longCopyWorkspace, {programMode: EDITORIAL_PROGRAM_MODES.LONG_TAKE_OPINION, generatedAt: "2026-08-20T07:00:00.000Z"}));
const longCopyPlan = compileCreativeCoreRoutePlan(longCopyDirector, {generatedAt: "2026-08-20T07:01:00.000Z"});
assert.equal(longCopyPlan.status, "REVIEW_ONLY_BLOCKED");
assert(longCopyPlan.failures.includes("EXACT_COPY_REQUIRES_SPLIT:L-01"));

console.log(JSON.stringify({status: "PASS", contract: "A1EditorialShotDirectorTest/v3", modes, routeCount: Object.keys(EDITORIAL_SHOT_ROUTES).length, actionGrammars: Object.values(SCREEN_ACTION_GRAMMARS), presenterMarkerGrammars: Object.values(PRESENTER_MARKER_GRAMMARS), fixedDensityTargetPresent: false, creativeCore: {contract: "A1CreativeCoreRoutePlan/v1", genreCount: blindResults.length, executionOwners: [...ownersCovered].sort(), results: blindResults, exactCopyNegativePath: "PASS"}}, null, 2));
