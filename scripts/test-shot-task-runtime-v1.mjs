import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {nodeWorkflowInput} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
import {compileNodeWorkflow, claimNodeTasks, finishNodeTask, checkpointNodeTask, resumeNodeProviderJob} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
import {createRemoteGenerationAdapterV1} from '../apps/studio-next/src/lib/a1-node-remote-generation-adapter-v1.mjs';
import {mediaFileNodeAdapterV1, mediaSha256} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';
import {withProjectLock, persistNodeWorkflowState, readNodeWorkflowState, projectDirs} from '../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs';
import {selectScopedShotTaskNodeIdsV1, shotTaskAdaptersV1, runShotTaskActionV1, readShotTaskRuntimeV1, syncShotTaskRuntimeV1, recordShotTaskVisualReviewV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {projectShotTaskCapabilityCoverageV1} from '../apps/studio-next/src/lib/a1-shot-task-capability-coverage-v1.mjs';
import {hasResearchOnlyCompositionSourceBoundaryV1} from './run-hupo-69-shot-research-reconstruction-v1.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-shot-task-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
fs.writeFileSync(path.join(root, 'asset.png'), png);
const asset = {path: path.join(root, 'asset.png'), sha256: mediaSha256(png), role: 'original-image', kind: 'IMAGE', referenceOnly: false};
let submissions = 0, queries = 0;
const provider = createRemoteGenerationAdapterV1({providerId: 'test-provider', version: 1,
  submit: async () => {submissions++; return {jobId: 'saved-job'};},
  query: async (id) => {assert.equal(id, 'saved-job'); queries++; return {status: 'pending'};}, collect: async () => [asset]});
const remotePlan = {contract: 'A1ShotTaskPlan/v1', projectId: 'test-film', scope: 'RESEARCH_ONLY', productionAdmission: false,
  shots: [{id:'scene-a', sourceText:'Speaker explains a mechanism', visualJob:'Original illustration', tasks: [{module:'ai-video', dependencies:[], parameters:{submitAuthorized:true}}]}]};
const {definitions} = createNodeAdapterRegistry({'ai-video': provider});
const routedPlan=structuredClone(remotePlan);
routedPlan.shots[0].tasks=[
  {module:'material',dependencies:[],parameters:{research:{networkDecision:'REQUIRED'}}},
  {module:'layer-compositor',dependencies:['material'],parameters:{output:'preview'}},
];
assert.doesNotThrow(()=>compileShotTaskWorkspaceV1(routedPlan));
const currentResearchPlan=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'../work/hupo-69-shot-reconstruction-v1/shot-task-plan-v1.json'),'utf8'));
const decisionWorkspace=compileShotTaskWorkspaceV1(currentResearchPlan);
const decisionShots=nodeWorkflowInput(decisionWorkspace).shots;
assert.deepEqual(decisionShots.filter(shot=>shot.packagingDecision).map(shot=>shot.id).sort(),
  currentResearchPlan.shots.filter(shot=>shot.packagingDecision).map(shot=>shot.id).sort(),
  'every declared packaging decision survives workspace projection');
const missingSourcePlan=structuredClone(currentResearchPlan);
missingSourcePlan.shots.find(shot=>shot.id==='P12').packagingDecision.sourceBindings=[];
missingSourcePlan.shots.find(shot=>shot.id==='P12').packagingDecision.narrativeRole='PERSON_IDENTITY';
const missingSourceShots=nodeWorkflowInput(compileShotTaskWorkspaceV1(missingSourcePlan)).shots;
assert.ok(missingSourceShots.find(shot=>shot.id==='P12').packagingDecision.blockers.includes('PACKAGING_REQUIRED_SOURCE_NOT_BOUND'),
  'an explicitly missing source is blocked independently of the changing live source qualification');
assert.equal(decisionShots.find(shot=>shot.id==='P23').packagingDecision.status,'READY_FOR_REVIEW');
const p23Plan=currentResearchPlan.shots.find(s=>s.id==='P23');
if(p23Plan.referenceLayoutMigration)assert.ok(!decisionShots.find(shot=>shot.id==='P23').moduleDependencies['layer-compositor'].includes('image-generation'),'compiled reuse never requests fresh generation');
else assert.ok(decisionShots.find(shot=>shot.id==='P23').moduleDependencies['layer-compositor'].includes('image-generation'));
assert.ok(decisionShots.find(shot=>shot.id==='P23').moduleDependencies['layer-compositor'].includes('editable-typography'));
assert.equal(decisionShots.find(shot=>shot.id==='P23').moduleNodeDependencies['layer-compositor'],undefined,
  'P23 composes its own green shell and dual-module art without a cross-shot P22 asset');
