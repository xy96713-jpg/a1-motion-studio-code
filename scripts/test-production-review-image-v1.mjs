import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import sharp from 'sharp';
import {prepareProductionReviewImageV1,verifyProductionReviewImageV1} from '../apps/studio-next/src/lib/a1-production-review-image-v1.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'review-alpha-')),sha=b=>createHash('sha256').update(b).digest('hex');
try {
 for(const [name,color,matte] of [['black-type','#050505','#e6e6e6'],['white-overlay','#fafafa','#202020'],['paper-label','#dedede','#202020']]){
  const raw=Buffer.alloc(24*12*4);const rgb=parseInt(color.slice(1),16);
  for(let y=3;y<9;y++)for(let x=4;x<19;x++){const i=(y*24+x)*4;raw[i]=(rgb>>16)&255;raw[i+1]=(rgb>>8)&255;raw[i+2]=rgb&255;raw[i+3]=255;}
  const bytes=await sharp(raw,{raw:{width:24,height:12,channels:4}}).png().toBuffer(),file=path.join(root,name+'.png');fs.writeFileSync(file,bytes);const original=fs.readFileSync(file);
  const args={artifactPath:file,artifactSha256:sha(bytes),reviewScope:'PACKAGING_CORE',outputDirectory:path.join(root,'display')};
  const view=await prepareProductionReviewImageV1(args);assert.equal(view.displayProjection.matte,matte);assert.equal(view.displayProjection.resize,false);assert.deepEqual(fs.readFileSync(file),original);
  const projected=await sharp(view.path).ensureAlpha().raw().toBuffer();
  for(let y=3;y<9;y++)for(let x=4;x<19;x++){const i=(y*24+x)*4;assert.deepEqual(projected.subarray(i,i+4),raw.subarray(i,i+4),'opaque foreground pixels are exact');}
  assert.equal(await verifyProductionReviewImageV1({...args,reviewImagePath:view.path,displayProjection:view.displayProjection}),true);
  const again=await prepareProductionReviewImageV1(args);assert.equal(again.path,view.path);
  await assert.rejects(verifyProductionReviewImageV1({...args,reviewImagePath:view.path,displayProjection:{...view.displayProjection,matte:'#ffffff'}}),/DERIVATION_CHANGED/);
  assert.equal((await prepareProductionReviewImageV1({...args,reviewScope:'WHOLE_FRAME'})).path,fs.realpathSync(file),'whole-frame assets are not matted');
 }
 const opaque=await sharp({create:{width:12,height:8,channels:3,background:'#777777'}}).png().toBuffer(),file=path.join(root,'opaque.png');fs.writeFileSync(file,opaque);
 assert.equal((await prepareProductionReviewImageV1({artifactPath:file,artifactSha256:sha(opaque),reviewScope:'PACKAGING_CORE',outputDirectory:root})).displayProjection,null);
 await assert.rejects(prepareProductionReviewImageV1({artifactPath:file,artifactSha256:'0'.repeat(64),reviewScope:'PACKAGING_CORE',outputDirectory:root}),/SOURCE_CHANGED/);
 console.log('PASS alpha display for dark type, light overlays and paper labels; exact opaque pixels, unchanged source bytes, no resize or production admission, cached preview and rejected provenance drift.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
