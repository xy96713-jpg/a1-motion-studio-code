import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {registeredFrameReviewMatchesV1} from '../apps/studio-next/src/lib/a1-production-frame-options-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'registered-review-'))),taskRoot=path.join(root,'work','unseen'),dir=path.join(taskRoot,'review');fs.mkdirSync(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),save=(p,v)=>{const b=Buffer.from(JSON.stringify(v));fs.writeFileSync(p,b);return hash(b);};
try{
 const keys=['copyCorrect','actorAndDataCorrect','readable','compositionAcceptable','meaningfulContent','visualDirectionCorrect'],checks=Object.fromEntries(keys.map(k=>[k,true]));
 const answer={reviews:[{reviewKey:'frame',state:'HOLD',...checks}]},answerPath=path.join(dir,'answer.json'),outputHash=save(answerPath,answer),imageSha256='a'.repeat(64),reference={sha256:'b'.repeat(64),sourceFrame:7};
 const report={contract:'A1ProductionBatchVisualReview/v1',productionAdmission:false,items:[{shotId:'scene',state:'HOLD',reviewKey:'frame',status:'PASS',imageSha256,referenceSha256:reference.sha256,sourceFrame:7,checks}],trace:{outputDirectory:dir,outputHash,imageShas:[imageSha256,reference.sha256]}};
 const reportPath=path.join(taskRoot,'report.json'),entry={sequenceIds:['scene'],review:{path:reportPath,sha256:save(reportPath,report)}};
 const args={repoRoot:root,taskRoot,entry,imageSha256,reference,state:'HOLD',requiresDirection:true};
 assert.equal(registeredFrameReviewMatchesV1(args),true);
 const singleTrace=report.trace;
 report.trace={scope:'BOUND_SPLIT_REVIEWS',parts:[{outputDirectory:dir,imageShas:['c'.repeat(64)]},singleTrace]};
 entry.review.sha256=save(reportPath,report);
 assert.equal(registeredFrameReviewMatchesV1(args),true,'split batch reviews must retain reuse eligibility for their exact state and pixels');
 assert.equal(registeredFrameReviewMatchesV1({...args,state:'ENTRY'}),false,'another state cannot borrow the split HOLD review');
 report.trace=singleTrace;entry.review.sha256=save(reportPath,report);
 assert.equal(registeredFrameReviewMatchesV1({...args,reference:{...reference,sourceFrame:8}}),false);
 fs.appendFileSync(answerPath,' ');assert.equal(registeredFrameReviewMatchesV1(args),false);
 answer.reviews[0].visualDirectionCorrect=false;report.trace.outputHash=save(answerPath,answer);entry.review.sha256=save(reportPath,report);
 assert.equal(registeredFrameReviewMatchesV1(args),false,'claimed PASS cannot override actual model answer');
 console.log('PASS saved source/candidate review binding, state mismatch, trace drift and contradictory verdict refusal.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
