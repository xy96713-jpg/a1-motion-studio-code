import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stillsGroup, stepStills, renderInputs } from '../apps/studio-next/src/lib/recipe-board/stills.mjs';
import { filmBeats } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { boardConfig } from '../apps/studio-next/src/lib/recipe-board/store.mjs';
import { requiresEventContract } from '../apps/studio-next/src/lib/recipe-board/directorroutes.mjs';
const cfg = boardConfig({RECIPE_BOARD_REPO_ROOT:process.cwd(),RECIPE_BOARD_NAS_OUTPUT_ROOT:''});
const read = f => JSON.parse(fs.readFileSync(f));
const scratchBase = path.join(process.env.HOME,'.hermes/cache/scratch');
fs.mkdirSync(scratchBase,{recursive:true});
const scratch = fs.mkdtempSync(path.join(scratchBase,'stills-whole-film-'));
const isolated = boardConfig({RECIPE_BOARD_REPO_ROOT:scratch,RECIPE_BOARD_SOURCE_ROOT:process.cwd(),RECIPE_BOARD_NAS_OUTPUT_ROOT:''});
function cloneInputs(id) {
  const src=path.join(cfg.dataDir,'projects',id), dst=path.join(isolated.dataDir,'projects',id);
  fs.mkdirSync(path.join(dst,'tasks'),{recursive:true});
  for(const name of ['project.json','plan.json','storyboard.json','style.json','design.json','shots','materials']) if(fs.existsSync(path.join(src,name))) fs.cpSync(path.join(src,name),path.join(dst,name),{recursive:true});
  for(const name of ['filmdesign.answer.json','filmdesign.check.json','filmdesign.task.json']) if(fs.existsSync(path.join(src,'tasks',name))) fs.copyFileSync(path.join(src,'tasks',name),path.join(dst,'tasks',name));
  for(const name of ['routing','recipes','themes','prompts','worlds']) if(!fs.existsSync(path.join(isolated.dataDir,name))) fs.symlinkSync(path.join(cfg.dataDir,name),path.join(isolated.dataDir,name));
  return dst;
}
test('native stepStills uses explicit project coverage, stable task hash and scope binding without rendering',async()=>{
  const id='banana-design',p=cloneInputs(id),project=read(path.join(p,'project.json'));
  const put=()=>fs.writeFileSync(path.join(p,'project.json'),JSON.stringify(project));
  project.scope='STILLS_ONLY';delete project.stillsCoverage;put();
  const run=()=>stepStills(isolated,id,{log:()=>{}});
  await run();const file=path.join(p,'tasks/stills.task.json'),legacy=read(file);
  assert.equal(legacy.input.beats.length,5,'STILLS_ONLY alone remains an operation restriction');
  project.stillsCoverage='whole-film';put();await run();const whole=read(file);
  assert.equal(whole.input.beats.length,20);
  assert.deepEqual(whole.input.beats.map(s=>s.shotId),filmBeats(cfg,id).map(b=>b.beat));
  assert.notEqual(whole.inputHash,legacy.inputHash);
  const bytes=fs.readFileSync(file,'utf8');await run();assert.equal(fs.readFileSync(file,'utf8'),bytes,'unchanged task must retain instance and timestamp');
  project.scope='RESEARCH_ONLY';put();await run();assert.notEqual(read(file).inputHash,whole.inputHash,'execution scope must be bound');
  project.scope='STILLS_ONLY';put();await run();
  assert.equal(fs.existsSync(path.join(p,'out/chapters')),false,'task generation must not render');
  console.log(`native whole-film task: ${file}`);
  const currentBytes=fs.readFileSync(file,'utf8');
  const sbFile=path.join(p,'storyboard.json'),sb=fs.readFileSync(sbFile);
  for(const shots of [read(sbFile).shots.slice(1),[...read(sbFile).shots,read(sbFile).shots[0]]]) {
    fs.writeFileSync(sbFile,JSON.stringify({shots}));
    await assert.rejects(run(),/whole-film.*storyboard/);
    assert.equal(fs.readFileSync(file,'utf8'),currentBytes,'bad coverage must not overwrite native task');
  }
  fs.writeFileSync(sbFile,sb);
  const planFile=path.join(p,'plan.json'),plan=read(planFile),original=fs.readFileSync(planFile);
  const renderKey=()=>renderInputs(isolated,id,{}).find(x=>x.path===file)?.hash;
  const before=renderKey();assert.ok(before,'render cache must bind the native task bytes including scope/coverage/source timing');
  plan.beats[0].text += '（输入绑定测试）';fs.writeFileSync(planFile,JSON.stringify(plan));await run();assert.notEqual(read(file).inputHash,whole.inputHash);assert.notEqual(renderKey(),before);
  fs.writeFileSync(planFile,original);await run();
  await stepStills(isolated,id,{targetBeat:'B02',log:()=>{}});
  assert.deepEqual(read(path.join(p,'tasks/stills-B02.task.json')).input.beats.map(b=>b.shotId),['B02']);
});
test('29-beat holdout without accepted film design stays blocked; never fabricate admission',async()=>{
  const id='paperclip-047-six',p=cloneInputs(id),project=read(path.join(p,'project.json'));
  fs.writeFileSync(path.join(p,'project.json'),JSON.stringify({...project,scope:'STILLS_ONLY',stillsCoverage:'whole-film'}));
  const result=await stepStills(isolated,id,{log:()=>{}});
  assert.equal(result.state,'waiting');assert.match(result.why,/design/);
  assert.equal(fs.existsSync(path.join(p,'tasks/stills.task.json')),false);
});
for (const [id, count] of [['banana-design',20],['paperclip-047-six',29]]) {
  const root = path.join(cfg.dataDir,'projects',id), beats = filmBeats(cfg,id);
  // The holdout has real storyboard/shot inputs but no accepted film design.
  // Its design rows here are selector test data, not fabricated acceptance.
  const design = fs.existsSync(path.join(root,'tasks/filmdesign.answer.json')) ? read(path.join(root,'tasks/filmdesign.answer.json')) : {beats:read(path.join(root,'storyboard.json')).shots.map((b,i)=>({...b,hero:i===0}))};
  test(`${id}: explicit whole-film coverage selects every real source beat`,()=>{
    assert.equal(beats.length,count);
    const g = stillsGroup(design,beats,{coverage:'whole-film'});
    assert.deepEqual(g.shots.map(s=>s.shotId),beats.map(b=>b.beat));
    assert.equal(new Set(g.shots.map(s=>s.shotId)).size,count);
    for(const s of g.shots){const b=beats.find(b=>b.beat===s.shotId);assert.equal(s.text,b.text);assert.equal(s.dur,b.dur);}
  });
  test(`${id}: whole-film rejects missing, duplicate or incomplete source/design beats`,()=>{
    const opts={coverage:'whole-film'};
    for(const bad of [beats.slice(1),[...beats,beats[0]],beats.map((b,i)=>i?b:{...b,text:''}),beats.map((b,i)=>i?b:{...b,dur:0})]) assert.throws(()=>stillsGroup(design,bad,opts),/whole-film/);
    for(const bad of [design.beats.slice(1),[...design.beats,design.beats[0]]]) assert.throws(()=>stillsGroup({...design,beats:bad},beats,opts),/whole-film/);
    assert.throws(()=>stillsGroup(design,beats,{coverage:'typo'}),/coverage/);
    assert.deepEqual(stillsGroup({...design,beats:[...design.beats].reverse()},beats,opts).shots.map(s=>s.shotId),beats.map(b=>b.beat));
    assert.throws(()=>stillsGroup(design,beats,{targetBeat:'missing'}),/target beat/);
  });
  test(`${id}: defaults and targetBeat retain selection`,()=>{
    assert.deepEqual(stillsGroup(design,beats).shots.map(s=>s.shotId),design.beats.filter(b=>b.hero||requiresEventContract(b)).map(b=>b.beat));
    const targetBeat=beats.at(-1).beat;
    assert.deepEqual(stillsGroup(design,beats,{targetBeat,coverage:'whole-film'}),stillsGroup(design,beats,{targetBeat}));
  });
}
