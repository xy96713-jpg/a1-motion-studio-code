import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{execFileSync}from'node:child_process';import sharp from'../apps/studio-next/node_modules/sharp/lib/index.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-photo-mask-')),verify=path.resolve('scripts/verify-native-source-photo-mask-v1.mjs'),source=path.join(dir,'source.png'),mask=path.join(dir,'mask.png'),output=path.join(dir,'output.png');
try{
 const rgb=Buffer.from(Array.from({length:6*4*4},(_,i)=>i%4===3?255:(i*17)%256)),matte=Buffer.from(Array.from({length:24},(_,i)=>[0,64,128,255][i%4]));
 await sharp(rgb,{raw:{width:6,height:4,channels:4}}).png().toFile(source);await sharp(matte,{raw:{width:6,height:4,channels:1}}).png().toFile(mask);
 const rgba=Buffer.from(rgb);for(let i=0;i<matte.length;i++)rgba[i*4+3]=matte[i];await sharp(rgba,{raw:{width:6,height:4,channels:4}}).png().toFile(output);
 assert.match(execFileSync(process.execPath,[verify,source,mask,output],{encoding:'utf8'}),/SOURCE_RGB_AND_ALPHA_MASK_VERIFIED/);
 rgba[4]^=8;await sharp(rgba,{raw:{width:6,height:4,channels:4}}).png().toFile(output);assert.throws(()=>execFileSync(process.execPath,[verify,source,mask,output],{stdio:'pipe'}));
 const luma=await sharp(source).removeAlpha().greyscale().raw().toBuffer(),gray=Buffer.from(rgb);
 for(let i=0;i<matte.length;i++){for(let c=0;c<3;c++)gray[i*4+c]=luma[i];gray[i*4+3]=matte[i];}
 await sharp(gray,{raw:{width:6,height:4,channels:4}}).png().toFile(output);
 assert.match(execFileSync(process.execPath,[verify,source,mask,output,'--grayscale'],{encoding:'utf8'}),/SOURCE_GRAYSCALE_AND_ALPHA_MASK_VERIFIED/);
 assert.throws(()=>execFileSync(process.execPath,[verify,source,mask,output],{stdio:'pipe'}),'grayscale requires its explicitly declared treatment');
 gray[7]^=1;await sharp(gray,{raw:{width:6,height:4,channels:4}}).png().toFile(output);
 assert.throws(()=>execFileSync(process.execPath,[verify,source,mask,output,'--grayscale'],{stdio:'pipe'}),'altered alpha rejects even for grayscale');
 assert.throws(()=>execFileSync(process.execPath,[verify,source,mask,output,'--arbitrary'],{stdio:'pipe'}));
 console.log('PASS original RGB or explicitly declared deterministic grayscale plus mask; changed pixels, altered alpha and unknown treatments reject. No identity generation or provider.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
