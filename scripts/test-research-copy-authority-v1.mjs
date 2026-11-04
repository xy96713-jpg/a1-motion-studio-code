import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {verifyResearchCopyAuthoritiesV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {compileShotPackagingDecisionV1} from '../apps/studio-next/src/lib/a1-shot-packaging-decision-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-research-copy-test-')));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const copy='研究员，2024年7月起';
const source={verified_at:'2026-09-30',assets:[{source_page:'https://example.org/person',verified_bio:['Full-time researcher since July 2024']}]};
const sourceBytes=Buffer.from(JSON.stringify(source));
const fact={pointer:'/assets/0/verified_bio/0',sourceFactSha256:nodeInputHash(source.assets[0].verified_bio[0])};
const receipt={contract:'A1ResearchSourceFactRewriteAuthority/v1',scope:'RESEARCH_ONLY',productionAdmission:false,status:'VERIFIED_FACT_REWRITE',
  source:{path:'source.json',sha256:hash(sourceBytes),uri:source.assets[0].source_page,uriPointer:'/assets/0/source_page',verifiedAt:source.verified_at,verifiedAtPointer:'/verified_at'},
  rewrites:[{displayCopy:copy,displayCopySha256:hash(Buffer.from(copy)),declaredTransform:'ZH_EDITORIAL_REWRITE',reviewedBy:'fixture-source-editor',factReferences:[fact]}]};
