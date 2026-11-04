import fs from 'node:fs';
import os from 'node:os';
import {planIdentity} from '../apps/studio-next/src/lib/a1-package-look-master-v1.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {runSingleShotPartitionDryRun as run} from '../apps/studio-next/src/lib/a1-single-shot-partition-server-v1.mjs';
import {partitionSha as sha} from '../apps/studio-next/src/lib/a1-single-shot-partition-dry-run-v1.mjs';
const root=process.cwd(), temp=fs.mkdtempSync(path.join(os.tmpdir(),'partition-files-'));
const wp='apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json', pp='.codex-artifacts/system-progress-system-line/current-phase.json', mp='work/ed17-approved-version-recovery/layer-reuse-map.json';
const w=JSON.parse(fs.readFileSync(wp)), m=JSON.parse(fs.readFileSync(mp)), rt=w.production.shotIntelligence;
const source=m.sourceDifference.current.path;
const files=[wp,pp,mp,source,...m.layers.filter(x=>x.path).map(x=>x.path),'apps/studio-next/public'+rt.wholeFilmStaticBoard.publicUrl];
const originals=new Map(files.map(f=>[f,fs.readFileSync(f)]));
// Isolated coherent fixture only: live authority is intentionally never repaired.
const fixture=JSON.parse(originals.get(wp));
const frt=fixture.production.shotIntelligence;
// Real cross-contract identity: never coerce the kit SHA to the look-master SHA.
originals.set(wp,Buffer.from(JSON.stringify(fixture)));
const fixturePhase=JSON.parse(originals.get(pp));fixturePhase.authority.workspaceFileSha256=sha(originals.get(wp));originals.set(pp,Buffer.from(JSON.stringify(fixturePhase)));
const put=(f,b)=>{fs.mkdirSync(path.dirname(path.join(temp,f)),{recursive:true});fs.writeFileSync(path.join(temp,f),b);};
const reset=()=>{for(const [f,b] of originals)put(f,b);};
const request={action:'dry-run-package-layer-partition',shotId:'ED-17',workspaceSha256:w.workspaceSha256};
const change=(f,fn)=>{const v=JSON.parse(fs.readFileSync(path.join(temp,f)));fn(v);put(f,JSON.stringify(v));};
// Keep phase file identity accurate so deeper identity tests reach their seam.
const bindPhase=()=>change(pp,p=>p.authority.workspaceFileSha256=sha(fs.readFileSync(path.join(temp,wp))));
let count=0;
try {
 reset(); const good=await run(temp,request);assert.equal(good.exactRgbaRecomposition,true);assert.equal(good.admission.allowed,false);count++;
 reset();change(wp,v=>v.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId==='ED-17').artifactSha256='a'.repeat(64));bindPhase();
 await assert.rejects(()=>run(temp,request),/partition-current-storyboard-binding/);count++;
 const negative=async(name,mutate,pattern)=>{reset();await mutate();await assert.rejects(()=>run(temp,request),pattern,name);count++;};
 await negative('phase byte identity',()=>change(pp,p=>p.authority.workspaceFileSha256='a'.repeat(64)),/partition-workspace-binding/);
 await negative('source bytes',()=>put(source,Buffer.from('changed')),/partition-source-binding/);
 await negative('mask bytes',()=>put(m.layers[0].path,Buffer.from('changed')),/partition-mask-binding/);
 await negative('manifest bytes',()=>put(mp,Buffer.from('{}')),/partition-mask-manifest-binding/);
 await negative('board bytes',()=>put('apps/studio-next/public'+rt.wholeFilmStaticBoard.publicUrl,Buffer.from('changed')),/partition-board-file-binding/);
 await negative('approval',()=>{change(wp,v=>v.production.shotIntelligence.wholeFilmStaticBoard.approvalAuthoritySha256='a'.repeat(64));bindPhase();},/partition-stale-approval-binding/);
 await negative('phase board',()=>change(pp,p=>p.boardReview.boardSha256='a'.repeat(64)),/partition-stale-approval-binding/);
 await negative('duplicate plan',()=>{change(wp,v=>{const a=v.production.shotIntelligence.packageAssetKitPlans;a.push(a.find(p=>p.shotId==='ED-17'&&p.current));});bindPhase();},/partition-current-plan-required/);
 await negative('new current plan with old approved board',()=>{change(wp,v=>v.production.shotIntelligence.packageAssetKitPlans.find(p=>p.shotId==='ED-17'&&p.current).planSha256='d'.repeat(64));bindPhase();},/partition-stale-approval-binding/);
 for(const key of ['board','seed'])await negative('duplicate '+key,()=>{change(wp,v=>{const rt=v.production.shotIntelligence;const a=key==='board'?rt.wholeFilmStaticBoard.items:rt.wholeFilmStaticBoardDecision.boardDecisionSeed;a.push(a.find(x=>x.shotId==='ED-17'));});bindPhase();},/partition-approval-item-required/);
 await negative('malformed equal plan SHAs',()=>{change(wp,v=>{const rt=v.production.shotIntelligence;for(const a of [rt.packageAssetKitPlans,rt.wholeFilmStaticBoard.items,rt.wholeFilmStaticBoardDecision.boardDecisionSeed])for(const x of a)if(x.shotId==='ED-17')x.planSha256='not-a-sha';});bindPhase();},/partition-stale-approval-binding/);
 await negative('changed visual field retaining SHA',()=>{change(wp,v=>v.production.shotIntelligence.packageLookMasterPlans.find(p=>p.shotId==='ED-17').semanticJob='UNAPPROVED NEW DESIGN');bindPhase();},/partition-stale-approval-binding/);
 await negative('new visual plan with recomputed SHA',()=>{change(wp,v=>{const p=v.production.shotIntelligence.packageLookMasterPlans.find(p=>p.shotId==='ED-17');p.semanticJob='UNAPPROVED NEW DESIGN';p.planSha256=sha(planIdentity(p));});bindPhase();},/partition-stale-approval-binding/);
 await negative('changed selected candidate',()=>{change(wp,v=>v.production.shotIntelligence.packageLookMasterPlans.find(p=>p.shotId==='ED-17').provisionalWholeFilmBoardSelection.candidateId='new');bindPhase();},/partition-stale-approval-binding/);
 reset();change(wp,v=>v.production.shotIntelligence.packageLookMasterPlans.find(p=>p.shotId==='ED-17').reviewDecision={diagnosticNote:'nonvisual review metadata'});bindPhase();assert.equal((await run(temp,request)).admission.allowed,false);count++;
 reset();await assert.rejects(()=>run(temp,{...request,audit:{status:'PASS'}}),/partition-client-evidence-forbidden/);count++;
 for(const url of ['/generated/../workspace.json','/generated/%2e%2e/workspace.json','https://example.org/a.png','//example.org/a.png']) {
 await negative(url,()=>{change(wp,v=>{const r=v.production.shotIntelligence;r.packageAssetKitPlans.find(p=>p.shotId==='ED-17'&&p.current).selectedLookMasterBinding.artifactPublicUrl=url;r.currentStoryboardAuthority.shots.find(s=>s.shotId==='ED-17').artifactPublicUrl=url;});bindPhase();},/partition-path/);
 }
 reset();const target=path.join(temp,source);const outside=path.join(temp,'outside.png');fs.writeFileSync(outside,originals.get(source));fs.unlinkSync(target);fs.symlinkSync(outside,target);
 await assert.rejects(()=>run(temp,request),/partition-path/);count++;fs.unlinkSync(target);fs.unlinkSync(outside);
 // Deterministic race: mutate an already-read input on the next real filesystem read.
 reset();const originalRead=fs.readSync;let changed=false;const sourceStat=fs.statSync(path.join(temp,source));
 fs.readSync=function(fd,...args){const bytes=originalRead.call(this,fd,...args);const stat=fs.fstatSync(fd);if(stat.ino===sourceStat.ino&&stat.dev===sourceStat.dev&&!changed){changed=true;fs.appendFileSync(path.join(temp,pp),' ');}return bytes;};
 try {await assert.rejects(()=>run(temp,request),/partition-input-changed-during-dry-run/);count++;assert.equal(changed,true);}finally{fs.readSync=originalRead;}
 reset();for(const [f,b] of originals)assert.deepEqual(fs.readFileSync(path.join(temp,f)),b);
 reset();change(wp,v=>{const r=v.production.shotIntelligence;for(const a of [r.packageAssetKitPlans,r.wholeFilmStaticBoard.items,r.wholeFilmStaticBoardDecision.boardDecisionSeed,r.currentStoryboardAuthority.shots,r.packageLookMasterPlans,r.packageAssemblyRecipes])for(const x of a)if(x.shotId==='ED-17')x.shotId='TEST-SHOT';
 const master=r.packageLookMasterPlans.find(p=>p.shotId==='TEST-SHOT');master.planSha256=sha(planIdentity(master));
 for(const a of [r.wholeFilmStaticBoard.items,r.wholeFilmStaticBoardDecision.boardDecisionSeed])a.find(p=>p.shotId==='TEST-SHOT').planSha256=master.planSha256;
 r.packageAssetKitPlans.find(p=>p.shotId==='TEST-SHOT'&&p.current).selectedLookMasterBinding.lookMasterPlanSha256=master.planSha256;
 });bindPhase();
 const generic=await run(temp,{...request,shotId:'TEST-SHOT'});assert.equal(generic.admission.allowed,false);count++;
 console.log(`PASS isolated real-file server checks: ${count}`);
} finally {fs.rmSync(temp,{recursive:true,force:true});}
