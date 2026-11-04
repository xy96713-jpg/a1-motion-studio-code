#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import {readShotTaskRuntimeV1, runShotTaskActionV1, syncShotTaskRuntimeV1, claimShotImagegenToolV1, completeShotImagegenToolV1} from '../apps/studio-next/src/lib/a1-shot-task-runtime-v1.mjs';
const [taskId, action = 'status', nodeId, workerId, requestPath, outputPath] = process.argv.slice(2);
const options = {repoRoot: path.resolve(import.meta.dirname, '..'), taskId};
if(action==='package-person-content'){
  // nodeId position is the generic content request JSON, not a case-specific driver.
  const startedAtMs=Date.now(),request=JSON.parse(fs.readFileSync(nodeId,'utf8'));
  if(Object.keys(request).some(k=>!['taskId','content','motion'].includes(k)) || request.taskId!==taskId)throw Error('content-cli-request-invalid');
  const current=readShotTaskRuntimeV1(options);
  const result=await runShotTaskActionV1({...options,action,expectedPlanSha256:current.inputPlanSha256,content:request.content,motion:request.motion,
    ...(workerId||requestPath?{execution:{phasePath:workerId,phaseSha256:requestPath,startedAtMs,...(outputPath===undefined?{}:{totalDeadlineMs:Number(outputPath)})}}:{})});
  console.log(JSON.stringify({taskId,inputPlanSha256:result.inputPlanSha256,contentRequest:result.contentRequest},null,2));
  process.exit(0);
}
if (action === 'imagegen-claim') {
  console.log(JSON.stringify(claimShotImagegenToolV1({...options,nodeId,workerId}),null,2));
  process.exit(0);
}
if (action === 'imagegen-complete') {
  const request=JSON.parse(fs.readFileSync(requestPath,'utf8'));
  console.log(JSON.stringify(await completeShotImagegenToolV1({...options,nodeId,workerId,inputSha256:request.inputSha256,requestSha256:request.requestSha256,outputPath}),null,2));
  process.exit(0);
}
const result = action === 'status' ? readShotTaskRuntimeV1(options)
  : action === 'sync-plan' ? syncShotTaskRuntimeV1(options)
  : await runShotTaskActionV1({...options, action, nodeId, reviewerId: action === 'verify' ? 'technical-file-verifier' : undefined});
console.log(JSON.stringify({taskId, pending: result.pending, inputPlanSha256: result.inputPlanSha256,
  directorPlans: result.directorPlans || [], coverage: result.coverage, workflow: result.summary}, null, 2));