assert.ok(!decisionShots.find(shot=>shot.id==='P23').packagingDecision.blockers.includes('PACKAGING_REQUIRED_SOURCE_NOT_BOUND'));
let graph = compileNodeWorkflow(nodeWorkflowInput(compileShotTaskWorkspaceV1(remotePlan)), null, {moduleDefinitions: definitions});
const run = async () => {
  const claimed = claimNodeTasks(graph, {workerId:'test'}); graph = claimed.workflow;
  assert.equal(claimNodeTasks(graph, {workerId:'duplicate'}).claims.length, 0);
  const node = claimed.claims[0];
  const result = await provider.execute(node, {artifactRoot:root, checkpoint:async (progress) => {
    graph = checkpointNodeTask(graph, node, progress); return graph.nodes.find(n=>n.id===node.id).progress;
  }});
  graph = finishNodeTask(graph, node, result);
};
await run();
for (let i=0;i<4;i++) {graph = JSON.parse(JSON.stringify(graph)); graph = resumeNodeProviderJob(graph,'scene-a:ai-video'); await run();}
assert.equal(submissions,1); assert.equal(queries,5); assert.equal(graph.nodes.find(n=>n.id==='scene-a:ai-video').attempt,1);
const changedRemotePlan=structuredClone(remotePlan);changedRemotePlan.shots[0].tasks[0].parameters.prompt='new prompt';
assert.throws(()=>compileNodeWorkflow(nodeWorkflowInput(compileShotTaskWorkspaceV1(changedRemotePlan)),graph,{moduleDefinitions:definitions}),/provider-input-change-requires-reconciliation/);
assert.throws(()=>compileNodeWorkflow(nodeWorkflowInput(compileShotTaskWorkspaceV1(remotePlan)),graph,{moduleDefinitions:{...definitions,'ai-video':{...definitions['ai-video'],implementationSha256:'c'.repeat(64)}}}),/provider-input-change-requires-reconciliation/);
const uncertain = createRemoteGenerationAdapterV1({providerId:'test-provider',version:1,submit:async()=>{throw Error('lost response');},query:async()=>{},collect:async()=>[]});
const progress = {contract:'A1NodeExecutionProgress/v1',inputSha256:'a'.repeat(64),provider:'test-provider',status:'SUBMITTING',productionAdmission:false};
const stalled = await uncertain.execute({inputSha256:progress.inputSha256,progress,input:{parameters:{submitAuthorized:true}}},{checkpoint:async()=>{throw Error('must not resubmit');}});
assert.equal(stalled.reason,'REMOTE_SUBMISSION_RECONCILIATION_REQUIRED');
assert.equal((await mediaFileNodeAdapterV1.execute({input:{parameters:{files:[{...asset,referenceOnly:true}]}}},{artifactRoot:root})).reason,'REFERENCE_MEDIA_FORBIDDEN');
assert.equal((await mediaFileNodeAdapterV1.execute({input:{parameters:{files:[{...asset,role:'verified-evidence'}]}}},{artifactRoot:root})).reason,'SOURCE_IDENTITY_UNVERIFIED');
const base = structuredClone(remotePlan); base.shots[0].tasks = [
  {module:'media-files',dependencies:[],parameters:{files:[asset]}},
  {module:'editable-typography',dependencies:[],parameters:{exactCopy:'A'}},
  {module:'remotion-render',dependencies:['media-files','editable-typography'],parameters:{output:'still'}}];
