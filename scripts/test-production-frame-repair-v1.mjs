import assert from 'node:assert/strict';
import {prepareProductionFrameRepairV1,normalizeRepairNativeCoreV1} from '../apps/studio-next/src/lib/a1-production-frame-repair-v1.mjs';
import {productionContentPlanV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';

const request={state:'HOLD',requestSha256:'a'.repeat(64),protectedCores:[{layerId:'portrait',assetId:'photo',box:{x:.4,y:0,width:.6,height:1},fit:'contain'}]};
const plan={projectId:'repair-fixture',shots:[{id:'A',tasks:[],fullFrameRequests:[request]}]};
const proposal={contract:'A1CompleteFrameRepairProposal/v1',productionAdmission:false,review:{path:'bound-review.json',sha256:'b'.repeat(64)},
  targets:[{shotId:'A',state:'HOLD',requestSha256:request.requestSha256,currentImageSha256:'c'.repeat(64)}],
  repairs:[{shotId:'A',state:'HOLD',requiresGeneration:false,reason:'Native layer covers a locked word and leaves a duplicate portrait',nativeCores:[
    {layerId:'portrait',assetId:'photo',box:{x:.54,y:0,width:.46,height:1},sourceRect:{x:.4,y:0,width:.6,height:1},fit:'cover'}]}]};
const r=prepareProductionFrameRepairV1({repoRoot:process.cwd(),plan,proposal});
assert.equal(r.geometryOnly,true);assert.equal(r.units.length,0,'geometry correction does not create an image-generation job');
assert.equal(r.plan.shots[0].fullFrameRequests[0].requestSha256,request.requestSha256,'same generated image is reused');
assert.equal(r.plan.shots[0].fullFrameRequests[0].protectedCores[0].fit,'cover');
assert.equal(r.plan.shots[0].fullFrameRepairHistory[0].originalRequest.protectedCores[0].fit,'contain');
assert.equal(plan.shots[0].fullFrameRequests[0].protectedCores[0].fit,'contain','caller data is immutable');
assert.equal(r.plan.shots[0].wholeFrameReview.repairCount,1);
assert.throws(()=>prepareProductionFrameRepairV1({repoRoot:process.cwd(),plan:r.plan,proposal}),/STATE_REPAIR_BUDGET_HISTORY_BINDING_INVALID/,'the fixture has no closed review file and cannot authorize another repair');
const settled=structuredClone(r.plan);settled.shots[0].wholeFrameReview.status='PASS';
assert.equal(nodeInputHash(productionContentPlanV1(settled)),nodeInputHash(productionContentPlanV1(r.plan)),'review closeout does not invalidate identical rendered pixels');
const whiteCore={...request.protectedCores[0],fitBackground:'#ffffff',sourceRect:null};
assert.equal(normalizeRepairNativeCoreV1(whiteCore).fitBackground,'#ffffff');
const matteProposal=structuredClone(proposal);matteProposal.repairs[0].nativeCores=[whiteCore];
assert.equal(prepareProductionFrameRepairV1({repoRoot:process.cwd(),plan,proposal:matteProposal}).plan.shots[0].fullFrameRequests[0].protectedCores[0].fitBackground,'#ffffff');
assert.equal(Object.hasOwn(normalizeRepairNativeCoreV1({...whiteCore,fitBackground:null}),'fitBackground'),false);
assert.equal(Object.hasOwn(normalizeRepairNativeCoreV1(request.protectedCores[0]),'fitBackground'),false,'old repair proposals remain unchanged');
assert.throws(()=>normalizeRepairNativeCoreV1({...whiteCore,fit:'cover'}),/MATTE_REQUIRES_CONTAIN/);
assert.throws(()=>normalizeRepairNativeCoreV1({...whiteCore,fitBackground:'rgba(0,0,0,.5)'}),/BACKGROUND/);
console.log('PASS native repair reuses generator bytes, changes only bound geometry, preserves failure/history, limits repair to one, and keeps completed pixel identity stable after review closeout. No providers.');
