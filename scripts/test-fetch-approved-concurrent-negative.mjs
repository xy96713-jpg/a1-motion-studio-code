import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Separate fetch process permits cooperative writers to wait for the lock while
// the asynchronous controller releases the OCR barrier. Direct writers still conflict.
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'fetch-race-'));
try {
 const library=path.join(root,'library'), bin=path.join(root,'bin'), dataDir=path.join(root,'data');
 fs.mkdirSync(library,{recursive:true}); fs.mkdirSync(bin);
 process.env.A1_MATERIAL_LIBRARY=library; process.env.PATH=`${bin}:${process.env.PATH}`;
 globalThis.fetch=async()=>{throw Error('network forbidden')};
 const modulePath=path.resolve('apps/studio-next/src/lib/recipe-board/materials.mjs');
 const M=await import(pathToFileURL(modulePath));
 const cfg={dataDir,repoRoot:root,sourceRoot:root}, id='fixture', dir=path.join(dataDir,'projects',id,'materials');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'..','project.json'),JSON.stringify({id}));
 const put=(f,v)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(v));
 const get=f=>JSON.parse(fs.readFileSync(path.join(dir,f)));
 const image=path.join(root,'image.png');
 const gen=spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=s=64x64','-frames:v','1',image],{encoding:'utf8'});
 assert.equal(gen.status,0,gen.stderr);
 const need={shotId:'B02',kind:'person',form:'photo',original:'old'};
 const other={shotId:'B03',kind:'person',form:'photo',original:'other'};
 const item=n=>({shotId:n.shotId,status:'approved',source:'library',file:image,url:`https://example.invalid/${n.shotId}`,title:n.shotId,publisher:'fixture',rights:'unknown',rightsLabel:'unknown',needPrint:M.needPrint(n)});
 put('needs.json',{needs:[need,other]});
 put('candidates.json',{shots:{B02:{need,candidates:[]},B03:{need:other,candidates:[]}}});
 put('approvals.json',{batches:[{id:'batch',items:[item(need),item(other)]}]});
 put('bindings.json',{shots:{B03:{file:image,kind:'image',needPrint:M.needPrint(other)}}});
 // Mixed stale and local: preserve history and fetch the independent item.
 const stale={shotId:'B01',kind:'person',form:'photo',original:'new'};
 const prior={...stale,original:'old'};
 put('needs.json',{needs:[stale,need]});
 put('candidates.json',{shots:{B01:{need:prior},B02:{need}}});
 put('approvals.json',{batches:[{id:'batch',items:[item(prior),item(need)]}]});
 fs.writeFileSync(path.join(bin,'swift'),'#!/bin/sh\nprintf "[]"\n',{mode:0o755});
 const mixed=await M.fetchApproved(cfg,id);
 assert.deepEqual(get('approvals.json').batches[0].items[0],item(prior));
 assert.equal(get('approvals.json').batches[0].items[1].status,'fetched');
 assert.ok(fs.existsSync(mixed.shots.B02.file));
 put('needs.json',{needs:[need,other]});
 put('candidates.json',{shots:{B02:{need,candidates:[]},B03:{need:other,candidates:[]}}});
 put('approvals.json',{batches:[{id:'batch',items:[item(need),item(other)]}]});
 // Real public writer runs during synchronous OCR; exercise both reject and changed need separately.
 const child=path.join(root,'concurrent.mjs'), marker=path.join(root,'once');
 fs.writeFileSync(child,`import fs from 'node:fs';\nimport {rejectPick} from ${JSON.stringify(pathToFileURL(modulePath).href)};\nconst cfg=${JSON.stringify(cfg)}, id=${JSON.stringify(id)}, dir=${JSON.stringify(dir)};\nif (process.env.RACE_MODE === 'reject') { fs.writeFileSync(${JSON.stringify(marker)} + '.started','started'); await rejectPick(cfg,id,'B03',{why:'concurrent rejection'}); }\nelse if (process.env.RACE_MODE === 'candidate') { const f=dir+'/candidates.json', n=JSON.parse(fs.readFileSync(f)); Object.assign(n.shots.B02.candidates[0], {title:'replacement',source:'replacement-source',file:'replacement.png'}); fs.writeFileSync(f,JSON.stringify(n)); }\nelse { const f=dir+'/needs.json', n=JSON.parse(fs.readFileSync(f)); n.needs[0].original='new'; fs.writeFileSync(f,JSON.stringify(n)); }\nfs.writeFileSync(${JSON.stringify(marker)},'done');\n`);
 fs.writeFileSync(path.join(bin,'swift'),`#!/bin/sh\nif [ ! -f ${JSON.stringify(marker)} ]; then ${JSON.stringify(process.execPath)} ${JSON.stringify(child)} || exit 1; fi\nprintf '[]'\n`,{mode:0o755});
 const projectFile=path.join(dir,'..','project.json'), projectBefore=fs.readFileSync(projectFile), assetBefore=fs.readFileSync(image);
 for (const mode of ['need','candidate']) {
  put('needs.json',{needs:[need,other]});
  put('candidates.json',{shots:{B02:{need,candidates:[{id:'same-id',title:'original',source:'library',file:image}]},B03:{need:other,candidates:[]}}});
  put('approvals.json',{batches:[{id:'batch',items:[{...item(need),candidateId:'same-id'},item(other)]}]});
  put('bindings.json',{shots:{B03:{file:image,kind:'image',needPrint:M.needPrint(other)}}});
  const approvalBefore=fs.readFileSync(path.join(dir,'approvals.json')), bindingBefore=fs.readFileSync(path.join(dir,'bindings.json'));
  fs.rmSync(marker,{force:true}); process.env.RACE_MODE=mode;
  await assert.rejects(M.fetchApproved(cfg,id,{batchId:'batch'}),/concurrent.*(change|modif)|conflict/i);
  assert.equal(fs.readFileSync(marker,'utf8'),'done');
  assert.equal(get('approvals.json').batches[0].items[0].status,'approved');
  assert.equal(get('bindings.json').shots.B02,undefined,'no obsolete binding');
  if (mode==='need') {
   assert.equal(get('needs.json').needs[0].original,'new');
   assert.ok(M.changedNeeds(cfg,id).includes('B02'));
   await M.fetchApproved(cfg,id); assert.equal(get('approvals.json').batches[0].items[0].status,'approved');
  } else {
   assert.deepEqual(get('candidates.json').shots.B02.candidates[0],{id:'same-id',title:'replacement',source:'replacement-source',file:'replacement.png'});
   assert.deepEqual(fs.readFileSync(path.join(dir,'approvals.json')),approvalBefore);
   assert.deepEqual(fs.readFileSync(path.join(dir,'bindings.json')),bindingBefore);
  }
  assert.deepEqual(fs.readFileSync(projectFile),projectBefore); assert.deepEqual(fs.readFileSync(image),assetBefore);
 }
 // A cooperative reject waits while fetch owns the lock, then completes after release.
 put('needs.json',{needs:[need,other]});
 put('candidates.json',{shots:{B02:{need,candidates:[]},B03:{need:other,candidates:[]}}});
 put('approvals.json',{batches:[{id:'batch',items:[item(need),item(other)]}]});
 put('bindings.json',{shots:{B03:{file:image,kind:'image',needPrint:M.needPrint(other)}}});
 const ready=path.join(root,'ready'), go=path.join(root,'go');
 fs.writeFileSync(path.join(bin,'swift'),`#!/bin/sh\ntouch ${JSON.stringify(ready)}\nwhile [ ! -f ${JSON.stringify(go)} ]; do sleep 0.05; done\nprintf '[]'\n`,{mode:0o755});
 const code=`import {fetchApproved} from ${JSON.stringify(pathToFileURL(modulePath).href)}; await fetchApproved(${JSON.stringify(cfg)},${JSON.stringify(id)},{batchId:'batch'});`;
 const runner=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
 let runnerErr=''; runner.stderr.on('data',d=>runnerErr+=d);
 const runnerExit=new Promise((resolve,reject)=>{runner.on('error',reject);runner.on('close',resolve)});
 let rejecter, rejectExit, rejectErr='';
 try {
  for(let i=0;i<300&&!fs.existsSync(ready)&&runner.exitCode===null;i++) await new Promise(r=>setTimeout(r,20));
  assert.ok(fs.existsSync(ready),`fetch never entered OCR: ${runnerErr}`);
  rejecter=spawn(process.execPath,[child],{env:{...process.env,RACE_MODE:'reject'},stdio:['ignore','pipe','pipe']});
  rejecter.stderr.on('data',d=>rejectErr+=d);
  rejectExit=new Promise((resolve,reject)=>{rejecter.on('error',reject);rejecter.on('close',resolve)});
  for(let i=0;i<200&&!fs.existsSync(marker+'.started')&&rejecter.exitCode===null;i++) await new Promise(r=>setTimeout(r,20));
  assert.ok(fs.existsSync(marker+'.started'),`reject never attempted lock: ${rejectErr}`);
  await new Promise(r=>setTimeout(r,300));
  assert.equal(rejecter.exitCode,null,`reject bypassed lock: ${rejectErr}`);
  assert.equal(get('approvals.json').batches[0].items[1].status,'approved');
 } finally { fs.writeFileSync(go,'release'); }
 assert.equal(await runnerExit,0,runnerErr); assert.equal(await rejectExit,0,rejectErr);
 assert.equal(get('approvals.json').batches[0].items[1].status,'rejected');
 assert.equal(get('bindings.json').shots.B03,undefined);
 assert.equal(get('review-picks.json').rejected.B03[0].why,'concurrent rejection');
 fs.writeFileSync(path.join(bin,'swift'),'#!/bin/sh\nprintf "[]"\n',{mode:0o755});
 // No concurrent modification: a real local acquisition must still succeed.
 put('needs.json',{needs:[need]}); put('candidates.json',{shots:{B02:{need,candidates:[]}}});
 put('approvals.json',{batches:[{id:'batch',items:[item(need)]}]}); put('bindings.json',{shots:{}});
 const result=await M.fetchApproved(cfg,id,{batchId:'batch'});
 assert.equal(get('approvals.json').batches[0].items[0].status,'fetched');
 assert.equal(result.shots.B02.needPrint,M.needPrint(need)); assert.ok(fs.existsSync(result.shots.B02.file));
 assert.deepEqual(fs.readFileSync(projectFile),projectBefore); assert.deepEqual(fs.readFileSync(image),assetBefore);
 console.log('fetch concurrent conflict detection: reject, need, candidate identity and real no-race acquisition passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}