base.shots[0].exactCopy=['A'];
base.shots.push({id:'scene-b',sourceText:'Independent scene',visualJob:'Unchanged',tasks:[{module:'media-files',dependencies:[],parameters:{files:[asset]}}]});
const defs = createNodeAdapterRegistry(shotTaskAdaptersV1).definitions;
const before = compileNodeWorkflow(nodeWorkflowInput(compileShotTaskWorkspaceV1(base)),null,{moduleDefinitions:defs});
base.shots[0].exactCopy=['B'];base.shots[0].tasks[1].parameters.exactCopy='B';
const after = compileNodeWorkflow(nodeWorkflowInput(compileShotTaskWorkspaceV1(base)),before,{moduleDefinitions:defs});
assert.deepEqual(after.nodes.filter((n,i)=>n.inputSha256!==before.nodes[i].inputSha256).map(n=>n.id),['scene-a:typography','scene-a:editable-typography','scene-a:remotion-render']);
// Real file-store concurrency: an isolated blocked shot must not stop two independent file jobs.
base.shots[0].tasks=[{module:'media-files',dependencies:[],parameters:{files:[asset]}}];
base.shots.push({id:'missing-source',sourceText:'Unknown source',visualJob:'Evidence',tasks:[{module:'media-files',dependencies:[],parameters:{},blocker:'SOURCE_MISSING'}]});
const taskDir=path.join(root,'work/test-film');fs.mkdirSync(taskDir,{recursive:true});fs.writeFileSync(path.join(taskDir,'shot-task-plan-v1.json'),JSON.stringify(base));
await Promise.all([runShotTaskActionV1({repoRoot:root,taskId:'test-film',action:'tick',workerId:'one'}),runShotTaskActionV1({repoRoot:root,taskId:'test-film',action:'tick',workerId:'two'})]);
const saved=readShotTaskRuntimeV1({repoRoot:root,taskId:'test-film'}).workflow;
assert.equal(saved.nodes.filter(n=>n.state==='needs-review').length,2);
assert.equal(saved.nodes.find(n=>n.id==='missing-source:media-files').state,'blocked');
assert.ok(saved.nodes.every(n=>n.attempt<=1));
const visualTarget=saved.nodes.find(n=>n.id==='scene-a:media-files'),visualArtifactSha=visualTarget.result.artifactManifest.artifacts[0].sha256;
recordShotTaskVisualReviewV1({repoRoot:root,taskId:'test-film',nodeId:visualTarget.id,inputSha256:visualTarget.inputSha256,reviewerId:'synthetic-visual-reviewer',
  status:'PASS',findings:[],reviewedArtifactSha256:[visualArtifactSha]});
const visualSaved=readShotTaskRuntimeV1({repoRoot:root,taskId:'test-film'}).workflow.nodes.find(n=>n.id===visualTarget.id);
assert.equal(visualSaved.visualReview.status,'PASS');assert.equal(visualSaved.visualReview.productionAdmission,false);
assert.throws(()=>recordShotTaskVisualReviewV1({repoRoot:root,taskId:'test-film',nodeId:visualTarget.id,inputSha256:'0'.repeat(64),reviewerId:'synthetic-visual-reviewer',
  status:'PASS',findings:[],reviewedArtifactSha256:[visualArtifactSha]}),/mismatch/u);
