import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {verifyAcceptedTypographyRegionReuseV1} from '../apps/studio-next/src/lib/a1-production-accepted-typography-region-v1.mjs';
import {compileFullFrameRequestsV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'accepted-text-region-'))),task=path.join(root,'work','fixture');fs.mkdirSync(task,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),save=(name,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),file=path.join(task,name);fs.writeFileSync(file,bytes);return {path:file,sha256:hash(bytes),bytes:bytes.length};};
try{
 const ref=save('reference.png',Buffer.from('reference')),image=save('image.png',Buffer.from('composite')),typeImage=save('type.png',Buffer.from('glyphs')),source='a'.repeat(64),texts=['Retained visible table','Narration subtitle'];
 const locks=texts.map((text,i)=>({copyIndex:i,text,status:'LOCKED',sourceKind:'SOURCE_FRAME_EXACT',sourceVideoSha256:source,frameNumber:4,referenceFrameSha256:ref.sha256}));
 const params={canvas:{width:100,height:100},runs:texts.map(text=>({text})),exactCopy:texts.join(''),copyLock:{status:'LOCKED',sha256:hash(texts.join(''))}};
 const layout={contract:'A1NodeEditableTypographyPlan/v1',nodeId:'unseen:editable-typography',inputSha256:'b'.repeat(64),parameters:params,pngSha256:typeImage.sha256,
   glyphManifests:texts.map((exactCopy,i)=>({exactCopy,exactCopySha256:hash(exactCopy),run:{visibleGlyphCount:2,canvasInkBounds:{minX:10,minY:i?90:10,maxX:60,maxY:i?98:65}}}))};
 const typePlan=save('layout.json',layout),artifact=(f,role,kind)=>({path:path.basename(f.path),sha256:f.sha256,bytes:f.bytes,role,kind});
 const node=(id,module,inputSha256,parameters,artifacts)=>{const result={artifactManifest:{artifacts,productionAdmission:false}},a={contract:'A1NodeArtifactAcceptance/v1',nodeId:id,inputSha256,artifacts,artifactRoot:task,sourceResultSha256:nodeInputHash(result),productionAdmission:false};a.manifestSha256=nodeInputHash({nodeId:id,inputSha256,artifacts,productionAdmission:false});return {id,shotId:'unseen',module,state:'succeeded',inputSha256,input:{parameters,shot:{packagingDecision:{copyBindings:locks}}},result,acceptance:a};};
 const type=node(layout.nodeId,'editable-typography',layout.inputSha256,params,[artifact(typePlan,'typography-layout','JSON_PLAN'),artifact(typeImage,'typography-overlay','IMAGE')]);
 const composition={contract:'A1NodeCompositePlan/v1',nodeId:'unseen:layer-compositor',inputSha256:'c'.repeat(64),preview:{sha256:image.sha256,width:100,height:100},composition:{width:100,height:100,layers:[{id:'glyphs',dependencyNodeId:type.id,dependencyManifestSha256:type.acceptance.manifestSha256,artifactRole:'typography-overlay',artifact:{sha256:typeImage.sha256},geometry:{x:0,y:0,width:1,height:1},pixelGeometry:{x:0,y:0,width:100,height:100},sourceRect:null,opacity:1,fit:'fill',z:1}]}};
 const compPlan=save('composition.json',composition),comp=node(composition.nodeId,'layer-compositor',composition.inputSha256,{},[artifact(compPlan,'layer-composition-plan','JSON_PLAN'),artifact(image,'transparent-layer-preview','IMAGE')]);
 const receipt=save('receipt.json',{productionAdmission:false,ownedProcessesClosed:true,workflow:{nodes:[type,comp]},samples:[{node:comp}]});
 const evidence={contract:'A1AcceptedTypographyRegionReuse/v1',typographyNodeId:type.id,typographyLayout:typePlan,compositionPlan:compPlan,retainedRunIndices:[0],excludedRuns:[{runIndex:1,text:texts[1],reason:'ORDINARY_NARRATION_SUBTITLE'}],sourceFrame:4,referenceSha256:ref.sha256,sourceVideoSha256:source};
 const regions=[{sourceRect:{x:0,y:0,width:1,height:.8},box:{x:0,y:0,width:1,height:.8},fit:'fill',z:0}],cached={receipt,image,regions,copyRegionEvidence:evidence};
 const reference={state:'ENTRY',sourceFrame:4,path:ref.path,sha256:ref.sha256},shot={id:'unseen',exactCopy:[texts[0]],packagingDecision:{copyBindings:[locks[0]]}};
 const args={repoRoot:root,cached,shot,reference,sourceVideoSha256:source,exactCopy:[texts[0]]},before=JSON.stringify(args),proof=verifyAcceptedTypographyRegionReuseV1(args);
 assert.equal(JSON.stringify(args),before);assert.equal(proof.sourcePixelsUnchanged,true);assert.equal(proof.sourceFactVerification,'UNVERIFIED');
 for(const mutate of [a=>a.exactCopy=['Different text'],a=>a.cached.copyRegionEvidence.referenceSha256='f'.repeat(64),a=>a.cached.copyRegionEvidence.retainedRunIndices=[1],a=>a.cached.copyRegionEvidence.excludedRuns[0].reason='HIDE_BAD_DATA',
   a=>{a.cached.regions[0].sourceRect.height=.65;a.cached.regions[0].box.height=.65;},a=>{a.cached.regions[0].sourceRect.height=.95;a.cached.regions[0].box.height=.95;},a=>a.cached.regions[0].box.height=.9,a=>a.shot.packagingDecision.copyBindings[0].sourceKind='VERIFIED_SOURCE_FACT_REWRITE']){
   const bad=structuredClone(args);mutate(bad);assert.throws(()=>verifyAcceptedTypographyRegionReuseV1(bad),/ACCEPTED_TYPE_REGION/);
 }
 const plan={contract:'A1ShotTaskPlan/v1',projectId:'fixture',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:source},visualQualityPolicy:{contract:'A1StaticVisualQualityPolicy/v1',mode:'WHOLE_FRAME_APPROXIMATE',reviewUnit:'WHOLE_FRAME'},shots:[{...shot,sourceText:'Source frame study',visualJob:'Preserve original text pixels',sourceVersionSha256:source,sourceInterval:{startFrame:0,endFrameExclusive:10},tasks:[],referenceProductionDesign:{contract:'A1ReferenceProductionDesign/v1',shotId:'unseen',sourceVideoSha256:source,viewerIntent:'Read table',appearance:{composition:'Original',palette:'Original',surface:'Original'},references:[reference],states:[{state:'ENTRY',visibleCopyIndices:[0],visibleLayerIds:['whole-frame-reference']}],layers:[{id:'whole-frame-reference',role:'SUBJECT',sourceMode:'AUTO',assetIds:[],copyIndices:[0],treatment:'NONE',purpose:'Preserve original'}],acceptance:[],uncertainties:[]}}]};
 const unit={shotId:'unseen',state:'ENTRY',brief:'Retain the accepted table; exclude narration subtitle',transparentBackground:true,existingFrame:cached};
 const prepared=compileFullFrameRequestsV1({repoRoot:root,taskRoot:task,plan,units:[unit]});
 assert.equal(prepared.assignments[0].copyRegionBinding.evidenceSha256,proof.evidenceSha256);assert.equal(prepared.plan.assetTasks[0].tasks[0].module,'media-files');
 assert.equal(prepared.plan.assetTasks[0].tasks[0].parameters.files[0].provenance.copyRegionEvidenceSha256,proof.evidenceSha256);
 const noProof=structuredClone(unit);delete noProof.existingFrame.copyRegionEvidence;
 assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot:task,plan,units:[noProof]}),/FULL_FRAME_CACHE_REGIONS_INVALID/);
 assert.throws(()=>compileFullFrameRequestsV1({repoRoot:root,taskRoot:task,plan,units:[{...unit,transparentBackground:false}]}),/COPY_REGION_ALPHA_REQUIRED/);
 fs.appendFileSync(typeImage.path,'drift');assert.throws(()=>verifyAcceptedTypographyRegionReuseV1(args),/FILE_CHANGED/);
 console.log('PASS closed native producer -> identity crop -> normal full-frame media request; exact copy, glyph margins, excluded subtitle, reference, artifact bytes and alpha boundary enforced. Zero providers.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
