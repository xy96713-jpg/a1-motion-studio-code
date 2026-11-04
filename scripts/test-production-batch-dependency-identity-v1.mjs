import assert from 'node:assert/strict';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {projectBatchDependencyInputsV1,createCompletedBatchDependencyIdentityV1} from '../apps/studio-next/src/lib/a1-production-batch-dependency-identity-v1.mjs';
const entry=id=>({id,sourceText:id,visualJob:'Fixture '+id,exactCopy:[],tasks:[{module:'media-files',dependencies:[],parameters:{sourceSha256:'a'.repeat(64)}}]});
const plan={projectId:'fixture',source:{videoSha256:'a'.repeat(64)},style:{palette:'fixed'},visualQualityPolicy:{mode:'STRICT'},shots:[entry('A'),entry('B'),entry('master')],assetTasks:[{...entry('shared'),resourceOnly:true,consumerShotIds:['A','B']},{...entry('unrelated-asset'),resourceOnly:true,consumerShotIds:['B']}]};
const node=id=>({id:id+':media-files',shotId:id,module:'media-files',state:'succeeded',inputSha256:nodeInputHash(id),dependencies:[],result:{fixture:id},acceptance:{inputSha256:nodeInputHash(id),manifestSha256:nodeInputHash('manifest-'+id),sourceResultSha256:nodeInputHash({fixture:id})}});
const workflow={nodes:[...plan.shots,...plan.assetTasks].map(s=>node(s.id))};
workflow.nodes.find(n=>n.shotId==='A').dependencies=['shared:media-files'];workflow.nodes.find(n=>n.shotId==='shared').dependencies=['master:media-files'];
const project=(p=plan,w=workflow)=>projectBatchDependencyInputsV1({plan:p,workflow:w,shotIds:['A']});
const expected=project();assert.deepEqual(expected.dependencyOwnerIds,['A','master','shared']);
const same=[p=>p.shots[1].exactCopy.push('Only B changed'),p=>p.assetTasks[1].tasks[0].parameters.sourceSha256='b'.repeat(64),p=>p.assetTasks[0].consumerShotIds=['A'],p=>p.activeWorkScope={shotIds:['B']},p=>p.shots[0].wholeFrameReview={status:'PASS'}];
for(const edit of same){const changed=structuredClone(plan);edit(changed);assert.deepEqual(project(changed),expected);}
const changed=[p=>p.shots[0].exactCopy.push('A changed'),p=>p.shots[2].visualJob='New master',p=>p.assetTasks[0].tasks[0].parameters.sourceSha256='b'.repeat(64),p=>p.source.videoSha256='b'.repeat(64),p=>p.style.palette='new',p=>p.visualQualityPolicy.mode='relaxed',p=>p.editorialBrief={objective:'Different story'},p=>p.shots.reverse(),p=>p.unknownGlobalContract={newFlag:true}];
for(const edit of changed){const next=structuredClone(plan);edit(next);assert.notEqual(project(next).contentSha256,expected.contentSha256);}
const edge=structuredClone(workflow);edge.nodes.find(n=>n.shotId==='A').dependencies.push('B:media-files');assert.ok(project(plan,edge).dependencyOwnerIds.includes('B'));
const changedOutput=structuredClone(workflow);changedOutput.nodes.find(n=>n.shotId==='shared').acceptance.manifestSha256='b'.repeat(64);assert.notEqual(project(plan,changedOutput).nodeInputsSha256,expected.nodeInputsSha256);
const missing=structuredClone(workflow);missing.nodes.find(n=>n.shotId==='shared').dependencies=['missing:media-files'];assert.throws(()=>project(plan,missing),/DEPENDENCY_NODE_UNKNOWN/);
const common={plan,workflow,shotIds:['A'],result:{taskId:'fixture',phaseId:'complete',executionContentSha256:'e'.repeat(64),outputs:[{shotId:'A',nodeId:'A:media-files'}],completion:{requested:1,technicallyComplete:1}}};
assert.ok(createCompletedBatchDependencyIdentityV1(common).proof);
const retired=structuredClone(workflow);retired.nodes.push({id:'A:unused-legacy',shotId:'A',module:'image-generation',state:'blocked',dependencies:[],inputSha256:'f'.repeat(64)});
assert.ok(createCompletedBatchDependencyIdentityV1({...common,workflow:retired}).proof,'unconsumed retired nodes do not block a complete deliverable');
const partial=createCompletedBatchDependencyIdentityV1({...common,result:{...common.result,completion:{requested:1,technicallyComplete:0}}});assert.equal(partial.proof,null);
const unknown=createCompletedBatchDependencyIdentityV1({...common,workflow:missing});assert.equal(unknown.proof,null);assert.match(unknown.reason,/UNKNOWN/);
const running=structuredClone(workflow);running.nodes.find(n=>n.shotId==='shared').state='running';assert.equal(createCompletedBatchDependencyIdentityV1({...common,workflow:running}).proof,null);
console.log(JSON.stringify({status:'PASS',unrelatedMutationsPreserved:same.length,relevantMutationsRejected:changed.length,transitiveDependencies:true,changedDependencyOutputsDetected:true,unknownGraphAndPartialBatchUseLegacyGate:true,providers:0,renders:0}));
