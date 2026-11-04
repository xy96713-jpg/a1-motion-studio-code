#!/usr/bin/env node
import assert from "node:assert/strict";
import {bindNarrationToDomText} from "../apps/studio-next/src/lib/a1-screen-narration-text-binder-v1.mjs";

const fixtures=[
  {genre:"rewrite",narration:"最常用的动作就是划选一句。比如这句：AI 正在改变内容生产。系统会记住原因。",dom:[{token:"p-1",text:"直出版是：AI 正在改变内容生产。"}],expected:"AI 正在改变内容生产"},
  {genre:"research",narration:"审查时必须保留“因果证据”，不能只看结论。",dom:[{token:"p-2",text:"这段需要补充因果证据和来源。"}],expected:"因果证据"},
  {genre:"tutorial",narration:"先选中需要修改的真实句子，再运行改写并保留结果区。",dom:[{token:"p-3",text:"先选中需要修改的真实句子，再运行改写并保留结果区。"}],expected:"先选中需要修改的真实句子，再运行改写并保留结果区"},
];
const results=fixtures.map((fixture)=>bindNarrationToDomText({narrationText:fixture.narration,domTextCandidates:fixture.dom}));fixtures.forEach((fixture,index)=>{assert.equal(results[index].status,"PASS");assert.equal(results[index].binding.matchedText,fixture.expected);});
const ambiguous=bindNarrationToDomText({narrationText:"请保留“因果证据”。",domTextCandidates:[{token:"a",text:"因果证据"},{token:"b",text:"因果证据"}]});assert.equal(ambiguous.status,"FAIL");assert.deepEqual(ambiguous.failures,["NARRATION_TEXT_AMBIGUOUS"]);assert.ok(results.every((item)=>item.policy.fuzzyBindingForbidden&&item.bindingSha256));
console.log(JSON.stringify({status:"PASS",contract:"A1ScreenNarrationTextBinderTest/v1",fixtures:results.map((item,index)=>({genre:fixtures[index].genre,matchedText:item.binding.matchedText,mode:item.binding.mode,sha256:item.bindingSha256})),ambiguous:{status:ambiguous.status,failures:ambiguous.failures}},null,2));
