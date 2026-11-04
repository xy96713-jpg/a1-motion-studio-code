import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compileFullFrameRequestsV1,assertTransferableFrameBriefV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {compileProductionStateLayoutsV1} from '../apps/studio-next/src/lib/a1-production-layout-compiler-v1.mjs';
import {compileShotTaskWorkspaceV1,assessShotImagegenDesignV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {productionFrameGoalShaV1,productionFrameRequestIsCurrentV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {validateProductionFrameRecipesV1,productionFrameRecipeSchemaV1} from '../apps/studio-next/src/lib/a1-production-frame-planner-v1.mjs';
import {projectProductionMaterialPoolV1} from '../apps/studio-next/src/lib/a1-production-material-pool-v1.mjs';
import {readProductionAestheticReferencesV1} from '../apps/studio-next/src/lib/a1-production-aesthetic-references-v1.mjs';
import {prepareProductionFrameRepairV1} from '../apps/studio-next/src/lib/a1-production-frame-repair-v1.mjs';
assert.throws(()=>assertTransferableFrameBriefV1('Use Image 5 as the composition reference'),/UNBOUND_BRIEF_IMAGE_NUMBER/);
assert.throws(()=>assertTransferableFrameBriefV1('参考图1／图4，排除图5的旧卡片'),/UNBOUND_BRIEF_IMAGE_NUMBER/);
assert.doesNotThrow(()=>assertTransferableFrameBriefV1('Preserve the source composition; avoid the rejected stacked cards'));
assert.doesNotThrow(()=>assertTransferableFrameBriefV1('完整显示“图4：实验结果”这一原文标签',['图4：实验结果']));
import {bindApproximateFrameReviewV1,productionRevisionSettlementOnlyV1} from '../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'full-frame-fixture-'))),taskRoot=path.join(root,'work','unseen-fixture');fs.mkdirSync(taskRoot,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
function file(id){const pathName=path.join(taskRoot,id+'.png'),bytes=Buffer.from('isolated-'+id);fs.writeFileSync(pathName,bytes);return {path:pathName,sha256:hash(bytes)};}
const source='a'.repeat(64),ref=file('ref'),subject=file('subject'),native=file('native');
const assets=[{...subject,assetId:'illustration',kind:'IMAGE',referenceOnly:false,materialClass:'ORIGINAL_GENERATED_ASSET'},
  {...native,assetId:'native',kind:'IMAGE',referenceOnly:false,materialClass:'VERIFIED_SOURCE_IMAGE',provenance:{status:'VERIFIED',sourceUrl:'https://example.org/fixture',nativePageEvidence:true}}];
const shot=(id,copy,real=false)=>({id,sourceText:'Unseen '+id,visualJob:'Unseen frame',exactCopy:copy,sourceInterval:{startFrame:0,endFrameExclusive:100},sourceVersionSha256:source,tasks:[],productionResources:{assets,fonts:[]},
  referenceProductionDesign:{contract:'A1ReferenceProductionDesign/v1',shotId:id,sourceVideoSha256:source,viewerIntent:'Read the supplied content',appearance:{composition:'Main subjects clear',palette:'Neutral with one accent',surface:'Paper'},
    references:[{...ref,path:path.relative(root,ref.path),state:'HOLD',sourceFrame:50}],layers:[{id:'hero',role:'TEXT'},...(real?[{id:'evidence',role:'EVIDENCE',identity:'REAL'}]:[])],
    states:[{state:'HOLD',visibleCopyIndices:copy.map((_,i)=>i),visibleLayerIds:['hero',...(real?['evidence']:[])]}],uncertainties:[]}});
const plan={contract:'A1ShotTaskPlan/v1',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:source},shots:[shot('product',['Product A'],true),shot('type',['完整标题']),shot('flow',['1','输入','2','输出'])],
  visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'}};
plan.activeWorkScope={contract:'A1ProductionWorkScope/v1',shotIds:plan.shots.map(s=>s.id),objective:'Complete unseen frames',sourceIdentity:workScopeSourceIdentityV1(plan),productionAdmission:false};
const core={layerId:'evidence',assetId:'native',box:{x:.1,y:.2,width:.4,height:.5},fit:'contain'};
const units=plan.shots.map(s=>({shotId:s.id,state:'HOLD',brief:'Create a complete readable static frame with '+s.exactCopy[0],
  contentPlan:{referenceKind:s.id==='product'?'PRODUCT_SCENE':'TYPOGRAPHY_EVENT',subject:s.exactCopy[0],action:'Show the locked content',viewerTakeaway:'Read the supplied subject',sourceAnchor:s.exactCopy[0],requiredVisibleAnchors:[s.exactCopy[0]],treatment:'REBUILD_EDITORIAL'},
  assetIds:['illustration'],...(s.id==='product'?{protectedCores:[core]}:{})}));
try{
  const packRoot=path.join(root,'apps/studio-next/public/generated/system-line/reference-packs/fixture');fs.mkdirSync(packRoot,{recursive:true});
  const styleFiles=['style-a','style-b'].map(id=>{const target=path.join(packRoot,id+'.png');fs.writeFileSync(target,Buffer.from(id));return {id,publicUrl:'/generated/system-line/reference-packs/fixture/'+id+'.png',sha256:hash(fs.readFileSync(target)),role:'preference-reference'};});
  const packFile=path.join(packRoot,'manifest.json');fs.writeFileSync(packFile,JSON.stringify({packId:'fixture',referenceOnly:true,productionAssetAllowed:false,sources:styleFiles}));
  const aestheticReferences={manifest:{path:path.relative(root,packFile),sha256:hash(fs.readFileSync(packFile))},selections:styleFiles.map(s=>({id:s.id,adoptedTraits:['asymmetric typography','structural halftone']}))};
  const strictPlan=structuredClone(plan);strictPlan.visualQualityPolicy.requireAestheticReferences=true;
  const catalogue=readProductionAestheticReferencesV1({repoRoot:root,binding:aestheticReferences,required:true});
  const targets=[{targetKey:'type:HOLD',shotId:'type',state:'HOLD',availableCopyIndices:[0],reference:ref,aestheticCatalogue:catalogue}];
  const recipe={targetKey:'type:HOLD',route:'GENERATE',reason:'Source typography needs an authored composition',viewerIntent:'Read the current title',
    brief:units[1].brief,transparentBackground:false,contentPlan:units[1].contentPlan,copyIndices:[0],appearance:{composition:'Title-led field',palette:'Neutral with one accent',surface:'Pixel type'},
    materialSelections:[],protectedCores:[],continuityGroup:'title-field',masterTargetKey:'',aestheticReferenceIds:catalogue.references.map(r=>r.id),
    productionDecision:{method:'GENERATE_COMPLETE_FRAME',whySelected:'No accepted complete frame exists',alternatives:[{method:'REUSE_COMPLETE_FRAME',reason:'No current accepted recipe'}],sequenceRole:'Read the main judgment',handoff:'Next evidence frame'}};
  const pool=projectProductionMaterialPoolV1({plan:strictPlan});
  const proposal=validateProductionFrameRecipesV1({repoRoot:root,plan:strictPlan,pool,targets,proposal:{recipes:[recipe]}});
  assert.deepEqual(proposal.units[0].aestheticReferences,aestheticReferences,'planner emits bound inputs without manual JSON repair');
  assert.ok(productionFrameRecipeSchemaV1(targets,pool).properties.recipes.items.required.includes('aestheticReferenceIds'));
  assert.throws(()=>validateProductionFrameRecipesV1({repoRoot:root,plan:strictPlan,pool,targets,proposal:{recipes:[{...recipe,aestheticReferenceIds:['unknown']}]} }),/AESTHETIC_SELECTION_REQUIRED/);
  const planned=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:strictPlan,units:proposal.units});
  const packagePlacement={box:{x:.65,y:.2,width:.25,height:.6}};
  const packageUnit={...units[1],transparentBackground:true,packagePlacement};
  const placed=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[packageUnit]});
  assert.deepEqual(placed.assignments[0].packagePlacement,packagePlacement);
  assert.ok(placed.plan.assetTasks[0].tasks[0].parameters.generationRequest.prompt.includes('standalone transparent package'));
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...packageUnit,transparentBackground:false}]}),/PACKAGE_PLACEMENT_SCOPE/);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...units[0],transparentBackground:true,packagePlacement}]}),/PACKAGE_PLACEMENT_SCOPE/);
  const excludedPlan=structuredClone(strictPlan);
  excludedPlan.shots.find(s=>s.id==='type').fullFrameStateFocus={activeStates:[],excludedStates:['HOLD','ENTRY'],productionAdmission:false};
  const readmitted=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:excludedPlan,units:proposal.units}).plan.shots.find(s=>s.id==='type');
  assert.deepEqual(readmitted.fullFrameStateFocus.excludedStates,['ENTRY'],'normal preparation readmits only its explicitly validated state');
  assert.deepEqual(readmitted.fullFrameStateFocus.activeStates,[],'preparation does not claim produced or reviewed pixels');
  const repairPlan=structuredClone(planned.plan),repairShot=repairPlan.shots.find(s=>s.id==='type'),repairRequest=repairShot.fullFrameRequests[0];
  repairShot.productionResources.assets.push({...subject,assetId:'generated-master',kind:'IMAGE',referenceOnly:false,materialClass:'ORIGINAL_GENERATED_ASSET',provenance:{requestSha256:repairRequest.requestSha256}});
  const repair=prepareProductionFrameRepairV1({repoRoot:root,plan:repairPlan,proposal:{contract:'A1CompleteFrameRepairProposal/v1',productionAdmission:false,
    review:{path:'fixture-review.json',sha256:source},targets:[{shotId:'type',state:'HOLD',requestSha256:repairRequest.requestSha256,currentImageSha256:subject.sha256}],
    repairs:[{shotId:'type',state:'HOLD',requiresGeneration:true,repairBrief:'Restore the type-led hierarchy',reason:'Objects replaced the title field',nativeCores:[]}]}});
  assert.deepEqual(repair.units[0].aestheticReferences,aestheticReferences,'repair preserves preference binding');
  assert.equal(compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:repair.plan,units:repair.units}).assignments[0].aestheticReferences.bindingSha256,catalogue.bindingSha256);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:strictPlan,units:[units[1]]}),/AESTHETIC_REFERENCES_REQUIRED/);
  for(const unit of units){
    const styled=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:strictPlan,units:[{...unit,aestheticReferences}]});
    const assignment=styled.assignments[0],request=styled.plan.assetTasks[0].tasks[0].parameters.generationRequest;
    assert.equal(request.references.length,4);assert.equal(assignment.aestheticReferences.references.length,2);
    assert.ok(request.prompt.includes('USER_AESTHETIC'));assert.ok(request.prompt.includes('substantive direction failure'));
    assert.equal(assignment.aestheticReferences.visualApproval,false);
    const task=styled.plan.assetTasks[0].tasks[0],resource=styled.plan.assetTasks[0];
    assert.deepEqual(assessShotImagegenDesignV1(styled.plan,resource,task).missing,[]);
    const unbound=structuredClone(task);delete unbound.parameters.generationRequest.aestheticReferences;
    assert.ok(assessShotImagegenDesignV1(styled.plan,resource,unbound).missing.includes('AESTHETIC_REFERENCE_BINDING_REQUIRED'),'direct queued tool dispatch cannot bypass the aesthetic gate');
    const saved=assignment.aestheticReferences;
    assert.equal(readProductionAestheticReferencesV1({repoRoot:root,binding:{manifest:saved.manifest,selections:saved.references.map(r=>({id:r.id,adoptedTraits:r.adoptedTraits}))}}).bindingSha256,saved.bindingSha256);
  }
  assert.notEqual(productionFrameGoalShaV1(plan,plan.shots[1]),productionFrameGoalShaV1(strictPlan,strictPlan.shots[1]),'old content pass does not satisfy the new aesthetic goal');
  const settlement=structuredClone(plan);settlement.shots[1].productionRevisionRequest={requestId:'fixture',text:'repair',status:'OPEN'};
  const after=structuredClone(settlement);after.shots[1].productionRevisionRequest.status='DESIGN_BOUND';after.visualQualityPolicy.requireAestheticReferences=true;
  assert.equal(productionRevisionSettlementOnlyV1(settlement,after),false,'quality change cannot reuse a content-only review as metadata settlement');
  const reviewBinding={state:'HOLD',visualDirectionRequired:true},reviewNode={id:'fixture',inputSha256:source};
  const contentPass={state:'HOLD',copyCorrect:true,actorAndDataCorrect:true,readable:true,compositionAcceptable:true,findings:[],styleNotes:[]};
  assert.throws(()=>bindApproximateFrameReviewV1(reviewBinding,contentPass,reviewNode),/REVIEW_INVALID/);
  assert.equal(bindApproximateFrameReviewV1(reviewBinding,{...contentPass,visualDirectionCorrect:false},reviewNode).status,'VISUAL_FAIL');
  assert.equal(bindApproximateFrameReviewV1(reviewBinding,{...contentPass,visualDirectionCorrect:true,styleNotes:['Small font difference']},reviewNode).status,'PASS');
  const changed={...aestheticReferences,manifest:{...aestheticReferences.manifest,sha256:'0'.repeat(64)}};
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:strictPlan,units:[{...units[1],aestheticReferences:changed}]}),/MANIFEST_CHANGED/);
  fs.appendFileSync(path.join(packRoot,'style-a.png'),'changed');
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:strictPlan,units:[{...units[1],aestheticReferences}]}),/REFERENCE_CHANGED/);
  fs.writeFileSync(path.join(packRoot,'style-a.png'),'style-a');
  const compiled=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units});assert.equal(compiled.assignments.length,3);assert.equal(compiled.plan.assetTasks.length,3);
  for(const assignment of compiled.assignments){const asset=compiled.plan.assetTasks.find(a=>a.id===assignment.assetId),request=asset.tasks[0].parameters.generationRequest;
    assert.equal(asset.tasks.length,1);assert.equal(request.purpose,'packaging-component');assert.equal(request.references.length,2);assert.equal(request.transparentBackground,false);
    assert.ok(request.exactCopy.every(text=>request.prompt.includes(text)));assert.ok(request.prompt.includes('80 percent'));assert.ok(request.prompt.includes('complete packaging image'));
  }
  assert.ok(!plan.assetTasks,'original plan unchanged');
  const openRevision=structuredClone(plan);
  openRevision.shots[1].productionRevisionRequest={requestId:'new-state-revision',text:'Replace the presenter with a complete factual frame',status:'OPEN'};
  const newStateRevision=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:openRevision,units:[units[1]]});
  assert.equal(newStateRevision.plan.shots[1].productionRevisionRequest.status,'DESIGN_BOUND','a newly introduced state must finish design binding instead of remaining an open old-frame revision');
  assert.equal(openRevision.shots[1].productionRevisionRequest.status,'OPEN','caller revision is preserved');
  assert.equal(newStateRevision.plan.productionAdmission,false,'binding design is not production approval');
  const initial=compiled.plan.shots.find(s=>s.id==='type').fullFrameRequests[0],revised=structuredClone(compiled.plan);
  revised.shots.find(s=>s.id==='type').exactCopy=['新的完整标题'];
  const revisionUnit={...units[1],brief:'Create a frame with 新的完整标题',contentPlan:{...units[1].contentPlan,sourceAnchor:'新的完整标题',requiredVisibleAnchors:['新的完整标题']},replaceRequest:{requestSha256:initial.requestSha256,fromGoalSha256:initial.goalInputSha256,toGoalSha256:''}};
  revisionUnit.replaceRequest.toGoalSha256=productionFrameGoalShaV1(revised,revised.shots.find(s=>s.id==='type'));
  const replacement=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:revised,units:[revisionUnit]});
  const updated=replacement.plan.shots.find(s=>s.id==='type');assert.equal(updated.fullFrameRequestHistory[0].requestSha256,initial.requestSha256);
  assert.notEqual(updated.fullFrameRequests[0].requestSha256,initial.requestSha256);assert.equal(updated.wholeFrameReview.status,'CONTENT_REVISION_REVIEW_REQUIRED');
  assert.equal(replacement.plan.shots.find(s=>s.id==='product').fullFrameRequests[0].requestSha256,compiled.plan.shots.find(s=>s.id==='product').fullFrameRequests[0].requestSha256,'unrelated target preserved');
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:revised,units:[{...revisionUnit,replaceRequest:{...revisionUnit.replaceRequest,requestSha256:'0'.repeat(64)}}]}),/RECONCILE_FIRST/);
  const noContent={...units[1]};delete noContent.contentPlan;
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[noContent]}),/CONTENT_PLAN_REQUIRED/,'direct generator preparation cannot bypass the content planner');
  const specific=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...units[1],visualIntake:{viewerIntent:'State-specific reading task',appearance:{composition:'State-specific clear title',palette:'State-specific neutral',surface:'Flat'}}}]});
  const statePrompt=specific.plan.assetTasks[0].tasks[0].parameters.generationRequest.prompt;
  assert.ok(statePrompt.includes('Viewer intent: State-specific reading task'));
  assert.ok(statePrompt.includes('Composition: State-specific clear title'),'one state must not inherit another state composition');
  const crossPlan=structuredClone(plan);
  crossPlan.shots[1].productionResources.assets=[];
  const cross=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:crossPlan,units:[{...units[1],assetIds:[],materialSelections:[
    {materialId:'material-'+subject.sha256.slice(0,24),sha256:subject.sha256,use:'SUBJECT',reason:'Use this earlier shot subject; keep the target composition'}]}]});
  const crossRequest=cross.plan.assetTasks[0].tasks[0].parameters.generationRequest;
  assert.equal(crossRequest.references.length,2);assert.ok(crossRequest.prompt.includes('Image 2: SUBJECT'));
  assert.ok(cross.plan.shots[1].productionResources.assets.some(a=>a.sha256===subject.sha256),'cross-shot selection is compiled into the original shot resources');
  assert.equal(crossPlan.shots[1].productionResources.assets.length,0,'selection must not mutate the caller plan');
  const nativeCross=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...units[0],assetIds:[],materialSelections:[
    {materialId:'material-'+native.sha256.slice(0,24),sha256:native.sha256,use:'EVIDENCE',preserveNative:true,reason:'Preserve original factual source pixels'}]}]});
  assert.equal(nativeCross.plan.assetTasks[0].tasks[0].parameters.generationRequest.references.length,1,'native evidence is never sent to the generator for redrawing');
  const cacheReceipt=path.join(taskRoot,'cached-receipt.json');
  const cache={artifactRoot:taskRoot,result:{artifactManifest:{productionAdmission:false,artifacts:[{kind:'IMAGE',path:path.basename(subject.path),sha256:subject.sha256}]}}};
  fs.writeFileSync(cacheReceipt,JSON.stringify(cache));
  const cachedUnit={...units[1],existingFrame:{receipt:{path:cacheReceipt,sha256:hash(fs.readFileSync(cacheReceipt))},image:subject}};
  const cached=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[cachedUnit]});
  const placedCache=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...cachedUnit,transparentBackground:true,packagePlacement:{...packagePlacement,opacity:.6,blurSigma:3}}]});
  assert.equal(placedCache.assignments[0].deliveryMode,'EXISTING_LOCAL_COMPOSITE');
  assert.equal(placedCache.assignments[0].packagePlacement.opacity,.6,'one accepted master can produce a native entry state without new generation');
  assert.equal(cached.plan.assetTasks[0].tasks[0].module,'media-files');
  assert.equal(cached.assignments[0].deliveryMode,'EXISTING_LOCAL_COMPOSITE');
  assert.equal(cached.assignments[0].expectedImageSha256,subject.sha256);
  assert.equal(cached.plan.assetTasks[0].tasks[0].parameters.files[0].assetId,'cached-complete-'+subject.sha256.slice(0,24),'uncropped reuse retains its existing producer identity');
  assert.deepEqual(cached.assignments[0].contentPlan,cachedUnit.contentPlan,'byte reuse retains the current semantic plan for review and recovery');
  const contextualCache=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...cachedUnit,visualIntake:{viewerIntent:'Complete opaque faceless comparison',appearance:{composition:'Two full objects, no presenter slot',palette:'Source pair colors',surface:'Opaque scene'}}}]});
  assert.equal(contextualCache.assignments[0].viewerIntent,'Complete opaque faceless comparison');
  assert.equal(contextualCache.assignments[0].appearance.surface,'Opaque scene');
  assert.equal('generationRequest' in cached.plan.assetTasks[0].tasks[0].parameters,false);
  const emptyPlan=structuredClone(plan);
  emptyPlan.shots[1].referenceProductionDesign.states[0].visibleCopyIndices=[];
  const regions=[{sourceRect:{x:.6,y:.2,width:.35,height:.7},box:{x:0,y:0,width:1,height:1},z:0,fit:'fill'}];
  const regionUnit={...cachedUnit,existingFrame:{...cachedUnit.existingFrame,regions}};
  const regionReuse=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:emptyPlan,units:[regionUnit]});
  assert.deepEqual(regionReuse.assignments[0].localCompositeRegions,regions);
  assert.equal(regionReuse.assignments[0].expectedImageSha256,subject.sha256);
  assert.notEqual(regionReuse.assignments[0].requestSha256,cached.assignments[0].requestSha256);
  assert.equal(regionReuse.plan.assetTasks[0].tasks[0].module,'media-files');
  const cropRequest={...regionReuse.assignments[0],goalInputSha256:productionFrameGoalShaV1(emptyPlan,emptyPlan.shots[1],'HOLD')};
  assert.equal(productionFrameRequestIsCurrentV1({plan:emptyPlan,shot:emptyPlan.shots[1],request:cropRequest,unit:regionUnit}),true);
  assert.equal(productionFrameRequestIsCurrentV1({plan:emptyPlan,shot:emptyPlan.shots[1],request:cropRequest,unit:{...regionUnit,existingFrame:{...regionUnit.existingFrame,regions:[{...regions[0],sourceRect:{x:.1,y:.1,width:.3,height:.3}}]}}}),false,'changed crop cannot reuse a stale composed output');
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[regionUnit]}),/CACHE_REGIONS_INVALID/);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:emptyPlan,units:[{...regionUnit,existingFrame:{...regionUnit.existingFrame,regions:[{...regions[0],sourceRect:{x:.9,y:0,width:.5,height:1}}]}}]}),/CACHE_REGIONS_INVALID/);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:emptyPlan,units:[{...regionUnit,existingFrame:{...regionUnit.existingFrame,regions:[regions[0],regions[0]]}}]}),/CACHE_REGIONS_INVALID/);
  const downloadFile=path.join(taskRoot,'download.json'),reviewFile=path.join(taskRoot,'source-review.json');
  const download={contract:'A1UnreviewedMaterialDownload/v1',path:subject.path,sha256:subject.sha256,finalUrl:'https://example.org/photo.jpg',productionAdmission:false};
  fs.writeFileSync(downloadFile,JSON.stringify(download));
  const sourceReview={contract:'A1SourceMaterialUseReview/v1',actorType:'AGENT',reviewerId:'fixture',identityVerified:true,
    sourcePageUrl:'https://example.org/photo',assetUrl:download.finalUrl,sourceCaption:'Known fixture photo',productionAdmission:false,publicReleaseApproved:false,
    file:subject,stagedReceipt:downloadFile};
  fs.writeFileSync(reviewFile,JSON.stringify(sourceReview));
  const nativeUnit={...units[1],sourceImage:{review:{path:reviewFile,sha256:hash(fs.readFileSync(reviewFile))},sourceRect:{x:0,y:0,width:.8,height:.8}}};
  const direct=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[nativeUnit]});
  assert.equal(direct.assignments[0].deliveryMode,'EXISTING_SOURCE_IMAGE');assert.equal(direct.plan.assetTasks[0].tasks[0].module,'media-files');
  assert.equal(direct.assignments[0].sourceFit,'contain','new native photo requests preserve the whole source by default');
  const oldNativeDesign=structuredClone(plan);
  oldNativeDesign.shots[1].referenceProductionDesign.layers.push({id:'old-native-full-frame',role:'EVIDENCE',identity:'REAL'});
  oldNativeDesign.shots[1].referenceProductionDesign.states[0].visibleLayerIds.push('old-native-full-frame');
  assert.equal(compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:oldNativeDesign,units:[nativeUnit]}).assignments[0].deliveryMode,'EXISTING_SOURCE_IMAGE','a byte-reviewed whole source photo needs no generated overlay placeholder');
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:oldNativeDesign,units:[units[1]]}),/NATIVE_CORE_OVERLAY_REQUIRED/,'generated frames still preserve required native cores');
  assert.equal(compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...nativeUnit,sourceImage:{...nativeUnit.sourceImage,fit:'cover'}}]}).assignments[0].sourceFit,'cover');
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...nativeUnit,sourceImage:{...nativeUnit.sourceImage,fit:'unknown'}}]}),/SOURCE_REVIEW_REQUIRED/);
  assert.equal(direct.plan.assetTasks[0].tasks[0].parameters.files[0].materialClass,'VERIFIED_SOURCE_IMAGE');
  fs.writeFileSync(downloadFile,JSON.stringify({...download,sha256:'0'.repeat(64)}));
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[nativeUnit]}),/SOURCE_DOWNLOAD_MISMATCH/);
  fs.writeFileSync(downloadFile,JSON.stringify(download));
  const result={artifactManifest:{...cache.result.artifactManifest,nodeId:'type:layer-compositor',inputSha256:source}};
  const node={id:'type:layer-compositor',inputSha256:source,state:'succeeded',result,
    acceptance:{contract:'A1NodeArtifactAcceptance/v1',artifactRoot:taskRoot,productionAdmission:false,
      nodeId:'type:layer-compositor',inputSha256:source,manifestSha256:nodeInputHash({nodeId:'type:layer-compositor',inputSha256:source,artifacts:result.artifactManifest.artifacts,productionAdmission:false}),sourceResultSha256:nodeInputHash(result),
      artifacts:result.artifactManifest.artifacts}};
  function sampledReceipt(value){fs.writeFileSync(cacheReceipt,JSON.stringify(value));return {...cachedUnit,
    existingFrame:{...cachedUnit.existingFrame,receipt:{path:cacheReceipt,sha256:hash(fs.readFileSync(cacheReceipt))}}};}
  const sampled=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[sampledReceipt({samples:[{node}]})]});
  const archived=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[sampledReceipt({nodes:[node]})]});
  assert.equal(archived.assignments[0].deliveryMode,'EXISTING_LOCAL_COMPOSITE','original archived accepted nodes reuse unchanged bytes');
  assert.equal(sampled.plan.assetTasks[0].tasks[0].module,'media-files','accepted original batch receipt reuses bytes without generation');
  const movedImage=file('local-accepted-copy');fs.copyFileSync(subject.path,movedImage.path);movedImage.sha256=subject.sha256;
  const copiedUnit=sampledReceipt({samples:[{node}]});copiedUnit.existingFrame.image=movedImage;
  assert.equal(compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[copiedUnit]}).assignments[0].expectedImageSha256,subject.sha256,'accepted byte identity survives a local archival copy');
  const normalBatch={contract:'A1StaticProductionBatchResult/v1',productionAdmission:false,outputs:[{nodeId:node.id,inputSha256:node.inputSha256,acceptance:node.acceptance}]};
  assert.equal(compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[sampledReceipt(normalBatch)]}).assignments[0].deliveryMode,'EXISTING_LOCAL_COMPOSITE');
  const changedBatch=structuredClone(normalBatch);changedBatch.outputs[0].acceptance.artifacts[0].sha256='0'.repeat(64);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[sampledReceipt(changedBatch)]}),/CACHE_RECEIPT_MISMATCH/);
  const stale=structuredClone(node);stale.acceptance.sourceResultSha256='0'.repeat(64);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[sampledReceipt({samples:[{node:stale}]})]}),/CACHE_RECEIPT_MISMATCH/);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[sampledReceipt({nodes:[stale]})]}),/CACHE_RECEIPT_MISMATCH/);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[sampledReceipt({samples:[{node},{node}]})]}),/CACHE_RECEIPT_MISMATCH/);
  fs.writeFileSync(cacheReceipt,JSON.stringify(cache));
  const badCache=structuredClone(cachedUnit);badCache.existingFrame.image=ref;
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[badCache]}),/CACHE_RECEIPT_MISMATCH/);
  const integrated=shot('integrated',['完整标题']);
  integrated.fullFrameComposition={contract:'A1FullFrameComposition/v1'};
  integrated.referenceProductionDesign.layers=[{id:'complete-hold',role:'SUBJECT',sourceMode:'EXISTING',assetIds:['illustration'],copyIndices:[0],treatment:'NONE',purpose:'Complete original frame'}];
  integrated.referenceProductionDesign.states[0].visibleLayerIds=['complete-hold'];
  integrated.referenceProductionDesign.acceptance=[{layerId:'complete-hold',check:'Complete readable frame'}];
  integrated.productionLayout={contract:'A1ProductionStateLayouts/v1',mode:'STATIC',canvas:{width:1920,height:1080},states:[{state:'HOLD',referencePath:ref.path,copyIndices:[0],layers:[{id:'complete-hold',kind:'ASSET',assetId:'illustration',role:'BACKGROUND',fit:'fill',box:{x:0,y:0,width:1,height:1},z:0}]}]};
  const layout=compileProductionStateLayoutsV1({shot:integrated,resources:integrated.productionResources,stateImplementations:{'media-files':'b'.repeat(64),'layer-compositor':'c'.repeat(64)}});
  assert.deepEqual(layout.blockers,[]);assert.equal(layout.compiled,true);
  assert.deepEqual(layout.shot.tasks.map(t=>t.module),['media-files','layer-compositor']);
  assert.equal(layout.shot.packagingDecision.copyStatus,'LOCKED');
  assert.equal(layout.shot.packagingDecision.copyBindings[0].text,'完整标题');
  const graphPlan={...plan,projectId:'unseen-full-frame-fixture',shots:[layout.shot]};delete graphPlan.activeWorkScope;
  const workspace=compileShotTaskWorkspaceV1(graphPlan,{verifiedDesignReferenceShas:[ref.sha256]});
  assert.equal(Object.hasOwn(workspace.production.shotIntelligence.currentStoryboardAuthority.shots[0].nodeWorkflow.modules,'editable-typography'),false,'integrated generated copy must not revive a standalone typography job');
  const migrated=structuredClone(graphPlan);
  migrated.shots[0].fullFrameInputHistory=[{tasks:[{module:'image-generation',parameters:{},dependencies:[]}]}];
  migrated.shots.push({id:'downstream',sourceText:'Unapproved downstream fixture',visualJob:'Fixture',exactCopy:[],tasks:[{module:'remotion-render',parameters:{},dependencies:[],crossShotDependencies:[{nodeId:'integrated:image-generation',artifactKinds:['IMAGE']}]}]});
  const preserved=compileShotTaskWorkspaceV1(migrated,{verifiedDesignReferenceShas:[ref.sha256]});
  const dependent=preserved.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==='downstream').nodeWorkflow;
  assert.equal(dependent.modules['remotion-render'],'unknown');
  assert.equal(dependent.moduleInputs['remotion-render'].routingBlocker,'RETIRED_PRODUCER_REBIND_REQUIRED');
  assert.equal(dependent.moduleInputs['remotion-render'].retiredProducerDependencies[0].nodeId,'integrated:image-generation');
  assert.deepEqual(dependent.moduleNodeDependencies['remotion-render'],[]);
  assert.equal(Object.hasOwn(preserved.production.shotIntelligence.currentStoryboardAuthority.shots[0].nodeWorkflow.modules,'image-generation'),false,'the old generator never revives');
  const repeated=compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:compiled.plan,units});assert.equal(repeated.plan.assetTasks.length,3);assert.deepEqual(repeated.assignments,compiled.assignments);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...units[0],protectedCores:[]}]}),/NATIVE_CORE_OVERLAY_REQUIRED/);
  const wrong=structuredClone(plan);wrong.shots[0].productionResources.assets[1].materialClass='ORIGINAL_GENERATED_ASSET';
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:wrong,units:[units[0]]}),/NATIVE_CORE_INVALID/);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...units[1],assetIds:['missing']}]}),/ASSET_SELECTION_INVALID/);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[units[1],units[1]]}),/DUPLICATE_STATE/);
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[{...units[1],state:'ENTRY'}]}),/BOUND_REFERENCE_REQUIRED/);
  const narrow=structuredClone(plan);narrow.activeWorkScope.shotIds=['type'];
  assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan:narrow,units:[units[0]]}),/OUTSIDE_ACTIVE_WORK_SCOPE/);
  fs.appendFileSync(subject.path,'drift');assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot,plan,units:[units[1]]}),/INPUT_BYTES_CHANGED/);
  console.log('PASS three unseen fixture genres compile one complete-image job each; exact copy and refs bound; native evidence cannot be generated; duplicate preparation reuses jobs; scope and drift fail. Zero providers.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
