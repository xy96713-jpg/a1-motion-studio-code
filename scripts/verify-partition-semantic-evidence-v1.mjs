import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {runSingleShotPartitionDryRun} from '../apps/studio-next/src/lib/a1-single-shot-partition-server-v1.mjs';
import {partitionSha as sha} from '../apps/studio-next/src/lib/a1-single-shot-partition-dry-run-v1.mjs';
const base='work/ed17-approved-version-recovery/';
const wp='apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json';
const map=JSON.parse(fs.readFileSync(base+'layer-reuse-map.json'));
const design=JSON.parse(fs.readFileSync(base+'handoff-design.json'));
const paths=[wp,'.codex-artifacts/system-progress-system-line/current-phase.json','.codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json',base+'layer-reuse-map.json',base+'handoff-design.json',base+'partition-closeout-http-1789183281116.json',base+'partition-entry-evidence.json',map.sourceDifference.current.path,map.approvedMotion.path,...map.layers.filter(l=>l.path).map(l=>l.path),...design.frames.map(f=>base+f.raw)];
const snapshot=()=>Object.fromEntries(paths.map(p=>[p,sha(fs.readFileSync(p))]));
const before=snapshot();
assert.equal(before[map.approvedMotion.path],map.approvedMotion.sha256);
assert.equal(design.video.sha256,map.approvedMotion.sha256);
assert.equal(design.source.artifactSha256,map.source.artifactSha256);
const w=JSON.parse(fs.readFileSync(wp));
const dryRun=await runSingleShotPartitionDryRun(process.cwd(),{action:'dry-run-package-layer-partition',shotId:'ED-17',workspaceSha256:w.workspaceSha256});
const run=(cmd,args,maxBuffer=256*1024*1024)=>{const r=spawnSync(cmd,args,{maxBuffer});if(r.error)throw r.error;assert.equal(r.status,0,r.stderr.toString());return r.stdout;};
const pts=JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',map.approvedMotion.path])).frames.map(f=>Number(f.best_effort_timestamp_time)*1000);
// Decode existing original to memory only, using the historical evidence's exact scale.
const raw=run('ffmpeg',['-v','error','-i',map.approvedMotion.path,'-vf','scale=960:540','-pix_fmt','rgb24','-f','rawvideo','-']);
const frameBytes=960*540*3;
assert.equal(raw.length,pts.length*frameBytes);
const frames=[];
for(const f of design.frames){
 const file=base+f.raw;assert.equal(before[file],f.rawSha256);assert.equal(pts[f.frame],f.ptsMs);
 const pixels=await sharp(fs.readFileSync(file)).removeAlpha().raw().toBuffer();
 assert.deepEqual(pixels,raw.subarray(f.frame*frameBytes,(f.frame+1)*frameBytes));
 frames.push({frame:f.frame,ptsMs:pts[f.frame],path:file,sha256:before[file],decodedPixelsEqualOriginal:true});
}
const after=snapshot();assert.deepEqual(after,before);
const report={contract:'A1PartitionSemanticEvidence/v1',executedAt:new Date().toISOString(),dryRun,originalVideo:{...map.approvedMotion,decodedFrameCount:pts.length},existingTrueFrames:frames,priorDesignEvidence:{path:base+'handoff-design.json',sha256:before[base+'handoff-design.json'],status:'EXISTING_HISTORICAL_DIAGNOSTIC_NOT_NEW_SEMANTIC_REVIEW',occlusionDesign:design.occlusionDesign,contractConflict:design.contractConflict},questions:['在真帧 29/53/67 中，材料输入、角度选择与蓝色信号是否应作为各主体不可拆的动作组成，而不是独立静态覆盖？请指出像素区域。','标题 alpha 只代表历史字形；在 0/29/53/67/98/120 真帧中，字形覆盖会不会遮住需要保留的运动/蓝信号？请指出帧与字/对象，不再询问是否认可原运动。','2,776 input/selector 和 4,140 selector/output 重叠像素应归哪个对象？六个 residual 岛是否属于空白/阴影或应随主体移动？现有真值定义不能自动裁决。'],semanticStatus:'UNKNOWN',authorityFilesUnchanged:true,before,after,productionLayerFilesWritten:0,newVideoRendered:false};
const output=base+`partition-semantic-evidence-${Date.now()}.json`;
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PASS_EVIDENCE_INTEGRITY_NOT_SEMANTIC_PASS',output,framesVerified:frames.length,originalFramesDecoded:pts.length,semanticStatus:'UNKNOWN',authorityFilesUnchanged:true}));
