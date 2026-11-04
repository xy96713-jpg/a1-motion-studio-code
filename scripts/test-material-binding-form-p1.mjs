import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import {spawnSync} from 'node:child_process';
import * as M from '../apps/studio-next/src/lib/recipe-board/materials.mjs';
import {chapterMaterials} from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import {renderProject} from '../apps/studio-next/src/lib/recipe-board/render.mjs';
import {projectState} from '../apps/studio-next/src/lib/recipe-board/run.mjs';
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'binding-form-')), id='test', cfg={dataDir:root,sourceRoot:root,repoRoot:root};
const project=path.join(root,'projects',id), dir=path.join(project,'materials'), shots=path.join(project,'shots'); fs.mkdirSync(dir,{recursive:true}); fs.mkdirSync(shots); fs.mkdirSync(path.join(root,'recipes'));
const put=(name,obj)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(obj));
try {
 fs.writeFileSync(path.join(project,'project.json'),JSON.stringify({id})); fs.writeFileSync(path.join(project,'storyboard.json'),JSON.stringify({shots:[]}));
 const img=path.join(root,'img.png'),vid=path.join(root,'vid.mp4'),bad=path.join(root,'bad.png');
 for(const args of [['-f','lavfi','-i','color=red:s=64x64','-frames:v','1',img],['-f','lavfi','-i','color=blue:s=64x64:r=5:d=1','-c:v','libx264','-pix_fmt','yuv420p',vid]]) {let r=spawnSync('ffmpeg',['-v','error','-y',...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 fs.writeFileSync(bad,'not media');
 for(const [form,file,kind,ok] of [['photo',img,'image',true],['photo',vid,'image',false],['video',vid,'video',true],['video',img,'video',false],['photo',bad,'image',false],['video',bad,'video',false],[null,bad,'image',true]]) {
  const n={shotId:'B01',form,original:'same',bind:'background'}, other={shotId:'B02',original:'other'};
  const b={file,kind,range:[0,1]}; const base={recipe:'test',slots:{background:{gen:'standin'}}};
  fs.writeFileSync(path.join(shots,'B01.json'),JSON.stringify(base)); fs.writeFileSync(path.join(shots,'B02.json'),JSON.stringify(base));
  put('needs.json',{needs:[n,other]});put('bindings.json',{shots:{B01:b,B02:{file:bad,kind:'image'}}}); put('approvals.json',{batches:[{items:[{shotId:'B02',status:'approved'}]}]});
  const approval=fs.readFileSync(path.join(dir,'approvals.json'),'utf8'), otherBefore=fs.readFileSync(path.join(shots,'B02.json'),'utf8');
  M.bindShots(cfg,id,{only:new Set(['B01'])});
  assert.equal(JSON.parse(fs.readFileSync(path.join(shots,'B01.json'))).slots.background.gen!=='standin',ok,`bind ${form} ${file}`);
  assert.equal(chapterMaterials(cfg,id,{shots:[{shotId:'B01'}]},{prepare:false}).length>0,ok,`chapter ${form} ${file}`);
  assert.equal(fs.readFileSync(path.join(dir,'approvals.json'),'utf8'),approval);assert.equal(fs.readFileSync(path.join(shots,'B02.json'),'utf8'),otherBefore);
 }
 // A previously bound slot survives a change in requested form, but must never render as satisfied.
 const photoNeed={shotId:'B01',form:'photo',original:'fixture',bind:'background'};
 fs.writeFileSync(path.join(shots,'B01.json'),JSON.stringify({shotId:'B01',recipe:'test',slots:{background:{gen:'standin'}}}));
 put('needs.json',{needs:[photoNeed]}); put('bindings.json',{shots:{B01:{file:img,kind:'image',range:[0,1]}}});
 M.bindShots(cfg,id,{only:new Set(['B01'])});
 const shotBefore=fs.readFileSync(path.join(shots,'B01.json')); const approvalBefore=fs.readFileSync(path.join(dir,'approvals.json'));
 assert.equal(JSON.parse(shotBefore).slots.background.asset,'img.png');
 put('needs.json',{needs:[{...photoNeed,form:'video'}]});
 await assert.rejects(renderProject(cfg,id,{only:new Set(['B01'])}),/blocked.*form/i);
 assert.deepEqual(projectState(cfg,id,{only:new Set(['B01'])}).materials.blockedForm,['B01']);
 assert.deepEqual(fs.readFileSync(path.join(shots,'B01.json')),shotBefore); assert.deepEqual(fs.readFileSync(path.join(dir,'approvals.json')),approvalBefore);
 assert.deepEqual(projectState(cfg,id,{only:new Set(['B02'])}).materials.blockedForm,[]);
 for (const binding of [{file:bad,kind:'video'}, {file:img,kind:'unknown'}, null]) {
  put('bindings.json',{shots:{B01:binding}});
  await assert.rejects(renderProject(cfg,id,{only:new Set(['B01'])}),/blocked.*form/i);
  assert.deepEqual(projectState(cfg,id,{only:new Set(['B01'])}).materials.blockedForm,['B01']);
 }
 put('bindings.json',{shots:{}});
 await assert.rejects(renderProject(cfg,id,{only:new Set(['B01'])}),/blocked.*form/i);
 assert.deepEqual(projectState(cfg,id,{only:new Set(['B01'])}).materials.blockedForm,['B01']);
 // Real render entrance continues past the form guard for matched, legacy and unrelated shots.
 put('approvals.json',{batches:[]});
 put('bindings.json',{shots:{B01:{file:img,kind:'image',range:[0,1]}}});
 for (const [need,only] of [[photoNeed,'B01'],[{...photoNeed,form:null},'B01'],[{...photoNeed,form:'video'},'B02']]) {
  put('needs.json',{needs:[need]});
  assert.deepEqual(projectState(cfg,id,{only:new Set([only])}).materials.blockedForm,[]);
  const selectedFile=path.join(shots,`${only}.json`), saved=fs.readFileSync(selectedFile);
  fs.writeFileSync(selectedFile,'{');
  try { await assert.rejects(renderProject(cfg,id,{only:new Set([only])}),e => e instanceof SyntaxError); }
  finally { fs.writeFileSync(selectedFile,saved); }
 }
 const n={shotId:'B01',form:'photo',original:'new'}, old={...n,form:'video'};
 put('needs.json',{needs:[n]}); put('candidates.json',{shots:{B01:{need:old,candidates:[{id:'v',source:'youtube',url:'https://example.invalid',rights:'cc'}]}}});put('proposed-batch.json',{picks:[{shotId:'B01',candidateId:'v',named:true}]});put('approvals.json',{batches:[]});
 assert.equal(M.autoApproveTrusted(cfg,id),null,'stale video proposal must not approve current photo need');
 put('candidates.json',{shots:{B01:{need:n,candidates:[{id:'v',source:'youtube',url:'https://example.invalid',rights:'cc'}]}}});
 assert.equal(M.autoApproveTrusted(cfg,id),null,'current photo still rejects video candidate');
 const photoCandidate={id:'p',source:'library',file:img,rights:'cc'};
 put('candidates.json',{shots:{B01:{need:n,candidates:[photoCandidate]}}});put('proposed-batch.json',{picks:[{shotId:'B01',candidateId:'p',named:true}]});
 assert.equal(M.autoApproveTrusted(cfg,id).items[0].candidateId,'p');
 put('approvals.json',{batches:[]}); const legacy={shotId:'B01',original:'legacy'};put('needs.json',{needs:[legacy]});put('candidates.json',{shots:{B01:{need:legacy,candidates:[{id:'v',source:'youtube',rights:'cc'}]}}});put('proposed-batch.json',{picks:[{shotId:'B01',candidateId:'v',named:true}]});
 assert.equal(M.autoApproveTrusted(cfg,id).items[0].candidateId,'v','legacy no form still approves');
 put('approvals.json',{batches:[]});put('needs.json',{needs:[n]});put('candidates.json',{shots:{B01:{need:n,candidates:[photoCandidate]}}});put('proposed-batch.json',{picks:[{shotId:'B01~2',candidateId:'p',named:true}]});
 assert.equal(M.autoApproveTrusted(cfg,id),null,'removed scene cannot approve');
} finally {fs.rmSync(root,{recursive:true,force:true});}
console.log('material binding form P1 passed');