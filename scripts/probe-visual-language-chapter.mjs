#!/usr/bin/env node
// Real chapter runtimeCheck -> director/shot.html -> morph.js, isolated from every user project.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { runtimeCheck } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { pickDirectorDefaults, loadDirectorRoutes } from '../apps/studio-next/src/lib/recipe-board/directorroutes.mjs';
import { shoot, openPage } from '../work/recipe-board-v1/style-lab/engine/shoot.mjs';
const cfg=boardConfig(), id='visual-language-capability-fixture', root=path.join(cfg.dataDir,'projects',id);
const routeChoices=['signal','structure','editorial'].map(visualPurpose=>pickDirectorDefaults({visualPurpose},{table:loadDirectorRoutes(cfg)}));
const code=fs.readFileSync(path.join(root,'chapters/B01.mjs'),'utf8').replace(/const ids=\[[^\]]*\];/,`const ids=${JSON.stringify(routeChoices.map(p=>p.visualLanguages[0].id))};`);
const project={id,title:'Shared visual language integration fixture',testOnly:true,lettering:'eva',typeBible:true};
const put=(file,data)=>fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,2)+'\n');
put('project.json',project);
const shots=['辨認','逐層','重組'].map((text,i)=>({shotId:`B0${i+1}`,beat:`B0${i+1}`,at:i*2,dur:2,text,card:'morph-chapter'}));
put('storyboard.json',{shots:shots.map(s=>({...s,reads:[]}))});
put('plan.json',{beats:shots});
const g={id:'B01',total:6,shots};
const check=await runtimeCheck(cfg,id,g,code);
put('runtime-check.json',check);
assert.deepEqual(check.errors, [], 'formal chapter runtime checks');
assert.equal(check.keyframes.length,3,'formal chapter runtime produced all keyframes');
const shot=path.join(path.dirname(check.keyframes[0]),'check-shot.json');
const query=`shot=${encodeURIComponent('/'+path.relative(cfg.repoRoot,shot).split(path.sep).join('/'))}&fps=15&draft=1`;
const pageDir=path.join(cfg.dataDir,'style-lab/engine/director');
const session=await openPage({pageDir,page:'shot.html',query,variant:'clean'});
const receipts=[];
try {
 for (const t of [1,3,5,1]) receipts.push(await session.page.evaluate(t=>{window.renderAt(t);return window.__visualLanguageFixture;},t));
 assert.deepEqual(receipts.map(x=>x.id),['dither-relief','scan-sections','technical-editorial','dither-relief']);
 assert.deepEqual(receipts.slice(0,3).map(x=>x.id),routeChoices.map(p=>p.visualLanguages[0].id),'rendered selections consume the real semantic route shortlist');
 put('route-consumption.json',routeChoices);
 assert.deepEqual(receipts[0],receipts[3]);
 const variations = await session.page.evaluate(async () => {
   const {visualLanguage,visualLanguageIds}=await import('/work/recipe-board-v1/style-lab/engine/templates/visual-language.js');
   const c=document.createElement('canvas');c.width=480;c.height=270;const g=c.getContext('2d');
   return visualLanguageIds.map(id=>{
     const draw=(extra={})=>{g.clearRect(0,0,480,270);visualLanguage(g,{id,box:[0,0,480,270],...extra});return c.toDataURL();};
     const base=draw();
     const changed=[{palette:['#102030','#eab040','#ee5566']},{geometry:{center:[.3,.3],phase:1,slant:-.2}},{density:.4},{progress:.5}].map(v=>draw(v)!==base);
     return {id,changed,replay:draw()===base};
   });
 });
 assert.ok(variations.every(v=>v.replay && v.changed.every(Boolean)),JSON.stringify(variations));
 put('parameter-pixel-check.json',variations);
} finally {await session.close();}
const clips=await shoot({pageDir,page:'shot.html',mode:'video',variants:['clean'],query,tag:'shared-capabilities',outDir:path.join(root,'out/integration'),scale:.5});
put('integration-result.json',{entry:'chapter.runtimeCheck -> director/shot.html -> morph.js -> type.dev.visualLanguage',receipts,clips,keyframes:check.keyframes,errors:check.errors,warnings:check.warnings,note:'Technical fixture, not a mature first draft or gate approval.'});
console.log(JSON.stringify({clips,keyframes:check.keyframes,errors:check.errors,warnings:check.warnings},null,2));