const coverage=readShotTaskRuntimeV1({repoRoot:root,taskId:'test-film'}).coverage;
assert.equal(coverage.modules.find(module=>module.id==='ai-video').status,'NOT_PLANNED');
assert.equal(coverage.packagingDecisionCount,0);
assert.ok(coverage.unreviewedModules.includes('ai-video'));
assert.deepEqual(coverage.routeGaps,[]);
const badCoverage=structuredClone(base);
badCoverage.capabilityDecisions={'ai-video':{disposition:'DEFERRED',reason:''}};
assert.throws(()=>projectShotTaskCapabilityCoverageV1(badCoverage,saved,defs), /capability-decision-invalid/);
assert.equal(coverage.modules.find(module=>module.id==='external-media-discovery').status,'NOT_PLANNED');
assert.equal(coverage.modules.find(module=>module.id==='media-files').selectedShots,3);
const routingMissing=structuredClone(base);
routingMissing.capabilityDecisions={};
fs.writeFileSync(path.join(taskDir,'shot-task-plan-v1.json'),JSON.stringify(routingMissing));
await assert.rejects(runShotTaskActionV1({repoRoot:root,taskId:'test-film',action:'tick'}), /capability-routing-review-required/);
fs.writeFileSync(path.join(taskDir,'shot-task-plan-v1.json'),JSON.stringify(base));
// A changed plan token cannot execute newer inputs from an older tab.
await assert.rejects(runShotTaskActionV1({repoRoot:root,taskId:'test-film',action:'tick',expectedPlanSha256:'0'.repeat(64)}), /plan-changed/);
// A compiler projection change must be visible even when the plan SHA is unchanged.
const workspaceFile=path.join(projectDirs(readShotTaskRuntimeV1({repoRoot:root,taskId:'test-film'}).appRoot).publicDir,'workspace.json');
const storedWorkspace=JSON.parse(fs.readFileSync(workspaceFile,'utf8'));
storedWorkspace.visualBible.unexpectedProjection=true;
fs.writeFileSync(workspaceFile,JSON.stringify(storedWorkspace));
assert.equal(readShotTaskRuntimeV1({repoRoot:root,taskId:'test-film'}).pending,true);
assert.equal(syncShotTaskRuntimeV1({repoRoot:root,taskId:'test-film'}).pending,false);
const mismatched=structuredClone(remotePlan);
mismatched.shots[0].exactCopy=['NEW']; mismatched.shots[0].tasks=[{module:'editable-typography',dependencies:[],parameters:{exactCopy:'OLD'}}];
assert.throws(()=>compileShotTaskWorkspaceV1(mismatched),/exact-copy-mismatch/);
// Simulate a crash after a claim, then edit inputs. Expired claims must not prevent recovery.
const runtime=readShotTaskRuntimeV1({repoRoot:root,taskId:'test-film'});
withProjectLock(runtime.appRoot,()=>{
 const saved=readNodeWorkflowState(runtime.appRoot), next=structuredClone(saved);
 const node=next.nodes.find(n=>n.id==='scene-a:media-files'); node.state='running'; node.lease={workerId:'dead',token:'expired',expiresAt:1};
 persistNodeWorkflowState(runtime.appRoot,next,{expectedRevision:saved.revision,expectedWorkspaceSha256:saved.workspaceSha256});
});
base.shots[0].tasks[0].parameters.revisionNote='changed-after-crash';
fs.writeFileSync(path.join(taskDir,'shot-task-plan-v1.json'),JSON.stringify(base));
assert.equal(readShotTaskRuntimeV1({repoRoot:root,taskId:'test-film'}).coverage.pending,true);
const synced=syncShotTaskRuntimeV1({repoRoot:root,taskId:'test-film'});
assert.equal(synced.pending,false);
assert.equal(synced.workflow.nodes.find(n=>n.id==='scene-a:media-files').attempt,0);
await runShotTaskActionV1({repoRoot:root,taskId:'test-film',action:'tick'});
assert.equal(readShotTaskRuntimeV1({repoRoot:root,taskId:'test-film'}).workflow.nodes.find(n=>n.id==='scene-a:media-files').state,'needs-review');
// Cross-project claims share one budget. Hold two jobs while another project dispatches.
let release; const held=new Promise(resolve=>{release=resolve;});
const delayed={...mediaFileNodeAdapterV1,execute:async(node,ctx)=>{await held;return mediaFileNodeAdapterV1.execute(node,ctx);}};
for(const name of ['capacity-a','capacity-b']){
 const p=structuredClone(base);p.projectId=name;p.shots=p.shots.slice(0,2);const dir=path.join(root,'work',name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'shot-task-plan-v1.json'),JSON.stringify(p));
}
const first=runShotTaskActionV1({repoRoot:root,taskId:'capacity-a',action:'tick',adapters:{...shotTaskAdaptersV1,'media-files':delayed}});
const second=await runShotTaskActionV1({repoRoot:root,taskId:'capacity-b',action:'tick'});
assert.ok(second.workflow.nodes.every(n=>n.attempt===0));release();await first;
// Live cross-shot DAG edges propagate only to consumers and reject cycles.
const cross=structuredClone(base);cross.shots=cross.shots.slice(0,2);
cross.shots[1].tasks=[{module:'remotion-render',dependencies:[],crossShotDependencies:[{nodeId:'scene-a:media-files',artifactKinds:['IMAGE']}],parameters:{output:'still'}}];
const crossCompile=(p,previous=null)=>compileNodeWorkflow(nodeWorkflowInput(compileShotTaskWorkspaceV1(p)),previous,{moduleDefinitions:defs});
const crossBefore=crossCompile(cross);
assert.deepEqual(crossBefore.nodes.find(n=>n.id==='scene-b:remotion-render').dependencies,['scene-a:media-files']);
cross.shots[0].tasks[0].parameters.files[0].sha256='f'.repeat(64);
const crossAfter=crossCompile(cross,crossBefore);
assert.deepEqual(crossAfter.nodes.filter((n,i)=>n.inputSha256!==crossBefore.nodes[i].inputSha256).map(n=>n.id),['scene-a:media-files','scene-b:remotion-render']);
cross.shots[0].tasks[0].crossShotDependencies=[{nodeId:'scene-b:remotion-render',artifactKinds:['IMAGE']}];
assert.throws(()=>crossCompile(cross),/dependency-cycle/);
const sourceSha='7'.repeat(64),compositeShot={id:'P23',tasks:[{module:'layer-compositor',parameters:{compositionCanvas:{sourceVideoSha256:sourceSha},
  compositionIntent:{contract:'A1NodeLayerCompositionIntent/v1',layers:[
    {dependencyNodeId:'P23:media-files',artifactRole:'p23-shell',artifactKind:'IMAGE'},
    {dependencyNodeId:'P23:editable-typography',artifactRole:'typography-plane-front-artwork-overlay',artifactKind:'IMAGE'},
  ]}}}]};
