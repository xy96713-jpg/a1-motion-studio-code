import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyHypitCompletedBuildRecoveryV1,waitForHypitStudioV1,parseHypitStudioLoopbackUrlV1} from '../apps/studio-next/src/lib/a1-node-hypit-render-adapter-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-hypit-alpha-recovery-')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  const node={inputSha256:'1'.repeat(64)},id='bld_fixture_COMPLETE',preview=path.join(root,`opaque-preview-${id}.mp4`),lifecycle=path.join(root,'lifecycle.json');
  fs.writeFileSync(preview,'existing-fixture-preview');
  fs.writeFileSync(lifecycle,JSON.stringify([{event:{stage:'BUILD_TERMINAL',buildId:id,outcome:'complete',buildClosed:true}}]));
  const recovery={contract:'A1HypitCompletedBuildAlphaRecovery/v1',previousNodeInputSha256:node.inputSha256,buildId:id,
    previewSha256:sha(fs.readFileSync(preview)),lifecyclePath:lifecycle,lifecycleSha256:sha(fs.readFileSync(lifecycle))};
  assert.equal(verifyHypitCompletedBuildRecoveryV1(recovery,node,root).preview,preview);
  for(const patch of [{previousNodeInputSha256:'2'.repeat(64)},{buildId:'../escape'},{previewSha256:'0'.repeat(64)},{lifecycleSha256:'0'.repeat(64)},{attemptId:'../escape'}])
    assert.throws(()=>verifyHypitCompletedBuildRecoveryV1({...recovery,...patch},node,root),/HYPIT_ALPHA_RECOVERY/);
  fs.writeFileSync(lifecycle,JSON.stringify([{event:{stage:'BUILD_TERMINAL',buildId:id,outcome:'failed',buildClosed:true}}]));
  assert.throws(()=>verifyHypitCompletedBuildRecoveryV1({...recovery,lifecycleSha256:sha(fs.readFileSync(lifecycle))},node,root),/BUILD_NOT_COMPLETE/);
  const live={exitCode:null,signalCode:null},events=[];
  assert.equal(parseHypitStudioLoopbackUrlV1('Comments http://loc'),null);
  for(const host of ['localhost','127.0.0.1','[::1]'])assert.equal(parseHypitStudioLoopbackUrlV1(`  Comments http://${host}:56028/#comments\n`),`http://${host}:56028`);
  for(const bad of ['https://localhost:56028/#comments','http://external.test:56028/#comments','http://user:pass@localhost:56028/#comments','http://0.0.0.0:56028/#comments','http://localhost:56028/path#comments','http://localhost:56028/?x=1#comments'])
    assert.throws(()=>parseHypitStudioLoopbackUrlV1(`Comments ${bad}\n`),/PRINTED_URL/);
  let count=0;
  await waitForHypitStudioV1('http://127.0.0.1:1',live,1000,undefined,e=>events.push(e),async url=>{
    assert.equal(url,'http://127.0.0.1:1/__studio/visual.html');return ++count===1?new Response('compiling',{status:409}):new Response('ready');
  });
  assert.deepEqual(events.map(e=>e.status),[409,200]);
  await assert.rejects(waitForHypitStudioV1('http://127.0.0.1:1',live,1000,undefined,()=>{},async()=>new Response('exact compile error',{status:500})),/COMPILE_FAILED:500:exact compile error/);
  const refusal=[],cause=Object.assign(new Error('connect refused'),{code:'ECONNREFUSED',address:'::1',port:56028});let refusalAttempts=0;
  await assert.rejects(waitForHypitStudioV1('http://localhost:56028',live,30000,undefined,e=>refusal.push(e),async()=>{refusalAttempts++;throw new TypeError('fetch failed',{cause});}),/CONNECTION_FAILED:ECONNREFUSED/);
  assert.equal(refusalAttempts,1);assert.deepEqual(refusal[0].causes,[{code:'ECONNREFUSED',address:'::1',port:56028}]);
  let addressChecks=0,readyFetches=0;
  await waitForHypitStudioV1(()=>++addressChecks===1?null:'http://localhost:56028',live,1000,undefined,()=>{},async url=>{assert.equal(url,'http://localhost:56028/__studio/visual.html');readyFetches++;return new Response('ready');});
  assert.equal(readyFetches,1);
  const controller=new AbortController();controller.abort();let fetched=false;
  await assert.rejects(waitForHypitStudioV1('http://127.0.0.1:1',live,1000,controller.signal,()=>{},async()=>{fetched=true;}));assert.equal(fetched,false);
  await assert.rejects(waitForHypitStudioV1('http://127.0.0.1:1',{exitCode:1,signalCode:null},1000),/STUDIO_EXITED/);
  console.log(JSON.stringify({status:'PASS',checks:['reuse-exact-completed-build-and-preview','reject-wrong-node-hash-id-lifecycle-preview-attempt','reject-failed-build','printed-loopback-host-and-actual-port','reject-external-wildcard-credentials-scheme-path-query','wait-for-complete-printed-address-before-fetch','record-409-then-ready','record-fatal-compile-body','connection-refusal-fast-fails-with-cause-address-port','cancel-before-http','early-owned-child-exit'],realRuntimeExecutions:0}));
} finally {fs.rmSync(root,{recursive:true,force:true});}
