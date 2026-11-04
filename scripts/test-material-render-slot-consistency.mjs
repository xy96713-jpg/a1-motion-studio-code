import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import {spawnSync} from 'node:child_process';
import {renderProject} from '../apps/studio-next/src/lib/recipe-board/render.mjs';
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'render-slot-')), id='test', cfg={dataDir:root,sourceRoot:root,repoRoot:root};
const project=path.join(root,'projects',id), dir=path.join(project,'materials'), shots=path.join(project,'shots');
fs.mkdirSync(dir,{recursive:true}); fs.mkdirSync(shots); fs.mkdirSync(path.join(root,'recipes'));
const put=(file,obj)=>fs.writeFileSync(file,JSON.stringify(obj));
const mat=(file,obj)=>put(path.join(dir,file),obj);
try {
 put(path.join(project,'project.json'),{id}); put(path.join(project,'storyboard.json'),{shots:[]});
 const img=path.join(root,'new.png'); const r=spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=red:s=64x64','-frames:v','1',img],{encoding:'utf8'}); assert.equal(r.status,0,r.stderr);
 const other=path.join(shots,'B02.json'); put(other,{shotId:'B02',recipe:'title',slots:{background:{asset:'own.png'}}}); const otherBefore=fs.readFileSync(other);
 const shot=path.join(shots,'B01.json'); const need={shotId:'B01',form:'photo',bind:'background',original:'fixture'};
 mat('needs.json',{needs:[need]}); mat('bindings.json',{shots:{B01:{file:img,kind:'image'}}}); mat('approvals.json',{batches:[]}); const approval=fs.readFileSync(path.join(dir,'approvals.json'));
 put(shot,{shotId:'B01',recipe:'test',slots:{background:{asset:'old.png'}}}); const before=fs.readFileSync(shot);
 await assert.rejects(renderProject(cfg,id,{only:new Set(['B01'])}),/blocked.*B01/i);
 assert.deepEqual(fs.readFileSync(shot),before); assert.deepEqual(fs.readFileSync(other),otherBefore); assert.deepEqual(fs.readFileSync(path.join(dir,'approvals.json')),approval);
 fs.writeFileSync(path.join(shots,'B03.json'),'{'); // downstream parse sentinel, before browser launch
 const reachesLater = async () => assert.rejects(renderProject(cfg,id,{only:new Set(['B01','B03'])}), e => e instanceof SyntaxError);
 put(shot,{shotId:'B01',recipe:'test',slots:{background:{asset:'new.png'}}}); await reachesLater();
 put(shot,{shotId:'B01',recipe:'test',slots:{background:{asset:'new.png'}},scenes:[{slots:{background:{asset:'old.png'}}}]});
 await assert.rejects(renderProject(cfg,id,{only:new Set(['B01'])}),/B01.*scenes\.0/);
 mat('needs.json',{needs:[{...need,bind:'backdrop'}]}); put(shot,{shotId:'B01',recipe:'test',backdrop:{asset:'old.png'},slots:{background:{asset:'own.png'}}});
 await assert.rejects(renderProject(cfg,id,{only:new Set(['B01'])}),/B01.*backdrop/);
 put(shot,{shotId:'B01',recipe:'test',backdrop:{asset:'new.png'},slots:{background:{asset:'own.png'}}}); await reachesLater();
 mat('needs.json',{needs:[{...need,form:null}]}); put(shot,{shotId:'B01',recipe:'test',slots:{background:{asset:'old.png'}}}); await reachesLater();
 mat('needs.json',{needs:[need]}); await assert.rejects(renderProject(cfg,id,{only:new Set(['B02','B03'])}), e => e instanceof SyntaxError);
 put(shot,{shotId:'B01',recipe:'title',slots:{background:{asset:'own.png'}}}); mat('needs.json',{needs:[{...need,bind:undefined}]}); await reachesLater();
 mat('needs.json',{needs:[{...need,bind:'screen'}]}); put(shot,{shotId:'B01',recipe:'title',slots:{background:{asset:'own.png'}}}); await reachesLater();
 put(shot,{shotId:'B01',recipe:'title',slots:{screen:{gen:'unknown'}}}); await assert.rejects(renderProject(cfg,id,{only:new Set(['B01'])}),/B01.*unknown/);
 mat('needs.json',{needs:[need]}); mat('bindings.json',{shots:{B01:{file:img,kind:'image',role:'page',archive:{window:{file:img}}}}}); put(shot,{shotId:'B01',recipe:'screen-full',slots:{screen:{asset:'new.png'},background:{asset:'own.png'}}}); await reachesLater();
 assert.deepEqual(fs.readFileSync(other),otherBefore); assert.deepEqual(fs.readFileSync(path.join(dir,'approvals.json')),approval);
} finally {fs.rmSync(root,{recursive:true,force:true});}
console.log('render slot consistency passed');