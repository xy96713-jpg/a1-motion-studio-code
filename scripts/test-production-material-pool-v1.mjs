import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {projectProductionMaterialPoolV1,selectProductionMaterialReferencesV1,readProductionMaterialSourceUseV1} from '../apps/studio-next/src/lib/a1-production-material-pool-v1.mjs';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-pool-test-')));
try {
  const dir=path.join(root,'work','fixture');fs.mkdirSync(dir,{recursive:true});
  const asset=(id,text,extra={})=>{const file=path.join(dir,id+'.png');fs.writeFileSync(file,text);return {assetId:id,path:file,
    sha256:createHash('sha256').update(text).digest('hex'),kind:'IMAGE',referenceOnly:false,materialClass:'ORIGINAL_GENERATED_ASSET',...extra};};
  const portrait=asset('portrait','portrait',{materialClass:'VERIFIED_PERSON_PHOTO',provenance:{status:'VERIFIED',sourceUrl:'https://example.org/person'}});
  const background=asset('office','office'),irrelevant=asset('unrelated','unrelated'),reference=asset('reference','comparison-only',{referenceOnly:true});
  const plan={projectId:'fixture',shots:[{id:'earlier',tasks:[],productionResources:{assets:[portrait,background]}},{id:'later',tasks:[],productionResources:{assets:[{...portrait,assetId:'portrait-alias'},irrelevant,reference]}}]};
  const pool=projectProductionMaterialPoolV1({plan});
  assert.equal(pool.materials.length,4);assert.equal(pool.materials.find(m=>m.sha256===portrait.sha256).bindings.length,2);
  const selected=selectProductionMaterialReferencesV1({repoRoot:root,pool,selections:[
    {materialId:'material-'+portrait.sha256.slice(0,24),sha256:portrait.sha256,use:'SUBJECT',reason:'Use the verified portrait to anchor the supplied person'},
    {materialId:'material-'+background.sha256.slice(0,24),sha256:background.sha256,use:'BACKGROUND',reason:'Use the office backdrop; do not copy its unrelated details'}]});
  assert.equal(selected.references.length,2);assert.equal(selected.assets[0].materialClass,'VERIFIED_PERSON_PHOTO');
  assert.equal(selected.references[0].use,'SUBJECT');assert.equal(selected.assets[0].sha256,portrait.sha256);
  assert.ok(!selected.assets.some(a=>a.sha256===irrelevant.sha256),'unrelated material must not be attached just because it exists');
  const reviewFile=path.join(dir,'review.json');fs.writeFileSync(reviewFile,JSON.stringify({contract:'A1SourceMaterialUseReview/v1',actorType:'AGENT',reviewerId:'fixture',identityVerified:true,
    productionAdmission:false,file:{path:portrait.path,sha256:portrait.sha256},sourcePageUrl:'https://example.org/person',sourceCaption:'Known fixture source'}));
  const binding={path:path.relative(root,reviewFile),sha256:createHash('sha256').update(fs.readFileSync(reviewFile)).digest('hex')};
  const legacy=structuredClone(plan);legacy.shots[0].productionResources.assets[0].provenance.reviewSha256=binding.sha256;
  legacy.shots[0].fullFrameRequests=[{deliveryMode:'EXISTING_SOURCE_IMAGE',expectedImageSha256:portrait.sha256,sourceReview:binding}];
  const recovered=projectProductionMaterialPoolV1({plan:legacy}).materials.find(m=>m.sha256===portrait.sha256);
  assert.equal(readProductionMaterialSourceUseV1({repoRoot:root,material:recovered}).status,'EXISTING_SOURCE_USE_REVIEW_BYTES_VERIFIED');
  assert.equal(legacy.shots[0].productionResources.assets[0].provenance.review,undefined,'projection preserves old plan bytes');
  legacy.shots[0].fullFrameRequests[0].expectedImageSha256='0'.repeat(64);
  assert.equal(readProductionMaterialSourceUseV1({repoRoot:root,material:projectProductionMaterialPoolV1({plan:legacy}).materials.find(m=>m.sha256===portrait.sha256)}),null,'a different image cannot borrow this review');
  fs.appendFileSync(reviewFile,'changed');
  assert.throws(()=>readProductionMaterialSourceUseV1({repoRoot:root,material:recovered}),/REVIEW_CHANGED/);
  assert.throws(()=>selectProductionMaterialReferencesV1({repoRoot:root,pool,selections:[{materialId:'material-'+reference.sha256.slice(0,24),sha256:reference.sha256,use:'SUBJECT',reason:'Invalid reuse'}]}),/REFERENCE_ONLY/);
  assert.throws(()=>selectProductionMaterialReferencesV1({repoRoot:root,pool,selections:[{materialId:'material-'+portrait.sha256.slice(0,24),sha256:background.sha256,use:'SUBJECT',reason:'wrong bytes'}]}),/SELECTION_BINDING/);
  assert.throws(()=>selectProductionMaterialReferencesV1({repoRoot:root,pool,selections:[{materialId:'material-'+portrait.sha256.slice(0,24),sha256:portrait.sha256,use:'EVIDENCE',reason:'not a preserved core'}]}),/EVIDENCE_PRESERVATION/);
  fs.appendFileSync(portrait.path,'changed');
  assert.throws(()=>selectProductionMaterialReferencesV1({repoRoot:root,pool,selections:[{materialId:'material-'+portrait.sha256.slice(0,24),sha256:portrait.sha256,use:'SUBJECT',reason:'changed bytes'}]}),/BYTES_CHANGED/);
  console.log('PASS project-wide content dedup, explicit visual roles, cross-shot portrait reuse, no unrelated attachments, reference/evidence protection and byte drift. Zero providers.');
} finally {fs.rmSync(root,{recursive:true,force:true});}
