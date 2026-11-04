import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {materialsLock} from '../apps/studio-next/src/lib/recipe-board/shotplan.mjs';

const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'manual-approval-lock-'));
try {
  process.env.A1_MATERIAL_LIBRARY = path.join(root, 'library');
  fs.mkdirSync(process.env.A1_MATERIAL_LIBRARY);
  globalThis.fetch = async () => { throw new Error('network forbidden'); };
  const url = pathToFileURL(path.resolve('apps/studio-next/src/lib/recipe-board/materials.mjs')).href;
  const M = await import(url);
  const cfg = {dataDir:path.join(root,'data'),repoRoot:root,sourceRoot:root}, id='fixture';
  const dir = path.join(cfg.dataDir,'projects',id,'materials'); fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'..','project.json'),JSON.stringify({id}));
  const put=(f,x)=>fs.writeFileSync(path.join(dir,f),JSON.stringify(x));
  const get=f=>JSON.parse(fs.readFileSync(path.join(dir,f)));
  const image=path.join(root,'image.png');
  const gen=spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=s=64x64','-frames:v','1',image],{encoding:'utf8'});
  assert.equal(gen.status,0,gen.stderr);
  const n1={shotId:'B01',kind:'person',form:'photo',original:'one'}, n2={shotId:'B02',kind:'person',form:'photo',original:'two'};
  const c={id:'candidate',source:'library',file:image,url:'https://example.invalid/picture',title:'fixture',publisher:'fixture',rights:'unknown'};
  put('needs.json',{needs:[n1,n2]}); put('candidates.json',{shots:{B01:{need:n1,candidates:[c]},B02:{need:n2,candidates:[c]}}});
  const history={shotId:'OLD',status:'rejected',rejectedWhy:'history'};
  put('approvals.json',{batches:[{id:'batch-1',items:[{...c,shotId:'B01',candidateId:c.id,status:'approved',needPrint:M.needPrint(n1)},history]}]});
  put('bindings.json',{shots:{}});
  const release=await materialsLock(cfg,id);
  const child=`import {saveApprovalBatch} from ${JSON.stringify(url)}; console.log('started'); const b=await saveApprovalBatch(${JSON.stringify(cfg)},${JSON.stringify(id)},[{shotId:'B02',candidateId:'candidate'}],{confirmedBy:'auto: trusted source'}); console.log(JSON.stringify(b));`;
  const proc=spawn(process.execPath,['--input-type=module','-e',child],{stdio:['ignore','pipe','pipe']});
  let out='',err=''; proc.stdout.on('data',d=>out+=d); proc.stderr.on('data',d=>err+=d);
  const exited=new Promise((resolve,reject)=>{proc.on('error',reject);proc.on('close',resolve)});
  try {
    for(let i=0;i<100&&!out.includes('started');i++) await new Promise(r=>setTimeout(r,20));
    assert.match(out,/started/);
    await new Promise(r=>setTimeout(r,200));
    assert.equal(proc.exitCode,null,`approval bypassed held lock: ${out} ${err}`);
    assert.equal(get('approvals.json').batches.length,1);
    const result=await M.fetchApproved(cfg,id,{batchId:'batch-1',lockOwner:release});
    assert.ok(fs.existsSync(result.shots.B01.file));
    assert.equal(get('approvals.json').batches[0].items[0].status,'fetched');
    assert.equal(get('approvals.json').batches.length,1);
  } finally { release(); }
  assert.equal(await exited,0,err);
  const batches=get('approvals.json').batches;
  assert.equal(batches.length,2); assert.equal(batches[0].items[0].status,'fetched');
  assert.deepEqual(batches[0].items[1],history); assert.equal(batches[1].items[0].shotId,'B02');
  assert.equal(batches[1].selection.status,'UNKNOWN');
  await assert.rejects(M.saveApprovalBatch(cfg,id,[{shotId:'B02',candidateId:'missing'}]),/unknown candidate/);
  const releaseAfterError=await materialsLock(cfg,id,()=>{},{waitMs:10,maxWait:100}); releaseAfterError();
  console.log('manual approval: multiprocess lock, fetch serialization, history, exception release passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}
