import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compileProductionLayoutV1,compileProductionPlanV1,productionLayoutInputsCurrentV1,productionLayoutReferenceDesignV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
import {createStaticStateAdapterV1} from '../apps/studio-next/src/lib/a1-static-state-adapter-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {productionInputIdentityV1} from '../apps/studio-next/src/lib/a1-production-batch-runner-v1.mjs';
import {compileNodeWorkflow} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {nodeWorkflowInput} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
import {prepareReferenceStateLayoutsV1,productionResourcesForShotV1} from '../apps/studio-next/src/lib/a1-reference-state-layout-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const fontPath=path.resolve('apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf');
const font={id:'test',path:fontPath,sha256:hash(fs.readFileSync(fontPath)),postscriptName:'SourceHanSansCN-Heavy',weight:900};
const source='a'.repeat(64),reference='b'.repeat(64),states=['ENTRY','HOLD'];
const design={contract:'A1ReferenceProductionDesign/v1',shotId:'S',sourceVideoSha256:source,viewerIntent:'Compare two states',appearance:{composition:'Different titles',palette:'Black',surface:'Fixture only'},
  references:states.map((state,i)=>({state,sourceFrame:i,path:'work/fixture.png',sha256:reference})),
  layers:[0,1].map(i=>({id:'text-'+i,role:'TEXT',sourceMode:'LOCAL',purpose:'Exact state title',treatment:'NONE',copyIndices:[i],fontRole:'Test fixture font',hierarchy:'Title'})),
  states:states.map((state,i)=>({state,viewerNotice:'Read the selected title',visibleLayerIds:['text-'+i],visibleCopyIndices:[i]})),
  acceptance:[0,1].map(i=>({layerId:'text-'+i,check:'Only the selected copy'}))};
const shot={id:'S',sourceText:'Fixture source',visualJob:'Compare',sourceVersionSha256:source,sourceInterval:{startFrame:0,endFrameExclusive:3},exactCopy:['红色状态','绿色状态'],tasks:[],referenceProductionDesign:design,
  typographyDirections:[0,1].map(i=>({layerId:'text-'+i,route:'EDITABLE_LOCAL_TYPE',verifiedMatchingFontSha256:font.sha256,referenceSha256:reference,exactCopy:[['红色状态','绿色状态'][i]],shape:'Fixture only',composition:'Title'})),
  productionLayout:{contract:'A1ProductionStateLayouts/v1',mode:'STATIC',canvas:{width:960,height:540},states:states.map((state,i)=>({state,referencePath:'/repo/work/fixture.png',copyIndices:[i],layers:[{id:'text-'+i,kind:'TEXT',copyIndex:i,fontId:'test',fontSize:64,minFontSize:64,fill:'#111111',box:{x:.1,y:.2,width:.8,height:.5},z:5}]}))}};
