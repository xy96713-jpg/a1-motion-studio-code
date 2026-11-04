import assert from 'node:assert/strict';
import {runHypitBuildLifecycleV1} from '../apps/studio-next/src/lib/a1-node-hypit-render-adapter-v1.mjs';
const reply=outcome=>({stdout:JSON.stringify({build:{id:'owned-test-build',work:{outcome}}})});
const events=[],calls=[];
await runHypitBuildLifecycleV1({runSource:'scene.svrun',runtimeProfile:'local.json',onLifecycle:e=>events.push(e),invoke:async args=>{calls.push(args);return reply('complete');}});
assert.equal(calls[0].includes('--follow'),false);assert.equal(events[0].stage,'BUILD_SUBMITTED');assert.equal(events.at(-1).buildClosed,true);
assert.equal(calls.some(a=>a[0]==='cancel'),false);
for(const outcome of ['failed','cancelled']){
 const local=[];await assert.rejects(runHypitBuildLifecycleV1({runSource:'x',runtimeProfile:'r',onLifecycle:e=>local.push(e),invoke:async args=>args[0]==='build'?reply('active'):Promise.reject(Object.assign(new Error('nonzero status'),reply(outcome)))}),new RegExp(`HYPIT_BUILD_${outcome.toUpperCase()}`));
 assert.equal(local.at(-1).buildClosed,true);
}
for(const confirm of [true,false]){
 const controller=new AbortController(),local=[],invocations=[];
 await assert.rejects(runHypitBuildLifecycleV1({runSource:'x',runtimeProfile:'r',signal:controller.signal,onLifecycle:e=>{local.push(e);if(e.stage==='BUILD_SUBMITTED')controller.abort();},invoke:async(args,timeout,cleanup)=>{invocations.push({args,timeout,cleanup});if(args[0]==='build')return reply('active');if(args[0]==='cancel')return {stdout:'{"requested":true}'};if(confirm)return reply('cancelled');throw new Error('close unconfirmed');}}));
 assert.equal(local.at(-1).buildClosed,confirm);assert.deepEqual(invocations.slice(1).map(x=>x.args[0]),['cancel','status']);assert.ok(invocations.slice(1).every(x=>x.cleanup===true&&x.timeout<=4000));
}
const controller=new AbortController();controller.abort();let invoked=false;
await assert.rejects(runHypitBuildLifecycleV1({runSource:'x',runtimeProfile:'r',signal:controller.signal,invoke:async()=>{invoked=true;}}));assert.equal(invoked,false);
console.log(JSON.stringify({status:'PASS',checks:['durable-build-id-before-observation','complete-failed-cancelled-status','native-cancel-on-abort','confirmed-vs-unconfirmed-closure','bounded-cleanup-invocations','aborted-before-submit-no-execution']}));
