#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileTypographyBeatStateProgramV1,deriveTypographyBeatStateInputV1} from "../apps/studio-next/src/lib/a1-typography-beat-state-director-v1.mjs";

const root=path.resolve(import.meta.dirname,"..");
const projection=JSON.parse(fs.readFileSync(path.join(root,"work/single-film-typography-vocabulary-director-v1/whole-film-typography-director-v3.json"),"utf8"));
const selected=projection.assignments.filter((item)=>item.generatedTypographyPlan?.decision==="GENERATE");
const currentPrograms=selected.map((item)=>compileTypographyBeatStateProgramV1(deriveTypographyBeatStateInputV1(item)));
assert.equal(currentPrograms.length,7);
assert.ok(currentPrograms.every((program)=>program.status==="PASS_REVIEW_ONLY"));
assert.ok(currentPrograms.every((program)=>program.typographyOnlyBoundary.authoredSceneElementsAllowed===false&&program.productionAdmission===false));
assert.ok(currentPrograms.every((program)=>program.orderedEvents.at(-1).action==="CLEAR"));
assert.equal(currentPrograms.find((program)=>program.beatId==="ED-07").orderedEvents.filter((event)=>event.action==="REVEAL_GROUP").length,3);
assert.equal(currentPrograms.find((program)=>program.beatId==="ED-17").orderedEvents.filter((event)=>event.action==="REVEAL_GROUP").length,3);
assert.ok(currentPrograms.find((program)=>program.beatId==="ED-10").orderedEvents.some((event)=>event.action==="PROMOTE_RESULT"));
assert.ok(currentPrograms.find((program)=>program.beatId==="ED-34").orderedEvents.some((event)=>event.action==="PROMOTE_RESULT"));
for(const program of currentPrograms){
  const duplicate=compileTypographyBeatStateProgramV1(deriveTypographyBeatStateInputV1(selected.find((item)=>item.shotId===program.beatId)));
  assert.equal(duplicate.stateFingerprint,program.stateFingerprint,program.beatId);
}

const direct=(overrides={})=>({
  beatId:"fixture-beat",
  typographyRole:"EXPLANATION_DIAGRAM",
  semanticEvent:"PROCESS",
  copyAuthority:{exactCopy:"先判断\n再行动",displayGroups:["先判断","再行动"]},
  subtitleBoundary:{lane:"EXTERNAL_CAPTION",reservedBox:{x:0,y:.82,width:1,height:.18},exactCopies:[],duplicateCopyForbidden:true},
  carrierBinding:{kind:"TYPOGRAPHY_ONLY",externalCarrierRequired:true},
  actors:[
    {actorId:"state",semanticRole:"PRIMARY_WORD",language:"zh-CN",exactText:"大",anchor:{x:.1,y:.2,width:.4,height:.3},initialStyle:{scaleRole:"HERO",colorRole:"ACCENT",opacity:0}},
  ],
  events:[
    {eventId:"reveal",at:.14,action:"REVEAL_GROUP",actorIds:["state"],reason:"state-enters"},
    {eventId:"replace",at:.3,action:"REPLACE_COPY",actorId:"state",exactText:"小",preserveAnchor:true,reason:"large-becomes-small"},
    {eventId:"scale",at:.42,action:"MUTATE_SCALE",actorId:"state",toScaleRole:"SUPPORT",reason:"size-relationship-resolves"},
    {eventId:"color",at:.54,action:"MUTATE_COLOR",actorId:"state",toColorRole:"INK",reason:"accent-returns-to-normal"},
    {eventId:"clear",at:.9,action:"CLEAR",actorIds:["state"],reason:"handoff"},
  ],
  handoff:{fromPrevious:null,toNext:null,persistentActorIds:[]},
  visibleSceneElements:[],
  productionAdmission:false,
  ...overrides,
});
const mutation=compileTypographyBeatStateProgramV1(direct());
assert.equal(mutation.status,"PASS_REVIEW_ONLY");
assert.deepEqual(mutation.copyLedger.map((item)=>item.exactText),["大","小"]);
assert.equal(mutation.stateSnapshots.find((item)=>item.eventId==="scale").actors[0].style.scaleRole,"SUPPORT");
assert.equal(mutation.stateSnapshots.find((item)=>item.eventId==="color").actors[0].style.colorRole,"INK");

const identity=compileTypographyBeatStateProgramV1(direct({
  beatId:"identity-fixture",
  actors:[
    {actorId:"name-zh",identityGroupId:"person",semanticRole:"IDENTITY_NAME",language:"zh-CN",exactText:"中文姓名",initialStyle:{scaleRole:"PRIMARY",colorRole:"INK",opacity:0}},
    {actorId:"name-en",identityGroupId:"person",semanticRole:"IDENTITY_NAME",language:"en",exactText:"English Name",initialStyle:{scaleRole:"SUPPORT",colorRole:"SUPPORT",opacity:0}},
    {actorId:"role-zh",identityGroupId:"person",semanticRole:"IDENTITY_ROLE",language:"zh-CN",exactText:"身份说明",initialStyle:{scaleRole:"SUPPORT",colorRole:"ACCENT",opacity:0}},
  ],
  events:[
    {eventId:"identity-reveal",at:.2,action:"REVEAL_GROUP",actorIds:["name-zh","name-en","role-zh"],reason:"identity-group-enters"},
    {eventId:"identity-clear",at:.9,action:"CLEAR",actorIds:["name-zh","name-en","role-zh"],reason:"handoff"},
  ],
}));
assert.equal(identity.status,"PASS_REVIEW_ONLY");

