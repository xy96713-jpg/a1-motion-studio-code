import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {runCodexVisualPassV2,MAX_VISUAL_PASS_IMAGES_V2} from '../apps/studio-next/src/lib/a1-codex-visual-pass-v2.mjs';
import {referenceVisualPromptV2} from '../apps/studio-next/src/lib/a1-reference-visual-director-v2.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-vision-test-'))),image=path.join(root,'ref.png');fs.writeFileSync(image,Buffer.from([137,80,78,71,13,10,26,10]));const sha=createHash('sha256').update(fs.readFileSync(image)).digest('hex');let calls=0;
try{
 const args={executable:'fixture',pass:'test',prompt:'Observe attached image',context:{},schema:{type:'object'},codexVersion:'fixture',images:[{path:image,sha256:sha}],outputDirectory:path.join(root,'ok'),runProcess:async options=>{calls++;assert.equal(options.args.filter(x=>x==='--image').length,1);assert.equal(options.args[options.args.indexOf('--sandbox')+1],'read-only');assert.ok(options.args.includes('--ignore-user-config'));assert.ok(options.args.includes('--output-last-message'));assert.ok(fs.readFileSync(options.args[options.args.indexOf('--image')+1]).equals(fs.readFileSync(image)));fs.writeFileSync(options.args[options.args.indexOf('--output-last-message')+1],'{"observed":true}');return {stdout:'not final JSON',stderr:'',code:0};}};
 const r=await runCodexVisualPassV2(args);assert.equal(r.output.observed,true);assert.equal(r.trace.imageInputCount,1);assert.equal(calls,1);
 await assert.rejects(()=>runCodexVisualPassV2(args),/ALREADY_STARTED/);assert.equal(calls,1);
 await assert.rejects(()=>runCodexVisualPassV2({...args,outputDirectory:path.join(root,'bad'),images:[{path:image,sha256:'f'.repeat(64)}]}),/SHA_MISMATCH/);assert.equal(calls,1);
 await assert.rejects(()=>runCodexVisualPassV2({...args,outputDirectory:path.join(root,'failure'),runProcess:async()=>{throw Error('fixture timeout');}}),/fixture timeout/);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'failure/failure.json'))).automaticRetry,false);
 const providerError=Object.assign(Error('fixture provider failure'),{stdout:'{"type":"error","message":"invalid schema"}\n',stderr:'fixture diagnostic'});
 await assert.rejects(()=>runCodexVisualPassV2({...args,outputDirectory:path.join(root,'provider-failure'),runProcess:async()=>{throw providerError;}}),/provider failure/);
 assert.equal(fs.readFileSync(path.join(root,'provider-failure/events.jsonl'),'utf8'),providerError.stdout);
 assert.equal(fs.readFileSync(path.join(root,'provider-failure/diagnostic.log'),'utf8'),providerError.stderr);
 const completedTimeout=async options=>{
   const text='{"observed":true}';fs.writeFileSync(options.args[options.args.indexOf('--output-last-message')+1],text);
   throw Object.assign(Error('a1-visual-director-timeout:150s'),{stdout:JSON.stringify({type:'item.completed',item:{type:'agent_message',text}})+'\n'+JSON.stringify({type:'turn.completed'})+'\n',stderr:'owned process terminated after output'});
 };
 const recovered=await runCodexVisualPassV2({...args,outputDirectory:path.join(root,'completed-timeout'),schema:{type:'object',additionalProperties:false,required:['observed'],properties:{observed:{type:'boolean'}}},runProcess:completedTimeout});
 assert.equal(recovered.output.observed,true);assert.equal(recovered.trace.newModelCalls,0);assert.equal(recovered.trace.processExited,false);assert.equal(recovered.trace.processTerminatedAfterCompletedTurn,true);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'completed-timeout/failure.json'))).status,'FAILED','original failure stays preserved');
 await assert.rejects(()=>runCodexVisualPassV2({...args,outputDirectory:path.join(root,'no-terminal'),runProcess:async options=>{fs.writeFileSync(options.args[options.args.indexOf('--output-last-message')+1],'{"observed":true}');throw Object.assign(Error('a1-visual-director-timeout:150s'),{stdout:JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"observed":true}'}})+'\n',stderr:''});}}),/timeout/);
 await assert.rejects(()=>runCodexVisualPassV2({...args,outputDirectory:path.join(root,'schema-drift'),schema:{type:'object',required:['missing']},runProcess:completedTimeout}),/timeout/);
 assert.match(referenceVisualPromptV2({}),/Inspect the attached images/);assert.match(referenceVisualPromptV2({}),/Do not use tools/);
 const boundedImages=Array.from({length:MAX_VISUAL_PASS_IMAGES_V2},()=>({path:image,sha256:sha}));let nativeCalls=0;
 const nativeArgs={...args,images:boundedImages,outputDirectory:path.join(root,'native-repair'),runProcess:async options=>{nativeCalls++;assert.equal(options.args.filter(x=>x==='--image').length,MAX_VISUAL_PASS_IMAGES_V2);fs.writeFileSync(options.args[options.args.indexOf('--output-last-message')+1],'{"observed":true}');return {stdout:'',stderr:'',code:0};}};
 const nativeResult=await runCodexVisualPassV2(nativeArgs);assert.equal(nativeResult.trace.imageInputCount,MAX_VISUAL_PASS_IMAGES_V2);
 await assert.rejects(()=>runCodexVisualPassV2({...nativeArgs,outputDirectory:path.join(root,'too-many-native'),images:[...boundedImages,boundedImages[0]]}),/BOUNDS_INVALID/);
 assert.equal(nativeCalls,1,'the extra image is rejected before a process is started');
 console.log('PASS image arguments, immutable snapshots, separate final JSON, no duplicate call, drift rejection, no automatic retry');
}finally{fs.rmSync(root,{recursive:true,force:true});}
