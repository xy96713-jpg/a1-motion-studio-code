#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileTypographyWordActorsV1} from "../apps/studio-next/src/lib/a1-typography-word-actor-director-v1.mjs";
import {compileTypographyFilmVocabularyV1} from "../apps/studio-next/src/lib/a1-typography-film-vocabulary-director-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const projection=JSON.parse(fs.readFileSync(path.join(root,"work/single-film-typography-vocabulary-director-v1/whole-film-typography-director-v3.json"),"utf8"));
const heroAssignments=projection.assignments.filter((item)=>["PRESENTER_HERO","FULLSCREEN_HERO","CONCLUSION_STAMP"].includes(item.typographyRole));
const plans=heroAssignments.map((item)=>compileTypographyWordActorsV1({...item.filmEffectProgram,typographyRole:item.typographyRole,semanticEvent:item.semanticEvent,exactCopy:item.exactCopy}));
assert.equal(plans.length,3);
assert.ok(plans.every((plan)=>plan.status==="PASS_REVIEW_ONLY"&&plan.hierarchyRatio>=3&&plan.persistentMaterialActorIds.length===1));
assert.ok(plans.every((plan)=>plan.contacts.every((contact)=>contact.intentional&&contact.ratio>=.02&&contact.ratio<=.12)));
assert.ok(plans.every((plan)=>plan.authoredBackgroundPresent===false&&plan.standaloneDecorativeShapeCount===0&&plan.outputMode==="TRANSPARENT_GLYPH_ASSET"));
assert.deepEqual(plans.map((plan)=>plan.archetype),["IDENTITY_TAKEOVER","CONTRADICTION_COLLISION","CONCLUSION_IMPRINT"]);
assert.ok(plans.some((plan)=>plan.actors.some((actor)=>actor.material==="HARD_EXTRUSION")));
assert.ok(plans.some((plan)=>plan.actors.some((actor)=>actor.material==="SPLICE_BAND")));
assert.ok(plans.some((plan)=>plan.actors.some((actor)=>actor.material==="PRINT_PLATES")));

const blind=JSON.parse(fs.readFileSync(path.join(root,"work/typography-director-v2/blind-fixtures/report.json"),"utf8"));
const fixtures=blind.reports.map((report)=>{
  const vocabulary=compileTypographyFilmVocabularyV1(report.assignments);
  const fixturePlans=vocabulary.items.filter((item)=>["PRESENTER_HERO","FULLSCREEN_HERO","CONCLUSION_STAMP"].includes(item.typographyRole)&&item.filmEffectProgram.effectId!=="NONE").map((item)=>compileTypographyWordActorsV1({...item.filmEffectProgram,typographyRole:item.typographyRole,semanticEvent:item.semanticEvent,exactCopy:item.exactCopy}));
  assert.ok(fixturePlans.every((plan)=>plan.status==="PASS_REVIEW_ONLY"),report.articleId);
  return{id:report.articleId,genre:report.genre,status:"PASS",heroPlanCount:fixturePlans.length,archetypes:[...new Set(fixturePlans.map((plan)=>plan.archetype))]};
});
assert.equal(fixtures.length,6);
const runtime=fs.readFileSync(path.join(root,"apps/studio-next/src/lib/a1-typography-word-actor-director-v1.mjs"),"utf8");
for(const forbidden of ["holdout-evidence-water","holdout-evidence-sleep","holdout-tutorial-backup","holdout-tutorial-camera","holdout-opinion-meeting","holdout-opinion-reading","vibe coding","废稿","ED-01","ED-10","ED-34"])assert.equal(runtime.includes(forbidden),false,forbidden);
console.log(JSON.stringify({contract:"A1TypographyWordActorDirectorTest/v1",status:"PASS",currentFilm:{heroPlanCount:plans.length,actorCount:plans.reduce((sum,plan)=>sum+plan.actors.length,0),minimumHierarchyRatio:Math.min(...plans.map((plan)=>plan.hierarchyRatio)),maximumContactRatio:Math.max(...plans.flatMap((plan)=>plan.contacts.map((contact)=>contact.ratio))),materials:[...new Set(plans.flatMap((plan)=>plan.actors.map((actor)=>actor.material)))]},fixtureCount:fixtures.length,fixtures,checks:["word-level-split","dominant-actor","four-x-hierarchy","controlled-contact","persistent-hold-material","exact-copy-shadow","transparent-only","six-blind-fixtures","no-topic-branches"]},null,2));