assert.equal(hasResearchOnlyCompositionSourceBoundaryV1(compositeShot,sourceSha),true,'same-shot, role-bound text/media layers are eligible for review-only inventory');
const crossShotComposite=structuredClone(compositeShot);crossShotComposite.tasks[0].crossShotDependencies=[{nodeId:'P22:image-generation'}];
assert.equal(hasResearchOnlyCompositionSourceBoundaryV1(crossShotComposite,sourceSha),false,'cross-shot media cannot enter the no-source-pixels review inventory');
const sourceFrameComposite=structuredClone(compositeShot);sourceFrameComposite.tasks[0].parameters.compositionIntent.layers[0].dependencyNodeId='P23:recording';
assert.equal(hasResearchOnlyCompositionSourceBoundaryV1(sourceFrameComposite,sourceSha),false,'recording/source-frame layers are excluded from generated candidate inventory');
const remoteScope=structuredClone(remotePlan);remoteScope.projectId='orphan-provider';
const remoteDir=path.join(root,'work',remoteScope.projectId);fs.mkdirSync(remoteDir,{recursive:true});fs.writeFileSync(path.join(remoteDir,'shot-task-plan-v1.json'),JSON.stringify(remoteScope));
const remoteState=await runShotTaskActionV1({repoRoot:root,taskId:remoteScope.projectId,action:'tick',adapters:{...shotTaskAdaptersV1,'ai-video':provider}});
withProjectLock(remoteState.appRoot,()=>{const saved=readNodeWorkflowState(remoteState.appRoot),next=structuredClone(saved);const n=next.nodes.find(n=>n.module==='ai-video');n.state='running';n.lease={workerId:'crashed',token:'expired',expiresAt:1};persistNodeWorkflowState(remoteState.appRoot,next,{expectedRevision:saved.revision,expectedWorkspaceSha256:saved.workspaceSha256});});
const capacity=structuredClone(base);capacity.projectId='capacity-c';capacity.shots=capacity.shots.slice(0,2);const capacityDir=path.join(root,'work',capacity.projectId);fs.mkdirSync(capacityDir,{recursive:true});fs.writeFileSync(path.join(capacityDir,'shot-task-plan-v1.json'),JSON.stringify(capacity));
const limited=await runShotTaskActionV1({repoRoot:root,taskId:capacity.projectId,action:'tick'});assert.equal(limited.workflow.nodes.filter(n=>n.attempt===1).length,1);
console.log('PASS: duplicate claims; persisted job poll/restart; ambiguous submit no resubmit; copy-only invalidation; isolated source block; reference media rejected; stale tab rejection; copy authority; expired claim recovery; cross-project capacity=2; cross-shot dependency propagation and cycle rejection. Provider is a test fixture, no remote generation performed.');
fs.rmSync(root,{recursive:true,force:true});

const scopedWorkflow={nodes:[{id:'request:media-files'},{id:'request:editable-typography'},{id:'unrelated:media-files'}]};
assert.deepEqual(selectScopedShotTaskNodeIdsV1(scopedWorkflow,['request:editable-typography']),['request:editable-typography']);
assert.throws(()=>selectScopedShotTaskNodeIdsV1(scopedWorkflow,['missing:node']),/scope-invalid/);
console.log(JSON.stringify({status:'PASS_REQUEST_OWNED_DISPATCH_SCOPE',checks:2,unrelatedClaims:0}));

assert.deepEqual(selectScopedShotTaskNodeIdsV1(scopedWorkflow,undefined,['request:media-files','request:editable-typography']),['unrelated:media-files']);
console.log(JSON.stringify({status:'PASS_ORDINARY_TICK_CANNOT_CLAIM_REQUEST_OWNED_NODES',checks:1}));
