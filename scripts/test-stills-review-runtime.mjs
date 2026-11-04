// Opt-in real stepStills receipt-consumption test. Simulated actors/low scores
// are TEST DATA, not independent visual judgments. Restore all task bytes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {boardConfig} from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import {stepStills,stillsReady} from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
import {readTask,readAnswer,submitTaskAnswer,reviewSubmissionStatus} from '../apps/studio-next/src/lib/recipe-board/agenttask.mjs';
const cfg=boardConfig(),id='banana-design';
assert(cfg.repoRoot.startsWith('/Users/a1/.hermes/cache/scratch/'));
const dir=path.join(cfg.dataDir,'projects',id,'tasks');
const before=new Map(fs.readdirSync(dir).filter(f=>fs.statSync(path.join(dir,f)).isFile()).map(f=>[f,fs.readFileSync(path.join(dir,f))]));
const candidate=path.join(cfg.repoRoot,'receipt-fixture-candidate.json');
try {
 await stepStills(cfg,id,{log:()=>{}});
 const answer=readAnswer(cfg,id,'stills');answer.sourceTaskInputHash=readTask(cfg,id,'stills').inputHash;
 fs.writeFileSync(candidate,JSON.stringify(answer));
 submitTaskAnswer(cfg,id,'stills',candidate,{env:{CODEX_THREAD_ID:'TEST-ONLY-writer'}});
 const prepared=await stepStills(cfg,id,{log:()=>{}});assert.equal(prepared.state,'review');
 const task=readTask(cfg,id,'stills-taste');
 assert.equal(task.input.stillReviewPack.reviewChain.schema,task.schema);
 const review={overall:'TEST DATA: refusal-path consumer probe, not an inspection',beats:task.input.beats.map(({beat})=>({beat,composition:1,figureGround:1,focus:1,ground:1,type:1,score:1,issue:'TEST DATA: deliberately reject, no visual inspection',toFour:[],checked:[],hard:[]}))};
 fs.writeFileSync(candidate,JSON.stringify(review));
 for(const step of ['stills-taste','stills-taste-2']) {
  submitTaskAnswer(cfg,id,step,candidate,{env:{CODEX_THREAD_ID:`TEST-ONLY-${step}`}});
  assert.equal(reviewSubmissionStatus(cfg,id,step,readTask(cfg,id,step),{writerStep:'stills'}).ok,true);
 }
 const consumed=await stepStills(cfg,id,{log:()=>{}});
 assert.equal(consumed.state,'rejected');assert.equal(stillsReady(cfg,id),false);
 const check=JSON.parse(fs.readFileSync(path.join(dir,'stills-taste.check.json')));
 assert.equal(check.review.beats.length,3);assert.equal(check.ok,false);
 fs.writeFileSync(path.join(cfg.repoRoot,'stills-review-receipt-consumer-result.json'),JSON.stringify({scope:'TEST ONLY simulated actors and deliberate low scores; no visual review',prepared:prepared.state,consumed:consumed.state,beats:check.review.beats.length,errors:consumed.errors},null,2));
 console.log('real stepStills consumed two receipt-bound fixture answers and rejected all 3 beats; tasks restored');
} finally {
 for(const f of fs.readdirSync(dir)) if(fs.statSync(path.join(dir,f)).isFile()&&!before.has(f)) fs.unlinkSync(path.join(dir,f));
 for(const [f,bytes] of before) fs.writeFileSync(path.join(dir,f),bytes);
 fs.rmSync(candidate,{force:true});
}
