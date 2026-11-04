import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {prepareProductionFrameRepairV1} from '../apps/studio-next/src/lib/a1-production-frame-repair-v1.mjs';
import {productionFrameGoalShaV1,productionFrameRequestIsCurrentV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'core-geometry-repair-'))),dir=path.join(root,'work','unseen-core');fs.mkdirSync(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),raw=Buffer.from('synthetic accepted transparent raw bytes'),rawPath=path.join(dir,'raw.png');fs.writeFileSync(rawPath,raw);
const requestSha='a'.repeat(64),acceptance='b'.repeat(64),compositeSha='c'.repeat(64);
const asset={assetId:'raw-package',path:rawPath,sha256:hash(raw),kind:'IMAGE',referenceOnly:false,materialClass:'ORIGINAL_GENERATED_ASSET',provenance:{requestSha256:requestSha,acceptanceManifestSha256:acceptance}};
const reference={state:'HOLD',sourceFrame:24,sha256:'e'.repeat(64)};
const request={state:'HOLD',reference,requestSha256:requestSha,transparentBackground:true,protectedCores:[],nodeId:'asset: image-generation'};
const plan={projectId:'unseen-core',source:{videoSha256:'d'.repeat(64)},activeWorkScope:{referencePackagingOnly:true,shotIds:['label']},shots:[{id:'label',sourceText:'Original words',visualJob:'Paper label',exactCopy:['Original words'],fullFrameRequests:[request],productionResources:{assets:[asset],fonts:[]}}]};
request.goalInputSha256=productionFrameGoalShaV1(plan,plan.shots[0],'HOLD');
const reviewBytes=Buffer.from(JSON.stringify({contract:'A1ProductionBatchVisualReview/v1',taskId:'unseen-core',phaseId:'first-core-review',productionAdmission:false,
 items:[{shotId:'label',state:'HOLD',sourceFrame:reference.sourceFrame,referenceSha256:reference.sha256,imageSha256:compositeSha,status:'VISUAL_FAIL',findings:['Correct words, package too large and high']}]})),reviewPath=path.join(dir,'production-batches','first-core-review','visual-review.json');fs.mkdirSync(path.dirname(reviewPath),{recursive:true});fs.writeFileSync(reviewPath,reviewBytes);
