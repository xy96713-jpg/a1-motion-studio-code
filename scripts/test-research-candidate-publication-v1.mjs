import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {publishRegisteredResearchCandidatesV1} from '../apps/studio-next/src/lib/a1-research-candidate-publication-v1.mjs';
import {verifyResearchStaticCandidateV1} from '../apps/studio-next/src/lib/a1-research-static-candidate-verification-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {syncShotTaskRuntimeV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {MAX_RESEARCH_TASK_ARTIFACTS_V1,MAX_RESEARCH_PRODUCTION_PLAN_BYTES_V1} from '../apps/studio-next/src/lib/a1-system-line-research-task-manifest-v1.mjs';
const sharp=createRequire(new URL('../apps/studio-next/package.json',import.meta.url))('sharp');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'registry-publication-'))),fixtures=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(file,value)=>{fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');};
try {
for(const [index,genre] of ['typography','editorial-comparison','source-explainer'].entries()){
 const taskId='unseen-'+genre,dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
 const article=index===2,sourceSha='a'.repeat(64);
 const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,
 source:article?{kind:'ARTICLE',document:{sha256:sourceSha}}:{videoSha256:sourceSha,fps:25},
 shots:[{id:'scene',sourceText:'Source-backed fixture',visualJob:'Preserve this frame',exactCopy:[],tasks:[{module:'media-files',dependencies:[],parameters:{files:[]},blocker:'FIXTURE_ONLY'}]}]};
 save(path.join(dir,'shot-task-plan-v1.json'),plan);syncShotTaskRuntimeV1({repoRoot:root,taskId,expectedPlanSha256:nodeInputHash(plan)});
 const seedBody={contract:'A1SystemLineResearchTaskManifest/v1',taskId,scope:'RESEARCH_ONLY',productionAdmission:false,status:'RESEARCH_ONLY',
 input:article?{sourceKind:'ARTICLE',sourceArticleSha256:sourceSha,sourceVideoSha256:null}:{sourceVideoSha256:sourceSha,fps:25},
 sequences:[{sequenceId:'scene',sourceTimeSeconds:article?null:{start:0,end:2},designedCopy:[]}],
 artifacts:[],candidates:[{id:'preserved-video',sequenceIds:['scene'],status:'STALE_INPUT_SHA_REVIEW_ONLY',customLegacyField:{keep:true}}],
 summary:{sequenceCount:1,candidateCoverageCount:0,registeredRenderCount:0,visuallyAcceptedCount:0},
 nodeRuns:[{id:'old-execution',status:'WAITING'}],speechAudit:{status:'DRAFT'},authority:{formalProductionAdmission:false},customSourceExtension:{exact:'preserve'}};
 const seed={...seedBody,sha256:nodeInputHash(seedBody)},manifestFile=path.join(dir,'research-task-manifest-v1.json');save(manifestFile,seed);
 const picture=await sharp({create:{width:16,height:9,channels:4,background:'#112233'}}).png().toBuffer();
 const files={};for(const [name,bytes] of [['image.png',picture],['reference.png',picture],['review.json',Buffer.from('{"scope":"fixture only"}')],['input.json',Buffer.from('{"scope":"fixture only"}')]]){
 const file=path.join(dir,name);fs.writeFileSync(file,bytes);files[name]={path:path.relative(root,file),bytes:bytes.length,sha256:hash(bytes)};}
 const entry={id:'candidate-one',sequenceIds:['scene'],mediaClass:'STATIC_FRAME_SET',coverageScope:'RESEARCH_SUBFRAGMENT',
 status:'BATCH_STATIC_COMPARISON',currentLocalCandidate:true,selectionScope:'LATEST_REVIEWED_LOCAL_COMPARISON_UNAPPROVED',
 wholeShotPASS:false,visualApproval:false,productionAdmission:false,goalInputSha256:'b'.repeat(64),
 review:files['review.json'],inputs:[{name:'execution',...files['input.json']}],localReview:{status:'TECHNICAL_PASS_ONLY',label:'Fixture structural proof only'},existingAlternativesPreserved:[],blockers:['WHOLE_SHOT_NOT_COMPLETE'],
 staticSamples:[{id:'hold',image:{...files['image.png'],mimeType:'image/png'},reference:{...files['reference.png'],mimeType:'image/png'},localFrame:null,sourceFrame:article?null:20,
 ...(article?{designAnchorIndex:1,referenceKind:'DESIGN_REFERENCE'}:{}),referenceClock:{status:'UNKNOWN',seconds:null,proof:null},visualApproval:false}]};
 const registry={contract:'A1ReferenceCandidateRegistry/v1',scope:'RESEARCH_ONLY',productionAdmission:false,entries:[entry]},registryFile=path.join(dir,'candidate-registry-v1.json');save(registryFile,registry);
 if(article){seed.artifacts=[{id:'existing-article-reference-id',...files['reference.png']}];const {sha256,...body}=seed;seed.sha256=nodeInputHash(body);save(manifestFile,seed);}
 const dry=await publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[entry.id],dryRun:true});assert.equal(dry.written,false);assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile)),seed);
 const published=await publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[entry.id]});assert.equal(published.written,true);assert.equal(published.fullTaskRebuild,false);
 const now=published.manifest;assert.equal(now.candidates.length,2);assert.deepEqual(now.candidates[0],seed.candidates[0]);
 assert.deepEqual(now.candidates[1].inputBinding.map(b=>({expected:b.expectedSha256,actual:b.actualSha256,status:b.status,warning:b.byteCountWarning})),[{expected:entry.inputs[0].sha256,actual:entry.inputs[0].sha256,status:'SHA_MATCH',warning:false}],'published bindings use the normal workbench reader contract');
 for(const key of ['input','sequences','nodeRuns','speechAudit','authority','customSourceExtension','status'])assert.deepEqual(now[key],seed[key]);
 assert.equal(now.summary.registeredRenderCount,0);assert.equal(now.summary.visuallyAcceptedCount,0);assert.equal(now.summary.candidateCoverageCount,1);
 assert.ok(now.candidates[1].staticSamples[0].imageArtifactId);assert.equal(now.candidates[1].wholeShotPASS,false);
 if(article)assert.equal(now.candidates[1].staticSamples[0].referenceArtifactId,'existing-article-reference-id','article artifact IDs are preserved instead of replaced with video path IDs');
 const bytes=fs.readFileSync(manifestFile),again=await publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[entry.id]});assert.equal(again.written,false);assert.equal(again.verifiedFileCount,0);assert.deepEqual(fs.readFileSync(manifestFile),bytes);
 const legacy=structuredClone(now);legacy.candidates[1].inputBinding=entry.inputs.map(f=>({...f,declaredSha256:f.sha256,actualSha256:f.sha256,inputSha256Matches:true}));
 const {sha256:legacySha,...legacyBody}=legacy;legacy.sha256=nodeInputHash(legacyBody);save(manifestFile,legacy);
 const repaired=await publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[entry.id]});assert.equal(repaired.written,true);assert.deepEqual(repaired.addedCandidateIds,[]);
 assert.deepEqual(repaired.manifest.candidates[1],now.candidates[1]);assert.deepEqual(fs.readFileSync(manifestFile),bytes,'schema repair restores the same manifest bytes after verified immutable registry checks');
 const bad=structuredClone(registry);bad.entries[0].localReview.label='different review';save(registryFile,bad);
 await assert.rejects(publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[entry.id]}),/EXISTING_ID_CONFLICT/);save(registryFile,registry);
 const second=structuredClone(entry);second.id='candidate-two';second.staticSamples[0].image.sha256='c'.repeat(64);save(registryFile,{...registry,entries:[entry,second]});
 await assert.rejects(publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[second.id]}),/ARTIFACT_CHANGED/);assert.deepEqual(fs.readFileSync(manifestFile),bytes);
 second.staticSamples[0].image=entry.staticSamples[0].image;second.sequenceIds=['unregistered-scene'];save(registryFile,{...registry,entries:[entry,second]});
 await assert.rejects(publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[second.id]}),/CANDIDATE_SCOPE/);
 // Source-only refresh uses the same publisher without candidate or completion credit.
 if(!article){
  save(registryFile,registry);
  const sourceOnlyPlan=structuredClone(plan);sourceOnlyPlan.shots[0].sourceInterval={startFrame:0,endFrameExclusive:100};
  const sourcePath=path.join(dir,'clean-source.jpg'),sourceBytes=Buffer.from('synthetic clean source '+genre);fs.writeFileSync(sourcePath,sourceBytes);
  sourceOnlyPlan.shots[0].statePackagingDecisions=[{state:'HANDOFF',sourceFrame:60,sourceVideoSha256:sourceSha,referencePath:sourcePath,referenceSha256:hash(sourceBytes),reviewedBy:'fixture',reason:'Source review only',packagingForm:'NO_PACKAGE',observation:'CLEAN_PRESENTER',packagingElementsVisible:false}];
  save(path.join(dir,'shot-task-plan-v1.json'),sourceOnlyPlan);
  const beforeSource=JSON.parse(fs.readFileSync(manifestFile));
  const capacityFixture=structuredClone(beforeSource);
  while(capacityFixture.artifacts.length<MAX_RESEARCH_TASK_ARTIFACTS_V1)capacityFixture.artifacts.push({...capacityFixture.artifacts[0],id:'capacity-'+capacityFixture.artifacts.length,path:'work/'+taskId+'/capacity-'+capacityFixture.artifacts.length+'.png'});
  const {sha256:capacitySha,...capacityBody}=capacityFixture;capacityFixture.sha256=nodeInputHash(capacityBody);save(manifestFile,capacityFixture);
  const beforeCapacityFailure=fs.readFileSync(manifestFile);
  await assert.rejects(publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[]}),/READER_CAPACITY_EXCEEDED/);
  assert.deepEqual(fs.readFileSync(manifestFile),beforeCapacityFailure,'publication must fail before making the manifest unreadable');
  save(manifestFile,beforeSource);
  const sourceDry=await publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[],dryRun:true});
  assert.equal(sourceDry.written,false);assert.equal(sourceDry.addedSourceReferenceArtifactIds.length,1);assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile)),beforeSource);
  const sourceAdded=await publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[]});
  assert.equal(sourceAdded.written,true);assert.deepEqual(sourceAdded.addedCandidateIds,[]);assert.equal(sourceAdded.addedSourceReferenceArtifactIds.length,1);
  const sourceArtifact=sourceAdded.manifest.artifacts.find(a=>a.id===sourceAdded.addedSourceReferenceArtifactIds[0]);
  assert.equal(sourceArtifact.role,'REFERENCE_FRAME');assert.equal(sourceArtifact.referenceOnly,true);assert.equal(sourceArtifact.productionAssetAllowed,false);
  assert.equal(sourceArtifact.sha256,hash(sourceBytes));assert.equal(sourceArtifact.bytes,sourceBytes.length);
  assert.deepEqual(sourceAdded.manifest.candidates,beforeSource.candidates);assert.deepEqual(sourceAdded.manifest.summary,beforeSource.summary);
  for(const key of ['input','sequences','nodeRuns','speechAudit','authority','customSourceExtension','status'])assert.deepEqual(sourceAdded.manifest[key],beforeSource[key]);
  const sourceRepeat=await publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[]});assert.equal(sourceRepeat.written,false);assert.equal(sourceRepeat.verifiedFileCount,0);
  if(index===0){
    const planFile=path.join(dir,'shot-task-plan-v1.json'),originalBytes=fs.readFileSync(planFile),retained=JSON.parse(originalBytes);
    retained.retainedHistoryFixture='x'.repeat(17*1024*1024);save(planFile,retained);
    const bounded=await publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[],dryRun:true});assert.equal(bounded.written,false);
    retained.retainedHistoryFixture='x'.repeat(MAX_RESEARCH_PRODUCTION_PLAN_BYTES_V1);save(planFile,retained);
    await assert.rejects(()=>publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[],dryRun:true}),/RESEARCH_PUBLICATION_FILE_BUDGET/);
    fs.writeFileSync(planFile,originalBytes);
  }
  const wrongSource=structuredClone(sourceOnlyPlan);wrongSource.shots[0].statePackagingDecisions[0].sourceVideoSha256='f'.repeat(64);save(path.join(dir,'shot-task-plan-v1.json'),wrongSource);
  await assert.rejects(publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[]}),/SOURCE_REFERENCE_INVALID/);
  save(path.join(dir,'shot-task-plan-v1.json'),sourceOnlyPlan);save(manifestFile,beforeSource);fs.writeFileSync(sourcePath,'changed');
  await assert.rejects(publishRegisteredResearchCandidatesV1({repoRoot:root,taskId,candidateIds:[]}),/SOURCE_REFERENCE_BYTES_CHANGED/);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile)),beforeSource);
  save(path.join(dir,'shot-task-plan-v1.json'),plan);
 }
 const promoted=structuredClone(entry);promoted.wholeShotPASS=true;
 await assert.rejects(verifyResearchStaticCandidateV1(promoted,{repoRoot:root,sourceVideoSha256:sourceSha,verifyDeclaredFile:async()=>{throw Error('should reject metadata first');}}),/static-entry-invalid/);
 fixtures.push({id:genre,genre,status:'PASS',sourceKind:article?'ARTICLE':'VIDEO',oldManifestFieldsPreserved:true,repeatWrites:0,repeatFileVerification:0,newFileCount:published.verifiedFileCount});
}
const report={status:'PASS',fixtures,checks:['three-genres-two-source-kinds','existing-manifest-preservation','incremental-artifact-IDs','zero-work-repeat','source-byte-drift-rejection','registered-sequence-scope','immutable-candidate-id','no-whole-shot-promotion'],verificationScope:'PURE_FIXTURE_PUBLICATION_NOT_VISUAL_QUALITY',providerCalls:0,productionAdmission:false};
console.log(JSON.stringify(report));
if(process.argv.includes('--output')){const filename=process.argv[process.argv.indexOf('--output')+1];fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
}finally{fs.rmSync(root,{recursive:true,force:true});}
