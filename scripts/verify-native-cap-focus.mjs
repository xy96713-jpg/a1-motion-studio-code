import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.resolve(root, process.argv[2]);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const receipt = read(path.join(dir, 'cap-receipt.json'));
const config = read(path.join(root, receipt.capProject.path, 'project-config.json'));
const mask = config.timeline.maskSegments[0];
if (!mask) throw new Error('MASK_REQUIRED');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const width=1280,height=720;
const frame = (file,t) => execFileSync(path.join(root,'.tools/bin/ffmpeg'),['-v','error','-ss',String(t),'-i',path.join(root,file),'-vf',`scale=${width}:${height}`,'-frames:v','1','-f','image2pipe','-vcodec','png','-']);
const rows=[];const pictures=[];
for (const [phase,t] of [['before',mask.start-.5],['during',(mask.start+mask.end)/2],['after',mask.end+.6]]) {
  const source=frame(receipt.sourceVideo.path,t),output=frame(receipt.reviewVideo.path,t);
  const a=await sharp(source).removeAlpha().raw().toBuffer(),b=await sharp(output).removeAlpha().raw().toBuffer();
  let insideError=0,insideN=0,outA=0,outB=0,outN=0;
  const left=(mask.center.x-mask.size.x/2)*width,right=(mask.center.x+mask.size.x/2)*width,top=(mask.center.y-mask.size.y/2)*height,bottom=(mask.center.y+mask.size.y/2)*height;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*3;const l=(a[i]+a[i+1]+a[i+2])/3,r=(b[i]+b[i+1]+b[i+2])/3;
    if(x>left+8&&x<right-8&&y>top+8&&y<bottom-8){insideError+=Math.abs(l-r);insideN++;}
    else if(x<left-24||x>right+24||y<top-24||y>bottom+24){outA+=l;outB+=r;outN++;}
  }
  const ratio=outB/Math.max(1,outA),mae=insideError/Math.max(1,insideN);
  const pass=insideN>0&&outN>0&&mae<8&&(phase==='during'?ratio<.6:ratio>.9&&ratio<1.1);
  rows.push({phase,timeSeconds:t,insideMeanAbsoluteError:mae,outsideLuminanceRatio:ratio,status:pass?'PASS':'FAIL'});
  pictures.push(source,output);
}
const contact=path.join(dir,'focus-original-processed.png');
await sharp({create:{width:1280,height:1080,channels:3,background:'#111'}}).composite(await Promise.all(pictures.map(async(p,i)=>({input:await sharp(p).resize(640,360).toBuffer(),left:i%2*640,top:Math.floor(i/2)*360})))).png().toFile(contact);
const result={status:rows.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'FOCUS_PIXEL_BEHAVIOR_ONLY',sourceSha256:hash(path.join(root,receipt.sourceVideo.path)),outputSha256:hash(path.join(root,receipt.reviewVideo.path)),rows,contactSheet:path.relative(root,contact),visualMaturity:'NOT_ESTABLISHED'};
fs.writeFileSync(path.join(dir,'focus-pixel-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));if(result.status==='FAIL')process.exitCode=1;
