import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {stateClaimTargetV1,verifyStateClaimReviewV1,readStateClaimReviewV1,assertStateClaimsAllowFrameV1,imagegenSourceClaimGapsV1} from '../apps/studio-next/src/lib/a1-state-source-claim-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1,runShotTaskActionV1,claimShotImagegenToolV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1,closeProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
import {claimProductionFrameToolsV1} from '../apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs';
import {imagegenToolRequestV1} from '../apps/studio-next/src/lib/a1-node-imagegen-tool-adapter-v1.mjs';
import {adoptSourcedFrameInputsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {runProductionFramePlannerV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'state-claim-'))),fixtures=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');return {path:path.relative(root,file),sha256:hash(fs.readFileSync(file))};};
try {
for(const genre of ['typography','editorial-comparison','source-explainer']){
 const taskId='claim-'+genre,dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
 const ref=path.join(dir,'reference.png');fs.writeFileSync(ref,'mock source fixture');
 const source=path.join(dir,'source.html');fs.writeFileSync(source,'<table><tr><td>Entity AlphaX</td><td>Family Alpha</td></tr><tr><td>Entity Alpha</td><td>Family Alpha</td></tr></table>');
 const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:'a'.repeat(64)},
 visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},
 shots:[{id:'scene',sourceText:'The object relationship needs checking',visualJob:'Read this relation',sourceInterval:{startFrame:0,endFrameExclusive:10},exactCopy:['Entity Alpha is derived from Entity Beta'],
 tasks:[{module:'media-files',dependencies:[],parameters:{files:[]},blocker:'FIXTURE_ONLY'}],referenceProductionDesign:{contract:'A1ReferenceProductionDesign/v1',shotId:'scene',sourceVideoSha256:'a'.repeat(64),viewerIntent:'Read the current claim',appearance:{composition:'Single focus',palette:'Neutral',surface:'Flat'},
 references:['ENTRY','HOLD'].map((state,i)=>({state,sourceFrame:i+1,path:ref,sha256:hash(fs.readFileSync(ref))})),layers:[{id:'text',role:'TEXT',sourceMode:'AUTO',assetIds:[],copyIndices:[0],treatment:'NONE',purpose:'Read the claim'}],
 states:['ENTRY','HOLD'].map(state=>({state,viewerNotice:'Read the claim',visibleLayerIds:['text'],visibleCopyIndices:[0]})),acceptance:[],uncertainties:[]}}]};
 const shot=plan.shots[0],review={contract:'A1StateSourceClaimReview/v1',scope:'RESEARCH_ONLY',reviewerRole:'AGENT',reviewerId:'fixture-reviewer',productionAdmission:false,visualApproval:false,mediaIdentityVerified:false,
 target:stateClaimTargetV1(plan,shot,'HOLD'),evidence:[{kind:'HTML_TABLE_ROW',file:{path:path.relative(root,source),sha256:hash(fs.readFileSync(source))},url:'https://docs.example.test/source',locator:'Exact complete table row',cells:['Entity Alpha','Family Alpha']}],
 claims:[{id:'relation',kind:'RESEARCH_CLAIM',text:shot.exactCopy[0],anchor:{kind:'DESIGNED_COPY',copyIndex:0},verdict:'UNSUPPORTED',reason:'A family listing does not establish the proposed derivation.',evidenceIndices:[0]}]};
 assert.equal(verifyStateClaimReviewV1({repoRoot:root,plan,shot,state:'HOLD',review}).factualGaps.length,1);
 const partial=structuredClone(review);partial.evidence[0].cells[0]='Entity';assert.throws(()=>verifyStateClaimReviewV1({repoRoot:root,plan,shot,state:'HOLD',review:partial}),/EXACT_TABLE_ROW/);
 const wrongState=structuredClone(review);wrongState.target.state='ENTRY';assert.throws(()=>verifyStateClaimReviewV1({repoRoot:root,plan,shot,state:'HOLD',review:wrongState}),/REVIEW_BINDING/);
 const changedCopy=structuredClone(review);changedCopy.claims[0].text='invented relation';assert.throws(()=>verifyStateClaimReviewV1({repoRoot:root,plan,shot,state:'HOLD',review:changedCopy}),/COPY_ANCHOR/);
 const author=structuredClone(review);author.evidence=[];author.claims[0]={...author.claims[0],kind:'AUTHOR_STATEMENT',verdict:'NOT_APPLICABLE',evidenceIndices:[]};
 assert.equal(verifyStateClaimReviewV1({repoRoot:root,plan,shot,state:'HOLD',review:author}).factualGaps.length,0,'an author statement does not need external research');
 const proof=path.join(dir,'first-party.json');fs.writeFileSync(proof,'{"scope":"fixture source bytes, not actual action proof"}');
 const product=structuredClone(review);product.evidence=[{kind:'FIRST_PARTY_ARTIFACT',file:{path:path.relative(root,proof),sha256:hash(fs.readFileSync(proof))},locator:'Owned fixture source'}];product.claims[0].kind='FIRST_PARTY_PRODUCT_PROOF';product.claims[0].verdict='SUPPORTED';
 assert.equal(verifyStateClaimReviewV1({repoRoot:root,plan,shot,state:'HOLD',review:product}).factualGaps.length,0,'first-party bytes and agent assessment do not require an external website');
 assert.equal(verifyStateClaimReviewV1({repoRoot:root,plan,shot,state:'HOLD',review:product}).mediaIdentityVerified,false);
 const noProof=structuredClone(product);noProof.evidence=[];noProof.claims[0].evidenceIndices=[];assert.throws(()=>verifyStateClaimReviewV1({repoRoot:root,plan,shot,state:'HOLD',review:noProof}),/FIRST_PARTY_PROOF_REQUIRED/);
 const promotion=structuredClone(review);promotion.mediaIdentityVerified=true;assert.throws(()=>verifyStateClaimReviewV1({repoRoot:root,plan,shot,state:'HOLD',review:promotion}),/REVIEW_BINDING/);
 const entryGoal=productionFrameGoalShaV1(plan,shot,'ENTRY'),holdGoal=productionFrameGoalShaV1(plan,shot,'HOLD');
 plan.assetTasks=[{id:'resource',resourceOnly:true,consumerShotIds:['scene'],sourceText:'An original source fixture object',visualJob:'Metaphor',exactCopy:[],tasks:[{module:'image-generation',dependencies:[],parameters:{submitAuthorized:true,generationRequest:{prompt:'A source fixture object',purpose:'packaging-component',transparentBackground:true}}}]}];
 shot.fullFrameRequests=[{state:'HOLD',nodeId:'resource:image-generation'}];
 save(path.join(dir,'shot-task-plan-v1.json'),plan);syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
 const prepared=await runShotTaskActionV1({repoRoot:root,taskId,action:'tick',allowedNodeIds:['resource:image-generation']});
 assert.equal(prepared.workflow.nodes.find(n=>n.id==='resource:image-generation').reason,'IMAGEGEN_TOOL_PENDING');
 const reviewFile=save(path.join(dir,'review.json'),review),units=save(path.join(dir,'units.json'),{units:[{shotId:'scene',state:'HOLD',copyMode:'REFERENCE_STATE_CLAIM_REVIEW',review:reviewFile}]});
 const adoption={repoRoot:root,taskId,phaseId:'adopt-'+genre};activateProductionPhaseV1({...adoption,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId:'fixture',approvalEvidence:'Pure qualification fixture, no provider',shotIds:['scene'],metadata:{units}});
 await adoptSourcedFrameInputsV1(adoption);const current=readShotTaskRuntimeV1({repoRoot:root,taskId}),bound=current.plan.shots[0];assert.equal(current.pending,false);
 assert.equal(productionFrameGoalShaV1(current.plan,bound,'ENTRY'),entryGoal);assert.notEqual(productionFrameGoalShaV1(current.plan,bound,'HOLD'),holdGoal);
 assert.deepEqual(bound.exactCopy,shot.exactCopy);assert.deepEqual(bound.tasks,shot.tasks);
 assert.throws(()=>assertStateClaimsAllowFrameV1({repoRoot:root,plan:current.plan,shot:bound,state:'HOLD',route:'GENERATE'}),/FACTUAL_CLAIM_UNRESOLVED/);
 assert.ok(current.generationPreflight['resource:image-generation'].missing.includes('FRAME_STATE_FACTUAL_CLAIM_UNRESOLVED'));
 assert.throws(()=>claimShotImagegenToolV1({repoRoot:root,taskId,nodeId:'resource:image-generation',workerId:'must-not-claim'}),/FACTUAL_CLAIM_UNRESOLVED/);
 assert.equal(readShotTaskRuntimeV1({repoRoot:root,taskId}).workflow.nodes.find(n=>n.id==='resource:image-generation').progress.toolInvocation,undefined,'no provider invocation may be recorded for old prepared requests');
 const entryProducer=structuredClone(current.plan);entryProducer.shots[0].fullFrameRequests[0].state='ENTRY';
 assert.equal(imagegenSourceClaimGapsV1({repoRoot:root,plan:entryProducer,node:current.workflow.nodes.find(n=>n.id==='resource:image-generation')}).length,0,'the reviewed HOLD gap does not block a producer explicitly scoped only to ENTRY');
 const parentId='bridge-parent-'+genre,childId='must-not-reserve-'+genre;
 activateProductionPhaseV1({repoRoot:root,taskId,phaseId:parentId,purpose:'STATIC_FRAME_PIPELINE',ownerThreadId:'fixture',approvalEvidence:'Pure late bridge source gate fixture',shotIds:['scene'],metadata:{imageBudget:1}});
 const bridge=save(path.join(dir,'old-tool-outbox.json'),{contract:'A1ProductionFrameToolOutbox/v1',parentPhaseId:parentId,taskId,toolActions:[{taskId,parentPhaseId:parentId,phaseId:childId,workerId:'fixture',nodeId:'resource:image-generation',request:imagegenToolRequestV1(current.workflow.nodes.find(n=>n.id==='resource:image-generation'))}]});
 assert.throws(()=>claimProductionFrameToolsV1({repoRoot:root,outbox:bridge}),/FACTUAL_CLAIM_UNRESOLVED/);
 assert.equal(fs.existsSync(path.join(root,'work/module-development-launch-v1/resource-reservations','phase-activation-'+childId+'.json')),false,'reject before consuming the provider reservation');
 closeProductionPhaseV1({repoRoot:root,phaseId:parentId,outcome:'SOURCE_GATE_FIXTURE_PASS'});
 assertStateClaimsAllowFrameV1({repoRoot:root,plan:current.plan,shot:bound,state:'HOLD',route:'SOURCE_REQUIRED'});
 const evidence=save(path.join(dir,'coverage','evidence.json'),{contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:plan.source.videoSha256},stateFrames:{scene:[{state:'HOLD',sourceFrame:2,artifactPath:'reference.png',artifactSha256:hash(fs.readFileSync(ref))}]}});
 const phaseId='preflight-'+genre;activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'STATIC_FRAME_PLANNING',ownerThreadId:'fixture',approvalEvidence:'Pure zero-model source preflight',shotIds:['scene'],metadata:{targets:['scene:HOLD'],referenceEvidence:evidence,sourcePreflightOnly:true,maximumModelPasses:0}});
 let calls=0;const result=await runProductionFramePlannerV1({repoRoot:root,taskId,phaseId,executable:'/usr/bin/true',runVisualPass:async()=>{calls++;throw Error('must not call');}});
 assert.equal(calls,0);assert.equal(result.newModelCalls,0);assert.equal(result.waiting[0].route,'SOURCE_REQUIRED');
 const revised=structuredClone(review);revised.claims[0].reason='Evidence still does not establish this relation; preserve the unresolved boundary.';
 const revisedFile=save(path.join(dir,'review-v2.json'),revised);
 const replacementUnits=save(path.join(dir,'replacement-units.json'),{units:[{shotId:'scene',state:'HOLD',copyMode:'REFERENCE_STATE_CLAIM_REVIEW',review:revisedFile,replaceClaimReviewSha256:'b'.repeat(64)}]});
 const wrongPhase='replace-wrong-'+genre;activateProductionPhaseV1({repoRoot:root,taskId,phaseId:wrongPhase,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId:'fixture',approvalEvidence:'Pure replacement guard fixture',shotIds:['scene'],metadata:{units:replacementUnits}});
 await assert.rejects(adoptSourcedFrameInputsV1({repoRoot:root,taskId,phaseId:wrongPhase}),/CHANGED_RECONCILE/);
 const replacement=save(path.join(dir,'replacement-ok.json'),{units:[{shotId:'scene',state:'HOLD',copyMode:'REFERENCE_STATE_CLAIM_REVIEW',review:revisedFile,replaceClaimReviewSha256:reviewFile.sha256}]});
 const goodPhase='replace-ok-'+genre;activateProductionPhaseV1({repoRoot:root,taskId,phaseId:goodPhase,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId:'fixture',approvalEvidence:'Pure revision fixture',shotIds:['scene'],metadata:{units:replacement}});
 await adoptSourcedFrameInputsV1({repoRoot:root,taskId,phaseId:goodPhase});const updated=readShotTaskRuntimeV1({repoRoot:root,taskId}).plan.shots[0];
 assert.equal(updated.stateClaimReviewHistory[0].binding.review.sha256,reviewFile.sha256);assert.equal(updated.stateClaimReviews.HOLD.review.sha256,revisedFile.sha256);
 const atomic=async(suffix,list)=>{const phaseId='atomic-'+suffix+'-'+genre;activateProductionPhaseV1({repoRoot:root,taskId,phaseId,purpose:'FULL_FRAME_SOURCE_INPUTS',ownerThreadId:'fixture',approvalEvidence:'Pure atomic state source fixture',shotIds:['scene'],metadata:{units:save(path.join(dir,suffix+'-units.json'),{units:list})}});return adoptSourcedFrameInputsV1({repoRoot:root,taskId,phaseId});};
 const entryReview=structuredClone(review);entryReview.target=stateClaimTargetV1(current.plan,bound,'ENTRY');entryReview.claims[0].assertion='Whether the source document supports the labelled relationship';
 const entryFile=save(path.join(dir,'entry-review.json'),entryReview);
 const entryUnit={shotId:'scene',state:'ENTRY',copyMode:'REFERENCE_STATE_CLAIM_REVIEW',review:entryFile};
 const holdUnit={shotId:'scene',state:'HOLD',copyMode:'REFERENCE_STATE_CLAIM_REVIEW',review:revisedFile};
 const beforeAtomic=hash(fs.readFileSync(path.join(dir,'shot-task-plan-v1.json')));
 await assert.rejects(atomic('duplicate',[entryUnit,entryUnit]),/SOURCED_FRAME_UNITS/);
 await assert.rejects(atomic('mixed',[entryUnit,{...holdUnit,copyMode:'REFERENCE_STATE_INTENTS'}]),/SOURCED_FRAME_UNITS/);
 const invalid=structuredClone(revised);invalid.target.state='ENTRY';const badFile=save(path.join(dir,'bad-second-state.json'),invalid);
 await assert.rejects(atomic('bad-second',[entryUnit,{...holdUnit,review:badFile}]),/REVIEW_BINDING/);
 assert.equal(hash(fs.readFileSync(path.join(dir,'shot-task-plan-v1.json'))),beforeAtomic,'bad second state must not partially admit the first');
 await atomic('ok',[entryUnit,holdUnit]);const combined=readShotTaskRuntimeV1({repoRoot:root,taskId});
 assert.equal(combined.pending,false);assert.equal(Object.keys(combined.plan.shots[0].stateClaimReviews).length,2);
 assert.equal(readStateClaimReviewV1({repoRoot:root,plan:combined.plan,shot:combined.plan.shots[0],state:'ENTRY'}).claims[0].assertion,entryReview.claims[0].assertion);
 assert.deepEqual(combined.plan.shots[0].exactCopy,shot.exactCopy);
 fs.appendFileSync(source,'changed');assert.throws(()=>readStateClaimReviewV1({repoRoot:root,plan:current.plan,shot:bound,state:'HOLD'}),/SOURCE_BYTES_CHANGED/);
 fixtures.push({id:genre,genre,status:'PASS',normalSourceTransition:true,otherStateGoalPreserved:true,atomicMultipleStates:true,badSecondStateDoesNotPartiallyAdmit:true,oldPreparedToolClaimBlocked:true,knownGapModelCalls:0,sourceReviewDoesNotGrantMediaIdentity:true});
}
const report={status:'PASS',fixtures,verificationScope:'SOURCE_REVIEW_AND_ZERO_MODEL_ROUTING_CONTRACT_NOT_FACTUAL_OR_VISUAL_UNIVERSAL_QUALIFICATION',checks:['exact-row-not-prefix','own-state-copy-and-source-target','native-source-and-review-byte-binding','author-no-external-research','first-party-no-external-research','source-review-no-media-identity-promotion','original-copy-preserved','only-target-state-goal-changes','normal-source-adoption','known-gap-zero-model-route','explicit-review-revision-and-history'],productionAdmission:false};
console.log(JSON.stringify(report));if(process.argv.includes('--output')){const file=process.argv[process.argv.indexOf('--output')+1];fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
}finally{fs.rmSync(root,{recursive:true,force:true});}
