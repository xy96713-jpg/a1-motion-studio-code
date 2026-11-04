import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyReusableFullFrameV1} from '../apps/studio-next/src/lib/a1-production-full-frame-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'legacy-reuse-'))),dir=path.join(root,'work','unseen');fs.mkdirSync(dir,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(name,value)=>{const file=path.join(dir,name),bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value));fs.writeFileSync(file,bytes);return {path:file,sha256:hash(bytes)};};
try{
  const image=save('frame.png','fixture-image');
  const result={productionAdmission:false,nativeRecording:false,rendered:[image]};
  const resultPin=save('static-result.json',result);
  const execution={workerCode:0,ownedProcessesClosed:true,productionAdmission:false,workerResultPath:resultPin.path};
  const executionPin=save('execution-receipt.json',execution);
  const review={contract:'A1IndependentCurrentVisualDeltaReview/v1',productionAdmission:false,actualPixels:true,mustFixCount:0,nativeRecording:false,
    anchor:{status:'PASS_APPROXIMATE_MAIN_STATIC_ANCHOR',candidate:image},currentFilePins:[image,resultPin,executionPin]};
  const check=r=>verifyReusableFullFrameV1({repoRoot:root,frame:{image,receipt:save('review.json',r)}});
  assert.deepEqual(check(review).image,image);
  assert.throws(()=>check({...review,mustFixCount:1}),/LEGACY_REVIEW_SCOPE/);
  assert.throws(()=>check({...review,nativeRecording:true}),/LEGACY_REVIEW_SCOPE/);
  assert.throws(()=>check({...review,currentFilePins:[image,executionPin]}),/LEGACY_EXECUTION_UNBOUND/);
  fs.appendFileSync(resultPin.path,' ');
  assert.throws(()=>check(review),/INPUT_BYTES_CHANGED/);
  save('static-result.json',result);
  const bad=save('execution-receipt.json',{...execution,ownedProcessesClosed:false});
  assert.throws(()=>check({...review,currentFilePins:[image,resultPin,bad]}),/LEGACY_EXECUTION_UNBOUND/);
  const other=save('static-result.json',{...result,rendered:[{...image,sha256:'0'.repeat(64)}]});
  const restored=save('execution-receipt.json',execution);
  assert.throws(()=>check({...review,currentFilePins:[image,other,restored]}),/LEGACY_EXECUTION_UNBOUND/);
  console.log('PASS legacy renderer reuse: actual image pins, execution closure, result identity and scope');
}finally{fs.rmSync(root,{recursive:true,force:true});}
