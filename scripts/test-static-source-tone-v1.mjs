// Integration fixture copy: install at scripts/test-static-source-tone-v1.mjs
// after applying source-tone.patch. Synthetic temp assets only, no production data/provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {compileProductionPlanV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
import {nodeInputHash,compileNodeWorkflow} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {preflightShotTaskPlanV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {nodeWorkflowInput} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
import {acceptNodeArtifacts} from '../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'static-source-tone-')));
const task=path.join(root,'work/fixture'),sha=b=>createHash('sha256').update(b).digest('hex');
fs.mkdirSync(task,{recursive:true});
try {
  // Identity dimensions eliminate resampling as a confounder. Semi-alpha uses
  // endpoint RGB values to avoid premultiplication rounding in OVER compositing.
  const rgba=Buffer.alloc(320*180*4),colors=[[17,63,201,255],[0,255,0,128],[255,0,255,255]];
  for(let y=0;y<180;y++)for(let x=0;x<320;x++)rgba.set(colors[Math.min(2,Math.floor(x/107))],(y*320+x)*4);
  const bytes=await sharp(rgba,{raw:{width:320,height:180,channels:4}}).png().toBuffer();
  const image=path.join(task,'asset.png');fs.writeFileSync(image,bytes);
  const reference=path.join(task,'reference.txt');fs.writeFileSync(reference,'synthetic source evidence');
  const source='a'.repeat(64),refs=['ENTRY','HOLD'].map((state,i)=>({state,sourceFrame:i+1,path:reference,sha256:sha(fs.readFileSync(reference))}));
  const layer={id:'core',kind:'ASSET',assetId:'core',role:'BACKGROUND',fit:'fill',box:{x:0,y:0,width:1,height:1},z:0};
  const shot={id:'fixture',sourceText:'Static source tone fixture',visualJob:'Explicit RGB complement retaining source pixels and alpha',sourceVersionSha256:source,sourceInterval:{startFrame:0,endFrameExclusive:10},exactCopy:[],tasks:[],
    productionResources:{assets:[{assetId:'core',kind:'IMAGE',role:'packaging-texture',path:image,sha256:sha(bytes),referenceOnly:false,materialClass:'CODE_NATIVE_ASSET'}],fonts:[]},
    productionLayout:{contract:'A1ProductionStateLayouts/v1',mode:'STATIC',canvas:{width:320,height:180},states:refs.map(r=>({state:r.state,referencePath:r.path,copyIndices:[],layers:[{...layer,...(r.state==='ENTRY'?{sourceTone:'INVERT_RGB'}:{})}]}))},
    referenceProductionDesign:{contract:'A1ReferenceProductionDesign/v1',shotId:'fixture',sourceVideoSha256:source,viewerIntent:'Same geometry, explicit display tone',appearance:{composition:'Same source',palette:'RGB complement',surface:'Unmodified input'},references:refs,
      layers:[{id:'core',role:'BACKGROUND',sourceMode:'EXISTING',assetIds:['core'],copyIndices:[],treatment:'NONE',purpose:'Synthetic accepted asset'}],states:refs.map(r=>({state:r.state,visibleCopyIndices:[],visibleLayerIds:['core'],viewerNotice:'Static tone only'})),acceptance:[{layerId:'core',check:'Retain source bytes, geometry and alpha'}],uncertainties:[]}};
  const plan={contract:'A1ShotTaskPlan/v1',projectId:'fixture',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:source},shots:[shot]};
  const registry=createNodeAdapterRegistry(),options={repoRoot:root,shotIds:['fixture'],stateImplementations:Object.fromEntries(Object.entries(registry.registry).map(([id,a])=>[id,a.stateImplementationSha256]))};
  const compiled=compileProductionPlanV1(plan,options);
  assert.equal(compiled.results[0].compiled,true,JSON.stringify(compiled.results[0]));
  const parameters=compiled.plan.shots[0].tasks.find(t=>t.module==='layer-compositor').parameters;
  assert.equal(parameters.staticStatePlan.states[0].parameters.compositionIntent.layers[0].sourceTone,'INVERT_RGB');
  assert.equal(parameters.staticStatePlan.states[1].parameters.compositionIntent.layers[0].sourceTone,undefined);
  for(const tone of ['NONE','INVERT_ALPHA','invert_rgb','',null,{},1]){
    const bad=structuredClone(plan);bad.shots[0].productionLayout.states[0].layers[0].sourceTone=tone;
    assert.equal(compileProductionPlanV1(bad,options).results[0].compiled,false);
  }
  const motion=structuredClone(plan);motion.shots[0].productionLayout.mode='MOTION';
  assert.equal(compileProductionPlanV1(motion,options).results[0].compiled,false);
  const input=nodeWorkflowInput(preflightShotTaskPlanV1({repoRoot:root,taskId:'fixture',plan:compiled.plan}));
  let workflow=compileNodeWorkflow(input,null,{moduleDefinitions:registry.definitions});
  const artifactRoot=path.join(task,'artifacts');fs.mkdirSync(artifactRoot);
  let final;
  for(const module of ['media-files','layer-compositor']){
    const node=workflow.nodes.find(n=>n.module===module);assert.notEqual(node.state,'blocked',node.reason);
    const dependencies=Object.fromEntries(node.dependencies.map(id=>{
      const n=workflow.nodes.find(n=>n.id===id);
      return [id,{state:n.state,inputSha256:n.inputSha256,manifestSha256:n.acceptance.manifestSha256,artifacts:n.acceptance.artifacts.map(a=>({...a,absolutePath:path.join(artifactRoot,a.path)}))}];
    }));
    const result=await registry.registry[module].execute(node,{artifactRoot,dependencies});assert.equal(result.state,'needs-review',result.reason);
    if(module==='layer-compositor'){
      final=result;
      const drift=structuredClone(node),state=drift.input.parameters.staticStatePlan.states[0];
      delete state.parameters.compositionIntent.layers[0].sourceTone;state.parametersSha256=nodeInputHash(state.parameters);
      assert.equal((await registry.registry[module].execute(drift,{artifactRoot,dependencies})).reason,'STATIC_STATE_LAYER_IDENTITY_CHANGED');
      const invalid=structuredClone(node);delete invalid.input.parameters.staticStatePlan;
      invalid.input.parameters.compositionIntent.layers[0].sourceTone='INVERT_ALPHA';
      assert.equal((await registry.registry[module].execute(invalid,{artifactRoot,dependencies})).reason,'COMPOSITE_LAYER_SOURCE_TONE_INVALID');
    }
    node.state='needs-review';node.result=result;
    workflow=await acceptNodeArtifacts(workflow,node.id,{artifactRoot,reviewerId:'isolated-fixture'});
    workflow=compileNodeWorkflow(input,workflow,{moduleDefinitions:registry.definitions});
  }
  const artifactsFor=state=>final.staticStates.samples.find(s=>s.state===state).artifacts;
  const imageFor=state=>path.join(artifactRoot,artifactsFor(state).find(a=>a.kind==='IMAGE').path);
  const hold=await sharp(imageFor('HOLD')).ensureAlpha().raw().toBuffer();
  const entry=await sharp(imageFor('ENTRY')).ensureAlpha().raw().toBuffer();
  for(let i=0;i<rgba.length;i+=4){
    assert.equal(hold[i+3],rgba[i+3]);assert.equal(entry[i+3],rgba[i+3]);
    for(let c=0;c<3;c++){assert.equal(hold[i+c],rgba[i+c]);assert.equal(entry[i+c],255-rgba[i+c]);}
  }
  for(const state of ['ENTRY','HOLD']){
    const artifact=artifactsFor(state).find(a=>a.role.startsWith('layer-composition-plan'));
    const manifest=JSON.parse(fs.readFileSync(path.join(artifactRoot,artifact.path)));
    assert.equal(manifest.composition.layers[0].sourceTone,state==='ENTRY'?'INVERT_RGB':undefined);
    assert.equal(manifest.composition.layers[0].artifact.sha256,sha(bytes));
  }
  assert.equal(sha(fs.readFileSync(image)),sha(bytes));
  // The regular media source SHA gate still rejects changed original input.
  fs.appendFileSync(image,'drift');
  const media=workflow.nodes.find(n=>n.module==='media-files');
  const driftResult=await registry.registry['media-files'].execute(media,{artifactRoot,dependencies:{}});
  assert.equal(driftResult.state,'blocked');
  assert.match(driftResult.reason,/SHA|HASH|CHANGED|BYTES|MISMATCH|DRIFT/);
  assert.equal(final.productionAdmission,false);assert.equal(final.visualApproval,'NOT_GRANTED');
  console.log('PASS isolated compiler -> graph -> static compositor: exact RGB complement, unchanged alpha/source SHA/default HOLD, explicit manifest tone, invalid values and identity/source drift rejected.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
