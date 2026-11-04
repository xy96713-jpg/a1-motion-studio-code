#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {claimProductionFrameToolsV1,completeProductionFrameToolV1} from '../apps/studio-next/src/lib/a1-production-frame-pipeline-v1.mjs';
import {runClaimedFrameToolCycleV1,builtInImagegenOutputPathV1} from '../apps/studio-next/src/lib/a1-production-frame-tool-cycle-v1.mjs';
import {updateUninvokedShotImagegenToolV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
import {closeProductionPhaseV1} from '../apps/studio-next/src/lib/a1-production-phase-v1.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');

export async function runFrameToolBridgeV1({repoRoot,operation,file,sha256}) {
  const root=fs.realpathSync(repoRoot),input=fs.realpathSync(path.resolve(root,file||''));
  if(!input.startsWith(path.join(root,'work')+path.sep)||fs.lstatSync(path.resolve(root,file)).isSymbolicLink())throw Error('FRAME_BRIDGE_INPUT_SCOPE');
  const bytes=fs.readFileSync(input);if(bytes.length>1024*1024||hash(bytes)!==sha256)throw Error('FRAME_BRIDGE_INPUT_SHA');
  if(operation==='claim'){
    const record=JSON.parse(bytes),taskRoot=path.join(root,'work',record.taskId);
    if(!/^[a-z0-9][a-z0-9-]{0,95}$/.test(record.taskId||''))throw Error('FRAME_BRIDGE_TASK_ID');
    const generatedRoot=path.resolve(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'generated_images');
    const actions=claimProductionFrameToolsV1({repoRoot:root,outbox:{path:input,sha256}});
    const contract={contract:'A1FrameToolBridgeClaim/v1',taskId:record.taskId,outbox:{path:input,sha256},actions,
      generatedRoot,completionDirectory:path.join(taskRoot,'reference-director-runs',record.parentPhaseId,'tool-cycle'),
      controllerSource:runClaimedFrameToolCycleV1.toString(),outputResolverSource:builtInImagegenOutputPathV1.toString(),
      sourceSha256:hash(fs.readFileSync(path.join(root,'apps/studio-next/src/lib/a1-production-frame-tool-cycle-v1.mjs'))),
      productionAdmission:false};
    fs.mkdirSync(contract.completionDirectory,{recursive:true});
    const claimFile=path.join(contract.completionDirectory,'claim-'+sha256+'.json');
    fs.writeFileSync(claimFile,JSON.stringify(contract,null,2)+'\n',{flag:'wx'});
    return {...contract,claimFile:{path:claimFile,sha256:hash(fs.readFileSync(claimFile))}};
  }
  const record=JSON.parse(bytes);
  if(['begin','cancel-uninvoked'].includes(operation)){
    if(record.contract!=='A1FrameToolBridgeClaim/v1'||!record.actions?.length)throw Error('FRAME_BRIDGE_DISPATCH_CLAIM');
    const items=record.actions.map(action=>updateUninvokedShotImagegenToolV1({repoRoot:root,taskId:record.taskId,nodeId:action.nodeId,
      inputSha256:action.request.inputSha256,requestSha256:action.request.requestSha256,workerId:action.workerId,operation,
      confirmedNotInvoked:operation==='cancel-uninvoked',reason:'Explicit current owner confirms no provider call was made; request must be corrected before another claim.'}));
    if(operation==='cancel-uninvoked')for(const phaseId of new Set(record.actions.map(action=>action.phaseId)))closeProductionPhaseV1({repoRoot:root,phaseId,outcome:'OWNER_CONFIRMED_CANCELLED_BEFORE_PROVIDER',actualClaimCount:0});
    const receipt={contract:'A1FrameToolBridgeDispatchReceipt/v1',operation,claim:{path:input,sha256},items,providerResubmitted:false,productionAdmission:false};
    const receiptFile=path.join(record.completionDirectory,operation+'-'+sha256+'.json');fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
    return {...receipt,receiptFile:{path:receiptFile,sha256:hash(fs.readFileSync(receiptFile))}};
  }
  if(operation!=='complete')throw Error('FRAME_BRIDGE_OPERATION');
  if(record.contract!=='A1FrameToolBridgeCompletion/v1'||!record.claimFile||!record.nodeId||!record.timing)throw Error('FRAME_BRIDGE_COMPLETION');
  const claimPath=fs.realpathSync(record.claimFile.path);
  if(!claimPath.startsWith(path.join(root,'work')+path.sep)||hash(fs.readFileSync(claimPath))!==record.claimFile.sha256)throw Error('FRAME_BRIDGE_CLAIM_CHANGED');
  const claim=JSON.parse(fs.readFileSync(claimPath)),action=claim.actions.find(a=>a.nodeId===record.nodeId);
  if(!action||path.dirname(input)!==claim.completionDirectory)throw Error('FRAME_BRIDGE_COMPLETION_OWNER');
  const output=fs.realpathSync(record.outputPath),generatedRoot=fs.realpathSync(claim.generatedRoot);
  if(!output.startsWith(generatedRoot+path.sep)||output!==path.resolve(record.outputPath)||path.extname(output)!=='.png')throw Error('FRAME_BRIDGE_OUTPUT_SCOPE');
  const start=Date.parse(record.timing.startedAt),returned=Date.parse(record.timing.providerReturnedAt);
  if(!Number.isFinite(start)||!Number.isFinite(returned)||returned<start||record.timing.providerElapsedMs!==returned-start)throw Error('FRAME_BRIDGE_TIMING');
  const result=await completeProductionFrameToolV1({repoRoot:root,toolAction:action,outputPath:output});
  const receipt={contract:'A1FrameToolBridgeReceipt/v1',nodeId:action.nodeId,phaseId:action.phaseId,outputPath:output,
    outputSha256:hash(fs.readFileSync(output)),timing:{...record.timing,receiptSavedAt:new Date().toISOString(),returnToReceiptMs:Date.now()-returned},
    result,providerResubmitted:false,productionAdmission:false};
  const receiptFile=path.join(claim.completionDirectory,'receipt-'+action.request.inputSha256+'.json');
  fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return {...receipt,receiptFile:{path:receiptFile,sha256:hash(fs.readFileSync(receiptFile))}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),get=n=>args[args.indexOf(n)+1];
  if(args.length===1&&args[0]==='--help')console.log('claim|begin|complete|cancel-uninvoked --file <work-local JSON> --sha <SHA256>; cancellation is explicit owner attestation before any provider call, never after an unknown response.');
  else {
    if(args.length!==5||!['claim','begin','complete','cancel-uninvoked'].includes(args[0])||args[1]!=='--file'||args[3]!=='--sha')throw Error('FRAME_BRIDGE_ARGUMENTS');
    const result=await runFrameToolBridgeV1({repoRoot:path.resolve(import.meta.dirname,'..'),operation:args[0],file:get('--file'),sha256:get('--sha')});
    console.log('A1_FRAME_TOOL_BRIDGE_JSON='+JSON.stringify(result));
  }
}
