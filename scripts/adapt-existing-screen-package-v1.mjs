import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {compilePackagedScreenReuse} from '../apps/studio-next/src/lib/a1-packaged-screen-reuse-v1.mjs';
import {motionReviewHash,motionReviewSource} from '../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';
import {readProjectWorkspace,withProjectLock,persistProjectState} from '../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs';
import {auditContinuousSourceFrameClock} from '../apps/studio-next/src/lib/a1-continuous-screen-source-mapping-v1.mjs';

export async function adaptExistingScreenPackages({root,workspace,shotIds}){
 if(!shotIds?.length||new Set(shotIds).size!==shotIds.length)throw new Error('explicit-unique-shot-list-required');
 const read=p=>JSON.parse(fs.readFileSync(path.resolve(root,p))),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,p))).digest('hex');
 const probe=p=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path.resolve(root,p)],{encoding:'utf8'}));
 const appRoot=path.join(root,'apps/studio-next'),results=[],plans=[],binaries={},jsonFiles={};
 const rendererFiles=['scripts/adapt-existing-screen-package-v1.mjs','apps/studio-next/src/lib/a1-packaged-screen-reuse-v1.mjs'];
 const rendererSha256=motionReviewHash(rendererFiles.map(p=>[p,hash(p)]));
 for(const id of shotIds){
  const shot=workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find(s=>s.shotId===id);if(!shot)throw new Error('package-reuse-shot-missing');
  const selected=shot.motionReviewPlan.productionBaseline,inputPath=selected?.primaryCandidate?.path;
  if(!inputPath||!path.resolve(root,inputPath).startsWith(path.join(root,'work')+path.sep))throw new Error('package-reuse-local-work-source-required');
  const meta=probe(inputPath),v=meta.streams.find(s=>s.codec_type==='video'),[n,d]=v.avg_frame_rate.split('/').map(Number);
  let fps=n/d,durationMs=Number(v.duration)*1000,sourceFrameClock=null;
  if(Math.abs(fps-60)>.01&&Math.abs(durationMs-shot.timeRange.durationMs)<=80){
    const frames=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',path.resolve(root,inputPath)],{encoding:'utf8'})).frames;
    const [tn,td]=v.time_base.split('/').map(Number);
    try{sourceFrameClock=auditContinuousSourceFrameClock({timestamps:frames.map(f=>Number(f.best_effort_timestamp_time)),fps:60,timeBaseSeconds:tn/td});if(frames.length!==Number(v.nb_frames))throw new Error('source-frame-count-mismatch');fps=60;durationMs=frames.length/60*1000;}catch{sourceFrameClock={status:'FRAME_CLOCK_REVIEW_REQUIRED'};}
  }
  const adaptation=compilePackagedScreenReuse(shot,{sha256:hash(inputPath),width:v.width,height:v.height,durationMs,frameCount:Number(v.nb_frames),fps,hasAudio:meta.streams.some(s=>s.codec_type==='audio')});
  if(adaptation.status!=='READY_FOR_FORMAT_ADAPTATION'){results.push(adaptation);console.log(JSON.stringify(adaptation));continue;}
  const cap=read(selected.capProject.sourceReceiptPath);
  if(hash(selected.capProject.sourceReceiptPath)!==selected.capProject.sourceReceiptSha256||cap.sourceStoryboardVersionId!==shot.versionId||cap.narrationBinding?.sourceText?.replace(/\s/gu,'')!==shot.sourceText.replace(/\s/gu,''))throw new Error('package-reuse-cap-narration-binding-invalid');
  const identity=motionReviewHash({source:motionReviewSource(shot),adaptation,rendererSha256}),dir=path.join(root,'work/screen-production-integration-v1',`package-reuse-${identity.slice(0,16)}`),local=p=>path.relative(root,path.join(dir,p));
  fs.mkdirSync(dir,{recursive:true});const manifestPath=path.join(dir,'manifest.json');let manifest;
  if(fs.existsSync(manifestPath)){manifest=read(manifestPath);for(const x of [manifest.video,manifest.narrated,manifest.upstreamPackage,manifest.upstreamCapReceipt])if(hash(x.path)!==x.sha256)throw new Error('package-reuse-cache-corrupt');}
  else {
   const source=path.join(dir,'input-package.mp4');fs.copyFileSync(path.resolve(root,inputPath),source);if(hash(source)!==adaptation.inputSha256)throw new Error('package-reuse-source-mutated-during-copy');
   fs.copyFileSync(path.resolve(root,selected.capProject.sourceReceiptPath),path.join(dir,'source-cap-receipt.json'));
   const narrated=path.join(dir,'narrated.mp4'),silent=path.join(dir,'review.mp4');
   execFileSync('ffmpeg',['-v','error','-y','-i',source,'-map','0:v:0','-map','0:a:0','-vf',adaptation.filter,'-c:v','libx264','-preset','veryfast','-crf','18','-threads','2','-fps_mode','passthrough','-video_track_timescale','15360','-c:a','copy','-movflags','+faststart',narrated],{stdio:'pipe'});
   execFileSync('ffmpeg',['-v','error','-y','-i',narrated,'-map','0:v:0','-c:v','copy','-an','-movflags','+faststart',silent],{stdio:'pipe'});
   const output=probe(silent),ov=output.streams.find(s=>s.codec_type==='video');
   if(ov.width!==960||ov.height!==540||ov.avg_frame_rate!=='60/1'||Number(ov.nb_frames)!==adaptation.expectedFrameCount||Math.abs(Number(ov.duration)*1000-shot.timeRange.durationMs)>80)throw new Error('package-reuse-output-timing-or-canvas-invalid');
   execFileSync('ffmpeg',['-v','error','-i',narrated,'-f','null','-'],{stdio:'pipe'});
   const audioHash=p=>execFileSync('ffmpeg',['-v','error','-i',p,'-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','-'],{encoding:'utf8'}).trim();
   const inputAudioHash=audioHash(source);if(audioHash(narrated)!==inputAudioHash)throw new Error('package-reuse-narration-packets-changed');
   manifest={contract:'A1PackagedScreenReuse/v1',status:'ADAPTED_PENDING_VIEWING',shotId:id,identity,source:motionReviewSource(shot),productionBaselineSha256:adaptation.selectionSha256,adaptation,rendererFiles,rendererSha256,upstreamPackage:{path:local('input-package.mp4'),originalPath:inputPath,sha256:hash(source)},upstreamCapReceipt:{path:local('source-cap-receipt.json'),originalPath:selected.capProject.sourceReceiptPath,sha256:hash(path.join(dir,'source-cap-receipt.json'))},video:{path:local('review.mp4'),sha256:hash(silent),width:960,height:540,fps:60,durationMs:Number(ov.duration)*1000},narrated:{path:local('narrated.mp4'),sha256:hash(narrated)},audioPacketHash:inputAudioHash,productionAdmission:false};
   manifest.sourceFrameClock=sourceFrameClock;
   fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  }
  const prefix=`shot-motion-review-v1/${identity}`,publicUrl=`/generated/system-line/editorial-asset-workbench-v1/${prefix}/${id}.mp4`;
  const receipt={contract:'A1ShotMotionReviewReceipt/v1',kind:'PACKAGED_SCREEN_REUSE',shotId:id,source:manifest.source,rendererFiles,rendererSha256,status:'PENDING_INTERNAL_VIEWING_REVIEW',usageMode:'INTERNAL_REVIEW_CANARY_ONLY',productionAdmission:false,userVisualApproval:'NOT_APPROVED',productionBaselineSha256:manifest.productionBaselineSha256,upstreamPackage:manifest.upstreamPackage,upstreamCapReceipt:manifest.upstreamCapReceipt,adaptation:manifest.adaptation,video:{...manifest.video,publicUrl},validation:{decoded:true,sourceBytesVerified:true,packagingRetained:true,currentStoryboardTiming:true,narrationPacketsPreserved:true}};
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  plans.push({...shot.motionReviewPlan,reason:'复用已有 Cap 包装，仅适配审看画幅；原有动效、完整帧序列和音轨已保留，待原速观看检查。',viewerReview:{status:'PENDING_ADAPTED_PACKAGE_REVIEW',candidateBaselineSha256:manifest.productionBaselineSha256,candidateVideoSha256:manifest.video.sha256,candidateVideoPublicUrl:publicUrl,candidateReceiptPath:local('receipt.json'),candidateReceiptSha256:hash(path.join(dir,'receipt.json')),narratedPreviewUrl:`/generated/system-line/editorial-asset-workbench-v1/${prefix}/narrated.mp4`}});
  binaries[`${prefix}/${id}.mp4`]=fs.readFileSync(path.resolve(root,manifest.video.path));binaries[`${prefix}/narrated.mp4`]=fs.readFileSync(path.resolve(root,manifest.narrated.path));jsonFiles[`${prefix}/package-reuse-manifest.json`]=manifest;
  results.push({shotId:id,status:manifest.status,manifestPath:local('manifest.json')});console.log(JSON.stringify(results.at(-1)));
 }
 if(plans.length){
  await withProjectLock(appRoot,async()=>{const current=readProjectWorkspace(appRoot);if(current.workspaceSha256!==workspace.workspaceSha256)throw new Error('package-reuse-workspace-changed');persistProjectState(appRoot,current,{expectedWorkspaceSha256:current.workspaceSha256,files:jsonFiles,binaryFiles:binaries});});
  const file=path.join(root,'work/screen-production-integration-v1/unified-production-v1/adapted-plan.json');fs.writeFileSync(file,JSON.stringify({contract:'A1ShotMotionReviewPlanSet/v1',userDirective:{quote:'继续吧',scope:'Adapt selected existing Cap packages without changing motion, narration or action speed; stage pending reviews only'},shots:plans},null,2));
  console.log(execFileSync(process.execPath,[path.join(root,'scripts/reconcile-shot-motion-review-v1.mjs'),'plan',file,readProjectWorkspace(appRoot).workspaceSha256],{encoding:'utf8'}));
 }
 fs.writeFileSync(path.join(root,'work/screen-production-integration-v1/unified-production-v1/adaptation-results.json'),JSON.stringify({contract:'A1PackageReuseBatch/v1',results,productionAdmission:false},null,2));
}
