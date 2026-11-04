import assert from 'node:assert/strict';
import { toNeed } from '../apps/studio-next/src/lib/recipe-board/writer.mjs';
const beat={text:'人物',onScreen:{keywords:[]}};
const photo=toNeed('B01',{kind:'person',form:'photo',entity:'Alice',queryEn:'Alice speaking at event',original:'人物',slot:'background'},beat);
const video=toNeed('B02',{kind:'person',form:'video',entity:'Alice',queryEn:'Alice interview 1990',original:'人物',slot:'background'},beat);
assert.deepEqual(photo.archive.keywords,['Alice speaking at event']);
assert.deepEqual(video.youtube,['Alice interview 1990']);
assert.notEqual(photo.form,video.form);
assert.equal(photo.queryEn,'Alice speaking at event');
assert.equal(video.queryEn,'Alice interview 1990');
const fs = await import('node:fs'); const path = await import('node:path');
const {rankNeed,englishQuery}=await import('../apps/studio-next/src/lib/recipe-board/materials.mjs');
const root=fs.mkdtempSync(path.join(process.env.TMPDIR,'media-route-')); const dir=path.join(root,'projects','test','materials'); fs.mkdirSync(dir,{recursive:true});
try {
 const cfg={dataDir:root,sourceRoot:root,repoRoot:root}; fs.writeFileSync(path.join(root,'projects','test','project.json'),JSON.stringify({id:'test'}));
 fs.writeFileSync(path.join(root,'projects','test','storyboard.json'),JSON.stringify({shots:[{evidence:[{what:'人物',queryEn:'wrong other shot'}]}]}));
 assert.equal(englishQuery(cfg,'test',photo),'Alice speaking at event'); assert.equal(englishQuery(cfg,'test',video),'Alice interview 1990');
 const img={id:'img',source:'library',file:'/x/a.jpg',asset:'/x/a.jpg',url:'https://example.test/a',title:'Alice',rights:'cc'};
 const vid={id:'vid',source:'youtube',url:'https://example.test/v',title:'Alice',rights:'cc',duration:30};
 const write=(n,c)=>{fs.writeFileSync(path.join(dir,'needs.json'),JSON.stringify({needs:[n]}));fs.writeFileSync(path.join(dir,'candidates.json'),JSON.stringify({shots:{[n.shotId]:{need:n,candidates:c}}}));};
 write(photo,[vid]); assert.equal(rankNeed(cfg,'test',photo),null,'photo must not select video');
 write(video,[img]); assert.equal(rankNeed(cfg,'test',video),null,'video must not select image');
 write(photo,[img]); assert.equal(rankNeed(cfg,'test',photo)?.ranked[0].id,'img');
 write(video,[vid]); assert.equal(rankNeed(cfg,'test',video)?.ranked[0].id,'vid');
} finally {fs.rmSync(root,{recursive:true,force:true});}
console.log('explicit person media queries and selection verified');

// Exercise actual acquisition, with real bytes and deliberately misleading extensions.
const crypto = await import('node:crypto');
const {spawnSync}=await import('node:child_process');
const root2=fs.mkdtempSync(path.join(process.env.TMPDIR,'media-fetch-'));
try {
 const library=path.join(root2,'library'), dataDir=path.join(root2,'data'), bin=path.join(root2,'bin');
 fs.mkdirSync(library,{recursive:true}); fs.mkdirSync(bin);
 fs.writeFileSync(path.join(bin,'swift'),'#!/bin/sh\nprintf "[]"\n',{mode:0o755});
 process.env.PATH=bin+':'+process.env.PATH; process.env.A1_MATERIAL_LIBRARY=library;
 globalThis.fetch=async()=>{throw Error('network forbidden')};
 // The module was already imported above; use a distinct module instance to bind the scratch library.
 const M=await import('../apps/studio-next/src/lib/recipe-board/materials.mjs?fetch-fixture');
 const cfg={dataDir,sourceRoot:root2,repoRoot:root2}, id='fixture', dir=path.join(dataDir,'projects',id,'materials');
 fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dataDir,'projects',id,'project.json'),JSON.stringify({id}));
 const image=path.join(root2,'image.png'), videoFile=path.join(root2,'video.mp4');
 for(const args of [ ['-f','lavfi','-i','color=red:s=64x64','-frames:v','1',image], ['-f','lavfi','-i','color=blue:s=64x64:r=5:d=1','-c:v','libx264','-pix_fmt','yuv420p',videoFile] ]) { const r=spawnSync('ffmpeg',['-v','error','-y',...args],{encoding:'utf8'}); assert.equal(r.status,0,r.stderr); }
 const wrongVideo=path.join(root2,'video.jpg'),wrongImage=path.join(root2,'image.mp4'),unknown=path.join(root2,'bad.png');
 fs.copyFileSync(videoFile,wrongVideo); fs.copyFileSync(image,wrongImage); fs.writeFileSync(unknown,'not media');
 const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const write=(n,v)=>fs.writeFileSync(path.join(dir,n),JSON.stringify(v,null,2));
 const run=async(form,file,shot='B01')=>{
   const need={shotId:shot,form,original:'same'}; const oldFile=path.join(dir,`old-${shot}.png`); fs.writeFileSync(oldFile,'old bytes');
   const old={kind:'image',file:oldFile,needPrint:M.needPrint(need),approval:'keep'};
   write('needs.json',{needs:[need]}); write('bindings.json',{shots:{[shot]:old}});
   const batch={id:'batch',approvedAt:'old',confirmedBy:'user',items:[{shotId:shot,status:'approved',source:'library',file,url:'https://example.invalid/'+shot,title:'fixture',publisher:'fixture',rights:'unknown',rightsLabel:'unknown'}]};
   write('approvals.json',{batches:[batch]}); const approvalBefore=JSON.parse(fs.readFileSync(path.join(dir,'approvals.json')));
   const oldHash=hash(oldFile), approvalHash=hash(path.join(dir,'approvals.json')), bindingHash=hash(path.join(dir,'bindings.json')), needsHash=hash(path.join(dir,'needs.json')); const result=await M.fetchApproved(cfg,id);
   return {result,old,oldFile,oldHash,approvalBefore,approvalHash,bindingHash,needsHash};
 };
 for(const [form,file] of [['photo',wrongVideo],['video',wrongImage],['photo',unknown],['video',unknown]]) {
   const x=await run(form,file); assert.deepEqual(x.result.shots.B01,x.old,`${form} rejects ${file}`);
   assert.equal(hash(x.oldFile),x.oldHash); assert.equal(hash(path.join(dir,'approvals.json')),x.approvalHash); assert.equal(hash(path.join(dir,'bindings.json')),x.bindingHash); assert.equal(hash(path.join(dir,'needs.json')),x.needsHash); assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'approvals.json'))),x.approvalBefore);
 }
 for(const [form,file,kind] of [['photo',image,'image'],['video',videoFile,'video']]) { const x=await run(form,file); assert.equal(x.result.shots.B01.kind,kind); assert.notEqual(x.result.shots.B01.file,x.oldFile); assert.equal(hash(x.oldFile),x.oldHash); }
} finally {fs.rmSync(root2,{recursive:true,force:true});}
