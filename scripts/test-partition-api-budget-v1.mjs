import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from '../apps/studio-next/node_modules/sharp/lib/index.js';
import * as budget from '../apps/studio-next/src/lib/a1-partition-api-budget-v1.mjs';
assert.equal(typeof budget.withPartitionCapacity,'function');
let release;const barrier=new Promise(r=>release=r);let active=0,peak=0;
const job=()=>budget.withPartitionCapacity(async()=>{peak=Math.max(peak,++active);try{await barrier;}finally{active--;}});
const a=job(),b=job();await assert.rejects(job,/partition-capacity-exhausted/);release();await Promise.all([a,b]);assert.equal(peak,2);
await assert.rejects(()=>budget.withPartitionCapacity(()=>{throw Error('fixture');}),/fixture/);
await budget.withPartitionCapacity(async()=>{});
assert.deepEqual(budget.partitionApiError(Error('/private/secret JSON content')),{error:'partition-unavailable',status:503});
assert.deepEqual(budget.partitionApiError(Error('partition-workspace-binding')),{error:'partition-workspace-binding',status:409});
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'partition-budget-'));
try {const f=path.join(tmp,'small');fs.writeFileSync(f,'12345');assert.throws(()=>budget.readPartitionFile(f,4),/partition-file-too-large/);assert.throws(()=>budget.readPartitionFile(tmp,4),/partition-file-not-regular/);assert.equal(budget.readPartitionFile(f,5).length,5);
const png=await sharp({create:{width:3,height:2,channels:4,background:'#fff'}}).png().toBuffer();await assert.rejects(()=>budget.partitionImage(png,5),/partition-image/);await budget.partitionImage(png,6);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('PASS partition capacity, release, file and predecode budgets, safe errors');