const native=process.argv.includes('--native');
const partialExecution=structuredClone(shot);
partialExecution.productionLayout.states=partialExecution.productionLayout.states.slice(0,1);
const originalPartial=JSON.stringify(partialExecution);
const executionDesign=productionLayoutReferenceDesignV1(partialExecution);
assert.deepEqual(executionDesign.states.map(s=>s.state),['ENTRY']);
assert.deepEqual(executionDesign.references.map(s=>s.state),['ENTRY']);
assert.deepEqual(executionDesign.layers.map(l=>l.id),['text-0']);
assert.equal(JSON.stringify(partialExecution),originalPartial,'execution projection must preserve the full canonical design');
const nativePhaseFile=process.argv.includes('--phase')?process.argv[process.argv.indexOf('--phase')+1]:null;
let nativePhase;
if(native){
 if(!nativePhaseFile)throw Error('NATIVE_STATE_SMOKE_RESERVATION_REQUIRED');
 nativePhase=JSON.parse(fs.readFileSync(nativePhaseFile));
 if(nativePhase.status!=='ACTIVE'||nativePhase.purpose!=='STATIC_STATE_NATIVE_SMOKE'||nativePhase.executionAuthorized!==true||nativePhase.reservedSlots!==1
   ||nativePhase.globalCap!==2||Date.now()<Date.parse(nativePhase.reservationStartUTC)||Date.now()>=Date.parse(nativePhase.reservationEndUTC))throw Error('NATIVE_STATE_SMOKE_RESERVATION_INVALID');
 const occupied=fs.readdirSync(path.dirname(nativePhaseFile)).filter(f=>f.startsWith('phase-activation-')&&f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(path.dirname(nativePhaseFile),f)))).filter(p=>p.status==='ACTIVE').reduce((sum,p)=>sum+(p.reservedSlots||0),0);
 if(occupied>2)throw Error('NATIVE_STATE_SMOKE_RESOURCE_CAP');
}
const started=Date.now();
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-variable-states-'))),calls=[];
let failText=null;
const base={implementationSha256:'c'.repeat(64),execute:async node=>{
  calls.push(node.input.parameters.exactCopy);
  if(node.input.parameters.exactCopy===failText)return {state:'failed',reason:'INJECTED_INTERRUPTION'};
  const bytes=Buffer.from(node.input.parameters.exactCopy),name=node.inputSha256+'.png';fs.writeFileSync(path.join(root,name),bytes);
  return {state:'needs-review',productionAdmission:false,artifactManifest:{artifacts:[{path:name,role:'typography-overlay',kind:'IMAGE',sha256:hash(bytes),bytes:bytes.length}]}};
}};
const adapter=createStaticStateAdapterV1(base,'editable-typography');
const stateImplementations={'editable-typography':adapter.stateImplementationSha256,'layer-compositor':'d'.repeat(64)};
const resources={fonts:[font],assets:[]};
try {
 const result=compileProductionLayoutV1({shot,resources,stateImplementations});assert.equal(result.compiled,true,JSON.stringify(result.blockers));
 const focused=structuredClone(shot);focused.productionLayout.states=focused.productionLayout.states.filter(s=>s.state==='HOLD');
 focused.referenceProductionDesign.states=focused.referenceProductionDesign.states.filter(s=>s.state==='HOLD');
 focused.referenceProductionDesign.references=focused.referenceProductionDesign.references.filter(s=>s.state==='HOLD');
 focused.fullFrameComposition={contract:'A1FullFrameComposition/v1',requestNodeIds:['fixture-current']};
 focused.fullFrameInputHistory=[{packagingDecision:result.shot.packagingDecision}];
 const focusResult=compileProductionLayoutV1({shot:focused,resources,stateImplementations});assert.equal(focusResult.compiled,true,JSON.stringify(focusResult.blockers));
 assert.equal(focusResult.shot.packagingDecision.copyBindings[0].activeStateVisibility,'NOT_DISPLAYED_IN_ACTIVE_STATES');
 const unboundVocabulary=structuredClone(focused);delete unboundVocabulary.fullFrameInputHistory;
 assert.equal(compileProductionLayoutV1({shot:unboundVocabulary,resources,stateImplementations}).compiled,false,'unused source vocabulary needs an existing exact lock, never a guessed visible frame');
 assert.equal(productionLayoutInputsCurrentV1(result.shot,resources),true);
 const plan={contract:'A1ShotTaskPlan/v1',projectId:'state-fixture',source:{videoSha256:source},scope:'RESEARCH_ONLY',productionAdmission:false,productionResources:resources,shots:[shot]};
 assert.equal(productionInputIdentityV1(plan),productionInputIdentityV1({...plan,shots:[result.shot]}),'compile must preserve batch identity');
 const facts=states.map((state,i)=>({sourceKind:'REFERENCE_LAYOUT_FRAME',shotId:'S',state,sourceFrameSha256:reference,sourceVideoSha256:source,frameNumber:i}));
 const workspace=compileShotTaskWorkspaceV1({...plan,shots:[result.shot]},{verifiedSourceFacts:facts,verifiedDesignReferenceShas:[reference]});
 const workflow=workspace.production.shotIntelligence.currentStoryboardAuthority.shots[0].nodeWorkflow;
 assert.deepEqual(workflow.packagingDecision.blockers,[]);
 assert.equal(workflow.modules['editable-typography'],true);
 assert.equal(workflow.modules['layer-compositor'],true);
 const definitions=createNodeAdapterRegistry().definitions;
 const scheduled=compileNodeWorkflow(nodeWorkflowInput(workspace),null,{moduleDefinitions:definitions});
 assert.equal(scheduled.nodes.find(n=>n.module==='layer-compositor').input.need,true,JSON.stringify(scheduled.nodes.find(n=>n.module==='layer-compositor').routingGate));
 const params=workflow.moduleInputs['editable-typography'];
 assert.equal(params.staticStatePlan.states.length,2,'no forced third state');
 assert.deepEqual(params.staticStatePlan.states.map(s=>s.parameters.exactCopy),shot.exactCopy,'no cross-state copy leakage');
 const node={id:'S:editable-typography',shotId:'S',dependencies:[],inputSha256:nodeInputHash(params),input:{parameters:params}};
 failText='绿色状态';const failed=await adapter.execute(node,{artifactRoot:root,dependencies:{}});assert.equal(failed.state,'failed');assert.equal(failed.completedStaticStates.length,1);
 failText=null;calls.length=0;const recovered=await adapter.execute(node,{artifactRoot:root,dependencies:{}});assert.equal(recovered.state,'needs-review');assert.deepEqual(calls,['绿色状态']);assert.equal(recovered.reusedStates,1);
 calls.length=0;const repeat=await adapter.execute(node,{artifactRoot:root,dependencies:{}});assert.equal(repeat.reusedStates,2);assert.equal(calls.length,0);
 const identical=structuredClone(node);
 identical.input.parameters.staticStatePlan.states[1].parameters=structuredClone(identical.input.parameters.staticStatePlan.states[0].parameters);
 identical.input.parameters.staticStatePlan.states[1].parametersSha256=nodeInputHash(identical.input.parameters.staticStatePlan.states[1].parameters);
 identical.input.parameters.staticStatePlan.states[1].copyIndices=[...identical.input.parameters.staticStatePlan.states[0].copyIndices];
 if(identical.input.parameters.referenceDesignIntent){
  const [first,second]=identical.input.parameters.referenceDesignIntent.states;
  second.visibleCopyIndices=[...first.visibleCopyIndices];second.visibleLayerIds=[...first.visibleLayerIds];
 }
 identical.inputSha256=nodeInputHash(identical.input);
 const shared=await adapter.execute(identical,{artifactRoot:root,dependencies:{}});
 assert.equal(shared.state,'needs-review');assert.equal(new Set(shared.artifactManifest.artifacts.map(a=>a.path)).size,shared.artifactManifest.artifacts.length,'state aliases keep unique paths without rerasterizing shared bytes');
 assert.equal(shared.staticStates.samples[0].artifacts[0].sha256,shared.staticStates.samples[1].artifacts[0].sha256);
 const changed=structuredClone(node);changed.input.parameters.staticStatePlan.states[1].parameters.runs[0].x+=5;changed.input.parameters.staticStatePlan.states[1].parametersSha256=nodeInputHash(changed.input.parameters.staticStatePlan.states[1].parameters);changed.inputSha256=nodeInputHash(changed.input);
 const repaired=await adapter.execute(changed,{artifactRoot:root,dependencies:{}});assert.equal(repaired.reusedStates,1);assert.equal(repaired.executedStates,1);
 assert.equal(repaired.visualApproval,'NOT_GRANTED');assert.equal(repaired.staticStates.wholeShotPASS,false);
 calls.length=0;const wrong=structuredClone(node);wrong.input.parameters.staticStatePlan.states[1].parameters.exactCopy='invented';
 assert.equal((await adapter.execute(wrong,{artifactRoot:root,dependencies:{}})).state,'blocked');assert.equal(calls.length,0,'preflight all states before making anything');
 fs.appendFileSync(path.join(root,repeat.staticStates.samples[0].artifacts[0].path),'corrupt');
 const corrupt=await adapter.execute(node,{artifactRoot:root,dependencies:{}});assert.equal(corrupt.executedStates,1);assert.equal(corrupt.reusedStates,1);
 const many=structuredClone(shot),assets=Array.from({length:9},(_,i)=>({assetId:'source-'+i,path:'/repo/work/source-'+i+'.png',sha256:hash('asset-'+i),kind:'IMAGE',referenceOnly:false,materialClass:'CODE_NATIVE_ASSET'}));
 many.exactCopy=[];many.typographyDirections=[];
 many.referenceProductionDesign.layers=assets.map((a,i)=>({id:'piece-'+i,role:'DECOR',sourceMode:'EXISTING',assetIds:[a.assetId],copyIndices:[],purpose:'Fixture piece',treatment:'NONE'}));
 many.referenceProductionDesign.acceptance=assets.map((a,i)=>({layerId:'piece-'+i,check:'Source stays unchanged'}));
 many.referenceProductionDesign.states.forEach(s=>{s.visibleLayerIds=assets.map((a,i)=>'piece-'+i);s.visibleCopyIndices=[];});
 many.productionLayout.states.forEach(s=>{s.copyIndices=[];s.layers=assets.map((a,i)=>({id:'piece-'+i,kind:'ASSET',assetId:a.assetId,role:'DECOR',fit:'contain',box:{x:0,y:0,width:1,height:1},z:i}));});
 const pooled=compileProductionLayoutV1({shot:many,resources:{assets,fonts:[]},stateImplementations});assert.equal(pooled.compiled,true,JSON.stringify(pooled.blockers));
 assert.equal(pooled.shot.tasks.find(t=>t.module==='media-files').parameters.files.length,9,'same assets processed once across states');
 const largeWorkspace=compileShotTaskWorkspaceV1({...plan,productionResources:{assets,fonts:[]},shots:[pooled.shot]},{verifiedSourceFacts:facts,verifiedDesignReferenceShas:[reference]});
 const largeGraph=compileNodeWorkflow(nodeWorkflowInput(largeWorkspace),null,{moduleDefinitions:definitions});
 assert.equal(largeGraph.nodes.find(n=>n.module==='layer-compositor').input.need,true,'18 aggregate layers allowed while each state remains under 16');
 // Full draft -> existing module graph, including accepted reference-glyph reuse.
 const reuse=structuredClone(shot),glyph={assetId:'glyph-fixture',path:'/repo/work/glyph.png',sha256:hash('glyph'),kind:'IMAGE',referenceOnly:false,materialClass:'ORIGINAL_GENERATED_ASSET',glyphBinding:{referenceSha256:reference,exactCopy:[shot.exactCopy[0]],copyReview:'PASS',inkSourceRect:{x:.1,y:.1,width:.8,height:.8}}};
 reuse.referenceProductionDesign.layers[0].sourceMode='AUTO';reuse.referenceProductionDesign.layers[0].assetIds=[glyph.assetId];
 reuse.typographyDirections[0]={...reuse.typographyDirections[0],route:'GENERATED_HERO_GLYPH',editableShadowFontId:font.id};
 reuse.referenceProductionDesign.states[1].visibleCopyIndices=[0,1];reuse.referenceProductionDesign.states[1].visibleLayerIds=['text-0','text-1'];
 const proposalDesign=structuredClone(reuse.referenceProductionDesign);
 proposalDesign.states.forEach(state=>state.placements=state.visibleLayerIds.map((layerId,i)=>({layerId,box:{x:.1,y:.1+i*.4,width:.8,height:.3},z:layerId==='text-0'?1:5,fit:'contain',fill:'#111111',fontSize:64})));
 const prepared=prepareReferenceStateLayoutsV1({repoRoot:root,shot:{...reuse,referenceProductionDesign:proposalDesign},resources:{assets:[glyph,glyph],fonts:[font]},canvas:{width:960,height:540}});
 assert.equal(prepared.ready,true,JSON.stringify(prepared.gaps));
 assert.throws(()=>productionResourcesForShotV1({productionResources:{assets:[glyph]}},{tasks:[],productionResources:{assets:[{...glyph,sha256:hash('other')}]}}),/RESOURCE_ID_CONFLICT/);
 const draftDir=path.join(root,'work','fixture');fs.mkdirSync(draftDir,{recursive:true});
 const draftFile=path.join(draftDir,'layout-proposal.json');
 const saveDraft=()=>{const data=Buffer.from(JSON.stringify({contract:'A1ReferenceStateLayoutProposal/v1',shotId:reuse.id,design:proposalDesign,canvas:{width:960,height:540}}));fs.writeFileSync(draftFile,data);return {path:'work/fixture/layout-proposal.json',sha256:hash(data),baseDesignSha256:nodeInputHash(reuse.referenceProductionDesign)};};
 delete reuse.productionLayout;reuse.referenceStateLayoutDraft=saveDraft();reuse.tasks=[{module:'media-files',dependencies:[],parameters:{files:[glyph]}}];
 const draftPlan={...plan,productionResources:{fonts:[font],assets:[]},shots:[reuse]};
 const blockedMigration=compileProductionPlanV1(draftPlan,{repoRoot:root,stateImplementations});assert.match(blockedMigration.results[0].blockers[0],/EXPLICIT_MIGRATION/);assert.deepEqual(blockedMigration.plan.shots[0].tasks,reuse.tasks);
 const migrated=compileProductionPlanV1(draftPlan,{repoRoot:root,stateImplementations,allowReferenceLayoutMigration:true});assert.equal(migrated.results[0].compiled,true,JSON.stringify(migrated.results));
 assert.equal(productionInputIdentityV1(draftPlan),productionInputIdentityV1(migrated.plan));
 assert.deepEqual(migrated.plan.shots[0].referenceLayoutMigration.original.tasks,reuse.tasks);
 assert.equal(compileProductionPlanV1(migrated.plan,{repoRoot:root,stateImplementations}).results[0].compiled,true);
 const reusedWorkspace=compileShotTaskWorkspaceV1(migrated.plan,{verifiedSourceFacts:facts,verifiedDesignReferenceShas:[reference]});
 const reuseGraph=compileNodeWorkflow(nodeWorkflowInput(reusedWorkspace),null,{moduleDefinitions:definitions});
 assert.ok(!reuseGraph.nodes.some(n=>n.module==='image-generation'&&n.input.need===true),'accepted glyph must not create new image generation');
 assert.equal(reuseGraph.nodes.find(n=>n.module==='layer-compositor').input.need,true);
 const migratedType=migrated.plan.shots[0].tasks.find(t=>t.module==='editable-typography').parameters.staticStatePlan.states;
 assert.equal(migratedType[1].parameters.runs[0].plane,'behind-artwork');assert.equal(migratedType[1].parameters.runs.at(-1).plane,'front-artwork');
 const intents=migrated.plan.shots[0].tasks.find(t=>t.module==='layer-compositor').parameters.staticStatePlan.states;
 assert.ok(intents[0].parameters.compositionIntent.layers.every(l=>l.dependencyNodeId.endsWith(':media-files')),'all-shadow state paints no local font');
 assert.deepEqual(intents[0].parameters.compositionIntent.layers[0].sourceRect,glyph.glyphBinding.inkSourceRect);
 const revision=structuredClone(migrated.plan);proposalDesign.states[1].placements[1].box.x=.12;proposalDesign.states[1].placements[1].box.width=.75;
 revision.shots[0].referenceStateLayoutDraft=saveDraft();
 const revised=compileProductionPlanV1(revision,{repoRoot:root,stateImplementations,allowReferenceLayoutMigration:true});assert.equal(revised.results[0].compiled,true,JSON.stringify(revised.results));
 assert.equal(productionInputIdentityV1(revision),productionInputIdentityV1(revised.plan));
 const beforeEntry=migratedType[0].parameters,afterEntry=revised.plan.shots[0].tasks.find(t=>t.module==='editable-typography').parameters.staticStatePlan.states[0].parameters;
 assert.deepEqual(beforeEntry,afterEntry,'unmodified state keeps its native execution input');
 const tampered=structuredClone(revised.plan);tampered.shots[0].tasks[0].parameters.extra='changed';
 assert.match(compileProductionPlanV1(tampered,{repoRoot:root,stateImplementations,allowReferenceLayoutMigration:true}).results[0].blockers[0],/DERIVED_TASKS_CHANGED/);
 fs.appendFileSync(draftFile,'corrupt');
 const broken=compileProductionPlanV1(revised.plan,{repoRoot:root,stateImplementations,allowReferenceLayoutMigration:true});assert.equal(broken.results[0].compiled,false);assert.deepEqual(broken.plan.shots[0].tasks,revised.plan.shots[0].tasks,'bad new draft retains old execution records without granting success');
 const missing=structuredClone(shot);missing.productionLayout.states[1].copyIndices=[0];assert.equal(compileProductionLayoutV1({shot:missing,resources,stateImplementations}).compiled,false);
 if(native){
   const {verifyNodeArtifactManifest}=await import('../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs');
   const {registry,definitions}=createNodeAdapterRegistry();
   const nativeImplementations=Object.fromEntries(Object.entries(registry).map(([id,a])=>[id,a.stateImplementationSha256]));
   const compiled=compileProductionLayoutV1({shot,resources,stateImplementations:nativeImplementations});assert.equal(compiled.compiled,true);
   const ws=compileShotTaskWorkspaceV1({...plan,shots:[compiled.shot]},{verifiedSourceFacts:facts,verifiedDesignReferenceShas:[reference]});
   const graph=compileNodeWorkflow(nodeWorkflowInput(ws),null,{moduleDefinitions:definitions});
   const typeNode=graph.nodes.find(n=>n.module==='editable-typography');
   const actualType=await registry['editable-typography'].execute(typeNode,{artifactRoot:root,dependencies:{}});
   assert.equal(actualType.state,'needs-review',JSON.stringify(actualType));
   const verified=await verifyNodeArtifactManifest(actualType.artifactManifest,{artifactRoot:root,node:typeNode});
   const dep={state:'succeeded',inputSha256:typeNode.inputSha256,manifestSha256:verified.manifestSha256,
     artifacts:verified.artifacts.map(a=>({...a,absolutePath:path.join(root,a.path)}))};
   const composite=graph.nodes.find(n=>n.module==='layer-compositor');
   assert.equal(composite.input.need,true);
   const actual=await registry['layer-compositor'].execute(composite,{artifactRoot:root,dependencies:{[typeNode.id]:dep}});
   assert.equal(actual.state,'needs-review',JSON.stringify(actual));
   await verifyNodeArtifactManifest(actual.artifactManifest,{artifactRoot:root,node:composite});
   const replay=await registry['layer-compositor'].execute(composite,{artifactRoot:root,dependencies:{[typeNode.id]:dep}});
   assert.equal(replay.executedStates,0);assert.equal(replay.reusedStates,2);
   const damaged=actual.staticStates.samples[0].artifacts.find(a=>a.kind==='IMAGE');fs.appendFileSync(path.join(root,damaged.path),'damaged');
   const restored=await registry['layer-compositor'].execute(composite,{artifactRoot:root,dependencies:{[typeNode.id]:dep}});
   assert.equal(restored.state,'needs-review',JSON.stringify(restored));assert.equal(restored.executedStates,1);assert.equal(restored.reusedStates,1);
   assert.notEqual(restored.staticStates.samples[0].artifacts[0].path,actual.staticStates.samples[0].artifacts[0].path);
   await verifyNodeArtifactManifest(restored.artifactManifest,{artifactRoot:root,node:composite});
   const out=path.resolve('work/director-state-compiler-20261009-v1/native-proof');fs.mkdirSync(out,{recursive:true});
   for(const artifact of restored.artifactManifest.artifacts.filter(a=>a.kind==='IMAGE'))fs.copyFileSync(path.join(root,artifact.path),path.join(out,artifact.role+'.png'));
   fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({status:'TECHNICAL_PASS_ONLY',states:2,rendered:actual.executedStates,replayExecuted:replay.executedStates,replayReused:replay.reusedStates,corruptArtifactRecovery:{executed:restored.executedStates,reused:restored.reusedStates,previousPathPreserved:true},elapsedMs:Date.now()-started,visualQualification:false,productionAdmission:false},null,2)+'\n');
   console.log('PASS actual incumbent typography and compositor PNG/SVG verification, two states, repeat zero renders. Engineering fixture only.');
 }
 console.log('PASS two-state compiler -> original graph -> adapter; state copy isolation; interruption recovery; repeat zero new work; single-state edit/corrupt-byte invalidation. Synthetic byte fixtures, not visual qualification.');
}finally{fs.rmSync(root,{recursive:true,force:true});if(nativePhase){nativePhase.status='COMPLETED_CLOSED_RELEASED';nativePhase.reservedSlots=0;nativePhase.actualElapsedMs=Date.now()-started;nativePhase.closedAtUTC=new Date().toISOString();fs.writeFileSync(nativePhaseFile,JSON.stringify(nativePhase,null,2)+'\n');}}
