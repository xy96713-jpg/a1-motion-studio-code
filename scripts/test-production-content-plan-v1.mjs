import assert from 'node:assert/strict';
import {assertFrameContentPlanV1,frameContentPlanSchemaV1} from '../apps/studio-next/src/lib/a1-production-content-plan-v1.mjs';
import {bindApproximateFrameReviewV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';

const shot={sourceText:'设备 A 向设备 B 发送照片，接收端展示同一照片。',exactCopy:['设备 A','设备 B']};
const contentPlan={referenceKind:'EDITORIAL_INFOGRAPHIC',subject:'两台设备',action:'发送同一照片',viewerTakeaway:'看出发送端和接收端的关系',
  sourceAnchor:'发送照片',requiredVisibleAnchors:['设备 A','设备 B'],treatment:'REBUILD_EDITORIAL'};
const args={shot,contentPlan,brief:'设备 A 发送照片，设备 B 显示相同照片。'};
assert.deepEqual(assertFrameContentPlanV1(args),contentPlan);
assert.throws(()=>assertFrameContentPlanV1({...args,contentPlan:null}),/CONTENT_PLAN_REQUIRED/);
assert.throws(()=>assertFrameContentPlanV1({...args,brief:'米白纸纹、大字与黑色折叠几何主体'}),/BRIEF_DROPPED_SOURCE/);
assert.throws(()=>assertFrameContentPlanV1({...args,contentPlan:{...contentPlan,sourceAnchor:'未提供的实验数据'}}),/ANCHOR_UNBOUND/);
assert.throws(()=>assertFrameContentPlanV1({...args,contentPlan:{...contentPlan,referenceKind:'NATIVE_DOCUMENT'}}),/NATIVE_PIXELS_REQUIRED/);
assert.throws(()=>assertFrameContentPlanV1({...args,contentPlan:{...contentPlan,referenceKind:'NATIVE_INTERFACE',treatment:'PRESERVE_NATIVE'}}),/NATIVE_PIXELS_REQUIRED/);
assertFrameContentPlanV1({...args,contentPlan:{...contentPlan,referenceKind:'NATIVE_DOCUMENT',treatment:'PRESERVE_NATIVE'},protectedCores:[{assetId:'native'}]});
// Geometry is valid when it explains a specific source relationship, not filler.
assertFrameContentPlanV1({...args,contentPlan:{...contentPlan,referenceKind:'CONCEPT_SCENE',treatment:'ORIGINAL_ILLUSTRATION'},brief:'用两个几何节点标明设备 A 与设备 B，同一照片沿箭头传送。'});
const binding={state:'HOLD',contentPlan},node={id:'current',inputSha256:'current-sha'};
const review={state:'HOLD',copyCorrect:true,actorAndDataCorrect:true,readable:true,compositionAcceptable:true,meaningfulContent:false,
  findings:['文字正确，但只有无关折纸，缺失设备间照片传送关系。'],styleNotes:[]};
assert.equal(bindApproximateFrameReviewV1(binding,review,node).status,'VISUAL_FAIL');
assert.equal(bindApproximateFrameReviewV1(binding,{...review,meaningfulContent:true,findings:[]},node).status,'PASS');
const missing={...review};delete missing.meaningfulContent;
assert.throws(()=>bindApproximateFrameReviewV1(binding,missing,node),/REVIEW_INVALID/);
assert.ok(frameContentPlanSchemaV1().required.includes('sourceAnchor'));
console.log('PASS source-bound content; generic filler/missing anchors/native-page fabrication blocked; meaningful-content failure beats correct text; legitimate concept diagrams retained.');
