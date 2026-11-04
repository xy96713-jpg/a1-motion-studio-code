#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileScreenAnnotationRenderPlan,projectScreenAnnotationRect,renderScreenAnnotationSvg} from "../apps/studio-next/src/lib/a1-screen-annotation-renderer-v1.mjs";

const qualification=(actor,lineRects)=>({contract:"A1ScreenAnnotationQualification/v1",actor,status:actor==="NONE"?"ANNOTATION_SUPPRESSED":"ANNOTATION_QUALIFIED",qualificationSha256:`fixture-${actor}`,geometry:actor==="NONE"?null:{unionRect:lineRects[0],lineRects}});
const fixtures=[
  {actor:"NONE",rects:[]},
  {actor:"UNDERLINE",rects:[{x:.16,y:.44,width:.58,height:.05},{x:.16,y:.5,width:.32,height:.05}]},
  {actor:"CIRCLE",rects:[{x:.28,y:.34,width:.16,height:.05}]},
  {actor:"FOCUS_WINDOW",rects:[{x:.68,y:.28,width:.22,height:.24}]},
];
const results=fixtures.map((fixture)=>compileScreenAnnotationRenderPlan({qualification:qualification(fixture.actor,fixture.rects),cameraPose:{x:.5,y:.5,scale:1.12}}));
assert.deepEqual(results.map((item)=>item.actor),["NONE","UNDERLINE","CIRCLE","FOCUS_WINDOW"]);
assert.equal(results[1].lineRects.length,2);
assert.match(renderScreenAnnotationSvg(results[1]),/<path/u);
assert.match(renderScreenAnnotationSvg(results[2]),/<ellipse/u);
assert.match(renderScreenAnnotationSvg(results[3]),/a1-focus-mask/u);
assert.doesNotMatch(renderScreenAnnotationSvg(results[3]),/#087D8B/u);
assert.doesNotMatch(renderScreenAnnotationSvg(results[0]),/<(?:path|ellipse)/u);
const centered=projectScreenAnnotationRect({region:{x:.45,y:.47,width:.1,height:.06},cameraPose:{x:.5,y:.5,scale:1.2},width:960,height:540});
assert.ok(Math.abs(centered.visible.x-422.4)<.01&&Math.abs(centered.visible.y-250.56)<.01);
assert.ok(results.every((item)=>item.policy.rectangularFallbackForbidden&&item.renderPlanSha256));
console.log(JSON.stringify({status:"PASS",contract:"A1ScreenAnnotationRendererTest/v1",fixtures:results.map((item)=>({actor:item.actor,status:item.status,visibility:item.projectedVisibilityRatio,sha256:item.renderPlanSha256}))},null,2));
