import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'reference-protection-'));
const pub='apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1',art='.codex-artifacts/system-progress-system-line';
const write=(p,v)=>{fs.mkdirSync(path.dirname(path.join(temp,p)),{recursive:true});fs.writeFileSync(path.join(temp,p),JSON.stringify(v));};
const sha=(v)=>createHash('sha256').update(Buffer.isBuffer(v)||typeof v==='string'?v:JSON.stringify(v)).digest('hex');
try{
 fs.mkdirSync(path.join(temp,'scripts'));fs.copyFileSync(path.join(root,'scripts/plan-system-line-superseded-media-quarantine-v1.mjs'),path.join(temp,'scripts/plan-system-line-superseded-media-quarantine-v1.mjs'));
 const roles=['selected','candidate','upstream','history','rollback','unreferenced','mirrored'];const candidates=roles.map(id=>({id,path:`${pub}/${id}`,exists:true,bytes:2,files:1,reason:'isolated fixture'}));
 candidates.push({id:'already-absent',path:`${pub}/already-absent`,exists:false,bytes:0,files:0,reason:'prior quarantine'});
 for(const c of candidates.filter(c=>c.exists))write(`${c.path}/asset.json`,{});
 write(`${art}/editorial-asset-workbench-v1/mirrored/asset.json`,{});
 const url=id=>`/generated/system-line/editorial-asset-workbench-v1/${id}/asset.json`;
 write(`${pub}/workspace.json`,{workspaceSha256:'a'.repeat(64),production:{currentVisualDecisionLedger:{ledgerSha256:'c'.repeat(64)}},motionReviewReceipt:{video:{publicUrl:url('selected')}},motionReviewPlan:{viewerReview:{repairCandidate:{video:{publicUrl:url('candidate')}}},productionBaseline:{packagingBaseline:{path:`${pub}/upstream/asset.json`}}},motionReviewReceiptHistory:[{video:{publicUrl:url('history')}}],recoverySnapshot:{path:`${pub}/rollback/asset.json`}});
 const workspaceBytes=fs.readFileSync(path.join(temp,`${pub}/workspace.json`));
 write(`${art}/cleanup-candidates-v1/report.json`,{contract:'A1SystemLineCleanupCandidateInventory/v1',createdAt:new Date().toISOString(),deletionPerformed:false,movePerformed:false,
  sourceWorkspaceSha256:'a'.repeat(64),sourcePhaseWorkspaceSha256:'a'.repeat(64),sourceAuthorityWorkspaceSha256:'a'.repeat(64),sourceWorkspaceFileSha256:sha(workspaceBytes),candidateInventorySha256:sha(candidates),candidates});
 write(`${pub}/current-visual-decision-ledger-v1/ledger.json`,{});
 write(`${art}/current-phase.json`,{authority:{workspaceSha256:'a'.repeat(64)}});
 write(`${art}/system-line-current-authority-v2/audit-report.json`,{authority:{workspaceSha256:'a'.repeat(64)}});
 const run=spawnSync(process.execPath,['scripts/plan-system-line-superseded-media-quarantine-v1.mjs'],{cwd:temp,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const plan=JSON.parse(fs.readFileSync(path.join(temp,art,'superseded-media-quarantine-v1/plan.json')));
 assert.equal(plan.blockedCount,6);assert.equal(plan.safeCount,1);assert.equal(plan.absentCount,1);
 assert.match(plan.entries.find(e=>e.id==='unreferenced').inventorySha256,/^[a-f0-9]{64}$/u);
 for(const e of plan.entries){assert.equal(e.status,e.id==='unreferenced'?'SAFE_RECOVERABLE_QUARANTINE':e.id==='already-absent'?'ALREADY_ABSENT':e.id==='mirrored'?'BLOCKED_MIRROR_PARITY':'BLOCKED_CURRENT_REFERENCE');}
 assert.equal(plan.deleted,false);
 fs.copyFileSync(path.join(root,'scripts/apply-system-line-superseded-media-quarantine-v1.mjs'),path.join(temp,'scripts/apply-system-line-superseded-media-quarantine-v1.mjs'));
 fs.copyFileSync(path.join(root,'scripts/restore-system-line-superseded-media-quarantine-v1.mjs'),path.join(temp,'scripts/restore-system-line-superseded-media-quarantine-v1.mjs'));
 const stub=path.join(temp,'apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs');fs.mkdirSync(path.dirname(stub),{recursive:true});
 fs.writeFileSync(stub,`import fs from 'node:fs';import path from 'node:path';export function readProjectWorkspace(appRoot){return JSON.parse(fs.readFileSync(path.join(appRoot,'public/generated/system-line/editorial-asset-workbench-v1/workspace.json'),'utf8'));}`);
 const applied=spawnSync(process.execPath,['scripts/apply-system-line-superseded-media-quarantine-v1.mjs'],{cwd:temp,encoding:'utf8',env:{...process.env,A1_MEDIA_QUARANTINE_PLAN_SHA256:plan.planSha256,A1_MEDIA_QUARANTINE_APPLY_APPROVED:'1'}});
 assert.equal(applied.status,0,applied.stderr);
 const receipt=JSON.parse(fs.readFileSync(path.join(temp,art,'superseded-media-quarantine-v1/apply-receipt.json')));
 assert.equal(receipt.movedEntryCount,1);assert.equal(receipt.deleted,false);assert.equal(receipt.recoverable,true);
 assert.ok(!fs.existsSync(path.join(temp,`${pub}/unreferenced`)));
 const restored=spawnSync(process.execPath,['scripts/restore-system-line-superseded-media-quarantine-v1.mjs'],{cwd:temp,encoding:'utf8',env:{...process.env,A1_MEDIA_QUARANTINE_RECEIPT:path.join(temp,receipt.quarantineRoot,'quarantine-receipt.json'),A1_MEDIA_QUARANTINE_RESTORE_APPROVED:'1'}});
 assert.equal(restored.status,0,restored.stderr);assert.ok(fs.existsSync(path.join(temp,`${pub}/unreferenced/asset.json`)));
 const stale=JSON.parse(fs.readFileSync(path.join(temp,art,'cleanup-candidates-v1/report.json')));stale.sourceWorkspaceSha256='b'.repeat(64);
 write(`${art}/cleanup-candidates-v1/report.json`,stale);
 const rejected=spawnSync(process.execPath,['scripts/plan-system-line-superseded-media-quarantine-v1.mjs'],{cwd:temp,encoding:'utf8'});
 assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/cleanup-inventory-stale-or-invalid/);
 console.log('PASS cleanup planner and reversible apply: current SHA, exact bytes, references, mirror, absent prior quarantine, stale report rejection, content-checked restore; no deletion');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
