import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {researchStaticCoreOnlyV1,researchStaticScopedSampleV1,stateHasNoDesignedCopyV1,reviewedUnpackagedObservationV1} from '../apps/studio-next/src/lib/a1-research-static-scope-v1.mjs';
import {verifiedNoPackageTargetsV1} from '../apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs';
import {createHash} from 'node:crypto';
import {findProductionReusableFrameV1} from '../apps/studio-next/src/lib/a1-production-frame-options-v1.mjs';
import {compileResearchProductionWorkOrderV1} from '../apps/studio-next/src/lib/a1-research-production-work-order-v1.mjs';
import {compileFullFrameRequestsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'static-scope-'))),fixtures=[];
try {
for(const genre of ['typography','editorial-comparison','source-explainer']){
 const candidate={id:'scope-'+genre,sequenceIds:['scene'],mediaClass:'STATIC_FRAME_SET',currentLocalCandidate:true,coverageScope:'RESEARCH_SUBFRAGMENT',
  localReview:{status:'PASS',label:'A successful local packaging component'},blockers:['CORE_ONLY_WHOLE_ANCHOR_MISSING_SOURCE'],wholeShotPASS:false,productionAdmission:false,
  staticSamples:[{id:'entry',sourceFrame:1,localFrame:0,imageArtifactId:'image',referenceArtifactId:'reference',referenceClock:{status:'UNKNOWN',seconds:null}}]};
 const sample=candidate.staticSamples[0];assert.equal(researchStaticCoreOnlyV1(candidate,sample),true);
 const scoped=researchStaticScopedSampleV1(candidate,sample);assert.equal(scoped.coreOnlyReview.wholeAnchorStatus,'BLOCKED');assert.equal(scoped.coreOnlyReview.status,'PASS');assert.equal(sample.coreOnlyReview,undefined);
 assert.equal(researchStaticCoreOnlyV1({localReview:{label:'core in a label is not scope'}},sample),false,'do not classify from names or wording');
 assert.equal(researchStaticCoreOnlyV1({...candidate,blockers:[],wholeAnchorPASS:false,coreVisualPASS:true},sample),true);
 const plan={contract:'A1ShotTaskPlan/v1',projectId:'fixture',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:'a'.repeat(64)},shots:[{id:'scene',sourceText:'Source '+genre,visualJob:'View this source',exactCopy:[],tasks:[]}]};
 const projection={contract:'A1SystemLineResearchTaskProjection/v1',taskId:'fixture',productionAdmission:false,input:{sourceVideoSha256:plan.source.videoSha256},
  sequences:[{sequenceId:'scene',referenceAnchors:[{state:'ENTRY',sourceFrame:1},{state:'HOLD',sourceFrame:2},{state:'HANDOFF',sourceFrame:3}],blockers:[]}],
  artifacts:[{id:'image',path:'work/image.png',sha256:'b'.repeat(64),status:'VERIFIED',sha256VerifiedNow:true},{id:'reference',path:'work/frame-00001.jpg',sha256:'c'.repeat(64),status:'VERIFIED',sha256VerifiedNow:true}],candidates:[candidate],summary:{visuallyAcceptedCount:0,registeredRenderCount:0}};
 const result=compileResearchProductionWorkOrderV1({repoRoot:root,plan,projection}).shots[0];
 assert.equal(result.anchors[0].status,'CORE_ONLY');assert.equal(result.localPassAnchors,0);assert.equal(result.hasLocalStaticPass,false);assert.equal(result.hasLocalCorePass,true);assert.equal(result.wholeShotApproved,false);
 assert.equal(result.mainImageArtifactId,'image','keep existing core pixels visible for the user');
 const nativePlan=structuredClone(plan);nativePlan.shots[0].sourceNativeLayoutBinding={contract:'A1SourceBoundNativeLayoutBinding/v1',deliveryBoundary:'DATA_CORE_ONLY',fullPackagingComplete:false};
 const nativeCandidate={...candidate,localReview:{status:'PASS',label:'透明包装局部检查通过，底片仍待接入'}},nativeProjection={...projection,candidates:[nativeCandidate]},nativeSnapshot=JSON.stringify(nativeProjection);
 const native=compileResearchProductionWorkOrderV1({repoRoot:root,plan:nativePlan,projection:nativeProjection}).shots[0];
 const nativeLabel='可编辑表格核心检查通过，未辨字与完整状态仍待补齐';
 assert.equal(native.reviewLabel,nativeLabel);assert.equal(native.anchors[0].reviewLabel,nativeLabel);assert.equal(native.latestReview.label,nativeLabel);
 assert.equal(native.hasLocalCorePass,true);assert.equal(native.hasLocalStaticPass,false);assert.equal(native.wholeShotApproved,false);assert.equal(native.localPassAnchors,0);
 assert.equal(native.anchors[0].status,'CORE_ONLY');assert.equal(JSON.stringify(nativeProjection),nativeSnapshot,'projection labels must not rewrite candidate receipts');
 const rasterPlan=structuredClone(nativePlan);Object.assign(rasterPlan.shots[0].sourceNativeLayoutBinding,{nativeStates:['ENTRY'],acceptedCoreStates:[{state:'ENTRY',rasterTextEditable:false}]});
 const raster=compileResearchProductionWorkOrderV1({repoRoot:root,plan:rasterPlan,projection:nativeProjection}).shots[0];assert.equal(raster.anchors[0].reviewLabel,'原包装局部复用检查通过，完整状态与底片仍待补齐');assert.equal(raster.hasLocalCorePass,true);assert.equal(raster.wholeShotApproved,false);assert.equal(raster.localPassAnchors,0);assert.equal(raster.anchors[0].status,'CORE_ONLY');
 rasterPlan.shots[0].sourceNativeLayoutBinding.nativeStates=['HOLD'];rasterPlan.shots[0].sourceNativeLayoutBinding.acceptedCoreStates[0].state='HOLD';const otherState=compileResearchProductionWorkOrderV1({repoRoot:root,plan:rasterPlan,projection:nativeProjection}).shots[0];assert.equal(otherState.anchors[0].reviewLabel,nativeCandidate.localReview.label,'a different state does not acquire native/raster wording');assert.equal(JSON.stringify(nativeProjection),nativeSnapshot);
 const taskRoot=path.join(root,'work','fixture-'+genre);fs.mkdirSync(taskRoot,{recursive:true});
 fs.writeFileSync(path.join(taskRoot,'candidate-registry-v1.json'),JSON.stringify({entries:[{...candidate,inputs:[{path:'not-read.json'}],staticSamples:[{sourceFrame:1,image:{path:'not-read.png',sha256:'b'.repeat(64)}}]}]}));
 const reuse=findProductionReusableFrameV1({repoRoot:root,taskRoot,plan,workflow:null,shot:plan.shots[0],reference:{sourceFrame:1}});
 assert.equal(reuse.frame,null);assert.equal(reuse.rejected[0].reason,'CORE_ONLY_NOT_COMPLETE_FRAME','reject a known core before looking for a complete-frame receipt');
 const directPlan={...plan,visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'}};
 assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:directPlan,units:[{shotId:'scene',state:'ENTRY',existingFrame:{candidateId:candidate.id,image:{sha256:'b'.repeat(64)}}}]}),/CORE_ONLY_CACHE_FORBIDDEN/);
 const full={...candidate,blockers:[],staticSamples:candidate.staticSamples};
 const fullResult=compileResearchProductionWorkOrderV1({repoRoot:root,plan,projection:{...projection,candidates:[full]}}).shots[0];assert.equal(fullResult.anchors[0].status,'PASS');
 const mixed=compileResearchProductionWorkOrderV1({repoRoot:root,plan,projection:{...projection,candidates:[{...full,id:'whole-frame'},candidate]}}).shots[0];
 assert.equal(mixed.anchors[0].candidateId,'whole-frame','a later core cannot hide a valid current complete frame');
 const raw=path.join(taskRoot,'base-reference.png');fs.writeFileSync(raw,'source-only fixture bytes');const sha=createHash('sha256').update(fs.readFileSync(raw)).digest('hex');
 const base={...plan.shots[0],exactCopy:['Copy in another state'],sourceInterval:{startFrame:0,endFrameExclusive:4},
   referenceProductionDesign:{states:[{state:'ENTRY',visibleCopyIndices:[0]},{state:'HANDOFF',visibleCopyIndices:[]}]},
   statePackagingDecisions:[{state:'HANDOFF',sourceFrame:3,sourceVideoSha256:plan.source.videoSha256,referencePath:raw,referenceSha256:sha,packagingForm:'NO_PACKAGE',packagingElementsVisible:false,
     observation:'UNPACKAGED_SOURCE_CONTENT',baseMediaWork:'SEPARATE_SOURCE_INTEGRATION_REQUIRED',reviewedBy:'fixture',reason:'No added packaging; source base remains a separate requirement'}]};
 assert.equal(stateHasNoDesignedCopyV1(base,'HANDOFF'),true);assert.equal(stateHasNoDesignedCopyV1(base,'ENTRY'),false);
 const found=verifiedNoPackageTargetsV1({repoRoot:root,plan:{...plan,shots:[base]},targetKeys:['scene:HANDOFF']});assert.equal(found.length,1);assert.equal(found[0].baseMediaWork,'SEPARATE_SOURCE_INTEGRATION_REQUIRED');
 assert.equal(reviewedUnpackagedObservationV1({...base.statePackagingDecisions[0],baseMediaWork:undefined}),false,'no-package does not implicitly qualify source media');
 const title=structuredClone(base);title.referenceProductionDesign.states[1].visibleCopyIndices=[0];
 assert.equal(verifiedNoPackageTargetsV1({repoRoot:root,plan:{...plan,shots:[title]},targetKeys:['scene:HANDOFF']}).length,0);
 fs.appendFileSync(raw,'changed');assert.throws(()=>verifiedNoPackageTargetsV1({repoRoot:root,plan:{...plan,shots:[base]},targetKeys:['scene:HANDOFF']}),/CLEAN_REFERENCE_CHANGED/);
 fixtures.push({id:genre,genre,status:'PASS',coreRemainsVisible:true,wholeAnchorCredit:0,fullFrameReuseRejected:true});
}
const report={status:'PASS',fixtures,checks:['structured-review-not-label','standalone-core-not-whole-anchor','core-pixels-still-visible','whole-frame-reuse-rejected','complete-frame-regression','no-approval-promotion'],verificationScope:'SCOPE_CONTRACT_FIXTURES_NOT_NEW_PIXEL_REVIEW',productionAdmission:false};console.log(JSON.stringify(report));
if(process.argv.includes('--output')){const file=process.argv[process.argv.indexOf('--output')+1];fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
}finally{fs.rmSync(root,{recursive:true,force:true});}
