#!/usr/bin/env node
// Composition match gate: SSIM + luminance/negative-space/edge/overexposure, one command.
import fs from 'node:fs'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareFiles } from './look-lock-check.mjs';
const ROOT=process.cwd();
const read=(p)=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const opt=(a,k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
const project=opt(process.argv,'--project','banana-design'); const dir=opt(process.argv,'--direction','A'); const render=opt(process.argv,'--render');
const board=read('work/recipe-board-v1/projects/'+project+'/design-board.json'); const d=(board.directions||[]).find(x=>x.id===dir);
if(!d){console.error('LOOK MATCH FAIL: direction missing '+dir);process.exit(1);} 
if(!board.selected) {console.error('LOOK MATCH FAIL: no user-selected direction');process.exit(1);} 
const ref=(board.lookLock&&board.lookLock.reference)||d.reference; if(!ref){console.error('LOOK MATCH FAIL: no reference');process.exit(1);} 
if(!render){console.error('LOOK MATCH FAIL: --render required');process.exit(1);} 
const outDir=path.join(ROOT,'work/recipe-board-v1/projects/'+project+'/out/look-match'); fs.mkdirSync(outDir,{recursive:true});
const compPath=path.join(outDir,dir+'-composition.json');
const c=spawnSync(process.execPath,[path.join(ROOT,'scripts/reference-metrics.mjs'),'--reference',path.join(ROOT,ref),'--render',path.join(ROOT,render),'--out',compPath],{cwd:ROOT,encoding:'utf8'});
let comp=null; try{comp=JSON.parse(fs.readFileSync(compPath,'utf8'));}catch{}
const r=compareFiles(path.join(ROOT,ref),path.join(ROOT,render),{minSsim:0.55});
const errors=[...(r.errors||[])];
if(!comp||comp.verdict!=='pass') errors.push('composition '+(comp?comp.verdict:'missing')+' '+JSON.stringify(comp?.delta||{}));
const ok=r.ok && comp?.verdict==='pass';
const out={contract:'A1LookMatch/v1',project,direction:dir,reference:ref,render,minSsim:0.55,ssim:r.ssim,composition:comp?{verdict:comp.verdict,delta:comp.delta,file:path.relative(ROOT,compPath)}:null,verdict:ok?'pass':'fail',errors,rule:'SSIM + composition must both pass; mismatch is returned'};
const p=path.join(outDir,dir+'.json'); fs.writeFileSync(p,JSON.stringify(out,null,1)+'\n'); console.log('LOOK MATCH',dir,ok?'pass':'fail','ssim',r.ssim,'composition',comp?.verdict,p); if(!ok){for(const e of errors)console.log(' -',e);} process.exit(ok?0:1);
