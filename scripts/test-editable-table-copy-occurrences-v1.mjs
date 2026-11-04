import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {compileProductionLayoutV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
import {executeEditableTypographyNode,editableTypographyNodeAdapterV1,typographyCopyBindingValidV1} from '../apps/studio-next/src/lib/a1-node-editable-typography-adapter-v1.mjs';
import {createStaticStateAdapterV1} from '../apps/studio-next/src/lib/a1-static-state-adapter-v1.mjs';
import {nodeInputHash,compileNodeWorkflow} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'editable-table-'))),sha=b=>createHash('sha256').update(b).digest('hex');
try{
 const rows=[['姓名','加入时间',null,'主要贡献','现状'],['高华佐','2023年','清华大学应届硕士','MLA','仍在职'],['曾旺丁','2023年','北邮电大学应届生','MLA','仍在职'],['邵智宏','2023年','清华课题读博士生','GRPO','仍在职'],['朱琪豪','2023年','北大博士毕业生','GRPO','仍在职'],['郭达雅','2023年','博士毕业','R1核心','已离职'],['罗福莉','2023年','推测为清北本硕','MLA','已离职'],[null,'2023年','推测为清北本硕','LLM','已离职']];
 const exactCopy=[...new Set(rows.flat().filter(Boolean))];assert.equal(exactCopy.length,23);
 const fontPath=path.resolve('apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf'),font={id:'fixture-font',path:fontPath,sha256:sha(fs.readFileSync(fontPath)),postscriptName:'SourceHanSansCN-Heavy',weight:900};
 const layers=rows.flatMap((row,r)=>row.map((text,c)=>({id:`cell-${r}-${c}`,box:{x:.015+c*.195,y:.015+r*.12,width:.18,height:.095},z:10,
   ...(text?{kind:'TEXT',copyIndex:exactCopy.indexOf(text),fontId:font.id,fontSize:17,minFontSize:17,fill:'#111111'}:{kind:'UNREADABLE',sourceLiteralStatus:'UNREADABLE',sourceLiteralLocked:false})})));
 const sourceSha=sha(exactCopy.join('\n')),shot={id:'table-fixture',sourceText:'Synthetic transcription fixture; not biographical fact verification',visualJob:'Keep all source table cells editable',sourceVersionSha256:sourceSha,sourceDocument:{path:path.join(root,'source.txt'),sha256:sourceSha},exactCopy,copyEvidence:exactCopy.map(s=>'Visible source cell: '+s),tasks:[],productionLayout:{contract:'A1ProductionLayout/v1',mode:'STATIC',canvas:{width:960,height:540},layers}};
 const resources={fonts:[font],assets:[]},before=JSON.stringify(shot),compiled=compileProductionLayoutV1({shot,resources});assert.equal(compiled.compiled,true,JSON.stringify(compiled.blockers));assert.equal(JSON.stringify(shot),before);
 const p=compiled.shot.tasks.find(t=>t.module==='editable-typography').parameters;
 assert.equal(p.exactCopy,exactCopy.join(''),'source dictionary lock does not expand into duplicated text');assert.equal(p.runs.length,38);
 assert.equal(p.copyOccurrences.cells.length,38);assert.equal(p.copyOccurrences.unreadableCells.length,2);
 assert.equal(p.copyOccurrences.cells.filter(c=>c.copyIndex===exactCopy.indexOf('2023年')).length,7);
 assert.equal(p.copyOccurrences.cells.filter(c=>c.copyIndex===exactCopy.indexOf('MLA')).length,3);
 assert.equal(typographyCopyBindingValidV1(p),true);
 const definitions=createNodeAdapterRegistry({'editable-typography':editableTypographyNodeAdapterV1}).definitions;
 const graph=parameters=>compileNodeWorkflow({projectId:'copy-occurrence-fixture',workspaceSha256:'a'.repeat(64),shots:[{id:shot.id,source:shot.sourceText,modules:{material:false,recording:false,typography:false,'editable-typography':true},moduleInputs:{'editable-typography':parameters}}]},null,{moduleDefinitions:definitions});
 const node=p=>graph(p).nodes.find(n=>n.module==='editable-typography');
 const adapter=createStaticStateAdapterV1(editableTypographyNodeAdapterV1,'editable-typography');
 const wrapped={...p,exactCopyEntries:exactCopy,staticStateImplementationSha256:adapter.stateImplementationSha256,
   referenceStaticPackage:{states:[{state:'HOLD',sourceFrame:5,reference:{sha256:'b'.repeat(64)}}]},staticStatePlan:{contract:'A1StaticStateExecutionPlan/v2',states:[{state:'HOLD',sourceFrame:5,referenceSha256:'b'.repeat(64),copyIndices:exactCopy.map((_,i)=>i),parameters:p,parametersSha256:nodeInputHash(p)}]}};
 const rendered=await adapter.execute(node(wrapped),{artifactRoot:root,dependencies:{}});assert.equal(rendered.state,'needs-review',rendered.reason);
 const files=rendered.artifactManifest.artifacts,layoutArtifact=files.find(a=>a.role==='typography-layout'),layout=JSON.parse(fs.readFileSync(path.join(root,layoutArtifact.path))),svg=fs.readFileSync(path.join(root,files.find(a=>a.role==='editable-typography').path),'utf8');
 assert.equal(layout.glyphManifests.length,38);assert.equal(layout.parameters.copyOccurrences.unreadableCells.length,2);
 assert.equal((svg.match(/data-copy="2023年"/g)||[]).length,7);assert.equal(svg.includes('UNREADABLE'),false,'unknown markers are metadata, never invented source lettering');
 assert.ok(files.find(a=>a.role==='typography-overlay').bytes>1000);assert.equal(rendered.staticStates.samples.length,1);
 for(const mutate of [s=>s.productionLayout.layers[1].copyIndex=999,s=>s.productionLayout.layers[1].box.x=1,s=>s.productionLayout.layers[2].text='guessed header',s=>s.productionLayout.layers[2].sourceLiteralLocked=true,
   s=>{s.exactCopy.push('Missing locked text');s.copyEvidence.push('Missing locked text source');},s=>{while(s.productionLayout.layers.length<=64)s.productionLayout.layers.push({...s.productionLayout.layers[0],id:'extra-'+s.productionLayout.layers.length});}]){
   const bad=structuredClone(shot);mutate(bad);assert.equal(compileProductionLayoutV1({shot:bad,resources}).compiled,false,mutate.toString());
 }
 for(const mutate of [p=>p.runs[5].text='wrong word',p=>p.copyOccurrences.cells[5].runStart=0,p=>p.copyOccurrences.cells[5].copyIndex=99,p=>p.copyOccurrences.cells.pop(),p=>p.copyOccurrences.unreadableCells[0].text='guessed',p=>{while(p.runs.length<65)p.runs.push(p.runs[0]);}]){
   const bad=structuredClone(p);mutate(bad);assert.equal(typographyCopyBindingValidV1(bad),false);
   const badWrapped=structuredClone(wrapped);badWrapped.staticStatePlan.states[0].parameters=bad;badWrapped.staticStatePlan.states[0].parametersSha256=nodeInputHash(bad);
   assert.equal((await adapter.execute(node(badWrapped),{artifactRoot:root,dependencies:{}})).reason,'STATIC_STATE_COPY_SELECTION_INVALID');
 }
 const outOfBounds=structuredClone(p);outOfBounds.runs[0].x=955;
 assert.equal((await executeEditableTypographyNode(node(outOfBounds),{artifactRoot:root,dependencies:{}})).reason,'TYPOGRAPHY_INK_OUTSIDE_CANVAS');
 assert.equal(typographyCopyBindingValidV1({runs:[{text:'legacy'}],exactCopy:'legacy'}),true);
 const boundary={...structuredClone(shot),exactCopy:['边界'],copyEvidence:['Visible source cell: 边界']};
 boundary.productionLayout.layers=Array.from({length:64},(_,i)=>({...layers[0],id:'bounded-'+i,copyIndex:0}));
 const boundaryResult=compileProductionLayoutV1({shot:boundary,resources});assert.equal(boundaryResult.compiled,true);
 assert.equal(boundaryResult.shot.tasks.find(t=>t.module==='editable-typography').parameters.runs.length,64);
 console.log('PASS 40 cell slots / 23 locked literals / 38 native text runs / 2 UNREADABLE metadata slots through compiler and real static-v2 typography rendering; repeated cells and editable SVG retained; wrong/missing/clipped/over-budget text rejected.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
