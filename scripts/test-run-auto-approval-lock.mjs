import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { materialsLock } from '../apps/studio-next/src/lib/recipe-board/shotplan.mjs';

const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'auto-approval-lock-'));
try {
  const cfg={dataDir:path.join(root,'data'),repoRoot:root,sourceRoot:root}, id='fixture';
  const dir=path.join(cfg.dataDir,'projects',id,'materials'); fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'..','project.json'),JSON.stringify({id}));
  const put=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value));
  const get=name=>JSON.parse(fs.readFileSync(path.join(dir,name)));
  const need={shotId:'B02',kind:'person',form:'photo',original:'valid'};
  const candidate={id:'c',source:'library',file:path.join(root,'image.png'),url:'https://example.invalid/image',title:'fixture',publisher:'fixture',rights:'unknown',kind:'image'};
  put('needs.json',{needs:[need]}); put('candidates.json',{shots:{B02:{need,candidates:[candidate]}}});
  put('proposed-batch.json',{picks:[{shotId:'B02',candidateId:'c'}]});
  const history={shotId:'OLD',status:'rejected',rejectedWhy:'history'};
  put('approvals.json',{batches:[{id:'old',items:[history]}]});
  const moduleUrl=pathToFileURL(path.resolve('apps/studio-next/src/lib/recipe-board/materials.mjs')).href;
  const code=`import {autoApproveTrustedWithLock} from ${JSON.stringify(moduleUrl)}; console.log('started'); await autoApproveTrustedWithLock(${JSON.stringify(cfg)},${JSON.stringify(id)}); console.log('finished');`;
  const release=await materialsLock(cfg,id);
  const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});
  let out='',err=''; child.stdout.on('data',d=>out+=d); child.stderr.on('data',d=>err+=d);
  const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve)});
  try {
    for(let i=0;i<100&&!out.includes('started')&&child.exitCode===null;i++) await new Promise(r=>setTimeout(r,20));
    assert.match(out,/started/,err);
    await new Promise(r=>setTimeout(r,200));
    assert.equal(child.exitCode,null,err); assert.equal(get('approvals.json').batches.length,1);
  } finally {release();}
  assert.equal(await exited,0,err);
  const batches=get('approvals.json').batches; assert.deepEqual(batches[0].items[0],history);
  assert.equal(batches[1].items[0].shotId,'B02'); assert.equal(batches[1].selection.status,'SYSTEM_SELECTED');
  console.log('run automatic approval lock: contention and preserved history passed');
} finally {fs.rmSync(root,{recursive:true,force:true});}
