import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readResearchResourceObservationV1} from '../apps/studio-next/src/lib/a1-research-resource-observation-v1.mjs';
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'a1-receipt-observation-')));
try {
 const directory=path.join(root,'work/module-development-launch-v1/resource-reservations'),run=path.join(root,'work/current-run');
 fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(run);
 const phase=path.join(directory,'phase-activation-test.json'),receipt=path.join(run,'execution-receipt.json');
 const record={status:'ACTIVE',shotId:'UNSEEN',ownerThreadId:'owner',actualClaimCount:0,readyPath:path.join(run,'FINAL-READY.json'),reservationEndUTC:'2020-01-01T00:00:00Z'};
 fs.writeFileSync(phase,JSON.stringify(record));
 const read=()=>readResearchResourceObservationV1({repoRoot:root,shotIds:['UNSEEN']});
 assert.equal(read().phases[0].state,'EXPIRED_UNCLOSED');
 fs.writeFileSync(receipt,JSON.stringify({phaseSHA:createHash('sha256').update(fs.readFileSync(phase)).digest('hex'),ownedProcessesClosed:true}));
 let observed=read();assert.equal(observed.phases[0].state,'EXECUTION_RECEIPT_REQUIRES_RECONCILIATION');assert.equal(observed.phases[0].executionReceipt.phaseBound,true);assert.equal(observed.processClosureVerified,false);assert.equal(observed.dispatchAuthorized,false);
 fs.writeFileSync(receipt,JSON.stringify({phaseSHA:'wrong'}));assert.equal(read().phases[0].executionReceipt.status,'PRESENT_UNVERIFIED');
 fs.writeFileSync(phase,JSON.stringify({...record,status:'COMPLETED_CLOSED_RELEASED'}));assert.equal(read().phases.length,0);
 console.log('PASS: stale zero-claim metadata cannot hide an existing receipt; no inferred closure or permission');
} finally {fs.rmSync(root,{recursive:true,force:true});}
