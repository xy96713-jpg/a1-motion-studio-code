import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Real offline acquisition exercises stale isolation, slots, legacy and failures.
// Run: node scripts/test-fetch-approved-stale-isolation.mjs
// All paths and acquired assets are disposable; no browser or external network.
const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'fetch-stale-'));
try {
  const library=path.join(root,'library'), bin=path.join(root,'bin'), dataDir=path.join(root,'data');
  fs.mkdirSync(library,{recursive:true}); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,'swift'),'#!/bin/sh\nprintf "[]"\n',{mode:0o755});
  process.env.PATH=`${bin}:${process.env.PATH}`; process.env.A1_MATERIAL_LIBRARY=library;
  globalThis.fetch=async()=>{throw Error('network forbidden')};
  const M=await import('../apps/studio-next/src/lib/recipe-board/materials.mjs');
  const cfg={dataDir,repoRoot:root,sourceRoot:root}, id='fixture';
  const project=path.join(dataDir,'projects',id), dir=path.join(project,'materials'), shots=path.join(project,'shots');
  fs.mkdirSync(dir,{recursive:true}); fs.mkdirSync(shots);
  const put=(n,v)=>fs.writeFileSync(path.join(dir,n),JSON.stringify(v,null,2));
  const get=n=>JSON.parse(fs.readFileSync(path.join(dir,n)));
  const projectBytes=JSON.stringify({id,gates:{design:{approved:false},final:{approved:false}}});
  fs.writeFileSync(path.join(project,'project.json'),projectBytes);
  const image=path.join(root,'image.png');
  const generated=spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=s=64x64','-frames:v','1',image],{encoding:'utf8'});
  assert.equal(generated.status,0,generated.stderr);
  const old={shotId:'B01',scene:1,kind:'person',form:'photo',original:'old',bind:'picture'};
  const stale={...old,original:'new'}, valid={shotId:'B02',kind:'person',form:'photo',original:'current',bind:'picture'};
  const scene={shotId:'B01',scene:2,kind:'person',form:'photo',original:'scene',bind:'picture'};
  const legacy={shotId:'B03',kind:'person',original:'legacy',bind:'picture'};
  const fail={shotId:'B04',kind:'person',form:'photo',original:'missing',bind:'picture'};
  const item=(n,file=image)=>({shotId:M.needKey(n),status:'approved',source:'library',file,url:`https://example.invalid/${M.needKey(n)}`,title:M.needKey(n),publisher:'fixture',rights:'unknown',rightsLabel:'unknown',needPrint:M.needPrint(n)});
  const oldAsset=path.join(root,'old.png'); fs.copyFileSync(image,oldAsset); const oldBytes=fs.readFileSync(oldAsset);
  const staleItem={...item(old),extra:{history:['preserve']}};
  const oldBinding={file:oldAsset,kind:'image',needPrint:M.needPrint(old),history:{keep:true}};
  const seed=(mixed)=>{
    const needs=mixed?[stale,valid,scene,legacy,fail]:[valid];
    put('needs.json',{needs}); put('candidates.json',{shots:Object.fromEntries(needs.map(n=>[M.needKey(n),{need:n,candidates:[]}]))});
    if(mixed) {const c=get('candidates.json'); c.shots['B01~1'].need=old; put('candidates.json',c);}
    put('approvals.json',{batches:[{id:'batch',items:mixed?[staleItem,item(valid),item(fail,path.join(root,'missing.png')),item(scene),item(legacy)]:[item(valid)]}]});
    put('bindings.json',{shots:mixed?{'B01~1':oldBinding}:{}});
    fs.writeFileSync(path.join(shots,'B01.json'),JSON.stringify({recipe:'fixture',scenes:[{slots:{picture:{gen:'zero'}}},{slots:{picture:{gen:'old'}}},{slots:{picture:{gen:'scene'}}}]}));
    for(const shot of ['B02','B03','B04']) fs.writeFileSync(path.join(shots,`${shot}.json`),JSON.stringify({recipe:'fixture',slots:{picture:{gen:'placeholder'}}}));
  };
  // Prove the actual local acquisition and slot path works independently of the stale guard.
  seed(false); const baseline=await M.fetchApproved(cfg,id); assert.ok(fs.existsSync(baseline.shots.B02.file));
  M.bindShots(cfg,id); assert.ok(JSON.parse(fs.readFileSync(path.join(shots,'B02.json'))).slots.picture.asset);
  const previous=baseline.shots.B02, oldReceipt=fs.readFileSync(previous.receipt), oldClip=fs.readFileSync(previous.file);
  seed(true); const shotBefore=fs.readFileSync(path.join(shots,'B01.json'));
  assert.deepEqual(M.changedNeeds(cfg,id),['B01~1']);
  const ledgerNames=['needs.json','candidates.json','approvals.json','bindings.json'];
  const historyBefore=Object.fromEntries(ledgerNames.map(n=>[n,fs.readFileSync(path.join(dir,n))]));
  let result, blocked;
  try { result=await M.fetchApproved(cfg,id); } catch (e) { blocked=e; }
  if (blocked) {
    for (const n of ledgerNames) assert.deepEqual(fs.readFileSync(path.join(dir,n)),historyBefore[n],`${n} bytes preserved on block`);
    assert.deepEqual(fs.readFileSync(previous.receipt),oldReceipt);
    assert.deepEqual(fs.readFileSync(previous.file),oldClip);
    assert.deepEqual(fs.readFileSync(path.join(shots,'B01.json')),shotBefore);
    assert.fail(`B02 valid local acquisition blocked by unrelated B01 stale: ${blocked.message}; original ledger/receipt/asset bytes preserved`);
  }
  const approvals=get('approvals.json').batches[0].items;
  assert.deepEqual(approvals[0],staleItem); assert.equal(approvals[1].status,'fetched'); assert.equal(approvals[2].status,'failed');
  assert.equal(approvals[3].status,'fetched'); assert.equal(approvals[4].status,'fetched');
  assert.deepEqual(result.shots['B01~1'],oldBinding); assert.deepEqual(fs.readFileSync(oldAsset),oldBytes);
  assert.deepEqual(fs.readFileSync(previous.receipt),oldReceipt); assert.deepEqual(fs.readFileSync(previous.file),oldClip);
  M.bindShots(cfg,id); const s=JSON.parse(fs.readFileSync(path.join(shots,'B01.json')));
  assert.deepEqual(s.scenes[1],JSON.parse(shotBefore).scenes[1]); assert.ok(s.scenes[2].slots.picture.asset);
  assert.ok(JSON.parse(fs.readFileSync(path.join(shots,'B02.json'))).slots.picture.asset);
  assert.ok(JSON.parse(fs.readFileSync(path.join(shots,'B03.json'))).slots.picture.asset);
  const once=get('approvals.json'); await M.fetchApproved(cfg,id); assert.deepEqual(get('approvals.json').batches[0].items[0],staleItem);
  assert.deepEqual(get('approvals.json'),once); assert.equal(fs.readFileSync(path.join(project,'project.json'),'utf8'),projectBytes);
  // Exercise the actual run fetch stage with mixed stale and valid local items.
  for (const name of ['recipes','routing','themes','worlds']) fs.cpSync(path.resolve('work/recipe-board-v1',name),path.join(dataDir,name),{recursive:true});
  seed(true);
  fs.writeFileSync(path.join(project,'plan.json'),JSON.stringify({beats:[]}));
  const {runProject}=await import('../apps/studio-next/src/lib/recipe-board/run.mjs');
  const logs=[]; await runProject(cfg,id,{from:'fetch',to:'fetch',log:s=>logs.push(s)});
  const viaRun=get('approvals.json').batches[0].items;
  assert.deepEqual(viaRun[0],staleItem); assert.equal(viaRun[1].status,'fetched',logs.join('\n'));
  assert.ok(get('bindings.json').shots.B02?.file); assert.deepEqual(get('bindings.json').shots['B01~1'],oldBinding);
  console.log('fetch stale isolation: local acquisition, failures, scenes, legacy and repeat passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}
