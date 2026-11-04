import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {compileReferenceProductionDesignV1,verifyResearchDesignReferencesV1} from '../apps/studio-next/src/lib/a1-reference-production-design-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
const sha='a'.repeat(64),ref='b'.repeat(64);
const shot={id:'UNSEEN',sourceText:'fixture',visualJob:'fixture',sourceInterval:{startFrame:0,endFrameExclusive:90},exactCopy:['Exact title','12%'],tasks:['media-files','article-source-discovery','external-media-discovery','asset-treatment','image-generation','editable-typography','diagram','layer-compositor','remotion-render'].map(module=>({module,dependencies:[],parameters:{}}))};
const layer=(id,role,extra={})=>({id,role,sourceMode:'AUTO',purpose:'Communicate the observed role',treatment:'NONE',...extra});
const designFor=layers=>({contract:'A1ReferenceProductionDesign/v1',shotId:'UNSEEN',sourceVideoSha256:sha,observationSource:'SYNTHETIC_TEST',viewerIntent:'Read the subject and understand the change',appearance:{composition:'One main subject',palette:'Source-led restrained accent',surface:'Specified per layer'},references:[{state:'HOLD',sourceFrame:30,path:'work/ref.png',sha256:ref}],layers,states:[{state:'HOLD',viewerNotice:'Read selected content',visibleLayerIds:layers.map(l=>l.id),visibleCopyIndices:[0]}],acceptance:layers.map(l=>({layerId:l.id,check:'Visible intended role and source hierarchy'}))});
const compile=(design,s=shot,refs=[ref])=>compileReferenceProductionDesignV1({design,shot:s,sourceVideoSha256:sha,verifiedReferenceShas:refs});
const cases=[
 {genre:'news-evidence',layers:[layer('article','EVIDENCE',{sourceType:'PAGE',treatment:'GENERATED_SURROUND'}),layer('paper','BACKGROUND'),layer('headline','TEXT',{fontRole:'headline',hierarchy:'primary',copyIndices:[0]})]},
 {genre:'portrait-profile',layers:[layer('person','SUBJECT',{identity:'REAL',sourceType:'IMAGE',treatment:'CROP'}),layer('setting','BACKGROUND'),layer('name','TEXT',{fontRole:'identity',hierarchy:'primary',copyIndices:[0]})]},
 {genre:'data-explainer',layers:[layer('grid','BACKGROUND',{primitive:'GRID'}),layer('values','DATA',{representation:'TABLE',fontRole:'numeric',hierarchy:'primary',copyIndices:[1]})]}
];
for(const c of cases){const r=compile(designFor(c.layers));assert.equal(r.status,'DESIGN_COMPILED_INPUT_BINDING_REQUIRED',JSON.stringify(r.blockers));assert.equal(r.boundaries.automaticVisionPerformed,false);assert.equal(r.boundaries.visualApproval,false);}
const news=compile(designFor(cases[0].layers));assert.deepEqual(news.layers[0].modules,['article-source-discovery','media-files','image-generation']);assert.equal(news.layers[0].preserveSourceCore,true);assert.deepEqual(news.layers[2].modules,['editable-typography']);
assert.deepEqual(compile(designFor(cases[2].layers)).layers[1].modules,['editable-typography']);
const withAsset=structuredClone(shot);withAsset.tasks[0].parameters.files=[{assetId:'portrait',referenceOnly:false}];assert.equal(compile(designFor([layer('person','SUBJECT',{identity:'REAL',assetIds:['portrait']})]),withAsset).layers[0].sourceMode,'EXISTING');
for(const change of [d=>d.layers[0].treatment='GENERATED_RESTYLE',d=>d.layers[0].sourceMode='GENERATE',d=>d.states[0].visibleCopyIndices=[999],d=>d.references[0].sourceFrame=100,d=>d.acceptance=[]]){const d=designFor(cases[0].layers);change(d);assert.equal(compile(d).status,'BLOCKED');}
assert.equal(compile(designFor(cases[0].layers),shot,[]).status,'BLOCKED');
// Real graph integration: optional legacy absence is unchanged; stale visual binding blocks dispatch.
const plan={contract:'A1ShotTaskPlan/v1',projectId:'unseen-project',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:sha},shots:[{...shot,tasks:[{module:'media-files',dependencies:[],parameters:{files:[]}},{module:'image-generation',dependencies:[],parameters:{}},{module:'layer-compositor',dependencies:['media-files','image-generation'],parameters:{}}]}]};
const legacy=compileShotTaskWorkspaceV1(plan);plan.shots[0].referenceProductionDesign=designFor([layer('setting','BACKGROUND')]);
const integrated=compileShotTaskWorkspaceV1(plan,{verifiedDesignReferenceShas:[ref]}).production.shotIntelligence.currentStoryboardAuthority.shots[0];
assert.equal(integrated.nodeWorkflow.modules['image-generation'],'unknown');assert.ok(integrated.nodeWorkflow.moduleInputs['image-generation'].referenceDesignIntent.designSha256);
assert.deepEqual(integrated.nodeWorkflow.moduleInputs['media-files'],legacy.production.shotIntelligence.currentStoryboardAuthority.shots[0].nodeWorkflow.moduleInputs['media-files'],'design changes do not invalidate unchanged source imports');
const tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-design-reference-')));try{fs.mkdirSync(path.join(tmp,'work'));const bytes=Buffer.from('fixture reference');fs.writeFileSync(path.join(tmp,'work/ref.png'),bytes);const d=designFor(cases[0].layers);d.references[0].sha256=createHash('sha256').update(bytes).digest('hex');const p={shots:[{referenceProductionDesign:d}]};assert.deepEqual(verifyResearchDesignReferencesV1({repoRoot:tmp,plan:p}),[d.references[0].sha256]);fs.writeFileSync(path.join(tmp,'work/ref.png'),'changed');assert.throws(()=>verifyResearchDesignReferencesV1({repoRoot:tmp,plan:p}),/SHA_MISMATCH/);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log(JSON.stringify({status:'PASS',genres:cases.map(c=>c.genre),realGeneration:0,checks:['mixed-web-imagegen-type','real-person-not-generated','local-data-and-grid','reuse-first','protected-evidence-core','state-copy-binding','pixel-drift','original-graph-integration','legacy-source-cache-preserved']}));
const broken=structuredClone(plan);broken.shots[0].referenceProductionDesign={contract:'invalid'};
const blocked=compileShotTaskWorkspaceV1(broken).production.shotIntelligence.currentStoryboardAuthority.shots[0];
assert.equal(blocked.nodeWorkflow.modules['image-generation'],'unknown','malformed design cannot leave old visual producer dispatchable');
const bound=structuredClone(plan),compiled=compile(bound.shots[0].referenceProductionDesign,bound.shots[0]);
for(const task of bound.shots[0].tasks.filter(t=>t.module!=='media-files'))task.parameters.referenceDesignBinding={designSha256:compiled.designSha256,layerIds:['setting']};
assert.equal(compileShotTaskWorkspaceV1(bound,{verifiedDesignReferenceShas:[ref]}).production.shotIntelligence.currentStoryboardAuthority.shots[0].nodeWorkflow.modules['image-generation'],true);
bound.shots[0].referenceProductionDesign.appearance.palette='Changed';
assert.equal(compileShotTaskWorkspaceV1(bound,{verifiedDesignReferenceShas:[ref]}).production.shotIntelligence.currentStoryboardAuthority.shots[0].nodeWorkflow.modules['image-generation'],'unknown','changed design invalidates old module binding');
const forbidden=structuredClone(withAsset);forbidden.tasks[0].parameters.files[0].sha256=ref;
assert.equal(compile(designFor([layer('person','SUBJECT',{identity:'REAL',assetIds:['portrait']})]),forbidden).status,'BLOCKED','reference-only pixels cannot become the output through an asset alias');
const prompted=structuredClone(plan);prompted.shots[0].tasks.find(t=>t.module==='image-generation').parameters.generationRequest={prompt:'Create the requested background',purpose:'packaging-component',transparentBackground:false};
const consumed=compileShotTaskWorkspaceV1(prompted,{verifiedDesignReferenceShas:[ref]}).production.shotIntelligence.currentStoryboardAuthority.shots[0];
assert.match(consumed.nodeWorkflow.moduleInputs['image-generation'].generationRequest.prompt,/Specified per layer/);
assert.match(consumed.nodeWorkflow.moduleInputs['image-generation'].generationRequest.prompt,/Preserve protected real content/);
assert.ok(consumed.nodeWorkflow.moduleDependencies['layer-compositor'].includes('image-generation'));
const tableEvidence=structuredClone(shot);tableEvidence.tasks[0].parameters.files=[{assetId:'paper',referenceOnly:false}];
const tableDesign=designFor([layer('table','DATA',{assetIds:['paper'],representation:'TABLE',fontRole:'numbers',hierarchy:'primary',copyIndices:[1]})]);
assert.deepEqual(compile(tableDesign,tableEvidence).layers[0].modules,['editable-typography'],'evidence asset must not replace data typesetting');
tableDesign.uncertainties=[{scope:'label',detail:'unresolved source label'}];assert.ok(compile(tableDesign,tableEvidence).blockers.includes('DESIGN_UNCERTAINTIES_OPEN'));
const derived=structuredClone(withAsset);derived.tasks[0].parameters.files[0].provenance={nativePageEvidence:false,useClass:'PRIVATE_DERIVED_RECONSTRUCTION'};
assert.ok(compile(designFor([layer('page','EVIDENCE',{sourceMode:'EXISTING',assetIds:['portrait']})]),derived).blockers.some(x=>x.includes('DERIVED_STATIC_IS_NOT_NATIVE_EVIDENCE')));
const cleanDesign=designFor(cases[0].layers);cleanDesign.states[0].visibleLayerIds=[];cleanDesign.states[0].visibleCopyIndices=[];
assert.ok(compile(cleanDesign).blockers.includes('DESIGN_EMPTY_STATE_REQUIRES_SOURCE_BOUND_NO_PACKAGE'));
const cleanShot=structuredClone(shot);cleanShot.statePackagingDecisions=[{state:'HOLD',sourceFrame:30,sourceVideoSha256:sha,referenceSha256:ref,packagingForm:'NO_PACKAGE',observation:'CLEAN_PRESENTER',packagingElementsVisible:false,reason:'Verified clean presenter sample.'}];
assert.ok(!compile(cleanDesign,cleanShot).blockers.includes('DESIGN_EMPTY_STATE_REQUIRES_SOURCE_BOUND_NO_PACKAGE'));
cleanShot.statePackagingDecisions[0].referenceSha256='c'.repeat(64);
assert.ok(compile(cleanDesign,cleanShot).blockers.includes('DESIGN_EMPTY_STATE_REQUIRES_SOURCE_BOUND_NO_PACKAGE'));
console.log('PASS empty design state requires verified scoped packaging exemption');
const {classifyDesignUncertaintiesV1}=await import('../apps/studio-next/src/lib/a1-reference-production-design-v1.mjs');
const uncertaintySet={productionStage:'STATIC',uncertainties:[{scope:'font',detail:'approximate',impact:'STYLE_APPROXIMATION',resolution:'EXPLICIT_LAYOUT_FALLBACK'},{scope:'timing',detail:'unknown',impact:'MOTION_ONLY'},{scope:'source',detail:'missing',impact:'SOURCE'},{scope:'old',detail:'unclassified'}]};
const classified=classifyDesignUncertaintiesV1(uncertaintySet,{productionLayout:{contract:'A1ProductionLayout/v1'}});
assert.equal(classified.blocking.length,2);assert.equal(classified.limitations.length,1);assert.equal(classified.deferred.length,1);
assert.equal(classifyDesignUncertaintiesV1({...uncertaintySet,productionStage:'MOTION'},{}).blocking.length,4);
const nativeShot=structuredClone(shot);nativeShot.tasks[0].parameters.files=[{assetId:'native-table',referenceOnly:false,materialClass:'VERIFIED_PAPER',provenance:{status:'VERIFIED',sourceUrl:'https://example.com/paper'}}];
const nativeDesign=designFor([layer('source-table','DATA',{identity:'REAL',sourceType:'PAGE',representation:'TABLE',assetIds:['native-table'],copyIndices:[]})]);
const native=compile(nativeDesign,nativeShot);assert.equal(native.layers[0].sourceMode,'EXISTING');assert.deepEqual(native.layers[0].modules,['media-files']);assert.ok(!native.blockers.includes('source-table:LAYER_EXACT_COPY_UNBOUND'));
const invented=structuredClone(nativeShot);invented.tasks[0].parameters.files[0].materialClass='ORIGINAL_GENERATED_ASSET';assert.ok(compile(nativeDesign,invented).blockers.includes('source-table:REAL_SOURCE_PROVENANCE_UNVERIFIED'));
const connectors=compile(designFor([layer('connectors','DATA',{representation:'DIAGRAM',primitive:'DIAGRAM',copyIndices:[]})]));assert.ok(!connectors.blockers.includes('connectors:LAYER_EXACT_COPY_UNBOUND'));assert.deepEqual(connectors.layers[0].modules,['diagram']);
const generatedReferenceType=structuredClone(shot);generatedReferenceType.typographyDirections=[{layerId:'title',route:'GENERATED_HERO_GLYPH'}];assert.deepEqual(compile(designFor([layer('title','TEXT',{fontRole:'reference glyph',hierarchy:'primary',copyIndices:[0]})]),generatedReferenceType).layers[0].modules,['image-generation','editable-typography']);
console.log('PASS native source tables preserved, generated imagery cannot masquerade as evidence, textless diagram connectors and reference glyph route');
