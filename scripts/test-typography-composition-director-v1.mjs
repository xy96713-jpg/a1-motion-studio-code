#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileTypographyCompositionV1,typographyCompositionRecipeIdsV1} from "../apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs";
import {compileTypographyFilmVocabularyV1} from "../apps/studio-next/src/lib/a1-typography-film-vocabulary-director-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const projection=JSON.parse(fs.readFileSync(path.join(root,"work/single-film-typography-vocabulary-director-v1/whole-film-typography-director-v3.json"),"utf8"));
const selected=projection.assignments.filter((item)=>item.filmEffectProgram.effectId!=="NONE");
const plans=selected.map((item)=>compileTypographyCompositionV1({...item.filmEffectProgram,typographyRole:item.typographyRole,semanticEvent:item.semanticEvent}));
assert.equal(plans.length,7);
assert.ok(plans.every((plan)=>plan.status==="PASS_REVIEW_ONLY"&&plan.ordinaryOverlapCount===0&&plan.authoredBackgroundPresent===false&&plan.standaloneDecorativeShapeCount===0));
assert.equal(new Set(plans.map((plan)=>plan.recipeId)).size,7);
assert.ok(plans.every((plan)=>Number.isInteger(plan.dominantGroupIndex)&&plan.groups[plan.dominantGroupIndex]));
assert.ok(new Set(plans.flatMap((plan)=>plan.groups.map((group)=>group.horizontalAlign))).has("LEFT"));
assert.ok(new Set(plans.flatMap((plan)=>plan.groups.map((group)=>group.horizontalAlign))).has("RIGHT"));
assert.ok(plans.filter((plan)=>plan.groups.length>1).every((plan)=>new Set(plan.groups.map((group)=>group.fontScale)).size>1));
const verdict=plans.find((plan)=>plan.recipeId==="VERDICT_SCALE_COLLISION");
assert.deepEqual(verdict.groups.map((group)=>group.effectOwnership),["CLEAN_EDITORIAL","SPLICE_REASSEMBLE"]);
const conclusion=plans.find((plan)=>plan.recipeId==="IMPRINT_ASCENDING_STACK");
assert.equal(conclusion.groups.at(-1).effectOwnership,"PRINT_REGISTRATION");

const blind=JSON.parse(fs.readFileSync(path.join(root,"work/typography-director-v2/blind-fixtures/report.json"),"utf8"));
const fixtures=blind.reports.map((report)=>{
  const vocabulary=compileTypographyFilmVocabularyV1(report.assignments);
  const fixturePlans=vocabulary.items.filter((item)=>item.filmEffectProgram.effectId!=="NONE").map((item)=>compileTypographyCompositionV1({...item.filmEffectProgram,typographyRole:item.typographyRole,semanticEvent:item.semanticEvent}));
  assert.ok(fixturePlans.every((plan)=>plan.status==="PASS_REVIEW_ONLY"),report.articleId);
  return{id:report.articleId,genre:report.genre,status:"PASS",recipeIds:[...new Set(fixturePlans.map((plan)=>plan.recipeId))],compositionCount:fixturePlans.length};
});
assert.equal(fixtures.length,6);
const runtime=fs.readFileSync(path.join(root,"apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs"),"utf8");
for(const forbidden of ["holdout-evidence-water","holdout-evidence-sleep","holdout-tutorial-backup","holdout-tutorial-camera","holdout-opinion-meeting","holdout-opinion-reading","vibe coding","废稿","ED-01","ED-10","ED-34"])assert.equal(runtime.includes(forbidden),false,forbidden);
const report={contract:"A1TypographyCompositionDirectorTest/v1",status:"PASS",recipeCatalogCount:typographyCompositionRecipeIdsV1().length,currentFilm:{compositionCount:plans.length,uniqueRecipeCount:new Set(plans.map((plan)=>plan.recipeId)).size,recipeIds:plans.map((plan)=>plan.recipeId),alignmentModes:[...new Set(plans.flatMap((plan)=>plan.groups.map((group)=>group.horizontalAlign)))]},fixtureCount:fixtures.length,fixtures,checks:["role-specific-recipes","dominant-group","scale-hierarchy","left-right-alignment","per-group-effect-ownership","zero-ordinary-overlap","safe-area","transparent-glyph-only","six-blind-fixtures","no-topic-branches"],productionAdmission:false};
fs.mkdirSync(path.join(root,"work/semantic-typography-composition-director-v1"),{recursive:true});
fs.writeFileSync(path.join(root,"work/semantic-typography-composition-director-v1/blind-fixture-report.json"),`${JSON.stringify({contract:"A1TypographyCompositionBlindFixtureReport/v1",status:"PASS",fixtures,productionAdmission:false},null,2)}\n`,`utf8`);
console.log(JSON.stringify(report,null,2));

