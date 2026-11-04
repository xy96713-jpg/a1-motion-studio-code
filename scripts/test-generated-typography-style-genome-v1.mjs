#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileGeneratedTypographyStyleGenomeV1,generatedTypographyArchetypeCatalogV1,generatedTypographyModeProfilesV1} from "../apps/studio-next/src/lib/a1-generated-typography-style-genome-v1.mjs";
import {compileTypographyFilmVocabularyV1} from "../apps/studio-next/src/lib/a1-typography-film-vocabulary-director-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const roles=[
  ["PRESENTER_HERO","IDENTITY","身份名称\n工作方法"],
  ["NO_TYPE","ORDINARY",""],
  ["SOURCE_NATIVE","EVIDENCE","真实来源页面"],
  ["FULLSCREEN_HERO","VERDICT","看起来完整\n但没有判断"],
  ["NO_TYPE","ORDINARY",""],
  ["EVIDENCE_TRANSLATION","EVIDENCE","样本范围\n关键变化\n结论边界"],
  ["NO_TYPE","ORDINARY",""],
  ["EXPLANATION_DIAGRAM","PROCESS","先检查\n再比较\n最后判断"],
  ["NO_TYPE","ORDINARY",""],
  ["PRESENTER_MARKER","QUESTION","问题在哪"],
  ["NO_TYPE","ORDINARY",""],
  ["CONCLUSION_STAMP","CONCLUSION","保留证据\n形成自己的判断"],
];
const fixture=(mode)=>roles.map(([typographyRole,semanticEvent,exactCopy],index)=>({
  shotId:`${mode.toLowerCase()}-${String(index+1).padStart(2,"0")}`,
  programMode:mode,
  typographyRole,
  semanticEvent,
  carrier:typographyRole==="SOURCE_NATIVE"?"REAL_SOURCE_SURFACE":typographyRole==="NO_TYPE"?"NONE":"SEMANTIC_ATTACHED",
  exactCopy,
  displayCopy:exactCopy,
}));

const modes=Object.keys(generatedTypographyModeProfilesV1());
assert.equal(modes.length,5);
assert.ok(Object.keys(generatedTypographyArchetypeCatalogV1()).length>=12);
const reports=modes.map((mode)=>{
  const vocabulary=compileTypographyFilmVocabularyV1(fixture(mode));
  assert.equal(vocabulary.status,"PASS_REVIEW_ONLY",mode);
  const result=compileGeneratedTypographyStyleGenomeV1(vocabulary.items);
  assert.equal(result.status,"PASS_REVIEW_ONLY",mode);
  assert.equal(result.styleGenome.articleProfile.primaryProgramMode,mode);
  assert.ok(result.styleGenome.richnessBudget.activeFamilies.length>=4&&result.styleGenome.richnessBudget.activeFamilies.length<=6,mode);
  assert.equal(result.styleGenome.brandCore.visualAuthority,"IMAGEGEN_GENERATED_TRANSPARENT_TYPE_ASSET");
  assert.equal(result.styleGenome.brandCore.localRecreationPolicy,"DO_NOT_RECREATE_GENERATED_AESTHETIC_WITH_LOCAL_FONTS");
  assert.equal(result.sequenceLedger.repeatedAdjacent.length,0,mode);
  assert.ok(result.items.filter((item)=>["NO_TYPE","SOURCE_NATIVE","CAPTION","EVIDENCE_HIGHLIGHT"].includes(item.typographyRole)).every((item)=>item.generatedTypographyPlan.decision==="SKIP"),mode);
  const generated=result.items.map((item)=>item.generatedTypographyPlan).filter((plan)=>plan.decision==="GENERATE");
  assert.ok(generated.length>=3,mode);
  assert.ok(generated.every((plan)=>plan.renderSpec.background==="TRANSPARENT"&&plan.renderSpec.glyphOnly===true));
  assert.ok(generated.every((plan)=>plan.verification.characterLevelMatchRequired===true&&plan.localSupportRole==="EXACT_COPY_SHADOW_MASK_METADATA_ONLY"));
  assert.ok(generated.every((plan)=>plan.negativePrompt.includes("background")&&plan.negativePrompt.includes("circle")&&plan.negativePrompt.includes("card")));
  return{mode,styleId:result.styleGenome.articleProfile.styleId,generatedEventCount:generated.length,activeFamilies:result.styleGenome.richnessBudget.activeFamilies,archetypes:[...new Set(generated.map((plan)=>plan.archetypeId))]};
});
assert.equal(new Set(reports.map((item)=>item.styleId)).size,5);

const current=JSON.parse(fs.readFileSync(path.join(root,"work/single-film-typography-vocabulary-director-v1/whole-film-typography-director-v3.json"),"utf8"));
const currentResult=compileGeneratedTypographyStyleGenomeV1(current.assignments);
assert.equal(currentResult.status,"PASS_REVIEW_ONLY");
assert.equal(currentResult.sequenceLedger.generatedEventCount,current.assignments.filter((item)=>(item.filmEffectProgram||item.effectProgram)?.effectId!=="NONE").length);
assert.ok(currentResult.styleGenome.richnessBudget.activeFamilies.length>=4&&currentResult.styleGenome.richnessBudget.activeFamilies.length<=6);
assert.equal(currentResult.sequenceLedger.repeatedAdjacent.length,0);
const currentGenerated=currentResult.items.map((item)=>item.generatedTypographyPlan).filter((plan)=>plan.decision==="GENERATE");
assert.ok(new Set(currentGenerated.map((plan)=>plan.archetypeId)).size>=Math.min(5,currentGenerated.length));

const runtime=fs.readFileSync(path.join(root,"apps/studio-next/src/lib/a1-generated-typography-style-genome-v1.mjs"),"utf8");
for(const forbidden of ["vibe coding","废稿","ED-01","ED-10","ED-34","holdout-evidence-water"])assert.equal(runtime.includes(forbidden),false,forbidden);
console.log(JSON.stringify({contract:"A1GeneratedTypographyStyleGenomeTest/v1",status:"PASS",modeCount:modes.length,reports,currentFilm:{styleId:currentResult.styleGenome.articleProfile.styleId,generatedEventCount:currentResult.sequenceLedger.generatedEventCount,quietBeatRatio:currentResult.sequenceLedger.quietBeatRatio,activeFamilies:currentResult.styleGenome.richnessBudget.activeFamilies,archetypes:[...new Set(currentGenerated.map((plan)=>plan.archetypeId))]},checks:["five-program-modes","article-style-distinction","four-to-six-active-families","paragraph-role-routing","sequence-history-no-adjacent-repeat","source-and-quiet-protection","transparent-type-only","generated-visual-authority","exact-copy-shadow","no-topic-branches"]},null,2));
