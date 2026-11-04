import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {withReadonlyDocumentCacheV1,reuseReadonlyDocumentSyncV1,readonlyDocumentMetricsV1,readonlyDocumentHashV1} from '../apps/studio-next/src/lib/a1-readonly-document-cache-v1.mjs';
import {nodeInputHash} from '../apps/studio-next/src/lib/a1-node-workflow-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-read-doc-'))),file=path.join(root,'plan.json');fs.writeFileSync(file,JSON.stringify({value:1,history:[{old:true}]}));let loads=0,checks=0;
const load=()=>{loads++;return JSON.parse(fs.readFileSync(file,'utf8'));};const read=()=>reuseReadonlyDocumentSyncV1(file,'JSON_SIZE_POLICY_v1',load);
try{
 await withReadonlyDocumentCacheV1(async()=>{const a=read();assert.equal(readonlyDocumentHashV1(a),nodeInputHash(a));assert.throws(()=>a.history.push({old:false}));assert.deepEqual(readonlyDocumentMetricsV1(),{documentReads:1,documentHits:0,documentBytesRead:fs.statSync(file).size});checks+=3;});
 await withReadonlyDocumentCacheV1(()=>{assert.equal(read().value,1);assert.equal(readonlyDocumentMetricsV1().documentHits,1);checks+=2;});assert.equal(loads,1);checks++;
 read();assert.equal(loads,2,'outside GET always calls original loader');checks++;
 const timestamp=fs.statSync(file).mtime;fs.writeFileSync(file,JSON.stringify({value:2,history:[{old:true}]}));fs.utimesSync(file,timestamp,timestamp);
 await withReadonlyDocumentCacheV1(()=>{assert.equal(read().value,2);assert.equal(readonlyDocumentMetricsV1().documentReads,1);checks+=2;});
 await assert.rejects(withReadonlyDocumentCacheV1(async()=>{read();fs.writeFileSync(file,JSON.stringify({value:3}));}),/CHANGED_DURING_RESPONSE/);checks++;
 await withReadonlyDocumentCacheV1(()=>{assert.equal(read().value,3);checks++;});
 const replacement=path.join(root,'new.json');fs.writeFileSync(replacement,JSON.stringify({value:4}));fs.renameSync(replacement,file);await withReadonlyDocumentCacheV1(()=>{assert.equal(read().value,4);checks++;});
 fs.unlinkSync(file);fs.symlinkSync(replacement,file);await assert.rejects(withReadonlyDocumentCacheV1(()=>read()));checks++;fs.unlinkSync(file);fs.writeFileSync(file,'{bad');await assert.rejects(withReadonlyDocumentCacheV1(()=>read()));checks++;
 fs.writeFileSync(file,JSON.stringify({value:5}));await withReadonlyDocumentCacheV1(()=>{assert.equal(read().value,5);checks++;});
 const external=Object.freeze({nested:{value:1}}),oldHash=readonlyDocumentHashV1(external);external.nested.value=2;assert.notEqual(readonlyDocumentHashV1(external),oldHash,'externally shallow frozen input never receives hash trust');checks++;
 console.log(JSON.stringify({status:'PASS',checks,scope:'READ_ONLY_DOCUMENT_IDENTITY; NO_MEDIA_APPROVAL_CACHE'}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
