#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileTypographyArticleDecisionPlanV1} from "../apps/studio-next/src/lib/a1-typography-article-decision-plan-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const fixture=JSON.parse(fs.readFileSync(path.join(root,"work/typography-director-v2/blind-fixtures/report.json"),"utf8"));
assert.equal(fixture.reports.length,6);
const plans=fixture.reports.map((report)=>compileTypographyArticleDecisionPlanV1({
  articleId:report.articleId,genre:report.genre,programMode:report.assignments[0].programMode,assignments:report.assignments,
}));
assert.equal(new Set(plans.map((plan)=>plan.genre)).size,3);
assert.ok(plans.every((plan)=>plan.contract==="A1TypographyArticleDecisionPlan/v1"&&plan.proofBoundary.productionAdmission===false));
assert.ok(plans.every((plan)=>plan.summary.shotCount===8&&plan.summary.sequenceFailureCount===0));
assert.ok(plans.every((plan)=>plan.decisions.every((item)=>item.neighboringBeats.previousShotId!==item.shotId&&item.neighboringBeats.nextShotId!==item.shotId)));
assert.ok(plans.every((plan)=>plan.decisions.every((item)=>item.userStyle?.contract==="A1TypographyUserStyleProfile/v1")));
assert.ok(plans.flatMap((plan)=>plan.decisions).every((item)=>item.userStyle.selectedReferenceCell!=="06"));
assert.ok(plans.every((plan)=>plan.styleSequencePlan.rules.some((rule)=>rule.includes("never force a hero"))));
assert.ok(plans.every((plan)=>plan.styleSequencePlan.beats.length===plan.summary.shotCount));
assert.ok(plans.every((plan)=>plan.decisions.filter((item)=>item.typeRoute==="NO_TYPE").every((item)=>item.familyDecision.status==="SKIP")));
assert.ok(plans.every((plan)=>plan.decisions.filter((item)=>item.typeRoute==="SOURCE_BOUND_COPY").every((item)=>item.familyDecision.status==="ROUTE_SOURCE_COPY")));
assert.ok(plans.every((plan)=>plan.decisions.filter((item)=>item.familyDecision.selectedFamilyId).every((item)=>item.familyDecision.sourceContextProvided===false&&item.nextAction==="BIND_REAL_FRAME_AND_ADJACENT_SHOTS")));
assert.ok(plans.flatMap((plan)=>plan.decisions).some((item)=>item.familyDecision.selectedFamilyId));
assert.ok(plans.flatMap((plan)=>plan.decisions).some((item)=>item.typeRoute==="SOURCE_BOUND_COPY"));

const sourceFrameSha="a".repeat(64);
const assignment={shotId:"explicit-frame-test",programMode:"PRODUCT_TUTORIAL",typographyRole:"PRESENTER_HERO",semanticEvent:"IDENTITY",
  carrier:"PRESENTER_DEPTH_HERO",exactCopy:"智能写作工作台",displayCopy:"智能写作工作台",
  displayGroups:{headline:"智能写作",support:"工作台",caption:""},fontConfiguration:{primaryFontId:"source-han-sans-heavy"}};
const context={contract:"A1TypographyShotVisualContext/v1",carrierMode:"FOOTAGE",frame:{sha256:sourceFrameSha,width:1920,height:1080},
  geometryEvidence:{method:"SYNTHETIC_TEST_FIXTURE_ONLY",frameSha256:sourceFrameSha},protectedRegions:[{id:"person",box:{x:.58,y:.08,width:.36,height:.84}}],
  availableRegions:[{id:"left-negative-space",box:{x:.04,y:.12,width:.48,height:.7},visualSuitability:.9}],anchors:[]};
const bound=compileTypographyArticleDecisionPlanV1({articleId:"unit-test",genre:"personal-opinion",programMode:"LONG_TAKE_OPINION",assignments:[assignment],shotVisualContexts:{[assignment.shotId]:context}});
assert.equal(bound.decisions[0].sourceFrameSha256,sourceFrameSha);
assert.equal(bound.decisions[0].familyDecision.sourceContextProvided,true);
assert.equal(bound.decisions[0].familyDecision.layoutEvidence,"SOURCE_CONTEXT_BOUND");
assert.equal(bound.decisions[0].composition.status,"PASS_REVIEW_ONLY");
assert.equal(bound.decisions[0].userStyle.selectedReferenceCell,"01");
assert.deepEqual(bound.decisions[0].userStyle.preferredFamilyIds,["HEAVY_GOTHIC","COMPRESSED_MING"]);
assert.ok(bound.decisions[0].familyDecision.candidates.find((candidate)=>candidate.familyId==="HEAVY_GOTHIC")?.reasons.includes("USER_FAMILY_PREFERENCE_MATCH"));
assert.equal(bound.styleSequencePlan.counts.strongType,1);
assert.equal(bound.proofBoundary.productionAdmission,false);

console.log(JSON.stringify({contract:"A1TypographyArticleDecisionPlanTest/v1",status:"PASS",articleCount:plans.length,genres:[...new Set(plans.map((plan)=>plan.genre))],
  beatCount:plans.reduce((sum,plan)=>sum+plan.summary.shotCount,0),familySelections:plans.reduce((sum,plan)=>sum+plan.summary.familySelections,0),
  actualFixtureFrameBindings:0,checks:["six-blind-articles-three-genres","role-family-sequence-joined","no-type-and-source-copy-stay-quiet","missing-frame-never-claims-visual-readiness","explicit-context-binds-layout-and-copy","production-admission-remains-false"]},null,2));
