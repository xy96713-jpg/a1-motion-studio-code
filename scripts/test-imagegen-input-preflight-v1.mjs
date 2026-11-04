import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import {assessShotImagegenDesignV1,projectShotTaskExecutionReadinessV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';
import {inspectImagegenInputPreflightV1} from '../apps/studio-next/src/lib/a1-imagegen-input-preflight-v1.mjs';
import {syncShotTaskRuntimeV1,readShotTaskRuntimeV1,runShotTaskActionV1,claimShotImagegenToolV1,updateUninvokedShotImagegenToolV1,completeShotImagegenToolV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {activateProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
const sharp=createRequire(new URL('../apps/studio-next/package.json',import.meta.url))('sharp');
const png=await sharp({create:{width:8,height:6,channels:4,background:'#234567'}}).png().toBuffer();
const sha=b=>createHash('sha256').update(b).digest('hex'),roots=[],checks=[];
const save=(p,value)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(value,null,2));};
function fixture(id,{design=false,corrupt=false,policy=false}={}){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'input-preflight-'))),taskId='input-fixture',dir=path.join(root,'work',taskId);roots.push(root);fs.mkdirSync(dir,{recursive:true});
 const reference=path.join(dir,'reference.png'),style=path.join(dir,'style.png');fs.writeFileSync(reference,png);fs.writeFileSync(style,corrupt?Buffer.from('Not an image, despite its correct declared SHA'):png);
 const request={prompt:design?'Fixture with Locked label; never call a real provider':'Fixture request; never call a real provider',purpose:'packaging-component',transparentBackground:false,exactCopy:design?['Locked label']:[],references:[{path:style,sha256:sha(fs.readFileSync(style)),role:'style-reference'}],outputRole:'candidate'};
 const parameters={submitAuthorized:true,generationRequest:request};
 if(design)parameters.referenceDesign={contract:'A1ShotReferenceDesign/v1',sourceVideoSha256:'a'.repeat(64),frame:{path:reference,sha256:sha(png),frameNumber:1},observed:{composition:'Fixture',typography:'Fixture',palette:'Fixture',surface:'Fixture'},copyStatus:'LOCKED',titleLayout:[{text:'Locked label',fontRole:'Fixture',box:{x:0.1,y:0.1,width:0.8,height:0.2}}],outputRole:'candidate',review:{mode:'INTEGRATED_COMPOSITE',checks:['Fixture metadata only']},generationRequestSha256:nodeInputHash(request)};
 const shot={id,sourceText:'Fixture only',visualJob:'Fixture metadata',exactCopy:design?['Locked label']:[],sourceInterval:{startFrame:0,endFrameExclusive:10},tasks:[{module:'image-generation',dependencies:[],parameters}]};
 const plan={contract:'A1ShotTaskPlan/v1',projectId:taskId,scope:'RESEARCH_ONLY',productionAdmission:false,source:{videoSha256:'a'.repeat(64)},executionPolicy:{contract:'A1ShotTaskExecutionPolicy/v1',requireReferenceDesignForImagegen:policy},shots:[shot]};
 const args={repoRoot:root,taskId},nodeId=id+':image-generation';
 const sync=()=>{save(path.join(dir,'shot-task-plan-v1.json'),plan);return syncShotTaskRuntimeV1({...args,expectedPlanSha256:nodeInputHash(plan)});};
 return {root,dir,plan,shot,parameters,request,reference,style,args,nodeId,sync};
}
try{
 // Declared layouts are checked even when the optional policy flag is off.
 const layout=fixture('layout',{design:true});layout.parameters.referenceDesign.titleLayout[0].box.width=2;
 let rt=layout.sync();assert.ok(rt.generationPreflight[layout.nodeId].missing.includes('REFERENCE_TITLE_LAYOUT_INVALID'));
 assert.equal(rt.generationPreflight[layout.nodeId].inputPreflight.issues.find(i=>i.code==='REFERENCE_TITLE_LAYOUT_INVALID').category,'LAYOUT');
 const good=structuredClone(layout.shot);good.id='good';delete good.tasks[0].parameters.referenceDesign;good.exactCopy=[];good.tasks[0].parameters.generationRequest.exactCopy=[];
 layout.plan.shots.push(good);rt=layout.sync();rt=await runShotTaskActionV1({...layout.args,action:'tick',maxClaims:2});
 assert.equal(rt.workflow.nodes.find(n=>n.id===layout.nodeId).attempt||0,0);assert.equal(rt.workflow.nodes.find(n=>n.id==='good:image-generation').reason,'IMAGEGEN_TOOL_PENDING');
 const goodClaim=claimShotImagegenToolV1({...layout.args,nodeId:'good:image-generation',workerId:'fixture'});assert.ok(goodClaim.requestSha256);
 checks.push('bad-layout-stops-before-prepare-good-peer-still-ready');
 // Explicit image copy cannot disagree with the locked reference text.
 const copy=fixture('copy',{design:true});copy.request.exactCopy=['Different label'];copy.parameters.referenceDesign.generationRequestSha256=nodeInputHash(copy.request);
 rt=copy.sync();assert.ok(rt.generationPreflight[copy.nodeId].missing.includes('IMAGEGEN_LOCKED_COPY_REQUEST_MISMATCH'));
 const action=projectShotTaskExecutionReadinessV1(copy.plan,rt.summary,{pending:rt.pending,generationPreflight:rt.generationPreflight}).actions.find(a=>a.nodeId===copy.nodeId);
 assert.ok(action.inputPreflight.issues.some(i=>i.field==='generationRequest.exactCopy'));
 assert.ok(action.requiredInputs.some(value=>value.includes('generationRequest.exactCopy')));
 assert.equal(rt.generationPreflight[copy.nodeId].inputPreflight.issues.find(i=>i.code==='IMAGEGEN_LOCKED_COPY_REQUEST_MISMATCH').category,'COPY');
 checks.push('locked-copy-request-conflict');
 const omitted=fixture('omitted',{design:true});omitted.request.prompt='A fixture card with no supplied wording';omitted.parameters.referenceDesign.generationRequestSha256=nodeInputHash(omitted.request);rt=omitted.sync();assert.ok(rt.generationPreflight[omitted.nodeId].missing.includes('IMAGEGEN_LOCKED_COPY_NOT_IN_PROMPT'));
 checks.push('locked-copy-cannot-disappear-from-tool-prompt');
 if(process.env.A1_BASELINE_ROOT&&process.env.A1_BASELINE_CASE==='copy'){
  const legacy=await import(pathToFileURL(path.join(process.env.A1_BASELINE_ROOT,'apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs')));
  await legacy.runShotTaskActionV1({...omitted.args,action:'tick'});
  assert.throws(()=>legacy.claimShotImagegenToolV1({...omitted.args,nodeId:omitted.nodeId,workerId:'fixture'}),/IMAGEGEN_LOCKED_COPY_NOT_IN_PROMPT/);
 }

 const empty=fixture('empty',{design:true});empty.shot.exactCopy=[];
 assert.ok(assessShotImagegenDesignV1(empty.plan,empty.shot,empty.shot.tasks[0]).missing.includes('REFERENCE_TITLE_COPY_MISMATCH'));
 checks.push('unapproved-layout-copy-with-empty-source');
 const localType=fixture('local-type',{design:true});localType.request.exactCopy=[];localType.request.prompt='Image only; text will be rendered separately';localType.parameters.referenceDesign.generationRequestSha256=nodeInputHash(localType.request);
 const localTypeBytes=JSON.stringify(localType.plan);rt=localType.sync();assert.equal(rt.generationPreflight[localType.nodeId].missing.length,0);assert.equal(JSON.stringify(localType.plan),localTypeBytes);
 checks.push('separate-editable-copy-route-preserved');
 // Existing source gaps retain their target and remain a source blocker.
 const source=fixture('source',{design:true});rt=source.sync();
 const sourceReport=inspectImagegenInputPreflightV1({repoRoot:source.root,plan:source.plan,node:rt.workflow.nodes.find(n=>n.id===source.nodeId),existing:{missing:['FRAME_STATE_FACTUAL_CLAIM_UNRESOLVED'],sourceClaimGaps:[{shotId:'source',state:'HOLD',code:'UNSUPPORTED_RELATION'}],evidenceVerified:true},decodeImages:true});
 assert.equal(sourceReport.status,'INPUTS_REQUIRED');assert.equal(sourceReport.decodedNow,0);assert.ok(sourceReport.issues.some(i=>i.category==='SOURCE'&&i.field.includes('HOLD')));
 checks.push('source-gap-before-decoder-or-provider');
 // Correct SHA is not a successful decode; no tool claim may be saved.
 const bad=fixture('bad',{corrupt:true});bad.sync();await runShotTaskActionV1({...bad.args,action:'tick'});
 const targetRuntime=process.env.A1_BASELINE_ROOT&&process.env.A1_BASELINE_CASE!=='late'?await import(pathToFileURL(path.join(process.env.A1_BASELINE_ROOT,'apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs'))):{claimShotImagegenToolV1};
 assert.throws(()=>targetRuntime.claimShotImagegenToolV1({...bad.args,nodeId:bad.nodeId,workerId:'fixture'}),/IMAGEGEN_INPUT_NOT_DECODABLE/);
 rt=readShotTaskRuntimeV1(bad.args);assert.equal(rt.workflow.nodes.find(n=>n.id===bad.nodeId).progress.toolInvocation,undefined);assert.ok(rt.generationPreflight[bad.nodeId].missing.includes('IMAGEGEN_INPUT_NOT_DECODABLE'));
 checks.push('correct-sha-invalid-image-blocked-before-claim');
 // Recheck bytes between claim and the actual begin marker; cancellation works.
 const late=fixture('late');late.sync();await runShotTaskActionV1({...late.args,action:'tick'});
 const claimed=claimShotImagegenToolV1({...late.args,nodeId:late.nodeId,workerId:'fixture'});fs.unlinkSync(late.style);
 const begin=process.env.A1_BASELINE_ROOT&&process.env.A1_BASELINE_CASE==='late'?(await import(pathToFileURL(path.join(process.env.A1_BASELINE_ROOT,'apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs')))).updateUninvokedShotImagegenToolV1:updateUninvokedShotImagegenToolV1;
 assert.throws(()=>begin({...late.args,nodeId:late.nodeId,inputSha256:claimed.inputSha256,requestSha256:claimed.requestSha256,workerId:'fixture',operation:'begin'}),/preflight/);
 rt=readShotTaskRuntimeV1(late.args);assert.equal(rt.workflow.nodes.find(n=>n.id===late.nodeId).progress.toolInvocation.providerInvocationStartedAt,undefined);
 updateUninvokedShotImagegenToolV1({...late.args,nodeId:late.nodeId,inputSha256:claimed.inputSha256,requestSha256:claimed.requestSha256,workerId:'fixture',operation:'cancel-uninvoked',confirmedNotInvoked:true,reason:'Fixture reference removed; no provider invoked'});
 checks.push('late-change-before-begin-and-owner-cancellation');
 // Valid repeated checks use the same decoded bytes and do not start work.
 const valid=fixture('valid',{design:true});rt=valid.sync();const node=rt.workflow.nodes.find(n=>n.id===valid.nodeId),existing=rt.generationPreflight[valid.nodeId];
 const first=inspectImagegenInputPreflightV1({repoRoot:valid.root,plan:valid.plan,node,existing,decodeImages:true});const second=inspectImagegenInputPreflightV1({repoRoot:valid.root,plan:valid.plan,node,existing,decodeImages:true});
 assert.equal(first.status,'DISPATCH_INPUTS_READY');assert.equal(second.decodedNow,0);assert.equal(second.visualApproval,false);
 // Coarse repeated boxes are an honest warning, not a false overlap rejection.
 valid.shot.exactCopy.push('Second label');valid.parameters.referenceDesign.titleLayout.push({...valid.parameters.referenceDesign.titleLayout[0],text:'Second label'});valid.request.exactCopy=[...valid.shot.exactCopy];valid.request.prompt='Fixture with Locked label and Second label; no actual provider';valid.parameters.referenceDesign.generationRequestSha256=nodeInputHash(valid.request);rt=valid.sync();
 assert.ok(rt.generationPreflight[valid.nodeId].inputPreflight.warnings.some(w=>w.code==='IMAGEGEN_LAYOUT_COARSE_SHARED_BOX'));assert.equal(rt.generationPreflight[valid.nodeId].missing.length,0);
 checks.push('valid-input-cache-and-coarse-layout-warning');
 // A saved result still collects through the existing recovery path.
 const recovery=fixture('recovery');recovery.sync();await runShotTaskActionV1({...recovery.args,action:'tick'});const request=claimShotImagegenToolV1({...recovery.args,nodeId:recovery.nodeId,workerId:'fixture'});
 const output=path.join(recovery.dir,'output.png');fs.writeFileSync(output,await sharp({create:{width:9,height:7,channels:4,background:'#765432'}}).png().toBuffer());
 await completeShotImagegenToolV1({...recovery.args,nodeId:recovery.nodeId,inputSha256:request.inputSha256,requestSha256:request.requestSha256,workerId:'fixture',outputPath:output});
 rt=readShotTaskRuntimeV1(recovery.args);assert.equal(rt.generationPreflight[recovery.nodeId].resultAvailable,true);assert.equal(rt.generationPreflight[recovery.nodeId].inputPreflight,undefined);
 const resumed=await runShotTaskActionV1({...recovery.args,action:'resume',nodeId:recovery.nodeId});assert.equal(resumed.workflow.nodes.find(n=>n.id===recovery.nodeId).state,'needs-review');
 checks.push('saved-output-recovery-preserved');
 console.log(JSON.stringify({status:'PASS',checks,realProviderCalls:0,newVideoRenders:0,visualApproval:false}));
}finally{for(const root of roots)fs.rmSync(root,{recursive:true,force:true});}
