import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {productionFrameStateRepairCountV1} from '../apps/studio-next/src/lib/a1-production-state-repair-budget-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'state-repair-budget-'))),taskId='unseen-task',hash=b=>createHash('sha256').update(b).digest('hex'),states=['ENTRY','HOLD','HANDOFF'];
const refs=states.map((state,i)=>({state,sourceFrame:i*10,path:'reference-'+state+'.jpg',sha256:String(i+1).repeat(64)}));
const requests=states.map((state,i)=>({shotId:'scene',state,requestSha256:String(i+4).repeat(64),goalInputSha256:String(i+7).repeat(64),reference:refs[i]}));
let serial=0;
function history(index,{goal=true}={}){
 const request=structuredClone(requests[index]);if(!goal)delete request.goalInputSha256;
 const phaseId='repair-'+(++serial),dir=path.join(root,'work',taskId,'production-batches',phaseId);fs.mkdirSync(dir,{recursive:true});
 const imageSha256=hash('original pixels '+phaseId),review={contract:'A1ProductionBatchVisualReview/v1',taskId,phaseId,productionAdmission:false,visualApproval:false,
 items:[{shotId:'scene',state:request.state,status:'VISUAL_FAIL',sourceFrame:request.reference.sourceFrame,referenceSha256:request.reference.sha256,imageSha256}],
 trace:{imageShas:[request.reference.sha256,imageSha256]}};
 const bytes=Buffer.from(JSON.stringify(review)),file=path.join(dir,'visual-review.json');fs.writeFileSync(file,bytes);
 return {state:request.state,originalRequest:request,sourceReview:{path:path.relative(root,file),sha256:hash(bytes)},originalImageSha256:imageSha256,repairMode:'PACKAGING_CORE_COMPOSITOR_ONLY',reason:'Placement only'};
}
const count=(shot,state)=>productionFrameStateRepairCountV1({repoRoot:root,shot,state});
try{
 const entry=history(0),shot={id:'scene',fullFrameRequests:requests,fullFrameRepairHistory:[entry],wholeFrameReview:{repairCount:1}};
 const saved=JSON.stringify(shot);assert.equal(count(shot,'ENTRY'),1);assert.equal(count(shot,'HANDOFF'),0);assert.equal(count(shot,'HOLD'),0);
 assert.equal(count(shot,'ENTRY')<1,false,'ENTRY second repair refused');assert.equal(count(shot,'HANDOFF')<1,true,'HANDOFF first repair allowed');
 const all={...shot,fullFrameRepairHistory:[entry,history(1),history(2)]};for(const state of states)assert.equal(count(all,state),1,'each state consumes only its own one repair');
 assert.equal(JSON.stringify(shot),saved,'counter never rewrites or resets history');
 const duplicate={...shot,fullFrameRepairHistory:[entry,structuredClone(entry)]};assert.equal(count(duplicate,'ENTRY'),1,'same receipt/pixels are not counted twice');
 for(const state of states){assert.equal(count({id:'scene',wholeFrameReview:{repairCount:1}},state),1);assert.equal(count({id:'scene',wholeFrameReview:{repairCount:1},fullFrameRepairHistory:[]},state),1);assert.equal(count({id:'scene',wholeFrameReview:{repairCount:1},fullFrameRepairHistory:[{reason:'old history without state pins'}]},state),1);}
 assert.equal(count({id:'scene'},'ENTRY'),0);
 assert.equal(count({...shot,fullFrameRepairHistory:[entry,{reason:'unattributed older attempt'}]},'HANDOFF'),1,'partial legacy metadata remains conservative');
 const newGoal=structuredClone(shot);newGoal.fullFrameRequests[0].goalInputSha256='a'.repeat(64);assert.equal(count(newGoal,'ENTRY'),0,'verified prior goal does not consume new content goal');
 const newReference=structuredClone(shot);newReference.fullFrameRequests[0].reference.sha256='a'.repeat(64);assert.equal(count(newReference,'ENTRY'),0);
 const noGoalHistory={...shot,fullFrameRepairHistory:[history(0,{goal:false})]};assert.equal(count(noGoalHistory,'ENTRY'),1,'missing historical goal cannot erase same-reference repair debt');
 const alteredState=structuredClone(shot);alteredState.fullFrameRepairHistory[0].state='HANDOFF';assert.throws(()=>count(alteredState,'HANDOFF'),/HISTORY_BINDING_INVALID/);
 const allStateAltered=structuredClone(shot);allStateAltered.fullFrameRepairHistory[0].state='HANDOFF';allStateAltered.fullFrameRepairHistory[0].originalRequest={...requests[2]};assert.throws(()=>count(allStateAltered,'HANDOFF'),/REVIEW_STATE_OR_PIXELS/);
 const wrongPixels=structuredClone(shot);wrongPixels.fullFrameRepairHistory[0].originalImageSha256='f'.repeat(64);assert.throws(()=>count(wrongPixels,'ENTRY'),/REVIEW_STATE_OR_PIXELS/);
 const wrongSha=structuredClone(shot);wrongSha.fullFrameRepairHistory[0].sourceReview.sha256='f'.repeat(64);assert.throws(()=>count(wrongSha,'ENTRY'),/REVIEW_SHA_CHANGED/);
 const missing=structuredClone(shot);missing.fullFrameRepairHistory[0].sourceReview.path='work/unseen-task/production-batches/missing/visual-review.json';assert.throws(()=>count(missing,'ENTRY'),/REVIEW_UNREADABLE/);
 const outside=structuredClone(shot);outside.fullFrameRepairHistory[0].sourceReview.path='../not-owned/visual-review.json';assert.throws(()=>count(outside,'ENTRY'),/REVIEW_PATH/);
 const wrongFrame=structuredClone(shot);wrongFrame.fullFrameRepairHistory[0].originalRequest.reference.sourceFrame=3;assert.throws(()=>count(wrongFrame,'ENTRY'),/REVIEW_TARGET/);
 const bad=history(1),badFile=path.join(root,bad.sourceReview.path),badReview=JSON.parse(fs.readFileSync(badFile));badReview.items[0].status='PASS';const badBytes=Buffer.from(JSON.stringify(badReview));fs.writeFileSync(badFile,badBytes);bad.sourceReview.sha256=hash(badBytes);assert.throws(()=>count({...shot,fullFrameRepairHistory:[bad]},'HOLD'),/REVIEW_TARGET/);
 const matteHistory=history(2),matteReviewPath=path.join(root,matteHistory.sourceReview.path),matteReview=JSON.parse(fs.readFileSync(matteReviewPath));
 const previewPath=path.join(path.dirname(matteReviewPath),'alpha-display.png'),previewBytes=Buffer.from('fixture neutral matte preview');fs.writeFileSync(previewPath,previewBytes);
 const projection={contract:'A1ReviewAlphaDisplayProjection/v1',operation:'ALPHA_MATTE',sourceArtifactSha256:matteHistory.originalImageSha256,reviewImageSha256:hash(previewBytes),matte:'#e6e6e6',width:10,height:10,resize:false,sourceBytesPreserved:true,displayOnly:true,productionMedia:false};
 const item=matteReview.items[0];Object.assign(item,{reviewKey:'scene:layer-compositor:HANDOFF',reviewScope:'PACKAGING_CORE',reviewImagePath:path.relative(root,previewPath),reviewImageSha256:projection.reviewImageSha256,displayProjection:projection});
 matteReview.trace={imageShas:[projection.reviewImageSha256,item.referenceSha256],displayProjections:[{reviewKey:item.reviewKey,reviewImagePath:item.reviewImagePath,...projection}]};
 function saveMatte(review){const bytes=Buffer.from(JSON.stringify(review));fs.writeFileSync(matteReviewPath,bytes);return {...matteHistory,sourceReview:{...matteHistory.sourceReview,sha256:hash(bytes)}};}
 const matteShot=entry=>({...shot,fullFrameRepairHistory:[entry]});assert.equal(count(matteShot(saveMatte(matteReview)),'HANDOFF'),1);
 const noMap=structuredClone(matteReview);delete noMap.items[0].displayProjection;assert.throws(()=>count(matteShot(saveMatte(noMap)),'HANDOFF'),/REVIEW_DISPLAY_MAPPING/);
 const fakeMap=structuredClone(matteReview);fakeMap.trace.displayProjections[0].sourceArtifactSha256='f'.repeat(64);assert.throws(()=>count(matteShot(saveMatte(fakeMap)),'HANDOFF'),/REVIEW_DISPLAY_TRACE/);
 const wrongImage=structuredClone(matteReview);wrongImage.items[0].reviewImageSha256='f'.repeat(64);assert.throws(()=>count(matteShot(saveMatte(wrongImage)),'HANDOFF'),/REVIEW_DISPLAY_MAPPING/);
 const forgedTrace=structuredClone(matteReview);forgedTrace.trace.imageShas=[projection.reviewImageSha256];assert.throws(()=>count(matteShot(saveMatte(forgedTrace)),'HANDOFF'),/REVIEW_DISPLAY_TRACE/);
 const combined=structuredClone(matteReview);combined.trace={parts:[matteReview.trace]};assert.equal(count(matteShot(saveMatte(combined)),'HANDOFF'),1);
 const validMatte=saveMatte(matteReview);fs.writeFileSync(previewPath,'altered display pixels');assert.throws(()=>count(matteShot(validMatte),'HANDOFF'),/REVIEW_DISPLAY_BYTES/);
 const linked=structuredClone(shot),linkDir=path.join(root,'work',taskId,'production-batches','linked');fs.mkdirSync(linkDir);fs.symlinkSync(path.join(root,entry.sourceReview.path),path.join(linkDir,'visual-review.json'));linked.fullFrameRepairHistory[0].sourceReview.path=path.relative(root,path.join(linkDir,'visual-review.json'));assert.throws(()=>count(linked,'ENTRY'),/REVIEW_PATH/);
 const taskRoot=path.join(root,'work',taskId),observationFile=path.join(taskRoot,'source-work-orders','legacy','padding-observation.json'),imageFile=path.join(taskRoot,'node-artifacts-v1','old-core.png'),referenceFile=path.join(root,'work','source-study','hold.jpg');
 for(const file of [observationFile,imageFile,referenceFile])fs.mkdirSync(path.dirname(file),{recursive:true});
 const imageBytes=Buffer.from('pinned old image bytes'),referenceBytes=Buffer.from('pinned actual reference bytes');fs.writeFileSync(imageFile,imageBytes);fs.writeFileSync(referenceFile,referenceBytes);
 const legacyReference={state:'HOLD',sourceFrame:10,path:referenceFile,sha256:hash(referenceBytes)},legacyRequest={...requests[1],reference:legacyReference},observation={contract:'A1AgentPixelObservation/v1',actorType:'AGENT',reviewerId:'fixture-actual-pixel-inspection',status:'FAIL',image:{path:path.relative(root,imageFile),sha256:hash(imageBytes)},reference:legacyReference,findings:['Native padding exposes incorrect lower pixels'],productionAdmission:false};
 function legacyFixture(mutate=()=>{}){
   const review=structuredClone(observation);mutate(review);const bytes=Buffer.from(JSON.stringify(review));fs.writeFileSync(observationFile,bytes);
   const entry={state:'HOLD',originalRequest:structuredClone(legacyRequest),originalImageSha256:hash(imageBytes),sourceReview:{path:path.relative(root,observationFile),sha256:hash(bytes)}};
   const shot={id:'scene',sourceVersionSha256:'a'.repeat(64),fullFrameRequests:[structuredClone(legacyRequest)],fullFrameRepairHistory:[entry],wholeFrameReview:{repairCount:1}};
   fs.writeFileSync(path.join(taskRoot,'shot-task-plan-v1.json'),JSON.stringify({contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:shot.sourceVersionSha256},shots:[shot]}));return shot;
 }
 let legacyShot=legacyFixture();const legacySnapshot=JSON.stringify(legacyShot);assert.equal(count(legacyShot,'HOLD'),1,'valid old failure consumes the HOLD repair');assert.equal(count(legacyShot,'ENTRY'),0,'fully attributed HOLD failure is not ENTRY debt');assert.equal(JSON.stringify(legacyShot),legacySnapshot);
 assert.equal(count({...legacyShot,fullFrameRepairHistory:[...legacyShot.fullFrameRepairHistory,...legacyShot.fullFrameRepairHistory]},'HOLD'),1);
 for(const mutate of [r=>r.status='PASS',r=>r.actorType='USER',r=>delete r.reviewerId,r=>r.image.sha256='f'.repeat(64),r=>r.reference.state='ENTRY',r=>r.reference.sourceFrame=11,r=>r.reference.sha256='e'.repeat(64),r=>delete r.image,r=>r.productionAdmission=true,r=>r.visualApproval=true])assert.throws(()=>count(legacyFixture(mutate),'HOLD'),/LEGACY_OBSERVATION_BINDING/);
 legacyShot=legacyFixture();const badReviewSha=structuredClone(legacyShot);badReviewSha.fullFrameRepairHistory[0].sourceReview.sha256='f'.repeat(64);assert.throws(()=>count(badReviewSha,'HOLD'),/REVIEW_SHA_CHANGED/);
 const foreignImage=path.join(root,'work','another-task','old-core.png');fs.mkdirSync(path.dirname(foreignImage),{recursive:true});fs.writeFileSync(foreignImage,imageBytes);assert.throws(()=>count(legacyFixture(r=>r.image.path=path.relative(root,foreignImage)),'HOLD'),/LEGACY_IMAGE_PATH/);
 legacyShot=legacyFixture();const ownerFile=path.join(taskRoot,'shot-task-plan-v1.json'),owner=JSON.parse(fs.readFileSync(ownerFile));owner.projectId='another-task';fs.writeFileSync(ownerFile,JSON.stringify(owner));assert.throws(()=>count(legacyShot,'HOLD'),/LEGACY_TASK_OWNER/);
 legacyShot=legacyFixture();const moved=path.join(taskRoot,'production-batches','moved-observation','visual-review.json');fs.mkdirSync(path.dirname(moved),{recursive:true});fs.copyFileSync(observationFile,moved);const movedShot=structuredClone(legacyShot);movedShot.fullFrameRepairHistory[0].sourceReview.path=path.relative(root,moved);assert.throws(()=>count(movedShot,'HOLD'),/REVIEW_SCOPE/,'legacy observations never become formal batch reviews by moving the file');
 legacyShot=legacyFixture();fs.appendFileSync(imageFile,'changed');assert.throws(()=>count(legacyShot,'HOLD'),/LEGACY_IMAGE_SHA_CHANGED/);fs.writeFileSync(imageFile,imageBytes);
 legacyShot=legacyFixture();fs.appendFileSync(referenceFile,'changed');assert.throws(()=>count(legacyShot,'HOLD'),/LEGACY_REFERENCE_SHA_CHANGED/);fs.writeFileSync(referenceFile,referenceBytes);
 legacyShot=legacyFixture();const alias=path.join(taskRoot,'source-work-orders','legacy','alias.json');fs.symlinkSync(observationFile,alias);const aliasShot=structuredClone(legacyShot);aliasShot.fullFrameRepairHistory[0].sourceReview.path=path.relative(root,alias);assert.throws(()=>count(aliasShot,'HOLD'),/REVIEW_PATH/);
 console.log('PASS owned legacy A1AgentPixelObservation FAIL counts once from pinned observation, real image/reference bytes and incumbent history; invalid/missing bindings reject, moved review cannot masquerade as batch PASS.');
 console.log('PASS per-state repair accounting from pinned VISUAL_FAIL receipts, legacy conservative debt, independent first repair, one repair per state, duplicate deduplication, goal/reference isolation and forged state/SHA/pixels/path/receipt rejection. No production writes.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
