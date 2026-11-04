import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {workScopeSourceIdentityV1} from '../apps/studio-next/src/lib/a1-production-work-scope-v1.mjs';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {prepareAcceptedStateCompositionV1} from '../apps/studio-next/src/lib/a1-production-complete-composition-v1.mjs';
import sharp from '../apps/studio-next/node_modules/sharp/lib/index.js';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'accepted-composition-'))),task=path.join(root,'work','fixture');fs.mkdirSync(task,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),bytes=Buffer.from('accepted-source-fixture'),file=path.join(task,'core.png');fs.writeFileSync(file,bytes);
const asset={assetId:'paper',path:file,sha256:hash(bytes),kind:'IMAGE',role:'packaging-texture',materialClass:'CODE_NATIVE_ASSET',referenceOnly:false};
const shot={id:'card',sourceText:'locked',sourceVersionSha256:'b'.repeat(64),exactCopy:['locked'],productionResources:{assets:[asset],fonts:[]},
 productionLayout:{states:[{state:'HOLD',copyIndices:[0],layers:[{id:'core',kind:'ASSET',assetId:'paper',z:0,box:{x:0,y:0,width:1,height:1}}]}]},
 referenceProductionDesign:{layers:[{id:'core',copyIndices:[0]}],acceptance:[{layerId:'core',check:'Preserve source pixels'}],references:[{state:'HOLD',sourceFrame:4,sha256:'a'.repeat(64)}],states:[{state:'HOLD',visibleCopyIndices:[0],visibleLayerIds:['core']}]}};
const plan={projectId:'fixture',scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:'b'.repeat(64)},shots:[shot]};
plan.editorialBrief={contract:'A1ProductionEditorialBrief/v1',contentMode:'FACTUAL_ADAPTATION',presentationMode:'FACELESS',objective:'Complete frame',authorizationEvidence:'User authorized',sourceIdentity:workScopeSourceIdentityV1(plan),copyApproval:false,visualApproval:false,productionAdmission:false};
const artifact={path:'core.png',kind:'IMAGE',role:'hold',sha256:asset.sha256};
const node={id:'card:layer-compositor',shotId:'card',module:'layer-compositor',state:'succeeded',inputSha256:'d'.repeat(64),acceptance:{inputSha256:'d'.repeat(64),artifactRoot:task,artifacts:[artifact]},result:{staticStates:{samples:[{state:'HOLD',referenceSha256:'a'.repeat(64),artifacts:[artifact]}]}}};
const input={contract:'A1AcceptedStateCompleteComposition/v1',taskId:'fixture',shotId:'card',baseShotSha256:nodeInputHash(shot),nodeInputSha256:node.inputSha256,
 states:[{state:'HOLD',currentImageSha256:asset.sha256,goalInputSha256:productionFrameGoalShaV1(plan,shot,'HOLD'),backgroundSource:{shotId:'card',assetId:'paper',sha256:asset.sha256},layerBoxes:[]}],visualApproval:false,productionAdmission:false};
function prepare(value=input,p=plan){const b=Buffer.from(JSON.stringify(value)),name=path.join(task,'input-'+hash(b)+'.json');if(!fs.existsSync(name))fs.writeFileSync(name,b);return prepareAcceptedStateCompositionV1({repoRoot:root,taskRoot:task,plan:p,workflow:{nodes:[node]},unit:{shotId:'card',copyMode:'SOURCE_BOUND_COMPLETE_COMPOSITION',compositionInput:{path:name,sha256:hash(b)}}});}
try{
 const result=prepare();assert.deepEqual(result.plan.shots[0].exactCopy,shot.exactCopy);assert.equal(shot.productionLayout.states[0].layers.length,1);
 assert.equal(result.plan.shots[0].productionLayout.states[0].layers.length,2);assert.equal(result.assignments[0].visualApproval,false);
 for(const mutate of [i=>i.nodeInputSha256='f'.repeat(64),i=>i.states[0].currentImageSha256='f'.repeat(64),i=>i.states[0].goalInputSha256='f'.repeat(64),
   i=>i.states[0].backgroundSource.sha256='f'.repeat(64),i=>i.states[0].backgroundSource.sourceRect={x:-.1,y:0,width:1,height:1},i=>i.states[0].layerBoxes=[{layerId:'unknown',box:{x:0,y:0,width:1,height:1}}],i=>i.productionAdmission=true]){
  const bad=structuredClone(input);mutate(bad);assert.throws(()=>prepare(bad),/COMPLETE_COMPOSITION/);
 }
 const colorBytes=await sharp({create:{width:1,height:1,channels:3,background:'#112233'}}).png({palette:false}).toBuffer(),colorFile=path.join(task,'surface.png');fs.writeFileSync(colorFile,colorBytes);
 const colored=structuredClone(input);colored.states[0].baseSurfaceSource={color:'#112233',file:{path:colorFile,sha256:hash(colorBytes)}};
 assert.equal(prepare(colored).plan.shots[0].productionLayout.states[0].layers.length,3);colored.states[0].baseSurfaceSource.color='#112234';assert.throws(()=>prepare(colored),/NATIVE_SURFACE_COLOR/);
 const staged=path.join(task,'download.json'),reviewFile=path.join(task,'review.json');
 fs.writeFileSync(staged,JSON.stringify({contract:'A1UnreviewedMaterialDownload/v1',sha256:asset.sha256,finalUrl:'https://example.org/portrait.png'}));
 const review={contract:'A1SourceMaterialUseReview/v1',actorType:'AGENT',reviewerId:'fixture-reviewer',identityVerified:true,sourcePageUrl:'https://example.org/profile',assetUrl:'https://example.org/portrait.png',sourceCaption:'Source portrait',file:{path:file,sha256:asset.sha256},stagedReceipt:staged,publicReleaseApproved:false,productionAdmission:false};
 fs.writeFileSync(reviewFile,JSON.stringify(review));const portrait=structuredClone(input);
 portrait.states[0].backgroundSource={sha256:asset.sha256,reviewedMaterial:{assetId:'native-portrait',materialClass:'VERIFIED_PERSON_PHOTO',box:{x:0,y:0,width:1,height:1},review:{path:reviewFile,sha256:hash(fs.readFileSync(reviewFile))}}};
 const imported=prepare(portrait);assert.equal(imported.plan.shots[0].productionResources.assets.find(a=>a.assetId==='native-portrait').materialClass,'VERIFIED_PERSON_PHOTO');
 assert.equal(imported.plan.shots[0].productionLayout.states[0].layers[0].role,'EVIDENCE');
 review.identityVerified=false;fs.writeFileSync(reviewFile,JSON.stringify(review));portrait.states[0].backgroundSource.reviewedMaterial.review.sha256=hash(fs.readFileSync(reviewFile));assert.throws(()=>prepare(portrait),/MATERIAL_REVIEW_REQUIRED/);
 fs.writeFileSync(file,'changed');assert.throws(()=>prepare(),/FILE_CHANGED/);
 console.log('PASS accepted-state composition preserves original copy/layers and approval boundary; stale source, node, goals, background bytes, foreign geometry and approval claims reject.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