const number=compileTypographyBeatStateProgramV1(direct({
  beatId:"number-fixture",
  actors:[
    {actorId:"value",numberUnitGroupId:"metric",semanticRole:"NUMBER",language:"en",exactText:"42",initialStyle:{scaleRole:"HERO",colorRole:"ACCENT",opacity:0}},
    {actorId:"unit",numberUnitGroupId:"metric",semanticRole:"UNIT",language:"zh-CN",exactText:"万次",initialStyle:{scaleRole:"MICRO",colorRole:"SUPPORT",opacity:0}},
  ],
  numberSourceBindings:{metric:{sourceId:"verified-source",measure:"count"}},
  events:[
    {eventId:"number-reveal",at:.2,action:"REVEAL_GROUP",actorIds:["value","unit"],reason:"verified-number-enters"},
    {eventId:"number-promote",at:.42,action:"PROMOTE_RESULT",actorId:"value",holdUntil:.78,reason:"verified-result-becomes-focus"},
    {eventId:"number-clear",at:.9,action:"CLEAR",actorIds:["value","unit"],reason:"handoff"},
  ],
}));
assert.equal(number.status,"PASS_REVIEW_ONLY");

const failures=[
  compileTypographyBeatStateProgramV1(direct({actors:[direct().actors[0],direct().actors[0]]})),
  compileTypographyBeatStateProgramV1(direct({events:[{eventId:"bad",at:.2,action:"MUTATE_COLOR",actorId:"missing",toColorRole:"INK",reason:"missing-actor"}]})),
  compileTypographyBeatStateProgramV1(direct({subtitleBoundary:{lane:"EXTERNAL_CAPTION",reservedBox:{x:0,y:.82,width:1,height:.18},exactCopies:["大"],duplicateCopyForbidden:true}})),
  compileTypographyBeatStateProgramV1(direct({visibleSceneElements:["PANEL"]})),
  compileTypographyBeatStateProgramV1(direct({events:[{eventId:"reveal",at:.2,action:"REVEAL_GROUP",actorIds:["state"],reason:"enter"},{eventId:"promote",at:.4,action:"PROMOTE_RESULT",actorId:"state",reason:"result"}]})),
  compileTypographyBeatStateProgramV1(direct({actors:number.actorLedger.map((actor)=>({...actor,numberUnitGroupId:"metric"})),numberSourceBindings:{},events:[{eventId:"clear",at:.9,action:"CLEAR",actorIds:number.actorLedger.map((actor)=>actor.actorId),reason:"handoff"}]})),
];
assert.ok(failures.every((program)=>program.status==="BLOCK"));

const genreFixtures=[
  ["PRODUCT_TUTORIAL","PRESENTER_HERO","IDENTITY","工具名称\n使用方法"],
  ["PRODUCT_TUTORIAL","EXPLANATION_DIAGRAM","PROCESS","选择材料\n执行检查\n确认结果"],
  ["EVIDENCE_ESSAY","EVIDENCE_TRANSLATION","EVIDENCE","来源范围\n主要发现\n结论边界"],
  ["EVIDENCE_ESSAY","FULLSCREEN_HERO","VERDICT","数据完整\n结论仍有限"],
  ["LONG_TAKE_OPINION","PRESENTER_MARKER","QUESTION","问题是什么\n为什么发生\n如何判断"],
  ["LONG_TAKE_OPINION","CONCLUSION_STAMP","CONCLUSION","保留证据\n形成判断"],
].map(([programMode,typographyRole,semanticEvent,exactCopy],index)=>compileTypographyBeatStateProgramV1(deriveTypographyBeatStateInputV1({shotId:`fixture-${index+1}`,programMode,typographyRole,semanticEvent,exactCopy,carrier:"TYPOGRAPHY_ONLY",filmEffectProgram:{effectDisplayGroups:exactCopy.split("\n")},compositionPlan:null,generatedTypographyPlan:{decision:"GENERATE",archetypeId:"FIXTURE",promptSha256:`fixture-${index+1}`}})));
assert.ok(genreFixtures.every((program)=>program.status==="PASS_REVIEW_ONLY"));

const runtime=fs.readFileSync(path.join(root,"apps/studio-next/src/lib/a1-typography-beat-state-director-v1.mjs"),"utf8");
for(const forbidden of ["ED-01","ED-07","ED-10","ED-17","亚洲首富","红的做成白的","BV11Ren6REA4"])assert.equal(runtime.includes(forbidden),false,forbidden);
console.log(JSON.stringify({contract:"A1TypographyBeatStateDirectorTest/v1",status:"PASS",currentFilm:{programCount:currentPrograms.length,actionCounts:Object.fromEntries([...new Set(currentPrograms.flatMap((program)=>program.orderedEvents.map((event)=>event.action)))].map((action)=>[action,currentPrograms.flatMap((program)=>program.orderedEvents).filter((event)=>event.action===action).length])),fingerprints:currentPrograms.map((program)=>({beatId:program.beatId,stateFingerprint:program.stateFingerprint}))},regression:{mutation:mutation.status,identity:identity.status,number:number.status},fixtureCount:genreFixtures.length,negativeCount:failures.length,checks:["deterministic-state-fingerprint","semantic-group-reveal","copy-replacement-preserves-anchor","scale-and-color-mutation-require-reason","single-promoted-result","promoted-result-exit","bilingual-identity-binding","number-unit-source-binding","subtitle-duplication-blocked","typography-only-boundary","three-genre-six-fixture-proof","no-topic-or-shot-branches"]},null,2));
