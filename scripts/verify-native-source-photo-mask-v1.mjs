import fs from 'node:fs';
import sharp from '../apps/studio-next/node_modules/sharp/lib/index.js';
const [source,mask,output,treatment]=process.argv.slice(2);
if(!source||!mask||!output)throw Error('NATIVE_PHOTO_MASK_ARGUMENTS');
if(treatment!==undefined&&treatment!=='--grayscale')throw Error('NATIVE_PHOTO_MASK_TREATMENT');
const original=await sharp(fs.readFileSync(source),{limitInputPixels:24000000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
if(treatment==='--grayscale'){
 const gray=await sharp(fs.readFileSync(source),{limitInputPixels:24000000}).removeAlpha().greyscale().raw().toBuffer();
 if(gray.length!==original.info.width*original.info.height)throw Error('NATIVE_PHOTO_MASK_GRAYSCALE_GEOMETRY');
 for(let i=0;i<gray.length;i++)for(let c=0;c<3;c++)original.data[i*4+c]=gray[i];
}
const matte=await sharp(fs.readFileSync(mask),{limitInputPixels:24000000}).extractChannel(0).raw().toBuffer({resolveWithObject:true});
const actual=await sharp(fs.readFileSync(output),{limitInputPixels:24000000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
if(original.info.width!==actual.info.width||original.info.height!==actual.info.height||matte.info.width!==actual.info.width||matte.info.height!==actual.info.height
  ||original.info.channels!==4||actual.info.channels!==4||matte.info.channels!==1)throw Error('NATIVE_PHOTO_MASK_GEOMETRY_CHANGED');
for(let pixel=0;pixel<matte.data.length;pixel++){
 const offset=pixel*4,alpha=Math.round(original.data[offset+3]*matte.data[pixel]/255);
 if(actual.data[offset+3]!==alpha||alpha>0&&[0,1,2].some(channel=>actual.data[offset+channel]!==original.data[offset+channel]))throw Error('NATIVE_PHOTO_MASK_SOURCE_RGB_CHANGED');
}
process.stdout.write(treatment==='--grayscale'?'SOURCE_GRAYSCALE_AND_ALPHA_MASK_VERIFIED':'SOURCE_RGB_AND_ALPHA_MASK_VERIFIED');
