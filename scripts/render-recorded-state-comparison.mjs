import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),dir=path.resolve(root,process.argv[2]);
const capture=JSON.parse(fs.readFileSync(path.join(dir,'capture-report.json'),'utf8'));
const pair=['before-edit','after-edit'].map(name=>capture.events.find(e=>e.name===name&&e.type==='snapshot'));
if(pair.some(e=>!e)||pair[0].tMs>=pair[1].tMs||pair[0].text===pair[1].text)throw new Error('REAL_DISTINCT_STATE_PAIR_REQUIRED');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const out=path.join(dir,'comparison'),pub=path.join(out,'public');fs.mkdirSync(pub,{recursive:true});
pair.forEach((event,i)=>{const source=path.join(root,event.path);if(hash(source)!==event.sha256)throw new Error('STATE_SOURCE_SHA_MISMATCH');fs.copyFileSync(source,path.join(pub,`${i}.png`));});
const rendererRoot=path.join(root,'remotion-renderer'),require=createRequire(path.join(rendererRoot,'package.json'));
const {bundle}=require('@remotion/bundler'),{openBrowser,selectComposition,renderMedia,renderStill}=require('@remotion/renderer');
const props={contract:'A1RealSourcePackagingWave2/v1',width:1280,height:720,fps:30,sceneFrames:180,reviewLabels:false,scenes:[{id:'real-wipe',effects:['WIPE_COMPARE'],beforeUri:'0.png',afterUri:'1.png',sourceSha256:capture.output.sha256}]};
const serveUrl=await bundle({entryPoint:path.join(rendererRoot,'src/RecordedComparisonEntry.tsx'),publicDir:pub,rootDir:rendererRoot,enableCaching:true});
const browser=await openBrowser('chrome',{logLevel:'error'});
try{
  const composition=await selectComposition({serveUrl,id:'A1RealSourcePackagingWave2V1',inputProps:props,puppeteerInstance:browser,logLevel:'error'});
  await renderMedia({serveUrl,composition,inputProps:props,outputLocation:path.join(out,'review.mp4'),codec:'h264',crf:18,concurrency:2,muted:true,puppeteerInstance:browser,logLevel:'error'});
  for(const frame of [0,24,179])await renderStill({serveUrl,composition,inputProps:props,frame,output:path.join(out,`frame-${frame}.png`),puppeteerInstance:browser,logLevel:'error'});
}finally{await browser.close({silent:true});}
execFileSync(path.join(root,'.tools/bin/ffmpeg'),['-v','error','-i',path.join(out,'review.mp4'),'-f','null','-']);
const result={status:'READY_FOR_PIXEL_REVIEW',effect:'WIPE_COMPARE',adapter:'EXISTING_RealSourcePackagingWave2V1',sourceCaptureSha256:capture.output.sha256,states:pair.map(e=>({timeMs:e.tMs,path:e.path,sha256:e.sha256,text:e.text})),video:{path:path.relative(root,path.join(out,'review.mp4')),sha256:hash(path.join(out,'review.mp4'))},fullDecode:true,productionAdmission:false};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
