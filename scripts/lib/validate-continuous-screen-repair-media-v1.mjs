import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {motionReviewHash,assertMotionReviewBinding} from '../../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs';

// Executed inside the existing candidate lock, before any persistence.
export function validateContinuousRepairMedia({root,shot,record,loadBound,sha,video,media}) {
  const fail=reason=>{throw Error('continuous-repair-'+reason);};
  const scope=shot.motionReviewPlan.productionBaseline.repairScope;
  const previous=loadBound(scope.previousVideo);
  if (scope.previousVideo.sha256!==shot.motionReviewReceipt?.video?.sha256) fail('previous-selection-stale');
  const manifest=JSON.parse(loadBound(record.renderManifest).bytes),rendered=manifest.items?.find(i=>i.shotId===shot.shotId);
  if (manifest.contract!=='A1ContinuousScreenIntegrationReview/v1'||manifest.productionAdmission!==false||manifest.sourceSha256!==scope.sourceSha256||manifest.gapFrames!==0||manifest.items.length!==1||rendered?.video.sha256!==record.renderedVideo.sha256||rendered.video.path!==record.renderedVideo.path) fail('manifest-stale');
  assertMotionReviewBinding(shot,rendered);
  if (!manifest.rendererFiles?.length || manifest.rendererFiles.some(p=>! /^(remotion-renderer\/src|scripts|apps\/studio-next\/src\/lib)\//.test(p)||p.includes('..')) || motionReviewHash(manifest.rendererFiles.map(p=>[p,sha(fs.readFileSync(path.resolve(root,p)))]))!==manifest.rendererSha256) fail('renderer-changed');
  const read=p=>JSON.parse(fs.readFileSync(path.resolve(root,p)));
  const input=read(path.join(path.dirname(record.renderManifest.path),'input.json'));
  if(motionReviewHash(input)!==manifest.inputIdentity || input.rendererSha256!==manifest.rendererSha256 || input.config.productionBaselineSha256ByShot?.[shot.shotId]!==record.productionBaselineSha256)fail('render-input-stale');
  const props=JSON.parse(loadBound({path:input.config.directionPropsPath,sha256:input.directionSha256}).bytes);
  loadBound({path:input.config.sourceReportPath,sha256:input.reportSha256});loadBound({path:input.config.directionProofPath,sha256:input.directionProofSha256});
  const originalInput=read(path.join(path.dirname(scope.previousVideo.path),'input.json'));
  const oldProps=JSON.parse(loadBound({path:originalInput.config.directionPropsPath,sha256:originalInput.directionSha256}).bytes);
  const samples=props.scenes?.[0]?.screenDirection?.samples,old=oldProps.scenes?.[0]?.screenDirection?.samples;
  const count=Math.round(shot.timeRange.durationMs*.06);
  if(video.nb_frames!==String(count)||samples?.length!==count||old?.length!==count)fail('frame-count');
  const sceneWithoutCamera=p=>{const c=structuredClone(p);delete c.scenes[0].screenDirection.grammar;for(const s of c.scenes[0].screenDirection.samples)delete s.camera;return c;};
  if(motionReviewHash(sceneWithoutCamera(props))!==motionReviewHash(sceneWithoutCamera(oldProps)))fail('non-camera-edit');
  const from=old[scope.startFrame].camera,to=old[scope.settleFrame].camera;
  for(let f=0;f<count;f++){
    const t=Math.max(0,Math.min(1,(f-scope.startFrame)/(scope.settleFrame-scope.startFrame))),u=t*t*t*(10+t*(-15+6*t));
    for(const k of ['x','y','scale'])if(Math.abs(samples[f].camera[k]-(from[k]+(to[k]-from[k])*u))>1e-10)fail('camera-curve-or-hold');
  }
  const pixels=file=>execFileSync('ffmpeg',['-v','error','-i',file,'-vf','scale=320:180,format=gray','-fps_mode','passthrough','-f','rawvideo','-'],{maxBuffer:32*1024*1024});
  const actual=pixels(media.file),prior=pixels(previous.file),size=320*180;
  if(actual.length!==count*size||prior.length!==actual.length)fail('decoded-frame-count');
  const mean=(a,ai,b,bi)=>{let sum=0;for(let j=0;j<size;j++)sum+=Math.abs(a[ai*size+j]-b[bi*size+j]);return sum/size;};
  const delta=Array.from({length:count-1},(_,i)=>mean(actual,i+1,actual,i));
  const holdParity=Array.from({length:count-scope.settleFrame},(_,i)=>mean(actual,i+scope.settleFrame,prior,i+scope.settleFrame));
  const maximumHoldParity=Math.max(...holdParity),maximumTransitionDelta=Math.max(...delta.slice(scope.startFrame,scope.settleFrame));
  // Dense moving text can have high MAE on every frame. Compare the same
  // source's former cut, and require a quiet landing rather than a universal
  // low-MAE threshold that mistakes legitimate continuous motion for a cut.
  const originalCutDelta=mean(prior,scope.settleFrame,prior,scope.settleFrame-1);
  if(maximumHoldParity>3||maximumTransitionDelta>=originalCutDelta||delta[scope.settleFrame-1]>1)fail('actual-pixel-discontinuity');
  const audioPackets=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-show_entries','packet=pts_time,dts_time,duration_time,data_hash','-of','json',file],{encoding:'utf8'})).packets;
  const ap=audioPackets(media.file),up=audioPackets(loadBound(record.narrationSource).file);
  if(!ap.length||JSON.stringify(ap)!==JSON.stringify(up))fail('original-audio-payload-or-clock-mismatch');
  return {status:'INTERNAL_VISUAL_REVIEW_REQUIRED',sourceSha256:scope.sourceSha256,renderInputIdentity:manifest.inputIdentity,frameCount:count,startFrame:scope.startFrame,settleFrame:scope.settleFrame,holdFrames:scope.holdFrames,settledHoldMs:scope.holdFrames/60*1000,cameraHoldExact:true,maximumHoldParity,maximumTransitionDelta,adjacentFrameMAE:delta,holdFrameParityMAE:holdParity,audioPacketCount:ap.length,audioPayloadAndPtsDtsDurationMatch:true,sourcePlaybackRate:1};
}
