import assert from 'node:assert/strict';
import {prepareStateGoalRetentionV1,markProductionStateRebindV1,productionStateNeedsRebindV1,completeProductionStateRebindV1} from '../apps/studio-next/src/lib/a1-production-state-retention-v1.mjs';
import {productionFrameGoalInputV1,productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {researchStaticSampleIsCurrentV1} from '../apps/studio-next/src/lib/a1-research-static-package-binding-v1.mjs';
import {productionFrameOutputIsBoundV1} from '../apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
const names=['ENTRY','HOLD','HANDOFF'],sha=char=>char.repeat(64);let checks=0;const check=(condition,label)=>{assert.ok(condition,label);checks++;};
const shot={id:'A',sourceText:'Known source',visualJob:'Read the same object',exactCopy:['entry','hold','exit'],sourceInterval:{startFrame:0,endFrameExclusive:4},
 productionResources:{assets:[{assetId:'bitmap',path:'/fixture/bitmap.png',sha256:sha('a'),kind:'IMAGE'}],fonts:[]},
 referenceProductionDesign:{contract:'Fixture',shotId:'A',sourceVideoSha256:sha('b'),viewerIntent:'whole-shot fallback',appearance:{composition:'fallback',palette:'gray',surface:'flat'},references:names.map((state,i)=>({state,sourceFrame:i,path:'/fixture/reference'+i,sha256:sha('c')})),layers:[{id:'bitmap',assetIds:['bitmap']}],states:names.map((state,i)=>({state,visibleLayerIds:['bitmap'],visibleCopyIndices:[i],viewerNotice:state+' notice',appearance:{composition:state,palette:'gray',surface:'flat'}}))},
 productionLayout:{contract:'A1ProductionStateLayouts/v1',mode:'STATIC',canvas:{width:1920,height:1080},states:names.map((state,i)=>({state,copyIndices:[i],layers:[{id:'bitmap',assetId:'bitmap',kind:'ASSET',box:{x:0,y:0,width:1,height:1}}]}))},
 fullFrameRequests:names.map((state,i)=>({state,nodeId:'producer-'+i,requestSha256:sha('d'),reference:{sourceFrame:i,sha256:sha('c')}})),
 fullFrameComposition:{contract:'A1FullFrameComposition/v1',requestNodeIds:names.map((_,i)=>'producer-'+i)}};
const plan={source:{videoSha256:sha('b')},style:{direction:'SOURCE'},shots:[shot,{...structuredClone(shot),id:'OTHER'}]};
const request={requestId:'entry-revision',basePlanSha256:nodeInputHash(plan),text:'Real scoped entry fix',status:'OPEN',states:['ENTRY'],productionAdmission:false};
const goal=state=>productionFrameGoalInputV1(plan,shot,state),before=Object.fromEntries(names.map(state=>[state,productionFrameGoalShaV1(plan,shot,state)]));
const after=structuredClone(plan),changed=after.shots[0];changed.retainedStaticStateGoals=prepareStateGoalRetentionV1({plan,shot,request,goalInputForState:goal});changed.productionRevisionRequest=request;
check(productionFrameGoalShaV1(after,changed,'HOLD')===before.HOLD,'hold identity unchanged');check(productionFrameGoalShaV1(after,changed,'HANDOFF')===before.HANDOFF,'handoff identity unchanged');check(productionFrameGoalShaV1(after,changed,'ENTRY')!==before.ENTRY,'entry invalidates');
const other=productionFrameGoalShaV1(after,after.shots[1],'HOLD');check(other===productionFrameGoalShaV1(plan,plan.shots[1],'HOLD'),'other shot unchanged');
for(const mutate of [p=>p.style.direction='NEW',p=>p.source.videoSha256=sha('f'),p=>p.shots[0].exactCopy[1]='new hold',p=>p.shots[0].productionResources.assets[0].sha256=sha('e'),p=>p.shots[0].referenceProductionDesign.references[1].sha256=sha('f'),p=>p.shots[0].productionLayout.states[1].layers[0].box.x=.1,p=>p.shots[0].unattributedPolicy='new']){
 const negative=structuredClone(after);mutate(negative);check(productionFrameGoalShaV1(negative,negative.shots[0],'HOLD')!==before.HOLD,'shared/local dependency barrier');
}
const local=structuredClone(after);local.shots[0].productionLayout.states[0].layers[0].box.x=.1;local.shots[0].exactCopy[0]='new entry';check(productionFrameGoalShaV1(local,local.shots[0],'HOLD')===before.HOLD,'entry-only copy/layout changes retain hold');
const topLevelFallback=structuredClone(after);topLevelFallback.shots[0].referenceProductionDesign.viewerIntent='new ENTRY summary';topLevelFallback.shots[0].referenceProductionDesign.appearance={composition:'entry-only',palette:'blue',surface:'paper'};check(productionFrameGoalShaV1(topLevelFallback,topLevelFallback.shots[0],'HOLD')===before.HOLD,'explicit HOLD review envelope ignores sibling top-level fallback changes');
const foreignTask=structuredClone(after),foreignParameters={copy:'entry only'};
foreignTask.shots[0].tasks=[{module:'editable-typography',dependencies:[],parameters:{staticStatePlan:{contract:'A1StaticStateExecutionPlan/v2',states:[{state:'ENTRY',copyIndices:[0],parameters:foreignParameters,parametersSha256:nodeInputHash(foreignParameters)}]}}}];
check(productionFrameGoalShaV1(foreignTask,foreignTask.shots[0],'HOLD')===before.HOLD,'new type module scoped to a sibling does not invalidate asset-only HOLD');
const malformedForeign=structuredClone(foreignTask);malformedForeign.shots[0].tasks[0].parameters.staticStatePlan.states[0].parametersSha256=sha('0');check(productionFrameGoalShaV1(malformedForeign,malformedForeign.shots[0],'HOLD')!==before.HOLD,'malformed foreign state declaration cannot bypass dependency checks');
const dependencyPlan=structuredClone(plan),dependencyShot=dependencyPlan.shots[0];
dependencyShot.tasks=[{module:'media-files',dependencies:[],parameters:{files:[]}},{module:'layer-compositor',dependencies:['media-files'],parameters:{staticStatePlan:{contract:'A1StaticStateExecutionPlan/v2',states:names.map((state,i)=>({state,copyIndices:[i],parameters:{layers:[]},parametersSha256:nodeInputHash({layers:[]})}))}}}];
const dependencyBefore=productionFrameGoalShaV1(dependencyPlan,dependencyShot,'HOLD');
dependencyShot.retainedStaticStateGoals=structuredClone(prepareStateGoalRetentionV1({plan:dependencyPlan,shot:dependencyShot,request,goalInputForState:state=>productionFrameGoalInputV1(dependencyPlan,dependencyShot,state)}));dependencyShot.productionRevisionRequest=request;
dependencyShot.tasks.push(structuredClone(foreignTask.shots[0].tasks[0]));dependencyShot.tasks[1].dependencies.push('editable-typography');
check(productionFrameGoalShaV1(dependencyPlan,dependencyShot,'HOLD')===dependencyBefore,'union compositor dependency on a sibling-only module does not affect asset-only state');
const unknownDependency=structuredClone(dependencyPlan);unknownDependency.shots[0].tasks[1].dependencies.push('unattributed-external-node');check(productionFrameGoalShaV1(unknownDependency,unknownDependency.shots[0],'HOLD')!==dependencyBefore,'unknown external dependencies remain barriers');
const whole={...request,states:undefined};check(Object.keys(prepareStateGoalRetentionV1({plan,shot,request:whole,goalInputForState:goal})).length===0,'whole-shot revisions get no local carry');
const legacy={...shot,productionLayout:undefined};check(Object.keys(prepareStateGoalRetentionV1({plan,shot:legacy,request,goalInputForState:goal})).length===0,'missing explicit inputs never assumed independent');
const broken=structuredClone(after);broken.shots[0].retainedStaticStateGoals.HOLD.sha256=sha('0');assert.throws(()=>productionFrameGoalShaV1(broken,broken.shots[0],'HOLD'),/PROOF_INVALID/);checks++;
const rebind=structuredClone(changed);markProductionStateRebindV1(rebind,['ENTRY']);check(productionStateNeedsRebindV1(rebind,'ENTRY'),'entry needs bind');check(!productionStateNeedsRebindV1(rebind,'HOLD'),'hold stays bound');check(productionFrameOutputIsBoundV1(rebind,rebind.fullFrameRequests[1]),'pipeline keeps current hold producer');
markProductionStateRebindV1(rebind,['HANDOFF']);completeProductionStateRebindV1(rebind,['ENTRY'],names);check(productionStateNeedsRebindV1(rebind,'HANDOFF'),'partial binding does not clear sibling');check(!productionStateNeedsRebindV1(rebind,'ENTRY'),'bound target clears');completeProductionStateRebindV1(rebind,['HANDOFF'],names);check(!rebind.fullFrameRebindRequired,'all scoped targets complete');
const old={fullFrameRebindRequired:true};markProductionStateRebindV1(old,['ENTRY']);check(!old.fullFrameRebindStates,'unknown legacy scope remains whole-shot');completeProductionStateRebindV1(old,['ENTRY'],names);check(old.fullFrameRebindRequired,'partial bind cannot clear legacy global marker');completeProductionStateRebindV1(old,names,names);check(!old.fullFrameRebindRequired,'complete legacy bind can clear');
const bad={fullFrameRebindRequired:true,fullFrameRebindStates:['MISSING']};assert.throws(()=>productionStateNeedsRebindV1(bad,'HOLD'),/INVALID/);checks++;
const candidate={goalInputSha256:before.HOLD},sample={state:'HOLD',sourceFrame:1};check(researchStaticSampleIsCurrentV1({plan:after,shot:changed,candidate,sample,imageSha256:sha('a'),referenceSha256:sha('c')}),'unaffected reviewed goal stays current during entry OPEN');
const failedEntry={...candidate,goalInputSha256:before.ENTRY};check(!researchStaticSampleIsCurrentV1({plan:after,shot:changed,candidate:failedEntry,sample:{state:'ENTRY',sourceFrame:0},imageSha256:sha('a'),referenceSha256:sha('c')}),'entry OPEN still rejects old candidate');
const oldScoped=structuredClone(changed);delete oldScoped.retainedStaticStateGoals;check(!researchStaticSampleIsCurrentV1({plan:after,shot:oldScoped,candidate,sample,imageSha256:sha('a'),referenceSha256:sha('c')}),'old scoped OPEN without issued proof keeps conservative stop');
const masterPlan=structuredClone(plan);masterPlan.shots[0].fullFrameRequests[1].continuity={masterTargetKey:'A:ENTRY'};
const masterBefore=productionFrameGoalShaV1(masterPlan,masterPlan.shots[0],'HOLD'),masterAfter=structuredClone(masterPlan),masterShot=masterAfter.shots[0];
masterShot.retainedStaticStateGoals=prepareStateGoalRetentionV1({plan:masterPlan,shot:masterPlan.shots[0],request,goalInputForState:state=>productionFrameGoalInputV1(masterPlan,masterPlan.shots[0],state)});masterShot.productionRevisionRequest=request;
check(productionFrameGoalShaV1(masterAfter,masterShot,'HOLD')!==masterBefore,'changing ENTRY master invalidates dependent HOLD');
const cyclePlan=structuredClone(masterPlan);cyclePlan.shots[0].fullFrameRequests[0].continuity={masterTargetKey:'A:HOLD'};
check(!prepareStateGoalRetentionV1({plan:cyclePlan,shot:cyclePlan.shots[0],request,goalInputForState:state=>productionFrameGoalInputV1(cyclePlan,cyclePlan.shots[0],state)}).HOLD,'cyclic master cannot acquire carry proof');
check(changed.retainedStaticStateGoals.HOLD.productionAdmission===false&&changed.retainedStaticStateGoals.HOLD.visualApproval===false,'retention grants no approval');
const sharedPlan=structuredClone(plan),shared=sharedPlan.shots[0];
const sharedCopy={copyIndex:1,text:'hold',status:'LOCKED',sourceKind:'VERIFIED_SOURCE_FACT_REWRITE',authorityReceiptSha256:sha('1'),verifiedAt:'2026-10-14',sourceFileSha256:sha('2'),sourceUri:'https://fixture.test/source',displayCopySha256:sha('3'),factReferences:[{pointer:'/facts/0',sourceFactSha256:sha('4')}],referenceContext:{sourceVideoSha256:sha('b'),frameNumber:0}};
shared.packagingDecision={copyBindings:[sharedCopy]};
shared.stateCopyBindings={HOLD:{contract:'A1ReferenceStateCopyBinding/v1',copyMode:'SOURCE_BOUND_STATE_EXCERPT_REWRITE',sourceVideoSha256:sha('b'),copyIndices:[1],appendedCopyIndices:[],copySha256:nodeInputHash(['hold']),copyBindings:[structuredClone(sharedCopy)]}};
const sharedBefore=productionFrameGoalShaV1(sharedPlan,shared,'HOLD');
shared.retainedStaticStateGoals=structuredClone(prepareStateGoalRetentionV1({plan:sharedPlan,shot:shared,request,goalInputForState:state=>productionFrameGoalInputV1(sharedPlan,shared,state)}));
shared.productionRevisionRequest=request;
const retirement={state:'ENTRY',retired:true,revisionId:request.requestId,exactCopy:[...shared.exactCopy],previousFields:{stateCopyBindings:structuredClone(shared.stateCopyBindings),packagingDecision:structuredClone(shared.packagingDecision)}};
shared.stateSourceInputHistory=[{...retirement,retirementSha256:nodeInputHash(retirement)}];
Object.assign(shared.packagingDecision.copyBindings[0],{authorityReceiptSha256:sha('5'),verifiedAt:'2026-10-15',sourceFileSha256:sha('6'),referenceContext:{sourceVideoSha256:sha('b'),frameNumber:1}});
check(productionFrameGoalShaV1(sharedPlan,shared,'HOLD')===sharedBefore,'sibling first-occurrence receipt change preserves the unchanged state envelope');
for(const mutate of [s=>s.stateCopyBindings.HOLD.copyBindings[0].authorityReceiptSha256=sha('7'),s=>s.packagingDecision.copyBindings[0].factReferences[0].sourceFactSha256=sha('8'),s=>s.productionLayout.states[1].layers[0].box.x=.2,s=>s.productionResources.assets[0].sha256=sha('9')]){
 const negative=structuredClone(sharedPlan);mutate(negative.shots[0]);check(productionFrameGoalShaV1(negative,negative.shots[0],'HOLD')!==sharedBefore,'shared-receipt carry rejects changed own source, facts, geometry or media');
}
const missingRetirement=structuredClone(sharedPlan);delete missingRetirement.shots[0].stateSourceInputHistory;check(productionFrameGoalShaV1(missingRetirement,missingRetirement.shots[0],'HOLD')!==sharedBefore,'receipt carry requires the exact source retirement snapshot');
console.log(JSON.stringify({status:'PASS',checks,providerCalls:0,scope:'PURE_STATE_RETENTION_FIXTURES'}));
