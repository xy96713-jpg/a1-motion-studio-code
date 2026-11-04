import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {applyStoryboard, needsRewrite} from '../apps/studio-next/src/lib/recipe-board/storyboard.mjs';
import {projectState, runProject} from '../apps/studio-next/src/lib/recipe-board/run.mjs';
import {writeShots} from '../apps/studio-next/src/lib/recipe-board/writer.mjs';
globalThis.fetch=async()=>{throw Error('network forbidden');};
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'storyboard-rewrite-'));
const cfg={dataDir:path.join(root,'data'),repoRoot:root,sourceRoot:root}, id='fixture', p=path.join(cfg.dataDir,'projects',id);
const put=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');};
const ev=[{kind:'person',entity:'A',what:'Alice',form:'photo',queryEn:'alice'}, {kind:'event',entity:'B',what:'Event',form:'video',queryEn:'event'}];
const d={beat:'B01',card:'footage-plate',seconds:4,hero:{action:'hold',at:0},camera:{move:'locked',amount:0},evidence:ev,scenes:[{card:'footage-plate',at:0,evidence:0},{card:'footage-plate',at:2,evidence:1}]};
const shot={shotId:'B01',recipe:'footage-plate',slots:{},scenes:[{slots:{}},{slots:{}}],design:{evidence:ev}};
try {
 for(const n of ['recipes','routing','themes','worlds']) fs.cpSync(path.resolve('work/recipe-board-v1',n),path.join(cfg.dataDir,n),{recursive:true});
 put(path.join(p,'project.json'),{id});
 put(path.join(p,'plan.json'),{title:'fixture',beats:[{id:'B01',text:'fixture',onScreen:{headline:'fixture',keywords:[]},route:{recipe:'footage-plate'},scenes:d.scenes.map(x=>({recipe:x.card,at:x.at,evidence:x.evidence})),evidence:ev}]});
 put(path.join(p,'shots/B01.json'),shot);
 for(const f of ['needs','candidates','approvals','bindings']) put(path.join(p,'materials',f+'.json'),{fixture:f});
 const files=['shots/B01.json',...['needs','candidates','approvals','bindings'].map(x=>'materials/'+x+'.json')];
 const snap=()=>files.map(f=>fs.readFileSync(path.join(p,f),'utf8'));
 const before=snap();
 const changed=structuredClone(d); changed.evidence[0].form='video';
 put(path.join(p,'storyboard.json'),{shots:[changed]});
 assert.deepEqual(applyStoryboard(cfg,id).redesign,['B01'],'form change must be detected');
 assert.deepEqual(projectState(cfg,id).redesign,['B01']);
 await assert.rejects(runProject(cfg,id,{from:'write',to:'write'}),/shot rewrite blocked/);
 assert.deepEqual(snap(),before);
 await assert.rejects(writeShots(cfg,id,{rewrite:true}),/shot rewrite blocked/);
 for(const mutate of [x=>x.evidence[0].queryEn='other',x=>{x.scenes[0].evidence=1;x.scenes[1].evidence=0;}]) {
  const x=structuredClone(d); mutate(x); put(path.join(p,'storyboard.json'),{shots:[x]});
  assert.deepEqual(applyStoryboard(cfg,id).redesign,['B01']);
  assert.deepEqual(projectState(cfg,id).redesign,['B01']);
  await assert.rejects(runProject(cfg,id,{from:'write',to:'write'}),/shot rewrite blocked/);
  assert.deepEqual(snap(),before);
 }
 assert.equal(needsRewrite({recipe:'footage-plate'}, {card:'footage-plate'}),false);
 // Unchanged legacy mapping is adopted once, then applying it is byte-stable.
 put(path.join(p,'storyboard.json'),{shots:[d]});
 assert.deepEqual(applyStoryboard(cfg,id).redesign,[]);
 const stable=snap();
 assert.deepEqual(applyStoryboard(cfg,id).redesign,[]);
 assert.deepEqual(snap(),stable);
 assert.deepEqual(projectState(cfg,id).redesign,[]);
 const legacy=structuredClone(d); legacy.evidence=legacy.evidence.map(({form,queryEn,...e})=>e);
 assert.equal(needsRewrite({...shot,design:{evidence:legacy.evidence}},legacy,d.scenes),false);
 // A beat with no existing shot can be applied and remains eligible for writer.
 const plan=JSON.parse(fs.readFileSync(path.join(p,'plan.json')));
 plan.beats.push({...plan.beats[0],id:'B02',route:{recipe:'footage-plate'}});
 put(path.join(p,'plan.json'),plan);
 put(path.join(p,'storyboard.json'),{shots:[d,{...d,beat:'B02'}]});
 assert.deepEqual(applyStoryboard(cfg,id).redesign,[]);
 assert.ok(projectState(cfg,id).unwritten.includes('B02'));
 assert.equal(fs.existsSync(path.join(p,'shots/B02.json')),false);
 console.log('isolated storyboard rewrite regression passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}
