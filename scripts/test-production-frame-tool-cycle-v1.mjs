import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {runClaimedFrameToolCycleV1,builtInImagegenOutputPathV1} from '../apps/studio-next/src/lib/a1-production-frame-tool-cycle-v1.mjs';
const action=id=>({claimed:true,nodeId:id,phaseId:'approved-phase',workerId:'controller',arguments:{prompt:'Original complete frame '+id,transparent_background:false},request:{nodeId:id,inputSha256:'a'.repeat(64),requestSha256:'b'.repeat(64),prompt:'Original complete frame '+id,transparentBackground:false,references:[]}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const fixtures=[];
for(const genre of ['typography','editorial-comparison','source-explainer']){
  const fast=deferred(),slow=deferred(),fastSaved=deferred(),events=[];let calls=0,clock=1000;
  const pending=runClaimedFrameToolCycleV1({actions:[action(genre+'-fast'),action(genre+'-slow')],now:()=>clock,
    invoke:(_,a)=>{calls++;return a.nodeId.endsWith('fast')?fast.promise:slow.promise;},
    complete:async({action:a,timing})=>{events.push(a.nodeId);assert.ok(timing.providerReturnedAt);return {saved:true};},
    checkpoint:event=>{if(event.stage==='result-saved'&&event.nodeId.endsWith('fast'))fastSaved.resolve();}});
  clock=1100;fast.resolve({outputPath:'/generated/fast.png'});await fastSaved.promise;
  assert.deepEqual(events,[genre+'-fast'],'save the first result while the slow provider is still pending');
  clock=1300;slow.resolve({outputPath:'/generated/slow.png'});const result=await pending;
  assert.equal(calls,2);assert.equal(result.status,'RESULTS_SAVED_FOR_NORMAL_RESUME');assert.equal(result.automaticRetry,false);
  assert.ok(result.items.every(i=>i.returnToReceiptMs===0&&i.providerResubmitted===false));
  fixtures.push({id:genre,genre,status:'PASS',fastResultSavedBeforeSlowReturn:true,providerCalls:calls});
}
let invoked=0;
await assert.rejects(runClaimedFrameToolCycleV1({actions:[action('x'),{...action('y'),claimed:false}],invoke:async()=>invoked++,complete:async()=>{}}),/CLAIM_BINDING/);
assert.equal(invoked,0,'validate the entire pair before any provider request');
const failure=await runClaimedFrameToolCycleV1({actions:[action('failure')],invoke:async()=>({outputPath:'/generated/available.png'}),complete:async()=>{throw Error('admission interrupted');}});
assert.equal(failure.status,'RECONCILIATION_REQUIRED');assert.equal(failure.items[0].outputPath,'/generated/available.png');assert.equal(failure.automaticRetry,false);
const other=await runClaimedFrameToolCycleV1({actions:[action('bad'),action('good')],invoke:async(_,a)=>{if(a.nodeId==='bad')throw Error('provider transport');return {outputPath:'/generated/good.png'};},complete:async()=>({saved:true})});
assert.equal(other.items[1].status,'SAVED_FOR_NORMAL_RESUME','one provider failure must not discard a successful peer');
const root='/configured/generated_images';
assert.equal(builtInImagegenOutputPathV1({output_hint:`Saved as ${root}/session/exec-image.png by default.`},root),root+'/session/exec-image.png');
for(const hint of [`Saved /other/secret.png`,`${root}/../outside.png`,`${root}/s/a.png and ${root}/s/b.png`])assert.throws(()=>builtInImagegenOutputPathV1({output_hint:hint},root),/AMBIGUOUS/);
console.log(JSON.stringify({status:'PASS',fixtures,checks:['fast-result-immediate-admission','two-job-cap','claim-before-provider','failure-isolation','saved-output-reconciliation','no-auto-provider-retry','configured-output-root']}));
if(process.argv.includes('--output')){const file=process.argv[process.argv.indexOf('--output')+1];fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({status:'PASS',fixtures,productionAdmission:false,verificationScope:'PURE_CALLBACK_CONTRACT_ONLY'},null,2)+'\n',{flag:'wx'});}
