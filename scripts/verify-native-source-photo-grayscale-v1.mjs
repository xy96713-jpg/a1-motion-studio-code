import fs from 'node:fs';
import sharp from '../apps/studio-next/node_modules/sharp/lib/index.js';
const [source,output]=process.argv.slice(2);
if(!source||!output)throw Error('NATIVE_PHOTO_GRAYSCALE_ARGUMENTS');
const original=await sharp(fs.readFileSync(source),{limitInputPixels:24000000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const expected=await sharp(fs.readFileSync(source),{limitInputPixels:24000000}).greyscale().raw().toBuffer({resolveWithObject:true});
const actual=await sharp(fs.readFileSync(output),{limitInputPixels:24000000}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
if(expected.info.width!==actual.info.width||expected.info.height!==actual.info.height||actual.info.channels!==4||original.info.channels!==4)throw Error('NATIVE_PHOTO_GRAYSCALE_GEOMETRY_CHANGED');
for(let pixel=0;pixel<expected.info.width*expected.info.height;pixel++){
 const gray=expected.data[pixel*expected.info.channels],offset=pixel*4;
 if(actual.data[offset]!==gray||actual.data[offset+1]!==gray||actual.data[offset+2]!==gray||actual.data[offset+3]!==original.data[offset+3])throw Error('NATIVE_PHOTO_GRAYSCALE_PIXELS_CHANGED');
}
process.stdout.write('SOURCE_GRAYSCALE_PIXELS_VERIFIED');
