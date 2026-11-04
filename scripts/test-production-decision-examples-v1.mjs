import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {productionFrameGoalShaV1} from '../apps/studio-next/src/lib/a1-production-frame-identity-v1.mjs';
import {readProductionDecisionExamplesV1,readReferenceHierarchyFeedbackV1} from '../apps/studio-next/src/lib/a1-production-decision-examples-v1.mjs';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'decision-examples-'))),taskRoot=path.join(root,'work/fixture');fs.mkdirSync(taskRoot,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const fact=file=>({path:path.relative(root,file),sha256:hash(fs.readFileSync(file))});
try{
  const source=path.join(taskRoot,'source.png');await sharp({create:{width:8,height:8,channels:3,background:'white'}}).png().toFile(source);
  const plan={source:{videoSha256:'a'.repeat(64)},shots:[{id:'unseen',sourceText:'Question field',visualJob:'Read the main judgment',exactCopy:['Question'],fullFrameRequests:[]}]};
  const shot=plan.shots[0],goal=productionFrameGoalShaV1(plan,shot,'HOLD');
  shot.fullFrameRequests.push({state:'HOLD',goalInputSha256:goal,contentPlan:{referenceKind:'TYPOGRAPHY_EVENT'},productionDecision:{method:'GENERATE_COMPLETE_FRAME'}});
  const entries=[];
  for(const [id,status,color] of [['good','PASS','green'],['bad','VISUAL_FAIL','red']]){
    const image=path.join(taskRoot,id+'.png');await sharp({create:{width:8,height:8,channels:3,background:color}}).png().toFile(image);
    const review=path.join(taskRoot,id+'-review.json');fs.writeFileSync(review,JSON.stringify({productionAdmission:false,items:[{shotId:shot.id,state:'HOLD',status,
      imageSha256:fact(image).sha256,referenceSha256:fact(source).sha256,checks:{visualDirectionCorrect:status==='PASS'},findings:status==='PASS'?[]:['An object replaced the source typography'],styleNotes:[]}]}));
    entries.push({id,sequenceIds:[shot.id],goalInputSha256:goal,localReview:{status},review:fact(review),staticSamples:[{id:'hold',image:fact(image),reference:fact(source)}]});
  }
  const registry=path.join(taskRoot,'candidate-registry-v1.json'),save=()=>fs.writeFileSync(registry,JSON.stringify({scope:'RESEARCH_ONLY',productionAdmission:false,entries}));save();
  const args={repoRoot:root,taskRoot,plan,targets:[{shotId:shot.id}]};
  const result=await readProductionDecisionExamplesV1(args);
  assert.equal(result.examples.length,2);assert.equal(result.images.length,4);
  assert.equal(result.examples.find(e=>e.outcome==='VISUAL_FAIL').findings.length,1);
  assert.ok(result.examples.every(e=>e.visualApproval===false&&e.productionAdmission===false));
  plan.shots[0].exactCopy=['Changed question'];
  assert.equal((await readProductionDecisionExamplesV1(args)).examples.some(e=>e.outcome==='PASS'),false,'old content pass cannot teach a current successful recipe');
  plan.shots[0].exactCopy=['Question'];
  const seq=path.join(taskRoot,'sequence-review');fs.mkdirSync(seq);
  const answer={shots:[{shotId:shot.id,referenceHierarchyPreserved:false,identityOrCopyCorrect:true,declaredFallbackAcceptable:true,findings:['The source focal actor moved into a small corner']} ]};
  const answerFile=path.join(seq,'answer.json');fs.writeFileSync(answerFile,JSON.stringify(answer));
  const feedbackFile=path.join(taskRoot,'feedback.json');fs.writeFileSync(feedbackFile,JSON.stringify({scope:'STATIC_ADJACENCY_ONLY',...answer,visualApproval:false,productionAdmission:false,
    trace:{imageShas:[entries[0].staticSamples[0].reference.sha256,entries[0].staticSamples[0].image.sha256],outputDirectory:seq,outputHash:hash(fs.readFileSync(answerFile))}}));
  const feedback={...fact(feedbackFile),candidateId:entries[0].id,state:'HOLD'};
  assert.equal(readReferenceHierarchyFeedbackV1({repoRoot:root,taskRoot,entry:entries[0],binding:feedback}).status,'VISUAL_FAIL');
  plan.shots[0].productionRevisionRequest={requestId:'source-focus-change',text:'Restore reference focus',reviewEvidence:feedback};
  const negative=await readProductionDecisionExamplesV1(args);
  assert.equal(negative.examples.find(e=>e.candidateId==='good').outcome,'VISUAL_FAIL','a scoped hierarchy failure must not be taught as generic success');
  assert.ok(negative.examples.find(e=>e.candidateId==='good').applicabilityScope.includes('REFERENCE_HIERARCHY_FAILURE_ONLY'));
  // An old content-only PASS stays unusable as a positive example, but its
  // independently bound source-comparison failure must remain teachable.
  const oldReviewFile=path.resolve(root,entries[0].review.path);
  const oldReview=JSON.parse(fs.readFileSync(oldReviewFile));
  delete oldReview.items[0].checks.visualDirectionCorrect;
  fs.writeFileSync(oldReviewFile,JSON.stringify(oldReview));entries[0].review=fact(oldReviewFile);save();
  delete plan.shots[0].productionRevisionRequest;
  const oldPositive=await readProductionDecisionExamplesV1(args);
  assert.equal(oldPositive.examples.some(e=>e.candidateId==='good'),false);
  assert.ok(oldPositive.rejections.some(r=>r.reason==='DECISION_EXAMPLE_OLD_CONTENT_PASS'));
  const comparison=JSON.parse(fs.readFileSync(feedbackFile));comparison.scope='STATIC_SOURCE_CANDIDATE_COMPARISON_ONLY';
  const comparisonFile=path.join(taskRoot,'source-comparison.json');fs.writeFileSync(comparisonFile,JSON.stringify(comparison));
  const comparisonFeedback={...fact(comparisonFile),candidateId:entries[0].id,state:'HOLD'};
  plan.shots[0].productionRevisionRequest={requestId:'source-role-repair',text:'Restore source document role',reviewEvidence:comparisonFeedback};
  const taughtOldFailure=await readProductionDecisionExamplesV1(args);
  assert.equal(taughtOldFailure.examples.find(e=>e.candidateId==='good').outcome,'VISUAL_FAIL');
  assert.equal(taughtOldFailure.examples.some(e=>e.outcome==='PASS'),false);
  assert.equal(taughtOldFailure.examples.find(e=>e.candidateId==='good').productionAdmission,false);
  assert.throws(()=>readReferenceHierarchyFeedbackV1({repoRoot:root,taskRoot,entry:entries[1],binding:{...feedback,candidateId:'bad'}}),/PIXEL_BINDING/);
  const altered=JSON.parse(fs.readFileSync(feedbackFile));altered.shots[0].findings=['Unrecorded client verdict'];
  const alteredFile=path.join(taskRoot,'altered-feedback.json');fs.writeFileSync(alteredFile,JSON.stringify(altered));
  assert.throws(()=>readReferenceHierarchyFeedbackV1({repoRoot:root,taskRoot,entry:entries[0],binding:{...feedback,...fact(alteredFile)}}),/OUTPUT_MISMATCH/,'client assertions cannot replace the actual model answer');
  fs.appendFileSync(answerFile,'changed');assert.throws(()=>readReferenceHierarchyFeedbackV1({repoRoot:root,taskRoot,entry:entries[0],binding:feedback}),/TRACE_CHANGED/);
  fs.writeFileSync(answerFile,JSON.stringify(answer));delete plan.shots[0].productionRevisionRequest;
  fs.appendFileSync(path.resolve(root,entries[0].review.path),'changed');
  const drift=await readProductionDecisionExamplesV1(args);assert.equal(drift.examples.length,1);assert.ok(drift.rejections.some(r=>r.reason==='DECISION_EXAMPLE_BYTES_CHANGED'));
  await assert.rejects(readProductionDecisionExamplesV1({...args,limit:3}),/BUDGET/);
  console.log('PASS reviewed success/failure pixels retrieved; stale passes and byte drift excluded; bounded reading grants no reuse/user approval. No providers.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
