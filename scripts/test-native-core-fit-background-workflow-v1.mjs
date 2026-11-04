import assert from 'node:assert/strict';
import {compileProductionLayoutV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
import {compileShotTaskWorkspaceV1,projectShotTaskExecutionReadinessV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {compileNodeWorkflow,summarizeNodeWorkflow} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {nodeWorkflowInput} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
const source='a'.repeat(64),reference='b'.repeat(64),states=['ENTRY','HOLD'],matte={r:255,g:255,b:255,alpha:1};
const resources={assets:[{assetId:'native-chart',kind:'IMAGE',path:'/fixture/native-chart.png',sha256:'c'.repeat(64),referenceOnly:false,
  materialClass:'VERIFIED_SOURCE_IMAGE',provenance:{status:'VERIFIED',sourceUrl:'https://example.org/chart'}}],fonts:[]};
const design={contract:'A1ReferenceProductionDesign/v1',shotId:'unseen',sourceVideoSha256:source,viewerIntent:'Read a native chart',appearance:{composition:'Native chart window',palette:'White',surface:'Native source'},
  references:states.map((state,i)=>({state,sourceFrame:i,path:'/fixture/ref.png',sha256:reference})),
  layers:[{id:'chart',role:'EVIDENCE',identity:'REAL',sourceMode:'EXISTING',assetIds:['native-chart'],copyIndices:[],treatment:'NONE',purpose:'Preserve native chart'}],
  states:states.map(state=>({state,viewerNotice:'Read the native measurement',visibleLayerIds:['chart'],visibleCopyIndices:[]})),
  acceptance:[{layerId:'chart',check:'Original measurement pixels preserved'}],uncertainties:[]};
const shot={id:'unseen',sourceText:'Show a measured curve',visualJob:'Read the native chart',exactCopy:[],sourceVersionSha256:source,sourceInterval:{startFrame:0,endFrameExclusive:2},tasks:[],referenceProductionDesign:design,
  productionLayout:{contract:'A1ProductionStateLayouts/v1',mode:'STATIC',canvas:{width:320,height:180},states:states.map(state=>({state,referencePath:'/fixture/ref.png',copyIndices:[],layers:[
    {id:'chart',kind:'ASSET',assetId:'native-chart',role:'EVIDENCE',box:{x:.1,y:.1,width:.8,height:.8},fit:'contain',fitBackground:'#ffffff',z:0}]}))}};
const compiled=compileProductionLayoutV1({shot,resources,stateImplementations:{'layer-compositor':'d'.repeat(64)}});
assert.deepEqual(compiled.blockers,[]);
const plan={contract:'A1ShotTaskPlan/v1',projectId:'matte-fixture',source:{videoSha256:source},scope:'RESEARCH_ONLY',productionAdmission:false,productionResources:resources,shots:[compiled.shot]};
const facts=states.map((state,i)=>({sourceKind:'REFERENCE_LAYOUT_FRAME',shotId:'unseen',state,sourceFrameSha256:reference,sourceVideoSha256:source,frameNumber:i}));
const workspace=compileShotTaskWorkspaceV1(plan,{verifiedSourceFacts:facts,verifiedDesignReferenceShas:[reference]});
const definitions=createNodeAdapterRegistry().definitions,input=nodeWorkflowInput(workspace);
const schedule=compileNodeWorkflow(input,null,{moduleDefinitions:definitions}),node=schedule.nodes.find(n=>n.module==='layer-compositor');
assert.equal(node.input.need,true,JSON.stringify(node.routingGate));
assert.equal(node.state,'queued');
assert.ok(node.input.parameters.compositionIntent.layers.every(l=>JSON.stringify(l.fitBackground)===JSON.stringify(matte)));
assert.ok(node.input.parameters.staticStatePlan.states.every(s=>s.parameters.compositionIntent.layers.every(l=>JSON.stringify(l.fitBackground)===JSON.stringify(matte))));
// Simulate only an accepted upstream state in an isolated fixture; no provider,
// compositor execution, disk receipt or real task state is touched.
const media=schedule.nodes.find(n=>n.module==='media-files');media.state='succeeded';
media.acceptance={inputSha256:media.inputSha256,artifacts:[{kind:'IMAGE'}]};
const readiness=projectShotTaskExecutionReadinessV1(plan,summarizeNodeWorkflow(schedule));
assert.equal(readiness.actions.find(a=>a.nodeId===node.id).action,'tick',JSON.stringify(readiness));
const altered=structuredClone(input),alteredShot=altered.shots.find(s=>s.id==='unseen');
alteredShot.moduleInputs['layer-compositor'].compositionIntent.layers[0].fitBackground='#000000';
const forged=compileNodeWorkflow(altered,null,{moduleDefinitions:definitions}).nodes.find(n=>n.module==='layer-compositor');
assert.equal(forged.reason,'PACKAGING_COMPOSITION_INTENT_INCOMPLETE','matte cannot be changed independently of the decision');
assert.ok(forged.input.packagingGate.blockers.includes('PACKAGING_INTENT_LAYER_OVERRIDE_BINDING_INVALID'));
const missing=structuredClone(input);delete missing.shots.find(s=>s.id==='unseen').moduleInputs['layer-compositor'].compositionIntent.layers[0].fitBackground;
assert.equal(compileNodeWorkflow(missing,null,{moduleDefinitions:definitions}).nodes.find(n=>n.module==='layer-compositor').reason,'PACKAGING_COMPOSITION_INTENT_INCOMPLETE','declared evidence matte cannot disappear in the override');
const bad=structuredClone(shot);bad.productionLayout.states[0].layers[0].fitBackground='#ffffff00';
assert.equal(compileProductionLayoutV1({shot:bad,resources,stateImplementations:{'layer-compositor':'d'.repeat(64)}}).compiled,false);
console.log('PASS production state compiler -> shot task workspace -> workflow -> execution readiness preserves decision-bound opaque matte; forged, missing and transparent mattes rejected. Zero providers and renders.');