const regions=[{sourceRect:{x:.1794,y:.43146,width:.64294,height:.18597},box:{x:.29,y:.63,width:.42,height:.12},z:1,fit:'contain'}];
const proposal={contract:'A1CompleteFrameRepairProposal/v1',productionAdmission:false,review:{path:path.relative(root,reviewPath),sha256:hash(reviewBytes)},targets:[{shotId:'label',state:'HOLD',requestSha256:requestSha,currentImageSha256:compositeSha,rawPackagingImage:{path:rawPath,sha256:asset.sha256,acceptanceManifestSha256:acceptance}}],repairs:[{shotId:'label',state:'HOLD',requiresGeneration:false,repairBrief:'Move the complete paper label down and scale it smaller; preserve its words and material',nativeCores:[],packagingRegions:regions,reason:'Placement only'}]};
const prepare=(p=plan,r=proposal)=>prepareProductionFrameRepairV1({repoRoot:root,plan:p,proposal:r});
try{
 const before=structuredClone(plan),goal=productionFrameGoalShaV1(plan,plan.shots[0],'HOLD'),result=prepare();
 assert.equal(result.geometryOnly,true);assert.deepEqual(result.units,[],'zero generation requests');
 const fixed=result.plan.shots[0];assert.deepEqual(fixed.fullFrameRequests[0].localCompositeRegions,regions);
 assert.equal(fixed.fullFrameRequests[0].requestSha256,requestSha);assert.deepEqual(fixed.productionResources.assets,[asset]);assert.equal(fs.readFileSync(rawPath).equals(raw),true);
 assert.equal(fixed.fullFrameRepairHistory[0].repairMode,'PACKAGING_CORE_COMPOSITOR_ONLY');assert.deepEqual(fixed.fullFrameRepairHistory[0].originalRequest,request);assert.equal(fixed.fullFrameRepairHistory[0].originalImageSha256,compositeSha);
 assert.equal(fixed.fullFrameRepairHistory[0].rawPackagingImage.sha256,asset.sha256);assert.equal(fixed.wholeFrameReview.repairCount,1);
 assert.equal(productionFrameGoalShaV1(result.plan,fixed,'HOLD'),goal);assert.deepEqual(plan,before,'preparation never changes caller plan');
 assert.equal(productionFrameRequestIsCurrentV1({plan:result.plan,shot:fixed,request:fixed.fullFrameRequests[0],unit:{}}),true,'geometry repair replays the same accepted producer, without re-preparation');
 for(const mutate of [p=>p.activeWorkScope.referencePackagingOnly=false,p=>p.shots[0].fullFrameRepairHistory=[],p=>p.shots[0].productionResources.assets[0].provenance.acceptanceManifestSha256='f'.repeat(64)]){
  const changed=structuredClone(result.plan);mutate(changed);assert.equal(productionFrameRequestIsCurrentV1({plan:changed,shot:changed.shots[0],request:changed.shots[0].fullFrameRequests[0],unit:{}}),false);
 }
 assert.throws(()=>prepare(result.plan),/BINDING_OR_LIMIT/);
 const legacy=structuredClone(plan);legacy.activeWorkScope.referencePackagingOnly=false;assert.throws(()=>prepare(legacy),/PACKAGING_SCOPE/);
 const opaque=structuredClone(plan);opaque.shots[0].fullFrameRequests[0].transparentBackground=false;assert.throws(()=>prepare(opaque),/PACKAGING_SCOPE/);
 const wrongRaw=structuredClone(proposal);wrongRaw.targets[0].rawPackagingImage.sha256='e'.repeat(64);assert.throws(()=>prepare(plan,wrongRaw),/RAW_BINDING/);
 const wrongReview=structuredClone(proposal);wrongReview.targets[0].currentImageSha256='e'.repeat(64);assert.throws(()=>prepare(plan,wrongReview),/REVIEW_BINDING/);
 const unaccepted=structuredClone(plan);delete unaccepted.shots[0].productionResources.assets[0].provenance.acceptanceManifestSha256;assert.throws(()=>prepare(unaccepted),/RAW_BINDING/);
 for(const region of [{...regions[0],box:{x:.9,y:0,width:.5,height:.5}},{...regions[0],sourceRect:{x:0,y:0,width:0,height:1}},{...regions[0],fit:'cover'},{...regions[0],z:-1},{...regions[0],unknown:true}]){
  const invalid=structuredClone(proposal);invalid.repairs[0].packagingRegions=[region];assert.throws(()=>prepare(plan,invalid),/REGIONS_INVALID/);
 }
 const split=structuredClone(proposal);split.repairs[0].packagingRegions=[
  {sourceRect:{x:0,y:0,width:.5,height:1},box:{x:.12,y:.2,width:.25,height:.5},z:1,fit:'contain'},
  {sourceRect:{x:.5,y:0,width:.5,height:1},box:{x:.65,y:.2,width:.25,height:.5},z:2,fit:'contain'}];
 assert.equal(prepare(plan,split).plan.shots[0].fullFrameRequests[0].localCompositeRegions.length,2,'left/right complete groups can be repositioned independently using one unchanged raw asset');
 const duplicate=structuredClone(proposal);duplicate.repairs[0].packagingRegions=[regions[0],regions[0]];assert.throws(()=>prepare(plan,duplicate),/REGIONS_INVALID/);
 const generation=structuredClone(proposal);generation.repairs[0].requiresGeneration=true;assert.throws(()=>prepare(plan,generation),/PACKAGING_SCOPE/);
 const oldRepair=structuredClone(proposal);oldRepair.repairs[0].packagingRegions=[];assert.equal(prepare(legacy,oldRepair).geometryOnly,true,'empty regions preserve old native-only scope');
 fs.writeFileSync(rawPath,'changed');assert.throws(()=>prepare(),/RAW_BYTES_CHANGED/);
 console.log('PASS accepted-raw transparent packaging geometry repair, unchanged glyph bytes/request/goal, composite review binding, zero image requests, original history retained, one-repair limit, scope/region/binding/byte-drift rejection and legacy empty-array compatibility. Synthetic fixtures only.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
