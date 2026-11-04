import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {prepareSourceBoundNativeLayoutV1,wholeNativeSourceRewriteReadyV1} from '../apps/studio-next/src/lib/a1-production-source-native-layout-v1.mjs';
import {compileProductionPlanV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
import {nodeInputHash,compileNodeWorkflow} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {preflightShotTaskPlanV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {nodeWorkflowInput} from '../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';
import {acceptNodeArtifacts} from '../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs';
import {mediaFileNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';
import {readProductionBatchAestheticsV1,productionBatchReviewScopeV1,productionBatchStateContentV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'source-native-layout-'))),task=path.join(root,'work','fixture'),hash=b=>createHash('sha256').update(b).digest('hex');fs.mkdirSync(path.join(task,'coverage'),{recursive:true});
const save=(name,o)=>{const b=Buffer.isBuffer(o)?o:Buffer.from(JSON.stringify(o)),f=path.join(task,name);fs.writeFileSync(f,b);return {path:f,sha256:hash(b),bytes:b.length};};
try{
 const whole={exactCopy:['corrected'],productionRevisionRequest:{status:'OPEN',requestId:'a'.repeat(64),productionAdmission:false},referenceProductionDesign:{states:[{state:'ENTRY'},{state:'HOLD'}]},stateCopyBindings:{ENTRY:{copyMode:'SOURCE_BOUND_STATE_EXCERPT_REWRITE'},HOLD:{copyMode:'SOURCE_BOUND_STATE_EXCERPT_REWRITE'}},fullFrameSourceInputHistory:[{exactCopy:['old']} ]};
 assert.equal(wholeNativeSourceRewriteReadyV1(whole,['ENTRY','HOLD']),true);
 assert.equal(wholeNativeSourceRewriteReadyV1(whole,['HOLD']),false);
 for(const mutate of [x=>x.productionRevisionRequest.states=['HOLD'],x=>x.stateCopyBindings.ENTRY.copyMode='REFERENCE_STATE_COPY',x=>x.fullFrameSourceInputHistory=[],x=>x.exactCopy=['old']]){const bad=structuredClone(whole);mutate(bad);assert.equal(wholeNativeSourceRewriteReadyV1(bad,['ENTRY','HOLD']),false);}

 const source='a'.repeat(64),ref=save('coverage/reference.png',Buffer.from('reference pixel fixture')),reference={state:'HOLD',sourceFrame:10,...ref},exactCopy=Array.from({length:23},(_,i)=>'字段'+i),indices=exactCopy.map((_,i)=>i);
 const evidence=save('coverage/evidence.json',{contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:source},stateFrames:{table:[{state:'HOLD',sourceFrame:10,artifactSha256:ref.sha256,artifactPath:'coverage/reference.png'}]}});
 const old={id:'table',sourceText:'Unchanged source narration',visualJob:'Table evidence',sourceVersionSha256:source,sourceInterval:{startFrame:0,endFrameExclusive:20},exactCopy,sourcePresentation:{copyBindings:exactCopy.map((text,copyIndex)=>({text,copyIndex,status:'LOCKED',sourceKind:'SOURCE_FRAME_EXACT',sourceVideoSha256:source,frameNumber:10}))},tasks:[{module:'media-files',dependencies:[],parameters:{}}],referenceProductionDesign:{references:[reference],states:[{state:'HOLD',visibleCopyIndices:indices}]}};
 const plan={contract:'A1ShotTaskPlan/v1',projectId:'fixture',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:source},shots:[old]};
 const fontPath=path.resolve('apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf'),font={id:'native-font',path:fontPath,sha256:hash(fs.readFileSync(fontPath)),postscriptName:'SourceHanSansCN-Heavy',weight:900};
 const cells=Array.from({length:40},(_,i)=>({cellId:'cell-'+i,text:i<2?null:exactCopy[(i-2)%23]})),inventory=save('cells.json',{contract:'A1ReferenceTableTranscriptionAuthoring/v1',shotId:'table',sourceVideoSha256:source,cells});
 const layers=cells.map((c,i)=>({id:c.cellId,designLayerId:'table-copy',box:{x:.01+(i%5)*.195,y:.01+Math.floor(i/5)*.12,width:.18,height:.095},z:1,...(c.text===null?{kind:'UNREADABLE',sourceLiteralStatus:'UNREADABLE',sourceLiteralLocked:false}:{kind:'TEXT',copyIndex:exactCopy.indexOf(c.text),fontId:font.id,fontSize:17,minFontSize:17,fill:'#111111'})}));
 const design={contract:'A1ReferenceProductionDesign/v1',shotId:'table',sourceVideoSha256:source,viewerIntent:'Read all table cells',appearance:{composition:'Five columns',palette:'Native type',surface:'Editable data core'},references:[reference],layers:[{id:'table-copy',role:'TEXT',sourceMode:'LOCAL',copyIndices:indices,treatment:'NONE',purpose:'Source dictionary mapped to cell occurrences',fontRole:'Installed local font, original unknown',hierarchy:'Preserve source cell positions'}],states:[{state:'HOLD',visibleCopyIndices:indices,visibleLayerIds:['table-copy'],viewerNotice:'Read source cells'}],acceptance:[{layerId:'table-copy',check:'All readable source cells present'}],uncertainties:[]};
 const input={contract:'A1SourceBoundNativeLayoutInput/v1',taskId:'fixture',shotId:'table',baseShotSha256:nodeInputHash(old),expectedExactCopySha256:nodeInputHash(exactCopy),sourceReferenceEvidence:evidence,sourceCellInventory:inventory,
   productionLayout:{contract:'A1ProductionStateLayouts/v1',mode:'STATIC',canvas:{width:960,height:540},states:[{state:'HOLD',referencePath:ref.path,copyIndices:indices,layers}]},productionResources:{assets:[],fonts:[font]},referenceProductionDesign:design,
   typographyDirections:[{layerId:'table-copy',route:'SOURCE_NATIVE',sourceClass:'CODE_NATIVE_ASSET',originalFontIdentity:'UNKNOWN',referenceSha256:ref.sha256,exactCopy,fontBindings:[{id:font.id,sha256:font.sha256}],shape:'Locally authored native glyphs',composition:'Source cell geometry',visualApproval:false,productionAdmission:false}],deliveryBoundary:'DATA_CORE_ONLY',graphicsDebt:['Surround and pattern unavailable'],visualApproval:false,productionAdmission:false};
 const unit={copyMode:'SOURCE_BOUND_NATIVE_LAYOUT',shotId:'table',authoringInput:save('input.json',input)},snapshot=JSON.stringify(plan),out=prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan,unit});
 const reordered=structuredClone(input);reordered.productionLayout.states[0].copyIndices=[...indices].reverse();reordered.referenceProductionDesign.states[0].visibleCopyIndices=[...indices].reverse();const reorderedOut=prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan,unit:{...unit,authoringInput:save('reordered-copy.json',reordered)}});assert.deepEqual(reorderedOut.plan.shots[0].productionLayout.states[0].copyIndices,[...indices].reverse(),'source/display order is retained while layer coverage is a set');
 assert.equal(JSON.stringify(plan),snapshot);assert.deepEqual(out.plan.shots[0].sourcePresentation,old.sourcePresentation);assert.deepEqual(out.plan.shots[0].exactCopy,exactCopy);assert.equal(out.plan.shots[0].sourceNativeLayoutBinding.fullPackagingComplete,false);
 assert.equal(out.plan.shots[0].sourceNativeLayoutBinding.glyphCoverage.states[0].runCount,38);
 assert.equal(out.plan.shots[0].sourceNativeLayoutBinding.glyphCoverage.systemFontFallbackUsed,false);
 const workspace=preflightShotTaskPlanV1({repoRoot:root,taskId:'fixture',plan:out.plan}),registry=createNodeAdapterRegistry(),workflow=compileNodeWorkflow(nodeWorkflowInput(workspace),null,{moduleDefinitions:registry.definitions}),type=workflow.nodes.find(n=>n.module==='editable-typography');
 assert.equal(type.input.need,true,JSON.stringify(type));const artifacts=path.join(task,'fixture-artifacts');fs.mkdirSync(artifacts);
 const rendered=await registry.registry['editable-typography'].execute(type,{artifactRoot:artifacts,dependencies:{}});assert.equal(rendered.state,'needs-review',rendered.reason);assert.equal(rendered.staticStates.samples.length,1);
 const layout=JSON.parse(fs.readFileSync(path.join(artifacts,rendered.artifactManifest.artifacts.find(a=>a.role==='typography-layout').path)));assert.equal(layout.glyphManifests.length,38);assert.equal(layout.parameters.copyOccurrences.unreadableCells.length,2);
 for(const mutate of [x=>x.exactCopy=['overwrite'],x=>x.baseShotSha256='b'.repeat(64),x=>x.productionLayout.states[0].copyIndices.pop(),x=>x.productionLayout.states[0].layers.pop(),x=>x.productionLayout.states[0].layers[0]={...x.productionLayout.states[0].layers[0],kind:'TEXT',copyIndex:0},x=>x.productionLayout.states[0].layers[2].copyIndex=22,x=>x.typographyDirections[0].originalFontIdentity='VERIFIED_MATCH',x=>x.productionResources.fonts[0].sha256='b'.repeat(64)]){
   const bad=structuredClone(input);mutate(bad);assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan,unit:{...unit,authoringInput:save('bad.json',bad)}}),/SOURCE_NATIVE_LAYOUT/);
 }
 const narrowPath='/System/Library/Fonts/Supplemental/Arial Narrow.ttf';
 if(fs.existsSync(narrowPath)){
   const missing=structuredClone(input),badFont={id:font.id,path:narrowPath,sha256:hash(fs.readFileSync(narrowPath)),postscriptName:'ArialNarrow',weight:400};
   missing.productionResources.fonts=[badFont];missing.typographyDirections[0].fontBindings=[{id:badFont.id,sha256:badFont.sha256}];
   assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan,unit:{...unit,authoringInput:save('missing-cjk-font.json',missing)}}),/SOURCE_NATIVE_LAYOUT_GLYPH_COVERAGE.*missing-codepoint/,'valid font bytes and measured layout do not prove CJK glyph coverage');
 }
 const packs=path.join(root,'apps/studio-next/public/generated/system-line/reference-packs/fixture');fs.mkdirSync(packs,{recursive:true});
 const styles=['a','b'].map(id=>{const file=path.join(packs,id+'.png'),bytes=Buffer.from('style fixture '+id);fs.writeFileSync(file,bytes);return {id,publicUrl:'/generated/system-line/reference-packs/fixture/'+id+'.png',sha256:hash(bytes),role:'preference-reference'};});
 const manifestFile=path.join(packs,'manifest.json');fs.writeFileSync(manifestFile,JSON.stringify({packId:'fixture',referenceOnly:true,productionAssetAllowed:false,sources:styles}));
 const requiredPlan={...plan,visualQualityPolicy:{requireAestheticReferences:true}},aestheticInput={...input,baseShotSha256:nodeInputHash(old),aestheticReferences:{manifest:{path:manifestFile,sha256:hash(fs.readFileSync(manifestFile))},selections:styles.map(s=>({id:s.id,adoptedTraits:['Fallback material only; source composition remains authoritative']}))}};
 assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan:requiredPlan,unit}),/AESTHETIC_REFERENCES_REQUIRED/);
 const nativeStyled=prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan:requiredPlan,unit:{...unit,authoringInput:save('native-aesthetic.json',aestheticInput)}}).plan.shots[0];
 const bound=readProductionBatchAestheticsV1({repoRoot:root,plan:requiredPlan,shot:nativeStyled,state:'HOLD'});
 assert.equal(bound.bindingSha256,nativeStyled.sourceNativeLayoutBinding.aestheticReferences.bindingSha256);
 assert.equal(productionBatchReviewScopeV1({activeWorkScope:{referencePackagingOnly:true}},nativeStyled,'HOLD'),'PACKAGING_CORE');
 assert.equal(nativeStyled.sourceNativeLayoutBinding.deliveryBoundary,'DATA_CORE_ONLY');assert.equal(nativeStyled.sourceNativeLayoutBinding.fullPackagingComplete,false);
 const tampered=structuredClone(nativeStyled);tampered.sourceNativeLayoutBinding.aestheticReferences.bindingSha256='f'.repeat(64);
 assert.throws(()=>readProductionBatchAestheticsV1({repoRoot:root,plan:requiredPlan,shot:tampered,state:'HOLD'}),/AESTHETIC_BINDING_CHANGED/);
 const missingNative=structuredClone(nativeStyled);delete missingNative.sourceNativeLayoutBinding.aestheticReferences;
 missingNative.fullFrameRequests=[{state:'HOLD',aestheticReferences:bound}];
 assert.throws(()=>readProductionBatchAestheticsV1({repoRoot:root,plan:requiredPlan,shot:missingNative,state:'HOLD'}),/AESTHETIC_REFERENCES_REQUIRED/,'stale full-frame binding cannot stand in for current native source');
 fs.appendFileSync(path.join(packs,'a.png'),'drift');
 assert.throws(()=>readProductionBatchAestheticsV1({repoRoot:root,plan:requiredPlan,shot:nativeStyled,state:'HOLD'}),/AESTHETIC_REFERENCE_CHANGED/);
 assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan:requiredPlan,unit:{...unit,authoringInput:save('native-aesthetic-drift.json',aestheticInput)}}),/AESTHETIC_REFERENCE_CHANGED/);
 const flat=save('flat.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=','base64')),decorated=structuredClone(input);
 decorated.productionResources.assets=[{...flat,assetId:'flat',kind:'IMAGE',role:'packaging-texture',materialClass:'CODE_NATIVE_ASSET',referenceOnly:false,provenance:{status:'VERIFIED',sourceUrl:flat.path}}];
 decorated.productionLayout.states[0].layers.unshift({id:'flat-surround',kind:'ASSET',assetId:'flat',role:'BACKGROUND',fit:'fill',box:{x:0,y:0,width:1,height:1},z:0});
 decorated.referenceProductionDesign.layers.unshift({id:'flat-surround',role:'BACKGROUND',sourceMode:'EXISTING',assetIds:['flat'],copyIndices:[],treatment:'NONE',purpose:'Native nontext background'});
 decorated.referenceProductionDesign.states[0].visibleLayerIds.unshift('flat-surround');decorated.referenceProductionDesign.acceptance.push({layerId:'flat-surround',check:'No invented source text'});
 const surround=prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan,unit:{...unit,authoringInput:save('surround.json',decorated)}});
 assert.equal(surround.plan.shots[0].productionLayout.states[0].layers.length,41);assert.deepEqual(surround.plan.shots[0].exactCopy,exactCopy);
 const occluded=structuredClone(decorated);occluded.productionLayout.states[0].layers[0].z=99;assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan,unit:{...unit,authoringInput:save('occluded.json',occluded)}}),/LAYOUT_TEXT_OCCLUSION_UNSUPPORTED/);
 const mediaParameters=surround.plan.shots[0].tasks.find(t=>t.module==='media-files').parameters;
 const mediaResult=await mediaFileNodeAdapterV1.execute({id:'table:media-files',inputSha256:'c'.repeat(64),input:{parameters:mediaParameters}},{artifactRoot:artifacts});
 assert.equal(mediaResult.state,'needs-review',mediaResult.reason);assert.equal(mediaParameters.files[0].role,'packaging-texture');
 for(const role of [undefined,'unknown-role']){
   const bad=structuredClone(decorated);if(role===undefined)delete bad.productionResources.assets[0].role;else bad.productionResources.assets[0].role=role;
   assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan,unit:{...unit,authoringInput:save('invalid-role.json',bad)}}),/ASSET_ROLE_REQUIRED/);
   const parameters=structuredClone(mediaParameters);if(role===undefined)delete parameters.files[0].role;else parameters.files[0].role=role;
   assert.equal((await mediaFileNodeAdapterV1.execute({input:{parameters}},{artifactRoot:artifacts})).reason,'REFERENCE_MEDIA_FORBIDDEN','prepare must reject the same invalid role before media execution');
 }
 const evidenceRole=structuredClone(decorated);evidenceRole.productionResources.assets[0].role='verified-evidence';
 assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan,unit:{...unit,authoringInput:save('false-evidence-role.json',evidenceRole)}}),/SURROUND_ASSET_ONLY/);
 for(const mutate of [x=>x.productionLayout.states[0].layers[0].kind='TEXT',x=>x.productionLayout.states[0].layers[0].role='EVIDENCE',x=>x.productionLayout.states[0].layers[0].copyIndex=0,x=>x.productionLayout.states[0].layers[0].sourceLiteralStatus='UNREADABLE',x=>x.productionLayout.states[0].layers[0].assetId='unbound']){
   const bad=structuredClone(decorated);mutate(bad);assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan,unit:{...unit,authoringInput:save('bad-surround.json',bad)}}),/SURROUND_ASSET_ONLY|CURRENT_REFERENCE_COPY/);
 }
 // Mixed old raster HOLD and new native states: only selected cells are native.
 const mixedBefore=structuredClone(plan),baseShot=mixedBefore.shots[0];
 baseShot.productionLayout=structuredClone(decorated.productionLayout);baseShot.productionLayout.states[0].layers=[structuredClone(decorated.productionLayout.states[0].layers[0])];
 baseShot.productionResources=structuredClone(decorated.productionResources);baseShot.referenceProductionDesign=structuredClone(decorated.referenceProductionDesign);
 baseShot.referenceProductionDesign.layers=baseShot.referenceProductionDesign.layers.filter(l=>l.id==='flat-surround');baseShot.referenceProductionDesign.layers[0].copyIndices=indices;
 baseShot.referenceProductionDesign.states[0].visibleLayerIds=['flat-surround'];baseShot.referenceProductionDesign.acceptance=baseShot.referenceProductionDesign.acceptance.filter(a=>a.layerId==='flat-surround');
 const implementations=Object.fromEntries(Object.entries(registry.registry).map(([id,a])=>[id,a.stateImplementationSha256]));
 const baseline=compileProductionPlanV1(mixedBefore,{repoRoot:root,shotIds:['table'],stateImplementations:implementations});assert.equal(baseline.results[0].compiled,true,JSON.stringify(baseline.results[0]));
 const bs=baseline.plan.shots[0],mixed=structuredClone(decorated),newRefs=['ENTRY','HANDOFF'].map((state,i)=>({...reference,state,sourceFrame:i?15:5}));mixed.baseShotSha256=nodeInputHash(bs);mixed.selectedNativeStates=['ENTRY','HANDOFF'];
 mixed.sourceReferenceEvidence=save('coverage/mixed-evidence.json',{contract:'A1ReferenceSequenceStateEvidence/v1',source:{sha256:source},stateFrames:{table:[newRefs[0],reference,newRefs[1]].map(r=>({state:r.state,sourceFrame:r.sourceFrame,artifactSha256:r.sha256,artifactPath:'coverage/reference.png'}))}});
 const ms=structuredClone(mixed.productionLayout.states[0]),unknown=structuredClone(ms);unknown.state='ENTRY';unknown.copyIndices=[];for(const l of unknown.layers)if(l.kind==='TEXT')l.visibility='HIDDEN';ms.state='HANDOFF';
 mixed.productionLayout.states=[unknown,structuredClone(bs.productionLayout.states[0]),ms];mixed.referenceProductionDesign=structuredClone(bs.referenceProductionDesign);mixed.referenceProductionDesign.references=[newRefs[0],reference,newRefs[1]];
 mixed.referenceProductionDesign.layers.push(structuredClone(design.layers[0]));mixed.referenceProductionDesign.acceptance.push(structuredClone(design.acceptance[0]));
 mixed.referenceProductionDesign.states=[{...design.states[0],state:'ENTRY',visibleCopyIndices:[],visibleLayerIds:['flat-surround','table-copy']},...bs.referenceProductionDesign.states,{...design.states[0],state:'HANDOFF',visibleLayerIds:['flat-surround','table-copy']}];mixed.typographyDirections[0].referenceSha256=newRefs[1].sha256;
 const mixedUnit={...unit,authoringInput:save('mixed-native.json',mixed)},mixedOut=prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan:baseline.plan,unit:mixedUnit}),mshot=mixedOut.plan.shots[0];
 assert.deepEqual(mshot.productionLayout.states[1],bs.productionLayout.states[0]);assert.deepEqual(mshot.tasks.find(t=>t.module==='layer-compositor').parameters.staticStatePlan.states.find(s=>s.state==='HOLD').parameters,bs.tasks.find(t=>t.module==='layer-compositor').parameters.staticStatePlan.states[0].parameters);
 const packagingPlan={activeWorkScope:{referencePackagingOnly:true}};assert.equal(productionBatchReviewScopeV1(packagingPlan,mshot,'HOLD'),'WHOLE_FRAME');assert.equal(productionBatchReviewScopeV1(packagingPlan,mshot,'HANDOFF'),'PACKAGING_CORE');
 const unknownContent=productionBatchStateContentV1({shot:mshot,state:'ENTRY'});assert.deepEqual(unknownContent.exactCopy,[]);assert.equal(unknownContent.nativeStateVisibility.cells.filter(c=>c.visibility==='UNKNOWN').length,2);assert.equal(unknownContent.hiddenCellIds.length,38);assert.equal(unknownContent.wholeAnchorApproved,false);
 const mixedWorkspace=preflightShotTaskPlanV1({repoRoot:root,taskId:'fixture',plan:mixedOut.plan}),mixedWorkflowInput=nodeWorkflowInput(mixedWorkspace);let mixedWorkflow=compileNodeWorkflow(mixedWorkflowInput,null,{moduleDefinitions:registry.definitions});
 const mixedArtifacts=path.join(task,'mixed-static-artifacts');fs.mkdirSync(mixedArtifacts);
 for(const module of ['media-files','editable-typography','layer-compositor']){
   const node=mixedWorkflow.nodes.find(n=>n.module===module),dependencies=Object.fromEntries(node.dependencies.map(id=>{const dependency=mixedWorkflow.nodes.find(n=>n.id===id);return [id,{state:dependency.state,inputSha256:dependency.inputSha256,manifestSha256:dependency.acceptance.manifestSha256,artifacts:dependency.acceptance.artifacts.map(a=>({...a,absolutePath:path.join(mixedArtifacts,a.path)}))}];}));
   const produced=await registry.registry[module].execute(node,{artifactRoot:mixedArtifacts,dependencies});assert.equal(produced.state,'needs-review',module+':'+produced.reason);
   if(module==='layer-compositor')assert.deepEqual(produced.staticStates.samples.map(s=>s.state),['ENTRY','HOLD','HANDOFF']);
   if(module==='editable-typography')assert.deepEqual(produced.staticStates.samples.map(s=>s.state),['HANDOFF'],'no fake glyph run for UNKNOWN-only ENTRY or raster HOLD');
   node.state='needs-review';node.result=produced;mixedWorkflow=await acceptNodeArtifacts(mixedWorkflow,node.id,{artifactRoot:mixedArtifacts,reviewerId:'isolated-fixture'});mixedWorkflow=compileNodeWorkflow(mixedWorkflowInput,mixedWorkflow,{moduleDefinitions:registry.definitions});
 }

 for(const mutate of [x=>delete x.selectedNativeStates,x=>x.selectedNativeStates=['HANDOFF','HANDOFF'],x=>x.productionLayout.states[1].layers[0].box.width=.8,x=>x.referenceProductionDesign.states[1].viewerNotice='changed old duty',x=>x.productionResources.assets[0].provenance={newAuthority:true}]){const bad=structuredClone(mixed);mutate(bad);assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan:baseline.plan,unit:{...unit,authoringInput:save('bad-mixed.json',bad)}}),/SOURCE_NATIVE_LAYOUT/);}
 const unknownOnlyBefore=structuredClone(baseline.plan);unknownOnlyBefore.shots[0].productionResources.fonts=[];
 const unknownOnly=structuredClone(mixed);unknownOnly.baseShotSha256=nodeInputHash(unknownOnlyBefore.shots[0]);unknownOnly.selectedNativeStates=['ENTRY'];unknownOnly.productionLayout.states=unknownOnly.productionLayout.states.filter(s=>s.state!=='HANDOFF');unknownOnly.referenceProductionDesign.states=unknownOnly.referenceProductionDesign.states.filter(s=>s.state!=='HANDOFF');unknownOnly.referenceProductionDesign.references=unknownOnly.referenceProductionDesign.references.filter(s=>s.state!=='HANDOFF');unknownOnly.productionResources.fonts=[];unknownOnly.typographyDirections=[];
 assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan:unknownOnlyBefore,unit:{...unit,authoringInput:save('unknown-unroutable.json',unknownOnly)}}),/SOURCE_NATIVE_LAYOUT_REFERENCE_DESIGN:DESIGN_MODULE_NOT_DECLARED:editable-typography/);
 // Unknown geometry has no readable type producer; keep only the existing
 // surround in the executable design instead of declaring future table copy.
 Object.assign(unknownOnly.referenceProductionDesign.layers.find(l=>l.id==='table-copy'),
   {role:'BACKGROUND',sourceMode:'EXISTING',assetIds:['flat'],copyIndices:[],purpose:'Unknown placeholder geometry on existing surround'});
 const unknownPrepared=prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan:unknownOnlyBefore,unit:{...unit,authoringInput:save('unknown-only.json',unknownOnly)}}).plan.shots[0];assert.equal(unknownPrepared.tasks.some(t=>t.module==='editable-typography'),false);assert.equal(unknownPrepared.sourceNativeLayoutBinding.stateVisibility[0].cells.filter(c=>c.visibility==='UNKNOWN').length,2);assert.deepEqual(productionBatchStateContentV1({shot:unknownPrepared,state:'ENTRY'}).exactCopy,[]);
 const excludedBefore=structuredClone(baseline.plan);excludedBefore.shots[0].fullFrameStateFocus={activeStates:['HOLD'],excludedStates:['ENTRY','HANDOFF'],productionAdmission:false};
 const readmit=structuredClone(mixed);readmit.baseShotSha256=nodeInputHash(excludedBefore.shots[0]);
 const readmitted=prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan:excludedBefore,unit:{...unit,authoringInput:save('readmit-native-states.json',readmit)}}).plan.shots[0];
 assert.deepEqual(readmitted.fullFrameStateFocus.excludedStates,[]);
 assert.deepEqual(new Set(readmitted.fullFrameStateFocus.activeStates),new Set(['ENTRY','HOLD','HANDOFF']));
 assert.equal(readmitted.fullFrameStateFocus.productionAdmission,false,'readmission binds executable inputs but grants no approval');
 console.log('PASS selected native ENTRY/HANDOFF with untouched raster HOLD producer and scope, zero-type UNKNOWN geometry, strict legacy default and untouched CAS.');
 fs.appendFileSync(flat.path,'drift');assert.throws(()=>prepareSourceBoundNativeLayoutV1({repoRoot:root,taskRoot:task,plan,unit:{...unit,authoringInput:save('drift-surround.json',decorated)}}),/FILE_CHANGED/);
 console.log('PASS normal source-native authoring preparation -> current source/ref/copy gates -> production compiler -> real preflight -> real static-v2 editable font output; 40 slots retained, source fields unchanged, unknown slots never guessed.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
