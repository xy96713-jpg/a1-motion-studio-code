#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileTypographyFilmVocabularyV1,typographyFilmModeBudgetsV1} from "../apps/studio-next/src/lib/a1-typography-film-vocabulary-director-v1.mjs";
import {typographyEffectCatalog} from "../apps/studio-next/src/lib/a1-typography-effect-authority-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const current=JSON.parse(fs.readFileSync(path.join(root,"work/typography-director-v2/whole-film-typography-duty-map.json"),"utf8"));
const compiled=compileTypographyFilmVocabularyV1(current.assignments);
assert.equal(compiled.status,"PASS_REVIEW_ONLY");
assert.equal(typographyEffectCatalog().length,10);
assert.equal(compiled.vocabularyPlan.primaryProgramMode,"PRODUCT_TUTORIAL");
assert.equal(compiled.vocabularyPlan.activeEffectFamilyCount,5);
assert.deepEqual(compiled.vocabularyPlan.activeEffectIds,["EVA_COMPRESS","SPLICE_REASSEMBLE","PRINT_REGISTRATION","CLEAN_EDITORIAL","PIXEL_TRACKING_LOCK"]);
assert.equal(compiled.ledger.treatedShotCount,7);
assert.equal(compiled.ledger.noEffectShotCount,27);
assert.equal(compiled.ledger.failures.length,0);
assert.equal(compiled.vocabularyPlan.functionalEventCount,2);
assert.equal(compiled.vocabularyPlan.microEventCount,2);
assert.ok(compiled.items.filter((item)=>["NO_TYPE","SOURCE_NATIVE","CAPTION","EVIDENCE_HIGHLIGHT"].includes(item.typographyRole)).every((item)=>item.filmEffectProgram.effectId==="NONE"));
assert.ok(compiled.items.filter((item)=>item.filmEffectProgram.effectId!=="NONE").every((item)=>item.filmEffectProgram.outputMode==="TRANSPARENT_GLYPH_ASSET"&&item.filmEffectProgram.typographyOnly===true));
for(let index=1;index<compiled.items.length;index+=1)assert.ok(compiled.items[index-1].filmEffectProgram.effectId==="NONE"||compiled.items[index].filmEffectProgram.effectId==="NONE",`adjacent:${index}`);
for(let start=0;start<compiled.items.length;start+=1)assert.ok(compiled.items.slice(start,start+6).filter((item)=>item.filmEffectProgram.intensity==="HIGH").length<=1,`high-window:${start}`);
const marker=compiled.items.find((item)=>item.filmEffectProgram.effectId==="PIXEL_TRACKING_LOCK");
assert.ok(marker.filmEffectProgram.effectDisplayGroups.every((line)=>[...line.replace(/\s/gu,"")].length<=10));

const blind=JSON.parse(fs.readFileSync(path.join(root,"work/typography-director-v2/blind-fixtures/report.json"),"utf8"));
const fixtures=blind.reports.map((report)=>{
  const result=compileTypographyFilmVocabularyV1(report.assignments);
  const budget=typographyFilmModeBudgetsV1()[result.vocabularyPlan.primaryProgramMode];
  assert.equal(result.status,"PASS_REVIEW_ONLY",report.articleId);
  assert.ok(result.vocabularyPlan.activeEffectFamilyCount<=budget.maximumEffectFamilies,report.articleId);
  assert.ok(result.ledger.treatedShotCount<=result.vocabularyPlan.budget.maximumTreatedShots,report.articleId);
  assert.ok(result.items.filter((item)=>["NO_TYPE","SOURCE_NATIVE","CAPTION","EVIDENCE_HIGHLIGHT"].includes(item.typographyRole)).every((item)=>item.filmEffectProgram.effectId==="NONE"),report.articleId);
  return {id:report.articleId,genre:report.genre,status:"PASS",activeEffectIds:result.vocabularyPlan.activeEffectIds,treatedShotCount:result.ledger.treatedShotCount};
});
assert.equal(fixtures.length,6);
const runtime=fs.readFileSync(path.join(root,"apps/studio-next/src/lib/a1-typography-film-vocabulary-director-v1.mjs"),"utf8");
for(const forbidden of ["holdout-evidence-water","holdout-evidence-sleep","holdout-tutorial-backup","holdout-tutorial-camera","holdout-opinion-meeting","holdout-opinion-reading","vibe coding","废稿","ED-01","ED-10","ED-34"])assert.equal(runtime.includes(forbidden),false,forbidden);
console.log(JSON.stringify({contract:"A1TypographyFilmVocabularyDirectorTest/v1",status:"PASS",currentFilm:{effectFamilyCount:compiled.vocabularyPlan.activeEffectFamilyCount,treatedShotCount:compiled.ledger.treatedShotCount,noEffectShotCount:compiled.ledger.noEffectShotCount,selectedShotIds:compiled.ledger.selectedShotIds},fixtureCount:fixtures.length,fixtures,checks:["global-library-ten","single-film-three-to-five","necessity-first","source-native-protected","copy-compressibility","functional-budget","micro-budget","adjacent-fatigue","six-beat-high-budget","transparent-output","no-topic-branches"]},null,2));

