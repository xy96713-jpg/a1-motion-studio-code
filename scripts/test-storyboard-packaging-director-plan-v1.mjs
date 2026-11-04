#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import {assertStoryboardPackagingDirectorPlan, compileStoryboardPackagingDirectorPlan, resolveSemanticActors} from "../apps/studio-next/src/lib/a1-storyboard-packaging-director-plan-v1.mjs";
const videoShotcraftCatalog = JSON.parse(fs.readFileSync(new URL("../apps/studio-next/src/data/video-shotcraft-catalog-v1.json", import.meta.url), "utf8"));

const fixture = (route, source, hold, packageType = "EXPLAINER_PACKAGE") => ({contract: "A1CurrentStoryboardAuthority/v1", current: true, lastRevisionSha256: "a".repeat(64), shots: [{shotId: "ED-01", order: 1, route, source, packageType, versionId: "fixture-v1", artifactSha256: "b".repeat(64), sourceText: hold, semanticJob: "one semantic actor", actionContract: {before: "neutral", hold, after: "hold", handoff: "next"}, motionDesignContract: {executionRoute: route === "SCREEN_EVIDENCE" ? "SCREEN_CAP_NATIVE" : "LOCAL_DETERMINISTIC_MOTION", exactIdentityBinding: route === "PACKAGE_LOOK_MASTER", formalCopyRequired: route === "PACKAGE_LOOK_MASTER", visualConstructionContract: {independentElementAnimation: "REQUIRES_VERIFIED_ALPHA_SOURCE", safeFallback: "STATIC_CURRENT_STORYBOARD_HOLD"}}}]});
const cases = [fixture("PACKAGE_LOOK_MASTER", "GENERATED_EDITORIAL", "GPT、Claude、Kimi、DeepSeek、智谱按顺序"), fixture("SCREEN_EVIDENCE", "REAL_SOURCE", "select then hold"), fixture("PRESENTER_BASE", "REAL_SOURCE", "presenter speaks"), fixture("PACKAGE_LOOK_MASTER", "REAL_SOURCE", "evidence remains bound")];
for (const item of cases) {
  const plan = assertStoryboardPackagingDirectorPlan(compileStoryboardPackagingDirectorPlan(item));
  assert.equal(plan.status, "READY");
  assert.equal(plan.execution.userCorrectionLoop, false);
  assert.equal(plan.shots[0].composition.grammar, "ONE_LIST_SAME_SCALE_NO_CARD_UNITS");
}
const ordered = compileStoryboardPackagingDirectorPlan(cases[0]).shots[0].orderedActorTimeline;
assert.deepEqual(ordered.map((item) => item.actorId), ["GPT", "Claude", "Kimi", "DeepSeek", "智谱"]);
const blocked = compileStoryboardPackagingDirectorPlan({...cases[0], shots: [{...cases[0].shots[0], artifactSha256: null}]});
assert.equal(blocked.status, "BLOCKED");
assert.equal(blocked.execution.renderOnlyAfterPlanPass, true);
const shotcraftPlan = assertStoryboardPackagingDirectorPlan(compileStoryboardPackagingDirectorPlan(cases[1], {videoShotcraftCatalog, shotcraftContextForShot: () => ({genre: "product-tutorial", intentId: "single-click-trigger", shotFunction: "action", route: "SCREEN_EVIDENCE", needs: ["cursor", "click", "ui"], evidence: {cursorTelemetry: true, clickTelemetry: true, realSurface: true, highDpi: true, beforeAfterStates: true, beatGrid: true}})}));
assert.equal(shotcraftPlan.shotcraftSelectedCount, 1);
assert.equal(shotcraftPlan.execution.existingRecipeFirst, true);
assert.equal(shotcraftPlan.shots[0].rendererPolicy.motionAuthoringPolicy, "EXISTING_RECIPE_FIRST");
assert.equal(shotcraftPlan.shots[0].videoShotcraftSelection.policy.handAuthoring, "FORBIDDEN_WHILE_EXISTING_RECIPE_FITS");
assert.deepEqual(shotcraftPlan.shots[0].moduleInvocationPlan.modules, {
  screenCapture: "REQUIRED",
  externalSource: "SKIP",
  typography: "SKIP",
  composition: "REQUIRED",
});

const semanticFixtures = [
  {genre: "evidence-explainer", sourceText: "水资源、睡眠质量、工作压力依次影响判断", expected: ["水资源", "睡眠质量", "工作压力"]},
  {genre: "product-tutorial", sourceText: "选择相机、镜头、三脚架，然后确认设置", expected: ["相机", "镜头", "三脚架"]},
  {genre: "personal-opinion", sourceText: "真正的问题不是工具，而是你如何判断结果", expected: ["工具", "你如何判断结果"]},
];
for (const fixture of semanticFixtures) {
  const resolved = resolveSemanticActors({sourceText: fixture.sourceText, actionContract: {hold: fixture.sourceText}});
  assert.equal(resolved.status, "DERIVED");
  assert.deepEqual(resolved.actors, fixture.expected);
  const plan = compileStoryboardPackagingDirectorPlan({
    contract: "A1CurrentStoryboardAuthority/v1",
    current: true,
    lastRevisionSha256: "c".repeat(64),
    shots: [{...cases[0].shots[0], shotId: `SEMANTIC-${fixture.genre}`, route: "PACKAGE_LOOK_MASTER", sourceText: fixture.sourceText, actionContract: {before: "before", hold: fixture.sourceText, after: "after", handoff: "next"}}],
  });
  assert.equal(plan.status, "READY");
  assert.deepEqual(plan.shots[0].orderedActorTimeline.map((item) => item.actorId), fixture.expected);
}
const sourceShot = compileStoryboardPackagingDirectorPlan({
  ...cases[0],
  shots: [{...cases[0].shots[0], route: "PACKAGE_LOOK_MASTER", source: "REAL_SOURCE", packageType: "EXPLAINER_PACKAGE", motionDesignContract: {...cases[0].shots[0].motionDesignContract, formalCopyRequired: false, exactIdentityBinding: false}}],
});
assert.equal(sourceShot.shots[0].moduleInvocationPlan.modules.externalSource, "REQUIRED");
assert.equal(sourceShot.shots[0].moduleInvocationPlan.modules.typography, "SKIP");
const typographyShot = compileStoryboardPackagingDirectorPlan({
  ...cases[0],
  shots: [{...cases[0].shots[0], route: "PACKAGE_LOOK_MASTER", source: "IMAGEGEN_WITH_LOCAL_FORMAL_TYPOGRAPHY", packageType: "TYPOGRAPHY_PACKAGE"}],
});
assert.equal(typographyShot.shots[0].moduleInvocationPlan.modules.typography, "REQUIRED");
const unresolved = compileStoryboardPackagingDirectorPlan({
  ...cases[0],
  shots: [{...cases[0].shots[0], sourceText: "依次影响判断", actionContract: {before: "before", hold: "依次影响判断", after: "after", handoff: "next"}}],
});
assert.equal(unresolved.status, "BLOCKED");
assert.deepEqual(unresolved.shots[0].failures, ["SEMANTIC_ACTORS_UNRESOLVED"]);
assert.equal(unresolved.shots[0].moduleInvocationPlan.status, "BLOCKED");
console.log(JSON.stringify({status: "PASS", contract: "A1StoryboardPackagingDirectorPlanTest/v1", fixtureGenres: cases.length, speechOrderCompiled: true, singleBatchCompile: true, userCorrectionLoop: false, blockedBeforeRender: true, videoShotcraftBound: true, existingRecipeFirst: true}, null, 2));
