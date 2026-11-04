#!/usr/bin/env node
// Asset gap report: what the selected direction still lacks before it can render.
import fs from 'node:fs'; import path from 'node:path';
const ROOT=process.cwd(); const opt=(a,k,d)=>{const i=a.indexOf(k);return i>=0?a[i+1]:d;};
const project=opt(process.argv,'--project','banana-design'); const board=JSON.parse(fs.readFileSync(path.join(ROOT,'work/recipe-board-v1/projects/'+project+'/design-board.json'),'utf8'));
const id=board.selected; const d=(board.directions||[]).find(x=>x.id===id); if(!d){console.error('no selected direction');process.exit(2);} 
const p=d.buildPlan||{}; const missing=(p.assets||[]).filter(a=>a.status!=='ready');
console.log('ASSET GAPS',project,id,p.status||'no-plan');
for(const a of missing)console.log(' -',a.id,a.status||'missing','—',a.need||'');
if(p.gaps)for(const g of p.gaps)console.log(' *',g);
if(!missing.length&&p.status==='ready'){console.log('READY');process.exit(0);}process.exit(1);
