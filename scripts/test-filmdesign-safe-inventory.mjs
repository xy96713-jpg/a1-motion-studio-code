import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { filmDesignTask } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
const root=fs.mkdtempSync(path.join(os.homedir(),'.hermes/cache/scratch/inventory-'));
try {
 const repo=path.resolve(import.meta.dirname,'..'), project=path.join(root,'projects','fixture'), dir=path.join(project,'materials'), clips=path.join(dir,'clips');
 fs.mkdirSync(clips,{recursive:true}); fs.symlinkSync(path.join(repo,'work/recipe-board-v1/routing'),path.join(root,'routing'));
 const put=(p,v)=>fs.writeFileSync(p,JSON.stringify(v));
 const projectFile=path.join(project,'project.json'); put(projectFile,{id:'fixture',gateSet:'design',design:{approved:true,by:'user'}}); const before=fs.readFileSync(projectFile,'utf8');
 const png=path.join(clips,'valid.png'); fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xsAAAAASUVORK5CYII=','base64'));
 const sharp=(await import('../apps/studio-next/node_modules/sharp/lib/index.js')).default;
 const jpeg=path.join(clips,'valid.jpg'), webp=path.join(clips,'valid.webp');
 const pixels={create:{width:3,height:2,channels:3,background:'#ff0000'}};
 await sharp(pixels).jpeg().toFile(jpeg); await sharp(pixels).webp().toFile(webp);
 const brokenJ=path.join(clips,'broken.jpg'), brokenW=path.join(clips,'broken.webp');
 fs.writeFileSync(brokenJ,fs.readFileSync(jpeg).subarray(0,-2)); fs.writeFileSync(brokenW,fs.readFileSync(webp).subarray(0,-2));
 const bigJ=path.join(clips,'big.jpg'), bigW=path.join(clips,'big.webp');
 const jb=fs.readFileSync(jpeg), sof=jb.indexOf(Buffer.from([0xff,0xc0])); assert.ok(sof>0); jb.writeUInt16BE(32769,sof+7); fs.writeFileSync(bigJ,jb);
 const wb=await sharp(pixels).webp({lossless:true}).toBuffer(), vp=wb.indexOf(Buffer.from('VP8L')); assert.ok(vp>0); wb.writeUInt32LE(0x0fffffff,vp+9); fs.writeFileSync(bigW,wb);
 const fifo=path.join(clips,'fifo.png'); assert.equal(spawnSync('mkfifo',[fifo]).status,0);
 put(path.join(dir,'quality.json'),{B01:{quality:'verified'}});
 const invalid=path.join(clips,'invalid.png'); fs.writeFileSync(invalid,'not an image');
 const huge=path.join(clips,'huge.png'); fs.writeFileSync(huge,Buffer.alloc(16*1024*1024+1));
 const fake=path.join(clips,'fake.png'); fs.writeFileSync(fake,fs.readFileSync(png).subarray(0,24));
 const link=path.join(clips,'link.png'); fs.symlinkSync('/dev/zero',link);
 const outside=path.join(root,'outside.png'); fs.copyFileSync(png,outside);
 put(path.join(dir,'bindings.json'),{shots:{B12:{file:brokenJ,kind:'image'},B13:{file:brokenW,kind:'image'},B14:{file:bigJ,kind:'image'},B15:{file:bigW,kind:'image'},B10:{file:jpeg,kind:'image'},B11:{file:webp,kind:'image'},B01:{file:png,kind:'image',needPrint:JSON.stringify(['news','photo','old image','test',0])},B02:{file:fifo,kind:'image'},B03:{file:outside,kind:'image'},B04:{file:link,kind:'image'},B05:{file:path.join(clips,'missing.png'),kind:'image'},B06:{file:fake,kind:'image'},B07:{file:png,kind:'video'},B08:{file:invalid,kind:'image'},B09:{file:huge,kind:'image'}}});
 const cfg={dataDir:root,repoRoot:repo,sourceRoot:repo}; const input=filmDesignTask(cfg,'fixture',Array.from({length:5},(_,i)=>({beat:`B0${i+1}`,dur:1}))).input;
 for (const [beat, format] of [['B10','jpeg'],['B11','webp']]) {
   assert.equal(input.materials[beat][0].metadata.format,format);
   assert.equal(input.materials[beat][0].metadata.width,3);
   assert.equal(input.materials[beat][0].decoded,false);
   assert.equal(input.materials[beat][0].qualityStatus,'unknown'); assert.equal(input.materials[beat][0].provenanceStatus,'unknown');
 }
 assert.equal(input.materials.B01[0].file,png); assert.equal(input.materials.B01[0].what,'old image'); assert.equal(input.materials.B01[0].quality,null); assert.equal(input.materials.B01[0].kind,'image'); assert.ok(Object.hasOwn(input.materials.B01[0],'q'));
 assert.deepEqual(input.materials.B01[0].metadata,{bytes:fs.statSync(png).size,width:1,height:1,format:'png'});
 for(const b of ['B02','B03','B04','B05','B06','B07','B08','B09','B12','B13','B14','B15']) { assert.equal(input.materials[b],undefined,b); assert.equal(input.materialDiagnostics[b][0].status,'unknown',b); }
 assert.equal(input.materials.B01[0].qualityStatus,'unknown'); assert.equal(input.materials.B01[0].decoded,false);
 const many=Object.fromEntries(Array.from({length:1001},(_,i)=>[`K${i}`,{file:png,kind:'image'}]));
 put(path.join(dir,'bindings.json'),{shots:many}); const capped=filmDesignTask(cfg,'fixture',[]).input; assert.equal(capped.materialInventoryTruncated,true); assert.equal(Object.values(capped.materials).flat().length,1000); assert.equal(capped.materialQualityStatus,'unknown');
 const bindings=path.join(dir,'bindings.json'); fs.unlinkSync(bindings); fs.symlinkSync('/dev/zero',bindings);
 const unavailable=filmDesignTask(cfg,'fixture',[]).input; assert.equal(unavailable.materialInventoryStatus,'unknown'); assert.match(unavailable.materialProgressNote,/not evidence of no assets/);
 assert.equal(fs.readFileSync(projectFile,'utf8'),before); console.log('PASS safe inventory task');
} finally {fs.rmSync(root,{recursive:true,force:true});}
