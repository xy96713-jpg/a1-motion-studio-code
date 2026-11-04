import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { runProject, STAGES } from '../apps/studio-next/src/lib/recipe-board/run.mjs';
import { acceptedFilmDesign } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
import { renderInputs, stillsReady } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
const source = boardConfig({ RECIPE_BOARD_REPO_ROOT: process.cwd(), RECIPE_BOARD_NAS_OUTPUT_ROOT: '' });
const read = f => JSON.parse(fs.readFileSync(f));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
function snapshot(root) {
  const out = {};
  const walk = (dir, rel = '') => { for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const r = path.join(rel,e.name), f = path.join(dir,e.name);
    if(e.isDirectory()) walk(f,r); else if(e.isFile()) out[r] = sha(fs.readFileSync(f));
  }};
  walk(root); return out;
}
function fixture() {
  const base = path.join(process.env.HOME,'.hermes/cache/scratch'); fs.mkdirSync(base,{recursive:true});
  const root = fs.mkdtempSync(path.join(base,'run-whole-stills-'));
  const cfg = boardConfig({RECIPE_BOARD_REPO_ROOT:root,RECIPE_BOARD_SOURCE_ROOT:process.cwd(),RECIPE_BOARD_NAS_OUTPUT_ROOT:''});
  const id='banana-design', src=path.join(source.dataDir,'projects',id), dir=path.join(cfg.dataDir,'projects',id);
  fs.mkdirSync(path.join(dir,'tasks'),{recursive:true});
  for(const name of ['project.json','plan.json','storyboard.json','style.json','design.json','shots']) if(fs.existsSync(path.join(src,name))) fs.cpSync(path.join(src,name),path.join(dir,name),{recursive:true});
  fs.mkdirSync(path.join(dir,'materials'),{recursive:true});
  for(const name of fs.readdirSync(path.join(src,'materials')).filter(n=>n.endsWith('.json'))) fs.copyFileSync(path.join(src,'materials',name),path.join(dir,'materials',name));
  for(const name of ['filmdesign.answer.json','filmdesign.check.json','filmdesign.task.json']) fs.copyFileSync(path.join(src,'tasks',name),path.join(dir,'tasks',name));
  for(const name of ['routing','recipes','themes','prompts','worlds']) fs.symlinkSync(path.join(source.dataDir,name),path.join(cfg.dataDir,name));
  const project={...read(path.join(dir,'project.json')),scope:'STILLS_ONLY',stillsCoverage:'whole-film'};
  // The historical user approval is copied fixture state, NEVER a new approval.
  const put=()=>fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(project)); put();
  const logs=[];
  // Normal run entry and existing stage range; no separate test pipeline.
  const run=(options={})=>runProject(cfg,id,{from:'chapter',to:'chapter',log:l=>logs.push(l),...options});
  return {root,cfg,id,src,dir,project,put,logs,run};
}
test('normal run refreshes explicit whole-film stills after historical design approval without reopening gates',async()=>{
  const f=fixture(), before=snapshot(f.src);
  try {
    assert.ok(acceptedFilmDesign(f.cfg,f.id),'real historical accepted design is required');
    assert.equal(f.project.design.approved,true);
    const projectBytes=fs.readFileSync(path.join(f.dir,'project.json'),'utf8');
    const result=await f.run(); assert.deepEqual(result.failures,[]);
    const taskFile=path.join(f.dir,'tasks/stills.task.json');
    assert.ok(fs.existsSync(taskFile),'approved STILLS_ONLY whole-film must schedule native stepStills');
    const task=read(taskFile);assert.equal(task.input.beats.length,20);
    assert.deepEqual(task.input.beats.map(b=>b.shotId),read(path.join(f.dir,'storyboard.json')).shots.map(b=>b.beat));
    const taskBytes=fs.readFileSync(taskFile,'utf8'), key=renderInputs(f.cfg,f.id,{}).find(x=>x.path===taskFile)?.hash;
    assert.ok(key);await f.run();assert.equal(fs.readFileSync(taskFile,'utf8'),taskBytes);
    assert.equal(renderInputs(f.cfg,f.id,{}).find(x=>x.path===taskFile)?.hash,key);
    const planFile=path.join(f.dir,'plan.json'), plan=read(planFile);
    plan.beats[0].text+='（隔离输入绑定测试）'; fs.writeFileSync(planFile,JSON.stringify(plan));
    await f.run();assert.notEqual(read(taskFile).inputHash,task.inputHash);
    assert.notEqual(renderInputs(f.cfg,f.id,{}).find(x=>x.path===taskFile)?.hash,key);
    assert.equal(fs.readFileSync(path.join(f.dir,'project.json'),'utf8'),projectBytes,'user gate state must stay byte-identical');
    assert.equal(stillsReady(f.cfg,f.id),false,'no answer/review is not ready');
    fs.writeFileSync(path.join(f.dir,'tasks/stills.answer.json'),JSON.stringify({code:'export function build() {}'}));
    await f.run();
    assert.equal(stillsReady(f.cfg,f.id),false,'an unsubmitted answer cannot bypass writer provenance or review');
    assert.equal(fs.existsSync(path.join(f.dir,'tasks/stills.check.json')),false);
    for(const name of ['world.task.json','greybox.task.json','stills-taste.gate.json']) assert.equal(fs.existsSync(path.join(f.dir,'tasks',name)),false,name);
    assert.equal(fs.existsSync(path.join(f.dir,'voice')),false);assert.equal(fs.existsSync(path.join(f.dir,'out/chapters')),false);
    console.log(`native run: 20 beats; inputHash=${task.inputHash}; render task hash=${key}; repeated task bytes unchanged; review not bypassed`);
  } finally {assert.deepEqual(snapshot(f.src),before,'original project hashes unchanged');fs.rmSync(f.root,{recursive:true,force:true});}
});

