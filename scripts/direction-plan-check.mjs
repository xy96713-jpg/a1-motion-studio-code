#!/usr/bin/env node
// Build-plan gate: decompose before building; missing assets block the direction.
import fs from 'node:fs'; import path from 'node:path';
const ROOT=process.cwd(); const read=(p)=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const opt=(a,k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
const project=opt(process.argv,'--project','banana-design'); const id=opt(process.argv,'--direction','A');
const board=read('work/recipe-board-v1/projects/'+project+'/design-board.json'); const d=(board.directions||[]).find(x=>x.id===id);
const errors=[]; if(!d) errors.push('direction missing'); const p=d?.buildPlan;
if(!p||p.contract!=='A1BuildPlan/v1') errors.push('buildPlan missing/A1BuildPlan/v1');
for(const k of ['composition','subject','camera','light','color','foregroundBackground','seam']) if(!p?.lookLock?.[k]||/TODO/i.test(String(p.lookLock[k]))) errors.push('lookLock.'+k+' missing');
if(!p?.reference||!fs.existsSync(path.join(ROOT,p.reference))) errors.push('reference missing');
if(!p?.assets?.length) errors.push('assets list missing');
if(!p?.occlusion||!Array.isArray(p.occlusion.layers)||p.occlusion.layers.length<3) errors.push('occlusion layers missing');
else for(const k of ['order','subjectBox','typeOwner','contact']) if(!p.occlusion[k]) errors.push('occlusion.'+k+' missing');
if(!p?.occlusion?.checks?.includes('objectMask')) errors.push('occlusion checks need objectMask');
if(!p?.referenceMetrics?.verdict) errors.push('referenceMetrics missing (composition study)');
if(!p?.sceneUnits) errors.push('sceneUnits missing (single vs bunch/hand review)');
else {
 if(p.sceneUnits.contract!=='A1SceneUnit/v1') errors.push('sceneUnits contract');
 if(!p.sceneUnits.source||!fs.existsSync(path.join(ROOT,p.sceneUnits.source))) errors.push('sceneUnits source missing');
 if(p.sceneUnits.unit==='bunch' && p.sceneUnits.sharedCrown!==true) errors.push('bunch unit must share one crown');
 if(p.sceneUnits.unit==='bunch' && !(Number(p.sceneUnits.fingersMin)>=2)) errors.push('bunch fingersMin must be >=2');
}
for(const a of p?.assets||[]) if(a.status!=='ready') errors.push('asset not ready: '+a.id+' ('+a.status+')');
if(p?.status!=='ready') errors.push('buildPlan status is '+p?.status);
console.log('PLAN GATE',id,errors.length?'FAIL':'PASS');for(const e of errors)console.log(' -',e);process.exit(errors.length?1:0);