fs.writeFileSync(path.join(root,'source.json'),sourceBytes);
const writeReceipt=value=>{const bytes=Buffer.from(JSON.stringify(value));fs.writeFileSync(path.join(root,'receipt.json'),bytes);return {path:'receipt.json',sha256:hash(bytes)};};
const declaration=writeReceipt(receipt);
const plan={scope:'RESEARCH_ONLY',productionAdmission:false,researchCopyAuthorityReceipts:[declaration]};
const verify=p=>verifyResearchCopyAuthoritiesV1({taskRoot:root,plan:p});
let checks=0;
try{
  const facts=verify(plan);assert.equal(facts.length,1);checks++;
  const filmDeclarations=Array.from({length:69},(_,i)=>{
    const r=structuredClone(receipt);r.rewrites[0].displayCopy='已核资料 '+i;r.rewrites[0].displayCopySha256=hash(Buffer.from(r.rewrites[0].displayCopy));
    const bytes=Buffer.from(JSON.stringify(r)),name='film-receipt-'+i+'.json';fs.writeFileSync(path.join(root,name),bytes);
    return {path:name,sha256:hash(bytes)};
  });
  const fullFilm={...plan,shots:Array.from({length:69},(_,i)=>({id:'unseen-'+i})),researchCopyAuthorityReceipts:filmDeclarations};
  assert.equal(verify(fullFilm).length,69,'a complete film must not stop at the historical 32-receipt limit');checks++;
  assert.throws(()=>verify({...fullFilm,researchCopyAuthorityReceipts:Array.from({length:553},()=>declaration)}),/scope-invalid/);checks++;
  assert.throws(()=>verify({...plan,researchCopyAuthorityReceipts:filmDeclarations}),/scope-invalid/);checks++;
  assert.deepEqual(verify({...plan,researchCopyAuthorityReceipts:undefined}),[]);checks++;
  for(const bad of [{...plan,scope:'PRODUCTION'},{...plan,productionAdmission:true},{...plan,researchCopyAuthorityReceipts:[declaration,declaration]}]){
    assert.throws(()=>verify(bad));checks++;
  }
  fs.writeFileSync(path.join(root,'source.json'),JSON.stringify({...source,verified_at:'2026-10-01'}));
  assert.throws(()=>verify(plan),/sha-mismatch/);checks++;
  fs.writeFileSync(path.join(root,'source.json'),sourceBytes);
  assert.throws(()=>verify({...plan,researchCopyAuthorityReceipts:[{path:'../outside.json',sha256:declaration.sha256}]}));checks++;
  fs.symlinkSync(path.join(root,'source.json'),path.join(root,'linked.json'));
  const badSource={...receipt,source:{...receipt.source,path:'linked.json'}};
  assert.throws(()=>verify({...plan,researchCopyAuthorityReceipts:[writeReceipt(badSource)]}),/path-invalid/);checks++;
  for(const change of [
    r=>r.rewrites[0].displayCopy='未审核的新句子',
    r=>r.rewrites[0].factReferences[0].pointer='/assets/0/missing',
    r=>r.rewrites[0].factReferences[0].sourceFactSha256='0'.repeat(64),
    r=>r.source.uri='https://another.example.org',
    r=>r.source.verifiedAt='2025-01-01',
    r=>r.rewrites[0].factReferences=[],
  ]){
    const bad=structuredClone(receipt);change(bad);assert.throws(()=>verify({...plan,researchCopyAuthorityReceipts:[writeReceipt(bad)]}));checks++;
  }
  writeReceipt(receipt);
  const version='a'.repeat(64);
  const binding={copyIndex:0,text:copy,status:'LOCKED',sourceKind:'VERIFIED_SOURCE_FACT_REWRITE',authorityReceiptSha256:declaration.sha256,
    sourceFileSha256:receipt.source.sha256,sourceUri:receipt.source.uri,verifiedAt:receipt.source.verifiedAt,declaredTransform:'ZH_EDITORIAL_REWRITE',
    displayCopySha256:receipt.rewrites[0].displayCopySha256,factReferences:[fact],referenceContext:{sourceVideoSha256:version,frameNumber:25}};
  const decision={contract:'A1ShotPackagingDecision/v1',version:1,shotId:'research-copy',shotVersionSha256:version,narrativeRole:'DECORATIVE_PACKAGE',
    packagingForm:'TYPE_COMPOSITION',viewerTask:'Read a verified rewritten fact',selectionReason:'Fact and display language are explicitly bound',
    rejectedAlternative:'Invented source-frame quotation',copyStatus:'LOCKED',copyBindings:[binding],sourceBindings:[],
    composition:{focalTarget:'fact',hierarchy:'text',readingOrder:['fact']},layers:[{id:'fact',role:'text',z:0,geometry:{x:0,y:0,width:1,height:1}}],
    effectStack:[],motionBeats:[],layoutReview:'Private fixture only',handoff:{exitCondition:'hold',nextShotRelation:'cut'}};
  const compile=(b=binding,scope='RESEARCH_ONLY',verified=facts)=>compileShotPackagingDecisionV1({decision:{...decision,copyBindings:[b]},shotId:'research-copy',shotVersionSha256:version,
    exactCopy:[copy],copyAuthorityScope:scope,verifiedSourceFacts:verified});
  assert.equal(compile().status,'READY_FOR_REVIEW');checks++;
  for(const args of [[binding,null,facts],[binding,'PRODUCTION',facts],[binding,'RESEARCH_ONLY',[]]]){
    assert.ok(compile(...args).blockers.includes('PACKAGING_FACT_REWRITE_AUTHORITY_INVALID'));checks++;
  }
  for(const bad of [{...binding,displayCopySha256:'0'.repeat(64)},{...binding,factReferences:undefined},
    {...binding,sourceVideoSha256:version,frameNumber:25},{...binding,referenceContext:{sourceVideoSha256:'b'.repeat(64),frameNumber:25}},
    {...binding,authorityReceiptSha256:'0'.repeat(64)},{...binding,declaredTransform:'EXACT_SOURCE_QUOTE'}]){
    assert.equal(compile(bad).status,'BLOCKED');checks++;
  }
  const legacy={copyIndex:0,text:copy,status:'LOCKED',sourceVideoSha256:version,frameNumber:25};
  assert.equal(compile(legacy,null,[]).status,'READY_FOR_REVIEW');checks++;
  assert.equal(compile({...legacy,sourceVideoSha256:'b'.repeat(64)},null,[]).status,'BLOCKED');checks++;
  assert.equal(compile({...legacy,sourceKind:'UNKNOWN'},null,[]).status,'BLOCKED');checks++;
  const graphPlan={...plan,contract:'A1ShotTaskPlan/v1',projectId:'research-copy',source:{videoSha256:version},shots:[{id:'research-copy',sourceText:'fact',visualJob:'identity',exactCopy:[copy],packagingDecision:decision,tasks:[{module:'layer-compositor',dependencies:[],parameters:{}}]}]};
  const compiled=compileShotTaskWorkspaceV1(graphPlan,{verifiedSourceFacts:facts});
  assert.equal(compiled.production.shotIntelligence.currentStoryboardAuthority.shots[0].packagingDecision.status,'READY_FOR_REVIEW');checks++;
  assert.equal(compileShotTaskWorkspaceV1(graphPlan).production.shotIntelligence.currentStoryboardAuthority.shots[0].packagingDecision.status,'BLOCKED');checks++;
  console.log(JSON.stringify({status:'PASS',checks,networkCalls:0,productionWrites:0}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
