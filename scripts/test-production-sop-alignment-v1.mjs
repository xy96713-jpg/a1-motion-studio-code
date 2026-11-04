import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const operations=JSON.parse(execFileSync(process.execPath,['scripts/run-production-batch-v1.mjs','--list-operations'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const file='docs/A1_ARTICLE_MOTION_PRODUCTION_SOP.md',sop=fs.readFileSync(file,'utf8');
assert.deepEqual([...sop.matchAll(/^\| `([^`]+)` \|/gm)].map(m=>m[1]),operations.map(o=>o.operation),'documentation and actual dispatcher must use the same operation set');
assert.ok(sop.split('\n').length<180,'normal SOP remains bounded');
assert.ok(sop.includes('关卡为 false 时，不进入 Assembly'));
assert.ok(sop.includes('固定三态仅供旧任务兼容'));
assert.ok(sop.includes('assetOutputs')&&sop.includes('newClaims=0'));
assert.ok(!sop.includes('generate two to four complete Look Masters'));
assert.ok(!sop.includes('A user-facing static-board gate may remain pending while the isolated'));
for(const match of sop.matchAll(/\]\(([^\s)]+)\)/g)){
 const target=match[1].split('#')[0];if(!target||target.includes('://'))continue;
 assert.ok(fs.existsSync(path.resolve(path.dirname(file),target)),target);
}
console.log('PASS current SOP boundaries, backward compatibility, operation-table parity and local references.');