for(const approved of [false,true]) test(`accepted design + user approved=${approved}: native task only, no new user approval`,async()=>{
  const f=fixture();try {
    if(!approved) delete f.project.design;f.put();
    const bytes=fs.readFileSync(path.join(f.dir,'project.json'),'utf8');
    // Full normal stage range, explicit skips isolate unrelated material/network work.
    const r=await f.run({from:'plan',to:'reel',skip:STAGES.filter(s=>s!=='chapter')});
    assert.deepEqual(r.failures,[]);assert.equal(read(path.join(f.dir,'tasks/stills.task.json')).input.beats.length,20);
    assert.equal(fs.readFileSync(path.join(f.dir,'project.json'),'utf8'),bytes);
    assert.equal(fs.existsSync(path.join(f.dir,'tasks/world.task.json')),false);
    assert.equal(fs.existsSync(path.join(f.dir,'tasks/greybox.task.json')),false);
    assert.equal(stillsReady(f.cfg,f.id),false);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('missing accepted film design waits rather than fabricating acceptance',async()=>{
  const f=fixture();try {
    fs.rmSync(path.join(f.dir,'tasks/filmdesign.check.json'));
    const bytes=fs.readFileSync(path.join(f.dir,'project.json'),'utf8');
    const r=await f.run();assert.deepEqual(r.failures,[]);
    assert.equal(fs.existsSync(path.join(f.dir,'tasks/stills.task.json')),false);
    assert.ok(f.logs.some(l=>/stills.*waiting.*design/.test(l)));
    assert.equal(fs.readFileSync(path.join(f.dir,'project.json'),'utf8'),bytes);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
for(const options of [{dry:true},{skip:['chapter']},{from:'reel',to:'reel'}]) test(`requested range respected: ${JSON.stringify(options)}`,async()=>{
  const f=fixture();try {await f.run(options);assert.equal(fs.existsSync(path.join(f.dir,'tasks/stills.task.json')),false);}finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
for(const mode of ['stills-without-coverage','ordinary-unapproved']) test(`unchanged scheduling control: ${mode}`,async()=>{
  const f=fixture();try {
    if(mode==='stills-without-coverage') delete f.project.stillsCoverage;
    else {delete f.project.scope;delete f.project.design;}
    f.put();const r=await f.run();assert.deepEqual(r.failures,[]);
    assert.equal(fs.existsSync(path.join(f.dir,'tasks/stills.task.json')),false);
    assert.equal(f.logs.some(l=>/^\n▸ stills/.test(l)),false);
  }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
