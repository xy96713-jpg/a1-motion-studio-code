#!/usr/bin/env node
// Measure a canary video. This is a mechanical preflight, not an aesthetic review.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
const ROOT=process.cwd();
const read=(p)=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const opt=(argv,k,d)=>{const i=argv.indexOf(k);return i>=0?argv[i+1]:d;};
const project=opt(process.argv,'--project','banana-design');
const cfg=read('work/recipe-board-v1/routing/quality-gates.json'); const t=cfg.thresholds;
const manifestPath='work/recipe-board-v1/projects/'+project+'/canaries/manifest.json';
const manifest=read(manifestPath); const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'a1-canary-'));
function frames(video,id){ const dir=path.join(tmp,id); fs.mkdirSync(dir,{recursive:true}); const r=spawnSync('ffmpeg',['-y','-loglevel','error','-i',path.join(ROOT,video),'-vf','fps='+t.sampleFps,path.join(dir,'f%03d.png')],{encoding:'utf8'}); if(r.status) throw new Error('ffmpeg '+id+': '+r.stderr.slice(-300)); return fs.readdirSync(dir).filter(f=>f.endsWith('.png')).sort().map(f=>path.join(dir,f)); }
async function stats(files){ let prev=null, diffs=[], acc={mean:0,std:0,dark:0,edge:0,clip:0,n:0}; for(const f of files){ const {data,info}=await sharp(f).resize(480,270,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true}); const n=info.width*info.height; let sum=0,sq=0,dark=0,clip=0,edge=0,cur=new Float32Array(n); for(let i=0;i<n;i++){ const r=data[i*3],g=data[i*3+1],b=data[i*3+2]; const l=(r*.2126+g*.7152+b*.0722)/255; cur[i]=l; sum+=l; sq+=l*l; if(l<.08) dark++; if(r>=252||g>=252||b>=252) clip++; if(i>=info.width+1){ const left=cur[i-1],up=cur[i-info.width]; edge+=Math.abs(l-left)+Math.abs(l-up); } } const mean=sum/n; acc.mean+=mean; acc.std+=Math.sqrt(Math.max(0,sq/n-mean*mean)); acc.dark+=dark/n; acc.clip+=clip/n; acc.edge+=edge/(n*2); acc.n++; if(prev){let d=0;for(let i=0;i<n;i++)d+=Math.abs(cur[i]-prev[i]);diffs.push(d/n);} prev=cur; } return {meanL:acc.mean/acc.n,stdL:acc.std/acc.n,darkPct:acc.dark/acc.n,clippedPct:acc.clip/acc.n,edge:acc.edge/acc.n,motionDiff:diffs.length?diffs.reduce((a,b)=>a+b,0)/diffs.length:0}; }
const out={contract:'A1CanaryQualityReport/v1',project,generatedAt:new Date().toISOString(),thresholds:t,canaries:[]};
for(const c of manifest.canaries){ const files=frames(c.video,c.id); const m=await stats(files); const errors=[]; if(m.meanL<t.minMeanL)errors.push('too dark (mean '+m.meanL.toFixed(3)+')'); if(m.meanL>t.maxMeanL)errors.push('too bright'); if(m.darkPct>t.maxDarkPct)errors.push('dark area '+(m.darkPct*100).toFixed(1)+'%'); if(m.stdL<t.minStdL)errors.push('flat contrast std '+m.stdL.toFixed(3)); if(m.edge<t.minEdge)errors.push('too few edges '+m.edge.toFixed(4)); if(m.clippedPct>t.maxClippedPct)errors.push('clipped '+(m.clippedPct*100).toFixed(1)+'%'); if(m.motionDiff<t.minMotionDiff)errors.push('dead motion '+m.motionDiff.toFixed(4)); out.canaries.push({id:c.id,effects:c.effects,metrics:m,verdict:errors.length?'fail':'pass',errors}); }
const outPath='work/recipe-board-v1/projects/'+project+'/canaries/quality.json'; fs.writeFileSync(path.join(ROOT,outPath),JSON.stringify(out,null,1)+'\n'); console.log('CANARY QUALITY: '+outPath); for(const c of out.canaries) console.log(c.id,c.verdict,JSON.stringify(c.metrics),c.errors.join('; '));
process.exit(out.canaries.every(c=>c.verdict==='pass')?0:1);
