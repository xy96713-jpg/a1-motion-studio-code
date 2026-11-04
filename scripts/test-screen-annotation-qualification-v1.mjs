#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {compileScreenAnnotationQualification} from "../apps/studio-next/src/lib/a1-screen-annotation-qualification-v1.mjs";

const digest = (text) => crypto.createHash("sha256").update(text).digest("hex");
const evidence = ({text, lineRects, selected = false, highlighted = false, visibility = 1}) => ({
  contract: "A1TextRangeEvidence/v1", status: "PASS", exactMatch: true,
  sourceTextSha256: digest(text), matchedTextSha256: digest(text), rangeToken: digest(text).slice(0, 24),
  lineRects, unionRect: lineRects.reduce((box, rect) => ({x: Math.min(box.x, rect.x), y: Math.min(box.y, rect.y), width: Math.max(box.x + box.width, rect.x + rect.width) - Math.min(box.x, rect.x), height: Math.max(box.y + box.height, rect.y + rect.height) - Math.min(box.y, rect.y)}), {...lineRects[0]}),
  viewportVisibilityRatio: visibility, nativeSelection: {containsExactText: selected}, sourceHighlight: {detected: highlighted},
});
const fixtures = [
  {genre: "rewrite", expected: "NONE", semanticIntent: "TEXT_ATTENTION", evidence: evidence({text: "真实选中的改写句子", lineRects: [{x:.18,y:.42,width:.54,height:.05}], selected: true})},
  {genre: "research", expected: "CIRCLE", semanticIntent: "EXACT_PHRASE", evidence: evidence({text: "关键事实", lineRects: [{x:.28,y:.31,width:.18,height:.05}]})},
  {genre: "tutorial", expected: "UNDERLINE", semanticIntent: "TEXT_ATTENTION", evidence: evidence({text: "两行操作说明", lineRects: [{x:.16,y:.48,width:.58,height:.05},{x:.16,y:.54,width:.34,height:.05}]})},
  {genre: "camera-crop", expected: "NONE", semanticIntent: "TEXT_ATTENTION", evidence: evidence({text: "镜头外文字", lineRects: [{x:.82,y:.72,width:.32,height:.05}], visibility:.41})},
];
const results = fixtures.map((fixture) => compileScreenAnnotationQualification({evidence: fixture.evidence, semanticIntent: fixture.semanticIntent, cameraProjection: {visibleRatio: fixture.evidence.viewportVisibilityRatio}}));
fixtures.forEach((fixture, index) => assert.equal(results[index].actor, fixture.expected, JSON.stringify(results[index], null, 2)));
assert.ok(results[0].reasons.includes("SOURCE_NATIVE_SELECTION_ALREADY_EMPHATIC"));
assert.ok(results[3].reasons.includes("TEXT_NOT_CLEAR_AFTER_CAMERA"));
assert.ok(results.every((result) => result.qualificationSha256 && result.policy.noneIsValidAndPreferredOnDuplicateEmphasis));
console.log(JSON.stringify({status:"PASS", contract:"A1ScreenAnnotationQualificationTest/v1", fixtures:fixtures.map((fixture,index)=>({genre:fixture.genre,actor:results[index].actor,status:results[index].status,reasons:results[index].reasons,sha256:results[index].qualificationSha256}))}, null, 2));
