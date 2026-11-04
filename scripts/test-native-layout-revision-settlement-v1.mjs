import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{createHash}from'node:crypto';
import{nodeInputHash}from'../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
import{prepareNativeLayoutRevisionSettlementV1}from'../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
import{productionRevisionSettlementOnlyV1}from'../apps/studio-next/src/lib/a1-production-batch-registration-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'native-revision-'))),taskId='fixture',dir=path.join(root,'work',taskId);fs.mkdirSync(dir,{recursive:true});
const save=(name,v)=>{const f=path.join(dir,name),b=Buffer.from(JSON.stringify(v));fs.writeFileSync(f,b);return{path:path.relative(root,f),sha256:createHash('sha256').update(b).digest('hex')};};
try{
 const old={id:'scene',exactCopy:['Source title'],productionRevisionRequest:{requestId:'a'.repeat(64),status:'OPEN',states:['ENTRY']}};
 const design={productionLayout:{states:[{state:'ENTRY',layers:[]}]},productionResources:{assets:[],fonts:[]},referenceProductionDesign:{states:[{state:'ENTRY'}]},typographyDirections:[]};
 const input=save('native.json',{contract:'A1SourceBoundNativeLayoutInput/v1',taskId,shotId:'scene',baseShotSha256:nodeInputHash(old),expectedExactCopySha256:nodeInputHash(old.exactCopy),selectedNativeStates:['ENTRY'],...design});
 const before=save('before.json',{shots:[old]}),plan={shots:[{...old,...design,sourceNativeLayoutBinding:{contract:'A1SourceBoundNativeLayoutBinding/v1',input,nativeStates:['ENTRY']}}]};
 const args={repoRoot:root,taskId,plan,shotId:'scene',nativeInput:input,sourcePlan:before},r=prepareNativeLayoutRevisionSettlementV1(args);
 assert.equal(r.plan.shots[0].productionRevisionRequest.status,'DESIGN_BOUND');assert.equal(plan.shots[0].productionRevisionRequest.status,'OPEN');
 assert.equal(productionRevisionSettlementOnlyV1(plan,r.plan),true,'only request status changes, so unchanged-pixel review reconciliation remains possible');
 assert.equal(r.assignment.visualApproval,false);assert.equal(r.assignment.productionAdmission,false);
 for(const mutate of [p=>p.shots[0].productionRevisionRequest.requestId='b'.repeat(64),p=>p.shots[0].exactCopy=['Changed'],p=>p.shots[0].productionLayout.states[0].layers=[{changed:true}],p=>p.shots[0].productionRevisionRequest.states=['HOLD']]){const p=structuredClone(plan);mutate(p);assert.throws(()=>prepareNativeLayoutRevisionSettlementV1({...args,plan:p}),/SETTLEMENT_/);}
 console.log('PASS native revision settlement requires the original request, unchanged bound design/copy and source snapshot; grants no pixel or production approval.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
